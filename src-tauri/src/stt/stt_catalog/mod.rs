//! Catalog of offline STT engines available in Sublix (2026 lineup).
//!
//! Besides the built-in whisper.cpp engines, the catalog lists the
//! **sherpa-onnx** engines that are noticeably faster and more accurate on
//! Chinese. Sizes and SHA-256 checksums are the real values of the files that
//! were actually downloaded and benchmarked on the dev machine, so every
//! download is verified (bytes + checksum) before it is marked ready.
//!
//! Measured accuracy / speed numbers live in `docs/STT_MODELS_2026.md`.
//!
//! Cấu trúc:
//! - [`catalog_types`] — kiểu dữ liệu `SttEngineSpec` / `SttEngineStatus`,
//! - [`catalog_data`] + [`catalog_data_parakeet`] — bảng model (dữ liệu tịnh),
//! - module này — logic: tra cứu, kiểm tra file, dựng trạng thái.

use std::path::PathBuf;

pub mod catalog_data;
pub mod catalog_data_parakeet;
pub mod catalog_types;

pub use self::catalog_types::{SttEngineSpec, SttEngineStatus};

use self::catalog_data::{cjk_entries, whisper_entries};
use self::catalog_data_parakeet::parakeet_entries;

/// Toân bộ catalog — whisper đứng đủu để whisper là mặc định.
pub fn catalog() -> Vec<SttEngineSpec> {
    let mut all = whisper_entries();
    all.extend(cjk_entries());
    all.extend(parakeet_entries());
    all
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
