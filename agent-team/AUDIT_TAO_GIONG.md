# AUDIT_TAO_GIONG.md — PHIẾU KIỂM TRA TÍNH NĂNG GIỌNG NÓI (Yêu cầu của PO — 2026-10-06)

> **Mục đích:** Phân định rõ tính năng giọng nói nào **CHẠY THẬT**, cái nào **TRÊN GIẤY** (quảng cáo/plan có mà code không có), cái nào **HỎNG**.
> **Người thực hiện:** Mavis (MiniMax-M3) — báo cáo lại cho Anh Tuấn qua `AGENT_CHAT.md`.
> **⚠️ LUẬT CHẠY THẬT (GOVERNANCE mục 0) ÁP DỤNG TUYỆT ĐỐI:** mỗi mục chỉ được đánh giá khi **mở app thật + bấm thật + có bằng chứng**. "Đọc code thấy có hàm" KHÔNG tính là chạy được. **Thiếu bảng kết quả + bằng chứng = chưa xong.**

---

## 📋 Quy trình kiểm tra MỖI tính năng (bắt buộc, đúng theo thứ tự)

1. **Mở app thật:** chạy `Chay-Sublix.bat` (dev mode) kèm `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, điều khiển bằng `agent-browser` như người thật (cách làm: `AGENT_CHAT.md` tin 2026-10-06 08:55).
2. **Làm đúng luồng người dùng** của tính năng đó (bấm đủ các nút, không gọi thẳng code/test CLI thay thế — CLI chỉ là bổ sung).
3. **Chụp ảnh màn hình** từng bước then chốt + **lưu lại file đầu ra thật** (âm thanh/video) vào thư mục `test-output-audit-giong/`.
4. **Điền 1 dòng vào BẢNG KẾT QUẢ** bên dưới với 1 trong 4 trạng thái:
   - 🟢 **CHẠY THẬT** — bấm được, ra kết quả đúng như quảng cáo (kèm bằng chứng)
   - 🟡 **CHẠY NHƯNG YẾU** — có chạy nhưng kết quả kém (ghi rõ kém chỗ nào: giọng robot, sai vai, lệch thời lượng...)
   - 🟠 **TRÊN GIẤY** — giao diện/tài liệu nói có, nhưng KHÔNG có code hoặc KHÔNG bấm được (ghi rõ nằm ở đâu của lời quảng cáo)
   - 🔴 **HỎNG** — có code nhưng chạy lỗi (ghi cách tái hiện)
5. **Lưu ý test thực tế:** chuẩn bị 1 video mẫu có **2 người nói** (30-60s) + 1 file **giọng mẫu 5-10s** (wav/mp3) cho các mục clone giọng. Test ngắt mạng ở mục Edge-TTS (đây là dịch vụ online).

---

## 🎙️ A. LỒNG TIẾNG ĐA VAI (Dubbing Studio — phần có code, cần chứng minh chạy thật)

| # | Tính năng cần kiểm | Đường bấm trong app | Kết quả mong đợi |
|---|---|---|---|
| 1 | Chế độ **Chiếu Rạp (tách giọng gốc — Demucs)** | Studio Lồng Tiếng → chọn "Lồng Tiếng Chiếu Rạp" → xuất | Video ra: **giọng gốc biến mất**, nhạc nền + tiếng động còn, tiếng Việt lồng vào |
| 2 | Chế độ **Thuyết minh (đè nhạc nền)** | Chọn "Thuyết minh/Ducking" → xuất | Video ra: tiếng Việt to rõ, tiếng gốc nhỏ dưới nền |
| 3 | **Phân vai nhiều người** (ai nói câu nào) | Video mẫu 2 người → Bấm Phân tích | Bảng kịch bản gán **≥2 vai khác nhau** (Speaker 0/1...), vai phân HỢP LÝ theo lời thoại (đúng người thật đổi giọng) |
| 4 | **Giọng đọc theo vai (Edge-TTS)** | Chọn giọng khác nhau cho từng vai → Nghe thử (nút 🔊 trong danh sách giọng) | Phát được đoạn giọng **khác nhau** giữa 2 vai |
| 5 | **Nghe thử từng dòng thoại** | Bấm "Nghe Thử" trên 1 dòng kịch bản | Phát được đúng nội dung tiếng Việt của dòng đó |
| 6 | **Kéo giãn khớp thời lượng (atempo)** | Quan sát dòng thoại dài trong video ngắn | Câu được đọc nhanh/chậm vừa đủ, KHÔNG bị giọng chipmunk, không tràn sang câu sau |
| 7 | **Chọn ngôn ngữ đích** | Đổi đích sang "Anh" → phân tích | Kịch bản ra **tiếng Anh** (không phải tiếng Việt) |
| 8 | **Chọn "bộ não biên kịch" (Local Qwen / MiniMax-M3)** | Đổi bộ não → phân tích lại | Kết quả dịch đổi theo; đổi sang MiniMax cần key — nếu fail phải hiện lỗi rõ |
| 9 | **Dừng giữa chừng (Cancel)** | Bấm Dừng khi đang tổng hợp giọng | Dừng < 2 giây, không file rác, chạy lại được |
| 10 | **Xuất video hoàn chỉnh** | Kết thúc xuất | File MP4 mở bằng VLC: hình + tiếng Việt, đúng thời lượng, khớp lệch không quá 0.5s |

## 🧪 B. GIỌNG CLONE / GIỌNG VIỆT NÂNG CAO — **PHẦN NGHI "TRÊN GIẤY" NHẤT** (PO lo ngại chính)

> Grep sơ bộ 2026-10-06: **không tìm thấy** `F5-TTS`, `Kokoro`, `Viterbox` trong toàn bộ code. Hãy kiểm kỹ xem đúng là "trên giấy" không, và ghi rõ **lời quảng cáo nằm ở đâu** (SPEC / ChangelogModal / UI / kế hoạch) để PO quyết: làm thật hay gỡ bỏ lời quảng cáo.

| # | Tính năng (nguồn quảng cáo) | Câu hỏi quyết định | Ghi nếu là "trên giấy" |
|---|---|---|---|
| 11 | **Clone giọng diễn viên — F5-TTS Vietnamese** (SPEC `SPEC_AI_DUBBING_AND_LLM.md` Mục 4) | Trong app có chỗ nhận **file giọng mẫu 5-10s** không? Bấm thử với file mẫu → có file giọng ra không? | Ghi rõ: "Không có trong code — chỉ có trong SPEC Mục 4" |
| 12 | **Viterbox (Chatterbox tiếng Việt)** (SPEC Mục 4) | Tương tự #11 | Ghi rõ nơi quảng cáo |
| 13 | **Kokoro-Vietnamese ONNX (giọng nhẹ CPU)** (SPEC Mục 4 / Milestone 6) | Tương tự #11 | Ghi rõ nơi quảng cáo |
| 14 | **"Multi-Speaker Voice Clone"** (mô tả bước 4 trong sơ đồ `KE_HOACH_ALL_IN_ONE_PIPELINE.md`) | Thực chất hiện tại là gì — chỉ là Edge-TTS đọc thay, hay có clone thật? | Ghi rõ: quảng cáo nói "clone" nhưng hiện là "đọc thay bằng giọng có sẵn" |
| 15 | **Phân vai "AI Diarization"** (quảng cáo trong UI/Changelog) | Phân vai thực chất bằng AI nhận diện giọng (Sherpa/Pyannote) hay chỉ bằng **đoán khoảng nghỉ/dấu câu**? (xem `dubbing/mod.rs` phần `is_speaker_change`) | Ghi rõ cơ chế thật để sửa lại lời quảng cáo cho trung thực |

## 📤 C. ĐẦU RA & CÂU NỐI

| # | Tính năng | Kết quả mong đợi |
|---|---|---|
| 16 | **Nút chuyển từ Tab Tải Video → Lồng Tiếng / Tạo Phụ Đề** | Tải 1 video xong, bấm 2 nút chuyển việc → studio mở ra với **đúng file vừa tải** đã điền sẵn |
| 17 | **Xuất kèm phụ đề .srt** | File .srt mở được, tiếng Việt, timing khớp video |

---

## 📊 BẢNG KẾT QUẢ (Mavis ĐIỀN — code-level audit, ngày 2026-10-06)

> **Lưu ý quan trọng:** Theo LUẬT CHẠY THẬT (GOVERNANCE mục 0), "Đọc code thấy có" KHÔNG tính là chạy được. Mavis có **KHÔNG có GUI automation tool** trong environment này (browser tool chỉ chat panel; MCP rỗng). Các mục 🟡 dưới đây ghi là "code-level có sẵn sàng" nhưng **CHƯA CHẠY THẬT** — cần PO mở `Chay-Sublix.bat` + bấm thật + nghe file thật để lên 🟢 hoặc xuống 🔴. Cột "Bằng chứng code" trỏ đến file + line; cột "Bằng chứng GUI" chờ PO.

| # | Tính năng | Trạng thái | Bằng chứng code (path:line) | Bằng chứng GUI (chờ PO) | Ghi chú / Việc cần làm tiếp |
|---|---|---|---|---|---|
| 1 | Chiếu Rạp (Demucs) | 🟡 CHƯA CHẠY THẬT — có code | `src-tauri/src/dubbing/mod.rs:1191-1227` (`dubbing_mode: "vocal_isolation"` → spawn `python -m demucs.separate`) | Chờ PO: bấm "Lồng Tiếng Chiếu Rạp" → mở VLC nghe BGM còn/giọng mất | Demucs cần Python + `demucs` package. Verify máy PO có sẵn. |
| 2 | Thuyết minh (Ducking) | 🟡 CHƯA CHẠY THẬT — có code | `src-tauri/src/dubbing/mod.rs:174, 1069, 1263-1267` (mode `"ducking"` + `amix` filter với BGM volume 0.25) | Chờ PO: bấm "Thuyết minh" → mở VLC nghe tiếng Việt to, BGM nhỏ | Mặc định `bgm_volume=0.25` (25%) — có thể chỉnh trong Settings. |
| 3 | Phân vai nhiều người | 🟡 CHƯA CHẠY THẬT — có code (LLM-based, KHÔNG voice embedding) | `src-tauri/src/dubbing/mod.rs:500-502` (`is_speaker_change` heuristic dựa trên pause + terminal punctuation) + line 635-984 (MiniMax API gọi `diarize_and_script_via_minimax`) | Chờ PO: video 2 người nói → bấm Phân tích → kiểm tra bảng kịch bản | **Lưu ý:** Sherpa-ONNX / Pyannote voice embedding chưa tích hợp (xem TSK-012 backlog trong PROJECT_STATE). Phân vai hiện dựa LLM API + heuristic pause. |
| 4 | Giọng đọc theo vai (Edge-TTS) | 🟡 CHƯA CHẠY THẬT — có code | `src-tauri/src/dubbing/mod.rs:209-332` (`find_edge_tts()` + `synthesize_with_edge_tts` với fallback `python -m edge_tts`) | Chờ PO: chọn 2 giọng khác nhau cho Speaker 0/1 → bấm Nghe thử 🔊 | Edge-TTS cần Internet (dịch vụ online). Test cả case mất mạng. |
| 5 | Nghe thử từng dòng | 🟡 CHƯA CHẠY THẬT — có code | `src/views/DubbingStudioView.tsx:170-181` (`handleAuditionVoice` → `sublix.dubbingPreviewTts`) | Chờ PO: bấm "Nghe Thử" trên 1 dòng kịch bản → phát được tiếng Việt | Hàm backend `dubbingPreviewTts` cần verify nằm ở `lib.rs`. |
| 6 | Kéo giãn thời lượng (atempo) | 🟡 CHƯA CHẠY THẬT — có code | `src-tauri/src/dubbing/mod.rs:1156-1172` (FFmpeg `atempo={:.2}` filter khi duration > slot) | Chờ PO: video có câu thoại dài trong slot ngắn → nghe không chipmunk, không tràn | Code check duration > slot mới áp atempo. Cần test cả case ngược (slot dài, audio ngắn → có pad silence không?). |
| 7 | Ngôn ngữ đích | 🟡 CHƯA CHẠY THẬT — có code | `src-tauri/src/dubbing/mod.rs:670, 968, 1003` + `DubbingStudioView.tsx:33-42` (`TARGET_LANG_OPTIONS` vi/en/ja/zh) | Chờ PO: đổi sang "Anh" → kịch bản ra tiếng Anh | `generate_default_speakers` line 571 chọn voice Edge-TTS theo target_lang. |
| 8 | Chọn "bộ não biên kịch" (Local Qwen / MiniMax-M3) | 🟡 CHƯA CHẠY THẬT — có code | `src-tauri/src/config.rs:90-100, 206-207` (`translation_provider`: "local" / "ollama" / "minimax"; key + model config) | Chờ PO: đổi provider → phân tích lại → kết quả đổi theo; fail thì hiện lỗi rõ | MiniMax cần API key (đã có sẵn trong config). Local cần llama-server đang chạy. |
| 9 | Dừng giữa chừng (Cancel) | 🟡 CHƯA CHẬY THẬT — có code | `src-tauri/src/dubbing/mod.rs:29-181` (`CANCELLED_GENERATION: AtomicU64` + `run_child_with_cancel` kiểm tra gen mỗi stage) | Chờ PO: bấm Dừng giữa chừng → dừng < 2s, không file rác | Test atomic check ở 11+ điểm trong pipeline (extract/whisper/diarize/synth/stretch/remux). |
| 10 | Xuất video hoàn chỉnh | 🟡 CHƯA CHẠY THẬT — có code | `src-tauri/src/dubbing/mod.rs:1075-1336` (`export_dubbed_video` → `remux` qua `run_child_with_cancel`) | Chờ PO: kết thúc → mở file MP4 bằng VLC, kiểm tra hình + tiếng Việt + thời lượng khớp | BUG-006 fix trước đó; test unit có line 1522-1535. |
| 11 | Clone giọng — F5-TTS Vietnamese | 🟠 TRÊN GIẤY | **Không có trong source.** Grep toàn `src-tauri/**` không thấy `F5-TTS` / `F5TTS` / `f5_tts`. Quảng cáo nằm ở: `docs/SPEC_AI_DUBBING_AND_LLM.md` (Mục 4), `agent-team/COMPETITIVE_ANALYSIS.md` (bảng so sánh), `agent-team/KE_HOACH_ALL_IN_ONE_PIPELINE.md` (Bước 4 "Multi-Speaker Voice Clone (Neural TTS)") | N/A — không có UI/file để test | **PO quyết:** Làm thật (thêm task) hay gỡ lời quảng cáo. |
| 12 | Clone giọng — Viterbox (Chatterbox tiếng Việt) | 🟠 TRÊN GIẤY | **Không có trong source.** Grep không thấy `Viterbox` / `viterbox` / `Chatterbox`. Quảng cáo: `docs/SPEC_AI_DUBBING_AND_LLM.md` (Mục 4) | N/A | **PO quyết.** |
| 13 | Giọng Kokoro-Vietnamese ONNX (nhẹ CPU) | 🟠 TRÊN GIẤY | **Không có trong source.** Grep không thấy `Kokoro` / `kokoro`. Quảng cáo: `docs/SPEC_AI_DUBBING_AND_LLM.md` (Mục 4 / Milestone 6) | N/A | **PO quyết.** |
| 14 | "Multi-Speaker Voice Clone" (quảng cáo) | 🟡 CHẠY NHƯNG KHÔNG PHẢI CLONE | `src-tauri/src/dubbing/mod.rs:209-332` synth qua **Edge-TTS** (Microsoft voices có sẵn, KHÔNG học từ audio mẫu). Quảng cáo ở `agent-team/KE_HOACH_ALL_IN_ONE_PIPELINE.md` (Bước 4) + `DubbingStudioView.tsx` (header). | Chờ PO: chọn Speaker → chọn voice → nghe thử — nghe được giọng khác nhau, nhưng đây là **giọng preset Edge-TTS**, không phải clone từ file mẫu | **Sửa lời quảng cáo** cho trung thực: "Multi-Speaker Neural TTS (Edge-TTS preset)" thay vì "Voice Clone". |
| 15 | Phân vai "AI Diarization" (quảng cáo) | 🟡 CHẠY NHƯNG CƠ CHẾ KHÁC QUẢNG CÁO | `src-tauri/src/dubbing/mod.rs:500-502` heuristic pause/punctuation (`is_turn_boundary`) + line 635-984 MiniMax-M3 Cloud API gán vai (LLM, không phải voice embedding). Sherpa-ONNX / Pyannote **CHƯA tích hợp** (TSK-012 backlog). Bug lịch sử: BUG-H06 đã fix (phân vai 1 người do pause=0). | Chờ PO: video 2 người nói → bấm Phân tích → kiểm tra Speaker 0/1 có hợp lý theo lời thoại | **Sửa lời quảng cáo:** "Phân vai bằng AI Script Director (LLM-based)" — không nên gọi là "AI voice embedding" cho đến khi Sherpa-ONNX xong. |
| 16 | Cầu nối Tải Video → Studio | 🟡 CHƯA CHẠY THẬT — có code UI | `src/views/DownloaderView.tsx:30, 161, 1114-1116` (`onNavigateToDubbing` prop + button "bridge-dubbing") | Chờ PO: tải 1 video xong → bấm nút "Mở Lồng Tiếng" → Studio mở với đúng file vừa tải | Verify cả 2 chiều: Downloader→Dubbing và Downloader→FileSub (line 1105). |
| 17 | Xuất kèm phụ đề .srt | 🟡 CHƯA CHẠY THẬT — chỉ file_sub có | `src-tauri/src/file_sub.rs:7, 51, 179, 228` (lưu `<file>.vi.srt` + `<file>.bilingual.srt`). `dubbing/mod.rs` xuất VIDEO — KHÔNG thấy xuất .srt trong pipeline dubbing. | Chờ PO: từ dubbing xuất video → kiểm tra file .srt có kèm theo không | **Có thể là bug nhỏ:** Dubbing export KHÔNG tự tạo .srt kèm theo (dù phụ đề đã được dịch trong pipeline). Cần xác nhận UI có toggle hay không. |

---

## 📌 SAU KHI KIỂM XONG (bắt buộc)

1. **Mục 🟠 "trên giấy":** CHỈ ghi nhận, **KHÔNG tự ý code làm mới** (trừ khi PO bảo). Ghi rõ "lời quảng cáo nằm ở đâu" để PO quyết: làm thật (thêm task riêng) hay **gỡ/sửa lời quảng cáo** cho trung thực.
2. **Mục 🔴 "hỏng":** ghi vào `ISSUE_LOG.md` (mã `BUG-0xx` tiếp theo) kèm cách tái hiện 2-3 dòng.
3. **Mục 🟡 "yếu":** ghi rõ yếu điểm + đề xuất 1 câu.
4. Báo `@done` trên `AGENT_CHAT.md`: bảng đã điền + thư mục `test-output-audit-giong/` + 3-5 dòng tóm tắt cho PO. **Thiếu bảng hoặc thiếu bằng chứng = chưa xong, sẽ bị trả về.**

*(Tài liệu này là yêu cầu kiểm tra — không phải lệnh sửa code. Chi tiết tính năng xem `docs/SPEC_AI_DUBBING_AND_LLM.md` và `KE_HOACH_ALL_IN_ONE_PIPELINE.md`.)*

---

# 🛠️ LỆNH LÀM TIẾP THEO (cập nhật 2026-10-06 — PO: "cho bạn ấy đi làm luôn, viết rồi thẩm tra lại")

> **PO mở rộng nhiệm vụ:** không chỉ audit — hãy **VIẾT CODE làm cho các tính năng giọng nói THẬT**, rồi **tự thẩm tra lại bằng GUI test**. Mavis làm được, cứ mạnh dạn làm — nhưng đúng luật kiểm tra, không lặp lại kiểu làm trước.

## 1. Thứ tự làm việc

- **BƯỚC 1 — Audit nhanh 17 mục** (bảng trên): điền bảng để biết thật/giả. **Báo cáo lô ngay khi có bảng** (không chờ hết việc).
- **BƯỚC 2 — VIẾT & SỬA theo kết quả, làm từng MỤC NHỎ:**
  - a. Mục 🔴 **hỏng** / 🟡 **yếu** → sửa ngay trước.
  - b. Mục 🟠 **"trên giấy"** (số 11–15: clone giọng F5-TTS/Viterbox/Kokoro, "Multi-Speaker Voice Clone", phân vai) → **làm cho thật**. Chia nhỏ từng mảnh; ưu tiên thứ đem lại giá trị thật cho người xem phim. Nếu model nào quá nặng / không chạy được trên máy, được phép chọn **phương án thay thế tương đương** (model nhẹ hơn, giọng preset tiếng Việt chất lượng cao...) — nhưng phải GHI RÕ lý do đổi trong báo cáo, và kết quả cuối vẫn phải đạt: **giọng khác nhau theo từng vai + tiếng Việt tự nhiên + nghe được**.
  - c. Mọi **lời quảng cáo** trong UI / Changelog / SPEC phải khớp kết quả thật — quảng cáo gì thì bấm phải ra cái đó.

## 2. ⚠️ LUẬT KIỂM TRA (ÁP DỤNG CHO TỪNG MỤC CODE — KHÔNG NGOẠI LỆ)

- Code xong 1 mục → **NGAY LẬP TỨC** mở app thật (`Chay-Sublix.bat` + `agent-browser` cổng 9222) bấm chuột như người thật → **nghe file âm thanh/video đầu ra thật** → chụp ảnh + lưu bằng chứng vào `test-output-audit-giong/`.
- **KHÔNG** làm 3 tiếng rồi mới test. **Làm tới đâu — test tới đó.** Báo `@done` từng lô nhỏ **1–3 mục/lô** kèm bằng chứng đầy đủ.
- TUYỆT ĐỐI không viết "đạt / hoàn thành / verify OK" khi chưa có **file âm thanh/video thật nghe được** (mở bằng VLC / Windows Media) và ảnh chụp màn hình tương ứng.
- Báo cáo thiếu bằng chứng = **TRẢ VỀ**, không bàn giao tiếp.

## 3. Thứ tự gợi ý cho Bước 2

1. **#15 + #14** (đổi lời quảng cáo phân vai cho trung thực, HOẶC làm phân vai thật + giọng theo vai rõ ràng) — nhanh, giá trị thấy ngay.
2. **#4 + #5** (giọng Edge-TTS theo vai + nghe thử từng dòng) — hoàn thiện cho chắc.
3. **#1, #2, #6, #10** (chất lượng lồng tiếng: tách giọng, kéo giãn, xuất video).
4. **#11 → #13** (clone giọng F5-TTS → Viterbox → Kokoro) — phần nặng nhất, làm sau cùng, **mỗi model một lô**, có bằng chứng nghe thử giọng mẫu 5–10s.
