//! TSK-LAB-C3 — **cache phân tích** theo video (khoá = đường dẫn + kích thước + mtime).
//!
//! Phân tích lại cùng một video (file **không** đổi) thì **dùng lại** phần STT +
//! cảnh đã đo ⇒ bỏ qua bước nhận dạng (đắt nhất) và bỏ qua ffmpeg.
//!
//! - Khoá = hash FNV-1a 64 bit của `đường dẫn | kích thước | mtime`.
//!   Đổi file (sửa/xoá/thay) ⇒ khoá đổi ⇒ cache cũ không bị dùng nhầm.
//! - Lưu JSON trong `<thư mục dữ liệu app>/lab-cache/<khoá>.json`.
//!
//! **Thuần** phần khoá (hash) ⇒ test được không cần đĩa.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::cutscene::SceneSegment;
use super::transcript::TranscriptLine;

/// Tên thư mục con trong thư mục dữ liệu app.
pub const CACHE_DIR_NAME: &str = "lab-cache";

/// Dữ liệu cache cho **một** video nguồn.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedSource {
    /// Thời điểm ghi cache (giây Unix).
    #[serde(default)]
    pub saved_at: i64,
    /// Thoại đã nhận dạng (STT hoặc phụ đề có sẵn).
    #[serde(default)]
    pub transcript: Vec<TranscriptLine>,
    /// Các đoạn cảnh đã chấm điểm cutscene.
    #[serde(default)]
    pub scenes: Vec<SceneSegment>,
}

/// Hash FNV-1a 64 bit (deterministic, không phụ thuộc phiên bản Rust).
fn fnv1a64(data: &[u8]) -> u64 {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash = OFFSET;
    for byte in data {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

/// Khoá cache của 1 video: hash(`đường dẫn | kích thước | mtime`).
///
/// File không tồn tại ⇒ khoá rỗng (không cache được).
pub fn cache_key(path: &Path) -> String {
    let Ok(meta) = path.metadata() else {
        return String::new();
    };
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let raw = format!("{}|{}|{}", path.to_string_lossy(), size, mtime);
    format!("{:016x}", fnv1a64(raw.as_bytes()))
}

/// Thư mục cache (tạo nếu chưa có).
pub fn ensure_cache_dir(data_dir: &Path) -> std::io::Result<PathBuf> {
    let dir = data_dir.join(CACHE_DIR_NAME);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Đường dẫn file cache của 1 khoá.
pub fn cache_file(dir: &Path, key: &str) -> PathBuf {
    dir.join(format!("{key}.json"))
}

/// Đọc cache của 1 video (`None` nếu chưa có / hỏng).
pub fn read_cached(dir: &Path, key: &str) -> Option<CachedSource> {
    if key.is_empty() {
        return None;
    }
    let content = std::fs::read_to_string(cache_file(dir, key)).ok()?;
    serde_json::from_str::<CachedSource>(&content).ok()
}

/// Ghi cache của 1 video (lỗi I/O chỉ được log, không làm hỏng lần chạy).
pub fn write_cached(dir: &Path, key: &str, value: &CachedSource) -> std::io::Result<()> {
    if key.is_empty() {
        return Ok(());
    }
    std::fs::create_dir_all(dir)?;
    let content = serde_json::to_string_pretty(value)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(cache_file(dir, key), content)
}

#[cfg(test)]
#[path = "cache_tests.rs"]
mod cache_tests;
