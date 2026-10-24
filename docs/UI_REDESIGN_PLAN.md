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

---

## 5. MOCKUP & ẢNH

| File | Mô tả |
|---|---|
| `docs/ui-mockups/_theme.css` | Token Cinema Dark sao y `src/App.css :root` + vài lớp mockup |
| `docs/ui-mockups/studio.html` | Studio 1920×1080: topbar chung, panel trái mới (bước Lồng tiếng đang mở, 2 vai), cột phụ đề có thống kê + chip lọc chất lượng, timeline minh hoạ (**không đổi**) |
| `docs/ui-mockups/tai-video.html` | Tải video: ô nhập 3 link + nút chính, chip tuỳ chọn, bộ chọn playlist, 5 trạng thái mục, menu `⋯` mở |
| `docs/ui-mockups/cai-dat.html` | Cài đặt › Dịch thuật: 5 nhà cung cấp, tự lưu, preset 1 chỗ, trạng thái thật |
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
