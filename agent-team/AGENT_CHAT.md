# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.


## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-28 22:30 - Claude Code (Opus 5.5, điều phối) -> @Team / @jimmyvu
- **Loại:** `@handoff` — **TẠM DỪNG theo lệnh PO** (về nhà làm tiếp). Orca run `run_80e8fbd4887e`, điều phối = cửa sổ của Claude Code (`run-use` nếu cần lấy lại). **v0.14 xong, CHƯA push** (chờ PO OK).
- **v0.15 "Khám phá"** (`docs/V0.15_PLAN.md`, checklist trong chat): ✅ nghiên cứu · ✅ thiết kế Opus (`7bf7e5b`) · ✅ lõi `discovery/` OpenCode (`321fb8e`, Bilibili tìm tiếng Anh bị -412 ⇒ cần Referer + tự dịch Việt→Trung).
- **ĐANG DỞ (đã Esc, chưa có file):** mcode #1 `term_80d88594` — `TSK-V015-DISC-CMD` (spec ở scratchpad phiên 72fb9e23: `TSK-V015-DISC-CMD.md`); Gemini `term_a4a81e68` — `TSK-RESEARCH-RECAP-TOOLS` (mổ xẻ NarratoAI… ⇒ `docs/RECAP_TOOLS_DEEPDIVE.md`). Làm tiếp: gõ "TIẾP TỤC <mã task>" vào từng cửa sổ.
- **Đội (yolo, không tự đóng):** Gemini + Opus (tab "Gemini (agy) - nghien cuu") · OpenCode `term_df5e3bcf` + mcode #1 (cùng tab) · CommandCode `term_ae1c53dc`.

---

### 2026-10-28 21:20 - Antigravity (Gemini Flash, worker) -> @Leader / @Team / @jimmyvu
- **Loại:** @done — Hoàn thành sửa báo cáo TSK-RESEARCH-GAME-RECAP-R2 theo đúng yêu cầu PO.
- **Cập nhật:** Đã cập nhật docs/GAME_RECAP_RESEARCH.md với model đời mới: Qwen2.5-VL-7B (26/01/2025) & MiniCPM-o 2.6 (20/01/2025) cho local RTX 3090 (AWQ/INT4 ~6.5–8GB VRAM); Gemini 3.8 Flash & Flash-Lite đời hiện hành (.05–.10/1M token, ~.035–.07/giờ video) kèm ghi chú model cũ đã deprecated.
- **Bản quyền & Giấy phép:** Thay thế YOLOv8 (AGPL-3.0) bằng RT-DETR/RT-DETR-v2 (Apache 2.0); xác minh NarratoAI (MIT, commit 10/2026), VideoLingo (Apache 2.0, commit 10/2026), auto-editor (The Unlicense, v26.x 2026), TransNetV2 (MIT, ONNX SOTA). Đã thêm cột ngày phát hành và link nguồn thật.

---

### 2026-10-28 20:55 - Antigravity (Gemini Flash, worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Hoàn thành nghiên cứu `TSK-RESEARCH-VIDEO-DISCOVERY` (tìm video & hot trend).
- **Kết quả:** Đã xuất file báo cáo toàn diện `docs/VIDEO_DISCOVERY_RESEARCH.md`.
- **Thực nghiệm:** Bilibili (Popular, Ranking, Search Type) & Douyin 50 Hot Words hoạt động 100% qua HTTP GET không cần key/đăng nhập; YouTube Search `ytsearchN:` chạy tốt qua `yt-dlp`; TikTok search broken & Creative Center cần tài khoản business; Kuaishou chưa có extractor trong yt-dlp; Xiaohongshu cần chữ ký x-s/x-t phức tạp.
- **Đề xuất:** Triển khai Giai đoạn 1 (Bilibili + Douyin Hot Tags) và Giai đoạn 2 (YouTube Search) với kiến trúc Rust `reqwest` + in-memory TTL cache.

---

### 2026-10-28 20:00 - Claude Code (Opus 5.5, điều phối) -> @Team / @jimmyvu
- **Loại:** `@done` — **v0.14.0 XONG, chờ PO duyệt push.** Lỗi xuất "Đa đường tiếng" + phụ đề cứng đã sửa (`TSK-V014-EXPORT-FIX`, mcode #1, commit `c00288e`; điều phối thêm chặn `-filter_complex` rỗng).
- **Kiểm:** bản sạch 410 test node + 366 test Rust đạt; app thật xuất video thử chữ Trung 30 s ⇒ mp4 h264 + aac, giây 6 dải mờ + tem che kín chữ cũ.
- **Tài liệu đã tích:** `docs/V0.14_PLAN.md` §3 (7/7 ✅) · `PROJECT_STATE.md` (bảng khóa trống, v0.12/v0.14 sang ✅) · `TAM_NHIN_SUBLIX_STUDIO.md` GĐ4 ✅.
- **Tiếp theo:** PO OK ⇒ `git push` (16 commit). Sau đó GĐ5 (dựng cơ bản + Batch) — cần PO chốt phạm vi trước khi giao.
- **Đội (rảnh, giữ nguyên):** mcode #1 `term_05c6d215` · #3 `term_6c25f9f6` · CommandCode `term_5d122828` · OpenCode `term_47f5a03b` · Gemini `term_58eb6711` · Sonnet `term_d7391d06` · Opus `term_c1559e20`.

---

### 2026-10-26 15:10 - Claude Code (Opus 5.5, điều phối) -> @Leader-tiếp-theo / @jimmyvu
- **Loại:** `@handoff` — **Claude Code sắp hết hạn mức; leader khác tiếp quản.** Đọc `agent-team/LEADER_NOTES.md` mục 0 (+ mục 6 lời khuyên). Orca run `run_80e8fbd4887e`. **13 commit local CHƯA push** (`3a851a5`..`80e7456`); push chỉ khi PO đồng ý.
- **v0.14 (PO chốt, `docs/V0.14_PLAN.md`):** đã xong + kiểm app thật — dò phụ đề cứng (PP-OCRv4 det sidecar), 3 mẫu chữ nhảy + font Việt (Hộp cam bỏ: libass không làm được), giao diện Thuộc tính + khung dải + xem thử, bump 0.14.0. Ảnh bằng chứng: `docs/ui-mockups/shots/v014-*.png`.
- **ĐANG LÀM (việc duy nhất còn chặn release):** mcode #1 (`term_05c6d215`, task `TSK-V014-EXPORT-FIX`, dispatch `ctx_cea3fc4b4c58`) sửa lỗi xuất video "Đa đường tiếng" + phụ đề cứng ⇒ ffmpeg `Filter 'anull:default' has output 0 (final_audio) unconnected`. Sửa dở chưa commit trong `src-tauri/src/dubbing/export_video_graph.rs` + `mod.rs`; yêu cầu: chạy mọi tổ hợp chế độ âm thanh × burn × có/không câu, test ffmpeg thật. Nếu thợ đứng: gõ "TIẾP TỤC TSK-V014-EXPORT-FIX".
- **Khi mcode #1 báo xong:** đọc diff → `git add` 2 file (+test) → `agent-team/tools/verify-clean.ps1 -Rust` → `cargo build --bin sublix` (CARGO_TARGET_DIR=%TEMP%\sublix-cc-target; exe mới chạy được hôm nay) → `agent-team/tools/gui-app.ps1 start` → trong app: tab "hardsub_zh_30s.mp4" (đã dò dải) → Xuất video (mặc định Đa đường tiếng + Khắc cứng) phải ra mp4; trích 1 khung ở giây 6 xem dải mờ → `gui-app.ps1 stop` → commit (author Mavis/mcode) → `@handoff` → hỏi PO push.
- **Đội (rảnh, giữ nguyên — không tự đóng, tối đa 3–4 ô/tab):** mcode #3 `term_6c25f9f6` · CommandCode `term_5d122828` · OpenCode `term_47f5a03b` · Gemini `term_58eb6711` · Sonnet `term_d7391d06` · Opus `term_c1559e20` (handle đổi nếu Orca khởi động lại — tra theo tiêu đề bằng `orca terminal list`).

---

### 2026-10-26 14:30 - Claude Code (Opus 5.5, điều phối Orca) -> @Team / @jimmyvu
- **Loại:** `@handoff` — **TẠM DỪNG theo lệnh PO** (về nhà làm tiếp). v0.14 gần xong; 12 commit local **chưa push** (từ `3a851a5` tới `b9a791f`). Orca run `run_80e8fbd4887e`.
- **Đã xong + kiểm app thật:** dò phụ đề cứng (PP-OCRv4 det, 60 s video ~3 s), 3 mẫu chữ nhảy + font Việt (Hộp cam bỏ — libass không làm được), giao diện Thuộc tính + khung dải + xem thử chữ nhảy, bump 0.14.0.
- **CÒN 1 LỖI (đang sửa dở):** xuất video "Đa đường tiếng" + phụ đề cứng ⇒ ffmpeg `final_audio unconnected`. Giao mcode #1 (`TSK-V014-EXPORT-FIX`, dispatch `ctx_cea3fc4b4c58`) — đã ngắt bằng Esc; **sửa dở chưa commit** trong `src-tauri/src/dubbing/export_video_graph.rs` + `mod.rs`. Làm tiếp: gõ "TIẾP TỤC TSK-V014-EXPORT-FIX" vào terminal mcode #1.
- **Kiểm lại sau khi sửa:** `agent-team/tools/verify-clean.ps1 -Rust` → build `cargo build --bin sublix` (target `%TEMP%\sublix-cc-target`) → `tools/gui-app.ps1 start` → xuất thật video thử chữ Trung (tab "hardsub_zh_30s.mp4" đã có trong phiên app; file thử ở scratchpad phiên `552b7175…\fixtures\`) → ổn thì PO duyệt push.
- **Đội (handle sau khi Orca khởi động lại):** mcode #1 `term_05c6d215` · #3 `term_6c25f9f6` · CommandCode `term_5d122828` · OpenCode `term_47f5a03b` · Gemini `term_58eb6711` · Sonnet `term_d7391d06` · Opus `term_c1559e20` — đều đang rảnh.

---

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
