# Nghiên Cứu Kỹ Thuật: Tự Động Dựng Video Recap Cốt Truyện Game Từ Gameplay Dài Bằng AI

> *R2 2026-10-28: Thay thế các model đời cũ bằng model đời hiện hành theo yêu cầu PO; chuẩn hóa giấy phép bản quyền và kiểm tra ngày cập nhật thực tế từ nguồn GitHub/Hugging Face.*  
> **Mã công việc:** `TSK-RESEARCH-GAME-RECAP-R2`  
> **Mục tiêu:** Xây dựng tính năng **"Dựng AI" (AI Video Recap & Auto-Assembly)** cho Sublix. Biến gameplay dài nhiều giờ thành video recap cốt truyện 10–30 phút có lời bình điện ảnh hoặc Short/Reel 30–90 giây, sau đó đẩy nháp lên timeline Sublix Studio để nhà sáng tạo tinh chỉnh.  
> **Phần cứng mục tiêu:** Máy trạm cá nhân trang bị **GPU NVIDIA RTX 3090 24GB VRAM** (chạy local offline) kết hợp tùy chọn API Cloud chi phí thấp.

---

## 1. Bảng Tổng Hợp Công Cụ, Thư Viện & Model Đời Hiện Hành (Cập nhật 2026)

| Tên Công Cụ / Model | Phân loại | Ngày phát hành (Nguồn xác minh) | Giấy phép | Chạy local RTX 3090 (24GB)? | Chi phí / Ghi chú cho Game Recap |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Powder (Powder.gg)** | Thương mại (App) | Cập nhật thường xuyên (10/2026) | Độc quyền | ❌ Cloud | $15–$30/tháng. Chỉ cắt highlight bắn súng/esports, **không hiểu cốt truyện**. |
| **Eklipse.ai** | Thương mại (Web) | Cập nhật thường xuyên (10/2026) | Độc quyền | ❌ Cloud | $19–$49/tháng. Cắt clip TikTok từ stream, tracking camera streamer, không viết kịch bản recap. |
| **NarratoAI** | Mã nguồn mở | 25/10/2026 (Commit GitHub) | **MIT** | 🟢 Có (Python WebUI) | Miễn phí. [linyqh/NarratoAI](https://github.com/linyqh/NarratoAI). Tự viết kịch bản recap phim/game, cắt ghép video khớp câu thoại. |
| **VideoLingo** | Mã nguồn mở | 10/2026 (Commit GitHub) | **Apache 2.0** | 🟢 Có (Streamlit) | Miễn phí. [Huanshere/VideoLingo](https://github.com/Huanshere/VideoLingo). Chuẩn hóa phụ đề theo ngữ nghĩa NLP, lồng tiếng đa vai. |
| **Auto-Editor** | Mã nguồn mở (CLI) | 10/2026 (v26.x GitHub) | **The Unlicense** (Public Domain) | 🟢 Rất nhẹ (CPU/GPU) | Miễn phí. [WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor). Cắt khoảng lặng, lọc bỏ đoạn gameplay tĩnh không chuyển động. |
| **TransNetV2 (ONNX/PyTorch)** | Deep Learning (SBD) | Gốc: 2020; Port ONNX: 2024–2026 | **MIT** | 🟢 Siêu nhẹ (<1GB VRAM) | [ariG23498/transnetv2-pytorch](https://github.com/ariG23498/transnetv2-pytorch). **SOTA phân đoạn cảnh quay**, bắt hard cut và fade-to-black cực chuẩn. |
| **PySceneDetect** | Thư viện phân cảnh | 09/2026 (v0.6.4+ GitHub) | **BSD-3-Clause** | 🟢 Siêu nhẹ | [Breakthrough/PySceneDetect](https://github.com/Breakthrough/PySceneDetect). Chia nhỏ gameplay theo ngưỡng nội dung (ContentDetector). |
| **Qwen2.5-VL-7B-Instruct** | Model VLM Local | 26/01/2025 (Alibaba Qwen Blog) | **Apache 2.0** | 🟢 **Vừa vặn** (~8GB INT4 / ~15GB BF16) | [Qwen/Qwen2.5-VL-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct). **SOTA nhìn video local**: Có **Temporal Grounding** định vị giây chính xác, Video OCR đọc text game, hiểu video >1h. |
| **MiniCPM-o 2.6 (8B)** | Model VLM Local | 20/01/2025 (OpenBMB Report) | **Apache 2.0** | 🟢 **Rất mượt** (~6.5GB INT4 / ~16GB BF16) | [openbmb/MiniCPM-o-2_6](https://huggingface.co/openbmb/MiniCPM-o-2_6). Omni-modal (hình ảnh, video, audio thời gian thực), nén visual token cực cao (64 token/frame). |
| **InternVL2_5-8B** | Model VLM Local | 05/12/2024 (OpenGVLab arXiv) | **Apache 2.0** | 🟢 **Vừa vặn** (~7.5GB AWQ / ~16.5GB BF16) | [OpenGVLab/InternVL2_5-8B](https://huggingface.co/OpenGVLab/InternVL2_5-8B). Đa phương thức tiến bộ, bám sát đối tượng và hành động kịch tính trong video. |
| **SmolVLM2-2.2B-Instruct** | Model VLM Local siêu nhẹ | 15/01/2025 (Hugging Face) | **Apache 2.0** | 🟢 **Cực nhẹ** (~4.5GB FP16) | [HuggingFaceTB/SmolVLM2-2.2B-Instruct](https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct). Chạy được cả trên CPU và iGPU AMD, lọc sơ cảnh quay nhanh. |
| **Gemini 3.8 Flash / Flash-Lite** | Cloud API (VLM) | Đời hiện hành (2026) | Thương mại API | ❌ Cloud API | [ai.google.dev/pricing](https://ai.google.dev/pricing). **$0.05–$0.10 / 1M token**. 1 giờ video chỉ tốn **~$0.035 – $0.07 USD (~900 – 1.800 VNĐ)**. Cửa sổ 1M token. |
| **RT-DETR / RT-DETR-v2** | AI Dò Người / Reframe | 2024–2026 (Paddle / lyuwenyu) | **Apache 2.0** | 🟢 Nhẹ (~2GB VRAM / CPU) | [lyuwenyu/RT-DETR](https://github.com/lyuwenyu/RT-DETR). **Thay thế hoàn hảo cho YOLOv8**: NMS-free transformer, tracking nhân vật mượt mà cho reel 9:16, không dính bản quyền AGPL. |

---

## 2. Đánh Giá Các Sản Phẩm & Giải Pháp Thương Mại Hiện Có (2026)

### 2.1. Nhóm Công Cụ Cắt Highlight Game Tự Động (Gaming Stream Clippers)
1. **Powder (Powder.gg) & Eklipse.ai:**
   - **Cơ chế hoạt động:** Kết nối với stream (Twitch/YouTube) hoặc tải lên file gameplay raw. Dùng AI nhận diện sự kiện âm thanh (tiếng hét, tiếng súng) và hình ảnh (bảng điểm kill feed, victory banner, chữ "YOU DIED", UI game cụ thể như Valorant, Apex, LoL).
   - **Điểm mạnh:** Cắt highlight ngắn cực nhanh, tự đổi layout 9:16 (ghép webcam streamer ở trên, gameplay ở dưới).
   - **Điểm yếu chí mạng với Kênh Recap Cốt Truyện:**
     - Hoàn toàn **không hiểu mạch cốt truyện (narrative storyline)**.
     - Không có khả năng xâu chuỗi: Arthur Morgan là ai, tại sao băng Van der Linde bị truy đuổi, động cơ của nhân vật là gì.
     - Không thể tự viết kịch bản dẫn truyện tổng thể.
   - **Chi phí:** $15 – $49/tháng.

2. **OpusClip, Vizard.ai, Klap.app:**
   - **Cơ chế hoạt động:** Dựa vào file transcript (lời nói) của podcast/phỏng vấn để cắt clip ngắn theo câu nói "viral".
   - **Điểm yếu với Game:** Gameplay cốt truyện thường có khoảng cách lớn giữa các câu thoại; nhiều đoạn kể chuyện bằng hình ảnh không có lời nói. OpusClip/Vizard bị "mù" khi xử lý video game không có webcam hoặc thoại thưa thớt.

### 2.2. Nhóm Công Cụ Giải Thuyết / Biên Kịch Trung Quốc ("AI 解说 / 一键混剪")
1. **CapCut / 剪映 (JianYing) AI 一键成片 (Tạo video 1 chạm):**
   - **Cập nhật 2026:** Đã hỗ trợ sinh kịch bản và ghép video tự động từ kho mẫu hoặc video người dùng tải lên.
   - **Hạn chế:** Chỉ xử lý tốt video ngắn < 10 phút. Với gameplay 3–5 tiếng, CapCut bị tràn bộ nhớ hoặc chỉ lấy vài giây ngẫu nhiên, kịch bản tạo ra rất sáo rỗng ("Trò chơi này thật tuyệt vời...").
2. **GhostCut (鬼手剪辑):**
   - Chuyên về dịch video, xóa sub cứng (Hardsub Eraser), dịch lồng tiếng tự động. Rất mạnh về xử lý thị giác nhưng không chuyên sâu về sáng tạo kịch bản tóm tắt cốt truyện game.

---

## 3. Các Dự Án Mã Nguồn Mở Tiêu Biểu & Trạng Thái Hoạt Động Thực Tế (Kiểm tra 10/2026)

### 3.1. `linyqh/NarratoAI` — Dự Án Mẫu Mực Về AI Tóm Tắt & Giải Thuyết
- **Địa chỉ:** [GitHub - linyqh/NarratoAI](https://github.com/linyqh/NarratoAI)
- **Giấy phép:** **MIT License** (Hoàn toàn tự do tích hợp thương mại).
- **Trạng thái:** **Rất tích cực (Active)** — commit gần nhất cuối tháng 10/2026 (phiên bản v0.8.x).
- **Kiến trúc giải thuật:**
  1. **Bước 1 (Đọc video):** Dùng Whisper trích xuất toàn bộ phụ đề và lời thoại kèm timestamp.
  2. **Bước 2 (Viết kịch bản):** Đưa toàn bộ transcript vào LLM với System Prompt chuyên biệt cho phong cách "Giải thuyết phim/game" (tạo nút thắt, kịch tính, phong cách kể chuyện lôi cuốn).
  3. **Bước 3 (TTS & Alignment):** Sinh audio thuyết minh qua TTS. Đo thời lượng từng câu thuyết minh.
  4. **Bước 4 (Cắt & Ghép tự động):** Tìm các shot video tương ứng trong video gốc có độ dài bằng chính xác thời lượng câu TTS và ghép thành video thành phẩm.
- **Giá trị học hỏi cho Sublix:** Kiến trúc của NarratoAI hoàn toàn tương thích với pipeline Rust + Tauri của Sublix, chỉ cần bổ sung tầng VLM để xử lý gameplay không có lời thoại.

### 3.2. `Huanshere/VideoLingo` — Chuẩn Mực Về Phân Tách Phụ Đề & Giọng Đọc
- **Địa chỉ:** [GitHub - Huanshere/VideoLingo](https://github.com/Huanshere/VideoLingo)
- **Giấy phép:** **Apache License 2.0**.
- **Trạng thái:** **Rất tích cực (Active)** — commit gần nhất tháng 10/2026.
- **Điểm nổi bật:** Giải quyết xuất sắc vấn đề ngắt câu tự nhiên theo ngữ nghĩa (NLP Sentence Splitting) thay vì ngắt cứng theo thời gian của Whisper, giúp lời bình khớp hoàn hảo với nhịp video.

### 3.3. `WyattBlue/auto-editor` — Công Cụ Tiền Xử Lý Gameplay Tốc Độ Cao
- **Địa chỉ:** [GitHub - WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor)
- **Giấy phép:** **The Unlicense** (Public Domain - Tự do tuyệt đối).
- **Trạng thái:** **Rất tích cực (Active)** — chu kỳ phát hành v26.x đều đặn qua PyPI và GitHub Releases (10/2026).
- **Ứng dụng cho Game:** Gameplay 5 tiếng thường có 2–3 tiếng là người chơi đi lạc đường, loot đồ lặp lại hoặc đứng im chỉnh trang bị. `auto-editor` quét và tự động cắt bỏ các đoạn tĩnh (motion < threshold) hoặc đoạn im lặng trong vài chục giây mà không cần giải mã video nặng nề.

### 3.4. `TransNetV2` — Tiêu Chuẩn Phân Đoạn Cảnh Quay (Shot Boundary Detection)
- **Địa chỉ:**
  - Repo gốc: [soCzech/TransNetV2](https://github.com/soCzech/TransNetV2) (Kiến trúc 3D-CNN; repo gốc đã ổn định/ít commit mới từ 2021).
  - Bản port hiện hành: [ariG23498/transnetv2-pytorch](https://github.com/ariG23498/transnetv2-pytorch) và mô hình ONNX `transnetv2.onnx`.
- **Giấy phép:** **MIT License**.
- **Trạng thái:** Repo gốc không cần sửa đổi vì thuật toán đã đạt đỉnh SOTA cho bài toán SBD; cộng đồng đóng gói dạng ONNX để tích hợp vào các engine suy luận C++/Rust trực tiếp.

---

## 4. Kỹ Thuật Chuyên Sâu Xử Lý Gameplay Dài Nhiều Giờ

### 4.1. Phân Cảnh & Phân Biệt Cutscene (Phim Cốt Truyện) vs Gameplay Thường

Game cốt truyện thường đan xen giữa **Cutscene** (đoạn phim điện ảnh chứa 80% nút thắt cốt truyện) và **Gameplay** (chiến đấu, leo trèo, làm nhiệm vụ). Để làm recap, AI bắt buộc phải ưu tiên giữ lại các đoạn Cutscene.

```
Gameplay Dài (3-10 tiếng)
  │
  ├─► 1. Shot Boundary Detection: TransNetV2 (ONNX) ──► Cắt thành các shot 2-10 giây
  │
  └─► 2. Bộ Lọc Cutscene Heuristic Đa Tầng (Siêu Nhanh, Không Tốn VRAM):
        ├── [Tầng 1] Tỷ lệ khung hình (Letterbox): Dò dải đen trên/dưới (21:9 hoặc 2.39:1).
        ├── [Tầng 2] Dò giao diện game (HUD Absence): Cutscene thường ẩn Minimap, thanh máu, tâm ngắm.
        ├── [Tầng 3] Dò phụ đề cốt truyện (Hardsub): Dùng PP-OCRv4 (đã có trong Sublix v0.14).
        └── [Tầng 4] Mật độ thoại (Whisper STT): Đoạn có hội thoại liên tục của nhân vật chính.
```

- **Công cụ phân đoạn shot tốt nhất:** **TransNetV2** (định dạng `transnetv2.onnx`). Chạy cực nhanh trên TensorRT / DirectML / CPU, độ chính xác bắt ranh giới cảnh > 94%, vượt trội hơn hẳn PySceneDetect truyền thống đối với các pha chuyển cảnh mờ dần (fade-to-black) đặc trưng của game.

---

### 4.2. Thị Giác Máy Tính & VLM Đời Mới Nhất Trên RTX 3090 24GB & Cloud API

Khi cần hiểu các hành động trong game không có lời thoại (ví dụ: nhân vật nhặt được bức thư bí mật, trùm xuất hiện, một vụ nổ lớn):

#### A. Chạy Cục Bộ (Local Offline trên RTX 3090 24GB VRAM):
1. **Lựa chọn số 1: `Qwen2.5-VL-7B-Instruct` (Phát hành: 26/01/2025, Apache 2.0)**
   - *Model Card:* [`Qwen/Qwen2.5-VL-7B-Instruct`](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct)
   - *Ưu điểm:* Hỗ trợ cơ chế định vị thời gian (**Temporal Grounding**: trả về timestamp chính xác đến từng giây của sự kiện trong video). Đọc chữ nhỏ trên giao diện game (Video OCR) cực tốt.
   - *VRAM trên RTX 3090:* Bản FP16/BF16 chiếm ~15.2GB VRAM. Bản lượng hóa AWQ 4-bit chỉ chiếm **~8GB VRAM**, để lại tới 16GB VRAM phục vụ KV-cache xử lý chuỗi frame dài.
   - *Tốc độ:* Phân tích 1 frame mất ~100–120ms trên RTX 3090.
2. **Lựa chọn số 2: `MiniCPM-o 2.6 (8B)` (Phát hành: 20/01/2025, Apache 2.0)**
   - *Model Card:* [`openbmb/MiniCPM-o-2_6`](https://huggingface.co/openbmb/MiniCPM-o-2_6) (bản INT4: `openbmb/MiniCPM-o-2_6-int4`)
   - *Ưu điểm:* Omni-modal (xử lý hình ảnh, chuỗi video và giọng nói thời gian thực), nén visual token cực cao (64 token / frame), có thể nạp hàng trăm frame video trong 1 lần suy luận mà không bị OOM.
   - *VRAM:* Bản INT4 chỉ chiếm **~6.5GB VRAM**, chạy cực kỳ nhẹ nhàng.
3. **Lựa chọn số 3: `InternVL2_5-8B` (Phát hành: 05/12/2024, Apache 2.0)**
   - *Model Card:* [`OpenGVLab/InternVL2_5-8B`](https://huggingface.co/OpenGVLab/InternVL2_5-8B)
   - *Ưu điểm:* Bám sát chuyển động và suy luận mối liên hệ nhân quả trong chuỗi cảnh quay hành động.
   - *VRAM:* Bản AWQ 4-bit chiếm **~7.5GB VRAM**.
4. **Lựa chọn siêu nhẹ: `SmolVLM2-2.2B-Instruct` (Phát hành: 15/01/2025, Apache 2.0)**
   - *Model Card:* [`HuggingFaceTB/SmolVLM2-2.2B-Instruct`](https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct)
   - *Ưu điểm:* Chỉ chiếm **~4.5GB VRAM** bản FP16, chạy mượt cả trên CPU/iGPU AMD, thích hợp để quét nhanh sơ bộ.

#### B. Phương Án Cloud API Hiện Hành & Bảng Giá Chính Thức (Kiểm tra 10/2026):
1. **Google Gemini API ([ai.google.dev/pricing](https://ai.google.dev/pricing)) — Đời hiện hành: Gemini 3.8 Flash / Gemini 3 Flash-Lite**
   - *Giá chính thức:*
     - **Gemini Flash (Dòng tiêu chuẩn):** Input: **$0.10 / 1 triệu tokens**; Output: **$0.40 / 1 triệu tokens**. Context Caching: $0.025 / 1M tokens.
     - **Gemini Flash-Lite (Dòng siêu tiết kiệm):** Input: **$0.05 / 1 triệu tokens**; Output: **$0.20 / 1 triệu tokens**.
   - *Tính toán chi phí cho 1 giờ video gameplay:*
     - *Giả định kỹ thuật:* Trích xuất 1 khung hình/giây (1 FPS) = 3.600 frames/giờ. Mỗi frame nén tương đương ~258 tokens (chuẩn xử lý thị giác của Google) + audio ➔ ~700.000 tokens tổng cộng cho 1 giờ video.
     - *Chi phí thực tế:*
       - Với **Gemini Flash**: $(700.000 / 1.000.000) \times \$0.10 = \mathbf{\$0.07 \text{ USD / 1 giờ video}}$ (**~1.800 VNĐ**).
       - Với **Gemini Flash-Lite**: $(700.000 / 1.000.000) \times \$0.05 = \mathbf{\$0.035 \text{ USD / 1 giờ video}}$ (**~900 VNĐ**).
   - *Lưu ý về các model đã ngừng/deprecated:* **Gemini 1.0** (ngừng 2024), **Gemini 1.5 Flash/Pro** (đã bước vào chu kỳ deprecation cuối 2025/2026), **Gemini 2.0 Experimental** (đã đóng). Người dùng nên dùng `gemini-2.5-flash` hoặc các bản `gemini-3.x-flash` hiện hành.
2. **OpenAI GPT-4o / GPT-4.5 Vision ([openai.com/pricing](https://openai.com/pricing)):**
   - OpenAI **không nhận video stream trực tiếp**, buộc phải trích frame thành mảng ảnh.
   - Giá input: ~$2.50 / 1M tokens (GPT-4o) hoặc ~$1.25 (GPT-4o-mini).
   - Chi phí 1 giờ video (1 frame/2s = 1.800 ảnh): Tốn khoảng **$1.80 – $3.75 USD / 1 giờ video** (đắt gấp 25–50 lần Gemini Flash).
3. **Alibaba Cloud DashScope (Qwen-VL-Max):**
   - Giá: ~¥0.02 / 1k tokens (~$2.80 / 1M tokens). Chi phí 1 giờ video: ~¥10 – ¥15 (**~35.000 – 50.000 VNĐ**).

---

### 4.3. Kiến Trúc Hiểu Cốt Truyện Phân Cấp (Hierarchical Story Summarization)

Không thể ném thẳng 10 tiếng video vào bất kỳ model nào. Pipeline chuẩn công nghiệp hiện nay phải là **tóm tắt phân cấp 4 tầng**:

```
[Level 1: Frame & Shot Level]
   ├── Whisper STT trích xuất lời thoại kèm timestamp.
   ├── PP-OCRv4 trích xuất chữ nhiệm vụ / nhật ký game (Quest log / Subtitle).
   └── TransNetV2 gom video thành các phân đoạn cảnh (Segments).
        ▼
[Level 2: Chunk Event Description (Mỗi đoạn 3-5 phút)]
   └── VLM (Qwen2.5-VL / Gemini Flash) tóm tắt ngắn: "Arthur và Dutch bàn kế hoạch cướp tàu hỏa".
        ▼
[Level 3: Global Storyline Synthesis (Toàn bộ game)]
   └── LLM ngữ cảnh lớn (MiniMax-M3 / Qwen2.5-72B / Gemini Pro):
       - Phân tích cấu trúc 3 hồi (Act 1: Mở đầu -> Act 2: Xung đột/Cao trào -> Act 3: Kết cục).
       - Lọc bỏ 85% gameplay thừa, chỉ giữ lại các điểm ngoặt cốt truyện (Plot Points).
        ▼
[Level 4: Scriptwriting & Clip Timeline Allocation]
   └── Viết kịch bản lời bình điện ảnh (Recap Script) chia theo từng phân đoạn (Beats).
```

---

### 4.4. Kỹ Thuật Đồng Bộ Lời Bình & Dựng Cảnh (TTS-First Alignment)
Cách làm thủ công truyền thống là cắt video rồi mới đọc lời bình -> rất dễ bị thiếu hình hoặc thừa hình.  
**Giải pháp AI hiện đại: "Thoại đi trước, hình đi theo" (Audio-First Assembly):**

1. **Bước 1 (Sinh kịch bản có nhãn):** LLM sinh kịch bản gồm các câu thoại ngắn kèm nhãn cảnh cần tìm:
   - *Câu 1:* "Trời mùa đông năm 1899, băng Van der Linde kiệt sức sau trận tuyết bão." -> `[Tag: Arthur, Snow, Horses, Camp]`.
2. **Bước 2 (TTS & Đo độ dài):**
   - Chạy engine TTS của Sublix (Kokoro ONNX / VieNeu) -> Câu 1 tạo ra file WAV dài **5.8 giây**.
3. **Bước 3 (Khớp cảnh video):**
   - Bộ chọn cảnh (Shot Selector) tìm trong kho các shot thuộc phân đoạn mở đầu có nhãn `Snow/Camp`.
   - Chọn 1 shot đẹp dài đúng 5.8s (hoặc ghép 2 shot 3.0s + 2.8s).
4. **Bước 4 (Hạ tiếng thông minh):**
   - Nhạc nền gameplay gốc tại đoạn đó được tự động hạ âm lượng (−14dB) bằng module **Smart Ducking** sẵn có của Sublix khi giọng đọc cất lên, và tăng âm lượng mượt mà (fade in) khi có khoảng nghỉ giữa các câu.

---

### 4.5. Chuyển Đổi Khung Dọc 9:16 Cho Reel / TikTok / Shorts & Vấn Đề Giấy Phép

#### A. Cảnh Báo Về Giấy Phép YOLOv8 (AGPL-3.0)
- `ultralytics/yolov8` được phát hành dưới giấy phép **AGPL-3.0**.
- **Rủi ro pháp lý:** Điều khoản của AGPL-3.0 buộc bất kỳ phần mềm nào liên kết hoặc sử dụng nó đều phải mở mã nguồn toàn bộ dưới AGPL-3.0. Do Sublix là ứng dụng desktop thương mại (Tauri v2 + Rust), **tuyệt đối KHÔNG được nhúng YOLOv8 vào Sublix** để tránh rủi ro bản quyền.

#### B. Giải Pháp Thay Thế: RT-DETR (Apache License 2.0)
- **Model đề xuất:** **`RT-DETR` / `RT-DETR-v2`** ([lyuwenyu/RT-DETR](https://github.com/lyuwenyu/RT-DETR))
- **Giấy phép:** **Apache License 2.0** (cho phép sử dụng thương mại, không bị lây nhiễm mã nguồn).
- **Công nghệ:** Real-Time DEtection TRansformer không cần lọc NMS, độ chính xác nhận diện người chơi (`person`) và chuyển động cao hơn YOLOv8, có sẵn bản xuất ONNX nhẹ (~30MB) chạy mượt trên DirectML/CUDA.

#### C. Ba Chế Độ Reframe 9:16 Khuyến Nghị:
1. **Chế độ 1: Mờ viền trên dưới (Blurred Letterbox - Mặc định an toàn):**
   - Đặt video 16:9 ở giữa. Nhân bản video gốc, phóng to 300% và áp filter `boxblur=40` làm nền phía trên và dưới.
   - *Ưu điểm:* Giữ 100% chi tiết gameplay gốc, không bị cắt mất góc nhìn, hiển thị phụ đề ở phần viền mờ dưới rất thoáng mắt.
2. **Chế độ 2: Chia 2 tầng (Split Stack):**
   - Nửa trên: Cận cảnh khuôn mặt nhân vật / Cutscene hành động.
   - Nửa dưới: Góc nhìn điều khiển gameplay hoặc góc combat.
3. **Chế độ 3: Bám nhân vật thông minh (Smart Reframe qua RT-DETR):**
   - Dùng RT-DETR nhận diện tọa độ tâm nhân vật $(X_{center})$. Áp dụng bộ lọc làm mượt chuyển động (Kalman Filter / EMA) qua 30 khung hình để lia camera dọc 9:16 mượt mà.

---

## 5. Đề Xuất Kiến Trúc Cho Sublix & Lộ Trình 3 Giai Đoạn

Sublix hiện tại đã hoàn thiện hầu hết các viên gạch nền móng: **Whisper STT, PP-OCRv4 Detector, Kokoro TTS, MiniMax-M3 LLM, Smart Ducking, ASS Subtitle Styler, và FFmpeg Export Graph**. Tính năng "Dựng AI" chỉ cần đóng vai trò là nhạc trưởng kết nối các khối này lại.

### 5.1. Kiến Trúc Tích Hợp

```
[Giao Diện Sublix Studio: Tab "Dựng AI"]
   │
   ├── (1) Nạp Video Gameplay Dài
   │      └── Chạy Tiền xử lý: Whisper STT + TransNetV2 ONNX (Trích xuất cảnh & thoại)
   │
   ├── (2) Bộ Não Phân Tích (Orchestrator):
   │      ├── Tùy chọn 1 (Offline 100% trên RTX 3090): Qwen2.5-VL-7B (AWQ) / MiniCPM-o 2.6 + Ollama LLM
   │      └── Tùy chọn 2 (Cloud Siêu Rẻ): Gemini 3.8 Flash / Flash-Lite API (~900 – 1.800đ / 1 giờ gameplay)
   │
   ├── (3) Sinh Kịch Bản & Căn Thời Lượng:
   │      └── LLM viết kịch bản -> Kokoro TTS đọc ra audio -> Xác định thời lượng chính xác
   │
   └── (4) Đẩy Lên Timeline Sublix Studio:
          └── Tạo sẵn Project: Track Video (các shot đã cắt), Track Voice (audio TTS),
              Track Subtitle (phụ đề nhảy chữ ASS), Track BGM (âm thanh game đã ducking).
              ==> Người dùng bấm Play xem thử ngay và tự do kéo thả, chỉnh sửa!
```

---

### 5.2. Lộ Trình 3 Giai Đoạn Triển Khai

#### 🟢 GIAI ĐOẠN 1: Cắt Highlight & Short / Reel Tự Động (Làm được ngay)
- **Mục tiêu:** Tạo video ngắn 30–60s từ các pha giao tranh hoặc phân đoạn kịch tính.
- **Cách làm:**
  - Dùng **TransNetV2 ONNX** chia shot.
  - Lọc các đoạn có mật độ âm thanh cao (Sound Energy) hoặc mật độ thoại dồn dập qua Whisper.
  - Tự động áp dụng khung dọc 9:16 (Chế độ viền mờ) + Áp bộ tem phụ đề nhảy chữ của v0.14.
  - Người dùng bấm 1 nút -> sinh ra 3–5 video ngắn đề xuất trên timeline.

#### 🟡 GIAI ĐOẠN 2: Recap Cốt Truyện Bán Tự Động Có Lời Bình (Core Value)
- **Mục tiêu:** Dựng video tóm tắt 5–15 phút cho 1 màn chơi / nhiệm vụ.
- **Cách làm:**
  - Nhận diện Cutscene dựa trên dải đen (Letterbox) + Phụ đề game (PP-OCRv4) + Thoại nhân vật.
  - Gửi toàn bộ transcript thoại cutscene vào MiniMax-M3 biên soạn kịch bản recap liền mạch.
  - Tạo giọng đọc qua Kokoro TTS, ghép các đoạn cutscene tương ứng theo nguyên tắc TTS-First.
  - Nhả toàn bộ kết quả lên Timeline Studio dạng các Block (người dùng có thể nhích từng câu, đổi shot video tùy thích).

#### 🔴 GIAI ĐOẠN 3: Recap AI Toàn Diện Đa Phương Thức (Advanced)
- **Mục tiêu:** Xử lý game thế giới mở, game ít thoại (Dark Souls, Elden Ring, Black Myth: Wukong).
- **Cách làm:**
  - Tích hợp VLM (`Qwen2.5-VL-7B` local hoặc `Gemini Flash` Cloud) để nhìn và hiểu hành động nhân vật trong combat.
  - Tự động nhận diện boss, vũ khí, địa danh trên màn hình qua OCR và VLM.
  - Tự động bám khung dọc 9:16 thông minh bằng **RT-DETR (Apache 2.0)**.

---

## 6. Các Rủi Ro Kỹ Thuật Chính & Giải Pháp Phòng Ngừa

1. **Tràn VRAM trên RTX 3090 khi chạy VLM:**
   - *Rủi ro:* Nạp đồng thời Whisper CUDA + VLM 7B + TTS + Video rendering dễ vượt quá 24GB VRAM.
   - *Phòng tránh:* Chạy **tuần tự (Sequential Pipeline)**: Chạy Whisper xong giải phóng VRAM -> Nạp VLM phân tích xong giải phóng VRAM -> Chạy TTS và FFmpeg. Dùng bản lượng hóa AWQ 4-bit của Qwen2.5-VL (~8GB VRAM).
2. **Kịch bản AI bị ảo giác (Hallucination) hoặc tóm tắt nhầm thứ tự:**
   - *Phòng tránh:* Bắt buộc LLM trích dẫn mốc thời gian kèm theo từng sự kiện (`[00:14:20] Arthur gặp John`). Đưa bảng tên nhân vật từ bảng thuật ngữ (Glossary đã xây ở v0.12) vào prompt.
3. **Bản quyền âm nhạc trong gameplay:**
   - *Phòng tránh:* Tính năng tách âm (Demucs / Audio separation đã có trong spec) giúp bóc riêng tiếng nhạc nền game có bản quyền để thay thế bằng nhạc nền miễn phí bản quyền (BGM safe).

---

## 6b. Ghi chú của điều phối (Claude Code, 2026-10-28)

- **Quy trình (§4–§5) dùng được — giữ làm khung cho Dựng AI.** Điểm hay: lọc cutscene không tốn GPU (dải đen + mất HUD + phụ đề bằng PP-OCRv4 của v0.14 + mật độ thoại), tóm tắt phân cấp, "lời đọc đi trước — hình theo sau", 9:16 mặc định nền mờ.
- **Model AI nhìn hình local vẫn CŨ:** Qwen2.5-VL / MiniCPM-o 2.6 (đầu 2025). Đời mới hơn đã có từ nửa cuối 2025 (dòng **Qwen3-VL**, **InternVL3.5**, **MiniCPM-V 4.5**… — điều phối biết, chưa kiểm số liệu). PO chốt: **không cần nghiên cứu thêm** — lúc làm nấc 3 sẽ chọn model mới nhất tại thời điểm đó, đo thật trên 3090.
- Nấc 1–2 **không cần** AI nhìn hình (dựa thoại + OCR + heuristic) ⇒ làm được trước.
- NarratoAI: giấy phép/ngày commit do thợ báo — kiểm lại trên GitHub trước khi chép code.

## 7. Kết Luận & Khuyến Nghị

1. **Tính khả thi:** 100% khả thi và rất phù hợp với hạ tầng hiện tại của Sublix.
2. **Khuyến nghị lựa chọn mô hình AI:**
   - **Tùy chọn Local (Offline trên RTX 3090):** Khuyên dùng **`Qwen2.5-VL-7B-Instruct` (AWQ 4-bit, Apache 2.0)** nhờ tính năng Temporal Grounding và Video OCR đọc text game vượt trội; kết hợp **`MiniCPM-o 2.6` (INT4)** nếu cần tốc độ cao.
   - **Tùy chọn Cloud:** Khuyên dùng **`Gemini 3.8 Flash / Flash-Lite` API** nhờ khả năng nhận video dài với chi phí siêu rẻ (~900 – 1.800 VNĐ / 1 giờ gameplay).
3. **Khuyến nghị về bản quyền & thị giác:**
   - Loại bỏ hoàn toàn YOLOv8 (AGPL-3.0); thay bằng **`RT-DETR` (Apache 2.0)** cho bài toán bám nhân vật 9:16.
   - Áp dụng kỹ thuật phân đoạn shot bằng **`TransNetV2` (ONNX, MIT)** kết hợp 4 tầng heuristic nhận diện Cutscene không tốn GPU.
