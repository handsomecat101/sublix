//! TSK-LAB-C4 — chuyển **kết quả phân tích (C3) + mục bước B** thành kịch bản dựng.
//!
//! - Cảnh ứng viên = `analysis.scenes` (điểm cutscene 0–1 đã chấm ở C2). Không có cảnh
//!   nào (video chưa phân cảnh) ⇒ tự tạo **1 cảnh phủ cả video** điểm trung bình để vẫn
//!   dựng được nháp.
//! - Vùng rác = `analysis.junk`, **map đúng video nguồn theo `source_name`** (trước đây
//!   gán cứng nguồn 0 ⇒ video thứ 2 bị bỏ nhầm cảnh).
//! - Chạy `allocate` (C1) rồi **tự sửa vi phạm không cần viết chữ** ([`autofix_script`]):
//!   bỏ đoạn thoại gốc gây lỗi R1/R2/R3/R5. Vi phạm cần sửa lời (nếu còn) trả về UI.

use super::analysis_types::LabAnalysis;
use super::allocate::{
    allocate, AllocateInput, AllocateOptions, SceneCandidate,
};
use super::junk_filter::JunkRange;
use super::recap_script::{RecapItem, RecapScript, RuleViolation, MAX_CONSECUTIVE_ORIGINAL};
use super::draft::{parse_range, to_keep_original, to_narration_lines, DraftOptions};

/// Sai số thời gian khi so chồng lấn (giây).
const EPS: f64 = 1e-6;

/// Kết quả bước "khớp cảnh" (trước khi render).
pub struct DraftPlan {
    /// Kịch bản đã dựng.
    pub script: RecapScript,
    /// Vi phạm luật còn lại (cần người dùng sửa lời).
    pub violations: Vec<String>,
    /// Câu chưa có cảnh.
    pub unplaced: Vec<String>,
    /// Ghi chú tự sửa (đoạn thoại gốc bị bỏ…).
    pub notes: Vec<String>,
}

/// Cảnh ứng viên từ kết quả phân tích (C3).
pub fn to_scene_candidates(analysis: &LabAnalysis) -> Vec<SceneCandidate> {
    let mut scenes: Vec<SceneCandidate> = analysis
        .scenes
        .iter()
        .map(|scene| SceneCandidate {
            source_idx: scene.source_idx,
            start: scene.start,
            end: scene.end,
            score: scene.score,
        })
        .collect();
    if scenes.is_empty() {
        // Chưa phân cảnh ⇒ cả video là 1 cảnh (điểm 0,5) để vẫn dựng được nháp.
        scenes = analysis
            .sources
            .iter()
            .enumerate()
            .filter(|(_, source)| source.duration_sec > 0.0)
            .map(|(index, source)| SceneCandidate {
                source_idx: index,
                start: 0.0,
                end: source.duration_sec,
                score: 0.5,
            })
            .collect();
    }
    scenes
}

/// Vùng rác từ kết quả phân tích (C3), map đúng nguồn theo **tên video**.
pub fn to_junk_ranges(analysis: &LabAnalysis) -> Vec<JunkRange> {
    analysis
        .junk
        .iter()
        .filter_map(|junk| {
            let (start, end) = parse_range(&junk.time_range)?;
            let source_idx = analysis
                .sources
                .iter()
                .position(|source| source.name == junk.source_name)
                .unwrap_or(0);
            Some(JunkRange {
                source_idx,
                start,
                end,
                reasons: Vec::new(),
            })
        })
        .collect()
}

/// Chạy `allocate` (C1) với dữ liệu phân tích (C3) + mục bước B.
pub fn plan_draft(analysis: &LabAnalysis, items: &[RecapItem], options: &DraftOptions) -> DraftPlan {
    let lines = to_narration_lines(items);
    let candidates = to_scene_candidates(analysis);
    let junk = to_junk_ranges(analysis);
    let keep_original = to_keep_original(items);
    let source_durations: Vec<f64> = analysis
        .sources
        .iter()
        .map(|source| source.duration_sec)
        .collect();

    let result = allocate(AllocateInput {
        lines: &lines,
        candidates: &candidates,
        junk: &junk,
        keep_original: &keep_original,
        source_durations: &source_durations,
        options: AllocateOptions {
            target_original_ratio: options.original_ratio.clamp(0.0, 1.0),
            ..AllocateOptions::default()
        },
    });

    let mut script = result.script;
    let notes = autofix_script(&mut script);
    let violations = script
        .validate_sources(&source_durations)
        .into_iter()
        .map(|violation: RuleViolation| {
            format!("{}: {}", violation.rule.code(), violation.message_vi)
        })
        .collect::<Vec<_>>();

    DraftPlan {
        script,
        violations,
        notes,
        unplaced: result
            .unplaced
            .iter()
            .map(|item| format!("Câu {}: {}", item.line_id, item.reason))
            .collect(),
    }
}

/// Tự sửa vi phạm **không cần viết chữ**: bỏ đoạn thoại gốc gây lỗi, đánh số lại.
///
/// Xử lý `R1` (mở đầu bằng thoại gốc), `R2` (> 2 đoạn liền nhau), `R3` (đổi nguồn mà
/// đoạn sau giữ thoại gốc), `R5` (chồng thời gian cùng nguồn). Vi phạm `R4`/`R6` phụ
/// thuộc dữ liệu/lời bình nên **không** tự sửa.
pub fn autofix_script(script: &mut RecapScript) -> Vec<String> {
    let mut notes: Vec<String> = Vec::new();
    let mut kept: Vec<RecapItem> = Vec::with_capacity(script.items.len());
    let mut original_run = 0usize;

    for item in script.items.drain(..) {
        if item.keep_original {
            let previous = kept.last();
            let first = kept.is_empty();
            let source_changed = previous.is_some_and(|prev| prev.source_idx != item.source_idx);
            let too_many = original_run >= MAX_CONSECUTIVE_ORIGINAL;
            let overlap = kept.iter().any(|prev| {
                prev.source_idx == item.source_idx
                    && prev.start < item.end - EPS
                    && item.start < prev.end - EPS
            });
            if first || source_changed || too_many || overlap {
                notes.push(format!(
                    "Bỏ đoạn giữ tiếng gốc ở nguồn #{} ({:.1}–{:.1}s) để đúng luật dựng.",
                    item.source_idx + 1,
                    item.start,
                    item.end
                ));
                continue;
            }
        }
        original_run = if item.keep_original { original_run + 1 } else { 0 };
        kept.push(item);
    }

    // GIỮ NGUYÊN `id` (không đánh số lại) — `draft_build` map file TTS theo id.
    script.items = kept;
    notes
}

#[cfg(test)]
#[path = "draft_plan_tests.rs"]
mod draft_plan_tests;
