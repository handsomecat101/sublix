//! TSK-LAB-CORE (C1) — chọn **mẩu cảnh** cho từng câu lời bình.
//!
//! Tách khỏi `allocate.rs` để mỗi file < 300 dòng (quy tắc `TSK-REFACTOR-SPLIT-300`);
//! `allocate.rs` lo kiểu dữ liệu + luồng chính, file này lo phần "chọn cảnh".
//!
//! Điểm quan trọng: một cảnh ứng viên có thể **bị cắt bởi vùng rác** (intro, quảng cáo
//! chen giữa) ⇒ cắt thành nhiều **mẩu sạch** ([`usable_parts`]) rồi mới chọn. Nhờ vậy
//! chỉ bỏ đúng phần rác chứ không vứt cả cảnh dài.

use crate::lab::junk_filter::JunkRange;

use super::allocate::{AllocateOptions, NarrationLine, SceneCandidate};

/// Sai số thời gian (giây).
pub(crate) const EPS: f64 = 1e-9;

/// Một mẩu cảnh sạch (đã trừ vùng rác).
#[derive(Debug, Clone, Copy)]
pub(crate) struct Part {
    pub source_idx: usize,
    pub start: f64,
    pub end: f64,
    pub score: f64,
}

/// Khoảng đã dùng (không được lấy lại).
#[derive(Debug, Clone, Copy)]
pub(crate) struct Used {
    pub source_idx: usize,
    pub start: f64,
    pub end: f64,
}

/// Đoạn được chọn cho một câu.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Clip {
    pub source_idx: usize,
    pub start: f64,
    pub end: f64,
    /// Số mẩu đã ghép (1 = một mẩu liền mạch).
    pub joined: usize,
}

/// Khoá xếp hạng — so sánh theo đúng thứ tự ưu tiên đã ghi trong `allocate.rs`.
#[derive(Debug, Clone, Copy)]
struct Rank {
    hint: bool,
    source: bool,
    chrono: bool,
    score: f64,
    start: f64,
}

impl Rank {
    fn better_than(&self, other: &Rank) -> bool {
        let lhs = (self.hint, self.source, self.chrono);
        let rhs = (other.hint, other.source, other.chrono);
        if lhs != rhs {
            return lhs > rhs;
        }
        if (self.score - other.score).abs() > 1e-9 {
            return self.score > other.score;
        }
        self.start < other.start - EPS
    }
}

/// Cắt từng cảnh ứng viên thành các mẩu không chứa vùng rác của cùng nguồn.
pub(crate) fn usable_parts(candidates: &[SceneCandidate], junk: &[JunkRange]) -> Vec<Part> {
    let mut parts = Vec::new();
    for candidate in candidates {
        if candidate.end - candidate.start <= EPS {
            continue;
        }
        let mut blockers: Vec<(f64, f64)> = junk
            .iter()
            .filter(|range| range.source_idx == candidate.source_idx)
            .map(|range| (range.start, range.end))
            .collect();
        blockers.sort_by(|a, b| a.0.total_cmp(&b.0));

        let mut cursor = candidate.start;
        for (start, end) in blockers {
            if end <= cursor {
                continue;
            }
            if start >= candidate.end {
                break;
            }
            if start > cursor {
                push_part(&mut parts, candidate, cursor, start.min(candidate.end));
            }
            cursor = cursor.max(end);
            if cursor >= candidate.end {
                break;
            }
        }
        if cursor < candidate.end {
            push_part(&mut parts, candidate, cursor, candidate.end);
        }
    }
    parts
}

fn push_part(parts: &mut Vec<Part>, candidate: &SceneCandidate, start: f64, end: f64) {
    if end - start > EPS {
        parts.push(Part {
            source_idx: candidate.source_idx,
            start,
            end,
            score: candidate.score,
        });
    }
}

/// Mẩu **đơn** dài ≥ `need`; đoạn `[start, start + need)` chưa bị dùng.
///
/// Một cảnh dài có thể phục vụ nhiều câu liên tiếp: nếu đầu mẩu đã bị dùng, lùi xuống
/// vị trí trống sớm nhất ([`free_start`]) thay vì vứt cả cảnh.
pub(crate) fn pick_single(
    parts: &[Part],
    line: &NarrationLine,
    need: f64,
    used: &[Used],
    last_end: &[f64],
) -> Option<Clip> {
    let mut best: Option<(Clip, Rank)> = None;
    for part in parts {
        if part.end - part.start < need {
            continue;
        }
        let Some(start) = free_start(part, need, used) else {
            continue;
        };
        let rank = rank_of(part, line, start, last_end);
        if best.as_ref().is_none_or(|(_, current)| rank.better_than(current)) {
            best = Some((
                Clip {
                    source_idx: part.source_idx,
                    start,
                    end: start + need,
                    joined: 1,
                },
                rank,
            ));
        }
    }
    best.map(|(clip, _)| clip)
}

/// Vị trí bắt đầu **trống sớm nhất** trong `part` cho đoạn dài `need` (nhảy qua đoạn đã dùng).
fn free_start(part: &Part, need: f64, used: &[Used]) -> Option<f64> {
    let mut start = part.start;
    loop {
        if start + need > part.end + EPS {
            return None;
        }
        match used.iter().find(|item| {
            item.source_idx == part.source_idx
                && item.start < start + need - EPS
                && start < item.end - EPS
        }) {
            Some(item) => start = item.end.max(start),
            None => return Some(start),
        }
    }
}

/// Ghép 2–3 mẩu **liền kề cùng nguồn** khi không mẩu nào đủ dài.
///
/// Điều kiện: khe hở giữa 2 mẩu ≤ `max_join_gap_secs`, cả khoảng `[start, start+need)`
/// không chứa rác và chưa bị dùng (nhờ vậy không "ghép qua" quảng cáo).
pub(crate) fn pick_join(
    parts: &[Part],
    junk: &[JunkRange],
    line: &NarrationLine,
    need: f64,
    used: &[Used],
    last_end: &[f64],
    options: &AllocateOptions,
) -> Option<Clip> {
    let mut sorted = parts.to_vec();
    sorted.sort_by(|a, b| {
        a.source_idx
            .cmp(&b.source_idx)
            .then(a.start.total_cmp(&b.start))
    });

    let mut best: Option<(Clip, Rank)> = None;
    for index in 0..sorted.len() {
        let source = sorted[index].source_idx;
        for count in 2..=options.max_join_segments {
            let Some(window) = sorted.get(index..index + count) else {
                break;
            };
            if window.iter().any(|part| part.source_idx != source) {
                break;
            }
            let gap_ok = window
                .windows(2)
                .all(|pair| pair[1].start - pair[0].end <= options.max_join_gap_secs);
            let start = window[0].start;
            let end = window[count - 1].end;
            let has_junk = junk
                .iter()
                .any(|range| range.source_idx == source && range.overlaps(start, start + need));
            if !gap_ok || end - start < need || blocked(source, start, start + need, used) || has_junk
            {
                continue;
            }
            let part = Part {
                source_idx: source,
                start,
                end,
                score: window.iter().map(|part| part.score).sum::<f64>() / count as f64,
            };
            let rank = rank_of(&part, line, start, last_end);
            if best.as_ref().is_none_or(|(_, current)| rank.better_than(current)) {
                best = Some((
                    Clip {
                        source_idx: source,
                        start,
                        end: start + need,
                        joined: count,
                    },
                    rank,
                ));
            }
        }
    }
    best.map(|(clip, _)| clip)
}

/// Chỉ số nguồn lớn nhất xuất hiện (để cấp mảng mốc "cuối nguồn").
pub(crate) fn max_source(parts: &[Part], lines: &[NarrationLine]) -> usize {
    let from_parts = parts.iter().map(|part| part.source_idx).max().unwrap_or(0);
    let from_lines = lines.iter().map(|line| line.source_idx).max().unwrap_or(0);
    from_parts.max(from_lines)
}

fn rank_of(part: &Part, line: &NarrationLine, start: f64, last_end: &[f64]) -> Rank {
    Rank {
        hint: part.source_idx == line.source_idx
            && part.start < line.hint_end
            && part.end > line.hint_start,
        source: part.source_idx == line.source_idx,
        chrono: start + EPS >= last_end.get(part.source_idx).copied().unwrap_or(0.0),
        score: part.score,
        start,
    }
}

fn blocked(source_idx: usize, start: f64, end: f64, used: &[Used]) -> bool {
    used.iter().any(|item| {
        item.source_idx == source_idx && item.start < end - EPS && start < item.end - EPS
    })
}
