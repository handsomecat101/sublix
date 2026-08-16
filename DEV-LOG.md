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

*Last updated: 2026-08-16 23:14 by Mavis*
