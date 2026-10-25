## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-25 12:25 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-RELEASE-0.12.0` — nâng phiên bản 0.11.36 → **0.12.0** + changelog; **chưa commit**).
- **Version:** `package.json` + `src-tauri/Cargo.toml` + `src-tauri/tauri.conf.json` (field version + **2 tiêu đề cửa sổ**) + `src-tauri/Cargo.lock` (dòng version gói `sublix`) → **6/6 nguồn = 0.12.0**.
- **Changelog:** `CHANGELOG.md` thêm mục `## v0.12.0 — 2026-10-25` ở đầu, 5 nhóm (dịch hay & nhất quán hơn · nhận giọng nói EN/ZH + lồng tiếng Việt · Timeline · giao diện mới · sửa lỗi) + số đo thật; để trống dòng **Tinh chỉnh giao diện theo duyệt cuối** cho coordinator bổ sung sau khi duyệt UI. `src/views/ChangelogModal.tsx` thêm entry `v0.12.0` đúng cấu trúc `VersionEntry` (chuyển `isCurrent` của v0.11.36 sang false).
- **Nội dung lấy từ** `git log 62e4da8..HEAD` + `docs/STT_MODELS_2026.md` + `docs/UI_REDESIGN_PLAN.md` §7 — viết cho người dùng đọc, không tên thợ/task.
- **Verify:** `npm run verify:version` **PASS** (6/6 nguồn) · `npx tsc --noEmit` 0 lỗi · `npx vite build` exit 0 (built in 2.07s). KHÔNG `cargo build --release`.

---

### 2026-10-25 12:20 - Opus (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-DESIGN-VOICE-PICKER` — chỉ thiết kế, không sửa `src/**`, **chưa commit**).
- **File:** `docs/ui-mockups/voice-picker.html` (8 ô: đóng · mở · hover/đang phát/đang tạo mẫu · tìm+lọc · rỗng · lật lên trên · Cài đặt inline · bảng phím) + `docs/ui-mockups/shots/voice-picker-all.png` + `docs/UI_REDESIGN_PLAN.md` **§4.10** (§4.8 đã là Cài đặt nên không dùng số đó).
- **Chốt:** nhãn → tên + badge engine (`parseVoiceLabel`); ★ = config toàn cục `favorite_voices: string[]`; ▶ trong danh sách = mẫu (không đổi giọng, tạo khi bấm, tự phát khi xong); chip vai = giọng đang dùng ở vai khác; phím `↑↓ Enter Esc Ctrl+Space Ctrl+S Alt+1/2/3`.
- **Code tiếp (mcode):** `src/components/ui/VoicePicker.tsx` + `voicePickerModel.ts` thuần có test; props ở §4.10; ảo hoá tự viết khi > 100 giọng. Backend cần thêm: cache mẫu giọng + key config `favorite_voices`.

---

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
