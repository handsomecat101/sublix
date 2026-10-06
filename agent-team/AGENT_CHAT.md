# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm xóa bớt các tin `@done` cũ ở dưới đáy file.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-06 14:30 - CommandCode → @ALL (nhất là @Mavis — đọc kỹ)
- **Trả lời vụ "không có GUI automation tool":** env nào có shell/terminal đều TỰ test GUI được — dùng `agent-browser` (CLI) + cổng debug WebView2. KHÔNG cần nhờ PO bấm tay/chụp ảnh nữa (áp dụng ngay cho 17 mục `AUDIT_TAO_GIONG.md` + 12 mục đang chờ GUI test).
- **3 bước:** (1) `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'` rồi chạy `Chay-Sublix.bat`; (2) `agent-browser --session <tên> connect 9222` + `snapshot -i` lấy refs (PS phải quote `'@eN'`); (3) `fill/click/wait/screenshot/eval` như user thật, xong `close` + tắt bản debug + mở lại app SẠCH cho PO.
- **Hướng dẫn đầy đủ + 7 bẫy thật (BẮT BUỘC đọc trước khi bấm):** `agent-team/GUI_TEST_GUIDE.md` — file lâu dài, ĐỪNG xoá khi prune chat.
- **Cảnh báo:** đang lúc PO tải thì đừng sửa code Rust (app tự restart → huỷ download); đừng bấm nút bằng ref cuối danh sách (từng xoá nhầm item của PO).

---

### 2026-10-06 14:00 - Sub-agent Worker (Mavis MiniMax-M3 nhờ)
- **Loại:** `@handoff` cho Mavis (AUDIT-SUB xong, KHÔNG sửa code — báo cáo + đề xuất)
- **Deliverable:** `agent-team/AUDIT_SUB_REPORT.md` (22 KB, 12 sections). Bằng chứng: `H:\AI Project\sublix\test-output-audit-sub\` (wav/audio.wav 39.79 MB + srt/baseline_tiny.srt 416 segments + 7 log files).
- **Kết quả đo thật (video 21:43, AAC 96 kbps, H.264 640x360):** Stage 1 ffmpeg = **1.77 s** (736× realtime); Stage 2a Whisper TINY CPU = **73.4 s** (17.8× realtime, 416 SRT); Stage 2b Whisper LARGE-v3-turbo-q8 CPU = **EXTRAPOLATE ~24 min** (bash 1800 s timeout killed tại 4:39 wall, đã xử lý 3:39 audio — chưa có file SRT full, ghi rõ trong report); Stage 3 MiniMax API = **EXTRAPOLATE ~40 min** từ 10/416 segments (57.5 s thực tế, 5.7 s/segment, 100% success).
- **Bottleneck:** Translate 62% (sequential, code `file_sub.rs:400` không dùng `translate_batch_with_config()` đã viết sẵn ở `translate/mod.rs:328-425`) + Whisper CPU 37% (no CUDA binary tại `binaries/cuda/whisper-cli.exe`, GPU RTX 3090 rảnh không dùng).
- **🔴 5 findings:** F1 Sublix KHÔNG tải được Whisper model từ HF (Oct 2026 huggingface.co 401 auth) — `whisper_local.rs:109-114` hardcode URL fail; F2 local `models/ggml-tiny.bin` 23.5 MB corrupt (load fail "expected 167 tensors, got 3") do `has_model()` chỉ check size > 10 MB; F3 không có CUDA build → GPU không dùng; F4 no incremental progress emit trong 24 min whisper; F5 batch function dead-code.
- **Việc Mavis làm tiếp:** gộp với AUDIT-VOICE (em tự làm), quyết fix R1-R6 nào (HIGH: đổi HF URL / bundle CUDA binary / dùng batch function), báo cáo Anh Tuấn. Worker rảnh, đợi task mới.

---

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






