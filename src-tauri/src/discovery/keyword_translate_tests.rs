//! Test thuần cho phần dịch từ khoá sang tiếng Trung (không gọi provider).

use super::*;

// ───────────────────────────── Nhận diện chữ Hán ─────────────────────────────

#[test]
fn chu_han_duoc_nhan_biet() {
    assert!(contains_han("原神"));
    assert!(contains_han("艾尔登法环 剧情"));
    assert!(contains_han("原神 genshin"), "chu Hán lẫn Latin vẫn là có Hán");
}

#[test]
fn khong_co_chu_han_thi_false() {
    assert!(!contains_han("elden ring"));
    assert!(!contains_han(""));
    assert!(!contains_han("12345"));
}

#[test]
fn chu_latin_duoc_nhan_biet() {
    assert!(contains_latin("elden ring"));
    assert!(contains_latin("đấu trường"));
    assert!(!contains_latin("原神"));
    assert!(!contains_latin("123"));
}

// ───────────────────────────── Có cần dịch không ─────────────────────────────

#[test]
fn tu_khoa_latin_can_dich() {
    assert!(needs_translation("elden ring"));
    assert!(needs_translation("elden ring boss"));
    assert!(needs_translation("đấu trường"));
}

#[test]
fn tu_khoa_tieng_trung_khong_dich() {
    assert!(!needs_translation("原神"));
    assert!(!needs_translation("艾尔登法环 剧情"));
    assert!(!needs_translation("原神 genshin"), "đã có chữ Hán ⇒ không dịch");
}

#[test]
fn tu_khoa_rong_hoac_chi_so_khong_dich() {
    assert!(!needs_translation(""));
    assert!(!needs_translation("   "));
    assert!(!needs_translation("2024"));
}

// ───────────────────────────── Làm sạch kết quả ─────────────────────────────

#[test]
fn lam_sach_boc_ngoac_kep() {
    assert_eq!(clean_translated_keyword("\"艾尔登法环\""), "艾尔登法环");
    assert_eq!(clean_translated_keyword("'艾尔登法环'"), "艾尔登法环");
    assert_eq!(clean_translated_keyword("“艾尔登法环”"), "艾尔登法环");
    assert_eq!(clean_translated_keyword("「艾尔登法环」"), "艾尔登法环");
}

#[test]
fn lam_sach_boc_nhan_tien_to() {
    assert_eq!(clean_translated_keyword("关键词: 艾尔登法环"), "艾尔登法环");
    assert_eq!(clean_translated_keyword("Đã dịch: 艾尔登法环"), "艾尔登法环");
    assert_eq!(clean_translated_keyword("翻译：原神"), "原神");
}

#[test]
fn lam_sach_bo_dong_thua_chi_giu_dong_dau() {
    assert_eq!(
        clean_translated_keyword("艾尔登法环\n\nĐây là bản dịch của tôi"),
        "艾尔登法环"
    );
}

#[test]
fn lam_sach_bo_khoi_think() {
    assert_eq!(
        clean_translated_keyword("<think>người dùng muốn dịch tên game</think>原神"),
        "原神"
    );
}

#[test]
fn lam_sach_bo_dau_cau_cuoi() {
    assert_eq!(clean_translated_keyword("原神。"), "原神");
    assert_eq!(clean_translated_keyword("原神!"), "原神");
    assert_eq!(clean_translated_keyword("原神，"), "原神");
    assert_eq!(clean_translated_keyword("  原神  "), "原神");
}

#[test]
fn lam_sach_boc_ngoac_vuong_ben_ngoai() {
    assert_eq!(clean_translated_keyword("[艾尔登法环]"), "艾尔登法环");
    assert_eq!(clean_translated_keyword("【原神】"), "原神");
}

#[test]
fn lam_sach_gop_khoang_trang_thua() {
    assert_eq!(clean_translated_keyword("艾尔登法环   剧情"), "艾尔登法环 剧情");
}

#[test]
fn lam_sach_khong_pham_khong_duoc_dong() {
    assert_eq!(clean_translated_keyword(""), "");
    assert_eq!(clean_translated_keyword("   \n  "), "");
}

// ───────────────────────────── Nhận diện giải thích thừa ─────────────────────────────

#[test]
fn nhan_dien_giai_thich_thua() {
    assert!(looks_like_explanation("dịch từ elden ring"));
    assert!(looks_like_explanation("原文：艾尔登法环"));
    assert!(looks_like_explanation("翻译结果"));
}

#[test]
fn tu_khoa_sach_khong_phai_giai_thich() {
    assert!(!looks_like_explanation("艾尔登法环"));
    assert!(!looks_like_explanation("原神 剧情"));
}
