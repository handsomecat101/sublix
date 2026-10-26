//! TSK-V014-ASS-PRESETS — sinh nội dung ASS (libass) cho phụ đề Studio.
//!
//! Đầu ra dùng cho `ffmpeg -vf ass=...` khi xuất video và cho khung xem thử.
//! Font **không nhúng trong file ASS**: chép `.ttf` vào
//! `src-tauri/resources/fonts/` và truyền `fontsdir=` cho ffmpeg.
//!
//! ## Cách dựng từng mẫu (docs/UI_REDESIGN_PLAN.md §4.12)
//! | Mẫu | Cách làm | Thẻ ASS |
//! |---|---|---|
//! | Vàng nảy (mặc định) | mỗi từ **một event**, cả câu vẽ lại, từ đang nói vàng + phóng 118 % rồi thu về | `\1c` + `\t(\fscx100\fscy100)` |
//! | Karaoke xanh | **một event/câu**, quét màu trái→phải, từ đã nói giữ xanh | `\kf` |
//! | Hiện dần | mỗi từ một event, từ chưa nói `\alpha&HFF&` (vẫn giữ chỗ), tới lượt thì hiện | `\alpha` + `\t` |
//!
//! Vì sao "mỗi từ một event" cho Vàng nảy/Hiện dần: mỗi event vẽ **cả câu** nên
//! câu không bị xuống dòng lại và hiệu ứng khớp tuyệt đối mốc từ, không phụ
//! thuộc trạng thái karaoke nội bộ của libass (dễ kiểm bằng ảnh render).
//!
//! Mẫu **"Hộp cam"** của §4.12 **không làm được với libass**: `BorderStyle=3`
//! chỉ vẽ **một hộp cho cả dòng**, không theo từng từ (bằng chứng:
//! `docs/ui-mockups/shots/v014-ass-box-libass-khong-dat.png`).
//!
//! Kiểu dáng/màu nằm ở [`super::ass_style`], tái xuất ở đây để nơi gọi cũ
//! (`ass_writer::AssStyle`, …) không phải đổi.

use super::ass_effects::{highlight_line, karaoke_line};
use super::kinetic_timing::time_words;

pub use super::ass_style::{
    ass_color, AssStyle, KineticPreset, SubMode, FONT_BODY, FONT_DISPLAY,
};

/// Thoát ký tự đặc biệt của ASS: `\` `{` `}` và xuống dòng → `\N`.
pub(crate) fn escape_ass(text: &str) -> String {
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

/// Giây → centi-giây (làm tròn, thời gian âm/không hữu hạn ⇒ 0).
fn seconds_to_cs(seconds: f64) -> u64 {
    let safe = if seconds.is_finite() { seconds.max(0.0) } else { 0.0 };
    (safe * 100.0).round() as u64
}

/// Centi-giây → `H:MM:SS.cc`.
fn ass_time_cs(cs: u64) -> String {
    format!(
        "{}:{:02}:{:02}.{:02}",
        cs / 360_000,
        (cs / 6_000) % 60,
        (cs / 100) % 60,
        cs % 100
    )
}

/// Một dòng `Dialogue` (không kèm `\n`).
fn push_event(out: &mut String, start_cs: u64, end_cs: u64, band: &Option<String>, text: &str) {
    out.push_str(&format!(
        "Dialogue: 0,{},{},Default,,0,0,0,,",
        ass_time_cs(start_cs),
        ass_time_cs(end_cs)
    ));
    if let Some(prefix) = band {
        out.push_str(prefix);
    }
    out.push_str(text);
    out.push('\n');
}

/// Sinh nội dung file ASS hoàn chỉnh.
///
/// - `segments`: `(start, end, text)` theo giây; câu rỗng bị bỏ qua.
/// - `mode`: `Normal` = 1 dòng/câu; `Kinetic` = hiệu ứng theo [`AssStyle::preset`].
/// - `band`: `Some((y, h))` ⇒ đặt phụ đề vào **giữa dải** này (video có phụ đề
///   cứng đã làm mờ) bằng `\an5\pos(...)`; `None` ⇒ căn đáy theo `margin_v`.
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

    let mut out = String::with_capacity(1024 + segments.len() * 256);
    out.push_str("[Script Info]\n");
    out.push_str("; Sublix — phụ đề sinh tự động (ASS)\n");
    out.push_str("ScriptType: v4.00+\n");
    // WrapStyle 0 = tự động xuống dòng thông minh (2 = KHÔNG xuống dòng ⇒ câu dài
    // tràn ra ngoài khung hình, đã thấy khi render 1280×720).
    out.push_str("WrapStyle: 0\n");
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
        let base_cs = seconds_to_cs(*start);
        if mode == SubMode::Normal {
            push_event(
                &mut out,
                base_cs,
                seconds_to_cs(*end),
                &band_prefix,
                &escape_ass(text.trim()),
            );
            continue;
        }

        let words = time_words(text, *start, *end);
        if words.is_empty() {
            continue;
        }
        // Câu gốc có khoảng trắng ⇒ hiển thị cách nhau 1 dấu cách; CJK ⇒ dính liền.
        let separator = if text.chars().any(char::is_whitespace) { " " } else { "" };

        if style.preset == KineticPreset::KaraokeCyan {
            let content = karaoke_line(&words, separator, &primary, &highlight);
            push_event(
                &mut out,
                base_cs,
                seconds_to_cs(*end),
                &band_prefix,
                &content,
            );
            continue;
        }

        // Vàng nảy / Hiện dần: mỗi từ một event, cả câu vẽ lại với 1 từ được nhấn.
        for (index, word) in words.iter().enumerate() {
            let start_cs = base_cs + u64::from(word.offset_cs);
            let end_cs = start_cs + u64::from(word.dur_cs);
            let content = highlight_line(
                &words,
                index,
                style.preset,
                &primary,
                &highlight,
                separator,
                u32::from(word.dur_cs) * 10,
            );
            push_event(&mut out, start_cs, end_cs, &band_prefix, &content);
        }
    }

    out
}

// Test nằm ở file riêng (giữ file chính < 300 dòng).
#[cfg(test)]
#[path = "ass_writer_tests.rs"]
mod tests;
