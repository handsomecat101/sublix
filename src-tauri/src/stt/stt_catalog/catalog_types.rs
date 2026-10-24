//! Kiửu dụng dữ liệu của engine STT (dữ liệu tịnh, không logic).

use serde::Serialize;

use crate::model_download::ModelFile;

/// One engine in the catalog.
#[derive(Debug, Clone, Serialize)]
pub struct SttEngineSpec {
    pub id: String,
    pub name: String,
    pub label: String,
    /// `whisper` | `sensevoice` | `paraformer` | `parakeet`
    pub family: String,
    /// Language codes the model understands.
    pub languages: Vec<String>,
    /// Short human label for the language coverage.
    pub lang_label: String,
    pub desc: String,
    pub size_mb: u32,
    pub size_note: String,
    pub license: String,
    /// Measured real-time factor (lower = faster) + the machine it was measured on.
    pub rtf_note: String,
    pub requires_cuda: bool,
    /// Whether the engine exposes real word-level timestamps.
    pub word_timestamps: bool,
    pub notes: String,
    /// `true` when the model is managed by the existing whisper.cpp downloader.
    pub builtin: bool,
    /// whisper.cpp variant name (only for `builtin` engines).
    pub whisper_variant: Option<String>,
    /// `true` when `files` is a single `.tar.bz2` that must be extracted.
    pub archive: bool,
    /// Files to download (empty for `builtin` engines).
    pub files: Vec<ModelFile>,
    /// Files that must exist on disk for the engine to be ready.
    pub required: Vec<String>,
}

/// Live status of one engine (what the UI renders).
#[derive(Debug, Clone, Serialize)]
pub struct SttEngineStatus {
    pub id: String,
    pub name: String,
    pub label: String,
    pub family: String,
    pub languages: Vec<String>,
    pub lang_label: String,
    pub desc: String,
    pub size_mb: u32,
    pub size_note: String,
    pub license: String,
    pub rtf_note: String,
    pub requires_cuda: bool,
    pub word_timestamps: bool,
    pub notes: String,
    /// `not_downloaded` | `downloading` | `ready` | `error`
    pub state: String,
    pub downloaded: bool,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub progress_pct: u32,
    pub error: Option<String>,
    /// whisper.cpp stays the default engine until the user picks another one.
    pub is_default: bool,
    /// The engine currently selected in the config.
    pub selected: bool,
}
