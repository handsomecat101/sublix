//! Engine VieNeu-TTS v3 Turbo (Apache-2.0, offline, 48 kHz, 25 giọng + clone) — tiền tố `vietneu:`.
//!
//! Trước đây `vietneu:*` chỉ là tên giả, backend map sang Kokoro (BUG-074). Giờ: nếu model VieNeu
//! ĐÃ TẢI + đã cài thư viện Python thì đọc bằng VieNeu thật; chưa thì fallback Kokoro như cũ
//! (project cũ không mất tiếng).
//!
//! Dạng id: `vietneu:<Tên giọng>` (vd `vietneu:Hải Đăng`), id cũ `vietneu:vi_bac_nam`… được map sang giọng thật,
//! và `vietneu:clone=<đường dẫn wav 3–10s>` = clone giọng từ clip mẫu (vd sample của vai từ diarization).

use super::tts_common::{self, BatchItem, BatchResult};
use super::vi_normalize::normalize_vi;
use super::{VoicePreset, VIETNEU_VOICE_PREFIX};
use anyhow::Result;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

pub const MODEL_ID: &str = "vieneu-v3-turbo";
const SCRIPT_NAME: &str = "vieneu_tts.py";
const SCRIPT: &str = include_str!("../../scripts/vieneu_tts.py");
const CLONE_PREFIX: &str = "clone=";
pub const DEFAULT_MALE: &str = "Hải Đăng";
pub const DEFAULT_FEMALE: &str = "Trúc Ly";

/// 25 giọng có sẵn của model (tên, giới tính, mô tả) — khớp `voices_v3_turbo.json` của VieNeu 3.8.3.
pub const PRESETS: [(&str, &str, &str); 25] = [
    ("Adam bựa", "male", "Nam · Bắc · tự nhiên"), ("Trúc Ly", "female", "Nữ · Bắc · tự nhiên"),
    ("Thiện Minh", "male", "Nam · Bắc · kể chuyện"), ("Mai Anh", "female", "Nữ · Bắc · tin tức"),
    ("Hải Đăng", "male", "Nam · Bắc · tự nhiên"), ("Thùy Dung", "female", "Nữ · Nam · tin tức"),
    ("Thiền Tâm Đức", "male", "Nam · Bắc · kể chuyện"), ("Ngọc Huyền", "female", "Nữ · Bắc · tự nhiên"),
    ("Quang Sơn", "male", "Nam · Trung · tự nhiên"), ("Ngọc Trân", "female", "Nữ · Trung · tự nhiên"),
    ("Minh Đức", "male", "Nam · Bắc · tin tức"), ("Phạm Tuyên", "male", "Nam · Bắc · tự nhiên"),
    ("Thái Sơn", "male", "Nam · Nam · kể chuyện"), ("Xuân Vĩnh", "male", "Nam · Bắc · tự nhiên"),
    ("Thanh Bình", "male", "Nam · Bắc · kể chuyện"), ("Ngọc Linh", "female", "Nữ · Bắc · kể chuyện"),
    ("Đoan Trang", "female", "Nữ · Bắc · tự nhiên"), ("Thục Đoan", "female", "Nữ · Nam · kể chuyện"),
    ("Minh Triết", "male", "Nam · Nam · tin tức"), ("Mỹ Duyên", "female", "Nữ · Nam · đọc truyện"),
    ("Quỳnh Anh", "female", "Nữ · Bắc · đọc truyện"), ("Đức Trí", "male", "Nam · Nam · đọc truyện"),
    ("Kim Thanh", "female", "Nữ · Nam · đọc truyện"), ("Adam", "male", "Nam · Nam · tự nhiên"),
    ("Quốc Tuấn", "male", "Nam · Bắc · tự nhiên"),
];

/// Giọng cũ của frontend (`vietneu:vi_bac_nam`…) → giọng VieNeu thật tương ứng (vùng miền + giới tính).
const LEGACY: [(&str, &str); 6] = [
    ("bac_nam", "Hải Đăng"), ("bac_nu", "Trúc Ly"), ("nam_nam", "Adam"),
    ("nam_nu", "Thùy Dung"), ("hue_nu", "Ngọc Trân"), ("thoisu", "Minh Đức"),
];

pub fn model_dir() -> PathBuf {
    crate::config::app_base_dir().join("models").join("voice").join(MODEL_ID)
}

/// File bắt buộc phải có để chạy (đủ cho cả clone).
const REQUIRED: [&str; 7] = [
    "onnx_update/vieneu_backbone_shared.data",
    "onnx_update/vieneu_prefill.onnx",
    "onnx_update/config.json",
    "speaker_encoder.onnx",
    "denoiser.onnx",
    "codec/moss_audio_tokenizer_decode_full.onnx",
    "codec/moss_audio_tokenizer_encode.onnx",
];

pub fn model_present() -> bool {
    let dir = model_dir();
    REQUIRED.iter().all(|f| std::fs::metadata(dir.join(f)).map(|m| m.len() > 1024).unwrap_or(false))
}

static DEPS_OK: AtomicBool = AtomicBool::new(false);

pub fn deps_ready() -> bool {
    if DEPS_OK.load(Ordering::Relaxed) {
        return true;
    }
    let ok = tts_common::python_has_modules(&["vieneu", "onnxruntime", "soundfile", "sea_g2p"]);
    DEPS_OK.store(ok, Ordering::Relaxed);
    ok
}

/// Dùng được VieNeu thật: model đã tải VÀ thư viện Python đã cài.
pub fn available() -> bool {
    model_present() && deps_ready()
}

/// Tách id thành (tên giọng, clip clone). Id lạ/cũ → giọng mặc định theo giới tính đoán từ tên.
pub fn parse_voice(voice: &str) -> (String, Option<PathBuf>) {
    let id = voice.trim().strip_prefix(VIETNEU_VOICE_PREFIX).unwrap_or(voice.trim()).trim();
    if let Some(p) = id.strip_prefix(CLONE_PREFIX) {
        return (DEFAULT_MALE.to_string(), Some(PathBuf::from(p.trim())));
    }
    if let Some((name, _, _)) = PRESETS.iter().find(|(n, _, _)| n.eq_ignore_ascii_case(id)) {
        return (name.to_string(), None);
    }
    // thứ tự khớp: "bac_nu" phải được thử trước "bac_nam"? — hai chuỗi không chứa nhau nên an toàn
    for (key, name) in LEGACY {
        if id.contains(key) {
            return (name.to_string(), None);
        }
    }
    let female = id.contains("_nu") || id.to_lowercase().contains("female");
    ((if female { DEFAULT_FEMALE } else { DEFAULT_MALE }).to_string(), None)
}

/// Quyết định engine thật dùng: `vietneu:*` → giữ nguyên nếu `vieneu_ready`, ngược lại Kokoro (BUG-074).
pub fn route_voice_with(voice: &str, vieneu_ready: bool) -> String {
    if voice.trim().starts_with(VIETNEU_VOICE_PREFIX) && vieneu_ready {
        return voice.trim().to_string();
    }
    super::normalize_voice_id(voice)
}

pub fn route_voice(voice: &str) -> String {
    let wants = voice.trim().starts_with(VIETNEU_VOICE_PREFIX);
    route_voice_with(voice, wants && available())
}

pub fn get_voices() -> Vec<VoicePreset> {
    PRESETS
        .iter()
        .map(|(name, gender, desc)| VoicePreset {
            id: format!("{VIETNEU_VOICE_PREFIX}{name}"),
            name: format!("VN • {name} (VieNeu v3 — offline)"),
            gender: gender.to_string(),
            lang: "vi".to_string(),
            description: format!("{desc} — VieNeu-TTS v3 Turbo, 48 kHz, cần tải model."),
        })
        .collect()
}

/// Đọc nhiều câu bằng 1 tiến trình (model nạp 1 lần). `items` = (text, voice id, file ra).
pub fn synthesize_batch(items: &[(String, String, PathBuf)]) -> Result<Vec<BatchResult>> {
    if !model_present() {
        anyhow::bail!("Chưa tải model VieNeu-TTS v3 Turbo — vào trung tâm tải model để tải.");
    }
    let script = tts_common::ensure_script(SCRIPT_NAME, SCRIPT)?;
    let batch: Vec<BatchItem> = items
        .iter()
        .map(|(text, voice, out)| {
            let (name, clone) = parse_voice(voice);
            BatchItem { text: normalize_vi(text), voice: name, out: out.clone(), ref_audio: clone }
        })
        .collect();
    tts_common::run_batch(&script, &model_dir(), &batch)
}

pub fn synthesize_one(text: &str, voice: &str, out: &Path) -> Result<()> {
    let res = synthesize_batch(&[(text.to_string(), voice.to_string(), out.to_path_buf())])?;
    match res.into_iter().next() {
        Some(r) if r.ok => Ok(()),
        Some(r) => anyhow::bail!("VieNeu TTS lỗi: {}", r.error.unwrap_or_default()),
        None => anyhow::bail!("VieNeu TTS không trả kết quả"),
    }
}

/// Cài thư viện Python cho VieNeu (CPU hoặc CUDA tùy máy có NVIDIA không).
pub fn install_deps(on_line: &mut dyn FnMut(&str)) -> Result<()> {
    tts_common::install_runtime_deps(on_line)?;
    tts_common::pip_install(&["--no-deps", "vieneu"], |l| on_line(l))?;
    tts_common::pip_install(
        &["sea-g2p", "numpy", "soundfile", "soxr", "kaldi-native-fbank", "tokenizers", "huggingface_hub", "PyYAML", "librosa"],
        |l| on_line(l),
    )?;
    DEPS_OK.store(false, Ordering::Relaxed);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_cu_map_sang_giong_that() {
        assert_eq!(parse_voice("vietneu:vi_bac_nam").0, "Hải Đăng");
        assert_eq!(parse_voice("vietneu:vi_bac_nu").0, "Trúc Ly");
        assert_eq!(parse_voice("vietneu:vi_nam_nam").0, "Adam");
        assert_eq!(parse_voice("vietneu:vi_hue_nu").0, "Ngọc Trân");
        assert_eq!(parse_voice("vietneu:vi_bac_thoisu").0, "Minh Đức");
    }

    #[test]
    fn id_moi_va_clone() {
        assert_eq!(parse_voice("vietneu:Ngọc Huyền"), ("Ngọc Huyền".to_string(), None));
        assert_eq!(parse_voice("vietneu:ngọc huyền").0, "Ngọc Huyền");
        let (_, clone) = parse_voice(r"vietneu:clone=C:\tmp\ref.wav");
        assert_eq!(clone, Some(PathBuf::from(r"C:\tmp\ref.wav")));
        assert_eq!(parse_voice("vietneu:???_nu").0, DEFAULT_FEMALE);
    }

    #[test]
    fn migration_chua_tai_thi_fallback_kokoro() {
        assert_eq!(route_voice_with("vietneu:vi_bac_nam", false), "kokoro:tuan_ngoc");
        assert_eq!(route_voice_with("vietneu:vi_bac_nu", false), "kokoro:mai_linh");
        assert_eq!(route_voice_with("vietneu:Hải Đăng", false), "kokoro:tuan_ngoc");
    }

    #[test]
    fn migration_da_tai_thi_dung_vieneu_that() {
        assert_eq!(route_voice_with("vietneu:vi_bac_nam", true), "vietneu:vi_bac_nam");
        assert_eq!(route_voice_with("kokoro:mai_linh", true), "kokoro:mai_linh");
        assert_eq!(route_voice_with("vi-VN-HoaiMyNeural", true), "vi-VN-HoaiMyNeural");
    }

    #[test]
    fn catalog_25_giong_khong_trung() {
        let v = get_voices();
        assert_eq!(v.len(), 25);
        let mut ids: Vec<_> = v.iter().map(|x| x.id.clone()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 25);
        assert!(v.iter().all(|x| x.id.starts_with("vietneu:") && (x.gender == "male" || x.gender == "female")));
    }
}
