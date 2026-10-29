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
| **Bản Build Hiện Tại** | `v0.15.0` (dev mode — chạy qua `Chay-Sublix.bat`) — **đã push 2026-10-30** gồm v0.14 (kiểu phụ đề, che hardsub) + v0.15 (tab Khám phá) + tab **Xưởng AI (Thử nghiệm, ⏸️ tạm dừng — xem `docs/XUONG_AI_PLAN.md` đầu file)** |
| **Git Commit** | nhánh `master` (`origin` = `https://github.com/handsomecat101/sublix.git`) — đã push đủ; nhánh `wip/lab-c5` (C5 dở dang, chỉ local) |
| **Máy khác (PC nhà, RTX 3090)** | Sau `git pull`: `npm install` + build lại Rust; model/cấu hình KHÔNG nằm trong git (đặt lại trong Cài đặt); nhánh CUDA chưa kiểm ở máy dev (máy dev không có NVIDIA) ⇒ lỗi gì ghi `ISSUE_LOG.md` |
| **Workspace Máy Dev** | `C:\AI Project\Sublix` (máy: Win11 11 Home build 26200, AMD Ryzen AI Max 390, 31 GB RAM, **không có GPU NVIDIA**) |
| **Trạng Thái** | 🟢 Sẵn sàng làm việc — `cargo build` OK, `cargo test --lib` **60/60 PASS**, `npx tsc --noEmit` 0 lỗi, `npm run build` OK, guard `npm run verify:version` PASS exit 0 (6/6 nguồn = `0.11.36`); app chạy dev + verify GUI qua CDP (port 9223) |
| **Provider Dịch Đang Dùng** | `ollama` (`qwen2.5:3b`, chạy **iGPU qua ROCm**) — vì `llama-server.exe` bị Smart App Control chặn, xem `BUG-H09` |
| **Preset Phần Cứng** | **4 preset**: Thuần CPU · GPU Tầm Trung (4-8GB) · GPU Khủng (12-24GB) · **GPU Tích Hợp AMD (Radeon / Ryzen AI)** — preset AMD dùng Ollama + iGPU |
| **Pipeline A→Z** | ✅ **Verify đầy đủ** trên máy này: Video → Whisper STT (CPU) → sherpa phân vai → Ollama dịch (**iGPU**) → Kokoro TTS → ffmpeg xuất (2 track audio + subtitle). File: `%APPDATA%\com.sublix.desktop\downloads\A2Z_TEST_EN_dubbed.mp4` |

---

## 2. ✅ ĐÃ ĐẠT / ❌ CHƯA ĐẠT (Phiên 2026-10-24)

| Hạng mục | Trạng thái | Bằng chứng | Ai xác nhận |
|----------|-----------|-----------|------------|
| **Preset AMD iGPU (v0.11.36)** | ✅ ĐẠT | 4 card preset hiện trong UI (sidebar + grid); bấm → config `translation_provider=ollama`, `ollama_model=qwen2.5:3b`, `stt_model=base`, `stt_engine=cpu`; dịch thử trong app → *"Kiểm tra dịch thoại thành công!"* | Mavis (verify GUI qua CDP + screenshot) |
| **iGPU được tận dụng thật** | ✅ ĐẠT | Ollama log: `library=ROCm compute=gfx1151 "AMD Radeon(TM) 8050S" 12.2 GiB`, `offloaded 37/37 layers to GPU`; benchmark `qwen2.5:3b` **GPU 32,83 tok/s vs CPU 15,53 tok/s (×2,11)** | Mavis (đo bằng `ollama ps` + benchmark `num_gpu`) |
| **Ollama timeout + Qwen3 thinking (BUG-H10)** | ✅ ĐẠT | Timeout 25s→120s, batch 60s→300s, thêm `"think": false`; `qwen3:4b` sinh 548-2123 token suy luận (52-112s) → `qwen2.5:3b` **6,0s** | Mavis (đọc `slot print_timing` trong log Ollama) |
| Guard version `npm run verify:version` | ✅ ĐẠT | PASS exit 0, 6/6 nguồn = `0.11.36` | Mavis |
| TypeScript `npx tsc --noEmit` | ✅ ĐẠT | exit 0, 0 lỗi | Mavis |
| BUG-074 — Xuất video có tiếng Việt (map `vietneu:` → `kokoro:` ở backend) | ✅ ĐẠT | File `StarCraft…_dubbed.mp4` có track `aac` thứ 2; đối chiếu giọng: correlation với giọng Kokoro = **0,6921** (track AI) vs **0,0346** (track gốc) | Mavis (đo bằng ffprobe + script tương quan) |
| BUG-075 — TTS batch mode (nạp model 1 lần) | ✅ ĐẠT | Batch 5 câu **16,1s** (legacy 62s); xuất 78 câu ~**2 phút**; per-line 12,4s → ~1,2s | Mavis (đo trực tiếp trên app live) |
| Video Trung Quốc 26 phút (323 câu) trong app | ❌ CHƯA ĐẠT | Project bị thay thế trong app lúc anh tự chạy A→Z trên StarCraft; cần nạp lại video + chạy lại STT/dịch | Chờ anh Tuấn quyết định có chạy lại không |

---

## 👥 Thành Viên & Ca Trực (Multi-IDE Agents)

| Agent / IDE | Vai trò chính | Status | Ghi chú |
|-------------|---------------|--------|---------|
| **Antigravity** | Kiến trúc hệ thống, Full-stack Rust + React, AI Model Integration | 🟢 Active | Đã xử lý dứt điểm BUG-063 & xuất video đa đường tiếng theo yêu cầu PO |
| **Claude Code** | Logic Audio, Pipeline Scripting, Bug Fixes | 🟢 Ready | Sẵn sàng nhận việc / thử tài theo phân công của anh Tuấn |
| **CommandCode** | Code Reviewer, Audit 25+ bugs, Debug systematic | 🟢 Ready | Sẵn sàng review code, giám sát & điều phối kỹ thuật |
| **Mavis (MiniMax-M3)** | **Thợ code (Worker)** — nhận chỉ đạo làm đúng việc được giao (`@assign`). | 🟢 Ready | Sẵn sàng test GUI, viết test, debug chi tiết |
| **Cursor / Codex** | UI/UX Component, CSS styling, Performance profiling | 🟢 Ready | Sẵn sàng nhận task UI / UX / Animation |
| **Anh Tuấn (`jimmyvu`)** | Product Owner, Reviewer, Kiến trúc sư trưởng | 👤 Active | Trực tiếp điều phối và thử tài các agent |

---

## 🟡 Task Đang Làm (In Progress - Lock)

*(Hiện không có task nào đang khóa)*


---

## ⏳ Task Chờ (Backlog / Roadmap)

| ID | Task | Agent dự kiến | Priority | Ghi chú ngắn |
|----|------|---------------|----------|--------------|
| `TSK-V015-DISC-B` | v0.15 nấc B — danh mục, tự dịch từ khoá Việt→Trung, YouTube hot (API key tuỳ chọn) | mcode / agy | 🟡 MEDIUM | sau nấc A |
| `TSK-V015-BROWSER-SPIKE` | v0.15 nấc C — thử trình duyệt nhúng (TikTok/Douyin) + nút "Tải video đang xem"; trang ngoài KHÔNG có quyền gọi lệnh Tauri | agy / Sonnet | 🟢 LOW | độc lập, thử kỹ thuật 1 ngày |
| `TSK-BATCH` | Batch: chạy lồng tiếng cả danh sách video 1 lần (gộp `TSK-022.2`) | — | 🟡 MEDIUM | sau v0.15 |
| `TSK-RECAP-CONTENT-TEAM` | **PO chốt 2026-10-30:** chốt quy trình recap bằng 1 team nội dung (người + agent đóng vai: nắm cốt truyện · xem gameplay · viết lời bình · dựng) làm thử video thật TRƯỚC; ổn mới làm phần mềm | PO + điều phối | 🟡 MEDIUM | `docs/RECAP_WORKFLOW.md`; C5 dở ở nhánh `wip/lab-c5` |
| `TSK-AI-RECAP-1` | Dựng AI nấc 1: reel highlight từ gameplay dài (chia cảnh + lọc cutscene + 9:16 + chữ nhảy) | — | 🟡 MEDIUM | `docs/GAME_RECAP_RESEARCH.md` — cần kế hoạch chi tiết |
| `TSK-AI-RECAP-2` | Dựng AI nấc 2: recap cốt truyện game có lời bình (tóm tắt phân cấp → kịch bản → TTS → ghép cảnh theo lời) | — | 🟡 MEDIUM | sau nấc 1 |
| `TSK-022.2` | Phase 2: Workflow Automation & Chế bản Auto Sub/Dub (n8n / Node graph / Batch automation) | Antigravity / Claude Code | 🔴 HIGH | Tự động hóa chuỗi: Download -> STT -> Translate -> Voice Over -> Xuất video một chạm |
| `TSK-012` | ~~Phase V2: Phân vai thật (sherpa-onnx diarization offline)~~ | **Antigravity** | 🔴 DONE | ✅ Đã hoàn thành ở v0.10.0 (S1 sidecar + S2 Rust backend + S3 UI roster + S4 E2E deliverables) |
| `TSK-013` | Tích hợp F5-TTS Vietnamese / Kokoro ONNX cho Voice Cloning (Phase V3) | - | 🟡 MEDIUM | Tầng 4: Đọc câu thoại theo đúng mẫu giọng nhân vật (Kokoro phần đọc sẵn đã xong ở v0.9.8/v0.9.9 — phần clone giọng chuẩn bị ở Phase V3) |

---

## ✅ Task Hoàn Thành (1 dòng / task)

| ID | Task | Agent | Ngày xong | Kết quả / Version (1 câu ngắn) |
|----|------|-------|-----------|--------------------------------|
| `TSK-LAB-R3` | Nghiên cứu quy trình recap cốt truyện game nhiều vai AI | Opus | 2026-10-30 | ✅ `docs/RECAP_WORKFLOW.md` — 6 bước, 2 điểm duyệt, chi phí 10 giờ, 11 việc R3-x |
| `TSK-LAB-C4` | Viết lời bình + dựng nháp (TTS thật → khớp cảnh → dự án Studio) | mcode + OpenCode | 2026-10-29 | ✅ `166e6d5` — dựng thật 36 s → video 11,6 s |
| `TSK-LAB-U1D` | Mở trong Studio nạp SẴN lời bình + sửa 3 lỗi nhỏ của U1C | Antigravity | 2026-10-29 | ✅ mapDubbingProjectToPersistedTab nạp sẵn segments/speakers vào Studio; buffer sự kiện lab; bắt lỗi runId/draftPath; 25/25 test lab PASS; 84/84 studio-tabs PASS; tsc/vite build OK |
| TSK-LAB-U1C | Nối bước B (Lời bình) + C (Dựng nháp) của Xưởng AI vào lệnh THẬT | Antigravity | 2026-10-29 | ✅ Nối labWriteNarration + labBuildDraft + labRewriteSegment + labLoadDraftProject; voice thật; video preview convertFileSrc; 23/23 test PASS; tsc/vite build OK |
| `TSK-V015-UI-FIX` | Sửa tab Khám phá theo bản duyệt Opus (P1-1, §1 toast app, P1-2..4, P2, P3) | Antigravity | 2026-10-29 | ✅ Đạt toàn bộ P1 (§1 không tự chuyển màn, P1-1..4) + P2 + P3 · 46/46 test discoveryModel PASS · tsc/build OK |
| `TSK-LAB-C3` | Lệnh Tauri `lab_analyze` (phân tích thật) + tiến trình + huỷ | mcode #1 (Orca worker) | 2026-10-29 | ✅ `src-tauri/src/lab/{analyze,analyze_sources,analyze_summary,analysis_types,llm_json,llm_prompt,cache,transcript,commands}.rs` + `lib.rs` (4 lệnh) + `src/lib/tauri.ts` — 561 Rust PASS; chạy thật fixture 30 s: **6,2 s** (1 cảnh, 1 câu thoại, LLM trả 0 chương vì clip không có cốt truyện); **chưa commit** |
| `TSK-LAB-U1A` | Giao diện tab Xưởng AI theo thiết kế Opus (dữ liệu giả, chưa nối backend) | Antigravity | 2026-10-28 | ✅ 19 component src/views/lab/** · topbar Xưởng AI (Thử nghiệm) · 14/14 test labModel.test.ts PASS · tsc/build OK |
| `TSK-V015-DISC-B1` | Tự dịch từ khoá Việt/Anh → Trung khi tìm Bilibili + đơn vị lượt xem kiểu Việt | mcode #1 (Orca worker) | 2026-10-28 | ✅ `discovery/keyword_translate.rs` + lệnh `discovery_translate_keyword` (provider đã cấu hình) + đơn vị `nghìn/triệu/tỷ` thống nhất 2 nguồn — 87 Rust + 41 node; dịch thật `elden ring boss` → `艾尔登法环 Boss`; **chưa commit** |
| `TSK-V015-DISC-UI` | Tab con Khám phá: chip Douyin, Bilibili hot/xếp hạng/tìm, tìm YouTube, Tải về / Tải & mở Studio | mcode #1 | 2026-10-28 | ✅ `26ebe2d` — kiểm app thật: tải clip 21 s → tự mở tab Studio; ảnh `shots/v015-app-*.png` |
| `TSK-V015-DISC-CMD` | Nối Khám phá: gọi mạng + 5 lệnh Tauri + mã lỗi + wrapper TS | mcode #1 | 2026-10-28 | ✅ `b8cf7d9` — 437 Rust + 418 node; mạng thật OK (Bilibili hot, Douyin, tìm 原神) |
| `TSK-LAB-DESIGN` (D1) | Thiết kế tab Xưởng AI | Opus | 2026-10-28 | ✅ `4bccb28` mockup + §4.14 |
| `TSK-LAB-CORE` (C1) | Lõi thuần `lab/`: kịch bản recap + luật dựng + lọc rác + khớp cảnh | OpenCode | 2026-10-28 | ✅ `af3a7f8` |
| `TSK-LAB-RESEARCH` (R1+R2) | Bộ dựng video bằng code + Việt hoá prompt NarratoAI | Gemini | 2026-10-28 | ✅ `docs/LAB_RENDER_ENGINES.md` · `lab/prompts/*` |
| TSK-RESEARCH-RECAP-TOOLS | Nghiên cứu sâu các tool recap/review: Sublix tận dụng được gì | Antigravity | 2026-10-28 | ✅ docs/RECAP_TOOLS_DEEPDIVE.md — Mổ xẻ NarratoAI (MIT, prompt OST, công thức từ/5), VideoLingo, auto-editor (The Unlicense), TransNetV2 ONNX, 13 đề xuất |
| `TSK-V015-DISC-CORE` | Lõi thuần Rust `discovery/` (parser Bilibili/Douyin/yt-dlp + cache TTL) | OpenCode | 2026-10-28 | ✅ `321fb8e` — 37 test JSON mẫu thật; phát hiện Bilibili tìm tiếng Anh bị -412 |
| `TSK-DESIGN-V015-DISCOVERY` | Thiết kế tab Khám phá (mockup 8 khu + 8 ảnh + §4.13) | Opus | 2026-10-28 | ✅ `7bf7e5b` — tab con trong Tải video, chip Douyin, Tải & mở Studio |
| `TSK-RESEARCH-GAME-RECAP-R2` | Sửa báo cáo Game Recap: cập nhật model 2025-2026, RT-DETR Apache-2.0, Gemini 3.8 | Antigravity | 2026-10-28 | ✅ `docs/GAME_RECAP_RESEARCH.md` — Qwen2.5-VL/MiniCPM-o 2.6 local, Gemini 3.8 Flash ($0.035-$0.07/h), RT-DETR |
| `TSK-RESEARCH-VIDEO-DISCOVERY` | Nghiên cứu tìm video + hot trend (Bilibili, YouTube, Douyin, TikTok, Kuaishou, XHS) | Antigravity | 2026-10-28 | ✅ `docs/VIDEO_DISCOVERY_RESEARCH.md` — Bilibili/Douyin hot DỄ không cần key, YouTube ytsearch DỄ |

> Việc cũ hơn: `ARCHIVE/PROJECT_STATE_DONE_ARCHIVE.md` (không cần đọc khi khởi động).

> 📦 **59 mục ✅ Hoàn thành cũ hơn** đã chuyển sang
> `agent-team/ARCHIVE/PROJECT_STATE_DONE_ARCHIVE.md` — (nguồn: `PROJECT_STATE.md`, chuyển 2026-10-25, nội dung nguyên văn).

## 🔴 Blockers (Nếu có)

- **`BUG-H09` — Smart App Control chặn `llama-server.exe`** (Win11 bật SAC, binary llama.cpp chưa ký). Provider dịch GGUF **không** dùng được trên máy này → **đã có preset AMD iGPU** dùng Ollama (ROCm) + verify ✅. Muốn dùng lại GGUF thì phải tắt Smart App Control (đường **một chiều**, bật lại phải reset Windows) — **cần PO quyết định**, chưa tự ý đụng vào.
- **Chưa có NVIDIA GPU trên máy dev này** → CUDA pipeline (`binaries/cuda/`) **đã chuẩn bị sẵn** nhưng **chưa test được**; cần máy có RTX để verify nhánh CUDA.
- **Chưa chạy pipeline A→Z thật** trên máy này (mới verify từng bước riêng: STT ✅, dịch ✅, preset ✅).
