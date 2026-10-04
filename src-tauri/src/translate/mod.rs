//! Local LLM translation — llama-server + modern 2026 GGUF models (Qwen3, Gemma 3, Qwen2.5).
//!
//! Fully local, no API keys, GPU-accelerated via CUDA (`llama-server.exe -ngl 999`).

use anyhow::{Context, Result};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tracing::{info, warn};

pub mod server;

use crate::stt::EnginePreference;

const BINARIES_DIR: &str = "binaries";
const MODELS_DIR: &str = "models";

const LLAMA_CPP_ZIP_URL: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b10472/llama-b10472-bin-win-cpu-x64.zip";

/// Default size label for onboarding
pub const MODEL_SIZE_MB: u32 = 2500;

/// Supported local translation LLM variants.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum TranslationModelVariant {
    Qwen3_4B,    // Qwen3-4B-Instruct-2507 Q4_K_M (~2.5GB) — ⭐ 2026 Recommended
    Gemma3_4B,   // Google Gemma-3-4B-IT Q4_K_M (~2.5GB)
    Qwen3_8B,    // Qwen3-8B Q4_K_M (~5.0GB) — Cinema Pro on RTX 3090
    Qwen25_3B,   // Qwen2.5-3B-Instruct Q4_K_M (~2.0GB)
    Qwen25_1_5B, // Qwen2.5-1.5B-Instruct Q4_K_M (~1.1GB)
}

impl TranslationModelVariant {
    pub const ALL: &'static [TranslationModelVariant] = &[
        TranslationModelVariant::Qwen3_4B,
        TranslationModelVariant::Gemma3_4B,
        TranslationModelVariant::Qwen3_8B,
        TranslationModelVariant::Qwen25_3B,
        TranslationModelVariant::Qwen25_1_5B,
    ];

    pub fn from_name(s: &str) -> Option<Self> {
        match s.to_lowercase().trim() {
            "qwen3-4b" | "qwen3-4b-instruct" | "qwen3" => Some(Self::Qwen3_4B),
            "gemma3-4b" | "gemma-3-4b" | "gemma3" => Some(Self::Gemma3_4B),
            "qwen3-8b" => Some(Self::Qwen3_8B),
            "qwen2.5-3b" | "qwen25-3b" => Some(Self::Qwen25_3B),
            "qwen2.5-1.5b" | "qwen25-1.5b" => Some(Self::Qwen25_1_5B),
            _ => None,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::Qwen3_4B => "qwen3-4b",
            Self::Gemma3_4B => "gemma3-4b",
            Self::Qwen3_8B => "qwen3-8b",
            Self::Qwen25_3B => "qwen2.5-3b",
            Self::Qwen25_1_5B => "qwen2.5-1.5b",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Qwen3_4B => "Qwen3-4B-Instruct-2507 (2.5GB) — ⭐ 2026 Best (Fast + Natural VI)",
            Self::Gemma3_4B => "Google Gemma-3-4B-IT (2.5GB) — Smooth movie dialogue",
            Self::Qwen3_8B => "Qwen3-8B (5.0GB) — Cinema Pro (Best nuance for 8GB+ GPU)",
            Self::Qwen25_3B => "Qwen2.5-3B-Instruct (2.0GB) — Legacy balanced",
            Self::Qwen25_1_5B => "Qwen2.5-1.5B-Instruct (1.1GB) — Ultra-light CPU fallback",
        }
    }

    pub fn filename(&self) -> &'static str {
        match self {
            Self::Qwen3_4B => "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
            Self::Gemma3_4B => "gemma-3-4b-it-Q4_K_M.gguf",
            Self::Qwen3_8B => "Qwen3-8B-Q4_K_M.gguf",
            Self::Qwen25_3B => "qwen2.5-3b-instruct-q4_k_m.gguf",
            Self::Qwen25_1_5B => "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        }
    }

    pub fn download_url(&self) -> &'static str {
        match self {
            Self::Qwen3_4B => "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
            Self::Gemma3_4B => "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf",
            Self::Qwen3_8B => "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf",
            Self::Qwen25_3B => "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
            Self::Qwen25_1_5B => "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
        }
    }

    pub fn approximate_size_mb(&self) -> u32 {
        match self {
            Self::Qwen3_4B => 2500,
            Self::Gemma3_4B => 2490,
            Self::Qwen3_8B => 5030,
            Self::Qwen25_3B => 2000,
            Self::Qwen25_1_5B => 1065,
        }
    }

    /// Return the best model currently installed on disk.
    pub fn best_installed() -> Option<Self> {
        let priority = [
            Self::Qwen3_4B,
            Self::Qwen3_8B,
            Self::Gemma3_4B,
            Self::Qwen25_3B,
            Self::Qwen25_1_5B,
        ];
        priority.into_iter().find(|v| has_variant_model(*v))
    }

    /// Resolve a requested model name: if requested variant is installed, use it;
    /// otherwise fall back to best installed model if available, or the requested variant.
    pub fn resolve_or_best(name: Option<&str>) -> Self {
        if let Some(n) = name.and_then(Self::from_name) {
            if has_variant_model(n) {
                return n;
            }
            if let Some(installed) = Self::best_installed() {
                warn!(
                    "Requested translation model '{}' not downloaded yet, using installed '{}' instead",
                    n.name(),
                    installed.name()
                );
                return installed;
            }
            return n;
        }
        Self::best_installed().unwrap_or(Self::Qwen3_4B)
    }
}

/// Full ISO language name for prompt.
pub fn lang_name(code: &str) -> &'static str {
    match code.to_lowercase().as_str() {
        "ja" | "japanese" => "Japanese",
        "en" | "english" => "English",
        "vi" | "vietnamese" => "Vietnamese",
        "zh" | "chinese" => "Chinese",
        "ko" | "korean" => "Korean",
        "fr" | "french" => "French",
        "de" | "german" => "German",
        "es" | "spanish" => "Spanish",
        "ru" | "russian" => "Russian",
        _ => "the source language",
    }
}

fn binaries_dir() -> PathBuf {
    crate::config::app_base_dir().join(BINARIES_DIR)
}

fn models_dir() -> PathBuf {
    crate::config::app_base_dir().join(MODELS_DIR)
}

pub fn has_binary() -> bool {
    let dir = binaries_dir();
    dir.join("cuda").join("llama-server.exe").exists() || dir.join("llama-server.exe").exists()
}

pub fn has_variant_model(variant: TranslationModelVariant) -> bool {
    let p = models_dir().join(variant.filename());
    p.exists() && std::fs::metadata(&p).map(|m| m.len() > 100_000_000).unwrap_or(false)
}

pub fn has_model() -> bool {
    TranslationModelVariant::best_installed().is_some()
}

pub fn ensure_binary() -> Result<PathBuf> {
    let dir = binaries_dir();
    std::fs::create_dir_all(&dir).with_context(|| format!("Create {}", dir.display()))?;
    let cuda_exe = dir.join("cuda").join("llama-server.exe");
    if cuda_exe.exists() {
        return Ok(cuda_exe);
    }
    let cpu_exe = dir.join("llama-server.exe");
    if cpu_exe.exists() {
        return Ok(cpu_exe);
    }
    info!("📥 llama-server not found, downloading {} ...", LLAMA_CPP_ZIP_URL);
    download_and_extract_zip(LLAMA_CPP_ZIP_URL, &dir)?;
    if !cpu_exe.exists() {
        return Err(anyhow::anyhow!(
            "llama-server.exe not found after extracting {}",
            LLAMA_CPP_ZIP_URL
        ));
    }
    Ok(cpu_exe)
}

pub fn ensure_variant_model(variant: TranslationModelVariant) -> Result<PathBuf> {
    ensure_variant_model_with_progress(variant, |_, _, _| ())
}

pub fn ensure_variant_model_with_progress<F>(
    variant: TranslationModelVariant,
    mut on_progress: F,
) -> Result<PathBuf>
where
    F: FnMut(u64, u64, u32),
{
    let dir = models_dir();
    std::fs::create_dir_all(&dir).with_context(|| format!("Create {}", dir.display()))?;
    let path = dir.join(variant.filename());
    if has_variant_model(variant) {
        return Ok(path);
    }
    let temp_path = dir.join(format!("{}.downloading", variant.filename()));
    info!(
        "📥 Translation model {} not found, downloading {} (~{}MB)...",
        variant.name(),
        variant.download_url(),
        variant.approximate_size_mb()
    );
    download_file_with_progress(variant.download_url(), &temp_path, &mut on_progress)?;
    std::fs::rename(&temp_path, &path)
        .with_context(|| format!("Failed to rename downloaded model to {}", path.display()))?;
    info!("✅ Translation model ready: {}", path.display());
    Ok(path)
}

pub fn ensure_model() -> Result<PathBuf> {
    ensure_variant_model(TranslationModelVariant::Qwen3_4B)
}

#[allow(dead_code)]
fn download_file(url: &str, dest: &Path) -> Result<()> {
    download_file_with_progress(url, dest, |_, _, _| ())
}

fn download_file_with_progress<F>(url: &str, dest: &Path, mut on_progress: F) -> Result<()>
where
    F: FnMut(u64, u64, u32),
{
    let client = reqwest::blocking::Client::builder()
        .user_agent("sublix/0.6.0")
        .timeout(std::time::Duration::from_secs(1800))
        .build()?;
    let mut response = client.get(url).send()?.error_for_status()?;
    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut dest_file = std::fs::File::create(dest)?;
    let mut buffer = [0u8; 128 * 1024];
    let mut last_pct: i32 = -1;
    loop {
        let n = response.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        dest_file.write_all(&buffer[..n])?;
        downloaded += n as u64;
        if total > 0 {
            let pct = ((downloaded * 100) / total) as u32;
            on_progress(downloaded, total, pct);
            let pct_i = pct as i32;
            if pct_i / 10 != last_pct / 10 {
                info!(
                    "    ⏳ {}% ({:.1} MB / {:.1} MB)",
                    pct,
                    downloaded as f64 / 1_048_576.0,
                    total as f64 / 1_048_576.0
                );
                last_pct = pct_i;
            }
        }
    }
    dest_file.flush()?;
    Ok(())
}

fn download_and_extract_zip(url: &str, dest_dir: &Path) -> Result<()> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()?;
    let mut response = client.get(url).send()?.error_for_status()?;
    let mut buf = Vec::new();
    response.copy_to(&mut buf)?;
    let cursor = std::io::Cursor::new(buf);
    let mut archive = zip::ZipArchive::new(cursor)?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() {
            Some(p) => dest_dir.join(p),
            None => continue,
        };
        if file.is_dir() {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
    }
    Ok(())
}

/// Translate text using the active provider configured in AppConfig (MiniMax Cloud, Local Ollama, or Local llama-server).
pub fn translate_text_with_config(
    text: &str,
    source: &str,
    target: &str,
    model: TranslationModelVariant,
    pref: EnginePreference,
    cfg: &crate::config::AppConfig,
) -> Result<String> {
    match cfg.translation_provider.to_lowercase().as_str() {
        "minimax" => {
            server::translate_via_minimax(text, source, target, &cfg.minimax_api_key, &cfg.minimax_model)
        }
        "ollama" => {
            server::translate_via_ollama(text, source, target, &cfg.ollama_url, &cfg.ollama_model)
        }
        _ => {
            server::translate_via_server(text, source, target, model, pref)
        }
    }
}

/// Translate a batch of texts using active provider, chunking into sub-batches of 15 items.
pub fn translate_batch_with_config(
    items: &[String],
    source: &str,
    target: &str,
    model: TranslationModelVariant,
    pref: EnginePreference,
    cfg: &crate::config::AppConfig,
) -> Vec<String> {
    if items.is_empty() {
        return Vec::new();
    }

    let mut results = Vec::with_capacity(items.len());
    let chunk_size = 15;

    for chunk in items.chunks(chunk_size) {
        let chunk_res = match cfg.translation_provider.to_lowercase().as_str() {
            "minimax" => {
                match server::translate_batch_via_minimax(chunk, source, target, &cfg.minimax_api_key, &cfg.minimax_model) {
                    Ok(res) => res,
                    Err(e) => {
                        warn!("Batch translation via MiniMax failed: {e:#}, falling back to single items");
                        chunk.iter().map(|item| {
                            translate_text_with_config(item, source, target, model, pref, cfg).unwrap_or_else(|_| item.clone())
                        }).collect()
                    }
                }
            }
            "ollama" => {
                match server::translate_batch_via_ollama(chunk, source, target, &cfg.ollama_url, &cfg.ollama_model) {
                    Ok(res) => res,
                    Err(e) => {
                        warn!("Batch translation via Ollama failed: {e:#}, falling back to single items");
                        chunk.iter().map(|item| {
                            translate_text_with_config(item, source, target, model, pref, cfg).unwrap_or_else(|_| item.clone())
                        }).collect()
                    }
                }
            }
            _ => {
                // Local llama-server fallback item-by-item
                chunk.iter().map(|item| {
                    translate_text_with_config(item, source, target, model, pref, cfg).unwrap_or_else(|_| item.clone())
                }).collect()
            }
        };

        results.extend(chunk_res);
    }

    results
}

/// Translate text using the long-running `llama-server` with the specified model and engine preference.
pub fn translate_text_with_options(
    text: &str,
    source: &str,
    target: &str,
    model: TranslationModelVariant,
    pref: EnginePreference,
) -> Result<String> {
    server::translate_via_server(text, source, target, model, pref)
}

/// Translate text using the best available model and Auto/GPU preference.
pub fn translate_text(text: &str, source: &str, target: &str) -> Result<String> {
    let model = TranslationModelVariant::resolve_or_best(None);
    server::translate_via_server(text, source, target, model, EnginePreference::Auto)
}

/// Pre-start or hot-swap the translation server.
pub fn preload_server_with_options(
    model: TranslationModelVariant,
    pref: EnginePreference,
) -> Result<String> {
    server::preload_server(model, pref).map_err(|e| anyhow::anyhow!("{}", e))
}

/// Legacy preload_server with default options.
pub fn preload_server() -> Result<String> {
    let model = TranslationModelVariant::resolve_or_best(None);
    preload_server_with_options(model, EnginePreference::Auto)
}

/// Get the current engine ("cuda" or "cpu") if running.
pub fn current_engine() -> Option<String> {
    server::current_engine().map(|e| e.as_str().to_string())
}

/// Get the currently loaded translation model name if running.
pub fn current_model() -> Option<String> {
    server::current_model().map(|m| m.name().to_string())
}
