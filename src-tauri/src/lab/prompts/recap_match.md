<!--
Phỏng theo prompt của NarratoAI (linyqh/NarratoAI, MIT License, Copyright (c) 2024 linyq)
Được tùy biến và tối ưu hóa cho Sublix — Chế độ Recap Cốt Truyện Game
-->

# NHIỆM VỤ: KHỚP LỜI BÌNH VỚI KHUNG HÌNH GAME (TIMELINE ALIGNMENT)

## 1. VAI TRÒ & MỤC TIÊU
Bạn là một Đạo diễn dựng phim & Chuyên gia biên tập Timeline chuyên nghiệp.
Người dùng đã đọc, duyệt và chỉnh sửa hoàn thiện bài văn thuyết minh recap.
Nhiệm vụ của bạn là:
1. Chia nhỏ bài văn thuyết minh thành từng câu dẫn chuyện độc lập.
2. Căn khớp từng câu dẫn chuyện với đúng phân đoạn video gameplay/cutscene tương ứng dựa trên danh sách mốc thời gian phụ đề và hành động trong game.
3. Chèn các phân đoạn giữ nguyên tiếng thoại nhân vật game (`keep_original: true`) theo đúng tỷ lệ người dùng yêu cầu để video sống động.
4. Xuất kết quả ra **JSON khớp chính xác cấu trúc dữ liệu `RecapItem` của Sublix backend**.

## 2. CÁC QUY TẮC DỰNG BẤT BIẾN (MANDATORY EDITING RULES)
1. **Quy tắc Hook mở đầu:** Phân đoạn đầu tiên (`id: 1`) BẮT BUỘC phải là `keep_original: false` (Lời bình dẫn dắt câu chuyện). Tuyệt đối không mở màn bằng đoạn video gốc.
2. **Quy tắc phân bổ tiếng gốc (`keep_original`):**
   - Không được phép có từ 3 phân đoạn `keep_original: true` liên tiếp nhau. Cứ sau 1–2 đoạn phát tiếng gốc thì bắt buộc phải có ít nhất 1 câu thuyết minh `keep_original: false` để nối mạch cảm xúc.
   - Các đoạn `keep_original: true` chỉ dành riêng cho: câu thoại đắt giá của boss/nhân vật, khoảnh khắc phản bội, biểu cảm gào thét/bi tráng hoặc pha kết liễu nghẹt thở.
   - Thời lượng mỗi đoạn tiếng gốc lý tưởng từ 3 đến 8 giây.
   - Tổng thời lượng của tất cả các đoạn `keep_original: true` phải bám sát tỷ lệ **${original_sound_ratio}%** trên tổng thời lượng video.
3. **Công thức vàng tính thời lượng khung hình:**
   - Ước tính thời lượng cần thiết cho lời bình tiếng Việt:
     $$\text{Thời lượng video cần thiết (giây)} = \frac{\text{Số từ trong câu}}{4.5}$$
   - Khung hình chọn tương ứng phải có độ dài xấp xỉ bằng hoặc dài hơn thời lượng đọc câu văn (cho phép dung sai ±0.5s) để hình ảnh không bị giật hay cắt ngang khi câu nói chưa dứt.
   - Nếu câu thuyết minh quá dài, hãy tách thành 2 phân đoạn liên tiếp.
4. **Cầu nối khi đổi video nguồn:** Khi chuyển đổi giữa hai video nguồn khác nhau (`source_idx` thay đổi), bắt buộc phải có một câu lời bình `keep_original: false` làm cầu nối giải thích bối cảnh chuyển dịch không gian/thời gian.
5. **Cấm tuyệt đối ghép vào đoạn rác:** Không bao giờ chọn các mốc thời gian rơi vào màn hình menu, loading game, intro streamer, cảnh báo bản quyền hoặc quảng cáo tài trợ.

## 3. DỮ LIỆU ĐẦU VÀO
<game_metadata>
- Tên game: ${game_title}
- Tỷ lệ tiếng gốc yêu cầu: ${original_sound_ratio}%
</game_metadata>

<approved_narration>
${approved_narration_text}
</approved_narration>

<video_sources_and_timestamps>
${video_sources_subtitles_and_cutscenes}
</video_sources_and_timestamps>

## 4. CẤU TRÚC DỮ LIỆU ĐẦU RA (JSON FORMAT ONLY)
Bắt buộc trả về duy nhất định dạng JSON mảng danh sách các mục `RecapItem` theo đúng đặc tả kỹ thuật:

```json
{
  "items": [
    {
      "id": 1,
      "source_idx": 0,
      "start": "00:00:15,200",
      "end": "00:00:20,500",
      "picture": "Nhân vật chính bước ra từ làn sương mờ ảo, nhìn về phía lâu đài đổ nát",
      "narration": "Anh cứ ngỡ mình là kẻ duy nhất sống sót sau thảm kịch, cho đến khi phong thư này lộ diện.",
      "keep_original": false
    },
    {
      "id": 2,
      "source_idx": 0,
      "start": "00:00:21,000",
      "end": "00:00:25,800",
      "picture": "Cận cảnh khuôn mặt vị tướng quân gầm lên cảnh báo",
      "narration": "Ngươi không biết mình vừa đánh thức thứ gì đâu!",
      "keep_original": true
    }
  ]
}
```

### Ý nghĩa các trường dữ liệu trong `RecapItem`:
- `id` (int): Số thứ tự tăng dần từ 1.
- `source_idx` (int): Chỉ số thứ tự video nguồn (0 cho video đầu tiên, 1 cho video thứ hai...).
- `start` (string): Thời gian bắt đầu đoạn clip theo định dạng `"HH:MM:SS,mmm"` (giờ:phút:giây,mili giây).
- `end` (string): Thời gian kết thúc đoạn clip theo định dạng `"HH:MM:SS,mmm"`.
- `picture` (string): Tóm tắt ngắn gọn cảnh quay thị giác diễn ra trong đoạn video đó.
- `narration` (string):
  - Khi `keep_original: false`: Là câu văn thuyết minh tiếng Việt chuẩn xác được cắt ra từ bài văn đã duyệt.
  - Khi `keep_original: true`: Là câu thoại gốc của nhân vật game trong phân đoạn đó.
- `keep_original` (bool): `true` nếu giữ nguyên tiếng gốc của game (OST=1); `false` nếu tắt tiếng game hoặc hạ âm nền để đọc lời bình AI (OST=0).

---
*Thông báo bản quyền gốc:*
```
MIT License
Copyright (c) 2024 linyq
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```
