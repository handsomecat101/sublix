//! TSK-FEAT-DL-PLATFORMS-REUP — tính năng phục vụ quy trình reup:
//! - `ReupOptions`: tùy chọn gắn vào `DownloadRequest` (mặc định TẮT).
//! - Xuất metadata `<tên video>.info.txt` (UTF-8 BOM) để viết lại caption.
//! - `--download-archive`: chống tải trùng bền vững giữa các lần.
//! - `--write-thumbnail --convert-thumbnails jpg`: tải thumbnail gốc.
//! - `--download-sections`: cắt đoạn khi tải.
//! - Chặn SỚM nền tảng yt-dlp chưa có extractor (Kuaishou/Migu) với thông
//!   báo tiếng Việt rõ ràng — KHÔNG gợi ý "cập nhật yt-dlp" vô ích.
//!
//! Tách riêng khỏi `mod.rs` (đã rất dài) để giữ module < 300 dòng.

use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Tùy chọn reup. Mọi trường đều có mặc định TẮT để KHÔNG đổi hành vi cũ khi
/// người dùng không bật gì.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ReupOptions {
    /// Xuất `<tên video>.info.txt` cạnh video (tiêu đề, kênh, link gốc, ngày
    /// đăng, mô tả, hashtag/tags).
    #[serde(default)]
    pub write_info: bool,
    /// `--download-archive <app_data_dir>/download_archive.txt`.
    #[serde(default)]
    pub archive: bool,
    /// `--write-thumbnail --convert-thumbnails jpg` (thumbnail gốc .jpg).
    #[serde(default)]
    pub thumbnail: bool,
    /// Cắt đoạn — mốc bắt đầu `hh:mm:ss` (rỗng = từ đầu).
    #[serde(default)]
    pub section_start: Option<String>,
    /// Cắt đoạn — mốc kết thúc `hh:mm:ss` (rỗng = đến hết).
    #[serde(default)]
    pub section_end: Option<String>,
}

impl ReupOptions {
    /// Có bật tùy chọn reup nào không (dùng để log/kiểm tra nhanh).
    pub fn any_enabled(&self) -> bool {
        self.write_info || self.archive || self.thumbnail || self.section_active()
    }

    /// Người dùng có nhập mốc cắt đoạn nào không.
    pub fn section_active(&self) -> bool {
        self.section_start.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
            || self.section_end.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
    }
}

/// Chuẩn hóa mốc thời gian người dùng nhập (`h:mm:ss`, `mm:ss` hoặc `ss`) về
/// đúng `hh:mm:ss`. Trả `None` nếu rỗng hoặc không hợp lệ.
pub fn normalize_timecode(raw: &str) -> Option<String> {
    parse_timecode(raw).map(|(h, m, s)| format!("{h:02}:{m:02}:{s:02}"))
}

/// Tách mốc thời gian thành `(giờ, phút, giây)` theo đúng quy tắc nhập của
/// người dùng — dùng chung cho [`normalize_timecode`] và [`timecode_to_secs`].
fn parse_timecode(raw: &str) -> Option<(u64, u32, u32)> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    let parts: Vec<&str> = t.split(':').collect();
    if parts.is_empty() || parts.len() > 3 {
        return None;
    }
    let mut nums: Vec<u32> = Vec::with_capacity(3);
    for p in &parts {
        if p.is_empty() || !p.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        nums.push(p.parse().ok()?);
    }
    let (h, m, s) = match nums.as_slice() {
        // Chỉ một số → tổng số giây (cho phép >= 60, ví dụ "90" = 1:30).
        [s] => (*s / 3600, (*s % 3600) / 60, *s % 60),
        // mm:ss → chỉ ràng buộc giây < 60 (phút có thể > 59, ví dụ "90:30").
        [m, s] => {
            if *s >= 60 {
                return None;
            }
            (0, *m, *s)
        }
        // hh:mm:ss → phút và giây đều phải < 60.
        [h, m, s] => {
            if *m >= 60 || *s >= 60 {
                return None;
            }
            (*h, *m, *s)
        }
        _ => return None,
    };
    Some((h as u64, m, s))
}

/// Quy đổi mốc thời gian người dùng nhập ra **tổng số giây** (`None` nếu sai).
pub fn timecode_to_secs(raw: &str) -> Option<u64> {
    parse_timecode(raw).map(|(h, m, s)| h * 3600 + m as u64 * 60 + s as u64)
}

/// Dựng giá trị cho `--download-sections` từ tùy chọn cắt đoạn.
///
/// - Cả hai rỗng → `Ok(None)` (tải cả video).
/// - Chỉ có 1 mốc → mốc còn lại để mở (`*start-` / `*-end`).
/// - Mốc nhập sai → `Err` (thông báo tiếng Việt) để UI báo trước khi spawn.
/// - Có cả hai mốc mà `start >= end` → `Err` (đoạn cắt rỗng/ngược là vô nghĩa).
pub fn section_arg(opts: &ReupOptions) -> Result<Option<String>, String> {
    let start_raw = opts.section_start.as_deref().unwrap_or("").trim();
    let end_raw = opts.section_end.as_deref().unwrap_or("").trim();
    if start_raw.is_empty() && end_raw.is_empty() {
        return Ok(None);
    }
    let start = if start_raw.is_empty() {
        String::new()
    } else {
        normalize_timecode(start_raw).ok_or_else(|| {
            format!("Mốc bắt đầu \"{start_raw}\" không hợp lệ — dùng định dạng hh:mm:ss (ví dụ 00:00:05).")
        })?
    };
    let end = if end_raw.is_empty() {
        String::new()
    } else {
        normalize_timecode(end_raw).ok_or_else(|| {
            format!("Mốc kết thúc \"{end_raw}\" không hợp lệ — dùng định dạng hh:mm:ss (ví dụ 00:00:15).")
        })?
    };

    // Chỉ kiểm tra khi có CẢ HAI mốc — chỉ có start hoặc chỉ có end vẫn hợp lệ.
    if !start_raw.is_empty() && !end_raw.is_empty() {
        if let (Some(s), Some(e)) = (timecode_to_secs(start_raw), timecode_to_secs(end_raw)) {
            if s >= e {
                return Err(format!(
                    "Thời điểm bắt đầu phải nhỏ hơn thời điểm kết thúc (đang nhập \"{start_raw}\" → \"{end_raw}\")."
                ));
            }
        }
    }

    Ok(Some(format!("*{start}-{end}")))
}

/// Đường dẫn sổ đã tải: `<app_data_dir>/download_archive.txt`.
/// `save_dir` = `<app_data_dir>/downloads` → cha của nó là `app_data_dir`.
pub fn archive_path(save_dir: &Path) -> PathBuf {
    save_dir
        .parent()
        .unwrap_or(save_dir)
        .join("download_archive.txt")
}

/// Nền tảng yt-dlp (2026.10.21) KHÔNG có extractor → chặn sớm, báo rõ.
/// Sublix vẫn nhận diện host (để hiện đúng tên) nhưng không thể tải được.
const UNSUPPORTED_PLATFORMS: [(&str, &str); 2] =
    [("kuaishou", "Kuaishou (快手)"), ("migu", "Migu (咪咕)")];

/// Thông báo tiếng Việt khi nền tảng không được yt-dlp hỗ trợ.
/// Trả `None` nếu nền tảng bình thường.
pub fn unsupported_platform_message(platform: &str) -> Option<String> {
    UNSUPPORTED_PLATFORMS
        .iter()
        .find(|(id, _)| *id == platform)
        .map(|(_, name)| {
            format!(
                "yt-dlp chưa hỗ trợ nền tảng {name} nên không tải được. Hãy chọn nền tảng khác \
                 (ví dụ YouTube, TikTok, Instagram, Facebook, Twitch…)."
            )
        })
}

/// Đường dẫn file `.info.json` mà `--write-info-json` tạo ra cạnh media.
pub fn info_json_path(media: &Path) -> PathBuf {
    media.with_extension("info.json")
}

/// Đường dẫn file `.info.txt` xuất ra cạnh media.
pub fn info_txt_path(media: &Path) -> PathBuf {
    media.with_extension("info.txt")
}

/// Ghi text UTF-8 kèm BOM để Notepad mở đúng tiếng Việt.
pub fn write_text_with_bom(path: &Path, content: &str) -> std::io::Result<()> {
    let mut f = std::fs::File::create(path)?;
    f.write_all(&[0xEF, 0xBB, 0xBF])?;
    f.write_all(content.as_bytes())
}

/// `YYYYMMDD` (hoặc đã có gạch) → `YYYY-MM-DD`.
fn format_upload_date(raw: Option<&str>) -> Option<String> {
    let d = raw?.trim();
    if d.len() == 8 && d.chars().all(|c| c.is_ascii_digit()) {
        return Some(format!("{}-{}-{}", &d[0..4], &d[4..6], &d[6..8]));
    }
    if !d.is_empty() {
        return Some(d.to_string());
    }
    None
}

/// Giây → `hh:mm:ss`.
fn format_hms(seconds: f64) -> String {
    let total = seconds.max(0.0).round() as u64;
    format!("{:02}:{:02}:{:02}", total / 3600, (total % 3600) / 60, total % 60)
}

/// Dựng nội dung `.info.txt` từ JSON metadata của yt-dlp.
pub fn build_info_txt(json: &serde_json::Value) -> String {
    let s = |k: &str| json[k].as_str().map(str::to_string);
    let title = s("title").unwrap_or_else(|| "Video không tên".to_string());
    let channel = json["uploader"]
        .as_str()
        .or_else(|| json["channel"].as_str())
        .or_else(|| json["uploader_id"].as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let source = json["webpage_url"]
        .as_str()
        .or_else(|| json["original_url"].as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let mut tags: Vec<String> = json["tags"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str()).map(str::to_string).collect())
        .unwrap_or_default();
    tags.truncate(30);
    let hashtags = tags
        .iter()
        .map(|t| format!("#{}", t.replace(' ', "_")))
        .collect::<Vec<_>>()
        .join(" ");

    let description: String = s("description")
        .unwrap_or_default()
        .trim()
        .chars()
        .take(4000)
        .collect();

    let mut out = String::new();
    out.push_str(&format!("Tiêu đề: {title}\n"));
    out.push_str(&format!(
        "Kênh: {}\n",
        if channel.is_empty() { "(không rõ)" } else { channel.as_str() }
    ));
    out.push_str(&format!(
        "Link gốc: {}\n",
        if source.is_empty() { "(không rõ)" } else { source.as_str() }
    ));
    out.push_str(&format!(
        "Ngày đăng: {}\n",
        format_upload_date(json["upload_date"].as_str()).unwrap_or_else(|| "(không rõ)".to_string())
    ));
    out.push_str(&format!(
        "Hashtag/Tags: {}\n",
        if hashtags.is_empty() { "(không có)".to_string() } else { hashtags }
    ));
    if let Some(v) = json["view_count"].as_u64() {
        out.push_str(&format!("Lượt xem: {v}\n"));
    }
    if let Some(d) = json["duration"].as_f64() {
        out.push_str(&format!("Thời lượng: {}\n", format_hms(d)));
    }
    out.push_str("\nMô tả:\n");
    out.push_str(&description);
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

/// Sau khi tải xong: đọc `<media>.info.json` (do `--write-info-json` tạo) →
/// ghi `<media>.info.txt` (BOM) rồi xóa `.info.json`. Trả `Ok(None)` khi
/// không có `.info.json` (ví dụ job bị bỏ qua do archive).
pub fn finalize_info_txt(media: &Path) -> anyhow::Result<Option<PathBuf>> {
    let json_path = info_json_path(media);
    if !json_path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&json_path)
        .with_context(|| format!("Không đọc được {}", json_path.display()))?;
    let json: serde_json::Value = serde_json::from_str(raw.trim())
        .with_context(|| format!("JSON metadata không hợp lệ: {}", json_path.display()))?;
    let txt_path = info_txt_path(media);
    write_text_with_bom(&txt_path, &build_info_txt(&json))
        .with_context(|| format!("Không ghi được {}", txt_path.display()))?;
    // Chỉ xóa .info.json khi đã ghi thành công .info.txt.
    let _ = std::fs::remove_file(&json_path);
    Ok(Some(txt_path))
}

// Test riêng cho phép cắt đoạn (file test mới, không sửa `reup_tests.rs`).
#[cfg(test)]
#[path = "reup_section_tests.rs"]
mod reup_section_tests;
