//! TSK-V015-DISC-B1 — dịch **từ khoá tìm kiếm** sang tiếng Trung giản thể.
//!
//! Vì sao cần: Bilibili **chặn** tìm kiếm bằng từ khoá tiếng Anh (mã `-412`),
//! còn từ khoá tiếng Trung thì ra kết quả. Người Việt thường gõ tên game/tiêu
//! đề bằng tiếng Anh ⇒ tab "Khám phá" tự dịch từ khoá trước khi tìm.
//!
//! Dùng **hạ tầng dịch sẵn có** của app (provider người dùng đã cấu hình:
//! MiniMax / Ollama / DeepSeek / OpenRouter / llama-server) — **không** thêm
//! provider hay API key mới.
//!
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (mục 2) + `docs/V0.15_PLAN.md`.

use crate::config::AppConfig;
use crate::stt::EnginePreference;
use crate::translate::TranslationModelVariant;

/// Prompt hệ thống — ngắn, yêu cầu **chỉ trả về từ khoá**.
pub const KEYWORD_SYSTEM_PROMPT: &str = "Bạn là chuyên gia tìm kiếm video trên Bilibili. \
Nhiệm vụ: dịch từ khoá tìm kiếm sang tiếng Trung giản thể, đúng như cách người Trung Quốc \
gõ trên Bilibili. Tên game, phim, anime, nhân vật phải dùng TÊN TIẾNG TRUNG CHÍNH THỨC \
(vd: Elden Ring → 艾尔登法环, Genshin Impact → 原神, Dark Souls → 黑暗之魂). \
Quy tắc: CHỈ trả về đúng từ khoá đã dịch, không giải thích, không ngoặc kép, không thêm \
dấu câu, không thêm từ nào khác.";

/// Timeout gọi provider (giây) — §4.13 mục 2: "Dịch tối đa 8 s".
pub const TRANSLATE_TIMEOUT_SECS: u64 = 8;

/// Nhãn tiền tố model hay thêm ⇒ cần bỏ.
const LEADING_LABELS: [&str; 12] = [
    "đã dịch", "dịch", "từ khoá", "từ khóa", "keyword", "keywords", "关键词", "关键", "翻译", "結果",
    "结果", "答",
];

/// Dấu hiệu model trả lời kèm giải thích thay vì chỉ trả từ khoá.
const EXPLANATION_MARKERS: [&str; 12] = [
    "dịch từ",
    "dịch sang",
    "nguyên văn",
    "translated",
    "translation",
    "keyword is",
    "原文",
    "翻译",
    "译文",
    "意思是",
    "tức là",
    "即",
];

/// Từ khoá đã có chữ Hán (CJK) chưa?
///
/// Bắt cả CJK Unified Ideographs (`U+4E00–U+9FFF`), Extension A và
/// Compatibility Ideographs (`U+F900–U+FAFF`).
pub fn contains_han(text: &str) -> bool {
    text.chars().any(|c| {
        let code = c as u32;
        (0x3400..=0x4DBF).contains(&code)
            || (0x4E00..=0x9FFF).contains(&code)
            || (0xF900..=0xFAFF).contains(&code)
    })
}

/// Từ khoá có chữ Latin (Việt/Anh) không?
pub fn contains_latin(text: &str) -> bool {
    text.chars().any(|c| c.is_ascii_alphabetic())
}

/// Có cần dịch sang tiếng Trung không?
///
/// - Đã có chữ Hán ⇒ **không** dịch (từ khoá đã là tiếng Trung).
/// - Không có chữ Latin ⇒ không dịch (chỉ số/ký hiệu).
/// - Còn lại (Latin) ⇒ dịch.
pub fn needs_translation(keyword: &str) -> bool {
    let text = keyword.trim();
    if text.is_empty() {
        return false;
    }
    contains_latin(text) && !contains_han(text)
}

/// Kết quả có trông như **giải thích** thay vì từ khoá không?
pub fn looks_like_explanation(text: &str) -> bool {
    let lower = text.to_lowercase();
    EXPLANATION_MARKERS.iter().any(|m| lower.contains(m))
}

/// Bỏ ngoặc kép bao quanh chuỗi (cả cặp ASCII lẫn cặp CJK).
fn strip_wrapping_quotes(text: &str) -> String {
    let pairs: [(&str, &str); 6] = [
        ("\"", "\""),
        ("'", "'"),
        ("“", "”"),
        ("「", "」"),
        ("『", "』"),
        ("（", "）"),
    ];
    let mut out = text.trim().to_string();
    // Bỏ tối đa 2 lớp ngoặc (model hay bọc 2 lần).
    for _ in 0..2 {
        let mut changed = false;
        for (open, close) in pairs {
            if out.len() >= open.len() + close.len()
                && out.starts_with(open)
                && out.ends_with(close)
            {
                out = out[open.len()..out.len() - close.len()].trim().to_string();
                changed = true;
                break;
            }
        }
        if !changed {
            break;
        }
    }
    out
}

/// Bỏ nhãn tiền tố kiểu `Đã dịch:` / `关键词:`.
fn strip_leading_label(text: &str) -> String {
    let mut out = text.trim().to_string();
    for label in LEADING_LABELS {
        for sep in [":", "："] {
            let prefix = format!("{label}{sep}");
            if out.to_lowercase().starts_with(&prefix.to_lowercase()) {
                out = out[prefix.len()..].trim().to_string();
                return out;
            }
        }
    }
    out
}

/// Bỏ dấu câu thừa ở cuối chuỗi.
fn strip_trailing_punctuation(text: &str) -> String {
    let mut out = text.trim().to_string();
    while let Some(last) = out.chars().last() {
        if "。．.，,、！!？?：:；;~～…-— \t".contains(last) {
            out.pop();
            out = out.trim_end().to_string();
        } else {
            break;
        }
    }
    out
}

/// Làm sạch kết quả dịch của model — **thuần**, không I/O.
///
/// Bỏ: khối `<think>…</think>`, dòng thừa, nhãn tiền tố, ngoặc kép, ngoặc
/// vuông bọc ngoài, dấu câu cuối, khoảng trắng thừa.
pub fn clean_translated_keyword(raw: &str) -> String {
    let mut text = raw.trim().to_string();

    // 1. Bỏ khối suy nghĩ (nếu model bật thinking).
    while let Some(start) = text.find("<think>") {
        match text[start..].find("</think>") {
            Some(offset) => {
                let end = start + offset + "</think>".len();
                let mut next = String::with_capacity(text.len());
                next.push_str(&text[..start]);
                next.push_str(&text[end..]);
                text = next.trim().to_string();
            }
            None => {
                text = text[..start].trim().to_string();
                break;
            }
        }
    }

    // 2. Lấy dòng đầu có nội dung (model hay thêm giải thích ở dòng sau).
    let first_line = text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("")
        .to_string();

    // 3. Bỏ nhãn tiền tố + ngoặc kép + ngoặc vuông bọc ngoài.
    let mut out = strip_wrapping_quotes(&strip_leading_label(&first_line));

    // 4. Bỏ ngoặc vuông bọn ngoài cùng (nhiều khi model trả `[艾尔登法环]`).
    for (open, close) in [("[", "]"), ("【", "】"), ("《", "》")] {
        if out.len() >= open.len() + close.len() && out.starts_with(open) && out.ends_with(close) {
            out = out[open.len()..out.len() - close.len()].trim().to_string();
        }
    }

    // 5. Bỏ dấu câu cuối + gộp khoảng trắng.
    out = strip_trailing_punctuation(&out);
    out = out.split_whitespace().collect::<Vec<_>>().join(" ");
    out
}

/// Dịch 1 từ khoá sang tiếng Trung bằng **provider người dùng đã cấu hình**.
///
/// - Ưu tiên đường **prompt tùy chỉnh** (`chat_completion_custom`) để câu lệnh
///   đúng ý "dịch từ khoá" (MiniMax / Ollama / DeepSeek / OpenRouter).
/// - Provider không hỗ trợ prompt tùy chỉnh (llama-server / `local`) ⇒
///   **fallback** sang đường dịch chuẩn của app, vẫn dùng provider đã cấu hình.
/// - Lỗi / rỗng / không có chữ Hán ⇒ `Err` ⇒ frontend tìm nguyên văn.
pub fn translate_keyword(cfg: &AppConfig, keyword: &str) -> Result<String, String> {
    let source = keyword.trim();
    if source.is_empty() {
        return Err("Từ khoá rỗng.".to_string());
    }
    if !needs_translation(source) {
        return Ok(source.to_string());
    }

    // Model theo provider (minimax ⇒ cfg.minimax_model, ollama ⇒ cfg.ollama_model…)
    // — dùng đúng helper của module dịch để không lệch cấu hình.
    let provider = cfg.translation_provider.trim();
    let provider_model = crate::translate::contextual_chunk::model_for(cfg, provider);

    let raw = match crate::translate::server::chat_completion_custom(
        cfg,
        provider,
        provider_model,
        KEYWORD_SYSTEM_PROMPT,
        source,
        TRANSLATE_TIMEOUT_SECS,
    ) {
        Ok(text) => text,
        Err(custom_err) => {
            tracing::warn!(
                "discovery: provider '{provider}' không dùng được prompt tùy chỉnh ({custom_err}) — fallback đường dịch chuẩn"
            );
            // Đường dự phòng dùng **variant GGUF cục bộ** (chỉ đường này dùng variant).
            let variant = TranslationModelVariant::resolve_or_best(Some(cfg.translation_model.as_str()));
            let pref = EnginePreference::from_str(&cfg.translation_engine_preference);
            crate::translate::translate_text_with_config(source, "auto", "zh", variant, pref, cfg)
                .map_err(|e| format!("{custom_err} | dịch dự phòng cũng lỗi: {e:#}"))?
        }
    };

    let cleaned = clean_translated_keyword(&raw);
    if cleaned.is_empty() {
        return Err("Dịch xong nhưng không còn nội dung.".to_string());
    }
    if !contains_han(&cleaned) {
        return Err(format!(
            "Dịch không ra chữ Hán: \"{cleaned}\"."
        ));
    }
    if looks_like_explanation(&cleaned) {
        return Err(format!(
            "Model trả về kèm giải thích: \"{cleaned}\"."
        ));
    }
    Ok(cleaned)
}

#[cfg(test)]
#[path = "keyword_translate_tests.rs"]
mod keyword_translate_tests;
