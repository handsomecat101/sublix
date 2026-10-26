//! TSK-V014-ASS-PRESETS — dựng phần chữ cho 3 mẫu "nhảy chữ" (§4.12).
//!
//! Tách khỏi `ass_writer` để mỗi file < 300 dòng và để test thuần chuỗi.
//!
//! - **Vàng nảy** / **Hiện dần**: mỗi từ một event; event thứ *i* vẽ **cả câu**
//!   nhưng chỉ từ *i* mang thẻ hiệu ứng. Nhờ vậy câu không bị xuống dòng lại và
//!   thời điểm hiệu ứng khớp tuyệt đối với mốc từ (không phụ thuộc trạng thái
//!   karaoke của libass).
//! - **Karaoke xanh**: một event/câu, `\kf` quét màu; `\1c` = màu đã đọc,
//!   `\2c` = màu chưa đọc.

use std::fmt::Write as _;

use super::ass_style::KineticPreset;
use super::ass_writer::escape_ass;
use super::kinetic_timing::TimedWord;

/// Thời gian phóng to rồi thu về của "Vàng nảy" (ms).
const POP_ANIM_MS: u32 = 200;
/// Thời gian hiện ra của "Hiện dần" (ms).
const REVEAL_FADE_MS: u32 = 160;

/// Dòng chữ của một event "Vàng nảy"/"Hiện dần": cả câu, từ `current` được nhấn.
///
/// `dur_ms` = thời lượng của chính từ đó (dùng để không kéo dài animation quá
/// thời gian từ còn trên màn hình).
pub fn highlight_line(
    words: &[TimedWord],
    current: usize,
    preset: KineticPreset,
    primary: &str,
    highlight: &str,
    separator: &str,
    dur_ms: u32,
) -> String {
    let mut out = String::with_capacity(words.len() * 24 + 64);
    let pop_ms = dur_ms.min(POP_ANIM_MS);
    let fade_ms = dur_ms.min(REVEAL_FADE_MS);

    for (index, word) in words.iter().enumerate() {
        if index > 0 {
            out.push_str(separator);
        }
        let text = escape_ass(&word.word);
        if index == current {
            match preset {
                // Vàng + phóng 118 % rồi thu về 100 % trong `pop_ms`.
                KineticPreset::PopAmber => {
                    let _ = write!(
                        out,
                        "{{\\1c{highlight}&\\fscx118\\fscy118\\t(0,{pop_ms},\\fscx100\\fscy100)}}\
                         {text}{{\\1c{primary}&\\fscx100\\fscy100}}"
                    );
                }
                // Hiện ra (mờ dần vào) đúng lúc tới lượt.
                KineticPreset::Reveal => {
                    let _ = write!(
                        out,
                        "{{\\alpha&HFF&\\t(0,{fade_ms},\\alpha&H00&)}}{text}"
                    );
                }
                KineticPreset::KaraokeCyan => out.push_str(&text),
            }
            continue;
        }
        // Từ chưa tới lượt: "Hiện dần" giấu đi nhưng vẫn giữ chỗ trong dòng.
        if preset == KineticPreset::Reveal && index > current {
            let _ = write!(out, "{{\\alpha&HFF&}}{text}");
        } else {
            out.push_str(&text);
        }
    }
    out
}

/// Dòng chữ karaoke `\kf` (một event/câu).
///
/// `\1c` = màu **đã đọc** (highlight), `\2c` = màu **chưa đọc** (màu gốc).
/// Tổng các `\k` bằng đúng thời lượng câu (centi-giây).
pub fn karaoke_line(
    words: &[TimedWord],
    separator: &str,
    primary: &str,
    highlight: &str,
) -> String {
    let mut out = format!("{{\\1c{highlight}&\\2c{primary}&}}");
    for (index, word) in words.iter().enumerate() {
        if index > 0 {
            out.push_str(separator);
        }
        let _ = write!(
            out,
            "{{\\kf{}}}{}",
            word.dur_cs,
            escape_ass(&word.word)
        );
    }
    out
}

// Test nằm ở file riêng (giữ file chính < 300 dòng).
#[cfg(test)]
#[path = "ass_effects_tests.rs"]
mod tests;
