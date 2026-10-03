# ISSUE_LOG.md — Sổ Tay Miễn Dịch Lỗi Kỹ Thuật Sublix

> **QUY TẮC GHI LỖI TIẾT KIỆM TOKEN (BẮT BUỘC):**
> 1. **Khi khởi động (Bước 0):** Đọc ngay **Bảng Tra Cứu Nhanh (Quick Index)** ở đầu file (5 giây nắm toàn bộ bẫy kỹ thuật của dự án). Chỉ đọc xuống phần chi tiết khi làm việc đụng tới file liên quan.
> 2. **Chỉ ghi lỗi có bài học kỹ thuật:** Ghi ngắn gọn **5 – 8 dòng/lỗi** (Triệu chứng → Root Cause → Cách phòng tránh).
> 3. **Không chép lặp sang file khác:** Chi tiết lỗi chỉ nằm duy nhất tại file này.

---

## ⚡ Bảng Tra Cứu Nhanh (Quick Index)

| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc phòng tránh (1 câu) | Status |
|----|------------------------|----------------|-----------------------------|--------|
| `BUG-001` | Lỗi build release: `Access is denied (os error 5)` khi ghi đè `sublix.exe` | Windows OS / Tauri build | Trước khi build release, luôn chạy `Get-Process sublix` và kill tiến trình cũ | ✅ Fixed |
| `BUG-002` | Ký tự tiếng Nhật/Trung/Việt bị biến thành dấu `????` khi test | PowerShell JSON pipe | Tránh dùng pipeline PowerShell cho JSON có ký tự CJK, dùng UTF-8 byte stream hoặc test qua Rust | ✅ Fixed |
| `BUG-003` | Key MiniMax Token Plan `sk-cp-` báo lỗi `401 invalid api key` | `src-tauri/src/translate/server.rs` | Key `sk-cp-` bắt buộc phải gọi đến `https://api.minimax.io/v1`, không dùng `api.minimax.chat` | ✅ Fixed |
| `BUG-004` | Model suy luận `MiniMax-M3` làm lộ khối `<think>...</think>` vào phụ đề | `src-tauri/src/translate/server.rs` | Bắt buộc gửi `"reasoning_split": true` trong body và lọc regex `<think>` ở post-process | ✅ Fixed |
| `BUG-005` | Whisper CUDA báo thiếu `cublas64_12.dll` trên máy chưa cài CUDA Toolkit | `src-tauri/Cargo.toml` / runtime | Luôn sao chép các DLL cu12 runtime (`cublas64_12.dll`, `cudart64_12.dll`) đi kèm thư mục release | ✅ Fixed |

---

## 🔍 Chi Tiết Các Lỗi Kỹ Thuật

### [BUG-001] File `sublix.exe` bị khóa tiến trình khi build Release
- **Ngày:** 2026-10-04 | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src-tauri/target/release/sublix.exe`
- **Nguyên nhân gốc (Root Cause):** Tiến trình `sublix.exe` cũ vẫn đang chạy ngầm hoặc treo do người dùng chưa tắt hết cửa sổ, Windows khóa file không cho Cargo ghi đè.
- **Cách fix & Bài học:** Chạy `Get-Process -Name "*sublix*" | Stop-Process -Force` trước khi chạy `npx tauri build`.

---

### [BUG-002] Ký tự CJK/tiếng Việt bị biến thành dấu hỏi `????` khi test API qua CLI
- **Ngày:** 2026-10-04 | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** PowerShell test scripts
- **Nguyên nhân gốc (Root Cause):** PowerShell 5.1/7 mặc định encode string pipeline theo mã ANSI của Windows, làm hỏng các byte UTF-8 của chữ Hán và tiếng Nhật khi serialize JSON.
- **Cách fix & Bài học:** Dùng `[System.Text.Encoding]::UTF8.GetBytes()` khi gửi HTTP trong PowerShell, trong Rust backend mọi thứ luôn là UTF-8 chuẩn nên không bị lỗi này.

---

### [BUG-003] Key `sk-cp-` của MiniMax Coding Plan bị từ chối 401 trên endpoint mặc định
- **Ngày:** 2026-10-04 | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src-tauri/src/translate/server.rs`
- **Nguyên nhân gốc (Root Cause):** MiniMax tách riêng cụm máy chủ mở (`api.minimax.chat`) và cụm Developer Platform / Coding Plan toàn cầu (`api.minimax.io`). Key dạng `sk-cp-` chỉ hợp lệ trên `api.minimax.io`.
- **Cách fix & Bài học:** Cấu hình endpoint mặc định cho MiniMax là `https://api.minimax.io/v1/chat/completions`.

---

### [BUG-004] Thẻ suy luận `<think>` của MiniMax-M3 tràn vào văn bản phụ đề
- **Ngày:** 2026-10-04 | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src-tauri/src/translate/server.rs`
- **Nguyên nhân gốc (Root Cause):** `MiniMax-M3` là mô hình lý luận (Reasoning Model). Mặc định nó nhồi cả dòng suy nghĩ vào trường `content` trước câu trả lời.
- **Cách fix & Bài học:** Thêm tham số `"reasoning_split": true` vào payload JSON của MiniMax API (đẩy suy nghĩ vào `reasoning_content`), đồng thời bổ sung bộ lọc regex cắt bỏ `<think>...</think>` trong hàm `post_process`.

---

### [BUG-005] Thiếu DLL CUDA runtime khi chạy trên máy trần
- **Ngày:** 2026-10-02 | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src-tauri/target/release/`
- **Nguyên nhân gốc (Root Cause):** `whisper.cpp` build với flag `cuda` liên kết động tới `cublas64_12.dll` và `cudart64_12.dll`. Nếu máy người dùng không có CUDA 12 trong PATH, app sẽ crash khi khởi động STT.
- **Cách fix & Bài học:** Đặt các file DLL CUDA runtime cần thiết vào ngay cùng thư mục chứa `sublix.exe` hoặc thư mục lib của ứng dụng.
