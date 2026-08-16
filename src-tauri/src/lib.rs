// Sublix — Tauri v2 + Rust backend
//
// M0: Foundation (Hello World) — done
// M1: Audio capture (WASAPI loopback) — done (CLI mode for testing)
//
// Reference: https://tauri.app/develop/calling-rust/

use tauri::Manager;

pub mod audio;
pub mod stt;

use audio::{capture_to_wav, list_render_devices, AudioDevice, AudioFormat};
use stt::{transcribe_wav as stt_transcribe_wav, TranscriptionResult, ModelVariant};

/// Tauri command: list all available render (output) devices for loopback capture.
#[tauri::command]
fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    list_render_devices().map_err(|e| format!("{e:#}"))
}

/// Tauri command: capture system audio to a WAV file for N seconds.
///
/// Returns the audio format (sample rate, channels, bits per sample) used.
#[tauri::command]
fn capture_test(
    output_path: String,
    duration_secs: u32,
    device_index: Option<usize>,
) -> Result<AudioFormat, String> {
    capture_to_wav(&output_path, duration_secs, device_index).map_err(|e| format!("{e:#}"))
}

/// Tauri command: transcribe a WAV file using local Whisper (auto-downloads if needed).
#[tauri::command]
fn transcribe_test(
    wav_path: String,
    language: Option<String>,
    model_name: Option<String>,
) -> Result<TranscriptionResult, String> {
    // Allow model override
    if let Some(name) = model_name {
        if let Some(variant) = ModelVariant::from_name(&name) {
            let whisper = stt::whisper_local::WhisperLocal::new(variant)
                .map_err(|e| format!("{e:#}"))?;
            return whisper.transcribe(&wav_path, language.as_deref())
                .map_err(|e| format!("{e:#}"));
        }
    }
    stt_transcribe_wav(&wav_path, language.as_deref()).map_err(|e| format!("{e:#}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing for structured logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("sublix_lib=info,sublix=info")),
        )
        .with_target(false)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_audio_devices,
            capture_test,
            transcribe_test
        ])
        .setup(|app| {
            // Log successful startup
            tracing::info!("🚀 Sublix started (window: {:?})", app.get_webview_window("main").map(|w| w.title().unwrap_or_default().to_string()));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
