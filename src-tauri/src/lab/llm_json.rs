//! TSK-LAB-C3 — parser JSON **khoan dung** cho câu trả lời LLM.
//!
//! LLM hay trả về JSON kèm rác quanh: fence ```` ```json … ``` ````, lời dẫn
//! ("Dưới đây là JSON:"), hoặc giải thích sau khối JSON. Parser ở đây:
//! 1. bỏ fence markdown,
//! 2. tìm khối `{ … }` **đầu tiên** cân bằng ngoặc (bỏ qua dấu `"` và `\`),
//! 3. deserialize — mọi trường không bắt buộc đều có `default` ⇒ LLM thiếu
//!    trường vẫn ra kết quả dùng được.
//!
//! **Thuần** (không I/O) ⇒ test được không cần mạng.

use serde::{Deserialize, Serialize};

/// Tách khối JSON đầu tiên (`{…}`) khỏi câu trả lời LLM.
///
/// Bỏ qua: fence ```` ```json ````, lời dẫn trước, giải thích sau.
pub fn extract_json_object(raw: &str) -> Option<String> {
    let text = strip_code_fence(raw);
    let bytes = text.as_bytes();
    let start = text.find('{')?;

    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (offset, byte) in bytes.iter().enumerate().skip(start) {
        let ch = *byte as char;
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(text[start..=offset].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

/// Bỏ fence markdown ```` ```json … ``` ```` (nếu có) + cắt khoảng trắng thừa.
fn strip_code_fence(raw: &str) -> String {
    let trimmed = raw.trim();
    if !trimmed.starts_with("```") {
        return trimmed.to_string();
    }
    // Bỏ dòng mở fence đầu tiên.
    let after_open = match trimmed.find('\n') {
        Some(index) => &trimmed[index + 1..],
        None => return trimmed.to_string(),
    };
    // Cắt tới fence đóng (nếu có).
    match after_open.find("```") {
        Some(index) => after_open[..index].to_string(),
        None => after_open.to_string(),
    }
}

/// Một nhân vật do LLM trả về.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LlmCharacter {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub subtitle_name: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub motivation: String,
}

/// Một chương do LLM trả về.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LlmChapter {
    #[serde(default)]
    pub chapter_idx: i64,
    #[serde(default)]
    pub source_idx: i64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub time_range: String,
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub core_event: String,
    #[serde(default)]
    pub narrative_function: String,
}

/// Kết quả phân tích của LLM cho **một cụm thoại**.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LlmAnalysis {
    #[serde(default)]
    pub game_title: String,
    #[serde(default)]
    pub overall_summary: String,
    #[serde(default)]
    pub characters: Vec<LlmCharacter>,
    #[serde(default)]
    pub chapters: Vec<LlmChapter>,
}

/// Parse câu trả lời LLM ⇒ [`LlmAnalysis`].
///
/// `Err` khi không tìm được khối JSON hoặc JSON sai cấu trúc.
pub fn parse_analysis(raw: &str) -> Result<LlmAnalysis, String> {
    let json = extract_json_object(raw).ok_or_else(|| {
        "LLM không trả về khối JSON hợp lệ (có thể bị cắt ngắn hoặc bị chặn)".to_string()
    })?;
    serde_json::from_str::<LlmAnalysis>(&json)
        .map_err(|e| format!("JSON của LLM không đúng cấu trúc: {e}"))
}

#[cfg(test)]
#[path = "llm_json_tests.rs"]
mod llm_json_tests;
