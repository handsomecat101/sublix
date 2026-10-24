#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sherpa_asr.py — Offline speech recognition sidecar for Sublix (sherpa-onnx).

Two modes:

1. ``--extract <archive.tar.bz2> <dest_dir>``
   Unpack a downloaded model archive (sherpa-onnx releases ship ``.tar.bz2``).

2. ``--transcribe --model-dir <dir> --family <family> --wav <wav> --out <json>``
   Recognise a 16 kHz mono WAV and write a JSON result.

The JSON result always contains ``segments`` so the caller can build a normal
Sublix SRT.  Engines that expose token timestamps get real word/segment
timings; engines without timestamps fall back to sentence splitting with time
distributed proportionally (flagged with ``"timestamps": "synthetic"``).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

SAMPLE_RATE = 16000

# Sentence terminators used by the synthetic-timestamp fallback.
_SENT_SPLIT = re.compile(r"(?<=[。！？!?；;…])|(?<=[.!?])\s+")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def ensure_16k_mono_wav(wav_path: str) -> tuple[str, bool]:
    """Return a 16 kHz mono WAV path (converted through FFmpeg if needed)."""
    try:
        import wave

        with wave.open(wav_path, "rb") as wf:
            if wf.getnchannels() == 1 and wf.getframerate() == SAMPLE_RATE:
                return wav_path, False
    except Exception:
        pass

    import tempfile

    fd, tmp_path = tempfile.mkstemp(suffix="_16k.wav", prefix="sublix_asr_")
    os.close(fd)

    ffmpeg_bin = os.environ.get("FFMPEG_PATH", "ffmpeg")
    cmd = [
        ffmpeg_bin, "-y", "-i", wav_path, "-vn", "-ar", str(SAMPLE_RATE),
        "-ac", "1", "-c:a", "pcm_s16le", tmp_path,
    ]
    creation_flags = 0x08000000 if sys.platform == "win32" else 0
    try:
        subprocess.run(
            cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=creation_flags,
        )
    except Exception as exc:  # noqa: BLE001
        alt = shutil.which("ffmpeg") or str(
            Path(__file__).resolve().parent.parent / "binaries" / "ffmpeg.exe"
        )
        if alt and os.path.exists(alt):
            cmd[0] = alt
            subprocess.run(
                cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=creation_flags,
            )
        else:
            raise RuntimeError(f"FFmpeg conversion failed: {exc}") from exc
    return tmp_path, True


def peak_rss_mb() -> float:
    """Peak working set in MB (Windows) — best effort."""
    try:
        import ctypes
        import ctypes.wintypes as wt

        class PMC(ctypes.Structure):
            _fields_ = [
                ("cb", wt.DWORD),
                ("PageFaultCount", wt.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]

        fn = ctypes.windll.psapi.GetProcessMemoryInfo
        fn.argtypes = [ctypes.c_void_p, ctypes.POINTER(PMC), wt.DWORD]
        fn.restype = wt.BOOL
        counter = PMC()
        counter.cb = ctypes.sizeof(PMC)
        handle = ctypes.c_void_p(ctypes.windll.kernel32.GetCurrentProcess())
        if fn(handle, ctypes.byref(counter), counter.cb):
            return counter.PeakWorkingSetSize / 1048576.0
    except Exception:
        pass
    try:
        import resource

        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0
    except Exception:
        return 0.0


def _pick(model_dir: Path, *names: str) -> str:
    for name in names:
        candidate = model_dir / name
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError(
        f"Không tìm thấy {' / '.join(names)} trong {model_dir}"
    )


def build_recognizer(family: str, model_dir: Path, threads: int, provider: str, lang: str):
    import sherpa_onnx

    tokens = str(model_dir / "tokens.txt")
    common = dict(
        num_threads=threads,
        sample_rate=SAMPLE_RATE,
        decoding_method="greedy_search",
        debug=False,
        provider=provider,
    )

    if family == "sensevoice":
        return sherpa_onnx.OfflineRecognizer.from_sense_voice(
            tokens=tokens,
            model=_pick(model_dir, "model.int8.onnx", "model.onnx"),
            use_itn=True,
            language=lang,
            **common,
        )
    if family == "paraformer":
        return sherpa_onnx.OfflineRecognizer.from_paraformer(
            tokens=tokens,
            paraformer=_pick(model_dir, "model.int8.onnx", "model.onnx"),
            **common,
        )
    if family == "parakeet":
        return sherpa_onnx.OfflineRecognizer.from_transducer(
            tokens=tokens,
            encoder=_pick(model_dir, "encoder.int8.onnx", "encoder.onnx"),
            decoder=_pick(model_dir, "decoder.int8.onnx", "decoder.onnx"),
            joiner=_pick(model_dir, "joiner.int8.onnx", "joiner.onnx"),
            feature_dim=128,
            **common,
        )
    if family == "canary":
        return sherpa_onnx.OfflineRecognizer.from_nemo_canary(
            tokens=tokens,
            encoder=_pick(model_dir, "encoder.int8.onnx", "encoder.onnx"),
            decoder=_pick(model_dir, "decoder.int8.onnx", "decoder.onnx"),
            src_lang=lang if lang not in ("auto", "") else "en",
            tgt_lang="en",
            feature_dim=128,
            **common,
        )
    raise SystemExit(f"Family không hỗ trợ: {family}")


def group_segments(tokens, timestamps, max_dur=8.0, max_gap=0.6, max_chars=70):
    """Group token-level timestamps into sentence-like segments."""
    segments = []
    cur_text = ""
    cur_start = None
    cur_end = None
    prev_end = None
    for text, start in zip(tokens, timestamps):
        if not text:
            continue
        start = float(start)
        gap = (start - prev_end) if prev_end is not None else 0.0
        too_long = cur_start is not None and (start - cur_start) > max_dur
        too_many = cur_start is not None and len(cur_text) + len(text) > max_chars
        if cur_start is not None and (gap > max_gap or too_long or too_many):
            segments.append({"start": round(cur_start, 3), "end": round(cur_end, 3),
                             "text": cur_text.strip()})
            cur_text = ""
            cur_start = None
        if cur_start is None:
            cur_start = start
        cur_text += text
        cur_end = start
        prev_end = start
    if cur_start is not None and cur_text.strip():
        segments.append({"start": round(cur_start, 3), "end": round(cur_end, 3),
                         "text": cur_text.strip()})
    return [s for s in segments if s["text"]]


def synthetic_segments(text: str, audio_secs: float):
    """Split text into sentences and distribute the duration proportionally."""
    text = (text or "").strip()
    if not text:
        return []
    pieces = [p.strip() for p in _SENT_SPLIT.split(text) if p and p.strip()]
    if not pieces:
        pieces = [text]
    total_chars = sum(len(p) for p in pieces) or 1
    segments = []
    cursor = 0.0
    for piece in pieces:
        share = audio_secs * (len(piece) / total_chars)
        segments.append({
            "start": round(cursor, 3),
            "end": round(min(audio_secs, cursor + share), 3),
            "text": piece,
        })
        cursor += share
    return segments


# ---------------------------------------------------------------------------
# modes
# ---------------------------------------------------------------------------


def do_extract(archive: str, dest: str) -> int:
    dest_path = Path(dest)
    dest_path.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:bz2") as tf:
        members = []
        for member in tf.getmembers():
            base = os.path.basename(member.name)
            if not base:
                continue
            # Flatten: every member lands directly in the destination folder.
            member.name = base
            members.append(member)
        tf.extractall(dest_path, members=members)
    files = sorted(p.name for p in dest_path.iterdir() if p.is_file())
    print(json.dumps({"ok": True, "files": files}, ensure_ascii=False))
    return 0


def do_transcribe(args) -> int:
    import numpy as np
    import soundfile as sf

    model_dir = Path(args.model_dir)
    actual_wav, is_temp = ensure_16k_mono_wav(args.wav)
    try:
        samples, sr = sf.read(actual_wav, dtype="float32", always_2d=False)
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        if sr != SAMPLE_RATE:
            raise RuntimeError(f"Sample rate {sr} Hz không hỗ trợ")
        samples = np.ascontiguousarray(samples, dtype=np.float32)
        audio_secs = len(samples) / SAMPLE_RATE

        t0 = time.perf_counter()
        recognizer = build_recognizer(args.family, model_dir, args.threads,
                                      args.provider, args.lang)
        load_secs = time.perf_counter() - t0

        t1 = time.perf_counter()
        stream = recognizer.create_stream()
        stream.accept_waveform(SAMPLE_RATE, samples)
        recognizer.decode_stream(stream)
        decode_secs = time.perf_counter() - t1

        result = stream.result
        text = (getattr(result, "text", "") or "").strip()

        tokens = list(getattr(result, "tokens", None) or [])
        timestamps = list(getattr(result, "timestamps", None) or [])
        if tokens and len(tokens) == len(timestamps):
            segments = group_segments(tokens, timestamps)
            timestamp_mode = "word"
        else:
            segments = synthetic_segments(text, audio_secs)
            timestamp_mode = "synthetic"

        payload = {
            "ok": True,
            "family": args.family,
            "text": text,
            "language": getattr(result, "lang", "") or args.lang,
            "segments": segments,
            "timestamps": timestamp_mode,
            # Timestamp từ (text, start, end) — dùng để đo độ lệch thời gian.
            "tokens": [
                {"text": str(t), "start": float(s), "end": float(e)}
                for t, s, e in zip(tokens, timestamps, timestamps[1:] + [timestamps[-1] + 0.12]
                                    if timestamps else [])
            ] if (tokens and len(tokens) == len(timestamps)) else [],
            "audio_secs": round(audio_secs, 3),
            "load_secs": round(load_secs, 3),
            "decode_secs": round(decode_secs, 3),
            "rtf": round(decode_secs / audio_secs, 4) if audio_secs else 0.0,
            "rss_peak_mb": round(peak_rss_mb(), 1),
            "provider": args.provider,
        }
    finally:
        if is_temp and os.path.exists(actual_wav):
            try:
                os.remove(actual_wav)
            except OSError:
                pass

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in payload.items() if k != "segments"},
                     ensure_ascii=False))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sublix sherpa-onnx ASR sidecar")
    parser.add_argument("--extract", metavar="ARCHIVE")
    parser.add_argument("--dest", default="")
    parser.add_argument("--transcribe", action="store_true")
    parser.add_argument("--model-dir", default="")
    parser.add_argument("--family", default="")
    parser.add_argument("--wav", default="")
    parser.add_argument("--out", default="")
    parser.add_argument("--lang", default="auto")
    parser.add_argument("--provider", default="cpu")
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()

    try:
        if args.extract:
            return do_extract(args.extract, args.dest)
        if args.transcribe:
            return do_transcribe(args)
        parser.error("Cần --extract hoặc --transcribe")
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
