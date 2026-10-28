//! TSK-V014-EXPORT-BURN/EXPORT-FIX — test thuần cho đồ thị xuất (không gọi ffmpeg).

use super::*;
use crate::dubbing::subtitle_burn::{BlurBand, BurnOptions};
use std::path::{Path, PathBuf};
use std::process::Command;

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
fn khong_burn_thi_do_thi_audio_y_het_cu() {
    let audio = "[0:a]anull[final_audio]";
    let input = ExportGraphInput {
        audio_graph: audio,
        burn: None,
        video_in: "0:v",
        video_out: VIDEO_OUT_LABEL,
    };
    let g = build_export_graph(&input);
    assert_eq!(g.filter_complex, audio, "phai y het chuoi do thi audio cu");
    assert!(!g.video_remapped, "khong burn thi copy thang 0:v?");
}

#[test]
fn burn_thi_ghep_video_truoc_audio() {
    let audio = "[0:a]anull[final_audio]";
    let input = ExportGraphInput {
        audio_graph: audio,
        burn: Some(burn_opts(&[(1.0, 2.0)], None)),
        video_in: "0:v",
        video_out: VIDEO_OUT_LABEL,
    };
    let g = build_export_graph(&input);
    assert!(g.video_remapped, "co burn thi phai map qua nhan [vout]");
    let i_video = g.filter_complex.find("split=2").expect("phai co nhanh video");
    let i_audio = g.filter_complex.find("final_audio").expect("phai co nhanh audio");
    assert!(i_video < i_audio, "video phai truoc audio: {}", g.filter_complex);
    assert!(g.filter_complex.contains("boxblur"), "{}", g.filter_complex);
    assert!(g.filter_complex.ends_with("[final_audio]"), "{}", g.filter_complex);
}

#[test]
fn burn_co_ass_thi_co_lenh_ass() {
    let ass = PathBuf::from("C:/tmp/burn.ass");
    let input = ExportGraphInput {
        audio_graph: "[0:a]anull[final_audio]",
        burn: Some(burn_opts(&[], Some(ass.as_path()))),
        video_in: "0:v",
        video_out: VIDEO_OUT_LABEL,
    };
    let g = build_export_graph(&input);
    assert!(g.filter_complex.contains("ass=filename="), "{}", g.filter_complex);
    assert!(g.filter_complex.contains("[vout]"), "{}", g.filter_complex);
}

#[test]
fn audio_rong_thi_chi_con_do_thi_video() {
    let input = ExportGraphInput {
        audio_graph: "",
        burn: Some(burn_opts(&[(0.0, 1.0)], None)),
        video_in: "0:v",
        video_out: VIDEO_OUT_LABEL,
    };
    let g = build_export_graph(&input);
    assert!(!g.filter_complex.contains(";;"), "{}", g.filter_complex);
    assert!(g.filter_complex.ends_with("[vout]"), "{}", g.filter_complex);
}

#[test]
fn blur_radius_theo_muc() {
    assert_eq!(blur_radius_for("light"), 8);
    assert_eq!(blur_radius_for("medium"), 15);
    assert_eq!(blur_radius_for("strong"), 25);
    assert_eq!(blur_radius_for("LIGHT"), 8, "khong phan biet hoa thuong");
    assert_eq!(blur_radius_for("rac"), 15, "gia tri la ⇒ mac dinh");
}

#[test]
fn stamp_opacity_la_055() {
    assert!((STAMP_OPACITY - 0.55).abs() < f32::EPSILON);
}

#[test]
fn scope_whole_thi_spans_rong() {
    // scope = whole ⇒ không có khoảng thời gian ⇒ không `enable` (làm mờ cả video).
    let input = ExportGraphInput {
        audio_graph: "[0:a]anull[final_audio]",
        burn: Some(burn_opts(&[], None)),
        video_in: "0:v",
        video_out: VIDEO_OUT_LABEL,
    };
    let g = build_export_graph(&input);
    assert!(!g.filter_complex.contains("enable"), "{}", g.filter_complex);
}

#[test]
fn nhan_dau_ra_video_khop_voi_do_thi() {
    let input = ExportGraphInput {
        audio_graph: "[0:a]anull[final_audio]",
        burn: Some(burn_opts(&[(0.5, 1.5)], None)),
        video_in: "0:v",
        video_out: VIDEO_OUT_LABEL,
    };
    let g = build_export_graph(&input);
    assert!(g.filter_complex.contains("[0:v]split=2"), "{}", g.filter_complex);
    assert!(g.filter_complex.contains("[vout]"), "{}", g.filter_complex);
}

/// Dựng argv ffmpeg GIỐNG HỆT phần map trong `export_dubbed_video` (để test bắt
/// được lỗi "nhãn treo" của BUG-R2-8-01).
fn ffmpeg_args(plan: &ExportPlan, src: &Path, out: &Path) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-y".to_string(),
        "-i".to_string(),
        src.to_string_lossy().to_string(),
    ];
    if !plan.filter_complex.is_empty() {
        args.push("-filter_complex".to_string());
        args.push(plan.filter_complex.clone());
    }
    // Video
    match &plan.video_label {
        Some(label) => {
            args.push("-map".to_string());
            args.push(format!("[{label}]"));
        }
        None => {
            args.push("-map".to_string());
            args.push("0:v?".to_string());
        }
    }
    args.push("-c:v".to_string());
    args.push("libx264".to_string());
    args.push("-preset".to_string());
    args.push("ultrafast".to_string());
    args.push("-crf".to_string());
    args.push("30".to_string());
    // Audio
    if plan.map_original_audio {
        args.push("-map".to_string());
        args.push("0:a:0?".to_string());
    }
    match &plan.mixed_audio_label {
        Some(label) => {
            args.push("-map".to_string());
            args.push(format!("[{label}]"));
        }
        None => {
            args.push("-map".to_string());
            args.push("0:a:0?".to_string());
        }
    }
    args.push("-c:a".to_string());
    args.push("aac".to_string());
    args.push(out.to_string_lossy().to_string());
    args
}

/// Số luồng audio của file (ffprobe). -1 = không probe được.
fn count_audio_streams(file: &Path) -> i32 {
    let Ok(out) = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
        ])
        .arg(file)
        .output()
    else {
        return -1;
    };
    if !out.status.success() {
        return -1;
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| !l.trim().is_empty())
        .count() as i32
}
