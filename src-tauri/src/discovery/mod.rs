//! TSK-V015-DISC-CORE — lõi **thuần** cho tab "Khám phá" (docs/V0.15_PLAN.md §3, nấc A).
//!
//! **Phạm vi module này:** chỉ phần *thuần* — kiểu dữ liệu chung, parser JSON của
//! từng nguồn, cache TTL trong bộ nhớ và hàm định dạng số liệu. **Không gọi mạng,
//! không chạy yt-dlp** (việc đó thuộc task `TSK-V015-DISC-CMD`).
//!
//! Nhờ vậy toàn bộ phần dễ gãy (đọc JSON của Bilibili / Douyin / yt-dlp) được test
//! bằng **JSON mẫu thật** đã lưu trong `fixtures/` — xem `docs/VIDEO_DISCOVERY_RESEARCH.md` §2.
//!
//! | Nguồn | Hàm | Endpoint / lệnh lấy dữ liệu |
//! |---|---|---|
//! | Bilibili popular | [`bilibili::parse_popular`] | `GET /x/web-interface/popular` |
//! | Bilibili ranking | [`bilibili::parse_ranking`] | `GET /x/web-interface/ranking/v2` |
//! | Bilibili search | [`bilibili::parse_search`] | `GET /x/web-interface/search/type` |
//! | Douyin hot words | [`douyin::parse_hot_words`] | `GET /web/api/v2/hotsearch/billboard/word/` |
//! | YouTube search | [`youtube::parse_ytsearch`] | `yt-dlp --dump-single-json --flat-playlist "ytsearchN:…"` |
//!
//! Hợp đồng dữ liệu trả về frontend là [`DiscoveryItem`] (serde **camelCase**) — mọi
//! nguồn đều quy về cùng một kiểu để lưới thẻ ở UI không phải xử lý riêng.

pub mod bilibili;
pub mod cache;
pub mod commands;
pub mod douyin;
pub mod fetch;
pub mod format;
pub mod keyword_translate;
pub mod youtube;

use serde::{Deserialize, Serialize};

/// Nền tảng của một video trong tab "Khám phá".
pub mod platform {
    /// Bilibili (哔哩哔哩).
    pub const BILIBILI: &str = "bilibili";
    /// YouTube.
    pub const YOUTUBE: &str = "youtube";
}

/// Một video trong lưới "Khám phá" — đã chuẩn hoá từ mọi nguồn.
///
/// Serialize sang frontend dạng **camelCase** (`thumbnailUrl`, `durationSec`, …)
/// để khớp với `src/lib/types.ts` của Sublix.
///
/// - `duration_sec = None` ⇒ không rõ thời lượng (video live, hoặc nguồn không trả).
/// - `publish_time` là **giây** Unix (không phải milli-giây).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryItem {
    /// ID gốc của nền tảng: `bvid` (Bilibili) hoặc video id (YouTube).
    pub id: String,
    /// [`platform::BILIBILI`] hoặc [`platform::YOUTUBE`].
    pub platform: String,
    /// Tiêu đề đã bỏ thẻ HTML + giải mã thực thể HTML.
    pub title: String,
    /// URL chuẩn để đưa thẳng cho `yt-dlp` khi bấm "Tải về".
    pub url: String,
    /// Ảnh thu nhỏ (luôn `https://…`; rỗng nếu nguồn không có).
    pub thumbnail_url: String,
    /// Thời lượng (giây) — `None` nếu không rõ.
    pub duration_sec: Option<u32>,
    /// Lượt xem — `None` nếu nguồn không trả.
    pub view_count: Option<u64>,
    /// Tên kênh / tác giả.
    pub author: String,
    /// Thời điểm đăng (giây Unix) — `None` nếu nguồn không trả.
    pub publish_time: Option<i64>,
}

/// Một chủ đề nóng (chip "🔥 Xu hướng Douyin").
///
/// `label` giữ **nguyên mã** của Douyin dưới dạng chuỗi (`"0"`, `"1"`, `"3"`, …);
/// UI tự quyết định cách hiển thị (nhãn "Mới" / "Hot" / ẩn).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotWord {
    /// Từ khoá / chủ đề.
    pub word: String,
    /// Điểm nhiệt của Douyin.
    pub hot_value: Option<u64>,
    /// Mã nhãn phân loại của Douyin (giữ nguyên dạng chuỗi).
    pub label: Option<String>,
}
