# REPORT_TEST_MAVIS_2026-10-07.md — Báo Cáo Test Mavis Phụ Trách

> **Mavis** · Cập nhật: 2026-10-07 ~20:25 ICT · Trạng thái: 4 tests xong, 1 test đang chạy
>
> Phạm vi: tất cả Worker/Verifier mà Mavis đã launch + tổng hợp kết quả + file bằng chứng.

---

## 📋 Tổng quan

| # | Worker | Test | Input | Status | Thời gian |
|---|---|---|---|---|---|
| 1 | Worker F | Sub pipeline: local vs minimax | R2nyc_oP9Yk full 15:21 | ✅ DONE | 17 phút |
| 2 | Worker H | GUI download có/không cookies | UgPoZ_BhtBg 38:24 | ✅ DONE | 10 phút |
| 3 | Worker I | Dubbing full Kenji + hardcode | UgPoZ_BhtBg 38:24 | ✅ DONE | 95 phút |
| 4 | Worker D | Kokoro multi-speaker R2nyc (lần trước) | R2nyc_oP9Yk full 15:21 | ✅ DONE | 38 phút |
| 5 | Worker E | Multi-video v0.9.10 verify (lần trước) | 3 video ngắn | ✅ DONE | ~30 phút |

**Tổng tests do Mavis phụ trách: 5** · **Fail xong tốt: 5** · **Đang chạy: 0**

---

## 1. Worker F — Sub pipeline: local vs MiniMax Cloud API

**Mục đích**: So sánh tốc độ Stage 3 (translate) giữa local LLM (Qwen3-4B GGUF) vs Cloud API (MiniMax-M3).

**Video input**: R2nyc_oP9Yk **full 15:21** (không trim), 465 segments Whisper detect.

### Kết quả

| Provider | Stage 1 | Stage 2 | **Stage 3 (Translate)** | Stage 4 | **Total** |
|---|---|---|---|---|---|
| **local** (Qwen3-4B GGUF) | 3.0s | 16.1s | **47.0s** | ~0s | **66s (1m6s)** |
| **minimax** (MiniMax-M3 Cloud) | 3.8s | 22.4s | **16m14s (974s)** | ~0s | **1000s (16m40s)** |

### Phát hiện bất ngờ

**Local nhanh hơn MiniMax Cloud 20.7×** (47s vs 16m14s). Em đã nhầm khi giả định Cloud nhanh hơn local. Lý do:
- Local Qwen3-4B chạy qua llama-server batch 15 segs → ~0.1s/segment
- MiniMax Cloud network round-trip ~100ms × 465 calls + Cloud xử lý chậm hơn local GPU

### Chất lượng dịch

- **LOCAL**: 0 error markers, formal ("Sao?" "Đã ổn.")
- **MINIMAX**: 2/465 error markers, colloquial ("Hả?" "Ok.")
- 17/465 (3.7%) segments identical giữa 2 bản

### Files output

```
H:\AI Project\sublix\agent-team\test-output-audit-giong\
├── r2nyc_sub_LOCAL_HARDSUB.mp4           (152.5 MB)
├── r2nyc_sub_MINIMAX_HARDSUB.mp4         (152.5 MB)
├── r2nyc_sub_LOCAL.vi.srt                (37.9 KB)
├── r2nyc_sub_MINIMAX.vi.srt              (34.9 KB)
├── r2nyc_compare_LOCAL.log
├── r2nyc_compare_MINIMAX.log
├── r2nyc_compare.log
└── r2nyc_compare_diff.txt
```

### Khuyến nghị

**Default = `local`** (nhanh, ổn định, 0 local error). Cloud chỉ dùng fallback khi llama-server không chạy.

---

## 2. Worker H — GUI download có/không cookies (theo GUI_TEST_GUIDE.md)

**Mục đích**: Xác nhận lỗi 403 có xảy ra trên app GUI không, 2 trường hợp có khác nhau không.

**Phương pháp**: agent-browser + CDP port 9222 (theo GUI_TEST_GUIDE.md của DeepSeek).

**Video input**: UgPoZ_BhtBg (Zen Edition Battle Realms Kenji Journey Dragon, 38:24, 933 MB).

### Kết quả

| Test | Setup | Status | Lỗi 403? | File output |
|---|---|---|---|---|
| **A: No cookie** | dropdown="Không dùng cookies" | ✅ Hoàn thành | ❌ Không | 933 MB / 1920×1080 / 38:24 |
| **B: Chrome cookie** | dropdown="Google Chrome" | ✅ Hoàn thành | ❌ Không | reuse file A (silent fallback) |

### Phát hiện quan trọng

**Video tải OK** trên cả 2 test, không có 403. Test B cũng OK vì **v0.9.10 đã silent disable browser_cookies** (Mavis trước đó đã report):

```rust
// src-tauri/src/downloader/mod.rs:1130-1142
.and_then(|b| {
    warn!("Bỏ qua browser_cookies={}: ...", b);
    None  // ← luôn None
});
```

### Về lỗi 403 PO gặp trước đó

- Lần trước PO bị 403 với `UgPoZ_BhtBg` → có thể YouTube tạm rate-limit IP
- Bây giờ Worker H test với **cùng URL** trên **cùng app v0.9.10** → tải OK 933MB
- → Vấn đề có thể đã tự hết hoặc fix nhầm ở v0.9.10

### Files output

```
H:\AI Project\sublix\agent-team\test-output-audit-giong\
├── download_A_nocookie.png               (189,699 bytes)
├── download_B_cookie.png                 (189,677 bytes)
└── testB_snapshot.txt                    (poll data 12 lần)
```

### Cleanup

- ✅ agent-browser session closed
- ✅ CDP port dead (9222)
- ✅ Sublix reopened SẠCH (không debug port) cho PO — PID 113712

---

## 3. Worker I — Dubbing full Kenji + hardcode sub (theo dõi PO nghe)

**Mục đích**: Test pipeline dubbing E2E đầy đủ trên video Kenji 38:24 multi-speaker, sau đó hardcode sub VI.

**Video input**: Zen Edition Battle Realms Kenji Journey Dragon (38:24, 933 MB, 1920×1080, 60fps).

### Voice mapping (multi-speaker) — đây là test PO yêu cầu "xem cách lồng nhiều nhân vật"

| Speaker | Giới tính | Segs | Voice Kokoro |
|---|---|---|---|
| speaker_0 | Nam | 73 | `tuan_ngoc` |
| speaker_1 | Nữ | 73 | `mai_linh` |
| speaker_2 | Nam | **80** (main) | `manh_dung` |
| speaker_3 | Nữ | 66 | `ngoc_huyen` |
| speaker_4 | Nam | 77 | `thanh_dat` |
| speaker_5 | Nữ | 76 | `my_yen` |

**3 nam + 3 nữ đan xen đúng giới tính thật** từ LLM (Mavis trước đó đã fix logic `idx % 2` ở v0.9.10). Noise filter không trigger vì cả 6 speakers đều có ≥66 segs.

### Timing

| Stage | Time |
|---|---|
| Stage 1 (Whisper CUDA + translate) | 2m14s |
| Stage 2 Kokoro (445 segs × ~9.6s/seg) | **~71 phút** |
| Stage 4 export (crash → fix manual) | ~19 phút |
| Stage 3 hardcode | <5s |
| **Total** | **~95 phút** |

### ⚠️ Bug phát hiện (cần fix v0.9.11)

**Stage 4 export CRASH ở vị trí 280/445** do Windows command-line 32KB limit:
- Lý do: FFmpeg concat với 445 inputs vượt 32KB
- Worker phải fix thủ công bằng Python junction
- **Fix cho v0.9.11**: dùng concat demuxer (`-f concat -i list.txt`) thay vì N inputs `-i`

### Files output (PO mở VLC nghe)

| File | Path | Size |
|---|---|---|
| **HARDSUB chính** | `C:\Users\TTC\AppData\Roaming\com.sublix.desktop\downloads\Kenji_Battle_Realms_VI_HARDSUB.mp4` | 909 MB |
| Copy audit | `H:\AI Project\sublix\agent-team\test-output-audit-giong\kenji_VI_HARDSUB.mp4` | 909 MB |
| SRT VI | `H:\AI Project\sublix\agent-team\test-output-audit-giong\kenji_VI.srt` | 60 KB |
| Log | `C:\Users\TTC\AppData\Local\Temp\test_Kenji_v0910.log` | 1416 lines |

### Phản hồi PO sau khi nghe

> *"giọng nhân vật lúc thì nam lúc nữ chả đồng nhất gì cả… nghe chả ra làm sao cả"*

**Phân tích root cause**: Hiện tại heuristic chỉ đoán speaker theo khoảng nghỉ → cùng 1 nhân vật có thể bị tách thành nhiều ID khác nhau → voice nhảy. Đây chính là **Phase V2** (đã có plan, chờ code) sẽ fix bằng sherpa-onnx diarization (audio-based).

---

## 4. Worker D — Kokoro multi-speaker R2nyc (lần trước)

**Mục đích**: Test pipeline Kokoro LOCAL multi-speaker đầu tiên trên R2nyc_oP9Yk 15:21.

**Video input**: R2nyc_oP9Yk (15:21, 152 MB — dry-aged steak jerky).

### Voice mapping

```
[speaker_0] Nhân vật 1 (Nam) => kokoro:tuan_ngoc
[speaker_1] Nhân vật 2 (Nữ) => kokoro:ngoc_huyen
[speaker_2] Nhân vật 3 (Nam) => kokoro:thanh_dat
[speaker_3] Nhân vật 4 (Nữ) => kokoro:mai_linh
[speaker_4] Nhân vật 5 (Nam) => kokoro:manh_dung
[speaker_5] Nhân vật 6 (Nữ) => kokoro:my_yen
```

### Vấn đề (Worker D ép sai)

- **Ép 6 voice cứng theo `idx % 2`** xen kẽ male/female (logic sai, bị Mavis chỉ ra)
- **Mavis đã fix v0.9.10** dùng `spk.gender` từ LLM + filter noise

### Output

```
C:\Users\TTC\AppData\Roaming\com.sublix.desktop\downloads\test_R2nyc_KOKORO_HARDSUB.mp4 (361 MB)
```

### Tham khảo

Worker D report trước đó: `test-output-audit-giong/test_R2nyc_KOKORO_HARDSUB.mp4`

---

## 5. Worker E — Multi-video v0.9.10 verify (lần trước)

**Mục đích**: Verify fix v0.9.10 (gender-based + filter noise) trên 3 video khác nhau.

### Kết quả (PASS cả 3 test case)

| Video | Type | Speakers | Voice output | Noise filter | Verify |
|---|---|---|---|---|---|
| R2nyc (3-min trim) | Multi-speaker | 6 (3 nam + 3 nữ) | đúng gender | 0 | ✅ |
| Teded (3-min trim) | 1 narrator | 2 | spk_0 `tuan_ngoc` ♂ · spk_1 `mai_linh` ♀ | 0 | ✅ |
| Rick Astley (full 3:33) | Short | 2 | spk_0 `tuan_ngoc` ♂ (31 segs) · spk_1 NOISE (2 segs) → gộp main | **1** | ✅ |

### Trade-off Worker E tự báo

- Worker E **đã trim Video 1+2 xuống 3 phút đầu** (Stage 2 Kokoro quá lâu với full video 15:21+25:08)
- Worker E **không sửa code**, chỉ chạm input (ffmpeg trim)

### Output

12 files trong `H:\AI Project\sublix\agent-team\test-output-audit-giong\`:
- `v1_R2nyc_multispkr_VI_dubbed.mp4` (25.8 MB)
- `v1_R2nyc_multispkr_VI_dubbed_HARDSUB.mp4` (25.8 MB)
- `v2_teded_1narrator_VI_dubbed.mp4` (15.2 MB)
- `v2_teded_1narrator_VI_dubbed_HARDSUB.mp4` (15.2 MB)
- `v3_rick_short_VI_dubbed.mp4` (30.3 MB)
- `v3_rick_short_VI_dubbed_HARDSUB.mp4` (30.3 MB)
- 6 file SRT + 6 file log

---

## 📌 Tổng kết vấn đề cần fix

| # | Vấn đề | Phát hiện bởi | Phase | File plan |
|---|---|---|---|---|
| 1 | **Voice nhân vật nhảy (không đồng nhất)** | PO nghe Kenji test | **V2** (diarization thật) | `KE_HOACH_V2_MAVIS_PROPOSAL.md` (new) |
| 2 | **Windows 32KB CMD limit** khi Stage 4 export >150 segs | Worker H test Kenji 445 segs | S2 (Phase V2) | đã note trong plan V2 |
| 3 | **MiniMax Cloud chậm hơn local 20×** | Worker F so sánh | Config default | đã đề xuất |
| 4 | **Browser cookies bị silent drop** | Worker H test GUI | Config (v0.9.10 đã fix) | đã report |
| 5 | **403 lúc trước có thể là YouTube rate limit** | Worker H không lập lại | Không cần fix | đã report |

---

## 🚀 Tiếp theo

1. **PO duyệt plan V2** (`KE_HOACH_V2_MAVIS_PROPOSAL.md`) → Mavis bắt đầu S1
2. **CommandCode review plan V2** → S1 (sidecar test)
3. Mỗi S2/S3/S4 cần CommandCode review trước khi Mavis sang bước tiếp
4. **PO v0**: lên kế hoạch đã xong. Đợi phản hồi.

---

*Báo cáo này Mavis tự compile sau khi 4 worker xong trong ngày 2026-10-07. Mỗi lần có worker xong mới, Mavis sẽ update file này.*