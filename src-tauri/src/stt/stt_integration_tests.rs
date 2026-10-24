//! Integration test THẬT cho engine STT: tải model → nhận dạng → ghi SRT.
//!
//! Chạy tay (cần mạng + clip bench):
//! ```text
//! cargo test --lib stt_integration -- --ignored --nocapture
//! ```
//! Test tự bỏ qua nếu không tìm thấy clip tham chiếu trong
//! `%TEMP%\sublix-stt-bench\clips` (xem `docs/STT_MODELS_2026.md` §7).

use super::sherpa_asr;
use super::stt_catalog;
use crate::model_download;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// Khoá để các test đổi biến môi trường không chạy song song nhau
/// (biến môi trường là trạng thái toàn process).
fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// Thư mục bench ngoài repo.
fn bench_dir() -> PathBuf {
    std::env::temp_dir().join("sublix-stt-bench")
}

/// Nếu không có clip thì bỏ qua (không fail CI).
fn bench_clip(tag: &str) -> Option<(PathBuf, PathBuf)> {
    let clips = bench_dir().join("clips");
    let wav = clips.join(format!("{tag}.wav"));
    let ref_srt = clips.join(format!("{tag}.ref.srt"));
    if wav.exists() && ref_srt.exists() {
        Some((wav, ref_srt))
    } else {
        eprintln!(
            "SKIP: không thấy clip bench {} — xem docs/STT_MODELS_2026.md §7",
            wav.display()
        );
        None
    }
}

/// Đặt thư mục model ra ngoài repo cho test.
fn use_temp_model_dir() -> PathBuf {
    let dir = bench_dir().join("app-models");
    std::env::set_var("SUBLIX_STT_MODELS_DIR", &dir);
    dir
}

#[test]
#[ignore = "cần mạng + clip bench trong %TEMP%\\sublix-stt-bench"]
fn download_sensevoice_model_verifies_checksum() {
    let dir = use_temp_model_dir();
    let spec = stt_catalog::spec("sensevoice-zh-en").expect("phải có engine sensevoice");
    assert!(!spec.archive, "sensevoice dùng file rời, không giải nén");

    // Xoá bản cũ để test đi đúng đường tải thật (không dùng nhầm file đã có).
    let model_dir = stt_catalog::model_dir(&spec.id);
    if model_dir.exists() {
        std::fs::remove_dir_all(&model_dir).expect("xoá model cũ");
    }

    let mut events = Vec::new();
    model_download::download_files(
        &spec.id,
        model_download::KIND_STT,
        &model_dir,
        &spec.files,
        &mut |p| events.push(p),
    )
    .expect("tải model sensevoice");

    // Mọi file bắt buộc phải có mặt và đúng dung lượng.
    for name in &spec.required {
        let p = model_dir.join(name);
        let meta = std::fs::metadata(&p).expect("file model phải tồn tại");
        assert!(meta.len() > 0, "{name} rỗng");
        // Đúng số byte trong catalog (đã verify SHA-256 trong lúc tải).
        let expected = spec
            .files
            .iter()
            .find(|f| &f.filename == name)
            .map(|f| f.bytes)
            .unwrap_or(0);
        assert_eq!(meta.len(), expected, "{name} sai dung lượng");
    }
    // Sự kiện tiến trình phải có pha downloading rồi verify rồi done.
    assert!(
        events.iter().any(|e| e.phase == model_download::phase::DOWNLOADING),
        "phải có pha downloading"
    );
    assert!(
        events.iter().any(|e| e.phase == model_download::phase::VERIFYING),
        "phải có pha verifying (kiểm tra SHA-256)"
    );
    assert!(
        events.iter().any(|e| e.phase == model_download::phase::DONE),
        "phải có pha done"
    );
    // Tiến trình phải báo đủ thông tin cho UI (%, tốc độ, ETA).
    let dl = events
        .iter()
        .filter(|e| e.phase == model_download::phase::DOWNLOADING)
        .last()
        .expect("có pha downloading");
    assert!(dl.bytes_total > 0, "phải biết tổng dung lượng");
    assert!(dl.speed_bps > 0, "phải đo được tốc độ tải");
    assert!(dl.eta_s.is_some(), "phải có ETA");
    assert!(dl.model_id == spec.id && dl.kind == model_download::KIND_STT);
    // Không được để lại file .part.
    let leftovers: Vec<_> = std::fs::read_dir(&model_dir)
        .unwrap()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().ends_with(".part"))
        .collect();
    assert!(leftovers.is_empty(), "còn file .part sau khi tải xong");
    assert!(dir.exists());
}

#[test]
#[ignore = "cần mạng + clip bench trong %TEMP%\\sublix-stt-bench"]
fn transcribe_chinese_clip_produces_srt() {
    let _ = use_temp_model_dir();
    let Some((wav, ref_srt)) = bench_clip("zh_guilt") else {
        return;
    };

    let spec = stt_catalog::spec("sensevoice-zh-en").expect("phải có engine sensevoice");
    let mut sink = |_: model_download::DownloadProgress| {};
    // Bỏ qua nếu model đã có sẵn từ test trước.
    if !stt_catalog::is_installed(&spec) {
        model_download::download_files(
            &spec.id,
            model_download::KIND_STT,
            &stt_catalog::model_dir(&spec.id),
            &spec.files,
            &mut sink,
        )
        .expect("tải model sensevoice");
    }

    let result = sherpa_asr::transcribe(
        &spec.id,
        &spec.family,
        &wav,
        "zh",
        "cpu",
    )
    .expect("nhận dạng tiếng Trung");

    assert!(!result.text.is_empty(), "kết quả rỗng");
    assert!(
        result.timestamps == "word",
        "sensevoice phải có timestamp từ, có {:?}",
        result.timestamps
    );
    assert!(!result.segments.is_empty(), "không có segment nào");
    assert!(result.rtf() > 0.0 && result.rtf() < 1.0, "RTF bất thường");

    // SRT ghi ra phải đúng định dạng Sublix (chỉ số + mốc thời gian + text).
    let out = bench_dir().join("out").join("zh_guilt-sherpa.srt");
    sherpa_asr::write_srt(&out, &result).expect("ghi SRT");
    let raw = std::fs::read(&out).expect("đọc SRT");
    assert!(!raw.starts_with(&[0xEF, 0xBB, 0xBF]), "SRT không được có BOM");
    let content = String::from_utf8(raw).expect("SRT phải là UTF-8 hợp lệ");
    assert!(
        content.contains(" --> "),
        "SRT phải có dấu mốc thời gian"
    );
    // Mốc thời gian đúng chuẩn HH:MM:SS,mmm
    let stamps: Vec<&str> = content
        .lines()
        .filter(|l| l.contains(" --> "))
        .collect();
    assert!(stamps.len() >= 10, "SRT quá ngắn: {} cue", stamps.len());
    for s in &stamps {
        let parts: Vec<&str> = s.split(" --> ").collect();
        assert_eq!(parts.len(), 2, "mốc thời gian sai: {s}");
        for p in parts {
            let seg: Vec<&str> = p.split(':').collect();
            assert_eq!(seg.len(), 3, "mốc thời gian sai: {p}");
            assert!(seg[0].len() == 2 && seg[1].len() == 2, "mốc thời gian sai: {p}");
            let tail: Vec<&str> = seg[2].split(',').collect();
            assert_eq!(tail.len(), 2, "mốc thời gian thiếu mili giây: {p}");
            assert_eq!(tail[1].len(), 3, "mốc thời gian thiếu mili giây: {p}");
        }
    }

    // So sánh với phụ đề tham chiếu: cùng nội dung thì phải trùng phần lớn ký tự.
    let ref_content = std::fs::read_to_string(&ref_srt).expect("đọc SRT tham chiếu");
    let hyp_chars: usize = result.text.chars().filter(|c| c.is_alphanumeric()).count();
    let ref_chars: usize = ref_content
        .lines()
        .filter(|l| !l.contains("-->") && !l.trim().is_empty() && !l.trim().parse::<u32>().is_ok())
        .map(|l| l.chars().filter(|c| c.is_alphanumeric()).count())
        .sum();
    let ratio = hyp_chars as f64 / ref_chars.max(1) as f64;
    assert!(
        (0.85..1.15).contains(&ratio),
        "độ dài kết quả lệch quá nhiều so với tham chiếu: {ratio:.2} (hyp {hyp_chars} vs ref {ref_chars})"
    );
}

#[test]
#[ignore = "cần mạng + clip bench trong %TEMP%\\sublix-stt-bench"]
fn cancel_download_stops_early() {
    let _ = use_temp_model_dir();
    let spec = stt_catalog::spec("sensevoice-zh-en").expect("phải có engine sensevoice");
    let model_dir = stt_catalog::model_dir(&spec.id);
    if model_dir.exists() {
        std::fs::remove_dir_all(&model_dir).expect("xoá model cũ");
    }

    // Hủy NGAY khi có sự kiện tiến trình đầu tiên (giống hành vi nút "Hủy").
    let mut cancelled = false;
    let mut sink = |p: model_download::DownloadProgress| {
        if p.phase == model_download::phase::DOWNLOADING && !cancelled {
            cancelled = true;
            model_download::cancel(&spec.id);
        }
    };
    let result = model_download::download_files(
        &spec.id,
        model_download::KIND_STT,
        &model_dir,
        &spec.files,
        &mut sink,
    );
    assert!(result.is_err(), "tải phải thất bại khi đã huỷ");
    assert!(cancelled, "phải kịp huỷ trong lúc tải");
    model_download::reset_cancel(&spec.id);
    // File tải dở phải được giữ lại để RESUME được, nhưng chưa được coi là sẵn sàng.
    assert!(!stt_catalog::is_installed(&spec), "model chưa tải xong không được sẵn sàng");
}

#[test]
fn model_dir_honours_env_override() {
    let _guard = env_lock().lock().unwrap_or_else(|e| e.into_inner());
    let previous = std::env::var("SUBLIX_STT_MODELS_DIR").ok();
    std::env::set_var("SUBLIX_STT_MODELS_DIR", bench_dir().join("app-models"));
    let dir = sherpa_asr::stt_models_dir();
    assert!(dir.ends_with("app-models"), "phải tôn trọng env override: {dir:?}");
    match previous {
        Some(v) => std::env::set_var("SUBLIX_STT_MODELS_DIR", v),
        None => std::env::remove_var("SUBLIX_STT_MODELS_DIR"),
    }
}

#[test]
fn delete_model_removes_directory() {
    let _guard = env_lock().lock().unwrap_or_else(|e| e.into_inner());
    let dir = use_temp_model_dir();
    let spec = stt_catalog::spec("sensevoice-zh-en").expect("phải có engine sensevoice");
    let model_dir = stt_catalog::model_dir(&spec.id);
    std::fs::create_dir_all(&model_dir).expect("tạo thư mục");
    for name in &spec.required {
        std::fs::write(model_dir.join(name), b"x").expect("ghi file giả");
    }
    assert!(stt_catalog::is_installed(&spec), "phải coi là đã cài");

    // Xoá bằng đúng logic của lệnh Tauri.
    if model_dir.exists() {
        std::fs::remove_dir_all(&model_dir).expect("xoá model");
    }
    assert!(!stt_catalog::is_installed(&spec), "sau khi xoá phải không còn sẵn sàng");
    assert!(dir.exists());
}

#[test]
fn catalog_models_dir_is_under_models() {
    let _guard = env_lock().lock().unwrap_or_else(|e| e.into_inner());
    // Kiểm tra đường dẫn mặc định (không override env).
    let previous = std::env::var("SUBLIX_STT_MODELS_DIR").ok();
    std::env::remove_var("SUBLIX_STT_MODELS_DIR");
    let dir = sherpa_asr::stt_models_dir();
    assert!(dir.ends_with(Path::new("models").join("stt")), "{dir:?}");
    if let Some(v) = previous {
        std::env::set_var("SUBLIX_STT_MODELS_DIR", v);
    }
}
