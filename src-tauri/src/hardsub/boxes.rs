//! Phần thuần của việc "lấy hộp chữ thật": đọc thông số video, tính vùng cắt, đọc đầu ra của
//! sidecar `hardsub_detect.py` và đổi toạ độ hộp từ **ảnh cắt (chuẩn hoá 0..1)** về **pixel khung gốc**.

use super::band::{FrameBoxes, Region, TextBox};
use serde::Deserialize;

/// Thông số video đọc từ `ffmpeg -i`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    /// Thời lượng (giây); 0 nếu không đọc được.
    pub duration: f64,
}

/// Vùng cắt trong khung gốc (pixel).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CropRect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// Đọc `Duration: hh:mm:ss.xx` + `WxH` của luồng hình từ stderr của `ffmpeg -i`.
pub fn parse_probe(stderr: &str) -> Option<VideoInfo> {
    let video = stderr.lines().find(|l| l.contains("Video:") && !l.contains("Attached pic"))?;
    let (width, height) = video
        .split(|c: char| c == ',' || c == ' ')
        .filter_map(|tok| tok.split_once('x'))
        .filter_map(|(a, b)| Some((a.parse::<u32>().ok()?, b.parse::<u32>().ok()?)))
        .find(|&(w, h)| w >= 16 && h >= 16)?;
    let duration = stderr
        .lines()
        .find_map(|l| l.trim().strip_prefix("Duration:"))
        .and_then(|rest| rest.trim().split(',').next())
        .map(parse_hms)
        .unwrap_or(0.0);
    Some(VideoInfo { width, height, duration })
}

fn parse_hms(s: &str) -> f64 {
    let mut parts = s.trim().split(':');
    let (h, m, sec) = (parts.next(), parts.next(), parts.next());
    match (h, m, sec) {
        (Some(h), Some(m), Some(sec)) => {
            h.parse::<f64>().unwrap_or(0.0) * 3600.0
                + m.parse::<f64>().unwrap_or(0.0) * 60.0
                + sec.parse::<f64>().unwrap_or(0.0)
        }
        _ => 0.0,
    }
}

/// Vùng cắt theo `Region`: `Bottom` = nửa dưới, `Top` = nửa trên, `Any` = cả khung (kích thước chẵn).
pub fn crop_rect(frame_w: u32, frame_h: u32, region: Region) -> CropRect {
    let even = |v: u32| v & !1;
    let (w, h) = (even(frame_w), even(frame_h));
    match region {
        Region::Any => CropRect { x: 0, y: 0, w, h },
        Region::Top => CropRect { x: 0, y: 0, w, h: even(h / 2) },
        Region::Bottom => {
            let half = even(h / 2);
            CropRect { x: 0, y: h - half, w, h: half }
        }
    }
}

/// Số khung dự kiến khi lấy mẫu `fps` khung/giây (để tính %).
pub fn expected_frames(duration: f64, fps: f64) -> usize {
    if duration <= 0.0 || fps <= 0.0 {
        0
    } else {
        (duration * fps).ceil() as usize
    }
}

/// Một dòng đầu ra của sidecar.
#[derive(Debug, Clone, PartialEq)]
pub enum SidecarLine {
    Progress { done: usize, total: usize },
    Result(SidecarResult),
    Error { code: String, message: String },
}

/// Kết quả cuối của sidecar: hộp chuẩn hoá `[x0, y0, x1, y1, score]` trong ảnh cắt.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SidecarResult {
    pub frames: Vec<SidecarFrame>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SidecarFrame {
    pub t: f64,
    pub boxes: Vec<[f32; 5]>,
}

/// Đọc 1 dòng stdout của sidecar; dòng lạ (log thư viện…) ⇒ `None`.
pub fn parse_sidecar_line(line: &str) -> Option<SidecarLine> {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix("PROG ") {
        let mut it = rest.split_whitespace();
        let done = it.next()?.parse().ok()?;
        let total = it.next()?.parse().ok()?;
        Some(SidecarLine::Progress { done, total })
    } else if let Some(rest) = line.strip_prefix("RESULT ") {
        serde_json::from_str(rest).ok().map(SidecarLine::Result)
    } else if let Some(rest) = line.strip_prefix("ERR ") {
        let (code, message) = rest.split_once(' ').unwrap_or((rest, ""));
        Some(SidecarLine::Error { code: code.to_string(), message: message.to_string() })
    } else {
        None
    }
}

/// Đổi hộp chuẩn hoá trong ảnh cắt → pixel khung gốc (cộng gốc vùng cắt, kẹp trong khung).
pub fn to_frame_boxes(result: &SidecarResult, crop: CropRect, frame_w: u32, frame_h: u32) -> Vec<FrameBoxes> {
    let (fw, fh) = (frame_w as f32, frame_h as f32);
    result
        .frames
        .iter()
        .map(|f| FrameBoxes {
            t: f.t,
            boxes: f
                .boxes
                .iter()
                .filter_map(|b| {
                    let x0 = (crop.x as f32 + b[0].clamp(0.0, 1.0) * crop.w as f32).clamp(0.0, fw);
                    let y0 = (crop.y as f32 + b[1].clamp(0.0, 1.0) * crop.h as f32).clamp(0.0, fh);
                    let x1 = (crop.x as f32 + b[2].clamp(0.0, 1.0) * crop.w as f32).clamp(0.0, fw);
                    let y1 = (crop.y as f32 + b[3].clamp(0.0, 1.0) * crop.h as f32).clamp(0.0, fh);
                    (x1 > x0 && y1 > y0).then(|| TextBox::new(x0, y0, x1 - x0, y1 - y0, b[4]))
                })
                .collect(),
        })
        .collect()
}
