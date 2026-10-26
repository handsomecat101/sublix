# TẦM NHÌN: SUBLIX STUDIO — "Thuật toán vẽ nháp, con người tinh chỉnh"
**Đối chuẩn:** EZMAXSUB (ezmaxsoft.com — ảnh chụp trong `Desktop/ezmax/`) — nhưng Sublix là **mã nguồn mở + tự chủ hoàn toàn** (không phụ thuộc dịch vụ đóng).
**Chốt bởi PO:** 2026-10-08.

## 1. TRIẾT LÝ CỐT LÕI (bất khả xâm phạm)
1. **TIMELINE là bàn điều khiển trung tâm.** Giọng, phân vai, phụ đề, tiếng — mọi thứ phải **thấy được + sửa được** trên timeline.
2. **Tự động hóa = đề xuất. Con người = chốt.** Không bao giờ có kiểu "bấm chạy rồi chờ xổ số". AI làm nháp → người tinh chỉnh từng câu.
3. **Sửa cục bộ:** sai 1 câu chỉ sửa 1 câu / đọc lại 1 câu — KHÔNG bắt chạy lại cả video.

## 2. BỐ CỤC 1 MÀN HÌNH (theo ảnh EZMAX)
- **Trái:** các bước xử lý dạng thẻ gấp (Nhận dạng → Dịch → Giọng đọc & Phân vai).
- **Giữa:** xem video + nút phát + % zoom.
- **Phải:** danh sách phụ đề (tìm kiếm, sắp xếp, thêm/xóa).
- **Dưới:** TIMELINE nhiều làn (xem §3). Trên là "Batch Mode" bật/tắt.

## 3. TIMELINE — YÊU CẦU CỤ THỂ (trái tim sản phẩm)
- **Làn 1 — Video:** dải ảnh thu nhỏ, kéo cuộn được.
- **Làn 2 — Tiếng gốc:** sóng âm (để biết ai nói ở đâu).
- **Làn 3 — Phụ đề:** ô câu; bấm sửa chữ; kéo mép sửa thời gian bắt đầu/kết thúc.
- **Làn 4..n — MỖI NHÂN VẬT MỘT LÀN:** màu riêng + tên vai + **thẻ giọng** (vd "♂ Tuấn Ngọc"). AI phân vai → tự mở đúng số làn.
- **Trên mỗi ô câu:** bấm = sửa chữ · kéo mép = sửa thời gian · chuột phải = **"Đọc lại câu này"** / đổi giọng chỉ câu đó · kéo sang làn khác = đổi người nói.
- Sửa xong phát thử ngay tại chỗ; mọi thao tác có **Hoàn tác (Undo)**.

## 3b. HƯỚNG DÀI HẠN (PO chốt 2026-10-26)
**Từ "Studio dịch" → "Studio làm video AI".** Dịch + lồng tiếng là nền; bước tiếp là làm video **hút người xem suốt từ đầu đến cuối** (phụ đề động, dựng nhanh) — tự động hoá những chuỗi thao tác nhiều bước mà creator đang phải làm tay trong CapCut, nhưng **chỉ chạy khi người dùng chọn** (ô tích / nút), không áp cho mọi video.
- Gần: **v0.14** — chọn kiểu phụ đề (Bình thường / **Nhảy chữ**) + ô tích **"phụ đề cứng → làm mờ & đè tem"** (KHÔNG xoá bằng AI). Kế hoạch: `docs/V0.14_PLAN.md`.
- Xa hơn (ý tưởng đã nghiên cứu, chưa chốt): cắt khoảng lặng 1 nút, dịch vừa nhịp nói, dựng dọc 9:16 bám người nói, tách nhạc tốt hơn — `docs/FEATURE_IDEAS_2026.md`.

## 4. LỘ TRÌNH (đảo: timeline lên đầu)
| GĐ | Nội dung | Nghiệm thu (LUẬT CHẠY THẬT) |
|---|---|---|
| **GĐ1** | Studio 1 màn hình + timeline XEM/SỬA cơ bản: hiện đúng những gì AI đã làm (phụ đề + làn nhân vật + giọng), sửa chữ/thời gian/đổi làn | Video 2 người nói → thấy 2 làn 2 màu đúng người → sửa 1 câu trên timeline → thấy ngay |
| **GĐ2** | Ô chọn giọng GỘP mọi nguồn (local/Edge/API/clone): tìm kiếm, badge nguồn, nghe thử, gán giọng theo làn nhân vật | Bấm ô giọng → thấy đủ danh sách → nghe thử → gán, làn nhân vật đổi thẻ giọng |
| **GĐ3** | Tinh chỉnh nâng cao: đọc lại từng câu, Undo, nghe thử tại chỗ | Sửa 1 câu + bấm đọc lại → chỉ câu đó đổi, câu khác giữ nguyên |
| **GĐ4** (v0.14) | **Phụ đề hút mắt + xử lý sub cứng:** chọn kiểu phụ đề Bình thường / Nhảy chữ (từng từ, mẫu màu); ô tích (mặc định tắt) **tự dò dải sub cứng → làm mờ → đè phụ đề Việt** ("đè tem"), kéo chỉnh dải được. KHÔNG xoá bằng AI. OCR bóc chữ để sau | Video có sub cứng → tích ô → xuất ra dải cũ mờ + phụ đề Việt đè đúng chỗ; chọn Nhảy chữ → từng từ sáng theo nhịp, xem thử = video xuất |
| **GĐ5** | Dựng cơ bản (cắt/tách/ghép, thêm chữ/ảnh, filter, đổi tỷ lệ) + Batch Mode cả danh sách | Cắt 1 đoạn + thêm 1 dòng chữ → xuất video đúng |
| GĐ6 (sau) | Tóm tắt / Review AI (kịch bản, ghép cảnh) — tính năng "ăn tiền" của EZMAX | — |

**Bài toán chuẩn nghiệm thu xuyên suốt:** video 2 người nói → AI phân vai → đổi tên → gán 2 giọng khác nhau → kéo sửa 1 câu trên timeline → đọc lại câu đó → xuất video: **giọng khớp từng vai + đúng câu đã sửa**.

## 5. LƯU Ý CHO NGƯỜI LÀM CODE
- GĐ1 timeline dựng bằng UI thuần (canvas/HTML), CHỈ xem/sửa dữ liệu — việc xuất video vẫn bằng pipeline có sẵn (không viết lại engine).
- Giọng: ưu tiên open-source + API key người dùng. **Cẩn thận** kiểu "CapCut ASR ké ké" (dịch vụ bên thứ 3, dễ chết, nhạy bản quyền) — học cách GỘP nguồn của EZMAX, không học cách ké dịch vụ.
- Sublix có 2 thứ EZMAX không có, GIỮ NGUYÊN: tải video từ link + Live sub overlay.
- Tuân thủ LUẬT CHẠY THẬT (GOVERNANCE mục 0): mọi GĐ xong phải có ảnh GUI + file thật.
