//! Test cho `dubbing::stt_select` — tách riêng để file chính < 300 dòng.
//!
//! Dùng `use super::*` để truy cập các hàm của module `stt_select`.

use super::*;

#[test]
fn rong_hoac_whisper_thi_dung_whisper() {
    assert_eq!(select_engine_by_id(""), SttEngineSelection::Whisper);
    assert_eq!(select_engine_by_id("   "), SttEngineSelection::Whisper);
    assert_eq!(
        select_engine_by_id("whisper-large-v3-turbo"),
        SttEngineSelection::Whisper
    );
}

#[test]
fn engine_sherpa_trong_catalog_thi_chon_sherpa() {
    let sel = select_engine_by_id("sensevoice-zh-en");
    match sel {
        SttEngineSelection::Sherpa { engine_id, family, .. } => {
            assert_eq!(engine_id, "sensevoice-zh-en");
            assert_eq!(family, "sensevoice");
        }
        other => panic!("phải chọn sherpa, có {other:?}"),
    }
}

#[test]
fn engine_khong_biet_thi_bao_unknown() {
    assert_eq!(
        select_engine_by_id("khong-ton-tai"),
        SttEngineSelection::Unknown { requested: "khong-ton-tai".to_string() }
    );
}

/// Engine hợp lệ thì **không bao giờ** rơi về Whisper/Unknown trong bước
/// chạy thật — chỉ khác nhau ở chỗ model đã tải hay chưa.
#[test]
fn engine_hop_le_luon_di_ti_nhan_dang_sherpa() {
    match select_engine("sensevoice-zh-en") {
        SttEngineSelection::Sherpa { engine_id, .. } => {
            assert_eq!(engine_id, "sensevoice-zh-en");
        }
        SttEngineSelection::NotInstalled { engine_id, .. } => {
            assert_eq!(engine_id, "sensevoice-zh-en");
        }
        other => panic!("engine hợp lệ không được rơi về whisper, có {other:?}"),
    }
}

/// `select_engine` với whisper → luôn Whisper (kể cả khi model chưa tải).
#[test]
fn whisper_id_thi_luon_ra_whisper() {
    assert_eq!(select_engine("whisper-base"), SttEngineSelection::Whisper);
    assert_eq!(select_engine(""), SttEngineSelection::Whisper);
}

#[test]
fn ngon_ngu_chi_theo_engine_ho_tro() {
    assert_eq!(sherpa_language("sensevoice", "zh").as_deref(), Some("zh"));
    assert_eq!(sherpa_language("sensevoice", "en").as_deref(), Some("en"));
    // Tiếng Việt không có trong SenseVoice → để engine tự nhận diện.
    assert_eq!(sherpa_language("sensevoice", "vi"), None);
    assert_eq!(sherpa_language("sensevoice", "auto"), None);
    assert_eq!(sherpa_language("sensevoice", ""), None);
    // Paraformer chỉ Trung.
    assert_eq!(sherpa_language("paraformer", "zh").as_deref(), Some("zh"));
    assert_eq!(sherpa_language("paraformer", "en"), None);
    // Parakeet: không ép ngôn ngữ.
    assert_eq!(sherpa_language("parakeet", "en"), None);
}

#[test]
fn srt_content_dung_dinh_dang_chuan() {
    let segments = vec![crate::file_sub::SubtitleSegment {
        index: 1,
        start_time: "00:00:01,000".to_string(),
        end_time: "00:00:03,500".to_string(),
        original: "Xin chào".to_string(),
        translated: None,
    }];
    let srt = segments_to_srt_content(&segments);
    assert!(srt.starts_with("1\n00:00:01,000 --> 00:00:03,500\nXin chào\n"));
    // Nội dung SRT phải parse lại được đúng định dạng cũ.
    let parsed = crate::file_sub::parse_srt_content(&srt);
    assert_eq!(parsed.len(), 1);
    assert_eq!(parsed[0].original, "Xin chào");
    assert_eq!(parsed[0].start_time, "00:00:01,000");
}

#[test]
fn srt_content_rong_thi_khong_co_segment() {
    assert!(segments_to_srt_content(&[]).is_empty());
}

/// Test thật: chạy engine sherpa trên clip mẫu (cần model đã tải + clip bench).
///
/// ```powershell
/// $env:SUBLIX_STT_MODELS_DIR="$env:TEMP\sublix-stt-bench\app-models"
/// cargo test --lib dubbing_stt_sherpa_that -- --ignored --nocapture
/// ```
#[test]
#[ignore = "cần model STT đã tải + clip bench trong %TEMP%\\sublix-stt-bench"]
fn dubbing_stt_sherpa_that() {
    let clip = std::env::temp_dir().join("sublix-stt-bench").join("clips");
    let wav = clip.join("zh_guilt.wav");
    if !wav.exists() {
        eprintln!("SKIP: không có clip bench {}", wav.display());
        return;
    }
    // Model chưa tải (hoặc đã bị test khác dọn) → bỏ qua, KHÔNG fail.
    if let SttEngineSelection::NotInstalled { engine_id, .. } = select_engine("sensevoice-zh-en") {
        eprintln!("SKIP: model {engine_id} chưa được cài trên máy này");
        return;
    }
    let mut cfg = AppConfig::load_or_default();
    cfg.stt_asr_engine = "sensevoice-zh-en".to_string();

    match try_sherpa(&cfg, &wav, "zh") {
        SherpaAttempt::Ready {
            srt_content,
            engine_id,
            sentence_timestamps_only,
            ..
        } => {
            assert_eq!(engine_id, "sensevoice-zh-en");
            eprintln!(
                "engine={engine_id} timestamp_câu={sentence_timestamps_only} len={}",
                srt_content.len()
            );
            let parsed = crate::file_sub::parse_srt_content(&srt_content);
            assert!(!parsed.is_empty(), "phải ra segment");
            // Định dạng segment phải đúng như cũ để bước phân vai dùng được.
            assert!(parsed[0].start_time.contains(':'));
            assert!(parsed[0].end_time.contains(':'));
            assert!(!parsed[0].original.trim().is_empty());
            for seg in &parsed {
                let start = parse_srt_time_to_seconds_for_test(&seg.start_time);
                let end = parse_srt_time_to_seconds_for_test(&seg.end_time);
                assert!(end > start, "segment đảo mốc: {seg:?}");
            }
        }
        other => panic!("phải dùng được engine sherpa, có {other:?}"),
    }
}

/// Đổi "HH:MM:SS,mmm" → giây (chỉ dùng cho test).
fn parse_srt_time_to_seconds_for_test(t: &str) -> f64 {
    let clean = t.replace(',', ".");
    let parts: Vec<f64> = clean
        .split(':')
        .filter_map(|p| p.parse::<f64>().ok())
        .collect();
    if parts.len() == 3 {
        parts[0] * 3600.0 + parts[1] * 60.0 + parts[2]
    } else if parts.len() == 2 {
        parts[0] * 60.0 + parts[1]
    } else {
        0.0
    }
}
