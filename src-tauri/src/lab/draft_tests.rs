//! Test logic thuần của bước C (`lab/draft.rs`).

use super::*;

fn item(id: u32, keep: bool, tts: Option<f64>) -> RecapItem {
    RecapItem {
        id,
        source_idx: 0,
        start: 0.0,
        end: 10.0,
        picture: "cảnh".to_string(),
        narration: "Câu lời bình.".to_string(),
        keep_original: keep,
        tts_secs: tts,
    }
}

fn segment(item: RecapItem, clips: Vec<(usize, f64, f64)>) -> DraftSegment {
    DraftSegment {
        item,
        tts_path: None,
        clips,
        timeline_start: 0.0,
    }
}

#[test]
fn timeline_cong_don_theo_thoi_luong_tts() {
    let segments = vec![
        segment(item(1, false, Some(4.0)), vec![(0, 0.0, 10.0)]),
        segment(item(2, false, Some(6.0)), vec![(0, 10.0, 20.0)]),
    ];
    let timeline = build_timeline(&segments);
    assert_eq!(timeline[0].timeline_start, 0.0);
    // Đoạn 1 lấy max(tts 4 s, clip 10 s) = 10 s.
    assert_eq!(timeline[1].timeline_start, 10.0);
    assert!((timeline_total(&timeline) - 20.0).abs() < 1e-6);
}

#[test]
fn timeline_doan_giu_tieng_goc_dung_do_dai_clip() {
    let segments = vec![
        segment(item(1, true, None), vec![(0, 5.0, 12.0)]),
        segment(item(2, false, Some(3.0)), vec![(0, 0.0, 5.0)]),
    ];
    let timeline = build_timeline(&segments);
    assert_eq!(timeline[0].timeline_start, 0.0);
    assert_eq!(timeline[1].timeline_start, 7.0, "đoạn gốc dài 7 s");
}

#[test]
fn timeline_rong_thi_bang_0() {
    assert_eq!(timeline_total(&[]), 0.0);
    assert!(build_timeline(&[]).is_empty());
}

#[test]
fn tach_cau_qua_dai() {
    let long = "Câu một. Câu hai. Câu ba. Câu bốn.";
    let parts = auto_split_long(long, 20);
    assert!(parts.len() >= 2, "phải tách, có {} phần", parts.len());
    for part in &parts {
        assert!(part.chars().count() <= 20 + 20, "phần quá dài: {part}");
    }
}

#[test]
fn tach_cau_ngan_khong_doi() {
    let short = "Câu một.";
    assert_eq!(auto_split_long(short, 100), vec!["Câu một.".to_string()]);
}

#[test]
fn chuyen_muc_bang_cau_luoi_binh() {
    let items = vec![item(1, false, Some(4.0)), item(2, false, None)];
    let lines = to_narration_lines(&items);
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0].id, 1);
    assert_eq!(lines[0].tts_secs, 4.0);
    assert!(
        lines[1].tts_secs > 0.0,
        "chưa có tts_secs ⇒ ước lượng theo công thức"
    );
}

#[test]
fn vung_giu_tieng_goc_chi_lay_muc_keep() {
    let items = vec![item(1, false, Some(2.0)), item(2, true, None)];
    let keep = to_keep_original(&items);
    assert_eq!(keep.len(), 1);
    assert_eq!(keep[0].start, 0.0);
}

#[test]
fn parse_khoang_thoi_gian() {
    let (start, end) = parse_range("00:00:15 - 00:00:45").expect("phải parse được");
    assert!((start - 15.0).abs() < 1e-6);
    assert!((end - 45.0).abs() < 1e-6);
    assert_eq!(parse_range("không có"), None);
    assert_eq!(parse_range("00:00:45 - 00:00:15"), None, "end <= start ⇒ None");
}

#[test]
fn parse_khoang_co_mui_tien() {
    let (start, end) = parse_range("00:01:00 → 00:02:00").expect("phải parse được");
    assert!((start - 60.0).abs() < 1e-6);
    assert!((end - 120.0).abs() < 1e-6);
}
