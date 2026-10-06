# KE_HOACH_GIONG_NOI_LONG_TIENG.md — Kế Hoạch Hoàn Thiện Giọng Nói & Lồng Tiếng (Bản 2026-10-06)

> **Mục tiêu:** làm cho Sublix lồng tiếng THẬT — phân vai đúng người, giọng lồng là **giọng của chính diễn viên gốc** nói tiếng Việt, cảm xúc điện ảnh, khớp thời lượng.
> **Thay thế** lựa chọn model cũ trong `docs/SPEC_AI_DUBBING_AND_LLM.md` (F5-TTS / Viterbox / Kokoro — dòng 2024–2025) bằng **model mới nhất khảo sát web 10/2026**. Prompt biên kịch điện ảnh (SPEC Mục 3C) giữ nguyên.
> **⚠️ LUẬT CHẠY THẬT (GOVERNANCE mục 0) áp dụng MỌI mục:** code xong = mở app thật + bấm chuột thật + **NGHE file âm thanh/video đầu ra thật** + ảnh/file bằng chứng. Báo `@done` từng lô 1–3 mục.

---

## 0. 🧠 BẢNG CHỌN MODEL (khảo sát web 2026 — TOÀN HÀNG MỚI)

| Vai trò trong app | Model CHỌN | Vì sao (2026) | Chạy trên RTX 3090 24GB? | Dự phòng |
|---|---|---|---|---|
| **Giọng clone chính (đa ngôn ngữ → tiếng Việt)** | **MOSS-TTS Local 1.7B** (Apache 2.0, 2026) | Clone giọng từ clip **3–10 giây KHÔNG cần bản ghi gốc/transcript**; 31 ngôn ngữ; **điều khiển độ dài từng từ** (cực hợp "khớp khẩu hình"); đọc ổn định đoạn dài | ✅ ~5GB VRAM — dư sức, chạy được song song STT/LLM | Bản MOSS Delay 8B (~18GB, cảm xúc hơn) cho máy mạnh |
| **Giọng clone tiếng Việt chuẩn thanh điệu** | **NeuTTS-Air-Vietnamese** (finetune 2.6M+ mẫu tiếng Việt) | Dòng Việt hoá riêng — thanh điệu tự nhiên hơn model đa ngôn ngữ khi đọc tiếng Việt | ✅ model nhẹ (dòng NeuTTS-Air chạy được cả CPU) | MOSS-TTS nếu test tiếng Việt đạt |
| **Giọng preset / thiết kế giọng + điều khiển bằng lời nói** | **Qwen3-TTS** (Apache 2.0, 1/2026) | Hãng Qwen: **voice clone + voice design + điều khiển bằng lời tự nhiên** ("nói thì thầm", "giọng nam trầm"); 49 chất giọng, 10 ngôn ngữ, trễ 97ms | ✅ bản 1.7B cần 6–8GB VRAM; bản 0.6B siêu nhẹ | Kokoro-82M (cũ nhưng nhẹ tênh cho máy yếu/CPU) |
| **Phân vai — ai nói câu nào (Diarization THẬT)** | **VibeVoice** (dẫn đầu benchmark 2026, 6–14 người nói) — hoặc **Pyannote 3.1** (cân bằng tốt, dễ nhúng) | Thay cho cách "đoán theo khoảng nghỉ + dấu câu" hiện tại (chỉ là giả lập, không phải AI) | ✅ cả hai chạy local được | NeMo SortFormer |
| **Nhận dạng giọng nói (STT)** | **GIỮ NGUYÊN Whisper Large-v3-Turbo** | Vẫn là lựa chọn tốt 2026, đang chạy ngon trên máy | ✅ đang chạy | — |
| **Giọng cloud (tùy chọn — cảm xúc xịn nhất)** | MiniMax Speech / ElevenLabs v3 | Cho người dùng có mạng, muốn chất lượng "điện ảnh" nhất | (đám mây — 0 VRAM) | Edge-TTS (miễn phí, dễ chết — hạ cấp thành "giọng nhanh tạm") |

**So sánh đã loại (để khỏi lăn tăn):** IndexTTS-2, CosyVoice 2/3, Spark-TTS, Fish Speech 1.5/S2 Pro, Higgs Audio V3, Breeze TTS 2, VoxCPM2, GLM-TTS, Chatterbox — đều là hàng tốt 2026 nhưng: hoặc chưa xác nhận tiếng Việt, hoặc nặng hơn, hoặc license/điều khiển kém hơn bộ 3 MOSS + NeuTTS-Vi + Qwen3-TTS ở trên. **Điều kiện tiên quyết khi tích hợp: test ngay 1 câu tiếng Việt có dấu** — nhiều model đa ngôn ngữ KHÔNG có Việt, fail là thay bằng dự phòng ngay.

---

## 📅 PHASE V1 — NÓI THẲNG SỰ THẬT + NGHE ĐƯỢC (làm trước tiên)

**Việc cần làm:**
1. Sửa mọi **lời quảng cáo không đúng** trong UI / Changelog / SPEC: "clone giọng" khi thật ra là Edge-TTS đọc thay → gọi đúng tên là *"Giọng đọc thay (cần mạng)"*; "Diarization AI" khi là đoán khoảng nghỉ → nói thật *"Phân vai theo nhịp thoại (tạm)"*.
2. Hoàn thiện đường đang có cho chắc: giọng đọc theo vai + nút nghe thử + xuất video lồng — bấm đâu ra đó.

**Nghiệm thu (Thẩm định):**
- [ ] Mở app, đọc MỌI dòng mô tả tính năng giọng nói → dòng nào cũng khớp với bấm được (không còn "quảng cáo ảo")
- [ ] Bảng audit 17 mục (`AUDIT_TAO_GIONG.md`) điền đủ + có bằng chứng ảnh/file
- [ ] Xuất 1 video lồng tiếng mẫu: nghe được tiếng Việt rõ ràng, file mở bằng VLC

## 📅 PHASE V2 — PHÂN VAI THẬT (Diarization)

**Việc cần làm:**
1. Tích hợp **VibeVoice** (hoặc Pyannote 3.1 nếu nhẹ hơn) chạy local — thay hoàn toàn cách đoán khoảng nghỉ.
2. Đầu ra: bảng kịch bản gán đúng "Ai nói câu nào"; đổi tên vai được (vd "Speaker 0" → "Minh"); **trích xuất tự động clip giọng mẫu 5–10s cho từng vai** (nguyên liệu cho Phase V3).
3. Gỡ hẳn lời "AI Diarization" tạm, thay bằng tên thật của công nghệ đang dùng.

**Nghiệm thu:**
- [ ] Test 3 video mẫu (2 người nói, 3 người nói, 1 video có nhạc nền): phân vai **đúng ≥90% số câu** (nghe lại đối chiếu)
- [ ] Đổi tên vai được, clip giọng mẫu 5–10s/vai trích ra nghe đúng giọng người đó
- [ ] Video có nhạc nền không làm phân vai loạn

## 📅 PHASE V3 — GIỌNG CLONE THẬT (TRỌNG TÂM — cái "trên giấy" xưa nay)

**Việc cần làm:**
1. Tích hợp **MOSS-TTS Local 1.7B** (chính) + **NeuTTS-Air-Vietnamese** (khi đầu ra là tiếng Việt): UI có ô nhận **file giọng mẫu 5–10s của từng vai** → đọc kịch bản tiếng Việt bằng **giọng của chính diễn viên đó**.
2. Chọn per-vai: "Giọng gốc (clone)" hoặc "Giọng preset" (Qwen3-TTS/Kokoro) — tự do trộn.
3. Tận dụng **điều khiển độ dài từng từ của MOSS** cho việc "khớp khẩu hình" (đúng tinh thần SPEC Mục 3C).

**Nghiệm thu (BẮT BUỘC có file nghe thử trong báo cáo):**
- [ ] Clone 3 vai từ 3 clip mẫu khác nhau → file ra có **3 giọng khác nhau**, nghe ra chất giọng gốc
- [ ] Đọc tiếng Việt **rõ thanh điệu** (test câu có dấu hỏi/ngã: "Cô ấy hỏi: Ủa, anh đi chưa?")
- [ ] Tốc độ: tổng hợp **chậm nhất bằng thời lượng video** (phim 20 phút → chờ tối đa ~20 phút)
- [ ] Ngắt mạng → vẫn clone + đọc tiếng Việt được (local 100%)
- [ ] Hủy giữa chừng → dừng ngay, không mất việc đã làm

## 📅 PHASE V4 — CẢM XÚC & KHỚP KHẨU HÌNH NÂNG CAO

**Việc cần làm:**
1. Dùng **điều khiển bằng lời của Qwen3-TTS** ("thì thầm", "gào lên", "giọng mỉa mai") thay cho thẻ `[tức_giận]` thô trong prompt cũ — hoặc ánh xạ thẻ cũ → lệnh điều khiển mới.
2. Dùng điều khiển độ dài của MOSS để nén/duỗi câu khớp khẩu hình ±15% (thay chỉ có `atempo`).

**Nghiệm thu:**
- [ ] 10 câu chỉ định cảm xúc (thì thầm / tức giận / vui / buồn / mỉa mai) → nghe phân biệt được **≥8/10**
- [ ] Câu dài bị nén khớp thời lượng: không chipmunk, không tràn sang câu sau

## 📅 PHASE V5 — DỌN DẸP & LỰA CHỌN CLOUD

**Việc cần làm:**
1. Hạ **Edge-TTS** khỏi vị trí "trụ cột" (dịch vụ online dễ chết) thành lựa chọn *"Giọng nhanh (cần mạng)"*; **mặc định = local** (MOSS / NeuTTS-Vi / Qwen3-TTS).
2. Thêm lựa chọn cloud (MiniMax Speech / ElevenLabs v3) cho ai muốn chất lượng cao nhất + có mạng — ghi rõ "cần mạng".

**Nghiệm thu:**
- [ ] Ngắt mạng → app vẫn lồng tiếng được bằng giọng local
- [ ] Chọn giọng cloud khi mất mạng → báo rõ "Cần kết nối mạng", không im lặng fail

---

## 📌 TIẾN ĐỘ TRIỂN KHAI (cập nhật 2026-10-07 01:05 — CommandCode)

### Lô 1 — "CHỌN GIỌNG BẰNG MẮT" (v0.9.9) ✅
- **Voice catalog theo model:** bấm ▸ xem **Nam/Nữ ngay cả TRƯỚC khi tải**; Kokoro 7 nam + 7 nữ; thêm card "Edge Neural (có sẵn)"; model clone ghi rõ cần clip mẫu 5–10s/vai.
- **Mẫu nghe thử tạo 1 lần + cache** (`voice_sample_generate` → `models/voice/<id>/samples/*.wav`, event tiến trình) — đúng nhận định PO: "load model 1 lần rồi trích xuất trước sample". Nghe lại tức thì (data URI), fallback synth trực tiếp khi chưa có cache.
- **Khớp voice đa vai:** pool 7 nam + 7 nữ, auto-cast giọng khác nhau xen kẽ; nhãn dropdown "♂/♀ + engine"; cảnh báo ⚠️ Trùng giọng. E2E 5 vai → 5 giọng khác nhau.
- Bằng chứng: `test-output-audit-giong/v099_*.png` + 14 file mẫu thật + audio phát thật (CDP click).

### Còn lại
- **V1 — 12 mục GUI test còn lại** của AUDIT-VOICE (nền cast/voice giờ đã mới).
- **V2 — phân vai thật** (sherpa/pyannote thay heuristic; model sherpa đã tải sẵn 34MB).
- **V3 — giọng clone thật** (MOSS-TTS/NeuTTS/viXTTS): cần dựng runner python + quản lý VRAM.

---

## ⚖️ LUẬT CHUNG (KHÔNG BÀN CÃI)

1. **LUẬT CHẠY THẬT** (GOVERNANCE mục 0): mỗi mục code xong → mở app thật + `agent-browser` (cổng 9222) bấm như người thật + **nghe file đầu ra thật** + bằng chứng ảnh/file vào `test-output-audit-giong/`. Báo 1–3 mục/lô. Thiếu bằng chứng = trả về.
2. **Model mới phải test câu tiếng Việt có dấu TRƯỚC khi tích hợp** — fail tiếng Việt là thay dự phòng ngay, không cố ép.
3. Mỗi Phase có bảng nghiệm thu tick được; **chưa tick hết không qua phase sau**.
4. Mọi lời quảng cáo trong UI/SPEC phải khớp bấm được — quảng cáo gì thì ra cái đó.
5. Quyền riêng tư & đạo đức: giọng clone chỉ dùng cho nội dung người dùng có quyền; ghi chú rõ trong UI (Quyết định số 4 trong `KE_HOACH_ALL_IN_ONE_PIPELINE.md`).

*Lộ trình liên quan: `AUDIT_TAO_GIONG.md` (kiểm tra hiện trạng — làm trước), `KE_HOACH_ALL_IN_ONE_PIPELINE.md` (Phase 2/3 tải video), `docs/SPEC_AI_DUBBING_AND_LLM.md` (prompt biên kịch giữ nguyên).*
