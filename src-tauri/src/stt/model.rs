//! Whisper model management — download and cache GGML models from Hugging Face.
//!
//! Models are stored in `<project_root>/models/`.
//! URLs follow whisper.cpp convention: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{variant}.bin`

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tracing::{info, warn};

/// Project root models directory: `sublix/models/`
pub const MODELS_DIR: &str = "models";

/// Supported Whisper model variants.
/// Names match whisper.cpp's GGML file naming (`ggml-{name}.bin`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelVariant {
    Tiny,        // 39M params, ~75MB
    Base,        // 74M params, ~140MB
    Small,       // 244M params, ~465MB
    Medium,      // 769M params, ~1.5GB
    LargeV3,     // 1.55B params, ~3GB — best for JA/VI
}

impl ModelVariant {
    pub fn from_name(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "tiny" => Some(Self::Tiny),
            "base" => Some(Self::Base),
            "small" => Some(Self::Small),
            "medium" => Some(Self::Medium),
            "large" | "large-v3" | "largev3" => Some(Self::LargeV3),
            _ => None,
        }
    }

    pub fn filename(&self) -> &'static str {
        match self {
            Self::Tiny => "ggml-tiny.bin",
            Self::Base => "ggml-base.bin",
            Self::Small => "ggml-small.bin",
            Self::Medium => "ggml-medium.bin",
            Self::LargeV3 => "ggml-large-v3.bin",
        }
    }

    pub fn download_url(&self) -> String {
        format!(
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
            self.filename()
        )
    }

    pub fn approximate_size_mb(&self) -> u32 {
        match self {
            Self::Tiny => 75,
            Self::Base => 140,
            Self::Small => 465,
            Self::Medium => 1500,
            Self::LargeV3 => 3000,
        }
    }
}

/// Path to the cached model file. Creates `models/` dir if missing.
pub fn model_path(variant: ModelVariant) -> Result<PathBuf> {
    let dir = Path::new(MODELS_DIR);
    if !dir.exists() {
        std::fs::create_dir_all(dir).context("Failed to create models directory")?;
    }
    Ok(dir.join(variant.filename()))
}

/// Check if model exists. Returns path if yes, None if no.
pub fn model_exists(variant: ModelVariant) -> Option<PathBuf> {
    let path = model_path(variant).ok()?;
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

/// Ensure the model is available. If not present, download it.
/// Returns the path to the model file.
pub fn ensure_model(variant: ModelVariant) -> Result<PathBuf> {
    if let Some(path) = model_exists(variant) {
        info!(
            "✅ Model {} already cached at: {}",
            variant.filename(),
            path.display()
        );
        return Ok(path);
    }

    warn!(
        "⏬ Model {} not found, downloading (~{}MB)...",
        variant.filename(),
        variant.approximate_size_mb()
    );

    let path = model_path(variant)?;
    download_model(variant, &path)?;

    info!("✅ Model downloaded: {}", path.display());
    Ok(path)
}

/// Download a model from Hugging Face to the given path.
fn download_model(variant: ModelVariant, dest: &Path) -> Result<()> {
    let url = variant.download_url();
    info!("📥 Downloading from: {url}");

    // Use blocking reqwest (simpler than async for this one-shot op)
    let client = reqwest::blocking::Client::builder()
        .user_agent("sublix/0.1.0")
        .timeout(std::time::Duration::from_secs(600)) // 10 min for large-v3
        .build()
        .context("Failed to build HTTP client")?;

    let mut response = client
        .get(&url)
        .send()
        .context("Failed to send download request")?
        .error_for_status()
        .context("Download request returned error status")?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut dest_file = std::fs::File::create(dest)
        .with_context(|| format!("Failed to create model file: {}", dest.display()))?;

    use std::io::{Read, Write};
    let mut buffer = [0u8; 64 * 1024]; // 64KB chunks
    let mut last_log_pct: i32 = -1;

    loop {
        let bytes_read = response
            .read(&mut buffer)
            .context("Failed to read from download stream")?;
        if bytes_read == 0 {
            break;
        }
        dest_file
            .write_all(&buffer[..bytes_read])
            .context("Failed to write to model file")?;
        downloaded += bytes_read as u64;

        if total_size > 0 {
            let pct = ((downloaded * 100) / total_size) as i32;
            if pct / 10 != last_log_pct / 10 {
                info!("  ⏳ {}% ({:.1} MB / {:.1} MB)",
                    pct,
                    downloaded as f64 / 1_048_576.0,
                    total_size as f64 / 1_048_576.0);
                last_log_pct = pct;
            }
        }
    }

    dest_file.flush().context("Failed to flush model file")?;
    Ok(())
}
