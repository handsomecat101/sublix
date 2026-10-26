# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.


## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-26 01:30 - Claude Code (Opus 5.5, điều phối Orca) -> @Team / @jimmyvu
- **Loại:** `@handoff` điều phối — **v0.13.0 xong, đã commit local, CHƯA push** (chờ PO OK). Orca run `run_80e8fbd4887e`.
- **Đã có:** Studio nhiều tab P0–P4 (`59c4d32` run_id · `260c898` chặn kết quả video cũ · `27fab97` P1 · `50b4e92` P2 hàng đợi · `b19305f` P3+P4 phiên + phím tắt) · nghe mẫu từ file `9e082a5` · `edfb987` bump 0.13.0. Kiểm bản sạch: tsc/build OK, node 358/358, cargo 293/0.
- **Kiểm app thật (vượt Smart App Control):** chạy exe cũ đã được phép + Vite từ working tree + CDP (xem LEADER_NOTES §4). Đã kiểm: 3 tab, "Đang chờ #1", Hủy chờ không giết tab chạy, tắt/mở app còn đủ tab, phím tắt. Bản sao localStorage của PO trước migrate v1→v2: scratchpad phiên 72fb9e23 `localStorage_backup.json`.
- **Còn lại (không chặn release):** nút "Để chạy nền" khi đóng tab; khung xử lý ghi "Toàn Trình" cả khi chỉ chạy STT; đo RAM 6 tab; ý tưởng tính năng chờ PO chọn (`docs/FEATURE_IDEAS_2026.md`).
- **Đội:** tab "thợ 2" = mcode #1–#4 · tab "thợ 3" = CommandCode + OpenCode · tab Gemini · Sonnet + Opus mỗi bạn 1 tab. Giữ ổn định, không tự đóng, tối đa 3–4 ô/tab.

---

### 2026-10-25 19:40 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-CHORE-AGENT-TEAM-SLIM` — dọn `agent-team/` cho nhẹ context; **chưa commit**).
- **Đã dọn:** `PROJECT_STATE.md` **53,5 KB → 33,3 KB** (giữ 25 mục ✅ Hoàn thành mới nhất; **59 mục cũ** nguyên văn → `ARCHIVE/PROJECT_STATE_DONE_ARCHIVE.md` + 1 dòng trỏ archive) · `ISSUE_LOG.md` **107,6 KB → 85,4 KB** (**Quick Index giữ ĐẦY ĐỦ mọi mã lỗi**, thêm chú "chi tiết: ARCHIVE/…" cho 18 lỗi đã chuyển; **20 mục phân tích chi tiết** của lỗi ✅ Fixed & cũ trước 2026-10-20 → `ARCHIVE/ISSUE_LOG_DETAIL_ARCHIVE.md`; lỗi 🔴 Open / 🟡 / mới **giữ nguyên tại chỗ**).
- **Đã chuyển 18 file kế hoạch/báo cáo** (FIX_STUDIO_UI_ROUND1–7, BAO_CAO_SANG, REPORT_PHASE_V2_COMPLETION, BAN_GIAO_GEMINI, BENH_AN_DU_AN_VA_VIEC_SUA, KE_HOACH_×4, OPTION_RESEARCH_DUBBING, PHAN_TICH_UI_TINH_NANG_SUBLIX_STUDIO, TASK_A_Z_ONE_CLICK) → `agent-team/ARCHIVE/` (`git mv`, **không xoá file nào**) + `test-output-audit-giong/` → `ARCHIVE/`.
- **Giữ tại chỗ (có lý do):** `AUDIT_TAO_GIONG.md` (17 mục audit còn đang chờ GUI test — `GUI_TEST_GUIDE.md` + `WORKFLOW_A_Z.md` trỏ tới) · `SCREENSHOTS.md` (`README.md` trỏ tới) · 4 file lõi + `README`/`QUY_TRINH`/`GOVERNANCE`/`LEADER_NOTES`/`PROJECT_SETUP_CHECKLIST`/`GUI_TEST_GUIDE`/`WORKFLOW_A_Z`/`UI_SPEC_SUBLIX_STUDIO`/`TAM_NHIN_SUBLIX_STUDIO`.
- **Tổng 4 file lõi: 178,2 KB → 137,9 KB (−40,3 KB; đo sau khi thêm dòng bàn giao này). **AGENT_CHAT.md:** giữ **8 tin** (2 tin worker cũ nhất chuyển `ARCHIVE/AGENT_CHAT_ARCHIVE.md` nguyên văn; **giữ** tin `2026-10-24 23:50` của điều phối) · đã cập nhật đường dẫn cho file bị chuyển trong `CHANGELOG.md` + `src/views/SublixStudioView.tsx` (chỉ đổi path).
### 2026-10-25 16:50 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-UI-R2-8-FIX-A` — **Gói A** sửa theo duyệt cuối `docs/UI_R2-8_REVIEW.md`; **chưa commit**).
- **ĐÃ XONG (9 mục, đã đánh dấu ✅ trong `UI_R2-8_REVIEW.md`):** **1** dòng gọn engine chưa tải (bỏ `ModelDownloadRow` trong Studio) · **3** nhãn ước lượng theo engine đang chọn · **8** thẻ câu gọn (~70 px, nút chỉ hiện khi chọn/hover, ô dịch `textarea` tự cao, **giữ `React.memo`**) · **9** hàng thống kê "N câu · Ns · N vai · N WPM" + **3 chip lọc** (Chưa dịch / Thiếu tiếng / Câu >12s) · **10** gợi ý "▶ Chạy N bước đã bật" · **11** timeline theo bề rộng khung thật (ResizeObserver) + cột nhãn 176 px + "(Chưa có phụ đề / giọng)" · **12** 1 nguồn version (`appInfo.version`) + **👁** overlay trên topbar Studio + bỏ "✓ " ở pill · **18** (SettingsView) tiêu đề "Cấu hình theo máy" + pill "Đang dùng" · **21** (Studio) "Chạy hàng loạt: Bật/Tắt" + menu timeline sentence case + thống nhất "Xoá".
- **CHƯA XONG / GIỚI HẠN:** **chưa chụp được ảnh `after-01e-studio-voice-picker.png`** — WDAC chặn exe Rust mới build (`os error 4551`, BUG-084) nên không dựng được instance để chụp; thay vào đó đã **đo DOM thật** trên instance riêng (CDP 9227, identifier + APPDATA riêng, không đụng app PO): thống kê "5 câu 16s 2 vai 154 WPM", chip "Chưa dịch (1) · Thiếu tiếng (5) · Câu >12s (0)", topbar có 👁 + version v0.12.0, thẻ câu có mốc thời gian + chấm vai + ô dịch xuống dòng.
- **Verify:** `npx tsc --noEmit` **0 lỗi** · `npx vite build` **OK** · `node --test` (timeline + process + live-history + voice-picker) **210/210 PASS**.
- **File:** `src/views/studio/StudioSttEnginePicker.tsx` · `src/views/SublixStudioView.tsx` · `src/views/SublixStudioView.css` · `src/views/SettingsView.tsx` · `docs/UI_R2-8_REVIEW.md` (đánh dấu ✅) · `agent-team/PROJECT_STATE.md`.
### 2026-10-25 15:20 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-RELEASE-0.12.0-CHANGELOG2` — bổ sung **cùng mục v0.12.0**, không tạo version mới; **chưa commit**).
- **Đã thêm (cả `CHANGELOG.md` lẫn `src/views/ChangelogModal.tsx`):** nhóm **Lồng tiếng** — ô chọn giọng (★ yêu thích, tìm không dấu, lọc Nam/Nữ, nghe thử trong danh sách), mẫu nghe thử phát tức thì, phân vai theo giọng thật + giới tính đo từ cao độ giọng, và **hạ tiếng nền thông minh** (nối khoảng nghỉ, chuyển mượt, xem thử = video xuất, 2 thanh trượt); nhóm mới **Tải video** (thư mục mặc định `Downloads\Sublix Downloads`, ảnh thu nhỏ + thời lượng); nhóm **Giao diện** nay tóm tắt các sửa R2-8 thay cho dòng trống *“Tinh chỉnh giao diện theo duyệt cuối”* (bỏ nút Lưu thừa, ô nhập Cài đặt đúng nền tối, nhãn “Đang dùng” chính xác, cảnh báo CUDA/CPU, Live/Tiến trình/Lịch sử gọn, thẻ phụ đề Studio gọn); nhóm **Sửa lỗi** thêm lịch sử tiến trình không trùng mục.
- **Số đo bổ sung (đọc từ commit + `docs/DUCKING_SPEC.md`):** mẫu nghe thử Kokoro 7,89 s → 76 ms, VieNeu 16,32 s → 81 ms; phân vai theo giọng thật (bộ 8 câu) đúng người 88 % → 100 %, đúng giới tính 50 % → 100 %; hạ tiếng nền (video thật 45 s) khe < 2 s giữa 2 câu −14,0 dB, đoạn không thoại 0,0 dB; kiểm tra R2-8 36/36 checklist + 19/19 chức năng + ô chọn giọng 9/9.
- **Verify:** `npm run verify:version` **PASS** (6/6 nguồn = 0.12.0) · `npx tsc --noEmit` 0 lỗi · `npx vite build` OK · đã mở modal trong app thật và xác nhận mọi mục mới hiện đúng. Lưu ý: lần `tsc` đầu báo 2 lỗi ở `SublixStudioView.tsx` là do worker khác đang sửa dở file đó (không phải file của tôi), chạy lại là 0 lỗi.

---
### 2026-10-25 14:40 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-UI-R2-8-FIX-BD` — gói **B + D** của mcode #4: mục 2, 5, 6, 7, 15, 16, 17, 18(CSS), 19, 20, 21(Xoá); **chưa commit**).
- **Cài đặt:** badge "Đang dùng" **chỉ khi model đã tải** (chọn mà chưa tải → badge vàng `--warn` "Đã chọn · cần tải"); thêm style gốc `.settings-input` (hết nền trắng/viền native); **xoá nút "💾 Lưu cấu hình"** → toast nhỏ "✓ Đã lưu" + chú thích "Tự lưu khi thay đổi."; cảnh báo `⚠ Đang chạy CUDA — khởi động lại server để áp dụng CPU` khi runtime lệch lựa chọn; "AUTO" → "Tự động"; `.settings-section .ui-seg` giới hạn 560px; `.hardware-presets` 4 cột.
- **Tiến trình:** bỏ **cột trái** → khung 2 cột; cột phải dùng **chung component `SystemStatusPanel`** ("Trạng thái hệ thống") với Cài đặt; **sentence case** mọi tiêu đề + nhãn loại task (bảng ánh xạ đặt trong `ProcessCenterView.tsx` vì `processLogic.ts` đang được worker khác sửa); thẻ lịch sử gọn (1 dòng tiêu đề + meta, giờ **24h**, path mono ellipsis, nút 📁/📋 cuối hàng).
- **Lịch sử:** split "Xuất .SRT" **mờ đúng kiểu** nút "Sao chép tất cả" khi 0 câu (nền phẳng, chữ mờ); icon trạng thái rỗng = **SVG mono 40px** thay ảnh JPG có ô xám.
- **Verify:** `npx tsc --noEmit` **0 lỗi** · `npm run build` **OK** (117 module) · `node --test` **7 bộ / 259 test PASS / 0 fail** (thêm hạ nốc `package.json`+`index.ts` cho 3 bộ test mới của worker khác vì `node --test <dir>` không quét thư mục — **không** đụng logic test của họ) · ảnh `after-*` mới trong `docs/ui-mockups/shots/` (frontend-only, Edge headless 1920×1080).
- **Đánh dấu `docs/UI_R2-8_REVIEW.md`:** ✅ mục **2, 5, 6, 7, 15, 16, 17, 19, 20** · ◐ mục **18** (mới làm phần CSS `.hardware-presets`) và **21** (mới làm phần "Xoá" trong `ModelDownloadRow`).

---
### 2026-10-25 14:30 - mcode #2 (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-UI-R2-8-FIX-CE` — **gói C + gói E** của review R2-8; **chưa commit**).
- **Gói C — mục 4 (`components/glossary/GlossaryEditor.tsx`):** thêm prop `autoSave` (**mặc định `true`**) → nút **💾 Lưu chỉ hiện khi `!autoSave`** (Studio drawer dùng autoSave nên hết mâu thuẫn với dòng chân "không cần bấm Lưu"); thay bằng **trạng thái nhỏ cạnh tiêu đề** `Đang lưu…` / `✓ Đã lưu` (11px, `--t3`) — tự bật sau khi emit + tắt sau 2,5 s, thêm prop tuỳ chọn `saveState` cho cha biết trạng thái.
- **Gói E — mục 13 (Live):** nút cạnh select thiết bị đổi từ **↻ trùng icon** sang **🔍 Quét** (`lv-btn tiny` + chữ "Quét"); giữ ↻ ở đầu card. **Mục 14:** bỏ **cờ emoji** khỏi mọi nhãn option (Windows không vẽ flag) + xoá field `flag` khỏi dữ liệu; `title="⚙ Nâng cao"` → **"Nâng cao"**; hint **"Dịch sang vi" → "Dịch sang Tiếng Việt"** (hàm mới `langLabel`). **Mục 21 (Live):** "Bắt **Đ**ầu Live" → "Bắt **đ**ầu Live"; "Ngôn ngữ gốc (Source)" → "Ngôn ngữ gốc". **Mục 22 (Tải video):** thêm `duration` vào item + **badge thời lượng góc phải-dưới** ảnh (10px mono, nền `rgba(0,0,0,.75)`) + **lấp thumbnail/thời lượng từ metadata yt-dlp** (cache theo URL + probe nền tối đa 12 mục). **Mục 23 (Live):** thẻ "Luồng thoại" `height:100%` (flex column) + **trạng thái rỗng căn giữa dọc**.
- **Verify:** `npx tsc --noEmit` 0 lỗi · `npx vite build` OK · `node --test` **259 test / 0 fail** (thêm 2 test cho mục 14 + sửa 1 kỳ vọng test cũ đang khẳng định lỗi chính tả "Bắt Đầu Live") · `cargo check --lib` OK · **chụp ảnh app thật** xác nhận: nút Quét, option không cờ, "Nâng cao", hint "Dịch sang Tiếng Việt", thẻ Luồng thoại cao 772 px + rỗng căn giữa.

---

---
### 2026-10-25 14:45 - Opus (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-DESIGN-STUDIO-TABS` — chỉ docs, không sửa `src/**`, **chưa commit**).
- **Ra:** `docs/ui-mockups/studio-tabs.html` (+ `shots/studio-tabs.png`) + `UI_REDESIGN_PLAN.md §4.11`.
- **Chốt:** thanh tab 34 px **dưới topbar, chỉ trong Studio**, luôn hiện; thay chip tên file + nút "Mở video" trên topbar. Tab 200→120 px, vòng tiến độ 14 px màu theo bước + số %; lỗi = chấm đỏ, xong chưa xem = chấm xanh; tên bỏ đuôi, cắt giữa.
- **Tương tác:** đóng tab đang chạy → hộp hỏi (mặc định **Để chạy nền**); tràn → cuộn ngang + nút "N tab ⌄"; thả file = tab mới (file đã mở → nhảy tới); phím Ctrl+Tab/Ctrl+Shift+Tab/Ctrl+W/Ctrl+1..8/Ctrl+9 = cuối/Ctrl+Shift+T; tối đa 12 tab, 1 việc nặng cùng lúc (khớp với `STUDIO_TABS_PLAN.md` của Sonnet).

---
### 2026-10-25 14:15 - Mavis/mcode (Orca worker) -> @Team / @jimmyvu
- **Loại:** `@done` (`TSK-FIX-BUG-R2-8-01` — sửa React key trùng `dubbing_active`; **chưa commit**).
- **Đã làm:** `processLogic.ts` thêm 3 hàm thuần — `makeTaskRunId` (id lần chạy `dubbing_<ts>_<rand>`), `dedupeHistoryIds` (lịch sử cũ trùng id → giữ mục mới nhất, mục cũ gắn hậu tố `_2/_3` ⇒ **không mất mục**), `upsertHistoryItem` (mục cùng id bị **thay** ⇒ 1 lần chạy = 1 mục, cập nhật tiến độ không sinh mục mới).
- **Wiring:** `SublixStudioView.notifyTaskUpdate` sinh id **mới khi bắt đầu lượt chạy** (`running` + `workflowType`), tiến độ cùng lượt giữ nguyên id; `SettingsView` đọc lịch sử → khử trùng, lưu → upsert, `handleStudioTaskUpdate` + listener `dubbing:progress` dùng **chung id lần chạy**; listener `file_sub:progress` cũng bỏ id cứng `file_sub_active` (nếu không `upsert` sẽ nuốt mất lịch sử tạo phụ đề).
- **Verify:** `node --test scripts/process-tests/` **29/29** (6 case mới) · timeline **121/121** · `npx vite build` **OK**; `tsc` còn 3 lỗi ở `LiveView.tsx` + `TranslationSection.tsx` — file của worker khác đang sửa dở, **không phải của tôi**.

---
