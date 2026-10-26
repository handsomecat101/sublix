//! TSK-V014-EXPORT-BURN — test ghép đồ thị video (burn) + audio (smart ducking).

use super::*;
use crate::dubbing::subtitle_burn::{BlurBand, BurnOptions};

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

/// Test THẬT: video 10 s có dải chữ ở đáy → dựng ASS + đồ thị burn → xuất mp4,
/// rồi trích 2 khung PNG (trước/sau) vào `docs/ui-mockups/shots/`.
///
/// Chạy: `cargo test --lib export_video_graph -- --ignored --nocapture`
#[test]
#[ignore = "can ffmpeg trong PATH (chay lau ~10-30s)"]
fn xuat_that_burn_phu_de_va_trich_khung_png() {
    use std::process::Command;

    let probe = Command::new("ffmpeg").arg("-version").output();
    match probe {
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
        .args(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"])
        .args([
            "-vf",
            "drawbox=x=0:y=260:w=640:h=100:color=white:t=fill",
        ])
        .args(["-shortest", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac"])
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
    let graph = build_export_graph(&ExportGraphInput {
        audio_graph: "[0:a]anull[final_audio]",
        burn: Some(burn),
        video_in: "0:v",
        video_out: VIDEO_OUT_LABEL,
    });
    assert!(graph.video_remapped, "phai map video qua nhan");
    assert!(
        std::fs::write(&graph_file, &graph.filter_complex).is_ok(),
        "ghi filter file that bai"
    );

    // Chạy ffmpeg với `-/filter_complex <file>` (FFmpeg >= 7; BUG-H12).
    let run = Command::new("ffmpeg")
        .args(["-y", "-i"])
        .arg(&src)
        .arg("-/filter_complex")
        .arg(&graph_file)
        .args(["-map", "[vout]", "-map", "[final_audio]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-c:a", "aac"])
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
        graph.filter_complex
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
                info!("📸 {}", png.display());
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
