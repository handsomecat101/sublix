//! Engine ZeroTTS (MIT, offline, ONNX, 48 kHz, tiếng Việt native, 8 giọng) — tiền tố `zerotts:`.
//! Đã chạy thật trên máy dev (CPU): RTF ≈ 0,72, WER whisper ≈ 1,7% trên 3 câu bench; tự đọc được ngày/số.
//! Không có clone trong bản này (model card) — chỉ giọng có sẵn.

use super::tts_common::{self, BatchItem, BatchResult};
use super::vi_normalize::normalize_vi;
use super::VoicePreset;
use anyhow::Result;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

pub const MODEL_ID: &str = "zerotts";
pub const VOICE_PREFIX: &str = "zerotts:";
const SCRIPT_NAME: &str = "zerotts_tts.py";
const SCRIPT: &str = include_str!("../../scripts/zerotts_tts.py");
pub const DEFAULT_VOICE: &str = "maichi";

/// (id, tên hiển thị, giới tính, mô tả) — theo `voices/index.json` của model.
pub const VOICES: [(&str, &str, &str, &str); 8] = [
    ("maichi", "Mai Chi", "female", "Nữ, trẻ, kể chuyện, nhẹ nhàng, thân thiện"),
    ("baotrang", "Bảo Trang", "female", "Nữ, trưởng thành, tin tức, rõ ràng, trung tính"),
    ("kimoanh", "Kim Oanh", "female", "Nữ, trung niên, kể chuyện, ấm áp, truyền cảm"),
    ("hamy", "Hà My", "female", "Nữ, trẻ, hoạt hình, cao, biểu cảm"),
    ("giahuy", "Gia Huy", "male", "Nam, trẻ, kể chuyện, trầm ấm, tâm tình"),
    ("huuduc", "Hữu Đức", "male", "Nam, lớn tuổi, kể chuyện, trầm, điềm đạm"),
    ("quangminh", "Quang Minh", "male", "Nam, trẻ, tin tức, rõ ràng, dứt khoát"),
    ("tiendat", "Tiến Đạt", "male", "Nam, trẻ, bình luận, sôi nổi, năng lượng cao"),
];

pub fn model_dir() -> PathBuf {
    crate::config::app_base_dir().join("models").join("voice").join(MODEL_ID)
}

const REQUIRED: [&str; 8] = [
    "config.json",
    "null_voice_emb.npy",
    "tokenizer.json",
    "onnx/text_encoder.onnx",
    "onnx/prefix_step.onnx",
    "onnx/local_frame_decode.onnx",
    "onnx/codec/moss_audio_tokenizer_decode_full.onnx",
    "voices/index.json",
];

pub fn model_present() -> bool {
    let dir = model_dir();
    REQUIRED.iter().all(|f| std::fs::metadata(dir.join(f)).map(|m| m.len() > 100).unwrap_or(false))
}

static DEPS_OK: AtomicBool = AtomicBool::new(false);

pub fn deps_ready() -> bool {
    if DEPS_OK.load(Ordering::Relaxed) {
        return true;
    }
    let ok = tts_common::python_has_modules(&["zerotts", "onnxruntime", "soundfile", "tokenizers"]);
    DEPS_OK.store(ok, Ordering::Relaxed);
    ok
}

pub fn available() -> bool {
    model_present() && deps_ready()
}

/// `zerotts:maichi` / `zerotts:Mai Chi` / id lạ → tên thư mục giọng hợp lệ (mặc định `maichi`).
pub fn parse_voice(voice: &str) -> String {
    let id = voice.trim().strip_prefix(VOICE_PREFIX).unwrap_or(voice.trim()).trim();
    VOICES
        .iter()
        .find(|(k, name, _, _)| k.eq_ignore_ascii_case(id) || name.eq_ignore_ascii_case(id))
        .map(|(k, _, _, _)| k.to_string())
        .unwrap_or_else(|| DEFAULT_VOICE.to_string())
}

pub fn get_voices() -> Vec<VoicePreset> {
    VOICES
        .iter()
        .map(|(id, name, gender, desc)| VoicePreset {
            id: format!("{VOICE_PREFIX}{id}"),
            name: format!("VN • {name} (ZeroTTS — offline)"),
            gender: gender.to_string(),
            lang: "vi".to_string(),
            description: format!("{desc} — ZeroTTS (MIT), đọc đúng ngày/số, cần tải model."),
        })
        .collect()
}

pub fn synthesize_batch(items: &[(String, String, PathBuf)]) -> Result<Vec<BatchResult>> {
    if !model_present() {
        anyhow::bail!("Chưa tải model ZeroTTS — vào trung tâm tải model để tải.");
    }
    let script = tts_common::ensure_script(SCRIPT_NAME, SCRIPT)?;
    let batch: Vec<BatchItem> = items
        .iter()
        .map(|(text, voice, out)| BatchItem {
            text: normalize_vi(text),
            voice: parse_voice(voice),
            out: out.clone(),
            ref_audio: None,
        })
        .collect();
    tts_common::run_batch(&script, &model_dir(), &batch)
}

pub fn synthesize_one(text: &str, voice: &str, out: &Path) -> Result<()> {
    let res = synthesize_batch(&[(text.to_string(), voice.to_string(), out.to_path_buf())])?;
    match res.into_iter().next() {
        Some(r) if r.ok => Ok(()),
        Some(r) => anyhow::bail!("ZeroTTS lỗi: {}", r.error.unwrap_or_default()),
        None => anyhow::bail!("ZeroTTS không trả kết quả"),
    }
}

pub fn install_deps(on_line: &mut dyn FnMut(&str)) -> Result<()> {
    tts_common::install_runtime_deps(on_line)?;
    tts_common::pip_install(&["--no-deps", "zerotts"], |l| on_line(l))?;
    tts_common::pip_install(
        &["numpy", "tokenizers", "huggingface_hub", "soundfile", "scipy", "sounddevice"],
        |l| on_line(l),
    )?;
    DEPS_OK.store(false, Ordering::Relaxed);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_voice_chap_nhan_id_va_ten() {
        assert_eq!(parse_voice("zerotts:giahuy"), "giahuy");
        assert_eq!(parse_voice("zerotts:Gia Huy"), "giahuy");
        assert_eq!(parse_voice("zerotts:khong-co"), DEFAULT_VOICE);
    }

    #[test]
    fn catalog_8_giong() {
        let v = get_voices();
        assert_eq!(v.len(), 8);
        assert_eq!(v.iter().filter(|x| x.gender == "male").count(), 4);
    }
}
