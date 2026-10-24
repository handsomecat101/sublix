//! Offline speech recognition through the sherpa-onnx sidecar.
//!
//! The Python sidecar (`scripts/sherpa_asr.py`) loads a sherpa-onnx model and
//! returns JSON. This module keeps the Rust side thin: it locates the model,
//! spawns the sidecar, and converts the result into the **same** segment /
//! SRT shape the rest of Sublix already consumes
//! (`crate::file_sub::SubtitleSegment` + `write_srt_file`).

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// One recognised sentence with its time range (seconds).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SttSegment {
    pub start: f32,
    pub end: f32,
    pub text: String,
}

/// Result of a recognition run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SttAsrResult {
    pub text: String,
    pub language: String,
    /// Catalog id of the engine that produced the result.
    pub engine: String,
    /// Model family (`sensevoice`, `paraformer`, `parakeet`, `canary`).
    pub family: String,
    pub audio_duration_secs: f32,
    pub inference_duration_secs: f32,
    /// `"word"` = real token timestamps, `"synthetic"` = proportional split.
    pub timestamps: String,
    pub segments: Vec<SttSegment>,
}

impl SttAsrResult {
    /// Real-time factor (inference seconds per audio second). Lower is better.
    pub fn rtf(&self) -> f32 {
        if self.audio_duration_secs <= 0.0 {
            return 0.0;
        }
        self.inference_duration_secs / self.audio_duration_secs
    }
}

/// Raw JSON payload produced by the sidecar.
#[derive(Debug, Deserialize)]
struct SidecarResult {
    ok: bool,
    family: String,
    text: String,
    #[serde(default)]
    language: String,
    #[serde(default)]
    segments: Vec<SttSegment>,
    #[serde(default = "default_timestamps")]
    timestamps: String,
    #[serde(default)]
    audio_secs: f64,
    #[serde(default)]
    decode_secs: f64,
}

fn default_timestamps() -> String {
    "synthetic".to_string()
}

/// Directory holding the STT models.
///
/// Defaults to `<app>/models/stt`, but can be redirected with the
/// `SUBLIX_STT_MODELS_DIR` environment variable (used by the benchmark /
/// integration tests so nothing lands inside the repository).
pub fn stt_models_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("SUBLIX_STT_MODELS_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    crate::config::app_base_dir().join("models").join("stt")
}

/// Directory of one engine's model.
pub fn model_dir(engine_id: &str) -> PathBuf {
    stt_models_dir().join(engine_id)
}

/// Write the embedded sidecar next to the app and return its path.
pub fn ensure_sidecar() -> Result<PathBuf> {
    crate::dubbing::tts_common::ensure_script(
        "sherpa_asr.py",
        include_str!("../../scripts/sherpa_asr.py"),
    )
}

/// Python modules the sidecar needs.
const REQUIRED_MODULES: [&str; 4] = ["sherpa_onnx", "numpy", "soundfile", "onnxruntime"];

/// True when the Python sidecar has everything it needs.
pub fn deps_ready() -> bool {
    crate::dubbing::tts_common::python_has_modules(&REQUIRED_MODULES)
}

/// True when the machine exposes an NVIDIA GPU (decides CUDA vs CPU).
pub fn has_nvidia_gpu() -> bool {
    crate::dubbing::tts_common::has_nvidia_gpu()
}

/// Install the Python dependencies for the sherpa STT engines.
///
/// Installs `onnxruntime-gpu` when an NVIDIA GPU is present, otherwise the
/// CPU build.
pub fn install_deps(on_line: &mut dyn FnMut(&str)) -> Result<()> {
    let gpu = has_nvidia_gpu();
    let ort = if gpu { "onnxruntime-gpu" } else { "onnxruntime" };
    let packages = ["sherpa-onnx", "numpy", "soundfile", ort];

    let mut cmd = Command::new(crate::dubbing::find_python());
    cmd.arg("-m")
        .arg("pip")
        .arg("install")
        .arg("--upgrade")
        .args(packages.iter());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .context("Không chạy được Python để cài thư viện sherpa-onnx")?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    for line in stderr.lines().rev().take(12) {
        on_line(line.trim());
    }
    if !output.status.success() {
        bail!(
            "Cài thư viện Python thất bại: {}",
            stderr.lines().last().unwrap_or("không rõ lỗi")
        );
    }
    on_line(if gpu {
        "Đã cài onnxruntime-gpu (CUDA)"
    } else {
        "Đã cài onnxruntime (CPU)"
    });
    Ok(())
}

/// Pick the ONNX Runtime provider from the engine preference (BUG-H11).
///
/// `cpu` forces CPU, `cuda` forces CUDA, `auto` prefers CUDA when the machine
/// actually has an NVIDIA GPU.
pub fn provider_for(preference: &str) -> &'static str {
    match preference.trim().to_ascii_lowercase().as_str() {
        "cpu" => "cpu",
        "cuda" | "gpu" => "cuda",
        _ => {
            if has_nvidia_gpu() {
                "cuda"
            } else {
                "cpu"
            }
        }
    }
}

/// Run the sidecar on a WAV file.
pub fn transcribe(
    engine_id: &str,
    family: &str,
    wav_path: &Path,
    language: &str,
    preference: &str,
) -> Result<SttAsrResult> {
    let model_dir = model_dir(engine_id);
    if !model_dir.exists() {
        bail!(
            "Model STT '{}' chưa được tải — hãy tải model trong Cài đặt trước.",
            engine_id
        );
    }
    if !deps_ready() {
        bail!(
            "Thiếu thư viện Python cho engine sherpa (sherpa-onnx / onnxruntime) — bấm 'Cài thư viện'."
        );
    }

    let script = ensure_sidecar()?;
    let out_json = std::env::temp_dir().join(format!(
        "sublix-stt-{}-{}.json",
        engine_id,
        std::process::id()
    ));

    let provider = provider_for(preference);
    let threads = std::thread::available_parallelism()
        .map(|n| n.get().clamp(2, 8) as i64)
        .unwrap_or(4);

    let mut cmd = Command::new(crate::dubbing::find_python());
    cmd.arg("-X")
        .arg("utf8")
        .arg(&script)
        .arg("--transcribe")
        .arg("--model-dir")
        .arg(&model_dir)
        .arg("--family")
        .arg(family)
        .arg("--wav")
        .arg(wav_path)
        .arg("--out")
        .arg(&out_json)
        .arg("--lang")
        .arg(if language.is_empty() { "auto" } else { language })
        .arg("--provider")
        .arg(provider)
        .arg("--threads")
        .arg(threads.to_string())
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .context("Không chạy được sidecar nhận dạng giọng nói (sherpa-onnx)")?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        bail!(
            "Nhận dạng thất bại: {}",
            err.lines().last().unwrap_or("không rõ lỗi")
        );
    }

    let raw = std::fs::read_to_string(&out_json)
        .context("Không đọc được kết quả nhận dạng từ sidecar")?;
    let _ = std::fs::remove_file(&out_json);

    let parsed: SidecarResult =
        serde_json::from_str(&raw).context("Đọc JSON kết quả nhận dạng lỗi")?;
    if !parsed.ok {
        bail!("Sidecar nhận dạng trả về lỗi");
    }

    Ok(SttAsrResult {
        text: parsed.text,
        language: parsed.language,
        engine: engine_id.to_string(),
        family: parsed.family,
        audio_duration_secs: parsed.audio_secs as f32,
        inference_duration_secs: parsed.decode_secs as f32,
        timestamps: parsed.timestamps,
        segments: parsed.segments,
    })
}

/// Convert an ASR result into the Sublix subtitle segment shape.
pub fn to_subtitle_segments(result: &SttAsrResult) -> Vec<crate::file_sub::SubtitleSegment> {
    result
        .segments
        .iter()
        .filter(|s| !s.text.trim().is_empty())
        .enumerate()
        .map(|(i, s)| crate::file_sub::SubtitleSegment {
            index: i + 1,
            start_time: crate::dubbing::format_seconds_to_srt(s.start as f64),
            end_time: crate::dubbing::format_seconds_to_srt(s.end as f64),
            original: s.text.trim().to_string(),
            translated: None,
        })
        .collect()
}

/// Write the result as an SRT file using the shared Sublix writer.
pub fn write_srt(path: &Path, result: &SttAsrResult) -> Result<()> {
    let segments = to_subtitle_segments(result);
    crate::file_sub::write_srt_file(path, &segments, "original")
}

/// Extract a downloaded model archive into the engine's model directory.
pub fn extract_archive(engine_id: &str, archive: &Path) -> Result<()> {
    let dest = model_dir(engine_id);
    std::fs::create_dir_all(&dest)
        .with_context(|| format!("Không tạo được thư mục model: {}", dest.display()))?;

    let script = ensure_sidecar()?;
    let mut cmd = Command::new(crate::dubbing::find_python());
    cmd.arg("-X")
        .arg("utf8")
        .arg(&script)
        .arg("--extract")
        .arg(archive)
        .arg("--dest")
        .arg(&dest)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .context("Không giải nén được gói model")?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        bail!(
            "Giải nén model thất bại: {}",
            err.lines().last().unwrap_or("không rõ lỗi")
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_respects_preference() {
        // The machine in CI has no NVIDIA GPU, so "auto" must stay on CPU.
        assert_eq!(provider_for("cpu"), "cpu");
        assert_eq!(provider_for("CUDA"), "cuda");
        assert_eq!(provider_for("auto"), if has_nvidia_gpu() { "cuda" } else { "cpu" });
    }

    #[test]
    fn segments_convert_to_subtitle_shape() {
        let result = SttAsrResult {
            text: "xin chào".to_string(),
            language: "zh".to_string(),
            engine: "sensevoice-zh-en".to_string(),
            family: "sensevoice".to_string(),
            audio_duration_secs: 2.0,
            inference_duration_secs: 0.1,
            timestamps: "word".to_string(),
            segments: vec![
                SttSegment { start: 0.0, end: 1.25, text: "xin chào".to_string() },
                SttSegment { start: 1.25, end: 2.0, text: "  ".to_string() },
            ],
        };
        let segments = to_subtitle_segments(&result);
        assert_eq!(segments.len(), 1, "segment rỗng phải bị loại");
        assert_eq!(segments[0].index, 1);
        assert_eq!(segments[0].start_time, "00:00:00,000");
        assert_eq!(segments[0].end_time, "00:00:01,250");
        assert_eq!(segments[0].original, "xin chào");
    }

    #[test]
    fn rtf_is_computed_from_durations() {
        let result = SttAsrResult {
            text: String::new(),
            language: "en".to_string(),
            engine: "e".to_string(),
            family: "f".to_string(),
            audio_duration_secs: 100.0,
            inference_duration_secs: 5.0,
            timestamps: "word".to_string(),
            segments: vec![],
        };
        assert!((result.rtf() - 0.05).abs() < 1e-6);
    }
}
