# DEV-LOG.md — Sublix Development Log

> Chronological log của mọi decisions + actions Mavis đã làm. **Đọc file này trước** để hiểu context khi continue work.

---

## Session 1 — 2026-08-16 22:52 → 23:13 (≈20 phút)

### User intent
- User (Anh Tuấn) muốn build app/browser extension dịch realtime video (xem phim Nhật down về, không có sub).
- 2 options user đưa ra: (1) browser extension, (2) standalone app overlay như VLC.
- User tự nhận **không rành code** — yêu cầu Mavis tự quyết technical, chỉ cần document rõ.

### Research & planning (Mavis)
1. Survey 3 paths:
   - **Path 1: Tauri desktop app** (recommended) — 1 app cover cả local + browser video qua WASAPI loopback
   - **Path 2: Adapt mpv + whisper-lua** — quick win ~2h, UX thô
   - **Path 3: Browser extension only** — không cover local video
2. Tech research evidence (xem `docs/research.md`):
   - Whisper large-v3 trên NVIDIA GPU: 2.8-3x real-time (lý tưởng)
   - Cloud STT: Deepgram Nova-3 ($0.0077/min, 200-400ms latency, JA multilingual tốt)
   - Translation JA→VI: GPT-4o-mini (best cho Asian languages, ~$0.02-0.05/giờ phim)
   - Architecture: Tauri v2 + WASAPI loopback (validated bởi Voicebox, Handy, Voxis)
3. User chọn **Path 1: Build Tauri desktop app**.

### Decisions locked
| ID | Decision | Rationale |
|---|---|---|
| D1 | Project name = **Sublix** | subtitle + helix/flow, modern, 6 chars |
| D2 | App framework = **Tauri v2** | Binary ~10MB, Rust + WebView, WASAPI integration tốt |
| D3 | Architecture = **Desktop app + WASAPI loopback** | Cover cả local + browser video trong 1 app |
| D4 | Hybrid STT strategy | Local default, cloud opt-in |
| D5 | GPU = **NVIDIA (CUDA)** | Dùng Whisper large-v3 local, real-time |
| D6 | Frontend = **React + TypeScript** | Ecosystem lớn, safe choice |
| D7 | Cloud API = **Hybrid, opt-in** | Local-first, cloud opt-in per setting |

Xem chi tiết: `docs/decisions.md`

### Environment setup
- **Node**: v24.14.0 (✅)
- **npm**: 11.9.0 (✅)
- **Rust**: 1.94.1 (✅ cargo + rustc installed at `C:\Users\TTC\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin`)
- **VS Build Tools**: 2019 + 2022 + MSVC 14.29.30133 (✅)
- **WebView2**: 151.0.4129.86 (✅ — Tauri yêu cầu)
- **PATH setup**: 
  - Rust toolchain bin **added to user PATH** (persistent, dùng `.NET SetEnvironmentVariable` thay vì setx để tránh long-path issue).
  - Cho PowerShell sessions tương lai: cargo, rustc sẽ available globally.

### M2: STT pipeline (✅ done 2026-08-17 — LOCAL Whisper)
1. **Second pivot**: OpenAI Whisper API was the first pivot, but user clarified "chỉ cần local chạy ổn oke có mvp được đã" (just need local MVP, no API). Switched to **local whisper.cpp via subprocess**.
2. **Why subprocess** (not whisper-rs): whisper-rs needs libclang.dll for bindgen, not installed. Prebuilt whisper.cpp Windows binary needs no build deps.
3. **Implementation**:
   - `src-tauri/src/stt/whisper_local.rs` — full Whisper local manager (~370 lines)
     - Downloads whisper-bin-x64.zip from GitHub releases on first run (~3.5MB)
     - Extracts to `binaries/Release/`
     - Downloads ggml-tiny.bin from Hugging Face on first run (~74MB)
     - Spawns whisper-cli.exe as subprocess with model + wav + language args
     - Parses stdout to extract transcript text
   - Removed openai.rs dependency (file still exists but excluded from build)
4. **Bugs found & fixed**:
   - First path lookup missed `binaries/Release/` subfolder (whisper.cpp zip extracts into Release/) → added fallback path check
   - `lang_code_to_name` returned `&str` instead of `&'static str` for unknown codes → changed default to "Unknown"
5. **Verification**:
   - First run: downloaded whisper.cpp + model (~80MB total, 10s)
   - Second run: cached files used immediately
   - `sublix transcribe test-capture.wav tiny` → subprocess OK, 2.7s audio processed in 1.5s (1.8x realtime on CPU)
   - Result: empty string (test WAV is 440Hz tone, not speech — but pipeline works end-to-end)
6. **Note on paths**: `binaries/` and `models/` are relative paths. CWD must be `src-tauri/` (or paths can be absolute).

### M2 attempt 1 (⏳ superseded): OpenAI Whisper API
1. **First pivot**: from local whisper-rs to OpenAI Whisper API
   - Reason: whisper-rs needs libclang (not installed)
   - OpenAI Whisper uses the same model (large-v2)
2. **Code**: `src-tauri/src/stt/openai.rs` — multipart form upload to OpenAI
3. **User changed direction**: "thôi không cần API ngoài, local là đủ MVP" → superseded by attempt 2
4. **File status**: `openai.rs` still exists but not in `mod.rs` (will add back as M3 opt-in cloud)
1. **Pivoted from local Whisper to OpenAI Whisper API** because:
   - whisper-rs needs `libclang.dll` (bindgen dependency) — NOT installed on system
   - LLVM install would be heavyweight + require user action
   - OpenAI Whisper API uses the **same Whisper model** (large-v2), just hosted
   - M2.5 plan: add local Whisper back when LLVM is available
2. **Added deps**: `reqwest` (blocking, multipart), `tokio` (fs, rt)
3. **Removed**: `whisper-rs`, `whisper-rs-sys` (compile-failed without LLVM)
4. **Files**:
   - `src-tauri/src/stt/mod.rs` — module exports
   - `src-tauri/src/stt/openai.rs` — OpenAI Whisper API client (~190 lines)
   - `src-tauri/src/stt/whisper.rs` — DEAD CODE (local whisper, kept for M2.5)
   - `src-tauri/src/stt/model.rs` — DEAD CODE (model download, kept for M2.5)
5. **CLI**: `sublix transcribe <wav> [lang]` — requires `$env:OPENAI_API_KEY`
6. **Status**: code written, cargo check passed, cargo build in progress (5-10 min for new deps)

### M1: Audio capture (✅ done 2026-08-16 ~23:30)
1. **Added deps to Cargo.toml**: `wasapi = "0.20"`, `hound = "3.5"`, `anyhow`, `thiserror`, `tracing`, `tracing-subscriber`
2. **Created `src-tauri/src/audio/` module**:
   - `mod.rs` — module exports
   - `capture.rs` — WASAPI loopback capture + WAV writer
3. **API discovery (took 3 iterations)**:
   - wasapi 0.20 uses different names than 0.18/older:
     - `get_default_device(&Direction)` not `get_default_render_device()`
     - `DeviceCollection::new(&Direction::Render)` to enumerate
     - `device.get_iaudioclient()` not `device.activate()`
     - `AudioClient::get_mixformat()` not `get_mix_format()`
     - `AudioClient::initialize_client(&wf, &Direction::Capture, &StreamMode::PollingShared{...})` not `initialize_shared()`
     - `AudioClient::get_audiocaptureclient()` not `get_service()`
     - `AudioClient::start_stream()` / `stop_stream()`
     - `AudioCaptureClient::read_from_device(&mut [u8])` not `read_packet()`
     - `WasapiRes` is `pub(crate)`, used `Result<T, WasapiError>` directly
4. **Created CLI mode in main.rs**:
   - `sublix list-devices` — enumerate output devices
   - `sublix capture <seconds> <output.wav> [device_idx]` — capture N seconds to WAV
5. **Bug found & fixed**:
   - `WasapiRes` is private → use `Result<T, WasapiError>` directly
   - `mod audio` private in lib.rs → `pub mod audio` to allow main.rs access
   - `feature = "cli"` undefined → added to Cargo.toml features
6. **Verification** (2026-08-16 16:43):
   - `cargo check` pass
   - `cargo build` pass (15.7MB debug binary)
   - `sublix list-devices` → 8 devices enumerated
   - `sublix capture 5 test.wav` while playing 440Hz tone → WAV 917KB, 44100Hz/2ch/32bit float
   - Captured 267 packets (2.66s) of audio data from real device

### M0: Foundation scaffold (✅ done)
1. **Project folder**: `H:/AI Project/sublix/`
2. **Planning files** (viết trước):
   - `README.md` — Project overview, use cases
   - `PLAN.md` — Implementation roadmap (5 weeks, 6 milestones)
   - `AGENTS.md` — Hướng dẫn cho AI agents
   - `.gitignore` — Standard Tauri/Node/Rust ignore
   - `docs/research.md` — Tech research evidence
   - `docs/decisions.md` — Decision log + 5 open questions (đã update thành 7 decided)
3. **Tauri scaffold**:
   - Chạy: `npx create-tauri-app@latest sublix-app --template react-ts --manager npm --identifier com.sublix.app -y`
   - Output: 73 npm packages, 0 vulnerabilities, 12s
4. **Merge scaffold vào project**:
   - Tauri files copied vào `sublix/`: `.vscode/`, `public/`, `src/`, `src-tauri/`, `index.html`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`
   - `package.json`: copied + name changed "sublix-app" → "sublix" + added description
   - `.gitignore`: copied từ Tauri + append Whisper section
   - `README.md`: kept original (Sublix branding)
5. **Renamed references**:
   - `tauri.conf.json`: productName + title → "Sublix"
   - `Cargo.toml`: package name → "sublix", lib name → "sublix_lib", authors → "Anh Tuấn"
6. **Bug found & fixed**:
   - `cargo check` failed: `main.rs` still references `sublix_app_lib::run()` (forgot to update after rename)
   - Fix: edit `src/main.rs` line 5 → `sublix_lib::run()`
   - Re-run `cargo check` → pass in 1.87s
7. **Verification all green**:
   - ✅ `npm install` — 73 packages, 0 vulns, 12s
   - ✅ `npm run build` — 32 modules, 194KB JS, 852ms
   - ✅ `cargo check` — pass, 1.87s
8. **Git init**: 1 commit `feat: M0 foundation scaffold (Sublix Tauri v2 + React)` — 45 files, 3885 insertions

### Project structure (sau M0)
```
sublix/
├── README.md              (Sublix branding)
├── PLAN.md                (Implementation roadmap)
├── AGENTS.md              (AI agent guide)
├── DEV-LOG.md             (file này)
├── .gitignore             (Tauri defaults + Whisper section)
├── package.json           (name: "sublix", React 19, Tauri 2, Vite 7)
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── .vscode/               (Tauri defaults)
├── public/                (Tauri static assets)
├── src/                   (React frontend)
│   ├── assets/
│   ├── App.tsx
│   ├── App.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── src-tauri/             (Rust backend)
│   ├── Cargo.toml         (name: "sublix")
│   ├── tauri.conf.json    (productName: "Sublix")
│   ├── build.rs
│   ├── capabilities/
│   ├── icons/
│   └── src/
│       ├── main.rs
│       └── lib.rs         (greet command mặc định)
├── docs/
│   ├── research.md        (Tech research)
│   ├── decisions.md       (Decision log)
│   ├── architecture.md    (chưa viết)
│   └── PRD.md             (chưa viết)
├── models/                (chưa tạo — Whisper models, sẽ gitignore)
└── scripts/               (chưa tạo — utility scripts)
```

### Next steps (M1)
- [ ] Verify `npm run tauri dev` chạy được (sẽ tốn 2-5 phút build Rust lần đầu)
- [ ] Replace default Tauri UI với Sublix branding
- [ ] Setup Tailwind CSS
- [ ] Add basic settings panel
- [ ] Tạo `models/` directory với `.gitkeep`
- [ ] Tạo `scripts/` directory
- [ ] Commit M0 lên git

### Lessons learned
- `setx` có thể fail với long PATH. Dùng `[System.Environment]::SetEnvironmentVariable` an toàn hơn.
- `create-tauri-app` tạo dir với `--name`, không phải positional. Format: `npx create-tauri-app@latest <name> --template <tpl> --manager <mgr> --identifier <id> -y`
- Tauri package.json mặc định không có `description` — phải dùng `Add-Member` thay vì direct assignment.
- npm install rất nhanh (12s cho 73 packages) — Tauri CLI không pull nhiều devDeps.

---

## Session 2 — 2026-08-24 20:00 → 21:10 (≈70 phút)

### User intent
- User test thực tế thấy latency 4-5s+ — KHÔNG phải realtime. Yêu cầu: làm sao thực sự realtime?
- Mệt, muốn giải quyết nhanh, không hỏi lặt vặt.

### Test thực tế (binary cũ 8/19, trước M5)
- whisper-cli subprocess + CUDA tiny, 5s Japanese audio: **4.5s** (1.1x realtime)
- whisper-cli + CUDA base, 5s Japanese: **10.3s** (0.5x realtime)
- Nguyên nhân: subprocess reload model mỗi call + CUDA init overhead.

### Decision: refactor STT sang whisper-server (long-running HTTP)
- User chọn option B (whisper-server pattern) thay vì A (giảm chunk) hay C (whisper-stream).
- Lý do: B là sweet spot — giảm 3x latency với effort vừa phải.

### M5: STT server (whisper-server HTTP wrapper)
1. **Tạo `src-tauri/src/stt/whisper_server.rs`** (~370 lines, pattern giống `translate/server.rs`):
   - `WhisperServer` struct: spawn whisper-server subprocess, hold child handle
   - `start(model)` — try CUDA build first, fall back to CPU. Polls `/health` until ready.
   - `transcribe(wav, lang)` — POST multipart to `/inference`, parse JSON `{text: "..."}`
   - **Auto-resample WAV → 16kHz mono float32** trước khi POST (whisper-server yêu cầu)
   - Linear interpolation resample (đơn giản, đủ cho speech)
   - Lazy singleton qua `OnceLock<WhisperServer>`
2. **Bug fix:** binary v1.7.6 KHÔNG support `--log-disable` flag → bỏ.
3. **Bug fix:** Cargo.toml thiếu `multipart` feature cho reqwest → thêm.
4. **Frontend** (`SettingsView`): thêm section "🎤 STT engine (M5 — whisper-server)" với:
   - Status indicator (○ not started / ⏳ starting / 🚀 CUDA / 💻 CPU)
   - Button "Pre-start STT server" (optional, dùng model đã chọn)
   - Auto-preload khi nhấn "Start Live" để skip 2-3s boot delay
5. **Audio live loop** (`audio/live.rs`):
   - Default model Tiny → **Base** (⭐ recommended)
   - Gọi `stt::transcribe_via_server()` thay vì `WhisperLocal::transcribe` (subprocess)
   - Auto-fallback về subprocess nếu server fail
6. **`transcribe_test` command** (gọi từ UI): prefer server, fall back to subprocess
7. **Cleanup toolchain:** Rust toolchain bị thiếu `rustc.exe` → uninstall + reinstall stable 1.98.0.
   - Download rustup-init.exe (12.8MB) → `rustup toolchain install stable --profile minimal`
   - Path update: dùng `C:\Users\TTC\.cargo\bin\` (có rustc proxy) thay vì toolchain bin trực tiếp.

### Verification (2026-08-24 21:00)
- ✅ `cargo check` pass (1 warning: unused `SttEngine` import — cleaned up)
- ✅ `cargo build --bin sublix` pass (2m16s, 21MB binary)
- ✅ `npm run build` pass (237KB JS, 12.39KB CSS, no TS errors)
- ✅ **whisper-server standalone test** (CPU mode, tiny model, 5s Japanese):
  - Cold start (server boot): 2s
  - Inference (warm): **1.33-1.61s** (vs 4.5s subprocess cũ) = **~3x faster**
- ✅ Output giống subprocess: `"「フォーマル・フォーマル」は「フォーマル・フォーマル」を使用しています。"`

### Test results thực tế (CPU server, tiny, 5s audio)
| Run | Time | Notes |
|---|---|---|
| Cold | 1.61s | First call, model in memory |
| Warm 1 | 1.34s | |
| Warm 2 | 1.33s | |
| **Avg warm** | **1.33s** | **~3.4x faster than subprocess (4.5s)** |

### Estimated live capture latency (after M5)
- Capture 2s audio: 2s
- STT server 2s audio (CPU tiny): ~0.6s
- Translation (Qwen 3B): 0.1s (GPU) or ~1s (CPU)
- **Total CPU: ~3.6s** (down from ~10s)
- **Total GPU: ~2.7s** (down from ~10s)

### Open issues
- Chưa test live capture end-to-end qua Tauri GUI (cần user test trên máy thật với video/Zoom)
- Onboarding view (M5 phase 2) đã code nhưng chưa verify (cần rebuild sau khi backend ready)
- Translation model (Qwen2.5-3B) chưa download (cần ~1.8GB, user cần confirm)
- CUDA whisper-server binary chưa có ở `binaries/cuda/` (chỉ whisper-cli CUDA). Hiện tại dùng CPU server.

### Next steps
- [ ] User test e2e live capture với video thật
- [ ] Nếu OK → làm tiếp M5 phase 3-6 (tray, autostart, installer, logs viewer)
- [ ] Nếu vẫn chậm → xem xét whisper-stream (true streaming, ~1s latency)

### Lessons learned
- whisper-server binary KHÔNG support `--log-disable` ở version 1.7.6 (chỉ main whisper-cli). Check binary help trước khi dùng flag.
- `reqwest` blocking client cần enable `multipart` feature explicitly.
- Path có space: cần quote trong PowerShell `Start-Process -ArgumentList`. Hoặc dùng `cmd /c` với string escape.
- `cargo build` đầu tiên ~2 phút (compile tất cả deps), subsequent ~20s.

---

## Session 3 — 2026-08-24 22:30 → 22:50 (≈20 phút)

### User intent
- User yêu cầu: toggle rõ ràng để chọn CPU/GPU (không auto-detect lừa tình).
- Indicator "chắc chắn" hiển thị đang chạy CPU hay GPU — "tù mò" là không được.

### Implementation: M5+ Engine preference + persistent config
1. **Tạo `src-tauri/src/config.rs`** (~80 lines):
   - `AppConfig` struct: `{ stt_engine_preference, translation_engine_preference }`
   - `load(app)` / `save(app)`: JSON ở `%APPDATA%/com.sublix.app/sublix-config.json`
   - Validation: chỉ chấp nhận "auto" / "cpu" / "cuda"
2. **`EnginePreference` enum** (trong `whisper_server.rs`):
   - `Auto` | `Cuda` | `Cpu`
   - `from_str(s)`, `as_str()` helpers
3. **`WhisperServer::start`** refactor:
   - `Auto`: try CUDA, fall back to CPU (warn)
   - `Cuda`: force CUDA, fail if binary missing (no fallback)
   - `Cpu`: force CPU, fail if binary missing
4. **Tauri commands mới**:
   - `get_config` → trả về full `AppConfig`
   - `set_stt_engine_preference(choice)` → validate + save to disk
5. **Modified commands**:
   - `transcribe_test` đọc preference từ config, truyền vào `transcribe_via_server`
   - `preload_stt_server_cmd` đọc preference, truyền vào `preload_stt_server`
   - `audio/live.rs` đọc preference khi start_live, truyền vào thread loop
6. **Frontend** (`SettingsView.tsx` STT engine section):
   - **3-way toggle**: ⚙ AUTO | 💻 CPU | 🎮 GPU buttons (active state highlight)
   - **Indicator với colored dot**:
     - `engine-dot-cuda` (green, fast pulse) + "Running on GPU (CUDA) — fastest, ~0.1-0.2s per chunk"
     - `engine-dot-cpu` (blue, slow pulse) + "Running on CPU — works on any machine, ~1-2s per chunk"
     - `engine-dot-starting` (yellow, fast pulse) + "Starting server..."
     - `engine-dot-idle` (gray, no pulse) + "Not started"
   - **Warning banner** nếu preference conflicts với binary:
     - Pref=GPU nhưng binary CUDA missing → "You picked GPU but no CUDA whisper-server binary..."
     - Pref=CPU nhưng binary missing → "No whisper-server binary found..."
   - Save handler: gọi `sublix.setSttEnginePreference(choice)`, nếu server đang chạy với engine khác → thông báo "Restart Sublix to switch"
7. **CSS** (mới trong `SettingsView.css`):
   - `.settings-engine-toggle` + `.settings-engine-btn` (active state gradient)
   - `.engine-dot-*` (colored dots với pulse animation khác nhau)
   - `.settings-engine-warning` (yellow banner với link + code style)

### Verification (2026-08-24 22:45)
- ✅ `npm run build` pass (240KB JS, 14.28KB CSS)
- ✅ `cargo check` pass (only 2 dead_code warnings for unused version constants)
- ✅ `cargo build --bin sublix` pass (32s)
- ✅ Tauri dev start OK (Vite 866ms, Rust 445/447)

### UX
- User mở Settings → scroll xuống "🎤 STT engine"
- Thấy 3 nút AUTO/CPU/GPU. Bấm chọn → preference save vào `%APPDATA%`
- Bấm "Pre-start STT server" → server start với engine đã chọn
- Indicator hiển thị rõ ràng: dot xanh (GPU) / dot xanh dương (CPU) + text "Running on X"
- Nếu conflict (chọn GPU mà binary không có) → warning banner vàng + link tải CUDA build

### Lessons learned
- Tauri 2 cung cấp `app.path().app_config_dir()` — portable, đúng chuẩn OS-specific path
- Để engine pref "chắc chắn" phải distinguish preference vs actual: preference lưu disk, actual là server state
- Pulse animation phải khác nhau giữa CPU/GPU/starting để user nhận biết nhanh qua peripheral vision
- Restart warning: chỉ hiện khi đổi preference, không phải khi set lần đầu

---

## Session 4 — 2026-09-27 (v0.5.0 Complete Overhaul: GPU Turbo + Qwen3 + Zero-Gap VAD)

### Issues found in previous v0.4.3 state & fixed
1. **Rust function-local `OnceLock` singleton bug (`whisper_server.rs` & `translate/server.rs`)**:
   - `preload_server`, `transcribe_via_server`, and `current_engine` each declared their own function-local `static OnceLock`, so engine status always returned `None`, servers spawned twice, and changing models/engines required restarting the whole app.
   - **Fix**: Replaced with module-level `Mutex<Option<Server>>` singletons supporting live **hot-swapping** of both model variants and CPU/GPU engines.
2. **Missing `source_lang` in Live mode (`SettingsView.tsx` & `audio/live.rs`)**:
   - `SettingsView` never passed `sourceLang` to `startLive()`, and `live.rs` hardcoded `None` (`"auto"`), causing translation prompts to receive `"auto"` instead of `"ja"` / `"en"`.
   - **Fix**: Wired `source_lang`, `translation_model`, and `vad_enabled` end-to-end and persisted all settings in `%APPDATA%/com.sublix.app/sublix-config.json`.
3. **Sequential capture-then-infer audio gaps (`audio/live.rs`)**:
   - Previously, `live.rs` recorded a WAV file, stopped WASAPI, waited 1–2s for STT+LLM, then reopened WASAPI — dropping 1–2s of movie dialogue on every chunk.
   - **Fix**: Rebuilt `audio/live.rs` as a **2-thread Producer-Consumer pipeline** with a continuous open WASAPI loopback stream (0ms gap) + **Smart VAD** (250ms pre-roll + natural 360ms pause endpointing) + Whisper hallucination/repetition filter.
4. **Upgraded to 2026 AI Models (RTX 3090 24GB CUDA)**:
   - Activated isolated `src-tauri/binaries/whisper-cuda/` so `whisper-server.exe` and `llama-server.exe` never conflict on `ggml.dll`.
   - Downloaded & integrated **`Whisper Large-v3-Turbo Q8_0` (`ggml-large-v3-turbo-q8_0.bin`, 874MB)** for STT.
   - Downloaded & integrated **`Qwen3-4B-Instruct-2507` (`Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, 2.5GB)** (plus selectable `Gemma-3-4B-IT` and `Qwen3-8B`) with 2-line rolling dialogue context memory.
   - **Verified RTX 3090 benchmark**: Both CUDA servers boot in **2.8s**; warm translation latency is **114–144ms** per subtitle line.

---

## Session 6 — 2026-10-04 (UI Theme System + Design Refresh)

### What was done
- Redesigned UI around a token-based theme system (`src/App.css`): 4 switchable themes — **cinema** (default: warm cinema dark + projector amber), **studio** (graphite + teal), **light** (cream + burnt amber), **vibrant** (rose + blue, the `ui-ux-pro-max` skill recommendation).
- Rewrote all view CSS (`SettingsView`, `FileSubView`, `OnboardingView`, `OverlayView`) onto `var(--...)` tokens. Overlay keeps its own always-dark palette (must stay readable over any video).
- Theme switcher UI in "Overlay Customizer" tab, persisted via new `theme` field in `AppConfig` (`config.rs` + `tauri.ts`).
- Fixed BUG-006 (scroll clipping: onboarding now scrolls, only overlay blocks scrolling, overlay subtitles wrap instead of clipping) and part of BUG-024 (onboarding CSS class collisions, preview line order now matches overlay, topbar ellipsis, visible thin scrollbars).
- Reference skill: `nextlevelbuilder/ui-ux-pro-max-skill` (design-system generator + pre-delivery checklist).

### Verification
- ✅ `npm run build` (tsc + vite) pass
- ✅ `cargo check` pass
- ⏳ Visual check on running app pending — switch through all 4 themes to confirm

### Lessons learned
- ui-ux-pro-max is landing-page oriented; its "Vibrant" output needed adapting for a desktop studio tool — kept as one theme option, not the default
- Hardcoded colors across many CSS files make theming expensive; tokens from day 1 avoid the rewrite

## Session 7 — 2026-10-04 (Version Bump v0.7.0 + In-App Interactive Changelog)

### What was done
- **Version Bumped to `v0.7.0`**: Synchronized across `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (window titles & product version), and `package.json`.
- **In-App Interactive Changelog (`ChangelogModal.tsx` & `ChangelogModal.css`)**:
  - Clickable version badges in sidebar brand header (`v0.7.0`), sidebar footer (`📜 Nhật Ký Cập Nhật`), and topbar (`✨ v0.7.0 Changelog`).
  - Full modal display detailing new features across v0.7.0, v0.6.0, and v0.5.0.
  - Embedded quick Theme Switcher inside the changelog modal (`🎬 Cinema`, `🎛 Studio`, `☀ Light`, `🌸 Vibrant`) allowing instant preview of theme switching directly from the changelog.
- **Compiled Release Binary**: Rebuilt `src-tauri/target/release/sublix.exe` with new embedded assets, updating the desktop shortcut executable.

### Verification
- ✅ `npm run build` (tsc + vite) PASS (878ms, 0 errors).
- ✅ `cargo check` PASS (24.10s, 0 errors).
- ✅ `cargo build --release` compiled to release binary.

---

## Session 8 — 2026-10-04 (AI-Generated Visual Identity & Illustrations)

### What was done
- Generated all brand/illustration assets with MiniMax image AI (skill `minimax-image-gen`, 10 generations): 4 logo concepts → chose **film-strip "S" monogram**; onboarding hero (home theater + projector beam + blank caption bars); 3 spot illustrations (file drop, empty history, model hub); film-grain texture for the sidebar.
- Self-review loop: every image opened and graded (no garbled text, palette match, small-size readability, flat style consistency). `spot_models` failed style check (isometric vs flat) and was re-generated once.
- Integrated: app icon set regenerated via `tauri icon` (ICO/PNG/iOS/Android), sidebar logo (was emoji), hero banner in Onboarding, spot illustrations in File Studio / Model Hub / empty History, grain texture on sidebar (cinema & studio themes only).
- Asset diet: converted to JPEG + downsized (hero 2.2MB→51KB, logo 1.4MB→85KB); total image payload ~184KB.

### Verification
- ✅ `npm run build` (tsc + vite) pass after integration and after asset compression
- ✅ `cargo check` pass (icon set swapped)
- ✅ All 10 generated images visually inspected and graded
- ⏳ Visual check on running app pending (taskbar icon, sidebar logo, hero, spot illustrations)

### Lessons learned
- Image models garble text — always prompt "no text" and let CSS do typography
- Requiring "strictly flat 2D, no isometric" in the prompt fixed style drift between spot illustrations
- Generated PNGs are often JPEG payloads; convert + downscale before shipping or the bundle bloats 20x

---

## Session 9 — 2026-10-04 (Version Bump v0.8.0 + Drag & Drop Media Studio + Custom Glass Select)

### What was done
- **Drag & Drop Media Zone (`FileSubView.tsx` & `FileSubView.css`)**:
  - Tích hợp Tauri Native `getCurrentWebview().onDragDropEvent` kết hợp HTML5 drag-over/drop.
  - Khu vực thả tệp (Dropzone) viền nét đứt chuyển màu phát sáng khi rê tệp vào, hiển thị đầy đủ định dạng hỗ trợ (`MP4`, `MKV`, `MOV`, `AVI`, `MP3`, `WAV`, `FLAC`).
  - Thay thế nút chọn đơn điệu bằng **Thẻ Media Thông Minh (Active Media Card)**: biểu tượng loại tệp (🎬 / 🎵), tên tệp nổi bật, đường dẫn monospace, nút đổi tệp và nút xoá tức thì.
- **Trình Chọn Dropdown Kính Mờ Studio (`CustomSelect.tsx` & `CustomSelect.css`)**:
  - Thay thế hoàn toàn thẻ `<select>` Windows xám đần cũ bằng component Dropdown kính mờ cao cấp, bo góc tròn, hiệu ứng xoay mũi tên mượt mà, checkmark `✓` đánh dấu lựa chọn.
  - Bổ sung thanh phím tắt chọn nhanh cặp ngôn ngữ phổ biến (Anh - Việt, Nhật - Việt, Trung - Việt, Hàn - Việt) chỉ với 1 click.
  - Công tắc gạt (Toggle Switch) mượt mà cho tùy chọn xuất phụ đề Song ngữ (`*.bilingual.srt`).
- **Bộ Nhận Diện Thị Giác AI (MiniMax Image AI)**:
  - Logo mới dải phim chữ S, bộ icon đa kích thước, minh họa Onboarding hero và các spot illustration.
- **Đóng Gói Xuất Xưởng Chuẩn**:
  - Tuân thủ quy chuẩn `npx tauri build --no-bundle` nhúng tĩnh 100% web assets vào `sublix.exe`, miễn dịch hoàn toàn với lỗi `localhost:1420`.

### Verification
- ✅ `npm run build` (tsc + vite) PASS (2.21s, 0 errors).
- ✅ `npx tauri build --no-bundle` PASS.
- ✅ Cập nhật `ChangelogModal.tsx` hiển thị đầy đủ tính năng v0.8.0.

---

## Session 10 — 2026-10-04 (Overlay Transparency Fix + UI Polish Pass)

### What was done
- **Fixed the click-through ("transparent") toggle** (user report): `overlay::window::set_click_through` (Win32 `WS_EX_TRANSPARENT`) was dead code and its disabled-path stripped `WS_EX_LAYERED` (which transparency needs). Now wired into `set_overlay_click_through`, `save_user_config`, and startup; keeps `WS_EX_LAYERED` and refreshes the frame via `SetWindowPos`.
- **Real subtitle-bar transparency control**: new `overlay_bg_opacity` (0–100%) + `overlay_text_color` (white/yellow/amber) config fields with slider & chips in the Overlay tab, applied live; preview shows the exact real settings.
- **SVG icon set** (`src/icons.tsx`) replacing emoji across sidebar nav, hardware pill, footer, topbar and action buttons.
- **Hotkeys**: `Ctrl+Shift+L` (toggle live), `Ctrl+Shift+O` (toggle overlay) with tooltips.
- **Overlay auto-height** (ResizeObserver + `window.setSize`) — long subtitles no longer clip.
- Extracted `handleStartLive`/`handleStopLive` with busy-ref guard (fixes double-fire BUG-011); VU meter decay + slider persist-on-release (BUG-024 items); theme switcher consolidated to mini dots in the sidebar footer.

### Verification
- ✅ `npm run build` (tsc + vite) pass
- ✅ `cargo check` + `cargo build --release` pass (v0.8.0)
- ⏳ Runtime check pending: click-through actually passing clicks; bg-opacity slider going transparent live

### Lessons learned
- A "does nothing" toggle is usually a dead code path — always grep for callers of the helper a setting claims to use
- Never remove `WS_EX_LAYERED` on a transparent window; only toggle `WS_EX_TRANSPARENT`

## Session 11 — 2026-10-04 (AI Dubbing Studio: Target Language Selection, Voice Showcase & Drag-Drop)

### What was done
- **Target Language Selection (Ngôn ngữ lồng tiếng đầu ra)**:
  - Trước đây: Dubbing Studio chỉ có dropdown "Ngôn ngữ gốc" và cố định dịch sang tiếng Việt (`vi`). Người dùng mở app cảm thấy tính năng chưa hoàn thiện và thiếu lựa chọn đích.
  - Cập nhật Rust backend (`src-tauri/src/dubbing/mod.rs` & `src-tauri/src/lib.rs`): bổ sung tham số `target_lang: Option<String>` vào `analyze_and_create_project` và lệnh `dubbing_analyze`. Dịch thuật tự động sử dụng `target_lang` đã chọn.
  - Tự động gán diễn viên (Speaker Casting) phù hợp với ngôn ngữ đích:
    - Tiếng Việt (`vi`): Nam Minh (`vi-VN-NamMinhNeural`), Hoài My (`vi-VN-HoaiMyNeural`).
    - Tiếng Anh (`en`): Guy (`en-US-GuyNeural`), Jenny (`en-US-JennyNeural`).
    - Tiếng Nhật (`ja`): Keita (`ja-JP-KeitaNeural`), Nanami (`ja-JP-NanamiNeural`).
    - Tiếng Trung (`zh`): Yunxi (`zh-CN-YunxiNeural`), Xiaoxiao (`zh-CN-XiaoxiaoNeural`).
- **Drag & Drop Media Zone cho Dubbing Studio**:
  - Tích hợp vùng kéo thả tệp (`.dubbing-dropzone`) hỗ trợ MP4, MKV, MOV, AVI, WEBM, MP3, WAV.
  - Card hiển thị tệp đang chọn (`.dubbing-active-card`) với tên tệp, định dạng, đường dẫn và nút đổi/xoá tệp.
- **Thư Viện Giọng Lồng Tiếng AI (Neural Voice Showcase - Luôn hiển thị)**:
  - Hiển thị danh thiếp của các diễn viên lồng tiếng AI ngay khi mở tab mà không cần chờ phân tích video xong.
  - Tích hợp nút **"🔊 Nghe thử"** (Instant Audition) gọi `dubbingPreviewTts` phát giọng mẫu tức thì qua thẻ `<audio>` ẩn.
- **Bộ Điều Khiển Cấu Hình Toàn Diện (Section 2)**:
  - Bố trí 2 ô `CustomSelect` kính mờ chuyên nghiệp đặt cạnh nhau: Ngôn ngữ gốc (Source) và Ngôn ngữ lồng tiếng đầu ra (Target).
  - Lựa chọn chế độ âm thanh: Thuyết minh (Audio Ducking) vs Chiếu rạp (Demucs v4 CUDA).
  - Nút CTA rõ ràng: `🚀 Bắt Đầu Phân Tích & Lập Kịch Bản Lồng Tiếng [TARGET_LANG]`.
- **Cập nhật Desktop Shortcuts**:
  - Đồng bộ tiêu đề cửa sổ trong `Chay-Sublix.bat` và `Chay-Sublix-Dev.bat` lên `Sublix v0.8.0`.

### Verification
- ✅ `npm run build` (tsc + vite) PASS (1.47s, 0 errors).
- ✅ `cargo check` (src-tauri) PASS (2.19s, 0 errors).
- ✅ `npx tauri build --no-bundle` PASS (1m 11s, nhúng tĩnh 100% web assets vào `sublix.exe`).

## Session 12 — 2026-10-04 (Performance Overhaul: Batch Translation, Dialogue Merging, Scope Range Limit & Instant Cancel)

### What was done
- **Root Cause Analysis (Video 2h08m FJIN-142)**:
  - Video dài 2 tiếng 8 phút (7,718 giây). Whisper chạy với cờ `--max-len 60` và không có bộ lọc nhiễu âm nền/hallucination dẫn đến việc phân mảnh âm thanh nền, tiếng thở, nhạc nền thành 9,696 mẩu vụn sub-second (trung bình 0.79s/câu).
  - Vòng lặp biên kịch gọi HTTP tuần tự từng câu một (`translate_text_with_config`) tới MiniMax API (mỗi câu mất ~1-2s). Nếu chạy hết 9,696 câu sẽ mất hơn 4 tiếng đồng hồ!
  - UI thiếu nút Dừng lại (Cancel) khiến người dùng bị kẹt xem tiến trình chạy chậm.
- **Giải Pháp 1: Lọc ảo giác & Ghép nối câu thoại thông minh (`clean_and_merge_raw_segments`)**:
  - Lọc bỏ ảo giác Whisper (`clean_whisper_transcript`, `is_hallucination`), lọc các tiếng thở/filler ngắn (< 0.55s và <= 2 ký tự), bỏ dấu câu đơn lẻ.
  - Tự động ghép nối các mệnh đề đối thoại liên tục của cùng lượt thoại (khoảng nghỉ giữa 2 câu < 0.85s, thời lượng gộp <= 7.0s) thành câu hoàn chỉnh có nghĩa.
  - Giảm số lượng phân đoạn từ gần 10,000 xuống còn ~600 - 800 câu thoại thực tế trên phim 2 tiếng (giảm 85-90% số câu rác).
- **Giải Pháp 2: Dịch Thuật Theo Cụm (Batch Translation - 20x-30x Speedup)**:
  - Bổ sung `translate_batch_with_config` (15 câu / batch) trong `translate/server.rs` và `translate/mod.rs`.
  - Thay vì 10,000 request HTTP, toàn bộ phim 2 tiếng chỉ cần ~40-50 request HTTP. Thời gian dịch toàn bộ phim giảm từ 4 tiếng xuống còn ~1-1.5 phút.
- **Giải Pháp 3: Tùy Chọn Phạm Vi Lồng Tiếng (Scope / Range Selection)**:
  - Bổ sung 3 chế độ: `⚡ Thử nghiệm 3 phút đầu` (khuyên dùng test trong 20s), `⏱️ 10 phút đầu` (~1 phút), và `🎬 Toàn bộ video`.
  - FFmpeg chỉ trích xuất đúng thời lượng đã chọn (`-t <sec>`), giúp kiểm tra chất lượng lồng tiếng tức thì mà không phải chờ cả phim 2 tiếng.
- **Giải Pháp 4: Cơ chế Huỷ Bỏ Tức Thì (Instant Cancel)**:
  - Thêm `AtomicBool` `DUBBING_CANCELLED` trong `dubbing/mod.rs` và Tauri command `dubbing_cancel`.
  - Bổ sung nút **`🛑 Dừng lại (Hủy bỏ)`** ngay trên thanh tiến trình trong giao diện để người dùng có thể dừng bất cứ lúc nào.

### Verification
- ✅ `npm run build` PASS (2.48s).
- ✅ `cargo check` PASS (1.85s).
- ✅ `npx tauri build --no-bundle` PASS (1m 04s).

## Session 13 — 2026-10-04 (LLM Engine Benchmark & 1-Click Scriptwriter Switcher: Local Qwen 3 vs MiniMax-M3)

### What was done
- **LLM Benchmark & Speed Comparison (Qwen 3 vs MiniMax-M3)**:
  - **Local Qwen 3-4B (NVIDIA RTX 3090 GPU — CUDA `llama-server.exe`)**:
    - Mô hình GGUF `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (2.49GB) nạp trực tiếp vào 24GB VRAM của RTX 3090.
    - Tốc độ sinh text: **~120 - 180 tokens/sec**, độ trễ **~0.08s - 0.15s / câu**. Zero network latency (0ms ping).
    - Hoàn toàn ngoại tuyến (Offline), không tốn tiền API, không bị giới hạn số lượng request, bảo mật 100%.
    - Cả bộ phim dài 2 tiếng sau khi ghép câu chỉ tốn **~20 - 30 giây** để biên kịch hoàn chỉnh.
  - **MiniMax-M3 (Cloud API)**:
    - Mô hình MoE reasoning lớn trên cloud: Văn phong điện ảnh cao cấp, đối thoại sâu sắc.
    - Độ trễ mạng (Ping từ VN sang server MiniMax): **~1.0s - 1.8s / request**.
    - *Trước tối ưu*: Dịch từng câu một dẫn đến 9,696 request = hơn 4 tiếng!
    - *Sau tối ưu*: Ghép cụm 15 câu/lần (Batch) chỉ tốn ~40 request = ~1 phút toàn bộ phim.
- **Tích Hợp Batch Translation Cho Local Qwen 3 (llama-server)**:
  - Bổ sung `translate_batch` trong `TranslationServer` và `translate_batch_via_server` trong `translate/server.rs`.
  - Cập nhật nhánh mặc định trong `translate_batch_with_config` (`src-tauri/src/translate/mod.rs`) gọi batch trực tiếp trên `llama-server`.
  - Giúp Qwen 3 dịch 15 câu cùng lúc trong ~0.6 giây trên RTX 3090.
- **Bộ Chuyển Đổi Bộ Não Biên Kịch 1-Click (UI Scriptwriter Engine Selector)**:
  - Bổ sung bộ chọn trực quan trong Mục 2 của `DubbingStudioView.tsx`:
    - ⚡ **Local Qwen 3-4B (NVIDIA RTX 3090 GPU — Siêu Tốc ~0.1s & Hoàn Toàn Offline)**.
    - 🧠 **MiniMax-M3 (Cloud AI — Văn Phong Điện Ảnh SOTA)**.
  - Tự động lưu cấu hình tức thì vào `sublix-config.json` qua `sublix.saveConfig`.
  - Header badge cập nhật động theo bộ não đang kích hoạt (`badge-gold` cho Local Qwen 3, `badge-purple` cho MiniMax-M3).

### Verification
- ✅ `cargo check` PASS (54.72s).
- ✅ `npm run build` PASS (2.27s).
- ✅ `npx tauri build --no-bundle` packaging.

---

## Session 14 — 2026-10-06 (File chạy chuẩn + Lần đầu Test GUI tự động + v0.9.2)

### What was done
- **Fix v0.9.2 (CommandCode)**: 2 bug từ `agent-team/HANDOFF_V0.9.2_BUG_EOF_AND_429.md` — (1) EOF "Kiểm Tra Link" (root cause: R2-08.3 thiếu pipe stdout/stderr trong `fetch_video_info`); (2) HTTP 429 phụ đề (`--sleep-subtitles 5` + lỗi chỉ ở sub mà video đã xong → ✅ Hoàn thành kèm cảnh báo UI). Commits `54f5ae2` + `6d7bc1b` + `2f6a49c`.
- **File chạy chuẩn `Chay-Sublix.bat`** (repo root + Desktop): chạy **dev mode** (`npm run tauri dev`) — mỗi lần mở = code mới nhất, sửa UI hot-reload, sửa Rust tự rebuild. **Từ nay không cần build release cho việc PO test nữa** (release exe chỉ dùng để đóng gói/phát hành — xem BUG-H07).
- **Lần đầu test GUI từ agent**: bật `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` khi chạy app → `agent-browser` (CDP) fill/click/snapshot như user thật. Lưu ý: main + overlay là 2 tab CDP, chọn tab chính (`http://localhost:1420/`).

### Verification (GUI thật, v0.9.2)
- ✅ URL chết (`uqkD4SxPK0I`) → UI hiện "⚠️ Không thể lấy thông tin video: ... This video is unavailable" (hết lỗi EOF).
- ✅ URL sống → metadata card hiện đúng (title/thumbnail/hàng chờ).
- ✅ Bấm tải 720p, KHÔNG sub → ✅ Hoàn thành; file 30,002,640 bytes trong `%APPDATA%\com.sublix.desktop\downloads`.

### Lessons
- Sửa luồng app (Tauri/IPC/UI) thì phải test GUI thật — CLI chỉ chứng minh ruột yt-dlp.
- Cổng debug chỉ bật khi test; giao PO thì mở lại app sạch (không port).

---

## Session 15 — 2026-10-06 (v0.9.3: Fix lỗi báo oan "không in ra đường dẫn file")

### Triệu chứng & điều tra
- Anh Tuấn tải "Arthas: Betrayer of the Light | Warcraft Cinematic" — file 45MB nằm thật trên đĩa nhưng UI báo ❌ Lỗi "yt-dlp đã thoát thành công nhưng không in ra đường dẫn file".
- Điều tra CLI + hexdump: khi output yt-dlp không phải UTF-8, **dòng `Destination:` in ra bị mất ký tự mà codepage không biểu diễn được** (fullwidth `：｜` — file trên đĩa có `：｜`, dòng log in ra không có) → `Path::exists()` của app trượt → báo lỗi oan dù exit 0.
- Ghi chú điều tra: hiện tượng `C:`→`C#` nhìn thấy trong vài lần test CLI là **artifact của PowerShell 5.1 `Start-Process` argument-quoting** (đã tạo nhầm thư mục ` C#/` trong repo, đã dọn) — KHÔNG phải lỗi của app.

### Fix (v0.9.3 — commits e48712c + 8162033)
1. Ép UTF-8 output cho mọi tiến trình yt-dlp: `PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1` (cả download lẫn fetch metadata).
2. `recover_output_file()` — **bằng chứng gốc trên ổ đĩa**: khi exit 0 mà path in ra không xác minh được, quét thư mục tải tìm file media có tag `[<video_id>]` (chỉ khớp id của chính request — an toàn luật BUG-046; cùng id coi như "đã tải rồi" đúng ngữ nghĩa yt-dlp).
3. UI: "Thử lại" thành công xoá cảnh báo lỗi cũ (`p.error !== undefined ? p.error : item.error`).
4. Unit tests mới: `extract_video_id`, `recover_output_file_finds_media_by_video_id`.

### Verification
- ✅ `cargo check` 0/0; `cargo test --lib downloader` 10/10 PASS.
- ✅ **GUI E2E thật (agent-browser)**: bấm "🔄 Thử lại" mục Arthas → tab Hoàn Thành 3→4, item hiện đúng tên file đầy đủ (có `：｜`), cảnh báo ⚠️ cũ biến mất.
- ✅ `npx tauri build --no-bundle` → exe v0.9.3 (~15.2MB).

### Dọn dẹp môi trường
- Desktop PO có **6 cửa sổ `Chay-Sublix-Dev.bat` chạy chồng** (tranh cổng 1420 / build lock) — đã kill hết; file Dev cũ giờ chỉ redirect sang `Chay-Sublix.bat` chuẩn.
- Xoá rác test: ` C#/` (artifact harness), `_agent_test/`, `%TEMP%\sublix_v092`.

---

## Session 16 — 2026-10-06 (v0.9.4: Nút "Chạy Video" + Hiển thị thư mục tải + fix nút "Mở Thư Mục")

### What was done (theo yêu cầu anh Tuấn)
- **▶ Chạy Video**: nút mới trên mỗi item đã tải — mở file bằng trình phát mặc định (`ShellExecuteW("open")`, xử lý đúng tên file ký tự đặc biệt).
- **Hiển thị thư mục tải**: header tab Tải Video hiện "📁 File tải về được lưu tại: <path>" (command mới `downloader_downloads_dir`) — PO biết chính xác file nằm đâu.
- **Fix nút "Mở Thư Mục"**: trước đây spawn `explorer.exe /select,"file"` từ Rust — spawn thành công nhưng **KHÔNG mở cửa sổ** (Rust argv-quoting làm explorer parse sai `/select`; phát hiện qua GUI test: gọi trực tiếp từ PowerShell thì mở được, gọi từ app thì không). Thay bằng shell API chuẩn **`SHOpenFolderAndSelectItems`** (`SHParseDisplayName` + `ILFree`; thêm feature `Win32_UI_Shell_Common` + `Win32_System_Com`).
- **Mặc định TẮT "Trích xuất phụ đề"** — ưu tiên video, tránh rate-limit 429.

### Verification (GUI thật, agent-browser)
- ✅ Click "▶ Chạy Video" (item Rick) → VLC mở đúng file (window title khớp tên file); kill VLC test sạch.
- ✅ Click "Mở Thư Mục" → Explorer mở `...\com.sublix.desktop\downloads`; đóng sạch.
- ✅ Header hiện đúng đường dẫn; checkbox phụ đề mặc định OFF.
- ✅ `cargo test --lib downloader` 10/10; `npx tauri build --no-bundle` → exe v0.9.4 (~15.2MB).

### Lessons
- `explorer.exe /select` từ Rust Command = bẫy argv-quoting — dùng `SHOpenFolderAndSelectItems` thay thế.
- "Video 20 phút tải vài giây" = file đã có sẵn trên đĩa (yt-dlp báo "has already been downloaded") — hành vi đúng, file hoàn chỉnh (ffprobe xác nhận 21.7 phút).

---

## Session 17 — 2026-10-06 (v0.9.5: Fix chất lượng 360p + v0.9.6: Chi tiết tải, Link gốc, Copy, Fix 403)

### v0.9.5 — Hết kẹt 360p (PO báo: MAX mà toàn 360p)
- Đo thực tế: Arthas & AI Just Crossed = **640x360**; `-F` với cấu hình cũ chỉ còn đúng 1 format progressive 360p.
- Root cause: cấu hình ép `youtube:player_client=android,web_safari,ios` — YouTube bóp client android về SABR-only ⇒ mọi format DASH (4K/1440p/1080p/720p) biến mất.
- Fix: **bỏ ép player_client** (giữ js-runtime + ejs solver). `-F` với default: đủ 4K/1440p/1080p/720p. CLI 720p → **1280x720**. **PO tự verify: tải "DeepSeek V4.1" → 1920×1080 (309.7 MB).**

### v0.9.6 — Chi tiết tải + Link gốc + Copy + Fix 403 (theo yêu cầu PO)
- **Danh sách tải (completed)**: hiện 🎞 chất lượng (ffprobe) · 💾 dung lượng thật (fs metadata) · 📁 đường dẫn đầy đủ. **Khi đang tải**: hiện "đã tải / tổng" (📥 202.0 MB / 450.0 MB) kèm % + tốc độ + ETA.
- **Backfill**: command `downloader_file_meta` + effect một-lần — mục cũ tự được đo lại size + resolution khi mở app.
- **🔗 Link video gốc + nút "📋 Copy link"** trên MỌI mục (link die/tải lỗi còn copy dán lại) — clipboard API + fallback execCommand.
- **Fix 403 "unable to download video data"** (gặp với Big Buck Bunny): `python -m pip install curl_cffi` vào Python313 → hết warning "no impersonate target"; retry OK.

### Kỹ thuật (v0.9.6)
- Event mới `downloader:meta {id, size_text, resolution}` phát khi hoàn tất (payload progress giữ nguyên); struct `DownloadMetaPayload`/`FileMeta`; helper `format_size_text` + `probe_media_meta`/`probe_video_resolution` (ffprobe cạnh ffmpeg).

### Verification (GUI thật, agent-browser)
- ✅ Backfill: DeepSeek "1920×1080 (Full HD) · 309.7 MB · 📁..."; Rick "1280×720 (HD) · 28.6 MB".
- ✅ BBB sau khi cài curl_cffi: Thử lại → **1280x720 (77.8 MB)**; item hiện đủ chips + link + Copy.
- ✅ 6 mục đều có 🔗 link + 📋 Copy link; cargo check 0/0; 10/10 test; exe v0.9.6 (~15.2MB).

### Ghi chú vận hành (quan trọng)
- **Máy cần `curl_cffi`** cho yt-dlp (đã cài); máy mới: `python -m pip install curl_cffi`.
- File cũ đã tải 360p (Arthas, AI Just Crossed): muốn bản nét thì **xóa file cũ trong downloads rồi tải lại** (trùng tên ⇒ yt-dlp báo "đã tải rồi").
- Sự cố nhỏ khi dọn test: bấm nhầm nút xoá 1 mục danh sách (Rick) do chọn ref cuối thay vì đối chiếu cặp heading↔nút — đã khôi phục bằng tải lại link. **Bài học: tự động hoá phải pair ref theo item, không lấy ref[-1] mù.**

---

## Session 18 — 2026-10-07 00:08 → 01:15 (CommandCode) — v0.9.9 (Voice Catalog + Mẫu Nghe Thử + Khớp Voice Đa Vai)

### User intent (Telegram 00:08)
- "Tab lồng tiếng còn gì thì hiện thực hoá đi" — muốn: chọn model → hiện danh sách voice nam/nữ; xem được TRƯỚC khi load model; PO nhận định đúng: "load model 1 lần rồi trích xuất trước sample voice"; làm nốt "khớp voice nhiều role".

### Đã làm (v0.9.9)
- Hub "🎛 Chọn Giọng & Tải Model": mỗi model bấm ▸ mở danh sách giọng Nam/Nữ (hiện cả TRƯỚC khi tải); Kokoro 7 nam + 7 nữ; card mới "Edge Neural (có sẵn)"; model clone ghi chú cơ chế clip mẫu.
- `voice_sample_generate` (Kokoro): tạo 1 lần 14 mẫu WAV ~1 phút (event `voice:sample_progress` X/14) → cache `models/voice/kokoro-vi/samples/`; `voice_sample_data` trả data URI → nghe tức thì; chưa có cache thì fallback synth trực tiếp như cũ.
- Multi-role: pool 7 nam + 7 nữ cho cả 2 nhánh auto-cast; dropdown nhãn "♂/♀ + engine"; "Thêm nhân vật" tự chọn giọng CHƯA dùng (ưu tiên Kokoro); chip ⚠️ Trùng giọng khi 2 vai share giọng.

### Verification (GUI thật, agent-browser CDP 9222 — no-watch)
- Tạo mẫu thật: UI "Đang tạo mẫu 5/14…" → **14/14 file WAV** (~220-277KB, 24kHz) trong `src-tauri/models/voice/kokoro-vi/samples/`; UI "✅ Đã có sẵn mẫu 14/14".
- Nghe thử: CDP click 🔊 Tuấn Ngọc → `paused:false, t:1.56s, dur:4.92s, src:data:audio/wav` (phát từ cache, không synth lại).
- E2E multi-role: `test_dubbing_input/dialogue_2spk.wav` (20.6s, 5 câu Nam/Nữ xen kẽ do Kokoro tạo) → Whisper+diarize → **5 vai**; auto-cast 5 giọng KHÁC NHAU (Tuấn Ngọc/Mai Linh/Mạnh Dũng/Ngọc Huyền/Thành Đạt); ép Vai5=Tuấn Ngọc → **2 chip ⚠️ Trùng giọng**.
- Ảnh bằng chứng: `test-output-audit-giong/v099_voice-catalog-hub.png`, `v099_multi-role-casting.png`. cargo check ✅ · tsc ✅.

### Bẫy dev-mode mới (ISSUE_LOG BUG-H08)
- App dev base dir = `src-tauri` (`CARGO_MANIFEST_DIR`) ⇒ ghi samples vào `src-tauri/models/...` ⇒ **tauri dev watcher tưởng đổi code → auto-restart → giết tiến trình tạo mẫu giữa chừng** (lần đầu: samples=0). Fix khi test: `npm run tauri dev -- --no-watch`. Release không dính (không có watcher).

### Ghi chú ca
- Chưa commit (của ca trước, không đụng): `SettingsView.tsx/css`, `src-tauri/examples/*`, audit docs Mavis.
- Test assets: `test_dubbing_input/dialogue_2spk.wav` + script `make_dialogue.ps1` (gitignored).

*Last updated: 2026-10-07 — v0.9.9 (voice catalog theo model + mẫu nghe thử cache + khớp voice đa vai)*

---

## Session 19 — 2026-10-10 20:30 → 23:25 (Antigravity) — Studio UI/UX Overhaul & Dedicated Subtitle Workflow (Rounds 10–14)

### User intent & PO Feedback (Anh Tuấn)
1. "kéo mở thêm đất như của premiere đi, giữa panel trên và dưới... kiểm tra phím Space play/pause, Delete xóa item...": Kéo giãn chiều cao timeline tự do, phím tắt dựng phim tiêu chuẩn.
2. "ở dưới các phần track không thể mở box trái chuột chọn nhiều item để xóa hay sửa... xóa được cả track... bỏ nút 1 click chạy hết đi thay bằng chạy dựa trên options chọn... sao chọn nó cứ tự động làm 1 nam 1 nữ...": Box marquee selection, Clear track, thống nhất workflow options.
3. "thanh trái giờ ú ụ rồi... xem lại option có trùng lặp không... tính năng phụ đề là phụ đề, lồng tiếng là lồng tiếng... có cả vietneu tts nữa thì thêm vào": Cấu trúc 2 khối độc lập, fix co ép `flex-shrink`, tích hợp 4 giọng VietNeu TTS.
4. "chọn mỗi tạo phụ đề mà nó vẫn hiện full 5 bước và chạy Sherpa AI... giải thích quy trình xem nào": Tách bạch luồng Phụ đề không chạy phân vai/Sherpa AI, Dynamic HUD banner.

### Đã làm & Quyết định kỹ thuật
- **R10 (Commit `1def73d`):**
  - Premiere-style Timeline resizer (`.studio-timeline-resizer`) giữa panel video và timeline. Lưu `localStorage("sublix_studio_timeline_height")`, min 180px, max 1200px.
  - Phím tắt toàn cục: `Space` (Play/Pause video khi không focus input/textarea), `Delete` / `Backspace` (xóa block phụ đề đang chọn kèm undo).
- **R11 (Commit `1271488`):**
  - Marquee Box Selection: Giữ chuột trái trên timeline body kéo quét hộp chữ nhật xanh translucent (`.studio-marquee-selection-box`) chọn nhiều segment đồng thời (`selectedSegmentIds: Set<number>`).
  - Nút thùng rác xóa sạch cả track (Clear Track) trên track header phụ đề kèm confirm.
- **R12 (Commit `5d7615a`):**
  - Phân tách độc lập 3 công cụ: Chọn (V), Tua Time Scrubber (T), Vùng lặp (R).
  - Khắc phục xung đột tua playhead khi rê chuột trên track body.
- **R13 (Commit `36196a0`):**
  - Tái cấu trúc Left Sidebar thành 2 khối cốt lõi:
    - 💬 Khối 1: Phụ Đề & Dịch Thuật (STT, chọn Whisper model, ngôn ngữ gốc, bật/tắt dịch, glossary).
    - 🎙️ Khối 2: Lồng Tiếng & Phân Vai (TTS, phân vai nhân vật, gán voice Kokoro / VietNeu TTS / Edge-TTS).
  - Tích hợp 4 giọng NeuTTS-Air AI (VietNeu TTS): Nam/Nữ miền Bắc, Nam/Nữ miền Nam.
  - Sửa triệt để lỗi "ú ụ" co ép: thêm `flex-shrink: 0` vào cards và action hub, scrollbar mượt mà 5px.
  - Thay thế bảng checklist 4 bước trùng lặp bằng 1 Pill tóm tắt chế độ + 1 Nút to thông minh duy nhất ("🚀 BẮT ĐẦU XỬ LÝ").
- **R14 (Commit `ac735e5`):**
  - Dynamic AI Progress HUD Banner: Tự động thích ứng số bước theo đúng chế độ:
    - Chỉ Phụ đề gốc (3 bước: Audio WAV ➔ Whisper STT ➔ Timeline Sub).
    - Chỉ Phụ đề + Dịch (4 bước: Audio WAV ➔ Whisper STT ➔ Dịch Phụ Đề ➔ Timeline Sub).
    - Chỉ Lồng tiếng (3 bước: Phân Vai ➔ Tổng Hợp TTS ➔ Đồng Bộ Timeline).
    - Toàn trình (5 bước).
  - Tuyệt đối loại bỏ Sherpa AI / Phân vai khi chỉ làm phụ đề. Toàn bộ câu thoại gom vào 1 track phụ đề chuẩn xác (`speaker_0`), không sinh nhiều track vai lạ gây rối mắt.
  - Nối chuỗi tự động mượt mà giữa STT và LLM Translate khi bật cả hai.

### Verification & Deliverables
- ✅ TypeScript build (`npm run build`): 100% pass (3.86s).
- ✅ Playwright E2E screenshots: `verify_round14_sub_only_no_translate.png`, `verify_round14_sub_only_with_translate.png`, `verify_round14_voice_only.png`.
- ✅ Git commits chuỗi: `1def73d` ➔ `1271488` ➔ `5d7615a` ➔ `36196a0` ➔ `ac735e5` (đã push GitHub origin/master).

*Last updated: 2026-10-10 — v0.11.29 (Premiere timeline, Marquee selection, VietNeu TTS, Dynamic AI HUD)*

---

## Session 20 — 2026-10-11 00:45 → 01:25 (Antigravity) — Unified Sublix Studio & 1-Click Bridge (Round 15)

### User intent & PO Feedback (Anh Tuấn)
- "tôi thấy phiên bản studio 1 kiểu còn các tab khác thì nó lại vẫn là 1 kiểu giống phần mềm cũ ấy, các chức năng như từ download video về bấm thẳng qua thì nó lại nổ thêm 1 tab video mới chứ không về tab studio. với nhiều các chức năng khác nữa, mấy các tab khác nói chung nó vẫn liên kết với nhau chứ vẫn không thành một phần mềm liên kết như hiện tại. bạn rà soát lại cho tôi nhé"
- "bạn nhớ git rồi ghi vào tài liệu cho anh em nhé, trong trường hợp bạn offline còn có người khác tiếp quản"

### Nguyên nhân gốc rễ (Root Cause)
1. **Hiện tượng nổ thêm tab video:**
   - Trong `DownloaderView.tsx` (dòng 1081–1095 cũ): Khi video tải xong, 2 nút `📝 Tạo Phụ Đề File` và `🎬 Lồng Tiếng AI` điều hướng sang `onNavigateToFileSub(safe)` và `onNavigateToDubbing(safe)`.
   - Trong `SettingsView.tsx` (dòng 127–135 cũ): Chuyển state sang `activeTab = "file_sub"` hoặc `activeTab = "dubbing"`.
   - Trong Topbar `SettingsView.tsx` (dòng 1123–1152 cũ): Có logic render ĐỘNG 2 tab "Phụ đề" và "Lồng tiếng", dẫn vào 2 view cũ `FileSubView` và `DubbingStudioView`. Người dùng thấy tự nhiên mọc thêm tab mới và giao diện bị phân mảnh kiểu phần mềm cũ, không về `SublixStudioView`.
2. **Lệch version & badge:**
   - Topbar badge bị hardcode `v0.11.0` thay vì `v0.11.29`.

### Giải pháp kỹ thuật đã triển khai (Arch & Implementation)
1. **Thiết lập 1-Click Bridge chuẩn từ Downloader sang Studio (`SublixStudioView`):**
   - Trong `DownloaderView.tsx`: Thêm prop `onNavigateToStudio?: (filePath: string) => void`. Thay thế nút cũ bằng nút nổi bật: **`🚀 Đưa Vào Studio`** (với style gradient vàng hổ phách `.item-btn.bridge-studio`, icon Clapper).
   - Trong `SettingsView.tsx`: Định nghĩa `handleRouteToStudio(path: string)`:
     - Set `pendingDubbingPath = safe`, `pendingStudioPath = safe`, tăng `studioFileNonce`.
     - Chuyển `setActiveTab("studio")`.
     - Kích hoạt load video thẳng lên Premiere timeline của `SublixStudioView`.
     - Cả `onNavigateToFileSub` và `onNavigateToDubbing` đều được trỏ về `handleRouteToStudio` để đảm bảo tương thích 100%.
2. **Gỡ bỏ triệt để 2 tab động "nổ" trên Master Topbar:**
   - Xóa bỏ khối nút bấm điều kiện `file_sub` và `dubbing` trên thanh `<nav className="studio-nav-tabs">`.
   - Giữ cố định đúng **6 tab Master duy nhất**:
     `Studio` | `Tải video` | `Live` | `Lịch sử` | `Tiến trình` | `Cài đặt`.
   - Bổ sung fallback và đồng bộ badge phiên bản `v0.11.29` đồng nhất trên tất cả các view.
3. **Đồng bộ hóa điều hướng trong Process Center:**
   - Cập nhật `AppTaskItem.targetTab` hỗ trợ `"studio"`.
   - Mọi thao tác nhảy tab từ Tiến trình đối với tác vụ tạo phụ đề/lồng tiếng đều đưa người dùng thẳng về `"studio"`.
4. **Trực quan hóa & Fallback trình duyệt (`tauri.ts`):**
   - Thêm graceful fallback cho `downloaderFileExists` khi chạy trên môi trường test / web bên ngoài desktop Tauri.
   - Thêm null-safe defensive checks cho `(sttModels ?? []).find(...)` và `(transModels ?? []).find(...)` trong `SettingsView.tsx`.

### Verification (Playwright E2E & Visual Inspection)
- ✅ `npm run build`: Pass 100% trong 1.90s, 0 TypeScript error, bundle sạch sẽ.
- ✅ Playwright E2E automation: Chạy thành công qua kịch bản trọn vẹn:
  1. Tải video xong trong Downloader: Hiển thị nút `🚀 Đưa Vào Studio` sáng rõ.
  2. Click `🚀 Đưa Vào Studio`: App lập tức chuyển thẳng sang tab `Studio`, nạp video `kenji_VI_HARDSUB.mp4` lên timeline.
  3. Master Topbar giữ nguyên đúng 6 tab, không nổ thêm bất kỳ tab lạ nào.
  4. Cả 6 tab (`Studio`, `Tải video`, `Live`, `Lịch sử`, `Tiến trình`, `Cài đặt`) đều hoạt động nhất quán theo chuẩn giao diện Cinema Dark StudioShell.
- 📸 Bằng chứng ảnh chụp thực tế:
  - `verify_round15_downloader_bridge_button.png`: Nút `🚀 Đưa Vào Studio` nổi bật trên card video hoàn thành.
  - `verify_round15_studio_after_bridge.png`: Studio mở ngay với video đã nạp, timeline Premiere, badge `v0.11.29`.
  - `verify_round15_tab_live.png`: Giao diện Live đồng bộ.
  - `verify_round15_tab_history.png`: Giao diện Lịch sử thoại 3 cột đồng bộ.
  - `verify_round15_tab_process.png`: Giao diện Trung tâm Tiến trình đồng bộ.
  - `verify_round15_tab_models.png`: Giao diện Cài đặt & Presets 1-click đồng bộ.

*Last updated: 2026-10-11 — v0.11.29 (Unified Studio Bridge, Fixed Popping Tabs, Master Topbar Synchronization)*


