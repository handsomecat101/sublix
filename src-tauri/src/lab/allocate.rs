//! TSK-LAB-CORE (C1) — **khớp cảnh theo thời lượng TTS thật** (thuần, không ffmpeg).
//!
//! Người dùng đã duyệt danh sách câu lời bình (theo thứ tự cốt truyện) và mỗi câu đã
//! được đọc thử để biết **thời lượng thật**. Việc còn lại: chọn đoạn video cho từng câu
//! — đủ dài để đọc hết, không trùng, không rơi vào intro/quảng cáo, ưu tiên đúng vùng
//! chương AI gợi ý — rồi chèn **đoạn giữ thoại gốc** đạt tỷ lệ người dùng chọn (mặc
//! định 30 %), đúng luật dựng của NarratoAI (`docs/RECAP_TOOLS_DEEPDIVE.md` §2.1.B, §4.3).
//!
//! Thuật toán **tham lam, O(n·m)**, cố tình đơn giản để dễ soi lỗi (xem
//! [`super::scenes`] cho phần chọn mẩu):
//!
//! 1. Cắt cảnh ứng viên thành các **mẩu sạch** (trừ vùng rác).
//! 2. Với từng câu, chọn mẩu theo ưu tiên: **trong vùng gợi ý** → **đúng nguồn gợi ý**
//!    → **đi xuôi thời gian** → **điểm cảnh cao** → **bắt đầu sớm hơn**; đoạn dùng thực
//!    tế dài đúng `tts_secs + padding_secs`.
//! 3. Không mẩu nào đủ dài ⇒ **ghép 2–3 mẩu liền kề** cùng nguồn (khe hở ≤
//!    [`AllocateOptions::max_join_gap_secs`], không có rác/đoạn đã dùng ở giữa) và ghi chú.
//! 4. Vẫn không được ⇒ đưa câu vào [`AllocateResult::unplaced`] để UI báo.
//! 5. Chèn thoại gốc theo tỷ lệ ([`super::original`]).
//! 6. Chạy [`RecapScript::validate_sources`] và trả vi phạm kèm kết quả.
//!
//! "Đủ tỷ lệ" hiểu như NarratoAI: `ratio = O / (N + O)` (`O` = giây thoại gốc, `N` =
//! giây lời bình) ⇒ cần `O = ratio/(1-ratio) · N`.

use serde::{Deserialize, Serialize};

use crate::lab::junk_filter::JunkRange;
use crate::lab::recap_script::{RecapItem, RecapScript, RuleViolation};

use super::original::insert_original;
use super::scenes::{max_source, pick_join, pick_single, usable_parts, Used};

/// Một câu lời bình đã có thời lượng TTS thật + vùng nguồn AI gợi ý.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationLine {
    /// ID ổn định (UI/LLM sinh) — dùng để đối chiếu câu chưa có cảnh.
    pub id: u32,
    /// Nội dung câu lời bình.
    pub text: String,
    /// Thời lượng đọc thật (giây) — đo sau khi TTS.
    pub tts_secs: f64,
    /// Video nguồn AI gợi ý.
    pub source_idx: usize,
    /// Đầu vùng nguồn AI gợi ý (giây).
    pub hint_start: f64,
    /// Cuối vùng nguồn AI gợi ý (giây).
    pub hint_end: f64,
}

/// Một đoạn video ứng viên (cutscene / cảnh đã chấm điểm ở lớp ngoài).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneCandidate {
    pub source_idx: usize,
    pub start: f64,
    pub end: f64,
    /// Điểm chất lượng cảnh (cao = đẹp/hợp); lớp chấm điểm nằm ngoài phạm vi này.
    pub score: f64,
}

/// Vùng người dùng/LLM đánh dấu **giữ thoại gốc** (đối thoại, cao trào…).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepOriginalRequest {
    pub source_idx: usize,
    pub start: f64,
    pub end: f64,
}

/// Tham số dựng.
#[derive(Debug, Clone, PartialEq)]
pub struct AllocateOptions {
    /// Đệm thêm sau mỗi câu (giây) — chừa chỗ thở, tránh cắt cụt hình.
    pub padding_secs: f64,
    /// Tỷ lệ thoại gốc đích, **0.0–1.0** (0.3 = 30 %).
    pub target_original_ratio: f64,
    /// Số mẩu tối đa được ghép cho một câu.
    pub max_join_segments: usize,
    /// Khe hở tối đa giữa 2 mẩu khi ghép (giây).
    pub max_join_gap_secs: f64,
    /// Đoạn thoại gốc ngắn hơn mức này thì không chèn (giây).
    pub min_original_secs: f64,
}

impl Default for AllocateOptions {
    fn default() -> Self {
        Self {
            padding_secs: 0.3,
            target_original_ratio: 0.3,
            max_join_segments: 3,
            max_join_gap_secs: 1.0,
            min_original_secs: 0.8,
        }
    }
}

/// Đầu vào của [`allocate`].
pub struct AllocateInput<'a> {
    pub lines: &'a [NarrationLine],
    pub candidates: &'a [SceneCandidate],
    pub junk: &'a [JunkRange],
    pub keep_original: &'a [KeepOriginalRequest],
    /// Thời lượng từng video nguồn (giây) — dùng cho luật `R4`.
    pub source_durations: &'a [f64],
    pub options: AllocateOptions,
}

/// Câu lời bình chưa tìm được cảnh.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Unplaced {
    pub line_id: u32,
    pub reason: String,
}

/// Kết quả dựng.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocateResult {
    pub script: RecapScript,
    /// Vi phạm luật dựng còn lại (thường rỗng).
    pub violations: Vec<RuleViolation>,
    /// Câu chưa có cảnh — UI phải báo cho người dùng.
    pub unplaced: Vec<Unplaced>,
    /// Ghi chú (ghép đoạn, bỏ qua vùng rác, tỷ lệ lệch…).
    pub notes: Vec<String>,
    /// Tỷ lệ thoại gốc thực tế của kịch bản (0.0–1.0).
    pub original_ratio: f64,
}

/// Dựng kịch bản recap từ câu lời bình + cảnh ứng viên (xem mô tả module).
pub fn allocate(input: AllocateInput<'_>) -> AllocateResult {
    let options = &input.options;
    let parts = usable_parts(input.candidates, input.junk);
    let mut used: Vec<Used> = Vec::new();
    let mut last_end: Vec<f64> = vec![0.0; max_source(&parts, input.lines) + 1];
    let mut items: Vec<RecapItem> = Vec::new();
    let mut unplaced: Vec<Unplaced> = Vec::new();
    let mut notes: Vec<String> = Vec::new();

    for line in input.lines {
        let need = line.tts_secs.max(0.05) + options.padding_secs;
        let clip = pick_single(&parts, line, need, &used, &last_end)
            .or_else(|| pick_join(&parts, input.junk, line, need, &used, &last_end, options));

        let Some(clip) = clip else {
            unplaced.push(Unplaced {
                line_id: line.id,
                reason: format!("không có cảnh dài ≥ {need:.1}s (đã trừ vùng rác và cảnh đã dùng)"),
            });
            continue;
        };

        if clip.joined > 1 {
            notes.push(format!(
                "Câu #{} ghép {} đoạn liền kề ({:.1}s–{:.1}s, nguồn #{}).",
                line.id,
                clip.joined,
                clip.start,
                clip.end,
                clip.source_idx + 1
            ));
        }

        items.push(RecapItem {
            id: 0,
            source_idx: clip.source_idx,
            start: clip.start,
            end: clip.end,
            picture: String::new(),
            narration: line.text.clone(),
            keep_original: false,
            tts_secs: Some(line.tts_secs),
        });
        used.push(Used {
            source_idx: clip.source_idx,
            start: clip.start,
            end: clip.end,
        });
        if let Some(slot) = last_end.get_mut(clip.source_idx) {
            *slot = clip.end;
        }
    }

    insert_original(&mut items, input.keep_original, input.junk, options, &mut notes);

    for (index, item) in items.iter_mut().enumerate() {
        item.id = index as u32 + 1;
    }

    let script = RecapScript::new(items);
    let violations = script.validate_sources(input.source_durations);
    tracing::debug!(
        items = script.items.len(),
        unplaced = unplaced.len(),
        ratio = script.original_ratio(),
        "lab: đã khớp cảnh"
    );
    AllocateResult {
        original_ratio: script.original_ratio(),
        script,
        violations,
        unplaced,
        notes,
    }
}

#[cfg(test)]
#[path = "allocate_tests.rs"]
mod allocate_tests;
