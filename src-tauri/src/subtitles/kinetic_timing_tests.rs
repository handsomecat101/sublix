//! Test khớp `scripts/kinetic-tests/vectors.json` — bản Rust phải ra ĐÚNG từng con số.
//!
//! File vectors là nguồn sự thật của thuật toán (trường `algorithm`), dùng chung
//! với bản TS phía frontend ⇒ khung xem thử và video xuất ra khớp nhau.

use serde::Deserialize;

use super::{split_tokens, time_words};

#[derive(Deserialize)]
struct Fixture {
    vectors: Vec<Vector>,
}

#[derive(Deserialize)]
struct Vector {
    text: String,
    start: f64,
    end: f64,
    expected: Vec<ExpectedWord>,
}

#[derive(Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ExpectedWord {
    word: String,
    offset_cs: u32,
    dur_cs: u32,
}

const VECTORS_JSON: &str = include_str!("../../../scripts/kinetic-tests/vectors.json");

fn fixture() -> Fixture {
    serde_json::from_str(VECTORS_JSON).expect("vectors.json phải parse được")
}

#[test]
fn khop_toan_bo_vectors_tham_chieu() {
    let fx = fixture();
    assert!(!fx.vectors.is_empty(), "vectors.json rỗng");

    for (index, vector) in fx.vectors.iter().enumerate() {
        let actual: Vec<ExpectedWord> = time_words(&vector.text, vector.start, vector.end)
            .into_iter()
            .map(|word| ExpectedWord {
                word: word.word,
                offset_cs: word.offset_cs,
                dur_cs: word.dur_cs,
            })
            .collect();
        assert_eq!(
            actual, vector.expected,
            "vector #{index} lệch (text = {:?}, {}-{})",
            vector.text, vector.start, vector.end
        );
    }
}

#[test]
fn tokens_rong_khi_chi_co_khoang_trang() {
    assert!(split_tokens("").is_empty());
    assert!(split_tokens("   ").is_empty());
    assert!(split_tokens("\t\n ").is_empty());
    assert!(time_words("  ", 0.0, 1.0).is_empty());
}

#[test]
fn tokens_tach_theo_khoang_trang() {
    assert_eq!(split_tokens("  Xin   chào  các bạn "), ["Xin", "chào", "các", "bạn"]);
    assert_eq!(split_tokens("Một"), ["Một"]);
}

#[test]
fn tokens_cjk_tung_ky_tu_va_dau_cau_dinh_truoc() {
    assert_eq!(split_tokens("你好，世界！"), ["你", "好，", "世", "界！"]);
    assert_eq!(split_tokens("我们今天去哪里").len(), 7);
    // Ngoặc/nháy cũng dính token trước.
    assert_eq!(split_tokens("你好（世界）"), ["你", "好（", "世", "界）"]);
}

#[test]
fn tong_thoi_luong_luon_bang_total_cs() {
    let cases = [
        ("Xin chào các bạn", 0.0, 2.0),
        ("Hello world, this is fine!", 2.005, 4.0),
        ("Đúng rồi... Đi thôi!", 120.25, 121.75),
        ("你好，世界！", 10.0, 11.5),
        ("a b c d e f g h", 0.0, 0.05),
    ];
    for (text, start, end) in cases {
        let words = time_words(text, start, end);
        let sum: u32 = words.iter().map(|w| w.dur_cs).sum();
        let total = ((end - start) * 100.0).round() as u32;
        assert_eq!(sum, total, "tổng dur_cs phải = totalCs ({text:?})");
        // offset phải cộng dồn liên tục.
        let mut cursor = 0;
        for word in &words {
            assert_eq!(word.offset_cs, cursor, "offset lệch ({text:?})");
            cursor += word.dur_cs;
        }
    }
}

#[test]
fn thoi_gian_am_hoac_khong_hop_le_ra_khong() {
    assert!(time_words("Xin chào", 5.0, 5.0).iter().all(|w| w.dur_cs == 0));
    assert!(time_words("Xin chào", 5.0, 4.0).iter().all(|w| w.dur_cs == 0));
    assert!(time_words("Xin chào", f64::NAN, 4.0).iter().all(|w| w.dur_cs == 0));
}
