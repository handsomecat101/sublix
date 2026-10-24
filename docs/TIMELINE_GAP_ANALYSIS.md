# Đối chiếu Timeline Sublix Studio ↔ Premiere Pro + Khảo sát dự án mở nguồn

> **Ngày khảo sát:** 2026-10-24
> **Task:** `TSK-RES-TIMELINE-GAP` (worker `Mavis/mcode` trong Orca)
> **Phạm vi đọc (KHÔNG sửa code):**
> - `src/views/SublixStudioView.tsx` — 7.701 dòng
> - `src/views/SublixStudioView.css` — 3.275 dòng
> - `package.json` — React 19.1, TypeScript 5.8.3, Tauri API 2.12.4, Vite 7
>
> **Lưu ý về tính đồng thời:** worker `Claude Sonnet 5.5` đang sửa song song
> `src/views/SublixStudioView.*` (task `TSK-TIMELINE-FIX-DND-RANGE`). Báo cáo này phản ánh
> **trạng thái code tại thời điểm đọc**. Các dòng trích dẫn có thể lệch ± vài dòng sau khi
> worker kia commit; nguyên nhân lỗi thì không đổi.
>
> **Quy ước mức độ:** `Có` = tìm thấy code thực sự thực hiện · `Thiếu` = không có code ·
> `Lỗi` = có code nhưng logic hỏng / UI nói dối.

---

## PHẦN 1 — Bảng đối chiếu tính năng timeline: Premiere Pro vs Sublix

### 1.1. Những gì Sublix đã có (nền tảng tốt, không cần làm lại)

| # | Năng lực hiện có | Bằng chứng |
|---|---|---|
| 1 | Zoom theo % viewport, chuẩn Premiere (100% = toàn cảnh video, `\` = fit) | `SublixStudioView.tsx:812`, `:2601-2617`, `:2590-2593` |
| 2 | Tick ruler tự co giãn theo `pxPerSec` (0.1s → 2h) | `SublixStudioView.tsx:2607-2615` |
| 3 | Scrub playhead bằng kéo chuột, có throttle seek video | `SublixStudioView.tsx:2626-2760` |
| 4 | Marquee box-select nhiều khối theo **hình học chồng lấn** | `SublixStudioView.tsx:2234-2344` (đặc biệt `:2303`) |
| 5 | Razor/split tại playhead | `SublixStudioView.tsx:2044-2069`, nút `:6482`, phím `S`/`C` `:2524-2530` |
| 6 | In/Out có đầy đủ: nút `[ I` / `O ]`, kéo handle trên ruler, context menu, phím `I`/`O`/`X` | `:6550-6574`, `:2396-2420`, `:8125-8150`, `:2558-2566` |
| 7 | Chế độ công cụ V/T/R (Chọn / Tua / Khoanh vùng) | `:2532-2550` |
| 8 | Filmstrip thumbnail từ backend (cache theo project) | `:749-751`, `:1010-1012`, render `:7115-7130` |
| 9 | Waveform vẽ bằng Canvas từ `audioPeaks` (300 điểm) | `:746-748`, `:935`, `:3942-3990`, `<canvas>` `:7207-7209` |
| 10 | Track riêng: TIẾNG GỐC / TIẾNG LỒNG / theo từng vai | `:6760-6930`, `:7350-7560` |
| 11 | Mute riêng cho Tiếng Gốc và Tiếng Lồng | `isOriginalMuted` `:1193`, `isVoiceMuted` `:1197`, nút `:6776`, `:6841` |
| 12 | Undo có 4 lớp (chung / phụ đề / dịch / audio) | `:532-535`, `handleUndo` `:1502-1526` |
| 13 | Khoảng thời gian chạy được ghi trong state, có progress overlay | `:7235-7241`, `:7309-7315`, `:7452-7458` |
| 14 | Export có tuỳ chọn ghi phụ đề (burn-in) | `:7686-7730` |

### 1.2. Bảng gap chi tiết

Ưu tiên: **P0** = PO đang bị chặn · **P1** = lõi trải nghiệm · **P2** = nâng cao năng lực · **P3** = tương lai.
Độ khó: **S** ≤ 0.5 ngày · **M** 0.5–2 ngày · **L** > 2 ngày.

| # | Tính năng | Premiere | Sublix | Bằng chứng (file:dòng) | Ưu tiên | Khó |
|---|---|---|---|---|---|---|
| 1 | **Chọn 1 khối** (click) | Có | Có | `onBlockClick` `:336`; state `selectedSegId` | — | — |
| 2 | **Multi-select bằng Marquee (kéo vùng)** | Có | Có | `:2223-2344`, thuật toán overlap `:2303` | — | — |
| 3 | **Multi-select bằng Ctrl+click** | Có | **Lỗi** | Click vào block gọi `onBlockClick` `:336` → `setSelectedSegIds` **ghi đè** thay vì toggle; PO báo "Ctrl+click gộp 1 câu" → đang do worker Sonnet xử lý | P0 | S |
| 4 | **Kéo thả di chuyển khối (drag to move)** | Có | **Thiếu** | `handleNudgeSegment` `:4034-4048` chỉ nhận `field: "start" \| "end"` — không có nhánh `move`; không có `draggable`/`onDragStart` cho `.studio-timeline-block` | P0 | M |
| 5 | **Kéo mép để trim (drag trim)** | Có | **Lỗi** | CSS đặt `cursor: ew-resize` cho `.studio-timeline-block-handle` (`SublixStudioView.css:1574-1584`) nhưng TSX chỉ có `onClick` → nudge ±0.2s: `:341-347`, `:355-362`, `:7388-7394`, `:7410-7417`, `:7528-7534`, `:7547-7553`. Con trỏ nói "kéo" nhưng code chỉ "bấm" | P0 | M |
| 6 | **Ripple trim** (kéo mép, đẩy nội dung sau sang phải) | Có | **Thiếu** | Không có logic ripple ở đâu; `handleNudgeSegment` chỉ dịch 1 đầu, giữ nguyên phần còn lại | P1 | L |
| 7 | **Roll trim** (kéo điểm cắt, 2 clip cùng dài) | Có | **Thiếu** | Không có | P2 | L |
| 8 | **Slip / Slide** | Có | **Thiếu** | Không có | P3 | L |
| 9 | **Razor / Split tại playhead** | Có | Có | `handleSplitSegment` `:2044-2069`, phím `S`/`C` `:2524-2530` | — | — |
| 10 | **Ripple delete (xoá + đóng lỗ)** | Có | **Thiếu** | `handleDeleteSegment` `:2103+` xoá đoạn nhưng **không** dồn các câu còn lại về trước | P1 | M |
| 11 | **Lift / Extract (theo In/Out)** | Có | **Thiếu** | Context menu (`:7970-8225`) không có mục lift/extract; chỉ có "Xóa Các Câu Trong Đoạn Này" `:8083` | P1 | M |
| 12 | **Snapping (bắt dính)** | Có | **Lỗi** | `magnetSnap` khai báo `:813`, **chỉ** dùng để đổi class + toast `:6514-6518`; **không có logic snap** trong bất kỳ handler kéo nào | P1 | M |
| 13 | **Linked selection (liên kết track)** | Có | **Lỗi** | `linkTracks` khai báo `:814`, **chỉ** đổi class + toast `:6526-6530` | P1 | S |
| 14 | **Markers (ghim mốc)** | Có | **Lỗi (thiếu vời)** | `bookmarks` `:872`, thêm tại `:6540-6543`, vẽ cờ `:7076-7095`, click để nhảy `:7090`. **Không** đổi tên, **không** xoá, **không** màu, **không** lưu vào project (chỉ ở state), **không** chống trùng, **không** điều hướng marker kế tiếp/trước | P2 | M |
| 15 | **In / Out marker trên ruler** | Có | Có | Nút `:6550-6574`, kéo handle `:2726-2745`, context menu `:8130`/`:8147` | — | — |
| 16 | **Marquee → tự sinh In/Out** | Có | **Thiếu** | Marquee chỉ set `selectedSegIds` `:2309`, không gọi `handleSetInPoint/OutPoint` | P2 | S |
| 17 | **Filter vùng In/Out theo *chồng lấn*** | Có | **Lỗi** | Dịch `:3052` và Tạo tiếng `:3206` dùng **chứa trong** `s.start >= startSec-0.2 && s.end <= endSec+0.2` → **bỏ sót** câu chồng lấn mép vùng. Trong khi marquee dùng overlap đúng `:2303` → mâu thuẫn nội bộ | P0 | S |
| 18 | **"Dịch Phụ Đề Đoạn Này" chạy được** | Có | **Lỗi** | `handleRunTranslateOnly` `:3040-3191`; lọc vùng sai như #17; **dịch lại từ `original`** (`:3093`) rồi **ghi đè** `translated` của *mọi* câu trong vùng (`:3117-3131`) → **mất bản dịch đã sửa tay** của người dùng, kể cả câu đã dịch đúng trước đó | P0 | M |
| 18b | **Báo lỗi khi dịch hỏng** | Có | **Lỗi** | `:3106-3114`: khi `translateBatch` hỏng → fallback `translateTest`; nếu cả `translateTest` hỏng → `translatedTexts.push(s.original)` — **ghi nguyên văn gốc vào ô `translated`** và `:3120` ghi nó vào state → **TTS sau đó đọc nguyên văn (sai ngôn ngữ) mà không có cảnh báo nào** | P0 | S |
| 19 | **"Tạo Tiếng Lồng Cho Đoạn Này" chạy được** | Có | **Lỗi (PO báo)** | `handleRunVoiceOnly` `:3192-3329`; `:3267` gọi `dubbingPreviewTts(seg.translated, voice)` **không fallback** về `seg.original`, và `:3268-3270` `catch {}` **nuốt lỗi** → `hasAudio=false` mà toast vẫn báo "✅ Đã tổng hợp giọng đọc". So với `syncVoicePlayback` dùng `(seg.translated \|\| seg.original \|\| "")` | P0 | S |
| 20 | **Chạy STT/Dub theo vùng không mất câu ngoài vùng** | Có | **Lỗi (mất dữ liệu)** | `:2982` và `:3528`: `prev.filter((s) => s.end < startSec \|\| s.start > endSec)` → câu **straddling** mép vùng bị xoá hẳn khỏi timeline | P0 | S |
| 21 | **J/K/L shuttle (play ngược / dừng / tiến)** | Có | **Thiếu** | Handler phím `:2491-2594` không có `J`/`K`/`L` | P1 | M |
| 22 | **Phím tắt chuẩn NLE** | Có | **Thiếu** | Thiếu `,`/`.` (insert/overwrite), `;`/`'` (lift/extract), `⌘K` (add edit), `E`/`Q`/`W` (trim tới playhead), `⌥←/→` (nudge 1 frame), `⌃T` (đổi kiểu trim), `Ctrl+Shift+Z` (redo) | P1 | M |
| 23 | **Nudge theo frame** | Có | **Thiếu** | `ArrowLeft/Right` `:2567-2572` nhảy **±1 giây** (Shift = ±5s). Không có khái niệm frame rate trong timeline | P1 | M |
| 24 | **Undo / Redo** | Có | **Lỗi** | Có undo 4 lớp `:532-535`, `handleUndo` `:1502`. **Không hề có redo** — grep `redo` trong toàn file = 0 kết quả | P1 | M |
| 25 | **History panel (danh sách bước)** | Có | **Thiếu** | Chỉ có toast báo đã hoàn tác `:1525` | P2 | M |
| 26 | **Copy / Paste (clipboard)** | Có | **Thiếu** | Không có `navigator.clipboard`; chỉ có "nhân bản" `:2071-2085` (`handleDuplicateSegment`) | P1 | M |
| 27 | **Timecode nhập tay (gõ mốc thời gian)** | Có | **Thiếu** | Grep toàn file: không có `<input>` nào nhận timecode; mọi mốc đều phải click/tua | P2 | S |
| 28 | **Zoom cuộn theo playhead (auto-follow khi phát)** | Có | **Thiếu** | `scrollLeft` chỉ được **đọc** để tính toạ độ (`:2258`, `:2275`, `:2431`, `:2461`, `:2630`, `:2728`, `:4252`) và **ghi** duy nhất ở Shift+Wheel `:2390`. Không có logic cuộn theo playhead khi phát | P1 | S |
| 29 | **Scroll ngang (Shift+Wheel)** | Có | Có | `:2388-2391` | — | — |
| 30 | **Track Lock (khoá track)** | Có | **Thiếu** | Header track (`:6760-6930`) chỉ có nút `M`; không có nút 🔒 | P2 | S |
| 31 | **Track Solo** | Có | **Thiếu** | Không có nút `S`. Nhánh "Solo Narrator" tại `:1593-1595` (`handleQuickMergeToOneRole`) là *gộp vai*, **không phải** solo track | P2 | S |
| 32 | **Mute theo từng track/vai** | Có | **Lỗi** | Nút `M` trên track từng vai `:6891-6895` dùng chung `setIsVoiceMuted` (`:1197`) với track TIẾNG LỒNG `:6841` → bấm `M` ở 1 vai là **tắt tiếng toàn bộ** lồng tiếng | P1 | S |
| 33 | **Add track (thêm rãnh)** | Có | **Thiếu** | Không có nút thêm track; danh sách track dựng từ `speakers.map(...)` (`:6862` track TIẾNG LỒNG, `:7425` track từng vai) | P2 | M |
| 34 | **Waveform hiển thị trên timeline** | Có | Có | `<canvas class="studio-waveform-canvas">` `:7207-7209`, vẽ từ `audioPeaks` `:3942-3990` | — | — |
| 35 | **Waveform theo từng clip lồng tiếng** | Có | **Lỗi** | Khối lồng chỉ vẽ texture `<div class="studio-voice-wave-texture">` `:7385`, `:7525` — không có dạng sóng thật của clip TTS | P2 | M |
| 36 | **Thumbnail / Filmstrip** | Có | Có | `:7115-7130` | — | — |
| 37 | **Ripple trim cận nhất khi kéo (snap)** | Có | **Thiếu** | Xem #12 | P1 | M |
| 38 | **Trim bằng kéo cho khối lồng tiếng** | Có | **Lỗi** | Handle trên khối lồng `:7388-7394`, `:7528-7534` gọi `handleNudgeSegment` → dịch `seg.start` nhưng **không** cắt audio; độ dài khối lồng lại tính từ `computeVoiceBlockDur` (`:7357`, `:7498`) → lệch pha audio | P1 | M |
| 39 | **Ghi/đọc project: giữ vùng In/Out & marker** | Có | **Thiếu** | `localStorage` chỉ lưu `currentTime` + `audioPeaks` `:935-937`; `inPoint`/`outPoint` `:831-832` và `bookmarks` `:872` **không** được lưu | P2 | S |
| 40 | **Virtualization khi > 300 khối** | Có | **Thiếu** | Không có `react-window`/`react-virtualized`; `.map()` trên toàn bộ `segments` (`:7350`, `:7493`). PO nêu "chịu 300+ khối" | P2 | M |
| 41 | **Auto-save + khôi phục sau crash** | Có | **Thiếu** | Có `saveUndoHistory` (`:1499` v.v.) nhưng không có nhật ký khôi phục | P3 | L |
| 42 | **Time base chính xác theo frame** | Có | **Thiếu** | Mọi mốc thời gian là `number` giây, làm tròn 2 chữ số (`:4041`, `:4044`) → không frame-accurate | P2 | L |

### 1.3. Kết luận Phần 1 — 2 điểm PO báo, đã xác định nguyên nhân gốc

| PO báo | Định điểm | Nguyên nhân gốc xác minh |
|---|---|---|
| "Kéo thả khối **không hoạt động**" | #4, #5 | Không có bất kỳ handler kéo nào cho block. Chỉ có `handleNudgeSegment` (`:4034`) sửa `start`/`end` **bằng click**. CSS `ew-resize` (`.css:1579`) là UI nói dối. → **Sửa: thêm vòng kéo pointer thật (move + trim 2 mép).** |
| "Khoanh vùng In/Out **chạy lại tiếng/dịch không hoạt động**" | #17, #18, #18b, #19, #20 | Năm lỗi chồng nhau: (a) lọc vùng bằng **chứa trong** thay vì **chồng lấn** `:3052`/`:3206` → bỏ sót câu ở mép; (b) `dubbingPreviewTts(seg.translated)` không fallback `:3267` + `catch{}` nuốt lỗi `:3268` → tưởng như chạy nhưng không có audio; (c) lọc `prev.filter(...)` `:2982`/`:3528` **xoá mất** câu straddling mép vùng; (d) nhánh dịch lỗi fallback sang `original` `:3112` → TTS đọc nguyên văn; (e) dịch lại **ghi đè** bản dịch tay `:3117-3131`. → **Sửa: 1 helper `segmentsInRange()` dùng chung cho mọi nhánh + fallback text + bỏ `catch{}` rỗng + cảnh báo khi dịch lỗi.** |

> Ghi chú: hai lỗi "khoanh vùng" #19/#20 đã nằm trong scope của worker Sonnet (`TSK-TIMELINE-FIX-DND-RANGE`).
> Phần này **chỉ ghi nhận**, không sửa.

---

## PHẦN 2 — Khảo sát dự án GitHub

> **Ngày kiểm tra toàn bộ số liệu bên dưới: 2026-10-24.**
> Nguồn: GitHub REST API (`api.github.com/repos/{owner}/{repo}` → `stargazers_count`, `forks_count`,
> `pushed_at`, `license.spdx_id`), `raw.githubusercontent.com` cho README/LICENSE, và
> `unpkg.com/{pkg}/package.json` cho metadata npm. Số sao là ảnh chụp tại thời điểm kiểm tra.

### 2.1. Bảng tổng hợp

| Dự án | Link | ⭐ Sao (24-10-2026) | License | Cập nhật cuối | Stack | Rủi ro |
|---|---|---|---|---|---|---|
| **Remotion** | https://github.com/remotion-dev/remotion | 66.850 | ⚠️ **Remotion License** (không OSI) | 2026-10-24 | TypeScript, React | Phải mua Company License nếu tổ chức > 3 nhân sự → **không dùng được cho Sublix thương mại** |
| **wavesurfer.js** | https://github.com/katspaugh/wavesurfer.js | 10.448 | ✅ **BSD-3-Clause** | 2026-10-23 | TypeScript, Web Audio | Nhẹ, ổn định; vẽ waveform/region bằng WebGL. Chỉ là *player*, không phải timeline đa rãnh |
| **FilmCraft** | https://github.com/storytold/filmcraft | 15.954 | ✅ **MIT OR Apache-2.0** | 2026-10-24 | Rust (thuần), UI egui | Alpha (~56% "ready for real work"); kiến trúc Rust không tái dùng trực tiếp cho React — chỉ tham khảo thiết kế |
| **OpenReel Video** | https://github.com/Augani/openreel-video | 5.444 | ✅ **MIT** | 2026-10-17 | TypeScript, React, Zustand, WebCodecs, PixiJS | Monorepo lớn; cần chọn lọc. Desktop build còn alpha |
| **Clypra** | https://github.com/AIEraDev/Clypra | 3.334 | ✅ **MIT** | 2026-10-22 | **Tauri v2 + React 19 + Rust** | ⭐ **Trùng stack Sublix nhất** — tham khảo trực tiếp được |
| **@xzdarcy/react-timeline-editor** | https://github.com/xzdarcy/react-timeline-editor | 800 | ✅ **MIT** | 2026-01-25 | React 18+, TS, `interactjs`, `react-virtualized` | Cập nhật lâu (~9 tháng); `react-virtualized` lỗi thời; nhập dạng khác timeline phụ đề |
| **Open Video Editor (Android)** | https://github.com/devhyper/open-video-editor | 734 | ⛔ **GPL-3.0** | 2026-08-26 | Kotlin, Media3, Jetpack Compose | **GPL — nhiễm bản quyền nếu copy code.** Chỉ tham khảo ý tưởng |
| **vue-video-editor** | https://github.com/openvideodev/vue-video-editor | 64 | ⚠️ README nói MIT, **GitHub API = `null`** (không có file LICENSE) | 2026-02-05 | Vue 3, Nuxt, PixiJS | License **không rõ** → không dùng code. Vue ≠ React. Chỉ 1 commit |
| **FilmCraft Android** | https://github.com/artcraft-android/filmcraft-android | 61 | ✅ **Apache-2.0** | 2026-10-15 | Rust core + Kotlin UI | Rất nhỏ; Android-specific |

### 2.2. Chi tiết từng dự án — phần có thể tái dùng cho Sublix

#### 2.2.1. FilmCraft — `storytold/filmcraft` (15.954⭐ · MIT OR Apache-2.0 · Rust)
**Vì sao PO nhắc:** đây là NLE "trình duyệt" mới nổi, được PO coi là chuẩn mực để đối chiếu.

**Điều Sublix nên học (đọc README, không copy code):**
- **Bộ công cụ trim đầy đủ:** ripple, roll, slip, slide, rate stretch, razor. Trim mode chọn giữa ripple/roll/trim, **nudge 1 frame/lần** (`⌥←`/`⌥→`, ×5 với `⇧`), đổi kiểu trim `⌃T`, kéo dài tới playhead `E`, `Q`/`W` ripple-trim tới playhead.
- **Trim Monitor** hiển thị *cả hai phía* của điểm cắt — rất hợp cho Sublix (người dùng VN không quen thuật ngữ "ripple" nên cần phản hồi trực quan).
- **Dynamic trimming:** `L` tiến, `J` lùi, `K` dừng và **commit thành một bước undo duy nhất**.
- **Time base chính xác:** tính mọi edit trên **tick số nguyên** — 254.016.000.000 tick/giây, chia hết cho mọi frame rate phổ biến (23.976, 29.97 DF, 59.94). → Đáp án cho gap #42.
- **Markers** có màu, tên, thời lượng; **Export Markers as CSV**.
- **Add edit** (`⌘K`) trên một hoặc tất cả track; **nesting**; **copy / paste / paste insert**; **ripple delete và đóng lỗ**; **snapping**; **unlimited undo + History panel**.
- **Keyboard Shortcuts Editor** (`⌥⌘K`): bàn phím vẽ tay, shortcut riêng theo panel, cảnh báo xung đột, preset layout NLE tiêu chuẩn.
- **Auto-save + crash-recovery journal** (~1s sau mỗi edit).
- **Audio mixer:** fader, pan, mute, solo, 5 insert slot, send, submix, Mix track, sample-accurate, latency-compensated; automation Read/Latch/Touch/Write.
- **Loudness meter** chuẩn ITU-R BS.1770 / EBU R128 (momentary, short-term, integrated, true peak), khớp `ffmpeg ebur128` tới 0.1 LU.
- **Captions:** track Subtitle/CEA-608/708/Teletext, import-export SRT/WebVTT/SCC **frame-exact**.
- **Command system:** > 650 lệnh engine có id + tham số có kiểu + trạng thái enabled; UI, CLI, JSON control channel và MCP server đều dispatch cùng một registry.

**Phần tái dùng được cho Sublix:** **kiến trúc lệnh (command registry)** + **mô hình undo 1-bước** + **bảng phím tắt có thể sửa** + **Trim Monitor hai phía**. Không tái dùng code Rust.
**Rủi ro:** FilmCraft là Rust/egui — chuyển ý tưởng sang React là công việc thiết kế, không phải port code. Dự án còn alpha.

#### 2.2.2. Clypra — `AIEraDev/Clypra` (3.334⭐ · MIT · Tauri v2 + React 19 + Rust)
**Vì sao quan trọng nhất:** **trùng stack Sublix gần như tuyệt đối** (Tauri v2 + React 19 + TypeScript + Rust backend).

**Thành phần tái dụng được (theo README):**
- **Multi-Track Timeline & Editing:** frame-accurate trimming, multi-layer track arrangement, **complete undo/redo history** → đối chiếu gap #24 (thiếu redo), #23 (frame nudge).
- **High-Fidelity Audio & Waveforms:** real-time **peak + RMS waveform rendering**, **frame-accurate AV sync**, clip volume controls → đối chiếu gap #35.
- **Kiến trúc:** `src/` React 19 + TS (Timeline UI, Preview Canvas, **Filmstrip Cache**) ↔ Tauri IPC ↔ `src-tauri/` Rust (Frame Decoder, **Decoder Pool LRU cache**, Export Pipeline).
- **State:** Zustand.
- **Test:** `npm test` + `cargo test` + `tsc --noEmit`.

**Rủi ro:** Đây là *ứng dụng*, không phải thư viện — không cài được, phải **đọc code để học mẹo**. Video editor đầy đủ nên rất lớn; chỉ nên khoét phần timeline/audio. MIT nên đọc-sao-copy đều hợp lệ (giữ copyright notice).

#### 2.2.3. wavesurfer.js — `katspaugh/wavesurfer.js` (10.448⭐ · BSD-3-Clause · TypeScript)
**Metadata npm đã kiểm tra:** `wavesurfer.js@8.0.3`, license BSD-3-Clause, có export map `./plugins/*`.
**Các plugin đi kèm trong npm 8.0.3:** `regions`, `timeline`, `minimap`, `zoom`, `envelope`, `hover`, `spectrogram`, `spectrogram-windowed`, `record`.

**Phần tái dụng được cho Sublix:**
- **`RegionsPlugin`** → thay toàn bộ đoạn tự vẽ In/Out hiện tại (ruler handle `:2726-2745`): region **kéo & resize** được, có độ rộng tối thiểu, `color`, `drag`, `resize` → đây chính là giải pháp cho gap #5 (kéo mép trim) và #16 (kéo vùng → In/Out).
- **`TimelinePlugin`** → playhead + marker timeline, có thể gắn marker có nhãn.
- **`MinimapPlugin`** → thanh xem toàn cảnh video ở zoom cao (hiện Sublix **không có** — đây là gap mới đáng bổ sung).
- **`ZoomPlugin`** → zoom theo con lăn chuột kèm minimap.
- **`EnvelopePlugin`** → vẽ đường bao (peak/RMS) đúng chuẩn, thay canvas waveform tự vẽ (`:3942-3990`).

**Rủi ro:**
- wavesurfer là **audio player**, không phải timeline đa rãnh → chỉ dùng cho **lớp âm thanh**, không thay được timeline Sublix.
- `decodeAudioData` giải mã **toàn bộ file** vào RAM → file dài (>30 phút) có thể nặng; cần kiểm tra trước khi áp cho video dài.
- V8 mới, cần xác nhận tương thích WebView2 trên Windows mà Sublix đang dùng.
- BSD-3-Clause → an toàn thương mại.

#### 2.2.4. OpenReel Video — `Augani/openreel-video` (5.444⭐ · MIT · TypeScript)
**Kiến trúc (README):** monorepo pnpm — `apps/web` (editor), `apps/desktop` (Tauri/Electron desktop), `packages/core` (**timeline, media, audio, rendering, export engines**), `packages/ui`, `packages/agent` (AI editing).
**Stack:** React, TypeScript, Zustand, MediaBunny, WebCodecs, WebGPU, Web Audio, Three.js.

**Tính năng liên quan timeline:** trim, split, crop, **ripple delete**, sắp xếp lại clip, đổi tốc độ phát; **nhiều track** video/audio/text/graphics; **transition + keyframe**; **waveform + volume + fade + EQ + compression + ducking**; captions (import SRT); autosave + **undo/redo**; export project file.

**Phần tái dùng được:** ý tưởng tách `packages/core` (engine timeline độc lập UI) — Sublix hiện để **toàn bộ timeline logic nằm trong 1 file 7.7k dòng**; đây là lý do file bị "phình". Và cơ chế undo/redo gộp trong 1 store thay vì 4 stack rời.
**Rủi ro:** MIT (an toàn) nhưng repo rất lớn; `packages/core` có thể phụ thuộc MediaBunny/WebCodecs (không chạy trong Tauri WebView2 một số trình duyệt cũ). Chỉ nên lấy **ý tưởng kiến trúc**, không nhúng cả repo.

#### 2.2.5. @xzdarcy/react-timeline-editor — `xzdarcy/react-timeline-editor` (800⭐ · MIT · TypeScript)
**Metadata npm đã kiểm tra (`@xzdarcy/react-timeline-editor@1.0.0`):**
- `peerDependencies`: `react >= 18.0.0`, `react-dom >= 18.0.0` → **tương thích React 19** ✅
- `dependencies`: `@xzdarcy/timeline-engine@1.0.0`, **`interactjs@^1.10.11`**, **`react-virtualized@^9.22.3`**, `framework-utils`
- Ngôn ngữ chính: TypeScript; MIT.

**Phần tái dùng được:**
- `interactjs` → **bộ kéo-thả (drag/resize) chuẩn**, giải quyết gap #4/#5/#6 mà không phải tự viết pointer math.
- `react-virtualized` → **virtualization**, giải quyết gap #40 (300+ khối).
- `@xzdarcy/timeline-engine` → tách engine timeline (chỉ số thời gian, không phụ thuộc React) — cùng hướng với `packages/core` của OpenReel.

**Rủi ro:**
- **Cập nhật cuối 2026-01-25** → ~9 tháng không commit, 42 issue mở.
- `react-virtualized` là thư viện gần như "abandoned" (React 16-era) → cân nhắc `@tanstack/react-virtual` thay thế.
- Mô hình dữ liệu là *animation timeline* (mỗi item có `mediaId` + `time/width`), khác timeline phụ đề (item = câu thoại có `start/end` + text + audio). Cần viết lớp adapter.
- Không hỗ trợ multi-track kiểu NLE (nó là 1 track ngang).

#### 2.2.6. Remotion — `remotion-dev/remotion` (66.850⭐ · TypeScript)
- **License = `NOASSERTION`** (GitHub API), file `LICENSE.md` là **"Remotion License"** (hai bậc).
- **Điều kiện miễn phí:** cá nhân · tổ chức for-profit **≤ 3 nhân sự** · tổ chức phi lợi nhuận · đang đánh giá.
- **Vượt ngưỡng → phải mua Company License** (remotion.pro). Cấm bán lại/sublicense sản phẩm dẫn xuất.
- Có `@remotion/timeline` với `<Series>`, `<Sequence>`, `useCurrentFrame()` — rất mạnh cho **render theo code**, nhưng Sublix là editor tương tác, không phải renderer.
- **Kết luận cho Sublix: ❌ loại trừ** — rủi ro pháp lý thương mại quá lớn. Chỉ đọc để học mô hình "frame = số nguyên" và "timeline là hàm của frame".

#### 2.2.7. Các dự án chỉ tham khảo ý tưởng (KHÔNG copy code)

| Dự án | License | Vì sao chỉ tham khảo |
|---|---|---|
| **Open Video Editor** (`devhyper/open-video-editor`, 734⭐, GPL-3.0, Kotlin/Media3/Compose) | ⛔ **GPL-3.0** | Copy code vào Sublix (dù Sublix đóng) sẽ **bắt buộc phát hành GPL**. Chỉ được học ý tưởng (UI timeline trên Android, Media3 trim API) |
| **vue-video-editor** (`openvideodev/vue-video-editor`, 64⭐) | ⚠️ Không rõ | GitHub API `license: null` — README ghi MIT nhưng **không có file LICENSE** → không đủ cơ sở pháp lý để dùng code. Ngoài ra là Vue 3 + Nuxt + PixiJS, không dùng được cho React |
| **FilmCraft Android** (`artcraft-android/filmcraft-android`, 61⭐, Apache-2.0) | ✅ Apache-2.0 | Bản port Android của FilmCraft; nhỏ, chỉ đọc để hiểu cách tách core Rust khỏi UI |

### 2.3. Tổng hợp rủi ro license

| Rủi ro | Dự án liên quan | Hành động |
|---|---|---|
| 🟢 An toàn thương mại | wavesurfer.js (BSD-3), FilmCraft (MIT/Apache), Clypra (MIT), OpenReel (MIT), @xzdarcy (MIT), FilmCraft Android (Apache-2.0) | Được phép đọc-sao dùng (giữ notice) |
| 🟡 Cần ký thương mại | Remotion (Remotion License) | **Loại khỏi Sublix** nếu Sublix có > 3 nhân sự hoặc muốn bán |
| 🔴 Nhiễm GPL | Open Video Editor (GPL-3.0) | **Tuyệt đối không copy code**; chỉ đọc ý tưởng |
| ⚠️ License không rõ | vue-video-editor | Không dùng code |

---

## PHẦN 3 — Khuyến nghị: Top 5 tính năng nên làm tiếp

> Ràng buộc: chỉ dùng thư viện/dự án **MIT / Apache-2.0 / BSD**; GPL chỉ tham khảo ý tưởng.

### Top 1 — P0 — **Sửa 3 lỗi "vùng In/Out không hoạt động" + kéo-thả khối thật** *(Lý do: đúng 2 lỗi PO báo, đang mất niềm tin người dùng; 2/3 lỗi là fix < 1 ngày)*

| Hạng mục | Chọn gì | Tự viết hay thư viện |
|---|---|---|
| Lọc vùng In/Out | **Tự viết** một helper `segmentsInRange(segs, in, out)` dùng **chồng lấn** (`s.end >= start && s.start <= end`), thay thế cả `:3052`, `:3206`, `:2982`, `:3528` | Tự viết — 10 dòng, không cần thư viện |
| Fix TTS trong vùng | **Tự viết**: `dubbingPreviewTts(seg.translated || seg.original || "")` + thay `catch {}` (`:3268`) bằng `catch (e)` có log `tracing`/toast lỗi | Tự viết — sửa 3 dòng |
| Báo lỗi khi dịch hỏng | **Tự viết**: ở `:3112` thay `translatedTexts.push(s.original)` bằng đánh dấu `translateFailed: true` + `translated: ""` (đúng như pattern đã có ở `:3124-3126`) để TTS **không** đọc nguyên văn | Tự viết — sửa 2 dòng, tái dùng pattern sẵn có |
| Kéo-thả khối (move + trim 2 mép) | **Tham khảo `interactjs@^1.10.11`** (đã là dependency của @xzdarcy, MIT) hoặc tự viết Pointer Events. **Khuyến nghị: tự viết** bằng `pointerdown/move/up` + `setPointerCapture` vì Sublix đã có sẵn pattern `window.addEventListener("mousemove")` (`:2264`, `:2737`) và logic snap/undo phải khớp; thêm `interactjs` = +1 dependency ~180KB | **Tự viết** (mẫu có sẵn), *tham khảo* interactjs |
| Undo/Redo | **Tự viết** một `history` stack thống nhất (undo **và** redo) thay 4 stack rời `:532-535`; mẫu tham khảo Clypra ("complete undo/redo history") và FilmCraft (1 bước undo = 1 commit) | **Tự viết** |

**Ưu tiên nội bộ:** #17 → #19 → #20 → #4/#5 → #24 (redo). Đây chính là scope worker Sonnet đang chạy — **nếu Sonnet chưa ghi đè #17/#20, cần bàn giao lại**.

### Top 2 — P1 — **Snapping thật + linked selection thật** *(Lý do: 2 toggle đang hiện trên UI nhưng giống "nút bịc" — nguy hiểm uy tín hơn cả thiếu tính năng)*

- `magnetSnap` (`:813`) và `linkTracks` (`:814`) phải được **nối vào logic** kéo-thả Top 1: khi thả khối, snap vào mép câu lân cận / playhead / mốc In-Out (lọc ứng viên trong ngưỡng 8px ÷ pxPerSec) → **tự viết**, ~60 dòng.
- Khi bật `linkTracks`, kéo 1 khối phụ đề sẽ kéo luôn khối tiếng lồng tương ứng.
- **Tham khảo ý tưởng:** FilmCraft (snapping + linked selection), Clypra.
- **Không** dùng thư viện: snapping cần gắn với mô hình câu thoại Sublix, thư viện generic không hiểu "mép câu".

### Top 3 — P1 — **Auto-follow playhead khi phát + zoom theo con lăn chuột có minimap** *(Lý do: đây là trải nghiệm "cảm" nhất khi xem video dài; code hiện tại đọc `scrollLeft` ở 7 nơi nhưng không ghi ở đâu ngoài Shift+Wheel `:2390` — sửa rất rẻ)*

- Auto-follow: trong `tick()` (`:1960-2000`), nếu `playheadX` ra khỏi vùng nhìn thì `container.scrollLeft = playheadX - viewport/3`. **Tự viết**, ~15 dòng.
- Minimap + zoom chuột: **dùng `wavesurfer.js` (BSD-3-Clause)** — plugin `MinimapPlugin` + `ZoomPlugin` cho lớp âm thanh; hoặc tự vẽ một thanh filmstrip nhỏ (đã có sẵn `filmstripThumbs` `:7115`) làm minimap — **khuyến nghị tự vẽ minimap từ filmstrip** (không thêm dependency, tái dùng asset có sẵn).
- **Lưu ý:** `wavesurfer.js` chỉ dùng cho **lớp âm thanh**; đừng cố dùng nó làm timeline đa rãnh.

### Top 4 — P1 — **J/K/L shuttle + phím tắt chuẩn NLE + nudge theo frame** *(Lý do: người dùng editor chuyên nghiệp mở Sublix sẽ bị "vô hình" vì thiếu phím quen tay)*

- **Tự viết** bảng phím tắt dạng **data-driven** (mảng `{key, mods, action}`) → cho phép hiện tooltip đúng và mở đường cho "Keyboard Shortcuts Editor" sau này. Mẫu tham khảo: FilmCraft có sẵn preset NLE.
- Cần thêm **frame rate** vào state để nudge theo frame (hiện mọi mốc là số thập phân 2 chữ số `:4041`/`:4044`) → lấy `fps` từ metadata video (backend đã có) → **tự viết**.
- J/K/L: tua ngược bằng cách tua video ngược (`currentTime -= step`) — cần kiểm tra Tauri backend có hỗ trợ seek tự do hay không (rủi ro kỹ thuật trung bình).

### Top 5 — P2 — **Track lock / solo / mute per-track đúng nghĩa + marker có tên & persist** *(Lý do: 3 nút/2 hành vi đang "nói dối"; sửa nhanh, giá trị cao)*

- **Mute per-vai**: tách `isVoiceMuted` (`:1197`) thành `mutedTrackIds: Set<string>` → sửa `:6841` và `:6893` (hiện cùng toggle toàn cục). **Tự viết**, ~20 dòng.
- **Lock/Solo**: thêm 2 nút vào header track (`:6760-6930`), state mới. **Tự viết**.
- **Marker**: đổi `bookmarks: number[]` (`:872`) → `markers: {id, time, name, color}[]`, thêm sửa/xoá/đổi màu, persist vào project/localStorage cùng `inPoint`/`outPoint`. **Tự viết**.
- Tham khảo ý tưởng: FilmCraft (marker có màu/tên/thời lượng + export CSV), Clypra (track mixer).

### 3.1. Lộ trình tóm tắt

| P | Hạng mục | Tự viết / Thư viện | Ước lượng | Phụ thuộc |
|---|---|---|---|---|
| **P0** | Lọc vùng chồng lấn + fix TTS + fix mất dữ liệu | Tự viết | 0.5–1 ngày | — |
| **P0** | Kéo-thả khối (move/trim) + redo | Tự viết | 2–3 ngày | P0 #1 |
| **P1** | Snapping + linked selection thật | Tự viết | 1–2 ngày | Kéo-thả |
| **P1** | Auto-follow + minimap | Tự viết (minimap) | 1 ngày | — |
| **P1** | J/K/L + phím tắt NLE + nudge theo frame | Tự viết | 2–3 ngày | Cần `fps` từ backend |
| **P2** | Lock/solo/mute per-track + marker nâng cấp | Tự viết | 2–3 ngày | — |
| **P2** | Virtualization 300+ khối | `@tanstack/react-virtual` (MIT) hoặc `react-virtualized` | 1–2 ngày | — |
| **P3** | Ripple/roll/slip/slide đầy đủ | Tự viết (tham khảo FilmCraft) | > 5 ngày | Kéo-thả + undo |
| **P3** | Ripple delete + đóng lỗ | Tự viết | 1 ngày | Undo |

**Tóm lại:** Sublix **không cần** thay thư viện timeline nào. Toàn bộ gap nghiêm trọng nằm ở **logic tương tác + mô hình undo + dữ liệu vùng**, mà các thư viện generic (Remotion, @xzdarcy, vue-video-editor) đều **không giải quyết được**. Nguồn giá trị nhất để *đọc học* là **Clypra** (trùng stack) và **FilmCraft** (thiết kế công cụ trim/marker/undo). Nguồn duy nhất đáng **cài** là **`wavesurfer.js` (BSD-3)** cho lớp âm thanh (regions/envelope/minimap/zoom).

---

## PHẦN 4 — Phụ lục

### 4.1. Bảng phím tắt hiện có của Sublix (đã kiểm tra trong `handleKeyDown`, `:2491-2594`)

| Phím | Hành động | Dòng | So với Premiere |
|---|---|---|---|
| `Space` | Phát / Dừng | `:2505-2512` | ✅ |
| `Delete` / `Backspace` | Xoá câu đang chọn | `:2515-2521` | ✅ |
| `S` / `C` | Split tại playhead | `:2524-2530` | ✅ (Premiere dùng `S`/`Ctrl+K`) |
| `V` / `T` / `R` | Chọn / Tua / Khoanh vùng | `:2532-2550` | ➕ Sublix có, Premiere không |
| `Ctrl+Z` | Hoàn tác | `:2552-2555` | ⚠️ Thiếu `Ctrl+Shift+Z` (redo) |
| `Ctrl+I` | Chọn file media | `:2555-2558` | ➕ |
| `I` | Đặt điểm In | `:2558-2561` | ✅ |
| `O` | Đặt điểm Out | `:2561-2564` | ✅ |
| `X` | Xoá vùng In/Out | `:2564-2567` | ✅ |
| `←` / `→` | Lùi/tới **1 giây** (`Shift` = 5s) | `:2567-2572` | ⚠️ Premiere lùi/tới **1 frame** |
| `Home` / `End` | Về đầu / cuối | `:2573-2578` | ✅ |
| `+` / `-` | Zoom in/out | `:2579-2589` | ✅ |
| `\` | Fit timeline vào viewport | `:2590-2593` | ✅ |

**Tooltip nói dối (2 chỗ):**
- Nút magnet ghi "…(N)" (`:6520`) — **không có** handler phím `N`.
- Nút liên kết ghi "…(P)" (`:6532`) — **không có** handler phím `P`.

### 4.2. Nhật ký kiểm tra số liệu GitHub

| Nguồn | Endpoint | Ngày kiểm tra |
|---|---|---|
| GitHub REST API | `api.github.com/repos/{owner}/{repo}` → `stargazers_count`, `forks_count`, `pushed_at`, `license.spdx_id`, `language` | 2026-10-24 |
| README gốc | `raw.githubusercontent.com/{owner}/{repo}/{branch}/README.md` | 2026-10-24 |
| LICENSE gốc | `raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md` | 2026-10-24 |
| Metadata npm | `unpkg.com/@xzdarcy/react-timeline-editor/package.json`, `unpkg.com/wavesurfer.js/package.json`, `unpkg.com/wavesurfer.js@8.0.3/?meta` | 2026-10-24 |

**Lưu ý:** số sao GitHub thay đổi liên tục — trước khi quyết định mua/nhúng bất kỳ thư viện nào, kiểm tra lại endpoint trên.

### 4.3. Tài liệu liên quan

- [`docs/SPEC_AI_DUBBING_AND_LLM.md`](./SPEC_AI_DUBBING_AND_LLM.md) — đặc tả pipeline lồng tiếng & scriptwriting
- [`docs/HUONG_DAN_HE_THONG_LONG_TIENG_AI.md`](./HUONG_DAN_HE_THONG_LONG_TIENG_AI.md) — hướng dẫn vận hành Studio
- [`agent-team/SOUL.md`](../agent-team/SOUL.md) — kiến trúc & ràng buộc cốt lõi
