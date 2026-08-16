//! OpenAI Whisper API client — transcribe WAV file to text.
//!
//! Uses the same Whisper large-v2 model that runs locally with whisper.cpp,
//! but on OpenAI's servers. No LLVM/libclang build dependency needed.
//!
//! API: https://platform.openai.com/docs/guides/speech-to-text
//! Cost: $0.006/minute (~$0.36/hour of audio)
//!
//! Required env var: `OPENAI_API_KEY`
//!
//! Future: M2.5 will add local whisper.cpp for users with LLVM installed.

use anyhow::{Context, Result};
use reqwest::blocking::multipart::{Form, Part};
use serde::Deserialize;
use std::path::Path;
use tracing::info;

/// Result of transcribing a single audio file.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TranscriptionResult {
    /// Full transcript
    pub text: String,
    /// Detected or specified language (e.g. "japanese", "english")
    pub language: String,
    /// Audio duration in seconds (estimated from WAV header)
    pub audio_duration_secs: f32,
}

impl TranscriptionResult {
    pub fn print(&self) {
        println!("\n📝 Transcription ({}):", self.language);
        println!("─────────────────────────────────────");
        println!("{}", self.text);
        println!("─────────────────────────────────────");
        println!("  Audio: {:.1}s", self.audio_duration_secs);
    }
}

/// OpenAI Whisper API response shape.
#[derive(Debug, Deserialize)]
struct WhisperResponse {
    text: String,
    #[serde(default)]
    #[allow(dead_code)]
    language: Option<String>,
}

/// Transcribe a WAV file using OpenAI Whisper API.
///
/// # Arguments
/// - `wav_path`: Path to the WAV file
/// - `api_key`: OpenAI API key (or read from `OPENAI_API_KEY` env var)
/// - `language`: Optional language hint (e.g. "ja", "en"). None = auto-detect.
///
/// # Returns
/// `TranscriptionResult` with text and detected language.
pub fn transcribe_wav(
    wav_path: &str,
    api_key: &str,
    language: Option<&str>,
) -> Result<TranscriptionResult> {
    info!("🎙️ Transcribing: {wav_path}");

    // 1. Get audio duration from WAV header (for reporting)
    let audio_duration_secs = read_wav_duration(wav_path)
        .unwrap_or(0.0);

    // 2. Read file
    let path = Path::new(wav_path);
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("audio.wav");

    let file_bytes = std::fs::read(path)
        .with_context(|| format!("Failed to read WAV file: {wav_path}"))?;
    info!("📦 File size: {:.1} KB", file_bytes.len() as f64 / 1024.0);

    // 3. Build multipart form
    let mut form = Form::new()
        .text("model", "whisper-1")
        .text("response_format", "verbose_json")
        .part(
            "file",
            Part::bytes(file_bytes).file_name(filename.to_string()).mime_str("audio/wav")?,
        );
    if let Some(lang) = language {
        info!("🌐 Language hint: {lang}");
        form = form.text("language", lang.to_string());
    } else {
        info!("🌐 Language: auto-detect");
    }

    // 4. Send request
    info!("⏳ Calling OpenAI Whisper API...");
    let start = std::time::Instant::now();

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .context("Failed to build HTTP client")?;

    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {api_key}"))
        .multipart(form)
        .send()
        .context("Failed to send request to OpenAI")?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().unwrap_or_default();
        return Err(anyhow::anyhow!(
            "OpenAI API returned error {}: {}",
            status,
            error_text
        ));
    }

    let elapsed = start.elapsed();
    info!(
        "✅ API call done in {:.2}s",
        elapsed.as_secs_f32()
    );

    // 5. Parse response
    let resp: WhisperResponse = response
        .json()
        .context("Failed to parse OpenAI API response")?;

    // verbose_json includes "language" but we use simple json which doesn't
    // The API will respect our hint if given, else auto-detect
    let detected_lang = language
        .map(|l| lang_code_to_name(l).to_string())
        .unwrap_or_else(|| "auto-detected".to_string());

    Ok(TranscriptionResult {
        text: resp.text.trim().to_string(),
        language: detected_lang,
        audio_duration_secs,
    })
}

/// Read WAV file duration from its header (no audio decoding needed).
fn read_wav_duration(wav_path: &str) -> Result<f32> {
    let reader = hound::WavReader::open(wav_path)
        .with_context(|| format!("Failed to open WAV: {wav_path}"))?;
    let spec = reader.spec();
    let total_frames = reader.duration() as f32; // hound: total frame count
    let duration = total_frames / spec.sample_rate as f32;
    Ok(duration)
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
        "ru" => "Russian",
        _ => "Unknown",
    }
}

/// Get API key from env var, or return helpful error.
pub fn get_api_key() -> Result<String> {
    std::env::var("OPENAI_API_KEY")
        .ok()
        .filter(|k| !k.is_empty())
        .context("OPENAI_API_KEY environment variable not set. Set it with: $env:OPENAI_API_KEY='sk-...'")
}

#[allow(dead_code)]
fn _suppress_unused_warning(_: &Path) {}
