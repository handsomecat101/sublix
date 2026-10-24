#!/usr/bin/env python3
"""Sublix — ZeroTTS offline TTS sidecar (ONNX Runtime; CPU hoặc CUDA).

Model: zeroweight-ai/ZeroTTS (MIT) — tiếng Việt native, 48 kHz, 8 giọng có sẵn. Model nằm trong
--model-dir với đúng bố cục repo HF (config.json, onnx/*, onnx/codec/*, voices/*, ...); không chạm mạng.

    python zerotts_tts.py --model-dir DIR --batch manifest.json [--device auto|cpu|cuda]
        manifest = [{"text": "...", "voice": "maichi", "out": "C:/tmp/a.wav"}, ...]
        mỗi câu 1 dòng:  OK <index> <out_path> <num_samples>  |  ERR <index> <lỗi 1 dòng>
        mã thoát 0 khi nạp được model; 3 = không nạp được model.
    python zerotts_tts.py --model-dir DIR --list-voices    -> JSON [{"name","gender","description"}]
    python zerotts_tts.py --model-dir DIR --diagnose       -> JSON provider onnxruntime

pip: zerotts (--no-deps) + numpy onnxruntime tokenizers huggingface_hub soundfile scipy sounddevice
     (CUDA: thay onnxruntime bằng onnxruntime-gpu).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")
os.environ.setdefault("HF_HUB_OFFLINE", "1")


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def pick_providers(device: str) -> list[str]:
    import onnxruntime as ort

    avail = ort.get_available_providers()
    if device in ("auto", "cuda") and "CUDAExecutionProvider" in avail:
        try:
            ort.preload_dlls()
        except Exception as exc:
            log(f"WARN preload_dlls: {exc}")
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    if device == "cuda":
        log("WARN onnxruntime không có CUDAExecutionProvider — chạy CPU "
            "(pip uninstall onnxruntime && pip install onnxruntime-gpu)")
    return ["CPUExecutionProvider"]


def load_engine(model_dir: Path, device: str, threads: int):
    from zerotts import ZeroTTS

    provs = pick_providers(device)
    kw = {"intra_op_num_threads": threads} if threads > 0 else {}
    try:
        tts = ZeroTTS.from_pretrained(model_dir, local_files_only=True, providers=provs, **kw)
    except Exception as exc:
        if provs[0] == "CUDAExecutionProvider":
            log(f"WARN CUDA không dùng được ({exc}) — hạ xuống CPU")
            provs = ["CPUExecutionProvider"]
            tts = ZeroTTS.from_pretrained(model_dir, local_files_only=True, providers=provs, **kw)
        else:
            raise
    print("DEVICE " + ("cuda" if provs[0] == "CUDAExecutionProvider" else "cpu"), flush=True)
    return tts


def voice_meta(model_dir: Path) -> dict:
    meta = {}
    root = model_dir / "voices"
    if root.is_dir():
        for d in sorted(p for p in root.iterdir() if p.is_dir()):
            try:
                meta[d.name] = json.loads((d / "meta.json").read_text(encoding="utf-8"))
            except Exception:
                meta[d.name] = {}
    return meta


def run_batch(args) -> int:
    model_dir = Path(args.model_dir)
    items = json.loads(Path(args.batch).read_text(encoding="utf-8"))
    t0 = time.perf_counter()
    try:
        tts = load_engine(model_dir, args.device, args.threads)
    except Exception as exc:
        log(f"FATAL không nạp được ZeroTTS: {exc!r}")
        return 3
    log(f"loaded {time.perf_counter() - t0:.1f}s ({len(items)} câu)")
    import soundfile as sf

    for i, it in enumerate(items):
        text = (it.get("text") or "").strip()
        out = Path(it["out"])
        try:
            if not text:
                raise ValueError("câu rỗng")
            out.parent.mkdir(parents=True, exist_ok=True)
            t1 = time.perf_counter()
            audio = tts.synthesize(text, voice=(it.get("voice") or "maichi"))
            tts.save_audio(audio, str(out))
            n = int(sf.info(str(out)).frames)
            if n < 480:
                raise RuntimeError("audio rỗng")
            log(f"  [{i}] {time.perf_counter() - t1:.2f}s {n / tts.sample_rate:.2f}s audio")
            print(f"OK {i} {out} {n}", flush=True)
        except Exception as exc:
            msg = " ".join(str(exc).split())[:300] or exc.__class__.__name__
            print(f"ERR {i} {msg}", flush=True)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--batch")
    ap.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--list-voices", action="store_true")
    ap.add_argument("--diagnose", action="store_true")
    args = ap.parse_args()
    if args.diagnose:
        import onnxruntime as ort

        info = {"onnxruntime": ort.__version__, "providers": ort.get_available_providers(),
                "cuda": "CUDAExecutionProvider" in ort.get_available_providers()}
        try:
            import importlib.metadata as md

            info["zerotts"] = md.version("zerotts")
        except Exception:
            info["zerotts"] = None
        print(json.dumps(info, ensure_ascii=False))
        return 0
    if args.list_voices:
        meta = voice_meta(Path(args.model_dir))
        print(json.dumps([{"name": k, "gender": v.get("gender", ""), "description": v.get("description", v.get("display_name", ""))}
                          for k, v in meta.items()], ensure_ascii=False))
        return 0
    if args.batch:
        return run_batch(args)
    ap.error("cần --batch, --list-voices hoặc --diagnose")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
