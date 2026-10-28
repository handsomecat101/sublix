//! Test bộ lọc rác (`junk_filter.rs`): từ khoá 3 ngôn ngữ, intro/outro theo vị trí,
//! gộp khoảng, và các ca **không được lọc nhầm**.
//!
//! Chạy: `cargo test --lib lab`.

use super::*;

fn opts() -> JunkOptions {
    JunkOptions::default()
}

fn line(start: f64, end: f64, text: &str) -> DialogLine {
    DialogLine::new(start, end, text)
}

fn has_keyword(range: &JunkRange, keyword: &str) -> bool {
    range
        .reasons
        .iter()
        .any(|reason| matches!(reason, JunkReason::Keyword(word) if word == keyword))
}

fn has_reason(range: &JunkRange, wanted: JunkReason) -> bool {
    range.reasons.contains(&wanted)
}

#[test]
fn bat_tu_khoa_tieng_viet() {
    let lines = vec![
        line(10.0, 12.0, "Nhớ đăng ký kênh nhé"),
        line(100.0, 103.0, "Video này được nhà tài trợ bởi một hãng tai nghe"),
        line(200.0, 202.0, "Các bạn donate cho mình nhé"),
        line(300.0, 302.0, "Anh ta rút kiếm và lao vào quái vật"),
    ];
    let junk = find_junk(0, &lines, 600.0, &opts());
    assert_eq!(junk.len(), 3, "3 câu rác, câu cốt truyện không bị lọc: {junk:?}");
    assert!(has_keyword(&junk[0], "đăng ký kênh"));
    assert!(has_keyword(&junk[1], "nhà tài trợ"));
    assert!(has_keyword(&junk[2], "donate"));
}

#[test]
fn bat_tu_khoa_tieng_anh() {
    let lines = vec![
        line(10.0, 13.0, "Like and subscribe for more"),
        line(100.0, 104.0, "This video is sponsored by NordVPN"),
        line(200.0, 203.0, "Thanks for watching, guys"),
    ];
    let junk = find_junk(0, &lines, 600.0, &opts());
    assert_eq!(junk.len(), 3);
    assert!(junk.iter().any(|range| has_keyword(range, "subscribe")));
    assert!(junk.iter().any(|range| has_keyword(range, "sponsored")));
    assert!(junk.iter().any(|range| has_keyword(range, "thanks for watching")));
}

#[test]
fn bat_tu_khoa_tieng_trung() {
    let lines = vec![
        line(10.0, 12.0, "记得关注我的频道"),
        line(100.0, 102.0, "点赞投币收藏"),
        line(200.0, 203.0, "本视频由某某品牌赞助"),
        line(300.0, 302.0, "主角推开了大门"),
    ];
    let junk = find_junk(0, &lines, 900.0, &opts());
    assert_eq!(junk.len(), 3);
    assert!(junk.iter().any(|range| has_keyword(range, "关注")));
    assert!(junk.iter().any(|range| has_keyword(range, "点赞")));
    assert!(junk.iter().any(|range| has_keyword(range, "赞助")));
}

#[test]
fn tu_khoa_khong_dau_van_khop() {
    // STT đôi khi bỏ dấu tiếng Việt.
    let lines = vec![line(10.0, 12.0, "nho dang ky kenh nhe")];
    let junk = find_junk(0, &lines, 600.0, &opts());
    assert_eq!(junk.len(), 1);
    assert!(has_keyword(&junk[0], "đăng ký kênh"));
    assert_eq!(fold("Đăng KÝ Kênh"), "dang ky kenh");
}

#[test]
fn intro_chi_tinh_trong_60_giay_dau() {
    let dau = find_junk(0, &[line(5.0, 8.0, "Xin chào các bạn, mình là Nam")], 600.0, &opts());
    assert_eq!(dau.len(), 1);
    assert!(has_reason(&dau[0], JunkReason::Intro));

    let giua = find_junk(0, &[line(120.0, 123.0, "Xin chào các bạn, mình là Nam")], 600.0, &opts());
    assert!(giua.is_empty(), "cùng câu nhưng ở giữa video ⇒ không phải intro");
}

#[test]
fn outro_chi_tinh_trong_60_giay_cuoi() {
    let cuoi = find_junk(0, &[line(590.0, 595.0, "Hẹn gặp lại các bạn ở video sau")], 600.0, &opts());
    assert_eq!(cuoi.len(), 1);
    assert!(has_reason(&cuoi[0], JunkReason::Outro));

    let giua = find_junk(0, &[line(30.0, 33.0, "Hẹn gặp lại các bạn ở video sau")], 600.0, &opts());
    assert!(giua.is_empty());
}

#[test]
fn gop_hai_khoang_rac_sat_nhau() {
    let lines = vec![
        line(10.0, 12.0, "Nhớ đăng ký kênh"),
        line(13.0, 14.0, "Cảm ơn các bạn đã ủng hộ"),
    ];
    let junk = find_junk(0, &lines, 600.0, &opts());
    assert_eq!(junk.len(), 1, "cách nhau 1 s < 2 s ⇒ gộp");
    assert!((junk[0].start - 10.0).abs() < 1e-9);
    assert!((junk[0].end - 14.0).abs() < 1e-9);
    assert_eq!(junk[0].reasons.len(), 2, "giữ lý do của cả hai câu");
}

#[test]
fn khong_gop_khi_cach_xa() {
    let lines = vec![
        line(10.0, 12.0, "Nhớ đăng ký kênh"),
        line(60.0, 62.0, "Cảm ơn các bạn đã ủng hộ"),
    ];
    let junk = find_junk(0, &lines, 600.0, &opts());
    assert_eq!(junk.len(), 2);
}

#[test]
fn khong_loc_nham_cau_co_chu_tai() {
    // "tải" đơn lẻ trong ngữ cảnh gameplay KHÔNG bị coi là rác.
    let lines = vec![
        line(100.0, 103.0, "Hãy tải bản đồ này để mở khóa khu vực mới"),
        line(200.0, 202.0, "Cậu ấy chất đầy hàng lên xe tải"),
    ];
    let junk = find_junk(0, &lines, 600.0, &opts());
    assert!(junk.is_empty(), "không được lọc nhầm: {junk:?}");

    // GIỚI HẠN đã biết: cụm "đang tải" (màn loading) bị coi là rác ở mọi ngữ cảnh.
    let loading = find_junk(0, &[line(100.0, 102.0, "Tôi đang tải lại màn chơi")], 600.0, &opts());
    assert_eq!(loading.len(), 1);
}

#[test]
fn cau_ket_thuc_co_hai_ly_do() {
    let junk = find_junk(
        0,
        &[line(590.0, 595.0, "Cảm ơn đã xem, nhớ đăng ký kênh nhé")],
        600.0,
        &opts(),
    );
    assert_eq!(junk.len(), 1);
    assert!(has_reason(&junk[0], JunkReason::Outro), "vừa là outro");
    assert!(has_keyword(&junk[0], "đăng ký kênh"), "vừa là quảng cáo");
}

#[test]
fn bien_duoc_kep_va_bo_qua_khoang_khong_hop_le() {
    let lines = vec![
        line(590.0, 700.0, "Nhớ đăng ký kênh"),
        line(700.0, 710.0, "Nhớ đăng ký kênh"),
        line(50.0, 50.0, "Nhớ đăng ký kênh"),
    ];
    let junk = find_junk(0, &lines, 600.0, &opts());
    assert_eq!(junk.len(), 1);
    assert!((junk[0].end - 600.0).abs() < 1e-9, "kẹp theo thời lượng video");
}

#[test]
fn video_chua_biet_thoi_luong_thi_khong_loc() {
    assert!(find_junk(0, &[line(0.0, 5.0, "Nhớ đăng ký kênh")], 0.0, &opts()).is_empty());
    assert!(find_junk(0, &[], 600.0, &opts()).is_empty());
}

#[test]
fn giu_nguyen_nguon_trong_ket_qua() {
    let junk = find_junk(2, &[line(10.0, 12.0, "Nhớ đăng ký kênh")], 600.0, &opts());
    assert_eq!(junk[0].source_idx, 2, "để allocate biết rác thuộc video nào");
    assert!(junk[0].overlaps(11.0, 13.0));
    assert!(!junk[0].overlaps(12.0, 14.0), "chạm biên không tính là chồng");
}
