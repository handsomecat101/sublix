//! Test thuần chuỗi cho 3 mẫu "nhảy chữ" (`ass_effects`).

use super::{highlight_line, karaoke_line};
use crate::subtitles::ass_writer::KineticPreset;
use crate::subtitles::kinetic_timing::time_words;

const PRIMARY: &str = "&H00FFFFFF";
const AMBER: &str = "&H003DC8FF";
const CYAN: &str = "&H00FFD35F";

fn words(text: &str) -> Vec<crate::subtitles::kinetic_timing::TimedWord> {
    time_words(text, 0.0, 2.0)
}

fn words_span(text: &str, start: f64, end: f64) -> Vec<crate::subtitles::kinetic_timing::TimedWord> {
    time_words(text, start, end)
}

#[test]
fn vang_nay_chi_nhan_tu_dang_noi_va_phong_118() {
    let line = highlight_line(&words("Xin chào các bạn"), 1, KineticPreset::PopAmber, PRIMARY, AMBER, " ", 500);
    assert_eq!(
        line,
        "Xin {\\1c&H003DC8FF&\\fscx118\\fscy118\\t(0,200,\\fscx100\\fscy100)}chào{\\1c&H00FFFFFF&\\fscx100\\fscy100} các bạn"
    );
}

#[test]
fn vang_nay_animation_khong_dai_hon_thoi_luong_tu() {
    // Từ 5 cs = 50 ms ⇒ animation co lại còn 50 ms.
    let line = highlight_line(&words("Xin chào"), 0, KineticPreset::PopAmber, PRIMARY, AMBER, " ", 50);
    assert!(line.contains("\\t(0,50,\\fscx100\\fscy100)"), "line: {line}");
}

#[test]
fn hien_dan_giau_tu_sau_va_hien_tu_dang_toi_luot() {
    let line = highlight_line(&words("Xin chào các bạn"), 1, KineticPreset::Reveal, PRIMARY, AMBER, " ", 500);
    assert_eq!(
        line,
        "Xin {\\alpha&HFF&\\t(0,160,\\alpha&H00&)}chào {\\alpha&HFF&}các {\\alpha&HFF&}bạn"
    );
}

#[test]
fn hien_dan_tu_cuoi_khong_con_tu_bi_giau() {
    let line = highlight_line(&words("Xin chào"), 1, KineticPreset::Reveal, PRIMARY, AMBER, " ", 500);
    assert_eq!(line, "Xin {\\alpha&HFF&\\t(0,160,\\alpha&H00&)}chào");
}

#[test]
fn karaoke_dung_kf_va_giu_dung_khoang_trang() {
    let line = karaoke_line(&words("Xin chào các bạn"), " ", PRIMARY, CYAN);
    assert_eq!(
        line,
        "{\\1c&H00FFD35F&\\2c&H00FFFFFF&}{\\kf50}Xin {\\kf50}chào {\\kf50}các {\\kf50}bạn"
    );
}

#[test]
fn karaoke_cjk_khong_chen_khoang_trang() {
    let line = karaoke_line(&words_span("你好，世界！", 10.0, 11.5), "", PRIMARY, CYAN);
    assert_eq!(
        line,
        "{\\1c&H00FFD35F&\\2c&H00FFFFFF&}{\\kf28}你{\\kf46}好，{\\kf28}世{\\kf48}界！"
    );
}

#[test]
fn thoat_ky_tu_dac_biet_trong_tung_tu() {
    let line = highlight_line(&words("a{b} c\\d"), 1, KineticPreset::PopAmber, PRIMARY, AMBER, " ", 500);
    assert!(line.contains("a\\{b\\}"), "line: {line}");
    assert!(line.contains("c\\\\d"), "line: {line}");
}
