# KE_HOACH_V2_PHAN_VAI_THAT.md — Phương Án Phase V2: Phân Vai Thật (Diarization)

> Soạn: **CommandCode** · Ngày: 2026-10-07 · Trạng thái: **CHỜ PO DUYỆT (chưa code)**
> Liên quan: `KE_HOACH_GIONG_NOI_LONG_TIENG.md` (Phase V2) · `HANDOFF_V0.9.9_VOICE_CATALOG.md` · `ISSUE_LOG.md` (BUG-H08)

---

## 1. Hiện trạng (v0.9.9) — vì sao cần V2

- Cách gán vai hiện tại **chỉ là đoán theo khoảng nghỉ**: hàm `clean_and_merge_raw_segments()` trong `src-tauri/src/dubbing/mod.rs` (dòng ~677–765) dùng `is_turn_boundary()` — hễ "có vẻ hết câu" thì tăng `speaker_idx = (idx + 1) % 6`. **Không hề biết ai là ai thật.**
- Bằng chứng sai: file test 20s / 5 câu (nam–nữ xen kẽ, biết chắc chỉ 2 người) → app báo **5 vai**.
- Hệ quả: số vai sai khi câu ngắt bất thường / có nhạc nền; **không trích được clip giọng mẫu theo vai** (thứ Phase V3 cần).
- **Nguyên liệu đã sẵn sàng:**
  - Model sherpa diarization **đã tải** trong `src-tauri/models/voice/sherpa-diarization/`: `sherpa-onnx-pyannote-segmentation-3-0.tar.bz2` (6,9 MB — bên trong là `sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx`) + `wespeaker_en_voxceleb_resnet34_LM.onnx` (26,5 MB, embedding).
  - Wheel **`sherpa-onnx` cho Windows có sẵn trên PyPI** (đã xác nhận: `pip install sherpa-onnx` → 1.13.8) — chạy offline 100%, CPU, 0 VRAM.

## 2. Chọn engine — và vì sao

| Phương án | Đánh giá |
|---|---|
| **sherpa-onnx diarization (đề xuất)** | Dùng đúng model pyannote-segmentation (MIT/CC) + wespeaker embedding, chạy qua **Python sidecar** — cùng khuôn mẫu Kokoro đã chạy ổn (không đụng build native Rust). Offline, CPU, nhẹ (~0,5 GB RAM). |
| VibeVoice | Là engine **TTS đa người nói**, không phải diarization thuần — bỏ khỏi V2 (giữ cho V3/V4 nếu cần). |
| Pyannote 3.1 gốc | Repo **gated** (cần token HF như catalog đã ghi) — không 1-click được. |

## 2b. Cơ chế "biết ai nói câu nào" — giải thích cho PO (không cần LLM đoán)

1. **Whisper** trả về: nội dung từng câu + **MỐC THỜI GIAN** (start–end giây).
2. **sherpa diarization** chỉ nghe SÓNG ÂM (không đọc chữ): đo "dấu vân tay giọng" (embedding: trầm/bổng, âm sắc, cách phát âm…) trên từng đoạn rồi **gom cụm** — giống nhau = cùng một người → xuất **bản đồ "ai nói lúc nào"**: `0.0–3.4s = Speaker 0; 4.1–7.5s = Speaker 1; …`
3. **Ghép theo THỜI GIAN (overlap):** câu nào nằm trong đoạn thời gian của ai thì thuộc người đó (câu "Chào bạn!" ở 4.1–7.5s → Speaker 1). Đây là **so khớp mốc thời gian**, không phải đoán theo nội dung — nên đổi mọi thứ trong câu nói cũng không làm sai vai.
4. **Giới tính (nam/nữ):** diarization không nói nam/nữ — mặc định gán xen kẽ; nâng cấp (tùy chọn) là đo **tần số cơ bản f0** của từng vai (nam ~85–180Hz, nữ ~165–255Hz) — vẫn là xử lý tín hiệu, không cần LLM.

**Vậy còn cần LLM không?**
- **Phân vai (ai nói câu nào): KHÔNG cần LLM** — thay bằng sóng âm + so khớp thời gian (chính xác hơn hẳn cách "đoán theo dấu câu" hiện tại đang cho 5 câu = 5 vai sai).
- **LLM vẫn giữ vai trò quan trọng ở bước khác:**
  - (a) **Dịch + biên kịch lời thoại** tiếng Việt tự nhiên (Local Qwen / MiniMax) — giữ nguyên;
  - (b) **Tùy chọn hay:** đọc nội dung để **đặt tên vai** ("Tôi là Lan" → vai tên "Lan") + gợi ý nam/nữ theo ngữ cảnh;
  - (c) Dự phòng khi máy thiếu model/python.
- Nhánh hiện có `diarize_and_script_via_minimax()` = LLM **vừa đoán vai vừa viết kịch bản**. Sau V2: phần **đoán vai** bị thay bằng sherpa (sự thật từ audio), phần **viết kịch bản** vẫn do LLM.

---

## 3. Phương án kỹ thuật (4 bước, làm tuần tự)

### S1 — Sidecar + test CLI (chưa đụng app)
1. `pip install sherpa-onnx` cho Python313.
2. Giải nén segmentation: dùng **`python -m tarfile -e`** — LƯU Ý: `tar` của Windows **không có bzip2**, `tar -xjf` sẽ fail.
3. Viết `src-tauri/scripts/sherpa_diarize.py`:
   - Input: `--wav <16k mono wav> --model-dir <sherpa-diarization> [--threshold 0.5] [--num-speakers N] --out result.json`
   - Output: JSON `[{ "start": 0.0, "end": 3.4, "speaker": 0 }, …]` (sort theo start).
   - API sherpa: `OfflineSpeakerDiarization` (pyannote segmentation config + wespeaker embedding + FastClustering; `num_clusters=-1` = tự đoán số vai).
4. Test CLI trên `test_dubbing_input/dialogue_2spk.wav` → **phải ra đúng 2 speakers** (hiện tại heuristic ra 5). Tinh chỉnh `threshold` (0.5–0.8) + `min_duration_on/off` cho tiếng Việt.
   - **Điểm dừng nghiệm thu S1:** JSON đúng 2 vai luân phiên nam/nữ → PO xem kết quả trước khi tích hợp.

### S2 — Tích hợp pipeline Rust
- Trong `analyze_and_create_project()` (`dubbing/mod.rs` ~1111): sau khi có transcript (whisper), **thay** bước gán vai trong `clean_and_merge_raw_segments()`:
  1. Gọi sidecar (reuse khuôn `ensure_kokoro_script` + `find_python` — viết script ra `app_base_dir/scripts/`);
  2. Map mỗi câu → speaker = **overlap thời gian lớn nhất** với turn của sherpa (thay vì đếm turn);
  3. **Fallback nguyên trạng:** thiếu model/python/lỗi → dùng heuristic cũ + cảnh báo rõ (không chặn pipeline);
  4. Thêm field `diarization_engine: "sherpa" | "heuristic"` vào `DubbingProject` → UI hiện badge nhỏ (LUẬT #4: quảng cáo đúng cái đang chạy).
- Progress: dùng stage `diarizing` có sẵn — emit mốc thật (trích audio xong → sidecar xong → map xong).

### S3 — Nối auto-cast + trích clip giọng mẫu (mở đường V3)
- Auto-cast dùng **số vai thật** từ sherpa (pool 7 nam + 7 nữ của v0.9.9 đã sẵn).
- **Trích clip giọng mẫu 5–10s cho mỗi vai** (mục 2 của Phase V2): lấy đoạn audio dài nhất/thuần nhất của mỗi speaker → xuất `sample_<speaker>.wav` cạnh file export (hoặc `test_dubbing_input/` khi test) — nghe lại xác nhận + nguyên liệu cho V3 clone giọng.
- (Tùy chọn nâng cấp) Ước lượng **pitch trung bình mỗi vai** để gán nam/nữ thực thay vì xen kẽ theo thứ tự — chỉ làm nếu S1–S3 ổn.

### S4 — Verify E2E + bằng chứng + docs + commit (đề xuất bump **v0.10.0**)
- 3 file test theo đúng nghiệm thu KE_HOACH V2:
  - (a) **2 người nói** — `dialogue_2spk.wav` (đã có, tự biết đáp án từng câu);
  - (b) **3 người nói** — mở rộng `make_dialogue.ps1` thêm giọng thứ 3 (Kokoro, tự biết đáp án);
  - (c) **clip phim 3 phút có nhạc nền** — cắt từ video đã tải trong app.
- Đo accuracy: đếm % câu gán đúng vai (đối chiếu đáp án mình dựng) — mục tiêu **≥90%**.
- Bằng chứng → `test-output-audit-giong/` (ảnh GUI + JSON diarization + clip sample từng vai).
- Docs: CHANGELOG + ChangelogModal + AGENT_CHAT @done + DEV-LOG + PROJECT_STATE; commit tách (sidecar / tích hợp / docs).

## 4. Rủi ro & đối sách

| Rủi ro | Đối sách |
|---|---|
| Wheel sherpa-onnx lỗi trên Python313 | Thử bản 1.12.x; worst-case: viết clustering bằng `onnxruntime` thuần (wespeaker embedding đã có) — báo PO trước khi đổi hướng |
| API không nhận `model.int8.onnx` | Tải bản full-precision (~30 MB) từ repo k2-fsa — cùng giấy phép |
| Tách quá nhiều vai (over-segment) | Tinh chỉnh threshold + thêm `--num-speakers` khi user biết số vai; cap trần hợp lý |
| 3 phút audio CPU chạy lâu | int8 + giới hạn min_duration; chấp nhận "chạy 1 lần khi phân tích" nhưng phải hiện progress rõ |
| Nhạc nền làm nhiễu | Test (c) bắt buộc chạy — sherpa có VAD lọc sẵn trong segmentation |

## 5. Nghiệm thu (cụ thể hoá từ KE_HOACH V2)

- [ ] `dialogue_2spk.wav` → **đúng 2 vai** (hiện tại sai: 5 vai)
- [ ] File 3 người nói → đúng 3 vai, **≥90% câu gán đúng người**
- [ ] Clip phim 3 phút có nhạc nền → số vai hợp lý, không loạn
- [ ] Mỗi vai có **clip giọng mẫu 5–10s** nghe đúng giọng người đó
- [ ] Thiếu model/python → **fallback heuristic + báo rõ**, không crash
- [ ] Badge UI hiện đúng engine đang chạy (không quảng cáo sai)

## 6. Thứ tự thực hiện

S1 (sidecar + bằng chứng sống) → **PO duyệt kết quả S1** → S2 (tích hợp) → S3 (cast + clip mẫu) → S4 (verify + commit v0.10.0).

---

## 7. BỔ SUNG SAU REVIEW (CommandCode — 2026-10-06, theo yêu cầu PO "xem có bổ sung gì không")

**Đánh giá chung: kế hoạch ĐẠT, hướng đi đúng** (chọn sherpa-onnx chuẩn, có fallback, có điểm dừng S1 cho PO, cơ chế 2b giải thích đúng bản chất "so khớp mốc thời gian"). Các điểm sau là bổ sung cho kín, **không phải phản bác**:

1. **Ghi rõ LUẬT CHẠY THẬT vào bước nghiệm thu (bắt buộc):** S1 chạy CLI là được; nhưng **S2–S4 phải kèm test GUI thật** (`agent-browser --cdp 9222`, bấm thật) + bằng chứng ảnh/JSON vào `test-output-audit-giong/`. Báo cáo thiếu bằng chứng = chưa xong (`GOVERNANCE.md` mục 0).
2. **Câu dài chứa NHIỀU người nói (lỗ hổng lớn nhất của phép map overlap):** câu Whisper kéo 8s mà bên trong đổi 2 người → "overlap lớn nhất" gán hết cho 1 người. Đối sách: (a) chia lại câu theo ranh giới turn của sherpa (split thành 2 sub-segment); hoặc (b) tối thiểu phải **phát hiện + cảnh báo** trên UI ("⚠ Câu #X có nhiều người nói") — làm (a) là tốt, (b) là bắt buộc.
3. **Định nghĩa cách chấm "≥90%" cho kiểm chứng lại được:** khi dựng fixture (S4a/b) tạo kèm `test_dubbing_input/ground_truth_<tên>.json` (mốc thời gian + người nói kỳ vọng). Cách chấm: mỗi câu Whisper "đúng" khi ≥50% thời lượng của câu overlap speaker đúng trong ground-truth. Ghi công thức chấm này vào S4 để không chấm cảm tính.
4. **Phối hợp với Mavis (đang làm `TASK_A_Z_ONE_CLICK.md` — trùng khu vực `dubbing/mod.rs`):** theo QUY_TRINH Bước 1, **khóa task trong `PROJECT_STATE.md` trước khi sửa**; chỉ **THÊM** field optional vào `DubbingProject` (`diarization_engine`, `speaker_samples`…), **KHÔNG đổi signature/đặt tên field có sẵn** để dây chuyền A→Z của Mavis không vỡ. Báo 1 dòng trên `AGENT_CHAT.md` trước khi đụng `analyze_and_create_project()`.
5. **Thêm 1 ca test biên vào S4: file 1 người nói** — quá trình gom cụm phải ra **đúng 1 vai** (chống tách nhỏ quá mức khi chỉ có 1 giọng). Đây là mặt trái dễ bỏ của "đúng 2 vai".
6. **Clip giọng mẫu (S3) — làm sạch & chuẩn vị trí:** chọn đoạn có **năng lượng giọng thuần** (loại đoạn có nhạc nền/hiệu ứng lọt — đo RMS/energy đơn giản là được); xuất WAV mono; đặt `sample_<speaker>_<start>_<end>.wav`; gom vào **`<Thư Mục Thành Phẩm>/voice_samples/`** (không rải cạnh file export) + ghi đường dẫn vào `DubbingProject` để V3 dùng thẳng.
7. **Test tiếng Việt là bắt buộc (wespeaker `en_voxceleb`):** embedding dùng cho **tiếng Việt** — fixture S4 nên có ít nhất 1 file **tiếng Việt 2-3 người** (Kokoro tạo được) để xác nhận gom cụm vẫn tốt với thanh điệu — nếu accuracy tụt thì đổi sang embedding `3dspeaker`/`cam++` (đa ngôn ngữ tốt hơn, cùng repo k2-fsa, cùng giấy phép).
8. **UI chống "đơ":** sidecar CPU chạy 1-2 phút cho clip 3 phút → chạy thread riêng + progress (nếu sherpa không có callback thì hiện "Đang phân tích giọng… (~1–2 phút cho video 3 phút)") — người dùng không được thấy app "chết lặng".
9. **Nam/nữ theo f0 (S3 tùy chọn):** ngưỡng 2 dải giao nhau ở 165–180Hz — với giọng "lai" thì ưu tiên gợi ý tên vai của LLM (mục 2b-b) thay vì đoán máy; ghi nhận kết quả f0 vào JSON để debug.

*(Review bởi CommandCode — đồng ý cho triển khai S1 sau khi PO duyệt.)*
