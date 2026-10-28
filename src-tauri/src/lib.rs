// Sublix v0.6.0 — Tauri v2 + Rust backend
//
// Features:
// - Continuous WASAPI loopback audio capture + Smart VAD
// - GPU-accelerated Whisper Large-v3-Turbo (`whisper-server`) with hot-swap
// - GPU-accelerated Local LLM Translation (`llama-server` + Qwen3 / Gemma 3) with 2-line context memory
// - Frameless, always-on-top, customizable & click-through Overlay window

use serde::Serialize;
use tauri::{Emitter, Manager};
use tracing::{info, warn};

pub mod audio;
pub mod config;
pub mod discovery;
pub mod downloader;
pub mod dubbing;
pub mod file_sub;
pub mod hardsub;
pub mod model_download;
pub mod overlay;
pub mod proc_kill;
pub mod stt;
pub mod subtitles;
pub mod translate;
pub mod voice_models;

use audio::{
    capture_to_wav, is_live_running, list_render_devices, start_live_capture, stop_live_capture,
    AudioDevice, AudioFormat,
};
use stt::{ModelVariant, TranscriptionResult};
use translate::TranslationModelVariant;

#[allow(unused_imports)]
use wasapi::Direction;

#[tauri::command]
fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    list_render_devices().map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn capture_test(
    output_path: String,
    duration_secs: u32,
    device_index: Option<usize>,
) -> Result<AudioFormat, String> {
    capture_to_wav(&output_path, duration_secs, device_index).map_err(|e| format!("{e:#}"))
}

/// Nhận dạng thử (BUG-010): phần nặng chạy trên thread riêng để KHÔNG chặn
/// luồng chính của WebView (UI đơ cứng 60–90 s trước đây).
///
/// Tên lệnh, tham số và kiểu trả về **không đổi** ⇒ frontend không cần sửa.
#[tauri::command]
async fn transcribe_test(
    app: tauri::AppHandle,
    wav_path: String,
    language: Option<String>,
    model_name: Option<String>,
) -> Result<TranscriptionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let variant = model_name
            .as_deref()
            .and_then(ModelVariant::from_name)
            .filter(|v| stt::has_stt_model(*v))
            .or_else(ModelVariant::best_installed)
            .unwrap_or(ModelVariant::LargeV3TurboQ8);

        let cfg = config::AppConfig::load(&app);
        let pref = stt::EnginePreference::from_str(&cfg.stt_engine_preference);

        match stt::transcribe_via_server(&wav_path, language.as_deref(), variant, pref) {
            Ok(r) => Ok(r),
            Err(e) => {
                warn!(
                    "whisper-server unavailable ({}), falling back to subprocess",
                    e
                );
                let whisper =
                    stt::whisper_local::WhisperLocal::new(variant).map_err(|e| format!("{e:#}"))?;
                whisper
                    .transcribe(&wav_path, language.as_deref())
                    .map_err(|e| format!("{e:#}"))
            }
        }
    })
    .await
    .map_err(|e| format!("{e}"))?
}

/// One-shot test translation from the UI (BUG-010: chạy ngoài luồng chính).
#[tauri::command]
async fn translate_test(
    app: tauri::AppHandle,
    text: String,
    source_lang: String,
    target_lang: String,
    model_name: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cfg = config::AppConfig::load(&app);
        let variant = TranslationModelVariant::resolve_or_best(
            model_name
                .as_deref()
                .or(Some(cfg.translation_model.as_str())),
        );
        let pref = stt::EnginePreference::from_str(&cfg.translation_engine_preference);
        translate::translate_text_with_config(
            &text, &source_lang, &target_lang, variant, pref, &cfg,
        )
        .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| format!("{e}"))?
}

#[tauri::command]
async fn translate_batch(
    app: tauri::AppHandle,
    texts: Vec<String>,
    source_lang: String,
    target_lang: String,
    model_name: Option<String>,
    project_path: Option<String>,
) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let mut cfg = config::AppConfig::load(&app);
        // Bảng glossary đã duyệt (file dự án → fallback config toàn cục).
        // Đường dịch cũ nhận glossary dạng `Vec<String>` → gộp quy tắc đã duyệt vào đó.
        let g = translate::glossary_store::resolve(project_path.as_deref(), &cfg);
        if !g.is_empty() {
            cfg.glossary.extend(g.to_rules());
            cfg.glossary_table = Some(g);
        }
        let variant = TranslationModelVariant::resolve_or_best(
            model_name
                .as_deref()
                .or(Some(cfg.translation_model.as_str())),
        );
        let pref = stt::EnginePreference::from_str(&cfg.translation_engine_preference);
        Ok(translate::translate_batch_with_config(
            &texts,
            &source_lang,
            &target_lang,
            variant,
            pref,
            &cfg,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Dịch kịch bản **theo ngữ cảnh** (TSK-FEAT-CONTEXT-TRANSLATE).
///
/// 2 lượt: (1) LLM đọc hiểu toàn bộ lời thoại → bản tham chiếu {tóm tắt, nhân vật,
/// xưng hô, thuật ngữ, giọng điệu}; (2) dịch từng lô ~20 câu với bản tham chiếu,
/// `[speaker]` trên từng dòng, 5 câu liền trước và hạn mức độ dài theo thời lượng.
///
/// Phát sự kiện tiến trình: `translate:progress` → `{done, total, phase}`.
///
/// `project_path` (tuỳ chọn): dùng để tìm bảng glossary **theo dự án**
/// (`<project>.sublix-glossary.json`). Có bảng đã duyệt ⇒ dùng làm ràng buộc CỨNG.
///
/// `run_id` (tuỳ chọn): định danh lượt chạy — backend **echo** lại trong payload
/// `translate:progress` để listener lọc đúng tab (xem `docs/STUDIO_TABS_PLAN.md` §3.3).
/// Không truyền ⇒ payload giống hệt bản cũ.
#[tauri::command]
async fn translate_script_contextual(
    app: tauri::AppHandle,
    lines: Vec<translate::contextual::ScriptLine>,
    source_lang: String,
    target_lang: String,
    project_path: Option<String>,
    run_id: Option<String>,
) -> Result<Vec<translate::contextual::ContextualLine>, String> {
    let emit_app = app.clone();
    tokio::task::spawn_blocking(move || {
        let mut cfg = config::AppConfig::load(&app);
        // Bảng glossary đã duyệt (file dự án → fallback config toàn cục).
        let g = translate::glossary_store::resolve(project_path.as_deref(), &cfg);
        if !g.is_empty() {
            cfg.glossary_table = Some(g);
        }
        let mut progress = |done: u32, total: u32, phase: &str| {
            let _ = emit_app.emit(
                "translate:progress",
                translate_progress_payload(done, total, phase, run_id.as_deref()),
            );
        };
        Ok(translate::contextual_run::translate_script_contextual(
            &lines,
            &source_lang,
            &target_lang,
            &cfg,
            &mut progress,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Payload sự kiện `translate:progress`.
///
/// `run_id` **chỉ** xuất hiện khi frontend truyền vào ⇒ không ai truyền thì payload
/// y hệt bản cũ (tương thích ngược cho `DubbingStudioView` / `FileSubView`).
fn translate_progress_payload(
    done: u32,
    total: u32,
    phase: &str,
    run_id: Option<&str>,
) -> serde_json::Value {
    let mut payload = serde_json::json!({ "done": done, "total": total, "phase": phase });
    if let Some(rid) = run_id {
        payload["run_id"] = serde_json::Value::String(rid.to_string());
    }
    payload
}

/// Đọc các lựa chọn dịch hiện tại + danh sách model (nút chọn nhanh, Ollama, GGUF).
///
/// `supports_reasoning` = provider/model có nhận tham số mức độ suy luận hay không.
#[tauri::command]
async fn translate_options_get(app: tauri::AppHandle) -> Result<translate::TranslateOptions, String> {
    let cfg = config::AppConfig::load(&app);
    let url = if cfg.ollama_url.trim().is_empty() {
        "http://localhost:11434".to_string()
    } else {
        cfg.ollama_url.trim().to_string()
    };
    // Blocking HTTP -> off main thread de khong treo UI.
    let ollama = tauri::async_runtime::spawn_blocking(move || {
        translate::server::list_ollama_models(&url)
            .unwrap_or_default()
            .into_iter()
            .map(|m| m.name)
            .collect::<Vec<String>>()
    })
    .await
    .unwrap_or_default();
    Ok(translate::translate_options(&cfg, &ollama))
}

/// Ghi lựa chọn dịch (chỉ field được truyền — **không** đụng tới API key).
///
/// Config được **đọc từ đĩa** rồi chỉ sửa field tương ứng, nên key không bao giờ bị mất.
/// Lưu atomic (BUG-013) + emit `config:updated`.
#[tauri::command]
fn translate_options_set(
    app: tauri::AppHandle,
    provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
) -> Result<config::AppConfig, String> {
    let mut cfg = config::AppConfig::load(&app);
    translate::apply_translate_options(
        &mut cfg,
        provider.as_deref(),
        model.as_deref(),
        reasoning_effort.as_deref(),
    );
    cfg.save(&app).map_err(|e| format!("{e:#}"))?;
    let _ = app.emit("config:updated", &cfg);
    Ok(cfg)
}

/// Đọc bảng thuật ngữ + xưng hô đã duyệt.
///
/// - Có `project_path` → đọc file `<project>.sublix-glossary.json` nếu tồn tại.
/// - Không (hoặc file chưa có) → đọc bảng toàn cục trong config app.
#[tauri::command]
fn glossary_get(
    app: tauri::AppHandle,
    project_path: Option<String>,
) -> Result<translate::Glossary, String> {
    let cfg = config::AppConfig::load(&app);
    Ok(translate::glossary_store::resolve(
        project_path.as_deref(),
        &cfg,
    ))
}

/// Ghi bảng thuật ngữ + xưng hô đã duyệt.
///
/// - Có `project_path` → lưu file `<project>.sublix-glossary.json` (**atomic**).
/// - Không → lưu vào config toàn cục (**atomic**, BUG-013) + emit `config:updated`.
///
/// API key trong config **không** bị đụng tới (config được đọc lại từ đĩa rồi mới sửa).
#[tauri::command]
fn glossary_set(
    app: tauri::AppHandle,
    project_path: Option<String>,
    glossary: translate::Glossary,
) -> Result<translate::Glossary, String> {
    let mut g = glossary;
    g.normalise();
    match project_path
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
    {
        Some(p) => {
            let path =
                translate::glossary_store::save_project(p, &g).map_err(|e| format!("{e:#}"))?;
            g.scope = "project".to_string();
            g.path = Some(path.to_string_lossy().to_string());
        }
        None => {
            let mut cfg = config::AppConfig::load(&app);
            translate::glossary_store::store_global(&mut cfg, &g);
            cfg.save(&app).map_err(|e| format!("{e:#}"))?;
            let _ = app.emit("config:updated", &cfg);
            g.scope = "global".to_string();
            g.path = None;
        }
    }
    Ok(g)
}

/// Gợi ý bảng thuật ngữ + xưng hô từ kịch bản.
///
/// Chạy **RIÊNG** lượt 1 ("đọc hiểu") rồi trả về bảng gợi ý để người dùng duyệt.
/// **KHÔNG tự ghi** gì cả — người dùng bấm ✓ mới lưu qua `glossary_set`.
#[tauri::command]
async fn glossary_suggest(
    app: tauri::AppHandle,
    lines: Vec<translate::contextual::ScriptLine>,
    source_lang: String,
    target_lang: String,
) -> Result<translate::GlossarySuggestion, String> {
    tokio::task::spawn_blocking(move || {
        let cfg = config::AppConfig::load(&app);
        let provider = cfg.translation_provider.to_lowercase();
        translate::server::set_reasoning_effort(&cfg.llm_reasoning_effort);
        let reference = translate::contextual_run::build_reference(
            &lines,
            &source_lang,
            &target_lang,
            &cfg,
            &provider,
        )
        .map_err(|e| format!("{e:#}"))?;
        Ok(translate::glossary::suggestion_from_reference(&reference))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("sublix_lib=info,sublix=info")),
        )
        .with_target(false)
        .init();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_audio_devices,
            hardsub::commands::hardsub_detect,
            hardsub::commands::hardsub_cancel,
            hardsub::commands::hardsub_model_status,
            hardsub::commands::hardsub_model_download,
            hardsub::commands::hardsub_install_deps,
            capture_test,
            transcribe_test,
            translate_test,
            translate_batch,
            translate_script_contextual,
            translate_options_get,
            translate_options_set,
            glossary_get,
            glossary_set,
            glossary_suggest,
            show_overlay,
            hide_overlay,
            set_overlay_click_through,
            app_info,
            start_live,
            stop_live,
            live_status,
            test_audio,
            scan_audio_levels,
            get_translation_engine,
            ollama_models,
            preload_translation_server,
            get_stt_engine,
            preload_stt_server_cmd,
            get_stt_server_engine,
            get_config,
            save_user_config,
            set_stt_engine_preference,
            set_translation_engine_preference,
            check_setup,
            voice_model_list,
            voice_model_download,
            stt_engines_status,
            stt_set_engine,
            stt_model_download,
            stt_model_cancel,
            stt_model_delete,
            stt_transcribe,
            stt_write_srt,
            download_whisper_binary_cmd,
            download_stt_model_cmd,
            download_translation_model_cmd,
            open_models_folder,
            select_media_file,
            generate_file_subtitles,
            is_file_sub_running,
            reveal_in_explorer,
            play_in_vlc,
            dubbing_pick_media_file,
            dubbing_get_voices,
            dubbing_available_subs,
            dubbing_analyze,
            dubbing_preview_tts,
            dubbing_export,
            dubbing_cancel,
            dubbing_open_output_folder,
            voice_sample_list,
            voice_sample_generate,
            voice_sample_data,
            voice_sample_status,
            voice_sample_ensure,
            voice_sample_ensure_path,
            voice_sample_data_path,
            voice_samples_prepare,
            voice_samples_prepare_cancel,
            tts_engines_status,
            tts_cloud_set_key,
            tts_cloud_test,
            tts_engine_install_deps,
            tts_engine_diagnose,
            downloader_get_info,
            downloader_start,
            downloader_pause,
            downloader_cancel,
            downloader_open_folder,
            downloader_reveal_file,
            downloader_open_file,
            downloader_downloads_dir,
            downloader_fetch_subtitles,
            open_thanh_pham_folder,
            downloader_file_meta,
            transcode_for_preview,
            cleanup_preview_for_input,
            cleanup_all_previews,
            extract_media_preview,
            downloader_check_disk,
            downloader_file_exists,
            downloader_parse_urls,
            downloader_expand_playlist
        ])
        .setup(|app| {
            let cfg = config::AppConfig::load(app.handle());
            if let Some(overlay) = app.get_webview_window("overlay") {
                // Position at bottom-center of primary monitor
                if let Ok(Some(monitor)) = overlay.primary_monitor() {
                    let size = monitor.size();
                    let _ = overlay::window::position_bottom_center(
                        &overlay,
                        size.height,
                        size.width,
                    );
                }
                if cfg.overlay_click_through {
                    let _ = overlay.set_ignore_cursor_events(true);
                    let _ = overlay::window::set_click_through(&overlay, true);
                }
                let _ = overlay.hide();
                tracing::info!(
                    "🎨 Overlay window ready (hidden by default): {}",
                    overlay.title().unwrap_or_default()
                );
            }
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.center();
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
                tracing::info!("🖥️ Main Settings window centered, shown, and focused");
            }
            tracing::info!("🚀 Sublix v{} started", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // R2-08.1: hook the app's exit event so we can close every Job Object handle
    // we created for child processes. The handles carry KILL_ON_JOB_CLOSE, so
    // closing the last handle (or the process terminating) drags the entire
    // yt-dlp/ffmpeg grandchild tree down with us — no zombie processes left
    // behind when the user closes the window or the app crashes.
    //
    // BUG-002: whisper-server / llama-server KHÔNG nằm trong Job Object nên
    // phải dừng tường minh khi app thoát, nếu không chúng vẫn giữ RAM/VRAM
    // và cổng (11435/11436) ⇒ lần mở sau app không spawn được server mới.
    app.run(|_handle, event| match event {
        tauri::RunEvent::ExitRequested { .. } => {
            stt::whisper_server::stop_server();
            translate::server::stop_server();
        }
        tauri::RunEvent::Exit => {
            stt::whisper_server::stop_server();
            translate::server::stop_server();
            downloader::shutdown_all_jobs();
        }
        _ => {}
    });
}

#[tauri::command]
fn show_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.show().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn hide_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.hide().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn set_overlay_click_through(app: tauri::AppHandle, enabled: bool) -> Result<config::AppConfig, String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window
            .set_ignore_cursor_events(enabled)
            .map_err(|e| format!("Failed to set click-through: {e}"))?;
        // Belt & braces: also set WS_EX_TRANSPARENT at the Win32 level (with frame
        // refresh) so clicks reliably pass through to the window below.
        let _ = overlay::window::set_click_through(&window, enabled);
    }
    let mut cfg = config::AppConfig::load(&app);
    cfg.overlay_click_through = enabled;
    cfg.save(&app).map_err(|e| format!("{e:#}"))?;
    let _ = app.emit("config:updated", &cfg);
    Ok(cfg)
}

#[tauri::command]
fn app_info() -> serde_json::Value {
    serde_json::json!({
        "name": env!("CARGO_PKG_NAME"),
        "version": env!("CARGO_PKG_VERSION"),
        "description": env!("CARGO_PKG_DESCRIPTION"),
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
fn start_live(
    app: tauri::AppHandle,
    device_index: Option<usize>,
    model: Option<String>,
    chunk_seconds: Option<u32>,
    output_mode: Option<String>,
    target_lang: Option<String>,
    source_lang: Option<String>,
    translation_model: Option<String>,
    vad_enabled: Option<bool>,
) -> Result<(), String> {
    // Persist user selections to config
    let mut cfg = config::AppConfig::load(&app);
    if let Some(ref m) = model {
        cfg.stt_model = m.clone();
    }
    if let Some(ref tm) = translation_model {
        cfg.translation_model = tm.clone();
    }
    if let Some(cs) = chunk_seconds {
        cfg.chunk_seconds = cs;
    }
    if let Some(ref om) = output_mode {
        cfg.output_mode = om.clone();
    }
    if let Some(ref tl) = target_lang {
        cfg.target_lang = tl.clone();
    }
    if let Some(ref sl) = source_lang {
        cfg.source_lang = sl.clone();
    }
    if let Some(vad) = vad_enabled {
        cfg.vad_enabled = vad;
    }
    let _ = cfg.save(&app);

    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.show();
    }
    start_live_capture(
        app,
        device_index,
        model,
        chunk_seconds.unwrap_or(cfg.chunk_seconds),
        output_mode,
        target_lang,
        source_lang,
        translation_model,
        vad_enabled,
    )
}

#[derive(serde::Serialize)]
struct AudioTestResult {
    device_name: String,
    file_size_bytes: u64,
    peak_volume: f32,
    rms_volume: f32,
    duration_secs: f32,
    has_audio: bool,
}

/// Đo âm lượng thiết bị đầu vào (BUG-010: quay 3 s + đọc WAV chạy ngoài
/// luồng chính để UI không đơ).
#[tauri::command]
async fn test_audio(device_index: Option<usize>) -> Result<AudioTestResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::env::temp_dir()
            .join("sublix-audio-test.wav")
            .to_string_lossy()
            .to_string();
        let fmt = capture_to_wav(&path, 3, device_index).map_err(|e| format!("{e:#}"))?;
        let metadata = std::fs::metadata(&path).map_err(|e| format!("{e}"))?;
        let file_size = metadata.len();

        let mut reader = hound::WavReader::open(&path).map_err(|e| format!("{e}"))?;
        let mut peak: f32 = 0.0;
        let mut sum_sq: f64 = 0.0;
        let mut n: u64 = 0;
        for sample in reader.samples::<f32>() {
            let s = sample.unwrap_or(0.0);
            let abs = s.abs();
            if abs > peak {
                peak = abs;
            }
            sum_sq += (s as f64) * (s as f64);
            n += 1;
        }
        let _ = std::fs::remove_file(&path);
        let rms = if n > 0 {
            (sum_sq / n as f64).sqrt() as f32
        } else {
            0.0
        };
        let has_audio = peak > 0.01;

        Ok(AudioTestResult {
            device_name: format!("{}Hz/{}ch/{}", fmt.sample_rate, fmt.channels, fmt.sample_type),
            file_size_bytes: file_size,
            peak_volume: peak,
            rms_volume: rms,
            duration_secs: 3.0,
            has_audio,
        })
    })
    .await
    .map_err(|e| format!("{e}"))?
}

#[derive(serde::Serialize)]
struct DeviceLevel {
    index: usize,
    name: String,
    peak_volume: f32,
    has_audio: bool,
    error: Option<String>,
}

/// Quét mức âm lượng mọi thiết bị (BUG-010: quét + ghi âm từng thiết bị chạy
/// ngoài luồng chính để UI không đơ trong lúc quét).
#[tauri::command]
async fn scan_audio_levels() -> Result<Vec<DeviceLevel>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        init_com_best_effort_quiet();
        let collection = wasapi::DeviceCollection::new(&Direction::Render)
            .map_err(|e| format!("Failed to enumerate render devices: {e:#}"))?;
        let devices: Vec<wasapi::Device> = (&collection)
            .into_iter()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect devices: {e:#}"))?;

        let mut results = Vec::with_capacity(devices.len());
        for (i, device) in devices.into_iter().enumerate() {
            let name = device
                .get_friendlyname()
                .unwrap_or_else(|_| "(unnamed)".to_string());
            let path = std::env::temp_dir()
                .join(format!("sublix-scan-{i}.wav"))
                .to_string_lossy()
                .to_string();
            let result = measure_device(&device, &path, 1);
            let _ = std::fs::remove_file(&path);
            match result {
                Ok((peak, _file_size)) => {
                    results.push(DeviceLevel {
                        index: i,
                        name,
                        peak_volume: peak,
                        has_audio: peak > 0.005,
                        error: None,
                    });
                }
                Err(e) => {
                    results.push(DeviceLevel {
                        index: i,
                        name,
                        peak_volume: 0.0,
                        has_audio: false,
                        error: Some(format!("{e:#}")),
                    });
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(120));
        }
        Ok(results)
    })
    .await
    .map_err(|e| format!("{e}"))?
}

fn measure_device(
    device: &wasapi::Device,
    output_path: &str,
    duration_secs: u32,
) -> anyhow::Result<(f32, u64)> {
    use std::time::{Duration, Instant};
    use wasapi::{SampleType, StreamMode};

    let mut audio_client = device.get_iaudioclient()?;
    let mix_format = audio_client.get_mixformat()?;
    let sample_rate = mix_format.get_samplespersec();
    let channels = mix_format.get_nchannels();
    let bits_per_sample = mix_format.get_bitspersample();
    let sample_type = match mix_format.get_subformat() {
        Ok(SampleType::Float) => hound::SampleFormat::Float,
        _ => hound::SampleFormat::Int,
    };
    let stream_mode = StreamMode::PollingShared {
        autoconvert: true,
        buffer_duration_hns: 200_000,
    };
    audio_client.initialize_client(&mix_format, &Direction::Capture, &stream_mode)?;
    let capture_client = audio_client.get_audiocaptureclient()?;
    let wav_spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample,
        sample_format: sample_type,
    };
    let mut writer = hound::WavWriter::create(output_path, wav_spec)?;
    audio_client.start_stream()?;

    let start = Instant::now();
    let max_dur = Duration::from_secs(duration_secs as u64 + 1);
    let total_frames = sample_rate as u64 * duration_secs as u64;
    let mut frames_written: u64 = 0;
    let bytes_per_sample = (bits_per_sample / 8) as usize;
    let bytes_per_frame = channels as usize * bytes_per_sample;
    let buf_frames = (sample_rate as usize) / 10;
    let mut buffer = vec![0u8; buf_frames * bytes_per_frame];
    let mut peak: f32 = 0.0;

    while frames_written < total_frames {
        if start.elapsed() >= max_dur {
            break;
        }
        let packet_size = match capture_client.get_next_packet_size() {
            Ok(Some(n)) => n as usize,
            _ => {
                std::thread::sleep(Duration::from_millis(5));
                continue;
            }
        };
        if packet_size == 0 {
            std::thread::sleep(Duration::from_millis(5));
            continue;
        }
        let frames_to_read = packet_size.min(buf_frames);
        let bytes_to_read = frames_to_read * bytes_per_frame;
        let (frames_returned, _) =
            match capture_client.read_from_device(&mut buffer[..bytes_to_read]) {
                Ok(r) => r,
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(5));
                    continue;
                }
            };
        if frames_returned == 0 {
            continue;
        }
        let bytes_written = frames_returned as usize * bytes_per_frame;
        if bits_per_sample == 32 {
            for chunk in buffer[..bytes_written].chunks_exact(4) {
                let sample = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                let a = sample.abs();
                if a > peak {
                    peak = a;
                }
                writer.write_sample(sample).ok();
            }
        } else if bits_per_sample == 16 {
            for chunk in buffer[..bytes_written].chunks_exact(2) {
                let sample = i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / 32768.0;
                let a = sample.abs();
                if a > peak {
                    peak = a;
                }
                writer.write_sample((sample * 32768.0) as i16).ok();
            }
        }
        frames_written += frames_returned as u64;
    }

    audio_client.stop_stream().ok();
    writer.finalize()?;
    let file_size = std::fs::metadata(output_path).map(|m| m.len()).unwrap_or(0);
    Ok((peak, file_size))
}

fn init_com_best_effort_quiet() {
    let _ = wasapi::initialize_mta();
}

#[tauri::command]
fn stop_live(app: tauri::AppHandle) -> Result<(), String> {
    stop_live_capture(&app)
}

#[tauri::command]
fn live_status() -> bool {
    is_live_running()
}

#[tauri::command]
fn get_translation_engine() -> Option<String> {
    translate::current_engine()
}

/// Danh sách model Ollama đã cài trên máy.
/// Dùng cho preset "AMD iGPU (Ollama)" và dropdown chọn model trong Cài đặt.
#[tauri::command]
async fn ollama_models(app: tauri::AppHandle) -> Result<Vec<translate::server::OllamaModelInfo>, String> {
    let cfg = config::AppConfig::load(&app);
    let url = if cfg.ollama_url.trim().is_empty() {
        "http://localhost:11434".to_string()
    } else {
        cfg.ollama_url.trim().to_string()
    };
    // Blocking HTTP -> chay off main thread de khong treo UI.
    tauri::async_runtime::spawn_blocking(move || {
        translate::server::list_ollama_models(&url)
    })
    .await
    .map_err(|e| format!("Task loi: {e}"))?
    .map_err(|e| format!("{e}"))
}

#[tauri::command]
fn preload_translation_server(
    app: tauri::AppHandle,
    model: Option<String>,
) -> Result<String, String> {
    let cfg = config::AppConfig::load(&app);
    let variant = TranslationModelVariant::resolve_or_best(
        model.as_deref().or(Some(cfg.translation_model.as_str())),
    );
    let pref = stt::EnginePreference::from_str(&cfg.translation_engine_preference);
    translate::preload_server_with_options(variant, pref).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn get_stt_engine() -> Option<String> {
    stt::whisper_local::current_engine().map(|e| e.as_str().to_string())
}

// ============================================================
// Setup check + model download commands
// ============================================================

#[derive(Serialize)]
struct ModelStatusItem {
    name: String,
    label: String,
    size_mb: u32,
    downloaded: bool,
}

#[derive(Serialize)]
struct SetupStatus {
    has_whisper_binary: bool,
    stt_engine: Option<String>,
    stt_models: Vec<ModelStatusItem>,
    has_translation_binary: bool,
    has_translation_model: bool,
    translation_models: Vec<ModelStatusItem>,
    translation_model_size_mb: u32,
    is_first_run: bool,
}

#[tauri::command]
fn check_setup() -> SetupStatus {
    let stt_models: Vec<ModelStatusItem> = ModelVariant::ALL
        .iter()
        .map(|v| ModelStatusItem {
            name: v.name().to_string(),
            label: v.label().to_string(),
            size_mb: v.approximate_size_mb(),
            downloaded: stt::whisper_local::has_model(*v),
        })
        .collect();

    let translation_models: Vec<ModelStatusItem> = TranslationModelVariant::ALL
        .iter()
        .map(|v| ModelStatusItem {
            name: v.name().to_string(),
            label: v.label().to_string(),
            size_mb: v.approximate_size_mb(),
            downloaded: translate::has_variant_model(*v),
        })
        .collect();

    let stt_engine = stt::whisper_local::current_engine().map(|e| e.as_str().to_string());
    let has_whisper_binary = stt::whisper_local::has_binary();
    let has_translation_binary = translate::has_binary();
    let has_translation_model = translate::has_model();

    let is_first_run = !has_whisper_binary || !stt_models.iter().any(|m| m.downloaded);

    SetupStatus {
        has_whisper_binary,
        stt_engine,
        stt_models,
        has_translation_binary,
        has_translation_model,
        translation_models,
        translation_model_size_mb: translate::MODEL_SIZE_MB,
        is_first_run,
    }
}

#[tauri::command]
fn voice_model_list() -> Vec<voice_models::VoiceModelStatus> {
    voice_models::list()
}

#[tauri::command]
async fn voice_model_download(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let id_progress = id.clone();
    let app_handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let app_p = app_handle.clone();
        let name = id_progress.clone();
        let mut last_pct = 0u32;
        voice_models::download_with_progress(&id_progress, move |downloaded, total, pct| {
            if pct > last_pct || pct == 100 {
                last_pct = pct;
                let _ = app_p.emit(
                    "model:download_progress",
                    serde_json::json!({
                        "component": "voice",
                        "name": name,
                        "downloaded_bytes": downloaded,
                        "total_bytes": total,
                        "percent": pct
                    }),
                );
                // Sự kiện dùng chung cho UI tải model (STT + TTS).
                let _ = app_p.emit(
                    model_download::EVENT,
                    serde_json::json!({
                        "model_id": name,
                        "kind": model_download::KIND_TTS,
                        "phase": model_download::phase::DOWNLOADING,
                        "bytes_done": downloaded,
                        "bytes_total": total,
                        "speed_bps": 0,
                        "eta_s": null,
                        "file": null,
                        "message": "Đang tải model giọng đọc",
                    }),
                );
            }
        })
    })
    .await
    .map_err(|e| format!("{e}"))?;

    match result {
        Ok(_) => {
            let _ = app.emit(
                "model:download_progress",
                serde_json::json!({ "component": "voice", "name": id, "percent": 100, "phase": "done" }),
            );
            let _ = app.emit(
                model_download::EVENT,
                serde_json::json!({
                    "model_id": id,
                    "kind": model_download::KIND_TTS,
                    "phase": model_download::phase::DONE,
                    "bytes_done": 0,
                    "bytes_total": 0,
                    "speed_bps": 0,
                    "eta_s": 0,
                    "file": null,
                    "message": "Model giọng đọc đã sẵn sàng",
                }),
            );
            Ok(())
        }
        Err(e) => {
            let msg = format!("{e:#}");
            let _ = app.emit(
                "model:download_progress",
                serde_json::json!({ "component": "voice", "name": id, "phase": "error", "error": msg }),
            );
            let _ = app.emit(
                model_download::EVENT,
                serde_json::json!({
                    "model_id": id,
                    "kind": model_download::KIND_TTS,
                    "phase": model_download::phase::ERROR,
                    "bytes_done": 0,
                    "bytes_total": 0,
                    "speed_bps": 0,
                    "eta_s": null,
                    "file": null,
                    "message": msg,
                }),
            );
            Err(msg)
        }
    }
}

// ---- TSK-FEAT-STT-ENGINES: catalog engine STT + tải model có tiến trình chi tiết ----

/// Trạng thái toàn bộ engine STT (whisper.cpp + sherpa-onnx).
#[tauri::command]
fn stt_engines_status(app: tauri::AppHandle) -> Vec<stt::SttEngineStatus> {
    let selected = config::AppConfig::load(&app).stt_asr_engine;
    stt::stt_catalog::status_list(&selected)
}

/// Chọn engine STT đang dùng (rỗng = whisper.cpp mặc định).
#[tauri::command]
fn stt_set_engine(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let id = id.trim().to_string();
    if !id.is_empty() && stt::stt_catalog::spec(&id).is_none() {
        return Err(format!("Không có engine STT này: {id}"));
    }
    let mut cfg = config::AppConfig::load(&app);
    cfg.stt_asr_engine = id;
    cfg.save(&app).map_err(|e| format!("{e:#}"))?;
    let _ = app.emit("config:updated", &cfg);
    Ok(())
}

/// Tải model STT (emit `model:download-progress` ~4 lần/giây).
#[tauri::command]
async fn stt_model_download(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let app_c = app.clone();
    let id_c = id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let spec = stt::stt_catalog::spec(&id_c)
            .ok_or_else(|| format!("Không có engine STT này: {id_c}"))?;

        // Engine whisper.cpp dùng đường tải sẵn có (không đổi hành vi cũ).
        if spec.builtin {
            let variant = spec
                .whisper_variant
                .as_deref()
                .and_then(ModelVariant::from_name)
                .ok_or_else(|| "Model whisper không hợp lệ".to_string())?;
            let app_p = app_c.clone();
            let name = spec.id.clone();
            let mut last_pct = 0u32;
            stt::whisper_local::ensure_model_with_progress(variant, move |downloaded, total, pct| {
                if pct > last_pct || pct == 100 {
                    last_pct = pct;
                    let _ = app_p.emit(
                        model_download::EVENT,
                        serde_json::json!({
                            "model_id": name,
                            "kind": model_download::KIND_STT,
                            "phase": model_download::phase::DOWNLOADING,
                            "bytes_done": downloaded,
                            "bytes_total": total,
                            "speed_bps": 0,
                            "eta_s": null,
                            "file": null,
                            "message": "Đang tải model Whisper",
                        }),
                    );
                }
            })
            .map_err(|e| format!("{e:#}"))?;
            return Ok(());
        }

        let dir = stt::stt_catalog::model_dir(&spec.id);
        let emit_app = app_c.clone();
        let mut emit = move |p: model_download::DownloadProgress| {
            let _ = emit_app.emit(model_download::EVENT, &p);
        };

        model_download::download_files(
            &spec.id,
            model_download::KIND_STT,
            &dir,
            &spec.files,
            &mut emit,
        )
        .map_err(|e| format!("{e:#}"))?;

        // Giải nén gói model → thư mục engine (chỉ engine dạng .tar.bz2).
        if spec.archive {
            emit(model_download::DownloadProgress {
                model_id: spec.id.clone(),
                kind: model_download::KIND_STT.to_string(),
                phase: model_download::phase::EXTRACTING.to_string(),
                bytes_done: stt::stt_catalog::total_bytes(&spec),
                bytes_total: stt::stt_catalog::total_bytes(&spec),
                speed_bps: 0,
                eta_s: Some(0),
                file: None,
                message: "Đang giải nén model".to_string(),
            });
            let archive = dir.join("_archive.tar.bz2");
            stt::sherpa_asr::extract_archive(&spec.id, &archive).map_err(|e| format!("{e:#}"))?;
            // Xoá gói nén để không tốn gấp đôi dung lượng.
            let _ = std::fs::remove_file(&archive);
        }

        // Cài thư viện Python (sherpa-onnx / onnxruntime).
        if !stt::sherpa_asr::deps_ready() {
            emit(model_download::DownloadProgress {
                model_id: spec.id.clone(),
                kind: model_download::KIND_STT.to_string(),
                phase: model_download::phase::INSTALLING_DEPS.to_string(),
                bytes_done: stt::stt_catalog::total_bytes(&spec),
                bytes_total: stt::stt_catalog::total_bytes(&spec),
                speed_bps: 0,
                eta_s: None,
                file: None,
                message: "Đang cài thư viện Python (sherpa-onnx)".to_string(),
            });
            let mut line = |l: &str| info!("[pip sherpa] {l}");
            stt::sherpa_asr::install_deps(&mut line).map_err(|e| format!("{e:#}"))?;
        }

        emit(model_download::DownloadProgress {
            model_id: spec.id.clone(),
            kind: model_download::KIND_STT.to_string(),
            phase: model_download::phase::DONE.to_string(),
            bytes_done: stt::stt_catalog::total_bytes(&spec),
            bytes_total: stt::stt_catalog::total_bytes(&spec),
            speed_bps: 0,
            eta_s: Some(0),
            file: None,
            message: "Model đã sẵn sàng".to_string(),
        });
        Ok(())
    })
    .await
    .map_err(|e| format!("{e}"))?
}

/// Hủy tải model STT đang chạy.
#[tauri::command]
fn stt_model_cancel(id: String) -> Result<(), String> {
    if stt::stt_catalog::spec(&id).is_none() {
        return Err(format!("Không có engine STT này: {id}"));
    }
    model_download::cancel(&id);
    Ok(())
}

/// Xoá model STT đã cài (giải phóng dung lượng).
#[tauri::command]
fn stt_model_delete(id: String) -> Result<(), String> {
    let spec = stt::stt_catalog::spec(&id)
        .ok_or_else(|| format!("Không có engine STT này: {id}"))?;
    if spec.builtin {
        if let Some(variant) = spec.whisper_variant.as_deref().and_then(ModelVariant::from_name) {
            stt::whisper_local::delete_model(variant).map_err(|e| format!("{e:#}"))?;
            return Ok(());
        }
        return Err("Model whisper không xoá được".to_string());
    }
    let dir = stt::stt_catalog::model_dir(&id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Không xoá được model: {e:#}"))?;
    }
    Ok(())
}

/// Nhận dạng giọng nói bằng engine đã chọn (mặc định whisper.cpp).
/// Trả về đúng định dạng segment mà pipeline Studio đang dùng.
#[tauri::command]
async fn stt_transcribe(
    app: tauri::AppHandle,
    wav_path: String,
    language: Option<String>,
    engine_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let cfg = config::AppConfig::load(&app);
    let engine = engine_id
        .unwrap_or(cfg.stt_asr_engine)
        .trim()
        .to_string();
    let pref = cfg.stt_engine_preference.clone();
    let lang = language.unwrap_or_else(|| "auto".to_string());

    tauri::async_runtime::spawn_blocking(move || {
        transcribe_with_engine(&engine, &wav_path, &lang, &pref)
    })
    .await
    .map_err(|e| format!("{e}"))?
}

/// Nhận dạng bằng engine đã chọn — trả về JSON **thống nhất** cho mọi engine.
///
/// - whisper.cpp: chạy CLI với `-osrt` (timestamp mức câu)
/// - sherpa-onnx: sidecar trả token timestamp (mức từ) → gom thành câu
fn transcribe_with_engine(
    engine: &str,
    wav_path: &str,
    language: &str,
    preference: &str,
) -> Result<serde_json::Value, String> {
    // Rỗng (hoặc whisper) → đường whisper.cpp sẵn có.
    if engine.is_empty() || engine.starts_with("whisper") {
        let variant = ModelVariant::best_installed().unwrap_or(ModelVariant::LargeV3TurboQ8);
        let whisper = stt::whisper_local::WhisperLocal::new(variant)
            .map_err(|e| format!("{e:#}"))?;
        let segments = whisper
            .transcribe_to_segments(wav_path, Some(language))
            .map_err(|e| format!("{e:#}"))?;
        let text = segments
            .iter()
            .map(|s| s.original.trim())
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        let _ = preference; // whisper.cpp tự chọn binary theo engine preference.
        return Ok(serde_json::json!({
            "engine": "whisper",
            "family": "whisper",
            "text": text,
            "language": language,
            "audio_duration_secs": 0.0,
            "inference_duration_secs": 0.0,
            "timestamps": "sentence",
            "segments": segments,
        }));
    }

    let spec =
        stt::stt_catalog::spec(engine).ok_or_else(|| format!("Không có engine STT này: {engine}"))?;
    let result = stt::sherpa_asr::transcribe(
        &spec.id,
        &spec.family,
        std::path::Path::new(wav_path),
        language,
        preference,
    )
    .map_err(|e| format!("{e:#}"))?;
    serde_json::to_value(&result).map_err(|e| format!("{e:#}"))
}

/// Ghi kết quả nhận dạng ra file SRT (cùng định dạng phụ đề của Sublix).
#[tauri::command]
async fn stt_write_srt(
    app: tauri::AppHandle,
    wav_path: String,
    srt_path: String,
    language: Option<String>,
    engine_id: Option<String>,
) -> Result<String, String> {
    let cfg = config::AppConfig::load(&app);
    let engine = engine_id.unwrap_or(cfg.stt_asr_engine).trim().to_string();
    let pref = cfg.stt_engine_preference.clone();
    let lang = language.unwrap_or_else(|| "auto".to_string());
    let out = std::path::PathBuf::from(&srt_path);

    tauri::async_runtime::spawn_blocking(move || {
        // whisper.cpp: dùng chính CLI xuất SRT (timestamp mức câu).
        if engine.is_empty() || engine.starts_with("whisper") {
            let variant =
                ModelVariant::best_installed().unwrap_or(ModelVariant::LargeV3TurboQ8);
            let whisper = stt::whisper_local::WhisperLocal::new(variant)
                .map_err(|e| format!("{e:#}"))?;
            let segments = whisper
                .transcribe_to_segments(&wav_path, Some(&lang))
                .map_err(|e| format!("{e:#}"))?;
            file_sub::write_srt_file(&out, &segments, "original").map_err(|e| format!("{e:#}"))?;
            return Ok(out.to_string_lossy().to_string());
        }

        let spec = stt::stt_catalog::spec(&engine)
            .ok_or_else(|| format!("Không có engine STT này: {engine}"))?;
        let result = stt::sherpa_asr::transcribe(
            &spec.id,
            &spec.family,
            std::path::Path::new(&wav_path),
            &lang,
            &pref,
        )
        .map_err(|e| format!("{e:#}"))?;
        stt::sherpa_asr::write_srt(&out, &result).map_err(|e| format!("{e:#}"))?;
        Ok(out.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("{e}"))?
}

// ---- TSK-FEAT-TTS-3ENGINES: trạng thái engine TTS, key cloud (lưu file riêng, không trả key), cài deps, chẩn đoán CUDA ----
#[tauri::command]
fn tts_engines_status() -> serde_json::Value {
    dubbing::tts_status::engines_status()
}

#[tauri::command]
fn tts_cloud_set_key(provider: String, key: String) -> Result<(), String> {
    dubbing::tts_cloud::set_key(&provider, &key).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn tts_cloud_test(provider: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || dubbing::tts_status::test_cloud(&provider))
        .await
        .map_err(|e| format!("{e}"))?
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn tts_engine_install_deps(app: tauri::AppHandle, engine: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut emit = |line: &str| {
            let _ = app.emit("tts:deps_progress", serde_json::json!({ "engine": engine, "line": line }));
        };
        dubbing::tts_status::install_deps(&engine, &mut emit)
    })
    .await
    .map_err(|e| format!("{e}"))?
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn tts_engine_diagnose(engine: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || dubbing::tts_status::diagnose(&engine))
        .await
        .map_err(|e| format!("{e}"))?
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn download_whisper_binary_cmd(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit(
        "setup:progress",
        serde_json::json!({
            "phase": "downloading",
            "component": "whisper_binary",
            "message": "Downloading whisper.cpp (~30MB)..."
        }),
    );
    // BUG-H11: tôn trọng engine người dùng đã chọn trong cài đặt.
    let stt_pref = stt::EnginePreference::from_str(
        &config::AppConfig::load(&app).stt_engine_preference,
    );
    stt::whisper_local::ensure_binary_with_engine_pref(stt_pref).map_err(|e| {
        let _ = app.emit(
            "setup:progress",
            serde_json::json!({
                "phase": "error",
                "component": "whisper_binary",
                "message": format!("{e:#}")
            }),
        );
        format!("{e:#}")
    })?;
    let _ = app.emit(
        "setup:progress",
        serde_json::json!({
            "phase": "done",
            "component": "whisper_binary"
        }),
    );
    Ok(())
}

#[tauri::command]
async fn download_stt_model_cmd(app: tauri::AppHandle, variant: String) -> Result<(), String> {
    let v = ModelVariant::from_name(&variant).ok_or_else(|| format!("Unknown model: {variant}"))?;
    let size_mb = v.approximate_size_mb();
    let variant_name = v.name().to_string();

    let _ = app.emit(
        "setup:progress",
        serde_json::json!({
            "phase": "downloading",
            "component": "stt_model",
            "variant": variant_name,
            "size_mb": size_mb,
            "message": format!("Downloading {} (~{}MB)...", variant_name, size_mb)
        }),
    );

    let app_handle = app.clone();
    let v_clone_name = variant_name.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let app_for_progress = app_handle.clone();
        let name_for_progress = v_clone_name.clone();
        let mut last_emitted_pct = 0u32;
        stt::whisper_local::ensure_model_with_progress(v, move |downloaded, total, pct| {
            if pct > last_emitted_pct || pct == 100 {
                last_emitted_pct = pct;
                let _ = app_for_progress.emit(
                    "model:download_progress",
                    serde_json::json!({
                        "component": "stt",
                        "name": name_for_progress,
                        "downloaded_bytes": downloaded,
                        "total_bytes": total,
                        "percent": pct
                    }),
                );
            }
        })
    })
    .await
    .map_err(|e| format!("Task spawn error: {e}"))?;

    let _ = match &result {
        Ok(_) => {
            let _ = app.emit(
                "model:download_progress",
                serde_json::json!({
                    "component": "stt",
                    "name": variant_name,
                    "percent": 100,
                    "phase": "done"
                }),
            );
            app.emit(
                "setup:progress",
                serde_json::json!({
                    "phase": "done",
                    "component": "stt_model",
                    "variant": variant_name
                }),
            )
        }
        Err(e) => {
            let _ = app.emit(
                "model:download_progress",
                serde_json::json!({
                    "component": "stt",
                    "name": variant_name,
                    "phase": "error",
                    "error": format!("{e:#}")
                }),
            );
            app.emit(
                "setup:progress",
                serde_json::json!({
                    "phase": "error",
                    "component": "stt_model",
                    "variant": variant_name,
                    "message": format!("{e:#}")
                }),
            )
        }
    };
    result.map(|_| ()).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn download_translation_model_cmd(
    app: tauri::AppHandle,
    variant: Option<String>,
) -> Result<(), String> {
    let v = variant
        .as_deref()
        .and_then(TranslationModelVariant::from_name)
        .unwrap_or(TranslationModelVariant::Qwen3_4B);
    let size_mb = v.approximate_size_mb();
    let variant_name = v.name().to_string();

    let _ = app.emit(
        "setup:progress",
        serde_json::json!({
            "phase": "downloading",
            "component": "translation_model",
            "variant": variant_name,
            "size_mb": size_mb,
            "message": format!("Downloading {} (~{}MB)...", variant_name, size_mb)
        }),
    );

    let app_handle = app.clone();
    let v_clone_name = variant_name.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let app_for_progress = app_handle.clone();
        let name_for_progress = v_clone_name.clone();
        let mut last_emitted_pct = 0u32;
        translate::ensure_variant_model_with_progress(v, move |downloaded, total, pct| {
            if pct > last_emitted_pct || pct == 100 {
                last_emitted_pct = pct;
                let _ = app_for_progress.emit(
                    "model:download_progress",
                    serde_json::json!({
                        "component": "translation",
                        "name": name_for_progress,
                        "downloaded_bytes": downloaded,
                        "total_bytes": total,
                        "percent": pct
                    }),
                );
            }
        })
    })
    .await
    .map_err(|e| format!("Task spawn error: {e}"))?;

    let _ = match &result {
        Ok(_) => {
            let _ = app.emit(
                "model:download_progress",
                serde_json::json!({
                    "component": "translation",
                    "name": variant_name,
                    "percent": 100,
                    "phase": "done"
                }),
            );
            app.emit(
                "setup:progress",
                serde_json::json!({
                    "phase": "done",
                    "component": "translation_model",
                    "variant": variant_name
                }),
            )
        }
        Err(e) => {
            let _ = app.emit(
                "model:download_progress",
                serde_json::json!({
                    "component": "translation",
                    "name": variant_name,
                    "phase": "error",
                    "error": format!("{e:#}")
                }),
            );
            app.emit(
                "setup:progress",
                serde_json::json!({
                    "phase": "error",
                    "component": "translation_model",
                    "variant": variant_name,
                    "message": format!("{e:#}")
                }),
            )
        }
    };
    result.map(|_| ()).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn open_models_folder() -> Result<(), String> {
    let models_dir = config::app_base_dir().join("models");
    let _ = std::fs::create_dir_all(&models_dir);
    let _ = std::process::Command::new("explorer.exe")
        .arg(models_dir.as_os_str())
        .spawn()
        .map_err(|e| format!("Failed to open Explorer: {e}"))?;
    Ok(())
}

#[tauri::command]
fn preload_stt_server_cmd(
    app: tauri::AppHandle,
    model: Option<String>,
) -> Result<String, String> {
    let cfg = config::AppConfig::load(&app);
    let variant = model
        .as_deref()
        .or(Some(cfg.stt_model.as_str()))
        .and_then(ModelVariant::from_name)
        .filter(|v| stt::has_stt_model(*v))
        .or_else(ModelVariant::best_installed)
        .unwrap_or(ModelVariant::LargeV3TurboQ8);
    let pref = stt::EnginePreference::from_str(&cfg.stt_engine_preference);
    stt::preload_stt_server(variant, pref)
}

#[tauri::command]
fn get_stt_server_engine() -> Option<String> {
    stt::stt_server_engine().map(|e| e.as_str().to_string())
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> config::AppConfig {
    config::AppConfig::load(&app)
}

#[tauri::command]
fn save_user_config(
    app: tauri::AppHandle,
    new_config: config::AppConfig,
) -> Result<config::AppConfig, String> {
    new_config.save(&app).map_err(|e| format!("{e:#}"))?;
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.set_ignore_cursor_events(new_config.overlay_click_through);
        let _ = overlay::window::set_click_through(&window, new_config.overlay_click_through);
    }
    let _ = app.emit("config:updated", &new_config);
    Ok(new_config)
}

#[tauri::command]
fn set_stt_engine_preference(
    app: tauri::AppHandle,
    choice: String,
) -> Result<config::AppConfig, String> {
    if !config::engine_pref::all().contains(&choice.to_lowercase().as_str()) {
        return Err(format!("Invalid engine choice: '{choice}'"));
    }
    let mut cfg = config::AppConfig::load(&app);
    cfg.stt_engine_preference = choice.to_lowercase();
    cfg.save(&app).map_err(|e| format!("{e:#}"))?;
    info!(
        "🎛️  STT engine preference set: {}",
        cfg.stt_engine_preference
    );
    Ok(cfg)
}

#[tauri::command]
fn set_translation_engine_preference(
    app: tauri::AppHandle,
    choice: String,
) -> Result<config::AppConfig, String> {
    if !config::engine_pref::all().contains(&choice.to_lowercase().as_str()) {
        return Err(format!("Invalid engine choice: '{choice}'"));
    }
    let mut cfg = config::AppConfig::load(&app);
    cfg.translation_engine_preference = choice.to_lowercase();
    cfg.save(&app).map_err(|e| format!("{e:#}"))?;
    info!(
        "🎛️  Translation engine preference set: {}",
        cfg.translation_engine_preference
    );
    Ok(cfg)
}

#[tauri::command]
fn select_media_file() -> Option<String> {
    file_sub::pick_media_file()
}

#[tauri::command]
async fn generate_file_subtitles(
    app: tauri::AppHandle,
    input_path: String,
    source_lang: Option<String>,
    target_lang: Option<String>,
    create_bilingual: bool,
    stt_model_name: Option<String>,
    translation_model_name: Option<String>,
    run_id: Option<String>,
) -> Result<file_sub::FileSubResult, String> {
    tokio::task::spawn_blocking(move || {
        file_sub::generate_file_subtitles(
            app,
            input_path,
            source_lang,
            target_lang,
            create_bilingual,
            stt_model_name,
            translation_model_name,
            run_id,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn is_file_sub_running() -> bool {
    file_sub::is_running()
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    file_sub::reveal_in_explorer(&path).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn play_in_vlc(video_path: String, srt_path: String) -> Result<(), String> {
    file_sub::launch_in_vlc(&video_path, &srt_path).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn dubbing_pick_media_file() -> Option<String> {
    file_sub::pick_media_file()
}

#[tauri::command]
fn dubbing_get_voices() -> Vec<dubbing::VoicePreset> {
    dubbing::get_preset_voices()
}

/// v0.11.32 (PO): liệt kê phụ đề có sẵn cạnh video (đánh dấu file nào là YouTube)
/// để Studio hiện "có sẵn: en (YouTube), vi" trước khi chạy phân tích.
#[tauri::command]
fn dubbing_available_subs(file_path: String) -> Vec<dubbing::AvailableSubtitle> {
    dubbing::available_subtitles(&file_path)
}

#[tauri::command]
async fn dubbing_analyze(
    app: tauri::AppHandle,
    file_path: String,
    source_lang: Option<String>,
    target_lang: Option<String>,
    time_limit_sec: Option<f64>,
    start_offset_sec: Option<f64>,
    expected_speakers: Option<usize>,
    prefer_existing_srt: Option<bool>,
    run_id: Option<String>,
) -> Result<dubbing::DubbingProject, String> {
    tokio::task::spawn_blocking(move || {
        dubbing::analyze_and_create_project_full(
            Some(&app),
            &file_path,
            source_lang,
            target_lang,
            time_limit_sec,
            start_offset_sec,
            expected_speakers,
            prefer_existing_srt,
            run_id,
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn dubbing_cancel() -> Result<(), String> {
    dubbing::cancel_dubbing();
    Ok(())
}

#[tauri::command]
async fn extract_media_preview(
    video_path: String,
    duration_sec: Option<f64>,
) -> Result<dubbing::MediaPreviewPayload, String> {
    tokio::task::spawn_blocking(move || {
        dubbing::extract_media_preview_sync(&video_path, duration_sec)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn dubbing_preview_tts(
    text: String,
    voice: String,
    rate: Option<String>,
    pitch: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        dubbing::preview_single_line(&text, &voice, rate.as_deref(), pitch.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn dubbing_export(
    app: tauri::AppHandle,
    project: dubbing::DubbingProject,
    output_path: Option<String>,
    run_id: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        dubbing::export_dubbed_video(Some(&app), project, output_path, run_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

/// v0.9.8: Open Windows Explorer with the dubbed video file selected in its
/// parent folder, so users can jump straight to the finished MP4.
#[tauri::command]
fn dubbing_open_output_folder(path: String) -> Result<(), String> {
    dubbing::open_output_folder(&path).map_err(|e| format!("{e:#}"))
}

/// v0.9.9: voice ids with a cached audition sample (instant playback, no live TTS).
#[tauri::command]
fn voice_sample_list(model_id: String) -> Vec<String> {
    dubbing::list_voice_samples(&model_id)
}

/// v0.9.9: pre-generate audition samples for every voice of a model (one-time).
#[tauri::command]
async fn voice_sample_generate(app: tauri::AppHandle, model_id: String) -> Result<u32, String> {
    if model_id != "kokoro-vi" {
        return Err("Hiện chỉ hỗ trợ tạo mẫu nghe thử cho Kokoro-Vietnamese.".to_string());
    }
    tokio::task::spawn_blocking(move || dubbing::generate_kokoro_samples(&app))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{e:#}"))
}

/// v0.9.9: cached audition sample as a data URI (None → caller synthesizes live).
#[tauri::command]
fn voice_sample_data(model_id: String, voice_id: String) -> Option<String> {
    dubbing::voice_sample_data(&model_id, &voice_id)
}

/// TSK-FEAT-VOICE-SAMPLE-CACHE: số mẫu nghe thử đã có / tổng số giọng của engine.
/// Kèm mỗi lần gọi sẽ **tự** bắt đầu tạo mẫu nền 1 lần nếu app đang rảnh.
#[tauri::command]
fn voice_sample_status(app: tauri::AppHandle, engine: String) -> dubbing::voice_samples::VoiceSampleStatus {
    let status = dubbing::voice_samples::status(&engine);
    dubbing::voice_samples::maybe_auto_prepare(&app, &engine);
    status
}

/// TSK-FEAT-VOICE-SAMPLE-CACHE: lấy mẫu nghe thử — có cache thì trả ngay (tức thì),
/// chưa có thì tổng hợp **1 lần** rồi lưu lại (lazy) cho các lần sau.
#[tauri::command]
async fn voice_sample_ensure(
    app: tauri::AppHandle,
    voice_id: String,
    text: Option<String>,
) -> Result<Option<String>, String> {
    let engine = dubbing::voice_samples::engine_of_voice(&voice_id).to_string();
    let result = tokio::task::spawn_blocking(move || {
        dubbing::voice_samples::ensure_sample(&voice_id, text.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"));
    // Vừa nghe 1 giọng → cơ hội tạo nền cho cả engine (nếu app rảnh).
    if result.is_ok() {
        dubbing::voice_samples::maybe_auto_prepare(&app, &engine);
    }
    result
}

/// TSK-VOICE-PREVIEW-FILE: **đường dẫn tuyệt đối** tới file mẫu nghe thử.
///
/// Giống `voice_sample_ensure` (tạo/lấy từ cache, cùng khoá cache — khoá KHÔNG chứa
/// tên vai) nhưng trả **path** thay vì data-URI base64 ⇒ frontend phát bằng
/// `convertFileSrc` (asset protocol) ⇒ **không chuyển base64 qua IPC**, lần nghe thứ 2
/// tức thì.
///
/// `None` = chưa có mẫu và không tổng hợp được (ví dụ giọng cloud thiếu key).
#[tauri::command]
async fn voice_sample_ensure_path(
    app: tauri::AppHandle,
    voice_id: String,
    text: Option<String>,
) -> Result<Option<String>, String> {
    let engine = dubbing::voice_samples::engine_of_voice(&voice_id).to_string();
    let result = tokio::task::spawn_blocking(move || {
        dubbing::voice_samples::ensure_sample_path(&voice_id, text.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"));
    // Vừa nghe 1 giọng → cơ hội tạo nền cho cả engine (nếu app rảnh).
    if result.is_ok() {
        dubbing::voice_samples::maybe_auto_prepare(&app, &engine);
    }
    result
}

/// TSK-VOICE-PREVIEW-FILE: **đường dẫn tuyệt đối** tới mẫu đã cache theo model id
/// (vd "kokoro-vi") — không tổng hợp mới (None nếu chưa có mẫu).
#[tauri::command]
fn voice_sample_data_path(model_id: String, voice_id: String) -> Option<String> {
    dubbing::voice_samples::sample_path_for_model(&model_id, &voice_id)
}

/// TSK-FEAT-VOICE-SAMPLE-CACHE: tạo mẫu nghe thử **nền** cho mọi giọng của engine
/// (hoặc tất cả engine offline đã cài). Tuần tự, ưu tiên thấp, huỷ được.
#[tauri::command]
fn voice_samples_prepare(app: tauri::AppHandle, engine: Option<String>) -> Result<u32, String> {
    dubbing::voice_samples::spawn_prepare(app, engine.as_deref()).map_err(|e| format!("{e:#}"))
}

/// TSK-FEAT-VOICE-SAMPLE-CACHE: huỷ lượt tạo mẫu nền đang chạy.
#[tauri::command]
fn voice_samples_prepare_cancel() {
    dubbing::voice_samples::cancel_prepare();
}

#[tauri::command]
async fn downloader_get_info(
    app: tauri::AppHandle,
    url: String,
) -> Result<downloader::VideoInfo, String> {
    tokio::task::spawn_blocking(move || {
        downloader::fetch_video_info(&app, &url)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn downloader_start(app: tauri::AppHandle, req: downloader::DownloadRequest) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        downloader::start_download(app, req)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

// BUG-057 (async): pause/cancel used to run on the main thread; on
// large downloads the taskkill + filesystem scan could lock the UI for
// hundreds of ms. Move to spawn_blocking.
#[tauri::command]
async fn downloader_pause(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        downloader::pause_download(&app, &id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn downloader_cancel(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        downloader::cancel_download(&app, &id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn downloader_open_folder(app: tauri::AppHandle) -> Result<(), String> {
    downloader::open_downloads_folder(&app).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn downloader_reveal_file(path: String) -> Result<(), String> {
    downloader::reveal_downloaded_file(&path).map_err(|e| format!("{e:#}"))
}

/// v0.9.4: play the downloaded file with the OS default app (video player)
/// so the user can watch it straight from the download list.
#[tauri::command]
fn downloader_open_file(path: String) -> Result<(), String> {
    downloader::open_downloaded_file(&path).map_err(|e| format!("{e:#}"))
}

/// v0.9.6: full path of the folder where downloads are stored, so the UI
/// can show the user exactly where files land.
#[tauri::command]
fn downloader_downloads_dir(app: tauri::AppHandle) -> String {
    downloader::get_downloads_dir(&app).to_string_lossy().to_string()
}

/// v0.9.11 (PO bug "chọn phụ đề không dùng được"): fetch subtitle files for an
/// already-downloaded video as a separate, 429-tolerant yt-dlp pass.
#[tauri::command]
async fn downloader_fetch_subtitles(
    app: tauri::AppHandle,
    url: String,
    video_filename: String,
    browser_cookies: Option<String>,
    cookies_file: Option<String>,
) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        downloader::fetch_subtitles_now(
            &app,
            &url,
            &video_filename,
            browser_cookies.as_deref(),
            cookies_file.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

/// v0.9.10 (PO): open the ONE folder that holds both downloaded videos and
/// finished dubbed files ("chỗ nào thì tìm thấy chỗ đó").
#[tauri::command]
fn open_thanh_pham_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = downloader::get_downloads_dir(&app);
    let _ = std::fs::create_dir_all(&dir);
    std::process::Command::new("explorer.exe")
        .arg(dir.as_os_str())
        .spawn()
        .map_err(|e| format!("Không mở được thư mục: {e}"))?;
    Ok(())
}

/// v0.9.6: size + resolution of a finished file for the download list
/// (lazy backfill for items completed before this feature existed).
#[tauri::command]
fn downloader_file_meta(path: String) -> Option<downloader::FileMeta> {
    downloader::file_meta(&path)
}

/// BUG-051: returns the number of free bytes on the volume that would
/// receive a file at `path`. The UI uses this to reject huge downloads
/// before we even spawn yt-dlp.
#[tauri::command]
fn downloader_check_disk(app: tauri::AppHandle, path: Option<String>) -> Result<u64, String> {
    let target = match path {
        Some(p) if !p.trim().is_empty() => std::path::PathBuf::from(p),
        _ => downloader::get_downloads_dir(&app),
    };
    downloader::disk_free_bytes(&target).map_err(|e| format!("{e:#}"))
}

/// R2-09.7: lightweight existence check used by the pipeline-bridge
/// buttons (Tạo Phụ Đề / Lồng Tiếng AI) so they disable themselves when
/// the file yt-dlp reported is actually missing. Cheap — single syscall.
#[tauri::command]
fn downloader_file_exists(path: String) -> bool {
    downloader::check_file_exists(&path)
}

/// TSK-FEAT-DL-BATCH-AUDIO: tách ô nhập nhiều link (lọc + loại trùng).
#[tauri::command]
fn downloader_parse_urls(text: String) -> downloader::batch::ParsedUrls {
    downloader::batch::split_urls(&text)
}

/// TSK-FEAT-DL-BATCH-AUDIO: đọc danh sách mục playlist (`--flat-playlist -J`).
#[tauri::command]
async fn downloader_expand_playlist(
    app: tauri::AppHandle,
    url: String,
    browser_cookies: Option<String>,
) -> Result<downloader::batch::PlaylistExpansion, String> {
    tokio::task::spawn_blocking(move || {
        downloader::batch::expand_playlist(&app, &url, browser_cookies.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

/// v0.11.1: ROUND-4 R4-01 — Transcode a video to H.264/AAC baseline profile
/// for WebView2 preview (it can't decode VP9/AV1/hevc natively). Returns the
/// path to the temp preview file. Each call creates a NEW file in
/// `%TEMP%\sublix_preview\{stem}_{size}_{mtime}_{nonce}.mp4` where `nonce` is
/// nanosecond timestamp — NOT a cache, NOT overwritten. Frontend MUST call
/// `cleanup_preview_for_input` (R5-03) when user changes the input file or
/// unmounts the Studio tab, otherwise preview files accumulate in %TEMP%.
#[tauri::command]
fn transcode_for_preview(input_path: String) -> Result<String, String> {
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    let ffmpeg = crate::dubbing::find_ffmpeg();

    // Filename: {stem}_{size}_{mtime}_{nonce}.mp4 — nonce makes each call unique,
    // so identical input produces different files (no cache, no overwrite).
    let src = std::path::Path::new(&input_path);
    if !src.exists() {
        return Err(format!("Input file not found: {input_path}"));
    }
    let meta = std::fs::metadata(src).map_err(|e| format!("stat failed: {e:#}"))?;
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("preview")
        .chars()
        .take(32)
        .collect::<String>();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let out_dir = std::env::temp_dir().join("sublix_preview");
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("create temp dir: {e:#}"))?;
    let out_path = out_dir.join(format!("{stem}_{size}_{mtime}_{nonce}.mp4"));

    // H.264 baseline (level 3.0) + AAC LC + faststart → maximum WebView2 compatibility
    let mut cmd = Command::new(&ffmpeg);
    cmd.arg("-y")
        .arg("-i")
        .arg(src)
        .arg("-c:v")
        .arg("libx264")
        .arg("-profile:v")
        .arg("baseline")
        .arg("-level")
        .arg("3.0")
        .arg("-preset")
        .arg("ultrafast")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("128k")
        .arg("-movflags")
        .arg("+faststart")
        .arg(&out_path);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let status = cmd
        .status()
        .map_err(|e| format!("ffmpeg spawn failed: {e:#}"))?;
    if !status.success() {
        return Err(format!("ffmpeg exit {:?}", status.code()));
    }
    out_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "non-utf8 path".to_string())
}

/// ROUND-5 R5-03: Xoá tất cả preview file của 1 input trong `%TEMP%\sublix_preview\`.
/// Match theo pattern `{stem}_{size}_{mtime}_*.mp4` để không nhầm với file preview
/// của video khác cùng folder. Trả về số file đã xoá (0 nếu không có gì).
#[tauri::command]
fn cleanup_preview_for_input(input_path: String) -> Result<usize, String> {
    use std::time::UNIX_EPOCH;

    let src = std::path::Path::new(&input_path);
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("preview")
        .chars()
        .take(32)
        .collect::<String>();

    let out_dir = std::env::temp_dir().join("sublix_preview");
    if !out_dir.exists() {
        return Ok(0);
    }
    // R6-07: nếu input đã xoá, vẫn dọn orphan theo stem (input từng tồn tại → có
    // preview files cũ trong folder). Trước đây return Ok(0) sớm → orphan tích luỹ.
    // Build prefix: nếu input còn → cụ thể size+mtime; nếu input mất → chỉ theo stem
    // (match mọi size/mtime cũ).
    let specific_prefix: Option<String> = match std::fs::metadata(src) {
        Ok(m) => {
            let size = m.len();
            let mtime = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            Some(format!("{stem}_{size}_{mtime}_"))
        }
        Err(_) => None, // input đã xoá → match chỉ theo stem
    };
    let stem_prefix = format!("{stem}_");

    let mut removed = 0usize;
    let entries = std::fs::read_dir(&out_dir).map_err(|e| format!("read_dir: {e:#}"))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
            if !name.ends_with(".mp4") {
                continue;
            }
            let matches = match &specific_prefix {
                Some(prefix) => name.starts_with(prefix.as_str()),
                None => name.starts_with(&stem_prefix),
            };
            if matches && std::fs::remove_file(&p).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

/// ROUND-5 R5-03: Xoá TOÀN BỘ folder `%TEMP%\sublix_preview\` (gọi khi app đóng
/// hoặc user muốn dọn dẹp thủ công). Trả về số file đã xoá.
#[tauri::command]
fn cleanup_all_previews() -> Result<usize, String> {
    let out_dir = std::env::temp_dir().join("sublix_preview");
    if !out_dir.exists() {
        return Ok(0);
    }
    let mut removed = 0usize;
    let entries = match std::fs::read_dir(&out_dir) {
        Ok(e) => e,
        Err(_) => return Ok(0),
    };
    for entry in entries.flatten() {
        if std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    // Thử xoá luôn folder nếu rỗng
    let _ = std::fs::remove_dir(&out_dir);
    Ok(removed)
}

#[cfg(test)]
mod run_id_payload_tests {
    use super::translate_progress_payload;

    /// Khong truyen run_id -> payload giong het ban cu (tuong thich nguoc).
    #[test]
    fn payload_khong_run_id_giong_ban_cu() {
        let v = translate_progress_payload(3, 10, "translating", None);
        assert_eq!(v["done"], 3);
        assert_eq!(v["total"], 10);
        assert_eq!(v["phase"], "translating");
        assert!(
            v.get("run_id").is_none(),
            "khong co run_id -> payload phai giong ban cu: {v}"
        );
    }

    /// Co run_id -> them khoa "run_id" vao payload.
    #[test]
    fn payload_co_run_id_them_khoa() {
        let v = translate_progress_payload(1, 2, "reading", Some("run-42"));
        assert_eq!(v["run_id"], "run-42");
        assert_eq!(v["done"], 1);
        assert_eq!(v["total"], 2);
    }
}
