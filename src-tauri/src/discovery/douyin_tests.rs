//! Test parser Douyin hot word bằng JSON mẫu thật trong `fixtures/`.
//!
//! Nguồn mẫu: `curl https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/`
//! ngày 2026-10-28. Chạy: `cargo test --lib discovery`.

use super::*;

const HOT: &str = include_str!("fixtures/douyin_hot.json");

#[test]
fn hot_word_doc_du_truong() {
    let words = parse_hot_words(HOT).expect("JSON hot word mẫu phải đọc được");
    assert_eq!(words.len(), 3);

    assert_eq!(words[0].word, "在稻城亚丁看一场秋日童话");
    assert_eq!(words[0].hot_value, Some(11_821_976));
    assert_eq!(words[0].label.as_deref(), Some("3"), "label số 3 ⇒ chuỗi \"3\"");

    assert_eq!(words[1].word, "国务院原副总理刘延东逝世");
    assert_eq!(words[1].hot_value, Some(11_347_712));
    assert_eq!(words[1].label.as_deref(), Some("0"), "label 0 vẫn giữ, không bị coi là None");

    assert_eq!(words[2].word, "一张全国算力网重塑生产生活");
}

#[test]
fn status_code_khac_0_bao_loi_tieng_viet() {
    let json = r#"{"status_code":5,"message":"rate limited","word_list":[]}"#;
    let err = parse_hot_words(json).expect_err("status_code 5 phải là lỗi");
    let message = format!("{err:#}");
    assert!(message.contains("Douyin từ chối yêu cầu"), "thông điệp: {message}");
    assert!(message.contains("mã 5"), "phải nêu mã: {message}");
    assert!(message.contains("rate limited"), "phải kèm message gốc: {message}");
}

#[test]
fn json_hong_bao_loi_doc_duoc() {
    let err = parse_hot_words("{\"status_code\": 0,").expect_err("JSON hỏng phải là lỗi");
    assert!(format!("{err:#}").contains("không đọc được"));
}

#[test]
fn danh_sach_rong_la_hop_le() {
    assert!(parse_hot_words(r#"{"status_code":0,"word_list":[]}"#).expect("rỗng").is_empty());
    assert!(parse_hot_words(r#"{"status_code":0,"word_list":null}"#).expect("null").is_empty());
    assert!(parse_hot_words(r#"{"status_code":0}"#).expect("thiếu word_list").is_empty());
}

#[test]
fn bo_tu_khoa_rong_va_chap_nhan_hot_value_dang_chuoi() {
    let json = r#"{"status_code":0,"word_list":[{"word":"   ","hot_value":1},{"word":"  chủ đề  ","hot_value":"12345","label":null},{"word":"khác","hot_value":null,"label":"Hot"}]}"#;
    let words = parse_hot_words(json).expect("đọc được");
    assert_eq!(words.len(), 2, "từ khoá rỗng bị bỏ");
    assert_eq!(words[0].word, "chủ đề", "phải trim");
    assert_eq!(words[0].hot_value, Some(12_345));
    assert_eq!(words[0].label, None, "label null ⇒ None");
    assert_eq!(words[1].hot_value, None);
    assert_eq!(words[1].label.as_deref(), Some("Hot"), "label chuỗi giữ nguyên");
}
