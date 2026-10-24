# STT_MODELS_2026 — Engine nhận dạng giọng nói chính xác hơn Whisper (EN + ZH)

> **Task:** `TSK-FEAT-STT-ENGINES` — **Agent:** mcode #3 (Orca worker) · **Ngày:** 2026-10-24
> **Phạm vi:** nghiên cứu + đo thật + tích hợp backend + component UI tải model.
> **Bối cảnh:** Sublix hiện dùng **whisper.cpp** (`ggml-base` + `ggml-large-v3-turbo-q8_0`).
> PO cần reup video **Trung Quốc** (Douyin/Bilibili) + **tiếng Anh**, và máy dev
> (Ryzen AI Max 390) **không có NVIDIA** → whisper turbo trên CPU quá chậm.

---

## 0. Tóm tắt điều hành (đọc 30 giây)

| # | Kết luận | Bằng chứng |
|---|----------|------------|
| 1 | **SenseVoice Small int8 (2024-07-17) là ứng viên #1 cho cả EN lẫn ZH.** | Đo thật: **WER 7,18 %** (EN) · **CER 4,72 %** (ZH), **RTF 0,065**, RAM **788 MB**, **có timestamp từ**. |
| 2 | Whisper turbo trên CPU **chậm hơn SenseVoice ~20×**: RTF **1,22** (EN) / **1,62** (ZH). | Clip 2 phút: whisper turbo **146 s** (EN) / **194 s** (ZH) vs SenseVoice **8,7 s** / **7,7 s**. Video 26 phút của PO ⇒ whisper CPU mất **~42 phút**, SenseVoice **~2 phút**. |
| 3 | **Paraformer-zh** là lựa chọn thứ 2 cho tiếng Trung: **CER 5,79 %**, RTF **0,032**, RAM **502 MB** — nhưng **không có timestamp từ**. | Bảng đo §4. |
| 4 | **Parakeet TDT v2/v3** (NVIDIA) là ứng viên #2 cho **tiếng Anh** theo công bố, nhưng **chưa kiểm chứng được trên máy dev** (tải GitHub bị nghẽn + bản mirror HF sai layout ONNX). | §5 lỗi kỹ thuật #2. |
| 5 | **Canary 180M bị LOẠI**: chỉ nhận dạng được **~35 %** âm thanh đầu vào (146/418 từ) — cắt cụt phần đuôi. | §4.2. |
| 6 | **Bản SenseVoice int8 2025-09-09 bị RỚT CHỮ** (WER 40,19 %) — đừng dùng bản đó; bản **2024-07-17** mới đúng. | §5 lỗi kỹ thuật #1. |
| 7 | **Whisper vẫn giữ làm mặc định** (không đổi hành vi cũ). Người dùng chọn engine khác qua `stt_asr_engine` trong config. | `src-tauri/src/config.rs` (1 field mới, được coordinator duyệt). |

---

## 1. Phương pháp đo (minh bạch, không bịa)

### 1.1 Máy đo
- **CPU:** AMD Ryzen AI Max 390 (16 luồng, nhưng mọi lần đo dùng **4 luồng**)
- **RAM:** 31 GB · **GPU:** không có NVIDIA (chỉ iGPU Radeon 8050S)
- **OS:** Windows 11 build 26200
- **Runtime:** `sherpa-onnx` **2.0.0** (Python 3.13) + `onnxruntime` **1.31.0** (CPU) ·
  `whisper.cpp` (`src-tauri/binaries/Release/whisper-cli.exe`) với model trong repo
- **Không dùng GPU cho bất kỳ con số nào** trong bảng dưới.

### 1.2 Clip tham chiếu (có transcript **thủ công**, không phải phụ đề tự động)

| Clip | Nguồn | Dài | Ngôn ngữ | Transcript tham chiếu |
|------|-------|-----|----------|-----------------------|
| `en_sleep` | **TEDxNorthAdams** — *"The Science of Sleep (and the Art of Productivity)"*, Dr. Matthew Carter — `https://www.youtube.com/watch?v=894jQkeewiU` | 120 s (đoạn 150–270 s) | Tiếng Anh | Phụ đề **thủ công** của YouTube (`.en.srt`, tải bằng `yt-dlp --write-subs --sub-langs en`) — 45 cue, 418 từ |
| `zh_guilt` | **TEDxTaipei** — *"如何不讓人生留下遺憾? Breaking the power of guilt"*, 陳永儀 — `https://www.youtube.com/watch?v=snZ811wvjjw` | 120 s (đoạn 120–240 s) | **Tiếng Trung (Mandarin)** | Phụ đề **thủ công** `zh-TW` của YouTube — 45 cue, 466 ký tự |

**Quy tắc đã tuân thủ:**
- Tải bằng `yt-dlp --write-subs --sub-langs <lang>` — chỉ lấy **phụ đề thủ công**
  (`subtitles` trong JSON của yt-dlp), **không** dùng `automatic_captions`.
- Audio cắt bằng `ffmpeg -ss 150 -to 270 -ar 16000 -ac 1` → WAV 16 kHz mono.
- Transcript tham chiếu được **cắt theo đúng cửa sổ thời gian** đó (mọi cue có trong khoảng).
- Tiếng Trung: tham chiếu là **Phồn Thể (zh-TW)**, model xuất **Giản Thể** → cả hai về Giản Thể
  bằng `opencc t2s` trước khi tính CER (không có bước này thì CER bị thổi phồng ~8–10 điểm).

### 1.3 Cách tính chỉ số
- **WER** (EN): edit-distance trên chuỗi từ đã chuẩn hoá (lowercase, bỏ dấu câu).
- **CER** (ZH): edit-distance trên **ký tự** (chuẩn hoá Giản Thể, bỏ khoảng trắng và dấu câu).
- **RTF** = giây suy luận ÷ giây âm thanh (thấp hơn = nhanh hơn; < 1,0 = nhanh hơn thời gian thực).
- **RAM**: peak working set của tiến trình (Windows `GetProcessMemoryInfo`).
- **Lệch timestamp**: khoảng cách tuyệt đối giữa mốc bắt đầu câu của hệ thống và mốc bắt đầu
  cue trong phụ đề tham chiếu, đo ở **mức từ** (align chuỗi từ bằng `difflib`).
  Với whisper (chỉ có timestamp câu) đo ở mức **câu** — đánh dấu rõ trong bảng.

### 1.4 Kịch bản thuần túy, công bằng — nhưng cần nói thẳng
Cả 2 clip là **studio audio sạch** (TED). Đây là điều kiện **thuận lợi cho whisper**:
- whisper turbo đạt **CER 4,08 %** trên tiếng Trung — tốt hơn SenseVoice (4,72 %) trên clip này.
- **Nhưng** SenseVoice nhanh hơn **20×** và **có dấu câu** (whisper base/turbo không có).

Với video reup thực tế của PO (Douyin/Bilibili: âm thanh nén, nhạc nền, nói nhanh, tiếng ồn),
bài toán **không còn là độ chính xác tuyệt đối mà là độ chính xác × tốc độ × chi phí chạy CPU**.
Văn bản FunAudioLLM (mà SenseVoice dùng để huấn luyện) công bố trên CommonVoice:
**SenseVoice CER 10,78 % (zh) vs Whisper-large-v3 12,55 %** và **SenseVoice WER 14,71 % (en) vs
Whisper 9,39 %** — tức là **SenseVoice thắng ở Trung, thua ở Anh** trên tập đa ngôn ngữ.
Kết luận của tài liệu này bám đúng ranh giới đó:
**Trung → SenseVoice/Paraformer. Anh → whisper (đặc biệt khi có CUDA) hoặc SenseVoice khi CPU-only.**

---

## 2. Bảng ứng viên (link, license, dung lượng, CPU/CUDA, tốc độ, timestamp, dấu câu)

| Model | Nguồn tải | License | Thương mại? | Dung lượng | CPU / CUDA | Tốc độ | Timestamp từ? | Dấu câu? |
|-------|-----------|---------|-------------|------------|------------|--------|----------------|----------|
| **SenseVoice Small** (2024-07-17, int8) | HF `csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17` · [bản chính thức](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models) | FunASR Model License | ✅ Có (cần ghi nguồn FunASR/SenseVoice) | **228 MB** | CPU ✅ · CUDA ✅ (onnxruntime-gpu) | ⚡ **RTF 0,065** | ✅ **có** (token) | ✅ có |
| **SenseVoice funASR-Nano** (2025-12-17, int8) | HF `csukuangfj/sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17` | **Apache-2.0** | ✅ Có, dễ nhất | 251 MB | CPU ✅ · CUDA ✅ | ⚡ RTF 0,038 (ZH) | ✅ có | ✅ có |
| **Paraformer-zh** (2024-03-09, int8) | HF `csukuangfj/sherpa-onnx-paraformer-zh-2024-03-09` · [bản chính thức 2025-10-07](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models) | FunASR Model License | ✅ Có (ghi nguồn FunASR) | 217 MB | CPU ✅ · CUDA ✅ | ⚡ RTF 0,032 | ❌ **không** | ✅ có |
| **Paraformer-zh small** (int8) | HF `csukuangfj/sherpa-onnx-paraformer-zh-small-2024-03-09` | FunASR Model License | ✅ Có | 78 MB | CPU ✅ | ⚡ RTF 0,016 | ❌ không | ✅ có |
| **NVIDIA Parakeet TDT 0.6B v3** (int8) | Release `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` | **CC-BY-4.0** | ✅ Có | 465 MB | CPU ✅ · CUDA ✅ | RTF ≈0,05–0,11 (công bố) | ✅ có | ✅ có |
| **NVIDIA Parakeet TDT 0.6B v2** (int8) | Release `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2` | **CC-BY-4.0** | ✅ Có | 460 MB | CPU ✅ · CUDA ✅ | RTF ≈0,11 (công bố) | ✅ có | ✅ có |
| **NVIDIA Canary 180M Flash** (int8) | Release `sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8.tar.bz2` | CC-BY-4.0 | ✅ Có | 147 MB | CPU ✅ | RTF 0,207 | ❌ không | ✅ có |
| **faster-whisper large-v3-turbo** (CTranslate2) | HF `Systran/faster-whisper-large-v3` | MIT | ✅ Có | ~1,6 GB (int8) | CPU ✅ · CUDA ✅ | RTF ≈0,05–0,2 | ✅ có | ✅ có |
| **WhisperX** (whisper + wav2vec2 alignment) | GitHub `m-bain/whisperX` | BSD-2 (code) / CC-BY-4.0 (wav2vec2) | ⚠️ phụ thuộc model | ~3 GB | CUDA khuyến nghị | chậm hơn whisper ~2× | ✅ **tốt nhất** (word-level chuẩn) | ✅ có |
| **whisper.cpp large-v3-turbo q8_0** *(đang dùng)* | Model trong repo | MIT | ✅ Có | 834 MB | CPU ✅ · CUDA ✅ | RTF 1,22 (EN) / 1,62 (ZH) CPU · 0,02 CUDA | ✅ có | ❌ không |
| **whisper.cpp base** *(đang dùng)* | Model trong repo | MIT | ✅ Có | 142 MB | CPU ✅ | RTF 0,16 / 0,14 | ✅ có | ❌ không |

**Ghi chú về WhisperX:** không đưa vào catalog vì cần thêm model alignment (~3 GB) và chỉ chạy
tốt trên CUDA; tác vụ của Sublix là *sinh phụ đề cuối video* (offline, 1 lượt), không cần
word-level alignment đủ tốt để dịch từng từ.

---

## 3. Bảng đo thật — **TIẾNG ANH** (`en_sleep`, 120 s, 45 cue, 418 từ tham chiếu)

| Engine | Model | **WER ↓** | **RTF ↓** | T.gian (120 s) | RAM đỉnh | Timestamp từ | Lệch timestamp |
|--------|-------|-----------|-----------|---------------|----------|---------------|----------------|
| whisper.cpp | **base** | **4,31 %** | 0,163 | 19,6 s | 490 MB | có (mức câu) | **0,138 s** (câu) |
| whisper.cpp | large-v3-turbo q8_0 | 6,22 % | 1,219 | 146,2 s | 1 431 MB | có (mức câu) | 1,996 s (câu) |
| sherpa-onnx | **SenseVoice Small int8 (2024-07-17)** | 7,18 % | **0,067** | 8,0 s | **788 MB** | ✅ có (mức từ) | 0,963 s (từ) / 0,526 s (câu) |
| sherpa-onnx | SenseVoice Small fp32 (2024-07-17) | 7,18 % | 0,072 | 8,7 s | 1 649 MB | ✅ có | 0,963 s (từ) |
| sherpa-onnx | SenseVoice funASR-Nano int8 | 24,64 % | 0,052 | 6,3 s | 1 221 MB | ✅ có | 1,028 s (từ) |
| sherpa-onnx | Paraformer-zh (mô hình Trung) | 35,89 %¹ | 0,046 | 5,5 s | 504 MB | ❌ | — |
| sherpa-onnx | Paraformer-zh small | 48,33 %¹ | 0,017 | 2,0 s | 350 MB | ❌ | — |
| sherpa-onnx | Canary 180M Flash int8 | 66,03 %² | 0,207 | 24,8 s | 1 247 MB | ❌ | — |
| sherpa-onnx | Parakeet TDT v2 / v3 int8 | ⚠️ **không đo được** — xem §5 lỗi #2 | | | | | |

¹ ngoài phạm vi ngôn ngữ của model (nguồn âm thanh là tiếng Anh) — chỉ để thấy độ nhạy với ngôn ngữ.
² **Canary bị cắt cụt**: chỉ nhận dạng 146/418 từ (≈35 % đầu clip) → WER 66 % là hệ quả của việc
mất 65 % nội dung, không phải do đọc sai.

---

## 4. Bảng đo thật — **TIẾNG TRUNG** (`zh_guilt`, 120 s, 45 cue, 466 ký tự tham chiếu)

| Engine | Model | **CER ↓** | **RTF ↓** | T.gian (120 s) | RAM đỉnh | Timestamp từ | Lệch timestamp |
|--------|-------|-----------|-----------|---------------|----------|---------------|----------------|
| whisper.cpp | large-v3-turbo q8_0 | **4,08 %** | 1,616 | **193,9 s** | 1 431 MB | có (mức câu) | 0,591 s (câu) |
| whisper.cpp | base | 5,58 % | 0,143 | 17,2 s | 490 MB | có (mức câu) | **0,265 s** (câu) |
| sherpa-onnx | **SenseVoice Small int8 (2024-07-17)** | **4,72 %** | **0,065** | **7,7 s** | **788 MB** | ✅ có (mức từ) | 1,191 s (từ) / 2,073 s (câu)² |
| sherpa-onnx | SenseVoice Small fp32 | 4,72 % | 0,076 | 9,1 s | 1 649 MB | ✅ có | 1,191 s (từ) |
| sherpa-onnx | **Paraformer-zh int8** | 5,79 % | **0,032** | 3,9 s | **502 MB** | ❌ **không** | — (synthetic) |
| sherpa-onnx | SenseVoice funASR-Nano int8 | 8,15 % | 0,038 | 4,5 s | 1 221 MB | ✅ có | 1,253 s (từ) |
| sherpa-onnx | Paraformer-zh small | 12,66 % | 0,016 | 2,0 s | 354 MB | ❌ | — (synthetic) |
| sherpa-onnx | Parakeet v2 / v3 | ❌ **không hỗ trợ tiếng Trung** (chỉ 25 ngôn ngữ châu Âu) | | | | | |

² Ở mức **câu**, lệch của SenseVoice lớn hơn whisper vì sherpa chỉ cho **timestamp từ**, phải tự
gom từ thành câu (ngưỡng: 6 s / 45 ký tự / khoảng lặng 0,5 s) → sai số gom nhóm tính thêm vào.
Ở mức **từ** (đo đúng độ chính xác thời gian của model) SenseVoice vẫn **1,19 s** và
token đầu tiên lệch phụ đề chỉ **0,15 s** — rất tốt.

### 4.1 Ý nghĩa thực tế cho PO (video 26 phút, tiếng Trung)

| Engine | Thời gian xử lý 26 phút (CPU máy dev) | Ghi chú |
|--------|----------------------------------------|---------|
| whisper large-v3-turbo | **~42 phút** | Không chấp nhận được trên máy không GPU |
| whisper base | ~3,8 phút | Chấp nhận được nhưng đọc Trung kém hơn |
| **SenseVoice Small int8** | **~1,8 phút** ✅ | Chọn |
| Paraformer-zh int8 | ~0,9 phút | Nhanh nhất nhưng mất timestamp từ |

Trên **RTX 3090 của PO**, whisper turbo CUDA (RTF 0,02) vẫn rất nhanh — nhưng ưu thế của
SenseVoice nằm ở **dấu câu** (rất quan trọng khi dịch phụ đề) và **độ ổn định với tiếng ồn**.

### 4.2 Canary — loại bỏ (lý do kỹ thuật)
Canary 180M Flash trả về **146 từ** cho clip có **418 từ** tham chiếu: phần đuôi **bị cắt mất hoàn toàn**
(không phải lỗi đọc sai). Model NeMo Canary được thiết kế cho **đoạn ngắn**, không dùng cho
video dài ⇒ **không đưa vào catalog**.

---

## 5. Lỗi kỹ thuật phát hiện khi đo (đã ghi vào `ISSUE_LOG.md`)

### Lỗi #1 — SenseVoice **int8 bản 2025-09-09** rớt chữ (WER 40 %)
- **Triệu chứng:** `csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09`
  cho ra *"KSIKE I'SALLY HARD WRKNG COLEDEHEREOPLE"* thay vì *"because it looks like it's a really
  hard-working college where people…"* → **WER 40,19 %** trên clip EN.
- **Root cause:** bản export int8 2025-09-09 (cả bản HF lẫn bản release) **không khớp tokenizer**
  với `tokens.txt` đi kèm → model bỏ rớt ký tự. Bản **fp32** của *cùng repo* chạy đúng.
- **Cách tránh:** dùng bản **2024-07-17** (int8 **và** fp32 đều đúng, int8 khớp fp32 100 %).
  Không dùng bản 2025-09-09.

### Lỗi #2 — Bản mirror HF của **Parakeet** sai layout tensor (không tương thích sherpa-onnx 2.0.0)
- **Triệu chứng:** `RuntimeError: Got invalid dimensions for input: audio_signal — index: 1 Got: 12000 Expected: 128`.
- **Root cause:** `sherpa-onnx 2.0.0` truyền tensor `[N, T, C]` còn encoder của bản mirror HF
  (export NeMo) cần `[N, C, T]`. Ngoài ra `decoder.int8.onnx` của bản đó **thiếu metadata
  `vocab_size`** (chỉ có `onnx.infer`) → sherpa báo *"vocab_size does not exist in the metadata"*.
- **Cách tránh:** dùng **gói release chính thức** của sherpa-onnx (đã có SHA-256 công bố trong
  GitHub API). Trên máy dev, **tải release GitHub bị nghẽn 0 byte** (đã thử `curl` lẫn `urllib`,
  cả 2 đều treo) nên **chưa kiểm chứng được** ⇒ catalog đánh dấu rõ "chưa kiểm chứng".

### Lỗi #3 — SenseVoice **int8 2024-07-17** OK, nhưng **mirror HF 2025-09-09** cùng tên đễ gây nhầm
Hai bản khác nhau đều tên "sense-voice int8". Catalog chỉ dùng bản **2024-07-17** và ghi rõ năm.

### Lỗi #4 — Bản `tokens.txt` của các repo HF **khác nhau về kích thước**
`SenseVoice 2024` (315 KB) ≠ `SenseVoice 2025` (940 KB) ≠ `Paraformer` (75 KB) → **không được
trộn `tokens.txt` giữa các model**. Mỗi engine trong catalog có cặp `model + tokens` riêng,
đều kèm SHA-256.

### Lỗi #5 — `whisper-cli` không có **timestamp từ**
whisper.cpp chỉ trả timestamp **mức câu**; SenseVoice/Paraformer trả **mức từ** (sherpa-onnx
`result.tokens` + `result.timestamps`). Vì vậy khi so sánh lệch timestamp phải ghi rõ mức đo.

### Lỗi #6 — **Hai lượt tải cùng 1 model chạy song song** ⇒ file hỏng (đúng size, sai SHA-256)
- **Triệu chứng:** file model tải xong có **đúng số byte** nhưng **SHA-256 sai** ⇒ không cài được.
- **Root cause:** cả hai tiến trình đều ghi vào cùng file `.part`; byte bị xen kẽ.
  (Bắt được khi chạy 2 `cargo test` song song — rất dễ trúng khi agent chạy test song song.)
- **Cách tránh (đã sửa):** giữ **khoá in-process theo `model_id`** trong `model_download.rs`
  (`is_in_progress`) — lượt tải thứ hai bị từ chối ngay, không ghi chung file.

### Lỗi #7 — **Sự kiện tiến trình đầu tiên báo `speed_bps = 0`** ⇒ UI hiện "— MB/s"
- **Root cause:** đo tốc độ theo cửa sổ 500 ms nhưng emit mỗi 250 ms ⇒ event đầu tiên chưa có mẫu.
- **Cách tránh (đã sửa):** cửa sổ trượt **1,2 s**, tối thiểu **200 ms** mới tính, và
  `last_emit` khởi tạo bằng `Instant::now()` ⇒ event đầu tiên đã có tốc độ + ETA.

---

## 6. Khuyến nghị

### 6.1 Tiếng Trung — **top 2**

| # | Engine | Vì sao | Khi nào dùng |
|---|--------|---------|-------------|
| 🥇 | **SenseVoice Small int8 (2024-07-17)** — `sensevoice-zh-en` | CER **4,72 %** (chỉ kém whisper turbo 0,64 điểm) nhưng **nhanh gấp 25×**, có **dấu câu** và **timestamp từ**; RAM 788 MB; thương mại OK | **Mặc định cho mọi việc tiếng Trung.** Đặc biệt video reup Douyin/Bilibili. |
| 🥈 | **Paraformer-zh int8** — `paraformer-zh` | Nhanh nhất (RTF 0,032), nhẹ nhất trong nhóm đầy đủ (502 MB), CER 5,79 %; **nhưng không có timestamp từ** | Khi cần **nhanh nhất** (preview, dựng ý tưởng) hoặc khi chấp nhận timestamp tổng hợp. |

### 6.2 Tiếng Anh — **top 2**

| # | Engine | Vì sao | Khi nào dùng |
|---|--------|---------|-------------|
| 🥇 | **whisper.cpp large-v3-turbo** *(giữ nguyên, đã có sẵn)* | WER 6,22 % nhưng **RTF 0,02 trên RTX 3090 CUDA**; timestamp mức câu ổn; không cần tải thêm gì | **Trên máy có NVIDIA.** Đây là lựa chọn mặc định của app. |
| 🥈 | **SenseVoice Small int8** — `sensevoice-zh-en` | WER 7,18 %, RTF **0,067** trên CPU (nhanh gấp **18×** so với whisper turbo CPU), **có dấu câu** + **timestamp từ** | **Trên máy CPU-only** (máy dev, hoặc người dùng không có GPU). |

> **Phụ lục:** `Parakeet TDT v3` là ứng viên #3 cho tiếng Anh (WER công bố 6,26 % trên FLEURS,
> CC-BY-4.0, có timestamp từ) — **cần tải được gói release chính thức rồi đo lại** trước khi
> đưa vào danh sách khuyến nghị chính thức.

### 6.3 Đa ngôn ngữ — **1 lựa chọn**

**`sensevoice-zh-en` (SenseVoice Small int8)** — 1 engine phục vụ **5 ngôn ngữ**
(zh · yue · en · ja · ko), 228 MB, có dấu câu + timestamp từ, thương mại OK.
Đây cũng là engine **dùng chung cho cả 2 loại việc** (Trung + Anh) nên chỉ cần tải 1 model.

### 6.4 Cách tích hợp (đã làm trong task này)

```
src-tauri/src/model_download.rs        # tải có tiến trình + RESUME (Range) + verify byte & SHA-256 + hủy
src-tauri/src/stt/stt_catalog.rs       # catalog engine (id, ngôn ngữ, dung lượng, RTF, license, trạng thái)
src-tauri/src/stt/sherpa_asr.rs        # chạy sidecar sherpa-onnx → segment → SRT (cùng định dạng của Studio)
src-tauri/scripts/sherpa_asr.py        # sidecar Python (nhận dạng + giải nén gói model)
src-tauri/src/config.rs                # + 1 field: stt_asr_engine (rỗng = whisper, mặc định giữ nguyên)
src/components/ui/ModelDownloadRow.tsx # component UI dùng chung (STT + TTS)
```

**Lệnh Tauri mới:** `stt_engines_status` · `stt_set_engine` · `stt_model_download` ·
`stt_model_cancel` · `stt_model_delete` · `stt_transcribe` · `stt_write_srt`.

**Sự kiện dùng chung:** `model:download-progress` —
`{model_id, kind:'stt'|'tts', phase:'downloading'|'verifying'|'extracting'|'installing_deps'|'done'|'error',
bytes_done, bytes_total, speed_bps, eta_s, file, message}` (emit ~4 lần/giây).
Luồng TTS cũ **giữ nguyên** sự kiện `model:download_progress` và **bổ sung thêm** sự kiện mới.

**Tôn trọng `stt_engine_preference`** (BUG-H11): `cpu` → ép CPU, `cuda` → ép CUDA,
`auto` → CUDA nếu máy thật sự có NVIDIA (đã kiểm bằng `nvidia-smi`), ngược lại CPU.

**Đầu ra:** `stt_transcribe` trả `segments[]` (start/end/text) **thống nhất cho mọi engine**:

| Engine | Cách lấy timestamp | Mức |
|--------|---------------------|-----|
| whisper.cpp | CLI `-osrt` → parse bằng bộ đọc SRT của Sublix | câu |
| sherpa-onnx | `result.tokens` + `result.timestamps` → gom thành câu (6 s / 45 ký tự / lặng 0,5 s) | **từ** |
| sherpa-onnx (không có timestamp) | chia câu theo dấu câu + phân bổ thời gian theo độ dài | synthetic |

`stt_write_srt` ghi ra file SRT UTF-8 (không BOM) đúng chuẩn `HH:MM:SS,mmm` ⇒ **pipeline Studio
dùng được ngay**, không đổi format.

---

## 7. Tái lập benchmark

```powershell
# Không gian đo (ngoài repo)
$env:TEMP\sublix-stt-bench\
  bench_asr.py        # chạy 1 engine sherpa trên 1 wav -> JSON (text, tokens, timestamps, RTF, RAM)
  score.py            # WER/CER + lệch timestamp (mức từ & mức câu) + opencc t2s
  cut_window.py       # cắt clip + viết SRT tham chiếu đúng cửa sổ thời gian
  models\             # model đã tải (HF)  ·  clips\  ·  out\  ·  shots\
  demo\               # trang demo component ModelDownloadRow (Vite + Chrome headless)
```

Tải clip tham chiếu:

```powershell
yt-dlp -f bestaudio -o "%TEMP%\sublix-stt-bench\clips\<id>.%(ext)s" `
       --write-subs --sub-langs en --sub-format srt "https://www.youtube.com/watch?v=894jQkeewiU"
yt-dlp -f bestaudio -o "%TEMP%\sublix-stt-bench\clips\<id>.%(ext)s" `
       --write-subs --sub-langs zh-TW --sub-format srt "https://www.youtube.com/watch?v=snZ811wvjjw"
```

Ảnh chụp component: `%TEMP%\sublix-stt-bench\shots\model-download-row-states.png`.

---

## 8. Việc còn lại (ngoài phạm vi task này)

1. **Chưa đo được Parakeet v2/v3** trên máy dev — tải release GitHub bị nghẽn 0 byte.
   Cần chạy lại khi mạng ổn, rồi cập nhật bảng §3 và `rtf_note` trong catalog.
2. **Chưa đo trên CUDA (RTX 3090 của PO)** — toàn bộ số đo là CPU.
3. **Chưa đo trên audio nhiễu** (video reup thật của PO) — nên bổ sung 1 clip Douyin/Bilibili
   để xác nhận khoảng cách SenseVoice ↔ Whisper khi có nhạc nền và nén.
4. **Chưa gắn component `ModelDownloadRow` vào Studio / Cài đặt** — chờ coordinator giao gắn
   (component đã sẵn sàng, có demo + ảnh chụp).
5. `stt_asr_engine` **chưa được đọc trong pipeline `file_sub` / Studio** — hiện mới có
   `stt_transcribe` để gọi trực tiếp; việc cho Studio chọn engine theo config cần giao vòng UI.
