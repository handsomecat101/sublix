//! Phần dùng chung của các engine TTS chạy bằng sidecar Python (VieNeu, ZeroTTS):
//! ghi script nhúng ra đĩa, chạy `--batch` (nạp model 1 lần cho cả lô), đọc dòng `OK/ERR`,
//! chọn thiết bị theo `stt_engine_preference` (cùng cách BUG-H11) và cài thư viện pip.

use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use tracing::{info, warn};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Một câu cần đọc trong lô.
#[derive(Debug, Clone)]
pub struct BatchItem {
    pub text: String,
    pub voice: String,
    pub out: PathBuf,
    /// Clip mẫu 3–10 giây để clone giọng (chỉ VieNeu dùng).
    pub ref_audio: Option<PathBuf>,
}

/// Kết quả từng câu (một câu lỗi không làm hỏng cả lô).
#[derive(Debug, Clone)]
pub struct BatchResult {
    pub ok: bool,
    pub samples: u64,
    pub error: Option<String>,
}

/// `auto` | `cpu` | `cuda` — lấy từ cấu hình engine hiện có (Cpu→cpu, Cuda→cuda (hạ CPU nếu không có), Auto→auto).
pub fn device_arg() -> &'static str {
    match crate::config::AppConfig::load_or_default()
        .stt_engine_preference
        .trim()
        .to_lowercase()
        .as_str()
    {
        "cpu" => "cpu",
        "cuda" | "gpu" => "cuda",
        _ => "auto",
    }
}

/// Ghi script nhúng vào `<app>/scripts/<name>` (idempotent) và trả đường dẫn.
pub fn ensure_script(name: &str, content: &str) -> Result<PathBuf> {
    let dir = crate::config::app_base_dir().join("scripts");
    fs::create_dir_all(&dir).with_context(|| format!("Tạo thư mục {}", dir.display()))?;
    let path = dir.join(name);
    if fs::read_to_string(&path).map(|s| s != content).unwrap_or(true) {
        fs::write(&path, content).with_context(|| format!("Ghi sidecar {}", path.display()))?;
    }
    Ok(path)
}

fn python_cmd(script: &Path) -> Command {
    let mut cmd = Command::new(super::find_python());
    cmd.arg("-X").arg("utf8").arg(script);
    cmd.env("PYTHONUTF8", "1").env("PYTHONIOENCODING", "utf-8");
    #[cfg(windows)]
    cmd.creation_flags(super::CREATE_NO_WINDOW);
    cmd
}

/// Dòng máy đọc: `OK <i> <path> <samples>` hoặc `ERR <i> <msg>`; path có thể chứa khoảng trắng (parse từ phải).
pub fn parse_line(line: &str) -> Option<(usize, bool, u64, String)> {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix("OK ") {
        let mut tail = rest.rsplitn(2, ' ');
        let samples = tail.next()?.trim().parse::<u64>().ok()?;
        let head = tail.next()?;
        let mut parts = head.splitn(2, ' ');
        let index = parts.next()?.trim().parse::<usize>().ok()?;
        Some((index, true, samples, parts.next().unwrap_or("").trim().to_string()))
    } else if let Some(rest) = line.strip_prefix("ERR ") {
        let mut parts = rest.splitn(2, ' ');
        let index = parts.next()?.trim().parse::<usize>().ok()?;
        Some((index, false, 0, parts.next().unwrap_or("").trim().to_string()))
    } else {
        None
    }
}

/// Chạy sidecar ở chế độ batch. `Err` chỉ khi không nạp được model / không chạy được Python.
pub fn run_batch(script: &Path, model_dir: &Path, items: &[BatchItem]) -> Result<Vec<BatchResult>> {
    if items.is_empty() {
        return Ok(Vec::new());
    }
    let manifest: Vec<serde_json::Value> = items
        .iter()
        .map(|it| {
            serde_json::json!({
                "text": it.text,
                "voice": it.voice,
                "out": it.out.to_string_lossy(),
                "ref_audio": it.ref_audio.as_ref().map(|p| p.to_string_lossy().to_string()),
            })
        })
        .collect();
    let manifest_path = std::env::temp_dir().join(format!("sublix_tts_batch_{}.json", super::gen_unique_id()));
    fs::write(&manifest_path, serde_json::to_string(&manifest).context("Serialize manifest TTS")?)
        .with_context(|| format!("Ghi manifest {}", manifest_path.display()))?;

    let mut cmd = python_cmd(script);
    cmd.arg("--model-dir")
        .arg(model_dir)
        .arg("--batch")
        .arg(&manifest_path)
        .arg("--device")
        .arg(device_arg())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = cmd.spawn().with_context(|| "Không chạy được Python cho sidecar TTS (thiếu python?)")?;
    super::ACTIVE_CHILD_PID.store(child.id(), Ordering::SeqCst);
    let output = child.wait_with_output().context("Chờ sidecar TTS")?;
    super::ACTIVE_CHILD_PID.store(0, Ordering::SeqCst);
    let _ = fs::remove_file(&manifest_path);

    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        anyhow::bail!(
            "Sidecar TTS thất bại (exit {:?}): {}",
            output.status.code(),
            stderr.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim()
        );
    }
    let mut results: Vec<BatchResult> = items
        .iter()
        .map(|_| BatchResult { ok: false, samples: 0, error: Some("Sidecar chưa trả kết quả cho câu này.".into()) })
        .collect();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if let Some(dev) = line.trim().strip_prefix("DEVICE ") {
            info!("TTS sidecar chạy trên thiết bị: {dev}");
            continue;
        }
        let Some((i, ok, samples, detail)) = parse_line(line) else { continue };
        if i < results.len() {
            results[i] = if ok {
                BatchResult { ok: true, samples, error: None }
            } else {
                BatchResult { ok: false, samples: 0, error: Some(detail) }
            };
        }
    }
    for w in stderr.lines().filter(|l| l.starts_with("WARN")) {
        warn!("TTS sidecar: {w}");
    }
    Ok(results)
}

/// Chạy sidecar với 1 cờ thông tin (`--list-voices`, `--diagnose`) và trả JSON ở dòng cuối stdout.
pub fn run_info(script: &Path, model_dir: &Path, flag: &str) -> Result<serde_json::Value> {
    let out = python_cmd(script)
        .arg("--model-dir")
        .arg(model_dir)
        .arg(flag)
        .output()
        .with_context(|| "Không chạy được Python cho sidecar TTS")?;
    if !out.status.success() {
        anyhow::bail!("Sidecar {flag} thất bại: {}", String::from_utf8_lossy(&out.stderr).trim());
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let last = stdout.lines().rev().find(|l| l.trim_start().starts_with('[') || l.trim_start().starts_with('{'));
    serde_json::from_str(last.unwrap_or("null")).context("Đọc JSON từ sidecar")
}

/// Python hiện tại đã có các module này chưa (vd `["vieneu", "onnxruntime"]`).
pub fn python_has_modules(mods: &[&str]) -> bool {
    let code = format!(
        "import importlib.util,sys;sys.exit(0 if all(importlib.util.find_spec(m) for m in {:?}) else 1)",
        mods
    )
    .replace('"', "'");
    let mut cmd = Command::new(super::find_python());
    cmd.arg("-c").arg(code);
    #[cfg(windows)]
    cmd.creation_flags(super::CREATE_NO_WINDOW);
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

/// Máy có card NVIDIA không (nvidia-smi chạy được) — quyết định cài `onnxruntime-gpu` hay `onnxruntime`.
pub fn has_nvidia_gpu() -> bool {
    let mut cmd = Command::new("nvidia-smi");
    cmd.arg("-L");
    #[cfg(windows)]
    cmd.creation_flags(super::CREATE_NO_WINDOW);
    cmd.output().map(|o| o.status.success() && !o.stdout.is_empty()).unwrap_or(false)
}

fn ort_has_cuda() -> bool {
    let mut cmd = Command::new(super::find_python());
    cmd.arg("-c").arg(
        "import onnxruntime as o,sys;sys.exit(0 if 'CUDAExecutionProvider' in o.get_available_providers() else 1)",
    );
    #[cfg(windows)]
    cmd.creation_flags(super::CREATE_NO_WINDOW);
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

/// onnxruntime cho engine ONNX: máy có NVIDIA (và người dùng không ép CPU) → `onnxruntime-gpu` + DLL CUDA 12/cuDNN 9
/// qua gói pip `nvidia-*`; ngược lại bản CPU. Đã đủ thì không đụng (không phá môi trường Kokoro/whisper).
pub fn install_runtime_deps(on_line: &mut dyn FnMut(&str)) -> Result<()> {
    let want_gpu = device_arg() != "cpu" && has_nvidia_gpu();
    if want_gpu && !ort_has_cuda() {
        on_line("Phát hiện NVIDIA GPU → cài onnxruntime-gpu (CUDA 12)…");
        let mut un = Command::new(super::find_python());
        un.args(["-m", "pip", "uninstall", "-y", "onnxruntime"]);
        #[cfg(windows)]
        un.creation_flags(super::CREATE_NO_WINDOW);
        let _ = un.output();
        pip_install(
            &[
                "onnxruntime-gpu", "nvidia-cudnn-cu12", "nvidia-cublas-cu12", "nvidia-cuda-runtime-cu12",
                "nvidia-cufft-cu12", "nvidia-curand-cu12", "nvidia-cuda-nvrtc-cu12",
            ],
            |l| on_line(l),
        )?;
    } else if !python_has_modules(&["onnxruntime"]) {
        on_line("Cài onnxruntime (CPU)…");
        pip_install(&["onnxruntime"], |l| on_line(l))?;
    }
    Ok(())
}

/// `python -m pip install <args>`; gọi `on_line` cho từng dòng log. Thử lại với `--user` nếu thiếu quyền.
pub fn pip_install(args: &[&str], mut on_line: impl FnMut(&str)) -> Result<()> {
    for user_flag in [false, true] {
        let mut cmd = Command::new(super::find_python());
        cmd.arg("-m").arg("pip").arg("install").arg("--disable-pip-version-check");
        if user_flag {
            cmd.arg("--user");
        }
        cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(super::CREATE_NO_WINDOW);
        let out = cmd.output().with_context(|| "Không chạy được pip (thiếu python?)")?;
        for l in String::from_utf8_lossy(&out.stdout).lines().filter(|l| !l.trim().is_empty()) {
            on_line(l);
        }
        if out.status.success() {
            return Ok(());
        }
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        if user_flag || !err.to_lowercase().contains("permission") {
            anyhow::bail!("pip install {} thất bại: {}", args.join(" "), err.trim());
        }
    }
    Ok(())
}
