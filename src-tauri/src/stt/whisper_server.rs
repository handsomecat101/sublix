//! Long-running whisper-server wrapper (HTTP pattern).
//!
//! Binary layout:
//!   binaries/whisper-cuda/whisper-server.exe — CUDA build (NVIDIA GPU, isolated DLLs)
//!   binaries/cuda/whisper-server.exe         — CUDA fallback path
//!   binaries/Release/whisper-server.exe      — CPU build (fallback)
//!
//! Server API (whisper.cpp v1.7+):
//!   GET  /health                              → 200 OK when ready
//!   POST /inference  (multipart file=audio)   → JSON { text: "..." }

use anyhow::{anyhow, Context, Result};
use reqwest::blocking::{multipart, Client};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::{info, warn};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use super::whisper_local::{clean_whisper_transcript, ensure_model, ModelVariant, SttEngine};

const SERVER_PORT: u16 = 11436;
const SERVER_URL: &str = "http://127.0.0.1:11436";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
const HEALTHCHECK_INTERVAL: Duration = Duration::from_millis(300);
const TRANSCRIBE_TIMEOUT: Duration = Duration::from_secs(45);

/// User's engine preference. Drives which binary we try to start.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnginePreference {
    /// Try CUDA first, fall back to CPU if CUDA binary missing.
    Auto,
    /// Force CPU. Fail if CPU binary missing.
    Cpu,
    /// Force CUDA. Fail if CUDA binary missing (no fallback).
    Cuda,
}

impl EnginePreference {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().trim() {
            "cpu" => Self::Cpu,
            "cuda" | "gpu" => Self::Cuda,
            _ => Self::Auto,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Cpu => "cpu",
            Self::Cuda => "cuda",
        }
    }
}

/// Long-running whisper-server wrapper.
pub struct WhisperServer {
    child: Child,
    engine: SttEngine,
    model: ModelVariant,
}

impl WhisperServer {
    pub fn start(model: ModelVariant, pref: EnginePreference) -> Result<Self> {
        let model_path = ensure_model(model)?;

        match pref {
            EnginePreference::Cpu => {
                info!("🎛️  STT preference: CPU (model={})", model.name());
                Self::start_with_engine(&model_path, model, SttEngine::Cpu)
                    .context("CPU whisper-server binary missing")
            }
            EnginePreference::Cuda => {
                info!("🎛️  STT preference: GPU CUDA (model={})", model.name());
                Self::start_with_engine(&model_path, model, SttEngine::Cuda)
                    .context("CUDA whisper-server failed to start")
            }
            EnginePreference::Auto => {
                info!("🎛️  STT preference: Auto (try CUDA → CPU, model={})", model.name());
                if let Ok(s) = Self::start_with_engine(&model_path, model, SttEngine::Cuda) {
                    return Ok(s);
                }
                warn!("⚠️  CUDA whisper-server not available, falling back to CPU");
                Self::start_with_engine(&model_path, model, SttEngine::Cpu)
                    .context("No whisper-server binary found (neither CUDA nor CPU)")
            }
        }
    }

    fn start_with_engine(
        model_path: &Path,
        model: ModelVariant,
        engine: SttEngine,
    ) -> Result<Self> {
        let binary = find_server_binary(engine)
            .with_context(|| format!("No {} whisper-server binary found", engine.as_str()))?;
        info!(
            "📦 Spawning whisper-server: {} (model: {}, engine: {})",
            binary.display(),
            model_path.display(),
            engine.as_str()
        );

        kill_existing_server();

        let mut cmd = Command::new(&binary);
        if let Some(bin_dir) = binary.parent() {
            cmd.current_dir(bin_dir);
        }
        cmd.arg("-m")
            .arg(model_path)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(SERVER_PORT.to_string());
        if engine == SttEngine::Cpu {
            cmd.arg("-ng");
        }
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .with_context(|| format!("Failed to spawn whisper-server at {}", binary.display()))?;

        let started = Instant::now();
        let client = Client::builder()
            .timeout(Duration::from_secs(3))
            .build()?;
        loop {
            if let Ok(Some(exit_status)) = child.try_wait() {
                return Err(anyhow!(
                    "whisper-server exited immediately with status: {exit_status}"
                ));
            }

            if let Ok(resp) = client.get(format!("{}/health", SERVER_URL)).send() {
                if resp.status().is_success() {
                    info!(
                        "✅ whisper-server ready in {:.1}s ({}, model={})",
                        started.elapsed().as_secs_f32(),
                        engine.as_str(),
                        model.name()
                    );
                    return Ok(Self {
                        child,
                        engine,
                        model,
                    });
                }
            }

            if started.elapsed() > STARTUP_TIMEOUT {
                let _ = child.kill();
                return Err(anyhow!(
                    "whisper-server did not become ready in {}s",
                    STARTUP_TIMEOUT.as_secs()
                ));
            }
            std::thread::sleep(HEALTHCHECK_INTERVAL);
        }
    }

    pub fn transcribe(
        &self,
        wav_path: &str,
        language: Option<&str>,
    ) -> Result<super::TranscriptionResult> {
        let wav_path_p = Path::new(wav_path);
        if !wav_path_p.exists() {
            return Err(anyhow!("WAV file not found: {}", wav_path));
        }

        let t0 = Instant::now();

        // Resample to 16kHz mono if not already 16kHz mono
        let (send_path, is_temp) = ensure_16k_mono(wav_path)?;
        let audio_duration = read_wav_duration(wav_path).unwrap_or(0.0);

        let lang = language.unwrap_or("auto");
        let form = multipart::Form::new()
            .file("file", &send_path)
            .with_context(|| format!("Failed to attach WAV: {}", send_path.display()))?
            .text("language", lang.to_string())
            .text("response_format", "json")
            .text("temperature", "0");

        let client = Client::builder()
            .timeout(TRANSCRIBE_TIMEOUT)
            .build()?;
        let resp = client
            .post(format!("{}/inference", SERVER_URL))
            .multipart(form)
            .send()
            .context("HTTP POST to whisper-server failed")?;

        if is_temp {
            let _ = std::fs::remove_file(&send_path);
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!("whisper-server returned {}: {}", status, body));
        }

        let body: InferenceResponse = resp
            .json()
            .context("Failed to parse whisper-server response")?;

        let cleaned_text = clean_whisper_transcript(&body.text);
        let total_elapsed = t0.elapsed();

        info!(
            "🎙️ STT ({}, {}): {:.2}s ({:.1}x RT) → '{}'",
            self.engine.as_str(),
            self.model.name(),
            total_elapsed.as_secs_f32(),
            if total_elapsed.as_secs_f32() > 0.01 {
                audio_duration / total_elapsed.as_secs_f32()
            } else {
                0.0
            },
            cleaned_text.chars().take(80).collect::<String>()
        );

        Ok(super::TranscriptionResult {
            text: cleaned_text,
            language: lang.to_string(),
            model: self.model.filename().to_string(),
            audio_duration_secs: audio_duration,
            inference_duration_secs: total_elapsed.as_secs_f32(),
        })
    }

    pub fn engine(&self) -> SttEngine {
        self.engine
    }

    pub fn model(&self) -> ModelVariant {
        self.model
    }

    pub fn stop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        kill_existing_server();
        info!("🛑 whisper-server stopped");
    }
}

impl Drop for WhisperServer {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Deserialize)]
struct InferenceResponse {
    text: String,
}

fn find_server_binary(engine: SttEngine) -> Result<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates: Vec<PathBuf> = match engine {
        SttEngine::Cuda => vec![
            manifest_dir
                .join("binaries")
                .join("whisper-cuda")
                .join("whisper-server.exe"),
            manifest_dir
                .join("binaries")
                .join("cuda")
                .join("whisper-server.exe"),
        ],
        SttEngine::Cpu => vec![
            manifest_dir
                .join("binaries")
                .join("Release")
                .join("whisper-server.exe"),
            manifest_dir
                .join("binaries")
                .join("whisper-server.exe"),
        ],
    };
    if let Some(found) = candidates.into_iter().find(|p| p.exists()) {
        return Ok(found);
    }
    Err(anyhow!("{} whisper-server.exe not found", engine.as_str()))
}

fn kill_existing_server() {
    let mut cmd = Command::new("taskkill");
    cmd.args(["/IM", "whisper-server.exe", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.output();
}

/// If the WAV file is already 16kHz mono, use it directly without rewriting!
/// Otherwise resample to 16kHz mono float32 in a temp file.
fn ensure_16k_mono(wav_path: &str) -> Result<(PathBuf, bool)> {
    let reader = hound::WavReader::open(wav_path)
        .with_context(|| format!("Failed to open WAV: {wav_path}"))?;
    let spec = reader.spec();
    if spec.sample_rate == 16000 && spec.channels == 1 {
        return Ok((PathBuf::from(wav_path), false));
    }
    let target_sr = 16000u32;
    let channels_in = spec.channels as usize;

    let mono: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => {
            let raw: Vec<f32> = reader
                .into_samples::<f32>()
                .map(|s| s.unwrap_or(0.0))
                .collect();
            average_channels(&raw, channels_in)
        }
        hound::SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample as i64 - 1)) as f32;
            let raw: Vec<f32> = reader
                .into_samples::<i32>()
                .map(|s| s.unwrap_or(0) as f32 / max)
                .collect();
            average_channels(&raw, channels_in)
        }
    };

    let resampled = linear_resample(&mono, spec.sample_rate, target_sr);

    let temp_path = std::env::temp_dir().join(format!(
        "sublix-stt-{}-{}.wav",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    let mut writer = hound::WavWriter::create(
        &temp_path,
        hound::WavSpec {
            channels: 1,
            sample_rate: target_sr,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        },
    )?;
    for &s in &resampled {
        writer.write_sample(s)?;
    }
    writer.finalize()?;
    Ok((temp_path, true))
}

fn average_channels(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let mut mono = Vec::with_capacity(samples.len() / channels);
    for chunk in samples.chunks(channels) {
        let sum: f32 = chunk.iter().sum();
        mono.push(sum / channels as f32);
    }
    mono
}

fn linear_resample(input: &[f32], from_sr: u32, to_sr: u32) -> Vec<f32> {
    if from_sr == to_sr || input.is_empty() {
        return input.to_vec();
    }
    let ratio = to_sr as f64 / from_sr as f64;
    let new_len = (input.len() as f64 * ratio) as usize;
    let mut out = Vec::with_capacity(new_len);
    let last = input.len() - 1;
    for i in 0..new_len {
        let src_idx = i as f64 / ratio;
        let idx0 = src_idx.floor() as usize;
        let idx1 = (idx0 + 1).min(last);
        let t = src_idx - idx0 as f64;
        let s = input[idx0] as f64 * (1.0 - t) + input[idx1] as f64 * t;
        out.push(s as f32);
    }
    out
}

fn read_wav_duration(wav_path: &str) -> Result<f32> {
    let reader = hound::WavReader::open(wav_path)?;
    let spec = reader.spec();
    Ok(reader.duration() as f32 / spec.sample_rate as f32)
}

// === Shared global server instance (supports hot-swapping model & engine!) ===

static STT_SERVER: Mutex<Option<WhisperServer>> = Mutex::new(None);

fn matches_pref(actual: SttEngine, pref: EnginePreference) -> bool {
    match pref {
        EnginePreference::Auto => true,
        EnginePreference::Cpu => actual == SttEngine::Cpu,
        EnginePreference::Cuda => actual == SttEngine::Cuda,
    }
}

/// Ensure the STT server is running with the requested model and engine preference.
/// Hot-restarts the server automatically if model or engine preference changed!
pub fn preload_server(model: ModelVariant, pref: EnginePreference) -> Result<String, String> {
    let mut guard = STT_SERVER.lock().map_err(|e| e.to_string())?;
    if let Some(ref existing) = *guard {
        if existing.model() == model && matches_pref(existing.engine(), pref) {
            return Ok(existing.engine().as_str().to_string());
        }
        info!(
            "🔄 Restarting whisper-server for new settings (model={} → {}, pref={})",
            existing.model().name(),
            model.name(),
            pref.as_str()
        );
    }
    // Drop old server if any (stops child process)
    *guard = None;
    let server = WhisperServer::start(model, pref).map_err(|e| format!("{e:#}"))?;
    let eng = server.engine().as_str().to_string();
    *guard = Some(server);
    Ok(eng)
}

/// Transcribe via the shared `WhisperServer`. Starts or hot-swaps server if needed.
pub fn transcribe_via_server(
    wav_path: &str,
    language: Option<&str>,
    model: ModelVariant,
    pref: EnginePreference,
) -> Result<super::TranscriptionResult> {
    let mut guard = STT_SERVER
        .lock()
        .map_err(|e| anyhow!("STT server mutex poisoned: {e}"))?;

    let needs_restart = match *guard {
        Some(ref s) => s.model() != model || !matches_pref(s.engine(), pref),
        None => true,
    };

    if needs_restart {
        *guard = None;
        let server = WhisperServer::start(model, pref)?;
        *guard = Some(server);
    }

    let server = guard.as_ref().expect("server just initialized");
    server.transcribe(wav_path, language)
}

/// Get the current engine ("cuda" or "cpu") if the server is currently running.
pub fn current_engine() -> Option<SttEngine> {
    STT_SERVER
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|s| s.engine()))
}

/// Get the model variant currently loaded in the running STT server.
pub fn current_model() -> Option<ModelVariant> {
    STT_SERVER
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|s| s.model()))
}
