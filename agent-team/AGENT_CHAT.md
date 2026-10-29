# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.


## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-29 02:20 - Antigravity (Gemini Flash, worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Hoàn thành `TSK-LAB-U1D`: "Mở trong Studio" nạp SẴN lời bình + sửa 3 lỗi nhỏ của U1C.
- **P1 (Nạp sẵn vào Studio):** Tạo hàm thuần `mapDubbingProjectToPersistedTab` (ánh xạ DubbingProject → PersistedTab mang sẵn segments, speakers, mediaDuration, hadAudio: true). Mở rộng `studioOpenRequest` truyền `prebuiltTab` vào `StudioTabsHost` và `SublixStudioView` (cả tab tạo mới lẫn tái dùng tab trống), kích hoạt thông báo nhắc tạo lại giọng tự nhiên `lostAudio` của Studio.
- **P2.1 & P2.2 (Sửa lỗi giả & bắt lỗi thật):** Chế độ thật: chặn rơi ngầm về mock data khi thiếu `runId` (ném lỗi rõ ràng); `openInStudio` kiểm tra `draftPath`, bắt lỗi đọc dự án thật và hiển thị toast lỗi thay vì giả vờ thành công; loại bỏ fallback đường dẫn giả `"draft-crown-1"`.
- **P2.3 (Lọc & đệm sự kiện):** Thêm hàng đợi đệm sự kiện `eventBuffer` trong `_buildDraftReal` và `_analyzeReal` tới khi nhận `activeDraftRunId`/`activeRunId`; lọc bỏ triệt để sự kiện của các runId lạ tránh nhiễm chéo.
- **Kiểm chứng:** `node --test scripts/lab-tests/` **25/25 PASS** · `scripts/studio-tabs-tests/` **84/84 PASS** · `npx tsc --noEmit` **0 lỗi** · `npx vite build` **OK** (4.25s).

---

### 2026-10-29 01:45 - Antigravity (Gemini Flash, worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Hoàn thành `TSK-LAB-U1C`: Nối bước B (Lời bình) và Bước C (Dựng nháp) của Xưởng AI vào lệnh THẬT.
- **Nối Bước B (Lời bình):** `labApi.writeNarration` nối `sublix.labWriteNarration` (targetDur, ostRatio); hàm thuần `mapLabRecapItemToUi` / `mapUiToLabRecapItem` đồng bộ dữ liệu; `RewritePopover` nối `sublix.labRewriteSegment` với các mode (shorter, dramatic, simpler, bridge); bảo lưu chỉnh sửa và công tắc `keepOriginal` truyền sang Bước C.
- **Nối Bước C (Dựng nháp):** `labApi.buildDraft` nối `sublix.labBuildDraft` với voice thật từ `sublix.dubbingGetVoices()` (không hardcode); tiến trình 3 giai đoạn qua `onLabDraftProgress` (tts, match, render, done) kèm nút Huỷ (`labCancelDraft`); hiển thị video nháp hoàn chỉnh qua `convertFileSrc`, cảnh báo và ghi chú luật; nút "Mở trong Studio" gọi `sublix.labLoadDraftProject` và mở tab Studio không tải lại STT.
- **Lọc event & Lifecycle:** Lọc `runId` cho mọi event; giữ `activeRunId` từ Bước A xuyên suốt Bước B & C và chỉ dọn dẹp khi thoát wizard. Giữ nguyên chế độ Dev Mock (`isLabMockMode()`).
- **Kiểm chứng:** `node --test scripts/lab-tests/` **23/23 PASS** · `npx tsc --noEmit` **0 lỗi** · `npx vite build` **OK** (4.24s).

---

### 2026-10-29 01:15 - Antigravity (Gemini Flash, worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Hoàn thành `TSK-LAB-U1B`: Nối giao diện Xưởng AI bước Nguồn + A (Phân tích) vào backend lệnh THẬT.
- **Nối lệnh thật:** `labApi.analyze` gọi `sublix.labAnalyze`, lắng nghe `lab:progress` / `lab:done` / `lab:error`, huỷ bằng `sublix.labCancel`, dọn bộ nhớ qua `labForgetAnalysis`; ánh xạ `LabAnalysis.junk` → `junkSegments` và xử lý mở rộng LLM bằng hàm thuần `mapLabAnalysisToResult`.
- **Bước Nguồn & LLM Guard:** Chọn file video thật qua `sublix.selectMediaFile()` (kèm probe metadata `downloaderFileMeta`), hỗ trợ nạp dự án Studio có sẵn thoại; kiểm tra `isLlmConfigured` (bắt buộc MiniMax key hoặc Ollama), chặn bắt đầu và hiển thị `MissingAIState` nếu thiếu AI; màn hình `LabErrorState` khi lỗi.
- **Dev Mock Mode:** Thêm công tắc và bộ nhớ `localStorage("sublix.lab.useMock")` (tự động bật ngoài browser dev, tắt trong Tauri app) giúp điều phối viên/Opus dễ dàng duyệt UI với mock data.
- **Kiểm chứng:** `node --test scripts/lab-tests/` **19/19 PASS** · `npx tsc --noEmit` **0 lỗi** · `npx vite build` **OK** (2.98s).

---

### 2026-10-29 01:05 - mcode #1 (MiniMax-M3, Orca worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Xong `TSK-LAB-C3`: lệnh Tauri `lab_analyze` (phân tích **thật**) + tiến trình + huỷ cho Xưởng AI.
- **Rust (mới trong `src-tauri/src/lab/`):** `analyze.rs` (pipeline) · `analyze_sources.rs` (thoại) · `analyze_summary.rs` (tóm tắt LLM) · `analysis_types.rs` + `analysis_merge.rs` (kiểu + gộp) · `llm_json.rs` (parser JSON khoan dung) · `llm_prompt.rs` (điền prompt R2) · `cache.rs` (khoá path+size+mtime) · `transcript.rs` (chia cụm) · `commands.rs` (4 lệnh) + `lib.rs` đăng ký.
- **Hành vi:** thoại = dự án Studio `segments` → cache → `.srt` cạnh video → **luồng STT sẵn có** của app (đúng engine trong Cài đặt, không viết STT mới); cảnh = `probe`+`cutscene` (C2) + hardsub v0.14 tuỳ chọn; lọc rác = `junk_filter` (C1); tóm tắt = LLM từng cụm ~10 phút, lỗi 1 cụm ⇒ thử lại 1 lần rồi ghi chương "chưa tóm tắt được" (không hỏng cả lần chạy).
- **Tiến trình:** `lab:progress` {runId, stage stt|scenes|junk|summary|done|error, sourceIdx, percent, message} · `lab:done` (kèm LabAnalysis) · `lab:error`; `lab_cancel(run_id)` huỷ; `lab_get_analysis(run_id)` lấy kết quả.
- **Kiểm:** `cargo test --lib` **561/561 PASS** (109 test lab) · `cargo build` OK · `npx tsc --noEmit` **0 lỗi** · `npx vite build` OK · `node --test scripts/discovery-tests/` **46/46**.
- **Chạy THẬT** (`#[ignore]`, fixture `hardsub_zh_30s.mp4` 30 s): **7,1 s** — 1 nguồn (30,0 s · 19,93 MB), **1 cảnh** đã chấm điểm, **1 câu thoại** (STT thật chạy được), 0 rác, LLM MiniMax-M3.1-Flash trả JSON hợp lệ.
- **Cần điều phối:** (1) **Lệch 1 tên với UI**: đặc tả yêu cầu `LabAnalysis.junk` còn UI gọi `junkSegments` ⇒ bước nối UI cần map `junk` → `junkSegments`; kiểu con khác đã khớp `MockVideoSource/MockChapter/MockCharacter/MockJunkSegment` (thêm 4 trường LLM UI chưa dùng: `motivation`, `subtitleName`, `chapterType`, `narrativeFunction`). (2) Chưa commit. (3) Chưa sửa `src/views/**` theo đúng phạm vi task.

---

### 2026-10-29 00:45 - Antigravity (Gemini Flash, worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Xong `TSK-V015-UI-FIX`: sửa tab Khám phá theo bản duyệt Opus (`docs/UI_V015_REVIEW.md`).
- **P1-1 & §1:** Khử trùng mục cũ từ phiên trước (`sanitizeLoadedDownloadItems`, `shouldTriggerOpenStudio`), không tự nhảy sang Studio khi mở app; "Tải & mở Studio" mở tab nền + toast cấp app (gộp nhiều mục, tự tắt 8s, Enter để đi tới Studio, điều khiển qua hằng số `AUTO_SWITCH_TO_STUDIO_ON_DISCOVERY_COMPLETE`).
- **P1-2 & P1-3:** Thẻ 0 không còn bị focus/viền vàng khi mount, lưới không cướp focus khỏi ô tìm; chỉ focus thẻ khi dùng phím điều hướng hoặc bấm ↓/Esc từ ô tìm.
- **P1-4 & P2:** Vạch "Hết" chỉ hiện khi hết thật (`!hasMore && !loadingMore`); nút hover theo trạng thái (đã tải: Mở Studio + 📁 thư mục, lỗi: ↻ thử lại); pill trạng thái trên ảnh; segmented ≤1280px giữ chữ nút bật; Douyin chip không rớt dòng; chip dùng đơn vị Việt thống nhất (`formatCountVi`); thanh tab con tóm tắt "Tải với: ... · Đổi"; mini queue dính đáy 38px; khôi phục danh sách cũ khi xoá tìm kiếm (`prevListRef`).
- **P3:** Tuổi cache `formatAge` ("vừa xong"), xoá dấu "—" lẻ sau nút ↻, thêm class logo nền tảng, nút `· Sửa` từ khoá dịch kèm timeout 8s, toggle switch `.sw`, gợi ý tiếng Trung ở trạng thái trống, Shift+F10 mở context menu.
- **Kiểm:** `node --test scripts/discovery-tests/` **46/46 PASS** · `npx tsc --noEmit` **0 lỗi** · `npx vite build` **OK** (2.84s).

---

### 2026-10-29 00:10 - mcode #1 (MiniMax-M3, Orca worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Xong `TSK-V015-DISC-B1`: công tắc "文 Tự dịch" (Bilibili chặn từ khoá tiếng Anh `-412`) + đơn vị lượt xem kiểu Việt.
- **Rust:** `discovery/keyword_translate.rs` (prompt tự dịch, `contains_han`, `needs_translation`, `clean_translated_keyword`) + lệnh `discovery_translate_keyword` — dùng **provider đã cấu hình** (`chat_completion_custom`, model theo provider qua `model_for`), **không** thêm provider/API key; provider không hỗ trợ prompt tùy chỉnh ⇒ fallback đường dịch chuẩn.
- **TS:** công tắc mặc định BẬT (chỉ Bilibili, nhớ localStorage), cache bản dịch trong phiên, dòng "Đã tìm: 艾尔登法环 (dịch từ "elden ring")" + nút "Tìm nguyên văn"; dịch lỗi ⇒ tìm nguyên văn + "Chưa dịch được".
- **Đơn vị:** `万`/`亿` và `K`/`M` → **một kiểu Việt** "nghìn / triệu / tỷ" cho cả Bilibili lẫn YouTube (1,8 triệu · 50 triệu · 1,2 tỷ) — sửa cả `discoveryModel.ts` lẫn `discovery/format.rs`.
- **Kiểm:** `cargo test --lib discovery` **87/87** · `cargo build` OK · `node --test scripts/discovery-tests/` **41/41** · `npx vite build` OK · **dịch thật**: `elden ring boss` → `艾尔登法环 Boss` (MiniMax-M3.1-Flash của PO).
- **Cần điều phối:** (1) `npx tsc --noEmit` đang **đỏ 5 lỗi** ở `src/views/lab/` — của worker Xưởng AI, **không phải** task này (file này không có lỗi nào). (2) Chưa commit (chờ PO). (3) Provider `local`/llama-server không có prompt tùy chỉnh ⇒ dịch dự phòng kém chính xác hơn; nên bật provider MiniMax/Ollama cho tính năng này.

---

### 2026-10-29 00:05 - Antigravity (Gemini Flash, worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Hoàn thành `TSK-LAB-U1A`: dựng toàn bộ giao diện tab Xưởng AI theo thiết kế Opus (§4.14).
- **Thành phần:** 19 component tại `src/views/lab/**` (thư viện mẫu, trình hướng dẫn 4 bước: nguồn, phân tích AI 5 giai đoạn, biên tập lời bình, xem trước bản dựng); tích hợp mock API `labApi.ts` có thanh tiến trình và huỷ `AbortSignal`.
- **Topbar & Trải nghiệm:** Thêm tab "Xưởng AI" kèm nhãn nổi bật "Thử nghiệm" sau "Tải video" trên `MasterTopbar` (cả SettingsView & SublixStudioView); hỗ trợ phím tắt số 1-4, `Ctrl+Enter` sửa nhanh câu.
- **Kiểm chứng:** `node --test scripts/lab-tests/` **14/14 PASS** (bắt đúng 6 luật R1-R6 kịch bản recap, đếm âm tiết tiếng Việt) · `npx tsc --noEmit` **0 lỗi** · `npx vite build` **OK** (2.98s, 0 lỗi).

---

### 2026-10-28 23:55 - mcode #1 (MiniMax-M3, Orca worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Xong `TSK-V015-DISC-UI`: dựng tab con "🔥 Khám phá" trong tab Tải video theo §4.13 (nấc A).
- **File mới:** `src/views/discovery/` (12 file: `DiscoveryView`, `DiscoverySearchBar`, `HotTopicChips`, `DiscoveryListTabs`, `VideoGrid`, `VideoCard`, `DiscoveryStates`, `MiniQueueBar`, `DiscoveryContextMenu`, `DiscoveryToast`, `useDiscoveryList`, `discoveryModel` + `discoveryErrors` + `discovery.css`) · sửa `DownloaderView.tsx/.css` (chỉ thêm tab con + cầu nối hàng đợi) · `scripts/discovery-tests/discoveryModel.test.ts` — **chưa commit**.
- **Dùng lại hàng đợi sẵn có** (không viết luồng tải thứ 2): `queueEntries()` + cờ `openInStudio`; trạng thái thẻ khớp theo **id video** (bvid / YouTube id) qua `videoIdOf()`.
- **Kiểm:** `npx tsc --noEmit` **0 lỗi** · `npx vite build` **OK** · `node --test scripts/discovery-tests/` **38/38 PASS** (thêm 30 test logic thuần).
- **Điểm chưa chắc (cần điều phối kiểm app thật):** (1) "🎬 Tải & mở Studio" dùng cầu `onNavigateToStudio` sẵn có ⇒ **có chuyển tab Studio**; §4.13 muốn "không tự nhảy màn hình" — cần thêm prop mới ở `SettingsView` (ngoài phạm vi sửa của task này). (2) Ảnh `hdslb.com` đã thử `referrerPolicy="no-referrer"` + ô dự phòng, **cần xem thật** trong app. (3) YouTube nấc A chỉ tìm kiếm, danh sách "Đang hot" hiện 🔒 (chưa có API key).

---



---



---
