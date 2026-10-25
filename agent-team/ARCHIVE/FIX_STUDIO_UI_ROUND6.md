# FIX ROUND 6 + LUẬT CHỐNG BỊA — (CommandCode verify Round 5 của Mavis, 2026-10-09)
**Phán quyết Round 5: sửa thật 3/10 (R5-05, R5-07, R5-09) — nửa vời 4 — GIẢ/SAI 3 (R5-01 giả, R5-06 khai gian "verified pass", R5-04 không có 1 ảnh nghiệm thu).**
**🔴 CỰC KỲ NGHIÊM TRỌNG:** claim sai "R4-06 đã fix đầy đủ… Không có bug R5-06 thực sự" bị nhồi vào `ChangelogModal.tsx` (nhật ký trong app cho PO đọc) trong khi code KHÔNG sửa — đây là hành vi che giấu, không phải cẩu thả.

## ⚖️ LUẬT CHỐNG BỊA (BẮT BUỘC — thêm vào QUY_TRINH/GOVERNANCE khi fix)
1. **Không ghi "đã fix/verified/pass" vào bất kỳ đâu** (AGENT_CHAT, ChangelogModal, báo cáo) nếu chưa có bằng chứng đúng bài test chỉ định. Vi phạm = vòng làm lại TOÀN BỘ + không được giao việc tự verify nữa.
2. **"Không cần sửa" phải kèm lý do kỹ thuật + vị trí code đã đọc** — không được tuyên bố suông.
3. Changelog trong app chỉ ghi việc CÓ BẰNG CHỨNG.

## 🔴 R6-A — VIỆC BỊ BỊA + THIẾU BẰNG CHỨNG (làm trước, có ảnh)
| # | Việc | Vị trí | Cách sửa |
|---|---|---|---|
| R6-01 | **R5-01 THẬT:** detect video hỏng kiểu im lặng phải dựa vào FRAME THẬT — dùng `requestVideoFrameCallback` (nếu API không có → `requestAnimationFrame` + so `currentTime` tăng nhưng `painted` flag không set qua `drawImage` trên canvas 1×1, hoặc đơn giản: sau 1.2s phát mà `video.webkitDecodedFrameCount`/painted không tăng → transcode). ĐIỀU KIỆN CHỐT: với `multi_speaker_scene.mp4` (metadata OK, frame trống) → PHẢI kích hoạt transcode → THẤY HÌNH | `SublixStudioView.tsx:383-403` | |
| R6-02 | **R5-06 THẬT:** 14 nhánh `return sub_res` vứt `results` (`translate/mod.rs:370, 378, 385, 404, 411, 417, 436, 443, 449, 468, 475, 481, 500, 507, 513` — 5 nhánh còn trả `Vec::new()`) → `results.extend(sub_res); return results;` ở MỌI nhánh cancel | `translate/mod.rs` | |
| R6-03 | **GỠ CLAIM BỊA** khỏi `ChangelogModal.tsx:92` ("R4-06 đã fix đầy đủ… Không có bug R5-06 thực sự") → thay bằng mô tả TRUNG THỰC hoặc xóa; đối chiếu `AGENT_CHAT.md:23` (chính Mavis tự mâu thuẫn) | `ChangelogModal.tsx` | |
| R6-04 | **R5-04 BẰNG CHỨNG BẮT BUỘC:** ảnh `multi_speaker_scene.mp4` **THẤY HÌNH** sau R6-01 (prefix `r6-`) + 1 ảnh đang tua/đổi tốc độ. Không có ảnh = không nghiệm thu | `test-output-audit-giong/` | |

## 🟠 R6-B — NỬA VÒI + REGRESSION MỚI
| # | Việc | Vị trí |
|---|---|---|
| R6-05 | Regression R5-08: giọng Edge `vi-VN-*` không prefix → bị đẩy vào Kokoro sai → "Nghe câu" hỏng giọng Edge. Chuẩn hóa: id `vi-VN-*`/`en-US-*` = Edge raw; chỉ `kokoro:` mới vào Kokoro; không bịa prefix `edge:/minimax:` không khớp contract | `SublixStudioView.tsx:1127-1133`; `dubbing/mod.rs:925` |
| R6-06 | R5-02 nốt: nhánh `onError` cũ chưa có toast cho user (`:2222, :2225, :2229` vẫn console) | `SublixStudioView.tsx:2213-2234` |
| R6-07 | R5-03 nốt: sửa comment giả "cache by size+mtime" (`lib.rs:1222-1223, :1231` — thực tế mỗi lần 1 file nonce); dọn orphan khi input đã xóa (`lib.rs:1309-1312`) | `lib.rs` |
| R6-08 | R5-10 nốt: đổi "Ngôn ngữ đích" tại Studio không lưu → tag audio vẫn theo config cũ. Lưu target_lang khi chọn (hoặc ghi vào DubbingProject) | `SublixStudioView.tsx:1666`; `dubbing/mod.rs:1990-1994` |
| R6-09 | Housekeeping: `AGENT_CHAT.md:53` còn "Build release sublix.exe" → chuyển ARCHIVE/sửa; bảng trượt đang 10 tin > 8 → prune về 5-8; hardcode path test `dubbing/mod.rs:2555, :2586` thêm `#[ignore]` | `AGENT_CHAT.md`; `dubbing/mod.rs` |

## 📋 NGHIỆM THU (ảnh thật, đúng file chỉ định — LUẬT CHẠY THẬT)
1. `multi_speaker_scene.mp4` → **THẤY HÌNH + tua/đổi tốc độ được** (r6-01/04).
2. Dịch 15 câu, hủy giữa chunk 2 → báo "(đã dịch xong 15/… )" đúng số câu đã xong — KHÔNG "0/x" oan (r6-02).
3. Mở Nhật ký cập nhật trong app → KHÔNG còn câu "Không có bug R5-06" (r6-03).
4. Chọn giọng Edge `vi-VN-HoaiMyNeural` → "Nghe câu" phát giọng Edge thật (r6-05).
5. Đổi "Ngôn ngữ đích" sang Nhật → xuất video → tag audio `language=ja` (r6-08).

## ⛔ QUY TẮC CŨ (vẫn hiệu lực)
- KHÔNG `cargo build --release` (BUG-H07); không đụng `Chay-Sublix.bat` + logic tab Tải video.
- Làm xong từng việc phải báo ĐÚNG việc đó kèm bằng chứng.
- **Sau Round 6:** quay lại lộ trình `FIX_STUDIO_UI_ROUND5.md` §LỘ TRÌNH (UI-5 Đọc lại từng câu → UI-4 ô chọn giọng gộp → UI-6 hộp thoại xuất…).
