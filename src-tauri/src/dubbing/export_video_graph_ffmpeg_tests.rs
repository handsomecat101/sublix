//! TSK-V014-EXPORT-FIX — test ffmpeg THẬT cho mọi chế độ âm thanh × burn.
//!
//! Chạy: `cargo test --lib export_video_graph -- --ignored --nocapture`

use super::*;
use crate::dubbing::subtitle_burn::{BlurBand, BurnOptions};
use std::path::Path;
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

/// [TSK-V014-EXPORT-FIX] Test ffmpeg THẬT cho 4 ca báo lỗi:
/// multi-track+burn+0 câu · multi-track+burn+2 câu · original-only+burn · mixed+burn.
///
/// Chạy: `cargo test --lib export_video_graph -- --ignored --nocapture`
#[test]
#[ignore = "can ffmpeg+ffprobe trong PATH (chay lau ~10-40s)"]
fn xuat_that_moi_che_do_am_thanh_deu_exit_0() {
    match Command::new("ffmpeg").arg("-version").output() {
        Ok(out) if out.status.success() => {}
        _ => {
            eprintln!("BO QUA: khong co ffmpeg trong PATH");
            return;
        }
    }

    let dir = std::env::temp_dir().join("sublix_export_modes_test");
    let _ = std::fs::create_dir_all(&dir);
    let src = dir.join("src.mp4");

    // Video 10s có dải chữ cứng ở đáy + LUỒNG AUDIO (để map 0:a:0? hợp lệ).
    let make = Command::new("ffmpeg")
        .args(["-y", "-f", "lavfi", "-i", "color=c=navy:s=640x360:r=24:d=10"])
        .args([
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=10:sample_rate=44100",
        ])
        .args([
            "-vf",
            "drawbox=x=0:y=260:w=640:h=100:color=white:t=fill",
        ])
        .args([
            "-shortest",
            "-pix_fmt",
            "yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
        ])
        .arg(&src)
        .output();
    let make = match make {
        Ok(o) => o,
        Err(err) => {
            eprintln!("BO QUA: khong chay duoc ffmpeg ({err})");
            return;
        }
    };
    assert!(
        make.status.success(),
        "khong tao duoc video thu: {}",
        String::from_utf8_lossy(&make.stderr)
    );

    let seg_with_text = |id: usize, start: f64, end: f64, text: &str| super::super::DubbingSegment {
        id,
        speaker_id: "speaker_0".to_string(),
        start_sec: start,
        end_sec: end,
        original_text: text.to_string(),
        dubbed_text: text.to_string(),
        audio_duration_sec: None,
        status: "ready".to_string(),
    };
    let two_segments = vec![
        seg_with_text(1, 1.0, 4.0, "Chúng ta phải rút lui ngay lập tức."),
        seg_with_text(2, 5.0, 8.0, "Con đường phía bắc vẫn còn chút hy vọng."),
    ];

    let make_project = |segments: Vec<super::super::DubbingSegment>| super::super::DubbingProject {
        input_path: src.to_string_lossy().to_string(),
        media_duration_sec: 10.0,
        speakers: vec![],
        segments,
        bgm_volume: 0.25,
        voice_volume: 1.0,
        dubbing_mode: "ducking".to_string(),
        time_limit_sec: None,
        diarization_engine: None,
        transcript_source: None,
        peaks: None,
        filmstrip_thumbs: None,
        sub_export_mode: Some("hardsub".to_string()),
        audio_export_mode: Some("mixed".to_string()),
        target_lang: Some("vi".to_string()),
        sub_style: super::super::SubStyle {
            mode: "normal".to_string(),
            preset: "normal".to_string(),
            font_size: 40,
            position: "bottom".to_string(),
        },
        hardsub: super::super::HardSubConfig {
            enabled: true,
            band: Some(crate::dubbing::subtitle_burn::BlurBand {
                y: 260,
                h: 100,
                x: 0,
                w: 640,
            }),
            spans: vec![(0.5, 9.5)],
            blur: "medium".to_string(),
            stamp: true,
            scope: "text_only".to_string(),
        },
    };

    // (tên ca, chế độ audio, có clip giọng, có câu phụ đề, số luồng audio kỳ vọng)
    let cases: Vec<(&str, &str, bool, bool, i32)> = vec![
        ("multitrack_burn_0cau", "multitrack", false, false, 1),
        ("multitrack_burn_2cau", "multitrack", true, true, 2),
        ("original_burn_2cau", "original", false, true, 1),
        ("mixed_burn_2cau", "mixed", false, true, 1),
    ];

    for (name, mode, has_speech, has_segments, expect_audio) in cases {
        let project = make_project(if has_segments {
            two_segments.clone()
        } else {
            Vec::new()
        });
        let (ass_path, fonts) =
            prepare_burn_ass(&project, &dir, std::path::Path::new("ffmpeg")).expect("ghi ASS");
        let spans = project.hardsub.spans.clone();
        let burn = BurnOptions {
            band: project.hardsub.band,
            spans: &spans,
            blur_radius: blur_radius_for(&project.hardsub.blur),
            stamp_opacity: if project.hardsub.stamp {
                Some(STAMP_OPACITY)
            } else {
                None
            },
            ass_path: Some(ass_path.as_path()),
            fonts_dir: fonts.as_ref().map(|p| p.as_path()),
        };
        let plan = plan_export(
            mode,
            has_speech,
            Some(burn),
            "0:v",
            VIDEO_OUT_LABEL,
            "[0:a]anull[final_audio]",
        );
        assert!(
            plan.dangling_labels().is_empty(),
            "{name}: nhan treo {:?}",
            plan.dangling_labels()
        );

        let out = dir.join(format!("{name}.mp4"));
        let args = ffmpeg_args(&plan, &src, &out);
        let run = Command::new("ffmpeg").args(&args).output().expect("chay ffmpeg");
        assert!(
            run.status.success(),
            "{name} FAIL:\n{}\n--- args ---\n{:?}\n--- graph ---\n{}",
            String::from_utf8_lossy(&run.stderr),
            args,
            plan.filter_complex
        );
        let n_audio = count_audio_streams(&out);
        assert_eq!(
            n_audio, expect_audio,
            "{name}: so luong audio {n_audio} != {expect_audio}"
        );
        println!("✅ {name}: exit 0, ffprobe thấy {n_audio} luồng audio (kỳ vọng {expect_audio})");
    }
}
