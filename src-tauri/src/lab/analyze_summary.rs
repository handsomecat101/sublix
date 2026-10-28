//! TSK-LAB-C3 — **tóm tắt bằng LLM** cho các cụm thoại (bước 4 của Bước A).
//!
//! - Chia thoại thành cụm theo thời gian (mỗi cụm ~8–10 phút) để vừa giới
//!   hạn ngữ cảnh LLM.
//! - Gọi LLM từng cụm (provider người dùng đã cấu hình) qua `llm_prompt`.
//! - LLM lỗi 1 cụm ⇒ **thử lại 1 lần** rồi ghi chương "chưa tóm tắt được" —
//!   **không** làm hỏng cả lần chạy.
//! - Gộp chương + nhân vật từ **nhiều cụm / nhiều nguồn**.

use std::sync::atomic::{AtomicBool, Ordering};

use super::analysis_merge::merge_chapters;
use super::analysis_types::LabChapter;
use super::analyze::{LabAnalyzeOptions, LabProgress, STAGE_SUMMARY, LAB_CANCELLED};
use super::cutscene::SceneSegment;
use super::llm_json::{LlmChapter, LlmCharacter};
use super::llm_prompt::{build_user_prompt, summarize_chunk};
use super::transcript::{chunk_by_time, render_chunk, TranscriptChunk, TranscriptLine};

/// Kết quả bước tóm tắt: chương (đã gộp) + nhân vật theo từng cụm.
pub struct SummaryResult {
    /// Danh sách chương (đánh số lại 1..n).
    pub chapters: Vec<LabChapter>,
    /// Nhân vật từng cụm (để `merge_characters` gộp theo tên).
    pub character_batches: Vec<Vec<LlmCharacter>>,
}

/// Tóm tắt toàn bộ cụm thoại.
pub fn summarize_all(
    config: &crate::config::AppConfig,
    options: &LabAnalyzeOptions,
    transcript: &[TranscriptLine],
    scenes: &[SceneSegment],
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(LabProgress),
) -> Result<SummaryResult, String> {
    let chunks = chunk_by_time(transcript, options.chunk_secs);
    let mut batches: Vec<(Vec<LlmChapter>, TranscriptChunk, bool)> = Vec::new();
    let mut character_batches: Vec<Vec<LlmCharacter>> = Vec::new();

    for (index, chunk) in chunks.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            return Err(LAB_CANCELLED.to_string());
        }
        let pct = 45 + (55 * index / chunks.len().max(1)) as u32;
        on_progress(LabProgress {
            stage: STAGE_SUMMARY.to_string(),
            source_idx: chunk.source_idx,
            percent: pct,
            message: format!("Đang tóm tắt cụm {}/{}…", index + 1, chunks.len()),
        });

        let user_prompt = build_user_prompt(
            &options.game_name,
            &options.game_genre,
            &options.supplementary_context,
            &render_chunk(chunk),
        );
        let mut retry_notice = || {
            on_progress(LabProgress {
                stage: STAGE_SUMMARY.to_string(),
                source_idx: chunk.source_idx,
                percent: pct,
                message: "LLM lỗi — thử lại lần 2…".to_string(),
            });
        };

        match summarize_chunk(config, &user_prompt, &mut retry_notice) {
            Ok(result) => {
                character_batches.push(result.characters);
                batches.push((result.chapters, chunk.clone(), false));
            }
            Err(err) => {
                tracing::warn!("lab: LLM lỗi ở cụm {}: {err}", index + 1);
                character_batches.push(Vec::new());
                batches.push((Vec::new(), chunk.clone(), true));
            }
        }
    }

    let mut chapters = merge_chapters(&batches, scenes, transcript);
    // Chỉ cụm **LLM lỗi** mới ghi chương "chưa tóm tắt được"; cụm LLM trả về
    // mảng rỗng là kết quả hợp lệ (video không có cốt truyện) ⇒ giữ nguyên.
    for (llm_chapters, chunk, failed) in batches.iter() {
        if *failed && llm_chapters.is_empty() {
            let id = chapters.len() as i64 + 1;
            chapters.push(fallback_chapter(id, chunk, scenes, transcript));
        }
    }
    for (index, chapter) in chapters.iter_mut().enumerate() {
        chapter.id = index as i64 + 1;
    }

    Ok(SummaryResult {
        chapters,
        character_batches,
    })
}

/// Chương dự phòng cho cụm LLM hỏng.
fn fallback_chapter(
    id: i64,
    chunk: &TranscriptChunk,
    scenes: &[SceneSegment],
    transcript: &[TranscriptLine],
) -> LabChapter {
    super::analysis_merge::build_chapter(
        id,
        &LlmChapter {
            title: "Chưa tóm tắt được".to_string(),
            core_event: "Phần này LLM chưa tóm tắt được (lỗi provider hoặc JSON).".to_string(),
            source_idx: chunk.source_idx as i64,
            ..Default::default()
        },
        chunk,
        scenes,
        transcript,
    )
}
