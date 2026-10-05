//! Sublix Multi-Platform Video Downloader Module
//! Reuses proven extractor flags, platform regex, format selectors, and progress parsing
//! from hermes-downloader.
//! Ported from hermes-downloader (MIT, © Hermes Agent).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tracing::{info, warn};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// R2-08.1: Windows Job Object types + functions for KILL_ON_JOB_CLOSE so any
// spawned yt-dlp / ffmpeg subprocess is guaranteed to die when our process
// (or its last Job handle) goes away. Non-Windows builds get a stub.
#[cfg(windows)]
use windows::Win32::Foundation::CloseHandle;
#[cfg(windows)]
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
#[cfg(windows)]
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub uploader: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub platform: String,
    pub url: String,
    pub description: Option<String>,
    /// Approximate total size in bytes (from yt-dlp `filesize_approx` /
    /// `filesize`). `None` when yt-dlp cannot estimate (live streams etc.).
    /// Used by the UI to warn about disk space (BUG-051).
    pub filesize_approx: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub id: String,
    pub url: String,
    pub format: String, // "1080p" | "720p" | "480p" | "360p" | "audio-mp3" | "audio-m4a" | "max"
    pub browser_cookies: Option<String>, // "edge" | "chrome" | "firefox" | "none"
    /// Optional path to a Netscape-format `cookies.txt`. Used as a fallback
    /// when `--cookies-from-browser` fails (BUG-057).
    #[serde(default)]
    pub cookies_file: Option<String>,
    pub extract_subtitles: bool,
    pub subtitle_langs: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgressPayload {
    pub id: String,
    pub status: String, // "downloading" | "paused" | "completed" | "error" | "cancelled"
    pub percent: f32,
    pub speed: String,
    pub eta: String,
    pub size_text: String,
    pub filename: String,
    pub file_path: Option<String>,
    pub error: Option<String>,
    #[serde(default)]
    pub run_id: Option<u64>,
}

#[allow(dead_code)]
struct ActiveJob {
    pub pid: u32,
    pub run_id: u64,
    pub req: DownloadRequest,
    pub save_dir: PathBuf,
    pub last_file_path: Option<PathBuf>,
    /// Actual destination file path captured from yt-dlp's "Destination:" line.
    /// `cancel_download` only ever touches this single path (plus its `.part`
    /// and `.ytdl` siblings) — never scans the whole save_dir. (BUG-047)
    pub dest_path: Option<PathBuf>,
    /// R2-08.1: raw Win32 HANDLE to the Job Object that owns this child
    /// process. Stored as `isize` so the struct stays platform-neutral
    /// (non-Windows builds always carry `None`). `KILL_ON_JOB_CLOSE` is set on
    /// the job, so closing this handle on app exit drags the whole tree down.
    #[cfg(windows)]
    pub job_handle: Option<isize>,
    #[cfg(not(windows))]
    pub job_handle: Option<isize>,
}

static ACTIVE_JOBS: LazyLock<Mutex<HashMap<String, ActiveJob>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// R3-02: Monotonic run-generation counter for atomic job ownership and stale worker suppression.
static NEXT_RUN_ID: AtomicU64 = AtomicU64::new(1);

/// R3-01: RAII guard to ensure uncommitted placeholder slots (pid: 0) are stripped
/// from ACTIVE_JOBS if spawning or setup fails prematurely.
struct PlaceholderGuard {
    id: String,
    run_id: u64,
    committed: bool,
}

impl Drop for PlaceholderGuard {
    fn drop(&mut self) {
        if !self.committed {
            if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
                if let Some(job) = jobs.get(&self.id) {
                    if job.run_id == self.run_id {
                        warn!("⚠️ Cleaning up uncommitted downloader placeholder for job {}", self.id);
                        jobs.remove(&self.id);
                    }
                }
            }
        }
    }
}

/// R3-03: Helper to detect if a failure on stderr is caused by authentication / cookie issues.
fn is_cookie_or_login_error(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    lower.contains("sign in to confirm")
        || lower.contains("cookies")
        || lower.contains("login")
        || lower.contains("403")
        || lower.contains("forbidden")
        || lower.contains("private video")
        || lower.contains("authenticate")
        || lower.contains("permission denied")
        || lower.contains("account")
        || lower.contains("blocked")
        || lower.contains("bot")
        || lower.contains("could not send cookie")
}

/// Validate URL is a safe http(s) URL. yt-dlp accepts anything starting with `-`
/// as a flag, so passing user input directly is a shell-injection vector.
/// Reject anything that isn't a syntactically valid http(s) URL.
/// (BUG-044 fix)
fn is_valid_http_url(url: &str) -> bool {
    let trimmed = url.trim();
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return false;
    }
    // Reject `--`, `-x`, etc. sneaking in past the scheme check.
    // (scheme check above already guarantees it starts with http(s)://)
    // Also reject embedded NUL bytes (defense in depth).
    if trimmed.contains('\0') {
        return false;
    }
    // Require at least one dot in the host (basic sanity check)
    let after_scheme = trimmed
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or("");
    let host = after_scheme.split('/').next().unwrap_or("");
    if !host.contains('.') {
        return false;
    }
    true
}

/// Detect yt-dlp executable. Search order (R2-06 — corrected from BUG-054):
///   1. `$PATH` (via `where yt-dlp` on Windows / `which yt-dlp` elsewhere)
///   2. Same directory as the running `sublix.exe` (portable bundle)
///   3. User-configured absolute path (`user_path`) — LAST so the user can
///      override when neither PATH nor the bundled copy is right (e.g. dev
///      build pointing at a fork), but the user's machine default wins on a
///      vanilla install.
///
/// Hardcoded machine paths like `C:\Program Files\AI Automation\...`
/// are forbidden — they break every other machine and conflict with
/// `BUG-001`/`BUG-017`.
pub fn find_ytdlp(user_path: Option<&str>) -> Result<PathBuf> {
    // 1. System PATH via `where` (Windows) or `which` fallback
    #[cfg(windows)]
    {
        if let Ok(output) = Command::new("where")
            .arg("yt-dlp")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(first_line) = stdout.lines().next() {
                    let p = PathBuf::from(first_line.trim());
                    if p.exists() {
                        return Ok(p);
                    }
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(output) = Command::new("which").arg("yt-dlp").output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(first_line) = stdout.lines().next() {
                    let p = PathBuf::from(first_line.trim());
                    if p.exists() {
                        return Ok(p);
                    }
                }
            }
        }
    }

    // 2. Same dir as `sublix.exe` (portable bundle case)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in &["yt-dlp.exe", "yt-dlp"] {
                let p = dir.join(name);
                if p.exists() {
                    return Ok(p);
                }
            }
        }
    }

    // 3. User-configured path (LAST — escape hatch for forks / dev builds)
    if let Some(p) = user_path.map(str::trim).filter(|s| !s.is_empty()) {
        let path = PathBuf::from(p);
        if path.exists() {
            return Ok(path);
        } else {
            return Err(anyhow::anyhow!(
                "Đường dẫn yt-dlp cấu hình thủ công không tồn tại: {}",
                path.display()
            ));
        }
    }

    // 4. Last-resort fallback — spawn by name, rely on PATH at exec time.
    Ok(PathBuf::from(if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" }))
}

/// Platform detector matching regex patterns from hermes-downloader.
/// BUG-058: match against the *host* of the parsed URL, not raw substring
/// search — otherwise `u.contains("x.com")` happily matches
/// `https://www.fox.com/some-clip`.
pub fn get_platform(url: &str) -> &'static str {
    let u = url.trim().to_lowercase();
    let host = url::Url::parse(&u)
        .ok()
        .and_then(|parsed| parsed.host_str().map(|h| h.to_lowercase()))
        .unwrap_or_default();

    // Exact host match (no substring search — `facebook.com` won't false-match
    // `evil-facebook.com.scam.io`).
    let host_matches = |domain: &str| host == domain || host.ends_with(&format!(".{domain}"));

    if host_matches("youtube.com") || host_matches("youtu.be") {
        return "youtube";
    }
    if host_matches("tiktok.com") {
        return "tiktok";
    }
    if host_matches("douyin.com") {
        return "douyin";
    }
    if host_matches("bilibili.com") {
        return "bilibili";
    }
    if host_matches("facebook.com") || host_matches("fb.watch") || host_matches("fb.com") {
        return "facebook";
    }
    if host_matches("twitter.com") || host_matches("x.com") {
        return "twitter";
    }
    if host_matches("instagram.com") {
        return "instagram";
    }
    if host_matches("vimeo.com") {
        return "vimeo";
    }
    if host_matches("soundcloud.com") {
        return "soundcloud";
    }
    if host_matches("reddit.com") {
        return "reddit";
    }
    if host_matches("twitch.tv") {
        return "twitch";
    }
    "generic_video"
}

/// Build format selector arguments based on hermes-downloader
pub fn build_format_args(format: &str) -> Vec<String> {
    match format {
        "audio-mp3" => vec![
            "-x".to_string(),
            "--audio-format".to_string(),
            "mp3".to_string(),
            "--audio-quality".to_string(),
            "0".to_string(),
        ],
        "audio-m4a" => vec![
            "-x".to_string(),
            "--audio-format".to_string(),
            "m4a".to_string(),
            "--audio-quality".to_string(),
            "0".to_string(),
        ],
        "360p" => vec!["-f".to_string(), "best[height<=360]/best".to_string()],
        "480p" => vec!["-f".to_string(), "best[height<=480]/best".to_string()],
        "720p" => vec!["-f".to_string(), "best[height<=720]/best".to_string()],
        "1080p" => vec!["-f".to_string(), "best[height<=1080]/best".to_string()],
        "1440p" | "2k" => vec![
            "-f".to_string(),
            // BUG-058: separate video + audio streams so a 1440p result
            // is genuinely 1440p; YouTube's pre-muxed stream tops out at
            // 1080p on most videos.
            "bestvideo[height<=1440]+bestaudio/bestvideo[height<=1080]+bestaudio/best".to_string(),
        ],
        "4k" | "2160p" => vec![
            "-f".to_string(),
            // BUG-058: same fix as 1440p — only way to get a real 4K file
            // out of yt-dlp is to grab video+audio separately and let
            // `--merge-output-format mp4` mux them.
            "bestvideo[height>=2160]+bestaudio/bestvideo[height>=1440]+bestaudio/best".to_string(),
        ],
        _ => vec![
            "-S".to_string(),
            "res:1080,ext:mp4:m4a,size:br".to_string(),
        ],
    }
}

/// Get the designated internal downloads cache directory
pub fn get_downloads_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("downloads");
    let _ = fs::create_dir_all(&dir);
    dir
}

/// Fast metadata inspection (--dump-json) without downloading video.
/// BUG-057: hard 60s watchdog — if yt-dlp hangs on a private/region-locked
/// URL the inspector used to lock the UI forever.
pub fn fetch_video_info(app: &AppHandle, url: &str) -> Result<VideoInfo> {
    // BUG-044: Validate URL to prevent shell injection — yt-dlp treats
    // any `--foo` or `-x` token as a flag. Reject anything not http(s)://.
    if !is_valid_http_url(url) {
        return Err(anyhow::anyhow!(
            "Link không hợp lệ: chỉ chấp nhận URL http(s)://"
        ));
    }
    let cfg = crate::config::AppConfig::load(app);
    let ytdlp_bin = find_ytdlp(Some(&cfg.ytdlp_path))?;
    let platform = get_platform(url);
    let url_owned = url.to_string();

    let (tx, rx) = std::sync::mpsc::channel::<Result<std::process::Output>>();
    // R2-08.3: shared PID slot. The worker writes the child's PID as soon as
    // it spawns; the main thread reads it on `recv_timeout` failure so we can
    // actually kill the orphan. If the worker hadn't even spawned yet, the
    // slot is empty and we accept the (extremely small) leak — documented.
    let pid_slot: std::sync::Arc<std::sync::Mutex<Option<u32>>> =
        std::sync::Arc::new(std::sync::Mutex::new(None));
    let pid_slot_w = pid_slot.clone();
    std::thread::spawn(move || {
        let mut cmd = Command::new(&ytdlp_bin);
        cmd.arg("--dump-json")
            .arg("--no-playlist")
            .arg("--no-warnings");

        if platform == "youtube" {
            cmd.arg("--extractor-args")
                .arg("youtube:player_client=web_safari,android_vr,ios");
        }

        cmd.arg("--").arg(&url_owned);

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        info!("🔍 Inspecting video metadata via yt-dlp: {}", url_owned);

        // R2-08.3: spawn explicitly so we can stash the PID before waiting on
        // output. Without this the only way to get a `process::Output` was
        // `cmd.output()`, which has no way to surface it back to the caller
        // for orphan-killing on timeout.
        let child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = tx.send(Err(
                    anyhow::Error::from(e).context("Không thể spawn yt-dlp")
                ));
                return;
            }
        };
        // R2-08.3: stash PID for the main thread's orphan-kill on timeout.
        // `Child::id()` returns `u32` on Windows and `Option<u32>` on Unix;
        // branch on platform to keep the project cross-platform-compilable.
        #[cfg(windows)]
        let pid: u32 = child.id();
        #[cfg(not(windows))]
        let pid: u32 = child.id().unwrap_or(0);
        if pid != 0 {
            *pid_slot_w.lock().expect("pid_slot lock") = Some(pid);
        }
        // If the main thread times out and kills the PID, this returns an
        // error which we simply discard via the channel — the caller is going to
        // bail out anyway with its own timeout error.
        let output_res = child
            .wait_with_output()
            .context("Thực thi yt-dlp metadata thất bại");
        let _ = tx.send(output_res);
    });

    let output = match rx.recv_timeout(std::time::Duration::from_secs(60)) {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => return Err(e),
        Err(_) => {
            // R2-08.3: 60s watchdog fired. The worker thread is still alive
            // (or stuck on wait_with_output). If we have the PID, kill the
            // orphan; otherwise the spawn call hadn't returned yet and we
            // accept the (transient, sub-millisecond) leak.
            if let Some(pid) = pid_slot.lock().expect("pid_slot lock").take() {
                warn!(
                    "fetch_video_info: 60s timeout → killing orphan yt-dlp pid={}",
                    pid
                );
                kill_pid(pid);
            }
            return Err(anyhow::anyhow!(
                "Không lấy được thông tin video trong 60 giây (link chết, video riêng tư, hoặc bị chặn khu vực)"
            ));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("Không thể lấy thông tin video: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&stdout).context("Không thể phân tích dữ liệu JSON từ yt-dlp")?;

    let title = json["title"]
        .as_str()
        .unwrap_or("Video không tên")
        .to_string();
    let uploader = json["uploader"]
        .as_str()
        .or_else(|| json["channel"].as_str())
        .map(|s| s.to_string());
    let duration = json["duration"].as_f64();
    let thumbnail = json["thumbnail"].as_str().map(|s| s.to_string());
    let id = json["id"].as_str().unwrap_or("").to_string();
    let description = json["description"].as_str().map(|s| s.to_string());
    let filesize_approx = json["filesize_approx"]
        .as_u64()
        .or_else(|| json["filesize"].as_u64());

    Ok(VideoInfo {
        id,
        title,
        uploader,
        duration,
        thumbnail,
        platform: platform.to_string(),
        url: url.to_string(),
        description,
        filesize_approx,
    })
}

/// Helper to construct the yt-dlp Command with proper argument ordering (R2-01).
/// All options precede `--`, and `--` is followed solely by the target URL.
fn build_download_command(
    ytdlp_bin: &Path,
    save_dir: &Path,
    req: &DownloadRequest,
    use_browser_cookie: Option<&str>,
    use_cookies_file: Option<&str>,
) -> Command {
    let mut cmd = Command::new(ytdlp_bin);
    let out_template = save_dir.join("%(title)s [%(id)s].%(ext)s");
    let platform = get_platform(&req.url);

    cmd.arg("-o")
        .arg(&out_template)
        .arg("--newline")
        .arg("--no-ansi")
        .arg("--no-warnings")
        .arg("--no-playlist")
        .arg("--progress-template")
        .arg("download:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s")
        .arg("--continue");

    if platform == "youtube" {
        cmd.arg("--extractor-args")
            .arg("youtube:player_client=web_safari,android_vr,ios");
    }

    if let Some(b) = use_browser_cookie {
        cmd.arg("--cookies-from-browser").arg(b);
    } else if let Some(cf) = use_cookies_file {
        cmd.arg("--cookies").arg(cf);
    }

    if req.extract_subtitles {
        cmd.arg("--write-subs")
            .arg("--write-auto-subs")
            .arg("--convert-subs")
            .arg("srt");
        if let Some(ref langs) = req.subtitle_langs {
            if !langs.is_empty() {
                cmd.arg("--sub-langs").arg(langs.join(","));
            } else {
                cmd.arg("--sub-langs").arg("vi,en,ja,zh");
            }
        } else {
            cmd.arg("--sub-langs").arg("vi,en,ja,zh");
        }
    }

    let is_audio = req.format.starts_with("audio");
    if !is_audio {
        cmd.arg("--merge-output-format").arg("mp4");
    }
    for arg in build_format_args(&req.format) {
        cmd.arg(arg);
    }

    cmd.arg("--").arg(&req.url);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd
}

struct DrainResult {
    is_success: bool,
    detected_filepath: Option<PathBuf>,
    detected_filename: String,
    stderr_text: String,
    current_size: String,
    last_percent: f32,
}

/// Drains stdout/stderr of a child process, updates progress, and tracks destination paths.
fn drain_child_process(
    mut child: std::process::Child,
    app_clone: &AppHandle,
    job_id: &str,
    my_run_id: u64,
    size_prefix: Option<&str>,
) -> DrainResult {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stderr_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let stderr_buf_for_reader = Arc::clone(&stderr_buf);
    let stderr_handle = std::thread::spawn(move || {
        if let Some(pipe) = stderr {
            let mut text = String::new();
            let _ = BufReader::new(pipe).read_to_string(&mut text);
            if let Ok(mut buf) = stderr_buf_for_reader.lock() {
                *buf = text;
            } else if let Err(poisoned) = stderr_buf_for_reader.lock() {
                *poisoned.into_inner() = text;
            }
        }
    });

    let mut last_percent: f32 = -1.0;
    let mut last_emitted_percent: f32 = -1.0;
    let mut current_speed = String::new();
    let mut current_eta = String::new();
    let mut current_size = String::new();
    let mut detected_filename = String::new();
    let mut detected_filepath: Option<PathBuf> = None;
    let mut last_emit = std::time::Instant::now();

    if let Some(stdout_pipe) = stdout {
        let reader = BufReader::new(stdout_pipe);
        for line_res in reader.lines() {
            if let Ok(line) = line_res {
                // R3-02: Check if slot still belongs to our specific run_id
                let still_current = ACTIVE_JOBS
                    .lock()
                    .map(|jobs| {
                        jobs.get(job_id)
                            .map(|j| j.run_id == my_run_id)
                            .unwrap_or(false)
                    })
                    .unwrap_or(false);
                if !still_current {
                    break;
                }

                let pct: Option<f32> = if let Some(rest) = line.strip_prefix("download:") {
                    let parts: Vec<&str> = rest.split('|').collect();
                    if parts.len() >= 2 {
                        let downloaded: u64 = parts[0].parse().unwrap_or(0);
                        let known_total: u64 = parts[1].parse().unwrap_or(0);
                        let estimate_total: u64 = parts.get(2)
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(0);
                        current_speed = parts.get(3).unwrap_or(&"").to_string();
                        current_eta = parts.get(4).unwrap_or(&"").to_string();

                        let total = if known_total > 0 {
                            known_total
                        } else if estimate_total > 0 {
                            estimate_total
                        } else {
                            0
                        };
                        if total > 0 {
                            let p = (downloaded as f64 / total as f64) * 100.0;
                            current_size = format!("{:.1} MiB", total as f64 / 1_048_576.0);
                            Some(p as f32)
                        } else {
                            Some(last_percent.max(0.0))
                        }
                    } else {
                        None
                    }
                } else {
                    None
                };

                // Parse Destination / Merger (R2-03)
                if let Some(pos) = line.find("[Merger] Merging formats into \"") {
                    let after = &line[pos + 31..];
                    if let Some(end_quote) = after.find('"') {
                        let path_str = &after[..end_quote];
                        let p = PathBuf::from(path_str);
                        detected_filename = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                        detected_filepath = Some(p.clone());
                        if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
                            if let Some(job) = jobs.get_mut(job_id) {
                                if job.run_id == my_run_id {
                                    job.dest_path = Some(p.clone());
                                    job.last_file_path = Some(p);
                                }
                            }
                        }
                    }
                } else if let Some(pos) = line.find("Destination: ") {
                    let path_str = line[pos + 13..].trim();
                    let p = PathBuf::from(path_str);
                    detected_filename = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                    detected_filepath = Some(p.clone());
                    if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
                        if let Some(job) = jobs.get_mut(job_id) {
                            if job.run_id == my_run_id {
                                job.dest_path = Some(p.clone());
                                job.last_file_path = Some(p);
                            }
                        }
                    }
                } else if let Some(pos) = line.find("has already been downloaded") {
                    let before = line[..pos].trim_start_matches("[download]").trim();
                    let p = PathBuf::from(before);
                    detected_filename = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                    detected_filepath = Some(p.clone());
                    if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
                        if let Some(job) = jobs.get_mut(job_id) {
                            if job.run_id == my_run_id {
                                job.dest_path = Some(p.clone());
                                job.last_file_path = Some(p);
                            }
                        }
                    }
                }

                if let Some(p) = pct {
                    last_percent = p;
                }

                let percent_delta = (last_percent - last_emitted_percent).abs();
                let pct_changed = pct.is_some() && percent_delta >= 0.5;
                let time_elapsed = last_emit.elapsed();
                if pct_changed || time_elapsed.as_millis() >= 250 {
                    let formatted_size = match size_prefix {
                        Some(prefix) if !current_size.is_empty() => format!("{} • {}", prefix, current_size),
                        Some(prefix) => prefix.to_string(),
                        None => current_size.clone(),
                    };
                    let _ = app_clone.emit(
                        "downloader:progress",
                        DownloadProgressPayload {
                            id: job_id.to_string(),
                            status: "downloading".to_string(),
                            percent: last_percent.max(0.0),
                            speed: current_speed.clone(),
                            eta: current_eta.clone(),
                            size_text: formatted_size,
                            filename: detected_filename.clone(),
                            file_path: detected_filepath.as_ref().map(|p| p.to_string_lossy().to_string()),
                            error: None,
                            run_id: Some(my_run_id),
                        },
                    );
                    last_emitted_percent = last_percent;
                    last_emit = std::time::Instant::now();
                }
            }
        }
    }

    let status_res = child.wait();
    let _ = stderr_handle.join();

    let stderr_text_raw = match stderr_buf.lock() {
        Ok(s) => s.clone(),
        Err(poisoned) => poisoned.into_inner().clone(),
    };
    let mut stderr_text = stderr_text_raw.trim().to_string();
    if stderr_text.len() > 2048 {
        stderr_text.truncate(2048);
        stderr_text.push_str("\n…(đã cắt bớt)");
    }

    let is_success = status_res.map(|s| s.success()).unwrap_or(false);

    DrainResult {
        is_success,
        detected_filepath,
        detected_filename,
        stderr_text,
        current_size,
        last_percent,
    }
}

/// Execute video download with real-time stdout streaming and pause/cancel support
pub fn start_download(app: AppHandle, req: DownloadRequest) -> Result<()> {
    // BUG-044: Validate URL (prevent shell injection via `--` / `-x`).
    if !is_valid_http_url(&req.url) {
        return Err(anyhow::anyhow!(
            "Link không hợp lệ: chỉ chấp nhận URL http(s)://"
        ));
    }

    let cfg = crate::config::AppConfig::load(&app);
    let ytdlp_bin = find_ytdlp(Some(&cfg.ytdlp_path))?;
    let save_dir = get_downloads_dir(&app);

    // R3-02: Allocate monotonic run ID
    let my_run_id = NEXT_RUN_ID.fetch_add(1, Ordering::SeqCst);

    // R2-05 + R3-01: reserve the slot in ACTIVE_JOBS BEFORE spawning.
    // Use PlaceholderGuard (RAII) to remove the placeholder if spawn fails.
    {
        let mut jobs = ACTIVE_JOBS
            .lock()
            .map_err(|e| anyhow::anyhow!("ACTIVE_JOBS lock poisoned: {}", e))?;
        if jobs.contains_key(&req.id) {
            return Err(anyhow::anyhow!(
                "Việc tải này đang chạy (id: {})",
                req.id
            ));
        }
        jobs.insert(
            req.id.clone(),
            ActiveJob {
                pid: 0, // placeholder; real pid filled in after spawn
                run_id: my_run_id,
                req: req.clone(),
                save_dir: save_dir.clone(),
                last_file_path: None,
                dest_path: None,
                #[cfg(windows)]
                job_handle: None,
                #[cfg(not(windows))]
                job_handle: None,
            },
        );
    }

    let mut placeholder_guard = PlaceholderGuard {
        id: req.id.clone(),
        run_id: my_run_id,
        committed: false,
    };

    // Determine cookie options (R2-08.5 & R3-03)
    let browser_cookie_enabled: Option<String> = req
        .browser_cookies
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && s.to_lowercase() != "none")
        .map(|s| s.to_lowercase())
        .and_then(|b| {
            if matches!(b.as_str(), "edge" | "chrome" | "firefox") {
                Some(b)
            } else {
                warn!("Bỏ qua browser_cookies={} (không nằm trong whitelist)", b);
                None
            }
        });

    let valid_cookies_file: Option<String> = req
        .cookies_file
        .as_deref()
        .map(str::trim)
        .filter(|cf| !cf.is_empty() && Path::new(cf).exists())
        .map(|cf| cf.to_string());

    // Primary strategy:
    // If browser cookie configured, use it first.
    // If no browser cookie configured but cookies file exists, use cookies file.
    let (primary_browser, primary_file) = if let Some(ref b) = browser_cookie_enabled {
        (Some(b.as_str()), None)
    } else if let Some(ref cf) = valid_cookies_file {
        (None, Some(cf.as_str()))
    } else {
        (None, None)
    };

    // Backup cookie file available if we used browser cookie first AND cookies file exists:
    let backup_cookies_file: Option<String> = if browser_cookie_enabled.is_some() {
        valid_cookies_file.clone()
    } else {
        None
    };

    let mut cmd = build_download_command(
        &ytdlp_bin,
        &save_dir,
        &req,
        primary_browser,
        primary_file,
    );

    let child = cmd.spawn().context("Không thể khởi động yt-dlp")?;
    let pid = child.id();

    #[cfg(windows)]
    let job_handle_raw: Option<isize> = unsafe { create_kill_on_close_job(pid) };
    #[cfg(not(windows))]
    let job_handle_raw: Option<isize> = None;

    let download_id = req.id.clone();

    if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
        if let Some(job) = jobs.get_mut(&download_id) {
            if job.run_id == my_run_id {
                job.pid = pid;
                #[cfg(windows)]
                {
                    job.job_handle = job_handle_raw;
                }
                #[cfg(not(windows))]
                {
                    job.job_handle = job_handle_raw;
                }
            }
        }
    }

    // Now that PID and job handle are safely recorded, commit placeholder guard
    placeholder_guard.committed = true;

    // Spawn background worker thread
    let app_clone = app.clone();
    let job_id = download_id.clone();
    let req_clone = req.clone();
    let ytdlp_bin_clone = ytdlp_bin.clone();
    let save_dir_clone = save_dir.clone();

    std::thread::spawn(move || {
        let drain_res = drain_child_process(child, &app_clone, &job_id, my_run_id, None);

        // Check if retry with backup cookies is needed (R3-03)
        let is_auth_fail = !drain_res.is_success && is_cookie_or_login_error(&drain_res.stderr_text);

        let final_res = if is_auth_fail && backup_cookies_file.is_some() {
            let backup_file = backup_cookies_file.as_ref().unwrap();
            info!(
                "⚠️ Downloader job {} failed with browser cookies ({}), retrying with backup cookies file: {}",
                job_id, drain_res.stderr_text, backup_file
            );

            // Check if still current run before retrying
            let still_current = ACTIVE_JOBS
                .lock()
                .map(|jobs| jobs.get(&job_id).map(|j| j.run_id == my_run_id).unwrap_or(false))
                .unwrap_or(false);

            if still_current {
                let _ = app_clone.emit(
                    "downloader:progress",
                    DownloadProgressPayload {
                        id: job_id.clone(),
                        status: "downloading".to_string(),
                        percent: drain_res.last_percent.max(0.0),
                        speed: "".to_string(),
                        eta: "".to_string(),
                        size_text: "Đang thử lại với cookie dự phòng...".to_string(),
                        filename: drain_res.detected_filename.clone(),
                        file_path: drain_res.detected_filepath.as_ref().map(|p| p.to_string_lossy().to_string()),
                        error: None,
                        run_id: Some(my_run_id),
                    },
                );

                let mut retry_cmd = build_download_command(
                    &ytdlp_bin_clone,
                    &save_dir_clone,
                    &req_clone,
                    None,
                    Some(backup_file.as_str()),
                );

                match retry_cmd.spawn() {
                    Ok(retry_child) => {
                        let retry_pid = retry_child.id();
                        #[cfg(windows)]
                        let retry_job_handle: Option<isize> = unsafe { create_kill_on_close_job(retry_pid) };
                        #[cfg(not(windows))]
                        let retry_job_handle: Option<isize> = None;

                        if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
                            if let Some(job) = jobs.get_mut(&job_id) {
                                if job.run_id == my_run_id {
                                    job.pid = retry_pid;
                                    #[cfg(windows)]
                                    {
                                        job.job_handle = retry_job_handle;
                                    }
                                    #[cfg(not(windows))]
                                    {
                                        job.job_handle = retry_job_handle;
                                    }
                                }
                            }
                        }

                        drain_child_process(
                            retry_child,
                            &app_clone,
                            &job_id,
                            my_run_id,
                            Some("Đã dùng cookie dự phòng"),
                        )
                    }
                    Err(e) => {
                        warn!("❌ Failed to spawn retry with backup cookie for {}: {}", job_id, e);
                        drain_res
                    }
                }
            } else {
                drain_res
            }
        } else {
            drain_res
        };

        // R3-02: Check if this job still belongs to our run_id (not canceled or overwritten)
        let is_current_run = ACTIVE_JOBS
            .lock()
            .map(|jobs| jobs.get(&job_id).map(|j| j.run_id == my_run_id).unwrap_or(false))
            .unwrap_or(false);

        if !is_current_run {
            info!("ℹ️ Job {} worker finished but run_id {} is no longer active", job_id, my_run_id);
            return;
        }

        let has_own_output = final_res
            .detected_filepath
            .as_ref()
            .map(|p| p.exists())
            .unwrap_or(false);

        if final_res.is_success && has_own_output {
            info!("✅ Downloader job {} finished successfully", job_id);
            let _ = app_clone.emit(
                "downloader:progress",
                DownloadProgressPayload {
                    id: job_id.clone(),
                    status: "completed".to_string(),
                    percent: 100.0,
                    speed: "0 B/s".to_string(),
                    eta: "00:00".to_string(),
                    size_text: final_res.current_size,
                    filename: final_res.detected_filename,
                    file_path: final_res.detected_filepath.as_ref().map(|p| p.to_string_lossy().to_string()),
                    error: None,
                    run_id: Some(my_run_id),
                },
            );
        } else {
            let err_msg = if !final_res.stderr_text.trim().is_empty() {
                final_res.stderr_text.trim().to_string()
            } else if final_res.is_success && !has_own_output {
                "yt-dlp đã thoát thành công nhưng không in ra đường dẫn file (có thể link chết hoặc bị chặn khu vực)".to_string()
            } else {
                "Tải video thất bại (kiểm tra kết nối mạng hoặc bản quyền)".to_string()
            };
            warn!("❌ Downloader job {} failed: {}", job_id, err_msg);
            let _ = app_clone.emit(
                "downloader:progress",
                DownloadProgressPayload {
                    id: job_id.clone(),
                    status: "error".to_string(),
                    percent: final_res.last_percent,
                    speed: "0 B/s".to_string(),
                    eta: "--:--".to_string(),
                    size_text: final_res.current_size,
                    filename: final_res.detected_filename,
                    file_path: None,
                    error: Some(err_msg),
                    run_id: Some(my_run_id),
                },
            );
        }

        // R3-02: Only remove if still our run_id
        if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
            if let Some(job) = jobs.get(&job_id) {
                if job.run_id == my_run_id {
                    jobs.remove(&job_id);
                }
            }
        }
    });

    Ok(())
}

/// Instant cancel of download: kills PID tree and purges ONLY the residual
/// `.part` / `.ytdl` files that belong to this job — never scans the whole
/// save directory. (BUG-047)
///
/// R2-08.2: pop the job out of the map FIRST and drop the mutex before
/// doing anything that could block (kill, file IO). Old code held the
/// lock across `kill_pid` (taskkill /T) and `fs::remove_file` which
/// deadlocked against the worker thread's own `ACTIVE_JOBS.lock()` in its
/// stdout reader loop.
///
/// R2-08.4: unknown id returns an explicit `Err` instead of silently
/// emitting a fake "cancelled" event for a job that never existed.
pub fn cancel_download(app: &AppHandle, id: &str) -> Result<()> {
    // 1. Remove from map and drop the lock immediately.
    let job = ACTIVE_JOBS
        .lock()
        .ok()
        .and_then(|mut jobs| jobs.remove(id));
    let job = match job {
        Some(j) => j,
        None => {
            return Err(anyhow::anyhow!("Không tìm thấy việc này (id: {})", id));
        }
    };

    // 2. Mutex is released here. Kill + IO happen without blocking the
    //    worker thread's progress reader.
    kill_pid(job.pid);
    #[cfg(windows)]
    if let Some(h_raw) = job.job_handle {
        let h = windows::Win32::Foundation::HANDLE(h_raw as _);
        unsafe {
            let _ = CloseHandle(h);
        }
    }

    // BUG-047: only delete the residual partial files for *this* job.
    let candidates: Vec<PathBuf> = if let Some(dest) = job.dest_path.as_ref() {
        vec![
            dest.clone(),
            with_extension(dest, "part"),
            with_extension(dest, "ytdl"),
        ]
    } else {
        vec![]
    };
    for p in &candidates {
        let _ = fs::remove_file(p);
    }

    let _ = app.emit(
        "downloader:progress",
        DownloadProgressPayload {
            id: id.to_string(),
            status: "cancelled".to_string(),
            percent: 0.0,
            speed: "0 B/s".to_string(),
            eta: "--:--".to_string(),
            size_text: "".to_string(),
            filename: "".to_string(),
            file_path: None,
            error: None,
            run_id: Some(job.run_id),
        },
    );
    Ok(())
}

/// Append a partial-download extension to a path.
/// e.g. `clip.mp4` + `"part"` -> `clip.mp4.part`,
///      `clip.mp4` + `"ytdl"` -> `clip.mp4.ytdl`.
/// (R2-04: the previous version used `Path::set_extension`, which REPLACES
/// the extension. That meant `clip.mp4` + `"part"` collapsed to `clip.part`
/// and we never found the leftover partial download on cancel. yt-dlp keeps
/// the full original filename and appends the suffix.)
fn with_extension(path: &Path, ext: &str) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(".");
    s.push(ext);
    PathBuf::from(s)
}

/// Pause download: gracefully stops the process while keeping .part file intact for resume
///
/// R2-08.2: same fix as `cancel_download` — pop from map, drop lock, then
/// kill. R2-08.4: unknown id returns `Err` so the UI can show the failure.
pub fn pause_download(app: &AppHandle, id: &str) -> Result<()> {
    let job = ACTIVE_JOBS
        .lock()
        .ok()
        .and_then(|mut jobs| jobs.remove(id));
    let job = match job {
        Some(j) => j,
        None => {
            return Err(anyhow::anyhow!("Không tìm thấy việc này (id: {})", id));
        }
    };

    kill_pid(job.pid);
    #[cfg(windows)]
    if let Some(h_raw) = job.job_handle {
        let h = windows::Win32::Foundation::HANDLE(h_raw as _);
        unsafe {
            let _ = CloseHandle(h);
        }
    }

    let _ = app.emit(
        "downloader:progress",
        DownloadProgressPayload {
            id: id.to_string(),
            status: "paused".to_string(),
            percent: 0.0,
            speed: "0 B/s".to_string(),
            eta: "Tạm dừng".to_string(),
            size_text: "".to_string(),
            filename: "".to_string(),
            file_path: None,
            error: None,
            run_id: Some(job.run_id),
        },
    );
    Ok(())
}

/// Kill process tree via taskkill on Windows
fn kill_pid(pid: u32) {
    if pid > 0 {
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill")
                .args(["-9", &pid.to_string()])
                .status();
        }
    }
}

/// R2-08.1: create a Windows Job Object, set KILL_ON_JOB_CLOSE on it, and
/// assign the given PID to it. Returns the raw HANDLE as `isize` so callers
/// can stash it on `ActiveJob` and close it later. Returns `None` on any
/// failure (logged but non-fatal — `kill_pid` via taskkill still works as a
/// belt-and-braces backup).
#[cfg(windows)]
unsafe fn create_kill_on_close_job(pid: u32) -> Option<isize> {
    use windows::Win32::System::Threading::PROCESS_ACCESS_RIGHTS;

    // PROCESS_SET_QUOTA + PROCESS_TERMINATE — the rights Microsoft documents
    // as required for AssignProcessToJobObject().
    let desired = PROCESS_ACCESS_RIGHTS(PROCESS_SET_QUOTA.0 | PROCESS_TERMINATE.0);
    let proc_handle = match OpenProcess(desired, false, pid) {
        Ok(h) => h,
        Err(e) => {
            warn!(
                "JobObject: OpenProcess(pid={}) thất bại ({}); KILL_ON_JOB_CLOSE sẽ không hoạt động cho job này",
                pid, e
            );
            return None;
        }
    };

    let result = (|| -> Option<isize> {
        let job = CreateJobObjectW(None, None).ok()?;
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &mut info as *mut _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
        .ok()?;
        AssignProcessToJobObject(job, proc_handle).ok()?;
        Some(job.0 as isize)
    })();

    // We don't need the process handle any more — closing it does NOT remove
    // the process from the job (Windows semantics).
    let _ = CloseHandle(proc_handle);

    if result.is_none() {
        warn!("JobObject: tạo/gán job cho pid={} thất bại; kill-on-exit dùng taskkill fallback", pid);
    }
    result
}

/// R2-08.1: gọi từ `RunEvent::Exit` hook trong `lib.rs`. Đóng tất cả Job
/// Object handle đang mở — `KILL_ON_JOB_CLOSE` đảm bảo mọi tiến trình con
/// cháu (yt-dlp, ffmpeg, ffprobe) đều bị kill khi handle cuối cùng đóng.
#[cfg(windows)]
pub fn shutdown_all_jobs() {
    if let Ok(jobs) = ACTIVE_JOBS.lock() {
        for (_id, job) in jobs.iter() {
            if let Some(h_raw) = job.job_handle {
                let h = windows::Win32::Foundation::HANDLE(h_raw as _);
                unsafe {
                    let _ = CloseHandle(h);
                }
            }
        }
    }
}

#[cfg(not(windows))]
pub fn shutdown_all_jobs() {
    // No-op on non-Windows: child processes are tracked by pid only and
    // `kill_pid` already ran on cancel/pause.
}

/// Open downloads folder in Windows Explorer
pub fn open_downloads_folder(app: &AppHandle) -> Result<()> {
    let dir = get_downloads_dir(app);
    #[cfg(windows)]
    {
        let mut cmd = Command::new("explorer.exe");
        cmd.arg(&dir);
        cmd.spawn()?;
    }
    Ok(())
}

/// R2-09.7: lightweight existence check so the UI can disable the
/// "Tạo Phụ Đề / Lồng Tiếng" pipeline-bridge buttons when the file yt-dlp
/// reported has since been deleted (or was never really written).
/// Cheap on Windows — just a `GetFileAttributesExW` underneath.
pub fn check_file_exists(path_str: &str) -> bool {
    if path_str.trim().is_empty() {
        return false;
    }
    Path::new(path_str).exists()
}

/// Reveal downloaded file in Windows Explorer
pub fn reveal_downloaded_file(path_str: &str) -> Result<()> {
    let p = Path::new(path_str);
    if !p.exists() {
        return Err(anyhow::anyhow!("File không tồn tại: {path_str}"));
    }
    #[cfg(windows)]
    {
        let mut cmd = Command::new("explorer.exe");
        cmd.arg(format!("/select,\"{}\"", p.display()));
        cmd.spawn()?;
    }
    Ok(())
}

/// BUG-051: how many bytes are free on the volume that would hold `path`.
/// Returns `None` on non-Windows platforms.
#[cfg(windows)]
pub fn disk_free_bytes(path: &Path) -> Result<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut free_bytes: u64 = 0;
    let result = unsafe {
        GetDiskFreeSpaceExW(
            windows::core::PCWSTR(wide.as_ptr()),
            Some(&mut free_bytes),
            None,
            None,
        )
    };
    if result.is_err() {
        return Err(anyhow::anyhow!(
            "Không lấy được dung lượng trống ổ đĩa cho {}",
            path.display()
        ));
    }
    Ok(free_bytes)
}

#[cfg(not(windows))]
pub fn disk_free_bytes(_path: &Path) -> Result<u64> {
    Err(anyhow::anyhow!("disk_free_bytes chỉ hỗ trợ Windows"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_platform_detection() {
        assert_eq!(get_platform("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube");
        assert_eq!(get_platform("https://youtu.be/dQw4w9WgXcQ"), "youtube");
        assert_eq!(get_platform("https://www.tiktok.com/@creator/video/12345"), "tiktok");
        assert_eq!(get_platform("https://www.douyin.com/video/12345"), "douyin");
        assert_eq!(get_platform("https://www.bilibili.com/video/BV1xx411c7mD"), "bilibili");
        assert_eq!(get_platform("https://www.facebook.com/watch/?v=123"), "facebook");
        assert_eq!(get_platform("https://fb.watch/123"), "facebook");
        assert_eq!(get_platform("https://x.com/user/status/123"), "twitter");
        assert_eq!(get_platform("https://twitter.com/user/status/123"), "twitter");
        assert_eq!(get_platform("https://www.instagram.com/reel/123"), "instagram");
        assert_eq!(get_platform("https://vimeo.com/123"), "vimeo");
        assert_eq!(get_platform("https://soundcloud.com/artist/song"), "soundcloud");
        assert_eq!(get_platform("https://www.reddit.com/r/videos/comments/123"), "reddit");
        assert_eq!(get_platform("https://www.twitch.tv/streamer"), "twitch");

        // False positive prevention tests
        assert_eq!(get_platform("https://www.fox.com/news"), "generic_video");
        assert_eq!(get_platform("https://evil-facebook.com.scam.io/clip"), "generic_video");
        assert_eq!(get_platform("https://myyoutube.org.attacker.com/v"), "generic_video");
    }

    #[test]
    fn test_url_validation_and_security() {
        // Valid URLs
        assert!(is_valid_http_url("https://www.youtube.com/watch?v=123"));
        assert!(is_valid_http_url("http://example.com/video.mp4"));
        assert!(is_valid_http_url("https://sub.domain.co.uk/path?a=1&b=2"));

        // Shell-injection attack vectors & malformed inputs
        assert!(!is_valid_http_url("--dump-json"));
        assert!(!is_valid_http_url("-x"));
        assert!(!is_valid_http_url("javascript:alert(1)"));
        assert!(!is_valid_http_url("file:///C:/Windows/System32"));
        assert!(!is_valid_http_url("ftp://example.com/file"));
        assert!(!is_valid_http_url("https://localhost")); // no dot in host
        assert!(!is_valid_http_url("https://foo\0bar.com")); // null byte
        assert!(!is_valid_http_url(""));
        assert!(!is_valid_http_url("   "));
    }

    #[test]
    fn test_format_argument_builders() {
        let mp3_args = build_format_args("audio-mp3");
        assert!(mp3_args.contains(&"-x".to_string()));
        assert!(mp3_args.contains(&"mp3".to_string()));

        let m4a_args = build_format_args("audio-m4a");
        assert!(m4a_args.contains(&"-x".to_string()));
        assert!(m4a_args.contains(&"m4a".to_string()));

        let f1080 = build_format_args("1080p");
        assert_eq!(f1080, vec!["-f", "best[height<=1080]/best"]);

        let f4k = build_format_args("4k");
        assert_eq!(f4k, vec!["-f", "bestvideo[height>=2160]+bestaudio/bestvideo[height>=1440]+bestaudio/best"]);

        let max_args = build_format_args("max");
        assert_eq!(max_args, vec!["-S", "res:1080,ext:mp4:m4a,size:br"]);
    }

    #[test]
    fn test_file_extension_helpers() {
        let original = Path::new("C:\\Users\\TTC\\Downloads\\my_video.mp4");
        let part = with_extension(original, "part");
        assert_eq!(part, PathBuf::from("C:\\Users\\TTC\\Downloads\\my_video.mp4.part"));

        let ytdl = with_extension(original, "ytdl");
        assert_eq!(ytdl, PathBuf::from("C:\\Users\\TTC\\Downloads\\my_video.mp4.ytdl"));
    }

    #[test]
    fn test_find_ytdlp_binary() {
        let bin_res = find_ytdlp(None);
        assert!(bin_res.is_ok(), "yt-dlp should be discoverable on dev machine: {:?}", bin_res.err());
        let bin_path = bin_res.unwrap();
        assert!(bin_path.exists(), "Resolved yt-dlp path must exist on disk: {}", bin_path.display());
    }

    #[test]
    #[cfg(windows)]
    fn test_disk_space_checker() {
        let current_dir = std::env::current_dir().unwrap();
        let free = disk_free_bytes(&current_dir);
        assert!(free.is_ok(), "disk_free_bytes failed: {:?}", free.err());
        assert!(free.unwrap() > 1024 * 1024, "Free disk space should be > 1MB");
    }
}
