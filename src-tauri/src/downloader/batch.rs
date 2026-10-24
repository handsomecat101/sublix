//! TSK-FEAT-DL-BATCH-AUDIO: tải hàng loạt nhiều link + mở rộng playlist.
//!
//! - `split_urls`: tách ô nhập nhiều link (mỗi dòng / cách nhau khoảng trắng),
//!   bỏ dòng rỗng / không phải URL http(s), loại trùng.
//! - `expand_playlist`: `yt-dlp --flat-playlist -J` → danh sách mục
//!   `[{url,title,duration}]` (tối đa `MAX_PLAYLIST_ITEMS`). Mỗi mục sau đó
//!   được tải như link lẻ qua `start_download` (vẫn `--no-playlist`).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::process::{Command, Stdio};
use tauri::AppHandle;
use tracing::{info, warn};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Giới hạn an toàn số mục lấy từ 1 playlist (UI báo rõ khi bị cắt).
pub const MAX_PLAYLIST_ITEMS: usize = 200;

/// Watchdog cho lệnh đọc playlist (playlist dài cần lâu hơn `--dump-json` 1 video).
const EXPAND_TIMEOUT_SECS: u64 = 120;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ParsedUrls {
    pub urls: Vec<String>,
    /// Số token không phải URL http(s) hợp lệ đã bị bỏ.
    pub invalid: usize,
    /// Số link trùng đã bị bỏ.
    pub duplicates: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlaylistEntry {
    pub url: String,
    pub title: String,
    pub duration: Option<f64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PlaylistExpansion {
    pub is_playlist: bool,
    pub title: Option<String>,
    pub entries: Vec<PlaylistEntry>,
    /// Tổng số mục playlist báo về (có thể > `entries.len()` khi bị cắt).
    pub total: usize,
    pub truncated: bool,
}

/// Khóa so trùng: bỏ `/` cuối để `https://a.com/x/` == `https://a.com/x`.
fn dedupe_key(url: &str) -> String {
    url.trim_end_matches('/').to_string()
}

/// Tách nội dung ô nhập thành danh sách link duy nhất, giữ thứ tự xuất hiện.
pub fn split_urls(text: &str) -> ParsedUrls {
    let mut seen = HashSet::new();
    let mut out = ParsedUrls { urls: Vec::new(), invalid: 0, duplicates: 0 };
    for raw in text.split_whitespace() {
        // Link dán từ chat/markdown hay dính dấu nháy, ngoặc nhọn, dấu phẩy.
        let token = raw.trim_matches(|c: char| matches!(c, '"' | '\'' | '<' | '>' | ',' | ';'));
        if token.is_empty() {
            continue;
        }
        if !super::is_valid_http_url(token) {
            out.invalid += 1;
            continue;
        }
        if !seen.insert(dedupe_key(token)) {
            out.duplicates += 1;
            continue;
        }
        out.urls.push(token.to_string());
    }
    out
}

/// URL tải được của 1 mục flat-playlist. yt-dlp trả `url` (thường là link
/// đầy đủ) hoặc chỉ ID với vài extractor — dựng lại link YouTube khi cần.
fn entry_url(entry: &serde_json::Value) -> Option<String> {
    for key in ["webpage_url", "url"] {
        if let Some(u) = entry[key].as_str() {
            if super::is_valid_http_url(u) {
                return Some(u.to_string());
            }
        }
    }
    let id = entry["id"].as_str()?;
    if entry["ie_key"].as_str() == Some("Youtube") {
        return Some(format!("https://www.youtube.com/watch?v={id}"));
    }
    None
}

/// Mục là playlist con (vd tab kênh YouTube) — tải với `--no-playlist` sẽ kéo
/// cả tab nên bỏ qua.
fn is_nested_playlist(entry: &serde_json::Value) -> bool {
    entry["_type"].as_str() == Some("playlist")
        || entry["ie_key"].as_str() == Some("YoutubeTab")
}

/// Chuyển JSON của `yt-dlp --flat-playlist -J` thành danh sách mục.
pub fn parse_flat_playlist(json: &serde_json::Value, max_items: usize) -> PlaylistExpansion {
    let title = json["title"].as_str().map(str::to_string);
    let kind = json["_type"].as_str().unwrap_or("video");
    if kind != "playlist" && kind != "multi_video" {
        // Không phải playlist → 1 mục duy nhất là chính video.
        let entries: Vec<PlaylistEntry> = entry_url(json)
            .map(|url| PlaylistEntry {
                url,
                title: title.clone().unwrap_or_default(),
                duration: json["duration"].as_f64(),
            })
            .into_iter()
            .collect();
        let total = entries.len();
        return PlaylistExpansion { is_playlist: false, title, entries, total, truncated: false };
    }

    let raw = json["entries"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    let mut entries: Vec<PlaylistEntry> = raw
        .iter()
        .filter(|e| !e.is_null() && !is_nested_playlist(e))
        .filter_map(|e| {
            let url = entry_url(e)?;
            let title = e["title"].as_str().map(str::to_string).unwrap_or_else(|| url.clone());
            Some(PlaylistEntry { url, title, duration: e["duration"].as_f64() })
        })
        .collect();
    let reported = json["playlist_count"].as_u64().map(|n| n as usize).unwrap_or(0);
    let total = reported.max(entries.len());
    let truncated = total > max_items;
    entries.truncate(max_items);
    PlaylistExpansion { is_playlist: true, title, entries, total, truncated }
}

/// Dựng lệnh yt-dlp đọc playlist. Chỉ lấy `max_items + 1` mục để playlist
/// khổng lồ không treo app; `playlist_count` vẫn cho biết tổng thật.
fn build_expand_command(
    ytdlp_bin: &std::path::Path,
    url: &str,
    browser_cookie: Option<&str>,
    js_runtime: Option<&str>,
) -> Command {
    let mut cmd = Command::new(ytdlp_bin);
    cmd.arg("--flat-playlist")
        .arg("-J")
        .arg("--yes-playlist")
        .arg("--no-warnings")
        .arg("-I")
        .arg(format!("1:{}", MAX_PLAYLIST_ITEMS + 1));
    if let Some(token) = js_runtime {
        cmd.arg("--js-runtimes").arg(token);
    }
    if super::get_platform(url) == "youtube" {
        cmd.arg("--remote-components").arg("ejs:github");
    }
    if let Some(b) = browser_cookie {
        cmd.arg("--cookies-from-browser").arg(b);
    }
    cmd.arg("--").arg(url);
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.env("PYTHONUTF8", "1");
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(super::CREATE_NO_WINDOW);
    cmd
}

/// Chạy lệnh và chờ tối đa `timeout_secs`; quá hạn thì kill PID mồ côi
/// (cùng cơ chế watchdog với `fetch_video_info`).
fn run_with_watchdog(mut cmd: Command, timeout_secs: u64) -> Result<std::process::Output> {
    let child = cmd.spawn().context("Không thể spawn yt-dlp")?;
    let pid = child.id();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output().context("Thực thi yt-dlp thất bại"));
    });
    match rx.recv_timeout(std::time::Duration::from_secs(timeout_secs)) {
        Ok(res) => res,
        Err(_) => {
            warn!("expand_playlist: {}s timeout → kill yt-dlp pid={}", timeout_secs, pid);
            super::kill_pid(pid);
            Err(anyhow::anyhow!(
                "Không đọc được danh sách playlist trong {timeout_secs} giây (playlist quá lớn hoặc mạng chậm)"
            ))
        }
    }
}

/// Lệnh `downloader_expand_playlist`: lấy danh sách mục của 1 link playlist.
pub fn expand_playlist(
    app: &AppHandle,
    url: &str,
    browser_cookies: Option<&str>,
) -> Result<PlaylistExpansion> {
    if !super::is_valid_http_url(url) {
        return Err(anyhow::anyhow!("Link không hợp lệ: chỉ chấp nhận URL http(s)://"));
    }
    // TSK-FEAT-DL-PLATFORMS-REUP: chặn sớm nền tảng yt-dlp chưa hỗ trợ.
    if let Some(msg) = super::reup::unsupported_platform_message(super::get_platform(url)) {
        return Err(anyhow::anyhow!(msg));
    }
    let cfg = crate::config::AppConfig::load(app);
    let ytdlp_bin = super::find_ytdlp(Some(&cfg.ytdlp_path))?;
    expand_with(&ytdlp_bin, url, browser_cookies)
}

/// Lõi của `expand_playlist` (không cần AppHandle — dùng cho test chạy thật).
pub fn expand_with(
    ytdlp_bin: &std::path::Path,
    url: &str,
    browser_cookies: Option<&str>,
) -> Result<PlaylistExpansion> {
    let js_runtime: Option<String> = match super::find_js_runtime() {
        Ok(Some((runtime, path))) => Some(format!("{}:{}", runtime, path.display())),
        Ok(None) | Err(_) => None,
    };
    let cookie = browser_cookies.filter(|b| !b.is_empty() && *b != "none");

    info!("📃 Expanding playlist via yt-dlp --flat-playlist: {}", url);
    let mut output = run_with_watchdog(
        build_expand_command(ytdlp_bin, url, cookie, js_runtime.as_deref()),
        EXPAND_TIMEOUT_SECS,
    )?;
    // Cookie trình duyệt hay bị khóa (Edge/Chrome đang mở) → thử lại không cookie.
    if !output.status.success()
        && cookie.is_some()
        && super::is_cookie_or_login_error(&String::from_utf8_lossy(&output.stderr))
    {
        warn!("expand_playlist: cookie lỗi → thử lại không dùng cookie");
        output = run_with_watchdog(
            build_expand_command(&ytdlp_bin, url, None, js_runtime.as_deref()),
            EXPAND_TIMEOUT_SECS,
        )?;
    }
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("Không đọc được playlist: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let json = super::extract_json_object(&stdout)
        .ok_or_else(|| anyhow::anyhow!("yt-dlp không trả về dữ liệu playlist"))?;
    let expansion = parse_flat_playlist(&json, MAX_PLAYLIST_ITEMS);
    info!(
        "📃 Playlist: is_playlist={} entries={} total={} truncated={}",
        expansion.is_playlist,
        expansion.entries.len(),
        expansion.total,
        expansion.truncated
    );
    Ok(expansion)
}

#[cfg(test)]
#[path = "batch_tests.rs"]
mod tests;
