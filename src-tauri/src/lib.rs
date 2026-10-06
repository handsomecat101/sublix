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
pub mod downloader;
pub mod dubbing;
pub mod file_sub;
pub mod overlay;
pub mod stt;
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

#[tauri::command]
fn transcribe_test(
    app: tauri::AppHandle,
    wav_path: String,
    language: Option<String>,
    model_name: Option<String>,
) -> Result<TranscriptionResult, String> {
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
}

/// One-shot test translation from the UI.
#[tauri::command]
fn translate_test(
    app: tauri::AppHandle,
    text: String,
    source_lang: String,
    target_lang: String,
    model_name: Option<String>,
) -> Result<String, String> {
    let cfg = config::AppConfig::load(&app);
    let variant = TranslationModelVariant::resolve_or_best(
        model_name
            .as_deref()
            .or(Some(cfg.translation_model.as_str())),
    );
    let pref = stt::EnginePreference::from_str(&cfg.translation_engine_preference);
    translate::translate_text_with_config(&text, &source_lang, &target_lang, variant, pref, &cfg)
        .map_err(|e| format!("{e:#}"))
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
            capture_test,
            transcribe_test,
            translate_test,
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
            dubbing_analyze,
            dubbing_preview_tts,
            dubbing_export,
            dubbing_cancel,
            dubbing_open_output_folder,
            downloader_get_info,
            downloader_start,
            downloader_pause,
            downloader_cancel,
            downloader_open_folder,
            downloader_reveal_file,
            downloader_open_file,
            downloader_downloads_dir,
            downloader_file_meta,
            downloader_check_disk,
            downloader_file_exists
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
    app.run(|_handle, event| {
        if let tauri::RunEvent::Exit = event {
            downloader::shutdown_all_jobs();
        }
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

#[tauri::command]
fn test_audio(device_index: Option<usize>) -> Result<AudioTestResult, String> {
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
}

#[derive(serde::Serialize)]
struct DeviceLevel {
    index: usize,
    name: String,
    peak_volume: f32,
    has_audio: bool,
    error: Option<String>,
}

#[tauri::command]
fn scan_audio_levels() -> Result<Vec<DeviceLevel>, String> {
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
            Ok(())
        }
        Err(e) => {
            let msg = format!("{e:#}");
            let _ = app.emit(
                "model:download_progress",
                serde_json::json!({ "component": "voice", "name": id, "phase": "error", "error": msg }),
            );
            Err(msg)
        }
    }
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
    stt::whisper_local::ensure_binary_with_engine().map_err(|e| {
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

#[tauri::command]
async fn dubbing_analyze(
    app: tauri::AppHandle,
    file_path: String,
    source_lang: Option<String>,
    target_lang: Option<String>,
    time_limit_sec: Option<f64>,
) -> Result<dubbing::DubbingProject, String> {
    tokio::task::spawn_blocking(move || {
        dubbing::analyze_and_create_project(Some(&app), &file_path, source_lang, target_lang, time_limit_sec)
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
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        dubbing::export_dubbed_video(Some(&app), project, output_path)
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


