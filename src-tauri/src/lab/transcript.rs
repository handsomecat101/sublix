//! TSK-LAB-C3 — **thoại** (transcript) + **chia cụm** theo thời gian.
//!
//! Nguồn thoại, theo thứ tự ưu tiên:
//! 1. **Dự án Studio đã nhận dạng** → dùng `segments` có sẵn (không STT lại).
//! 2. **Cache** của lần phân tích trước (cùng file ⇒ cùng khoá).
//! 3. **Phụ đề `.srt` có sẵn** cạnh video (đọc bằng bộ đọc SRT sẵn có).
//! 4. **Luồng nhận dạng sẵn có** của app (đúng engine STT người dùng chọn trong
//!    Cài đặt) — **không** viết STT mới ở đây.
//!
//! `chunk_by_time` là **thuần** (chia thoại thành cụm ~8–10 phút để vừa giới
//! hạn ngữ cảnh LLM) ⇒ test được không cần video.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::junk_filter::DialogLine;

/// Một câu thoại kèm chỉ số video nguồn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptLine {
    /// Video nguồn (0-based).
    pub source_idx: usize,
    /// Bắt đầu (giây).
    pub start: f64,
    /// Kết thúc (giây).
    pub end: f64,
    /// Nội dung câu.
    pub text: String,
}

/// Một cụm thoại (đơn vị gửi cho LLM).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptChunk {
    pub source_idx: usize,
    /// Bắt đầu cụm (giây).
    pub start: f64,
    /// Kết thúc cụm (giây).
    pub end: f64,
    /// Các câu trong cụm.
    pub lines: Vec<TranscriptLine>,
}

/// Thời lượng tối đa của 1 cụm (giây) — ~10 phút.
pub const DEFAULT_CHUNK_SECS: f64 = 600.0;

/// Chuyển sang [`DialogLine`] của lớp lọc rác (C1).
pub fn to_dialog_lines(lines: &[TranscriptLine]) -> Vec<DialogLine> {
    lines
        .iter()
        .map(|line| DialogLine {
            start: line.start,
            end: line.end,
            text: line.text.clone(),
        })
        .collect()
}

/// Lấy thoại từ **dự án Studio** đã nhận dạng (dùng `segments` có sẵn).
pub fn lines_from_project(project: &crate::dubbing::DubbingProject, source_idx: usize) -> Vec<TranscriptLine> {
    project
        .segments
        .iter()
        .map(|segment| TranscriptLine {
            source_idx,
            start: segment.start_sec,
            end: segment.end_sec,
            text: segment.original_text.clone(),
        })
        .filter(|line| line.end > line.start && !line.text.trim().is_empty())
        .collect()
}

/// Lấy thoại từ file phụ đề `.srt` (dùng bộ đọc SRT sẵn có của app).
pub fn lines_from_srt(path: &Path, source_idx: usize) -> Result<Vec<TranscriptLine>, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Đọc phụ đề {} thất bại: {e}", path.display()))?;
    Ok(lines_from_srt_content(&content, source_idx))
}

/// Chuyển nội dung SRT ⇒ [`TranscriptLine`] (thuần).
pub fn lines_from_srt_content(content: &str, source_idx: usize) -> Vec<TranscriptLine> {
    crate::file_sub::parse_srt_content(content)
        .into_iter()
        .filter_map(|segment| {
            let start = parse_srt_time(&segment.start_time);
            let end = parse_srt_time(&segment.end_time);
            if end <= start || segment.original.trim().is_empty() {
                return None;
            }
            Some(TranscriptLine {
                source_idx,
                start,
                end,
                text: segment.original.clone(),
            })
        })
        .collect()
}

/// Đổi `HH:MM:SS,mmm` ⇒ giây.
pub fn parse_srt_time(text: &str) -> f64 {
    let normalized = text.trim().replace(',', ".");
    let mut parts = normalized.split(':').rev();
    let seconds = parts.next().and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
    let minutes = parts.next().and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
    let hours = parts.next().and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
    hours * 3600.0 + minutes * 60.0 + seconds
}

/// Chia thoại thành các cụm theo **thời lượng** (mỗi cụm ≤ `max_secs`).
///
/// Câu vượt quá `max_secs` vẫn tạo cụm riêng (không cắt câu) — ưu tiên giữ câu
/// nguyên vẹn cho LLM hiểu ngữ cảnh.
pub fn chunk_by_time(lines: &[TranscriptLine], max_secs: f64) -> Vec<TranscriptChunk> {
    let limit = if max_secs > 0.0 { max_secs } else { DEFAULT_CHUNK_SECS };
    let mut chunks: Vec<TranscriptChunk> = Vec::new();

    for line in lines {
        let fits = match chunks.last() {
            Some(last) => {
                last.source_idx == line.source_idx && line.end - last.start <= limit
            }
            // Chưa có cụm nào ⇒ câu này mở cụm đầu tiên.
            None => false,
        };
        if fits {
            if let Some(last) = chunks.last_mut() {
                last.end = last.end.max(line.end);
                last.lines.push(line.clone());
            }
        } else {
            chunks.push(TranscriptChunk {
                source_idx: line.source_idx,
                start: line.start,
                end: line.end,
                lines: vec![line.clone()],
            });
        }
    }
    chunks
}

/// Render cụm thoại thành văn bản cho LLM (mỗi câu 1 dòng, có mốc thời gian).
pub fn render_chunk(chunk: &TranscriptChunk) -> String {
    let mut out = String::new();
    for line in &chunk.lines {
        out.push_str(&format!(
            "[{:02}:{:02}:{:02}.{:03}-{:02}:{:02}:{:02}.{:03}] {}\n",
            (line.start / 3600.0) as u32,
            ((line.start % 3600.0) / 60.0) as u32,
            (line.start % 60.0) as u32,
            ((line.start - line.start.floor()) * 1000.0) as u32,
            (line.end / 3600.0) as u32,
            ((line.end % 3600.0) / 60.0) as u32,
            (line.end % 60.0) as u32,
            ((line.end - line.end.floor()) * 1000.0) as u32,
            line.text.trim(),
        ));
    }
    out
}

#[cfg(test)]
#[path = "transcript_tests.rs"]
mod transcript_tests;
