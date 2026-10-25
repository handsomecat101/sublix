//! TSK-FEAT-VOICE-SAMPLE-CACHE — test cho logic cache mẫu nghe thử.
//!
//! Test **thuần** (không cần model, không cần mạng): chỉ chạm thư mục tạm.
//! Chạy: `cargo test --lib voice_samples`

use super::*;
use std::path::PathBuf;

/// Thư mục tạm riêng cho 1 test (test chạy song song → mỗi test 1 thư mục).
fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("sublix_vs_test_{tag}_{}", super::super::gen_unique_id()));
    let _ = fs::create_dir_all(&dir);
    dir
}

/// WAV hợp lệ (RIFF....WAVE) + padding cho đủ kích thước.
fn fake_wav(bytes_len: usize) -> Vec<u8> {
    let mut v = Vec::with_capacity(bytes_len);
    v.extend_from_slice(b"RIFF");
    v.extend_from_slice(&(bytes_len as u32 - 8).to_le_bytes());
    v.extend_from_slice(b"WAVE");
    v.extend_from_slice(b"fmt ");
    v.resize(bytes_len, 0);
    v
}

/// Bỏ file tạm (không assert — test không được fail vì dọn dẹp).
fn cleanup(dir: &Path) {
    let _ = fs::remove_dir_all(dir);
}

/* ------------------------------------------------------------------ */
/* Nhận diện engine                                                      */
/* ------------------------------------------------------------------ */

#[test]
fn engine_of_voice_dung_theo_tien_to() {
    assert_eq!(engine_of_voice("kokoro:diem_trinh"), ENGINE_KOKORO);
    assert_eq!(engine_of_voice("vietneu:bac_nam"), ENGINE_VIETNEU);
    assert_eq!(engine_of_voice("zerotts:maichi"), ENGINE_ZEROTTS);
    assert_eq!(engine_of_voice("vi-VN-HoaiMyNeural"), ENGINE_CLOUD);
    assert_eq!(engine_of_voice("  kokoro:mai_linh  "), ENGINE_KOKORO);
}

#[test]
fn model_folder_giu_layout_cu_cua_kokoro() {
    // Thư mục cache = id model trong voice_models.rs (mẫu nằm cạnh model).
    assert_eq!(model_folder(ENGINE_KOKORO), "kokoro-vi");
    assert_eq!(model_folder(ENGINE_VIETNEU), "vieneu-v3-turbo");
    assert_eq!(model_folder(ENGINE_ZEROTTS), "zerotts");
}

#[test]
fn bare_voice_bo_tien_to() {
    assert_eq!(bare_voice("kokoro:diem_trinh"), "diem_trinh");
    assert_eq!(bare_voice("vietneu:bac_nam"), "bac_nam");
    assert_eq!(bare_voice("diem_trinh"), "diem_trinh");
}

/* ------------------------------------------------------------------ */
/* Tên file an toàn                                                     */
/* ------------------------------------------------------------------ */

#[test]
fn sanitize_voice_thay_ky_tu_la() {
    assert_eq!(sanitize_voice("kokoro:diem_trinh"), "diem_trinh");
    assert_eq!(sanitize_voice("vi-VN-HoaiMyNeural"), "vi-VN-HoaiMyNeural");
    assert_eq!(sanitize_voice("ghi/cong"), "ghi_cong");
    assert_eq!(sanitize_voice("  "), "default");
    assert_eq!(sanitize_voice(""), "default");
}

#[test]
fn ext_offline_la_wav() {
    assert_eq!(ext_for_voice("kokoro:diem_trinh"), "wav");
    assert_eq!(ext_for_voice("vietneu:bac_nam"), "wav");
    assert_eq!(ext_for_voice("zerotts:maichi"), "wav");
}

#[test]
fn sample_path_dung_ten_da_lam_san() {
    let dir = Path::new("C:/tmp");
    let path = sample_path_in(dir, "kokoro:diem_trinh", "wav");
    assert_eq!(path, Path::new("C:/tmp").join("diem_trinh.wav"));
}

/* ------------------------------------------------------------------ */
/* Ghi atomic                                                            */
/* ------------------------------------------------------------------ */

#[test]
fn write_atomic_tao_file_va_khong_con_file_part() {
    let dir = temp_dir("atomic");
    let bytes = fake_wav(4096);
    let path = write_atomic(&dir, "diem_trinh", "wav", &bytes).expect("ghi atomic");
    assert!(path.exists(), "file cuối phải tồn tại");
    assert_eq!(fs::read(&path).map(|b| b.len()).unwrap_or(0), bytes.len());
    assert!(
        !dir.join("diem_trinh.wav.part").exists(),
        "file .part phải được đổi tên (không còn sót)"
    );
    cleanup(&dir);
}

#[test]
fn write_atomic_ghi_de_file_cu() {
    let dir = temp_dir("overwrite");
    write_atomic(&dir, "mai_linh", "wav", &fake_wav(4096)).expect("ghi lần 1");
    write_atomic(&dir, "mai_linh", "wav", &fake_wav(8192)).expect("ghi lần 2");
    assert_eq!(fs::metadata(dir.join("mai_linh.wav")).map(|m| m.len()).unwrap_or(0), 8192);
    cleanup(&dir);
}

/* ------------------------------------------------------------------ */
/* Đọc + kiểm tra file hỏng                                             */
/* ------------------------------------------------------------------ */

#[test]
fn read_data_uri_tra_data_uri_base64() {
    let dir = temp_dir("read");
    let bytes = fake_wav(4096);
    write_atomic(&dir, "diem_trinh", "wav", &bytes).expect("ghi");
    let uri = read_data_uri(&dir.join("diem_trinh.wav")).expect("phải đọc được");
    assert!(uri.starts_with("data:audio/wav;base64,"), "uri sai: {uri}");
    cleanup(&dir);
}

#[test]
fn read_data_uri_tra_none_khi_file_qua_nho() {
    let dir = temp_dir("small");
    fs::write(dir.join("nho.wav"), b"RIFF").expect("ghi file nhỏ");
    assert!(read_data_uri(&dir.join("nho.wav")).is_none(), "file < 2KB phải bị từ chối");
    cleanup(&dir);
}

#[test]
fn read_data_uri_tra_none_khi_wav_header_sai() {
    let dir = temp_dir("badheader");
    let mut junk = vec![0u8; 4096];
    junk[0] = b'X';
    fs::write(dir.join("bad.wav"), junk).expect("ghi file hỏng");
    assert!(read_data_uri(&dir.join("bad.wav")).is_none(), "WAV sai header phải bị từ chối");
    cleanup(&dir);
}

#[test]
fn wav_header_ok_chi_nhan_dung_ri_wave() {
    assert!(wav_header_ok(&fake_wav(4096)));
    assert!(!wav_header_ok(b"RIFFxxxxNOTWAVE"));
    assert!(!wav_header_ok(b"short"));
}

#[test]
fn too_small_la_nguong_2kb() {
    let dir = temp_dir("small2");
    fs::write(dir.join("a.wav"), vec![0u8; 10]).expect("ghi");
    fs::write(dir.join("b.wav"), vec![0u8; 4096]).expect("ghi");
    assert!(too_small(&dir.join("a.wav")));
    assert!(!too_small(&dir.join("b.wav")));
    cleanup(&dir);
}

#[test]
fn sample_is_broken_true_khi_qua_nho_hoac_sai_header() {
    let dir = temp_dir("broken");
    fs::write(dir.join("nho.wav"), vec![0u8; 10]).expect("ghi");
    let mut junk = vec![0u8; 4096];
    junk[0] = b'X';
    fs::write(dir.join("sai.wav"), junk).expect("ghi");
    assert!(sample_is_broken(&dir.join("nho.wav")));
    assert!(sample_is_broken(&dir.join("sai.wav")));
    cleanup(&dir);
}

#[test]
fn purge_if_broken_xoa_file_hong() {
    let dir = temp_dir("purge");
    fs::write(dir.join("nho.wav"), vec![0u8; 10]).expect("ghi");
    assert!(purge_if_broken(&dir.join("nho.wav")), "phải báo đã xoá");
    assert!(!dir.join("nho.wav").exists(), "file hỏng phải bị xoá");
    assert!(!purge_if_broken(&dir.join("khong-ton-tai.wav")), "file không tồn tại → không xoá");
    cleanup(&dir);
}

/* ------------------------------------------------------------------ */
/* Liệt kê cache                                                        */
/* ------------------------------------------------------------------ */

#[test]
fn list_cached_in_sort_va_bo_file_nho() {
    let dir = temp_dir("list");
    write_atomic(&dir, "mai_linh", "wav", &fake_wav(4096)).expect("ghi");
    write_atomic(&dir, "diem_trinh", "wav", &fake_wav(4096)).expect("ghi");
    fs::write(dir.join("nho.wav"), vec![0u8; 10]).expect("ghi file nhỏ");
    fs::write(dir.join("ghi_chu.txt"), b"x").expect("ghi file khac");

    let ids = list_cached_in(&dir);
    assert_eq!(ids, vec!["diem_trinh".to_string(), "mai_linh".to_string()]);
    assert!(!dir.join("nho.wav").exists(), "file quá nhỏ phải bị dọn");
    cleanup(&dir);
}

#[test]
fn list_cached_in_thu_muc_khong_ton_tai_tra_ve_rong() {
    let ids = list_cached_in(Path::new("C:/khong/ton/tai/khong"));
    assert!(ids.is_empty(), "thư mục không tồn tại → danh sách rỗng");
}

/* ------------------------------------------------------------------ */
/* Đo thời gian thật (cần model giọng trên máy)                          */
/* ------------------------------------------------------------------ */

/// Đo ▶ lần 1 (tổng hợp thật) vs lần 2 (đọc cache) cho Kokoro + VieNeu.
/// BỎ QUA mặc định (`--ignored` để chạy): cần model giọng thật + Python.
#[test]
#[ignore = "cần model giọng thật (Kokoro/VieNeu) + Python để đo thời gian thật"]
fn do_thoi_gian_mau_lan1_vs_lan2() {
    use std::time::Instant;
    for engine in [ENGINE_KOKORO, ENGINE_VIETNEU] {
        if !engine_available(engine) {
            println!("VOICE-SAMPLE-BENCH {engine}: chưa cài model → bỏ qua");
            continue;
        }
        let voices = voices_of(engine);
        let Some(voice) = voices.first() else { continue };
        // Xoá cache để đo đúng lần 1 (tổng hợp thật).
        let dir = samples_dir(engine);
        let _ = fs::remove_file(sample_path_in(&dir, voice, ext_for_voice(voice)));

        let t1 = Instant::now();
        let r1 = ensure_sample(voice, None);
        let d1 = t1.elapsed();

        let t2 = Instant::now();
        let r2 = ensure_sample(voice, None);
        let d2 = t2.elapsed();

        println!(
            "VOICE-SAMPLE-BENCH {engine} voice={} lan1={:?} lan2={:?} ok1={} ok2={}",
            bare_voice(voice),
            d1,
            d2,
            r1.is_ok(),
            r2.is_ok()
        );
    }
}
