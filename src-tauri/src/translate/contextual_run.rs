//! Chạy dịch kịch bản theo ngữ cảnh — 2 lượt.
//!
//! - **Lượt 1 "đọc hiểu"**: đưa toàn bộ lời thoại cho LLM, nhận về JSON
//!   `{tom_tat, nhan_vat, xung_ho, thuat_ngu, giong_dieu}`. Lỗi ở lượt này **không
//!   được làm hỏng cả lượt 2** — chỉ mất bản tham chiếu.
//! - **Lượt 2 "dịch"**: dịch từng lô ~20 câu. Prompt có bản tham chiếu, `[speaker]`
//!   trên từng dòng, 5 câu liền trước (cửa sổ trượt qua biên giới lô) và hạn mức
//!   độ dài theo thời lượng câu.

use anyhow::Result;
use tracing::{info, warn};

use crate::config::AppConfig;

use super::contextual::{
    build_reference_prompt, build_translate_prompt, parse_reference, parse_tagged_lines,
    sliding_window, ContextualLine, ScriptLine, ScriptReference, CHUNK_SIZE,
};
use super::glossary::Glossary;
use super::glossary_check::check_line;
use super::server;
use super::TranslationModelVariant;

/// Timeout (giây) cho 1 lệnh gọi LLM, theo provider.
fn timeout_for(provider: &str) -> u64 {
    match provider {
        // M3 hay suy luận sâu → cần nhiều thời gian hơn; Ollama lần đầu phải nạp model.
        "minimax" | "ollama" => 180,
        _ => 120,
    }
}

/// Tên model theo provider hiện tại.
fn model_for<'a>(cfg: &'a AppConfig, provider: &str) -> &'a str {
    match provider {
        "minimax" => &cfg.minimax_model,
        "ollama" => &cfg.ollama_model,
        "deepseek" => &cfg.deepseek_model,
        "openrouter" => &cfg.openrouter_model,
        _ => &cfg.translation_model,
    }
}

/// System prompt cho lượt 2.
fn system_prompt_for(target: &str) -> String {
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
fn reference_as_glossary(reference: &ScriptReference) -> Vec<String> {
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

/// Lượt 1 — nhờ LLM đọc hiểu kịch bản, trả về bản tham chiếu.
pub fn build_reference(
    lines: &[ScriptLine],
    source: &str,
    target: &str,
    cfg: &AppConfig,
    provider: &str,
) -> Result<ScriptReference> {
    let system = format!(
        "Bạn là biên tập viên kịch bản. Trả về DUY NHẤT một JSON hợp lệ, không markdown, không giải thích."
    );
    let user = build_reference_prompt(lines, source, target);
    let raw = server::chat_completion_custom(
        cfg,
        provider,
        model_for(cfg, provider),
        &system,
        &user,
        timeout_for(provider),
    )?;
    let reference = parse_reference(&raw).map_err(anyhow::Error::msg)?;
    info!(
        "📖 Lượt 1: {} nhan vat, {} quy tac xung ho, {} thuat ngu",
        reference.nhan_vat.len(),
        reference.xung_ho.len(),
        reference.thuat_ngu.len()
    );
    Ok(reference)
}

/// Lượt 2 — dịch một lô câu.
fn translate_chunk(
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

/// Người nghe của dòng `idx` = speaker khác nhau đầu tiên xuất hiện **sau** dòng đó.
///
/// Xấp xỉ giống cách dùng trong `pronoun_audit` — chỉ để kiểm tra xưng hô.
fn listener_of(lines: &[ScriptLine], idx: usize) -> Option<String> {
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
fn retranslate_line(
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

/// Dịch toàn bộ kịch bản theo ngữ cảnh.
///
/// `progress(done, total, phase)` được gọi để app hiển thị tiến trình.
/// Trả về 1 kết quả cho **mỗi** dòng đầu vào (thứ tự giữ nguyên).
pub fn translate_script_contextual(
    lines: &[ScriptLine],
    source: &str,
    target: &str,
    cfg: &AppConfig,
    progress: &mut dyn FnMut(u32, u32, &str),
) -> Vec<ContextualLine> {
    let total = lines.len() as u32;
    if lines.is_empty() {
        return Vec::new();
    }
    let provider = cfg.translation_provider.to_lowercase();
    // Muc do suy luan (config-driven) — xem `translate::reasoning`.
    server::set_reasoning_effort(&cfg.llm_reasoning_effort);

    // Bảng glossary đã duyệt (ràng buộc CỨNG) — lấy từ config (đã resolve
    // file dự án / bảng toàn cục trước khi gọi hàm này).
    let approved = cfg
        .glossary_table
        .as_ref()
        .filter(|g| !g.is_empty())
        .cloned();
    let approved_ref = approved.as_ref();

    // ---- Lượt 1: đọc hiểu ----
    // Bảng đã duyệt KHÔNG bỏ qua lượt 1 (vẫn cần tóm tắt + nhân vật + thuật ngữ cho
    // bản dịch) — chỉ bỏ **bảng xưng hô tự sinh** khi người dùng đã khoá.
    progress(0, total, "reading");
    let mut reference = match build_reference(lines, source, target, cfg, &provider) {
        Ok(r) => r,
        Err(e) => {
            warn!("⚠️ Lượt 1 không thành công ({e:#}) — vẫn dịch, chỉ thiếu bản tham chiếu");
            ScriptReference::default()
        }
    };
    if approved.as_ref().map(|g| g.locked).unwrap_or(false) {
        info!("🔒 Bảng glossary đã khoá → bỏ bảng xưng hô tự sinh (dùng bảng đã duyệt)");
        reference.xung_ho.clear();
    }

    // ---- Lượt 2: dịch theo lô, cửa sổ trượt 5 câu ----
    let mut history: Vec<(String, String)> = Vec::with_capacity(lines.len());
    let mut results: Vec<ContextualLine> = Vec::with_capacity(lines.len());
    let mut done = 0u32;

    for (ci, chunk) in lines.chunks(CHUNK_SIZE).enumerate() {
        let start_idx = ci * CHUNK_SIZE;
        let context: Vec<(String, String)> = sliding_window(&history, start_idx).to_vec();

        let translated =
            translate_chunk(cfg, &provider, chunk, &context, &reference, approved_ref, source, target);

        for (i, line) in chunk.iter().enumerate() {
            let text = translated.get(i).cloned().flatten().unwrap_or_default();
            let failed = text.trim().is_empty();
            let mut final_text = if failed {
                // giữ nguyên lời gốc + nhãn lỗi để UI biết (giống cách app đang làm)
                super::translate_error_marker(&line.text)
            } else {
                text.clone()
            };
            history.push((line.text.clone(), final_text.clone()));

            // ---- Hậu kiểm tất định: có vi phạm bảng đã duyệt không? ----
            let mut violation: Option<String> = None;
            if let Some(g) = approved_ref {
                let listener = listener_of(lines, start_idx + i);
                if let Some(v) = check_line(&final_text, &line.speaker_id, listener.as_deref(), g) {
                    // thử dịch lại riêng câu này 1 lần
                    if let Some(retry) = retranslate_line(
                        cfg,
                        &provider,
                        line,
                        &reference,
                        approved_ref,
                        source,
                        target,
                    ) {
                        if !retry.trim().is_empty() {
                            let still = check_line(
                                &retry,
                                &line.speaker_id,
                                listener.as_deref(),
                                g,
                            );
                            match still {
                                None => {
                                    final_text = retry;
                                    history.pop();
                                    history.push((line.text.clone(), final_text.clone()));
                                    violation = None;
                                }
                                Some(v2) => violation = Some(v2.detail),
                            }
                        } else {
                            violation = Some(v.detail);
                        }
                    } else {
                        violation = Some(v.detail);
                    }
                }
            }

            results.push(ContextualLine {
                id: line.id.clone(),
                translated: final_text,
                failed,
                glossary_violation: violation.is_some(),
                glossary_violation_reason: violation,
            });
            done += 1;
        }
        progress(done, total, "translating");
    }
    progress(total, total, "done");
    results
}
