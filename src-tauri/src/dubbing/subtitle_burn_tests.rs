//! TSK-V014-BURN-FILTER — test đồ thị filter burn phụ đề.
//!
//! Chạy: `cargo test --lib subtitle_burn`
//! Test ffmpeg THẬT nằm dưới `#[ignore]` (cần ffmpeg trong PATH, chạy lâu):
//! `cargo test --lib subtitle_burn -- --ignored --nocapture`

use super::*;
use std::path::PathBuf;

fn band() -> BlurBand {
    BlurBand {
        y: 800,
        h: 120,
        x: 0,
        w: 1920,
    }
}

fn opt<'a>(
    band_opt: Option<BlurBand>,
    spans: &'a [(f64, f64)],
    ass: Option<&'a Path>,
    fonts: Option<&'a Path>,
) -> BurnOptions<'a> {
    BurnOptions {
        band: band_opt,
        spans,
        blur_radius: DEFAULT_BLUR_RADIUS,
        stamp_opacity: None,
        ass_path: ass,
        fonts_dir: fonts,
    }
}

#[test]
fn khong_band_khong_ass_thi_null() {
    let o = opt(None, &[], None, None);
    assert_eq!(build_video_burn_graph(&o, "0:v", "vsub"), "[0:v]null[vsub]");
}

#[test]
fn chi_blur_khong_span_lam_moi_ca_video() {
    let o = opt(Some(band()), &[], None, None);
    let g = build_video_burn_graph(&o, "0:v", "vsub");
    assert!(g.contains("[0:v]split=2[v_main][v_crop];"), "{g}");
    assert!(g.contains("crop=w=1920:h=120:x=0:y=800"), "{g}");
    assert!(
        g.contains("boxblur=luma_radius=15:luma_power=2:chroma_radius=14:chroma_power=1"),
        "{g}"
    );
    assert!(g.contains("overlay=x=0:y=800"), "{g}");
    // Không có spans ⇒ KHÔNG có `enable` (làm mờ cả video).
    assert!(!g.contains("enable"), "{g}");
    assert!(g.ends_with("[vsub]"), "{g}");
}

#[test]
fn chi_blur_co_span_co_enable_between() {
    let spans = [(4.5, 12.3)];
    let o = opt(Some(band()), &spans, None, None);
    let g = build_video_burn_graph(&o, "0:v", "vsub");
    assert!(g.contains("enable='between(t,4.5,12.3)'"), "{g}");
}

#[test]
fn nhieu_span_ghep_bang_dau_cong() {
    let spans = [(4.5, 12.3), (18.0, 30.5), (40.0, 41.25)];
    let o = opt(Some(band()), &spans, None, None);
    let g = build_video_burn_graph(&o, "0:v", "vsub");
    assert!(
        g.contains("enable='between(t,4.5,12.3)+between(t,18,30.5)+between(t,40,41.25)'"),
        "{g}"
    );
}

#[test]
fn chi_ass_khong_co_split() {
    let ass = PathBuf::from("C:/tmp/sub.ass");
    let o = opt(None, &[], Some(ass.as_path()), None);
    let g = build_video_burn_graph(&o, "0:v", "vsub");
    assert!(g.starts_with("[0:v]ass=filename="), "{g}");
    assert!(g.ends_with("[vsub]"), "{g}");
    assert!(!g.contains("split"), "{g}");
    assert!(!g.contains("overlay"), "{g}");
}

#[test]
fn blur_tem_ass_dung_thu_tu() {
    let ass = PathBuf::from("C:/tmp/sub.ass");
    let spans = [(1.0, 2.0)];
    let o = BurnOptions {
        band: Some(band()),
        spans: &spans,
        blur_radius: 15,
        stamp_opacity: Some(0.65),
        ass_path: Some(ass.as_path()),
        fonts_dir: None,
    };
    let g = build_video_burn_graph(&o, "0:v", "vsub");
    let i_blur = g.find("boxblur").expect("phai co boxblur");
    let i_stamp = g.find("drawbox").expect("phai co drawbox");
    let i_overlay = g.find("overlay").expect("phai co overlay");
    let i_ass = g.find("ass=filename").expect("phai co ass");
    assert!(i_blur < i_stamp, "blur phai truoc tem: {g}");
    assert!(i_stamp < i_overlay, "tem phai truoc overlay: {g}");
    assert!(i_overlay < i_ass, "overlay phai truoc ASS: {g}");
    assert!(g.contains("color=black@0.65:t=fill"), "{g}");
}

#[test]
fn escape_duong_dan_co_khoang_trang() {
    let p = PathBuf::from(r"C:\AI Project\x y\sub.ass");
    let esc = escape_filter_path(p.as_path());
    assert_eq!(esc, r"C\:/AI Project/x y/sub.ass");
    // Dấu nháy đơn và dấu phẩy cũng phải thoát.
    let p2 = PathBuf::from("a'b,c.ass");
    let esc2 = escape_filter_path(p2.as_path());
    assert_eq!(esc2, r"a\'b\,c.ass");
}

#[test]
fn escape_duong_dan_xuat_hien_trong_graph_ass() {
    let ass = PathBuf::from(r"C:\AI Project\x y\sub.ass");
    let o = opt(None, &[], Some(ass.as_path()), None);
    let g = build_video_burn_graph(&o, "0:v", "vsub");
    assert!(g.contains(r"ass=filename='C\:/AI Project/x y/sub.ass'"), "{g}");
}

#[test]
fn fonts_dir_duoc_ghep_vao_filter_ass() {
    let ass = PathBuf::from("C:/tmp/sub.ass");
    let fonts = PathBuf::from(r"C:\AI Project\Sublix\assets\fonts");
    let o = opt(None, &[], Some(ass.as_path()), Some(fonts.as_path()));
    let g = build_video_burn_graph(&o, "0:v", "vsub");
    assert!(
        g.contains(r":fontsdir='C\:/AI Project/Sublix/assets/fonts'"),
        "{g}"
    );
}

#[test]
fn tham_so_ky_ban() {
    let spans = [(0.0, 3.0)];
    // radius 0 ⇒ tối thiểu 1; opacity ngoài [0,1] ⇒ kẹp.
    let base = BurnOptions {
        band: Some(band()),
        spans: &spans,
        blur_radius: 0,
        stamp_opacity: Some(5.0),
        ass_path: None,
        fonts_dir: None,
    };
    let g = build_video_burn_graph(&base, "0:v", "vsub");
    assert!(g.contains("luma_radius=1"), "{g}");
    assert!(g.contains("black@1"), "{g}");

    let o2 = BurnOptions {
        stamp_opacity: Some(-2.0),
        ..base
    };
    let g2 = build_video_burn_graph(&o2, "0:v", "vsub");
    assert!(g2.contains("black@0"), "{g2}");
}

#[test]
fn so_thoi_gian_toi_da_3_chu_so() {
    let spans = [(1.23456, 2.0)];
    let o = opt(Some(band()), &spans, None, None);
    let g = build_video_burn_graph(&o, "0:v", "vsub");
    assert!(g.contains("between(t,1.235,2)"), "{g}");
}

#[test]
fn span_dao_nguoc_van_dung() {
    let spans = [(9.0, 3.0)];
    let o = opt(Some(band()), &spans, None, None);
    let g = build_video_burn_graph(&o, "0:v", "vsub");
    assert!(g.contains("between(t,3,9)"), "{g}");
}

#[test]
fn span_khong_hu_lien_bo_qua() {
    let spans = [(f64::NAN, 3.0), (1.0, f64::INFINITY)];
    let o = opt(Some(band()), &spans, None, None);
    let g = build_video_burn_graph(&o, "0:v", "vsub");
    assert!(!g.contains("enable"), "{g}");
}

/// Test THẬT với ffmpeg: sinh video thử 3s (testsrc2 + drawtext ở đáy), chạy đồ thị
/// của ta (blur dải đáy + tem + in ASS) ra mp4. Exit 0 = đạt.
///
/// Chạy: `cargo test --lib subtitle_burn -- --ignored --nocapture`
#[test]
#[ignore = "can ffmpeg trong PATH (chay lau ~10-30s)"]
fn ffmpeg_that_chay_duoc_do_thi() {
    use std::process::Command;

    let probe = Command::new("ffmpeg").arg("-version").output();
    match probe {
        Ok(out) if out.status.success() => {}
        _ => {
            eprintln!("BO QUA: khong co ffmpeg trong PATH");
            return;
        }
    }

    let dir = std::env::temp_dir().join("sublix_burn_test");
    let _ = std::fs::create_dir_all(&dir);
    let src = dir.join("src.mp4");
    let out = dir.join("out.mp4");
    let graph_file = dir.join("filter.txt");
    let ass = dir.join("sub.ass");

    // File .ass toi gian (1 dong chut giua dai day).
    let ass_body = "[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Montserrat,32,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,30,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,BURN TEST\n";
    if std::fs::write(&ass, ass_body).is_err() {
        eprintln!("BO QUA: khong ghi duoc file .ass");
        return;
    }

    // Video thu: nen xac + hop chu nhat o day (mo phong phu de cung).
    // KHONG dung `drawtext` (can fontconfig, khong co tren may Windows).
    let make = Command::new("ffmpeg")
        .args(["-y", "-f", "lavfi", "-i", "color=c=navy:s=640x360:r=24:d=3"])
        .args([
            "-vf",
            "drawbox=x=20:y=300:w=600:h=40:color=white:t=fill",
        ])
        .args(["-pix_fmt", "yuv420p"])
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

    // Do thi cua ta: lam mo dai day (y=300,h=60) trong khoang 0.5-2.5s + tem + in ASS.
    let spans = [(0.5_f64, 2.5_f64)];
    let opts = BurnOptions {
        band: Some(BlurBand {
            y: 300,
            h: 60,
            x: 0,
            w: 640,
        }),
        spans: &spans,
        blur_radius: 8,
        stamp_opacity: Some(0.5),
        ass_path: Some(ass.as_path()),
        fonts_dir: None,
    };
    let graph = build_video_burn_graph(&opts, "0:v", "vout");
    assert!(
        std::fs::write(&graph_file, &graph).is_ok(),
        "ghi filter file that bai"
    );

    // Chay ffmpeg voi `-/filter_complex <file>` (FFmpeg >= 7; BUG-H12).
    let run = Command::new("ffmpeg")
        .args(["-y", "-i"])
        .arg(&src)
        .arg("-/filter_complex")
        .arg(&graph_file)
        .args([
            "-map",
            "[vout]",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "30",
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
        graph
    );
    assert!(
        out.exists() && std::fs::metadata(&out).map(|m| m.len() > 0).unwrap_or(false),
        "khong tao duoc file mp4"
    );
}
