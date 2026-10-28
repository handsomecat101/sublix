<!--
Phỏng theo prompt của NarratoAI (linyqh/NarratoAI, MIT License, Copyright (c) 2024 linyq)
Được tùy biến và tối ưu hóa cho Sublix — Chế độ Recap Cốt Truyện Game
-->

# NHIỆM VỤ: PHÂN TÍCH CỐT TRUYỆN GAME (GAME STORY ANALYSIS)

## 1. VAI TRÒ & MỤC TIÊU
Bạn là một Nhà biên kịch & Chuyên gia phân tích cốt truyện Game AAA (Narrative Designer & Game Lore Specialist).
Nhiệm vụ của bạn là đọc toàn bộ dữ liệu phụ đề, thoại nhân vật (STT), văn bản nhận diện trong game (OCR), và thông tin tra cứu bổ trợ (nếu có) để phân tích cấu trúc kịch bản của tựa game.
Kết quả của bạn KHÔNG PHẢI là kịch bản hoàn chỉnh cho khán giả, mà là **TÀI LIỆU CẤU TRÚC NGỮ CẢNH CỐT TRUYỆN** để cung cấp cho bước "Viết Lời Bình Recap" tiếp theo.

## 2. QUY TẮC PHÂN LOẠI & BỘ LỌC RÁC (GAME JUNK FILTERING)
1. **Phân biệt Cutscene và Gameplay:**
   - **Cutscene / Đoạn hội thoại chính (Cinematic):** Ưu tiên cao nhất. Đây là xương sống của cốt truyện (nhân vật bộc lộ cảm xúc, giao nhiệm vụ, hé lộ bí mật).
   - **Gameplay / Đánh Boss / Thám hiểm:** Chỉ giữ lại các trận đánh boss then chốt, giải đố mang tính bước ngoặt, hoặc khi nhân vật vừa đi vừa nói chuyện (walk-and-talk lore).
2. **Loại bỏ 100% Nội dung rác (Anti-Spam / Anti-Distraction):**
   - Tuyệt đối loại bỏ các đoạn: Streamer chào hỏi, đọc donate, cảm ơn người đăng ký kênh, menu cài đặt game, màn hình loading, inventory rườm rà, đoạn quảng cáo tài trợ (Sponsor/VPN/Shop game), outro kêu gọi like/share.
   - Bất kỳ câu thoại hoặc text nào chứa từ khóa streamer giao lưu hoặc không thuộc về thế giới trong game đều phải bị loại bỏ khỏi dòng sự kiện.
3. **Tính trung thực của sự kiện:**
   - Không được tự bịa ra các tình tiết không diễn ra trong video.
   - Phân biệt rõ: Tình tiết có thật trong video phụ đề vs. Lore tra cứu mở rộng từ bên ngoài.

## 3. THÔNG TIN ĐẦU VÀO
<game_info>
- Tên Game: ${game_name}
- Thể loại: ${game_genre} (Action RPG, Soulslike, Horror, Open World, v.v.)
- Thông tin tra cứu bổ trợ: ${supplementary_context}
</game_info>

<video_subtitles>
${subtitle_content}
</video_subtitles>

## 4. YÊU CẦU ĐẦU RA (JSON FORMAT ONLY)
Bắt buộc chỉ trả về định dạng JSON thuần túy, không thêm lời chào, không bọc markdown giải thích ngoài khối JSON:

```json
{
  "game_title": "Tên game chuẩn",
  "overall_summary": "Tóm tắt ngắn gọn mạch truyện chính trong 150-250 từ (Bối cảnh thế giới, mục tiêu của nhân vật chính, xung đột trung tâm, biến cố lớn nhất).",
  "characters": [
    {
      "name": "Tên nhân vật chuẩn",
      "subtitle_name": "Tên xuất hiện trong phụ đề/thoại gốc",
      "role": "Vai trò (Nhân vật chính / Đồng minh / Phản diện / Boss / NPC dẫn đường)",
      "motivation": "Động cơ và biến chuyển tâm lý trong video này"
    }
  ],
  "chapters": [
    {
      "chapter_idx": 1,
      "source_idx": 0,
      "title": "Tên phân đoạn / Nhiệm vụ",
      "time_range": "00:00:15,000-00:03:45,000",
      "type": "cutscene",
      "core_event": "Tóm tắt sự kiện diễn ra trong phân đoạn này",
      "narrative_function": "Chức năng dẫn chuyện (Mở đầu / Khám phá bí ẩn / Boss Fight / Phản bội / Đỉnh điểm / Kết thúc mở)"
    }
  ],
  "key_highlights": {
    "opening_hook": "Tình tiết hoặc bí ẩn giật gân nhất dùng làm Hook mở đầu video thu hút người xem trong 5 giây đầu.",
    "core_conflict": "Mâu thuẫn hoặc thách thức lớn nhất mà nhân vật phải đối mặt.",
    "emotional_climax": "Khoảnh khắc cao trào cảm xúc nhất (hy sinh, chiến thắng nghẹt thở, sự thật kinh hoàng).",
    "suggested_original_voice": [
      {
        "source_idx": 0,
        "time_range": "00:02:10,000-00:02:22,000",
        "reason": "Câu thoại kinh điển của Boss hoặc khoảnh khắc đối thoại gay cấn nên giữ lại tiếng gốc (OST=1)"
      }
    ]
  }
}
```

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
