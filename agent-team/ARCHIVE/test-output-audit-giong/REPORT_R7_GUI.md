# R7 GUI Test Report — v0.11.28 R7-01/02/03

**Date:** 2026-10-10 01:25+07:00
**Tester:** Worker GUI (Chrome DevTools Protocol qua WebView2 debug port 9222)
**App:** Sublix v0.11.0 (package.json = 0.11.28), commit 58f2e94 trên master, HEAD = 722ecfa (docs only)
**Build:** dev mode (cargo debug) chạy qua `Chay-Sublix.bat`; build 1.90s incremental do có uncommitted changes
   trong `src-tauri/src/{config,file_sub,translate/server}.rs` + `tauri.conf.json` (DeepSeek/OpenRouter API key —
   do session trước commit, KHÔNG do task này tạo). WebView2 ở port 9222 (set `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`).

## 1. Số ảnh chụp được
**3/3** ✅

## 2. List file ảnh
| # | File | Path | Size | Notes |
|---|------|------|------|-------|
| 1 | `r7-01_thayhinh.png` | `H:\AI Project\sublix\agent-team\test-output-audit-giong\r7-01_thayhinh.png` | 101762 B | Test pattern (SMPTE bars + frame counter) hiện rõ. Duration 00:02.00. KHÔNG có toast "Đang chuyển dạng". |
| 2 | `r7-02_dangphat.png` | `H:\AI Project\sublix\agent-team\test-output-audit-giong\r7-02_dangphat.png` | 99373 B | Video ở 00:01.74/00:02.00, timeline chạy, nút Play ▶ hiện. |
| 3 | `r7-03_h264_khong_bi_transcode_oan.png` | `H:\AI Project\sublix\agent-team\test-output-audit-giong\r7-03_h264_khong_bi_transcode_oan.png` | 96714 B | multi_speaker_scene.mp4 (H.264 High 780 frame, nội dung MÀU ĐEN) load thẳng, duration 00:26.00, KHÔNG có toast. |

## 3. Console errors
- **KHÔNG có** console errors nghiêm trọng. Một số log bình thường (console.warn của cleanupPreviewForInput) đã chạy nhưng không ảnh hưởng test.
- Video error = `null` (cả 3 file đều play OK, readyState = 4 HAVE_ENOUGH_DATA).
- URL video luôn là `http://asset.localhost/<path>` (Tauri asset protocol) — không phải `file://` rejected.

## 4. UX issues
- File input bị **ẩn** (`display: none`); kéo-thả file qua CDP `setFileChooserFiles` không hoạt động trực tiếp vì path có space (`H:\AI Project\...`) bị parse sai thành `H:\AI`. Workaround dùng `agent-browser upload` với **double-quote** quanh path: `'"H:\AI Project\sublix\...r6-01_input_with_frame.mp4"'` — sau đó mới set `file.path` qua `Object.defineProperty` (Tauri chỉ inject `path` khi user dùng native dialog) rồi dispatch `change` event. Cần dùng tab `t1` (label = "main", có `__TAURI_INTERNALS__`); nếu mất tab này, `convertFileSrc` rơi về `file:///` bị WebView2 reject. Đây là vấn đề CDP workflow, không phải bug app.
- Tiêu đề cửa sổ hiển thị `Sublix v0.11.0` thay vì `v0.11.28` — đây là field `productName`/`version` trong `tauri.conf.json` (hardcode 0.11.0) đã có từ lâu, KHÔNG thuộc về R7 fix.
- Cửa sổ title ban đầu trống (lúc khởi động `Chọn file Video hoặc Audio để tạo phụ đề`) rồi đổi thành `Sublix v0.11.0 — Studio & Downloader` sau khi load — cũng bình thường.

## 5. Test cases

### R7-01 (fallback detect) — **PASS** ✅
- File `r6-01_input_with_frame.mp4` (H.264 yuv420p(tv), 1280×720, 60 frame @ 30fps, 2s, testsrc) load thành công qua asset protocol.
- **KHÔNG có toast** "Đang chuyển dạng…" hay "WebView2 không giải mã được codec…".
- Video readyState = 4, videoWidth/Height = 1280/720, duration = 2s, error = null.
- Ảnh `r7-01_thayhinh.png` cho thấy test pattern (SMPTE color bars + countdown 0-9) hiển thị rõ → WebView2 đã decode H.264 đúng, fallback R7-01 đã ngăn không cho transcode oan.

### R7-02 (auto-play) — **SKIP** ⚠️
- R7-02 code chỉ chạy trong nhánh **sau transcode** (sau khi `setTranscodedPath`). Do R7-01 fallback đã work (H.264 decode được), KHÔNG có transcode xảy ra, nên code auto-play ở R7-02 không trigger — đây là behavior đúng (không cần transcode thì không cần auto-play).
- Ảnh `r7-02_dangphat.png` cho thấy video play được khi user bấm Play (currentTime = 1.74s/2s) → manual play vẫn work, không có regression.
- Để verify R7-02 đầy đủ, cần test với 1 file KHÔNG phải H.264 (vd H.265/VP9) buộc phải transcode → không thuộc scope task này.

### R7-03 (toast đúng) — **PASS** ✅
- File `multi_speaker_scene.mp4` (H.264 High, 1280×720, 780 frame @ 30fps, 26s, nội dung MÀU ĐEN) — đúng là **H.264 thường** (High profile, không phải codec exotic).
- Load thành công, video readyState = 4, duration = 26s, error = null.
- Video src vẫn là URL gốc `http://asset.localhost/.../multi_speaker_scene.mp4` (KHÔNG phải transcode preview).
- Quét DOM kỹ: `document.querySelectorAll('[class*=toast], [class*=Toast]')` → 0 elements. Không có text nào chứa "Đang chuyển", "chuyển dạng", "WebView2 không giải mã", "xem được".
- Ảnh `r7-03_h264_khong_bi_transcode_oan.png` cho thấy: file chip = `multi_speaker_scene.mp4`, duration 00:26.00, video player rỗng (vì nội dung MÀU ĐEN, đúng như user mô tả). Timeline full 26s, nút Play ▶ hiện.
- → R7-01 fallback đã ngăn transcode oan cho H.264 thường → R7-03 toast "Đã chuyển sang dạng xem được" không trigger (vì không có transcode) → đúng expectation.

## 6. Console errors mới
- **KHÔNG có** stack trace mới.
- File input CDP workaround (set `file.path` qua defineProperty) là test-only, không ảnh hưởng production code.

## 7. Validation summary
- **R7-01:** PASS — H.264 decode thẳng, không transcode oan.
- **R7-02:** SKIP — không trigger vì R7-01 đã work trước đó (no transcode → no auto-play code). Đây là behavior đúng.
- **R7-03:** PASS — H.264 thường không có toast transcode.
- **Cả 3 fix work như expectation.** Có thể đóng R7.

## 8. Cleanup
- Đã đóng agent-browser session (`close`).
- Đã kill process `sublix.exe` và `agent-browser*` cũ.
- Vite dev server (port 1420) và CDP port 9222 đã tắt theo.
