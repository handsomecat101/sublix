//! TSK-FEAT-VOICE-SAMPLE-CACHE — phần **tạo mẫu nền** (tách riêng để mỗi module
//! < 300 dòng, theo quy tắc của AGENTS.md).
//!
//! - Chạy nền, **ưu tiên thấp**: tuần tự, nghỉ giữa các mẫu.
//! - **Huỷ được** qua `cancel_prepare()`.
//! - Phát sự kiện `voice:sample_progress {engine, model_id, voice_id, index, total, done, error}`.
//! - Tự chạy **1 lần** cho engine khi app rảnh (KHÔNG chạy khi đang lồng tiếng/dịch).

use super::super::kokoro_available;
use super::{
    bare_voice, engine_available, model_folder, sample_path_in, samples_dir, status,
    synthesize_sample, voices_of, ENGINE_KOKORO, SAMPLE_PHRASE,
};
use anyhow::Result;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tracing::info;

/// Nghỉ giữa 2 mẫu khi tạo nền (ưu tiên thấp — không giành CPU của app).
const PREPARE_PAUSE_MS: u64 = 150;

/// Cờ huỷ lượt tạo mẫu nền đang chạy.
static PREPARE_CANCEL: AtomicBool = AtomicBool::new(false);

/// Huỷ lượt tạo mẫu nền đang chạy.
pub fn cancel_prepare() {
    PREPARE_CANCEL.store(true, Ordering::SeqCst);
    info!("Đã yêu cầu huỷ tạo mẫu nền.");
}

/// App có đang bận (lồng tiếng / dịch / TTS nền) không?
pub fn app_is_busy() -> bool {
    crate::file_sub::is_running() || super::super::ACTIVE_CHILD_PID.load(Ordering::Relaxed) != 0
}

/// Các engine offline đã cài đủ model (để tạo mẫu nền).
fn installed_engines() -> Vec<String> {
    let mut engines = Vec::new();
    for engine in ["kokoro", "vieneu", "zerotts"] {
        if engine_available(engine) {
            engines.push(engine.to_string());
        }
    }
    engines
}

/// Engine đã từng bắt đầu tạo mẫu nền trong phiên này (tự chạy 1 lần).
fn prepare_started() -> &'static Mutex<Vec<String>> {
    static STARTED: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
    STARTED.get_or_init(|| Mutex::new(Vec::new()))
}

/// Phát sự kiện tiến trình (giữ `model_id` cho listener cũ + `engine` cho mới).
fn emit_progress(
    app: &AppHandle,
    engine: &str,
    voice_id: &str,
    index: usize,
    total: usize,
    error: Option<String>,
) {
    let _ = app.emit(
        "voice:sample_progress",
        serde_json::json!({
            "engine": engine,
            "model_id": model_folder(engine),
            "voice_id": bare_voice(voice_id),
            "index": index,
            "total": total,
            "done": error.is_none(),
            "error": error,
        }),
    );
}

/// Vòng lặp tạo mẫu nền: tuần tự, nghỉ ngắn, huỷ được.
fn prepare_loop(app: &AppHandle, engines: Vec<String>) {
    for engine in engines {
        let voices = voices_of(&engine);
        let total = voices.len();
        for (idx, voice_id) in voices.iter().enumerate() {
            if PREPARE_CANCEL.load(Ordering::SeqCst) {
                info!("Đã huỷ tạo mẫu nền.");
                return;
            }
            let error = synthesize_sample(&engine, voice_id, SAMPLE_PHRASE)
                .err()
                .map(|e| format!("{e:#}"));
            emit_progress(app, &engine, voice_id, idx + 1, total, error);
            std::thread::sleep(Duration::from_millis(PREPARE_PAUSE_MS));
        }
    }
}

/// Tạo mẫu nền (fire & forget). Trả về số giọng sẽ tạo.
pub fn spawn_prepare(app: AppHandle, engine: Option<&str>) -> Result<u32> {
    PREPARE_CANCEL.store(false, Ordering::SeqCst);
    let engines = match engine {
        Some(e) => vec![e.to_string()],
        None => installed_engines(),
    };
    let count: u32 = engines.iter().map(|e| voices_of(e).len() as u32).sum();
    {
        let mut started = prepare_started().lock().unwrap_or_else(|e| e.into_inner());
        for e in &engines {
            if !started.iter().any(|x| x == e) {
                started.push(e.clone());
            }
        }
    }
    std::thread::spawn(move || prepare_loop(&app, engines));
    Ok(count)
}

/// Tự tạo mẫu nền 1 lần cho engine khi app rảnh (KHÔNG chạy khi đang
/// lồng tiếng/dịch). Cloud thì không tạo trước (tốn tiền API).
pub fn maybe_auto_prepare(app: &AppHandle, engine: &str) {
    if engine == "cloud" || app_is_busy() {
        return;
    }
    {
        let started = prepare_started().lock().unwrap_or_else(|e| e.into_inner());
        if started.iter().any(|x| x == engine) {
            return;
        }
    }
    if !engine_available(engine) {
        return;
    }
    let st = status(engine);
    if st.ready >= st.total {
        return;
    }
    if let Ok(n) = spawn_prepare(app.clone(), Some(engine)) {
        info!("Tự tạo mẫu nền cho engine {engine} ({n} giọng).");
    }
}

/// Tạo mẫu nghe thử cho toàn bộ giọng Kokoro (tương thích lệnh cũ).
pub fn generate_kokoro_samples(app: &AppHandle) -> Result<u32> {
    if !kokoro_available() {
        anyhow::bail!(
            "Chưa tải model Kokoro-Vietnamese — vào panel 🎛 Chọn Giọng & Tải Model để tải trước."
        );
    }
    let dir = samples_dir(ENGINE_KOKORO);
    let voices = voices_of(ENGINE_KOKORO);
    let total = voices.len();
    let mut generated = 0u32;
    for (idx, voice_id) in voices.iter().enumerate() {
        let path = sample_path_in(&dir, voice_id, "wav");
        let existed = path.exists() && !super::sample_is_broken(&path);
        let error = synthesize_sample(ENGINE_KOKORO, voice_id, SAMPLE_PHRASE)
            .err()
            .map(|e| format!("{e:#}"));
        if error.is_none() && !existed {
            generated += 1;
        }
        emit_progress(app, ENGINE_KOKORO, voice_id, idx + 1, total, error);
    }
    Ok(generated)
}
