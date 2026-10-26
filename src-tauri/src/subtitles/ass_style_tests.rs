//! Test cho kiểu dáng + preset (§4.12) và đổi màu ASS.

use super::{ass_color, AssStyle, KineticPreset, FONT_BODY, FONT_DISPLAY};

#[test]
fn ten_font_phai_khop_family_name_noi_bo() {
    // Đọc bằng System.Drawing từ 2 file trong src-tauri/resources/fonts.
    assert_eq!(FONT_DISPLAY, "Montserrat Black");
    assert_eq!(FONT_BODY, "Be Vietnam Pro SemiBold");
}

#[test]
fn ba_mau_nhay_chu_dung_mau_4_12() {
    let pop = AssStyle::pop_amber();
    assert_eq!(pop.preset, KineticPreset::PopAmber);
    assert_eq!(pop.font, FONT_DISPLAY);
    assert_eq!(pop.primary, "#FFFFFF");
    assert_eq!(pop.highlight, "#FFC83D");
    assert_eq!(pop.outline, "#000000");

    let kara = AssStyle::karaoke_cyan();
    assert_eq!(kara.preset, KineticPreset::KaraokeCyan);
    assert_eq!(kara.highlight, "#5FD3FF");

    let reveal = AssStyle::reveal();
    assert_eq!(reveal.preset, KineticPreset::Reveal);
    assert_eq!(reveal.font, FONT_DISPLAY);

    // Mẫu "Hộp cam" đã bị bỏ (BorderStyle=3 không vẽ hộp theo từ) — chỉ còn 3 mẫu.
    assert_eq!(
        KineticPreset::ALL.map(|preset| preset.id()),
        ["pop-amber", "karaoke-cyan", "reveal"]
    );
}

#[test]
fn binh_thuong_dung_font_than_va_khong_dam_gia() {
    let normal = AssStyle::normal();
    assert_eq!(normal.font, FONT_BODY);
    assert!(!normal.bold, "file SemiBold đã đậm sẵn");
    assert_eq!(normal.highlight, normal.primary);
}

#[test]
fn mac_dinh_la_kieu_binh_thuong_con_mac_dinh_mau_la_vang_nay() {
    assert_eq!(AssStyle::default().preset, KineticPreset::PopAmber);
    assert_eq!(AssStyle::default().font, FONT_BODY);
    assert_eq!(KineticPreset::default(), KineticPreset::PopAmber);
}

#[test]
fn mau_sai_dinh_dang_fallback_trang() {
    assert_eq!(ass_color("#FFC83D"), "&H003DC8FF");
    assert_eq!(ass_color("5FD3FF"), "&H00FFD35F");
    assert_eq!(ass_color("#12"), "&H00FFFFFF");
    assert_eq!(ass_color("#GGGGGG"), "&H00FFFFFF");
}
