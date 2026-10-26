/**
 * Hình học thuần của khung dải chữ cứng: kẹp, kéo 4 mép / kéo cả khung, hút 4 px, phím mũi tên.
 * Mọi toạ độ là **pixel video gốc** (UI_REDESIGN_PLAN §4.12 D). Không import React → test bằng node.
 */
import type { BandPx } from "./logic.ts";

export type DragHandle = "top" | "bottom" | "left" | "right" | "move";

/** Cao tối thiểu 3 % khung; rộng tối thiểu 5 % khung. */
export const MIN_H_RATIO = 0.03;
export const MIN_W_RATIO = 0.05;
/** Khoảng hút (px video gốc). */
export const SNAP_PX = 4;

export interface VideoSize {
  w: number;
  h: number;
}

/** Đưa dải về trong khung và đạt cỡ tối thiểu. */
export function clampBand(b: BandPx, v: VideoSize): BandPx {
  const minH = Math.max(1, Math.round(v.h * MIN_H_RATIO));
  const minW = Math.max(1, Math.round(v.w * MIN_W_RATIO));
  const w = Math.min(v.w, Math.max(minW, b.w));
  const h = Math.min(v.h, Math.max(minH, b.h));
  const x = Math.min(v.w - w, Math.max(0, b.x));
  const y = Math.min(v.h - h, Math.max(0, b.y));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Dải mặc định khi "Tự đặt dải": 80–94 % cao, 4–96 % ngang. */
export function defaultManualBand(v: VideoSize): BandPx {
  return clampBand(
    { x: v.w * 0.04, y: v.h * 0.8, w: v.w * 0.92, h: v.h * 0.14 },
    v,
  );
}

/** Hút `value` vào mục tiêu gần nhất trong `SNAP_PX`. */
export function snapValue(value: number, targets: readonly number[], threshold = SNAP_PX): { value: number; snapped: boolean } {
  let best = value;
  let bestD = threshold + 1;
  for (const t of targets) {
    const d = Math.abs(t - value);
    if (d <= threshold && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return { value: best, snapped: bestD <= threshold };
}

export interface SnapTargets {
  xs: number[];
  ys: number[];
}

/** Mục tiêu hút: mép khung video + mép dải dò (nếu có). */
export function snapTargetsFor(v: VideoSize, detected?: BandPx | null): SnapTargets {
  const xs = [0, v.w];
  const ys = [0, v.h];
  if (detected) {
    xs.push(detected.x, detected.x + detected.w);
    ys.push(detected.y, detected.y + detected.h);
  }
  return { xs, ys };
}

export interface DragResult {
  band: BandPx;
  /** Các mép vừa được hút (để vẽ vạch xanh). */
  snapped: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean };
}

/**
 * Kéo `handle` từ dải `start` đi (dx, dy) px video gốc.
 * `symmetric`: mép trái/phải co đối xứng quanh tâm (mặc định; giữ Alt = 1 bên ⇒ `symmetric = false`).
 */
export function dragBand(
  start: BandPx,
  handle: DragHandle,
  dx: number,
  dy: number,
  v: VideoSize,
  targets: SnapTargets,
  symmetric = true,
): DragResult {
  const minH = Math.max(1, Math.round(v.h * MIN_H_RATIO));
  const minW = Math.max(1, Math.round(v.w * MIN_W_RATIO));
  let l = start.x;
  let r = start.x + start.w;
  let t = start.y;
  let b = start.y + start.h;
  const snapped: DragResult["snapped"] = {};

  const snapY = (val: number, edge: "top" | "bottom") => {
    const s = snapValue(val, targets.ys);
    if (s.snapped) snapped[edge] = true;
    return s.value;
  };
  const snapX = (val: number, edge: "left" | "right") => {
    const s = snapValue(val, targets.xs);
    if (s.snapped) snapped[edge] = true;
    return s.value;
  };

  switch (handle) {
    case "top":
      t = Math.min(snapY(start.y + dy, "top"), b - minH);
      t = Math.max(0, t);
      break;
    case "bottom":
      b = Math.max(snapY(start.y + start.h + dy, "bottom"), t + minH);
      b = Math.min(v.h, b);
      break;
    case "left": {
      const nl = snapX(start.x + dx, "left");
      if (symmetric) {
        const c = start.x + start.w / 2;
        const half = Math.min(Math.max(minW / 2, c - nl), c, v.w - c);
        l = c - half;
        r = c + half;
      } else {
        l = Math.max(0, Math.min(nl, r - minW));
      }
      break;
    }
    case "right": {
      const nr = snapX(start.x + start.w + dx, "right");
      if (symmetric) {
        const c = start.x + start.w / 2;
        const half = Math.min(Math.max(minW / 2, nr - c), c, v.w - c);
        l = c - half;
        r = c + half;
      } else {
        r = Math.min(v.w, Math.max(nr, l + minW));
      }
      break;
    }
    case "move": {
      let ny = Math.min(v.h - start.h, Math.max(0, start.y + dy));
      let nx = Math.min(v.w - start.w, Math.max(0, start.x + dx));
      const sTop = snapValue(ny, targets.ys);
      const sBot = snapValue(ny + start.h, targets.ys);
      if (sTop.snapped) {
        ny = sTop.value;
        snapped.top = true;
      } else if (sBot.snapped) {
        ny = sBot.value - start.h;
        snapped.bottom = true;
      }
      const sL = snapValue(nx, targets.xs);
      const sR = snapValue(nx + start.w, targets.xs);
      if (sL.snapped) {
        nx = sL.value;
        snapped.left = true;
      } else if (sR.snapped) {
        nx = sR.value - start.w;
        snapped.right = true;
      }
      l = nx;
      r = nx + start.w;
      t = ny;
      b = ny + start.h;
      break;
    }
  }
  return { band: clampBand({ x: l, y: t, w: r - l, h: b - t }, v), snapped };
}

/** ↑ ↓ dời 1 px video gốc (Shift ×10); ← → tương tự. Trả `null` nếu phím không phải mũi tên. */
export function nudgeBand(b: BandPx, key: string, shift: boolean, v: VideoSize): BandPx | null {
  const step = shift ? 10 : 1;
  const d: Record<string, [number, number]> = {
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
  };
  const m = d[key];
  return m ? clampBand({ ...b, x: b.x + m[0], y: b.y + m[1] }, v) : null;
}

const pct = (n: number) => `${n.toFixed(1).replace(".", ",")} %`;

/** Số đọc lúc kéo: "Trên 79,0 % · Dưới 96,0 % · cao 184 px". */
export function readout(b: BandPx, v: VideoSize): string {
  return `Trên ${pct((b.y / v.h) * 100)} · Dưới ${pct(((b.y + b.h) / v.h) * 100)} · cao ${Math.round(b.h)} px`;
}

/** Dải thấp hơn 1 dòng chữ (cỡ chữ tính ở 1080p, quy ra px video) ⇒ cảnh báo vàng. */
export function bandShorterThanText(b: BandPx, fontSize1080: number, videoH: number): boolean {
  return b.h < fontSize1080 * (videoH / 1080) * 1.2;
}

/** Hai dải giống nhau (so sánh "đã chỉnh tay" với dải dò). */
export function sameBand(a: BandPx | null | undefined, b: BandPx | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
