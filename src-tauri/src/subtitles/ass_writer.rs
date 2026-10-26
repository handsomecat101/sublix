//! TSK-V014-KINETIC-RS — sinh nội dung file ASS (libass) cho phụ đề Studio.
//!
//! Đầu ra dùng cho `ffmpeg -vf ass=...` khi xuất video và cho khung xem thử.
//! **Không nhúng file font** — font phải có sẵn trong máy (xem [`DEFAULT_FONT`]).
//!
//! ## Vì sao dùng `\k` + `\1c` / `\2c`
//! - `\k<cs>` là thẻ **karaoke** của ASS: libass tự tô từng cụm theo thời gian,
//!   nên hiệu ứng "từ đang nói sáng lên" chạy đúng nhịp mà **không** phải cắt
//!   video thành nhiều dòng Dialogue.
//! - Với `\k`: màu "đã đọc" là **PrimaryColour** (`\1c`), màu "chưa đọc" là
//!   **SecondaryColour** (`\2c`). Vì vậy mỗi dòng Kinetic đảo màu ngay trên
//!   dòng sự kiện: `\1c` = màu highlight, `\2c` = màu gốc ⇒ từ vừa đọc xong
//!   giữ màu highlight, từ chưa đọc vẫn màu gốc.
//! - Không dùng `\t` / `\fscx` để "nảy" vì mỗi từ sẽ phải sinh một transform
//!   riêng; bản này giữ đúng phạm vi "chia thời gian + đổi màu theo từ".
//!
//! ## Màu
//! [`AssStyle`] nhận màu dạng `#RRGGBB` (dễ đọc trong mã nguồn); khi ghi ASS
//! mới đổi sang `&HAABBGGRR` (thứ tự **BGR** của ASS). Màu sai định dạng ⇒
//! fallback trắng + cảnh báo qua `tracing`.

use tracing::warn;

use super::kinetic_timing::time_words;

/// Font mặc định — "Be Vietnam Pro" (font tiếng Việt có dấu, đang được kiểm
/// tra khả năng render của libass; **không** nhúng file font vào bản build).
pub const DEFAULT_FONT: &str = "Be Vietnam Pro";

/// Kiểu phụ đề: bình thường (1 dòng/câu) hoặc nhảy chữ (karaoke theo từ).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubMode {
    /// Mỗi câu một dòng Dialogue.
    Normal,
    /// Karaoke `\k` theo từng từ (dùng [`time_words`]).
    Kinetic,
}

/// Kiểu dáng phụ đề (đơn vị px theo `PlayResX/PlayResY` = kích thước video).
#[derive(Debug, Clone, PartialEq)]
pub struct AssStyle {
    /// Tên font (phải có sẵn trong máy).
    pub font: String,
    /// Cỡ chữ (px trong hệ PlayRes).
    pub size: u32,
    /// Màu chữ thường `#RRGGBB`.
    pub primary: String,
    /// Màu từ đang nói (chỉ dùng ở chế độ [`SubMode::Kinetic`]).
    pub highlight: String,
    /// Màu viền `#RRGGBB`.
    pub outline: String,
    /// Độ dày viền (px).
    pub outline_w: f32,
    /// Lề dưới (px) — khoảng cách từ đáy khung hình tới dòng phụ đề.
    pub margin_v: u32,
    /// Lề trái (px).
    pub margin_l: u32,
    /// Lề phải (px).
    pub margin_r: u32,
    /// Chữ đậm.
    pub bold: bool,
}

impl AssStyle {
    /// Trắng, viền đen dày — đọc rõ trên mọi nền.
    ///
    /// `highlight` để trắng như `primary` ⇒ chế độ Kinetic với preset này
    /// **không đổi màu** (chỉ có nhịp karaoke); muốn thấy hiệu ứng màu thì
    /// dùng [`AssStyle::tiktok_yellow`] hoặc [`AssStyle::neon`].
    pub fn classic() -> Self {
        Self {
            font: DEFAULT_FONT.to_string(),
            size: 64,
            primary: "#FFFFFF".to_string(),
            highlight: "#FFFFFF".to_string(),
            outline: "#000000".to_string(),
            outline_w: 4.0,
            margin_v: 120,
            margin_l: 60,
            margin_r: 60,
            bold: false,
        }
    }

    /// Kiểu TikTok/CapCut: trắng, viền đen, **từ đang nói vàng** (`#FFD400`).
    pub fn tiktok_yellow() -> Self {
        Self {
            size: 68,
            highlight: "#FFD400".to_string(),
            outline_w: 5.0,
            margin_v: 180,
            bold: true,
            ..Self::classic()
        }
    }

    /// Neon: chữ trắng-xanh nhạt, viền **tím** (`#B026FF`), từ đang nói **xanh cyan**
    /// (`#00E5FF`).
    pub fn neon() -> Self {
        Self {
            size: 62,
            primary: "#F2F7FF".to_string(),
            highlight: "#00E5FF".to_string(),
            outline: "#B026FF".to_string(),
            outline_w: 4.5,
            margin_v: 170,
            bold: true,
            ..Self::classic()
        }
    }
}

impl Default for AssStyle {
    fn default() -> Self {
        Self::classic()
    }
}

/// `#RRGGBB` → `&H00BBGGRR` (ASS dùng thứ tự BGR). Sai định dạng ⇒ trắng.
pub fn ass_color(hex: &str) -> String {
    let raw = hex.trim().trim_start_matches('#');
    if raw.len() == 6 && raw.is_ascii() {
        let part = |range: std::ops::Range<usize>| u8::from_str_radix(&raw[range], 16).ok();
        if let (Some(r), Some(g), Some(b)) = (part(0..2), part(2..4), part(4..6)) {
            return format!("&H00{b:02X}{g:02X}{r:02X}");
        }
    }
    warn!(color = hex, "màu ASS không hợp lệ, dùng màu trắng");
    "&H00FFFFFF".to_string()
}

/// Thoát ký tự đặc biệt của ASS: `\` `{` `}` và xuống dòng → `\N`.
fn escape_ass(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 8);
    for ch in text.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '{' => out.push_str("\\{"),
            '}' => out.push_str("\\}"),
            '\n' => out.push_str("\\N"),
            // CRLF của Windows: bỏ CR, giữ 1 lần xuống dòng.
            '\r' => {}
            _ => out.push(ch),
        }
    }
    out
}

/// `giây` → `H:MM:SS.cc` (làm tròn tới centi-giây, thời gian âm ⇒ 0).
fn ass_time(seconds: f64) -> String {
    let safe = if seconds.is_finite() { seconds.max(0.0) } else { 0.0 };
    let cs = (safe * 100.0).round() as u64;
    let hours = cs / 360_000;
    let minutes = (cs / 6_000) % 60;
    let secs = (cs / 100) % 60;
    format!("{hours}:{minutes:02}:{secs:02}.{:02}", cs % 100)
}

/// Dòng chữ của chế độ Kinetic: karaoke `\k` từng từ + đảo màu bằng `\1c`/`\2c`.
fn kinetic_text(text: &str, start: f64, end: f64, primary: &str, highlight: &str) -> String {
    let words = time_words(text, start, end);
    if words.is_empty() {
        return String::new();
    }
    // Câu gốc có khoảng trắng ⇒ hiển thị cách nhau 1 dấu cách; CJK ⇒ dính liền.
    let separator = if text.chars().any(char::is_whitespace) { " " } else { "" };

    let mut line = format!("{{\\1c{highlight}&\\2c{primary}&}}");
    let last = words.len() - 1;
    for (i, word) in words.iter().enumerate() {
        line.push_str(&format!("{{\\k{}}}{}", word.dur_cs, escape_ass(&word.word)));
        if i < last {
            line.push_str(separator);
        }
    }
    line
}

/// Sinh nội dung file ASS hoàn chỉnh.
///
/// - `segments`: `(start, end, text)` theo giây; câu rỗng bị bỏ qua.
/// - `band`: `Some((y, h))` ⇒ đặt phụ đề vào **giữa dải** này (dùng cho video có
///   phụ đề cứng đã làm mờ) bằng `\an5\pos(...)`; `None` ⇒ căn đáy theo `margin_v`.
/// - Mọi giờ in theo `H:MM:SS.cc`; dòng ngăn cách bằng `\n` (libass chấp nhận LF).
pub fn build_ass(
    segments: &[(f64, f64, String)],
    mode: SubMode,
    style: &AssStyle,
    video_w: u32,
    video_h: u32,
    band: Option<(u32, u32)>,
) -> String {
    let width = video_w.max(1);
    let height = video_h.max(1);
    let primary = ass_color(&style.primary);
    let highlight = ass_color(&style.highlight);
    let outline = ass_color(&style.outline);
    let bold = if style.bold { -1 } else { 0 };

    let mut out = String::with_capacity(768 + segments.len() * 96);
    out.push_str("[Script Info]\n");
    out.push_str("; Sublix — phụ đề sinh tự động (ASS)\n");
    out.push_str("ScriptType: v4.00+\n");
    out.push_str("WrapStyle: 2\n");
    out.push_str("ScaledBorderAndShadow: yes\n");
    out.push_str("YCbCr Matrix: TV.709\n");
    out.push_str(&format!("PlayResX: {width}\nPlayResY: {height}\n\n"));

    out.push_str("[V4+ Styles]\n");
    out.push_str(concat!(
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, ",
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, ",
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
    ));
    out.push_str(&format!(
        "Style: Default,{font},{size},{primary},{highlight},{outline},&H64000000,{bold},0,0,0,\
         100,100,0,0,1,{outline_w:.1},0,2,{margin_l},{margin_r},{margin_v},1\n\n",
        font = style.font,
        size = style.size,
        outline_w = style.outline_w,
        margin_l = style.margin_l,
        margin_r = style.margin_r,
        margin_v = style.margin_v,
    ));

    out.push_str("[Events]\n");
    out.push_str("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n");

    // Dải phụ đề cứng: căn giữa theo chiều dọc của dải, kẹp trong khung hình.
    let band_prefix = band.map(|(y, band_h)| {
        let cx = f64::from(width) / 2.0;
        let cy = (f64::from(y) + f64::from(band_h) / 2.0).clamp(0.0, f64::from(height));
        format!("{{\\an5\\pos({},{})}}", cx.round() as u32, cy.round() as u32)
    });

    for (start, end, text) in segments {
        if text.trim().is_empty() {
            continue;
        }
        let content = match mode {
            SubMode::Normal => escape_ass(text.trim()),
            SubMode::Kinetic => kinetic_text(text, *start, *end, &primary, &highlight),
        };
        if content.is_empty() {
            continue;
        }
        out.push_str(&format!(
            "Dialogue: 0,{},{},Default,,0,0,0,,",
            ass_time(*start),
            ass_time(*end)
        ));
        if let Some(prefix) = &band_prefix {
            out.push_str(prefix);
        }
        out.push_str(&content);
        out.push('\n');
    }

    out
}

// Test nằm ở file riêng (giữ file chính < 300 dòng).
#[cfg(test)]
#[path = "ass_writer_tests.rs"]
mod tests;
