#!/usr/bin/env python3
"""Sublix — VieNeu-TTS v3 Turbo offline TTS sidecar (ONNX; CPU hoặc CUDA).

Model: pnnbao-ump/VieNeu-TTS-v3-Turbo (Apache-2.0) — 48 kHz, 25 giọng có sẵn, clone zero-shot 3–8 s.
Toàn bộ file model nằm trong --model-dir (do app tải về), KHÔNG chạm mạng khi tổng hợp:
    <model-dir>/onnx_update/*        backbone fp32 (+ config.json, tokenizer.json)
    <model-dir>/speaker_encoder.onnx, denoiser.onnx   (clone giọng)
    <model-dir>/codec/*              MOSS-Audio-Tokenizer-Nano-ONNX (codec giải mã/mã hoá)

Cách dùng:
    python vieneu_tts.py --model-dir DIR --batch manifest.json [--device auto|cpu|cuda]
        manifest = [{"text": "...", "voice": "Hải Đăng", "out": "C:/tmp/a.wav", "ref_audio": null}, ...]
        In MỖI câu 1 dòng:  OK <index> <out_path> <num_samples>   |   ERR <index> <lỗi 1 dòng>
        Mã thoát 0 khi model nạp được (lỗi từng câu nằm ở dòng ERR); khác 0 = không nạp được model.
    python vieneu_tts.py --model-dir DIR --list-voices     -> JSON [{"name","gender","description"}]
    python vieneu_tts.py --model-dir DIR --diagnose        -> JSON (provider onnxruntime, CUDA…)

Thiết bị: auto = CUDA nếu onnxruntime-gpu có CUDAExecutionProvider, ngược lại CPU; cuda = ép CUDA
(không có thì tự hạ CPU + cảnh báo); cpu = luôn CPU.

pip (CPU):  vieneu (--no-deps) + sea-g2p onnxruntime numpy soundfile soxr kaldi-native-fbank tokenizers
            huggingface_hub PyYAML librosa
pip (CUDA): thay `onnxruntime` bằng `onnxruntime-gpu` (+ CUDA 12 / cuDNN 9; xem docs trong handoff).
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
os.environ.setdefault("HF_HUB_OFFLINE", "1")  # mọi file đã nằm cục bộ — không gọi mạng

ONNX_SUBDIR = "onnx_update"


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def providers_info() -> dict:
    import onnxruntime as ort

    avail = ort.get_available_providers()
    return {"onnxruntime": ort.__version__, "providers": avail, "cuda": "CUDAExecutionProvider" in avail}


def patch_ort_for_cuda() -> bool:
    """Ép mọi InferenceSession của engine dùng CUDA (engine hard-code CPUExecutionProvider)."""
    import onnxruntime as ort

    if "CUDAExecutionProvider" not in ort.get_available_providers():
        return False
    try:
        ort.preload_dlls()  # nạp cudnn/cublas từ gói pip nvidia-* (onnxruntime-gpu >= 1.19)
    except Exception as exc:  # không có hàm / thiếu DLL — vẫn thử tạo session
        log(f"WARN preload_dlls: {exc}")
    base = ort.InferenceSession

    class CudaSession(base):  # type: ignore[misc, valid-type]
        def __init__(self, path, sess_options=None, providers=None, **kw):
            super().__init__(path, sess_options, providers=["CUDAExecutionProvider", "CPUExecutionProvider"], **kw)

    CudaSession._sublix_base = base  # type: ignore[attr-defined]
    ort.InferenceSession = CudaSession  # type: ignore[misc]
    return True


def unpatch_ort() -> None:
    import onnxruntime as ort

    base = getattr(ort.InferenceSession, "_sublix_base", None)
    if base is not None:
        ort.InferenceSession = base  # type: ignore[misc]


def point_codec_to_local(model_dir: Path) -> None:
    """Engine tự tải codec từ HF Hub; trỏ nó về thư mục codec/ đã tải sẵn (offline 100%)."""
    from vieneu._v3_turbo_engine import onnx_runtime_lite as orl

    codec_dir = model_dir / "codec"
    orig = orl.OnnxV3LiteEngine._fetch

    def local_fetch(repo, files, subfolder):
        if repo == orl._CODEC_REPO and codec_dir.is_dir():
            return codec_dir
        return orig(repo, files, subfolder)

    orl.OnnxV3LiteEngine._fetch = staticmethod(local_fetch)


def load_engine(model_dir: Path, device: str, threads: int):
    from vieneu import Vieneu

    point_codec_to_local(model_dir)

    def build():
        return Vieneu(
            mode="v3turbo",
            backend="onnx",
            device="cpu",
            backbone_repo=str(model_dir),
            onnx_dir=str(model_dir / ONNX_SUBDIR),
            onnx_subfolder=ONNX_SUBDIR,
            threads=threads,
        )

    used = "cpu"
    if device in ("auto", "cuda"):
        if patch_ort_for_cuda():
            try:
                tts = build()
                print("DEVICE cuda", flush=True)
                return tts
            except Exception as exc:
                log(f"WARN CUDA không dùng được ({exc}) — hạ xuống CPU")
                unpatch_ort()
        elif device == "cuda":
            log("WARN onnxruntime không có CUDAExecutionProvider — chạy CPU "
                "(pip uninstall onnxruntime && pip install onnxruntime-gpu)")
    tts = build()
    print(f"DEVICE {used}", flush=True)
    return tts


def wav_samples(path: Path) -> int:
    import soundfile as sf

    return int(sf.info(str(path)).frames)


def run_batch(args) -> int:
    model_dir = Path(args.model_dir)
    items = json.loads(Path(args.batch).read_text(encoding="utf-8"))
    t0 = time.perf_counter()
    try:
        tts = load_engine(model_dir, args.device, args.threads)
    except Exception as exc:
        log(f"FATAL không nạp được VieNeu: {exc!r}")
        return 3
    log(f"loaded {time.perf_counter() - t0:.1f}s ({len(items)} câu)")
    for i, it in enumerate(items):
        text = (it.get("text") or "").strip()
        out = Path(it["out"])
        try:
            if not text:
                raise ValueError("câu rỗng")
            out.parent.mkdir(parents=True, exist_ok=True)
            t1 = time.perf_counter()
            ref = it.get("ref_audio") or None
            wav = tts.infer(text, voice=(it.get("voice") or None) if not ref else None, ref_audio=ref)
            tts.save(wav, str(out))
            n = wav_samples(out)
            if n < 480:
                raise RuntimeError("audio rỗng")
            log(f"  [{i}] {time.perf_counter() - t1:.2f}s {n / 48000:.2f}s audio")
            print(f"OK {i} {out} {n}", flush=True)
        except Exception as exc:  # 1 câu lỗi không làm hỏng cả lô
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
        info = providers_info()
        try:
            import importlib.metadata as md

            info["vieneu"] = md.version("vieneu")
        except Exception:
            info["vieneu"] = None
        print(json.dumps(info, ensure_ascii=False))
        return 0
    if args.list_voices:
        tts = load_engine(Path(args.model_dir), "cpu", args.threads)
        voices = []
        for label, name in tts.list_preset_voices():
            meta = tts._preset_voices.get(name, {})
            voices.append({"name": name, "label": label, "gender": meta.get("gender", ""), "description": meta.get("description", "")})
        print(json.dumps(voices, ensure_ascii=False))
        return 0
    if args.batch:
        return run_batch(args)
    ap.error("cần --batch, --list-voices hoặc --diagnose")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
