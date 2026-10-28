//! Test **gọi mạng thật** cho lớp Khám phá — đánh dấu `#[ignore]`.
//!
//! Vì sao `#[ignore]`: test thường **không** được chạm vào mạng (CI offline ⇒
//! fail giả). Điều phối chạy tay bằng:
//!
//! ```sh
//! cargo test --lib discovery -- --ignored
//! ```
//!
//! Kiểm tra được: HTTP 200, phong bì `code = 0` / `status_code = 0`, danh sách
//! không rỗng.

use super::*;

/// Gọi thật Bilibili đang hot + Douyin hot words.
#[test]
#[ignore = "gọi mạng thật — chạy tay bằng `cargo test --lib discovery -- --ignored`"]
fn network_bilibili_popular_and_douyin_hot() {
    let (popular, hot_words) = tauri::async_runtime::block_on(async {
        let popular = fetch_bilibili_popular(1).await;
        let hot_words = fetch_douyin_hot().await;
        (popular, hot_words)
    });

    let popular = popular.expect("Bilibili popular phải trả về JSON đọc được");
    let hot_words = hot_words.expect("Douyin hot words phải trả về JSON đọc được");

    let popular_value: Value = serde_json::from_str(&popular).expect("JSON Bilibili hỏng");
    assert_eq!(
        popular_value.get("code").and_then(Value::as_i64),
        Some(0),
        "Bilibili phải trả code = 0, có: {popular_value}"
    );

    let hot_value: Value = serde_json::from_str(&hot_words).expect("JSON Douyin hỏng");
    assert_eq!(
        hot_value.get("status_code").and_then(Value::as_i64),
        Some(0),
        "Douyin phải trả status_code = 0, có: {hot_value}"
    );

    let list = popular_value
        .get("data")
        .and_then(|d| d.get("list"))
        .and_then(Value::as_array);
    assert!(
        list.map(|l| !l.is_empty()).unwrap_or(false),
        "Bilibili popular phải trả danh sách không rỗng"
    );

    let words = hot_value.get("word_list").and_then(Value::as_array);
    assert!(
        words.map(|w| !w.is_empty()).unwrap_or(false),
        "Douyin hot words phải trả danh sách không rỗng"
    );
}
