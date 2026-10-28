//! Test định dạng số liệu kiểu Việt (`1,2K` / `3,4M`).
//!
//! Chạy: `cargo test --lib discovery`.

use super::*;

#[test]
fn duoi_1000_giu_nguyen() {
    assert_eq!(format_count(0), "0");
    assert_eq!(format_count(1), "1");
    assert_eq!(format_count(999), "999");
}

#[test]
fn nghin_dung_hau_to_k() {
    assert_eq!(format_count(1_000), "1K");
    assert_eq!(format_count(1_200), "1,2K", "dấu phẩy thập phân kiểu Việt");
    assert_eq!(format_count(1_234), "1,2K");
    assert_eq!(format_count(12_800), "12,8K");
    assert_eq!(format_count(374_009), "374K");
}

#[test]
fn trieu_dung_hau_to_m() {
    assert_eq!(format_count(1_000_000), "1M");
    assert_eq!(format_count(2_156_916), "2,2M");
    assert_eq!(format_count(3_400_000), "3,4M");
    assert_eq!(format_count(45_071_884), "45,1M");
    assert_eq!(format_count(1_050_000), "1,1M", "1,05 ⇒ làm tròn 1,1");
}

#[test]
fn ty_dung_hau_to_t() {
    assert_eq!(format_count(1_000_000_000), "1T");
    assert_eq!(format_count(1_234_567_890), "1,2T");
}

#[test]
fn lam_tron_vuot_don_vi_thi_nhay_don_vi() {
    assert_eq!(format_count(999_950), "1M", "không bao giờ hiện 1000K");
    assert_eq!(format_count(999_999), "1M");
    assert_eq!(format_count(999_999_999), "1T");
}

#[test]
fn khong_co_duoi_0_thua() {
    assert!(!format_count(1_000).contains(','));
    assert_eq!(format_count(10_000), "10K");
    assert_eq!(format_count(100_000), "100K");
}
