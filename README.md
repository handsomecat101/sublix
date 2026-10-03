# Sublix v0.6.0 🎬

> **100% Local AI Subtitle Studio & Real-time Live Overlay for Windows**  
> *Tạo phụ đề cho video và dịch phụ đề trực tiếp thời gian thực — 100% Offline, Riêng tư, Hỗ trợ mọi cấu hình máy tính (CPU / GPU).*

[![Version](https://img.shields.io/badge/version-0.6.0-blue.svg)](https://github.com)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d4.svg)](https://github.com)
[![Rust](https://img.shields.io/badge/Rust-Tauri%20v2-orange.svg)](https://tauri.app)
[![Hardware](https://img.shields.io/badge/Hardware-CPU%20%7C%20CUDA%20GPU-green.svg)](https://nvidia.com)
[![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)](LICENSE)

---

## 🌟 Điểm Nổi Bật (Key Features)

### 1. 📁 Tạo Phụ Đề Cho File Media (File Subtitle Studio)
- Thêm file Video hoặc Audio bất kỳ (`.mp4`, `.mkv`, `.avi`, `.mov`, `.mp3`, `.m4a`, `.wav`, `.flac`).
- Tự động nhận diện giọng nói (Speech-to-Text) và dịch sang tiếng Việt bằng mô hình AI Local.
- Xuất file phụ đề chuẩn `.srt` với 2 tuỳ chọn:
  - **Phụ đề Tiếng Việt**: Gọn gàng, dễ xem.
  - **Phụ đề Song Ngữ (Bilingual)**: Dòng 1 tiếng gốc, dòng 2 tiếng Việt (rất tốt để học ngoại ngữ).
- Nút bấm tiện lợi: **Mở thư mục chứa file** và **Phát ngay bằng VLC Player** (tự động load kèm file phụ đề vừa tạo).

### 2. 🎙️ Dịch Trực Tiếp Thời Gian Thực (Live Subtitle Overlay)
- Bắt trực tiếp luồng âm thanh phát ra từ hệ thống máy tính qua Windows WASAPI Loopback (không phụ thuộc vào loại video player, trình duyệt web hay ứng dụng họp trực tuyến Zoom/Teams).
- Cửa sổ phụ đề trong suốt nổi trên màn hình (**Always-on-top**), hỗ trợ chế độ xuyên thấu chuột (**Click-through**) để người dùng thoải mái thao tác với video bên dưới.

### 3. 🔇 Bộ Lọc Chống Ảo Giác 3 Lớp (Anti-Silence Hallucination)
- Loại bỏ hoàn toàn hiện tượng Whisper tự sinh phụ đề nhảm nhí khi phim im lặng (lỗi "Chúc ngủ ngon", "Oyasuminasai", "Cảm ơn đã xem", v.v.).
- Tích hợp phát hiện năng lượng âm thanh thông minh (VAD) và bộ lọc từ điển outro đa ngôn ngữ (Nhật, Anh, Việt).

### 4. ⚡ Hỗ Trợ Đa Dạng Phần Cứng (CPU & GPU Multi-Tier)
Sublix v0.6.0 được thiết kế cho cộng đồng người dùng rộng rãi, không giới hạn riêng cấu hình nào:
- 💻 **Laptop / PC Văn Phòng (Pure CPU)**: Dành cho máy không có card đồ hoạ rời NVIDIA. Sử dụng Whisper `base` + Qwen2.5-1.5B chạy đa luồng CPU, mượt mà và nhẹ máy.
- ⚡ **PC Gaming Phổ Thông (GPU 4GB – 8GB VRAM)**: Tối ưu cho GTX 1650, 1660, RTX 2060, 3050, 3060 6GB, 4050, 4060. Whisper `base` + Qwen2.5-3B chạy CUDA, tốc độ ~0.1s.
- 🚀 **PC Đồ Hoạ / Flagship (GPU 12GB – 24GB VRAM)**: Tối ưu cho RTX 3060 12GB, 3080, 3090, 4080, 4090. Nhận diện Whisper `large-v3-turbo-q8_0` + Qwen3-4B / Qwen3-8B Cinema Pro văn phong điện ảnh chuyên nghiệp.

### 5. 📦 Trung Tâm Tải Model 1-Click (Built-in Model Hub)
- Người dùng mới tải app không cần phải tự tìm kiếm link model hay cấu hình phức tạp.
- Giao diện tích hợp sẵn danh mục model từ Hugging Face CDN.
- Hiển thị trực quan dung lượng, trạng thái và thanh tiến trình download `%` trực tiếp theo thời gian thực mà không làm đơ giao diện.

---

## 💻 Bảng Đề Xuất Cấu Hình (Hardware Presets)

| Cấu hình | Phần cứng khuyến nghị | STT Model | Translation Model | Engine | VRAM / RAM |
|---|---|---|---|---|---|
| **💻 Thuần CPU** | Mọi Laptop, PC văn phòng không card NVIDIA | `base` (140MB) | `qwen2.5-1.5b` (1.1GB) | CPU Multi-thread | ~3GB RAM |
| **⚡ GPU Phổ Thông** | GTX 1650/1660, RTX 2060, 3050, 3060 6G, 4050, 4060 | `base` / `small` (465MB) | `qwen2.5-3b` (2.0GB) | CUDA GPU | 4GB – 8GB VRAM |
| **🚀 GPU Khủng** | RTX 3060 12G, 3080, 3090, 4080, 4090 | `large-v3-turbo-q8_0` (874MB) | `qwen3-4b` / `qwen3-8b` | CUDA GPU | 12GB – 24GB VRAM |

---

## 🚀 Cài Đặt & Khởi Chạy (Quick Start)

### Dành cho người dùng thông thường:
1. Tải bản release Sublix mới nhất từ GitHub.
2. Giải nén vào thư mục bất kỳ trên máy tính.
3. Chạy file `Chay-Sublix.bat` hoặc biểu tượng `Sublix.lnk` trên Desktop.
4. Mở tab **⚙️ AI Models & Cài Đặt Hệ Thống**, chọn cấu hình máy tính của bạn và bấm tải model về máy (chỉ cần tải 1 lần đầu tiên).

### Dành cho lập trình viên (Build from source):

#### Yêu cầu:
- Windows 10/11 64-bit
- [Node.js](https://nodejs.org/) ≥ 18
- [Rust & Cargo](https://rustup.rs/) (MSVC toolchain)
- (Tuỳ chọn nếu có GPU) NVIDIA CUDA Toolkit 12.x / driver mới nhất.

#### Các bước build:
```bash
# 1. Clone repository
git clone https://github.com/your-username/sublix.git
cd sublix

# 2. Cài đặt dependencies frontend
npm install

# 3. Chạy chế độ development
npm run dev

# 4. Build bản phát hành (Windows Desktop App)
npx tauri build --no-bundle
```

File thực thi sau khi build nằm tại:
`src-tauri/target/release/sublix.exe`

---

## 📁 Cấu Trúc Dự Án (Architecture)

```
sublix/
├── src-tauri/                     # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── audio/                 # WASAPI audio capture & VAD
│   │   ├── stt/                   # whisper.cpp (CLI + long-running whisper-server)
│   │   ├── translate/             # llama.cpp (llama-server + Qwen/Gemma GGUF)
│   │   ├── file_sub.rs            # Xử lý tạo phụ đề SRT cho file media
│   │   ├── config.rs              # Quản lý cấu hình người dùng
│   │   └── lib.rs                 # Tauri commands & event pipeline
│   ├── Cargo.toml                 # Rust dependencies
│   └── tauri.conf.json            # Cấu hình cửa sổ Tauri v2
├── src/                           # Frontend (React 19 + TypeScript + Vite)
│   ├── views/
│   │   ├── FileSubView.tsx        # Giao diện tạo phụ đề cho file
│   │   ├── SettingsView.tsx       # Cài đặt, Hardware Presets & Model Hub
│   │   └── OverlayView.tsx        # Cửa sổ phụ đề nổi Always-on-top
│   └── lib/
│       └── tauri.ts               # Type-safe IPC invoke & events
├── package.json
└── README.md
```

---

## 🔒 Bản Quyền & Giấy Phép (License)

Dự án được phát hành dưới giấy phép [MIT License](LICENSE).  
Phát triển bởi **Anh Tuấn** & trợ lý AI **Antigravity**.
