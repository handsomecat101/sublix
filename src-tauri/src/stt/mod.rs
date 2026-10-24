//! STT (Speech-to-Text) module
//!
//! Exposes both:
//! - `whisper_server`: long-running HTTP server (CUDA GPU / CPU) with hot-swappable models
//! - `whisper_local`: model management, hallucination filtering, and subprocess fallback
//! - `stt_catalog`: catalog of offline engines (whisper.cpp + sherpa-onnx)
//! - `sherpa_asr`: recognition through the sherpa-onnx Python sidecar

pub mod sherpa_asr;
pub mod stt_catalog;
pub mod whisper_local;
pub mod whisper_server;

#[cfg(test)]
mod stt_integration_tests;

pub use sherpa_asr::{SttAsrResult, SttSegment};
pub use stt_catalog::{SttEngineSpec, SttEngineStatus};
pub use whisper_local::{
    clean_whisper_transcript, ensure_binary_with_engine, ensure_binary_with_engine_pref,
    ensure_local_whisper, ensure_model, ensure_model_with_progress,
    has_binary as has_whisper_binary, has_model as has_stt_model, transcribe_wav, ModelVariant,
    SttEngine, TranscriptionResult, WhisperLocal, TRANSCRIBE_LANG_OPTIONS,
};
pub use whisper_server::{
    current_engine as stt_server_engine, current_model as stt_server_model,
    preload_server as preload_stt_server, transcribe_via_server, EnginePreference,
};
