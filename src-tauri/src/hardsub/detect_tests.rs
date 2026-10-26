//! Test phần thuần của dò phụ đề cứng thật: thông số video, vùng cắt, đọc đầu ra sidecar,
//! đổi toạ độ ảnh cắt → khung gốc, và nối với `detect_band`. Không cần model / ffmpeg.
//! Chạy: `cargo test --lib hardsub`

use super::band::{detect_band, BandOptions, Region};
use super::boxes::*;
use super::detect::{DetectError, ERR_MODEL_MISSING};

const PROBE: &str = "Input #0, mov,mp4, from 'a.mp4':\n  Duration: 00:01:00.00, start: 0.000000, bitrate: 1660 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 1659 kb/s, 10 fps\n  Stream #0:1: Audio: aac, 48000 Hz, stereo\n";

#[test]
fn probe_reads_size_and_duration() {
    let i = parse_probe(PROBE).expect("phải đọc được");
    assert_eq!((i.width, i.height), (1280, 720));
    assert!((i.duration - 60.0).abs() < 1e-6);
}

#[test]
fn probe_ignores_hex_codec_tag_and_rejects_audio_only() {
    // "0x31637661" không được hiểu nhầm là kích thước.
    assert!(parse_probe("Duration: 00:00:10.5, x\n Stream: Audio: aac, 48000 Hz").is_none());
    let i = parse_probe("Duration: 01:02:03.50, s\n Stream #0:0: Video: hevc, yuv420p, 3840x2160, 30 fps").unwrap();
    assert_eq!((i.width, i.height), (3840, 2160));
    assert!((i.duration - 3723.5).abs() < 1e-6);
}

#[test]
fn crop_rect_per_region_is_even_and_inside_frame() {
    assert_eq!(crop_rect(1920, 1080, Region::Bottom), CropRect { x: 0, y: 540, w: 1920, h: 540 });
    assert_eq!(crop_rect(1920, 1080, Region::Top), CropRect { x: 0, y: 0, w: 1920, h: 540 });
    assert_eq!(crop_rect(1921, 1081, Region::Any), CropRect { x: 0, y: 0, w: 1920, h: 1080 });
    let b = crop_rect(1280, 718, Region::Bottom);
    assert_eq!(b.y + b.h, 718);
    assert_eq!(b.h % 2, 0);
}

#[test]
fn expected_frames_rounds_up() {
    assert_eq!(expected_frames(60.0, 1.0), 60);
    assert_eq!(expected_frames(10.2, 1.0), 11);
    assert_eq!(expected_frames(0.0, 1.0), 0);
}

#[test]
fn sidecar_lines_are_parsed() {
    assert_eq!(parse_sidecar_line("PROG 3 60"), Some(SidecarLine::Progress { done: 3, total: 60 }));
    assert_eq!(
        parse_sidecar_line("ERR model_load InferenceSession: bad file"),
        Some(SidecarLine::Error { code: "model_load".into(), message: "InferenceSession: bad file".into() })
    );
    assert_eq!(parse_sidecar_line("some onnxruntime warning"), None);
    assert_eq!(parse_sidecar_line("RESULT {not json"), None);
    let line = r#"RESULT {"width":960,"height":256,"frames":[{"t":0.0,"boxes":[]},{"t":1.0,"boxes":[[0.1,0.5,0.9,0.75,0.98]]}]}"#;
    match parse_sidecar_line(line) {
        Some(SidecarLine::Result(r)) => {
            assert_eq!(r.frames.len(), 2);
            assert_eq!(r.frames[1].boxes[0], [0.1, 0.5, 0.9, 0.75, 0.98]);
        }
        other => panic!("sai: {other:?}"),
    }
}

fn result_with(boxes: Vec<[f32; 5]>) -> SidecarResult {
    SidecarResult { frames: vec![SidecarFrame { t: 2.0, boxes }] }
}

#[test]
fn boxes_scale_from_crop_back_to_full_frame() {
    // Vùng cắt = nửa dưới 1920x1080 ⇒ gốc (0,540), kích thước 1920x540.
    let crop = crop_rect(1920, 1080, Region::Bottom);
    let f = to_frame_boxes(&result_with(vec![[0.25, 0.5, 0.75, 0.9, 0.9]]), crop, 1920, 1080);
    let b = f[0].boxes[0];
    assert_eq!(f[0].t, 2.0);
    assert!((b.x - 480.0).abs() < 0.01 && (b.w - 960.0).abs() < 0.01);
    assert!((b.y - 810.0).abs() < 0.01 && (b.h - 216.0).abs() < 0.01);
    assert!((b.score - 0.9).abs() < 1e-6);
}

#[test]
fn boxes_are_clamped_and_degenerate_ones_dropped() {
    let crop = crop_rect(1280, 720, Region::Top);
    let f = to_frame_boxes(&result_with(vec![[-0.2, 0.9, 1.4, 1.3, 0.8], [0.5, 0.5, 0.5, 0.6, 0.9]]), crop, 1280, 720);
    assert_eq!(f[0].boxes.len(), 1, "hộp rộng 0 bị bỏ");
    let b = f[0].boxes[0];
    assert!(b.x >= 0.0 && b.x + b.w <= 1280.0 + 0.01);
    assert!(b.y + b.h <= 360.0 + 0.01, "không vượt vùng cắt");
}

#[test]
fn full_chain_finds_band_in_bottom_and_none_when_empty() {
    let crop = crop_rect(1280, 720, Region::Bottom);
    let mk = |on: bool| SidecarFrame {
        t: 0.0,
        boxes: if on { vec![[0.2, 0.55, 0.8, 0.85, 0.99]] } else { vec![] },
    };
    let mut frames = Vec::new();
    for i in 0..60 {
        let mut f = mk((10..30).contains(&i) || (40..50).contains(&i));
        f.t = i as f64;
        frames.push(f);
    }
    let boxes = to_frame_boxes(&SidecarResult { frames }, crop, 1280, 720);
    let r = detect_band(&boxes, 1280, 720, &BandOptions::default());
    let band = r.band.expect("phải thấy dải");
    assert!(band.y >= 360 && band.y + band.h <= 720);
    assert_eq!(r.spans.len(), 2);
    assert!((r.spans[0].0 - 9.5).abs() < 1e-6 && (r.spans[0].1 - 29.5).abs() < 1e-6);

    let empty = to_frame_boxes(&SidecarResult { frames: (0..20).map(|_| mk(false)).collect() }, crop, 1280, 720);
    assert!(detect_band(&empty, 1280, 720, &BandOptions::default()).band.is_none());
}

#[test]
fn error_display_starts_with_machine_code() {
    let e = DetectError { code: ERR_MODEL_MISSING, message: "thiếu".into() };
    assert!(e.to_string().starts_with("HARDSUB_MODEL_MISSING: "));
}
