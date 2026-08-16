# Research Notes — Sublix

> Tech research thực hiện ngày 2026-08-16, dùng để justify tech stack trong PLAN.md.

---

## 1. Whisper local (whisper.cpp v1.8.4, Mar 2026)

### Performance benchmarks
Từ nhiều benchmark sites (starwhisper.ai, promptquorum.com, phoronix.com):

| Hardware | Model | Realtime factor | Verdict |
|---|---|---|---|
| **RTX 4090 (CUDA)** | small (244M) | 13.1x | Dư sức real-time |
| **RTX 4090 (CUDA)** | large-v3 (1.55B) | 2.8x | Real-time thoải mái |
| **RTX 4090 (Vulkan)** | small | 13.4x | Match CUDA |
| **RTX 4090 (Vulkan)** | large-v3 | 3.0x | Match CUDA |
| **RTX 3070** | small | 8-10x | Real-time tốt |
| **Apple M2 Pro (Metal+CoreML)** | large-v3 Q5_1 | 5-7x | Real-time |
| **Modern x86 CPU (i7/Ryzen 7)** | small | 0.5x | ❌ Không real-time |
| **Modern x86 CPU** | base (74M) | 2.4x | Real-time |
| **Modern x86 CPU** | large-v3 | 0.1x | ❌ Không khả thi |

### Key findings
- **GPU strongly recommended** nếu muốn large-v3 (best accuracy)
- **Vulkan support** (whisper.cpp 1.8.3+) → AMD/Intel GPUs match CUDA, không bị lock NVIDIA
- **Quantization** (Q5_1) giảm VRAM 50%, vẫn accuracy tốt
- **Distil-large-v3** (~756M, 6x realtime) là sweet spot nếu large-v3 quá nặng

### Streaming & VAD
- `whisper-stream` example built-in
- Silero-VAD v6.2.0 (built-in từ v1.8.3+)
- Sliding window mode: `--step 0` → VAD-triggered transcription
- `SimulStreaming` (successor WhisperStreaming) → 3.3s latency achievable

### Sources
- https://github.com/ggml-org/whisper.cpp
- https://starwhisper.ai/whisper-benchmark.html
- https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026
- https://www.phoronix.com/news/Whisper-cpp-1.8.3-12x-Perf

---

## 2. Cloud STT APIs (real-time, Japanese)

### Top contenders

| Provider | Latency | WER | Cost/min | Japanese | Streaming |
|---|---|---|---|---|---|
| **Deepgram Nova-3** | 200-400ms | 5.26% | $0.0077 | ✅ Multilingual 6+ | WebSocket native |
| **AssemblyAI Universal-Streaming** | 300-500ms | 6.99% | $0.0025 | ⚠️ 6 EU langs | WebSocket |
| **OpenAI gpt-4o-transcribe** | batch | ~5-7% | $0.006 | ✅ Strong | ❌ No streaming |
| **Google Chirp 3** | 400-700ms | ~9% | ~$0.016 | ✅ 85+ langs | gRPC |

### Cost examples
- 1 giờ phim Nhật: $0.46 (Deepgram) / $0.15 (AssemblyAI) / $0.36 (OpenAI batch)
- 10 giờ/tuần: ~$5-6/tuần (~$20-25/tháng) — chấp nhận được cho personal use

### Recommendation
**Deepgram Nova-3** cho cloud fallback:
- Latency thấp nhất
- Japanese multilingual tốt
- WebSocket native (dễ integrate với Rust `tokio-tungstenite`)
- Giá OK

### Sources
- https://deepgram.com/learn/best-speech-to-text-apis
- https://apiscout.dev/guides/speech-to-text-api-comparison-2026
- https://www.assemblyai.com/blog/best-api-models-for-real-time-speech-recognition-and-transcription

---

## 3. Translation APIs (JA → VI)

### Comparison

| Engine | Quality (JA) | Cost/1M chars | Notes |
|---|---|---|---|
| **GPT-4 Turbo** | ⭐⭐⭐⭐⭐ 90% | $10 input / $30 output | Best cho Asian, hiểu context |
| **GPT-4o-mini** | ⭐⭐⭐⭐ 85% | $0.15 input / $0.60 output | Cost-effective, vẫn tốt |
| **Claude 3 Sonnet** | ⭐⭐⭐⭐ 89% | $3 / $15 | Tốt nhưng đắt hơn GPT-4o-mini |
| **DeepL** | ⭐⭐⭐ 83% | $25 | EU-focused, JA OK không top |
| **Google Translate** | ⭐⭐⭐ 85% | $20 / 1M | Rẻ, JA→VI decent |
| **NLLB-200** | ⭐⭐ 70% | free | Open source, lower quality |

### Recommendation
**GPT-4o-mini** primary, **Google Translate free** fallback:
- 1 giờ sub ≈ 6000 words ≈ ~15k tokens ≈ $0.02-0.05/giờ (cực rẻ)
- JA → VI là pain point cho DeepL/Google, GPT-4o-mini handle idiom tốt hơn
- Cache để không dịch lại

### Sources
- https://intlpull.com/blog/ai-translation-api-comparison-2025
- https://nllb.com/translation-accuracy-leaderboard/
- https://www.weglot.com/blog/chatgpt-translation

---

## 4. Architecture patterns

### A. Desktop app với Tauri v2 + WASAPI

**Pattern validated bởi**:
- **Voicebox** (https://github.com/jamiepine/voicebox) — Tauri + `wasapi` crate + system audio loopback
- **Handy** (https://github.com/cjpais/Handy) — Tauri + recording overlay với `SetWindowPos`
- **Voxis** (https://github.com/DavutAkca/voxislive) — Driverless Windows system audio translation

**Key code patterns**:
```rust
// WASAPI loopback activation
params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
params.u.ProcessLoopbackParams.ProcessLoopbackMode = 
    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE

// Tauri overlay window config
WindowConfig {
    transparent: true,
    alwaysOnTop: true,
    decorations: false,
    skipTaskbar: true,
}

// Click-through via Win32
SetWindowLongPtrW(hwnd, GWL_EXSTYLE, 
    GetWindowLongPtrW(hwnd, GWL_EXSTYLE) | WS_EX_TRANSPARENT)
```

### B. Browser extension (rejected cho v1)

- Manifest V3 rất hạn chế (service worker không hold media stream)
- Phải dùng offscreen document + tabCapture API
- Không cover được local video files
- → Desktop app superset use case, không cần extension

### C. Adapt mpv + whisper-lua (rejected)

- Setup 2h nhưng UX thô, không overlay đẹp
- Chỉ cover local files, không browser
- Phù hợp "quick win tạm thời" nhưng không phải solution cuối

### Sources
- https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording
- https://dev.to/davutakca/translating-windows-system-audio-in-real-time-driverless-with-no-virtual-cable-2842
- https://deepwiki.com/jamiepine/voicebox/2-desktop-application-(tauri-layer)
- https://deepwiki.com/cjpais/Handy/5.5-recording-overlay-system
- https://www.reddit.com/r/tauri/comments/1tnolvt/

---

## 5. UX reference

### Language Reactor (https://www.languagereactor.com)
- Chrome extension phổ biến nhất cho Netflix/YouTube
- Dual subtitle, popup dictionary
- UX gần Google Photos style
- → Reference cho Sublix overlay design (clean, minimal, dark mode)

### mpv + whisper-standalone
- Subtitle hiển thị trong player (không overlay)
- Geek-friendly, không đẹp
- → Reference cho proof-of-concept nhanh

---

## 6. Build vs Buy decision matrix

| Approach | Effort | Time | Covers both use cases? | UX | Custom |
|---|---|---|---|---|---|
| **Build Tauri app** ⭐ | ~5 tuần | Sau 1 tuần có prototype | ✅ | ⭐⭐⭐⭐⭐ | Full |
| Build browser extension | ~2 tuần | Sau 4 ngày | ❌ | ⭐⭐⭐⭐ | Full |
| Adapt mpv + whisper-lua | ~3 giờ | Ngay | ❌ | ⭐⭐ | Limited |
| Buy Language Reactor (Pro) | $0 | Ngay | ❌ (no local files) | ⭐⭐⭐⭐ | Zero |

**Chốt**: Build Tauri app (Path 1) là best long-term.

---

*Last updated: 2026-08-16 — Mavis*
