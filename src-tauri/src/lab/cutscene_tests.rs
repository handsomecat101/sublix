//! Test chấm điểm cutscene (`cutscene.rs`) — dữ liệu giả lập, không cần ffmpeg.
//!
//! Chạy: `cargo test --lib lab`.

use super::*;

fn line(start: f64, end: f64) -> DialogLine {
    DialogLine::new(start, end, "thoại")
}

fn letterbox(start: f64, end: f64, visible: f64) -> LetterboxRange {
    LetterboxRange {
        start,
        end,
        visible_ratio: visible,
    }
}

fn silence(start: f64, end: f64) -> SilenceRange {
    SilenceRange { start, end }
}

/// Thoại phủ kín `[from, to)` với từng câu 1 s (mật độ 1.0).
fn dialogue_cover(from: f64, to: f64) -> Vec<DialogLine> {
    let mut lines = Vec::new();
    let mut t = from;
    while t < to - 1e-9 {
        lines.push(line(t, (t + 1.0).min(to)));
        t += 1.0;
    }
    lines
}

#[test]
fn khong_doi_canh_thi_mot_doan() {
    let segments = score_scenes(&SceneInput::new(0, 30.0));
    assert_eq!(segments.len(), 1);
    assert_eq!((segments[0].start, segments[0].end), (0.0, 30.0));
    assert_eq!(segments[0].score, 0.0, "không có tín hiệu nào ⇒ điểm 0");
    assert_eq!(segments[0].source_idx, 0);
}

#[test]
fn chia_doan_theo_moc_cat() {
    let cuts = [10.0, 20.0];
    let mut input = SceneInput::new(2, 30.0);
    input.cuts = &cuts;
    let segments = score_scenes(&input);

    assert_eq!(segments.len(), 3);
    assert_eq!((segments[0].start, segments[0].end), (0.0, 10.0));
    assert_eq!((segments[1].start, segments[1].end), (10.0, 20.0));
    assert_eq!((segments[2].start, segments[2].end), (20.0, 30.0));
    assert!(segments.iter().all(|segment| segment.source_idx == 2));
}

#[test]
fn gop_doan_ngan_vao_doan_truoc() {
    let cuts = [0.8, 1.2, 10.0];
    let mut input = SceneInput::new(0, 30.0);
    input.cuts = &cuts;
    let segments = score_scenes(&input);

    assert_eq!(segments.len(), 2, "2 mẩu < 1,5 s bị gộp: {segments:?}");
    assert_eq!((segments[0].start, segments[0].end), (0.0, 10.0));
    assert_eq!((segments[1].start, segments[1].end), (10.0, 30.0));
}

#[test]
fn video_toan_doan_ngan_van_giu_mot_doan() {
    let mut input = SceneInput::new(0, 1.0);
    let segments = score_scenes(&input);
    assert_eq!(segments.len(), 1);
    assert_eq!((segments[0].start, segments[0].end), (0.0, 1.0));

    input.duration = 0.0;
    assert!(score_scenes(&input).is_empty(), "thời lượng 0 ⇒ không có đoạn");
    input.duration = -5.0;
    assert!(score_scenes(&input).is_empty());
}

#[test]
fn bo_moc_cat_ngoai_bien_va_sat_nhau() {
    let cuts = [-5.0, 0.0, 10.0, 10.05, 30.0, 45.0, f64::NAN];
    let mut input = SceneInput::new(0, 30.0);
    input.cuts = &cuts;
    let segments = score_scenes(&input);

    assert_eq!(segments.len(), 2, "{segments:?}");
    assert_eq!((segments[0].start, segments[0].end), (0.0, 10.0));
    assert_eq!((segments[1].start, segments[1].end), (10.0, 30.0));
}

#[test]
fn dai_den_day_du_va_thoai_day_du_diem_cao() {
    let letterbox_ranges = [letterbox(0.0, 20.0, 0.75)];
    let dialogue = dialogue_cover(0.0, 20.0);
    let mut input = SceneInput::new(0, 20.0);
    input.letterbox = &letterbox_ranges;
    input.dialogue = &dialogue;
    let segment = &score_scenes(&input)[0];

    assert_eq!(segment.features.letterbox_cover, 1.0);
    assert_eq!(segment.features.letterbox_strength, 1.0, "dải đen 25 % > 15 %");
    assert!((segment.features.dialogue_density - 1.0).abs() < 1e-9);
    // 0,50 (dải đen) + 0,30 (thoại) = 0,80
    assert!((segment.score - 0.8).abs() < 1e-9, "score = {}", segment.score);
}

#[test]
fn im_lang_dai_khong_thoai_diem_rat_thap() {
    let silence_ranges = [silence(0.0, 10.0)];
    let mut input = SceneInput::new(0, 10.0);
    input.silence = &silence_ranges;
    let segment = &score_scenes(&input)[0];

    assert_eq!(segment.features.silence_cover, 1.0);
    assert_eq!(segment.score, 0.0, "không tín hiệu + im lặng ⇒ 0");

    // Có dải đen nhưng im lặng hoàn toàn ⇒ vẫn bị phạt (nghi màn hình loading).
    let letterbox_ranges = [letterbox(0.0, 10.0, 0.75)];
    input.letterbox = &letterbox_ranges;
    let segment = &score_scenes(&input)[0];
    assert!(
        (segment.score - 0.125).abs() < 1e-9,
        "0,5 × 0,25 = 0,125 (đã phạt): {}",
        segment.score
    );
}

#[test]
fn im_lang_ngan_khong_bi_phat() {
    let letterbox_ranges = [letterbox(0.0, 10.0, 0.75)];
    let silence_ranges = [silence(0.0, 5.0)];
    let dialogue = vec![line(0.0, 1.0)];
    let mut input = SceneInput::new(0, 10.0);
    input.letterbox = &letterbox_ranges;
    input.silence = &silence_ranges;
    input.dialogue = &dialogue;
    let segment = &score_scenes(&input)[0];

    assert_eq!(segment.features.silence_cover, 0.5);
    assert!(segment.score > 0.5, "im lặng 50 % không phải loading: {}", segment.score);
}

#[test]
fn phu_de_cung_cong_diem() {
    let hardsub = [(0.0, 10.0)];
    let mut input = SceneInput::new(0, 10.0);
    input.hardsub = &hardsub;
    let segment = &score_scenes(&input)[0];

    assert_eq!(segment.features.hardsub_cover, 1.0);
    assert!((segment.score - W_HARDSUB).abs() < 1e-9, "score = {}", segment.score);
}

#[test]
fn dai_den_mot_nua_thoi_luong() {
    let letterbox_ranges = [letterbox(10.0, 20.0, 0.75)];
    let mut input = SceneInput::new(0, 20.0);
    input.letterbox = &letterbox_ranges;
    let segment = &score_scenes(&input)[0];

    assert_eq!(segment.features.letterbox_cover, 0.5);
    assert_eq!(segment.features.letterbox_strength, 1.0);
    assert!((segment.score - 0.25).abs() < 1e-9);
}

#[test]
fn dai_den_mong_diem_thap_hon_dai_den_day() {
    let mong = [letterbox(0.0, 10.0, 0.92)]; // 8 % chiều cao
    let mut input = SceneInput::new(0, 10.0);
    input.letterbox = &mong;
    let segment = &score_scenes(&input)[0];

    assert!(segment.features.letterbox_strength > 0.5);
    assert!(segment.features.letterbox_strength < 1.0);
    assert!(segment.score < W_LETTERBOX);
}

#[test]
fn mat_do_thoai_mot_nua() {
    let dialogue = dialogue_cover(0.0, 5.0);
    let mut input = SceneInput::new(0, 10.0);
    input.dialogue = &dialogue;
    let segment = &score_scenes(&input)[0];

    assert!((segment.features.dialogue_density - 0.5).abs() < 1e-9);
    assert!((segment.score - W_DIALOGUE).abs() < 1e-9, "0,5 > ngưỡng đầy ⇒ đủ điểm");
}

#[test]
fn doi_sang_kieu_ung_vien_cua_allocate() {
    let letterbox_ranges = [letterbox(0.0, 10.0, 0.75)];
    let hardsub = [(0.0, 10.0)];
    let mut input = SceneInput::new(3, 10.0);
    input.letterbox = &letterbox_ranges;
    input.hardsub = &hardsub;
    let segment = &score_scenes(&input)[0];
    let candidate = segment.to_candidate();

    assert_eq!(candidate.source_idx, 3);
    assert_eq!((candidate.start, candidate.end), (0.0, 10.0));
    assert!((candidate.score - (W_LETTERBOX + W_HARDSUB)).abs() < 1e-9);
    assert!((0.0..=1.0).contains(&candidate.score));
}

#[test]
fn diem_khong_bao_gio_vuot_mot() {
    let letterbox_ranges = [letterbox(0.0, 10.0, 0.5)];
    let hardsub = [(0.0, 10.0)];
    let dialogue = dialogue_cover(0.0, 10.0);
    let mut input = SceneInput::new(0, 10.0);
    input.letterbox = &letterbox_ranges;
    input.hardsub = &hardsub;
    input.dialogue = &dialogue;
    let segment = &score_scenes(&input)[0];

    assert!((0.0..=1.0).contains(&segment.score));
    assert!(segment.score >= 0.9);
}
