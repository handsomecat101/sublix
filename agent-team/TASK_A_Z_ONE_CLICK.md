# TASK_A_Z_ONE_CLICK.md — Phiếu Việc Cho Mavis (MiniMax-M3): Dây Chuyền "Dán Link → Video Lồng Tiếng"

> **Chỉ đạo của PO (Anh Tuấn, 2026-10-06):** *"Cái chính là nó tự chia câu ra rồi lồng tiếng cả video down về từ A đến Z. Cứ làm được cái đó đã, còn chất lượng giọng thì cải thiện sau."*
> **Phân công:** CommandCode viết kế hoạch + thẩm định; **Mavis (thợ code) viết code + tự test** (code chục tiếng cũng được). Làm đúng `QUY_TRINH.md` + **LUẬT CHẠY THẬT** (`GOVERNANCE.md` mục 0).

## 🎯 MỤC TIÊU (một câu)
**Dán 1 link video → bấm 1 nút → ra video lồng tiếng hoàn chỉnh** (tự tải → tự tách câu → tự dịch → tự đọc từng câu → tự ghép), thành phẩm nằm trong **Thư Mục Thành Phẩm** (cùng chỗ với video tải về, có nút mở sẵn trong tab Lồng Tiếng).

## 🧩 MẢNH ĐÃ CÓ SẴN (đều CHẠY THẬT — tái sử dụng, không viết lại)
1. **Tab Tải Video** (v0.9.x): tải YouTube/TikTok/Douyin thật (đã test 1080p), có `downloader:progress`, lưu `downloader::get_downloads_dir`.
2. **Pipeline lồng tiếng** (`dubbing/mod.rs`): `analyze` (Whisper tách câu có mốc giờ + MiniMax-M3 dịch + phân vai tạm) → `export_dubbed_video` (đọc từng câu bằng Kokoro LOCAL 14 giọng Việt — `scripts/kokoro_vi_tts.py`, có retry-skip câu hỏng → ghép atempo khớp giờ → remux). Đã xuất được `test_dubbing_input/kokoro_DUBBED_TEST.mp4` (26s, 5 câu, KHÔNG cần mạng).
3. **Thư Mục Thành Phẩm** (`open_thanh_pham_folder` + default output = downloads dir): video tải + thành phẩm cùng một chỗ.
4. **Model Hub trong tab Lồng Tiếng** (panel "🎛 Chọn Giọng & Tải Model").

## 🛠️ VIỆC CẦN LÀM (S1 → S5)

### S1 — Cầu nối Tải → Lồng Tiếng (1 click)
- Trong **tab Tải Video**: sau khi tải xong, thêm nút **"🎬 Lồng Tiếng Video Này"** (bên cạnh 2 nút Tạo Vietsub / Lồng Tiếng hiện có nếu đã có — chỉ cần bảo đảm nó CHẠY THẲNG sang tab Lồng Tiếng với `filePath` đã điền sẵn và **tự BẮT ĐẦU phân tích** thay vì bắt người dùng bấm thêm lần nữa).
- Chuẩn hóa đường dẫn file trước khi truyền (backslash, kiểm tra tồn tại) — pattern đã có ở bridge cũ.

### S2 — Nút 1-Click "Từ A Đến Z"
- Tab Tải Video: thêm ô/tích chọn **"Tự động lồng tiếng sau khi tải xong (A→Z)"** (mặc định TẮT).
- Khi bật: tải xong → tự gọi thẳng pipeline lồng tiếng với preset mặc định: **ngôn ngữ gốc = tự nhận hoặc ô chọn sẵn**, đích = Tiếng Việt, giọng = **Kokoro local** (mặc định `kokoro:tuan_ngoc` nam / `kokoro:mai_linh` nữ theo vai), chế độ **Thuyết minh (Ducking)** (nhanh, ít rủi ro — chế độ Chiếu Rạp Demucs để làm sau), phạm vi = **Toàn bộ video** (hoặc ô chọn 3'/10'/Full).
- Trong khi chạy: hiện chuỗi 5 bước (Tải → Tách câu → Dịch → Đọc → Ghép) với % từng bước (dùng event `dubbing:progress` + `downloader:progress` sẵn có). Nút **⏹ Dừng** hoạt động thật ở mọi bước (cơ chế cancel đã có trong dubbing — `run_child_with_cancel`).
- Tắt app giữa chừng → mở lại hiện "đang có việc dở" (lưu state đơn giản vào config/localStorage đều được).

### S3 — Chính sách "hỏng thì làm sao" (bắt buộc — xem KE_HOACH_ALL_IN_ONE_PIPELINE.md Phase 1 mục 5)
- Bước nào hỏng → hiện **đúng nguyên nhân** + 2 nút *"Thử lại bước này"* / *"Chạy tiếp từ bước sau"*. **Cấm im lặng.**
- Câu TTS hỏng đã có retry-skip (mới làm xong) — giữ nguyên và hiện "⚠️ Đã bỏ qua N câu".

### S4 — Phân vai (KHÔNG tự làm mới!)
- Hiện tại dùng "phân vai tạm" (theo khoảng nghỉ) — **giữ nguyên**. Một agent khác đang làm **V2 phân vai thật (sherpa-onnx)** theo `KE_HOACH_V2_PHAN_VAI_THAT.md` — khi V2 xong thì **nối vào** pipeline qua interface `analyze` (nhận `speaker_id` theo câu). **Không trùng việc, không viết lại diarization.**

### S5 — Test THẬT trọn gói (LUẬT CHẠY THẬT — thiếu là chưa xong)
1. `npm run build` + `cargo check` ✅.
2. **BÀI TEST CHỐT:** dán 1 link **YouTube thật** (video 2-5 phút) vào app → bật A→Z → chờ chạy → có **video lồng tiếng hoàn chỉnh trong Thư Mục Thành Phẩm** + mở bằng VLC nghe được. Lưu bằng chứng: đường dẫn file + screenshot từng bước vào `agent-team/test-output-audit-giong/` (prefix `az-`).
3. Test hỏng: rút mạng giữa chừng → hiện đúng lỗi + Thử lại/Chạy tiếp.
4. GUI test bằng `agent-browser --cdp 9222` (cách làm: `AGENT_CHAT.md` tin 08:55 ngày 2026-10-06).
5. Báo `@done` trên `AGENT_CHAT.md` (3-7 dòng, kèm đường dẫn video thành phẩm).

## 📏 RANH GIỚI & LUẬT
- **Không** sửa phần download backend (đang ổn định), **không** viết lại diarization (S4), **không** đụng model giọng (đủ rồi — nâng giọng là việc sau).
- File chính được phép sửa: `src/views/DownloaderView.*`, `src/views/DubbingStudioView.*`, `src/views/SettingsView.tsx` (điều hướng), `src-tauri/src/dubbing/mod.rs` (nhẹ — chỉ phần điều phối), `src-tauri/src/lib.rs` (command mới), `src/lib/tauri.ts`.
- **LUẬT CHẠY THẬT:** mỗi mục S xong → test thật + bằng chứng; báo 1-2 mục/lô. Build release chỉ bằng `npx tauri build --no-bundle`, **CẤM `cargo build --release`**, nhớ `taskkill /IM sublix.exe /F` trước khi build.
- Chất lượng giọng/cảm xúc/clone: **PHẢI ĐỂ SAU** — PO đã dặn "cứ chạy được A→Z đã".

## ✅ CHECKLIST NGHIỆM THU (PO tick)
- [ ] Dán 1 link YouTube thật → bấm 1 nút → video lồng tiếng hoàn chỉnh nằm trong Thư Mục Thành Phẩm
- [ ] Nghe VLC: tiếng Việt đọc từng câu đúng mốc thời lượng
- [ ] Chuỗi 5 bước hiện % rõ ràng; Dừng được ở mọi bước
- [ ] Rút mạng khi đang dịch → hiện đúng lỗi + Thử lại / Chạy tiếp
- [ ] Tắt app giữa chừng → mở lại thấy việc dở
- [ ] Video thành phẩm + ảnh bằng chứng trong `test-output-audit-giong/az-*`

*(Kế hoạch tổng: `KE_HOACH_ALL_IN_ONE_PIPELINE.md` Phase 2 — phiếu này là bản triển khai chi tiết cho phần đó. Giọng nâng cao: `KE_HOACH_GIONG_NOI_LONG_TIENG.md` — làm sau.)*
