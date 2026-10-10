# FIX ROUND 7 — NỢ CUỐI CÙNG TRƯỚC KHI VỀ LỘ TRÌNH (CommandCode verify Round 6, 2026-10-09)
**Phán quyết Round 6: sửa thật 7/9 — BÁO CÁO LẦN NÀY TRUNG THỰC (tự thú lỗi cũ, tự ghi ❌ thiếu ảnh app). Đặc biệt Mavis phát hiện `multi_speaker_scene.mp4` là file MÀU ĐEN (H.264 780 frame, nội dung đen) — "khung đen" một phần là video đang phát ĐÚNG, cả đội đã chẩn nhầm. Điểm cộng lớn cho sự trung thực.**

## 🟠 R7-A — R6-01 NỐT (3 việc nhỏ)
| # | Việc | Vị trí | Cách sửa |
|---|---|---|---|
| R7-01 | Thiếu đường dự phòng khi trình duyệt KHÔNG có `requestVideoFrameCallback`: `framePainted`永远 false → transcode OAN mọi video (`webkitDecodedFrameCount` khai báo nhưng bỏ không dùng) | `SublixStudioView.tsx:385-436` | Fallback: nếu không có RVFC → dùng `webkitDecodedFrameCount` tăng (đã có type) hoặc rAF + `drawImage` vào canvas 1×1 kiểm pixel đổi; hết đường → bỏ detect (không transcode oan) |
| R7-02 | Sau transcode xong KHÔNG tự phát tiếp (thiếu `.play()`), user thấy đứng hình | `:427`, `:2286` | Gọi `.play()` sau khi nạp preview mới (giữ `currentTime` cũ nếu được) |
| R7-03 | Toast "đang phát preview…" NÓI QUÁ (thực tế chờ bấm Play) — vi phạm tinh thần LUẬT CHỐNG BỊA | `:428`, `:2288` | Đổi thành "✅ Đã chuyển sang dạng xem được" |

## 🟡 R7-B — SỬA CLAIM NÓI QUÁ (3 câu chữ)
| # | Việc | Vị trí |
|---|---|---|
| R7-04 | "8 commits v0.11.21 → **v0.11.28**" — v0.11.28 không tồn tại (`package.json` = 0.11.27) | `AGENT_CHAT.md:15` |
| R7-05 | Changelog "9 mục… đã xử lý xong" (R6-01/04 chưa trọn) + "pipeline work end-to-end" (thực chất CLI) → sửa cho đúng | `ChangelogModal.tsx:38, :119` |
| R7-06 | Sắp thứ tự thời gian bảng bàn giao (tin 18:00 nằm dưới 12:20) | `AGENT_CHAT.md` |

## 🟢 R7-C — ĐỔI BÀI TEST CHUẨN (quan trọng — cập nhật quy tắc nghiệm thu)
| # | Việc |
|---|---|
| R7-07 | **File test chuẩn cho "THẤY HÌNH" đổi sang file CÓ NỘI DUNG HÌNH:** `test-output-audit-giong/r6-01_input_with_frame.mp4` (testsrc, đã có sẵn) + 1 video tải về THẬT. `multi_speaker_scene.mp4` chỉ dùng cho test ÂM THANH/phân vai (nội dung đen — không chứng minh được hình). |
| R7-08 | **ẢNH APP THẬT là BẮT BUỘC cuối cùng** (mở `Chay-Sublix.bat` → thả `r6-01_input_with_frame.mp4` → CHỤP ẢNH THẤY HÌNH test pattern). Mavis không có GUI agent → nhờ PO chụp 1 ảnh hoặc gọi đệ Worker K chụp. Không có ảnh app = mục này chưa đóng. |

## 📋 NGHIỆM THU
1. Thả `r6-01_input_with_frame.mp4` vào app → thấy hình test pattern + tự phát sau khi transcode (nếu có) → ảnh app thật (r7-08).
2. Video H.264 thường (video nấu ăn) → KHÔNG bị transcode oan (không hiện toast "đang chuyển") — kể cả trên env thiếu RVFC (r7-01).
3. Toast đúng chữ "Đã chuyển sang dạng xem được" (r7-03).
4. Trong app + bảng bàn giao: không còn claim version ảo/nói quá (r7-04/05).

## ⛔ QUY TẮC (vẫn hiệu lực)
LUẬT CHẠY THẬT + LUẬT CHỐNG BỊA (kèm bằng chứng đúng bài); không `cargo build --release`; không đụng `Chay-Sublix.bat`/tab Tải video.
**Sau R7 → LỘ TRÌNH `FIX_STUDIO_UI_ROUND5.md` §LỘ TRÌNH:** UI-5 Đọc lại từng câu → UI-4 ô chọn giọng gộp → UI-6 hộp thoại xuất video → R7-nhúng sub → S2 checkbox tự lồng → Batch + Demucs.
