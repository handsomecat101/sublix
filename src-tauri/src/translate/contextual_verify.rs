//! Hậu kiểm bảng glossary **đã duyệt** + dịch lại 1 câu khi vi phạm.
//!
//! Tách riêng khỏi [`super::contextual_run`] cho file đó < 300 dòng.
//! API công khai **không đổi**.

use crate::config::AppConfig;

use super::contextual::{build_translate_prompt, parse_tagged_lines, ScriptLine, ScriptReference};
use super::contextual_chunk::{model_for, system_prompt_for, timeout_for};
use super::glossary::Glossary;
use super::glossary_check::check_line;
use super::server;

/// Người nghe của dòng `idx` = speaker khác nhau đầu tiên xuất hiện **sau** dòng đó.
///
/// Xấp xỉ giống cách dùng trong `pronoun_audit` — chỉ để kiểm tra xưng hô.
pub fn listener_of(lines: &[ScriptLine], idx: usize) -> Option<String> {
    let me = lines.get(idx)?.speaker_id.as_str();
    lines
        .iter()
        .skip(idx + 1)
        .find(|l| l.speaker_id != me)
        .map(|l| l.speaker_id.clone())
}

/// Dịch lại **riêng 1 câu** (dùng khi câu vi phạm bảng glossary đã duyệt).
///
/// Trả `None` nếu dịch lại thất bại — khi đó giữ bản cũ.
pub fn retranslate_line(
    cfg: &AppConfig,
    provider: &str,
    line: &ScriptLine,
    reference: &ScriptReference,
    approved: Option<&Glossary>,
    source: &str,
    target: &str,
) -> Option<String> {
    if provider == "gguf" || provider.is_empty() {
        return None; // llama-server: không có prompt tùy chỉnh cho 1 câu
    }
    let chunk = std::slice::from_ref(line);
    let user = build_translate_prompt(chunk, &[], reference, &cfg.glossary, approved, source, target);
    let system = system_prompt_for(target);
    let raw = server::chat_completion_custom(
        cfg,
        provider,
        model_for(cfg, provider),
        &system,
        &user,
        timeout_for(provider),
    )
    .ok()?;
    let ids = vec![line.id.clone()];
    parse_tagged_lines(&raw, &ids).into_iter().flatten().next()
}

/// Kiểm tra 1 câu với bảng đã duyệt; nếu vi phạm thì **dịch lại riêng câu đó 1 lần**.
///
/// Trả `(bản_dịch_cuối_cùng, lý do_vi_phạm_còn_lại)`:
/// - không có bảng duyệt, hoặc câu không vi phạm → `(current, None)`
/// - dịch lại thành công và hết vi phạm → `(bản mới, None)`
/// - vẫn vi phạm → `(bản cũ, lý do)`
pub fn enforce_glossary(
    cfg: &AppConfig,
    provider: &str,
    line: &ScriptLine,
    listener: Option<&str>,
    reference: &ScriptReference,
    approved: Option<&Glossary>,
    source: &str,
    target: &str,
    current: String,
) -> (String, Option<String>) {
    let g = match approved {
        Some(g) => g,
        None => return (current, None),
    };
    let v = match check_line(&current, &line.speaker_id, listener, g) {
        Some(v) => v,
        None => return (current, None),
    };
    match retranslate_line(cfg, provider, line, reference, approved, source, target) {
        Some(retry) if !retry.trim().is_empty() => match check_line(&retry, &line.speaker_id, listener, g) {
            None => (retry, None),
            Some(v2) => (current, Some(v2.detail)),
        },
        _ => (current, Some(v.detail)),
    }
}
