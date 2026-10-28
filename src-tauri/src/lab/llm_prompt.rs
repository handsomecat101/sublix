//! TSK-LAB-C3 — dựng prompt + gọi LLM để **tóm tắt chương**.
//!
//! - Template: `prompts/recap_analyze.md` (prompt R2 của Xưởng AI, kế thừa MIT —
//!   xem `prompts/LICENSE-NarratoAI.txt`), nhúng bằng `include_str!`.
//! - Gọi LLM qua **hạ tầng dịch sẵn có** (`translate::server::chat_completion_custom`)
//!   ⇒ dùng provider người dùng đã cấu hình, không thêm provider/API key mới.
//! - LLM lỗi ⇒ **thử lại 1 lần** rồi trả lỗi (bước gộp sẽ ghi chương
//!   "chưa tóm tắt được" — **không** làm hỏng cả lần chạy).

use crate::config::AppConfig;

use super::llm_json::{parse_analysis, LlmAnalysis};

/// Template prompt phân tích (R2).
pub const ANALYZE_PROMPT: &str = include_str!("prompts/recap_analyze.md");

/// Timeout gọi LLM (giây) — 1 cụm thoại (~10 phút) cần LLM đọc kỹ.
pub const LLM_TIMEOUT_SECS: u64 = 180;

/// Thay `${key}` trong template bằng giá trị.
pub fn fill_prompt(template: &str, values: &[(&str, &str)]) -> String {
    let mut out = template.to_string();
    for (key, value) in values {
        out = out.replace(&format!("${{{key}}}"), value);
    }
    out
}

/// Dựng nội dung user prompt cho 1 cụm thoại.
pub fn build_user_prompt(
    game_name: &str,
    game_genre: &str,
    supplementary_context: &str,
    subtitle_content: &str,
) -> String {
    fill_prompt(
        ANALYZE_PROMPT,
        &[
            ("game_name", game_name),
            ("game_genre", game_genre),
            ("supplementary_context", supplementary_context),
            ("subtitle_content", subtitle_content),
        ],
    )
}

/// Tóm tắt 1 cụm thoại bằng LLM.
///
/// Thử lại **1 lần** khi lỗi (lỗi mạng/lỗi JSON) rồi trả lỗi.
pub fn summarize_chunk(
    cfg: &AppConfig,
    user_prompt: &str,
    on_retry: &mut dyn FnMut(),
) -> Result<LlmAnalysis, String> {
    let provider = cfg.translation_provider.trim();
    let model = crate::translate::contextual_chunk::model_for(cfg, provider);
    let system = "Bạn là nhà phân tích cốt truyện game. Trả về DUY NHẤT JSON hợp lệ, không markdown, không giải thích.";
    let mut last_error = String::new();

    for attempt in 0..2 {
        if attempt > 0 {
            on_retry();
        }
        match crate::translate::server::chat_completion_custom(
            cfg,
            provider,
            model,
            system,
            user_prompt,
            LLM_TIMEOUT_SECS,
        ) {
            Ok(raw) => {
                match parse_analysis(&raw) {
                    Ok(analysis) => return Ok(analysis),
                    Err(err) => last_error = err,
                }
            }
            Err(err) => last_error = format!("{err:#}"),
        }
    }
    Err(last_error)
}

#[cfg(test)]
#[path = "llm_prompt_tests.rs"]
mod llm_prompt_tests;
