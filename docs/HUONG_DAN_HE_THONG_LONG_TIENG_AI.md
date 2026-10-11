# Hướng Dẫn Kỹ Thuật & Vận Hành Hệ Thống Lồng Tiếng AI (AI Dubbing Studio)

> **Mã tài liệu:** MAN-2026-DUB-01  
> **Dự án:** Sublix Desktop (`v0.11.29+`)  
> **Tác giả:** Antigravity AI & Anh Tuấn (`handsomecat101`)  
> **Ngày cập nhật:** 2026-10-12  
> **Kho mã nguồn:** [https://github.com/handsomecat101/sublix](https://github.com/handsomecat101/sublix)  
> **Mục tiêu:** Tài liệu tra cứu chi tiết và hướng dẫn kỹ thuật cho các kỹ sư, cộng tác viên và các AI Agent (Antigravity, Claude Code, Cursor, Codex) khi tiếp nhận, mở rộng hoặc bảo trì hệ thống lồng tiếng AI.

---

## 1. Tổng Quan Kiến Trúc (Architecture Overview)

Hệ thống **AI Dubbing Studio** trong Sublix là giải pháp khép kín kết hợp giữa **Rust (Tauri Core)** và **React (Frontend)** để tự động hóa hoàn toàn quy trình lồng tiếng phim đa vai:

```
[Video / Audio Gốc]
         │
         ▼ (FFmpeg 16kHz WAV Extraction)
   [Audio Mono WAV]
         │
         ▼ (Whisper Large-v3-Turbo CUDA)
  [Phụ Đề Kèm Timestamp]
         │
         ▼ (Diarization Clustering)
 [Phân Vai: Speaker 0, 1, 2...]
         │
         ▼ (MiniMax-M3 / Ollama 27B)
 [Kịch Bản Dịch Điện Ảnh Khớp Nhịp]
         │
         ▼ (Edge-TTS / Kokoro ONNX)
[Tạo Audio Lồng Tiếng Từng Vai]
         │
         ▼ (FFmpeg atempo Time-Stretching)
[Khớp Khẩu Hình & Thời Lượng Gốc]
         │
         ├──────────────────────────────────────────┐
         ▼ (Chế độ 1: Ducking)                      ▼ (Chế độ 2: Demucs CUDA)
  [Dìm tiếng gốc 25%]                        [Xóa 100% giọng gốc, giữ BGM]
         │                                          │
         └────────────────────┬─────────────────────┘
                              ▼ (FFmpeg Remuxing)
                 🎬 [VIDEO THÀNH PHẨM HOÀN CHỈNH]
```

---

## 2. Chi Tiết Khâu Chọn Voice & Model Voice (Voice Models & Selection)

### 2.1 Cấu Trúc Dữ Liệu (Rust & TypeScript Data Models)

Hệ thống định nghĩa các cấu trúc dữ liệu cốt lõi trong `src-tauri/src/dubbing/mod.rs` và `src/lib/tauri.ts`:

```rust
// Định nghĩa một mẫu giọng trong Preset
pub struct VoicePreset {
    pub id: String,          // e.g. "vi-VN-NamMinhNeural"
    pub name: String,        // e.g. "Nam Minh (Nam Điện Ảnh - Trầm Ấm)"
    pub gender: String,      // "male" | "female"
    pub lang: String,        // "vi" | "en" | "ja" | "zh" | "ko"
    pub description: String, // Mô tả phong cách diễn đọc
}

// Thông tin gán giọng cho từng vai diễn
pub struct DubbingSpeaker {
    pub id: String,          // e.g. "speaker_0", "speaker_1"
    pub label: String,       // Tên hiển thị: "Người nói 1 (Nam)"
    pub voice: String,       // ID giọng được gán từ VoicePreset
    pub pitch: String,       // Cao độ ("+0Hz", "-5Hz", "+10Hz")
    pub rate: String,        // Tốc độ đọc ("+0%", "+10%", "-5%")
}

// Dự án lồng tiếng tổng thể
pub struct DubbingProject {
    pub input_path: String,
    pub media_duration_sec: f64,
    pub speakers: Vec<DubbingSpeaker>,
    pub segments: Vec<DubbingSegment>,
    pub bgm_volume: f32,       // Tỷ lệ âm lượng nhạc nền (mặc định 0.25)
    pub voice_volume: f32,     // Tỷ lệ tăng âm lượng giọng đọc (mặc định 1.30)
    pub dubbing_mode: String,  // "ducking" | "vocal_isolation"
}
```

### 2.2 Danh Sách Giọng Preset Có Sẵn (Built-in Voice Presets)

Hiện tại hệ thống cung cấp sẵn các giọng Neural chuẩn cao cấp qua hàm `get_preset_voices()`:

| Voice ID | Giới tính | Ngôn ngữ | Đặc điểm & Phù hợp |
| :--- | :--- | :--- | :--- |
| `vi-VN-NamMinhNeural` | Nam | Tiếng Việt | Trầm ấm, truyền cảm. Chuẩn phim hành động, tài liệu, vai nam chính. |
| `vi-VN-HoaiMyNeural` | Nữ | Tiếng Việt | Nhẹ nhàng, tự nhiên, cảm xúc. Chuẩn phim tình cảm, vai nữ chính. |
| `en-US-GuyNeural` | Nam | Tiếng Anh | Trầm, chuẩn điện ảnh Hollywood, phóng sự Mỹ. |
| `en-US-JennyNeural` | Nữ | Tiếng Anh | Biểu cảm cao, rõ ràng, hoạt hình/drama. |
| `ja-JP-KeitaNeural` | Nam | Tiếng Nhật | Trẻ trung, tự nhiên, thích hợp Anime & phim Nhật. |
| `ja-JP-NanamiNeural` | Nữ | Tiếng Nhật | Dịu dàng, giàu cảm xúc Anime/J-Drama. |
| `zh-CN-YunxiNeural` | Nam | Tiếng Trung | Ấm áp, chuẩn phim cổ trang & hiện đại Trung Quốc. |
| `zh-CN-XiaoxiaoNeural` | Nữ | Tiếng Trung | Diễn cảm đa sắc thái, phim truyền hình Trung Quốc. |

### 2.3 Cơ Chế Gán Giọng Tự Động (Automatic Speaker Casting)

Khi chạy `dubbing_analyze`:
1. Whisper STT chép lời và phân tách các lượt nói (turn-taking).
2. Hệ thống phân cụm thành $N$ vai diễn (`speaker_0`, `speaker_1`,...).
3. Gán tự động luân phiên:
   - Vai 0 (`speaker_0`) ➔ Mặc định gán `vi-VN-NamMinhNeural` (Nam).
   - Vai 1 (`speaker_1`) ➔ Mặc định gán `vi-VN-HoaiMyNeural` (Nữ).
   - Các vai tiếp theo được xoay vòng hoặc người dùng có thể đổi bất kỳ lúc nào trên UI Studio.

### 2.4 Cơ Chế Nghe Thử 1-Click (Instant Audio Preview)

* **Vấn đề cần giải quyết:** Người dùng muốn nghe thử giọng đọc của từng câu sau khi dịch hoặc sửa text mà không cần load lại trang hay xuất cả bộ phim.
* **Giải pháp kỹ thuật (`dubbing_preview_tts`):**
  1. Rust nhận `text`, `voice`, `rate`, `pitch`.
  2. Tạo file MP3 tạm thời trong `%TEMP%\sublix_dubbing\preview_<id>.mp3`.
  3. Đọc dữ liệu nhị phân và mã hóa thành chuỗi `base64`.
  4. Trả về Data URI `data:audio/mp3;base64,...`.
  5. React cập nhật thẻ `<audio>` ngầm và gọi `play()`. Độ trễ chỉ ~300ms, nghe ngay lập tức!

### 2.5 Lộ Trình Nâng Cấp Voice Models Tiếp Theo

1. **Kokoro-Vietnamese ONNX (`iamdinhthuan/Kokoro-Vietnamese`):**
   - Chạy hoàn toàn offline bằng ONNX Runtime C++/Rust.
   - Dung lượng chỉ ~82MB, không cần kết nối mạng.
2. **F5-TTS Vietnamese / Viterbox Zero-Shot Voice Cloning:**
   - Cắt 5-10 giây mẫu giọng diễn viên ngoại quốc từ video gốc.
   - Bơm vào model F5-TTS để sinh giọng tiếng Việt nhưng **mang đúng âm sắc, tông giọng khàn/trong** của chính diễn viên nước ngoài đó!

---

## 3. Chi Tiết Khâu Tách Âm Thanh: Thuyết Minh vs Lồng Tiếng Chiếu Rạp

Người dùng có thể chọn 1 trong 2 chế độ xử lý âm thanh tùy theo thể loại nội dung:

### Chế độ 1: 🎙️ Thuyết Minh (Audio Ducking)
* **Nguyên lý:** Giữ nguyên track âm thanh gốc. Khi đến đoạn nhân vật nói, FFmpeg dùng bộ lọc `amix` và `volume` để hạ âm thanh gốc xuống mức `bgm_volume` (mặc định 0.25 hay 25%), đồng thời đẩy track tiếng Việt lên `voice_volume` (1.30 hay 130%).
* **Ưu điểm:** Tốc độ render cực nhanh (chỉ mất vài giây), không tốn tài nguyên GPU bóc tách âm.
* **Sử dụng cho:** Phóng sự, phim tài liệu, bài giảng, video review tóm tắt phim YouTube/TikTok.

### Chế độ 2: 🎭 Lồng Tiếng Chiếu Rạp (Demucs AI Vocal Isolation)
* **Nguyên lý:** Gọi mô hình AI **Demucs v4** (kiến trúc Hybrid Transformer Demucs - `htdemucs`) chạy tăng tốc trên CUDA:
  ```bash
  python -m demucs.separate --two-stems vocals -d cuda -o <out_dir> <input_media>
  ```
* Hệ thống trích xuất track `no_vocals.wav` (chứa 100% nhạc nền BGM, tiếng động môi trường, bước chân, súng nổ SFX) và **vứt bỏ hoàn toàn track `vocals.wav` gốc**.
* Sau đó ghép trực tiếp các câu thoại tiếng Việt mới vào track nhạc nền sạch.
* **Ưu điểm:** Loại bỏ triệt để 100% giọng nước ngoài của diễn viên, tạo trải nghiệm điện ảnh chuẩn chiếu rạp như phim rạp CGV hay Disney/Pixar.
* **Sử dụng cho:** Phim điện ảnh, phim truyền hình dài tập, anime, sitcom.

---

## 4. Chi Tiết Khâu LLM Biên Kịch Điện Ảnh (MiniMax-M3)

Khâu biên kịch quyết định chất lượng phim. Nếu dịch bám chữ thô thiển thì diễn viên nhép miệng 2 giây nhưng câu tiếng Việt đọc mất 5 giây sẽ làm vỡ nát nhịp phim.

### 4.1 Cấu Hình API Gateway & Token Plan
* **API Key:** Dạng Coding Plan / Token Plan bắt đầu bằng `sk-cp-...`.
* **Cổng Gateway Bắt Buộc:** `https://api.minimax.io/v1/chat/completions` (Không dùng `api.minimax.chat` vì sẽ bị từ chối 401).
* **Model:** `MiniMax-M3`.
* **Cờ Reasoning Split:** Gửi `"reasoning_split": true` trong body JSON để MiniMax tách suy luận nội tâm vào `reasoning_content`, giúp `content` chỉ chứa kịch bản sạch sẽ.
* **Regex Lọc Thẻ Suy Luận:**
  ```rust
  let re = Regex::new(r"(?s)<think>.*?</think>").unwrap();
  let clean_text = re.replace_all(&raw_text, "").trim().to_string();
  ```

### 4.2 Kỹ Thuật Khống Chế Âm Tiết (Lip-Sync Prompting)
LLM được nạp prompt đặc thù ép số âm tiết tiếng Việt phải tương ứng với độ dài giây của câu gốc:
* Tốc độ nói tiếng Việt tự nhiên: ~3 đến 4 âm tiết / giây.
* Nếu câu gốc dài 2.0s, số âm tiết tiếng Việt tối đa là: $\text{Max Syllables} = \text{round}(2.0 \times 3.5) = 7$ từ.
* LLM tự động cô đọng ý tứ sao cho vừa tròn câu, giàu cảm xúc mà không thừa từ gây hụt hơi.

---

## 5. Chi Tiết Khâu Khớp Nhịp (Time-Stretching) & Xuất Video (FFmpeg)

### 5.1 Cân Chỉnh Thời Lượng (Time-Stretching via atempo)
Khi file âm thanh lồng tiếng được sinh ra:
1. Trích xuất độ dài thực tế: $\text{actual\_duration}$.
2. So sánh với khoảng thời gian cho phép trong video: $\text{target\_duration} = \text{end\_sec} - \text{start\_sec}$.
3. Tính tỷ lệ tốc độ cần điều chỉnh:
   $$\text{speed\_ratio} = \frac{\text{actual\_duration}}{\text{target\_duration}}$$
4. Nếu $\text{speed\_ratio} \in [0.75, 1.35]$, áp dụng bộ lọc FFmpeg `atempo`:
   ```bash
   ffmpeg -i speech.mp3 -filter:a "atempo={speed_ratio}" -y speech_stretched.wav
   ```
   *Kỹ thuật `atempo` giữ nguyên cao độ (pitch), không làm biến dạng giọng đọc thành "giọng chuột sóc" hay "giọng quái vật".*

### 5.2 Hòa Trộn Âm Thanh & Remux Video
Hệ thống sử dụng bộ lọc phức hợp FFmpeg:
```bash
ffmpeg -y -i input_video.mp4 \
  -i seg_0.wav -i seg_1.wav ... \
  -i isolated_bgm.wav \
  -filter_complex "[1:a]adelay=1200|1200[a1]; [2:a]adelay=4500|4500[a2]; ... [a1][a2]amix=inputs=2[speech]; [bgm_input]volume=1.0[bgm]; [bgm][speech]amix=inputs=2[final_audio]" \
  -map 0:v -map "[final_audio]" -c:v copy -c:a aac -b:a 256k output_dubbed.mp4
```
* Cờ `-c:v copy` giữ nguyên 100% chất lượng hình ảnh gốc và render video siêu tốc mà không cần re-encode hình ảnh!

---

## 6. Bản Đồ Mã Nguồn & Các File Liên Quan (Codebase Reference)

| File | Ngôn ngữ | Vai trò chính |
| :--- | :--- | :--- |
| `src-tauri/src/dubbing/mod.rs` | Rust | Trái tim xử lý: Diarization, MiniMax API client, Edge-TTS synthesis, FFmpeg atempo & Demucs isolation. |
| `src-tauri/src/lib.rs` | Rust | Đăng ký 5 lệnh Tauri IPC (`dubbing_pick_media_file`, `dubbing_get_voices`, `dubbing_analyze`, `dubbing_preview_tts`, `dubbing_export`). |
| `src/lib/tauri.ts` | TypeScript | Định nghĩa TypeScript types (`DubbingProject`, `DubbingSpeaker`, `VoicePreset`) và hàm gọi IPC. |
| `src/views/DubbingStudioView.tsx` | React / TSX | Giao diện Studio: chọn file, chọn vai, chọn mode (Ducking vs Demucs), bảng kịch bản thoại & nghe thử. |
| `src/views/DubbingStudioView.css` | CSS | Toàn bộ style giao diện Studio: thẻ card, hiệu ứng active tím/xanh, thanh trượt slider, responsive table. |
| `src/views/SettingsView.tsx` | React / TSX | Thêm tab chuyển hướng vào Sidebar và cấu hình API Key MiniMax / Ollama. |
| `agent-team/PROJECT_STATE.md` | Markdown | Bảng điều phối trạng thái task theo chuẩn Collaborator Kit v1.1. |
| `agent-team/AGENT_CHAT.md` | Markdown | Bảng bàn giao ca trực đa Agent (Rolling Handoff Board). |

---

## 7. Hướng Dẫn Vận Hành Cho Kỹ Sư / Agent Kế Nhiệm

### 7.1 Cách Thêm Giọng Đọc (Voice) Mới
Khi muốn bổ sung một giọng đọc mới vào danh sách lựa chọn:
1. Mở file `src-tauri/src/dubbing/mod.rs`.
2. Tìm đến hàm `get_preset_voices()`.
3. Thêm một mục `VoicePreset` vào vector:
   ```rust
   VoicePreset {
       id: "vi-VN-VoiceMoiNeural".to_string(),
       name: "Tên Hiển Thị (Mô tả phong cách)".to_string(),
       gender: "male".to_string(), // hoặc "female"
       lang: "vi".to_string(),
       description: "Mô tả chất giọng...".to_string(),
   }
   ```
4. Chạy `npm run build` và test thử bằng nút **Nghe Thử**.

### 7.2 Cách Kiểm Tra & Build Bản Phát Hành
* **Kiểm tra Frontend:**
  ```powershell
  npm run build
  ```
* **Kiểm tra Backend Rust:**
  ```powershell
  $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
  cargo check --manifest-path src-tauri/Cargo.toml
  ```
* **Biên dịch Release Binary (`sublix.exe`):**
  ```powershell
  # Lưu ý tắt tiến trình sublix.exe đang chạy trước khi build để tránh lỗi file lock:
  Get-Process "*sublix*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
  npx tauri build --no-bundle
  ```
  File thành phẩm xuất hiện tại: `H:\AI Project\sublix\src-tauri\target\release\sublix.exe`.

---

## 8. Cấu Trúc Sublix Studio Mới (2 Khối Độc Lập & Timeline Premiere)

Từ phiên bản `v0.11.29` (Rounds 10–14), Sublix Studio (`SublixStudioView.tsx`) được tái cấu trúc triệt để theo tiêu chuẩn dựng phim chuyên nghiệp:

### 8.1 Hai Khối Độc Lập Ở Cột Trái (Left Sidebar)
1. **💬 Khối 1: Phụ Đề & Dịch Thuật:**
   - Quản lý bóc tách giọng nói Whisper STT (GPU Large-v3-Turbo / Tiny / Base).
   - Tùy chọn dịch thuật độc lập (bật/tắt dịch, chọn ngôn ngữ đích, nhà cung cấp DeepSeek / MiniMax / OpenRouter / Ollama, từ điển Glossary).
   - Nút hành động cục bộ: `💬 Chỉ Tạo Phụ Đề (+ Dịch)`.
2. **🎙️ Khối 2: Lồng Tiếng & Phân Vai:**
   - Quản lý danh sách nhân vật (Speaker Roster).
   - Hỗ trợ đầy đủ các Voice Engine: **Kokoro ONNX Offline (14 giọng)**, **VietNeu TTS (NeuTTS-Air AI: 4 giọng Bắc/Nam)**, và **Edge-TTS Neural**.
   - Nút hành động cục bộ: `🎙️ Chỉ Chạy Lồng Tiếng (TTS)`.

### 8.2 Cơ Chế Tiến Trình Thông Minh (Dynamic AI Progress HUD Banner)
Hệ thống tự động thay đổi banner tiến trình phía trên video theo đúng tùy chọn người dùng:
- **Chỉ Phụ Đề gốc:** Hiển thị 3 bước (`Audio WAV ➔ Whisper STT ➔ Timeline Sub`). **Tuyệt đối không chạy phân vai Sherpa AI**; tự động gom toàn bộ câu thoại vào 1 track phụ đề chuẩn xác (`speaker_0`).
- **Chỉ Phụ Đề + Dịch:** Hiển thị 4 bước (`Audio WAV ➔ Whisper STT ➔ Dịch Phụ Đề ➔ Timeline Sub`). Tự động nối chuỗi STT sang Dịch kịch bản đồng bộ.
- **Chỉ Lồng Tiếng:** Hiển thị 3 bước (`Phân Vai ➔ Tổng Hợp TTS ➔ Đồng Bộ Timeline`).
- **Toàn Trình:** Hiển thị 5 bước đầy đủ khi bật cả 2 khối.

### 8.3 Thao Tác Timeline Chuẩn Premiere Pro
- **Kéo mở rộng chiều cao Timeline:** Thanh resizer nằm giữa khung video và timeline, hỗ trợ kéo mở rộng từ 180px lên đến 1200px, tự động lưu vào `localStorage`.
- **Marquee Box Selection:** Giữ chuột trái trên timeline kéo quét vùng chữ nhật để chọn nhiều block thoại cùng lúc.
- **Phím tắt toàn cục:**
  - `Space`: Phát / Tạm dừng video (khi không gõ text trong ô input).
  - `Delete` hoặc `Backspace`: Xóa toàn bộ các block phụ đề đang được chọn (kèm lưu lịch sử Undo).
- **Xóa cả track (Clear Track):** Biểu tượng thùng rác trên header từng track để xóa nhanh toàn bộ item trên track đó.

---

## 9. Các Cải Tiến Đột Phá & Chuẩn Hóa Vận Hành Mới Nhất (Sessions 26, 27, 28)

Được phát triển và tối ưu trực tiếp theo phản hồi thực tế từ Product Owner (Anh Tuấn) trong các phiên làm việc chuyên sâu ngày 11 và 12 tháng 10 năm 2026:

### 9.1 Phân Loại & Index Độc Quyền Giọng Đọc Theo Từng Model TTS AI (Session 26)
* **Vấn đề trước đây:** Dropdown chọn giọng của từng nhân vật hiển thị dồn đống tất cả các giọng của mọi mô hình (hàng chục giọng từ VietNeu, Kokoro đến Edge), gây rối rắm và nhầm lẫn cho người dùng.
* **Kiến trúc Từ điển Metadata `TTS_ENGINE_MODELS`:**
  - Chuẩn hóa kiểu dữ liệu mô hình: `TtsEngineKey = "vietneu" | "kokoro" | "edge"` (loại bỏ tùy chọn `"all"` gây xung đột).
  - **VietNeu TTS AI:** 6 giọng Neural biểu cảm cao (`vi_bac_nam`, `vi_bac_nu`, `vi_nam_nam`, `vi_nam_nu`, `vi_hue_nu`, `vi_bac_thoisu`).
  - **Kokoro-Vietnamese Local 82M:** 14 giọng ONNX offline 100% (`tuan_ngoc`, `manh_dung`, `hung_thinh`, `phat_tai`, `thanh_dat`, `duc_an`, `duc_duy`, `mai_linh`, `ngoc_huyen`, `diem_trinh`, `mai_loan`, `my_yen`, `thuc_trinh`, `storyvert` — 100% có sẵn file mẫu `.wav` thực tế tại `models/voice/kokoro-vi/samples/`).
  - **Edge-TTS Cloud:** 6 giọng Microsoft Azure Neural chất lượng cao (`vi-VN-NamMinhNeural`, `vi-VN-HoaiMyNeural`, `en-US-AndrewNeural`, `en-US-AvaNeural`, `zh-CN-YunxiNeural`, `ja-JP-KeitaNeural`).
* **Lọc độc quyền (Exclusive Dropdown Filter):**
  - Khi người dùng chọn Model nào, dropdown của mọi vai diễn **chỉ hiển thị duy nhất danh sách giọng thuộc model đó**.
  - Khi người dùng đổi Model (ví dụ từ Edge sang Kokoro), hệ thống tự động ánh xạ lại giọng (auto re-mapping) tương ứng với giới tính của vai (`defaultMaleVoice` hoặc `defaultFemaleVoice` của Model mới), không bao giờ bị lệch giọng hay rỗng giá trị.
* **Cơ chế Nghe Thử Mẫu Tiêu Biểu (Sample Preview):**
  - Nút `▶️ Mẫu` tích hợp trực tiếp trên từng nút chọn Model và nút to `▶️ Nghe Thử Mẫu Tiêu Biểu (${model.name})` trong bảng đặc tả kỹ thuật.
  - Hỗ trợ phát file `.wav` mẫu thật với độ trễ 0ms (đối với Kokoro) hoặc gọi IPC synthesis tức thì (VietNeu, Edge-TTS).
  - Nút tự động chuyển trạng thái `⏹ Dừng` kèm hiệu ứng nhịp sóng dạ quang (`studio-tts-pulse`) khi đang phát, bấm lại sẽ ngắt ngay lập tức và quản lý audio ref để không bao giờ bị phát đè tiếng.

### 9.2 Khắc Phục Lỗi 4 Track Đè Nhau & Tối Ưu Cấp Phần Cứng Timeline 300+ Câu Thoại (Session 27)
* **Vấn đề trên video dài (25+ phút, 323 câu thoại):**
  - AI Diarization quét video phát hiện nhiều cụm âm học, tự động bung 4 track tiếng lồng riêng biệt xếp chồng lên nhau thành 7 lane chiếm kín màn hình.
  - Khi bấm Play hoặc tua video, màn hình giật cục, CPU 100% và **bị treo cứng ứng dụng** (freeze WebView2 main thread) do re-render 2,584 thẻ DOM và serialize JSON 10MB vào LocalStorage liên tục.
* **Giải pháp 1-Click "Về 1 Vai (Thuyết Minh Độc Thoại)" (`handleQuickMergeToOneRole`):**
  - Tự động gộp toàn bộ 323 câu thoại về `speakers[0]` ("Thuyết minh AI").
  - Xóa sạch các track dư thừa, đưa `expectedSpeakerCount` về 1 và tự động kích hoạt chế độ gộp track (`collapseSpeakerTracks`).
  - Bổ sung nút bấm `👤 Về 1 vai` trên toolbar và gán hành động này vào nút chip `[👤 1 Người ⭐]` để dọn sạch timeline chỉ với 1 click.
* **Tối Ưu Hóa Cấp Phần Cứng Cho Playhead & Timecode (Hardware-Accelerated Playback):**
  - **Direct DOM Manipulation (60fps):** Cập nhật tọa độ con trỏ timeline (`playheadElementRef.style.left`) và đồng hồ thời gian (`timecodeElementRef.textContent`) trực tiếp trên DOM, không kích hoạt React re-render.
  - **Throttling React Diffing xuống 120ms (~8fps):** Giảm hơn 90% tần suất gọi Virtual DOM diffing trên cây 323 block timeline, giúp playback mượt như nhung.
  - **Loại bỏ 2,584 thẻ `<span>` DOM:** Thay thế 8 thẻ span con trong mỗi block thoại bằng 1 thẻ rỗng có background CSS texture (`repeating-linear-gradient` kết hợp `mask-image`), giảm tải DOM về 0%.
  - **Kích hoạt Virtualization với `content-visibility: auto`:** Trình duyệt WebView2 tự động bỏ qua tính toán layout và paint đối với các block nằm ngoài khung nhìn cuộn ngang.
  - **Tinh gọn LocalStorage:** Loại bỏ mảng Base64 filmstrip và `currentTime` khỏi auto-save, đưa kích thước lưu trữ từ 10MB xuống dưới 50KB với debounce 1200ms.

### 9.3 Tách Rời Hoàn Toàn Quy Trình 2 Bước: Quét & Phân Vai Trước ➔ Lồng Tiếng Sau (Session 28)
* **Vấn đề trước đây:** Bấm phân tích là AI tự động chạy từ A đến Z, tự phân vai rồi tự tổng hợp lồng tiếng luôn. Người dùng bị đặt vào thế "tù mù", không được xem trước AI đã chia kịch bản như thế nào, có bao nhiêu vai, câu nào của ai.
* **Quy trình chuẩn hóa 2 bước độc lập:**
  1. **Bước 1: Quét & Phân Vai Trước (`dubImmediately: false`, `hasAudio: false`):**
     - Chạy Whisper STT bóc phụ đề + Sherpa AI Diarization nhận diện người nói + Dịch thuật điện ảnh.
     - Dữ liệu hiển thị lên Timeline với track phụ đề phân màu theo vai diễn, hoàn toàn **chưa sinh file lồng tiếng**.
     - Người dùng tự do: Nghe lại giọng gốc, đọc lại kịch bản dịch, chỉnh sửa text, đổi vai, gán lại giới tính, chọn Model TTS mong muốn.
  2. **Bước 2: Bắt Đầu Lồng Tiếng (TTS):**
     - Nút nổi bật: `🎙️ Bước 2: Bắt Đầu Lồng Tiếng TTS (${speakers.length} vai)` (hiển thị cả ở thẻ Phân vai lẫn Action Hub).
     - Chỉ khi người dùng bấm nút này, hệ thống mới gửi toàn bộ phân vai và câu thoại sang engine TTS để sinh audio và vẽ track tiếng lồng.
  3. **Tùy chọn toàn trình:** Vẫn duy trì nút `⚡ Chạy Tự Động Toàn Trình (A ➔ Z)` dành cho trường hợp người dùng muốn xuất nhanh không cần can thiệp.

### 9.4 Presets Tổ Hợp Giới Tính 2 Vai & Nút Toggle Giới Tính 1 Chạm (Session 28)
* **Presets 2 Vai Nhanh:** Khi số lượng vai là 2, hệ thống cung cấp 3 nút chọn cơ cấu giới tính 1 chạm:
  - `👨‍🦱👩 1 Nam & 1 Nữ ⭐`: Chuẩn đối thoại nam nữ (Vai 1 là Nam, Vai 2 là Nữ).
  - `👨‍🦱👨‍🦱 2 Nam`: Cả 2 vai đều là Nam (tự động phân bổ 2 giọng nam khác nhau của Model đang chọn).
  - `👩👩 2 Nữ`: Cả 2 vai đều là Nữ (tự động phân bổ 2 giọng nữ khác nhau của Model đang chọn).
* **Nút Toggle Giới Tính Trên Từng Vai (`handleToggleSpeakerGender`):**
  - Mỗi thẻ vai diễn có nút badge `[👨 Nam]` (nền xanh dương) hoặc `[👩 Nữ]` (nền hồng).
  - Nhấp chuột là lật giới tính ngay lập tức, dropdown tự động nhảy sang giọng nam/nữ đầu tiên của Model tương ứng.

### 9.5 Bảng Chỉ Báo HUD Trực Quan (Active TTS HUD) (Session 28)
* Phía trên danh sách phân vai bổ sung bảng chỉ báo HUD kính mờ dạ quang (`.studio-active-tts-hud`):
  - Hiển thị rõ tên Model TTS đang kích hoạt kèm badge trạng thái (Local Offline vs Cloud).
  - Thống kê tổng số lượng giọng khả dụng của model.
  - Liệt kê chi tiết từng vai: Icon giới tính, tên vai, số lượng câu thoại và tên giọng AI cụ thể đang phụ trách (VD: `Vai 1: 👨 Nam • Nam Bắc (180 câu)` | `Vai 2: 👩 Nữ • Nữ Nam (143 câu)`).

