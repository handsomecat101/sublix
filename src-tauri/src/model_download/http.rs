//! Tải file qua HTTP: resume bằng `Range`, đo tốc độ, huỷ được.

use anyhow::{bail, Context, Result};
use reqwest::blocking::Client;
use reqwest::header::RANGE;
use std::collections::VecDeque;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::progress::{is_cancelled, DownloadProgress, ModelFile, phase};
use super::sha256::sha256_file;

/// Minimum interval between two progress events (≈ 4 events/second).
const EMIT_INTERVAL: Duration = Duration::from_millis(250);

/// Lỗi nội bộ: người dùng đã bấm "Hủy" giữa chừng lúc tải.
#[derive(Debug)]
struct Cancelled;

impl std::fmt::Display for Cancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Đã hủy tải")
    }
}

impl std::error::Error for Cancelled {}

/// Tracks the download speed over a sliding window so `speed_bps` and `eta_s`
/// are meaningful instead of an average over the whole (possibly long) file.
///
/// The window is short (1,2 s) so the UI sees a live speed on the very first
/// progress event instead of waiting for a long average.
struct SpeedMeter {
    samples: VecDeque<(Instant, u64)>,
    last_speed: u64,
}

impl SpeedMeter {
    fn new() -> Self {
        Self {
            samples: VecDeque::new(),
            last_speed: 0,
        }
    }

    fn add(&mut self, bytes: u64) -> u64 {
        let now = Instant::now();
        self.samples.push_back((now, bytes));
        // Giữ cửa sổ 1,2 giây gần nhất.
        while let Some((t, _)) = self.samples.front() {
            if now.duration_since(*t) > Duration::from_millis(1200) {
                self.samples.pop_front();
            } else {
                break;
            }
        }
        let total: u64 = self.samples.iter().map(|(_, b)| *b).sum();
        let elapsed = self
            .samples
            .front()
            .map(|(t, _)| now.duration_since(*t))
            .unwrap_or_default();
        // Cần tối thiểu 200 ms để có con số đáng tin (không chia cho 0).
        if elapsed >= Duration::from_millis(200) && total > 0 {
            let speed = (total as f64 / elapsed.as_secs_f64()) as u64;
            // làm mượt nhẹ để UI không nhảy số
            self.last_speed = if self.last_speed == 0 {
                speed
            } else {
                (self.last_speed * 3 + speed) / 4
            };
        }
        self.last_speed
    }
}

pub(super) fn download_one<F>(
    model_id: &str,
    kind: &str,
    file: &ModelFile,
    temp: &Path,
    total_all: u64,
    done_before: u64,
    on_progress: &mut F,
) -> Result<()>
where
    F: FnMut(DownloadProgress),
{
    let client = Client::builder()
        .user_agent("sublix/0.11")
        .timeout(Duration::from_secs(3600))
        .build()
        .context("Không tạo được HTTP client")?;

    // Resume support: ask for the remaining bytes.
    let mut offset: u64 = std::fs::metadata(temp).map(|m| m.len()).unwrap_or(0);
    if offset > 0 && file.bytes > 0 && offset >= file.bytes {
        // A stale oversized temp file — start over.
        let _ = std::fs::remove_file(temp);
        offset = 0;
    }

    let mut request = client.get(&file.url);
    if offset > 0 {
        request = request.header(RANGE, format!("bytes={offset}-"));
    }
    let mut response = match request.send() {
        Ok(resp) => resp,
        Err(first_err) => match &file.fallback_url {
            Some(mirror) => {
                // URL chính lỗi (GitHub hay bị nghẽn) → thử mirror dự phòng.
                let mut req = client.get(mirror);
                if offset > 0 {
                    req = req.header(RANGE, format!("bytes={offset}-"));
                }
                req.send().with_context(|| {
                    format!(
                        "Không tải được {} (URL chính: {}; mirror: {})",
                        file.filename,
                        first_err,
                        mirror
                    )
                })?
            }
            None => return Err(first_err).context("Không kết nối được máy chủ tải model"),
        },
    };
    let status = response.status();
    if !status.is_success() {
        // Thử mirror nếu URL chính trả lỗi HTTP.
        let mut ok = false;
        if let Some(mirror) = &file.fallback_url {
            let mut req = client.get(mirror);
            if offset > 0 {
                req = req.header(RANGE, format!("bytes={offset}-"));
            }
            if let Ok(resp) = req.send() {
                if resp.status().is_success() {
                    response = resp;
                    ok = true;
                }
            }
        }
        if !ok {
            bail!(
                "Tải model thất bại (HTTP {}) — kiểm tra mạng hoặc link cũ",
                status.as_u16()
            );
        }
    }
    // 206 = partial content (đã resume), 200 = full body (phải tải lại từ đầu).
    let status = response.status();
    if offset > 0 && status != reqwest::StatusCode::PARTIAL_CONTENT {
        offset = 0;
    }

    let content_len = response.content_length().unwrap_or(0);
    let file_total: u64 = if file.bytes > 0 {
        file.bytes
    } else {
        offset + content_len
    };

    let mut file_handle = if offset > 0 {
        let mut fh = std::fs::OpenOptions::new()
            .write(true)
            .append(true)
            .open(temp)
            .with_context(|| format!("Không mở được file tải dở: {}", temp.display()))?;
        fh.seek(SeekFrom::Start(offset))?;
        fh
    } else {
        std::fs::File::create(temp)
            .with_context(|| format!("Không tạo được file tải: {}", temp.display()))?
    };

    let mut meter = SpeedMeter::new();
    let mut buf = vec![0u8; 256 * 1024];
    let mut downloaded = offset;
    // Bắt đầu từ `now()` (không phải `now() - INTERVAL`) để sự kiện đầu tiên
    // chỉ bắn ra sau khi đã có mẫu tốc độ ⇒ UI không hiện "— MB/s" lúc mở.
    let mut last_emit = Instant::now();

    loop {
        if is_cancelled(model_id) {
            let _ = file_handle.flush();
            return Err(Cancelled.into());
        }
        let n = response.read(&mut buf).context("Mạng bị ngắt khi đang tải model")?;
        if n == 0 {
            break;
        }
        file_handle.write_all(&buf[..n])?;
        downloaded += n as u64;
        let speed = meter.add(n as u64);

        if last_emit.elapsed() >= EMIT_INTERVAL {
            last_emit = Instant::now();
            let remaining = file_total.saturating_sub(downloaded);
            let eta_s = if speed > 0 {
                Some(remaining / speed)
            } else {
                None
            };
            on_progress(DownloadProgress {
                model_id: model_id.to_string(),
                kind: kind.to_string(),
                phase: phase::DOWNLOADING.to_string(),
                bytes_done: done_before + downloaded,
                bytes_total: if total_all > 0 { total_all } else { file_total },
                speed_bps: speed,
                eta_s,
                file: Some(file.filename.clone()),
                message: format!("Đang tải {}", file.filename),
            });
        }
    }
    file_handle.flush()?;

    // --- verify (BUG-012: never accept a short file) ---
    on_progress(DownloadProgress {
        model_id: model_id.to_string(),
        kind: kind.to_string(),
        phase: phase::VERIFYING.to_string(),
        bytes_done: done_before + downloaded,
        bytes_total: if total_all > 0 { total_all } else { downloaded },
        speed_bps: 0,
        eta_s: Some(0),
        file: Some(file.filename.clone()),
        message: "Đang kiểm tra file".to_string(),
    });

    if file.bytes > 0 && downloaded != file.bytes {
        bail!(
            "File {} tải thiếu byte ({} / {}) — mạng bị ngắt, bấm tải lại để tiếp tục.",
            file.filename,
            downloaded,
            file.bytes
        );
    }
    if let Some(expected) = &file.sha256 {
        let actual = sha256_file(temp)?;
        if !actual.eq_ignore_ascii_case(expected) {
            let size = std::fs::metadata(temp).map(|m| m.len()).unwrap_or(0);
            let head: Vec<String> = std::fs::read(temp)
                .unwrap_or_default()
                .iter()
                .take(16)
                .map(|b| format!("{b:02x}"))
                .collect();
            // Giữ lại file hỏng để điều tra (không xoá) — sẽ bị xoá ở lần tải sau.
            bail!(
                "File {} sai SHA-256 (mong đợi {}, nhận {}, size {}, head {}) — tải lại để thay file hỏng.",
                file.filename,
                expected,
                actual,
                size,
                head.join(" ")
            );
        }
    }

    let dest = temp
        .parent()
        .map(|p| p.join(&file.filename))
        .unwrap_or_else(|| PathBuf::from(&file.filename));
    std::fs::rename(temp, &dest)
        .with_context(|| format!("Không cài được file: {}", dest.display()))?;
    Ok(())
}
