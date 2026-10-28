//! Test parser JSON khoan dung của LLM (`lab/llm_json.rs`).

use super::*;

#[test]
fn json_thuan_duoc_doc() {
    let raw = r#"{"game_title":"Elden Ring","overall_summary":"abc"}"#;
    let parsed = parse_analysis(raw).expect("phải parse được");
    assert_eq!(parsed.game_title, "Elden Ring");
    assert_eq!(parsed.overall_summary, "abc");
}

#[test]
fn bo_fence_markdown() {
    let raw = "```json\n{\"game_title\":\"Dark Souls\"}\n```";
    let parsed = parse_analysis(raw).expect("phải parse được");
    assert_eq!(parsed.game_title, "Dark Souls");
}

#[test]
fn bo_loi_dan_truoc_khoi_json() {
    let raw = "Dưới đây là kết quả phân tích:\n{\"game_title\":\"Hollow Knight\"}\nHết.";
    let parsed = parse_analysis(raw).expect("phải parse được");
    assert_eq!(parsed.game_title, "Hollow Knight");
}

#[test]
fn doc_nhieu_khoi_json_chi_lay_khoi_dau() {
    let raw = r#"{"game_title":"A"} {"game_title":"B"}"#;
    let parsed = parse_analysis(raw).expect("phải parse được");
    assert_eq!(parsed.game_title, "A");
}

#[test]
fn chuoi_va_escape_trong_json_khong_lam_vo_ngoac() {
    let raw = r#"{"game_title":"A { B","overall_summary":"c \" } d"}"#;
    let parsed = parse_analysis(raw).expect("phải parse được");
    assert_eq!(parsed.game_title, "A { B");
    assert_eq!(parsed.overall_summary, "c \" } d");
}

#[test]
fn thieu_truong_van_parse_duoc() {
    // LLM chỉ trả về mảng rỗng ⇒ vẫn ra kết quả dùng được.
    let raw = r#"{"characters":[],"chapters":[]}"#;
    let parsed = parse_analysis(raw).expect("phải parse được");
    assert!(parsed.characters.is_empty());
    assert!(parsed.chapters.is_empty());
    assert_eq!(parsed.game_title, "");
}

#[test]
fn parse_nhan_vat_va_chuong() {
    let raw = r#"{
        "game_title": "Elden Ring",
        "characters": [{"name":"Tarnished","subtitle_name":"người tẩm rác","role":"Nhân vật chính","motivation":"trả thù"}],
        "chapters": [{"chapter_idx":1,"source_idx":0,"title":"Mở đầu","time_range":"00:00:15,000-00:03:45,000","type":"cutscene","core_event":"gặp Melina","narrative_function":"Mở đầu"}]
    }"#;
    let parsed = parse_analysis(raw).expect("phải parse được");
    assert_eq!(parsed.characters.len(), 1);
    assert_eq!(parsed.characters[0].name, "Tarnished");
    assert_eq!(parsed.chapters.len(), 1);
    assert_eq!(parsed.chapters[0].core_event, "gặp Melina");
    assert_eq!(parsed.chapters[0].r#type, "cutscene");
}

#[test]
fn json_hong_bao_loi() {
    let err = parse_analysis("không có JSON ở đây").expect_err("phải lỗi");
    assert!(err.contains("JSON"));
}

#[test]
fn json_cat_ngang_bao_loi() {
    let err = parse_analysis(r#"{"game_title": "A""#).expect_err("phải lỗi");
    assert!(err.contains("JSON"));
}

#[test]
fn extract_json_object_tra_none_khi_khong_co_khoi() {
    assert_eq!(extract_json_object("chỉ có chữ"), None);
}

#[test]
fn extract_json_object_giu_noi_dung_nguyen_van() {
    let raw = r#"{"a": 1, "b": {"c": 2}}"#;
    let json = extract_json_object(raw).expect("phải có");
    assert_eq!(json, r#"{"a": 1, "b": {"c": 2}}"#);
}
