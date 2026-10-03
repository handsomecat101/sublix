# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm xóa bớt các tin `@done` cũ ở dưới đáy file.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

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

---

### 2026-10-04 01:11 - Antigravity
- **Loại:** `@done`
- **Tóm tắt:** Đã cấu hình gateway riêng cho key `sk-cp-` (`https://api.minimax.io/v1`), cờ `reasoning_split: true`, model mặc định `MiniMax-M3`, bóc tách thẻ `<think>` và thêm nút chọn nhanh model trên UI (`BUG-003`, `BUG-004`).
- **Files đã sửa:** `src-tauri/src/config.rs`, `src-tauri/src/translate/server.rs`, `src/views/SettingsView.tsx`.
- **Verify/Deploy:** Bản Release `sublix.exe` build thành công, test dịch Anh/Nhật/Trung ra văn phong điện ảnh cực mượt, đã push commit `37f83df`.
- **Việc tiếp theo:** Tiếp tục chuẩn hóa quy trình làm việc đa Agent.

---

### 2026-10-04 00:55 - Antigravity
- **Loại:** `@done`
- **Tóm tắt:** Soạn thảo hoàn chỉnh tài liệu Đặc tả Kỹ thuật Lồng Tiếng AI Đa Vai SOTA (`SPEC_AI_DUBBING_AND_LLM.md`) và triển khai 3 Provider dịch thuật (MiniMax, Ollama 27B, Local GGUF).
- **Files đã sửa:** `docs/SPEC_AI_DUBBING_AND_LLM.md`, `src-tauri/src/translate/mod.rs`, `src/lib/tauri.ts`.
- **Verify/Deploy:** Release build `sublix.exe` hoàn tất, commit `2d5f497` đã push lên GitHub.
- **Việc tiếp theo:** Nhận key MiniMax từ anh Tuấn để cấu hình thực tế.
