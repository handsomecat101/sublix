//! Test cho lớp gọi mạng của Khám phá (`discovery/fetch.rs`).
//!
//! **Không gọi mạng** trong test thường — chỉ test hàm thuần (dựng URL, encode,
//! ánh xạ lỗi). Test gọi mạng thật nằm ở [`network_tests`] và đánh dấu `#[ignore]`.

use super::*;

// ───────────────────────────── Dựng URL ─────────────────────────────

#[test]
fn popular_url_dung_ps_20_va_page_bat_dau_tu_1() {
    assert_eq!(
        bilibili_popular_url(1),
        "https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1"
    );
    assert_eq!(
        bilibili_popular_url(3),
        "https://api.bilibili.com/x/web-interface/popular?ps=20&pn=3"
    );
}

#[test]
fn popular_url_page_0_hoac_0_duoc_ep_ve_1() {
    // Page 0 vô nghĩa ⇒ backend không được gửi `pn=0` (API trả rỗng).
    assert!(bilibili_popular_url(0).ends_with("pn=1"));
}

#[test]
fn ranking_url_co_rid_mac_dinh_0() {
    assert_eq!(
        bilibili_ranking_url(0),
        "https://api.bilibili.com/x/web-interface/ranking/v2?rid=0"
    );
    assert_eq!(
        bilibili_ranking_url(3),
        "https://api.bilibili.com/x/web-interface/ranking/v2?rid=3"
    );
}

#[test]
fn search_url_co_search_type_video_va_page() {
    let url = bilibili_search_url("test", 2);
    assert!(url.starts_with(
        "https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword="
    ));
    assert!(url.ends_with("&page=2"));
}

#[test]
fn search_url_page_0_duoc_ep_ve_1() {
    assert!(bilibili_search_url("test", 0).ends_with("&page=1"));
}

#[test]
fn douyin_url_dung_endpoint_bang_hot_word() {
    assert_eq!(
        douyin_hot_url(),
        "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/"
    );
}

// ───────────────────────────── Encode từ khoá ─────────────────────────────

#[test]
fn encode_giu_ky_tu_an_toan() {
    assert_eq!(encode_query_component("abcXYZ019-._~"), "abcXYZ019-._~");
}

#[test]
fn encode_dau_cach_thanh_pct20_khong_phai_dau_plus() {
    // `+` chỉ đúng trong `application/x-www-form-urlencoded`; Bilibili đọc
    // query string ⇒ dùng `%20` cho chắc ăn.
    assert_eq!(encode_query_component("elden ring"), "elden%20ring");
}

#[test]
fn encode_ampersand_va_ky_tu_dac_biet_khong_lot_vao_query() {
    // Nếu `&` không được encode thì từ khoá sẽ tách thành 2 tham số.
    let encoded = encode_query_component("a&b=c?d#e");
    assert!(!encoded.contains('&'));
    assert!(!encoded.contains('='));
    assert!(!encoded.contains('?'));
    assert!(!encoded.contains('#'));
    assert_eq!(encoded, "a%26b%3Dc%3Fd%23e");
}

#[test]
fn encode_chu_trung_theo_byte_utf8() {
    // "艾尔" = 2 ký tự × 3 byte = 6 byte UTF-8 ⇒ 6 cặp `%XX` (18 ký tự hex).
    let encoded = encode_query_component("艾尔");
    assert_eq!(encoded, "%E8%89%BE%E5%B0%94");
    assert_eq!(encoded.len(), 6 * 3);
}

#[test]
fn encode_chu_trung_va_dau_cach_cung_dung() {
    let encoded = encode_query_component("艾尔登法环 剧情");
    assert!(encoded.contains("%20"));
    assert!(!encoded.contains(' '));
    assert!(encoded.starts_with("%E8%89%BE"));
}

// ───────────────────────────── Ánh xạ lỗi ─────────────────────────────

#[test]
fn status_403_412_429_la_bi_chan() {
    assert_eq!(status_prefix(403), PREFIX_BLOCKED);
    assert_eq!(status_prefix(412), PREFIX_BLOCKED);
    assert_eq!(status_prefix(429), PREFIX_BLOCKED);
}

#[test]
fn status_5xx_la_mang() {
    assert_eq!(status_prefix(500), PREFIX_NETWORK);
    assert_eq!(status_prefix(503), PREFIX_NETWORK);
}

#[test]
fn status_khac_la_parse() {
    assert_eq!(status_prefix(404), PREFIX_PARSE);
    assert_eq!(status_prefix(400), PREFIX_PARSE);
}

#[test]
fn code_bilibili_0_la_thanh_cong_khong_loi() {
    assert_eq!(bilibili_code_prefix(0), None);
}

#[test]
fn code_bilibili_am_412_352_509_la_bi_chan() {
    assert_eq!(bilibili_code_prefix(-412), Some(PREFIX_BLOCKED));
    assert_eq!(bilibili_code_prefix(-352), Some(PREFIX_BLOCKED));
    assert_eq!(bilibili_code_prefix(-509), Some(PREFIX_BLOCKED));
}

#[test]
fn code_bilibili_khong_lai_loi_thuong() {
    assert_eq!(bilibili_code_prefix(-400), Some(PREFIX_PARSE));
    assert_eq!(bilibili_code_prefix(1), Some(PREFIX_PARSE));
}

#[test]
fn thong_diep_bi_chan_tim_kiem_co_goi_y_tieng_trung() {
    let message = bilibili_blocked_message(-412, BilibiliScope::Search);
    assert!(message.starts_with(PREFIX_BLOCKED));
    assert!(message.contains("-412"));
    assert!(message.contains("tiếng Trung"));
}

#[test]
fn thong_diep_bi_chan_danh_sach_hot_khong_bao_goi_y_tim_kiem() {
    let message = bilibili_blocked_message(-412, BilibiliScope::Popular);
    assert!(message.starts_with(PREFIX_BLOCKED));
    assert!(message.contains("-412"));
    assert!(!message.contains("tiếng Trung"));
}

// ───────────────────────────── Phong bì nguồn ─────────────────────────────

#[test]
fn phong_bi_bilibili_code_0_ban_duoc() {
    assert!(check_bilibili_envelope(r#"{"code":0,"data":{"list":[]}}"#, BilibiliScope::Popular).is_ok());
}

#[test]
fn phong_bi_bilibili_code_412_bi_chan() {
    let err = check_bilibili_envelope(
        r#"{"code":-412,"message":"Precondition Failed"}"#,
        BilibiliScope::Search,
    )
    .expect_err("code -412 phải là lỗi");
    assert!(err.starts_with(PREFIX_BLOCKED));
    assert!(err.contains("-412"));
}

#[test]
fn phong_bi_bilibili_json_hong_va_parse() {
    let err = check_bilibili_envelope("{khong phai json", BilibiliScope::Popular)
        .expect_err("JSON hỏng phải là lỗi");
    assert!(err.starts_with(PREFIX_PARSE));
}

#[test]
fn phong_bi_douyin_status_code_0_ban_duoc() {
    assert!(check_douyin_envelope(r#"{"status_code":0,"word_list":[]}"#).is_ok());
}

#[test]
fn phong_bi_douyin_status_code_khac_bi_loi() {
    let err = check_douyin_envelope(r#"{"status_code":8,"word_list":[]}"#)
        .expect_err("status_code khác 0 phải là lỗi");
    assert!(err.starts_with(PREFIX_PARSE));
}
