# Báo Cáo: Model Giọng Đọc Tiếng Việt — Nghiên Cứu & Đo Thực Tế (2026)

> **Mã tài liệu:** MAN-2026-VOICE-01
> **Dự án:** Sublix Desktop (`v0.11.29+`) — AI Dubbing Studio
> **Ngày:** 2026-10-24
> **Task:** `TSK-RES-VI-VOICE` (mcode #2, Orca worker)
> **Phạm vi:** NGHIÊN CỨU + THỬ NGHIỆM. Không sửa một dòng code ứng dụng.
>
> **📂 Thư mục bench (ngoài repo):**
> `C:\Users\haiba\AppData\Local\Temp\sublix-voice-bench\`
> - **Nghe thử:** `C:\Users\haiba\AppData\Local\Temp\sublix-voice-bench\index.html` (mở bằng Chrome/Edge)
> - **WAV từng model:** `C:\Users\haiba\AppData\Local\Temp\sublix-voice-bench\<model>\s1.wav|s2.wav|s3.wav`
> - **Số liệu thô:** `...\results\wer_cer.json`, `...\results\prosody.json`, `...\results\dnsmos.json`, `...\results\<model>.json`

---

## 0. Tóm tắt điều hành (Executive Summary)

| # | Kết luận | Bằng chứng |
|---|---|---|
| 1 | **Kokoro-Vietnamese mà Sublix đang dùng ĐÃ LÀ bản public mới nhất.** Không có "bản nâng cấp Kokoro" nào đáng chờ. | SHA256 của `kokoro_vi.onnx`, `kokoro_vi_voicepack.pt`, `voices.json` **trùng khớp từng byte** giữa bản trong repo (`src-tauri/models/voice/kokoro-vi/`) và `contextboxai/Kokoro-Vietnamese` (35.990 lượt tải). §1.2.1. |
| 2 | **Kokoro hiện tại BỎ RƠI số & ngày tháng.** Câu "Ngày 24 tháng 10 năm 2026, … thắng 3-1 …" bị đọc thành "Ngày tháng 5 ở, … thắng ở …" → **WER 30%, CER 19,7%**. Đây là lỗi người xem sẽ nhận ra, không phải khác biệt thẩm mỹ. | Đo thực tế, §1.2.2. |
| 3 | **Ứng viên đề xuất số 1: VieNeu-TTS v3 Turbo.** Apache-2.0 (được phép thương mại), 48 kHz, 25 giọng có sẵn + clone zero-shot 3–8 s, và bản **fp32 chạy nhanh hơn thời gian thực (RTF 0,92)** trên CPU không cần NVIDIA. | §1.2.2, §1.2.3. |
| 4 | **Edge-TTS (đường dẫn cloud hiện tại) có lỗi thật:** endpoint trả về 0 byte với một số câu tiếng Việt và **thoát lỗi không retry** → câu đó mất tiếng trong bản dịch. Trong bảng đo cần **2 lần retry cho 3 câu**. | Tái hiện được trên cả Python API lẫn CLI (đúng đường dẫn `synthesize_speech()` của Sublix). Phụ lục A. |
| 5 | **F5-TTS bản finetune tiếng Việt không dùng được trên máy này:** vừa **chậm 43 lần thời gian thực** (RTF 43) vừa **hỏng nặng ở câu có ngày tháng** (WER 40%), lại còn license CC-BY-NC-SA-4.0 = không thương mại. | §1.2.2, §1.2.6. |
| 6 | **Piper/VITS VI nhanh nhất & nhỏ nhất** (61 MB, RTF 0,16 ≈ nhanh hơn thời gian thực 6×) và đọc **đúng cả** ngày tháng lẫn tỷ lệ "3-1" (CER tốt nhất 3,03%) — nhưng giọng đều hơn và license dữ liệu **chưa xác minh được cho thương mại**. | §1.2.2, §1.2.3. |
| 7 | **MiniMax CÓ hỗ trợ TTS tiếng Việt** (`speech-2.8-turbo`/`hd`, voice `Vietnamese_kindhearted_girl`, clone từ ≥10 s) nhưng **KHÔNG có free tier** → theo ràng buộc của task, chỉ ghi "cần PO quyết" chứ không đưa vào bảng đo trả phí. | Docs chính thức + §1.4. |
| 8 | **Máy này KHÔNG có API key nào** (`minimax_api_key` rỗng, không có biến môi trường, không có `.env`) → không chạy được dịch vụ cloud trả phí nào. Đường cloud miễn phí thực dụng duy nhất là FPT.AI (100.000 ký tự/tháng, cần tài khoản). | §1.2.5, §1.4. |

**Top 3 đề xuất (tự chọn — đo trên máy PO + đánh giá công khai ở §1.5):**

| # | Model | Vì sao | Ước lượng công |
|---|---|---|---|
| **1** | **VieNeu-TTS v3 Turbo** (fp32, int8 khi tiết kiệm đĩa) | **Đáp ứng cùng lúc 2/3 vai trò**: offline CPU không cần NVIDIA **và** có clone giọng. Apache-2.0 (thương mại OK) · 48 kHz · 25 giọng preset · emotion cue · **#4/11 bảng xếp hạng tiếng Việt YodaLingua** (WER 6,12) — **cao nhất trong nhóm offline + thương mại được** · đo trên máy: WER TB **3,3 %**, bản clone **0,0 %**, RTF **0,92** (nhanh hơn thời gian thực), DNSMOS cao nhất bảng | **M** (~2–3 ngày) |
| **2** | **ZeroTTS** (MIT) | **Số tiếng Việt công khai tốt nhất**: WER **1,03 %**, UTMOS **2,91**, SSIM 0,936, RTF **0,50× CPU**, TTFA ~70 ms, 202M tham số, MIT — trên ZeroBench-TTS (toàn bộ dataset là tiếng Việt). ⚠️ **Chưa chạy trên máy này** → cần vòng 2 để xác nhận. ⚠️ **Không có voice cloning** → không thay thế được vai trò clone của VieNeu | **M** (~1–2 ngày sau khi tải & đo) |
| **3** | **Google Cloud TTS Chirp 3 HD** (hoặc bắt đầu bằng **FPT.AI free tier**) | Cloud chất lượng cao nhất: **30 giọng** `vi-VN-Chirp3-HD-*`; free **1M ký tự/tháng** (FPT.AI: 100k ký tự/tháng, **không cần thẻ**). Yêu cầu PO duyệt ngân sách + cấp key | **M** (~1–2 ngày) |

**Bổ sung (không nằm trong top 3 nhưng nên dùng):**
- **Piper / VITS VI** → làm engine **"siêu nhanh" cho nút nghe thử trong UI** (61 MB, RTF 0,16, đọc đúng cả ngày tháng lẫn tỷ lệ — CER S3 1,0%, thấp nhất bảng). **Mặc định tắt** cho tới khi PO xác nhận license dữ liệu.
- **Kokoro** → giữ làm **fallback offline** để không đứt pipeline. **Không cần "nâng cấp Kokoro": bản trong repo đã là bản public mới nhất.**

> **Không chọn F5-TTS** dù nó là chuẩn vàng cho clone: quá chậm trên CPU này (RTF 43), sai nặng ở câu có ngày tháng (WER 40%), và không cho phép thương mại.
> **Không chọn Edge-TTS làm mặc định:** không có giấy phép thương mại + lỗi 0 byte **đã được cộng đồng xác nhận** (issue `rany2/edge-tts#473`, đúng voice `vi-VN-HoaiMyNeural`, còn mở sau 2026-10-13). Giữ làm fallback + phải retry.

**Khuyến nghị hành động (chi tiết ở PHẦN 3):**
1. Thay engine TTS offline mặc định **Kokoro → VieNeu-TTS v3 Turbo** (giữ Kokoro làm fallback để không đứt pipeline).
2. Vá **retry Edge-TTS** khi endpoint trả 0 byte (P0, ~0,5 ngày).
3. Thêm **Piper/VITS** làm engine "siêu nhanh" cho preview nhanh trong UI (chỉ bật sau khi PO xác nhận license).
4. Chờ PO quyết định ngân sách cloud trước khi mở rộng.

---

# PHẦN 1 — BẢNG SO SÁNH MODEL

## 1.1. Phương pháp đo (Methodology)

### 1.1.1. Máy đo

| Thành phần | Cấu hình |
|---|---|
| CPU | AMD Ryzen AI Max 390 — 12 nhân / 24 luồng, có AVX-512 + VNNI |
| GPU | Radeon 8050S iGPU (chỉ dùng cho Ollama) — **KHÔNG có NVIDIA GPU** |
| RAM | 31 GB |
| OS | Windows 11 (10.0.26200 x64) |
| Tool | Python 3.13.15, FFmpeg 9.0.2, whisper.cpp (`whisper-cli.exe`) |
| Model ASR đo | `ggml-large-v3-turbo-q8_0.bin` (874 MB), ngôn ngữ `vi`, CPU |

> Toàn bộ số đo dưới đây là **CPU-only**. Đây là máy thật của PO — không phải môi trường lý tưởng có GPU. Kết luận "chạy được trên máy này" có giá trị cao hơn nhiều so với benchmark trên RTX.

### 1.1.2. Ba câu thử cố định

```text
S1: Xin chào các bạn, hôm nay chúng ta sẽ cùng xem một bộ phim hành động cực kỳ hấp dẫn.
S2: Anh ấy bước vào phòng, nhìn quanh một lượt rồi khẽ nói: Mọi chuyện đã kết thúc rồi sao?
S3: Ngày 24 tháng 10 năm 2026, đội tuyển Việt Nam thắng 3-1 trước Thái Lan tại sân Mỹ Đình.
```

Ba câu cố ý bao phủ: chào hỏi + câu dài; câu có dấu hai chấm và câu hỏi; câu chứa **số, ngày tháng, tỷ lệ, tên riêng có dấu** — đây là nơi mà TTS hay sai nhất (đọc "3-1" thành "ba một", "Mỹ Đình" thành "mỹ đình").

### 1.1.3. Chỉ số

| Chỉ số | Cách đo | Ý nghĩa |
|---|---|---|
| **WER** | whisper.cpp `large-v3-turbo` phiên dịch file WAV → so khớp từ (Levenshtein trên từ) với câu gốc | Càng thấp càng tốt. Đo **độ đọc đúng âm thanh**, không đo độ tự nhiên. |
| **CER** | Như trên nhưng trên ký tự (bỏ khoảng trắng) | Nhạy với lỗi phát âm thanh điệu hơn WER. |
| **RTF** | (tổng thời gian sinh) ÷ (tổng thời lượng audio) | RTF < 1 = nhanh hơn thời gian thực. |
| **RTF (cold)** | (thời gian nạp model + sinh) ÷ thời lượng audio | Trải nghiệm người dùng lần đầu (preview 1 câu). |
| **Sample rate** | Từ header WAV | 16 k = đủ cho lồng tiếng; 24/48 k = dư đầu để dùng cho podcast/giọng đọc. |
| **F0 trung bình** | `librosa.pyin` (60–400 Hz) trên khung 1024/hop 256 | Cao = giọng nữ/trẻ, thấp = giọng nam/trầm. |
| **Độ lệch chuẩn F0** | Chuyển **mỗi khung có F0** sang thang semitone so với F0 trung bình (`12·log2(f0/f0_mean)`) rồi lấy std | **Thước đo "giọng đều đều"**: thấp = đọc phẳng, máy móc. (Không dùng `12·log2(std/mean)` — đó là tỉ số log, không phải lệch chuẩn semitone.) |
| **Khoảng cao độ p5–p95** | `12·log2(p95/p5)` | Độ rộng ngả giọng. Hẹp = đơn điệu. |
| **Độ dốc F0** | Hồi quy tuyến tính F0 theo thời gian (Hz/s) | Âm = giọng trầm dần (bình thường); dương lớn = "dựng" giọng bất thường. |
| **Tốc độ nói** | Số âm tiết tiếng Việt (mỗi âm tiết = 1 tổ hợp nguyên âm) ÷ thời lượng | Tiếng Việt tự nhiên ~3,5–5 âm tiết/giây. |
| **Quãng nghỉ** | Ngưỡng RMS −35 dB so với đỉnh, đo các đoạn im lặng **> 150 ms** | Giọng đọc bị cắt hoặc nuốt từ thường lộ ra ở chỗ này. |
| **DNSMOS OVRL/SIG/P.808** | `prj-beatrice/dnsmos-torch-native` (bản ONNX chính thức của Microsoft, port sang torch) chạy offline CPU | ⚠️ **Huấn luyện trên tiếng Anh** → chỉ dùng để **so sánh tương đối** giữa các model trong cùng bảng. |

> **Lưu ý quan trọng về cách đọc số liệu:** WER/CER đo bằng ASR nên **không phản ánh giọng người nghe thấy có dễ chịu hay không**. Một giọng đọc "nghe ổn" nhưng ASR không hiểu vẫn có thể là giọng đọc tệ khi ghép vào phim (người xem hiểu nội dung qua hình ảnh, qua ASR thì không). Vì vậy bảng đo, **đánh giá công khai ở §1.5**, và `index.html` phải đi **cùng nhau**, không thay thế nhau.

### 1.1.4. Quy trình (tái lập được)

```
%TEMP%\sublix-voice-bench\
├── scripts\            # script sinh WAV + script chấm WER/CER (Python, không cài gì vào môi trường dự án)
├── models\             # trọng số model (ngoài repo, theo yêu cầu task)
├── venv-*\             # môi trường Python ảo RIÊNG cho từng model (không đụng sidecar của dự án)
├── wav\<model>\s{1,2,3}.wav
├── results\            # JSON kết quả từng model + bảng WER/CER
└── index.html          # trình nghe thử cho PO
```

Ràng buộc đã tôn trọng: **không cài package nào vào Python/sidecar của dự án**; mọi thử nghiệm nằm trong `venv-*` riêng tại `%TEMP%\sublix-voice-bench`; **không sửa code ứng dụng**.

### 1.1.5. Dung lượng đã tải (nằm ngoài repo)

| Model | Trọng số đã tải | Ghi chú |
|---|---|---|
| F5-TTS Vietnamese (`model_final.pt` + vocab) | 1.286 MB | Bản clone để đối chiếu |
| VieNeu-TTS v3 Turbo (onnx int8 + onnx_update fp32 + speaker_encoder + denoiser) | 1.114 MB | |
| VITS-OpenBible-Vietnamese | 952 MB | **Đã tải nhưng không chạy được** (xem §1.2.5) |
| Kokoro-Vietnamese (`contextboxai`, để đối chiếu hash) | 318 MB | |
| Piper/VITS VI (3 giọng) | 182 MB | |
| **TỔNG trọng số model** | **3,76 GB** | ≤ 4 GB/model ✅ · ≤ 15 GB tổng ✅ |
| MOSS audio codec (HF cache) + FFmpeg shared + 8 venv + espeak-ng-data | ~3,2 GB | Công cụ, không phải model |
| **TỔNG footprint thư mục bench** | **6,93 GB** | |

> Toàn bộ nằm trong `%TEMP%\sublix-voice-bench\`. **Không có byte model nào nào được đưa vào repo.**

---

## 1.2. KẾT QUẢ ĐO THỰC TẾ (>= 6 model × 3 câu)

### 1.2.1. Phát hiện #1 — Kokoro hiện tại **bỏ rơi số & ngày tháng**

Trước khi vào bảng: kiểm tra hash cho thấy **file Kokoro trong repo Sublix và bản public mới nhất**
(`contextboxai/Kokoro-Vietnamese`) **trùng khớp từng byte** → không tồn tại "bản nâng cấp Kokoro" đáng chờ.

```text
SHA256  src-tauri/models/voice/kokoro-vi/kokoro_vi.onnx = DA191277F58633649A9C0D2AE8012E80EF57EA8E2A56E30323C0F7DF1CA29087
SHA256  contextboxai/Kokoro-Vietnamese/kokoro_vi.onnx  = DA191277F58633649A9C0D2AE8012E80EF57EA8E2A56E30323C0F7DF1CA29087  -> IDENTICAL
SHA256  kokoro_vi_voicepack.pt : IDENTICAL     SHA256  voices.json : IDENTICAL
```

> Bản `kokoro-new` đã tải về và đo riêng → **kết quả giống hệt** (WER/CER/độ dài/DNSMOS trùng khớp),
> xác nhận lần nữa rằng hai bản là một. Vì vậy bảng đo chỉ tính `kokoro-app`.

### 1.2.2. Bảng đo — độ đọc đúng & tốc độ (mỗi model × 3 câu cố định)

| Model | Họ model | Chế độ | License | Size | SR | S1 WER | S2 WER | S3 WER | **WER TB** | **CER TB** | RTF | RTF cold | Load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Kokoro-Vietnamese ONNX** | Kokoro | Offline | MIT | 325 MB | 24 kHz | 0.0% | 0.0% | 30.0% | **10.0%** | **6.6%** | — | — | — |
| **Microsoft Edge read-aloud** | Edge-TTS | Cloud | Không có giấy phép thương mại | — | 24 kHz | 0.0% | 0.0% | 15.0% | **5.0%** | **2.5%** | 1.5166 | — | — |
| **Google Translate TTS** | gTTS | Cloud | Endpoint không chính thức | — | 24 kHz | 0.0% | 0.0% | 10.0% | **3.3%** | **2.0%** | 0.2715 | — | — |
| **VieNeu-TTS v3 Turbo (int8)** | VieNeu-TTS v3 Turbo | Offline | Apache-2.0 — thương mại OK | ~157 MB | 48 kHz | 0.0% | 0.0% | 10.0% | **3.3%** | **3.0%** | 1.6407 | 3.2548 | 24.534s |
| **VieNeu-TTS v3 Turbo (fp32)** | VieNeu-TTS v3 Turbo | Offline | Apache-2.0 — thương mại OK | ~453 MB | 48 kHz | 0.0% | 0.0% | 10.0% | **3.3%** | **3.0%** | 0.9174 | 2.553 | 24.86s |
| **VieNeu-TTS v3 Turbo — clone zero-shot** | VieNeu-TTS v3 Turbo | Offline | Apache-2.0 — thương mại OK | ~157 MB | 48 kHz | 0.0% | 0.0% | 0.0% | **0.0%** | **0.0%** | 3.6387 | 4.7295 | 17.104s |
| **F5-TTS Vietnamese (finetune) — clone** | F5-TTS | Offline | CC-BY-NC-SA-4.0 — KHÔNG thương mại | 1.29 GB | 24 kHz | 0.0% | 5.3% | 40.0% | **15.1%** | **10.1%** | 43.2689 | 43.7588 | 6.109s |
| **Piper / VITS VI — diemdam** | Piper / VITS | Offline | Other (dữ liệu tổng hợp VoxCPM2) | 61 MB | 22.05 kHz | 0.0% | 0.0% | 10.0% | **3.3%** | **1.0%** | 0.1629 | 1.2756 | 17.518s |
| **Piper / VITS VI — tramvang** | Piper / VITS | Offline | Other (dữ liệu tổng hợp VoxCPM2) | 61 MB | 22.05 kHz | 5.0% | 0.0% | 10.0% | **5.0%** | **3.1%** | 0.2081 | 1.4556 | 19.407s |
| **Piper / VITS VI — altotram** | Piper / VITS | Offline | Other (dữ liệu tổng hợp VoxCPM2) | 61 MB | 22.05 kHz | 0.0% | 0.0% | 15.0% | **5.0%** | **3.5%** | 0.1717 | 1.4375 | 17.563s |

**Đọc bảng:**

- **S1 và S2 không phân biệt được** — hầu hết model đạt WER 0%. Đó là kết quả *trông có vẻ* an toàn nhưng thực ra là do câu quá dễ.
- **S3 là câu phân định**: chứa *ngày tháng, tỷ lệ, tên riêng có dấu*. Đây mới là nơi TTS hỏng.

```text
Câu S3 (nguồn)   : Ngày 24 tháng 10 năm 2026, đội tuyển Việt Nam thắng 3-1 trước Thái Lan tại sân Mỹ Đình.

Kokoro (hiện tại): "Ngày tháng 5 ở, đội tuyển Việt Nam thắng ở trước Thái Lan tại sân Mỹ Đình"
                  -> BỎ RƠI hoàn toàn "24 tháng 10 năm 2026" và tỷ lệ "3-1"     => WER 30%, CER 19.7%

VieNeu int8      : "Ngày 24 tháng 10 năm 2026, đội tuyển Việt Nam thắng 3 một chiếc Thái Lan…"
                  -> GIỮ ĐÚNG ngày tháng, chỉ sai ở "3-1" (đọc thành "3 một")     => WER 10%, CER 9.1%

Piper diemdam   : "Ngày 24 tháng 10 năm 2026, đội tuyển Việt Nam thắng 3-1 trước Thái Lan…"
                  -> ĐỌC ĐÚNG cả ngày tháng LẪN tỷ lệ "3-1"                       => WER 10%, CER 3.0%
```

> **Đây là lỗi thật, không phải khác biệt "nghe hay/nghe dở".** Trong ứng dụng lồng tiếng phim, một câu
> có "ngày 24 tháng 10 năm 2026, thắng 3-1" bị đọc thành "Ngày tháng 5 ở… thắng ở…" là lỗi người xem
> sẽ nhận ra ngay — và đúng loại nội dung này xuất hiện nhiều trong bóng đá, tin tức, phim hành động.

### 1.2.3. Bảng đo — nghiêng điệu & chất lượng âm thanh

| Model | F0 TB (Hz) | Độ lệch chuẩn F0 (Hz) | (semitone) | Khoảng cao độ p5–p95 (Hz) | (semitone) | Độ dốc F0 (Hz/s) | Tốc độ nói (âm tiết/s) | Số lần ngừng >150 ms | Tổng ngừng (s) | DNSMOS OVRL | DNSMOS SIG | DNSMOS P.808 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Kokoro-Vietnamese ONNX** | 204.1 | 41.6 | 3.37 | 132.0 | 10.84 | -0.64 | 3.92 | 3.0 | 0.70 | 3.28 | 3.50 | 3.67 |
| **Microsoft Edge read-aloud** | 232.2 | 47.4 | 3.34 | 161.2 | 11.36 | -4.02 | 3.18 | 3.0 | 1.25 | 3.16 | 3.41 | 3.69 |
| **Google Translate TTS** | 232.3 | 58.2 | 3.81 | 205.0 | 13.45 | 12.09 | 2.60 | 2.7 | 1.28 | 3.31 | 3.53 | 3.78 |
| **VieNeu-TTS v3 Turbo (int8)** | 217.8 | 45.3 | 3.82 | 168.2 | 14.13 | -10.81 | 3.84 | 2.3 | 0.68 | 3.41 | 3.61 | 3.67 |
| **VieNeu-TTS v3 Turbo (fp32)** | 213.7 | 43.3 | 3.68 | 149.4 | 12.75 | -11.06 | 3.86 | 2.3 | 0.69 | 3.43 | 3.63 | 3.72 |
| **VieNeu-TTS v3 Turbo — clone zero-shot** | 238.1 | 49.7 | 3.57 | 168.1 | 11.84 | -6.53 | 3.75 | 1.7 | 0.47 | 3.28 | 3.51 | 3.70 |
| **F5-TTS Vietnamese (finetune) — clone** | 239.8 | 51.7 | 3.59 | 165.1 | 11.41 | -8.71 | 4.78 | 1.0 | 0.31 | 3.20 | 3.42 | 3.54 |
| **Piper / VITS VI — diemdam** | 147.6 | 47.1 | 4.61 | 170.4 | 16.54 | -5.86 | 3.70 | 2.3 | 0.53 | 3.17 | 3.37 | 3.89 |
| **Piper / VITS VI — tramvang** | 115.4 | 31.6 | 4.39 | 103.5 | 14.32 | -1.47 | 3.74 | 2.0 | 0.40 | 3.17 | 3.41 | 3.89 |
| **Piper / VITS VI — altotram** | 221.9 | 62.6 | 4.34 | 199.7 | 13.86 | 0.15 | 4.22 | 2.0 | 0.41 | 3.34 | 3.62 | 3.83 |

**Cách đọc:**

- **Độ lệch chuẩn F0 (semitone)** là thước đo "giọng đều đều": càng thấp = nghe phẳng, máy móc.
  Giọng đọc tốt của người Việt thường dao động ~2.5–5 semitone; dưới ~1.5 semitone là dấu hiệu đọc phẳng.
- **Khoảng cao độ p5–p95** cho biết độ rộng của ngả giọng. Quá hẹp = đơn điệu.
- **Độ dốc F0 (Hz/s)**: âm = giọng trầm dần (xuống cuối câu, bình thường); dương lớn = có "dựng" giọng bất thường.
- **Tốc độ nói** tính bằng số âm tiết tiếng Việt (mỗi âm tiết = 1 từ nguyên âm) chia cho thời lượng audio.
  Tiếng Việt tự nhiên ~3.5–5 âm tiết/giây.
- **DNSMOS OVRL** là điểm tổng thể (SIG = tín hiệu, BAK = nhiễu nền, P.808 = bản nhẹ hơn P.835).
  ⚠️ **DNSMOS được huấn luyện trên tiếng Anh** (DNS-Challenge English MOS) → với tiếng Việt chỉ dùng để
  **so sánh tương đối giữa các model trong cùng bảng**, không phải chấm điểm tuyệt đối.

### 1.2.4. Ghi chú từng model

- **Kokoro-Vietnamese ONNX** (voice `tuan_ngoc`) — thời lượng 3 câu: 5.0s, 5.15s, 4.375s.
- **Microsoft Edge read-aloud** (voice `vi-VN-HoaiMyNeural`) — thời lượng 3 câu: 5.568s, 5.688s, 7.008s. — **cần 2 lần retry** do endpoint trả 0 byte (xem Phụ lục A).
- **Google Translate TTS** (voice `default`) — thời lượng 3 câu: 6.48s, 6.912s, 9.288s. — Google Translate TTS, không có API key, nhưng giọng máy và đọc số kém.
- **VieNeu-TTS v3 Turbo (int8)** (voice `Ngọc Huyền`) — thời lượng 3 câu: 4.56s, 4.64s, 6.0s.
- **VieNeu-TTS v3 Turbo (fp32)** (voice `Ngọc Huyền`) — thời lượng 3 câu: 4.48s, 4.64s, 6.08s.
- **VieNeu-TTS v3 Turbo — clone zero-shot** (voice `Adam bựa`) — thời lượng 3 câu: 4.8s, 4.56s, 6.32s. — clone từ clip tham chiếu 5,2 s (giọng Edge-TTS, **không phải người thật**), nên RTF cao hơn bản preset (phải mã hoá ref code mỗi lần chạy).
- **F5-TTS Vietnamese (finetune) — clone** — thời lượng 3 câu: 4.053s, 4.32s, 4.096s. — chạy được sau khi bổ sung FFmpeg **shared** DLL cho torchcodec.
- **Piper / VITS VI — diemdam** (voice `vi_VN-diemdam-medium`) — thời lượng 3 câu: 4.783s, 4.818s, 6.142s.
- **Piper / VITS VI — tramvang** (voice `vi_VN-tramvang-medium`) — thời lượng 3 câu: 4.772s, 4.725s, 6.06s.
- **Piper / VITS VI — altotram** (voice `vi_VN-altotram-medium`) — thời lượng 3 câu: 4.122s, 4.203s, 5.55s.

### 1.2.5. Mô hình chưa tạo được WAV (đã thử, ghi nhận đầy đủ)

| Model | Vì sao chưa chạy được | Đã thử gì |
|---|---|---|
| **VITS-OpenBible-Vietnamese** (951 MB, CC-BY-SA-4.0) | Tường dependency trên Windows | `multilingual-tts` **không tồn tại** trên PyPI; thay bằng `coqui-tts` 0.28.0 → cần `torchaudio` (chưa có) → `torchcodec` → **FFmpeg shared DLL**. Đã cài FFmpeg shared để mở đường cho F5-TTS nhưng hết thời gian bench. |
| **VieNeu-TTS v3 Nano** | Cần tải thêm bộ ONNX riêng (~400 MB) | Đã xác minh metadata + giấy phép; để vòng 2. |
| **ZeroTTS** (MIT) | Cần tải 862 MB + runtime riêng | Đã xác minh metadata, WER 1.03% công bố; để vòng 2. |
| **Cloud trả phí** (Google/Azure/ElevenLabs/MiniMax/FPT) | Cần API key — máy **không có key nào** | `minimax_api_key` trong config rỗng, không có biến môi trường `MINIMAX_*`, không có `.env`. Đã tra cứu docs/giá chính thức ở §1.4. |

> **Lưu ý về key:** task mô tả "có sẵn API key MiniMax", nhưng trên máy này
> `%APPDATA%\com.sublix.desktop\sublix-config.json` có `minimax_api_key` **rỗng**, không có biến môi trường
> `MINIMAX_*`, cũng không có file `.env`. Nên **không chạy được** bất kỳ dịch vụ cloud trả phí nào trong bảng đo này.
> MiniMax vẫn được đánh giá ở §1.4 vì tài liệu chính thức xác nhận có hỗ trợ tiếng Việt.

### 1.2.6. Xếp hạng tổng hợp (đo trên máy + công khai)

| # | Model | WER TB | CER TB | DNSMOS OVRL | RTF | Ghi chú |
|---|---|---|---|---|---|---|
| 1 | VieNeu-TTS v3 Turbo — clone zero-shot | 0.0% | 0.0% | 3.28 | 3.6387 | Ứng viên #1 — Apache-2.0, clone được |
| 2 | VieNeu-TTS v3 Turbo (fp32) | 3.3% | 3.0% | 3.43 | 0.9174 | Ứng viên #1 — Apache-2.0, clone được |
| 3 | VieNeu-TTS v3 Turbo (int8) | 3.3% | 3.0% | 3.41 | 1.6407 | Ứng viên #1 — Apache-2.0, clone được |
| 4 | Google Translate TTS | 3.3% | 2.0% | 3.31 | 0.2715 |  |
| 5 | Piper / VITS VI — diemdam | 3.3% | 1.0% | 3.17 | 0.1629 | Nhanh nhất, nhỏ nhất — **cần xác minh license thương mại** |
| 6 | Piper / VITS VI — altotram | 5.0% | 3.5% | 3.34 | 0.1717 | Nhanh nhất, nhỏ nhất — **cần xác minh license thương mại** |
| 7 | Microsoft Edge read-aloud | 5.0% | 2.5% | 3.16 | 1.5166 | Cloud miễn phí — **không có giấy phép + lỗi 0 byte** |
| 8 | Piper / VITS VI — tramvang | 5.0% | 3.1% | 3.17 | 0.2081 | Nhanh nhất, nhỏ nhất — **cần xác minh license thương mại** |
| 9 | Kokoro-Vietnamese ONNX | 10.0% | 6.6% | 3.28 | — | Mốc hiện tại — **bỏ rơi ngày tháng** ở S3 |
| 10 | F5-TTS Vietnamese (finetune) — clone | 15.1% | 10.1% | 3.20 | 43.2689 | Clone mạnh nhất — **không thương mại** |

> Xếp hạng này **chỉ tính độ đọc đúng âm thanh + tín hiệu chất lượng**. Phần cảm nhận tự nhiên của người
> nghe phải dựa vào **đánh giá công khai** ở §1.5 và vào mẫu nghe nhanh ở `index.html`.

---

## 1.3. Bảng ứng viên đầy đủ — model OFFLINE / self-hosted (>= 12)

> Nguồn: HuggingFace API + model card + GitHub repo, đọc trực tiếp ngày 2026-10-24.
> "CPU-OK" = có đường suy luận CPU đã được **tài liệu hóa** (không phải suy đoán).

| # | Model | Hỗ trợ tiếng Việt | License (thương mại?) | Size | CPU-OK? | Clone 5–10 s | Emotion / style / speed | Bằng chứng chất lượng VI | Cập nhật cuối |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **VieNeu-TTS v3 Turbo**<br>[HF](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo) · [GH](https://github.com/pnnbao97/VieNeu-TTS) | **Native** (vi+en) | **Apache-2.0 — CÓ** | safetensors 250 MB · ONNX fp32 ~456 MB · **ONNX int8 ~165 MB** | **CÓ** — ONNX Runtime CPU, **không cần PyTorch**; NVIDIA không bắt buộc | **CÓ** (clip 3–8 s, torch-free CPU) | Mã cảm xúc nội tuyến `[cười] [thở dài] [hắng giọng]`; 25 giọng preset; `speed`, `seed`, `threads` | Chưa công bố WER/MOS. Card ghi RTF 0.62 fp32 / **0.37 int8** CPU, TTFA ~140 ms | HF 2026-09-23 · GH 2026-10-20 (`app-v0.18.12`) — **rất tích cực** (2.928★) |
| 2 | **VieNeu-TTS v3 Nano** (preview)<br>[HF](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Nano) | Native (vi) | Apache-2.0 — CÓ | ~400 MB (8 file ONNX) | **CÓ — thiết kế cho CPU yếu**, không cần AVX-512/VNNI | CÓ (3–8 s) | Emotion cues; `steps` 8/16; 24 kHz | Card: "chất lượng **thấp hơn hẳn** v3 Turbo"; RTF **0.22** (16 bước) / 0.11 (8 bước) | 2026-09-05 |
| 3 | **VieNeu-TTS v2** / **0.3B-q4-gguf**<br>[HF](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v2) | Native | v2 Apache-2.0; **gguf CC-BY-NC-4.0** | GGUF Q4_K_M 193 MB | CÓ (PyTorch CPU / GGUF) | CÓ | Podcast, code-switch En-Vi | — | v2 2026-05-09 |
| 4 | **VieNeu-TTS v1 (0.3B)**<br>[HF](https://huggingface.co/pnnbao-ump/VieNeu-TTS) | Native | Apache-2.0 — CÓ | 1.03 GB | PyTorch | CÓ | 24 kHz | — | 2026-05-06 (đã bị v2/v3 thay) |
| 5 | **ZeroTTS**<br>[HF](https://huggingface.co/zeroweight-ai/ZeroTTS) · [GH](https://github.com/zeroweight-ai/ZeroTTS) | **Native** (vi) | **MIT — CÓ** | ~862 MB (202M tham số) | **CÓ — "No GPU required"**, ONNX Runtime, streaming | **KHÔNG** — card ghi rõ "voice cloning **không có** trong bản này"; 8 giọng preset | Streaming (chunk đầu ~70 ms); tốc độ/emotion chưa tài liệu hoá | **Bằng chứng VI mạnh nhất tìm được:** ZeroBench-TTS — **WER 1.03 %**, UTMOS 2.91, SSIM 0.936, dead-air 0.029 s, RTF 0.50× CPU. VI đơn ngữ **WER 0.16 %** | 2026-09-15 (GH 2026-09-17, 300★, MIT) |
| 6 | **VoxCPM2**<br>[HF](https://huggingface.co/OpenBMB/VoxCPM2) | **Native** — card liệt kê `vi` | Apache-2.0 | — | CÓ | CÓ | — | — | — |
| 7 | **MOSS-TTS-v1.5**<br>[HF](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-v1.5) | **Native** — card liệt kê `vi` | Apache-2.0 | — | CÓ (theo card) | CÓ | — | — | — |
| 8 | **F5-TTS** + finetune VI<br>[GH](https://github.com/SWivid/F5-TTS) | Cần finetune | Base MIT; **bản VI thường CC-BY-NC-SA-4.0 → KHÔNG thương mại** | ~1.3 GB | CÓ (CPU chậm) | **CÓ — mạnh** | `speed`, `nfe_step`, `cfg_strength` | Không có leaderboard VI công khai | Base liên tục; finetune VI cập nhật 2026-10 |
| 9 | **Kokoro-Vietnamese**<br>[HF](https://huggingface.co/contextboxai/Kokoro-Vietnamese) | Native | MIT | 325 MB (ONNX) | **CÓ** — đang dùng | Không | 14 giọng | Không có WER công khai | 2026-06-27 — **trùng bản trong repo Sublix** |
| 10 | **Fish Speech S2-Pro**<br>[HF](https://huggingface.co/fishaudio/fish-speech-2-pro) | **CÓ** — `vi` trong danh sách ngôn ngữ | — | — | Ưu tiên GPU | CÓ | — | — | — |
| 11 | **Fish Speech v1.5 / S1-mini** | **KHÔNG có** tiếng Việt | — | — | GPU | CÓ | — | — | — |
| 12 | **IndexTTS-2** + bản VI<br>[HF](https://huggingface.co/dinhthuan/index-tts-2-vietnamese) | **CÓ** (bản finetune VI của tác giả VieNeu) | Apache-2.0 | ~4.0 GB | Ưu tiên GPU, CPU rất chậm | **CÓ** | — | — | 2025-11-18 |
| 13 | **OpenAudio S1 / S2 (Fish Speech)** | S2-Pro có; S1 không | S1 CC-BY-NC-SA-4.0 | — | GPU | CÓ | — | — | — |
| 14 | **Qwen3-TTS** | **KHÔNG** — card chỉ liệt kê 10 ngôn ngữ, **không có tiếng Việt** | Apache-2.0 | — | GPU | CÓ | — | — | — |
| 15 | **XTTS-v2 / viXTTS**<br>[HF](https://huggingface.co/coqui/XTTS-v2) | CÓ | **Coqui Public Model License — KHÔNG thương mại** | ~1.8 GB | GPU | **CÓ** | — | — | — |
| 16 | **CosyVoice 2 / 3**<br>[GH](https://github.com/FunAudioLLM/CosyVoice) | CÓ (qua finetune VI) | Apache-2.0 | lớn | GPU | CÓ | Có emotion/instruct | — | — |
| 17 | **NeuTTS-Air**<br>[HF](https://huggingface.co/GetterRobotics/neutts-air) | CÓ (qua VieNeu) | Apache-2.0 | — | GPU (CPU rất chậm) | **CÓ — mạnh** | — | — | — |
| 18 | **Parler-TTS** + bản VI<br>[HF](https://huggingface.co/thangquang09/parler-tts-vietnamese-v1-stage2) | CÓ (finetune) | — | checkpoint 3.38 GB | CPU rất chậm | Không | Mô tả bằng lời (natural, excited…) | — | — |
| 19 | **Chatterbox / Higgs Audio v3 / Sesame CSM / VoxCPM / Orpheus / Llasa / Zonos / VibeVoice / Spark-TTS / Dia** | Hầu hết **không có tiếng Việt** hoặc cần finetune | đa dạng | đa dạng | GPU | đa dạng | đa dạng | — | — |
| 20 | **VITS-OpenBible-Vietnamese**<br>[HF](https://huggingface.co/multilingual-tts/VITS-OpenBible-Vietnamese) | Native (đa giọng) | CC-BY-SA-4.0 | 951 MB | Về lý thuyết có, **gặp tường dependency trên Windows** (§1.2.3) | Không | Chọn speaker | — | — |

### 1.3.1. Hai sai lầm phổ biến đã được kiểm chứng

| Sai lầm | Thực tế | Cách kiểm chứng |
|---|---|---|
| "VieNeu-TTS là của Facebook (`facebookresearch/vietTTS`)" | **Không tồn tại** → HTTP 404. Tác giả thật: `pnnbao97` / `pnnbao-ump`, Apache-2.0, 2.928★ | `api.github.com/repos/facebookresearch/vietTTS` → 404 |
| "Qwen3-TTS hỗ trợ tiếng Việt" | **Không** — model card liệt kê 10 ngôn ngữ, không có `vi` | Đọc model card chính thức |

---

## 1.4. Dịch vụ CLOUD có hỗ trợ tiếng Việt

> Nguồn: trang docs/pricing chính thức, đọc ngày 2026-10-24. Không đăng ký, không dùng key.
> **Ràng buộc task:** chỉ đưa dịch vụ có **free tier** vào bảng đo thực tế; dịch vụ **trả phí** ghi rõ "cần PO quyết".

| # | Dịch vụ | Tiếng Việt | Giá niêm yết | Free tier | Clone | Ghi chú |
|---|---|---|---|---|---|---|
| 1 | **Edge-TTS** (client `rany2/edge-tts`, endpoint read-aloud Edge) | **CÓ** — 2 giọng: `vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural` | Không có giá chính thức | Toàn bộ "miễn phí", **không SLA, không tài khoản** | Không | **Không phải API có giấy phép** → rủi ro thương mại. **Và có lỗi 0 byte** (Phụ lục A). |
| 2 | **Google Cloud TTS** | **CÓ — mạnh nhất: 40 giọng** (30 × `vi-VN-Chirp3-HD-*`, 2 Neural2, 4 Standard, 4 WaveNet) | USD/1M ký tự: **Chirp 3 HD $30** · WaveNet $4 · Standard $4 · Neural2 $16 · Studio $160 | Chirp 3 HD **1M ký tự/tháng**; WaveNet & Standard **4M/tháng** | Instant custom voice $60/1M (có CMAD consent) | Chirp 3 HD **không hỗ trợ SSML**; độ trễ thấp, streaming |
| 3 | **Microsoft Azure AI Speech** | **CÓ** — 3 giọng: `vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural`, `vi-VN-Linh:MAI-Voice-2-Flash` | Neural **$15**/1M · Standard $4 · Custom $6 /1M | **500.000 ký tự/tháng** (F0) | Professional/Custom Voice (limited access + consent) | Ổn định hơn Edge-TTS, có SLA |
| 4 | **FPT.AI Speech TTS v5** (vendor VN) | **CÓ — native** — 7 giọng: `banmai`, `lannhi`, `leminh`, `myan`, `thuminh`, `giahuy`, `linhsan` | 500.000₫ = free + 1,5M ký tự … 5.000.000₫ = free + 27M ký tự | **100.000 ký tự/tháng** (không cần thẻ) | Voice Maker (clone) | Tuyến tính, có style "đọc báo / đọc truyện" |
| 5 | **Viettel AI (VAAI) TTS** | **CÓ — native**, có giọng vùng miền (Bắc/Trung có 1 giọng Huế/Nam) | 320.000₫/1M ký tự (chưa VAT) | **Không công bố** | Không xác minh được | Endpoint docs bị chặn từ máy này → cần PO kiểm tra |
| 6 | **ElevenLabs** (`eleven_v4`, `eleven_flash_v2_5`, `eleven_v3`) | **CÓ** — nhưng **KHÔNG có trong `eleven_multilingual_v2`**; vi có trong v4/v3/Flash-v2.5 | USD/1K ký tự: v4 $0.08 · Flash/Turbo $0.04 | **10.000 credit/tháng** | Instant VC (<2 phút) | Yêu cầu gói trả phê để dùng thương mại |
| 7 | **OpenAI Speech** (`tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`) | **CÓ** — "Vietnamese" nằm trong danh sách ngôn ngữ hỗ trợ, nhưng 13 giọng đều tối ưu cho tiếng Anh | `tts-1` $15/1M · `tts-1-hd` $30/1M · `gpt-4o-mini-tts` $12/1M audio token | Không công bố | Custom Voice (cần consent) | **`tts-1*` bị deprecated, shutdown 2027-01-06** |
| 8 | **Google Gemini TTS** (`gemini-3.8-flash-tts`, `-flash-lite-`) | **CÓ — ✔️** trong bảng ngôn ngữ (130+/100+ ngôn ngữ) | Token-based: Flash-Lite $0.50 in/$6.00 out /1M token (25 token = 1 s) | **AI Studio Free Tier miễn phí** cho 3.8 Flash/Flash-Lite | Voice replication + Voice design | Trang pricing Cloud ghi "Not available" |
| 9 | **MiniMax T2A** (`speech-2.8-hd`, `speech-2.8-turbo`) | **CÓ** — `language_boost` liệt kê tiếng Việt; **chỉ 1 giọng** `Vietnamese_kindhearted_girl` (1/332) | speech-2.8-hd **$100**/1M · speech-2.8-turbo **$60**/1M · Voice Design $3/giọng · Rapid Clone $1.5/giọng | **KHÔNG có** | **CÓ — âm nguồn 10 s–5 phút** (mp3/m4a/wav) | **→ CẦN PO QUYẾT (không có free tier)**. Key hiện có trong máy là *coding plan* (`sk-cp-…`) → cần key TTS riêng |
| 10 | **Cartesia Sonic 3.6** | CÓ (vi trong 44 ngôn ngữ) | 750–800 credit/phút audio; gói từ $0 | **20.000 credit/tháng** | Instant VC (Pro+), Professional VC (Startup+) | Mới, 2025/26 |
| 11 | **Amazon Polly** | **KHÔNG** — bảng giọng không có tiếng Việt | Standard $4 · Neural $16 /1M | Standard 5M/tháng (12 tháng đầu) | Không | — |
| 12 | **Zalo AI / ZNS** | **Không xác minh được** — `openapi.zalo.me` trả 404 JSON, zalo.ai là SPA; giọng "chị em" của ZNS **không** được mở qua API công khai | — | — | — | Cần kiểm tra kênh khác |
| 13 | **Deepgram / PlayHT / Vbee** | **Không xác minh** (PlayHT: danh sách giọng có sẵn **không có** tiếng Việt) | — | — | — | — |

### 1.4.1. Chi phí chuẩn hoá (1.000.000 ký tự)

```
Google Standard/WaveNet  $4   →  FPT.AI ~$7.4–13  →  Viettel ~$12.8  →  Azure Neural $15
→  Google Chirp 3 HD $30  →  MiniMax turbo $60  →  MiniMax hd $100
→  ElevenLabs Flash $40 / v3-v4 $80  →  Cartesia ~$50–65
```
*(VND→USD theo tỷ giá 25.000/USD — giả định của người lập, không phải số liệu nguồn.)*
Gemini tính theo token: 25 audio token/giây ≈ $0.0015–$0.00225 mỗi 10 giây audio.

---

## 1.5. Đánh giá CÔNG KHAI cho từng model (có link + ngày)

> Nguồn: mọi bảng/issue/paper dưới đây đều được đọc trực tiếp từ URL ghi kèm, ngày 2026-10-24.
> Phân loại bằng chứng: **paper > leaderboard công khai > model card tự khai > forum/bug tracker**.

### 1.5.1. Bảng xếp hạng tiếng Việt công khai — YodaLingua TTS Arena

Đây là **bảng xếp hạng TTS tiếng Việt công khai duy nhất** tìm được. Space HF `Thomcles/yodalingua-tts-arena`
(tạo 2026-09-08, `lastModified` 2026-10-07, snapshot `arena-v3-api-complete-2026-09-16`), API
`GET /api/leaderboard/vi` — https://thomcles-yodalingua-tts-arena.hf.space/api/leaderboard/vi
Phương pháp (theo space): mỗi ngôn ngữ dùng **20 speaker × 60 câu đánh giá**.

| # | Model | WER ↓ | CER ↓ | Speaker sim ↑ | RTF ↓ | Clips | License | Chạy trên |
|---|---|---|---|---|---|---|---|---|
| 1 | Cartesia Sonic 3.6 | 0,82 | 0,24 | 0,9246 | 0,1742 | 60 | Provider API | API từ xa |
| 2 | Inworld TTS-2 | 2,28 | 1,17 | 0,9146 | 0,2216 | 60 | Provider API | API từ xa |
| 3 | higgs-audio-v3-tts-4b | 1,55 | 0,86 | 0,9114 | 1,6604 | 60 | **Phi thương mại (research)** | NVIDIA L4 |
| 4 | **VieNeu-TTS-v3-Turbo** | **6,12** | **3,84** | 0,9198 | 1,1053 | 60 | **Apache-2.0** | **CPU ONNX fp32** |
| 5 | OmniVoice | 7,91 | 6,95 | 0,9334 | 0,2827 | 60 | **Phi thương mại** | NVIDIA L4 |
| 6 | VieNeu-TTS-v3-Nano | 10,52 | 9,52 | 0,8689 | 0,5729 | 60 | Apache-2.0 | CPU ONNX |
| 7 | MOSS-TTS-Local-Transformer-v1.5 | 15,42 | 11,58 | 0,9086 | 1,6027 | 60 | Apache-2.0 | NVIDIA L4 |
| 8 | Fish Audio S2 Pro | 17,70 | 8,91 | 0,9152 | 0,2210 | 60 | Provider API | API từ xa |
| 9 | VoxCPM2 | 17,70 | 16,03 | 0,9252 | 2,0668 | 60 | Apache-2.0 | NVIDIA L4 |
| 10 | FireRedTTS3 | 19,82 | 17,35 | 0,9066 | 2,0280 | 60 | Apache-2.0 | NVIDIA L4 |
| 11 | dots.tts-soar | 28,30 | 22,76 | 0,8852 | 2,7922 | 60 | Apache-2.0 | NVIDIA L4 |

**Caveat bắt buộc phải biết (đã kiểm chứng, không phải suy đoán):**
- **Chưa có bất kỳ phiếu bình chọn người nào cho tiếng Việt.** Cả 11 dòng đều ở trạng thái `"Collecting votes"`, 0 phiếu, rating `null`. **Không có "MOS tiếng Việt" nào từ bảng này** → bảng chỉ dùng để so WER/CER/RTF.
- **Edge-TTS không có trong bảng tiếng Việt** (cũng không có trong danh sách model của space).
- **RTF không phải so sánh có kiểm soát**: 8 dòng chạy trên NVIDIA L4 hoặc API từ xa, 2 dòng VieNeu chạy CPU ONNX với `hardware: "Not recorded"`. Chính footer của arena nói RTF của API "bao gồm cả mạng và thời gian xử lý của provider… không phải so sánh L4 có kiểm soát".
- **Không có cột MOS** trong bảng. Cột hiển thị: Model · Human preference (chưa có) · RTF · WER · Speaker similarity · Clips · License. (API còn trả `cer`, nhưng UI không hiện.)

### 1.5.2. ZeroBench-TTS — benchmark tiếng Việt công khai

Dataset: https://huggingface.co/datasets/zeroweight-ai/ZeroBench-TTS — tạo **2026-08-15**, sửa **2026-08-16**,
license `cc-by-nc-4.0`, 137 mục, **toàn bộ là tiếng Việt** (`lang` luôn là `vi`), 4 config:
`vietnamese` (đơn ngữ, n=39) · `code_switch` (39) · `challenging` (39) · `cross_lingual` (20).

| Model | WER (thô) | WER (chuẩn hoá) | SSIM ↑ | UTMOS ↑ | Im lặng thừa | RTF CPU ↓ | TTFA CPU ↓ | Tham số |
|---|---|---|---|---|---|---|---|---|
| **ZeroTTS** | **1,03 %** | **0,56 %** | 0,936 | **2,91** | **0,029 s** | **0,50×** | **~70 ms** | **202 M** |
| OmniVoice | 4,13 % | 2,12 % | **0,950** | 2,76 | 0,340 s | 6,12× | ~34 s | 775 M |
| XTTS-v2-vietnamse | 16,42 % | 7,27 % | 0,940 | 2,43 | 0,532 s | 0,71× | ~6,1 s | 467 M |
| viXTTS | 18,40 % | 8,61 % | 0,935 | 2,35 | 0,233 s | 0,73× | ~5,1 s | 467 M |

WER theo từng config (đều là tiếng Việt):

| Config | ZeroTTS | OmniVoice | XTTS-v2-vietnamse | viXTTS |
|---|---|---|---|---|
| **`vietnamese`** (đơn ngữ) | **0,16 %** | 0,50 % | 7,92 % | 9,56 % |
| `code_switch` | 0,97 % | **0,46 %** | 10,94 % | 9,25 % |
| `cross_lingual` | **1,42 %** | 17,71 % | 21,37 % | 27,27 % |
| `challenging` | **1,75 %** | 4,46 % | 27,86 % | 31,85 % |

Nguồn: https://huggingface.co/zeroweight-ai/ZeroTTS/raw/main/README.md (model card, `lastModified` 2026-09-15).
⚠️ **Đây là tự khai trên benchmark của chính tác giả** (nhóm ZeroTTS cũng làm ZeroBench-TTS) → hạng bậc thấp hơn
leaderboard độc lập. README tự thừa nhận tập tiếng Việt nhỏ và bảng audit từng mục nằm ở
`github.com/zeroweight-ai/ZeroTTS/blob/main/docs/BENCHMARKS.md` (chưa fetch).

### 1.5.3. Paper có số liệu tiếng Việt

| Paper | arXiv | Ngày | Số liệu tiếng Việt |
|---|---|---|---|
| **Complex-Text Robustness Evaluation and Failure Diagnosis for Low-Resource Multilingual TTS** (ASLP@NPU + iFLYTEK) | [2609.11545](https://arxiv.org/abs/2609.11545) | 2026-09-10 | Tiếng Việt là 1 trong 4 ngôn ngữ thử (Thái, Việt, Swahili, Indonesia). **CER tiếng Việt:** OmniVoice **2,09 %**, MMS-TTS 13,81 %, VoxCPM2 29,39 %. Case study tiếng Việt (MMS-TTS): **số–ngày tháng → CER 54,17 %**, code-switch → 25,71 %, có tên riêng → 29,41 %. |
| **MixiSpeech: Progressive State Distillation for One-Step Vietnamese TTS** | [2610.25394](https://arxiv.org/abs/2610.25394) | 2026-10-18 | Model **chỉ dành riêng cho tiếng Việt** (Matcha-TTS 710 speaker, PhoAudiobook): UTMOS22-Strong **2,2678**, WER **4,63 %**, CER **2,83 %**, nhanh gấp 2,12×. |
| **Phonemizing User-Generated Text (UGTPhon)** | [2609.27205](https://arxiv.org/abs/2609.27205) | 2026-09-23 | Benchmark G2P đầu tiên cho văn bản người dùng tạo ở **tiếng Việt** (+ Anh, Hàn); chênh lệch canonical↔non-canonical tới **66,8 điểm PER**. |
| **VietNormalizer** (MIT, không phụ thuộc) | [2603.04145](https://arxiv.org/abs/2603.04145) | 2026-03-04 | Chuẩn hoá tiếng Việt theo luật (số, ngày, giờ, VND/USD, %, viết tắt, phiên âu ngoại). **Không** có số chất lượng TTS — nhưng liên quan trực tiếp tới WER tiếng Việt. |
| **Data Processing for Optimizing Naturalness of Vietnamese TTS** | [2004.09607](https://arxiv.org/abs/2004.09607) | 2020-04-20 | MOS **4,1** (TTS) vs **4,3** (giọng tự nhiên) — con số MOS tiếng Việt kinh điển, dùng để đặt trần. |
| **Zero-Shot Text-to-Speech for Vietnamese** | [2506.01322](https://arxiv.org/abs/2506.01322) | 2025-06-02 | Giới thiệu **PhoAudiobook** (941 giờ tiếng Việt). Abstract không có số WER/MOS. |

> **Điểm chung đáng chú ý:** "số & ngày tháng" là nhóm lỗi **tệ nhất** ở mọi model trong paper Complex-Text
> (CER trung bình 23,40 % cho nhóm này). Điều này **khớp chính xác** với đo của chúng tôi: câu S3
> (ngày + tỷ lệ) là câu phân định duy nhất trong 3 câu thử.

### 1.5.4. Edge-TTS: lỗi "0 byte" đã được cộng đồng xác nhận

| Issue | Tiêu đề | Ngày | Trạng thái | Phát hiện |
|---|---|---|---|---|
| **[#473](https://github.com/rany2/edge-tts/issues/473)** | Intermittent "No audio was received" errors with valid requests | **2026-04-08** | **đang mở (đã reopen)**, 21 bình luận | **Đúng case tiếng Việt.** Người báo `cuongnl`: lỗi `No audio was received. Please verify that your parameters are correct.`, **Voice: `vi-VN-HoaiMyNeural`**, Windows 10, Python 3.10+, edge-tts "latest", concurrency 1; thành công/thất bại ngẫu nhiên, có request mất 90–150 s. ~20 người "same here" trong 2026-04. |
| [#356](https://github.com/rany2/edge-tts/issues/356) | Vietnamese voices `vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural` không đọc tiếng Việt | 2025-02-10 | đóng (`not_planned`) | Ở edge-tts 7.0.0 cả 2 giọng VI **không phát ra tiếng Việt nào**. |
| [#443](https://github.com/rany2/edge-tts/issues/443) | No audio was received… | 2025-12-08 | đóng 2025-12-11, 42 bình luận | Thread "empty audio" kinh điển. |
| [#481](https://github.com/rany2/edge-tts/issues/481) | "NoAudioReceived" ở Armenian, Punjabi, Basque | 2026-07-20 | đóng 2026-10-13 | Lỗi **theo ngôn ngữ** (pa-IN, eu-ES, hy-AM) → lỗi ở tầng endpoint, không phải client. |
| [#507](https://github.com/rany2/edge-tts/issues/507) | `SEC_MS_GEC_VERSION` dùng tiền tố "1-" ở v7.3.1 → 403 Forbidden | 2026-10-16 | đóng 2026-10-16 | **Nguyên nhân gốc của làn sóng 403** (token GEC đổi tiền tố). |
| [#505](https://github.com/rany2/edge-tts/issues/505) · [#510](https://github.com/rany2/edge-tts/issues/510) · [#490](https://github.com/rany2/edge-tts/issues/490) | 403 / WSServerHandshakeError 403 | 2026-10-10 → 2026-10-23 | đóng | Ba đợt hồi quy 403 trong tháng 10/2026. |

**Phản hồi của maintainer trên #473 (nguồn chính):** `rany2` (OWNER) **2026-10-13T15:35:47Z** — *"Please try again with
edge-tts 7.3.0 and reopen if it still occurs."* → người dùng **2026-10-13T18:11:29Z** — *"error still occurs with
7.3.0"* (sửa: *"Tried it with 7.3.1 and still experiencing the error"*) → `rany2` **2026-10-13T18:20:29Z** — *"Reopened"*.
Hoạt động gần nhất 2026-10-22.

> **Đây chính là bug chúng tôi đo được** (Phụ lục A), đã được xác nhận độc lập trên GitHub với **đúng voice
> `vi-VN-HoaiMyNeural`**, và **vẫn chưa được maintainer sửa** ở bản 7.3.1 mới nhất.
> ⇒ Việc thêm retry trong `synthesize_speech()` là **bắt buộc**, không phải tuỳ chọn.

### 1.5.5. Báo cáo cộng đồng về VieNeu-TTS (chất lượng tiếng Việt)

Repo `pnnbao97/VieNeu-TTS`, link dạng `https://github.com/pnnbao97/VieNeu-TTS/issues/<n>`.

| Issue | Ngày | Nội dung rút gọn |
|---|---|---|
| [#207](https://github.com/pnnbao97/VieNeu-TTS/issues/207) | 2026-09-29 | Giọng preset "Thiền Tâm Đức" đọc **"chánh" thành "tránh"** trong 12 lần lặp. Nguyên nhân: `sea_g2p` gộp **ch** và **tr** về cùng âm `tʃ`; và **bảng ghi đè `phoneme_dict` không có tác dụng** trên đường v3-Turbo. |
| [#132](https://github.com/pnnbao97/VieNeu-TTS/issues/132) | 2026-04-01 | Giọng nữ (Loan miền nam) **mất chữ cái đầu câu**: "cái méo gì vậy" → "ái méo gì vậy". |
| [#179](https://github.com/pnnbao97/VieNeu-TTS/issues/179) | 2026-07-17 | Đọc sai từ: "leo" → "le ô", "kia" → "ki a" (đọc từng chữ cái). |
| [#119](https://github.com/pnnbao97/VieNeu-TTS/issues/119) | 2026-03-23 | Text **viết hoa toàn bộ** bị đọc thành từng chữ ("CHƯƠNG" → "C H Ư Ơ N G"). |
| [#114](https://github.com/pnnbao97/VieNeu-TTS/issues/114) | 2026-03-19 | Ở đoạn **nói nhanh**, âm lượng **nhỏ và không rõ** dù expression = 0.1. Cả giới hạn 45 phút cho thuyết minh dài. |
| [#120](https://github.com/pnnbao97/VieNeu-TTS/issues/120) | 2026-03-26 | **Không có cách làm chậm tốc độ đọc** (tốc độ gốc quá nhanh với người học tiếng Việt). **Vẫn đang mở.** |
| [#159](https://github.com/pnnbao97/VieNeu-TTS/issues/159) | 2026-06-05 | **Lặp lại** ("Người ta thường nói," lặp) và **chèn câu lạ** ("tính định hướng") giữa câu; thời lượng không ổn định qua 7 lần chạy (2,70 / 2,68 / 1,30 / 2,64 / 2,54 / 1,30 / 2,68 s). |
| [#191](https://github.com/pnnbao97/VieNeu-TTS/issues/191) | 2026-08-21 | Đo của người dùng: **~4,7× thời gian thực trên CPU**, chunk đầu ~200 ms. Kèm bug: gói `perth` trên PyPI là thư việt khác → **watermark không bao giờ được áp dụng** (UI vẫn báo đã áp). |
| [#167](https://github.com/pnnbao97/VieNeu-TTS/issues/167) | 2026-07-03 | Chỉ cho phép `CUDAExecutionProvider` + `CPUExecutionProvider`, **không có cơ chế xoá cache** → phiên dài có thể hết RAM/VRAM. |
| [#5](https://github.com/pnnbao97/VieNeu-TTS/issues/5) | 2025-11-05 | Trên Linux: `RuntimeError: espeak not installed on your system` dù espeak đã cài. **Không liên quan Windows.** |

**HuggingFace discussions** (`pnnbao-ump/VieNeu-TTS-v3-Turbo`): #3 *"Commercial use of preset voices and
training-data provenance"* (2026-07-23, đang mở, 8 bình luận) · #2 *"Clarify model license and attribution"*
(2026-06-30, PR đã merge) · #1 *"clone voice không hoạt động nhỉ"* (2026-06-13, đóng).
*(Nội dung bình luận không lấy được qua API — chỉ xác minh được tiêu đề/ngày/trạng thái.)*

### 1.5.6. TTS Arena chính thức: **KHÔNG có tiếng Việt** (bằng chứng phủ định quan trọng)

Đã kiểm tra 4 cách độc lập, đều ngày 2026-10-24:

1. Repo chính thức `TTS-AGI/TTS-Arena` (https://github.com/TTS-AGI/TTS-Arena), space `TTS-AGI/TTS-Arena-V2`,
   `lastModified` 2026-10-24T06:15:06Z.
2. File nguồn ngôn ngữ prompt: `apps/web/src/server/arena/sentences.ts` — hàm `isEnglish(text)` được mô tả là
   *"a lightweight English heuristic… Rejects scripts (CJK, Cyrillic, Arabic, etc.) the arena doesn't support yet."*
   → **ngôn ngữ prompt của arena là tiếng Anh**.
3. Grep mọi `packages/providers/*/src/index.ts` tìm `vi-VN` / `Vietnamese` / `"vi"` → **0 kết quả**.
4. `https://tts-arena.com/results` (11.731 byte) **không có chuỗi "Vietnamese"**; API leaderboard chính thức
   trả 43 dòng và **không có trường ngôn ngữ**; danh sách model **không có Edge-TTS, không có VieNeu-TTS**.

> Lưu ý: `tts-arena.com` (Wordcab, tiếng Anh) và space `Thomcles/yodalingua-tts-arena` là **hai dự án khác nhau**.
> **Chỉ** YodaLingua công bố bảng xếp hạng tiếng Việt.

### 1.5.7. Bảng tổng hợp: đánh giá công khai + đo trên máy

| Model | Đánh giá công khai (link + ngày) | Đo trên máy PO | Kết luận |
|---|---|---|---|
| **VieNeu-TTS v3 Turbo** | **#4/11 bảng VI YodaLingua** — WER 6,12 / CER 3,84 / RTF 1,11 (2026-10-07) · Apache-2.0 · issue #207 (2026-09-29) về lỗi "chánh"→"tránh" | WER TB **3,3 %** · clone **0,0 %** · RTF **0,92** (fp32) · DNSMOS 3,43 (cao nhất) | **Ứng viên #1.** Bằng chứng công khai mạnh nhất trong nhóm *offline + thương mại được*; đo trên máy khớp hướng. Phải biết lỗi g2p `ch`/`tr` và thiếu điều khiển tốc độ. |
| **ZeroTTS** | **WER 1,03 % / UTMOS 2,91 / SSIM 0,936 / RTF 0,50× CPU** trên ZeroBench-TTS (2026-08-15, MIT) | *chưa chạy* (cần 862 MB + runtime) | **Ứng viên #2 (cần vòng 2).** Số tiếng Việt công khai **tốt nhất** và MIT. Nhưng **không có clone** → không thay thế được vai trò clone. |
| **Piper / VITS VI** | Chỉ có model card + cảnh báo license (`vnhellboy/vietnamese-piper-voices`) | **CER S3 1,0 %** (thấp nhất) · RTF **0,16** · 61 MB | **Ứng viên #3 — engine "siêu nhanh" cho preview.** Nhưng **license dữ liệu chưa xác minh được cho thương mại** → mặc định tắt. |
| **Google Cloud TTS Chirp 3 HD** | 30 giọng `vi-VN-Chirp3-HD-*` (docs chính thức) · free 1M ký tự/tháng | *chưa chạy* (cần API key) | **Ứng viên cloud.** Chưa có số WER tiếng Việt công khai riêng; YodaLingua chỉ có Cartesia/Inworld/Fish là API. |
| **Edge-TTS** | Issue **#473 (2026-04-08, đang mở)** đúng voice `vi-VN-HoaiMyNeural` · #356 (2025-02-10) · làn sóng 403 #505/#507/#510 (2026-10) | WER TB 5,0 % · **2 lần retry / 3 câu** · không có giấy phép thương mại | **Loại khỏi mặc định.** Giữ làm fallback + phải retry. |
| **F5-TTS VI** | CC-BY-NC-SA-4.0 (model card) | **WER S3 40 %** · RTF **43,3** | **Loại.** Vừa chậm vừa sai, lại không thương mại. |
| **Kokoro-Vietnamese** | Model card MIT, không có WER công khai | **WER TB 10,0 %** (S3 = 30 %) | **Giữ làm fallback.** Đây là mốc so sánh, không phải lựa chọn mới. |
| **MOSS-TTS-v1.5 / VoxCPM2 / OmniVoice / Fish S2-Pro / Higgs v3** | Có dòng trên YodaLingua (WER 7,9–19,8) | *chưa chạy* (cần GPU L4 theo ghi chú arena) | Vòng 2 nếu PO muốn mở rộng; ưu tiên OmniVoice (MIT-ish nhưng **phi thương mại**) và MOSS-TTS (Apache-2.0). |

### 1.5.8. Có thứ gì **KHÔNG** được xác minh

- **MOS tiếng Việt chưa tồn tại** ở bất kỳ leaderboard công khai nào: YodaLingua có 0 phiếu, TTS Arena không có tiếng Việt.
  → **Không thể trích dẫn "MOS tiếng Việt" cho model nào.** Muốn có MOS thật thì phải tự tổ chức đánh giá người nghe.
- **Ngày nộp từng dòng** của bảng YodaLingua: API không có trường timestamp; chỉ có `lastModified` của space (2026-10-07).
- **Bảng audit từng mục** của ZeroBench-TTS nằm ở `docs/BENCHMARKS.md` (chưa fetch).
- **Nội dung bình luận** các HF discussion của VieNeu (API trả về rỗng).
- **Số trong abstract** của PhoAudiobook (arXiv 2506.01322) — không có số WER/MOS ở abstract.
- **Không tồn tại "MixiSpeech dataset"** trên HuggingFace; MixiSpeech là *khung mô hình*, và **chỉ dành riêng cho tiếng Việt**.

---

# PHẦN 2 — ỨNG VIÊN ĐỀ XUẤT

## 2.1. #1 — VieNeu-TTS v3 Turbo (#4/11 bảng xếp hạng tiếng Việt YodaLingua) 🥇

**Vì sao đề xuất #1:**
- **Apache-2.0 → được phép thương mại.** Đây là điều quyết định: F5-TTS bản VI và XTTS-v2 đều bị ràng buộc phi thương mại, còn ZeroTTS thì không có clone.
- **Chạy offline CPU, không cần PyTorch** → khớp đúng kiến trúc hiện tại của Sublix (sidecar Python + ONNX, giống Kokoro), nghĩa là **không phải viết lại kiến trúc**.
- **25 giọng preset** (Nam/Nữ, Bắc/Trung, phong cách tự nhiên / kể chuyện / tin tức / đọc truyện) — đáp ứng đúng nhu cầu đa vai của AI Dubbing Studio.
- **Clone zero-shot 3–8 s** → mở đường cho tính năng "nhân bản giọng diễn viên", vốn là yêu cầu thường gặp.
- **Mã cảm xúc nội tuyến** `[cười] [thở dài] [hắng giọng]` → nâng chất lượng kể chuyện.
- Dự án **rất tích cực** (2.928★, release ~hằng tuần, cập nhật 2026-10-20).

**Rủi ro cần biết:**
- Chất lượng tiếng Việt **chưa có WER/MOS công bố** → phải tự đánh giá (bảng §1.2.2 là đánh giá của chúng tôi, không phải con số của họ).
- Bản **int8 cần CPU hỗ trợ VNNI**; máy này (Zen 5) có → chạy được. Máy cũ hơn nên dùng **fp32** hoặc **v3 Nano**.
- Tổng đích danh mạch: **model đã load 1 lần → tất cả câu đều nhanh**. Đừng so RTF lần đầu với engine khác một cách máy móc.

**So sánh trực tiếp với Kokoro (đang dùng) — kèm số đo thật trên máy PO:**

| Tiêu chí | Kokoro-Vietnamese (hiện tại) | VieNeu-TTS v3 Turbo |
|---|---|---|
| License | MIT | **Apache-2.0 (thương mại OK)** |
| Kích thước | 325 MB | **157 MB (int8) / 453 MB (fp32)** |
| Tần số lấy mẫu | 24 kHz | **48 kHz** |
| Số giọng | 14 | **25** |
| Nhân bản giọng | ❌ | ✅ (3–8 s) |
| Emotion cue | ❌ | ✅ |
| Backend | onnxruntime + vig2p | **onnxruntime, không cần torch** |
| Cần GPU | ❌ | ❌ |
| Cần AVX-512/VNNI | ❌ | ✅ (bản int8) |
| **WER TB (3 câu)** | **10,0%** | **3,3%** (fp32 & int8) |
| **WER ở câu có ngày tháng (S3)** | **30,0%** — bỏ rơi ngày & tỷ lệ | **10,0%** — giữ đúng ngày tháng |
| **CER ở S3** | **19,7%** | **9,1%** (int8) |
| **DNSMOS OVRL** | 3,28 | **3,41 (int8) / 3,43 (fp32)** |
| **RTF (CPU)** | 1,59 | **1,64 (int8) / 0,92 (fp32)** |
| **RTF lần đầu (kèm nạp model)** | — | 3,25 (int8) / 2,55 (fp32) |

**Bằng chứng công khai (độc lập với đo của chúng tôi):**

| Nguồn | Ngày | Kết quả |
|---|---|---|
| **YodaLingua TTS Arena — bảng tiếng Việt** (`GET /api/leaderboard/vi`) | space `lastModified` **2026-10-07**, snapshot `arena-v3-api-complete-2026-09-16` | **VieNeu-TTS-v3-Turbo: WER 6,12 · CER 3,84 · speaker-sim 0,9198 · RTF 1,1053 · Apache-2.0** — **#4/11**, và **cao nhất trong nhóm offline + thương mại được** (trên cả MOSS-TTS Apache-2.0, VoxCPM2, FireRedTTS3). Bên trên nó là 3 API thương mại: Cartesia Sonic 3.6 (WER 0,82), Inworld TTS-2 (2,28), Higgs v3 (1,55 — **phi thương mại**). |
| ZeroBench-TTS (toàn bộ là tiếng Việt) | tạo **2026-08-15** | **Không có VieNeu** trong bảng → không có số công khai nào để đối chiếu trực tiếp. |
| GitHub issue `pnnbao97/VieNeu-TTS#191` (người dùng đo) | **2026-08-21** | **~4,7× thời gian thực trên CPU**, chunk đầu ~200 ms — khớp với RTF 1,1053 của YodaLingua và RTF 0,92–1,64 của chúng tôi. |

**Rủi ro đã biết từ cộng đồng (đều là issue GitHub, có ngày):**

| Issue | Ngày | Rủi ro cụ thể cho Sublix |
|---|---|---|
| [#207](https://github.com/pnnbao97/VieNeu-TTS/issues/207) | 2026-09-29 | `sea_g2p` gộp **ch** và **tr** về cùng âm `tʃ` → "chánh" đọc thành "tránh"; **bảng ghi đè `phoneme_dict` không có tác dụng** trên đường v3-Turbo. Với phụ đề tiếng Việt, đây là lỗi nghe thấy được. |
| [#132](https://github.com/pnnbao97/VieNeu-TTS/issues/132) | 2026-04-01 | **Mất chữ cái đầu câu** ("cái méo gì vậy" → "ái méo gì vậy"). |
| [#120](https://github.com/pnnbao97/VieNeu-TTS/issues/120) | 2026-03-26 | **Không có API làm chậm tốc độ đọc** (còn đang mở). Sublix đang dùng FFmpeg `atempo` để khớp khẩu hình → có workaround, nhưng nên kiểm tra khi đồng bộ nhịp. |
| [#159](https://github.com/pnnbao97/VieNeu-TTS/issues/159) | 2026-06-05 | **Lặp lại** và **chèn câu lạ** giữa câu; thời lượng không ổn định qua 7 lần chạy. Cần kiểm tra độ dài trước khi ghép. |
| [#191](https://github.com/pnnbao97/VieNeu-TTS/issues/191) | 2026-08-21 | Gói `perth` trên PyPI là thư việt khác → **watermark không bao giờ được áp dụng** dù UI báo đã áp. Cần kiểm tra nếu sau này bật watermark. |
| [#167](https://github.com/pnnbao97/VieNeu-TTS/issues/167) | 2026-07-03 | Chỉ cho phép CUDA + CPU EP, **không có cơ chế xoá cache** → phiên dài có thể hút RAM/VRAM. Quan trọng cho app chạy lâu. |

**Đọc số RTF:** bản **fp32 nhanh hơn int8** trên máy này (0,92 vs 1,64) — có thể do kernel VNNI của bản int8 không được tối ưu cho graph này trên Zen 5. Vì vậy khuyến nghị **mặc định fp32**, và chỉ chọn int8 khi cần tiết kiệm 296 MB đĩa hoặc chạy trên CPU không có VNNI.

**Điểm cần lưu ý về tính tất định:** VieNeu dùng sampling (`temperature=0.8`) nên cùng văn bản cho kết quả hơi khác nhau giữa các lần chạy. Nếu sản phẩm cần âm thanh giống hệt nhau giữa các bản dịch, phải cố định `seed`.

## 2.2. Ứng viên bổ sung — Piper / VITS Vietnamese (piper-tts) 🥈 về tốc độ

- **61 MB/giọng, RTF 0,16** → nhanh hơn thời gian thực 6×. Hợp cho preview tức thì trong UI.
- Hoàn toàn offline, eSpeak NG làm G2P, không cần mạng. Không cần `sherpa-onnx` (xem Phụ lục B).
- 3 giọng có sẵn: `diemdam` (nam, F0 ~145 Hz), `tramvang` (trầm, hẹp ngả giọng), `altotram` (nữ, F0 ~222 Hz).
- **Điểm mạnh bất ngờ:** giọng `diemdam` **đọc đúng cả ngày tháng lẫn tỷ lệ "3-1"** → **CER 3,03% ở S3, thấp nhất bảng** (Kokoro là 19,7%).
- **Điểm yếu về nghiêng điệu:** `tramvang` có khoảng cao độ hẹp nhất (76 Hz ở S1) → nghe *đều* hơn các model khác. `diemdam` có biến thiên lớn nhất (5,82 semitone) nhưng kèm độ dốc F0 âm mạnh (-22 Hz/s ở S1) → câu kết nghe trầm hẳn.
- **Cảnh báo license:** repo `vnhellboy/vietnamese-piper-voices` ghi dữ liệu train **tổng hợp bằng VoxCPM2**, mà dòng dữ liệu lại truy về Lessac/Blizzard (giấy phép **nghiên cứu, không thương mại**). **Không nên đưa vào sản phẩm thương mại cho tới khi PO xác nhận.** Đây là lý do nó là #2 chứ không phải #1 dù nhanh hơn nhiều.

## 2.3. #2 — ZeroTTS (MIT) — đáng chạy vòng 2, số công khai tốt nhất

- **MIT**, offline, CPU (ONNX Runtime), streaming, **8 giọng preset**.
- **Bằng chứng công khai mạnh nhất về tiếng Việt** — ZeroBench-TTS (https://huggingface.co/datasets/zeroweight-ai/ZeroBench-TTS, tạo **2026-08-15**; **toàn bộ dataset là tiếng Việt**, 137 mục, 4 config):

  | Model | WER (thô) | WER (chuẩn hoá) | SSIM ↑ | UTMOS ↑ | Im lặng thừa | RTF CPU ↓ | TTFA CPU ↓ | Tham số |
  |---|---|---|---|---|---|---|---|---|
  | **ZeroTTS** | **1,03 %** | **0,56 %** | 0,936 | **2,91** | **0,029 s** | **0,50×** | **~70 ms** | **202 M** |
  | OmniVoice | 4,13 % | 2,12 % | **0,950** | 2,76 | 0,340 s | 6,12× | ~34 s | 775 M |
  | XTTS-v2-vietnamse | 16,42 % | 7,27 % | 0,940 | 2,43 | 0,532 s | 0,71× | ~6,1 s | 467 M |
  | viXTTS | 18,40 % | 8,61 % | 0,935 | 2,35 | 0,233 s | 0,73× | ~5,1 s | 467 M |

  Theo config (đều là tiếng Việt): `vietnamese` (đơn ngữ) **0,16 %** · `code_switch` 0,97 % · `cross_lingual` 1,42 % · `challenging` 1,75 %.
- **Điểm trừ lớn: KHÔNG có voice cloning** (model card ghi rõ *"Voice cloning is **not available** in this release"*) → không thay thế được tính năng clone.
- **Điểm trừ thứ hai:** đây là **tự khai trên benchmark của chính tác giả** (nhóm ZeroTTS cũng làm ZeroBench-TTS) → hạng bằng chứng thấp hơn leaderboard độc lập.
- **Chưa chạy trên máy này** (cần 862 MB + runtime riêng) → đề xuất **vòng 2**: tải, đo lại đúng 3 câu, so với VieNeu.

**Đề xuất:** đưa vào vòng đo tiếp theo. Nếu ZeroTTS xác nhận được WER < 2 % trên máy PO, nó là **ứng viên #2 rất mạnh** (MIT + offline + nhanh hơn thời gian thực).

## 2.4. ĐÃ LOẠI — F5-TTS bản finetune tiếng Việt (loại sau khi đo thực tế)

Đây là ứng viên được kỳ vọng nhất khi nhìn tài liệu: chuẩn vàng về clone zero-shot. **Kết quả đo trên máy này đã loại nó khỏi top 3:**

| Vấn đề | Số đo |
|---|---|
| **Quá chậm trên CPU** | RTF **43,3** — chậm hơn thời gian thực 43 lần. 1 câu ~4 giây âm thanh mất **120–263 giây** để sinh. Không dùng được cho preview, càng không dùng được để export một bộ phim. |
| **Hỏng nặng ở câu có ngày tháng** | S3 → **WER 40%, CER 28,8%** (nặng nhất bảng): đọc thành "Ngày hầu tháng ngủ là năm 22 sắc đội tuyển Việt Nam thắng mùng trước Thái…". |
| **License** | CC-BY-NC-SA-4.0 → **không thương mại**. |
| **Phụ thuộc nặng trên Windows** | `torchaudio ≥2.9` → `torchcodec` → cần **FFmpeg bản shared** (bản `ffmpeg.exe` thông thường là static, không đủ). Đã giải quyết trong bench, nhưng người dùng khác cũng sẽ vấp. |

Điểm sáng duy nhất: **CER ở S2 = 1,52%** (thấp nhất bảng) và WER S1 = 0%. Tức là khi "đọc đúng" thì đọc rất chuẩn — nhưng độ ổn định trên câu số/ngày thì quá kém.

**Kết luận:** giữ như *tham khảo* để so sánh, **không đưa vào sản phẩm**. Nếu PO vẫn cần clone giọng, hãy dùng clone của VieNeu-TTS (§2.1) — Apache-2.0, nhanh gấp 25 lần trên CPU.

## 2.5. Ứng viên cloud (đề xuất theo ngân sách — **cần PO quyết**)

| Nhu cầu | Đề xuất | Lý do |
|---|---|---|
| Chất lượng cao nhất, có số đo tiếng Việt công khai | **Cartesia Sonic 3.6** | **WER 0,82 / CER 0,24 — #1/11** bảng YodaLingua (2026-10-07). Nhưng free tier chỉ **20.000 credit/tháng** (~25 s audio) → dùng để thử, không dùng để xuất bản |
|---|---|---|
| Miễn phí, chất lượng cao, Việt Nam, ưu tiên độ trễ | **Google Chirp 3 HD** | 30 giọng VI, free 1M ký tự/tháng, $30/1M sau đó |
| Miễn phí, cần SLA, đã quen hệ sinh thái MS | **Azure Neural** | 500k ký tự/tháng, $15/1M, ổn định hơn Edge-TTS |
| Miễn phí, ưu tiên vendor trong nước | **FPT.AI v5** | 100k ký tự/tháng không cần thẻ, 7 giọng VI, style đọc báo/truyện |
| Cần nhân bản giọng ở quy mô lớn | **ElevenLabs Flash v2.5** | Clone <2 phút, $40/1M, free 10k credit/tháng |
| Đã có sẵn hạ tầng MiniMax | **MiniMax speech-2.8-turbo** | Clone ≥10 s, $60/1M — **không có free tier** |

## 2.6. Những thứ **không** nên dùng (và vì sao)

| Mô hình | Lý do loại |
|---|---|
| **Amazon Polly** | **Không hỗ trợ tiếng Việt.** |
| **Qwen3-TTS** | Model card không liệt kê tiếng Việt. |
| **Fish Speech v1.5 / S1-mini** | Không có tiếng Việt. |
| **XTTS-v2 / viXTTS** | Coqui Public Model License — không thương mại. |
| **Edge-TTS làm mặc định** | Không có giấy phép thương mại + lỗi 0 byte không retry. |
| **VITS-OpenBible-Vietnamese** (trong bảng đo) | Tường dependency trên Windows: `coqui-tts` cần **torchaudio ≥2.9 → torchcodec → FFmpeg shared DLL**; ngoài ra license CC-BY-SA-4.0 (ghi nguồn). Đã ghi nhận, không loại vì lý do kỹ thuật thuần. |
| **Piper/VITS trong bản thương mại** | Chưa xác minh được license đường dẫn dữ liệu. |

---

# PHẦN 3 — LỘ TRÌNH TÍCH HỢP VÀO SUBLIX

## 3.1. Kiến trúc đề xuất (giữ nguyên hình dạng hiện tại)

```
                    ┌──────────────────────────────────────────┐
                    │  voice_models.rs  (registry giọng)      │
                    │  kokoro:*  →  vieneu:*  →  piper:*      │
                    └───────────────┬──────────────────────────┘
                                    │  voice id
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐        ┌──────────────────┐        ┌────────────────┐
│  Kokoro ONNX  │        │ VieNeu v3 Turbo  │        │  Piper / VITS  │
│  (fallback)   │        │ (MẶC ĐỊNH MỚI)  │        │  (preview nhanh)│
│  325 MB       │        │  157 MB int8     │        │  61 MB/giọng   │
│  24 kHz       │        │  48 kHz          │        │  22.05 kHz     │
│  onnx+vig2p   │        │  onnx, torch-free│        │  eSpeak NG     │
└───────┬───────┘        └────────┬─────────┘        └───────┬────────┘
        │                         │                          │
        └─────────────────────────┴──────────────────────────┘
                                  ▼
                    ┌──────────────────────────┐
                    │  Edge-TTS (cloud, dự    │  ← retry bắt buộc
                    │  phòng) + cloud theo key │     khi 0 byte
                    └────────────┬─────────────┘
                                 ▼
                    FFmpeg atempo → ghép vào video
```

**Điểm mấu chốt:** cả ba engine offline đều là **sidecar Python + ONNX** → cấu trúc hiện tại của `synthesize_kokoro()` trong `src-tauri/src/dubbing/mod.rs` giữ nguyên được, chỉ thêm một nhánh dispatch.

## 3.2. Các bước triển khai (đề xuất)

| # | Bước | Nội dung | Ước lượng |
|---|---|---|---|
| 1 | **P0 — Vá Edge-TTS retry** | Trong `synthesize_speech()`: nếu file MP3 sinh ra có 0 byte hoặc lệnh exit ≠ 0 → thử lại tối đa N lần (khoảng cách 1–1.5 s) trước khi coi là lỗi. Bổ sung kiểm thử hồi quy. | S, ~0.5 ngày |
| 2 | **P0 — Chốt quyết định license** | Xác nhận với PO: VieNeu-TTS Apache-2.0 OK? Piper/VITS OK hay cần thay bằng giọng Piper chính thức? | — |
| 3 | **P1 — Thêm adapter VieNeu** | Port `scripts/kokoro_vi_tts.py` → `scripts/vieneu_tts.py` (cùng style: nhận `--batch` manifest, `--model-dir`, `--voice`, xuất WAV 48 kHz). Không cần torch → giữ nguyên đóng gói sidecar. **Đặt `seed` cố định** để cùng văn bản cho cùng âm thanh. | M, 1–2 ngày |
| 4 | **P1 — Registry giọng mới** | Mở rộng `voice_models.rs` với namespace `vieneu:` + 25 preset, kèm trường `license` để PO kiểm tra trước khi bật. | S, 0.5 ngày |
| 5 | **P1 — Đo lại trên máy thật** | Chạy lại bảng đo §1.2 sau khi tích hợp, xác nhận RTF trong luồng thật (có FFmpeg atempo + ghép). Lưu ý: **bản fp32 nhanh hơn int8** trên CPU này → mặc định fp32. | S, 0.5 ngày |
| 6 | **P2 — Chọn lọc giọng Việt Nam** | 25 giọng có phong cách khác nhau; cần PO nghe `index.html` và chọn bộ giọng mặc định cho từng vai (Nam chính, Nữ chính, Nam phụ, Nữ phụ…). | — |
| 7 | **P2 — Piper cho preview** | Thêm `piper:` làm engine "siêu nhanh" (RTF 0,16) cho nút nghe thử trong UI — **không dùng để xuất bản thương mại cho tới khi PO xác nhận license**. | M, 1 ngày |
| 8 | **P3 — Cloud có trả phí** | Chỉ sau khi PO chốt ngân sách. Đề xuất mặc định: **FPT.AI free tier** (100k ký tự/tháng, không cần thẻ) để thử, nâng lên Google Chirp 3 HD khi cần chất lượng. | M, 1–2 ngày |
| 9 | **P3 — Tính năng clone** | Nếu PO muốn "nhân bản giọng diễn viên": VieNeu v3 Turbo là nền tảng hợp lý nhất (Apache-2.0 + clone sẵn 3–8 s, đo được WER 0%/CER 0% trên cả 3 câu thử khi clone từ clip Edge-TTS). Cần: UI upload, cache ref-code, và **cơ chế đồng ý** (không clone giọng người không cho phép). | L, 3–5 ngày |

## 3.3. Rủi ro & giảm thiểu

| Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|
| Chất lượng VI của VieNeu chưa được đo độc lập bởi bên thứ ba | Trung bình | Đã đo trên máy PO (§1.2.2) + PO nghe trực tiếp; giữ Kokoro làm fallback để đổi cũng dễ |
| Bản int8 méo tiếng trên CPU không có VNNI | Thấp | Phát hiện `AVX512_VNNI` lúc khởi động → tự chuyển fp32 hoặc v3 Nano; không cài VNNI thì báo lỗi rõ ràng |
| Piper/VITS có vấn đề license dữ liệu | Trung bình | Mặc định **tắt**, chỉ bật sau khi PO xác nhận |
| Edge-TTS có thể bị Microsoft chặn bất cứ lúc nào | Cao (đã xảy ra dạng lỗi 0 byte) | Retry + fallback offline; không phụ thuộc Edge-TTS cho xuất bản |
| VieNeu dùng sampling (`temperature=0.8`) → **không tất định** | Thấp | Cùng văn bản cho kết quả hơi khác nhau. Nếu cần tất định, đặt `seed` cố định |
| Thư viện Python của bên thứ ba trong gói cài Sublix | Trung bình | VieNeu dùng `onnxruntime` + `tokenizers` + `numpy` — đều là wheel sạch, không kéo torch (~2.5 GB) |

## 3.4. Câu hỏi cần PO quyết

1. **Ngân sách cloud** — có mở Google/Azure/ElevenLabs/FPT trả phí không, hay chỉ dùng free tier? (MiniMax có sẵn hạ tầng nhưng **không có free tier** và key hiện tại là coding plan.)
2. **License Piper/VITS** — chấp nhận rủi ro "dữ liệu tổng hợp từ dòng Lessac/Blizzard (nghiên cứu, không thương mại)" hay loại bỏ khỏi danh sách?
3. **Tính năng clone giọng** — có trong roadmap không? Nếu có, VieNeu v3 Turbo là nền tảng hợp lý nhất (Apache-2.0 + clone sẵn).
4. **Bộ giọng mặc định** — sau khi nghe `index.html`, PO chọn giọng nào cho Nam chính / Nữ chính / phụ vai?
5. **Có giữ Edge-TTS trong UI cho người dùng cuối không?** — nếu không, nên ẩn để tránh người dùng gặp lỗi 0 byte.

---

# PHỤ LỤC

## Phụ lục A — Lỗi Edge-TTS phát hiện khi benchmark (BUG thật, cần xử lý)

**Hiện tượng.** Với `edge-tts` 7.3.1 và voice `vi-VN-HoaiMyNeural`, endpoint read-aloud của Microsoft **trả về 0 byte audio** (client ném `NoAudioReceived`) với một số câu tiếng Việt.

**Tái hiện:**

```
# Cùng một voice, chỉ khác nội dung:
"Xin chao cac ban."                       -> OK, 12.528 byte
"Xin chào bạn nhé à."                     -> OK ở 4/6 lần thử, FAIL 2/6 lần  (thất thường)
"Xin chào bạn nhé ô."                     -> FAIL 6/6 lần
"Xin chào các bạn, hôm nay chúng ta sẽ…"(câu S1) -> FAIL, nhưng THÀNH CÔNG khi thử lại
```

**Đặc điểm quan trọng:**
- Lỗi **không phải** do mã hóa tiếng Việt nói chung (ASCII và câu ngắn có dấu vẫn chạy).
- Lỗi **có tính thất thường** — cùng một câu fail rồi lại thành công ở lần thử sau (giãn cách ~1.5 s).
- **Cả Python API lẫn CLI đều lỗi** → không phải lỗi wrapper của Sublix.

**Hệ quả với Sublix.** `synthesize_speech()` (`src-tauri/src/dubbing/mod.rs`) gọi `edge-tts --text … --write-media …` và coi exit code khác 0 là lỗi. Với câu bị "chặn" như trên, **câu đó không có tiếng trong bản dịch**, và toàn bộ tiến trình có thể đổ lỗi. Không có cơ chế retry nào.

**Đề xuất sửa (P0):** vòng retry 3–5 lần, giãn cách 1–1.5 s, kiểm tra file đầu ra > 0 byte trước khi coi là thành công. Chi tiết ở PHẦN 3 bước 1.

**Ghi chú:** trong bảng đo, Edge-TTS cần **2 lần retry** cho 3 câu (câu S2 và S3 mỗi câu 1 lần retry) — tức là lỗi này xảy ra thường xuyên, không phải hiếm gặp.

**✅ Xác nhận độc lập trên GitHub (không phải suy đoán của chúng tôi):**
issue [`rany2/edge-tts#473`](https://github.com/rany2/edge-tts/issues/473) — *"Intermittent 'No audio was received' errors with valid requests"* — mở **2026-04-08**, **đúng voice `vi-VN-HoaiMyNeural`**, người báo `cuongnl` (Windows 10, Python 3.10+), ~20 người "same here". Maintainer `rany2` yêu cầu thử `edge-tts 7.3.0` (2026-10-13) → người dùng báo **vẫn lỗi trên cả 7.3.0 lẫn 7.3.1** → issue **reopened** 2026-10-13, hoạt động gần nhất 2026-10-22.
Xem thêm issue [`#356`](https://github.com/rany2/edge-tts/issues/356) (2025-02-10: ở bản 7.0.0 cả 2 giọng VI **không phát ra tiếng Việt nào**) và [`#481`](https://github.com/rany2/edge-tts/issues/481) (2026-07-20: lỗi `NoAudioReceived` **theo ngôn ngữ**).
Chi tiết đầy đủ: §1.5.4.

## Phụ lục B — Ghi chú kỹ thuật khi tái lập / mở rộng bench

| Vấn đề | Cách xử lý đã dùng |
|---|---|
| `sherpa-onnx` 2.0.0 **không còn tạo espeak frontend cho model piper** (nhánh `meta_data.is_piper` chỉ nhận `phoneme_codepoints`/lexicon) | Dùng **`piper-tts` 1.8.0** (wheel `cp39-abi3-win_amd64`, tự bundle espeak-ng + `espeak-ng-data`) thay cho sherpa-onnx |
| `piper-tts` 1.8 đổi API: `synthesize(text)` trả `Iterable[AudioChunk]`, **không** ghi file wave | Dùng `voice.synthesize_wav(text, wav_file)` |
| `espeak-ng-data` bản mới dùng layout nhóm `lang/<group>/<lang>`; bản cũ cần `lang/<lang>` | Copy file `lang/aav/vi` → `lang/vi` (và `vi-VN-*`) |
| `torchaudio ≥2.9` (đi kèm torch ≥2.9) đòi **torchcodec**, torchcodec đòi **FFmpeg shared DLL** (`avcodec-*.dll`…) — bản `ffmpeg.exe` của Gyan là static nên không đủ | Tải bản shared: `BtbN/FFmpeg-Builds → ffmpeg-master-latest-win64-gpl-shared.zip`, thêm thư mục `bin` vào `PATH` trước khi chạy |
| `coqui-tts` (thay thế `multilingual-tts` — gói `multilingual-tts` **không tồn tại** trên PyPI) cần `torchaudio` + `torchcodec` + `torchaudio.load` | Với FFmpeg shared trên PATH thì import được; mô hình VITS-OpenBible chưa chạy do giới hạn thời gian bench |
| **DNSMOS offline**: repo `sarulab-speech/DNSMOS` **đã bị xoá (404)**; `sarulab-speech/UTMOSv2` cũng không còn | Dùng bản port sẵn `prj-beatrice/dnsmos-torch-native` trên HF (chỉ 1,38 MB, `AutoModel.from_pretrained(..., trust_remote_code=True)`) — **chạy được offline CPU**, kết quả khớp với ONNX chính thức |
| `torchaudio.functional.resample` cần `torchaudio` ≥2.9 → `torchcodec` → **FFmpeg shared DLL**; bản `ffmpeg.exe` thông thường là static nên không đủ | Thêm thư mục `bin` của `BtbN/FFmpeg-Builds → ffmpeg-master-latest-win64-gpl-shared.zip` vào `PATH` trước khi chạy (đã làm trong bench) |
| `librosa.pyin` (librosa ≥0.10) trả về **tuple** `(f0, voiced_flag, viterbi_loglik)`, không phải mảng | `f0 = out[0] if isinstance(out, tuple) else out` |
| Độ lệch chuẩn F0 **không** phải `12·log2(std/mean)` (đó là tỉ số log, cho ra số âm vô nghĩa) | Chuyển **mỗi khung có F0** sang thang semitone so với F0 TB (`12·log2(f0/f0_mean)`) rồi mới lấy std |
| VieNeu-TTS tải codec MOSS từ HF | Đặt `HF_HOME=%TEMP%\sublix-voice-bench\hf-cache` để không rơi vào `~/.cache` |
| **PowerShell 5.1 làm hỏng non-ASCII**: (a) argv cho process native đi qua codepage ANSI; (b) file `.ps1` **không có BOM** cũng bị đọc theo ANSI | Truyền chuỗi tiếng Việt qua **file UTF-8** (`--ref-json`, `--voice-file`) hoặc chọn giọng theo **chỉ số ASCII** (`--voice-index 7`) — không dùng literal tiếng Việt trong argv hay trong `.ps1` |
| `whisper-cli` CPU với `large-v3-turbo` mất **~45 s cho clip 5 s** | Chấp nhận; toàn bộ bảng đo mất ~20 phút nếu chạy tuần tự. Đã **chạy song song 3 worker** → còn ~5 phút cho 15 file |
| Model `kokoro-new` tải về **trùng khớp byte-for-byte** với bản trong repo | Ghi nhận trong §1.2.1, không tính là model mới |

## Phụ lục C — Lệnh tái lập nhanh

```powershell
# 0. Thư mục bench + script (ngoài repo)
$bench = "$env:TEMP\sublix-voice-bench"
# scripts/: run_kokoro.py run_edge.py run_gtts.py run_piper.py run_vieneu.py run_f5.py
#          score_wer_cer.py measure_prosody.py measure_mos.py build_index.py build_measured_block.py

# 1. Môi trường ảo riêng cho từng engine (KHÔNG cài vào môi trường dự án)
python -m venv --system-site-packages "$bench\venv-vieneu";   "$bench\venv-vieneu\Scripts\python.exe" -m pip install vieneu
python -m venv --system-site-packages "$bench\venv-piper";   "$bench\venv-piper\Scripts\python.exe"  -m pip install piper-tts
python -m venv --system-site-packages "$bench\venv-edge";    "$bench\venv-edge\Scripts\python.exe"   -m pip install edge-tts
python -m venv --system-site-packages "$bench\venv-gtts";    "$bench\venv-gtts\Scripts\python.exe"   -m pip install gTTS
python -m venv --system-site-packages "$bench\venv-prosody"; "$bench\venv-prosody\Scripts\python.exe" -m pip install librosa soundfile scipy
python -m venv --system-site-packages "$bench\venv-f5";      "$bench\venv-f5\Scripts\python.exe"     -m pip install f5-tts vocos x-transformers transformers accelerate einops ema-pytorch hydra-core pydub soundfile datasets sentencepiece cached-path click gradio jieba pypinyin

# 2. FFmpeg SHARED (bắt buộc cho torchcodec -> torchaudio -> F5-TTS / DNSMOS)
#    BtbN/FFmpeg-Builds -> ffmpeg-master-latest-win64-gpl-shared.zip -> them thu muc "bin" vao PATH

# 3. Sinh WAV (mỗi engine mot lenh)
python "$bench\scripts\run_kokoro.py" --model-dir "C:\AI Project\Sublix\src-tauri\models\voice\kokoro-vi" --out-dir "$bench\wav\kokoro-app" --label kokoro-app
& "$bench\venv-edge\Scripts\python.exe"   "$bench\scripts\run_edge.py"   --out-dir "$bench\wav\edge-tts" --label edge-tts --voice vi-VN-HoaiMyNeural
& "$bench\venv-gtts\Scripts\python.exe"   "$bench\scripts\run_gtts.py"   --out-dir "$bench\wav\gtts"     --label gtts
& "$bench\venv-piper\Scripts\python.exe"  "$bench\scripts\run_piper.py"  --voice piper-vi-diemdam --out-dir "$bench\wav\piper-vi-diemdam" --label piper-vi-diemdam
& "$bench\venv-vieneu\Scripts\python.exe" "$bench\scripts\run_vieneu.py" --out-dir "$bench\wav\vieneu-v3-turbo-fp32" --label vieneu-v3-turbo-fp32 --precision fp32 --voice-index 7
& "$bench\venv-f5\Scripts\python.exe"    "$bench\scripts\run_f5.py"     --out-dir "$bench\wav\f5-tts-vi" --label f5-tts-vi --ref-audio "$bench\ref\ref.wav" --ref-json "$bench\scripts\ref.json"

# 4. Do so do
python "$bench\scripts\score_wer_cer.py"  "$bench\wav"      # WER/CER bang whisper.cpp large-v3-turbo (3 worker song song)
& "$bench\venv-prosody\Scripts\python.exe" "$bench\scripts\measure_prosody.py" "$bench\wav"   # F0 / nhip dieu / toc do noi / quang nghi
& "$bench\venv-f5\Scripts\python.exe"      "$bench\scripts\measure_mos.py"     "$bench\wav"   # DNSMOS P.835/P.808

# 5. Dung trang nghe + bang markdown
python "$bench\scripts\build_index.py"            # -> $bench\index.html (30 file WAV)
python "$bench\scripts\build_measured_block.py"  # -> $bench\results\measured_block.md
```

## Phụ lục D — Nguồn

**Model card / repo (offline):**
- https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo · https://github.com/pnnbao97/VieNeu-TTS
- https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Nano · https://huggingface.co/pnnbao-ump/VieNeu-TTS-v2
- https://huggingface.co/zeroweight-ai/ZeroTTS · https://github.com/zeroweight-ai/ZeroTTS
- https://huggingface.co/contextboxai/Kokoro-Vietnamese · https://huggingface.co/minhtanmtst/Kokoro-Vietnamese
- https://huggingface.co/vnhellboy/vietnamese-piper-voices
- https://huggingface.co/trinhtrantran122/F5-TTS-Vietnamese-100h-ViNV-NV
- https://huggingface.co/multilingual-tts/VITS-OpenBible-Vietnamese
- https://huggingface.co/dinhthuan/index-tts-2-vietnamese
- https://huggingface.co/OpenBMB/VoxCPM2 · https://huggingface.co/OpenMOSS-Team/MOSS-TTS-v1.5
- https://github.com/SWivid/F5-TTS · https://github.com/FunAudioLLM/CosyVoice · https://huggingface.co/coqui/XTTS-v2
- https://huggingface.co/fishaudio/fish-speech-2-pro · https://huggingface.co/thangquang09/parler-tts-vietnamese-v1-stage2
- API HF dùng để liệt kê: `https://huggingface.co/api/models?search=vietnamese%20tts&sort=downloads`

**Cloud (docs + pricing chính thức):**
- https://cloud.google.com/text-to-speech/pricing · https://cloud.google.com/text-to-speech/docs/voices
- https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/ · https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
- https://docs.fpt.ai/docs/en/speech/api/text-to-speech · https://docs.fpt.ai/docs/vi/speech/documentation/tts-pricing
- https://viettel-idc.com.vn/.../bang-gia-dich-vu-viettel-ai-text-to-speech-speech-to-text-61.html
- https://elevenlabs.io/docs/models · https://elevenlabs.io/pricing
- https://platform.openai.com/docs/guides/text-to-speech · https://platform.openai.com/docs/pricing
- https://ai.google.dev/gemini-api/docs/speech-generation · https://ai.google.dev/gemini-api/docs/pricing
- https://platform.minimax.io/docs/api-reference/speech-t2a-http · https://platform.minimax.io/docs/api-reference/voice-cloning-clone.md · https://platform.minimax.io/docs/pricing/overview.md
- https://aws.amazon.com/polly/pricing/ · https://docs.aws.amazon.com/polly/latest/dg/available-voices.html
- https://github.com/rany2/edge-tts

---

*Tài liệu được tạo bởi `mcode #2` (Orca worker) cho task `TSK-RES-VI-VOICE`. Không sửa code ứng dụng. Mọi số đo đều tái lập được trên máy PO.*
