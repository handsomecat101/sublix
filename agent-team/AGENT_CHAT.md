# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-07 23:45 - Antigravity
- **Loại:** `@done → @CommandCode @Mavis (PO: Trọn vẹn Phase V2 S2 + S3 + S4 v0.10.0)`
- **S2 Backend (`dubbing/mod.rs`):** Tích hợp sherpa diarization vào `analyze_and_create_project()` + trích 2-8s audio mẫu per-speaker sang Base64 Data URI. Unit test `test_sherpa_diarization_integration` PASS (6.07s).
- **S3 UI (`DubbingStudioView.tsx`):** Thêm nút "🔊 Nghe giọng gốc" sample preview, dropdown gộp vai "🔗 Gộp vào vai...", badge 🟢 Phân vai AI Offline (Sherpa) / 🟡 Heuristic, chip đếm phân đoạn. `npm run build` PASS (2.45s).
- **S4 Verify & Deliverables (`agent-team/test-output-audit-giong/`):** Chạy E2E thật trên `multi_speaker_scene.mp4` → `v2_multi_speaker_DUBBED.mp4` (375KB, 26s aac+h264), `v2_speaker_0_sample.wav` (192KB, 6s), `v2_speaker_1_sample.wav` (160KB, 5s), `v2_project_output.json`.
- **Báo cáo chi tiết:** `agent-team/REPORT_PHASE_V2_COMPLETION.md`. Phiên bản bump lên `v0.10.0`.
- **Handoff:** Kính mời @Mavis và @CommandCode test GUI / audit độc lập theo checklist để PO nghiệm thu.

---

### 2026-10-07 22:50 - Anh Tuấn (PO) / ghi bởi CommandCode
- **Loại:** `@assign → Antigravity (Gemini)` — **LÀM TRỌN 1 KÈO phần còn lại của V2 Phân Vai** (S2 + S3 + S4 theo `KE_HOACH_V2_MAVIS_PROPOSAL.md`), làm liền mạch không cần chờ review từng chặng.
- **⚠️ 4 ĐIỀU KIỆN CỦA PO (bất khả xâm phạm):**
  1. **Bên trong kèo vẫn test thật từng chặng:** S2 xong → chạy thử thật + báo 1 dòng ngắn → mới S3 → S4. Không "làm hết rồi mới test".
  2. **Không phá cái đang chạy:** chỉ THÊM field optional, không đổi `DubbingProject`/signature có sẵn; không đụng `downloader/`.
  3. **Cuối kèo phải có bộ bằng chứng:** ảnh GUI + file thật trong `test-output-audit-giong/` (prefix `v2-`) — video nhiều vai **giọng nhất quán từng nhân vật** + bảng nhân vật UI đổi tên/đổi giọng/nghe clip mẫu hoạt động.
  4. **Xong kèo → Mavis kiểm tra lại độc lập** (GUI test thật theo checklist tin 22:30) → CommandCode review cuối → PO nghiệm thu.
- **Tham chiếu:** `KE_HOACH_V2_MAVIS_PROPOSAL.md` (§2 S2-S4 + §9).
- **Việc tiếp theo:** Gemini báo `@done` kèm bằng chứng → Mavis test lại.

---

### 2026-10-07 22:30 - CommandCode → @Mavis (PO yêu cầu: đi test GUI THẬT)
- **Loại:** `@assign → Mavis` (nghiệm thu GUI thật cho bản build hiện tại — LUẬT CHẠY THẬT)
- **Kết quả review tin 21:45 (Antigravity):** ✅ **LÀM THẬT, ĐẠT** — CommandCode tự chạy lại độc lập: unit test hotfix 32KB PASS; sidecar `sherpa_diarize.py` ra **giống hệt** `diarize_result.json` (2 vai, `[0,1,0,1,0]`). Đã vá 1 lỗi nhỏ: fallback ffmpeg hardcode trong `sherpa_diarize.py` → PATH/cạnh app.
- **Nhiệm vụ Mavis — TEST GUI THẬT (bằng chứng prefix `gui-`):** (1) lồng tiếng video **400+ phân đoạn** (Kenji 38:24) qua APP → xuất được, VLC nghe được; (2) A→Z trên video thật → file trong Thư Mục Thành Phẩm; (3) % tiến trình chạy + Dừng giữa chừng; (4) ảnh + đường dẫn file vào báo cáo `@done`.
- **Sau khi đạt:** Antigravity/Mavis bật đèn xanh **Step S2** (tích hợp diarization vào `analyze_and_create_project`, chỉ thêm field optional).
- **Lưu ý:** `test_dubbing_input/diarize_result_RETEST*.json` là bằng chứng tái kiểm của CommandCode.

---

### 2026-10-07 21:45 - Antigravity
- **Loại:** `@done` (Hotfix 32KB CMD Limit phim dài + Step S1 Offline Diarization Sidecar)
- **Hotfix 32KB (`dubbing/mod.rs`):** `render_combined_speech_track` gộp âm thanh phân cấp ≤28 inputs/chunk; CLI remux cuối ≤3 inputs. Test 100 segments pass 0.87s.
- **S1 (`scripts/sherpa_diarize.py`):** sherpa-onnx offline. Test `dialogue_2spk.wav`: đúng 2 speakers, `[0,1,0,1,0]` (100% ground truth — `test_dubbing_input/diarize_result.json`). Test 1-speaker đúng 1 vai.
- **Bằng chứng:** `diarize_result.json`; unit test `test_render_combined_speech_track_large_segments` pass; `cargo check --all-targets` ✅; `npm run build` ✅.
- **Việc tiếp theo:** chờ nghiệm thu S1 → Step S2 (tích hợp vào `analyze_and_create_project`).

---

### 2026-10-07 13:27 - Mavis (MiniMax-M3)
- **Loại:** `@plan` — PO yêu cầu cải thiện tốc độ + test multi-speaker
- **Lưu ý:** `R2nyc_oP9Yk` là **audio-only YouTube** (không có stream MP4) → không render video được; em dùng alternate `test_ai_21m.mp4` (21:43).
- **Worker C:** A→Z pipeline `test_ai_21m` **Kokoro LOCAL** (14 giọng Việt) + ép voice 6 speakers (3 nam `tuan_ngoc/manh_dung/thanh_dat` + 3 nữ `mai_linh/ngoc_huyen/my_yen`) — so tốc độ với Worker B (Edge-TTS 37 phút).
- **Khi Worker C xong:** so sánh Kokoro vs Edge-TTS → đề xuất (Plan V5: Kokoro làm default).

---

### 2026-10-07 07:54 - Mavis (MiniMax-M3)
- **Loại:** `@done-AZ-pipeline` (Worker B hoàn thành A→Z + hardcode sub)
- **Deliverable (đã copy vào Thư Mục Thành Phẩm):** `test_ai_21m_VI_dubbed_HARDSUB.mp4` (88 MB, sub burned) + `test_ai_21m.vi.srt` (316 segments VI) + `test_ai_21m_VI_dubbed.mp4` (76 MB).
- **Timing:** tổng 40 phút — Stage 1 ~13 phút + Stage 2 TTS ~33 phút + hardcode sub ~3 phút.
- **Code mới:** `src-tauri/examples/test_dubbing_srt.rs` (export `.vi.srt` + `export_dubbed_video`).
- **Khi PO thức:** mở VLC nghe + đọc `OPTION_RESEARCH_DUBBING.md` → quyết thứ tự polish R1-R8.

---

### 2026-10-07 07:25 - Mavis (MiniMax-M3)
- **Loại:** `@info` — Option research tab Lồng Tiếng + Worker B đang chạy
- **File mới:** `OPTION_RESEARCH_DUBBING.md` — 18 options/handlers, 6 nhóm; **8 issues cần polish R1-R8** (R1 dịch "nghe chán", R2 thiếu `language=vie`, R3 over-cluster, R4 latency Stage 3, R5 config drift, R6 batch timeout, R7 hardcode sub, R8 Demucs chưa test). Effort 3-4 giờ (ưu tiên R2+R4+R1+R7).

---

### 2026-10-07 07:08 - Mavis (MiniMax-M3)
- **Loại:** `@update` — `R2nyc_oP9Yk` là audio-only, không tải video MP4 được → Worker A hủy, Worker B chạy alternate `test_ai_21m.mp4`. Khi PO thức: cho URL khác (có stream MP4) nếu muốn chạy đúng video cũ.

---