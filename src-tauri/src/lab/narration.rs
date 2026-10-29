//! TSK-LAB-C4 — **bước B: viết lời bình** (theo từ chương) + **viết lại đoạn**.
//!
//! - LLM viết lời bình **văn bản thuần** cho từ chương (prompt `recap_narration.md`).
//! - Tách lời bình thành các **đoạn 1–3 câu** (mỗi đoạn 1 mục `RecapItem` —
//!   đúng kiểu UI bước B).
//! - **Gợi ý chỗ chèn thoại gốc**: chọn câu STT hay nhất trong chương, đánh dấu
//!   `keep_original = true`.
//! - Ước lượng thời lượng đọc theo công thức của prompt: `số từ / 4.5` giây.
//!
//! Dùng **provider dịch người dùng đã cấu hình** (không thêm provider/API key).

use serde::{Deserialize, Serialize};

use super::llm_prompt::fill_prompt;
use super::recap_script::RecapItem;
use super::transcript::TranscriptLine;

/// Template prompt viết lời bình (R2).
pub const NARRATION_PROMPT: &str = include_str!("prompts/recap_narration.md");

/// Timeout gọi LLM (giây).
pub const LLM_TIMEOUT_SECS: u64 = 180;

/// Tối đa số câu trong 1 đoạn lời bình (1–3 theo đặc tả).
pub const MAX_SENTENCES_PER_SEGMENT: usize = 3;

/// Tuỳ chọn bước B.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationOptions {
    /// Tên game (đưa vào prompt).
    #[serde(default)]
    pub game_name: String,
    /// Thể loại game.
    #[serde(default)]
    pub game_genre: String,
    /// Thời lượng đích của video nháp (giây) — dùng để cân bằng số đoạn.
    #[serde(default)]
    pub target_duration_sec: f64,
    /// Tỷ lệ tiếng gốc mong muốn (0.0–1.0).
    #[serde(default)]
    pub original_ratio: f64,
}

/// Chế độ viết lại 1 đoạn (ô "Viết lại đoạn" của UI).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RewriteMode {
    /// Ngắn lại.
    Shorter,
    /// Kịch tính hơn.
    Dramatic,
    /// Đơn giản, dễ hiểu hơn.
    Simpler,
    /// Câu nối giữa 2 chương.
    Bridge,
}

impl RewriteMode {
    /// Nhãn tiếng Việt cho UI.
    pub fn label(self) -> &'static str {
        match self {
            Self::Shorter => "Ngắn hơn",
            Self::Dramatic => "Kịch tính hơn",
            Self::Simpler => "Đơn giản hơn",
            Self::Bridge => "Câu nối",
        }
    }

    /// Câu lệnh cho LLM.
    fn instruction(self) -> &'static str {
        match self {
            Self::Shorter => "Viết LẠI câu này NGẮN HƠN, giữ nguyên ý chính, tối đa 1 câu.",
            Self::Dramatic => "Viết LẠI câu này KỊCH TÍNH HƠN, dùng từ mạnh, vẫn đúng sự kiện.",
            Self::Simpler => "Viết LẠI câu này ĐƠN GIẢN, dễ hiểu, không đổi nghĩa.",
            Self::Bridge => "Viết 1 CÂU NỐI ngắn nối 2 chương, không thêm sự kiện mới.",
        }
    }
}

// ───────────────────────────── Hàm thuần ─────────────────────────────

/// Tách văn bản lời bình thành các đoạn **1–3 câu**.
///
/// Câu được tính theo dấu `.`, `!`, `?` (kể cả dấu tiếng Việt). Đoạn quá dài
/// bị tách tiếp; đoạn rỗng bị bỏ.
pub fn split_into_segments(text: &str, max_sentences: usize) -> Vec<String> {
    let limit = max_sentences.clamp(1, 6);
    let sentences = split_sentences(text);
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut count = 0usize;

    for sentence in sentences {
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(&sentence);
        count += 1;
        if count >= limit {
            out.push(std::mem::take(&mut current));
            count = 0;
        }
    }
    if !current.trim().is_empty() {
        out.push(current);
    }
    out
}

/// Tách văn bản thành câu (bỏ khoảng trắng thừa, giữ dấu câu cuối câu).
pub fn split_sentences(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if matches!(ch, '.' | '!' | '?' | '。' | '！' | '？') {
            let trimmed = current.trim().to_string();
            if trimmed.chars().any(|c| c.is_alphanumeric()) {
                out.push(trimmed);
            }
            current.clear();
        }
    }
    let tail = current.trim();
    if !tail.is_empty() && tail.chars().any(|c| c.is_alphanumeric()) {
        out.push(tail.to_string());
    }
    out
}

/// Ước lượng thời lượng đọc (giây) theo công thức của prompt: `số từ / 4.5`.
pub fn estimate_tts_secs(text: &str) -> f64 {
    let words = text.split_whitespace().count();
    if words == 0 {
        return 0.0;
    }
    words as f64 / 4.5
}

/// Câu thoại hay nhất trong khoảng thời gian (dài nhất ⇒ nhiều thông tin nhất).
pub fn pick_best_original_line(
    lines: &[TranscriptLine],
    source_idx: usize,
    start: f64,
    end: f64,
) -> Option<TranscriptLine> {
    lines
        .iter()
        .filter(|line| line.source_idx == source_idx && line.start >= start && line.end <= end)
        .filter(|line| line.text.trim().chars().count() >= 8)
        .max_by(|a, b| {
            let len_a = a.text.trim().chars().count();
            let len_b = b.text.trim().chars().count();
            len_a.cmp(&len_b).then(a.start.partial_cmp(&b.start).unwrap_or(std::cmp::Ordering::Equal))
        })
        .cloned()
}

/// Chia khoảng thời gian của chương thành `count` khoảng bằng nhau.
pub fn distribute_range(start: f64, end: f64, count: usize) -> Vec<(f64, f64)> {
    let count = count.max(1);
    let span = (end - start).max(0.0);
    let step = span / count as f64;
    (0..count)
        .map(|index| {
            let from = start + step * index as f64;
            let to = if index + 1 == count { end } else { from + step };
            (from, to)
        })
        .collect()
}

/// Bỏ dấu tiếng Việt + viết thường (so khớp tên trong lời bình).
pub fn fold_for_compare(text: &str) -> String {
    super::junk_filter::fold(text)
}

/// Tìm câu trong lời bình có chứa từ khoá (dùng để gợi ý cắt thoại gốc).
pub fn mentions(text: &str, keyword: &str) -> bool {
    let key = fold_for_compare(keyword);
    !key.is_empty() && fold_for_compare(text).contains(&key)
}

// ───────────────────────────── Gọi LLM ─────────────────────────────

/// System prompt cho LLM viết lời bình.
pub const NARRATION_SYSTEM: &str = "Bạn là người viết lời bình recap cốt truyện game. \
Trả về DUY NHẤT văn bản lời bình thuần (không JSON, không markdown, không tiêu đề).";

/// Gọi LLM với 1 system + 1 user prompt ⇒ trả về text thuần.
pub fn call_llm(cfg: &crate::config::AppConfig, system: &str, user: &str) -> Result<String, String> {
    let provider = cfg.translation_provider.trim();
    let model = crate::translate::contextual_chunk::model_for(cfg, provider);
    let raw = crate::translate::server::chat_completion_custom(
        cfg,
        provider,
        model,
        system,
        user,
        LLM_TIMEOUT_SECS,
    )
    .map_err(|e| format!("{e:#}"))?;
    Ok(clean_llm_text(&raw))
}

/// Bỏ rào markdown / tiêu đề thừa quanh câu trả lời.
pub fn clean_llm_text(raw: &str) -> String {
    let mut text = raw.trim().to_string();
    if text.starts_with("```") {
        if let Some(index) = text.find('\n') {
            text = text[index + 1..].to_string();
        }
        if let Some(index) = text.find("```") {
            text = text[..index].to_string();
        }
    }
    text.trim()
        .trim_start_matches('#')
        .trim()
        .trim_matches('"')
        .trim()
        .to_string()
}

/// Dựng user prompt viết lời bình cho 1 chương.
pub fn build_chapter_prompt(
    options: &NarrationOptions,
    chapter_title: &str,
    chapter_summary: &str,
    time_range: &str,
    dialogue: &[TranscriptLine],
) -> String {
    let mut subtitles = String::new();
    for line in dialogue {
        subtitles.push_str(&format!(
            "[{:02}:{:02}:{:02}] {}\n",
            (line.start / 3600.0) as u32,
            ((line.start % 3600.0) / 60.0) as u32,
            (line.start % 60.0) as u32,
            line.text.trim(),
        ));
    }
    fill_prompt(
        NARRATION_PROMPT,
        &[
            ("game_title", &options.game_name),
            ("game_genre", &options.game_genre),
            ("chapter_title", chapter_title),
            ("chapter_summary", chapter_summary),
            ("chapter_time_range", time_range),
            ("target_duration_sec", &format!("{:.0}", options.target_duration_sec)),
            ("original_sound_ratio", &format!("{:.0}", options.original_ratio * 100.0)),
            ("subtitle_content", &subtitles),
        ],
    )
}

/// Viết lại 1 đoạn (ô "Viết lại đoạn").
pub fn rewrite_segment(
    cfg: &crate::config::AppConfig,
    text: &str,
    mode: RewriteMode,
    hint: &str,
) -> Result<String, String> {
    let user = format!(
        "{}\n\nCâu cần viết lại:\n\"{}\"\n{}",
        mode.instruction(),
        text.trim(),
        if hint.trim().is_empty() {
            String::new()
        } else {
            format!("Gợi ý: {}", hint.trim())
        }
    );
    let out = call_llm(cfg, NARRATION_SYSTEM, &user)?;
    if out.trim().is_empty() {
        return Err("LLM trả về nội dung rỗng.".to_string());
    }
    Ok(out)
}

/// Kiểu kết quả bước B (UI dùng `RecapItem` của C1 — khớp `labModel.ts`).
pub type NarrationSegments = Vec<RecapItem>;

#[cfg(test)]
#[path = "narration_tests.rs"]
mod narration_tests;
