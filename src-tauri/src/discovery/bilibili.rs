//! Parser JSON của Bilibili → [`DiscoveryItem`] (thuần, không gọi mạng).
//!
//! Ba endpoint đều trả cùng một "phong bì": `{ code, message, data }`, trong đó
//! `code != 0` là **lỗi nghiệp vụ** (ví dụ `-412` = bị chặn theo chính sách bảo mật).
//! `data.list` (popular / ranking) và `data.result` (search) chứa mảng video.
//!
//! Khác biệt giữa các nguồn (parser xử lý hết):
//! - `duration`: **số** giây (popular/ranking) vs **chuỗi** `"MM:SS"` / `"H:MM:SS"`
//!   (search — phút có thể > 60, ví dụ `"1793:37"`).
//! - `pic`: `http://i0.hdslb.com/…` vs `//i1.hdslb.com/…` (thiếu scheme).
//! - `title`: chữ thuần vs có `<em class="keyword">…</em>` + thực thể HTML.
//! - tác giả: `owner.name` vs `author` · lượt xem: `stat.view` vs `play` (`"45.1万"`).
//!
//! Video thiếu `bvid` bị **bỏ qua**; danh sách rỗng là kết quả hợp lệ (`Ok(vec![])`).

use anyhow::{bail, Context, Result};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::Value;

use super::{platform, DiscoveryItem};

/// Giá trị của `DiscoveryItem::platform` cho mọi video Bilibili.
pub const PLATFORM: &str = platform::BILIBILI;

/// Phong bì chung của API web Bilibili.
#[derive(Debug, Deserialize)]
struct Envelope<T> {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    message: String,
    #[serde(default)]
    data: Option<T>,
}

/// `data` của popular / ranking.
#[derive(Debug, Default, Deserialize)]
struct ListData {
    #[serde(default)]
    list: Option<Vec<RawVideo>>,
}

/// `data` của search/type.
#[derive(Debug, Default, Deserialize)]
struct SearchData {
    #[serde(default)]
    result: Option<Vec<RawVideo>>,
}

/// Một video thô — gộp trường của cả popular/ranking và search.
#[derive(Debug, Default, Deserialize)]
struct RawVideo {
    #[serde(default)]
    bvid: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    pic: String,
    #[serde(default)]
    duration: Option<Value>,
    #[serde(default)]
    pubdate: Option<i64>,
    #[serde(default)]
    owner: Option<Owner>,
    #[serde(default)]
    stat: Option<Stat>,
    #[serde(default)]
    author: String,
    #[serde(default)]
    play: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct Owner {
    #[serde(default)]
    name: String,
}

#[derive(Debug, Deserialize)]
struct Stat {
    #[serde(default)]
    view: Option<Value>,
}

/// Đọc JSON của `GET /x/web-interface/popular?ps=20&pn=1` (20 video đang hot).
pub fn parse_popular(json: &str) -> Result<Vec<DiscoveryItem>> {
    let data = fetch_data::<ListData>(json, "Bilibili đang hot")?;
    let list = data.and_then(|d| d.list).unwrap_or_default();
    Ok(convert(list, "popular"))
}

/// Đọc JSON của `GET /x/web-interface/ranking/v2` (top 100 bảng xếp hạng).
pub fn parse_ranking(json: &str) -> Result<Vec<DiscoveryItem>> {
    let data = fetch_data::<ListData>(json, "Bilibili bảng xếp hạng")?;
    let list = data.and_then(|d| d.list).unwrap_or_default();
    Ok(convert(list, "ranking"))
}

/// Đọc JSON của `GET /x/web-interface/search/type?search_type=video&keyword=…`.
pub fn parse_search(json: &str) -> Result<Vec<DiscoveryItem>> {
    let data = fetch_data::<SearchData>(json, "Bilibili tìm kiếm")?;
    let list = data.and_then(|d| d.result).unwrap_or_default();
    Ok(convert(list, "search"))
}

/// Giải phong bì + kiểm `code`; trả `data` (có thể `None` khi Bilibili trả rỗng).
fn fetch_data<T: DeserializeOwned + Default>(json: &str, what: &str) -> Result<Option<T>> {
    let env: Envelope<T> = serde_json::from_str(json)
        .with_context(|| format!("Bilibili trả về dữ liệu không đọc được ({what})"))?;
    if env.code != 0 {
        let message = env.message.trim();
        if message.is_empty() {
            bail!("Bilibili từ chối yêu cầu (mã {})", env.code);
        }
        bail!("Bilibili từ chối yêu cầu (mã {}): {message}", env.code);
    }
    Ok(env.data)
}

/// Đổi danh sách thô → [`DiscoveryItem`], bỏ video hỏng.
fn convert(raw: Vec<RawVideo>, source: &str) -> Vec<DiscoveryItem> {
    let mut out = Vec::with_capacity(raw.len());
    for video in raw {
        match to_item(video) {
            Some(item) => out.push(item),
            None => tracing::debug!(source, "Bilibili: bỏ video thiếu bvid"),
        }
    }
    tracing::debug!(source, count = out.len(), "Bilibili: đã đọc danh sách video");
    out
}

fn to_item(raw: RawVideo) -> Option<DiscoveryItem> {
    let id = raw.bvid.trim().to_string();
    if id.is_empty() {
        return None;
    }

    let author = match raw.owner {
        Some(owner) if !owner.name.trim().is_empty() => owner.name.trim().to_string(),
        _ => raw.author.trim().to_string(),
    };
    let view_count = raw
        .stat
        .as_ref()
        .and_then(|stat| stat.view.as_ref())
        .or(raw.play.as_ref())
        .and_then(parse_count);

    Some(DiscoveryItem {
        url: format!("https://www.bilibili.com/video/{id}"),
        platform: PLATFORM.to_string(),
        title: clean_title(&raw.title),
        thumbnail_url: normalize_thumbnail(&raw.pic),
        duration_sec: raw.duration.as_ref().and_then(duration_secs),
        view_count,
        author,
        publish_time: raw.pubdate,
        id,
    })
}

/// Bỏ thẻ HTML (`<em class="keyword">…</em>`), giải mã thực thể HTML, gộp khoảng trắng.
fn clean_title(raw: &str) -> String {
    let text = unescape_html(&strip_tags(raw));
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_tags(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut in_tag = false;
    for ch in raw.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

/// Giải mã thực thể HTML cơ bản (`&amp;`, `&quot;`, `&#39;`, `&#x27;`, …).
fn unescape_html(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let tail = &rest[pos..];
        let window = &tail[..tail.len().min(12)];
        match window.find(';').and_then(|semi| {
            decode_entity(&tail[1..semi]).map(|decoded| (decoded, semi))
        }) {
            Some((decoded, semi)) => {
                out.push_str(&decoded);
                rest = &tail[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn decode_entity(name: &str) -> Option<String> {
    if let Some(number) = name.strip_prefix('#') {
        let code = if let Some(hex) = number.strip_prefix(['x', 'X']) {
            u32::from_str_radix(hex, 16).ok()?
        } else {
            number.parse::<u32>().ok()?
        };
        return char::from_u32(code).map(|c| c.to_string());
    }
    let ch = match name {
        "amp" => '&',
        "quot" => '"',
        "apos" => '\'',
        "lt" => '<',
        "gt" => '>',
        "nbsp" => ' ',
        _ => return None,
    };
    Some(ch.to_string())
}

/// `//i0.hdslb.com/…` và `http://…` đều đưa về `https://…` (ảnh Bilibili cần Referer ⇒
/// frontend tải qua backend, nhưng URL vẫn phải là https).
fn normalize_thumbnail(pic: &str) -> String {
    let pic = pic.trim();
    if let Some(rest) = pic.strip_prefix("//") {
        return format!("https://{rest}");
    }
    if let Some(rest) = pic.strip_prefix("http://") {
        return format!("https://{rest}");
    }
    pic.to_string()
}

/// `duration` → giây. Số = giây sẵn; chuỗi = `"MM:SS"` / `"H:MM:SS"`.
/// `0` ⇒ `None` (video live / không rõ thời lượng).
fn duration_secs(value: &Value) -> Option<u32> {
    let secs = match value {
        Value::Number(number) => number.as_u64().map(|n| n.min(u64::from(u32::MAX)) as u32)?,
        Value::String(text) => parse_duration_text(text)?,
        _ => return None,
    };
    (secs > 0).then_some(secs)
}

/// `"1793:37"` ⇒ 107617 · `"1:02:03"` ⇒ 3723 · `"0:52"` ⇒ 52.
fn parse_duration_text(text: &str) -> Option<u32> {
    let mut total: u64 = 0;
    let mut parts = 0usize;
    for part in text.trim().split(':') {
        parts += 1;
        if parts > 3 {
            return None;
        }
        let value: u64 = part.trim().parse().ok()?;
        total = total.checked_mul(60)?.checked_add(value)?;
    }
    if parts == 0 {
        return None;
    }
    u32::try_from(total).ok()
}

/// `play` / `stat.view` → số lượt xem (chịu được `45071884`, `"45,1万"`, `"--"`).
fn parse_count(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => {
            let cleaned = text.trim();
            // `"45.1万"` / `"1,2万"` ⇒ ×10 000 (dấu chấm hoặc phẩy đều là thập phân ở đây).
            if let Some(wan) = cleaned.strip_suffix('万') {
                let value: f64 = wan.trim().replace(',', ".").parse().ok()?;
                let total = (value * 10_000.0).round();
                if !total.is_finite() || total < 0.0 {
                    return None;
                }
                return Some(total.min(u64::MAX as f64) as u64);
            }
            // `"45,071,884"` ⇒ dấu phẩy là phân cách nghìn.
            cleaned.replace(',', "").parse().ok()
        }
        _ => None,
    }
}

#[cfg(test)]
#[path = "bilibili_tests.rs"]
mod bilibili_tests;
