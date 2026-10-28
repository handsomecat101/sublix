//! TSK-V015-DISC-CMD — **gọi mạng** cho tab "Khám phá" (HTTP + `yt-dlp`).
//!
//! Lớp này không biết gì về cache hay Tauri. Nó chỉ:
//! 1. dựng URL đúng (từ khoá được percent-encode),
//! 2. gọi nguồn dữ liệu,
//! 3. dịch lỗi ra **mã có tiền tố** mà UI hiểu được:
//!    [`PREFIX_BLOCKED`], [`PREFIX_NETWORK`], [`PREFIX_YTDLP_MISSING`], [`PREFIX_PARSE`].
//!
//! - **KHÔNG** giả cookie / chữ ký / vượt chống bot — bị chặn thì báo lỗi rõ ràng.
//! - Bilibili search **bắt buộc** `Referer: https://search.bilibili.com/`
//!   (thiếu Referer hoặc dùng từ khoá tiếng Anh ⇒ mã `-412`).
//!
//! Parser thuần (`bilibili.rs` / `douyin.rs` / `youtube.rs`) nằm ở module cha và
//! chỉ việc đọc JSON — xem `docs/V0.15_PLAN.md` §3.

use std::time::Duration;

use serde_json::Value;

use super::youtube::ytsearch_query;

pub mod ytdlp;

/// Timeout mỗi lần gọi HTTP (giây) — không treo UI.
pub const HTTP_TIMEOUT_SECS: u64 = 12;

/// User-Agent trình duyệt thường (nguồn từ chối UA lạ).
pub const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Referer cho endpoint đang hot / xếp hạng.
pub const REFERER_BILIBILI: &str = "https://www.bilibili.com/";
/// Referer **bắt buộc** cho tìm kiếm Bilibili (thiếu ⇒ mã `-412`).
pub const REFERER_BILIBILI_SEARCH: &str = "https://search.bilibili.com/";
/// Referer Douyin.
pub const REFERER_DOUYIN: &str = "https://www.douyin.com/";

/// Bị chặn (HTTP 403/412/429, mã `-412`/`-352`) — UI hiện nút "Thử lại" đếm ngược.
pub const PREFIX_BLOCKED: &str = "[blocked]";
/// Mất mạng / quá thời gian.
pub const PREFIX_NETWORK: &str = "[network]";
/// Máy chưa có `yt-dlp`.
pub const PREFIX_YTDLP_MISSING: &str = "[ytdlp_missing]";
/// Dữ liệu nguồn trả về không đọc được.
pub const PREFIX_PARSE: &str = "[parse]";

/// Nhóm endpoint Bilibili — dùng để ghép đúng thông điệp lỗi cho UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BilibiliScope {
    /// `/popular` — danh sách đang hot.
    Popular,
    /// `/ranking/v2` — bảng xếp hạng.
    Ranking,
    /// `/search/type` — tìm kiếm theo từ khoá.
    Search,
}

// ───────────────────────────── URL thuần (test được) ─────────────────────────────

/// URL danh sách Bilibili đang hot (20 video/trang). `page < 1` ⇒ trang 1.
pub fn bilibili_popular_url(page: u32) -> String {
    format!(
        "https://api.bilibili.com/x/web-interface/popular?ps=20&pn={}",
        page.max(1)
    )
}

/// URL bảng xếp hạng Bilibili (`rid = 0` ⇒ tổng hợp).
pub fn bilibili_ranking_url(rid: u32) -> String {
    format!("https://api.bilibili.com/x/web-interface/ranking/v2?rid={rid}")
}

/// URL tìm kiếm video Bilibili — từ khoá được percent-encode.
pub fn bilibili_search_url(keyword: &str, page: u32) -> String {
    format!(
        "https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword={}&page={}",
        encode_query_component(keyword),
        page.max(1)
    )
}

/// URL bảng hot word Douyin.
pub fn douyin_hot_url() -> String {
    "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/".to_string()
}

/// Percent-encode một thành phần query string (RFC 3986).
///
/// Giữ nguyên ký tự an toàn `A-Z a-z 0-9 - . _ ~`; **mọi** thứ khác (kể cả dấu
/// cách, `&`, `?`, `#` và chữ Trung) thành `%XX` theo byte UTF-8.
pub fn encode_query_component(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for byte in raw.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(*byte as char)
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{byte:02X}"));
            }
        }
    }
    out
}

// ───────────────────────────── Ánh xạ lỗi (thuần) ─────────────────────────────

/// HTTP status ⇒ tiền tố mã lỗi.
pub fn status_prefix(status: u16) -> &'static str {
    match status {
        403 | 412 | 429 => PREFIX_BLOCKED,
        500..=599 => PREFIX_NETWORK,
        _ => PREFIX_PARSE,
    }
}

/// Mã lỗi nghiệp vụ của Bilibili ⇒ tiền tố mã lỗi (`None` = không có lỗi).
///
/// `-412`/`-352` = bị chặn, `-509` = bị giới hạn tần suất — cả hai đều là
/// "nguồn chặn ta" nên UI hiện nút **Thử lại** đếm ngược.
pub fn bilibili_code_prefix(code: i64) -> Option<&'static str> {
    match code {
        0 => None,
        -412 | -352 | -509 => Some(PREFIX_BLOCKED),
        _ => Some(PREFIX_PARSE),
    }
}

/// Thông điệp lỗi khi Bilibili chặn yêu cầu (tiếng Việt, có gợi ý hành động).
pub fn bilibili_blocked_message(code: i64, scope: BilibiliScope) -> String {
    let (what, hint) = match scope {
        BilibiliScope::Popular => (
            "Bilibili tạm chặn danh sách đang hot",
            "Thử lại sau ít phút.",
        ),
        BilibiliScope::Ranking => (
            "Bilibili tạm chặn bảng xếp hạng",
            "Thử lại sau ít phút.",
        ),
        BilibiliScope::Search => (
            "Bilibili tạm chặn tìm kiếm",
            "Thử từ khoá tiếng Trung hoặc thử lại sau ít phút.",
        ),
    };
    format!("{PREFIX_BLOCKED} {what} (mã {code}). {hint}")
}

// ───────────────────────────── Gọi HTTP ─────────────────────────────

/// GET một URL, trả về body dạng text. Mọi lỗi đều đã kèm tiền tố mã.
async fn get_text(url: &str, referer: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("{PREFIX_NETWORK} Không tạo được HTTP client: {e}"))?;

    let response = client
        .get(url)
        .header(reqwest::header::REFERER, referer)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                format!("{PREFIX_NETWORK} Nguồn dữ liệu quá thời gian ({HTTP_TIMEOUT_SECS}s).")
            } else {
                format!("{PREFIX_NETWORK} Không kết nối được nguồn dữ liệu: {e}")
            }
        })?;

    let status = response.status().as_u16();
    if !response.status().is_success() {
        return Err(format!(
            "{} Nguồn dữ liệu trả về HTTP {status}.",
            status_prefix(status)
        ));
    }

    response
        .text()
        .await
        .map_err(|e| format!("{PREFIX_NETWORK} Không đọc được nội dung nguồn dữ liệu: {e}"))
}

/// Kiểm tra phong bì Bilibili (`{ code, message, data }`) trước khi parse.
///
/// `code = 0` ⇒ bình thường. `code` âm ⇒ nguồn từ chối yêu cầu.
fn check_bilibili_envelope(body: &str, scope: BilibiliScope) -> Result<(), String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|e| format!("{PREFIX_PARSE} Bilibili trả về dữ liệu không đọc được: {e}"))?;

    let code = value.get("code").and_then(Value::as_i64).unwrap_or(0);
    let Some(prefix) = bilibili_code_prefix(code) else {
        return Ok(());
    };

    if prefix == PREFIX_BLOCKED {
        return Err(bilibili_blocked_message(code, scope));
    }

    let message = value
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if message.is_empty() {
        Err(format!("{prefix} Bilibili từ chối yêu cầu (mã {code})."))
    } else {
        Err(format!("{prefix} Bilibili từ chối yêu cầu (mã {code}): {message}"))
    }
}

/// Kiểm tra phong bì Douyin (`{ status_code, word_list }`).
fn check_douyin_envelope(body: &str) -> Result<(), String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|e| format!("{PREFIX_PARSE} Douyin trả về dữ liệu không đọc được: {e}"))?;

    let code = value
        .get("status_code")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    if code == 0 {
        Ok(())
    } else {
        Err(format!(
            "{PREFIX_PARSE} Douyin từ chối yêu cầu (mã {code})."
        ))
    }
}

/// Body JSON của danh sách Bilibili đang hot (đã kiểm phong bì).
pub async fn fetch_bilibili_popular(page: u32) -> Result<String, String> {
    let body = get_text(&bilibili_popular_url(page), REFERER_BILIBILI).await?;
    check_bilibili_envelope(&body, BilibiliScope::Popular)?;
    Ok(body)
}

/// Body JSON của bảng xếp hạng Bilibili (đã kiểm phong bì).
pub async fn fetch_bilibili_ranking(rid: u32) -> Result<String, String> {
    let body = get_text(&bilibili_ranking_url(rid), REFERER_BILIBILI).await?;
    check_bilibili_envelope(&body, BilibiliScope::Ranking)?;
    Ok(body)
}

/// Body JSON của kết quả tìm kiếm Bilibili (đã kiểm phong bì).
pub async fn fetch_bilibili_search(keyword: &str, page: u32) -> Result<String, String> {
    let body = get_text(&bilibili_search_url(keyword, page), REFERER_BILIBILI_SEARCH).await?;
    check_bilibili_envelope(&body, BilibiliScope::Search)?;
    Ok(body)
}

/// Body JSON của bảng hot word Douyin (đã kiểm phong bì).
pub async fn fetch_douyin_hot() -> Result<String, String> {
    let body = get_text(&douyin_hot_url(), REFERER_DOUYIN).await?;
    check_douyin_envelope(&body)?;
    Ok(body)
}

/// JSON thô của `yt-dlp` tìm YouTube (đã dựng truy vấn `ytsearch`).
pub fn ytdlp_search_json(
    ytdlp_path: &str,
    keyword: &str,
    count: u32,
) -> Result<String, String> {
    let query = ytsearch_query(keyword, count);
    ytdlp::search_json(ytdlp_path, &query)
}

#[cfg(test)]
#[path = "fetch_tests.rs"]
mod fetch_tests;

#[cfg(test)]
#[path = "network_tests.rs"]
mod network_tests;
