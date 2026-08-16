//! Audio module — capture system audio via WASAPI loopback
//!
//! Sublix captures whatever audio is playing on the Windows machine (VLC, browser,
//! Zoom, etc.) and processes it for real-time subtitle translation.
//!
//! M1 scope: capture to WAV file (debug/testing). M2 will add streaming pipeline.

pub mod capture;

pub use capture::{capture_to_wav, list_render_devices, AudioDevice, AudioFormat};
