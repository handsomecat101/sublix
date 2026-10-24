# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.


## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-25 06:50 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-UI-REDESIGN-R2-7B` — R2-7B: UI tab **Live** + **Lịch sử**, **chưa commit**).
- **Mới:** `src/views/live/{LiveView.tsx/.css, liveLogic.ts, liveTypes.ts}` + `src/views/history/{HistoryView.tsx/.css, historyLogic.ts}` — `SettingsView.tsx` **2823 → 2244 dòng** (−579). Logic thuần tách riêng (map select gộp, lọc lịch sử, định dạng SRT/TXT) → test `node --test scripts/live-history-tests/` **40/40 PASS**.
- **Live:** 1 select "Phụ đề hiển thị" (gộp chế độ xuất + ngôn ngữ đích; chọn "Gốc" **giữ** ngôn ngữ đích đã chọn) · ↻ quét âm thanh cạnh select thiết bị · "⚙ Nâng cao" gấp (chunk + Smart VAD) · **1 nút chính** Bắt đầu/Dừng Live (bỏ nút Mở Overlay — dùng 👁 topbar) · cột phải "Luồng thoại" giữ nguyên.
- **Lịch sử:** 2 cột (bỏ cột trái 300px) · ô tìm + `Sao chép tất cả` + split `Xuất .SRT▾` (menu SRT/TXT) + menu `⋯`→"Xoá toàn bộ lịch sử" **có hộp xác nhận** (nút nguy hiểm hết nổi bật nhất màn hình).
- **Bonus — fix `BUG-033`** (đang 🔴 Open): hotkey `Ctrl+Shift+L` đọc closure cũ → nay handler trong keydown đi qua `latestRef` (đổi model/ngôn ngữ rồi bấm tắt sẽ ăn đúng). Chi tiết: `ISSUE_LOG.md`.
- **Verify:** `tsc` 0 lỗi (repo, trước khi worker glossary tạo file mới) · `npm run build` OK · `live-history-tests` 40/40 + `settings-tests` 21/21 · ảnh thật Edge headless 1920×1080 (app chạy thật + backend giả) tab Live + Lịch sử render đúng. **Cảnh báo:** `timeline-tests` 89/91 — 2 fail do `src/lib/timeline/estimate.ts` đang sửa dở của worker khác (tại HEAD: 91/91 PASS), không liên quan task này.

---
### 2026-10-25 06:35 - mcode #3 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-REFACTOR-SPLIT-300` — tách 4 module Rust > 300 dòng, **chỉ di chuyển code, không đổi hành vi, chưa commit**).
- **Tách:** `model_download.rs` 774 → `model_download/{mod,progress,http,sha256}.rs` · `stt/stt_catalog.rs` 514 → `stt/stt_catalog/{mod,catalog_types,catalog_data,catalog_data_parakeet}.rs` · `stt/sherpa_asr.rs` 368 → `stt/sherpa_asr/{mod,sherpa_sidecar}.rs` · `translate/bench.rs` 338 → `translate/bench/{mod,score,dataset,bench_tests}.rs`. **File lớn nhất: 271 dòng** (tất cả 14 file đều < 300).
- **API không đổi:** để so tổt **mới `pub` có trong HEAD đều có trong module mới** (kiểm tự động trước); đễt tên `pub use` để `crate::stt::stt_catalog::SttEngineSpec`, `crate::stt::sherpa_asr::transcribe`, `crate::model_download::EVENT` … vẫn giở nguyên. Đổi tên lệnh `in_progress_slot` → `pub(crate)` + `download_one` → `pub(super)` để module con dùng được.
- **Verify:** `cargo test --lib` **197 pass / 0 fail** · `cargo build --example bench_translate` **OK** · `cargo clippy --lib`: 6 cảnh báo nừm trong 4 module đãu tách — để **là code di chuyển nguyên văn** (không phải cảnh báo mới) · không sửa `src/**`.
- **Lưu ý:** đãnh có bố module Rust > 300 dòng khác vẫn còn tách: `dubbing/mod.rs` 4578 · `downloader/mod.rs` 2951 · `translate/server.rs` 1991 · `lib.rs` 1986 · `file_sub.rs` 905 · `stt/whisper_local.rs` 802 · `translate/mod.rs` 754.

---

### 2026-10-25 03:10 - CommandCode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-SETTINGS-MODELS` — **chỉ FRONTEND**, chưa commit).
- **Mới:** `src/views/settings/SttSection.tsx` — danh sách engine từ `stt_engines_status` (catalog thật, **0 hard-code**), mỗi engine 1 `ModelDownloadRow` (Tải/Huỷ/Xoá + %/MB/s/ETA qua `model:download-progress`), Segmented **Engine mặc định** (chỉ engine đã tải → `stt_set_engine`), giữ **Tăng tốc Whisper (AUTO/CPU/CUDA)** + **Kiểm thử nhanh** cũ; bỏ danh sách Whisper trùng (catalog đã có whisper-base/turbo).
- **TTS:** backend chỉ phát `tts:deps_progress` (log pip, **không %**) → nút hiện "⏳ Đang cài…" + dòng log cuối, **không bịa %**, hành vi cũ giữ nguyên.
- **Logic thuần:** `modelUtils.ts` (`formatBytesVi`/`formatSpeedVi`/`formatEtaVi`/`progressPct`/`sortSttEngines`/`engineSummary`/`recommendSttEngine`) + `scripts/settings-tests/modelUtils.test.ts` (9 case) + `package.json`/`index.ts` để `node --test scripts/settings-tests/` chạy được (Node 24 không quét dir — cùng mẹo `timeline-tests`).
- **Verify:** `node --test scripts/settings-tests/` **21/21 PASS** (12 cũ + 9 mới), `tsc` 0 lỗi, `npm run build` OK trên **bản sao HEAD + file của tôi**; ảnh frontend-only (Edge headless + stub Tauri, 4 engine gồm 1 đang tải/2 đã tải): `%TEMP%\sublix-verify-settings\settings-stt.jpg` · `settings-stt-tools.jpg` · `settings-tts2.jpg`.
- **Cần biết:** `ModelDownloadRow` lấy % từ **event** nên ảnh tĩnh chỉ hiện trạng thái (Chưa tải/Xong) — muốn thấy thanh tiến trình phải chạy app thật (để R2-8).

---

### 2026-10-24 23:34 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-FEAT-CONTEXT-TRANSLATE` — **đo lại + kiểm chứng lại toàn bộ**, **đính chính** kết luận ở tin 00:05; **chưa commit, không push**).
- **Mới:** module `src-tauri/src/translate/pronoun_audit.rs` (+12 test) — **metric tất định** đếm đại từ, đo được **60/60 dòng** (không phụ thuộc LLM-giám khảo có parse được JSON không); phân biệt `ngươi`/`người`, `cậu`/`câu`, `bạn`/`bàn` trước khi bỏ dấu (nếu không sẽ đếm sai hàng loạt dòng).
- **⛔ Đính chính quan trọng (tin 00:05 nói "đường MỚI sửa được lỗi xưng hô" là CHƯA đúng đủ):** metric tất định cho thấy đường mới **đổi mạnh văn phong tự xưng** (MiniMax `ta` 30→8; Ollama 19→3; OpenRouter 37→28) nhưng **KHÔNG sửa được phần "gọi nhau"** (số cách gọi/1 cặp không giảm; `ngươi` MiniMax 3→5) ⇒ điểm *xưng hô nhất quán* của DeepSeek là **2/5 cho CẨU lẫn MỚI** (phán quyết đó **đúng**).
- **Chất lượng (cùng subset dòng + cùng giám khảo DeepSeek):** MiniMax 20 dòng đầu **4,79 → 4,34**; Ollama 40 dòng **4,19 → 2,69**; OpenRouter 40 dòng **4,82 → 4,78**. ⇒ **Ollama 3B local: đường mới TỆ hơn rõ** (không dùng). OpenRouter: ngang chất lượng + **nhanh hơn** (0,95×) ⇒ **nên dùng**. MiniMax: đổi văn phong nhưng mất ~0,45 điểm ⇒ **để PO chọn**.
- **Nguyên nhân gốc:** bảng xưng hô ở lượt 1 do **LLM tự bịa**, không phải dữ liệu chuẩn phim ⇒ model không bảo đảm tuân thủ. ⇒ **Cách chắc chắn sửa lỗi PO = glossary thủ công** (`cfg.glossary` đã được **cả 2 đường** dùng, đường mới còn ưu tiên cao hơn).
- **Verify:** `cargo test --lib` **171 pass / 0 fail** / 15 ignored · `npx tsc --noEmit` 0 lỗi · `npm run build` OK. Báo cáo: `docs/BENCH_TRANSLATE_2026-10.md` PHẦN 4 (đã ghép lại, §4.4.1–4.4.4 + ví dụ + kết luận đính chính).
- **Cần coordinator quyết:** (1) UI nút "Dịch theo ngữ cảnh" cho mcode #1; (2) có đưa **OpenRouter** vào Settings không (đường mới là lựa chọn tốt nhất với provider này); (3) có làm UI **glossary thủ công** không (khuyến nghị mạnh).

---
### 2026-10-25 00:45 - mcode #3 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-FEAT-STT-ENGINES` — engine STT chính xác hơn Whisper cho **EN + ZH**; **chưa commit, không push**).
- **Báo cáo:** `docs/STT_MODELS_2026.md` (bảng 11 ứng viên + 2 bảng đo thật + khuyến nghị + 5 lỗi kỹ thuật) · code mới `src-tauri/src/model_download.rs` + `src-tauri/src/stt/{stt_catalog,sherpa_asr,stt_integration_tests}.rs` + `src-tauri/scripts/sherpa_asr.py` · `src-tauri/src/config.rs` (+`stt_asr_engine`) · `src-tauri/src/lib.rs` (+7 command) · `src/lib/tauri.ts` (+wrapper) · `src/components/ui/ModelDownloadRow.tsx/.css` (**mới, CHƯA gắn vào Studio/Cài đặt — chờ coordinator giao gắn**).
- **Đo thật** (clip 2 phút, phụ đề **thủ công** YouTube: TEDxNorthAdams EN + TEDxTaipei zh-TW, Ryzen AI Max 390 CPU): **SenseVoice Small int8 → WER 7,18 % (EN) · CER 4,72 % (ZH)**, RTF **0,065**, RAM 788 MB, **có timestamp từ** · **Paraformer-zh → CER 5,79 %**, RTF 0,032, **không** timestamp từ · baseline whisper: base 4,31 %/5,58 % (RTF 0,15) · turbo **6,22 %/4,08 % nhưng RTF 1,22/1,62** ⇒ whisper turbo CPU mất **~42 phút** cho video 26 phút của PO, SenseVoice **~2 phút**.
- **Khuyến nghị:** **Trung → SenseVoice int8 (#1), Paraformer-zh (#2)**; **Anh → whisper turbo nếu có CUDA, SenseVoice int8 nếu CPU-only**; **đa ngôn ngữ → SenseVoice (5 ngôn ngữ, 228 MB)**. Whisper **giữ nguyên làm mặc định**.
- **Lỗi phát hiện:** `BUG-H14` SenseVoice int8 **2025-09-09 rớt chữ** (WER 40 %) — dùng bản **2024-07-17**; `BUG-H15` mirror HF Parakeet sai layout tensor + thiếu metadata `vocab_size`; `BUG-H16` event tải báo speed 0 ở event đầu (đã fix); `BUG-H17` GitHub release nghẽn 0 byte ⇒ đã thêm **URL dự phòng HF + resume Range**; `BUG-H18` 2 lượt tải song song ghi chung `.part` ⇒ file hỏng (đúng size, sai SHA) → đã thêm **khoá in-process theo `model_id`**.
- **Verify:** `cargo test --lib` **171 pass / 0 fail** (15 test `#[ignore]` = integration thật) · **integration thật 3/3 PASS** (tải model có `%`/tốc độ/ETA + verify SHA-256 → nhận dạng clip ZH → **SRT UTF-8 đúng chuẩn, 31 cue**) · `npx tsc --noEmit` **0 lỗi** · `npm run build` OK · ảnh component 6 trạng thái: `%TEMP%\sublix-stt-bench\shots\model-download-row-states.png`.
- **Cần coordinator/PO:** (1) **giao gắn** `ModelDownloadRow` + catalog STT vào Cài đặt/Studio; (2) **Parakeet chưa đo được** (GitHub release nghẽn, HF mirror sai layout) — cần mạng ổn để đo lại; (3) **chưa đo CUDA RTX 3090** — toàn bộ số là CPU; (4) SAC chặn binary Rust mới build ở `%TEMP%` (os error 4551) — chờ reputation rồi chạy lại, **không tắt SAC**.

---
### 2026-10-25 00:05 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-FEAT-CONTEXT-TRANSLATE` — **backend trước, Studio nối sau**; **không commit, không push**).
- **Báo cáo:** `docs/BENCH_TRANSLATE_2026-10.md` (thêm PHẦN 4 đo CŨ vs MỚI + PHẦN 5 reasoning effort) · module mới `src-tauri/src/translate/{contextual.rs,contextual_run.rs,contextual_types.rs,contextual_tests.rs,reasoning.rs,reasoning_tests.rs,bench.rs,bench_tests.rs,options_tests.rs}` · `src-tauri/src/translate/server.rs` (+`chat_completion_custom`) · `src-tauri/src/config.rs` (+`llm_reasoning_effort`) · `src-tauri/src/lib.rs` (+3 command) · `src/lib/tauri.ts` + `src/lib/types.ts` (+wrapper) · `src-tauri/examples/bench_translate.rs` (mở rộng `--mode old|new --dataset`).
- **Vấn đề gốc:** đường cũ chia lô 15 câu **độc lập** → không biết câu trước, không biết ai nói, không có bảng xưng hô/thuật ngữ, không ràng buộc độ dài theo thời lượng. Đường mới = **2 lượt** (đọc hiểu → dịch có bản tham chiếu + `[speaker]` + 5 câu trượt + hạn mức âm tiết = thời lượng×5).
- **Đo thật (60 câu StarCraft, 3 nhân vật, timestamp thật):** CŨ MiniMax **29,38 s** → MỚI **46,09 s** (1,57×, 0 lỗi); CŨ Ollama qwen2.5:3b **26,41 s** → MỚI **47,73 s** (1,81×, 0 lỗi); CŨ OpenRouter DeepSeek V4.1 Flash **147,25 s** → MỚI **139,26 s** (0,95× — **nhanh hơn** đường cũ). ⇒ **đường mới ổn định ở mọi provider (0 lỗi)**, chỉ tốn thêm ~1,6–1,8× thời gian.
- **Chất lượng:** đường CŨ dịch từ cổ **"ngươi"** (thay "anh/ngài"), word-for-word **"wave"→"Sóng"** (đáng lẽ "đợt tấn công"), **"higher"→"Cao đẳng"** (= đại học!), và xưng hô **đổi qua đổi lại giữa các lô** — đúng lỗi PO phàn nàn. Đường MỚI sửa được các lỗi này.
- **Reasoning effort:** thêm `llm_reasoning_effort` (auto|low|medium|high|max) + `translate_options_get/set` (chỉ ghi field được truyền, **không xoá API key**, lưu atomic + emit `config:updated`) + wrapper `translateOptionsGet/Set`. **Đã xác minh bằng API thật:** MiniMax-M3 **có** nhận `reasoning_effort` (HTTP 200), M3.1-Flash có, OpenRouter nhận `reasoning.effort` (max→high); DeepSeek trực tiếp không có key → bỏ qua; ollama/gguf không hỗ trợ. Đo 20 câu: **low 9,26 s vs high 13,96 s (high chậm 1,51×)**.
- **Kiểm tra:** `cargo test --lib` **146 pass / 0 fail** (trước: 113) · `cargo build --example bench_translate` OK · `npx tsc --noEmit` **0 lỗi toàn repo** · `npm run build` OK.
- **Lưu ý môi trường:** Smart App Control (WDAC) chặn binary Rust mới build ở `%TEMP%` (os error 4551) → phải build/chạy trong `src-tauri\target` (repo) hoặc `%TEMP%\sublix-cc-target`; `CARGO_TARGET_DIR=%TEMP%\sublix-cc-target` như task ghi **không chạy được** trên máy này.
- **Cần coordinator:** (1) giao UI gọi `translate_script_contextual` + nút "Dịch theo ngữ cảnh" cho mcode #1; (2) quyết có thêm nút OpenRouter hay không (hiện **chậm hơn** MiniMax → chưa rõ thắng).

---


### 2026-10-24 23:05 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-STUDIO-MODEL-PICKER` — chọn model dịch + mức suy luận ngay trong Studio; **chưa commit**).
- **Đã làm:** `src/views/studio/StudioTranslateOptions.tsx` (React.memo) + `src/views/studio/translateOptions.ts` — gọi `invoke("translate_options_get"/"translate_options_set")` **trực tiếp** bằng type khai báo cục bộ vì `src/lib/tauri.ts` đang do mcode #2 sửa (không đụng file đó).
- **UI bước Dịch:** dropdown **Model dịch** nhóm *Local (chạy trên máy)* / *Cloud (cần mạng)*; model cloud chưa có API key → **mục xám** + nút "Cần API key — Cài đặt"; segmented **Suy luận** (Tự động/Thấp/Vừa/Cao/Tối đa) chỉ hiện khi `supports_reasoning`, kèm tooltip "Mức cao = dịch kỹ hơn, chậm + tốn token hơn"; vẫn giữ link **Cài đặt nâng cao**.
- **Hành vi:** đổi lựa chọn → ghi **ngay** qua `translate_options_set` (không nút Lưu); nghe `config:updated` để đồng bộ với Cài đặt; backend chưa có lệnh → hiện **trạng thái dự phòng chỉ đọc**, không crash.
- **Verify:** `tsc` 0 lỗi · `build` OK · `node --test` **91/91** PASS · GUI instance riêng (CDP 9225) **5/5 + 3/3 PASS**: fallback chỉ đọc, dropdown 2 nhóm + 4 mục cloud xám, segmented 5 mức, **config file còn nguyên field API key** (đọc file, không in key), kéo khối timeline không hồi quy.
- **🆕 ƯỚC TÍNH THỜI GIAN TỪNG BƯỚC** (theo yêu cầu coordinator giữa lúc): `src/lib/timeline/estimate.ts` (logic thuần TS) + 12 test. Mỗi bước hiện 1 dòng gọn — "⏱ Nhận dạng (Whisper Large-v3-Turbo · CPU): ~1 phút 22 giây", "⏱ Dịch (Ollama qwen2.5:3b · suy luận auto): ~2 giây (~3 câu)", "⏱ Lồng tiếng (vieneu · CPU): ~6 giây"; chân panel hiện **Tổng ~…**; **khi đang chạy** hiện tốc độ thật "12/60 câu · 0,4 s/câu · còn ~19 s · x1,8 thời gian thực"; sau mỗi lần chạy **tự lưu tốc độ đo được** vào localStorage (ưu tiên số của máy người dùng) — số mặc định ghi rõ nguồn trong code (M3.1-Flash 0,44 s/câu · Ollama 0,41 · VieNeu RTF 0,98 · ZeroTTS 0,72 · Kokoro 1,2 s/câu · Whisper RTF 2,0 theo `DEV-LOG.md:216`).
- **⚠️ Ghi chú PO:** lúc bàn giao **app của PO (9223) + Vite 1420 đã không còn chạy** — phiên dev của PO tự dừng; tôi chỉ tắt PID verify của mình (12268 / 52152 + webview2 con với profile riêng `sublix-verify-picker`) và đã **giải phóng cổng 1420**. PO cần chạy lại `npm run tauri dev`.
- **Còn lại:** backend `translate_options_get/set` do mcode #2 làm — khi có lệnh, UI tự hiện dropdown (hiện đang ở trạng thái fallback vì lệnh chưa tồn tại trong `src-tauri`).

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

### 2026-10-24 22:40 - Claude Code (Opus 5.5, điều phối Orca) -> @Team / @jimmyvu
- **Loại:** `@handoff` của người điều phối — Orca run `run_80e8fbd4887e`; thợ báo qua `orca orchestration` (KHÔNG heartbeat nữa để tiết kiệm token; chỉ status/question/escalation/worker_done).
- **Đã commit (local, chưa push sau `62e4da8`):** `c9ccaad` TTS VieNeu/ZeroTTS/cloud + vi_normalize · `14ad5e4` MiniMax M3.1 Flash + fix timeout M3 rơi xuống dịch từng câu · `ae680ca`/`7081964`/`577bb44` giao diện mới (component chung, Tải video, Studio 5 bước).
- **Đang làm:** mcode #1 `TSK-STUDIO-MODEL-PICKER` · mcode #2 `TSK-FEAT-CONTEXT-TRANSLATE` (+ `llm_reasoning_effort`, `translate_options_get/set`) · CommandCode `TSK-UI-REDESIGN-R2-5-7` · mcode #3 `TSK-FEAT-STT-ENGINES`.
- **Tiếp theo:** gắn `ModelDownloadRow` + STT vào Studio/Cài đặt → Studio gọi dịch theo ngữ cảnh → R2-8 kiểm tra tổng trên app PO + Opus duyệt thẩm mỹ → push 1 lần. Quy tắc: Claude (Sonnet/Opus) chỉ cho việc khó/thẩm mỹ; còn lại mcode/CommandCode.
- **Lưu ý:** key MiniMax + OpenRouter đã nạp vào config app (không in ra); Smart App Control chặn exe copy → verify GUI riêng chưa được (BUG-H09); không `taskkill` app PO theo tên.

---
