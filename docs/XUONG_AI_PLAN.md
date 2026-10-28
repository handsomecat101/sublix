# Kế hoạch v0.16 — Tab "Xưởng AI" (Thử nghiệm) + mẫu đầu tiên "Recap cốt truyện game"

> PO chốt hướng 2026-10-28: tab lớn riêng, tách khỏi Studio; thư viện mẫu video; AI dựng nháp → người duyệt → mở sang Studio chỉnh.
> Nguồn: `docs/GAME_RECAP_RESEARCH.md`, `docs/RECAP_TOOLS_DEEPDIVE.md` (13 hạng mục, prompt NarratoAI — MIT), `agent-team/TAM_NHIN_SUBLIX_STUDIO.md` GĐ6.
> Người viết: Claude Code (điều phối). Ai làm gì + trạng thái ⇒ checklist §4 (tích ✅ khi điều phối đã kiểm & commit).

## 1. Người dùng thấy gì (luồng mẫu "Recap cốt truyện game")
1. Mở tab **Xưởng AI** → thư viện thẻ mẫu (Recap game · Reel highlight · *sắp có*: Top 10, Lore nhân vật, So sánh).
2. Chọn **Recap game** → đưa 1 hoặc nhiều video gameplay (hoặc chọn dự án Studio đã nhận dạng thoại) → chọn: độ dài đích (5 / 10 / 15 / 20 phút), giọng đọc, **tỷ lệ tiếng gốc** (thanh trượt 0–60 %, mặc định 30 %), tên game (để AI tra bối cảnh nếu bật).
3. **Bước A — Phân tích:** app nhận dạng thoại (STT có sẵn) + đọc chữ trong game (OCR phụ đề có sẵn v0.14) + đánh dấu **cutscene** (dải đen, mất HUD, có phụ đề, thoại dày) + **lọc rác** (intro, outro, quảng cáo, loading, cảm ơn donate) → AI lập **bảng nhân vật + tóm tắt từng chương**.
4. **Bước B — Lời bình:** AI viết lời bình **văn bản thuần** (không mốc thời gian) theo độ dài đích → người **đọc & sửa như sửa văn** (thêm/xoá đoạn, đánh dấu "giữ thoại gốc ở đây").
5. **Bước C — Dựng nháp:** đọc TTS từng câu (đo **thời lượng thật**) → khớp cảnh theo câu + chèn đoạn thoại gốc theo tỷ lệ → kiểm luật dựng → **mở thành dự án Studio** (làn video, làn giọng, làn phụ đề nhảy chữ, tiếng game đã hạ) → người chỉnh → Xuất như bình thường.

**Luật dựng (từ NarratoAI):** mở đầu bằng lời bình gây tò mò (không mở bằng thoại gốc) · không quá 2 đoạn thoại gốc liền nhau · đổi video nguồn ⇒ có câu nối · không ghép lời bình vào đoạn rác.

## 2. Kiến trúc
- **Frontend:** `src/views/lab/` — tab topbar mới "Xưởng AI" (nhãn Thử nghiệm), thư viện mẫu, trình hướng dẫn 3 bước, trình sửa lời bình. Không đụng Studio ngoài API "mở dự án".
- **Backend Rust:** `src-tauri/src/lab/` —
  - `recap_script.rs` (thuần): kiểu kịch bản `RecapItem { id, source_idx, start, end, picture, narration, keep_original }`, **kiểm luật dựng**, gộp/tách đoạn.
  - `junk_filter.rs` (thuần): lọc câu thoại/OCR rác theo từ khoá (Việt/Anh/Trung) + vị trí (đầu/cuối video).
  - `cutscene.rs` (thuần): chấm điểm cutscene theo đặc trưng từng đoạn (tỉ lệ dải đen, mật độ thoại, có phụ đề) — đặc trưng đo bằng ffmpeg ở lớp ngoài.
  - `allocate.rs` (thuần): **khớp cảnh theo thời lượng TTS thật** (chọn/ghép đoạn video đủ dài, không trùng, theo thứ tự cốt truyện; chèn đoạn giữ thoại gốc theo tỷ lệ).
  - `prompts/` — prompt Việt hoá cho game (gốc NarratoAI, **giữ ghi công MIT**): phân tích cốt truyện → lời bình → khớp cảnh. Gọi LLM qua lớp dịch sẵn có (MiniMax/Ollama).
  - `to_studio.rs`: chuyển kịch bản đã dựng → `DubbingProject`/timeline Studio.
- **Dựng/xuất:** ffmpeg (đã có: cắt, ducking, ASS chữ nhảy, 9:16). Bộ dựng đồ hoạ động (Remotion/Revideo/…) **chưa cần cho mẫu Recap** — chỉ chọn sau nghiên cứu §4 việc R1.

## 3. Ngoài phạm vi v0.16
AI nhìn hình (VLM), Top 10 / thẻ đồ hoạ động, Batch, xoá phụ đề bằng AI (PO đã loại).

## 4. Checklist (điều phối cập nhật)

### Giai đoạn 0 — Chuẩn bị (song song, không chồng file)
- [ ] **D1** Opus — thiết kế tab Xưởng AI: thư viện mẫu, trình hướng dẫn 3 bước, trình sửa lời bình (đánh dấu giữ thoại gốc, đếm thời lượng ước tính), màn tiến trình phân tích, nút "Mở trong Studio" → `docs/ui-mockups/v016-lab*.html` + ảnh + `UI_REDESIGN_PLAN.md §4.14`
- [ ] **C1** OpenCode — lõi thuần Rust `lab/`: `recap_script.rs` (kiểu + kiểm luật dựng) + `junk_filter.rs` + `allocate.rs` + test
- [ ] **R1** Gemini — so sánh bộ dựng video bằng code (Remotion / Revideo / Motion Canvas / HyperFrames / MoviePy): giấy phép, tốc độ, dung lượng, chạy với Tauri trên Windows, font Việt + dựng thử thẻ 5 s → `docs/LAB_RENDER_ENGINES.md`
- [ ] **R2** Gemini — Việt hoá + chỉnh cho game 3 prompt NarratoAI (phân tích cốt truyện / lời bình / khớp cảnh), giữ ghi công MIT → `src-tauri/src/lab/prompts/*.md`

### Giai đoạn 1 — Phân tích (sau C1)
- [ ] **C2** đo đặc trưng cutscene bằng ffmpeg (dải đen `cropdetect`, cảnh `scdet`, im lặng `silencedetect`) + `cutscene.rs` chấm điểm + test video thử
- [ ] **C3** lệnh Tauri `lab_analyze` (STT + OCR + cutscene + lọc rác → tóm tắt chương bằng LLM theo prompt R2), có tiến trình + huỷ

### Giai đoạn 2 — Lời bình & dựng (sau C3, D1)
- [ ] **C4** lệnh `lab_write_narration` (LLM viết lời bình theo độ dài đích) + `lab_build_draft` (TTS từng câu → `allocate` → kiểm luật → `to_studio`)
- [ ] **U1** giao diện theo D1: thư viện mẫu + trình hướng dẫn + trình sửa lời bình + mở sang Studio

### Giai đoạn 3 — Kiểm & phát hành
- [ ] Điều phối: bản sạch + app thật với **gameplay thật 20–40 phút** → ra dự án Studio xem được, lời bình hợp lý, luật dựng đúng
- [ ] Opus duyệt UI so mockup · bump 0.16.0 + changelog · **PO duyệt push**
