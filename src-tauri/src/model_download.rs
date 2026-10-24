//! Shared model downloader with detailed, resumable, cancellable progress.
//!
//! Emits the Tauri event [`EVENT`] (`model:download-progress`) so any UI can
//! render `%`, `MB/s`, `ETA` and the current phase without touching the
//! downloader internals. Used by both the STT catalog (`stt/stt_catalog.rs`)
//! and the voice/TTS catalog (`voice_models.rs`).
//!
//! Guarantees (BUG-012):
//! - a file is only "installed" after its byte count matches the expected size,
//! - an optional SHA-256 checksum is verified before the file is renamed into
//!   place, so a truncated / corrupted download can never look "ready",
//! - an interrupted download resumes via the HTTP `Range` header instead of
//!   starting over.

use anyhow::{bail, Context, Result};
use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::blocking::Client;
use reqwest::header::RANGE;

/// Name of the Tauri event carrying [`DownloadProgress`].
pub const EVENT: &str = "model:download-progress";

/// Minimum interval between two progress events (≈ 4 events/second).
const EMIT_INTERVAL: Duration = Duration::from_millis(250);

/// Download phases reported through the progress event.
pub mod phase {
    pub const DOWNLOADING: &str = "downloading";
    pub const VERIFYING: &str = "verifying";
    pub const EXTRACTING: &str = "extracting";
    pub const INSTALLING_DEPS: &str = "installing_deps";
    pub const DONE: &str = "done";
    pub const ERROR: &str = "error";
}

/// Kind discriminator — `"stt"` or `"tts"`.
pub const KIND_STT: &str = "stt";
pub const KIND_TTS: &str = "tts";

/// One downloadable file that belongs to a model.
#[derive(Debug, Clone, Serialize)]
pub struct ModelFile {
    pub url: String,
    /// Mirror dùng khi URL chính bị nghẽn / lỗi (GitHub hay bị chặn tải ở VN).
    pub fallback_url: Option<String>,
    /// Path relative to the model directory (may contain `/`).
    pub filename: String,
    /// Expected size in bytes (0 = unknown → fall back to Content-Length).
    pub bytes: u64,
    /// Optional lowercase hex SHA-256 of the file.
    pub sha256: Option<String>,
}

impl ModelFile {
    pub fn new(url: impl Into<String>, filename: impl Into<String>, bytes: u64) -> Self {
        Self {
            url: url.into(),
            fallback_url: None,
            filename: filename.into(),
            bytes,
            sha256: None,
        }
    }

    pub fn with_fallback(mut self, fallback: impl Into<String>) -> Self {
        self.fallback_url = Some(fallback.into());
        self
    }

    pub fn with_sha256(mut self, sha256: impl Into<String>) -> Self {
        self.sha256 = Some(sha256.into().to_lowercase());
        self
    }
}

/// Progress payload emitted on [`EVENT`].
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    /// Model identifier (`sensevoice-zh-en`, `kokoro-vi`, ...).
    pub model_id: String,
    /// `"stt"` or `"tts"`.
    pub kind: String,
    /// One of [`phase`].
    pub phase: String,
    pub bytes_done: u64,
    pub bytes_total: u64,
    pub speed_bps: u64,
    pub eta_s: Option<u64>,
    /// File currently being processed (relative name).
    pub file: Option<String>,
    /// Human readable message (Vietnamese) for the UI.
    pub message: String,
}

// ---------------------------------------------------------------------------
// Cancellation registry
// ---------------------------------------------------------------------------

fn cancelled_slot() -> &'static Mutex<HashSet<String>> {
    static SLOT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Model đang được tải (chống 2 tiến trình ghi cùng 1 file → hỏng SHA-256).
fn in_progress_slot() -> &'static Mutex<HashSet<String>> {
    static SLOT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(HashSet::new()))
}

/// True nếu model này đang được tải.
pub fn is_in_progress(model_id: &str) -> bool {
    let set = in_progress_slot().lock().unwrap_or_else(|e| e.into_inner());
    set.contains(model_id)
}

/// Mark a model download as cancelled.
pub fn cancel(model_id: &str) {
    let mut set = cancelled_slot().lock().unwrap_or_else(|e| e.into_inner());
    set.insert(model_id.to_string());
}

/// Clear the cancel flag (called when a new download starts).
pub fn reset_cancel(model_id: &str) {
    let mut set = cancelled_slot().lock().unwrap_or_else(|e| e.into_inner());
    set.remove(model_id);
}

/// Whether the model download was cancelled.
pub fn is_cancelled(model_id: &str) -> bool {
    let set = cancelled_slot().lock().unwrap_or_else(|e| e.into_inner());
    set.contains(model_id)
}

#[derive(Debug)]
struct Cancelled;

impl std::fmt::Display for Cancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Đã hủy tải")
    }
}

impl std::error::Error for Cancelled {}

// ---------------------------------------------------------------------------
// SHA-256 (dependency-free, FIPS 180-4)
// ---------------------------------------------------------------------------

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/// SHA-256 of a byte slice, lowercase hex.
pub fn sha256_hex(data: &[u8]) -> String {
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];

    let bit_len = (data.len() as u64).wrapping_mul(8);
    let mut padded = data.to_vec();
    padded.push(0x80);
    while padded.len() % 64 != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_len.to_be_bytes());

    let mut w = [0u32; 64];
    for chunk in padded.chunks_exact(64) {
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) =
            (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    h.iter().map(|v| format!("{v:08x}")).collect()
}

/// SHA-256 of a file on disk, lowercase hex.
pub fn sha256_file(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path)
        .with_context(|| format!("Không mở được file để kiểm tra: {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = file.read(&mut buf).context("Đọc file để kiểm tra SHA-256 lỗi")?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.hex())
}

/// Incremental SHA-256 state (used to hash large files without loading them).
pub struct Sha256 {
    state: [u32; 8],
    buffer: Vec<u8>,
    length: u64,
}

impl Default for Sha256 {
    fn default() -> Self {
        Self::new()
    }
}

impl Sha256 {
    pub fn new() -> Self {
        Self {
            state: [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
                0x5be0cd19,
            ],
            buffer: Vec::with_capacity(64),
            length: 0,
        }
    }

    pub fn update(&mut self, data: &[u8]) {
        self.length = self.length.wrapping_add(data.len() as u64);
        self.buffer.extend_from_slice(data);
        let full = self.buffer.len() - (self.buffer.len() % 64);
        if full > 0 {
            let block: Vec<u8> = self.buffer.drain(..full).collect();
            for chunk in block.chunks_exact(64) {
                self.compress(chunk);
            }
        }
    }

    fn compress(&mut self, chunk: &[u8]) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) = (
            self.state[0],
            self.state[1],
            self.state[2],
            self.state[3],
            self.state[4],
            self.state[5],
            self.state[6],
            self.state[7],
        );
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
        self.state[5] = self.state[5].wrapping_add(f);
        self.state[6] = self.state[6].wrapping_add(g);
        self.state[7] = self.state[7].wrapping_add(hh);
    }

    pub fn hex(mut self) -> String {
        let bit_len = self.length.wrapping_mul(8);
        let mut tail = Vec::new();
        tail.push(0x80u8);
        while (self.buffer.len() + tail.len()) % 64 != 56 {
            tail.push(0);
        }
        tail.extend_from_slice(&bit_len.to_be_bytes());
        let mut buf = std::mem::take(&mut self.buffer);
        buf.extend_from_slice(&tail);
        for chunk in buf.chunks_exact(64) {
            self.compress(chunk);
        }
        self.state.iter().map(|v| format!("{v:08x}")).collect()
    }
}

// ---------------------------------------------------------------------------
// Downloader
// ---------------------------------------------------------------------------

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

/// Download every file of a model into `dest_dir`, reporting progress.
///
/// `files` are downloaded sequentially. Existing complete files are skipped;
/// partial files resume through the HTTP `Range` header.
pub fn download_files<F>(
    model_id: &str,
    kind: &str,
    dest_dir: &Path,
    files: &[ModelFile],
    on_progress: &mut F,
) -> Result<()>
where
    F: FnMut(DownloadProgress),
{
    // Chống 2 lượt tải chạy song song trên cùng 1 model: chúng sẽ ghi đè
    // lẫn nhau và tạo file hỏng (SHA-256 sai).
    {
        let mut set = in_progress_slot().lock().unwrap_or_else(|e| e.into_inner());
        if !set.insert(model_id.to_string()) {
            bail!("Model '{model_id}' đang được tải — vui lòng đợi hoàn tất.");
        }
    }
    let result = download_files_inner(model_id, kind, dest_dir, files, on_progress);
    let mut set = in_progress_slot().lock().unwrap_or_else(|e| e.into_inner());
    set.remove(model_id);
    result
}

fn download_files_inner<F>(
    model_id: &str,
    kind: &str,
    dest_dir: &Path,
    files: &[ModelFile],
    on_progress: &mut F,
) -> Result<()>
where
    F: FnMut(DownloadProgress),
{
    reset_cancel(model_id);
    std::fs::create_dir_all(dest_dir)
        .with_context(|| format!("Không tạo được thư mục model: {}", dest_dir.display()))?;

    let total_all: u64 = files.iter().map(|f| f.bytes).sum();
    let mut done_all: u64 = 0;

    for file in files {
        let dest = dest_dir.join(&file.filename);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Không tạo được thư mục: {}", parent.display()))?;
        }

        // Already installed?
        if let Ok(meta) = std::fs::metadata(&dest) {
            let complete = if file.bytes > 0 {
                meta.len() == file.bytes
            } else {
                meta.len() > 0
            };
            if complete {
                done_all += meta.len();
                continue;
            }
        }

        let temp = dest_dir.join(format!("{}.part", file.filename.replace('/', "_")));
        download_one(model_id, kind, file, &temp, total_all, done_all, on_progress)?;
        done_all += file.bytes.max(
            std::fs::metadata(&dest)
                .map(|m| m.len())
                .unwrap_or_default(),
        );
    }

    on_progress(DownloadProgress {
        model_id: model_id.to_string(),
        kind: kind.to_string(),
        phase: phase::DONE.to_string(),
        bytes_done: total_all,
        bytes_total: total_all,
        speed_bps: 0,
        eta_s: Some(0),
        file: None,
        message: "Tải xong".to_string(),
    });
    Ok(())
}

fn download_one<F>(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_known_vectors() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_hex(b"The quick brown fox jumps over the lazy dog"),
            "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"
        );
        // 1_000_000 'a' — multi-block + padding edge case
        let many = vec![b'a'; 1_000_000];
        assert_eq!(
            sha256_hex(&many),
            "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
        );
    }

    #[test]
    fn sha256_incremental_matches_one_shot() {
        let data: Vec<u8> = (0..5000u32).map(|i| (i % 251) as u8).collect();
        let mut h = Sha256::new();
        for chunk in data.chunks(97) {
            h.update(chunk);
        }
        assert_eq!(h.hex(), sha256_hex(&data));
    }

    #[test]
    fn cancel_flag_roundtrip() {
        reset_cancel("unit-test-model");
        assert!(!is_cancelled("unit-test-model"));
        cancel("unit-test-model");
        assert!(is_cancelled("unit-test-model"));
        reset_cancel("unit-test-model");
        assert!(!is_cancelled("unit-test-model"));
    }

    #[test]
    fn concurrent_download_of_same_model_is_refused() {
        let dir = std::env::temp_dir().join("sublix-dl-guard-test");
        let spec = ModelFile::new("https://example.invalid/x.bin", "x.bin", 4);
        let id = "guard-test-model";
        // Lượt tải #1 đang chạy ⇒ đã chiếm khoá.
        {
            let mut set = in_progress_slot().lock().unwrap_or_else(|e| e.into_inner());
            set.insert(id.to_string());
        }
        assert!(is_in_progress(id));
        // Lượt tải #2 phải bị từ chối (không được ghi chung file .part).
        let mut sink = |_: DownloadProgress| {};
        let err = download_files(id, KIND_STT, &dir, &[spec], &mut sink)
            .expect_err("phải từ chối tải trùng");
        assert!(format!("{err:#}").contains("đang được tải"));
        // Lượt #2 không được phá khoá của lượt #1.
        assert!(is_in_progress(id), "lượt đang tải phải giữ khoá");
        // Dọn dẹp.
        in_progress_slot()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(id);
        assert!(!is_in_progress(id));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
