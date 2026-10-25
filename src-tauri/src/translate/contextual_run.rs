//! Chạy dịch kịch bản theo ngữ cảnh — 2 lượt.
//!
//! - **Lượt 1 "đọc hiểu"**: đưa toàn bộ lời thoại cho LLM, nhận về JSON
//!   `{tom_tat, nhan_vat, xung_ho, thuat_ngu, giong_dieu}`. Lỗi ở lượt này **không
//!   được làm hỏng cả lượt 2** — chỉ mất bản tham chiếu.
//! - **Lượt 2 "dịch"**: dịch từng lô ~20 câu. Prompt có bản tham chiếu, `[speaker]`
//!   trên từng dòng, 5 câu liền trước (cửa sổ trượt qua biên giới lô) và hạn mức
//!   độ dài theo thời lượng câu.
//!
//! Phần gọi LLM theo lô nằm ở [`super::contextual_chunk`], phần hậu kiểm bảng
//! glossary ở [`super::contextual_verify`] — cho file này < 300 dòng.
//! API công khai **không đổi**.

use anyhow::Result;
use tracing::{info, warn};

use crate::config::AppConfig;

use super::contextual::{
    build_reference_prompt, parse_reference, sliding_window, ContextualLine, ScriptLine,
    ScriptReference, CHUNK_SIZE,
};
use super::contextual_chunk::{model_for, timeout_for, translate_chunk};
use super::contextual_verify::{enforce_glossary, listener_of};
use super::server;

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

        let translated = translate_chunk(
            cfg,
            &provider,
            chunk,
            &context,
            &reference,
            approved_ref,
            source,
            target,
        );

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
            let listener = listener_of(lines, start_idx + i);
            let original = final_text.clone();
            let (checked, violation) = enforce_glossary(
                cfg,
                &provider,
                line,
                listener.as_deref(),
                &reference,
                approved_ref,
                source,
                target,
                original,
            );
            if checked != final_text {
                history.pop();
                history.push((line.text.clone(), checked.clone()));
                final_text = checked;
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
