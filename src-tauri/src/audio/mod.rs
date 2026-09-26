//! Audio module — capture system audio via WASAPI loopback
//!
//! Sublix captures whatever audio is playing on the Windows machine (VLC, browser,
//! Zoom, etc.) and processes it for real-time subtitle translation.
//!
//! M1: capture to WAV file (batch)
//! M2.5: live capture loop (real-time, 5s chunks)

pub mod capture;
pub mod live;

pub use capture::{capture_to_wav, list_render_devices, AudioDevice, AudioFormat};
pub use live::{is_running as is_live_running, start_live_capture, stop_live_capture};
