# 📦 BÀN GIAO CHO GEMINI — ĐỌC FILE NÀY LÀ ĐỦ (CommandCode rời dự án 2026-10-10)
> PO yêu cầu: sửa app theo mục 3 — GIỮ NGUYÊN code mục 2 — không hỏi lại CommandCode (đã rời dự án).

## 1. TÓM TẮT 1 DÒNG
App Sublix (Tauri v2 + React + Rust): **máy bên trong (AI: phân vai/dịch/lồng/tải video) hoạt động tốt** — cái hỏng là **GIAO DIỆN**: các tab Tải video/Live/Lịch sử/Cài đặt vẫn "style cũ" (trang phẳng) thay vì sống trong KHUNG STUDIO như màn Studio.

## 2. CODE GIỮ NGUYÊN — CHỈ GHÉP/SỬA, KHÔNG VIẾT LẠI
| File | Nội dung | Mức đụng |
|---|---|---|
| `src/views/SublixStudioView.tsx` (~2700 dòng) + `.css` | TRÁI TIM: Studio + timeline + phân vai + hoàn tác | ❌ KHÔNG sửa lớn |
| `src/views/StudioShell.tsx` + `.css` | Khung 3 cột dùng chung (`left/center/right/bottom`) + `ShellCard` | ✅ Dùng cho mọi tab |
| `src/views/DownloaderView.tsx` | ĐÃ lắp vào StudioShell (trái=form tải, giữa=danh sách, phải=header) | 🟡 Chụp ảnh xác minh + tinh chỉnh |
| `src/views/SettingsView.tsx` | Ẩn sidebar, studio full-bleed, menu 8 nút | 🟡 Đồng bộ menu kiểu Studio + re-slot block |
| `src-tauri/src/translate/*.rs`, `config.rs` | Backend DeepSeek/OpenRouter + glossary (tái tạo sau tai nạn, test 15/16 pass) | ❌ Không phá |
| `FileSubView.tsx`, `DubbingStudioView.tsx` | Tab Tạo phụ đề / Lồng tiếng | ⬜ Bọc vào StudioShell |
Tài liệu tham khảo: `BENH_AN_DU_AN_VA_VIEC_SUA.md` (chi tiết bệnh), `UI_SPEC_SUBLIX_STUDIO.md` (bản vẽ gốc), `TAM_NHIN_SUBLIX_STUDIO.md` (tầm nhìn).

## 3. YÊU CẦU PO (sửa đúng cái này)
**MỌI tab phải sống trong khung Studio:** tab chính trên cùng · GIỮA = view chính · TRÁI + PHẢI = 2 cột phụ — giống hệt màn Studio (mẫu = `SublixStudioView`). Phân bố nội dung:
- **Tải video:** trái = bước tải (link/chất lượng/cookies) · giữa = danh sách video · phải = thông tin + nhanh
- **Live:** trái = cấu hình · giữa = sân khấu live · phải = luồng thoại
- **Cài đặt:** trái = danh mục (Presets/Whisper/LLM/Kiểu dáng) · giữa = form · phải = trạng thái máy
- **Lịch sử:** trái = bộ lọc · giữa = danh sách · phải = chi tiết
- Menu trên cùng đồng bộ 1 phong cách Studio cho tất cả các tab (hiện có 2 kiểu lẫn lộn = lỗi).

## 4. THỨ TỰ LÀM (mục nào xong = CHỤP ẢNH + COMMIT ngay)
1. Chụp ảnh xác minh DownloaderView trong khung mới (đang dở, build xanh nhưng CHƯA có ảnh).
2. Đồng bộ menu trên cùng kiểu Studio.
3. Re-slot Cài đặt → 4. Live → 5. Lịch sử + Kiểu dáng + Tạo phụ đề + Lồng tiếng.
6. Nghiệm thu: mở app → không còn trang "style cũ" nào.

## 5. CÔNG THỨC TEST GUI (đường DUY NHẤT đã kiểm chứng — làm sai là mất hàng giờ)
```powershell
# 1) Build check:  npm run build        (tại H:\AI Project\sublix)
#    Rust test:    & "$env:USERPROFILE\.cargo\bin\cargo.exe" test --manifest-path src-tauri/Cargo.toml --lib
# 2) Mở app kèm cổng chụp ảnh (cả 3 bước dưới là BẮT BUỘC):
Start-Process cmd '/c','npm run dev' -WorkingDirectory 'H:\AI Project\sublix' -WindowStyle Minimized   # "máy phát web" — thiếu là màn đen
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'
Start-Process 'H:\AI Project\sublix\src-tauri\target\debug\sublix.exe' -WorkingDirectory 'H:\AI Project\sublix'
# 3) Chụp ảnh (script không-bao-giờ-treo):
& 'H:\AI Project\sublix\test_dubbing_input\ab2.ps1' -fresh connect 9222
& 'H:\AI Project\sublix\test_dubbing_input\ab2.ps1' tab list     # ⚠ CỬA SỔ CHÍNH có thể là t1 HOẶC t2 — xem list rồi chọn ĐÚNG (sai = chụp nhầm cửa sổ overlay!)
& 'H:\AI Project\sublix\test_dubbing_input\ab2.ps1' tab t2       # (hoặc t1 — theo tab list)
& 'H:\AI Project\sublix\test_dubbing_input\ab2.ps1' screenshot 'duong-dan\anh.png'
```

## 6. BẪY ĐÃ TRẢ TIỀN HỌC (đừng lặp)
1. **Regex `[^"]*` thay chuỗi hàng loạt = ĂN CODE** (đã phá file 1 lần) → thay chuỗi thuần + rào chắn % thay đổi; hoặc script Python + backup trước khi sửa.
2. **Chụp ảnh nhầm cửa sổ overlay** → kết luận sai lung tung → luôn `tab list` trước.
3. File bat tự chế thiếu `set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"` = app chết ngầm không báo.
4. Mojibake (chữ nát) từng hoả hoạn: file nhạy cảm PHẢI commit ngay sau mỗi chặng (git nội bộ — tự commit, không cần hỏi ai; message thêm dòng `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`).
5. KHÔNG `cargo build --release` (BUG-H07 — sinh exe hỏng). Không đụng `Chay-Sublix.bat` + logic tải/tiến trình/cookie của DownloaderView.

## 7. LUẬT CỦA PO (vi phạm = làm lại)
1. Nói "xong" PHẢI kèm **ảnh tự chụp đúng cửa sổ chính**. Không "verified/suông".
2. **Giữ code mục 2** — không viết lại, không xóa "cho gọn".
3. Commit git sau mỗi chặng.
