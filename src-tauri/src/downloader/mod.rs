//! Sublix Multi-Platform Video Downloader Module
//! Reuses proven extractor flags, platform regex, format selectors, and progress parsing
//! from hermes-downloader.
//! Ported from hermes-downloader (MIT, © Hermes Agent).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tracing::{info, warn};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
}

#[allow(dead_code)]
struct ActiveJob {
    pub pid: u32,
    pub req: DownloadRequest,
    pub save_dir: PathBuf,
    pub last_file_path: Option<PathBuf>,
    /// Actual destination file path captured from yt-dlp's "Destination:" line.
    /// `cancel_download` only ever touches this single path (plus its `.part`
    /// and `.ytdl` siblings) — never scans the whole save_dir. (BUG-047)
    pub dest_path: Option<PathBuf>,
}

static ACTIVE_JOBS: LazyLock<Mutex<HashMap<String, ActiveJob>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Run-generation counter to prevent zombie jobs when an id is reused
/// (BUG-048 fix). Each `start_download` increments this; events for stale
/// generations are ignored by the worker thread.
static RUN_GENERATION: LazyLock<Mutex<u64>> = LazyLock::new(|| Mutex::new(0));

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

/// Detect yt-dlp executable on the system
pub fn find_ytdlp() -> Result<PathBuf> {
    let candidates = [
        PathBuf::from(r"C:\Program Files\AI Automation\bin\yt-dlp.exe"),
        PathBuf::from(r"C:\Program Files\AI Automation\bin\yt-dlp"),
        PathBuf::from(r"C:\Program Files (x86)\AI Automation\bin\yt-dlp.exe"),
    ];

    for c in &candidates {
        if c.exists() {
            return Ok(c.clone());
        }
    }

    // Try finding via `where` on Windows
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

    // Default fallback
    Ok(PathBuf::from("yt-dlp.exe"))
}

/// Platform detector matching regex patterns from hermes-downloader
pub fn get_platform(url: &str) -> &'static str {
    let u = url.trim().to_lowercase();
    if u.contains("youtube.com") || u.contains("youtu.be") {
        return "youtube";
    }
    if u.contains("tiktok.com") {
        return "tiktok";
    }
    if u.contains("douyin.com") {
        return "douyin";
    }
    if u.contains("bilibili.com") {
        return "bilibili";
    }
    if u.contains("facebook.com") || u.contains("fb.watch") || u.contains("fb.com") {
        return "facebook";
    }
    if u.contains("twitter.com") || u.contains("x.com") {
        return "twitter";
    }
    if u.contains("instagram.com") {
        return "instagram";
    }
    if u.contains("vimeo.com") {
        return "vimeo";
    }
    if u.contains("soundcloud.com") {
        return "soundcloud";
    }
    if u.contains("reddit.com") {
        return "reddit";
    }
    if u.contains("twitch.tv") {
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
        "1440p" | "2k" => vec!["-f".to_string(), "best[height<=1440]/best".to_string()],
        "4k" | "2160p" => vec![
            "-f".to_string(),
            "best[height>=2160]/best[height>=1440]/best".to_string(),
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

/// Fast metadata inspection (--dump-json) without downloading video
pub fn fetch_video_info(url: &str) -> Result<VideoInfo> {
    // BUG-044: Validate URL to prevent shell injection — yt-dlp treats
    // any `--foo` or `-x` token as a flag. Reject anything not http(s)://.
    if !is_valid_http_url(url) {
        return Err(anyhow::anyhow!(
            "Link không hợp lệ: chỉ chấp nhận URL http(s)://"
        ));
    }
    let ytdlp_bin = find_ytdlp()?;
    let platform = get_platform(url);

    let mut cmd = Command::new(&ytdlp_bin);
    cmd.arg("--dump-json")
        .arg("--no-playlist")
        .arg("--no-warnings");

    if platform == "youtube" {
        cmd.arg("--extractor-args")
            .arg("youtube:player_client=web_safari,android_vr,ios");
    }

    // `--` is the standard POSIX-style argument terminator: anything after it
    // is passed through as a positional, never as a flag. (BUG-044)
    cmd.arg("--").arg(url);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    info!("🔍 Inspecting video metadata via yt-dlp: {}", url);
    let output = cmd.output().context("Thực thi yt-dlp metadata thất bại")?;

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

/// Execute video download with real-time stdout streaming and pause/cancel support
pub fn start_download(app: AppHandle, req: DownloadRequest) -> Result<()> {
    // BUG-044: Validate URL (prevent shell injection via `--` / `-x`).
    if !is_valid_http_url(&req.url) {
        return Err(anyhow::anyhow!(
            "Link không hợp lệ: chỉ chấp nhận URL http(s)://"
        ));
    }

    // BUG-048: Reject duplicate id OR auto-cancel old job (we choose reject to
    // surface bugs in caller UI; callers can cancel manually if needed).
    if let Ok(jobs) = ACTIVE_JOBS.lock() {
        if jobs.contains_key(&req.id) {
            return Err(anyhow::anyhow!(
                "Việc tải này đang chạy (id: {})",
                req.id
            ));
        }
    }

    let ytdlp_bin = find_ytdlp()?;
    let save_dir = get_downloads_dir(&app);
    let platform = get_platform(&req.url);

    let out_template = save_dir.join("%(title)s [%(id)s].%(ext)s");

    let mut cmd = Command::new(&ytdlp_bin);
    // `--` ensures the URL is treated as a positional even if it starts with `-`.
    cmd.arg("--")
        .arg(&req.url)
        .arg("-o")
        .arg(&out_template)
        .arg("--newline")
        .arg("--no-warnings")
        .arg("--no-playlist")    // BUG-055: do not silently pull a whole playlist
        .arg("--continue"); // Native resume from .part file

    if platform == "youtube" {
        cmd.arg("--extractor-args")
            .arg("youtube:player_client=web_safari,android_vr,ios");
    }

    // Cookie integration: Edge / Chrome / Firefox
    if let Some(ref browser) = req.browser_cookies {
        let b = browser.trim().to_lowercase();
        if !b.is_empty() && b != "none" {
            cmd.arg("--cookies-from-browser").arg(&b);
        }
    }

    // Subtitle extraction flags (Phase 1)
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

    // Audio format or Video format
    let is_audio = req.format.starts_with("audio");
    if !is_audio {
        cmd.arg("--merge-output-format").arg("mp4");
    }
    for arg in build_format_args(&req.format) {
        cmd.arg(arg);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().context("Không thể khởi động yt-dlp")?;
    let pid = child.id();
    let stdout = child.stdout.take().context("Không thể pipe stdout")?;
    let stderr = child.stderr.take().context("Không thể pipe stderr")?;

    let download_id = req.id.clone();

    // Register active job
    if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
        jobs.insert(
            download_id.clone(),
            ActiveJob {
                pid,
                req: req.clone(),
                save_dir: save_dir.clone(),
                last_file_path: None,
                dest_path: None,
            },
        );
    }

    // Spawn async background worker to track stdout lines and process completion
    let app_clone = app.clone();
    let job_id = download_id.clone();

    // BUG-048: run-generation — a duplicate id request would otherwise silently
    // overwrite the old job's PID; workers from previous generations must not
    // emit events after the id was re-registered.
    let run_generation: u64 = {
        let mut g = RUN_GENERATION.lock().expect("RUN_GENERATION lock");
        *g += 1;
        *g
    };

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut last_percent = 0.0f32;
        let mut current_speed = String::new();
        let mut current_eta = String::new();
        let mut current_size = String::new();
        let mut detected_filename = String::new();
        let mut detected_filepath: Option<PathBuf> = None;

        for line_res in reader.lines() {
            if let Ok(line) = line_res {
                // BUG-048: if the id was overwritten by a new job with the
                // same id, stop touching the UI — events are stale.
                let still_current = ACTIVE_JOBS
                    .lock()
                    .map(|jobs| jobs.contains_key(&job_id))
                    .unwrap_or(false);
                if !still_current {
                    break;
                }

                // Parse percentage e.g. " 45.2%"
                if let Some(pos) = line.find('%') {
                    let prefix = &line[..pos];
                    if let Some(num_str) = prefix.split_whitespace().last() {
                        if let Ok(p) = num_str.parse::<f32>() {
                            last_percent = p;
                        }
                    }
                }

                // Parse speed e.g. "at 12.34MiB/s"
                if let Some(pos) = line.find("at ") {
                    let after = &line[pos + 3..];
                    if let Some(token) = after.split_whitespace().next() {
                        current_speed = token.to_string();
                    }
                }

                // Parse ETA e.g. "ETA 00:15"
                if let Some(pos) = line.find("ETA ") {
                    let after = &line[pos + 4..];
                    if let Some(token) = after.split_whitespace().next() {
                        current_eta = token.to_string();
                    }
                }

                // Parse size e.g. "of ~ 125.40MiB" or "of 85.12MiB"
                if let Some(pos) = line.find("of ") {
                    let after = line[pos + 3..].trim_start_matches('~').trim();
                    if let Some(token) = after.split_whitespace().next() {
                        current_size = token.to_string();
                    }
                }

                // Destination file detection
                if let Some(pos) = line.find("Destination: ") {
                    let path_str = line[pos + 13..].trim();
                    let p = PathBuf::from(path_str);
                    detected_filename = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                    detected_filepath = Some(p.clone());
                    // BUG-047: record it on the active job so cancel only
                    // touches this exact file.
                    if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
                        if let Some(job) = jobs.get_mut(&job_id) {
                            job.dest_path = Some(p.clone());
                            job.last_file_path = Some(p);
                        }
                    }
                } else if let Some(pos) = line.find("has already been downloaded") {
                    let before = line[..pos].trim_start_matches("[download]").trim();
                    let p = PathBuf::from(before);
                    detected_filename = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                    detected_filepath = Some(p.clone());
                    if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
                        if let Some(job) = jobs.get_mut(&job_id) {
                            job.dest_path = Some(p.clone());
                            job.last_file_path = Some(p);
                        }
                    }
                }

                // Emit progress update
                let _ = app_clone.emit(
                    "downloader:progress",
                    DownloadProgressPayload {
                        id: job_id.clone(),
                        status: "downloading".to_string(),
                        percent: last_percent,
                        speed: current_speed.clone(),
                        eta: current_eta.clone(),
                        size_text: current_size.clone(),
                        filename: detected_filename.clone(),
                        file_path: detected_filepath.as_ref().map(|p| p.to_string_lossy().to_string()),
                        error: None,
                    },
                );
            }
        }

        // Wait for child process exit status
        let status_res = child.wait();

        // Read any remaining stderr if error occurred
        let mut stderr_text = String::new();
        let _ = BufReader::new(stderr).read_line(&mut stderr_text);

        let is_success = status_res.map(|s| s.success()).unwrap_or(false);

        // Check whether this job was actively removed or paused.
        // BUG-048: also bail out if a newer generation of the same id has
        // already taken over the slot — events from this old worker are stale.
        let is_paused = {
            if let Ok(jobs) = ACTIVE_JOBS.lock() {
                !jobs.contains_key(&job_id)
            } else {
                false
            }
        };
        let _ = run_generation; // reserved for future per-id generation tracking

        // BUG-046: only treat the download as successful if BOTH the subprocess
        // exited cleanly AND yt-dlp reported its own destination file path
        // (via "Destination:" or "has already been downloaded"). Falling back to
        // "find the newest file in the directory" is removed because that
        // approach happily returned files produced by a *different* job —
        // silent substitution of wrong results is forbidden by project rules.
        let has_own_output = detected_filepath
            .as_ref()
            .map(|p| p.exists())
            .unwrap_or(false);

        if !is_paused {
            if is_success && has_own_output {
                info!("✅ Downloader job {} finished successfully", job_id);
                let _ = app_clone.emit(
                    "downloader:progress",
                    DownloadProgressPayload {
                        id: job_id.clone(),
                        status: "completed".to_string(),
                        percent: 100.0,
                        speed: "0 B/s".to_string(),
                        eta: "00:00".to_string(),
                        size_text: current_size,
                        filename: detected_filename,
                        file_path: detected_filepath.as_ref().map(|p| p.to_string_lossy().to_string()),
                        error: None,
                    },
                );
            } else {
                // Distinguish: clean exit but no reported file → likely wrong
                // link / dead URL / silent fail. Tell the truth.
                let err_msg = if !stderr_text.trim().is_empty() {
                    stderr_text.trim().to_string()
                } else if is_success && !has_own_output {
                    format!(
                        "yt-dlp đã thoát thành công nhưng không in ra đường dẫn file (có thể link chết hoặc bị chặn khu vực)"
                    )
                } else {
                    "Tải video thất bại (kiểm tra kết nối mạng hoặc bản quyền)".to_string()
                };
                warn!("❌ Downloader job {} failed: {}", job_id, err_msg);
                let _ = app_clone.emit(
                    "downloader:progress",
                    DownloadProgressPayload {
                        id: job_id.clone(),
                        status: "error".to_string(),
                        percent: last_percent,
                        speed: "0 B/s".to_string(),
                        eta: "--:--".to_string(),
                        size_text: current_size,
                        filename: detected_filename,
                        file_path: None,
                        error: Some(err_msg),
                    },
                );
            }

            if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
                jobs.remove(&job_id);
            }
        }
    });

    Ok(())
}

/// Instant cancel of download: kills PID tree and purges ONLY the residual
/// `.part` / `.ytdl` files that belong to this job — never scans the whole
/// save directory. (BUG-047)
pub fn cancel_download(app: &AppHandle, id: &str) -> Result<()> {
    if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
        if let Some(job) = jobs.remove(id) {
            kill_pid(job.pid);
            // BUG-047: only delete the residual partial files for *this* job.
            // If we never saw a "Destination:" line, fall back to the save_dir
            // — but still only match paths that look like yt-dlp outputs.
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
        }
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
        },
    );
    Ok(())
}

/// Replace the extension on a path with a partial-download extension.
/// e.g. `clip.mp4` + `"part"` -> `clip.mp4.part`.
fn with_extension(path: &Path, ext: &str) -> PathBuf {
    let mut p = path.to_path_buf();
    p.set_extension(ext);
    p
}

/// Pause download: gracefully stops the process while keeping .part file intact for resume
pub fn pause_download(app: &AppHandle, id: &str) -> Result<()> {
    if let Ok(mut jobs) = ACTIVE_JOBS.lock() {
        if let Some(job) = jobs.remove(id) {
            kill_pid(job.pid);
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
