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
