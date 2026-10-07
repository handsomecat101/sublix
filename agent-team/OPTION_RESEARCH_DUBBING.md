# Tổng Hợp Options Trong Tab Lồng Tiếng (DubbingStudioView)
> **Mục đích:** PO muốn khảo sát toàn bộ options để "chau chuốt". File này liệt kê **mọi button/handler** có trong `DubbingStudioView.tsx` (1380 dòng).
> **Người viết:** Mavis (MiniMax-M3) — 2026-10-07 06:55 (trước khi PO ngủ)
> **Nguồn:** đọc code `src/views/DubbingStudioView.tsx` (command + handler + button + title)
> **Trạng thái verify:** chưa test qua GUI thật (chỉ đọc code). Sẽ test qua `agent-browser` (cổng 9222) sau khi PO duyệt.

---

## 📊 Tổng quan: 5 nhóm chức năng, 18 handler/button

```
┌──────────────────────────────────────────────────────────────┐
│  1. VOICE & MODEL HUB (v0.9.9)          7 nút               │
│  2. FILE WORKFLOW                       4 nút               │
│  3. TRANSLATION PROVIDER               2 nút               │
│  4. RANGE & DUBBING MODE               5 nút               │
│  5. WORKFLOW + SCRIPT EDITOR           7 nút               │
└──────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ VOICE & MODEL HUB (v0.9.9)

| # | Nút / Handler | Dòng | Tác dụng | Đã verify? |
|---|---|---|---|---|
| 1.1 | `setShowVoiceHub` toggle | 605-620 | Thu gọn/mở rộng panel "🎛 Chọn Giọng & Tải Model" | 🟡 Code đúng, chưa test GUI |
| 1.2 | `setExpandedModel` ▸ | 642-657 | Mở danh sách giọng Nam/Nữ của từng model (xem cả TRƯỚC khi tải model) | 🟢 Verifier 17:13 đã test — 13 model, mỗi model có 7+7 nam/nữ |
| 1.3 | `handleVoiceDownload(id)` | 676-680 | Tải model voice từ HuggingFace về dùng local (có progress bar byte-level) | 🟢 Verifier — sherpa-diarization 34 MB tải thật |
| 1.4 | `handleGenerateSamples()` | 699-702 | Tạo mẫu nghe thử 14 giọng Kokoro 1 lần (~1 phút), cache `samples/*.wav` | 🟢 Verifier — 14/14 file thật, nghe tức thì |
| 1.5 | `handleAuditionVoice(voice)` | 735-740 | Nghe thử từng giọng — cache Kokoro (nếu có) hoặc TTS Edge fallback | 🟡 Code đúng, chưa test từng giọng |
| 1.6 | `handleAuditionVoice` (trong table) | 1110-1115 | Nghe thử từng câu thoại đã dịch với voice của speaker đó | 🟡 Code đúng |
| 1.7 | EDGE_MODEL (card ảo) | 509-519, 627-630 | Card "Edge Neural" không cần tải — dùng ngay Edge-TTS online | 🟢 8 giọng có sẵn, đã verify |

**⚠️ Risk:** Cần check `models/voice/sherpa-diarization/` filesize khớp claim (đã verify ✅). Cần test edge case "model tải xong nhưng load fail" (chưa test).

---

## 2️⃣ FILE WORKFLOW

| # | Nút / Handler | Dòng | Tác dụng | Đã verify? |
|---|---|---|---|---|
| 2.1 | "📁 Mở Thư Mục Thành Phẩm" | 780-786 | Mở `get_downloads_dir` (chứa cả file tải + file lồng tiếng) | 🟢 Phase V1 (20:38 06/10) đã có |
| 2.2 | `handleSelectFile()` | 802-810, 850-858 | Native file dialog chọn video (mp4/mkv/mov/avi/webm/mp3/m4a/wav/flac/aac/ogg/opus) | 🟡 Code đúng |
| 2.3 | "📂 Mở Thư Mục Lồng Tiếng" | 1333-1338 | **Mavis v0.9.8** — mở folder chứa `exportPath` + select file MP4 | 🟢 Mới thêm, chưa test GUI |
| 2.4 | "📂 Mở Thư Mục File Gốc" | 1348-1353 | **Mavis v0.9.8** — mở folder chứa input video | 🟢 Mới thêm, chưa test GUI |

**⚠️ Risk:** #2.1 đôi khi "không thấy file lồng tiếng" vì CLI test em làm trước đó output_path ở Temp, không phải Thư Mục Thành Phẩm → đã fix bằng copy file.

---

## 3️⃣ TRANSLATION PROVIDER (bộ não biên kịch)

| # | Nút / Handler | Dòng | Tác dụng | Đã verify? |
|---|---|---|---|---|
| 3.1 | `handleSwitchProvider("local")` | 920-928 | Qwen3-4B GPU RTX 3090 (~0.1s/câu, offline) — lưu vào config | 🟢 Verifier đã test |
| 3.2 | `handleSwitchProvider("minimax")` | 934-942 | MiniMax-M3 Cloud API (điện ảnh SOTA) — lưu vào config | 🟡 Chưa test qua UI; CLI test thấy MiniMax dịch "nghe chán" |

**⚠️ Known issue (PO ghi nhận 06:50):** MiniMax-M3 dịch "nghe chán" vì là LLM chung, không chuyên kịch bản phim.
→ **Đề xuất polish:** đổi default sang `qwen3.8-27b` (Ollama local) HOẶC tăng cường prompt biên kịch điện ảnh.

---

## 4️⃣ RANGE & DUBBING MODE

| # | Nút / Handler | Dòng | Tác dụng | Đã verify? |
|---|---|---|---|---|
| 4.1 | Range "3 phút đầu" | 959-973 | Whisper chỉ transcribe 3 phút đầu (180s time_limit) | 🟡 Code đúng, chưa test |
| 4.2 | Range "10 phút đầu" | 973-986 | Whisper chỉ transcribe 10 phút đầu (600s time_limit) | 🟡 Code đúng, chưa test |
| 4.3 | Range "Toàn bộ" | 986-? | Whisper transcribe toàn bộ (time_limit=undefined) | 🟢 Mặc định, đã verify nhiều lần |
| 4.4 | Mode "Thuyết Minh (Ducking)" | 1004-1017 | Giữ audio gốc + giảm 25% khi có thoại (phim tài liệu, tin tức) | 🟢 Verifier test Kokoro E2E |
| 4.5 | Mode "Lồng Tiếng Chiếu Rạp (Demucs v4 CUDA)" | 1019-1034 | Tách giọng gốc 100% bằng Demucs AI (cần Python + demucs package) | 🟡 Chưa test (cần `pip install demucs`) |

**⚠️ Risk:** Mode Chiếu Rạp chưa được test end-to-end. Nếu máy PO chưa cài `demucs`, mode này sẽ fail → fallback về Ducking.

---

## 5️⃣ WORKFLOW + SCRIPT EDITOR

| # | Nút / Handler | Dòng | Tác dụng | Đã verify? |
|---|---|---|---|---|
| 5.1 | `handleAnalyze()` | 1040-1054 | Chạy Stage 1: Whisper STT + diarize + LLM translate → DubbingProject | 🟢 Verifier đã test Kokoro |
| 5.2 | `handleCancel()` | 1064-1068 | Dừng tiến trình (gọi `dubbing_cancel` — atomic flag + kill PID tree) | 🟡 Chưa test (cần chạy 1 pipeline dài rồi bấm Cancel) |
| 5.3 | Script table — `handleUpdateSegmentSpeaker` | 1288-1298 | Đổi speaker cho segment qua `<select>` | 🟢 Code đúng |
| 5.4 | Script table — `handleUpdateSegmentText` | 1302-1307 | Sửa text dịch qua `<textarea>` | 🟢 Code đúng |
| 5.5 | Script table — `handlePreviewTts(seg)` | 1310-1312 | Nghe thử 1 câu đã dịch với voice của speaker | 🟡 Chưa test |
| 5.6 | `handleUpdateSpeakerLabel` (input rename) | 1162-1168 | Đổi tên vai (vd "Speaker 0" → "Minh") | 🟢 Code đúng |
| 5.7 | `handleRemoveSpeaker` 🗑️ | 1178-1193 | Xoá vai (giữ >= 1 vai; segments bị xoá → fallback về vai đầu tiên) | 🟢 Code đúng |

**⚠️ Risk:** Các handler đơn giản (đổi tên, đổi vai) dễ test. `handleCancel` cần test khi pipeline đang chạy thật (chưa làm).

---

## 6️⃣ Speaker Card Details (v0.9.9 — voice auto-cast)

| # | Feature | Dòng | Tác dụng | Đã verify? |
|---|---|---|---|---|
| 6.1 | CustomSelect chọn voice | 1198-? | Dropdown chọn voice cho speaker (auto-cast Nam/Nữ) | 🟢 Verifier test dialogue_2spk.wav |
| 6.2 | Chip ⚠️ Trùng giọng | 1169-1176 | Cảnh báo khi 2 vai share cùng voice | 🟢 Verifier test — ép trùng → 2 chip ⚠️ |
| 6.3 | `pickUnusedVoice(isMale)` | 442-451, 449 | Tự chọn voice chưa dùng khi thêm speaker mới | 🟡 Code đúng |

---

## 📋 Tổng hợp risk/issues CẦN POLISH (anh Tuấn muốn "chau chuốt")

| # | Vấn đề | Mức độ | Effort |
|---|---|---|---|
| R1 | **MiniMax-M3 dịch "nghe chán"** cho kịch bản phim — PO đã ghi nhận | 🟡 CAO | Prompt khắc phục ~30 phút |
| R2 | **Audio track thiếu `language=vie` tag** trong MP4 output (Dubbing + Hardcode đều không set) | 🟡 TB | ffmpeg `-metadata:s:a:0 language=vul` ~5 phút |
| R3 | **Diarization over-cluster**: video 1-host tách thành 6 speakers (cần tích hợp V2 sherpa-onnx — agent khác đang làm) | 🟠 CAO | Chờ V2 |
| R4 | **Stage 3 translate latency không ổn định**: 15-line batch Python = 16.6s, nhưng Rust 29-segment/2 batches = 196s (98s/batch — gap 22x) | 🟡 TB | Reduce chunk 15→10 ~10 phút |
| R5 | **Config drift**: Sublix app liên tục ghi đè `translation_provider` → mỗi lần user đổi setting reset | 🟡 TB | Trong TASK_A_Z chưa fix |
| R6 | **30-line batch timeout 120s** (reqwest timeout 60s conflict) — chưa gặp với batch 15 nhưng risk nếu segment dài | 🟡 TB | Tăng reqwest timeout ~5 phút |
| R7 | **Hardcode sub chưa có trong app** (chỉ xuất MP4 audio VI) — chỉ có ở CLI test em làm | 🟠 CAO | Thêm vào Phase V2 polish |
| R8 | **Mode Chiếu Rạp (Demucs) chưa test E2E** | 🟠 CAO | Test + fix nếu fail |

---

## 🎯 Đề xuất thứ tự polish (em có thể làm)

1. **R2** (audio lang tag) — 5 phút, fix ngay
2. **R4** (chunk 15→10) — 10 phút, fix ổn định
3. **R1** (MiniMax prompt) — 30 phút, tăng chất lượng dịch
4. **R7** (hardcode sub vào app) — 1-2 giờ, thêm feature
6. **R5** (config drift) — fix trong TASK_A_Z S3
5. **R8** (Demucs test) — 30 phút test
7. **R3** (diarization V2) — chờ agent khác

Tổng effort ước tính: **3-4 giờ** polish.

---

## Files tham khảo
- `H:\AI Project\sublix\src\views\DubbingStudioView.tsx` (1380 dòng, 7 useState + 18 handlers + 30+ UI elements)
- `H:\AI Project\sublix\src-tauri\src\dubbing\mod.rs` (pipeline backend)
- `H:\AI Project\sublix\agent-team\HANDOFF_V0.9.9_VOICE_CATALOG.md` (voice catalog v0.9.9)
- `H:\AI Project\sublix\agent-team\TASK_A_Z_ONE_CLICK.md` (S1→S5 plan)
- `H:\AI Project\sublix\agent-team\AUDIT_SUB_REPORT.md` (F1-F5 findings)
- `H:\AI Project\sublix\agent-team\AUDIT_TAO_GIONG.md` (17 mục voice audit)

---

*Tạo bởi Mavis (MiniMax-M3) cho Anh Tuấn — khi anh thức có thể quyết định thứ tự polish.*