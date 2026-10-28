//! Test khớp cảnh (`allocate.rs`): đủ cảnh, ghép đoạn, tránh trùng, bỏ vùng rác, tôn
//! trọng vùng gợi ý, giữ thứ tự thời gian, và tỷ lệ thoại gốc.
//!
//! Chạy: `cargo test --lib lab`.

use super::*;
use crate::lab::junk_filter::{JunkRange, JunkReason};
use crate::lab::recap_script::Rule;

fn line(id: u32, tts: f64, source: usize, hint: (f64, f64)) -> NarrationLine {
    NarrationLine {
        id,
        text: format!("câu {id}"),
        tts_secs: tts,
        source_idx: source,
        hint_start: hint.0,
        hint_end: hint.1,
    }
}

fn cand(source: usize, start: f64, end: f64, score: f64) -> SceneCandidate {
    SceneCandidate {
        source_idx: source,
        start,
        end,
        score,
    }
}

fn junk(source: usize, start: f64, end: f64) -> JunkRange {
    JunkRange {
        source_idx: source,
        start,
        end,
        reasons: vec![JunkReason::Keyword("đăng ký kênh".to_string())],
    }
}

#[allow(clippy::too_many_arguments)]
fn input<'a>(
    lines: &'a [NarrationLine],
    candidates: &'a [SceneCandidate],
    junk: &'a [JunkRange],
    keep_original: &'a [KeepOriginalRequest],
    durations: &'a [f64],
    options: AllocateOptions,
) -> AllocateInput<'a> {
    AllocateInput {
        lines,
        candidates,
        junk,
        keep_original,
        source_durations: durations,
        options,
    }
}

fn plain<'a>(
    lines: &'a [NarrationLine],
    candidates: &'a [SceneCandidate],
    durations: &'a [f64],
) -> AllocateInput<'a> {
    input(lines, candidates, &[], &[], durations, AllocateOptions::default())
}

#[test]
fn du_canh_cho_moi_cau() {
    let lines = [line(1, 5.0, 0, (0.0, 60.0)), line(2, 4.0, 0, (60.0, 120.0))];
    let candidates = [cand(0, 0.0, 60.0, 5.0), cand(0, 60.0, 120.0, 5.0)];
    let durations = [200.0];
    let result = allocate(plain(&lines, &candidates, &durations));

    assert!(result.unplaced.is_empty());
    assert!(result.violations.is_empty(), "{:?}", result.violations);
    assert_eq!(result.script.items.len(), 2);
    let first = &result.script.items[0];
    assert_eq!((first.id, first.start, first.end), (1, 0.0, 5.3), "đệm 0,3 s");
    assert!(!first.keep_original);
    assert_eq!(first.narration, "câu 1");
    assert_eq!(first.tts_secs, Some(5.0));
    assert_eq!(result.script.items[1].start, 60.0);
    assert_eq!(result.original_ratio, 0.0);
}

#[test]
fn thieu_canh_dai_thi_ghep_doan_lien_ke() {
    let lines = [line(1, 5.0, 0, (0.0, 10.0))];
    // 2 mẩu 3 s + 4,5 s, cách nhau 0,5 s ⇒ không mẩu nào đủ 5,3 s.
    let candidates = [cand(0, 0.0, 3.0, 5.0), cand(0, 3.5, 8.0, 4.0)];
    let durations = [60.0];
    let result = allocate(plain(&lines, &candidates, &durations));

    assert!(result.unplaced.is_empty(), "ghép được nên không bỏ câu");
    assert_eq!(result.script.items.len(), 1);
    assert_eq!(result.script.items[0].start, 0.0);
    assert!((result.script.items[0].end - 5.3).abs() < 1e-9);
    assert!(
        result.notes.iter().any(|note| note.contains("ghép 2 đoạn")),
        "phải ghi rõ đã ghép: {:?}",
        result.notes
    );
}

#[test]
fn khong_lay_trung_canh_hai_lan() {
    let lines = [line(1, 2.0, 0, (0.0, 10.0)), line(2, 2.0, 0, (0.0, 10.0))];
    let candidates = [cand(0, 0.0, 10.0, 5.0)];
    let durations = [20.0];
    let result = allocate(plain(&lines, &candidates, &durations));

    assert_eq!(result.script.items.len(), 2);
    let (a, b) = (&result.script.items[0], &result.script.items[1]);
    assert!((a.start, a.end) == (0.0, 2.3));
    assert!(b.start + 1e-9 >= a.end, "câu sau phải nằm sau câu trước: {a:?} {b:?}");
    assert!(b.end <= 10.0);
    assert!(result.violations.is_empty());
}

#[test]
fn bo_vung_rac() {
    let lines = [line(1, 5.0, 0, (0.0, 60.0))];
    let candidates = [cand(0, 0.0, 60.0, 9.0)];
    let junk_ranges = [junk(0, 0.0, 10.0)];
    let durations = [60.0];
    let result = allocate(input(
        &lines,
        &candidates,
        &junk_ranges,
        &[],
        &durations,
        AllocateOptions::default(),
    ));

    assert_eq!(result.script.items.len(), 1);
    assert!((result.script.items[0].start - 10.0).abs() < 1e-9, "bắt đầu sau vùng rác");
}

#[test]
fn ton_trong_vung_goi_y_hon_diem_canh() {
    let lines = [line(1, 5.0, 0, (100.0, 120.0))];
    // Cảnh điểm 9 nằm ngoài vùng gợi ý; cảnh điểm 1 nằm trong vùng gợi ý.
    let candidates = [cand(0, 0.0, 20.0, 9.0), cand(0, 100.0, 120.0, 1.0)];
    let durations = [200.0];
    let result = allocate(plain(&lines, &candidates, &durations));

    assert!((result.script.items[0].start - 100.0).abs() < 1e-9);
}

#[test]
fn diem_canh_cao_thang_khi_cung_vung_goi_y() {
    let lines = [line(1, 5.0, 0, (0.0, 60.0))];
    let candidates = [cand(0, 0.0, 20.0, 3.0), cand(0, 30.0, 50.0, 8.0)];
    let durations = [60.0];
    let result = allocate(plain(&lines, &candidates, &durations));

    assert!((result.script.items[0].start - 30.0).abs() < 1e-9);
}

#[test]
fn giu_thu_tu_thoi_gian_trong_cung_nguon() {
    let lines = [line(1, 2.0, 0, (0.0, 100.0)), line(2, 2.0, 0, (0.0, 100.0))];
    // Cảnh ở 40 s đẹp hơn ⇒ câu 1 lấy 40 s; câu 2 không được quay lại 0 s.
    let candidates = [cand(0, 0.0, 10.0, 1.0), cand(0, 40.0, 50.0, 9.0)];
    let durations = [100.0];
    let result = allocate(plain(&lines, &candidates, &durations));

    let first = &result.script.items[0];
    let second = &result.script.items[1];
    assert!((first.start - 40.0).abs() < 1e-9, "câu 1 lấy cảnh điểm cao");
    assert!(second.start + 1e-9 >= first.end, "câu 2 đi tiếp: {second:?}");
}

#[test]
fn chen_thoai_goc_dat_ty_le_ba_muoi_phan_tram() {
    let lines = [line(1, 5.0, 0, (0.0, 60.0)), line(2, 5.0, 0, (0.0, 60.0))];
    let candidates = [cand(0, 0.0, 20.0, 5.0), cand(0, 20.0, 40.0, 5.0)];
    let keep = [KeepOriginalRequest {
        source_idx: 0,
        start: 30.0,
        end: 40.0,
    }];
    let durations = [40.0];
    let result = allocate(input(
        &lines,
        &candidates,
        &[],
        &keep,
        &durations,
        AllocateOptions::default(),
    ));

    assert_eq!(result.script.items.len(), 3);
    let last = &result.script.items[2];
    assert!(last.keep_original);
    assert!((last.start - 30.0).abs() < 1e-9);
    assert!(last.narration.is_empty(), "đoạn thoại gốc không cần narration");
    // N = 10,6 s ⇒ O = 0,3/0,7 · 10,6 ≈ 4,543 s
    assert!((result.original_ratio - 0.3).abs() < 1e-6, "ratio = {}", result.original_ratio);
    assert_eq!(result.script.items[0].id, 1);
    assert_eq!(last.id, 3);
    assert!(result.violations.is_empty(), "{:?}", result.violations);
}

#[test]
fn khong_chen_thoai_goc_khi_ty_le_bang_khong() {
    let lines = [line(1, 5.0, 0, (0.0, 60.0))];
    let candidates = [cand(0, 0.0, 20.0, 5.0)];
    let keep = [KeepOriginalRequest {
        source_idx: 0,
        start: 10.0,
        end: 20.0,
    }];
    let durations = [40.0];
    let options = AllocateOptions {
        target_original_ratio: 0.0,
        ..AllocateOptions::default()
    };
    let result = allocate(input(&lines, &candidates, &[], &keep, &durations, options));

    assert_eq!(result.script.items.len(), 1);
    assert!(result.script.items.iter().all(|item| !item.keep_original));
}

#[test]
fn khong_chen_thoai_goc_truoc_loi_binh_dau_tien() {
    let lines = [line(1, 5.0, 0, (0.0, 60.0))];
    let candidates = [cand(0, 20.0, 60.0, 5.0)];
    let keep = [KeepOriginalRequest {
        source_idx: 0,
        start: 0.0,
        end: 8.0,
    }];
    let durations = [60.0];
    let result = allocate(input(
        &lines,
        &candidates,
        &[],
        &keep,
        &durations,
        AllocateOptions::default(),
    ));

    assert!(!result.script.items[0].keep_original, "R1: không mở đầu bằng thoại gốc");
    assert!(!result.violations.iter().any(|v| v.rule == Rule::R1));
}

#[test]
fn bao_cau_chua_co_canh() {
    let lines = [line(7, 5.0, 0, (0.0, 60.0))];
    let durations = [60.0];
    let result = allocate(plain(&lines, &[], &durations));

    assert!(result.script.items.is_empty());
    assert_eq!(result.unplaced.len(), 1);
    assert_eq!(result.unplaced[0].line_id, 7);
    assert!(result.unplaced[0].reason.contains("không có cảnh"));
}

#[test]
fn validate_chay_sau_khi_khop() {
    // Video nguồn chỉ 4 s nhưng cảnh ứng viên dài 60 s ⇒ R4 phải lộ ra.
    let lines = [line(1, 5.0, 0, (0.0, 60.0))];
    let candidates = [cand(0, 0.0, 60.0, 5.0)];
    let durations = [4.0];
    let result = allocate(plain(&lines, &candidates, &durations));

    assert!(
        result.violations.iter().any(|v| v.rule == Rule::R4),
        "phải báo vượt thời lượng nguồn: {:?}",
        result.violations
    );
}

#[test]
fn thieu_vung_giu_thoai_goc_thi_ghi_chu() {
    let lines = [line(1, 5.0, 0, (0.0, 60.0))];
    let candidates = [cand(0, 0.0, 20.0, 5.0)];
    let keep = [KeepOriginalRequest {
        source_idx: 0,
        start: 10.0,
        end: 12.0,
    }];
    let durations = [60.0];
    let options = AllocateOptions {
        target_original_ratio: 0.5,
        ..AllocateOptions::default()
    };
    let result = allocate(input(&lines, &candidates, &[], &keep, &durations, options));

    assert_eq!(result.script.items.len(), 2);
    assert!(
        result.notes.iter().any(|note| note.contains("thoại gốc")),
        "phải nhắc người dùng đánh dấu thêm: {:?}",
        result.notes
    );
}
