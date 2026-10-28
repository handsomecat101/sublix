//! Test định dạng số kiểu Việt (`discovery/format.rs`).

use super::*;

#[test]
fn duoi_1000_giu_nguyen() {
    assert_eq!(format_count(0), "0");
    assert_eq!(format_count(1), "1");
    assert_eq!(format_count(999), "999");
}

#[test]
fn nghin_dung_hau_to_nghin() {
    assert_eq!(format_count(1_000), "1 nghìn");
    assert_eq!(format_count(1_200), "1,2 nghìn", "dấu phẩy thập phân kiểu Việt");
    assert_eq!(format_count(1_234), "1,2 nghìn");
    assert_eq!(format_count(12_800), "12,8 nghìn");
    assert_eq!(format_count(374_009), "374 nghìn");
}

#[test]
fn trieu_dung_hau_to_trieu() {
    assert_eq!(format_count(1_000_000), "1 triệu");
    assert_eq!(format_count(2_156_916), "2,2 triệu");
    assert_eq!(format_count(3_400_000), "3,4 triệu");
    assert_eq!(format_count(45_071_884), "45,1 triệu");
    assert_eq!(format_count(1_050_000), "1,1 triệu", "1,05 ⇒ làm tròn 1,1");
    assert_eq!(format_count(50_000_000), "50 triệu");
}

#[test]
fn ty_dung_hau_to_ty() {
    assert_eq!(format_count(1_000_000_000), "1 tỷ");
    assert_eq!(format_count(1_234_567_890), "1,2 tỷ");
}

#[test]
fn lam_tron_vuot_don_vi_thi_nhay_don_vi() {
    assert_eq!(format_count(999_950), "1 triệu", "không bao giờ hiện 1000 nghìn");
    assert_eq!(format_count(999_999), "1 triệu");
    assert_eq!(format_count(999_999_999), "1 tỷ");
}

#[test]
fn khong_co_duoi_0_thua() {
    assert!(!format_count(1_000).contains(','));
    assert_eq!(format_count(10_000), "10 nghìn");
    assert_eq!(format_count(100_000), "100 nghìn");
}
