//! Gọi LLM **theo lô** cho đường dịch theo ngữ cảnh (lượt 2).
//!
//! Tách riêng khỏi [`super::contextual_run`] cho file đó < 300 dòng.
//! API công khai **không đổi**.

use tracing::warn;

use crate::config::AppConfig;

use super::contextual::{
    build_translate_prompt, parse_tagged_lines, ScriptLine, ScriptReference,
};
use super::glossary::Glossary;
use super::server;
use super::TranslationModelVariant;

/// Timeout (giây) cho 1 lệnh gọi LLM, theo provider.
pub fn timeout_for(provider: &str) -> u64 {
    match provider {
        // M3 hay suy luận sâu → cần nhiều thời gian hơn; Ollama lần đầu phải nạp model.
        "minimax" | "ollama" => 180,
        _ => 120,
    }
}

/// Tên model theo provider hiện tại.
pub fn model_for<'a>(cfg: &'a AppConfig, provider: &str) -> &'a str {
    match provider {
        "minimax" => &cfg.minimax_model,
        "ollama" => &cfg.ollama_model,
        "deepseek" => &cfg.deepseek_model,
        "openrouter" => &cfg.openrouter_model,
        _ => &cfg.translation_model,
    }
}

/// System prompt cho lượt 2.
pub fn system_prompt_for(target: &str) -> String {
    let tgt = super::lang_name(target);
    format!(
        "Bạn là biên tập viên lồng tiếng phim chuyên nghiệp, dịch sang {tgt}.\n\
         RULE 1: Bản dịch phải là lời thoại tự nhiên, nói tròn, đúng giọng điệu nhân vật.\n\
         RULE 2: TUÂN THỦ bảng xưng hô và danh sách tên riêng được cung cấp.\n\
         RULE 3: Tôn trọng hạn mức âm tiết theo thời lượng từng câu.\n\
         RULE 4: Output đúng số dòng, mỗi dòng bắt đầu bằng thẻ [id] của dòng đó.\n\
         RULE 5: Không giải thích, không thêm ngoặc kép thừa, không thêm <think>."
    )
}

/// Bản tham chiếu -> danh sách dòng glossary (để nhúng vào đường llama-server cục bộ,
/// vốn chỉ nhận glossary chứ không nhận prompt tùy chỉnh).
pub fn reference_as_glossary(reference: &ScriptReference) -> Vec<String> {
    let mut out = Vec::new();
    if !reference.tom_tat.trim().is_empty() {
        out.push(format!("Tóm tắt kịch bản: {}", reference.tom_tat.trim()));
    }
    for c in &reference.nhan_vat {
        out.push(format!(
            "Nhân vật {} (speaker={}) là {}",
            c.ten, c.speaker_id, c.vai_tro
        ));
    }
    for p in &reference.xung_ho {
        out.push(format!(
            "Khi nói với {}: gọi là \"{}\", tự xưng \"{}\"",
            p.den, p.goi_la, p.xung_la
        ));
    }
    for t in &reference.thuat_ngu {
        out.push(format!("Thuật ngữ: {} -> {}", t.goc, t.dich));
    }
    if !reference.giong_dieu.trim().is_empty() {
        out.push(format!("Giọng điệu chung: {}", reference.giong_dieu.trim()));
    }
    out
}

/// Lượt 2 — dịch một lô câu.
pub fn translate_chunk(
    cfg: &AppConfig,
    provider: &str,
    chunk: &[ScriptLine],
    context: &[(String, String)],
    reference: &ScriptReference,
    approved: Option<&Glossary>,
    source: &str,
    target: &str,
) -> Vec<Option<String>> {
    let ids: Vec<String> = chunk.iter().map(|l| l.id.clone()).collect();
    let user = build_translate_prompt(
        chunk,
        context,
        reference,
        &cfg.glossary,
        approved,
        source,
        target,
    );

    if provider == "gguf" || provider.is_empty() {
        // llama-server cục bộ: chỉ nhận glossary -> nhét bản tham chiếu vào đó.
        let items: Vec<String> = chunk.iter().map(|l| l.text.clone()).collect();
        let mut gl = cfg.glossary.clone();
        gl.extend(reference_as_glossary(reference));
        if let Some(g) = approved {
            gl.extend(g.to_rules());
        }
        let variant = TranslationModelVariant::resolve_or_best(Some(cfg.translation_model.as_str()));
        let pref = crate::stt::EnginePreference::from_str(&cfg.translation_engine_preference);
        return match server::translate_batch_via_server(&items, source, target, variant, pref, &gl) {
            Ok(v) => v.into_iter().map(Some).collect(),
            Err(e) => {
                warn!("Lô dịch (llama-server) lỗi: {e:#}");
                vec![None; ids.len()]
            }
        };
    }

    let system = system_prompt_for(target);
    match server::chat_completion_custom(
        cfg,
        provider,
        model_for(cfg, provider),
        &system,
        &user,
        timeout_for(provider),
    ) {
        Ok(raw) => parse_tagged_lines(&raw, &ids),
        Err(e) => {
            warn!("Lô dịch ({provider}) lỗi: {e:#}");
            vec![None; ids.len()]
        }
    }
}
