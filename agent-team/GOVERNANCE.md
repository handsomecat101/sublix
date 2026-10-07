# GOVERNANCE.md — Luật & Quy Tắc Phối Hợp Trong Dự Án Sublix

> Quy tắc chung mà TẤT CẢ các AI Agents (Antigravity, Claude Code, Cursor, Codex, OpenCode) trên mọi IDE phải tuân thủ khi làm việc trên Sublix.

---

## 0. LUẬT CHẠY THẬT — "CHƯA CHẠY LÀ CHƯA XONG" (Thêm 2026-10-06 — chỉ đạo trực tiếp của Anh Tuấn)

> **Sự cố để lại bài học:** 3 vòng review tuyên bố "đạt" hoàn toàn bằng **đọc code + build xanh**, trong khi mở app thật ra thì tính năng Tải Video hỏng hàng loạt (EOF, 429, chỉ tải 360p, báo oan...). Anh Tuấn phải tự gọi agent khác ngồi sửa mất nhiều giờ. Luật này để **KHÔNG BAO GIỜ** tái phạm.

1. **KHÔNG được viết/tuyên bố "đạt", "hoàn thành", "xong", "verify OK" khi CHƯA mở app và làm THẬT đúng tính năng đó.** (Ví dụ: tính năng tải video = phải tải về được 1 video thật trên đĩa; sửa nút = phải bấm thật nút đó.)
2. **Mọi task đụng UI / chức năng phải có BẰNG CHỨNG CHẠY THẬT** khi báo cáo: screenshot, đường dẫn file tải về thật, output thật. **Build xanh + đọc code KHÔNG PHẢI bằng chứng.**
3. **Cách test GUI thật (bắt buộc với agent):** chạy `Chay-Sublix.bat` (dev mode) kèm `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, dùng `agent-browser` bấm chuột như người thật (hướng dẫn chi tiết: `AGENT_CHAT.md` tin 2026-10-06 08:55). Không tự chạy được thì nhờ Anh Tuấn bấm và ghi rõ "đang chờ PO test".
4. **Không tự chạy được thì ghi đúng 4 chữ "CHƯA CHẠY THỬ"** — tuyệt đối không dùng từ "đạt" / "hoàn thành" trong trường hợp này.
5. **Sửa lỗi nào — test chính cảnh đó.** Báo cáo `@done` thiếu bằng chứng chạy thật sẽ bị TRẢ VỀ, không được bàn giao tiếp.

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
