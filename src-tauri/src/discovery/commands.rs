//! TSK-V015-DISC-CMD — lệnh Tauri cho tab "Khám phá" (đăng ký trong `lib.rs`).
//!
//! 5 lệnh, tất cả **async** và trả `Result<_, String>` với thông điệp tiếng Việt
//! có **mã ở đầu** để UI phân biệt (xem [`fetch`]):
//!
//! | Lệnh | Nguồn | TTL cache |
//! |---|---|---|
//! | [`discovery_bilibili_popular`] | Bilibili đang hot (20/trang) | [`TTL_HOT`] |
//! | [`discovery_bilibili_ranking`] | Bilibili bảng xếp hạng | [`TTL_HOT`] |
//! | [`discovery_bilibili_search`] | Bilibili tìm theo từ khoá | [`TTL_SEARCH`] |
//! | [`discovery_douyin_hot`] | Douyin hot words (chip xu hướng) | [`TTL_HOT_WORDS`] |
//! | [`discovery_youtube_search`] | YouTube qua `yt-dlp` | [`TTL_SEARCH`] |
//!
//! `force = true` ⇒ **bỏ qua cache** (nút "Tải lại" của UI) và ghi lại giá trị mới.

use std::sync::OnceLock;

use super::cache::{TtlCache, TTL_HOT, TTL_HOT_WORDS, TTL_SEARCH};
use super::fetch;
use super::keyword_translate;
use super::{bilibili, douyin, youtube, DiscoveryItem, HotWord};

/// Cache cho danh sách "nóng" (đang hot + xếp hạng) — [`TTL_HOT`].
static HOT_CACHE: OnceLock<TtlCache<String, Vec<DiscoveryItem>>> = OnceLock::new();
/// Cache cho chip hot word Douyin — [`TTL_HOT_WORDS`].
static HOT_WORDS_CACHE: OnceLock<TtlCache<String, Vec<HotWord>>> = OnceLock::new();
/// Cache cho kết quả tìm kiếm — [`TTL_SEARCH`].
static SEARCH_CACHE: OnceLock<TtlCache<String, Vec<DiscoveryItem>>> = OnceLock::new();

fn hot_cache() -> &'static TtlCache<String, Vec<DiscoveryItem>> {
    HOT_CACHE.get_or_init(|| TtlCache::new(TTL_HOT))
}

fn hot_words_cache() -> &'static TtlCache<String, Vec<HotWord>> {
    HOT_WORDS_CACHE.get_or_init(|| TtlCache::new(TTL_HOT_WORDS))
}

fn search_cache() -> &'static TtlCache<String, Vec<DiscoveryItem>> {
    SEARCH_CACHE.get_or_init(|| TtlCache::new(TTL_SEARCH))
}

// ───────────────────────────── Khoá cache (thuần) ─────────────────────────────

/// Khoá cache cho danh sách Bilibili đang hot.
pub fn popular_cache_key(page: u32) -> String {
    format!("popular:{page}")
}

/// Khoá cache cho bảng xếp hạng Bilibili.
pub fn ranking_cache_key(rid: u32) -> String {
    format!("ranking:{rid}")
}

/// Khoá cache cho tìm kiếm Bilibili.
pub fn bilibili_search_cache_key(keyword: &str, page: u32) -> String {
    format!("bili_search:{page}:{keyword}")
}

/// Khoá cache cho bảng hot word Douyin (chỉ có 1 nguồn).
pub fn douyin_hot_cache_key() -> String {
    "douyin_hot".to_string()
}

/// Khoá cache cho tìm kiếm YouTube.
pub fn youtube_search_cache_key(keyword: &str, count: u32) -> String {
    format!("yt_search:{count}:{keyword}")
}

// ───────────────────────────── Lệnh Tauri ─────────────────────────────

/// Bilibili đang hot (20 video/trang).
#[tauri::command]
pub async fn discovery_bilibili_popular(
    page: u32,
    force: bool,
) -> Result<Vec<DiscoveryItem>, String> {
    let key = popular_cache_key(page);
    let cache = hot_cache();
    if !force {
        if let Some(hit) = cache.get(&key) {
            return Ok(hit);
        }
    }

    let body = fetch::fetch_bilibili_popular(page).await?;
    let items = bilibili::parse_popular(&body).map_err(|e| parse_error("Bilibili đang hot", e))?;
    tracing::info!(count = items.len(), page, "discovery: Bilibili đang hot");

    cache.insert(key, items.clone());
    Ok(items)
}

/// Bilibili bảng xếp hạng (`rid = 0` ⇒ tổng hợp).
#[tauri::command]
pub async fn discovery_bilibili_ranking(
    rid: u32,
    force: bool,
) -> Result<Vec<DiscoveryItem>, String> {
    let key = ranking_cache_key(rid);
    let cache = hot_cache();
    if !force {
        if let Some(hit) = cache.get(&key) {
            return Ok(hit);
        }
    }

    let body = fetch::fetch_bilibili_ranking(rid).await?;
    let items =
        bilibili::parse_ranking(&body).map_err(|e| parse_error("Bilibili bảng xếp hạng", e))?;
    tracing::info!(count = items.len(), rid, "discovery: Bilibili bảng xếp hạng");

    cache.insert(key, items.clone());
    Ok(items)
}

/// Tìm video Bilibili theo từ khoá (nên dùng từ khoá **tiếng Trung**).
#[tauri::command]
pub async fn discovery_bilibili_search(
    keyword: String,
    page: u32,
    force: bool,
) -> Result<Vec<DiscoveryItem>, String> {
    let key = bilibili_search_cache_key(&keyword, page);
    let cache = search_cache();
    if !force {
        if let Some(hit) = cache.get(&key) {
            return Ok(hit);
        }
    }

    let body = fetch::fetch_bilibili_search(&keyword, page).await?;
    let items = bilibili::parse_search(&body).map_err(|e| parse_error("Bilibili tìm kiếm", e))?;
    tracing::info!(count = items.len(), page, "discovery: Bilibili tìm kiếm");

    cache.insert(key, items.clone());
    Ok(items)
}

/// 50 chủ đề đang nóng nhất Douyin (chip "🔥 Xu hướng").
#[tauri::command]
pub async fn discovery_douyin_hot(force: bool) -> Result<Vec<HotWord>, String> {
    let key = douyin_hot_cache_key();
    let cache = hot_words_cache();
    if !force {
        if let Some(hit) = cache.get(&key) {
            return Ok(hit);
        }
    }

    let body = fetch::fetch_douyin_hot().await?;
    let words = douyin::parse_hot_words(&body).map_err(|e| parse_error("Douyin hot words", e))?;
    tracing::info!(count = words.len(), "discovery: Douyin hot words");

    cache.insert(key, words.clone());
    Ok(words)
}

/// Tìm video YouTube qua `yt-dlp` (`ytsearch`).
#[tauri::command]
pub async fn discovery_youtube_search(
    keyword: String,
    count: u32,
    force: bool,
) -> Result<Vec<DiscoveryItem>, String> {
    let key = youtube_search_cache_key(&keyword, count);
    let cache = search_cache();
    if !force {
        if let Some(hit) = cache.get(&key) {
            return Ok(hit);
        }
    }

    // Đường dẫn `yt-dlp` do người dùng cấu hình (rỗng ⇒ tự tìm trong PATH).
    let config = crate::config::AppConfig::load_or_default();
    let ytdlp_path = config.ytdlp_path.clone();
    let search_keyword = keyword.clone();

    // `yt-dlp` là tiến trình ngoài ⇒ chạy off-thread để không chặn vòng lặp sự kiện.
    let body = tokio::task::spawn_blocking(move || {
        fetch::ytdlp_search_json(&ytdlp_path, &search_keyword, count)
    })
    .await
    .map_err(|e| format!("{} Không chạy được tác vụ tìm YouTube: {e}", fetch::PREFIX_PARSE))??;

    let items = youtube::parse_ytsearch(&body).map_err(|e| parse_error("YouTube", e))?;
    tracing::info!(count = items.len(), "discovery: YouTube tìm kiếm");

    cache.insert(key, items.clone());
    Ok(items)
}

/// Bọc lỗi parser của lõi thuần thành lỗi có mã `[parse] …`.
fn parse_error(what: &str, error: anyhow::Error) -> String {
    format!(
        "{} Không đọc được dữ liệu {what}: {error}",
        fetch::PREFIX_PARSE
    )
}

/// Dịch từ khoá tìm kiếm sang **tiếng Trung giản thể** (nấc B).
///
/// Dùng provider dịch mà người dùng đã cấu hình (MiniMax / Ollama / …) — không
/// thêm provider hay API key mới. Từ khoá đã là tiếng Trung ⇒ trả về nguyên
/// văn (không gọi provider). Lỗi ⇒ `Err` ⇒ frontend tìm nguyên văn.
#[tauri::command]
pub async fn discovery_translate_keyword(
    app: tauri::AppHandle,
    keyword: String,
) -> Result<String, String> {
    let trimmed = keyword.trim().to_string();
    if trimmed.is_empty() {
        return Err("Từ khoá rỗng.".to_string());
    }
    // Đã là tiếng Trung ⇒ không cần dịch, không gọi provider.
    if !keyword_translate::needs_translation(&trimmed) {
        return Ok(trimmed);
    }

    tokio::task::spawn_blocking(move || {
        let cfg = crate::config::AppConfig::load(&app);
        keyword_translate::translate_keyword(&cfg, &trimmed)
    })
    .await
    .map_err(|e| format!("Không chạy được tác vụ dịch từ khoá: {e}"))?
}

#[cfg(test)]
#[path = "commands_tests.rs"]
mod commands_tests;
