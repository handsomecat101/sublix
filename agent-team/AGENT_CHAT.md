# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.


## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-28 23:55 - mcode #1 (MiniMax-M3, Orca worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Xong `TSK-V015-DISC-UI`: dựng tab con "🔥 Khám phá" trong tab Tải video theo §4.13 (nấc A).
- **File mới:** `src/views/discovery/` (12 file: `DiscoveryView`, `DiscoverySearchBar`, `HotTopicChips`, `DiscoveryListTabs`, `VideoGrid`, `VideoCard`, `DiscoveryStates`, `MiniQueueBar`, `DiscoveryContextMenu`, `DiscoveryToast`, `useDiscoveryList`, `discoveryModel` + `discoveryErrors` + `discovery.css`) · sửa `DownloaderView.tsx/.css` (chỉ thêm tab con + cầu nối hàng đợi) · `scripts/discovery-tests/discoveryModel.test.ts` — **chưa commit**.
- **Dùng lại hàng đợi sẵn có** (không viết luồng tải thứ 2): `queueEntries()` + cờ `openInStudio`; trạng thái thẻ khớp theo **id video** (bvid / YouTube id) qua `videoIdOf()`.
- **Kiểm:** `npx tsc --noEmit` **0 lỗi** · `npx vite build` **OK** · `node --test scripts/discovery-tests/` **38/38 PASS** (thêm 30 test logic thuần).
- **Điểm chưa chắc (cần điều phối kiểm app thật):** (1) "🎬 Tải & mở Studio" dùng cầu `onNavigateToStudio` sẵn có ⇒ **có chuyển tab Studio**; §4.13 muốn "không tự nhảy màn hình" — cần thêm prop mới ở `SettingsView` (ngoài phạm vi sửa của task này). (2) Ảnh `hdslb.com` đã thử `referrerPolicy="no-referrer"` + ô dự phòng, **cần xem thật** trong app. (3) YouTube nấc A chỉ tìm kiếm, danh sách "Đang hot" hiện 🔒 (chưa có API key).

---

### 2026-10-28 23:15 - Antigravity (Gemini Flash, worker) -> @Leader / @Team / @jimmyvu
- **Loại:** @done — Hoàn thành nhiệm vụ TSK-LAB-RESEARCH (R1 + R2) cho Xưởng AI v0.16.
- **R1 (Render Video-as-Code):** Đã phân tích chi tiết Remotion, Revideo, Motion Canvas, HyperFrames, MoviePy tại docs/LAB_RENDER_ENGINES.md. Benchmark thẻ 5s: Native FFmpeg+ASS chỉ mất 0.73s (205 fps, 0MB bundle) so với Headless Chrome (>9s, >350MB). Kết luận: Chưa cần engine ngoài cho v0.16; nếu làm đồ họa động sau này nên chọn HyperFrames (Apache 2.0).
- **R2 (Việt hoá 3 prompt NarratoAI):** Đã tạo src-tauri/src/lab/prompts/{recap_analyze,recap_narration,recap_match}.md kèm LICENSE-NarratoAI.txt (ghi công MIT). Khớp chuẩn JSON struct RecapItem trong docs/XUONG_AI_PLAN.md §2, tích hợp luật Hook mở đầu, lọc rác/ads, tỷ lệ giữ thoại gốc và công thức 4.5 âm tiết/giây.

---

### 2026-10-28 22:45 - mcode #1 (MiniMax-M3, Orca worker) -> @Leader / @Team / @jimmyvu
- **Loại:** `@done` — Xong `TSK-V015-DISC-CMD` (nối lõi Khám phá vào app): gọi mạng + 5 lệnh Tauri + wrapper TS.
- **File mới:** `src-tauri/src/discovery/{fetch.rs,commands.rs,fetch/ytdlp.rs}` + `{fetch,commands,network}_tests.rs` · sửa `discovery/mod.rs` (+2 `pub mod`), `src-tauri/src/lib.rs` (+5 handler), `src/lib/tauri.ts` (+wrapper), `scripts/discovery-tests/` — **chưa commit**.
- **Mã lỗi có tiền tố** cho UI: `[blocked]` (HTTP 403/412/429, mã `-412`/`-352`/`-509`) · `[network]` · `[ytdlp_missing]` · `[parse]` — TS có `discoveryErrorCode()` tách tiền tố.
- **Bắt được lỗi OpenCode phát hiện:** search Bilibili **bắt buộc** `Referer: https://search.bilibili.com/` — đã xác nhận tìm "原神" ra **20 kết quả** (không Referer ⇒ `-412`).
- **Kiểm:** `cargo test --lib` **437/437 PASS** · `cargo test --lib discovery -- --ignored` **1/1 PASS** (mạng thật Bilibili popular + Douyin hot) · `cargo build` OK · `npx tsc --noEmit` 0 lỗi · `node --test scripts/discovery-tests/` **8/8**.
- **Còn lại:** `TSK-V015-DISC-UI` (tab Khám phá theo mockup) + commit/push (chờ PO).

---

### 2026-10-28 22:35 - Antigravity (Gemini Flash, worker) -> @Leader / @Team / @jimmyvu
- **Loại:** @done — Hoàn thành nghiên cứu sâu TSK-RESEARCH-RECAP-TOOLS (docs/RECAP_TOOLS_DEEPDIVE.md).
- **Nghiên cứu code thật:** NarratoAI (MIT, 25/10/2026, pipeline kịch bản 2 bước + prompt OST + công thức độ dài cảnh từ/5=s + bộ lọc quảng cáo/sponsor); VideoLingo (Apache-2.0, tách phụ đề spaCy NLP + LLM CoT kép + SequenceMatcher 0.9); auto-editor (The Unlicense, 28/10/2026, SIMD audio peak + motion gblur 1500–4000 fps); TransNetV2 (MIT, ONNX Runtime GPU 800+ fps xử lý fade-to-black game cực chuẩn vs PySceneDetect).
- **Tool thương mại & Đề xuất Sublix:** Phân tích điểm yếu (bẫy số lượng, credit burn, AI slop) của OpusClip, Vizard, Eklipse, Powder, CapCut/JianYing. Đưa ra 13 đề xuất hành động xếp theo Value/Effort gắn liền với Nấc 1 (Reel) và Nấc 2 (Recap Game Story) xuất thẳng vào Timeline Studio Sublix.

---

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

