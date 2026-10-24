# Báo cáo dựng môi trường máy dev mới — 2026-10-23

> Tài liệu bàn giao cho phiên làm việc tiếp theo trên máy **KHÔNG có GPU NVIDIA**.
> Nguồn chuẩn của dự án: `agent-team/SOUL.md` (kiến trúc), `agent-team/PROJECT_STATE.md` (tiến độ), `agent-team/ISSUE_LOG.md` → `BUG-H09` (chi tiết lỗi WDAC).

---

## 1. Thông tin máy

| Hạng mục | Giá trị |
|---|---|
| OS | Windows 11 Home, build 26200 (x64) |
| CPU | AMD Ryzen AI Max 390 — 12 core / 24 luồng |
| RAM | 31,1 GB (unified memory) |
| GPU | **AMD Radeon 8050S (iGPU) — KHÔNG có NVIDIA** |
| Workspace | `C:\AI Project\Sublix` |
| Ổ đĩa | C: còn ~554 GB trống sau khi dựng |
| WebView2 | 155.0.4283.62 ✅ |
| ffmpeg | 9.0.2 (WinGet) ✅ |
| Python | 3.13 ✅ |

> ⚠️ Vì không có NVIDIA, nhánh **CUDA** chỉ *chuẩn bị sẵn* (binary + model), **chưa test được**. Nhánh **CPU** đã verify đầy đủ.

---

## 2. Toolchain đã cài

| Công cụ | Phiên bản | Ghi chú |
|---|---|---|
| Visual Studio Build Tools 2022 | 17.14.42 | workload `Microsoft.VisualStudio.Workload.VCTools` (cần cho MSVC linker) |
| Rust (rustup) | 1.29.1 → toolchain **stable 1.99.1** `x86_64-pc-windows-msvc` | |
| yt-dlp | 2026.10.21 | `where yt-dlp` → `…\WinGet\Packages\yt-dlp.yt-dlp_…\yt-dlp.exe` |
| Node.js / npm | v24.20.0 / 11.19.0 | `npm install` → 73 package |
| Ollama | 0.40.5 | có sẵn model `qwen2.5:3b` (1,9 GB) |

> **Lưu ý PATH**: sau khi cài, PATH của shell *đang mở* còn stale. Mở shell mới, hoặc refresh:
> ```powershell
> $env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')
> ```

---

## 3. Tài nguyên runtime đã chuẩn bị

Vị trí: `src-tauri/binaries/` và `src-tauri/models/` (đều đã gitignore).

### 3.1 Binaries

| Đường dẫn | Nguồn | Kích thước |
|---|---|---|
| `binaries/llama-server.exe` + DLL | `llama.cpp` **b10472** `llama-b10472-bin-win-cpu-x64.zip` | 17,6 MB (DLL) |
| `binaries/cuda/llama-server.exe` + DLL + cu12 runtime | `llama-b10472-bin-win-cuda-12.4-x64.zip` + `cudart-llama-bin-win-cuda-12.4-x64.zip` | 239 MB + 373 MB |
| `binaries/Release/whisper-cli.exe` + DLL | `whisper.cpp` **v1.7.6** `whisper-bin-x64.zip` (CPU) | 3,5 MB |
| `binaries/whisper-cuda/` (28 file) | `whisper-cublas-12.4.0-bin-x64.zip` | 422,7 MB |

> 🔥 **Quan trọng — tách thư mục CUDA của whisper riêng.** `whisper.cpp` và `llama.cpp` đều có file tên `ggml-cuda.dll` nhưng **khác build** (whisper 51 MB vs llama 513 MB). Nếu để chung thư mục `cuda/` thì file của llama ghi đè file của whisper → `whisper-cli.exe` CUDA sẽ nạp sai DLL. App ưu tiên `binaries/whisper-cuda/` trước `binaries/cuda/` (xem `stt/whisper_local.rs` → `find_cuda_whisper_cli`).

### 3.2 Models

| File | Kích thước | Dùng cho |
|---|---|---|
| `models/ggml-base.bin` | 141 MB | STT CPU (đã chọn) |
| `models/ggml-large-v3-turbo-q8_0.bin` | 834 MB | STT GPU (máy NVIDIA) |
| `models/qwen2.5-1.5b-instruct-q4_k_m.gguf` | 1,07 GB | Dịch GGUF CPU |
| `models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2,38 GB | Dịch GGUF GPU (máy NVIDIA) |

---

## 4. Cách chạy

```powershell
# Cách 1 — launcher (đã sửa trỏ đúng workspace)
C:\AI Project\Sublix\Chay-Sublix.bat

# Cách 2 — dev mode thủ công
cd C:\AI Project\Sublix
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:CARGO_TARGET_DIR = "C:\AI Project\Sublix\src-tauri\target"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9223"
npm run tauri dev -- --no-watch
```

> `--no-watch` là **bắt buộc** khi app ghi file runtime vào `src-tauri/models/` — nếu không, watcher của `tauri dev` tưởng code đổi → tự restart & giết app (`BUG-H08`).

**Verify GUI qua CDP** (port 9223): mở `http://127.0.0.1:9223/json/list` → `webSocketDebuggerUrl` → `Page.captureScreenshot`.
Script dùng được: `%TEMP%\sub-cdp.js` (dump DOM + chụp màn hình), `%TEMP%\sub-tab.js` (bấm tab), `%TEMP%\sub-preset.js` (bấm preset + đọc trạng thái).

> `test_dubbing_input/ab2.ps1` **không dùng được** trên máy này — nó trỏ cứng `C:\Users\TTC\...` (user máy cũ).

---

## 5. Kết quả verify

| Hạng mục | Kết quả |
|---|---|
| `cargo build` (lib + bin) | ✅ OK — 3m29s lần đầu, `sublix.exe` 23 MB |
| `cargo test --lib` | ✅ **60/60 PASS**, 0 fail (2 ignored) |
| `npx tsc --noEmit` | ✅ 0 lỗi |
| `npm run build` | ✅ OK (vite 7.3.6, 1,33s) |
| `npm run verify:version` | ✅ PASS exit 0 — 6/6 nguồn = `0.11.35` |
| App dev mode | ✅ Mở lên, 6 tab render đủ, badge `V0.11.35`, overlay "Sublix ready" |
| Model Hub | ✅ Nhận đúng 4 model đã tải (`base`, `large-v3-turbo-q8_0`, `qwen3-4b`, `qwen2.5-1.5b`) |
| **STT thật** | ✅ `whisper-cli` + `ggml-base.bin` → *"Good evening everyone. Today we are testing the subtitle pipeline of Sublix Studio."* — **2,6 s** trên CPU |
| **Dịch thật trong app** | ✅ Provider Ollama (`qwen2.5:3b`) → *"I can't believe you actually pulled this off. You're insane, you know that?"* → *"Tôi không thể tin bạn lại làm được như thế này. Bạn điên rồi đấy nhỉ?"* — UI báo *"✅ Kiểm tra dịch thoại thành công!"* |

Ảnh chứng minh: `gui-2026-10-24/` (01 first-run, 02/03 model hub, 04 CPU preset).

---

## 6. 🔴 Blocker: Smart App Control chặn `llama-server.exe`

**Hiện tượng:**
```
Program 'llama-server.exe' failed to run: An Application Control policy has blocked this file
```

**Chẩn đoán (đã loại trừ mọi giả thuyết khác):**
- Win11 bật **Smart App Control** → `HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy\VerifiedAndReputablePolicyState = 1`
- WDAC yêu cầu *"Enterprise signing level"*; `llama-server.exe` **không ký Authenticode** + **không có reputation** → bị chặn
- Event log: `Microsoft-Windows-CodeIntegrity/Operational`, ID **3033 / 3077**, Policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`
- ❌ Không phải Mark-of-the-Web (file **không** có `Zone.Identifier`; `Unblock-File` vô tác dụng)
- ❌ Không phải do bản release cũ (thử cả `b10472` lẫn `b11829` → đều bị chặn)
- ❌ Không phải policy doanh nghiệp (máy **không** join domain — `WORKGROUP`)
- ✅ `whisper-cli.exe` (cũng không ký) **vẫn chạy** → có reputation do phổ biến
- ✅ `ollama.exe` **có chữ ký hợp lệ** (Ollama Inc.) → chạy tốt

**Workaround đã áp dụng:** chuyển provider dịch sang **Ollama** (`translation_provider: "ollama"`, `ollama_model: "qwen2.5:3b"`), đã verify ✅.

**Cần PO quyết:** muốn dùng lại đường **GGUF embedded** trên máy này thì phải **tắt Smart App Control**
(Windows Security → App & browser control → Smart App Control → Off).
⚠️ Đây là **đường một chiều** trên Windows 11 — muốn bật lại phải **reset Windows**. Mình **chưa** tự ý đụng vào.

> 💡 **Góc nhìn sản phẩm:** đây không chỉ là vấn đề máy dev. Windows 11 **mặc định bật SAC**, và `llama.cpp` **không ký** → binary sẽ bị chặn trên máy người dùng thật. Nên xem đây là rủi ro *distribution* của Sublix và cân nhắc: ký binary, hoặc mặc định dùng provider có chữ ký (Ollama / MiniMax Cloud).

---

## 7. Cấu hình app hiện tại

`%APPDATA%\com.sublix.desktop\sublix-config.json`:

| Field | Value | Lý do |
|---|---|---|
| `stt_engine_preference` | `cpu` | không có NVIDIA |
| `translation_engine_preference` | `cpu` | không có NVIDIA |
| `stt_model` | `base` | đã tải (`ggml-base.bin`) |
| `translation_model` | `qwen2.5-1.5b` | đã tải |
| `translation_provider` | **`ollama`** | né `BUG-H09` |
| `ollama_url` / `ollama_model` | `http://localhost:11434` / `qwen2.5:3b` | model có sẵn trên máy |
| `theme` | `cinema` | |

Đổi cấu hình: tab **Cài đặt** → *AI Dịch Thuật & Phân Vai* → *Lưu Cấu Hình*.
Hoặc sửa trực tiếp file JSON (nhớ tắt app trước, app ghi đè config khi thoát).

---

## 8. Tính năng mới v0.11.36 — Preset "GPU tích hợp AMD (Radeon / Ryzen AI)"

Máy có GPU tích hợp AMD giờ **không còn rơi vào nhánh CPU** — Sublix có preset thứ 4, 3 preset cũ giữ nguyên.

### 8.1 Preset làm gì

| Thành phần | Cấu hình |
|---|---|
| STT (Whisper) | `base` (140 MB) — **chạy CPU** (whisper.cpp chưa có bản ROCm/Vulkan cho Windows) |
| Dịch (LLM) | **Provider Ollama** — Ollama tự dùng ROCm/Vulkan trên iGPU |
| Engine | `stt = cpu`, `translation = cpu` (Ollama tự lo device) |
| Model | Tự chọn: ưu tiên `qwen2.5:3b` → `qwen3:4b` → model 1,5–6,5 GB → model nhỏ nhất |

### 8.2 Vì sao dùng Ollama thay vì GGUF nhúng

| Vấn đề | Bằng chứng |
|---|---|
| Windows 11 bật **Smart App Control** → WDAC chặn binary llama.cpp chưa ký | *"An Application Control policy has blocked this file"* — thử cả 3 bản (CPU b10472, CPU b11829, Vulkan) → đều bị chặn; `Unblock-File` vô tác dụng (file không có `Zone.Identifier`) |
| `whisper.cpp` không có bản ROCm/Vulkan cho Windows | Release assets chỉ có `cublas` (CUDA) + CPU |
| `ollama.exe` **có chữ ký hợp lệ** (Ollama Inc.) + bản Windows tự dùng ROCm | `library=ROCm compute=gfx1151 "AMD Radeon(TM) 8050S" 12.2 GiB`, `offloaded 37/37 layers to GPU` |

### 8.3 Hiệu năng đo thật (Ryzen AI Max 390)

| Model | Engine | Generate | Prompt eval |
|---|---|---|---|
| `qwen2.5:3b` | **iGPU (ROCm)** | **32,83 tok/s** | 406,8 tok/s |
| `qwen2.5:3b` | CPU | 15,53 tok/s | 187 tok/s |

→ **iGPU nhanh hơn CPU 2,11×.**

### 8.4 Hai lỗi phát hiện khi làm preset (`BUG-H10`)

1. **Timeout Ollama 25s quá ngắn** — request đầu tiên phải nạp model vào RAM/VRAM (đo thật **45–95s**). Đã nâng: đơn 25s→**120s**, batch 60s→**300s**.
2. **`qwen3:4b` trên Ollama là bản "Thinking"** — `general.name = Qwen3 4B Thinking 2507`, template `[tools thinking completion]` → sinh **548–2123 token suy luận** cho một câu dịch 5 từ (52–112s). Đã thêm `"think": false` vào request + preset ưu tiên `qwen2.5:3b` (**6,0s**).

### 8.5 Thay đổi code v0.11.36

| File | Nội dung |
|---|---|
| `src-tauri/src/translate/server.rs` | Thêm `list_ollama_models()` + `OllamaModelInfo`; timeout 120s/300s; `"think": false` |
| `src-tauri/src/lib.rs` | Thêm Tauri command `ollama_models` (async + `spawn_blocking`) |
| `src/lib/tauri.ts` | Thêm `OllamaModelInfo` + `sublix.ollamaModels()` |
| `src/views/SettingsView.tsx` | `HardwarePreset` += `"amd_igpu"`; `applyHardwarePreset("amd_igpu")`; `pickOllamaModel()`; dropdown model Ollama; `currentPreset` nhận diện AMD |
| `src/views/ChangelogModal.tsx` + `CHANGELOG.md` | Mục v0.11.36 |

**Verify:** 4 preset card hiện trong UI (sidebar + grid) → bấm preset AMD → config `translation_provider=ollama`, `ollama_model=qwen2.5:3b`, `stt_model=base` → bấm *"🧪 Dịch Thử Nghiệm Ngay"* → ✅ *"Kiểm tra dịch thoại thành công!"*
(EN *"I can't believe you actually pulled this off. You're insane, you know that?"* → VI *"Tôi không thể tin bạn lại làm được chuyện này. Bạn điên đó, biết chứa?"*)

Ảnh: `gui-2026-10-24/07-amd-preset.png`, `gui-2026-10-24/08-amd-translate-test.png`.

---

## 9. ✅ Pipeline A→Z verify đầy đủ (v0.11.36)

Chạy thật trên máy chỉ có **iGPU AMD** (không NVIDIA), từ video gốc → file thành phẩm:

| Bước | Thành phần | Kết quả đo |
|---|---|---|
| 1. Nhập video | `A2Z_TEST_EN.mp4` (41 s, 10 câu tiếng Anh tổng hợp bằng Windows SAPI) | — |
| 2. **STT** | Whisper base (CPU, `ggml-base.bin`) | **8 cue**, 4,8 s |
| 3. **Phân vai** | sherpa-onnx (pyannote + wespeaker) | 16 đoạn, **1 người**, 6,8 s |
| 4. **Dịch** | Ollama `qwen2.5:3b` trên **iGPU ROCm** | 8 câu tiếng Việt đúng ngữ nghĩa |
| 5. **TTS** | Kokoro ONNX (14 giọng Việt, voice *Tuấn Ngọc*) | ✅ *"Đã tổng hợp giọng đọc cho 8 câu thoại!"* — 70 s |
| 6. **Xuất** | ffmpeg (2 track audio + subtitle) | ✅ *"Xuất Video Hoàn Tất!"* |

**File thành phẩm:** `%APPDATA%\com.sublix.desktop\downloads\A2Z_TEST_EN_dubbed.mp4` (632 KB, 40 s)

```
index=0  h264      video
index=1  aac       audio        (tiếng gốc)
index=2  aac       audio        (lồng tiếng TTS tiếng Việt)
index=3  mov_text  subtitle     (phụ đề .vi.srt)
```

**Đối chiếu track lồng tiếng** (transcribe ngược bằng whisper, `lang=vi`):
> *"Chúng ta đã hết thời gian rồi, thành phố sắp mất điện. Anh biết mà, tôi không muốn như thế này. Hãy nghe tôi, còn lại không nhiều đâu. Hãy đưa mọi người lên mái nhà ngay lập tức, anh nghe chưa? Có điều gì đó sắp đến, tôi đã chờ đợi 3 năm rồi. …"*

→ đúng cả 8 câu. Volume: track gốc −21,1 dB, track lồng tiếng −16,2 dB (không im lặng).

### 9.1 Hai bug chặn pipeline — đã fix

| Bug | Triệu chứng | Root cause | Fix |
|---|---|---|---|
| **BUG-H11** | *"Whisper không tạo được phụ đề"* (nhưng chạy tay đúng lệnh thì tốt) | `find_whisper_cli_with_engine()` **luôn ưu tiên binary CUDA**, không đọc `stt_engine_preference` → máy có `binaries/whisper-cuda/` là app ép CUDA | `ensure_binary_with_engine_pref(pref)`: Cpu→CPU, Cuda→CUDA (fallback CPU), Auto→CUDA trước |
| **BUG-H12** | *"FFmpeg amix chunk render failed"*, không ra file | **ffmpeg 9 đã gỡ `-filter_complex_script`** (còn từ ffmpeg ≤7.x) → **mọi máy cài ffmpeg 8+ đều không xuất được video** | truyền graph trực tiếp qua `-filter_complex` (Rust không qua shell → không lỗi quoting) |

### 9.2 Môi trường Python cho TTS/phân vai (cài thêm)

| Package | Vai trò |
|---|---|
| `onnxruntime` 1.31.0 | chạy model Kokoro ONNX (CPU) |
| `torch` 2.14.1+cpu | đọc voicepack `.pt` (dùng bản CPU-only để tiết kiệm ~2,5 GB) |
| `vig2p` | grapheme→phoneme tiếng Việt |
| `sherpa-onnx` | phân vai (pyannote segmentation + wespeaker) |

Model tải về `src-tauri/models/voice/`:
- `kokoro-vi/` — `kokoro_vi.onnx` (310 MB), `config.json`, `voices.json`, `kokoro_vi_voicepack.pt`, `voicepacks/*.pt` (14 giọng)
- `sherpa-diarization/` — `sherpa-onnx-pyannote-segmentation-3-0/model.onnx`, `wespeaker_en_voxceleb_resnet34_LM.onnx`

---

## 10. Việc tiếp theo đề xuất

1. **Quyết định về Smart App Control** (bật lại đường GGUF hay giữ Ollama) — cần PO.
2. **Test trên máy có NVIDIA** để verify nhánh CUDA: copy `src-tauri/binaries/cuda/` + `src-tauri/binaries/whisper-cuda/` + `ggml-large-v3-turbo-q8_0.bin` + `Qwen3-4B-…gguf`, đặt `stt_engine_preference: "cuda"` + `translation_engine_preference: "cuda"`.
3. **Chạy pipeline A→Z thật** trên 1 video (chưa làm trên máy này — mới verify từng bước riêng).
4. **Kiểm tra tab Tải Video** với `yt-dlp` vừa cài (chưa test end-to-end).
5. **Xem lại `BUG-004`** (`ensure_binary()` không có caller) — hiện binary phải tải tay, app không tự cài.

---

## 10. Thay đổi đã commit-đề-xuất (chưa commit)

```
 M Chay-Sublix.bat                          ← trỏ đúng workspace + CARGO_TARGET_DIR nội bộ
 M agent-team/PROJECT_STATE.md               ← workspace, trạng thái, task, blockers
 M agent-team/AGENT_CHAT.md                 ← tin bàn giao mới (đã prune còn 8 tin)
 M agent-team/ARCHIVE/AGENT_CHAT_ARCHIVE.md ← tin cũ chuyển vào archive
 M agent-team/ISSUE_LOG.md                  ← BUG-H09 + BUG-H10 (Quick Index + chi tiết)
 M package.json / package-lock.json         ← version 0.11.35 → 0.11.36
 M src-tauri/Cargo.toml                     ← version 0.11.36
 M src-tauri/tauri.conf.json                ← version + 2 tiêu đề cửa sổ = 0.11.36
 M src-tauri/src/translate/server.rs        ← list_ollama_models + timeout + think:false
 M src-tauri/src/lib.rs                     ← Tauri command ollama_models
 M src/lib/tauri.ts                         ← OllamaModelInfo + wrapper
 M src/views/SettingsView.tsx               ← preset AMD iGPU + dropdown model
 M src/views/ChangelogModal.tsx             ← mục v0.11.36
 M CHANGELOG.md                             ← mục v0.11.36
?? docs/BAO_CAO_MAY_DEV_2026-10-23.md      ← báo cáo này
?? scripts/cdp/                             ← script verify GUI qua CDP
```
