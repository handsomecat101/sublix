# CHANGELOG — Sublix

> Lịch sử phát hành Sublix theo trục thời gian (mới nhất ở trên).
> Mỗi version được bump theo [SemVer](https://semver.org/):
> - **major** — breaking change kiến trúc lớn
> - **minor** — fix bug quan trọng hoặc tính năng mới đáng kể
> - **patch** — fix nhỏ, polish UI, refactor không phá API
>
> Phiên bản hiển thị trong UI là `v{major.minor}` (bỏ patch).

---

## v0.9.0 — 2026-10-06
### Sửa Lỗi Quan Trọng: YouTube Download Hoạt Động Trở Lại
- Phát hiện root cause: **yt-dlp 2024.10+ yêu cầu JS runtime (Node.js/Deno) + remote challenge solver** để bypass YouTube anti-bot. Sublix chưa pass 2 flag này nên **mọi URL YouTube fail im lặng** (return `"n challenge solving failed"` → 0 bytes).
- Helper mới `find_js_runtime()` trong `src-tauri/src/downloader/mod.rs` tự động phát hiện `node` hoặc `deno` trên PATH (qua `where node.exe` trên Windows, `which node` trên Unix).
- Auto pass `--js-runtimes <runtime>:<path>` + `--remote-components ejs:github` khi tải video YouTube — script solver được tải từ GitHub ở lần đầu, cache lại cho lần sau.
- Áp dụng cho cả `start_download` (kèm nhánh retry cookie fallback) và `fetch_video_info` (inspect metadata) — nên "Kiểm Tra Link" cũng work trên YouTube.
- **Verified thủ công bằng CLI**: 11.28 MB Rick Astley tải về trong ~1 giây.

### Competitive Analysis với 4 Repo Voice/Dubbing
- Nghiên cứu sâu 4 đối thủ trên GitHub: **VoiceStudio** (53k⭐, Python+Electron, AGPL), **dub-studio** (Tauri giống Sublix, native C++ engines), **YouDub-webui** (FastAPI+Next.js, production với tác giả 1M+ subs), **ZastTranslate** (Python Gradio, 33 ngôn ngữ + Viral Shorts).
- Phát hiện Sublix có 3 điểm **UNIQUE**:
  1. **Đa engine song song** (Qwen 3 GPU local + MiniMax-M3 Cloud) — chưa ai làm
  2. **1-click pipeline bridges** (Downloader → File Sub → Dubbing Studio) — chưa ai làm
  3. **Downloader đa nền tảng** (9 site: YT/TT/Douyin/Bili/FB/X/IG/Vimeo/Reddit) — chỉ Sublix có
- Gợi ý **Roadmap P0**: Voice DESIGN (text → voice), MCP server cho AI agents, multi-TTS engine swap.
- Tài liệu đầy đủ tại `agent-team/COMPETITIVE_ANALYSIS.md` (15KB, 9 phần).

### File thay đổi
- `src-tauri/src/downloader/mod.rs` — +116 dòng (helper `find_js_runtime` + 2 call sites)
- `src/views/ChangelogModal.tsx` — thêm entry v0.9.0
- `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` — bump 0.8.0 → 0.9.0
- `agent-team/COMPETITIVE_ANALYSIS.md` — file mới

### Verify
- `cargo check` ✅ 0 warnings (4.11s)
- `npm run build` ✅ 364 KB JS / 80 KB CSS (1.17s)
- `cargo test --lib find_ytdlp_binary` ✅ PASS
- yt-dlp CLI test thật với flags mới ✅ **PASS (Rick Astley 11.28 MB)**

### Cần cho lần tới
- **Nếu máy không có Node.js**: cài https://nodejs.org (Node 18+) hoặc `irm https://deno.land/install.ps1 | iex` (cho Deno). Không có runtime → yt-dlp vẫn in warning và thử các site không cần bypass.

---

## v0.8.0 — 2026-10-04
### Nhận Diện Thị Giác AI & Bộ Minh Hoạ Điện Ảnh
- Logo mới: chữ S kết từ dải phim điện ảnh, kèm bộ icon ứng dụng trọn bộ cho taskbar & cửa sổ.
- Ảnh hero rạp chiếu phim ấm áp cho màn cài đặt đầu tiên (Onboarding).
- Bộ minh hoạ phẳng phong cách điện ảnh: khung chọn file, Trung tâm Models, lịch sử trống.
- Vân phim mờ tinh tế phủ trên sidebar ở theme Cinema & Studio.
- Tối ưu dung lượng ảnh từ 4.4 MB xuống còn 184 KB, app nhẹ và khởi động nhanh hơn.
- Hỗ trợ Kéo & Thả (Drag & Drop) tệp Video / Audio trực tiếp từ máy tính vào ứng dụng qua Tauri Native Webview API.
- Thay thế toàn bộ hộp chọn native Windows cũ bằng Custom Glass Select sang trọng.

---

## v0.7.0 — 2026-10-04
### Đại Tu Giao Diện Cinema Studio & AI Dubbing Đa Vai
- Bổ sung 4 phong cách giao diện: Cinema, Studio, Light, Vibrant.
- Bộ chọn Theme nhanh với nút chuyển đổi tức thì, tự động ghi nhớ cấu hình khi khởi động lại.
- Chuẩn hóa toàn bộ màu sắc sang Design Tokens (CSS Variables), thanh cuộn siêu mỏng tinh tế.
- Tách giọng gốc sạch 100% bằng Demucs v4 CUDA GPU.
- Tự động nhận diện phân vai diễn viên qua kịch bản ngữ cảnh MiniMax M3.
- Bộ giọng đọc Neural siêu tự nhiên (Edge-TTS) + tự động co giãn tốc độ (FFmpeg atempo).

---

## v0.6.0 — 2026-10-04
### Nâng Cấp CUDA RTX 3090 & Local LLM Translation
- Tích hợp Whisper Large-v3-Turbo Q8 (874MB) chạy trực tiếp trên GPU CUDA.
- Hỗ trợ Local Qwen 3 4B model cho dịch thuật offline, tốc độ ~0.1s/câu.

---

## v0.5.0 — 2026-10-03
### WASAPI Loopback Zero-Gap & Smart VAD
- ...

(Sửa lỗi Critical YouTube download, Competitive Analysis, bump version)

---

## Quy ước phát hành
- Mỗi commit sửa code (fix bug, feature, UI polish) **PHẢI**:
    1. Bump version `major.minor.patch` trong `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
    2. Thêm entry vào `CHANGELOG_DATA` trong `src/views/ChangelogModal.tsx`
    3. Thêm entry tương ứng vào `CHANGELOG.md` (file này)
- **minor** cho fix/feature đáng kể, **patch** cho nhỏ.
- Commit thay đổi version + CHANGELOG trong commit riêng (tách khỏi commit code).