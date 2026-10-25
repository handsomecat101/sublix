# BỆNH ÁN DỰ ÁN + DANH SÁCH SỬA — cho GEMINI (PO yêu cầu 2026-10-10)
> Mục đích: sửa đúng lỗi PO chê **NHƯNG GIỮ NGUYÊN code đã viết** (mục B) — không viết lại từ đầu, không "đối phó" (bọc vỏ quanh trang cũ).

## A. DỰ ÁN ĐANG BỊ GÌ (lỗi PO chê — sửa đúng cái này)
1. **Bấm tab khác → quay về "style cũ"**: các tab Tải video/Live/Lịch sử/Cài đặt hiện là trang settings phẳng cuộn dài. YÊU CẦU: **MỌI tab phải sống trong khung Studio** — tab chính trên cùng · GIỮA = view chính · TRÁI + PHẢI = 2 cột phụ (giống hệt màn Studio). Màn Studio thì ĐẠT, các tab còn lại CHƯA.
2. **Hai kiểu menu lẫn lộn**: menu Studio (bên trong `SublixStudioView`) khác phong cách với menu 8 nút tự chế (`main-topbar` của SettingsView) → nhìn không cùng một nhà. Cần đồng bộ về phong cách Studio (nền tối, tab bo tròn, active màu hổ phách).
3. **Vặt còn lại:** ~12 chuỗi thông báo phụ còn sai chữ (PO nói không quan trọng — sửa dần); cột trái tab Tải video còn chật (form cần gọn/cuộn); zoom/thanh trượt tỉ lệ.

## B. CODE ĐÃ CÓ — GIỮ NGUYÊN, CHỈ GHÉP/SỬA (PO yêu cầu giữ!)
| File | Trạng thái | Ghi chú |
|---|---|---|
| `src/views/SublixStudioView.tsx` (~2700 dòng) + `.css` | ✅ TRÁI TIM | Studio + timeline + phân vai + hoàn tác + fix R5-R7. **KHÔNG viết lại, không sửa lớn** — chỉ ghép prop nếu cần |
| `src/views/StudioShell.tsx` + `StudioShell.css` | ✅ MỚI, build xanh | Khung 3 cột dùng chung (`left/center/right/bottom`) + `ShellCard`. **MỌI tab lắp vào đây** |
| `src/views/DownloaderView.tsx` | 🟡 ĐÃ LẮP KHUNG — CHƯA CÓ ẢNH XÁC MINH | 5 mối hàn: trái = input-card, giữa = list, phải = header + copyright. **Việc số 1: chụp ảnh xác minh** rồi tinh chỉnh CSS cho gọn |
| `src/views/SettingsView.tsx` | 🟡 Nửa vời | Đã: ẩn sidebar, studio full-bleed, menu 8 nút. Cần: đồng bộ menu kiểu Studio + re-slot block Live/Lịch sử/Cài đặt/Kiểu dáng (JSX ngay trong file này) vào StudioShell |
| `src-tauri/src/translate/{server,mod}.rs`, `config.rs` | ✅ QUAN TRỌNG | Backend DeepSeek/OpenRouter + glossary được TÁI TẠO sau hoả hoạn (bản gốc mất), đã chạy test 15/16 pass. **Không phá** |
| `FileSubView.tsx`, `DubbingStudioView.tsx` | ⬜ Chưa vào khung | Tab "Tạo phụ đề" và "Lồng tiếng" — cần bọc vào StudioShell như DownloaderView |

## C. LỊCH SỬ TAI NẠN (để không lặp lại — đọc kỹ)
1. **Hoả hoạn mã hoá (mojibake)** đã XOÁ VĨNH VIỄN: bản giao diện 3 cột + topbar hoàn chỉnh trước đây (chưa từng commit git) + bản backend gốc. Đừng đi tìm — không còn. Xây lại trong `StudioShell` là đúng hướng.
2. `SublixStudioView.tsx` hiện tại = bản khôi phục từ commit `58f2e94` + gỡ mojibake bằng thuật toán (đã sạch 126 ký tự tàng hình + vá hàng loạt chuỗi). Một số chuỗi thông báo phụ vẫn sai chữ — sửa bằng **thay chuỗi thuần**, KHÔNG regex `[^"]*` (đã phá file 1 lần vì regex ăn code).
3. Test GUI chỉ có 1 đường (đọc `AGENT_CHAT.md` tin bàn giao 2026-10-10): `ab2.ps1` + cờ WebView2 + `target\debug\sublix.exe` + `npm run dev` kèm. **Chụp ảnh phải đúng cửa sổ chính** (dễ nhầm cửa sổ overlay!). File bat tự chế phải có dòng PATH cargo.

## D. VIỆC LÀM THEO THỨ TỰ (mỗi mục xong = ẢNH TỰ CHỤP + COMMIT ngay)
1. **Xác minh DownloaderView** trong khung mới (chụp ảnh tab Tải video — đúng cửa sổ chính) + tinh chỉnh CSS 3 cột cho gọn.
2. **Đồng bộ menu trên cùng** về phong cách Studio cho mọi tab.
3. **Re-slot tab Cài đặt** vào StudioShell: trái = danh mục (Presets/Whisper/LLM/Overlay), giữa = form cấu hình, phải = trạng thái máy (GPU, server).
4. **Re-slot tab Live**: trái = cấu hình, giữa = sân khấu live, phải = luồng thoại.
5. **Re-slot tab Lịch sử** (trái = bộ lọc, giữa = danh sách dự án, phải = chi tiết) + **Kiểu dáng** + **Tạo phụ đề** (`FileSubView`) + **Lồng tiếng** (`DubbingStudioView`).
6. **Nghiệm thu cuối bằng mắt PO:** mở app → không còn bất kỳ trang "style cũ" nào → mọi tab cùng khung Studio.

## E. LUẬT BẤT KHUY XÂM PHẠM (PO chốt)
1. Báo "xong" PHẢI kèm **ảnh tự chụp đúng cửa sổ chính** — không nói mồm, không "verified" khi chưa có ảnh.
2. **Commit git sau mỗi chặng** (nền sạch đã có: `452e6b6`, `134f0f6` — git nội bộ, tự commit, không cần hỏi).
3. Không `cargo build --release` (BUG-H07 — sinh exe hỏng). Không đụng `Chay-Sublix.bat` + logic tải/tiến trình/cookie của DownloaderView.
4. **GIỮ NGUYÊN code mục B** — sửa/ghép, không viết lại, không xóa "cho gọn".
