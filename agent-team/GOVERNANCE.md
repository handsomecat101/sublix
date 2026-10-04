# GOVERNANCE.md — Luật & Quy Tắc Phối Hợp Trong Dự Án Sublix

> Quy tắc chung mà TẤT CẢ các AI Agents (Antigravity, Claude Code, Cursor, Codex, OpenCode) trên mọi IDE phải tuân thủ khi làm việc trên Sublix.

---

## 1. Quy Trình Trước & Sau Khi Làm Việc

### 1.1 Trước Khi Sửa Code (Bước 0 & Bước 1)
1. **Đọc Context:** `SOUL.md` ➔ `PROJECT_STATE.md` ➔ `AGENT_CHAT.md` ➔ Quick Index trong `ISSUE_LOG.md`.
2. **Khóa Task (Task Lock):** Ghi ngay task vào mục `🟡 Task Đang Làm` trong `PROJECT_STATE.md` trước khi chạm vào bất kỳ file code nào.

### 1.2 Trong Khi Làm Việc
- Tuân thủ quy chuẩn Rust (không dùng `unwrap()`, log qua `tracing`).
- Tuân thủ quy chuẩn TypeScript (strict types, không dùng `any` bừa bãi).
- **Tuyệt đối không sửa đè file** mà Agent khác đang khóa trong `PROJECT_STATE.md`.
- Test kỹ với `cargo check` và `npm run build` trước khi build bản Release.

### 1.3 Sau Khi Hoàn Thành (Bàn Giao Chống Trùng Lặp)
- Cập nhật `PROJECT_STATE.md`: Chuyển task sang `✅ Task Hoàn Thành` (**đúng 1 dòng**).
- Ghi tin nhắn bàn giao vào `AGENT_CHAT.md` (**3 – 7 dòng**, tag `@done` hoặc `@handoff`).
- Nếu có bài học kỹ thuật mới: Cập nhật Quick Index và ghi chi tiết vào `ISSUE_LOG.md`. **Không chép lại đoạn phân tích lỗi này sang `AGENT_CHAT.md`**.

---

## 2. Phân Quyền & Ranh Giới (Agent Roles)

| Agent | Thế mạnh / Phạm vi chính | Được phép sửa | Cần xác nhận trước khi sửa |
|-------|--------------------------|---------------|----------------------------|
| **Antigravity** | Kiến trúc hệ thống, Rust Engine, AI Pipeline, Release Build | Toàn bộ codebase theo task | - |
| **Claude Code** | Audio DSP, Logic Streaming, Bug fixes | `src-tauri/src/`, `src/lib/` | Cấu hình window Tauri, Release script |
| **Cursor / Codex** | Frontend React, UI/UX, CSS styling, Testing | `src/views/`, `src/components/`, `src/*.css` | Rust backend core files |
| **MiniMax M3** | Vá lỗi theo hướng dẫn chi tiết (thợ code — nhận task qua `AGENT_CHAT.md`) | Theo phạm vi ghi trong từng task (vd: `src-tauri/src/downloader/`, `src/views/DownloaderView.*` theo `FIX_GUIDE_DOWNLOAD_TAB.md`) | Sửa file ngoài phạm vi được giao; tự ý đổi kiến trúc khi chưa xin phép |
| **Anh Tuấn (`jimmyvu`)** | Product Owner, Kiến trúc sư trưởng | **Toàn quyền** | - |

---

## 3. Git & Release Rules

- **Branch chính:** `master`
- **Commit format:** Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`)
- **Release binary:** Luôn kiểm tra `npm run build` và `npx tauri build --no-bundle` hoàn tất với mã thoát `0` trước khi cam kết mã nguồn lên remote repository.
