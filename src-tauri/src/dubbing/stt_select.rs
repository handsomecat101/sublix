//! Chọn engine STT cho pipeline lồng tiếng + chuyển segment sang định dạng cũ.
//!
//! Studio cho phép chọn engine STT (config `stt_asr_engine`, rỗng = whisper).
//! Bước "chỉ làm phụ đề" (`dubbing_analyze`) trước đây **luôn** chạy Whisper.
//! Module này làm nốt phần còn lại: đọc `stt_asr_engine` từ config (backend tự
//! đọc ⇒ **không** đổi tham số lệnh Tauri, không cần sửa frontend), và nếu
//! engine sherpa đã được chọn + model **đã tải** → nhận dạng bằng engine đó.
//!
//! Engine **không** có timestamp từ (Paraformer) vẫn ra **timestamp câu** — đúng
//! định dạng segment mà bước phân vai (diarization) đang nhận.

use std::path::Path;

use crate::config::AppConfig;
use crate::stt::sherpa_asr::{self, SttAsrResult};
use crate::stt::stt_catalog;

/// Engine STT sẽ dùng cho bước "chỉ làm phụ đề".
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SttEngineSelection {
    /// whisper.cpp — mặc định và là fallback.
    Whisper,
    /// Engine sherpa-onnx (model đã tải).
    Sherpa {
        engine_id: String,
        family: String,
        label: String,
    },
    /// Config trỏ tới engine không có trong catalog.
    Unknown { requested: String },
    /// Engine có trong catalog nhưng **model chưa tải**.
    NotInstalled {
        engine_id: String,
        label: String,
    },
}

/// Chọn engine theo id trong config — **hàm thuần**, không I/O (test được).
///
/// - rỗng / bắt đầu bằng `whisper` → [`SttEngineSelection::Whisper`]
/// - id không có trong catalog → [`SttEngineSelection::Unknown`]
/// - id có trong catalog → [`SttEngineSelection::Sherpa`] (kiểm tra "đã tải" ở
///   bước chạy thật vì nó phụ thuộc ổ đĩa).
pub fn select_engine_by_id(requested: &str) -> SttEngineSelection {
    let id = requested.trim();
    if id.is_empty() || id.starts_with("whisper") {
        return SttEngineSelection::Whisper;
    }
    match stt_catalog::spec(id) {
        Some(spec) => SttEngineSelection::Sherpa {
            engine_id: spec.id.clone(),
            family: spec.family.clone(),
            label: spec.label.clone(),
        },
        None => SttEngineSelection::Unknown { requested: id.to_string() },
    }
}

/// Chọn engine cho lần chạy thật — có kiểm tra **model đã tải chưa**.
pub fn select_engine(requested: &str) -> SttEngineSelection {
    let selection = select_engine_by_id(requested);
    if let SttEngineSelection::Sherpa { engine_id, .. } = &selection {
        let installed = stt_catalog::spec(engine_id)
            .map(|spec| stt_catalog::is_installed(&spec))
            .unwrap_or(false);
        if !installed {
            let label = stt_catalog::spec(engine_id)
                .map(|s| s.label.clone())
                .unwrap_or_else(|| engine_id.clone());
            return SttEngineSelection::NotInstalled {
                engine_id: engine_id.clone(),
                label,
            };
        }
    }
    selection
}

/// Kết quả thử dùng engine sherpa trong pipeline.
#[derive(Debug, Clone)]
pub enum SherpaAttempt {
    /// Người dùng không chọn engine sherpa → dùng Whisper (không phải lỗi).
    NotRequested,
    /// Thành công — nội dung SRT đã sẵn sàng để nối vào pipeline cũ.
    Ready {
        srt_content: String,
        engine_id: String,
        engine_label: String,
        /// `true` khi engine chỉ có timestamp câu (Paraformer).
        sentence_timestamps_only: bool,
    },
    /// Không dùng được → phải rơi về Whisper (kèm lý do để báo UI).
    Fallback {
        engine_id: String,
        engine_label: String,
        reason: String,
    },
}

/// Ngôn ngữ nguồn mà engine hỗ trợ (trả về `None` nếu không hỗ trợ ⇒ dùng auto).
///
/// - SenseVoice: zh · en · ja · ko · yue
/// - Paraformer: zh
/// - Parakeet / Canary: chỉ "auto" (không ép ngôn ngữ)
pub fn sherpa_language(family: &str, src_lang: &str) -> Option<String> {
    let lang = src_lang.trim().to_lowercase();
    if lang.is_empty() || lang == "auto" {
        return None;
    }
    let supported: &[&str] = match family {
        "sensevoice" => &["zh", "en", "ja", "ko", "yue"],
        "paraformer" => &["zh"],
        _ => &[],
    };
    if supported.contains(&lang.as_str()) {
        Some(lang)
    } else {
        None
    }
}

/// Dựng nội dung SRT từ segment — để đi tiếp đúng đường `parse_srt_content`
/// cũ (định dạng segment cho bước phân vai không đổi).
pub fn segments_to_srt_content(segments: &[crate::file_sub::SubtitleSegment]) -> String {
    let mut out = String::new();
    for (i, seg) in segments.iter().enumerate() {
        out.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            i + 1,
            seg.start_time,
            seg.end_time,
            seg.original
        ));
    }
    out
}

/// Chuyển kết quả sherpa → segment định dạng cũ (`file_sub::SubtitleSegment`).
pub fn result_to_raw_segments(result: &SttAsrResult) -> Vec<crate::file_sub::SubtitleSegment> {
    sherpa_asr::to_subtitle_segments(result)
}

/// Thử nhận dạng bằng engine sherpa đã chọn trong config.
///
/// Không bao giờ trả lỗi ra ngoài — mọi lỗi đều thành [`SherpaAttempt::Fallback`]
/// để pipeline rơi về Whisper một cách an toàn.
pub fn try_sherpa(cfg: &AppConfig, wav_path: &Path, src_lang: &str) -> SherpaAttempt {
    match select_engine(&cfg.stt_asr_engine) {
        SttEngineSelection::Whisper => SherpaAttempt::NotRequested,
        SttEngineSelection::Unknown { requested } => SherpaAttempt::Fallback {
            engine_id: requested.clone(),
            engine_label: requested,
            reason: "không có trong catalog".to_string(),
        },
        SttEngineSelection::NotInstalled { engine_id, label } => SherpaAttempt::Fallback {
            engine_id,
            engine_label: label,
            reason: "model chưa tải".to_string(),
        },
        SttEngineSelection::Sherpa {
            engine_id,
            family,
            label,
        } => {
            let language = sherpa_language(&family, src_lang).unwrap_or_else(|| "auto".to_string());
            match sherpa_asr::transcribe(
                &engine_id,
                &family,
                wav_path,
                &language,
                &cfg.stt_engine_preference,
            ) {
                Ok(result) => {
                    let segments = result_to_raw_segments(&result);
                    if segments.is_empty() {
                        return SherpaAttempt::Fallback {
                            engine_id,
                            engine_label: label,
                            reason: "không nhận dạng được nội dung nào".to_string(),
                        };
                    }
                    let sentence_only = result.timestamps != "word";
                    SherpaAttempt::Ready {
                        srt_content: segments_to_srt_content(&segments),
                        engine_id,
                        engine_label: label,
                        sentence_timestamps_only: sentence_only,
                    }
                }
                Err(e) => SherpaAttempt::Fallback {
                    engine_id,
                    engine_label: label,
                    reason: format!("{e:#}"),
                },
            }
        }
    }
}

// Test cho module này nằm ở file riêng (giữ file chính < 300 dòng).
#[cfg(test)]
#[path = "stt_select_tests.rs"]
mod tests;
