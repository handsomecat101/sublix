//! Parser đầu ra `yt-dlp` cho tìm kiếm YouTube → [`DiscoveryItem`] (thuần, không chạy lệnh).
//!
//! Task sau (`TSK-V015-DISC-CMD`) sẽ chạy đúng lệnh này rồi đưa stdout vào parser:
//!
//! ```text
//! yt-dlp --dump-single-json --flat-playlist --no-warnings "ytsearch3:elden ring"
//! ```
//!
//! Dạng JSON thật (đã kiểm 2026-10-28, xem `fixtures/youtube_search.json`):
//! `{ entries: [ { id, title, duration, view_count, channel, uploader, thumbnails, … } ] }`
//! — `--flat-playlist` **không** trả `thumbnails` đầy đủ cho mọi video, nên luôn có
//! đường lui `https://i.ytimg.com/vi/{id}/hqdefault.jpg`.
//!
//! [`ytsearch_query`] sinh chuỗi truy vấn an toàn: bỏ xuống dòng, gộp khoảng trắng,
//! cắt 100 ký tự (tính theo `char` để không cắt giữa ký tự tiếng Trung), số kết quả
//! kẹp trong `1..=50`.

use anyhow::{Context, Result};
use serde::Deserialize;

use super::{platform, DiscoveryItem};

/// Giá trị của `DiscoveryItem::platform` cho mọi video YouTube.
pub const PLATFORM: &str = platform::YOUTUBE;

/// Số ký tự tối đa của từ khoá (tính theo `char`, không theo byte).
const MAX_KEYWORD_CHARS: usize = 100;
/// Số kết quả nhỏ nhất / lớn nhất mà `ytsearchN:` chấp nhận.
const MIN_RESULTS: u32 = 1;
const MAX_RESULTS: u32 = 50;
/// Ảnh thu nhỏ rộng nhất được chọn (px) — đủ nét cho thẻ ~320 px, không tải ảnh 4K.
const MAX_THUMB_WIDTH: u32 = 720;

#[derive(Debug, Deserialize)]
struct Root {
    #[serde(default)]
    entries: Option<Vec<Entry>>,
}

#[derive(Debug, Deserialize)]
struct Entry {
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    view_count: Option<u64>,
    #[serde(default)]
    channel: Option<String>,
    #[serde(default)]
    uploader: Option<String>,
    #[serde(default)]
    thumbnails: Option<Vec<Thumbnail>>,
    #[serde(default)]
    timestamp: Option<i64>,
    #[serde(default)]
    release_timestamp: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct Thumbnail {
    #[serde(default)]
    url: String,
    #[serde(default)]
    width: Option<u32>,
}

/// Đọc JSON `yt-dlp --dump-single-json --flat-playlist "ytsearchN:…"`.
///
/// Video thiếu `id` bị bỏ qua; `entries: null` (không có kết quả) ⇒ `Ok(vec![])`.
pub fn parse_ytsearch(json: &str) -> Result<Vec<DiscoveryItem>> {
    let root: Root =
        serde_json::from_str(json).with_context(|| "yt-dlp trả về dữ liệu không đọc được (ytsearch)")?;

    let mut items = Vec::new();
    for entry in root.entries.unwrap_or_default() {
        let id = entry.id.trim();
        if id.is_empty() {
            tracing::debug!("YouTube: bỏ mục thiếu id");
            continue;
        }
        let thumbnails = entry.thumbnails.unwrap_or_default();
        let author = entry
            .channel
            .or(entry.uploader)
            .map(|name| name.trim().to_string())
            .unwrap_or_default();
        items.push(DiscoveryItem {
            id: id.to_string(),
            platform: PLATFORM.to_string(),
            title: entry.title.trim().to_string(),
            url: format!("https://www.youtube.com/watch?v={id}"),
            thumbnail_url: pick_thumbnail(id, &thumbnails),
            duration_sec: entry.duration.and_then(duration_secs),
            view_count: entry.view_count,
            author,
            publish_time: entry.timestamp.or(entry.release_timestamp),
        });
    }
    tracing::debug!(count = items.len(), "YouTube: đã đọc kết quả ytsearch");
    Ok(items)
}

/// Ảnh rộng nhất **≤ 720 px**; nếu chỉ có ảnh lớn hơn thì lấy ảnh nhỏ nhất trong số đó;
/// không có ảnh ⇒ `hqdefault.jpg` dựng từ id.
fn pick_thumbnail(id: &str, thumbnails: &[Thumbnail]) -> String {
    let usable = thumbnails
        .iter()
        .filter(|thumb| !thumb.url.trim().is_empty())
        .collect::<Vec<_>>();

    let fitting = usable
        .iter()
        .copied()
        .filter(|thumb| thumb.width.unwrap_or(0) <= MAX_THUMB_WIDTH)
        .max_by_key(|thumb| thumb.width.unwrap_or(0));
    if let Some(thumb) = fitting {
        return thumb.url.trim().to_string();
    }

    let smallest = usable
        .iter()
        .copied()
        .min_by_key(|thumb| thumb.width.unwrap_or(u32::MAX));
    match smallest {
        Some(thumb) => thumb.url.trim().to_string(),
        None => fallback_thumbnail(id),
    }
}

/// Ảnh thu nhỏ mặc định của YouTube khi nguồn không trả `thumbnails`.
pub fn fallback_thumbnail(id: &str) -> String {
    let id = id.trim();
    if id.is_empty() {
        return String::new();
    }
    format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg")
}

/// Thời lượng (giây, làm tròn) — `0` hoặc âm ⇒ `None` (live / không rõ).
fn duration_secs(duration: f64) -> Option<u32> {
    if !duration.is_finite() || duration <= 0.0 {
        return None;
    }
    let rounded = duration.round().min(f64::from(u32::MAX));
    Some(rounded as u32)
}

/// Sinh tham số tìm kiếm cho `yt-dlp`: `ytsearch{count}:{keyword}`.
///
/// Từ khoá được làm sạch (bỏ `\n` / `\r` / `\t`, gộp khoảng trắng, cắt 100 ký tự) và
/// `count` kẹp trong `1..=50` — nhờ vậy không thể chèn thêm tham số dòng lệnh.
pub fn ytsearch_query(keyword: &str, count: u32) -> String {
    let count = count.clamp(MIN_RESULTS, MAX_RESULTS);
    let cleaned = sanitize_keyword(keyword);
    format!("ytsearch{count}:{cleaned}")
}

/// Làm sạch từ khoá người dùng gõ: 1 dòng, không khoảng trắng thừa, ≤ 100 ký tự.
pub fn sanitize_keyword(keyword: &str) -> String {
    let flattened = keyword
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect::<String>();
    let collapsed = flattened.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed
        .chars()
        .take(MAX_KEYWORD_CHARS)
        .collect::<String>()
        .trim_end()
        .to_string()
}

#[cfg(test)]
#[path = "youtube_tests.rs"]
mod youtube_tests;
