//! STT (Speech-to-Text) module
//!
//! Exposes both:
//! - `whisper_server`: long-running HTTP server (CUDA GPU / CPU) with hot-swappable models
//! - `whisper_local`: model management, hallucination filtering, and subprocess fallback

pub mod whisper_local;
pub mod whisper_server;

pub use whisper_local::{
    clean_whisper_transcript, ensure_binary_with_engine, ensure_local_whisper, ensure_model,
    has_binary as has_whisper_binary, has_model as has_stt_model, transcribe_wav, ModelVariant,
    SttEngine, TranscriptionResult, WhisperLocal, TRANSCRIBE_LANG_OPTIONS,
};
pub use whisper_server::{
    current_engine as stt_server_engine, current_model as stt_server_model,
    preload_server as preload_stt_server, transcribe_via_server, EnginePreference,
};
