//! Ánh xạ **mức độ suy luận** (reasoning effort) cho từng provider/model.
//!
//! Hợp đồng (coordinator chốt 2026-10-24):
//! - `config.llm_reasoning_effort` ∈ `auto | low | medium | high | max`, mặc định `auto`.
//! - `auto` = giữ hành vi đã tối ưu: **M3.1-Flash → `low`**, model khác → **mặc định nhà cung cấp**
//!   (tức **không gửi** tham số).
//!
//! Mapping theo provider (đã **xác minh bằng API thật** ngày 2026-10-24):
//! - **MiniMax** (`MiniMax-M3`, `MiniMax-M3.1-Flash`): nhận `reasoning_effort` trực tiếp trong body.
//!   Cả hai model đều trả **HTTP 200** khi gửi `reasoning_effort` (M3 với `low`, M3.1-Flash với `high`).
//!   `reasoning_split: true` vẫn giữ nguyên → thinking nằm ở `reasoning_content`, không lọt vào phụ đề.
//! - **OpenRouter**: dùng `reasoning: {effort: low|medium|high}` (`max` → `high`; `auto` → không gửi).
//!   Xác minh: `deepseek/deepseek-v4.1-flash` + `reasoning.effort=low` → **HTTP 200**, có trả `usage.cost`.
//! - **DeepSeek trực tiếp**: **không xác minh được** (máy không có key) → coi như không hỗ trợ, bỏ qua tham số.
//! - **Ollama / llama-server cục bộ**: không hỗ trợ → `supports_reasoning = false`.

use serde_json::{json, Value};

/// Giá trị "auto" = dùng hành vi tối ưu sẵn.
pub const EFFORT_AUTO: &str = "auto";

/// Chuẩn hoá giá trị effort về 1 trong: auto | low | medium | high | max.
pub fn normalize_effort(effort: &str) -> String {
    match effort.trim().to_lowercase().as_str() {
        "low" => "low".to_string(),
        "medium" => "medium".to_string(),
        "high" => "high".to_string(),
        "max" => "max".to_string(),
        _ => EFFORT_AUTO.to_string(),
    }
}

/// Provider/model có hỗ trợ reasoning effort không?
pub fn supports_reasoning(provider: &str, model: &str) -> bool {
    match provider.trim().to_lowercase().as_str() {
        "minimax" => !model.trim().is_empty(),
        "openrouter" => !model.trim().is_empty(),
        // chưa xác minh được (không có key) -> coi như không hỗ trợ, bỏ qua tham số
        "deepseek" => false,
        // ollama / llama-server cục bộ: không có khái niệm reasoning effort
        _ => false,
    }
}

/// Tham số reasoning cần thêm vào body request (kèm cờ supports).
///
/// Trả về `(fields, supports)`. `fields` là JSON object để merge vào body (rỗng = không thêm gì).
pub fn reasoning_fields(provider: &str, model: &str, effort: &str) -> (Value, bool) {
    let eff = normalize_effort(effort);
    let supports = supports_reasoning(provider, model);
    if !supports {
        return (json!({}), false);
    }
    match provider.trim().to_lowercase().as_str() {
        "minimax" => {
            // auto: M3.1-Flash -> low (đã tối ưu), model khác -> không gửi (mặc định nhà cung cấp)
            let value = match eff.as_str() {
                "auto" => {
                    if model.contains("M3.1-Flash") {
                        Some("low".to_string())
                    } else {
                        None
                    }
                }
                other => Some(other.to_string()),
            };
            match value {
                Some(v) => (json!({ "reasoning_effort": v }), true),
                None => (json!({}), true),
            }
        }
        "openrouter" => {
            // OpenRouter chỉ nhận low|medium|high; max -> high; auto -> không gửi
            let value = match eff.as_str() {
                "low" => Some("low"),
                "medium" => Some("medium"),
                "high" | "max" => Some("high"),
                _ => None,
            };
            match value {
                Some(v) => (json!({ "reasoning": { "effort": v } }), true),
                None => (json!({}), true),
            }
        }
        _ => (json!({}), false),
    }
}

#[cfg(test)]
#[path = "reasoning_tests.rs"]
mod tests;
