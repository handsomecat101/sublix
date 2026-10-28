//! Test parser ffmpeg bằng **đầu ra thật** lưu trong `fixtures/` + 1 test `#[ignore]` đo
//! thật bằng ffmpeg trên máy.
//!
//! Mẫu trong `fixtures/` (ffmpeg 9.0.2, 2026-10-28):
//! - `probe_30s_*`: video thật `hardsub_zh_30s.mp4` (1280×720, có tiếng, không dải đen,
//!   không đổi cảnh) — ca "video bình thường".
//! - `probe_letterbox_*`: clip 6 s tổng hợp bằng `lavfi` (3 màu ⇒ 2 mốc cắt ở 2 s và 4 s,
//!   pad thành 1280×960 ⇒ dải đen 25 %, `anullsrc` ⇒ im lặng toàn bộ).
//!
//! Chạy: `cargo test --lib lab` (thêm `-- --ignored` để đo thật).

use std::path::Path;
use std::sync::atomic::AtomicBool;

use super::*;
use crate::lab::probe_parse::{
    letterbox_ranges, parse_metadata, parse_progress, parse_silence, scene_cuts, video_features,
};

const LB_META: &str = include_str!("fixtures/probe_letterbox_metadata.txt");
const LB_STDERR: &str = include_str!("fixtures/probe_letterbox_stderr.txt");
const V30_META: &str = include_str!("fixtures/probe_30s_metadata.txt");
const V30_STDERR: &str = include_str!("fixtures/probe_30s_stderr.txt");

#[test]
fn doc_metadata_clip_letterbox() {
    let frames = parse_metadata(LB_META);
    assert_eq!(frames.len(), 12, "6 s × 2 khung/giây");
    assert_eq!(frames[0].time, 0.0);
    assert_eq!(frames[4].time, 2.0, "pts_time đọc đúng");
    assert_eq!(frames[4].visible, Some((320, 180)), "cropdetect w/h");
    assert!(
        frames[0].visible.is_none(),
        "khung đầu chưa có cropdetect — phải là None, không phải (0,0)"
    );
    assert!(
        (frames[4].scene_score.unwrap_or(0.0) - 11.719).abs() < 1e-6,
        "score 0–100 giữ nguyên như ffmpeg"
    );
}

#[test]
fn doc_metadata_video_that_30s() {
    let frames = parse_metadata(V30_META);
    assert_eq!(frames.len(), 60);
    assert!(frames.iter().all(|frame| frame.scene_score.is_some()));
    assert_eq!(frames[3].visible, Some((320, 180)));
    assert!(frames[4].scene_score.unwrap_or(1.0) < 10.0, "clip này không có cắt cảnh");
}

#[test]
fn moc_cat_canh_theo_nguong() {
    let frames = parse_metadata(LB_META);
    assert_eq!(scene_cuts(&frames, 0.10), vec![2.0, 4.0], "score 11,7 % > 10 %");
    assert!(scene_cuts(&frames, 0.5).is_empty(), "ngưỡng 50 % ⇒ không có cắt");

    let binh_thuong = parse_metadata(V30_META);
    assert!(
        scene_cuts(&binh_thuong, 0.10).is_empty(),
        "video thật 30 s không có cú cắt nào vượt 10 %"
    );
}

#[test]
fn dai_den_clip_letterbox() {
    let frames = parse_metadata(LB_META);
    let ranges = letterbox_ranges(&frames, 320, 240, 6.0);
    assert_eq!(ranges.len(), 1, "một khoảng liên tục: {ranges:?}");
    assert!((ranges[0].start - 1.0).abs() < 1e-9, "bắt đầu từ khung có cropdetect đầu tiên");
    assert!((ranges[0].end - 6.0).abs() < 1e-9);
    assert!(
        (ranges[0].visible_ratio - 0.75).abs() < 1e-6,
        "180/240 = 0,75: {}",
        ranges[0].visible_ratio
    );
}

#[test]
fn khong_co_dai_den_o_video_16_9() {
    let frames = parse_metadata(V30_META);
    assert!(letterbox_ranges(&frames, 320, 180, 30.0).is_empty());
    assert!(letterbox_ranges(&frames, 0, 0, 30.0).is_empty(), "kích thước 0 ⇒ rỗng");
}

#[test]
fn khoang_im_lang_tu_stderr_that() {
    let ranges = parse_silence(LB_STDERR, 6.0);
    assert_eq!(ranges.len(), 1);
    assert!((ranges[0].start - 0.0).abs() < 1e-9);
    assert!((ranges[0].end - 6.0).abs() < 1e-9);

    assert!(
        parse_silence(V30_STDERR, 30.0).is_empty(),
        "video thật có nhạc nền liên tục ⇒ không có khoảng im lặng nào"
    );
}

#[test]
fn im_lang_khong_co_silence_end_thi_dong_bang_thoi_luong() {
    // ffmpeg không in `silence_end` khi video hết lúc vẫn im lặng.
    let stderr = "[Parsed_silencedetect_0 @ 0000] silence_start: 12.5\n";
    let ranges = parse_silence(stderr, 20.0);
    assert_eq!(ranges.len(), 1);
    assert_eq!(ranges[0].start, 12.5);
    assert_eq!(ranges[0].end, 20.0);
}

#[test]
fn nhieu_khoang_im_lang_va_dong_rac() {
    let stderr = "\
[Parsed_silencedetect_0 @ 1] silence_start: 1
[Parsed_silencedetect_0 @ 1] silence_end: 2.5 | silence_duration: 1.5
frame=  120 fps=0.0 q=-0.0 Lsize=N/A time=00:00:05.00
[Parsed_silencedetect_0 @ 1] silence_start: 4
[Parsed_silencedetect_0 @ 1] silence_end: 4.6 | silence_duration: 0.6
";
    let ranges = parse_silence(stderr, 5.0);
    assert_eq!(ranges.len(), 2);
    assert_eq!((ranges[0].start, ranges[0].end), (1.0, 2.5));
    assert_eq!((ranges[1].start, ranges[1].end), (4.0, 4.6));
}

#[test]
fn doc_tien_do_tu_progress() {
    assert_eq!(parse_progress("out_time_us=6000000"), Some(6.0));
    assert_eq!(parse_progress("  out_time_us=250000  "), Some(0.25));
    assert_eq!(parse_progress("out_time_ms=N/A"), None);
    assert_eq!(parse_progress("out_time_us=-1"), None);
    assert_eq!(parse_progress("frame=12"), None);
}

#[test]
fn ghep_dac_trung_mot_video() {
    let frames = parse_metadata(LB_META);
    let features = video_features(&frames, LB_STDERR, 6.0, 320, 240, 0.10);
    assert_eq!(features.cuts, vec![2.0, 4.0]);
    assert_eq!(features.letterbox.len(), 1);
    assert_eq!(features.silence.len(), 1);
    assert_eq!(features.frames, 12);
    assert!(features.has_audio);

    let khong_tieng = video_features(&frames, "Stream #0:0: Video: h264", 6.0, 320, 240, 0.10);
    assert!(!khong_tieng.has_audio, "không có dòng Audio ⇒ biết là video câm");
    assert!(khong_tieng.silence.is_empty());
}

#[test]
fn metadata_hong_khong_lam_panic() {
    assert!(parse_metadata("").is_empty());
    assert!(parse_metadata("lavfi.scd.score=5\nframe:1 pts:1 pts_time:0.5\nlavfi.scd.score=7.5")
        .iter()
        .any(|frame| frame.time == 0.5));
}

#[test]
#[ignore = "chạy ffmpeg thật trên máy — bật bằng: cargo test --lib lab -- --ignored"]
fn do_that_bang_ffmpeg() {
    let ffmpeg = crate::dubbing::find_ffmpeg();
    let videos = [
        (
            "hardsub_zh_30s (30 s, 1280×720)",
            r"C:\Users\haiba\AppData\Local\Temp\claude\C--AI-Project-Sublix\552b7175-5967-4bd5-92bb-b386a0753c6e\fixtures\hardsub_zh_30s.mp4",
        ),
        (
            "Elden Ring clip",
            r"C:\Users\haiba\Downloads\Sublix Downloads\New Way To Dodge Malenia's Waterfowl Dance (TRY THIS) [o_Y-pBwQZrw].mp4",
        ),
    ];

    for (label, path) in videos {
        let path = Path::new(path);
        if !path.exists() {
            eprintln!("⏭  bỏ qua {label}: không có tệp");
            continue;
        }
        let cancel = AtomicBool::new(false);
        let mut last = 0.0;
        let started = std::time::Instant::now();
        let features = probe_video(&ffmpeg, path, &cancel, &mut |percent| last = percent)
            .expect("probe phải chạy được");
        let wall = started.elapsed().as_secs_f64();
        let per_minute = if features.duration > 0.0 {
            wall * 60.0 / features.duration
        } else {
            0.0
        };
        eprintln!(
            "✅ {label}: {:.1}s video → chạy {:.2}s (≈ {:.0}× thời gian thực, ~{:.1}s mỗi phút video) | khung {} | cắt cảnh {} | dải đen {} | im lặng {} | tiến độ cuối {:.0}%",
            features.duration,
            wall,
            features.duration / wall.max(0.001),
            per_minute,
            features.frames,
            features.cuts.len(),
            features.letterbox.len(),
            features.silence.len(),
            last
        );
        assert!(features.frames > 0);
        assert!(last >= 99.0);
        assert!(per_minute < 10.0, "1 phút video phải chạy dưới 10 s");
    }
}
