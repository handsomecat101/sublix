# Decision Log — Sublix

> Log các quyết định kỹ thuật + open questions cần anh Tuấn quyết.

---

## ✅ Decided

### D1. Project name = "Sublix"
- **Date**: 2026-08-16
- **Decision**: Sublix (subtitle + helix/flow)
- **Rationale**: Modern, 6 chars, easy to type, suggests real-time flow
- **Folder**: `H:/AI Project/sublix/`

### D2. App framework = Tauri v2
- **Date**: 2026-08-16
- **Decision**: Tauri v2 + Rust (không phải Electron, Flutter, native Win32)
- **Rationale**:
  - Binary ~10MB (vs Electron 150MB)
  - Rust performance + safety
  - WASAPI integration tốt qua crates
  - Modern web UI flexibility
- **Alternatives rejected**: Electron (heavy), Flutter (no easy audio API), native Win32 (high dev cost)

### D3. Architecture = Desktop app với WASAPI loopback (universal)
- **Date**: 2026-08-16
- **Decision**: 1 desktop app capture system audio → process → overlay
- **Rationale**:
  - Cover CẢ local video + browser video trong 1 app
  - Không cần integration từng video player
  - Pattern đã validate bởi Voicebox, Handy, Voxis
- **Alternatives rejected**: Browser extension only (không cover local files), VLC plugin (chỉ 1 player)

### D4. Hybrid STT strategy
- **Date**: 2026-08-16
- **Decision**: Whisper local default, Deepgram cloud opt-in
- **Rationale**:
  - Local: free, private, default UX
  - Cloud: faster, paid, opt-in per session
  - User control: setting "use cloud when local slow" hoặc "always local"

### D5. GPU = NVIDIA (CUDA)
- **Date**: 2026-08-16
- **Implications**:
  - Whisper **large-v3** local chạy real-time thoải mái (2.8-3x realtime trên RTX 4090, ~3-5x trên RTX 3060+)
  - `whisper.cpp` built with `WHISPER_CUDA=ON`
  - Default model: **large-v3** với Q5_1 quantization (giảm VRAM 50%, accuracy vẫn tốt)
  - Cloud fallback chỉ trigger khi local fail hoặc user explicitly enable
- **Min GPU spec assumed**: NVIDIA GTX 1060+ (6GB VRAM) hoặc tốt hơn
  - RTX 3060 (8GB) trở lên là sweet spot

### D6. Frontend = React + TypeScript + Tailwind
- **Date**: 2026-08-16
- **Decision**: React 18 + TypeScript + Tailwind CSS
- **Rationale**:
  - Ecosystem lớn nhất, dễ tìm help
  - Bundle ~200KB (OK với Tauri ~10MB)
  - Quen thuộc với multi-agent workflow
- **Alternatives rejected**: Svelte (nhỏ hơn nhưng ecosystem nhỏ), Solid.js (performance tốt nhưng ecosystem rất nhỏ)
- **Template**: `npm create tauri-app` với template `react-ts`

### D7. Cloud API strategy = Hybrid, opt-in
- **Date**: 2026-08-16
- **Decision**: Local-first, cloud opt-in per setting
- **Configuration**:
  - Default: local Whisper only
  - Setting "Cloud STT": Off / On-demand (khi local chậm) / Always
  - Setting "Translation API": Local (no API) / OpenAI GPT-4o-mini
- **API keys**: User tự nhập trong Settings, lưu trong Tauri secure store
- **Cost estimate**: 10h/tuần cloud STT ≈ $5/tháng; GPT-4o-mini ≈ $1-2/tháng

---

## ⏳ Open questions (chưa cần thiết cho M0)

### Q2. Distribution scope
- **Tại sao quan trọng sau**: Quyết license, install method, polish level
- **Options**:
  - **Personal only** — đơn giản, ít polish
  - **Family sharing** — cần installer, onboarding
  - **Public release** — cần landing page, license, auto-update
- **Quyết trước**: M5 (Polish)

### Q5. Branding/visual style
- **Tại sao quan trọng sau**: First impression, retention
- **Direction**:
  - **Minimal dark** (giống Language Reactor, Google Photos)
  - **Bold colorful** (giống TikTok captions)
  - **Custom theme-able** (user chọn)
- **Default đề xuất**: Minimal dark + 1-2 theme alternative
- **Quyết trước**: M4 (Overlay UI)

---

## 📋 Decision queue (updated 2026-08-16)

✅ All M0 blockers resolved:
- ✅ D5 GPU → large-v3 model
- ✅ D6 Frontend → React + TS
- ✅ D7 Cloud strategy → hybrid opt-in

Remaining (không block M0):
- ⏳ Q2 Distribution — defer to M5
- ⏳ Q5 Branding — defer to M4

**→ Ready to scaffold M0.**

---

*Last updated: 2026-08-16 23:05*
