## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-25 07:05 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-FEAT-VOICE-PICKER` — ô chọn giọng theo thiết kế Opus §4.10; **chưa commit**).
- **Mới:** `src/components/voice/VoicePicker.tsx` + `VoicePickerRow.tsx` + `voicePickerModel.ts` (logic thuần) + `voicePicker.css`; `scripts/voice-picker-tests/` (**18 test**). Tìm không dấu, lọc ♂/♀, nhóm ★ → engine → ngôn ngữ, tìm trong tên+engine+ngôn ngữ, gợi ý "Bỏ lọc ♂ Nam (N kết quả)", chip vai trùng giọng, bàn phím ↑↓/↵/Ctrl+Space/Ctrl+S/Alt+1-3/Esc, popover portal + lật lên khi sát đáy, ảo hoá khi > 100 giọng.
- **Nối:** Studio `StudioVoiceStep.tsx` thay `<select>` bằng `<VoicePicker variant="popover">`; Cài đặt › Giọng đọc thêm `VoiceListSection.tsx` (variant inline) — ★ lưu qua `getConfig` → `mergeConfig` → `saveConfig` (không mất API key); `config.rs` +1 field `favorite_voices`.
- **⚠️ CẦN NỐI (tôi KHÔNG sửa `SublixStudioView.tsx` — mcode #4 đang sửa):** trong `pipelineApiRef` thêm `toggleFavoriteVoice(voiceId)` (đọc config từ đĩa → gộp `favorite_voices` → save → set state), `previewVoiceSample(voiceId)` (tạo mẫu 1 lần rồi phát → set `previewVoiceId` + `previewVoiceStatus`), `stopVoicePreview()`; và truyền 3 field mới (`favoriteVoices`, `previewVoiceId`, `previewVoiceStatus`) vào `state` của panel. Tôi đã khai báo chúng là **optional** trong `studioPipelineTypes.ts` nên chưa nối cũng không lỗi tsc.
- **Verify:** `cargo check --lib` OK · `npx tsc --noEmit` 0 lỗi · `npx vite build` OK · `node --test` **250 test / 0 fail** (18 mới + 232 cũ) · ảnh thật: popover + danh sách inline trong app (Cài đặt › Giọng đọc, **92 giọng thật** từ backend).

---

### 2026-10-25 12:50 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-FIX-SPEAKER-ROLES` — phân vai **thật** theo giọng + giới tính nghe từ F0; **chưa commit**).
- **Đã làm:** sidecar mới `src-tauri/scripts/speaker_gender.py` (đo **F0 trung vị mỗi cụm** bằng tự tương quan, chỉ cần numpy) + module mới `dubbing/speaker_assign.rs` (ngưỡng **165/180 Hz**, **gộp cụm gần nhất theo F0 thay cho `% n`**) + `dubbing/mod.rs` sửa 3 vùng phân vai: giọng TTS mặc định theo giới tính **thật** (đánh dấu `(~)` khi mơ hồ), MiniMax **chỉ đặt tên + dịch** (giữ `speaker_id` theo giọng), cờ `diarization_engine="heuristic"` khi thiếu model.
- **Đo thật** (`src-tauri/scripts/speaker_measure.py` — tái lập được; fixture 8 câu 4 nam + 4 nữ, Kokoro offline, F0 hạ về vùng người thật): **phân vai 88 % → 100 %** (sherpa ra 3–4 cụm, modulo gộp nhầm nam↔nữ) · **giới tính 50 % → 100 %** (mặc định cũ N=2 ⇒ tất cả nam).
- **Verify:** `cargo test --lib` **275 pass / 0 fail** (8 test mới) · `cargo build --examples` OK · `cargo clippy --lib` không có cảnh báo mới trong file của tôi.
- **⚠️ Cần biết:** model sherpa **đã có sẵn trong danh mục tải voice model** (`sherpa-diarization`, ~34 MB, CPU) nên không cần thêm UI; **không** đụng vùng voice sample (mcode #4 đang sửa) và **không** sửa `src/**`.

---

### 2026-10-25 12:43 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-FEAT-VOICE-SAMPLE-CACHE` — cache mẫu nghe thử cho **mọi** engine; **chưa commit**).
- **Mới:** `src-tauri/src/dubbing/voice_samples.rs` + `voice_samples/{store.rs,prepare.rs}` + `voice_samples_tests.rs` (mỗi file < 300 dòng). Cache theo `(engine, voice_id)`: ghi **atomic** (`.part` → rename), **khoá theo giọng**, xoá file hỏng (<2KB / header WAV sai / ffprobe lỗi). `dubbing/mod.rs` **chỉ +1 dòng** `pub mod voice_samples;` + 3 hàm cũ delegate; **không** đụng vùng diarization.
- **Lệnh mới:** `voice_sample_status(engine) -> {ready,total}` · `voice_sample_ensure(voice_id,text)` (lazy: cache hit → tức thì, chưa có → tổng hợp 1 lần rồi lưu) · `voice_samples_prepare(engine?)` (nền, tuần tự, ưu tiên thấp, huỷ được, phát `voice:sample_progress`) · `voice_samples_prepare_cancel()`. Tự chạy nền 1 lần khi app rảnh, **không** chạy khi đang lồng tiếng/dịch (`file_sub::is_running()`). Cloud chỉ cache sau khi người dùng đã nghe 1 lần (không tự gọi API tốn tiền).
- **Đo thật trên máy này:** **Kokoro** (diem_trinh) lan1=7.89s → lan2=76ms · **VieNeu** (Adam bựa) lan1=16.32s → lan2=81ms ⇒ lần sau phát tức thì, không còn gọi TTS mỗi lần bấm ▶.
- **Verify:** `cargo test --lib` **267 PASS / 0 fail** (bản sao HEAD + file của tôi) + test riêng `voice_samples` **17/17** · `npx tsc --noEmit` **0 lỗi** · `npm run build` **OK** (117 module). Lưu ý: WDAC chặn build script mới (`os error 4551`, BUG-084) → đổi nội dung `build.rs` cho hash mới rồi chạy lại.

---

### 2026-10-25 12:25 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-RELEASE-0.12.0` — nâng phiên bản 0.11.36 → **0.12.0** + changelog; **chưa commit**).
- **Version:** `package.json` + `src-tauri/Cargo.toml` + `src-tauri/tauri.conf.json` (field version + **2 tiêu đề cửa sổ**) + `src-tauri/Cargo.lock` (dòng version gói `sublix`) → **6/6 nguồn = 0.12.0**.
- **Changelog:** `CHANGELOG.md` thêm mục `## v0.12.0 — 2026-10-25` ở đầu, 5 nhóm (dịch hay & nhất quán hơn · nhận giọng nói EN/ZH + lồng tiếng Việt · Timeline · giao diện mới · sửa lỗi) + số đo thật; để trống dòng **Tinh chỉnh giao diện theo duyệt cuối** cho coordinator bổ sung sau khi duyệt UI. `src/views/ChangelogModal.tsx` thêm entry `v0.12.0` đúng cấu trúc `VersionEntry` (chuyển `isCurrent` của v0.11.36 sang false).
- **Nội dung lấy từ** `git log 62e4da8..HEAD` + `docs/STT_MODELS_2026.md` + `docs/UI_REDESIGN_PLAN.md` §7 — viết cho người dùng đọc, không tên thợ/task.
- **Verify:** `npm run verify:version` **PASS** (6/6 nguồn) · `npx tsc --noEmit` 0 lỗi · `npx vite build` exit 0 (built in 2.07s). KHÔNG `cargo build --release`.

---

---

### 2026-10-25 12:20 - Opus (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-DESIGN-VOICE-PICKER` — chỉ thiết kế, không sửa `src/**`, **chưa commit**).
- **File:** `docs/ui-mockups/voice-picker.html` (8 ô: đóng · mở · hover/đang phát/đang tạo mẫu · tìm+lọc · rỗng · lật lên trên · Cài đặt inline · bảng phím) + `docs/ui-mockups/shots/voice-picker-all.png` + `docs/UI_REDESIGN_PLAN.md` **§4.10** (§4.8 đã là Cài đặt nên không dùng số đó).
- **Chốt:** nhãn → tên + badge engine (`parseVoiceLabel`); ★ = config toàn cục `favorite_voices: string[]`; ▶ trong danh sách = mẫu (không đổi giọng, tạo khi bấm, tự phát khi xong); chip vai = giọng đang dùng ở vai khác; phím `↑↓ Enter Esc Ctrl+Space Ctrl+S Alt+1/2/3`.
- **Code tiếp (mcode):** `src/components/ui/VoicePicker.tsx` + `voicePickerModel.ts` thuần có test; props ở §4.10; ảo hoá tự viết khi > 100 giọng. Backend cần thêm: cache mẫu giọng + key config `favorite_voices`.

---

---

### 2026-10-25 11:45 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-FIX-BUG-H23` — `glossary_suggest` chịu được JSON "dạng cũ" từ LLM; **chưa commit**).
- **Sửa:** module mới `src-tauri/src/translate/glossary_parse.rs` — `thuat_ngu`/`terms` nhận **object HOẶC chuỗi** (`→` `=>` `->` `=` `:`), `xung_ho`/`pronouns` nhận object hoặc chuỗi `"Kaldares: gọi là anh, tự xưng tôi"`; phần tử hỏng ⇒ **bỏ qua + `tracing::warn!`**; **một phần hỏng không làm hỏng phần khác**; chịu được code fence + chữ thừa; chỉ `Err` khi JSON hỏng hẳn hoặc không lấy được gì.
- **Nối:** `contextual.rs::parse_reference` (đúng 1 hàm) gọi parser mới ⇒ cả `glossary_suggest` lẫn lượt 1 của đường dịch đều hưởng lợi. File trong `glossary*.rs` đều < 300 dòng (`glossary.rs` 285, `glossary_parse.rs` 222).
- **Verify:** `cargo test --lib` **242 pass / 0 fail** (10 test mới trong `glossary_parse_tests.rs`) · `cargo build --example bench_translate` OK · **test thật với Ollama `qwen2.5:3b`**: lần model trả định dạng cũ ⇒ *parse cứng* **FAIL**, *parse khoan dung* **OK** (cứu được 3 quy tắc xưng hô + 2 nhân vật + tóm tắt).
- **ISSUE_LOG:** `BUG-H23` → ✅ Fixed (kèm phần chi tiết ở cuối file).

---

---

### 2026-10-25 11:30 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-STUDIO-GLOSSARY` — gắn bảng thuật ngữ + xưng hô vào bước "Dịch" của Studio; **chưa commit**).
- **Đã làm:** nút **"📖 Thuật ngữ & xưng hô (N)"** ở bước Dịch → drawer bọc `GlossaryEditor` (nạp `glossary_get(projectPath)`, lưu `glossary_set` **debounce 400ms** — không cần bấm Lưu); **"⚡ Gợi ý từ kịch bản"** = 1 lượt đọc hiểu (có tiến trình + ước tính thời gian) và **không tự ghi** (✓ mới nhận); câu vi phạm → **tô vàng** (thẻ phụ đề + khối timeline) + badge/tooltip lý do + menu chuột phải **"🔁 Dịch lại câu này"**; `translate_script_contextual` nay truyền `projectPath` ⇒ backend áp **bảng dự án** làm ràng buộc cứng.
- **File:** `src/views/SublixStudioView.tsx` · `src/views/studio/{StudioGlossaryDrawer,StudioPipelinePanel,StudioTranslateOptions,studioPipelineTypes}` + `StudioPipelinePanel.css` · `src/lib/timeline/glossary.ts` (mới) · `src/lib/tauri.ts` (wrapper + `projectPath`) · `scripts/timeline-tests/glossary.test.ts`.
- **Verify:** `node --test scripts/timeline-tests/` **121/121 PASS** · `npx tsc --noEmit` **0 lỗi** · `npm run build` **OK** · GUI instance riêng (release build, CDP 9227, identifier riêng + APPDATA riêng) **19/19 PASS**; E2E với Ollama thật: **dịch lại câu ra "mẫu tử tối"** theo bảng dự án (không còn "Dark Templar") + gợi ý LLM hiện dạng ✓/✕.
- **⚠️ Cần biết:** (1) `GlossaryEditor` (file của worker khác, **không sửa**) có `normalizeGlossary` **xoá dòng trống** ⇒ nút "+ Thêm thuật ngữ" bị nuốt dòng; tôi workaround trong drawer (bắt click phase `capture` rồi chèn lại 1 dòng nháp) — **nên sửa gốc ở `src/components/glossary/glossaryModel.ts`**. (2) Lỗi **backend** (ngoài phạm vi tôi): `glossary_suggest` fail khi LLM trả thuật ngữ dạng **chuỗi cũ** (`"gốc => dịch"`) thay vì object ⇒ mất cả phần xưng hô đã parse được — `ISSUE_LOG.md` `BUG-H21`/`BUG-H22`/`BUG-H23`.

---
---

---

### 2026-10-25 08:10 - mcode #3 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-DUBBING-STT-ENGINE` — pipeline lồng tiếng dùng engine STT đã chọn; **không commit**).
- **Sửa:** module mới `src-tauri/src/dubbing/stt_select.rs` — `dubbing_analyze` đọc config `stt_asr_engine` (backend tự đọc → **không đổi tham số lệnh Tauri, không sửa `src/**`**); engine sherpa + model đã tải → nhận dạng bằng engine đó (SenseVoice/Paraformer/Parakeet), **chưa tải / lỗi → rơi về Whisper** kèm log `tracing` + event `dubbing:progress` để UI toast.
- **Tán thổng:** engine không có timestamp từ (Paraformer) → dùng **timestamp câu**; kết quá đểnh dạng `SubtitleSegment` cũ nên để **bước phân vai (diarization) dùng đúc định dạng cũ**; `start_offset_sec` / `expected_speakers` giữ nguyên; ngôn ngợ nguồn chỉ truyền cho engine khi được hỗ trụ (SenseVoice zh/en/ja/ko/yue, Paraformer zh, còn lại để để auto).
- **Test:** `stt_select_tests.rs` 9 test thuần (chọn engine, engine lạ, ngôn ngợ, SRT định dạng) + test e2e `dubbing_stt_sherpa_that` chạy chạy trên clip Trung (PASS khi có model, SKIP khi chưa có); `proc_kill.rs` **441 → 253 dòng** (tách test ra `proc_kill_tests.rs` 193) · `cargo test --lib` **231 pass / 0 fail** · `cargo build --examples` OK (cã 4 example dubbing) · `cargo clippy` không thêm cảnh báo mới.

---
---

---
