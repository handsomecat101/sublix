//! TSK-V014-EXPORT-BURN/EXPORT-FIX — test thuần cho đồ thị xuất (không gọi ffmpeg).

use super::*;
use crate::dubbing::subtitle_burn::{BlurBand, BurnOptions};
use std::path::Path;

fn burn_opts<'a>(spans: &'a [(f64, f64)], ass: Option<&'a Path>) -> BurnOptions<'a> {
    BurnOptions {
        band: Some(BlurBand {
            y: 800,
            h: 120,
            x: 0,
            w: 1920,
        }),
        spans,
        blur_radius: 15,
        stamp_opacity: Some(STAMP_OPACITY),
        ass_path: ass,
        fonts_dir: None,
    }
}

#[test]
fn json_cu_khong_co_field_moi_van_parse() {
    // JSON lưu cũ (trước TSK-V014) không có `sub_style` / `hardsub` ⇒ vẫn đọc được.
    let json = r#"{
        "input_path": "C:/v.mp4",
        "media_duration_sec": 10.0,
        "speakers": [],
        "segments": [],
        "bgm_volume": 0.25,
        "voice_volume": 1.0,
        "dubbing_mode": "ducking"
    }"#;
    let project: super::super::DubbingProject =
        serde_json::from_str(json).expect("JSON cu phai parse duoc");
    assert_eq!(project.sub_style.mode, "normal", "mac dinh kieu phu de");
    assert_eq!(project.sub_style.position, "bottom");
    assert!(!project.hardsub.enabled, "mac dinh khong lam mo");
    assert!(project.hardsub.spans.is_empty());
    assert_eq!(project.hardsub.blur, "medium");
    assert_eq!(project.hardsub.scope, "text_only");
}

/// [TSK-V014-EXPORT-FIX] BẢNG TỔ HỢP: mọi nhãn đồ thị tạo ra đều phải được map.

#[test]
fn bang_to_hop_khong_co_nhan_treo() {
    let modes = ["multitrack", "mixed", "original"];
    let mut checked = 0;
    for mode in modes {
        for has_speech in [true, false] {
            for burn in [true, false] {
                let plan = plan_export(
                    mode,
                    has_speech,
                    if burn { Some(burn_opts(&[(0.5, 9.5)], None)) } else { None },
                    "0:v",
                    VIDEO_OUT_LABEL,
                    "[0:a]anull[final_audio]",
                );
                let dangling = plan.dangling_labels();
                assert!(
                    dangling.is_empty(),
                    "mode={mode} has_speech={has_speech} burn={burn} ⇒ nhan treo {dangling:?}"
                );
                // Mọi nhãn khai báo tạo đều phải xuất hiện trong đồ thị.
                for label in &plan.created_labels {
                    assert!(
                        plan.filter_complex.contains(&format!("[{label}]")),
                        "mode={mode} has_speech={has_speech} burn={burn}: thieu nhan [{label}] trong do thi"
                    );
                }
                // Multi-track có clip giọng ⇒ map thêm audio gốc.
                assert_eq!(
                    plan.map_original_audio,
                    mode == "multitrack" && has_speech,
                    "mode={mode} has_speech={has_speech}"
                );
                checked += 1;
            }
        }
    }
    assert_eq!(checked, 12, "phai kiem day du 3 x 2 x 2 to hop");
}

#[test]
fn khong_co_clip_giong_thi_khong_tao_nhan_audio() {
    // Lỗi thật: multi-track KHÔNG có clip giọng ⇒ argv không map [final_audio]
    // ⇒ đồ thị cũng không được tạo nhãn đó (ffmpeg báo unconnected).
    let plan = plan_export(
        "multitrack",
        false,
        Some(burn_opts(&[(0.5, 9.5)], None)),
        "0:v",
        VIDEO_OUT_LABEL,
        "[0:a]anull[final_audio]",
    );
    assert!(
        !plan.filter_complex.contains("[final_audio]"),
        "{}",
        plan.filter_complex
    );
    assert!(plan.mixed_audio_label.is_none());
    assert!(plan.dangling_labels().is_empty());
    assert!(plan.filter_complex.contains("[vout]"));
}

#[test]
fn original_only_thi_khong_tao_nhan_audio() {
    let plan = plan_export(
        "original",
        false,
        Some(burn_opts(&[(0.5, 9.5)], None)),
        "0:v",
        VIDEO_OUT_LABEL,
        "[0:a]anull[final_audio]",
    );
    assert!(!plan.filter_complex.contains("[final_audio]"));
    assert!(plan.mixed_audio_label.is_none());
    assert!(plan.dangling_labels().is_empty());
}

#[test]
fn mixed_thi_co_nhan_audio() {
    let plan = plan_export(
        "mixed",
        false,
        Some(burn_opts(&[(0.5, 9.5)], None)),
        "0:v",
        VIDEO_OUT_LABEL,
        "[0:a]anull[final_audio]",
    );
    assert!(plan.filter_complex.contains("[final_audio]"));
    assert!(plan.mixed_audio_label.is_some());
    assert!(plan.dangling_labels().is_empty());
}
