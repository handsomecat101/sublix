// Sublix — Entry point
//
// Modes:
//   - GUI mode (no args): `sublix` or `npm run tauri dev` → opens Tauri app
//   - CLI mode (M1 testing): `sublix capture <seconds> <output.wav>` → captures audio
//   - CLI list mode: `sublix list-devices` → lists audio render devices

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(
    all(not(debug_assertions), not(feature = "cli")),
    windows_subsystem = "windows"
)]

use std::process::ExitCode;

fn main() -> ExitCode {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC in sublix main: {:?}\nLocation: {:?}\n", info, info.location());
        let _ = std::fs::write(std::env::temp_dir().join("sublix_crash.log"), &msg);
    }));

    let args: Vec<String> = std::env::args().collect();

    match args.get(1).map(String::as_str) {
        Some("capture") => run_capture(&args),
        Some("list-devices") => run_list_devices(),
        Some("transcribe") => run_transcribe(&args),
        Some("help") | Some("--help") | Some("-h") => {
            print_help();
            ExitCode::SUCCESS
        }
        None | Some(_) => {
            // No recognized CLI args → run as Tauri app
            sublix_lib::run();
            ExitCode::SUCCESS
        }
    }
}

/// CLI: sublix capture <seconds> [output.wav] [device_index]
fn run_capture(args: &[String]) -> ExitCode {
    // Initialize tracing for CLI
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(false)
        .init();

    let duration: u32 = args
        .get(2)
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| {
            eprintln!("⚠️  Using default duration: 5 seconds. Usage: sublix capture <seconds> [output.wav] [device_index]");
            5
        });
    let output = args
        .get(3)
        .cloned()
        .unwrap_or_else(|| format!("sublix-capture-{duration}s.wav"));
    let device_index: Option<usize> = args.get(4).and_then(|s| s.parse().ok());

    eprintln!("🎙️  Sublix audio capture (M1 test mode)");
    eprintln!("   Duration:  {duration} seconds");
    eprintln!("   Output:    {output}");
    if let Some(idx) = device_index {
        eprintln!("   Device:    index {idx}");
    } else {
        eprintln!("   Device:    default render device");
    }
    eprintln!();
    eprintln!("💡 Tip: start playing audio (e.g. open YouTube, play a video in VLC)");
    eprintln!("        THEN run this command to capture the audio mix.");
    eprintln!();

    match sublix_lib::audio::capture_to_wav(&output, duration, device_index) {
        Ok(format) => {
            eprintln!();
            eprintln!("✅ SUCCESS — WAV file written: {output}");
            eprintln!("   Format: {} Hz, {} channels, {} bits",
                format.sample_rate, format.channels, format.bits_per_sample);
            eprintln!("   Open the file in any audio player to verify.");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("❌ FAILED: {e:#}");
            ExitCode::FAILURE
        }
    }
}

/// CLI: sublix list-devices
fn run_list_devices() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(false)
        .init();

    match sublix_lib::audio::list_render_devices() {
        Ok(devices) => {
            eprintln!("🎚️  Available audio render (output) devices:");
            eprintln!();
            for (idx, dev) in devices.iter().enumerate() {
                eprintln!("  [{idx}] {name}", name = dev.name);
                eprintln!("      id: {id}", id = dev.id);
            }
            eprintln!();
            eprintln!("Use one with: sublix capture <seconds> <output.wav> {idx}", idx = 0);
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("❌ FAILED: {e:#}");
            ExitCode::FAILURE
        }
    }
}

/// CLI: sublix transcribe <wav_file> [model] [language]
///   model: tiny (75MB) | base (140MB) | small (465MB) | medium (1.5GB) | large-v3 (3GB) (default: tiny)
///   language: ja | en | vi | ... (default: auto)
///   Local — no API key needed. First run downloads whisper.cpp + model.
fn run_transcribe(args: &[String]) -> ExitCode {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(false)
        .init();

    let wav_path = match args.get(2) {
        Some(p) => p,
        None => {
            eprintln!("❌ Usage: sublix transcribe <wav_file> [model] [language]");
            eprintln!("   Example: sublix transcribe test.wav tiny ja");
            eprintln!();
            eprintln!("   Local Whisper — no API key needed.");
            eprintln!("   First run downloads whisper.cpp binary (~30MB) + model.");
            return ExitCode::FAILURE;
        }
    };
    let model_name = args.get(3).cloned().unwrap_or_else(|| "tiny".to_string());
    let language = args.get(4).cloned();

    eprintln!("🎙️ Sublix transcribe (M2 — LOCAL Whisper)");
    eprintln!("   WAV:      {wav_path}");
    eprintln!("   Model:    {model_name}");
    if let Some(ref lang) = language {
        eprintln!("   Language: {lang}");
    } else {
        eprintln!("   Language: auto");
    }
    eprintln!();

    // Resolve model variant
    let variant = match sublix_lib::stt::ModelVariant::from_name(&model_name) {
        Some(v) => v,
        None => {
            eprintln!("❌ Unknown model: {model_name}");
            eprintln!("   Valid: tiny, base, small, medium, large-v3");
            return ExitCode::FAILURE;
        }
    };

    // Run transcription
    match sublix_lib::stt::whisper_local::WhisperLocal::new(variant) {
        Ok(whisper) => match whisper.transcribe(wav_path, language.as_deref()) {
            Ok(result) => {
                result.print();
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("❌ Transcription failed: {e:#}");
                ExitCode::FAILURE
            }
        },
        Err(e) => {
            eprintln!("❌ Failed to setup local Whisper: {e:#}");
            ExitCode::FAILURE
        }
    }
}

fn print_help() {
    eprintln!("Sublix — Real-time subtitle overlay for any video");
    eprintln!();
    eprintln!("Usage:");
    eprintln!("  sublix                              Open the GUI (Tauri app)");
    eprintln!("  sublix capture <seconds> [out.wav] [device_idx]");
    eprintln!("                                       Capture system audio to WAV file");
    eprintln!("  sublix list-devices                 List audio output devices");
    eprintln!("  sublix transcribe <wav> [model] [lang]");
    eprintln!("                                       Transcribe WAV via LOCAL Whisper (no API key)");
    eprintln!("  sublix help                         Show this help");
    eprintln!();
    eprintln!("Models: tiny (75MB) | base (140MB) | small (465MB) | medium (1.5GB) | large-v3 (3GB)");
    eprintln!("Default: tiny (fastest, good enough for MVP)");
    eprintln!("Languages: ja, en, vi, zh, ko, ... (default: auto)");
    eprintln!();
    eprintln!("First-run downloads whisper.cpp binary (~30MB) + model. Cached for next runs.");
    eprintln!();
    eprintln!("Examples:");
    eprintln!("  sublix capture 10 test.wav             Capture 10s of system audio");
    eprintln!("  sublix transcribe test.wav tiny ja     Transcribe Japanese with tiny model");
    eprintln!("  sublix transcribe test.wav             Auto-detect language, default tiny model");
}
