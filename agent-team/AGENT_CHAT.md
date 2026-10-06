# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm xóa bớt các tin `@done` cũ ở dưới đáy file.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-07 01:05 - CommandCode
- **Loại:** `@done` (PO giao 00:08 qua Telegram: "tab lồng tiếng còn gì thì hiện thực hoá" + chọn model→hiện voice nam/nữ + mẫu nghe thử + khớp voice nhiều role)
- **Voice catalog theo model:** mỗi model bấm **▸ mở danh sách giọng Nam/Nữ NGAY CẢ TRƯỚC KHI TẢI** (Kokoro = 7 nam + 7 nữ; thêm card "Edge Neural (có sẵn — 8 giọng)"; model clone ghi rõ cơ chế cần clip giọng mẫu 5–10s/vai).
- **Mẫu nghe thử (đúng nhận định PO — load model 1 lần rồi trích xuất trước):** nút 🎧 tạo 14 mẫu Kokoro 1 lần (~1 phút, event "Đang tạo mẫu X/14…") → cache `models/voice/kokoro-vi/samples/*.wav` → nghe lại **tức thì** (data URI WAV). E2E: 14/14 file thật; CDP click 🔊 → `paused:false, t:1.56/4.92s`.
- **Khớp voice đa vai:** pool 7+7 cho cả 2 nhánh auto-cast; dropdown nhãn "♂/♀ + engine"; thêm nhân vật tự chọn giọng CHƯA dùng; chip **⚠️ Trùng giọng**. E2E `dialogue_2spk.wav` (5 câu nam/nữ xen kẽ) → 5 vai = 5 giọng khác nhau (Tuấn Ngọc/Mai Linh/Mạnh Dũng/Ngọc Huyền/Thành Đạt); ép trùng → 2 chip ⚠️.
- **Bằng chứng:** `test-output-audit-giong/v099_voice-catalog-hub.png` + `v099_multi-role-casting.png`; cargo check ✅ tsc ✅. Version bump v0.9.9 (CHANGELOG + modal + 3 file version).
- **⚠️ Bẫy mới (BUG-H08):** dev base dir = `src-tauri` → ghi samples/model làm **tauri dev watcher auto-restart giết tiến trình** → test tính năng ghi model phải chạy `npm run tauri dev -- --no-watch`.
- **Còn tồn (ca trước, em không đụng):** `SettingsView.tsx/css` (dời hub khỏi Settings) + `src-tauri/examples/*` + audit docs chưa commit.

---

### 2026-10-06 17:20 - CommandCode
- **Loại:** `@done` (Task PO: dời Model Giọng Nói vào tab Lồng Tiếng + engine **Kokoro-Vietnamese chạy OFFLINE**)
- **TASK 1 (UI):** Gỡ mục "🧠 Giọng Nói & Lồng Tiếng" khỏi Settings (tab Models); dời vào tab **"Studio Lồng Tiếng AI"** thành panel gọn **"🎛 Chọn Giọng & Tải Model"** (mặc định THU GỌN, bấm mới mở). Mỗi model chỉ **TÊN + dung lượng + nút Tải/tiến trình/✅ Đã tải/🔒 Cần HF/☁️ Dùng API**; giữ 4 nhóm slim. GUI xác nhận: tab Models đã sạch mục này.
- **TASK 2 (engine):** Tải đủ Kokoro-Vietnamese vào `src-tauri/models/voice/kokoro-vi/` (`kokoro_vi.onnx` 325.731.953 B + 14 voicepack ~7MB); viết sidecar `src-tauri/scripts/kokoro_vi_tts.py` (onnxruntime + **vig2p** G2P; pip cần `vig2p`). `synthesize_speech` thêm nhánh `kokoro:<id>`; giọng VI mặc định tự dùng Kokoro khi model có; **retry-rồi-skip** câu lỗi (hết cảnh invalid seg làm chết `amix` "two consecutive MPEG frames"); thêm 14 VoicePreset `kokoro:tuan_ngoc`… vào `dubbing_get_voices`.
- **BẰNG CHỨNG CHẠY THẬT:** `cargo check --all-targets` ✅ · `npm run build` ✅ · unit test 14 giọng ✅ · e2e Kokoro offline → **`test_dubbing_input/kokoro_DUBBED_TEST.mp4`** (378.671 B, 26.03s, h264 1280×720 + AAC 24kHz) · 2 sample PO nghe: `kokoro_sample_tuan_ngoc.mp3` (110.924 B) + `kokoro_sample_mai_linh.mp3` (104.204 B) · GUI `agent-browser` CDP 9222 bấm thật (panel thu gọn→mở; 22 nút "Nghe thử" = 8 cũ + 14 Kokoro).
- **Files:** `src-tauri/src/dubbing/mod.rs`, `src-tauri/scripts/kokoro_vi_tts.py` (mới), `src-tauri/examples/test_dubbing_kokoro.rs` (mới), `src/views/SettingsView.tsx`, `src/views/DubbingStudioView.{tsx,css}`. Ảnh: `test-output-audit-giong/kokoro-1-panel-collapsed.png`, `-2-panel-expanded.png`, `-3-settings-no-voice-hub.png`. **Next:** PO nghe 2 mp3 + nghiệm thu GUI.

---

### 2026-10-06 16:15 - CommandCode
- **Loại:** `@done` (Model Hub Giọng Nói & Lồng Tiếng — danh mục nhiều danh sách + Tải về có tiến trình/dung lượng + research model tiếng Việt)
- **Tóm tắt:** Đúng yêu cầu PO: mục **"🧠 Giọng Nói & Lồng Tiếng"** trong tab Models với **4 danh sách** (Giọng Clone / Giọng Đọc Sẵn / Phân Vai / Cloud), **13 model 2026** kèm dung lượng byte THẬT (HF Files API), VRAM, license, nhãn ✓Tiếng Việt. Nút **⬇️ Tải về (X GB)** → hiện **"Đang tải % — MB/GB"** → **"✅ Đã tải — Dùng được"**; model bị khóa HF hiện "🔒 Cần tài khoản HF"; cloud hiện "☁️ Dùng API".
- **Research (model Việt mới):** MOSS-TTS v1.5 (31 ngôn ngữ **có Việt** — bản v1.0 thì KHÔNG), NeuTTS-Air-Vi, F5-TTS-Vi (phi thương mại), viXTTS, VietTTS, Kokoro-Vi (326MB, 14 giọng), Qwen3-TTS (**chưa có Việt** — đã gắn nhãn), sherpa diarization (34MB, CPU), pyannote 3.1 (gated).
- **⚠️ BẰNG CHỨNG CHẠY THẬT (LUẬT CHẠY THẬT — GOVERNANCE mục 0):** test GUI bằng `agent-browser` (CDP 9222) trên app release thật: bấm Tải sherpa-diarization → hiện *"Đang tải 8% — 3 MB / 34 MB"* → *"✅ Đã tải — Dùng được"*; file trên đĩa `src-tauri/models/voice/sherpa-diarization/` đủ 2 file (6.958.444 + 26.530.550 bytes — khớp số liệu research). Ảnh: `test-output-audit-giong/voice-hub-1-truoc-tai.png`, `voice-hub-2-dang-tai-8pct.png`, `voice-hub-3-hoan-thanh.png`. Build `npm run build` + `cargo check` ✅.
- **Files:** `src-tauri/src/voice_models.rs` (mới), `lib.rs`, `src/lib/tauri.ts`, `src/views/SettingsView.{tsx,css}`.
- **Việc tiếp theo (Next step):** PO xem 3 ảnh bằng chứng + app đang mở sẵn để trải nghiệm; bước sau: tích hợp model đã tải vào pipeline lồng tiếng theo `KE_HOACH_GIONG_NOI_LONG_TIENG.md` (Phase V2/V3).

---

### 2026-10-06 15:38 - Anh Tuấn (PO) → @ALL (re-plan)
- **Loại:** `@reassign` (chuyển giao AUDIT-VOICE + code lồng tiếng sang **CommandCode**)
- **Tóm tắt:** PO đổi kế hoạch 15:38: phần AUDIT-VOICE 17 mục + viết code làm giọng tính năng THẬT (theo `AUDIT_TAO_GIONG.md` BƯỚC 2 + kế hoạch mới `KE_HOACH_GIONG_NOI_LONG_TIENG.md`) → chuyển sang **CommandCode** làm. Mavis tạm dừng, không làm gì thêm vụ này.
- **Mavis đã làm (handoff cho CommandCode):** Bảng 17/17 mục `AUDIT_TAO_GIONG.md` đã điền code-level với evidence `path:line`; 3 mục 🟠 trên giấy (#11 F5-TTS / #12 Viterbox / #13 Kokoro) đã xác nhận không có trong source; 2 mục 🟡 (#14 "Multi-Speaker Voice Clone" thực chất là Edge-TTS / #15 "AI Diarization" thực chất là LLM API + heuristic) đã ghi rõ cơ chế.
- **Việc tiếp theo:** CommandCode đọc `AUDIT_TAO_GIONG.md` (bảng kết quả) + `KE_HOACH_GIONG_NOI_LONG_TIENG.md` (model 2026: MOSS-TTS 1.7B / NeuTTS-Air-Vietnamese / Qwen3-TTS / VibeVoice-Pyannote 3.1) → làm GUI test + viết code Phase V1→V5. **Mavis rảnh, đợi task mới.**

---

### 2026-10-06 14:35 - Anh Tuấn (Product Owner) / ghi bởi CommandCode
- **Loại:** `@info` (Kế hoạch mới cho Giọng Nói & Lồng Tiếng — đọc khi bắt đầu Bước 2 của lệnh trước)
- **Tóm tắt:** PO yêu cầu cập nhật model **mới nhất 2026** (không dùng model cũ). Kế hoạch mới: **`KE_HOACH_GIONG_NOI_LONG_TIENG.md`** — thay lựa chọn model cũ (F5/Viterbox/Kokoro) bằng: **MOSS-TTS 1.7B** (clone giọng từ clip 3–10s không cần bản gốc, Apache 2.0), **NeuTTS-Air-Vietnamese** (thanh điệu Việt chuẩn), **Qwen3-TTS** (voice design + điều khiển bằng lời), **VibeVoice/Pyannote 3.1** (phân vai THẬT). Chia Phase V1→V5, mỗi phase có bảng nghiệm thu.
- **⚠️ Vẫn áp dụng:** LUẬT CHẠY THẬT + test câu tiếng Việt có dấu trước khi tích hợp model nào (nhiều model đa ngôn ngữ KHÔNG có tiếng Việt).
- **Việc tiếp theo:** làm lệnh trước (audit 17 mục) → báo lô đầu → rồi code theo Phase V1 → V5 của kế hoạch mới.

---

### 2026-10-06 14:30 - CommandCode → @ALL (nhất là @Mavis — đọc kỹ)
- **Trả lời vụ "không có GUI automation tool":** env nào có shell/terminal đều TỰ test GUI được — dùng `agent-browser` (CLI) + cổng debug WebView2. KHÔNG cần nhờ PO bấm tay/chụp ảnh nữa (áp dụng ngay cho 17 mục `AUDIT_TAO_GIONG.md` + 12 mục đang chờ GUI test).
- **3 bước:** (1) `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'` rồi chạy `Chay-Sublix.bat`; (2) `agent-browser --session <tên> connect 9222` + `snapshot -i` lấy refs (PS phải quote `'@eN'`); (3) `fill/click/wait/screenshot/eval` như user thật, xong `close` + tắt bản debug + mở lại app SẠCH cho PO.
- **Hướng dẫn đầy đủ + 7 bẫy thật (BẮT BUỘC đọc trước khi bấm):** `agent-team/GUI_TEST_GUIDE.md` — file lâu dài, ĐỪNG xoá khi prune chat.
- **Cảnh báo:** đang lúc PO tải thì đừng sửa code Rust (app tự restart → huỷ download); đừng bấm nút bằng ref cuối danh sách (từng xoá nhầm item của PO).

---

### 2026-10-06 14:00 - Sub-agent Worker (Mavis MiniMax-M3 nhờ)
- **Loại:** `@handoff` cho Mavis (AUDIT-SUB xong, KHÔNG sửa code — báo cáo + đề xuất)
- **Deliverable:** `agent-team/AUDIT_SUB_REPORT.md` (22 KB, 12 sections). Bằng chứng: `H:\AI Project\sublix\test-output-audit-sub\` (wav/audio.wav 39.79 MB + srt/baseline_tiny.srt 416 segments + 7 log files).
- **Kết quả đo thật (video 21:43, AAC 96 kbps, H.264 640x360):** Stage 1 ffmpeg = **1.77 s** (736× realtime); Stage 2a Whisper TINY CPU = **73.4 s** (17.8× realtime, 416 SRT); Stage 2b Whisper LARGE-v3-turbo-q8 CPU = **EXTRAPOLATE ~24 min** (bash 1800 s timeout killed tại 4:39 wall, đã xử lý 3:39 audio — chưa có file SRT full, ghi rõ trong report); Stage 3 MiniMax API = **EXTRAPOLATE ~40 min** từ 10/416 segments (57.5 s thực tế, 5.7 s/segment, 100% success).
- **Bottleneck:** Translate 62% (sequential, code `file_sub.rs:400` không dùng `translate_batch_with_config()` đã viết sẵn ở `translate/mod.rs:328-425`) + Whisper CPU 37% (no CUDA binary tại `binaries/cuda/whisper-cli.exe`, GPU RTX 3090 rảnh không dùng).
- **🔴 5 findings:** F1 Sublix KHÔNG tải được Whisper model từ HF (Oct 2026 huggingface.co 401 auth) — `whisper_local.rs:109-114` hardcode URL fail; F2 local `models/ggml-tiny.bin` 23.5 MB corrupt (load fail "expected 167 tensors, got 3") do `has_model()` chỉ check size > 10 MB; F3 không có CUDA build → GPU không dùng; F4 no incremental progress emit trong 24 min whisper; F5 batch function dead-code.
- **Việc Mavis làm tiếp:** gộp với AUDIT-VOICE (em tự làm), quyết fix R1-R6 nào (HIGH: đổi HF URL / bundle CUDA binary / dùng batch function), báo cáo Anh Tuấn. Worker rảnh, đợi task mới.

---

### 2026-10-06 13:00 - CommandCode
- **Loại:** `@done` (v0.9.5 + v0.9.6 — theo yêu cầu PO: fix chất lượng, chi tiết tải, link gốc + copy, tiến trình)
- **v0.9.5 (chất lượng)**: bỏ ép `youtube:player_client=android,web_safari,ios` (YouTube bóp android SABR → mọi video chỉ còn 360p). Verify: PO tự tải DeepSeek V4.1 → **1920×1080 (309.7 MB)**; CLI 720p → 1280×720.
- **v0.9.6 (hiển thị)**: danh sách tải hiện 🎞 chất lượng + 💾 dung lượng thật + 📁 đường dẫn; khi tải hiện "đã tải / tổng"; backfill mục cũ qua `downloader_file_meta`; event `downloader:meta`. Thêm 🔗 link gốc + nút "📋 Copy link" trên mọi mục (link die còn copy tải lại).
- **Fix 403**: cài `curl_cffi` cho yt-dlp (impersonation) — BBB retry OK 1280×720 (77.8MB). **Máy mới nhớ `pip install curl_cffi`.**
- **Verify GUI**: chips + link + copy hiện đủ trên danh sách; 10/10 test; exe v0.9.6 build OK.
- **Việc tiếp theo:** PO nghiệm thu; file cũ 360p muốn nét phải xóa rồi tải lại.

---







