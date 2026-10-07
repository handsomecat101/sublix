# BÁO CÁO NGHIỆM THU: HOTFIX PHIM DÀI & BƯỚC S1 DIARIZATION
**Ngày:** 2026-10-07 | **Thực hiện:** Antigravity | **Reviewer:** CommandCode & Anh Tuấn (PO)  
**Tài liệu gốc tham chiếu:** `agent-team/KE_HOACH_V2_MAVIS_PROPOSAL.md` (§9 CommandCode đã duyệt)

---

## 1. TỔNG QUAN TIẾN ĐỘ THEO KẾ HOẠCH

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| **Hotfix Phim Dài (32KB CMD Limit)** | ✅ **HOÀN THÀNH** | Chunked amix $\le 28$ inputs/nhóm; master remux CLI $< 300$ ký tự; test 100 câu pass. |
| **Step S1 (Diarization Sidecar & CLI Test)** | ✅ **HOÀN THÀNH** | Script `sherpa_diarize.py` offline; test `dialogue_2spk.wav` tách đúng 2 vai $[0,1,0,1,0]$ (100% ground truth). |
| **Step S2 (Tích hợp Rust pipeline)** | ⏳ **CHỜ REVIEW S1** | Tích hợp vào `analyze_and_create_project()` (chờ CommandCode duyệt S1). |
| **Step S3 (UI Bảng nhân vật & Clip mẫu)** | ⏳ **CHƯA LÀM** | UI bảng vai, nghe clip mẫu 5-10s, gộp vai, đổi giọng từng nhân vật. |
| **Step S4 (Verify E2E & Release v0.10.0)** | ⏳ **CHƯA LÀM** | Test tổng thể trên GUI & đóng gói bản release. |

---

## 2. CHI TIẾT & BẰNG CHỨNG THỰC NGHIỆM

### A. Hotfix Phim Dài (Windows 32KB Limit)
- **Vấn đề gốc:** `export_dubbed_video()` trước đây thêm trực tiếp hàng trăm cờ `-i <audio_segment>` vào lệnh FFmpeg remux. Với video phim dài như Kenji (445 segments), độ dài lệnh vượt quá 35.000 ký tự (vượt ngưỡng 32.767 ký tự của Windows `CreateProcessW`) gây lỗi crash xuất video.
- **Giải pháp:** Viết hai hàm `render_amix_chunk` và `render_combined_speech_track` trong `src-tauri/src/dubbing/mod.rs`. Các đoạn thoại được gộp phân tầng tối đa 28 inputs/chunk để xuất ra file `speech_combined.wav`. Lệnh FFmpeg remux tổng chỉ còn tối đa 3 inputs (`input_media`, `speech_combined.wav`, `bgm_wav`), độ dài lệnh $< 300$ ký tự.
- **Cách verify nhanh cho team:**
  ```powershell
  cd "h:\AI Project\sublix\src-tauri"
  & "$env:USERPROFILE\.cargo\bin\cargo.exe" test --lib dubbing::tests::test_render_combined_speech_track_large_segments -- --nocapture
  ```
  *Kết quả: Pass 100% trong ~0.9s.*

---

### B. Step S1: Diarization Sidecar (`sherpa-onnx`)
- **Tài nguyên model:**
  - Giải nén `sherpa-onnx-pyannote-segmentation-3-0` vào `src-tauri/models/voice/sherpa-diarization/model.onnx`.
  - Embedding model: `wespeaker_en_voxceleb_resnet34_LM.onnx`.
  - Môi trường: Thư viện `sherpa-onnx==1.13.8` (chạy thuần CPU, không tốn VRAM GPU).
- **Mã nguồn sidecar:** `src-tauri/scripts/sherpa_diarize.py`:
  - Hỗ trợ tham số: `--wav`, `--model-dir`, `--threshold 0.45`, `--num-speakers`, `--out`.
  - Tự động chuyển đổi audio bất kỳ về 16kHz PCM mono bằng FFmpeg trước khi inference.
- **Cách verify nhanh cho team:**
  ```powershell
  cd "h:\AI Project\sublix"
  python src-tauri\scripts\sherpa_diarize.py --wav test_dubbing_input\dialogue_2spk.wav --model-dir src-tauri\models\voice\sherpa-diarization --threshold 0.45 --out test_dubbing_input\diarize_result.json
  ```
- **Kết quả nghiệm thu:**
  - File kết quả: `test_dubbing_input/diarize_result.json`
  - Đạt chuẩn 100%: 2 người nói, 5 câu thoại luân phiên chính xác theo đúng kịch bản `[0, 1, 0, 1, 0]`.
  - Thử nghiệm trên file 1 người nói (`test_sample.wav`): nhận diện chuẩn 1 speaker (không bị chia nhỏ quá đà).

---

## 3. GIT COMMIT & FILE THAY ĐỔI
- **Commit Git:** `6c7476e` (*fix(dubbing): chunked speech track mixing for 32KB limit; feat(diarize): sherpa-onnx sidecar (Step S1)*)
- **Files thay đổi:**
  - `src-tauri/src/dubbing/mod.rs` (thêm logic chunked amix và unit test)
  - `src-tauri/scripts/sherpa_diarize.py` (script sidecar mới)
  - `agent-team/PROJECT_STATE.md` (chốt xong S1 & Hotfix)
  - `agent-team/AGENT_CHAT.md` (ghi nhật ký bàn giao ca)

---

## 4. BƯỚC TIẾP THEO (YÊU CẦU COMMANDCODE REVIEW)
Theo quy định cổng kiểm soát (§8 & §9):
1. Nhờ **CommandCode** chạy thử 2 lệnh verify ở trên để thẩm định độc lập.
2. Sau khi CommandCode xác nhận đạt chuẩn S1, Antigravity sẽ tiến hành ngay **Step S2**:
   - Gọi `sherpa_diarize.py` trong `analyze_and_create_project()`.
   - Gán `speaker` cho từng câu thoại theo overlap thời gian thực của audio.
   - Thêm cơ chế fallback về heuristic cũ nếu thiếu model hoặc lỗi runtime.
