//! Local Whisper STT — uses prebuilt whisper.cpp binary via subprocess.
//!
//! Why subprocess (not whisper-rs Rust binding):
//! - whisper-rs needs `libclang.dll` for bindgen (NOT installed on this system)
//! - whisper.cpp ships prebuilt Windows binaries → no build deps
//! - Subprocess startup overhead (~200ms) is fine for MVP (file-based transcription)
//! - Same Whisper model quality, fully local
//!
//! First-run flow:
//!   1. Download `whisper-bin-x64.zip` from GitHub releases (~30MB) → `binaries/`
//!   2. Extract `whisper-cli.exe` and `whisper.dll`
//!   3. Download `ggml-tiny.bin` model from Hugging Face (~75MB) → `models/`
//!   4. Subsequent runs: use cached files (no download)

use anyhow::{Context, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::{info, warn};

/// Project-relative directories
const BINARIES_DIR: &str = "binaries";
const MODELS_DIR: &str = "models";

/// whisper.cpp release to download (pinned for stability)
const WHISPER_CPP_VERSION: &str = "v1.7.6";
const WHISPER_CPP_ZIP_URL: &str =
    "https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip";

/// Whisper model variants (mapped to ggml-*.bin files on Hugging Face)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ModelVariant {
    Tiny,        // 39M params, ~75MB
    Base,        // 74M params, ~140MB
    Small,       // 244M params, ~465MB
    Medium,      // 769M params, ~1.5GB
    LargeV3,     // 1.55B params, ~3GB
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

    /// Default model for MVP — smallest, fastest, good enough to verify pipeline.
    pub fn default_mvp() -> Self {
        Self::Tiny
    }
}

/// Result of a local transcription.
#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: String,
    pub model: String,
    pub audio_duration_secs: f32,
    pub inference_duration_secs: f32,
}

impl TranscriptionResult {
    pub fn print(&self) {
        println!("\n📝 Transcription ({}):", self.language);
        println!("─────────────────────────────────────");
        println!("{}", self.text);
        println!("─────────────────────────────────────");
        println!(
            "  Audio: {:.1}s | Inference: {:.1}s ({:.1}x realtime) | Model: {}",
            self.audio_duration_secs,
            self.inference_duration_secs,
            self.audio_duration_secs / self.inference_duration_secs.max(0.01),
            self.model
        );
    }
}

/// Language options for whisper.cpp's `-l` flag.
pub const TRANSCRIBE_LANG_OPTIONS: &[&str] = &[
    "auto", "en", "zh", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr", "pl", "ca", "nl",
    "ar", "sv", "it", "id", "hi", "fi", "vi", "he", "uk", "el", "ms", "cs", "ro", "da", "hu",
    "ta", "no", "th", "ur", "hr", "bg", "lt", "la", "mi", "ml", "cy", "sk", "te", "fa", "lv",
    "bn", "sr", "az", "sl", "kn", "et", "mk", "br", "eu", "is", "hy", "ne", "mn", "bs", "kk",
    "sq", "sw", "gl", "mr", "pa", "si", "km", "sn", "yo", "so", "af", "oc", "ka", "be", "tg",
    "sd", "gu", "am", "yi", "lo", "uz", "kk", "ht", "ps", "tk", "mn", "nn", "rm", "my", "jv",
];

/// Whisper local STT manager.
pub struct WhisperLocal {
    binary_path: PathBuf,
    model_path: PathBuf,
    model: ModelVariant,
}

impl WhisperLocal {
    /// Create a new Whisper local instance. Downloads binary + model if needed.
    pub fn new(model: ModelVariant) -> Result<Self> {
        let binary_path = ensure_binary()?;
        let model_path = ensure_model(model)?;

        Ok(Self {
            binary_path,
            model_path,
            model,
        })
    }

    /// Transcribe a WAV file using the local whisper.cpp binary.
    pub fn transcribe(&self, wav_path: &str, language: Option<&str>) -> Result<TranscriptionResult> {
        let wav_path = Path::new(wav_path);
        if !wav_path.exists() {
            return Err(anyhow::anyhow!("WAV file not found: {}", wav_path.display()));
        }

        // Get audio duration from WAV header
        let audio_duration = read_wav_duration(wav_path.to_str().unwrap()).unwrap_or(0.0);

        // Build whisper-cli command
        // Usage: whisper-cli.exe -m model.bin -f input.wav [-l lang] [--no-prints]
        let lang = language.unwrap_or("auto");
        info!(
            "🎙️ Running: {} -m {} -f {} -l {}",
            self.binary_path.display(),
            self.model_path.display(),
            wav_path.display(),
            lang
        );

        let start = std::time::Instant::now();
        let output = Command::new(&self.binary_path)
            .arg("-m")
            .arg(&self.model_path)
            .arg("-f")
            .arg(wav_path)
            .arg("-l")
            .arg(lang)
            .arg("--no-prints")
            .arg("--print-colors")
            .arg("false")
            .output()
            .with_context(|| format!("Failed to run whisper-cli at {}", self.binary_path.display()))?;
        let inference_duration = start.elapsed().as_secs_f32();

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!(
                "whisper-cli failed (exit {:?}): {}",
                output.status.code(),
                stderr
            ));
        }

        // whisper-cli outputs segments like:
        //   [00:00:00.000 --> 00:00:05.000] Hello, world.
        // For our MVP, we just want the text. Let's grab it from stdout.
        let stdout = String::from_utf8_lossy(&output.stdout);
        let text = parse_whisper_output(&stdout);

        let detected_lang = if lang == "auto" {
            "auto".to_string()
        } else {
            lang_code_to_name(lang).to_string()
        };

        info!(
            "✅ Transcribed {} → {} chars in {:.2}s",
            wav_path.display(),
            text.len(),
            inference_duration
        );

        Ok(TranscriptionResult {
            text,
            language: detected_lang,
            model: self.model.filename().to_string(),
            audio_duration_secs: audio_duration,
            inference_duration_secs: inference_duration,
        })
    }
}

/// Parse whisper-cli stdout into plain text.
///
/// Output format (per segment):
/// ```text
/// [00:00:00.000 --> 00:00:05.000]  Hello, world.
/// [00:00:05.500 --> 00:00:10.000]  This is a test.
/// ```
fn parse_whisper_output(stdout: &str) -> String {
    let mut texts = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Find "]" and take everything after it
        if let Some(idx) = line.find(']') {
            let text = line[idx + 1..].trim();
            if !text.is_empty() {
                texts.push(text.to_string());
            }
        } else if !line.starts_with('[') {
            // No timestamp prefix — probably the full text (when not using segment mode)
            texts.push(line.to_string());
        }
    }
    texts.join(" ")
}

fn lang_code_to_name(code: &str) -> &'static str {
    match code.to_lowercase().as_str() {
        "ja" => "Japanese",
        "en" => "English",
        "vi" => "Vietnamese",
        "zh" => "Chinese",
        "ko" => "Korean",
        "fr" => "French",
        "de" => "German",
        "es" => "Spanish",
        "auto" => "auto-detect",
        _ => "Unknown",
    }
}

/// Read WAV file duration from header.
fn read_wav_duration(wav_path: &str) -> Result<f32> {
    let reader = hound::WavReader::open(wav_path)
        .with_context(|| format!("Failed to open WAV: {wav_path}"))?;
    let spec = reader.spec();
    let total_frames = reader.duration() as f32;
    Ok(total_frames / spec.sample_rate as f32)
}

/// Find the whisper-cli.exe binary in the extracted directory tree.
///
/// The whisper.cpp release zip extracts into `binaries/Release/` (capital R).
/// We search a few likely locations to be robust against future zip changes.
fn find_whisper_cli() -> Option<PathBuf> {
    let candidates = [
        Path::new(BINARIES_DIR).join("whisper-cli.exe"),
        Path::new(BINARIES_DIR).join("Release").join("whisper-cli.exe"),
        Path::new(BINARIES_DIR).join("release").join("whisper-cli.exe"),
        Path::new(BINARIES_DIR).join("bin").join("whisper-cli.exe"),
    ];
    candidates.into_iter().find(|p| p.exists())
}

/// Ensure whisper.cpp Windows binary is available. Downloads + extracts on first run.
pub fn ensure_binary() -> Result<PathBuf> {
    // Check if already extracted
    if let Some(path) = find_whisper_cli() {
        info!("✅ whisper-cli found: {}", path.display());
        return Ok(path);
    }

    warn!("⏬ whisper-cli not found, downloading {}...", WHISPER_CPP_ZIP_URL);
    let dir = Path::new(BINARIES_DIR);
    std::fs::create_dir_all(dir).context("Failed to create binaries directory")?;

    let zip_path = dir.join("whisper-bin-x64.zip");
    download_file(WHISPER_CPP_ZIP_URL, &zip_path)?;

    info!("📦 Extracting whisper-bin-x64.zip...");
    extract_zip(&zip_path, dir)?;

    // Clean up zip (best effort)
    let _ = std::fs::remove_file(&zip_path);

    // Find binary after extraction
    let binary_path = find_whisper_cli().ok_or_else(|| {
        anyhow::anyhow!(
            "whisper-cli.exe not found after extraction. Searched in: {}",
            dir.display()
        )
    })?;

    info!("✅ whisper-cli extracted: {}", binary_path.display());
    Ok(binary_path)
}

/// Ensure the Whisper model is available. Downloads from Hugging Face on first run.
pub fn ensure_model(variant: ModelVariant) -> Result<PathBuf> {
    let dir = Path::new(MODELS_DIR);
    if !dir.exists() {
        std::fs::create_dir_all(dir).context("Failed to create models directory")?;
    }
    let model_path = dir.join(variant.filename());

    if model_path.exists() {
        info!("✅ Model {} found: {}", variant.filename(), model_path.display());
        return Ok(model_path);
    }

    warn!(
        "⏬ Model {} not found, downloading (~{}MB)...",
        variant.filename(),
        variant.approximate_size_mb()
    );
    download_file(&variant.download_url(), &model_path)?;
    info!("✅ Model downloaded: {}", model_path.display());
    Ok(model_path)
}

/// Ensure local whisper.cpp + default model. Convenience function.
pub fn ensure_local_whisper() -> Result<WhisperLocal> {
    WhisperLocal::new(ModelVariant::default_mvp())
}

/// Convenience: transcribe a WAV file using the local Whisper (default model).
pub fn transcribe_wav(
    wav_path: &str,
    language: Option<&str>,
) -> Result<TranscriptionResult> {
    let whisper = ensure_local_whisper()?;
    whisper.transcribe(wav_path, language)
}

/// Download a file from URL to a local path. Blocking, with progress logging.
fn download_file(url: &str, dest: &Path) -> Result<()> {
    info!("📥 Downloading: {url}");

    let client = reqwest::blocking::Client::builder()
        .user_agent("sublix/0.1.0")
        .timeout(std::time::Duration::from_secs(600)) // 10 min
        .build()
        .context("Failed to build HTTP client")?;

    let mut response = client
        .get(url)
        .send()
        .context("Failed to send download request")?
        .error_for_status()
        .context("Download request returned error status")?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut dest_file = std::fs::File::create(dest)
        .with_context(|| format!("Failed to create file: {}", dest.display()))?;

    use std::io::{Read, Write};
    let mut buffer = [0u8; 64 * 1024]; // 64KB chunks
    let mut last_log_pct: i32 = -1;

    while let Some(chunk_result) = read_chunk(&mut response, &mut buffer) {
        let bytes_read = chunk_result?;
        if bytes_read == 0 {
            break;
        }
        dest_file.write_all(&buffer[..bytes_read])?;
        downloaded += bytes_read as u64;

        if total_size > 0 {
            let pct = ((downloaded * 100) / total_size) as i32;
            if pct / 10 != last_log_pct / 10 {
                info!(
                    "  ⏳ {}% ({:.1} MB / {:.1} MB)",
                    pct,
                    downloaded as f64 / 1_048_576.0,
                    total_size as f64 / 1_048_576.0
                );
                last_log_pct = pct;
            }
        }
    }

    dest_file.flush()?;
    Ok(())
}

fn read_chunk<R: std::io::Read>(reader: &mut R, buf: &mut [u8]) -> Option<std::io::Result<usize>> {
    Some(reader.read(buf))
}

/// Extract a ZIP file to a destination directory.
fn extract_zip(zip_path: &Path, dest_dir: &Path) -> Result<()> {
    let file = std::fs::File::open(zip_path)
        .with_context(|| format!("Failed to open zip: {}", zip_path.display()))?;
    let mut archive = zip::ZipArchive::new(file).context("Failed to read zip archive")?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let outpath = match entry.enclosed_name() {
            Some(path) => dest_dir.join(path),
            None => continue,
        };

        if entry.is_dir() {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut entry, &mut outfile)?;
        }
    }

    info!("✅ Extracted {} entries to {}", archive.len(), dest_dir.display());
    Ok(())
}
