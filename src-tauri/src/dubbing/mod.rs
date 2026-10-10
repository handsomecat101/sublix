//! Sublix AI Dubbing Studio — Automated Multi-Speaker Diarization, Cinematic Scripting, and Voice Dubbing.
//!
//! Workflow:
//! 1. `dubbing_pick_media_file`: Native file dialog to select video or audio.
//! 2. `dubbing_analyze`: Extracts audio via FFmpeg, runs Whisper STT with word/segment timestamps,
//!    performs Speaker Diarization (clustering turns into Speaker 1, Speaker 2,...), and translates
//!    dialogue to cinematic Vietnamese using MiniMax-M3 / Ollama 27B.
//! 3. `dubbing_preview_tts`: Synthesizes single line via neural TTS, returning base64 audio data URI for instant UI preview.
//! 4. `dubbing_export`: Synthesizes all dialogue lines, time-stretches them with FFmpeg `atempo` to match video timing,
//!    and remuxes video + ducked BGM + dubbed voices into a final dubbed video.

use anyhow::{Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static CURRENT_GENERATION: AtomicU64 = AtomicU64::new(0);
static CANCELLED_GENERATION: AtomicU64 = AtomicU64::new(0);
static ACTIVE_CHILD_PID: AtomicU32 = AtomicU32::new(0);

/// Start a new dubbing run, advancing generation counter and clearing any active child PID.
pub fn start_new_generation() -> u64 {
    let old = CURRENT_GENERATION.load(Ordering::SeqCst);
    if old > 0 {
        CANCELLED_GENERATION.store(old, Ordering::SeqCst);
        kill_active_child();
    }
    CURRENT_GENERATION.fetch_add(1, Ordering::SeqCst) + 1
}

pub fn is_generation_cancelled(gen: u64) -> bool {
    if gen == 0 {
        return false;
    }
    let cancelled = CANCELLED_GENERATION.load(Ordering::Relaxed);
    cancelled >= gen
}

pub fn cancel_dubbing() {
    let cur = CURRENT_GENERATION.load(Ordering::SeqCst);
    CANCELLED_GENERATION.store(cur, Ordering::SeqCst);
    kill_active_child();
}

pub fn is_dubbing_cancelled() -> bool {
    let cur = CURRENT_GENERATION.load(Ordering::Relaxed);
    if cur == 0 {
        return false;
    }
    CANCELLED_GENERATION.load(Ordering::Relaxed) >= cur
}

pub fn reset_dubbing_cancel() {
    start_new_generation();
}

pub fn kill_active_child() {
    let pid = ACTIVE_CHILD_PID.swap(0, Ordering::SeqCst);
    if pid > 0 {
        #[cfg(windows)]
        {
            use std::process::Command;
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
        }
        #[cfg(not(windows))]
        {
            let _ = std::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .status();
        }
    }
}

/// Execute a child process while observing cancellation generation and PID termination.
pub fn run_child_with_cancel(mut cmd: Command, gen: u64) -> Result<std::process::ExitStatus> {
    if is_generation_cancelled(gen) {
        return Err(anyhow::anyhow!("Đã dừng tiến trình theo yêu cầu của bạn."));
    }
    let mut child = cmd.spawn().context("Không thể khởi chạy tiến trình con")?;
    let pid = child.id();
    if gen > 0 {
        ACTIVE_CHILD_PID.store(pid, Ordering::SeqCst);
    }

    loop {
        if is_generation_cancelled(gen) {
            if gen > 0 {
                ACTIVE_CHILD_PID.store(0, Ordering::SeqCst);
            }
            #[cfg(windows)]
            {
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .creation_flags(CREATE_NO_WINDOW)
                    .status();
            }
            #[cfg(not(windows))]
            {
                let _ = std::process::Command::new("kill")
                    .args(["-9", &pid.to_string()])
                    .status();
            }
            let _ = child.wait();
            return Err(anyhow::anyhow!("Đã dừng tiến trình theo yêu cầu của bạn."));
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                if gen > 0 {
                    ACTIVE_CHILD_PID.store(0, Ordering::SeqCst);
                }
                return Ok(status);
            }
            Ok(None) => {
                std::thread::sleep(std::time::Duration::from_millis(150));
            }
            Err(e) => {
                if gen > 0 {
                    ACTIVE_CHILD_PID.store(0, Ordering::SeqCst);
                }
                return Err(anyhow::anyhow!("Lỗi kiểm tra tiến trình con: {}", e));
            }
        }
    }
}

use crate::config::AppConfig;
use crate::stt::whisper_local::ModelVariant;
use crate::stt::EnginePreference;
use crate::translate::TranslationModelVariant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoicePreset {
    pub id: String,
    pub name: String,
    pub gender: String, // "male" | "female"
    pub lang: String,   // "vi" | "en" | "ja" | "zh" | "ko"
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DubbingSpeaker {
    pub id: String,    // e.g. "speaker_0", "speaker_1"
    pub label: String, // e.g. "Người nói 1 (Nam)", "Người nói 2 (Nữ)"
    pub voice: String, // e.g. "vi-VN-NamMinhNeural"
    pub pitch: String, // "+0Hz"
    pub rate: String,  // "+0%"
    /// v0.9.10: "male" | "female" — saved from LLM response so downstream
    /// voice re-assignment (test_dubbing_srt.rs etc.) can keep each speaker's
    /// voice consistent across re-runs instead of guessing idx % 2.
    /// `#[serde(default)]` keeps backward compat with older saved projects.
    #[serde(default)]
    pub gender: String,
    /// v0.10.0: Base64 Data URI of a 2-8s original audio clip of this speaker for UI preview.
    #[serde(default)]
    pub sample_audio_data: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DubbingSegment {
    pub id: usize,
    pub speaker_id: String,
    pub start_sec: f64,
    pub end_sec: f64,
    pub original_text: String,
    pub dubbed_text: String,
    pub audio_duration_sec: Option<f64>,
    pub status: String, // "ready" | "previewed" | "rendered"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilmstripThumb {
    pub time_sec: f64,
    pub data_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaPreviewPayload {
    pub peaks: Vec<f32>,
    pub filmstrip_thumbs: Vec<FilmstripThumb>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DubbingProject {
    pub input_path: String,
    pub media_duration_sec: f64,
    pub speakers: Vec<DubbingSpeaker>,
    pub segments: Vec<DubbingSegment>,
    pub bgm_volume: f32,   // 0.25 (25% volume ducking)
    pub voice_volume: f32, // 1.25 (125% voice boost)
    #[serde(default = "default_dubbing_mode")]
    pub dubbing_mode: String, // "ducking" | "vocal_isolation"
    #[serde(default)]
    pub time_limit_sec: Option<f64>,
    /// v0.10.0: "sherpa" | "heuristic" | "minimax"
    #[serde(default)]
    pub diarization_engine: Option<String>,
    #[serde(default)]
    pub peaks: Option<Vec<f32>>,
    #[serde(default)]
    pub filmstrip_thumbs: Option<Vec<FilmstripThumb>>,
}

fn default_dubbing_mode() -> String {
    "ducking".to_string()
}

#[derive(Debug, Clone, Serialize)]
pub struct DubbingProgress {
    pub stage: String, // "extracting" | "transcribing" | "diarizing" | "scripting" | "synthesizing" | "remuxing" | "done"
    pub percent: f32,
    pub message: String,
    pub current_item: usize,
    pub total_items: usize,
}

/// Helper to generate timestamp unique id
fn gen_unique_id() -> u128 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Helper to find ffmpeg executable
pub fn find_ffmpeg() -> PathBuf {
    let p = PathBuf::from(r"C:\Program Files\AI Automation\bin\ffmpeg.exe");
    if p.exists() {
        return p;
    }
    PathBuf::from("ffmpeg")
}

/// Helper to find edge-tts executable
pub fn find_edge_tts() -> PathBuf {
    if let Ok(app_data) = std::env::var("APPDATA") {
        let p_user = PathBuf::from(format!(r"{}\Python\Python313\Scripts\edge-tts.exe", app_data));
        if p_user.exists() {
            return p_user;
        }
    }
    let p313 = PathBuf::from(r"C:\Program Files\Python313\Scripts\edge-tts.exe");
    if p313.exists() {
        return p313;
    }
    PathBuf::from("edge-tts")
}

// ===========================================================================
// Kokoro-Vietnamese — LOCAL, OFFLINE TTS engine (Edge-TTS is only a fallback).
// The ONNX model files live in `models/voice/kokoro-vi/`. Inference runs via a
// tiny Python sidecar (onnxruntime + vig2p) that is embedded in the binary so
// a packaged build always carries it.
// ===========================================================================

/// Embedded Kokoro sidecar script. Written to disk on first use.
const KOKORO_TTS_SCRIPT: &str = include_str!("../../scripts/kokoro_vi_tts.py");

/// Prefix used in voice ids / speaker.voice to select the local Kokoro engine.
pub const KOKORO_VOICE_PREFIX: &str = "kokoro:";

/// Helper to find a usable python interpreter for the Kokoro sidecar.
pub fn find_python() -> PathBuf {
    if let Ok(app_data) = std::env::var("APPDATA") {
        let p = PathBuf::from(format!(r"{}\Python\Python313\python.exe", app_data));
        if p.exists() {
            return p;
        }
    }
    for cand in [
        r"C:\Program Files\Python313\python.exe",
        r"C:\Program Files\Python312\python.exe",
        r"C:\Program Files\Python311\python.exe",
    ] {
        let pb = PathBuf::from(cand);
        if pb.exists() {
            return pb;
        }
    }
    PathBuf::from("python")
}

/// Directory holding the Kokoro-Vietnamese artifacts.
pub fn kokoro_model_dir() -> PathBuf {
    crate::config::app_base_dir()
        .join("models")
        .join("voice")
        .join("kokoro-vi")
}

/// True when the local Kokoro model is fully present on disk.
pub fn kokoro_available() -> bool {
    let dir = kokoro_model_dir();
    dir.join("kokoro_vi.onnx").exists()
        && dir.join("config.json").exists()
        && (dir.join("kokoro_vi_voicepack.pt").exists()
            || dir.join("voicepacks").join("diem_trinh.pt").exists())
}

/// Write the embedded sidecar to the app's scripts dir (idempotent) and return it.
fn ensure_kokoro_script() -> Result<PathBuf> {
    let dir = crate::config::app_base_dir().join("scripts");
    fs::create_dir_all(&dir).with_context(|| format!("Tạo thư mục {}", dir.display()))?;
    let path = dir.join("kokoro_vi_tts.py");
    let needs_write = match fs::read_to_string(&path) {
        Ok(existing) => existing != KOKORO_TTS_SCRIPT,
        Err(_) => true,
    };
    if needs_write {
        fs::write(&path, KOKORO_TTS_SCRIPT)
            .with_context(|| format!("Ghi sidecar vào {}", path.display()))?;
    }
    Ok(path)
}

// ===========================================================================
// Sherpa-ONNX — LOCAL, OFFLINE Diarization sidecar (pyannote + wespeaker).
// Models live in `models/voice/sherpa-diarization/`.
// ===========================================================================

/// Embedded Sherpa Diarization sidecar script. Written to disk on first use.
const SHERPA_DIARIZE_SCRIPT: &str = include_str!("../../scripts/sherpa_diarize.py");

/// Directory holding the Sherpa Diarization artifacts.
pub fn sherpa_model_dir() -> PathBuf {
    let base = crate::config::app_base_dir();
    let candidates = [
        base.join("models").join("voice").join("sherpa-diarization"),
        base.join("models").join("voice").join("_sherpa-diarization"),
        base.join("src-tauri").join("models").join("voice").join("sherpa-diarization"),
        base.join("src-tauri").join("models").join("voice").join("_sherpa-diarization"),
    ];
    for cand in &candidates {
        if cand.exists() {
            return cand.clone();
        }
    }
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let p1 = parent.join("models").join("voice").join("sherpa-diarization");
            if p1.exists() {
                return p1;
            }
            let p2 = parent.join("models").join("voice").join("_sherpa-diarization");
            if p2.exists() {
                return p2;
            }
        }
    }
    candidates[0].clone()
}

/// True when the local Sherpa Diarization models are present on disk.
pub fn sherpa_available() -> bool {
    let dir = sherpa_model_dir();
    (dir.join("sherpa-onnx-pyannote-segmentation-3-0").join("model.onnx").exists()
        || dir.join("sherpa-onnx-pyannote-segmentation-3-0").join("model.int8.onnx").exists()
        || dir.join("model.onnx").exists()
        || dir.join("model.int8.onnx").exists())
        && dir.join("wespeaker_en_voxceleb_resnet34_LM.onnx").exists()
}

/// Write the embedded Sherpa diarization sidecar to the app's scripts dir (idempotent) and return it.
pub fn ensure_sherpa_script() -> Result<PathBuf> {
    let dir = crate::config::app_base_dir().join("scripts");
    fs::create_dir_all(&dir).with_context(|| format!("Tạo thư mục {}", dir.display()))?;
    let path = dir.join("sherpa_diarize.py");
    let needs_write = match fs::read_to_string(&path) {
        Ok(existing) => existing != SHERPA_DIARIZE_SCRIPT,
        Err(_) => true,
    };
    if needs_write {
        fs::write(&path, SHERPA_DIARIZE_SCRIPT)
            .with_context(|| format!("Ghi sidecar vào {}", path.display()))?;
    }
    Ok(path)
}

#[derive(Debug, Clone, Deserialize)]
pub struct SherpaSegment {
    pub start: f64,
    pub end: f64,
    pub speaker: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SherpaDiarizeResult {
    pub num_speakers: usize,
    pub num_segments: usize,
    pub segments: Vec<SherpaSegment>,
}

pub fn run_sherpa_diarization(
    wav_path: &Path,
    temp_dir: &Path,
    my_gen: u64,
    expected_speakers: Option<usize>,
) -> Result<Vec<SherpaSegment>> {
    if !sherpa_available() {
        anyhow::bail!("Chưa có model sherpa-diarization offline");
    }
    let script_path = ensure_sherpa_script()?;
    let python = find_python();
    let model_dir = sherpa_model_dir();
    let out_json = temp_dir.join(format!("diarize_{}.json", gen_unique_id()));

    let mut cmd = Command::new(&python);
    cmd.arg(&script_path)
        .arg("--wav")
        .arg(wav_path)
        .arg("--model-dir")
        .arg(&model_dir)
        .arg("--threshold")
        .arg("0.45")
        .arg("--out")
        .arg(&out_json);

    if let Some(n) = expected_speakers {
        if n > 0 {
            cmd.arg("--num-speakers").arg(n.to_string());
        }
    }

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = run_child_with_cancel(cmd, my_gen)
        .with_context(|| "Lỗi thực thi sidecar sherpa-diarize")?;

    if !status.success() || !out_json.exists() {
        let _ = fs::remove_file(&out_json);
        anyhow::bail!("Sherpa diarization sidecar thất bại hoặc không tạo được file JSON");
    }

    let json_content = fs::read_to_string(&out_json).context("Đọc kết quả diarization JSON")?;
    let _ = fs::remove_file(&out_json);

    let res: SherpaDiarizeResult = serde_json::from_str(&json_content)
        .context("Parse JSON kết quả diarization")?;

    Ok(res.segments)
}

/// Extract a short 2-8 second audio sample clip of a speaker from the audio track as Base64 Data URI
pub fn extract_speaker_sample_clip(
    ffmpeg_bin: &Path,
    wav_path: &Path,
    start_sec: f64,
    duration_sec: f64,
    out_wav: &Path,
) -> Result<String> {
    let mut cmd = Command::new(ffmpeg_bin);
    cmd.arg("-y")
        .arg("-ss")
        .arg(format!("{:.3}", start_sec.max(0.0)))
        .arg("-t")
        .arg(format!("{:.3}", duration_sec.clamp(1.5, 7.0)))
        .arg("-i")
        .arg(wav_path)
        .arg("-c:a")
        .arg("pcm_s16le")
        .arg(out_wav);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let st = cmd.status().context("FFmpeg cắt sample clip thất bại")?;
    if !st.success() || !out_wav.exists() {
        anyhow::bail!("Cắt sample clip không thành công");
    }

    let bytes = fs::read(out_wav)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:audio/wav;base64,{b64}"))
}

/// Extract normalized audio peaks (0.0 to 1.0) from a 16kHz 16-bit mono PCM wav file.
/// Silence is strictly 0.0 (flat line).
/// R3-08: Parses RIFF chunk hierarchy dynamically to locate the "data" subchunk.
/// R5-08: Also parses the "fmt " subchunk to get num_channels + bits_per_sample,
/// so peaks are extracted correctly for stereo / 24-bit / 32-bit-float WAV (not just
/// the old 16-bit-mono assumption). Falls back to old behaviour if fmt is missing
/// or has an unsupported format.
pub fn extract_audio_peaks(wav_path: &Path, num_peaks: usize) -> Result<Vec<f32>> {
    let mut file = fs::File::open(wav_path)?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)?;

    if buf.len() < 12 || &buf[0..4] != b"RIFF" || &buf[8..12] != b"WAVE" {
        return Ok(Vec::new());
    }

    // Traverse RIFF subchunks. R5-08: also capture "fmt " to learn channels + bit depth.
    let mut pos = 12;
    let mut data_start = None;
    let mut data_len = 0;
    let mut fmt_channels: u16 = 1;
    let mut fmt_bits: u16 = 16;
    let mut fmt_format: u16 = 1; // 1 = PCM, 3 = IEEE float

    while pos + 8 <= buf.len() {
        let chunk_id = &buf[pos..pos + 4];
        let chunk_size = u32::from_le_bytes(buf[pos + 4..pos + 8].try_into().unwrap_or([0; 4])) as usize;
        pos += 8;

        if chunk_id == b"fmt " && chunk_size >= 16 && pos + 16 <= buf.len() {
            // WAVEFORMATEX: audio_format(2) + channels(2) + sample_rate(4) + byte_rate(4) + block_align(2) + bits_per_sample(2)
            fmt_format = u16::from_le_bytes([buf[pos], buf[pos + 1]]);
            fmt_channels = u16::from_le_bytes([buf[pos + 2], buf[pos + 3]]).max(1);
            fmt_bits = u16::from_le_bytes([buf[pos + 14], buf[pos + 15]]);
        }

        if chunk_id == b"data" {
            data_start = Some(pos);
            data_len = chunk_size.min(buf.len().saturating_sub(pos));
            break;
        }

        pos = pos.saturating_add(chunk_size);
        if chunk_size % 2 != 0 {
            pos = pos.saturating_add(1);
        }
    }

    let (start, len) = match data_start {
        Some(s) => (s, data_len),
        None => {
            // Fallback for standard 44-byte header
            if buf.len() > 44 {
                (44, buf.len() - 44)
            } else {
                return Ok(Vec::new());
            }
        }
    };

    let pcm_bytes = &buf[start..start + len];

    // R5-08: support 16-bit PCM (most common), 24-bit PCM, 32-bit PCM/float, 8-bit PCM.
    // Stereo: take max(|L|, |R|) per frame.
    let channels = fmt_channels.clamp(1, 2) as usize;
    let (bytes_per_sample, decode_sample) = match (fmt_format, fmt_bits) {
        (1, 16) => (2usize, "pcm16"),
        (1, 24) => (3usize, "pcm24"),
        (1, 32) => (4usize, "pcm32"),
        (3, 32) => (4usize, "float32"),
        (1, 8) => (1usize, "pcm8"),
        _ => (2usize, "pcm16"), // unsupported → assume 16-bit (R3-08 fallback)
    };

    let frame_bytes = bytes_per_sample * channels;
    if frame_bytes == 0 {
        return Ok(Vec::new());
    }
    let frame_count = pcm_bytes.len() / frame_bytes;
    if frame_count == 0 {
        return Ok(Vec::new());
    }

    let peaks_count = num_peaks.clamp(50, 1000);
    let chunk_size = (frame_count / peaks_count).max(1);
    let mut peaks = Vec::with_capacity(peaks_count);

    let decode_frame_peak = |frame_byte_start: usize| -> f32 {
        let mut max_abs = 0.0f32;
        for ch in 0..channels {
            let b = frame_byte_start + ch * bytes_per_sample;
            if b + bytes_per_sample > pcm_bytes.len() {
                continue;
            }
            let abs_val: f32 = match decode_sample {
                "pcm16" => {
                    let s = i16::from_le_bytes([pcm_bytes[b], pcm_bytes[b + 1]]);
                    (s as f32).abs() / 32768.0
                }
                "pcm24" => {
                    // 24-bit signed little-endian → i32
                    let b0 = pcm_bytes[b] as i32;
                    let b1 = pcm_bytes[b + 1] as i32;
                    let b2 = pcm_bytes[b + 2] as i32;
                    let raw = (b2 << 16) | (b1 << 8) | b0;
                    // Sign-extend from 24-bit
                    let signed = if raw & 0x800000 != 0 { raw | !0xFFFFFF } else { raw };
                    (signed as f32).abs() / 8388608.0
                }
                "pcm32" => {
                    let s = i32::from_le_bytes([
                        pcm_bytes[b],
                        pcm_bytes[b + 1],
                        pcm_bytes[b + 2],
                        pcm_bytes[b + 3],
                    ]);
                    (s as f32).abs() / 2147483648.0
                }
                "float32" => {
                    let s = f32::from_le_bytes([
                        pcm_bytes[b],
                        pcm_bytes[b + 1],
                        pcm_bytes[b + 2],
                        pcm_bytes[b + 3],
                    ]);
                    s.abs()
                }
                "pcm8" => {
                    // 8-bit WAV is UNSIGNED (0..255, 128 = silence)
                    let s = (pcm_bytes[b] as i16) - 128;
                    (s as f32).abs() / 128.0
                }
                _ => 0.0,
            };
            if abs_val > max_abs {
                max_abs = abs_val;
            }
        }
        max_abs
    };

    for chunk_idx in 0..peaks_count {
        let start_frame = chunk_idx * chunk_size;
        let end_frame = (start_frame + chunk_size).min(frame_count);
        if start_frame >= frame_count {
            peaks.push(0.0);
            continue;
        }

        let mut max_peak = 0.0f32;
        for f in start_frame..end_frame {
            let p = decode_frame_peak(f * frame_bytes);
            if p > max_peak {
                max_peak = p;
            }
        }

        if max_peak < 0.015 {
            peaks.push(0.0);
        } else {
            peaks.push(max_peak);
        }
    }

    Ok(peaks)
}

/// Extract video thumbnail frames across the media duration as base64 JPEG data URIs
pub fn extract_filmstrip_thumbnails(
    ffmpeg_bin: &Path,
    video_path: &Path,
    duration_sec: f64,
    count: usize,
    my_gen: u64,
) -> Result<Vec<FilmstripThumb>> {
    if duration_sec <= 0.0 || count == 0 {
        return Ok(Vec::new());
    }

    let temp_dir = std::env::temp_dir().join(format!("sublix_thumbs_{}", gen_unique_id()));
    let _ = fs::create_dir_all(&temp_dir);

    let num_thumbs = count.clamp(4, 16);
    let interval = (duration_sec / num_thumbs as f64).max(1.0);

    let out_pattern = temp_dir.join("thumb_%03d.jpg");
    let mut cmd = Command::new(ffmpeg_bin);
    cmd.arg("-y")
        .arg("-i")
        .arg(video_path)
        .arg("-vf")
        .arg(format!("fps=1/{interval:.3},scale=120:68:force_original_aspect_ratio=decrease"))
        .arg("-q:v")
        .arg("5")
        .arg(&out_pattern);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = run_child_with_cancel(cmd, my_gen)?;
    if !status.success() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Ok(Vec::new());
    }

    let mut thumbs = Vec::new();
    if let Ok(entries) = fs::read_dir(&temp_dir) {
        let mut jpgs: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("jpg"))
            .collect();
        jpgs.sort_by_key(|e| e.path());

        for (idx, entry) in jpgs.into_iter().enumerate() {
            if idx >= num_thumbs {
                break;
            }
            if let Ok(bytes) = fs::read(entry.path()) {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                let time_sec = idx as f64 * interval;
                thumbs.push(FilmstripThumb {
                    time_sec,
                    data_uri: format!("data:image/jpeg;base64,{b64}"),
                });
            }
        }
    }

    let _ = fs::remove_dir_all(&temp_dir);
    Ok(thumbs)
}

/// Trích xuất waveform audio peaks và filmstrip thumbnails siêu tốc cho giao diện Studio
pub fn extract_media_preview_sync(
    input_path: &str,
    duration_sec: Option<f64>,
) -> Result<MediaPreviewPayload> {
    let input = Path::new(input_path);
    if !input.exists() {
        return Err(anyhow::anyhow!("File không tồn tại: {}", input_path));
    }

    let ffmpeg_bin = find_ffmpeg();
    let temp_dir = std::env::temp_dir().join(format!("sublix_prev_{}", gen_unique_id()));
    let _ = fs::create_dir_all(&temp_dir);
    let temp_wav = temp_dir.join("preview.wav");

    // Trích xuất audio 8kHz mono pcm_s16le nhanh gấp 50-100x realtime
    let mut extract_cmd = Command::new(&ffmpeg_bin);
    extract_cmd
        .arg("-y")
        .arg("-i")
        .arg(input)
        .arg("-vn")
        .arg("-ar")
        .arg("8000")
        .arg("-ac")
        .arg("1")
        .arg("-c:a")
        .arg("pcm_s16le")
        .arg(&temp_wav);

    #[cfg(windows)]
    extract_cmd.creation_flags(CREATE_NO_WINDOW);

    let status = extract_cmd.status().context("FFmpeg trích xuất preview audio thất bại")?;

    let peaks = if status.success() && temp_wav.exists() {
        extract_audio_peaks(&temp_wav, 800).unwrap_or_default()
    } else {
        Vec::new()
    };

    let _ = fs::remove_file(&temp_wav);

    let duration = duration_sec.unwrap_or(0.0);
    let filmstrip_thumbs = if duration > 0.0 {
        extract_filmstrip_thumbnails(&ffmpeg_bin, input, duration, 10, 0).unwrap_or_default()
    } else {
        Vec::new()
    };

    let _ = fs::remove_dir_all(&temp_dir);

    Ok(MediaPreviewPayload {
        peaks,
        filmstrip_thumbs,
    })
}

/// Synthesize with the local Kokoro-Vietnamese ONNX model (offline).
pub fn synthesize_kokoro(text: &str, voice_id: &str, out_path: &Path) -> Result<()> {
    let model_dir = kokoro_model_dir();
    if !model_dir.join("kokoro_vi.onnx").exists() {
        anyhow::bail!(
            "Chưa tải model Kokoro-Vietnamese (thiếu {}). Vào tab Studio Lồng Tiếng để tải.",
            model_dir.join("kokoro_vi.onnx").display()
        );
    }
    let script = ensure_kokoro_script()?;
    let python = find_python();

    let mut cmd = Command::new(&python);
    cmd.arg(&script)
        .arg("--text")
        .arg(text)
        .arg("--voice")
        .arg(voice_id)
        .arg("--out")
        .arg(out_path)
        .arg("--model-dir")
        .arg(&model_dir)
        .arg("--device")
        .arg("cpu");

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = cmd
        .status()
        .with_context(|| "Không chạy được sidecar Kokoro (thiếu python?)")?;
    if !status.success() {
        anyhow::bail!("Kokoro TTS thất bại (exit code: {:?})", status.code());
    }
    Ok(())
}

// ===========================================================================
// v0.9.9 — Voice catalog & pre-generated audition samples.
// Cho phép chọn model → xem danh sách giọng Nam/Nữ TRƯỚC khi đọc thật:
// mẫu nghe thử được tạo 1 lần rồi cache trên đĩa, các lần sau phát tức thì.
// ===========================================================================

/// Folder that caches pre-generated audition samples for a model.
pub fn voice_samples_dir(model_id: &str) -> PathBuf {
    crate::config::app_base_dir()
        .join("models")
        .join("voice")
        .join(model_id)
        .join("samples")
}

/// Voice ids that already have a cached audition sample on disk.
pub fn list_voice_samples(model_id: &str) -> Vec<String> {
    let mut ids: Vec<String> = fs::read_dir(voice_samples_dir(model_id))
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|entry| {
                    let path = entry.path();
                    let is_wav = path
                        .extension()
                        .map(|ext| ext.eq_ignore_ascii_case("wav"))
                        .unwrap_or(false);
                    let valid = is_wav
                        && fs::metadata(&path).map(|m| m.len() > 2048).unwrap_or(false);
                    if valid {
                        path.file_stem().map(|s| s.to_string_lossy().to_string())
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    ids
}

/// Pre-generate the audition sample for every Kokoro voice (one-time) and
/// cache it under `models/voice/kokoro-vi/samples/`. Emits
/// `voice:sample_progress` after each voice so the UI can show progress.
pub fn generate_kokoro_samples(app: &AppHandle) -> Result<u32> {
    if !kokoro_available() {
        anyhow::bail!(
            "Chưa tải model Kokoro-Vietnamese — vào panel 🎛 Chọn Giọng & Tải Model để tải trước."
        );
    }
    let dir = voice_samples_dir("kokoro-vi");
    fs::create_dir_all(&dir).with_context(|| format!("Tạo thư mục {}", dir.display()))?;
    let voices = get_kokoro_voices();
    let total = voices.len();
    let phrase = "Xin chào! Tôi là giọng đọc tiếng Việt của Sublix, rất vui được gặp bạn.";
    let mut generated = 0u32;
    for (idx, preset) in voices.iter().enumerate() {
        let voice_id = preset
            .id
            .strip_prefix(KOKORO_VOICE_PREFIX)
            .unwrap_or(&preset.id)
            .to_string();
        let out = dir.join(format!("{voice_id}.wav"));
        let mut error: Option<String> = None;
        if !is_valid_audio(&out) {
            match synthesize_kokoro(phrase, &voice_id, &out) {
                Ok(()) => generated += 1,
                Err(e) => error = Some(format!("{e:#}")),
            }
        }
        let _ = app.emit(
            "voice:sample_progress",
            serde_json::json!({
                "model_id": "kokoro-vi",
                "voice_id": voice_id,
                "index": idx + 1,
                "total": total,
                "done": error.is_none(),
                "error": error,
            }),
        );
    }
    Ok(generated)
}

/// Cached audition sample as a data URI for instant playback (None when the
/// sample has not been generated yet — callers fall back to live synthesis).
pub fn voice_sample_data(model_id: &str, voice_id: &str) -> Option<String> {
    let clean = voice_id.trim_start_matches(KOKORO_VOICE_PREFIX);
    let path = voice_samples_dir(model_id).join(format!("{clean}.wav"));
    let bytes = fs::read(path).ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:audio/wav;base64,{b64}"))
}

/// True when a produced audio file exists and FFmpeg can read a real duration.
fn is_valid_audio(path: &Path) -> bool {
    match fs::metadata(path) {
        Ok(meta) if meta.len() > 2048 => get_audio_duration(path).is_ok(),
        _ => false,
    }
}

/// 14 preset Vietnamese Kokoro voices shipped with the model (offline, CPU-friendly).
pub fn get_kokoro_voices() -> Vec<VoicePreset> {
    // (voice_id, display_name, gender)
    const KOKORO_VOICES: &[(&str, &str, &str)] = &[
        ("diem_trinh", "Diễm Trinh", "female"),
        ("hung_thinh", "Hưng Thịnh", "male"),
        ("mai_linh", "Mai Linh", "female"),
        ("mai_loan", "Mai Loan", "female"),
        ("manh_dung", "Mạnh Dũng", "male"),
        ("my_yen", "Mỹ Yến", "female"),
        ("ngoc_huyen", "Ngọc Huyền", "female"),
        ("phat_tai", "Phát Tài", "male"),
        ("thanh_dat", "Thành Đạt", "male"),
        ("thuc_trinh", "Thục Trinh", "female"),
        ("tuan_ngoc", "Tuấn Ngọc", "male"),
        ("storyvert", "Storyvert", "female"),
        ("duc_an", "Đức An", "male"),
        ("duc_duy", "Đức Duy", "male"),
    ];
    KOKORO_VOICES
        .iter()
        .map(|(id, name, gender)| VoicePreset {
            id: format!("kokoro:{}", id),
            name: format!("VN • {} (Kokoro — offline)", name),
            gender: gender.to_string(),
            lang: "vi".to_string(),
            description: format!("Giọng {} tiếng Việt chạy offline bằng Kokoro ONNX.", name),
        })
        .collect()
}

/// Get curated list of high-quality neural voices
pub fn get_preset_voices() -> Vec<VoicePreset> {
    let mut voices = vec![
        VoicePreset {
            id: "vi-VN-NamMinhNeural".to_string(),
            name: "Nam Minh (Nam Điện Ảnh - Trầm Ấm)".to_string(),
            gender: "male".to_string(),
            lang: "vi".to_string(),
            description: "Giọng nam miền Bắc, trầm ấm, truyền cảm, thích hợp phim hành động / tài liệu".to_string(),
        },
        VoicePreset {
            id: "vi-VN-HoaiMyNeural".to_string(),
            name: "Hoài My (Nữ Điện Ảnh - Dịu Dàng)".to_string(),
            gender: "female".to_string(),
            lang: "vi".to_string(),
            description: "Giọng nữ miền Bắc, nhẹ nhàng, tự nhiên, thích hợp thoại phim tâm lý / tình cảm".to_string(),
        },
        VoicePreset {
            id: "en-US-GuyNeural".to_string(),
            name: "Guy (English - Male Cinematic)".to_string(),
            gender: "male".to_string(),
            lang: "en".to_string(),
            description: "Deep, natural American male voice for films".to_string(),
        },
        VoicePreset {
            id: "en-US-JennyNeural".to_string(),
            name: "Jenny (English - Female Expressive)".to_string(),
            gender: "female".to_string(),
            lang: "en".to_string(),
            description: "Clear and expressive American female voice".to_string(),
        },
        VoicePreset {
            id: "ja-JP-KeitaNeural".to_string(),
            name: "Keita (Japanese - Male Anime/Drama)".to_string(),
            gender: "male".to_string(),
            lang: "ja".to_string(),
            description: "Natural Japanese male voice".to_string(),
        },
        VoicePreset {
            id: "ja-JP-NanamiNeural".to_string(),
            name: "Nanami (Japanese - Female Soft)".to_string(),
            gender: "female".to_string(),
            lang: "ja".to_string(),
            description: "Emotional Japanese female voice".to_string(),
        },
        VoicePreset {
            id: "zh-CN-YunxiNeural".to_string(),
            name: "Yunxi (Chinese - Male Drama)".to_string(),
            gender: "male".to_string(),
            lang: "zh".to_string(),
            description: "Warm Chinese male dialogue voice".to_string(),
        },
        VoicePreset {
            id: "zh-CN-XiaoxiaoNeural".to_string(),
            name: "Xiaoxiao (Chinese - Female Expressive)".to_string(),
            gender: "female".to_string(),
            lang: "zh".to_string(),
            description: "Expressive Chinese female voice".to_string(),
        },
    ];
    voices.extend(get_kokoro_voices());
    voices
}

/// Synthesize a speech file via edge-tts with python -m fallback
pub fn synthesize_speech(text: &str, voice: &str, rate: &str, pitch: &str, out_path: &Path) -> Result<()> {
    // Local, offline engine first. Anything not prefixed with `kokoro:` uses the
    // (optional, network) Edge-TTS fallback below.
    if let Some(kokoro_id) = voice.strip_prefix(KOKORO_VOICE_PREFIX) {
        let id = kokoro_id.trim();
        let voice_id = if id.is_empty() { "diem_trinh" } else { id };
        return synthesize_kokoro(text, voice_id, out_path);
    }

    let tts_bin = find_edge_tts();
    let mut cmd = Command::new(&tts_bin);
    cmd.arg("--text")
        .arg(text)
        .arg("--voice")
        .arg(voice)
        .arg("--write-media")
        .arg(out_path);

    if !rate.is_empty() && rate != "+0%" {
        cmd.arg(format!("--rate={}", rate));
    }
    if !pitch.is_empty() && pitch != "+0Hz" {
        cmd.arg(format!("--pitch={}", pitch));
    }

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status_res = cmd.status();
    match status_res {
        Ok(st) if st.success() => Ok(()),
        _ => {
            // Robust fallback to python -m edge_tts
            let mut py_cmd = Command::new("python");
            py_cmd.arg("-m")
                .arg("edge_tts")
                .arg("--text")
                .arg(text)
                .arg("--voice")
                .arg(voice)
                .arg("--write-media")
                .arg(out_path);

            if !rate.is_empty() && rate != "+0%" {
                py_cmd.arg(format!("--rate={}", rate));
            }
            if !pitch.is_empty() && pitch != "+0Hz" {
                py_cmd.arg(format!("--pitch={}", pitch));
            }

            #[cfg(windows)]
            py_cmd.creation_flags(CREATE_NO_WINDOW);

            let py_status = py_cmd.status().with_context(|| "Failed to execute python -m edge_tts")?;
            if !py_status.success() {
                return Err(anyhow::anyhow!("edge-tts failed with exit code: {:?}", py_status.code()));
            }
            Ok(())
        }
    }
}

/// Synthesize single line and return as base64 data URI
pub fn preview_single_line(text: &str, voice: &str, rate: Option<&str>, pitch: Option<&str>) -> Result<String> {
    let temp_dir = std::env::temp_dir().join("sublix_dubbing");
    fs::create_dir_all(&temp_dir)?;
    let temp_file = temp_dir.join(format!("preview_{}.mp3", gen_unique_id()));

    synthesize_speech(
        text,
        voice,
        rate.unwrap_or("+0%"),
        pitch.unwrap_or("+0Hz"),
        &temp_file,
    )?;

    let bytes = fs::read(&temp_file).context("Read preview mp3")?;
    let _ = fs::remove_file(&temp_file);

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:audio/mp3;base64,{}", b64))
}

/// Check if the transition between two clauses represents a conversational turn / speaker boundary
pub fn is_turn_boundary(prev_text: &str, next_text: &str, pause: f64) -> bool {
    let p_trim = prev_text.trim();
    let n_trim = next_text.trim();

    // 1. Explicit terminal punctuation
    if p_trim.ends_with('?') || p_trim.ends_with('！') || p_trim.ends_with('？') || p_trim.ends_with('!') {
        return true;
    }

    // 2. Period with non-negligible pause (>= 250ms)
    if (p_trim.ends_with('.') || p_trim.ends_with('。')) && pause >= 0.25 {
        return true;
    }

    // 3. Significant pause between distinct utterances (>= 600ms)
    if pause >= 0.60 {
        return true;
    }

    // 4. Greeting or conversational turn cues at the start of next_text
    let n_lower = n_trim.to_lowercase();
    let cues = [
        "hi", "hello", "hey", "welcome", "glad to meet", "nice to meet",
        "i am", "i'm ", "my name is", "this is", "and this is", "that's", "and that's",
        "good morning", "good afternoon", "good evening", "bye", "goodbye",
        "xin chào", "chào bạn", "tôi là", "đây là",
        "こんにちは", "初めまして", "よろしく",
        "你好", "很高兴", "这是"
    ];
    for cue in cues {
        if n_lower.starts_with(cue) {
            return true;
        }
    }

    false
}

/// Split single Whisper clauses that contain two distinct speakers back-to-back
pub fn split_mixed_turn_clause(start_sec: f64, end_sec: f64, text: &str) -> Vec<(f64, f64, String)> {
    let internal_split_patterns = [
        ". Hi, ", ". Hello, ", ". Hey, ", ". I'm ", ". Glad to meet ", ". Nice to meet ",
        "! Hi, ", "! Hello, ", "? Hi, ", "? Hello, ",
    ];

    for pat in internal_split_patterns {
        if let Some(idx) = text.find(pat) {
            let split_pos = idx + 1; // split right after the punctuation
            let part1 = text[..split_pos].trim().to_string();
            let part2 = text[split_pos..].trim().to_string();
            if !part1.is_empty() && !part2.is_empty() {
                let total_chars = (part1.chars().count() + part2.chars().count()) as f64;
                let dur = end_sec - start_sec;
                let mid = start_sec + dur * (part1.chars().count() as f64 / total_chars);
                return vec![
                    (start_sec, mid, part1),
                    (mid, end_sec, part2),
                ];
            }
        }
    }
    vec![(start_sec, end_sec, text.to_string())]
}

/// Clean Whisper hallucinations/non-speech and merge contiguous dialogue clauses
pub fn clean_and_merge_raw_segments(
    raw_segments: Vec<crate::file_sub::SubtitleSegment>,
    src_lang: &str,
    expected_speakers: Option<usize>,
) -> Vec<DubbingSegment> {
    let is_cjk = matches!(src_lang.to_lowercase().as_str(), "ja" | "japanese" | "zh" | "chinese");

    // 1. Initial pass: clean, filter silence / hallucinations / micro-noises and split mixed clauses
    let mut filtered = Vec::new();
    for seg in raw_segments {
        let start_sec = parse_srt_time_to_seconds(&seg.start_time);
        let end_sec = parse_srt_time_to_seconds(&seg.end_time);
        let dur = end_sec - start_sec;

        let cleaned = crate::stt::whisper_local::clean_whisper_transcript(&seg.original);
        if cleaned.is_empty() || crate::stt::whisper_local::is_hallucination(&cleaned) {
            continue;
        }

        // Filter out pure symbols / punctuation
        if cleaned.chars().all(|c| c.is_ascii_punctuation() || "―…、。！？".contains(c)) {
            continue;
        }

        // Filter short isolated filler sounds (< 0.55s and <= 2 chars in CJK or <= 3 in Latin)
        let char_count = cleaned.chars().count();
        if dur < 0.55 && (char_count <= 2 || (char_count <= 3 && !is_cjk)) {
            continue;
        }

        let split_parts = split_mixed_turn_clause(start_sec, end_sec, &cleaned);
        for part in split_parts {
            filtered.push(part);
        }
    }

    if filtered.is_empty() {
        return Vec::new();
    }

    // 2. Smart merge consecutive dialogue clauses belonging to the same speech flow
    let mut merged: Vec<(f64, f64, String)> = Vec::new();

    for (start_sec, end_sec, text) in filtered {
        if let Some(prev) = merged.last_mut() {
            let pause = start_sec - prev.1;
            let total_dur = end_sec - prev.0;

            let prev_text = prev.2.trim();
            let is_boundary = is_turn_boundary(prev_text, &text, pause);

            // Merge if pause is small (< 0.85s), total duration stays within 7.0s, and not a turn boundary
            if pause <= 0.85 && total_dur <= 7.0 && !is_boundary {
                prev.1 = end_sec;
                if is_cjk {
                    prev.2 = format!("{}{}", prev.2, text);
                } else {
                    prev.2 = format!("{} {}", prev.2, text);
                }
                continue;
            }
        }
        merged.push((start_sec, end_sec, text));
    }

    // 3. Dynamic multi-speaker assignment (constrained to expected_speakers)
    let max_spk = expected_speakers.unwrap_or(2).max(1);
    let mut current_speaker_idx = 0;
    let mut last_end = 0.0;
    let mut segments = Vec::with_capacity(merged.len());

    for (idx, (start_sec, end_sec, text)) in merged.into_iter().enumerate() {
        let pause = start_sec - last_end;
        let prev_text = segments.last().map(|s: &DubbingSegment| s.original_text.as_str()).unwrap_or("");
        let is_speaker_change = idx > 0 && is_turn_boundary(prev_text, &text, pause);

        if is_speaker_change && max_spk > 1 {
            current_speaker_idx = (current_speaker_idx + 1) % max_spk;
        }

        let speaker_id = format!("speaker_{}", current_speaker_idx);
        last_end = end_sec;

        segments.push(DubbingSegment {
            id: idx + 1,
            speaker_id,
            start_sec,
            end_sec,
            original_text: text,
            dubbed_text: String::new(),
            audio_duration_sec: None,
            status: "ready".to_string(),
        });
    }

    segments
}

/// Extract clean JSON array from model output, stripping `<think>` tags and markdown code blocks
pub fn extract_json_array_from_response(raw: &str) -> Option<serde_json::Value> {
    let after_think = if let Some(idx) = raw.find("</think>") {
        &raw[idx + "</think>".len()..]
    } else {
        raw
    };

    let trimmed = after_think.trim();
    let content = if let Some(stripped) = trimmed.strip_prefix("```json") {
        stripped.strip_suffix("```").unwrap_or(stripped).trim()
    } else if let Some(stripped) = trimmed.strip_prefix("```") {
        stripped.strip_suffix("```").unwrap_or(stripped).trim()
    } else {
        trimmed
    };

    if let (Some(start), Some(end)) = (content.find('['), content.rfind(']')) {
        if start < end {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content[start..=end]) {
                return Some(v);
            }
        }
    }

    serde_json::from_str::<serde_json::Value>(content).ok()
}

/// Helper to sanitize speaker names into a valid identifier
pub fn slugify_speaker(name: &str) -> String {
    let mut s = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            s.push(c.to_ascii_lowercase());
        } else if !s.ends_with('_') {
            s.push('_');
        }
    }
    let trimmed = s.trim_matches('_');
    if trimmed.is_empty() {
        "speaker_0".to_string()
    } else {
        format!("speaker_{}", trimmed)
    }
}

/// Generate default rich personas for detected speakers across languages
pub fn generate_default_speakers(
    tgt_lang: &str,
    active_speaker_ids: &[String],
    expected_speakers: Option<usize>,
) -> Vec<DubbingSpeaker> {
    let mut unique_ids: Vec<String> = active_speaker_ids.to_vec();
    unique_ids.sort();
    unique_ids.dedup();

    let target_count = expected_speakers.unwrap_or_else(|| unique_ids.len().max(2));
    if unique_ids.is_empty() {
        unique_ids = (0..target_count).map(|i| format!("speaker_{i}")).collect();
    } else if let Some(n) = expected_speakers {
        if n > 0 && unique_ids.len() > n {
            unique_ids.truncate(n);
        }
    }

    let mut speakers = Vec::new();
    let male_pitches = ["+0Hz", "-20Hz", "+15Hz", "-35Hz", "+30Hz", "-15Hz"];
    let female_pitches = ["+0Hz", "+25Hz", "-15Hz", "+40Hz", "-25Hz", "+10Hz"];
    let rates = ["+0%", "+0%", "-5%", "+5%"];

    for (idx, spk_id) in unique_ids.into_iter().enumerate() {
        let is_male = if expected_speakers == Some(2) || expected_speakers == Some(1) {
            true
        } else {
            idx % 2 == 0
        };
        let p_idx = if is_male && expected_speakers == Some(2) {
            idx % male_pitches.len()
        } else {
            (idx / 2) % male_pitches.len()
        };
        let r_idx = idx % rates.len();

        let (label, voice, pitch, rate) = match tgt_lang {
            "en" => {
                if is_male {
                    (format!("Speaker {} (Male)", idx + 1), "en-US-GuyNeural".to_string(), male_pitches[p_idx].to_string(), rates[r_idx].to_string())
                } else {
                    (format!("Speaker {} (Female)", idx + 1), "en-US-JennyNeural".to_string(), female_pitches[p_idx].to_string(), rates[r_idx].to_string())
                }
            }
            "ja" => {
                if is_male {
                    (format!("話者 {} (男性)", idx + 1), "ja-JP-KeitaNeural".to_string(), male_pitches[p_idx].to_string(), rates[r_idx].to_string())
                } else {
                    (format!("話者 {} (女性)", idx + 1), "ja-JP-NanamiNeural".to_string(), female_pitches[p_idx].to_string(), rates[r_idx].to_string())
                }
            }
            "zh" => {
                if is_male {
                    (format!("讲述人 {} (男)", idx + 1), "zh-CN-YunxiNeural".to_string(), male_pitches[p_idx].to_string(), rates[r_idx].to_string())
                } else {
                    (format!("讲述人 {} (女)", idx + 1), "zh-CN-XiaoxiaoNeural".to_string(), female_pitches[p_idx].to_string(), rates[r_idx].to_string())
                }
            }
            _ => { // vi — ưu tiên engine Kokoro chạy offline khi đã tải model
                // v0.9.9: pool đủ 7 nam + 7 nữ để khớp voice đa vai hạn chế trùng giọng.
                const KO_MALE: [&str; 7] = [
                    "kokoro:tuan_ngoc", "kokoro:manh_dung", "kokoro:thanh_dat", "kokoro:phat_tai",
                    "kokoro:hung_thinh", "kokoro:duc_an", "kokoro:duc_duy",
                ];
                const KO_FEMALE: [&str; 7] = [
                    "kokoro:mai_linh", "kokoro:ngoc_huyen", "kokoro:my_yen", "kokoro:diem_trinh",
                    "kokoro:mai_loan", "kokoro:thuc_trinh", "kokoro:storyvert",
                ];
                if is_male {
                    let voice = if kokoro_available() {
                        KO_MALE[p_idx % KO_MALE.len()]
                    } else {
                        "vi-VN-NamMinhNeural"
                    };
                    (format!("Nhân vật {} (Nam)", idx + 1), voice.to_string(), male_pitches[p_idx].to_string(), rates[r_idx].to_string())
                } else {
                    let voice = if kokoro_available() {
                        KO_FEMALE[p_idx % KO_FEMALE.len()]
                    } else {
                        "vi-VN-HoaiMyNeural"
                    };
                    (format!("Nhân vật {} (Nữ)", idx + 1), voice.to_string(), female_pitches[p_idx].to_string(), rates[r_idx].to_string())
                }
            }
        };

        speakers.push(DubbingSpeaker {
            id: spk_id,
            label,
            voice,
            pitch,
            rate,
            // v0.9.10: default fallback chỉ biết idx % 2 (best-effort khi LLM
            // không có), đánh dấu để test_dubbing_srt biết không phải gender
            // thật và tránh re-assign lung tung.
            gender: if is_male { "male".to_string() } else { "female".to_string() },
            sample_audio_data: None,
        });
    }

    speakers
}

/// Cinematic Diarization and Scripting via MiniMax Cloud API
pub fn diarize_and_script_via_minimax(
    segments: &mut [DubbingSegment],
    source_lang: &str,
    target_lang: &str,
    api_key: &str,
    model: &str,
) -> Result<Vec<DubbingSpeaker>> {
    if segments.is_empty() {
        return Ok(Vec::new());
    }

    let model_name = if model.trim().is_empty() {
        "MiniMax-M3"
    } else {
        model.trim()
    };

    let mut transcript_text = String::new();
    for s in segments.iter() {
        transcript_text.push_str(&format!(
            "{} [{:.1}s - {:.1}s]: {}\n",
            s.id, s.start_sec, s.end_sec, s.original_text
        ));
    }

    let system_prompt = format!(
        "Bạn là đạo diễn lồng tiếng phim và chuyên gia phân vai (Speaker Diarization) chuyên nghiệp.\n\
         Dưới đây là danh sách các câu thoại trong video (ngôn ngữ gốc: {}).\n\
         Nhiệm vụ:\n\
         1. Phân vai chính xác cho từng câu thoại: chỉ ra tên nhân vật (speaker) và giới tính (gender: \"male\" hoặc \"female\").\n\
         2. Dịch lời thoại sang tiếng {} điện ảnh tự nhiên, phù hợp khẩu hình và cảm xúc nhân vật.\n\
         QUY TẮC BẮT BUỘC: Trả về DUY NHẤT một JSON array thuần túy (không kèm giải thích, không markdown):\n\
         [\n  {{\"id\": 1, \"speaker\": \"Tên Nhân Vật\", \"gender\": \"male\", \"text\": \"Lời dịch...\"}}\n]",
        source_lang.to_uppercase(),
        target_lang.to_uppercase()
    );

    let body = serde_json::json!({
        "model": model_name,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": transcript_text }
        ],
        "temperature": 0.2
    });

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()?;

    let resp = client
        .post("https://api.minimax.io/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .context("Gửi yêu cầu tới MiniMax API thất bại")?;

    if !resp.status().is_success() {
        let err_text = resp.text().unwrap_or_default();
        return Err(anyhow::anyhow!("MiniMax API báo lỗi: {}", err_text));
    }

    let chat_resp: serde_json::Value = resp.json().context("Không đọc được JSON từ MiniMax")?;
    let raw_content = chat_resp["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let json_val = extract_json_array_from_response(&raw_content)
        .ok_or_else(|| anyhow::anyhow!("Không thể bóc tách JSON phân vai từ MiniMax"))?;

    let items: Vec<serde_json::Value> = match json_val {
        serde_json::Value::Array(arr) => arr,
        _ => return Err(anyhow::anyhow!("Dữ liệu trả về không phải mảng")),
    };

    let mut speaker_order: Vec<(String, String, String)> = Vec::new(); // (id, label, gender)

    for item in items {
        let id = item["id"].as_u64().unwrap_or(0) as usize;
        let speaker_name = item["speaker"].as_str().unwrap_or("Speaker").trim();
        let gender = item["gender"].as_str().unwrap_or("male").to_lowercase();
        let text = item["text"]
            .as_str()
            .or_else(|| item["text_vi"].as_str())
            .or_else(|| item["dubbed_text"].as_str())
            .unwrap_or("")
            .trim();

        let spk_slug = slugify_speaker(speaker_name);

        if !speaker_order.iter().any(|(s, _, _)| s == &spk_slug) {
            let label = format!(
                "{} ({})",
                speaker_name,
                if gender == "female" { "Nữ" } else { "Nam" }
            );
            speaker_order.push((spk_slug.clone(), label, gender));
        }

        if let Some(seg) = segments.iter_mut().find(|s| s.id == id) {
            seg.speaker_id = spk_slug;
            if !text.is_empty() {
                seg.dubbed_text = text.to_string();
            }
        }
    }

    let mut speakers = Vec::new();
    let mut male_count = 0;
    let mut female_count = 0;

    let male_pitches = ["+0Hz", "-20Hz", "+15Hz", "-35Hz", "+30Hz", "-15Hz"];
    let female_pitches = ["+0Hz", "+25Hz", "-15Hz", "+40Hz", "-25Hz", "+10Hz"];
    let rates = ["+0%", "+0%", "-5%", "+5%"];

    for (spk_id, label, gender) in speaker_order {
        let is_female = gender.contains("female") || gender.contains("nữ");
        let (voice, pitch, rate) = match target_lang {
            "en" => {
                if is_female {
                    let p = female_pitches[female_count % female_pitches.len()];
                    let r = rates[female_count % rates.len()];
                    female_count += 1;
                    ("en-US-JennyNeural".to_string(), p.to_string(), r.to_string())
                } else {
                    let p = male_pitches[male_count % male_pitches.len()];
                    let r = rates[male_count % rates.len()];
                    male_count += 1;
                    ("en-US-GuyNeural".to_string(), p.to_string(), r.to_string())
                }
            }
            "ja" => {
                if is_female {
                    let p = female_pitches[female_count % female_pitches.len()];
                    let r = rates[female_count % rates.len()];
                    female_count += 1;
                    ("ja-JP-NanamiNeural".to_string(), p.to_string(), r.to_string())
                } else {
                    let p = male_pitches[male_count % male_pitches.len()];
                    let r = rates[male_count % rates.len()];
                    male_count += 1;
                    ("ja-JP-KeitaNeural".to_string(), p.to_string(), r.to_string())
                }
            }
            "zh" => {
                if is_female {
                    let p = female_pitches[female_count % female_pitches.len()];
                    let r = rates[female_count % rates.len()];
                    female_count += 1;
                    ("zh-CN-XiaoxiaoNeural".to_string(), p.to_string(), r.to_string())
                } else {
                    let p = male_pitches[male_count % male_pitches.len()];
                    let r = rates[male_count % rates.len()];
                    male_count += 1;
                    ("zh-CN-YunxiNeural".to_string(), p.to_string(), r.to_string())
                }
            }
            _ => { // vi — ưu tiên engine Kokoro chạy offline khi đã tải model
                let use_kokoro = kokoro_available();
                // v0.9.9: pool đủ 7 nam + 7 nữ — khớp voice đa vai hạn chế trùng giọng.
                const KO_MALE: [&str; 7] = [
                    "kokoro:tuan_ngoc", "kokoro:manh_dung", "kokoro:thanh_dat", "kokoro:phat_tai",
                    "kokoro:hung_thinh", "kokoro:duc_an", "kokoro:duc_duy",
                ];
                const KO_FEMALE: [&str; 7] = [
                    "kokoro:mai_linh", "kokoro:ngoc_huyen", "kokoro:my_yen", "kokoro:diem_trinh",
                    "kokoro:mai_loan", "kokoro:thuc_trinh", "kokoro:storyvert",
                ];
                if is_female {
                    let p = female_pitches[female_count % female_pitches.len()];
                    let r = rates[female_count % rates.len()];
                    let voice = if use_kokoro {
                        KO_FEMALE[female_count % KO_FEMALE.len()]
                    } else {
                        "vi-VN-HoaiMyNeural"
                    };
                    female_count += 1;
                    (voice.to_string(), p.to_string(), r.to_string())
                } else {
                    let p = male_pitches[male_count % male_pitches.len()];
                    let r = rates[male_count % rates.len()];
                    let voice = if use_kokoro {
                        KO_MALE[male_count % KO_MALE.len()]
                    } else {
                        "vi-VN-NamMinhNeural"
                    };
                    male_count += 1;
                    (voice.to_string(), p.to_string(), r.to_string())
                }
            }
        };

        speakers.push(DubbingSpeaker {
            id: spk_id,
            label,
            voice,
            pitch,
            rate,
            gender: if is_female { "female".to_string() } else { "male".to_string() },
            sample_audio_data: None,
        });
    }

    Ok(speakers)
}

/// Analyze media, extract transcript, cluster speakers, and generate translated dubbing script
pub fn analyze_and_create_project(
    app: Option<&AppHandle>,
    input_path: &str,
    source_lang: Option<String>,
    target_lang: Option<String>,
    time_limit_sec: Option<f64>,
    start_offset_sec: Option<f64>,
    expected_speakers: Option<usize>,
) -> Result<DubbingProject> {
    let my_gen = start_new_generation();

    let input = Path::new(input_path);
    if !input.exists() {
        return Err(anyhow::anyhow!("File không tồn tại: {}", input_path));
    }

    let emit = |stage: &str, percent: f32, msg: &str, cur: usize, tot: usize| {
        if let Some(a) = app {
            let _ = a.emit(
                "dubbing:progress",
                DubbingProgress {
                    stage: stage.to_string(),
                    percent,
                    message: msg.to_string(),
                    current_item: cur,
                    total_items: tot,
                },
            );
        } else {
            info!("[{stage}] {percent:.0}%: {msg} ({cur}/{tot})");
        }
    };

    emit("extracting", 5.0, "Đang trích xuất audio 16kHz từ video...", 0, 100);

    // 1. Extract 16kHz mono wav (honoring time_limit_sec and start_offset_sec if specified)
    let temp_dir = std::env::temp_dir().join("sublix_dubbing");
    fs::create_dir_all(&temp_dir)?;
    let temp_wav = temp_dir.join(format!("audio_{}.wav", gen_unique_id()));
    let temp_srt_stem = temp_dir.join(format!("srt_{}", gen_unique_id()));
    let temp_srt_file = temp_dir.join(format!("{}.srt", temp_srt_stem.display()));

    let offset = start_offset_sec.unwrap_or(0.0).max(0.0);

    let ffmpeg_bin = find_ffmpeg();
    let mut extract_cmd = Command::new(&ffmpeg_bin);
    extract_cmd.arg("-y");

    if offset > 0.0 {
        info!("⏱️ Applying start offset: {:.2}s for custom timeline range", offset);
        extract_cmd.arg("-ss").arg(format!("{:.2}", offset));
    }

    if let Some(limit) = time_limit_sec {
        if limit > 0.0 {
            info!("⏱️ Applying time limit: {:.1}s for dubbing test", limit);
            extract_cmd.arg("-t").arg(format!("{:.1}", limit));
        }
    }

    extract_cmd
        .arg("-i")
        .arg(input)
        .arg("-vn")
        .arg("-ar")
        .arg("16000")
        .arg("-ac")
        .arg("1")
        .arg("-c:a")
        .arg("pcm_s16le")
        .arg(&temp_wav);

    #[cfg(windows)]
    extract_cmd.creation_flags(CREATE_NO_WINDOW);

    let extract_status = run_child_with_cancel(extract_cmd, my_gen)
        .context("FFmpeg trích xuất âm thanh thất bại")?;
    if !extract_status.success() {
        return Err(anyhow::anyhow!("FFmpeg trích xuất âm thanh thất bại."));
    }

    if is_generation_cancelled(my_gen) {
        let _ = fs::remove_file(&temp_wav);
        return Err(anyhow::anyhow!("Đã dừng tiến trình theo yêu cầu của bạn."));
    }

    emit("transcribing", 15.0, "Đang nhận diện giọng nói & gán mốc thời gian...", 0, 100);

    // 2. Transcribe with Whisper CLI
    let cfg = match app {
        Some(a) => AppConfig::load(a),
        None => AppConfig::load_or_default(),
    };
    let stt_variant = ModelVariant::from_name(&cfg.stt_model).unwrap_or(ModelVariant::LargeV3TurboQ8);
    let model_path = crate::stt::whisper_local::ensure_model(stt_variant)
        .context("Không tìm thấy model Whisper")?;
    let (whisper_bin, _engine) = crate::stt::whisper_local::ensure_binary_with_engine()
        .context("Không tìm thấy whisper binary")?;

    let src_lang = source_lang.unwrap_or_else(|| "auto".to_string());

    let mut whisper_cmd = Command::new(&whisper_bin);
    if let Some(bin_dir) = whisper_bin.parent() {
        whisper_cmd.current_dir(bin_dir);
    }
    whisper_cmd
        .arg("-m")
        .arg(&model_path)
        .arg("-f")
        .arg(&temp_wav)
        .arg("-l")
        .arg(&src_lang)
        .arg("-osrt")
        .arg("-of")
        .arg(&temp_srt_stem)
        .arg("-sns")
        .arg("-nth")
        .arg("0.65")
        .arg("-bo")
        .arg("1")
        .arg("-bs")
        .arg("1")
        .arg("-t")
        .arg("8");

    if _engine == crate::stt::SttEngine::Cuda {
        whisper_cmd.arg("-fa");
    }

    #[cfg(windows)]
    whisper_cmd.creation_flags(CREATE_NO_WINDOW);

    let whisper_res = run_child_with_cancel(whisper_cmd, my_gen)
        .context("Lỗi thực thi whisper-cli")?;

    if is_generation_cancelled(my_gen) {
        let _ = fs::remove_file(&temp_wav);
        let _ = fs::remove_file(&temp_srt_file);
        return Err(anyhow::anyhow!("Đã dừng tiến trình theo yêu cầu của bạn."));
    }

    if !whisper_res.success() || !temp_srt_file.exists() {
        let _ = fs::remove_file(&temp_wav);
        return Err(anyhow::anyhow!("Whisper không tạo được phụ đề cho tệp này."));
    }

    let raw_srt_content = fs::read_to_string(&temp_srt_file).context("Đọc SRT tạm")?;
    let _ = fs::remove_file(&temp_srt_file);

    let raw_segments = crate::file_sub::parse_srt_content(&raw_srt_content);
    if raw_segments.is_empty() {
        let _ = fs::remove_file(&temp_wav);
        return Err(anyhow::anyhow!("Không nhận diện được giọng nói trong tệp này."));
    }

    // 3. Clean, filter hallucinations, and merge contiguous dialogue clauses
    emit("diarizing", 35.0, "Đang lọc ảo giác & ghép nối câu thoại hoàn chỉnh...", 0, raw_segments.len());
    let mut parsed_segments = clean_and_merge_raw_segments(raw_segments, &src_lang, expected_speakers);

    if parsed_segments.is_empty() {
        let _ = fs::remove_file(&temp_wav);
        return Err(anyhow::anyhow!("Không phát hiện được câu thoại hợp lệ trong tệp này."));
    }

    let total = parsed_segments.len();
    info!("🎬 Parsed & merged into {} natural dialogue lines", total);

    // 3b. Offline AI Speaker Diarization via Sherpa-ONNX (pyannote + wespeaker)
    let mut diarization_engine_used = "heuristic".to_string();
    if sherpa_available() {
        emit("diarizing", 38.0, "Đang phân tích âm sắc giọng nói bằng Sherpa AI (Offline)...", 0, total);
        match run_sherpa_diarization(&temp_wav, &temp_dir, my_gen, expected_speakers) {
            Ok(sherpa_segs) if !sherpa_segs.is_empty() => {
                info!("🎬 Sherpa Diarization returned {} audio speech turns", sherpa_segs.len());
                for seg in parsed_segments.iter_mut() {
                    let mut best_spk = None;
                    let mut max_overlap = 0.0f64;
                    for turn in &sherpa_segs {
                        let overlap_start = seg.start_sec.max(turn.start);
                        let overlap_end = seg.end_sec.min(turn.end);
                        let overlap = (overlap_end - overlap_start).max(0.0);
                        if overlap > max_overlap {
                            max_overlap = overlap;
                            best_spk = Some(turn.speaker);
                        }
                    }
                    if let Some(spk_num) = best_spk {
                        if max_overlap > 0.05 {
                            let mapped_num = if let Some(n) = expected_speakers {
                                if n > 0 { spk_num % n } else { spk_num }
                            } else {
                                spk_num
                            };
                            seg.speaker_id = format!("speaker_{mapped_num}");
                        }
                    }
                }
                diarization_engine_used = "sherpa".to_string();
            }
            Ok(_) => {
                warn!("⚠️ Sherpa Diarization returned 0 turns, keeping heuristic speaker assignments");
            }
            Err(e) => {
                warn!("⚠️ Sherpa Diarization failed: {:#}, keeping heuristic speaker assignments", e);
            }
        }
    }

    let tgt_lang = target_lang.unwrap_or_else(|| "vi".to_string());

    // 4. Multi-Speaker Diarization & Cinematic Scripting
    let mut speakers = Vec::new();
    let mut minimax_succeeded = false;

    if cfg.translation_provider == "minimax" && !cfg.minimax_api_key.trim().is_empty() {
        emit("diarizing", 45.0, &format!("MiniMax ({}) đang phân vai & dịch kịch bản điện ảnh...", cfg.minimax_model), 0, total);
        match diarize_and_script_via_minimax(
            &mut parsed_segments,
            &src_lang,
            &tgt_lang,
            &cfg.minimax_api_key,
            &cfg.minimax_model,
        ) {
            Ok(spks) if !spks.is_empty() => {
                info!("🎬 MiniMax Diarization & Scripting succeeded with {} characters!", spks.len());
                speakers = spks;
                minimax_succeeded = true;
            }
            Ok(_) => {
                warn!("⚠️ MiniMax returned 0 characters, falling back to local heuristic");
            }
            Err(e) => {
                warn!("⚠️ MiniMax Diarization failed: {:#}, falling back to local multi-speaker heuristic", e);
            }
        }
    }

    if !minimax_succeeded {
        // Fallback: Generate dynamic speakers based on detected speaker IDs
        let active_ids: Vec<String> = parsed_segments.iter().map(|s| s.speaker_id.clone()).collect();
        speakers = generate_default_speakers(&tgt_lang, &active_ids, expected_speakers);

        // Batch translation to target language via local engine / fallback
        emit("scripting", 50.0, &format!("Đang biên kịch {} câu thoại sang {}...", total, tgt_lang.to_uppercase()), 0, total);
        let trans_variant = TranslationModelVariant::resolve_or_best(Some(&cfg.translation_model));
        let engine_pref = EnginePreference::from_str(&cfg.translation_engine_preference);

        let batch_size = 15;
        for chunk_start in (0..total).step_by(batch_size) {
            if is_generation_cancelled(my_gen) {
                return Err(anyhow::anyhow!(
                    "Đã dừng tiến trình theo yêu cầu của bạn (nhận {}/{} câu).",
                    chunk_start, total
                ));
            }

            let chunk_end = (chunk_start + batch_size).min(total);
            let percent = 50.0 + (chunk_start as f32 / total as f32) * 45.0;

            emit(
                "scripting",
                percent,
                &format!("Biên kịch câu {}-{}/{} ({})...", chunk_start + 1, chunk_end, total, tgt_lang.to_uppercase()),
                chunk_start + 1,
                total,
            );

            let texts_to_translate: Vec<String> = parsed_segments[chunk_start..chunk_end]
                .iter()
                .map(|s| s.original_text.clone())
                .collect();

            let translated_batch = crate::translate::translate_batch_with_config(
                &texts_to_translate,
                &src_lang,
                &tgt_lang,
                trans_variant,
                engine_pref,
                &cfg,
            );

            if is_generation_cancelled(my_gen) || is_dubbing_cancelled() {
                return Err(anyhow::anyhow!(
                    "Đã dừng tiến trình theo yêu cầu của bạn (nhận {}/{} câu).",
                    chunk_start + translated_batch.len(),
                    total
                ));
            }

            if translated_batch.len() < texts_to_translate.len() {
                return Err(anyhow::anyhow!(
                    "Tiến trình lồng tiếng / dịch thoại đã bị hủy hoặc chưa hoàn tất (nhận {}/{} câu).",
                    translated_batch.len(),
                    texts_to_translate.len()
                ));
            }

            for (offset, trans) in translated_batch.into_iter().enumerate() {
                let target_idx = chunk_start + offset;
                if target_idx < parsed_segments.len() {
                    if trans.starts_with("[Dịch lỗi:") {
                        parsed_segments[target_idx].status = "translate_failed".to_string();
                    }
                    parsed_segments[target_idx].dubbed_text = trans;
                }
            }
        }
    }

    // 4b. Extract original audio preview sample (2-8s) for each detected speaker
    emit("diarizing", 48.0, "Đang trích xuất đoạn âm thanh mẫu cho từng nhân vật...", 0, speakers.len());
    for spk in speakers.iter_mut() {
        let mut best_seg: Option<&DubbingSegment> = None;
        let mut best_score = -1.0f64;
        for seg in &parsed_segments {
            if seg.speaker_id == spk.id {
                let dur = seg.end_sec - seg.start_sec;
                let score = if (2.5..=7.0).contains(&dur) { dur + 10.0 } else { dur };
                if score > best_score {
                    best_score = score;
                    best_seg = Some(seg);
                }
            }
        }
        if let Some(seg) = best_seg {
            let clip_path = temp_dir.join(format!("sample_{}_{}.wav", spk.id, gen_unique_id()));
            let dur = (seg.end_sec - seg.start_sec).clamp(1.5, 7.0);
            if let Ok(data_uri) = extract_speaker_sample_clip(&ffmpeg_bin, &temp_wav, seg.start_sec, dur, &clip_path) {
                spk.sample_audio_data = Some(data_uri);
            }
            let _ = fs::remove_file(&clip_path);
        }
    }

    // 4c. Extract real audio waveform peaks from temp_wav
    let peaks = extract_audio_peaks(&temp_wav, 400).ok();

    let _ = fs::remove_file(&temp_wav);

    // If start_offset_sec was applied, shift segment timestamps back to global video time
    if offset > 0.0 {
        for seg in parsed_segments.iter_mut() {
            seg.start_sec += offset;
            seg.end_sec += offset;
        }
    }

    if is_generation_cancelled(my_gen) {
        return Err(anyhow::anyhow!("Đã dừng tiến trình theo yêu cầu của bạn."));
    }

    let media_duration = if let Some(limit) = time_limit_sec {
        if limit > 0.0 { limit } else { parsed_segments.last().map(|s| s.end_sec).unwrap_or(0.0) }
    } else {
        parsed_segments.last().map(|s| s.end_sec).unwrap_or(0.0)
    };

    // 4d. Extract video filmstrip thumbnail frames
    let filmstrip_thumbs = extract_filmstrip_thumbnails(&ffmpeg_bin, input, media_duration, 10, my_gen).ok();

    emit("done", 100.0, "Phân vai & Kịch bản lồng tiếng hoàn tất!", total, total);

    Ok(DubbingProject {
        input_path: input_path.to_string(),
        media_duration_sec: media_duration,
        speakers,
        segments: parsed_segments,
        bgm_volume: 0.25,
        voice_volume: 1.30,
        dubbing_mode: "ducking".to_string(),
        time_limit_sec,
        diarization_engine: Some(diarization_engine_used),
        peaks,
        filmstrip_thumbs,
    })
}

fn render_amix_chunk(
    ffmpeg_bin: &Path,
    temp_dir: &Path,
    inputs: &[(PathBuf, f64)],
    out_filename: &str,
    volume: f32,
    my_gen: u64,
) -> Result<PathBuf> {
    let out_path = temp_dir.join(out_filename);
    let num_inputs = inputs.len();

    if num_inputs == 1 {
        let (in_path, start_sec) = &inputs[0];
        let delay_ms = (start_sec * 1000.0).round() as u64;
        let mut cmd = Command::new(ffmpeg_bin);
        cmd.arg("-y").arg("-i").arg(in_path);
        if delay_ms > 0 || (volume - 1.0).abs() > 0.001 {
            let filter = format!("adelay={delay_ms}|{delay_ms},volume={volume:.2}");
            cmd.arg("-filter:a").arg(filter);
        }
        cmd.arg("-c:a").arg("pcm_s16le").arg(&out_path);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let status = run_child_with_cancel(cmd, my_gen)?;
        if !status.success() {
            return Err(anyhow::anyhow!("FFmpeg single chunk render failed"));
        }
        return Ok(out_path);
    }

    let mut filter_script = String::new();
    for (i, (_, start_sec)) in inputs.iter().enumerate() {
        let delay_ms = (start_sec * 1000.0).round() as u64;
        filter_script.push_str(&format!("[{i}:a]adelay={delay_ms}|{delay_ms}[a{i}];"));
    }
    for i in 0..num_inputs {
        filter_script.push_str(&format!("[a{i}]"));
    }
    filter_script.push_str(&format!("amix=inputs={num_inputs}:normalize=0,volume={volume:.2}[out]"));

    let script_file = temp_dir.join(format!("{out_filename}_filter.txt"));
    fs::write(&script_file, &filter_script)?;

    let mut cmd = Command::new(ffmpeg_bin);
    cmd.arg("-y");
    for (in_path, _) in inputs {
        cmd.arg("-i").arg(in_path);
    }
    cmd.arg("-filter_complex_script").arg(&script_file);
    cmd.arg("-map").arg("[out]");
    cmd.arg("-c:a").arg("pcm_s16le");
    cmd.arg(&out_path);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = run_child_with_cancel(cmd, my_gen)?;
    let _ = fs::remove_file(&script_file);
    if !status.success() {
        return Err(anyhow::anyhow!("FFmpeg amix chunk render failed"));
    }
    Ok(out_path)
}

fn render_combined_speech_track(
    ffmpeg_bin: &Path,
    temp_dir: &Path,
    speech_inputs: &[(PathBuf, f64)],
    voice_volume: f32,
    my_gen: u64,
) -> Result<PathBuf> {
    if speech_inputs.is_empty() {
        return Err(anyhow::anyhow!("Không có câu thoại nào để lồng tiếng"));
    }

    // If <= 28 inputs, mix directly in 1 chunk
    if speech_inputs.len() <= 28 {
        return render_amix_chunk(ffmpeg_bin, temp_dir, speech_inputs, "speech_combined.wav", voice_volume, my_gen);
    }

    // Chunk into batches of <= 28 inputs to strictly stay below Windows 32KB CMD limit
    let chunk_size = 28;
    let mut chunk_wavs = Vec::new();

    for (c_idx, chunk) in speech_inputs.chunks(chunk_size).enumerate() {
        if is_generation_cancelled(my_gen) {
            return Err(anyhow::anyhow!("Đã dừng theo yêu cầu của bạn."));
        }
        let chunk_name = format!("speech_chunk_{c_idx}.wav");
        let chunk_wav = render_amix_chunk(ffmpeg_bin, temp_dir, chunk, &chunk_name, 1.0, my_gen)?;
        chunk_wavs.push(chunk_wav);
    }

    let mut current_layer = chunk_wavs;
    let mut layer_idx = 0;
    while current_layer.len() > 28 {
        let mut next_layer = Vec::new();
        for (c_idx, chunk) in current_layer.chunks(28).enumerate() {
            let chunk_items: Vec<(PathBuf, f64)> = chunk.iter().map(|p| (p.clone(), 0.0)).collect();
            let chunk_name = format!("speech_layer_{layer_idx}_{c_idx}.wav");
            let merged = render_amix_chunk(ffmpeg_bin, temp_dir, &chunk_items, &chunk_name, 1.0, my_gen)?;
            next_layer.push(merged);
        }
        current_layer = next_layer;
        layer_idx += 1;
    }

    let final_chunk_items: Vec<(PathBuf, f64)> = current_layer.iter().map(|p| (p.clone(), 0.0)).collect();
    render_amix_chunk(ffmpeg_bin, temp_dir, &final_chunk_items, "speech_combined.wav", voice_volume, my_gen)
}

/// Render all dubbed audio segments, time-stretch if needed, and export final video
pub fn export_dubbed_video(
    app: Option<&AppHandle>,
    project: DubbingProject,
    output_path: Option<String>,
) -> Result<String> {
    let my_gen = start_new_generation();

    // R5-10: tag audio track language theo target_lang thật (không hardcode "vie").
    // Lấy từ AppConfig nếu có app handle; fallback "vi" nếu không (test/dev path).
    // Lưu ý: ffmpeg metadata chấp nhận cả ISO 639-1 (2 char) lẫn ISO 639-2 (3 char);
    // player (VLC, mpv) tự xử lý — đổi từ hardcode "vie" sang biến là đủ cho hầu hết case.
    let target_lang = if let Some(a) = app {
        crate::config::AppConfig::load(a).target_lang
    } else {
        "vi".to_string()
    };

    let emit = |stage: &str, percent: f32, msg: &str, cur: usize, tot: usize| {
        if let Some(a) = app {
            let _ = a.emit(
                "dubbing:progress",
                DubbingProgress {
                    stage: stage.to_string(),
                    percent,
                    message: msg.to_string(),
                    current_item: cur,
                    total_items: tot,
                },
            );
        } else {
            info!("[{stage}] {percent:.0}%: {msg} ({cur}/{tot})");
        }
    };

    let total_segs = project.segments.len();
    emit("synthesizing", 5.0, "Bắt đầu tổng hợp giọng lồng tiếng...", 0, total_segs);

    let temp_dir = std::env::temp_dir().join(format!("sublix_render_{}", gen_unique_id()));
    fs::create_dir_all(&temp_dir)?;

    let ffmpeg_bin = find_ffmpeg();
    let mut speech_inputs = Vec::new();
    let mut skipped_segments: Vec<usize> = Vec::new();

    // 1. Synthesize each segment and check duration
    for (i, seg) in project.segments.iter().enumerate() {
        if is_generation_cancelled(my_gen) {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(anyhow::anyhow!("Đã dừng xuất video theo yêu cầu của bạn."));
        }

        let percent = 5.0 + (i as f32 / total_segs as f32) * 55.0;
        emit(
            "synthesizing",
            percent,
            &format!("Phát âm câu {}/{}: {}", i + 1, total_segs, seg.dubbed_text),
            i + 1,
            total_segs,
        );

        let speaker = project
            .speakers
            .iter()
            .find(|s| s.id == seg.speaker_id)
            .unwrap_or(&project.speakers[0]);

        // Kokoro (offline) writes WAV; Edge-TTS writes MP3. FFmpeg reads either.
        let ext = if speaker.voice.starts_with(KOKORO_VOICE_PREFIX) { "wav" } else { "mp3" };
        let seg_audio = temp_dir.join(format!("seg_{}.{}", i, ext));
        let synth_text = if seg.dubbed_text.trim().is_empty() {
            "..."
        } else {
            &seg.dubbed_text
        };

        // Retry-then-skip: never let an empty/invalid file poison the final mux.
        let mut synth_ok = false;
        let mut last_err = String::new();
        for attempt in 0..2 {
            let _ = fs::remove_file(&seg_audio);
            match synthesize_speech(
                synth_text,
                &speaker.voice,
                &speaker.rate,
                &speaker.pitch,
                &seg_audio,
            ) {
                Ok(()) if is_valid_audio(&seg_audio) => {
                    synth_ok = true;
                    break;
                }
                Ok(()) => {
                    last_err = "file audio rỗng/không hợp lệ".to_string();
                }
                Err(e) => {
                    last_err = format!("{e:#}");
                }
            }
            if attempt == 0 {
                warn!("TTS câu {i} lần 1 thất bại ({last_err}). Thử lại...");
            }
        }

        if !synth_ok {
            warn!(
                "⏭️ Bỏ qua câu {} ('{}'): {}. Video vẫn xuất tiếp các câu còn lại.",
                seg.id, seg.dubbed_text, last_err
            );
            skipped_segments.push(seg.id);
            continue;
        }

        let slot_duration = (seg.end_sec - seg.start_sec).max(0.5);

        // Get actual duration of generated audio via ffprobe/ffmpeg
        let actual_dur = get_audio_duration(&seg_audio).unwrap_or(slot_duration);

        // If audio duration is longer than the dialogue slot, time-stretch with atempo
        let final_audio = if actual_dur > slot_duration * 1.05 {
            let tempo = (actual_dur / slot_duration).clamp(1.0, 1.45);
            let stretched = temp_dir.join(format!("seg_stretched_{}.wav", i));
            let mut stretch_cmd = Command::new(&ffmpeg_bin);
            stretch_cmd
                .arg("-y")
                .arg("-i")
                .arg(&seg_audio)
                .arg("-filter:a")
                .arg(format!("atempo={:.2}", tempo))
                .arg(&stretched);

            #[cfg(windows)]
            stretch_cmd.creation_flags(CREATE_NO_WINDOW);

            if run_child_with_cancel(stretch_cmd, my_gen).map(|s| s.success()).unwrap_or(false) {
                stretched
            } else {
                seg_audio
            }
        } else {
            seg_audio
        };

        if final_audio.exists() {
            speech_inputs.push((final_audio, seg.start_sec));
        }
    }

    if is_generation_cancelled(my_gen) {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(anyhow::anyhow!("Đã dừng xuất video theo yêu cầu của bạn."));
    }

    // Report any dialogue lines that could not be synthesized (TTS error / invalid audio).
    if !skipped_segments.is_empty() {
        let list = skipped_segments
            .iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        emit(
            "synthesizing",
            62.0,
            &format!(
                "⚠️ Đã bỏ qua {} câu không tổng hợp được giọng (câu #{}). Video vẫn được xuất.",
                skipped_segments.len(),
                list
            ),
            total_segs,
            total_segs,
        );
        warn!(
            "⏭️ Skipped {} segment(s) during export: [{}]",
            skipped_segments.len(),
            list
        );
    }

    // Check if user requested True Vocal Isolation via Demucs AI
    let mut isolated_bgm_path: Option<PathBuf> = None;
    if project.dubbing_mode == "vocal_isolation" {
        emit("demucs", 65.0, "Đang bóc tách giọng nói gốc bằng Demucs AI GPU...", 0, 100);
        let demucs_out = temp_dir.join("demucs_out");
        let _ = fs::create_dir_all(&demucs_out);

        let input_stem = Path::new(&project.input_path)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();

        let mut demucs_cmd = Command::new("python");
        demucs_cmd
            .arg("-m")
            .arg("demucs.separate")
            .arg("--two-stems")
            .arg("vocals")
            .arg("-d")
            .arg("cuda")
            .arg("-o")
            .arg(&demucs_out)
            .arg(&project.input_path);

        #[cfg(windows)]
        demucs_cmd.creation_flags(CREATE_NO_WINDOW);

        match run_child_with_cancel(demucs_cmd, my_gen) {
            Ok(st) if st.success() => {
                let cand1 = demucs_out.join("htdemucs").join(&*input_stem).join("no_vocals.wav");
                if cand1.exists() {
                    info!("✅ Demucs isolated BGM found: {}", cand1.display());
                    isolated_bgm_path = Some(cand1);
                }
            }
            Ok(_) => {
                warn!("Demucs execution completed with non-zero exit code, falling back to volume ducking");
            }
            Err(e) => {
                let _ = fs::remove_dir_all(&temp_dir);
                return Err(e);
            }
        }
    }

    if is_generation_cancelled(my_gen) {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(anyhow::anyhow!("Đã dừng xuất video theo yêu cầu của bạn."));
    }

    // 2. Pre-render all speech inputs into a single combined track via chunked amix
    // BUG-HOTFIX (445 segs): Windows CreateProcessW has a 32,767 character limit.
    // Pre-rendering combined speech avoids passing hundreds of `-i` flags to FFmpeg remux.
    let speech_track_opt = if !speech_inputs.is_empty() {
        emit("remuxing", 70.0, "Đang trộn các đoạn thoại thành luồng lồng tiếng đồng bộ...", 0, 100);
        let combined = render_combined_speech_track(
            &ffmpeg_bin,
            &temp_dir,
            &speech_inputs,
            project.voice_volume,
            my_gen,
        )?;
        Some(combined)
    } else {
        None
    };

    emit("remuxing", 80.0, "Đang ghép audio lồng tiếng & nhạc nền vào video...", 0, 100);

    // Determine target output file path
    let out_file = if let Some(p) = output_path {
        PathBuf::from(p)
    } else {
        // v0.9.10 (PO): gom THÀNH PHẨM lồng tiếng vào cùng thư mục với video tải
        // về — "chỗ nào thì tìm thấy chỗ đó", không phải đi săn file rải rác.
        let input = Path::new(&project.input_path);
        let stem = input.file_stem().unwrap_or_default().to_string_lossy();
        let dir = app
            .map(crate::downloader::get_downloads_dir)
            .unwrap_or_else(|| {
                input
                    .parent()
                    .unwrap_or_else(|| Path::new("."))
                    .to_path_buf()
            });
        let _ = std::fs::create_dir_all(&dir);
        dir.join(format!("{}_dubbed.mp4", stem))
    };

    // 3. Run master FFmpeg command using pre-rendered tracks (at most 3 inputs, < 300 chars CMD)
    let mut remux = Command::new(&ffmpeg_bin);
    remux.arg("-y");
    remux.arg("-i").arg(&project.input_path); // Input 0

    let mix_filter = match (&speech_track_opt, &isolated_bgm_path) {
        (Some(speech_wav), Some(bgm_file)) => {
            remux.arg("-i").arg(speech_wav); // Input 1
            remux.arg("-i").arg(bgm_file);   // Input 2
            "[2:a]volume=1.0[bgm];[bgm][1:a]amix=inputs=2:normalize=0[final_audio]".to_string()
        }
        (Some(speech_wav), None) => {
            remux.arg("-i").arg(speech_wav); // Input 1
            let bgm_vol = project.bgm_volume;
            format!("[0:a]volume={bgm_vol}[bgm];[bgm][1:a]amix=inputs=2:normalize=0[final_audio]")
        }
        (None, Some(bgm_file)) => {
            remux.arg("-i").arg(bgm_file);   // Input 1
            "[1:a]volume=1.0[final_audio]".to_string()
        }
        (None, None) => {
            "[0:a]anull[final_audio]".to_string()
        }
    };

    let filter_script_path = temp_dir.join("filter_complex.txt");
    fs::write(&filter_script_path, &mix_filter)
        .context("Failed to write filter_complex_script")?;

    remux
        .arg("-filter_complex_script")
        .arg(&filter_script_path)
        .arg("-map")
        .arg("0:v?") // Map original video if present
        .arg("-map")
        .arg("[final_audio]") // Map mixed audio
        .arg("-c:v")
        .arg("copy") // Fast video copy, no re-encoding
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("192k")
        // R5-10: tag audio track language theo target_lang thật (bám theo ngôn ngữ
        // đích của dự án), thay vì hardcode "vie" như trước. Player (VLC, mpv) sẽ
        // hiển thị đúng ngôn ngữ + tự chọn track khi user đổi audio.
        .arg("-metadata:s:a:0")
        .arg(format!("language={}", target_lang));

    if let Some(limit) = project.time_limit_sec {
        if limit > 0.0 {
            info!("⏱️ Remuxing sample video limited to {:.1}s", limit);
            remux.arg("-t").arg(format!("{:.1}", limit));
        }
    }

    remux.arg(&out_file);

    #[cfg(windows)]
    remux.creation_flags(CREATE_NO_WINDOW);

    if is_generation_cancelled(my_gen) {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(anyhow::anyhow!("Đã dừng xuất video theo yêu cầu của bạn."));
    }

    info!("🎬 Executing FFmpeg Dubbing Remux to {}", out_file.display());
    let status = run_child_with_cancel(remux, my_gen).with_context(|| "FFmpeg remux failed")?;

    let _ = fs::remove_dir_all(&temp_dir);

    if is_generation_cancelled(my_gen) {
        let _ = fs::remove_file(&out_file);
        return Err(anyhow::anyhow!("Đã dừng xuất video theo yêu cầu của bạn."));
    }

    if !status.success() {
        return Err(anyhow::anyhow!("FFmpeg xuất video lồng tiếng thất bại."));
    }

    emit("done", 100.0, "Xuất video lồng tiếng thành công!", 100, 100);
    Ok(out_file.to_string_lossy().to_string())
}

/// Helper to get audio duration in seconds via FFmpeg
fn get_audio_duration(file: &Path) -> Result<f64> {
    let ffmpeg_bin = find_ffmpeg();
    let mut cmd = Command::new(&ffmpeg_bin);
    cmd.arg("-i").arg(file);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()?;
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Look for "Duration: 00:00:03.45" safely without raw byte slicing
    if let Some(pos) = stderr.find("Duration: ") {
        let after = &stderr[pos + 10..];
        let token = after
            .split([',', ' ', '\r', '\n'])
            .next()
            .unwrap_or("")
            .trim();
        let secs = parse_srt_time_to_seconds(token);
        if secs > 0.0 {
            return Ok(secs);
        }
    }
    Err(anyhow::anyhow!(
        "Không thể trích xuất thời lượng audio từ FFmpeg cho: {}",
        file.display()
    ))
}

/// Parse "00:01:23.456" or "00:01:23,456" into seconds f64
fn parse_srt_time_to_seconds(time_str: &str) -> f64 {
    let clean = time_str.trim().replace(',', ".");
    let parts: Vec<&str> = clean.split(':').collect();
    if parts.len() == 3 {
        let hours: f64 = parts[0].parse().unwrap_or(0.0);
        let mins: f64 = parts[1].parse().unwrap_or(0.0);
        let secs: f64 = parts[2].parse().unwrap_or(0.0);
        hours * 3600.0 + mins * 60.0 + secs
    } else {
        0.0
    }
}

/// Hierarchical tree mixing (BUG-026 & BUG-030):
/// Groups inputs in layers with chunks <= 28 (guaranteed <= 28 < 32 inputs in every reduction layer).
/// Uses normalize=0 to preserve natural volume levels across all chunk sizes.
pub fn build_hierarchical_amix_filter(num_speech: usize, voice_volume: f32) -> String {
    if num_speech == 0 {
        return String::new();
    }
    let mut mix_filter = String::new();
    let mut current_labels: Vec<String> = (1..=num_speech).map(|i| format!("[a{}]", i)).collect();
    let mut layer = 0;
    while current_labels.len() > 1 {
        let mut next_labels = Vec::new();
        let chunk_size = 28;
        for (grp_idx, chunk) in current_labels.chunks(chunk_size).enumerate() {
            if chunk.len() == 1 {
                next_labels.push(chunk[0].clone());
            } else {
                let out_label = format!("[tree_{}_{}]", layer, grp_idx);
                let chunk_str = chunk.concat();
                mix_filter.push_str(&format!(
                    "{labels}amix=inputs={n}:normalize=0{out};",
                    labels = chunk_str,
                    n = chunk.len(),
                    out = out_label
                ));
                next_labels.push(out_label);
            }
        }
        current_labels = next_labels;
        layer += 1;
    }

    let speech_root = &current_labels[0];
    mix_filter.push_str(&format!(
        "{root}volume={vol}[speech];",
        root = speech_root,
        vol = voice_volume
    ));
    mix_filter
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hierarchical_amix_filter_invariant_under_32() {
        for n in [1, 10, 28, 29, 56, 896, 1000, 2500] {
            let filter = build_hierarchical_amix_filter(n, 1.25);
            assert!(filter.ends_with("volume=1.25[speech];"));

            // Check that every `inputs=N` in the filter satisfies N <= 28 < 32
            let mut search_from = 0;
            while let Some(pos) = filter[search_from..].find("inputs=") {
                let idx = search_from + pos + 7;
                let colon_pos = filter[idx..].find(':').expect("inputs followed by colon");
                let count_str = &filter[idx..idx + colon_pos];
                let inputs: usize = count_str.parse().expect("parsed inputs count");
                assert!(
                    inputs <= 28,
                    "FFmpeg amix input count {} exceeded 28 limit for total items {}",
                    inputs,
                    n
                );
                assert!(inputs >= 2, "amix inputs must be at least 2");
                search_from = idx + colon_pos;
            }

            // Invariant BUG-030: If any amix was emitted, normalize=0 must be present
            if filter.contains("amix=") {
                assert!(
                    filter.contains(":normalize=0"),
                    "normalize=0 must be present to prevent volume attenuation"
                );
                assert!(
                    !filter.contains("dropout_transition=0"),
                    "dropout_transition=0 must not be present"
                );
            }
        }
    }

    #[test]
    fn test_kokoro_voices_registered() {
        let voices = get_preset_voices();
        let kokoro: Vec<&VoicePreset> = voices
            .iter()
            .filter(|v| v.id.starts_with(KOKORO_VOICE_PREFIX))
            .collect();
        assert_eq!(kokoro.len(), 14, "Phải đăng ký đủ 14 giọng Kokoro");
        assert!(voices.iter().any(|v| v.id == "kokoro:tuan_ngoc"));
        assert!(voices.iter().any(|v| v.id == "kokoro:mai_linh"));
        assert!(kokoro.iter().all(|v| v.lang == "vi"));
    }

    #[test]
    fn test_generation_cancellation() {
        let gen1 = start_new_generation();
        assert!(!is_generation_cancelled(gen1));

        cancel_dubbing();
        assert!(is_generation_cancelled(gen1));

        // When starting a new generation, the old one remains cancelled
        let gen2 = start_new_generation();
        assert!(is_generation_cancelled(gen1), "Old generation must stay cancelled!");
        assert!(!is_generation_cancelled(gen2), "New generation must not be cancelled!");
    }

    #[test]
    fn test_render_combined_speech_track_large_segments() {
        let temp_dir = std::env::temp_dir().join(format!("sublix_test_large_{}", gen_unique_id()));
        let _ = fs::create_dir_all(&temp_dir);

        let ffmpeg = find_ffmpeg();
        if !ffmpeg.exists() {
            println!("FFmpeg not found, skipping large segments test");
            return;
        }

        // Generate a tiny 0.05s sine/silence wav as the sample audio
        let sample_wav = temp_dir.join("sample.wav");
        let mut gen_cmd = Command::new(&ffmpeg);
        gen_cmd.args([
            "-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
            "-t", "0.05", "-c:a", "pcm_s16le",
        ]);
        gen_cmd.arg(&sample_wav);
        #[cfg(windows)]
        gen_cmd.creation_flags(CREATE_NO_WINDOW);

        let gen_st = gen_cmd.status();
        if gen_st.map(|s| s.success()).unwrap_or(false) && sample_wav.exists() {
            // Build 100 segments (to thoroughly test chunking without taking too much CPU time in unit test)
            let mut inputs = Vec::new();
            for i in 0..100 {
                inputs.push((sample_wav.clone(), i as f64 * 0.1));
            }

            let my_gen = start_new_generation();
            let res = render_combined_speech_track(&ffmpeg, &temp_dir, &inputs, 1.0, my_gen);
            assert!(res.is_ok(), "render_combined_speech_track failed: {:?}", res.err());
            let out_wav = res.unwrap();
            assert!(out_wav.exists(), "Output combined speech WAV must exist!");
            assert!(std::fs::metadata(&out_wav).unwrap().len() > 100, "WAV must have content");
        }

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_sherpa_diarization_integration() {
        if !sherpa_available() {
            println!("Sherpa model not present, skipping diarization test");
            return;
        }
        let test_wav = PathBuf::from(r"H:\AI Project\sublix\test_dubbing_input\dialogue_2spk.wav");
        if !test_wav.exists() {
            println!("Test fixture dialogue_2spk.wav not found, skipping");
            return;
        }

        let temp_dir = std::env::temp_dir().join(format!("sublix_test_diarize_{}", gen_unique_id()));
        let _ = fs::create_dir_all(&temp_dir);

        let res = run_sherpa_diarization(&test_wav, &temp_dir, 0, Some(2));
        assert!(res.is_ok(), "run_sherpa_diarization failed: {:?}", res.err());
        let turns = res.unwrap();
        assert!(!turns.is_empty(), "Sherpa turns must not be empty");

        let mut spks = std::collections::HashSet::new();
        for t in &turns {
            spks.insert(t.speaker);
        }
        assert_eq!(spks.len(), 2, "Must detect exactly 2 speakers on dialogue_2spk.wav!");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    #[ignore = "R6-09: hardcode test path cục bộ — chạy explicit bằng `cargo test test_real_dubbing_analysis -- --ignored`"]
    fn test_real_dubbing_analysis() {
        let video_path = "H:\\AI Project\\sublix\\test_media\\Greetings and introductions. A1 [2TxVyxrOp0s].mp4";
        if !Path::new(video_path).exists() {
            println!("Video file not found, skipping real dubbing test");
            return;
        }

        println!("--- STARTING REAL DUBBING ANALYSIS ON TEST VIDEO ---");
        let project_res = analyze_and_create_project(
            None,
            video_path,
            Some("en".to_string()),
            Some("vi".to_string()),
            Some(30.0), // limit to first 30s for fast diagnostics
            None,
            Some(2),
        );

        match project_res {
            Ok(proj) => {
                println!("✅ Analysis succeeded!");
                println!("Media duration: {:.1}s", proj.media_duration_sec);
                println!("Speakers found/configured: {}", proj.speakers.len());
                for spk in &proj.speakers {
                    println!("  Speaker: id={}, label={}, voice={}", spk.id, spk.label, spk.voice);
                }
                println!("Total segments: {}", proj.segments.len());
                for seg in &proj.segments {
                    println!("  [#{} | {} ({:.1}s - {:.1}s)]", seg.id, seg.speaker_id, seg.start_sec, seg.end_sec);
                    println!("    Original: {}", seg.original_text);
                    println!("    Dubbed:   {}", seg.dubbed_text);
                }

                println!("--- EXPORTING DUBBED VIDEO SAMPLE ---");
                let out_sample = "H:\\AI Project\\sublix\\test_media\\output_dubbed_test.mp4";
                let export_res = export_dubbed_video(None, proj, Some(out_sample.to_string()));
                match export_res {
                    Ok(path) => {
                        println!("✅ Export succeeded to: {}", path);
                        assert!(Path::new(&path).exists(), "Exported video file must exist!");
                    }
                    Err(e) => {
                        println!("❌ Export failed: {:#}", e);
                    }
                }
            }
            Err(e) => {
                println!("❌ Analysis failed: {:#}", e);
            }
        }
    }
}

/// v0.9.8: Open Windows Explorer with the given file SELECTED in its parent
/// folder. Used by Studio Lồng Tiếng to jump straight to the dubbed output.
/// Uses `SHOpenFolderAndSelectItems` (v0.9.4 approach) instead of fragile
/// `explorer.exe /select,...` quoting — handles exotic characters in paths.
#[cfg(windows)]
pub fn open_output_folder(path_str: &str) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::Common::ITEMIDLIST;
    use windows::Win32::UI::Shell::{ILFree, SHOpenFolderAndSelectItems, SHParseDisplayName};

    let p = Path::new(path_str);
    if !p.exists() {
        return Err(anyhow::anyhow!("File không tồn tại: {path_str}"));
    }
    let wide: Vec<u16> = p
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
    unsafe {
        SHParseDisplayName(
            windows::core::PCWSTR(wide.as_ptr()),
            None,
            &mut pidl,
            0,
            None,
        )
        .map_err(|e| anyhow::anyhow!("Không phân giải được đường dẫn: {} ({e})", p.display()))?;
        let result = SHOpenFolderAndSelectItems(pidl as *const ITEMIDLIST, None, 0);
        ILFree(Some(pidl as *const ITEMIDLIST));
        result.map_err(|e| anyhow::anyhow!("Không mở được thư mục chứa file ({e})"))?;
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn open_output_folder(path_str: &str) -> Result<()> {
    let p = Path::new(path_str);
    if !p.exists() {
        return Err(anyhow::anyhow!("File không tồn tại: {path_str}"));
    }
    Ok(())
}
