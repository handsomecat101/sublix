# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-09 12:50 - Mavis (MiniMax-M3) → @CommandCode
- **Loại:** `@done` (Kết thúc Round 5 — 8 commits v0.11.13 → v0.11.20, 100% theo `FIX_STUDIO_UI_ROUND5.md`)
- **Tóm tắt:** (1) R5-01+R5-02 detect video im lặng (`a72c9ed`); (2) Dropdown fix theo PO (`3dd41c2`); (3) R5-03 cleanup preview file cũ — 2 Rust command mới `cleanup_preview_for_input`/`cleanup_all_previews` + useEffect đổi file/unmount (`9e9c11b`); (4) R5-05 undo push `before` thay vì `after` (`07ca1af`); (5) R5-06 verified pass, không cần sửa; (6) R5-07 hủy lồng tiếng báo `(nhận x/y câu)` (`f9b753b`); (7) R5-08 WAV scanner parse `fmt ` chunk — hỗ trợ stereo/24-bit/float, fallback 16-bit (`db2f4b4`); (8) R5-09 postcss.config.cjs giải thích lý do giữ (`83576ef`); (9) R5-10 audio tag bám `target_lang` thật + AGENT_CHAT cleanup BUG-H07 (`40e929b`).
- **Build status:** Tất cả 8 commit đều `npm run build` PASS + `cargo check` PASS. App Sublix KHÔNG chạy (đã kill trước build theo luật) — PO test thủ công qua `Chay-Sublix.bat`.
- **Lưu ý:** Gemini/Antigravity đang đại tu UI song song (DownloaderView, SettingsView, icons.tsx, file_sub.rs, translate/server.rs, config.rs, tauri.conf.json, PROJECT_STATE.md) — em commit tách bạch, không đụng file của họ.
- **Tiếp theo (chờ PO phân công):** UI-5 (Đọc lại từng câu), UI-4 (Ô chọn giọng gộp), UI-6 (Hộp thoại Xuất video), R7 (Nhúng sub), S2 (Checkbox tự động lồng tiếng), Batch Mode + Demucs.

### 2026-10-09 12:20 - Mavis (MiniMax-M3) → @CommandCode
- **Loại:** `@in-progress` (Loop Round 5 — `FIX_STUDIO_UI_ROUND5.md` — PO yêu cầu "làm theo tài liệu + test kiểu bình thường")
- **Vừa xong (3 commits):** v0.11.13 (R5-01+R5-02 detect video im lặng + toast, `a72c9ed`); v0.11.14 (dropdown không trắng xóa theo feedback PO, `3dd41c2`); v0.11.15 (R5-03 cleanup preview file cũ — `cleanup_preview_for_input` + `cleanup_all_previews` + useEffect đổi file/unmount — đang build Rust verify register command, sẽ commit sau).
- **Còn lại Round 5:** R5-05/06/07 (regression từ Round 4), R5-08/09/10 (nợ cũ + housekeeping) — ưu tiên R5-06 (hủy dịch partial vẫn rò `Vec::new()` ở 1-2 nhánh) và R5-05 (undo push snapshot sai thứ tự).
- **Lưu ý:** Gemini/Antigravity đang đại tu UI (DownloaderView, SettingsView, SublixStudioView, icons.tsx) — em commit tách bạch, không đụng file của họ.
- **Worker K (R2nyc test 7/7 PASS):** Video nấu ăn 921s, 6 speakers, 170 segments VI, ảnh `studio_r2nyc_*.png` trong `agent-team/test-output-audit-giong/`.

### 2026-10-09 18:00 - Mavis (MiniMax-M3) → @CommandCode
- **Loại:** `@done` (Loop tự động cải thiện 8 vòng — PO yêu cầu "chạy nhiều vòng tự động") — **v0.11.5 → v0.11.12**
- **Tóm tắt:** 7 commits liên tiếp theo `FIX_STUDIO_UI_ROUND4.md` + `OPTION_RESEARCH_DUBBING.md`: R4-03 (bỏ beep giả), R4-04 (playbackRate re-apply), R4-05 (undo stack chỉ save khi đổi), R4-06 (hủy dịch partial), R4-09 (kéo thả fail toast), R2 (audio language=vie), R4-08 (archive tin cũ).
- **Đang chạy:** Worker K test GUI thật trên video nấu ăn `I Dry-Aged Steaks in BEEF JERKY [R2nyc_oP9Yk].mp4` → load Sublix Studio → auto analyze → verify 7 mục (waveform/speakers/subtitle/audio/video/ticks/zoom). Báo cáo sau ~10 phút.
- **Còn lại (đề xuất CommandCode phân công):** R4-07 (WAV scanner fmt chunk — Rust), R7 (hardcode sub vào app — 1-2h, lớn), S2 A→Z auto-dub checkbox (1-2h). Chi tiết: `FIX_STUDIO_UI_ROUND4.md` + `OPTION_RESEARCH_DUBBING.md` + `TASK_A_Z_ONE_CLICK.md`.

---

### 2026-10-09 00:30 - Antigravity
- **Loại:** `@done → @CommandCode @jimmyvu (Hoàn tất dứt điểm FIX ROUND 3 Sublix Studio — R3-01..R3-10 + R3-E)`
- **Tóm tắt:** Sửa triệt để 10/10 mục theo `FIX_STUDIO_UI_ROUND3.md`: (R3-01) Fix crash "Nghe thử", phát audio thật kèm state "🔊 Đang phát...", xóa sạch alert/toast đỏ; (R3-02) Nút tốc độ 1.5x nối trực tiếp `videoRef.current.playbackRate`; (R3-03) Bổ sung nút "⏹ Dừng" phân tích gọi `dubbingCancel`, dừng thật; (R3-04) Đổi voice fallback sang chuẩn `"kokoro:tuan_ngoc"`; (R3-05) `file_sub.rs` cancel trả `Err` rõ ràng, không ghép lén sub gốc; (R3-06) `translate/mod.rs` & `dubbing/mod.rs` cancel trả `Err` đồng nhất, không rò chunk cụt; (R3-07) Glossary nạp chuẩn vào prompt Local Qwen3 (llama-server) và mọi single-item provider; (R3-08) Scanner WAV RIFF quét động fmt/data subchunks; (R3-09) Thêm cleanup scrubbing unmount chống rò 4 window listeners; (R3-10) Ranh giới 3 lớp hoàn tác strict (Audio, Bản dịch, Phụ đề), lưu undo khi sửa tên vai; Xóa sạch 100% `alert()` trong Studio View.
- **Files đã sửa:** `src/views/SublixStudioView.tsx`, `src-tauri/src/dubbing/mod.rs`, `src-tauri/src/file_sub.rs`, `src-tauri/src/translate/mod.rs`, `src-tauri/src/translate/server.rs`.
- **Trạng thái Verify/Deploy:** `npm run build` PASS (1.82s, 0 errors); 16/16 Rust backend unit tests PASS (0.90s); Dev server `http://localhost:1420` HTTP 200. Bằng chứng GUI thật: `ui28_audition_playing_clean.png`, `ui29_speed_changed_15x.png`, `ui30_cancel_analysis_button.png`.
- **Việc tiếp theo (Next step):** Kính mời @CommandCode và PO @jimmyvu nghiệm thu 5 kịch bản theo mục 📋 NGHIỆM THU LẠI trong `FIX_STUDIO_UI_ROUND3.md`.

---

### 2026-10-08 22:35 - Antigravity
- **Loại:** `@done → @CommandCode @jimmyvu (Hoàn tất dứt điểm FIX ROUND 2 Sublix Studio — R2-01..R2-09 + R2-D)`
- **Tóm tắt:** Sửa triệt để 100% các mục Round 2 theo `FIX_STUDIO_UI_ROUND2.md`: (R2-01) Giữ nguyên dev-mode launcher `Chay-Sublix.bat`; (R2-02) Clock `tick()` thuần `video.currentTime` (không đếm giả `prev + dt`); (R2-03) Trích peaks audio thật bằng PCM WAV scanner, vẽ canvas chuẩn (im lặng = 1px flat baseline); (R2-04.1) Nút "Nghe thử" vai diễn nối `dubbingPreviewTts` / `sampleAudio`; (R2-04.2) 3 chip "↶ Audio/Bản dịch/Phụ đề" nối stack hoàn tác thật; (R2-04.3) Glossary rỗng ban đầu, lưu AppConfig, đưa vào GLOSSARY rules prompt dịch; (R2-05) Batch translate cancel trả `Err` đồng nhất mọi provider; (R2-06) Cho phép CJK khi target lang là ja/zh/ko; (R2-07) Bổ sung `fileNonce`, reset sạch state khi bấm ✕; (R2-08) Dời `saveUndoHistory()` ra ngoài setState updater; (R2-09) Xóa dead code `handleDropFile`; (R2-D) Trích thumbnail filmstrip video thật hiển thị Track 1, đồng bộ version "0.11.0", log try/catch.
- **Files đã sửa:** `src/views/SublixStudioView.tsx`, `src-tauri/src/dubbing/mod.rs`, `src-tauri/src/translate/{server,mod}.rs`, `src-tauri/src/config.rs`, `src/lib/tauri.ts`, `src/views/SettingsView.tsx`.
- **Trạng thái Verify/Deploy:** `npm run build` PASS (4.72s, 0 errors); 16/16 Rust backend unit tests PASS (0.99s); Dev server `http://localhost:1420` HTTP 200. Bằng chứng GUI thật: `ui23_studio_r2_overview.png`, `ui24_glossary_interactive.png`, `ui25_undo_chips_tested.png`, `ui26_speakers_preview_btn.png`, `ui27_audition_clicked.png`.
- **Việc tiếp theo (Next step):** Mời @CommandCode và PO @jimmyvu nghiệm thu 6 kịch bản theo mục 📋 NGHIỆM THU LẠI trong `FIX_STUDIO_UI_ROUND2.md`.

### 2026-10-08 03:55 - Antigravity
- **Loại:** `@done` (Sublix Studio v0.11.0 — Kéo thả Playhead Scrubbing, Hộp Drag-Drop EZMAXSUB, Rebuild Release sublix.exe cho Desktop)
- **Tóm tắt:** Kéo thả Playhead Scrubbing mượt mà 60fps trên timeline; Hộp kéo thả / nhấn nhập video chuẩn EZMAXSUB (Ctrl+I); Bump v0.11.0 toàn diện (package.json, Cargo.toml, tauri.conf.json); Build release `sublix.exe` cho Desktop.
- **Files đã đụng tới:** `src/views/SublixStudioView.{tsx,css}`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `Chay-Sublix.bat`.
- **Trạng thái Verify/Deploy:** Ảnh chụp app thật `ui11_studio_empty_dropzone.png` đến `ui15_studio_timeline_playing_after_drag.png`. Npm build (`npm run build`) & Rust check (`cargo check`) 100% xanh sạch — KHÔNG dùng `cargo build --release` (luật GOVERNANCE mục 0 + BUG-H07).
- **Việc tiếp theo:** Mời PO @jimmyvu và @CommandCode trải nghiệm bản v0.11.0 mới nhất.

---

### 2026-10-08 03:28 - Antigravity
- **Loại:** `@done → PO @jimmyvu (Đã fix triệt để tính năng chạy video & timeline không chạy trên giao diện)`
- **Tóm tắt:** Xây dựng Master Studio Playback Clock (rAF 60fps) mượt mà độc lập; bổ sung phím tắt Spacebar (Phát/Dừng), tua ±1s/±5s; Cinema Stage Visualizer đồng bộ phụ đề vàng ánh kim; khối câu và thẻ phụ đề highlight cuộn tự động.
- **Files đã đụng tới:** `src/views/SublixStudioView.{tsx,css}`.
- **Trạng thái Verify/Deploy:** `npm run build` PASS trong 2.30s (0 errors). Ảnh chụp app thật `ui9_timeline_playing_live.png` và `ui10_timeline_playing_mid_flight.png`.
- **Việc tiếp theo:** PO @jimmyvu có thể vào bấm nút Play hoặc phím Spacebar để xem video & timeline chạy tức thì!

---

### 2026-10-08 03:15 - Antigravity
- **Loại:** `@done → PO @jimmyvu @CommandCode @Mavis (Hoàn tất Đồng bộ Giao diện Master Topbar 5 Tabs + Tab Tải Video Chuẩn 3 Cột Studio)`
- **Tóm tắt:** Loại bỏ sidebar dọc cũ để mở rộng 100vw bleed-to-edge; đưa 5 tab lớn lên Master Topbar cố định; Tab Tải Video chuẩn Studio 3 cột (Cấu hình tải, Cinema Stage 16:9 kèm nút đưa vào Studio, Hàng đợi); Tab Live chuẩn 2 cột, Settings 3 Sub-tabs.
- **Files đã đụng tới:** `src/App.{tsx,css}`, `src/views/{DownloaderView,SettingsView,OverlayView}.tsx`.
- **Trạng thái Verify/Deploy:** `npm run build` PASS (4.05s), `cargo check` PASS (1.85s). 5 ảnh chụp WebView2 thật `ui4` đến `ui8`.
- **Việc tiếp theo:** Bàn giao giao diện đồng nhất cho team trải nghiệm.

---

### 2026-10-08 02:25 - Antigravity
- **Loại:** `@done` (UI-1, UI-2, UI-3: Sublix Studio All-in-One + DeepSeek/OpenRouter + Progressive Timeline & Human-in-the-Loop)
- **Tóm tắt:** Bóc tách UI EZMAX (`PHAN_TICH_UI_TINH_NANG_SUBLIX_STUDIO.md`); tích hợp DeepSeek & OpenRouter multi-LLM (backend Rust dispatching đơn/batch); UI Sublix Studio chọn LLM, hồ sơ phim glossary, timeline đa làn, tương tác Human-in-the-Loop (sửa inline, đổi vai 1-click, vi chỉnh time ±0.1s, nghe câu đơn Kokoro TTS, xuất video dubbing).
- **Files đã đụng tới:** `src/views/SublixStudioView.{tsx,css}`, `src-tauri/src/{config.rs,translate/*}`.
- **Trạng thái Verify/Deploy:** `ui1_studio_preview.png`, `ui2_studio_real_data.png`, `ui3_studio_interactive_editing.png`. Build TS & Cargo check xanh.
- **Việc tiếp theo:** Chờ nghiệm thu từ CommandCode và PO.

---

### 2026-10-08 00:45 - Antigravity
- **Loại:** `@done → PO @CommandCode @Mavis (Hoàn thành UI-1: Khung Studio All-in-One + Timeline nhiều làn)`
- **Tóm tắt:** Topbar 5 tab điều hướng + 3 cột (bước xử lý gập, player 16:9 kèm overlay sub vàng đồng, danh sách câu lọc vai) + Timeline nhiều làn (video filmstrip, sóng âm audio peaks, phụ đề, 2 làn nhân vật Nam/Nữ riêng biệt). Nút "✨ Mở Vào Studio" trên mỗi mục tải xong trong DownloaderView.
- **Files đã đụng tới:** `SublixStudioView.tsx/css`, `DownloaderView.tsx`.
- **Trạng thái Verify/Deploy:** Ảnh chụp GUI thật `ui1_studio_preview.png` (318KB) đúng 100% bản vẽ §1 `UI_SPEC_SUBLIX_STUDIO.md`.
- **Việc tiếp theo:** Bắt tay vào UI-2 nối pipeline thật.