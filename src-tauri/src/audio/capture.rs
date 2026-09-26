//! WASAPI loopback audio capture.
//!
//! Uses Windows Core Audio API to capture system audio (the "what you hear" mix)
//! without needing a virtual audio cable. Works with any audio source: VLC,
//! browsers, games, Zoom, etc.
//!
//! Reference: https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording
//!
//! API used (wasapi 0.20):
//!   - DeviceCollection::new(Direction::Render) → enumerate
//!   - get_default_device(&Direction)         → default
//!   - Device::get_friendlyname()              → human name
//!   - Device::get_id()                        → Windows device path
//!   - Device::get_iaudioclient()              → AudioClient
//!   - AudioClient::get_mixformat()            → WaveFormat
//!   - AudioClient::initialize_client(...)     → init (loopback auto for shared)
//!   - AudioClient::get_audiocaptureclient()   → AudioCaptureClient
//!   - AudioClient::start_stream() / stop_stream()
//!   - AudioCaptureClient::get_next_packet_size()
//!   - AudioCaptureClient::read_from_device(&mut [u8]) → (frames, BufferInfo)

use anyhow::{Context, Result};
use serde::Serialize;
use std::time::{Duration, Instant};
use tracing::{info, warn};
use wasapi::{get_default_device, initialize_mta, Device, Direction, SampleType, StreamMode, WasapiError};

/// Information about an audio render (output) device.
#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    /// Stable device ID (Windows device path)
    pub id: String,
    /// Human-readable device name (e.g. "Speakers (Realtek Audio)")
    pub name: String,
}

/// Format of the audio stream. We standardize on the device's mix format in M1;
/// M2 will resample to f32 mono 16kHz for Whisper.
#[derive(Debug, Clone, Serialize)]
pub struct AudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub sample_type: String, // "float" or "int"
}

/// Best-effort COM initialization. Tauri WebView2 may have already initialized
/// COM in STA mode; in that case `CoInitializeEx(MTA)` returns `RPC_E_CHANGED_MODE`
/// but we can still use WASAPI in the existing apartment.
fn init_com_best_effort() {
    if let Err(e) = initialize_mta().ok() {
        warn!("COM init note (Tauri may have already init in STA): {e:?}");
    }
}

/// Enumerate all render (output) devices. All render devices can be used
/// for loopback capture.
pub fn list_render_devices() -> Result<Vec<AudioDevice>> {
    init_com_best_effort();

    let collection = wasapi::DeviceCollection::new(&Direction::Render)
        .context("Failed to enumerate render devices")?;

    // Iterate — IntoIterator yields Result<Device, WasapiError>
    let devices: Vec<Device> = (&collection)
        .into_iter()
        .collect::<Result<Vec<_>, WasapiError>>()
        .context("Failed to collect device list")?;

    let mut result = Vec::new();
    for device in devices {
        let name = device
            .get_friendlyname()
            .unwrap_or_else(|_| "(unnamed)".to_string());
        let id = device.get_id().unwrap_or_else(|_| "(no-id)".to_string());
        result.push(AudioDevice { id, name });
    }

    Ok(result)
}

/// Capture system audio for `duration_secs` seconds and write to a WAV file.
///
/// This is the M1 test path — captures directly to a WAV file for verification.
/// The streaming pipeline (M2) will reuse the underlying WASAPI loopback
/// logic but pipe samples into the STT queue instead of a writer.
pub fn capture_to_wav(
    output_path: &str,
    duration_secs: u32,
    device_index: Option<usize>,
) -> Result<AudioFormat> {
    // --- 1. Initialize COM (best effort) ---
    init_com_best_effort();

    // --- 2. Pick the device ---
    let device = if let Some(idx) = device_index {
        let collection = wasapi::DeviceCollection::new(&Direction::Render)
            .context("Failed to enumerate render devices")?;
        let devices: Vec<Device> = (&collection)
            .into_iter()
            .collect::<Result<Vec<_>, WasapiError>>()
            .context("Failed to collect device list")?;
        if idx >= devices.len() {
            return Err(anyhow::anyhow!(
                "Device index {idx} out of range (found {} devices)",
                devices.len()
            ));
        }
        devices.into_iter().nth(idx).unwrap()
    } else {
        get_default_device(&Direction::Render).context("Failed to get default render device")?
    };

    let device_name = device
        .get_friendlyname()
        .unwrap_or_else(|_| "(unnamed)".to_string());
    info!("📡 Capturing from device: {device_name}");

    // --- 3. Activate audio client ---
    let mut audio_client = device
        .get_iaudioclient()
        .context("Failed to activate IAudioClient")?;

    // --- 4. Get the mix format (the format the system is playing audio in) ---
    let mix_format = audio_client
        .get_mixformat()
        .context("Failed to get mix format")?;

    let sample_rate = mix_format.get_samplespersec();
    let channels = mix_format.get_nchannels();
    let bits_per_sample = mix_format.get_bitspersample();
    let sample_type = match mix_format.get_subformat() {
        Ok(SampleType::Float) => "float",
        Ok(SampleType::Int) => "int",
        _ => "unknown",
    };

    let format = AudioFormat {
        sample_rate,
        channels,
        bits_per_sample,
        sample_type: sample_type.to_string(),
    };
    info!(
        "🎚️  Mix format: {} Hz, {} ch, {} bits ({})",
        format.sample_rate, format.channels, format.bits_per_sample, format.sample_type
    );

    // --- 5. Initialize in LOOPBACK mode (auto-applied for shared render-capture) ---
    //    - Direction::Capture + Render device + Shared → AUDCLNT_STREAMFLAGS_LOOPBACK
    //    - 200ms buffer: low enough for responsive capture, high enough to avoid glitches
    let stream_mode = StreamMode::PollingShared {
        autoconvert: true,
        buffer_duration_hns: 200_000, // 200ms in 100-nanosecond units
    };
    audio_client
        .initialize_client(&mix_format, &Direction::Capture, &stream_mode)
        .context("Failed to initialize audio client (loopback mode)")?;

    // --- 6. Get the capture client ---
    let capture_client = audio_client
        .get_audiocaptureclient()
        .context("Failed to get IAudioCaptureClient")?;

    // --- 7. Open the WAV writer ---
    let wav_spec = hound::WavSpec {
        channels: format.channels,
        sample_rate: format.sample_rate,
        bits_per_sample: format.bits_per_sample,
        sample_format: if format.bits_per_sample == 32 {
            hound::SampleFormat::Float
        } else {
            hound::SampleFormat::Int
        },
    };
    let mut writer = hound::WavWriter::create(output_path, wav_spec)
        .with_context(|| format!("Failed to create WAV file: {output_path}"))?;

    // --- 8. Start the audio client ---
    audio_client
        .start_stream()
        .context("Failed to start audio client")?;
    info!("⏺️  Recording for {duration_secs}s...");

    // --- 9. Capture loop ---
    let start = Instant::now();
    let max_duration = Duration::from_secs(duration_secs as u64);
    let total_frames_per_channel = format.sample_rate as u64 * duration_secs as u64;
    let mut frames_written: u64 = 0;
    let mut packets_read: u64 = 0;

    // Byte size of one frame (interleaved) = channels * bytes_per_sample
    let bytes_per_sample = (format.bits_per_sample / 8) as usize;
    let bytes_per_frame = format.channels as usize * bytes_per_sample;
    // Allocate buffer for up to 100ms of audio at a time
    let buffer_frames = (format.sample_rate as usize) / 10; // 100ms
    let mut buffer = vec![0u8; buffer_frames * bytes_per_frame];

    while frames_written < total_frames_per_channel {
        // Safety: stop if max_duration exceeded
        if start.elapsed() >= max_duration + Duration::from_secs(1) {
            warn!("⚠️  Duration exceeded, stopping early");
            break;
        }

        // Check if a packet is available
        let packet_size = match capture_client.get_next_packet_size() {
            Ok(Some(n)) => n as usize,
            Ok(None) => {
                // No packet right now — sleep briefly and try again
                std::thread::sleep(Duration::from_millis(5));
                continue;
            }
            Err(e) => {
                warn!("get_next_packet_size error: {e:?}");
                std::thread::sleep(Duration::from_millis(5));
                continue;
            }
        };

        if packet_size == 0 {
            std::thread::sleep(Duration::from_millis(5));
            continue;
        }

        // Calculate how many frames fit in our buffer
        let frames_to_read = packet_size.min(buffer_frames);
        let bytes_to_read = frames_to_read * bytes_per_frame;
        let buf_slice = &mut buffer[..bytes_to_read];

        // Read the packet
        let (frames_returned, _info) = match capture_client.read_from_device(buf_slice) {
            Ok(r) => r,
            Err(e) => {
                warn!("read_from_device error: {e:?}");
                std::thread::sleep(Duration::from_millis(5));
                continue;
            }
        };

        if frames_returned == 0 {
            continue;
        }

        packets_read += 1;

        // Write samples to WAV. WASAPI gives us interleaved samples in the requested
        // format (f32 with autoconvert, or the device's native int format).
        let bytes_written = frames_returned as usize * bytes_per_frame;
        if format.bits_per_sample == 32 {
            // f32 — interpret bytes as f32
            for chunk in buffer[..bytes_written].chunks_exact(4) {
                let sample = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                writer.write_sample(sample).ok();
            }
        } else if format.bits_per_sample == 16 {
            // i16 — interpret bytes as i16
            for chunk in buffer[..bytes_written].chunks_exact(2) {
                let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                writer.write_sample(sample).ok();
            }
        } else {
            return Err(anyhow::anyhow!(
                "Unsupported bits per sample: {}",
                format.bits_per_sample
            ));
        }

        frames_written += frames_returned as u64;
    }

    // --- 10. Stop and finalize ---
    audio_client.stop_stream().ok();
    writer
        .finalize()
        .context("Failed to finalize WAV file")?;

    let elapsed = start.elapsed();
    info!(
        "✅ Wrote {} frames ({} packets) in {:.2}s → {}",
        frames_written,
        packets_read,
        elapsed.as_secs_f32(),
        output_path
    );

    Ok(format)
}
