#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
speaker_gender.py — Ước lượng F0 (pitch) trung vị cho TỪNG CỤM người nói.

Mục đích: phân vai "thật" — giới tính lấy từ SÓNG ÂM (tần số cơ bản) chứ không
đoán theo thứ tự câu. Sidecar này chạy SAU `sherpa_diarize.py`:

    sherpa_diarize.py  →  các đoạn {start, end, speaker}   (cụm theo âm sắc)
    speaker_gender.py  →  F0 trung vị của từng cụm         (nam / nữ)

Input:
    --wav       WAV 16 kHz mono (tạo bởi pipeline)
    --segments  JSON: [{"start": 0.0, "end": 3.4, "speaker": 0}, ...]
    --out       file JSON kết quả

Output:
    {"speakers": {"0": {"f0_median": 123.4, "voiced_ratio": 0.42,
                        "duration_sec": 12.3, "frames": 512}, ...}}

Chỉ dùng numpy (đã có sẵn trong env sherpa) + thư viện chuẩn `wave`.
"""

import argparse
import json
import os
import sys
import wave

import numpy as np

# --- Tham số đo F0 (chọn theo giọng nói người, không theo giọng chim) ---
SAMPLE_RATE = 16000
F0_MIN_HZ = 60.0          # giọng nam thấp nhất ~70 Hz → chừa biên
F0_MAX_HZ = 400.0         # giọng nữ cao nhất ~300 Hz → chừa biên
FRAME_LEN = 640           # 40 ms
HOP_LEN = 160             # 10 ms
MIN_RMS = 0.008           # bỏ khung gần như im lặng
VOICED_PEAK = 0.30        # ngưỡng tương quan đỉnh để coi là "có nối"
CHUNK_FRAMES = 2048       # xử lý theo lô để không ngốn RAM


def load_wav_mono16(path: str) -> np.ndarray:
    """Đọc WAV mono 16-bit → float32 trong [-1, 1]."""
    with wave.open(path, "rb") as wf:
        n_ch = wf.getnchannels()
        width = wf.getsampwidth()
        rate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())
    if width != 2:
        raise ValueError(f"Chỉ hỗ trợ WAV 16-bit, nhận {width * 8}-bit")
    data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if n_ch > 1:
        # Trộn về mono.
        usable = (data.size // n_ch) * n_ch
        data = data[:usable].reshape(-1, n_ch).mean(axis=1)
    if rate != SAMPLE_RATE:
        raise ValueError(f"Cần WAV {SAMPLE_RATE} Hz, nhận {rate} Hz")
    return data


def estimate_f0_chunk(frames: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """Ước lượng F0 từng khung.

    Trả về `(f0_hz, voiced)` — mỗi mảng dài bằng số khung.
    """
    n_frames = frames.shape[0]
    if n_frames == 0:
        return np.empty(0), np.empty(0, dtype=bool)

    window = np.hanning(FRAME_LEN).astype(np.float32)
    # Bỏ DC + cửa sổ Hann để tự tương quan không bị nhiễu điện áp lệch.
    sig = frames - frames.mean(axis=1, keepdims=True)
    sig = sig * window

    nfft = 1 << int(np.ceil(np.log2(2 * FRAME_LEN)))
    spectrum = np.fft.rfft(sig, n=nfft, axis=1)
    ac = np.fft.irfft(spectrum * np.conj(spectrum), n=nfft, axis=1)[:, :FRAME_LEN]

    energy0 = ac[:, :1].copy()
    energy0[energy0 <= 0] = 1e-12
    ac = ac / energy0

    min_lag = max(2, int(sr / F0_MAX_HZ))
    max_lag = min(FRAME_LEN - 2, int(sr / F0_MIN_HZ))
    if max_lag <= min_lag:
        return np.empty(0), np.empty(0, dtype=bool)

    windowed = ac[:, min_lag : max_lag + 1]
    peak_rel = np.argmax(windowed, axis=1)
    peak_idx = peak_rel + min_lag
    peak_val = windowed[np.arange(n_frames), peak_rel]

    rows = np.arange(n_frames)
    y0 = ac[rows, np.maximum(peak_idx - 1, 0)]
    y1 = ac[rows, peak_idx]
    y2 = ac[rows, np.minimum(peak_idx + 1, FRAME_LEN - 1)]
    denom = (y0 - 2.0 * y1 + y2)
    denom = np.where(np.abs(denom) < 1e-12, 1e-12, denom)
    delta = 0.5 * (y0 - y2) / denom
    delta = np.clip(delta, -1.0, 1.0)

    lag = (peak_idx + delta).astype(np.float64)
    lag[lag <= 0] = 1.0
    f0 = sr / lag

    rms = np.sqrt(np.maximum((frames.astype(np.float64) ** 2).mean(axis=1), 0.0))
    voiced = (peak_val >= VOICED_PEAK) & (rms >= MIN_RMS)
    voiced &= (f0 >= F0_MIN_HZ) & (f0 <= F0_MAX_HZ)
    f0 = np.where(voiced, f0, 0.0)
    return f0, voiced


def f0_for_span(samples: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """Đo F0 cho một đoạn liên tục (đã cắt theo mốc thời gian)."""
    if samples.size < FRAME_LEN:
        return np.empty(0), np.empty(0, dtype=bool)
    n_frames = 1 + (samples.size - FRAME_LEN) // HOP_LEN
    all_f0: list[np.ndarray] = []
    all_voiced: list[np.ndarray] = []
    for start in range(0, n_frames, CHUNK_FRAMES):
        stop = min(start + CHUNK_FRAMES, n_frames)
        idx = np.arange(FRAME_LEN)[None, :] + HOP_LEN * np.arange(start, stop)[:, None]
        frames = samples[idx]
        f0, voiced = estimate_f0_chunk(frames, sr)
        all_f0.append(f0)
        all_voiced.append(voiced)
    if not all_f0:
        return np.empty(0), np.empty(0, dtype=bool)
    return np.concatenate(all_f0), np.concatenate(all_voiced)


def analyze(wav_path: str, segments: list[dict]) -> dict:
    samples = load_wav_mono16(wav_path)
    sr = SAMPLE_RATE

    per_speaker_f0: dict[int, list[np.ndarray]] = {}
    per_speaker_stats: dict[int, dict] = {}

    for seg in segments:
        try:
            start = float(seg.get("start", 0.0))
            end = float(seg.get("end", 0.0))
            speaker = int(seg.get("speaker", 0))
        except (TypeError, ValueError):
            continue
        if end <= start:
            continue
        i0 = max(0, int(round(start * sr)))
        i1 = min(samples.size, int(round(end * sr)))
        if i1 - i0 < FRAME_LEN:
            continue
        chunk = samples[i0:i1]
        f0, voiced = f0_for_span(chunk, sr)
        stat = per_speaker_stats.setdefault(
            speaker, {"duration_sec": 0.0, "frames": 0, "voiced": 0}
        )
        stat["duration_sec"] += (i1 - i0) / sr
        stat["frames"] += int(f0.size)
        stat["voiced"] += int(voiced.sum())
        if voiced.any():
            per_speaker_f0.setdefault(speaker, []).append(f0[voiced])

    out: dict[str, dict] = {}
    for speaker, stat in per_speaker_stats.items():
        values = per_speaker_f0.get(speaker, [])
        if values:
            merged = np.concatenate(values)
            f0_median = float(np.median(merged)) if merged.size else None
        else:
            merged = np.empty(0)
            f0_median = None
        voiced_ratio = (stat["voiced"] / stat["frames"]) if stat["frames"] else 0.0
        out[str(speaker)] = {
            "f0_median": None if f0_median is None else round(f0_median, 2),
            "voiced_ratio": round(float(voiced_ratio), 4),
            "duration_sec": round(float(stat["duration_sec"]), 3),
            "frames": int(stat["frames"]),
        }
    return {"speakers": out}


def main() -> None:
    # Console Windows mặc định cp1252 → ép UTF-8 + thay ký tự lạ (BUG-H02).
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001 — Python cũ không có reconfigure
        pass

    parser = argparse.ArgumentParser(description="Sublix speaker pitch (F0) sidecar")
    parser.add_argument("--wav", required=True, help="WAV 16 kHz mono")
    parser.add_argument("--segments", required=True, help="JSON danh sách đoạn (start/end/speaker)")
    parser.add_argument("--out", required=True, help="file JSON kết quả")
    args = parser.parse_args()

    try:
        with open(args.segments, "r", encoding="utf-8") as f:
            segments = json.load(f)
        if isinstance(segments, dict):
            segments = segments.get("segments", [])
        result = analyze(args.wav, segments or [])
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"SUCCESS: pitch measured for {len(result['speakers'])} speaker clusters")
        sys.exit(0)
    except Exception as e:  # noqa: BLE001 — sidecar báo lỗi ra stderr
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
