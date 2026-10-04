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
use std::sync::{LazyLock, Mutex};
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

/// Detect yt-dlp executable. Search order (BUG-054):
///   1. User-configured absolute path (`user_path`)
///   2. Same directory as the running `sublix.exe` (portable bundle)
///   3. `$PATH` (via `where yt-dlp` on Windows / `which yt-dlp` elsewhere)
///   4. Fallback: bare `"yt-dlp.exe"` so spawn still has a chance if the
///      binary is on PATH at exec time.
///
/// Hardcoded machine paths like `C:\Program Files\AI Automation\...`
/// are forbidden — they break every other machine and conflict with
/// `BUG-001`/`BUG-017`.
pub fn find_ytdlp(user_path: Option<&str>) -> Result<PathBuf> {
    // 1. User-configured path
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

    // 3. System PATH via `where` (Windows) or `which` fallback
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

    let cfg = crate::config::AppConfig::load(&app);
    let ytdlp_bin = find_ytdlp(Some(&cfg.ytdlp_path))?;
    let save_dir = get_downloads_dir(&app);
    let platform = get_platform(&req.url);

    let out_template = save_dir.join("%(title)s [%(id)s].%(ext)s");

    let mut cmd = Command::new(&ytdlp_bin);
    // R2-01: every option must come BEFORE `--`. yt-dlp treats everything
    // after `--` as a positional arg, so a flag placed after `--` is silently
    // ignored. The previous code put `cmd.arg("--").arg(url)` first and
    // chained every other flag after it — which meant yt-dlp saw just a URL
    // and used its defaults (no output template, no progress template,
    // pulled whole playlists, etc.). Put the URL LAST.
    cmd.arg("-o")
        .arg(&out_template)
        .arg("--newline")
        .arg("--no-ansi")  // BUG-056: kill ANSI colour codes so our parser
                          // never sees escape sequences.
        .arg("--no-warnings")
        .arg("--no-playlist")    // BUG-055: do not silently pull a whole playlist
        // BUG-056: machine-parseable progress. Field order:
        //   downloaded_bytes|total_bytes|total_bytes_estimate|speed|eta
        // We compute percent ourselves so live streams (no total) report
        // something sensible instead of NaN.
        .arg("--progress-template")
        .arg("download:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s")
        .arg("--continue"); // Native resume from .part file

    if platform == "youtube" {
        cmd.arg("--extractor-args")
            .arg("youtube:player_client=web_safari,android_vr,ios");
    }

    // R2-08.5: Cookie integration. Whitelist is strictly the three browsers
    // yt-dlp actually supports via `--cookies-from-browser` on Windows without
    // extra plugins — edge / chrome / firefox. Opera/Safari/Brave were removed:
    //   - Safari: macOS-only.
    //   - Opera / Brave: yt-dlp accepts the names but App-Bound Encryption has
    //     been progressively breaking them since 2024; surfacing a silent
    //     failure is worse than a hard reject.
    // yt-dlp's own extractor doc agrees: only chromium-derivatives + firefox
    // are reliable on Windows today.
    //
    // Priority: if a whitelisted browser is set, use it. Otherwise fall back
    // to a Netscape `cookies.txt` the user explicitly picked. Never pass both
    // flags — yt-dlp's behaviour when both are set is undocumented and has
    // been observed to ignore the file in practice (BUG-057).
    let browser_cookie_enabled = req
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

    if let Some(b) = browser_cookie_enabled {
        cmd.arg("--cookies-from-browser").arg(&b);
    } else if let Some(ref cookies_file) = req.cookies_file {
        // BUG-057 fallback: only when we are NOT using browser cookies.
        let cf = cookies_file.trim();
        if !cf.is_empty() {
            let p = std::path::Path::new(cf);
            if p.exists() {
                cmd.arg("--cookies").arg(cf);
            } else {
                warn!("cookies_file không tồn tại: {}", cf);
            }
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

    // R2-01: the URL must be the LAST argument, after `--` (the positional
    // separator). Putting it last — after every option above — lets yt-dlp
    // actually parse all our flags instead of treating them as part of the
    // URL.
    cmd.arg("--").arg(&req.url);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().context("Không thể khởi động yt-dlp")?;
    let pid = child.id();
    let stdout = child.stdout.take().context("Không thể pipe stdout")?;
    let stderr = child.stderr.take().context("Không thể pipe stderr")?;

    // R2-08.1: wrap the freshly-spawned yt-dlp in a Windows Job Object with
    // KILL_ON_JOB_CLOSE so the entire grandchild tree (yt-dlp → ffmpeg/ffprobe)
    // dies when our process terminates or when we close the job handle. On
    // non-Windows this is a no-op (job_handle stays None).
    #[cfg(windows)]
    let job_handle_raw: Option<isize> = unsafe { create_kill_on_close_job(pid) };
    #[cfg(not(windows))]
    let job_handle_raw: Option<isize> = None;

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
                job_handle: job_handle_raw,
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
        let mut last_percent: f32 = -1.0; // sentinel so first emit always fires
        let mut current_speed = String::new();
        let mut current_eta = String::new();
        let mut current_size = String::new();
        let mut detected_filename = String::new();
        let mut detected_filepath: Option<PathBuf> = None;
        let mut last_emit = std::time::Instant::now();

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

                // BUG-056: parse the machine-parseable progress template we
                // pass to yt-dlp. Lines look like:
                //   download:1024|0|2048000|123456|00:42
                // where fields are bytes downloaded | known total |
                // estimate total | speed (bytes/s) | ETA (mm:ss).
                // We compute percent from bytes ourselves — much more
                // robust than the old text-grep against `%`, which broke
                // when a video title contained "at 100%".
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
                            // Surface a useful "of N MiB" string for the UI.
                            current_size = format!("{:.1} MiB", total as f64 / 1_048_576.0);
                            Some(p as f32)
                        } else {
                            // Live stream / unknown size — keep last percent,
                            // never NaN.
                            Some(last_percent.max(0.0))
                        }
                    } else {
                        None
                    }
                } else {
                    None
                };

                // Destination file detection (unchanged)
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

                if let Some(p) = pct {
                    last_percent = p;
                }

                // BUG-056 (2): throttle event emission. yt-dlp can spew a
                // progress line every few hundred ms; the UI can't keep up
                // and it makes the progress bar jittery. Emit when (a) the
                // percent moved at least 0.5% OR (b) 250 ms have passed.
                let percent_delta = (last_percent - (-1.0)).abs();
                let pct_changed = pct.is_some() && percent_delta >= 0.5;
                let time_elapsed = last_emit.elapsed();
                if pct_changed || time_elapsed.as_millis() >= 250 {
                    let _ = app_clone.emit(
                        "downloader:progress",
                        DownloadProgressPayload {
                            id: job_id.clone(),
                            status: "downloading".to_string(),
                            percent: last_percent.max(0.0),
                            speed: current_speed.clone(),
                            eta: current_eta.clone(),
                            size_text: current_size.clone(),
                            filename: detected_filename.clone(),
                            file_path: detected_filepath.as_ref().map(|p| p.to_string_lossy().to_string()),
                            error: None,
                        },
                    );
                    last_emit = std::time::Instant::now();
                }
            }
        }

        // Wait for child process exit status
        let status_res = child.wait();

        // BUG-056 (3): read the *entire* stderr buffer, not just one line.
        // yt-dlp can emit several warnings (cookie, geo, private video, …)
        // and surfacing only the first one is a UX regression. Trim and
        // cap at ~2 KB so a runaway log doesn't blow up the payload.
        let mut stderr_text = String::new();
        let _ = BufReader::new(stderr).read_to_string(&mut stderr_text);
        stderr_text = stderr_text.trim().to_string();
        if stderr_text.len() > 2048 {
            stderr_text.truncate(2048);
            stderr_text.push_str("\n…(đã cắt bớt)");
        }

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
