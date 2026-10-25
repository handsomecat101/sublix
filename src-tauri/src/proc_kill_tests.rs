//! Test cho `proc_kill` — tách riêng để file chính < 300 dòng.
//!
//! Dùng `use super::*` để truy cập các hàm của module `proc_kill`.

use super::*;

fn images() -> ProcessImages {
    let mut m = ProcessImages::new();
    m.insert(1111, "whisper-server.exe".to_string());
    m.insert(2222, "llama-server.exe".to_string());
    m.insert(3333, "chrome.exe".to_string());
    m
}

fn tracked(server_pid: u32, owner_pid: u32) -> TrackedServer {
    TrackedServer {
        server_pid,
        owner_pid,
    }
}

#[test]
fn uu_tien_pid_con_dang_giu_handle() {
    let imgs = images();
    let target = pick_kill_target(
        Some(1111),
        Some(tracked(2222, 9999)),
        false,
        4242,
        &imgs,
        "whisper-server.exe",
    );
    assert_eq!(target, Some(1111), "phải ưu tiên PID con ta đang giữ");
}

#[test]
fn owner_con_song_thi_khong_giet_server_cua_instance_khac() {
    let imgs = images();
    // Instance B đọc file .pid của instance A; A còn sống → không được giết.
    let target = pick_kill_target(
        None,
        Some(tracked(1111, 5555)),
        true, // owner_alive
        4242,
        &imgs,
        "whisper-server.exe",
    );
    assert_eq!(target, None, "app chủ còn sống thì KHÔNG được giết server của nó");
}

#[test]
fn owner_da_chet_thi_giet_server_mo_coi() {
    let imgs = images();
    let target = pick_kill_target(
        None,
        Some(tracked(1111, 5555)),
        false, // owner đã chết
        4242,
        &imgs,
        "whisper-server.exe",
    );
    assert_eq!(target, Some(1111), "owner chết ⇒ server mồ côi ⇒ được dọn");
}

#[test]
fn owner_la_chinh_app_hien_tai_thi_duoc_thay_the() {
    let imgs = images();
    let target = pick_kill_target(
        None,
        Some(tracked(1111, 4242)),
        true, // owner vẫn "sống" nhưng đó là chính ta
        4242,
        &imgs,
        "whisper-server.exe",
    );
    assert_eq!(target, Some(1111), "server của chính ta ở lần trước thì được thay");
}

#[test]
fn khong_giet_tien_trinh_khong_dung_ten() {
    let imgs = images();
    // PID trỏ tới app khác của người dùng → không được giết.
    let target = pick_kill_target(
        Some(3333),
        None,
        false,
        4242,
        &imgs,
        "whisper-server.exe",
    );
    assert_eq!(target, None, "không được giết tiến trình tên khác");
    // PID của server khác (llama-server) cũng không được giết.
    let target = pick_kill_target(
        Some(2222),
        None,
        false,
        4242,
        &imgs,
        "whisper-server.exe",
    );
    assert_eq!(target, None);
}

#[test]
fn file_dinh_dang_cu_khong_giet() {
    let imgs = images();
    // File cũ chỉ có 1 số → owner không rõ → `read_tracked_pid` trả None.
    let dir = std::env::temp_dir().join("sublix-proc-kill-legacy");
    let path = dir.join("server.pid");
    let _ = std::fs::create_dir_all(&dir);
    std::fs::write(&path, "1111").expect("ghi file dinh dang cu");
    let tracked = read_tracked_pid(&path);
    assert_eq!(tracked, None, "định dạng cũ (1 số) → owner không rõ → None");

    let target = pick_kill_target(
        None,
        tracked,
        false,
        4242,
        &imgs,
        "whisper-server.exe",
    );
    assert_eq!(target, None, "owner không rõ thì KHÔNG giết (an toàn)");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn khong_co_pid_nao_khop_thi_khong_giet() {
    let imgs = images();
    assert_eq!(
        pick_kill_target(None, None, false, 4242, &imgs, "whisper-server.exe"),
        None
    );
    assert_eq!(
        pick_kill_target(Some(0), None, false, 4242, &imgs, "whisper-server.exe"),
        None
    );
    assert_eq!(
        pick_kill_target(None, Some(tracked(4444, 5555)), false, 4242, &imgs, "whisper-server.exe"),
        None
    );
}

#[test]
fn so_sanh_ten_khong_phan_biet_hoa_thuong() {
    let mut imgs = ProcessImages::new();
    imgs.insert(5555, "WHISPER-SERVER.EXE".to_string());
    let target = pick_kill_target(
        Some(5555),
        None,
        false,
        4242,
        &imgs,
        "whisper-server.exe",
    );
    assert_eq!(target, Some(5555));
}

#[test]
fn pid_file_doc_ghi_xoa_dung_pid() {
    let dir = std::env::temp_dir().join("sublix-proc-kill-test");
    let path = dir.join("server.pid");
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::remove_file(&path);

    assert_eq!(read_tracked_pid(&path), None, "chưa có file → None");
    write_tracked_pid(&path, 4242, 1111).expect("ghi file pid");
    assert_eq!(
        read_tracked_pid(&path),
        Some(TrackedServer {
            server_pid: 4242,
            owner_pid: 1111
        })
    );

    // Xoá nhầm PID khác → file phải còn nguyên.
    remove_tracked_pid_if_matches(&path, 9999);
    assert!(read_tracked_pid(&path).is_some(), "không được xoá nhầm");
    // Xoá đúng PID → file biến mất.
    remove_tracked_pid_if_matches(&path, 4242);
    assert_eq!(read_tracked_pid(&path), None);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn process_is_alive_cho_tien_trinh_hien_tai() {
    assert!(
        process_is_alive(std::process::id()),
        "tiến trình hiện tại chắc chắn còn sống"
    );
    assert!(!process_is_alive(0), "PID 0 không phải tiến trình");
}
