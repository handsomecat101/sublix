//! Whisper.cpp integration — transcribe WAV file to text.
//!
//! M2 scope: file-based transcription (WAV in → text out).
//! M3 will add: streaming (VAD-triggered chunks), language detection, GPU support.

use anyhow::{Context, Result};
use std::path::Path;
use tracing::{info, warn};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::model::ModelVariant;

/// Result of transcribing a single audio file.
#[derive(Debug, Clone)]
pub struct TranscriptionResult {
    /// Full transcript (all segments joined with spaces)
    pub text: String,
    /// Detected or specified language (e.g. "ja", "en")
    pub language: String,
    /// Number of audio segments detected
    pub num_segments: usize,
    /// Audio duration in seconds (estimated from sample count)
    pub audio_duration_secs: f32,
}

impl TranscriptionResult {
    /// Print the result in a human-readable format.
    pub fn print(&self) {
        println!("\n📝 Transcription ({}):", self.language);
        println!("─────────────────────────────────────");
        println!("{}", self.text);
        println!("─────────────────────────────────────");
        println!(
            "  Audio: {:.1}s | Segments: {}",
            self.audio_duration_secs, self.num_segments
        );
    }
}

/// Transcribe a WAV file using the specified model.
///
/// Handles:
/// - Reading WAV (any format hound supports)
/// - Converting to mono (averaging channels)
/// - Resampling to 16kHz (linear interpolation — fine for STT)
/// - Converting i16 → f32 if needed
/// - Calling Whisper
/// - Joining segments into final text
pub fn transcribe_wav(
    wav_path: &str,
    model_path: &str,
    language: Option<&str>,
) -> Result<TranscriptionResult> {
    info!("🎙️ Transcribing: {wav_path}");
    info!("🤖 Model: {model_path}");

    // 1. Load Whisper model
    let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
        .with_context(|| format!("Failed to load Whisper model from {model_path}"))?;

    // 2. Read WAV file
    let mut reader = hound::WavReader::open(wav_path)
        .with_context(|| format!("Failed to open WAV file: {wav_path}"))?;
    let spec = reader.spec();

    info!(
        "🎚️ WAV: {}Hz, {} ch, {} bits ({:?})",
        spec.sample_rate, spec.channels, spec.bits_per_sample, spec.sample_format
    );

    // 3. Convert to f32 mono
    let samples_mono_16k = read_as_mono_f32_16k(&mut reader, &spec)
        .context("Failed to convert audio to mono 16kHz f32")?;

    let audio_duration_secs = samples_mono_16k.len() as f32 / 16000.0;
    info!(
        "📊 Audio: {} samples ({:.2}s) after conversion to 16kHz mono",
        samples_mono_16k.len(),
        audio_duration_secs
    );

    // 4. Set up Whisper parameters
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    if let Some(lang) = language {
        params.set_language(Some(lang));
        info!("🌐 Language hint: {lang}");
    } else {
        params.set_language(None); // Auto-detect
        info!("🌐 Language: auto-detect");
    }
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_translate(false); // Don't translate; transcribe in source language

    // 5. Run transcription
    info!("⏳ Transcribing (this may take a while on CPU)...");
    let start = std::time::Instant::now();

    let mut state = ctx
        .create_state()
        .context("Failed to create Whisper state")?;
    state
        .full(params, &samples_mono_16k)
        .context("Whisper transcription failed")?;

    let elapsed = start.elapsed();
    info!(
        "✅ Transcription done in {:.2}s ({:.1}x realtime)",
        elapsed.as_secs_f32(),
        audio_duration_secs / elapsed.as_secs_f32()
    );

    // 6. Collect segments
    let num_segments = state
        .full_n_segments()
        .context("Failed to get segment count")? as usize;

    let mut text = String::new();
    for i in 0..num_segments {
        let segment = state
            .full_get_segment_text(i)
            .with_context(|| format!("Failed to get segment {i} text"))?;
        text.push_str(&segment);
        text.push(' ');
    }
    let text = text.trim().to_string();

    // 7. Detect language if not specified
    let detected_lang = state
        .full_lang_id_from_state()
        .ok()
        .and_then(|id| whisper_rs::get_lang_str(id).map(|s| s.to_string()))
        .unwrap_or_else(|| language.unwrap_or("unknown").to_string());

    Ok(TranscriptionResult {
        text,
        language: detected_lang,
        num_segments,
        audio_duration_secs,
    })
}

/// Read a WAV reader and convert to mono f32 samples at 16kHz.
fn read_as_mono_f32_16k<R: std::io::Read>(
    reader: &mut hound::WavReader<R>,
    spec: &hound::WavSpec,
) -> Result<Vec<f32>> {
    let channels = spec.channels as usize;
    let sample_rate = spec.sample_rate;

    // Read raw samples in the WAV's native format
    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<Result<Vec<_>, _>>()
            .context("Failed to read float WAV samples")?,
        hound::SampleFormat::Int => {
            let max = match spec.bits_per_sample {
                16 => i16::MAX as f32,
                24 => 8388607.0,
                32 => i32::MAX as f32,
                n => return Err(anyhow::anyhow!("Unsupported bits per sample: {n}")),
            };
            let mut samples = Vec::new();
            for s in reader.samples::<i32>() {
                let v = s.context("Failed to read int WAV sample")? as f32 / max;
                samples.push(v);
            }
            samples
        }
    };

    info!(
        "  Read {} samples ({} channels × {} Hz, ~{:.2}s)",
        raw.len(),
        channels,
        sample_rate,
        raw.len() as f32 / (channels as f32 * sample_rate as f32)
    );

    // Convert to mono
    let mono: Vec<f32> = if channels == 1 {
        raw
    } else {
        raw.chunks(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect()
    };
    info!("  Mono: {} samples", mono.len());

    // Resample to 16kHz (linear interpolation)
    if sample_rate == 16000 {
        Ok(mono)
    } else {
        let resampled = linear_resample(&mono, sample_rate, 16000);
        info!("  Resampled {} → {} (16kHz)", mono.len(), resampled.len());
        Ok(resampled)
    }
}

/// Linear interpolation resampler. Good enough for STT (Whisper is robust).
/// For production quality, swap with `rubato` crate (sinc interpolation).
fn linear_resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    let ratio = to_rate as f64 / from_rate as f64;
    let new_len = (samples.len() as f64 * ratio) as usize;
    let mut out = Vec::with_capacity(new_len);

    for i in 0..new_len {
        let src_idx = i as f64 / ratio;
        let idx0 = src_idx as usize;
        let idx1 = (idx0 + 1).min(samples.len().saturating_sub(1));
        let frac = (src_idx - idx0 as f64) as f32;
        let s = samples[idx0] * (1.0 - frac) + samples[idx1] * frac;
        out.push(s);
    }
    out
}

/// Helper: try to find the model file for a given variant, or return the path
/// where it would be (caller can use `ensure_model` to download).
pub fn resolve_model_path(variant: ModelVariant) -> Result<std::path::PathBuf> {
    super::model::model_path(variant)
}

/// Helper: ensure model is downloaded, return path.
pub fn ensure_model_for_variant(variant: ModelVariant) -> Result<std::path::PathBuf> {
    super::model::ensure_model(variant)
}

/// Re-export for convenience.
pub use ModelVariant as Variant;

// Avoid unused import warning if user doesn't use `Path`
#[allow(dead_code)]
fn _path_marker(_: &Path) {}
