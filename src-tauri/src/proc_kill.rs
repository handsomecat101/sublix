//! Kết thúc tiến trình **theo PID** — tuyệt đối không giết theo tên (BUG-003).
//!
//! `taskkill /IM <tên>.exe /F` giết **mọi** tiến trình trùng tên, nên 2
//! instance Sublix (hoặc app khác của chính người dùng) sẽ giết lẫn nhau.
//! Ở đây ta chỉ kết thúc:
//! - đúng tiến trình con **ta vừa spawn** (giữ handle `Child`), hoặc
//! - đúng PID **ta đã ghi lại** ở lần chạy trước (file `.pid`), kèm **PID của
//!   app chủ sở hữu**.
//!
//! ## Vì sao phải ghi PID của app chủ?
//!
//! File `.pid` nằm trong `%TEMP%` nên **dùng chung cho mọi instance** (app của
//! PO và instance verify của bạn vẫn chung `%TEMP%`, chỉ khác `%APPDATA%`).
//! Nếu chỉ lưu PID server thì instance B sẽ đọc PID server của instance A
//! đang sống và giết mất — đúng loại lỗi BUG-003 mà ta đang chặn.
//!
//! Vì vậy file lưu **2 số**: `<server_pid> <owner_pid>`. Server chỉ được dọn khi:
//! - `owner_pid == PID` của chính app này (lần chạy trước của chính ta), hoặc
//! - app chủ đã **chết** ⇒ server mồ côi, ai cũng có quyền dọn.
//!
//! Nếu app chủ **còn sống** (instance khác đang dùng server đó) thì **không
//! giết**. Nếu file hỏng / thiếu thông tin owner ⇒ coi như không rõ ⇒ **không
//! giết** (an toàn) và ghi đè file mới.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// PID → tên tiến trình (đọc từ `tasklist`).
pub type ProcessImages = HashMap<u32, String>;

/// Thông tin ghi nhớ trong file `.pid`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrackedServer {
    /// PID của tiến trình server.
    pub server_pid: u32,
    /// PID của app đã spawn server này. Server chỉ "mồ côi" khi app này chết.
    pub owner_pid: u32,
}

/// Chọn PID được phép kết thúc.
///
/// - `own_child`: PID tiến trình con ta đang giữ handle `Child` → luôn được phép.
/// - `tracked`: PID đã ghi lại từ lần chạy trước (kèm app chủ).
/// - `owner_alive`: app chủ của `tracked` còn sống hay không.
/// - `current_pid`: PID của chính tiến trình đang chạy.
///
/// Chỉ trả về PID khi tiến trình **còn sống** và tên tiến trình khớp
/// `expected_image` (so sánh không phân biệt hoa/thường).
pub fn pick_kill_target(
    own_child: Option<u32>,
    tracked: Option<TrackedServer>,
    owner_alive: bool,
    current_pid: u32,
    images: &ProcessImages,
    expected_image: &str,
) -> Option<u32> {
    let image_ok = |pid: u32| -> bool {
        images
            .get(&pid)
            .map(|image| image.trim().eq_ignore_ascii_case(expected_image))
            .unwrap_or(false)
    };

    // 1) Tiến trình con ta vừa spawn → luôn được phép kết thúc.
    if let Some(pid) = own_child {
        if pid != 0 && image_ok(pid) {
            return Some(pid);
        }
    }

    // 2) PID ghi nhớ từ lần chạy trước.
    let Some(t) = tracked else {
        // File `.pid` hỏng / thiếu thông tin owner → KHÔNG giết (an toàn).
        return None;
    };
    if t.server_pid == 0 || !image_ok(t.server_pid) {
        return None;
    }
    if t.owner_pid == current_pid {
        // Chính app này đã spawn server này ở lần trước → được thay thế.
        return Some(t.server_pid);
    }
    if owner_alive {
        // App/instance KHÁC còn sống và đang dùng server này → để nguyên.
        return None;
    }
    // App chủ đã chết → server mồ côi → được phép dọn.
    Some(t.server_pid)
}

/// Đường dẫn file `.pid` cho một server (thư mục runtime tạm của user).
pub fn pid_file_path(server_name: &str) -> PathBuf {
    std::env::temp_dir()
        .join("sublix-runtime")
        .join(format!("{server_name}.pid"))
}

/// Đọc file `.pid` — định dạng `<server_pid> <owner_pid>`.
///
/// Trả `None` nếu file không tồn tại, hỏng, hoặc **chỉ có 1 số** (định dạng cũ
/// không rõ app chủ) ⇒ coi như không rõ ⇒ **không được giết** (an toàn).
pub fn read_tracked_pid(path: &Path) -> Option<TrackedServer> {
    let raw = std::fs::read_to_string(path).ok()?;
    let mut parts = raw.split_whitespace();
    let server_pid = parts.next()?.parse::<u32>().ok().filter(|p| *p > 0)?;
    let owner_pid = parts.next()?.parse::<u32>().ok().filter(|p| *p > 0)?;
    Some(TrackedServer {
        server_pid,
        owner_pid,
    })
}

/// Ghi `<server_pid> <owner_pid>` vào file `.pid` (để lần sau dọn đúng tiến
/// trình này, và biết app nào là chủ sở hữu).
pub fn write_tracked_pid(path: &Path, server_pid: u32, owner_pid: u32) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, format!("{server_pid} {owner_pid}"))
}

/// Xoá file `.pid` — nhưng **chỉ** khi nó vẫn trỏ tới `server_pid`.
///
/// Việc so sánh PID tránh xoá nhầm file của server mới vừa spawn.
pub fn remove_tracked_pid_if_matches(path: &Path, server_pid: u32) {
    if let Some(t) = read_tracked_pid(path) {
        if t.server_pid == server_pid {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Bảng PID → tên tiến trình hiện đang chạy (Windows: `tasklist`).
pub fn list_process_images() -> ProcessImages {
    let mut map = ProcessImages::new();
    #[cfg(windows)]
    {
        let output = Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                // Định dạng CSV: "image.exe","1234","Console","1","10,000 K"
                let cols: Vec<&str> = line.split('"').collect();
                if cols.len() < 4 {
                    continue;
                }
                let image = cols[1].trim();
                let pid = cols[3].trim();
                if let Ok(pid) = pid.parse::<u32>() {
                    map.insert(pid, image.to_string());
                }
            }
        }
    }
    map
}

/// Tiến trình `pid` còn sống hay không?
///
/// Nếu **không xác định được** (lệnh hỏng, không có quyền…) → trả `true` để
/// coi như còn sống ⇒ không giết nhầm.
pub fn process_is_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    #[cfg(windows)]
    {
        let filter = format!("PID eq {pid}");
        let out = Command::new("tasklist")
            .args(["/FI", &filter, "/NH", "/FO", "CSV"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        match out {
            Ok(o) if o.status.success() => {
                let text = String::from_utf8_lossy(&o.stdout);
                !text.contains("No tasks are running") && text.contains(&format!("\"{pid}\""))
            }
            // Không xác định → coi như CÒN SỐNG (an toàn).
            _ => true,
        }
    }
    #[cfg(not(windows))]
    {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .map(|s| s.success())
            // Không xác định → coi như còn sống (an toàn).
            .unwrap_or(true)
    }
}

/// Kết thúc tiến trình theo PID + cây chá của nó.
pub fn kill_pid_tree(pid: u32) {
    if pid == 0 {
        return;
    }
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

/// Dọn server **mồ côi** do app này đã spawn ở lần chạy trước.
///
/// Chỉ giết khi app chủ đã chết (server mồ côi) hoặc app chủ chính là tiến
/// trình hiện tại. **Không** giết server của instance khác đang chạy.
///
/// Trả về PID đã kết thúc (nếu có).
pub fn kill_tracked_server(
    tracked: Option<TrackedServer>,
    expected_image: &str,
) -> Option<u32> {
    let tracked = tracked?;
    let images = list_process_images();
    let owner_alive = process_is_alive(tracked.owner_pid);
    let target = pick_kill_target(
        None,
        Some(tracked),
        owner_alive,
        std::process::id(),
        &images,
        expected_image,
    );
    if let Some(pid) = target {
        kill_pid_tree(pid);
    }
    target
}

// Test cho module này nằm ở file riêng (giữ file chính < 300 dòng).
#[cfg(test)]
#[path = "proc_kill_tests.rs"]
mod tests;
