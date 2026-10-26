//! Dò phụ đề cứng THẬT trên video: lấy mẫu khung bằng ffmpeg → dò hộp chữ bằng model → `detect_band`.
//!
//! **Cách chạy model (và lý do)**: sidecar Python `scripts/hardsub_detect.py` dùng `onnxruntime` +
//! `numpy` — đúng cách dự án đang chạy ONNX (sherpa-onnx STT/diarization, VieNeu TTS) nên **không
//! thêm crate mới** vào Cargo (crate `ort` kéo DLL onnxruntime ~10 MB theo exe, build Windows dễ
//! lỗi liên kết, và bị Smart App Control soi thêm DLL). Máy đã có Python + onnxruntime thì không cần
//! tải gì ngoài model 4 MB; chưa có thì `HARDSUB_DEPS_MISSING` → UI cho cài (cùng cơ chế sherpa).
//! Sidecar tự gọi ffmpeg (1 khung/giây, chỉ vùng `Region`), nên Rust chỉ lo vùng cắt, tiến trình,
//! huỷ và đổi toạ độ.
//!
//! **Huỷ**: cờ riêng [`cancel`] + chỉ kết thúc đúng PID sidecar của lượt này (không đụng việc khác).

use super::band::{detect_band, BandOptions, Region};
use super::boxes::{self, SidecarLine};
use super::model;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::Instant;
use tracing::{info, warn};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Thiếu model (UI hiện "Tải mô hình · 4 MB").
pub const ERR_MODEL_MISSING: &str = "HARDSUB_MODEL_MISSING";
/// Thiếu Python / onnxruntime / numpy.
pub const ERR_DEPS_MISSING: &str = "HARDSUB_DEPS_MISSING";
/// Không đọc được video.
pub const ERR_VIDEO: &str = "HARDSUB_VIDEO_UNREADABLE";
/// Người dùng huỷ.
pub const ERR_CANCELLED: &str = "HARDSUB_CANCELLED";
/// Lỗi khác (model hỏng, sidecar chết…).
pub const ERR_FAILED: &str = "HARDSUB_FAILED";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const SCRIPT: &str = include_str!("../../scripts/hardsub_detect.py");

static CANCEL: AtomicBool = AtomicBool::new(false);
static RUNNING: AtomicBool = AtomicBool::new(false);
static CHILD_PID: AtomicU32 = AtomicU32::new(0);

/// Lỗi có mã máy đọc được; chuỗi hiển thị dạng `"<MÃ>: <thông điệp>"` để UI tách mã.
#[derive(Debug, Clone, PartialEq)]
pub struct DetectError {
    pub code: &'static str,
    pub message: String,
}

impl std::fmt::Display for DetectError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

fn err(code: &'static str, message: impl Into<String>) -> DetectError {
    DetectError { code, message: message.into() }
}

/// Dải phụ đề cứng (pixel khung gốc) — dạng gửi cho frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct BandDto {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// Kết quả `hardsub_detect`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HardsubDetection {
    /// `None` = không thấy phụ đề cứng.
    pub band: Option<BandDto>,
    /// Các khoảng thời gian có chữ `[bắt đầu, kết thúc]` (giây).
    pub spans: Vec<(f64, f64)>,
    pub frames_with_text: usize,
    /// Số khung đã xét.
    pub frames_total: usize,
    pub frame_width: u32,
    pub frame_height: u32,
    /// Thời gian chạy (ms).
    pub elapsed_ms: u64,
}

/// Xin huỷ lượt dò đang chạy (chỉ kết thúc sidecar của lượt này).
pub fn cancel() {
    CANCEL.store(true, Ordering::SeqCst);
    let pid = CHILD_PID.load(Ordering::SeqCst);
    if pid != 0 {
        crate::proc_kill::kill_pid_tree(pid);
    }
}

fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    #[cfg(not(windows))]
    let _ = cmd;
}

fn probe(file: &Path, ffmpeg: &Path) -> Result<boxes::VideoInfo, DetectError> {
    let mut cmd = Command::new(ffmpeg);
    cmd.args(["-hide_banner", "-i"]).arg(file).stdout(Stdio::null()).stderr(Stdio::piped());
    no_window(&mut cmd);
    let out = cmd.output().map_err(|e| err(ERR_VIDEO, format!("Không chạy được ffmpeg: {e}")))?;
    boxes::parse_probe(&String::from_utf8_lossy(&out.stderr))
        .ok_or_else(|| err(ERR_VIDEO, format!("Không đọc được video: {}", file.display())))
}

/// Dò phụ đề cứng. `on_progress(percent, message)` được gọi khi có tiến triển.
pub fn detect(
    file: &Path,
    region: Region,
    fps: f64,
    on_progress: &mut dyn FnMut(u32, &str),
) -> Result<HardsubDetection, DetectError> {
    if !model::is_installed() {
        return Err(err(ERR_MODEL_MISSING, "Chưa có mô hình dò chữ (4 MB) — hãy tải mô hình."));
    }
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err(err(ERR_FAILED, "Đang có một lượt dò phụ đề cứng khác."));
    }
    CANCEL.store(false, Ordering::SeqCst);
    let res = run(file, region, fps.clamp(0.2, 5.0), on_progress);
    CHILD_PID.store(0, Ordering::SeqCst);
    RUNNING.store(false, Ordering::SeqCst);
    res
}

fn run(
    file: &Path,
    region: Region,
    fps: f64,
    on_progress: &mut dyn FnMut(u32, &str),
) -> Result<HardsubDetection, DetectError> {
    let started = Instant::now();
    let ffmpeg = crate::dubbing::find_ffmpeg();
    on_progress(0, "Đọc thông tin video");
    let info = probe(file, &ffmpeg)?;
    if !crate::dubbing::tts_common::python_has_modules(&["onnxruntime", "numpy"]) {
        return Err(err(ERR_DEPS_MISSING, "Thiếu thư viện Python (onnxruntime, numpy)."));
    }
    let script = crate::dubbing::tts_common::ensure_script("hardsub_detect.py", SCRIPT)
        .map_err(|e| err(ERR_FAILED, format!("{e:#}")))?;
    let crop = boxes::crop_rect(info.width, info.height, region);
    let total = boxes::expected_frames(info.duration, fps);

    let mut cmd = Command::new(crate::dubbing::find_python());
    cmd.arg("-X").arg("utf8").arg(&script);
    cmd.arg("--model").arg(model::model_path()).arg("--video").arg(file).arg("--ffmpeg").arg(&ffmpeg);
    cmd.arg("--crop").arg(format!("{}:{}:{}:{}", crop.x, crop.y, crop.w, crop.h));
    cmd.arg("--fps").arg(fps.to_string()).arg("--total").arg(total.to_string());
    cmd.env("PYTHONUTF8", "1").env("PYTHONIOENCODING", "utf-8");
    cmd.stdout(Stdio::piped()).stderr(Stdio::null());
    no_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| err(ERR_DEPS_MISSING, format!("Không chạy được Python: {e}")))?;
    CHILD_PID.store(child.id(), Ordering::SeqCst);
    if CANCEL.load(Ordering::SeqCst) {
        crate::proc_kill::kill_pid_tree(child.id());
    }

    let mut result = None;
    let mut failure = None;
    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            match boxes::parse_sidecar_line(&line) {
                Some(SidecarLine::Progress { done, total }) => {
                    let pct = if total == 0 { 0 } else { (done * 100 / total).min(99) as u32 };
                    on_progress(pct, &format!("Đã xét {done}/{total} khung"));
                }
                Some(SidecarLine::Result(r)) => result = Some(r),
                Some(SidecarLine::Error { code, message }) => failure = Some((code, message)),
                None => {}
            }
        }
    }
    let _ = child.wait();
    if CANCEL.load(Ordering::SeqCst) {
        return Err(err(ERR_CANCELLED, "Đã huỷ dò phụ đề cứng."));
    }
    if let Some((code, message)) = failure {
        warn!(%code, %message, "hardsub sidecar báo lỗi");
        return Err(match code.as_str() {
            "no_module" => err(ERR_DEPS_MISSING, message),
            "ffmpeg" => err(ERR_VIDEO, message),
            _ => err(ERR_FAILED, message),
        });
    }
    let result = result.ok_or_else(|| err(ERR_FAILED, "Sidecar dò chữ không trả kết quả."))?;

    let frames = boxes::to_frame_boxes(&result, crop, info.width, info.height);
    let opt = BandOptions { region, ..BandOptions::default() };
    let r = detect_band(&frames, info.width, info.height, &opt);
    let out = HardsubDetection {
        band: r.band.map(|b| BandDto { x: b.x, y: b.y, w: b.w, h: b.h }),
        spans: r.spans,
        frames_with_text: r.frames_with_text,
        frames_total: r.frames_total,
        frame_width: info.width,
        frame_height: info.height,
        elapsed_ms: started.elapsed().as_millis() as u64,
    };
    info!(frames = out.frames_total, with_text = out.frames_with_text, ms = out.elapsed_ms, "hardsub detect xong");
    on_progress(100, "Xong");
    Ok(out)
}

/// Cài thư viện Python cần cho dò chữ (onnxruntime + numpy), gọi `on_line` theo từng dòng log.
pub fn install_deps(on_line: &mut dyn FnMut(&str)) -> anyhow::Result<()> {
    crate::dubbing::tts_common::pip_install(&["onnxruntime", "numpy"], |l| on_line(l))
}
