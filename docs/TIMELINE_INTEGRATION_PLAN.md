# Kế Hoạch Gắn Module Timeline Vào `SublixStudioView.tsx`

> **Cập nhật:** 2026-10-24 (sau khi ĐÃ GẮN xong — task `TSK-TIMELINE-INTEGRATE-MODULES`)
> **Trạng thái:** ✅ **ĐÃ GẮN & ĐÃ KIỂM CHỨNG GUI** (22/22 check PASS trên instance riêng).
> **Lưu ý:** worker `Claude Sonnet 5.5` đã sửa `SublixStudioView.tsx` (+1056/−297) trước đó.
> Mọi số dòng trong tài liệu này đã cập nhật theo **file sau khi Sonnet sửa** (8.367 dòng).

---

## 0. Danh mục file đã tạo / đã sửa

| File | Loại | Nội dung |
|---|---|---|
| `src/lib/timeline/timecode.ts` | logic thuần TS | `parseTimecode`, `formatTimecodeInput`, `formatTimecodeDisplay`, `clampSeconds`, `secondsToFrame`, `frameToSeconds` |
| `src/lib/timeline/shuttle.ts` | logic thuần TS | Máy trạng thái J/K/L, `applyShuttleKey`, `computeShuttleSeek`, `shuttlePlaybackRate` |
| `src/lib/timeline/markers.ts` | logic thuần TS | Thêm/xoá/toggle marker, tìm marker trước/sau, serialize/deserialize JSON |
| `src/lib/timeline/trackLock.ts` | logic thuần TS | Khoá track, `isEditBlocked`, `blockedTracks`, message tiếng Việt |
| `src/lib/timeline/clipboard.ts` | logic thuần TS | `copyToClipboard`, `pasteFromClipboard`, nhận diện xung đột |
| `src/lib/timeline/autoFollow.ts` | logic thuần TS | `computeFollowScroll` (page scroll kiểu Premiere) |
| `src/views/studio/TimecodeInput.tsx` | React component | Ô nhập timecode (`React.memo`) |
| `scripts/timeline-tests/` | unit test | **79 test case**, tất cả PASS |
| `src/views/SublixStudioView.tsx` | **đã sửa** | Gắn 6 module + TimecodeInput |
| `src/views/SublixStudioView.css` | **đã sửa** | `.studio-track-lock-btn`, `.studio-timeline-marker-line` |
| `docs/TIMELINE_INTEGRATION_PLAN.md` | tài liệu | File này |

**Quy tắc bất di bất dịch của các module trong `src/lib/timeline/`:**
- KHÔNG import React, KHÔNG import DOM, KHÔNG import lẫn nhau giữa các file trong thư mục.
- Cấm `enum` / `namespace` / parameter properties / decorator (Node chạy `.ts` bằng type-stripping).
- Chỉ dùng `import type` khi cần kiểu từ nơi khác.
- Comment tiếng Việt có dấu, UTF-8.

---

## 1. Bản đồ đã gắn trong `SublixStudioView.tsx` (số dòng SAU khi Sonnet sửa)

| # | Vị trí | Nội dung |
|---|---|---|
| 1 | **47-87** | Import 6 module + `TimecodeInput`. `formatTimecodeDisplay` được **alias** thành `formatTimecode` → mọi call site cũ giữ nguyên, không còn 2 hàm format trùng nhau. Hàm `formatTimecode()` cục bộ (cũ ở dòng 115) đã **xoá**. |
| 2 | **156-158** | Ghi chú thay thế hàm `formatTimecode` cũ. |
| 3 | **576-624** | `StudioTimelineMarkerLines` — component **memo** vẽ vạch marker trên thước. |
| 4 | **720-733** | `SavedStudioProject` += `markers?: TimelineMarker[]` (lưu marker cùng project cache). |
| 5 | **1138-1165** | State/ref mới: `markers`, `trackLocks`, `clipboardRef`, `shuttleRef`, `kHeldRef`, `shuttlePosRef`, `lastShuttleSeekRef`, `shuttleRafRef`, `userScrollAtRef`, `autoScrollAtRef`. Thay thế `bookmarks: number[]`. |
| 6 | **1168-1178** | `getEffectiveRate()` — **nguồn tốc độ DUY NHẤT** (shuttle J/K/L được tính vào, nếu không lấy `playbackSpeedRef`). |
| 7 | **1244, 1252** | Auto-save project cache: ghi `markers` + thêm `markers` vào deps. |
| 8 | **1432-1437** | `handleLoadedMetadata` đặt `playbackRate = getEffectiveRate()` (không đè rate của shuttle). |
| 9 | **1631-1636** | `syncVoicePlayback`: audio lồng dùng rate hiệu lực (BUG-078 của Sonnet vẫn đúng, nay có tính shuttle). |
| 10 | **1658-1663** | Nạp clip lồng: `defaultPlaybackRate` + `playbackRate` = rate hiệu lực. |
| 11 | **2324-2338** | **Auto-follow** trong `tick()`: `computeFollowScroll(mode:"page")` → gán `container.scrollLeft` (DOM trực tiếp, **không** setState); bỏ qua nếu người dùng vừa cuộn tay (< 1.5s). |
| 12 | **2368-2380** | Effect đồng bộ `playbackRate` dùng `getEffectiveRate()`. |
| 13 | **2413-2418** | Guard khoá track trong `handleSplitSegment` (op `split`). |
| 14 | **2485-2500** | Guard khoá track lồng trong `handleDeleteSegment` (nhánh voice, op `delete`). |
| 15 | **2522-2527** | Guard khoá track phụ đề trong `handleDeleteSegment` (op `delete`). |
| 16 | **2784-2798** | Guard khoá track trong `handleBlockMouseDown` (op `move`/`trim`, theo lane `subtitles` / `speaker:<id>`). |
| 17 | **3296-3540** | **Khối handler timeline**: `getCurrentSeconds`, `handleTimecodeSeek`, `handleCopySelected`, `handlePasteSegments`, `handleToggleMarker`, `handleNextMarker`, `handlePrevMarker`, `stableMarkerClick`, `stopShuttleLoop`, `applyShuttleRate`, `startShuttleReverseLoop`, `handleShuttleKey`, effect theo dõi scroll tay, `timelineShortcutsRef`. |
| 18 | **3565-3605** | Nhánh phím mới trong `handleKeyDown`: Ctrl+C / Ctrl+V, J/K/L, M / Shift+M / Ctrl+Shift+M. |
| 19 | **3704-3720** | Listener `keyup` (nhả cờ "đang giữ K") + `blur` (chống kẹt khi Alt+Tab). |
| 20 | **5261-5266** | Guard khoá track trong `handleUpdateTranslated` (op `edit-text`). |
| 21 | **7835-7850** | Nút 🔖 dùng `toggleMarker` (thay `setBookmarks`). |
| 22 | **7940-7952** | Ô timecode → `<TimecodeInput displayRef getSeconds onSeek fps />`. |
| 23 | **7973-7976** | Nút tốc độ: **tắt shuttle** trước khi đổi rate (không có 2 nguồn tốc độ). |
| 24 | **8124-8142** | Nút 🔒 track phụ đề (cạnh nút 🗑️, trong `studio-track-header-actions`). |
| 25 | **8235-8256** | Nút 🔒 track lồng tiếng từng vai (cạnh nút M). |
| 26 | **8433-8440** | Render `<StudioTimelineMarkerLines>` + cờ 🔖 từ `markers`. |
| 27 | **CSS 3141-3196** | `.studio-track-lock-btn` (+ `.locked`), `.studio-timeline-marker-line`. |

---

## 2. Chi tiết 6 tính năng đã gắn

### 2.1. Timecode (ô nhập nhảy tới) — Premiere

- `TimecodeInput` **không** nhận prop `seconds` đổi liên tục (đã sửa sau review).
- `displayRef` trỏ tới node `<span>` mà **file cha giữ quyền ghi** `textContent` (đường 60fps sẵn có ở `tick()` và `handleSeek()`).
- `getSeconds()` là hàm ổn định (`useCallback` → đọc `currentTimeRef`) → giá trị hiện tại chỉ được đọc **khi bấm mở ô nhập**.
- Enter → `parseTimecode` → `clampSeconds(sec, duration)` → `handleSeek`.
- Sai định dạng → viền đỏ, **không** nhảy. Esc → huỷ.

### 2.2. Copy / Paste — `Ctrl+C` / `Ctrl+V`

- `Ctrl+C` chỉ bắt khi **đang có khối được chọn** (không cướp copy text của trang).
- Paste neo câu đầu tiên **đúng bằng playhead**, cấp id mới (`max id + 1`), bỏ tiếng lồng (`stripVoice`), gọi `saveUndoHistory()` (bắt buộc để undo được).
- Xung đột với câu đã có → **báo cáo**, **không tự xoá** câu cũ (`pasteFromClipboard` trả `conflicts`).
- Track đang khoá → chặn dán kèm toast lý do.

### 2.3. Auto-follow (page scroll)

- Tính trong `tick()` bằng `computeFollowScroll({mode:"page"})` → khi kim vượt **90%** bề rộng viewport thì lật trang.
- Ghi `container.scrollLeft` **trực tiếp** (không setState → không re-render 60fps).
- Người dùng cuộn tay → `userScrollAtRef` → **tạm ngưng 1.5s** (listener `scroll` phân biệt cuộn tay với cuộn do auto-follow gây ra).

### 2.4. J/K/L (shuttle)

- `L` → tua tiến 1x → 2x → 4x → 8x (`video.playbackRate` + audio lồng).
- `K` → dừng, rate về `playbackSpeedRef.current`.
- `J` → tua lùi: `<video>` không phát ngược được nên **tự seek theo nhịp** trong một vòng `requestAnimationFrame` riêng:
  - seek video **≤ 15 lần/giây** (66ms) để không nghẽn decoder;
  - `setCurrentTime` **throttle 120ms** (đúng chuẩn file này);
  - kim playhead + timecode ghi DOM trực tiếp.
- `K+J` / `K+L` → nhích **1 frame** (fps 25). Cờ "đang giữ K" do `keyup`/`blur` nhả (chống kẹt).
- **1 nguồn tốc độ:** `getEffectiveRate()`; đổi tốc độ bằng nút → **tắt shuttle** trước.

### 2.5. Marker

- `M` → bật/tắt marker tại playhead (gộp trùng < 0.05s), `Shift+M` → marker kế tiếp, `Ctrl+Shift+M` → marker trước (chuẩn Premiere, đã chốt).
- Vạch marker trên thước vẽ bằng component **memo** `StudioTimelineMarkerLines` → **không re-render theo playhead**.
- Marker lưu cùng project cache (`STUDIO_PROJECT_CACHE_KEY`) → reload vẫn còn.

### 2.6. Khoá track

- Nút 🔒 **cạnh nút M** (tiếng lồng từng vai) / cạnh nút 🗑️ (phụ đề) — **không thêm nút thừa**.
- Track khoá → chặn: kéo (`move`) / trim (`trim`) / cắt đôi (`split`) / xoá (`delete`) / sửa chữ (`edit-text`) / dán (`paste`), kèm toast tiếng Việt.
- Track `original` (tiếng gốc) luôn bị chặn (`ALWAYS_BLOCKED_ON_ORIGINAL`).

---

## 3. Quy tắc bắt buộc đã TUÂN THỦ (từ `agent-team/ISSUE_LOG.md`)

1. **Note 1 — Memoization:** `StudioTimelineMarkerLines` bọc `React.memo`; props ổn định (`markers` chỉ đổi khi thêm/xoá, `onMarkerClick` qua `useCallback` + ref). Không truyền inline callback/object mới vào props khối.
2. **Note 2 — Không setState ở 60fps:** auto-follow gán `scrollLeft` trực tiếp; shuttle lùi throttle `setCurrentTime` 120ms; timecode hiển thị ghi `textContent` trực tiếp.
3. **Note 3 — Không transcode khi video pause.** Không đụng.
4. **Note 4 — KHÔNG chạy `cargo build --release`.** Không đụng Rust.
5. **Undo:** `handlePasteSegments` gọi `saveUndoHistory()`.
6. **Không thêm dependency mới.**

---

## 4. Kiểm chứng thực tế (GUI, instance riêng)

**Cách chạy** (KHÔNG đụng app của PO ở CDP 9223):
1. Vite riêng: `npx vite --port 1422 --strictPort`
2. Copy `src-tauri\target\debug\sublix.exe` → patch chuỗi `localhost:1420` → `localhost:1422` (cùng độ dài) → chạy với
   `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9224` + `WEBVIEW2_USER_DATA_FOLDER` riêng.
3. Nạp project cache (video `test_dubbing_input\A2Z_TEST_EN.mp4` 40.96s + 4 câu phụ đề) rồi kiểm tra.

**Kết quả: 22/22 PASS** (15 check chính + 6 check bổ sung + 1 check khoá độc lập):

| Check | Kết quả đo được |
|---|---|
| Nhập `00:00:20` + Enter | `video.currentTime = 20` |
| Nhập sai định dạng | vẫn ở ô nhập, viền `rgb(239,68,68)`, **không** nhảy |
| Ctrl+C (2 câu) + Ctrl+V tại 30s | 4 → **6 câu**, id mới `5`,`6`, toast "Đã dán 2 câu tại 00:30.00" |
| Auto-follow khi phát | `scrollLeft 0 → 2352.67` (viewport 1110 / content 4181) |
| `L` `L` | `playbackRate` 1 → **2** |
| `K` | `playbackRate` → **1** |
| `J` (1.6s) | `currentTime 20 → 18.22` (tua lùi) |
| `K+L` | `delta = +0.040s` (1 frame @ 25fps) |
| `M` | 0 → **1 vạch marker**, toast "Đã ghim marker tại 00:08.00" |
| `Shift+M` (2 marker ở 8s & 20s) | 2s → **8s** → 20s (đúng thứ tự) |
| `Ctrl+Shift+M` | 20s → **8s** |
| Khoá track phụ đề → kéo khối | `left` **không đổi** (198.048px → 198.048px) |
| Mở khoá → kéo khối | `left` 198.048px → **396.097px** (kéo-thả Sonnet vẫn chạy) |
| Khoá track #2 | track #1 & #3 **không** bị ảnh hưởng (khoá độc lập) |
| Nhập `9999` (vượt media) | clamp về **40.96s** |
| Marker lưu cache | `localStorage` có `markers = 2` (8s, 20s) |
| **Hồi quy Sonnet:** Ctrl+click | **2 khối** được chọn (không gộp về 1) |

---

## 5. Ghi chú kỹ thuật về bộ test

`node --test scripts/timeline-tests/` **không** quét thư mục trên Node 24.20 — tham số thư mục bị hiểu là entry point của module nên báo `Cannot find module '.../timeline-tests'`.

Cách khắc phục (2 file bổ sung, **nằm trong thư mục test**):
- `scripts/timeline-tests/package.json` → `{ "type": "module", "main": "./index.ts" }`
- `scripts/timeline-tests/index.ts` → import cả 6 file `*.test.ts`

Sau đó **cả hai** lệnh đều cho kết quả giống nhau (79 pass / 0 fail):

```bash
node --test scripts/timeline-tests/
node --test "scripts/timeline-tests/*.test.ts"
```

Không ảnh hưởng `npm run build` (thư mục `scripts/` nằm ngoài `include: ["src"]` của `tsconfig.json`) và không ảnh hưởng `package.json` gốc.
