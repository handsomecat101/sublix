//! Test dựng prompt (`lab/llm_prompt.rs`).

use super::*;

#[test]
fn thay_the_placeholder_trong_template() {
    let out = fill_prompt("a=${x} b=${y} a=${x}", &[("x", "1"), ("y", "2")]);
    assert_eq!(out, "a=1 b=2 a=1");
}

#[test]
fn template_that_giu_nguyen_khi_khong_co_placeholder() {
    assert_eq!(fill_prompt("không có gì", &[("x", "1")]), "không có gì");
}

#[test]
fn user_prompt_co_du_tat_ca_placeholder() {
    let prompt = build_user_prompt("Elden Ring", "Soulslike", "DLC Siofra", "00:00:01 xin chào");
    assert!(prompt.contains("Elden Ring"));
    assert!(prompt.contains("Soulslike"));
    assert!(prompt.contains("DLC Siofra"));
    assert!(prompt.contains("00:00:01 xin chào"));
    assert!(!prompt.contains("${game_name}"), "không còn placeholder nào chưa thay");
    assert!(!prompt.contains("${subtitle_content}"));
}

#[test]
fn template_that_co_san_prompt_r2() {
    assert!(ANALYZE_PROMPT.contains("${game_name}"));
    assert!(ANALYZE_PROMPT.contains("${subtitle_content}"));
    assert!(ANALYZE_PROMPT.contains("characters"));
    assert!(ANALYZE_PROMPT.contains("chapters"));
}
