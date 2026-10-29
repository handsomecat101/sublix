# Quy trình recap cốt truyện game — 4 "vai" AI + người chốt (TSK-LAB-R3)

> Opus (thiết kế), 2026-10-30. Chỉ nghiên cứu + đề xuất, không sửa code. Nguồn có ngày ở §7.
> Ký hiệu: **[nguồn]** = có trích dẫn §7 · **[ước tính]** = suy luận của tôi, phải đo lại trên máy thật.

## 0. Tóm tắt 10 dòng cho PO
1. Người làm recap thật **không đoán cốt truyện từ gameplay**: họ đọc wiki/kịch bản/xem lại cutscene trước, rồi mới viết. Một video 10–20 phút mất khoảng 3–7 ngày công **[nguồn]**.
2. Vì vậy, thêm **vai "người nắm cốt truyện"**: người dùng **dán link wiki hoặc văn bản** tóm tắt/kịch bản. AI dựng một **"Hồ sơ cốt truyện"** gồm nhân vật, 3 hồi, twist và kết, mỗi mục gắn mốc thời gian trong gameplay.
3. Hồ sơ cốt truyện là **điểm duyệt bắt buộc số 1**. Sai tên hoặc sai mạch ở đây thì mọi bước sau đều sai.
4. **"Người xem gameplay"** có 2 chế độ. **Rẻ**: thoại + OCR + cutscene như hiện nay, cộng mô tả ảnh bằng VLM cục bộ (Qwen3-VL-8B, Q4 ~6 GB). **Tốt**: Gemini đọc video trực tiếp.
5. Với 10 giờ gameplay, Gemini tốn khoảng **$0,4–3,5 (~10–90 nghìn đ)**: tính 100 token/giây ở độ phân giải thấp, từ 2.5 Flash-Lite tới 3.8 Flash, chưa giảm batch **[nguồn giá 28/10/2026]**. Số "$0,07/giờ" trong GAME_RECAP_RESEARCH.md đã **sai/cũ**.
6. **"Người viết"** giữ như C4/C5 (viết theo hồi + ngân sách thời lượng), nhưng viết **dựa trên Hồ sơ cốt truyện** thay vì tóm tắt từng cụm 10 phút. Đây là **điểm duyệt bắt buộc số 2**.
7. **"Người dựng"** đổi cách khớp cảnh: chấm điểm **nội dung** (thoại STT trùng + mô tả cảnh + embedding ảnh–chữ) chứ không chỉ chọn theo thời lượng. Câu nào khớp kém thì đưa **3 cảnh ứng viên** cho người chọn (duyệt tuỳ chọn số 3).
8. Thời gian máy chạy cho 10 giờ: chế độ Rẻ khoảng 2–3 giờ, chế độ Tốt khoảng 1–1,5 giờ (có tải proxy 360p ~1,5 GB lên) **[ước tính]**.
9. Giữ gần hết pipeline hiện tại: STT/OCR/cutscene/lọc rác, cache cụm, hồi, ngân sách, TTS-trước-hình, luật dựng, mở Studio. Phần **thêm** là nguồn ngoài, Hồ sơ cốt truyện, VLM, khớp cảnh theo nội dung và chọn ứng viên.
10. Có 11 việc cỡ 1 thợ ở §5. Thứ tự nên làm: **nguồn ngoài + Hồ sơ cốt truyện trước** (rẻ, lợi nhất), rồi VLM, rồi khớp cảnh theo nội dung.

## 1. Người thật làm thế nào

**Quy trình chung (gộp từ kinh nghiệm UP主 Bilibili/Zhihu và kênh lore YouTube):**
1. **Lấy tư liệu:** tự chơi và quay, hoặc dùng bản "game movie" gom toàn bộ cutscene, không bình luận. Kênh Gamer's Little Playground chuyên loại này, 4K **[nguồn]**. Có người quay ~10 giờ để làm video ~10 phút **[nguồn Zhihu]**.
2. **Nghiên cứu:** đọc wiki, thoại, mô tả vật phẩm. Với Souls, đây là nguồn chính: VaatiVidya dựng lại sự kiện từ thoại + mô tả đồ **[nguồn]**. Bài học từ vụ tranh cãi 2015: **phải ghi nguồn** người nghiên cứu khác **[nguồn]**.
3. **Viết kịch bản trước, dựng sau:** kịch bản 10 phút khoảng 3.500–5.000 chữ Trung, sửa nhiều lượt. Họ viết theo **xung đột/móc câu** chứ không kể theo dòng thời gian chơi **[nguồn]**.
4. **Dựng:** cắt theo kịch bản, bỏ đoạn chết/thao tác hỏng, nhịp nhanh. Tìm BGM và cảnh là khâu tốn công nhất. Dựng + phụ đề mất khoảng 2 ngày; nhóm full-time mất 3–4 ngày công/video **[nguồn]**.

**4 trường hợp theo thể loại** (nhận định nghề + ước tính của tôi, không phải số đo):

| Thể loại (ví dụ) | Cốt truyện nằm ở đâu | Nguồn người làm dựa vào | Thoại gốc giữ lại | Khó với AI |
|---|---|---|---|---|
| RPG nhiều thoại (Final Fantasy, The Witcher) | Cutscene + hội thoại dài | Thoại (STT/phụ đề) + wiki tóm tắt chương | 30–40 % (cảnh cảm xúc, câu "chốt") | Ít: thoại đủ, chỉ cần nén giỏi |
| Hành động điện ảnh, ít thoại (God of War, Black Myth: Wukong) | Cutscene ngắn + hình ảnh | Bản "game movie" + wiki nhân vật/thần thoại gốc | 20–30 % | Tên riêng (Hán-Việt), cảnh không lời ⇒ cần VLM |
| Souls/ẩn ý (Elden Ring) | Mô tả vật phẩm, thoại NPC rời rạc, môi trường | **Wiki + văn bản vật phẩm** là chính, gameplay chỉ minh hoạ | 10–20 % | **Rất khó** nếu chỉ dùng gameplay ⇒ bắt buộc nguồn ngoài |
| Nhiều nhánh/nhiều kết (Detroit: Become Human, Mass Effect) | Lựa chọn của người chơi | Nhiều lượt chơi, wiki liệt kê nhánh | 25–35 % | Nhiều file của **nhiều tuyến**: phải chọn tuyến chính, nhắc nhánh phụ |

**Độ dài đầu ra phổ biến:** 10–40 phút cho cả game, có kênh làm "game movie" 2–10 giờ. Mở đầu luôn bằng **lời bình móc câu**, không bao giờ mở bằng menu hay đoạn hướng dẫn.

## 2. Từng vai bằng AI (chỉ công nghệ 2026, trừ thứ vẫn là chuẩn)

### 2.1 Người nắm cốt truyện — nguồn ngoài + "Hồ sơ cốt truyện"
- **Nguồn:** người dùng **tự dán** (a) link trang wiki/Fandom, (b) văn bản tóm tắt, hoặc (c) kịch bản thoại (file .txt). App **chỉ tải đúng trang người dùng dán**, như mở trình duyệt; **không tự đi cào** cả wiki.
- **Pháp lý:**
  - Chữ trên Fandom mặc định là **CC BY-SA 3.0**: dùng thương mại được nếu **ghi nguồn + giữ cùng giấy phép**. Một số wiki dùng **CC BY-NC**, cấm thương mại. Ảnh/media **không** nằm trong giấy phép chữ **[nguồn]**.
  - Hướng làm: dùng nguồn ngoài làm **tư liệu để hiểu**, LLM **viết lại bằng lời mới**, cấm chép nguyên câu. App tự sinh dòng "Nguồn tham khảo: …" để người dùng dán vào mô tả video. Wiki NC thì cảnh báo nhẹ.
  - Đây không phải tư vấn pháp lý: video recap vẫn phụ thuộc chính sách nội dung của từng hãng game.
- **AI làm gì:** LLM chữ (MiniMax-M3 đang dùng, hoặc Gemini/Qwen 3.6) đọc nguồn ngoài + **nhật ký sự kiện** gameplay (§2.2). Kết quả là Hồ sơ cốt truyện:
  - bảng **nhân vật** (tên chuẩn, tên Hán-Việt/Anh, vai trò)
  - **3 hồi → các nhịp (beat)**, mỗi nhịp có `mốc gameplay` hoặc `không có cảnh`
  - **twist**, **kết**, gắn cờ spoiler
- **Không có nguồn ngoài:** AI dựng hồ sơ chỉ từ gameplay (như C5 hiện tại) và hiện cảnh báo "độ tin thấp — nên dán wiki". Game kiểu Souls thì gần như bắt buộc phải có nguồn ngoài.

### 2.2 Người xem gameplay — nhặt chuyện chính từng đoạn
- **Tầng 0 (đã có, máy làm, không tốn tiền):** STT, OCR phụ đề, cutscene (dải đen/scdet/im lặng), lọc rác. Thêm **cắt shot + 1 ảnh khoá/shot** (320 px) để các tầng sau dùng.
- **Tầng 1 — VLM mô tả cảnh** (chỉ chạy trên đoạn được giữ: cutscene, đoạn có thoại, đoạn "mốc" như boss/địa danh mới). Đầu ra là **nhật ký sự kiện JSON** `{t_start,t_end,ai_làm_gì,nhân_vật,địa_điểm,quan_trọng 0–1,loại: cutscene|chiến_đấu|khám_phá|farm|menu|chết}`.
  - **Tốt — Gemini đọc video trực tiếp:**
    - Mặc định 1 khung/giây, độ phân giải thấp ≈ **100 token/giây** (66 token/khung + 32 token/giây âm thanh). Cửa sổ 1M token ⇒ **tối đa ~3 giờ/lần gọi**, nên chia theo cụm **[nguồn 13/10/2026]**.
    - Từ 1/9/2026 có chế độ **agentic**: model tự chọn đoạn cần xem, Google báo **ít token hơn tới 88 %**. Số này là của Google, nguồn thứ cấp **[nguồn]**.
    - Phải gửi **bản proxy 360p** (~150 MB/giờ [ước tính]), không gửi bản gốc 20–40 GB.
  - **Rẻ — cục bộ:**
    - **Qwen3-VL-8B** (Q4 ~6 GB) cho mô tả ảnh khoá/cụm 8 ảnh.
    - Máy 24 GB chạy được **Qwen3-VL-32B** (~20 GB) hoặc **Qwen 3.6-27B** (đa phương thức, ~17 GB) nếu cần hiểu sâu hơn **[nguồn 16/8/2026]**. Gemma 4 (4/2026) cũng nhận video **[nguồn]**.
    - Chạy qua Ollama/llama.cpp sẵn có, **tuần tự** với Whisper để không tràn VRAM.
  - **Bỏ hẳn VLM** (chế độ hiện tại): chỉ dùng thoại + OCR. Đủ cho RPG nhiều thoại, yếu với game ít thoại.
- **Không đưa thẳng 10 giờ video cho 1 model.** Phải tóm tắt phân cấp: cụm → hồi → hồ sơ. C5 đã đi đúng hướng này.

### 2.3 Người viết lời bình
- Viết **theo Hồ sơ cốt truyện**, dùng gameplay làm bằng chứng (không viết lại theo thứ tự chơi). Mở bằng móc câu: twist/câu hỏi lớn. Giữ thoại gốc ở cao trào (đề xuất 1–2 câu "chốt" mỗi hồi). Ngân sách thời lượng theo hồi như C5.
- Mỗi đoạn lời bình mang **`beat_id` + gợi ý cảnh** (`cần: Arthur, tuyết, trại`) để người dựng dùng. Đây là thay đổi nhỏ trong prompt + kiểu dữ liệu.
- Nhịp tiếng Việt khoảng 4–5 âm tiết/giây; dùng thời lượng TTS **đo thật** (đã có).

### 2.4 Người dựng — khớp cảnh với từng câu
Chấm điểm mỗi cặp (câu, shot) bằng 3 tín hiệu, rồi `allocate` chọn theo điểm + thời lượng + thứ tự:
1. **Thoại STT/OCR trùng** tên riêng hoặc ý trong câu. Rẻ nhất, đã có dữ liệu.
2. **Mô tả cảnh VLM ↔ câu lời bình**, so khớp chữ–chữ (embedding chữ hoặc LLM xếp hạng 10 ứng viên).
3. **Embedding ảnh–chữ:** **Qwen3-VL-Embedding-2B/8B** (01/2026, hỗ trợ video/ảnh/chữ, có reranker đi kèm) **[nguồn]**. SigLIP 2 là phương án nhẹ hơn. Cần spike kiểm khả năng chạy từ Rust/Ollama.

**Phạm vi tìm:** chỉ tìm trong **cửa sổ của hồi/beat** tương ứng, không tìm cả 10 giờ, để tránh cảnh đúng chữ nhưng sai thời điểm truyện. Điểm thấp hơn ngưỡng ⇒ gắn cờ "khớp yếu" và đưa 3 ứng viên lên màn duyệt 3. Giữ nguyên luật NarratoAI (mở bằng lời bình, ≤2 đoạn tiếng gốc liền nhau, câu nối khi đổi nguồn, không đè lời lên rác).

## 3. Quy trình đề xuất cho Sublix

| # | Bước (vai) | AI/máy làm | Người làm | Vào → Ra |
|---|---|---|---|---|
| 0 | Nguồn | — | Thêm file, đặt **tên game**, dán **link/văn bản nguồn ngoài** (tuỳ chọn, khuyên dùng), chọn **tuyến/lượt chơi** cho từng file, độ dài, tỷ lệ tiếng gốc, chế độ **Rẻ/Tốt** | file + tuỳ chọn |
| 1 | Quét | STT, OCR, cutscene, lọc rác, cắt shot + ảnh khoá (cache theo cụm) | — | dữ liệu thô |
| 2 | Người xem | VLM/Gemini ⇒ nhật ký sự kiện (bỏ farm/menu/chết lặp) | (tuỳ chọn) bỏ/khôi phục đoạn rác như mockup C | nhật ký sự kiện |
| 3 | Người nắm cốt truyện | LLM ⇒ Hồ sơ cốt truyện (nhân vật, hồi, beat, twist, kết, mốc) | **★ DUYỆT 1 bắt buộc:** sửa tên, gộp/xoá nhân vật, kéo thứ tự beat, bỏ hồi, đánh dấu twist có nói hay không | hồ sơ đã chốt |
| 4 | Người viết | LLM viết lời bình theo beat + ngân sách | **★ DUYỆT 2 bắt buộc:** sửa văn, chèn/xoá đoạn, "giữ thoại gốc" (mockup D có sẵn) | kịch bản |
| 5 | Người dựng | TTS ⇒ chấm điểm 3 tín hiệu ⇒ allocate ⇒ luật dựng | **☆ DUYỆT 3 tuỳ chọn:** chỉ các câu "khớp yếu", chọn 1/3 ứng viên hoặc "để Studio" | nháp + dự án Studio |
| 6 | Studio | — | Chỉnh tinh, xuất | video |

**Chi phí + thời gian cho 10 giờ gameplay:**

| Khâu | Rẻ (cục bộ, RTX 3090/4090) | Tốt (API) |
|---|---|---|
| Quét (bước 1) | 23–37 phút (đo C2: 2,3–3,7 s/phút video) + STT ~30–60 phút [ước tính] | như Rẻ (STT/quét vẫn cục bộ) |
| Người xem (bước 2) | Qwen3-VL-8B trên ~6 giờ được giữ, ~700 cụm × 3–6 s ≈ 40–70 phút [ước tính] | Gemini 3.1 Flash-Lite: 3,6M token × $0,25 ≈ **$0,9** + đầu ra ~$0,3; Gemini 3.8 Flash: **≈ $3,5**; batch ≈ ½; lọc rác trước còn ~60 %. Tải 1,5 GB + xử lý song song ~20–40 phút [ước tính] |
| Hồ sơ + lời bình (3–4) | LLM chữ hiện có (MiniMax/Ollama), vài phút | như Rẻ, hoặc Gemini Flash ~$0,1–0,3 |
| Dựng (5) | TTS + embedding + ffmpeg ~10–20 phút [ước tính] | như Rẻ |
| **Tổng** | **~2–3 giờ máy, ~0 đ thêm** | **~1–1,5 giờ, ~30–90 nghìn đ** (tỷ giá giả định 26k đ/USD) |

Người dùng mất khoảng 20–40 phút cho 2 lần duyệt bắt buộc. So với người làm tay mất 3–7 ngày.

## 4. So với pipeline hiện tại (XUONG_AI_PLAN + `src-tauri/src/lab/`)
- **Giữ:**
  - `transcript`, `cutscene`, `junk_filter`, `probe`, `cache` (theo cụm)
  - `arcs` + `budget` (C5)
  - `narration`/`recap_script`, kiểm luật, `draft_tts` (thời lượng thật)
  - `draft_render`, `to_studio`
  - Màn duyệt lời bình (mockup D) và màn lọc rác (mockup C)
- **Đổi:**
  - `analyze_summary` (tóm tắt cụm 10 phút ⇒ chương) chuyển thành **nhật ký sự kiện** có trường `loại/quan_trọng`. Chương/hồi lấy từ **Hồ sơ cốt truyện**, không còn là đầu ra cuối của bước A.
  - `allocate` từ "chọn đoạn đủ dài theo thứ tự" thành **chọn theo điểm nội dung** trong cửa sổ beat. Thuật toán thời lượng/không trùng/luật vẫn giữ.
  - Prompt lời bình: đầu vào là hồ sơ + beat; đầu ra thêm `beat_id`, `gợi ý cảnh`.
- **Thêm:**
  - nguồn ngoài
  - Hồ sơ cốt truyện + màn duyệt
  - shot/ảnh khoá
  - lớp VLM (cục bộ/Gemini)
  - embedding ảnh–chữ
  - màn chọn ứng viên cảnh
  - nhãn tuyến/lượt chơi
  - dòng ghi nguồn

## 5. Danh sách việc (cỡ 1 thợ, theo thứ tự đề xuất)
| ID | Việc | Phụ thuộc | Ghi chú |
|---|---|---|---|
| R3-D | **Opus** thiết kế 3 màn: nguồn ngoài (mở rộng bước Nguồn), Hồ sơ cốt truyện, chọn ứng viên cảnh ⇒ mockup + §4.14 bổ sung | — | phác sẵn ở §6 |
| R3-1 | Nguồn ngoài: lệnh tải **1 URL người dùng dán** (chỉ HTML ⇒ chữ, bỏ menu/quảng cáo), nhận văn bản/.txt, lưu theo dự án + ghi nguồn + phát hiện giấy phép NC | — | không cào, không đăng nhập |
| R3-2 | `story_bible.rs` (thuần) + prompt + lệnh `lab_story_bible`: kiểu `StoryBible {characters, acts[beats{id,summary,anchor?:{source_idx,t}}], twists, ending, sources}`, gộp với `arcs` (arcs ⇒ anchor) | R3-1, C5 | có test giả lập; không có nguồn ngoài ⇒ chạy từ arcs |
| R3-3 | UI màn Hồ sơ cốt truyện (duyệt 1) + nối vào wizard (bước mới giữa A và B) | R3-D, R3-2 | |
| R3-4 | Lời bình theo beat: sửa prompt + `narration` thêm `beat_id`, `scene_hint` | R3-2 | thay đổi nhỏ |
| R3-5 | Shot + ảnh khoá: tận dụng `scdet` của C2 ⇒ xuất 1 JPG 320 px/shot vào cache cụm | — | đo dung lượng/10 giờ |
| R3-6 | Lớp VLM: trait provider + **Ollama Qwen3-VL-8B** (ảnh khoá/cụm) ⇒ nhật ký sự kiện JSON; **đo thật 1 giờ trên 3090** (thời gian, VRAM) | R3-5 | chạy tuần tự sau STT |
| R3-7 | Provider **Gemini video**: proxy 360p (ffmpeg), File API, độ phân giải thấp, chia cụm ≤ 1 giờ, thử chế độ agentic; đếm token/chi phí hiện cho người dùng trước khi chạy | R3-6 (trait) | khoá API do người dùng nhập |
| R3-8 | **Spike** embedding ảnh–chữ: Qwen3-VL-Embedding-2B vs SigLIP 2 — chạy được từ Rust/Ollama/ONNX không, tốc độ trên 5.000 ảnh | R3-5 | chỉ báo cáo + mẫu |
| R3-9 | `allocate` v2: điểm = thoại trùng + mô tả VLM + embedding (trọng số), cửa sổ beat, trả top-3 + độ tin; giữ luật hiện có | R3-4, R3-6, (R3-8) | thuần, có test |
| R3-10 | UI duyệt 3 "khớp yếu" ở bước Dựng nháp + nhãn **tuyến/lượt chơi** ở bước Nguồn | R3-D, R3-9 | |
| R3-11 | Điều phối: chạy thật **3 thể loại** (RPG thoại, hành động, Souls) ~1–2 giờ mỗi game, so có/không nguồn ngoài và Rẻ/Tốt | sau R3-4 | ra số liệu thật thay [ước tính] |

**Lợi nhanh nhất:** R3-1 → R3-2 → R3-3 → R3-4. Chưa cần VLM đã nâng chất lượng mạch truyện rõ rệt, nhất là với game Souls.

## 6. Luồng màn hình các điểm duyệt (phác chữ)
```
[Bước 1 · Nguồn]  (mở rộng mockup B)
┌ Video ───────────────────────────────┐ ┌ Hiểu cốt truyện ───────────────────────┐
│ ≡ part1.mp4  2:14:05  Tuyến: [Chính▾] │ │ Tên game: [Elden Ring              ]   │
│ ≡ part2.mp4  3:02:40  Tuyến: [Chính▾] │ │ Nguồn ngoài (khuyên dùng):             │
│ ≡ ending_B.mp4 0:20  Tuyến: [Kết B ▾] │ │  [Dán link wiki…        ] [+ Thêm]     │
│ + Thêm video                           │ │  ✓ eldenring.fandom.com/…  CC BY-SA    │
└────────────────────────────────────────┘ │  [Dán văn bản / mở .txt]               │
Chế độ phân tích: (•) Rẻ – máy này ~2–3 giờ │ ⚠ Không có nguồn: AI chỉ đoán từ gameplay│
                  ( ) Tốt – Gemini ~1 giờ · ước tính 62.000 đ  └──────────────────┘

[Bước A2 · Hồ sơ cốt truyện]  ★ duyệt bắt buộc
┌ Nhân vật ──────────────┐ ┌ Mạch truyện ─────────────────────────────────────┐
│ Melina   (Melina)  ✎ ⊕ │ │ HỒI 1 · Vùng Đất Giữa                       [⌄]  │
│ Ranni    (Ranni)   ✎ ⊕ │ │  ≡ B1 Kẻ Hoen Ố tỉnh dậy …  ▶ part1 00:03:10     │
│ Godrick  (Godrick) ✎   │ │  ≡ B2 Gặp Melina …          ▶ part1 00:41:22     │
│ + Gộp 2 tên trùng       │ │  ≡ B3 Lore Cây Vàng …       ⚠ không có cảnh      │
└────────────────────────┘ │ HỒI 2 …   ✦ Twist: …  [Nói ra ▾]                 │
Nguồn: wiki 62 % · thoại 30 % · hình 8 %     │ KẾT: tuyến [Chính ▾] + nhắc Kết B │
[↻ Viết lại hồ sơ]          [Tiếp: Viết lời bình →]                          │

[Bước C · Dựng nháp]  ☆ chỉ hiện câu khớp yếu (3/48)
┌ Câu 17: "Ranni từ bỏ thân xác để…"  độ khớp 0,41 ─────────────────────────┐
│ [ảnh A 0,41] [ảnh B 0,38] [ảnh C 0,35]  ( ) Để Studio chọn   ←/→ chọn, Enter │
└──────────────────────────────────────────────────────────────────────────┘
```
Bàn phím theo §4.14: Tab giữa các vùng, ↑/↓ trong danh sách beat, Alt+↑/↓ kéo beat, Enter mở sửa. Các trạng thái (đang chạy, lỗi nguồn, không nguồn) dùng lại khung trạng thái của mockup F.

## 7. Nguồn (truy cập 2026-10-30)
| Nguồn | Ngày | Dùng cho |
|---|---|---|
| [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) | cập nhật 28/10/2026 | 3.8 Flash $0,75/$3,75; 3.1 Flash-Lite $0,25/$1,50 mỗi 1M token; batch ½ |
| [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding) | cập nhật 13/10/2026 | ~100 token/giây (thấp), ≤3 giờ/lần với 1M, File API 20 GB, fps tuỳ chỉnh |
| [TechRepublic — Gemini agentic video](https://www.techrepublic.com/article/news-google-gemini-agentic-video-understanding/) | 09/2026 (thứ cấp) | chế độ agentic 1/9/2026, −88 % token (số của Google) |
| [Mixpeek — tokens per hour of video](https://mixpeek.com/guides/how-many-tokens-is-an-hour-of-video) | 24/10/2026 | đối chiếu ~$0,19–0,39/giờ trên 2.5 Flash |
| [InsiderLLM — Qwen models guide](https://insiderllm.com/guides/qwen-models-guide/) | cập nhật 16/8/2026 (thứ cấp) | Qwen 3.5/3.6/3.8, Qwen3-VL 8B/32B, VRAM Q4 |
| [Qwen3-VL Technical Report, arXiv 2511.21631](https://arxiv.org/abs/2511.21631) | 11/2025 (vẫn là dòng VL chuyên video hiện hành) | ngữ cảnh 256K, video dài |
| [Qwen3-VL-Embedding/Reranker, arXiv 2601.04720](https://arxiv.org/abs/2601.04720) · [HF](https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B) | 01/2026 | embedding ảnh/video–chữ 2B/8B |
| [Gemma 4 — Wikipedia](https://en.wikipedia.org/wiki/Gemma_(language_model)) · [NVIDIA NIM](https://docs.api.nvidia.com/nim/reference/google-gemma-4-31b-it) | 2/4/2026 | mở trọng số, nhận video |
| [Fandom Licensing](https://www.fandom.com/Licensing) · [Help:Licensing](https://community.fandom.com/wiki/Help:Licensing) | không ghi ngày (đang hiệu lực) | CC BY-SA 3.0, ngoại lệ NC, ảnh không thuộc giấy phép |
| [Zhihu — UP主 làm video có khó không](https://zhihu.com/question/295782040) · [Jiemian — UP主 B站](https://www.jiemian.com/article/8358840.html) | nhiều năm, kinh nghiệm nghề (không có số 2026) | 3.500–5.000 chữ/10 phút, dựng 2 ngày, nhóm 3–4 ngày công, quay ~10 giờ |
| [PC Gamer — VaatiVidya](https://www.pcgamer.com/au/how-one-youtuber-turned-dark-souls-lore-into-a-living) · [KnowYourMeme](https://knowyourmeme.com/memes/people/vaatividya) | ~2015–2019 (cũ, nhưng cách làm lore Souls không đổi) | lore từ thoại + mô tả đồ; bài học ghi nguồn |
| [CreatorDB — Gamer's Little Playground](https://creatordb.app/creatorstats/glp/) | 8/2026 | mẫu "game movie" gom cutscene, không bình luận |
| Nội bộ: `XUONG_AI_PLAN.md`, `GAME_RECAP_RESEARCH.md`, `RECAP_TOOLS_DEEPDIVE.md`, `src-tauri/src/lab/` | 10/2026 | pipeline hiện tại, số đo C2 |

**Chưa kiểm/để ý:**
- Không tìm được nguồn 2026 mô tả quy trình **kênh Việt** cụ thể.
- Tỷ lệ thoại gốc theo thể loại ở §1 là ước tính nghề của tôi.
- Tốc độ VLM/embedding cục bộ chưa đo; R3-6/R3-8 sẽ đo.
- Bảng model VLM ở GAME_RECAP_RESEARCH (Qwen2.5-VL, MiniCPM-o 2.6) đã **cũ**; dùng Qwen3-VL / Qwen 3.6 / Gemma 4.
- Rẻ nhất có video hiện là Gemini **2.5 Flash-Lite** ($0,10/1M ⇒ ~$0,4 cho 10 giờ), nhưng chất lượng chưa thử; trang giá báo **một số model tăng giá từ 1/12/2026 hoặc 1/1/2027**. Kiểm lại trước khi ghi số vào UI.
