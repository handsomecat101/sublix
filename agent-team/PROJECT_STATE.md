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
| **Bản Build Hiện Tại** | `v0.10.0` (dev mode — chạy qua `Chay-Sublix.bat`; release binary cũ: v0.9.8) |
| **Git Commit** | `v0.9.6` on `master` (`https://github.com/handsomecat101/sublix.git`) |
| **Trạng Thái** | 🟢 Active (Phase V2 Phân vai AI Offline sherpa-onnx + Speaker Roster UI v0.10.0 hoàn thành trọn gói E2E; Downloader đầy đủ từ v0.9.6) |

---

## 👥 Thành Viên & Ca Trực (Multi-IDE Agents)

| Agent / IDE | Vai trò chính | Status | Ghi chú |
|-------------|---------------|--------|---------|
| **Antigravity** | Kiến trúc hệ thống, Full-stack Rust + React, AI Model Integration | 🟡 Active | Đã hoàn thành trọn gói Phase V2 (S1-S4) bàn giao cho Mavis & CommandCode |
| **Claude Code** | Logic Audio, Pipeline Scripting, Bug Fixes | ⚪ Available | Có thể chuyển giao bất cứ lúc nào |
| **Cursor / Codex** | UI/UX Component, CSS styling, Performance profiling | ⚪ Available | Sẵn sàng nhận việc UI |
| **CommandCode** | Code Reviewer, Audit 25+ bugs, Debug systematic | 🟡 Active | Nhận bàn giao V2, review code & nghiệm thu |
| **Mavis (MiniMax-M3)** | **Thợ code (Worker)** — nhận chỉ đạo từ Antigravity/CommandCode, làm đúng việc được giao (`@assign`). Tên hiển thị trong team chat: "MiniMax M3" / "Mavis". | 🔧 Debugger | Nhận bàn giao V2, test GUI độc lập theo checklist |
| **Anh Tuấn (`jimmyvu`)** | Product Owner, Reviewer, Kiến trúc sư trưởng | 👤 Available | Duyệt merge & roadmap |

---

## 🟡 Task Đang Làm (In Progress - Lock)

| ID | Task | Agent | Priority | Status | Files đang sửa |
|----|------|-------|----------|--------|----------------|
| `TSK-FIX-BUG044-058` | ~~Vá 15 lỗi Tab Tải Video~~ | **Mavis (MiniMax-M3)** | 🔴 DONE | ✅ All 15 done (3 commits: bd6a9d6/6739ea7/a142999), Job Object deferred | `agent-team/BUG-FIX-REPORT-BUG044-058.md` |
| `TSK-FIX-R2-001-009` | ~~Vòng 2 nốt 9 lỗi R2-01..R2-09 (sau audit)~~ | **Mavis + alex** | 🔴 DONE | ✅ R2-01..R2-09 đã fix xong (commit `d2d3f7c` R2-08+`1e2bd3d` R2-02..R2-07+R2-09), build xanh | `agent-team/BUG-FIX-REPORT-VONG2.md` |
| `TSK-AUDIT-VOICE-2026-10-06` | **Audit 17 mục tạo giọng** theo `AUDIT_TAO_GIONG.md` (BƯỚC 1: điền bảng) + **viết code cho thật** | **CommandCode** (chuyển giao 2026-10-06 15:38) | 🔴 HIGH | **PO chuyển giao cho CommandCode lúc 15:38.** Mavis đã điền bảng code-level (17/17 mục, evidence `path:line`); CommandCode tiếp tục: GUI test thật 12 mục cần UI + viết code cho 3 mục "trên giấy" (#11-13 F5-TTS/Viterbox/Kokoro) + sửa lời quảng cáo #14-15. Bằng chứng vào `test-output-audit-giong/`. | `agent-team/AUDIT_TAO_GIONG.md` (bảng đã điền) |
| `TSK-AUDIT-SUB-2026-10-06` | ~~Audit pipeline tạo phụ đề (file_sub.rs + stt/ + translate/) — đo thời gian thực tế + tìm bottleneck~~ | **Mavis + sub-agent (worker)** | 🔴 DONE | ✅ Worker đo 3 stage end-to-end trên video 21:43. Tổng ~64 phút (large model CPU) / ~41 phút (tiny model). 5 findings (2 🔴 blocker + 3 🟡 UX). Bằng chứng file thật 10 file trong `test-output-audit-sub/`. | `agent-team/AUDIT_SUB_REPORT.md` (22KB, 12 sections) |
| `TSK-VOICE-CATALOG-2026-10-07` | ~~Voice Catalog theo Model + mẫu nghe thử trước khi chọn + khớp voice đa vai~~ | **CommandCode** | 🔴 HIGH | ✅ DONE (v0.9.9) — model bấm ▸ hiện 7 nam/7 nữ (cả TRƯỚC khi tải); 🎧 tạo mẫu 14/14 cache → nghe tức thì (verified audio thật); multi-role 5 vai→5 giọng khác nhau + chip ⚠️ Trùng giọng. Bằng chứng `test-output-audit-giong/v099_*.png`. Dev-test cần `--no-watch` (BUG-H08) | `dubbing/mod.rs`, `lib.rs`, `DubbingStudioView.tsx/css`, `tauri.ts` |
| `TSK-V2-E2E-HANDOFF` | **Phase V2 Bàn giao & Nghiệm thu**: S1-S4 hoàn thành trọn vẹn, sẵn sàng bàn giao Mavis GUI test & CommandCode audit | **Mavis + CommandCode** | 🔴 HIGH | 🟢 Antigravity đã xong code + test + deliverables; đang chờ Mavis test GUI và CommandCode review | `agent-team/REPORT_PHASE_V2_COMPLETION.md` |

---

## ⏳ Task Chờ (Backlog / Roadmap)

| ID | Task | Agent dự kiến | Priority | Ghi chú ngắn |
|----|------|---------------|----------|--------------|
| `TSK-022.2` | Phase 2: Workflow Automation & Chế bản Auto Sub/Dub (n8n / Node graph / Batch automation) | Antigravity / Claude Code | 🔴 HIGH | Tự động hóa chuỗi: Download -> STT -> Translate -> Voice Over -> Xuất video một chạm |
| `TSK-018` | Fix Đợt 2: Lifecycle tiến trình ma (BUG-002, BUG-003) & Async Tauri (BUG-010) | Claude Code / Antigravity | 🔴 HIGH | Windows Job Object kill-on-close, async spawn_blocking |
| `TSK-012` | ~~Phase V2: Phân vai thật (sherpa-onnx diarization offline)~~ | **Antigravity** | 🔴 DONE | ✅ Đã hoàn thành ở v0.10.0 (S1 sidecar + S2 Rust backend + S3 UI roster + S4 E2E deliverables) |
| `TSK-013` | Tích hợp F5-TTS Vietnamese / Kokoro ONNX cho Voice Cloning (Phase V3) | - | 🟡 MEDIUM | Tầng 4: Đọc câu thoại theo đúng mẫu giọng nhân vật (Kokoro phần đọc sẵn đã xong ở v0.9.8/v0.9.9 — phần clone giọng chuẩn bị ở Phase V3) |

---

## ✅ Task Hoàn Thành (1 dòng / task)

| ID | Task | Agent | Ngày xong | Kết quả / Version (1 câu ngắn) |
|----|------|-------|-----------|--------------------------------|
| `TSK-V2-S4-VERIFY` | Step S4: E2E Verification video đa vai + trích xuất deliverables v2_* & bump v0.10.0 | **Antigravity** | 2026-10-07 | ✅ E2E multi_speaker_scene.mp4 -> v2_multi_speaker_DUBBED.mp4 (375KB, 26s), 2 clips sample audio, test_v2_diarization_e2e pass |
| `TSK-V2-S3-UI` | Step S3: UI Bảng vai diễn: nghe giọng gốc (Base64 data URI), gộp vai, badge AI Sherpa/Heuristic | **Antigravity** | 2026-10-07 | ✅ UI DubbingStudioView đầy đủ nút Nghe giọng gốc, dropdown gộp vai, badge phân vai, đếm câu thoại, npm run build xanh 2.45s |
| `TSK-V2-S2-INTEGRATE` | Step S2: Tích hợp sherpa diarization vào backend analyze_and_create_project + clip audio mẫu | **Antigravity** | 2026-10-07 | ✅ Map segments theo time overlap, trích 2-8s sample audio Data URI per speaker, fallback heuristic an toàn, unit test pass 6.07s |
| `TSK-HOTFIX-32KB` | Hotfix Phim Dài: Fix Windows 32KB CMD limit khi export phim dài (445 segments) bằng chunked amix track | **Antigravity** | 2026-10-07 | ✅ `render_combined_speech_track` hierarchical chunks $\le 28$ inputs, unit test 100 segments pass 0.87s, CMD <300 chars |
| `TSK-V2-S1-DIARIZE` | Step S1: Diarization Sidecar (`sherpa-onnx` pyannote + wespeaker) + CLI test ground truth | **Antigravity** | 2026-10-07 | ✅ `sherpa_diarize.py` tách chuẩn 2 vai `[0, 1, 0, 1, 0]` trên `dialogue_2spk.wav` (100% ground truth), 1 vai trên 1-speaker |
| `TSK-FEAT-KOKORO-OFFLINE` | Feat: dời Model Giọng Nói vào tab "Studio Lồng Tiếng AI" (panel gọn "🎛 Chọn Giọng & Tải Model") + engine **Kokoro-Vietnamese OFFLINE** (sidecar onnxruntime+vig2p, retry-rồi-skip câu lỗi, 14 VoicePreset `kokoro:*`) | **CommandCode** | 2026-10-06 | E2E Kokoro offline → `test_dubbing_input/kokoro_DUBBED_TEST.mp4` (378.671B, 26s); 2 sample mp3; GUI agent-browser xác nhận panel + tab Models đã sạch mục cũ |
| `TSK-FIX-V095-QUALITY` | Fix v0.9.5: chất lượng tải kẹt 360p (bỏ ép player_client android — SABR) | **CommandCode** | 2026-10-06 | PO tự verify: DeepSeek V4.1 → 1920×1080 (309.7MB); CLI 720p → 1280×720 |
| `TSK-FEAT-V096-DETAILS` | Feat v0.9.6: hiển thị chất lượng/dung lượng/đường dẫn + "đã tải/tổng" + link gốc & Copy link + fix 403 (curl_cffi) | **CommandCode** | 2026-10-06 | GUI verify đủ chips+link+copy; backfill mục cũ OK; BBB retry 1280×720; exe v0.9.6 |
| `TSK-FEAT-V094-PLAY-FOLDER` | Feat v0.9.4: nút "▶ Chạy Video" + hiển thị đường dẫn thư mục tải + fix nút "Mở Thư Mục" (SHOpenFolderAndSelectItems) + mặc định tắt sub | **CommandCode** | 2026-10-06 | GUI E2E: VLC mở đúng file + Explorer mở đúng thư mục; exe v0.9.4. Theo yêu cầu trực tiếp của PO |
| `TSK-FIX-V093-FALSEERR` | Fix v0.9.3: lỗi báo oan "không in ra đường dẫn file" (path yt-dlp in ra mất ký tự codepage) | **CommandCode** | 2026-10-06 | Ép UTF-8 output + recovery quét ổ đĩa theo mã video (bằng chứng gốc) + UI xoá cảnh báo cũ khi Thử lại; GUI retry E2E xanh (Hoàn Thành 3→4); exe v0.9.3. Commits `e48712c`+`8162033` |
| `TSK-FIX-V092-EOF-429` | Fix v0.9.2: EOF "Kiểm Tra Link" + HTTP 429 phụ đề (2 bug từ handoff Mavis) | **CommandCode** | 2026-10-06 | Root cause EOF = thiếu pipe stdio từ R2-08.3; fix pipe + parse JSON an toàn + báo lỗi thân thiện; `--sleep-subtitles 5` + giữ ✅ video khi sub 429. Build v0.9.2 xanh, 8/8 test. Commits `54f5ae2`+`6d7bc1b` |
| `TSK-022.1` | Phase 1: Xây dựng Tab Tải Video Đa Nền Tảng (YouTube, TikTok, Douyin, Bilibili) & Cầu nối 1-Click | Antigravity | 2026-10-04 | Kế thừa trọn vẹn hermes-downloader: đa nền tảng, cookies Edge/Chrome/Firefox, sub extract, pause/resume/cancel, 1-click bridge sang File Sub & Studio Dubbing |
| `TSK-023` | Fix Triệt Để 8 Lỗi Nền Móng Phase 0 (BUG-026, 027, 028, 029, 030, 031, 032, 041) | Antigravity | 2026-10-04 | Cây amix ≤28 inputs, normalize=0, generation hủy AtomicU64 + diệt PID tree, không nuốt lỗi dịch, chống rò rỉ listener + race drop file, pass unit test & build release |
| `TSK-FIX-BUG044-058` | Vá 15 lỗi Tab Tải Video (044–058) — shell injection, tab leak, NaN%, disk check, Job Object, etc. | **Mavis (MiniMax-M3)** | 2026-10-04 | Đã fix đủ 15 bugs trong 3 commits (Nhóm 1+2+3); chỉ defer Job Object KILL_ON_JOB_CLOSE — chi tiết tại `BUG-FIX-REPORT-BUG044-058.md` |
| `TSK-FIX-R2-001-009` | Vòng 2 nốt 9 lỗi R2-01..R2-09 (sau CommandCode audit) | **Mavis + alex** | 2026-10-05 | R2-08 (Job Object KILL_ON_JOB_CLOSE + 4 fix nhỏ) do alex làm (d2d3f7c); R2-02..R2-07 + R2-09 do Mavis làm (1e2bd3d); R2-01 gộp vào d2d3f7c do ordering. cargo check + npm run build xanh. Chi tiết: `BUG-FIX-REPORT-VONG2.md` |
| `TSK-RES-001` | Competitive analysis Sublix vs 4 repo voice/dubbing trên GitHub (VoiceStudio 53k⭐, dub-studio, YouDub-webui, ZastTranslate) | **Mavis** | 2026-10-05 | So sánh feature matrix theo 6 nhóm (Voice/TTS, STT/Diarization, Translation, Studio UI, Pipeline, Desktop/Distribution) + phân tích kiến trúc Tauri vs Electron. Roadmap gaps P0-P3. Tài liệu: `COMPETITIVE_ANALYSIS.md` (15KB) |
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
