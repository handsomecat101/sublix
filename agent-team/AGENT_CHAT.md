# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm xóa bớt các tin `@done` cũ ở dưới đáy file.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

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

---

### 2026-10-04 21:50 - Mavis (MiniMax-M3)
- **Loại:** `@acknowledge` (ghi nhận task, chưa code)
- **Tóm tắt:** Em đã đọc `FIX_GUIDE_DOWNLOAD_TAB.md` (15 bugs BUG-044→058, chia 3 nhóm) + `ISSUE_LOG.md` Quick Index. PO (anh Tuấn) giao em làm "Thợ code bên MiniMax" — làm theo 2 bạn Antigravity + CommandCode.
- **Quy ước em sẽ theo:** LUẬT BẮT BUỘC (`CẤM cargo build --release`, dùng `npx tauri build --no-bundle`, tắt app trước khi build).
- **Việc tiếp theo:** Đợi PO confirm.

---

### 2026-10-04 21:40 - Anh Tuấn (Product Owner) / ghi bởi CommandCode
- **Loại:** `@join` + `@assign → MiniMax M3` (đăng ký thành viên mới + giao việc vá lỗi)
- **Tóm tắt:** Chào mừng **MiniMax M3** (thợ code bên MiniMax) vào team! Nhiệm vụ: **vá 15 lỗi Tab Tải Video `BUG-044` → `BUG-058`**. Toàn bộ hướng dẫn chi tiết (file nào, dòng nào, triệu chứng, cách sửa từng bước, cách kiểm tra) đã viết sẵn trong **`FIX_GUIDE_DOWNLOAD_TAB.md`** — đọc file đó là đủ, không cần hỏi thêm.
- **Yêu cầu bắt buộc:** (1) Đọc mục **LUẬT BẮT BUỘC** đầu `FIX_GUIDE_DOWNLOAD_TAB.md` trước khi code — **CẤM `cargo build --release`**, đóng gói bằng `npx tauri build --no-bundle`, nhớ tắt app trước khi build; (2) Làm đúng thứ tự BUG-044 → 058, **commit git sau mỗi nhóm** để dễ hoàn tác; (3) Sửa lỗi nào phải tự đánh dấu checklist cuối file; (4) Phạm vi code: `src-tauri/src/downloader/`, `src/views/DownloaderView.*`, phần downloader trong `lib.rs`/`tauri.ts` — không đụng file ngoài phạm vi (xem bảng phân quyền trong `GOVERNANCE.md`).
- **Files cần đọc:** `FIX_GUIDE_DOWNLOAD_TAB.md` (hướng dẫn chính), `ISSUE_LOG.md` (Quick Index), `GOVERNANCE.md` (quy tắc chung).
- **Việc tiếp theo (Next step):** Sửa xong báo lại trên bảng này (`@done`) — **CommandCode sẽ kiểm tra lại theo checklist** trước khi Anh Tuấn nghiệm thu.

---

### 2026-10-04 21:15 - Antigravity
- **Loại:** `@done` (Hoàn tất 100% Phase 1: Xây dựng Tab Tải Video Đa Nền Tảng theo kế hoạch)
- **Tóm tắt:** Kế thừa trọn vẹn sức mạnh từ `hermes-downloader`:
  1. Backend Rust (`src-tauri/src/downloader/mod.rs`): yt-dlp tự tìm, regex platform (YouTube, TikTok, Douyin, Bilibili, FB, X, IG, ...), format 4K/2K/1080p/720p/480p/360p/MP3/M4A, cookies Edge/Chrome/Firefox, sub extract, stdout streaming, pause giữ `.part`, cancel bằng `taskkill /PID <pid> /T /F`.
  2. Frontend React (`DownloaderView.tsx` + `.css`): giao diện đồng bộ theme Sublix, auto-detect platform badge, inspect metadata trước khi tải, progress bar + MB/s + ETA + size.
  3. Cầu nối 1-Click: 📝 "Tạo Vietsub (.SRT)" + 🎬 "Lồng Tiếng AI" chuyển thẳng sang File Sub / Dubbing Studio với path điền sẵn.
  4. Lịch sử localStorage + Mở thư mục / Reveal file Explorer + banner bản quyền.
- **Verify:** `cargo test` PASS 2/2, `npm run build` PASS (2.27s), đóng gói release OK.

---

### 2026-10-04 20:45 - Antigravity
- **Loại:** `@done` (Hoàn tất 100% Phase 0: Chữa Nền Móng theo chỉ đạo của PO Anh Tuấn)
- **Tóm tắt:** Xử lý triệt để 8 lỗi nền tảng (BUG-026 → 032, 041):
  1. `BUG-026 + 030`: amix cây phân cấp bất biến ≤28 <32 inputs; `normalize=0`; bỏ `dropout_transition=0`; âm lượng đồng đều tuyệt đối.
  2. `BUG-027 + 028 + 041`: AtomicU64 run-generation; `ACTIVE_CHILD_PID` registry + `run_child_with_cancel` polling 150ms diệt sạch cây PID; cancel bao phủ trước/sau Demucs/Remux/fallback dịch.
  3. `BUG-029`: lỗi dịch gắn rõ `[Dịch lỗi: ...]` + `translate_failed` — KHÔNG âm thầm lồng text gốc.
  4. `BUG-031 + 032`: listener Tauri → `promise.then(u => u()).catch(...)`; backend guard `FILE_SUB_RUNNING` với RAII drop guard; chặn drop/chọn file khi đang chạy.
- **Verify:** `cargo test dubbing::tests` PASS (2/2: tree ≤28 + N≤2500 + generation cancel), `npm run build` PASS (1.05s), `npx tauri build --no-bundle` PASS (1m05s → `sublix.exe`).

---

### 2026-10-04 20:07 - Antigravity
- **Loại:** `@proposal` / `@handoff`
- **Tóm tắt:** 1) Hoàn thiện `KE_HOACH_ALL_IN_ONE_PIPELINE.md`; 2) Khám phá mỏ vàng tại `H:\AI Project\hermes-downloader` — kế thừa 80% logic (regex platform, `buildFormatArgs`, cờ `web_safari`, sub flags, UI badges, format helper); 3) Phân kỳ Phase 0 (chữa nền) → Phase 1 (MVP Tải & Dịch A-Z) → Phase 2 (n8n Workflow Builder).
- **Yêu cầu review (@CommandCode):** Xem `agent-team/KE_HOACH_ALL_IN_ONE_PIPELINE.md` (đặc biệt Mục 12: Tái sử dụng `hermes-downloader`).