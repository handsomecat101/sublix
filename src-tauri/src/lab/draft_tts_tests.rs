//! Test `draft_tts` — không gọi TTS khi không cần, đo file không phải WAV.

use std::path::Path;

use super::*;

fn narration(id: u32, text: &str) -> RecapItem {
    RecapItem {
        id,
        source_idx: 0,
        start: 0.0,
        end: 5.0,
        picture: String::new(),
        narration: text.to_string(),
        keep_original: false,
        tts_secs: None,
    }
}

fn original(id: u32) -> RecapItem {
    RecapItem {
        id,
        source_idx: 0,
        start: 0.0,
        end: 4.0,
        picture: String::new(),
        narration: "thoại gốc".to_string(),
        keep_original: true,
        tts_secs: None,
    }
}

#[test]
fn danh_sach_rong_thi_khong_goi_tts() {
    let (items, files) = synthesize_items(
        &[],
        "kokoro:diem_trinh",
        "+0%",
        "+0Hz",
        Path::new("."),
        &mut |_, _| {},
    )
    .expect("danh sách rỗng phải chạy được");
    assert!(items.is_empty());
    assert!(files.is_empty());
}

#[test]
fn doan_giu_tieng_goc_khong_bi_doc() {
    let items = vec![original(1)];
    let (out, files) = synthesize_items(
        &items,
        "kokoro:diem_trinh",
        "+0%",
        "+0Hz",
        Path::new("."),
        &mut |_, _| {},
    )
    .expect("không có câu nào cần đọc");

    assert!(files.is_empty(), "không tạo file TTS cho thoại gốc");
    assert_eq!(out[0].tts_secs, None, "không ghi đè tts_secs");
}

#[test]
fn cau_rong_cung_bi_bo_qua() {
    let items = vec![narration(1, "   ")];
    let (out, files) = synthesize_items(
        &items,
        "kokoro:diem_trinh",
        "+0%",
        "+0Hz",
        Path::new("."),
        &mut |_, _| {},
    )
    .expect("câu rỗng thì bỏ qua");
    assert!(files.is_empty());
    assert_eq!(out[0].tts_secs, None);
}

#[test]
fn do_dai_file_khong_phai_wav_tra_none() {
    let dir = std::env::temp_dir().join("sublix-lab-tts-tests");
    std::fs::create_dir_all(&dir).expect("tạo thư mục tạm");
    let path = dir.join("khong-phai-wav.wav");
    std::fs::write(&path, b"khong phai wav").expect("ghi file");
    assert!(measure_duration(&path).is_none());
    let _ = std::fs::remove_file(&path);
}
