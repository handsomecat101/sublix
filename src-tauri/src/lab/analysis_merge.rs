//! TSK-LAB-C3 — **gộp** chương / nhân vật từ kết quả LLM (thuần).
//!
//! - Gộp nhân vật trùng tên qua **nhiều cụm** (cùng tên ⇒ 1 dòng + ghi chú).
//! - Dựng chương từ chương LLM + cụm thoại + cảnh + transcript
//!   (đếm cảnh/câu trùng khoảng thời gian).
//! - Gộp chương từ **nhiều cụm / nhiều nguồn**, đánh số lại 1..n.
//!
//! **Thuần** (không I/O) ⇒ test được không cần video/LLM.

use super::analysis_types::{LabChapter, LabCharacter, AVATAR_COLORS};
use super::cutscene::SceneSegment;
use super::llm_json::{LlmChapter, LlmCharacter};
use super::transcript::{TranscriptChunk, TranscriptLine};

/// Khoá so sánh tên nhân vật (bỏ dấu + viết thường + bỏ khoảng trắng).
pub fn normalize_name(name: &str) -> String {
    super::junk_filter::fold(name).replace(' ', "")
}

/// Đếm số câu thoại có chứa tên nhân vật.
pub fn count_lines_for(transcript: &[TranscriptLine], name: &str) -> u32 {
    let needle = normalize_name(name);
    if needle.is_empty() {
        return 0;
    }
    transcript
        .iter()
        .filter(|line| normalize_name(&line.text).contains(&needle))
        .count() as u32
}

/// Màu avatar theo thứ tự (xoay vòng).
pub fn avatar_color(index: usize) -> String {
    AVATAR_COLORS[index % AVATAR_COLORS.len()].to_string()
}

/// Rỗng ⇒ `None`.
fn nonempty(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

/// Gộp nhân vật từ **nhiều cụm** LLM (cùng tên ⇒ 1 dòng).
pub fn merge_characters(
    batches: &[Vec<LlmCharacter>],
    transcript: &[TranscriptLine],
) -> Vec<LabCharacter> {
    let mut order: Vec<String> = Vec::new();
    let mut roles: Vec<String> = Vec::new();
    let mut motivations: Vec<String> = Vec::new();
    let mut subtitles: Vec<String> = Vec::new();
    let mut hits: Vec<u32> = Vec::new();

    for batch in batches {
        for character in batch {
            let key = normalize_name(&character.name);
            if key.is_empty() {
                continue;
            }
            let position = match order.iter().position(|name| *name == key) {
                Some(index) => index,
                None => {
                    order.push(key);
                    roles.push(String::new());
                    motivations.push(String::new());
                    subtitles.push(String::new());
                    hits.push(0);
                    order.len() - 1
                }
            };
            if roles[position].is_empty() && !character.role.trim().is_empty() {
                roles[position] = character.role.trim().to_string();
            }
            if motivations[position].is_empty() && !character.motivation.trim().is_empty() {
                motivations[position] = character.motivation.trim().to_string();
            }
            if subtitles[position].is_empty() && !character.subtitle_name.trim().is_empty() {
                subtitles[position] = character.subtitle_name.trim().to_string();
            }
            hits[position] += 1;
        }
    }

    order
        .iter()
        .enumerate()
        .map(|(index, _)| {
            let name = batches
                .iter()
                .flat_map(|batch| batch.iter())
                .find(|character| normalize_name(&character.name) == *order[index])
                .map(|character| character.name.trim().to_string())
                .unwrap_or_default();
            let lines_count = count_lines_for(transcript, &roles[index])
                .max(count_lines_for(transcript, &name));
            LabCharacter {
                id: format!("c{}", index + 1),
                name,
                role: roles[index].clone(),
                lines_count,
                avatar_color: avatar_color(index),
                merged_notice: if hits[index] > 1 {
                    Some(format!("✓ đã gộp {} lần", hits[index]))
                } else {
                    None
                },
                motivation: nonempty(motivations[index].clone()),
                subtitle_name: nonempty(subtitles[index].clone()),
            }
        })
        .collect()
}

/// Parse khoảng thời gian `"00:00:15,000-00:03:45,000"` hoặc `"P1 00:00:15 → 00:18:30"`.
pub fn parse_time_range(text: &str) -> Option<(f64, f64)> {
    let normalized = text.replace('→', "-");
    let parts: Vec<&str> = normalized.split('-').collect();
    if parts.len() < 2 {
        return None;
    }
    let start = parse_clock(parts[0])?;
    let end = parse_clock(parts[1])?;
    if end < start {
        return None;
    }
    Some((start, end))
}

/// Bỏ tiền tố nhãn nguồn (`P1 `, `P2 `…) ở đầu mốc thời gian.
fn strip_source_prefix(text: &str) -> &str {
    let trimmed = text.trim_start();
    let mut chars = trimmed.chars();
    let Some(first) = chars.next() else {
        return trimmed;
    };
    if !first.eq_ignore_ascii_case(&'p') {
        return trimmed;
    }
    let rest = trimmed[first.len_utf8()..].trim_start();
    let digits = rest.chars().take_while(char::is_ascii_digit).count();
    if digits == 0 {
        return trimmed;
    }
    rest[digits..].trim_start()
}

/// Parse một mốc thời gian trong chuỗi (bỏ nhãn "P1", dấu phẩy → chấm).
///
/// `HH:MM:SS,mmm` ⇒ giây. Đọc **từ cuối** về (giây → phút → giờ).
fn parse_clock(text: &str) -> Option<f64> {
    let source = strip_source_prefix(text);
    let cleaned: String = source
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == ':' || *c == '.' || *c == ',')
        .collect();
    let cleaned = cleaned.replace(',', ".");
    if cleaned.is_empty() {
        return None;
    }
    let mut parts = cleaned.split(':').rev();
    let seconds = parts.next()?.parse::<f64>().ok()?;
    let minutes = parts.next().and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
    let hours = parts.next().and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

/// Số cảnh cutscene của `source_idx` trùng khoảng `[start, end]`.
pub fn count_scenes(scenes: &[SceneSegment], source_idx: usize, start: f64, end: f64) -> u32 {
    scenes
        .iter()
        .filter(|scene| scene.source_idx == source_idx && scene.start < end && start < scene.end)
        .count() as u32
}

/// Số câu thoại của `source_idx` trùng khoảng `[start, end]`.
pub fn count_lines(transcript: &[TranscriptLine], source_idx: usize, start: f64, end: f64) -> u32 {
    transcript
        .iter()
        .filter(|line| line.source_idx == source_idx && line.start < end && start < line.end)
        .count() as u32
}

/// Dựng 1 chương từ chương LLM + cụm thoại + cảnh + transcript.
pub fn build_chapter(
    id: i64,
    llm: &LlmChapter,
    chunk: &TranscriptChunk,
    scenes: &[SceneSegment],
    transcript: &[TranscriptLine],
) -> LabChapter {
    let source_idx = if llm.source_idx < 0 {
        chunk.source_idx
    } else {
        llm.source_idx as usize
    };
    let (start, end) = parse_time_range(&llm.time_range).unwrap_or((chunk.start, chunk.end));
    let mut summary = llm.core_event.trim().to_string();
    if !llm.narrative_function.trim().is_empty() {
        if !summary.is_empty() {
            summary.push_str(" · ");
        }
        summary.push_str(llm.narrative_function.trim());
    }
    LabChapter {
        id,
        source_idx,
        title: llm.title.trim().to_string(),
        summary,
        time_range: llm.time_range.trim().to_string(),
        duration_sec: (end - start).max(0.0),
        cutscenes_count: count_scenes(scenes, source_idx, start, end),
        lines_count: count_lines(transcript, source_idx, start, end),
        included: true,
        chapter_type: nonempty(llm.r#type.trim().to_string()),
        narrative_function: nonempty(llm.narrative_function.trim().to_string()),
    }
}

/// Gộp chương từ nhiều cụm (đánh số lại 1..n).
///
/// Mỗi phần tử là `(chương LLM, cụm thoại, cụm có LLM lỗi hay không)`.
pub fn merge_chapters(
    batches: &[(Vec<LlmChapter>, TranscriptChunk, bool)],
    scenes: &[SceneSegment],
    transcript: &[TranscriptLine],
) -> Vec<LabChapter> {
    let mut out: Vec<LabChapter> = Vec::new();
    for (chapters, chunk, _) in batches {
        for llm in chapters {
            let id = out.len() as i64 + 1;
            out.push(build_chapter(id, llm, chunk, scenes, transcript));
        }
    }
    out
}

#[cfg(test)]
#[path = "analysis_merge_tests.rs"]
mod analysis_merge_tests;
