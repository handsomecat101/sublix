# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.


## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-24 23:05 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-STUDIO-MODEL-PICKER` — chọn model dịch + mức suy luận ngay trong Studio; **chưa commit**).
- **Đã làm:** `src/views/studio/StudioTranslateOptions.tsx` (React.memo) + `src/views/studio/translateOptions.ts` — gọi `invoke("translate_options_get"/"translate_options_set")` **trực tiếp** bằng type khai báo cục bộ vì `src/lib/tauri.ts` đang do mcode #2 sửa (không đụng file đó).
- **UI bước Dịch:** dropdown **Model dịch** nhóm *Local (chạy trên máy)* / *Cloud (cần mạng)*; model cloud chưa có API key → **mục xám** + nút "Cần API key — Cài đặt"; segmented **Suy luận** (Tự động/Thấp/Vừa/Cao/Tối đa) chỉ hiện khi `supports_reasoning`, kèm tooltip "Mức cao = dịch kỹ hơn, chậm + tốn token hơn"; vẫn giữ link **Cài đặt nâng cao**.
- **Hành vi:** đổi lựa chọn → ghi **ngay** qua `translate_options_set` (không nút Lưu); nghe `config:updated` để đồng bộ với Cài đặt; backend chưa có lệnh → hiện **trạng thái dự phòng chỉ đọc**, không crash.
- **Verify:** `tsc` 0 lỗi · `build` OK · `node --test` 79/79 PASS · GUI instance riêng (CDP 9225) **5/5 PASS**: fallback chỉ đọc, dropdown 2 nhóm + 4 mục cloud xám, segmented 5 mức, **config file còn nguyên field API key** (đọc file, không in key), kéo khối timeline không hồi quy.
- **⚠️ Ghi chú PO:** lúc bàn giao, **app của PO (9223) + Vite 1420 đã không còn chạy** — phiên dev của PO tự dừng (tôi chỉ tắt PID verify của mình: 52152 + webview2 con với profile riêng `sublix-verify-picker`). PO cần chạy lại `npm run tauri dev`.
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

### 2026-10-24 21:55 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-UI-REDESIGN-R2A` — vòng 2 code UI R2-1..R2-4; **chưa commit**).
- **R2-1:** token `--step-sub/--step-tr/--step-dub` trong `src/App.css` + 3 component dùng chung `src/components/ui/{Segmented,SplitButton,ContextMenu}.tsx` (mỗi file < 120 dòng, `React.memo`).
- **R2-2:** `src/views/MasterTopbar.tsx/.css` — **1 component thay 2 bản copy** (Studio + `SettingsView.tsx`); chuột phải nút ↶ = menu 3 lớp hoàn tác (Audio / Bản dịch / Phụ đề) thay 3 chip cũ; bỏ "Nhập video" trùng + nút Tiến Trình modal; overlay còn 1 icon 👁.
- **R2-3:** panel trái → `src/views/studio/StudioPipelinePanel.tsx` + `StudioVoiceStep.tsx` — rail 5 bước, accordion 1-mở, **1 nút chạy split** `▶ Chạy N bước đã bật | ▾`, chuột phải vai 7 mục (giọng gốc · gộp · về 1/2 vai · xoá), **engine + giọng đọc đọc từ backend** (`tts_engines_status` + `dubbing_get_voices`), **đã gỡ `TTS_ENGINE_MODELS` hard-code và map `vietneu:`→`kokoro:`** (backend tự fallback ở `tts_vieneu::route_voice`).
- **R2-4:** provider dịch chỉ đọc "Ollama · qwen2.5:3b — **Đổi**" → mở Cài đặt; **xoá hẳn** 3 select model + 3 ô API key khỏi Studio.
- **Verify:** `tsc` 0 lỗi · `build` OK · `node --test` 79/79 · GUI instance riêng (CDP 9225 / Vite 1423) **8/9 PASS** (hồi quy kéo khối + kéo handle In/Out vẫn chạy; check trạng thái engine chưa chạy được vì `target/debug/sublix.exe` — bản app PO — **chưa có** lệnh `tts_engines_status`, cần build lại exe).
- **⚠️ Cần PO xử lý:** lúc dọn instance verify tôi đã tắt nhầm 1 tiến trình `sublix.exe` (PID 34400) do lệnh dọn "mọi app trừ PID cũ 47852" — app của PO có thể đã được mở lại với PID mới nên bị dính. Hiện app PO + Vite 1420 đều **không còn chạy**; cần PO khởi động lại `npm run tauri dev`.

---

### 2026-10-25 00:10 - CommandCode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-UI-REDESIGN-R2-6`, **chưa commit** — chỉ JSX/CSS tab Tải video, **logic giữ nguyên 100%**).
- **Giao diện mới (PLAN §4.4):** 1 cột max 1480px; ô nhập lớn + nút **Tải N link** ngay cạnh (Enter = tải, Shift+Enter xuống dòng); chip **Chất lượng / Phụ đề / ⚙ Nâng cao** (popover chứa cookies + 3 cờ reup + cắt đoạn); picker playlist dạng dải ngang; danh sách dạng **HÀNG** (thumbnail 112×63, pill nền tảng/chất lượng/phụ đề, thanh tiến độ + tốc độ + còn lại, 1 nút chính theo trạng thái) + lọc Tất cả/Đang tải/Đang đợi/Xong/Lỗi + ô lọc tên; menu **⋯/chuột phải dùng `ContextMenu` dùng chung** (6 mục: Mở Studio · Player ngoài · Hiện thư mục · Tải lại phụ đề · Sao chép link · Xoá); footer 1 dòng (thư mục + nền tảng hỗ trợ + bản quyền).
- **Giữ nguyên:** `handleStartDownload`/`handleInspect`/`handleFetchSubs`, hàng đợi 3 song song, BUG-053 dedupe, listener sự kiện, BUG-045 (luôn mount), reup/batch/MP3. Thêm debounce 600 ms tự đọc link khi dán (tái dùng `handleInspect`).
- **Verify:** `tsc` 0 lỗi + `npm run build` OK **trên bản sao HEAD + 6 file của tôi** (vì `SublixStudioView.tsx` worker R2A đang sửa dở — đã escalation); GUI instance riêng (exe patch 1420→1424, Vite 1424, CDP 9226 — đã tắt + gỡ junction/bản sao): picker **184/184 mục**, tải thật → **✓ Xong · 465 KB**, menu ⋯ **6/6 mục**, "Mở trong Studio" mở đúng video, reup `.info.txt` BOM 5 dòng đúng, Kuaishou → lỗi sớm. Ảnh: `%TEMP%\sublix-verify-dl\dl-{tab-after,row-active,menu-active,adv-active,kuaishou-active}.png`.
- **Cần biết khi verify CDP:** DownloaderView **luôn mount** (BUG-045) → phải bấm tab "Tải video" TRƯỚC khi chụp; nếu không, ảnh sẽ là tab khác dù DOM vẫn thao tác được (bài học từ chính phiên này).

---

### 2026-10-24 23:35 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-BENCH-MINIMAX-FLASH` — **đo thật + sửa code trong `translate/` + UI; KHÔNG commit, KHÔNG push**).
- **Báo cáo:** `docs/BENCH_TRANSLATE_2026-10.md` · harness: `src-tauri/examples/bench_translate.rs` (chạy đúng `translate::translate_batch_with_config` với `AppConfig::load_or_default()` = config thật của app) · dữ liệu: 60 câu tiếng Anh StarCraft từ `gui-2026-10-20/dump-78-cues.json` (%TEMP%\sublix-bench-translate\).
- **Tên model đã xác minh:** `MiniMax-M3.1-Flash` (docs chính thức MiniMax, đọc 2026-10-24; coordinator xác minh `GET /v1/models = 200`).
- **Tốc độ (60 câu, ×2):** (a) Ollama qwen2.5:3b local **24,56 s** (lô đầu 7,98 s) · (b) MiniMax-M3 **timeout lô 15 câu** → fallback từng câu (170–200 s ở chunk 5) · (c) M3.1-Flash **effort=max 215,07 s** → **sau bản vá `reasoning_effort=low` còn 26,33 s** (lô đầu **5,30 s**, nhanh hơn local 1,5×), 0 lỗi, 0 lọt `<think>`. (d) DeepSeek **không có key** → 60/60 lỗi, ghi rõ.
- **Chất lượng (giám khảo MiniMax-M3, 1–5):** local Ollama **4,27** · M3 **4,77** · **M3.1-Flash (bản vá) 4,72 ≥ local** ✅ (giám khảo Ollama 3B: 4,91 / 4,81 / 4,91 — dễ tính, chỉ đối chiếu).
- **Đã thêm (PHẦN 2):** nút `⚡ MiniMax M3.1 Flash` cạnh nút MiniMax-M3 ở `SettingsView.tsx` (**chỉ thêm**, không đổi model mặc định) + `translate/server.rs` xử lý đúng M3.1-Flash (`reasoning_effort=low`, timeout 120 s/60 s; M3 giữ nguyên). **Bắt buộc**: dùng M3.1-Flash mà không có bản vá thì chậm hơn local 8,8×.
- **Cần coordinator/PO quyết:** (1) `npm run build`/`tsc` **đang đỏ vì `SublixStudioView.tsx` của Sonnet** (24 lỗi, file tôi sửa = 0 lỗi); (2) có nên sửa timeout của `MiniMax-M3` không (lô 15 câu hiện timeout 60 s — tôi **không** sửa theo đúng phạm vi); (3) DeepSeek cần key để đo.

---
### 2026-10-24 22:30 - Claude Sonnet 5.5 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` + `@handoff` (`TSK-FEAT-TTS-3ENGINES` — **chỉ backend + command + wrapper**, UI để vòng thiết kế lại; chưa commit). Lỗi: `BUG-082..084`.
- **Engine thật (offline):** `vietneu:` = **VieNeu v3 Turbo** (25 giọng, clone `vietneu:clone=<wav>`), `zerotts:` = **ZeroTTS** (8 giọng), cloud `gcloud:` (Chirp3 HD 30 giọng) + `fptai:` (7 giọng, key lưu `sublix-tts-keys.json`, không qua `config:updated`). Mã: `dubbing/{tts_common,tts_vieneu,tts_zerotts,tts_cloud,tts_status,vi_normalize}.rs` + `scripts/{vieneu,zerotts}_tts.py`; `voice_models.rs` thêm 4 mục catalog (tải verify đủ byte, tự `pip install` deps sau khi tải). Project cũ `vietneu:*`: model chưa tải → vẫn fallback Kokoro.
- **Đo thật (CPU Ryzen AI Max 390, whisper turbo):** VieNeu batch WER **0%** (RTF 0,98 gồm nạp model; model 637 MB); ZeroTTS **0%** (RTF 1,88 batch 3 câu gồm nạp; model 909 MB; lần đo riêng 1,7%); **Kokoro s3: WER 30% → 10%** nhờ `vi_normalize` (≥ 24 test). MP4 5 câu lồng bằng `vietneu:vi_bac_nam`: 2 track audio (ffprobe), mean −21,6 dB. `cargo test --lib` **113/113**, `tsc` 0, `npm run build` OK (CARGO_TARGET_DIR `%TEMP%\sublix-cc-target`).
- **CUDA (RTX 3090):** CHƯA test được (máy dev không NVIDIA). `tts_engine_install_deps` tự gỡ `onnxruntime` và cài `onnxruntime-gpu` + `nvidia-cudnn/cublas/cuda-runtime/cufft/curand/nvrtc-cu12` khi `nvidia-smi` có; sidecar tự dùng `CUDAExecutionProvider` (ép CPU bằng `stt_engine_preference=cpu`). Kiểm tra: command `tts_engine_diagnose("vieneu")` → `cuda:true`, log `DEVICE cuda`. Nếu lỗi DLL: cần CUDA 12.x + cuDNN 9 trong PATH.
- **Việc cho vòng UI:** gắn `tauri.ts` (`ttsEnginesStatus/ttsCloudSetKey/ttsCloudTest/ttsEngineInstallDeps/ttsEngineDiagnose`) vào Cài đặt/Studio; Studio vẫn hard-code `TTS_ENGINE_MODELS` + `mapVoiceForEngine` (map `vietneu:`→`kokoro:` ở frontend) — **phải sửa** thì VieNeu thật mới được gọi từ Studio. Component UI mẫu đã viết nhưng bỏ ra ngoài repo (scratchpad `TtsEnginesPanel.tsx.txt`). Preview 1 câu VieNeu/ZeroTTS ~8–9 s (nạp model mỗi lần); export dùng batch nên nhanh.

### 2026-10-24 21:30 - Claude Opus 5.5 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-UI-REDESIGN-P1` vòng 1 — **chỉ khảo sát + thiết kế + mockup, KHÔNG sửa code app**, chưa commit).
- **Báo cáo:** `docs/UI_REDESIGN_PLAN.md` — kiểm kê từng control (file:dòng) panel trái Studio + Tải video + tóm tắt 4 tab, **18 nhóm trùng lặp đã xác minh** (vd: Quét & Phân vai `:6277`/`:6827`, Lồng tiếng `:6641`/`:6846`, provider dịch 2 nơi 2 danh sách khác nhau).
- **Số đo thật:** panel trái Studio **45 control**, nội dung **1687 px nhưng chỉ thấy 405 px** ở 1080p → thiết kế mới **20 control**, quy trình 5 bước, 1 nút chạy dạng split, vừa 1 màn.
- **Mockup:** `docs/ui-mockups/{studio,tai-video,cai-dat}.html` + ảnh trước/sau/so sánh trong `docs/ui-mockups/shots/` (instance riêng CDP 9225, đã tắt; app PO 9223 không bị đụng).
- **Vòng 2:** 8 bước (~7 ngày), chỉ bắt đầu khi mcode xong `SublixStudioView.*` và CommandCode xong `DownloaderView.*`; giữ nguyên timeline/kéo thả/In-Out/logic downloader.

---

---
