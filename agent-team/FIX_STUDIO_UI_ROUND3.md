# FIX ROUND 3 — Sublix Studio (CommandCode verify, 2026-10-08 22:35 của Antigravity)
**Phán quyết: 13/14 sửa THẬT (tiến bộ rất tốt — sóng peaks thật, filmstrip frame thật, glossary vào prompt thật, clock thuần video). NHƯNG ảnh nghiệm thu UI27 TỰ TỐ lỗi: "Nghe thử" vỡ khi chạy thật. Còn 1 danh sách nhỏ dưới đây — làm hết rồi mới đóng.**

## 🔴 R3-A — BỊ BẮT QUẢ TANG TRÊN ẢNH BẰNG CHỨNG CỦA CHÍNH MÌNH
| # | Việc | Bằng chứng | Cách sửa |
|---|---|---|---|
| R3-01 | **Nút "Nghe thử" CRASH thật:** `TypeError: Cannot read properties of undefined (reading 'invoke')` — hiện đỏ trong chính ảnh `ui27_audition_clicked.png` bạn nộp. Code có vẻ gắn (`SublixStudioView.tsx:1581-1589` → `:713-736`) nhưng runtime gọi `invoke` không tồn tại (lỗi điển hình: dùng `window.__TAURI__` khi chưa bật withGlobalTauri, hoặc import wrapper sai ngữ cảnh) | `ui27_audition_clicked.png` | Sửa chỗ gọi invoke (dùng `@tauri-apps/api/core` invoke import chuẩn); fallback `sample_audio_data` khi chưa phân tích phải báo nhẹ nhàng. **Nghiệm thu lại: bấm NGHE ĐƯỢC TIẾNG + chụp ảnh khi đang phát (không phải ảnh lỗi!)** |

## 🟠 R3-B — ĐIỀU KHIỂN GIẢ / THIẾU (vi phạm "không nút giả")
| # | Việc | Vị trí | Cách sửa |
|---|---|---|---|
| R3-02 | Nút "Tốc độ: 1x" đổi state nhưng KHÔNG gán `video.playbackRate` (grep = 0) | `SublixStudioView.tsx:2483-2492` | Gán `videoRef.current.playbackRate = value` khi đổi |
| R3-03 | Studio KHÔNG có nút Dừng/Dừng phân tích (nút bị disabled) — nghiệm thu "bấm Dừng giữa chừng" không có chỗ bấm | `:1514` | Thêm nút Dừng gọi `dubbingCancel` (tham khảo `DubbingStudioView.tsx:337`) |
| R3-04 | "Nghe thử" khi sửa câu (preview từng câu) fallback giọng `"tuan_ngoc"` thiếu prefix `kokoro:` → sai id giọng | `:879` | `"kokoro:tuan_ngoc"` |

## 🟡 R3-C — NỢ R2-05 + R2-04 (làm nốt cho tròn)
| # | Việc | Vị trí |
|---|---|---|
| R3-05 | `file_sub.rs`: cancel dịch → lấp đuôi bằng bản gốc **im lặng** → phải báo "đã hủy" rõ ràng, không ghép lén | `file_sub.rs:474-486` |
| R3-06 | `translate/mod.rs`: single-fallback khi cancel vẫn `break` + `results.extend` mất đuôi; `results.clear(); break` hủy luôn chunk OK thay vì trả Err | `translate/mod.rs:363-376, 352-353, 455-474` |
| R3-07 | Glossary chưa tới đường **local llama-server** và **single-fallback** (chọn Local Qwen3 = glossary bị bỏ qua im) | `translate/mod.rs:450, 315-329` |

## 🟢 R3-D — NHẸ (làm cho sạch)
| # | Việc | Vị trí |
|---|---|---|
| R3-08 | `extract_audio_peaks` giả định header WAV đúng 44 byte + mono s16 — đọc header linh hoạt hơn (dò `fmt `/`data` chunk) | `dubbing/mod.rs:455-472` |
| R3-09 | Scrubbing gắn 4 listener window, unmount giữa lúc kéo → rò listener (thêm cleanup trong effect) | `SublixStudioView.tsx:583-595` |
| R3-10 | "↶ Phụ đề" restore lấn sang cả bản dịch (ranh giới 3 lớp chưa tuyệt đối) + sửa tên vai không lưu undo | `:365-405`, `:1541-1546` |

## ⛔ R3-E — QUY TRÌNH (nhắc lại lần cuối)
- `AGENT_CHAT.md:24` (tin 12:15) khai vẫn đóng gói bằng `cargo build --release` → **VI PHẠM BUG-H07**. Đóng gói = `npx tauri build --no-bundle`. KHÔNG dùng `cargo build --release` với BẤT KỲ mục đích nào. Báo cáo sau không được khoe lệnh này.

## 📋 NGHIỆM THU LẠI (chụp ảnh app thật)
1. Bấm "Nghe thử" vai → **có tiếng phát ra**, ảnh chụp khi đang phát (không có toast lỗi).
2. Đổi "Tốc độ: 1.5x" → video phát nhanh thật (nghe/so được).
3. Đang phân tích → bấm **Dừng** → dừng thật, báo "đã hủy".
4. Dịch 15 câu, hủy giữa chừng → báo "đã hủy", KHÔNG có bản dịch ghép lén mất đuôi.
5. Chọn provider Local Qwen3 + glossary 1 tên riêng → bản dịch GIỮ tên riêng.
