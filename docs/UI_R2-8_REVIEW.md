# TSK-UI-R2-8-REVIEW — Duyệt thẩm mỹ cuối giao diện vòng 2

> **Ngày:** 2026-10-25 · **Người duyệt:** Opus (người thiết kế `UI_REDESIGN_PLAN.md` + `docs/ui-mockups/*`)
> **Nguồn:** 12 ảnh `docs/ui-mockups/shots/after-*.png` (1920×1080) so với `before-*.png` + mockup `studio / tai-video / cai-dat / voice-picker.html`; báo cáo chức năng `UI_R2-8_VERIFY.md`. Không chạy app, không sửa `src/**`.
> **Kết luận:** Vòng 2 **đạt về bố cục** (Tải video, Lịch sử, Live, khung Cài đặt gần như đúng mockup). Còn **7 lỗi P1** tập trung ở 3 chỗ: **trạng thái mâu thuẫn** (model "Đang dùng" nhưng "Chưa tải", CUDA trên máy không có NVIDIA), **nút Lưu thừa** trái Zero-Button, và **ô nhập trắng** ở Cài đặt › Dịch thuật.

**Mức:** P1 = lệch thiết kế rõ / gây hiểu sai / khó dùng · P2 = thẩm mỹ · P3 = tinh chỉnh.
**Chia việc:** cột "File cần sửa" đã gom để **không chồng file** — xem gợi ý gói việc ở cuối.

---

## P1 — Lệch thiết kế rõ / gây hiểu sai (7)

| # | Tab · ảnh | Mô tả | Cách sửa cụ thể | File cần sửa |
|---|---|---|---|---|
| 1 ✅ | Studio · 01a/01b/01c | Bước "Phụ đề gốc" nhồi nguyên **thẻ model SenseVoice to** (~330 px: mô tả, license, RTF, thanh tiến trình rỗng, nút Tải) vào panel 340 px → tên model vỡ 4 dòng "Small (int8 · 2024-07-17)", đẩy "Ngôn ngữ gốc" xuống dưới đáy. Mockup: bước chỉ có 1 dòng tóm tắt, chi tiết model nằm ở **Nâng cao**. | Trong Studio **không dùng `ModelDownloadRow` đầy đủ**: thay bằng 1 dòng gọn `⚠ SenseVoice chưa tải (228 MB) · [Tải]` (class `spp-note` + nút `ui-mdl-btn is-primary`), tiến trình hiện inline thay chữ khi đang tải. Mô tả/license chỉ ở Cài đặt › STT. | `src/views/studio/StudioSttEnginePicker.tsx:90-107` |
| 2 ✅ | Studio 01a + Cài đặt 06c | Model **chưa tải** nhưng gắn badge **"Đang dùng"** (cùng lúc chữ "Chưa tải" + nút "Tải"); ô "Gợi ý" bên trên lại bảo dùng Whisper base; cột phải ghi "Whisper base · CPU". 3 nguồn nói 3 điều. | `ModelDownloadRow`: chỉ hiện badge "Đang dùng" khi `selected && downloaded`; khi `selected && !downloaded` → badge vàng **"Đã chọn · cần tải"** (`--warn` token). Engine đang chạy thật (cột phải) phải là nguồn duy nhất cho chữ "Đang dùng". | `src/components/ui/ModelDownloadRow.tsx:127` |
| 3 ✅ | Studio 01a/01b | Dòng ước lượng "⏱ Nhận dạng (**Whisper Large-v3-Turbo** · CPU): ~vài giây" trong khi engine chọn là **SenseVoice** — lấy từ `sttModel` cũ, không theo engine mới. | Lấy nhãn từ engine đang chọn (`sttEngines.find(id===selectedSttEngine).label`), bỏ nhánh `"base" ? … : "Whisper Large-v3-Turbo"`. | `src/views/SublixStudioView.tsx:6372` |
| 4 | Studio · 01d | Drawer "Thuật ngữ & xưng hô" có nút **"💾 Lưu" màu chính** ngay trên dòng chân "Tự động lưu khi thay đổi — **không cần bấm "Lưu"**". Tự mâu thuẫn, trái Zero-Button. | Xoá nút `💾 Lưu` (hoặc chỉ render khi `!autoSave` cho Cài đặt). Thay bằng trạng thái nhỏ cạnh tiêu đề: `✓ Đã lưu` / `Đang lưu…` (`--t3`, 11px). | `src/components/glossary/GlossaryEditor.tsx:150-158` |
| 5 ✅ | Cài đặt › Dịch · 06b | Ô **API key** và ô **Model** hiện **nền trắng, viền native Windows**, chữ đen mono — vỡ hẳn Cinema Dark. Nguyên nhân: class `settings-input` **không còn style gốc** (CSS chỉ có `.st-key-row .settings-input { flex… }`). | Thêm style gốc: `.settings-input { height:32px; padding:0 10px; border-radius:8px; background:var(--bg-inset); border:1px solid var(--line); color:var(--t1); font-size:12.5px; } .settings-input:focus { border-color:var(--ac-br); box-shadow:0 0 0 3px var(--ac-soft); outline:0 }`. Kiểm luôn ô key ở TTS (dùng chung class). | `src/views/SettingsView.css:~1177` |
| 6 ✅ | Cài đặt › Dịch · 06b | Nút **"💾 Lưu cấu hình"** màu chính + chú thích "Tự lưu… nút Lưu chỉ để chắc chắn". Mockup đã chốt **không có nút Lưu**. | Xoá nút; giữ "Dịch thử" làm nút duy nhất. Chú thích đổi thành "Tự lưu khi thay đổi." Toast nhỏ `✓ Đã lưu` khi đổi provider/model. | `src/views/settings/TranslationSection.tsx:340-350` |
| 7 ✅ | Cài đặt › STT · 06c | Segmented "Tăng tốc Whisper" chọn **CPU** nhưng dưới ghi **"Đang chạy: CUDA"** (máy không có NVIDIA). Người dùng sẽ tin app chạy GPU. | Khi `runtimeEngine` khác lựa chọn: hiện cảnh báo `⚠ Đang chạy CUDA — khởi động lại server để áp dụng CPU` (`--warn`). Khi chưa có server: "Chưa nạp". Kiểm lại nguồn `runtimeEngine` (có thể là giá trị mặc định). | `src/views/settings/SttSection.tsx:160-166` |

## P2 — Thẩm mỹ (10)

| # | Tab · ảnh | Mô tả | Cách sửa cụ thể | File cần sửa |
|---|---|---|---|---|
| 8 ✅ | Studio · 01b/01c | Thẻ câu cột phải **cao ~150 px**/câu (±0.1s, select vai, ô dịch, "Nghe câu", ✂, 🗑 luôn hiện) → màn 1080 chỉ thấy **4/8 câu**; ô dịch 1 dòng **cắt chữ** ("…chuyện thành rı"). Mockup: thẻ ~70 px, vai = chấm màu. | Thẻ mặc định: dòng mã thời gian + chấm vai (`● Người dẫn`), dòng gốc (`--t3` 11px), dòng dịch (12.5px/600, **xuống dòng**, `textarea` auto-height). Nút ±0.1s / select vai / ✂ / 🗑 / Nghe chỉ hiện ở thẻ **đang chọn** hoặc `:hover`. Mục tiêu ≥ 7 câu/màn. | `src/views/SublixStudioView.tsx:330-470` |
| 9 ✅ | Studio · 01b | Đầu cột phải thiếu **thống kê** (8 câu · 40s · 1 vai · WPM) và chip lọc hữu ích ("Chưa dịch", "Thiếu tiếng", "Câu >12s") theo mockup; chỉ có "Tất cả / tên vai". Thống kê đang bị chôn ở Nâng cao. | Thêm hàng `.stats` cạnh tiêu đề "Phụ đề" (11px `--t3`, số `--t1` đậm) + 3 chip lọc trạng thái trước chip vai. | `src/views/SublixStudioView.tsx` (vùng header cột phải, cạnh ô "Tìm trong phụ đề…") |
| 10 ✅ | Studio · 01a | Gợi ý timeline vẫn ghi **"Bấm nút 'Bắt Đầu Xử Lý AI'"** — nút này không còn. | Đổi thành: `Bấm ▶ Chạy N bước đã bật ở panel trái, hoặc khoanh vùng trên timeline rồi bấm chuột phải.` | `src/views/SublixStudioView.tsx:9316` |
| 11 ✅ | Studio · 01b | Timeline chỉ rộng tới x≈1410, **500 px phải bỏ trống đen**; nhãn track "TIẾNG LỒ M" bị cắt; "(Chưa tạo Sub / Voice)" lẫn tiếng Anh. | Vùng track `flex:1` / `width:100%` theo khung; cột nhãn tăng 160→176 px hoặc `text-overflow:ellipsis` + `title`; đổi chữ thành "(Chưa có phụ đề / giọng)". | `src/views/SublixStudioView.tsx:8750` + CSS track của Studio |
| 12 ✅ | Studio vs các tab · mọi ảnh | **2 topbar khác nhau**: Studio có version **v0.12.0**, theme dots, không có 👁; tab khác **v0.11.36**, có 👁, trạng thái "● ✓ Sẵn sàng" (chấm + dấu ✓ thừa). Chuyển tab thấy topbar "nhảy". | Một nguồn version (`appInfo.version`) cho cả 2; thêm 👁 vào topbar Studio (mockup có); bỏ "✓ " ở pill trạng thái (đã có chấm xanh). Về lâu dài gộp 1 topbar. | `src/views/SettingsView.tsx:1624` · `src/views/SublixStudioView.tsx:~6921, 7240` |
| 13 | Live · 03 | **Hai nút ↻ giống hệt nhau** cạnh nhau (đầu card = làm mới danh sách; cạnh select = quét âm thanh) → không phân biệt được. | Nút cạnh select dùng icon khác (`IconRadar`/`IconActivity` hoặc 🔊 sóng) + nhãn chữ "Quét" (lv-btn tiny); giữ ↻ ở đầu card. | `src/views/live/LiveView.tsx:314-323` |
| 14 | Live · 03 | Cờ emoji không hiển thị trên Windows → ra chữ "JP Japanese", "Dịch sang **VN** Tiếng Việt"; tiêu đề "⚙ Nâng cao" có **2 bánh răng** (icon SVG + emoji). | Bỏ `flag` khỏi nhãn option (Windows không vẽ cờ); `title="Nâng cao"` (bỏ "⚙ "). Hint "Dịch sang vi" → dùng tên ngôn ngữ ("Tiếng Việt"). | `src/views/live/liveLogic.ts:85` · `src/views/live/LiveView.tsx:255, 280, 385` |
| 15 ✅ | Tiến trình · 05 | Viết **Title Case** khắp nơi ("Tổng Quan Tiến Trình", "Tiến Trình Đang Chạy Nền", "Lịch Sử Hoàn Tất Gần Đây", "Quét Phân Tích & Phân Vai", "Mở Lại Trong Studio") — các tab khác đã sentence case. | Sentence case: "Tổng quan", "Đang chạy nền", "Hoàn tất gần đây", "Quét phân tích & phân vai", "Mở lại trong Studio". | `src/views/ProcessCenterView.tsx:200, 272, 414, 499` (+ nhãn loại task) |
| 16 ✅ | Tiến trình · 05 | Thẻ lịch sử lặp thông tin: badge loại = tiêu đề; thời gian chạy 2 lần ("⏳ 5s" + "Thời gian chạy: 5s"); giờ **12:20:36 PM** (AM/PM); "File:C:\…" dính chữ + 2 nút icon dính sát đường dẫn. | 1 dòng tiêu đề `tên file` + meta `Quét phân tích & phân vai · 1 vai, 8 câu · xong 12:20 · 5s`; giờ 24h `toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})`; đường dẫn mono ellipsis, nút 📁/📋 cách `gap:6px` đặt cuối hàng. Thẻ cao ~180→~90 px. | `src/views/ProcessCenterView.tsx:54, 440-505` |
| 17 ✅ | Tiến trình · 05 | 3 cột cho ít nội dung: cột trái "Tổng quan" **lặp lại số đếm** đã có trên chip; cột phải "**Trạng thái thật**" ghi "Engine dịch: **CPU**" (sai nhãn) và trùng chức năng với "Trạng thái hệ thống" của Cài đặt nhưng khác trường. | Bỏ cột trái (số đếm đã ở chip + topbar); cột phải dùng **chung 1 component** với Cài đặt › "Trạng thái hệ thống" (Nhận dạng · Dịch · Live · Giọng đọc). Tên "Trạng thái hệ thống". | `src/views/ProcessCenterView.tsx:195-215, 512-535` |

## P3 — Tinh chỉnh (6)

| # | Tab · ảnh | Mô tả | Cách sửa cụ thể | File cần sửa |
|---|---|---|---|---|
| 18 ✅ | Cài đặt · 06 | Tiêu đề "⚡ Lựa Chọn Cấu Hình Phần Cứng Đề Xuất (**1-Click Presets**)" dài, Title Case, lẫn Anh; lưới 3+1 (thẻ AMD mồ côi full-width); máy AMD nhưng **không thẻ nào "Đang dùng"**. | Tiêu đề "Cấu hình theo máy"; `.hardware-presets { grid-template-columns: repeat(4,1fr) }`; khi khớp preset thêm `st-pill ok "Đang dùng"`. "STT, Translation và Engine" → "nhận dạng, dịch và tăng tốc". | `src/views/SettingsView.tsx:1736-1741` + `.hardware-presets` trong `SettingsView.css`  (CSS .hardware-presets (4 cột) — phần SettingsView.tsx của mcode #1)|
| 19 ✅ | Cài đặt · 06b/06c | Segmented giãn hết bề ngang 1200 px (2 lựa chọn "Engine mặc định", 5 mức "Mức độ suy luận") → nút dài lố, khó đọc. "AUTO" viết hoa lệch. | `max-width: 560px` cho `.seg` trong Cài đặt (hoặc `width:auto; display:inline-flex`). "AUTO" → "Tự động". | `src/views/SettingsView.css` (class segmented của Cài đặt) · `src/views/settings/SttSection.tsx` |
| 20 ✅ | Lịch sử · 04 | Danh sách rỗng mà **"Xuất .SRT" vẫn màu chính sáng** trong khi "Sao chép tất cả" đã mờ → lệch trạng thái; icon trạng thái rỗng nằm trong ô xám vuông trông như ảnh lỗi. | `disabled` cho split Xuất khi 0 câu (cùng kiểu mờ với "Sao chép tất cả"); bỏ nền ô icon (`background:transparent`, icon 40 px `--t4`). | `src/views/history/HistoryView.tsx` (+ CSS cùng thư mục) |
| 21 ✅ | Mọi tab | Chính tả/cách viết lệch: "**Xóa**" (Cài đặt › STT) vs "**Xoá**" (nơi khác); "Bắt Đầu Live" (câu rỗng) vs nút "Bắt đầu Live"; "Ngôn ngữ gốc (Source)"; "Batch Mode TẮT"; menu timeline Title Case ("Đặt Điểm Vào", "Khoanh Nhanh Đoạn 5s"). | Thống nhất **"Xoá"**, sentence case, bỏ ngoặc tiếng Anh: "Ngôn ngữ gốc", "Chạy hàng loạt: Tắt". | `src/components/ui/ModelDownloadRow.tsx:114` · `src/views/live/liveLogic.ts:167` · `src/views/SublixStudioView.tsx:8439` (+ menu chuột phải timeline)  (phần "Xóa"→"Xoá" trong ModelDownloadRow — Live/menu timeline của mcode #1+#2)|
| 22 | Tải video · 02b | Ảnh thu nhỏ là khung đen + ▶ chung, không có thời lượng (mockup có badge `08:39`). | Dùng thumbnail từ metadata yt-dlp (`thumbnail`) nếu có; badge thời lượng góc phải-dưới (10px mono, nền `rgba(0,0,0,.75)`). | `src/views/DownloaderView.tsx` |
| 23 | Live · 03 | Cột phải "Luồng thoại" là thẻ ngắn 140 px lơ lửng, cột giữa full chiều cao → lệch đáy. | Thẻ "Luồng thoại" `height:100%` (flex column), trạng thái rỗng căn giữa dọc như cột giữa. | `src/views/live/LiveView.tsx` + CSS Live |

> **Chưa duyệt được:** VoicePicker trong app thật — 12 ảnh không có cảnh bước Lồng tiếng mở / popover giọng (ảnh `voice-picker-all.png` là mockup). Lần chụp sau thêm 1 ảnh `after-01e-studio-voice-picker.png`.

---

## Đạt — giữ nguyên

- **Tải video (02/02b):** ô nhập + nút "Tải video · Enter" lớn, chip Chất lượng/Phụ đề/Nâng cao, tab lọc có số đếm, hàng tải có "Mở trong Studio" + ⋯, chân trang đường dẫn — **đúng mockup**, sạch hơn hẳn ảnh trước.
- **Studio — panel trái:** thanh 5 bước, accordion 1 bước mở, công tắc bật/tắt + ▶ từng bước, split **"▶ Chạy 2 bước đã bật | ▾"** + gợi ý dưới, card Nâng cao nét đứt; dòng nhà cung cấp chỉ đọc (0 ô API key trong Studio).
- **Studio — khung video trống (01a):** khung nhập video + phím tắt Ctrl+I rõ ràng; phụ đề xem trước vàng trên nền tối đúng token.
- **Lịch sử (04):** 2 cột, ô tìm + bộ đếm `0/0`, split Xuất .SRT ▾, ⋯ chứa xoá nguy hiểm — đúng kế hoạch.
- **Live (03):** gộp "Phụ đề hiển thị" 1 select, Nâng cao gập kèm tóm tắt, 1 nút chính "Bắt đầu Live", 👁 trên topbar.
- **Cài đặt (06/06b):** nav trái nhóm BẮT ĐẦU / XỬ LÝ AI / GIAO DIỆN / KHÁC có dòng phụ; 5 thẻ nhà cung cấp kèm pill trạng thái; cột phải "Trạng thái hệ thống" đọc config thật; ô API key không ghi đè key cũ.
- **Tiến trình (05):** 6 chip lọc ngang có số đếm, ⋯ + hộp xác nhận xoá, bỏ modal cũ.
- **Token màu Cinema Dark** nhất quán (nền, viền, amber chính, xanh ok) trừ lỗi #5.

---

## Gợi ý chia gói (không chồng file)

| Gói | Mục | File |
|---|---|---|
| A — Studio | 1, 3, 8, 9, 10, 11, 12(phần Studio), 21(Batch/menu) | `studio/StudioSttEnginePicker.tsx`, `SublixStudioView.tsx` (+CSS Studio) |
| B — Cài đặt + component dùng chung | 2, 5, 6, 7, 18, 19, 21(Xoá) | `components/ui/ModelDownloadRow.tsx`, `SettingsView.css`, `settings/TranslationSection.tsx`, `settings/SttSection.tsx`, `SettingsView.tsx:1736` |
| C — Thuật ngữ | 4 | `components/glossary/GlossaryEditor.tsx` |
| D — Tiến trình + Lịch sử + topbar chung | 12(pill), 15, 16, 17, 20 | `ProcessCenterView.tsx`, `history/HistoryView.tsx`, `SettingsView.tsx:1624` (⚠ cùng file với gói B → giao B **hoặc** làm tuần tự) |
| E — Live + Tải video | 13, 14, 21(Live), 22, 23 | `live/LiveView.tsx`, `live/liveLogic.ts`, `DownloaderView.tsx` |
