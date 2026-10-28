//! TSK-LAB-C3 — lệnh Tauri của Xưởng AI: `lab_analyze` / `lab_cancel` /
//! `lab_get_analysis`.
//!
//! - `lab_analyze` chạy **nền** (không chặn vòng lặp sự kiện) và trả về
//!   `run_id` ngay.
//! - Tiến trình: sự kiện **`lab:progress`** `{ runId, stage, sourceIdx, percent, message }`.
//! - Xong: sự kiện **`lab:done`** kèm `LabAnalysis`; lỗi: **`lab:error`**.
//! - `lab_cancel(run_id)` ⇒ dừng lượt đang chạy (đặt cờ huỷ + huỷ tiến trình ffmpeg).
//! - `lab_get_analysis(run_id)` ⇒ lấy kết quả của lượt đã xong (không cần chờ sự kiện).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

use super::analyze::{
    analyze, LabAnalyzeOptions, LabProgress, LabSourceInput, STAGE_ERROR,
};

/// Sự kiện tiến trình.
pub const EVENT_PROGRESS: &str = "lab:progress";
/// Sự kiện xong (kèm `LabAnalysis`).
pub const EVENT_DONE: &str = "lab:done";
/// Sự kiện lỗi.
pub const EVENT_ERROR: &str = "lab:error";

/// Payload sự kiện `lab:progress`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabProgressEvent {
    pub run_id: String,
    pub stage: String,
    pub source_idx: usize,
    pub percent: u32,
    pub message: String,
}

/// Payload sự kiện `lab:done`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabDoneEvent {
    pub run_id: String,
    pub analysis: super::analysis_types::LabAnalysis,
}

/// Payload sự kiện `lab:error`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabErrorEvent {
    pub run_id: String,
    pub message: String,
}

/// Trạng thái 1 lượt phân tích đang chạy / đã xong.
struct RunState {
    cancel: Arc<AtomicBool>,
    analysis: Option<super::analysis_types::LabAnalysis>,
}

/// Bảng các lượt đang chạy / đã xong (key = `run_id`).
static RUNS: OnceLock<Mutex<HashMap<String, RunState>>> = OnceLock::new();

/// Lấy bảng lượt (khởi tạo lần đầu).
fn runs() -> std::sync::MutexGuard<'static, HashMap<String, RunState>> {
    RUNS.get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Sinh `run_id` mới (không cần cấu hình).
fn new_run_id() -> String {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("lab_{stamp}_{}", std::process::id())
}

/// Phân tích video nguồn (chạy nền) ⇒ trả `run_id`.
///
/// Tiến trình qua `lab:progress`, kết quả qua `lab:done`, lỗi qua `lab:error`.
#[tauri::command]
pub async fn lab_analyze(
    app: tauri::AppHandle,
    sources: Vec<LabSourceInput>,
    options: Option<LabAnalyzeOptions>,
) -> Result<String, String> {
    if sources.is_empty() {
        return Err("Chưa chọn video nguồn nào.".to_string());
    }
    let run_id = new_run_id();
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut map = runs();
        map.insert(
            run_id.clone(),
            RunState {
                cancel: Arc::clone(&cancel),
                analysis: None,
            },
        );
    }

    let task_run_id = run_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut emit_progress = |progress: LabProgress| {
            let _ = app.emit(
                EVENT_PROGRESS,
                LabProgressEvent {
                    run_id: task_run_id.clone(),
                    stage: progress.stage,
                    source_idx: progress.source_idx,
                    percent: progress.percent,
                    message: progress.message,
                },
            );
        };
        let options = options.unwrap_or_default();
        let result = analyze(
            Some(&app),
            &sources,
            &options,
            &cancel,
            &mut emit_progress,
        );
        match result {
            Ok(analysis) => {
                {
                    let mut map = runs();
                    if let Some(state) = map.get_mut(&task_run_id) {
                        state.analysis = Some(analysis.clone());
                    }
                }
                let _ = app.emit(
                    EVENT_DONE,
                    LabDoneEvent {
                        run_id: task_run_id.clone(),
                        analysis,
                    },
                );
            }
            Err(message) => {
                let _ = app.emit(
                    EVENT_ERROR,
                    LabErrorEvent {
                        run_id: task_run_id.clone(),
                        message: message.clone(),
                    },
                );
                tracing::warn!("lab: phân tích lỗi ({message})");
            }
        }
    });

    Ok(run_id)
}

/// Huỷ lượt phân tích đang chạy.
#[tauri::command]
pub fn lab_cancel(run_id: String) {
    let map = runs();
    if let Some(state) = map.get(&run_id) {
        state.cancel.store(true, Ordering::SeqCst);
        tracing::info!("lab: yêu cầu huỷ lượt {run_id}");
    }
}

/// Lấy kết quả của lượt đã xong (`None` nếu chưa xong).
#[tauri::command]
pub fn lab_get_analysis(run_id: String) -> Option<super::analysis_types::LabAnalysis> {
    let map = runs();
    map.get(&run_id).and_then(|state| state.analysis.clone())
}

/// Xoá 1 lượt khỏi bảng (UI gọi sau khi đã lấy kết quả).
#[tauri::command]
pub fn lab_forget_analysis(run_id: String) {
    let mut map = runs();
    map.remove(&run_id);
}

/// Giai đoạn lỗi (dùng cho log + test).
pub const STAGE_ERROR_CODE: &str = STAGE_ERROR;

/// Bảo đảm `tauri::Manager` được dùng (cần cho `app.path()`).
#[allow(dead_code)]
fn _assert_manager(app: &tauri::AppHandle) {
    let _ = app.path();
}
