//! Voice & dubbing model catalog (2026 lineup) + in-app downloader.
//!
//! Sizes in the catalog are verified estimates (Hugging Face Files API, 2026-10).
//! The UI shows REAL byte progress while downloading. Files are stored under
//! `models/voice/<model_id>/` to avoid filename collisions between models.
//!
//! Download pattern reused from `translate/mod.rs` (streaming + temp + rename).

use anyhow::{Context, Result};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::PathBuf;

const HF: &str = "https://huggingface.co";

#[derive(Debug, Clone, Serialize)]
pub struct VoiceModelFile {
    pub url: String,
    pub filename: String,
    pub size_mb: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct VoiceModelStatus {
    pub id: String,
    pub name: String,
    pub label: String,
    pub desc: String,
    pub category: String,
    pub size_mb: u32,
    pub size_note: String,
    pub vram_note: String,
    pub license: String,
    pub vi_support: String,
    pub is_cloud: bool,
    pub files: Vec<VoiceModelFile>,
    pub downloaded: bool,
}

fn f(url: &str, filename: &str, size_mb: u32) -> VoiceModelFile {
    VoiceModelFile {
        url: url.to_string(),
        filename: filename.to_string(),
        size_mb,
    }
}

fn hf(repo: &str, file: &str, filename: &str, size_mb: u32) -> VoiceModelFile {
    f(&format!("{HF}/{repo}/resolve/main/{file}"), filename, size_mb)
}

pub fn catalog() -> Vec<VoiceModelStatus> {
    let specs: Vec<(
        &str, &str, &str, &str, &str, u32, &str, &str, &str, &str, bool, Vec<VoiceModelFile>,
    )> = vec![
        // ================= DANH SÁCH 1 — GIỌNG CLONE =================
        (
            "moss-tts-v1.5",
            "MOSS-TTS v1.5 (8B)",
            "MOSS-TTS v1.5",
            "Clone giọng zero-shot cao cấp: chỉ cần clip 3–10 giây, 31 ngôn ngữ CÓ tiếng Việt, đọc đoạn dài ổn định.",
            "clone",
            24679,
            "≈24,1 GB (đã gồm Audio-Tokenizer 7,1 GB)",
            "VRAM ước tính ~20 GB (bản nặng nhất — máy RTX 3090 chạy vừa)",
            "Apache-2.0 · Miễn phí",
            "yes",
            false,
            vec![
                hf("OpenMOSS-Team/MOSS-TTS-v1.5", "model-00001-of-00004.safetensors", "model-00001-of-00004.safetensors", 5050),
                hf("OpenMOSS-Team/MOSS-TTS-v1.5", "model-00002-of-00004.safetensors", "model-00002-of-00004.safetensors", 5038),
                hf("OpenMOSS-Team/MOSS-TTS-v1.5", "model-00003-of-00004.safetensors", "model-00003-of-00004.safetensors", 5099),
                hf("OpenMOSS-Team/MOSS-TTS-v1.5", "model-00004-of-00004.safetensors", "model-00004-of-00004.safetensors", 2202),
                hf("OpenMOSS-Team/MOSS-TTS-v1.5", "model.safetensors.index.json", "model.safetensors.index.json", 1),
                hf("OpenMOSS-Team/MOSS-TTS-v1.5", "tokenizer.json", "tokenizer.json", 12),
                hf("OpenMOSS-Team/MOSS-TTS-v1.5", "vocab.json", "vocab.json", 3),
                hf("OpenMOSS-Team/MOSS-TTS-v1.5", "merges.txt", "merges.txt", 2),
                hf("OpenMOSS-Team/MOSS-TTS-v1.5", "config.json", "config.json", 1),
                hf("OpenMOSS-Team/MOSS-Audio-Tokenizer", "model-00001-of-00002.safetensors", "at-model-00001-of-00002.safetensors", 5120),
                hf("OpenMOSS-Team/MOSS-Audio-Tokenizer", "model-00002-of-00002.safetensors", "at-model-00002-of-00002.safetensors", 2151),
            ],
        ),
        (
            "neutts-air-vi",
            "NeuTTS-Air Vietnamese",
            "NeuTTS-Air Vietnamese",
            "Tiếng Việt finetune 2,6 triệu mẫu: thanh điệu tự nhiên, clone giọng 3–10 giây, ~0,5 giây/câu trên RTX 3090.",
            "clone",
            3766,
            "≈3,7 GB (gồm codec neucodec 2,5 GB)",
            "VRAM ước tính 4–6 GB",
            "Apache-2.0 · Miễn phí",
            "yes",
            false,
            vec![
                hf("dinhthuan/neutts-air-vi", "model.safetensors", "model.safetensors", 1137),
                hf("dinhthuan/neutts-air-vi", "tokenizer.json", "tokenizer.json", 25),
                hf("dinhthuan/neutts-air-vi", "tokenizer_config.json", "tokenizer_config.json", 13),
                hf("dinhthuan/neutts-air-vi", "added_tokens.json", "added_tokens.json", 2),
                hf("dinhthuan/neutts-air-vi", "vocab.json", "vocab.json", 3),
                hf("dinhthuan/neutts-air-vi", "merges.txt", "merges.txt", 2),
                hf("dinhthuan/neutts-air-vi", "config.json", "config.json", 1),
                hf("dinhthuan/neutts-air-vi", "generation_config.json", "generation_config.json", 1),
                hf("dinhthuan/neutts-air-vi", "chat_template.jinja", "chat_template.jinja", 1),
                hf("neuphonic/neucodec", "model.safetensors", "neucodec-model.safetensors", 2581),
            ],
        ),
        (
            "f5-tts-vi",
            "F5-TTS Vietnamese (ViVoice)",
            "F5-TTS Vietnamese",
            "F5-TTS finetune 1.000 giờ Việt: clone mượt từ ~10 giây audio. ⚠️ Giấy phép phi thương mại.",
            "clone",
            5521,
            "≈5,4 GB",
            "VRAM ước tính 4–6 GB",
            "⚠️ CC-BY-NC-SA (phi thương mại)",
            "yes",
            false,
            vec![
                hf("hynt/F5-TTS-Vietnamese-ViVoice", "model_last.pt", "model_last.pt", 5520),
                hf("hynt/F5-TTS-Vietnamese-ViVoice", "config.json", "config.json", 1),
            ],
        ),
        (
            "vixtts",
            "viXTTS (XTTS-v2 Việt hoá)",
            "viXTTS",
            "XTTS-v2 finetune tiếng Việt: clone từ ~6 giây audio, gọn nhẹ 1,9 GB. ⚠️ License cần xem kỹ trước khi dùng thương mại.",
            "clone",
            1927,
            "≈1,9 GB",
            "VRAM ước tính 3–5 GB",
            "⚠️ CPML (phi thương mại — xem LICENSE)",
            "yes",
            false,
            vec![
                hf("capleaf/viXTTS", "model.pth", "model.pth", 1925),
                hf("capleaf/viXTTS", "config.json", "config.json", 1),
                hf("capleaf/viXTTS", "vocab.json", "vocab.json", 1),
            ],
        ),
        // ================= DANH SÁCH 2 — GIỌNG ĐỌC SẴN =================
        (
            "kokoro-vi",
            "Kokoro-Vietnamese",
            "Kokoro-Vietnamese",
            "14 giọng Việt đọc sẵn (tuấn ngọc, mai linh, ngọc huyền...), siêu nhẹ, chạy mượt cả CPU. Tải nhanh — dùng ngay.",
            "preset",
            329,
            "≈326 MB",
            "RAM ~0,5 GB — chạy được CPU (ONNX)",
            "Apache-2.0 · Miễn phí",
            "yes",
            false,
            vec![
                hf("minhtanmtst/Kokoro-Vietnamese", "kokoro_vi.onnx", "kokoro_vi.onnx", 326),
                hf("minhtanmtst/Kokoro-Vietnamese", "kokoro_vi_voicepack.pt", "kokoro_vi_voicepack.pt", 1),
                hf("minhtanmtst/Kokoro-Vietnamese", "config.json", "config.json", 1),
                hf("minhtanmtst/Kokoro-Vietnamese", "voices.json", "voices.json", 1),
            ],
        ),
        (
            "viet-tts",
            "VietTTS (24 giọng Việt + clone)",
            "VietTTS",
            "24 giọng Việt có sẵn (sơn tùng, nguyễn ngọc ngạn, doraemon...) kèm clone giọng và API OpenAI-compatible. ⚠️ Phi thương mại; cài chạy qua Docker trên Windows.",
            "preset",
            2344,
            "≈2,3 GB",
            "VRAM ước tính 4–6 GB",
            "⚠️ CC-BY-NC (phi thương mại)",
            "yes",
            false,
            vec![
                hf("dangvansam/viet-tts", "llm.pt", "llm.pt", 1290),
                hf("dangvansam/viet-tts", "speech_tokenizer.onnx", "speech_tokenizer.onnx", 523),
                hf("dangvansam/viet-tts", "flow.pt", "flow.pt", 420),
                hf("dangvansam/viet-tts", "hift.pt", "hift.pt", 82),
                hf("dangvansam/viet-tts", "speech_embedding.onnx", "speech_embedding.onnx", 28),
                hf("dangvansam/viet-tts", "config.yaml", "config.yaml", 1),
            ],
        ),
        (
            "qwen3-tts-0.6b",
            "Qwen3-TTS 0.6B (siêu nhẹ)",
            "Qwen3-TTS 0.6B",
            "Clone giọng từ 3 giây, trễ 97ms hợp realtime. ⚠️ 10 ngôn ngữ — CHƯA có tiếng Việt.",
            "preset",
            2565,
            "≈2,5 GB",
            "VRAM ước tính 3–4 GB",
            "Apache-2.0 · Miễn phí",
            "no",
            false,
            vec![
                hf("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "model.safetensors", "model.safetensors", 1874),
                hf("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "speech_tokenizer/model.safetensors", "speech_tokenizer-model.safetensors", 682),
                hf("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "merges.txt", "merges.txt", 2),
                hf("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "vocab.json", "vocab.json", 3),
                hf("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "config.json", "config.json", 1),
                hf("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "generation_config.json", "generation_config.json", 1),
                hf("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "preprocessor_config.json", "preprocessor_config.json", 1),
                hf("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "tokenizer_config.json", "tokenizer_config.json", 1),
            ],
        ),
        (
            "qwen3-tts-1.7b",
            "Qwen3-TTS 1.7B",
            "Qwen3-TTS 1.7B",
            "Chất lượng cao hơn bản 0.6B, clone + thiết kế giọng qua mô tả chữ. ⚠️ 10 ngôn ngữ — CHƯA có tiếng Việt.",
            "preset",
            4644,
            "≈4,5 GB",
            "VRAM ước tính 6–8 GB",
            "Apache-2.0 · Miễn phí",
            "no",
            false,
            vec![
                hf("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "model.safetensors", "model.safetensors", 3953),
                hf("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "speech_tokenizer/model.safetensors", "speech_tokenizer-model.safetensors", 682),
                hf("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "merges.txt", "merges.txt", 2),
                hf("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "vocab.json", "vocab.json", 3),
                hf("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "config.json", "config.json", 1),
                hf("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "generation_config.json", "generation_config.json", 1),
                hf("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "preprocessor_config.json", "preprocessor_config.json", 1),
                hf("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "tokenizer_config.json", "tokenizer_config.json", 1),
            ],
        ),
        // ================= DANH SÁCH 3 — PHÂN VAI =================
        (
            "sherpa-diarization",
            "sherpa-onnx Phân Vai (Diarization)",
            "sherpa-onnx Diarization",
            "Tách người nói — AI nhận diện 'ai nói câu nào' — siêu nhẹ, chạy CPU, offline 100%, dùng tốt cho audio tiếng Việt.",
            "diarization",
            34,
            "≈34 MB (gồm 1 gói nén .tar.bz2, giải nén khi tích hợp)",
            "Không cần GPU — CPU là đủ",
            "Apache-2.0 + CC-BY-4.0 · Miễn phí",
            "yes",
            false,
            vec![
                f(
                    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2",
                    "sherpa-onnx-pyannote-segmentation-3-0.tar.bz2",
                    7,
                ),
                f(
                    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx",
                    "wespeaker_en_voxceleb_resnet34_LM.onnx",
                    27,
                ),
            ],
        ),
        (
            "pyannote-3.1",
            "Pyannote 3.1 (chuẩn benchmark)",
            "Pyannote 3.1",
            "Phân vai chính xác bậc nhất (chuẩn DIHARD). ⚠️ Repo bị khóa trên HuggingFace — cần tài khoản + token nên chưa tải 1-click được.",
            "diarization",
            104,
            "≈104 MB — ⚠️ CẦN tài khoản HuggingFace (repo gated)",
            "VRAM ước tính 2–4 GB",
            "MIT",
            "yes",
            false,
            vec![],
        ),
        // ================= DANH SÁCH 4 — CLOUD =================
        (
            "moss-tts-api",
            "MOSS-TTS API (MOSI AI Studio)",
            "MOSS-TTS API",
            "Giọng MOSS qua đám mây — không cần tải gì, cần mạng.",
            "cloud",
            0,
            "Không cần tải",
            "Đám mây — 0 VRAM",
            "Theo gói dịch vụ",
            "yes",
            true,
            vec![],
        ),
        (
            "minimax-speech",
            "MiniMax Speech (đám mây)",
            "MiniMax Speech",
            "Giọng cloud chất lượng cao — nhập API key MiniMax trong tab Cài đặt để dùng.",
            "cloud",
            0,
            "Không cần tải",
            "Đám mây — 0 VRAM",
            "Theo gói dịch vụ",
            "yes",
            true,
            vec![],
        ),
        (
            "elevenlabs-v3",
            "ElevenLabs v3 (đám mây)",
            "ElevenLabs v3",
            "Giọng cloud tự nhiên hàng đầu, nhiều cảm xúc — cần tài khoản ElevenLabs và mạng.",
            "cloud",
            0,
            "Không cần tải",
            "Đám mây — 0 VRAM",
            "Theo gói dịch vụ",
            "partial",
            true,
            vec![],
        ),
    ];

    specs
        .into_iter()
        .map(|(id, name, label, desc, category, size_mb, size_note, vram_note, license, vi_support, is_cloud, files)| {
            let downloaded = !is_cloud
                && !files.is_empty()
                && files.iter().all(|file| {
                    let p = model_dir(id).join(&file.filename);
                    std::fs::metadata(&p).map(|m| m.len() > 1024).unwrap_or(false)
                });
            VoiceModelStatus {
                id: id.to_string(),
                name: name.to_string(),
                label: label.to_string(),
                desc: desc.to_string(),
                category: category.to_string(),
                size_mb,
                size_note: size_note.to_string(),
                vram_note: vram_note.to_string(),
                license: license.to_string(),
                vi_support: vi_support.to_string(),
                is_cloud,
                files,
                downloaded,
            }
        })
        .collect()
}

pub fn list() -> Vec<VoiceModelStatus> {
    catalog()
}

fn model_dir(id: &str) -> PathBuf {
    crate::config::app_base_dir().join("models").join("voice").join(id)
}

/// Download every file of a model sequentially with aggregate byte progress.
pub fn download_with_progress<F>(id: &str, mut on_progress: F) -> Result<PathBuf>
where
    F: FnMut(u64, u64, u32),
{
    let spec = catalog()
        .into_iter()
        .find(|s| s.id == id)
        .with_context(|| format!("Không tìm thấy model: {id}"))?;
    if spec.is_cloud {
        anyhow::bail!("Model cloud không tải về máy — hãy cấu hình API trong tab Cài đặt");
    }
    if spec.files.is_empty() {
        anyhow::bail!("Model này chưa hỗ trợ tải 1-click (cần tài khoản HuggingFace)");
    }
    let dir = model_dir(&spec.id);
    std::fs::create_dir_all(&dir).with_context(|| format!("Create {}", dir.display()))?;

    let total_all: u64 = spec.files.iter().map(|file| file.size_mb as u64 * 1_048_576).sum();
    let mut done_all: u64 = 0;
    for file in &spec.files {
        let dest = dir.join(&file.filename);
        if let Ok(meta) = std::fs::metadata(&dest) {
            if meta.len() > 1024 {
                done_all += meta.len();
                continue;
            }
        }
        let file_hint = file.size_mb as u64 * 1_048_576;
        let temp = dir.join(format!("{}.downloading", file.filename));
        let done = done_all;
        download_file_with_progress(&file.url, &temp, |got, total, _pct| {
            let this_total = if total > 0 { total } else { file_hint };
            let overall_total = if total_all > 0 { total_all } else { done + this_total };
            let overall = done + got;
            let pct = if overall_total > 0 {
                ((overall * 100) / overall_total) as u32
            } else {
                0
            };
            on_progress(overall, overall_total, pct.min(99));
        })?;
        std::fs::rename(&temp, &dest).with_context(|| {
            format!("Không đổi tên được file tải về {}", dest.display())
        })?;
        done_all += std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(file_hint);
    }
    on_progress(total_all, total_all, 100);
    Ok(dir)
}

fn download_file_with_progress<F>(url: &str, dest: &PathBuf, mut on_progress: F) -> Result<()>
where
    F: FnMut(u64, u64, u32),
{
    let client = reqwest::blocking::Client::builder()
        .user_agent("sublix/0.8.0")
        .timeout(std::time::Duration::from_secs(3600))
        .build()?;
    let mut response = client.get(url).send()?.error_for_status()?;
    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut dest_file = std::fs::File::create(dest)?;
    let mut buffer = [0u8; 256 * 1024];
    loop {
        let n = response.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        dest_file.write_all(&buffer[..n])?;
        downloaded += n as u64;
        if total > 0 {
            let pct = ((downloaded * 100) / total) as u32;
            on_progress(downloaded, total, pct);
        } else {
            on_progress(downloaded, 0, 0);
        }
    }
    dest_file.flush()?;
    Ok(())
}
