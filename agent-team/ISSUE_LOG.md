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
| `BUG-033` | Phím tắt Ctrl+Shift+L dùng cài đặt cũ (stale closure) — đổi model/ngôn ngữ không ăn theo (code CommandCode) | `SettingsView.tsx` (hotkey effect) | Handler trong keydown phải đi qua `latestRef` hoặc deps đầy đủ | 🔴 Open |
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
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** — | **Status:** 🔴 Open
- **File:** `SettingsView.tsx` (hotkey `useEffect`, deps `[isLive, overlayVisible]`)
- **Root Cause:** Listener chỉ tái tạo khi `isLive`/`overlayVisible` đổi → `handleStartLive` được gọi là bản cũ, đọc model/ngôn ngữ/chunk ở thời điểm re-bind trước đó; nút bấm thì dùng giá trị mới.
- **Cách fix & Bài học:** Handler trong keydown phải đi qua `latestRef` (hoặc deps đầy đủ). Phím tắt + handler async = cặp đôi dễ dính stale closure nhất.

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

