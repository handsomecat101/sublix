//! Parser JSON bảng **hot word** của Douyin → [`HotWord`] (thuần, không gọi mạng).
//!
//! Endpoint công khai: `GET https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/`
//! — không cần đăng nhập, không cần cookie, không cần chữ ký `a_bogus`
//! (`docs/VIDEO_DISCOVERY_RESEARCH.md` §2.3). Trả tối đa **50 chủ đề** đang nóng nhất
//! Trung Quốc; mỗi chủ đề là một chip "🔥 Xu hướng Douyin" ở tab Khám phá.
//!
//! Cấu trúc: `{ status_code, word_list: [ { word, hot_value, label } ] }`
//! - `status_code != 0` ⇒ lỗi nghiệp vụ (thông điệp tiếng Việt).
//! - `label` là **mã số** (0 / 1 / 3 …) ⇒ giữ nguyên dạng chuỗi cho frontend tự quyết
//!   cách hiển thị; `null` ⇒ `None`.
//! - Từ khoá rỗng bị bỏ qua; danh sách rỗng là kết quả hợp lệ.

use anyhow::{bail, Context, Result};
use serde::Deserialize;
use serde_json::Value;

use super::HotWord;

/// Phong bì của API hot word Douyin.
#[derive(Debug, Deserialize)]
struct Envelope {
    #[serde(default)]
    status_code: Option<i64>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    word_list: Option<Vec<RawWord>>,
}

#[derive(Debug, Deserialize)]
struct RawWord {
    #[serde(default)]
    word: String,
    #[serde(default)]
    hot_value: Option<Value>,
    #[serde(default)]
    label: Option<Value>,
}

/// Đọc JSON bảng hot word Douyin → danh sách [`HotWord`] đã làm sạch.
pub fn parse_hot_words(json: &str) -> Result<Vec<HotWord>> {
    let env: Envelope = serde_json::from_str(json)
        .with_context(|| "Douyin trả về dữ liệu không đọc được (bảng hot word)")?;

    let code = env.status_code.unwrap_or(0);
    if code != 0 {
        let message = env.message.unwrap_or_default();
        let message = message.trim();
        if message.is_empty() {
            bail!("Douyin từ chối yêu cầu (mã {code})");
        }
        bail!("Douyin từ chối yêu cầu (mã {code}): {message}");
    }

    let words = env
        .word_list
        .unwrap_or_default()
        .into_iter()
        .filter_map(to_hot_word)
        .collect::<Vec<_>>();
    tracing::debug!(count = words.len(), "Douyin: đã đọc bảng hot word");
    Ok(words)
}

fn to_hot_word(raw: RawWord) -> Option<HotWord> {
    let word = raw.word.trim();
    if word.is_empty() {
        return None;
    }
    let hot_value = raw.hot_value.as_ref().and_then(parse_u64);
    // `label` khai báo dạng `Option<Value>`: `null` ⇒ None; số 0 vẫn giữ ("0").
    let label = raw.label.as_ref().and_then(label_text);
    Some(HotWord {
        word: word.to_string(),
        hot_value,
        label,
    })
}

fn label_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if !text.trim().is_empty() => Some(text.trim().to_string()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

/// `hot_value` → số (chịu được cả số và chuỗi `"11821976"`).
fn parse_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.trim().replace(',', "").parse().ok(),
        _ => None,
    }
}

#[cfg(test)]
#[path = "douyin_tests.rs"]
mod douyin_tests;
