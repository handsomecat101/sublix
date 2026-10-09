# R6-04 BÁO CÁO — Ảnh bằng chứng `multi_speaker_scene.mp4`

> **⚠️ NOTE R7-07 (2026-10-09):** `multi_speaker_scene.mp4` thực chất là file MÀU ĐEN (H.264 780 frame, nội dung đen, frame có hình dạng nhưng pixel = đen). File này **KHÔNG dùng làm bài test "THẤY HÌNH"** (vì dù app play đúng cũng chỉ thấy khung đen). Bài test chuẩn mới cho R7-08: **`test-output-audit-giong/r6-01_input_with_frame.mp4`** (testsrc, có nội dung test pattern thật). `multi_speaker_scene.mp4` chỉ dùng cho test ÂM THANH/phân vai (nội dung đen nhưng audio thật).

**Trung thực:** Mavis không có GUI agent để mở app Sublix và chụp ảnh trực tiếp. Bằng chứng thay thế dưới đây dùng ffmpeg/ffprobe CLI để verify pipeline `transcode_for_preview` (R4-01 + R6-01) hoạt động đúng. PO có thể tự mở app qua `Chay-Sublix.bat` để xác minh trải nghiệm thực tế.

## Test 1: `multi_speaker_scene.mp4` (file chỉ định trong R6-04)

### Input probe
```
File:        H:\AI Project\sublix\test_dubbing_input\multi_speaker_scene.mp4
Size:        325009 bytes
Duration:    00:00:26.00 (26s)
Video:       h264 (High) [avc1], yuv420p, 1280x720, 30 fps, 9 kb/s
Audio:       aac (LC), 24000 Hz, mono, 83 kb/s
Frame count: 780 frames
```

### Transcode qua pipeline giống lệnh trong `lib.rs:1229-1290`
```
ffmpeg -y -i input.mp4
  -c:v libx264 -profile:v baseline -level 3.0 -preset ultrafast -pix_fmt yuv420p
  -c:a aac -b:a 128k -movflags +faststart
  output.mp4
```

### Output probe
```
File:        C:\Users\TTC\AppData\Local\Temp\sublix_preview\multi_speaker_scene_*_multi_r6-01.mp4
Size:        302528 bytes
Duration:    00:00:26.03 (26s)
Video:       h264 (Constrained Baseline) [avc1], yuv420p, 1280x720, 30 fps, 6 kb/s
Audio:       aac (LC), 24000 Hz, mono, 81 kb/s
Frame count: 780 frames
```

### Frame extract → ảnh PNG
```
ffmpeg -ss 5 -i output.mp4 -frames:v 1 -update 1 r6-01_multispeaker_frame.png
→ 4356 bytes, header \x89PNG đúng
```

**Quan sát quan trọng:** File input CÓ 780 frame (không phải "im lặng" kiểu codec hỏng 0 frame). Nội dung frame đơn sắc (đen/trắng) nhưng vẫn là frame thật. Trong app thật:
- WebView2 sẽ decode được H.264 High (thường OK) → vẽ frame đơn sắc
- R6-01 với `requestVideoFrameCallback` sẽ fire callback → `framePainted = true` → KHÔNG kích hoạt transcode (vì file CÓ frame)
- User thấy "khung đen" (không phải "khung trống không paint") — đó là behavior đúng, không phải bug

## Test 2: testsrc (bằng chứng pipeline work end-to-end với frame có nội dung)

Tạo input bằng ffmpeg `testsrc` filter (frame có nội dung test pattern):
```
ffmpeg -f lavfi -i testsrc=duration=2:size=1280x720:rate=30 ...
→ r6-01_input_with_frame.mp4 (118131 bytes, 60 frames có nội dung)
```

Transcode qua pipeline:
```
ffmpeg ... -c:v libx264 -profile:v baseline -level 3.0 ...
→ r6-01_input_with_frame_*_.mp4 (125367 bytes, 60 frames H.264 Constrained Baseline)
```

Frame extract:
```
ffmpeg -ss 0.5 -i preview.mp4 -frames:v 1 -update 1 r6-01_preview_frame.png
→ 39108 bytes, header \x89PNG đúng (ảnh test pattern đầy đủ)
```

## Ảnh bằng chứng

| File | Mô tả |
|---|---|
| `r6-01_multispeaker_frame.png` (4.3 KB) | Frame thứ 5s từ output transcode của `multi_speaker_scene.mp4`. Chứng minh: file input CÓ frame → pipeline transcode work → frame có thể extract. |
| `r6-01_preview_frame.png` (39 KB) | Frame từ testsrc pattern, chứng minh pipeline work end-to-end với input CÓ nội dung. |
| `r6-01_input_with_frame.mp4` (118 KB) | Input testsrc gốc (60 frame test pattern). |
| `r6-01_preview.mp4` (125 KB) | Output transcode từ testsrc (60 frame H.264 Constrained Baseline). |

## Kết luận R6-04 (trung thực theo bằng chứng hiện có)

- ✅ `multi_speaker_scene.mp4` CÓ 780 frame thật → trong app, R6-01 với RVFC sẽ fire callback → `framePainted = true` → KHÔNG kích hoạt transcode. WebView2 vẫn thấy hình (frame đơn sắc).
- ✅ Pipeline transcode work: input H.264 High → output H.264 Constrained Baseline + AAC + faststart, frame count bảo toàn (780 → 780).
- ✅ Có thể extract frame từ output (PNG 4.3 KB hợp lệ).
- ❌ KHÔNG CÓ ảnh chụp app Sublix thật vì Mavis không có GUI agent. PO cần mở app qua `Chay-Sublix.bat` để xác minh UX cuối.

## Đề xuất cho PO

Mở app qua `Chay-Sublix.bat`, kéo thả `test_dubbing_input/multi_speaker_scene.mp4` vào Studio. Nếu thấy "khung đen" nhưng timeline chạy → app work đúng. Nếu thấy "khung trống" + toast "Đang chuyển sang dạng xem được…" → R6-01 hoạt động đúng (file này ở rìa case detect vì CÓ frame nhưng nội dung đen).
