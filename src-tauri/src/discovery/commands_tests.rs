//! Test cho lệnh Tauri Khám phá (`discovery/commands.rs`).
//!
//! Test **khoá cache** (cache key) — thuần, không gọi mạng.

use super::*;

// ───────────────────────────── Khoá cache ─────────────────────────────

#[test]
fn khoa_popular_theo_page() {
    assert_eq!(popular_cache_key(1), "popular:1");
    assert_ne!(popular_cache_key(1), popular_cache_key(2));
}

#[test]
fn khoa_ranking_theo_rid() {
    assert_eq!(ranking_cache_key(0), "ranking:0");
    assert_ne!(ranking_cache_key(0), ranking_cache_key(3));
}

#[test]
fn khoa_bili_search_theo_tu_khoa_va_page() {
    assert_eq!(bilibili_search_cache_key("原神", 1), "bili_search:1:原神");
    assert_ne!(
        bilibili_search_cache_key("原神", 1),
        bilibili_search_cache_key("原神", 2)
    );
    assert_ne!(
        bilibili_search_cache_key("原神", 1),
        bilibili_search_cache_key("崩坏", 1)
    );
}

#[test]
fn khoa_youtube_search_theo_tu_khoa_va_count() {
    assert_eq!(
        youtube_search_cache_key("elden ring", 5),
        "yt_search:5:elden ring"
    );
    assert_ne!(
        youtube_search_cache_key("elden ring", 5),
        youtube_search_cache_key("elden ring", 10)
    );
}

#[test]
fn khoa_douyin_hot_la_hang_dong() {
    assert_eq!(douyin_hot_cache_key(), "douyin_hot");
    assert_eq!(douyin_hot_cache_key(), douyin_hot_cache_key());
}

#[test]
fn khoa_cua_nguon_khac_nhau_khong_trung() {
    // Popular (TTL_HOT) và search (TTL_SEARCH) dùng chung cache ⇒ khoá phải khác.
    assert_ne!(popular_cache_key(1), bilibili_search_cache_key("1", 1));
    assert_ne!(ranking_cache_key(0), bilibili_search_cache_key("0", 0));
    assert_ne!(douyin_hot_cache_key(), popular_cache_key(1));
}

// ───────────────────────────── Cache dùng chung ─────────────────────────────

#[test]
fn cache_hot_giu_gia_tri_va_tra_lai_dung_key() {
    let cache = hot_cache();
    let key = popular_cache_key(1);
    let _ = cache.remove(&key);

    let items: Vec<DiscoveryItem> = Vec::new();
    cache.insert(key.clone(), items.clone());
    assert_eq!(cache.get(&key), Some(items));
}

#[test]
fn cache_search_va_cache_hot_la_rieng_biet() {
    // 2 cache khác TTL ⇒ 2 thực thể khác nhau (so địa chỉ, ép về `usize` vì
    // 3 cache này khác kiểu generic với nhau).
    assert_ne!(addr(hot_cache()), addr(search_cache()));
}

#[test]
fn cache_hot_words_la_rieng_biet() {
    assert_ne!(addr(hot_words_cache()), addr(hot_cache()));
    assert_ne!(addr(hot_words_cache()), addr(search_cache()));
}

/// Địa chỉ của một cache (ép qua `*const u8` vì các cache khác kiểu generic).
fn addr<T>(cache: &T) -> usize {
    std::ptr::from_ref(cache) as *const u8 as usize
}

#[test]
fn cache_rong_khong_tra_gia_tri() {
    let cache = search_cache();
    let key = bilibili_search_cache_key("__khong_ton_tai__", 1);
    let _ = cache.remove(&key);
    assert_eq!(cache.get(&key), None);
}
