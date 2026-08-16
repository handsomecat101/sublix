# Architecture — Sublix

> High-level architecture overview. Updated as we build (M1+).

---

## System diagram

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
│              │  GPT-4o-mini          │                            │
│              │  → Vietnamese         │                            │
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

---

## Module map (planned)

### Rust backend (`src-tauri/src/`)
```
src-tauri/src/
├── main.rs                 # Entry, window setup
├── lib.rs                  # Tauri builder, command registration
├── config.rs               # User config (model, language, hotkeys)
├── audio/
│   ├── mod.rs
│   ├── capture.rs          # WASAPI loopback thread
│   ├── vad.rs              # Silero-VAD wrapper
│   └── resample.rs         # 48kHz → 16kHz
├── stt/
│   ├── mod.rs
│   ├── local.rs            # whisper-rs integration
│   ├── cloud.rs            # Deepgram WebSocket client
│   └── router.rs           # Decide local vs cloud
├── translate/
│   ├── mod.rs
│   ├── openai.rs           # GPT-4o-mini
│   ├── google.rs           # Google Translate fallback
│   └── batcher.rs          # Batch transcript segments
├── overlay/
│   ├── mod.rs
│   └── window.rs           # Tauri overlay window management
├── ipc/
│   ├── mod.rs              # Tauri commands exposed to frontend
│   └── events.rs           # Events emitted to frontend
└── errors.rs               # Centralized error types
```

### Frontend (`src/`)
```
src/
├── App.tsx                 # Root component
├── main.tsx                # Entry, ReactDOM render
├── views/
│   ├── OverlayView.tsx     # Subtitle rendering (overlay window)
│   ├── SettingsView.tsx    # Settings panel
│   └── OnboardingView.tsx  # First-run setup
├── components/
│   ├── SubtitleLine.tsx    # Single line with animation
│   ├── LanguageSelector.tsx
│   ├── ModelSelector.tsx
│   └── HotkeyCapture.tsx
├── hooks/
│   ├── useSubtitles.ts     # Subscribe to subtitle events
│   └── useSettings.ts
└── lib/
    ├── tauri.ts            # Tauri command wrappers
    └── types.ts            # TypeScript types
```

---

## Data flow

1. **Audio capture** (`audio/capture.rs`):
   - WASAPI loopback thread chạy liên tục
   - Output: 16kHz mono PCM frames
   - Push vào bounded queue (drop-oldest nếu full)
2. **VAD** (`audio/vad.rs`):
   - Silero-VAD detect speech segments
   - Chia thành chunks ~500ms
3. **STT** (`stt/`):
   - Local: whisper-rs xử lý chunk → transcript + language
   - Cloud (opt-in): Deepgram WebSocket stream
   - Router chọn theo setting
4. **Translation** (`translate/`):
   - Batcher gom 2-3 transcript segments → 1 translation call
   - GPT-4o-mini cho JA→VI (best cho Asian)
   - Cache để không dịch lại
5. **Subtitle buffer** (in-memory):
   - Giữ 2-3 dòng gần nhất
   - Smooth fade in/out
6. **Overlay render** (`overlay/window.rs` + frontend):
   - Tauri always-on-top window
   - Click-through cho phần nền, drag cho header
   - Frontend render subtitle text

---

## Inter-process communication (IPC)

### Tauri commands (frontend → backend)
- `start_capture()` — Bắt đầu capture audio
- `stop_capture()` — Dừng capture
- `set_language(source, target)` — Đổi language pair
- `set_stt_mode(mode)` — "local" | "cloud" | "auto"
- `set_model(model)` — Chọn Whisper model
- `get_config()` — Lấy config hiện tại
- `update_config(partial)` — Update config

### Tauri events (backend → frontend)
- `subtitle:new` — { text, translated, timestamp }
- `audio:level` — { rms, peak } (cho visualizer)
- `status:change` — { state: "idle" | "capturing" | "translating" | "error", message? }
- `error:occurred` — { kind, message }

---

## Key design decisions

1. **Bounded queues** giữa các stage: drop-oldest, không block. Tránh backpressure.
2. **Capture thread + processing threads** riêng biệt. WASAPI loopback không bao giờ block.
3. **Tauri window riêng cho overlay**: không phải main window. Main window chỉ để settings.
4. **Local STT first, cloud opt-in**: UX mặc định free + private. Cloud chỉ khi user bật.
5. **Cache translations**: không dịch lại cùng segment (quan trọng cho accuracy test).

---

*Last updated: 2026-08-16 23:14 — pre-M1*
