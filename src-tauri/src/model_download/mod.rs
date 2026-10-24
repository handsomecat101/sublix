//! Shared model downloader with detailed, resumable, cancellable progress.
//!
//! Emits the Tauri event [`EVENT`] (`model:download-progress`) so any UI can
//! render `%`, `MB/s`, `ETA` and the current phase without touching the
//! downloader internals. Used by both the STT catalog (`stt/stt_catalog.rs`)
//! and the voice/TTS catalog (`voice_models.rs`).
//!
//! Guarantees (BUG-012):
//! - a file is only "installed" after its byte count matches the expected size,
//! - an optional SHA-256 checksum is verified before the file is renamed into
//!   place, so a truncated / corrupted download can never look "ready",
//! - an interrupted download resumes via the HTTP `Range` header instead of
//!   starting over.
//!
//! Module con:
//! - [`progress`] — payload sự kiện + khoá huỷ / khoá "đang tải",
//! - [`sha256`] — băm SHA-256 không phụ thuộc thư viện ngoài,
//! - [`http`] — tải file (resume, tốc độ, huỷ).

use anyhow::{bail, Context, Result};
use std::path::Path;

mod http;
pub mod progress;
pub mod sha256;

pub use progress::{
    cancel, is_cancelled, is_in_progress, reset_cancel, DownloadProgress, ModelFile, EVENT,
    KIND_STT, KIND_TTS, phase,
};
pub use sha256::{sha256_file, sha256_hex, Sha256};

use http::download_one;
use progress::in_progress_slot;

/// Download every file of a model into `dest_dir`, reporting progress.
///
/// `files` are downloaded sequentially. Existing complete files are skipped;
/// partial files resume through the HTTP `Range` header.
pub fn download_files<F>(
    model_id: &str,
    kind: &str,
    dest_dir: &Path,
    files: &[ModelFile],
    on_progress: &mut F,
) -> Result<()>
where
    F: FnMut(DownloadProgress),
{
    // Chống 2 lượt tải chạy song song trên cùng 1 model: chúng sẽ ghi đè
    // lẫn nhau và tạo file hỏng (SHA-256 sai).
    {
        let mut set = in_progress_slot().lock().unwrap_or_else(|e| e.into_inner());
        if !set.insert(model_id.to_string()) {
            bail!("Model '{model_id}' đang được tải — vui lòng đợi hoàn tất.");
        }
    }
    let result = download_files_inner(model_id, kind, dest_dir, files, on_progress);
    let mut set = in_progress_slot().lock().unwrap_or_else(|e| e.into_inner());
    set.remove(model_id);
    result
}

fn download_files_inner<F>(
    model_id: &str,
    kind: &str,
    dest_dir: &Path,
    files: &[ModelFile],
    on_progress: &mut F,
) -> Result<()>
where
    F: FnMut(DownloadProgress),
{
    reset_cancel(model_id);
    std::fs::create_dir_all(dest_dir)
        .with_context(|| format!("Không tạo được thư mục model: {}", dest_dir.display()))?;

    let total_all: u64 = files.iter().map(|f| f.bytes).sum();
    let mut done_all: u64 = 0;

    for file in files {
        let dest = dest_dir.join(&file.filename);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Không tạo được thư mục: {}", parent.display()))?;
        }

        // Already installed?
        if let Ok(meta) = std::fs::metadata(&dest) {
            let complete = if file.bytes > 0 {
                meta.len() == file.bytes
            } else {
                meta.len() > 0
            };
            if complete {
                done_all += meta.len();
                continue;
            }
        }

        let temp = dest_dir.join(format!("{}.part", file.filename.replace('/', "_")));
        download_one(model_id, kind, file, &temp, total_all, done_all, on_progress)?;
        done_all += file.bytes.max(
            std::fs::metadata(&dest)
                .map(|m| m.len())
                .unwrap_or_default(),
        );
    }

    on_progress(DownloadProgress {
        model_id: model_id.to_string(),
        kind: kind.to_string(),
        phase: phase::DONE.to_string(),
        bytes_done: total_all,
        bytes_total: total_all,
        speed_bps: 0,
        eta_s: Some(0),
        file: None,
        message: "Tải xong".to_string(),
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrent_download_of_same_model_is_refused() {
        let dir = std::env::temp_dir().join("sublix-dl-guard-test");
        let spec = ModelFile::new("https://example.invalid/x.bin", "x.bin", 4);
        let id = "guard-test-model";
        // Lượt tải #1 đang chạy ⇒ đã chiếm khoá.
        {
            let mut set = in_progress_slot().lock().unwrap_or_else(|e| e.into_inner());
            set.insert(id.to_string());
        }
        assert!(is_in_progress(id));
        // Lượt tải #2 phải bị từ chối (không được ghi chung file .part).
        let mut sink = |_: DownloadProgress| {};
        let err = download_files(id, KIND_STT, &dir, &[spec], &mut sink)
            .expect_err("phải từ chối tải trùng");
        assert!(format!("{err:#}").contains("đang được tải"));
        // Lượt #2 không được phá khoá của lượt #1.
        assert!(is_in_progress(id), "lượt đang tải phải giữ khoá");
        // Dọn dẹp.
        in_progress_slot()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(id);
        assert!(!is_in_progress(id));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
