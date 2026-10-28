//! TSK-LAB-CORE (C1) — chèn **đoạn giữ thoại gốc** đạt tỷ lệ người dùng chọn.
//!
//! Tách khỏi `allocate.rs` để mỗi file < 300 dòng. Luật (NarratoAI §4.3 + luật dựng):
//!
//! - Tỷ lệ hiểu là `O / (N + O)` ⇒ cần `O = ratio/(1-ratio) · N` (`N` = tổng giây lời bình).
//! - Chỉ chèn **sau một đoạn lời bình cùng nguồn** ⇒ không phạm `R3` (đổi nguồn giữa 2
//!   đoạn liền nhau mà đoạn sau giữ thoại gốc) và không mở đầu bằng thoại gốc (`R1`).
//! - Vì chèn sau lời bình nên chuỗi `keep_original` luôn bắt đầu lại ⇒ không quá 2 liền
//!   nhau (`R2`); nếu đoạn kế tiếp là thoại gốc của **nguồn khác** thì bỏ (giữ `R3`).
//! - Không lấy vùng rác và không lấy lại cảnh đã dùng cho lời bình.

use crate::lab::junk_filter::JunkRange;
use crate::lab::recap_script::RecapItem;

use super::allocate::{AllocateOptions, KeepOriginalRequest};

const EPS: f64 = 1e-9;

/// Chèn các đoạn thoại gốc vào `items` (đã là thứ tự phát) cho tới khi đạt tỷ lệ đích.
pub(crate) fn insert_original(
    items: &mut Vec<RecapItem>,
    requests: &[KeepOriginalRequest],
    junk: &[JunkRange],
    options: &AllocateOptions,
    notes: &mut Vec<String>,
) {
    let ratio = options.target_original_ratio.clamp(0.0, 0.95);
    let narration: f64 = items.iter().map(|item| item.end - item.start).sum();
    if ratio <= EPS || narration <= EPS {
        return;
    }
    let target = ratio / (1.0 - ratio) * narration;
    let mut inserted = 0.0;

    for request in requests {
        let remaining = target - inserted;
        if remaining < options.min_original_secs {
            break;
        }
        let Some((start, end)) = usable_piece(request, junk) else {
            notes.push(format!(
                "Bỏ vùng giữ thoại gốc nguồn #{} ({:.1}s–{:.1}s) vì nằm trong vùng rác.",
                request.source_idx + 1,
                request.start,
                request.end
            ));
            continue;
        };
        if end - start < options.min_original_secs {
            notes.push(format!(
                "Vùng giữ thoại gốc nguồn #{} quá ngắn ({:.1}s) sau khi trừ rác — bỏ qua.",
                request.source_idx + 1,
                end - start
            ));
            continue;
        }
        let clip_end = start + (end - start).min(remaining);

        let Some(pos) = insertion_point(items, request.source_idx, start) else {
            notes.push(format!(
                "Không chèn được thoại gốc nguồn #{} ({:.1}s) — chưa có đoạn lời bình cùng nguồn đứng trước.",
                request.source_idx + 1,
                start
            ));
            continue;
        };
        if overlaps(items, request.source_idx, start, clip_end) {
            notes.push(format!(
                "Không chèn thoại gốc nguồn #{} ({:.1}s–{:.1}s) — trùng cảnh đã dùng cho lời bình.",
                request.source_idx + 1,
                start,
                clip_end
            ));
            continue;
        }
        if let Some(next) = items.get(pos) {
            if next.keep_original && next.source_idx != request.source_idx {
                notes.push(format!(
                    "Không chèn thoại gốc nguồn #{} ({:.1}s) — sẽ phạm luật “đổi nguồn phải có câu nối”.",
                    request.source_idx + 1,
                    start
                ));
                continue;
            }
        }

        items.insert(
            pos,
            RecapItem {
                id: 0,
                source_idx: request.source_idx,
                start,
                end: clip_end,
                picture: String::new(),
                narration: String::new(),
                keep_original: true,
                tts_secs: None,
            },
        );
        inserted += clip_end - start;
    }

    if ratio > EPS && inserted + EPS < target {
        notes.push(format!(
            "Chỉ chèn được {:.1}s thoại gốc trên {:.1}s cần cho tỷ lệ {:.0}% — hãy đánh dấu thêm vùng giữ thoại gốc.",
            inserted,
            target,
            ratio * 100.0
        ));
    }
}

/// Vị trí chèn = ngay sau đoạn lời bình **cùng nguồn** cuối cùng bắt đầu trước `start`.
fn insertion_point(items: &[RecapItem], source_idx: usize, start: f64) -> Option<usize> {
    let mut found = None;
    for (index, item) in items.iter().enumerate() {
        if !item.keep_original && item.source_idx == source_idx && item.start <= start + EPS {
            found = Some(index + 1);
        }
    }
    found
}

/// Phần dài nhất của `[request.start, request.end)` không chứa vùng rác.
fn usable_piece(request: &KeepOriginalRequest, junk: &[JunkRange]) -> Option<(f64, f64)> {
    let mut blockers: Vec<(f64, f64)> = junk
        .iter()
        .filter(|range| {
            range.source_idx == request.source_idx && range.overlaps(request.start, request.end)
        })
        .map(|range| (range.start, range.end))
        .collect();
    blockers.sort_by(|a, b| a.0.total_cmp(&b.0));

    let mut cursor = request.start;
    let mut best: Option<(f64, f64)> = None;
    let mut consider = |start: f64, end: f64| {
        if end - start > EPS && best.is_none_or(|(bs, be)| end - start > be - bs) {
            best = Some((start, end));
        }
    };
    for (start, end) in blockers {
        if start > cursor {
            consider(cursor, start.min(request.end));
        }
        cursor = cursor.max(end);
    }
    if cursor < request.end {
        consider(cursor, request.end);
    }
    best
}

fn overlaps(items: &[RecapItem], source_idx: usize, start: f64, end: f64) -> bool {
    items.iter().any(|item| {
        item.source_idx == source_idx && item.start < end - EPS && start < item.end - EPS
    })
}
