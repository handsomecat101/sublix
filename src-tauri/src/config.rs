//! Persistent app config — stored as JSON in OS app-config dir.
//!
//! Location: %APPDATA%/com.sublix.app/sublix-config.json (Windows)
//!          ~/.config/com.sublix.app/sublix-config.json (Linux)
//!          ~/Library/Application Support/com.sublix.app/sublix-config.json (macOS)
//!
//! Used for user preferences (engine choice, model variants, languages, VAD, overlay style)
//! that persist across app restarts.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

/// Engine preference values. Stored as strings in config JSON.
pub mod engine_pref {
    pub const AUTO: &str = "auto";
    pub const CPU: &str = "cpu";
    pub const CUDA: &str = "cuda";

    pub fn all() -> &'static [&'static str] {
        &[AUTO, CPU, CUDA]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// STT engine preference: "auto" (try CUDA → CPU), "cpu" (force), "cuda" (force).
    #[serde(default = "default_auto")]
    pub stt_engine_preference: String,

    /// Translation engine preference: "auto" | "cpu" | "cuda".
    #[serde(default = "default_auto")]
    pub translation_engine_preference: String,

    /// Selected Whisper STT model variant name.
    #[serde(default = "default_stt_model")]
    pub stt_model: String,

    /// Selected local LLM translation model variant name.
    #[serde(default = "default_translation_model")]
    pub translation_model: String,

    /// Source audio language ("ja", "en", "zh", "ko", "vi", "auto").
    #[serde(default = "default_source_lang")]
    pub source_lang: String,

    /// Target subtitle language ("vi", "en", "ja", "zh", "ko").
    #[serde(default = "default_target_lang")]
    pub target_lang: String,

    /// Output mode: "translated" or "original".
    #[serde(default = "default_output_mode")]
    pub output_mode: String,

    /// Maximum audio chunk duration in seconds (2..=8).
    #[serde(default = "default_chunk_seconds")]
    pub chunk_seconds: u32,

    /// Smart VAD (Voice Activity Detection / phrase pause endpointing).
    #[serde(default = "default_true")]
    pub vad_enabled: bool,

    /// Overlay translated text font size in px (16..=36).
    #[serde(default = "default_font_size")]
    pub overlay_font_size: u32,

    /// Show bilingual subtitles (original text below translated text).
    #[serde(default = "default_true")]
    pub overlay_show_original: bool,

    /// Click-through overlay mode (mouse clicks pass through to video player).
    #[serde(default = "default_false")]
    pub overlay_click_through: bool,

    /// Overlay subtitle bar background opacity percent (0 = fully transparent, 100 = solid).
    #[serde(default = "default_overlay_bg_opacity")]
    pub overlay_bg_opacity: u32,

    /// Overlay translated text color preset: "white" | "yellow" | "amber".
    #[serde(default = "default_text_color")]
    pub overlay_text_color: String,

    /// Translation provider: "local" (llama-server) | "ollama" (local Ollama instance) | "minimax" (MiniMax Cloud API)
    #[serde(default = "default_provider")]
    pub translation_provider: String,

    /// MiniMax Cloud API Key
    #[serde(default = "default_empty_string")]
    pub minimax_api_key: String,

    /// MiniMax Model Name (default: "MiniMax-Text-01")
    #[serde(default = "default_minimax_model")]
    pub minimax_model: String,

    /// Local Ollama URL (default: "http://localhost:11434")
    #[serde(default = "default_ollama_url")]
    pub ollama_url: String,

    /// Ollama model name (default: "smtek/qwen3.8-27b:q4_k_m")
    #[serde(default = "default_ollama_model")]
    pub ollama_model: String,

    /// UI theme: "cinema" | "studio" | "light" | "vibrant".
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_auto() -> String {
    engine_pref::AUTO.to_string()
}

fn default_stt_model() -> String {
    "large-v3-turbo-q8_0".to_string()
}

fn default_translation_model() -> String {
    "qwen3-4b".to_string()
}

fn default_source_lang() -> String {
    "ja".to_string()
}

fn default_target_lang() -> String {
    "vi".to_string()
}

fn default_output_mode() -> String {
    "translated".to_string()
}

fn default_chunk_seconds() -> u32 {
    3
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_font_size() -> u32 {
    22
}

fn default_overlay_bg_opacity() -> u32 {
    85
}

fn default_text_color() -> String {
    "white".to_string()
}

fn default_provider() -> String {
    "local".to_string()
}

fn default_empty_string() -> String {
    String::new()
}

fn default_minimax_model() -> String {
    "MiniMax-M3".to_string()
}

fn default_ollama_url() -> String {
    "http://localhost:11434".to_string()
}

fn default_ollama_model() -> String {
    "smtek/qwen3.8-27b:q4_k_m".to_string()
}

fn default_theme() -> String {
    "cinema".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            stt_engine_preference: default_auto(),
            translation_engine_preference: default_auto(),
            stt_model: default_stt_model(),
            translation_model: default_translation_model(),
            source_lang: default_source_lang(),
            target_lang: default_target_lang(),
            output_mode: default_output_mode(),
            chunk_seconds: default_chunk_seconds(),
            vad_enabled: default_true(),
            overlay_font_size: default_font_size(),
            overlay_show_original: default_true(),
            overlay_click_through: default_false(),
            overlay_bg_opacity: default_overlay_bg_opacity(),
            overlay_text_color: default_text_color(),
            translation_provider: default_provider(),
            minimax_api_key: default_empty_string(),
            minimax_model: default_minimax_model(),
            ollama_url: default_ollama_url(),
            ollama_model: default_ollama_model(),
            theme: default_theme(),
        }
    }
}

impl AppConfig {
    /// Load config from disk without requiring AppHandle (for CLI/tests/background workers)
    pub fn load_or_default() -> Self {
        if let Ok(app_data) = std::env::var("APPDATA") {
            let p = PathBuf::from(app_data).join("com.sublix.desktop").join("sublix-config.json");
            if let Ok(content) = std::fs::read_to_string(&p) {
                if let Ok(cfg) = serde_json::from_str::<Self>(&content) {
                    return cfg;
                }
            }
        }
        Self::default()
    }

    /// Load config from disk. Returns Default if file missing or corrupt.
    pub fn load(app: &tauri::AppHandle) -> Self {
        let path = config_path(app);
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
                Ok(c) => {
                    tracing::info!("✅ Loaded config from {}", path.display());
                    c
                }
                Err(e) => {
                    tracing::warn!(
                        "⚠️  Config file corrupt ({e}), backing up to .bak and using defaults. Path: {}",
                        path.display()
                    );
                    let backup_path = path.with_extension("json.bak");
                    let _ = std::fs::copy(&path, &backup_path);
                    Self::default()
                }
            },
            Err(_) => {
                tracing::info!("📝 No config file yet, using defaults.");
                Self::default()
            }
        }
    }

    /// Save config to disk atomically. Creates parent dir if needed.
    pub fn save(&self, app: &tauri::AppHandle) -> Result<()> {
        let path = config_path(app);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create config dir: {}", parent.display()))?;
        }
        let json = serde_json::to_string_pretty(self).context("serialize config")?;
        let tmp_path = path.with_extension("json.tmp");
        std::fs::write(&tmp_path, json)
            .with_context(|| format!("write tmp config: {}", tmp_path.display()))?;
        std::fs::rename(&tmp_path, &path)
            .with_context(|| format!("atomic rename config: {}", path.display()))?;
        tracing::info!("💾 Config saved atomically: {}", path.display());
        Ok(())
    }
}

/// Helper to resolve runtime resource base directory (binaries, models).
/// On release / portable: uses folder containing sublix.exe if `binaries` or `models` exists there.
/// Falls back to CARGO_MANIFEST_DIR for dev / cargo test.
pub fn app_base_dir() -> PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            if parent.join("binaries").exists() || parent.join("models").exists() {
                return parent.to_path_buf();
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// Get the config file path. Uses Tauri's app_config_dir() if available.
fn config_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| std::env::temp_dir().join("sublix"));
    dir.join("sublix-config.json")
}
