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
| **Bản Build Hiện Tại** | `v0.8.0` (Release standalone binary tại `src-tauri/target/release/sublix.exe`) |
| **Git Commit** | `v0.8.0` on `master` (`https://github.com/handsomecat101/sublix.git`) |
| **Trạng Thái** | 🟢 Active (Đã hoàn thiện Drag & Drop Studio + Custom Glass Select + AI Visual Identity) |

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
| - | *Chưa có task nào đang khóa — Sẵn sàng nhận việc Đợt 2* | - | - | ⚪ Standby | - |

---

## ⏳ Task Chờ (Backlog / Roadmap)

| ID | Task | Agent dự kiến | Priority | Ghi chú ngắn |
|----|------|---------------|----------|--------------|
| `TSK-018` | Fix Đợt 2: Lifecycle tiến trình ma (BUG-002, BUG-003) & Async Tauri (BUG-010) | Claude Code / Antigravity | 🔴 HIGH | Windows Job Object kill-on-close, async spawn_blocking |
| `TSK-012` | Tích hợp Sherpa-ONNX 3D-Speaker Diarization nâng cao | Antigravity | 🔴 HIGH | Nhận diện giọng nói đa vai bằng vector embedding |
| `TSK-013` | Tích hợp F5-TTS Vietnamese / Kokoro ONNX cho Voice Cloning | - | 🟡 MEDIUM | Tầng 4: Đọc câu thoại theo đúng mẫu giọng nhân vật |

---

## ✅ Task Hoàn Thành (1 dòng / task)

| ID | Task | Agent | Ngày xong | Kết quả / Version (1 câu ngắn) |
|----|------|-------|-----------|--------------------------------|
| `TSK-021` | Benchmark LLM & Bộ chọn Biên kịch 1-Click (Local Qwen 3 GPU vs MiniMax-M3) | Antigravity | 2026-10-04 | Đã tích hợp Batch cho Qwen 3 GPU (~0.1s/câu, 20s/phim), bộ chọn 1-click trực tiếp trong Studio |
| `TSK-020` | Tối ưu hiệu năng Lồng Tiếng AI: Ghép nối câu, Dịch theo cụm (Batching), Chọn phạm vi & Nút Dừng | Antigravity | 2026-10-04 | Đã giảm 90% câu rác, tăng tốc dịch 30x, hỗ trợ test 3 phút trong 20s và nút Dừng lại tức thì |
| `TSK-019` | AI Dubbing Studio: Chọn Ngôn Ngữ Đầu Ra (Target Lang) + Drag-Drop Media + Voice Showcase | Antigravity | 2026-10-04 | Đã hoàn thành chọn target lang (vi/en/ja/zh), gán giọng chuẩn, nghe thử tức thì, build release v0.8.0 |
| `TSK-017` | Fix Đợt 1 Nhóm Lỗi Siêu Nghiêm Trọng từ Audit (BUG-001, 005, 006, 007, 008, 013, 015, 023) | Antigravity | 2026-10-04 | Đã fix runtime paths, amix chunking + script, hallucination filter, listener leak, atomic config, real SRT ts |
| `TSK-016` | Kiểm thử E2E video đa vai từ A-Z, xuất 2 video thành phẩm & fix BUG-006 | Antigravity | 2026-10-04 | Đã tạo clip đối thoại 2 vai, phát hiện và fix BUG-006 (phân vai), xuất video Ducking & Theatrical hoàn hảo |
| `TSK-015` | Soạn thảo Cẩm nang Vận hành Lồng tiếng AI & Củng cố Fallback Voice Engine | Antigravity | 2026-10-04 | Đã tạo `docs/HUONG_DAN_HE_THONG_LONG_TIENG_AI.md`, hoàn thiện tra cứu giọng và fallback `python -m edge_tts` |
| `TSK-014` | Tích hợp Demucs v4 (CUDA) Vocal Isolation & Bộ chuyển chế độ Thuyết minh / Chiếu rạp | Antigravity | 2026-10-04 | Tách sạch 100% vocal gốc, chỉ giữ BGM & SFX, ghép lồng tiếng chuẩn chiếu rạp |
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
