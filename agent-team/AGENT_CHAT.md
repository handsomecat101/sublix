## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-25 11:45 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-FIX-BUG-H23` — `glossary_suggest` chịu được JSON "dạng cũ" từ LLM; **chưa commit**).
- **Sửa:** module mới `src-tauri/src/translate/glossary_parse.rs` — `thuat_ngu`/`terms` nhận **object HOẶC chuỗi** (`→` `=>` `->` `=` `:`), `xung_ho`/`pronouns` nhận object hoặc chuỗi `"Kaldares: gọi là anh, tự xưng tôi"`; phần tử hỏng ⇒ **bỏ qua + `tracing::warn!`**; **một phần hỏng không làm hỏng phần khác**; chịu được code fence + chữ thừa; chỉ `Err` khi JSON hỏng hẳn hoặc không lấy được gì.
- **Nối:** `contextual.rs::parse_reference` (đúng 1 hàm) gọi parser mới ⇒ cả `glossary_suggest` lẫn lượt 1 của đường dịch đều hưởng lợi. File trong `glossary*.rs` đều < 300 dòng (`glossary.rs` 285, `glossary_parse.rs` 222).
- **Verify:** `cargo test --lib` **242 pass / 0 fail** (10 test mới trong `glossary_parse_tests.rs`) · `cargo build --example bench_translate` OK · **test thật với Ollama `qwen2.5:3b`**: lần model trả định dạng cũ ⇒ *parse cứng* **FAIL**, *parse khoan dung* **OK** (cứu được 3 quy tắc xưng hô + 2 nhân vật + tóm tắt).
- **ISSUE_LOG:** `BUG-H23` → ✅ Fixed (kèm phần chi tiết ở cuối file).

---


### 2026-10-25 11:30 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-STUDIO-GLOSSARY` — gắn bảng thuật ngữ + xưng hô vào bước "Dịch" của Studio; **chưa commit**).
- **Đã làm:** nút **"📖 Thuật ngữ & xưng hô (N)"** ở bước Dịch → drawer bọc `GlossaryEditor` (nạp `glossary_get(projectPath)`, lưu `glossary_set` **debounce 400ms** — không cần bấm Lưu); **"⚡ Gợi ý từ kịch bản"** = 1 lượt đọc hiểu (có tiến trình + ước tính thời gian) và **không tự ghi** (✓ mới nhận); câu vi phạm → **tô vàng** (thẻ phụ đề + khối timeline) + badge/tooltip lý do + menu chuột phải **"🔁 Dịch lại câu này"**; `translate_script_contextual` nay truyền `projectPath` ⇒ backend áp **bảng dự án** làm ràng buộc cứng.
- **File:** `src/views/SublixStudioView.tsx` · `src/views/studio/{StudioGlossaryDrawer,StudioPipelinePanel,StudioTranslateOptions,studioPipelineTypes}` + `StudioPipelinePanel.css` · `src/lib/timeline/glossary.ts` (mới) · `src/lib/tauri.ts` (wrapper + `projectPath`) · `scripts/timeline-tests/glossary.test.ts`.
- **Verify:** `node --test scripts/timeline-tests/` **121/121 PASS** · `npx tsc --noEmit` **0 lỗi** · `npm run build` **OK** · GUI instance riêng (release build, CDP 9227, identifier riêng + APPDATA riêng) **19/19 PASS**; E2E với Ollama thật: **dịch lại câu ra "mẫu tử tối"** theo bảng dự án (không còn "Dark Templar") + gợi ý LLM hiện dạng ✓/✕.
- **⚠️ Cần biết:** (1) `GlossaryEditor` (file của worker khác, **không sửa**) có `normalizeGlossary` **xoá dòng trống** ⇒ nút "+ Thêm thuật ngữ" bị nuốt dòng; tôi workaround trong drawer (bắt click phase `capture` rồi chèn lại 1 dòng nháp) — **nên sửa gốc ở `src/components/glossary/glossaryModel.ts`**. (2) Lỗi **backend** (ngoài phạm vi tôi): `glossary_suggest` fail khi LLM trả thuật ngữ dạng **chuỗi cũ** (`"gốc => dịch"`) thay vì object ⇒ mất cả phần xưng hô đã parse được — `ISSUE_LOG.md` `BUG-H21`/`BUG-H22`/`BUG-H23`.

---
---

### 2026-10-25 08:10 - mcode #3 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-DUBBING-STT-ENGINE` — pipeline lồng tiếng dùng engine STT đã chọn; **không commit**).
- **Sửa:** module mới `src-tauri/src/dubbing/stt_select.rs` — `dubbing_analyze` đọc config `stt_asr_engine` (backend tự đọc → **không đổi tham số lệnh Tauri, không sửa `src/**`**); engine sherpa + model đã tải → nhận dạng bằng engine đó (SenseVoice/Paraformer/Parakeet), **chưa tải / lỗi → rơi về Whisper** kèm log `tracing` + event `dubbing:progress` để UI toast.
- **Tán thổng:** engine không có timestamp từ (Paraformer) → dùng **timestamp câu**; kết quá đểnh dạng `SubtitleSegment` cũ nên để **bước phân vai (diarization) dùng đúc định dạng cũ**; `start_offset_sec` / `expected_speakers` giữ nguyên; ngôn ngợ nguồn chỉ truyền cho engine khi được hỗ trụ (SenseVoice zh/en/ja/ko/yue, Paraformer zh, còn lại để để auto).
- **Test:** `stt_select_tests.rs` 9 test thuần (chọn engine, engine lạ, ngôn ngợ, SRT định dạng) + test e2e `dubbing_stt_sherpa_that` chạy chạy trên clip Trung (PASS khi có model, SKIP khi chưa có); `proc_kill.rs` **441 → 253 dòng** (tách test ra `proc_kill_tests.rs` 193) · `cargo test --lib` **231 pass / 0 fail** · `cargo build --examples` OK (cã 4 example dubbing) · `cargo clippy` không thêm cảnh báo mới.

---
---

### 2026-10-25 07:45 - mcode #3 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-018-FIX-R2` — sửa lỗ hỗng reviewer phát hiện trong `proc_kill.rs`; **không commit**).
- **Lỗ hỗng:** file `.pid` đang nừm **chung `%TEMP%` cho mối instance** (app PO + instance verify cùng `%TEMP%`, chỉ khác `%APPDATA%`) → instance B đọc PID server **đang sống** của instance A rồi giết — đúng loại BUG-003 ta đang chặn.
- **Sửa:** file `.pid` giờ **2 số** `<server_pid> <owner_pid>` (PID app chủ). Ham thuan `pick_kill_target` nhân thêm `owner_alive` + `current_pid`: chỉ giết khi **owner đã chết** (server mồ côi) hoặc `owner_pid == PID` hiện tại; **owner còn sống (instance khác) → không giết**; file sai định dạng (chỉ 1 số) → owner không rõ → **không giết** (an toân) và ghi đè file mới sau khi spawn. Thêm `process_is_alive(pid)` (tasklist `/FI`; không xác định → coi như **còn sống** để an toân).
- **Test:** thêm 4 test cho hành thuần `pick_kill_target`: **owner còn sống → không giết** · **owner đã chết → giết** · owner là chính app hiện tại → được thay thế · **file định dạng cũ (1 số) → không giết**; + test vòng `write/read_tracked_pid` ghiđợc PID app chủ. `cargo test --lib` **223 pass / 0 fail**, `cargo clippy --lib --tests` **không thêm cảnh báo mới** (1 cảnh báo trong file tôi sửa là `EnginePreference::from_str` cũ cũ).
- **Phạm vi:** chỉ `src-tauri/src/proc_kill.rs` + `src-tauri/src/stt/whisper_server.rs` + `src-tauri/src/translate/server.rs` + 2 file test; không động `lib.rs`/`src/**`/module khác.

---
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
---

### 2026-10-25 07:25 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-REFACTOR-GLOSSARY-300` — tách 2 file > 300 dòng, **chỉ di chuyển code, không đổi hành vi**; **chưa commit**).
- **Tách:** `glossary.rs` 366 → **272** (+ file mới `glossary_prompt.rs` 111: `to_rules` / `hard_block` / `suggestion_from_reference`) · `contextual_run.rs` 336 → **165** (+ `contextual_chunk.rs` 134: gọi LLM theo lô; `contextual_verify.rs` 89: hậu kiểm + dịch lại 1 câu). Mọi file trong `translate/` giờ **< 300 dòng**.
- **API công khai giữ nguyên:** `glossary::suggestion_from_reference` re-export qua `pub use`; `Glossary::to_rules()`/`hard_block()` vẫn là method của `Glossary`; `contextual_run::build_reference`/`translate_script_contextual` giữ nguyên vị trí ⇒ `lib.rs` + `bench/mod.rs` **không phải sửa** (compile + test pass là bằng chứng).

---
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
---
