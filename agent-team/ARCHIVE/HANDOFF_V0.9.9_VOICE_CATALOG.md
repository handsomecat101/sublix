# HANDOFF_V0.9.9 — Voice Catalog + Mẫu Nghe Thử + Khớp Voice Đa Vai

> Từ: **CommandCode** · Ngày: 2026-10-07 · Commit: `c694ccd` · Cho: mọi agent (Mavis, Antigravity, Claude Code…) + PO.
> Bằng chứng chạy thật: `test-output-audit-giong/v099_voice-catalog-hub.png`, `v099_multi-role-casting.png`.

---

## 1. Người dùng giờ làm được gì (PO cần biết)

- **Chọn model → xem giọng Nam/Nữ:** panel "🎛 Chọn Giọng & Tải Model" (tab Studio Lồng Tiếng) — bấm **▸** cạnh mỗi model để mở danh sách giọng. Kokoro-Vietnamese = **7 nam + 7 nữ**; card **"Edge Neural (có sẵn)"** = 8 giọng offline-free; model clone (MOSS/NeuTTS/F5/viXTTS) ghi rõ **cần clip giọng mẫu 5–10s cho mỗi vai**. Danh sách hiện **cả trước khi tải model**.
- **🎧 Mẫu nghe thử tạo 1 lần — nghe tức thì:** bấm "Tạo mẫu nghe thử 14 giọng" (~1 phút, có tiến trình X/14) → audio cache lại; các lần sau bấm 🔊 là nghe ngay từ cache (không tổng hợp lại).
- **Khớp voice đa vai:** tự gán giọng **khác nhau, xen kẽ Nam/Nữ** cho từng vai; dropdown hiện nhãn "♂ Nam — Tuấn Ngọc (Kokoro offline)"; thêm nhân vật mới tự chọn giọng **chưa dùng**; cảnh báo **⚠️ "Trùng giọng"** khi 2 vai share giọng.

---

## 2. Kiến trúc — cho agent code tiếp

| Thành phần | Nơi |
|---|---|
| Giọng Kokoro (14) | `src-tauri/src/dubbing/mod.rs` → `get_kokoro_voices()` (const `KOKORO_VOICES`) |
| Tạo/list/đọc mẫu | cùng file → `voice_samples_dir()`, `list_voice_samples()`, `generate_kokoro_samples()`, `voice_sample_data()` |
| Tauri commands | `src-tauri/src/lib.rs` → `voice_sample_list`, `voice_sample_generate`, `voice_sample_data` |
| Event tiến trình | `voice:sample_progress { model_id, voice_id, index, total, done, error }` |
| Frontend | `src/views/DubbingStudioView.tsx` → `EDGE_MODEL` (card ảo), `voicesForModel()`, `cleanVoiceName()`, `handleGenerateSamples()`, `pickUnusedVoice()`, `duplicateVoiceIds`; CSS thêm ở cuối `DubbingStudioView.css` (`.dubbing-voice-*`, `.dubbing-dup-chip`) |
| Cache mẫu | `src-tauri/models/voice/kokoro-vi/samples/<voice>.wav` (24kHz mono — **gitignored**) |

**Muốn thêm giọng Kokoro mới:** thêm dòng vào `KOKORO_VOICES` + chép voicepack `.pt` vào `voicepacks/` + cập nhật `voices.json` (để lần sau tải model mới cũng có).

**Muốn thêm danh sách giọng cho model KHÁC:** mở rộng `voicesForModel()` (frontend) + cấp dữ liệu giọng từ backend (hiện chỉ Kokoro + Edge; VietTTS/Qwen để nguyên ghi chú vì chưa nối engine).

---

## 3. ⚠️ Bẫy phải đọc trước khi test

1. **`BUG-H08` (ISSUE_LOG):** app dev ghi file runtime vào `src-tauri/models` (base dir dev = `CARGO_MANIFEST_DIR`) → `tauri dev` watcher tưởng đổi code → **auto-restart, giết tiến trình đang chạy**. → Test tính năng ghi model phải chạy: `npm run tauri dev -- --no-watch`.
2. **Test GUI:** dùng `test_dubbing_input/ab2.ps1` — gọi agent-browser không bao giờ treo (xem `GUI_TEST_GUIDE.md` mục 7, có thêm cách chèn file test + click thật để qua autoplay).
3. **Python (máy này) cần:** `onnxruntime, numpy, torch, vig2p` (Kokoro). V2 diarization sẽ cần thêm `sherpa-onnx`.

---

## 4. Việc còn tồn (của ca trước — không đụng để tránh đè)

- `src/views/SettingsView.tsx` + `.css` (dời hub khỏi tab Models) — chưa commit.
- `agent-team/GOVERNANCE.md`, `agent-team/QUY_TRINH.md` — sửa dở, chưa commit.
- `src-tauri/examples/*` (3 file test của Mavis) — chưa commit.
- Process `python api_server.py` (PID 105812, từ 19:13 hôm 06/10) — của PO, chờ PO quyết.

---

## 5. Bước tiếp theo đã lên lịch

- **Phase V2 — Phân vai thật (sherpa-onnx):** xem `KE_HOACH_V2_PHAN_VAI_THAT.md` (chờ PO duyệt).
- Sau V2: **Phase V3 — giọng clone thật** (MOSS-TTS/NeuTTS/viXTTS) — clip giọng mẫu 5–10s/vai sẽ do V2 trích tự động.
