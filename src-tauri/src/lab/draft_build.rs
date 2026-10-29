//! TSK-LAB-C4 — **luồng dựng video nháp**: TTS thật → `allocate` → timeline → ffmpeg → Studio.
//!
//! Tách khỏi `draft_commands.rs` (lệnh Tauri) để mỗi file < 300 dòng và để **test thật**
//! gọi được mà không cần `AppHandle`: [`build_draft_in`] chỉ cần thư mục làm việc + hàm
//! phát tiến trình.
//!
//! Thứ tự (khớp đặc tả C4):
//! 1. `tts` — đọc từng câu lời bình bằng voice người dùng chọn, **đo thời lượng thật**.
//! 2. `match` — `allocate` (C1) + tự sửa vi phạm không cần chữ.
//! 3. `render` — ffmpeg cắt/nối, nền game hạ còn 25 % dưới giọng, **huỷ được**.
//! 4. Ghi dự án Studio (JSON) cạnh video nháp.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::analysis_types::LabAnalysis;
use super::analyze::LAB_CANCELLED;
use super::draft::{build_timeline, DraftOptions, DraftSegment};
use super::draft_plan::plan_draft;
use super::draft_render::{build_draft_plan, RenderInput, RenderPlan, DEFAULT_BED_VOLUME};
use super::draft_tts::synthesize_items;
use super::recap_script::RecapItem;
use super::to_studio::{save_studio_project, to_studio_project};

/// Giai đoạn của bước C (dùng trong `lab:progress.stage`).
pub const STAGE_TTS: &str = "tts";
pub const STAGE_MATCH: &str = "match";
pub const STAGE_RENDER: &str = "render";
pub const STAGE_DONE: &str = "done";

/// Kết quả bước C (payload `lab:draft-done`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildDraftResult {
    /// Các mục đã dựng.
    pub items: Vec<RecapItem>,
    /// Tổng thời lượng video nháp (giây).
    pub total_sec: f64,
    /// Đã qua hết luật dựng chưa.
    pub rules_passed: bool,
    /// Số vi phạm còn lại (cần người dùng sửa lời).
    pub warnings_count: u32,
    /// Câu chưa tìm được cảnh.
    pub unplaced: Vec<String>,
    /// Ghi chú tự sửa (bỏ đoạn thoại gốc…).
    pub notes: Vec<String>,
    /// Đường dẫn video nháp.
    pub draft_path: String,
    /// Đường dẫn dự án Studio (JSON) — UI mở tab Studio bằng `draft_path`.
    pub studio_project_path: String,
}

/// Hàm phát tiến trình: `(stage, percent, message)`.
pub type EmitStage<'a> = &'a mut dyn FnMut(&str, u32, String);

/// Dựng video nháp trong `work_dir` (không cần `AppHandle` — dùng cho cả lệnh Tauri và test thật).
pub fn build_draft_in(
    work_dir: &Path,
    analysis: &LabAnalysis,
    segments: &[RecapItem],
    options: &DraftOptions,
    cancel: &AtomicBool,
    emit: EmitStage<'_>,
) -> Result<BuildDraftResult, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err(LAB_CANCELLED.to_string());
    }
    std::fs::create_dir_all(work_dir).map_err(|err| format!("tạo thư mục làm việc: {err}"))?;

    // ── a. TTS từng câu lời bình (đo thời lượng thật) ──
    emit(STAGE_TTS, 5, "Đang đọc lời bình…".to_string());
    let (items, tts_files) = synthesize_items(
        segments,
        &options.voice,
        &options.rate,
        &options.pitch,
        work_dir,
        &mut |done, total| {
            emit(
                STAGE_TTS,
                5 + 35 * done / total.max(1),
                format!("Đang đọc câu {done}/{total}…"),
            );
        },
    )?;
    if cancel.load(Ordering::SeqCst) {
        return Err(LAB_CANCELLED.to_string());
    }

    // ── b. Khớp cảnh (allocate + tự sửa vi phạm) ──
    emit(STAGE_MATCH, 45, "Đang khớp cảnh với lời bình…".to_string());
    let plan = plan_draft(analysis, &items, options);
    if plan.script.items.is_empty() {
        return Err("Không ghép được cảnh nào cho lời bình — hãy kiểm tra video nguồn.".to_string());
    }
    if cancel.load(Ordering::SeqCst) {
        return Err(LAB_CANCELLED.to_string());
    }

    let draft_segments: Vec<DraftSegment> = plan
        .script
        .items
        .iter()
        .map(|item| DraftSegment {
            item: item.clone(),
            tts_path: tts_files
                .iter()
                .find(|(id, _)| *id == item.id)
                .map(|(_, path)| path.clone()),
            clips: vec![(item.source_idx, item.start, item.end)],
            timeline_start: 0.0,
        })
        .collect();
    let timeline = build_timeline(&draft_segments);

    // ── c. Render ffmpeg (huỷ được) ──
    emit(STAGE_RENDER, 60, "Đang dựng video nháp…".to_string());
    let sources: Vec<PathBuf> = analysis
        .sources
        .iter()
        .map(|source| PathBuf::from(&source.path))
        .collect();
    let render_plan = build_draft_plan(
        &RenderInput {
            segments: &timeline,
            sources: &sources,
            tts_files: &tts_files,
            bed_volume: DEFAULT_BED_VOLUME,
        },
        &work_dir.join("draft.mp4"),
    );
    run_ffmpeg(&render_plan, cancel, &work_dir.join("ffmpeg-draft.log"))?;

    // ── d. Dự án Studio ──
    let total_sec = super::draft::timeline_total(&timeline);
    let project = to_studio_project(&render_plan.output, &timeline, total_sec, &options.voice);
    let project_path = save_studio_project(&project, &render_plan.output)?;

    emit(STAGE_DONE, 100, "Xong".to_string());
    Ok(BuildDraftResult {
        items: timeline.iter().map(|segment| segment.item.clone()).collect(),
        total_sec,
        rules_passed: plan.violations.is_empty(),
        warnings_count: plan.violations.len() as u32,
        unplaced: plan.unplaced,
        notes: plan.notes,
        draft_path: render_plan.output.to_string_lossy().to_string(),
        studio_project_path: project_path.to_string_lossy().to_string(),
    })
}

/// Chạy ffmpeg dựng nháp; **huỷ được** (giết cả cây tiến trình, độ trễ ~150 ms).
fn run_ffmpeg(plan: &RenderPlan, cancel: &AtomicBool, log_path: &Path) -> Result<(), String> {
    let log = std::fs::File::create(log_path).map_err(|err| format!("tạo log ffmpeg: {err}"))?;
    let mut command = Command::new(crate::dubbing::find_ffmpeg());
    command.arg("-y");
    for input in &plan.inputs {
        command.arg("-i").arg(input);
    }
    command
        .arg("-filter_complex")
        .arg(&plan.filter_complex)
        .arg("-map")
        .arg(format!("[{}]", super::draft_render::VIDEO_OUT))
        .arg("-map")
        .arg(format!("[{}]", super::draft_render::AUDIO_OUT))
        .arg(&plan.output)
        .stdout(Stdio::null())
        .stderr(Stdio::from(log));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command
        .spawn()
        .map_err(|err| format!("không chạy được ffmpeg: {err}"))?;

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if status.success() {
                    return Ok(());
                }
                let tail = std::fs::read_to_string(log_path).unwrap_or_default();
                let tail: Vec<&str> = tail.lines().rev().take(4).collect();
                return Err(format!(
                    "ffmpeg dựng video nháp thất bại (mã {:?}): {}",
                    status.code(),
                    tail.into_iter().rev().collect::<Vec<_>>().join(" | ")
                ));
            }
            Ok(None) => {
                if cancel.load(Ordering::SeqCst) {
                    crate::proc_kill::kill_pid_tree(child.id());
                    let _ = child.wait();
                    return Err(LAB_CANCELLED.to_string());
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(err) => return Err(format!("không đợi được ffmpeg: {err}")),
        }
    }
}

#[cfg(test)]
#[path = "draft_build_tests.rs"]
mod draft_build_tests;

#[cfg(test)]
#[path = "draft_real_tests.rs"]
mod draft_real_tests;
