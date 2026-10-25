//! Smart Ducking — đường âm lượng nền theo thoại (docs/DUCKING_SPEC.md §3–§4.2).
//!
//! Bản song sinh của `src/lib/audio/duckingEnvelope.ts`; cả hai chạy chung
//! `scripts/ducking-tests/vectors.json` để Studio xem thử và video xuất ra cho cùng một đường.
//!
//! Mỗi khối thoại cho hệ số hạ f(t) ∈ [0,1] (dB = L·f, L = 20·log10(duck_level) < 0).
//! Hạ tuyến tính trong miền dB ⇔ f tuyến tính; ghép nhiều khối = max(f) ⇔ lấy mức dB thấp hơn.

use serde::{Deserialize, Serialize};
use std::fmt::Write as _;

/// Tham số §2. Mặc định khớp bảng trong spec.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct DuckingParams {
    pub duck_level: f64,
    pub bridge_gap_sec: f64,
    pub attack_sec: f64,
    pub release_sec: f64,
    pub min_voice_sec: f64,
}

impl Default for DuckingParams {
    fn default() -> Self {
        Self {
            duck_level: 0.2,
            bridge_gap_sec: 2.0,
            attack_sec: 0.3,
            release_sec: 1.0,
            min_voice_sec: 0.15,
        }
    }
}

/// Điểm gãy: gain tuyến tính tại `t` giây; giữa 2 điểm nội suy trong miền dB.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Breakpoint {
    pub t: f64,
    pub gain: f64,
}

const MIN_DUCK_LEVEL: f64 = 0.001;
const MIN_RAMP_SEC: f64 = 0.001;
const EPS: f64 = 1e-9;

type Block = (f64, f64);

/// Hệ số hạ của 1 khối tại `t`: ramp lên, giữ, ramp xuống.
fn block_factor(blk: Block, attack: f64, release: f64, t: f64) -> f64 {
    let (s, e) = blk;
    if t < s {
        ((t - (s - attack)) / attack).clamp(0.0, 1.0)
    } else if t <= e {
        1.0
    } else {
        (1.0 - (t - e) / release).clamp(0.0, 1.0)
    }
}

/// §3.1 + §3.2: lọc đoạn ngắn, kẹp vào [0,duration], sắp xếp, gộp khối.
fn merge_blocks(voice: &[(f64, f64)], duration: f64, p: &DuckingParams) -> Vec<Block> {
    let mut segs: Vec<Block> = voice
        .iter()
        .filter(|(s, e)| s.is_finite() && e.is_finite())
        .map(|&(s, e)| (s.clamp(0.0, duration), e.clamp(0.0, duration)))
        .filter(|&(s, e)| e - s >= p.min_voice_sec)
        .collect();
    segs.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
    let mut blocks: Vec<Block> = Vec::new();
    for seg in segs {
        match blocks.last_mut() {
            Some(cur) if seg.0 - cur.1 < p.bridge_gap_sec => cur.1 = cur.1.max(seg.1),
            _ => blocks.push(seg),
        }
    }
    blocks
}

/// Đường bao trên (max) của các hàm tuyến tính `(v tại t0, độ dốc)` trong [t0,t1].
fn upper_envelope(t0: f64, t1: f64, fns: &[(f64, f64)]) -> Vec<(f64, f64)> {
    let at = |k: usize, t: f64| fns[k].0 + fns[k].1 * (t - t0);
    let mut t = t0;
    let mut cur = 0usize;
    for k in 1..fns.len() {
        let dv = at(k, t) - at(cur, t);
        if dv > EPS || (dv.abs() <= EPS && fns[k].1 > fns[cur].1) {
            cur = k;
        }
    }
    let mut out = vec![(t, at(cur, t))];
    loop {
        let mut best: Option<usize> = None;
        let mut best_t = t1;
        for k in 0..fns.len() {
            if fns[k].1 <= fns[cur].1 + EPS {
                continue;
            }
            let tc = t + (at(cur, t) - at(k, t)) / (fns[k].1 - fns[cur].1);
            if tc > t + EPS && tc < best_t - EPS {
                best_t = tc;
                best = Some(k);
            }
        }
        let Some(k) = best else { break };
        t = best_t;
        cur = k;
        out.push((t, at(cur, t)));
    }
    out
}

/// Xây điểm gãy gain nền theo các đoạn thoại `(start, end)` giây và `duration` video.
pub fn build_ducking_envelope(voice: &[(f64, f64)], duration: f64, params: &DuckingParams) -> Vec<Breakpoint> {
    let flat = || vec![Breakpoint { t: 0.0, gain: 1.0 }];
    let dur = if duration.is_finite() { duration.max(0.0) } else { 0.0 };
    let level = params.duck_level.clamp(MIN_DUCK_LEVEL, 1.0);
    let attack = params.attack_sec.max(MIN_RAMP_SEC);
    let release = params.release_sec.max(MIN_RAMP_SEC);
    let p = DuckingParams { duck_level: level, ..*params };
    let l_db = 20.0 * level.log10();
    if level >= 1.0 || dur <= 0.0 {
        return flat();
    }
    let blocks = merge_blocks(voice, dur, &p);
    if blocks.is_empty() {
        return flat();
    }

    let mut times = vec![0.0, dur];
    for &(s, e) in &blocks {
        times.extend([s - attack, s, e, e + release]);
    }
    let mut ts: Vec<f64> = times.iter().map(|x| x.clamp(0.0, dur)).collect();
    ts.sort_by(f64::total_cmp);
    let mut uniq: Vec<f64> = Vec::with_capacity(ts.len());
    for x in ts {
        if uniq.last().map_or(true, |&l| x - l > EPS) {
            uniq.push(x);
        }
    }

    let mut pts: Vec<(f64, f64)> = Vec::new();
    let mut lo = 0usize;
    for w in uniq.windows(2) {
        let (t0, t1) = (w[0], w[1]);
        while lo < blocks.len() && blocks[lo].1 + release <= t0 {
            lo += 1;
        }
        let mut fns = vec![(0.0, 0.0)];
        for blk in blocks.iter().skip(lo).take_while(|b| b.0 - attack < t1) {
            let v = block_factor(*blk, attack, release, t0);
            let u = block_factor(*blk, attack, release, t1);
            fns.push((v, (u - v) / (t1 - t0)));
        }
        pts.extend(upper_envelope(t0, t1, &fns));
    }
    let f_end = blocks
        .iter()
        .skip(lo)
        .map(|b| block_factor(*b, attack, release, dur))
        .fold(0.0, f64::max);
    pts.push((dur, f_end));

    // Bỏ điểm thẳng hàng (§3.5).
    let mut keep: Vec<(f64, f64)> = Vec::with_capacity(pts.len());
    for q in pts {
        while keep.len() >= 2 {
            let a = keep[keep.len() - 2];
            let b = keep[keep.len() - 1];
            let cross = (b.0 - a.0) * (q.1 - a.1) - (q.0 - a.0) * (b.1 - a.1);
            if cross.abs() > EPS {
                break;
            }
            keep.pop();
        }
        keep.push(q);
    }
    let n = keep.len();
    if n >= 2 && keep[n - 1].1.abs() < EPS && keep[n - 2].1.abs() < EPS {
        keep.pop();
    }
    keep.into_iter()
        .map(|(t, f)| Breakpoint { t, gain: 10f64.powf(l_db * f / 20.0) })
        .collect()
}

/// Gain tại `t`: nội suy tuyến tính trong miền dB; ngoài đoạn giữ giá trị đầu/cuối.
pub fn gain_at(points: &[Breakpoint], t: f64) -> f64 {
    let (Some(first), Some(last)) = (points.first(), points.last()) else {
        return 1.0;
    };
    if t.partial_cmp(&first.t) != Some(std::cmp::Ordering::Greater) {
        return first.gain;
    }
    if t >= last.t {
        return last.gain;
    }
    let hi = points.partition_point(|p| p.t <= t).clamp(1, points.len() - 1);
    let (a, b) = (points[hi - 1], points[hi]);
    a.gain * (b.gain / a.gain).powf((t - a.t) / (b.t - a.t))
}

/// Bộ lọc FFmpeg `volume` cho đường âm lượng (§4.2). Dạng "tổng các ramp" trong miền dB:
/// `dB(t) = v0 + Σ cᵢ·max(0, t − tᵢ)` — phẳng, không lồng `if`, độ dài tuyến tính theo số
/// điểm gãy nên dùng được cho mọi cỡ (lý do chọn: xem DUCKING_SPEC §6). Gói trong
/// `asetnsamples` để gain cập nhật mỗi 512 mẫu (~10 ms) thay vì mỗi frame codec (~21 ms).
/// Khi dùng trong `-filter_complex` cho video dài hàng trăm khối, nên truyền qua
/// `-filter_complex_script` để khỏi vượt giới hạn dòng lệnh Windows.
pub fn ffmpeg_volume_filter(points: &[Breakpoint]) -> String {
    let Some(first) = points.first() else {
        return "volume=1.000000".to_string();
    };
    if points.iter().all(|p| (p.gain - first.gain).abs() < 1e-9) {
        return format!("volume={:.6}", first.gain);
    }
    let db: Vec<f64> = points.iter().map(|p| 20.0 * p.gain.max(1e-6).log10()).collect();
    let slope = |i: usize| -> f64 {
        match (points.get(i), points.get(i + 1)) {
            (Some(a), Some(b)) => (db[i + 1] - db[i]) / (b.t - a.t),
            _ => 0.0,
        }
    };
    let mut expr = format!("({:.6})", db[0]);
    let mut prev = 0.0;
    for (i, p) in points.iter().enumerate() {
        let m = slope(i);
        let c = m - prev;
        prev = m;
        if c.abs() > 1e-9 {
            let _ = write!(expr, "+({:.6})*max(0,t-{:.6})", c, p.t);
        }
    }
    format!("asetnsamples=n=512:p=0,volume=eval=frame:volume='pow(10,({})/20)'", expr)
}

#[cfg(test)]
#[path = "ducking_tests.rs"]
mod ducking_tests;
