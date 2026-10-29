//! TSK-LAB-C4 — **viết lời bình theo chương** (logic, gọi LLM đã cấu hình).
//!
//! Tách khỏi `draft_commands.rs` để file lệnh Tauri gọn (< 300 dòng) và test thật gọi
//! được trực tiếp (không cần `AppHandle`).

use super::analysis_types::LabAnalysis;
use super::narration::{
    build_chapter_prompt, call_llm, distribute_range, estimate_tts_secs, pick_best_original_line,
    split_into_segments, NarrationOptions, MAX_SENTENCES_PER_SEGMENT, NARRATION_SYSTEM,
};
use super::recap_script::RecapItem;

/// Danh sách đoạn cho UI bước B (cùng kiểu `RecapItem`).
pub type NarrationResult = Vec<RecapItem>;

/// Viết lời bình cho từng chương của lần phân tích ⇒ danh sách đoạn.
///
/// - Mỗi chương: LLM viết văn bản thuần ⇒ tách đoạn 1–3 câu ⇒ chia đều thời gian chương
///   (gợi ý vùng nguồn cho bước C).
/// - Sau mỗi chương: gợi ý **1 câu thoại gốc hay nhất** (dài nhất, ≥ 8 ký tự) để người
///   dùng cân nhắc giữ tiếng gốc.
pub fn write_narration(
    config: &crate::config::AppConfig,
    analysis: &LabAnalysis,
    options: &NarrationOptions,
) -> Result<NarrationResult, String> {
    let mut out: NarrationResult = Vec::new();
    let mut next_id = 1u32;

    for chapter in &analysis.chapters {
        let (start, end) = super::analysis_merge::parse_time_range(&chapter.time_range)
            .unwrap_or((0.0, chapter.duration_sec));
        let dialogue: Vec<_> = analysis
            .transcript
            .iter()
            .filter(|line| {
                line.source_idx == chapter.source_idx && line.start >= start && line.end <= end
            })
            .cloned()
            .collect();

        let prompt = build_chapter_prompt(
            options,
            &chapter.title,
            &chapter.summary,
            &chapter.time_range,
            &dialogue,
        );
        let text = call_llm(config, NARRATION_SYSTEM, &prompt)?;
        let parts = split_into_segments(&text, MAX_SENTENCES_PER_SEGMENT);
        let ranges = distribute_range(start, end, parts.len());

        for (index, part) in parts.iter().enumerate() {
            let (from, to) = ranges[index];
            out.push(RecapItem {
                id: next_id,
                source_idx: chapter.source_idx,
                start: from,
                end: to,
                picture: chapter.title.clone(),
                narration: part.clone(),
                keep_original: false,
                tts_secs: Some(estimate_tts_secs(part)),
            });
            next_id += 1;
        }

        if let Some(best) =
            pick_best_original_line(&analysis.transcript, chapter.source_idx, start, end)
        {
            out.push(RecapItem {
                id: next_id,
                source_idx: best.source_idx,
                start: best.start,
                end: best.end,
                picture: chapter.title.clone(),
                narration: best.text.clone(),
                keep_original: true,
                tts_secs: None,
            });
            next_id += 1;
        }
    }

    if out.is_empty() {
        return Err("Lần phân tích chưa có chương nào để viết lời bình.".to_string());
    }
    Ok(out)
}
