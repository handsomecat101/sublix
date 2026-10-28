//! TSK-V014-EXPORT-FIX — test ffmpeg THẬT: burn phụ đề + trích 2 khung PNG trước/sau.
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

/// Test THẬT: video 10 s có dải chữ ở đáy → dựng ASS + đồ thị burn → xuất mp4,
/// rồi trích 2 khung PNG (trước/sau) vào `docs/ui-mockups/shots/`.
///
/// Chạy: `cargo test --lib export_video_graph -- --ignored --nocapture`
#[test]
#[ignore = "can ffmpeg trong PATH (chay lau ~10-30s)"]
fn xuat_that_burn_phu_de_va_trich_khung_png() {
    match Command::new("ffmpeg").arg("-version").output() {
        Ok(out) if out.status.success() => {}
        _ => {
            eprintln!("BO QUA: khong co ffmpeg trong PATH");
            return;
        }
    }

    let dir = std::env::temp_dir().join("sublix_export_burn_test");
    let _ = std::fs::create_dir_all(&dir);
    let src = dir.join("src.mp4");
    let out = dir.join("out.mp4");
    let graph_file = dir.join("filter.txt");

    // Video 10s (CÓ cả luồng audio để đồ thị audio `[0:a]` hợp lệ): nen xac + hop
    // chu nhat o day (mo phong phu de cung).
    // KHONG dung `drawtext` (can fontconfig, khong co tren may Windows).
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

    // Dự án có 2 câu phụ đề + dải cứng cần làm mờ.
    let project = super::super::DubbingProject {
        input_path: src.to_string_lossy().to_string(),
        media_duration_sec: 10.0,
        speakers: vec![],
        segments: vec![
            super::super::DubbingSegment {
                id: 1,
                speaker_id: "speaker_0".to_string(),
                start_sec: 1.0,
                end_sec: 4.0,
                original_text: "Chúng ta cần rút lui ngay lập tức.".to_string(),
                dubbed_text: "Chúng ta phải rút lui ngay lập tức.".to_string(),
                audio_duration_sec: None,
                status: "ready".to_string(),
            },
            super::super::DubbingSegment {
                id: 2,
                speaker_id: "speaker_0".to_string(),
                start_sec: 5.0,
                end_sec: 8.0,
                original_text: "Đường phía bắc vẫn còn một chút hy vọng.".to_string(),
                dubbed_text: "Con đường phía bắc vẫn còn chút hy vọng.".to_string(),
                audio_duration_sec: None,
                status: "ready".to_string(),
            },
        ],
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

    // Chuẩn bị ASS + dựng đồ thị (video + audio).
    let (ass_path, fonts) = prepare_burn_ass(&project, &dir, std::path::Path::new("ffmpeg"))
        .expect("phai dung duoc file ASS");
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
        "mixed",
        false,
        Some(burn),
        "0:v",
        VIDEO_OUT_LABEL,
        "[0:a]anull[final_audio]",
    );
    assert!(plan.video_label.is_some(), "phai map video qua nhan");
    assert!(
        std::fs::write(&graph_file, &plan.filter_complex).is_ok(),
        "ghi filter file that bai"
    );

    // Chạy ffmpeg với `-/filter_complex <file>` (FFmpeg >= 7; BUG-H12).
    let run = Command::new("ffmpeg")
        .args(["-y", "-i"])
        .arg(&src)
        .arg("-/filter_complex")
        .arg(&graph_file)
        .args([
            "-map",
            "[vout]",
            "-map",
            "[final_audio]",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "30",
            "-c:a",
            "aac",
        ])
        .arg(&out)
        .output();
    let run = match run {
        Ok(r) => r,
        Err(err) => {
            eprintln!("BO QUA: khong chay duoc ffmpeg ({err})");
            return;
        }
    };
    assert!(
        run.status.success(),
        "ffmpeg FAIL:\n{}\n--- graph ---\n{}",
        String::from_utf8_lossy(&run.stderr),
        plan.filter_complex
    );
    assert!(out.exists(), "khong tao duoc file mp4");

    // Trích 2 khung PNG (trước / sau) vào docs/ui-mockups/shots/.
    let shots_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("docs")
        .join("ui-mockups")
        .join("shots");
    let _ = std::fs::create_dir_all(&shots_dir);
    for (file, name) in [(&src, "v014-export-before.png"), (&out, "v014-export-after.png")] {
        let png = shots_dir.join(name);
        let shot = Command::new("ffmpeg")
            .args(["-y", "-ss", "2.5", "-i"])
            .arg(file)
            .args(["-frames:v", "1"])
            .arg(&png)
            .output();
        match shot {
            Ok(r) if r.status.success() => {
                println!("📸 {}", png.display());
            }
            Ok(r) => eprintln!(
                "khong trich duoc PNG {}: {}",
                name,
                String::from_utf8_lossy(&r.stderr)
            ),
            Err(err) => eprintln!("khong trich duoc PNG {name}: {err}"),
        }
    }
}
