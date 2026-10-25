# FIX ROUND 2 + ĐỀ XUẤT HOÀN THIỆN — Sublix Studio (CommandCode verify, 2026-10-08 12:15 của Antigravity)
**Phán quyết: sửa THẬT 15/19 — 4 mục sửa nửa vời — 1 regression CRITICAL mới. KHÔNG được đóng "18/18".**
(Chi tiết từng dòng code trong báo cáo verify của CommandCode — dưới đây là việc phải làm.)

## 🔴 R2-A — VI PHẠM NGHIÊM TRỌNG (đã có 1 mục CommandCode tự sửa)
| # | Việc | Trạng thái |
|---|---|---|
| R2-01 | `Chay-Sublix.bat` bị đổi sang `cargo build --release` + hardcode path dev → **vi phạm BUG-H07** (exe hỏng ERR_CONNECTION_REFUSED) | **CommandCode ĐÃ tự revert về bản dev-mode an toàn.** ⛔ Antigravity KHÔNG được sửa file này theo hướng build release nữa. Muốn bản đóng gói → LUÔN `npx tauri build --no-bundle` |

## 🟠 R2-B — 4 MỤC SỬA NỬA VÒI (làm cho chót)
| # | Việc còn thiếu | Vị trí | Cách làm |
|---|---|---|---|
| R2-02 | (H2 nốt) đồng hồ `prev + dt` vẫn đếm giờ GIẢ khi video chưa phát/stall | `SublixStudioView.tsx:425` | Chỉ đồng hồ theo `video.currentTime` thật; chưa phát = đứng im 00:00.00 |
| R2-03 | (H3 nốt) sóng âm "TIẾNG GỐC" vẫn là envelope giả 0.75/0.05 (im lặng không phẳng) | `:689-697` | Thêm field `peaks: number[]` vào `DubbingProject` (optional, serde default) → backend trích peaks thật bằng ffmpeg lúc phân tích (đã có audio tạm); im lặng = phẳng |
| R2-04 | (M6 nốt + THÊM MỚI) nút giả: **"Nghe thử" mỗi vai chết hẳn (không onClick)** `:1474-1480`; chip "↶ Audio/Bản dịch/Phụ đề" **toast nói dối** `:1648-1650`; "Lưu hồ sơ phim" chỉ toast + **glossary không truyền vào pipeline** `:1318, :607`; seed glossary hardcode `:128-131` | — | 1) "Nghe thử" nối với clip mẫu `sample_audio_data` (V2 đã có sẵn!) — bấm là phát được; 2) Chip ↶: làm undo thật cho từng lớp (đã có undo stack — nối vào) hoặc ẩn; 3) Glossary: truyền vào prompt dịch (`translate`) khi bấm Xử lý; bỏ seed hardcode, bắt đầu rỗng + nút "Thêm" |
| R2-05 | (M9 nốt) cancel dịch batch qua DeepSeek/OpenRouter/MiniMax/Ollama vẫn "ghép nửa vời" (mất đuôi, không báo lỗi) | `translate/server.rs:1329, 973, 1073` | Cancel = trả `Err` cả batch như đường local (`server.rs:378`) — thống nhất mọi provider |

## 🟡 R2-C — BUG MỚI PHÁT SINH
| # | Việc | Vị trí | Cách làm |
|---|---|---|---|
| R2-06 | Prompt dịch RULE 1 "Never output CJK…" mâu thuẫn khi đích là ja/zh → phá bản dịch Nhật/Trung | `translate/server.rs:475, 926, 1265` | Chỉ áp RULE khi đích KHÔNG phải ja/zh/ko; hoặc bỏ hẳn |
| R2-07 | Bấm ✕ clear rồi chọn lại CÙNG 1 video → không nạp lại (guard `!== filePath`) | `SublixStudioView.tsx:214-222` | Sau khi clear, bỏ chặn trùng (dùng counter/nonce) |
| R2-08 | `saveUndoHistory()` chạy trong setState updater → React 19 StrictMode có thể ghi trùng undo | `:723-727` | Dời side-effect ra ngoài updater |
| R2-09 | Dead code `handleDropFile` với `(file as any).path` (đường cũ đã hỏng) | `:558-570` | Xóa |

## 🟢 R2-D — NỢ LOW TỪ ROUND 1
- Version fallback `?? "0.8.0"` còn 3 chỗ (`SettingsView.tsx:1038, 1209, 3037`) → đồng bộ "0.11.0" (hoặc đọc từ config).
- Filmstrip "Scene" vẫn là placeholder gradient, chưa có frame thật → trích thumbnail thật bằng ffmpeg lúc phân tích (đẹp như EZMAX).
- Tooltip glossary vẫn ghi "áp dụng vào bản dịch" nhưng chưa áp dụng → sửa khi làm R2-04.3.
- `try/catch` còn nuốt lỗi im `:256, 283-285` → log.

## 📋 NGHIỆM THU LẠI (chụp ảnh app thật — LUẬT CHẠY THẬT)
1. Mở app bằng `Chay-Sublix.bat` → app chạy (bản dev-mode, KHÔNG build release).
2. Tải 1 video có tiếng → kéo vào Studio → phát: **video hiện + tiếng thật + sóng âm THẬT im lặng thì phẳng**; dừng video = thời gian đứng im.
3. Bấm "Nghe thử" vai Kenji → phát clip giọng gốc; bấm "↶ Phụ đề" → hoàn tác THẬT (khôi phục câu vừa sửa).
4. Bấm "Lưu hồ sơ phim" với 1 tên riêng → chạy dịch → bản dịch GIỮ tên riêng theo glossary.
5. Dịch batch 15 câu, bấm Dừng giữa chừng → hiện "đã hủy batch", KHÔNG có bản dịch mất đuôi.
6. Dịch sang tiếng Nhật 1 câu → bản dịch CÓ ký tự Nhật (không bị cấm).

---

# 🌟 ĐỀ XUẤT TÍNH NĂNG HOÀN THIỆN (làm SAU khi hết R2 — theo `UI_SPEC_SUBLIX_STUDIO.md`)
| Ưu tiên | Tính năng | Vì sao |
|---|---|---|
| 1 | **UI-4: Ô chọn giọng GỘP** (P6): mọi nguồn 1 ô, badge LOCAL/FREE/API, tìm kiếm, nghe thử, gán theo làn nhân vật | Trái tim "tự chủ giọng" — đúng ảnh chụp ô giọng của EZMAX |
| 2 | **UI-5: Đọc lại từng câu + Undo thật** | Triết lý "sai 1 câu sửa 1 câu" — điểm vượt trội EZMAX |
| 3 | **UI-6: Hộp thoại Xuất video** đầy đủ (CRF Cao/Cân/Nhẹ, hardsub, .srt, thư mục đầu ra) + Batch Mode có ghi nhớ | Hoàn thiện vòng khép kín "dán link → video lồng tiếng" |
| 4 | **Tách vocal giữ nhạc (Demucs) — MIỄN PHÍ** | Món EZMAX bán tiền → "điểm bán" của Sublix |
| 5 | **Hồ sơ phim AI thật** (glossary học tên riêng/xưng hô từ bản dịch đầu) | Chất lượng dịch hơn hẳn, đúng tính năng "AI học" |
| 6 | GĐ4: OCR bóc sub từ chữ trên video + blur/xóa sub cũ | Lấp khoảng trống so với EZMAX |
| 7 | GĐ5: Dựng video cơ bản (cắt/tách/ghép, chữ, ảnh) — tham khảo OpenCut/ViteCut | Việc nặng nhất, để sau cùng |
