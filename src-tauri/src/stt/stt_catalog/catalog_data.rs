//! Bảng model engine STT (dữ liệu tịnh) — tách khỏi logic trong `stt_catalog.rs`.

use super::catalog_types::SttEngineSpec;
use crate::model_download::ModelFile;

/// Hugging Face mirror (reliable from VN) — `resolve/main` gives a direct link.
const HF: &str = "https://huggingface.co";
/// Upstream release assets (sherpa-onnx `asr-models` GitHub release).
const GH_REL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models";

/// File hosted on Hugging Face with a verified SHA-256.
fn hf_file(repo: &str, file: &str, bytes: u64, sha256: &str) -> ModelFile {
    ModelFile::new(
        format!("{HF}/{repo}/resolve/main/{file}"),
        file,
        bytes,
    )
    .with_sha256(sha256)
}

/// Release asset (`.tar.bz2`) with the digest published by the GitHub API.
pub(crate) fn gh_asset(file: &str, bytes: u64, sha256: &str) -> ModelFile {
    ModelFile::new(format!("{GH_REL}/{file}"), "_archive.tar.bz2", bytes).with_sha256(sha256)
}


/// Engine whisper.cpp (dùng sẵn có trong app).
pub(crate) fn whisper_entries() -> Vec<SttEngineSpec> {
    vec![
        SttEngineSpec {
            id: "whisper-large-v3-turbo".to_string(),
            name: "Whisper large-v3-turbo (q8_0)".to_string(),
            label: "Whisper large-v3-turbo".to_string(),
            family: "whisper".to_string(),
            languages: vec![
                "zh".into(), "en".into(), "vi".into(), "ja".into(), "ko".into(),
            ],
            lang_label: "Đa ngôn ngữ (99 ngôn ngữ)".to_string(),
            desc: "Engine mặc định của Sublix. Nhận dạng đa ngôn ngữ, có timestamp tốt. Chậm trên CPU (RTF 1,22–1,62) nhưng trên RTX 3090 CUDA rất nhanh.".to_string(),
            size_mb: 834,
            size_note: "≈834 MB".to_string(),
            license: "MIT (OpenAI Whisper)".to_string(),
            rtf_note: "RTF 1,22 (EN) · 1,62 (ZH) — CPU 4 luồng · 0,02 trên RTX 3090 CUDA".to_string(),
            requires_cuda: false,
            word_timestamps: true,
            notes: "Giữ nguyên làm mặc định để không đổi hành vi cũ.".to_string(),
            builtin: true,
            whisper_variant: Some("large-v3-turbo-q8_0".to_string()),
            archive: false,
            files: vec![],
            required: vec![],
        },
        SttEngineSpec {
            id: "whisper-base".to_string(),
            name: "Whisper base".to_string(),
            label: "Whisper base".to_string(),
            family: "whisper".to_string(),
            languages: vec!["zh".into(), "en".into(), "vi".into()],
            lang_label: "Đa ngôn ngữ (99 ngôn ngữ)".to_string(),
            desc: "Bản whisper nhẹ nhất, chạy nhanh trên CPU yếu. Độ chính xác khá nhưng đọc tiếng Trung kém hơn SenseVoice.".to_string(),
            size_mb: 142,
            size_note: "≈142 MB".to_string(),
            license: "MIT (OpenAI Whisper)".to_string(),
            rtf_note: "RTF 0,16 (EN) · 0,14 (ZH) — CPU 4 luồng".to_string(),
            requires_cuda: false,
            word_timestamps: true,
            notes: "Nhẹ nhất — hợp máy không có GPU.".to_string(),
            builtin: true,
            whisper_variant: Some("base".to_string()),
            archive: false,
            files: vec![],
            required: vec![],
        },
        // ------------------------------------------------------------------
        // sherpa-onnx — Chinese + English (đã đo thật trên máy dev)
        // ------------------------------------------------------------------
    ]
}

/// Engine sherpa-onnx phác bỉ (Trung / CJK).
pub(crate) fn cjk_entries() -> Vec<SttEngineSpec> {
    vec![
        SttEngineSpec {
            id: "sensevoice-zh-en".to_string(),
            name: "SenseVoice Small (int8 · 2024-07-17)".to_string(),
            label: "SenseVoice Small".to_string(),
            family: "sensevoice".to_string(),
            languages: vec!["zh".into(), "yue".into(), "en".into(), "ja".into(), "ko".into()],
            lang_label: "Trung · Anh · Cantonese · Nhật · Hàn".to_string(),
            desc: "Model phiên âm không tự hồi quy của FunASR: đọc tiếng Trung chính xác hơn Whisper, CÓ DẤU CÂU, chạy nhanh hơn whisper turbo ~20× trên CPU.".to_string(),
            size_mb: 239,
            size_note: "≈228 MB (model) + 0,3 MB (tokens)".to_string(),
            license: "FunASR Model License — thương mại OK (cần ghi nguồn FunASR/SenseVoice)".to_string(),
            rtf_note: "RTF 0,067 (EN) · 0,065 (ZH) — CPU 4 luồng".to_string(),
            requires_cuda: false,
            word_timestamps: true,
            notes: "Đo thật: WER 7,18 % (EN) · CER 4,72 % (ZH) — ngang fp32 nhưng nhẹ hơn 2×. Có timestamp từ.".to_string(),
            builtin: false,
            whisper_variant: None,
            archive: false,
            files: vec![
                hf_file(
                    "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17",
                    "model.int8.onnx",
                    239_233_841,
                    "c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51",
                ),
                hf_file(
                    "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17",
                    "tokens.txt",
                    315_894,
                    "f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc",
                ),
            ],
            required: vec!["model.int8.onnx".to_string(), "tokens.txt".to_string()],
        },
        SttEngineSpec {
            id: "sensevoice-nano".to_string(),
            name: "SenseVoice funASR-Nano (int8 · 2025-12-17)".to_string(),
            label: "SenseVoice Nano".to_string(),
            family: "sensevoice".to_string(),
            languages: vec!["zh".into(), "yue".into(), "en".into(), "ja".into(), "ko".into()],
            lang_label: "Trung · Anh · Cantonese · Nhật · Hàn".to_string(),
            desc: "Thế hệ SenseVoice mới (FunASR-Nano): nhanh hơn, hỗ trợ nhiều ngôn ngữ hơn, dùng Apache-2.0 (thương mại thoải mái hơn).".to_string(),
            size_mb: 251,
            size_note: "≈251 MB (model) + 0,9 MB (tokens)".to_string(),
            license: "Apache-2.0 — thương mại OK".to_string(),
            rtf_note: "RTF 0,052 (EN) · 0,038 (ZH) — CPU 4 luồng".to_string(),
            requires_cuda: false,
            word_timestamps: true,
            notes: "Đo thật: WER 24,64 % (EN) · CER 8,15 % (ZH) — nhanh nhất nhóm CJK nhưng kém hơn bản 2024 về tiếng Anh.".to_string(),
            builtin: false,
            whisper_variant: None,
            archive: false,
            files: vec![
                hf_file(
                    "csukuangfj/sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17",
                    "model.int8.onnx",
                    263_531_902,
                    "9dc6e72aa8bc6f5966cf2857a0ce3a425b1d72e91500e147d66329f407c017a1",
                ),
                hf_file(
                    "csukuangfj/sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17",
                    "tokens.txt",
                    939_815,
                    "2db4bb25d046e8849e336c9465e248e1694914d996c58c71bdeca18cfb722992",
                ),
            ],
            required: vec!["model.int8.onnx".to_string(), "tokens.txt".to_string()],
        },
        SttEngineSpec {
            id: "paraformer-zh".to_string(),
            name: "Paraformer-zh (int8 · 2024-03-09)".to_string(),
            label: "Paraformer-zh".to_string(),
            family: "paraformer".to_string(),
            languages: vec!["zh".into()],
            lang_label: "Tiếng Trung".to_string(),
            desc: "Mô hình Trung chuyên của FunASR (encoder-decoder, không dùng cross-attention nên rất nhanh). Nhẹ nhất trong nhóm CJK, chuyên cho video Douyin/Bilibili.".to_string(),
            size_mb: 217,
            size_note: "≈217 MB (model) + 0,07 MB (tokens)".to_string(),
            license: "FunASR Model License — thương mại OK (cần ghi nguồn FunASR)".to_string(),
            rtf_note: "RTF 0,032 (ZH) — CPU 4 luồng".to_string(),
            requires_cuda: false,
            word_timestamps: false,
            notes: "Đo thật: CER 5,79 % (ZH). KHÔNG có timestamp từ — thời gian câu được suy ra theo độ dài (đánh dấu 'synthetic').".to_string(),
            builtin: false,
            whisper_variant: None,
            archive: false,
            files: vec![
                hf_file(
                    "csukuangfj/sherpa-onnx-paraformer-zh-2024-03-09",
                    "model.int8.onnx",
                    227_330_205,
                    "90bc03034ae1bef9575f8cc798cd1519c8be8aa9e8b458a033e32017ff4d584c",
                ),
                hf_file(
                    "csukuangfj/sherpa-onnx-paraformer-zh-2024-03-09",
                    "tokens.txt",
                    75_354,
                    "6c0e3b35cece259829e6cb5b8d90d13db88f61ea3a2953d11898e4b2bfd7a2e2",
                ),
            ],
            required: vec!["model.int8.onnx".to_string(), "tokens.txt".to_string()],
        },
        SttEngineSpec {
            id: "paraformer-zh-small".to_string(),
            name: "Paraformer-zh small (int8)".to_string(),
            label: "Paraformer-zh small".to_string(),
            family: "paraformer".to_string(),
            languages: vec!["zh".into()],
            lang_label: "Tiếng Trung".to_string(),
            desc: "Bản rút gọn của Paraformer — nhẹ nhất catalog (78 MB) và nhanh nhất, dành cho máy yếu hoặc preview nhanh.".to_string(),
            size_mb: 78,
            size_note: "≈78 MB (model) + 0,07 MB (tokens)".to_string(),
            license: "FunASR Model License — thương mại OK (cần ghi nguồn FunASR)".to_string(),
            rtf_note: "RTF 0,016 (ZH) — CPU 4 luồng".to_string(),
            requires_cuda: false,
            word_timestamps: false,
            notes: "Đo thật: CER 12,66 % (ZH) — kém hơn bản đầy đủ rõ rệt, chỉ nên dùng khi thiếu dung lượng.".to_string(),
            builtin: false,
            whisper_variant: None,
            archive: false,
            files: vec![
                hf_file(
                    "csukuangfj/sherpa-onnx-paraformer-zh-small-2024-03-09",
                    "model.int8.onnx",
                    81_828_675,
                    "3ef6c19369b912f7caf3cef8e545c5ccd1a33d9d7ec792a46668dc41c4b229ec",
                ),
                hf_file(
                    "csukuangfj/sherpa-onnx-paraformer-zh-small-2024-03-09",
                    "tokens.txt",
                    75_352,
                    "4b2d964e18b9cf139b473003b6698fb2ed9a2a5ec55b93daa677b28f578897aa",
                ),
            ],
            required: vec!["model.int8.onnx".to_string(), "tokens.txt".to_string()],
        },
    ]
}
