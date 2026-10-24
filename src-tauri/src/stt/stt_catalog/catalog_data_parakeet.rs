//! Engine NVIDIA Parakeet (tiếng Anh) — tách riêng vì bảng model chính.

use super::catalog_data::gh_asset;
use super::catalog_types::SttEngineSpec;

/// Engine Parakeet TDT v2 / v3 (chưa đo được trên máy dev).
pub(crate) fn parakeet_entries() -> Vec<SttEngineSpec> {
    vec![
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
