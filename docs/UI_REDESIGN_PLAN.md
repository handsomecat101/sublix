# KẾ HOẠCH THIẾT KẾ LẠI GIAO DIỆN SUBLIX — VÒNG 1 (khảo sát + thiết kế + mockup)

**Task:** `TSK-UI-REDESIGN-P1` · **Người làm:** Claude Opus 5.5 (Orca worker) · **Ngày:** 2026-10-24
**Phạm vi vòng 1:** chỉ khảo sát, thiết kế, mockup. **Không sửa** `src/**`, `src-tauri/**`.
**Phản hồi gốc của PO (anh Tuấn):** *"tab Studio panel bên trái nhìn chi chít option quá, không khoa học, có một số cái trùng lặp lắm; tab Download nhìn cũng kiểu gì ấy, không khoa học mà không đẹp."*

**Ràng buộc giữ nguyên:** Zero-Button UX (không sinh nút thừa — gom vào control có sẵn, chuột phải, phím tắt) · ngôn ngữ thiết kế Cinema Dark hiện tại (token `--t1 --ac --line …` trong `src/App.css`) · tiếng Việt có dấu, rõ nghĩa · triết lý *"Thuật toán vẽ nháp, con người tinh chỉnh"* và *timeline là trung tâm* (`agent-team/TAM_NHIN_SUBLIX_STUDIO.md`).

---

## 0. TÓM TẮT 30 GIÂY

| Hạng mục | Trước (đo thật) | Sau (thiết kế) |
|---|---|---|
| Control trong panel trái Studio (1 vai, bật dịch) | **45** control tương tác (+9 khi có 2 vai) | **20** hiện sẵn + 3 trong "Nâng cao" (**−56 %**) |
| Chiều cao nội dung panel trái so với phần nhìn thấy (màn 1920×1080) | **1687 px nội dung / 405 px nhìn thấy** → chỉ thấy **24 %**, phải cuộn 4 màn | Vừa 1 màn (accordion mở 1 bước/lần, nút chạy dính đáy) |
| Nút "chạy" trong panel trái | **6** nút (2× Quét & Phân vai, 2× Lồng tiếng, 1× Chỉ tạo phụ đề, 1× A→Z) + 2 nút Dừng | **1** nút tách (split button) `▶ Chạy N bước đã bật ▾` + biểu tượng `▶` nhỏ trên tiêu đề từng bước |
| Nhóm chức năng trùng lặp đã xác minh (cả app) | **18** nhóm (§3) | 0 — mỗi chức năng còn 1 chỗ chính + phím tắt/chuột phải |
| Tab Tải video (trạng thái rỗng) | 16 control + 3 cột, cột phải toàn thông tin tĩnh | 6 control + 1 cột, ô nhập + nút chính nổi bật, danh sách dạng hàng có trạng thái rõ |
| Nguồn cấu hình dịch | **2 nơi, 2 danh sách khác nhau** (Studio 5 nhà cung cấp + ô API key; Cài đặt 3 nhà cung cấp) | **1 nơi** (Cài đặt › Dịch thuật); Studio chỉ hiện tên + liên kết "Đổi" |

Ảnh trước/sau: `docs/ui-mockups/shots/compare-studio.png`, `compare-tai-video.png`, `compare-cai-dat.png`. Mockup HTML: `docs/ui-mockups/studio.html`, `tai-video.html`, `cai-dat.html`.

---

## 1. CÁCH KHẢO SÁT (bằng chứng thật, không đoán)

- Chạy **instance app riêng**: bản sao `src-tauri/target/debug/sublix.exe` → vá chuỗi `localhost:1420` → `localhost:1423` (cùng độ dài, 1 chỗ), `npx vite --port 1423 --strictPort`, `WEBVIEW2_USER_DATA_FOLDER` riêng (scratchpad), `--remote-debugging-port=9225`; lái bằng CDP (Node 24 WebSocket). **Không đụng** app PO (9223/1420) — đã kiểm tra cổng 9223/1420 vẫn sống sau khi tắt instance riêng.
- Viewport đúng **1920×1080** (`Emulation.setDeviceMetricsOverride`). Trạng thái "có phụ đề": nạp `A2Z_TEST_EN_dubbed.mp4` bằng sự kiện `tauri://drag-drop` rồi bấm *Chỉ Tạo Phụ Đề Gốc* → app tự dùng file `.vi.srt` có sẵn → **8 câu thật** trên timeline.
- Trạng thái "có hàng đợi" tab Tải video: tải thật 1 link (file đã có sẵn trên đĩa nên chỉ đọc lại) → 1 mục *Đang tải* + 1 mục *Hoàn thành*.
- Đếm chiều cao: `.studio-steps-body` `scrollHeight = 1687`, `clientHeight = 405` (đo bằng CDP ở 1920×1080, khi đã bật 2 thẻ).
- Số dòng `file:dòng` đọc lúc 2026-10-24 ~18:00 trên cây làm việc. **`SublixStudioView.tsx` đang được mcode sửa song song** → số dòng có thể lệch vài chục dòng; tìm theo tên class/nhãn trong bảng nếu lệch.

| Ảnh "trước" (`docs/ui-mockups/shots/`) | Nội dung |
|---|---|
| `before-01a-studio-chua-mo-video.png` | Studio rỗng |
| `before-01b-studio-co-phu-de.png` | Studio đã mở video, 8 câu phụ đề |
| `before-01c-studio-panel-trai-toan-bo.png` | **Toàn bộ** panel trái (chụp ở viewport cao 3000 px) — thấy rõ độ dài |
| `before-02-tai-video-rong.png` / `before-02b-tai-video-hang-doi.png` | Tải video rỗng / có hàng đợi |
| `before-03-live.png`, `before-04-lich-su.png`, `before-05-tien-trinh.png`, `before-06-cai-dat.png`, `before-06b-cai-dat-ai-dich.png` | 4 tab còn lại |

---

## 2. KIỂM KÊ CONTROL

Tần suất dự kiến: **Cao** = mỗi video · **TB** = vài video/lần · **Thấp** = thiết lập 1 lần · **Hiếm**. Cột **Quyết định**: Giữ / Gộp / Chuyển / Bỏ (lý do ở §4).

### 2.1 Studio — thanh trên (topbar riêng của Studio)

| # | Control | file:dòng | Chức năng | Tần suất | Quyết định |
|---|---|---|---|---|---|
| T1 | 6 tab master | `SublixStudioView.tsx:5582-5631` | Chuyển tab | Cao | **Gộp** thành 1 topbar dùng chung (đang có 2 bản: Studio + `SettingsView.tsx:1281-1426`, khác nhau, Studio thiếu badge) |
| T2 | "📥 Nhập video Ctrl+I" | `:5652` | `handlePickMediaFile` | TB | **Bỏ** — trùng T5 |
| T3 | Chip tên file + ✕ | `:5675-5686` | Hiện file, đóng video | TB | Giữ (thêm thời lượng) |
| T4 | Hoàn tác | `:5691` | `handleUndo` | Cao | Giữ; chuột phải = chọn lớp (Audio/Bản dịch/Phụ đề) thay 3 chip H1-H3 |
| T5 | 4 chấm đổi theme | `:5700-5715` | Đổi theme | Hiếm | **Chuyển** sang Cài đặt › Chủ đề |
| T6 | "＋ Mở video" | `:5717` | `handlePickMediaFile` | TB | Giữ (kèm nhãn `Ctrl+I`) |
| T7 | "Xuất video" | `:5726` | Mở modal xuất | Cao | Giữ — là nút chính duy nhất của thanh trên |

### 2.2 Studio — panel trái (đầy đủ)

| # | Control (nhãn hiển thị) | file:dòng | Chức năng | Tần suất | Quyết định |
|---|---|---|---|---|---|
| L1 | Tab "⚡ Thuyết Minh & Lồng Tiếng" | `:5744` | Chọn chế độ panel | — | **Bỏ** (chỉ còn 1 chế độ) |
| L2 | Tab "📑 Tóm Tắt & Review" | `:5751` | Thống kê + chấm điểm heuristic | Hiếm | **Bỏ tab** — thống kê lên đầu danh sách phụ đề (phải), kiểm tra chất lượng thành chip lọc ("Chưa dịch", "Thiếu tiếng", "Câu >12s"); Tóm tắt/Review thật là GĐ6, mở lại khi có tính năng |
| L3 | Checkbox bật/tắt "Phụ Đề & Dịch Thuật" | `:5772` | `workflowOptStt` | TB | Giữ, đổi thành công tắc trên tiêu đề bước **Phụ đề** |
| L4 | Tiêu đề thẻ (bấm để gấp) + trạng thái "8 câu • AUTO (Gốc)" + badge nguồn | `:5767-5812` | Gấp/mở, tóm tắt | Cao | Giữ; trạng thái 1 dòng (đang bị bẻ 4 dòng ở 340 px) |
| L5 | Select "Ngôn ngữ gốc của video" | `:5823` | `sttLang` | TB | Giữ (cơ bản) |
| L6 | Select "Mô hình nhận dạng" | `:5838` | `sttModel` (2 lựa chọn) | Thấp | **Chuyển** vào "Nâng cao"; mặc định lấy theo preset Cài đặt. Nhãn "GPU Siêu Nhanh" sai trên máy không NVIDIA |
| L7 | Công tắc "📥 Tận dụng phụ đề đã tải (nếu có)" | `:5861` | `preferExistingSrt` | Thấp | Giữ nhưng **chỉ hiện khi thật sự có file .srt** (đang luôn hiện) |
| L8 | Công tắc "Dịch phụ đề sang ngôn ngữ khác" | `:5880` | `workflowOptTranslate` | TB | **Tách** thành bước **Dịch** riêng có công tắc ở tiêu đề |
| L9 | Select "Ngôn ngữ đích" (lưu config ngay) | `:5894` | `targetLang` | TB | Giữ trong bước Dịch |
| L10 | Select "Nhà cung cấp AI dịch" (5 lựa chọn) | `:5922` | `transProvider` + lưu config | Thấp | **Chuyển** sang Cài đặt › Dịch thuật; Studio chỉ hiện "Ollama · qwen2.5:3b — Đổi" |
| L11 | Select "Model DeepSeek/OpenRouter/MiniMax" | `:5944`, `:5972`, `:6005` | Model theo provider | Thấp | **Chuyển** (như L10) |
| L12 | Ô "API Key" (password) | `:5955`, `:5988`, `:6016` | Key theo provider | Thấp (1 lần) | **Chuyển** (như L10) — key không nên nằm ở màn làm việc |
| L13 | Select "Phong cách dịch" | `:6030` | `transStyle` | TB | Giữ → segmented 3 lựa chọn trong bước Dịch |
| L14 | Nút "Lưu hồ sơ" | `:6045` | Lưu glossary vào config | Thấp | **Bỏ nút** — tự lưu khi thêm/xoá cặp |
| L15 | Chip cặp xưng hô + ✕ | `:6068-6088` | Xoá 1 cặp | Thấp | Giữ, trong "Nâng cao › Hồ sơ phim" |
| L16 | Ô nhập "Cặp tên / xưng hô" | `:6091` | Thêm cặp (Enter) | Thấp | Giữ (Nâng cao) |
| L17 | Nút "+ Thêm" | `:6106` | Thêm cặp | Thấp | **Bỏ** — Enter đã làm việc này |
| L18 | Nút "💬 Chỉ Tạo Phụ Đề + Dịch / Gốc" | `:6128` | STT (+ dịch) | TB | **Gộp** vào menu `▾` của nút Chạy + `▶` trên tiêu đề bước |
| L19 | Checkbox bật/tắt "Lồng Tiếng & Phân Vai" | `:6170` | `workflowOptVoice` | TB | Giữ, công tắc trên tiêu đề bước **Lồng tiếng** |
| L20 | Tiêu đề thẻ 2 + "N vai diễn" | `:6165-6192` | Gấp/mở | Cao | Giữ |
| L21-23 | Chip số người "👤 1 Người ⭐ / 👥 2 Người / 🤖 Tự động" | `:6207`, `:6221`, `:6232` | `expectedSpeakerCount`; **chip "1 Người" còn gộp ngay mọi vai (phá huỷ)** | TB | Giữ dạng segmented `Tự động · 1 người · 2 người`; **bỏ hành vi gộp ngầm** (gộp chỉ qua chuột phải vai, có Hoàn tác) |
| L24-26 | Chip tổ hợp giới tính "1 Nam & 1 Nữ / 2 Nam / 2 Nữ" (khi chọn 2 người) | `:6246-6269` | Gán giới tính 2 vai | Thấp | **Bỏ** — mỗi hàng vai đã có nút giới tính (L33) cho cùng kết quả |
| L27 | "🔍 Bước 1: Quét & Phân Vai Trước (Chưa Lồng Tiếng)" | `:6277` | `handleRunAnalysis(false,false)` | TB | **Bỏ** — trùng L40 |
| L28 | "🛑 Dừng" (khi đang chạy) | `:6297` | `handleCancelAnalysis` | — | **Bỏ** — trùng L42; nút Chạy tự đổi thành "■ Dừng" |
| L29 | "Thêm vai" | `:6323` | Thêm 1 vai | Thấp | Giữ dạng hàng "＋ Thêm vai" cuối danh sách vai |
| L30 | "Gộp vai..." (mở modal) | `:6347` | Gộp vai A→B | Thấp | **Chuyển** vào chuột phải trên hàng vai: "Gộp vào ▸ [vai]" |
| L31 | "👤 Về 1 vai" (khi >1 vai) | `:6365` | `handleQuickMergeToOneRole` | Thấp | **Bỏ** — trùng L21; vào chuột phải "Gộp tất cả về vai này" |
| L32 | "⚡ Về 2 vai" (khi >2 vai) | `:6376` | `handleQuickMergeToTwoRoles` | Thấp | **Chuyển** vào chuột phải danh sách vai |
| — | Khối "🤖 Mô Hình Động Cơ TTS" (tiêu đề + đếm giọng) | `:6393-6401` | Hiển thị | — | **Bỏ** — trùng thông tin |
| L33-35 | 3 thẻ engine "VietNeu / Kokoro / Edge" | `:6412` | `handleSelectTtsEngine` | Thấp | Giữ dạng segmented 3 lựa chọn |
| L36-38 | 3 nút "▶️ Mẫu" trên từng thẻ engine | `:6425` | Nghe mẫu engine | Hiếm | **Gộp** thành 1 biểu tượng ▶ trong ô engine đang chọn |
| L39 | "▶️ Nghe Thử Mẫu Tiêu Biểu (VietNeu AI)" | `:6473` | Nghe mẫu engine đang chọn | Hiếm | **Bỏ** — trùng L36 |
| — | Badge spec engine (Neural v2, tốc độ, MB, số giọng) + mô tả | `:6456-6471` | Hiển thị | — | **Chuyển** vào tooltip của ô engine |
| L39b | "✨ Áp dụng VietNeu cho tất cả vai" | `:6488` | Gán giọng mặc định cho mọi vai | Thấp | **Bỏ nút** — đổi engine thì tự gán giọng mặc định cho vai có giọng không thuộc engine mới (hành vi hiện tại đã fallback ở `:6570-6574`); thêm vào chuột phải ô engine |
| — | HUD "🤖 Model TTS Đang Dùng" + chip vai:giọng | `:6504-6530` | Hiển thị | — | **Bỏ** — lặp lại thẻ engine + select giọng từng vai |
| L33' | Ô tên vai (mỗi vai) | `:6540` | Đổi tên | TB | Giữ |
| L34' | Nút giới tính "👨 Nam / 👩 Nữ" (mỗi vai) | `:6555` | Đổi giới tính + giọng | TB | Giữ (nhỏ hơn) |
| L35' | Select giọng (mỗi vai) | `:6568` | Gán giọng | Cao | Giữ |
| L36' | "🔊 Giọng gốc" (mỗi vai) | `:6592` | Nghe clip gốc | Thấp | **Chuyển** vào chuột phải hàng vai (+ phím `Space` khi hàng đang chọn) |
| L37' | "▶ Nghe thử" (mỗi vai) | `:6600` | Nghe giọng gán | TB | Giữ dạng biểu tượng ▶ cạnh select |
| L38' | 🗑 Xoá vai (khi >1 vai) | `:6625` | Xoá vai | Hiếm | **Chuyển** vào chuột phải + phím `Del` |
| L40' | "🎙️ Bước 2: Bắt Đầu Lồng Tiếng TTS (N vai)" | `:6641` | `handleRunVoiceOnly` | TB | **Bỏ** — trùng L41 |
| — | Thanh "🎯 Vùng chọn … ☐ Chỉ vùng này" (khi có In/Out) | `:6786-6806` | `useRangeOnly` | TB | **Gộp** vào menu `▾` của nút Chạy: "Chỉ vùng In–Out (00:12→00:30)" |
| — | Pill "⚡ Chế độ: Toàn trình …" | `:6811-6821` | Hiển thị chế độ | — | **Bỏ** — nhãn nút Chạy nói luôn "Chạy 3 bước đã bật" |
| L40 | "🔍 1. Quét & Phân Vai" | `:6827` | `handleRunAnalysis(false,false)` | TB | **Gộp** vào `▶` của bước Phụ đề + menu `▾` |
| L41 | "🎙️ 2. Lồng Tiếng TTS" | `:6846` | `handleRunVoiceOnly` | TB | **Gộp** vào `▶` của bước Lồng tiếng + menu `▾` |
| L42 | "⚡ Chạy Tự Động Toàn Trình (A ➔ Z)" | `:6869` | `handleRunCustomWorkflow` | Cao | **Giữ — nút chính duy nhất**, dạng split `▶ Chạy N bước đã bật ▾`, `Ctrl+Enter` |
| L43 | "🛑 Dừng" | `:6884` | `handleCancelAnalysis` | — | Gộp vào chính nút Chạy (đổi trạng thái) + `Esc` |
| H1-H3 | Chip "↶ Audio / ↶ Bản dịch / ↶ Phụ đề" | `:6911-6913` | 3 lớp hoàn tác | Thấp | **Bỏ** — chuột phải nút Hoàn tác T4 hiện 3 lớp; `Ctrl+Z` giữ nguyên |

**Đếm "trước"** (1 vai, bật dịch, provider DeepSeek — đúng trạng thái mặc định khi mở app): 2 tab + 2 tiêu đề/checkbox thẻ 1 + 3 (L5-L7) + 1 (L8) + 4 (L9-L12) + 1 (L13) + 3 (L14, L16, L17) + 1 (L18) + 2 tiêu đề/checkbox thẻ 2 + 3 (L21-23) + 1 (L27) + 2 (L29-L30) + 6 (L33-38) + 2 (L39, L39b) + 5 (1 hàng vai) + 1 (L40') + 3 (L40-L42) + 3 (H1-H3) = **45**. Với 2 vai: +5 hàng vai +3 chip giới tính +1 "Về 1 vai" = **54**.

### 2.3 Tab Tải video

| # | Control | file:dòng | Chức năng | Tần suất | Quyết định |
|---|---|---|---|---|---|
| D1 | Tag nền tảng ("Web Video"/"YouTube") trong ô nhập | `DownloaderView.tsx:1058` | Hiển thị nền tảng nhận ra | — | Giữ nhưng **gắn theo từng dòng link** (hiện trông như 1 tab bấm được → gây nhầm) |
| D2 | Textarea link (Enter = kiểm tra) | `:1064` | Nhập 1..n link | Cao | Giữ, to hơn, **Enter = Tải** |
| D3 | "📋 Dán Link" / "✕" | `:1084-1107` | Dán clipboard / xoá | TB | **Bỏ** "Dán Link" (Ctrl+V); ✕ giữ dạng biểu tượng |
| D4 | "🔍 Kiểm Tra Link" | `:1110` | Đọc metadata / mở playlist | TB | **Bỏ nút** — tự đọc khi dán (debounce 600 ms); playlist tự mở bộ chọn |
| D5 | Thẻ xem trước video (ảnh + tiêu đề) | `:1141-1181` | Hiển thị | — | Giữ, nhưng hiện ngay dưới ô nhập (1 dòng gọn) |
| D6 | Bộ chọn playlist (Chọn hết/Bỏ chọn/checkbox) | `:1134` → `DownloaderBatchPicker.tsx` | Chọn mục | TB | Giữ, dạng dải ngang gấp được |
| D7 | Select "Chất lượng / định dạng" (9 lựa chọn) | `:1187` | `format` | TB | Giữ → chip "Chất lượng: Cao nhất ▾" |
| D8 | Select "Trình duyệt lấy Cookies" (4) | `:1199` | `browserCookie` — nhãn tự ghi "thử nghiệm — hay bị chặn" | Hiếm | **Chuyển** vào "⚙ Nâng cao" |
| D9 | Checkbox "Tự động trích xuất phụ đề (.srt)" | `:1208` | `extractSubtitles` | TB | Giữ → chip "Phụ đề: Tắt / Tự tải nếu có ▾" |
| D10-12 | 3 checkbox reup (metadata, chống trùng, thumbnail) | `:1224`, `:1232`, `:1240` | Cờ yt-dlp | Hiếm | **Chuyển** vào "⚙ Nâng cao" (chip hiện số đang bật) |
| D13-14 | 2 ô "Chỉ tải đoạn" từ/đến | `:1250`, `:1258` | `--download-sections` | Hiếm | **Chuyển** vào "⚙ Nâng cao" |
| D15 | "Bắt Đầu Tải Video Ngay" | `:1274` | Bắt đầu | Cao | Giữ — **đưa lên cạnh ô nhập**, to, đổi nhãn theo số link ("Tải 3 link") |
| D16-18 | Tab lọc "Tất Cả / Đang Tải / Hoàn Thành" | `:1312-1332` | Lọc | TB | Giữ + thêm "Đang đợi", "Lỗi" (đang có trạng thái nhưng không lọc được) |
| D19 | "Dọn Lịch Sử" | `:1336` | Xoá mục đã xong | Thấp | **Chuyển** vào menu `⋯` đầu danh sách |
| D20 | "📋 Copy link" (mỗi mục) | `:1400` | Copy URL | Thấp | **Chuyển** vào `⋯`/chuột phải + `Ctrl+C` |
| D21-24 | "Tạm dừng / Tiếp tục / Hủy bỏ / Thử lại" | `:1477-1518` | Điều khiển tải | TB | Giữ — **1 nút theo trạng thái** + Huỷ trong `⋯` |
| D25 | "🚀 Xem Trong Studio" | `:1548` | Mở Studio | Cao | Giữ — nút chính của mục đã xong ("🎬 Mở trong Studio") |
| D26 | "🖥️ Player Ngoài" | `:1564` | Mở trình phát Windows | Thấp | **Chuyển** vào `⋯` |
| D27 | "Mở Thư Mục" (mỗi mục) | `:1577` | Hiện file trong Explorer | Thấp | **Chuyển** vào `⋯` |
| D28 | "📝 Tải phụ đề / Tải lại phụ đề" | `:1586` | Sub-pass riêng | Thấp | **Chuyển** vào `⋯` (chip "Phụ đề: chưa có" bấm được cũng gọi lệnh này) |
| D29 | 🗑 Xoá mục | `:1602` | Xoá khỏi danh sách | Thấp | **Chuyển** vào `⋯` + `Del` |
| D30 | Cột phải "Thư Mục Lưu Trữ" + "Mở Thư Mục" | `:1621-1641` | Hiện/mở thư mục | Thấp | **Chuyển** xuống thanh chân danh sách (1 dòng) |
| D31 | Cột phải "Nền Tảng Hỗ Trợ" (6 nền tảng, **đã lỗi thời** — backend nay có thêm IG/Twitch/Kick/…) | `:1643-1655` | Tĩnh | — | **Bỏ thẻ** — 1 dòng ở chân trang + tag nền tảng tự nhận |
| D32 | Cột phải "Lưu Ý Bản Quyền" | `:1657-1664` | Tĩnh | — | **Rút** thành 1 câu ở chân trang |

**Đếm "trước"** (trạng thái rỗng): 16 control (D2, D3, D4, D7, D8, D9, D10-12, D13-14, D15, D16-18, D30) + 3 cột. Mỗi mục đã tải xong: **6 nút** (D20, D25-D29). **Sau:** 6 control (ô nhập, nút Tải, 2 chip, "⚙ Nâng cao", ô lọc tên) + 5 tab lọc; mỗi mục **2** (nút chính theo trạng thái + `⋯`).

### 2.4 Bốn tab còn lại (ngắn)

| Tab | Control chính (file:dòng) | Vấn đề |
|---|---|---|
| **Live** | Select ngôn ngữ gốc `SettingsView.tsx:1491`, select "Chế độ xuất" `:1507`, select ngôn ngữ đích `:1521`, thanh trượt độ dài phân đoạn `:1539`, checkbox Smart VAD `:1559`, select thiết bị `:1565`, "Quét Âm Thanh" `:1623`, "Thử 3s" `:1649`, "Bắt Đầu Dịch Trực Tiếp Live" `:1768`, "Mở Cửa Sổ Overlay" `:1801` | "Chế độ xuất" + "Ngôn ngữ đích" là 2 select cho 1 ý ("dịch sang đâu / không dịch"); độ dài phân đoạn + VAD là tham số kỹ thuật hiếm chỉnh nhưng nằm ngang hàng; "Mở Cửa Sổ Overlay" trùng nút Overlay trên topbar |
| **Lịch sử** | Ô tìm, "Sao Chép Tất Cả" `:3170`, "Xuất File .SRT" `:3179`, "Xuất File .TXT" `:3188`, "Xoá Toàn Bộ Lịch Sử" `:3200` (đỏ, to, ngang hàng nút thường) | 3 cột cho 1 danh sách; nút xoá nguy hiểm nổi bật nhất màn hình; cột phải trống khi chưa chọn |
| **Tiến trình** | 6 nút lọc dọc `ProcessCenterView.tsx:167`, "Mở Thư Mục Thành Phẩm" `:285`, "Mở Thư Mục Tải Về" `:293`, "Xoá lịch sử tiến trình", thẻ "Động Cơ & Phần Cứng AI" `:559`, thẻ "Hướng Dẫn & Lưu Ý" `:587` | Thẻ phần cứng **ghi cứng "GPU CUDA / Whisper Large-v3 Turbo"** trong khi máy dùng CPU + Ollama iGPU → sai sự thật; nhãn lọc bị dính ký tự lạ ("Đang xử lýo", "Tải videoo" — thấy trong ảnh `before-05`); tab này **trùng** nút "📊 Tiến Trình (N)" trên topbar (mở modal ProcessCenter, `SettingsView.tsx:1377`) |
| **Cài đặt** | Danh mục 5 mục `SettingsView.tsx:1895`, thẻ "1-Click Presets Nhanh" `:1933`, lưới preset `:1979`, mục AI `:2105` (3 nhà cung cấp), STT `:2493`, Overlay `:2672`, Hub `:2845`, "Trạng Thái Hệ Thống" `:3061`, "Thao Tác Nhanh" `:3092` | Preset xuất hiện **2 lần trên cùng màn hình** (cột trái + giữa); ô nhập ở mục AI là ô trắng mặc định trình duyệt (lệch theme); nút "Lưu Cấu Hình" thủ công; "Ẩn Cửa Sổ Overlay" lặp lần thứ 3 |

---

## 3. DANH SÁCH TRÙNG LẶP ĐÃ XÁC MINH (đọc code + thấy trên ảnh)

| Mã | Chức năng | Xuất hiện ở | Cách xác minh |
|---|---|---|---|
| **TL-01** | Quét & phân vai | `SublixStudioView.tsx:6277` **và** `:6827` | Cùng gọi `handleRunAnalysis(false, false)` |
| **TL-02** | Lồng tiếng TTS | `:6641` **và** `:6846` | Cùng gọi `handleRunVoiceOnly()` |
| **TL-03** | Dừng xử lý | `:6297` **và** `:6884` | Cùng gọi `handleCancelAnalysis` |
| **TL-04** | Nghe mẫu engine TTS | `:6425` (trên thẻ) **và** `:6473` (nút to) | Cùng gọi `handlePreviewEngineSample(engine)` với engine đang chọn |
| **TL-05** | Hiển thị engine/giọng đang dùng | Tiêu đề thẻ engine `:6395-6400`, badge spec `:6456`, HUD `:6504-6530`, select giọng mỗi vai `:6568` | 4 chỗ cùng hiện tên engine/giọng |
| **TL-06** | Gộp về 1 vai | Chip "1 Người ⭐" `:6207` (gọi `handleQuickMergeToOneRole` khi >1 vai) **và** "Về 1 vai" `:6365` | Cùng handler |
| **TL-07** | Gán giới tính 2 vai | Chip tổ hợp `:6246-6269` **và** nút giới tính từng vai `:6555` | Cùng kết quả cuối |
| **TL-08** | Hoàn tác | Nút topbar `:5691` + 3 chip `:6911-6913` + `Ctrl+Z` | 4 lối vào |
| **TL-09** | Mở video | "Nhập video" `:5652` + "Mở video" `:5717` + vùng thả giữa | Cùng `handlePickMediaFile` |
| **TL-10** | Chạy chỉ phụ đề | "Chỉ Tạo Phụ Đề" `:6128` + "1. Quét & Phân Vai" `:6827` (STT là bước đầu của phân tích) | Hai nút gần như cùng việc, người dùng không phân biệt được |
| **TL-11** | Cấu hình nhà cung cấp dịch + API key | Studio `:5922-6026` (5 provider) **và** Cài đặt `SettingsView.tsx:2105` (3 provider) | **2 danh sách khác nhau** → nguồn sự thật kép |
| **TL-12** | Mô hình nhận dạng | Studio `:5838` + Cài đặt STT `:2493` + preset | 3 chỗ |
| **TL-13** | Đổi theme | Topbar Studio `:5700` + topbar tab khác `SettingsView.tsx:1390` | 2 bản code giống nhau |
| **TL-14** | Tiến trình nền | Tab "Tiến trình" + nút "📊 Tiến Trình (N)" `SettingsView.tsx:1377` (modal) | Cùng dữ liệu, 2 giao diện; nút còn bị bẻ 3 dòng (ảnh `before-02`) |
| **TL-15** | Preset phần cứng | Cột trái `SettingsView.tsx:1933` + lưới `:1979` | Cùng `applyHardwarePreset` |
| **TL-16** | Bật/tắt overlay | Topbar `SettingsView.tsx:1407` + Live `:1801` + Cài đặt "Thao Tác Nhanh" `:3092` | 3 chỗ + `Ctrl+Shift+O` |
| **TL-17** | Mở thư mục tải về | Tải video cột phải `DownloaderView.tsx:1625` + Tiến trình `ProcessCenterView.tsx:293` | Cùng mục đích |
| **TL-18** | Hai topbar khác nhau | `SublixStudioView.tsx:5572` và `SettingsView.tsx:1281` | Studio thiếu badge "đang tải/LIVE/tiến trình", tab khác thiếu Hoàn tác/Xuất — chuyển tab thì thanh trên "nhảy" |

### Control gây nhầm / lỗi hiển thị phát hiện khi khảo sát

1. **"👤 1 Người ⭐" phá huỷ ngầm** — bấm chip *chọn số người* nhưng thực tế **gộp ngay mọi vai** (`:6211-6214`). Người dùng nghĩ đang đặt tuỳ chọn.
2. **Badge "YouTube (.vi)"** hiện cho **mọi** file `.srt` (ảnh `before-01b`: file `.vi.srt` do chính Sublix xuất vẫn bị gọi là YouTube).
3. **Nhãn sai phần cứng**: "Whisper Large-v3-Turbo (GPU Siêu Nhanh)" (Studio) và thẻ "GPU CUDA" (Tiến trình) trên máy không có NVIDIA.
4. **Provider mặc định "★ DeepSeek Khuyên Dùng"** trong Studio trong khi config đang là Ollama và máy không có key nào.
5. **3 kiểu số bước chồng nhau**: "1./2." (tiêu đề con), "Bước 1/Bước 2" (nút trong thẻ), "1./2." (nút dưới đáy) — không khớp nhau.
6. **3 màu nút chạy** (tím `#c084fc`, cam `#f59e0b`, xanh `#38bdf8`) + 1 nút gradient — không có thứ bậc, mắt không biết nút nào là chính.
7. Tiêu đề thẻ 1 bị bẻ 4 dòng ở độ rộng 340 px ("8 câu / • / AUTO / (Gốc)"); tên track "TIẾNG LÒ…" bị cắt.
8. Tab Tải video: tag "Web Video" nằm trong ô nhập trông như tab bấm được; thẻ "Nền Tảng Hỗ Trợ" lỗi thời.
9. Lỗi chính tả: "📊 Thống **K** Nhịp Thoại" (`:6669`).
10. *(Ghi chú khảo sát, chưa kết luận là lỗi app)*: trên instance riêng, dán 4 link rồi bấm Tải ngay chỉ tạo 1 mục gộp chuỗi 4 URL — do `downloader_parse_urls` có thể chưa có trong bản `sublix.exe` debug cũ mà tôi sao chép; cần CommandCode kiểm tra lại trên build mới.

---

## 4. THIẾT KẾ MỚI

### 4.1 Nguyên tắc áp dụng

1. **Một chức năng — một chỗ chính.** Lối vào phụ chỉ là phím tắt hoặc chuột phải (đúng Zero-Button UX).
2. **Theo đúng quy trình người làm:** *Nguồn → Phụ đề → Dịch → Lồng tiếng → Xuất*; số thứ tự hiển thị đồng nhất ở mọi chỗ.
3. **Hiện dần (progressive disclosure):** cơ bản hiện sẵn; tham số "thiết lập 1 lần" vào *Nâng cao* (gấp) hoặc *Cài đặt*.
4. **Mặc định hợp lý** lấy từ preset Cài đặt → bớt chọn lựa ở màn làm việc.
5. **Một nút chính/màn hình** (gradient `--grad-ac`); còn lại là nút phụ trung tính. Màu bước (xanh/tím/cam) chỉ dùng cho **số bước**, không dùng cho nút.
6. **Không đổi phong cách:** dùng nguyên token Cinema Dark (`--bg --bg-side --bg-card --line --t1..t4 --ac --grad-ac --ok --dang`, font `Segoe UI Variable Display` + `Cascadia Mono`). 3 màu bước đang có (`#38bdf8 #a78bfa #f59e0b`) được gom thành token `--step-sub --step-tr --step-dub`.

### 4.2 Thanh trên dùng chung (cả 6 tab)

`[Logo SUBLIX STUDIO v…] [6 tab có badge] —— [vùng ngữ cảnh] —— [trạng thái] [↶] [👁] [nút ngữ cảnh]`

- **1 component** `MasterTopbar` thay 2 bản copy (TL-18). Badge giữ như hiện tại (⬇ N đang tải, LIVE, ⚡ N tiến trình) và **hiện cả ở Studio**.
- **Bỏ** nút "📊 Tiến Trình (N)" (TL-14): chip trạng thái "⚡ 2 tác vụ" bấm → sang tab Tiến trình.
- **Bỏ** 4 chấm theme khỏi topbar (TL-13) → Cài đặt › Chủ đề.
- Overlay: 1 biểu tượng 👁 (tooltip `Ctrl+Shift+O`) thay nút chữ "Ẩn Overlay" (TL-16).
- Vùng ngữ cảnh: Studio = chip tên file + thời lượng; Studio thêm `↶`, `＋ Mở video Ctrl+I`, nút chính **Xuất video**. Tab khác: không có nút chính trên topbar.

### 4.3 Studio — panel trái (mockup `studio.html`, ảnh `after-studio.png`)

```
┌ Thanh tiến độ: ✓Nguồn — ✓Phụ đề — ✓Dịch — ④Lồng tiếng — ⑤Xuất ┐  (bấm chấm = mở bước; ⑤ = mở modal Xuất)
├ [2] Phụ đề gốc   8 câu · EN · từ file .srt        [Xong] [công tắc] ›
├ [3] Dịch         → Tiếng Việt · Truyền cảm · Ollama [8/8] [công tắc] ›
├ [4] Lồng tiếng   2 vai · VietNeu                  ▶ [công tắc] ⌄   ← đang mở
│     Số người nói  [Tự động | 1 người | 2 người]
│     Bộ giọng đọc  [VietNeu ▶ | Kokoro | Edge (mạng)]
│     Vai & giọng   ● Người dẫn  ♂Nam 5 câu   [select giọng ▾][▶]
│                   ● Nhân vật 2 ♀Nữ  3 câu   [select giọng ▾][▶]
│                   ＋ Thêm vai                    (chuột phải vai: giọng gốc · gộp · xoá)
├ ⚙ Nâng cao       Mô hình nhận dạng · Hồ sơ phim (khoá xưng hô) ›
└ [▶ Chạy 3 bước đã bật | ▾]   Ctrl+Enter                    ← dính đáy panel
```

Nội dung khi mở từng bước:
- **Phụ đề gốc:** Ngôn ngữ gốc (mặc định *Tự động*); dòng "Dùng phụ đề có sẵn: vi (file .srt)" chỉ hiện khi có file; badge nguồn đúng sự thật ("File .srt", "YouTube", "AI nhận dạng").
- **Dịch:** Ngôn ngữ đích; Phong cách (segmented 3); dòng chỉ đọc "Nhà cung cấp: Ollama · qwen2.5:3b — **Đổi**" (mở Cài đặt › Dịch thuật).
- **Lồng tiếng:** như sơ đồ. Đổi engine → tự gán giọng mặc định cho vai có giọng không thuộc engine (thay nút "Áp dụng cho tất cả vai").
- **Nâng cao (gấp mặc định):** Mô hình nhận dạng (mặc định theo preset); Hồ sơ phim (chip + ô nhập, Enter để thêm, tự lưu).
- **Accordion một-bước-mở**: mở bước này thì bước kia gấp → panel luôn vừa 1 màn 1080p, không cuộn.
- **Nút chạy duy nhất (split button):** nhãn đổi theo công tắc ("Chạy 3 bước đã bật" / "Chạy Phụ đề + Dịch"…); `▾` mở menu *Chỉ phụ đề · Đến hết bước Dịch · Chỉ lồng tiếng · Chỉ vùng In–Out (khi có vùng)*; khi đang chạy, nút thành **"■ Dừng — {thông điệp tiến độ}"** (`Esc` cũng dừng). Mỗi tiêu đề bước có `▶` nhỏ (hiện khi rê chuột) = chạy riêng bước đó.
- **Tab "Tóm tắt & Review" bỏ**; thống kê (số câu, thời lượng, số vai, WPM) lên đầu cột phụ đề; kiểm tra chất lượng thành chip lọc *Chưa dịch / Thiếu tiếng / Câu >12s* — cùng hàng chip lọc theo vai đã có.

**Bảng thay đổi panel trái:**

| Thay đổi | Control liên quan | Lý do |
|---|---|---|
| Bỏ 2 tab đầu panel | L1, L2 | Chỉ 1 chế độ thật; Review là thống kê → đưa về cột phụ đề nơi người dùng đang nhìn |
| Tách "Phụ đề & Dịch" thành 2 bước | L3-L18 | Khớp quy trình 5 bước; bật/tắt dịch rõ ràng bằng công tắc tiêu đề |
| Gộp 6 nút chạy + 2 nút Dừng thành 1 split button | L18, L27, L28, L40', L40-L43 | TL-01/02/03/10; 1 nút chính có thứ bậc rõ |
| Chuyển provider/model/API key sang Cài đặt | L10-L12 | TL-11; thiết lập 1 lần; key không nằm ở màn làm việc |
| Chuyển mô hình nhận dạng + hồ sơ phim vào "Nâng cao" | L6, L14-L17 | Hiếm chỉnh; mặc định theo preset |
| Bỏ "Lưu hồ sơ", "+ Thêm" | L14, L17 | Tự lưu; Enter đã thêm |
| Gom engine TTS thành segmented + 1 nút nghe mẫu | L33-L39, khối spec, HUD | TL-04/05; giảm 4 khối hiển thị trùng còn 1 |
| Chuột phải trên hàng vai: Giọng gốc · Gộp vào ▸ · Gộp tất cả về vai này · Về 2 vai · Xoá | L30-L32, L36', L38' | TL-06; thao tác hiếm, không cần nút thường trực |
| Bỏ chip tổ hợp giới tính | L24-L26 | TL-07 |
| Bỏ hành vi gộp ngầm khi chọn "1 người" | L21 | Lỗi gây nhầm #1 |
| Bỏ 3 chip hoàn tác | H1-H3 | TL-08; chuột phải nút ↶ |
| Bỏ "Nhập video" ở topbar, bỏ chấm theme | T2, T5 | TL-09, TL-13 |

**Số control panel trái:** trước **45** (1 vai) / **54** (2 vai) → sau **20** hiện sẵn (1 vai: 3 công tắc bước + 3 `▶` bước + ngôn ngữ gốc + ngôn ngữ đích + phong cách + liên kết "Đổi" + số người + engine + ▶ mẫu + 4 control hàng vai + "＋ Thêm vai" + split button 2 phần) + 3 trong Nâng cao (mô hình, ô hồ sơ phim, chip xoá) → **−56 %**; 2 vai: 24 hiện sẵn.

### 4.4 Tải video (mockup `tai-video.html`, ảnh `after-tai-video.png`)

```
┌ [ô nhập nhiều dòng — mỗi dòng có tag nền tảng tự nhận]          ] [⬇ Tải 3 link  Enter] ┐
│ [Chất lượng: Cao nhất ▾] [Phụ đề: Tự tải nếu có ▾] [⚙ Nâng cao (1 đang bật)]          │
│ (bộ chọn playlist gọn, chỉ hiện khi có playlist)                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
 [Tất cả 5] [Đang tải 2] [Đang đợi 1] [Xong 1] [Lỗi 1]                 [🔍 lọc tên] [⋯]
 ┌ ảnh │ tiêu đề · nền tảng · chất lượng · phụ đề · link     │ thanh tiến độ % · tốc độ · còn │ [nút theo trạng thái] [⋯] ┐
 ...
 📁 Lưu vào C:\…\downloads  Mở thư mục                         Hỗ trợ YouTube, TikTok, … · Chỉ tải nội dung bạn có quyền
```

| Thay đổi | Control | Lý do |
|---|---|---|
| Bỏ cột trái + cột phải → 1 cột rộng tối đa 1480 px, căn giữa | D30-D32 | Cột phải toàn thông tin tĩnh; cột trái 300 px làm ô link hẹp, URL bị bẻ dòng |
| Nút Tải to đặt **ngay cạnh** ô nhập, nhãn theo số link; Enter = tải | D2, D15 | Trước đây nút ở đáy cột trái, cách ô nhập ~600 px |
| Tự đọc link khi dán, bỏ nút "Kiểm Tra Link" + "Dán Link" | D3, D4 | 2 bước thừa; Ctrl+V là chuẩn |
| Tuỳ chọn thành chip 1 hàng; cookie + 3 cờ reup + cắt đoạn vào "⚙ Nâng cao" (popover, chip hiện số đang bật) | D7-D14 | 9 control → 3 chip; tuỳ chọn hiếm không chiếm chỗ |
| Danh sách dạng **hàng** (thumbnail 112×63, tiến độ thẳng cột) thay thẻ to | — | Quét mắt nhanh nhiều mục; trạng thái nằm cùng cột |
| Mỗi mục 1 nút chính theo trạng thái (Tạm dừng / Tiếp tục / Thử lại / **Mở trong Studio**) + `⋯`/chuột phải cho phần còn lại | D20-D29 | 6 nút → 2; thao tác hiếm vào menu, có phím tắt (Enter, Ctrl+C, Del) |
| Thêm lọc "Đang đợi", "Lỗi" | D16-D18 | Hàng đợi tối đa 3 song song đã có trạng thái `queued`/`error` nhưng không lọc được |
| Thông tin nền tảng + bản quyền xuống chân trang 1 dòng | D31-D32 | Giữ thông tin, bỏ 2 thẻ |

### 4.5 Live

- Gộp "Chế độ xuất" + "Ngôn ngữ đích" thành **1 select "Phụ đề hiển thị: Gốc / Dịch sang Tiếng Việt / …"**.
- Thiết bị âm thanh + "Thử 3s" giữ; "Quét Âm Thanh" thành biểu tượng ↻ cạnh select.
- Độ dài phân đoạn + Smart VAD → "⚙ Nâng cao" (gấp).
- Bỏ "Mở Cửa Sổ Overlay" (TL-16) — dùng 👁 trên topbar; nút chính duy nhất: **"▶ Bắt đầu Live"** (`Ctrl+Shift+L` đã có).
- Cột phải "Luồng thoại" giữ.

### 4.6 Lịch sử

- 2 cột: danh sách (có ô tìm + thanh công cụ trên đầu) | chi tiết câu. Bỏ cột trái 300 px chỉ chứa 4 nút.
- Thanh công cụ: `Sao chép tất cả` · `Xuất ▾ (SRT / TXT)` · `⋯ → Xoá toàn bộ lịch sử` (nút nguy hiểm vào menu + hộp xác nhận, hết nổi bật nhất màn hình).

### 4.7 Tiến trình

- Lọc thành chip ngang trên danh sách (Tất cả · Đang chạy · Phụ đề & Dịch · Lồng tiếng · Tải video · Mô hình) thay 6 nút dọc; sửa ký tự lạ ở nhãn.
- "Mở thư mục thành phẩm / tải về", "Xoá lịch sử tiến trình" → menu `⋯` đầu danh sách.
- **Bỏ** thẻ "Động Cơ & Phần Cứng AI" ghi cứng (sai sự thật) → thông tin thật ở Cài đặt › Trạng thái hệ thống; bỏ thẻ "Hướng dẫn & Lưu ý" (chuyển thành câu trong trạng thái rỗng).
- Bỏ modal ProcessCenter mở từ topbar (TL-14) — 1 giao diện duy nhất là tab này.

### 4.8 Cài đặt (mockup `cai-dat.html`, ảnh `after-cai-dat.png`)

- Danh mục nhóm lại: **Bắt đầu** (Cấu hình theo máy) · **Xử lý AI** (Nhận dạng · **Dịch thuật** · **Giọng đọc TTS** · Mô hình đã tải) · **Giao diện** (Overlay Live · **Chủ đề & ngôn ngữ**) · **Khác** (Nhật ký cập nhật).
- **Dịch thuật = nguồn sự thật duy nhất**: 5 thẻ nhà cung cấp (Ollama · MiniMax · DeepSeek · OpenRouter · GGUF) có trạng thái thật ("Đang dùng", "Chưa có key", "Bị Windows chặn" — BUG-H09) → hợp nhất danh sách 3 (Cài đặt) và 5 (Studio).
- Preset chỉ còn **1 chỗ** (TL-15); "Thao Tác Nhanh" tách về đúng mục (Mở thư mục mô hình → Mô hình đã tải; Overlay → topbar).
- Ô nhập dùng style theme (hết ô trắng); **tự lưu** khi đổi (bỏ "Lưu Cấu Hình"), giữ "Dịch thử".
- Mục mới **Giọng đọc (TTS)**: engine mặc định, nghe mẫu từng engine (nơi hợp lý cho các nút "▶ Mẫu" bị bỏ ở Studio), tải model.

### 4.9 Bảng tổng: trước/sau theo tab

| Tab | Trước | Sau |
|---|---|---|
| Topbar | 2 bản, 9–11 control | 1 bản, 7 control (Studio) / 4 (tab khác) |
| Studio panel trái | 45 (1 vai) | 20 + 3 nâng cao |
| Tải video (rỗng) | 16 + 3 cột | 6 + 5 tab lọc, 1 cột |
| Tải video / mỗi mục xong | 6 nút | 2 (nút chính + `⋯`) |
| Live | 10 | 6 + 2 nâng cao |
| Lịch sử | 5 nút, 3 cột | 3 control, 2 cột |
| Tiến trình | 9 nút + 2 thẻ tĩnh | 6 chip + `⋯` |
| Cài đặt | preset ×2, nhà cung cấp ×2 nơi | mỗi thứ 1 nơi |

### 4.10 Ô chọn giọng — `VoicePicker` (mockup `voice-picker.html`, ảnh `shots/voice-picker-all.png`)

*(Số mục là 4.10 vì §4.8 đã là Cài đặt.)* Thay `<select>` gốc ở hàng vai (`StudioVoiceStep.tsx:186`): danh sách xám của Windows, nhãn dài "VN • Adam bựa (VieNeu v3 — offline)", không tìm được, không nghe thử được.

**Bố cục**

```
Đóng:  [♂ Adam bựa ★ ········· ●VieNeu ▾] [▶]      ← ▶ ngoài ô = nghe 1 câu THẬT của vai (giữ nguyên)
Mở:    ┌ [⌕ Tìm giọng… (không cần dấu)      ✕] ┐  ← focus sẵn
       │ (Tất cả)(♂ Nam)(♀ Nữ)        25 giọng │
       │ ★ YÊU THÍCH                         3 │
       │ ✓ ♂ Adam bựa      ●Người dẫn  ▶  ★   │  ← dòng đang dùng: ✓ + chữ vàng; được chọn sẵn
       │   ♀ Ngọc Huyền    ●Nhân vật 2     ★   │  ← chip vai = giọng đang dùng ở vai khác
       │ TẤT CẢ ●VieNeu v3                  22 │
       │   ♀ Trúc Ly                    ▶  ☆   │  ← ▶ ☆ chỉ hiện khi hover / dòng đang chọn
       │ ↑↓ ↵ dùng · Ctrl+Space nghe · Esc  Quản lý › │
       └───────────────────────────────────────────┘
```

**Kích thước:** nút 28 px cao (bằng hàng vai cũ), cao chữ 12.5 px. Popover rộng `max(nút, 300)`, tối đa 360 px (Studio = 320), cao tối đa `min(440, chỗ trống)`; ô tìm 32 px · chip lọc 22 · tiêu đề nhóm 22 · dòng **32 px cố định** · chân 30. Nền `#1e1915`, viền `rgba(244,236,222,.13)`, bo 10, bóng `0 14px 40px rgba(0,0,0,.6)`. Render qua **portal** vào `body` (thoát `overflow` của panel); thiếu chỗ phía dưới thì **lật lên trên**, khi đó ô tìm ở sát nút (mockup ⑥).

**Thứ tự nhóm:** ★ Yêu thích (luôn đầu, cả khi đang tìm) → mỗi engine 1 nhóm (Studio chỉ có engine đang chọn; ★ của engine khác ẩn) → trong engine, tách nhóm ngôn ngữ **chỉ khi > 1 ngôn ngữ**. Giữ thứ tự backend trả về (đã tuyển), không sắp lại. Giọng ★ chỉ hiện **1 lần** (ở nhóm ★), không lặp lại trong nhóm engine.

**Quy tắc nhãn**

| Phần | Hiển thị |
|---|---|
| `VN •` | bỏ khỏi tên → tiêu đề nhóm ngôn ngữ (chỉ khi > 1 ngôn ngữ); Cài đặt: cột phụ `VN` mờ |
| tên | chữ chính, 1 dòng, cắt `…`, tooltip tên đủ |
| `(VieNeu v3 — offline)` | badge engine ngắn `VieNeu` với chấm xanh = offline / `☁` = cần mạng; tên đầy đủ "VieNeu v3 — offline" ở tiêu đề nhóm + tooltip badge |
| giới tính | ký hiệu ♂/♀ màu `--t3` trước tên (không chữ "Nam/Nữ" lặp mỗi dòng) |
| ★ | ở nút đóng: sau tên, màu `--ac`; trong danh sách: cột phải |

Tách nhãn bằng 1 hàm thuần `parseVoiceLabel(label) → { name, lang, engine, kind }` (có test); khi backend trả trường riêng (`name`, `lang`, `engine`) thì dùng thẳng, hàm parse chỉ là fallback.

**Hành vi**
- **Bấm dòng** = dùng giọng + đóng. **▶** = nghe mẫu, **không** đổi giọng, **không** đóng. **☆/★** = ghim, không đóng; dòng vừa ghim **ở yên chỗ cũ** tới lần mở sau (không nhảy dưới con trỏ).
- **Nghe mẫu:** 1 mẫu phát 1 lúc; bấm ▶ khác/đóng ô/bấm ra ngoài → dừng. Đang phát: dòng nền `--ac-soft`, nút ■, sóng nhỏ + `0:02 / 0:05` + thanh tiến độ 2 px ở đáy dòng. Chưa có mẫu: thay ▶ bằng vòng quay + "đang tạo mẫu…" (`--warn-txt`), tạo xong **tự phát** nếu người dùng vẫn đang mở ô; lỗi → toast, ▶ trở lại. Mẫu chỉ tạo khi bấm (không tạo trước hàng loạt — tốn GPU).
- **Chip vai** (`● Người dẫn`) ở dòng giọng đang dùng bởi vai **khác** → thấy ngay trùng giọng. Không chặn chọn trùng.
- **Rỗng:** "Không có giọng "…"" + phạm vi đang lọc; nút **"Bỏ lọc ♂ Nam (N kết quả)"** chỉ hiện khi bỏ lọc có kết quả (đếm sẵn) + "Xoá tìm". Không bao giờ hiện khung trống trơn.
- **Tìm:** bỏ dấu + chữ thường (`normalize("NFD")` bỏ dấu, `đ→d`), khớp **chuỗi con** trên tên + engine + ngôn ngữ; tô phần khớp. Có kết quả → dòng chọn = kết quả đầu. Lọc giới tính mặc định **Tất cả** (không tự lọc theo giới tính vai — tránh "mất giọng").
- Không có giọng nào (engine chưa tải): nút đóng hiện id giọng hiện tại + mờ; mở ra = 1 dòng hướng dẫn "Tải model ở trên" (giữ hành vi `spp-engine-warn`).

**Bàn phím** (ARIA `combobox` + `listbox`, `aria-activedescendant`; focus luôn ở ô tìm)

| Phím | Việc |
|---|---|
| `Enter` / `Space` / `↓` trên nút đóng | mở, focus ô tìm, dòng chọn = giọng đang dùng (cuộn tới) |
| `↑` `↓` · `PgUp` `PgDn` (8 dòng) | chuyển dòng, bỏ qua tiêu đề nhóm, xoay vòng |
| `Home` `End` | đầu/cuối (chỉ khi ô tìm rỗng, còn lại để di chuyển con trỏ chữ) |
| `Enter` | dùng giọng, đóng, focus về nút |
| `Ctrl+Space` | nghe / dừng mẫu dòng đang chọn |
| `Ctrl+S` | ghim / bỏ ghim ★ (chặn lan ra phím Lưu của app khi ô mở) |
| `Alt+1/2/3` | lọc Tất cả / Nam / Nữ |
| `Esc` | có chữ → xoá chữ; rỗng → đóng, giữ giọng cũ |
| `Tab` / bấm ra ngoài | đóng, giữ giọng cũ, dừng mẫu |

**Nơi lưu ★:** config toàn cục `favorite_voices: string[]` (id đầy đủ có tiền tố engine, vd `vietneu:adam`) — **không** theo dự án (★ là sở thích người dùng). Đọc/ghi qua lệnh config sẵn có, cập nhật lạc quan (UI đổi ngay, lỗi ghi → hoàn lại + toast). Id không còn tồn tại → bỏ qua khi hiển thị, không tự xoá khỏi config (model có thể tải lại).

**Component đề xuất** — `src/components/ui/VoicePicker.tsx` (+ `.css`, `voicePickerModel.ts` thuần: parse nhãn, bỏ dấu, lọc, nhóm, điều hướng phím → test được bằng `node --test`)

```ts
export interface VoicePickerItem {
  id: string;                 // "vietneu:adam"
  name: string;               // "Adam bựa" (đã tách nhãn)
  gender: "male" | "female";
  lang?: string;              // "vi"
  engineId: string;           // "vietneu"
  engineLabel: string;        // "VieNeu v3"
  kind: "offline" | "cloud";
}
export type VoicePreviewStatus = "loading" | "playing";
export interface VoicePickerProps {
  voices: ReadonlyArray<VoicePickerItem>;
  value?: string;                                  // bỏ trống ở variant "inline" (Cài đặt)
  onChange?: (id: string) => void;
  favorites: ReadonlySet<string>;
  onToggleFavorite: (id: string) => void;
  preview: { id: string; status: VoicePreviewStatus; progress?: number } | null;
  onPreview: (id: string) => void;                 // bấm ▶ (phía cha lo cache/tạo mẫu/phát)
  onStopPreview: () => void;
  usedBy?: ReadonlyMap<string, ReadonlyArray<{ name: string; color: string }>>; // giọng → vai khác
  variant?: "popover" | "inline";                  // Studio | Cài đặt › Giọng đọc
  onManage?: () => void;                           // "Quản lý ›" → Cài đặt › Giọng đọc
  disabled?: boolean;
  ariaLabel: string;
}
```

Studio: `StudioVoiceStep` truyền `usedBy` tính từ `state.roles` (bỏ chính vai đó). Cài đặt: `variant="inline"`, không `value`/`usedBy`, hiện badge engine ở từng dòng ★. Trạng thái phát mẫu + `favorite_voices` do 1 hook `useVoicePreview()` / `useFavoriteVoices()` giữ ở cha, dùng chung 2 nơi.

**Hiệu năng**
- `VoiceRow` bọc `React.memo`; mỗi dòng nhận `isCurrent/isActive/isFavorite/previewStatus` dạng primitive → đổi dòng chọn hoặc phát mẫu chỉ render lại 2 dòng.
- Khoá tìm (bỏ dấu, chữ thường) tính **1 lần** khi `voices` đổi (`useMemo`), không tính lại mỗi phím.
- **> 100 giọng → ảo hoá**: dòng cao cố định 32 px ⇒ cửa sổ hoá tự viết (~40 dòng code, `scrollTop / 32`, overscan 6), không thêm thư viện. ≤ 100 giọng render thẳng.
- Popover chỉ mount khi mở; nút đóng là component nhẹ riêng → 5 vai × 25 giọng không tạo 125 `<option>` như hiện nay.
- `<audio>` mẫu: 1 phần tử dùng chung, dừng + giải phóng khi đóng ô.

### 4.11 Tab dự án Studio (mockup `studio-tabs.html`, ảnh `shots/studio-tabs.png`)

Mỗi video = 1 tab (kiểu Premiere). Việc đang chạy gắn với **tab**, không với màn hình: mở video khác thì việc cũ vẫn chạy và vẫn hiện tiến độ trên tab của nó. Mục này chỉ lo **nhìn + tương tác**; trạng thái/luồng việc nền ở `docs/STUDIO_TABS_PLAN.md` (Sonnet).

**Vị trí — dưới topbar, chỉ trong Studio.** Topbar đã kín (logo + 6 tab ứng dụng + trạng thái + ↶↷ + Xuất); nhét tab dự án vào đó sẽ lẫn 2 cấp tab. Thanh riêng 34 px ngay dưới topbar, **luôn hiện** kể cả 1 tab hoặc 0 tab (không nhảy bố cục, ＋ luôn cùng chỗ). Thanh tab **thay** 2 thứ trên topbar: chip tên file ở giữa và nút "＋ Mở video" → bỏ khỏi topbar (zero-duplication). Ô trạng thái topbar gộp: "● N việc đang chạy" (bấm → menu nhảy tới tab); tab ứng dụng "Tiến trình" có badge số việc.

```
topbar 48 │ 🎬 SUBLIX  [Studio] Tải video … Cài đặt        ● 1 việc đang chạy  ↶ ↷  [⤓ Xuất video]
tabs   34 │ [◔ Tap_07_long_tieng 62%][● StarCraft_trailer…][● Phim_ngan_CN_…tap03][▭ A2Z_TEST_EN ✕] ＋      12 tab ⌄
          │  └ đang chạy               └ lỗi (đỏ)          └ xong chưa xem (xanh)  └ đang mở (gạch vàng)
```

**Kích thước:** thanh 34 px, nền `#0f0d0b` + viền dưới `--line`. Tab cao 30 px (đang mở 31 px, đè viền để "dính" vào nội dung), bo trên 8 px, rộng **200 px, co tới 120 px, tối đa 220 px**, chữ 12 px/600. Bố cục trong tab: ô biểu tượng **14 px luôn giữ chỗ** · tên · (số %) · ✕ 18 px. Tab nghỉ: nền trong suốt, chữ `--t3`, vạch ngăn 1 px giữa các tab. Hover: `--hover`. Đang mở: nền `--bg-side`, viền `--line`, **gạch `--ac` 2 px trên đỉnh**, chữ `--t1`. ✕ chỉ hiện khi hover hoặc tab đang mở; chuột giữa = đóng.

**Trạng thái trên tab** (1 ô biểu tượng, không thêm huy hiệu)

| Trạng thái | Biểu tượng | Ghi chú |
|---|---|---|
| Nghỉ | khung phim mờ `--t4` | |
| Đang chạy | **vòng 14 px** (conic) + số `62%` mono bên phải | % của **bước đang chạy**, không phải cả chuỗi. Màu = token bước: `--step-sub` nhận dạng · `--step-tr` dịch · `--step-dub` lồng tiếng · `--ac` xuất. Chưa có % (nạp model) → cung 1/4 quay, không số. Hover: ✕ thay chỗ số % |
| Chờ lượt | vòng nét đứt + chữ "chờ" | việc nặng chạy lần lượt (CPU/GPU chung) |
| Lỗi | chấm đỏ "!" | giữ tới khi mở tab |
| Xong, chưa xem | chấm xanh + tên sáng | tự hết khi mở tab; kèm toast "Xong lồng tiếng … · Mở" |

Chọn **vòng** thay vì thanh mảnh đáy tab: thanh 2 px dưới tab đang mở trùng gạch vàng/viền, và ở 120 px gần như không thấy; vòng nằm ở ô cố định, đọc được ở mọi bề rộng.

**Tên tab:** tên file **bỏ đuôi** (`.mp4`), cắt **giữa** khi dài (`Phim_ngan_CN_…tap03`) — loạt tập phim khác nhau ở cuối, cắt đuôi sẽ ra 12 tab giống hệt. Đổi tên (F2 / nhấp đúp tên): sửa ngay trên tab, chọn sẵn cả tên, Enter lưu · Esc huỷ · rỗng = về tên file; chỉ đổi **tên hiển thị** (lưu theo dự án), không đổi file trên đĩa.

**Thẻ hover** (chờ 500 ms, rộng 340, style popover như §4.10): tên file đủ · đường dẫn (mono, cắt giữa) · `26:14 · 1920×1080 · 323 câu · 3 vai` · việc đang chạy "Đang lồng tiếng · câu 201/323 · 62 % · còn ~4 phút" + thanh 3 px · 5 bước thu nhỏ (✓ / đang chạy / chưa). Tab lỗi: bước lỗi + 1 dòng lỗi. Tab chờ: "Chờ sau Tap_07 (~4 phút)".

**Mở tab:** ＋ cuối dãy tab (Ctrl+O; Ctrl+I cũ giữ làm bí danh) · **thả file ở bất kỳ đâu trong Studio = tab mới** (nhiều file = nhiều tab; không bao giờ ghi đè dự án đang mở) · "Mở trong Studio" từ Tải video = tab mới · file **đã có tab → nhảy tới tab đó**, nháy viền 1 lần (khử trùng theo đường dẫn chuẩn hoá). Tab mới chèn **ngay sau tab đang mở**.

**Đóng tab đang chạy → hộp hỏi:** tiêu đề "Tap_07 đang lồng tiếng (62 %)"; nút **Để chạy nền** = mặc định (Enter, không phá gì) · **Huỷ** (Esc) · **■ Dừng việc** tách bên trái, đỏ. Ô "Lần sau không hỏi — luôn để chạy nền". Chạy nền: tab biến mất, việc xem ở tab Tiến trình; xong → toast "Xong · Mở lại" (mở lại đúng vị trí cũ). Đóng nhiều tab (Đóng các tab khác/bên phải) hoặc đóng app khi còn việc → **1 hộp gộp** ("2 tab đang chạy"), không hỏi từng tab. Tab không chạy: đóng ngay, không hỏi (dự án tự lưu cache), Ctrl+Shift+T mở lại.

**Kéo đổi thứ tự:** kéo > 4 px mới tính; tab nổi theo chuột, vạch `--ac` 2 px chỉ chỗ thả, tab khác dạt ra 150 ms; Esc / thả ngoài thanh = huỷ; **không** tách cửa sổ. Bàn phím: Ctrl+Shift+PgUp/PgDn.

**Menu chuột phải:** [mục theo trạng thái: lỗi → "↻ Chạy lại bước …"; đang chạy → "■ Dừng việc" (đỏ)] — Đóng `Ctrl+W` · Đóng các tab khác · Đóng các tab bên phải · Đóng các tab đã xong — Mở thư mục chứa video · Đổi tên tab `F2`.

**Tràn:** tab co 200 → 120 px; hết chỗ thì **cuộn ngang** (lăn chuột trên thanh), mép mờ 40 px báo còn tab, tab đang mở luôn cuộn vào tầm nhìn. Khi tràn mới hiện nút **"12 tab ⌄"** bên phải: danh sách đủ tab + ô tìm (không dấu, dùng lại hàm của VoicePicker) + trạng thái từng tab; có **chấm cam** khi tab đang chạy bị khuất. Không dùng mũi tên ‹ › (bấm từng nấc chậm).

**Phím tắt** (chỉ khi đang ở Studio; đã grep `src/` — không trùng phím sẵn có, VoicePicker dùng Alt+1..3 nên không đụng)

| Phím | Việc |
|---|---|
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | tab sau / trước theo **thứ tự trên thanh** (không MRU — dễ đoán), xoay vòng |
| `Ctrl+1` … `Ctrl+8` | tới tab 1…8 |
| `Ctrl+9` | tới tab **cuối** (quy ước trình duyệt) |
| `Ctrl+W` | đóng tab đang mở (đang chạy → hộp hỏi) |
| `Ctrl+Shift+T` | mở lại tab vừa đóng |
| `Ctrl+O` | mở video (tab mới) |
| `F2` | đổi tên tab |

Các phím này phải chạy cả khi focus đang ở ô nhập (Ctrl+Tab trong `<textarea>` phụ đề không chèn tab).

**Trạng thái rỗng (0 tab):** thanh vẫn hiện, ＋ nở thành nút "＋ Mở video `Ctrl+O`", bên phải "Mở gần đây: 2 file" (bấm = mở tab); thân Studio là màn "Chưa mở video" hiện có (`after-01a`) + dòng "kéo thả 1 hay nhiều video — mỗi file 1 tab". Đóng tab cuối → về đây, **không** tự tạo tab trống.

**Giới hạn đề xuất:** **tối đa 12 tab mở**; mở tab thứ 13 → toast "Đã mở 12 tab · Đóng các tab đã xong (N)" (1 bấm), không chặn cứng bằng hộp lỗi. **1 việc nặng chạy cùng lúc** (STT/TTS/xuất cùng ăn CPU/iGPU máy dev) — việc sau vào trạng thái "chờ lượt"; dịch qua API cloud có thể chạy song song (Sonnet chốt trong STUDIO_TABS_PLAN). Chỉ tab đang mở giữ `<video>` + timeline đã mount; tab nền giữ state dữ liệu, không giữ DOM. Mở lại app → khôi phục danh sách tab + tab đang mở, nạp lười (tab nạp khi được bấm).

**Component đề xuất:** `src/views/studio/tabs/StudioTabStrip.tsx` (+ `.css`, `StudioTab.tsx` bọc `React.memo` — tiến độ đổi chỉ render lại 1 tab; `tabStripModel.ts` thuần: tên rút gọn cắt giữa, khử trùng đường dẫn, thứ tự/di chuyển, chọn tab kế khi đóng (bên phải, hết thì bên trái), map phím → test `node --test`). Hộp hỏi dùng lại component xác nhận của Tiến trình.

### 4.12 Kiểu phụ đề + làm mờ phụ đề cứng — v0.14 (mockup `v014-subtitle-style.html`)

Phạm vi theo `docs/V0.14_PLAN.md` §1 + §2D. Hiện trạng (đã đọc code): modal Xuất (`SublixStudioView.tsx` ~9931) có Đường tiếng + Phụ đề (Softsub / Hardsub / Không); kiểu chữ (cỡ, 5 màu, vị trí, bóng) nằm ở tab **⚙ Thuộc tính** cột phải (~8673), thanh công cụ trên video có select Bản dịch/Gốc/Song ngữ (~7953). Không có gì về chữ nhảy hay chữ cứng.

**Đặt ở đâu — 1 chỗ chính + lối tắt (theo §4.1 nguyên tắc 1)**

| Nơi | Vai trò | Lý do |
|---|---|---|
| Tab **⚙ Thuộc tính** (cột phải) | **Chỗ chính**: thẻ "Kiểu phụ đề" (thay "Kiểu dáng phụ đề màn chiếu") + thẻ mới "Phụ đề cứng của video gốc" | Nằm ngay cạnh khung xem thử ⇒ chỉnh là thấy; kiểu chữ đã ở đây; chỉnh dải phải nhìn video, không thể làm trong modal |
| Thanh công cụ video | 2 chip lối tắt: `Aa Nhảy chữ · Vàng nảy` (luôn hiện) và `▭ Làm mờ dải chữ cứng` (chỉ khi đã tích ô). Bấm = cột phải sang Thuộc tính, cuộn tới thẻ, nháy viền 1 lần | Thấy trạng thái đang áp mà không mở cột phải; không lặp control |
| Modal **Xuất** | Chỉ **tóm tắt + "Đổi"** dưới 3 thẻ Phụ đề (như mẫu "Nhà cung cấp … — Đổi" ở §4.3). Ô chưa tích ⇒ 1 dòng mờ "Video gốc có chữ in sẵn? Làm mờ & đè tem ›" | Người chỉ nhận ra chữ cứng lúc xuất vẫn có lối vào; không có control thứ 2 |

**A. Thẻ "Kiểu phụ đề"** (mockup B)

```
Aa Kiểu phụ đề
[ Bình thường | Nhảy chữ ]                         ← segmented, mặc định Bình thường (giữ hành vi cũ)
Bình thường:  Màu chữ ■■■■■ · Cỡ chữ ─●─ · Viền & bóng [●] · Vị trí [Dưới đáy|Ở giữa|Trên đỉnh]
Nhảy chữ:     ┌ Vàng nảy ✓ ┐┌ Karaoke xanh ┐       ← 4 thẻ mẫu 2×2, cao 62 px, chữ "Xin chào các bạn" chạy thật
              └ Hộp cam    ┘└ Hiện dần     ┘
              Cỡ chữ · Viền & bóng · Vị trí (giữ)  ← mẫu thay ô màu; còn lại giữ nguyên
              "Nhịp nhảy theo lời nói. Câu dịch chưa có mốc từng từ ⇒ chia theo số âm tiết."
```

| Mẫu | Hiệu ứng | ASS (thợ xác minh với libass) |
|---|---|---|
| **Vàng nảy** (mặc định) | từ đang nói đổi vàng `#FFC83D` + phóng 118 % rồi thu về; từ khác trắng | 1 event/từ, `\t(\fscx118\fscy118\c…)` |
| **Karaoke xanh** | tô dần trái→phải, từ đã nói giữ xanh `#5FD3FF` | `\kf` — 1 event/câu, rẻ nhất |
| **Hộp cam** | từ đang nói trong hộp `--ac`, chữ tối (kiểu CapCut) | lớp hộp riêng `BorderStyle=3` theo vị trí từ — **rủi ro**: phải đo được vị trí từ; không đạt ⇒ bỏ mẫu này, giữ 3 |
| **Hiện dần** | từ chưa nói ẩn (vẫn giữ chỗ, không nhảy dòng), tới lượt thì bật ra | `\alpha&HFF&` + `\t` theo mốc từ |

- Thẻ mẫu = nhóm radio (`←` `→` đổi). **Rê chuột lên mẫu ⇒ khung xem thử áp tạm** (nhãn "đang xem thử"), rời chuột ⇒ về mẫu đã chọn; bấm = chọn. Đây là cách "thấy trước khi xuất" rẻ nhất, không cần nút Xem thử.
- **Song ngữ:** chỉ dòng Việt nhảy; dòng gốc nhỏ xám giữ bình thường. **Nguyên bản:** dùng word timestamp của Whisper nếu có, không có thì chia âm tiết.
- Màu mẫu cố định (không cho chỉnh màu từng mẫu ở v0.14 — 4 mẫu là đủ, thêm chỉnh màu = thêm 4–6 control).
- Font: font đi kèm app do nghiên cứu chọn; khung xem thử nạp **cùng file font** qua `@font-face` để xem thử = xuất.

**B. Thẻ "Phụ đề cứng của video gốc"** (mockup A, C)

```
▭ Phụ đề cứng của video gốc
☐ Video có phụ đề cứng — làm mờ & đè tem           ← mặc định TẮT; tắt thì chỉ 1 dòng + câu giải thích
[trạng thái dò]                       [↻ Dò lại]
▬▬ ▬▬▬▬ ▬ ▬▬▬▬▬▬ ▬▬▬                               ← dải thời gian có chữ (10 px), bấm 1 đoạn = tua tới
Mức mờ        [Nhẹ | Vừa | Mạnh]                   ← mặc định Vừa
Nền tem mờ đục [●]                                 ← mặc định BẬT (chỉ mờ thì bóng chữ cũ vẫn lộ)
Làm mờ        [Chỉ lúc có chữ | Suốt video]        ← mặc định Chỉ lúc có chữ
```

- Mức mờ ⇒ `gblur sigma` ở 1080p: Nhẹ 6 · Vừa 12 · Mạnh 20 (nhân `cao_video/1080`). Xem thử: `backdrop-filter: blur(sigma × cao_hiển_thị/cao_video)` — thợ đo 1 khung so ảnh xuất, chỉnh hệ số nếu lệch.
- Tem = hộp đen 55 % phủ đúng dải, **góc vuông** (vì `drawbox` của ffmpeg không bo góc ⇒ xem thử cũng không bo).
- Có dải ⇒ chữ Việt **căn giữa dải**, control "Vị trí" khoá với chữ "Theo dải chữ cứng". Dải thấp hơn 1 dòng chữ ở cỡ hiện tại ⇒ dòng vàng "Dải thấp hơn cỡ chữ — chữ sẽ tràn ra ngoài dải".
- "Chỉ lúc có chữ" ⇒ khung xem thử cũng chỉ mờ trong các khoảng đó (xem thử = xuất).

**C. Trạng thái dò + hành vi** (mockup C, E)

| Trạng thái | Thẻ hiện | Khung video | Khi bấm Xuất |
|---|---|---|---|
| **Tắt** (mặc định) | 1 dòng ô tích + giải thích | không gì | không làm mờ; modal có dòng mờ dẫn tới thẻ |
| **Đang dò** | vòng quay · "Đang dò chữ cứng… 34 %" · "nửa dưới khung · còn ~20 giây" · thanh 3 px · ✕ huỷ | vệt quét chậm ở nửa dưới + nhãn % (không che, không chặn phát) | nút chính thành **"Xuất khi dò xong"**: việc xuất vào hàng đợi sau bước dò |
| **Tìm thấy** | ✓ "Tìm thấy dải chữ · đáy khung" · "14 đoạn · 82 % thời lượng có chữ" · ↻ Dò lại · dải thời gian · 3 tuỳ chọn. Đã chỉnh tay ⇒ thêm "đã chỉnh tay · ↺ Về dải dò" | khung dải (mục D) | "Làm mờ vừa + tem · dải 81–93 % · 14 đoạn" |
| **Tìm thấy ít** (< 5 % thời lượng hoặc dải không ổn định) | như trên nhưng chấm vàng + "kiểm lại dải trên video" | khung dải | vẫn xuất |
| **Không thấy chữ** | ? vàng "Không thấy chữ ở nửa dưới khung hình" · "Đã xem 252 khung" · [Dò cả nửa trên] [▭ Tự đặt dải] · "Video không có chữ cứng thì bỏ tích" | không gì | dòng vàng "Không thấy chữ — sẽ không làm mờ"; vẫn xuất |
| **Lỗi** | ! đỏ "Không dò được" + 1 dòng lỗi dễ hiểu (đủ trong nhật ký/tooltip) · nút theo loại: thiếu mô hình ⇒ "⬇ Tải mô hình · N MB" (dùng chung bộ tải của Cài đặt › Mô hình), khác ⇒ "↻ Thử lại" · luôn có [▭ Tự đặt dải] | không gì | như "Không thấy chữ" (có dải tự đặt thì dùng dải đó) |
| **Chưa dò** (đã tích nhưng huỷ dò / dự án từ bản cũ / video nguồn đổi) | vòng nét đứt "Chưa dò" + [Dò ngay] | không gì | "Sẽ dò trước khi xuất" — việc xuất tự chạy bước dò trước (**không bao giờ chặn xuất**) |

Quy tắc:
- **Tích ô = dò ngay** (Zero-Button, không có nút "Dò" riêng). Bỏ tích = ẩn dải + tắt hiệu ứng nhưng **giữ** kết quả dò + chỉnh tay; tích lại = có ngay, không dò lại.
- Kết quả lưu **theo dự án**, khoá theo đường dẫn + cỡ + thời lượng video; khoá đổi ⇒ về "Chưa dò".
- Dò chạy nền, không khoá Studio; là việc nhẹ (1 khung/giây, CPU) nhưng vẫn đi qua hàng đợi việc của tab (§4.11) để tab hiện tiến độ đúng.
- **Không tự bỏ tích** khi không thấy chữ (người dùng có thể biết rõ hơn máy).
- **Dò lại khi dải đã chỉnh tay:** không hỏi; dò xong toast "Đã thay dải bạn chỉnh bằng dải mới · **Hoàn tác**" (6 s).
- **Tự đặt dải:** dải mặc định 80–94 % cao, 4–96 % ngang, áp suốt video (không có khoảng thời gian ⇒ seg "Làm mờ" khoá ở "Suốt video").
- Modal Xuất: khi kiểu = Nhảy chữ **hoặc** ô đang tích ⇒ **chọn sẵn "Khắc cứng"**. Chọn "Phụ đề mềm" ⇒ dòng ⚠ "Phụ đề mềm luôn là kiểu Bình thường, và không nằm vào dải mờ" (vẫn cho xuất). "Không nhúng phụ đề" + ô tích ⇒ chỉ làm mờ (video sạch chữ). "Đổi" = đóng modal, mở Thuộc tính, nháy thẻ.

**D. Khung dải kéo chỉnh trên video** (mockup D)

- **Hiện khung** (viền nét đứt `--ac` 1.5 px, ngoài dải tối 18 %, nhãn "▭ Dải chữ cứng · tự dò" góc trên-trái) khi tab Thuộc tính đang mở **hoặc** rê chuột lên dải. Lúc khác (tab Phụ đề / đang phát) chỉ thấy hiệu ứng thật.
- **Tay nắm:** trên/dưới 34×9 px giữa mép (vùng bấm = cả mép, cao 12 px, con trỏ ↕); trái/phải 9×26 (↔, mặc định co đối xứng, giữ `Alt` = 1 bên); kéo thân = dời (✥). Tay nắm đang rê: nền `--ac` + quầng `--ac-soft`.
- **Đang kéo:** số đọc mono "Trên 79,0 % · Dưới 96,0 % · cao 184 px" (px của video gốc); dải dò cũ hiện nét đứt mờ để so; **hút 4 px** vào mép dải dò và mép khung (vạch xanh `--ok` + chữ "mép dải dò"). Cao tối thiểu 3 % khung. Thả ⇒ nhãn "chỉnh tay", viền liền. `Esc` khi đang kéo = huỷ lần kéo.
- **Phím:** `Tab` tới dải · `↑` `↓` dời 1 px video gốc (`Shift` ×10) · nhấp đúp = về dải dò · `Ctrl+Z` hoàn tác (chung ngăn hoàn tác dự án).
- Lưu dải dưới dạng **tỉ lệ 0–1 của khung** (không phụ thuộc cỡ hiển thị / thu phóng 75–50 %); đổi sang px chỉ khi dựng filter ffmpeg.

**E. Xem thử = video xuất**

- Chữ nhảy: khung xem thử lấy mốc từng từ từ **cùng hàm thuần** sinh ASS (`splitWordTimings` — việc lõi trong V0.14_PLAN §3). Không dùng `animation-delay` CSS (sai khi tua/tạm dừng): mỗi `timeupdate`/rAF khi đang phát tính **chỉ số từ đang nói**, chỉ render lại khi chỉ số đổi; hiệu ứng từ = class CSS (transition 120 ms).
- Mờ + tem: 1 lớp `backdrop-filter` + 1 hộp, đặt theo tỉ lệ dải; "Chỉ lúc có chữ" ⇒ bật/tắt lớp theo khoảng thời gian dò.

**Kiểu dữ liệu đề xuất** (lưu theo dự án, cạnh các thiết lập phụ đề hiện có)

```ts
export type SubtitleStyleKind = "normal" | "kinetic";
export type KineticPresetId = "pop-amber" | "karaoke-cyan" | "box-amber" | "reveal";
export interface HardsubBand { top: number; bottom: number; left: number; right: number } // tỉ lệ 0–1 của khung
export type HardsubDetect =
  | { kind: "idle" }                                             // chưa dò / đã huỷ
  | { kind: "running"; progress: number; etaSec?: number; area: "bottom" | "full" }
  | { kind: "found"; band: HardsubBand; intervals: Array<[number, number]>; coverage: number; weak: boolean }
  | { kind: "none"; area: "bottom" | "full"; framesScanned: number }
  | { kind: "error"; code: "model_missing" | "ffmpeg" | "other"; message: string };
export interface HardsubSettings {
  enabled: boolean;                       // mặc định false
  detect: HardsubDetect;
  band: HardsubBand | null;               // dải đang dùng (dò hoặc tay)
  bandSource: "auto" | "manual";
  blur: "light" | "medium" | "strong";    // mặc định "medium"
  tem: boolean;                           // mặc định true
  span: "text-only" | "whole";            // mặc định "text-only"
}
```

**Component đề xuất** — `src/views/studio/subtitleStyle/`: `SubtitleStyleCard.tsx` (thẻ A, thẻ mẫu bọc `React.memo`), `HardsubCard.tsx` (thẻ B, trạng thái C), `HardsubBandOverlay.tsx` (khung + kéo, đặt trong khung video), `KineticSubtitleLine.tsx` (dòng chữ nhảy cho khung xem thử), `bandDragModel.ts` thuần (kéo mép, hút, tối thiểu 3 %, phím → test `node --test`). Mỗi file < 300 dòng; `SublixStudioView.tsx` chỉ thêm state + truyền props (1 thợ/lúc như V0.14_PLAN §3).

**Đếm control:** thẻ Kiểu phụ đề Bình thường 4 → 5 (thêm segmented); Nhảy chữ 5 (segmented + 4 thẻ mẫu thay 5 ô màu) + 3 giữ. Thẻ phụ đề cứng: tắt = 1; tìm thấy = 1 ô + Dò lại + dải thời gian + 3 tuỳ chọn = 6. Modal Xuất: +2 liên kết "Đổi", không thêm control chỉnh.

### 4.13 Khám phá (v0.15) (mockup `v015-discovery.html`, ảnh `shots/v015-discovery-*.png`)

Phạm vi theo `docs/V0.15_PLAN.md` §2: vẽ đủ **nấc A**; nấc **B** (tự dịch từ khoá, danh mục, YouTube hot có key, nguồn "Tất cả", lọc thời lượng) và **C** (trình duyệt nhúng) chỉ chừa chỗ/phác. Dữ liệu mỗi nguồn: `docs/VIDEO_DISCOVERY_RESEARCH.md` §2 + kiểu `DiscoveryItem` §4.2.

**Vị trí — tab con trong "Tải video" (không thêm tab thứ 7).** Topbar đã kín (§4.11); Khám phá chỉ để **đưa link vào hàng đợi tải** ⇒ cùng nhà với Tải về. Thanh tab con 38 px dưới topbar: `⬇ Tải về [badge số mục hàng đợi] · 🔥 Khám phá · (🌐 Trình duyệt — nấc C, ẩn tới khi spike đạt)`. Kiểu **gạch chân** `--ac` 2 px ở đáy (khác tab dự án Studio gạch trên đỉnh ⇒ không lẫn 2 loại tab). Nhớ tab con mở lần cuối (localStorage). `DownloaderView` **vẫn luôn mount** (BUG-045) — Khám phá là anh em, ẩn/hiện bằng CSS, không unmount Tải về.

```
topbar 48 │ 🎬 SUBLIX  Studio [⬇ Tải video 2] Live …                    ● Đang tải 2 · đợi 1  👁
sub    38 │ ⬇ Tải về (3)  [🔥 Khám phá]                       Tải với: Cao nhất · Phụ đề tự tải  Đổi
          │ [B Bilibili|▶ YouTube|Tất cả·B] [⌕ Tìm trên Bilibili…         Enter] [文 Tự dịch ◯]·B
          │ 🔥 Xu hướng Douyin 50  (1 在稻城亚丁… 1172万)(2 …)(3 …)(4 黑神话 Bùng 866万) …→   12 phút ↻
          │ [🔥 Đang hot] 🏆 Bảng xếp hạng │ Danh mục ▾·B                 20/100 video · 4 phút ↻
          │ ┌thẻ┐┌thẻ┐┌thẻ┐┌thẻ┐┌thẻ┐┌thẻ┐   ← auto-fill minmax(260px,1fr): 1920=6 cột · 1024=3
          │ …                                                           (cuộn vô hạn)
mq     38 │ ⬇ Hàng đợi: 2 đang tải · 1 đợi  [tên ▬▬ 46%] [tên ▬▬ 81%] [⏳ tên]        Xem ở Tải về ›
```

**Kích thước & màu** (chỉ token sẵn có §4.1 / `_theme.css`)

| Phần | Số đo |
|---|---|
| Thân | padding `14px 28px` (≤ 1280 px: `12px 20px`), khoảng cách hàng 12 px |
| Thanh tìm | cao 40 px, bo 10; ô tìm nền `--bg-inset` viền `--line`, focus `--ac-br` + quầng 3 px `--ac-soft`; chọn nguồn = segmented 40 px (kiểu `.seg`, mục bật `--ac-soft`) với logo nguồn 16 px |
| Logo nguồn | ô 16×16 bo 4, chữ 9 px/900: Bilibili `B` màu `#38bdf8` nền 18 % · YouTube `▶` `#f87171` — **cùng màu tag nền tảng ở tab Tải về** (§4.4), không dùng logo thương hiệu |
| Chip hot | cao 28, bo 14, tối đa 240 px (cắt "…", tooltip đủ); ô hạng 18 px mono (top 3 nền cam `#e8a33d → #c9853a → #9c6a35`); nhãn Douyin `label` → "Mới" (`--ok`), "Nóng" (`--dang`), "Bùng" (`--ac`) 9.5 px; điểm nhiệt mono `--t4` dạng `1172万`; chip đang chọn `--ac-soft` + `--ac-br` |
| Nút danh sách | cao 30, bo 8, 12.5/700; bật = `--ac-soft`; kết quả tìm = nút viền đứt `⌕ "từ khoá" ✕` |
| Thẻ | bo 12, nền `--bg-card`, viền `--line-soft`; hover `--hover` + `--line`; focus bàn phím = vòng 2 px `--ac-txt` (cách 2 px); đã tải = viền `--ok-br` |
| Ảnh | 16:9 (`aspect-ratio`), nhãn thời lượng mono 11/600 nền đen 78 % góc dưới phải; số hạng (Bảng xếp hạng) góc trên trái 26 px, top 3 nền cam như chip |
| Thân thẻ | padding `9px 11px 10px`; tiêu đề 13/600, line-height 18, **cao cố định 36 px** (2 dòng, `line-clamp`); dòng 1 logo + kênh `--t2`; dòng 2 lượt xem `--t3` · thời gian `--t4` — thẻ cao đều nhau ⇒ lưới thẳng hàng, ảo hoá dễ |
| Lớp hover | phủ cả ảnh `linear-gradient(rgba(10,8,6,.35), .72)`, 2 nút 32 px giữa ảnh: `⬇ Tải về` (phụ) · `🎬 Tải & mở Studio` (**chính**, `--grad-ac`) |
| Hàng đợi mini | 38 px, nền `#0f0d0b`, viền trên `--line`; mỗi mục ≤ 320 px, thanh 60×4 `--ac` |

**Thành phần & hành vi**

1. **Thanh tìm.** Enter / bấm ⌕ / bấm chip mới tìm — **không tìm khi đang gõ** (YouTube ~7 s/lượt, Bilibili cần gọi thưa); debounce 500 ms của plan áp cho Enter/chip bấm dồn. Đổi nguồn khi có từ khoá ⇒ tìm lại ngay ở nguồn mới. Placeholder theo nguồn ("Tìm trên Bilibili — từ khoá tiếng Trung cho nhiều kết quả hơn, vd 艾尔登法环 剧情" / "Tìm trên YouTube"). Nấc A chỉ 2 nguồn; "Tất cả" và công tắc tự dịch **ẩn hẳn** ở nấc A (mockup vẽ mờ để thấy chỗ).
2. **Tự dịch (B).** Công tắc `文 Tự dịch` cạnh ô; tắt + gõ có dấu tiếng Việt + nguồn Bilibili ⇒ 1 dòng gợi ý "Bật tự dịch sang tiếng Trung". Bật ⇒ dòng "Đang tìm: **艾尔登法环 剧情** (dịch từ "…" · nhà cung cấp) · Sửa · Tìm nguyên văn" — luôn cho thấy từ khoá thật đã gửi. Không dịch khi từ khoá đã là chữ Hán hoặc chỉ Latin không dấu (tên game). Dịch tối đa 8 s; lỗi/quá giờ ⇒ tìm nguyên văn + dòng `--warn-txt`. Dùng LLM ở Cài đặt › Dịch thuật (không thêm cấu hình mới). Chỉ áp Bilibili.
3. **Chip "🔥 Xu hướng Douyin".** 50 chip, cuộn ngang bằng lăn chuột (chuyển `deltaY` → `scrollLeft`), mép phải mờ 48 px khi còn chip. Bấm ⇒ điền **đúng chữ chip** vào ô + tìm ở nguồn đang chọn; chip sáng cam tới khi đổi từ khoá. "12 phút trước ↻" = tuổi cache (TTL 15 phút). Douyin lỗi ⇒ ẩn cả hàng chip (1 dòng mờ "Không lấy được xu hướng Douyin · ↻"), không chặn phần khác.
4. **Chọn danh sách.** Bilibili: `🔥 Đang hot` (popular 20/trang, cuộn tải thêm) · `🏆 Bảng xếp hạng` (ranking v2, 100 video 1 lần, thẻ có số hạng) · (B) `Danh mục ▾` (Tất cả / Trò chơi / Phim ảnh / Phim bộ–Anime / Âm nhạc / Đời sống / Khoa học & công nghệ — map `rid`, áp cho Bảng xếp hạng) + (B) lọc thời lượng. YouTube: `🔥 Đang hot 🔒` khi **chưa có key** ⇒ màn giải thích "cần Google API key (miễn phí)" + gợi ý tìm từ khoá/bấm chip + (B) nút "⚙ Thêm key trong Cài đặt"; **không** tự fallback `ytsearch "trending"` (không phải hot thật). Có key (B): chọn nước 🇻🇳/🇺🇸/🇯🇵/🇰🇷 (nhớ lựa chọn) + đếm quota còn lại. Đang tìm ⇒ thêm nút `⌕ "từ khoá" ✕`; ✕ / Esc ô rỗng ⇒ về danh sách trước, **giữ vị trí cuộn**. Mặc định khi mở: Bilibili · Đang hot.
5. **Thẻ video.** Lượt xem: Bilibili `9.876 · 12,8万 · 1,2亿`; YouTube `987 · 12K · 3,4M` (phẩy thập phân kiểu Việt, 1 chữ số lẻ); tooltip số đủ + "万 = 10.000". Thời gian: "vừa xong / 25 phút trước / 3 giờ trước / 6 ngày trước", ≥ 30 ngày `12/09/2026`; không có ngày (YouTube flat) ⇒ bỏ mục, không ghi "—". Tiêu đề tìm Bilibili: làm sạch HTML, chỉ giữ `<em>` ⇒ tô `--ac-txt`. Ảnh tải lười (`loading="lazy"`); đang tải = nền shimmer, lỗi ảnh = nền gradient + logo nguồn (Bilibili cần `Referer` ⇒ qua backend/proxy như plan §3). (B, tuỳ chọn) dòng dịch tiêu đề 🇻🇳 `--t3` dưới tiêu đề.
6. **Nút trên thẻ.** Hiện khi **hover hoặc focus** (bàn phím). `⬇ Tải về` ⇒ vào hàng đợi hiện có với tuỳ chọn đang đặt ở tab Tải về (tóm tắt "Tải với: … Đổi" ở thanh tab con, "Đổi" = sang Tải về, mở popover tuỳ chọn — **không lặp control**). `🎬 Tải & mở Studio` ⇒ như trên + cờ `openInStudio`; thẻ có nhãn "🎬 mở Studio khi xong"; xong ⇒ **tự tạo tab dự án Studio** (§4.11, chấm xanh "xong chưa xem") + toast "✓ Xong … — đã mở tab trong Studio · **Đi tới Studio** (Enter)" — **không tự nhảy màn hình** (người dùng có thể đang lướt/gõ). Trạng thái trên thẻ khớp hàng đợi + lịch sử tải theo **id video** (bvid / YouTube id): ⏳ Đang đợi · ⬇ 46 % + thanh 3 px đáy ảnh · ✓ Đã tải (viền xanh, nút thành `🎬 Mở trong Studio` + `📁`) · ! Lỗi tải (dòng lỗi thay dòng lượt xem, nút `↻ Thử lại`). Bấm lại khi đang tải ⇒ không thêm trùng, nháy thẻ. Chuột phải / `Shift+F10`: Tải về · Tải & mở Studio — Mở trang gốc trong trình duyệt · Sao chép link · Tìm thêm của kênh "…".
7. **Hàng đợi mini** (đáy Khám phá): "⬇ Hàng đợi: N đang tải · M đợi" + tối đa 3 mục (tên + thanh + %), "Xem ở Tải về ›". Ẩn khi hàng đợi rỗng. Đọc từ cùng state hàng đợi của Downloader (không gọi lệnh mới).

**Trạng thái** (mockup E)

| Trạng thái | Hiện | Ghi chú |
|---|---|---|
| Đang tải danh sách | skeleton đúng kích thước thẻ, đủ 1 màn; "↻" thành vòng quay | có cache ⇒ hiện cache ngay, làm mới ngầm |
| Trống | 🔍 "Không có video nào cho "…"" + gợi ý (Bilibili hợp từ khoá tiếng Trung/tên game) + nút "Thử "từ rút gọn"" · "Tìm trên YouTube" · (B) "Bật tự dịch" | không bao giờ khung trống trơn |
| Lỗi mạng | 📡 "Không kết nối được Bilibili/YouTube" + **↻ Thử lại** (nút chính) + 1 dòng mono chi tiết | quá 10 s là báo, không treo |
| Bị chặn | ⛔ "Bilibili đang tạm chặn tìm kiếm từ máy này" (HTTP 412 / code −352/−412; YouTube "Sign in to confirm") + "Thử lại sau 2:00" **đếm ngược** (gấp đôi nếu lặp) + lối sang danh sách còn dùng được | không giả cookie/chữ ký |
| Hết kết quả | vạch "Hết · N video · Lên đầu ↑" | ranking dừng ở 100; tìm dừng khi trang rỗng hoặc trang 10 (200 video) |
| Cuộn vô hạn | còn 600 px tới đáy ⇒ trang sau, 1 hàng skeleton; lỗi ⇒ dòng "Không tải thêm được · ↻ Thử lại", **giữ** thẻ đã có | `IntersectionObserver` trên mốc cuối lưới |
| YouTube chưa có key | 🔑 màn giải thích (mục 4) | |
| "Tất cả" (B) — 1 nguồn lỗi | chip nguồn đó đỏ "!" + tooltip; nguồn kia vẫn hiện | trộn xen kẽ 1–1, không sắp theo lượt xem (万 vs K khác thang) |

**Bàn phím** (chỉ khi tab con Khám phá đang mở; đã đối chiếu §4.10/§4.11 — thợ grep lại `src/` trước khi gắn `/`, `Ctrl+F`)

| Phím | Việc |
|---|---|
| `/` · `Ctrl+F` | focus ô tìm, chọn sẵn chữ |
| `Enter` (ô tìm) | tìm |
| `Esc` (ô tìm) | có chữ ⇒ xoá; rỗng ⇒ bỏ kết quả tìm, về danh sách trước, focus về lưới |
| `↓` (ô tìm) | xuống thẻ đầu |
| `← → ↑ ↓` (lưới) | đi theo ô lưới, số cột đọc từ bố cục thật (`ResizeObserver`); `↑` hàng đầu ⇒ lên hàng chọn danh sách. Roving `tabIndex` (1 thẻ = 0) ⇒ Tab chỉ dừng 1 lần ở lưới |
| `Home` `End` · `PgUp` `PgDn` | đầu/cuối (End kích tải trang sau) · ±1 màn |
| `Enter` · `Shift+Enter` (thẻ) | Tải về · Tải & mở Studio (thẻ đã tải: Enter = Mở trong Studio) |
| `Ctrl+C` · `Shift+F10` | sao chép link · menu chuột phải |
| `← →` · `Enter` (hàng chip) | đi giữa chip (tự cuộn vào tầm nhìn) · chọn |
| `F5` | làm mới danh sách đang xem (bỏ cache) |

ARIA: lưới `role="grid"` (hàng = `row`, thẻ = `gridcell`) hoặc `listbox` đơn giản hơn — thợ chọn; thẻ có `aria-label` "tiêu đề · kênh · thời lượng · lượt xem · trạng thái tải".

**Hẹp cửa sổ (≥ 1024 px, mockup F).** Lưới tự co (1920 = 6 cột · 1440 = 4–5 · 1024 = 3). Dưới 1280 px: nút nguồn chưa chọn chỉ còn logo (tooltip) · công tắc tự dịch còn `文` + công tắc · nhãn chip hot còn "🔥 Douyin" · "Tải với" chỉ giữ chất lượng · hàng đợi mini còn 1 mục. Không có cuộn ngang toàn trang.

**Nấc C — trình duyệt nhúng (phác, mockup G).** Tab con `🌐 Trình duyệt (thử nghiệm)` chỉ hiện khi spike đạt. Thanh công cụ thuộc **cửa sổ chính**: `‹ › ↻` · ô URL (chỉ đọc + gõ được) · pill nền tảng nhận ra ("✓ Douyin · tải được" / Kuaishou đỏ "yt-dlp chưa hỗ trợ" — BUG-082) · `⬇ Tải video đang xem` · `🎬 Tải & mở Studio` · `↗` mở trình duyệt ngoài; dải lối tắt Douyin/TikTok/Bilibili/YouTube/Xiaohongshu + "Xoá dữ liệu duyệt". Trang ngoài nằm trong webview con (hoặc cửa sổ thứ 2) **không có capability**; Rust đọc URL webview (bắt cả đổi route SPA) ⇒ trang ngoài không gửi gì vào app. Nút tắt khi URL không phải trang video (tooltip "Mở một video để tải"). Không cào/tự cuộn trang.

**Component đề xuất** — `src/views/discovery/` (mỗi file < 300 dòng; **không** phình `DownloaderView.tsx`):

| File | Việc |
|---|---|
| `DownloadHubTabs.tsx` (+ `.css`) | thanh tab con Tải về / Khám phá / (Trình duyệt); bọc `DownloaderView` (luôn mount) + `DiscoveryView` |
| `DiscoveryView.tsx` (+ `.css`) | khung: giữ state nguồn / danh sách / từ khoá / trang; ghép các phần dưới |
| `DiscoverySearchBar.tsx` | segmented nguồn + ô tìm + (B) công tắc tự dịch + dòng gợi ý/từ khoá đã dịch |
| `HotTopicChips.tsx` | hàng chip Douyin, cuộn ngang, phím ← → |
| `DiscoveryListTabs.tsx` | nút Đang hot / Bảng xếp hạng / kết quả tìm / (B) danh mục, nước; tuổi cache + ↻ |
| `VideoGrid.tsx` | lưới, roving focus, ảo hoá theo hàng khi > 100 thẻ, cuộn vô hạn, skeleton/hết/lỗi trang sau |
| `VideoCard.tsx` | `React.memo`; props primitive (`item`, `dlStatus`, `dlPct`, `focused`, `rank`) ⇒ tiến độ 1 mục chỉ render lại 1 thẻ |
| `DiscoveryStates.tsx` | trống / lỗi mạng / bị chặn (đếm ngược) / YouTube chưa có key |
| `MiniQueueBar.tsx` | hàng đợi mini |
| `useDiscoveryList.ts` | gọi `discovery_*` qua `src/lib/tauri.ts`, phân trang, huỷ request cũ khi đổi nguồn/từ khoá (chống kết quả về muộn đè kết quả mới), map lỗi → loại (`network` / `blocked` / `no_key` / `other`) |
| `discoveryModel.ts` (thuần) | `formatViews(n, platform)`, `formatAgo(ts, now)`, `stripTitleHtml`, `videoIdOf(url)` (khớp hàng đợi), `gridNav(index, key, cols, total)`, `isLikelyVietnamese(q)` → test `node --test` |

Hàng đợi: `DiscoveryView` nhận từ cha 1 hàm `enqueue(url, { openInStudio })` + snapshot trạng thái hàng đợi theo `videoId` — chỉ dùng lại logic `downloader` sẵn có, không viết hàng đợi thứ 2. "Mở trong Studio" dùng đúng lối mở tab của §4.11 (khử trùng theo đường dẫn).

**Đếm control (nấc A, màn mặc định):** 2 tab con + 2 nguồn + ô tìm + chip (1 vùng cuộn) + ↻ chip + 2 nút danh sách + ↻ danh sách + liên kết "Đổi" + "Xem ở Tải về" = **11 vùng tương tác**, mỗi thẻ 2 nút (chỉ hiện khi hover/focus).

---

## 5. MOCKUP & ẢNH

| File | Mô tả |
|---|---|
| `docs/ui-mockups/_theme.css` | Token Cinema Dark sao y `src/App.css :root` + vài lớp mockup |
| `docs/ui-mockups/studio.html` | Studio 1920×1080: topbar chung, panel trái mới (bước Lồng tiếng đang mở, 2 vai), cột phụ đề có thống kê + chip lọc chất lượng, timeline minh hoạ (**không đổi**) |
| `docs/ui-mockups/tai-video.html` | Tải video: ô nhập 3 link + nút chính, chip tuỳ chọn, bộ chọn playlist, 5 trạng thái mục, menu `⋯` mở |
| `docs/ui-mockups/cai-dat.html` | Cài đặt › Dịch thuật: 5 nhà cung cấp, tự lưu, preset 1 chỗ, trạng thái thật |
| `docs/ui-mockups/voice-picker.html` | Ô chọn giọng (§4.10): 8 ô — đóng, mở, hover/đang phát/chưa có mẫu, tìm + lọc, rỗng, lật lên trên, Cài đặt inline, bảng phím |
| `docs/ui-mockups/shots/voice-picker-all.png` | Ảnh 1920×1080 của `voice-picker.html` |
| `docs/ui-mockups/studio-tabs.html` | Tab dự án Studio (§4.11): toàn cảnh 4 tab + thẻ hover, bảng trạng thái tab, 1 tab, rỗng, tràn + danh sách, kéo đổi thứ tự, menu chuột phải, hộp hỏi đóng tab đang chạy, đổi tên, thả file |
| `docs/ui-mockups/shots/studio-tabs.png` | Ảnh 1920×2700 của `studio-tabs.html` |
| `docs/ui-mockups/v014-subtitle-style.html` | Kiểu phụ đề + làm mờ phụ đề cứng (§4.12): toàn cảnh Studio, thẻ Kiểu phụ đề (Bình thường / Nhảy chữ, 4 mẫu chữ chạy thật — có 30 dòng JS sinh keyframes), 6 trạng thái dò, khung dải (nghỉ / chỉnh / đang kéo / đang dò / tự đặt), modal Xuất tóm tắt |
| `docs/ui-mockups/v015-discovery.html` | Khám phá v0.15 (§4.13): toàn cảnh 1920×1080, thanh tìm + tự dịch (B) 5 trạng thái, chọn danh sách (Bilibili / YouTube chưa có key / có key), 12 thẻ đủ trạng thái + menu chuột phải, 6 trạng thái danh sách, cửa sổ 1024 px, phác nấc C, bảng phím. Có ~60 dòng JS chỉ để sinh thẻ lặp; `#a`…`#h` trên URL = chỉ hiện 1 khu (dùng khi chụp) |
| `docs/ui-mockups/shots/v015-discovery-*.png` | Ảnh Edge headless: `-a-toan-canh` (1920×1080), `-b-thanh-tim`, `-c-danh-sach`, `-d-the-video`, `-e-trang-thai`, `-f-hep-1024`, `-g-trinh-duyet`, `-all` (1920×6300) |
| `docs/ui-mockups/shots/after-*.png` | Ảnh mockup (Edge headless 1920×1080) |
| `docs/ui-mockups/shots/compare-*.png` | **Trước | Sau** đặt cạnh nhau cho Studio, Tải video, Cài đặt |

Tổng dung lượng thư mục `shots/` ≈ 3 MB (< 15 MB). Mockup là HTML tĩnh, không JS — mở trực tiếp bằng trình duyệt.

---

## 6. KẾ HOẠCH CODE VÒNG 2

**Điều kiện bắt đầu:** mcode xong `TSK-TIMELINE-INTEGRATE-MODULES` (`SublixStudioView.*`) và CommandCode xong `TSK-FEAT-DL-PLATFORMS-REUP` (`DownloaderView.*`). Vòng 2 chỉ đụng **phần JSX/CSS của panel/topbar/danh sách**, không đụng handler.

### 6.1 Thứ tự & file

| Bước | Việc | File | Ước lượng |
|---|---|---|---|
| **R2-1** | Token + lớp dùng chung: `--step-*`, `.ui-seg`, `.ui-chip-opt`, `.ui-split-btn`, `.ui-row-menu` (menu ⋯/chuột phải dùng chung) | `src/App.css`, mới `src/components/ui/SplitButton.tsx`, `ContextMenu.tsx`, `Segmented.tsx` (mỗi file < 120 dòng) | 0,5 ngày |
| **R2-2** | `MasterTopbar` dùng chung, bỏ 2 bản copy, badge cho cả Studio, bỏ nút Tiến trình modal + chấm theme | mới `src/views/MasterTopbar.tsx/.css`; sửa `SettingsView.tsx:1281-1426`, `SublixStudioView.tsx:5572-5735` | 0,5 ngày |
| **R2-3** | Studio panel trái: tách ra `src/views/studio/StudioPipelinePanel.tsx` (nhận state + handler qua props, **không chuyển state**), accordion 1-bước-mở, split button, chuột phải vai, bỏ tab Review (thống kê → header cột phụ đề) | `SublixStudioView.tsx:5742-6917` (thay bằng `<StudioPipelinePanel …/>`), `SublixStudioView.css` (các lớp `studio-step-card*`, `studio-tts-*`, `studio-active-tts-hud*`, `studio-action-hub*`) | 1,5 ngày |
| **R2-4** | Studio: dòng provider chỉ đọc + liên kết sang Cài đặt; xoá field API key khỏi Studio (state đọc từ config) | `SublixStudioView.tsx:5920-6026`, `handleSaveProviderConfig` chỉ còn gọi từ Cài đặt | 0,5 ngày |
| **R2-5** | Cài đặt › Dịch thuật hợp nhất 5 provider (thêm DeepSeek/OpenRouter vào UI Cài đặt — backend đã hỗ trợ), tự lưu, preset 1 chỗ, mục Giọng đọc TTS, Chủ đề | `SettingsView.tsx:1889-3135` (tách `src/views/settings/*.tsx` theo mục để mỗi file < 300 dòng) | 1,5 ngày |
| **R2-6** | Tải video: bố cục 1 cột, nút Tải cạnh ô nhập, chip tuỳ chọn + popover Nâng cao, tự đọc link khi dán (debounce, tái dùng `handleInspect`), danh sách dạng hàng + `⋯` | `DownloaderView.tsx:1051-1668`, `DownloaderView.css`, `DownloaderBatchPicker.tsx` (chỉ style) | 1 ngày |
| **R2-7** | Live / Lịch sử / Tiến trình gọn lại (§4.5-4.7); sửa thẻ phần cứng ghi cứng → đọc config | `SettingsView.tsx:1482-1888, 3135-3304`, `ProcessCenterView.tsx` | 1 ngày |
| **R2-8** | Verify: `tsc`, `npm run build`, chụp lại 6 tab trên instance riêng (cùng cách vòng 1), so ảnh với mockup, test tay qua CDP: chạy A→Z, chạy riêng từng bước, chạy vùng In/Out, Dừng, chuột phải vai, tải 2 link + playlist | — | 0,5 ngày |

**Tổng ước lượng:** ~7 ngày công agent (có thể song song R2-5/R2-6 ở 2 worker vì khác file).

### 6.2 Rủi ro & cách giữ an toàn

| Rủi ro | Cách tránh |
|---|---|
| Làm hỏng hiệu năng timeline 323 câu (`React.memo`, throttle `onTimeUpdate` 120 ms — `TSK-STUDIO-PERF-TIMELINE-FIX`) | Panel mới là component con **`React.memo`**, props là state nguyên thuỷ + handler **ổn định** (`useCallback`/ref như `blockApiRef` của Sonnet); **không** truyền `currentTime` vào panel; không đụng JSX timeline/khối kéo thả |
| Đụng logic kéo-thả / In-Out (`BUG-076..081`) | Chỉ đọc `inPoint/outPoint/useRangeOnly` để hiện mục menu "Chỉ vùng In–Out"; gọi đúng handler cũ |
| Đụng logic downloader (hàng đợi 3 song song, BUG-053, dedupe, sub-pass) | Chỉ đổi JSX/CSS; giữ nguyên `handleStartDownload`, `handleInspect`, `handleFetchSubs`, listener sự kiện; DownloaderView vẫn **luôn mount** (BUG-045) |
| Mất cấu hình provider khi chuyển nguồn sự thật | Studio đọc `getConfig()` + nghe `config:updated`; migration: nếu config có `deepseek_*`/`openrouter_*` thì Cài đặt hiện đúng |
| Mất tính năng ẩn sau khi gom vào chuột phải | Mỗi mục menu có tooltip + phím tắt; thêm dòng gợi ý "chuột phải: …" một lần dưới tiêu đề nhóm; checklist §2 dùng làm danh sách kiểm thử "không mất chức năng" (mỗi dòng Bỏ/Chuyển phải còn đường vào) |
| Hành vi "1 người" đổi (không còn gộp ngầm) | Ghi vào changelog; gộp vẫn có ở chuột phải + Hoàn tác |
| File quá lớn (`SublixStudioView.tsx` 8.9k dòng, `SettingsView.tsx` 158 KB) | Tách component mới < 300 dòng/ file theo quy tắc AGENTS.md; không refactor thêm ngoài phạm vi |
| Xung đột với worker đang sửa cùng file | Khoá task trong PROJECT_STATE trước khi sửa; bắt đầu từ `master` mới nhất sau khi 2 task kia được commit |

### 6.3 Quyết định đã tự chốt (không hỏi PO, theo nguyên tắc UX)

- Bỏ tab "Tóm tắt & Review" ở panel trái (thống kê không mất, chỉ chuyển chỗ). Khi làm GĐ6 (tóm tắt thật) sẽ là một **chế độ** của bước Dịch, không phải tab riêng.
- Nhà cung cấp dịch + API key chỉ cấu hình ở Cài đặt.
- Danh sách tải dạng hàng (không dạng thẻ to).
- Timeline giữ nguyên 100 % ở vòng 2.

Không có quyết định nào không thể đảo ngược ở vòng 1 (chỉ tài liệu + mockup).
---

## 7. TIẾN ĐỘ CODE VÒNG 2 (cập nhật 2026-10-24 · worker `Mavis/mcode`)

| Bước | Trạng thái | Ghi chú |
|---|---|---|
| **R2-1** Token + component dùng chung | ✅ Xong | `src/App.css` (+`--step-sub/--step-tr/--step-dub`); `src/components/ui/{Segmented,SplitButton,ContextMenu}.tsx` + `ui.css` (mỗi file TSX < 120 dòng) |
| **R2-2** `MasterTopbar` dùng chung | ✅ Xong | `src/views/MasterTopbar.tsx/.css`; thay cả 2 bản copy (Studio + `SettingsView.tsx`). Chuột phải nút ↶ → menu 3 lớp hoàn tác (Audio / Bản dịch / Phụ đề) — thay 3 chip cũ. Bỏ nút "Tiến Trình" dạng modal + nút "Nhập video" trùng; overlay còn 1 biểu tượng 👁 |
| **R2-3** Panel trái Studio 5 bước | ✅ Xong | `src/views/studio/{StudioPipelinePanel,StudioVoiceStep,studioPipelineTypes}.tsx/.ts` + `.css`. Rail 5 bước · accordion 1-mở · 1 nút chạy split (`▶ Chạy N bước đã bật \| ▾`) · chuột phải vai (giọng gốc · gộp · về 1/2 vai · xoá) · engine + giọng **đọc từ backend** (`tts_engines_status` + `dubbing_get_voices`) — đã **gỡ `TTS_ENGINE_MODELS` hard-code** và **gỡ map `vietneu:`→`kokoro:`** (backend tự fallback ở `tts_vieneu::route_voice`) |
| **R2-4** Provider dịch chỉ đọc | ✅ Xong | Dòng "Ollama · qwen2.5:3b — **Đổi**" (mở Cài đặt); **xoá hẳn** 3 select model + 3 ô API key khỏi Studio |
| R2-5 Cài đặt › Dịch thuật | ⏭ Chưa làm | Ngoài phạm vi dispatch này |
| R2-6 Tải video | ⏭ Chưa làm | Ngoài phạm vi dispatch này |
| R2-7 Live / Lịch sử / Tiến trình | ✅ 3/3 xong | **Live + Lịch sử ✅ (R2-7B)** — tách ra `src/views/live/{LiveView,liveLogic,liveTypes}.tsx/.ts` + `src/views/history/{HistoryView,historyLogic}.tsx/.ts` (+ 2 file `.css`). `SettingsView.tsx` **2823 → 2245 dòng**. Logic thuần tách riêng → `node --test scripts/live-history-tests/` (**40/40 PASS**). Sửa luôn **BUG-033** (hotkey `Ctrl+Shift+L` đọc closure cũ → nay đi qua `latestRef`). · **Tiến trình ✅ (R2-7C)** — `src/views/processLogic.ts` + `processTypes.ts` (mới) + `ProcessCenterView.tsx/.css` (viết lại), **xoá** `ProcessCenterModal.tsx/.css` (TL-14: chỉ còn 1 giao diện); 6 chip lọc ngang (`Segmented`) + menu `⋯`; `node --test scripts/process-tests/` (**23/23 PASS**) |
| **TSK-STUDIO-GLOSSARY** Bảng thuật ngữ + xưng hô (bước "Dịch") | ✅ Xong | Nút **"📖 Thuật ngữ & xưng hô (N)"** ở bước Dịch → drawer bọc `GlossaryEditor` (Cinema Dark). Nạp `glossary_get(projectPath)` khi mở project · lưu `glossary_set` **debounce 400ms** (không cần bấm Lưu) · gợi ý **"⚡ Gợi ý từ kịch bản"** = 1 lượt đọc hiểu (có tiến trình + ước tính thời gian), **không tự ghi** (người dùng bấm ✓ mới nhận). Câu vi phạm → **tô vàng** (thẻ phụ đề + khối timeline) + badge/tooltip lý do + menu chuột phải **"🔁 Dịch lại câu này"**. `translate_script_contextual` nay truyền `projectPath` ⇒ backend áp **bảng dự án** làm ràng buộc cứng. Gợi ý nhỏ cạnh công tắc ngữ cảnh: *"Khoá bảng xưng hô để dịch nhất quán hơn"* |

### 7.1. Bảng "không mất chức năng" (checklist §2)

Mỗi control bị bỏ/chuyển đều còn **đường vào** mới:

| Control cũ | Đường vào mới |
|---|---|
| 2 tab "Thuyết Minh & Lồng Tiếng" / "Tóm Tắt & Review" | 1 panel; thống kê + đánh giá kịch bản chuyển vào **"⚙ Nâng cao"** (giữ nguyên nội dung cũ) |
| Select "Mô hình nhận dạng" | "⚙ Nâng cao" |
| 3 select provider + 3 ô API key + 3 select model | Dòng **chỉ đọc** "Nhà cung cấp: … — **Đổi**" → mở Cài đặt |
| "Nút Lưu hồ sơ" | Tự lưu khi thêm/xoá cặp xưng hô |
| Nút "+ Thêm" (hồ sơ) | Enter trong ô nhập |
| Chip "1 Người ⭐" (gộp ngầm) | Segmented "Tự động · 1 người · 2 người" — **không gộp ngầm**; gộp nằm ở chuột phải vai (có Hoàn tác) |
| Chip tổ hợp giới tính (1N1N / 2N / 2Nữ) | Bỏ (mỗi hàng vai có nút giới tính) + "Về 2 vai" trong menu vai |
| "Gộp vai…" modal | Chuột phải vai: "⇢ Gộp vào…", "⇢ Gộp tất cả về vai này", "👥 Về 2 vai", "👤 Về 1 vai" |
| 3 thẻ engine + 3 nút "▶ Mẫu" + badge spec + HUD "Model TTS đang dùng" | 1 segmented engine (trạng thái backend) + 1 ▶ mẫu + select giọng mỗi vai |
| "✨ Áp dụng VietNeu cho tất cả vai" | Chuột phải vai: "🎯 Giọng mặc định engine cho mọi vai" |
| "🔊 Giọng gốc" mỗi vai | Chuột phải vai: "🔊 Nghe giọng gốc" |
| "🗑 Xoá vai" | Chuột phải vai: "🗑 Xoá vai" |
| 6 nút chạy + 2 nút Dừng + thanh "vùng chọn" + pill "chế độ" | 1 nút split `▶ Chạy N bước đã bật \| ▾` (menu: chỉ phụ đề / chỉ dịch / chỉ lồng tiếng / chỉ vùng In–Out); ▶ nhỏ trên mỗi tiêu đề bước = chạy riêng bước đó |
| 3 chip hoàn tác (Audio / Bản dịch / Phụ đề) | Chuột phải nút ↶ trên topbar |
| "📥 Nhập video" (trùng "Mở video") | Bỏ (giữ nút "＋ Mở video") |
| 4 chấm đổi theme | **Tạm giữ** trong vùng ngữ cảnh của topbar cho tới khi R2-5 thêm mục "Chủ đề" vào Cài đặt (theo §4.2 là chuyển hẳn sang Cài đặt) |

**Live (§4.5) — R2-7B**

| Control cũ | Đường vào mới |
|---|---|
| Select "Chế độ xuất" + select "Ngôn ngữ đích" (2 ô) | **1 select "Phụ đề hiển thị"** (📝 Gốc · Dịch sang 🇻🇳/🇺🇸/🇯🇵/🇨🇳/🇰🇷). Chọn "Gốc" **giữ nguyên** ngôn ngữ đích đã chọn (không mất lựa chọn) |
| Nút "Quét Âm Thanh" | **Nút ↻ cạnh select thiết bị** (tooltip "Quét âm thanh — tìm thiết bị đang phát tiếng"); kết quả vẫn hiện bảng mức âm + nút "Chọn" |
| Nút "↻" đầu card (làm mới danh sách thiết bị) | Giữ nguyên ở đầu card "Thiết bị âm thanh (WASAPI)" |
| Select "Độ dài phân đoạn tối đa" + checkbox "Smart VAD" | Khối **"⚙ Nâng cao"** (gấp mặc định, ghi tắt tắt khi đóng) |
| Nút "Mở Cửa Sổ Overlay" | Nút **👁 trên topbar** (TL-16) — không mất đường vào |
| Nút "▶ Bắt đầu Live" + "■ Dừng Live" (2 nút) | **1 nút chính duy nhất** "▶ Bắt đầu Live" ↔ "■ Dừng Live" (đổi nhãn theo trạng thái) |
| Cột phải "Luồng thoại" | Giữ nguyên, thêm nút 🗑 xoá danh sách tạm |

**Lịch sử (§4.6) — R2-7B**

| Control cũ | Đường vào mới |
|---|---|
| Cột trái 300 px chỉ chứa 4 nút | **Bỏ cột trái** → 2 cột: danh sách (ô tìm + thanh công cụ) \| chi tiết câu |
| Nút "Sao chép tất cả" | Thanh công cụ đầu danh sách: **Sao chép tất cả** |
| Nút "Xuất .SRT" + "Xuất .TXT" (2 nút) | **Split button `Xuất .SRT \| ▾`** → menu "Xuất .SRT" / "Xuất .TXT" |
| Nút đỏ "Xoá toàn bộ lịch sử" (chiếm 1/4 màn hình) | **Menu `⋯` → "Xoá toàn bộ lịch sử"** + **hộp xác nhận** (nút nguy hiểm không còn nổi bật nhất màn hình) |
| Ô tìm kiếm (ở cột trái) | Ô tìm **trên đầu danh sách** + bộ đếm `x/y` |
| Thẻ chi tiết câu (ở cột phải) | Cột phải "Chi tiết câu thoại" (bản gốc / bản dịch / nút "Sao chép câu này") |

**Tiến trình (§4.7) — R2-7C**

| Control cũ | Đường vào mới |
|---|---|
| 6 nút lọc **dọc** ở cột trái ("Tất cả tác vụ", "⚡ Đang xử lý", "💬 Phụ đề & Dịch thuật", "🎙️ Lồng tiếng & Phân vai", "⬇️ Tải video", "📦 Mô hình AI") | **6 chip lọc ngang** (`Segmented`) trên đầu danh sách, **kèm số đếm**: `Tất cả (6)` · `Đang chạy (3)` · `Phụ đề & Dịch (2)` · `Lồng tiếng (1)` · `Tải video (1)` · `Mô hình (2)`. Nhãn lấy từ hằng số `PROCESS_FILTERS` → **không còn ký tự lạ** ("Tải videoo", "Đang xử lýo") |
| Nút "📁 Mở Thư Mục Thành Phẩm" | **Menu `⋯`** đầu danh sách → "📁 Mở Thư Mục Thành Phẩm" |
| Nút "📥 Mở Thư Mục Tải Về" | **Menu `⋯`** → "📥 Mở Thư Mục Tải Về" |
| Nút "🗑 Xóa Lịch Sử Tiến Trình" (đỏ, ở cột trái) | **Menu `⋯`** → "🗑 Xoá Lịch Sử Tiến Trình" (mục **nguy hiểm**, tách vạch) + **hộp xác nhận** "Xoá toàn bộ lịch sử tiến trình (N tác vụ)? Không thể hoàn tác." |
| Thẻ "Động Cơ & Phần Cứng AI" (ghi cứng) | Đã gỡ ở R2-7 → cột phải "Trạng thái thật" (đọc config) + trỏ sang **Cài đặt › Trạng thái hệ thống** |
| Thẻ "Hướng Dẫn & Lưu Ý" | **Câu hướng dẫn trong trạng thái rỗng** (riêng cho từng nhóm lọc) |
| Nút "📊 Tiến Trình (N)" trên topbar → **modal ProcessCenter** | **Chip "⚡ N" trên tab "Tiến trình"** + **chip trạng thái** trên topbar → đi thẳng sang tab (đã có sẵn từ R2-2); **modal đã xoá** (TL-14) — nút "Mở Tiến Trình" của toast nền cũng chuyển sang tab |

### 7.2. Kiểm chứng

- `npx tsc --noEmit` → **0 lỗi** · `npm run build` → **OK** · `node --test scripts/timeline-tests/` → **79/79 PASS**
- **R2-7B (Live + Lịch sử):** `npx tsc --noEmit` → **0 lỗi** (cả repo) · `npm run build` → **OK** (104 module) · `node --test scripts/live-history-tests/` → **40/40 PASS** · `node --test scripts/settings-tests/` → **21/21 PASS**. Ảnh thật (Edge headless 1920×1080, app chạy thật + backend giả): tab **Live** (select gộp "Phụ đề hiển thị", ↻ cạnh select thiết bị, khối "⚙ Nâng cao" gấp, 1 nút chính) + tab **Lịch sử** (2 cột, ô tìm + `Sao chép tất cả` + split `Xuất .SRT` + `⋯`) → **render đúng**. `SettingsView.tsx` **2823 → 2245 dòng**.
- ⚠️ `node --test scripts/timeline-tests/` → **89/91** (2 fail ở `estimate.test.ts`): do `src/lib/timeline/estimate.ts` đang **sửa dở** của worker khác (`rateKey` tại `estimate.ts:119`) — tại `HEAD` cùng bộ test **91/91 PASS** ⇒ không liên quan R2-7B.
- **R2-7C (Tiến trình):** verify trên **bản sao HEAD + file của tôi** → `npx tsc --noEmit` **0 lỗi** · `npm run build` **OK** (103 module) · `node --test`: `process-tests` **23/23** · `live-history-tests` **40/40** · `settings-tests` **21/21** · `timeline-tests` **95/95**. Ảnh frontend-only (Edge headless 1920×1080): tab Tiến trình với dữ liệu giả (6 chip kèm số đếm + menu `⋯` 3 mục + hộp xác nhận xoá) và **app thật** (tab "Tiến trình" active, trạng thái rỗng có câu hướng dẫn) → **render đúng**.
- GUI trên instance riêng (CDP 9225, Vite 1423, exe copy trỏ 1423): **8/9 PASS** — panel 5 bước render, MasterTopbar 6 tab, 25 control (mục tiêu ~20), provider chỉ đọc có nút "Đổi" và **0 ô API key**, chuột phải vai ra 7 mục menu, nút split + menu 4 mục, **hồi quy kéo khối + kéo handle In/Out vẫn chạy**.
- ⚠️ Check "engine hiện 4 trạng thái" **không chạy được**: `src-tauri/target/debug/sublix.exe` (bản app PO đang dùng) **chưa có** lệnh `tts_engines_status` (lệnh đã có trong source `src-tauri/src/lib.rs:772`, build mới có, nhưng **Windows Application Control chặn chạy file exe vừa build**). UI xử lý graceful: hiện "Đang tải trạng thái engine TTS…" thay vì vỡ. Cần app build lại từ source hiện tại để thấy trạng thái thật.
- **TSK-STUDIO-GLOSSARY (bảng thuật ngữ + xưng hô):** `node --test scripts/timeline-tests/` **121/121 PASS** (21 case mới trong `glossary.test.ts`) · `npx tsc --noEmit` **0 lỗi** · `npm run build` **OK**. GUI trên **instance riêng** (release build `--no-bundle`, CDP 9227, **identifier riêng `com.sublix.verify.glossary`** + APPDATA riêng ⇒ không đụng app/config của PO) — **19/19 PASS**: nút "📖 Thuật ngữ & xưng hô (N) 🔒" ở bước Dịch · drawer mở + 2 tab + `GlossaryEditor` · "+ Thêm thuật ngữ" tạo dòng nhập · **debounce 400ms ghi file dự án** `<video>.sublix-glossary.json` (`scope:"project"`) · **round-trip** reload → nạp lại từ file · câu vi phạm **tô vàng** (card + khối timeline) + badge/tooltip lý do · menu chuột phải có **"Dịch lại câu này"** · gợi ý hiện **tiến trình + ước tính thời gian**. E2E với **Ollama thật**: dịch lại 1 câu → ra **"mẫu tử tối"** (theo bảng dự án, không còn "Dark Templar") + gợi ý LLM hiện dạng **✓/✕**.
