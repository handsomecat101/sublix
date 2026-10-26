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
use std::collections::{BTreeMap, HashMap};
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

// TSK-FEAT-TTS-3ENGINES: engine TTS mới + chuẩn hóa số tiếng Việt (mỗi module < 300 dòng).
pub mod tts_cloud;
pub mod tts_common;
pub mod tts_status;
pub mod tts_vieneu;
pub mod tts_zerotts;
pub mod vi_normalize;

// TSK-DUBBING-STT-ENGINE: chọn engine STT theo config `stt_asr_engine` cho
// pipeline lồng tiếng (mặc định vẫn là whisper.cpp).
pub mod stt_select;

// TSK-FIX-SPEAKER-ROLES: gán người nói theo GIỌNG thật (F0 → giới tính) +
// gộp cụm khi vượt số vai + MiniMax không ghi đè phân vai theo giọng.
pub mod speaker_assign;

// TSK-FEAT-VOICE-SAMPLE-CACHE: cache mẫu nghe thử theo (engine, voice_id).
pub mod voice_samples;

// TSK-FEAT-SMART-DUCKING: đường âm lượng nền theo thoại (docs/DUCKING_SPEC.md).
pub mod ducking;
pub mod ducking_export;

// TSK-V014-BURN-FILTER: đồ thị filter ffmpeg — làm mờ dải phụ đề cứng + đè tem + in ASS.
pub mod subtitle_burn;

#[cfg(test)]
#[path = "tts_real_tests.rs"]
mod tts_real_tests;

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
    pub status: String, // "ready" | "previewed" | "rendered" | "translate_failed"
}

/// Gán kết quả dịch vào 1 segment.
/// Nếu kết quả là nhãn lỗi dịch (`[Dịch lỗi: ...]`) → đánh dấu `translate_failed` và
/// để `dubbed_text` RỖNG. Tuyệt đối không gán nhãn lỗi vào `dubbed_text`, vì TTS sẽ
/// đọc nguyên chuỗi đó thành tiếng ("tiếng thừa dài ngoằng").
pub fn apply_translation_to_segment(seg: &mut DubbingSegment, trans: String) {
    if crate::translate::is_translate_error(&trans) {
        seg.status = "translate_failed".to_string();
        seg.dubbed_text = String::new();
    } else {
        seg.dubbed_text = trans;
    }
}

/// Chọn nội dung để TTS đọc cho 1 segment.
/// - `None` → câu này KHÔNG được phát âm (dịch lỗi, hoặc không có nội dung nào để đọc).
/// - `Some(text)` → text cần đọc (bản dịch; nếu chưa có bản dịch thì fallback text gốc).
///
/// Quy tắc quan trọng: câu dịch lỗi KHÔNG BAO GIỜ được đọc ra loa — không đọc nhãn
/// lỗi, cũng không đọc lại text gốc.
pub fn select_synth_text(seg: &DubbingSegment) -> Option<&str> {
    // 1. Dịch lỗi → bỏ qua câu này hoàn toàn.
    if seg.status == "translate_failed" {
        return None;
    }
    let dubbed = seg.dubbed_text.trim();
    if !dubbed.is_empty() {
        // 2. Phòng thủ: nếu nhãn lỗi lọt vào dubbed_text thì cũng không được đọc.
        if crate::translate::is_translate_error(dubbed) {
            return None;
        }
        return Some(dubbed);
    }
    // 3. Chưa có bản dịch (chế độ chỉ phụ đề / chưa bấm dịch) → đọc text gốc như cũ.
    let original = seg.original_text.trim();
    if original.is_empty() {
        return None;
    }
    Some(original)
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
    /// v0.11.32 (PO): nguồn transcript — "whisper" hoặc "srt:<lang>" khi dùng
    /// file phụ đề có sẵn cạnh video (tải từ YouTube — chính xác hơn STT).
    #[serde(default)]
    pub transcript_source: Option<String>,
    #[serde(default)]
    pub peaks: Option<Vec<f32>>,
    #[serde(default)]
    pub filmstrip_thumbs: Option<Vec<FilmstripThumb>>,
    /// v0.11.33: Chế độ xuất phụ đề: "softsub" (mặc định - nhúng track phụ đề vào MP4 bật/tắt trong VLC) | "hardsub" | "none"
    #[serde(default = "default_sub_export_mode")]
    pub sub_export_mode: Option<String>,
    /// v0.11.33: Chế độ xuất âm thanh: "multitrack" (mặc định - VLC chọn Track 1: Gốc, Track 2: Thuyết minh) | "mixed" | "original"
    #[serde(default = "default_audio_export_mode")]
    pub audio_export_mode: Option<String>,
    /// Ngôn ngữ target (ISO code: "vi", "en",...)
    #[serde(default)]
    pub target_lang: Option<String>,
}

fn default_dubbing_mode() -> String {
    "ducking".to_string()
}

fn default_sub_export_mode() -> Option<String> {
    Some("softsub".to_string())
}

fn default_audio_export_mode() -> Option<String> {
    Some("multitrack".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DubbingProgress {
    pub stage: String, // "extracting" | "transcribing" | "diarizing" | "scripting" | "synthesizing" | "remuxing" | "done"
    pub percent: f32,
    pub message: String,
    pub current_item: usize,
    pub total_items: usize,
    /// Định danh lượt chạy (echo từ frontend) — listener lọc theo `run_id` để không
    /// lẫn tiến trình giữa nhiều tab (xem `docs/STUDIO_TABS_PLAN.md` §3.3).
    ///
    /// Không có `run_id` ⇒ payload **giống hệt** bản cũ (tương thích ngược).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub run_id: Option<String>,
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

/// Prefix used by the VietNeu TTS engine voice ids (frontend model `vietneu`).
pub const VIETNEU_VOICE_PREFIX: &str = "vietneu:";

/// Normalize a voice id coming from the frontend into an id the backend can
/// actually route to a TTS engine.
///
/// The frontend stores VietNeu ids (`vietneu:vi_bac_nam`) in `speaker.voice`.
/// The backend knows nothing about that prefix, so the id used to reach
/// Edge-TTS, which rejects it: every segment failed and the exported MP4 came
/// out with no dubbed voice at all. This mirrors the frontend helper
/// `mapVoiceForEngine` (src/views/SublixStudioView.tsx): VietNeu ids are
/// mapped onto the local Kokoro voices, while `kokoro:` ids and Edge-TTS ids
/// (`vi-VN-HoaiMyNeural`) pass through unchanged.
pub fn normalize_voice_id(voice: &str) -> String {
    let id = voice.trim();
    if !id.starts_with(VIETNEU_VOICE_PREFIX) {
        return id.to_string();
    }
    // Same order as the frontend helper so both sides agree on the mapping.
    let kokoro_id = if id.contains("bac_nu") {
        "mai_linh"
    } else if id.contains("nam_nu") || id.contains("hue_nu") {
        "ngoc_huyen"
    } else if id.contains("bac_nam") {
        "tuan_ngoc"
    } else if id.contains("nam_nam") {
        "manh_dung"
    } else if id.contains("thoisu") {
        "hung_thinh"
    } else {
        "tuan_ngoc"
    };
    format!("{}{}", KOKORO_VOICE_PREFIX, kokoro_id)
}

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
        .arg(vi_normalize::normalize_vi(text))
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

/// Per-item outcome of a Kokoro batch synthesis.
#[derive(Debug, Clone)]
pub struct KokoroBatchItemResult {
    /// True when the item was synthesized and written to disk.
    pub ok: bool,
    /// Number of audio samples written (0 when the item failed).
    pub samples: u64,
    /// Error message when the item failed (None on success).
    pub error: Option<String>,
}

/// Parse one machine-readable line emitted by the Kokoro batch sidecar.
///
/// `OK <index> <out_path> <num_samples>` or `ERR <index> <single_line_error>`.
/// The output path may contain spaces, so it is parsed from the right.
fn parse_kokoro_batch_line(line: &str) -> Option<(usize, bool, u64, String)> {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix("OK ") {
        let mut tail = rest.rsplitn(2, ' ');
        let samples = tail.next()?.trim().parse::<u64>().ok()?;
        let head = tail.next()?;
        let mut head_parts = head.splitn(2, ' ');
        let index = head_parts.next()?.trim().parse::<usize>().ok()?;
        let path = head_parts.next().unwrap_or("").trim().to_string();
        Some((index, true, samples, path))
    } else if let Some(rest) = line.strip_prefix("ERR ") {
        let mut parts = rest.splitn(2, ' ');
        let index = parts.next()?.trim().parse::<usize>().ok()?;
        let message = parts.next().unwrap_or("").trim().to_string();
        Some((index, false, 0, message))
    } else {
        None
    }
}

/// Synthesize many lines with a SINGLE Kokoro process.
///
/// The Kokoro ONNX model weighs ~325 MB and needs seconds to load, so the old
/// one-process-per-line path cost ~12 s per sentence (a 323-line export took
/// over an hour). Batch mode loads the model once per voice and writes every
/// item in one pass.
///
/// Items are `(text, voice id, output path)`; the returned vector carries one
/// outcome per item. A single failing item never aborts the whole batch.
pub fn synthesize_kokoro_batch(
    items: &[(String, String, PathBuf)],
) -> Result<Vec<KokoroBatchItemResult>> {
    if items.is_empty() {
        return Ok(Vec::new());
    }
    let model_dir = kokoro_model_dir();
    if !model_dir.join("kokoro_vi.onnx").exists() {
        anyhow::bail!(
            "Chưa tải model Kokoro-Vietnamese (thiếu {}). Vào tab Studio Lồng Tiếng để tải.",
            model_dir.join("kokoro_vi.onnx").display()
        );
    }
    let script = ensure_kokoro_script()?;
    let python = find_python();

    // Manifest: [{"text": ..., "voice": ..., "out": ...}, ...] — json.load() by the sidecar.
    let manifest_path =
        std::env::temp_dir().join(format!("sublix_kokoro_batch_{}.json", gen_unique_id()));
    let manifest: Vec<serde_json::Value> = items
        .iter()
        .map(|(text, voice, out)| {
            let voice_id = voice.trim();
            let voice_id = voice_id
                .strip_prefix(KOKORO_VOICE_PREFIX)
                .unwrap_or(voice_id)
                .trim();
            serde_json::json!({
                "text": vi_normalize::normalize_vi(text),
                "voice": voice_id,
                "out": out.to_string_lossy(),
            })
        })
        .collect();
    let manifest_json = serde_json::to_string(&manifest).context("Serialize manifest Kokoro")?;
    fs::write(&manifest_path, manifest_json)
        .with_context(|| format!("Ghi manifest Kokoro vào {}", manifest_path.display()))?;

    let mut cmd = Command::new(&python);
    cmd.arg(&script)
        .arg("--batch")
        .arg(&manifest_path)
        .arg("--model-dir")
        .arg(&model_dir)
        .arg("--device")
        .arg("cpu")
        .arg("--speed")
        .arg("1.0")
        .arg("--crossfade-ms")
        .arg("50")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let child = cmd
        .spawn()
        .with_context(|| "Không chạy được sidecar Kokoro (thiếu python?)")?;
    // Register the PID so the user can still cancel a long batch.
    ACTIVE_CHILD_PID.store(child.id(), Ordering::SeqCst);
    let output = child
        .wait_with_output()
        .context("Chờ sidecar Kokoro batch")?;
    ACTIVE_CHILD_PID.store(0, Ordering::SeqCst);
    let _ = fs::remove_file(&manifest_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!(
            "Kokoro batch TTS thất bại (exit code: {:?}): {}",
            output.status.code(),
            stderr.trim()
        );
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results: Vec<KokoroBatchItemResult> = items
        .iter()
        .map(|_| KokoroBatchItemResult {
            ok: false,
            samples: 0,
            error: Some("Kokoro chưa trả kết quả cho câu này.".to_string()),
        })
        .collect();

    for line in stdout.lines() {
        let Some((index, ok, samples, detail)) = parse_kokoro_batch_line(line) else {
            continue;
        };
        if index >= results.len() {
            continue;
        }
        results[index] = if ok {
            KokoroBatchItemResult {
                ok: true,
                samples,
                error: None,
            }
        } else {
            KokoroBatchItemResult {
                ok: false,
                samples: 0,
                error: Some(detail),
            }
        };
    }

    Ok(results)
}

// ===========================================================================
// v0.9.9 — Voice catalog & pre-generated audition samples.
// Cho phép chọn model → xem danh sách giọng Nam/Nữ TRƯỚC khi đọc thật:
// mẫu nghe thử được tạo 1 lần rồi cache trên đĩa, các lần sau phát tức thì.
// ===========================================================================

/// Folder that caches pre-generated audition samples for a model.
/// TSK-FEAT-VOICE-SAMPLE-CACHE: logic thật nằm ở module `voice_samples`.
pub fn voice_samples_dir(model_id: &str) -> PathBuf {
    voice_samples::samples_dir_for_model(model_id)
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
/// TSK-FEAT-VOICE-SAMPLE-CACHE: logic thật nằm ở module `voice_samples`.
pub fn generate_kokoro_samples(app: &AppHandle) -> Result<u32> {
    voice_samples::generate_kokoro_samples(app)
}

/// Cached audition sample as a data URI for instant playback (None when the
/// sample has not been generated yet — callers fall back to live synthesis).
/// TSK-FEAT-VOICE-SAMPLE-CACHE: logic thật nằm ở module `voice_samples`.
pub fn voice_sample_data(model_id: &str, voice_id: &str) -> Option<String> {
    voice_samples::sample_data_for_model(model_id, voice_id)
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
    // Engine mới (cần tải model / API key mới dùng được — UI làm xám theo `tts_engines_status`).
    voices.extend(tts_vieneu::get_voices());
    voices.extend(tts_zerotts::get_voices());
    voices.extend(tts_cloud::get_voices());
    voices
}

/// Đuôi file đầu ra theo engine: offline (Kokoro/VieNeu/ZeroTTS) và Google ghi WAV; Edge/FPT ghi MP3.
pub fn voice_file_ext(voice: &str) -> &'static str {
    if voice.starts_with(KOKORO_VOICE_PREFIX)
        || voice.starts_with(VIETNEU_VOICE_PREFIX)
        || voice.starts_with(tts_zerotts::VOICE_PREFIX)
    {
        "wav"
    } else {
        tts_cloud::file_ext(voice)
    }
}

/// Engine offline chạy sidecar batch (nạp model 1 lần cho cả lô): Kokoro / VieNeu / ZeroTTS.
fn batch_engine_of(voice: &str) -> Option<&'static str> {
    if voice.starts_with(KOKORO_VOICE_PREFIX) {
        Some("kokoro")
    } else if voice.starts_with(VIETNEU_VOICE_PREFIX) {
        Some("vieneu")
    } else if voice.starts_with(tts_zerotts::VOICE_PREFIX) && tts_zerotts::available() {
        Some("zerotts")
    } else {
        None
    }
}

/// Tổng hợp một lô cùng giọng bằng đúng engine; trả kết quả theo `KokoroBatchItemResult` để dùng lại logic cũ.
fn synthesize_batch_for(voice: &str, items: &[(String, String, PathBuf)]) -> Result<Vec<KokoroBatchItemResult>> {
    let to_k = |r: Vec<tts_common::BatchResult>| -> Vec<KokoroBatchItemResult> {
        r.into_iter().map(|x| KokoroBatchItemResult { ok: x.ok, samples: x.samples, error: x.error }).collect()
    };
    match batch_engine_of(voice) {
        Some("vieneu") => Ok(to_k(tts_vieneu::synthesize_batch(items)?)),
        Some("zerotts") => Ok(to_k(tts_zerotts::synthesize_batch(items)?)),
        _ => synthesize_kokoro_batch(items),
    }
}

/// Synthesize a speech file via edge-tts with python -m fallback
pub fn synthesize_speech(text: &str, voice: &str, rate: &str, pitch: &str, out_path: &Path) -> Result<()> {
    // Chuẩn hóa voice id trước (VD `vietneu:vi_bac_nam` -> `kokoro:tuan_ngoc`).
    // Đây là điểm nghẽn duy nhất nên cả preview lẫn export đều đi đúng engine.
    // `vietneu:*`: VieNeu thật nếu model đã tải + deps đã cài, chưa thì Kokoro như cũ (BUG-074, không mất tiếng project cũ).
    let normalized = tts_vieneu::route_voice(voice);
    let voice = normalized.as_str();
    // Chuẩn hóa số/ngày/giờ… thành chữ cho MỌI engine tiếng Việt (Kokoro từng bỏ rơi chữ số).
    let spoken_text;
    let text = if vi_normalize::is_vietnamese_voice(voice) {
        spoken_text = vi_normalize::normalize_vi(text);
        spoken_text.as_str()
    } else {
        text
    };
    if voice.starts_with(VIETNEU_VOICE_PREFIX) {
        return tts_vieneu::synthesize_one(text, voice, out_path);
    }
    if voice.starts_with(tts_zerotts::VOICE_PREFIX) {
        if !tts_zerotts::deps_ready() {
            anyhow::bail!("ZeroTTS chưa cài thư viện Python — tải model trong trung tâm tải model để cài tự động.");
        }
        return tts_zerotts::synthesize_one(text, voice, out_path);
    }
    if voice.starts_with(tts_cloud::GCLOUD_PREFIX) || voice.starts_with(tts_cloud::FPTAI_PREFIX) {
        return tts_cloud::synthesize(voice, text, out_path);
    }
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
    // Chặn nhãn lỗi dịch: không được đọc "[Dịch lỗi: ...]" thành tiếng.
    if crate::translate::is_translate_error(text) {
        return Err(anyhow::anyhow!(
            "Câu này dịch lỗi nên không có bản dịch để nghe thử. Hãy dịch lại câu này."
        ));
    }
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

/// v0.11.34 (BUG SRT rolling-caption): chuyen segment tu file .srt co san sang
/// cau truc dubbing.
///
/// KHAC voi `clean_and_merge_raw_segments` (danh cho output Whisper: loc ao giac
/// + ghep cau), ham nay GIU NGUYEN moi cue co text that - chi loai cue marker
/// dac thu cua rolling-caption:
/// - text rong
/// - text chi gom ngoac vuong / ngoac tron / khoang trang (vi du "[ ]")
/// - thoi luong < 55 ms (cue "luong" 10 ms lap lai cue truoc do)
///
/// File rolling-caption that: 155 cue -> 78 cue dung de long tieng.
///
/// Buoc 2 cat phan trung cua rolling-caption (text cumulative) — chi rut gon
/// text, SO CUE giu nguyen.
pub fn srt_segments_to_dubbing(
    raw_segments: Vec<crate::file_sub::SubtitleSegment>,
    src_lang: &str,
    expected_speakers: Option<usize>,
) -> Vec<DubbingSegment> {
    let is_cjk = matches!(
        src_lang.to_lowercase().as_str(),
        "ja" | "japanese" | "zh" | "chinese"
    );

    // 1. Loc cue marker, giu nguyen cue co text that.
    let mut kept: Vec<(f64, f64, String)> = Vec::with_capacity(raw_segments.len());
    for seg in raw_segments {
        let start_sec = parse_srt_time_to_seconds(&seg.start_time);
        let end_sec = parse_srt_time_to_seconds(&seg.end_time);
        let dur = end_sec - start_sec;

        let text = seg.original.trim();
        if text.is_empty() || is_srt_marker_text(text, is_cjk) {
            continue;
        }
        // Cue "luong" ~10 ms cua rolling-caption (lap lai cue truoc do).
        if dur < 0.055 {
            continue;
        }

        kept.push((start_sec, end_sec, text.to_string()));
    }

    if kept.is_empty() {
        return Vec::new();
    }

    // 2. Cat phan trung rolling-caption (text cumulative).
    //    File rolling-caption lap lai toan bo text cue truoc roi them phan moi
    //    ("... There are few" -> "... There are few of us left."). Giu nguyen se
    //    khien TTS doc lai moi cau nhieu lan -> audio lap/chong nhau.
    let mut prev_deduped: Option<String> = None;
    for entry in kept.iter_mut() {
        let current = entry.2.clone();
        if let Some(prev) = prev_deduped.as_deref() {
            let (_, deduped) = dedupe_rolling_overlap(prev, &current);
            entry.2 = deduped;
        }
        // Text DA dedupe lai la "prev" cho cue ke tiep.
        prev_deduped = Some(entry.2.clone());
    }

    // 3. Gan speaker_id: dung cung luat turn-boundary voi nhanh Whisper de hanh vi
    //    nhat quan (sherpa diarization se ghi de neu co model).
    let max_spk = expected_speakers.unwrap_or(2).max(1);
    let mut current_speaker_idx = 0;
    let mut last_end = 0.0;
    let mut segments: Vec<DubbingSegment> = Vec::with_capacity(kept.len());

    for (idx, (start_sec, end_sec, text)) in kept.into_iter().enumerate() {
        let pause = start_sec - last_end;
        let prev_text = segments
            .last()
            .map(|s: &DubbingSegment| s.original_text.as_str())
            .unwrap_or("");
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
            // dubbed_text se duoc buoc dich (step 4) gan sau, giong nhanh Whisper.
            dubbed_text: String::new(),
            audio_duration_sec: None,
            status: "ready".to_string(),
        });
    }

    segments
}

/// Cue marker cua rolling-caption: text chi gom ngoac / khoang trang (vi du
/// "[ ]", "[]") - khong phai loi thoai nen khong long tieng.
fn is_srt_marker_text(text: &str, is_cjk: bool) -> bool {
    let stripped: String = text
        .chars()
        .filter(|c| {
            if c.is_whitespace() || *c == '[' || *c == ']' || *c == '(' || *c == ')' {
                return false;
            }
            // Ngoac rong (full-width) chi xuat hien trong phu de CJK.
            !(is_cjk
                && (*c == '\u{FF08}'
                    || *c == '\u{FF09}'
                    || *c == '\u{FF3B}'
                    || *c == '\u{FF3D}'
                    || *c == '\u{300C}'
                    || *c == '\u{300D}'))
        })
        .collect();
    stripped.is_empty()
}

/// So khoang trung giua hai cue lien tiep cua rolling-caption.
///
/// Tim so tu `k` LON NHAT sao cho `k` tu cuoi cua `prev_words` bang `k` tu dau
/// cua `cur_words`. Neu `k >= MIN_OVERLAP_WORDS` (3) thi cat `k` tu dau
/// `cur_words` de bo phan trung. Khi overlap < 3 tu (vi du hai cau ngan trung
/// nhau) thi GIU NGUYEN de tranh cat nham.
///
/// `prev_text` phai la text DA dedupe cua cue truoc do.
///
/// Tra ve `(so tu bi cat, text moi)`. Neu cat xong text bi rong thi giu nguyen
/// text goc (khong tao cue rong).
fn dedupe_rolling_overlap(prev_text: &str, cur_text: &str) -> (usize, String) {
    /// Nguong toi thieu de coi la overlap that (tranh cat nham cau ngan).
    const MIN_OVERLAP_WORDS: usize = 3;

    let prev_words: Vec<&str> = prev_text.split_whitespace().collect();
    let cur_words: Vec<&str> = cur_text.split_whitespace().collect();
    if prev_words.is_empty() || cur_words.is_empty() {
        return (0, cur_text.to_string());
    }

    let max_k = prev_words.len().min(cur_words.len());
    let mut best_k = 0usize;
    for k in (1..=max_k).rev() {
        if prev_words[prev_words.len() - k..] == cur_words[..k] {
            best_k = k;
            break;
        }
    }

    if best_k < MIN_OVERLAP_WORDS {
        return (0, cur_text.to_string());
    }

    let deduped = cur_words[best_k..].join(" ");
    if deduped.trim().is_empty() {
        // Cue hien tai nam trong hoan toan trong cue truoc -> giu nguyen.
        return (0, cur_text.to_string());
    }

    (best_k, deduped)
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
///
/// [TSK-FIX-SPEAKER-ROLES] `voice_genders` = giới tính **đo từ F0** (pitch) của
/// từng cụm người nói (key = `speaker_id`). Có giá trị rõ ràng → dùng giọng TTS
/// theo giới tính thật; vùng "không chắc" → giữ mặc định cũ + đánh dấu `(~)`
/// trong label (nghĩa là "ước tính", không chắc từ giọng).
pub fn generate_default_speakers(
    tgt_lang: &str,
    active_speaker_ids: &[String],
    expected_speakers: Option<usize>,
    voice_genders: Option<&HashMap<String, speaker_assign::PitchGender>>,
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
        let fallback_male = if expected_speakers == Some(2) || expected_speakers == Some(1) {
            true
        } else {
            idx % 2 == 0
        };
        // [TSK-FIX-SPEAKER-ROLES] Ưu tiên giới tính ĐO TỪ GIỌNG (F0) — chỉ dùng khi
        // pitch rõ ràng; vùng "không chắc" ⇒ giữ mặc định + đánh dấu `(~)`.
        let pitch_hint = voice_genders.and_then(|m| m.get(spk_id.as_str()).copied());
        let (is_male, gender_known) = match pitch_hint {
            Some(speaker_assign::PitchGender::Male) => (true, true),
            Some(speaker_assign::PitchGender::Female) => (false, true),
            _ => (fallback_male, false),
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

        // [TSK-FIX-SPEAKER-ROLES] Đánh dấu "(~)" khi giới tính KHÔNG chắc từ F0
        // (vùng 165–180 Hz hoặc không đo được) → người dùng biết đây là ước tính.
        let label = if voice_genders.is_some() && !gender_known {
            format!("{label} (~)")
        } else {
            label
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
///
/// [TSK-FIX-SPEAKER-ROLES] `voice_genders` = giới tính đo từ F0 (key = `speaker_id`).
/// - `Some(..)` ⇒ đã có phân vai theo **GIỌNG** (sherpa): MiniMax **KHÔNG** gán lại
///   người nói, chỉ được **ĐẶT TÊN** nhân vật + dịch; `speaker_id` giữ nguyên.
/// - `None` ⇒ chưa có sherpa: MiniMax phân vai từ chữ (như cũ).
pub fn diarize_and_script_via_minimax(
    segments: &mut [DubbingSegment],
    source_lang: &str,
    target_lang: &str,
    api_key: &str,
    model: &str,
    voice_genders: Option<&HashMap<String, speaker_assign::PitchGender>>,
) -> Result<Vec<DubbingSpeaker>> {
    if segments.is_empty() {
        return Ok(Vec::new());
    }

    let model_name = if model.trim().is_empty() {
        "MiniMax-M3"
    } else {
        model.trim()
    };

    let preserve_voice_ids = voice_genders.is_some();
    let mut transcript_text = String::new();
    for s in segments.iter() {
        if preserve_voice_ids {
            // Có speaker_id theo giọng → đưa vào prompt để LLM đặt tên đúng cụm.
            transcript_text.push_str(&format!(
                "{} | {} [{:.1}s - {:.1}s]: {}\n",
                s.speaker_id, s.id, s.start_sec, s.end_sec, s.original_text
            ));
        } else {
            transcript_text.push_str(&format!(
                "{} [{:.1}s - {:.1}s]: {}\n",
                s.id, s.start_sec, s.end_sec, s.original_text
            ));
        }
    }

    let system_prompt = if preserve_voice_ids {
        format!(
            "Bạn là đạo diễn lồng tiếng phim và biên kịch chuyên nghiệp.\n\
             Dưới đây là các câu thoại trong video (ngôn ngữ gốc: {}).\n\
             Người nói ĐÃ được AI tách sẵn theo giọng nói — mỗi dòng có `speaker_id` cố định.\n\
             Nhiệm vụ:\n\
             1. ĐẶT TÊN nhân vật cho mỗi `speaker_id` (dùng đúng `speaker_id` đã cho, KHÔNG tự gán lại người nói).\n\
             2. Dịch lời thoại sang tiếng {} điện ảnh tự nhiên, phù hợp khẩu hình và cảm xúc nhân vật.\n\
             QUY TẮC BẮT BUỘC: Trả về DUY NHẤT một JSON array thuần túy (không kèm giải thích, không markdown):\n\
             [\n  {{\"id\": 1, \"speaker_id\": \"speaker_0\", \"speaker\": \"Tên Nhân Vật\", \"gender\": \"male\", \"text\": \"Lời dịch...\"}}\n]",
            source_lang.to_uppercase(),
            target_lang.to_uppercase()
        )
    } else {
        format!(
            "Bạn là đạo diễn lồng tiếng phim và chuyên gia phân vai (Speaker Diarization) chuyên nghiệp.\n\
         Dưới đây là danh sách các câu thoại trong video (ngôn ngữ gốc: {}).\n\
         Nhiệm vụ:\n\
         1. Phân vai chính xác cho từng câu thoại: chỉ ra tên nhân vật (speaker) và giới tính (gender: \"male\" hoặc \"female\").\n\
         2. Dịch lời thoại sang tiếng {} điện ảnh tự nhiên, phù hợp khẩu hình và cảm xúc nhân vật.\n\
         QUY TẮC BẮT BUỘC: Trả về DUY NHẤT một JSON array thuần túy (không kèm giải thích, không markdown):\n\
         [\n  {{\"id\": 1, \"speaker\": \"Tên Nhân Vật\", \"gender\": \"male\", \"text\": \"Lời dịch...\"}}\n]",
            source_lang.to_uppercase(),
            target_lang.to_uppercase()
        )
    };

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

    // [TSK-FIX-SPEAKER-ROLES] Đã có phân vai theo GIỌNG (sherpa) ⇒ MiniMax KHÔNG
    // được gán lại người nói; chỉ được ĐẶT TÊN nhân vật + DỊCH.
    let preserve_voice_ids = voice_genders.is_some();
    // Bỏ phiếu tên nhân vật theo cụm: cụm giọng → {tên: số lần}.
    let mut name_votes: HashMap<String, HashMap<String, usize>> = HashMap::new();
    // Giới tính do LLM đoán (chỉ dùng khi KHÔNG có pitch).
    let mut llm_gender: HashMap<String, String> = HashMap::new();

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
            speaker_order.push((spk_slug.clone(), label, gender.clone()));
        }
        llm_gender.insert(spk_slug.clone(), gender.clone());

        if let Some(seg) = segments.iter_mut().find(|s| s.id == id) {
            if preserve_voice_ids {
                // Giữ nguyên speaker_id theo giọng; chỉ gom tên để đặt nhãn.
                let votes = name_votes.entry(seg.speaker_id.clone()).or_default();
                *votes.entry(speaker_name.to_string()).or_insert(0) += 1;
            } else {
                seg.speaker_id = spk_slug;
            }
            if !text.is_empty() {
                // Dùng chung quy tắc: nhãn lỗi dịch không bao giờ nằm trong dubbed_text.
                apply_translation_to_segment(seg, text.to_string());
            }
        }
    }

    if preserve_voice_ids {
        // Dựng danh sách vai THEO CỤM GIỌNG (speaker_id đã tách sẵn), tên lấy theo
        // đa số phiếu, giới tính ưu tiên PITCH (F0) rồi mới tới giới tính LLM.
        let mut cluster_ids: Vec<String> = segments.iter().map(|s| s.speaker_id.clone()).collect();
        cluster_ids.sort();
        cluster_ids.dedup();
        speaker_order.clear();
        for cluster_id in cluster_ids {
            let name = name_votes
                .get(&cluster_id)
                .and_then(|votes| {
                    votes
                        .iter()
                        .max_by_key(|(_, count)| **count)
                        .map(|(name, _)| name.clone())
                })
                .unwrap_or_else(|| format!("Speaker {}", &cluster_id));
            let pitch_gender = voice_genders
                .and_then(|m| m.get(cluster_id.as_str()))
                .copied();
            let is_female = match pitch_gender {
                Some(speaker_assign::PitchGender::Female) => true,
                Some(speaker_assign::PitchGender::Male) => false,
                _ => {
                    let slug = slugify_speaker(&name);
                    llm_gender
                        .get(&slug)
                        .map(|g| g.contains("female") || g.contains("nữ"))
                        .unwrap_or(false)
                }
            };
            let label = format!("{} ({})", name, if is_female { "Nữ" } else { "Nam" });
            speaker_order.push((
                cluster_id.clone(),
                label,
                if is_female { "female".to_string() } else { "male".to_string() },
            ));
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

/// Nền tảng của file phụ đề có sẵn đang dùng — để hiện đúng "từ Bilibili"
/// thay vì luôn "từ YouTube". Đọc manifest `sublix_subtitles.json`; khi không
/// có manifest (file tải trước v0.11.32) thì mặc định "YouTube" như cũ.
fn sibling_srt_source_label(video: &Path, lang: &str) -> String {
    let fallback = "YouTube".to_string();
    let Some(dir) = video.parent() else {
        return fallback;
    };
    let Some(stem) = video.file_stem().map(|s| s.to_string_lossy().to_string()) else {
        return fallback;
    };
    let Some(vid) = crate::downloader::extract_bracketed_video_id(&stem) else {
        return fallback;
    };
    let source = crate::downloader::subtitle_source(dir, &vid, lang)
        .filter(|s| s != "file")
        .unwrap_or_else(|| "youtube".to_string());
    crate::downloader::platform_source_label(&source)
        .unwrap_or("YouTube")
        .to_string()
}

/// v0.11.32 (PO — "sub YouTube chính xác hơn STT của mình"): tìm file phụ đề
/// `.srt` có sẵn NGAY CẠNH video (dạng `<tên video>.<lang>.srt` do nút
/// "📝 Tải phụ đề" sinh ra). Ưu tiên: đúng ngôn ngữ nguồn → bản gốc en → vi
/// → ja → zh → còn lại. Trả về (đường dẫn, mã ngôn ngữ).
fn find_sibling_srt(video: &Path, src_lang: Option<&str>) -> Option<(PathBuf, String)> {
    let dir = video.parent()?;
    let stem = video.file_stem()?.to_string_lossy().to_string();
    let prefix = format!("{stem}.");
    let mut candidates: Vec<(String, PathBuf)> = Vec::new();
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().ends_with(".srt") {
            continue;
        }
        let Some(rest) = name.strip_prefix(&prefix) else {
            continue;
        };
        // Cắt đuôi ".srt" (4 ký tự) — phần còn lại là mã ngôn ngữ ("en", "en-orig", "vi"…).
        if rest.len() <= 4 {
            continue;
        }
        let lang = rest[..rest.len() - 4].to_string();
        candidates.push((lang, entry.path()));
    }
    if candidates.is_empty() {
        return None;
    }
    let priority = |lang: &str| -> u8 {
        let l = lang.to_lowercase();
        if let Some(src) = src_lang {
            let s = src.trim().to_lowercase();
            if !s.is_empty() && s != "auto" {
                if l == s {
                    return 0;
                }
                if l == format!("{s}-orig") {
                    return 1;
                }
            }
        }
        match l.as_str() {
            "en-orig" => 2,
            "en" | "en-us" => 3,
            "vi" => 4,
            "ja" => 5,
            "zh" | "zh-hans" | "zh-hant" | "zh-cn" => 6,
            // Phụ đề AI tự sinh của Bilibili (`ai-zh`, `ai-en`) — thấp hơn bản
            // do người dùng đăng, nhưng vẫn hơn "không rõ nguồn".
            "ai-en" | "ai-zh" => 7,
            _ => 8,
        }
    };
    candidates.sort_by(|a, b| (priority(&a.0), a.0.clone()).cmp(&(priority(&b.0), b.0.clone())));
    candidates.into_iter().next().map(|(lang, path)| (path, lang))
}

/// v0.11.32: file .srt ngoài phủ TOÀN BỘ video (mốc thời gian tuyệt đối),
/// còn chuỗi xử lý hiện tại làm việc trên hệ toạ độ "đã cắt audio". Hàm này
/// lọc theo cửa sổ [offset, offset+limit] rồi trừ offset — nhờ đó nhánh dùng
/// SRT sẵn và nhánh Whisper cho ra cùng một hệ toạ độ (offset được cộng lại
/// ở bước sau, giống hệt nhau).
///
/// BUG-3: file .srt tải về từ YouTube có thể phủ video DÀI HƠN NHIỀU lần video
/// local (ví dụ video 5:27 nhưng .srt dài 5 tiếng). Vì vậy:
/// - cue bắt đầu sau `offset + limit` → loại hẳn;
/// - cue bắt đầu trong cửa sổ nhưng kết thúc vượt `offset + limit` → **cắt
///   `end` về đúng `limit`** (nếu không, timeline có khối tràn ra ngoài video và
///   sinh ra "tiếng thừa dài ngoằng");
/// - `limit` phải là thời lượng VIDEO THẬT (xem `window_limit` trong
///   `analyze_and_create_project_full`), không phải con số 0/None.
fn crop_srt_to_window(
    segments: Vec<crate::file_sub::SubtitleSegment>,
    offset: f64,
    limit: Option<f64>,
) -> Vec<crate::file_sub::SubtitleSegment> {
    let limit = limit.filter(|l| *l > 0.0);
    let end_cap = limit.map(|l| offset + l);
    if offset <= 0.0 && end_cap.is_none() {
        return segments;
    }
    segments
        .into_iter()
        .filter_map(|mut s| {
            let st = parse_srt_time_to_seconds(&s.start_time);
            let en = parse_srt_time_to_seconds(&s.end_time);
            // Cue kết thúc trước cửa sổ phân tích → bỏ.
            if en <= offset {
                return None;
            }
            // Cue bắt đầu sau cửa sổ (nằm ngoài video) → bỏ.
            if end_cap.map(|cap| st >= cap).unwrap_or(false) {
                return None;
            }
            let new_st = (st - offset).max(0.0);
            let mut new_en = en - offset;
            // Cắt đuôi cue về đúng thời lượng video.
            if let Some(l) = limit {
                new_en = new_en.min(l);
            }
            // Cue cần tối thiểu 50ms để phát âm.
            new_en = new_en.max(new_st + 0.05);
            if let Some(l) = limit {
                // Cue bắt đầu sát đuôi video → không đủ chỗ cho 50ms → loại hẳn.
                if new_st + 0.05 > l {
                    return None;
                }
                new_en = new_en.min(l);
            }
            // Sau khi cắt mà rỗng/rời → loại hẳn cue.
            if new_en <= new_st {
                return None;
            }
            s.start_time = fmt_srt_time(new_st);
            s.end_time = fmt_srt_time(new_en);
            Some(s)
        })
        .collect()
}

/// v0.11.32 (PO): thông tin phụ đề có sẵn cạnh video (để Studio hiển thị
/// "có sẵn: en (YouTube), vi" và bật checkbox tận dụng).
#[derive(Debug, Clone, Serialize)]
pub struct AvailableSubtitle {
    pub lang: String,
    /// Nguồn của phụ đề: "youtube" | "bilibili" | "douyin" | … | "file"
    /// (id nền tảng ghi trong manifest `sublix_subtitles.json`).
    pub source: String,
}

/// v0.11.32: liệt kê phụ đề có sẵn cạnh video + đánh dấu file nào là phụ đề YouTube.
pub fn available_subtitles(file_path: &str) -> Vec<AvailableSubtitle> {
    let p = Path::new(file_path);
    let Some(dir) = p.parent() else {
        return Vec::new();
    };
    let Some(stem) = p.file_stem().map(|s| s.to_string_lossy().to_string()) else {
        return Vec::new();
    };
    let prefix = format!("{stem}.");
    let video_id = crate::downloader::extract_bracketed_video_id(&stem);
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.to_lowercase().ends_with(".srt") {
                continue;
            }
            let Some(rest) = name.strip_prefix(&prefix) else {
                continue;
            };
            if rest.len() <= 4 {
                continue;
            }
            let lang = rest[..rest.len() - 4].to_string();
            // Đánh dấu YouTube: tên có cùng tag [video_id] với video (quy cách tải
            // của app — backfill cả file tải TRƯỚC v0.11.32) HOẶC manifest xác nhận.
            let name_tag = crate::downloader::extract_bracketed_video_id(&name);
            // Manifest là nguồn sự thật (ghi đúng nền tảng đã tải: youtube,
            // bilibili, douyin…). Nếu không có manifest (file tải trước v0.11.32)
            // thì dùng heuristic cũ: file có cùng tag [video_id] → coi như
            // phụ đề YouTube.
            let source = match video_id.as_deref() {
                Some(vid) => crate::downloader::subtitle_source(dir, vid, &lang)
                    .or_else(|| {
                        if name_tag.as_deref() == Some(vid) {
                            Some("youtube".to_string())
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| "file".to_string()),
                None => "file".to_string(),
            };
            out.push(AvailableSubtitle { lang, source });
        }
    }
    out.sort_by(|a, b| a.lang.cmp(&b.lang));
    out
}

/// v0.11.32: định dạng giây → "HH:MM:SS,mmm" (chuẩn SRT).
fn fmt_srt_time(secs: f64) -> String {
    let total_ms = (secs.max(0.0) * 1000.0).round() as u64;
    let ms = total_ms % 1000;
    let total_s = total_ms / 1000;
    let s = total_s % 60;
    let m = (total_s / 60) % 60;
    let h = total_s / 3600;
    format!("{h:02}:{m:02}:{s:02},{ms:03}")
}

/// v0.11.32: bản cũ 7 tham số — giữ tương thích cho examples/tests (mặc định
/// tận dụng phụ đề có sẵn cạnh video).
pub fn analyze_and_create_project(
    app: Option<&AppHandle>,
    input_path: &str,
    source_lang: Option<String>,
    target_lang: Option<String>,
    time_limit_sec: Option<f64>,
    start_offset_sec: Option<f64>,
    expected_speakers: Option<usize>,
) -> Result<DubbingProject> {
    analyze_and_create_project_full(
        app,
        input_path,
        source_lang,
        target_lang,
        time_limit_sec,
        start_offset_sec,
        expected_speakers,
        None,
        None,
    )
}

/// Analyze media, extract transcript, cluster speakers, and generate translated dubbing script.
/// `prefer_existing_srt`: None/Some(true) = tận dụng file .srt có sẵn cạnh video
/// (phụ đề YouTube tải trước đó — chính xác hơn Whisper); Some(false) = luôn chạy Whisper.
pub fn analyze_and_create_project_full(
    app: Option<&AppHandle>,
    input_path: &str,
    source_lang: Option<String>,
    target_lang: Option<String>,
    time_limit_sec: Option<f64>,
    start_offset_sec: Option<f64>,
    expected_speakers: Option<usize>,
    prefer_existing_srt: Option<bool>,
    run_id: Option<String>,
) -> Result<DubbingProject> {
    let my_gen = start_new_generation();

    let input = Path::new(input_path);
    if !input.exists() {
        return Err(anyhow::anyhow!("File không tồn tại: {}", input_path));
    }

    // BUG-3: thời lượng media THẬT (đo bằng ffmpeg) — dùng làm `media_duration`
    // của project (frontend clamp theo thời lượng này).
    let probed_media_duration = get_audio_duration(input).unwrap_or(0.0);

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
                    run_id: run_id.clone(),
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

    // Chỉ giới hạn phần trích xuất khi user chọn range (giữ nguyên hành vi cũ).
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

    // 2. Transcript source. v0.11.32 (PO — "sub YouTube chính xác hơn"):
    // nếu cạnh video có file .srt (do nút "📝 Tải phụ đề" sinh ra) thì DÙNG LUÔN
    // — chính xác hơn và nhanh hơn nhiều so với chạy Whisper. Không có thì chạy
    // Whisper như cũ.
    let cfg = match app {
        Some(a) => AppConfig::load(a),
        None => AppConfig::load_or_default(),
    };
    let src_lang = source_lang.clone().unwrap_or_else(|| "auto".to_string());

    let sibling_srt = if prefer_existing_srt.unwrap_or(true) {
        find_sibling_srt(input, source_lang.as_deref())
    } else {
        None
    };
    let (raw_srt_content, transcript_source) =
        if let Some((srt_path, srt_lang)) = sibling_srt {
            info!(
                "📝 Using existing subtitle file ({} — lang: {})",
                srt_path.display(),
                srt_lang
            );
            emit(
                "transcribing",
                15.0,
                &format!(
                    "📝 Dùng phụ đề có sẵn (.{srt_lang}.srt từ {}) — chuẩn hơn nhận dạng giọng nói...",
                    sibling_srt_source_label(input, &srt_lang)
                ),
                0,
                100,
            );
            let content = fs::read_to_string(&srt_path)
                .with_context(|| format!("Đọc phụ đề có sẵn {}", srt_path.display()))?;
            (content, format!("srt:{srt_lang}"))
        } else {
            // 2b. Chọn engine STT (config `stt_asr_engine`; rỗng = whisper).
            //     Nếu người dùng chọn engine sherpa (SenseVoice / Paraformer /
            //     Parakeet) và model ĐÃ TẢI → nhận dạng bằng engine đó (nhanh
            //     hơn và chính xác hơn hẳn với tiếng Trung). Chưa tải / lỗi →
            //     rơi về Whisper + log tracing + phát event cảnh báo.
            let sherpa = crate::dubbing::stt_select::try_sherpa(&cfg, &temp_wav, &src_lang);
            let sherpa_result = match sherpa {
                crate::dubbing::stt_select::SherpaAttempt::Ready {
                    srt_content,
                    engine_id,
                    engine_label,
                    sentence_timestamps_only,
                } => {
                    info!(
                        "🎧 Nhận dạng bằng engine STT sherpa: {engine_id} ({})",
                        if sentence_timestamps_only {
                            "chỉ có timestamp câu"
                        } else {
                            "có timestamp từ"
                        }
                    );
                    emit(
                        "transcribing",
                        18.0,
                        &format!("🎧 Đang nhận dạng bằng engine {engine_label}..."),
                        0,
                        100,
                    );
                    Some((srt_content, format!("sherpa:{engine_id}")))
                }
                crate::dubbing::stt_select::SherpaAttempt::Fallback {
                    engine_id,
                    engine_label,
                    reason,
                } => {
                    warn!(
                        "⚠️ Engine STT {engine_id} không dùng được ({reason}) — rơi về Whisper"
                    );
                    emit(
                        "transcribing",
                        18.0,
                        &format!(
                            "⚠️ Engine {engine_label} không dùng được ({reason}) — chuyển sang Whisper"
                        ),
                        0,
                        100,
                    );
                    None
                }
                crate::dubbing::stt_select::SherpaAttempt::NotRequested => None,
            };
            if let Some((content, source)) = sherpa_result {
                (content, source)
            } else {
                // 2c. Transcribe with Whisper CLI (không có .srt cạnh video)
                let stt_variant = ModelVariant::from_name(&cfg.stt_model).unwrap_or(ModelVariant::LargeV3TurboQ8);
                let model_path = crate::stt::whisper_local::ensure_model(stt_variant)
                    .context("Không tìm thấy model Whisper")?;
                let (whisper_bin, _engine) =
                    crate::stt::whisper_local::ensure_binary_with_engine_pref(
                        crate::stt::EnginePreference::from_str(&cfg.stt_engine_preference),
                    )
                    .context("Không tìm thấy whisper binary")?;

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

                let content = fs::read_to_string(&temp_srt_file).context("Đọc SRT tạm")?;
                let _ = fs::remove_file(&temp_srt_file);
                (content, "whisper".to_string())
            }
        };

    let mut raw_segments = crate::file_sub::parse_srt_content(&raw_srt_content);
    // File .srt ngoài phủ TOÀN BỘ video (mốc tuyệt đối) — cắt theo cửa sổ đang
    // phân tích rồi trừ offset để cùng hệ toạ độ với đầu ra Whisper (đã cắt audio).
    // BUG-3: cue vượt đuôi cửa sổ được CẮT về đúng `limit` (trước đây end_time
    // giữ nguyên → khối timeline tràn ra ngoài cửa sổ phân tích).
    if transcript_source.starts_with("srt:") {
        raw_segments = crop_srt_to_window(raw_segments, offset, time_limit_sec);
    }
    if raw_segments.is_empty() {
        let _ = fs::remove_file(&temp_wav);
        return Err(anyhow::anyhow!("Không nhận diện được giọng nói trong tệp này."));
    }

    // 3. Xu ly segment theo nguon transcript:
    //    - "srt:*": file phu de co san -> GIU NGUYEN cue co text that, chi loai
    //      cue marker (rolling-caption). KHONG dung luat loc ao giac cua Whisper
    //      vi luat do se loai mat cac cue hop le.
    //    - "whisper": giu nguyen hanh vi cu (loc ao giac + ghep cau).
    let raw_count = raw_segments.len();
    let mut parsed_segments = if transcript_source.starts_with("srt:") {
        emit(
            "diarizing",
            35.0,
            "Đang lọc cue rỗng & chuẩn hóa mốc thời gian phụ đề...",
            0,
            raw_count,
        );
        srt_segments_to_dubbing(raw_segments, &src_lang, expected_speakers)
    } else {
        emit(
            "diarizing",
            35.0,
            "Đang lọc ảo giác & ghép nối câu thoại hoàn chỉnh...",
            0,
            raw_count,
        );
        clean_and_merge_raw_segments(raw_segments, &src_lang, expected_speakers)
    };

    if parsed_segments.is_empty() {
        let _ = fs::remove_file(&temp_wav);
        return Err(anyhow::anyhow!("Không phát hiện được câu thoại hợp lệ trong tệp này."));
    }

    let total = parsed_segments.len();
    info!("🎬 Parsed & merged into {} natural dialogue lines", total);

    // 3b. Offline AI Speaker Diarization via Sherpa-ONNX (pyannote + wespeaker)
    let mut diarization_engine_used = "heuristic".to_string();
    // [TSK-FIX-SPEAKER-ROLES] Giới tính đo từ F0 (pitch) của từng cụm giọng.
    let mut voice_genders: HashMap<String, speaker_assign::PitchGender> = HashMap::new();
    // Đã có phân vai theo GIỌNG (sherpa) ⇒ MiniMax chỉ đặt tên + dịch, không gán lại.
    let mut voice_based_diarization = false;
    if sherpa_available() {
        emit("diarizing", 38.0, "Đang phân tích âm sắc giọng nói bằng Sherpa AI (Offline)...", 0, total);
        match run_sherpa_diarization(&temp_wav, &temp_dir, my_gen, expected_speakers) {
            Ok(sherpa_segs) if !sherpa_segs.is_empty() => {
                info!("🎬 Sherpa Diarization returned {} audio speech turns", sherpa_segs.len());

                // [TSK-FIX-SPEAKER-ROLES] Đo F0 (pitch) từng cụm giọng — sidecar numpy,
                // offline, không gọi mạng. Lỗi ⇒ giữ giới tính mặc định (đánh dấu "~").
                let turn_list: Vec<(f64, f64, usize)> = sherpa_segs
                    .iter()
                    .map(|t| (t.start, t.end, t.speaker))
                    .collect();
                let pitches = match speaker_assign::estimate_speaker_pitches(
                    &temp_wav,
                    &turn_list,
                    &temp_dir,
                    &find_python(),
                    my_gen,
                ) {
                    Ok(p) => p,
                    Err(e) => {
                        warn!("⚠️ Đo F0 thất bại ({:#}) — giữ giới tính mặc định", e);
                        HashMap::new()
                    }
                };

                // Gộp cụm khi sherpa ra NHIỀU cụm hơn số vai người chọn —
                // gộp cụm GẦN NHẤT theo F0, KHÔNG dùng `% n` (modulo gộp nam với nữ).
                let profiles = speaker_assign::cluster_profiles(&turn_list, &pitches);
                let max_spk = expected_speakers.unwrap_or(0);
                let merge = speaker_assign::merge_clusters(&profiles, max_spk);
                if merge.merged.len() < profiles.len() {
                    info!(
                        "🎵 Gộp {} cụm giọng → {} (theo F0, không dùng modulo)",
                        profiles.len(),
                        merge.merged.len()
                    );
                }

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
                            let mapped_num = merge.mapping.get(&spk_num).copied().unwrap_or(spk_num);
                            seg.speaker_id = format!("speaker_{mapped_num}");
                        }
                    }
                }
                // Giới tính theo F0 của cụm ĐÃ GỘP (key = speaker_id đã gán).
                voice_genders = speaker_assign::gender_map(&merge.merged);
                voice_based_diarization = true;
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

    let tgt_lang = target_lang.clone().unwrap_or_else(|| "vi".to_string());

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
            // [TSK-FIX-SPEAKER-ROLES] Có sherpa ⇒ giữ speaker_id theo giọng.
            if voice_based_diarization {
                Some(&voice_genders)
            } else {
                None
            },
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
        // [TSK-FIX-SPEAKER-ROLES] Truyền giới tính đo từ F0 (nếu có) để chọn giọng
        // TTS theo giới tính THẬT thay vì xen kẽ idx % 2.
        speakers = generate_default_speakers(
            &tgt_lang,
            &active_ids,
            expected_speakers,
            if voice_based_diarization {
                Some(&voice_genders)
            } else {
                None
            },
        );

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
                    apply_translation_to_segment(&mut parsed_segments[target_idx], trans);
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

    // Thời lượng media của project: time_limit_sec (nếu có) kẹp trong thời lượng
    // video thật; nếu không đo được thì lấy mốc cuối của segment.
    let media_duration = if let Some(limit) = time_limit_sec {
        if limit > 0.0 {
            if probed_media_duration > 0.0 { limit.min(probed_media_duration) } else { limit }
        } else if probed_media_duration > 0.0 {
            probed_media_duration
        } else {
            parsed_segments.last().map(|s| s.end_sec).unwrap_or(0.0)
        }
    } else if probed_media_duration > 0.0 {
        probed_media_duration
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
        transcript_source: Some(transcript_source),
        peaks,
        filmstrip_thumbs,
        sub_export_mode: Some("softsub".to_string()),
        audio_export_mode: Some("multitrack".to_string()),
        target_lang: target_lang.clone(),
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

    // BUG-H12: `-filter_complex_script` đã bị FFMPEG 8+ gỡ bỏ (ffmpeg 9 chỉ còn
    // `-filter_complex`). Truyền graph trực tiếp qua argv — Rust không qua shell
    // nên không lỗi quoting; độ dài graph << 32KB (mỗi chunk ≤ 28 input).
    let mut cmd = Command::new(ffmpeg_bin);
    cmd.arg("-y");
    for (in_path, _) in inputs {
        cmd.arg("-i").arg(in_path);
    }
    cmd.arg("-filter_complex").arg(&filter_script);
    cmd.arg("-map").arg("[out]");
    cmd.arg("-c:a").arg("pcm_s16le");
    cmd.arg(&out_path);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = run_child_with_cancel(cmd, my_gen)?;
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
    run_id: Option<String>,
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
                    run_id: run_id.clone(),
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

    if is_generation_cancelled(my_gen) {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(anyhow::anyhow!("Đã dừng xuất video theo yêu cầu của bạn."));
    }

    // 1a. Pre-pass (chỉ giọng Kokoro): tổng hợp TẤT CẢ câu trong MỘT tiến trình
    //     Python cho mỗi giọng, để model ONNX 325 MB chỉ nạp 1 lần thay vì 1
    //     lần/câu. Câu mà batch không tạo được sẽ rơi xuống đường dẫn cũ
    //     (tổng hợp từng câu → retry → bỏ qua) bên dưới.
    let mut batched_audio: HashMap<usize, PathBuf> = HashMap::new();
    {
        let mut groups: BTreeMap<String, Vec<(usize, String, PathBuf)>> = BTreeMap::new();
        for (i, seg) in project.segments.iter().enumerate() {
            let Some(synth_text) = select_synth_text(seg) else {
                continue;
            };
            let speaker_voice = match project.speakers.iter().find(|s| s.id == seg.speaker_id) {
                Some(s) => s.voice.clone(),
                None => project
                    .speakers
                    .first()
                    .map(|s| s.voice.clone())
                    .unwrap_or_default(),
            };
            let voice = tts_vieneu::route_voice(&speaker_voice);
            if batch_engine_of(&voice).is_none() {
                continue; // Edge-TTS / cloud giữ nguyên đường dẫn từng câu.
            }
            let seg_audio = temp_dir.join(format!("seg_{}.wav", i));
            groups
                .entry(voice)
                .or_default()
                .push((i, synth_text.to_string(), seg_audio));
        }

        if !groups.is_empty() {
            let batched_count: usize = groups.values().map(|g| g.len()).sum();
            emit(
                "synthesizing",
                5.0,
                &format!(
                    "Tổng hợp giọng lồng tiếng hàng loạt ({} câu, engine offline)...",
                    batched_count
                ),
                0,
                total_segs,
            );
            for (voice, group) in groups {
                let batch_items: Vec<(String, String, PathBuf)> = group
                    .iter()
                    .map(|(_, text, out)| (text.clone(), voice.clone(), out.clone()))
                    .collect();
                match synthesize_batch_for(&voice, &batch_items) {
                    Ok(results) => {
                        for (item, res) in group.iter().zip(results.iter()) {
                            let (idx, _, out) = item;
                            if res.ok && out.exists() {
                                batched_audio.insert(*idx, out.clone());
                            } else {
                                warn!(
                                    "TTS batch câu {} thất bại: {}",
                                    idx,
                                    res.error
                                        .as_deref()
                                        .unwrap_or("file audio rỗng/không hợp lệ")
                                );
                            }
                        }
                    }
                    Err(e) => {
                        warn!(
                            "TTS batch Kokoro thất bại ({} câu) — chuyển sang tổng hợp từng câu: {e:#}",
                            group.len()
                        );
                    }
                }
            }
        }
    }

    // 1. Synthesize each segment and check duration
    for (i, seg) in project.segments.iter().enumerate() {
        if is_generation_cancelled(my_gen) {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(anyhow::anyhow!("Đã dừng xuất video theo yêu cầu của bạn."));
        }

        // Chọn nội dung để đọc. Câu dịch lỗi → bỏ qua (không tạo audio, không đọc
        // nhãn lỗi, cũng không đọc lại text gốc).
        let synth_text = match select_synth_text(seg) {
            Some(t) => t,
            None => {
                warn!(
                    "⏭️ Bỏ qua câu {}: không có bản dịch hợp lệ (dịch lỗi) — không tạo lồng tiếng cho câu này.",
                    seg.id
                );
                skipped_segments.push(seg.id);
                continue;
            }
        };

        let percent = 5.0 + (i as f32 / total_segs as f32) * 55.0;
        emit(
            "synthesizing",
            percent,
            &format!("Phát âm câu {}/{}: {}", i + 1, total_segs, synth_text),
            i + 1,
            total_segs,
        );

        let speaker = project
            .speakers
            .iter()
            .find(|s| s.id == seg.speaker_id)
            .unwrap_or(&project.speakers[0]);

        // Kokoro (offline) writes WAV; Edge-TTS writes MP3. FFmpeg reads either.
        // Dùng voice ĐÃ chuẩn hóa: `vietneu:*` map sang Kokoro nên phải xuất .wav
        // (nếu không Kokoro sẽ ghi file WAV ra tên .mp3).
        let voice = tts_vieneu::route_voice(&speaker.voice);
        let ext = voice_file_ext(&voice);
        let seg_audio = temp_dir.join(format!("seg_{}.{}", i, ext));

        // Retry-then-skip: never let an empty/invalid file poison the final mux.
        let mut synth_ok = false;
        let mut last_err = String::new();

        // Tái sử dụng file do batch pre-pass tạo ra (không spawn Python mới).
        if let Some(pre) = batched_audio.get(&i) {
            if pre == &seg_audio && is_valid_audio(pre) {
                synth_ok = true;
            }
        }

        for attempt in 0..2 {
            if synth_ok {
                break;
            }
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

        // R32: Nếu câu bắt đầu sau khi video đã kết thúc -> bỏ qua để không làm phình track audio
        if project.media_duration_sec > 0.0 && seg.start_sec >= project.media_duration_sec {
            warn!(
                "⏭️ Bỏ qua câu {} ('{}') vì bắt đầu sau khi video đã kết thúc ({:.2}s >= {:.2}s)",
                seg.id, seg.dubbed_text, seg.start_sec, project.media_duration_sec
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

        // R32: Nếu thời lượng câu sau khi stretch vẫn tràn qua thời lượng video gốc, trim vừa đúng video kết thúc
        let final_audio_fitted = if project.media_duration_sec > 0.0 {
            let remaining = project.media_duration_sec - seg.start_sec;
            let current_dur = get_audio_duration(&final_audio).unwrap_or(actual_dur);
            if remaining > 0.1 && current_dur > remaining + 0.05 {
                let trimmed = temp_dir.join(format!("seg_trimmed_{}.wav", i));
                let mut trim_cmd = Command::new(&ffmpeg_bin);
                trim_cmd
                    .arg("-y")
                    .arg("-i")
                    .arg(&final_audio)
                    .arg("-t")
                    .arg(format!("{:.3}", remaining))
                    .arg(&trimmed);

                #[cfg(windows)]
                trim_cmd.creation_flags(CREATE_NO_WINDOW);

                if run_child_with_cancel(trim_cmd, my_gen).map(|s| s.success()).unwrap_or(false) {
                    trimmed
                } else {
                    final_audio
                }
            } else {
                final_audio
            }
        } else {
            final_audio
        };

        if final_audio_fitted.exists() {
            speech_inputs.push((final_audio_fitted, seg.start_sec));
        }
    }

    // BUG: các đoạn audio lồng tiếng có thể CHỒNG lên nhau (đo được 45/78 cặp,
    // tổng 30.81s chồng, tối đa 1.92s) → khi mix, hai giọng nói cùng lúc, nghe loạn.
    // Ở đây chặn phần ĐUÔI dư của mỗi câu (thường là khoảng lặng cuối) để audio
    // của câu N không vượt quá thời điểm bắt đầu của câu kế tiếp (và không vượt
    // cuối video). Nội dung lời thoại ở đầu câu được giữ nguyên.
    {
        let media_end = project.media_duration_sec;
        // Mốc bắt đầu của các câu có audio, đã sắp xếp (để tìm "câu kế tiếp"
        // kể cả khi thứ tự segment không tuyến tính).
        let mut starts: Vec<f64> = speech_inputs.iter().map(|(_, s)| *s).collect();
        starts.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let mut no_overlap_inputs: Vec<(PathBuf, f64)> = Vec::with_capacity(speech_inputs.len());
        for (idx, (audio_path, start_sec)) in speech_inputs.iter().enumerate() {
            let next_start = starts
                .iter()
                .copied()
                .filter(|s| *s > *start_sec + 0.001)
                .min_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

            let mut allowed = f64::INFINITY;
            if let Some(ns) = next_start {
                allowed = allowed.min(ns - start_sec);
            }
            if media_end > 0.0 && media_end > *start_sec {
                allowed = allowed.min(media_end - start_sec);
            }

            if allowed.is_finite() && allowed > 0.05 {
                let dur = get_audio_duration(audio_path).unwrap_or(0.0);
                if dur > allowed + 0.02 {
                    let trimmed = temp_dir.join(format!("seg_nolap_{}.wav", idx));
                    let mut trim_cmd = Command::new(&ffmpeg_bin);
                    trim_cmd
                        .arg("-y")
                        .arg("-i")
                        .arg(audio_path)
                        .arg("-t")
                        .arg(format!("{:.3}", allowed))
                        .arg(&trimmed);

                    #[cfg(windows)]
                    trim_cmd.creation_flags(CREATE_NO_WINDOW);

                    if run_child_with_cancel(trim_cmd, my_gen)
                        .map(|s| s.success())
                        .unwrap_or(false)
                        && trimmed.exists()
                    {
                        info!(
                            "✂️ Cắt đuôi audio câu {} ({}): {:.2}s → {:.2}s (tránh chồng câu kế tiếp)",
                            idx,
                            audio_path.file_name().unwrap_or_default().to_string_lossy(),
                            dur,
                            allowed
                        );
                        no_overlap_inputs.push((trimmed, *start_sec));
                        continue;
                    }
                }
            }
            no_overlap_inputs.push((audio_path.clone(), *start_sec));
        }
        speech_inputs = no_overlap_inputs;
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

    // Determine subtitle & audio export modes
    let sub_mode = project.sub_export_mode.as_deref().unwrap_or("softsub");
    let audio_mode = project.audio_export_mode.as_deref().unwrap_or("multitrack");

    // Build subtitle file if segments exist and sub_mode is not "none"
    let mut srt_content = String::new();
    let mut srt_valid_count = 0;
    for seg in &project.segments {
        let dubbed = seg.dubbed_text.trim();
        let text = if !dubbed.is_empty() {
            // Không bao giờ ghi nhãn lỗi dịch vào file phụ đề.
            if crate::translate::is_translate_error(dubbed) {
                continue;
            }
            dubbed
        } else if !seg.original_text.trim().is_empty() {
            seg.original_text.trim()
        } else {
            continue;
        };
        let start_str = format_seconds_to_srt(seg.start_sec);
        let end_str = format_seconds_to_srt(seg.end_sec);
        srt_content.push_str(&format!("{}\n{} --> {}\n{}\n\n", srt_valid_count + 1, start_str, end_str, text));
        srt_valid_count += 1;
    }

    let srt_path_opt = if srt_valid_count > 0 && sub_mode != "none" {
        let p = temp_dir.join("subtitles.srt");
        if fs::write(&p, &srt_content).is_ok() {
            // Đồng thời xuất file .srt rời ngay cạnh video thành phẩm để người dùng tiện sử dụng
            let out_stem = out_file.file_stem().unwrap_or_default().to_string_lossy();
            let parent_dir = out_file.parent().unwrap_or_else(|| Path::new("."));
            let companion_srt = parent_dir.join(format!("{}.{}.srt", out_stem, target_lang));
            let _ = fs::write(&companion_srt, &srt_content);
            Some(p)
        } else {
            None
        }
    } else {
        None
    };

    // 3. Run master FFmpeg command using pre-rendered tracks & subtitle/audio options
    let mut remux = Command::new(&ffmpeg_bin);
    remux.arg("-y");
    remux.arg("-i").arg(&project.input_path); // Input 0

    let mut current_input_idx: usize = 1;
    let mut speech_input_idx = None;
    let mut bgm_input_idx = None;

    if let Some(speech_wav) = &speech_track_opt {
        remux.arg("-i").arg(speech_wav);
        speech_input_idx = Some(current_input_idx);
        current_input_idx += 1;
    }
    if let Some(bgm_file) = &isolated_bgm_path {
        remux.arg("-i").arg(bgm_file);
        bgm_input_idx = Some(current_input_idx);
        current_input_idx += 1;
    }

    // Subtitle input (if softsub):
    let mut srt_input_idx = None;
    if sub_mode == "softsub" {
        if let Some(ref srt_file) = srt_path_opt {
            remux.arg("-i").arg(srt_file);
            srt_input_idx = Some(current_input_idx);
        }
    }

    let has_speech = speech_track_opt.is_some();
    // Smart Ducking (DUCKING_SPEC §4.2): nền gốc hạ theo ĐƯỜNG ÂM LƯỢNG dựng từ clip lồng tiếng thật
    // (cùng điểm gãy với Studio xem thử) thay vì hạ cố định cả video. vocal_isolation (có nền Demucs) giữ nguyên.
    let duck_bgm_chain = if speech_input_idx.is_some() && bgm_input_idx.is_none() {
        let cfg = match app {
            Some(a) => crate::config::AppConfig::load(a),
            None => crate::config::AppConfig::load_or_default(),
        };
        let params = ducking_export::params_from_config(&cfg, project.bgm_volume);
        let voice = ducking_export::voice_intervals(&speech_inputs, |p| {
            ducking_export::wav_duration(p).or_else(|| get_audio_duration(p).ok())
        });
        let points = ducking_export::envelope_for_export(&voice, project.media_duration_sec, &params);
        info!(
            "🎚️ Smart Ducking: {} đoạn thoại → {} điểm gãy (mức {:.2}, nối < {:.1}s)",
            voice.len(),
            points.len(),
            params.duck_level,
            params.bridge_gap_sec
        );
        Some(ducking_export::bgm_chain(&points))
    } else {
        None
    };
    let mix_filter = match (speech_input_idx, bgm_input_idx) {
        (Some(s_idx), Some(b_idx)) => {
            format!("[{b_idx}:a]volume=1.0[bgm];[bgm][{s_idx}:a]amix=inputs=2:duration=first:normalize=0[final_audio]")
        }
        (Some(s_idx), None) => {
            let chain = duck_bgm_chain.as_deref().unwrap_or("[0:a]anull[bgm]");
            format!("{chain};[bgm][{s_idx}:a]amix=inputs=2:duration=first:normalize=0[final_audio]")
        }
        (None, Some(b_idx)) => {
            format!("[{b_idx}:a]volume=1.0[final_audio]")
        }
        (None, None) => {
            "[0:a]anull[final_audio]".to_string()
        }
    };

    // BUG-H12: `-filter_complex_script` đã bị FFMPEG 8+ gỡ bỏ (ffmpeg 9 chỉ còn
    // `-filter_complex`). Truyền graph trực tiếp qua argv — Rust không qua shell
    // nên không lỗi quoting. Đường ducking của video dài có thể vượt giới hạn dòng
    // lệnh Windows (~32K) → graph quá ngưỡng ghi ra file, đọc bằng `-/filter_complex <file>` (FFmpeg ≥ 7).
    let mix_filter_file = temp_dir.join("mix_filter.txt");
    if mix_filter.len() > ducking_export::FILTER_FILE_THRESHOLD && fs::write(&mix_filter_file, &mix_filter).is_ok() {
        remux.arg("-/filter_complex").arg(&mix_filter_file);
    } else {
        remux.arg("-filter_complex").arg(&mix_filter);
    }

    // Video mapping & encoding
    if sub_mode == "hardsub" && srt_path_opt.is_some() {
        let srt_file = srt_path_opt.as_ref().unwrap();
        let srt_escaped = srt_file.to_string_lossy().replace('\\', "/").replace(':', "\\:");
        remux.arg("-vf").arg(format!("subtitles='{}'", srt_escaped));
        remux.arg("-c:v").arg("libx264").arg("-preset").arg("fast").arg("-crf").arg("22");
    } else {
        remux.arg("-map").arg("0:v?");
        remux.arg("-c:v").arg("copy");
    }

    // Audio mapping
    if audio_mode == "multitrack" && has_speech {
        // Multi-track audio (VLC: Track 1 = Tiếng gốc, Track 2 = Thuyết minh AI)
        remux.arg("-map").arg("0:a:0?");
        remux.arg("-map").arg("[final_audio]");
        remux.arg("-c:a").arg("aac").arg("-b:a").arg("192k");
        remux.arg("-metadata:s:a:0").arg("title=Tiếng gốc (Original)");
        remux.arg("-metadata:s:a:0").arg("language=und");
        remux.arg("-metadata:s:a:1").arg("title=Thuyết minh AI");
        remux.arg("-metadata:s:a:1").arg(format!("language={}", target_lang));
    } else if has_speech || audio_mode == "mixed" {
        // Single mixed track
        remux.arg("-map").arg("[final_audio]");
        remux.arg("-c:a").arg("aac").arg("-b:a").arg("192k");
        remux.arg("-metadata:s:a:0").arg("title=Thuyết minh AI (Đã trộn)");
        remux.arg("-metadata:s:a:0").arg(format!("language={}", target_lang));
    } else {
        // Original audio only
        remux.arg("-map").arg("0:a:0?");
        remux.arg("-c:a").arg("copy");
        remux.arg("-metadata:s:a:0").arg("title=Tiếng gốc");
    }

    // Subtitle mapping (Softsub)
    if sub_mode == "softsub" {
        if let Some(s_idx) = srt_input_idx {
            remux.arg("-map").arg(format!("{}:s", s_idx));
            remux.arg("-c:s").arg("mov_text");
            remux.arg("-metadata:s:s:0").arg("title=Phụ đề Tiếng Việt");
            remux.arg("-metadata:s:s:0").arg(format!("language={}", target_lang));
            remux.arg("-disposition:s:0").arg("default");
        }
    }

    if let Some(limit) = project.time_limit_sec {
        if limit > 0.0 {
            info!("⏱️ Remuxing sample video limited to {:.1}s", limit);
            remux.arg("-t").arg(format!("{:.1}", limit));
        }
    } else {
        // R32: Đảm bảo audio track và video remux không bao giờ dài hơn video gốc.
        // Tránh tình trạng câu thoại cuối hoặc TTS kéo dài làm file thành phẩm dài hơn video gốc.
        remux.arg("-shortest");
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

/// Helper to format floating seconds into standard SRT timestamp HH:MM:SS,mmm
pub fn format_seconds_to_srt(seconds: f64) -> String {
    let secs = seconds.max(0.0);
    let hours = (secs / 3600.0).floor() as u64;
    let mins = ((secs % 3600.0) / 60.0).floor() as u64;
    let rem_secs = (secs % 60.0).floor() as u64;
    let millis = ((secs.fract()) * 1000.0).round() as u64;
    format!("{:02}:{:02}:{:02},{:03}", hours, mins, rem_secs, millis.min(999))
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

    /// TSK-TABS-P0: `run_id` là tuỳ chọn — JSON cũ (không có `run_id`) vẫn parse được
    /// và không trường nào mới xuất hiện khi không truyền `run_id`.
    #[test]
    fn dubbing_progress_serde_run_id_tuy_chon() {
        let old_json = r#"{"stage":"extracting","percent":5.0,"message":"x",
            "current_item":0,"total_items":100}"#;
        let parsed: DubbingProgress =
            serde_json::from_str(old_json).expect("JSON cu phai parse duoc");
        assert_eq!(parsed.run_id, None);
        let out = serde_json::to_value(&parsed).expect("serialize");
        assert!(
            out.get("run_id").is_none(),
            "khong co run_id thi khong duoc them key: {out}"
        );

        let with_id = DubbingProgress {
            run_id: Some("run-9".to_string()),
            ..parsed
        };
        let out2 = serde_json::to_value(&with_id).expect("serialize");
        assert_eq!(out2["run_id"], "run-9");
        let back: DubbingProgress = serde_json::from_value(out2).expect("parse lai");
        assert_eq!(back.run_id.as_deref(), Some("run-9"));
    }

    /// KHÓA CHỈ DÙNG TRONG TEST: các test dùng chung bộ đếm generation TOÀN CỤC
    /// (CURRENT_GENERATION / CANCELLED_GENERATION) phải chạy TUẦN TỰ. Nếu chạy
    /// song song, `start_new_generation()` của test này sẽ hủy generation của
    /// test kia → test kia fail với "Đã dừng tiến trình theo yêu cầu của bạn".
    /// Đây là race ĐÃ TỒN TẠI từ trước (không do các thay đổi BUG-1/2/3), chỉ bị
    /// lộ ra khi số lượng test thay đổi làm thay đổi lịch chạy song song.
    static GENERATION_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// Tạo segment mẫu cho test.
    fn seg_with(dubbed_text: &str, status: &str) -> DubbingSegment {
        DubbingSegment {
            id: 1,
            speaker_id: "speaker_1".to_string(),
            start_sec: 0.0,
            end_sec: 1.0,
            original_text: "Heat. Heat.".to_string(),
            dubbed_text: dubbed_text.to_string(),
            audio_duration_sec: None,
            status: status.to_string(),
        }
    }

    #[test]
    fn test_translate_error_not_used_as_dubbed_text() {
        let mut seg = seg_with("", "ready");
        apply_translation_to_segment(&mut seg, "[Dịch lỗi: Heat. Heat.]".to_string());

        assert!(
            seg.dubbed_text.is_empty(),
            "nhãn lỗi dịch KHÔNG BAO GIỜ được gán vào dubbed_text (TTS sẽ đọc thành tiếng)"
        );
        assert_eq!(seg.status, "translate_failed");
        assert!(
            select_synth_text(&seg).is_none(),
            "câu dịch lỗi không được phát âm"
        );
    }

    #[test]
    fn test_apply_translation_keeps_valid_translation() {
        let mut seg = seg_with("", "ready");
        apply_translation_to_segment(&mut seg, "Nóng. Nóng.".to_string());
        assert_eq!(seg.dubbed_text, "Nóng. Nóng.");
        assert_eq!(seg.status, "ready");
        assert_eq!(select_synth_text(&seg), Some("Nóng. Nóng."));
    }

    #[test]
    fn test_select_synth_text_skips_failed_translation() {
        // dubbed_text rỗng + status = translate_failed → KHÔNG phát âm,
        // KHÔNG fallback sang original_text.
        let seg = seg_with("", "translate_failed");
        assert!(
            select_synth_text(&seg).is_none(),
            "câu dịch lỗi không được đọc, kể cả text gốc"
        );
    }

    #[test]
    fn test_select_synth_text_falls_back_to_original_when_not_failed() {
        // dubbed_text rỗng + status bình thường → vẫn fallback original_text như cũ.
        let seg = seg_with("", "ready");
        assert_eq!(select_synth_text(&seg), Some("Heat. Heat."));
    }

    #[test]
    fn test_select_synth_text_never_speaks_error_marker() {
        // Phòng thủ: nhãn lỗi lọt vào dubbed_text (VD từ frontend) → không đọc.
        let seg = seg_with("[Dịch lỗi: Heat. Heat.]", "ready");
        assert!(
            select_synth_text(&seg).is_none(),
            "nhãn lỗi dịch không được đọc ra loa"
        );
    }

    #[test]
    fn test_select_synth_text_none_when_nothing_to_say() {
        let mut seg = seg_with("", "ready");
        seg.original_text = "   ".to_string();
        assert!(select_synth_text(&seg).is_none());
    }

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
        let _gen_guard = GENERATION_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let gen1 = start_new_generation();
        assert!(!is_generation_cancelled(gen1));

        cancel_dubbing();
        assert!(is_generation_cancelled(gen1));

        // When starting a new generation, the old one remains cancelled
        let gen2 = start_new_generation();
        assert!(is_generation_cancelled(gen1), "Old generation must stay cancelled!");
        assert!(!is_generation_cancelled(gen2), "New generation must not be cancelled!");
    }

    /// BUG SRT rolling-caption: cue marker (text rong / "[ ]" / thoi luong
    /// < 55 ms) phai bi lo, cue co text that phai duoc giu nguyen.
    #[test]
    fn test_srt_segments_to_dubbing_drops_markers() {
        let srt = "1\n00:00:14,440 --> 00:00:34,870\n\nHeat. Heat.\n\n2\n00:00:34,870 --> 00:00:34,880\n\n \n\n3\n00:00:34,880 --> 00:00:37,910\n\nI wish to be alone. Kaldares,\n\n4\n00:00:37,910 --> 00:00:37,920\nI wish to be alone. Kaldares,\n \n";
        let raw = crate::file_sub::parse_srt_content(srt);
        assert_eq!(raw.len(), 4, "parser phai nhan dien du 4 cue");

        let segments = srt_segments_to_dubbing(raw, "en", Some(2));

        assert_eq!(
            segments.len(),
            2,
            "chi giu 2 cue co text that (bo cue rong + cue 10 ms)"
        );
        assert_eq!(segments[0].original_text, "Heat. Heat.");
        assert_eq!(segments[1].original_text, "I wish to be alone. Kaldares,");

        assert!((segments[0].start_sec - 14.44).abs() < 0.001);
        assert!((segments[0].end_sec - 34.87).abs() < 0.001);
        assert!((segments[1].start_sec - 34.88).abs() < 0.001);
        assert!((segments[1].end_sec - 37.91).abs() < 0.001);

        assert_eq!(segments[0].id, 1);
        assert_eq!(segments[1].id, 2);
        assert!(segments.iter().all(|s| s.speaker_id.starts_with("speaker_")));
        assert!(segments.iter().all(|s| s.dubbed_text.is_empty()));
        assert!(segments.iter().all(|s| s.status == "ready"));
    }

    /// Thuật toán overlap: chuỗi < 3 từ KHÔNG cắt, chuỗi >= 3 từ CÓ cắt.
    #[test]
    fn test_dedupe_rolling_overlap_algorithm() {
        // Overlap 2 từ -> KHÔNG cắt (k < 3).
        let (k, out) = dedupe_rolling_overlap("Hello there my friend", "my friend again");
        assert_eq!(k, 0, "overlap 2 từ không được cắt");
        assert_eq!(out, "my friend again");

        // Overlap 1 từ -> KHÔNG cắt (k < 3).
        let (k, out) = dedupe_rolling_overlap("Hello there my friend", "friend again now");
        assert_eq!(k, 0, "overlap 1 từ không được cắt");
        assert_eq!(out, "friend again now");

        // Overlap đúng 3 từ -> CÓ cắt.
        let (k, out) = dedupe_rolling_overlap("of us left.", "of us left. And tomorrow I send");
        assert_eq!(k, 3);
        assert_eq!(out, "And tomorrow I send");

        // Overlap dài -> cắt đúng phần trùng.
        let (k, out) = dedupe_rolling_overlap(
            "I wish to be alone. Kaldares,",
            "I wish to be alone. Kaldares, your warriors question your whereabouts.",
        );
        assert_eq!(k, 6);
        assert_eq!(out, "your warriors question your whereabouts.");

        // Cue nằm trong hoàn toàn trong cue trước -> giữ nguyên text gốc.
        let (k, out) = dedupe_rolling_overlap("one two three four", "two three four");
        assert_eq!(k, 0, "cắt rỗng thì giữ nguyên");
        assert_eq!(out, "two three four");
    }

    /// Overlap giữa 2 cue liên tiếp: cue sau so với text ĐÃ dedupe của cue trước.
    #[test]
    fn test_srt_segments_to_dubbing_dedupes_overlap() {
        let srt = "1\n00:00:14,440 --> 00:00:34,870\n\nI wish to be alone. Kaldares,\n\n2\n00:00:34,870 --> 00:00:47,510\n\nI wish to be alone. Kaldares, your warriors question your whereabouts.\n";
        let raw = crate::file_sub::parse_srt_content(srt);
        let segments = srt_segments_to_dubbing(raw, "en", Some(2));

        assert_eq!(segments.len(), 2, "số cue không đổi");
        assert_eq!(segments[0].original_text, "I wish to be alone. Kaldares,");
        assert_eq!(
            segments[1].original_text,
            "your warriors question your whereabouts."
        );
    }

    /// TEST file thật: 78 cue (không đổi số cue) và text đã dedupe.
    #[test]
    fn test_srt_segments_to_dubbing_dedupes_real_rolling_caption() {
        /// File SRT rolling-caption thật (tên chứa dấu hai chấm rộng U+FF1A).
        const REAL_ROLLING_SRT_PATH: &str = "C:\\Users\\TTC\\AppData\\Roaming\\com.sublix.desktop\\downloads\\StarCraft II\u{FF1A} Legacy of the Void - Reclamation [uQnmfEka3vw].en.srt";

        let path = Path::new(REAL_ROLLING_SRT_PATH);
        if !path.exists() {
            // Máy khác / CI không có file mẫu -> SKIP (không FAIL).
            eprintln!("SKIP: không tìm thấy file SRT mẫu: {}", path.display());
            return;
        }

        let content = fs::read_to_string(path).expect("đọc file SRT mẫu");
        let raw = crate::file_sub::parse_srt_content(&content);
        assert_eq!(raw.len(), 155, "parser phải nhận diện đủ 155 cue");

        let segments = srt_segments_to_dubbing(raw, "en", Some(2));
        assert_eq!(segments.len(), 78, "số cue không đổi sau khi dedupe");

        let texts: Vec<&str> = segments.iter().map(|s| s.original_text.as_str()).collect();

        // Cue đầu không có overlap -> giữ nguyên.
        assert_eq!(texts[0], "Heat. Heat.");

        // Ba mẫu bắt buộc.
        assert!(texts.contains(&"I wish to be alone. Kaldares,"));
        assert!(texts.contains(&"your warriors question your whereabouts."));
        assert!(texts.contains(&"of us left."));
        assert!(texts.contains(&"And tomorrow I send so many to die. If"));

        // Phần trùng đã bị cắt: không còn cue nào mang nguyên văn bản cumulative.
        assert!(!texts.iter().any(|t| t.contains("Kaldares, your warriors")));
        assert!(!texts.iter().any(|t| t.contains("few of us left")));
        assert!(!texts.iter().any(|t| t.contains("of us left. And tomorrow")));
    }

    #[test]
    fn test_render_combined_speech_track_large_segments() {
        let _gen_guard = GENERATION_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
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
    fn test_dubbing_duration_never_exceeds_video() {
        let _gen_guard = GENERATION_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let test_video = PathBuf::from(r"H:\AI Project\sublix\test_dubbing_input\multi_speaker_scene.mp4");
        if !test_video.exists() {
            println!("Test fixture multi_speaker_scene.mp4 not found, skipping");
            return;
        }

        let orig_duration = get_audio_duration(&test_video).expect("Original video duration must be readable");
        assert!(orig_duration > 0.0, "Original video duration must be > 0");

        let temp_dir = std::env::temp_dir().join(format!("sublix_test_dur_{}", gen_unique_id()));
        let _ = fs::create_dir_all(&temp_dir);
        let out_file = temp_dir.join("dubbed_output.mp4");

        let project = DubbingProject {
            input_path: test_video.to_string_lossy().to_string(),
            media_duration_sec: orig_duration,
            speakers: vec![
                DubbingSpeaker {
                    id: "speaker_0".to_string(),
                    label: "Nam".to_string(),
                    voice: "vi-VN-NamMinhNeural".to_string(),
                    pitch: "+0Hz".to_string(),
                    rate: "+0%".to_string(),
                    gender: "male".to_string(),
                    sample_audio_data: None,
                }
            ],
            segments: vec![
                DubbingSegment {
                    id: 1,
                    speaker_id: "speaker_0".to_string(),
                    start_sec: 1.0,
                    end_sec: 3.0,
                    original_text: "Hello world".to_string(),
                    dubbed_text: "Xin chào".to_string(),
                    audio_duration_sec: None,
                    status: "ready".to_string(),
                },
                DubbingSegment {
                    id: 2,
                    speaker_id: "speaker_0".to_string(),
                    start_sec: (orig_duration - 1.5).max(0.0),
                    end_sec: orig_duration + 5.0,
                    original_text: "Final line that would have overflowed".to_string(),
                    dubbed_text: "Đây là câu kết thúc rất dài nhằm kiểm tra xem âm thanh có bị kéo dài quá video gốc không".to_string(),
                    audio_duration_sec: None,
                    status: "ready".to_string(),
                },
            ],
            bgm_volume: 0.5,
            voice_volume: 1.0,
            dubbing_mode: "ducking".to_string(),
            time_limit_sec: None,
            diarization_engine: None,
            transcript_source: None,
            peaks: None,
            filmstrip_thumbs: None,
            sub_export_mode: Some("none".to_string()),
            audio_export_mode: Some("mixed".to_string()),
            target_lang: Some("vi".to_string()),
        };

        let res = export_dubbed_video(None, project, Some(out_file.to_string_lossy().to_string()), None);
        if let Ok(path) = res {
            let out_p = PathBuf::from(&path);
            assert!(out_p.exists(), "Output video must exist");
            let out_dur = get_audio_duration(&out_p).expect("Output video duration must be readable");
            println!("ORIG DURATION: {:.3}s, OUTPUT DURATION: {:.3}s", orig_duration, out_dur);
            assert!(out_dur <= orig_duration + 0.05, "Output duration ({:.3}s) MUST NOT exceed original video duration ({:.3}s)!", out_dur, orig_duration);
            let _ = fs::remove_file(&out_p);
        } else {
            println!("export_dubbed_video skipped or error: {:?}", res.err());
        }

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
                let export_res = export_dubbed_video(None, proj, Some(out_sample.to_string()), None);
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

    #[test]
    fn test_find_sibling_srt_priority() {
        let dir = std::env::temp_dir().join(format!("sublix_srt_find_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::create_dir_all(&dir);
        let video = dir.join("Movie [abc123def45].mp4");
        fs::write(&video, b"x").expect("write video");
        fs::write(dir.join("Movie [abc123def45].vi.srt"), b"x").expect("write vi");
        fs::write(dir.join("Movie [abc123def45].en.srt"), b"x").expect("write en");
        fs::write(dir.join("Movie [abc123def45].en-orig.srt"), b"x").expect("write en-orig");
        fs::write(dir.join("Movie [abc123def45].mp4.srt"), b"x").expect("decoy ext");
        fs::write(dir.join("Other [zzz].en.srt"), b"x").expect("decoy stem");

        // Không chỉ định ngôn ngữ nguồn (auto) → ưu tiên bản gốc en
        let picked = find_sibling_srt(&video, None);
        assert_eq!(
            picked
                .as_ref()
                .map(|(p, _)| p.file_name().unwrap().to_string_lossy().to_string())
                .as_deref(),
            Some("Movie [abc123def45].en-orig.srt")
        );
        assert_eq!(picked.as_ref().map(|(_, l)| l.as_str()), Some("en-orig"));

        // Chỉ định "vi" → phải chọn đúng bản vi
        let picked_vi = find_sibling_srt(&video, Some("vi"));
        assert_eq!(picked_vi.as_ref().map(|(_, l)| l.as_str()), Some("vi"));

        // Chỉ định "en" → chọn "en" (khớp chính xác) chứ không phải en-orig
        let picked_en = find_sibling_srt(&video, Some("en"));
        assert_eq!(picked_en.as_ref().map(|(_, l)| l.as_str()), Some("en"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_crop_srt_to_window() {
        let seg = |st: &str, en: &str| crate::file_sub::SubtitleSegment {
            index: 0,
            start_time: st.to_string(),
            end_time: en.to_string(),
            original: "x".to_string(),
            translated: None,
        };
        let segs = vec![
            seg("00:00:01,000", "00:00:02,000"), // trước cửa sổ → bỏ
            seg("00:00:10,000", "00:00:12,000"), // trong cửa sổ → 5–7
            seg("00:00:14,000", "00:00:16,000"), // chạm cận trên → 9–10 (end CẮT về limit)
            seg("00:00:20,000", "00:00:22,000"), // sau cửa sổ → bỏ
        ];
        let cropped = crop_srt_to_window(segs, 5.0, Some(10.0));
        assert_eq!(cropped.len(), 2);
        assert_eq!(cropped[0].start_time, "00:00:05,000");
        assert_eq!(cropped[0].end_time, "00:00:07,000");
        assert_eq!(cropped[1].start_time, "00:00:09,000");
        // BUG-3: cue vượt đuôi cửa sổ (window = [5, 15]) → end bị CẮT về 10s
        // (trước BUG-3 end giữ nguyên 11s → khối timeline tràn ra ngoài video).
        assert_eq!(cropped[1].end_time, "00:00:10,000");

        // Không cắt gì thì giữ nguyên
        let untouched = crop_srt_to_window(vec![seg("00:00:01,000", "00:00:02,000")], 0.0, None);
        assert_eq!(untouched.len(), 1);
        assert_eq!(untouched[0].start_time, "00:00:01,000");
    }

    /// BUG-3: cue vượt đuôi video (start < limit < end) phải bị CẮT end về limit.
    /// Nếu không, timeline có khối tràn ra ngoài video → "tiếng thừa dài ngoằng".
    #[test]
    fn test_crop_srt_to_window_clamps_end_to_limit() {
        let seg = |st: &str, en: &str| crate::file_sub::SubtitleSegment {
            index: 0,
            start_time: st.to_string(),
            end_time: en.to_string(),
            original: "x".to_string(),
            translated: None,
        };
        let segs = vec![
            seg("00:00:10,000", "00:00:12,000"), // trọn trong video → giữ nguyên
            seg("00:05:00,000", "01:00:00,000"), // vượt đuôi → cắt end về 327.24s
            seg("02:00:00,000", "02:00:02,000"), // ngoài video → bỏ hẳn
        ];
        let limit = 327.24_f64;
        let cropped = crop_srt_to_window(segs, 0.0, Some(limit));

        assert_eq!(cropped.len(), 2, "cue nằm ngoài video phải bị loại");

        // Cue trọn trong video: giữ nguyên.
        assert_eq!(cropped[0].start_time, "00:00:10,000");
        assert_eq!(cropped[0].end_time, "00:00:12,000");

        // Cue vượt đuôi: end bị cắt đúng về limit.
        let st = parse_srt_time_to_seconds(&cropped[1].start_time);
        let en = parse_srt_time_to_seconds(&cropped[1].end_time);
        assert_eq!(st, 300.0);
        assert!(
            (en - limit).abs() < 0.002,
            "end phải được cắt về đúng limit ({limit}), thực tế {en}"
        );
        assert!(en <= limit + 0.001, "không được có cue nào end > limit");
    }

    /// BUG-3: cue kết thúc ĐÚNG bằng limit → phải giữ nguyên (không cắt, không bỏ).
    #[test]
    fn test_crop_srt_to_window_keeps_cue_ending_exactly_at_limit() {
        let seg = |st: &str, en: &str| crate::file_sub::SubtitleSegment {
            index: 0,
            start_time: st.to_string(),
            end_time: en.to_string(),
            original: "x".to_string(),
            translated: None,
        };
        // 00:05:27,240 = 327.24s
        let segs = vec![seg("00:05:25,000", "00:05:27,240")];
        let cropped = crop_srt_to_window(segs, 0.0, Some(327.24));
        assert_eq!(cropped.len(), 1, "cue kết thúc đúng limit phải được giữ");
        assert_eq!(cropped[0].end_time, "00:05:27,240");
    }

    /// BUG-3 (mô phỏng file thật): .srt rolling-caption dài 5 tiếng, video local chỉ
    /// 5:27. Sau khi crop, KHÔNG cue nào được vượt quá thời lượng video.
    #[test]
    fn test_crop_srt_to_window_synthetic_5h_rolling_caption() {
        let mut segs: Vec<crate::file_sub::SubtitleSegment> = Vec::new();
        let mk = |idx: usize, st: f64, en: f64| crate::file_sub::SubtitleSegment {
            index: idx,
            start_time: fmt_srt_time(st),
            end_time: fmt_srt_time(en),
            original: "x".to_string(),
            translated: None,
        };
        // 20 cue dày trong 5 phút đầu.
        for i in 0..20 {
            let st = 15.0 + i as f64 * 15.5;
            segs.push(mk(i, st, st + 2.5));
        }
        // 1 cue vượt đuôi video (bắt đầu trong video, kết thúc 1 tiếng sau).
        segs.push(mk(20, 320.0, 3600.0));
        // 134 cue nằm hoàn toàn ngoài video (3 tiếng → 5 tiếng).
        for i in 0..134 {
            let st = 3600.0 + i as f64 * 116.0;
            segs.push(mk(21 + i, st, st + 2.5));
        }
        assert_eq!(segs.len(), 155);

        let limit = 327.24_f64;
        let cropped = crop_srt_to_window(segs, 0.0, Some(limit));

        assert_eq!(cropped.len(), 21, "chỉ giữ cue trong video + cue vượt đuôi đã cắt");
        for c in &cropped {
            let st = parse_srt_time_to_seconds(&c.start_time);
            let en = parse_srt_time_to_seconds(&c.end_time);
            assert!(st < limit, "cue bắt đầu ngoài video: {}", c.start_time);
            assert!(
                en <= limit + 0.001,
                "cue vượt đuôi video: {} → {}",
                c.start_time,
                c.end_time
            );
        }
    }

    /// BUG-3 (file thật trên máy): nếu tìm thấy file .srt rolling-caption 155 cue
    /// thì crop với limit = 327.24s phải còn ≤ 78 cue và không cue nào vượt đuôi.
    /// Không tìm thấy file thật → skip.
    #[test]
    fn test_crop_srt_to_window_real_rolling_caption_file() {
        let Some(path) = find_real_rolling_caption_srt() else {
            println!("⏭️ Không tìm thấy file .srt thật (155 cue) trên máy → bỏ qua test");
            return;
        };
        let content = std::fs::read_to_string(&path).expect("đọc file .srt thật");
        let segs = crate::file_sub::parse_srt_content(&content);
        assert_eq!(segs.len(), 155, "file .srt thật phải có 155 cue");

        let limit = 327.24_f64;
        let cropped = crop_srt_to_window(segs, 0.0, Some(limit));
        assert!(
            cropped.len() <= 78,
            "sau crop phải còn ≤ 78 cue, thực tế {}",
            cropped.len()
        );
        for c in &cropped {
            let st = parse_srt_time_to_seconds(&c.start_time);
            let en = parse_srt_time_to_seconds(&c.end_time);
            assert!(st < limit, "cue bắt đầu ngoài video: {}", c.start_time);
            assert!(
                en <= limit + 0.001,
                "cue vượt đuôi video: {} → {}",
                c.start_time,
                c.end_time
            );
        }
        println!(
            "✅ File thật {}: 155 cue → {} cue sau crop (limit {limit}s)",
            path.display(),
            cropped.len()
        );
    }

    /// Tìm file .srt rolling-caption thật (đúng 155 cue) trên máy.
    /// Ưu tiên biến môi trường SUBLIX_REAL_SRT, sau đó quét vài thư mục đã biết.
    fn find_real_rolling_caption_srt() -> Option<std::path::PathBuf> {
        if let Ok(p) = std::env::var("SUBLIX_REAL_SRT") {
            let p = std::path::PathBuf::from(p);
            if p.exists() {
                return Some(p);
            }
        }
        let candidates = [
            r"H:\AI Project\sublix\test_dubbing_input",
            r"H:\AI Project\sub-lix-fork-2026-10-19",
            r"C:\Users\TTC\Downloads",
            r"C:\Users\TTC\Videos",
        ];
        for dir in candidates {
            let Ok(entries) = std::fs::read_dir(dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                if !name.ends_with(".srt") {
                    continue;
                }
                let Ok(content) = std::fs::read_to_string(&path) else {
                    continue;
                };
                if crate::file_sub::parse_srt_content(&content).len() == 155 {
                    return Some(path);
                }
            }
        }
        None
    }

    // =======================================================================
    // DEFECT-1: voice id `vietneu:*` phải được map sang giọng Kokoro cục bộ.
    // Nếu không, id này bị đưa thẳng cho Edge-TTS (bị từ chối) → mọi câu đều
    // fail → file MP4 xuất ra KHÔNG có lồng tiếng.
    // =======================================================================

    #[test]
    fn test_normalize_voice_id_maps_all_vietneu_voices() {
        let cases = [
            ("vietneu:vi_bac_nam", "kokoro:tuan_ngoc"),
            ("vietneu:vi_bac_nu", "kokoro:mai_linh"),
            ("vietneu:vi_nam_nam", "kokoro:manh_dung"),
            ("vietneu:vi_nam_nu", "kokoro:ngoc_huyen"),
            ("vietneu:vi_hue_nu", "kokoro:ngoc_huyen"),
            ("vietneu:vi_bac_thoisu", "kokoro:hung_thinh"),
        ];
        for (input, expected) in cases {
            assert_eq!(
                normalize_voice_id(input),
                expected,
                "voice '{}' phải map sang '{}'",
                input,
                expected
            );
        }
    }

    #[test]
    fn test_normalize_voice_id_passes_through_kokoro_ids() {
        assert_eq!(normalize_voice_id("kokoro:tuan_ngoc"), "kokoro:tuan_ngoc");
        assert_eq!(normalize_voice_id("kokoro:mai_linh"), "kokoro:mai_linh");
    }

    #[test]
    fn test_normalize_voice_id_passes_through_edge_tts_ids() {
        assert_eq!(
            normalize_voice_id("vi-VN-HoaiMyNeural"),
            "vi-VN-HoaiMyNeural"
        );
        assert_eq!(
            normalize_voice_id("en-US-AndrewNeural"),
            "en-US-AndrewNeural"
        );
    }

    #[test]
    fn test_normalize_voice_id_unknown_vietneu_falls_back_to_tuan_ngoc() {
        assert_eq!(normalize_voice_id("vietneu:xyz"), "kokoro:tuan_ngoc");
        assert_eq!(normalize_voice_id("vietneu:"), "kokoro:tuan_ngoc");
    }

    // =======================================================================
    // DEFECT-2: parser dòng kết quả của sidecar Kokoro batch.
    // =======================================================================

    #[test]
    fn test_parse_kokoro_batch_line_ok() {
        let (index, ok, samples, path) =
            parse_kokoro_batch_line("OK 3 C:\\tmp\\seg_3.wav 48000").expect("parse OK line");
        assert_eq!(index, 3);
        assert!(ok);
        assert_eq!(samples, 48000);
        assert_eq!(path, "C:\\tmp\\seg_3.wav");
    }

    #[test]
    fn test_parse_kokoro_batch_line_ok_with_spaces_in_path() {
        let (index, ok, samples, path) =
            parse_kokoro_batch_line("OK 0 C:\\Users\\A B\\seg_0.wav 12000").expect("parse OK line");
        assert_eq!(index, 0);
        assert!(ok);
        assert_eq!(samples, 12000);
        assert_eq!(path, "C:\\Users\\A B\\seg_0.wav");
    }

    #[test]
    fn test_parse_kokoro_batch_line_err() {
        let (index, ok, samples, message) =
            parse_kokoro_batch_line("ERR 7 Kokoro khong tao duoc audio").expect("parse ERR line");
        assert_eq!(index, 7);
        assert!(!ok);
        assert_eq!(samples, 0);
        assert_eq!(message, "Kokoro khong tao duoc audio");
    }

    #[test]
    fn test_parse_kokoro_batch_line_ignores_other_output() {
        assert!(parse_kokoro_batch_line("some legacy stdout line").is_none());
        assert!(parse_kokoro_batch_line("").is_none());
    }

    /// END-TO-END: Rust -> sidecar Kokoro batch -> parse kết quả stdout.
    /// Cần model Kokoro-Vietnamese + python; chạy tường minh:
    ///   cargo test --lib test_kokoro_batch_end_to_end -- --ignored --nocapture
    #[test]
    #[ignore = "cần model Kokoro-Vietnamese + python (chạy tường minh)"]
    fn test_kokoro_batch_end_to_end() {
        if !kokoro_available() {
            eprintln!("SKIP: chưa có model Kokoro-Vietnamese trên máy này.");
            return;
        }
        let temp_dir =
            std::env::temp_dir().join(format!("sublix_test_kokoro_batch_{}", gen_unique_id()));
        let _ = fs::create_dir_all(&temp_dir);

        let items: Vec<(String, String, PathBuf)> = vec![
            (
                "Xin chao Viet Nam.".to_string(),
                "kokoro:tuan_ngoc".to_string(),
                temp_dir.join("seg_0.wav"),
            ),
            // Câu rỗng -> lỗi riêng, KHÔNG được làm hỏng cả batch.
            (
                "".to_string(),
                "kokoro:tuan_ngoc".to_string(),
                temp_dir.join("seg_1.wav"),
            ),
            (
                "Cam on ban da xem video nay.".to_string(),
                "kokoro:tuan_ngoc".to_string(),
                temp_dir.join("seg_2.wav"),
            ),
        ];

        let results = synthesize_kokoro_batch(&items).expect("batch phải chạy được");
        assert_eq!(results.len(), 3, "mỗi item phải có đúng 1 kết quả");

        assert!(results[0].ok, "câu 0 phải tổng hợp thành công");
        assert!(results[0].samples > 0, "câu 0 phải có số mẫu audio > 0");
        assert!(items[0].2.exists(), "file WAV của câu 0 phải tồn tại");

        assert!(!results[1].ok, "câu rỗng phải báo lỗi");
        assert!(results[1].error.is_some(), "câu rỗng phải có thông báo lỗi");

        assert!(
            results[2].ok,
            "một câu lỗi KHÔNG được làm hỏng các câu còn lại của batch"
        );
        assert!(items[2].2.exists(), "file WAV của câu 2 phải tồn tại");

        let _ = fs::remove_dir_all(&temp_dir);
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
