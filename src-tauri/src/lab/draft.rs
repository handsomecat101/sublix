//! TSK-LAB-C4 — kiểu + phần **thuần** của bước C (dựng video nháp).
//!
//! File này giữ: tuỳ chọn/kết quả, đoạn đã dựng, **timeline cộng dồn** (vị trí trên
//! video nháp), tách câu dài, đổi mục bước B → đầu vào `allocate`.
//!
//! Tách riêng (mỗi file < 300 dòng):
//! - [`super::draft_plan`] — chuyển `LabAnalysis` → cảnh ứng viên / vùng rác + gọi `allocate`.
//! - [`super::draft_tts`] — TTS thật + đo thời lượng file.
//! - [`super::draft_build`] — luồng dựng (TTS → allocate → timeline → ffmpeg → Studio).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::allocate::{KeepOriginalRequest, NarrationLine};
use super::recap_script::RecapItem;

/// Tuỳ chọn dựng video nháp.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftOptions {
    /// Voice id (tiền tố engine: `kokoro:`, `vietneu:`, `zerotts:`, `en-US-…`…).
    pub voice: String,
    /// Tốc độ đọc (`+0%`, `+10%`…).
    #[serde(default)]
    pub rate: String,
    /// Cao độ (`+0Hz`…).
    #[serde(default)]
    pub pitch: String,
    /// Tỷ lệ tiếng gốc (0.0–1.0).
    #[serde(default)]
    pub original_ratio: f64,
    /// Thư mục làm việc (file TTS tạm); `None` ⇒ thư mục dữ liệu của app.
    #[serde(default)]
    pub work_dir: Option<String>,
}

impl Default for DraftOptions {
    fn default() -> Self {
        Self {
            voice: String::new(),
            rate: "+0%".to_string(),
            pitch: "+0Hz".to_string(),
            original_ratio: 0.3,
            work_dir: None,
        }
    }
}

/// Kết quả dựng (UI bước C).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftResult {
    /// Các mục đã dựng (kèm `ttsSecs` thật).
    pub items: Vec<RecapItem>,
    /// Tổng thời lượng video nháp (giây).
    pub total_sec: f64,
    /// Đã qua hết luật dựng chưa.
    pub rules_passed: bool,
    /// Số vi phạm còn lại (cần người dùng xử lý).
    pub warnings_count: u32,
    /// Câu chưa tìm được cảnh.
    pub unplaced: Vec<String>,
}

/// Một mục đã dựng + file TTS tương ứng.
#[derive(Debug, Clone, PartialEq)]
pub struct DraftSegment {
    /// Mục trong kịch bản.
    pub item: RecapItem,
    /// File TTS (rỗng với đoạn giữ tiếng gốc).
    pub tts_path: Option<PathBuf>,
    /// Các clip nguồn đã ghép (nguồn, từ, đến).
    pub clips: Vec<(usize, f64, f64)>,
    /// Vị trí bắt đầu trên video nháp (giây) — tính sau khi ghép.
    pub timeline_start: f64,
}

/// Độ dài đoạn trên video nháp: lời bình = `max(tts, clip)`, thoại gốc = clip.
pub fn segment_length(segment: &DraftSegment) -> f64 {
    let clip_len = clips_length(segment);
    if segment.item.keep_original {
        clip_len.max(0.1)
    } else {
        segment.item.tts_secs.unwrap_or(0.0).max(clip_len).max(0.1)
    }
}

fn clips_length(segment: &DraftSegment) -> f64 {
    segment
        .clips
        .iter()
        .map(|(_, start, end)| (end - start).max(0.0))
        .sum()
}

/// Tính timeline (vị trí cộng dồn) cho các mục đã dựng.
pub fn build_timeline(segments: &[DraftSegment]) -> Vec<DraftSegment> {
    let mut out: Vec<DraftSegment> = Vec::with_capacity(segments.len());
    let mut cursor = 0.0f64;
    for segment in segments {
        let mut item = segment.clone();
        item.timeline_start = cursor;
        cursor += segment_length(segment);
        out.push(item);
    }
    out
}

/// Tổng thời lượng video nháp (giây).
pub fn timeline_total(segments: &[DraftSegment]) -> f64 {
    match segments.last() {
        Some(last) => last.timeline_start + segment_length(last),
        None => 0.0,
    }
}

/// Tách câu lời bình quá dài thành nhiều phần ≤ `max_chars` (cắt tại ranh giới câu).
pub fn auto_split_long(text: &str, max_chars: usize) -> Vec<String> {
    if text.chars().count() <= max_chars {
        return vec![text.trim().to_string()]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect();
    }
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();
    for sentence in split_sentences_of(text) {
        if !current.is_empty() && current.chars().count() + sentence.chars().count() > max_chars {
            out.push(std::mem::take(&mut current));
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(&sentence);
    }
    if !current.trim().is_empty() {
        out.push(current);
    }
    out
}

fn split_sentences_of(text: &str) -> Vec<String> {
    super::narration::split_sentences(text)
}

/// Đổi mục bước B ⇒ câu lời bình cho `allocate` (bỏ đoạn giữ tiếng gốc).
///
/// `tts_secs` chưa đo được thì lấy ước lượng theo công thức của prompt.
pub fn to_narration_lines(items: &[RecapItem]) -> Vec<NarrationLine> {
    items
        .iter()
        .filter(|item| !item.keep_original)
        .map(|item| NarrationLine {
            id: item.id,
            text: item.narration.clone(),
            tts_secs: match item.tts_secs {
                Some(secs) if secs > 0.0 => secs,
                _ => super::narration::estimate_tts_secs(&item.narration),
            },
            source_idx: item.source_idx,
            hint_start: item.start,
            hint_end: item.end,
        })
        .collect()
}

/// Vùng giữ tiếng gốc (theo mục `keep_original`).
pub fn to_keep_original(items: &[RecapItem]) -> Vec<KeepOriginalRequest> {
    items
        .iter()
        .filter(|item| item.keep_original)
        .map(|item| KeepOriginalRequest {
            source_idx: item.source_idx,
            start: item.start,
            end: item.end,
        })
        .collect()
}

/// Parse `"HH:MM:SS - HH:MM:SS"` (hoặc `→`) ⇒ `(start, end)` giây.
pub fn parse_range(text: &str) -> Option<(f64, f64)> {
    let normalized = text.replace('→', "-");
    let parts: Vec<&str> = normalized.split('-').collect();
    if parts.len() < 2 {
        return None;
    }
    let start = parse_clock(parts[0])?;
    let end = parse_clock(parts[1])?;
    if end <= start {
        return None;
    }
    Some((start, end))
}

/// Parse một mốc thời gian `HH:MM:SS`.
fn parse_clock(text: &str) -> Option<f64> {
    let cleaned: String = text
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == ':' || *c == '.' || *c == ',')
        .collect();
    let cleaned = cleaned.replace(',', ".");
    let mut parts = cleaned.split(':').rev();
    let seconds = parts.next()?.parse::<f64>().ok()?;
    let minutes = parts
        .next()
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(0.0);
    let hours = parts
        .next()
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(0.0);
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

#[cfg(test)]
#[path = "draft_tests.rs"]
mod draft_tests;
