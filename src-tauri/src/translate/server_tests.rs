//! Test cho vòng đời llama-server (BUG-002 dừng server khi app thoát,
//! BUG-003 không giết tiến trình theo tên).
//!
//! Tách riêng khỏi `server.rs` để file chính không phình to.

use super::*;

/// Dừng server khi **không có** server nào chạy → phải idempotent, không panic.
#[test]
fn stop_server_khi_khong_co_server_van_an_toan() {
    // Gọi nhiều lần → idempotent (BUG-002 yêu cầu "idempotent").
    stop_server();
    stop_server();
    stop_server();
}

/// Chốt hồi quy BUG-003: mã nguồn **không được** còn lệnh giết tiến trình
/// theo tên (`taskkill /IM ...`) — sẽ giết nhầm app/instance khác của user.
#[test]
fn khong_con_giet_tien_trinh_theo_ten() {
    let src = include_str!("server.rs");
    assert!(
        !src.contains("\"/IM\""),
        "translate/server.rs còn taskkill theo tên — chỉ được giết đúng PID con mình spawn"
    );
    assert!(
        src.contains("fn stop_server"),
        "phải có stop_server() để app thoát dừng được server"
    );
}

/// File `.pid` phải nằm trong thư mục runtime tạm (không ghi bận cạnh app).
#[test]
fn pid_file_nam_trong_thu_muc_runtime_tam() {
    let path = crate::proc_kill::pid_file_path(SERVER_PID_NAME);
    assert!(
        path.to_string_lossy().contains("sublix-runtime"),
        "file .pid phải nằm trong thư mục runtime tạm: {path:?}"
    );
    assert_eq!(path.extension().and_then(|e| e.to_str()), Some("pid"));
}
