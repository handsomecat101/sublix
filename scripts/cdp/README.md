# Script kiểm chứng GUI qua CDP (Chrome DevTools Protocol)

Dùng để **verify app thật đang chạy** mà không cần `agent-browser` (công cụ đó trỏ cứng
user máy cũ `C:\Users\TTC\...` → không chạy được trên máy mới).

## Yêu cầu

1. App phải chạy dev mode với cổng CDP mở:
   ```powershell
   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9223"
   npm run tauri dev -- --no-watch
   ```
2. Node.js ≥ 22 (dùng global `WebSocket` + `fetch`, không cần cài package).

## Cách dùng

```powershell
cd C:\AI Project\Sublix

# 01 — dump DOM cửa sổ chính + overlay, chụp màn hình
node scripts\cdp\01-dump-dom-va-chup-anh.cjs gui-2026-10-24\01-main.png

# 02 — bấm 1 tab (khớp theo text, dùng `startsWith` vì label có phụ đề)
node scripts\cdp\02-bam-tab-va-chup-anh.cjs 'Cài đặt' gui-2026-10-24\02-settings.png

# 03 — bấm 1-click preset rồi đọc "Trạng Thái Hệ Thống"
node scripts\cdp\03-bam-preset-va-doc-trang-thai.cjs '💻 Thuần CPU (Laptop)' gui-2026-10-24\03-preset.png 9000

# 04 — test STT thật: sinh giọng nói bằng Windows SAPI → whisper-cli → in transcript
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\cdp\04-test-stt-whisper-that.ps1
```

> ⚠️ **Đuôi `.cjs` là bắt buộc.** `package.json` khai báo `"type": "module"` → Node coi mọi file
> `.js` trong project là ESM, nên `require()` sẽ ném lỗi. Dùng `.cjs` để ép CommonJS.
> (Lỗi thấy: `const fs = require('fs');` → `ReferenceError: require is not defined`.)

## Ghi chú

- Cổng CDP cố định **9223** (khớp quy ước của nhánh fork — `test_dubbing_input/fork-gui-test.js`).
  Đổi cổng thì sửa hằng `PORT` trong đầu mỗi file `.js`.
- Script **chỉ đọc DOM + click**, không ghi vào trạng thái app ngoài ý muốn
  (trừ script 03 — nó bấm *Lưu Cấu Hình*, cần biết trước là sẽ lưu config).
- Ảnh `.png` đã được `.gitignore` nên không làm bẩn cây git.
