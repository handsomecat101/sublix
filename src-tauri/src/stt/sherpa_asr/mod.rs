//! Offline speech recognition through the sherpa-onnx sidecar.
//!
//! The Python sidecar (`scripts/sherpa_asr.py`) loads a sherpa-onnx model and
//! returns JSON. This module keeps the Rust side thin: it locates the model,
//! spawns the sidecar, and converts the result into the **same** segment /
//! SRT shape the rest of Sublix already consumes
//! (`crate::file_sub::SubtitleSegment` + `write_srt_file`).
//!
//! Phần chạy sidecar + parse JSON nừm để ổ trong [`sherpa_sidecar`].

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub mod sherpa_sidecar;

pub use self::sherpa_sidecar::{ensure_sidecar, extract_archive, install_deps, transcribe};

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
