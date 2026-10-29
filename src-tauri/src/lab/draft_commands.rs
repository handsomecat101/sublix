//! TSK-LAB-C4 — lệnh Tauri cho bước B (viết lời bình) và bước C (dựng nháp).
//!
//! | Lệnh | Việc |
//! |---|---|
//! | `lab_write_narration(run_id, options)` | LLM viết lời bình theo chương ⇒ đoạn 1–3 câu |
//! | `lab_rewrite_segment(text, mode, hint)` | viết lại 1 đoạn (ô "Viết lại đoạn") |
//! | `lab_build_draft(run_id, segments, options)` | dựng video nháp **chạy nền**, trả `run_id` |
//! | `lab_cancel_draft(run_id)` | huỷ lượt dựng (TTS/ffmpeg đều dừng) |
//!
//! Sự kiện: `lab:progress` (`stage` = `tts` | `match` | `render` | `done`),
//! `lab:draft-done` (`DraftDoneEvent`), `lab:error` (dùng chung với C3).
//!
//! Luồng dựng nằm ở [`super::draft_build`] (gọi được từ test thật, không cần `AppHandle`).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::Emitter;

use super::analysis_types::LabAnalysis;
use super::draft::DraftOptions;
use super::draft_build::{build_draft_in, BuildDraftResult};
use super::narration::{rewrite_segment, NarrationOptions, RewriteMode};
use super::narration_write::{write_narration, NarrationResult};

/// Sự kiện tiến trình (dùng chung với C3 — phân biệt bằng `stage`).
pub const EVENT_PROGRESS: &str = "lab:progress";
/// Sự kiện xong **dựng nháp** (payload khác `lab:done` của C3).
pub const EVENT_DONE: &str = "lab:draft-done";
/// Sự kiện lỗi.
pub const EVENT_ERROR: &str = "lab:error";

/// Payload sự kiện `lab:draft-done`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftDoneEvent {
    pub run_id: String,
    pub result: BuildDraftResult,
}

/// Trạng thái 1 lượt dựng đang chạy.
struct DraftRun {
    cancel: Arc<AtomicBool>,
}

/// Bảng các lượt dựng đang chạy (xoá khi xong để không phình).
static DRAFT_RUNS: OnceLock<Mutex<std::collections::HashMap<String, DraftRun>>> = OnceLock::new();

fn draft_runs() -> std::sync::MutexGuard<'static, std::collections::HashMap<String, DraftRun>> {
    DRAFT_RUNS
        .get_or_init(|| Mutex::new(std::collections::HashMap::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn new_run_id() -> String {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("lab_draft_{stamp}_{}", std::process::id())
}

/// Lấy kết quả phân tích (C3) của 1 `run_id`.
pub fn get_analysis(run_id: &str) -> Option<LabAnalysis> {
    super::commands::lab_get_analysis(run_id.to_string())
}

// ───────────────────────────── Bước B ─────────────────────────────

/// Viết lời bình cho từng chương của lần phân tích (C3) ⇒ danh sách đoạn.
#[tauri::command]
pub async fn lab_write_narration(
    app: tauri::AppHandle,
    run_id: String,
    options: Option<NarrationOptions>,
) -> Result<NarrationResult, String> {
    let analysis = get_analysis(&run_id).ok_or_else(|| {
        "Chưa có kết quả phân tích cho lượt này (hãy chạy phân tích trước).".to_string()
    })?;
    let options = options.unwrap_or_default();
    let config = crate::config::AppConfig::load(&app);

    tokio::task::spawn_blocking(move || write_narration(&config, &analysis, &options))
        .await
        .map_err(|err| format!("Tác vụ viết lời bình lỗi: {err}"))?
}

/// Viết lại 1 đoạn lời bình (ô "Viết lại đoạn" của UI).
#[tauri::command]
pub async fn lab_rewrite_segment(
    app: tauri::AppHandle,
    text: String,
    mode: RewriteMode,
    hint: Option<String>,
) -> Result<String, String> {
    let config = crate::config::AppConfig::load(&app);
    let hint = hint.unwrap_or_default();
    tokio::task::spawn_blocking(move || rewrite_segment(&config, &text, mode, &hint))
        .await
        .map_err(|err| format!("Tác vụ viết lại lỗi: {err}"))?
}

// ───────────────────────────── Bước C ─────────────────────────────

/// Dựng video nháp (chạy nền) ⇒ trả `run_id`; kết quả qua `lab:draft-done`.
#[tauri::command]
pub async fn lab_build_draft(
    app: tauri::AppHandle,
    run_id: String,
    segments: Vec<super::recap_script::RecapItem>,
    options: Option<DraftOptions>,
) -> Result<String, String> {
    let analysis = get_analysis(&run_id)
        .ok_or_else(|| "Chưa có kết quả phân tích cho lượt này.".to_string())?;
    if segments.is_empty() {
        return Err("Chưa có đoạn lời bình nào để dựng.".to_string());
    }
    let options = options.unwrap_or_default();
    let draft_run_id = new_run_id();
    let cancel = Arc::new(AtomicBool::new(false));
    draft_runs().insert(
        draft_run_id.clone(),
        DraftRun {
            cancel: Arc::clone(&cancel),
        },
    );

    let task_run_id = draft_run_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let work_dir = work_dir(&app, &options, &task_run_id);
        let mut emit = |stage: &str, percent: u32, message: String| {
            let _ = app.emit(
                EVENT_PROGRESS,
                super::commands::LabProgressEvent {
                    run_id: task_run_id.clone(),
                    stage: stage.to_string(),
                    source_idx: 0,
                    percent,
                    message,
                },
            );
        };
        let result = build_draft_in(
            &work_dir,
            &analysis,
            &segments,
            &options,
            &cancel,
            &mut emit,
        );
        match result {
            Ok(value) => {
                let _ = app.emit(
                    EVENT_DONE,
                    DraftDoneEvent {
                        run_id: task_run_id.clone(),
                        result: value,
                    },
                );
            }
            Err(message) => {
                let _ = app.emit(
                    EVENT_ERROR,
                    super::commands::LabErrorEvent {
                        run_id: task_run_id.clone(),
                        message: message.clone(),
                    },
                );
                tracing::warn!("lab: dựng nháp lỗi ({message})");
            }
        }
        draft_runs().remove(&task_run_id);
    });

    Ok(draft_run_id)
}

/// Huỷ lượt dựng nháp đang chạy.
#[tauri::command]
pub fn lab_cancel_draft(run_id: String) {
    let map = draft_runs();
    if let Some(state) = map.get(&run_id) {
        state.cancel.store(true, Ordering::SeqCst);
        tracing::info!("lab: yêu cầu huỷ dựng nháp {run_id}");
    }
}

/// Đọc lại dự án Studio đã lưu của video nháp (UI mở tab Studio với dự án này,
/// **không** phải chạy lại nhận dạng thoại trên video nháp).
#[tauri::command]
pub fn lab_load_draft_project(
    draft_path: String,
) -> Result<crate::dubbing::DubbingProject, String> {
    let project_path = super::to_studio::project_path_for(std::path::Path::new(&draft_path));
    let text = std::fs::read_to_string(&project_path)
        .map_err(|err| format!("Không đọc được dự án nháp ({}): {err}", project_path.display()))?;
    serde_json::from_str(&text).map_err(|err| format!("Dự án nháp hỏng: {err}"))
}

/// Thư mục làm việc: ưu tiên `options.work_dir`, mặc định `<dữ liệu app>/lab-drafts/<run>`.
fn work_dir(app: &tauri::AppHandle, options: &DraftOptions, run_id: &str) -> PathBuf {
    if let Some(custom) = options.work_dir.as_ref().map(PathBuf::from) {
        return custom;
    }
    super::analyze_sources::lab_data_dir(Some(app))
        .join("lab-drafts")
        .join(run_id)
}
