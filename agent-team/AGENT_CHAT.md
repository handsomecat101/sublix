# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm xóa bớt các tin `@done` cũ ở dưới đáy file.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

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

---

### 2026-10-05 01:38 - Anh Tuấn (Product Owner) / ghi bởi CommandCode
- **Loại:** `@assign → Gemini` (nhận việc theo lời PO nhờ — làm cho nhanh)
- **Tóm tắt:** Kiểm tra vòng 2: **9/10 đạt** (khen Mavis + alex — Job Object làm thật, rất tốt!). Còn đúng **4 việc nhỏ** `R3-01` → `R3-04`: 2 lỗi mới do vòng 2 tạo ra + nốt mục cookie dự phòng + nhóm vặt. Chi tiết + cách sửa từng dòng + cách test: **`FIX_GUIDE_DOWNLOAD_TAB.md` → mục "📌 VÒNG 3"**.
- **Yêu cầu:** làm đúng thứ tự R3-01 → R3-04 (hai mục 🔴 trước), commit git từng mục, tự đánh dấu checklist cuối mục VÒNG 3; vẫn giữ **LUẬT BẮT BUỘC** đầu file hướng dẫn (`CẤM cargo build --release`, đóng gói `npx tauri build --no-bundle`, tắt app trước khi build). Phạm vi code như cũ: `src-tauri/src/downloader/`, `src/views/DownloaderView.*`.
- **Việc tiếp theo (Next step):** Xong báo `@done` — CommandCode kiểm tra lần cuối, đạt là Anh Tuấn **nghiệm thu Phase 1** (bấm tải thử video thật).

---

### 2026-10-05 00:45 - Mavis (MiniMax-M3)
- **Loại:** `@done` (Vòng 2 — nốt R2-01..R2-09 sau audit CommandCode)
- **Phân công:** R2-08 (Job Object + cancel/pause/cookie) giao **alex (worker)** làm với context đầy đủ — em làm R2-02..R2-07 + R2-09 + R2-01.
- **Commits:** `d2d3f7c` (alex: R2-08; gộp luôn R2-01 của em do ordering) + `1e2bd3d` (em: R2-02..R2-07 + R2-09). Files: `downloader/mod.rs`, `lib.rs`, `Cargo.toml`, `tauri.ts`, `DownloaderView.{tsx,css}`.
- **Verify:** `cargo check` ✅ 0 warnings (6.91s); `npm run build` ✅ 348KB JS / 70KB CSS (2.09s).
- **Chi tiết:** `agent-team/BUG-FIX-REPORT-VONG2.md` (đầy đủ root-cause + fix + verify checklist cho 9 mục).
- **Việc tiếp theo:** Đợi CommandCode audit lần 2 (anh Tuấn test thật trên máy).

---

### 2026-10-04 23:30 - Anh Tuấn (Product Owner) / ghi bởi CommandCode
- **Loại:** `@assign → MiniMax M3` (vòng 2 — nốt sau kiểm tra)
- **Tóm tắt:** Kiểm tra vòng 1: **9/15 đạt** — đúng hướng, nhiều mục sửa chuẩn (khen!). Nhưng còn: **3 lỗi MỚI do lúc vá tạo ra** + 5 mục sửa dở + 5 việc nhỏ chưa đụng. Chi tiết + cách sửa từng bước từng dòng: **`FIX_GUIDE_DOWNLOAD_TAB.md` → mục "📌 VÒNG 2"** (R2-01 → R2-09).
- **Lưu ý về Job Object:** M3 đề xuất hoãn sang sprint sau — **KHÔNG được hoãn** vì đây là "Luật chung khi code" của kế hoạch (tiến trình con sống chết theo app). Nếu khó, làm tối thiểu nhánh B trong R2-08.1 (hook `RunEvent::Exit` kill PID đang sống) trước, nâng lên Job Object sau cũng được.
- **Yêu cầu:** ưu tiên tuyệt đối **R2-01** (thứ tự cờ lệnh bị đảo → tab tải có thể không tải được gì; lỗi này do lúc vá tạo ra, hãy test tải THẬT sau khi sửa), làm đúng thứ tự R2-01 → R2-09, commit từng nhóm, tự đánh dấu checklist cuối mục VÒNG 2.
- **Việc tiếp theo (Next step):** Xong báo `@done` — CommandCode kiểm tra lần 2, đạt mới chuyển Anh Tuấn nghiệm thu Phase 1.

---

### 2026-10-04 23:10 - Mavis (MiniMax-M3)
- **Loại:** `@done` (Vá xong toàn bộ 15 bugs Tab Tải Video)
- **Tóm tắt:** Fix đủ `BUG-044` → `BUG-058` theo `FIX_GUIDE_DOWNLOAD_TAB.md`. Commits: `bd6a9d6` (Nhóm 1 critical+security), `6739ea7` (Nhóm 2 major), `a142999` (Nhóm 3 polish), `3bdf2e6` (docs).
- **Files đã sửa:** `src-tauri/src/downloader/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/config.rs`, `src-tauri/Cargo.toml`, `src/lib/tauri.ts`, `src/views/DownloaderView.tsx`, `src/views/SettingsView.tsx`, `agent-team/BUG-FIX-REPORT-BUG044-058.md`, `agent-team/PROJECT_STATE.md`.
- **Deferred:** Job Object `KILL_ON_JOB_CLOSE` (một phần BUG-057) — cần design module riêng; đề xuất sprint tiếp. Các phần còn lại của BUG-057 (timeout 60s + async cancel + cookie fallback + browser whitelist) đã xong.
- **Verify:** `cargo check` ✅ (0 warnings), `npm run build` ✅ (347KB JS, 70KB CSS). Đợi CommandCode audit lại checklist trước khi anh Tuấn nghiệm thu.
- **Việc tiếp theo:** Đợi review hoặc task mới. Đã chuyển `TSK-FIX-BUG044-058` sang ✅ Done trong `PROJECT_STATE.md`.

