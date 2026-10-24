# ISSUE_LOG.md — Sổ Tay Miễn Dịch Lỗi Kỹ Thuật Sublix

> **QUY TẮC GHI LỖI TIẾT KIỆM TOKEN (BẮT BUỘC):**
> 1. **Khi khởi động (Bước 0):** Đọc ngay **Bảng Tra Cứu Nhanh (Quick Index)** ở đầu file (5 giây nắm toàn bộ bẫy kỹ thuật của dự án). Chỉ đọc xuống phần chi tiết khi làm việc đụng tới file liên quan.
> 2. **Chỉ ghi lỗi có bài học kỹ thuật:** Ghi ngắn gọn **5 – 8 dòng/lỗi** (Triệu chứng → Root Cause → Cách phòng tránh).
> 3. **Không chép lặp sang file khác:** Chi tiết lỗi chỉ nằm duy nhất tại file này.

---

## ⚡ Bảng Tra Cứu Nhanh (Quick Index)

### 📌 Lỗi Đã Giải Quyết Trong Quá Trình Phát Triển Trước Đó:
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc phòng tránh (1 câu) | Status |
|----|------------------------|----------------|-----------------------------|--------|
| `BUG-H01` | Lỗi build release: `Access is denied (os error 5)` khi ghi đè `sublix.exe` | Windows OS / Tauri build | Trước khi build release, luôn chạy `Get-Process sublix` và kill tiến trình cũ | ✅ Fixed |
| `BUG-H02` | Ký tự tiếng Nhật/Trung/Việt bị biến thành dấu `????` khi test | PowerShell JSON pipe | Tránh dùng pipeline PowerShell cho JSON có ký tự CJK, dùng UTF-8 byte stream hoặc test qua Rust | ✅ Fixed |
| `BUG-H03` | Key MiniMax Token Plan `sk-cp-` báo lỗi `401 invalid api key` | `src-tauri/src/translate/server.rs` | Key `sk-cp-` bắt buộc phải gọi đến `https://api.minimax.io/v1`, không dùng `api.minimax.chat` | ✅ Fixed |
| `BUG-H04` | Model suy luận `MiniMax-M3` làm lộ khối `<think>...</think>` vào phụ đề | `src-tauri/src/translate/server.rs` | Bắt buộc gửi `"reasoning_split": true` trong body và lọc regex `<think>` ở post-process | ✅ Fixed |
| `BUG-H05` | Whisper CUDA báo thiếu `cublas64_12.dll` trên máy chưa cài CUDA Toolkit | `src-tauri/Cargo.toml` / runtime | Luôn sao chép các DLL cu12 runtime (`cublas64_12.dll`, `cudart64_12.dll`) đi kèm thư mục release | ✅ Fixed |
| `BUG-H06` | Phân vai Diarization bị gán 1 người nói do mốc SRT Whisper liên tục (`pause = 0`) | `src-tauri/src/dubbing/mod.rs` | Kích hoạt đổi vai khi câu trước kết thúc bằng dấu chấm/chấm than/hỏi (`prev_ends_terminal`) | ✅ Fixed |
| `BUG-H07` | Lỗi WebView2 `ERR_CONNECTION_REFUSED` do build bằng `cargo build` thô | Tauri Build / Config | CẤM dùng `cargo build --release` để build app; bắt buộc dùng `npx tauri build --no-bundle` (hoặc chạy dev mode `npm run tauri dev`) | ✅ Fixed |
| `BUG-H08` | Dev mode: app ghi file runtime (samples/model) vào `src-tauri/models/...` → `tauri dev` watcher tưởng đổi code → **tự restart & giết tiến trình đang chạy** (tạo mẫu nghe thử tạo ra 0 file) | `config.rs` app_base_dir (dev = `CARGO_MANIFEST_DIR`) + tauri dev watcher | GUI-test tính năng ghi model: chạy `npm run tauri dev -- --no-watch`; release không dính | 🟡 Workaround |
| `BUG-H09` | Win11 có **Smart App Control** bật → WDAC chặn `llama-server.exe` (chưa ký): *"An Application Control policy has blocked this file"* → dịch offline GGUF fail, nhưng `whisper-cli.exe` vẫn chạy | `translate/server.rs` (spawn `llama-server.exe`), `stt/whisper_local.rs` | Sẵn sàng provider **Ollama** (binary có chữ ký hợp lệ) làm fallback; không `Unblock-File` (file không có MOTW); muốn dùng GGUF thì phải tắt SAC | 🔴 Open |
| `BUG-H10` | Provider Ollama timeout 25s (batch 60s) → dịch fail *"operation timed out"*; Qwen3 bản **"Thinking"** sinh 500-2100 token suy luận (mất 50-110s) | `translate/server.rs` (`translate_via_ollama`, `translate_batch_via_ollama`) | Timeout Ollama ≥120s (lần nạp model đầu mất 45-95s) + gửi `"think": false`; preset AMD ưu tiên **Qwen2.5-3B** (không thinking, ~6s) thay vì Qwen3-4B | ✅ Fixed |
| `BUG-H11` | App **ép binary whisper-CUDA** dù người dùng đã chọn STT engine = "CPU" → Whisper fail *"không tạo được phụ đề"* (đúng lệnh CLI chạy thì tốt) | `stt/whisper_local.rs` (`find_whisper_cli_with_engine`) | Chọn binary theo `stt_engine_preference`: Cpu→CPU, Cuda→CUDA (fallback CPU), Auto→CUDA trước | ✅ Fixed |
| `BUG-H12` | Xuất video fail *"FFmpeg amix chunk render failed"* trên ffmpeg 8+ | `dubbing/mod.rs` (`render_amix_chunk`, remux) | ffmpeg 9 đã **gỡ `-filter_complex_script`** → truyền graph trực tiếp qua `-filter_complex` (Rust không qua shell nên không lỗi quoting) | ✅ Fixed |
| `BUG-063` | Studio không đổi được video khác do effect dính `filePath` & Thiếu xuất Softsub / Multi-track Audio | `SublixStudioView.tsx`, `dubbing/mod.rs` | Bỏ state nội bộ khỏi deps của prop sync effect, tập trung reset state qua `handleLoadNewVideoFile` và gọi `onClearPendingFile` | ✅ Fixed |
| `BUG-082` | `kuaishou` & `migu` vẫn được `get_platform` nhận diện nhưng **yt-dlp (2026.10.21) KHÔNG có extractor** → dán link sẽ ăn `Unsupported URL`; hint cũ còn khuyên "cập nhật yt-dlp" (vô ích vì upstream chưa hỗ trợ) | `downloader/mod.rs`, `downloader/reup.rs`, `downloader/batch.rs` | Chặn **SỚM** ở `fetch_video_info`/`start_download`/`expand_playlist` + báo tiếng Việt rõ ràng, KHÔNG gợi ý cập nhật yt-dlp | ✅ Fixed |
| `BUG-H13` | Edge-TTS vi-VN **trả 0 byte** cho một số câu tiếng Việt; `synthesize_speech()` không retry ⇒ câu đó **mất tiếng** trong bản dịch | `dubbing/mod.rs` (`synthesize_speech`) | Retry 3–5 lần (giãn 1–1,5 s) + kiểm tra file đầu ra > 0 byte; coi Edge-TTS là fallback, không phải mặc định | 🔴 Open |
| `BUG-H14` | **SenseVoice int8 bản 2025-09-09 rớt chữ** — model + `tokens.txt` lệch tokenizer ⇒ WER **40,19 %** (bản fp32 cùng repo vẫn đúng) | `stt/stt_catalog.rs` (chọn bản model) | Chỉ dùng bản **2024-07-17** (int8 khớp fp32 100 %); **luôn verify SHA-256** file `model` + `tokens` sau khi tải | ✅ Fixed (task `TSK-FEAT-STT-ENGINES`) |
| `BUG-H15` | Bản mirror HF của **Parakeet** không tương thích `sherpa-onnx 2.0.0`: encoder cần tensor `[N,C,T]` còn runtime truyền `[N,T,C]` → *"Got invalid dimensions for input: audio_signal"*; `decoder.int8.onnx` cũng thiếu metadata `vocab_size` | `stt/stt_catalog.rs`, `scripts/sherpa_asr.py` | Chỉ dùng **gói release chính thức** của sherpa-onnx (có SHA-256 trong GitHub API); nếu mirror HF thì phải tự **patch metadata** `vocab_size`/`context_size` vào decoder | 🔴 Open (chưa tải được release — mạng nghẽn) |
| `BUG-H16` | Sự kiện tiến trình tải model báo **`speed_bps = 0` ở event đầu tiên** (đo tốc độ theo cửa sổ 500 ms nhưng emit mỗi 250 ms) ⇒ UI hiện "— MB/s" và ETA rỗng lúc đầu | `src-tauri/src/model_download.rs` (`SpeedMeter`) | Đo tốc độ theo **cửa sổ trượt 1,2 s**, tối thiểu 200 ms mới tính ⇒ event đầu tiên đã có tốc độ + ETA | ✅ Fixed (task `TSK-FEAT-STT-ENGINES`) |
| `BUG-H17` | Tải **release asset của GitHub bị nghẽn 0 byte** từ máy dev (cả `curl` lẫn `urllib`, retry 3 lần) trong khi Hugging Face tải bình thường | `src-tauri/src/model_download.rs` | Mọi model phải có **URL dự phòng** (HF mirror) + `Resume` bằng HTTP `Range`; không được coi "0 byte" là thành công | 🟡 Workaround (đã thêm `fallback_url`) |
| `BUG-H18` | **2 lượt tải cùng 1 model chạy song song** ghi chung file `.part` ⇒ file hỏng (đúng kích thước nhưng **sai SHA-256**), không tự phát hiện | `src-tauri/src/model_download.rs` | Giữ **khoá in-process** theo `model_id` (`is_in_progress`): lượt thứ hai bị từ chối, không ghi cùng file; luôn verify byte **và** SHA-256 trước khi cài | ✅ Fixed (task `TSK-FEAT-STT-ENGINES`) |
| `BUG-H20` | **PowerShell 5.1 làm hỏng file UTF-8**: `Get-Content -Raw` đọc file UTF-8 **không BOM** theo ANSI (Windows-1252) rồi `Set-Content -Encoding UTF8` ghi lại ⇒ **toàn bộ** file thành mojibake (`Tiến` → `Tiáº¿n`, `—` → `â€"`); `-Encoding UTF8` còn **thêm BOM** | mọi file `.ts/.tsx/.css` sửa bằng PowerShell | **Không dùng PowerShell để sửa file nguồn.** Dùng tool sửa file (edit/write) hoặc **Node** (`fs.readFileSync/writeFileSync` với `"utf8"`); nếu buộc dùng PS thì `Get-Content -Encoding UTF8` **và** `Set-Content -Encoding UTF8` phải đi **cùng nhau** (và nhớ BOM) | ✅ Fixed (task `TSK-UI-REDESIGN-R2-7C`) |
| `BUG-085` | **Cài đặt ghi đè API key bằng chuỗi rỗng**: `fullConfig` nạp lúc mở app, key được nạp thẳng vào file sau đó → bấm "Lưu" ghi bản cũ (key = "") và **xoá key thật** (đã xảy ra với minimax/openrouter) | `src/views/settings/configMerge.ts` (mới), `SettingsView.tsx` | **Luôn đọc lại config từ đĩa ngay trước khi lưu**, gộp bằng hàm thuần; chỉ ghi field vừa sửa + key VỪA GÕ (rỗng = giữ nguyên); xoá key phải là hành động chủ động | ✅ Fixed |

---

### 🔍 25 Lỗi Thẩm Định Code Toàn Diện (CommandCode Audit 2026-10-04):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-001` | Đường dẫn model/binary nướng cứng lúc compile — app chỉ chạy được trên máy build | `translate/mod.rs`, `stt/whisper_local.rs`, `lib.rs` | Không dùng `CARGO_MANIFEST_DIR` cho tài nguyên runtime — resolve theo `current_exe()`/`app_data_dir` | ✅ Fixed |
| `BUG-002` | Tắt app không kill whisper-server/llama-server → tiến trình ma giữ RAM/VRAM/cổng | `stt/whisper_server.rs`, `translate/server.rs` | Tiến trình con phải trong Job Object kill-on-close hoặc kill ở `RunEvent::Exit` | 🔴 Open |
| `BUG-003` | `taskkill /IM /F` giết bừa tiến trình trùng tên; port cố định → 2 app giết nhau | `stt/whisper_server.rs`, `translate/server.rs` | Chỉ kill PID mình spawn + thêm single-instance guard | 🔴 Open |
| `BUG-004` | Dịch offline hỏng trên cài đặt mới: `ensure_binary()` không ai gọi → thiếu `llama-server.exe` | `translate/mod.rs`, `translate/server.rs` | Hàm cài đặt tài nguyên bắt buộc phải có caller trong luồng onboarding | 🔴 Open |
| `BUG-005` | Xuất lồng tiếng fail mọi phim >32 câu (`amix` tối đa 32 input) | `dubbing/mod.rs` | Dựng filter ghép nhóm chunk hoặc dùng filter script | ✅ Fixed |
| `BUG-006` | `overflow: hidden` toàn cục: onboarding không cuộn được, phụ đề overlay bị cắt cụt | `App.css`, `views/OverlayView.css`, `tauri.conf.json` | Chỉ chặn cuộn ở cửa sổ overlay, không chặn ở `html/body` | ✅ Fixed |
| `BUG-007` | Lọt nghe sự kiện Tauri (`listen().then` cleanup trễ) → nhân đôi dữ liệu, tải model 2 lần | `views/*.tsx` | Cleanup phải hủy chính promise `listen()`: `p.then(u => u())` | ✅ Fixed |
| `BUG-008` | Xuất SRT từ lịch sử bịa timestamp 3s/đoạn → lệch sync hoàn toàn với video | `views/SettingsView.tsx` | Dùng timestamp thật từ event (`audio/live.rs`), không tự bịa giờ | ✅ Fixed |
| `BUG-009` | Đổi tab khi đang tạo phụ đề → mất kết quả im lặng (file vẫn được ghi) | `views/SettingsView.tsx`, `views/FileSubView.tsx` | State của job đang chạy phải sống ở cấp cha hoặc store | 🔴 Open |
| `BUG-010` | Lệnh sync chặn main thread 60–90s → UI đơ cứng (test dịch, test STT, quét thiết bị) | `src-tauri/src/lib.rs` | Tauri command nặng phải `async` + `spawn_blocking` | 🔴 Open |
| `BUG-011` | Bấm Start Live 2 lần → báo lỗi giả "already running" dù lần đầu thành công | `views/SettingsView.tsx` | Nút async phải khóa ngay trong handler bằng cờ `starting` đồng bộ | 🔴 Open |
| `BUG-012` | Tải model không kiểm tra đủ byte, không resume → file thiếu được nhận là "tải thành công" | `stt/whisper_local.rs`, `translate/mod.rs` | Trước khi rename phải verify `downloaded == total`; timeout riêng connect/read | 🔴 Open |
| `BUG-013` | Config hỏng → reset mặc định, lần lưu sau ghi đè mất API key; ghi file không atomic | `config.rs`, `lib.rs` | Ghi temp + rename; file hỏng thì backup `.bak`, không ghi đè im lặng | ✅ Fixed |
| `BUG-014` | API key MiniMax lưu trần + phát tán nguyên trạng qua event `config:updated` | `config.rs`, `lib.rs` | Key phải mã hóa (DPAPI/Credential Manager) và loại khỏi payload event | 🔴 Open |
| `BUG-015` | Bộ lọc ảo giác quét `contains` → xóa oan câu thoại thật ("tạm biệt", "see you soon"…) | `stt/whisper_local.rs` | Chỉ so khớp gần chính xác; cấm `contains` với cụm hội thoại thông dụng | ✅ Fixed |
| `BUG-016` | Live mà whisper-server die thì im lặng: không fallback, không báo lỗi lên UI | `audio/live.rs` | Fallback subprocess như `transcribe_test` + emit `status:change` lỗi | 🔴 Open |
| `BUG-017` | Dubbing hardcode đường dẫn ffmpeg/edge-tts máy dev; thiếu Demucs thì trộn lời gốc im lặng | `dubbing/mod.rs` | Tool tìm qua PATH/config; thiếu tool ở chế độ cách ly thì phải fail rõ ràng | 🔴 Open |
| `BUG-018` | Chỉ tải bản CPU, bản CUDA không bao giờ được cấp → "Auto/GPU" âm thầm chạy CPU | `translate/mod.rs`, `stt/whisper_local.rs` | URL tải phải đủ biến thể engine, hoặc nói rõ cho người dùng | 🔴 Open |
| `BUG-019` | Giữ mutex server qua network I/O → poll trạng thái có thể đông cứng UI tới 45s | `stt/whisper_server.rs`, `translate/server.rs` | Không giữ lock ngoài HTTP call; cache engine trong `AtomicU8` | 🔴 Open |
| `BUG-020` | Race `clear_live_flag` xóa cờ phiên mới (live không dừng được); stop không join thread → phiên cũ giành lại model | `audio/live.rs` | Chỉ xóa cờ của chính phiên mình (`Arc::ptr_eq`); join thread khi stop | 🔴 Open |
| `BUG-021` | Fallback bỏ qua lựa chọn engine (chọn "cpu" vẫn chạy CUDA); timeout 60/90s kill model load chậm → âm thầm hạ CPU | `lib.rs`, `stt/whisper_server.rs` | Truyền `EnginePreference` vào fallback; phân biệt "thiếu binary" với "khởi động chậm" | 🔴 Open |
| `BUG-022` | Rò rỉ file WAV tạm (mỗi lần HTTP fail + file kẹt hàng đợi khi stop); temp theo PID → 2 job dẫm nhau | `stt/whisper_server.rs`, `audio/live.rs`, `file_sub.rs` | Dùng drop-guard/tempfile; hậu tố UUID như `gen_unique_id()` | 🔴 Open |
| `BUG-023` | Cắt byte cứng output ffmpeg → panic với tên file tiếng Việt; hỏng thì trả bịa "2.0" | `dubbing/mod.rs` | Parse bằng regex + `str::get()`; lỗi thì báo fail, không bịa số | ✅ Fixed |
| `BUG-024` | Nhóm lỗi UI nhỏ (thanh cuộn bị ẩn toàn app, khe chọn model trống, VU meter kẹt, slider ghi config dồn dập, preview đảo thứ tự, CSS trùng class, SRT thiếu BOM) | `App.css`, `views/*` | Mọi control phải có trạng thái rỗng/lỗi | 🟡 Partially Fixed |
| `BUG-025` | Nhóm edge-case (audio 24-bit im lặng ra rỗng, `post_process` xóa ký tự CJK, context dịch lẫn lộn, file dead `stt/model.rs`+`whisper.rs`+`openai.rs`, CSP null) | `audio/live.rs`, `translate/server.rs`, `stt/` | Format không hỗ trợ thì báo lỗi; không xóa ký tự đơn lẻ | 🔴 Open |

---

### 🔎 18 Lỗi Rà Code Đợt 2 — Code Mới Antigravity (CommandCode Review 2026-10-04):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-026` | 🔴 amix tầng 2 tái sinh lỗi >896 câu (`inputs={số nhóm}` không giới hạn) — BUG-005 quay lại từ cửa sau | `dubbing/mod.rs:840` | Mọi tầng trộn amix đều phải bất biến ≤32 input (gom lũy tiến cả tầng nhóm) | ✅ Fixed |
| `BUG-027` | "Hủy tức thì" không kill tiến trình con; giai đoạn tách nhạc/ghép video không có điểm kiểm tra hủy | `dubbing/mod.rs:441,777,914` | Cancel = kill Child handle + checkpoint mọi giai đoạn, không chỉ cờ bool | ✅ Fixed |
| `BUG-028` | Cờ hủy dùng chung bị reset khi chạy job mới → job cũ "hồi sinh", 2 pipeline chạy song song | `dubbing/mod.rs:23,382,658` | Dùng run-generation `AtomicU64`, mỗi run tự giữ số thế hệ của mình | ✅ Fixed |
| `BUG-029` | Dịch lỗi âm thầm lồng **nguyên văn tiếng gốc** vào video thành phẩm, không cảnh báo | `translate/mod.rs:350` | Fallback phải đánh dấu `translate_failed` + báo UI, không `item.clone()` trá hình | ✅ Fixed |
| `BUG-030` | Âm lượng lệch tới 28× giữa các cụm amix (cụm lẻ được hưởng to bất thường) | `dubbing/mod.rs:812-846` | `amix=...:normalize=0` + volume từng nguồn; không dùng dropout_transition=0 | ✅ Fixed |
| `BUG-031` | Rò rỉ listener async-unlisten (lặp lại BUG-007) ở FileSub + Dubbing; đổi tab → 2 job GPU dẫm nhau | `FileSubView.tsx:96-160`, `DubbingStudioView.tsx:83-121`, `file_sub.rs:207` | Cleanup phải hủy chính promise `listen()`; backend guard "đang chạy" như `live.rs:70` | ✅ Fixed |
| `BUG-032` | Thả file mới giữa lúc đang xử lý → xóa tiến độ + kết quả cũ gán nhầm vào file mới | `FileSubView.tsx:104-109` | Mọi đường vào đổi state (drop/chọn) phải check `processing` bằng ref | ✅ Fixed |
| `BUG-033` | Phím tắt Ctrl+Shift+L dùng cài đặt cũ (stale closure) — đổi model/ngôn ngữ không ăn theo | `SettingsView.tsx` (hotkey effect) | Handler trong keydown phải đi qua `latestRef` hoặc deps đầy đủ | ✅ Fixed (task `TSK-UI-REDESIGN-R2-7B`) |
| `BUG-034` | FileSubView không lưu cài đặt (đổi tab là mất); model trong config bị `useState` đóng băng bỏ qua | `FileSubView.tsx:57-62` | State người dùng phải đồng bộ 2 chiều với `AppConfig` | 🔴 Open |
| `BUG-035` | CustomSelect không dùng được bàn phím; giá trị lạ hiện "chọn tùy chọn" nhưng vẫn gửi thật; dropdown bị cắt ở đáy | `CustomSelect.tsx:34,43`, `CustomSelect.css:112` | Custom control phải có đủ bàn phím + fallback hiển thị giá trị thật | 🔴 Open |
| `BUG-036` | Kéo-thả lỏng: thư mục giả đuôi `.mp4` lọt, `.ts` (mã nguồn) lọt, path HTML5 là tên tương đối, path `file://` không chuẩn hóa | `FileSubView.tsx:78-93,279` | Validate is_file + path tuyệt đối trước khi chạm backend | 🔴 Open |
| `BUG-037` | Nhãn "Bản Đang Dùng" hardcode trong ChangelogModal → bump version là chỉ sai bản | `ChangelogModal.tsx:29` | Cờ trạng thái phải derive từ `currentVersion`, không hardcode | 🔴 Open |
| `BUG-038` | Modal "giả": không trap focus/scroll-lock, hotkey Live vẫn nổ sau lưng modal | `ChangelogModal.tsx:132-151` | `aria-modal` phải đi kèm focus trap + gate hotkey theo modal đang mở | 🔴 Open |
| `BUG-039` | 1 dòng TTS lỗi (`?`) hủy cả export hàng giờ; `dubbed_text` rỗng lọt lưới thành TTS text rỗng | `dubbing/mod.rs:709-715` | Lỗi 1 phân tử phải skip/retry, không được phép hủy cả batch lớn | 🔴 Open |
| `BUG-040` | Ghép câu nuốt mất đổi vai (ngưỡng 0.45s < 0.85s mâu thuẫn); end time có thể đi ngược làm lồng tràn câu sau | `dubbing/mod.rs:328-350` | Ngưỡng heuristic phải nhất quán; khi merge dùng `prev.1 = max(prev.1, end)` | 🔴 Open |
| `BUG-041` | Fallback dịch từng câu không kiểm tra cờ hủy → cancel rồi vẫn chạy thêm ~10 phút | `translate/mod.rs:350-352` | Token hủy phải xuyên suốt mọi vòng lặp con | ✅ Fixed |
| `BUG-042` | Nghe thử giọng phát chồng nhau (giọng về sau thắng); audio không dừng khi rời tab; hủy hiện như chữ đỏ "lỗi" | `DubbingStudioView.tsx:149-164,206,67` | Preview dùng request-sequence + cleanup unmount + phân biệt cancel/error | 🔴 Open |
| `BUG-043` | Nhóm nhỏ: toggle mất focus-visible, range limit nói quá thời lượng clip ngắn, chữ trắng trên nền cam thiếu tương phản, theme bấm trước khi config load bị ghi đè | `FileSubView.css:378`, `dubbing/mod.rs:632`, `ChangelogModal.css:97`, `SettingsView.tsx` | Mọi control cần :focus-visible; duration = min(limit, thật); kiểm tương phản chữ/nền accent | 🔴 Open |

---

### 🧪 15 Lỗi Rà Tab Tải Video Phase 1 (CommandCode Review 2026-10-04 — code Antigravity + kế thừa hermes):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-044` | 🔴 LỖ HỔNG BẢO MẬT: dán chuỗi bắt đầu bằng `--` vào ô link → yt-dlp hiểu nhầm là cờ lệnh, có thể chạy lệnh tùy ý (`--exec`, nạp config từ xa) | `downloader/mod.rs:203,254` | Chỉ nhận URL `http(s)://` + truyền URL sau dấu `--` ngăn cách | 🔴 Open |
| `BUG-045` | 🔴 Đổi tab khi đang tải → mất sự kiện: file tải xong kẹt "Đang tải" mãi, mất luôn nút Tạo Phụ Đề / Lồng Tiếng | `DownloaderView.tsx:156`, `SettingsView.tsx:919` | Nghe sự kiện việc đang chạy phải sống ở cấp cha, không sống trong tab có thể bị tháo | 🔴 Open |
| `BUG-046` | 🔴 Tải hỏng vẫn báo "thành công" với **file của job khác** (im lặng thay kết quả sai — điều cấm) | `downloader/mod.rs:415-434` | Chỉ báo thành công khi xác nhận đúng file của chính job đó | 🔴 Open |
| `BUG-047` | 🔴 Hủy 1 job lại xóa file tải dở của **mọi** job trong thư mục → phá luôn tính năng "tải tiếp khi mạng rớt" | `downloader/mod.rs:510-518` | Chỉ được xóa file tạm của chính job bị hủy | 🔴 Open |
| `BUG-048` | 🔴 Trùng id tải → job cũ thành tiến trình ma không kill được, 2 pipeline chạy song song (BUG-028 tái diễn) | `downloader/mod.rs:314-324` | Id đã tồn tại phải từ chối hoặc đánh số thế hệ mới | 🔴 Open |
| `BUG-049` | 🟠 Tiến trình "NaN%" → lưu lại thành null → mở app lên **crash trắng tab** Tải Video | `DownloaderView.tsx:165,620,624` | Mọi % nhận về phải lọc số hợp lệ trước khi dùng/lưu | 🔴 Open |
| `BUG-050` | 🟠 Tắt app giữa lúc tải → mở lại hiện mục "ma" kẹt "Đang tải", không có nút Thử lại | `DownloaderView.tsx:130-153` | Khi mở lại, việc dở dang phải chuyển thành "bị gián đoạn" + nút Thử lại | 🔴 Open |
| `BUG-051` | 🟠 Thiếu kiểm tra dung lượng ổ đĩa trước khi tải (kế hoạch bắt buộc — cả UI lẫn backend đều không có) | `DownloaderView.tsx`, `downloader/mod.rs:246` | Tải file nặng phải kiểm tra ổ cứng còn trống trước | 🔴 Open |
| `BUG-052` | 🟠 Nút thùng rác xóa mục đang tải mà KHÔNG hủy job → tiến trình ma ăn băng thông + ổ cứng | `DownloaderView.tsx:317-319` | Xóa mục đang chạy phải hủy job trước đã | 🔴 Open |
| `BUG-053` | 🟠 Bấm đúp nút Tải → tải 2 lần cùng 1 video (BUG-011 tái diễn, thiếu khóa chống bấm đúp) | `DownloaderView.tsx:216-264,519` | Nút async phải khóa ngay từ lúc bấm | 🔴 Open |
| `BUG-054` | 🟠 Vẫn hardcode `C:\Program Files\AI Automation` và tìm TRƯỚC cả PATH (vi phạm luật 1 kế hoạch, lặp BUG-001/017) | `downloader/mod.rs:68-79` | Thứ tự: PATH → cạnh file exe → người dùng chỉ — cấm hardcode | 🔴 Open |
| `BUG-055` | 🟠 Quên cờ `--no-playlist` → dán link playlist là tải nguyên cả playlist mà không hỏi | `downloader/mod.rs:253-259` | Mặc định tải 1 video; playlist phải là lựa chọn chủ động | 🔴 Open |
| `BUG-056` | 🟡 Nhóm đọc tiến trình kiểu cũ: đoán % bằng đọc chữ tự do (vi phạm luật 2), bắn sự kiện quá nhiều làm giật UI, lỗi stderr chỉ hiện 1 dòng | `downloader/mod.rs:257,342-374,390,411` | Dùng `--progress-template` số thuần; bóp sự kiện ~4-10 lần/giây; đọc hết stderr | 🔴 Open |
| `BUG-057` | 🟡 Nhóm vận hành: không Job Object (kill app là để ma yt-dlp/ffmpeg), lệnh hủy chạy chặn UI, xem trước video không có timeout (treo vô hạn), pause/hủy lỗi im lặng + bấm đúp, thiếu dự phòng `cookies.txt` | `downloader/mod.rs:267,505-579`, `lib.rs:1015` | Tiến trình con trong Job Object; lệnh lâu phải async + timeout; lỗi phải hiện màn hình | 🔴 Open |
| `BUG-058` | 🟡 Nhóm vặt: chọn 4K nhưng thực chất không bao giờ được 4K (thiếu cờ ghép video+audio rời), thiếu ghi nhận MIT khi kế thừa, nhận diện nhầm tên miền (`fox.com` → twitter), đường dẫn truyền sang File Sub không kiểm tra, lỗi có khi hiện "[object Object]", trạng thái "đã hủy" mất nút Thử lại | `downloader/mod.rs:165,106,594`, `DownloaderView.tsx` | Mọi lựa chọn phải cho đúng kết quả đã hứa; đường dẫn phải chuẩn hóa trước khi truyền | 🔴 Open |

### 🧾 2 Lỗi Fix Tại v0.9.2 (CommandCode — 2026-10-06):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-V092-01` | Kiểm Tra Link: lỗi serde thô `EOF while parsing a value at line 1 column 0` / mất hẳn stderr khi yt-dlp lỗi | `downloader/mod.rs` (`fetch_video_info`) | `spawn()` + `wait_with_output()` BẮT BUỘC phải kèm `Stdio::piped()` cho stdout+stderr — `output()` tự pipe, `spawn()` thì không | ✅ Fixed |
| `BUG-V092-02` | Tải phụ đề 4 ngôn ngữ bị HTTP 429 khi chạy dồn; job báo ❌ Lỗi oan dù video đã tải xong | `downloader/mod.rs` (`build_download_command` + worker) | Sub giãn cách `--sleep-subtitles 5`; lỗi CHỈ ở sub + media đã có ⇒ báo `completed` + cảnh báo UI (không nuốt lỗi) | ✅ Fixed |

### 🧾 1 Lỗi Fix Tại v0.9.3 (CommandCode — 2026-10-06):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-V092-03` | Video tải xong thật nhưng app báo ❌ Lỗi "không in ra đường dẫn file" — dòng path yt-dlp in ra bị mất ký tự codepage không biểu diễn được (`：｜`, CJK) khi output không phải UTF-8 | `downloader/mod.rs` (`start_download`, `build_download_command`) | KHÔNG chỉ tin chuỗi in ra: xác minh "bằng chứng gốc" trên ổ đĩa theo mã video + ép `PYTHONIOENCODING=utf-8`/`PYTHONUTF8=1` cho mọi tiến trình yt-dlp | ✅ Fixed |

### 🧾 1 Lỗi Fix Tại v0.9.4 (CommandCode — 2026-10-06):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-V094-01` | Nút "Mở Thư Mục": spawn `explorer.exe /select,"file"` từ app thành công nhưng KHÔNG mở cửa sổ (gọi y hệt từ PowerShell thủ công thì mở được) | `downloader/mod.rs` (`reveal_downloaded_file`) | KHÔNG spawn `explorer.exe /select,"path"` từ Rust Command (argv-quoting bị explorer parse sai) — dùng shell API `SHOpenFolderAndSelectItems` | ✅ Fixed |

### 🧾 2 Lỗi Fix Tại v0.9.5–v0.9.6 (CommandCode — 2026-10-06):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-V095-01` | Chọn "MAX" nhưng mọi video chỉ tải được 640x360 — ép `youtube:player_client=android,web_safari,ios` làm YouTube ẩn hết format DASH (SABR-only) | `downloader/mod.rs` (`build_download_command`, `fetch_video_info`) | KHÔNG ép player_client cũ cho YouTube — để yt-dlp tự chọn client (kèm js-runtime + ejs solver); kiểm tra bằng `-F` | ✅ Fixed |
| `BUG-V095-02` | Tải video gặp `ERROR: unable to download video data: HTTP Error 403: Forbidden` (yt-dlp thiếu impersonation target) | Môi trường Python (không phải code) | Cài `curl_cffi` (`python -m pip install curl_cffi`) — máy mới BẮT BUỘC có | ✅ Fixed |

### 🧾 2 Lỗi Fix Tại v0.11.30 (Antigravity — 2026-10-12):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-059` | Nút "Chạy Video" làm Windows Media Player ngoài Desktop bật lên thay vì phát trong Studio | `src/views/DownloaderView.tsx` | Nút chính mặc định phải là "🚀 Xem Trong Studio" (`handlePlayInStudio`); nút mở ngoài đổi thành "🖥️ Player Ngoài" | ✅ Fixed |
| `BUG-060` | Video 25 phút (323 câu) làm treo timeline + bấm Play đứng im + ffmpeg transcode ngầm 100% CPU | `src/views/SublixStudioView.tsx` | Memoize SegmentCard/TimelineBlock (`React.memo`), throttle `onTimeUpdate` 120ms, cấm transcode khi video đang pause, native video listeners | ✅ Fixed |

### 🧾 Lỗi Fix Tại v0.11.31 (CommandCode — 2026-10-13):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-061` | Checkbox "trích xuất phụ đề" bật nhưng không ra file: phụ đề chạy CHUNG lệnh tải video → track dịch bị YouTube chặn 429 làm chết cả phase sub | `src-tauri/src/downloader/mod.rs`, `src/views/DownloaderView.tsx` | Việc phụ phải chạy PASS RIÊNG sau việc chính (`--skip-download ... --ignore-errors`) + đối chiếu file thật trên đĩa (`scan_subtitle_langs`), không bao giờ để lỗi phụ kéo chết việc chính | ✅ Fixed |

### 🧾 Lỗi Quan Sát Tại v0.11.32 (CommandCode — 2026-10-13):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-062` | 6 tiến trình ffmpeg treo bám video cache cũ ("Meta's…") chạy ngầm ăn CPU 600–800s mỗi tiến trình, không tự thoát (quan sát khi GUI-test v0.11.32) | `src/views/SublixStudioView.tsx` (preview/transcode/filmstrip khi restore project cache) | Khi restore project từ cache: tác vụ preview/transcode phải có guard hủy theo video-idle/đổi file; không spawn nhiều ffmpeg song song cho cùng file | 🔴 Open (cần soi root cause) |

### 🧾 Lỗi Fix Tại v0.11.34 (Mavis — 2026-10-20):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-073` | Version drift: field `version` = 0.11.33 nhưng 2 tiêu đề cửa sổ native còn sót `v0.11.32`; script guard `check_version.ps1` bị mất trong lúc rollback | `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` | Bump version phải sửa CẢ 4 nguồn + 2 tiêu đề cửa sổ, và chạy `npm run verify:version` trước khi commit | ✅ Fixed |

### 🧾 Lỗi Fix Tại Timeline Studio — Kéo thả / Vùng In-Out / Tốc độ (Claude Sonnet 5.5 Orca worker — 2026-10-24):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-076` | Timeline Studio **không kéo thả được khối** (kéo giữa = không dời, kéo mép = không trim; mép chỉ bấm nhích ±0.2s) | `src/views/SublixStudioView.tsx` | Khối timeline phải tự có `mousedown→drag` (transform DOM ref, commit `setSegments` khi thả, 1 bước Undo, snap ~8px, chặn chồng khối kề); marquee/scrub không được ăn mousedown của khối | ✅ Fixed |
| `BUG-077` | Ctrl/Shift+click chọn nhiều bị **gộp về 1 câu** — có 4 chỗ ép selection theo playhead (`handleSeek`, `onSeeked` native + prop JSX, effect `[currentTime,isPlaying,segments]`); effect còn reset selection mỗi khi `segments` đổi | `src/views/SublixStudioView.tsx` | Auto-follow selection CHỈ khi đang phát & không `multiSelectLockRef`; click chọn khối dùng `handleSeek(t, keepSelection=true)`; grep MỌI `setSelectedSegIds([match.id])` khi đổi logic chọn | ✅ Fixed |
| `BUG-078` | Tiếng lồng **tua giật khi tốc độ ≠ 1x**: video `playbackRate=1.5` nhưng audio lồng luôn 1x → lệch 0,5s/giây → `syncVoicePlayback` seek lại ~mỗi 0,7s (đo: 10 lần tua/7s ở 1.5x) | `src/views/SublixStudioView.tsx` (`syncVoicePlayback`) | Audio lồng phải `playbackRate = defaultPlaybackRate = playbackSpeed` mỗi lần nạp `src` (load reset rate về default) và khi đổi tốc độ | ✅ Fixed |
| `BUG-079` | Ducking: lúc kết thúc lồng tiếng ghi đè volume người dùng vừa chỉnh; volume = 0 bị "bật lại" thành 1.0 | `src/views/SublixStudioView.tsx` (`stopVoicePlayback`) | Chỉ khôi phục volume cũ nếu volume hiện tại còn = mức đã duck; volume ≈ 0 thì không duck | ✅ Fixed |
| `BUG-080` | Lệnh vùng In/Out sai: lọc "nằm TRỌN trong vùng" bỏ câu bị cắt ngang; pipeline vùng không lồng tiếng; đánh số lại id + thay cả roster → tiếng ghi nhầm câu / câu ngoài vùng mất vai; câu mới tràn quá Out đè câu kế; lỗi dịch/TTS bị nuốt; vùng 0 giây | `src/views/SublixStudioView.tsx` | Một quy tắc "câu thuộc vùng" duy nhất (chồng lấn: `isSegInRange`); thay câu bằng `mergeRangeSegments` (giữ id/vai câu ngoài vùng, cắt kết quả trong [In,Out]); bước TTS nối tiếp chỉ nhận `onlyIds` | ✅ Fixed |
| `BUG-081` | `isAnalyzing` kẹt `true` mãi (nút/menu AI khóa) khi pipeline `dubImmediately` bị lỗi hoặc ra 0 câu — `finally` chỉ nhả cờ khi `!dubImmediately`, `handleRunVoiceOnly` thoát sớm không nhả | `src/views/SublixStudioView.tsx` (`handleRunAnalysis`, `handleRunVoiceOnly`) | Mọi lối thoát của tác vụ chạy nối tiếp phải nhả cờ busy (kể cả `return` sớm và nhánh catch) | ✅ Fixed |

### 🧾 Lỗi Fix Tại TSK-FEAT-TTS-3ENGINES (Claude Sonnet 5.5 — 2026-10-24):
| ID | Lỗi / Triệu chứng ngắn | File liên quan | Quy tắc tránh lặp lại (1 câu) | Status |
|----|------------------------|----------------|-------------------------------|--------|
| `BUG-082` | TTS **bỏ rơi/đọc sai chữ số** (Kokoro: "24 tháng 10 năm 2026 … 3-1" → "tháng 5 ở … ở", WER 30%); tiền tố `vietneu:` là GIẢ (map sang Kokoro) | `dubbing/mod.rs`, `dubbing/vi_normalize.rs` | Chuẩn hóa số/ngày/giờ/tiền thành CHỮ trước MỌI engine (`normalize_vi`); tỷ số viết "ba một" (gạch nối khiến engine đọc "ba, một chiếc…": WER 15–20%) | ✅ Fixed (Kokoro s3 30%→10%) |
| `BUG-083` | `voice_models` tải model không verify byte + không tạo thư mục con → file thiếu vẫn "đã tải"; mục có subfolder (`onnx/…`) lỗi tạo file | `voice_models.rs` | `VoiceModelFile.bytes` chính xác + so khớp sau tải + `Content-Length` + `create_dir_all(parent)` (xử lý BUG-012 cho nhóm voice) | ✅ Fixed |
| `BUG-084` | Smart App Control chặn **exe test/build-script** mới biên dịch (`os error 4551`) — ngẫu nhiên theo hash | `cargo test` | Lỗi 4551: chạm file (đổi mtime) để biên dịch lại hash mới rồi chạy lại; dùng chung `CARGO_TARGET_DIR=%TEMP%\sublix-cc-target` (xem BUG-H09) | 🟡 Workaround |
| `BUG-H19` | **Đo lỗi tiếng Việt bằng cách bỏ dấu**: `ngươi` (đại từ cổ) và `người` (con người) bỏ dấu đều ra `nguoi` ⇒ metric "số dòng chứa ngươi" đếm sai hàng loạt dòng (đo 60 câu: 8 dòng thực chỉ có **2**) | `src-tauri/src/translate/pronoun_audit.rs` | Trước khi bỏ dấu, thay các cặp từ trùng nhau bằng sentinel riêng (`ngươi`/`người`, `cậu`/`câu`, `bạn`/`bàn`, `tao`/`táo`); cũng loại `chỉ` khỏi danh sách đại từ gọi nhau | 🟡 Workaround |

## 🔍 Chi Tiết Các Lỗi Kỹ Thuật Nghiêm Trọng

### [BUG-001] Đường dẫn model/binary nướng cứng lúc compile — app chỉ chạy trên máy build
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** 🟡 In Progress
- **File:** `src-tauri/src/translate/mod.rs:153`, `stt/whisper_local.rs:464+`, `stt/whisper_server.rs:273`, `translate/server.rs:312`, `lib.rs:796`
- **Nguyên nhân gốc (Root Cause):** `PathBuf::from(env!("CARGO_MANIFEST_DIR"))` là hằng số lúc biên dịch, trỏ cứng tới `H:\AI Project\sublix\src-tauri`. Khi đem file `sublix.exe` sang máy khác, toàn bộ binary và model không tìm thấy.
- **Cách fix & Bài học:** Dùng `std::env::current_exe()` để định vị thư mục thực thi trước, fallback `CARGO_MANIFEST_DIR` chỉ dùng cho dev/debug.

---

### [BUG-005] Xuất lồng tiếng fail mọi phim >32 câu — `amix` tối đa 32 input
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** 🟡 In Progress
- **File:** `dubbing/mod.rs:596-619` (`export_dubbed_video`)
- **Nguyên nhân gốc (Root Cause):** FFmpeg giới hạn `amix=inputs=32`. Khi clip có từ 33 câu thoại trở lên, lệnh FFmpeg lỗi ngay lập tức. Ngoài ra hàng trăm file input làm vượt giới hạn dòng lệnh Windows 32KB.
- **Cách fix & Bài học:** Gom nhóm các luồng audio thành các chunk `<= 30` inputs theo cây phân cấp, đồng thời ghi filter_complex ra file script `-filter_complex_script`.

---

### [BUG-015] Bộ lọc ảo giác quét `contains` → xóa oan câu thoại thật
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** 🟡 In Progress
- **File:** `stt/whisper_local.rs` (`is_hallucination`)
- **Nguyên nhân gốc (Root Cause):** Danh sách lọc chứa các câu thông dụng ("tạm biệt", "good night", "see you soon", "bye bye") và kiểm tra bằng `lower.contains(h) && char_count <= 45`. Bất kỳ câu thoại phim nào như "Tạm biệt em yêu!", "Good night darling" đều bị xóa sổ khỏi phụ đề.
- **Cách fix & Bài học:** Tách biệt cụm từ kết thúc video (outro/subscribe - cho phép `contains`) và cụm từ chào hỏi ngắn (chỉ xóa khi câu thoại CHÍNH XÁC là cụm từ đó mà không có nội dung khác).

---

### [BUG-023] Cắt byte cứng output ffmpeg → panic với tên file tiếng Việt; hỏng thì trả bịa "2.0"
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** 🟡 In Progress
- **File:** `dubbing/mod.rs:699-703` (`get_audio_duration`)
- **Nguyên nhân gốc (Root Cause):** `&stderr[pos+10..pos+21]` cắt byte cứng, nếu gặp ký tự đa byte tiếng Việt sẽ panic `not a char boundary`; nếu không tìm thấy thời lượng thì trả giả định `2.0s`.
- **Cách fix & Bài học:** Dùng regex hoặc parse chuỗi an toàn; không tìm được thì trả `Err` rõ ràng.

---

### [BUG-006] `overflow: hidden` toàn cục — onboarding không cuộn, phụ đề overlay bị cắt cụt
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** 🟡 In Progress
- **File:** `src/App.css`, `views/OverlayView.css`
- **Nguyên nhân gốc (Root Cause):** `html, body, #root { overflow: hidden !important; }` khóa cuộn toàn bộ webview.
- **Cách fix & Bài học:** Bỏ `overflow: hidden !important` toàn cục, chỉ đặt khóa cuộn trên cửa sổ Overlay.

---

### [BUG-H07] Lỗi WebView2 `ERR_CONNECTION_REFUSED` do build bằng `cargo build` thô
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** Anh Tuấn (User) | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src-tauri/tauri.conf.json`, Build Pipeline
- **Nguyên nhân gốc (Root Cause):** Chạy `cargo build --release` thô của Rust mà không thông qua Tauri CLI. Binary `.exe` được tạo ra không kích hoạt cờ nhúng tĩnh thư mục `dist/`, mà vẫn đọc cấu hình `devUrl: http://localhost:1420`. Khi user mở app mà máy không chạy Vite dev server, WebView2 hiển thị màn hình lỗi `ERR_CONNECTION_REFUSED`.
- **Cách fix & Bài học BẮT BUỘC:**
  1. Khi đang phát triển / test UI: **KHÔNG CẦN BUILD RELEASE!** Chạy ngay chế độ Dev bằng lệnh `npm run tauri dev` hoặc file [`C:\Users\TTC\Desktop\Chay-Sublix-Dev.bat`](file:///C:/Users/TTC/Desktop/Chay-Sublix-Dev.bat). Thay đổi code đến đâu, màn hình hot-reload ngay tức thì trong 0.1s.
  2. Khi đóng gói Release hoàn chỉnh: **CẤM DÙNG `cargo build`**. Bắt buộc dùng lệnh chuẩn của Tauri: `npx tauri build --no-bundle`. Lệnh này nhúng 100% assets tĩnh offline vào `.exe` và tắt bỏ hoàn toàn `devUrl`.

---

### [BUG-026] amix tầng 2 tái sinh lỗi >896 câu — BUG-005 quay lại từ cửa sau
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `dubbing/mod.rs:899-940` (`build_hierarchical_amix_filter`)
- **Root Cause:** Gom nhóm 28 câu cho tầng 1 đúng luật ≤32, nhưng tầng trộn thứ 2 lại `amix=inputs={ceil(n/28)}` không giới hạn → >32 nhóm (896 câu) FFmpeg từ chối, fail sau khi đã TTS xong toàn bộ.
- **Cách fix & Bài học:** Xây dựng thuật toán gom cây lũy tiến `build_hierarchical_amix_filter` chunking mỗi tầng ≤28 inputs cho đến khi còn 1 stream duy nhất; bảo toàn bất biến ≤28 < 32 trên toàn bộ các tầng (đã qua unit test `test_hierarchical_amix_filter_invariant_under_32` với N lên tới 2500).

### [BUG-027] "Hủy tức thì" không kill tiến trình con + thiếu checkpoint giai đoạn cuối
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `dubbing/mod.rs:40-128, 525, 570, 830, 870, 1000`
- **Root Cause:** Child chờ `.status()` không ai kill khi cancel; sau vòng TTS không còn điểm check nào → Demucs/remux chạy hết và vẫn emit `"done"`.
- **Cách fix & Bài học:** Tạo `ACTIVE_CHILD_PID` registry và hàm `run_child_with_cancel` polling 150ms kết hợp diệt cây tiến trình `taskkill /PID <pid> /T /F` ngay lập tức; bổ sung checkpoint hủy trước và sau Demucs và Remux; xóa file tạm sạch sẽ khi hủy.

### [BUG-028] Cờ hủy dùng chung bị reset → job cũ "hồi sinh", chạy song song
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `dubbing/mod.rs:27-50`
- **Root Cause:** Một `AtomicBool` dùng chung cho mọi run; mỗi run mới gọi `reset_dubbing_cancel()` nên run cũ đang bị hủy được "bỏ hủy" và chạy tiếp song song.
- **Cách fix & Bài học:** Dùng run-generation `AtomicU64` (`CURRENT_GENERATION` & `CANCELLED_GENERATION`); mỗi run giữ generation độc lập `my_gen`; bắt đầu run mới tự động cancel run cũ và diệt PID đang chạy mà không làm sống lại run đã bị hủy. Đã kiểm chứng qua unit test `test_generation_cancellation`.

### [BUG-029] Dịch lỗi âm thầm lồng nguyên văn tiếng gốc vào video thành phẩm
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `translate/mod.rs:343-380`, `translate/server.rs:374, 984, 1084`, `dubbing/mod.rs:715`
- **Root Cause:** Batch lỗi → retry từng câu → lỗi nốt → lấy nguyên văn gốc làm "bản dịch", chỉ ghi log warn; export TTS đọc nguyên văn tiếng Nhật/Anh mà giao diện vẫn bình thường.
- **Cách fix & Bài học:** Khi câu thoại dịch thất bại, đánh dấu rõ ràng `[Dịch lỗi: <câu gốc>]` và gắn trạng thái phân đoạn `status = "translate_failed"`; TTS bỏ qua hoặc cảnh báo, không lồng giả tiếng gốc vào thành phẩm.

### [BUG-030] Âm lượng lệch tới 28× giữa các cụm amix
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `dubbing/mod.rs:899-940` (`build_hierarchical_amix_filter`)
- **Root Cause:** `amix` chuẩn hóa 1/n theo số input **của từng cụm** (28 câu xuống nhỏ, cụm lẻ cuối còn 1-2 câu được hưởng to gấp nhiều); `dropout_transition=0` làm amix renormalize đột ngột khi clip hết dần.
- **Cách fix & Bài học:** Dùng toàn bộ `amix=inputs=...:normalize=0`, loại bỏ hoàn toàn `dropout_transition=0`; âm lượng được giữ nguyên vẹn 1:1 qua mọi tầng cây và chỉ scale một lần duy nhất ở gốc `volume={project.voice_volume}[speech]`.

### [BUG-031] Rò rỉ listener async-unlisten (lặp lại BUG-007) + 2 job GPU dẫm nhau khi đổi tab
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `FileSubView.tsx:96-160`, `DubbingStudioView.tsx:83-121`, `file_sub.rs:205-225`
- **Root Cause:** `if (unlisten) unlisten()` chạy đồng bộ trước khi `await listen()`/`onDragDropEvent()` resolve → listener không bao giờ bị gỡ (StrictMode nhân đôi); `processing` sống trong component bị unmount còn backend không có guard "đang chạy".
- **Cách fix & Bài học:** Sửa cleanup pattern thành `promise.then(u => u()).catch(...)` hủy chính promise đang chờ; bổ sung backend guard `FILE_SUB_RUNNING` với RAII drop guard trong `file_sub.rs` từ chối job dẫm nhau; dùng timestamp UUID tránh trùng file WAV/SRT tạm.

### [BUG-032] Thả file mới giữa lúc đang xử lý → xóa tiến độ, kết quả gán nhầm file
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `FileSubView.tsx:65, 80, 105, 160`, `DubbingStudioView.tsx:55, 105, 122, 130`
- **Root Cause:** Nhánh drop của `onDragDropEvent` không check `processing` (nút thì có disable); `handleSetSelectedFile` reset toàn bộ state → tiến độ biến mất và kết quả job cũ hiển thị dưới tên file mới.
- **Cách fix & Bài học:** Dùng `processingRef.current` và `busyRef.current` chặn ngay lập tức ở mọi lối vào đổi file (`handleSetSelectedFile`, `handlePickFile`, `handleSelectFile`, và sự kiện `drop`).

### [BUG-033] Phím tắt Ctrl+Shift+L dùng cài đặt cũ (stale closure) — code CommandCode
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Mavis/mcode (`TSK-UI-REDESIGN-R2-7B`, 2026-10-25) | **Status:** ✅ Fixed
- **File:** `SettingsView.tsx` (hotkey `useEffect`, deps `[isLive, overlayVisible]`)
- **Root Cause:** Listener chỉ tái tạo khi `isLive`/`overlayVisible` đổi → `handleStartLive` được gọi là bản cũ, đọc model/ngôn ngữ/chunk ở thời điểm re-bind trước đó; nút bấm thì dùng giá trị mới.
- **Cách fix & Bài học:** Handler trong keydown phải đi qua `latestRef` (hoặc deps đầy đủ). Phím tắt + handler async = cặp đôi dễ dính stale closure nhất.
- **Đã fix:** `latestRef` giữ `{ start, stop, isLive, overlayVisible }`, đồng bộ trong `useEffect` chạy sau **mọi** render; effect keydown giờ `deps: []` và luôn gọi `latestRef.current` ⇒ hotkey và nút bấm dùng **cùng** bản handler mới nhất.

### [BUG-044] LỖ HỔNG BẢO MẬT: dán chuỗi `--cờ` vào ô link → yt-dlp chạy lệnh tùy ý
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** — | **Status:** 🔴 Open
- **File:** `downloader/mod.rs:203` (`cmd.arg(url)`), `:254`
- **Root Cause:** URL dán vào được truyền thẳng làm đối số yt-dlp mà không kiểm tra phải bắt đầu bằng `http(s)://` và không có dấu ngăn cách `--`. Chuỗi như `--exec calc.exe` hay `--config-location=\\máy_khác\chia_sẻ\cfg` được yt-dlp hiểu là **cờ lệnh của chính nó** → có thể thực thi lệnh tùy ý từ xa.
- **Cách fix & Bài học:** (1) Chỉ nhận URL khớp `^https?://`; (2) truyền URL **sau dấu `--`** ngăn cách; (3) luôn cho user string vào argv sau `--`. *Mọi tham số người dùng dán vào đều là "vũ khí" — phải chặn ở cửa.*

### [BUG-045] Đổi tab khi đang tải → mất sự kiện, file tải xong kẹt "Đang tải" mãi
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** — | **Status:** 🔴 Open
- **File:** `DownloaderView.tsx:156-180`, `SettingsView.tsx:919` (mount có điều kiện theo tab)
- **Root Cause:** Listener `downloader:progress` chỉ sống khi tab Tải Video còn mở; chuyển tab là tháo listener, mọi sự kiện sau đó (kể cả sự kiện "hoàn thành" chứa đường dẫn file) mất vĩnh viễn → mục tải kẹt % cũ, nút "Tạo Phụ Đề / Lồng Tiếng" không bao giờ hiện (và trạng thái kẹt còn bị lưu vào localStorage).
- **Cách fix & Bài học:** Giữ component luôn mounted (ẩn bằng CSS) hoặc đẩy listener về cấp cha/store sống xuyên tab. *Mọi luồng nền đang chạy thì "tai" nghe sự kiện của nó phải sống lâu hơn component.*

### [BUG-046] Tải hỏng vẫn báo "thành công" với file của job khác
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** — | **Status:** 🔴 Open
- **File:** `downloader/mod.rs:415-434` + `find_latest_file` `:482-502`
- **Root Cause:** yt-dlp chết trước khi in tên file → code lấy **file media mới nhất trong thư mục chung** (có thể của job khác/job cũ) làm kết quả, rồi `is_success || file.exists()` báo "completed" cho một lần tải thất bại — đúng hành vi "im lặng thay kết quả sai" mà kế hoạch cấm.
- **Cách fix & Bài học:** Chỉ báo thành công khi process exit 0 **và** có đúng file do chính yt-dlp báo tên; nếu không → báo lỗi rõ. *Không bao giờ "mượn" kết quả của công việc khác.*

### [BUG-047] Hủy 1 job xóa file tải dở của mọi job khác — phá tính năng "tải tiếp"
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** — | **Status:** 🔴 Open
- **File:** `downloader/mod.rs:510-518`
- **Root Cause:** Khi hủy, code quét **toàn bộ** thư mục tải và xóa mọi file `.part`/`.ytdl` — kể cả file đang ghi của các job khác (job kia hỏng giữa chừng) và file dành cho việc "tải tiếp khi mạng rớt".
- **Cách fix & Bài học:** Chỉ xóa file tạm thuộc chính job bị hủy (theo dõi đích ghi của từng job). *Thao tác dọn dẹp phải theo phạm vi "của ai nấy xóa".*

### [BUG-048] Trùng id tải → job cũ thành tiến trình ma không kill được
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** — | **Status:** 🔴 Open
- **File:** `downloader/mod.rs:314-324` (`ACTIVE_JOBS.insert` ghi đè không kiểm)
- **Root Cause:** Ghi đè id cũ trong bảng quản lý làm mất PID của job cũ → nút Tạm dừng/Hủy giờ giết nhầm hoặc không giết gì, yt-dlp cũ vẫn chạy song song với bản mới — cùng họ với BUG-028 ("job hồi sinh").
- **Cách fix & Bài học:** Id đã tồn tại thì từ chối (hoặc hủy job cũ hẳn trước khi ghi), hoặc đánh số thế hệ mỗi lần chạy. *Bảng quản lý tiến trình không được ghi đè im lặng.*

### [BUG-V092-01] fetch_video_info nhận output RỖNG — ngộ nhận "EOF while parsing" khi Kiểm Tra Link
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** Anh Tuấn (screenshot) | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`fetch_video_info`)
- **Root Cause:** Bản vá R2-08.3 đổi `Command::output()` → `spawn()` + `wait_with_output()` (để có PID kill orphan khi timeout) nhưng quên `cmd.stdout(Stdio::piped())`/`stderr`. `wait_with_output()` chỉ đọc được output từ pipe — không pipe thì trả rỗng 100%: yt-dlp exit 0 (kiểm tra OK) ⇒ serde báo "EOF while parsing a value at line 1 column 0"; exit 1 (video chết) ⇒ mất luôn stderr.
- **Cách fix & Bài học:** Thêm pipe cho stdout+stderr; parse JSON an toàn giữa `{` đầu ↔ `}` cuối; fallback thông báo thân thiện. *`Command::output()` tự pipe còn `spawn()` thì KHÔNG — chuyển đổi API phải kiểm tra lại stdio.*

### [BUG-V092-02] Phụ đề bị YouTube chặn 429 — job "Lỗi" oan dù video đã tải xong
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** Anh Tuấn | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`build_download_command`, worker thread)
- **Root Cause:** 4 ngôn ngữ × (manual + auto) = burst request phụ đề liên tiếp → YouTube trả 429; rate-limit phía server, kể cả delay 5s chạy dồn vẫn có thể dính. yt-dlp exit 1 ⇒ app phủ định cả job dù file video đã nằm trên ổ cứng.
- **Cách fix & Bài học:** `--sleep-subtitles 5` giãn cách request + khi lỗi CHỈ ở subtitle mà media đã có ⇒ emit `completed` kèm cảnh báo UI. *Rate-limit server không xóa được 100% bằng client — thiết kế phải "degrade gracefully", giữ kết quả đã có.*

### [BUG-V092-03] yt-dlp in đường dẫn mất ký tự codepage — job "Lỗi" oan dù file đã tải xong
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** Anh Tuấn (screenshot) | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`start_download`, `build_download_command`, `fetch_video_info`)
- **Root Cause:** Khi output của yt-dlp không phải UTF-8, dòng `[download] Destination: <path>` bị mất/thay thế ký tự mà codepage không biểu diễn được (fullwidth `：｜`, CJK). File trên đĩa vẫn đủ ký tự ⇒ `Path::exists()` trượt ⇒ app báo "thoát thành công nhưng không in ra đường dẫn file" oan dù yt-dlp exit 0.
- **Cách fix & Bài học:** (1) Ép `PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1` cho mọi tiến trình yt-dlp; (2) Recovery "bằng chứng gốc": exit 0 mà path không verify được ⇒ quét thư mục tải tìm media theo tag `[<video_id>]` (chỉ khớp id của chính request — luật BUG-046). *Không bao giờ chỉ tin chuỗi text do tool in ra để xác minh sự tồn tại của file — phải hỏi thẳng filesystem.*

### [BUG-V094-01] explorer /select spawn từ Rust không mở cửa sổ — nút "Mở Thư Mục" chết lặng
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** CommandCode (GUI test bằng agent-browser) | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`reveal_downloaded_file`)
- **Root Cause:** `Command::new("explorer.exe").arg("/select,\"file\"")` — Rust escape dấu nháy trong argv (`\"`), explorer.exe parse kiểu riêng nên hiểu sai tham số `/select` → tiến trình chạy xong nhưng không có cửa sổ nào mở (không lỗi, không cảnh báo). Gọi cùng chuỗi từ PowerShell thủ công thì mở bình thường — chỉ hỏng khi đi qua Rust Command.
- **Cách fix & Bài học:** Dùng shell API chuẩn `SHParseDisplayName` + `SHOpenFolderAndSelectItems` (+ `ILFree`; cần features `Win32_UI_Shell_Common`, `Win32_System_Com`). *Mọi tương tác shell (mở file/thư mục) nên đi qua Shell API — đừng spawn explorer với argument phức tạp từ Rust.*

### [BUG-V095-01] MAX nhưng video chỉ 640x360 — ép player_client cũ làm mất hết format DASH
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** Anh Tuấn (Telegram: "ghi là best mà toàn 360p") | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`build_download_command`, `fetch_video_info`)
- **Root Cause:** Commit "YouTube 2026 fix" cũ ép `--extractor-args youtube:player_client=android,web_safari,ios`. YouTube đã bóp client android về SABR-only (format thiếu URL bị skip) ⇒ chỉ còn progressive 360p; `bestvideo+bestaudio` không còn gì để ghép ⇒ rơi về `/best` = format 18 (640x360).
- **Cách fix & Bài học:** Bỏ ép player_client — để yt-dlp tự chọn (js-runtime + `ejs:github` là đủ với 2026.08+). Verify `-F`: 4K/1440p/1080p/720p đủ; tải thật 720p → 1280x720; PO verify 1080p (DeepSeek, 309.7MB). *Cấu hình "chống cháy" cho YouTube có hạn sử dụng — mỗi lần YouTube đổi là phải test lại bằng `-F` trước khi ép cờ.*

### [BUG-V095-02] Tải video 403 Forbidden — yt-dlp thiếu impersonation target (curl_cffi)
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** CommandCode (GUI test Big Buck Bunny) | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** Môi trường Python313 của máy (không phải code dự án)
- **Root Cause:** yt-dlp cần impersonation (giả danh trình duyệt) cho một số request media; máy chưa cài `curl_cffi` nên in warning "The extractor specified to use impersonation ... no impersonate target is available" ⇒ media URL trả 403.
- **Cách fix & Bài học:** `python -m pip install curl_cffi` (đã cài, warning hết; BBB retry tải OK 1280x720). *Máy mới/agent mới setup môi trường PHẢI cài kèm `curl_cffi` — ghi vào checklist cài đặt.*

---

### [BUG-059] Bấm "Chạy Video" làm Windows Media Player ngoài Desktop bật lên thay vì phát trong Studio
- **Ngày:** 2026-10-12 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src/views/DownloaderView.tsx` (`handlePlayInStudio`, `handleOpenFile`)
- **Root Cause:** Nút tải xong trước đây có nhãn `▶ Chạy Video`, gọi lệnh Win32 `ShellExecuteW("open", path)` qua IPC `downloader_open_file`. Người dùng hiểu nhầm là app sẽ phát video trong giao diện nội bộ, nhưng Windows lại bật Media Player ngoài màn hình Desktop.
- **Cách fix & Bài học cho Dev sau:**
  1. Nút hành động chính mặc định sau khi tải xong **BẮT BUỘC** là `🚀 Xem Trong Studio` (gọi `handlePlayInStudio` nạp video vào Studio nội bộ).
  2. Nút mở bằng Windows Media Player chuyển thành nút phụ `🖥️ Player Ngoài` với tooltip cảnh báo rõ ràng.
  *Nguyên tắc UX: Các hành động phát media trong desktop app phải ưu tiên player nội bộ của app trước; mở player hệ điều hành chỉ là tùy chọn phụ.*

---

### [BUG-060] Video 25 phút (323 câu thoại) làm treo timeline + bấm Play đứng im + ffmpeg transcode ngầm 100% CPU
- **Ngày:** 2026-10-12 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src/views/SublixStudioView.tsx` (`StudioSegmentCard`, `StudioTimelineSubtitleBlock`, `tick`, `handleTimeUpdate`, `handleLoadedMetadata`)
- **Root Cause:**
  1. *Video Play đứng im ngay khi bấm:* Vòng lặp `requestAnimationFrame(tick)` kiểm tra `v.paused` ở 1–2 frame đầu tiên khi Promise của `video.play()` chưa kịp resolve trên WebView2 → `tick()` tự ép `setIsPlaying(false)` và hủy animation playhead.
  2. *Transcode ngầm 100% CPU:* Timer RVFC (`stillNoFrame`) kiểm tra sau 1.2s trên video đang tạm dừng (pause). Khi pause, RVFC không bắn frame → code tưởng nhầm codec bị lỗi và âm thầm gọi `ffmpeg` transcode cả video 25 phút ngốn 100% CPU mọi nhân.
  3. *Treo/Đơ Timeline khi có nhiều câu thoại:* `timeupdate` kích hoạt `setCurrentTime` liên tục không throttle làm React re-render toàn bộ component 7.200 dòng cùng lúc 323 card danh sách và 323 timeline block (hơn 2.500 DOM nodes mỗi tick).
- **Cách fix & Bài học QUAN TRỌNG cho Dev/Agent sau (CẤM VI PHẠM):**
  1. **Tuyệt đối KHÔNG kiểm tra `v.paused` để dừng sớm trong `requestAnimationFrame`:** Playback là bất đồng bộ; phải lắng nghe native event trực tiếp (`onPlay`, `onPause`, `onEnded`) trên thẻ `<video>` để đồng bộ state.
  2. **CẤM kích hoạt `ffmpeg transcode` khi video đang tạm dừng:** Chỉ transcode khi `videoWidth === 0` sau khi nạp metadata hoặc khi thẻ `<video>` bắn sự kiện `onError`.
  3. **BẮT BUỘC memoize các component lặp lại:** `StudioSegmentCard` và `StudioTimelineSubtitleBlock` phải được bọc `React.memo`. Không truyền anonymous inline functions hay mutable object vào props nếu không cần thiết. Khi playhead chạy qua, **chỉ đúng 2 card re-render** (card cũ và card mới).
  4. **Throttling React State:** Throttling `onTimeUpdate` xuống mỗi 120ms (~8fps) cho React state, trong khi kim Playhead chạy mượt mà 60fps qua direct DOM ref.

---

### [BUG-063] Studio không đổi được video khác (bị dội ngược lại video cũ do useEffect dính filePath) & Thiếu tùy chọn xuất Softsub / Multi-track Audio VLC
- **Ngày:** 2026-10-13 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src/views/SublixStudioView.tsx`, `src/views/SettingsView.tsx`, `src-tauri/src/dubbing/mod.rs`, `src/lib/tauri.ts`
- **Root Cause:**
  1. *Không đổi được video:* `useEffect` đồng bộ `initialFilePath` chứa `filePath` trong dependency array (`[initialFilePath, fileNonce, filePath]`) và điều kiện `if (initialFilePath !== filePath)`. Khi người dùng từng bấm "Xem Trong Studio", `pendingStudioPath` ở cha lưu path video cũ. Khi người dùng mở file mới/kéo thả/đóng file trong Studio, `filePath` đổi → `useEffect` tự động chạy lại → thấy `initialFilePath !== filePath` → tự động ép `setFilePath(initialFilePath)` dội ngược lại video cũ.
  2. *Thiếu chế độ xuất video:* Hệ thống chỉ hỗ trợ 1 kiểu remux cứng, không cho người dùng chọn phụ đề mềm (Softsub `-c:s mov_text` bật/tắt trong VLC) vs Hardsub, và không có tùy chọn Đa đường tiếng (Multi-track Audio: Track 1 Tiếng gốc, Track 2 Thuyết minh AI) chuẩn xem VLC.
- **Cách fix & Bài học cho Dev sau:**
  1. **Bỏ `filePath` ra khỏi dependency array của effect:** Chỉ sync khi `initialFilePath` hoặc `fileNonce` thực sự thay đổi giá trị so với ref (`lastLoadedInitialPathRef`, `lastLoadedNonceRef`).
  2. **Tập trung hóa nạp file & giải phóng state cha:** Viết hàm tập trung `handleLoadNewVideoFile(newPath)` reset sạch `segments`, `speakers`, `undoStack`, `audioPeaks`, `filmstripThumbs`, `localStorage` cache cũ; đồng thời gọi `onClearPendingFile?.()` để cha reset `pendingStudioPath = ""` tránh bị dội ngược.
  3. **FFmpeg Multi-track Audio & Softsub:** Triển khai mapping đa track âm thanh (`-map 0:a:0?` + `-map [final_audio]`) và phụ đề mềm (`-map {srt}:s -c:s mov_text`) với ISO language metadata đầy đủ cho VLC/TV; kèm UI modal cấu hình trực quan trước khi xuất.

---

### [BUG-064] Track Tiếng Lồng ("🎙️ TIẾNG LỒNG") chập chờn lúc có lúc không trên Timeline
- **Ngày:** 2026-10-17 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Antigravity & Subagent QA | **Status:** ✅ Fixed (Verified 100% via CDP GUI Test)
- **File:** `src/views/SublixStudioView.tsx` (`showVoiceTrack`, `collapseSpeakerTracks`, `spkSegments`)
- **Root Cause:**
  1. *Điều kiện hiển thị quá phụ thuộc vào trạng thái audio:* `showVoiceTrack` trước đây phụ thuộc vào `segments.some(s => s.hasAudio) || workflowOptVoice`. Khi người dùng mở video có sẵn phụ đề nhưng chưa tạo tiếng, hoặc khi TTS chưa xong/gặp lỗi, toàn bộ lane tiếng lồng biến mất khỏi DOM gây hoang mang.
  2. *Bẫy `speakers.length === 0`:* Khi `collapseSpeakerTracks = false` và `speakers.length === 0`, biểu thức `speakers.map(...)` trả về mảng rỗng `[]`, khiến cả Header lẫn Lane timeline bị mất hoàn toàn dù câu thoại vẫn có trên timeline.
  3. *Lạc mất phân đoạn chưa gán vai:* Khi phân đoạn có `speakerId` không khớp vai nào trong danh sách `speakers`, câu thoại bị lọc mất khỏi lane.
- **Cách fix & Bài học cho Dev sau:**
  1. **Đồng bộ hiển thị Track Tiếng Lồng theo Track Phụ Đề:** Đặt `const showVoiceTrack = showSubtitlesTrack;` để Track Tiếng Lồng luôn hiện diện song hành cùng Track Phụ Đề, không bao giờ biến mất chập chờn.
  2. **Fallback hiển thị khi danh sách vai rỗng:** Cập nhật điều kiện `collapseSpeakerTracks || speakers.length === 0` để luôn render lane tiếng lồng dự phòng với nhãn "Thuyết minh AI" khi chưa chia vai.
  3. **Bảo toàn phân đoạn mồ côi:** Các câu thoại chưa gán vai hợp lệ tự động gán hiển thị trên lane của `speakers[0]`, đảm bảo 100% câu thoại hiển thị trên timeline.

---

### [BUG-065] Lỗi "nhân đôi tiếng" (echo / 2 giọng nói đè lên nhau) khi phát video kèm tiếng lồng
- **Ngày:** 2026-10-17 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Antigravity & Subagent QA | **Status:** ✅ Fixed (Verified 100% via CDP Telemetry Test)
- **File:** `src/views/SublixStudioView.tsx` (`syncVoicePlayback`, `stopVoicePlayback`, native listeners)
- **Root Cause:**
  1. *Ducking âm lượng mềm không đủ tách giọng:* Cơ chế cũ chỉ hạ âm lượng video xuống 25% (`v.volume = 0.25`). Vì video gốc chứa giọng diễn viên nói cùng thời điểm, mức 25% vẫn phát to và đè trực tiếp lên giọng đọc TTS của AI, tạo cảm giác bị nhân đôi / echo 2 giọng.
  2. *Audio element không được reset buffer triệt để:* Khi chuyển câu hoặc tua, `HTMLAudioElement` cũ chưa được hủy `src` và gọi `load()`, dẫn đến race condition phát lặp hoặc phát chồng chéo.
- **Cách fix & Bài học cho Dev sau:**
  1. **Tự động mute video gốc khi AI nói:** Trong `syncVoicePlayback`, khi câu thoại AI bắt đầu phát, lưu âm lượng gốc và kích hoạt `v.muted = true`. Khi câu thoại AI kết thúc hoặc người dùng bấm dừng/tua, hàm `stopVoicePlayback` tự động phục hồi `v.muted = false` và âm lượng ban đầu.
  2. **Lắng nghe native event `play`:** Thêm `v.addEventListener("play", onPlay)` để đồng bộ tiếng lồng ngay lập tức khi người dùng bấm phát, tránh phụ thuộc vào interval `timeupdate`.
  3. **Hủy triệt để buffer audio cũ:** Gọi `va.onended = null; va.removeAttribute("src"); va.load();` trước khi gán clip mới để WebView2 giải phóng hoàn toàn bộ giải mã âm thanh.

---

### [BUG-073] Version drift: field `version` = 0.11.33 nhưng 2 tiêu đề cửa sổ native còn sót `v0.11.32` — mất luôn script guard `check_version.ps1`
- **Ngày:** 2026-10-20 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Mavis (MiniMax-M3) | **Status:** ✅ Fixed
- **File:** `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (`version` + `app.windows[].title`), `scripts/check_version.ps1` (tạo lại), `src/views/SublixStudioView.tsx` + `src/views/SettingsView.tsx` (version hardcode trong UI)
- **Root Cause:**
  1. *Tiêu đề cửa sổ native ghi sai version:* Log runtime cho thấy `🚀 Sublix v0.11.33 started` nhưng `🎨 Overlay window ready (hidden by default): Sublix v0.11.32 — Overlay`. Trong một lần rollback, field `version` của `tauri.conf.json` đã được bump lên `0.11.33` nhưng 2 trường `title` trong `app.windows` (`main` + `overlay`) bị bỏ sót, vẫn còn `v0.11.32` → cửa sổ native hiển thị sai version cho người dùng.
  2. *Không có lưới an toàn:* Script `scripts/check_version.ps1` từng tồn tại để so khớp 4 nguồn + 2 tiêu đề cửa sổ, nhưng **bị xoá mất trong lúc rollback** → các lần bump version sau này không có gì để bắt lỗi drift.
  3. *Lớp drift thứ 5 — version hardcode trong mã nguồn UI:* badge `v0.11.33` bị **hardcode** trong `SublixStudioView.tsx` và 3 fallback `"0.11.29"` trong `SettingsView.tsx` → app hiển thị sai version (đo thật trên app đang chạy: UI hiện `v0.11.33` trong khi native window title đã là `v0.11.34`). Guard lúc đó **chỉ quét manifest + tiêu đề cửa sổ, không quét mã nguồn** → không bắt được lớp drift này.
- **Cách fix & Bài học cho Dev sau:**
  1. **Đồng bộ cả 4 nguồn + 2 tiêu đề cửa sổ:** `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` (field `version`) và cả `title` của 2 cửa sổ native (`Sublix v0.11.34 — Settings & Studio` + `Sublix v0.11.34 — Overlay`) → tất cả ở `0.11.34`.
  2. **Tạo lại guard `scripts/check_version.ps1` + npm script `npm run verify:version`:** lấy version chuẩn từ `package.json`, in bảng trạng thái `[OK  ]` / `[LECH]`, **exit code 1** khi bất kỳ dòng nào lệch và **exit code 0** khi tất cả khớp. Script tự dò thư mục gốc theo `$PSScriptRoot` (chạy được từ mọi thư mục) và được viết **ASCII không dấu** để không bị mojibake khi chạy bằng PowerShell 5.1.
  3. **Bằng chứng (chạy thật):** `npm run verify:version` → `PASS: tat ca nguon version deu = 0.11.34`, **exit 0**. Negative test hạ `package.json` xuống `0.11.33` → guard in **4 dòng `[LECH]`** + tổng kết `FAIL`, **exit 1**; khôi phục lại `0.11.34` → `PASS`, exit 0.
  4. **Bài học:** Mỗi lần bump version phải sửa **4 nguồn + 2 tiêu đề cửa sổ native** và chạy `npm run verify:version` **trước khi commit** — đừng tin "đã bump version ở 1 chỗ" là đủ.
  5. **Mở rộng guard cho lớp drift thứ 5:** `check_version.ps1` nay quét thêm `src/**.ts(x)` — **cắt bỏ comment/JSDoc** trước khi kiểm tra và **bỏ qua `ChangelogModal.tsx`** (dữ liệu lịch sử phiên bản) — in `[LECH] <file>:<line>` cho mọi literal version hardcode. Song song, dọn nốt 1 ký tự mojibake U+FFFD còn sót trong `SublixStudioView.tsx` → hiện **0 U+FFFD** trong `src/` + `src-tauri/src/`.




---

### [BUG-074] Xuất video KHÔNG có tiếng Việt — backend không hiểu prefix `vietneu:`, mọi câu bị skip
- **Ngày:** 2026-10-23 | **Phát hiện bởi:** Mavis (MiniMax-M3) khi đọc code trước khi chạy A→Z | **Fix bởi:** Worker agent (Mavis điều phối) | **Status:** ✅ Fixed (verify thật bằng ffprobe + đối chiếu giọng)
- **File:** `src-tauri/src/dubbing/mod.rs` (`export_dubbed_video`, `synthesize_speech`), `src/views/SublixStudioView.tsx` (`mapVoiceForEngine` — chỉ dùng cho preview)
- **Triệu chứng:** bấm "Xuất video" → file MP4 ra **không có tiếng lồng tiếng Việt nào** (chỉ còn audio gốc + phụ đề). Không có báo lỗi rõ ràng cho người dùng.
- **Root Cause:**
  1. *Frontend lưu voice theo model VietNeu:* `TTS_ENGINE_MODELS.vietneu.defaultMaleVoice` = `vietneu:vi_bac_nam`; khi xuất, payload gửi nguyên vẹn `voice: s.voice` (không map).
  2. *Backend không biết prefix `vietneu:`:* `grep -i vietneu src-tauri/src` → **0 kết quả**. `synthesize_speech` chỉ route id bắt đầu bằng `kokoro:` sang engine Kokoro cục bộ, **mọi id còn lại** đưa xuống Edge-TTS với tên voice đó.
  3. *Edge-TTS từ chối voice id không hợp lệ:* mỗi câu fail → retry 1 lần → **skip** qua `skipped_segments` → **323/323 câu bị bỏ qua**, file xuất không có tiếng AI.
  4. *Helper map có sẵn nhưng không dùng đúng chỗ:* `mapVoiceForEngine` ở frontend chỉ được gọi trong `handleRunVoiceOnly` / `handlePreviewSpeakerVoice` (đường preview), **không** được gọi trong `handleExportDubbing` (đường xuất).
- **Cách fix & Bài học cho Dev sau:**
  1. **Thêm `normalize_voice_id()` ở backend** (`src-tauri/src/dubbing/mod.rs`): map 6 giọng VietNeu → giọng Kokoro tương ứng (`vi_bac_nam`→`tuan_ngoc`, `vi_bac_nu`→`mai_linh`, `vi_nam_nam`→`manh_dung`, `vi_nam_nu`/`vi_hue_nu`→`ngoc_huyen`, `vi_bac_thoisu`→`hung_thinh`, lạ→`tuan_ngoc`); `kokoro:` và Edge-TTS đi qua không đổi.
  2. **Áp dụng ở điểm chặn duy nhất `synthesize_speech`** → cả preview lẫn export đều đúng; đồng thời dùng voice đã normalize khi chọn đuôi file `.wav`/`.mp3` trong `export_dubbed_video`.
  3. **Bài học:** khi frontend có "tầng dịch id" riêng, **backend cũng phải có tầng dịch id** — không được tin là mọi đường gọi đều đi qua frontend đó. Đặc biệt đường **export** thường là đường hay bị sót vì nó gọi thẳng xuống backend.
  4. **Bài học (phát hiện sớm):** luôn **đọc code đường export trước khi bấm nút** — 1 lần đọc 5 phút tiết kiệm hàng giờ chờ và tránh ra file không dùng được.

---

### [BUG-075] Kokoro nạp lại model ONNX 325 MB cho MỌI câu — 12,4s/câu, xuất video 323 câu mất 67 phút
- **Ngày:** 2026-10-23 | **Phát hiện bởi:** Mavis (MiniMax-M3) khi đo trực tiếp | **Fix bởi:** Worker agent (Mavis điều phối) | **Status:** ✅ Fixed (đo thật: 12,4s/câu → ~1,2s/câu)
- **File:** `src-tauri/src/dubbing/mod.rs` (`synthesize_kokoro`, `export_dubbed_video`), `src-tauri/scripts/kokoro_vi_tts.py`
- **Triệu chứng:** xuất video rất chậm, có vẻ treo; ước lượng >2 giờ cho video 323 câu.
- **Root Cause:**
  1. *Spawn process cho từng câu:* `synthesize_kokoro` chạy `Command::new(python)` **một lần cho mỗi câu**.
  2. *Model nặng nạp lại mỗi lần:* `KokoroVietnameseONNX.__init__` nạp `kokoro_vi.onnx` (~325 MB) + `torch.load` voicepack mỗi tiến trình → phần lớn 12,4s là **thời gian nạp model**, không phải thời gian tổng hợp.
  3. *Đường export lặp lại công việc:* `export_dubbed_video` tự tổng hợp lại toàn bộ TTS (không dùng lại audio đã tạo trong UI) → tốn thêm một lần nữa.
- **Cách fix & Bài học cho Dev sau:**
  1. **Thêm chế độ `--batch <manifest.json>` cho sidecar Python:** nạp model **một lần**, cache instance theo từng giọng, in từng dòng `OK <i> <path> <samples>` / `ERR <i> <msg>` để Rust parse được.
  2. **Rust `synthesize_kokoro_batch()`:** ghi manifest JSON → spawn sidecar **một lần** → parse kết quả từng câu; một câu lỗi **không** làm hỏng cả lô.
  3. **`export_dubbed_video` gom câu theo giọng → gọi batch 1 lần/giọng**, tái dùng file đã tổng hợp; giữ nguyên fallback từng câu, retry-then-skip, sự kiện tiến trình, atempo stretch, amix, mux.
  4. **Bài học:** khi một sidecar nạp model nặng, **luôn thiết kế đường batch** — đừng gọi 1 tiến trình cho mỗi item. Đo `tổng thời gian / số item` trước khi lên kế hoạch cho video dài.
  5. **Bài học:** đường export **tự tổng hợp lại TTS** ⇒ chạy bước "TTS trong UI" trước là tốn công vô nghĩa với mục tiêu tạo file. Với mục tiêu "có file xuất", bỏ qua bước preview TTS.

---

### [BUG-076..081] Timeline Studio: kéo thả khối, Ctrl+click, tốc độ voice, vùng In/Out (TSK-TIMELINE-FIX-DND-RANGE)
- **Ngày:** 2026-10-24 | **Phát hiện bởi:** PO (kéo thả + khoanh vùng không chạy) + coordinator đọc code | **Fix bởi:** Claude Sonnet 5.5 (Orca worker) | **Status:** ✅ Fixed (verify GUI instance riêng CDP 9224)
- **File:** `src/views/SublixStudioView.tsx`, `src/views/SublixStudioView.css` (không đổi backend Rust)
- **BUG-076 (không kéo thả được):** `handleTimelineMouseDown` bỏ qua mọi mousedown trên `.studio-timeline-block` (để marquee không vẽ) nhưng KHÔNG có handler kéo nào thay thế; tay nắm mép chỉ có `onClick` nhích ±0,2s. Tái hiện: kéo #3 +120px → start/end không đổi. **Fix:** `handleBlockMouseDown` (move/trim-start/trim-end, nhóm khi multi-select), transform trực tiếp trên DOM + `snapLineRef`/`dragTipRef`, chỉ `setSegments` khi thả (1 `saveUndoHistory`), snap 8px (playhead/mép khối/In-Out/0/hết video, nút nam châm `magnetSnap` + Alt tắt), chặn chồng khối kề, Esc hủy, tự cuộn ngang; khối tiếng lồng tách thành `StudioTimelineVoiceBlock` (`React.memo`) và chỉ "dời" (clip TTS giữ độ dài).
- **BUG-077 (Ctrl+click gộp 1 câu):** `handleSelectSegmentWithModifier` gọi `handleSeek(seg.start)` → `handleSeek` + `video onSeeked` (native + prop JSX) + effect `[currentTime,isPlaying,segments]` đều ép `selectedSegIds=[match.id]`. Effect còn reset selection mỗi khi `segments` đổi (sửa chữ/nhích/đổi vai). Còn lỗi phụ: khối kề nhau (`A.end == B.start`) bị chọn nhầm khối trước vì so sánh `<=` hai đầu. **Fix:** `multiSelectLockRef` + `handleSeek(t, keepSelection)`; auto-follow chỉ khi ĐANG PHÁT; Ctrl/Cmd = toggle, Shift = chọn dải; Delete xóa cả nhóm. Đo: Ctrl+click #2,#6,#7 → trước `[6]`, sau `[2,6,7]` (giữ nguyên sau 1,8s).
- **BUG-078 (voice giật ở 1.5x):** `va.playbackRate` không bao giờ được đặt → audio 1x, video 1,5x → `expectedTime` lệch +0,5s mỗi giây → `Math.abs(...)>0.35` tua lại ~mỗi 0,7s. Lưu ý: gán `src` mới reset `playbackRate` về `defaultPlaybackRate` → phải đặt cả hai. Đo (clip 12s, phát 7s): trước 1.5x = **10 lần tua** khi đang phát (vị trí 2.19→10.87, đều ~1s/lần), `audio.playbackRate=1`; sau = **4 lần** (chỉ trong 1,7s đầu clip = độ trễ nạp, ngang baseline 1x = 3), `audio.playbackRate=1.5`.
- **BUG-079 (ducking):** `stopVoicePlayback` luôn `v.volume = giá trị trước duck`; nếu người dùng chỉnh volume trong lúc duck bị ghi đè, volume 0 bị lưu thành 1.0. **Fix:** `duckedVolumeRef` + chỉ khôi phục khi volume còn = mức đã duck; volume≈0 → không duck.
- **BUG-080 (lệnh vùng):** (1) lọc `s.start>=in-0.2 && s.end<=out+0.2` bỏ mọi câu bị cắt ngang mép → vùng nhỏ báo "không có câu"; (2) menu "Chạy Cả Sub & Lồng Tiếng" gọi `handleRunAnalysis(true)` KHÔNG `dubImmediately` → không hề lồng tiếng; (3) ghép kết quả: đánh số lại `id=idx+1` + `setSpeakers(roster mới)` → bước TTS nối tiếp ghi audio theo id cũ vào NHẦM câu ngoài vùng, câu ngoài vùng mất vai; Hoàn tác đối chiếu bản dịch theo id bị lệch; (4) câu Whisper mới có thể tràn quá Out (đo: Out 25,00 → câu cuối kết thúc 27,48, đè câu kế); (5) `catch{}` nuốt lỗi TTS, dịch lỗi ghi nguyên văn gốc; (6) vùng In=Out (click ruler ở chế độ R) vẫn là "có vùng". **Fix:** `isSegInRange` (chồng lấn) cho dịch/TTS/xóa/đếm; `expandRangeToSegmentEdges` nới vùng tới mép câu trước khi bóc tách; `mergeRangeSegments` giữ id/vai/bản dịch/tiếng câu ngoài vùng, cắt kết quả trong [In,Out]; roster được GIỮ; TTS nối tiếp chỉ nhận `onlyIds`; đếm + toast lỗi; `runRangeAction` chặn chạy chồng và báo số câu bị ảnh hưởng; menu đổi tên theo yêu cầu ("Dịch lại vùng", "Tạo lại tiếng lồng vùng", "Bóc tách + dịch + lồng tiếng vùng").
- **BUG-081 (kẹt isAnalyzing):** `handleRunAnalysis(dubImmediately=true)`: `finally` không nhả `isAnalyzing`; nếu phân tích lỗi hoặc ra 0 câu thì `handleRunVoiceOnly` thoát sớm cũng không nhả → UI "đang xử lý" mãi. **Fix:** `analysisFailed` + `bailOut()` nhả cờ.
- **Bài học:** (a) khối timeline là con của `React.memo` → callback phải ổn định (`blockApiRef` + `useCallback([])`), logic thật đọc qua ref; (b) mọi đường "đồng bộ selection theo playhead" phải dùng chung 1 cờ khóa — grep `setSelectedSegIds([match.id])` có 4 chỗ; (c) đo voice bằng *số lần tua khi clip đang phát*, không đếm tổng `currentTime=` (offset khởi động và reset về 0 làm nhiễu); (d) **KHÔNG** dùng `Get-Content/Set-Content` của PowerShell 5.1 để sửa file có tiếng Việt (BUG-H02) — dùng công cụ Edit/Write.

---

### [BUG-H09] Smart App Control (WDAC) chặn `llama-server.exe` — dịch offline GGUF fail trên Windows 11
- **Ngày:** 2026-10-23 | **Phát hiện bởi:** Mavis khi dựng môi trường máy mới | **Status:** 🔴 Open (đã có workaround qua Ollama)
- **File:** `src-tauri/src/translate/server.rs` (spawn `llama-server.exe`), `src-tauri/src/stt/whisper_local.rs` (spawn `whisper-cli.exe`)
- **Triệu chứng:** `llama-server.exe` không chạy được → *"Program 'llama-server.exe' failed to run: An Application Control policy has blocked this file"*. App vẫn mở, UI vẫn render, nhưng nút dịch GGUF im lặng fail. `whisper-cli.exe` **chạy bình thường**.
- **Root Cause:** Windows 11 bật **Smart App Control** (`HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy\VerifiedAndReputablePolicyState = 1`) → policy WDAC yêu cầu *"Enterprise signing level"*. `llama-server.exe` (llama.cpp b10472/b11829) **không có chữ ký Authenticode** và **không có SmartScreen reputation** → bị chặn. `whisper-cli.exe` (whisper.cpp v1.7.6, phổ biến) có reputation nên qua. Event log: `Microsoft-Windows-CodeIntegrity/Operational`, ID **3033/3077**, Policy ID `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`.
- **Đã loại trừ:** `Unblock-File` (file **không** có stream `Zone.Identifier` — không phải Mark-of-the-Web); thử nhiều release llama.cpp (b10472, b11829) → **tất cả đều bị chặn** → không phải doanh cũ release; máy **không** join domain (WORKGROUP) → không phải policy doanh nghiệp.
- **Workaround (đã áp dụng & verify):** dùng provider **Ollama** (`translation_provider = "ollama"`) — `ollama.exe` có chữ ký hợp lệ (Ollama Inc.) nên SAC cho phép. Test trong app: ✅ *"Kiểm tra dịch thoại thành công!"*. STT vẫn dùng `whisper-cli.exe` + `ggml-base.bin` (2,6s/clip CPU).
- **Bài học cho Dev sau:**
  1. **Binary tải từ Internet không ký sẽ bị chặn trên máy người dùng** — đây là rủi ro *distribution* thật của Sublix, không chỉ là vấn đề máy dev. Cần kiểm tra trên máy người dùng có SAC bật (Windows 11 mặc định **bật**).
  2. **Luôn sẵn sàng provider ký hợp lệ** (Ollama / MiniMax Cloud) làm đường dịch thay cho GGUF embedded.
  3. Muốn dùng lại GGUF trên máy có SAC: phải **tắt Smart App Control** (Windows Security → App & browser control) — đây là **đường một chiều**, bật lại phải reset Windows. Nên hỏi PO trước khi đụng vào.
  4. Khi debug "binary không chạy": đọc `Microsoft-Windows-CodeIntegrity/Operational` (ID 3033/3077) + kiểm tra `Get-AuthenticodeSignature` — nhanh hơn nhiều so với đoán.

---

### [BUG-H10] Ollama timeout quá ngắn + Qwen3 "Thinking" làm dịch chậm 20×
- **Ngày:** 2026-10-24 | **Phát hiện bởi:** Mavis khi verify preset AMD iGPU | **Status:** ✅ Fixed (v0.11.36)
- **File:** `src-tauri/src/translate/server.rs` (`translate_via_ollama`, `translate_batch_via_ollama`)
- **Triệu chứng:** bấm *"🧪 Dịch Thử Nghiệm Ngay"* → *"❌ Lỗi kết nối: HTTP POST to Ollama ... operation timed out"*.
- **Root cause (2 tầng, đo được từ log Ollama `slot print_timing`):**
  1. **Timeout 25s quá ngắn.** Request đầu tiên phải **nạp model vào RAM/VRAM** — đo thật **45–95s** (model 2,3 GB + biên dịch graph GPU). Timeout cũ chặn trước khi phản hồi về.
  2. **Qwen3 trên Ollama là bản "Thinking".** `qwen3:4b` → `general.name = Qwen3 4B Thinking 2507`, template `[tools thinking completion]` → sinh **548–2123 token suy luận** cho một câu dịch 5 từ (đo: `n_gen` tăng liên tục, `tg ≈ 13-45 tok/s`). Tổng thời gian **52–112s**.
  3. **Đo đối chiếu:** `qwen2.5:3b` (không thinking) trả lời trong **6,0s** → chênh lệch **~20×** cho cùng một câu.
- **Fix:**
  1. `translate_via_ollama`: timeout **25s → 120s**; `translate_batch_via_ollama`: **60s → 300s** (batch nhiều câu + nạp model lần đầu).
  2. Thêm `"think": false` vào body của cả 2 hàm (Ollama bỏ qua với model không hỗ trợ).
  3. Preset **AMD iGPU** ưu tiên **`qwen2.5:3b`** (không thinking, nhanh, vừa 12,2 GiB VRAM của iGPU) thay vì `qwen3:4b`.
- **Bài học:**
  1. **Timeout của provider LLM phải tính cả thời gian nạp model**, không chỉ thời gian sinh token.
  2. **Model "Thinking" là kẻ giết ngầm** cho pipeline phụ đề: sinh token suy luận vô dụng + có thể lọt reasoning vào phụ đề. Phải chặn ở tầng request (`think: false`), không chỉ lọc hậu kỳ bằng `post_process`.
  3. Khi so sánh 2 model, **đo cả `n_gen`** (số token sinh ra) chứ không chỉ tổng thời gian — nhiều token sinh ra chỉ để suy luận rồi bị bỏ.

---

### [BUG-H11] App ép binary whisper-CUDA dù người dùng đã chọn engine "CPU"
- **Ngày:** 2026-10-24 | **Phát hiện bởi:** Mavis (máy chỉ có GPU AMD) | **Status:** ✅ Fixed
- **File:** `src-tauri/src/stt/whisper_local.rs` (`find_whisper_cli_with_engine`, `ensure_binary_with_engine`), + `dubbing/mod.rs`, `file_sub.rs`, `lib.rs`
- **Triệu chứng:** *"Lỗi phân tích: Whisper không tạo được phụ đề cho tệp này."* — nhưng **chạy đúng lệnh whisper-cli thủ công thì ra kết quả bình thường** (4,8 s, SRT đúng).
- **Root cause:** `find_whisper_cli_with_engine()` **luôn ưu tiên binary CUDA nếu tồn tại**, không đọc `stt_engine_preference` trong config. Máy có sẵn `binaries/whisper-cuda/` (để dành cho máy NVIDIA) → app luôn spawn binary CUDA → máy không có NVIDIA (hoặc người dùng đã chọn CPU) → whisper fail, lỗi báo chung chung.
- **Fix:** thêm `ensure_binary_with_engine_pref(pref)` + `find_whisper_cli_with_engine(pref)`:
  - `Cpu` → **luôn** binary CPU (bỏ qua CUDA hoàn toàn)
  - `Cuda` → ưu tiên CUDA, không có thì fallback CPU (an toàn)
  - `Auto` → CUDA trước, không có thì CPU (giữ hành vi cũ)
  - 3 call-site đọc `stt_engine_preference` từ `AppConfig`.
- **Bài học:** **cấu hình engine của người dùng phải được tôn trọng ở tầng chọn binary**, không chỉ ở tầng UI. Khi debug "AI fail", **chạy lại đúng binary + đúng tham số thủ công** để tách lỗi "app chọn sai binary" khỏi lỗi "binary/model hỏng".

---

### [BUG-H12] Xuất video fail trên ffmpeg 8+ — `-filter_complex_script` đã bị gỡ
- **Ngày:** 2026-10-24 | **Phát hiện bởi:** Mavis | **Status:** ✅ Fixed
- **File:** `src-tauri/src/dubbing/mod.rs` (`render_amix_chunk`, `render_combined_speech_track`, nhánh remux phụ đề)
- **Triệu chứng:** *"❌ Lỗi xuất video: FFmpeg amix chunk render failed"* — không có file output, không có log ffmpeg (Rust chỉ kiểm tra `status.success()`).
- **Root cause:** **ffmpeg 9.0.2 đã gỡ option `-filter_complex_script`** (còn từ ffmpeg ≤ 7.x). Chạy lại lệnh ffmpeg thủ công cho thấy: `Unrecognized option 'filter_complex_script'.` → ffmpeg exit != 0 → app báo lỗi chung. Máy của PO dùng ffmpeg 6/7 nên không dính.
- **Fix:** truyền **graph trực tiếp** qua `-filter_complex` (2 call-site). Rust `Command::arg()` không qua shell → không lỗi quoting với `[ ] | ; :`; độ dài graph rất nhỏ (mỗi chunk ≤ 28 input ≈ 1 KB) nên không vướng giới hạn 32 KB của Windows.
- **Bài học:**
  1. **Khi lỗi ffmpeg chỉ hiện "command failed", phải chạy lại lệnh thủ công để xem stderr** — Rust code hiện bỏ qua stderr khi spawn ffmpeg, làm mất thông tin quan trọng nhất.
  2. **Tương thích ffmpeg phải được kiểm tra theo phiên bản**, không giả định option còn tồn tại. `-filter_complex_script` là ví dụ điển hình (mất từ ffmpeg 8).
  3. Nên log stderr của ffmpeg vào thông báo lỗi để người dùng tự chẩn đoán được.

---

### [BUG-H13] Edge-TTS vi-VN trả về 0 byte cho một số câu tiếng Việt — không retry ⇒ mất tiếng trong bản dịch
- **Ngày:** 2026-10-24 | **Phát hiện bởi:** mcode #2 (Orca worker, task `TSK-RES-VI-VOICE`) khi benchmark giọng đọc | **Status:** 🔴 Open (chưa sửa — task này chỉ nghiên cứu, KHÔNG sửa code app)
- **File:** `src-tauri/src/dubbing/mod.rs` (`synthesize_speech()` — lệnh `edge-tts --text … --write-media …`), `find_edge_tts()`
- **Triệu chứng:** endpoint read-aloud của Microsoft **trả về 0 byte** cho một số câu tiếng Việt; `edge-tts` exit ≠ 0 với `NoAudioReceived`. Vì `synthesize_speech()` coi exit code khác 0 là lỗi ngay và **không retry**, câu đó **không có tiếng** trong bản dịch (hoặc cả job đổ lỗi).
- **Root cause (đo được, `edge-tts` 7.3.1, voice `vi-VN-HoaiMyNeural`):**
  1. Lỗi **có tính thất thường**: cùng một câu fail rồi lại thành công ở lần thử sau (giãn cách ~1,2–1,5 s). Trong 3 câu thử nghiệm cần **2 lần retry**.
  2. Một số chuỗi **gần như luôn fail** (ví dụ câu chứa `ô`), số khác chỉ fail ~30% lần thử. Không phải lỗi mã hóa tiếng Việt nói chung (ASCII và câu ngắn có dấu vẫn chạy).
  3. **Cả Python API lẫn CLI đều lỗi** → không phải lỗi wrapper của Sublix, mà lỗi ở tầng endpoint.
- **Cách phòng tránh (đề xuất, chưa áp dụng):** trong `synthesize_speech()` thêm vòng retry **3–5 lần, giãn cách 1–1,5 s**, và kiểm tra **file MP3 đầu ra > 0 byte** trước khi coi là thành công. Ngoài ra nên coi Edge-TTS là **fallback dự phòng**, không phải mặc định — vì nó còn vấn đề giấy phép thương mại.
- **Tài liệu:** `docs/VI_VOICE_MODELS_2026.md` §Phụ lục A (kèm script tái hiện).

---

### [BUG-082] `kuaishou`/`migu` có trong `get_platform` nhưng yt-dlp KHÔNG hỗ trợ — dán link ăn `Unsupported URL`
- **Ngày:** 2026-10-24 | **Phát hiện bởi:** CommandCode (Orca worker, task `TSK-RES-DL-PLATFORMS` → sửa trong `TSK-FEAT-DL-PLATFORMS-REUP`) | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`get_platform`, `platform_error_hint`, `fetch_video_info`, `start_download`), `downloader/reup.rs` (mới), `downloader/batch.rs` (`expand_playlist`)
- **Triệu chứng:** Dán link Kuaishou/Migu vào tab Tải video → UI hiện đúng tên nền tảng ("Kuaishou (快手)" / "Migu (咪咕)") nhưng tải thất bại với `ERROR: Unsupported URL`. Hint cũ còn khuyên *"Hãy cập nhật yt-dlp (pip install -U yt-dlp)"* — sai hướng.
- **Root cause:** `get_platform` nhận diện host `kuaishou.com`/`gifshare`… và `migu.cn` (kế thừa hermes-downloader), **nhưng `yt-dlp --list-extractors` (2026.10.21) KHÔNG có extractor nào** cho hai nền tảng này → luôn `Unsupported URL`. Việc "cập nhật yt-dlp" không giải quyết được.
- **Fix:** thêm `reup::unsupported_platform_message()` và gọi **ngay đầu** `fetch_video_info`, `start_download`, `expand_playlist` → fail sớm, rõ ràng, **không spawn yt-dlp**. Đổi câu hint `Unsupported URL` thành báo thẳng, bỏ gợi ý cập nhật (áp dụng cho mọi nền tảng chưa có extractor).
- **Bài học:**
  1. `get_platform` chỉ là *nhận diện để hiển thị*, **không** đồng nghĩa yt-dlp tải được — phải đối chiếu `yt-dlp --list-extractors` trước khi cho người dùng dán link.
  2. "Cập nhật yt-dlp" chỉ đúng khi extractor tồn tại nhưng bản cũ; với nền tảng upstream chưa hỗ trợ thì phải nói thẳng là không tải được.
  3. Danh sách nền tảng không hỗ trợ nên **gom vào 1 hằng số** (`UNSUPPORTED_PLATFORMS`) để dễ cập nhật khi yt-dlp thêm extractor mới.

---

### [BUG-085] Cài đặt ghi đè API key bằng chuỗi rỗng (mất key MiniMax/OpenRouter)
- **Ngày:** 2026-10-24 | **Phát hiện bởi:** coordinator (key bị xoá khi bấm Lưu) | **Sửa bởi:** CommandCode (Orca worker, `TSK-UI-REDESIGN-R2-5-7`) | **Status:** ✅ Fixed
- **File:** `src/views/settings/configMerge.ts` (mới — hàm thuần), `src/views/SettingsView.tsx` (`saveConfigPatch`, `clearProviderKey`), test `scripts/settings-tests/configMerge.test.ts`
- **Triệu chứng:** Key MiniMax/OpenRouter có trong `sublix-config.json` nhưng **biến mất** sau khi mở Cài đặt rồi bấm "Lưu cấu hình" (ô key để trống).
- **Root cause:** Settings giữ `fullConfig` nạp **một lần lúc mở app**. Nếu key được nạp thẳng vào file config sau đó (script/coordinator), `fullConfig` vẫn là bản cũ (key rỗng) → `saveConfig({...fullConfig, minimax_api_key: minimaxKey})` **ghi đè file bằng bản cũ**, xoá key thật. Không có khái niệm "field người dùng vừa sửa".
- **Fix:** `mergeConfig(latest, patch, keyForm, clearKeys)` — luôn gộp trên config **đọc lại từ đĩa ngay trước khi lưu**; key chỉ ghi khi người dùng **vừa gõ** (chuỗi rỗng bị bỏ qua); xoá key chỉ khi bấm "Xoá key"; mọi field khác (kể cả field backend mới thêm) giữ nguyên. 12 test `node --test` phủ: form rỗng không xoá minimax/openrouter/deepseek/gcloud/fpt, xoá chủ động thì xoá, đổi provider/model/reasoning chỉ đổi field đó, field lạ không mất, không mutate input.
- **Bài học:**
  1. **Form ghi đè toàn bộ config là mẫu lỗi kinh điển** khi dữ liệu có thể bị thay đổi từ nguồn khác (script, agent, instance khác). Luôn `read-modify-write` trên bản mới nhất.
  2. **Ô nhập bí mật phải phân biệt "chưa nhập" với "xoá"** — dùng cờ dirty, không dùng chuỗi rỗng làm tín hiệu.
  3. Tách logic gộp thành **hàm thuần** để test được mà không cần app/Tauri.

---

### [BUG-H20] PowerShell 5.1 làm hỏng file UTF-8 (mojibake toàn file)
- **Ngày:** 2026-10-25 | **Phát hiện bởi:** Mavis/mcode (task `TSK-UI-REDESIGN-R2-7C`) | **Status:** ✅ Fixed
- **File:** `src/views/ProcessCenterView.css` (sinh lại từ `ProcessCenterModal.css`).
- **Triệu chứng:** cả file CSS bị đổi thành mojibake — `Tiến` → `Tiáº¿n`, `—` → `â€"`, `§` → `Â§`; kiểm tra bằng `Get-Content` hiện text hỏng ngay sau khi **tự thêm** phần style mới bằng PowerShell.
- **Root Cause:** PowerShell 5.1 `Get-Content -Raw` đọc file **UTF-8 không BOM** theo **ANSI/Windows-1252** ⇒ biến byte UTF-8 thành ký tự Latin-1; `Set-Content -Encoding UTF8` ghi lại những ký tự đó thành UTF-8 ⇒ **double-encoding toàn bộ file** (kể cả phần không sửa) + thêm **BOM**.
- **Cách fix:** Sinh lại file bằng **Node** (`fs.readFileSync(path,"utf8")` → `fs.writeFileSync(path,s,"utf8")`) với nội dung khối mới lấy từ file riêng do tool viết; kiểm tra byte-level (`U+FFFD` = 0, không có `c3a1c2bac2bf`) trước khi bàn giao.
- **Bài học:** **Đừng dùng PowerShell để sửa file nguồn trong repo này.** Mọi file `.ts/.tsx/.css` phải sửa bằng tool sửa file hoặc Node. Nếu buộc dùng PS: `Get-Content -Encoding UTF8` **và** `Set-Content -Encoding UTF8` phải đi **cùng nhau** (và phải chấp nhận BOM) — ngoài ra `git diff` sẽ hiện **toàn bộ** file là đổi (dấu hiệu mojibake toàn file).

---

### [BUG-H19] Bỏ dấu tiếng Việt làm TRÙNG các từ khác nhau — đo metric sai
- **Ngày:** 2026-10-24 | **Phát hiện bởi:** mcode #2 (đo xưng hô cho `TSK-FEAT-CONTEXT-TRANSLATE`) | **Status:** 🟡 Workaround (đã xử lý trong `pronoun_audit.rs`)
- **Triệu chứng:** metric "số dòng có `ngươi`" báo **8 dòng** cho bản dịch 60 câu, nhưng tra tay chỉ thấy **2 dòng** thật sự chứa "ngươi". Tìm ra 6 dòng còn lại chứa **"người"** (con người).
- **Root Cause:** bỏ dấu kiểu Unicode gộp `ngươi` và `người` về cùng chuỗi `nguoi`; tương tự `cậu`/`câu` → `cau`, `bạn`/`bàn` → `ban`, `tao`/`táo` → `tao`. Ngoài ra `chỉ` → `chi` làm hàng loạt dòng bị tính nhầm là đại từ gọi nhau "chị".
- **Cách phòng tránh:** (1) trước khi bỏ dấu, thay từng cặp bằng **sentinel riêng** rồi mới bỏ dấu; (2) bỏ các từ quá dễ nhầm khỏi danh sách đại từ; (3) **luôn đối chiếu kết quả metric với đếm tay trên vài chục dòng** trước khi kết luận.
- **Bài học:** metric tự động nào cũng cần **một ca kiểm tra thủ công nhỏ**; lỗi bỏ dấu làm sai kết luận đảo ngược (lúc đầu tưởng đường mới tăng `ngươi` 9→11, thực ra là 3→5).
- **Ghi chú WDAC:** `cargo test` có thể bị chặn `os error 4551` (Smart App Control) ngay sau khi build — cách vượt: **đổi mtime file nguồn** để dựng lại hash rồi chạy lại (xem `BUG-084`), `CARGO_TARGET_DIR=%TEMP%\sublix-cc-target`.

---
