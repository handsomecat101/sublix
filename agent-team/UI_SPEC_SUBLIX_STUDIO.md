# SPEC GIAO DIỆN SUBLIX STUDIO — Bản vẽ xây dựng (CHO GEMINI)
**Đọc sau:** `TAM_NHIN_SUBLIX_STUDIO.md` (triết lý + lộ trình). Tài liệu này = bản vẽ chi tiết từng phần.
**Nguyên tắc:** "Thuật toán vẽ nháp — con người tinh chỉnh". Mọi thứ thấy được + sửa được trên timeline.

---

## 0. QUY ƯỚC CHUNG
- Theme: dùng hệ biến `--token` sẵn trong `App.css` (4 theme). Bản vẽ minh hoạ tông **kem + vàng đồng** (như EZMAX) = theme "Sáng nhẹ" + điểm nhấn `--color-accent`.
- Màu nhân vật (gán vòng 8 màu): `#3B82F6` xanh · `#22C55E` lục · `#A855F7` tím · `#F97316` cam · `#14B8A6` ngọc · `#EC4899` hồng · `#EF4444` đỏ · `#8B5E3C` nâu. Chip vai = chấm màu + tên.
- Icon: dùng `src/icons.tsx` (SVG) — KHÔNG emoji trong app.
- Font cỡ nhỏ gọn, mật độ thông tin cao (kiểu app dựng phim), bo tròn 8-12px, đổ bóng nhẹ.

---

## 1. BỐ CỤC TỔNG — MÀN HÌNH "STUDIO" (1 màn hình, không nhảy tab)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ TOPBAR (P1)                                                                        │
│ [Logo] [▶ Studio][⬇ Tải video][📶 Live][🕘 Lịch sử][⚙]   Tên_video.mp4 • 38:24     │
│                                                    [+ Mở video]  [🎬 Xuất video]   │
├───────────────┬──────────────────────────────────────────┬─────────────────────────┤
│ BƯỚC (P2)     │  XEM VIDEO (P3)                          │  DANH SÁCH CÂU (P4)     │
│               │  [Original ▾] [100% ▾] [–  +]            │  [🔍 Tìm trong phụ đề]  │
│ ▾ Nhận dạng   │  ┌────────────────────────────────────┐  │  [＋Thêm câu] [⇅ Sắp xếp]│
│   Ngồnữ▾     │  │                                      │  │ ┌─────────────────────┐ │
│   Mô hình▾    │  │                                      │  │ │ 00:02.4 → 00:06.1   │ │
│   [●○] Phân   │  │           ▶ VIDEO Ở GIỮA            │  │ │ Xin chào mọi người  │ │
│        biệt   │  │           (phụ đề hiện dưới)        │  │ │ Hello everyone      │ │
│   người nói   │  │                                      │  │ │ ● Nam  ♫ Nghe thử   │ │
│               │  └────────────────────────────────────┘  │ └─────────────────────┘ │
│ ▸ Dịch thuật  │                                          │ ┌─────────────────────┐ │
│               │                                          │ │ 00:06.3 → 00:09.8   │ │
│ ▾ Giọng đọc  │                                          │ │ Hôm nay chúng ta... │ │
│   [Phân tích  │                                          │ └─────────────────────┘ │
│    người nói] │                                          │  (bấm ô = chọn + nhảy   │
│   ● Nam [Tuấn │                                          │   playhead tới câu đó)  │
│     Ngọc ▾][▶]│                                          │                         │
│   ● Nữ  [Mai  │                                          │                         │
│     Linh ▾][▶]│                                          │                         │
├───────────────┴──────────────────────────────────────────┴─────────────────────────┤
│ THANH ĐIỀU KHIỂN TIMELINE (P5a)                                                    │
│ [⏮] [◀] [▶/⏸] [▶] [⏭]   00:02.4 / 38:24   [☑ Batch Mode]          [– ——●—— +] 30s│
├────────────────────────────────────────────────────────────────────────────────────┤
│ TIMELINE (P5b) — cuộn ngang theo thời gian                                         │
│ 👁 ▼ VIDEO      │░▒▓[ảnh][ảnh][ảnh][ảnh][ảnh][ảnh][ảnh][ảnh][ảnh]▓▒░░░░░░░░░░░░░░░│
│ 👁   TIẾNG GỐC │▁▂▅▇▅▂▁▁▂▄▆▄▂▁▃▅▇█▇▅▂▁▁▂▄▆▄▂▁▃▂▁▁▁▂▅▆▅▂▁▁▂▄▂▁▁▃▅▇▅▂▁▁ (sóng âm)   │
│ 👁   PHỤ ĐỀ    │ [Xin chào mn] [Hôm nay chúng ta] [sẽ cùng nhau] [khám phá thế giới]│
│ 👁 ● Nam-T.Ngọc│     [Xin chào!]          [sẽ cùng nhau]                           │
│ 👁 ● Nữ-M.Linh │          [mọi người cùng đón xem]            [cảm ơn đã theo dõi] │
│      ▲ playhead (đường dọc cam chạy khi phát)                                      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. BÓC TẮCH TỪNG PHẦN GIAO DIỆN (component inventory)

### P1 — TOPBAR
- Trái: logo + 5 nút điều hướng tab (xem §4).
- Giữa: thẻ file đang mở (tên • thời lượng • nút ✕ đóng).
- Phải: `⚙ Cài đặt nhanh`, `🕘 Lịch sử`, **`+ Mở video`** (viền), **`🎬 Xuất video`** (nền accent — chỉ sáng khi có dữ liệu).

### P2 — CỘT BƯỚC BÊN TRÁI (3 thẻ gấp, mở 1 lần 1 thẻ)
1. **Nhận dạng giọng nói:** Nguồn phát hiện (tự động) ▾ · Mô hình (Whisper local / API) ▾ · Công tắc "Phân biệt người nói" (mặc định BẬT).
2. **Dịch thuật:** Ngôn ngữ nguồn ▾ (Tự nhận diện) · Ngôn ngữ đích ▾ · Model dịch ▾ (MiniMax-M3 / local / API riêng) · Phong cách dịch ▾ (Mặc định / Review phim / Trẻ trung).
3. **Giọng đọc & Phân vai:** nút **[▶ Phân tích người nói]** · mỗi vai 1 dòng: `● [tên sửa được] [Ô chọn giọng ▾] [▶ nghe] [⋯]` · nút `+ Thêm vai`. Phân vai do AI (sherpa) tạo nháp → người sửa tại đây VÀ trên timeline (2 nơi cùng 1 dữ liệu).

### P3 — KHUNG XEM VIDEO
- Player thuần (HTML5 video) + phụ đề hiện đè dưới (đúng vị trí sẽ xuất).
- Trên: `Original ▾` (chế độ xem: Bản dịch / Gốc / So sánh 2 dòng) · `% zoom` · nút `– +`.
- Click 1 câu trong P4/P5 → video nhảy tới đúng giây đó.

### P4 — DANH SÁCH CÂU (cột phải)
- Ô tìm kiếm (lọc theo chữ trong câu gốc/dịch).
- Thẻ câu: `giờ bắt đầu → giờ kết thúc` • bản gốc (xám nhỏ) • **bản dịch** (sửa inline được) • chip vai (màu) • nút `▶ Nghe thử câu`.
- Sắp xếp theo thời gian / theo vai. Nút `＋Thêm câu` (chèn thủ công).
- Chọn thẻ ↔ chọn ô trên timeline (đồng bộ 2 chiều).

### P5 — TIMELINE (TRÁI TIM)
**P5a — Thanh điều khiển:** phát/từng bước/tua · đồng hồ `hiện tại / tổng` · công tắc **Batch Mode** (xem §4) · thanh zoom thời gian (5s → toàn bộ).
**P5b — Các làn (từ trên xuống):**
1. **VIDEO** — dải ảnh thu nhỏ, kéo để xem nhanh.
2. **TIẾNG GỐC** — sóng âm (tham khảo khi ai nói ở đâu).
3. **PHỤ ĐỀ** — ô câu gộp mọi câu.
4..n. **MỖI NHÂN VẬT 1 LÀN** — ô câu của vai đó, viền + nền theo `màu vai`, nhãn làn = `● tên — giọng đang gán`.
**Thao tác trên ô câu:** bấm chọn · kéo mép trái/phải = sửa thời gian · kéo thân = dời thời gian · **kéo sang làn khác = đổi người nói** · chuột phải = menu: *Sửa chữ / Đổi giọng câu này / Đọc lại câu này / Cắt đôi / Xóa* · bấm đúp = sửa chữ tại chỗ.
**Khác:** kéo trên khoảng trống làn phụ đề = tạo câu mới · mọi thao tác có **Undo/Ctrl+Z** · playhead cam · phím `Cách` = phát/dừng.

### P6 — Ô CHỌN GIỌNG (modal — mở khi bấm ô giọng ở P2/P5)
```
┌─ 🔊 Chọn giọng đọc — [Nam/Nữ/Tất cả] ─── [+ Thêm giọng clone] ─ [✕] ─┐
│ [🔍 Tìm theo tên, ngôn ngữ, engine...]                                  │
│ [Tất cả 68] [Kokoro] [Edge TTS] [MiniMax] [Clone] [API riêng]           │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│ │Giọng chung   │ │ Tuấn Ngọc ♂  │ │ Mai Linh ♀   │ │ Giọng clone  │    │
│ │Hệ điều hành  │ │ Bắc [LOCAL]  │ │ Bắc [LOCAL]  │ │ của tôi [???]│    │
│ │[▶ nghe]      │ │ [▶][＋gán]   │ │ [▶][＋gán]   │ │ [▶][＋gán]   │    │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```
- Thẻ giọng: tên • giới tính • vùng (Bắc/Nam) • **badge nguồn** (`LOCAL`/`FREE`/`API`) • nút nghe thử • nút gán.
- Sắp giọng theo engine (nhóm Kokoro/Edge/MiniMax...), lọc theo giới tính + ngôn ngữ.

### P7 — HỘP THOẠI "XUẤT VIDEO" (nút 🎬)
- Chọn chất lượng (720p/1080p/Giữ nguyên) · tùy chọn: nhúng sub vào hình (hardsub) / kèm file .srt · thư mục đầu ra (mặc định Thư Mục Thành Phẩm) · nút `Xuất` + tiến trình %.

---

## 3. CHI TIẾT 3 THẺ BƯỚC (P2) — dữ liệu lấy từ đâu
| Trường | Nguồn dữ liệu (đã có trong app) |
|---|---|
| Nhận dạng + phân vai | pipeline `analyze_and_create_project` + sherpa (V2) — đã có |
| Dịch | dịch vụ dịch MiniMax-M3 / model dịch — đã có |
| Giọng | `dubbing_get_voices` + Voice Hub model tải — đã có |
| Timeline (câu, thời gian, vai) | `project.segments` — đã có |
→ **GĐ1 KHÔNG viết lại AI nào.** UI chỉ ĐỌC dữ liệu có sẵn + cho phép SỬA, sau đó ghi lại.

---

## 4. CÁC TAB TÍNH NĂNG (điều hướng mới trên TOPBAR)
| Tab | Nội dung | Thay đổi so với hiện tại |
|---|---|---|
| **▶ Studio** | Màn hình §1 — MỚI, mặc định khi mở app (nếu chưa chọn video → hiện ô thả video lớn giữa màn) | Gộp tab "Phụ đề" + "Lồng tiếng" hiện tại vào đây |
| **⬇ Tải video** | Giữ nguyên downloader hiện tại (đã hoạt động tốt) + thêm nút **"→ Mở vào Studio"** trên mỗi mục đã tải | Thêm 1 nút |
| **📶 Live** | Live sub overlay (giữ nguyên — vũ khí riêng của Sublix) | Không đổi |
| **🕘 Lịch sử** | Danh sách dự án đã làm (mở lại vào Studio) | Không đổi |
| **⚙ Cài đặt** | Giữ nguyên (theme, phím tắt, API key...) | Không đổi |
- **Batch Mode** (công tắc trên timeline): bật lên → hiện bảng danh sách tập (thêm nhiều file/link) → chạy tuần tự Nhận dạng → Dịch → Lồng → Xuất cho cả danh sách, mỗi dòng hiện % + ✅.

---

## 5. THỨ TỰ DỰNG CHO GEMINI (từng phần có tiêu chí nghiệm thu — LUẬT CHẠY THẬT)
| Việc | Nội dung | Nghiệm thu (ảnh GUI + nói rõ) |
|---|---|---|
| **UI-1** | Khung trang Studio: TOPBAR + 3 cột + thanh timeline trống, dữ liệu giả (mock) | Mở app thấy đúng bố cục bản vẽ §1 |
| **UI-2** | Nối dữ liệu THẬT: mở video thật → 3 cột + timeline hiện đúng câu/vai/giọng từ pipeline | Video 2 người nói → thấy 2 làn 2 màu đúng |
| **UI-3** | Sửa trên timeline: sửa chữ tại chỗ, kéo mép sửa thời gian, kéo sang làn = đổi vai, đồng bộ P4↔P5 | Sửa 1 câu kéo 1 ô → cả 2 nơi đổi theo |
| **UI-4** | Ô chọn giọng P6 + gán giọng theo làn/ theo câu | Bấm ô giọng → đủ danh sách → nghe thử → gán |
| **UI-5** | "Đọc lại câu này" + Undo | Sai 1 câu → sửa → đọc lại → chỉ câu đó đổi trong file xuất |
| **UI-6** | Hộp thoại Xuất video (P7) + Batch Mode | Xuất được video + .srt từ nút 🎬; Batch 2 file chạy tuần tự |
**Bài toán chuẩn cuối:** video 2 người nói → phân vai → đổi tên → 2 giọng khác nhau → sửa 1 câu trên timeline → đọc lại câu đó → xuất: giọng khớp vai + đúng câu đã sửa.

## 6. LƯU Ý
- **Điều tra ngày 2026-10-08 (CommandCode):** EZMAXSUB được xây bằng **TÙNG khung Tauri + WebView2 như Sublix** (UIA lộ "TAURI_DRAG_RESIZE_WINDOW") + thư viện **libmpv** để phát video trong timeline. Kết luận: (1) Sublix làm được studio + timeline y hệt trong cùng stack; (2) **nên học dùng mpv cho ô xem video/timeline** (mượt hơn HTML5 video khi tua).
- ĐỪNG viết lại pipeline AI — UI bọc ngoài "máy" đã chạy tốt (xem §3).
- ĐỪNG phá tab Tải video / Live / Lịch sử / Cài đặt đang hoạt động (chỉ thêm nút).
- Mọi thay đổi dữ liệu phải lưu được (đóng app mở lại không mất).
- Làm xong từng việc UI-1→UI-6 phải **chạy app thật chụp ảnh** (LUẬT CHẠY THẬT) rồi báo.

## 7. ĐIỀU TRA ẢNH CHỤP CỦA PO (2026-10-08) — BẮT ĐÚC TOOLBAR & CHIẾN LƯỢC
**Bộ nút timeline (bắt được qua tooltip — làm ĐÚNG bộ này cho UI-1):**
- Sắp theo cụm: `Cắt tại playhead` · `Nhân bản` · `Xóa` · `Giãn kín timeline (fit)` | `Nam châm dính chặt — tự khép khe hở giữa clip (P)` · `Tự động bám dính — căn playhead/mép gần nhất, Shift/Ctrl để tạm bỏ (N)` · `Liên kết — di chuyển/xóa kéo theo clip chính` · `Add bookmark`.
- Giữa: `00:00.00 ▶ 38:24.06` + công tắc `Batch Mode`. Phải: **tốc độ video (1.0x)** + **tốc độ giọng đọc (1.5x)** + zoom timeline.
- Làn: video chính (filmstrip) · **Phụ đề** · video gốc (sóng âm) · giọng đọc — mỗi làn có nút 👁 ẩn + 🔒 khóa. (Sublix GIỮ thêm làn MỖI NHÂN VẬT — điểm vượt trội PO yêu cầu.)
- **HOÀN TÁC theo lớp:** 3 nút `Audio / Bản dịch / Phụ đề` hoàn tác riêng từng lớp — HỌC LÀM THEO.
- **Batch có ghi nhớ:** mở lại app hiện hộp "Khôi phục batch trước? (Khôi phục / Tạo batch mới / Hủy)".
**Hộp thoại Xuất (P7 — cập nhật theo ảnh thật):** tên file + thư mục (`\exports`) · tốc độ video · **âm lượng TTS** · độ phân giải (Giữ nguyên) · FPS (Giữ nguyên) · Bit rate (Đề xuất theo chất lượng) · Codec (H.264) · Định dạng (MP4) · Chất lượng: `Cao CRF18 / Cân bằng CRF21 / Nhẹ CRF26` · 2 checkbox: **ghi phụ đề vào video** + **ghi lớp phủ vào video**.
**Học thêm cho P2/P4:** thẻ "HỒ SƠ PHIM (AI HỌC)" — sau khi dịch, AI tự lập danh sách tên riêng & cách xưng hô, có nút "Sửa và khóa cách xưng hô" → HỌC LÀM THEO (dịch chuẩn hơn hẳn). Bộ lọc câu: `[Tất cả | Căn chỉnh | Thiếu audio]` + chip lọc theo vai `N1 (56) | N2 (51)…`. Chế độ "Tóm tắt/Review": AI kịch bản → tự chọn/cắt đoạn → TTS → gợi tựa đề (để GĐ6).
**💰 CHIẾN LƯỢC ĐỐI KHÁNG:** EZMAXSUB bán tiền 2 thứ: (1) **xuất >5 phút + bỏ logo**, (2) **tách vocal (hạ giọng giữ nhạc nền)**. Sublix mở nguồn → **cả 2 làm MIỄN PHÍ được** (tách vocal = Demucs theo kế hoạch giọng nói) — đây là "điểm bán" khi giới thiệu Sublix.
**Hiểu đúng đối thủ:** nó tối ưu cho giới "reup/xào nấu" — dịch nhanh 2 vai Nam/Nữ cố định + tóm tắt cắt ngắn tự động. Sublix đi đường **phân vai thật nhiều nhân vật + timeline điều khiển tay** (đúng yêu cầu PO) — không cần bắt chước phần "nhanh-như-reup".

## 8. QUYẾT ĐỊNH CÔNG NGHỆ TIMELINE (CommandCode khảo sát GitHub 2026-10-08)
- **TỰ XÂY lõi timeline** (canvas/HTML thuần), KHÔNG cài thư viện timeline bên thứ 3 cho GĐ1-GĐ3: timeline của Sublix đặc thù (làn theo nhân vật, kéo đổi vai, chuột phải "Đọc lại câu này") — thư viện chung chung vẫn phải sửa gần hết + gánh dependency nửa chết nửa sống (vd `@xzdarcy/react-timeline-editor` ít bảo trì).
- **Mượt = cách vẽ, không phải thư viện:** vẽ **canvas + ảo hóa** (chỉ render khối trong khung nhìn) + `requestAnimationFrame`; mục tiêu 60fps khi kéo/zoom với video 400+ phân đoạn. Sóng âm = peaks THẬT trích lúc phân tích (KHÔNG sine giả — xem FIX_STUDIO_UI_ROUND1 H3).
- **GĐ5 (cắt ghép dựng video):** khi mới làm thì mượn tham khảo mã nguồn mở **OpenCut** (github.com/OpenCut-app/OpenCut — MIT, ~48K sao, cộng đồng lớn) hoặc **ViteCutTimeline** (timeline.vitecut.com — drag/cut/split/snap/virtualized) — học cách làm, vẫn render bằng máy ffmpeg có sẵn.
- Vẫn giữ combo đã chọn: **Tauri + WebView2 + libmpv cho ô xem video** (mượt khi tua — đúng cách EZMAX làm).
