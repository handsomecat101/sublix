# PROJECT_STATE.md — Bảng Trạng Thái Sublix (Dashboard)

> **QUY TẮC TIẾT KIỆM TOKEN (BẮT BUỘC):**
> 1. File này **CHỈ chứa bảng trạng thái tổng quan** (mỗi task **đúng 1 dòng ngắn gọn**).
> 2. **CẤM** viết nhật ký theo giờ hoặc phân tích lỗi dài dòng vào đây (đã có `AGENT_CHAT.md` và `ISSUE_LOG.md`).
> 3. **Khóa Task ngay ở Bước 1:** Chuyển ngay task sang mục `🟡 Task Đang Làm (In Progress - Lock)` trước khi sửa code.

---

## 📊 Thông Tin Dự Án

| Field | Value |
|-------|-------|
| **Project Name** | **Sublix** |
| **Bản Build Hiện Tại** | `v0.6.0` (Release standalone binary tại `src-tauri/target/release/sublix.exe`) |
| **Git Commit** | `37f83df` on `master` (`https://github.com/handsomecat101/sublix.git`) |
| **Trạng Thái** | 🟡 Active (Đang hoàn thiện hệ thống Multi-Agent & chuẩn bị Lồng tiếng AI) |

---

## 👥 Thành Viên & Ca Trực (Multi-IDE Agents)

| Agent / IDE | Vai trò chính | Status | Ghi chú |
|-------------|---------------|--------|---------|
| **Antigravity** | Kiến trúc hệ thống, Full-stack Rust + React, AI Model Integration | 🟡 Active | Đang trực ca chính |
| **Claude Code** | Logic Audio, Pipeline Scripting, Bug Fixes | ⚪ Available | Có thể chuyển giao bất cứ lúc nào |
| **Cursor / Codex** | UI/UX Component, CSS styling, Performance profiling | ⚪ Available | Sẵn sàng nhận việc UI |
| **Anh Tuấn (`jimmyvu`)** | Product Owner, Reviewer, Kiến trúc sư trưởng | 👤 Available | Duyệt merge & roadmap |

---

## 🟡 Task Đang Làm (In Progress - Lock)

| ID | Task | Agent | Priority | Status | Files đang sửa |
|----|------|-------|----------|--------|----------------|
| - | *Chưa có task nào đang khóa — Sẵn sàng nhận việc* | - | - | ⚪ Standby | - |

---

## ⏳ Task Chờ (Backlog / Roadmap)

| ID | Task | Agent dự kiến | Priority | Ghi chú ngắn |
|----|------|---------------|----------|--------------|
| `TSK-012` | Tích hợp Sherpa-ONNX 3D-Speaker Diarization nâng cao | Antigravity | 🔴 HIGH | Nhận diện giọng nói đa vai bằng vector embedding |
| `TSK-013` | Tích hợp F5-TTS Vietnamese / Kokoro ONNX cho Voice Cloning | - | 🟡 MEDIUM | Tầng 4: Đọc câu thoại theo đúng mẫu giọng nhân vật |
| `TSK-014` | Tách Vocal/BGM bằng Demucs v4 ONNX | Antigravity / Claude | 🟡 MEDIUM | Tách nhạc nền và lời ca sĩ không bị lẫn |

---

## ✅ Task Hoàn Thành (1 dòng / task)

| ID | Task | Agent | Ngày xong | Kết quả / Version (1 câu ngắn) |
|----|------|-------|-----------|--------------------------------|
| `TSK-011` | Triển khai Module AI Dubbing Studio (Diarization, TTS, Remux) | Antigravity | 2026-10-04 | Hoàn thành Studio phân vai, nghe thử TTS, biên kịch MiniMax-M3 và xuất video FFmpeg |
| `TSK-010` | Tích hợp Collaborator Kit v1.1 vào Sublix & hệ thống app | Antigravity | 2026-10-04 | Hoàn thành bộ 4 file cốt lõi + quy trình 6 bước + skill `.agents/skills/jimmyvu-agent-collab` |
| `TSK-009` | Cấu hình MiniMax-M3 API (`sk-cp-`) & nút chọn model | Antigravity | 2026-10-04 | Đã cấu hình gateway `api.minimax.io`, cờ `reasoning_split`, test Anh/Nhật/Trung mượt mà |
| `TSK-008` | Soạn thảo Đặc tả Kỹ thuật Lồng Tiếng AI SOTA | Antigravity | 2026-10-04 | Hoàn thành `docs/SPEC_AI_DUBBING_AND_LLM.md` cho reviewer đánh giá |
| `TSK-007` | Tích hợp MiniMax Cloud API & Local Ollama 27B | Antigravity | 2026-10-03 | Hỗ trợ 3 provider dịch thoại linh hoạt, không tốn VRAM |
| `TSK-006` | Thiết kế lại Settings UI dạng Sidebar Navigation | Antigravity | 2026-10-03 | Giao diện hiện đại, dễ thao tác theo yêu cầu anh Tuấn |
| `TSK-005` | Triển khai tính năng Tạo phụ đề hàng loạt cho Tệp | Antigravity | 2026-10-02 | Hỗ trợ kéo thả mp4/mkv/mp3 xuất file srt/vtt/json |
| `TSK-004` | Tối ưu hóa Whisper CUDA & Llama-server VRAM | Antigravity | 2026-10-01 | Tốc độ STT đạt ~0.1s/chunk trên RTX 3090 |

---

## 🔴 Blockers (Nếu có)

*Không có blocker nào tại thời điểm này.*
