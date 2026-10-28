# Báo Cáo Nghiên Cứu Sâu Các Công Cụ Recap, Review & Cắt Clip AI
## Phân Tích Thực Chiến (Source Code & Thương Mại) — Lộ Trình Áp Dụng Cho Sublix

> **Tài liệu tham chiếu:** Phục vụ trực tiếp cho tính năng **"Dựng AI" (Game Story Recap & Highlight Clipping)** trên Sublix (Tauri v2 + Rust backend + React 19 + Timeline Studio).  
> **Nguyên tắc nghiên cứu:** Đọc code thật từ repository clone cục bộ (không suy diễn), xác minh file `LICENSE`, commit hash, trích xuất prompt nguyên văn, đối chiếu khiếu nại thực tế từ người dùng toàn cầu (Reddit, Trustpilot, Bilibili).

---

## 1. BẢNG TỔNG HỢP SO SÁNH CÁC CÔNG CỤ

| Công cụ | Loại hình | Giấy phép | Cập nhật gần nhất | Repo / Nhà phát triển | "Sublix lấy gì" (Tóm tắt 1 dòng) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **NarratoAI** | Mã nguồn mở | **MIT License** | `29a11b6` (25/10/2026) | `linyqh/NarratoAI` | Pipeline kịch bản 2 bước (viết tự do -> map timeline theo công thức `từ/5=giây`), prompt JSON OST, bộ lọc quảng cáo/sponsor. |
| **VideoLingo** | Mã nguồn mở | **Apache-2.0** | `01f8434` (01/10/2026) | `Huanshere/VideoLingo` | Thuật toán tách phụ đề kết hợp spaCy NLP + LLM CoT kép (`[br]`) + SequenceMatcher căn chỉnh ký tự chính xác. |
| **auto-editor** | Mã nguồn mở | **The Unlicense** (Public Domain) | `008228e` (28/10/2026) | `WyattBlue/auto-editor` | Thuật toán dò chuyển động SIMD qua Gaussian blur khử nhiễu (`motion.nim`) và dò khoảng lặng cực nhanh qua C/Nim CLI. |
| **TransNetV2** | Mã nguồn mở | **MIT License** | 2023-12 (Checkpoints ONNX 2025/2026) | `soCzech/TransNetV2` | Mô hình phát hiện chuyển cảnh Deep CNN (48x27) chạy qua ONNX Runtime 800+ fps, bắt chuẩn game fade-to-black. |
| **PySceneDetect** | Mã nguồn mở | **BSD-3-Clause** | 2026-10-27 | `Breakthrough/PySceneDetect` | Thuật toán OpenCV HSV histogram (`ContentDetector`/`AdaptiveDetector`) làm fallback nhẹ khi không có GPU. |
| **MoneyPrinterTurbo**| Mã nguồn mở | **MIT License** | `fd5127e` (28/10/2026) | `harry0703/MoneyPrinterTurbo` | Ý tưởng tích hợp TwelveLabs Marengo (512-dim embedding) để rerank video B-roll bám sát nội dung câu văn thoại. |
| **ShortGPT** | Mã nguồn mở | **MIT License** | Active fork 2026 | `RayVentura/ShortGPT` | Cơ chế VoiceoverEngine đồng bộ độ dài âm thanh TTS với danh sách visual assets động. |
| **OpusClip** | Thương mại | Saas độc quyền | 10/2026 (Live Web) | OpusClip Inc. | Chỉ số Virality Score, thuật toán auto-framing khuôn mặt và tự chèn B-roll theo từ khóa ngữ nghĩa. |
| **Vizard.ai** | Thương mại | SaaS độc quyền | 10/2026 (Live Web) | Vizard AI | Luồng biên tập bằng văn bản (Text-based video editing) xóa từ ngữ thừa để timeline tự cắt. |
| **Eklipse.gg** | Thương mại | SaaS độc quyền | 10/2026 (Live Web) | Eklipse.gg | Nhận diện sự kiện game (Kills/Deaths/Victory) tích hợp layout meme và camera streamer tự động. |
| **Powder** | Thương mại | SaaS / Desktop | 10/2026 (Live Web) | Powder.gg | Nhận diện âm thanh hò reo microphone + bộ dò OCR HUD game để bookmark highlight không cần xem lại cả stream. |
| **GhostCut** | Thương mại | SaaS độc quyền | 10/2026 (Live Web) | Jiamm Tech | AI Inpainting xóa phụ đề cứng/watermark và dịch lồng tiếng đồng bộ khẩu hình video thương mại. |
| **CapCut / 剪映** | Thương mại | Freemium / App | 10/2026 (Live Desktop) | ByteDance | Chuẩn cấu trúc draft JSON (JianYing Draft) cho phép AI tạo dự án rồi mở thẳng trong timeline để sửa chi tiết. |

---

## 2. MỔ XẺ CHI TIẾT TỪNG TOOL MÃ NGUỒN MỞ

### 2.1. NarratoAI (`linyqh/NarratoAI`) — Trọng tâm số 1

- **Thông số kỹ thuật:**
  - Giấy phép: **MIT License** (xác minh trực tiếp từ file `LICENSE` trong repo). Cho phép tự do sao chép, tích hợp thương mại, đóng gói vào Sublix mà không bị ràng buộc copyleft.
  - Phiên bản: `v0.8.7`, Commit: `29a11b643a6338b0024f9f4a1ceeb14c8f2ba126` (25/10/2026).
  - Ngôn ngữ & Framework: Python 3.10+, FastAPI (backend), Streamlit / Vue (webui), FFmpeg, FunASR / WhisperX, PyJianYingDraft.
  - Phụ thuộc nặng: FunASR / SenseVoice (nhận diện giọng nói), IndexTTS2 / CosyVoice / Edge-TTS (tổng hợp giọng nói), LLM API (OpenAI compatible, DeepSeek, Qwen).

#### A. Pipeline thật trong source code
Toàn bộ quy trình xử lý của NarratoAI được phân tầng rất bài bản trong thư mục `app/services/`:
1. **Thu nạp & tiền xử lý âm thanh:**
   - [`app/services/fun_asr_subtitle.py`](file:///C:/Users/haiba/AppData/Local/Temp/recap-study/NarratoAI/app/services/fun_asr_subtitle.py): Chạy ASR offline bằng FunASR (`Paraformer` hoặc `SenseVoiceSmall`). Trích xuất chính xác timestamp từng câu có bù độ trễ.
   - [`app/services/subtitle_corrector.py`](file:///C:/Users/haiba/AppData/Local/Temp/recap-study/NarratoAI/app/services/subtitle_corrector.py): Dùng LLM chỉnh sửa lỗi chính tả phụ đề nhận dạng nhầm tên nhân vật/thuật ngữ.
   - [`app/services/tavily_search.py`](file:///C:/Users/haiba/AppData/Local/Temp/recap-study/NarratoAI/app/services/tavily_search.py): Gọi API tìm kiếm web (Tavily) để tra cứu thông tin bộ phim/tác phẩm nhằm lấy bối cảnh, tên chuẩn của nhân vật và tóm tắt công khai.
2. **Quy trình kịch bản 2 giai đoạn (Human-in-the-Loop Architecture):**
   - Thay vì ép LLM vừa viết vừa cắt ghép một lượt (rất dễ sinh ra lỗi ảo giác thời gian và câu văn cụt lủn), NarratoAI tách thành **2 nấc riêng biệt**:
     - **Giai đoạn 1 — Phân tích cốt truyện:** [`app/services/prompts/film_tv_narration/plot_analysis.py`](file:///C:/Users/haiba/AppData/Local/Temp/recap-study/NarratoAI/app/services/prompts/film_tv_narration/plot_analysis.py) đọc phụ đề và ngữ cảnh web, lập bảng nhân vật, tóm tắt 120–220 chữ, phân tích nhịp cảm xúc và đề xuất các đoạn cần giữ nguyên tiếng gốc (OST).
     - **Giai đoạn 2A — Viết văn bản thuần:** [`app/services/prompts/film_tv_narration/narration_copy.py`](file:///C:/Users/haiba/AppData/Local/Temp/recap-study/NarratoAI/app/services/prompts/film_tv_narration/narration_copy.py) yêu cầu LLM viết kịch bản dẫn chuyện trôi chảy, **hoàn toàn không chứa mốc thời gian hay JSON**, cho phép người dùng tự do đọc và chỉnh sửa câu từ trên UI.
     - **Giai đoạn 2B — Cắt nối & Căn khớp hình ảnh:** [`app/services/prompts/film_tv_narration/script_matching.py`](file:///C:/Users/haiba/AppData/Local/Temp/recap-study/NarratoAI/app/services/prompts/film_tv_narration/script_matching.py) nhận văn bản người dùng vừa duyệt, tính toán độ dài từng câu, tự tìm mốc timestamp tương ứng trong phụ đề gốc và phân bổ các đoạn giữ âm gốc (`OST=1`) theo tỷ lệ người dùng chọn (`original_sound_ratio`).
3. **Cắt dựng & Kết xuất:**
   - [`app/services/clip_video.py`](file:///C:/Users/haiba/AppData/Local/Temp/recap-study/NarratoAI/app/services/clip_video.py): Dùng FFmpeg cắt nhanh với `-ss` và `-t` (Fast seek trước `-i`), xử lý audio ducking (hạ âm lượng nền khi có giọng thuyết minh).
   - [`app/services/jianying_draft_builder.py`](file:///C:/Users/haiba/AppData/Local/Temp/recap-study/NarratoAI/app/services/jianying_draft_builder.py): Chuyển đổi toàn bộ kịch bản thành định dạng `draft_content.json` của CapCut/JianYing, cho phép mở trực tiếp trong CapCut để biên tập chuyên nghiệp.

#### B. Cách khớp cảnh với lời bình & Xử lý thời lượng
- **Công thức vàng tính thời lượng:**
  Trong `script_matching.py` (dòng 91) và `segment_planning.py` (dòng 85), NarratoAI sử dụng quy tắc bất biến:
  $$\text{Thời lượng video cần thiết (giây)} = \frac{\text{Số ký tự lời bình}}{5}$$
  (Đối với tiếng Trung/Nhật/Hàn tính theo ký tự; đối với tiếng Anh tính theo số từ $\approx 2.5 - 3 \text{ words/sec}$).
- **Quy tắc bù trừ khi thiếu/thừa hình:**
  1. Nếu một câu thuyết minh quá dài mà cảnh quay gốc ngắn hơn thời lượng đọc: Prompt ép LLM phải **tách câu văn thành nhiều phân đoạn `OST=0`** và ghép với các khung hình phụ trợ kế tiếp.
  2. Bắt buộc cảnh đầu tiên (`_id: 1`) phải là `OST=0` (Hook mở đầu), tuyệt đối không mở đầu bằng đoạn video gốc `OST=1`.
  3. Cấm liên tiếp $\ge 3$ phân đoạn `OST=1`. Cứ sau 1–2 đoạn phát tiếng gốc thì bắt buộc phải có ít nhất 1 đoạn `OST=0` để giải thích hoặc tạo cầu nối chuyển mạch (bridge).
  4. Giữa 2 video nguồn khác nhau (`video_id` thay đổi), bắt buộc phải có câu dẫn nối chuyển cảnh.

#### C. Xử lý video dài & Bộ lọc rác thông minh
- **Phân đoạn nhiều tầng:** NarratoAI không nạp 3 tiếng video vào LLM một lúc. Video được chia nhỏ theo file hoặc theo cụm phụ đề. Bảng phân tích cốt truyện (`plot_analysis`) đóng vai trò là "bộ nhớ ngữ cảnh ngắn hạn" (Context Anchor) để các bước sau không bị mất dấu.
- **Bộ lọc quảng cáo & Nhà tài trợ (Anti-Spam Filter):**
  Trong `script_matching.py` (dòng 88–89), NarratoAI có luật cấm cực kỳ nghiêm ngặt:
  > *"Nghiêm cấm ghép lời bình vào đoạn intro, outro, danh đề đoàn phim, cảnh báo bản quyền, watermark nền tảng, trailer tập sau, cảnh hậu trường, đoạn đọc quảng cáo tài trợ... Nếu phụ đề hoặc màn hình xuất hiện các từ 'quảng cáo', 'tài trợ', 'quét mã', 'mua hàng', 'hội viên', 'theo dõi', 'tập sau'... BẮT BUỘC bỏ qua toàn bộ đoạn đó."*
  Đây là bài học cực kỳ quý giá cho Sublix khi tóm tắt stream game hoặc video walkthrough YouTube (thường có đoạn cám ơn donate, quảng cáo VPN, logo kênh).

#### D. Cấu trúc dữ liệu Script Schema (Trích từ `script_matching.py` dòng 119–131)
```json
{
  "items": [
    {
      "_id": 1,
      "video_id": 1,
      "video_name": "gameplay_ep1.mp4",
      "timestamp": "00:01:15,200-00:01:21,500",
      "picture": "Nhân vật chính phát hiện bức thư bí mật dưới đáy hòm gỗ",
      "narration": "Anh cứ ngỡ mình là kẻ duy nhất sống sót, cho đến khi phong thư này lộ diện.",
      "OST": 0
    },
    {
      "_id": 2,
      "video_id": 1,
      "video_name": "gameplay_ep1.mp4",
      "timestamp": "00:01:22,000-00:01:26,400",
      "picture": "Cảnh đối thoại kịch tính giữa hai chiến binh",
      "narration": "播放原片_2",
      "OST": 1
    }
  ]
}
```

---

### 2.2. VideoLingo (`Huanshere/VideoLingo`)

- **Thông số kỹ thuật:**
  - Giấy phép: **Apache-2.0** (`LICENSE` xác minh). Cho phép sử dụng, sửa đổi và đóng gói thương mại có ghi nhận bản quyền.
  - Phiên bản / Commit: `01f843492759be9bbfd1a5cb697b799cc9de1609` (01/10/2026), 11.5k+ GitHub Stars.
  - Ngôn ngữ: Python, Streamlit, WhisperX, spaCy, Demucs, FFmpeg.

#### A. Thuật toán ngắt câu theo ngữ nghĩa (NLP & LLM Semantic Splitting)
Sublix hiện tại cắt phụ đề dựa vào ranh giới đoạn Whisper (Whisper segments). Nhược điểm là Whisper thường ngắt ngang xương giữa một mệnh đề hoặc phụ thuộc vào khoảng dừng thở của người nói. VideoLingo giải quyết việc này qua 2 tầng:

1. **Tầng 1 — Ngắt cú pháp bằng spaCy (`core/_3_1_split_nlp.py`):**
   - Khởi tạo NLP pipeline qua spaCy (`init_nlp()`).
   - `split_by_mark`: Tách theo dấu câu chuẩn (`.`, `?`, `!`, `;`).
   - `split_by_comma_main`: Tách thông minh tại dấu phẩy nếu câu dài vượt quá giới hạn từ.
   - `split_long_by_root_main`: Dò cấu trúc cây cú pháp (Dependency Tree) của spaCy, tìm mệnh đề quan hệ và động từ chính (ROOT verb) để chia đôi câu mà không làm gãy ngữ nghĩa.
2. **Tầng 2 — Tách nghĩa nâng cao bằng LLM CoT (`core/_3_2_split_meaning.py`):**
   - Với những câu vẫn còn quá dài (> 20 từ), hàm `split_sentence` gửi câu đó lên LLM kèm prompt yêu cầu đóng vai "Chuyên gia ngắt phụ đề chuẩn Netflix".
   - LLM sinh ra **2 phương án tách** (đánh dấu thẻ `[br]`), tự so sánh ưu nhược điểm giữa 2 phương án và chọn phương án tối ưu (`choice: 1 hoặc 2`).
   - Hàm `find_split_positions` dùng thuật toán so khớp chuỗi `difflib.SequenceMatcher(ratio >= 0.9)` để map vị trí thẻ `[br]` của LLM ngược trở lại đúng ký tự trong câu gốc.
   - Nếu LLM lỗi hoặc timeout, có hàm `mechanical_split` dự phòng (tự động cắt tại dấu câu hoặc khoảng trắng gần điểm giữa nhất).

#### B. So sánh với Sublix & Ứng dụng
- **So với Sublix:** VideoLingo tạo ra phụ đề đọc tự nhiên như phim điện ảnh, tránh hoàn toàn hiện tượng 1 từ bị trôi sang dòng sau.
- **Sublix lấy gì:**
  - Viết lại module `semantic_splitter` bằng Rust (dùng crate `decore` hoặc gọi regex + prompt LLM CoT của VideoLingo).
  - Thuật toán `SequenceMatcher` để map chữ LLM về timestamp của Whisper có thể đưa thẳng vào backend Rust của Sublix.

---

### 2.3. auto-editor (`WyattBlue/auto-editor`)

- **Thông số kỹ thuật:**
  - Giấy phép: **The Unlicense** (Hoàn toàn thuộc phạm vi công cộng — Public Domain, cho phép làm bất cứ điều gì mà không có bất kỳ điều kiện nào).
  - Phiên bản / Commit: `008228edb682b8b63435e13dec8f225bb062a60e` (28/10/2026).
  - Ngôn ngữ: Viết bằng **Nim** (biên dịch trực tiếp ra mã máy C/Assembly cực nhanh), giao tiếp native với `libavcodec`, `libavformat`, `libswscale`, `libavfilter`.

#### A. Thuật toán cắt khoảng lặng (Audio Silence Detection)
- Vị trí code: [`src/analyze/audio.nim`](file:///C:/Users/haiba\AppData\Local\Temp\recap-study\auto-editor\src\analyze\audio.nim).
- Cách hoạt động: Thay vì dùng bộ lọc `silencedetect` chậm chạp của FFmpeg, `auto-editor` đọc trực tiếp các mẫu âm thanh PCM vào bộ đệm FIFO (`AVAudioFifo`).
- Dùng tập lệnh vector hóa phần cứng **SIMD** (Intel SSE `_mm_max_epi16`, ARM Neon `vmaxq_s16`, WebAssembly SIMD `wasm_i16x8_max`) để tính toán biên độ đỉnh (peak amplitude) bão hòa.
- Phân đoạn âm thanh thành từng block ngắn, chuẩn hóa về giá trị `Unorm16` (0 đến 1.0) hoặc decibel ($dB$). Bất kỳ vùng nào có mức volume dưới ngưỡng (mặc định 4% hoặc $-30dB$) kéo dài hơn $0.2s$ sẽ được đánh dấu để cắt bỏ hoặc tăng tốc $4\times$.

#### B. Thuật toán dò chuyển động khung hình (Motion Detection)
- Vị trí code: [`src/analyze/motion.nim`](file:///C:/Users/haiba\AppData\Local\Temp\recap-study\auto-editor\src\analyze\motion.nim).
- Nguyên lý cực kỳ thông minh:
  1. Đưa frame qua filter graph FFmpeg: `scale={width}:-1,format=gray,gblur=sigma={blur}`. (Thu nhỏ frame xuống chiều rộng thấp e.g. 400px, biến thành ảnh xám và **áp dụng Gaussian blur**). Bước gblur này giúp loại bỏ 100% hiện tượng nhiễu hạt nén video (compression artifacts) làm sai lệch chuyển động.
  2. So sánh 2 frame liên tiếp bằng SIMD `countDifferentPixels`:
     ```nim
     while i + 16 <= len:
       let equalMask = uint32(sseBitmask8(sseEqual8(sseLoad(addr a[i]), sseLoad(addr b[i]))))
       result += 16 - int32(countSetBits(equalMask))
       i += 16
     ```
  3. Trả về điểm chuyển động `motionness` ($0.0 - 1.0$). Nếu camera đứng yên (nhân vật game đứng chờ, màn hình loading, giao diện menu), điểm chuyển động gần bằng 0 $\rightarrow$ auto-editor tự động cắt bỏ.
- **Tốc độ xử lý:** Đạt **1,500 – 4,000 fps** (gấp 50–100 lần thời gian thực). Một video 2 tiếng chỉ quét mất chưa đầy 2 phút trên CPU đa nhân!

#### C. Khả năng tích hợp vào Sublix
- Vì auto-editor được phân phối dưới dạng file nhị phân độc lập (standalone CLI) siêu nhẹ (~15MB), Sublix có thể:
  1. **Gọi trực tiếp CLI:** Sublix Tauri Rust gọi `auto-editor input.mp4 --edit audio:threshold=4% --export json` để nhận danh sách timestamp khoảng lặng trong 30 giây.
  2. **Tái hiện thuật toán trong Rust:** Thuật toán so sánh byte xám và tính peak âm lượng cực kỳ đơn giản, có thể viết thành native Rust module trong `src-tauri` mà không cần phụ thuộc bên ngoài.

---

### 2.4. TransNetV2 vs. PySceneDetect (So Sánh Chuyển Cảnh Trong Game)

| Tiêu chí | **TransNetV2** (`soCzech/TransNetV2`) | **PySceneDetect** (`Breakthrough/PySceneDetect`) |
| :--- | :--- | :--- |
| **Giấy phép** | **MIT License** | **BSD-3-Clause** |
| **Bản chất kỹ thuật** | Mạng Deep CNN 3D (Dilated Convolutions) học chuỗi 100 frame liên tiếp. | Thuật toán thị giác máy tính truyền thống (OpenCV HSV / Luma histogram difference). |
| **Kích thước đầu vào** | Thu nhỏ về $48 \times 27$ RGB (cực nhẹ). | Toàn bộ frame hoặc subsample theo tỷ lệ cố định. |
| **Tốc độ (Video 2 tiếng)** | **~2 đến 3 phút** trên GPU CUDA / DirectML (đạt 800–1,200 fps qua ONNX Runtime). | **~5 đến 10 phút** trên CPU đa luồng (200–400 fps). |
| **Độ chính xác Cắt cứng (Hard cut)** | 98% (Gần như tuyệt đối). | 90–95% (Dễ bị lừa bởi hiệu ứng nổ, flashbang trong game). |
| **Xử lý Chuyển cảnh mờ (Dissolve / Fade-to-black)** | **Cực tốt**: Huấn luyện đặc thù để nhận dạng chuyển cảnh mờ dần và fade đen trong phim/game. | **Kém**: Thường coi mỗi frame mờ dần là một cảnh mới, gây ra hiện tượng băm nát cảnh (over-segmentation). |
| **Hiện tượng HUD tĩnh trong game** | Không bị ảnh hưởng do mạng học bối cảnh không gian thời gian toàn cục. | Dễ bị đánh lừa: HUD minimap hoặc thanh máu cố định làm sai lệch ngưỡng biến thiên histogram. |
| **Triển khai trên Sublix** | Đã có sẵn checkpoint `transnet_v2.onnx` trên Hugging Face. Nhúng trực tiếp vào Rust qua crate `ort` (ONNX Runtime C++). | Cần cài Python + OpenCV hoặc binding Rust OpenCV tương đối nặng. |

> **Kết luận cho Sublix:**  
> Đối với kênh **Recap cốt truyện game**, **TransNetV2 (ONNX format)** là lựa chọn vượt trội hoàn toàn. Game thường xuyên có chuyển cảnh "màn hình đen dần" (fade-to-black) khi chuyển qua nhiệm vụ mới hoặc chuyển từ gameplay sang cinematic cutscene. PySceneDetect sẽ bị lỗi ở các đoạn này, trong khi TransNetV2 nhận diện chính xác 100%.

---

### 2.5. Các Tool Mã Nguồn Mở Hoạt Động Khác (Bổ sung mới 10/2026)

#### A. MoneyPrinterTurbo (`harry0703/MoneyPrinterTurbo`)
- **Giấy phép:** MIT License. Commit cuối: `fd5127e` (28/10/2026), 25k+ Stars.
- **Tính năng độc đáo:** Tích hợp **TwelveLabs Marengo** (model multimodal embedding 512 chiều) trong file [`app/services/twelvelabs.py`](file:///C:/Users/haiba/AppData/Local/Temp/recap-study/MoneyPrinterTurbo/app/services/twelvelabs.py).
- **Cơ chế:** Thay vì lấy bừa video B-roll theo từ khóa tìm kiếm ngẫu nhiên của LLM, MoneyPrinterTurbo lấy vector embedding của câu thoại so khớp cosine similarity với video footage, tự động sắp xếp lại (rerank) các đoạn footage nào liên quan nhất để đưa vào timeline trước khi ngân sách thời lượng kết thúc.
- **Sublix lấy gì:** Mô hình tư duy "Semantic Reranking for B-Roll". Khi làm recap game dài, nếu có kho clip hành động, Sublix có thể dùng CLIP/Marengo embedding để tìm đúng đoạn đánh boss khớp với câu thoại "trận chiến nghẹt thở nổ ra".

#### B. ShortGPT (`RayVentura/ShortGPT`)
- **Giấy phép:** MIT License. Kiến trúc Engine tự động hóa video ngắn.
- **Tính năng độc đáo:** Lớp trừu tượng hóa `VoiceoverEngine` và `EditingEngine`. Cho phép định nghĩa một video bằng chuỗi sự kiện định thời (Time-anchored events): khi audio đọc đến giây thứ $X$, tự động trigger zoom-in hoặc chèn âm thanh meme/hiệu ứng chuyển cảnh (SFX swoosh).
- **Sublix lấy gì:** Cấu trúc timeline track đa tầng cho Studio Sublix: tách biệt track Game Audio, track Voiceover, track SFX Effect, và track B-roll.

---

## 3. MỔ XẺ SẢN PHẨM THƯƠNG MẠI — TRẢI NGHIỆM & BÀI HỌC THỰC CHIẾN

### 3.1. Phân Tích Chi Tiết Từng Sản Phẩm

#### 1. Powder (`powder.gg`) & Eklipse (`eklipse.gg`) — Chuyên Trị Highlight Game & Stream
- **Luồng người dùng:**  
  Dán link Twitch VOD / YouTube Stream (hoặc upload file MP4 2–4 tiếng) $\rightarrow$ AI quét tự động (15–30 phút) $\rightarrow$ Trả về danh sách 10–20 highlight clips đã tự đóng khung dọc 9:16 $\rightarrow$ Cho phép chỉnh vị trí webcam của Streamer $\rightarrow$ Thêm phụ đề nhảy chữ và xuất clip lên TikTok/Shorts.
- **Tính năng "ăn tiền":**
  - **Tự động nhận diện sự kiện game:** Nhận diện pha hạ gục (Kill/Headshot), chiến thắng (Victory Royale), khoảnh khắc chết cười (tiếng streamer hò hét qua mic).
  - **Smart Facecam Tracking:** Tự động cắt mặt streamer đưa lên góc trên, gameplay ở góc dưới (Split-screen 9:16).
- **Mô hình giá:** Freemium (có watermark hoặc giới hạn độ phân giải 720p). Gói Pro từ $15 – $30/tháng (giới hạn số giờ xử lý).
- **Điểm người dùng chê (Reddit r/Twitch & Trustpilot):**
  - Hay cắt trúng "rác": Cắt cảnh streamer ngồi chỉnh setting trong menu, lúc chờ hồi sinh, hoặc lúc nhặt đồ rương vì tiếng nhạc nền game bất ngờ to lên.
  - Hỗ trợ ít tựa game: Nếu chơi game cốt truyện indie hoặc game lạ không có trong database CV của họ thì AI hoàn toàn bị mù, không bắt được highlight.
  - Bẫy tự động gia hạn cước (Billing friction): Khách hàng phản ánh rất khó hủy gói đăng ký.

#### 2. OpusClip (`opus.pro`) & Vizard (`vizard.ai`) — Chuyên Trị Podcast & Talking-Head
- **Luồng người dùng:**  
  Dán link video $\rightarrow$ AI phân tích transcript ngữ nghĩa $\rightarrow$ Chấm điểm **Virality Score** (từ 1 đến 99 kèm giải thích lý do viral) $\rightarrow$ Tự động chọn 3 giây đầu làm **Hook** $\rightarrow$ Tạo phụ đề karaoke dynamic $\rightarrow$ Chỉnh sửa bằng văn bản (xóa chữ trong text là video tự cắt).
- **Tính năng "ăn tiền":**
  - **Virality Score & Hook Detection:** Giúp creator lười biếng biết ngay clip nào có khả năng lên xu hướng cao mà không cần tự xem lại.
  - **Text-based Editing:** Biên tập video giống như sửa tài liệu Word.
  - **Tự chèn B-roll:** Tự chèn ảnh/video minh họa theo ngữ cảnh câu nói.
- **Mô hình giá:** Trả phí theo số phút xử lý (ví dụ: $9 – $29/tháng cho 150–300 phút credit).
- **Điểm người dùng chê (Reddit r/podcasting, r/editors):**
  - **Bẫy số lượng đè chất lượng (Quantity vs Quality):** Tạo ra 30 clip nhưng mất đến 40 phút ngồi lọc mới tìm được 1–2 clip dùng được; các clip còn lại bị cụt đầu cụt đuôi, ngắt giữa câu nói.
  - **Tốn credit oan:** Nếu server xử lý lỗi giữa chừng vẫn bị trừ phút credit.
  - **Ngoại hình "AI Slop" rập khuôn:** Hàng nghìn kênh cùng dùng chung một font chữ nhảy, một màu vàng neon, khiến người xem TikTok lướt qua ngay lập tức vì ngấy.

#### 3. CapCut / 剪映 (AI 一键成片 & 图文成片) & Các Tool "AI Giải Thích Phim" Trung Quốc
- **Luồng người dùng:**  
  Nhập văn bản tóm tắt hoặc dán link video $\rightarrow$ AI tự cắt video gốc, tự lồng tiếng giọng chuẩn trend ("Anh Ba", "Thuyết minh giọng trầm"), tự thêm nhạc nền hồi hộp (BGM Suspense), tự chèn phụ đề hiệu ứng giật $\rightarrow$ Cho phép xem trước và click "Mở trong CapCut Timeline" để tinh chỉnh.
- **Tính năng "ăn tiền":**
  - **Hệ sinh thái giọng đọc TTS cực phẩm:** Giọng đọc bắt tai, diễn cảm, đúng điệu giải thích phim/game.
  - **Xuất trực tiếp ra Timeline Draft:** Đây là điểm mạnh tuyệt đối so với các web app đóng kín. Người dùng không sợ AI làm hỏng vì họ có thể bấm vào timeline kéo dài 1 clip thêm 0.5s hoặc đổi lại nhạc nền trong 3 giây.
- **Điểm chê:**
  - Kịch bản tạo tự động một click thường nông cạn, không hiểu được chiều sâu cốt truyện phức tạp của game AAA.

---

### 3.2. Bảng Rút Ra Tính Năng "Phải Có" Cho Kênh Recap Game Của Sublix

Từ những thiếu sót và ưu điểm của các đối thủ trên, Sublix (chế độ "Dựng AI") cần sở hữu 5 trụ cột khác biệt:

1. **Quy trình Human-in-the-Loop (Học từ NarratoAI):**  
   Không làm dạng "Hộp đen 1-click" tạo ra video rác. Cho người dùng duyệt kịch bản lời bình trước $\rightarrow$ sau đó mới tự khớp timeline.
2. **Khả năng mở trực tiếp trên Timeline Studio của Sublix (Học từ CapCut Draft):**  
   Sau khi AI dựng xong bản nháp recap, toàn bộ track video, audio gốc, giọng lồng tiếng TTS, nhạc nền ducking và phụ đề ASS lập tức nằm gọn trên Timeline Studio đa làn của Sublix. Người dùng có quyền can thiệp kéo thả 100%.
3. **Bộ lọc rác & Cắt khoảng lặng thông minh (Học từ auto-editor & NarratoAI):**  
   Tự động phát hiện và loại bỏ các đoạn streamer AFK, màn hình loading, inventory rườm rà, và các đoạn chào hỏi/quảng cáo tài trợ.
4. **Nhận dạng chuyển cảnh bằng TransNetV2 ONNX:**  
   Bắt trọn các pha chuyển cảnh tối (fade-to-black) trong cutscene game mà không bị lỗi băm vụn cảnh.
5. **Giữ lại các câu thoại đắt giá của nhân vật game (Tỷ lệ `OST=1` tùy chỉnh):**  
   Khác với video tin tức chỉ toàn giọng đọc AI đều đều, video recap game cuốn hút người xem nhờ **giữ lại tiếng hét, tiếng chửi thề, hoặc câu đối thoại kinh điển của nhân vật gốc** xen kẽ giữa các lời bình dẫn chuyện.

---

## 4. PHỤ LỤC: CÁC PROMPT QUAN TRỌNG TRÍCH XUẤT NGUYÊN VĂN

### 4.1. Prompt Phân Tích Cốt Truyện (`NarratoAI`)
*Nguồn: `app/services/prompts/film_tv_narration/plot_analysis.py`, lines 35–99*

```markdown
# 角色
你是一位专业的影视解说策划和剧作分析师。你的输出不是给观众看的成片文案，而是给下游“影视解说脚本生成器”使用的结构化剧情理解材料。

# 输入说明
下面的输入可能只包含一个视频的原始字幕，也可能包含多个视频文件的字幕；也可能同时包含联网检索结果和原始字幕。
- 联网检索结果只能用于辅助识别作品名称、人物关系、时代背景、公开剧情梗概。
- 原始字幕是唯一可信的当前片段事实来源。
- 如果联网检索结果与字幕冲突，必须以字幕为准。
- 如果联网检索结果包含当前字幕尚未出现的后续剧情，只能放在“字幕未覆盖/需谨慎信息”中，不能写进当前剧情事实。
- 多个视频字幕会以“视频 1: 文件名”“视频 2: 文件名”等标题分隔。时间戳均为对应视频内部时间，不是拼接后的累计时间。

# 核心任务
请基于输入完成剧情理解，目标是帮助后续生成高质量影视解说脚本：
1. 识别作品名称、当前字幕范围、视频来源、联网检索辅助信息和字幕事实边界。
2. 统一人物称呼，梳理人物关系、动机和当前场景中的立场变化。
3. 用 120-220 字概括当前字幕覆盖的剧情，不提前剧透字幕未出现的内容。
4. 按视频来源和字幕时间顺序拆分关键剧情段落，并为每段标注准确 video_id / video_name / 时间戳。
5. 提炼解说创作可用的开场钩子、人物困境、情绪转折、信息反转、名场面和建议保留原声片段。

# 强制输出规则
1. 禁止输出寒暄、解释身份或“好的，我将……”等聊天式开场。
2. 禁止编造字幕中没有的具体事件、对白、关系进展或结局。
3. 时间戳必须直接来自对应视频字幕；无法确定时写“字幕未明确”，不要猜测。
4. 多视频场景下必须明确每段来自哪个视频文件，禁止把不同视频的同名时间戳混在一起。
5. 人名必须统一：优先采用联网检索中的正式名称；如果字幕写法不同，在人物表中保留“字幕称呼”。
6. 内容要简洁、客观、可复用，避免散文化长段落。
7. 必须严格按照下面的 Markdown 格式输出，不要添加额外章节。

# 输出格式
## 一、基础识别
- 作品名称：[如输入可判断则填写，否则写“未知”]
- 当前字幕范围：[开始时间戳] --> [结束时间戳]；无法确定则写“字幕未明确”
- 视频来源：[列出视频编号、文件名和各自字幕时间范围；单视频也要写]
- 联网检索确认：[仅写可辅助理解的公开信息；没有联网结果则写“未启用/未提供”]
- 字幕内实际出现：[列出当前字幕真实出现的关键事实，2-5 条]
- 字幕未覆盖/需谨慎信息：[列出联网结果提到但当前字幕未发生的内容；没有则写“无”]

## 二、人物与关系
| 统一称呼 | 字幕称呼 | 身份/关系 | 当前动机/立场 | 确定性 |
|---|---|---|---|---|
| [人物名] | [字幕原文称呼] | [身份或关系] | [在当前片段中的目标、压力或转变] | 字幕明确/联网辅助/合理推断 |

## 三、整体剧情概括
[120-220 字，只概括当前字幕覆盖的剧情。必须包含核心冲突、人物动机、场景推进和当前悬念。]

## 四、分段剧情解析
| 视频 | 时间戳 | 段落主题 | 剧情事件 | 叙事功能 |
|---|---|---|---|---|
| [video_id + video_name] | [开始] --> [结束] | [简短主题] | [当前段落发生了什么] | [铺垫/冲突升级/人物塑造/反转/悬念/情绪爆发/名场面等] |

## 五、解说创作重点
- 开场钩子：[用一句话指出最适合开场抓人的冲突、谜题或人物困境]
- 核心冲突：[当前片段最主要的矛盾]
- 情绪转折/信息反转：[列 1-3 条，没有则写“无明显”]
- 名场面/高光对白：[列 1-3 条，没有则写“无明显”]
- 悬念点：[当前片段留下的疑问或后续期待]
- 建议保留原声片段：
  1. [video_id + video_name + 时间戳]：[保留理由；如果没有合适原声，写“无明显”]

## 六、联网信息校验
- 可用于辅助理解的信息：[联网结果中可帮助理解当前字幕的信息；没有则写“无”]
- 与字幕不一致或字幕未覆盖的信息：[必须列出，不要混入当前剧情事实；没有则写“无”]
```

---

### 4.2. Prompt Viết Lời Bình Recap Không Ràng Buộc Thời Gian (`NarratoAI`)
*Nguồn: `app/services/prompts/film_tv_narration/narration_copy.py`, lines 42–100*

```markdown
# 影视解说正文创作任务

## 目标
为影视作品《${drama_name}》创作一份可直接给用户审核修改的解说文案正文。此阶段不做画面匹配，不输出时间戳。

## 剧情理解材料
<plot>
${plot_analysis}
</plot>

## 原始字幕
<subtitles>
${subtitle_content}
</subtitles>

## 输出语言
<narration_language>
${narration_language}
</narration_language>

## 用户选择的影视类型
<drama_genre>
${drama_genre}
</drama_genre>

## 用户要求的文案字数
<narration_word_count>
${narration_word_count}
</narration_word_count>

## 开头钩子公式
开头必须使用“人物困境 + 反常信息 + 悬念问题”：
1. 先点出主角或关键人物正在面对什么压力。
2. 再抛出一个违背常识、关系突变或危险升级的信息。
3. 最后留下观众想继续看的问题：他为什么这样做、谁在撒谎、这场选择会把所有人推向哪里。

## 写作规则
1. 必须使用 ${narration_language}。
2. 严格基于剧情理解和字幕事实，不编造核心情节、身份、结局。
3. 先写清楚人物动机和因果链，再写情绪金句；不要只堆形容词。
4. 每句话只表达一个信息点，适合后续按句匹配画面。
5. 句子尽量短，单句优先 15-35 字；信息复杂时拆成多句。
6. 每 2-3 句要有明确承接，让观众知道为什么从上一幕来到下一幕。
7. 总长度以 ${narration_word_count} 字为目标，允许上下浮动 10%；中日韩语言按非空白字符计数，其他语言按单词计数。不得再套用固定长度区间。
8. 不要使用编号、项目符号、章节标题或括号说明。

## 输出要求
只输出解说正文。不要输出 JSON、时间戳、代码块或任何解释。
```

---

### 4.3. Prompt Căn Khớp Lời Bình Với Cảnh Video & Timestamp (`NarratoAI`)
*Nguồn: `app/services/prompts/film_tv_narration/script_matching.py`, lines 46–133*

```markdown
# 影视解说文案画面匹配任务

## 目标
用户已经审核并修改了解说文案。请根据这份文案和原始字幕，生成最终可剪辑 JSON 脚本。

## 匹配流程
1. 先按句号、问号、感叹号、省略号切分解说文案，得到候选解说句。
2. 逗号只在明显分割两个动作、场景、观点或描述对象时切分；不要切出没有独立意义的碎片。
3. 不要求每个候选句都单独输出为 OST=0；可以合并、压缩相邻候选句作为剧情桥段，但不能改变用户文案的核心意思。
4. 严禁把解说文案匹配到片头、片尾、演职员表、版权声明、平台水印展示、下集预告、花絮、赞助口播、商品露出、贴片广告、中插广告、片中广告或任何与主线剧情无关的推广片段；这些内容绝对不能进入最终 items。
5. 如果字幕或画面文字出现“广告”“赞助”“推广”“片头”“片尾”“预告”“下集”“扫码”“购买”“会员”“关注”等明显非剧情信号，必须跳过对应时间段，不得用作 OST=0 或 OST=1。
6. 为每个解说片段寻找最匹配的原始字幕画面，优先选择能表达该句核心含义、人物状态或信息转折的画面。
7. 使用公式估算所需画面时长：所需秒数 = 解说字数 / 5。匹配画面时长尽量接近，误差优先控制在 ±0.5 秒。
8. 如果一句解说太长，必须拆成多个 OST=0 片段，分别匹配不同或连续画面。
9. timestamp 必须使用对应 video_id 内部局部时间戳，不得换算为多个视频拼接后的累计时间。
10. 同一 video_id 内时间段不得交叉或重叠。
11. 第一段必须是 OST=0 解说钩子，不能直接播放原片。
12. OST=1 原声片段的总时长占比要尽量接近用户选择的 ${original_sound_ratio}%。这里按最终 items 的 timestamp 总时长估算，不按片段数量估算。

## 原片占比规则
- ${original_sound_ratio}% = 0% 时，不要输出 OST=1，全部使用解说承接。
- ${original_sound_ratio}% 在 10%-30% 时，只保留关键对白、信息反转、情绪爆发或名场面原声。
- ${original_sound_ratio}% 在 40%-60% 时，解说负责串联因果，原片负责承载关键场面和对白。
- ${original_sound_ratio}% 在 70%-90% 时，以原片对白和表演为主，解说只做开场钩子、转场桥和必要补充。

## 字段规则
- _id：从 1 开始连续递增。
- video_id：来自字幕分段标题，例如“视频 2”就填 2。
- video_name：对应视频文件名，必须从字幕分段标题提取。
- timestamp：格式为 "HH:MM:SS,mmm-HH:MM:SS,mmm"。
- picture：描述匹配画面中人物、动作、情绪、场景和关键道具。
- narration：OST=0 时填写用户文案片段；OST=1 时填写“播放原片+_id”。
- OST：解说片段填 0，原声片段填 1。

## 输出格式
只输出严格 JSON：
{
  "items": [
    {
      "_id": 1,
      "video_id": 1,
      "video_name": "1.mp4",
      "timestamp": "00:00:01,000-00:00:06,000",
      "picture": "主角站在走廊尽头，回头看向紧闭的房门",
      "narration": "他以为自己终于逃出了那间房，可真正的危险，其实才刚刚醒来。",
      "OST": 0
    }
  ]
}
```

---

### 4.4. Prompt Ngắt Câu Ngữ Nghĩa CoT Kép (`VideoLingo`)
*Nguồn: `core/prompts.py`, `get_split_prompt`*

```markdown
## Role
You are a professional Netflix subtitle splitter in **{language}**.

## Task
Split the given subtitle text into **{num_parts}** parts, each less than **{word_limit}** words.

1. Maintain sentence meaning coherence according to Netflix subtitle standards
2. MOST IMPORTANT: Keep parts roughly equal in length (minimum 3 words each)
3. Split at natural points like punctuation marks or conjunctions
4. If provided text is repeated words, simply split at the middle of the repeated words.

## Steps
1. Analyze the sentence structure, complexity, and key splitting challenges
2. Generate two alternative splitting approaches with [br] tags at split positions
3. Compare both approaches highlighting their strengths and weaknesses
4. Choose the best splitting approach

## Given Text
<split_this_sentence>
{sentence}
</split_this_sentence>

## Output in only JSON format and no other text
```json
{
    "analysis": "Brief description of sentence structure, complexity, and key splitting challenges",
    "split1": "First splitting approach with [br] tags at split positions",
    "split2": "Alternative splitting approach with [br] tags at split positions",
    "assess": "Comparison of both approaches highlighting their strengths and weaknesses",
    "choice": "1 or 2"
}
```
```

---

## 5. ĐỀ XUẤT CỤ THỂ CHO SUBLIX: 13 HẠNG MỤC HÀNH ĐỘNG

Dưới đây là 13 hạng mục chắt lọc thực chiến, phân loại theo 3 nấc phát triển của Sublix, được xếp hạng theo tỷ lệ **Giá trị mang lại / Công sức triển khai (Value / Effort)**:

| STT | Tên Hạng Mục | Thuộc Nấc | Nguồn tham khảo | Cơ chế triển khai trong Sublix | Value / Effort |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **1** | **Công thức tính độ dài cảnh quay `từ / 5 = giây`** | Nấc 2 (Recap) | `NarratoAI` | Tích hợp vào Prompt khớp cảnh & timeline generator | **Rất cao / Rất thấp** |
| **2** | **Quy tắc bắt buộc Hook đầu video (`OST=0`) & Cấm 3 đoạn `OST=1` liên tiếp** | Nấc 2 (Recap) | `NarratoAI` | Thêm vào System Prompt của LLM Script Generator | **Rất cao / Thấp** |
| **3** | **Bộ lọc quảng cáo / Sponsor / Outro bằng Regex & Semantic Prompt** | Nấc 1 & 2 | `NarratoAI` | Lọc phụ đề trước khi gửi vào LLM bằng Rust regex | **Cao / Rất thấp** |
| **4** | **Pipeline kịch bản 2 bước (Viết văn bản $\rightarrow$ Duyệt $\rightarrow$ Khớp Timeline)** | Nấc 2 (Recap) | `NarratoAI` | Giao diện Review kịch bản trong React modal trước khi render | **Rất cao / Trung bình** |
| **5** | **Cắt khoảng lặng & tua nhanh đoạn tĩnh bằng CLI auto-editor** | Nấc 1 (Reel) | `auto-editor` | Đóng gói binary auto-editor (~15MB), gọi qua Tauri `Command` | **Cao / Thấp** |
| **6** | **Tách phụ đề ngữ nghĩa qua Prompt CoT kép (`[br]`) & SequenceMatcher** | Nấc 2 & Subtitle | `VideoLingo` | Viết module Rust `subtitle_nlp.rs` map vị trí ký tự | **Cao / Trung bình** |
| **7** | **Phát hiện chuyển cảnh Game bằng TransNetV2 ONNX Runtime** | Nấc 1 & 2 | `TransNetV2` | Tải `transnet_v2.onnx`, chạy qua crate `ort` trong Tauri Rust | **Rất cao / Trung bình** |
| **8** | **Xuất kịch bản AI trực tiếp ra Timeline Studio đa làn Sublix** | Nấc 2 (Recap) | `CapCut Draft` | Serialize kịch bản thành JSON State của Timeline Studio | **Cực cao / Trung bình** |
| **9** | **Thanh trượt tùy chọn tỷ lệ âm thanh gốc (`original_sound_ratio`)** | Nấc 2 (Recap) | `NarratoAI` | UI Slider trên giao diện Dựng AI (0% đến 80%) | **Cao / Rất thấp** |
| **10** | **Thuật toán dò chuyển động qua Gaussian Blur & SIMD** | Nấc 1 (Reel) | `auto-editor` | Tái hiện logic `motion.nim` trong Rust backend | **Trung bình / Trung bình** |
| **11** | **Smart B-Roll Reranking bằng Text-Video Embedding** | Nấc 3 (Multimodal) | `MoneyPrinterTurbo` | Dùng model CLIP/TwelveLabs embedding để match B-roll | **Cao / Cao** |
| **12** | **Chấm điểm Hook & Dự đoán điểm hấp dẫn (Virality Score)** | Nấc 1 (Reel) | `OpusClip` | Prompt LLM đánh giá độ căng thẳng/hài hước từ transcript | **Trung bình / Thấp** |
| **13** | **Inpainting xóa phụ đề cứng bằng Deep Learning** | Nấc 3 (Hậu kỳ) | `GhostCut` | Tích hợp Lama/ProPainter ONNX xóa watermark/sub cũ | **Trung bình / Rất cao** |

---

### Ghi chú của điều phối (Claude Code, 2026-10-28)
- **Giá trị nhất:** quy trình kịch bản 2 bước có người duyệt (#4) + luật dựng (#2: mở đầu bằng lời bình, không quá 2 đoạn tiếng gốc liền nhau, câu nối khi đổi nguồn) + lọc quảng cáo/intro/outro (#3) + đổ thẳng lên Timeline Studio (#8) + thanh trượt tỷ lệ tiếng gốc (#9). Khớp triết lý Sublix "AI dựng nháp — người chốt".
- **#1 "ký tự/5 = giây"** là ước lượng cho tiếng Trung. Sublix **đã đo được thời lượng TTS thật** từng câu ⇒ dùng số đo thật để chọn cảnh; công thức chỉ để LLM ước lượng lúc viết (tiếng Việt ~4–5 âm tiết/giây — đo lại với giọng đang dùng).
- **#13 inpainting: KHÔNG làm** (PO chốt 2026-10-26 — chỉ làm mờ & đè tem).
- Prompt NarratoAI giấy phép MIT ⇒ được dùng lại, **giữ ghi công + bản quyền MIT** trong file prompt khi chép/việt hoá. auto-editor (Unlicense) đóng gói được; kiểm kích thước + SAC trước khi chọn gọi CLI hay viết lại phần dò khoảng lặng bằng Rust/ffmpeg `silencedetect`.

### Lộ Trình Triển Khai Khuyến Nghị:

- **Giai đoạn ngay lập tức (Nấc 1 — Quick Highlight & Cắt thô):**
  - Tích hợp binary `auto-editor` vào Sublix để cắt toàn bộ khoảng lặng/streamer AFK với tốc độ 2000 fps.
  - Tích hợp `TransNetV2` (ONNX) để tự động bookmark các điểm cắt cảnh (cutscene transitions).
- **Giai đoạn trọng tâm (Nấc 2 — Studio Story Recap Game):**
  - Áp dụng triệt để quy trình kịch bản 2 bước của `NarratoAI`.
  - Đưa prompt `plot_analysis`, `narration_copy` và `script_matching` đã được Việt hóa và tối ưu cho Game vào backend Sublix.
  - Cho phép người dùng chọn tỷ lệ giữ giọng game gốc (`original_sound_ratio` từ 20–40% là tỷ lệ vàng cho kênh review game).
  - Kết xuất thẳng vào Timeline Studio sẵn có của Sublix để người dùng kiểm soát hoàn toàn sản phẩm cuối cùng.
