//! TSK-LAB-CORE (C1) — kiểu kịch bản recap + **kiểm luật dựng** (thuần, không I/O).
//!
//! Luật dựng lấy từ NarratoAI (`script_matching.py`, MIT — xem
//! `docs/RECAP_TOOLS_DEEPDIVE.md` §2.1.B/D) và `docs/XUONG_AI_PLAN.md` §1:
//!
//! | Mã | Luật | Nguồn |
//! |---|---|---|
//! | `R1` | Đoạn **đầu tiên** phải là lời bình (không mở bằng thoại gốc) | NarratoAI luật 2 |
//! | `R2` | Không quá **2** đoạn `keep_original` liền nhau | NarratoAI luật 3 |
//! | `R3` | Đổi `source_idx` giữa 2 đoạn liền nhau ⇒ đoạn sau phải là **lời bình** (câu nối) | NarratoAI luật 4 |
//! | `R4` | `start < end`, không âm, nằm trong thời lượng nguồn | – |
//! | `R5` | Không chồng thời gian giữa 2 đoạn **cùng nguồn** | NarratoAI luật 10 |
//! | `R6` | Đoạn lời bình phải có `narration` không rỗng | – |
//!
//! **Phạm vi thuần**: chỉ kiểm tra cấu trúc kịch bản. Việc cắt/gộp đoạn theo thời
//! lượng TTS nằm ở [`crate::lab::allocate`].
//!
//! Ghi chú thiết kế: [`RecapScript`] **không** lưu thời lượng nguồn (kịch bản có thể
//! được sửa tay trên UI). Muốn kiểm `R4` theo biên nguồn thì gọi
//! [`RecapScript::validate_sources`] với mảng thời lượng thật; [`RecapScript::validate`]
//! chỉ kiểm được `start < end` và `start >= 0`.

use serde::{Deserialize, Serialize};

/// Số đoạn `keep_original` liền nhau tối đa (luật `R2`).
pub const MAX_CONSECUTIVE_ORIGINAL: usize = 2;

/// Sai số thời gian khi so sánh (giây).
const EPS: f64 = 1e-6;

/// Mã luật dựng — serialize thành `"R1"` … `"R6"` cho frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Rule {
    R1,
    R2,
    R3,
    R4,
    R5,
    R6,
}

impl Rule {
    /// Mã ngắn (`"R1"`) — dùng cho log / UI.
    pub fn code(self) -> &'static str {
        match self {
            Rule::R1 => "R1",
            Rule::R2 => "R2",
            Rule::R3 => "R3",
            Rule::R4 => "R4",
            Rule::R5 => "R5",
            Rule::R6 => "R6",
        }
    }
}

/// Một vi phạm luật dựng, gắn với đoạn (`RecapItem.id`) gây ra nó.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleViolation {
    /// `RecapItem.id` của đoạn vi phạm.
    pub item_id: u32,
    /// Mã luật (`R1` … `R6`).
    pub rule: Rule,
    /// Thông điệp tiếng Việt hiển thị thẳng cho người dùng.
    pub message_vi: String,
}

impl RuleViolation {
    pub fn new(item_id: u32, rule: Rule, message_vi: impl Into<String>) -> Self {
        Self {
            item_id,
            rule,
            message_vi: message_vi.into(),
        }
    }
}

/// Một đoạn trong kịch bản recap: cắt từ `source_idx` trong `[start, end)`, kèm
/// lời bình (hoặc giữ nguyên thoại gốc của game).
///
/// - `id` do [`crate::lab::allocate`] đánh số 1..n; khi người dùng sửa tay thì giữ nguyên.
/// - `tts_secs` = thời lượng đọc thật của `narration` (chỉ có ở đoạn lời bình).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapItem {
    pub id: u32,
    /// Chỉ số video nguồn (0-based) trong danh sách người dùng đưa vào.
    pub source_idx: usize,
    /// Bắt đầu (giây, trong video nguồn — không phải thời gian timeline).
    pub start: f64,
    /// Kết thúc (giây).
    pub end: f64,
    /// Mô tả hình ảnh (AI điền, có thể rỗng khi chỉ dựng máy).
    pub picture: String,
    /// Lời bình; rỗng khi `keep_original = true`.
    pub narration: String,
    /// `true` = giữ thoại gốc của game thay vì đọc lời bình.
    pub keep_original: bool,
    /// Thời lượng TTS thật của `narration` (giây).
    #[serde(default)]
    pub tts_secs: Option<f64>,
}

/// Kịch bản recap đã dựng — thứ tự `items` là **thứ tự phát**.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecapScript {
    pub items: Vec<RecapItem>,
}

impl RecapScript {
    pub fn new(items: Vec<RecapItem>) -> Self {
        Self { items }
    }

    /// Tổng thời lượng phát (giây) — bỏ qua đoạn có khoảng thời gian âm.
    pub fn total_secs(&self) -> f64 {
        self.items.iter().map(item_secs).sum()
    }

    /// Tỷ lệ thời lượng **giữ thoại gốc** trên tổng thời lượng (0.0–1.0).
    pub fn original_ratio(&self) -> f64 {
        let total = self.total_secs();
        if total <= EPS {
            return 0.0;
        }
        let kept: f64 = self.items.iter().filter(|i| i.keep_original).map(item_secs).sum();
        (kept / total).clamp(0.0, 1.0)
    }

    /// Kiểm luật **không cần** thời lượng nguồn (R1, R2, R3, R5, R6 + `start < end`).
    pub fn validate(&self) -> Vec<RuleViolation> {
        self.validate_sources(&[])
    }

    /// Kiểm đầy đủ — thêm biên `R4` theo `source_durations` (giây, 0-based như
    /// `source_idx`). Nguồn không có trong mảng ⇒ bỏ qua phần biên.
    pub fn validate_sources(&self, source_durations: &[f64]) -> Vec<RuleViolation> {
        let mut out = Vec::new();
        let mut run_original = 0usize;

        for (idx, item) in self.items.iter().enumerate() {
            self.check_time(idx, item, source_durations, &mut out);

            if !item.keep_original && item.narration.trim().is_empty() {
                out.push(RuleViolation::new(
                    item.id,
                    Rule::R6,
                    "Đoạn lời bình chưa có nội dung (narration rỗng).",
                ));
            }

            if idx == 0 && item.keep_original {
                out.push(RuleViolation::new(
                    item.id,
                    Rule::R1,
                    "Đoạn đầu tiên phải là lời bình — không mở đầu bằng thoại gốc.",
                ));
            }

            if item.keep_original {
                run_original += 1;
                if run_original == MAX_CONSECUTIVE_ORIGINAL + 1 {
                    out.push(RuleViolation::new(
                        item.id,
                        Rule::R2,
                        format!(
                            "Quá {MAX_CONSECUTIVE_ORIGINAL} đoạn giữ thoại gốc liền nhau — cần chèn lời bình."
                        ),
                    ));
                }
            } else {
                run_original = 0;
            }

            if idx > 0 {
                let prev = &self.items[idx - 1];
                if prev.source_idx != item.source_idx && item.keep_original {
                    out.push(RuleViolation::new(
                        item.id,
                        Rule::R3,
                        format!(
                            "Đổi sang video nguồn #{} nhưng đoạn này vẫn giữ thoại gốc — cần một câu nối lời bình.",
                            item.source_idx + 1
                        ),
                    ));
                }
            }
        }

        out
    }

    /// `R4` (thời gian hợp lệ + biên nguồn) và `R5` (chồng lấn cùng nguồn).
    fn check_time(
        &self,
        idx: usize,
        item: &RecapItem,
        source_durations: &[f64],
        out: &mut Vec<RuleViolation>,
    ) {
        let time_ok = item.start.is_finite()
            && item.end.is_finite()
            && item.start >= 0.0
            && item.end - item.start > EPS;
        if !time_ok {
            out.push(RuleViolation::new(
                item.id,
                Rule::R4,
                format!(
                    "Khoảng thời gian không hợp lệ ({:.2}s → {:.2}s): cần start ≥ 0 và end > start.",
                    item.start, item.end
                ),
            ));
            return;
        }

        if let Some(duration) = source_durations.get(item.source_idx) {
            if item.end > *duration + EPS {
                out.push(RuleViolation::new(
                    item.id,
                    Rule::R4,
                    format!(
                        "Đoạn vượt thời lượng video nguồn #{} ({:.1}s > {:.1}s).",
                        item.source_idx + 1,
                        item.end,
                        duration
                    ),
                ));
            }
        }

        for prev in self.items.iter().take(idx) {
            if prev.source_idx == item.source_idx && overlaps(prev, item) {
                out.push(RuleViolation::new(
                    item.id,
                    Rule::R5,
                    format!(
                        "Chồng thời gian với đoạn #{} trên cùng video nguồn #{}.",
                        prev.id,
                        item.source_idx + 1
                    ),
                ));
                return;
            }
        }
    }
}

fn item_secs(item: &RecapItem) -> f64 {
    (item.end - item.start).max(0.0)
}

fn overlaps(a: &RecapItem, b: &RecapItem) -> bool {
    a.start < b.end - EPS && b.start < a.end - EPS
}

#[cfg(test)]
#[path = "recap_script_tests.rs"]
mod recap_script_tests;
