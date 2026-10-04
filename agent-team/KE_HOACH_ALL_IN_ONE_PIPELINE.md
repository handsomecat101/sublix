# KE_HOACH_ALL_IN_ONE_PIPELINE.md — Kế Hoạch Hệ Thống Video AI Trọn Gói (Từ A Đến Z)

> **Tài liệu chiến lược & kiến trúc hệ thống dành cho toàn bộ Agent Team (Antigravity, Claude Code, Cursor, Codex) và Product Owner (Anh Tuấn - `jimmyvu`).**
> **Mục tiêu:** Xây dựng Tab Tải Video Đa Nền Tảng (Downloader) độc lập, đồng thời kết nối toàn bộ module hiện có thành **Siêu Hệ Thống Tự Động Hóa Từ A Đến Z: Tải Video → Tạo Phụ Đề → Dịch Thuật → Lồng Tiếng Đa Vai → Xuất Video Thành Phẩm**.

---

## 🌟 1. Tầm Nhìn Sản Phẩm (Product Vision)

Hiện tại, Sublix đã sở hữu các khối chức năng lõi cực mạnh:
1. **STT Whisper Large-v3-Turbo CUDA**: Bóc băng giọng nói siêu tốc trên GPU RTX 3090.
2. **Local Qwen 3-4B GPU (CUDA) & MiniMax-M3**: Biên kịch và dịch thuật theo cụm (Batch Translation ~0.1s/câu).
3. **Studio Lồng Tiếng AI Đa Vai (AI Dubbing)**: Diarization phân vai, Neural TTS đa giọng điệu, Audio Ducking & Demucs v4 tách nhạc nền.
4. **File Subtitle Studio**: Tạo phụ đề rời `.srt` đơn ngữ và song ngữ.

Tuy nhiên, người dùng hiện tại vẫn phải tự tải video từ ngoài (qua trình duyệt/IDM), tìm file trên ổ cứng rồi mới kéo thả vào app. 

### 🎯 Bước Nhảy Vọt Tiếp Theo:
Xây dựng một **Tab Tải Video Độc Lập** kết hợp **Bộ Điều Phối Quy Trình Tự Động (A-to-Z Pipeline Orchestrator)**:
* **Đầu vào duy nhất:** Người dùng chỉ cần dán 1 đường link (YouTube, TikTok, Douyin, Bilibili, Facebook, X/Twitter, Kuaishou, Xiaohongshu...).
* **Đầu ra hoàn chỉnh:** 
  - Hoặc 1 video kèm phụ đề Vietsub/Song ngữ.
  - Hoặc 1 video lồng tiếng đa vai chuẩn điện ảnh/thuyết minh.
  - Hoặc cả hai (video lồng tiếng có kèm phụ đề).
* Mọi công đoạn trung gian đều được tự động hóa xuyên suốt, có thể chọn chế độ **1-Click Tự Động Hoàn Toàn** hoặc **Chế Độ Chuyên Nghiệp (Kiểm duyệt kịch bản từng bước)**.

---

## 📋 2. Danh Sách Nền Tảng Hỗ Trợ Đầy Đủ

Hệ thống tận dụng engine `yt-dlp` (đã có sẵn trong máy tính của anh Tuấn tại `C:\Program Files\AI Automation\bin\yt-dlp.exe`) kết hợp cùng `ffmpeg.exe`.

### 🇨🇳 Nhóm 1: Hệ Sinh Thái Trung Quốc (Mỏ Vàng Nội Dung Kịch Ngắn, Anime, Review)
1. **Douyin (抖音)**: Video ngắn, đặc biệt là **Kịch ngắn (Mini Drama / Short Series)** đang cực kỳ viral. Tự động bóc tách và lồng tiếng tiếng Việt để đăng lại.
2. **Bilibili (哔哩哔哩)**: Video dài, anime, bài giảng, review công nghệ. Hỗ trợ bốc tách cả phụ đề gốc (CC) của tác giả.
3. **Kuaishou (快手)**: Tiểu phẩm hài, đời sống thực tế nông thôn, video ngắn dân dã.
4. **Xiaohongshu (小红书 - RED)**: Video review thời trang, mỹ phẩm, ẩm thực, phong cách sống.
5. **Weibo Video (微博)**: Video tin tức, phỏng vấn nghệ sĩ, hậu trường giải trí.
6. **Xigua Video (西瓜视频)**: Phim tài liệu ngắn, video khoa học đời sống 5-15 phút của ByteDance.
7. **iQiyi (爱奇艺) & Youku (优酷)**: Trích đoạn phim bộ, show truyền hình thực tế.
8. **Ximalaya (喜马拉雅)**: Audio sách nói, podcast, truyện audio (rất thích hợp cho chế độ Audio-Only Dubbing).

### 🌍 Nhóm 2: Các Nền Tảng Quốc Tế & Phổ Thông
1. **YouTube & YouTube Shorts**: Hỗ trợ mọi độ phân giải (từ 360p đến 4K), hỗ trợ trích xuất phụ đề tác giả có sẵn (Official Captions).
2. **TikTok (Quốc tế)**: Video dọc ngắn, chất lượng âm thanh gốc.
3. **Facebook & Facebook Reels**: Video bài đăng fanpage, video công khai.
4. **Instagram Reels & Video**: Clip sáng tạo, đời sống.
5. **X (Twitter)**: Video tin tức, clip thời sự nóng hổi.
6. **Reddit**: Tự động ghép luồng video và audio độc lập của Reddit thành file hoàn chỉnh.
7. **Twitch**: Clip tuyển chọn (Clips) và VODs phát lại của các streamer.

---

## 🏗️ 3. Thiết Kế Kiến Trúc 2 Tầng: Tab Riêng & Trục Pipeline Liên Kết

```
+---------------------------------------------------------------------------------------+
|                                    SUBLIX SUITE                                       |
+---------------------------------------------------------------------------------------+
|  [Tab 1: Live Sub]  |  [Tab 2: File Sub]  |  [Tab 3: AI Dubbing]  |  [Tab 4: Downloader] |
+---------------------------------------------------------------------------------------+
                                                                            |
                                                                            v
                                                       +-------------------------------+
                                                       |  🌐 TAB DOWNLOADER ĐỘC LẬP    |
                                                       |  - Dán Link (URL Input)       |
                                                       |  - Preview Thumbnail, Title   |
                                                       |  - Chọn Chất lượng (1080p, MP3)|
                                                       |  - Tải về & Quản lý file      |
                                                       +-------------------------------+
                                                                            |
                                          +---------------------------------+---------------------------------+
                                          | Chuyển tiếp 1-click             | Chuyển tiếp 1-click             |
                                          v                                 v                                 v
                              +-----------------------+         +-----------------------+         +-----------------------+
                              | 📝 CHUYỂN SANG        |         | 🎙️ CHUYỂN SANG        |         | 💾 CHỈ LƯU VỀ MÁY     |
                              | FILE SUB STUDIO       |         | DUBBING STUDIO        |         |                       |
                              | (Tạo phụ đề Vietsub)  |         | (Lồng tiếng đa vai)   |         | Mở thư mục Downloads  |
                              +-----------------------+         +-----------------------+         +-----------------------+
```

### Module A: Tab Riêng — "🌐 Trạm Tải Video Trực Tuyến (Media Downloader)"
* **Vị trí:** Một Tab độc lập trên Sidebar bên trái (cùng cấp với Phụ đề thời gian thực, Phụ đề tệp, Lồng tiếng AI).
* **Tính năng của Tab Downloader:**
  1. **Ô nhập URL thông minh (Smart URL Bar):**
     - Hỗ trợ nút `📋 Dán từ Clipboard`.
     - Tự động nhận diện Logo nền tảng (YouTube, Douyin, TikTok, Bilibili...) khi người dùng dán link.
  2. **Thẻ Xem Trước (Video Preview Card):**
     - Hiện tức thì sau 1 giây: Ảnh bìa (Thumbnail), Tên video, Kênh tác giả, Thời lượng, Dung lượng ước tính.
  3. **Bộ Lọc Định Dạng & Chất Lượng:**
     - `🎬 Video Chuẩn Nét (1080p / 720p MP4)`: Dành cho làm video hoàn chỉnh.
     - `⚡ Siêu Tốc: Chỉ Lấy Âm Thanh (Audio MP3 / M4A)`: Dung lượng nhẹ bằng 1/20, tải chỉ trong 3-5 giây, cực kỳ tối ưu cho các video podcast/thuyết trình chỉ cần lấy tiếng để dịch.
  4. **Thanh Tiến Trình Tải Thời Gian Thực:**
     - Hiển thị % tải, tốc độ mạng (`14.8 MB/s`), thời gian ước tính còn lại (`ETA 00:05`).
  5. **Bảng Danh Sách Đã Tải (Download Library):**
     - Quản lý lịch sử các video đã tải về máy, nút mở file, nút mở thư mục chứa, nút xoá.

---

### Module B: Trục Liên Kết Tự Động Hóa (A-to-Z Pipeline Orchestrator)

Sau khi video được tải về thành công, Tab Downloader sẽ cung cấp **3 Lối Thoát Chiến Lược (Strategic Gateways)**:

#### Gateway 1: Tạo Phụ Đề Ngay Lập Tức (To Subtitle Studio)
* **Luồng chạy:**
  1. Tự động kiểm tra: Nếu video YouTube/Bilibili **đã có phụ đề gốc (CC)** $\rightarrow$ Bốc trực tiếp file phụ đề đó về, bỏ qua bước Whisper STT!
  2. Nếu không có CC: Tự động nạp file vào Whisper Large-v3-Turbo CUDA bóc băng âm thanh.
  3. Đưa văn bản vào **Local Qwen 3 GPU (RTX 3090)** dịch theo cụm (Batching 15 câu/lần) trong ~10-20 giây.
  4. Xuất file phụ đề `.srt` (Vietsub hoặc Song ngữ) và hỗ trợ ghép cứng vào video.

#### Gateway 2: Lồng Tiếng Đa Vai Ngay Lập Tức (To AI Dubbing Studio)
* **Luồng chạy:**
  1. Tự động nạp video đã tải vào Studio Lồng Tiếng.
  2. Whisper trích xuất thoại + Thuật toán phân vai nhân vật (Speaker Diarization).
  3. Tự động ghép nối mệnh đề thoại (`clean_and_merge_raw_segments`) loại bỏ tạp âm.
  4. Local Qwen 3 biên kịch lời thoại sang tiếng Việt chuẩn văn phong điện ảnh/đối thoại.
  5. Chọn chế độ âm thanh:
     - Thuyết minh điện ảnh (Audio Ducking - tự động hạ nhạc nền khi có lời).
     - Chiếu rạp (Demucs v4 CUDA tách sạch giọng gốc, chỉ giữ lại BGM và tiếng động).
  6. Neural Voice sinh giọng lồng tiếng theo từng nhân vật $\rightarrow$ FFmpeg xuất video thành phẩm.

#### Gateway 3: Chế Độ 1-Click Tự Động Hoàn Toàn (Auto Mode)
* Dành cho nhà sáng tạo nội dung (Content Creator):
  - Người dùng dán link $\rightarrow$ Tích chọn *"Tự động lồng tiếng tiếng Việt & xuất video khi tải xong"*.
  - Người dùng có thể đi làm việc khác, Sublix sẽ chạy liên tục từ Tải $\rightarrow$ Dịch $\rightarrow$ Lồng tiếng $\rightarrow$ Xuất file thành phẩm ra thư mục định sẵn và rung chuông báo khi hoàn tất!

---

## 🛠️ 4. Phân Rã Kỹ Thuật (Technical Implementation Tasks)

### 📌 Nhóm 1: Tầng Backend Rust (`src-tauri/src/downloader/`)
- [ ] **`src-tauri/src/downloader/mod.rs`**:
  - `check_downloader_environment()`: Quét và xác nhận `yt-dlp.exe` và `ffmpeg.exe` sẵn sàng.
  - `probe_video_metadata(url: &str) -> Result<VideoMetadata>`: Chạy `yt-dlp -j --no-playlist <url>` lấy title, duration, thumbnail, formats, subtitles.
  - `download_media_stream(url, quality, audio_only, output_dir, app_handle) -> Result<PathBuf>`: Chạy tiến trình tải, phân tích regex stdout để bắn event `downloader:progress` (`percent`, `speed`, `eta`, `filesize`).
  - `fetch_native_subtitles(url, lang) -> Result<PathBuf>`: Tải file subtitle có sẵn (`.vtt`/`.srt`).
  - `cancel_download()`: Cho phép dừng tiến trình tải ngay lập tức nếu người dùng đổi ý.
- [ ] **Đăng ký Tauri Commands** trong `src-tauri/src/lib.rs`:
  - `downloader_probe_info`, `downloader_download_file`, `downloader_cancel`.

### 📌 Nhóm 2: Tầng Giao Diện Người Dùng (Frontend React TS)
- [ ] **`src/views/DownloaderView.tsx` & `.css`**:
  - Thiết kế UI hiện đại, kính mờ (Glassmorphism), đồng bộ với thiết kế của Dubbing Studio và File Subview.
  - Thanh nhập link bo góc lớn, icon tự nhận diện nền tảng (YouTube, Douyin, TikTok...).
  - Thẻ Card Preview video với thông tin chi tiết.
  - Nút bấm điều hướng: `🚀 Tải & Tạo Phụ Đề Ngay` vs `🎙️ Tải & Lồng Tiếng Ngay`.
- [ ] **Tích hợp vào Sidebar Navigation (`src/App.tsx`)**:
  - Thêm mục menu: `🌐 Tải Video (Downloader)` với icon `📥` hoặc `🌐`.
- [ ] **Hệ thống truyền State giữa các Tab (Navigation Bridge)**:
  - Cho phép Tab Downloader tải xong thì tự động switch sang Tab `FileSub` hoặc `DubbingStudio` kèm theo đường dẫn tệp vừa tải (`initialFilePath`).

### 📌 Nhóm 3: Kiểm Thử & Tối Ưu Nền Tảng Trung Quốc
- [ ] Kiểm thử tải kịch ngắn Douyin (抖音) không watermark.
- [ ] Kiểm thử video dài Bilibili (哔哩哔哩) và trích xuất phụ đề tiếng Trung có sẵn.
- [ ] Kiểm thử YouTube Shorts và YouTube video dài 1080p.
- [ ] Kiểm thử TikTok video dọc (9:16) và xuất video lồng tiếng vừa vặn khung hình dọc.

---

## 🔒 5. Quyết Định Thiết Kế Đã Chốt (Decisions Locked - Anh Tuấn Duyệt 2026-10-04)

Hội ý với Product Owner (Anh Tuấn) đã chốt các định hướng kiến trúc cụ thể như sau:

| Quyết định | Nội dung đã chốt | Ghi chú lộ trình (Phases) |
| :--- | :--- | :--- |
| **1. Thư mục tải về (Storage Scope)** | **Lưu trong phạm vi nội bộ của phần mềm** (`%APPDATA%/com.sublix.desktop/downloads`). Tránh xả rác ra ổ đĩa cá nhân của người dùng khi đang phát triển. | **Phase 1 (Hiện tại):** Lưu nội bộ ngầm.<br>**Phase 2 (Public Release):** Mở thêm nút chọn thư mục tùy ý (Custom Folder Picker). |
| **2. Cookie Trình duyệt (High Quality Douyin/Bilibili)** | **Có tích hợp cookie đăng nhập** để cẩu video độ nét cao nhất (1080p/4K) từ các nền tảng Trung Quốc (Douyin, Bilibili) và YouTube. | Hỗ trợ tự động trích xuất cookie từ Edge / Chrome (`--cookies-from-browser edge`) giúp video nét căng không bị bóp băng thông. |
| **3. Phụ đề rời vs Ghép chữ (Hardsub)** | **Trước mắt (Phase 1):** Tập trung xuất video gốc kèm file phụ đề rời `.srt` (Vietsub / Song ngữ) chuẩn timing.<br>**Nâng cao (Phase 2):** Nghiên cứu FFmpeg Burn-in Hardsub (ghép chữ cứng trực tiếp lên khung hình video). | **Phase 1:** File `.srt` rời chuẩn UTF-8.<br>**Phase 2:** FFmpeg Video Filter (`subtitles=...`) tùy chỉnh font chữ, màu sắc, viền bóng. |

---

## 🚀 6. Phân Kỳ Phát Triển (Phase Roadmap)

### 🟢 Phase 1: MVP Trọn Gói Tải & Dịch Video (Triển khai ngay)
1. Backend Rust `downloader/mod.rs` bọc `yt-dlp.exe` có sẵn, tải video/audio về cache nội bộ app.
2. Hỗ trợ cơ chế Cookie từ trình duyệt (`--cookies-from-browser`).
3. Giao diện Tab `DownloaderView.tsx`: Ô dán link thông minh, xem trước Thumbnail, chọn chất lượng (1080p / 720p / Audio MP3).
4. Cầu nối tự động:
   - Tải xong $\rightarrow$ Chuyển sang **File Sub** (tạo file `.srt` Vietsub).
   - Tải xong $\rightarrow$ Chuyển sang **AI Dubbing** (lồng tiếng đa vai, audio ducking / demucs).

### 🟡 Phase 2: Bản Nâng Cao (Advanced Video Studio)
1. **FFmpeg Burn-in Hardsub:** Ghép chữ cứng trực tiếp lên video với tùy chọn phong cách (Màu vàng rạp chiếu, viền đen, font chữ điện ảnh, vị trí canh lề).
2. **Bộ chọn thư mục xuất bản:** Cho phép người dùng tùy chọn lưu ra Desktop / Thư mục tải về riêng khi public ra cộng đồng.
3. **Batch Downloader Queue:** Tải hàng loạt danh sách video / toàn bộ playlist hoặc kênh TikTok/Douyin.

---

*Tài liệu được cập nhật bởi **Antigravity** — Đã khóa các quyết định của Product Owner để Agent Team thực thi.*

