//! STT (Speech-to-Text) module
//!
//! M2 (current): local whisper.cpp via subprocess — no API key, no LLVM needed.
//!   - Downloads prebuilt `whisper-cli.exe` (Windows) on first run
//!   - Downloads ggml-tiny.bin model (~75MB) on first run
//!   - Caches both in `binaries/` and `models/`
//! M2.5: streaming STT (chunked audio → live text)
//! M3: add cloud fallback (OpenAI Whisper API) for users who want better accuracy

pub mod whisper_local;

pub use whisper_local::{
    transcribe_wav, ensure_local_whisper, ModelVariant, WhisperLocal,
    TranscriptionResult, TRANSCRIBE_LANG_OPTIONS,
};
