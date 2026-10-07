#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sherpa_diarize.py — Offline Speaker Diarization Sidecar for Sublix (Phase V2)
Uses pyannote-segmentation-3-0 + wespeaker_en_voxceleb_resnet34_LM via sherpa-onnx.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
import sherpa_onnx


def ensure_16k_mono_wav(wav_path: str) -> tuple[str, bool]:
    """Ensures input WAV is 16kHz mono. If not, converts via FFmpeg to a temp file."""
    try:
        with wave.open(wav_path, "rb") as wf:
            channels = wf.getnchannels()
            rate = wf.getframerate()
            sampwidth = wf.getsampwidth()
            if channels == 1 and rate == 16000 and sampwidth == 2:
                return wav_path, False
    except Exception:
        pass

    # Need conversion
    tmp_fd, tmp_path = tempfile.mkstemp(suffix="_16k.wav", prefix="sublix_diarize_")
    os.close(tmp_fd)

    ffmpeg_bin = os.environ.get("FFMPEG_PATH", "ffmpeg")
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        wav_path,
        "-vn",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        tmp_path,
    ]
    creation_flags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW
    try:
        subprocess.run(
            cmd,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags,
        )
    except Exception as e:
        # Fallback to direct ffmpeg path lookup if in standard Sublix location
        alt_ffmpeg = r"C:\Program Files\AI Automation\bin\ffmpeg.exe"
        if os.path.exists(alt_ffmpeg):
            cmd[0] = alt_ffmpeg
            subprocess.run(
                cmd,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creation_flags,
            )
        else:
            raise RuntimeError(f"FFmpeg conversion failed: {e}")

    return tmp_path, True


def load_wav_samples(wav_path: str) -> np.ndarray:
    with wave.open(wav_path, "rb") as wf:
        n_frames = wf.getnframes()
        frames = wf.readframes(n_frames)
        return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def run_diarization(
    wav_path: str,
    model_dir: str,
    threshold: float = 0.45,
    num_speakers: int = -1,
    min_duration_on: float = 0.3,
    min_duration_off: float = 0.5,
) -> dict:
    model_dir_path = Path(model_dir)

    # Locate segmentation model
    seg_model = (
        model_dir_path / "sherpa-onnx-pyannote-segmentation-3-0" / "model.onnx"
    )
    if not seg_model.exists():
        seg_model = (
            model_dir_path / "sherpa-onnx-pyannote-segmentation-3-0" / "model.int8.onnx"
        )
    if not seg_model.exists():
        seg_model = model_dir_path / "model.onnx"
    if not seg_model.exists():
        seg_model = model_dir_path / "model.int8.onnx"
    if not seg_model.exists():
        raise FileNotFoundError(
            f"Segmentation model not found in {model_dir_path}"
        )

    # Locate embedding model
    emb_model = (
        model_dir_path / "wespeaker_en_voxceleb_resnet34_LM.onnx"
    )
    if not emb_model.exists():
        # Look for any .onnx with wespeaker or embedding
        cands = list(model_dir_path.glob("*wespeaker*.onnx"))
        if cands:
            emb_model = cands[0]
        else:
            raise FileNotFoundError(
                f"Embedding model not found in {model_dir_path}"
            )

    actual_wav, is_temp = ensure_16k_mono_wav(wav_path)
    try:
        samples = load_wav_samples(actual_wav)

        seg_conf = sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=str(seg_model)
            ),
            num_threads=2,
        )
        emb_conf = sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=str(emb_model),
            num_threads=2,
        )
        clust_conf = sherpa_onnx.FastClusteringConfig(
            num_clusters=num_speakers if num_speakers > 0 else -1,
            threshold=threshold,
        )
        config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
            segmentation=seg_conf,
            embedding=emb_conf,
            clustering=clust_conf,
            min_duration_on=min_duration_on,
            min_duration_off=min_duration_off,
        )

        diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
        res = diarizer.process(samples)

        segments = []
        for s in res.sort_by_start_time():
            segments.append({
                "start": round(float(s.start), 3),
                "end": round(float(s.end), 3),
                "speaker": int(s.speaker),
            })

        return {
            "num_speakers": int(res.num_speakers),
            "num_segments": int(res.num_segments),
            "segments": segments,
        }
    finally:
        if is_temp and os.path.exists(actual_wav):
            try:
                os.remove(actual_wav)
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="Sublix Speaker Diarization Sidecar")
    parser.add_argument("--wav", required=True, help="Path to input audio WAV")
    parser.add_argument("--model-dir", required=True, help="Directory containing sherpa models")
    parser.add_argument("--threshold", type=float, default=0.45, help="Clustering threshold (default: 0.45)")
    parser.add_argument("--num-speakers", type=int, default=-1, help="Expected number of speakers (-1 for auto)")
    parser.add_argument("--out", required=True, help="Path to output JSON result")

    args = parser.parse_args()

    try:
        result = run_diarization(
            wav_path=args.wav,
            model_dir=args.model_dir,
            threshold=args.threshold,
            num_speakers=args.num_speakers,
        )
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"SUCCESS: Diarization complete. Found {result['num_speakers']} speakers across {result['num_segments']} segments.")
        sys.exit(0)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
