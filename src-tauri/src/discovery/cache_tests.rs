//! Test cache TTL **bằng thời gian giả** (`Instant` truyền vào) — không `sleep`.
//!
//! Chạy: `cargo test --lib discovery`.

use super::*;
use std::time::Duration;

/// Thời điểm gốc của mỗi test.
fn base() -> Instant {
    Instant::now()
}

fn at(base: Instant, secs: u64) -> Instant {
    base + Duration::from_secs(secs)
}

#[test]
fn con_han_thi_tra_gia_tri() {
    let start = base();
    let cache: TtlCache<String, String> = TtlCache::new(Duration::from_secs(60));
    cache.insert_at("hot".to_string(), "dữ liệu".to_string(), start);

    assert_eq!(cache.get_at(&"hot".to_string(), start), Some("dữ liệu".to_string()));
    assert_eq!(
        cache.get_at(&"hot".to_string(), at(start, 59)),
        Some("dữ liệu".to_string()),
        "59 s < TTL 60 s ⇒ còn hạn"
    );
}

#[test]
fn het_han_thi_tra_none_va_xoa_khoi_cache() {
    let start = base();
    let cache: TtlCache<String, u32> = TtlCache::new(Duration::from_secs(60));
    cache.insert_at("k".to_string(), 7, start);
    assert_eq!(cache.len(), 1);

    assert_eq!(cache.get_at(&"k".to_string(), at(start, 60)), None, "đúng TTL ⇒ hết hạn");
    assert_eq!(cache.len(), 0, "mục hết hạn bị xoá luôn khi đọc");
}

#[test]
fn ttl_0_thi_het_han_ngay() {
    let start = base();
    let cache: TtlCache<String, u32> = TtlCache::new(Duration::ZERO);
    cache.insert_at("k".to_string(), 1, start);
    assert_eq!(cache.get_at(&"k".to_string(), start), None);
}

#[test]
fn khoa_khac_tra_none() {
    let start = base();
    let cache: TtlCache<String, u32> = TtlCache::new(TTL_SEARCH);
    cache.insert_at("elden ring".to_string(), 1, start);
    assert_eq!(cache.get_at(&"zelda".to_string(), start), None);
}

#[test]
fn ghi_de_lam_moi_moc_het_han() {
    let start = base();
    let cache: TtlCache<String, &str> = TtlCache::new(Duration::from_secs(10));
    cache.insert_at("k".to_string(), "cũ", start);
    cache.insert_at("k".to_string(), "mới", at(start, 8));

    assert_eq!(cache.get_at(&"k".to_string(), at(start, 12)), Some("mới"));
    assert_eq!(cache.get_at(&"k".to_string(), at(start, 18)), None, "8 + 10 = 18 ⇒ hết hạn");
    assert_eq!(cache.len(), 0);
}

#[test]
fn dong_ho_lui_van_coi_la_con_han() {
    let start = base();
    let cache: TtlCache<String, u32> = TtlCache::new(Duration::from_secs(30));
    cache.insert_at("k".to_string(), 1, start);

    assert_eq!(
        cache.get_at(&"k".to_string(), start - Duration::from_secs(5)),
        Some(1),
        "now trước stored_at (đồng hồ lùi) không được coi là hết hạn"
    );
}

#[test]
fn xoa_tung_muc_va_xoa_tat_ca() {
    let start = base();
    let cache: TtlCache<String, u32> = TtlCache::new(TTL_HOT);
    cache.insert_at("a".to_string(), 1, start);
    cache.insert_at("b".to_string(), 2, start);
    assert_eq!(cache.len(), 2);
    assert!(!cache.is_empty());
    assert_eq!(cache.ttl(), TTL_HOT);

    assert!(cache.remove(&"a".to_string()));
    assert!(!cache.remove(&"a".to_string()), "xoá lần 2 ⇒ false");
    assert_eq!(cache.len(), 1);

    cache.clear();
    assert!(cache.is_empty());
}

#[test]
fn dung_duoc_voi_nhieu_kieu_khoa_va_gia_tri() {
    let start = base();
    let cache: TtlCache<(String, u32), Vec<String>> = TtlCache::new(TTL_SEARCH);
    cache.insert_at(("youtube".to_string(), 3), vec!["a".to_string()], start);
    assert_eq!(
        cache.get_at(&("youtube".to_string(), 3), at(start, 1)),
        Some(vec!["a".to_string()])
    );
}
