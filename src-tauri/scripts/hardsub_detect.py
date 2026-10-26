#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
hardsub_detect.py - Hardsub text-box detection sidecar for Sublix (PP-OCRv4 det, ONNX).

Reads frames of a video (ffmpeg, raw RGB pipe, `--fps` frames per second, cropped to
`--crop x:y:w:h` = the region to inspect), runs the DBNet text detector with
onnxruntime + numpy only (no OpenCV / Pillow / scipy) and prints, one per line:

    PROG <done> <total>            progress
    RESULT <json>                  {"width","height","frames":[{"t","boxes":[[x0,y0,x1,y1,score]]}]}
    ERR <code> <message>           code: no_module | model_load | ffmpeg

Box coordinates are **normalised 0..1 inside the crop**, so the Rust caller maps them back
to the full video frame (it knows the crop origin and the real frame size).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys

MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)
BIN_THRESH = 0.3      # DB binarisation threshold
UNCLIP_RATIO = 1.5    # DB "unclip": the probability map is a shrunk kernel
MIN_SIDE_PX = 3       # in model-input pixels


def fail(code: str, msg: str) -> None:
    print(f"ERR {code} {msg}", flush=True)
    sys.exit(2)


def round32(v: float) -> int:
    return max(32, int(round(v / 32.0)) * 32)


def runs(flags, max_gap: int):
    """[(start, end)] inclusive runs of True in a 1-D bool array, bridging gaps <= max_gap."""
    out = []
    start = last = None
    for i in flags.nonzero()[0]:
        i = int(i)
        if start is None:
            start = last = i
        elif i - last - 1 <= max_gap:
            last = i
        else:
            out.append((start, last))
            start = last = i
    if start is not None:
        out.append((start, last))
    return out


def extract_boxes(prob, np):
    """Mask -> text-line boxes. Subtitles are horizontal: split by row bands, then by column gaps."""
    h, w = prob.shape
    mask = prob > BIN_THRESH
    boxes = []
    for r0, r1 in runs(mask.any(axis=1), 1):
        band_h = r1 - r0 + 1
        if band_h < MIN_SIDE_PX:
            continue
        band = mask[r0:r1 + 1]
        for c0, c1 in runs(band.any(axis=0), max(4, int(band_h * 1.5))):
            sub = band[:, c0:c1 + 1]
            rows = sub.any(axis=1).nonzero()[0]
            top, bot = r0 + int(rows[0]), r0 + int(rows[-1])
            bw, bh = c1 - c0 + 1, bot - top + 1
            if bw < MIN_SIDE_PX or bh < MIN_SIDE_PX:
                continue
            region = prob[top:bot + 1, c0:c1 + 1]
            msk = mask[top:bot + 1, c0:c1 + 1]
            score = float(region[msk].mean()) if msk.any() else 0.0
            d = bw * bh * UNCLIP_RATIO / (2.0 * (bw + bh))
            x0, y0 = max(0.0, c0 - d), max(0.0, top - d)
            x1, y1 = min(float(w), c1 + 1 + d), min(float(h), bot + 1 + d)
            boxes.append([round(x0 / w, 5), round(y0 / h, 5), round(x1 / w, 5), round(y1 / h, 5),
                          round(score, 4)])
    return boxes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--crop", required=True, help="x:y:w:h in source-frame pixels")
    ap.add_argument("--fps", type=float, default=1.0)
    ap.add_argument("--total", type=int, default=0, help="expected number of frames (progress only)")
    ap.add_argument("--max-width", type=int, default=960)
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args()

    try:
        import numpy as np
        import onnxruntime as ort
    except Exception as e:  # noqa: BLE001
        fail("no_module", f"{type(e).__name__}: {e}")

    try:
        so = ort.SessionOptions()
        so.intra_op_num_threads = max(1, a.threads)
        sess = ort.InferenceSession(a.model, so, providers=["CPUExecutionProvider"])
        in_name = sess.get_inputs()[0].name
    except Exception as e:  # noqa: BLE001
        fail("model_load", f"{type(e).__name__}: {e}")

    try:
        cx, cy, cw, ch = (int(v) for v in a.crop.split(":"))
    except ValueError:
        fail("ffmpeg", f"crop khong hop le: {a.crop}")
    mw = round32(min(cw, a.max_width))
    mh = round32(ch * mw / float(cw))
    cmd = [a.ffmpeg, "-v", "error", "-nostdin", "-i", a.video,
           "-vf", f"fps={a.fps},crop={cw}:{ch}:{cx}:{cy},scale={mw}:{mh}",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    except OSError as e:
        fail("ffmpeg", str(e))

    mean = np.array(MEAN, dtype=np.float32).reshape(1, 1, 3)
    std = np.array(STD, dtype=np.float32).reshape(1, 1, 3)
    size = mw * mh * 3
    frames = []
    i = 0
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        img = np.frombuffer(buf, dtype=np.uint8).reshape(mh, mw, 3).astype(np.float32) / 255.0
        x = ((img - mean) / std).transpose(2, 0, 1)[None].astype(np.float32)
        try:
            out = sess.run(None, {in_name: x})[0]
        except Exception as e:  # noqa: BLE001
            proc.kill()
            fail("model_load", f"inference: {type(e).__name__}: {e}")
        frames.append({"t": round(i / a.fps, 3), "boxes": extract_boxes(out[0, 0], np)})
        i += 1
        print(f"PROG {i} {max(a.total, i)}", flush=True)
    proc.stdout.close()
    proc.wait()
    if not frames:
        fail("ffmpeg", "khong doc duoc khung hinh nao tu video")
    print("RESULT " + json.dumps({"width": mw, "height": mh, "frames": frames},
                                 separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
