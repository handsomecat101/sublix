# SOUL.md — Sublix Project Identity & Architecture

> Định nghĩa "Tâm Hồn" & Kiến Trúc Bất Biến của Sublix — AI Agents đọc file này để hiểu trọn vẹn dự án.

---

## 🏛️ Project Identity

| Field | Value |
|-------|-------|
| **Project Name** | **Sublix** |
| **Version** | `v0.6.0` |
| **Type** | Windows Native Desktop Application (Transparent Overlay + AI Studio) |
| **Core Goal** | Bắt âm thanh hệ thống thời gian thực (WASAPI loopback) ➔ Nhận diện giọng nói (Whisper CUDA) ➔ Dịch thoại điện ảnh (MiniMax-M3 / Ollama 27B) ➔ Hiển thị Overlay trong suốt & Tự động Lồng tiếng AI đa vai. |
| **Workspace** | `H:/AI Project/sublix` |
| **Repository** | `https://github.com/handsomecat101/sublix.git` (Branch: `master`) |
| **Lead Developer / PO** | **Anh Tuấn (`jimmyvu`)** |

---

## 🛠️ Tech Stack & AI Engine Matrix

| Tầng | Công nghệ / Thư viện | Chi tiết cấu hình |
|------|----------------------|-------------------|
| **App Framework** | Tauri v2 (Rust backend + Webview2 frontend) | Standalone release, no localhost browser dependency |
| **Frontend** | React 19 + TypeScript 5.8 + Vite 7.3 | Strict TS, Tailwind/CSS custom styles |
| **Audio Capture** | Windows WASAPI Loopback (`cpal` / native win32) | 16kHz mono PCM resampling |
| **VAD (Voice Activity)** | Energy / Silero VAD heuristic | Chunk length: 2s – 3s |
| **STT Engine (Local)** | `whisper.cpp` (CUDA / cuBLAS) | Model: `ggml-large-v3-turbo-q8_0.bin` (0.08s – 0.15s/chunk trên RTX 3090) |
| **Dịch & Biên Kịch (Cloud)** | **MiniMax Cloud API (Token Plan `sk-cp-`)** | Endpoint: `https://api.minimax.io/v1/chat/completions`<br>Model: `MiniMax-M3`<br>Tham số: `reasoning_split: true`, 0% VRAM GPU |
| **Dịch & Biên Kịch (Local)** | **Ollama Local** | Endpoint: `http://localhost:11434`<br>Model: `smtek/qwen3.8-27b:q4_k_m` (~17GB VRAM) |
| **Dịch nhúng cục bộ** | `llama-server.exe` (cuBLAS) | Port `8080`, Model: `Qwen2.5-3B-Instruct` |
| **AI Dubbing Pipeline** | Spec SOTA 2025–2026 (`docs/SPEC_AI_DUBBING_AND_LLM.md`) | Demucs v4 (Vocal separation), Sherpa-ONNX (Diarization), F5-TTS / Kokoro (TTS), FFmpeg (`atempo`) |

---

## 🔒 Quy Tắc Kỹ Thuật Bất Biến (Invariant Rules)

1. **Rust Production Code**:
   - **TUYỆT ĐỐI KHÔNG dùng `unwrap()`** trong production code. Phải dùng `?` hoặc `.context("...")` qua `anyhow`.
   - Mọi log ghi qua `tracing` (`info!`, `warn!`, `error!`), không dùng `println!`.
   - Async runtime: `tokio` (tích hợp sẵn trong Tauri).
2. **MiniMax Coding Plan Gateway**:
   - Key có tiền tố `sk-cp-` bắt buộc phải trỏ về `https://api.minimax.io/v1/chat/completions` (trỏ sang `api.minimax.chat` sẽ bị lỗi 401).
   - Luôn kèm `reasoning_split: true` và bóc tách thẻ `<think>` để không làm ô nhiễm phụ đề.
3. **Mã hóa chuỗi (Encoding)**:
   - Toàn bộ chuỗi trong backend Rust là UTF-8 chuẩn. Khi test lệnh bằng PowerShell, tránh piping trực tiếp chuỗi CJK/tiếng Việt vì PowerShell ANSI làm hỏng ký tự thành dấu `????`.
4. **Quản lý Tiến trình (Process Lifecycle)**:
   - Trước khi rebuild bản Release (`sublix.exe`), luôn kiểm tra và đóng tiến trình cũ đang chạy để tránh lỗi *Access is denied (os error 5)*.
