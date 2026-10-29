//! TSK-LAB-C3 — **pipeline phân tích** (Bước A của Xưởng AI).
//!
//! Với **mỗi** video nguồn:
//! 1. **Thoại** — xem [`analyze_sources::transcript_for`].
//! 2. **Cảnh** — `probe` (C2) + `cutscene` (C2) ⇒ đoạn có điểm cutscene.
//!    Khoảng phụ đề cứng (v0.14) truyền vào nếu người dùng bật.
//! 3. **Lọc rác** — `junk_filter` (C1) trên câu thoại.
//! 4. **Tóm tắt** — chia thoại thành cụm theo thời gian ⇒ gọi LLM từng cụm ⇒
//!    gộp thành **bảng nhân vật + danh sách chương**.
//!
//! LLM lỗi 1 cụm ⇒ thử lại 1 lần rồi ghi chương "chưa tóm tắt được"
//! (không làm hỏng cả lần chạy).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};

use super::analysis_merge::merge_characters;
use super::analysis_types::{LabAnalysis, LabJunkSegment, LabSource};
use super::analyze_sources::{
    detect_hardsub, file_size_mb, format_clock, lab_data_dir, now_secs, transcript_for,
};
use super::analyze_summary::summarize_all;
use super::cache::{cache_key, ensure_cache_dir, write_cached, CachedSource};
use super::cutscene::{score_scenes, SceneInput, SceneSegment};
use super::junk_filter::{find_junk, JunkOptions};
use super::probe::probe_video_with;
use super::transcript::{to_dialog_lines, TranscriptLine};

#[cfg(test)]
#[path = "analyze_real_tests.rs"]
mod analyze_real_tests;

/// Giai đoạn của lần phân tích (khớp `stage` của sự kiện `lab:progress`).
pub const STAGE_STT: &str = "stt";
pub const STAGE_SCENES: &str = "scenes";
pub const STAGE_JUNK: &str = "junk";
pub const STAGE_SUMMARY: &str = "summary";
pub const STAGE_DONE: &str = "done";
pub const STAGE_ERROR: &str = "error";

/// Mã lỗi huỷ (UI nhận ra để hiện "Đã huỷ" thay vì lỗi).
pub const LAB_CANCELLED: &str = "LAB_CANCELLED";

/// Một video nguồn do UI đưa vào.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabSourceInput {
    /// Đường dẫn video trên đĩa.
    pub path: String,
    /// Tên hiển thị (mặc định = tên file).
    #[serde(default)]
    pub name: Option<String>,
    /// Đường dẫn dự án Studio đã nhận dạng (dùng `segments` có sẵn).
    #[serde(default)]
    pub studio_project: Option<String>,
}

/// Tuỳ chọn phân tích.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabAnalyzeOptions {
    /// Tên game (đưa vào prompt cho LLM).
    #[serde(default)]
    pub game_name: String,
    /// Thể loại game.
    #[serde(default)]
    pub game_genre: String,
    /// Thông tin tra cứu bổ trợ.
    #[serde(default)]
    pub supplementary_context: String,
    /// Thời lượng tối đa của 1 cụm thoại (giây).
    #[serde(default = "default_chunk_secs")]
    pub chunk_secs: f64,
    /// Có dò phụ đề cứng (v0.14) để chấm điểm cutscene chính xác hơn không.
    #[serde(default)]
    pub use_hardsub: bool,
}

fn default_chunk_secs() -> f64 {
    super::transcript::DEFAULT_CHUNK_SECS
}

impl Default for LabAnalyzeOptions {
    fn default() -> Self {
        Self {
            game_name: String::new(),
            game_genre: String::new(),
            supplementary_context: String::new(),
            chunk_secs: default_chunk_secs(),
            use_hardsub: false,
        }
    }
}

/// Tiến trình 1 bước (đóng gói thành sự kiện `lab:progress`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabProgress {
    /// Giai đoạn: `stt` | `scenes` | `junk` | `summary` | `done` | `error`.
    pub stage: String,
    /// Chỉ số video nguồn (0-based).
    pub source_idx: usize,
    /// Phần trăm 0–100.
    pub percent: u32,
    /// Thông điệp hiển thị.
    pub message: String,
}

/// Chạy trọn pipeline phân tích.
pub fn analyze(
    app: Option<&tauri::AppHandle>,
    sources: &[LabSourceInput],
    options: &LabAnalyzeOptions,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(LabProgress),
) -> Result<LabAnalysis, String> {
    let config = match app {
        Some(handle) => crate::config::AppConfig::load(handle),
        None => crate::config::AppConfig::load_or_default(),
    };
    let cache_dir = ensure_cache_dir(&lab_data_dir(app))
        .map_err(|e| format!("Không tạo được thư mục cache: {e}"))?;

    let mut analysis = LabAnalysis::default();
    let mut transcript: Vec<TranscriptLine> = Vec::new();
    let mut scenes: Vec<SceneSegment> = Vec::new();
    let mut junk: Vec<LabJunkSegment> = Vec::new();

    for (source_idx, source) in sources.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            return Err(LAB_CANCELLED.to_string());
        }
        let path = PathBuf::from(&source.path);
        let name = display_name(source);

        // ── 1. Thoại ───────────────────────────────────────────────
        on_progress(LabProgress {
            stage: STAGE_STT.to_string(),
            source_idx,
            percent: 5,
            message: format!("Đang lấy thoại: {name}"),
        });
        let (lines, duration) = transcript_for(app, source, source_idx, &config, cancel)?;

        // ── 2. Cảnh ────────────────────────────────────────────────
        on_progress(LabProgress {
            stage: STAGE_SCENES.to_string(),
            source_idx,
            percent: 25,
            message: format!("Đang đo đặc trưng cảnh: {name}"),
        });
        let hardsub_spans = if options.use_hardsub {
            detect_hardsub(&path)
        } else {
            Vec::new()
        };
        let ffmpeg = crate::dubbing::find_ffmpeg();
        let features = probe_video_with(
            &ffmpeg,
            &path,
            &super::probe::ProbeOptions::default(),
            cancel,
            &mut |_pct| {},
        )
        .map_err(|e| format!("Đo đặc trưng video thất bại: {e:#}"))?;

        let total_secs = if duration > 0.0 { duration } else { features.duration };
        let source_scenes = score_scenes(&SceneInput {
            source_idx,
            duration: total_secs,
            cuts: &features.cuts,
            letterbox: &features.letterbox,
            silence: &features.silence,
            dialogue: &to_dialog_lines(&lines),
            hardsub: &hardsub_spans,
            min_segment_secs: super::cutscene::DEFAULT_MIN_SEGMENT_SECS,
        });
        scenes.extend(source_scenes.iter().cloned());

        // ── 3. Lọc rác ─────────────────────────────────────────────
        on_progress(LabProgress {
            stage: STAGE_JUNK.to_string(),
            source_idx,
            percent: 40,
            message: format!("Đang lọc đoạn rác: {name}"),
        });
        let ranges = find_junk(
            source_idx,
            &to_dialog_lines(&lines),
            total_secs,
            &JunkOptions::default(),
        );
        for (index, range) in ranges.iter().enumerate() {
            junk.push(LabJunkSegment {
                id: index as i64 + 1,
                kind: range
                    .reasons
                    .first()
                    .map(|reason| reason.describe())
                    .unwrap_or_default(),
                source_name: name.clone(),
                time_range: format!(
                    "{} - {}",
                    format_clock(range.start),
                    format_clock(range.end)
                ),
                reason: range
                    .reasons
                    .iter()
                    .map(|reason| reason.describe())
                    .collect::<Vec<_>>()
                    .join(", "),
                restored: false,
            });
        }

        // Ghi cache (thoại + cảnh) ⇒ lần sau khỏi STT/ffmpeg lại.
        let cached = CachedSource {
            saved_at: now_secs(),
            transcript: lines.clone(),
            scenes: source_scenes.clone(),
        };
        if let Err(err) = write_cached(&cache_dir, &cache_key(&path), &cached) {
            tracing::warn!("lab: không ghi được cache cho {name}: {err}");
        }

        analysis.sources.push(LabSource {
            id: format!("s{source_idx}"),
            path: source.path.clone(),
            name,
            duration_sec: total_secs,
            size_mb: file_size_mb(&path),
            fps: 0.0,
            resolution: String::new(),
            has_subtitles: !lines.is_empty(),
            studio_project_name: source.studio_project.clone(),
        });
        transcript.extend(lines.iter().cloned());
    }

    // ── 4. Tóm tắt bằng LLM ───────────────────────────────────────
    let summary = summarize_all(&config, options, &transcript, &scenes, cancel, on_progress)?;
    analysis.characters = merge_characters(&summary.character_batches, &transcript);
    analysis.chapters = summary.chapters;
    analysis.junk = junk;
    analysis.scenes = scenes;
    analysis.transcript = transcript;

    on_progress(LabProgress {
        stage: STAGE_DONE.to_string(),
        source_idx: 0,
        percent: 100,
        message: "Xong".to_string(),
    });
    Ok(analysis)
}

/// Tên hiển thị của 1 nguồn (tên file nếu không có).
fn display_name(source: &LabSourceInput) -> String {
    source
        .name
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            PathBuf::from(&source.path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| source.path.clone())
        })
}
