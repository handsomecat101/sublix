#!/usr/bin/env python3
"""Sublix — Kokoro-Vietnamese offline TTS sidecar.

Synthesizes Vietnamese speech from text using the ONNX export of the
Kokoro-Vietnamese model (repo: iamdinhthuan/Kokoro-Vietnamese,
artifacts: minhtanmtst/Kokoro-Vietnamese). 100% offline — no Edge-TTS.

Usage:
    python kokoro_vi_tts.py --text "Xin chào Việt Nam" --voice mai_linh --out out.wav
    python kokoro_vi_tts.py --text "..." --voice tuan_ngoc --out out.wav \
        --model-dir "H:/AI Project/sublix/src-tauri/models/voice/kokoro-vi" \
        --device cpu --speed 1.0

Model files expected inside --model-dir (default: ../models/voice/kokoro-vi
relative to this script):
    kokoro_vi.onnx             (~326 MB acoustic + vocoder model)
    config.json                (Kokoro vocab / plbert config)
    kokoro_vi_voicepack.pt     (default voice, tensor [max_phonemes, 1, 256])
    voicepacks/<voice_id>.pt   (per-voice packs, e.g. tuan_ngoc.pt, mai_linh.pt)

Pip dependencies (must be installed for the target `python`):
    onnxruntime, numpy, torch, vig2p
  (torch is only used to torch.load the .pt voice packs; onnxruntime runs the model;
   vig2p performs Vietnamese grapheme-to-phoneme matching the repo.)

This script intentionally avoids importing the `kokoro_vietnamese` package so
the pipeline only needs the 4 downloaded artifacts + the pip deps above.
"""

from __future__ import annotations

import argparse
import json
import sys
import wave
from pathlib import Path
from typing import Any

import numpy as np

SAMPLE_RATE = 24000
DEFAULT_CROSSFADE_MS = 50
DEFAULT_VOICE = "diem_trinh"


# --------------------------------------------------------------------------- #
# Text handling (ported from kokoro_vietnamese/core.py — same behaviour)
# --------------------------------------------------------------------------- #
def split_text(text: str) -> list[str]:
    import re

    normalized = re.sub(r"\s+", " ", text.strip())
    if not normalized:
        return []

    chunks: list[str] = []
    start = 0
    for match in re.finditer(r"[.!?…]+(?:[\"”’)]*)", normalized):
        end = match.end()
        if end < len(normalized) and not normalized[end].isspace():
            continue
        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end

    remainder = normalized[start:].strip()
    if remainder:
        chunks.append(remainder)
    return chunks


def merge_audio_chunks(chunks: list[np.ndarray], crossfade_samples: int) -> np.ndarray:
    valid = [np.asarray(c, dtype=np.float32) for c in chunks if len(c) > 0]
    if not valid:
        return np.array([], dtype=np.float32)

    merged = valid[0]
    for chunk in valid[1:]:
        overlap = min(int(crossfade_samples), len(merged), len(chunk))
        if overlap <= 0:
            merged = np.concatenate([merged, chunk])
            continue
        fade_out = np.linspace(1.0, 0.0, overlap + 2, dtype=np.float32)[1:-1]
        fade_in = 1.0 - fade_out
        crossfaded = (merged[-overlap:] * fade_out) + (chunk[:overlap] * fade_in)
        merged = np.concatenate([merged[:-overlap], crossfaded, chunk[overlap:]])
    return merged.astype(np.float32, copy=False)


# --------------------------------------------------------------------------- #
# ONNX helpers (ported from kokoro_vietnamese/onnx_utils.py)
# --------------------------------------------------------------------------- #
def load_config(config_path: Path) -> dict[str, Any]:
    with config_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def phonemes_to_input_ids(
    phonemes: str, vocab: dict[str, int], *, context_length: int = 512
) -> np.ndarray:
    input_ids = [vocab[p] for p in phonemes if p in vocab]
    if len(input_ids) + 2 > context_length:
        raise ValueError(
            f"Phoneme sequence too long: {len(input_ids) + 2} > {context_length}"
        )
    return np.asarray([[0, *input_ids, 0]], dtype=np.int64)


def select_voice_style(voicepack: Any, phoneme_count: int) -> np.ndarray:
    if phoneme_count <= 0:
        raise ValueError("phoneme_count must be positive")
    if hasattr(voicepack, "detach"):
        voicepack = voicepack.detach().cpu().numpy()
    voicepack = np.asarray(voicepack, dtype=np.float32)
    if voicepack.ndim != 3 or voicepack.shape[1:] != (1, 256):
        raise ValueError(
            "Expected voicepack shape [max_phonemes, 1, 256], "
            f"got {tuple(voicepack.shape)}"
        )
    index = min(phoneme_count, voicepack.shape[0]) - 1
    return np.asarray(voicepack[index], dtype=np.float32)


def speed_input(speed: float) -> np.ndarray:
    if speed <= 0:
        raise ValueError("speed must be greater than 0")
    return np.asarray(float(speed), dtype=np.float32)


def phonemize(text: str) -> str:
    from vig2p import phonemize_text

    return phonemize_text(text)


# --------------------------------------------------------------------------- #
# Model + WAV I/O
# --------------------------------------------------------------------------- #
def resolve_model_dir(override: str | None) -> Path:
    if override:
        return Path(override).expanduser().resolve()
    here = Path(__file__).resolve().parent
    return (here.parent / "models" / "voice" / "kokoro-vi").resolve()


def resolve_voicepack(model_dir: Path, voice: str) -> Path:
    per_voice = model_dir / "voicepacks" / f"{voice}.pt"
    if per_voice.exists():
        return per_voice
    default = model_dir / "kokoro_vi_voicepack.pt"
    if default.exists():
        return default
    raise FileNotFoundError(
        f"Không tìm thấy voicepack cho giọng '{voice}' trong {model_dir}"
    )


def write_wav(path: Path, audio: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
    audio = np.asarray(audio, dtype=np.float32)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1.0:
        audio = audio / peak
    pcm16 = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm16.tobytes())


def choose_providers(device: str) -> list[str]:
    import onnxruntime as ort

    available = ort.get_available_providers()
    if device == "cuda" and "CUDAExecutionProvider" in available:
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]


class KokoroVietnameseONNX:
    def __init__(self, model_dir: Path, voice: str, device: str = "cpu") -> None:
        import onnxruntime as ort
        import torch

        self.model_dir = model_dir
        self.onnx_path = model_dir / "kokoro_vi.onnx"
        self.config_path = model_dir / "config.json"
        if not self.onnx_path.exists():
            raise FileNotFoundError(f"Thiếu file ONNX: {self.onnx_path}")
        if not self.config_path.exists():
            raise FileNotFoundError(f"Thiếu config.json: {self.config_path}")

        self.voicepack_path = resolve_voicepack(model_dir, voice)
        self.config = load_config(self.config_path)
        self.context_length = int(self.config["plbert"]["max_position_embeddings"])
        self.voicepack = torch.load(
            self.voicepack_path, map_location="cpu", weights_only=True
        )
        self.session = ort.InferenceSession(
            str(self.onnx_path), providers=choose_providers(device)
        )

    def synthesize(self, text: str, *, speed: float = 1.0, crossfade_ms: int = DEFAULT_CROSSFADE_MS) -> np.ndarray:
        audio_chunks: list[np.ndarray] = []
        speed_value = speed_input(speed)
        for text_chunk in split_text(text):
            ps = phonemize(text_chunk)
            if not ps:
                continue
            input_ids = phonemes_to_input_ids(
                ps, self.config["vocab"], context_length=self.context_length
            )
            ref_s = select_voice_style(self.voicepack, len(ps))
            waveform, _duration = self.session.run(
                None,
                {"input_ids": input_ids, "ref_s": ref_s, "speed": speed_value},
            )
            audio_chunks.append(np.asarray(waveform, dtype=np.float32).reshape(-1))

        crossfade_samples = round(SAMPLE_RATE * int(crossfade_ms) / 1000)
        return merge_audio_chunks(audio_chunks, crossfade_samples)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sublix Kokoro-Vietnamese offline TTS (ONNX)")
    parser.add_argument("--text", required=True, help="Vietnamese text to synthesize")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="Voice id from voices.json")
    parser.add_argument("--out", required=True, help="Output audio path (.wav)")
    parser.add_argument("--model-dir", default=None, help="Folder with kokoro_vi.onnx + config.json + voicepacks")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"], help="ONNX Runtime device")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    parser.add_argument("--crossfade-ms", type=int, default=DEFAULT_CROSSFADE_MS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    model_dir = resolve_model_dir(args.model_dir)
    tts = KokoroVietnameseONNX(model_dir, args.voice, device=args.device)
    audio = tts.synthesize(args.text, speed=args.speed, crossfade_ms=args.crossfade_ms)
    if audio.size == 0:
        raise RuntimeError("Kokoro không tạo được audio (text rỗng hoặc không hợp lệ).")
    out_path = Path(args.out)
    write_wav(out_path, audio, SAMPLE_RATE)
    print(f"{out_path} ({audio.size} samples, {audio.size / SAMPLE_RATE:.2f}s)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 - surface a clear message to the caller
        print(f"kokoro_vi_tts error: {exc}", file=sys.stderr)
        raise SystemExit(1)
