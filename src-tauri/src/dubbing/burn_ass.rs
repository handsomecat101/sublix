//! TSK-V014-EXPORT-BURN — chuẩn bị file ASS + thư mục font cho bước in phụ đề.
//!
//! Tách khỏi `export_video_graph` để mỗi module < 300 dòng (quy tắc Rust trong
//! AGENTS.md).

use std::path::{Path, PathBuf};
use std::process::Command;

use tracing::{info, warn};

/// Thư mục font riêng cho libass (`resources/fonts`).
///
/// `libass` mặc định quét `C:\Windows\Fonts` (hàng nghìn file) ⇒ treo 15–45 giây
/// (research §2.2). Nếu thư mục không có ⇒ trả `None` (libass dùng font hệ thống)
/// kèm cảnh báo.
pub fn fonts_dir() -> Option<PathBuf> {
    let dir = crate::config::app_base_dir().join("resources").join("fonts");
    if dir.is_dir() {
        Some(dir)
    } else {
        warn!(
            "⚠️ Không có thư mục font riêng {} — libass sẽ quét font hệ thống (có thể chậm)",
            dir.display()
        );
        None
    }
}

/// Đọc kích thước video bằng ffmpeg (stderr) — fallback 1920×1080.
///
/// `ffmpeg -i <file>` in thông tin luồng ra stderr rồi thoát với mã ≠ 0 ⇒ đọc
/// chuỗi `WIDTHxHEIGHT` đầu tiên trong dòng có `Video:`.
pub fn probe_video_size(ffmpeg_bin: &Path, video: &Path) -> (u32, u32) {
    let fallback = (1920u32, 1080u32);
    let Ok(out) = Command::new(ffmpeg_bin)
        .arg("-hide_banner")
        .arg("-i")
        .arg(video)
        .output()
    else {
        return fallback;
    };
    let stderr = String::from_utf8_lossy(&out.stderr);
    for line in stderr.lines() {
        if !line.contains("Video:") {
            continue;
        }
        // Dạng: "... , 1920x1080 (SAR ...)" — lấy cặp số trước '(' hoặc cuối.
        let tail = line.split("Video:").nth(1).unwrap_or_default();
        for token in tail.split([',', ' ', '(', ')']).rev() {
            let token = token.trim();
            let Some((w, h)) = token.split_once('x') else {
                continue;
            };
            if let (Ok(w), Ok(h)) = (w.trim().parse::<u32>(), h.trim().parse::<u32>()) {
                if w > 0 && h > 0 {
                    info!("🎬 Kích thước video: {w}×{h}");
                    return (w, h);
                }
            }
        }
    }
    fallback
}

/// Ghi file ASS tạm cho bước burn phụ đề.
///
/// `segments`: `(start, end, text)` theo giây. `band` = dải phụ đề cứng (nếu bật)
/// ⇒ phụ đề mới được đặt giữa dải đó.
pub fn write_burn_ass(
    ass_path: &Path,
    segments: &[(f64, f64, String)],
    mode: crate::subtitles::SubMode,
    style: &crate::subtitles::AssStyle,
    video_w: u32,
    video_h: u32,
    band: Option<(u32, u32)>,
) -> std::io::Result<()> {
    let body = crate::subtitles::build_ass(segments, mode, style, video_w, video_h, band);
    std::fs::write(ass_path, body)
}

/// Chuẩn bị file ASS để in phụ đề (theo `sub_style` + dải phụ đề cứng).
///
/// Trả về `(đường dẫn ASS, thư mục font)`. [TSK-V014-EXPORT-FIX] KHÔNG rời sớm khi
/// chưa có câu nào: video có phụ đề cứng mà chưa có câu lồng tiếng vẫn phải **làm mờ
/// dải** (file ASS rỗng là hợp lệ).
pub fn prepare_burn_ass(
    project: &super::DubbingProject,
    temp_dir: &Path,
    ffmpeg_bin: &Path,
) -> Option<(PathBuf, Option<PathBuf>)> {
    let (video_w, video_h) = probe_video_size(ffmpeg_bin, Path::new(&project.input_path));
    let segments: Vec<(f64, f64, String)> = project
        .segments
        .iter()
        .filter_map(|s| {
            let text = if !s.dubbed_text.trim().is_empty() {
                s.dubbed_text.trim().to_string()
            } else {
                s.original_text.trim().to_string()
            };
            if text.is_empty() {
                None
            } else {
                Some((s.start_sec, s.end_sec, text))
            }
        })
        .collect();
    let mode = match project.sub_style.mode.trim().to_lowercase().as_str() {
        "kinetic" => crate::subtitles::SubMode::Kinetic,
        _ => crate::subtitles::SubMode::Normal,
    };

    // Preset: dùng ĐÚNG preset của module `subtitles` (CommandCode đổi 2026-10-26:
    // "pop-amber" / "karaoke-cyan" / "reveal", bỏ "box-amber").
    let preset_id = project.sub_style.preset.trim().to_lowercase();
    let mut style = match crate::subtitles::KineticPreset::ALL
        .iter()
        .find(|p| p.id() == preset_id)
        .copied()
    {
        Some(crate::subtitles::KineticPreset::PopAmber) => crate::subtitles::AssStyle::pop_amber(),
        Some(crate::subtitles::KineticPreset::KaraokeCyan) => {
            crate::subtitles::AssStyle::karaoke_cyan()
        }
        Some(crate::subtitles::KineticPreset::Reveal) => crate::subtitles::AssStyle::reveal(),
        None => crate::subtitles::AssStyle::normal(),
    };
    if project.sub_style.font_size > 0 {
        style.size = project.sub_style.font_size;
    }

    // Vị trí: "bottom"/"band" ⇒ đặt phụ đề TRONG dải phụ đề cứng đã làm mờ;
    // "center"/"top" ⇒ căn theo margin_v của style.
    let position = project.sub_style.position.trim().to_lowercase();
    let use_band = position.is_empty() || position == "bottom" || position == "band";
    let band = if use_band {
        project.hardsub.band.map(|b| (b.y, b.h))
    } else {
        None
    };
    let ass_path = temp_dir.join("burn.ass");
    write_burn_ass(&ass_path, &segments, mode, &style, video_w, video_h, band).ok()?;
    info!("📝 Đã ghi file ASS để in phụ đề: {}", ass_path.display());
    Some((ass_path, fonts_dir()))
}
