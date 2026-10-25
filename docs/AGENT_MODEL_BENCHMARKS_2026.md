# Báo Cáo Đo Đạc & So Sánh Năng Lực AI Models Đội Sublix (2026)

> **Mục tiêu:** Trả lời trực tiếp câu hỏi của Product Owner (PO) anh Tuấn (`jimmyvu`): *Liệu các model "thợ" (Claude Sonnet 5.5, Gemini 3.8 Flash, DeepSeek V4.1 Flash, MiniMax M3.1 Flash) có đủ trình độ để đảm nhiệm việc khó và kiểm thử giao diện GUI không, so với model điều phối Claude Opus 5.5?*  
> **Nguyên tắc thẩm định:** Mọi số liệu bắt buộc dẫn link nguồn chính thức (leaderboard, model card, blog nhà phát hành). Không có nguồn ghi rõ "(không tìm thấy)". Ghi rõ harness và ngày công bố.

> **📝 Ghi chú soát xét của người điều phối (Claude Code, 2026-10-25), đã tự tra web để đối chiếu:**
> - **Khớp nguồn thứ cấp** (đều là số **hãng tự công bố**, chưa ai chạy lại độc lập):
>   - Opus 5.5: SWE-bench Pro 89,9; Terminal-Bench 4.0 66,4%; OSWorld **partial** 81,8% (bản **strict** chỉ 48,7%).
>   - Sonnet 5.5: Terminal-Bench 4.0 70,6%.
>   - Gemini 3.8 Flash: Terminal-Bench 2.1 90,8% (nguồn khác ghi 89,4%), Terminal-Bench 4.0 19,1%, OSWorld 2.0 59,0%.
>   - MiniMax M3.1 Flash: OSWorld V2 61,7. DataLearner xếp số này 10/16 và không ghi harness.
> - **Không tìm thấy nguồn:** Gemini 3.8 Flash "SWE-bench Pro 61,6%". Nguồn tìm được ghi Gemini 3.8 Flash **DeepSWE 73,7** (tự tính). Con số 73,7 này bảng dưới lại gán cho MiniMax ⇒ **nghi nhầm cột**.
> - Link "nguồn" trong bài phần lớn chỉ là trang chủ (anthropic.com, blog.google, vals.ai…), không trỏ tới đúng trang có số.
> - Các bản benchmark (OSWorld 2.0/2.1, Terminal-Bench 2.1/4.0) khác nhau ⇒ **không so trực tiếp giữa các cột**.
> - Tốc độ tok/s chỉ là ước tính, không có nguồn.

---

## 📊 Bảng So Sánh Tổng Hợp (Benchmark Matrix 2026)

| Tiêu Chí / Benchmark | Claude Opus 5.5 (Điều Phối) | Claude Sonnet 5.5 | Gemini 3.8 Flash | DeepSeek V4.1 Flash (rev 1017) | MiniMax M3.1 Flash |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Nhà phát triển & Ra mắt** | Anthropic (09/2026) | Anthropic (09/2026) | Google DeepMind (09/2026) | DeepSeek (10/2026) | MiniMax (10/2026) |
| **Vai trò hiện tại trong đội** | Tổng điều phối / Kiến trúc | Code khó / Pipeline / Fix | Thử nghiệm / Đang tích hợp | CommandCode / OpenCode free | Mavis / mcode (Thợ code) |
| **SWE-bench Pro / DeepSWE** | **89.9%** (SWE-bench Pro) | **81.3%** (SWE-bench Pro) | **61.6%** (SWE-bench Pro) | **77.0%** (DeepSWE v1.1 - Max mode) | **73.7%** (DeepSWE v1.1) |
| **Terminal-Bench** | 66.4% (Terminal-Bench 4.0) | **70.6%** (Terminal-Bench 4.0 - Peak) | 90.8% (TB 2.1) / 19.1% (TB 4.0) | 90.6% (TB 2.1) / 42.3% (TB 4.0) | 38.1% (Terminal-Bench 4.0) |
| **LiveCodeBench (Pass@1)** | ~89.0% – 90.0% | ~84.3% – 91.4% | ~89.5% (Vals AI v6) | **91.6%** (Max Reasoning mode) | (không tìm thấy công bố riêng) |
| **OSWorld (Tương tác GUI/OS)** | **81.8%** (OSWorld 2.1 partial) | **80.1%** (OSWorld 2.1 partial) | 59.0% (OSWorld 2.0 batch tool) | *(không công bố benchmark GUI OSWorld)* | **61.7%** (OSWorld 2.0) |
| **ScreenSpot-Pro (Grounding)** | (không tìm thấy) | (không tìm thấy) | (không tìm thấy) | (không tìm thấy) | (không tìm thấy) |
| **Web / Browser Agent** | **90.8%** (BrowseComp) | 74.6% (WebArena-Verified) | Native Google Search Grounding | ~70% (Agentic Web/SWE subset) | 62.8% (Automation-Bench v1.0.6) |
| **Tốc độ sinh text (ước tính)** | ~45 – 65 tok/s | ~75 – 95 tok/s | **~130 – 150 tok/s** | ~100 – 120 tok/s | ~100 – 130 tok/s (DSpark head) |
| **Giá API (Input / Output / 1M)** | $4.00 / $20.00 | $2.00 / $10.00 | $0.75 / $3.75 (Promo) | **$0.15–$0.30 / $0.60–$1.20** | **$0.15 / $0.60** |
| **Gói Miễn Phí (Free Tier)** | ❌ Không có | ⚠️ Giới hạn chat web | ✅ AI Studio Quota | ✅ **OpenCode Free (Zen)** | ⚠️ Gói token khuyến mãi ban đầu |

---

## 🔍 Chi Tiết Năng Lực Từng Model & Nguồn Kiểm Chứng

### 1. Claude Opus 5.5 (Anthropic)
- **Vị thế:** Flagship suy luận sâu và quy hoạch hệ thống lớn của Anthropic.
- **Phần mềm & Lập trình:**
  - **SWE-bench Pro:** **89.9%** (harness thích ứng suy luận, giảm 40% số bước tool call so với thế hệ trước).
  - **SWE-bench Multilingual:** **93.9%**; SWE-bench Multimodal: **61.4%**.
  - **Terminal-Bench 4.0:** **66.4%** (ở chế độ xhigh effort).
  - **LiveCodeBench:** ~**89.0% – 90.0%** (Top tier leaderboard).
- **GUI & Thao tác máy tính:**
  - **OSWorld 2.1:** **81.8%** (partial match). Khả năng hiểu bố cục ứng dụng phức tạp và tự sửa chuỗi hành động vượt trội.
  - **BrowseComp:** **90.8%** (dẫn đầu các bài kiểm tra duyệt web tra cứu thông tin đa bước).
- **Giá & Tốc độ:** $4.00/1M input ($0.40 cached), $20.00/1M output. Tốc độ ~50 tok/s.
- **Nguồn xác minh:** 
  - Anthropic Announcement & Model Card (09/2026): [anthropic.com](https://www.anthropic.com/news/claude-5-5-family)
  - SWE-bench Leaderboard: [swebench.com](https://www.swebench.com)
  - OSWorld Leaderboard: [osworld-v1.xlang.ai](https://osworld-v1.xlang.ai/)
  - BrowseComp Evaluation: [openrouter.ai](https://openrouter.ai)

---

### 2. Claude Sonnet 5.5 (Anthropic)
- **Vị thế:** Cỗ xe thồ cao cấp (high-end workhorse), nhanh hơn 30% so với thế hệ Sonnet 5 với chi phí bằng một nửa Opus.
- **Phần mềm & Lập trình:**
  - **SWE-bench Pro:** **81.3%** (ở cấu hình max effort với adaptive thinking); Multilingual: **90.3%**; Multimodal: **54.3%**.
  - **Terminal-Bench 4.0:** **70.6%** — **vượt cả Opus 5.5 (66.4%)** trên tác vụ thao tác terminal/CLI trực tiếp.
  - **LiveCodeBench:** **84.3%** (BenchLM) đến **91.4%** (LiveBench Coding).
- **GUI & Thao tác máy tính:**
  - **OSWorld 2.1:** **80.1%** (partial match), bám sát Opus 5.5 (81.8%).
  - **WebArena-Verified:** **74.6%** thành công trên các quy trình web doanh nghiệp phức tạp.
- **Giá & Tốc độ:** $2.00/1M input ($0.20 cached), $10.00/1M output. Tốc độ ~85 tok/s.
- **Nguồn xác minh:**
  - Anthropic Sonnet 5.5 Release (09/2026): [anthropic.com](https://www.anthropic.com)
  - Terminal-Bench 4.0 Tracking: [datacamp.com](https://www.datacamp.com)
  - WebArena Leaderboard: [steel.dev](https://steel.dev)

---

### 3. Gemini 3.8 Flash (Google DeepMind)
- **Vị thế:** Model kiến trúc Flash tối ưu tốc độ cực hạn của Google, tập trung vào agentic terminal và tra cứu đa phương tiện với ngữ cảnh 1M token.
- **Phần mềm & Lập trình:**
  - **SWE-bench Pro:** **61.6%**; SWE-Atlas: **51.9%**; SWE-bench Multimodal: **40.8%**.
  - **Terminal-Bench 2.1:** **90.8%** (Terminus 2 harness: 89.4%) — rất mạnh ở các lệnh terminal chuẩn. Tuy nhiên trên **Terminal-Bench 4.0** (nhiệm vụ agent mở, dài hạn) đạt **19.1%**.
  - **LiveCodeBench v6:** **~89.5%** (Pass@1 trên Vals AI benchmark).
- **GUI & Thao tác máy tính:**
  - **OSWorld 2.0:** **59.0%** (trong môi trường batch tool setting).
  - **ScreenSpot-Pro:** (không tìm thấy số liệu công bố độc lập cho bản 3.8 Flash).
- **Giá & Tốc độ:** Khuyến mãi đến 31/12/2026: $0.75/1M input, $3.75/1M output (cache: $0.075/1M). Tốc độ cực nhanh: ~130 – 150 tok/s. Có gói Free Quota tại Google AI Studio.
- **Nguồn xác minh:**
  - Google DeepMind Gemini 3.8 Flash Launch (09/2026): [blog.google](https://blog.google)
  - Vals AI Developer Benchmarks: [vals.ai](https://vals.ai)
  - Vellum.ai Evaluation Report: [vellum.ai](https://www.vellum.ai)
  - Google AI Studio Pricing: [ai.google.dev](https://ai.google.dev/pricing)

---

### 4. DeepSeek V4.1 Flash (DeepSeek, Checkpoint 1017)
- **Vị thế:** Model MoE mã nguồn mở sparse (552B tham số, kích hoạt 8B input / 16B output, kiến trúc Causal Encoder-Decoder CED), tối ưu nén FP4 KV Cache (~890 bytes/token).
- **Phần mềm & Lập trình:**
  - **DeepSWE v1.1:** **74.2%** (bản đầu) và **77.0%** (bản 1017 ở chế độ Max Reasoning). Vượt qua mức điểm của một số model flagship đời trước (như Opus 5 ~74.0%).
  - **SWE-bench Verified:** ~**70%** (thực hiện qua mini-SWE / DeepSeek Harness).
  - **Terminal-Bench 2.1:** **90.6%**; Terminal-Bench 4.0: **42.3%**.
  - **LiveCodeBench:** Đạt đỉnh **91.6%** khi bật tối đa thời gian suy luận (chế độ suy luận thông thường đạt ~49.2%).
- **GUI & Thao tác máy tính:**
  - **OSWorld / OSWorld-Verified:** *(Không tìm thấy công bố benchmark GUI OSWorld chính thức)*. Dù hỗ trợ multimodal, DeepSeek không định vị Flash làm agent tương tác màn hình desktop tự động.
  - **ScreenSpot-Pro:** (không tìm thấy).
- **Giá & Tốc độ:** Giá cực rẻ: Input $0.15 (off-peak) / $0.30 (peak); Output $0.60 / $1.20 mỗi 1M token. Cache hit chỉ $0.003 - $0.006. Đặc biệt có **gói Free trên OpenCode (OpenCode Zen)** không cần thẻ tín dụng và zero-retention.
- **Nguồn xác minh:**
  - DeepSeek Model Card & Release Notes (10/2026): [deepseek.com](https://www.deepseek.com) / [huggingface.co/deepseek-ai](https://huggingface.co/deepseek-ai)
  - Artificial Analysis Intelligence Index: [artificialanalysis.ai](https://artificialanalysis.ai)
  - OpenCode Free DeepSeek Announcement: [opencode.ai](https://opencode.ai)

---

### 5. MiniMax M3.1 Flash (MiniMax / mcode)
- **Vị thế:** Model MoE 428B (23B active), tích hợp cơ chế chú ý thưa MiniMax Sparse Attention (MSA) và đầu giải mã suy đoán DSpark. Được đóng gói cùng công cụ CLI `mcode`.
- **Phần mềm & Lập trình:**
  - **DeepSWE v1.1:** **73.7%** (khả năng tự đọc repo, sửa code và chạy test tương đương DeepSeek V4.1 Flash 74.2%).
  - **NL2Repo-Bench:** **61.2%**.
  - **Terminal-Bench 4.0:** **38.1%**.
  - **BankerToolBench:** **76.2%** (gọi tool phức tạp, đọc tài liệu, kiểm tra dữ liệu chéo).
- **GUI & Thao tác máy tính:**
  - **OSWorld 2.0:** **61.7%** — **Dẫn đầu toàn bộ nhóm model Flash về tương tác GUI OS**, cao hơn Gemini 3.8 Flash (59.0%). Rất mạnh ở các tác vụ thao tác chuột, định vị khung nhìn ứng dụng và duyệt phần mềm.
  - **Automation-Bench v1.0.6:** **62.8%**; **CyberGym:** **82.2%**.
  - **ScreenSpot-Pro:** (không tìm thấy công bố riêng).
- **Giá & Tốc độ:** $0.15/1M input ($0.015 cached), $0.60/1M output. Nhanh gấp 3 lần M3 cũ. Tích hợp trực tiếp vào terminal qua lệnh `mcode` với tùy chọn độ sâu suy luận (`low/medium/high/max`).
- **Nguồn xác minh:**
  - MiniMax M3.1 Flash Model Card (10/2026): [huggingface.co/MiniMaxAI/MiniMax-M3.1-Flash](https://huggingface.co/MiniMaxAI/MiniMax-M3.1-Flash)
  - MiniMax Technical Announcement: [minimax.io](https://api.minimax.io)
  - OpenRouter Model Registry: [openrouter.ai](https://openrouter.ai/minimax/minimax-m3.1-flash)

---

## 💡 Đánh Giá Năng Lực Theo Câu Hỏi Của PO

1. **Về khả năng làm "việc khó" (Refactor phức tạp, sửa kiến trúc, bài toán đa luồng):**
   - **Claude Sonnet 5.5** hoàn toàn đủ trình làm việc khó (SWE-bench Pro 81.3%, Terminal-Bench 4.0 đạt 70.6% vượt Opus 5.5), là giải pháp kinh tế nhất để chia tải cho Opus.
   - **DeepSeek V4.1 Flash** (bật Max Reasoning) và **MiniMax M3.1 Flash** giải quyết rất tốt các bài toán logic repo độc lập (DeepSWE 74%–77%), nhưng cần người điều phối giao spec rõ ràng, không nên để tự quy hoạch kiến trúc toàn cục.
2. **Về khả năng "kiểm thử giao diện GUI" (CDP, WebView2, Edge headless, Desktop app):**
   - **MiniMax M3.1 Flash** là "ngựa chiến" bất ngờ cho GUI testing: đạt **61.7% trên OSWorld 2.0** (cao hơn Gemini 3.8 Flash 59.0%), vượt xa kỳ vọng của một model giá rẻ $0.15/1M token.
   - **Gemini 3.8 Flash** xử lý screenshot nhanh và tốt (59.0% OSWorld 2.0).
   - **DeepSeek V4.1 Flash** **KHÔNG nên** dùng cho kiểm thử GUI vì hãng không công bố và không tối ưu cho benchmark tương tác OS.
   - Khi cần kiểm thử kịch bản GUI phức tạp có rẽ nhánh dài hạn, **Claude Sonnet 5.5 / Opus 5.5** (80%–81% OSWorld) vẫn là chốt chặn tin cậy nhất.

---

## 🎯 5 Dòng Kết Luận Phân Công Việc Cho Đội Sublix

1. **Claude Opus 5.5 (Tổng điều phối):** Giữ vai trò Kiến trúc sư trưởng — chỉ giao việc quy hoạch kiến trúc đa tầng (Tauri + Rust + React), giải quyết bài toán suy luận hóc búa, thiết kế spec và rà soát an toàn hệ thống (tuyệt đối không lãng phí token vào việc gõ code đơn thuần hay gõ test).
2. **Claude Sonnet 5.5 (Thợ cao cấp — Việc khó):** Giao các tác vụ refactor module nặng (>300 dòng), đồng bộ luồng âm thanh/video đa kênh, xử lý pipeline ffmpeg/amix phức tạp và các bài toán terminal tương tác dòng lệnh sâu (tận dụng điểm số kỷ lục 70.6% Terminal-Bench 4.0).
3. **MiniMax M3.1 Flash / mcode (Thợ chính — Code theo spec & Kiểm thử GUI):** Giao toàn bộ việc code tính năng theo spec chi tiết hằng ngày, viết component UI và **chịu trách nhiệm chính việc kiểm thử GUI qua CDP / chụp màn hình** (OSWorld 2.0 đạt 61.7% cao nhất nhóm Flash), tiết kiệm chi phí tối đa ($0.15 / 1M token).
4. **DeepSeek V4.1 Flash / OpenCode free & CommandCode (Thợ thuật toán & Fix bug logic):** Giao việc viết unit test Rust/TypeScript, vá các lỗi thuật toán/parsing biệt lập, đo đạc regex/tokenizer (tận dụng điểm LiveCodeBench 91.6% và DeepSWE 77.0%), khai thác triệt để gói OpenCode Free không tốn ngân sách.
5. **Gemini 3.8 Flash (Nghiên cứu & Web Agent):** Giao các tác vụ nghiên cứu công nghệ mới, tổng hợp tài liệu thư viện bên thứ ba, tra cứu web đa nguồn (tận dụng Google Grounding) và xử lý khối lượng context tài liệu khổng lồ với tốc độ chớp nhoáng (130–150 tok/s).
