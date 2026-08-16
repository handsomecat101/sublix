# Sublix

> **Real-time subtitle overlay for any video, in any language.**

Sublix là một Windows desktop app nhỏ gọn, lắng nghe bất kỳ audio nào đang phát trên máy tính (VLC, browser, Zoom, bất kỳ player nào) và hiển thị phụ đề dịch theo thời gian thực dưới dạng overlay nổi trên video.

---

## 🎬 Use cases

- Xem phim Nhật down về với phụ đề tiếng Việt real-time
- Xem YouTube lecture tiếng Anh với phụ đề tiếng Việt real-time
- Xem Zoom meeting của khách nước ngoài với phụ đề dịch
- Bất kỳ video nào, bất kỳ ngôn ngữ nào → phụ đề ngôn ngữ của mình

---

## ✨ Tại sao Sublix

- **Universal** — Không cần tích hợp từng video player. Capture audio hệ thống, hoạt động với VLC, mpv, browser, mọi thứ.
- **Real-time** — Latency ~3 giây, đủ mượt để xem phim.
- **Hybrid** — Whisper local (offline, miễn phí) + Deepgram/GPT cloud (nhanh hơn, trả phí nhỏ).
- **Polished** — Overlay always-on-top, click-through, kéo thả vị trí, dark mode, đa ngôn ngữ.
- **Nhẹ** — Tauri binary ~10MB, RAM thấp hơn Electron 5-10 lần.

---

## 📊 Trạng thái

🚧 **M0 done. Đang chuẩn bị M1 (audio capture).**

| Milestone | Mô tả | Trạng thái |
|---|---|---|
| M0 | Scaffold + hello world | ✅ Done (2026-08-16) |
| M1 | Capture system audio (WASAPI) | ⏳ Next |
| M2 | STT pipeline (Whisper + VAD) | ⏳ |
| M3 | Translation (GPT-4o-mini) | ⏳ |
| M4 | Overlay UI (always-on-top) | ⏳ |
| M5 | Polish + installer | ⏳ |
| M6 | Ship v1.0.0 | ⏳ |

Xem chi tiết timeline trong **[PLAN.md](./PLAN.md)**.

---

## 🛠 Tech stack (chốt)

- **App framework**: Tauri v2 + Rust
- **Frontend**: React 19 + TypeScript + Tailwind
- **Audio capture**: WASAPI loopback (Windows)
- **STT local**: whisper.cpp (large-v3) — nhờ GPU NVIDIA
- **STT cloud**: Deepgram Nova-3 (opt-in)
- **Translation**: GPT-4o-mini (opt-in) + Google Translate (free fallback)
- **Overlay**: Tauri window (transparent, always-on-top, click-through)

Xem research evidence trong **[docs/research.md](./docs/research.md)**.

---

## 📁 Cấu trúc project

```
sublix/
├── README.md              # File này
├── PLAN.md                # Implementation plan chi tiết
├── AGENTS.md              # Hướng dẫn cho AI agents
├── DEV-LOG.md             # Chronological dev log (Mavis viết)
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/                   # React frontend
│   ├── App.tsx
│   ├── main.tsx
│   └── assets/
├── src-tauri/             # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── icons/
│   └── src/
│       ├── main.rs
│       └── lib.rs
├── docs/
│   ├── research.md        # Tech research evidence
│   ├── decisions.md       # Decision log
│   ├── architecture.md    # (M1+)
│   └── PRD.md             # (M5)
├── models/                # Whisper model files (gitignored)
└── scripts/               # Dev/build scripts
```

---

## 🚀 Development

### Prerequisites
- **Node.js** ≥ 18 (verified: v24.14.0)
- **Rust** ≥ 1.70 (verified: 1.94.1)
- **VS Build Tools** với C++ support (verified: 2019/2022 + MSVC 14.29)
- **WebView2 Runtime** (verified: 151.x)
- **NVIDIA GPU** cho Whisper large-v3 real-time

### Setup
```powershell
# Cài frontend deps
npm install

# Chạy dev mode (sẽ compile Rust ~2-5 phút lần đầu)
npm run tauri dev
```

### Build production
```powershell
# Build installer (.msi cho Windows)
npm run tauri build
# Output: src-tauri/target/release/bundle/msi/Sublix_0.1.0_x64_en-US.msi
```

### Build frontend only (no Rust)
```powershell
npm run build
```

---

## 📜 License

TBD — quyết sau khi scope rõ ràng (personal vs open source vs commercial).

---

*Tên "Sublix" = subtitle + helix/flow, gợi cảm giác trôi chảy real-time.*
