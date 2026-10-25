#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
speaker_measure.py — ĐO THẬT cho TSK-FIX-SPEAKER-ROLES (phân vai theo GIỌNG thật).

Dựng fixture 8 câu tiếng Việt (4 nam + 4 nữ) bằng giọng TTS Kokoro offline,
rồi chạy pipeline thật:
  1. `sherpa_diarize.py`  → tách cụm người nói theo âm sắc (pyannote + wespeaker).
  2. `speaker_gender.py`  → F0 trung vị mỗi cụm (sidecar MỚI của task này).
  3. So sánh TRƯỚC/SÁU:
       - phân vai: BEFORE `spk % n` (modulo)  vs AFTER gộp cụm gần nhất theo F0.
       - giới tính: BEFORE mặc định cũ (N=1|2 ⇒ tất cả nam) vs AFTER F0 (165/180 Hz).

Cách chấm (bất biến với cách đánh số cụm): thử mọi hoán vị ánh xạ cụm→người,
lấy phép hoán vị tốt nhất; 1 câu "đúng" khi cụm gán cho nó khớp người ground truth.

Cần: model `kokoro-vi` + `sherpa-diarization` trong `src-tauri/models/voice/`,
Python có `numpy`, `torch`, `onnxruntime` (env sherpa của app).

Usage:
    python speaker_measure.py [--out-dir <thư mục>]
"""

import argparse
import itertools
import json
import math
import os
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
VOICE_DIR = REPO_ROOT / "src-tauri" / "models" / "voice"
KOKORO_DIR = VOICE_DIR / "kokoro-vi"
SHERPA_DIR = VOICE_DIR / "sherpa-diarization"
PY = sys.executable
SR = 16000
N_SPEAKERS = 2
F0_MALE_MAX = 165.0
F0_FEMALE_MIN = 180.0
MALE_VOICE = "tuan_ngoc"
FEMALE_VOICE = "mai_linh"

# Giọng TTS Kokoro VI có F0 cao hơn người thật (~200 Hz) → hạ tốc để về vùng
# người thật: nam ×0.55 (≈110 Hz), nữ ×0.80 (≈215 Hz). Dạng sóng vẫn là tiếng nói.
PITCH_SPEED = {MALE_VOICE: 0.55, FEMALE_VOICE: 0.80}

LINES = [
    (MALE_VOICE, 0, "Chúng ta cần rút lui ngay lập tức, không còn đường lui nữa."),
    (FEMALE_VOICE, 1, "Khoan đã, con đường phía bắc vẫn còn một chút hy vọng."),
    (MALE_VOICE, 0, "Tao sẽ giữ chống cửa cho đến khi nào anh đi được."),
    (FEMALE_VOICE, 1, "Anh đừng vội, hãy nghe tôi nói hết một câu đã."),
    (MALE_VOICE, 0, "Không có thời gian đâu, quân địch đang ở ngay bên kia."),
    (FEMALE_VOICE, 1, "Vậy thì cứ đi, ta sẽ tìm cách đánh lừa chúng nó."),
    (MALE_VOICE, 0, "Được rồi, ta đi theo đường phía bắc như anh nói."),
    (FEMALE_VOICE, 1, "Cẩn thận, phía trước có một con đường nhỏ bị chặn."),
]


# ------------------------------------------------------------------ TTS
def synth(voice: str, text: str, out: Path) -> None:
    cmd = [PY, str(SCRIPT_DIR / "kokoro_vi_tts.py"), "--text", text, "--voice", voice,
           "--out", str(out), "--model-dir", str(KOKORO_DIR), "--device", "cpu"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not out.exists():
        raise RuntimeError(f"TTS fail [{voice}]: {res.stderr[-400:]}")


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as wf:
        n_ch, width, rate = wf.getnchannels(), wf.getsampwidth(), wf.getframerate()
        raw = wf.readframes(wf.getnframes())
    if width == 2:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif width == 4:
        data = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise RuntimeError(f"khong ho tro {width * 8}-bit")
    if n_ch > 1:
        data = data[: (data.size // n_ch) * n_ch].reshape(-1, n_ch).mean(axis=1)
    return data, rate


def resample(x: np.ndarray, src: int, dst: int) -> np.ndarray:
    if src == dst:
        return x
    n = int(round(len(x) * dst / src))
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def slow_down(x: np.ndarray, speed: float) -> np.ndarray:
    """speed < 1 ⇒ dài hơn ⇒ F0 thấp hơn (giọng trầm hơn)."""
    n = int(round(len(x) / speed))
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def build_fixture(out_dir: Path) -> tuple[Path, list[dict]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    chunks, truth = [], []
    cursor, gap = 0.0, 0.35
    for idx, (voice, speaker, text) in enumerate(LINES):
        line_wav = out_dir / f"line_{idx:02d}.wav"
        synth(voice, text, line_wav)
        audio, rate = read_wav(line_wav)
        audio = slow_down(resample(audio, rate, SR), PITCH_SPEED[voice])
        peak = float(np.max(np.abs(audio))) or 1.0
        audio = (audio / peak) * 0.45
        start = cursor
        end = cursor + len(audio) / SR
        chunks.append(audio)
        truth.append({"index": idx, "speaker": speaker,
                      "gender": "male" if voice == MALE_VOICE else "female",
                      "start": round(start, 3), "end": round(end, 3), "text": text})
        chunks.append(np.zeros(int(gap * SR), dtype=np.float32))
        cursor = end + gap
    audio = np.concatenate(chunks)
    wav_path = out_dir / "dialogue_2spk.wav"
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
    return wav_path, truth


# -------------------------------------------------------------- pipeline
def run_sherpa(wav: Path, out_dir: Path, threshold: str) -> list[dict]:
    out = out_dir / "sherpa.json"
    cmd = [PY, str(SCRIPT_DIR / "sherpa_diarize.py"), "--wav", str(wav),
           "--model-dir", str(SHERPA_DIR), "--threshold", threshold,
           "--num-speakers", "-1", "--out", str(out)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"sherpa fail: {res.stderr[-400:]}")
    return json.loads(out.read_text(encoding="utf-8"))["segments"]


def run_pitch(wav: Path, segments: list[dict], out_dir: Path) -> dict:
    seg_file = out_dir / "segments.json"
    out = out_dir / "pitch.json"
    seg_file.write_text(json.dumps(segments), encoding="utf-8")
    cmd = [PY, str(SCRIPT_DIR / "speaker_gender.py"), "--wav", str(wav),
           "--segments", str(seg_file), "--out", str(out)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"pitch fail: {res.stderr[-400:]}")
    return json.loads(out.read_text(encoding="utf-8"))["speakers"]


def overlap_speaker(seg: dict, turns: list[dict]) -> int | None:
    best, max_ov = None, 0.0
    for t in turns:
        ov = max(0.0, min(seg["end"], t["end"]) - max(seg["start"], t["start"]))
        if ov > max_ov:
            max_ov, best = ov, t["speaker"]
    return best if max_ov > 0.05 else None


def cluster_distance(a: dict, b: dict) -> float:
    """Công thức giống `speaker_assign::cluster_distance` (Rust)."""
    fa, fb = a.get("f0_median"), b.get("f0_median")
    if fa and fb and fa > 0 and fb > 0:
        pitch = min(abs(math.log2(fa / fb)) / 2.0, 1.0)
    else:
        pitch = 1.0
    mx = max(a["duration_sec"], b["duration_sec"])
    dur = abs(a["duration_sec"] - b["duration_sec"]) / mx if mx > 0 else 0.0
    return 0.8 * pitch + 0.2 * dur if (fa and fb) else dur


def merge_clusters(profiles: list[dict], max_speakers: int) -> tuple[dict, list[dict]]:
    """Giống `speaker_assign::merge_clusters` (Rust): gộp cụm gần nhất, KHÔNG modulo."""
    clusters = [dict(p) for p in profiles]
    while max_speakers > 0 and len(clusters) > max_speakers:
        best = None
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                d = cluster_distance(clusters[i], clusters[j])
                if best is None or d < best[2]:
                    best = (i, j, d)
        i, j = best[0], best[1]
        keep, drop = (i, j) if clusters[i]["segments"] >= clusters[j]["segments"] else (j, i)
        a, b = clusters[keep], clusters[drop]
        dur = a["duration_sec"] + b["duration_sec"]
        fa, fb = a.get("f0_median"), b.get("f0_median")
        if fa and fb and dur > 0:
            f0 = (fa * a["duration_sec"] + fb * b["duration_sec"]) / dur
        else:
            f0 = fa or fb
        clusters[keep] = {"speaker": a["speaker"], "f0_median": f0, "duration_sec": dur,
                          "segments": a["segments"] + b["segments"],
                          "members": a["members"] + b["members"]}
        clusters.pop(drop)
    mapping = {}
    for idx, c in enumerate(clusters):
        for m in c["members"]:
            mapping[m] = idx
    return mapping, clusters


def gender_from_f0(f0) -> str:
    if not f0:
        return "unknown"
    if f0 <= F0_MALE_MAX:
        return "male"
    if f0 >= F0_FEMALE_MIN:
        return "female"
    return "unknown"


def best_permutation_correct(assigned: list[int], truth: list[int], n: int) -> int:
    return max(sum(1 for a, t in zip(assigned, truth) if perm[a] == t)
               for perm in itertools.permutations(range(n)))


def profiles_from(turns: list[dict], pitch: dict) -> list[dict]:
    profs = {}
    for t in turns:
        p = profs.setdefault(t["speaker"], {"speaker": t["speaker"], "duration_sec": 0.0,
                                            "segments": 0, "members": [t["speaker"]]})
        p["duration_sec"] += t["end"] - t["start"]
        p["segments"] += 1
        p["f0_median"] = pitch.get(str(t["speaker"]), {}).get("f0_median")
    return sorted(profs.values(), key=lambda p: p["speaker"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Do phan vai theo giong that (TSK-FIX-SPEAKER-ROLES)")
    parser.add_argument("--out-dir", default=str(Path(os.environ.get("TEMP", ".")) / "sublix-speaker-fixture"))
    parser.add_argument("--threshold", default="0.22", help="nguong clustering cua sherpa (thap = tach nhieu cum hon)")
    args = parser.parse_args()
    out_dir = Path(args.out_dir)

    print("[1/4] Dung fixture 2 giong (Kokoro offline)...")
    wav, truth = build_fixture(out_dir)
    n = len(truth)

    print("[2/4] Do F0 tung cau (ground truth)...")
    gt_pitch = run_pitch(wav, [{"start": t["start"], "end": t["end"], "speaker": t["index"]}
                                for t in truth], out_dir)
    for t in truth:
        f0 = gt_pitch.get(str(t["index"]), {}).get("f0_median")
        print(f"      #{t['index']} {t['gender']:6s} F0={f0} Hz -> {gender_from_f0(f0)}")

    print("[3/4] Chay sherpa + do F0 theo cum...")
    turns = run_sherpa(wav, out_dir, args.threshold)
    pitch = run_pitch(wav, turns, out_dir)
    clusters = sorted({t["speaker"] for t in turns})
    for k in sorted(pitch, key=int):
        p = pitch[k]
        print(f"      Cum {k}: F0={p['f0_median']} Hz, voiced {p['voiced_ratio'] * 100:.0f}%, "
              f"{p['duration_sec']:.1f}s -> {gender_from_f0(p['f0_median'])}")

    print("[4/4] So sanh truoc/sau...")
    profs = profiles_from(turns, pitch)
    raw = [overlap_speaker(s, turns) for s in truth]
    before_assign = [s % N_SPEAKERS if s is not None else 0 for s in raw]
    before_ok = best_permutation_correct(before_assign, [t["speaker"] for t in truth], N_SPEAKERS)
    mapping, merged = merge_clusters(profs, N_SPEAKERS)
    after_assign = [mapping.get(s, 0) if s is not None else 0 for s in raw]
    after_ok = best_permutation_correct(after_assign, [t["speaker"] for t in truth], N_SPEAKERS)
    before_gender = sum(1 for t in truth if t["gender"] == "male")
    after_gender = 0
    for t, spk in zip(truth, raw):
        if spk is None:
            continue
        if gender_from_f0(merged[mapping.get(spk, 0)].get("f0_median")) == t["gender"]:
            after_gender += 1

    print()
    print(f"  Sherpa: {len(turns)} luot, {len(clusters)} cum = {clusters} (nguoi dung chon {N_SPEAKERS})")
    print(f"  PHAN VAI  BEFORE (spk % {N_SPEAKERS}): {before_ok}/{n} = {before_ok / n * 100:.0f}%"
          f"   AFTER (gop cum theo F0): {after_ok}/{n} = {after_ok / n * 100:.0f}%")
    print(f"  GIOTINH  BEFORE (mac dinh: N=2 => tat ca nam): {before_gender}/{n} = {before_gender / n * 100:.0f}%"
          f"   AFTER (F0 165/180 Hz): {after_gender}/{n} = {after_gender / n * 100:.0f}%")

    report = {
        "fixture": str(wav), "lines": n,
        "sherpa_turns": len(turns), "sherpa_clusters": clusters,
        "pitch_per_cluster": pitch, "ground_truth_pitch": gt_pitch,
        "before_speaker": f"{before_ok}/{n}", "before_speaker_pct": round(before_ok / n * 100, 1),
        "after_speaker": f"{after_ok}/{n}", "after_speaker_pct": round(after_ok / n * 100, 1),
        "before_gender": f"{before_gender}/{n}", "before_gender_pct": round(before_gender / n * 100, 1),
        "after_gender": f"{after_gender}/{n}", "after_gender_pct": round(after_gender / n * 100, 1),
        "merge_mapping": {str(k): v for k, v in mapping.items()},
    }
    report_path = out_dir / "measurement.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Bao cao: {report_path}")


if __name__ == "__main__":
    main()
