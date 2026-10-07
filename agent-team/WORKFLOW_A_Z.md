# WORKFLOW A→Z — SUBLIX DUBBING + SUB PIPELINE
> Cho PO (Anh Tuán) nắm tổng thể. Mới nhất: 2026-10-07.

---

## 🎬 Mục Tiết Tổng Quan

```
INPUT: video.mp4 (15:21, 152 MB)
   ↓
[Stage 1] Phân Tích (ffmpeg + Whisper + LLM)
   ↓ segments có text + timestamps + speaker
[Stage 2] Lồng Tiếng (Kokoro/Edge-TTS)  ← Chậm nhất
   ↓ file MP4 có tiếng Việt (track mới)
[Stage 3] Hardcode Sub (ffmpeg)
   ↓ MP4 có sub VI burned-in (video + audio + sub)
OUTPUT: *_VI_dubbed_HARDSUB.mp4
```

---

## 📦 Models Hiện Có (Trong Project)

### Speech-to-Text (Whisper — GPU CUDA)
- **Default**: `ggml-large-v3-turbo-q8_0.bin` (834 MB) — chính xác cao nhất, có GPU
- Backup: `liberal-base.bin` (141 MB) — CPU fallback
- Backup nhẹ: `liberal-tiny.bin` (74 MB) — test nhanh

### Translation (LLM — 3 providers)
- **Option A: MiniMax Cloud API** (default nếu config có API key)
  - Model: `MiniMax-M3` (Mỹ Cloud, nhanh, cần mạng)
  - Dùng cho cả STT lẫn dubbing (diarization + voice casting)
- **Option B: Ollama Local** (free, slow)
  - Model: `smtek/qwen3.8-27b:q4_k_m` (chạy ngầm qua `llama-server` port 11434)
- **Option C: Local GGUF** (3 model sizes)
  - `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (2.4 GB) — default local
  - `qwen2.5-3b-instruct-q4_k_m.gguf` (2 GB)
  - `qwen2.5-1.5b-instruct-q4_k_m.gguf` (1.1 GB)

### Text-to-Speech (TTS — Lồng Tiếng Việt)
- **Kokoro LOCAL OFFLINE** (326 MB ONNX + 14 voicepacks ~524 KB mỗi):
  - 7 Nam: `tuan_ngoc`, `manh_dung`, `thanh_dat`, `phat_tai`, `hung_thinh`, `duc_an`, `duc_duy`
  - 7 Nữ: `mai_linh`, `ngoc_huyen`, `my_yen`, `diem_trinh`, `mai_loan`, `thuc_trinh`, `storyvert`
  - Inference: Python ONNX, chạy offline hoàn toàn
  - **Bottleneck**: CPU inference + Python subprocess spawn ~5-7s overhead/segment
- **Edge Neural TTS** (Microsoft cloud):
  - 8 giọng có sẵn (Edge-TTS Cloud), cần mạng
  - Nhanh hơn Kokoro (network call only)

### Diarization (Sherpa-ONNX)
- `sherpa-onnx-pyannote-segmentation-3-0.tar.bz2` (7 MB)
- `wespeaker_en_voxceleb_resnet34_LM.onnx` (26 MB)
- Phát hiện ai nói câu nào (chưa tích hợp end-to-end)

---

## ⚙️ Config Hiện Tại (`sublix-config.json`)

```json
{
  "stt_engine_preference": "cuda",          ← Whisper GPU
  "translation_engine_preference": "cuda",
  "stt_model": "large-v3-turbo-q8_0",      ← 834 MB model
  "translation_provider": "local",          ← dùng Ollama Local
  "translation_model": "qwen3-4b",          ← GGUF
  "target_lang": "vi",
  "ollama_url": "http://localhost:11434",
  "ollama_model": "smtek/qwen3.8-27b:q4_k_m"
}
```

---

## 🚀 CHI TIẾT TỪNG STAGE

### Stage 1: Phân Tích Audio (Whisper + Diarization + Translate)

**Time**: ~60s cho video 15min (Stage 1 chiếm 5-10% tổng thời gian)

```
Input MP4 (15:21)
  ↓ ffmpeg trích audio 16kHz mono WAV (2-3s)
audio.wav (16kHz mono)
  ↓ whisper-cli -m large-v3-turbo-q8_0 -f audio.wav -l auto -osrt
SRT file (170 segments có text + timestamps)
  ↓ MiniMax API: phân vai + dịch tiếng Việt
  • Whisper chỉ transcribe, không phân speaker
  • MiniMax LLM nhận tất cả segments + yêu cầu gán speaker + dịch VI
Project (170 segments × speaker_id + dubbed_text)
```

**Output Stage 1**: `Project { segments: Vec<Segment>, speakers: Vec<Speaker> }`
- Mỗi segment có: id, speaker_id, start_sec, end_sec, original_text, dubbed_text
- Mỗi speaker có: id, label, voice (default), pitch, rate, **gender** (mới thêm ở v0.9.10)

### Stage 2: Lồng Tiếng (Kokoro LOCAL — Bottleneck)

**Time**: ~30-60 phút cho video 15min (chiếm **80-90% tổng** thời gian)

```
Project (segments + speakers)
  ↓ [v0.9.10] Smart voice assignment:
  • Đếm segments per speaker
  • Tìm main_speaker (largest)
  • Noise speaker (<3 segs HOẶC <3% tổng) → gộp main, voice đồng nhất
  • Speaker non-noise → gán voice theo spk.gender (7 nam + 7 nữ pool)
  • 1 narrator → chỉ 1 voice
Project (updated voice cho mỗi speaker)
  ↓ Cho từng segment (170):
  1. Kokoro Python subprocess synthesize Vietnamese (3-5s) 
     + 5-7s subprocess startup overhead = ~10s/segment
  2. ffmpeg atempo stretch khớp timing (instant 386x speed)
  3. Concatenate → dubbed_audio.wav
dubbed_audio.wav (Vietnamese TTS track)
  ↓ ffmpeg remux: video + original_audio (ducked) + dubbed_audio
MP4 với track Việt (track audio mới)
```

**Tại sao Kokoro chậm?**
- **Mỗi segment = 1 Python subprocess** (`Command::new("python")`) → 5-7s overhead
- ONNX inference CPU ~2-3s/segment audio 5-10s
- Subprocess KHÔNG reuse → load lại model mỗi segment

**So sánh tốc độ** (cho video 15-min, ~170 segments):
| Engine | Time Stage 2 | Speed |
|---|---|---|
| Kokoro LOCAL | ~30-60 phút | 1x |
| Edge-TTS Cloud | ~37 phút | 1.3x nhanhkh |
| Kokoro Persistent Server (chưa có) | ~5-10 phút | **5-10x** |

### Stage 3: Hardcode Sub

**Time**: ~5-8 phút cho video 15min (Stage 3 chiếm 5-10%)

```
dubbed_audio.mp4 (track Việt)
  ↓ + vi.srt (170 segments)
  ↓ ffmpeg:
    -map 0:v -map 1:a -map 2:s
    -c:v copy -c:a copy -c:s mov_text
    -metadata:s:s:0 language=vie
MP4 với sub burned-in (hardsub)
```

**Output cuối**: `*_VI_dubbed_HARDSUB.mp4`

---

## ⚡ Bottleneck Phân Tích (Vì Sao Anh Thấy Chậm)

### Kokoro CPU chậm vì:
1. **Python subprocess overhead** (5-7s/segment) — 170 segments × 5s = 850s chỉ overhead
3. **CPU ONNX inference** (2-3s/segment) — không tận dụng GPU
4. **Voicepack loading** — mỗi lần đổi giọng phải load .pt ~524 KB

### Edge-TTS Cloud nhanh hơn vì:
- Microsoft server GPU mạnh → < 1s/segment
- Network latency ~50-200ms (chỉ 1 request, không overhead)

### Cải thiện performance (chưa làm):
1. **Persistent Kokoro Server** (Python HTTP server load model 1 lần) → giảm overhead còn <1s/segment → **5-10x nhanh hơn**
   - Effort: 2-3 giờ
   - Risk: thêm 1 service cần quản lý
2. **ONNX Runtime CUDA** → chạy Kokoro trên GPU → 2-3x nhanh hơn CPU
   - Effort: 1-2 giờ
   - Risk: setup CUDA cho Python ONNX

---

## 🧪 Cấu Hình Test Hiện Tại

Anh có thể chạy CLI test mà không cần GUI:
```powershell
cd "H:\AI Project\sublix\src-tauri"
cargo run --example test_dubbing_srt -- "<input.mp4>" "<output>.mp4" en vi
```

Hoặc dùng binary đã build:
```powershell
& "H:\AI Project\sublix\src-tauri\target\debug\examples\test_dubbing_srt.exe" "<input.mp4>" "<output>.mp4" en vi
```

---

## 📊 Thời Gian Thực Tế (Đo từ Worker Tests)

| Video | Duration | Speakers | Stage 1 | Stage 2 (Kokoro) | Stage 3 | Total |
|---|---|---|---|---|---|---|
| R2nyc (15:21, full) | 15:21 | 6 | 61s | 30 phút | 8 phút | **~38 phút** |
| R2nyc (3-min trim) | 3:00 | 6 | 15s | 7m18s | ~2 phút | **~10 phút** |
| Teded (3-min trim) | 3:00 | 2 | 14s | 4m53s | ~2 phút | **~7 phút** |
| Rick Astley (full) | 3:33 | 2 | 20s | 5m37s | ~2 phút | **~8 phút** |

---

## 🔑 Điểm Chính Cho PO

1. **Kokoro LOCAL chạy offline** (không cần mạng), **chậm vì CPU + subprocess overhead**
2. **Edge-TTS Cloud nhanh hơn 1.3x** (cần mạng, ~37 phút cho video 15-min)
3. **Muốn Kokoro nhanh như Edge** → phải refactor persistent Python server (2-3 giờ)
4. **Video đầy đủ 15-min thực tế mất ~38 phút** — không có cách nào nhanh hơn mà không tối ưu
5. **GPU cho Kokoro chưa có** (ONNX Runtime CUDA chưa setup)

---

## 📁 Files Tham Khảo

- `src-tauri/src/dubbing/mod.rs` — pipeline dubbing chính
- `src-tauri/src/file_sub.rs` — pipeline phụ đề (Stage 1+3)
- `src-tauri/src/translate/mod.rs` — 3 provider (minimax/ollama/local)
- `src-tauri/src/stt/whisper_local.rs` — Whisper binary/model resolution
- `src-tauri/scripts/kokoro_vi_tts.py` — Kokoro Python ONNX inference
- `src-tauri/examples/test_dubbing_srt.rs` — CLI test full pipeline
- `src/views/DubbingStudioView.tsx` — UI Lồng Tiếng
- `agent-team/AUDIT_SUB_REPORT.md` — audit phụ đề
- `agent-team/AUDIT_TAO_GIONG.md` — audit tạo giọng