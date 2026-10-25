//! TSK-FEAT-VOICE-SAMPLE-CACHE — lớp lưu trữ file mẫu (tách riêng để mỗi
//! module < 300 dòng).
//!
//! - Ghi **atomic** (`.part` → rename) ⇒ không bao giờ đọc file dở.
//! - File hỏng (< 2KB / header WAV sai / ffprobe lỗi) bị **xoá** để tạo lại.

use super::MIN_SAMPLE_BYTES;
use anyhow::{Context, Result};
use base64::Engine;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::warn;

/// File quá nhỏ (hoặc không đọc được) → coi như hỏng.
pub fn too_small(path: &Path) -> bool {
    fs::metadata(path)
        .map(|m| m.len() <= MIN_SAMPLE_BYTES)
        .unwrap_or(true)
}

/// Header WAV hợp lệ (RIFF....WAVE) — bắt file dở mà không cần gọi ffprobe.
pub fn wav_header_ok(bytes: &[u8]) -> bool {
    bytes.len() > MIN_SAMPLE_BYTES as usize
        && bytes.len() >= 12
        && &bytes[0..4] == b"RIFF"
        && &bytes[8..12] == b"WAVE"
}

/// File mẫu hỏng: quá nhỏ, sai header WAV, hoặc ffprobe đọc không được.
pub fn sample_is_broken(path: &Path) -> bool {
    if too_small(path) {
        return true;
    }
    if path
        .extension()
        .map(|e| e.eq_ignore_ascii_case("wav"))
        .unwrap_or(false)
    {
        match fs::read(path) {
            Ok(bytes) => {
                if !wav_header_ok(&bytes) {
                    return true;
                }
            }
            Err(_) => return true,
        }
    }
    // ffprobe đọc được thật không (dùng lại helper cũ của mod.rs).
    !super::super::is_valid_audio(path)
}

/// Xoá file mẫu hỏng để lần sau tạo lại. Trả về true nếu đã xoá.
pub fn purge_if_broken(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    if !sample_is_broken(path) {
        return false;
    }
    let _ = fs::remove_file(path);
    warn!("Xoá mẫu nghe thử hỏng: {}", path.display());
    true
}

/// Đọc file mẫu → data URI (None nếu thiếu / quá nhỏ / WAV hỏng).
pub fn read_data_uri(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    if bytes.len() as u64 <= MIN_SAMPLE_BYTES {
        return None;
    }
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    if ext == "wav" && !wav_header_ok(&bytes) {
        return None;
    }
    let mime = if ext == "mp3" { "audio/mpeg" } else { "audio/wav" };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{b64}"))
}

/// Danh sách tên file mẫu đã có trong thư mục (đã loại file hỏng, đã sort).
pub fn list_cached_in(dir: &Path) -> Vec<String> {
    let mut ids: Vec<String> = fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|entry| {
                    let path = entry.path();
                    let is_audio = path
                        .extension()
                        .map(|x| x.eq_ignore_ascii_case("wav") || x.eq_ignore_ascii_case("mp3"))
                        .unwrap_or(false);
                    if !is_audio {
                        return None;
                    }
                    if too_small(&path) {
                        let _ = fs::remove_file(&path);
                        return None;
                    }
                    path.file_stem().map(|s| s.to_string_lossy().to_string())
                })
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    ids
}

/// Ghi file mẫu: `.part` → rename (atomic trên cùng ổ đĩa).
pub fn write_atomic(dir: &Path, name: &str, ext: &str, bytes: &[u8]) -> Result<PathBuf> {
    fs::create_dir_all(dir).with_context(|| format!("Tạo thư mục {}", dir.display()))?;
    let final_path = dir.join(format!("{name}.{ext}"));
    let part = dir.join(format!("{name}.{ext}.part"));
    fs::write(&part, bytes).with_context(|| format!("Ghi file tạm {}", part.display()))?;
    if final_path.exists() {
        let _ = fs::remove_file(&final_path);
    }
    fs::rename(&part, &final_path)
        .with_context(|| format!("Đổi tên {} -> {}", part.display(), final_path.display()))?;
    Ok(final_path)
}
