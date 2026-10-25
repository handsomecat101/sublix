## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)


### 2026-10-25 07:45 - mcode #3 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-018-FIX-R2` — sửa lỗ hỗng reviewer phát hiện trong `proc_kill.rs`; **không commit**).
- **Lỗ hỗng:** file `.pid` đang nừm **chung `%TEMP%` cho mối instance** (app PO + instance verify cùng `%TEMP%`, chỉ khác `%APPDATA%`) → instance B đọc PID server **đang sống** của instance A rồi giết — đúng loại BUG-003 ta đang chặn.
- **Sửa:** file `.pid` giờ **2 số** `<server_pid> <owner_pid>` (PID app chủ). Ham thuan `pick_kill_target` nhân thêm `owner_alive` + `current_pid`: chỉ giết khi **owner đã chết** (server mồ côi) hoặc `owner_pid == PID` hiện tại; **owner còn sống (instance khác) → không giết**; file sai định dạng (chỉ 1 số) → owner không rõ → **không giết** (an toân) và ghi đè file mới sau khi spawn. Thêm `process_is_alive(pid)` (tasklist `/FI`; không xác định → coi như **còn sống** để an toân).
- **Test:** thêm 4 test cho hành thuần `pick_kill_target`: **owner còn sống → không giết** · **owner đã chết → giết** · owner là chính app hiện tại → được thay thế · **file định dạng cũ (1 số) → không giết**; + test vòng `write/read_tracked_pid` ghiđợc PID app chủ. `cargo test --lib` **223 pass / 0 fail**, `cargo clippy --lib --tests` **không thêm cảnh báo mới** (1 cảnh báo trong file tôi sửa là `EnginePreference::from_str` cũ cũ).
- **Phạm vi:** chỉ `src-tauri/src/proc_kill.rs` + `src-tauri/src/stt/whisper_server.rs` + `src-tauri/src/translate/server.rs` + 2 file test; không động `lib.rs`/`src/**`/module khác.

---
---

### 2026-10-25 07:35 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-STUDIO-WIRE-CTX-STT` — gắn dịch theo ngữ cảnh + engine STT vào Studio; **chưa commit**).
- **Mục 1 (đã SỬA theo đo thật §4.4):** KHÔNG thay hết — thêm công tắc **"Dịch theo ngữ cảnh"** (Segmented Tắt/Bật, lưu localStorage **theo provider**; mặc định BẬT openrouter/deepseek, TẮT ollama/gguf/minimax; bật với model local → hiện dòng *"Model nhỏ trên máy dịch kém hơn ở chế độ này"*). Khi bật: gọi `translate_script_contextual` + nghe `translate:progress` (hiện "Đọc hiểu kịch bản…" rồi "Đang dịch 120/480 câu"); lỗi → tự rơi về dịch theo lô, không crash.
- **Ước tính thời gian:** `estimate.ts` có hệ số chậm khi bật ngữ cảnh (MiniMax ×1,6 theo bench) và `rateKey` thêm `:ctx`; STT giờ **phân biệt theo engine** — `parseRtfFromNote` đọc RTF thật từ `rtf_note` của catalog (vd "RTF 1,22 (EN) · 1,62 (ZH)"), không hard-code.
- **Mục 2 (engine STT):** `src/views/studio/StudioSttEnginePicker.tsx` (mới) — dropdown lấy từ `stt_engines_status`, **gợi ý theo ngôn ngữ nguồn theo `languages` của catalog**, engine chưa tải → `ModelDownloadRow` (tiến trình `model:download-progress`, nút Hủy = `stt_model_cancel`), chọn → `stt_set_engine` (không nút Lưu). Khi engine ≠ Whisper, luồng "chỉ làm phụ đề" dùng `stt_transcribe` (sidecar tự trích 16 kHz mono bằng ffmpeg) thay cho `dubbing_analyze`.
- **Verify:** `node --test scripts/timeline-tests/` **95/95 PASS** (12 case mới) · `tsc` 0 lỗi + `npm run build` OK trên **bản sao HEAD + file của tôi** (repo chính hiện lỗi `ProcessCenterView.tsx` — file của worker khác) · GUI **6/6 PASS** trên instance riêng (release build, CDP 9226, **APPDATA riêng** để không đụng config của PO): dropdown 7 engine + "chưa tải", dòng RTF từ catalog, đổi engine gọi `stt_set_engine`, công tắc ngữ cảnh + gợi ý model local, cờ lưu theo provider.
- **⚠️ Cần biết:** app của PO đang chạy bình thường; instance verify đã tắt, worktree tạm đã xoá. Đường `stt_transcribe` chỉ dùng cho luồng "chỉ làm phụ đề"; pipeline đầy đủ (phân vai + dịch) vẫn đi qua `dubbing_analyze` (Whisper) — cần mcode #3 thêm engine id vào `dubbing_analyze` để áp dụng rộng.

---

---

---
---
---

### 2026-10-25 07:25 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-REFACTOR-GLOSSARY-300` — tách 2 file > 300 dòng, **chỉ di chuyển code, không đổi hành vi**; **chưa commit**).
- **Tách:** `glossary.rs` 366 → **272** (+ file mới `glossary_prompt.rs` 111: `to_rules` / `hard_block` / `suggestion_from_reference`) · `contextual_run.rs` 336 → **165** (+ `contextual_chunk.rs` 134: gọi LLM theo lô; `contextual_verify.rs` 89: hậu kiểm + dịch lại 1 câu). Mọi file trong `translate/` giờ **< 300 dòng**.
- **API công khai giữ nguyên:** `glossary::suggestion_from_reference` re-export qua `pub use`; `Glossary::to_rules()`/`hard_block()` vẫn là method của `Glossary`; `contextual_run::build_reference`/`translate_script_contextual` giữ nguyên vị trí ⇒ `lib.rs` + `bench/mod.rs` **không phải sửa** (compile + test pass là bằng chứng).

---
---
---

### 2026-10-25 07:20 - mcode #3 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-018-FIX` — sửa BUG-002/003/010 (tiến trình ma, kill theo tên, command sync chặn luồng chính); **không commit**).
- **BUG-003 (kill theo tên):** bỏ hoàn toàn `taskkill /IM whisper-server.exe|llama-server.exe /F` — thay bằng module mới `src-tauri/src/proc_kill.rs`: chỉ kết thến **PID con mình vừa spawn** (giữ handle `Child`) hoặc PID **ta đã ghi nhò** trong file `.pid`, và **kiểm tra tên tiến trình** trước khi giết (PID có thể bệ hệ được cấp lại cho tiến trình khác) → không bao giờ giết app/instance khác.
- **BUG-002 (tiến trình ma):** thêm `stop_server()` idempotent (và `try_lock` + **timeout 3 s**, log `tracing`) cho cá 2 server; `RunEvent::Exit` **và** `ExitRequested` đều gọi `whisper_server::stop_server()` + `translate::server::stop_server()` ngoài `downloader::shutdown_all_jobs()`.
- **BUG-010 (command sync chặn luồng chính):** `transcribe_test` · `translate_test` · `test_audio` · `scan_audio_levels` → **`async` + `tauri::async_runtime::spawn_blocking`** cho phần nặng; **giữ nguyên tên lệnh, tham số và kiểu trả về** ⇒ frontend không phải sửa.
- **Test:** `proc_kill.rs` 6 test cho hàm thuần `pick_kill_target` + file test mới `stt/whisper_server_tests.rs` (3) và `translate/server_tests.rs` (3) — gời chố hội quy: mã nguồn cần có `"/IM"` trong mã nguồn. `cargo test --lib` **218 pass / 0 fail**, `cargo clippy --lib` **không thêm cảnh báo mới** (4 cảnh báo trong file tôi sửa đều là cãnh cũ).
- **Cớn lại:** đã xoá `taskkill /IM` khối toàn `src-tauri/src/`; server cũ vẫn sống cổa đểu để đổng PID nén — nến uyê hiệm.

---
---
---

### 2026-10-25 07:20 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-TIMELINE-REDO-RIPPLE` — Redo + Ripple delete + marker định dạng cũ; **chưa commit**).
- **1) REDO:** module thuần `src/lib/timeline/history.ts` (past/future, giới hạn 20, push xoá future, undo/redo trả snapshot) áp cho **cả 3 lớp** (phụ đề / bản dịch / audio); phím **Ctrl+Shift+Z** và **Ctrl+Y**; nút **↷** cạnh ↶ trên MasterTopbar (disabled khi rỗng, tooltip phím tắt, chuột phải chọn lớp làm lại).
- **2) RIPPLE DELETE:** module thuần `src/lib/timeline/ripple.ts` — xoá câu/khối đang chọn (kể cả multi-select Ctrl+click) và dồn câu phía sau sang trái đúng bằng khoảng bị xoá (câu chọn nhiều → tính theo **khoảng hợp nhất**, không chồng nhau/không liền); **tôn trọng khoá track** (track khoá → không dồn + toast). Phím **Shift+Delete** + mục **"Xoá và dồn khoảng trống"** trong menu chuột phải.
- **3) MARKER ĐỊNH DẠNG CŨ:** `normalizeMarkers(raw)` trong `markers.ts` chịu được số giây thuần (`[12.5, 30]`), object thiếu `id`, thiếu `color`, `time` dạng chuỗi, key khác (`seconds`/`start`/`position`), bọc `{version, markers}`; dùng khi nạp project cache → **marker cũ không còn "mất tăm"**.
- **Verify:** `node --test scripts/timeline-tests/` **107/107 PASS** (18 case mới) · `tsc` 0 lỗi · `npm run build` OK · GUI instance riêng (release build `npx tauri build --no-bundle` — **không** `cargo build --release`, CDP 9227, APPDATA riêng) **5/5 PASS**: marker cũ hiện đủ 3 vạch, nút ↷ disabled khi rỗng, Shift+Delete dồn câu sau 117,19px → 58,59px, Ctrl+Z rồi Ctrl+Shift+Z khôi phục đúng, menu chuột phải có mục ripple.
- **⚠️ Lưu ý:** đường `undoStack` (general) giữ nguyên như cũ; redo lấy từ `future` của từng lớp. Instance verify đã tắt, app PO (1420) không bị đụng; chưa commit.
---
---

### 2026-10-25 07:02 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-FIX-EXAMPLES` — 3 example Rust không build được từ commit `c9ccaad`; **chưa commit**).
- **Fix:** `analyze_and_create_project` đã đổi **5 → 7 tham số** (`start_offset_sec` + `expected_speakers`) ⇒ thêm 2 `None` vào `test_dubbing_e2e.rs`, `test_dubbing_kokoro.rs`, `test_v2_diarization_e2e.rs` (giống hệt lệnh Tauri `dubbing_analyze` khi UI không gửi 2 tuỳ chọn này). **Không** đụng `src-tauri/src/**` hay `src/**`.
- **Verify:** `cargo build --examples` **exit 0** — 7/7 example ra `.exe` (`CARGO_TARGET_DIR=%TEMP%\sublix-cc-target`), build lại là no-op ⇒ đã xoá đúng lỗi mà mcode #2 báo trong AGENT_CHAT. *(Verify lần 2 trên **bản sao HEAD + 3 file của tôi** — repo chính đang tạm **đỏ** vì worker khác sửa dở `src-tauri/src/**` (`proc_kill` chưa khai báo trong `lib.rs`), **không** phải lỗi của task này.)*

---
---
---

### 2026-10-25 06:55 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-FEAT-GLOSSARY-PRONOUN` — bảng thuật ngữ + xưng hô **đã duyệt**; **chưa commit, không push**).
- **Backend:** `translate/glossary.rs` (types + block ràng buộc cứng) · `glossary_store.rs` (file `<project>.sublix-glossary.json` **atomic** + fallback config toàn cục) · `glossary_check.rs` (hậu kiểm tất định, không gọi mạng) · 3 lệnh `glossary_get`/`glossary_set`/`glossary_suggest` (`glossary_suggest` **không tự ghi**) · `contextual.rs` (block ràng buộc đặt TRƯỚC bản tham chiếu; `locked` ⇒ bỏ bảng xưng hô tự sinh) · `config.rs` (+`glossary_table`).
- **Frontend:** `src/components/glossary/GlossaryEditor.tsx` (component độc lập, props thuần) + `glossaryModel.ts` (logic thuần) + CSS + `scripts/glossary-tests/` (12 test).
- **Đo thật** (60 câu StarCraft, MiniMax-M3.1-Flash, metric tất định): **CŨ** 29,4s → `nguơi` 3 · **CŨ+glossary** 19,6s → `nguơi` 1 · **MỚI** 46,1s → `nguơi` 11 · **MỚI+glossary** 44,9s → **`nguơi` 0**, `tôi` 42, `anh/ngài` 11, số cách gọi/1 cặp 5→4 · điểm DeepSeek điểm xưng hô **2/5 → 3/5** ố CỪ LÀ CẮ. ⇒ **MỚI + glossary là cấu hình tốt nhất**.
- **Còn lệch 4–7/60 câu** sau khi áp bảng (model không tuân thủ tuyệt đối) → hậu kiểm gắn `glossary_violation`, UI tô vàng + dịch lại riêng câu 1 lần. Hậu kiểm là **gợi ý**, có báo nhầm (vd "người bạn già" ≠ đại từ) — chấp nhận để PO quyết.
- **Verify:** `cargo test --lib` **206 pass / 0 fail** / 16 ignored · `npx tsc --noEmit` 0 lỗi · `node --test scripts/glossary-tests/` **12/12** · `cargo build --example bench_translate` OK.
- **⚠️ Lỗi CÓ SẴN từ commit `c9ccaad` (KHÔNG phải của tôi):** `cargo build --examples` FAIL — `examples/test_dubbing_e2e.rs`, `test_dubbing_kokoro.rs`, `test_v2_diarization_e2e.rs` gọi `analyze_and_create_project` (đã đổi thành 7 tham số) với 5 tham số. Cần owner `dubbing/` sửa.
- **Đề xuất coordinator:** gắn `GlossaryEditor` vào Studio (UI) · cho `translate_script_contextual` nhận `projectPath` để dùng bảng theo dự án · mở nút "Gợi ý từ kịch bản" sau khi bấm "Dịch theo ngữ cảnh".

---

---
---
---

### 2026-10-25 06:50 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-UI-REDESIGN-R2-7C` — R2-7C: UI tab **Tiến trình**, **chưa commit**).
- **Mới:** `src/views/processLogic.ts` + `processTypes.ts` (mới) + `ProcessCenterView.tsx` viết lại + `ProcessCenterView.css` (mới) — **xoá** `ProcessCenterModal.tsx/.css` (TL-14: chỉ còn 1 giao diện; nút "Mở Tiến Trình" của toast nền nay sang thẳng tab).
- **UI:** 6 **chip lọc ngang** (`Segmented`) kèm số đếm thay 6 nút dọc ở cột trái (nhãn lấy từ hằng số → **hết ký tự lạ** "Tải videoo"/"Đang xử lýo"); **menu `⋯`** đầu danh sách gom "Mở Thư Mục Thành Phẩm" · "Mở Thư Mục Tải Về" · "Xoá Lịch Sử Tiến Trình" (nguy hiểm + **hộp xác nhận**); trạng thái rỗng có **câu hướng dẫn riêng** cho từng nhóm lọc (thay thẻ "Hướng Dẫn & Lưu Ý").
- **Logic thuần:** `processLogic.ts` (lọc/đếm/nhóm tác vụ/làm sạch nhãn) + `scripts/process-tests/` → **23/23 PASS**.
- **Verify:** trên **bản sao HEAD + file của tôi** → `tsc` **0 lỗi** · `npm run build` OK (103 module) · `process-tests` 23/23 + `live-history-tests` 40/40 + `settings-tests` 21/21 + `timeline-tests` 95/95; ảnh Edge headless 1920×1080 (demo dữ liệu giả + **app thật** với tab "Tiến trình" active) render đúng. CSS cũ **803 → 751 dòng** sau khi cắt 63 rule chết.
- **Cảnh báo:** ghi `BUG-H20` — **PowerShell 5.1 làm hỏng file UTF-8** (`Get-Content -Raw` + `Set-Content -Encoding UTF8` ⇒ mojibake toàn file). Agent nào sửa file nguồn bằng PS thì phải kiểm tra `git diff` (toàn bộ file đổi = dấu hiệu). Chi tiết: `ISSUE_LOG.md`.

---

---

---
---
