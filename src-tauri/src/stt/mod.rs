//! STT (Speech-to-Text) module
//!
//! M2 scope: file-based transcription via OpenAI Whisper API.
//! M2.5 will add: local whisper.cpp (when LLVM is available), streaming STT.
//! M3 will add: cloud STT fallback options (Deepgram for faster streaming).

pub mod openai;

pub use openai::{transcribe_wav, TranscriptionResult};
