# AGENTS.md — Sublix

> Hướng dẫn cho AI agents (Mavis, Hermes, Claude, GPT, …) khi làm việc trên project này.

---

## Project snapshot

| Field | Value |
|---|---|
| **Tên** | Sublix |
| **Loại** | Windows desktop app |
| **Stack** | Tauri v2 + Rust + React + TypeScript |
| **Mục đích** | Real-time subtitle overlay dịch audio bất kỳ trên Windows |
| **Trạng thái** | M0 done (scaffold xong). M1 (audio capture) là milestone tiếp theo. |
| **Workspace** | `H:/AI Project/sublix` |

---

## Đọc gì trước khi làm

1. **[README.md](./README.md)** — project overview, use cases, current status
2. **[DEV-LOG.md](./DEV-LOG.md)** — **CRITICAL**: chronological log mọi decisions + actions Mavis đã làm. Đọc để hiểu context.
3. **[PLAN.md](./PLAN.md)** — implementation roadmap, milestones, tech stack
4. **[docs/decisions.md](./docs/decisions.md)** — decision log (D1-D7 đã chốt)
5. **[docs/architecture.md](./docs/architecture.md)** — system architecture, data flow, module map
6. **[docs/research.md](./docs/research.md)** — tech research evidence (nếu cần justify)

Nếu conflict giữa các file → **DEV-LOG.md là mới nhất** (chronological), update các file khác nếu cần.

---

## Tech stack (LOCKED — đừng đổi)

| Layer | Technology | Version |
|---|---|---|
| App framework | Tauri v2 | ^2 |
| Backend | Rust (Cargo, edition 2021) | 1.94.1 |
| Frontend | React + TypeScript | 19.1 / 5.8 |
| Frontend build | Vite | 7.0 |
| Audio capture | WASAPI loopback (chưa code) | — |
| STT local | whisper.cpp via `whisper-rs` (chưa code) | large-v3 |
| STT cloud | Deepgram Nova-3 (chưa code) | opt-in |
| Translation | OpenAI GPT-4o-mini + Google Translate (chưa code) | opt-in |
| Overlay | Tauri window (chưa code) | transparent + always-on-top |

---

## Coding conventions

### Rust
- Modules < 300 dòng, tách file khi cần
- Errors: `anyhow` cho application errors, `thiserror` cho typed errors
- Logging: `tracing` (không dùng `println!`)
- Async: `tokio` runtime (Tauri mặt định)
- Comments: tiếng Anh cho public API, tiếng Việt OK cho internal notes
- **Không dùng `unwrap()` trong production code** — dùng `?` hoặc `.context()`

### TypeScript / React
- Strict TypeScript (`"strict": true` — verify in `tsconfig.json`)
- Functional components + hooks
- Tailwind cho styling, không CSS modules
- File naming: PascalCase cho components, camelCase cho hooks/utils
- Comments: tiếng Anh cho public code, tiếng Việt OK cho internal

### Git
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Branch: `main` (protected), `feat/<name>`, `fix/<name>`
- Squash merge khi merge vào main
- Commit message tiếng Anh
- **CHƯA init git** — sẽ init khi M0 verification xong

---

## Quy tắc quan trọng

### DO ✅
- Match pattern hiện có trong codebase trước khi thêm mới
- Update `DEV-LOG.md` sau mỗi action quan trọng (chronological, factual)
- Update `PLAN.md` milestone status khi complete
- Document mọi architectural decision trong `docs/decisions.md` (thêm D-number)
- Test trên Windows thật trước khi claim "xong"
- Verify với `cargo check` + `npm run build` + `npm run tauri dev` sau mỗi milestone

### DON'T ❌
- ❌ Thêm dependency mới không có trong PLAN.md mà không justify trong DEV-LOG
- ❌ Đổi tech stack (vd: Electron, Flutter) — Tauri only
- ❌ Commit binary files (models, build artifacts) — gitignore
- ❌ Hardcode API keys — dùng env vars hoặc Tauri secure store
- ❌ Bỏ qua Windows-specific issues (path, line ending, encoding)
- ❌ Auto-install system tools (Rust, Node) mà không hỏi user
- ❌ Hỏi user quá nhiều technical questions — user không rành code, tự quyết technical

---

## Module map (current vs planned)

### ✅ Có rồi (sau M0)
```
sublix/
├── package.json                    # Frontend deps
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/                            # React app
│   ├── App.tsx                     # Default Tauri React template
│   ├── main.tsx
│   ├── App.css
│   ├── assets/
│   └── vite-env.d.ts
├── src-tauri/                      # Rust backend
│   ├── Cargo.toml                  # Tauri 2 + plugin-opener
│   ├── tauri.conf.json             # Window config
│   ├── build.rs
│   ├── capabilities/
│   ├── icons/
│   └── src/
│       ├── main.rs
│       └── lib.rs                  # Default `greet` command
```

### ⏳ Chưa có (M1+ sẽ tạo)
```
src-tauri/src/
├── config.rs
├── audio/{mod,capture,vad,resample}.rs
├── stt/{mod,local,cloud,router}.rs
├── translate/{mod,openai,google,batcher}.rs
├── overlay/{mod,window}.rs
├── ipc/{mod,events}.rs
└── errors.rs

src/
├── views/{OverlayView,SettingsView,OnboardingView}.tsx
├── components/{SubtitleLine,LanguageSelector,ModelSelector,HotkeyCapture}.tsx
├── hooks/{useSubtitles,useSettings}.ts
└── lib/{tauri,types}.ts
```

---

## Open questions (xem `docs/decisions.md`)

Tất cả M0 blockers đã resolved. Còn lại:
- ⏳ **Q2 Distribution scope** — defer to M5 (Personal only? Family? Public?)
- ⏳ **Q5 Branding/visual style** — defer to M4

---

## Testing strategy

| Phase | Test type | Coverage target |
|---|---|---|
| M0-M1 | Manual smoke | Happy path works |
| M2-M3 | Unit tests (Rust) | Audio format conversion, VAD logic |
| M4 | Manual + screenshot | UX flows |
| M5 | Integration test | End-to-end với 1 video sample |
| M6 | Manual + user feedback | Real-world usage |

Test scripts trong `tests/` (sẽ tạo M5).

---

## Workflow khi nhận task

1. **Đọc context** (theo thứ tự ở trên): DEV-LOG → README → PLAN → decisions → architecture
2. **Hiểu scope**: Task thuộc milestone nào? Có blockers từ decisions.md không?
3. **Plan trước khi code**: Nếu task > 2 giờ, viết sub-plan trong `docs/decisions.md` hoặc PR description
4. **Code theo conventions** ở trên
5. **Verify locally** trước khi báo done:
   - `npm run build` (frontend)
   - `cargo check` (Rust, trong `src-tauri/`)
   - `npm run tauri dev` (full app, optional trong CI)
6. **Update DEV-LOG.md** với action mới
7. **Update PLAN.md** nếu milestone complete
8. **Report**: summary ngắn gọn cho user

---

## Known gotchas (Windows-specific)

1. **PATH setup**: Rust toolchain bin đã add vào user PATH (persistent). Nếu PowerShell session mới không thấy `cargo`, restart terminal.
2. **Long PATH**: Đã dùng `.NET SetEnvironmentVariable` thay vì `setx` để tránh long-path issue.
3. **Line endings**: Git nên config `core.autocrlf=true` (Windows default).
4. **Encoding**: PowerShell 5.1 default ANSI — dùng `[System.IO.File]::ReadAllText` hoặc `Get-Content -Encoding UTF8` cho files có ký tự đặc biệt.

---

## Environment verified

| Tool | Version | Path |
|---|---|---|
| Node | v24.14.0 | (system PATH) |
| npm | 11.9.0 | (system PATH) |
| cargo | 1.94.1 | `C:\Users\TTC\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin\cargo.exe` |
| rustc | 1.94.1 | `C:\Users\TTC\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin\rustc.exe` |
| MSVC cl | 14.29.30133 | `C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Tools\MSVC\14.29.30133\bin\Hostx64\x64\cl.exe` |
| WebView2 | 151.0.4129.86 | (system install) |

---

## Liên lạc

Khi stuck hoặc cần quyết:
- Update `docs/decisions.md` với context + options + recommendation
- Báo user qua chat với link tới file

Không assume — khi có ambiguity về technical, tự quyết theo conventions. Hỏi user chỉ khi strategic/product.

---

*Last updated: 2026-08-16 23:14 — Mavis (post-M0)*
