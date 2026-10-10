# FIX ROUND 4 — Sublix Studio (CommandCode verify, 2026-10-09 00:30 của Antigravity)
**Phán quyết: 9/10 sửa THẬT (crash "Nghe thử" đã sạch gốc, Dừng/Tốc độ hoạt động thật, build + 16/16 test xanh — CommandCode tự chạy lại). NHƯNG ảnh ui30 tự tố 1 vấn đề THẬT MỚI: khung xem không phát được video (codec WebView2). Làm các mục sau rồi mới đóng.**

## 🔴 R4-A — VIDEO KHÔNG XEM ĐƯỢC TRONG KHUNG (ui30 tự tố — ảnh `ui30_cancel_analysis_button.png`)
| # | Việc | Bằng chứng | Cách sửa |
|---|---|---|---|
| R4-01 | Nạp `multi_speaker_scene.mp4` → khung xem báo "Không thể phát tập tin... codec không được hỗ trợ bởi WebView2". Test file của ta là VP9/codec lạ → `<video>` HTML5 bó tay. **Không xem được video = không sửa tay được = app chưa dùng được cho việc chính.** | `ui30_cancel_analysis_button.png` | **Ưu tiên 1 (nhanh, đủ dùng):** khi `<video>.onerror` → tự chạy ffmpeg chuyển tạm sang bản xem trước H.264/AAC (temp, xóa khi xong) rồi phát bản đó — người dùng không cần biết. **Ưu tiên 2 (đúng hướng lâu dài, `UI_SPEC` §8):** nhúng **libmpv** vào ô xem (đúng cách EZMAX làm — mpv nuốt mọi codec). Cái nào làm cũng được, nhưng PHẢI phát được cả file VP9/codec lạ. |
| R4-02 | Nghiệm thu R4-01 (ảnh + nói rõ): phát được `test_dubbing_input/multi_speaker_scene.mp4` + 1 video tải về THẬT từ tab Tải video; tua/thay đổi tốc độ vẫn mượt. **THÊM (PO phản ánh 2026-10-09): thả file vào BẤT KỲ đâu trong Studio (khung xem, thanh timeline, khoảng trống) → video PHẢI HIỆN HÌNH trong khung xem.** Hiện tại: kéo-thả nạp file OK nhưng video không hiện (lỗi codec trên) → người dùng tưởng "thả không được" — nghiệm thu phải quay clip/chụp ảnh THẤY HÌNH sau khi thả. | | |

## 🟠 R4-B — "NÓI MÔM" VẶT & SAI LẶT NHỎ CÒN LẠI
| # | Việc | Vị trí | Cách sửa |
|---|---|---|---|
| R4-03 | **Tiếng beep giả mạo "mẫu giọng":** fallback `createAuditionBeepWav` phát "beeep" nhưng toast kêu "🎧 Nghe thử mẫu giọng X" — mạo danh giọng thật (vi phạm tinh thần không đồ giả) | `SublixStudioView.tsx:90-133, :866-873` | Không beep. Không có mẫu/TTS thật → toast "⚠️ Chưa có mẫu giọng cho vai này" |
| R4-04 | Đổi video khi đang 1.5x → element reset về 1x nhưng UI vẫn kêu "1.5x" (nói dối) | `:350-358`, `:553-558` | Re-apply `playbackRate` trong `handleLoadedMetadata` |
| R4-05 | Undo stack rác: `onFocus` lưu snapshot kể cả khi không sửa gì → đầy cap, "↶" hoàn tác về trạng thái y hệt | `:1748, :2422` | Chỉ lưu khi nội dung THẬT SỰ thay đổi (so trước/sau khi blur) |
| R4-06 | Hủy dịch multi-chunk: `translate_batch_with_config` vứt cả chunk OK → báo "0/x câu" oan | `translate/mod.rs:350-353` | Trả Err kèm số câu ĐÃ xong ("đã hủy ở x/y") hoặc giữ partial cho caller quyết |
| R4-07 | (R3-08 nốt) WAV scanner vẫn mù chunk `fmt ` (giả định mono s16) — stereo/24-bit ra peaks sai; heuristic prefix giọng `rawVoice.includes("-")` sót id custom | `dubbing/mod.rs:500, :521`; `SublixStudioView.tsx:1031` | Parse `fmt ` (channels/bitsPerSample) + chuẩn hóa giọng theo danh sách engine thay vì đoán |

## 🟢 R4-C — HOUSEKEEPING
| # | Việc |
|---|---|
| R4-08 | Chuyển tin `@done` 12:15 (khoe `cargo build --release` — vi phạm BUG-H07) từ `AGENT_CHAT.md` sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` theo luật rolling window; giữ tin mới trong 5-8 tin gần nhất |
| R4-09 | Kéo-thả hỏng thì **ngậm tăm**: `catch` ở `SublixStudioView.tsx:304-307` chỉ `console.warn` — đăng ký sự kiện kéo-thả thất bại → hiện toast "⚠️ Kéo thả không khả dụng — hãy dùng nút Mở video" thay vì im lặng cho người dùng mò |

## 📋 NGHIỆM THU LẠI (ảnh thật — LUẬT CHẠY THẬT)
1. `multi_speaker_scene.mp4` + 1 video tải về thật: **HIỆN HÌNH trong khung xem**, phát/tua/thay tốc độ được (R4-02).
2. Bấm "Nghe thử" khi chưa có mẫu → toast "Chưa có mẫu giọng", KHÔNG phát beep.
3. Đang 1.5x → nạp video khác → video mới vẫn chạy 1.5x.
4. Bấm ↶ 3 lần liên tiếp khi chưa sửa gì → không có thay đổi vớ vẩn.
5. Hủy dịch giữa chừng → báo đúng "đã hủy ở x/y câu".
