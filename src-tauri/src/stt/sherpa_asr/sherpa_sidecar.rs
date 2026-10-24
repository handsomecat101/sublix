//! Chạy sidecar Python `sherpa_asr.py` + parse kết quả JSON trả về.

use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use super::{deps_ready, has_nvidia_gpu, model_dir, provider_for, SttAsrResult, SttSegment};

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

/// Write the embedded sidecar next to the app and return its path.
pub fn ensure_sidecar() -> Result<PathBuf> {
    crate::dubbing::tts_common::ensure_script(
        "sherpa_asr.py",
        include_str!("../../../scripts/sherpa_asr.py"),
    )
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
