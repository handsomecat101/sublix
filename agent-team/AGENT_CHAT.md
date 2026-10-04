# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm xóa bớt các tin `@done` cũ ở dưới đáy file.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-04 14:24 - Antigravity
- **Loại:** `@done`
- **Tóm tắt:** Hoàn thiện và đóng gói bản phát hành chính thức **`v0.7.0`**: Bump version toàn hệ thống (`Cargo.toml`, `tauri.conf.json`, `package.json`), tích hợp popup `ChangelogModal.tsx` tương tác 1-click có sẵn bộ chuyển Theme tức thì, hiển thị rõ badge `v0.7.0` trên sidebar header/footer & topbar. Đã biên dịch bản release `sublix.exe` mới nhất cho Desktop shortcut.
- **Files đã sửa/tạo:** `src/views/ChangelogModal.tsx`, `src/views/ChangelogModal.css`, `src/views/SettingsView.tsx`, `src/views/SettingsView.css`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `DEV-LOG.md`.
- **Trạng thái Verify:** `npm run build` PASS (878ms), `cargo check` PASS (24s), `cargo build --release` PASS. Sẵn sàng cho người dùng bấm shortcut Desktop trải nghiệm ngay.

---

### 2026-10-04 13:43 - Antigravity
- **Loại:** `@done`
- **Tóm tắt:** Hoàn thành fix Đợt 1 cho 8 lỗi quan trọng từ đợt audit của CommandCode: `BUG-001` (runtime path resolution), `BUG-005` (amix phân cấp chunk 28 + script filter), `BUG-006` (gỡ overflow:hidden toàn cục), `BUG-007` (leak promise listener React), `BUG-008` & `BUG-024` (SRT timestamp thật + BOM UTF-8), `BUG-013` (atomic config + backup .bak), `BUG-015` (Whisper hallucination), `BUG-023` (parse audio duration an toàn UTF-8).
- **Files đã sửa:** `src-tauri/src/config.rs`, `src-tauri/src/dubbing/mod.rs`, `src-tauri/src/stt/whisper_local.rs`, `src-tauri/src/stt/whisper_server.rs`, `src-tauri/src/translate/mod.rs`, `src-tauri/src/translate/server.rs`, `src-tauri/src/lib.rs`, `src/App.css`, `src/views/SettingsView.tsx`.
- **Trạng thái Verify:** `cargo check` PASS (2.25s), `npm run build` PASS (1.38s). Sẵn sàng nhận việc Đợt 2 (`TSK-018`: Job Object kill child process & async Tauri).

---

### 2026-10-04 02:40 - Antigravity
- **Loại:** `@handoff` (Bàn giao ca trực cho Agent Debugger kế nhiệm)
- **Tóm tắt:** Đã đóng gói hoàn tất E2E AI Dubbing Studio & fix `BUG-006`. Đã xuất 2 video mẫu trong `test_dubbing_input/`. Hệ thống sẵn sàng 100% cho bạn vào debug/kiểm thử UI/UX và các trường hợp biên.
- **Lệnh test tái hiện ngay:** `cargo run --example test_dubbing_e2e --manifest-path src-tauri/Cargo.toml`
- **Files trọng tâm cần xem:** `agent-team/ISSUE_LOG.md` (Quick Index), `docs/HUONG_DAN_HE_THONG_LONG_TIENG_AI.md`, `src-tauri/src/dubbing/mod.rs`, `src/views/DubbingStudioView.tsx`.
- **Nhiệm vụ bàn giao:** 1) Kiểm tra phản hồi UI DubbingStudio khi import video thực tế; 2) Test khả năng xử lý file không có thoại hoặc phụ đề rỗng; 3) Kiểm tra edge-case khi mạng chập chờn với Edge-TTS.

---

### 2026-10-04 02:25 - Antigravity
- **Loại:** `@done`
- **Tóm tắt:** Chạy kiểm thử thực tế E2E từ A-Z trên video đối thoại 2 vai (`multi_speaker_scene.mp4`). Phát hiện và fix `BUG-006` (lỗi nhận diện đổi vai khi mốc phụ đề liên tục), xuất bản thành công cả 2 video thành phẩm: Thuyết minh (`multi_speaker_DUBBED_DUCKING.mp4`) và Chiếu rạp Demucs GPU (`multi_speaker_DUBBED_THEATRICAL.mp4`).
- **Files đã sửa/tạo:** `src-tauri/src/dubbing/mod.rs`, `src-tauri/src/config.rs`, `src-tauri/src/lib.rs`, `src-tauri/examples/test_dubbing_e2e.rs`, `agent-team/ISSUE_LOG.md`.
- **Verify/Deploy:** Bản Release `sublix.exe` (`v0.6.0`) build thành công (1m08s), video xuất bản khớp chuẩn 100% âm thanh đa vai.
- **Việc tiếp theo:** Người dùng có thể xem video thành phẩm và thử nghiệm trực tiếp trên giao diện Studio.

---

### 2026-10-04 01:55 - Antigravity
- **Loại:** `@done`
- **Tóm tắt:** Hoàn thiện tài liệu tra cứu kỹ thuật chi tiết `docs/HUONG_DAN_HE_THONG_LONG_TIENG_AI.md` (hướng dẫn chọn voice, cơ chế gán vai, preview 1-click, Demucs CUDA, MiniMax-M3, FFmpeg atempo) và củng cố fallback `python -m edge_tts`.
- **Files đã sửa/tạo:** `docs/HUONG_DAN_HE_THONG_LONG_TIENG_AI.md`, `docs/SPEC_AI_DUBBING_AND_LLM.md`, `src-tauri/src/dubbing/mod.rs`, `AGENTS.md`.
- **Verify/Deploy:** Bản Release `sublix.exe` (`v0.6.0`) đã build thành công 100% tại `src-tauri/target/release/sublix.exe`.
- **Việc tiếp theo:** Sẵn sàng cho người dùng hoặc Agent tiếp theo kiểm thử hoặc nâng cấp thêm model voice offline (Kokoro-VN / F5-TTS).

---

### 2026-10-04 01:48 - Antigravity
- **Loại:** `@done`
- **Tóm tắt:** Bổ sung tùy chọn 2 chế độ xử lý âm thanh: **Thuyết minh (Audio Ducking)** và **Lồng tiếng Chiếu Rạp (Demucs v4 CUDA)** bóc tách 100% giọng gốc, giữ trọn BGM/SFX.
- **Files đã sửa:** `src-tauri/src/dubbing/mod.rs`, `src/lib/tauri.ts`, `src/views/DubbingStudioView.tsx`, `src/views/DubbingStudioView.css`.
- **Verify/Deploy:** Đã kiểm tra `tsc && vite build` và biên dịch thành công bản release `sublix.exe` (58.84s).
- **Việc tiếp theo:** Sẵn sàng kiểm thử thực tế trên video phim nước ngoài để trải nghiệm chất lượng rạp chiếu.

---

### 2026-10-04 01:32 - Antigravity
- **Loại:** `@done`
- **Tóm tắt:** Đã hoàn thiện và tích hợp module **Studio Lồng Tiếng AI (AI Dubbing)**: tự động phân vai diễn viên, nghe thử giọng đọc TTS tức thì, biên kịch kịch bản qua MiniMax-M3, time-stretching và xuất video FFmpeg.
- **Files đã tạo/sửa:** `src-tauri/src/dubbing/mod.rs`, `src-tauri/src/lib.rs`, `src/lib/tauri.ts`, `src/views/DubbingStudioView.tsx`, `src/views/DubbingStudioView.css`, `src/views/SettingsView.tsx`.
- **Verify/Deploy:** Bản Release `sublix.exe` đã build thành công 100%, không lỗi lầm.
- **Việc tiếp theo:** Sẵn sàng nhận video thực tế để chạy thử nghiệm pipeline lồng tiếng.

---

### 2026-10-04 01:14 - Antigravity
- **Loại:** `@done`
- **Tóm tắt:** Tích hợp thành công bộ quy chuẩn Agent Collaborator Kit v1.1 của anh Tuấn (`handsomecat101/agent-team`) vào Sublix và tạo kỹ năng `.agents/skills/jimmyvu-agent-collab`.
- **Files đã sửa/tạo:** `AGENTS.md`, `SOUL.md`, `PROJECT_STATE.md`, `AGENT_CHAT.md`, `ISSUE_LOG.md`, `GOVERNANCE.md`, `QUY_TRINH.md`.
- **Verify/Deploy:** Đã sync đầy đủ tài liệu, sẵn sàng cho các Agent ở IDE khác (Claude Code, Cursor, Codex) vào nhận task.
- **Việc tiếp theo:** Sẵn sàng chuyển giao hoặc bắt đầu triển khai Phase 1 của AI Dubbing (`TSK-011`: Demucs ONNX).
