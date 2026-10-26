//! Kiểu dáng + 3 mẫu "nhảy chữ" của phụ đề ASS (§4.12).
//!
//! Tách khỏi `ass_writer` để mỗi file dưới 300 dòng (quy tắc Rust trong AGENTS.md).
//!
//! Mẫu **"Hộp cam"** của §4.12 **không có ở đây**: libass vẽ `BorderStyle=3`
//! thành **một hộp cho cả dòng**, không theo từng từ (bằng chứng:
//! `docs/ui-mockups/shots/v014-ass-box-libass-khong-dat.png`). Muốn hộp theo từ
//! phải tự đo vị trí từng từ bằng engine layout của font — ngoài phạm vi lõi này.

use tracing::warn;

/// Font hiển thị (đậm) — **family name nội bộ** của `Montserrat-Black.ttf`.
pub const FONT_DISPLAY: &str = "Montserrat Black";
/// Font thường — **family name nội bộ** của `BeVietnamPro-SemiBold.ttf`.
pub const FONT_BODY: &str = "Be Vietnam Pro SemiBold";

/// Kiểu phụ đề: bình thường (1 dòng/câu) hoặc nhảy chữ (theo từ).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubMode {
    /// Mỗi câu một dòng Dialogue.
    Normal,
    /// Hiệu ứng theo từ, chọn mẫu qua [`AssStyle::preset`].
    Kinetic,
}

/// Mẫu "nhảy chữ" (§4.12). Bỏ `box-amber` — xem doc đầu file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KineticPreset {
    /// Vàng nảy: từ đang nói vàng `#FFC83D` + phóng 118 % rồi thu về.
    PopAmber,
    /// Karaoke xanh: quét màu `\kf`, từ đã nói giữ xanh `#5FD3FF`.
    KaraokeCyan,
    /// Hiện dần: từ chưa nói ẩn nhưng giữ chỗ, tới lượt thì hiện.
    Reveal,
}

impl KineticPreset {
    /// Toàn bộ mẫu, đúng thứ tự hiển thị trên UI.
    pub const ALL: [Self; 3] = [Self::PopAmber, Self::KaraokeCyan, Self::Reveal];

    /// Id dùng chung với frontend (`KineticPresetId` trong §4.12).
    pub fn id(self) -> &'static str {
        match self {
            Self::PopAmber => "pop-amber",
            Self::KaraokeCyan => "karaoke-cyan",
            Self::Reveal => "reveal",
        }
    }
}

impl Default for KineticPreset {
    fn default() -> Self {
        Self::PopAmber
    }
}

/// Kiểu dáng phụ đề (px theo `PlayResX/PlayResY` = kích thước video).
#[derive(Debug, Clone, PartialEq)]
pub struct AssStyle {
    /// Tên font (phải khớp **family name nội bộ** của file .ttf).
    pub font: String,
    /// Cỡ chữ (px trong hệ PlayRes).
    pub size: u32,
    /// Màu chữ thường `#RRGGBB`.
    pub primary: String,
    /// Màu từ đang nói (Kinetic) `#RRGGBB`.
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
    /// Chữ đậm (font Black/SemiBold đã đậm sẵn ⇒ để `false`).
    pub bold: bool,
    /// Mẫu hiệu ứng khi [`SubMode::Kinetic`] (bỏ qua ở `Normal`).
    pub preset: KineticPreset,
}

impl AssStyle {
    /// Kiểu **Bình thường**: Be Vietnam Pro SemiBold, trắng, viền đen.
    pub fn normal() -> Self {
        Self {
            font: FONT_BODY.to_string(),
            size: 60,
            primary: "#FFFFFF".to_string(),
            highlight: "#FFFFFF".to_string(),
            outline: "#000000".to_string(),
            outline_w: 3.0,
            margin_v: 120,
            margin_l: 60,
            margin_r: 60,
            bold: false,
            preset: KineticPreset::PopAmber,
        }
    }

    fn kinetic(preset: KineticPreset) -> Self {
        Self {
            font: FONT_DISPLAY.to_string(),
            size: 70,
            outline_w: 6.0,
            margin_v: 180,
            preset,
            ..Self::normal()
        }
    }

    /// **Vàng nảy** (mặc định): trắng, từ đang nói vàng `#FFC83D`.
    pub fn pop_amber() -> Self {
        Self {
            highlight: "#FFC83D".to_string(),
            ..Self::kinetic(KineticPreset::PopAmber)
        }
    }

    /// **Karaoke xanh**: trắng, quét dần sang xanh `#5FD3FF`.
    pub fn karaoke_cyan() -> Self {
        Self {
            highlight: "#5FD3FF".to_string(),
            ..Self::kinetic(KineticPreset::KaraokeCyan)
        }
    }

    /// **Hiện dần**: trắng, từ chưa nói ẩn.
    pub fn reveal() -> Self {
        Self::kinetic(KineticPreset::Reveal)
    }
}

impl Default for AssStyle {
    fn default() -> Self {
        Self::normal()
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

#[cfg(test)]
#[path = "ass_style_tests.rs"]
mod tests;
