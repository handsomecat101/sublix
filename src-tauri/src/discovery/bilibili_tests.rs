//! Test parser Bilibili bằng **JSON mẫu thật** (cắt còn 3 phần tử) trong `fixtures/`.
//!
//! Nguồn mẫu: `curl` ngày 2026-10-28 —
//! `popular?ps=20&pn=1`, `ranking/v2`, `search/type?search_type=video&keyword=艾尔登法环`.
//! Chạy: `cargo test --lib discovery`.

use super::*;

const POPULAR: &str = include_str!("fixtures/bilibili_popular.json");
const RANKING: &str = include_str!("fixtures/bilibili_ranking.json");
const SEARCH: &str = include_str!("fixtures/bilibili_search.json");
const ERROR_412: &str = include_str!("fixtures/bilibili_error_412.json");

#[test]
fn popular_doc_du_truong() {
    let items = parse_popular(POPULAR).expect("JSON popular mẫu phải đọc được");
    assert_eq!(items.len(), 3, "fixture giữ 3 video");

    let first = &items[0];
    assert_eq!(first.id, "BV1AtxT6tETW");
    assert_eq!(first.platform, "bilibili");
    assert_eq!(first.title, "《异环》1.5版本前瞻特别节目回顾");
    assert_eq!(first.url, "https://www.bilibili.com/video/BV1AtxT6tETW");
    assert_eq!(
        first.thumbnail_url,
        "https://i0.hdslb.com/bfs/archive/0eb836d332bf50e1347fb35fedfa1ed901d896ad.jpg",
        "pic http:// phải nâng thành https://"
    );
    assert_eq!(first.duration_sec, Some(2289), "popular: duration là số giây");
    assert_eq!(first.view_count, Some(374_009));
    assert_eq!(first.author, "异环");
    assert_eq!(first.publish_time, Some(1_793_189_100));
}

#[test]
fn ranking_doc_du_truong() {
    let items = parse_ranking(RANKING).expect("JSON ranking mẫu phải đọc được");
    assert_eq!(items.len(), 3);

    let first = &items[0];
    assert_eq!(first.id, "BV1kMxM6FECM");
    assert_eq!(first.title, "旗舰手机芯片大横评：苹果高通发哥玄戒谁最强？");
    assert_eq!(first.url, "https://www.bilibili.com/video/BV1kMxM6FECM");
    assert_eq!(first.duration_sec, Some(3435));
    assert_eq!(first.view_count, Some(2_156_916));
    assert_eq!(first.author, "极客湾Geekerwan");
    assert_eq!(first.publish_time, Some(1_793_087_129));
    assert!(first.thumbnail_url.starts_with("https://i1.hdslb.com/"));
}

#[test]
fn search_bo_the_html_va_chuan_hoa_anh() {
    let items = parse_search(SEARCH).expect("JSON search mẫu phải đọc được");
    assert_eq!(items.len(), 3);

    let first = &items[0];
    assert_eq!(
        first.title, "【4K完结】老戴《艾尔登法环｜老头环》“保姆级”【全任务/全成就/全结局】流程攻略解说",
        "thẻ <em class=\"keyword\"> phải bị bỏ (dấu 《 》 giữ đúng như dữ liệu gốc)"
    );
    assert!(!first.title.contains('<'), "không còn thẻ HTML trong tiêu đề");
    assert_eq!(
        first.thumbnail_url,
        "https://i1.hdslb.com/bfs/archive/5aa85037ff11b934d1904321b3041da960af06a0.jpg",
        "pic //i0.hdslb.com ⇒ thêm https:"
    );
    assert_eq!(first.author, "老戴在此", "search dùng author, không phải owner.name");
    assert_eq!(first.view_count, Some(45_071_884), "search dùng play");
    assert_eq!(first.publish_time, Some(1_645_833_609));
}

#[test]
fn search_thoi_luong_dang_chuoi() {
    let items = parse_search(SEARCH).expect("JSON search mẫu phải đọc được");
    assert_eq!(items[0].duration_sec, Some(107_617), "1793:37 ⇒ 1793·60+37");
    assert_eq!(items[1].duration_sec, Some(758), "12:38");
    assert_eq!(items[2].duration_sec, Some(628), "10:28");

    // Các dạng còn lại của Bilibili (số phút > 60, giây 1 chữ số, có giờ).
    assert_eq!(parse_duration_text("3304:2"), Some(198_242));
    assert_eq!(parse_duration_text("0:52"), Some(52));
    assert_eq!(parse_duration_text("1:02:03"), Some(3723));
    assert_eq!(parse_duration_text("--"), None);
    assert_eq!(parse_duration_text("1:2:3:4"), None);
    assert_eq!(parse_duration_text(""), None);
}

#[test]
fn giai_ma_thuc_the_html() {
    let json = r#"{"code":0,"data":{"result":[{"bvid":"BV1xx411c7mD","title":"A &amp; B &quot;C&quot; &#39;D&#39; &#x27;E&#x27; &lt;F&gt; &unknown;","pic":"//i0.hdslb.com/a.jpg","duration":"1:00","play":"1,2万","author":"kênh"}]}}"#;
    let items = parse_search(json).expect("JSON tự viết phải đọc được");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].title, r#"A & B "C" 'D' 'E' <F> &unknown;"#);
    assert_eq!(items[0].view_count, Some(12_000), r#""1,2万" ⇒ 12000"#);
}

#[test]
fn code_khac_0_tra_loi_tieng_viet() {
    let err = parse_popular(ERROR_412).expect_err("code -412 phải là lỗi");
    let message = format!("{err:#}");
    assert!(message.contains("Bilibili từ chối yêu cầu"), "thông điệp: {message}");
    assert!(message.contains("-412"), "phải nêu mã lỗi: {message}");
    assert!(message.contains("request was banned"), "phải kèm message gốc: {message}");
}

#[test]
fn json_hong_bao_loi_doc_duoc() {
    let err = parse_popular("{ đây không phải json").expect_err("JSON hỏng phải là lỗi");
    let message = format!("{err:#}");
    assert!(message.contains("không đọc được"), "thông điệp: {message}");

    let err = parse_search("<html>412</html>").expect_err("HTML 412 phải là lỗi");
    assert!(format!("{err:#}").contains("không đọc được"));
}

#[test]
fn danh_sach_rong_la_ket_qua_hop_le() {
    assert!(parse_popular(r#"{"code":0,"data":{"list":[]}}"#).expect("rỗng").is_empty());
    assert!(parse_ranking(r#"{"code":0,"data":{"list":null}}"#).expect("null").is_empty());
    assert!(parse_popular(r#"{"code":0,"data":{}}"#).expect("thiếu list").is_empty());
    assert!(parse_popular(r#"{"code":0,"data":null}"#).expect("data null").is_empty());
    assert!(parse_search(r#"{"code":0,"data":{"result":[]}}"#).expect("search rỗng").is_empty());
    assert!(parse_search(r#"{"code":0,"data":{}}"#).expect("search thiếu result").is_empty());
}

#[test]
fn bo_qua_video_thieu_bvid() {
    let json = r#"{"code":0,"data":{"list":[{"title":"không có bvid","pic":"","duration":10},{"bvid":"BV1ok411c7mD","title":"ổn","pic":"//i0.hdslb.com/b.jpg","duration":10}]}}"#;
    let items = parse_popular(json).expect("vẫn đọc được danh sách");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].id, "BV1ok411c7mD");
}

#[test]
fn thoi_luong_0_hoac_thieu_la_none() {
    let json = r#"{"code":0,"data":{"list":[{"bvid":"BV1a","duration":0},{"bvid":"BV1b"},{"bvid":"BV1c","duration":"0:00"}]}}"#;
    let items = parse_popular(json).expect("đọc được");
    assert_eq!(items.len(), 3);
    assert!(items.iter().all(|item| item.duration_sec.is_none()), "0 = không rõ (live)");
}
