# AGENT_CHAT_ARCHIVE.md — Kho Lưu Trữ Tin Cũ (CHỈ đọc khi cần tra cứu lịch sử)

> Được tách ra từ `AGENT_CHAT.md` ngày 2026-10-07 (chỉ đạo của PO: gọn bảng bàn giao để agent không tốn token mỗi phiên).
> **QUY TẮC:** KHÔNG đọc file này ở Bước 0. Chỉ mở khi cần truy vết việc cũ. Tin mới ghi vào `AGENT_CHAT.md`.

---

### 2026-10-07 06:43 - Mavis (MiniMax-M3)
- **Loại:** `@info` cho CommandCode + PO — **đã test end-to-end lồng tiếng video DeepSeek T2dnchLabZQ rồi (07/10 ~03:20)**
- **Deliverable (CLI test, không qua App GUI):** dùng Rust example `test_dubbing_video.exe` (em viết 06/10) với video T2dnchLabZQ 14:47 (309 MB) đã có sẵn trong downloads → output `test_deepseek_T2dnchLabZQ_VI_dubbed.mp4` (315.9 MB, AAC Vietnamese audio, VP9 video giữ nguyên, 884.66s khớp input).
- **Kết quả đo thật:** Stage 1 (Whisper + diarize + LLM script + translate) = 56.7s; Stage 2 (Edge-TTS 131 segments + atempo + remux) = 20m36s; TỔNG = **21m33s**.
- **Chất lượng dịch:** rất tốt (giữ brand names DeepSeek, API; văn nói tự nhiên).
- **⚠️ Known issues:** (1) diarization over-cluster ra 6 speakers cho video 1-host; (2) audio track không có `language=vie` tag.
- **PO thấy file đâu:** copy sang Thư Mục Thành Phẩm — bấm **"📁 Mở Thư Mục Thành Phẩm"** trong tab Lồng Tiếng.

---

### 2026-10-07 02:55 - CommandCode
- **Loại:** `@done` (FIX PO báo: "đang tải không hiện tiến trình — xong mới hiện")
- **Root cause:** yt-dlp coi `download:` trong `--progress-template` là LOẠI tiến trình và KHÔNG in ra → parser `strip_prefix("download:")` không khớp dòng nào → percent kẹt 0.
- **Fix (v0.9.10):** parser chấp nhận dòng CÓ lẫn KHÔNG tiền tố, dọn giá trị `NA`.
- **Bằng chứng:** GUI test tải video 4K thật: % chạy **0.0% → 0.6% → 92.5%**; ảnh `test-output-audit-giong/progress-dang-tai.png`.

---

### 2026-10-07 02:10 - CommandCode
- **Loại:** `@done` (FIX PO báo: "tích cookie là không tải được gì" — Cookie DB / DPAPI / 403)
- **Root cause:** Chrome/Edge mới mã hóa cookie (yt-dlp#7271, #10927); `is_cookie_or_login_error` không nhận diện 2 lỗi cookie thật → dự phòng không kích hoạt.
- **Fix (v0.9.10):** TẮT đường cookie trình duyệt (nhãn "thử nghiệm"), mở rộng từ khóa lỗi cookie, dự phòng THẬT: lỗi cookie → tự tải KHÔNG cookie/cookies.txt. Phụ: gỡ trùng khoá `ChangelogModal.tsx` + BOM `package.json`.
- **Bằng chứng:** GUI test chọn cookie "Google Chrome" → tải THÀNH CÔNG `Me at the zoo [jNQXAC9IVRw].mp4`; ảnh `cookie-fix-thanh-cong.png`.

---

### 2026-10-07 01:05 - CommandCode
- **Loại:** `@done` (PO giao 00:08 qua Telegram: "tab lồng tiếng còn gì thì hiện thực hoá" + chọn model→hiện voice nam/nữ + mẫu nghe thử + khớp voice nhiều role)
- **Voice catalog theo model:** mỗi model bấm ▸ mở danh sách giọng Nam/Nữ NGAY CẢ TRƯỚC KHI TẢI (Kokoro = 7 nam + 7 nữ; card "Edge Neural — 8 giọng"; model clone ghi rõ cần clip mẫu 5–10s/vai).
- **Mẫu nghe thử cache:** nút 🎧 tạo 14 mẫu Kokoro 1 lần (~1 phút) → cache `models/voice/kokoro-vi/samples/*.wav` → nghe lại TỨC THÌ (data URI WAV). E2E: 14/14 file thật; CDP click 🔊 → `paused:false, t:1.56/4.92s`.
- **Khớp voice đa vai:** pool 7+7; nhãn "♂/♀ + engine"; thêm nhân vật tự chọn giọng CHƯA dùng; chip ⚠️ Trùng giọng. E2E `dialogue_2spk.wav` → 5 vai = 5 giọng khác nhau; ép trùng → 2 chip ⚠️.
- **Bằng chứng:** `test-output-audit-giong/v099_voice-catalog-hub.png` + `v099_multi-role-casting.png`; version bump v0.9.9.
- **⚠️ Bẫy mới (BUG-H08):** dev base dir = `src-tauri` → ghi samples/model làm tauri dev watcher auto-restart giết tiến trình → test tính năng ghi model phải chạy `npm run tauri dev -- --no-watch`.

---

### 2026-10-06 17:45 - Anh Tuấn (PO) / ghi bởi CommandCode
- **Loại:** `@assign → Mavis` (dây chuyền 1-Click "Dán link → Video lồng tiếng A→Z") — phiếu việc `TASK_A_Z_ONE_CLICK.md` (S1→S5).
- **Phân công:** CommandCode viết kế hoạch + thẩm định — Mavis viết code + tự test.
- **⚠️ LUẬT CHẠY THẬT:** bài chốt = dán 1 link YouTube thật → video lồng tiếng hoàn chỉnh trong Thư Mục Thành Phẩm.

---

### 2026-10-06 17:20 - CommandCode
- **Loại:** `@done` (dời Model Giọng Nói vào tab Lồng Tiếng + engine Kokoro-Vietnamese OFFLINE)
- **TASK 1 (UI):** gỡ hub khỏi Settings → panel "🎛 Chọn Giọng & Tải Model" trong tab Studio Lồng Tiếng (thu gọn mặc định).
- **TASK 2 (engine):** Kokoro-Vietnamese 326MB + 14 voicepack; sidecar `kokoro_vi_tts.py` (onnxruntime + vig2p); `synthesize_speech` thêm nhánh `kokoro:<id>`; retry-rồi-skip câu lỗi; 14 VoicePreset.
- **Bằng chứng:** e2e `kokoro_DUBBED_TEST.mp4` (26.03s, không cần mạng); 2 sample nghe thử mp3; GUI bấm thật (22 nút Nghe thử).

---

### 2026-10-06 16:15 - CommandCode
- **Loại:** `@done` (Model Hub Giọng Nói — 4 danh sách, 13 model 2026, dung lượng byte thật, nút Tải có tiến trình)
- **Research model Việt:** MOSS-TTS v1.5 (có Việt), NeuTTS-Air-Vi, F5-TTS-Vi, viXTTS, VietTTS, Kokoro-Vi, Qwen3-TTS (chưa có Việt), sherpa diarization, pyannote 3.1 (gated).
- **Bằng chứng:** GUI test tải sherpa 34MB → "Đang tải 8% — 3 MB / 34 MB" → "✅ Đã tải"; bytes khớp research.

---

### 2026-10-06 15:38 - Anh Tuấn (PO) → @ALL (re-plan)
- **Loại:** `@reassign` (AUDIT-VOICE + code lồng tiếng → **CommandCode**). Mavis tạm dừng, đã bàn giao bảng audit 17/17 mục.

---

### 2026-10-06 14:35 - Anh Tuấn (PO) / ghi bởi CommandCode
- **Loại:** `@info` — Kế hoạch mới `KE_HOACH_GIONG_NOI_LONG_TIENG.md` (model 2026 thay model cũ), Phase V1→V5 có bảng nghiệm thu.

---

### 2026-10-06 14:30 - CommandCode → @ALL
- **GUI automation:** dùng `agent-browser` + cổng debug WebView2 — hướng dẫn đầy đủ + 7 bẫy: `GUI_TEST_GUIDE.md` (file lâu dài).
- **Cảnh báo:** PO đang tải thì đừng sửa code Rust; đừng bấm nút bằng ref cuối danh sách.

---

### 2026-10-06 14:00 - Sub-agent Worker (Mavis nhờ)
- **Loại:** `@handoff` — AUDIT-SUB xong. Đo thật video 21:43: Stage 1 ffmpeg 1.77s; Whisper TINY CPU 73.4s; LARGE-v3-turbo-q8 CPU extrapolate ~24min; MiniMax translate extrapolate ~40min.
- **🔴 5 findings:** F1 không tải được Whisper model từ HF (401); F2 `ggml-tiny.bin` corrupt do `has_model()` chỉ check size; F3 không có CUDA build → GPU rảnh; F4 thiếu progress trong 24 phút; F5 batch function dead-code.

---

### 2026-10-06 13:00 - CommandCode
- **Loại:** `@done` (v0.9.5 + v0.9.6): fix chất lượng tải (bỏ ép player_client android), chi tiết tải + link gốc/copy, tiến trình "đã tải/tổng", fix 403 bằng `curl_cffi` (máy mới nhớ `pip install curl_cffi`).

---

*(Hết phần lưu trữ — tin cũ hơn 2026-10-06 đã được prune theo rolling window.)*
