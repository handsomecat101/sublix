//! Test parser `ytsearch` bằng JSON thật của `yt-dlp` trong `fixtures/`.
//!
//! Nguồn mẫu: `yt-dlp --dump-single-json --flat-playlist --no-warnings "ytsearch3:elden ring"`
//! ngày 2026-10-28. Chạy: `cargo test --lib discovery`.

use super::*;

const YTSEARCH: &str = include_str!("fixtures/youtube_search.json");

#[test]
fn ytsearch_doc_du_truong() {
    let items = parse_ytsearch(YTSEARCH).expect("JSON ytsearch mẫu phải đọc được");
    assert_eq!(items.len(), 3);

    let first = &items[0];
    assert_eq!(first.id, "OVr1VJyWJ9Y");
    assert_eq!(first.platform, "youtube");
    assert_eq!(first.title, "Every Weapon Type Ranked! Elden Ring Tier List");
    assert_eq!(first.url, "https://www.youtube.com/watch?v=OVr1VJyWJ9Y");
    assert_eq!(first.duration_sec, Some(2540), "duration là số giây");
    assert_eq!(first.view_count, Some(71_626));
    assert_eq!(first.author, "Youwy", "ưu tiên channel");
    assert_eq!(first.publish_time, None, "flat-playlist không trả timestamp");
    assert!(
        first.thumbnail_url.contains("rs=AOn4CLBDh3TRn1-2T5dcX5MmqIRZypPzPg"),
        "chọn ảnh rộng nhất ≤ 720 px, nhận được: {}",
        first.thumbnail_url
    );

    assert_eq!(items[1].id, "MphIMz3HoeM");
    assert_eq!(items[1].author, "Rusty.");
    assert_eq!(items[1].duration_sec, Some(1539));
    assert_eq!(items[2].id, "lJai4M0xT6c");
    assert_eq!(items[2].duration_sec, Some(22_993));
}

#[test]
fn thieu_thumbnails_thi_dung_anh_mac_dinh() {
    let json = r#"{"entries":[{"id":"abc123","title":"không có ảnh","duration":95.4}]}"#;
    let items = parse_ytsearch(json).expect("đọc được");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].thumbnail_url, "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
    assert_eq!(items[0].duration_sec, Some(95), "95,4 s ⇒ làm tròn 95");
    assert_eq!(items[0].author, "", "không có channel ⇒ rỗng");
}

#[test]
fn chi_co_anh_lon_hon_720_thi_lay_anh_nho_nhat() {
    let json = r#"{"entries":[{"id":"big1","title":"t","thumbnails":[{"url":"https://i.ytimg.com/vi/big1/maxres.jpg","width":1920},{"url":"https://i.ytimg.com/vi/big1/sd.jpg","width":1280}]}]}"#;
    let items = parse_ytsearch(json).expect("đọc được");
    assert_eq!(items[0].thumbnail_url, "https://i.ytimg.com/vi/big1/sd.jpg");

    let empty = r#"{"entries":[{"id":"big2","title":"t","thumbnails":[{"url":"  ","width":720}]}]}"#;
    let items = parse_ytsearch(empty).expect("đọc được");
    assert_eq!(items[0].thumbnail_url, "https://i.ytimg.com/vi/big2/hqdefault.jpg", "url rỗng bị bỏ");
}

#[test]
fn bo_muc_thieu_id_va_json_hong() {
    let json = r#"{"entries":[{"title":"không id"},{"id":"good1","title":"ổn","channel":"kênh"}]}"#;
    let items = parse_ytsearch(json).expect("đọc được");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].id, "good1");
    assert_eq!(items[0].author, "kênh");

    let err = parse_ytsearch("ERROR: [youtube] trending: nope").expect_err("không phải JSON");
    assert!(format!("{err:#}").contains("không đọc được"));
}

#[test]
fn danh_sach_rong_la_hop_le() {
    assert!(parse_ytsearch(r#"{"entries":null}"#).expect("null").is_empty());
    assert!(parse_ytsearch(r#"{"entries":[]}"#).expect("rỗng").is_empty());
    assert!(parse_ytsearch(r#"{"id":"elden ring"}"#).expect("thiếu entries").is_empty());
}

#[test]
fn ytsearch_query_lam_sach_tu_khoa() {
    assert_eq!(ytsearch_query("elden ring", 3), "ytsearch3:elden ring");
    assert_eq!(
        ytsearch_query("  elden\n\r\t  ring  ", 3),
        "ytsearch3:elden ring",
        "bỏ xuống dòng + gộp khoảng trắng"
    );
    assert_eq!(ytsearch_query("艾尔登法环", 20), "ytsearch20:艾尔登法环");
    assert_eq!(ytsearch_query("a", 0), "ytsearch1:a", "count 0 ⇒ 1");
    assert_eq!(ytsearch_query("a", 999), "ytsearch50:a", "count 999 ⇒ 50");
}

#[test]
fn ytsearch_query_cat_100_ky_tu() {
    let long = "ừ".repeat(150);
    let query = ytsearch_query(&long, 5);
    let keyword = query.trim_start_matches("ytsearch5:");
    assert_eq!(keyword.chars().count(), 100, "cắt theo char, không cắt giữa ký tự");
    assert!(keyword.chars().all(|ch| ch == 'ừ'));
}

#[test]
fn sanitize_keyword_bo_khoang_trang_thua() {
    assert_eq!(sanitize_keyword("  nhiều   khoảng   trắng "), "nhiều khoảng trắng");
    assert_eq!(sanitize_keyword("dòng 1\ndòng 2"), "dòng 1 dòng 2");
    assert_eq!(sanitize_keyword(""), "");
}
