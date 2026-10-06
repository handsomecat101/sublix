# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm xóa bớt các tin `@done` cũ ở dưới đáy file.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-06 13:00 - CommandCode
- **Loại:** `@done` (v0.9.5 + v0.9.6 — theo yêu cầu PO: fix chất lượng, chi tiết tải, link gốc + copy, tiến trình)
- **v0.9.5 (chất lượng)**: bỏ ép `youtube:player_client=android,web_safari,ios` (YouTube bóp android SABR → mọi video chỉ còn 360p). Verify: PO tự tải DeepSeek V4.1 → **1920×1080 (309.7 MB)**; CLI 720p → 1280×720.
- **v0.9.6 (hiển thị)**: danh sách tải hiện 🎞 chất lượng + 💾 dung lượng thật + 📁 đường dẫn; khi tải hiện "đã tải / tổng"; backfill mục cũ qua `downloader_file_meta`; event `downloader:meta`. Thêm 🔗 link gốc + nút "📋 Copy link" trên mọi mục (link die còn copy tải lại).
- **Fix 403**: cài `curl_cffi` cho yt-dlp (impersonation) — BBB retry OK 1280×720 (77.8MB). **Máy mới nhớ `pip install curl_cffi`.**
- **Verify GUI**: chips + link + copy hiện đủ trên danh sách; 10/10 test; exe v0.9.6 build OK.
- **Việc tiếp theo:** PO nghiệm thu; file cũ 360p muốn nét phải xóa rồi tải lại.

---

### 2026-10-06 12:00 - CommandCode
- **Loại:** `@done` (v0.9.4 — theo yêu cầu PO: nút Chạy Video + chỉ rõ thư mục tải)
- **Tính năng:** ▶ Chạy Video (ShellExecuteW — mở bằng player mặc định của máy); header hiện "📁 File tải về được lưu tại: <path>" (command `downloader_downloads_dir`); checkbox phụ đề mặc định TẮT.
- **Fix kèm:** nút "Mở Thư Mục" trước đây spawn `explorer.exe /select` từ app KHÔNG mở được cửa sổ (argv-quoting) — thay bằng `SHOpenFolderAndSelectItems` (+features `Win32_UI_Shell_Common`/`Win32_System_Com`).
- **Verify GUI thật (agent-browser):** click Chạy Video → VLC mở đúng file; click Mở Thư Mục → Explorer mở đúng thư mục downloads; header hiện path; 10/10 test; exe v0.9.4 build OK.
- **Việc tiếp theo:** PO nghiệm thu. Lưu ý giải thích cho PO: "video 20 phút tải vài giây" là do file đã có sẵn trên đĩa (yt-dlp báo đã tải rồi — đúng hành vi, file hoàn chỉnh).

---

### 2026-10-06 09:45 - CommandCode
- **Loại:** `@done` (v0.9.3 — sửa lỗi báo oan "không in ra đường dẫn file", anh Tuấn gặp 9:06 với video Arthas)
- **Root cause:** output yt-dlp không phải UTF-8 ⇒ dòng Destination in ra **MẤT ký tự codepage không biểu diễn được** (`：｜`, CJK) trong khi file trên đĩa vẫn đủ ký tự ⇒ `exists()` trượt ⇒ báo Lỗi oan dù exit 0. (Ghi chú: `C:`→`C#` thấy trong log test là artifact PowerShell Start-Process của test harness — KHÔNG phải lỗi app; thư mục rác ` C#/` đã dọn.)
- **Fix:** ép `PYTHONIOENCODING=utf-8`+`PYTHONUTF8=1`; fallback quét thư mục tải theo tag `[<video_id>]` (bằng chứng gốc, an toàn BUG-046); UI "Thử lại" thành công xoá cảnh báo cũ. Commits `e48712c`+`8162033`.
- **Verify:** cargo check 0/0; 10/10 test (2 mới); **GUI E2E thật: bấm "Thử lại" mục Arthas → Hoàn Thành 3→4, hết ⚠️**; exe v0.9.3 build OK.
- **Phụ:** Desktop PO có 6 cửa sổ `Chay-Sublix-Dev.bat` chạy chồng — đã dọn; file Dev cũ giờ redirect sang `Chay-Sublix.bat`. Rác test (` C#/`, `_agent_test/`) đã xoá.
- **Việc tiếp theo:** PO xác nhận; câu hỏi mở: checkbox phụ đề mặc định đang BẬT — có đổi thành TẮT không?

---

### 2026-10-06 08:55 - CommandCode
- **Loại:** `@info` + `@handoff` (Tooling + GUI E2E tự động — tiếp nối tin `@done` v0.9.2 bên dưới)
- **File chạy chuẩn:** `Chay-Sublix.bat` (repo root + Desktop) chạy **dev mode = luôn code mới nhất**; từ nay KHÔNG cần build release cho việc PO test (release chỉ để đóng gói). Chi tiết: `DEV-LOG.md` Session 14.
- **GUI test được từ agent:** thêm env `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` khi chạy app + `agent-browser` (CDP, chọn tab main) → fill/click/snapshot như user thật. **Mọi thay đổi đụng UI nên test kiểu này.**
- **Kết quả GUI v0.9.2:** URL chết → thông báo thân thiện (hết EOF); URL sống → metadata OK; tải 720p không sub → ✅ Hoàn thành, file 30MB trên đĩa.
- **Việc tiếp theo:** PO nghiệm thu (app v0.9.2 đang mở sẵn, không cổng debug). Câu hỏi mở cho PO: checkbox phụ đề đang BẬT mặc định — có muốn đổi mặc định thành TẮT không?

---

### 2026-10-06 08:40 - CommandCode
- **Loại:** `@done` (Fix v0.9.2 theo `agent-team/HANDOFF_V0.9.2_BUG_EOF_AND_429.md` — 2 bug: EOF "Kiểm Tra Link" + 429 phụ đề)
- **Bug#1 (EOF):** Root cause thật: R2-08.3 đổi sang `spawn()+wait_with_output()` nhưng **thiếu pipe stdout/stderr** → output luôn rỗng (exit 0 ⇒ serde EOF; exit 1 ⇒ mất stderr). Fix: `Stdio::piped()` + parse JSON giữa `{` đầu ↔ `}` cuối + fallback thông báo thân thiện, hết lộ lỗi serde thô.
- **Bug#2 (429):** Thêm `--sleep-subtitles 5` (2s vẫn dính khi chạy dồn — xác nhận rate-limit phía YouTube server). Bổ sung: lỗi CHỈ ở sub mà video đã tải xong ⇒ báo ✅ Hoàn thành + cảnh báo ⚠️ trên UI, không đánh rớt video oan.
- **Verify:** `cargo check` ✅ 0/0; `cargo test --lib downloader` ✅ 8/8 (2 test mới); `npm run build` ✅; `npx tauri build --no-bundle` ✅ (exe ~14.4MB). CLI thật: URL chết → exit 1 "Video unavailable" (hiện thân thiện); URL sống → 1.17MB JSON; 3 sub vi/en/ja tải sạch 1 lượt ra đủ `.srt`.
- **Commits:** `54f5ae2` (code) + `6d7bc1b` (version 0.9.1→0.9.2). Files: `src-tauri/src/downloader/mod.rs` + 5 file version.
- **Việc tiếp theo:** Mời Anh Tuấn nghiệm thu GUI (dán URL chết + tải video 4 sub). Nếu chạy dồn vẫn 429 liên tục → cân nhắc option B (2 pha) theo handoff.

---

### 2026-10-06 08:05 - Mavis (MiniMax-M3)
- **Loại:** `@handoff` (Anh Tuấn tự giao agent khác xử lý 2 bug — em không gọi worker)
- **Tóm tắt:** Anh Tuấn dặn "ghi tài liệu thôi, anh gọi agent ở ngoài". Em viết **`agent-team/HANDOFF_V0.9.2_BUG_EOF_AND_429.md`** (17KB) để anh copy/paste pass cho agent khác. KHÔNG gọi worker, KHÔNG tự code.
- **Trong file handoff có:** (1) Project context + commits; (2) LUẬT BẮT BUỘC; (3) Bug EOF (triệu chứng + URL test + code line 466–606 + 3 root cause hypothesis + 3 đề xuất fix + CLI test command); (4) Bug 429 (triệu chứng + code line 670–684 + 3 options fix + verify); (5) Files IN/OUT scope; (6) Bump 0.9.1 → 0.9.2 + CHANGELOG block + ChangelogModal entry; (7) Build & commit convention; (8) Acceptance checklist 10 mục.
- **Việc tiếp theo:** Anh Tuấn copy file handoff → pass cho agent khác → agent đó làm → báo cáo. Em rảnh, đợi task mới.

---

### 2026-10-05 22:55 - Mavis (MiniMax-M3)
- **Loại:** `@done` (Competitive Analysis Sublix vs 4 đối thủ voice studio)
- **Yêu cầu:** Anh Tuấn muốn có tài liệu so sánh tính năng Sublix vs các repo voice/dubbing trên GitHub để tham khảo sau này.
- **Kết quả:** `agent-team/COMPETITIVE_ANALYSIS.md` (15KB) — so sánh Sublix vs **VoiceStudio** (53k⭐, Python+Electron, AGPL), **dub-studio** (Tauri giống Sublix), **YouDub-webui** (production-grade FastAPI+Next.js), **ZastTranslate** (33 ngôn ngữ + Viral Shorts).
- **Highlights:** (a) VoiceStudio đã BỎ Tauri → Electron (v0.5.3 final Tauri) vì ML ecosystem Python thắng. (b) Sublix UNIQUE 3 thứ: đa engine song song (local+cloud), 1-click pipeline bridges, Downloader đa nền tảng. (c) Roadmap P0 gợi ý: Voice DESIGN + MCP server + multi-TTS engine swap.
- **Việc tiếp theo:** Anh Tuấn nói "trước mắt cứ hoàn thiện tính năng Sublix đi đã, lỗi nhiều lắm" → em sẵn sàng nhận task bug mới từ PO hoặc CommandCode.

---

### 2026-10-05 02:15 - Antigravity (Gemini)
- **Loại:** `@done` (Hoàn tất 100% VÒNG 3: R3-01 → R3-04)
- **Tóm tắt:** Đã giải quyết toàn bộ 4 đầu việc VÒNG 3 theo yêu cầu của CommandCode & Anh Tuấn:
  1. `R3-01`: RAII `PlaceholderGuard` giải phóng slot placeholder nếu `spawn()` lỗi, không kẹt id vĩnh viễn.
  2. `R3-02`: Monotonic `NEXT_RUN_ID` (`AtomicU64`) + `run_id` trong `ActiveJob` & event; worker kiểm tra `job.run_id == my_run_id` trước mọi sửa/xóa; xóa code chết `_run_generation`.
  3. `R3-03`: Tự động retry 1 lần với `--cookies <file>` khi lượt 1 bằng browser cookies gặp lỗi auth ("Sign in...", "cookies", "403"...); UI thông báo "Đã dùng cookie dự phòng".
  4. `R3-04`: State `thumbFailed` + `key={videoInfo.thumbnail}` (bỏ sửa DOM trực tiếp); `fileExistsMapRef` không cache `false` vĩnh viễn khi IPC lỗi thoáng; dọn `itemsRef`; bỏ `as any` cho status; validate URL bằng `new URL()`.
- **Verify:** `cargo check` ✅ 0 errors/warnings (7.27s), `npm run build` ✅ (1.81s), `npx tauri build --no-bundle` ✅ (1m08s → `sublix.exe`).
- **Việc tiếp theo (@CommandCode, @Anh Tuấn):** Mời CommandCode và Anh Tuấn kiểm tra lần cuối để nghiệm thu Phase 1.





