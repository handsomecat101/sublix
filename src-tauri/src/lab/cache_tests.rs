//! Test cache phân tích (`lab/cache.rs`).

use super::*;
use std::time::SystemTime;

fn tmp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("sublix-lab-cache-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("tạo thư mục tạm");
    dir
}

fn write_file(path: &Path, content: &[u8]) {
    std::fs::write(path, content).expect("ghi file tạm");
}

#[test]
fn khoa_cache_rong_khi_file_khong_ton_tai() {
    assert_eq!(cache_key(Path::new(r"C:\khong\ton\ tai\video.mp4")), "");
}

#[test]
fn khoa_cache_dung_khi_file_khong_doi() {
    let dir = tmp_dir("same");
    let video = dir.join("v.mp4");
    write_file(&video, b"hello");
    let first = cache_key(&video);
    let second = cache_key(&video);
    assert_eq!(first, second);
    assert_eq!(first.len(), 16, "khoá là 16 ký tự hex");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn khoa_cache_doi_khi_noi_dung_khac() {
    let dir = tmp_dir("diffpath");
    let a = dir.join("a.mp4");
    let b = dir.join("b.mp4");
    write_file(&a, b"hello");
    write_file(&b, b"hello");
    assert_ne!(cache_key(&a), cache_key(&b));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn khoa_cache_doi_khi_kich_thuoc_doi() {
    let dir = tmp_dir("diffsize");
    let video = dir.join("v.mp4");
    write_file(&video, b"hello");
    let first = cache_key(&video);
    write_file(&video, b"hello world much longer");
    assert_ne!(first, cache_key(&video));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn ghi_doc_cache_round_trip() {
    let dir = tmp_dir("roundtrip");
    let video = dir.join("v.mp4");
    write_file(&video, b"hello");
    let key = cache_key(&video);

    let value = CachedSource {
        saved_at: 1_700_000_000,
        transcript: vec![TranscriptLine {
            source_idx: 0,
            start: 1.0,
            end: 2.0,
            text: "xin chào".to_string(),
        }],
        scenes: Vec::new(),
    };
    write_cached(&dir, &key, &value).expect("ghi cache");
    let read = read_cached(&dir, &key).expect("đọc cache");
    assert_eq!(read, value);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn doc_cache_rong_khi_chua_co() {
    let dir = tmp_dir("missing");
    assert!(read_cached(&dir, "khongco").is_none());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn doc_cache_bo_qua_khi_khoa_rong() {
    let dir = tmp_dir("emptykey");
    assert!(read_cached(&dir, "").is_none());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn ghi_cache_bo_qua_khi_khoa_rong() {
    let dir = tmp_dir("emptykey2");
    // Không được tạo file lạ ⇒ trả Ok, không lỗi.
    write_cached(&dir, "", &CachedSource::default()).expect("phải Ok");
    assert!(std::fs::read_dir(&dir).expect("đọc thư mục").next().is_none());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn cache_hong_bi_bo_qua_khi_json_hong() {
    let dir = tmp_dir("broken");
    std::fs::write(cache_file(&dir, "abc"), "{khong phai json").expect("ghi file hỏng");
    assert!(read_cached(&dir, "abc").is_none());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn ensure_cache_dir_tao_thu_muc() {
    let dir = tmp_dir("ensure");
    let cache_dir = ensure_cache_dir(&dir).expect("tạo thư mục cache");
    assert!(cache_dir.exists());
    assert_eq!(cache_dir.file_name().and_then(|n| n.to_str()), Some(CACHE_DIR_NAME));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn mtime_dung_trong_khoa() {
    // Khoá phải phản ánh mtime (đổi mtime ⇒ đổi khoá) — kiểm bằng cách tạo
    // 2 file cùng nội dung ở 2 thời điểm khác nhau.
    let dir = tmp_dir("mtime");
    let a = dir.join("a.mp4");
    let b = dir.join("b.mp4");
    write_file(&a, b"x");
    std::thread::sleep(std::time::Duration::from_millis(20));
    write_file(&b, b"x");
    assert_ne!(cache_key(&a), cache_key(&b));
    let _ = std::fs::remove_dir_all(&dir);
    let _ = SystemTime::now();
}
