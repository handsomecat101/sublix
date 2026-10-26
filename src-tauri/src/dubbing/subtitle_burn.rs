//! TSK-V014-BURN-FILTER — dựng đồ thị filter ffmpeg để **in phụ đề ASS** lên video,
//! kèm làm mờ dải phụ đề cứng và "đè tem" (hộp đen mờ đục).
//!
//! Tài liệu: `docs/V0.14_PLAN.md` §2B · `docs/V014_RESEARCH.md` §2.2 (`fontsdir`,
//! escape `C\:`) và §4 (split → crop → boxblur → overlay `enable=between()`).
//!
//! Module **thuần**: không gọi ffmpeg, chỉ sinh chuỗi filtergraph để ghép vào
//! `-filter_complex` (hoặc `-/filter_complex <file>` khi graph quá dài — xem
//! `ducking_export::FILTER_FILE_THRESHOLD`, BUG-H12).
//!
//! Thứ tự filter (quan trọng): **làm mờ → đè tem → overlay → in ASS** (ASS cuối
//! cùng để phụ đề nằm trên dải đã làm mờ).

use std::path::Path;

use serde::{Deserialize, Serialize};

/// Dải phụ đề cứng cần làm mờ (toạ độ pixel trong khung hình).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlurBand {
    /// Y của mép trên dải (px).
    pub y: u32,
    /// Chiều cao dải (px).
    pub h: u32,
    /// X của mép trái dải (px).
    pub x: u32,
    /// Bề rộng dải (px).
    pub w: u32,
}

/// Tham số dựng đồ thị lọc (video) cho bước in phụ đề.
#[derive(Debug, Clone)]
pub struct BurnOptions<'a> {
    /// Dải cần làm mờ. `None` = không làm mờ (chỉ in ASS nếu có).
    pub band: Option<BlurBand>,
    /// Các khoảng thời gian (giây) cần làm mờ. **Rỗng = làm mờ cả video.**
    pub spans: &'a [(f64, f64)],
    /// Bán kính `boxblur` (luma_radius). Mặc định 15; tối thiểu 1.
    pub blur_radius: u32,
    /// Độ đục của hộp đen "đè tem" (0.0..=1.0). `None` = không tem.
    pub stamp_opacity: Option<f32>,
    /// File `.ass` để in phụ đề. `None` = không in phụ đề.
    pub ass_path: Option<&'a Path>,
    /// Thư mục font riêng (`fontsdir`) — tránh libass quét `C:\Windows\Fonts`.
    pub fonts_dir: Option<&'a Path>,
}

impl<'a> BurnOptions<'a> {
    /// Dải làm mờ chuẩn (bán kính 15, không tem, không ASS).
    pub fn blur_only(band: BlurBand, spans: &'a [(f64, f64)]) -> Self {
        Self {
            band: Some(band),
            spans,
            blur_radius: 15,
            stamp_opacity: None,
            ass_path: None,
            fonts_dir: None,
        }
    }
}

/// Bán kính làm mờ mặc định (theo research §4: `boxblur=luma_radius=15:luma_power=2`).
pub const DEFAULT_BLUR_RADIUS: u32 = 15;

/// Escape đường dẫn cho tham số filter ffmpeg (Windows/Unix).
///
/// - `\` → `/` (Windows dùng dấu gạch xuôi trong filter).
/// - `:` → `\:` — **bắt buộc** với ổ đĩa Windows (`C:`), nếu không ffmpeg parse
///   nhầm sang tham số kế tiếp của filter (research §2.2).
/// - `'` → `\'`, và `,` `;` `[` `]` → `\<ký tự>` (bảo vệ khi chuỗi không nằm trong
///   nháy đơn).
pub fn escape_filter_path(p: &Path) -> String {
    let raw = p.to_string_lossy();
    let mut out = String::with_capacity(raw.len() + 8);
    for ch in raw.chars() {
        match ch {
            '\\' => out.push('/'),
            ':' => out.push_str("\\:"),
            '\'' => out.push_str("\\'"),
            ',' | ';' | '[' | ']' => {
                out.push('\\');
                out.push(ch);
            }
            _ => out.push(ch),
        }
    }
    out
}

/// Số thời gian dạng thập phân, **tối đa 3 chữ số** (vd `4.5`, `12.3`, `0`).
fn fmt_secs(v: f64) -> String {
    if !v.is_finite() {
        return "0".to_string();
    }
    let rounded = (v * 1000.0).round() / 1000.0;
    let mut s = format!("{rounded:.3}");
    while s.contains('.') && (s.ends_with('0') || s.ends_with('.')) {
        s.pop();
    }
    if s.is_empty() || s == "-" {
        "0".to_string()
    } else {
        s
    }
}

/// Biểu thức `enable` gộp nhiều khoảng: `between(t,a,b)+between(t,c,d)`.
///
/// `spans` rỗng ⇒ `None` (làm mờ cả video, không cần `enable`).
fn build_enable(spans: &[(f64, f64)]) -> Option<String> {
    if spans.is_empty() {
        return None;
    }
    let parts: Vec<String> = spans
        .iter()
        .filter_map(|(a, b)| {
            if !a.is_finite() || !b.is_finite() {
                return None;
            }
            let (start, end) = if a <= b { (*a, *b) } else { (*b, *a) };
            Some(format!("between(t,{},{})", fmt_secs(start), fmt_secs(end)))
        })
        .collect();
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("+"))
    }
}

/// Filter `ass` (in phụ đề) — có `fontsdir` nếu được truyền.
fn ass_filter(opt: &BurnOptions) -> Option<String> {
    let path = opt.ass_path?;
    let mut filter = format!("ass=filename='{}'", escape_filter_path(path));
    if let Some(dir) = opt.fonts_dir {
        filter.push_str(&format!(":fontsdir='{}'", escape_filter_path(dir)));
    }
    Some(filter)
}

/// Dựng đồ thị filter: đọc từ nhãn `in_label` (vd `0:v`) và xuất nhãn `out_label`
/// (vd `vsub`).
///
/// - Không có dải làm mờ và không in ASS ⇒ `[in]null[out]`.
/// - Chỉ làm mờ ⇒ `split → crop → boxblur (+drawbox) → overlay`.
/// - Chỉ in ASS ⇒ `[in]ass=...[out]`.
/// - Cả hai ⇒ blur **trước**, ASS **sau cùng**.
pub fn build_video_burn_graph(opt: &BurnOptions, in_label: &str, out_label: &str) -> String {
    let ass = ass_filter(opt);
    let Some(band) = opt.band else {
        return match ass {
            Some(a) => format!("[{in_label}]{a}[{out_label}]"),
            None => format!("[{in_label}]null[{out_label}]"),
        };
    };

    let w = band.w.max(1);
    let h = band.h.max(1);
    let x = band.x;
    let y = band.y;
    let radius = opt.blur_radius.max(1);
    // ffmpeg ≥ 8 (kể cả 9) yêu cầu `chroma_radius < luma_radius` ⇒ đặt tường minh.
    let chroma_radius = radius.saturating_sub(1);

    let mut chain = format!(
        "crop=w={w}:h={h}:x={x}:y={y},boxblur=luma_radius={radius}:luma_power=2:chroma_radius={chroma_radius}:chroma_power=1"
    );
    if let Some(opacity) = opt.stamp_opacity {
        // "Đè tem": hộp đen mờ đục phủ lên dải đã làm mờ (research §4.1).
        let o = opacity.clamp(0.0, 1.0);
        chain.push_str(&format!(",drawbox=x=0:y=0:w=iw:h=ih:color=black@{o}:t=fill"));
    }

    let mut graph = String::new();
    graph.push_str(&format!("[{in_label}]split=2[v_main][v_crop];"));
    graph.push_str(&format!("[v_crop]{chain}[v_blur];"));

    let mut overlay = format!("[v_main][v_blur]overlay=x={x}:y={y}");
    if let Some(enable) = build_enable(opt.spans) {
        overlay.push_str(&format!(":enable='{enable}'"));
    }

    match ass {
        Some(a) => {
            graph.push_str(&format!("{overlay}[v_burned];"));
            graph.push_str(&format!("[v_burned]{a}[{out_label}]"));
        }
        None => {
            graph.push_str(&format!("{overlay}[{out_label}]"));
        }
    }
    graph
}

#[cfg(test)]
#[path = "subtitle_burn_tests.rs"]
mod tests;
