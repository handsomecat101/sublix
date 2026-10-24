//! Test cho phép **cắt đoạn reup** (`section_arg`) — tách riêng `reup_tests.rs`
//! để file test cũ không phải sửa (nguyên tắc: chỉ di chuyển/thêm, không phá).
//!
//! Bao phủ:
//! - `start < end` → hợp lệ.
//! - `start == end` → lỗi (đoạn cắt rỗng).
//! - `start > end` → lỗi (đoạn cắt ngược).
//! - Định dạng `hh:mm:ss`, `mm:ss`, giây lẻ.
//! - Chỉ có start hoặc chỉ có end → vẫn hợp lệ như cũ.

use super::{normalize_timecode, section_arg, timecode_to_secs, ReupOptions};

/// Tạo nhanh `ReupOptions` chỉ có mốc cắt đoạn.
fn opts(start: Option<&str>, end: Option<&str>) -> ReupOptions {
    ReupOptions {
        section_start: start.map(|s| s.to_string()),
        section_end: end.map(|s| s.to_string()),
        ..Default::default()
    }
}

// ---- happy path ------------------------------------------------------------

#[test]
fn start_nho_hon_end_duoc_chap_nhan() {
    let o = opts(Some("00:00:05"), Some("00:00:15"));
    assert_eq!(
        section_arg(&o).unwrap().as_deref(),
        Some("*00:00:05-00:00:15"),
        "start < end → dựng được --download-sections"
    );
}

#[test]
fn start_bang_end_va_start_lon_hon_end_bi_tu_choi() {
    let equal = opts(Some("00:00:10"), Some("00:00:10"));
    let err = section_arg(&equal).expect_err("start == end phải bị từ chối");
    assert!(
        err.contains("nhỏ hơn"),
        "thông báo phải nói rõ start phải nhỏ hơn end, có: {err}"
    );

    let reversed = opts(Some("00:00:20"), Some("00:00:10"));
    let err = section_arg(&reversed).expect_err("start > end phải bị từ chối");
    assert!(
        err.contains("nhỏ hơn"),
        "thông báo phải nói rõ start phải nhỏ hơn end, có: {err}"
    );
}

// ---- định dạng mốc thời gian ------------------------------------------------

#[test]
fn so_sanh_moc_theo_giay_qua_cac_dinh_dang() {
    // hh:mm:ss
    assert_eq!(timecode_to_secs("00:00:05"), Some(5));
    assert_eq!(timecode_to_secs("01:02:03"), Some(3723));
    // mm:ss (phút có thể > 59)
    assert_eq!(timecode_to_secs("01:30"), Some(90));
    assert_eq!(timecode_to_secs("90:30"), Some(5430));
    // giây lẻ (>= 60 vẫn hợp lệ → tự quy ra h:mm:ss)
    assert_eq!(timecode_to_secs("90"), Some(90));
    assert_eq!(timecode_to_secs("3600"), Some(3600));
    // rỗng / sai định dạng
    assert_eq!(timecode_to_secs(""), None);
    assert_eq!(timecode_to_secs("sai"), None);
    assert_eq!(timecode_to_secs("00:00:60"), None, "giây phải < 60");
    assert_eq!(timecode_to_secs("00:60:00"), None, "phút phải < 60");

    // start/end ở 2 định dạng khác nhau vẫn so sánh được theo giây.
    let mixed = opts(Some("01:00"), Some("00:01:30"));
    assert_eq!(
        section_arg(&mixed).unwrap().as_deref(),
        Some("*00:01:00-00:01:30")
    );
    // 90 giây = 1:30 ; end = 100 giây → hợp lệ
    let secs = opts(Some("90"), Some("100"));
    assert_eq!(section_arg(&secs).unwrap().as_deref(), Some("*00:01:30-00:01:40"));
    // 90 giây = 1:30 ; end = 60 giây → ngược → lỗi
    let secs_bad = opts(Some("90"), Some("60"));
    assert!(section_arg(&secs_bad).is_err());
}

#[test]
fn normalize_timecode_giu_nguyen_hanh_vi_cu() {
    assert_eq!(normalize_timecode("00:00:05").as_deref(), Some("00:00:05"));
    assert_eq!(normalize_timecode("01:30").as_deref(), Some("00:01:30"));
    assert_eq!(normalize_timecode("90").as_deref(), Some("00:01:30"));
    assert_eq!(normalize_timecode("3600").as_deref(), Some("01:00:00"));
    assert_eq!(normalize_timecode(""), None);
    assert_eq!(normalize_timecode("sai"), None);
}

// ---- chỉ có một mốc: vẫn hợp lệ như cũ ------------------------------------

#[test]
fn chi_co_mot_moc_van_hop_le() {
    let only_start = opts(Some("00:00:05"), None);
    assert_eq!(section_arg(&only_start).unwrap().as_deref(), Some("*00:00:05-"));

    let only_end = opts(None, Some("00:00:15"));
    assert_eq!(section_arg(&only_end).unwrap().as_deref(), Some("*-00:00:15"));

    // Không có mốc nào → tải cả video.
    let none = opts(None, None);
    assert_eq!(section_arg(&none).unwrap(), None);

    // Ô trống (chỉ khoảng trắng) cũng coi như không có mốc.
    let blank = opts(Some("   "), Some("  "));
    assert_eq!(section_arg(&blank).unwrap(), None);
}

// ---- định dạng sai: vẫn báo lỗi như cũ ------------------------------------

#[test]
fn moc_sai_dinh_dang_van_bi_tu_choi() {
    let bad_start = opts(Some("sai"), Some("00:00:15"));
    let err = section_arg(&bad_start).expect_err("mốc bắt đầu sai → lỗi");
    assert!(err.contains("không hợp lệ"), "phải báo sai định dạng, có: {err}");

    let bad_end = opts(Some("00:00:05"), Some("sai"));
    let err = section_arg(&bad_end).expect_err("mốc kết thúc sai → lỗi");
    assert!(err.contains("không hợp lệ"), "phải báo sai định dạng, có: {err}");
}
