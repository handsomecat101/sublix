//! Lệnh Tauri cho dò phụ đề cứng (đăng ký trong `lib.rs` → `generate_handler!`).
//!
//! Sự kiện: `hardsub:progress` `{percent, message, run_id?}` (`run_id` chỉ có khi frontend truyền,
//! cùng kiểu `translate:progress`) và `model:download-progress` khi tải model (`model_id` =
//! [`model::MODEL_ID`]). Lỗi trả về dạng `"<MÃ>: <thông điệp>"` (mã ở `detect::ERR_*`).

use super::band::Region;
use super::detect::{self, HardsubDetection};
use super::model;
use crate::model_download;
use serde::Serialize;
use std::path::Path;
use tauri::Emitter;

/// Tên sự kiện tiến trình dò.
pub const PROGRESS_EVENT: &str = "hardsub:progress";

/// Trạng thái để UI chọn 1 trong các thẻ (thiếu model / thiếu thư viện / sẵn sàng).
#[derive(Debug, Clone, Serialize)]
pub struct HardsubModelStatus {
    pub model_installed: bool,
    pub model_bytes: u64,
    pub deps_ready: bool,
}

/// `"bottom"` (mặc định) | `"top"` | `"any"`.
pub fn parse_region(s: Option<&str>) -> Region {
    match s.map(|v| v.trim().to_lowercase()).as_deref() {
        Some("top") => Region::Top,
        Some("any") | Some("all") => Region::Any,
        _ => Region::Bottom,
    }
}

/// Payload `hardsub:progress`; `run_id` chỉ xuất hiện khi có.
pub fn progress_payload(percent: u32, message: &str, run_id: Option<&str>) -> serde_json::Value {
    let mut p = serde_json::json!({ "percent": percent, "message": message });
    if let Some(r) = run_id {
        p["run_id"] = serde_json::Value::String(r.to_string());
    }
    p
}

/// Dò phụ đề cứng trên video. `region`: `bottom`/`top`/`any`. `fps`: khung/giây (mặc định 1).
#[tauri::command]
pub async fn hardsub_detect(
    app: tauri::AppHandle,
    file_path: String,
    region: Option<String>,
    run_id: Option<String>,
    fps: Option<f64>,
) -> Result<HardsubDetection, String> {
    let region = parse_region(region.as_deref());
    tokio::task::spawn_blocking(move || {
        let mut emit = |percent: u32, message: &str| {
            let _ = app.emit(PROGRESS_EVENT, progress_payload(percent, message, run_id.as_deref()));
        };
        detect::detect(Path::new(&file_path), region, fps.unwrap_or(1.0), &mut emit).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Huỷ lượt dò đang chạy.
#[tauri::command]
pub fn hardsub_cancel() {
    detect::cancel();
}

/// Model + thư viện Python đã sẵn sàng chưa.
#[tauri::command]
pub async fn hardsub_model_status() -> Result<HardsubModelStatus, String> {
    tokio::task::spawn_blocking(|| HardsubModelStatus {
        model_installed: model::is_installed(),
        model_bytes: model::BYTES,
        deps_ready: crate::dubbing::tts_common::python_has_modules(&["onnxruntime", "numpy"]),
    })
    .await
    .map_err(|e| e.to_string())
}

/// Tải model dò chữ (4 MB) — phát `model:download-progress`.
#[tauri::command]
pub async fn hardsub_model_download(app: tauri::AppHandle) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut emit = |p: model_download::DownloadProgress| {
            let _ = app.emit(model_download::EVENT, &p);
        };
        model::download(&mut emit).map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Cài onnxruntime + numpy cho Python (khi `deps_ready = false`).
#[tauri::command]
pub async fn hardsub_install_deps() -> Result<(), String> {
    tokio::task::spawn_blocking(|| detect::install_deps(&mut |_| {}).map_err(|e| format!("{e:#}")))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn region_defaults_to_bottom() {
        assert_eq!(parse_region(None), Region::Bottom);
        assert_eq!(parse_region(Some("TOP")), Region::Top);
        assert_eq!(parse_region(Some(" any ")), Region::Any);
        assert_eq!(parse_region(Some("???")), Region::Bottom);
    }

    #[test]
    fn progress_payload_echoes_run_id_only_when_given() {
        assert!(progress_payload(5, "x", None).get("run_id").is_none());
        assert_eq!(progress_payload(5, "x", Some("r1"))["run_id"], "r1");
    }
}
