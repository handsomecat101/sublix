//! TSK-LAB-C2 — đo đặc trưng cảnh bằng **một lượt ffmpeg** (lấy mẫu thưa).
//!
//! Với video gameplay nhiều giờ, chạy phân tích từng khung là quá chậm ⇒ module này lấy
//! mẫu **2 khung/giây**, thu nhỏ còn 320 px, rồi trích 3 tín hiệu trong **cùng một lượt**:
//!
//! | Tín hiệu | Bộ lọc | Đầu ra |
//! |---|---|---|
//! | Đổi cảnh | `scdet` (score 0–100 mỗi khung) | metadata → [`VideoFeatures::cuts`] |
//! | Dải đen | `cropdetect` (vùng nhìn thấy mỗi khung) | metadata → [`VideoFeatures::letterbox`] |
//! | Im lặng | `silencedetect` | log stderr → [`VideoFeatures::silence`] |
//!
//! Phần đọc chuỗi nằm ở [`super::probe_parse`] (thuần, test bằng mẫu thật); file này chỉ
//! lo chạy tiến trình, tiến độ, huỷ và dọn tệp tạm.
//!
//! **Tốc độ thực đo** (ffmpeg 9.0.2, `fps=2`, `scale=320`, 2026-10-28):
//! - `hardsub_zh_30s.mp4` (30 s, 1280×720): chạy **1,16 s** ≈ 26× thời gian thực (~2,3 s
//!   mỗi phút video).
//! - Clip Elden Ring 20,6 s (1080p): chạy **1,27 s** ≈ 16× (~3,7 s mỗi phút video).
//!   Phần lớn thời gian là khởi động tiến trình + lượt `-i` ⇒ video 3 giờ ước tính
//!   **7–11 phút** (chấp nhận được cho bước "Phân tích" có thanh tiến trình).
//!
//! **Huỷ**: cờ [`AtomicBool`] được kiểm sau **mỗi dòng log** (ffmpeg in `-progress` ~2
//! lần/giây) ⇒ độ trễ huỷ < 1 s; huỷ thì giết cả cây tiến trình
//! ([`crate::proc_kill::kill_pid_tree`]).
//!
//! **Không dùng** `-progress pipe:1` vì stdout đã dành cho `metadata=print` — metadata
//! được ghi ra tệp tạm trong thư mục temp (`current_dir` = temp để đường dẫn trong filter
//! không phải escape dấu `:` của Windows), xoá ngay khi đọc xong (kể cả khi lỗi).

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use anyhow::{bail, Context, Result};
use tracing::debug;

use crate::hardsub::boxes::parse_probe;

use super::probe_parse::{parse_metadata, parse_progress, video_features};
pub use super::probe_parse::{LetterboxRange, SilenceRange, VideoFeatures};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Tham số lấy mẫu — mặc định đã cân bằng tốc độ/độ chính xác cho gameplay dài.
#[derive(Debug, Clone, PartialEq)]
pub struct ProbeOptions {
    /// Số khung lấy mẫu mỗi giây (2 ⇒ sai số thời gian ±0,5 s).
    pub sample_fps: f64,
    /// Chiều rộng khung thu nhỏ (px, giữ tỉ lệ; số chẵn).
    pub scale_width: u32,
    /// Ngưỡng đổi cảnh 0–1 (0.12 ≈ 12 % như ffmpeg `scdet=t=12`).
    pub scene_threshold: f64,
    /// Ngưỡng im lặng (dB, số âm — càng âm càng dễ bắt im lặng).
    pub silence_noise_db: f64,
    /// Im lặng ngắn hơn mức này thì bỏ qua (giây).
    pub silence_min_secs: f64,
    /// Ngưỡng sáng của `cropdetect` — vùng tối hơn bị coi là dải đen.
    pub crop_limit: u32,
}

impl Default for ProbeOptions {
    fn default() -> Self {
        Self {
            sample_fps: 2.0,
            scale_width: 320,
            scene_threshold: 0.12,
            silence_noise_db: -35.0,
            silence_min_secs: 1.0,
            crop_limit: 24,
        }
    }
}

/// Đo đặc trưng video với tham số mặc định.
pub fn probe_video(
    ffmpeg: &Path,
    video: &Path,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(f64),
) -> Result<VideoFeatures> {
    probe_video_with(ffmpeg, video, &ProbeOptions::default(), cancel, on_progress)
}

/// Đo đặc trưng video. `on_progress` nhận **phần trăm 0–100**.
pub fn probe_video_with(
    ffmpeg: &Path,
    video: &Path,
    options: &ProbeOptions,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(f64),
) -> Result<VideoFeatures> {
    let started = Instant::now();
    let meta = probe_info(ffmpeg, video)?;
    if meta.duration <= 0.0 || meta.width < 16 || meta.height < 16 {
        bail!(
            "Không đọc được thông tin video ({}×{}, {:.1}s): {}",
            meta.width,
            meta.height,
            meta.duration,
            video.display()
        );
    }

    // Khung thu nhỏ: chiều rộng cố định, chiều cao theo tỉ lệ (ffmpeg `-2` ⇒ số chẵn).
    let scale_w = even(options.scale_width.max(32));
    let scale_h = even(scale_w.saturating_mul(meta.height).max(2) / meta.width).max(2);

    let temp = TempMeta::new();
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostats".into(),
        "-loglevel".into(),
        "info".into(),
        "-i".into(),
        video.display().to_string(),
        "-vf".into(),
        format!(
            "fps={},scale={}:-2,cropdetect=limit={}:round=2,scdet=t=100,metadata=print:file={}",
            options.sample_fps,
            scale_w,
            options.crop_limit,
            temp.name
        ),
    ];
    if meta.has_audio {
        args.extend([
            "-af".into(),
            format!(
                "silencedetect=noise={}dB:d={}",
                options.silence_noise_db, options.silence_min_secs
            ),
            "-map".into(),
            "0:a:0".into(),
        ]);
    }
    args.extend([
        "-map".into(),
        "0:v:0".into(),
        "-progress".into(),
        "pipe:2".into(),
        "-f".into(),
        "null".into(),
        "-".into(),
    ]);

    let mut cmd = Command::new(ffmpeg);
    cmd.args(&args)
        .current_dir(&temp.dir)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    no_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .with_context(|| format!("Không chạy được ffmpeg ({}): {}", ffmpeg.display(), video.display()))?;
    let stderr = child
        .stderr
        .take()
        .context("Không mở được luồng log của ffmpeg")?;

    let mut log = String::new();
    let mut cancelled = false;
    for line in BufReader::new(stderr).lines() {
        if cancel.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }
        let Ok(line) = line else { break };
        if let Some(secs) = parse_progress(&line) {
            on_progress((secs / meta.duration).clamp(0.0, 1.0) * 100.0);
        }
        log.push_str(&line);
        log.push('\n');
    }

    if cancelled {
        crate::proc_kill::kill_pid_tree(child.id());
        let _ = child.wait();
        bail!("Đã huỷ phân tích video.");
    }
    let status = child.wait().context("Không đợi được ffmpeg kết thúc")?;
    on_progress(100.0);

    let text = std::fs::read_to_string(&temp.path).unwrap_or_default();
    let frames = parse_metadata(&text);
    if frames.is_empty() {
        bail!(
            "ffmpeg không trả về khung nào (mã {:?}): {}",
            status.code(),
            tail(&log)
        );
    }

    let mut features = video_features(
        &frames,
        &log,
        meta.duration,
        scale_w,
        scale_h,
        options.scene_threshold,
    );
    features.elapsed_ms = started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
    debug!(
        frames = features.frames,
        cuts = features.cuts.len(),
        letterbox = features.letterbox.len(),
        silence = features.silence.len(),
        elapsed_ms = features.elapsed_ms,
        "lab: đã đo đặc trưng video"
    );
    Ok(features)
}

struct VideoMeta {
    width: u32,
    height: u32,
    duration: f64,
    has_audio: bool,
}

fn probe_info(ffmpeg: &Path, video: &Path) -> Result<VideoMeta> {
    let mut cmd = Command::new(ffmpeg);
    cmd.args(["-hide_banner", "-i"])
        .arg(video)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    no_window(&mut cmd);
    let out = cmd
        .output()
        .with_context(|| format!("Không chạy được ffmpeg: {}", ffmpeg.display()))?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    let info = parse_probe(&stderr)
        .with_context(|| format!("Không đọc được thông tin video: {}", video.display()))?;
    Ok(VideoMeta {
        width: info.width,
        height: info.height,
        duration: info.duration,
        has_audio: stderr.contains("Audio:"),
    })
}

/// Tệp metadata tạm — tự xoá khi rơi khỏi scope (kể cả đường lỗi).
struct TempMeta {
    dir: PathBuf,
    path: PathBuf,
    name: String,
}

impl TempMeta {
    fn new() -> Self {
        let dir = std::env::temp_dir();
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let name = format!("sublix-lab-probe-{}-{stamp}.txt", std::process::id());
        let path = dir.join(&name);
        Self { dir, path, name }
    }
}

impl Drop for TempMeta {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn even(value: u32) -> u32 {
    value & !1
}

/// 3 dòng log cuối — đủ để biết ffmpeg hỏng vì đâu.
fn tail(log: &str) -> String {
    let lines: Vec<&str> = log.lines().rev().take(3).collect();
    lines.into_iter().rev().collect::<Vec<_>>().join(" | ")
}

fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    #[cfg(not(windows))]
    let _ = cmd;
}

#[cfg(test)]
#[path = "probe_tests.rs"]
mod probe_tests;
