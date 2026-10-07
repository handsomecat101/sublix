# KE_HOACH_V2_MAVIS_PROPOSAL.md — Phase V2: Phân Vai Thật + UI Detect Nhân Vật

> **Mavis soạn** · Ngày: 2026-10-07 · Trạng thái: **CHỜ CommandCode review + PO duyệt**
>
> Cơ sở: `KE_HOACH_V2_PHAN_VAI_THAT.md` (CommandCode soạn 2026-10-07) + feedback PO ngày 2026-10-07 về voice không đồng nhất.
>
> **Mục tiêu chính PO yêu cầu:** *Làm sao để có thể chủ động được việc lồng tiếng — detect nhân vật rõ ràng, user quyết voice.*

---

## 1. Vấn đề thực tế PO gặp (2026-10-07)

PO đã nghe file `Kenji_Battle_Realms_VI_HARDSUB.mp4` (909 MB, 38:24, lồng tiếng Kokoro v0.9.10) và phàn nàn:

> *"giọng nhân vật lúc thì nam lúc nữ chả đồng nhất gì cả… nghe chả ra làm sao cả"*

### Root cause

`clean_and_merge_raw_segments()` (`src-tauri/src/dubbing/mod.rs:677-765`) hiện tại:
- **CHỈ ĐOÁN** speaker theo khoảng nghỉ + dấu câu (`is_turn_boundary()`)
- **KHÔNG phân tích audio thật** → cùng 1 nhân vật có thể bị tách thành **nhiều speaker ID khác nhau**
- → Auto-cast gán voice cho mỗi ID → **cùng 1 nhân vật nhảy giọng giữa các câu**

Bằng chứng hiện có:
- Worker D trước đó test R2nyc: 6 speakers detected (đan xen nam/nữ) → nếu thực tế có 2-3 nhân chính → sai
- Worker I test Kenji: 6 speakers (đan xen nam/nữ) → có thể thực tế chỉ 2-3 nhân chính + 3 narrator

---

## 2. Giải pháp đề xuất (4 bước S1-S4)

### S1 — Sidecar Python `sherpa-onnx` + test CLI (1-2 giờ)

**Mục tiêu**: Bằng chứng sống rằng diarization thật (audio-based) cho kết quả tốt hơn heuristic.

**Việc làm**:
1. `pip install sherpa-onnx` (wheel có sẵn trên PyPI, đã verify v1.13.8)
2. Giải nén `sherpa-onnx-pyannote-segmentation-3-0.tar.bz2` (lưu ý: `tar` Windows không có bzip2 → dùng `python -m tarfile -e`)
3. Viết `src-tauri/scripts/sherpa_diarize.py`:
   - Input: `--wav <16k mono wav> --model-dir <sherpa-diarization> [--threshold 0.5] [--num-speakers N] --out result.json`
   - Output: JSON `[{start, end, speaker}]` sort theo start
   - API: `OfflineSpeakerDiarization` với pyannote segmentation + wespeaker embedding + FastClustering
4. Test trên 3 fixture có ground-truth:
   - (a) `dialogue_2spk.wav` (20s, 5 câu nam/nữ) → **đúng 2 vai**
   - (b) Mở rộng `make_dialogue.ps1` thêm giọng thứ 3 → test 3 vai
   - (c) File 1 người nói → **đúng 1 vai** (chống tách nhỏ quá mức)
   - (d) Clip phim 3 phút có nhạc nền → số vai hợp lý

**Điểm dừng nghiệm thu S1**: PO nghe JSON output + audio mẫu → duyệt trước khi tích hợp.

---

### S2 — Tích hợp pipeline Rust (2-3 giờ)

**Mục tiêu**: `analyze_and_create_project()` dùng sherpa, fallback heuristic.

**Việc làm**:
1. Trong `analyze_and_create_project()` (`dubbing/mod.rs:1111`), sau khi có Whisper transcript → gọi sherpa sidecar (reuse pattern Kokoro `ensure_kokoro_script` + `find_python`)
2. Map câu → speaker bằng **overlap thời gian lớn nhất** với turn sherpa
3. **Câu dài chứa NHIỀU người** (lỗ hổng lớn nhất của overlap-based mapping): fix bằng cách **chia lại câu theo ranh giới turn** của sherpa, hoặc tối thiểu **cảnh báo UI** "Câu #X có thể có nhiều người nói"
4. Fallback nguyên trạng: thiếu model/python/lỗi → dùng heuristic + warn rõ
5. Thêm `diarization_engine: "sherpa" | "heuristic"` vào `DubbingProject` → badge nhỏ trong tab Dubbing
7. **Bảo toàn DubbingProject** (PHẢI làm theo CommandCode review §4):
   - Chỉ THÊM field optional (`diarization_engine`, `speaker_samples`...)
   - KHÔNG đổi signature / tên field có sẵn → dây chuyền A→Z của Mavis không vỡ
   - Ghi AGENT_CHAT 1 dòng trước khi đụng `analyze_and_create_project()`

---

### S3 — UI detect nhân vật + auto-cast thật + clip mẫu (4-6 giờ)

**Mục tiêu**: User chủ động được việc lồng tiếng (PO yêu cầu chính).

**UI mới trong tab Dubbing** (`DubbingStudioView.tsx`):
```
┌─ Speaker Roster (auto-detected) ─────────────────────────┐
│ ▶ Speaker 0 — "Max"                       73 segs        │
│   🎤 Giọng hiện: kokoro:tuan_ngoc (Nam)  [Đổi ▼]        │
│   🔊 [▶ Nghe clip mẫu 7s]              ✏️ Đổi tên        │
│   🗑 Gộp vào speaker khác                                  │
│                                                            │
│ ▶ Speaker 1 — "Gu"                        73 segs        │
│   🎤 Giọng hiện: kokoro:mai_linh (Nữ)   [Đổi ▼]        │
│   🔊 [▶ Nghe clip mẫu 5s]                                │
└────────────────────────────────────────────────────────────┘
[ 🔍 Quét speaker phân vai (standalone) ]                  │
```

**Chức năng**:
1. **Hiển thị danh sách speakers** (auto-detected từ S2)
2. **Đổi tên vai** ("Speaker 0" → "Max")
4. **Nghe clip giọng mẫu 5-12s** (auto-trích từ S3 backend)
5. **Gộp 2 speakers** thành 1 (nếu LLM cluster sai)
6. **Đổi voice** (chọn lại từ pool 7 nam + 7 nữ Kokoro / Edge)
7. **Nút "🔍 Quét vai"** → chạy diarization standalone (Stage 1, không cần dub full) → user confirm trước khi dub

**Backend S3**:
1. Auto-cast dùng **số vai thật** từ sherpa (pool 7 nam + 7 nữ Kokoro)
2. **Trích clip giọng mẫu 5-10s** cho mỗi vai (đoạn audio thuần nhất dài nhất) → `sample_<speaker>_<start>_<end>.wav` trong `<Thư Mục Thành Phẩm>/voice_samples/`
3. (Tùy chọn nâng cấp) Ước lượng F0 mỗi vai → gán nam/nữ thực (thay vì LLM đoán)
4. Ghi `voice_samples` paths vào `DubbingProject` để V3 clone dùng thẳng

---

### S4 — Verify E2E + commit v0.10.0 (2-3 giờ)

**Mục tiêu**: Bằng chứng cuối cùng, nghiệm thu Phase V2 hoàn tất.

**Việc làm**:
1. Test 4 fixture (đã chạy ở S1):
   - (a) `dialogue_2spk.wav` → **đúng 2 vai, ≥90% câu gán đúng**
   - (b) 3 người nói → đúng 3 vai, ≥90%
   - (c) File 1 người nói → đúng 1 vai (chống tách nhỏ quá mức)
   - (d) Clip phim 3 phút có nhạc nền → số vai hợp lý, không loạn
2. **Test trên app GUI thật** (`agent-browser --cdp 9222` theo GUI_TEST_GUIDE):
   - Mở app, chọn video Kenji (38:24)
   - Bấm "🔍 Quét vai"
   - Verify UI hiển thị đúng speakers
   - Verify nghe clip mẫu từng vai
   - Đổi tên 1 vai, verify save
3. **Test GUI bằng chứng vào `test-output-audit-giong/`**:
   - Screenshot UI speakers
   - JSON diarization mỗi test
   - Clip sample từng vai (audio phát thật)
4. **Tính accuracy**: mỗi câu Whisper "đúng" khi ≥50% thời lượng câu overlap speaker đúng trong ground-truth → tạo `ground_truth_<tên>.json` cùng fixture
5. Bump version **0.7.10 → 0.10.0** (minor vì Phase mới đáng kể)
6. CHANGELOG + ChangelogModal + AGENT_CHAT @done + PROJECT_STATE; commit tách (sidecar / tích hợp / UI / docs)

---

## 3. Tổng kết timeline

| Bước | Effort | Output chính |
|---|---|---|
| S1 | 1-2 giờ | JSON diarization đúng 2/3/1 vai trên fixture |
| S2 | 2-3 giờ | Pipeline dùng sherpa + fallback + badge |
| S3 | 4-6 giờ | UI speakers + clip mẫu + đổi tên + gộp vai |
| S4 | 2-3 giờ | Bằng chứng + commit v0.10.0 |
| **Total** | **~10-15 giờ (1.5-2 ngày)** | |

---

## 4. Rủi ro + đối sách (kế thừa từ CommandCode §4 + bổ sung)

| Rủi ro | Đối sách |
|---|---|
| Wheel `sherpa-onnx` lỗi Python313 | Thử 1.12.x; worst-case: viết clustering thuần bằng `onnxruntime` (wespeaker embedding đã có) — báo PO trước khi đổi hướng |
| `model.int8.onnx` không load | Tải full-precision (~30MB) từ k2-fsa (cùng license) |
| Over-segmentation (tách quá nhiều vai) | Tinh chỉnh `threshold` 0.5-0.8 + `min_duration_on/off`; cap trần hợp lý |
| Câu Whisper dài chứa NHIỀU người | Chia lại câu theo ranh giới turn sherpa; tối thiểu cảnh báo UI |
| Sidecar CPU chạy 1-2 phút cho clip 3 phút | Thread riêng + progress rõ; không để "chết lặng" |
| Wespeaker `en_voxceleb` kém Tiếng Việt | Test 1 file Tiếng Việt 2-3 người (Kokoro tạo); nếu accuracy tụt → đổi `3dspeaker`/`cam++` (đa ngôn ngữ) |
| **DubbingProject signature đổi** | CHỈ THÊM field optional; KHÔNG đổi field có sẵn → A→Z của Mavis không vỡ (CommandCode §4) |
| Bug Windows 32KB CMD limit ở Stage 4 export (Mavis phát hiện hôm nay, 445 segs) | Fix luôn trong S2 bằng `-f concat -i list.txt` thay vì N inputs `-i` |
| PO vẫn không hài lòng sau Phase V2 | Giữ fallback dùng `dubbing_open_output_folder()` + 2 nút "Mở Thư Mục" để user dễ debug |

---

## 5. Deliverable cho PO

Sau khi Phase V2 xong:

1. ✅ **Multi-speaker CONSISTENT** (không nhảy giọng nữa) — fix gốc rễ
2. ✅ **UI tab Dubbing** hiển thị bảng speakers (audio Kag + name + voice + clip mẫu)
3. ✅ **Đổi tên vai** được ("Speaker 0" → "Max")
4. ✅ **Gộp 2 speakers** thành 1 nếu LLM cluster sai
5. ✅ **Nghe clip giọng gốc** từng vai (5-10s) trước khi lồng tiếng
6. ✅ **Voice gán theo F0** thật (không còn `idx % 2` sai)
7. ✅ **Nút "🔍 Quét vai"** standalone (chạy diarization không cần dub full)
8. ✅ **Bug Windows 32KB CMD** fix luôn trong S2

---

## 6. Thứ tự thực hiện

**S1 trước** (bằng chứng sống) → CommandCode review kết quả S1 → Mavis tiếp S2-S3-S4.

---

## 7. Phạm vi của Mavis

- **Làm**: S1 (sidecar + test CLI), test 3 fixture, báo cáo accuracy, **KHÔNG đụng code app**
- **Làm sau khi CommandCode review S1**: S2 (tích hợp Rust), S3 (UI), S4 (verify + commit) — **CẦN CommandCode review trước mỗi bước** để tránh xung đột code trên cùng `dubbing/mod.rs`

## 8. Phạm vi của CommandCode (đề xuất)

- **Review S1** trước khi Mavis sang S2
- **Review S2** trước khi Mavis sang S3 (UI)
- **Review S3** trước khi Mavis sang S4 (commit)
- **Final approval** commit v0.9.11/v0.10.0

---

---

## 9. REVIEW & BỔ SUNG CỦA COMMANDCODE (2026-10-07 — theo yêu cầu PO "xem có được không")

**Kết luận: RẤT TỐT — ĐƯỢC DUYỆT TRIỂN KHAI.** Đây là bản kế hoạch chắc tay nhất đến nay: root-cause chính xác (đoán vai theo dấu câu → cùng 1 nhân vật nhảy giọng — đúng lời PO phàn nàn), đã kế thừa trọn vẹn 9 điểm review trước, có điểm dừng S1 cho PO nghe trước, và bắt thêm được bug Windows 32KB CMD limit với 445 segs (phát hiện rất giá trị). Các điểm dưới đây là **tinh chỉnh**, không phải phản bác:

1. **Sửa typo phiên bản:** §S4.5 ghi "0.7.10 → 0.10.0" — hiện tại là **0.9.10** → đúng phải là `0.9.10 → 0.10.0`. §8 cũng bỏ "v0.9.11" cho nhất quán (chốt: 0.10.0).
2. **Mâu thuẫn deliverable vs effort:** §5.6 hứa "✅ Voice gán theo F0 thật" nhưng §S3.3 xếp F0 là **"(Tùy chọn nâng cấp)"** — chọn 1 trong 2: hoặc F0 là **bắt buộc** trong S3, hoặc hạ deliverable thành "gán theo F0 (nếu có)". Khuyến nghị: làm F0 cơ bản (trung bình f0 mỗi vai → nam/nữ) vì nó nhỏ; giữ ghi chú đã review: giọng "lai" vùng 165–180Hz thì ưu tiên gợi ý tên vai của LLM.
3. **Tách S3 thành 2 chặng để PO có giá trị sớm:** S3a (lõi: danh sách vai + đổi voice + nghe clip mẫu) → **giao PO dùng thử ngay**; S3b (đổi tên, gộp vai, nút Quét vai standalone). S3 4-6 giờ một cục là rủi ro lớn nhất của plan.
4. **Bug 32KB CMD (445 segs) nên tách thành HOTFIX làm TRƯỚC S1:** nó đang làm hỏng export phim dài cho người dùng thật (PO tải Kenji 38:24 là dính tầm này). Fix `-f concat -i list.txt` độc lập, test 1 export 400+ segs, không phải đợi S2.
5. **Làm rõ tính năng "Gộp 2 speakers":** sau khi gộp (a) các câu gán lại theo id mới, (b) clip giọng mẫu trích lại (hoặc giữ của vai đích — chốt 1 cách), (c) có thể hoàn tác (undo) 1 bước — gộp sai là hỏng kịch bản.
6. **Phối hợp 2 việc đang song song (quan trọng):** Mavis đang có `TASK_A_Z_ONE_CLICK.md` (dây chuyền A→Z) cũng sửa `dubbing/mod.rs` + `DubbingStudioView`. Chốt thứ tự: **S1 (không đụng code app) làm song song A→Z được**; nhưng **S2–S3 chỉ bắt đầu sau khi A→Z xong** (hoặc PO chọn đổi thứ tự) — tránh hai việc sửa cùng một file. Vẫn giữ luật: khóa task trong `PROJECT_STATE.md` + báo 1 dòng AGENT_CHAT trước khi đụng `analyze_and_create_project()`.
7. *(Nhỏ)* Khi đổi file audio đầu vào, "bảng vai" cũ phải bị vô hiệu + yêu cầu Quét lại (tránh hiển thị vai của video trước cho video sau).

**Phê duyệt của CommandCode:** ✅ cho phép Mavis bắt đầu **S1 + hotfix 32KB** ngay; S2→S4 theo cổng review ở §8.

*(Review bởi CommandCode — 2026-10-07.)*