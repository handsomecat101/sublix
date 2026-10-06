# GUI_TEST_GUIDE.md — Cách TỰ test GUI app Sublix (mọi agent đọc được)

> **Dành cho:** MỌI agent (kể cả worker/sub-agent CHỈ có shell) — KHÔNG cần nhờ PO bấm tay/chụp ảnh nữa.
> **Nguyên lý:** App Tauri (WebView2) mở được "cổng debug CDP" (giống Chrome DevTools Protocol). Công cụ `agent-browser` (CLI, cài qua npm) kết nối vào cổng đó để `snapshot` (đọc UI), `click`, `fill`, `wait`, `screenshot`, `eval` — y như user thật đang ngồi trước máy.
> **Áp dụng ngay cho:** 17 mục `AUDIT_TAO_GIONG.md` + 12 mục audit đang chờ GUI test.

## 0) Kiểm tra dụng cụ
```powershell
agent-browser --version        # nếu thiếu: npm i -g agent-browser ; agent-browser install
```

## 1) Mở app KÈM CỔNG DEBUG (bắt buộc)
```powershell
# Tắt app đang chạy (nếu có) — CẢNH BÁO: nếu PO đang tải dở thì hỏi trước đã!
Get-Process sublix -ErrorAction SilentlyContinue | Stop-Process -Force
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'
& 'H:\AI Project\sublix\Chay-Sublix.bat'    # chạy NỀN (run_in_background=true), đợi 30–90s cho build
```
Kiểm tra cổng sống: `Invoke-RestMethod http://127.0.0.1:9222/json` → phải thấy 2 targets (main + overlay).

## 2) Kết nối & "nhìn" UI
```powershell
agent-browser --session sublixgui connect 9222
agent-browser --session sublixgui tab list        # t1 = cửa sổ CHÍNH (http://localhost:1420/) — luôn thao tác tab này
agent-browser --session sublixgui snapshot -i     # cây UI + refs @e1, @e2... (chỉ phần tử bấm được)
agent-browser --session sublixgui snapshot        # BẢN ĐẦY ĐỦ (có cả chữ tĩnh: %, đường dẫn, trạng thái...) — dùng khi cần đọc số liệu
```
**PowerShell bắt buộc quote refs:** `agent-browser ... click '@e12'` — viết trần `@e12` là PowerShell hiểu sai.
UI đổi thì `snapshot` lại — refs đổi theo.

## 3) Thao tác như user
```powershell
agent-browser --session sublixgui fill '@e12' "https://www.youtube.com/watch?v=..."
agent-browser --session sublixgui click '@e13'
agent-browser --session sublixgui wait --text "Rick Astley"     # chờ text; nếu treo lâu thì tự poll snapshot mỗi 6–8s
agent-browser --session sublixgui screenshot 'H:\AI Project\sublix\_agent_test\shot.png'
agent-browser --session sublixgui eval "document.title"          # chạy JS trong trang (đọc localStorage, gọi IPC qua window.__TAURI_INTERNALS__.invoke)
```
- **Tìm nút của ĐÚNG một mục trong danh sách:** quét snapshot theo CẶP — thấy `heading "<tên item>"` thì lấy nút nằm NGAY SAU nó. **KHÔNG lấy ref cuối/danh sách mù** (CommandCode từng xoá nhầm 1 mục của PO vì lấy ref[-1]).
- Tên file/link chứa `[` `]` (vd `[dQw4w9WgXcQ]`) → tránh các hàm PowerShell coi `[]` là wildcard (`Test-Path`, `-like` với pattern...) — dùng `-LiteralPath` hoặc ffprobe trực tiếp.

## 4) Xác minh "kết quả thật" (bắt buộc — đừng tin mỗi UI)
- **UI:** snapshot thấy trạng thái (✅ Hoàn thành / ❌ Lỗi) + chips `🎞 <res>` · `💾 <size>` · `📁 <path>`.
- **File thật:** `Get-ChildItem "$env:APPDATA\com.sublix.desktop\downloads"` + đo trực tiếp:
```powershell
& 'C:\Program Files\AI Automation\bin\ffprobe.exe' -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 '<file>'
& 'C:\Program Files\AI Automation\bin\ffprobe.exe' -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 '<file>'
```
- **Tiến trình tải:** lấy mẫu snapshot (bản đầy đủ) mỗi 6–8s, tìm dòng `📥 <đã tải> / <tổng>` + `%`.

## 5) DỌN DẸP bắt buộc sau khi test (trả máy sạch cho PO)
```powershell
agent-browser --session sublixgui close
Get-Process sublix -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','"H:\AI Project\sublix\Chay-Sublix.bat"' -WorkingDirectory 'H:\AI Project\sublix'   # mở lại app SẠCH (không cổng debug)
```
- Xoá file test do mình tạo (hoặc ghi rõ đường dẫn cho PO biết).
- Đảm bảo cổng debug ĐÃ TẮT: `Invoke-RestMethod http://127.0.0.1:9222/json` phải báo lỗi (không kết nối được).

## 6) ⚠️ BẪY ĐÃ GẶP — đọc trước khi bấm (bài học thật từ phiên CommandCode)
1. **Đang lúc PO tải mà sửa file Rust** → dev watcher auto-rebuild → app RESTART → huỷ download của PO. Muốn sửa code giữa chừng: kill riêng tiến trình watcher (`node ...tauri.js dev`) trước — app vẫn sống, download vẫn chạy.
2. **Đừng bấm nút bằng ref "cuối danh sách"** — phải pair ref theo item (mục 3). Đã từng xoá nhầm item của PO.
3. PowerShell 5.1: KHÔNG dùng `&&`; refs phải quote `'@eN'`.
4. Overlay là tab riêng — luôn chọn tab `http://localhost:1420/` (KHÔNG có `?window=overlay`).
5. `snapshot -i` bỏ qua chữ tĩnh (StaticText) — muốn đọc %, đường dẫn, nhãn thì dùng `snapshot` đầy đủ.
6. Nếu screenshot/vision lỗi: bằng chứng snapshot text (a11y tree) vẫn là dữ liệu THẬT từ DOM — dùng nó thay ảnh.
7. Test xong PHẢI đóng cổng debug (mục 5) — vì cổng cho phép điều khiển app từ localhost (bảo mật).
