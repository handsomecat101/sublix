//! TSK-FEAT-VOICE-SAMPLE-CACHE — cache mẫu nghe thử theo `(engine, voice_id)`.
//!
//! Mẫu nghe thử được tổng hợp **1 lần** rồi lưu xuống đĩa; các lần sau phát
//! tức thì (không gọi lại TTS). Áp dụng cho **MỌI** engine:
//! - offline (Kokoro / VieNeu / ZeroTTS): tạo trước nền hoặc lazy.
//! - cloud: **chỉ** cache sau khi người dùng đã nghe 1 lần (không tự gọi API
//!   tốn tiền).
//!
//! - Ghi **atomic** (`.part` → rename) ⇒ không bao giờ đọc file dở.
//! - **Khoá theo giọng** ⇒ 2 lượt ghi cùng lúc không đè nhau.
//! - File hỏng (< 2KB / header WAV sai / ffprobe lỗi) bị **xoá** để tạo lại.
//!
//! Module con: [`store`] (lớp lưu trữ file) + [`prepare`] (tạo mẫu nền).

use anyhow::{Context, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

/// Lớp lưu trữ file mẫu (ghi atomic, dọn file hỏng).
pub mod store;
/// Tạo mẫu nền (nền, huỷ được, ưu tiên thấp).
pub mod prepare;

pub use prepare::{cancel_prepare, generate_kokoro_samples, maybe_auto_prepare, spawn_prepare};
pub use store::{
    list_cached_in, purge_if_broken, read_data_uri, sample_is_broken, too_small, wav_header_ok,
    write_atomic,
};

/// Engine offline có cache mẫu trên đĩa.
pub const ENGINE_KOKORO: &str = "kokoro";
pub const ENGINE_VIETNEU: &str = "vieneu";
pub const ENGINE_ZEROTTS: &str = "zerotts";
pub const ENGINE_CLOUD: &str = "cloud";

/// Câu mẫu tiếng Việt tự nhiên (~4s) dùng để nghe thử giọng.
pub const SAMPLE_PHRASE: &str =
    "Xin chào! Tôi là giọng đọc tiếng Việt của Sublix, rất vui được gặp bạn.";

/// File nhỏ hơn ngưỡng này coi như hỏng (mẫu tiếng Việt luôn > 20KB).
pub(crate) const MIN_SAMPLE_BYTES: u64 = 2048;

/// Số mẫu đã có / tổng số giọng của 1 engine.
#[derive(Debug, Clone, Serialize)]
pub struct VoiceSampleStatus {
    /// Engine ("kokoro" | "vieneu" | "zerotts" | "cloud").
    pub engine: String,
    /// Số mẫu đã có trên đĩa.
    pub ready: u32,
    /// Tổng số giọng của engine.
    pub total: u32,
}

/// Engine của 1 voice id (theo tiền tố). Không có tiền tố → cloud.
pub fn engine_of_voice(voice_id: &str) -> &'static str {
    let v = voice_id.trim();
    if v.starts_with(super::KOKORO_VOICE_PREFIX) {
        ENGINE_KOKORO
    } else if v.starts_with(super::VIETNEU_VOICE_PREFIX) {
        ENGINE_VIETNEU
    } else if v.starts_with(super::tts_zerotts::VOICE_PREFIX) {
        ENGINE_ZEROTTS
    } else {
        ENGINE_CLOUD
    }
}

/// Tên thư mục cache của engine (= **id model** trong `voice_models.rs`, nên mẫu
/// nằm cạnh model: `models/voice/<id-model>/samples/`; giữ layout cũ của Kokoro).
pub fn model_folder(engine: &str) -> &str {
    match engine {
        ENGINE_KOKORO => "kokoro-vi",
        ENGINE_VIETNEU => "vieneu-v3-turbo",
        ENGINE_ZEROTTS => "zerotts",
        _ => "cloud",
    }
}

/// Bỏ tiền tố engine khỏi voice id.
pub fn bare_voice(voice_id: &str) -> String {
    let v = voice_id.trim();
    v.strip_prefix(super::KOKORO_VOICE_PREFIX)
        .or_else(|| v.strip_prefix(super::VIETNEU_VOICE_PREFIX))
        .or_else(|| v.strip_prefix(super::tts_zerotts::VOICE_PREFIX))
        .unwrap_or(v)
        .trim()
        .to_string()
}

/// Bỏ tiền tố + thay ký tự lạ để làm tên file an toàn trên mọi ổ đĩa.
pub fn sanitize_voice(voice_id: &str) -> String {
    let bare = bare_voice(voice_id);
    let mut out = String::with_capacity(bare.len());
    for ch in bare.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "default".to_string()
    } else {
        out
    }
}

/// Đuôi file của 1 giọng (offline → wav, cloud → theo provider).
pub fn ext_for_voice(voice_id: &str) -> &'static str {
    super::voice_file_ext(voice_id)
}

/// Đuôi file theo thư mục cache (thư mục offline luôn chứa wav).
fn ext_for_folder(model_id: &str, voice_id: &str) -> &'static str {
    match model_id {
        "kokoro-vi" | "vieneu-v3-turbo" | "zerotts" => "wav",
        _ => ext_for_voice(voice_id),
    }
}

/// Thư mục cache mẫu của engine.
pub fn samples_dir(engine: &str) -> PathBuf {
    crate::config::app_base_dir()
        .join("models")
        .join("voice")
        .join(model_folder(engine))
        .join("samples")
}

/// Thư mục cache theo model id cũ (tương thích ngược, vd "kokoro-vi").
pub fn samples_dir_for_model(model_id: &str) -> PathBuf {
    crate::config::app_base_dir()
        .join("models")
        .join("voice")
        .join(model_id)
        .join("samples")
}

/// Đường dẫn file mẫu của 1 giọng trong thư mục `dir`.
pub fn sample_path_in(dir: &Path, voice_id: &str, ext: &str) -> PathBuf {
    dir.join(format!("{}.{ext}", sanitize_voice(voice_id)))
}

/// Khoá ghi theo giọng ⇒ 2 lượt ghi cùng lúc không đè nhau.
fn lock_for(key: &str) -> Arc<Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
    let map = LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut map = map.lock().unwrap_or_else(|e| e.into_inner());
    map.entry(key.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

/// Danh mục voice id (đầy đủ, có tiền tố engine) của 1 engine.
pub fn voices_of(engine: &str) -> Vec<String> {
    let list = match engine {
        ENGINE_KOKORO => super::get_kokoro_voices(),
        ENGINE_VIETNEU => super::tts_vieneu::get_voices(),
        ENGINE_ZEROTTS => super::tts_zerotts::get_voices(),
        _ => super::tts_cloud::get_voices(),
    };
    list.into_iter().map(|v| v.id).collect()
}

/// Engine đã cài đủ model + thư viện để tổng hợp mẫu?
pub fn engine_available(engine: &str) -> bool {
    match engine {
        ENGINE_KOKORO => super::kokoro_available(),
        ENGINE_VIETNEU => super::tts_vieneu::available(),
        ENGINE_ZEROTTS => super::tts_zerotts::available(),
        _ => true,
    }
}

/// Số mẫu đã có / tổng số giọng của engine.
pub fn status(engine: &str) -> VoiceSampleStatus {
    let dir = samples_dir(engine);
    let ready = list_cached_in(&dir).len() as u32;
    let total = voices_of(engine).len() as u32;
    VoiceSampleStatus {
        engine: engine.to_string(),
        ready,
        total,
    }
}

/// Mẫu đã cache của 1 giọng (tương thích lệnh cũ: model_id + voice_id).
pub fn sample_data_for_model(model_id: &str, voice_id: &str) -> Option<String> {
    let ext = ext_for_folder(model_id, voice_id);
    let dir = samples_dir_for_model(model_id);
    let path = sample_path_in(&dir, voice_id, ext);
    if purge_if_broken(&path) {
        return None;
    }
    read_data_uri(&path)
}

/// Tổng hợp 1 mẫu cho giọng rồi lưu cache (atomic). Trả **đường dẫn** file mẫu.
///
/// Đường dẫn tuyệt đối ⇒ frontend phát bằng **asset protocol**
/// (`convertFileSrc`) thay vì chuyển base64 qua IPC ⇒ lần nghe thứ 2 tức thì.
pub(super) fn synthesize_sample_path(
    engine: &str,
    voice_id: &str,
    text: &str,
) -> Result<Option<PathBuf>> {
    synthesize_sample_path_in(engine, voice_id, text, &samples_dir(engine))
}

/// Bản nhận **thư mục cache** làm tham số (để unit test không chạm thư mục thật).
pub(super) fn synthesize_sample_path_in(
    engine: &str,
    voice_id: &str,
    text: &str,
    dir: &Path,
) -> Result<Option<PathBuf>> {
    let name = sanitize_voice(voice_id);
    let ext = ext_for_voice(voice_id);
    let lock = lock_for(&format!("{engine}:{name}"));
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    let final_path = dir.join(format!("{name}.{ext}"));
    // Đã có mẫu hợp lệ → khỏi tổng hợp lại (đây là đường "phát tức thì").
    if final_path.exists() && !sample_is_broken(&final_path) {
        return Ok(Some(final_path));
    }
    let _ = fs::remove_file(&final_path);

    // Tổng hợp ra file tạm ngoài thư mục cache → đọc → ghi atomic vào cache.
    let tmp = std::env::temp_dir().join(format!(
        "sublix_voice_sample_{}.{ext}",
        super::gen_unique_id()
    ));
    let synth = super::synthesize_speech(text, voice_id, "+0%", "+0Hz", &tmp)
        .with_context(|| format!("Tổng hợp mẫu cho giọng {voice_id}"));
    let bytes = match synth {
        Ok(()) => fs::read(&tmp).context("Đọc file mẫu vừa tổng hợp")?,
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            return Err(e);
        }
    };
    let _ = fs::remove_file(&tmp);
    write_atomic(dir, &name, ext, &bytes)?;
    Ok(Some(final_path))
}

/// Tổng hợp 1 mẫu cho giọng rồi lưu cache (atomic). Trả data URI.
pub(super) fn synthesize_sample(
    engine: &str,
    voice_id: &str,
    text: &str,
) -> Result<Option<String>> {
    let Some(path) = synthesize_sample_path(engine, voice_id, text)? else {
        return Ok(None);
    };
    read_data_uri(&path).map(Some).ok_or_else(|| {
        anyhow::anyhow!("Mẫu nghe thử của giọng {voice_id} không đọc được sau khi tổng hợp.")
    })
}

/// Lazy: lấy mẫu trong cache; chưa có thì tổng hợp 1 lần rồi lưu lại.
pub fn ensure_sample(voice_id: &str, text: Option<&str>) -> Result<Option<String>> {
    let engine = engine_of_voice(voice_id);
    if let Some(uri) = sample_data_for_model(model_folder(engine), voice_id) {
        return Ok(Some(uri));
    }
    let phrase = sample_phrase(text);
    synthesize_sample(engine, voice_id, phrase)
}

/// Lazy: **đường dẫn tuyệt đối** tới file mẫu (đã cache hoặc vừa tổng hợp).
///
/// Dùng để phát bằng **asset protocol** (`convertFileSrc`) — không chuyển base64
/// qua IPC ⇒ lần nghe thứ 2 tức thì (trước đây mất ~1 s).
///
/// Khoá cache **không** chứa tên vai (chỉ `engine` + `voice_id`) ⇒ mọi vai dùng
/// chung 1 giọng vẫn dùng chung 1 file mẫu.
pub fn ensure_sample_path(voice_id: &str, text: Option<&str>) -> Result<Option<String>> {
    let engine = engine_of_voice(voice_id);
    ensure_sample_path_in(engine, voice_id, text, &samples_dir(engine))
}

/// Bản nhận **thư mục cache** làm tham số (để unit test không chạm thư mục thật).
pub(super) fn ensure_sample_path_in(
    engine: &str,
    voice_id: &str,
    text: Option<&str>,
    dir: &Path,
) -> Result<Option<String>> {
    let ext = ext_for_folder(model_folder(engine), voice_id);
    if let Some(path) = cached_sample_path_in(dir, voice_id, ext) {
        return Ok(Some(path.to_string_lossy().to_string()));
    }
    let phrase = sample_phrase(text);
    Ok(synthesize_sample_path_in(engine, voice_id, phrase, dir)?
        .map(|p| p.to_string_lossy().to_string()))
}

/// Đường dẫn tuyệt đối tới mẫu **đã cache** theo model id (vd "kokoro-vi").
///
/// Tương đương `sample_data_for_model` nhưng trả path thay vì data URI.
pub fn sample_path_for_model(model_id: &str, voice_id: &str) -> Option<String> {
    let ext = ext_for_folder(model_id, voice_id);
    let dir = samples_dir_for_model(model_id);
    cached_sample_path_in(&dir, voice_id, ext).map(|p| p.to_string_lossy().to_string())
}

/// Đường dẫn file mẫu đã cache trong thư mục `dir` (None nếu chưa có / hỏng).
fn cached_sample_path_in(dir: &Path, voice_id: &str, ext: &str) -> Option<PathBuf> {
    let path = sample_path_in(dir, voice_id, ext);
    if purge_if_broken(&path) {
        return None;
    }
    path.exists().then_some(path)
}

/// Câu mẫu dùng để tổng hợp (rỗng ⇒ câu mặc định).
fn sample_phrase(text: Option<&str>) -> &str {
    text.map(|t| t.trim())
        .filter(|t| !t.is_empty())
        .unwrap_or(SAMPLE_PHRASE)
}

#[cfg(test)]
#[path = "voice_samples_tests.rs"]
mod voice_samples_tests;
