# TÀI LIỆU PHÂN TÍCH UI & ĐẶC TẢ TÍNH NĂNG SUBLIX STUDIO
**Dự án:** Sublix Desktop (All-in-One Studio)  
**Tác giả:** Antigravity (Gemini) — Theo chỉ đạo của Product Owner (Anh Tuấn)  
**Ngày lập:** 2026-10-08  
**Tài liệu đối chuẩn:** Toàn bộ ảnh chụp thực tế trong `Desktop/ezmax/` (`main ui/`, `timeline/`, `output.png`, `Screenshot_5.png`, `tomt a.png`)

---

## 1. TỔNG QUAN & PHÂN TÍCH ĐỐI CHUẨN THỰC TẾ (EZMAXSUB REVERSE-ENGINEERING)

Qua phân tích trực tiếp các ảnh chụp màn hình độ phân giải cao tại `Desktop/ezmax/`:
* **Kiến trúc tương đồng:** EZMAXSUB được xây dựng trên cùng stack **Tauri + WebView2** như Sublix (phát hiện qua cửa sổ `"TAURI_DRAG_RESIZE_WINDOW"`), chứng minh stack của Sublix hoàn toàn làm chủ được 100% trải nghiệm này mượt mà và tối ưu tài nguyên.
* **Mô hình kinh doanh của đối thủ vs Ưu thế của Sublix:**
  * EZMAX khóa các tính năng đắt giá sau bức tường phí (`Gói VIP`):
    * Bóc tách Vocal giữ nhạc nền (`Desktop/ezmax/timeline/Screenshot_2.png` — *"Cần nâng cấp"*).
    * Giới hạn thời lượng xuất video tối đa 5 phút + đóng watermark logo (`output.png`).
    * Tính năng tự động tóm tắt / review kịch bản phim (`tomt a.png` — *"🔒 Cần gói trả phí"*).
  * **Sublix vượt trội hoàn toàn:**
    * ✅ **Tách vocal miễn phí 100%** bằng Demucs v4 (CUDA) local (đã hoàn thiện tại `TSK-014`).
    * ✅ **Không giới hạn độ dài video**, xuất phim dài 400+ phân đoạn không logo bản quyền.
    * ✅ **Tải video đa nền tảng 1-click** (YouTube, TikTok, Douyin, Bilibili) và **Live Subtitle Overlay** độc quyền.

---

## 2. BỐ CỤC UI & TÍNH NĂNG CHI TIẾT THEO ẢNH CHỤP THẬT

### 2.1. Cột Các Bước Xử Lý (P2 - Trái)
1. **Nhận dạng giọng nói (Whisper / Sherpa):**
   * Ngôn ngữ gốc (Tự động phát hiện ▾).
   * Mô hình nhận dạng (Whisper Local / API).
   * Công tắc `Phân biệt người nói` (mặc định BẬT). Khi bật, quy trình tự dừng sau bước Dịch để người dùng gán giọng từng nhân vật trước khi lồng tiếng (`Desktop/ezmax/Screenshot_5.png`).
2. **Dịch thuật & Hồ Sơ Phim (MỚI - `Desktop/ezmax/Screenshot_5.png`):**
   * **Nhà cung cấp AI dịch đa dạng:**
     * `DeepSeek Chính Hãng` (`deepseek-chat` V3 / `deepseek-reasoner` R1) — Khuyên dùng số 1: siêu rẻ ($0.14/1M tokens), tốc độ cực nhanh, dịch tiếng Việt văn học xuất sắc.
     * `OpenRouter API` (Top models: `deepseek/deepseek-chat`, `google/gemini-2.0-flash-001`, `meta-llama/llama-3.3-70b-instruct`, `qwen/qwen-2.5-72b-instruct`).
     * `MiniMax Cloud` (Dành cho người dùng có sẵn key MiniMax).
     * `Local GGUF (llama-server)` (Qwen3-4B / Gemma-3-4B chạy GPU offline).
     * `Ollama Local` (Dành cho máy có cài Ollama).
   * Ô nhập trực tiếp `API Key` tiện dụng ngay trên giao diện.
   * **HỒ SƠ PHIM (AI HỌC) — Khóa cách xưng hô:**
     * Tự động trích xuất danh sách nhân vật, danh từ riêng, ngôi xưng hô (`huynh - đệ`, `anh - em`, `cô - cháu`...).
     * Người dùng có thể bấm `Sửa và khóa cách xưng hô` để AI duy trì nhất quán 100% xuyên suốt phim dài nhiều tập.
3. **Thuyết minh & Bảng Phân Vai (Speaker Roster):**
   * Hiển thị đầy đủ danh sách nhân vật phát hiện bởi Sherpa-onnx.
   * Mỗi nhân vật có: chấm màu nhận diện riêng, tên vai sửa được, nút `🔊 Nghe giọng gốc` (Base64 preview 2-8s), ô chọn giọng gán, nút nghe thử giọng gán, và dropdown gộp vai.
4. **Tab "Tóm tắt / Review phim" (MỚI - `Desktop/ezmax/tomt a.png`):**
   * Chuyển đổi giữa 2 chế độ: `Thuyết minh` (lồng tiếng nguyên tác) vs `Tóm tắt/Review` (tự động tóm tắt cốt truyện).
   * Cấu hình: Kiểu tóm tắt & độ dài (vd: `20% · Kể lại cốt truyện`, phân tích kịch tính, hài hước...).
   * Quy trình 2 bước: (1) Phân tích & viết kịch bản tóm tắt qua LLM -> (2) Tạo giọng & dựng timeline.

---

### 2.2. Khung Xem Video (P3 - Giữa)
* Video player tỷ lệ 16:9 với subtitle overlay màu vàng viền đen hiển thị trực tiếp trên khung hình (chuẩn theo `Screenshot_6.png`).
* Công cụ chọn vùng phụ đề / che mờ sub cũ (Area Blur).
* Nhảy playhead đồng bộ 2 chiều khi click bất kỳ câu nào ở danh sách hoặc timeline.

---

### 2.3. Danh Sách Câu Phụ Đề (P4 - Phải)
* Bộ lọc đa năng: `Tất cả`, `Chưa dịch`, `Cần chú ý`, `Thiếu audio` + các Chip lọc theo từng vai (`● N1 (36)`, `● N2 (31)`, `● N3 (31)`...).
* Thẻ câu: Hiện mốc thời gian, câu gốc (xám), câu dịch (cho phép sửa inline tại chỗ), vai đọc, và nút nghe thử.

---

### 2.4. Timeline Đa Làn & Cơ Chế "Lấp Đầy Tiến Độ" (P5 - Trái Tim Studio)

#### A. Thanh Điều Khiển P5a (Tooltips chuẩn từ `timeline/`):
* ✂️ **Cắt tại playhead** (`2.png`, `3.png`): Cắt đôi câu hoặc clip tại vị trí kim thời gian.
* 📋 **Nhân bản** (`4.png`): Duplicate block sang phân đoạn kế tiếp.
* 🗑 **Xóa** (`6.png`): Xóa câu đang chọn.
* ↔ **Giãn kín timeline** (`5.png`): Tự động co giãn zoom để phủ kín toàn bộ thời lượng video trên màn hình.
* 🧲 **Tự động bắt dính (N)** (`9.png`): Snapping mép câu vào playhead hoặc câu liền kề (giữ Shift/Ctrl để tạm tắt).
* 🔗 **Nam châm rãnh chính (P)** (`8.png`): Tự động khép khoảng trống giữa các clip khi di dời/xóa.
* 🔗 **Liên kết rãnh** (`10.png`): Di chuyển hoặc xóa video kéo theo phụ đề và âm thanh đi kèm.
* 🔖 **Add bookmark** (`7.png`): Gắn cờ đánh dấu mốc quan trọng.
* Đồng hồ thời gian `Hiện tại / Tổng`, nút Play/Pause vàng to ở giữa, công tắc `Batch Mode`.
* Tốc độ phát video `1.0x`, tốc độ đọc giọng `1.5x`, thanh trượt zoom thời gian.

#### B. Các Làn Rãnh P5b:
1. **Làn 1 — Phụ đề:** Các block màu cyan (`||||||||||`) thể hiện từng câu thoại.
2. **Làn 2 — Lớp phủ làm mờ:** `Blur - theo phụ đề` (dải xanh sọc) che phụ đề cứng có sẵn của video gốc.
3. **Làn 3 — Main Video + Sóng âm:** Dải ảnh filmstrip thu nhỏ cuộn ngang + dải sóng âm audio waveform màu trắng bên dưới.
4. **Làn 4..n — Mỗi nhân vật một làn riêng:** Block màu theo vai (xanh, lục, cam, tím...), có thẻ tên vai và giọng đọc đang gán.

---

## 3. THIẾT KẾ CƠ CHẾ "LẤP ĐẦY DẦN TRÊN TIMELINE" (PROGRESSIVE FILLING)

### 3.1. Vấn Đề Hiện Nay
Nếu dùng quy trình AI tự động hóa dạng "hộp đen" (black box) — bấm nút rồi chờ 10–20 phút:
* Người dùng không biết AI đang làm đến đâu, dễ sốt ruột.
* Khi có 1 câu dịch ngô nghê hoặc 1 đoạn giọng đọc sai cảm xúc, người dùng không thể can thiệp ngay, phải chờ chạy hết rồi chạy lại từ đầu rất lãng phí thời gian và token.

### 3.2. Cơ Chế "Thuật Toán Vẽ Nháp — Con Người Tinh Chỉnh & Lấp Đầy Dần"
1. **Giai đoạn STT (Nhận dạng âm thanh):**
   * Khi Whisper/Sherpa phân tích đến đâu (từng chunk 30s hoặc từng câu), block phụ đề mộc lập tức xuất hiện và "lấp đầy" trên rãnh phụ đề của Timeline.
   * Playhead tiến dần, người dùng nhìn thấy các block mọc ra trực quan theo thời gian thực.
2. **Giai đoạn Dịch thuật (DeepSeek / OpenRouter):**
   * Mỗi mẻ câu thoại dịch xong sẽ lập tức cập nhật chữ tiếng Việt vào block trên timeline và danh sách P4.
3. **Giai đoạn TTS (Lồng tiếng):**
   * Câu nào tổng hợp xong audio, block tương ứng trên làn nhân vật sẽ sáng màu và xuất hiện biểu tượng sóng âm nhỏ.
   * Người dùng có thể click ngay vào block đó để nghe thử mà không cần chờ cả phim xong.
4. **Quyền Tinh Chỉnh Tại Chỗ Của Người Dùng (Human-in-the-loop):**
   * **Sửa chữ:** Click đúp vào ô câu trên timeline hoặc click vào danh sách P4 để sửa câu dịch.
   * **Sửa thời gian:** Kéo mép trái/phải của block để chỉnh thời điểm bắt đầu/kết thúc (bắt dính tự động theo nam châm N).
   * **Đổi người nói:** Kéo thả block từ làn nhân vật này sang làn nhân vật khác.
   * **Đọc lại tức thì:** Chuột phải hoặc bấm nút `Đọc lại câu này` — hệ thống chỉ gọi TTS đọc lại đúng câu vừa sửa, lấp lại vào timeline mà giữ nguyên 99% phần còn lại!

---

## 4. ĐẶC TẢ TÍCH HỢP LLM: DEEPSEEK & OPENROUTER

### 4.1. So Sánh & Lựa Chọn
| Tiêu chí | MiniMax Cloud (Cũ) | DeepSeek Chính Hãng (Mới) | OpenRouter (Mới) |
|---|---|---|---|
| **Tốc độ phản hồi** | Trung bình (1-3s/câu, dễ nghẽn) | **Siêu tốc** (0.2-0.5s/câu) | Rất nhanh (phụ thuộc model) |
| **Chi phí** | $0.50 - $1.00 / 1M | **Cực rẻ** (~$0.14 - $0.28 / 1M) | Linh hoạt (từ $0 đến $2 / 1M) |
| **Văn phong dịch tiếng Việt** | Khá tốt | **Xuất sắc, tự nhiên, văn học** | Đa dạng tùy model |
| **Độ ổn định** | Đôi khi timeout batch lớn | **Rất cao** | Rất cao, có fallback |
| **Model đề xuất** | `MiniMax-M3` | `deepseek-chat` (V3), `deepseek-reasoner` (R1) | `deepseek/deepseek-chat`, `google/gemini-2.0-flash-001`, `qwen/qwen-2.5-72b-instruct` |

### 4.2. Kiến Trúc Backend Rust
Cả DeepSeek và OpenRouter đều tương thích 100% chuẩn OpenAI Chat Completions API:
* **DeepSeek Endpoint:** `https://api.deepseek.com/chat/completions` (Header: `Authorization: Bearer <deepseek_key>`).
* **OpenRouter Endpoint:** `https://openrouter.ai/api/v1/chat/completions` (Header: `Authorization: Bearer <openrouter_key>`, `HTTP-Referer: https://sublix.app`, `X-Title: Sublix`).
* **Config mở rộng (`config.rs`):** Thêm 4 trường an toàn:
  * `deepseek_api_key: String` (mặc định trống).
  * `deepseek_model: String` (mặc định `"deepseek-chat"`).
  * `openrouter_api_key: String` (mặc định trống).
  * `openrouter_model: String` (mặc định `"deepseek/deepseek-chat"`).
* **Định tuyến dịch (`translate/mod.rs` & `dubbing/mod.rs`):** Hỗ trợ `translation_provider` nhận các giá trị `"deepseek"`, `"openrouter"`, `"minimax"`, `"ollama"`, `"local"`.

---

## 5. LỘ TRÌNH TRIỂN KHAI CHO AGENT TEAM

| Bước | Nội dung triển khai | Tiêu chí nghiệm thu (LUẬT CHẠY THẬT) |
|---|---|---|
| **Bước 1** | **Backend LLM:** Thêm cấu hình và hàm gọi dịch DeepSeek & OpenRouter trong `config.rs`, `server.rs`, `translate/mod.rs` | Unit test gọi mock/API pass, `cargo check` 0 lỗi |
| **Bước 2** | **UI Selector Provider Dịch:** Thêm dropdown chọn DeepSeek / OpenRouter / MiniMax + ô nhập Key + chọn Model + box Hồ sơ phim trong Bước 2 của `SublixStudioView.tsx` | Mở bước 2 thấy dropdown đổi provider và lưu key vào config |
| **Bước 3** | **UI Timeline Toolbar & Progressive Filling:** Thêm các nút công cụ timeline (Cắt, Xóa, Nhân bản, Fit, Nam châm N) + render các block lấp đầy dần theo mốc thời gian thực tế | Mở video thật thấy các block xuất hiện đúng thời gian và màu sắc |
| **Bước 4** | **E2E Test & Ảnh Chụp Chứng Minh:** Chạy thử trên video đa vai thật `multi_speaker_scene.mp4`, chụp ảnh GUI chứng minh cho PO nghiệm thu | Ảnh chụp thật `agent-team/test-output-audit-giong/ui2_studio_real_data.png` |
