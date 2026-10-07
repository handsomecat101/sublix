# Competitive Analysis — Sublix vs Voice Studio Repos

> **Ngày lập:** 2026-10-05
> **Người lập:** Mavis (MiniMax-M3)
> **Mục đích:** Tài liệu nội bộ tham khảo khi quyết định roadmap / kiến trúc Sublix. Không phải spec cam kết — chỉ là baseline để sau này nghiên cứu tiếp.
> **Phạm vi:** 4 repo "voice studio / dubbing" đối thủ + Sublix làm baseline.

---

## 1. Bảng nhanh 5 đối tượng

| Repo | Stars | Stack | Desktop | ML Backend | Ngôn ngữ chính | License | Điểm nổi bật |
|---|---|---|---|---|---|---|---|
| **Sublix (baseline)** | n/a | Tauri 2 + React + Rust | ✅ Native `.exe` (~15MB) | Rust CLI bridge + HTTP | vi/en/ja/zh | Proprietary | Đa engine song song (Qwen 3 GPU + MiniMax-M3 Cloud), 1-click pipeline Downloader→Sub→Dubbing |
| **[debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio)** | **53,553** | **Electron** + Python | ✅ Native (~200MB+) | Python ML (OmniVoice) | **646** | AGPL-3.0 | Voice DESIGN (text → voice), MCP cho AI agents, audiobook, dictation widget, multi-engine swap |
| **[timoncool/dub-studio](https://github.com/timoncool/dub-studio)** | 144 | Tauri 2 + React + C++/CUDA | ✅ Native (single exe) | Native C++ engines (BSRoformer.cpp, ONNX Runtime, llama.cpp) | 100+ | MIT (code) | OCR on-screen text (PP-OCR), 26 subtitle presets, MCP port 8793, 5 composable modes |
| **[liuzhao1225/YouDub-webui](https://github.com/liuzhao1225/YouDub-webui)** | 5,600 | FastAPI + Next.js + Pinokio | ❌ Web app | Python ML (WhisperX, Demucs, VoxCPM2) | Multi | Apache 2.0 | Production-mature (tác giả 1M+ subs dùng mỗi ngày), stage-by-stage recovery |
| **[zast57/ZastTranslate](https://github.com/zast57/ZastTranslate)** | 49 | Python + Gradio + Pinokio | ❌ Web app | Python ML (WhisperX, Demucs, VoxCPM 2) | **33** | MIT | Viral Shorts 9:16 auto-clip, YouTube SEO Blog Studio, 8-step subtitle stabilization |

---

## 2. Feature Matrix chi tiết (Sublix vs 4 đối thủ)

Ký hiệu: ✅ có | 🔜 planned | ❌ không | ⚠️ một phần

### 2.1 Voice & TTS

| Tính năng | Sublix | VoiceStudio | dub-studio | YouDub | ZastTranslate |
|---|---|---|---|---|---|
| **Voice cloning** (từ audio tham chiếu) | 🔜 F5-TTS/Kokoro | ✅ k2-fsa/OmniVoice | ✅ Higgs Audio v3 | ✅ VoxCPM 2 | ✅ VoxCPM 2 |
| **Voice DESIGN** (text mô tả → tạo voice mới) | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Multi-speaker voice clone** (per-speaker selection) | 🔜 | ✅ auto-cast | ✅ auto-cast + face pairing | ❌ single voice | ❌ single voice |
| **Đa TTS engine swap** (F5-TTS/Qwen-TTS/Higgs/...) | ❌ | ✅ OmniVoice + Qwen + VoxCPM + IndexTTS | ⚠️ Higgs only | ❌ VoxCPM only | ❌ VoxCPM only |
| **Số ngôn ngữ TTS** | 4 | **646** | 100+ | Multi | 30 |
| **Local-only TTS** (không cần cloud) | 🔜 | ✅ | ✅ | ❌ (cloud translation) | ✅ |

### 2.2 STT & Diarization

| Tính năng | Sublix | VoiceStudio | dub-studio | YouDub | ZastTranslate |
|---|---|---|---|---|---|
| **Whisper Large-v3-Turbo** | ✅ | ✅ | ✅ Whisper-faster | ✅ default | ❌ WhisperX |
| **WhisperX** (word-level alignment) | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Parakeet-TDT** (NVIDIA, GPU ASR) | ❌ | ❌ | ✅ default | ❌ | ❌ |
| **Speaker diarization** (multi-speaker detect) | 🔜 Sherpa-ONNX | ✅ | ✅ Nemotron 3 (8 speakers) | ❌ single voice | ❌ |
| **8-step subtitle stabilization** (Netflix-grade) | ❌ | ❌ | ⚠️ 26 presets | ❌ | ✅ |

### 2.3 Translation & Vocal Isolation

| Tính năng | Sublix | VoiceStudio | dub-studio | YouDub | ZastTranslate |
|---|---|---|---|---|---|
| **Local translation** (GPU) | ✅ Qwen 3 | ✅ multi | ✅ Gemma-4 12B GGUF | ❌ OpenAI cloud only | ✅ Qwen2.5/3.5 + EuroLLM |
| **Cloud translation** | ✅ MiniMax-M3 | ❌ | ⚠️ OpenRouter opt | ✅ OpenAI | ❌ |
| **Đa engine song song** (local + cloud cùng lúc) | ✅ **UNIQUE** | ❌ | ⚠️ per-stage opt | ❌ | ❌ |
| **Demucs vocal isolation** | ✅ | ✅ | ❌ (dùng Mel-Band Roformer SOTA hơn) | ✅ | ✅ |
| **Mel-Band Roformer** (vocal separation SOTA 2025) | ❌ | ❌ | ✅ native C++ CUDA | ❌ | ❌ |

### 2.4 Dubbing Studio UI & Modes

| Tính năng | Sublix | VoiceStudio | dub-studio | YouDub | ZastTranslate |
|---|---|---|---|---|---|
| **5 composable modes** (Dub/Voice-over/Subtitles/Funny remix/Transcript) | ❌ | ❌ | ✅ | ❌ (3 modes: subs/dub/both) | ❌ |
| **Live real-time editor** (0.17s/frame preview) | ❌ | ❌ | ✅ | ❌ | ⚠️ click-to-seek only |
| **Smart re-gen** (chỉ render segment đã sửa) | ❌ | ❌ | ✅ | ❌ | ❌ |
| **OCR on-screen text** (blur + dịch chữ trên frame) | ❌ | ❌ | ✅ **UNIQUE** | ❌ | ❌ |
| **26 caption presets** (karaoke, TikTok, hormozi, neon) | ❌ | ❌ | ✅ | ⚠️ basic | ✅ karaoke word-by-word |
| **Viral Shorts 9:16 auto-clip** (AI detect viral moments) | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Audiobook / multi-voice Stories** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Dictation floating widget** (overlay lên app khác) | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Batch jobs queue** | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Multi-language bulk export** (1 click → N ngôn ngữ) | ❌ | ⚠️ | ✅ | ❌ | ✅ 33 ngôn ngữ |
| **YouTube SEO kit** (title/description/hashtag auto-gen) | ❌ | ❌ | ❌ | ❌ | ✅ |
| **WordPress Blog Studio** (anti-AI humanizer) | ❌ | ❌ | ❌ | ❌ | ✅ |

### 2.5 Pipeline & Integration

| Tính năng | Sublix | VoiceStudio | dub-studio | YouDub | ZastTranslate |
|---|---|---|---|---|---|
| **Downloader đa nền tảng** (YT/TT/Douyin/Bili/FB/X/IG/Vimeo/Reddit) | ✅ **UNIQUE** | ❌ | ❌ | ✅ (YT + Bili only) | ✅ (YT only) |
| **1-click pipeline bridges** (Downloader → Sub → Dubbing) | ✅ **UNIQUE** | ❌ | ❌ | ❌ | ❌ |
| **MCP server cho AI agents** | ❌ | ✅ | ✅ port 8793 | ❌ | ❌ |
| **Local REST API + WebSocket** | ✅ Tauri commands | ✅ | ✅ axum + MCP | ✅ FastAPI | ✅ Gradio |
| **Job Object KILL_ON_JOB_CLOSE** (Windows process tree) | ✅ v0.8.0 | ❌ | ❌ | ❌ | ❌ |
| **Stage-by-stage recovery** (fail-soft, atomic file replace) | ❌ | ⚠️ | ❌ | ✅ production-grade | ⚠️ |
| **Agent skills phân phối qua npm** (`npx skills add`) | ❌ | ✅ | ❌ | ❌ | ❌ |

### 2.6 Desktop / Distribution

| Tính năng | Sublix | VoiceStudio | dub-studio | YouDub | ZastTranslate |
|---|---|---|---|---|---|
| **Desktop stack** | ✅ Tauri 2 (Rust) | ❌ Electron (đã bỏ Tauri v0.5.3) | ✅ Tauri 2 (Rust + C++) | n/a (web) | n/a (web) |
| **Native Windows `.exe`** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Binary size** | ✅ **~15 MB** | ~200 MB | ~50 MB + 15 GB models | n/a | n/a |
| **RAM lúc idle** | ✅ **30-80 MB** | 200-500 MB | 100-200 MB | n/a | n/a |
| **License** | ✅ Proprietary | ❌ AGPL-3.0 + model restrictions | ⚠️ MIT + Higgs audio KHÔNG thương mại | ✅ Apache 2.0 | ✅ MIT |
| **NVIDIA CUDA accel** | ✅ (Qwen 3) | ✅ | ✅ (REQUIRED) | ✅ | ✅ |

---

## 4. Phân tích kiến trúc sâu

### 4.1 Tại sao VoiceStudio BỎ Tauri → Electron?

VoiceStudio v0.5.3 là bản Tauri cuối (ghi rõ trong README). Lý do (suy đoán từ codebase context):

1. **VoiceStudio 100% là ML** — OmbiVoice TTS, Whisper, audio processing đều Python-first. Bundle Python wheel NVIDIA CUDA dễ hơn Tauri + Rust tự viết FFI.
2. **Electron + Node.js** dễ giao tiếp với Python qua HTTP hoặc child_process.
3. **Tauri + Rust** lợi thế là native performance, nhưng nếu 100% logic là Python thì lợi thế đó mất.
4. **Cộng đồng Electron lớn hơn** → dễ tuyển contributor.

**Bài học cho Sublix:** Nếu Sublix cần dùng ML model mới nhất (WhisperX, Demucs, Higgs Audio v3, VoxCPM 2), **buộc phải có Python integration** — dù là Tauri shell hay Electron shell.

### 4.2 Tại sao dub-studio GIỮ Tauri + Rust + C++?

dub-studio giữ Tauri + native C++ engines:
1. **Author-control cao**: viết C++ engine cho Mel-Band Roformer (BSRoformer.cpp), audiocpp_engine.dll, llama.cpp native, ONNX Runtime → không phụ thuộc Python wheels
2. **Performance**: native C++ nhanh hơn Python 5-20x cho audio processing real-time
4. **Bundle size vẫn lớn** (~15 GB models) nhưng shell chỉ 50MB
5. **License rất nặng**: Higgs Audio v3 free cho cá nhân nhưng KHÔNG được dịch vụ thương mại

### 4.3 Sublix đang ở đâu?

Sublix dùng **"Tauri shell + Rust CLI bridge + HTTP APIs"** — approach khôn ngoan nhất:

| Phần Sublix | Stack | Ghi chú |
|---|---|---|
| Shell (window, IPC, UI) | Tauri 2 + Rust + React | ✅ Native binary nhỏ |
| Downloader (yt-dlp) | Rust subprocess `yt-dlp.exe` | ✅ CLI Python binary, không cần embed Python |
| FFmpeg mux | Rust subprocess `ffmpeg.exe` | ✅ Tương tự |
| STT (Whisper) | Rust spawn `whisper-server.exe` (native Rust binary) | ✅ Không Python |
| Translation | Rust HTTP gọi Qwen 3 local + MiniMax-M3 Cloud | ✅ Rust orchestrate, model ở ngoài |
| Demucs vocal isolation | Rust spawn Demucs CLI (Python) | ⚠️ Phụ thuộc Python CLI |
| Job orchestration | Rust async + Job Object Win32 API | ✅ Rust thắng tuyệt đối |
| Pipeline bridges | Rust IPC giữa Downloader/Sub/Dubbing | ✅ UNIQUE |

**Đây là cách LM Studio, Ollama, Open WebUI đều làm** — shell Rust, model serving bằng native binary, không embed Python runtime.

## 5. Roadmap gaps — Sublix NÊN làm (theo phân tích đối thủ)

Priority đã sắp xếp theo impact/effort:

### 🔴 P0 — Critical (Sublix đang lose user)

1. **Voice DESIGN** (text → tạo voice mới) — VoiceStudio có, Sublix không. Killer feature cho người không muốn upload audio tham chiếu.
2. **MCP server cho AI agents** — VoiceStudio + dub-studio đều có. Trở thành tiêu chuẩn 2025-2026.
3. **Multi-TTS engine swap** (F5-TTS/Qwen-TTS/Higgs/VoxCPM) — Sublix đang plan 1 engine, đối thủ đã multi-engine.

### 🟠 P1 — Important (1-3 tháng)

4. **OCR on-screen text** (PP-OCR) — dub-studio killer feature. Auto-blur chữ cũ + vẽ chữ dịch lên frame.
5. **Karaoke/TikTok-style subtitles** — 26 presets (dub-studio) hoặc karaoke word-by-word (ZastTranslate).
6. **Speaker diarization** — Sherpa-ONNX 3-speaker đã plan, nên hỗ trợ đa người nói ngay từ đầu.
7. **Multi-language bulk export** — ZastTranslate 33 ngôn ngữ 1 click.
8. **Batch jobs queue** — VoiceStudio có, dễ làm với Rust async.

### 🟡 P2 — Nice-to-have (3-6 tháng)

9. **5 composable modes** (Dub/Voice-over/Subtitles/Funny remix/Transcript) — dub-studio.
10. **Live real-time editor** (0.17s/frame preview) — dub-studio.
11. **Smart re-gen** (chỉ render segment đã sửa) — dub-studio.
12. **Viral Shorts 9:16 auto-clip** — ZastTranslate.
13. **YouTube SEO kit** — ZastTranslate.
14. **Dictation floating widget** — VoiceStudio (UX độc đáo, ít tốn model).

### ❌ P3 — Có thể BỎ (không phù hợp Sublix)

- **Audiobook / multi-voice Stories** — VoiceStudio feature, khác với core "download + dub" của Sublix.
- **Voice clone cho nhân vật cụ thể** (game/film) — quá niche cho Sublix.
- **YouTube/Bilibili upload integration** — không thuộc tầm nhìn Sublix (là tool local, không phải nền tảng).

## 6. Lessons learned — kiến trúc patterns đáng học

| Pattern | Repo học | Có thể apply Sublix? |
|---|---|---|
| **MCP server** trong app Tauri | dub-studio, VoiceStudio | ✅ Có — Tauri 2 + tokio + axum cho MCP endpoint |
| **Tauri shell + model serving tách rời** | LM Studio, Ollama | ✅ Đang làm — cần làm gọn hơn |
| **Rust async pipeline + Job Object** | Sublix (chính em) | ✅ Đã có |
| **Atomic file replace** (pending → final) | YouDub | 🔜 Nên thêm cho Demucs cross |
| **8-step subtitle stabilization** | ZastTranslate | ✅ Có thể copy logic Python → Rust port |
| **Composable modes** (toggles pipeline) | dub-studio | ✅ Rust pattern dễ |
| **Live editor + smart re-gen** | dub-studio | ⚠️ Tốn công — chỉ làm khi cần |
| **OCR on-screen text** (PP-OCR ONNX) | dub-studio | 🔜 Khi P0 #4 đến |
| **Character casting** (face + voice pairing) | dub-studio | ❌ Quá niche cho Sublix |
| **MCP for agents + npm skills phân phối** | VoiceStudio | 🔜 P0 #2 |

## 7. Quyết định kiến trúc — khi nào Sublix NÊN đổi sang Electron+Python?

| Kịch bản | Giữ Tauri+Rust? | Đổi Electron+Python? |
|---|---|---|
| Sublix chỉ làm CLI tools (yt-dlp, ffmpeg, edge-tts) | ✅ **Giữ** | ❌ |
| Sublix muốn dùng WhisperX, Demucs Python wheels mới nhất | ⚠️ Có thể giải bằng CLI bridge | ✅ **Đổi nếu** muốn native integration |
| Sublix muốn bundle 1 installer duy nhất | ⚠️ Bundle Python wheel khó trong Tauri | ✅ **Đổi** |
| Sublix cần contributor dễ tuyển | ⚠️ Rust dev hiếm | ✅ **Đ�i** |
| Sublix muốn binary < 20 MB | ✅ **Giữ** | ❌ Electron ~150 MB |
| Sublix làm trên máy yếu / Chromebook | ✅ **Giữ** | ❌ Electron ngốn RAM |

**Hiện tại Sublix ĐANG Ở TRƯỜNG HỢP ĐẦU TIÊN** → giữ Tauri+Rust là đúng.

## 8. URL + Version + Date tham khảo

| Repo | URL | Phiên bản lúc check | Stars |
|---|---|---|---|
| VoiceStudio | https://github.com/debpalash/VoiceStudio | main @ 2026-10-05 | 53,553 |
| dub-studio | https://github.com/timoncool/dub-studio | master @ 2026-10-05 | 144 |
| YouDub-webui | https://github.com/liuzhao1225/YouDub-webui | main @ 2026-10-05 | 5,600 |
| ZastTranslate | https://github.com/zast57/ZastTranslate | main @ 2026-10-05 | 49 |
| **Sublix (baseline)** | https://github.com/handsomecat101/sublix | master @ 2026-10-05 | n/a |

**Ngày nghiên cứu:** 2026-10-05 bởi Mavis (MiniMax-M3)
**Phương pháp:** web search GitHub Topics (dubbing/voice-cloning/text-to-speech/ai-dubbing) → lọc top 10 theo stars + recent commits → fetch README gốc → so sánh trực tiếp với codebase Sublix.
**Giới hạn:** Chỉ check README + landing page. Chưa deep-dive vào source code các repo. Có thể bổ sung sau khi cần nghiên cứu sâu hơn (xem §6 Lessons learned).

## 9. Cập nhật khi nào?

- Mỗi khi có repo voice/dubbing mới > 100 stars → thêm hàng vào §1
- Mỗi khi Sublix ship ra tính năng mới → cập nhật §2 (đánh ✅ thay vì 🔜/❌)
- Mỗi khi đối thủ ship ra tính năng mới notable → cập nhật §2 + §5 (re-prioritize)
- Mỗi khi kiến trúc Sublix đổi (Electron/Tauri/etc.) → cập nhật §7
- Đề xuất: lập cron 6 tháng review toàn bộ document này.