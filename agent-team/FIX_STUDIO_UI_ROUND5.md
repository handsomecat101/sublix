# FIX ROUND 5 + LỘ TRÌNH LÀM TIẾP — cho MAVIS (CommandCode verify 2026-10-09)
**Phán quyết Round 4 của Mavis: sửa thật 5/9 — nửa vời 3 (R4-01, R4-05, R4-06) — chưa 1 (R4-07) + 6 bug mới. Tinh thần làm tốt (không khoe láo, tự nhận việc chưa làm) nhưng TEST NHẦM BÀI: lấy video codec thường (H.264) làm bằng chứng thay vì file khó.**
**⚠️ LUẬT MỚI:** bằng chứng nghiệm thu PHẢI dùng đúng file chỉ định trong đề (vd `test_dubbing_input/multi_speaker_scene.mp4`) — case dễ không tính.

## 🔴 R5-A — R4-01 CHO CHÓT: KHUNG XEM PHẢI THẤY HÌNH (BUG-M3/M4/M5)
| # | Việc | Vị trí | Cách sửa |
|---|---|---|---|
| R5-01 | **BUG-M3 (gốc):** fallback chuyển tạm chỉ kích hoạt khi `<video>` phát `error` — WebView2 hỏng codec kiểu IM LẶNG (chạy giờ, phát tiếng, KHUNG TRỐNG, không error) → fallback chết cứng. Ảnh `r4-01_preview_playing.png` (đang chạy 00:15.78 khung trống) + `r4-01_preview_visible.png` (khung trống) tự tố | `SublixStudioView.tsx:2131-2152` | Chủ động dò HÌNH THẬT: sau `loadedmetadata` + ~800ms kiểm `video.videoWidth === 0` HOẶC `requestVideoFrameCallback` không trả frame đầu → chạy `transcodeForPreview` ngay; vẫn giữ nhánh `onError` |
| R5-02 | **BUG-M5:** đang chuyển dạng xem chỉ `console.log` — video dài user thấy khung "đứng hình" tưởng đơ | `:2140, :2143` | Toast/overlay "⏳ Đang chuyển sang dạng xem được…" khi bắt đầu, tắt khi xong |
| R5-03 | **BUG-M4:** file tạm %TEMP%\sublix_preview phình vô hạn (mỗi lần 1 nonce, không xóa khi đổi file/đóng app); comment "cache by size+mtime" là GIẢ | `lib.rs:1249-1255`, `SublixStudioView.tsx:233` | Xóa file preview cũ khi đổi video + khi thoát; sửa comment cho đúng sự thật |
| R5-04 | **NGHIỆM THU BẮT BUỘC:** `test_dubbing_input/multi_speaker_scene.mp4` → **THẤY HÌNH trong khung** + tua được. Ảnh cũ `r4-01_preview_visible.png` KHÔNG đạt (không thấy hình). Video H.264 thường KHÔNG được dùng làm bằng chứng mục này | | |

## 🟠 R5-B — REGRESSION DO CHÍNH FIX ROUND 4 TẠO RA
| # | Việc | Vị trí | Cách sửa |
|---|---|---|---|
| R5-05 | **BUG-M1:** undo ĐẢO NGHĨA — `saveTranslationUndoIfChanged`/`saveAudioUndo` push snapshot **SAU** khi sửa → bấm ↶ = hoàn tác về chính trạng thái vừa sửa (no-op/lệch) | `SublixStudioView.tsx:366-371, :384-386` | Push **trạng thái TRƯỚC** khi sửa (`translationPreFocusRef`/`audioPreFocusRef` đã capture sẵn) |
| R5-06 | **BUG-M2:** hủy dịch khi đang chạy chunk N → trả `sub_res` mà VỨT `results` các chunk OK trước → vẫn ra "0/x câu" oan (mục đích R4-06 chưa đạt) | `translate/mod.rs:366-385, :400-513` (mọi nhánh cancel) | `results.extend(sub_res); return results;` — trả partial đủ, caller báo "(x/y câu)" |
| R5-07 | **BUG-M6:** hủy flow lồng tiếng báo "Đã dừng tiến trình" không kèm x/y | `dubbing/mod.rs:1696-1698` | Bổ sung "(nhận x/y câu)" như nhánh khác |

## 🟡 R5-C — NỢ CŨ + DỌN DẸP
| # | Việc | Vị trí |
|---|---|---|
| R5-08 | R4-07: WAV scanner parse chunk `fmt ` (channels/bit depth) — stereo/24-bit peaks đúng; bỏ heuristic `rawVoice.includes("-")` → chuẩn hóa theo danh sách engine | `dubbing/mod.rs:455-538`; `SublixStudioView.tsx:1049` |
| R5-09 | `postcss.config.cjs` (stub rỗng, không ai giải thích): **giải thích trong AGENT_CHAT hoặc xóa** — luật: không thêm file lạ không mục đích | gốc dự án |
| R5-10 | `AGENT_CHAT.md:41` (tin 03:55) còn khoe "Cargo build release" — sửa/chuyển ARCHIVE cho đúng BUG-H07; tag audio `language=vie` hardcode → bám theo ngôn ngữ đích của dự án | `AGENT_CHAT.md`; `dubbing/mod.rs:2190-2193` |

## 🗺️ LỘ TRÌNH LÀM TIẾP (làm theo đúng thứ tự — mỗi mục xong = ảnh/clip GUI thật, LUẬT CHẠY THẬT)
| # | Việc | Ghi chú |
|---|---|---|
| 1 | **UI-5 "Đọc lại từng câu"** — chuột phải ô câu → "Đọc lại câu này" + nút trên ô: sửa 1 câu → đọc lại CHỈ câu đó, câu khác giữ nguyên | Triết lý cốt lõi "AI vẽ nháp — người tinh chỉnh" (`TAM_NHIN_SUBLIX_STUDIO.md` §1) |
| 2 | **UI-4 "Ô chọn giọng GỘP"** — modal P6 (`UI_SPEC_SUBLIX_STUDIO.md` §2): mọi nguồn 1 ô (Kokoro/Edge/MiniMax/clone), badge LOCAL/FREE/API, tìm kiếm, nghe thử, gán theo làn nhân vật | Đúng ảnh ô giọng EZMAX đã phân tích |
| 3 | **UI-6 "Hộp thoại Xuất video"** — đủ trường như bản vẽ P7: chất lượng CRF Cao/Cân/Nhẹ, nhúng sub, kèm .srt, thư mục đầu ra | |
| 4 | **R7 Nhúng sub vào video trong app** (OPTION_RESEARCH_DUBBING — Mavis ước 1-2h) | |
| 5 | **S2 Checkbox "Tự động lồng tiếng"** trong nút 1-Click Pipeline (`TASK_A_Z_ONE_CLICK.md`) | Hoàn thiện "dán link → video lồng tiếng A→Z" |
| 6 | Batch Mode có ghi nhớ (hộp "Khôi phục batch trước?" như EZMAX) → sau cùng: tách vocal giữ nhạc (Demucs) — MIỄN PHÍ, món EZMAX bán tiền | |

## ⛔ QUY TẮC BẤT KHƯ XÂM PHẠM
1. LUẬT CHẠY THẬT + **bằng chứng phải đúng file khó chỉ định** (xem ⚠️ trên).
2. KHÔNG `cargo build --release` (BUG-H07) — đóng gói = `npx tauri build --no-bundle`.
3. KHÔNG đụng `Chay-Sublix.bat` và logic tab Tải video (chỉ thêm nút/điều hướng).
4. Fix gì xong báo đúng việc đó — không khoe thêm, không "triệt để 100%" khi chưa có bằng chứng đúng bài.
