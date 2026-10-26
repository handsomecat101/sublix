//! Test cho `ass_writer`: header, PlayRes, escape, định dạng giờ, karaoke, band.

use super::{ass_color, build_ass, AssStyle, SubMode};
use crate::subtitles::kinetic_timing::total_cs;

fn one(text: &str, start: f64, end: f64) -> Vec<(f64, f64, String)> {
    vec![(start, end, text.to_string())]
}

fn style_line(ass: &str) -> &str {
    ass.lines()
        .find(|line| line.starts_with("Style: Default,"))
        .expect("phải có dòng Style")
}

fn dialogue_lines(ass: &str) -> Vec<&str> {
    ass.lines().filter(|line| line.starts_with("Dialogue: ")).collect()
}

/// Tổng các giá trị `\k` trong nội dung ASS.
fn karaoke_sum(ass: &str) -> u32 {
    let mut sum = 0u32;
    let mut rest = ass;
    while let Some(start) = rest.find("{\\k") {
        let after = &rest[start + 3..];
        let end = after.find('}').expect("thẻ \\k phải có } đóng");
        sum += after[..end].parse::<u32>().expect("\\k phải là số");
        rest = &after[end + 1..];
    }
    sum
}

#[test]
fn header_va_playres_dung_kich_thuoc_video() {
    let ass = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Normal, &AssStyle::classic(), 1920, 1080, None);
    assert!(ass.starts_with("[Script Info]\n"), "phải bắt đầu bằng [Script Info]");
    assert!(ass.contains("ScriptType: v4.00+"));
    assert!(ass.contains("PlayResX: 1920"));
    assert!(ass.contains("PlayResY: 1080"));
    assert!(ass.contains("[V4+ Styles]"));
    assert!(ass.contains("[Events]"));
    assert!(ass.contains("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"));
}

#[test]
fn style_classic_trang_vien_den_dung_format_23_truong() {
    let ass = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Normal, &AssStyle::classic(), 1280, 720, None);
    let style = style_line(&ass);
    assert!(style.contains("Default,Be Vietnam Pro,64,"), "font + cỡ chữ: {style}");
    assert!(style.contains("&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000"), "màu: {style}");
    assert!(style.ends_with(",2,60,60,120,1"), "alignment/margin: {style}");
    // 23 trường theo Format của [V4+ Styles].
    assert_eq!(style.trim_end().split(',').count(), 23);
}

#[test]
fn style_tiktok_va_neon_dung_mau_cong_bo() {
    let tiktok = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Kinetic, &AssStyle::tiktok_yellow(), 1920, 1080, None);
    // trắng + vàng #FFD400 (BGR) + viền đen
    assert!(style_line(&tiktok).contains("&H00FFFFFF,&H0000D4FF,&H00000000"));
    assert!(style_line(&tiktok).contains("&H64000000,-1,"), "phải in đậm");
    assert!(style_line(&tiktok).contains("Be Vietnam Pro,68,"), "cỡ chữ 68");

    let neon = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Kinetic, &AssStyle::neon(), 1920, 1080, None);
    // trắng-xanh #F2F7FF, cyan #00E5FF, viền tím #B026FF
    assert!(style_line(&neon).contains("&H00FFF7F2,&H00FFE500,&H00FF26B0"));
}

#[test]
fn mau_sai_dinh_dang_fallback_trang() {
    assert_eq!(ass_color("#FFD400"), "&H0000D4FF");
    assert_eq!(ass_color("00FF00"), "&H0000FF00");
    assert_eq!(ass_color("#12"), "&H00FFFFFF");
    assert_eq!(ass_color("#GGGGGG"), "&H00FFFFFF");
}

#[test]
fn gio_dung_dinh_dang_h_mm_ss_cc() {
    let ass = build_ass(&one("A", 3723.456, 3725.0), SubMode::Normal, &AssStyle::classic(), 1920, 1080, None);
    assert!(
        ass.contains("Dialogue: 0,1:02:03.46,1:02:05.00,Default,,0,0,0,,"),
        "giờ ASS sai: {}",
        dialogue_lines(&ass)[0]
    );
    // Thời gian âm/kém hợp lệ ⇒ 0:00:00.00 (không panic, không NaN).
    let odd = build_ass(&one("A", -3.0, f64::NAN), SubMode::Normal, &AssStyle::classic(), 1920, 1080, None);
    assert!(dialogue_lines(&odd)[0].starts_with("Dialogue: 0,0:00:00.00,0:00:00.00,"));
}

#[test]
fn escape_ky_tu_dac_biet_ass() {
    let ass = build_ass(&one("a{b}\\c\nd", 0.0, 2.0), SubMode::Normal, &AssStyle::classic(), 1920, 1080, None);
    assert!(ass.contains("a\\{b\\}\\\\c\\Nd"), "escape sai: {}", dialogue_lines(&ass)[0]);
}

#[test]
fn normal_moi_cau_mot_dong_va_khong_co_karaoke() {
    let segments = vec![
        (0.0, 1.0, "Một".to_string()),
        (1.0, 2.0, "Hai".to_string()),
        (2.0, 3.0, "   ".to_string()),
    ];
    let ass = build_ass(&segments, SubMode::Normal, &AssStyle::classic(), 1920, 1080, None);
    assert_eq!(dialogue_lines(&ass).len(), 2, "câu rỗng phải bị bỏ qua");
    assert!(!ass.contains("{\\k"), "Normal không được có karaoke");
    assert!(ass.contains(",Một"));
    assert!(ass.contains(",Hai"));
}

#[test]
fn kinetic_tong_karaoke_bang_thoi_luong_cau() {
    let text = "Vậy hai cô gái làm múa khỏe thân này đang dính vào một vụ rắc rối lớn.";
    let (start, end) = (0.0, 6.48);
    let ass = build_ass(&one(text, start, end), SubMode::Kinetic, &AssStyle::tiktok_yellow(), 1920, 1080, None);
    assert_eq!(karaoke_sum(&ass), total_cs(start, end));
    assert_eq!(karaoke_sum(&ass), 648);
    // Từ đang nói = vàng (\1c), từ chưa nói = trắng (\2c).
    assert!(ass.contains("{\\1c&H0000D4FF&\\2c&H00FFFFFF&}{\\k36}Vậy {\\k36}hai "));
    // Từ cuối nhận phần dư (36*16 = 576 ⇒ còn 72).
    assert!(ass.contains("{\\k72}lớn."));
}

#[test]
fn kinetic_cjk_khong_chen_khoang_trang() {
    let ass = build_ass(&one("你好，世界！", 10.0, 11.5), SubMode::Kinetic, &AssStyle::neon(), 1920, 1080, None);
    assert!(ass.contains("{\\k28}你{\\k46}好，{\\k28}世{\\k48}界！"), "karaoke CJK sai");
    assert_eq!(karaoke_sum(&ass), 150);
}

#[test]
fn band_dat_phu_de_vao_giua_dai() {
    let ass = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Normal, &AssStyle::classic(), 1920, 1080, Some((800, 200)));
    assert!(ass.contains("{\\an5\\pos(960,900)}"), "tâm dải y=800 h=200 ⇒ 900");

    // Không có band ⇒ không chèn \pos (căn đáy theo MarginV).
    let plain = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Normal, &AssStyle::classic(), 1920, 1080, None);
    assert!(!plain.contains("\\pos("));
    assert!(style_line(&plain).contains(",2,60,60,120,1"));

    // Dải tràn đáy ⇒ kẹp trong khung hình.
    let clamped = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Normal, &AssStyle::classic(), 1920, 1080, Some((1000, 400)));
    assert!(clamped.contains("{\\an5\\pos(960,1080)}"));
}

#[test]
fn band_ap_dung_cho_ca_kinetic() {
    let ass = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Kinetic, &AssStyle::tiktok_yellow(), 1280, 720, Some((500, 100)));
    assert!(ass.contains("{\\an5\\pos(640,550)}"));
    assert_eq!(karaoke_sum(&ass), 200);
}
