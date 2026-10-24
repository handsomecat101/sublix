# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.


## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-24 21:05 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-TIMELINE-INTEGRATE-MODULES` — đã **GẮN** 6 module timeline vào `SublixStudioView.tsx`; chưa commit).
- **Đã gắn:** timecode (ô nhập Enter nhảy tới, clamp, sai định dạng → viền đỏ) · copy/paste `Ctrl+C`/`Ctrl+V` (dán tại playhead, id mới, báo xung đột **KHÔNG** tự xoá) · auto-follow page-scroll khi phát (tạm ngưng 1.5s sau khi cuộn tay) · J/K/L (L 1→2→4→8x, J tự seek lùi ≤15 lần/s, K+L nhích 1 frame) · marker M/Shift+M/Ctrl+Shift+M (vạch memo, lưu project cache) · khoá track (🔒 cạnh nút M, chặn move/trim/split/delete/sửa chữ/dán).
- **Sửa thiết kế sau review coordinator:** `TimecodeInput` **không** nhận prop `seconds` đổi liên tục — file cha giữ `timecodeElementRef` ghi DOM trực tiếp, giá trị hiện tại đọc qua `getSeconds()` ổn định; đã bỏ hằng số thừa `MAX_FRAME_INDEX`.
- **An toàn hiệu năng:** 1 nguồn tốc độ duy nhất `getEffectiveRate()` (shuttle tính vào, đổi tốc độ → tắt shuttle); auto-follow + shuttle lùi **không** setState 60fps (DOM ref + throttle 120ms); vạch marker là component `React.memo`.
- **Verify:** `node --test scripts/timeline-tests/` **79/79 PASS** · `npx tsc --noEmit` **0 lỗi** · `npm run build` **OK** · **GUI instance riêng (CDP 9224, Vite 1422, exe copy patch) 22/22 PASS**: timecode→20.00s · Ctrl+C/V 4→6 câu tại 30s (id 5,6) · auto-follow scrollLeft 0→2352 · L L→rate 2 · J 20→18.22s · K+L +0.040s · M→1 vạch · Shift+M→8s→20s · khoá track kéo không đổi (mở khoá kéo được 198→396px) · Ctrl+click 2 khối (hồi quy Sonnet OK). **App PO 9223 không bị đụng**, instance riêng đã tắt.
- **Tài liệu:** `docs/TIMELINE_INTEGRATION_PLAN.md` cập nhật bản đồ 27 vị trí gắn + bảng bằng chứng; script + ảnh verify ở `%TEMP%\sublix-verify\` (chưa đưa vào repo).
- **Cần biết:** đã bỏ `bookmarks: number[]` cũ → dùng `markers` (có id/tên/màu, gộp trùng); marker cũ lưu trong cache không hiện (đổi định dạng).

---

### 2026-10-24 20:10 - CommandCode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-FEAT-DL-PLATFORMS-REUP`, **chưa commit / chưa bump version** — chờ PO duyệt). Đã fix `BUG-082` (chi tiết: `ISSUE_LOG.md`).
- **8 nền tảng mới:** `get_platform` + `platform_source_label` + `platform_error_hint` + `PLATFORM_META`/`detectPlatform` + `SUBTITLE_SOURCE_LABELS` cho **Instagram Reels, Facebook, Twitch, Kick, Dailymotion, VK (vk.com/vk.ru/vkvideo.ru), Pinterest (pinterest.com/pin.it), Snapchat Spotlight** (khớp host exact, có test chống giả mạo `evil-instagram.com.scam.io`).
- **Khu "Tùy chọn reup" (mặc định TẮT — Zero-Button):** 🧾 metadata `.info.txt` (UTF-8 BOM) · ♻️ `--download-archive` (chống tải trùng bền vững, lần 2 báo **"Đã tải trước đó"**, không báo lỗi) · 🖼️ thumbnail `.jpg` · ✂️ cắt đoạn `--download-sections` (2 ô nhập `hh:mm:ss`).
- **Code:** `downloader/reup.rs` mới (<300 dòng) + `reup_tests.rs` (10 test); `mod.rs` chỉ thêm cờ reup + chặn sớm; `batch.rs` chặn sớm; `DownloaderView.tsx/.css`, `lib/types.ts`, `lib/tauri.ts`. Không đụng Job Object/cancel (TSK-018).
- **Verify:** `cargo test --lib` **77/77 PASS** (+10); `tsc` 0 lỗi; `npm run build` OK. Chạy THẬT bằng đúng `build_download_command`: **IG Reel** → ra `.mp4` + `.jpg` + `.info.txt` (BOM, 5 dòng đầu đúng tiếng Việt); **Pinterest** cắt `00:00:05-00:00:15` → ffprobe **10.000000s**; tải lại lần 2 → archive bỏ qua (không tải lại).
- **Lưu ý môi trường:** build/test phải dùng `CARGO_TARGET_DIR=%TEMP%\sublix-cc-target` — Smart App Control chặn binary vừa relink trong `src-tauri/target` (`BUG-H09`); 2 tiến trình `sublix.exe` (dev app của PO) đang chạy nên **không** `cargo clean` được target repo (đã né, không kill).

---

### 2026-10-24 18:55 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-RES-VI-VOICE` — **chỉ nghiên cứu + thử nghiệm NGOÀI repo, KHÔNG sửa code app**).
- **Báo cáo:** `docs/VI_VOICE_MODELS_2026.md` (3 phần, bảng 20 ứng viên offline + 13 cloud) · **nghe thử:** `%TEMP%\sublix-voice-bench\index.html` (30 file WAV, 11 model × 3 câu). Đo thật: **WER/CER** (whisper.cpp large-v3-turbo) + **RTF** + **nghiêng điệu F0** + **DNSMOS offline** (33 file).
- **Phát hiện #1:** **Kokoro hiện tại BỎ RƠI số & ngày tháng** — câu "Ngày 24 tháng 10 năm 2026 … thắng 3-1" bị đọc thành "Ngày tháng 5 ở … thắng ở" → **WER 30 %**, CER 19,7 %. Đồng thời **SHA256 file Kokoro trong repo TRÙNG bản public mới nhất** → không có "nâng cấp Kokoro" nào đáng chờ.
- **Phát hiện #2 (BUG thật):** **Edge-TTS vi-VN trả 0 byte** cho một số câu, `synthesize_speech()` **không retry** ⇒ câu mất tiếng. Đã ghi `BUG-H13`; cộng đồng xác nhận (`rany2/edge-tts#473`, đúng voice `vi-VN-HoaiMyNeural`, còn mở). Cần thêm retry 3–5 lần.
- **Đề xuất top 3:** **VieNeu-TTS v3 Turbo** (Apache-2.0, offline CPU, 25 giọng, **clone được**, WER TB 3,3 %, bản clone **0 %**, RTF 0,92 — **#4/11 bảng VI YodaLingua**) → **ZeroTTS** (MIT, WER 1,03 %/UTMOS 2,91 công khai, chưa chạy) → **Google Chirp 3 HD / FPT.AI free tier**. **Loại F5-TTS** (WER S3 40 %, RTF 43, không thương mại). **Piper/VITS** làm engine siêu nhanh cho preview (RTF 0,16) — mặc định tắt chờ chốt license.
- **Cần biết:** máy **KHÔNG có API key nào** (`minimax_api_key` rỗng) → không chạy được cloud trả phí; `VITS-OpenBible-Vietnamese` vướng dependency Windows (torchaudio→torchcodec→FFmpeg shared) → đã ghi lý do, bỏ qua. Chi tiết lỗi: `ISSUE_LOG.md` → `BUG-H13`.

---

### 2026-10-24 18:30 - Claude Sonnet 5.5 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-TIMELINE-FIX-DND-RANGE`, **chưa commit / chưa bump version**). Chi tiết lỗi + số đo: `ISSUE_LOG.md` → `BUG-076..081`.
- **Kéo thả khối (Zero-Button, không thêm nút):** kéo giữa = dời (cả nhóm khi Ctrl/Shift-chọn nhiều), kéo mép khối phụ đề = trim, hít 8px (playhead / mép khối / In-Out; nút nam châm bật-tắt, Alt tạm tắt), chặn chồng khối kề, Esc huỷ, 1 lần kéo = 1 Ctrl+Z. Chuyển động bằng transform DOM ref, chỉ `setSegments` khi thả; khối voice tách `StudioTimelineVoiceBlock` (`React.memo`) + callback ổn định qua `blockApiRef` (tuân Note timeline 10-12).
- **Sửa:** Ctrl/Shift+click giữ nhiều khối (trước `[6]`, sau `[2,6,7]`); voice 1.5x hết tua giật (10 → 4 lần tua / 7s, baseline 1x = 3, `audio.playbackRate` 1 → 1.5); ducking không ghi đè volume người dùng; menu vùng In/Out đổi tên + chạy THẬT trên câu CHỒNG LẤN vùng (pipeline vùng nay có lồng tiếng, giữ id/vai/bản dịch/tiếng câu ngoài vùng, kết quả cắt trong [In,Out], toast báo số câu).
- **Verify:** `tsc` 0 lỗi, `npm run build` OK; GUI trên **instance riêng** (CDP 9224 = bản sao `sublix.exe` trỏ Vite 1422; app PID 47852 / cổng 9223 không bị đụng). Không sửa Rust → không chạy `cargo test`.
- **Cần biết:** HMR của Vite 1420 (app đang chạy của anh Tuấn) đã nạp lại `SublixStudioView.*` mỗi lần tôi lưu — nên restart app 9223 để chắc chắn dùng bản mới. Script CDP + ảnh bằng chứng nằm trong scratchpad của phiên (đường dẫn ở `worker_done`); chưa đưa vào repo.

---

### 2026-10-24 17:30 - CommandCode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-RES-DL-PLATFORMS` — **chỉ nghiên cứu, KHÔNG sửa code**).
- **Báo cáo:** `docs/DOWNLOADER_PLATFORM_EXPANSION.md` — chạy thử **THẬT 29 nền tảng** (`yt-dlp 2026.10.21`, 2026-10-24, `--simulate` + kết quả/lỗi **nguyên văn**): **11 nền tảng tải được** (Facebook, **Instagram Reel — không cần login**, Twitch, Kick, Dailymotion, VK, Niconico, Pinterest, Snapchat, MangoTV, YouTube).
- **Phát hiện chính:** **Threads / Kuaishou / Kwai / Migu / Lemon8 KHÔNG có extractor yt-dlp** → `Unsupported URL`; đặc biệt **`kuaishou` & `migu` đang có trong `get_platform` (`downloader/mod.rs:471,507`) nhưng yt-dlp không hỗ trợ** (lỗi tiềm ẩn). Vimeo giờ **bắt buộc đăng nhập**; TVer/Abema **chặn geo Nhật**; Rumble trả **403**; Reddit + NicoChannelPlus fail **do DNS mạng local** (cần chạy lại ở mạng khác).
- **Tính năng reup còn thiếu trong code:** `--download-archive` (chống trùng bền vững), `--write-info-json` (xuất metadata để viết caption), `--write-thumbnail`, `--download-sections` — **đều là 1 cờ yt-dlp, độ khó S**.
- **Khuyến nghị:** top-8 nền tảng thêm trước = Instagram Reels · Facebook · Twitch · Kick · Dailymotion · VK · Pinterest · Snapchat Spotlight (đều độ khó **S** = thêm host + nhãn); top-5 tính năng reup = metadata export · download-archive · thumbnail · kênh/hashtag + hẹn giờ · cắt đoạn. **Không đề xuất né Content ID/DRM.**
- **Lưu ý:** `docs/…EXPANSION.md` là **tài liệu tham khảo**, không tự động là scope; KHÔNG đụng code (worker khác đang sửa `SublixStudioView.*`).

---

### 2026-10-24 16:45 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-TIMELINE-MODULES-EASY` — viết module + test trong FILE RIÊNG, **CHƯA gắn** vào `SublixStudioView.tsx`).
- **Đã tạo:** 6 module logic thuần TS trong `src/lib/timeline/` (`timecode`, `shuttle`, `markers`, `trackLock`, `clipboard`, `autoFollow` — không React, không DOM, không import chéo) + `src/views/studio/TimecodeInput.tsx` (`React.memo`, viền đỏ khi sai định dạng) + `docs/TIMELINE_INTEGRATION_PLAN.md` (chỉ dẫn gắn từng module kèm số dòng + rủi ro hiệu năng).
- **Verify:** `node --test scripts/timeline-tests/` → **79 pass / 0 fail** (mỗi module ≥ 10 case; case biên: chuỗi rỗng, số âm, frame > fps, marker trùng, paste chồng lấn, shuttle max 8x); `npx tsc --noEmit` **0 lỗi**; `npm run build` **OK** (vite 67 modules, 6.5s).
- **API khớp code thật:** `SubtitleItem` → `TimelineSegment` (cùng cấu trúc → gán thẳng qua structural typing); `formatTimecodeDisplay` giống **y hệt** `formatTimecode()` (`:115`); `handleSeek` (`:1829`) làm callback `onSeek` của TimecodeInput; `saveUndoHistory` (`:1498`) là bắt buộc cho mọi thao tác đổi `segments`.
- **Lưu ý:** thêm 2 file phụ **trong thư mục test** — `scripts/timeline-tests/package.json` + `index.ts` — vì **Node 24.20 KHÔNG quét thư mục** với `node --test <dir>` (báo `Cannot find module`); có 2 file này thì đúng lệnh `node --test scripts/timeline-tests/` chạy được. Không ảnh hưởng build (`scripts/` nằm ngoài `include: ["src"]`).
- **Chưa làm (để bước sau):** chưa gắn module nào vào app; `SublixStudioView.tsx/.css` **không bị tôi sửa** (đang là worker Sonnet sửa, file modified lúc 16:34). Thứ tự gắn đề xuất: `timecode` → `clipboard` → `autoFollow` → `shuttle` (cần throttle ≥ 100ms) → `markers` → `trackLock`.

---

### 2026-10-24 15:45 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-RES-TIMELINE-GAP` — **chỉ nghiên cứu, KHÔNG sửa code**).
- **Báo cáo:** `docs/TIMELINE_GAP_ANALYSIS.md` — bảng **43 dòng tính năng** Premiere Pro vs Sublix (Có / Thiếu / Lỗi + `file:dòng` + ưu tiên P0–P3 + độ khó S/M/L) + **9 dự án OSS** (link / số sao / license / cập nhật cuối, đã kiểm tra 24-10-2026) + top-5 khuyến nghị.
- **Root cause 2 lỗi PO báo:** (1) *kéo thả khối* → **không có handler kéo nào**; `handleNudgeSegment` (`:4034`) chỉ sửa `start`/`end` bằng **click ±0.2s**, còn CSS `cursor: ew-resize` (`.css:1579`) nói dối. (2) *In/Out không chạy* → **5 lỗi chồng nhau**: lọc vùng bằng "chứa trong" thay vì "chồng lấn" (`:3052`/`:3206`), TTS không fallback + `catch{}` nuốt lỗi (`:3267-3268`), `prev.filter` **xoá mất** câu ở mép vùng (`:2982`/`:3528`), dịch hỏng fallback sang nguyên văn (`:3112`), dịch lại **ghi đè** bản dịch tay (`:3117-3131`).
- **Lỗi phụ đáng sửa:** nút magnet (`:6520`) + nút liên kết (`:6526`) **chỉ đổi class/toast, không có logic**; tooltip ghi phím `(N)`/`(P)` **không tồn tại**; mute per-vai dùng chung flag toàn cục (`:6893`); **không có redo**; **không auto-follow playhead** khi phát; không có track lock/solo.
- **Khuyến nghị:** **không cần thay thư viện timeline** — 5 hạng mục P0/P1 đều nên **tự viết**; chỉ cân nhắc cài `wavesurfer.js` (BSD-3-Clause) cho lớp âm thanh; đọc-học `Clypra` (MIT, trùng stack Tauri v2 + React 19) + `FilmCraft` (MIT OR Apache-2.0); **tránh** Remotion (license thương mại 2 bậc) và `open-video-editor` (GPL-3.0).
- **Lưu ý:** `docs/TIMELINE_GAP_ANALYSIS.md` là **tài liệu tham khảo**, không tự động là scope. Worker `TSK-TIMELINE-FIX-DND-RANGE` đang sửa song song `SublixStudioView.*` — không đụng file đó. Đã dọn 1 tin `@done` cũ (2026-10-12) khỏi đáy file; nội dung của nó đã nằm trong `ISSUE_LOG.md` (`BUG-059`/`BUG-060` + 4 Note bắt buộc).

---

### 2026-10-24 11:30 - Claude Code (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-FEAT-DL-BATCH-AUDIO`, **chưa commit / chưa bump version** — chờ PO duyệt).
- **Tab Tải video:** ô nhập thành textarea nhiều link (mỗi dòng 1 link; tách + lọc + loại trùng ở backend `downloader_parse_urls`); link playlist → `downloader_expand_playlist` (`--flat-playlist -J`, trần 200 mục, báo rõ khi bị cắt) → danh sách checkbox "Chọn hết / Bỏ chọn"; các mục vào hàng đợi có sẵn (`queued`, tối đa 3 tải song song, chống trùng BUG-053). Chế độ MP3/M4A đã có sẵn trong ô chất lượng → chỉ đổi nhãn + chip "🎵 Âm thanh MP3"; nút Studio giữ bật (Studio nhận .mp3 — đã verify).
- **Code mới:** `downloader/batch.rs` (252 dòng) + `batch_tests.rs`, `DownloaderBatchPicker.tsx`; `mod.rs` chỉ thêm `pub mod batch;`; `lib.rs` chỉ thêm 2 command. Không đụng lifecycle/Job Object (TSK-018).
- **Verify:** `cargo test --lib` **67 pass / 0 fail** (+7 test mới); `tsc` 0 lỗi; `npm run build` OK; yt-dlp thật: playlist JODA15 → 4 mục ("JOD" 517s, "JOD2" 363s), Google Search Stories → 13 mục; GUI (instance tách riêng CDP 9224): 4 link MP3 → 3 "Đang tải" + 1 "Đang đợi" → 4 file mp3 (ffprobe codec mp3, 19–163s).
- **Lưu ý:** mở MP3 trong Studio chạy fallback transcode (videoWidth=0) → chạy được nhưng thừa 1 lượt ffmpeg + toast "không hiển thị hình" — đề xuất Studio bỏ qua fallback khi file là audio.
