# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm xóa bớt các tin `@done` cũ ở dưới đáy file.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-07 21:45 - Antigravity
- **Loại:** `@done` (Hotfix 32KB CMD Limit phim dài + Step S1 Offline Diarization Sidecar)
- **Hotfix 32KB CMD (`dubbing/mod.rs`):** Thay vì ném N inputs vào FFmpeg remux CLI (tràn 32KB CreateProcessW với 400+ segs), đã chuyển sang `render_combined_speech_track` gộp âm thanh phân cấp $\le 28$ inputs/chunk. CLI remux cuối chỉ $\le 3$ inputs (<300 ký tự). Test 100 segments pass 0.87s.
- **Step S1 Diarization (`scripts/sherpa_diarize.py`):** Sidecar sherpa-onnx (pyannote-segmentation-3-0 + wespeaker ResNet34). Test thật trên `test_dubbing_input/dialogue_2spk.wav` (5 câu nam/nữ đan xen): phát hiện chuẩn xác 2 speakers, 5 segments `[0, 1, 0, 1, 0]` (100% ground truth, ghi tại `test_dubbing_input/diarize_result.json`). Test 1-speaker ra đúng 1 vai.
- **Bằng chứng:** `test_dubbing_input/diarize_result.json`; unit test `test_render_combined_speech_track_large_segments` pass (0.87s); `cargo check --all-targets` ✅; `npm run build` ✅.
- **Việc tiếp theo:** Chờ PO/CommandCode nghiệm thu S1 trước khi tiến hành Step S2 (tích hợp vào `analyze_and_create_project`).

---

### 2026-10-07 02:55 - CommandCode
- **Loại:** `@done` (FIX PO báo: "đang tải không hiện tiến trình — xong mới hiện")
- **Root cause (bắt quả tang bằng CLI probe):** yt-dlp coi `download:` trong `--progress-template` là **LOẠI tiến trình** và KHÔNG in ra — dòng thật là `1024|223779|NA|407840|0`. Parser (`downloader/mod.rs` ~915) kiên nhẫn `strip_prefix("download:")` → **không dòng nào khớp** → percent kẹt 0, chỉ có sự kiện "completed" là hiện.
- **Fix (v0.9.10):** parser chấp nhận dòng CÓ lẫn KHÔNG tiền tố (chỉ nhận khi 2 ô đầu là số byte hợp lệ — không dính câu khác), dọn giá trị `NA` (speed/eta), không phụ thuộc version yt-dlp.
- **⚠️ BẰNG CHỨNG CHẠY THẬT:** GUI test (`agent-browser` CDP 9222) tải video 4K thật (`aqz-KE-bpKQ`): đọc trực tiếp DOM lúc tải → % thay đổi liên tục **0.0% → 0.6% → 92.5%**; ảnh `test-output-audit-giong/progress-dang-tai.png`; nút Hủy bấm được. Build `npm run build` + `cargo check` + `npx tauri build --no-bundle` ✅.
- **Ghi chú:** video 2 luồng (video+audio tách) sẽ thấy % chạy 0→100 rồi quay lại 0→100 cho luồng 2 — hành vi bình thường của yt-dlp, có thể làm mượt sau (gộp % toàn bộ).
- **Việc tiếp theo:** PO xác nhận trên máy mình.

---

### 2026-10-07 02:10 - CommandCode
- **Loại:** `@done` (FIX PO báo: "tích cookie là không tải được gì" — download lỗi Cookie DB / DPAPI / 403)
- **Root cause:** Chrome/Edge mới (App-Bound Encryption) khiến yt-dlp KHÔNG đọc/giải mã được cookie (yt-dlp#7271, #10927); thêm nữa `is_cookie_or_login_error` không nhận diện 2 lỗi cookie thật ("cookie database"/"DPAPI" — thiếu từ khóa) → cơ chế dự phòng không bao giờ kích hoạt.
- **Fix (v0.9.10):** (1) TẮT đường "cookie từ trình duyệt" (nhãn UI đổi thành "thử nghiệm — hay bị chặn, app tự tải không cookie"); (2) mở rộng từ khóa phân loại lỗi cookie; (3) dự phòng THẬT: lỗi cookie → tự thử lại KHÔNG cookie (hoặc cookies.txt nếu có) — không bao giờ chết cứng vì cookie. Phụ: gỡ trùng khoá `ChangelogModal.tsx` + gỡ BOM `package.json` (2 tai nạn build do sửa tay).
- **⚠️ BẰNG CHỨNG CHẠY THẬT:** GUI test (`agent-browser` CDP 9222): chọn cookie **"Google Chrome"** → dán link YouTube thật → "Me at the zoo [jNQXAC9IVRw].mp4" **tải THÀNH CÔNG nằm trong downloads**; ảnh `test-output-audit-giong/cookie-fix-thanh-cong.png`. Build `npm run build` + `cargo check` + `npx tauri build --no-bundle` ✅.
- **Việc tiếp theo:** PO xác nhận; các mục lỗi cũ trong danh sách bấm "Thử lại" là chạy được ngay.

---

### 2026-10-07 07:25 - Mavis (MiniMax-M3)
- **Loại:** `@info` — Option research tab Lồng Tiếng + Worker B đang chạy
- **File mới:** `agent-team/OPTION_RESEARCH_DUBBING.md` — tổng hợp **18 options/handlers** trong `DubbingStudioView.tsx` (1380 dòng), chia 6 nhóm: Voice Hub / File / Provider / Range+Mode / Workflow+Editor / Speaker Card.
- **8 issues CẦN POLISH** (R1-R8): R1 MiniMax dịch "nghe chán" (PO đã ghi nhận 06:50); R2 thiếu `language=vie` tag; R3 diarization over-cluster; R4 Stage 3 latency không ổn định (98s/batch); R5 config drift; R6 batch 30 timeout; R7 hardcode sub chưa có trong app; R8 Demucs chưa test.
- **Effort ước tính:** 3-4 giờ polish tổng (ưu tiên R2 + R4 + R1 + R7).
- **Worker B** (`bg_fa0e4ff2`) đang chạy Stage 2 (llama-server CPU 43s) — dự kiến 30-60 phút cho video 21:43. SRT VI đã viết xong (316 segments, 38KB) lúc 07:13.
- **Việc khi PO thức:** đọc `OPTION_RESEARCH_DUBBING.md` + check file MP4 hardcode sub trong Thư Mục Thành Phẩm (`test_ai_21m_VI_dubbed_HARDSUB.mp4`) + quyết định thứ tự polish.

### 2026-10-07 13:27 - Mavis (MiniMax-M3)
- **Loại:** `@plan` — PO quay lại yêu cầu cải thiện tốc độ + test multi-speaker
- **Lưu ý quan trọng về R2nyc_oP9Yk:** video `https://www.youtube.com/watch?v=R2nyc_oP9Yk` (PO giao trước khi ngủ) là **audio-only YouTube** — chỉ có track audio HLS m3u8, KHÔNG có video stream MP4 để render. Em đã ghi note lúc 07:08, 07:25, 07:54 — PO có thể chưa đọc. Lý do em dùng alternate (`test_ai_21m.mp4`) là vì **không thể ghép audio vào video nếu không có video** — pipeline cần MP4 stream.
- **Worker C** (`bg_c27ae87c`) đã launch: A→Z pipeline test_ai_21m **Kokoro LOCAL** (offline, 14 giọng Việt) + multi-speaker ép voice khác nhau cho 6 speakers. So sánh tốc độ với worker B (Edge-TTS 37 phút).
- **Cấu hình Kokoro** (để PO biết): model `kokoro_vi.onnx` 326 MB + 14 voicepacks tại `C:\Users\TTC\AppData\Roaming\com.sublix.desktop\models\voice\kokoro-vi\`. Multi-speaker ép voice: 3 nam (kokoro:tuan_ngoc/manh_dung/thanh_dat) + 3 nữ (kokoro:mai_linh/ngoc_huyen/my_yen) xen kẽ.
- **Việc tiếp theo khi Worker C xong:** so sánh tốc độ Kokoro vs Edge-TTS → báo cáo cho PO. Nếu Kokoro nhanh hơn nhiều → đề xuất fix app Sublix để Kokoro làm default thay Edge-TTS (thuộc về Plan V5 đã ghi chú).

### 2026-10-07 07:54 - Mavis (MiniMax-M3)
- **Loại:** `@done-AZ-pipeline` (Worker B hoàn thành A→Z + hardcode sub)
- **Deliverable:**
  - `C:\Users\TTC\AppData\Local\Temp\test_ai_21m.vi.srt` (38 KB, 316 segments VI)
  - `C:\Users\TTC\AppData\Local\Temp\test_ai_21m_VI_dubbed.mp4` (76 MB, AAC audio thay Opus gốc)
  - `C:\Users\TTC\AppData\Local\Temp\test_ai_21m_VI_dubbed_HARDSUB.mp4` (88 MB, **sub burned vào** video)
  - **Đã copy vào Thư Mục Thành Phẩm**: `C:\Users\TTC\AppData\Roaming\com.sublix.desktop\downloads\test_ai_21m_VI_dubbed_HARDSUB.mp4`
- **Pipeline timing:** Worker tổng 40 phút (07:12 → 07:52) — Stage 1 Whisper+LLM script ~13 phút + Stage 2 TTS+atemux ~33 phút + ffmpeg hardcode sub ~3 phút.
- **Code mới:** `src-ta/examples/test_dubbing_srt.rs` — Rust example Rust mới vừa export file `.vi.srt` (ghi từ `project.segments` sau Stage 1) + gọi `export_dubbed_video` cho MP4. Worker có thể dùng để repro sau này.
- **Việc khi PO thức:** (1) Mở VLC nghe thử MP4 mới — vẫn dùng MiniMax-M3 nên chất lượng dịch có thể vẫn "nghe chán" như trước (R1). (2) Đọc `OPTION_RESEARCH_DUBBING.md` → quyết định thứ tự polish (R1-R8). (3) File MP4 có sub burned → mở bằng player nào đều thấy sub + nghe VI.

---

### 2026-10-07 07:25 - Mavis (MiniMax-M3)

### 2026-10-07 07:25 - Mavis (MiniMax-M3)
- **Loại:** `@plan` (PO giao trước khi đi ngủ lúc 06:54)
- **Nhiệm vụ PO giao:** (1) A→Z video `R2nyc_oP9Yk` (download → dub → hardcode sub); (2) nghiên cứu + test nhiều vòng các option trong tab Lồng Tiếng.
- **Worker A** (`bg_981fbef8`) đã launch: A→Z pipeline R2nyc_oP9Yk → MP4 hardcode sub. Dự kiến 20-30 phút.
- **Em tự nghiên cứu options** trong DubbingStudioView: 18 button/handler đã liệt kê — phân nhóm: Voice (Hub ▸ 14 giọng ▸ audition), File (chọn/mở folder), Provider (local/MiniMax), Range (3m/10m/full), Workflow (analyze/cancel/export), Speaker (add/remove/rename/trùng giọng). Sẽ test thử 1-2 option qua CLI khi rảnh.
- **Việc khi PO thức:** check file MP4 hardcode sub trong Thư Mục Thành Phẩm + đọc báo cáo option research.

### 2026-10-07 07:08 - Mavis (MiniMax-M3)
- **Loại:** `@update` (R2nyc_oP9Yk không tải được — đổi alternate)
- **Phát hiện quan trọng:** video `https://www.youtube.com/watch?v=R2nyc_oP9Yk` (PO giao) là **AUDIO-ONLY YouTube** — chỉ có HLS m3u8 audio tracks (các track dubbed tự động cho nhiều ngôn ngữ), **KHÔNG có video stream MP4 nào** để tải về. yt-dlp trả về "Requested format is not available" + format list 100% là audio-only m3u8. → KHÔNG THỂ dùng video này để test A→Z lồng tiếng.
- **Worker A cancel** (`bg_981fbef8`) sau 10 phút không tải được.
- **Worker B** (`bg_fa0e4ff2`) launch: dùng **alternate video có sẵn trên máy** `C:\Users\TTC\AppData\Local\Temp\test_ai_21m.mp4` (TED-Ed AI, 21:43, ~135 MB, có MP4 đầy đủ) — chạy pipeline A→Z + hardcode sub. PO sẽ có MP4 có sub tiếng Việt trong Thư Mục Thành Phẩm (`C:\Users\TTC\AppData\Roaming\com.sublix.desktop\downloads\test_ai_21m_VI_dubbed_HARDSUB.mp4`).
- **Khi PO thức:** check file MP4 mới trong Thư Mục Thành Phẩm + cho em biết URL khác (video CÓ video stream MP4) nếu muốn em chạy đúng video R2nyc_oP9Yk.

---

### 2026-10-07 06:43 - Mavis (MiniMax-M3)
- **Loại:** `@info` cho CommandCode + PO — **đã test end-to-end lồng tiếng video DeepSeek T2dnchLabZQ rồi (07/10 ~03:20)**
- **Deliverable (CLI test, không qua App GUI):** dùng Rust example `test_dubbing_video.exe` (em viết 06/10) với video T2dnchLabZQ 14:47 (309 MB) đã có sẵn trong downloads → output `test_deepseek_T2dnchLabZQ_VI_dubbed.mp4` (315.9 MB, AAC Vietnamese audio, VP9 video giữ nguyên, 884.66s khớp input).
- **Kết quả đo thật:** Stage 1 (Whisper + diarize + LLM script + translate) = 56.7s; Stage 2 (Edge-TTS 131 segments + atempo + remux) = 20m36s; TỔNG = **21m33s**.
- **Chất lượng dịch:** rất tốt (giữ brand names DeepSeek, API; văn nói tự nhiên).
- **⚠️ Known issues:** (1) diarization over-cluster ra 6 speakers cho video 1-host; (2) audio track không có `language=vie` tag.
- **PO thấy file đâu:** copy từ `C:\Users\TTC\AppData\Local\Temp\test_deepseek_T2dnchLabZQ_VI_dubbed.mp4` sang `C:\Users\TTC\AppData\Roaming\com.sublix.desktop\downloads\DeepSeek V4.1 Flash Is INSANELY GOOD! Fast, Cheap, Powerful! (Fully Tested) [T2dnchLabZQ]_VI_dubbed.mp4` — bấm nút **"📁 Mở Thư Mục Thành Phẩm"** trong tab Lồng Tiếng sẽ thấy file lồng tiếng ngay cạnh video gốc.
- **Trạng thái kế hoạch A→Z (TASK_A_Z_ONE_CLICK.md):** em chưa bắt đầu code S1→S5 (anh dặn "tạm dừng đọc tài liệu" 06:35). Sẵn sàng làm khi PO bật đèn xanh.
- **CommandCode chú ý:** đã có output lồng tiếng thật ở Thư Mục Thành Phẩm — em test xong rồi, không cần viết lại dubbing pipeline. Khi em bắt đầu S1→S5 sẽ dùng đúng pipeline Kokoro local 14 giọng (v0.9.9 đã có).

---

### 2026-10-06 17:45 - Anh Tuấn (PO) / ghi bởi CommandCode
- **Loại:** `@assign → Mavis (MiniMax-M3)` (dây chuyền 1-Click "Dán link → Video lồng tiếng A→Z") + `@info` (vụ "tìm file lạc" đã sửa)
- **Tóm tắt:** PO chốt đích: **tự chia câu + lồng tiếng cả video tải về từ A→Z, chạy được là trước, giọng đẹp làm sau.** Phân công: CommandCode viết kế hoạch + thẩm định — **Mavis viết code + tự test** (làm thỏa thích). Phiếu việc chi tiết: **`TASK_A_Z_ONE_CLICK.md`** (S1→S5, có checklist nghiệm thu).
- **Lưu ý phối hợp:** S4 **KHÔNG** viết lại diarization — agent khác đang làm V2 phân vai thật (`KE_HOACH_V2_PHAN_VAI_THAT.md`), chỉ cần chừa interface nối vào `analyze`.
- **Đã sửa sẵn cho Mavis (CommandCode, v0.9.10):** thành phẩm lồng tiếng mặc định gom vào **cùng Thư Mục Thành Phẩm với video tải về** (`dubbing/mod.rs` default output = `get_downloads_dir`), thêm nút đứng **"📁 Mở Thư Mục Thành Phẩm"** trong tab Lồng Tiếng (`open_thanh_pham_folder`) — hết cảnh "tải 1 nơi, lồng tiếng 1 nơi".
- **⚠️ LUẬT CHẠY THẬT:** bài chốt = dán 1 link YouTube thật → ra video lồng tiếng hoàn chỉnh trong Thư Mục Thành Phẩm (kèm ảnh/video bằng chứng `test-output-audit-giong/az-*`).
- **Việc tiếp theo:** Mavis đọc `TASK_A_Z_ONE_CLICK.md` → làm S1 → S5 → báo `@done` kèm video thành phẩm để PO nghe.

---

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







