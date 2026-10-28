//! TSK-LAB-C3 — **lấy thoại & tín hiệu cảnh** cho 1 video nguồn.
//!
//! Thứ tự ưu tiên (rẻ → đắt):
//! 1. **Dự án Studio đã nhận dạng** ⇒ dùng `segments` có sẵn (không STT lại).
//! 2. **Cache** lần phân tích trước (cùng file ⇒ cùng khoá).
//! 3. **Phụ đề `.srt` cạnh video** (bộ đọc SRT sẵn có của app).
//! 4. **Luồng nhận dạng sẵn có** của app (đúng engine STT người dùng chọn trong
//!    Cài đặt) — **không** viết STT mới ở đây.
//!
//! Lỗi STT ⇒ trả về thoại rỗng (không làm hỏng cả lần phân tích).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::Manager;

use super::analyze::LabSourceInput;
use super::cache::{cache_key, read_cached, CACHE_DIR_NAME};
use super::transcript::{lines_from_project, lines_from_srt, TranscriptLine};

/// Thư mục dữ liệu app (dùng cho cache).
pub fn lab_data_dir(app: Option<&tauri::AppHandle>) -> PathBuf {
    match app {
        Some(handle) => handle
            .path()
            .app_config_dir()
            .or_else(|_| handle.path().app_data_dir())
            .unwrap_or_else(|_| std::env::temp_dir().join("sublix")),
        None => std::env::temp_dir().join("sublix"),
    }
}

/// Lấy thoại cho 1 video nguồn + thời lượng (giây).
pub fn transcript_for(
    app: Option<&tauri::AppHandle>,
    source: &LabSourceInput,
    source_idx: usize,
    config: &crate::config::AppConfig,
    cancel: &AtomicBool,
) -> Result<(Vec<TranscriptLine>, f64), String> {
    let path = PathBuf::from(&source.path);

    // 1. Dự án Studio đã nhận diện ⇒ dùng `segments` có sẵn.
    if let Some(project_path) = source.studio_project.as_ref().filter(|p| !p.trim().is_empty()) {
        match read_studio_project(project_path, source_idx) {
            Ok(lines) if !lines.is_empty() => return Ok((lines, 0.0)),
            Ok(_) => {}
            Err(err) => tracing::warn!("lab: đọc dự án Studio lỗi: {err}"),
        }
    }

    // 2. Cache lần phân tích trước (cùng file ⇒ cùng khoá).
    let key = cache_key(&path);
    if !key.is_empty() {
        let dir = lab_data_dir(app).join(CACHE_DIR_NAME);
        if let Some(cached) = read_cached(&dir, &key) {
            if !cached.transcript.is_empty() {
                return Ok((cached.transcript, 0.0));
            }
        }
    }

    // 3. Phụ đề `.srt` có sẵn cạnh video.
    for sibling in srt_siblings(&path) {
        if let Ok(lines) = lines_from_srt(&sibling, source_idx) {
            if !lines.is_empty() {
                return Ok((lines, 0.0));
            }
        }
    }

    // 4. Luồng nhận dạng sẵn có của app.
    if cancel.load(Ordering::SeqCst) {
        return Ok((Vec::new(), 0.0));
    }
    match crate::dubbing::analyze_and_create_project_full(
        app,
        &source.path,
        Some(config.source_lang.clone()),
        None,
        None,
        None,
        None,
        Some(true),
        None,
    ) {
        Ok(project) => {
            let lines = lines_from_project(&project, source_idx);
            Ok((lines, project.media_duration_sec))
        }
        Err(err) => {
            tracing::warn!("lab: nhận dạng thoại thất bại ({}): {err:#}", source.path);
            Ok((Vec::new(), 0.0))
        }
    }
}

/// Đọc dự án Studio đã nhận diện ⇒ lấy `segments`.
fn read_studio_project(path: &str, source_idx: usize) -> Result<Vec<TranscriptLine>, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Đọc dự án Studio {path} thất bại: {e}"))?;
    let project: crate::dubbing::DubbingProject = serde_json::from_str(&content)
        .map_err(|e| format!("Dự án Studio {path} không đọc được: {e}"))?;
    Ok(lines_from_project(&project, source_idx))
}

/// Các file `.srt` cạnh video (`video.srt`, `video.vi.srt`, `video.zh.srt`…).
pub fn srt_siblings(path: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
        return out;
    };
    let Some(parent) = path.parent() else {
        return out;
    };
    let mut names = vec![format!("{stem}.srt")];
    for lang in ["vi", "zh", "en", "ja"] {
        names.push(format!("{stem}.{lang}.srt"));
    }
    for name in names {
        let candidate = parent.join(name);
        if candidate.is_file() {
            out.push(candidate);
        }
    }
    out
}

/// Dò phụ đề cứng (v0.14) — lỗi thì bỏ qua (không chặn phân tích).
pub fn detect_hardsub(path: &Path) -> Vec<(f64, f64)> {
    let mut ignored = |_percent: u32, _message: &str| {};
    match crate::hardsub::detect::detect(
        path,
        crate::hardsub::band::Region::Bottom,
        1.0,
        &mut ignored,
    ) {
        Ok(result) => result.spans,
        Err(err) => {
            tracing::warn!("lab: không dò được phụ đề cứng: {err}");
            Vec::new()
        }
    }
}

/// Kích thước file (MB).
pub fn file_size_mb(path: &Path) -> f64 {
    path.metadata()
        .map(|meta| meta.len() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0)
}

/// Định dạng giây ⇒ `HH:MM:SS`.
pub fn format_clock(secs: f64) -> String {
    let total = secs.max(0.0) as u32;
    format!(
        "{:02}:{:02}:{:02}",
        total / 3600,
        (total % 3600) / 60,
        total % 60
    )
}

/// Giây Unix hiện tại.
pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
