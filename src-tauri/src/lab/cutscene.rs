//! TSK-LAB-C2 — **chấm điểm cutscene** (thuần, không ffmpeg).
//!
//! Bốn tầng heuristic của `docs/GAME_RECAP_RESEARCH.md` §4.1 — file này làm 3 tầng đo
//! được bằng số (tầng "mất HUD" cần so ảnh ⇒ **TODO**, xem cuối file):
//!
//! | Tầng | Đầu vào | Trọng số |
//! |---|---|---|
//! | 1. Dải đen (letterbox 21:9 / 2.39:1) | [`LetterboxRange`] từ `probe` | **0,50** |
//! | 2. Có phụ đề cứng (thoại cốt truyện) | khoảng `(start, end)` từ v0.14 | **0,20** |
//! | 3. Mật độ thoại (STT) | [`DialogLine`] | **0,30** |
//!
//! Cộng thêm **hình phạt "loading"**: đoạn gần như im lặng hoàn toàn mà không có thoại
//! (đang tải, đang pause, menu) bị nhân `0,25` để không lọt vào bản recap.
//!
//! Đầu ra là [`SceneSegment`] — đổi sang kiểu mà `allocate` cần bằng
//! [`SceneSegment::to_candidate`] (`score` 0–1, càng cao càng đáng giữ).
//!
//! **Chia đoạn**: mốc cắt cảnh từ ffmpeg (`scdet`, đã lấy mẫu 2 khung/giây ⇒ sai số
//! ±0,5 s) + 2 đầu video. Đoạn ngắn hơn [`SceneInput::min_segment_secs`] (mặc định
//! 1,5 s) bị **gộp vào đoạn liền trước** (hoặc vào đoạn sau nếu nó đứng đầu video) — vì
//! recap không dùng được mẩu 0,3 s, mà cắt vụn cũng làm `allocate` khó ghép.

use serde::{Deserialize, Serialize};

use super::allocate::SceneCandidate;
use super::junk_filter::DialogLine;
use super::probe::{LetterboxRange, SilenceRange};

/// Trọng số tầng dải đen (dấu hiệu mạnh nhất của cutscene điện ảnh).
pub const W_LETTERBOX: f64 = 0.50;
/// Trọng số tầng phụ đề cứng.
pub const W_HARDSUB: f64 = 0.20;
/// Trọng số tầng mật độ thoại.
pub const W_DIALOGUE: f64 = 0.30;

/// Dải đen chiếm ≥ 15 % chiều cao ⇒ coi là "letterbox đầy đủ" (điểm tối đa tầng 1).
const LETTERBOX_FULL_AT: f64 = 0.15;
/// Mật độ thoại đạt mức này ⇒ điểm tối đa tầng 3 (`density = giây thoại / giây đoạn`).
const DIALOGUE_FULL_DENSITY: f64 = 0.35;
/// Đoạn im lặng ≥ 80 % thời lượng và gần như không thoại ⇒ nghi "loading".
const LOADING_SILENCE_COVER: f64 = 0.80;
const LOADING_MAX_DIALOGUE_DENSITY: f64 = 0.02;
/// Hệ số phạt đoạn nghi "loading".
const LOADING_PENALTY: f64 = 0.25;
/// Đoạn ngắn mặc định bị gộp (giây).
pub const DEFAULT_MIN_SEGMENT_SECS: f64 = 1.5;
/// Hai mốc cắt sát nhau hơn mức này bị coi là một (giây).
const MIN_CUT_GAP_SECS: f64 = 0.10;

/// Đầu vào để chấm điểm **một** video nguồn.
pub struct SceneInput<'a> {
    /// Chỉ số video nguồn (0-based) — gán vào [`SceneSegment::source_idx`].
    pub source_idx: usize,
    /// Thời lượng video (giây).
    pub duration: f64,
    /// Mốc cắt cảnh từ `probe` ([`super::probe::VideoFeatures::cuts`]).
    pub cuts: &'a [f64],
    /// Khoảng có dải đen.
    pub letterbox: &'a [LetterboxRange],
    /// Khoảng im lặng.
    pub silence: &'a [SilenceRange],
    /// Câu thoại STT của video này.
    pub dialogue: &'a [DialogLine],
    /// Khoảng có phụ đề cứng (dò v0.14: `HardsubResult::spans`).
    pub hardsub: &'a [(f64, f64)],
    /// Đoạn ngắn hơn mức này bị gộp (giây).
    pub min_segment_secs: f64,
}

impl<'a> SceneInput<'a> {
    /// Đầu vào rỗng (chưa có tín hiệu nào) cho một video nguồn.
    pub fn new(source_idx: usize, duration: f64) -> Self {
        Self {
            source_idx,
            duration,
            cuts: &[],
            letterbox: &[],
            silence: &[],
            dialogue: &[],
            hardsub: &[],
            min_segment_secs: DEFAULT_MIN_SEGMENT_SECS,
        }
    }
}

/// Đặc trưng đo được của một đoạn — giữ lại để UI giải thích "vì sao đoạn này điểm cao".
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneFeatures {
    /// Tỉ lệ thời lượng đoạn có dải đen (0–1).
    pub letterbox_cover: f64,
    /// Độ "đậm" của dải đen (0 = không đáng kể, 1 = ≥ 15 % chiều cao).
    pub letterbox_strength: f64,
    /// Tỉ lệ thời lượng có phụ đề cứng (0–1).
    pub hardsub_cover: f64,
    /// Giây thoại / giây đoạn (0–1).
    pub dialogue_density: f64,
    /// Tỉ lệ thời lượng im lặng (0–1).
    pub silence_cover: f64,
}

/// Một đoạn cảnh đã chấm điểm.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneSegment {
    pub source_idx: usize,
    pub start: f64,
    pub end: f64,
    /// Điểm cutscene 0–1 (cao = đáng giữ).
    pub score: f64,
    pub features: SceneFeatures,
}

impl SceneSegment {
    pub fn duration(&self) -> f64 {
        (self.end - self.start).max(0.0)
    }

    /// Đổi sang kiểu ứng viên mà [`super::allocate`] nhận.
    pub fn to_candidate(&self) -> SceneCandidate {
        SceneCandidate {
            source_idx: self.source_idx,
            start: self.start,
            end: self.end,
            score: self.score,
        }
    }
}

/// Chia video thành các đoạn cảnh và chấm điểm cutscene từng đoạn.
pub fn score_scenes(input: &SceneInput<'_>) -> Vec<SceneSegment> {
    if !input.duration.is_finite() || input.duration <= 0.0 {
        return Vec::new();
    }
    let mut spans = merge_short(segment_spans(input), input.min_segment_secs.max(0.1));
    if spans.is_empty() {
        spans.push((0.0, input.duration));
    }

    let segments: Vec<SceneSegment> = spans
        .into_iter()
        .map(|(start, end)| {
            let features = features_of(input, start, end);
            SceneSegment {
                source_idx: input.source_idx,
                start,
                end,
                score: score_of(&features),
                features,
            }
        })
        .collect();
    tracing::debug!(
        source = input.source_idx,
        segments = segments.len(),
        "lab: đã chấm điểm cảnh"
    );
    segments
}

/// Mốc chia: 0 → các mốc cắt hợp lệ → thời lượng.
fn segment_spans(input: &SceneInput<'_>) -> Vec<(f64, f64)> {
    let mut bounds = vec![0.0];
    let mut cuts: Vec<f64> = input
        .cuts
        .iter()
        .copied()
        .filter(|time| time.is_finite() && *time > MIN_CUT_GAP_SECS && *time < input.duration)
        .collect();
    cuts.sort_by(f64::total_cmp);
    for cut in cuts {
        let last = bounds.last().copied().unwrap_or(0.0);
        if cut - last >= MIN_CUT_GAP_SECS && input.duration - cut >= MIN_CUT_GAP_SECS {
            bounds.push(cut);
        }
    }
    bounds.push(input.duration);
    bounds.windows(2).map(|pair| (pair[0], pair[1])).collect()
}

/// Gộp đoạn ngắn hơn `min` vào đoạn liền trước (hoặc vào đoạn sau nếu đứng đầu video).
fn merge_short(spans: Vec<(f64, f64)>, min: f64) -> Vec<(f64, f64)> {
    let mut out: Vec<(f64, f64)> = Vec::new();
    let mut carry: Option<f64> = None;
    for (start, end) in spans {
        let start = carry.take().unwrap_or(start);
        if end - start < min {
            match out.last_mut() {
                Some(last) => last.1 = end,
                None => carry = Some(start),
            }
        } else {
            out.push((start, end));
        }
    }
    out
}

fn features_of(input: &SceneInput<'_>, start: f64, end: f64) -> SceneFeatures {
    let length = (end - start).max(1e-9);

    let mut letterbox_secs = 0.0;
    let mut visible_weighted = 0.0;
    for range in input.letterbox {
        let overlap = overlap(start, end, range.start, range.end);
        if overlap > 0.0 {
            letterbox_secs += overlap;
            visible_weighted += overlap * range.visible_ratio;
        }
    }
    let letterbox_cover = (letterbox_secs / length).clamp(0.0, 1.0);
    let letterbox_strength = if letterbox_secs > 0.0 {
        let visible = (visible_weighted / letterbox_secs).clamp(0.0, 1.0);
        ((1.0 - visible) / LETTERBOX_FULL_AT).clamp(0.0, 1.0)
    } else {
        0.0
    };

    let hardsub_cover = (coverage(input.hardsub.iter().copied(), start, end) / length).clamp(0.0, 1.0);
    let dialogue_secs = coverage(
        input.dialogue.iter().map(|line| (line.start, line.end)),
        start,
        end,
    );
    let silence_cover = (coverage(
        input.silence.iter().map(|range| (range.start, range.end)),
        start,
        end,
    ) / length)
        .clamp(0.0, 1.0);

    SceneFeatures {
        letterbox_cover,
        letterbox_strength,
        hardsub_cover,
        dialogue_density: (dialogue_secs / length).clamp(0.0, 1.0),
        silence_cover,
    }
}

fn score_of(features: &SceneFeatures) -> f64 {
    let letterbox = W_LETTERBOX * features.letterbox_cover * features.letterbox_strength;
    let hardsub = W_HARDSUB * features.hardsub_cover;
    let dialogue =
        W_DIALOGUE * (features.dialogue_density / DIALOGUE_FULL_DENSITY).clamp(0.0, 1.0);
    let mut score = letterbox + hardsub + dialogue;

    if features.silence_cover >= LOADING_SILENCE_COVER
        && features.dialogue_density <= LOADING_MAX_DIALOGUE_DENSITY
    {
        score *= LOADING_PENALTY;
    }
    score.clamp(0.0, 1.0)
}

/// Độ dài phần giao của 2 khoảng (giây).
fn overlap(a_start: f64, a_end: f64, b_start: f64, b_end: f64) -> f64 {
    (a_end.min(b_end) - a_start.max(b_start)).max(0.0)
}

/// Tổng thời lượng `[start, end)` phủ bởi các khoảng (giả định các khoảng không chồng nhau).
fn coverage(ranges: impl Iterator<Item = (f64, f64)>, start: f64, end: f64) -> f64 {
    ranges
        .map(|(range_start, range_end)| overlap(start, end, range_start, range_end))
        .sum()
}

// TODO(C2.x): tầng 2 "mất HUD" của `docs/GAME_RECAP_RESEARCH.md` §4.1 cần so ảnh (phát
// hiện minimap/thanh máu/tâm ngắm) — chưa làm trong C2 vì phải trích khung + so sánh ảnh;
// khi làm sẽ cộng thêm 1 trọng số âm cho đoạn còn HUD (gameplay thường).

#[cfg(test)]
#[path = "cutscene_tests.rs"]
mod cutscene_tests;
