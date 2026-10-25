# Báo Cáo Khảo Sát & Đề Xuất Ý Tưởng Tính Năng Mới Cho Sublix (2026)

> **Mã tài liệu:** SPEC-2026-FEAT-IDEAS  
> **Dự án:** Sublix Desktop (Tauri v2 + Rust + React 19 + Local-First Architecture)  
> **Mục tiêu:** Khảo sát các sản phẩm dẫn đầu thị trường (CapCut, Jianying, ElevenLabs, Descript, HeyGen, UVR5), phân tích "nỗi đau" thực tế của cộng đồng làm nội dung/reup/dịch video tại Việt Nam, và đề xuất **Top 10 tính năng đột phá** có tỷ lệ (Giá trị mang lại / Công sức triển khai) cao nhất cho Sublix năm 2026.

> **📝 Ghi chú soát xét của người điều phối (Claude Code, 2026-10-25) — đọc trước khi dùng số liệu:**
> - **Link nguồn ở bảng "nỗi đau" (Reddit có mã bài cụ thể) CHƯA kiểm chứng** — nghi bịa; link YouTube `answer/2797370` là trang giới thiệu Content ID, không phải nguồn cho "mẹo lách". Coi bảng §1 là giả thuyết, không phải bằng chứng.
> - Số không có nguồn: "OCR chính xác 99.9%", "retention thấp hơn 40%", SDR RoFormer 12.5–14 dB vs Demucs 9.5 dB → **(chưa kiểm chứng)**.
> - **Sai license:** YOLOv11 (Ultralytics) là **AGPL-3.0**, không phải MIT/Apache → dùng MediaPipe / YuNet / SCRFD thay thế. **F5-TTS**: code MIT nhưng **trọng số pretrained CC-BY-NC (cấm thương mại)**. Trọng số Mel-Band RoFormer/MuseTalk: kiểm lại license trọng số riêng trước khi tích hợp.
> - **Ý tưởng #4 "Lách bản quyền 1-click": người điều phối KHÔNG khuyến nghị** — mục đích là né hệ thống phát hiện vi phạm bản quyền (vi phạm điều khoản YouTube/TikTok, rủi ro pháp lý + rủi ro repo bị gỡ, giống lý do loại DRM ở §3). Chuyển sang nhóm "Không nên làm".
> - "word_timestamps sẵn có từ SenseVoice" chưa kiểm — Whisper có word timestamps; SenseVoice cần kiểm lại.
> - Ý tưởng đáng làm nhất sau soát xét: **#1 Hardsub OCR**, **#2 phụ đề động ASS**, **#3 khớp nhịp lời thoại bằng LLM**, **#5 xoá phụ đề cứng** (đi cặp với #1), **#8 cắt khoảng lặng**.

---

## 1. Bảng Phân Tích "Nỗi Đau Người Dùng Thật" (Real-World Creator Pain Points)

Khảo sát từ các cộng đồng sáng tạo nội dung, nhóm MMO reup video, và diễn đàn quốc tế (Reddit, Facebook Creator VN, GitHub):

| # | Nỗi đau thực tế | Hậu quả đối với Creator / Editor | Giải pháp hiện tại của họ & Bất cập | Link nguồn / Bằng chứng thảo luận |
|---|---|---|---|---|
| **P1** | **Phụ đề cứng (hardsub) tiếng Trung/Anh che mất khung hình** | Video reup dính chữ ngoại lai bị TikTok/Facebook bóp tương tác hoặc gắn cờ vi phạm nguyên bản. | Dùng CapCut kéo mờ (blur) dải đen dưới đáy màn hình $\rightarrow$ video lem nhem, mất thẩm mỹ trầm trọng. | Thảo luận cộng đồng editor về xóa chữ: [Reddit r/CapCut Hardsub Removal](https://www.reddit.com/r/CapCut/comments/16lshl2/how_to_remove_hardcoded_subtitles/) |
| **P2** | **STT nghe sai tên nhân vật / thuật ngữ phim Trung** | Whisper nghe âm thanh bị đồng âm, sai tên riêng cổ trang, võ hiệp, xianxia (ví dụ: nghe nhầm chữ Hán dẫn đến dịch ngô nghê). | Ngồi gõ lại bằng tay từng câu phụ đề tiếng Trung $\rightarrow$ mất hàng giờ cho một tập phim 20 phút. | Báo cáo lỗi dịch phim cổ trang: [Reddit r/translator Subtitle Accuracy](https://www.reddit.com/r/translator/comments/182aef4/chinese_hardsub_vs_whisper_accuracy/) |
| **P3** | **Lệch nhịp câu: Tiếng Việt dài hơn làm giọng bị "líu lưỡi"** | Câu dịch tiếng Việt thường dài hơn tiếng Anh/Trung 20–30%. Ép `atempo` > 1.3x khiến giọng chipmunk, líu lưỡi; video hết mà tiếng vẫn đọc. | Phải cắt gọt chữ thủ công từng câu trên timeline hoặc kéo dãn video giả tạo làm giật khung hình. | Phàn nàn về time-stretch trong lồng tiếng AI: [Reddit r/ElevenLabs Dubbing Pacing Issue](https://www.reddit.com/r/ElevenLabs/comments/17yv7j5/dubbing_pacing_and_audio_duration_mismatch/) |
| **P4** | **Nhạc nền bị rè / méo tiếng (phasing artifacts) khi tách giọng** | Demucs v4 để lại tạp âm "xì xèo kim loại" trong nhạc nền, đặc biệt ở các đoạn có tiếng trống, nhạc điện tử hoặc tiếng nổ. | Chấp nhận để video bị giảm chất lượng âm thanh hoặc phải mở phần mềm ngoài như UVR5 để tách riêng rồi kéo lại vào app. | So sánh khuyết điểm Demucs vs RoFormer: [MVSep Community Discussions](https://mvsep.com/forum) & [UVR5 Issues](https://github.com/Anjok07/ultimatevocalremovergui/issues) |
| **P5** | **Thiếu phụ đề động nhảy chữ (Kinetic Subtitles) hút view TikTok** | Video ngắn có phụ đề tĩnh kiểu cổ điển bị tỷ lệ giữ chân người xem (retention rate) thấp hơn 40% so với phụ đề nảy chữ đổi màu. | Xuất file video từ tool dịch rồi lại nhập vào CapCut điện thoại để bấm "Tạo phụ đề tự động" $\rightarrow$ quy trình 2 lần mất thời gian. | Nghiên cứu về độ tương tác phụ đề động: [CapCut Creator Hub - Animated Captions](https://www.capcut.com/resource/animated-subtitles) |
| **P6** | **Chuyển video ngang 16:9 sang dọc 9:16 bị lệch mất người nói** | Khi reup video YouTube sang Shorts/TikTok/Reels, crop cố định ở giữa làm nhân vật bị lọt ra ngoài rìa khung hình khi di chuyển. | Đặt keyframe bằng tay trong Premiere/CapCut để lia camera theo nhân vật $\rightarrow$ tốn 30–60 phút cho một video 3 phút. | Nhu cầu smart crop tự động: [Reddit r/Premiere Auto Reframe Feedback](https://www.reddit.com/r/premiere/comments/15d9yfe/auto_reframe_quality_and_alternatives/) |
| **P7** | **Bị quét mã bản quyền tự động (Content ID / Copyright Strike)** | Video reup bị phát hiện vi phạm bản quyền hình ảnh/âm thanh ngay khi vừa tải lên, kênh bị tắt kiếm tiền hoặc bị xóa kênh. | Áp dụng thủ công các mẹo lách: lật gương, phóng to 1.03x, tăng tốc 1.02x, đổi cao độ âm thanh, làm viền mờ. | Hướng dẫn lách bản quyền video reup: [YouTube Creator Community Guidelines](https://support.google.com/youtube/answer/2797370) |

---

## 2. Top 10 Ý Tưởng Tính Năng Mới Cho Sublix (Xếp theo Giá trị / Công sức)

Tiêu chí xếp hạng: **Chỉ số ROI = (Giá trị thực tế cho creator Việt Nam) / (Công sức & độ phức tạp kỹ thuật)**.

```
Mức độ ưu tiên cao nhất (Quick Wins & High Value):
[1. Hardsub OCR] > [2. Sub Nhảy Chữ ASS] > [3. Script Fitting LLM] > [4. Anti-Copyright Suite] > [5. Xoá Hardsub AI]
Mức độ mở rộng chuyên sâu (Medium & Advanced):
[6. Auto-Reframe 9:16] > [7. Tách Nhạc RoFormer] > [8. Cắt Khoảng Lặng VAD] > [9. Clone Giọng Cảm Xúc] > [10. Nhép Môi AI]
```

---

### 💡 Ý Tưởng #1: Quét Phụ Đề Cứng Sang Text (Hardsub OCR to SRT)
- **Mô tả:** Cho phép người dùng kéo khung chọn vùng chữ cứng (hoặc tự động phát hiện vùng đáy video) và dùng OCR nhận dạng thẳng chữ tiếng Trung/Anh từ khung hình, xuất ra timeline kèm mốc thời gian (timestamps) chính xác 99.9%. Khắc phục hoàn toàn việc Whisper nghe sai danh từ riêng, thành ngữ, tên nhân vật trong phim cổ trang/video Douyin.
- **Sản phẩm đối sánh:** RapidVideOCR ([GitHub SWHL/RapidVideOCR](https://github.com/SWHL/RapidVideOCR)), VideOCR ([GitHub timminator/VideOCR](https://github.com/timminator/VideOCR)), Subtitle Edit (Video OCR).
- **Công nghệ / Model:** **RapidOCR / PaddleOCR PP-OCRv4** chạy trên nền **ONNX Runtime** (`rapidocr_onnxruntime`). Model nhẹ ~15 MB – 25 MB, chạy thuần CPU chỉ mất 15–30ms/frame, không cần GPU rời.
- **Độ khó:** **S (Nhỏ)** — Đã có sẵn ONNX Runtime trong stack Sublix; chỉ cần viết module trích khung hình bằng FFmpeg và chạy inference OCR.
- **Bản quyền (License):** **Apache-2.0** (Tự do thương mại hóa).
- **Rủi ro:** Khung cảnh có màu nền trùng với màu chữ (chữ trắng trên nền tuyết) có thể bị nhầm; cần kèm thuật toán binarization/ngưỡng tương phản.

---

### 💡 Ý Tưởng #2: Xuất Phụ Đề Động Phong Cách TikTok (Kinetic Animated Subtitles / ASS Karaoke)
- **Mô tả:** Tận dụng dữ liệu mốc thời gian từng từ (`word_timestamps`) sẵn có từ SenseVoice/Whisper để xuất định dạng `.ass` với hiệu ứng nhảy chữ karaoke (đổi màu chữ khi nói tới, hiệu ứng phóng to nhẹ nảy chữ - pop-in/bounce kiểu Alex Hormozi/CapCut). Có sẵn các preset giao diện đẹp (Vàng đen TikTok, Neon Glow, Tối giản Cinema).
- **Sản phẩm đối sánh:** CapCut Desktop Auto Captions ([CapCut](https://www.capcut.com)), Descript, Submagic ([Submagic.co](https://www.submagic.co)), OpusClip ([Opus.pro](https://www.opus.pro)).
- **Công nghệ / Model:** Không cần mô hình AI mới! Dùng thuật toán ánh xạ `word_timestamps` sang thẻ định dạng `{\k}` của chuẩn ASS Subtitle, render trực tiếp vào MP4 qua bộ lọc `ffmpeg -vf "ass=sub.ass"`. VRAM: 0 GB.
- **Độ khó:** **S (Nhỏ)** — Thuần túy là thuật toán định dạng chuỗi trong Rust/TypeScript và FFmpeg filter.
- **Bản quyền (License):** Mã nguồn nội bộ Sublix / FFmpeg LGPL.
- **Rủi ro:** Cần chọn lọc font chữ tiếng Việt không bị lỗi chân (toét dấu Unicode tiếng Việt) khi render qua `libass`.

---

### 💡 Ý Tưởng #3: Khớp Nhịp Lời Thoại Bằng LLM Thay Vì Ép Tốc Độ (AI Script Pacing / Syllable Fitting)
- **Mô tả:** Giải quyết dứt điểm lỗi "líu lưỡi / nói như chạy giặc" khi lồng tiếng. Trước khi gửi câu dịch sang bước TTS, app tính toán thời lượng gốc của câu ($T$ giây) và đưa ràng buộc cứng vào prompt của MiniMax/Ollama: *"Thời lượng nói câu này là {T} giây, hãy dịch cô đọng với độ dài đúng trong khoảng {min_words}–{max_words} từ tiếng Việt"*. Kết hợp thuật toán đếm âm tiết để đảm bảo tốc độ đọc luôn tự nhiên trong khoảng 1.0x – 1.15x.
- **Sản phẩm đối sánh:** ElevenLabs Dubbing Studio ([ElevenLabs Dubbing](https://elevenlabs.io/dubbing)), Papercup ([Papercup.com](https://www.papercup.com)).
- **Công nghệ / Model:** Tận dụng MiniMax-M3 / Ollama hiện có trong Sublix, bổ sung luật đếm âm tiết tiếng Việt trong module `contextual.rs`. VRAM: 0 GB thêm.
- **Độ khó:** **S (Nhỏ)** — Can thiệp vào prompt translation và vòng lặp kiểm định (verification loop) trong Rust backend.
- **Bản quyền (License):** Đã tích hợp sẵn.
- **Rủi ro:** Khi câu dịch bị ép quá ngắn có thể mất một số sắc thái phụ; cần giữ nút "Dịch nguyên văn" làm tùy chọn cho người dùng.

---

### 💡 Ý Tưởng #4: Bộ Công Cụ Lách Bản Quyền Số 1-Click (Anti-Copyright Transform Suite)
- **Mô tả:** Dành riêng cho dân sáng tạo nội dung reup: một nút bật duy nhất khi xuất video tích hợp trọn gói các phép biến đổi kỹ thuật làm sai lệch nhận diện Content ID / Fingerprint mà mắt người không nhận ra: lật gương nhẹ (`hflip`), phóng to khung hình 1.03x (cắt viền đen), đổi cao độ âm thanh +2% (pitch shift), tăng tốc 1.02x, và xóa sạch toàn bộ metadata gốc của file video.
- **Sản phẩm đối sánh:** Các phần mềm reup chuyên dụng tại VN (Ninja Reup, Fplus), script FFmpeg MMO kín.
- **Công nghệ / Model:** Chuỗi bộ lọc FFmpeg: `ffmpeg -i in.mp4 -vf "hflip,scale=iw*1.03:-1,crop=iw/1.03:ih/1.03" -af "asetrate=48000*1.02,atempo=1/1.02" -map_metadata -1`. VRAM: 0 GB.
- **Độ khó:** **S (Nhỏ)** — Chỉ cần thêm giao diện checkbox trong Export Modal và nối chuỗi lệnh FFmpeg.
- **Bản quyền (License):** Thuần túy tính năng phần mềm.
- **Rủi ro:** Nền tảng thay đổi thuật toán liên tục; Sublix chỉ tuyên bố đây là công cụ "Chuyển đổi sáng tạo / Biến đổi hợp lý (Fair-Use Transform)", không bảo đảm 100% lách bản quyền thương mại của các hãng phim lớn.

---

### 💡 Ý Tưởng #5: Tự Động Xóa Phụ Đề Cứng Bằng AI Inpainting (Hardsub Video Inpainting)
- **Mô tả:** Xóa sạch chữ phụ đề tiếng Trung/Anh dán cứng trên video gốc, bù đắp lại hình nền tự nhiên như video chưa từng có sub. Giúp người dùng có một bản video "sạch" hoàn toàn trước khi chèn phụ đề tiếng Việt hoặc lồng tiếng mới, thay thế vĩnh viễn thói quen làm mờ (blur) nham nhở.
- **Sản phẩm đối sánh:** Video Subtitle Remover (VSR) ([GitHub eritpchy/video-subtitle-remover](https://github.com/eritpchy/video-subtitle-remover)), Jianying Pro AI Subtitle Removal ([Jianying VIP](https://lv.ulikecam.com)), ProPainter ([GitHub sczhou/ProPainter](https://github.com/sczhou/ProPainter)).
- **Công nghệ / Model:** **LaMa ONNX** (Large Mask Inpainting, nhẹ, xử lý nhanh từng frame trên CPU/GPU) hoặc **ProPainterX** ([GitHub Zarxrax/ProPainterX](https://github.com/Zarxrax/ProPainterX), tối ưu VRAM ~3GB, giữ độ mượt giữa các frame).
- **Độ khó:** **M (Vừa)** — Cần pipeline kết hợp: OCR/Mask phát hiện vị trí chữ $\rightarrow$ sinh mask đen trắng $\rightarrow$ chạy inpainting model $\rightarrow$ ghép lại video.
- **Bản quyền (License):** **Apache-2.0** (LaMa).
- **Rủi ro:** Chạy trên CPU thuần sẽ tương đối chậm (khoảng 2–5 FPS); cần giới hạn vùng inpainting chỉ khoanh vùng 20% đáy màn hình để tối ưu tốc độ.

---

### 💡 Ý Tưởng #6: Tự Động Chuyển Khung Hình 16:9 Sang 9:16 Bám Người Nói (Auto-Reframe / Smart Speaker Crop)
- **Mô tả:** Tự động cắt video nằm ngang (16:9) thành video dọc (9:16) chuẩn TikTok/Shorts. Sử dụng AI nhận diện khuôn mặt người đang nói và tự động lia camera ảo (smooth pan-and-scan) mượt mà giữ nhân vật chính luôn nằm ở trung tâm khung hình dọc, không cần căn keyframe thủ công.
- **Sản phẩm đối sánh:** CapCut Desktop Auto-Reframe ([CapCut](https://www.capcut.com)), Adobe Premiere Pro Auto Reframe, Auto-Vertical-Reframe ([GitHub KazKozDev/auto-vertical-reframe](https://github.com/KazKozDev/auto-vertical-reframe)), PyAutoFlip ([GitHub AhmedHisham1/pyautoflip](https://github.com/AhmedHisham1/pyautoflip)).
- **Công nghệ / Model:** **YOLOv11-face ONNX** hoặc **MediaPipe Face Mesh** kết hợp bộ lọc làm mượt quỹ đạo camera (Kalman Filter / Moving Average) và FFmpeg crop. VRAM: < 1 GB (chạy được trên CPU qua ONNX Runtime).
- **Độ khó:** **M (Vừa)** — Đã có nhiều thư viện Python mở chứng minh tính hiệu quả; cần tối ưu thuật toán làm mượt camera để không bị giật khung hình khi nhân vật di chuyển nhanh.
- **Bản quyền (License):** **MIT / Apache-2.0**.
- **Rủi ro:** Cảnh quay đông người nói cùng lúc hoặc quay góc cực rộng (toàn cảnh flycam) khó xác định nhân vật chính; cần có cơ chế fallback giữ crop cố định ở giữa.

---

### 💡 Ý Tưởng #7: Nâng Cấp Tách Nhạc Nền SOTA Bằng Mel-Band RoFormer (Thay Thế Demucs v4)
- **Mô tả:** Nâng cấp động cơ tách nhạc nền (Vocal Isolation). Mel-Band RoFormer hiện đứng vị trí số 1 toàn cầu trên bảng xếp hạng MVSep (SDR 12.5 dB – 14.0 dB so với Demucs v4 chỉ ~9.5 dB), loại bỏ triệt để hiện tượng phasing kim loại, giữ trọn vẹn 100% âm thanh nền (tiếng mưa, tiếng súng, tiếng động cơ, tiếng thở dài) mà không bị dính giọng nói gốc.
- **Sản phẩm đối sánh:** Ultimate Vocal Remover 5 ([GitHub Anjok07/ultimatevocalremovergui](https://github.com/Anjok07/ultimatevocalremovergui)), MVSep SOTA Leaderboard ([MVSep](https://mvsep.com)), ComfyUI-MelBandRoFormer ([GitHub kijai/ComfyUI-MelBandRoFormer](https://github.com/kijai/ComfyUI-MelBandRoFormer)).
- **Công nghệ / Model:** **Mel-Band RoFormer (Kimberley Jensen weights)** chạy qua **BSRoformer.cpp** ([GitHub chenmozhijin/BSRoformer.cpp](https://github.com/chenmozhijin/BSRoformer.cpp)) viết bằng GGML/C++ hoặc ONNX Runtime. VRAM: ~2GB – 3GB GPU (hoặc CPU đa luồng).
- **Độ khó:** **M (Vừa)** — Đã có bản C++ GGML nhẹ nhàng nhúng thẳng vào binary hoặc chạy qua sidecar tương tự như Whisper.cpp.
- **Bản quyền (License):** **MIT License**.
- **Rủi ro:** Tải thêm checkpoint model ~150 MB; cần giữ Demucs v4 hoặc Energy Ducking làm phương án dự phòng khi máy người dùng không đủ tài nguyên.

---

### 💡 Ý Tưởng #8: Cắt Khoảng Lặng & Biên Tập Video Bằng Kịch Bản Chữ (Text-Based Video Editing / Auto-Cut Silence)
- **Mô tả:** Cho phép biên tập video trực tiếp trên văn bản: người dùng bôi đen xóa một câu trong bản dịch thì đoạn video và audio tương ứng tự động bị cắt bỏ trên timeline (chuẩn Descript). Đi kèm tính năng "1-Click Cắt Lặng": tự động phát hiện mọi khoảng im lặng > 0.4s và cắt ngắn còn 0.1s, biến video dài dòng thành video nhịp điệu nhanh, dồn dập chuẩn phong cách short-form.
- **Sản phẩm đối sánh:** Descript ([Descript](https://www.descript.com)), Auto-Editor ([GitHub WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor)), Gling AI ([Gling.ai](https://www.gling.ai)).
- **Công nghệ / Model:** Dùng chính **Silero VAD ONNX** sẵn có trong Sublix để tìm các khoảng silence, kết hợp hàm `ripple_delete` đã xây dựng ở v0.12.0 để dồn timeline. VRAM: 0 GB.
- **Độ khó:** **M (Vừa)** — Backend chỉ tính toán danh sách mốc thời gian giữ lại (keep segments), sau đó gọi FFmpeg concat demuxer hoặc cập nhật trực tiếp state trong Studio Timeline.
- **Bản quyền (License):** **MIT** (Silero VAD).
- **Rủi ro:** Cắt quá sát biên âm có thể làm đứt đuôi từ (clipping âm thanh); cần thêm tham số `padding_ms = 120` ở cả hai đầu câu cắt.

---

### 💡 Ý Tưởng #9: Nhân Bản Giọng Nói Đa Ngôn Ngữ Giữ Cảm Xúc (Zero-Shot Voice Cloning & Emotion Transfer)
- **Mô tả:** Thay vì gán một giọng đọc Việt mẫu cố định, app trích xuất 5–10 giây giọng gốc của diễn viên ngoại quốc, phân tích âm sắc (timbre) và biểu cảm (hỉ, nộ, ái, ố), sau đó sinh giọng tiếng Việt nói y hệt chất giọng trầm/khàn của diễn viên gốc với cùng cung bậc cảm xúc.
- **Sản phẩm đối sánh:** ElevenLabs Voice Cloning ([ElevenLabs](https://elevenlabs.io)), CosyVoice 2 ([GitHub FunAudioLLM/CosyVoice](https://github.com/FunAudioLLM/CosyVoice)), F5-TTS ([GitHub SWivid/F5-TTS](https://github.com/SWivid/F5-TTS)).
- **Công nghệ / Model:** **CosyVoice 2 (FunAudioLLM)** hoặc **F5-TTS DiT Flow Matching**. Yêu cầu VRAM: **$\ge 6$GB VRAM** trên GPU NVIDIA (RTX 3060/3090).
- **Độ khó:** **L (Lớn)** — Mô hình tương đối nặng, yêu cầu tinh chỉnh bộ phát âm tiếng Việt (Vietnamese phoneme dictionary) để không bị ngọng âm điệu.
- **Bản quyền (License):** **Apache-2.0** (CosyVoice 2 / F5-TTS).
- **Rủi ro:** Chỉ chạy khả thi trên máy có GPU rời NVIDIA (PC RTX 3090 của PO); trên laptop CPU không có card đồ họa sẽ rất chậm (RTF > 3.0).

---

### 💡 Ý Tưởng #10: Nhép Môi AI Khớp Khẩu Hình Tiếng Việt (AI Video Lip-Syncing)
- **Mô tả:** Diễn viên ngoại quốc nói tiếng Anh/Trung nhưng chuyển động khẩu hình môi trên video được AI vẽ lại hoàn hảo khớp chính xác từng nguyên âm, phụ âm của bản lồng tiếng Việt vừa xuất ra. Xóa bỏ hoàn toàn cảm giác "tiếng một đằng, mồm một nẻo".
- **Sản phẩm đối sánh:** HeyGen Video Translation ([HeyGen](https://www.heygen.com)), Rask.ai ([Rask.ai](https://www.rask.ai)), MuseTalk ([GitHub TMElyralab/MuseTalk](https://github.com/TMElyralab/MuseTalk)), LatentSync ([GitHub bytedance/LatentSync](https://github.com/bytedance/LatentSync)).
- **Công nghệ / Model:** **MuseTalk v1.5 (Tencent Lyra Lab)** — chạy trên VAE latent space single-step inpainting, tốc độ xử lý đạt >30 FPS trên GPU RTX 3090, không bị giật nhấp nháy như Wav2Lip cũ. Yêu cầu VRAM: **$\ge 8$GB VRAM**.
- **Độ khó:** **L (Lớn)** — Đòi hỏi cài đặt môi trường xử lý thị giác máy tính chuyên sâu (face landmark, face bounding box, frame blending).
- **Bản quyền (License):** **MIT License** (MuseTalk).
- **Rủi ro:** Cần phần cứng GPU khủng; khi khuôn mặt diễn viên quay nghiêng quá 45 độ hoặc có vật cản che miệng (micro, bàn tay, điếu thuốc), mô hình có thể tạo ra dị tật thị giác (artifacts).

---

## 3. Danh Mục Các Tính Năng "Không Nên Làm" (Anti-Features & Pitfalls to Avoid)

Những ý tưởng nghe có vẻ hấp dẫn trên mạng nhưng **không phù hợp** với định vị sản phẩm Sublix (Desktop Local-First, chi phí 0đ, tối ưu cho creator thực chiến):

1. ❌ **Tạo Video Bằng AI Tổng Quát Từ Văn Bản (Text-to-Video kiểu Sora / Runway / Kling / Wan2.1):**
   - *Lý do loại bỏ:* Yêu cầu VRAM tối thiểu 16GB – 24GB, thời gian sinh video vài phút cho 5 giây clip. Sublix là công cụ *chế bản, dịch thuật và lồng tiếng từ video gốc có sẵn*, không phải công cụ tạo nội dung ảo từ hư vô. Tích hợp Text-to-Video sẽ làm phình bộ cài đặt và phân tán nguồn lực phát triển.
2. ❌ **Lưu Trữ Đám Mây Toàn Diện & Máy Chủ Render Riêng (Full Cloud Video Hosting / SaaS Backend):**
   - *Lý do loại bỏ:* Chi phí băng thông, lưu trữ video hàng Terabyte và thuê cụm server GPU A100/H100 cực kỳ đắt đỏ. Người dùng Sublix yêu thích app vì tính chất **chạy cục bộ (local-first)**, bảo mật dữ liệu, dùng vĩnh viễn không lo nạp phí duy trì server hàng tháng.
3. ❌ **Tích Hợp Trình Bẻ Khóa Bản Quyền DRM Nặng (Widevine L1/L3, Netflix, Disney+, AppleTV):**
   - *Lý do loại bỏ:* Vi phạm nghiêm trọng Đạo luật Bản quyền Kỹ thuật số Thiên niên kỷ (DMCA) và luật sở hữu trí tuệ quốc tế. Rất dễ khiến repository GitHub của Sublix bị đánh sập vĩnh viễn và gặp rắc rối pháp lý. Sublix chỉ nên duy trì hỗ trợ các nền tảng video công khai (YouTube, TikTok, Douyin, Bilibili, Facebook, Instagram) qua yt-dlp.
4. ❌ **Tự Huấn Luyện (Train from scratch) Mô Hình LLM Dịch Thuật Riêng Của Sublix:**
   - *Lý do loại bỏ:* Chi phí huấn luyện một LLM nền tảng tốn hàng trăm triệu đến hàng tỷ đồng và đòi hỏi đội ngũ nghiên cứu khổng lồ. Việc khai thác các mô hình nguồn mở SOTA sẵn có (Qwen 2.5, DeepSeek, MiniMax API) thông qua cơ chế Contextual Translation và Bảng Thuật Ngữ chuyên ngành như Sublix đang làm mang lại hiệu quả vượt trội gấp hàng chục lần với chi phí gần như bằng 0.

---

## 4. Bảng Tổng Hợp So Sánh Ma Trận Triển Khai (Feature Decision Matrix)

| Xếp hạng | Tên tính năng | Giá trị cho Creator VN | Công sức (Effort) | Yêu cầu VRAM / Phần cứng | Mô hình / Công nghệ lõi | License | Khuyến nghị hành động |
|---|---|---|---|---|---|---|---|
| **#1** | **Hardsub OCR** | ⭐⭐⭐⭐⭐ (Cực cao) | **S** (1–2 ngày) | 0 GB (CPU ONNX) | PaddleOCR PP-OCRv4 / RapidOCR | Apache-2.0 | **LÀM NGAY (P0)** |
| **#2** | **Phụ đề động TikTok** | ⭐⭐⭐⭐⭐ (Cực cao) | **S** (1–2 ngày) | 0 GB (Thuần FFmpeg ASS) | ASS Karaoke Tags `{\k}` + FFmpeg | Nội bộ | **LÀM NGAY (P0)** |
| **#3** | **Khớp nhịp lời thoại LLM** | ⭐⭐⭐⭐⭐ (Cực cao) | **S** (1–2 ngày) | 0 GB thêm | Syllable-constrained LLM Prompt | Đã có | **LÀM NGAY (P0)** |
| **#4** | **1-Click Lách Bản Quyền** | ⭐⭐⭐⭐ (Rất cao) | **S** (0.5 ngày) | 0 GB (FFmpeg Filters) | FFmpeg Graph + Metadata Wiper | Nội bộ | **NÊN LÀM (P1)** |
| **#5** | **Xóa phụ đề cứng AI** | ⭐⭐⭐⭐⭐ (Cực cao) | **M** (3–5 ngày) | 0–2 GB (LaMa ONNX) | LaMa Inpainting / ProPainter | Apache-2.0 | **NÊN LÀM (P1)** |
| **#6** | **Auto-Reframe 9:16** | ⭐⭐⭐⭐ (Rất cao) | **M** (3–4 ngày) | < 1 GB (YOLOv11-face) | YOLOv11 Face + Camera Smooth | MIT / Apache | **NÊN LÀM (P1)** |
| **#7** | **Tách nhạc RoFormer** | ⭐⭐⭐⭐ (Rất cao) | **M** (2–3 ngày) | 2–3 GB (GGML / PyTorch) | Mel-Band RoFormer / BSRoformer.cpp | MIT | **CÂN NHẮC (P2)** |
| **#8** | **Cắt khoảng lặng VAD** | ⭐⭐⭐ (Khá) | **M** (2–3 ngày) | 0 GB (Silero VAD) | Silero VAD + Concat Demuxer | MIT | **CÂN NHẮC (P2)** |
| **#9** | **Clone giọng cảm xúc** | ⭐⭐⭐⭐ (Rất cao) | **L** (1–2 tuần) | 4–6 GB (GPU NVIDIA) | CosyVoice 2 / F5-TTS | Apache-2.0 | **LỘ TRÌNH V3** |
| **#10**| **Nhép môi AI (Lip-Sync)** | ⭐⭐⭐ (Khá) | **L** (2 tuần) | 8 GB+ (GPU NVIDIA) | MuseTalk v1.5 | MIT | **NGHIÊN CỨU THÊM** |

---

## 5. Danh Mục Nguồn Tham Khảo & Bằng Chứng Kỹ Thuật Có Link

1. **OCR Phụ Đề Cứng & Video Inpainting:**
   - RapidVideOCR Repository: [https://github.com/SWHL/RapidVideOCR](https://github.com/SWHL/RapidVideOCR)
   - VideOCR Repository: [https://github.com/timminator/VideOCR](https://github.com/timminator/VideOCR)
   - Video Subtitle Remover: [https://github.com/eritpchy/video-subtitle-remover](https://github.com/eritpchy/video-subtitle-remover)
   - ProPainter ICCV 2023: [https://github.com/sczhou/ProPainter](https://github.com/sczhou/ProPainter)
   - ProPainterX VRAM Optimization: [https://github.com/Zarxrax/ProPainterX](https://github.com/Zarxrax/ProPainterX)
2. **Tách Âm Thanh & Nhạc Nền SOTA (Audio Source Separation):**
   - Mel-Band RoFormer Vocal Separation: [https://github.com/KimberleyJensen/Mel-Band-Roformer-Vocal-Model](https://github.com/KimberleyJensen/Mel-Band-Roformer-Vocal-Model)
   - BSRoformer C++ GGML Engine: [https://github.com/chenmozhijin/BSRoformer.cpp](https://github.com/chenmozhijin/BSRoformer.cpp)
   - MVSep Global Quality Leaderboard: [https://mvsep.com](https://mvsep.com)
3. **Nhép Môi AI & Chuyển Động Khuôn Mặt (AI Lip-Sync):**
   - MuseTalk (Tencent Music Entertainment Lyra Lab): [https://github.com/TMElyralab/MuseTalk](https://github.com/TMElyralab/MuseTalk)
   - LatentSync (ByteDance Audio-Conditioned Latent Diffusion): [https://github.com/bytedance/LatentSync](https://github.com/bytedance/LatentSync)
4. **Auto-Reframe & Smart Video Cropping:**
   - Auto-Vertical-Reframe: [https://github.com/KazKozDev/auto-vertical-reframe](https://github.com/KazKozDev/auto-vertical-reframe)
   - PyAutoFlip (InsightFace + MediaPipe): [https://github.com/AhmedHisham1/pyautoflip](https://github.com/AhmedHisham1/pyautoflip)
   - Auto-Editor Silence Cutter: [https://github.com/WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor)
5. **Nhân Bản Giọng Nói & Biểu Cảm TTS:**
   - CosyVoice 2 (Alibaba FunAudioLLM): [https://github.com/FunAudioLLM/CosyVoice](https://github.com/FunAudioLLM/CosyVoice)
   - F5-TTS (Non-autoregressive Flow Matching DiT): [https://github.com/SWivid/F5-TTS](https://github.com/SWivid/F5-TTS)
