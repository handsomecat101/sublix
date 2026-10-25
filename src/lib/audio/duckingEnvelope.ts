/**
 * Smart Ducking — đường âm lượng nền theo thoại (docs/DUCKING_SPEC.md §3).
 *
 * Hàm thuần, tất định. Bản Rust song sinh: `src-tauri/src/dubbing/ducking.rs`;
 * cả hai chạy chung `scripts/ducking-tests/vectors.json` (xem §4.3).
 *
 * Cách tính: mỗi khối thoại cho một hàm "hệ số hạ" f(t) ∈ [0,1] (0 = nền nguyên vẹn,
 * 1 = hạ hết `duckLevel`), dB = L·f với L = 20·log10(duckLevel) < 0. Hạ theo tuyến tính
 * trong miền dB ⇔ f tuyến tính. Ghép nhiều khối = lấy max(f) ⇔ lấy mức dB thấp hơn (§3.4).
 */

export interface DuckingParams {
  /** Âm lượng nền khi có thoại (0–1, tuyến tính). */
  duckLevel: number;
  /** Hai câu cách nhau < giá trị này (giây) → 1 khối, nền giữ thấp suốt. */
  bridgeGapSec: number;
  /** Thời gian hạ nền, kết thúc đúng lúc câu đầu khối bắt đầu. */
  attackSec: number;
  /** Thời gian trả nền, bắt đầu khi câu cuối khối kết thúc. */
  releaseSec: number;
  /** Đoạn thoại ngắn hơn bị bỏ qua. */
  minVoiceSec: number;
}

export const DEFAULT_DUCKING: DuckingParams = {
  duckLevel: 0.2,
  bridgeGapSec: 2.0,
  attackSec: 0.3,
  releaseSec: 1.0,
  minVoiceSec: 0.15,
};

/** Điểm gãy: gain tuyến tính tại thời điểm t (giây); giữa 2 điểm nội suy trong miền dB. */
export interface Breakpoint {
  t: number;
  gain: number;
}

/** Sàn dB (−60 dB) để log10 không về −∞ khi duckLevel = 0. */
const MIN_DUCK_LEVEL = 0.001;
/** Ramp tối thiểu để tránh bước nhảy thẳng đứng (2 điểm cùng t). */
const MIN_RAMP_SEC = 0.001;
const EPS = 1e-9;

type Block = [number, number];

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** §3.1 + §3.2: lọc đoạn ngắn, kẹp vào [0,duration], sắp xếp, gộp khối. */
function mergeBlocks(voice: ReadonlyArray<readonly [number, number]>, duration: number, p: DuckingParams): Block[] {
  const segs: Block[] = [];
  for (const [rs, re] of voice) {
    if (!Number.isFinite(rs) || !Number.isFinite(re)) continue;
    const s = clamp(rs, 0, duration);
    const e = clamp(re, 0, duration);
    if (e - s < p.minVoiceSec) continue;
    segs.push([s, e]);
  }
  segs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const blocks: Block[] = [];
  for (const seg of segs) {
    const cur = blocks[blocks.length - 1];
    if (cur && seg[0] - cur[1] < p.bridgeGapSec) cur[1] = Math.max(cur[1], seg[1]);
    else blocks.push([seg[0], seg[1]]);
  }
  return blocks;
}

/** Hệ số hạ của 1 khối tại t: ramp lên [a,s], giữ [s,e], ramp xuống [e,b]. */
function blockFactor(blk: Block, attack: number, release: number, t: number): number {
  const [s, e] = blk;
  if (t < s) return clamp((t - (s - attack)) / attack, 0, 1);
  if (t <= e) return 1;
  return clamp(1 - (t - e) / release, 0, 1);
}

/** Đường bao trên (max) của các hàm tuyến tính trong [t0,t1]; trả các điểm (t,f) từ t0 tới trước t1. */
function upperEnvelope(t0: number, t1: number, fns: Array<{ v: number; s: number }>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const at = (k: number, t: number) => fns[k].v + fns[k].s * (t - t0);
  let t = t0;
  let cur = 0;
  for (let k = 1; k < fns.length; k++) {
    const dv = at(k, t) - at(cur, t);
    if (dv > EPS || (Math.abs(dv) <= EPS && fns[k].s > fns[cur].s)) cur = k;
  }
  out.push([t, at(cur, t)]);
  for (;;) {
    let best = -1;
    let bestT = t1;
    for (let k = 0; k < fns.length; k++) {
      if (fns[k].s <= fns[cur].s + EPS) continue;
      const tc = t + (at(cur, t) - at(k, t)) / (fns[k].s - fns[cur].s);
      if (tc > t + EPS && tc < bestT - EPS) {
        bestT = tc;
        best = k;
      }
    }
    if (best < 0) break;
    t = bestT;
    cur = best;
    out.push([t, at(cur, t)]);
  }
  return out;
}

/** Xây điểm gãy gain nền theo danh sách đoạn thoại `[start,end]` (giây) và `duration` video. */
export function buildDuckingEnvelope(
  voice: ReadonlyArray<readonly [number, number]>,
  duration: number,
  params: DuckingParams = DEFAULT_DUCKING,
): Breakpoint[] {
  const dur = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const level = clamp(params.duckLevel, MIN_DUCK_LEVEL, 1);
  const p: DuckingParams = { ...params, duckLevel: level };
  const attack = Math.max(MIN_RAMP_SEC, p.attackSec);
  const release = Math.max(MIN_RAMP_SEC, p.releaseSec);
  const L = 20 * Math.log10(level);
  const blocks = level >= 1 || dur <= 0 ? [] : mergeBlocks(voice, dur, p);
  if (blocks.length === 0) return [{ t: 0, gain: 1 }];

  // Mốc thời gian có thể là điểm gãy của bất kỳ hàm khối nào (kẹp vào [0,dur]).
  const times = [0, dur];
  for (const [s, e] of blocks) times.push(s - attack, s, e, e + release);
  const ts = times.map((x) => clamp(x, 0, dur)).sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const x of ts) if (uniq.length === 0 || x - uniq[uniq.length - 1] > EPS) uniq.push(x);

  // Điểm (t, f) của đường bao; con trỏ `lo` bỏ qua các khối đã hết ảnh hưởng.
  const pts: Array<[number, number]> = [];
  let lo = 0;
  for (let i = 0; i + 1 < uniq.length; i++) {
    const t0 = uniq[i];
    const t1 = uniq[i + 1];
    while (lo < blocks.length && blocks[lo][1] + release <= t0) lo++;
    const fns = [{ v: 0, s: 0 }];
    for (let k = lo; k < blocks.length && blocks[k][0] - attack < t1; k++) {
      const v = blockFactor(blocks[k], attack, release, t0);
      const w = blockFactor(blocks[k], attack, release, t1);
      fns.push({ v, s: (w - v) / (t1 - t0) });
    }
    pts.push(...upperEnvelope(t0, t1, fns));
  }
  // Điểm cuối tại `duration` = max các khối còn ảnh hưởng (ramp release bị cắt ở đây — ca 7).
  let fEnd = 0;
  for (let k = lo; k < blocks.length; k++) fEnd = Math.max(fEnd, blockFactor(blocks[k], attack, release, dur));
  pts.push([dur, fEnd]);

  // Bỏ điểm thẳng hàng (§3.5).
  const keep: Array<[number, number]> = [];
  for (const q of pts) {
    while (keep.length >= 2) {
      const a = keep[keep.length - 2];
      const b = keep[keep.length - 1];
      const cross = (b[0] - a[0]) * (q[1] - a[1]) - (q[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(cross) > EPS) break;
      keep.pop();
    }
    keep.push(q);
  }
  // Đuôi phẳng ở 0 dB là thừa: gainAt giữ giá trị điểm cuối.
  const n = keep.length;
  if (n >= 2 && Math.abs(keep[n - 1][1]) < EPS && Math.abs(keep[n - 2][1]) < EPS) keep.pop();

  return keep.map(([t, f]) => ({ t, gain: 10 ** ((L * f) / 20) }));
}

/** Gain tại t: nội suy tuyến tính trong miền dB giữa 2 điểm gãy; ngoài đoạn giữ giá trị đầu/cuối. */
export function gainAt(points: ReadonlyArray<Breakpoint>, t: number): number {
  const n = points.length;
  if (n === 0) return 1;
  if (!(t > points[0].t)) return points[0].gain;
  if (t >= points[n - 1].t) return points[n - 1].gain;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const frac = (t - a.t) / (b.t - a.t);
  return a.gain * (b.gain / a.gain) ** frac;
}
