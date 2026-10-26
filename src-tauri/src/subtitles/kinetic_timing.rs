//! TSK-V014-KINETIC-RS — chia thời gian từng từ cho phụ đề "nhảy chữ".
//!
//! Câu dịch tiếng Việt **không có** word timestamp như Whisper ⇒ chia thời lượng
//! của cả câu theo **trọng số âm tiết**. Nguồn sự thật là
//! `scripts/kinetic-tests/vectors.json` (trường `algorithm`); bản TS phía
//! frontend chạy CÙNG bộ vectors để khung xem thử và video xuất ra khớp nhau.
//!
//! Thuật toán (v1):
//! 1. **tokens**: trim; rỗng ⇒ `[]`; có khoảng trắng ⇒ tách theo `\s+`; không có
//!    khoảng trắng mà có CJK ⇒ tách từng ký tự (dấu câu dính ký tự trước); còn
//!    lại ⇒ cả chuỗi là một token.
//! 2. **Trọng số**: 1,0; riêng token kết thúc bằng dấu câu (`, . ! ? ; : … ，。！？；：、`)
//!    được **+0,6** vì người nói thường ngân dài ở cuối câu.
//! 3. **Thời gian**: `totalCs = round((end-start)*100)` (≥ 0);
//!    `durCs = floor(totalCs*w/W)`, **phần dư cộng vào từ cuối**; `offsetCs` cộng dồn.

use serde::{Deserialize, Serialize};

/// Dấu kết câu: cộng thêm 0,6 trọng số (chỗ ngắt hơi / ngân dài).
const SENTENCE_PUNCT: [char; 14] = [
    ',', '.', '!', '?', ';', ':', '…', '，', '。', '！', '？', '；', '：', '、',
];

/// Ký tự "dính" vào token trước khi tách chữ CJK: dấu câu + nháy/ngoặc.
const GLUE_PUNCT: [char; 26] = [
    ',', '.', '!', '?', ';', ':', '…', '，', '。', '！', '？', '；', '：', '、', '"', '\'', '“', '”',
    '‘', '’', '(', ')', '（', '）', '《', '》',
];

/// Một từ đã có thời gian riêng (centi-giây, tính từ đầu câu).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimedWord {
    /// Nội dung từ (đã trim, chưa escape ASS).
    pub word: String,
    /// Thời điểm bắt đầu, tính từ đầu câu, đơn vị centi-giây.
    pub offset_cs: u32,
    /// Thời lượng, đơn vị centi-giây.
    pub dur_cs: u32,
}

fn is_cjk(c: char) -> bool {
    matches!(c as u32, 0x3400..=0x9FFF | 0xF900..=0xFAFF)
}

fn ends_sentence(token: &str) -> bool {
    token
        .chars()
        .last()
        .is_some_and(|c| SENTENCE_PUNCT.contains(&c))
}

fn clamp_u32(value: u64) -> u32 {
    value.min(u32::MAX as u64) as u32
}

/// Tổng thời lượng câu (centi-giây); `end <= start` hoặc không hữu hạn ⇒ 0.
pub fn total_cs(start: f64, end: f64) -> u32 {
    let raw = (end - start) * 100.0;
    if !raw.is_finite() || raw <= 0.0 {
        return 0;
    }
    clamp_u32(raw.round() as u64)
}

/// Tách câu thành các token theo đúng thuật toán tham chiếu (v1).
pub fn split_tokens(text: &str) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    if trimmed.chars().any(char::is_whitespace) {
        return trimmed.split_whitespace().map(str::to_string).collect();
    }

    if trimmed.chars().any(is_cjk) {
        let mut out: Vec<String> = Vec::new();
        for ch in trimmed.chars() {
            if GLUE_PUNCT.contains(&ch) {
                match out.last_mut() {
                    Some(last) => last.push(ch),
                    None => out.push(ch.to_string()),
                }
            } else {
                out.push(ch.to_string());
            }
        }
        return out;
    }

    vec![trimmed.to_string()]
}

/// Chia thời lượng câu `[start, end]` (giây) cho từng từ.
///
/// Tổng `dur_cs` luôn bằng [`total_cs`]; `offset_cs` của từ đầu là 0.
pub fn time_words(text: &str, start: f64, end: f64) -> Vec<TimedWord> {
    let tokens = split_tokens(text);
    if tokens.is_empty() {
        return Vec::new();
    }

    let total = u64::from(total_cs(start, end));
    let weights: Vec<f64> = tokens
        .iter()
        .map(|token| if ends_sentence(token) { 1.6 } else { 1.0 })
        .collect();
    let weight_sum: f64 = weights.iter().sum();

    let mut durations: Vec<u64> = weights
        .iter()
        .map(|w| (total as f64 * w / weight_sum).floor() as u64)
        .collect();
    let assigned: u64 = durations.iter().sum();
    if let Some(last) = durations.last_mut() {
        *last += total.saturating_sub(assigned);
    }

    let mut offset: u64 = 0;
    tokens
        .into_iter()
        .zip(durations)
        .map(|(word, dur)| {
            let timed = TimedWord {
                word,
                offset_cs: clamp_u32(offset),
                dur_cs: clamp_u32(dur),
            };
            offset += dur;
            timed
        })
        .collect()
}

// Test nằm ở file riêng (giữ file chính < 300 dòng).
#[cfg(test)]
#[path = "kinetic_timing_tests.rs"]
mod tests;
