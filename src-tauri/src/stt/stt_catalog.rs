//! Catalog of offline STT engines available in Sublix (2026 lineup).
//!
//! Besides the built-in whisper.cpp engines, the catalog lists the
//! **sherpa-onnx** engines that are noticeably faster and more accurate on
//! Chinese. Sizes and SHA-256 checksums are the real values of the files that
//! were actually downloaded and benchmarked on the dev machine, so every
//! download is verified (bytes + checksum) before it is marked ready.
//!
//! Measured accuracy / speed numbers live in `docs/STT_MODELS_2026.md`.

use serde::Serialize;
use std::path::PathBuf;

use crate::model_download::ModelFile;

/// Hugging Face mirror (reliable from VN) — `resolve/main` gives a direct link.
const HF: &str = "https://huggingface.co";
/// Upstream release assets (sherpa-onnx `asr-models` GitHub release).
const GH_REL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models";

/// One engine in the catalog.
#[derive(Debug, Clone, Serialize)]
pub struct SttEngineSpec {
    pub id: String,
    pub name: String,
    pub label: String,
    /// `whisper` | `sensevoice` | `paraformer` | `parakeet`
    pub family: String,
    /// Language codes the model understands.
    pub languages: Vec<String>,
    /// Short human label for the language coverage.
    pub lang_label: String,
    pub desc: String,
    pub size_mb: u32,
    pub size_note: String,
    pub license: String,
    /// Measured real-time factor (lower = faster) + the machine it was measured on.
    pub rtf_note: String,
    pub requires_cuda: bool,
    /// Whether the engine exposes real word-level timestamps.
    pub word_timestamps: bool,
    pub notes: String,
    /// `true` when the model is managed by the existing whisper.cpp downloader.
    pub builtin: bool,
    /// whisper.cpp variant name (only for `builtin` engines).
    pub whisper_variant: Option<String>,
    /// `true` when `files` is a single `.tar.bz2` that must be extracted.
    pub archive: bool,
    /// Files to download (empty for `builtin` engines).
    pub files: Vec<ModelFile>,
    /// Files that must exist on disk for the engine to be ready.
    pub required: Vec<String>,
}

/// Live status of one engine (what the UI renders).
#[derive(Debug, Clone, Serialize)]
pub struct SttEngineStatus {
    pub id: String,
    pub name: String,
    pub label: String,
    pub family: String,
    pub languages: Vec<String>,
    pub lang_label: String,
    pub desc: String,
    pub size_mb: u32,
    pub size_note: String,
    pub license: String,
    pub rtf_note: String,
    pub requires_cuda: bool,
    pub word_timestamps: bool,
    pub notes: String,
    /// `not_downloaded` | `downloading` | `ready` | `error`
    pub state: String,
    pub downloaded: bool,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub progress_pct: u32,
    pub error: Option<String>,
    /// whisper.cpp stays the default engine until the user picks another one.
    pub is_default: bool,
    /// The engine currently selected in the config.
    pub selected: bool,
}

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
fn gh_asset(file: &str, bytes: u64, sha256: &str) -> ModelFile {
    ModelFile::new(format!("{GH_REL}/{file}"), "_archive.tar.bz2", bytes).with_sha256(sha256)
}

/// Full catalog. Whisper entries come first so they stay the default.
pub fn catalog() -> Vec<SttEngineSpec> {
    vec![
        // ------------------------------------------------------------------
        // Built-in whisper.cpp (already shipped with the app)
        // ------------------------------------------------------------------
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
        // ------------------------------------------------------------------
        // sherpa-onnx — English (chưa đo được trên máy dev — xem docs)
        // ------------------------------------------------------------------
        SttEngineSpec {
            id: "parakeet-v3".to_string(),
            name: "NVIDIA Parakeet TDT 0.6B v3 (int8)".to_string(),
            label: "Parakeet TDT v3".to_string(),
            family: "parakeet".to_string(),
            languages: vec!["en".into(), "de".into(), "fr".into(), "es".into(), "it".into()],
            lang_label: "25 ngôn ngữ châu Âu (không có Trung)".to_string(),
            desc: "Transducer TDT của NVIDIA — WER thấp nhất trong nhóm model 0,6B, có timestamp từ và dấu câu. Chuyên tiếng Anh và các ngôn ngữ châu Âu.".to_string(),
            size_mb: 465,
            size_note: "≈465 MB (gói .tar.bz2 chính thức)".to_string(),
            license: "CC-BY-4.0 (NVIDIA NeMo)".to_string(),
            rtf_note: "Chưa đo trên máy dev — công bố RTF ≈0,05–0,11 (CPU)".to_string(),
            requires_cuda: false,
            word_timestamps: true,
            notes: "⚠️ CHƯA KIỂM CHỨNG trên máy dev: tải release GitHub bị nghẽn mạng và bản mirror HF sai layout ONNX (sherpa-onnx 2.0.0 truyền tensor [N,T,C] còn model cần [N,C,T]). KHÔNG hỗ trợ tiếng Trung.".to_string(),
            builtin: false,
            whisper_variant: None,
            archive: true,
            files: vec![gh_asset(
                "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
                487_170_055,
                "5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf",
            )],
            required: vec![
                "encoder.int8.onnx".to_string(),
                "decoder.int8.onnx".to_string(),
                "joiner.int8.onnx".to_string(),
                "tokens.txt".to_string(),
            ],
        },
        SttEngineSpec {
            id: "parakeet-v2".to_string(),
            name: "NVIDIA Parakeet TDT 0.6B v2 (int8)".to_string(),
            label: "Parakeet TDT v2".to_string(),
            family: "parakeet".to_string(),
            languages: vec!["en".into()],
            lang_label: "Tiếng Anh".to_string(),
            desc: "Bản Parakeet v2 — chuyên tiếng Anh, có timestamp từ và dấu câu. Theo công bố nhanh hơn Whisper turbo nhiều lần trên CPU.".to_string(),
            size_mb: 460,
            size_note: "≈460 MB (gói .tar.bz2 chính thức)".to_string(),
            license: "CC-BY-4.0 (NVIDIA NeMo)".to_string(),
            rtf_note: "Chưa đo trên máy dev — công bố RTF ≈0,11 (CPU i5-1035G1)".to_string(),
            requires_cuda: false,
            word_timestamps: true,
            notes: "⚠️ CHƯA KIỂM CHỨNG trên máy dev (cùng lý do tải với v3). Chỉ tiếng Anh.".to_string(),
            builtin: false,
            whisper_variant: None,
            archive: true,
            files: vec![gh_asset(
                "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2",
                482_468_385,
                "157c157bc51155e03e37d2466522a3a737dd9c72bb25f36eb18912964161e1ad",
            )],
            required: vec![
                "encoder.int8.onnx".to_string(),
                "decoder.int8.onnx".to_string(),
                "joiner.int8.onnx".to_string(),
                "tokens.txt".to_string(),
            ],
        },
    ]
}

/// Find one engine spec by id.
pub fn spec(id: &str) -> Option<SttEngineSpec> {
    catalog().into_iter().find(|s| s.id == id)
}

/// Directory of one engine's model.
pub fn model_dir(id: &str) -> PathBuf {
    crate::stt::sherpa_asr::model_dir(id)
}

/// True when every required file of the engine is present on disk.
pub fn is_installed(spec: &SttEngineSpec) -> bool {
    if spec.builtin {
        return match &spec.whisper_variant {
            Some(v) => crate::stt::whisper_local::ModelVariant::from_name(v)
                .map(|variant| crate::stt::has_stt_model(variant))
                .unwrap_or(false),
            None => false,
        };
    }
    let dir = model_dir(&spec.id);
    spec.required.iter().all(|name| {
        std::fs::metadata(dir.join(name))
            .map(|m| m.len() > 0)
            .unwrap_or(false)
    })
}

/// Bytes already present on disk for the engine (for a resumable progress bar).
pub fn installed_bytes(spec: &SttEngineSpec) -> u64 {
    let dir = model_dir(&spec.id);
    spec.required
        .iter()
        .filter_map(|name| std::fs::metadata(dir.join(name)).ok())
        .map(|m| m.len())
        .sum()
}

/// Total size of the engine in bytes (sum of the files to download).
pub fn total_bytes(spec: &SttEngineSpec) -> u64 {
    spec.files.iter().map(|f| f.bytes).sum()
}

/// Build the status list the UI renders.
pub fn status_list(selected_engine: &str) -> Vec<SttEngineStatus> {
    let default_engine = if selected_engine.trim().is_empty() {
        "whisper-large-v3-turbo"
    } else {
        selected_engine
    };
    catalog()
        .into_iter()
        .map(|spec| {
            let downloaded = is_installed(&spec);
            let total = total_bytes(&spec);
            let done = installed_bytes(&spec);
            let pct = if downloaded {
                100
            } else if total > 0 && done > 0 {
                ((done * 100) / total).min(99) as u32
            } else {
                0
            };
            SttEngineStatus {
                id: spec.id.clone(),
                name: spec.name.clone(),
                label: spec.label.clone(),
                family: spec.family.clone(),
                languages: spec.languages.clone(),
                lang_label: spec.lang_label.clone(),
                desc: spec.desc.clone(),
                size_mb: spec.size_mb,
                size_note: spec.size_note.clone(),
                license: spec.license.clone(),
                rtf_note: spec.rtf_note.clone(),
                requires_cuda: spec.requires_cuda,
                word_timestamps: spec.word_timestamps,
                notes: spec.notes.clone(),
                state: if downloaded { "ready" } else { "not_downloaded" }.to_string(),
                downloaded,
                bytes_downloaded: done,
                bytes_total: total,
                progress_pct: pct,
                error: None,
                is_default: spec.family == "whisper" && default_engine == "whisper-large-v3-turbo",
                selected: default_engine == spec.id,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_ids_are_unique() {
        let ids: Vec<String> = catalog().into_iter().map(|s| s.id).collect();
        let mut unique = ids.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(ids.len(), unique.len(), "trùng id trong catalog STT");
    }

    #[test]
    fn every_sherpa_engine_has_required_files_and_checksum() {
        for spec in catalog() {
            if spec.builtin {
                assert!(spec.files.is_empty());
                continue;
            }
            assert!(!spec.required.is_empty(), "{} thiếu required", spec.id);
            assert!(!spec.files.is_empty(), "{} thiếu files", spec.id);
            for f in &spec.files {
                assert!(f.bytes > 0, "{} thiếu kích thước", spec.id);
                assert!(f.sha256.is_some(), "{} thiếu sha256 để verify", spec.id);
                assert_eq!(
                    f.sha256.as_ref().map(|s| s.len()),
                    Some(64),
                    "sha256 phải 64 ký tự hex"
                );
                assert!(
                    f.url.starts_with("https://"),
                    "{} phải dùng https",
                    spec.id
                );
            }
            // Engine tải file rời thì `required` phải khớp tên file.
            if !spec.archive {
                for name in &spec.required {
                    assert!(
                        spec.files.iter().any(|f| &f.filename == name),
                        "{} thiếu file {}",
                        spec.id,
                        name
                    );
                }
            }
        }
    }

    #[test]
    fn catalog_covers_chinese_and_english_engines() {
        let cat = catalog();
        let zh = cat.iter().filter(|s| s.languages.contains(&"zh".into())).count();
        let en = cat.iter().filter(|s| s.languages.contains(&"en".into())).count();
        assert!(zh >= 4, "cần ít nhất 4 engine hỗ trợ tiếng Trung, có {zh}");
        assert!(en >= 5, "cần ít nhất 5 engine hỗ trợ tiếng Anh, có {en}");
        assert!(cat.iter().any(|s| s.family == "whisper"));
    }

    #[test]
    fn status_marks_default_whisper() {
        let status = status_list("");
        let selected: Vec<&SttEngineStatus> = status.iter().filter(|s| s.selected).collect();
        assert_eq!(selected.len(), 1, "phải có đúng 1 engine được chọn");
        assert_eq!(selected[0].id, "whisper-large-v3-turbo");
        assert!(status.iter().any(|s| s.is_default));
    }
}
