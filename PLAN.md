# PLAN.md — Sublix Implementation Roadmap

> Ngày tạo: 2026-08-16
> Tác giả: Mavis (research + planning), chờ Anh Tuấn review
> Trạng thái: Planning phase

---

## 1. Vision & Non-goals

### Vision
> Mở bất kỳ video nào (down về, YouTube, Netflix, Zoom, …) trên Windows → tự động có phụ đề dịch theo ngôn ngữ mình chọn, hiển thị overlay đẹp, latency thấp. Hoạt động universal, không cần biết IP/port/device ID gì hết.

### Non-goals (v1)
- ❌ Mobile (Android/iOS) — phase 2
- ❌ Account / cloud sync / family sharing — phase 2
- ❌ Custom voice cloning / TTS — out of scope
- ❌ Browser extension standalone — desktop app cover use case
- ❌ Multi-user / multi-profile — single user per install

---

## 2. User personas (v1)

| Persona | Thiết bị | Use case chính | Language pair |
|---|---|---|---|
| **Anh Tuấn** (primary) | PC Windows, có GPU | Xem phim Nhật down về, YouTube lecture | JA → VI, EN → VI |
| **Family member** (potential) | Cùng PC | Cùng xem phim với sub | VI → VI (no-op) hoặc khác |

Nếu sau này share rộng → thêm persona nhưng v1 chỉ optimize cho 1 user.

---

## 3. Success metrics (v1)

| Metric | Target |
|---|---|
| Latency end-to-end (audio → overlay) | ≤ 4s |
| STT WER trên phim Nhật có sub | ≤ 8% (Whisper large-v3) |
| Translation quality (JA→VI) | 4/5 subjective rating |
| RAM usage (idle) | ≤ 200MB |
| Binary size (installer) | ≤ 30MB |
| Cold start time | ≤ 3s |
| Crash rate | < 1% sessions |

---

## 4. Tech stack

### Locked (đã chốt)
- **App framework**: Tauri v2 (Rust + WebView)
- **Audio capture**: WASAPI loopback qua `wasapi` crate
- **STT local**: whisper.cpp qua `whisper-rs` (Rust binding)
- **VAD**: Silero-VAD v6.2.0 (built-in từ whisper.cpp v1.8.3+)
- **STT cloud**: Deepgram Nova-3 (WebSocket streaming, JA multilingual)
- **Translation**: GPT-4o-mini (OpenAI API) + Google Translate (free fallback)
- **Overlay**: Tauri window (transparent, always-on-top, click-through)

### Cần quyết (xem `docs/decisions.md`)
- Frontend framework: **React** vs **Svelte** vs **Solid.js**
- Whisper model: large-v3 (accuracy) vs small (speed) — phụ thuộc GPU
- App name: ~~Sublix~~ ✅ (đã chốt)
- Branding/visual: tối giản dark, Google-Photos style

### Dependencies chính (Rust)
```toml
[dependencies]
tauri = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
whisper-rs = "0.13"           # whisper.cpp Rust binding
wasapi = "0.20"                # Windows audio loopback
hound = "3"                    # WAV file I/O (debug)
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio-tungstenite = "0.24"     # WebSocket for Deepgram
anyhow = "1"                   # Error handling
thiserror = "1"                # Custom errors
tracing = "0.1"                # Logging
```

### Dependencies chính (JS/TS)
```json
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "react": "^18",  // hoặc svelte
    "tailwindcss": "^3"
  }
}
```

---

## 5. Architecture

### High-level data flow
```
┌──────────────────────────────────────────────────────────────────┐
│                    Windows machine                                │
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐      │
│  │   VLC    │   │ Browser  │   │   mpv    │   │ Anything │      │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘      │
│       │              │              │              │             │
│       └──────────────┴──────────────┴──────────────┘             │
│                          │                                        │
│                          ▼ (system audio mix)                    │
│                ┌──────────────────────┐                           │
│                │   WASAPI Loopback    │                           │
│                │   (capture thread)   │                           │
│                └──────────┬───────────┘                           │
│                           │ 16kHz mono PCM                       │
│                           ▼                                       │
│                ┌──────────────────────┐                           │
│                │   Audio buffer       │                           │
│                │   (bounded queue)    │                           │
│                └──────────┬───────────┘                           │
│                           │                                       │
│                           ▼                                       │
│                ┌──────────────────────┐                           │
│                │  VAD (Silero)        │                           │
│                │  + chunk 500ms       │                           │
│                └──────────┬───────────┘                           │
│                           │                                       │
│                           ▼                                       │
│         ┌─────────────────┴─────────────────┐                    │
│         │                                   │                    │
│         ▼                                   ▼                    │
│  ┌──────────────┐                  ┌──────────────┐             │
│  │ Whisper      │                  │ Deepgram     │             │
│  │ local (Rust) │                  │ cloud        │             │
│  │  large-v3    │                  │ Nova-3       │             │
│  └──────┬───────┘                  └──────┬───────┘             │
│         │ transcript (JA/EN/…)            │                     │
│         └──────────────┬───────────────────┘                    │
│                        ▼                                         │
│              ┌──────────────────────┐                            │
│              │ Translation queue   │                            │
│              │ (batched, 1-2s)     │                            │
│              └──────────┬───────────┘                            │
│                         ▼                                        │
│              ┌──────────────────────┐                            │
│              │ GPT-4o-mini          │                            │
│              │ → Vietnamese         │                            │
│              └──────────┬───────────┘                            │
│                         ▼                                        │
│              ┌──────────────────────┐                            │
│              │  Subtitle buffer     │                            │
│              │  (last 2-3 lines)    │                            │
│              └──────────┬───────────┘                            │
│                         ▼                                        │
│              ┌──────────────────────┐                            │
│              │  Overlay window      │◄──── Always-on-top        │
│              │  (Tauri, transparent)│      Click-through         │
│              └──────────────────────┘                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Module breakdown (Rust)
```
src-tauri/src/
├── main.rs                    # Entry, window setup
├── config.rs                  # User config (model, language, hotkeys)
├── audio/
│   ├── mod.rs
│   ├── capture.rs             # WASAPI loopback thread
│   ├── vad.rs                 # Silero-VAD wrapper
│   └── resample.rs            # 48kHz → 16kHz
├── stt/
│   ├── mod.rs
│   ├── local.rs               # whisper-rs integration
│   ├── cloud.rs               # Deepgram WebSocket client
│   └── router.rs              # Decide local vs cloud
├── translate/
│   ├── mod.rs
│   ├── openai.rs              # GPT-4o-mini
│   ├── google.rs              # Google Translate fallback
│   └── batcher.rs             # Batch transcript segments
├── overlay/
│   ├── mod.rs
│   └── window.rs              # Tauri overlay window management
├── ipc/
│   ├── mod.rs                 # Tauri commands exposed to frontend
│   └── events.rs              # Events emitted to frontend
└── errors.rs                  # Centralized error types
```

### Module breakdown (Frontend)
```
src/
├── App.tsx                    # Root component
├── views/
│   ├── OverlayView.tsx        # Subtitle rendering
│   ├── SettingsView.tsx       # Settings panel
│   └── OnboardingView.tsx     # First-run setup
├── components/
│   ├── SubtitleLine.tsx       # Single line with animation
│   ├── LanguageSelector.tsx
│   ├── ModelSelector.tsx
│   └── HotkeyCapture.tsx
├── hooks/
│   ├── useSubtitles.ts        # Subscribe to subtitle events
│   └── useSettings.ts
└── lib/
    ├── tauri.ts               # Tauri command wrappers
    └── types.ts
```

---

## 6. Milestones

### M0: Foundation (2 ngày) — ✅ DONE 2026-08-16
**Goal**: Có Tauri app build được, mở được window, log "hello world".

Tasks:
- [x] `npm create tauri-app` với React + TypeScript
- [ ] Verify `npm run tauri dev` chạy được trên Windows (chưa test - sẽ làm ngay sau M0 update)
- [ ] Setup tauri.conf.json (window options, capabilities)
- [ ] Setup Tailwind CSS
- [ ] Tạo basic UI shell (header, body, footer)
- [ ] Git init + first commit
- [x] Update README + .gitignore
- [x] Rename references "sublix-app" → "sublix" / "Sublix"

**Status**: 7/8 done. Remaining: Tailwind, dev verify, git init.

**Acceptance**: Mở app lên thấy "Sublix" branding + Tauri default UI (greet button).

---

### M1: Audio capture (3-4 ngày)
**Goal**: Capture system audio thành công, ghi ra WAV file để verify.

Tasks:
- [ ] Add `wasapi` crate dependency
- [ ] Implement capture loop (16kHz mono PCM)
- [ ] Bounded queue giữa capture thread và consumer
- [ ] List audio devices qua Tauri command
- [ ] Test capture với VLC phát nhạc → save WAV
- [ ] Visualize audio waveform (debug)

**Acceptance**: Play video trong VLC → chạy Sublix → file WAV có audio đúng.

---

### M2: STT pipeline (4-5 ngày)
**Goal**: Audio in → text out với độ trễ chấp nhận được.

Tasks:
- [ ] Bundle whisper.cpp (binary hoặc compile từ source)
- [ ] Add `whisper-rs` binding
- [ ] Test local STT với file WAV (offline mode)
- [ ] Implement VAD (Silero-VAD)
- [ ] Streaming mode: 500ms chunks → partial transcript
- [ ] Add Deepgram WebSocket client (cloud fallback)
- [ ] Router logic: local trước, fallback cloud nếu lỗi
- [ ] Latency benchmark: log end-to-end delay

**Acceptance**: Cho audio Nhật vào → ra transcript JA, latency ≤ 4s.

---

### M3: Translation (2-3 ngày)
**Goal**: Transcript source → translated text.

Tasks:
- [ ] OpenAI API client (GPT-4o-mini)
- [ ] Google Translate client (fallback)
- [ ] Batcher: gom 2-3 transcript segments → 1 translation call
- [ ] Context preservation (slide window 3-5 segments)
- [ ] Cache translations (không dịch lại)
- [ ] Test với transcript JA → VI

**Acceptance**: 100 câu JA phổ biến → dịch VI mượt, latency +1s.

---

### M4: Overlay UI (4-5 ngày)
**Goal**: Subtitle hiển thị đẹp trên video, không cản thao tác.

Tasks:
- [ ] Tauri window config: `transparent: true`, `alwaysOnTop: true`, `decorations: false`
- [ ] Win32 `SetWindowLongPtrW` để toggle click-through
- [ ] Drag-to-move logic (mouse drag trên header nhỏ)
- [ ] Subtitle rendering: 2-3 dòng, fade in/out
- [ ] Font, size, color, background customizable
- [ ] Position presets (top, middle, bottom)
- [ ] Settings panel: model, language, hotkeys, theme
- [ ] Global hotkeys: pause/resume, toggle overlay, switch language

**Acceptance**: Mở phim Nhật → sub overlay xuất hiện, đẹp, không che UI player.

---

### M5: Polish (3-4 ngày)
**Goal**: Production-ready, không crash, UX mượt.

Tasks:
- [ ] Error handling: graceful fallback nếu mất model, mất API key
- [ ] First-run onboarding (download model, API key setup)
- [ ] Auto-start with Windows (optional, toggle in settings)
- [ ] Tray icon + menu (pause, settings, quit)
- [ ] Performance tuning (buffer sizes, model quantization)
- [ ] Installer: MSI via Tauri bundler
- [ ] Logs viewer (debug, send logs button)
- [ ] Documentation: user guide + troubleshooting

**Acceptance**: Cài qua .msi, chạy trên máy sạch, end-user dùng được không cần hỏi dev.

---

### M6: Ship (1-2 ngày)
**Goal**: v1.0.0 ra mắt, có feedback loop.

Tasks:
- [ ] GitHub release với binaries
- [ ] Landing page đơn giản (GitHub Pages hoặc jimmyvu.me subdomain?)
- [ ] Feedback form / Discord / email
- [ ] Roadmap cho v1.1, v2.0
- [ ] Video demo YouTube

**Acceptance**: Public download, 5+ người dùng đầu tiên test, feedback tích cực.

---

## 7. Timeline estimate

| Phase | Days | Cumulative |
|---|---|---|
| M0 Foundation | 2 | 2 |
| M1 Audio capture | 4 | 6 |
| M2 STT pipeline | 5 | 11 |
| M3 Translation | 3 | 14 |
| M4 Overlay UI | 5 | 19 |
| M5 Polish | 4 | 23 |
| M6 Ship | 2 | 25 |

**Total: ~25 ngày làm việc (~5 tuần)** cho MVP v1.0.0.

⚠️ Ước lượng này giả định anh Tuấn review/decide nhanh. Nếu blocker nhiều → +30%.

---

## 8. Open decisions (cần anh Tuấn quyết)

Xem chi tiết trong [`docs/decisions.md`](./docs/decisions.md). Top priorities:

1. **GPU của Tuấn là gì?** (NVIDIA / AMD / Intel / CPU only) → quyết Whisper model
2. **Personal use only hay sẽ share?** → quyết license + distribution
3. **Cloud API có dùng được không?** (cần API key + budget nhỏ)
4. **Frontend: React hay Svelte?** (ảnh hưởng bundle size + dev speed)

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| WASAPI loopback permissions issue | High | Tham khảo Voicebox/Handy code, có fallback driver approach |
| Tauri v2 Windows compatibility bugs | Medium | Test trên Windows 10 + 11 sớm, có thể downgrade v1 nếu cần |
| Whisper large-v3 latency trên CPU | High | Có cloud fallback, document min spec |
| Cloud API cost unexpectedly cao | Medium | Default local, chỉ dùng cloud khi user enable |
| True fullscreen video che overlay | Medium | Document limitation, có thể add "windowed fullscreen" workaround |
| Japanese → Vietnamese quality kém | Medium | Test sớm với sample phim, có thể switch sang model khác |
| Không có GPU → STT quá chậm | High | Default cloud mode, local là opt-in |

---

## 10. References (đã research)

- **Tauri v2** — https://tauri.app/v2/
- **whisper.cpp** — https://github.com/ggml-org/whisper.cpp (v1.8.4, Mar 2026)
- **whisper-rs** — https://github.com/tazz4843/whisper-rs
- **WASAPI loopback** — https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording
- **Tauri v2 always-on-top overlay** — https://github.com/jamiepine/voicebox (reference)
- **Silero-VAD** — bundled với whisper.cpp v1.8.3+
- **Deepgram Nova-3** — https://deepgram.com (5.26% WER, $0.0077/min, 200-400ms latency)
- **Language Reactor** — https://www.languagereactor.com (UX reference)
- **SimulStreaming** — https://github.com/ufal/SimulStreaming (Whisper realtime successor)

Xem chi tiết evidence trong [`docs/research.md`](./docs/research.md).

---

## 11. Next steps

1. Anh Tuấn review plan này
2. Trả lời 4 open decisions ở mục 8
3. Em scaffold M0 (Tauri project)
4. Em bắt đầu code

---

*Plan này sẽ được update khi có feedback. Last update: 2026-08-16*
