# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.


## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)
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

### 2026-10-25 06:50 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-UI-REDESIGN-R2-7C` — R2-7C: UI tab **Tiến trình**, **chưa commit**).
- **Mới:** `src/views/processLogic.ts` + `processTypes.ts` (mới) + `ProcessCenterView.tsx` viết lại + `ProcessCenterView.css` (mới) — **xoá** `ProcessCenterModal.tsx/.css` (TL-14: chỉ còn 1 giao diện; nút "Mở Tiến Trình" của toast nền nay sang thẳng tab).
- **UI:** 6 **chip lọc ngang** (`Segmented`) kèm số đếm thay 6 nút dọc ở cột trái (nhãn lấy từ hằng số → **hết ký tự lạ** "Tải videoo"/"Đang xử lýo"); **menu `⋯`** đầu danh sách gom "Mở Thư Mục Thành Phẩm" · "Mở Thư Mục Tải Về" · "Xoá Lịch Sử Tiến Trình" (nguy hiểm + **hộp xác nhận**); trạng thái rỗng có **câu hướng dẫn riêng** cho từng nhóm lọc (thay thẻ "Hướng Dẫn & Lưu Ý").
- **Logic thuần:** `processLogic.ts` (lọc/đếm/nhóm tác vụ/làm sạch nhãn) + `scripts/process-tests/` → **23/23 PASS**.
- **Verify:** trên **bản sao HEAD + file của tôi** → `tsc` **0 lỗi** · `npm run build` OK (103 module) · `process-tests` 23/23 + `live-history-tests` 40/40 + `settings-tests` 21/21 + `timeline-tests` 95/95; ảnh Edge headless 1920×1080 (demo dữ liệu giả + **app thật** với tab "Tiến trình" active) render đúng. CSS cũ **803 → 751 dòng** sau khi cắt 63 rule chết.
- **Cảnh báo:** ghi `BUG-H20` — **PowerShell 5.1 làm hỏng file UTF-8** (`Get-Content -Raw` + `Set-Content -Encoding UTF8` ⇒ mojibake toàn file). Agent nào sửa file nguồn bằng PS thì phải kiểm tra `git diff` (toàn bộ file đổi = dấu hiệu). Chi tiết: `ISSUE_LOG.md`.

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

### 2026-10-25 06:50 - mcode #3 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-FIX-REUP-SECTION` — chặn đoạn cắt reup ngược + dọn khoá `TSK-018` cũ; **không commit**).
- **Sửa:** `src-tauri/src/downloader/reup.rs` — `section_arg()` giờ so sánh mốc bắt đầu/kết thúc **theo giây**: `start >= end` → `Err("Thời điểm bắt đầu phải nhỏ hơn thời điểm kết thúc …")`; chỉ có start hoặc chỉ có end vẫn hợp lệ như cũ. Tách `parse_timecode()` + thêm `pub fn timecode_to_secs()` (không lặp logic; `normalize_timecode` giữ nguyên output). **Không `unwrap()`** trong code production; `reup.rs` 269 → **298** dòng (vẫn < 300).
- **Test mới:** `src-tauri/src/downloader/reup_section_tests.rs` (file mới, **không sửa** `reup_tests.rs`) — 6 test: start<end ok · start=end lỗi · start>end lỗi · định dạng hh:mm:ss / mm:ss / giây lẻ · chỉ 1 mốc · mốc sai định dạng vẫn lỗi như cũ.
- **PROJECT_STATE:** `TSK-018` (khoá từ 2026-10-12) → **⏸ Tạm dừng (mở khoá 2026-10-25)**. Đã kiểm code: BUG-003 **còn** (`stt/whisper_server.rs:303` + `translate/server.rs:459` vẫn `taskkill /IM <image>.exe /F`), BUG-002 **còn** (`RunEvent::Exit` chỉ gọi `downloader::shutdown_all_jobs()`, không kill whisper-server/llama-server), BUG-010 **còn** (`transcribe_test`/`translate_test`/`test_audio`/`scan_audio_levels` vẫn là command **sync**).
- **Verify:** `cargo test --lib` **203 pass / 0 fail** (6 test mới đều ok; `reup_tests::section_arg_builds_and_validates` cũ vẫn ok).

---

---

### 2026-10-25 06:35 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-UI-REDESIGN-R2-7B` — R2-7B: UI tab **Live** + **Lịch sử**, **chưa commit**).
- **Mới:** `src/views/live/{LiveView.tsx/.css, liveLogic.ts, liveTypes.ts}` + `src/views/history/{HistoryView.tsx/.css, historyLogic.ts}` — `SettingsView.tsx` **2823 → 2244 dòng** (−579). Logic thuần tách riêng (map select gộp, lọc lịch sử, định dạng SRT/TXT) → test `node --test scripts/live-history-tests/` **40/40 PASS**.
- **Live:** 1 select "Phụ đề hiển thị" (gộp chế độ xuất + ngôn ngữ đích; chọn "Gốc" **giữ** ngôn ngữ đích đã chọn) · ↻ quét âm thanh cạnh select thiết bị · "⚙ Nâng cao" gấp (chunk + Smart VAD) · **1 nút chính** Bắt đầu/Dừng Live (bỏ nút Mở Overlay — dùng 👁 topbar) · cột phải "Luồng thoại" giữ nguyên.
- **Lịch sử:** 2 cột (bỏ cột trái 300px) · ô tìm + `Sao chép tất cả` + split `Xuất .SRT▾` (menu SRT/TXT) + menu `⋯`→"Xoá toàn bộ lịch sử" **có hộp xác nhận** (nút nguy hiểm hết nổi bật nhất màn hình).
- **Bonus — fix `BUG-033`** (đang 🔴 Open): hotkey `Ctrl+Shift+L` đọc closure cũ → nay handler trong keydown đi qua `latestRef` (đổi model/ngôn ngữ rồi bấm tắt sẽ ăn đúng). Chi tiết: `ISSUE_LOG.md`.
- **Verify:** `tsc` 0 lỗi (repo, trước khi worker glossary tạo file mới) · `npm run build` OK · `live-history-tests` 40/40 + `settings-tests` 21/21 · ảnh thật Edge headless 1920×1080 (app chạy thật + backend giả) tab Live + Lịch sử render đúng. **Cảnh báo:** `timeline-tests` 89/91 — 2 fail do `src/lib/timeline/estimate.ts` đang sửa dở của worker khác (tại HEAD: 91/91 PASS), không liên quan task này.

---

---

### 2026-10-25 06:35 - mcode #3 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-REFACTOR-SPLIT-300` — tách 4 module Rust > 300 dòng, **chỉ di chuyển code, không đổi hành vi, chưa commit**).
- **Tách:** `model_download.rs` 774 → `model_download/{mod,progress,http,sha256}.rs` · `stt/stt_catalog.rs` 514 → `stt/stt_catalog/{mod,catalog_types,catalog_data,catalog_data_parakeet}.rs` · `stt/sherpa_asr.rs` 368 → `stt/sherpa_asr/{mod,sherpa_sidecar}.rs` · `translate/bench.rs` 338 → `translate/bench/{mod,score,dataset,bench_tests}.rs`. **File lớn nhất: 271 dòng** (tất cả 14 file đều < 300).
- **API không đổi:** để so tổt **mới `pub` có trong HEAD đều có trong module mới** (kiểm tự động trước); đễt tên `pub use` để `crate::stt::stt_catalog::SttEngineSpec`, `crate::stt::sherpa_asr::transcribe`, `crate::model_download::EVENT` … vẫn giở nguyên. Đổi tên lệnh `in_progress_slot` → `pub(crate)` + `download_one` → `pub(super)` để module con dùng được.
- **Verify:** `cargo test --lib` **197 pass / 0 fail** · `cargo build --example bench_translate` **OK** · `cargo clippy --lib`: 6 cảnh báo nừm trong 4 module đãu tách — để **là code di chuyển nguyên văn** (không phải cảnh báo mới) · không sửa `src/**`.
- **Lưu ý:** đãnh có bố module Rust > 300 dòng khác vẫn còn tách: `dubbing/mod.rs` 4578 · `downloader/mod.rs` 2951 · `translate/server.rs` 1991 · `lib.rs` 1986 · `file_sub.rs` 905 · `stt/whisper_local.rs` 802 · `translate/mod.rs` 754.

---

---

### 2026-10-25 03:10 - CommandCode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-SETTINGS-MODELS` — **chỉ FRONTEND**, chưa commit).
- **Mới:** `src/views/settings/SttSection.tsx` — danh sách engine từ `stt_engines_status` (catalog thật, **0 hard-code**), mỗi engine 1 `ModelDownloadRow` (Tải/Huỷ/Xoá + %/MB/s/ETA qua `model:download-progress`), Segmented **Engine mặc định** (chỉ engine đã tải → `stt_set_engine`), giữ **Tăng tốc Whisper (AUTO/CPU/CUDA)** + **Kiểm thử nhanh** cũ; bỏ danh sách Whisper trùng (catalog đã có whisper-base/turbo).
- **TTS:** backend chỉ phát `tts:deps_progress` (log pip, **không %**) → nút hiện "⏳ Đang cài…" + dòng log cuối, **không bịa %**, hành vi cũ giữ nguyên.
- **Logic thuần:** `modelUtils.ts` (`formatBytesVi`/`formatSpeedVi`/`formatEtaVi`/`progressPct`/`sortSttEngines`/`engineSummary`/`recommendSttEngine`) + `scripts/settings-tests/modelUtils.test.ts` (9 case) + `package.json`/`index.ts` để `node --test scripts/settings-tests/` chạy được (Node 24 không quét dir — cùng mẹo `timeline-tests`).
- **Verify:** `node --test scripts/settings-tests/` **21/21 PASS** (12 cũ + 9 mới), `tsc` 0 lỗi, `npm run build` OK trên **bản sao HEAD + file của tôi**; ảnh frontend-only (Edge headless + stub Tauri, 4 engine gồm 1 đang tải/2 đã tải): `%TEMP%\sublix-verify-settings\settings-stt.jpg` · `settings-stt-tools.jpg` · `settings-tts2.jpg`.
- **Cần biết:** `ModelDownloadRow` lấy % từ **event** nên ảnh tĩnh chỉ hiện trạng thái (Chưa tải/Xong) — muốn thấy thanh tiến trình phải chạy app thật (để R2-8).

---

---

### 2026-10-25 02:05 - CommandCode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-UI-REDESIGN-R2-5-7`, **chưa commit**). Fix `BUG-085` (chi tiết: `ISSUE_LOG.md`).
- **R2-5 Cài đặt:** tách ra `src/views/settings/` (`SettingsNav` nhóm BẮT ĐẦU/XỬ LÝ AI/GIAO DIỆN/KHÁC · `TranslationSection` **5 provider** Ollama/GGUF/MiniMax/DeepSeek/OpenRouter · `TtsSection` đọc `tts_engines_status` + cài deps + chẩn đoán CUDA + key Google/FPT (chỉ hiện ••••4 cuối) · `ThemeSection` · `SystemStatusPanel` đọc config thật); bỏ 4 chấm theme khỏi topbar (PLAN §4.2) + bỏ danh sách preset lặp ở cột trái.
- **`BUG-085` (quan trọng):** `src/views/settings/configMerge.ts` là **hàm thuần** — luôn gộp trên config **đọc lại từ đĩa ngay trước khi lưu**; chỉ ghi field vừa sửa + key **vừa gõ** (ô rỗng = giữ nguyên), xoá key phải bấm "Xoá key"; field lạ (kể cả field backend mới thêm) không mất. `node --test scripts/settings-tests` → **12/12 PASS**.
- **Mức độ suy luận (theo yêu cầu PO):** Segmented 5 mức (Tự động/Thấp/Vừa/Cao/Tối đa), **chỉ hiện khi provider cloud + `supports_reasoning`**; lưu qua `translate_options_set` nếu backend có, fallback `llm_reasoning_effort` trong config. Hiện backend/wrapper **chưa có** → đã dựng type hợp đồng + cast có kiểm tra + TODO (không tự viết backend).
- **R2-7:** `ProcessCenterView` bỏ thẻ "Động Cơ & Phần Cứng AI" ghi cứng "GPU CUDA/Whisper Large-v3" → thẻ **"Trạng thái thật"** (STT server/engine dịch/đang chạy + trỏ sang Cài đặt); Live/Lịch sử **chưa gọn** theo §4.5/4.6 (để sau).
- **Verify:** `tsc` 0 lỗi + `npm run build` OK trên **bản sao HEAD + file của tôi** (working tree đang đỏ do mcode #2 sửa `studioPipelineTypes.ts`/`SublixStudioView.tsx`); ảnh frontend-only (Edge headless, backend giả) `%TEMP%\sublix-verify-settings\settings-{translation,tts,theme}.jpg` + `tab-{live,history,process}.jpg`. **GUI thật để R2-8**: SAC chặn exe copy bị patch (`BUG-H09`) nên không tạo được instance riêng.
- **Việc cho người sau:** implement `translate_options_get/set` đúng hợp đồng + trả `supports_reasoning`; khi `src/lib/tauri.ts` có wrapper chính thức thì bỏ cast `translateApi`; R2-8 kiểm tra Luu/key trên app thật.

---

---
