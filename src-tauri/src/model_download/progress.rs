//! Payload sự kiện tiến trình + khoá huỷ/khoá "đang tải" cho downloader model.

use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

/// Name of the Tauri event carrying [`DownloadProgress`].
pub const EVENT: &str = "model:download-progress";

/// Download phases reported through the progress event.
pub mod phase {
    pub const DOWNLOADING: &str = "downloading";
    pub const VERIFYING: &str = "verifying";
    pub const EXTRACTING: &str = "extracting";
    pub const INSTALLING_DEPS: &str = "installing_deps";
    pub const DONE: &str = "done";
    pub const ERROR: &str = "error";
}

/// Kind discriminator — `"stt"` or `"tts"`.
pub const KIND_STT: &str = "stt";
pub const KIND_TTS: &str = "tts";

/// One downloadable file that belongs to a model.
#[derive(Debug, Clone, Serialize)]
pub struct ModelFile {
    pub url: String,
    /// Mirror dùng khi URL chính bị nghẽn / lỗi (GitHub hay bị chặn tải ở VN).
    pub fallback_url: Option<String>,
    /// Path relative to the model directory (may contain `/`).
    pub filename: String,
    /// Expected size in bytes (0 = unknown → fall back to Content-Length).
    pub bytes: u64,
    /// Optional lowercase hex SHA-256 of the file.
    pub sha256: Option<String>,
}

impl ModelFile {
    pub fn new(url: impl Into<String>, filename: impl Into<String>, bytes: u64) -> Self {
        Self {
            url: url.into(),
            fallback_url: None,
            filename: filename.into(),
            bytes,
            sha256: None,
        }
    }

    pub fn with_fallback(mut self, fallback: impl Into<String>) -> Self {
        self.fallback_url = Some(fallback.into());
        self
    }

    pub fn with_sha256(mut self, sha256: impl Into<String>) -> Self {
        self.sha256 = Some(sha256.into().to_lowercase());
        self
    }
}

/// Progress payload emitted on [`EVENT`].
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    /// Model identifier (`sensevoice-zh-en`, `kokoro-vi`, ...).
    pub model_id: String,
    /// `"stt"` or `"tts"`.
    pub kind: String,
    /// One of [`phase`].
    pub phase: String,
    pub bytes_done: u64,
    pub bytes_total: u64,
    pub speed_bps: u64,
    pub eta_s: Option<u64>,
    /// File currently being processed (relative name).
    pub file: Option<String>,
    /// Human readable message (Vietnamese) for the UI.
    pub message: String,
}

// ---------------------------------------------------------------------------
// Cancellation registry
// ---------------------------------------------------------------------------

fn cancelled_slot() -> &'static Mutex<HashSet<String>> {
    static SLOT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Model đang được tải (chống 2 tiến trình ghi cùng 1 file → hỏng SHA-256).
pub(crate) fn in_progress_slot() -> &'static Mutex<HashSet<String>> {
    static SLOT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(HashSet::new()))
}

/// True nếu model này đang được tải.
pub fn is_in_progress(model_id: &str) -> bool {
    let set = in_progress_slot().lock().unwrap_or_else(|e| e.into_inner());
    set.contains(model_id)
}

/// Mark a model download as cancelled.
pub fn cancel(model_id: &str) {
    let mut set = cancelled_slot().lock().unwrap_or_else(|e| e.into_inner());
    set.insert(model_id.to_string());
}

/// Clear the cancel flag (called when a new download starts).
pub fn reset_cancel(model_id: &str) {
    let mut set = cancelled_slot().lock().unwrap_or_else(|e| e.into_inner());
    set.remove(model_id);
}

/// Whether the model download was cancelled.
pub fn is_cancelled(model_id: &str) -> bool {
    let set = cancelled_slot().lock().unwrap_or_else(|e| e.into_inner());
    set.contains(model_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_flag_roundtrip() {
        reset_cancel("unit-test-model");
        assert!(!is_cancelled("unit-test-model"));
        cancel("unit-test-model");
        assert!(is_cancelled("unit-test-model"));
        reset_cancel("unit-test-model");
        assert!(!is_cancelled("unit-test-model"));
    }
}
