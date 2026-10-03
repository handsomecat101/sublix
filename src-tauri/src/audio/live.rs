//! Live capture pipeline — Continuous WASAPI Loopback + Smart VAD + GPU Whisper + GPU LLM.
//!
//! Architecture (v0.5.0 Zero-Gap Pipeline):
//!   1. **Producer Thread (Continuous Audio + Smart VAD)**:
//!      - Opens WASAPI loopback stream ONCE and keeps it open continuously (0ms gap between chunks!).
//!      - Mixes down to mono and resamples to 16kHz float32 on the fly.
//!      - Emits real-time `audio:level` events (~8fps) for smooth VU meters.
//!      - Uses Smart VAD (Voice Activity Endpointing): keeps a 250ms pre-roll buffer, detects
//!        speech onset, and slices at natural pauses (~360ms silence after >=1.2s speech) or
//!        at `chunk_seconds` max duration. Pure silence is skipped automatically.
//!   2. **Consumer Thread (STT + Translation Worker)**:
//!      - Receives 16kHz mono WAV chunks over a bounded channel (`crossbeam_channel`).
//!      - Transcribes via `whisper-server` (passing the user's selected `source_lang`!).
//!      - Translates via `llama-server` (`Qwen3-4B` / `Gemma-3-4B` / `Qwen2.5`) with 2-line context memory.
//!      - Emits `subtitle:new` to the Overlay and Settings windows.

use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tracing::{error, info, warn};
use wasapi::{
    get_default_device, initialize_mta, Device, Direction, SampleType, StreamMode, WasapiError,
};

use crate::stt::whisper_local::ModelVariant;
use crate::stt::EnginePreference;
use crate::translate::TranslationModelVariant;

/// Static state — the live pipeline's stop flag, if running.
static LIVE_STOP: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

struct AudioChunkJob {
    chunk_idx: u64,
    wav_path: PathBuf,
}

#[derive(Clone)]
pub struct LiveOptions {
    pub device_index: Option<usize>,
    pub stt_model: ModelVariant,
    pub translation_model: TranslationModelVariant,
    pub stt_pref: EnginePreference,
    pub trans_pref: EnginePreference,
    pub chunk_seconds: u32,
    pub vad_enabled: bool,
    pub source_lang: String,
    pub target_lang: String,
    pub output_mode: String,
    pub config: crate::config::AppConfig,
}

#[allow(clippy::too_many_arguments)]
pub fn start_live_capture(
    app: AppHandle,
    device_index: Option<usize>,
    model_name: Option<String>,
    chunk_seconds: u32,
    output_mode: Option<String>,
    target_lang: Option<String>,
    source_lang: Option<String>,
    translation_model: Option<String>,
    vad_enabled: Option<bool>,
) -> Result<(), String> {
    let mut guard = LIVE_STOP.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Err("Live capture already running".to_string());
    }

    let stop = Arc::new(AtomicBool::new(false));
    *guard = Some(stop.clone());

    let cfg = crate::config::AppConfig::load(&app);

    let stt_variant = model_name
        .as_deref()
        .or(Some(cfg.stt_model.as_str()))
        .and_then(ModelVariant::from_name)
        .filter(|v| crate::stt::has_stt_model(*v))
        .or_else(ModelVariant::best_installed)
        .unwrap_or(ModelVariant::LargeV3TurboQ8);

    let trans_variant = TranslationModelVariant::resolve_or_best(
        translation_model
            .as_deref()
            .or(Some(cfg.translation_model.as_str())),
    );

    let stt_pref = EnginePreference::from_str(&cfg.stt_engine_preference);
    let trans_pref = EnginePreference::from_str(&cfg.translation_engine_preference);

    let mode = match output_mode.as_deref().or(Some(cfg.output_mode.as_str())) {
        Some("original") => "original".to_string(),
        _ => "translated".to_string(),
    };
    let src_lang = source_lang
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| cfg.source_lang.clone());
    let tgt_lang = target_lang
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| cfg.target_lang.clone());
    let vad = vad_enabled.unwrap_or(cfg.vad_enabled);
    let chunk_secs = chunk_seconds.clamp(2, 10);

    // Clear previous subtitle context when starting a fresh session
    crate::translate::server::clear_context();

    let opts = LiveOptions {
        device_index,
        stt_model: stt_variant,
        translation_model: trans_variant,
        stt_pref,
        trans_pref,
        chunk_seconds: chunk_secs,
        vad_enabled: vad,
        source_lang: src_lang,
        target_lang: tgt_lang,
        output_mode: mode.clone(),
        config: cfg,
    };

    let _ = app.emit(
        "status:change",
        serde_json::json!({
            "kind": "capturing",
            "message": format!(
                "Live running ({} → {}, STT: {}, LLM: {})",
                opts.source_lang,
                if opts.output_mode == "translated" { &opts.target_lang } else { "original" },
                opts.stt_model.name(),
                opts.translation_model.name()
            )
        }),
    );

    info!(
        "🎙️ Live pipeline starting: device={:?}, stt={} ({}), llm={} ({}), chunk={}s, vad={}, {}→{} ({})",
        opts.device_index,
        opts.stt_model.name(),
        opts.stt_pref.as_str(),
        opts.translation_model.name(),
        opts.trans_pref.as_str(),
        opts.chunk_seconds,
        opts.vad_enabled,
        opts.source_lang,
        opts.target_lang,
        opts.output_mode
    );

    let (tx, rx) = bounded::<AudioChunkJob>(3);

    // Spawn Consumer Thread (STT + Translation)
    let app_worker = app.clone();
    let stop_worker = stop.clone();
    let opts_worker = opts.clone();
    std::thread::spawn(move || {
        run_inference_worker(app_worker, stop_worker, opts_worker, rx);
    });

    // Spawn Producer Thread (Continuous WASAPI Audio Capture + Smart VAD)
    std::thread::spawn(move || {
        run_continuous_capture(app, stop, opts, tx);
    });

    Ok(())
}

pub fn stop_live_capture(app: &AppHandle) -> Result<(), String> {
    let mut guard = LIVE_STOP.lock().map_err(|e| e.to_string())?;
    if let Some(stop) = guard.take() {
        stop.store(true, Ordering::SeqCst);
        info!("🛑 Live capture stop requested");
    }
    let _ = app.emit(
        "status:change",
        serde_json::json!({
            "kind": "idle",
            "message": "Live capture stopped"
        }),
    );
    Ok(())
}

pub fn is_running() -> bool {
    LIVE_STOP.lock().map(|g| g.is_some()).unwrap_or(false)
}

/// Producer thread: keeps WASAPI loopback stream open continuously and slices speech chunks.
fn run_continuous_capture(
    app: AppHandle,
    stop: Arc<AtomicBool>,
    opts: LiveOptions,
    tx: Sender<AudioChunkJob>,
) {
    let _ = initialize_mta();

    let device = match pick_render_device(opts.device_index) {
        Ok(d) => d,
        Err(e) => {
            error!("Audio device error: {e:#}");
            emit_error(&app, &format!("Audio device error: {e}"));
            clear_live_flag();
            return;
        }
    };

    let device_name = device
        .get_friendlyname()
        .unwrap_or_else(|_| "(unnamed)".to_string());
    info!("📡 Continuous WASAPI capture on: {device_name}");

    let mut audio_client = match device.get_iaudioclient() {
        Ok(c) => c,
        Err(e) => {
            emit_error(&app, &format!("IAudioClient error: {e}"));
            clear_live_flag();
            return;
        }
    };

    let mix_format = match audio_client.get_mixformat() {
        Ok(f) => f,
        Err(e) => {
            emit_error(&app, &format!("Mix format error: {e}"));
            clear_live_flag();
            return;
        }
    };

    let src_sr = mix_format.get_samplespersec();
    let channels = mix_format.get_nchannels() as usize;
    let bits_per_sample = mix_format.get_bitspersample();
    let is_float = matches!(mix_format.get_subformat(), Ok(SampleType::Float)) || bits_per_sample == 32;

    let stream_mode = StreamMode::PollingShared {
        autoconvert: true,
        buffer_duration_hns: 200_000, // 200ms buffer
    };
    if let Err(e) = audio_client.initialize_client(&mix_format, &Direction::Capture, &stream_mode) {
        emit_error(&app, &format!("Loopback init failed: {e}"));
        clear_live_flag();
        return;
    }

    let capture_client = match audio_client.get_audiocaptureclient() {
        Ok(c) => c,
        Err(e) => {
            emit_error(&app, &format!("Capture client error: {e}"));
            clear_live_flag();
            return;
        }
    };

    if let Err(e) = audio_client.start_stream() {
        emit_error(&app, &format!("Start stream failed: {e}"));
        clear_live_flag();
        return;
    }

    const TARGET_SR: usize = 16000;
    let max_chunk_samples = TARGET_SR * (opts.chunk_seconds as usize);
    let min_speech_samples = (TARGET_SR * 12) / 10; // 1.2s minimum before VAD pause cut
    let pause_cut_samples = (TARGET_SR * 36) / 100; // 360ms natural pause triggers endpoint
    let preroll_max_samples = TARGET_SR / 4; // 250ms pre-roll buffer
    let overlap_samples = TARGET_SR / 6; // ~165ms overlap when forced to cut mid-speech

    let bytes_per_sample = (bits_per_sample / 8) as usize;
    let bytes_per_frame = channels * bytes_per_sample;
    let buf_frames = (src_sr as usize) / 10;
    let mut raw_buf = vec![0u8; buf_frames * bytes_per_frame];

    let mut preroll: VecDeque<f32> = VecDeque::with_capacity(preroll_max_samples + 2048);
    let mut active_chunk: Vec<f32> = Vec::with_capacity(max_chunk_samples + 4096);
    let mut in_speech = false;
    let mut silence_run_samples: usize = 0;
    let mut chunk_peak: f32 = 0.0;
    let mut chunk_idx: u64 = 0;

    let mut last_level_emit = Instant::now();
    let mut window_peak: f32 = 0.0;
    let mut last_packet_time = Instant::now();

    while !stop.load(Ordering::SeqCst) {
        let packet_size = match capture_client.get_next_packet_size() {
            Ok(Some(n)) => n as usize,
            _ => 0,
        };

        let mut mono_16k_batch: Vec<f32> = Vec::new();

        if packet_size > 0 {
            let frames_to_read = packet_size.min(buf_frames);
            let bytes_to_read = frames_to_read * bytes_per_frame;
            if let Ok((frames_returned, _)) =
                capture_client.read_from_device(&mut raw_buf[..bytes_to_read])
            {
                if frames_returned > 0 {
                    last_packet_time = Instant::now();
                    let valid_bytes = &raw_buf[..frames_returned as usize * bytes_per_frame];
                    let mono_src = decode_to_mono_f32(valid_bytes, channels, bits_per_sample, is_float);
                    mono_16k_batch = resample_16k(&mono_src, src_sr, TARGET_SR as u32);
                }
            }
        } else {
            std::thread::sleep(Duration::from_millis(8));
            // When Windows audio output is completely idle (e.g. actor paused and no background music),
            // WASAPI loopback stops delivering packets. Synthesize 20ms of digital silence if we are
            // currently inside a speech segment so VAD pause detection can flush the finished sentence!
            if in_speech && last_packet_time.elapsed() >= Duration::from_millis(40) {
                mono_16k_batch = vec![0.0f32; TARGET_SR / 50]; // 20ms silence
                last_packet_time = Instant::now();
            }
        }

        if !mono_16k_batch.is_empty() {
            // Compute RMS and Peak of this mini-batch
            let mut batch_peak = 0.0f32;
            let mut sum_sq = 0.0f64;
            for &s in &mono_16k_batch {
                let a = s.abs();
                if a > batch_peak {
                    batch_peak = a;
                }
                sum_sq += (s as f64) * (s as f64);
            }
            let batch_rms = (sum_sq / mono_16k_batch.len() as f64).sqrt() as f32;
            if batch_peak > window_peak {
                window_peak = batch_peak;
            }

            let is_voice = batch_rms >= 0.0070 || batch_peak >= 0.032;

            if !in_speech {
                if is_voice {
                    // Speech started! Prepend the 250ms pre-roll so initial consonants are preserved
                    in_speech = true;
                    silence_run_samples = 0;
                    chunk_peak = batch_peak;
                    active_chunk.clear();
                    active_chunk.extend(preroll.iter().copied());
                    preroll.clear();
                    active_chunk.extend_from_slice(&mono_16k_batch);
                } else {
                    // Keep rolling 250ms pre-roll buffer
                    preroll.extend(mono_16k_batch.iter().copied());
                    while preroll.len() > preroll_max_samples {
                        preroll.pop_front();
                    }
                }
            } else {
                active_chunk.extend_from_slice(&mono_16k_batch);
                if batch_peak > chunk_peak {
                    chunk_peak = batch_peak;
                }
                if is_voice {
                    silence_run_samples = 0;
                } else {
                    silence_run_samples += mono_16k_batch.len();
                }

                let hit_natural_pause = opts.vad_enabled
                    && active_chunk.len() >= min_speech_samples
                    && silence_run_samples >= pause_cut_samples;
                let hit_max_length = active_chunk.len() >= max_chunk_samples;

                if hit_natural_pause || hit_max_length {
                    // If we cut at max length while still speaking, keep 165ms tail in preroll
                    preroll.clear();
                    if hit_max_length && silence_run_samples < pause_cut_samples / 2 {
                        let start_tail = active_chunk.len().saturating_sub(overlap_samples);
                        preroll.extend(active_chunk[start_tail..].iter().copied());
                    }

                    // Compute overall chunk RMS to guarantee genuine speech before invoking STT
                    let chunk_sum_sq: f64 = active_chunk.iter().map(|&s| (s as f64) * (s as f64)).sum();
                    let chunk_rms = (chunk_sum_sq / active_chunk.len().max(1) as f64).sqrt() as f32;

                    // Speech requirement: Peak >= 0.032 (3.2%) AND RMS >= 0.0055 AND length >= 0.5s
                    let has_real_speech = chunk_peak >= 0.032
                        && chunk_rms >= 0.0055
                        && active_chunk.len() >= (TARGET_SR / 2);

                    if has_real_speech {
                        if let Ok(wav_path) = write_16k_mono_wav(&active_chunk, chunk_idx) {
                            let job = AudioChunkJob {
                                chunk_idx,
                                wav_path,
                            };
                            match tx.try_send(job) {
                                Ok(()) => {}
                                Err(TrySendError::Full(dropped)) => {
                                    warn!("⚠️ STT queue full, skipping chunk #{} to stay real-time", dropped.chunk_idx);
                                    let _ = std::fs::remove_file(&dropped.wav_path);
                                }
                                Err(TrySendError::Disconnected(dropped)) => {
                                    let _ = std::fs::remove_file(&dropped.wav_path);
                                    break;
                                }
                            }
                            chunk_idx += 1;
                        }
                    }

                    active_chunk.clear();
                    in_speech = false;
                    silence_run_samples = 0;
                    chunk_peak = 0.0;
                }
            }
        }

        // Emit smooth audio:level every 120ms
        if last_level_emit.elapsed() >= Duration::from_millis(120) {
            let _ = app.emit(
                "audio:level",
                serde_json::json!({
                    "peak": window_peak,
                    "timestamp": now_ms()
                }),
            );
            window_peak *= 0.35; // Smooth decay when silent
            last_level_emit = Instant::now();
        }
    }

    let _ = audio_client.stop_stream();
    info!("🛑 Continuous WASAPI capture thread exited");
}

/// Consumer thread: runs STT (`whisper-server`) + Translation (`llama-server`) and emits subtitles.
fn run_inference_worker(
    app: AppHandle,
    stop: Arc<AtomicBool>,
    opts: LiveOptions,
    rx: Receiver<AudioChunkJob>,
) {
    // Pre-warm STT server (and Translation server if in translated mode) on worker startup
    let _ = app.emit(
        "status:change",
        serde_json::json!({
            "kind": "capturing",
            "message": format!("Loading {} on GPU...", opts.stt_model.name())
        }),
    );
    if let Err(e) = crate::stt::preload_stt_server(opts.stt_model, opts.stt_pref) {
        warn!("Failed to pre-warm STT server ({e}), will fall back to subprocess if needed");
    }
    if opts.output_mode == "translated" {
        let _ = app.emit(
            "status:change",
            serde_json::json!({
                "kind": "capturing",
                "message": format!("Loading {} on GPU...", opts.translation_model.name())
            }),
        );
        if let Err(e) = crate::translate::preload_server_with_options(
            opts.translation_model,
            opts.trans_pref,
        ) {
            warn!("Failed to pre-warm translation server ({e})");
        }
    }

    let _ = app.emit(
        "status:change",
        serde_json::json!({
            "kind": "capturing",
            "message": "Listening for audio..."
        }),
    );

    let mut last_emitted_original = String::new();

    while !stop.load(Ordering::SeqCst) {
        let job = match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(j) => j,
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => continue,
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
        };

        let wav_str = job.wav_path.to_string_lossy().to_string();
        let stt_start = Instant::now();

        let stt_res = crate::stt::transcribe_via_server(
            &wav_str,
            Some(opts.source_lang.as_str()),
            opts.stt_model,
            opts.stt_pref,
        );
        let stt_elapsed = stt_start.elapsed().as_secs_f32();
        let _ = std::fs::remove_file(&job.wav_path);

        match stt_res {
            Ok(result) => {
                let text = result.text.trim();
                if text.is_empty() || crate::stt::whisper_local::is_hallucination(text) {
                    continue;
                }
                // Deduplicate identical consecutive noise/overlap transcripts
                if text == last_emitted_original {
                    continue;
                }
                last_emitted_original = text.to_string();

                let effective_src_lang = if opts.source_lang == "auto" {
                    if result.language.is_empty() || result.language == "auto" {
                        "ja"
                    } else {
                        result.language.as_str()
                    }
                } else {
                    opts.source_lang.as_str()
                };

                let (display_text, translated_from, translated_to, trans_elapsed) =
                    if opts.output_mode == "translated"
                        && effective_src_lang.to_lowercase() != opts.target_lang.to_lowercase()
                    {
                        let t0 = Instant::now();
                        match crate::translate::translate_text_with_config(
                            text,
                            effective_src_lang,
                            &opts.target_lang,
                            opts.translation_model,
                            opts.trans_pref,
                            &opts.config,
                        ) {
                            Ok(t) if !t.trim().is_empty() => (
                                t,
                                Some(effective_src_lang.to_string()),
                                Some(opts.target_lang.clone()),
                                t0.elapsed().as_secs_f32(),
                            ),
                            Ok(_) => (text.to_string(), None, None, t0.elapsed().as_secs_f32()),
                            Err(e) => {
                                error!("Translation error: {e:#} — showing original");
                                (text.to_string(), None, None, t0.elapsed().as_secs_f32())
                            }
                        }
                    } else {
                        (text.to_string(), None, None, 0.0)
                    };

                // Drop if translated text is a silence hallucination (e.g. "Chúc ngủ ngon")
                if crate::stt::whisper_local::is_hallucination(&display_text) {
                    continue;
                }

                info!(
                    "🎬 Sub #{}: '{}' → '{}' (STT {:.2}s, LLM {:.2}s)",
                    job.chunk_idx, text, display_text, stt_elapsed, trans_elapsed
                );

                let _ = app.emit(
                    "subtitle:new",
                    serde_json::json!({
                        "id": job.chunk_idx,
                        "text": display_text,
                        "original": text,
                        "language": effective_src_lang,
                        "translated_from": translated_from,
                        "translated_to": translated_to,
                        "timestamp": now_ms(),
                        "audio_duration": result.audio_duration_secs,
                        "inference_duration": stt_elapsed + trans_elapsed,
                        "stt_duration": stt_elapsed,
                        "translate_duration": trans_elapsed,
                    }),
                );
            }
            Err(e) => {
                error!("STT error on chunk #{}: {e:#}", job.chunk_idx);
            }
        }
    }

    info!("🛑 Inference worker thread exited");
}

fn pick_render_device(device_index: Option<usize>) -> anyhow::Result<Device> {
    if let Some(idx) = device_index {
        let collection = wasapi::DeviceCollection::new(&Direction::Render)?;
        let devices: Vec<Device> = (&collection)
            .into_iter()
            .collect::<Result<Vec<_>, WasapiError>>()?;
        if idx >= devices.len() {
            return Err(anyhow::anyhow!(
                "Device index {idx} out of range (found {})",
                devices.len()
            ));
        }
        Ok(devices.into_iter().nth(idx).unwrap())
    } else {
        Ok(get_default_device(&Direction::Render)?)
    }
}

fn decode_to_mono_f32(
    bytes: &[u8],
    channels: usize,
    bits_per_sample: u16,
    is_float: bool,
) -> Vec<f32> {
    let ch = channels.max(1);
    if bits_per_sample == 32 && is_float {
        let total_samples = bytes.len() / 4;
        let frames = total_samples / ch;
        let mut mono = Vec::with_capacity(frames);
        for f in 0..frames {
            let mut sum = 0.0f32;
            for c in 0..ch {
                let offset = (f * ch + c) * 4;
                let s = f32::from_le_bytes([
                    bytes[offset],
                    bytes[offset + 1],
                    bytes[offset + 2],
                    bytes[offset + 3],
                ]);
                sum += s;
            }
            mono.push(sum / ch as f32);
        }
        mono
    } else if bits_per_sample == 16 {
        let total_samples = bytes.len() / 2;
        let frames = total_samples / ch;
        let mut mono = Vec::with_capacity(frames);
        for f in 0..frames {
            let mut sum = 0.0f32;
            for c in 0..ch {
                let offset = (f * ch + c) * 2;
                let s = i16::from_le_bytes([bytes[offset], bytes[offset + 1]]) as f32 / 32768.0;
                sum += s;
            }
            mono.push(sum / ch as f32);
        }
        mono
    } else {
        Vec::new()
    }
}

fn resample_16k(input: &[f32], from_sr: u32, to_sr: u32) -> Vec<f32> {
    if from_sr == to_sr || input.is_empty() {
        return input.to_vec();
    }
    let ratio = to_sr as f64 / from_sr as f64;
    let new_len = (input.len() as f64 * ratio) as usize;
    if new_len == 0 {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(new_len);
    let last = input.len() - 1;
    for i in 0..new_len {
        let src_idx = i as f64 / ratio;
        let idx0 = src_idx.floor() as usize;
        let idx1 = (idx0 + 1).min(last);
        let t = src_idx - idx0 as f64;
        let s = input[idx0] as f64 * (1.0 - t) + input[idx1] as f64 * t;
        out.push(s as f32);
    }
    out
}

fn write_16k_mono_wav(samples: &[f32], chunk_idx: u64) -> anyhow::Result<PathBuf> {
    let path = std::env::temp_dir().join(format!(
        "sublix-live-{}-{}.wav",
        std::process::id(),
        chunk_idx
    ));
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut writer = hound::WavWriter::create(&path, spec)?;
    for &s in samples {
        writer.write_sample(s)?;
    }
    writer.finalize()?;
    Ok(path)
}

fn emit_error(app: &AppHandle, msg: &str) {
    let _ = app.emit(
        "status:change",
        serde_json::json!({
            "kind": "error",
            "message": msg
        }),
    );
}

fn clear_live_flag() {
    if let Ok(mut g) = LIVE_STOP.lock() {
        *g = None;
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
