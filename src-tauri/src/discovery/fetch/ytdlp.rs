//! TSK-V015-DISC-CMD — chạy `yt-dlp` tìm YouTube (phần con của [`super`]).
//!
//! - **Không** dùng shell (không `cmd /c`) ⇒ không có chèn tham số dòng lệnh.
//! - `CREATE_NO_WINDOW` trên Windows ⇒ không mở cửa sổ console nhấp nháy.
//! - Quá [`YTDLP_TIMEOUT_SECS`] thì giết **cả cây** tiến trình (không để mồ côi).
//! - Không tìm thấy `yt-dlp` ⇒ lỗi `[ytdlp_missing]` (UI hướng dẫn cài).

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::{PREFIX_BLOCKED, PREFIX_NETWORK, PREFIX_PARSE, PREFIX_YTDLP_MISSING};

/// Timeout chạy `yt-dlp` (giây).
pub const YTDLP_TIMEOUT_SECS: u64 = 40;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Chạy `yt-dlp` với 1 truy vấn tìm kiếm, trả về stdout (JSON thô).
///
/// `ytdlp_path` là đường dẫn do người dùng cấu hình (rỗng ⇒ tự tìm trong PATH).
pub fn search_json(ytdlp_path: &str, query: &str) -> Result<String, String> {
    let binary = crate::downloader::find_ytdlp(Some(ytdlp_path)).map_err(|e| {
        format!("{PREFIX_YTDLP_MISSING} Không tìm thấy yt-dlp trên máy này: {e}")
    })?;
    run(&binary, query)
}

/// Chạy `yt-dlp` với 1 truy vấn và trả về stdout.
fn run(binary: &Path, query: &str) -> Result<String, String> {
    let mut command = Command::new(binary);
    command
        .arg("--dump-single-json")
        .arg("--flat-playlist")
        .arg("--no-warnings")
        .arg(query)
        // Bắt buộc cho output UTF-8 (tiếng Trung) trên Windows.
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("{PREFIX_YTDLP_MISSING} Không tìm thấy yt-dlp trên máy này.")
        } else {
            format!("{PREFIX_YTDLP_MISSING} Không chạy được yt-dlp: {e}")
        }
    })?;

    #[cfg(windows)]
    let pid: u32 = child.id();
    #[cfg(not(windows))]
    let pid: u32 = child.id().unwrap_or(0);

    // Đọc 2 pipe ở thread riêng — nếu không, tiến trình sẽ kẹt khi pipe đầy.
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let out_handle = std::thread::spawn(move || read_pipe(stdout));
    let err_handle = std::thread::spawn(move || read_pipe(stderr));

    // Watchdog: quá thời gian thì giết cây tiến trình.
    let finished = Arc::new(AtomicBool::new(false));
    let watchdog_flag = Arc::clone(&finished);
    let timed_out = Arc::new(AtomicBool::new(false));
    let watchdog_timeout = Arc::clone(&timed_out);
    let watchdog = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(YTDLP_TIMEOUT_SECS);
        while Instant::now() < deadline {
            if watchdog_flag.load(Ordering::Relaxed) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        watchdog_timeout.store(true, Ordering::Relaxed);
        crate::proc_kill::kill_pid_tree(pid);
    });

    let status = child.wait();
    finished.store(true, Ordering::Relaxed);
    let _ = watchdog.join();

    let stdout_text = out_handle.join().unwrap_or_default();
    let stderr_text = err_handle.join().unwrap_or_default();

    if timed_out.load(Ordering::Relaxed) {
        return Err(format!(
            "{PREFIX_NETWORK} yt-dlp quá thời gian ({YTDLP_TIMEOUT_SECS}s). Thử lại sau."
        ));
    }

    let status = status.map_err(|e| format!("{PREFIX_NETWORK} Không chờ được yt-dlp: {e}"))?;
    if !status.success() {
        if stderr_text.to_lowercase().contains("sign in to confirm") {
            return Err(format!(
                "{PREFIX_BLOCKED} YouTube yêu cầu xác nhận bạn không phải bot. Thử lại sau ít phút."
            ));
        }
        let detail = stderr_text.trim();
        return Err(format!(
            "{PREFIX_PARSE} yt-dlp báo lỗi (mã {}). {detail}",
            status.code().unwrap_or(-1)
        ));
    }

    Ok(stdout_text)
}

/// Đọc hết một pipe thành `String` (thay ký tự hỏng nếu UTF-8 lỗi).
fn read_pipe<R: Read>(pipe: Option<R>) -> String {
    let Some(mut pipe) = pipe else {
        return String::new();
    };
    let mut buffer = Vec::new();
    let _ = pipe.read_to_end(&mut buffer);
    String::from_utf8_lossy(&buffer).to_string()
}
