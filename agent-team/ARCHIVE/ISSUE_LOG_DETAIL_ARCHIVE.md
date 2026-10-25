# ARCHIVE — ISSUE_LOG.md · phần phân tích chi tiết của lỗi đã ✅ Fixed và cũ

> **Nguồn:** `agent-team/ISSUE_LOG.md` — mục `## 🔍 Chi Tiết Các Lỗi Kỹ Thuật Nghiêm Trọng`
> **Ngày chuyển:** 2026-10-25
> **Điều kiện chuyển:** lỗi `✅ Fixed` **và** ngày phát hiện **trước 2026-10-20**.
> **Giữ tại chỗ trong `ISSUE_LOG.md`:** lỗi 🔴 Open · 🟡 (Workaround / In Progress) · lỗi mới (từ 2026-10-20 trở đi).
> **Nội dung:** nguyên văn, không sửa 1 chữ nào. Quick Index trong `ISSUE_LOG.md` vẫn **đầy đủ mọi mã lỗi**.

---
### [BUG-H07] Lỗi WebView2 `ERR_CONNECTION_REFUSED` do build bằng `cargo build` thô
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** Anh Tuấn (User) | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src-tauri/tauri.conf.json`, Build Pipeline
- **Nguyên nhân gốc (Root Cause):** Chạy `cargo build --release` thô của Rust mà không thông qua Tauri CLI. Binary `.exe` được tạo ra không kích hoạt cờ nhúng tĩnh thư mục `dist/`, mà vẫn đọc cấu hình `devUrl: http://localhost:1420`. Khi user mở app mà máy không chạy Vite dev server, WebView2 hiển thị màn hình lỗi `ERR_CONNECTION_REFUSED`.
- **Cách fix & Bài học BẮT BUỘC:**
  1. Khi đang phát triển / test UI: **KHÔNG CẦN BUILD RELEASE!** Chạy ngay chế độ Dev bằng lệnh `npm run tauri dev` hoặc file [`C:\Users\TTC\Desktop\Chay-Sublix-Dev.bat`](file:///C:/Users/TTC/Desktop/Chay-Sublix-Dev.bat). Thay đổi code đến đâu, màn hình hot-reload ngay tức thì trong 0.1s.
  2. Khi đóng gói Release hoàn chỉnh: **CẤM DÙNG `cargo build`**. Bắt buộc dùng lệnh chuẩn của Tauri: `npx tauri build --no-bundle`. Lệnh này nhúng 100% assets tĩnh offline vào `.exe` và tắt bỏ hoàn toàn `devUrl`.

---

### [BUG-026] amix tầng 2 tái sinh lỗi >896 câu — BUG-005 quay lại từ cửa sau
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `dubbing/mod.rs:899-940` (`build_hierarchical_amix_filter`)
- **Root Cause:** Gom nhóm 28 câu cho tầng 1 đúng luật ≤32, nhưng tầng trộn thứ 2 lại `amix=inputs={ceil(n/28)}` không giới hạn → >32 nhóm (896 câu) FFmpeg từ chối, fail sau khi đã TTS xong toàn bộ.
- **Cách fix & Bài học:** Xây dựng thuật toán gom cây lũy tiến `build_hierarchical_amix_filter` chunking mỗi tầng ≤28 inputs cho đến khi còn 1 stream duy nhất; bảo toàn bất biến ≤28 < 32 trên toàn bộ các tầng (đã qua unit test `test_hierarchical_amix_filter_invariant_under_32` với N lên tới 2500).

### [BUG-027] "Hủy tức thì" không kill tiến trình con + thiếu checkpoint giai đoạn cuối
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `dubbing/mod.rs:40-128, 525, 570, 830, 870, 1000`
- **Root Cause:** Child chờ `.status()` không ai kill khi cancel; sau vòng TTS không còn điểm check nào → Demucs/remux chạy hết và vẫn emit `"done"`.
- **Cách fix & Bài học:** Tạo `ACTIVE_CHILD_PID` registry và hàm `run_child_with_cancel` polling 150ms kết hợp diệt cây tiến trình `taskkill /PID <pid> /T /F` ngay lập tức; bổ sung checkpoint hủy trước và sau Demucs và Remux; xóa file tạm sạch sẽ khi hủy.

### [BUG-028] Cờ hủy dùng chung bị reset → job cũ "hồi sinh", chạy song song
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `dubbing/mod.rs:27-50`
- **Root Cause:** Một `AtomicBool` dùng chung cho mọi run; mỗi run mới gọi `reset_dubbing_cancel()` nên run cũ đang bị hủy được "bỏ hủy" và chạy tiếp song song.
- **Cách fix & Bài học:** Dùng run-generation `AtomicU64` (`CURRENT_GENERATION` & `CANCELLED_GENERATION`); mỗi run giữ generation độc lập `my_gen`; bắt đầu run mới tự động cancel run cũ và diệt PID đang chạy mà không làm sống lại run đã bị hủy. Đã kiểm chứng qua unit test `test_generation_cancellation`.

### [BUG-029] Dịch lỗi âm thầm lồng nguyên văn tiếng gốc vào video thành phẩm
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `translate/mod.rs:343-380`, `translate/server.rs:374, 984, 1084`, `dubbing/mod.rs:715`
- **Root Cause:** Batch lỗi → retry từng câu → lỗi nốt → lấy nguyên văn gốc làm "bản dịch", chỉ ghi log warn; export TTS đọc nguyên văn tiếng Nhật/Anh mà giao diện vẫn bình thường.
- **Cách fix & Bài học:** Khi câu thoại dịch thất bại, đánh dấu rõ ràng `[Dịch lỗi: <câu gốc>]` và gắn trạng thái phân đoạn `status = "translate_failed"`; TTS bỏ qua hoặc cảnh báo, không lồng giả tiếng gốc vào thành phẩm.

### [BUG-030] Âm lượng lệch tới 28× giữa các cụm amix
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `dubbing/mod.rs:899-940` (`build_hierarchical_amix_filter`)
- **Root Cause:** `amix` chuẩn hóa 1/n theo số input **của từng cụm** (28 câu xuống nhỏ, cụm lẻ cuối còn 1-2 câu được hưởng to gấp nhiều); `dropout_transition=0` làm amix renormalize đột ngột khi clip hết dần.
- **Cách fix & Bài học:** Dùng toàn bộ `amix=inputs=...:normalize=0`, loại bỏ hoàn toàn `dropout_transition=0`; âm lượng được giữ nguyên vẹn 1:1 qua mọi tầng cây và chỉ scale một lần duy nhất ở gốc `volume={project.voice_volume}[speech]`.

### [BUG-031] Rò rỉ listener async-unlisten (lặp lại BUG-007) + 2 job GPU dẫm nhau khi đổi tab
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `FileSubView.tsx:96-160`, `DubbingStudioView.tsx:83-121`, `file_sub.rs:205-225`
- **Root Cause:** `if (unlisten) unlisten()` chạy đồng bộ trước khi `await listen()`/`onDragDropEvent()` resolve → listener không bao giờ bị gỡ (StrictMode nhân đôi); `processing` sống trong component bị unmount còn backend không có guard "đang chạy".
- **Cách fix & Bài học:** Sửa cleanup pattern thành `promise.then(u => u()).catch(...)` hủy chính promise đang chờ; bổ sung backend guard `FILE_SUB_RUNNING` với RAII drop guard trong `file_sub.rs` từ chối job dẫm nhau; dùng timestamp UUID tránh trùng file WAV/SRT tạm.

### [BUG-032] Thả file mới giữa lúc đang xử lý → xóa tiến độ, kết quả gán nhầm file
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `FileSubView.tsx:65, 80, 105, 160`, `DubbingStudioView.tsx:55, 105, 122, 130`
- **Root Cause:** Nhánh drop của `onDragDropEvent` không check `processing` (nút thì có disable); `handleSetSelectedFile` reset toàn bộ state → tiến độ biến mất và kết quả job cũ hiển thị dưới tên file mới.
- **Cách fix & Bài học:** Dùng `processingRef.current` và `busyRef.current` chặn ngay lập tức ở mọi lối vào đổi file (`handleSetSelectedFile`, `handlePickFile`, `handleSelectFile`, và sự kiện `drop`).

### [BUG-033] Phím tắt Ctrl+Shift+L dùng cài đặt cũ (stale closure) — code CommandCode
- **Ngày:** 2026-10-04 | **Phát hiện bởi:** CommandCode | **Fix bởi:** Mavis/mcode (`TSK-UI-REDESIGN-R2-7B`, 2026-10-25) | **Status:** ✅ Fixed
- **File:** `SettingsView.tsx` (hotkey `useEffect`, deps `[isLive, overlayVisible]`)
- **Root Cause:** Listener chỉ tái tạo khi `isLive`/`overlayVisible` đổi → `handleStartLive` được gọi là bản cũ, đọc model/ngôn ngữ/chunk ở thời điểm re-bind trước đó; nút bấm thì dùng giá trị mới.
- **Cách fix & Bài học:** Handler trong keydown phải đi qua `latestRef` (hoặc deps đầy đủ). Phím tắt + handler async = cặp đôi dễ dính stale closure nhất.
- **Đã fix:** `latestRef` giữ `{ start, stop, isLive, overlayVisible }`, đồng bộ trong `useEffect` chạy sau **mọi** render; effect keydown giờ `deps: []` và luôn gọi `latestRef.current` ⇒ hotkey và nút bấm dùng **cùng** bản handler mới nhất.

### [BUG-V092-01] fetch_video_info nhận output RỖNG — ngộ nhận "EOF while parsing" khi Kiểm Tra Link
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** Anh Tuấn (screenshot) | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`fetch_video_info`)
- **Root Cause:** Bản vá R2-08.3 đổi `Command::output()` → `spawn()` + `wait_with_output()` (để có PID kill orphan khi timeout) nhưng quên `cmd.stdout(Stdio::piped())`/`stderr`. `wait_with_output()` chỉ đọc được output từ pipe — không pipe thì trả rỗng 100%: yt-dlp exit 0 (kiểm tra OK) ⇒ serde báo "EOF while parsing a value at line 1 column 0"; exit 1 (video chết) ⇒ mất luôn stderr.
- **Cách fix & Bài học:** Thêm pipe cho stdout+stderr; parse JSON an toàn giữa `{` đầu ↔ `}` cuối; fallback thông báo thân thiện. *`Command::output()` tự pipe còn `spawn()` thì KHÔNG — chuyển đổi API phải kiểm tra lại stdio.*

### [BUG-V092-02] Phụ đề bị YouTube chặn 429 — job "Lỗi" oan dù video đã tải xong
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** Anh Tuấn | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`build_download_command`, worker thread)
- **Root Cause:** 4 ngôn ngữ × (manual + auto) = burst request phụ đề liên tiếp → YouTube trả 429; rate-limit phía server, kể cả delay 5s chạy dồn vẫn có thể dính. yt-dlp exit 1 ⇒ app phủ định cả job dù file video đã nằm trên ổ cứng.
- **Cách fix & Bài học:** `--sleep-subtitles 5` giãn cách request + khi lỗi CHỈ ở subtitle mà media đã có ⇒ emit `completed` kèm cảnh báo UI. *Rate-limit server không xóa được 100% bằng client — thiết kế phải "degrade gracefully", giữ kết quả đã có.*

### [BUG-V092-03] yt-dlp in đường dẫn mất ký tự codepage — job "Lỗi" oan dù file đã tải xong
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** Anh Tuấn (screenshot) | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`start_download`, `build_download_command`, `fetch_video_info`)
- **Root Cause:** Khi output của yt-dlp không phải UTF-8, dòng `[download] Destination: <path>` bị mất/thay thế ký tự mà codepage không biểu diễn được (fullwidth `：｜`, CJK). File trên đĩa vẫn đủ ký tự ⇒ `Path::exists()` trượt ⇒ app báo "thoát thành công nhưng không in ra đường dẫn file" oan dù yt-dlp exit 0.
- **Cách fix & Bài học:** (1) Ép `PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1` cho mọi tiến trình yt-dlp; (2) Recovery "bằng chứng gốc": exit 0 mà path không verify được ⇒ quét thư mục tải tìm media theo tag `[<video_id>]` (chỉ khớp id của chính request — luật BUG-046). *Không bao giờ chỉ tin chuỗi text do tool in ra để xác minh sự tồn tại của file — phải hỏi thẳng filesystem.*

### [BUG-V094-01] explorer /select spawn từ Rust không mở cửa sổ — nút "Mở Thư Mục" chết lặng
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** CommandCode (GUI test bằng agent-browser) | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`reveal_downloaded_file`)
- **Root Cause:** `Command::new("explorer.exe").arg("/select,\"file\"")` — Rust escape dấu nháy trong argv (`\"`), explorer.exe parse kiểu riêng nên hiểu sai tham số `/select` → tiến trình chạy xong nhưng không có cửa sổ nào mở (không lỗi, không cảnh báo). Gọi cùng chuỗi từ PowerShell thủ công thì mở bình thường — chỉ hỏng khi đi qua Rust Command.
- **Cách fix & Bài học:** Dùng shell API chuẩn `SHParseDisplayName` + `SHOpenFolderAndSelectItems` (+ `ILFree`; cần features `Win32_UI_Shell_Common`, `Win32_System_Com`). *Mọi tương tác shell (mở file/thư mục) nên đi qua Shell API — đừng spawn explorer với argument phức tạp từ Rust.*

### [BUG-V095-01] MAX nhưng video chỉ 640x360 — ép player_client cũ làm mất hết format DASH
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** Anh Tuấn (Telegram: "ghi là best mà toàn 360p") | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** `src-tauri/src/downloader/mod.rs` (`build_download_command`, `fetch_video_info`)
- **Root Cause:** Commit "YouTube 2026 fix" cũ ép `--extractor-args youtube:player_client=android,web_safari,ios`. YouTube đã bóp client android về SABR-only (format thiếu URL bị skip) ⇒ chỉ còn progressive 360p; `bestvideo+bestaudio` không còn gì để ghép ⇒ rơi về `/best` = format 18 (640x360).
- **Cách fix & Bài học:** Bỏ ép player_client — để yt-dlp tự chọn (js-runtime + `ejs:github` là đủ với 2026.08+). Verify `-F`: 4K/1440p/1080p/720p đủ; tải thật 720p → 1280x720; PO verify 1080p (DeepSeek, 309.7MB). *Cấu hình "chống cháy" cho YouTube có hạn sử dụng — mỗi lần YouTube đổi là phải test lại bằng `-F` trước khi ép cờ.*

### [BUG-V095-02] Tải video 403 Forbidden — yt-dlp thiếu impersonation target (curl_cffi)
- **Ngày:** 2026-10-06 | **Phát hiện bởi:** CommandCode (GUI test Big Buck Bunny) | **Fix bởi:** CommandCode | **Status:** ✅ Fixed
- **File:** Môi trường Python313 của máy (không phải code dự án)
- **Root Cause:** yt-dlp cần impersonation (giả danh trình duyệt) cho một số request media; máy chưa cài `curl_cffi` nên in warning "The extractor specified to use impersonation ... no impersonate target is available" ⇒ media URL trả 403.
- **Cách fix & Bài học:** `python -m pip install curl_cffi` (đã cài, warning hết; BBB retry tải OK 1280x720). *Máy mới/agent mới setup môi trường PHẢI cài kèm `curl_cffi` — ghi vào checklist cài đặt.*

---

### [BUG-059] Bấm "Chạy Video" làm Windows Media Player ngoài Desktop bật lên thay vì phát trong Studio
- **Ngày:** 2026-10-12 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src/views/DownloaderView.tsx` (`handlePlayInStudio`, `handleOpenFile`)
- **Root Cause:** Nút tải xong trước đây có nhãn `▶ Chạy Video`, gọi lệnh Win32 `ShellExecuteW("open", path)` qua IPC `downloader_open_file`. Người dùng hiểu nhầm là app sẽ phát video trong giao diện nội bộ, nhưng Windows lại bật Media Player ngoài màn hình Desktop.
- **Cách fix & Bài học cho Dev sau:**
  1. Nút hành động chính mặc định sau khi tải xong **BẮT BUỘC** là `🚀 Xem Trong Studio` (gọi `handlePlayInStudio` nạp video vào Studio nội bộ).
  2. Nút mở bằng Windows Media Player chuyển thành nút phụ `🖥️ Player Ngoài` với tooltip cảnh báo rõ ràng.
  *Nguyên tắc UX: Các hành động phát media trong desktop app phải ưu tiên player nội bộ của app trước; mở player hệ điều hành chỉ là tùy chọn phụ.*

---

### [BUG-060] Video 25 phút (323 câu thoại) làm treo timeline + bấm Play đứng im + ffmpeg transcode ngầm 100% CPU
- **Ngày:** 2026-10-12 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src/views/SublixStudioView.tsx` (`StudioSegmentCard`, `StudioTimelineSubtitleBlock`, `tick`, `handleTimeUpdate`, `handleLoadedMetadata`)
- **Root Cause:**
  1. *Video Play đứng im ngay khi bấm:* Vòng lặp `requestAnimationFrame(tick)` kiểm tra `v.paused` ở 1–2 frame đầu tiên khi Promise của `video.play()` chưa kịp resolve trên WebView2 → `tick()` tự ép `setIsPlaying(false)` và hủy animation playhead.
  2. *Transcode ngầm 100% CPU:* Timer RVFC (`stillNoFrame`) kiểm tra sau 1.2s trên video đang tạm dừng (pause). Khi pause, RVFC không bắn frame → code tưởng nhầm codec bị lỗi và âm thầm gọi `ffmpeg` transcode cả video 25 phút ngốn 100% CPU mọi nhân.
  3. *Treo/Đơ Timeline khi có nhiều câu thoại:* `timeupdate` kích hoạt `setCurrentTime` liên tục không throttle làm React re-render toàn bộ component 7.200 dòng cùng lúc 323 card danh sách và 323 timeline block (hơn 2.500 DOM nodes mỗi tick).
- **Cách fix & Bài học QUAN TRỌNG cho Dev/Agent sau (CẤM VI PHẠM):**
  1. **Tuyệt đối KHÔNG kiểm tra `v.paused` để dừng sớm trong `requestAnimationFrame`:** Playback là bất đồng bộ; phải lắng nghe native event trực tiếp (`onPlay`, `onPause`, `onEnded`) trên thẻ `<video>` để đồng bộ state.
  2. **CẤM kích hoạt `ffmpeg transcode` khi video đang tạm dừng:** Chỉ transcode khi `videoWidth === 0` sau khi nạp metadata hoặc khi thẻ `<video>` bắn sự kiện `onError`.
  3. **BẮT BUỘC memoize các component lặp lại:** `StudioSegmentCard` và `StudioTimelineSubtitleBlock` phải được bọc `React.memo`. Không truyền anonymous inline functions hay mutable object vào props nếu không cần thiết. Khi playhead chạy qua, **chỉ đúng 2 card re-render** (card cũ và card mới).
  4. **Throttling React State:** Throttling `onTimeUpdate` xuống mỗi 120ms (~8fps) cho React state, trong khi kim Playhead chạy mượt mà 60fps qua direct DOM ref.

---

### [BUG-063] Studio không đổi được video khác (bị dội ngược lại video cũ do useEffect dính filePath) & Thiếu tùy chọn xuất Softsub / Multi-track Audio VLC
- **Ngày:** 2026-10-13 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Antigravity | **Status:** ✅ Fixed
- **File:** `src/views/SublixStudioView.tsx`, `src/views/SettingsView.tsx`, `src-tauri/src/dubbing/mod.rs`, `src/lib/tauri.ts`
- **Root Cause:**
  1. *Không đổi được video:* `useEffect` đồng bộ `initialFilePath` chứa `filePath` trong dependency array (`[initialFilePath, fileNonce, filePath]`) và điều kiện `if (initialFilePath !== filePath)`. Khi người dùng từng bấm "Xem Trong Studio", `pendingStudioPath` ở cha lưu path video cũ. Khi người dùng mở file mới/kéo thả/đóng file trong Studio, `filePath` đổi → `useEffect` tự động chạy lại → thấy `initialFilePath !== filePath` → tự động ép `setFilePath(initialFilePath)` dội ngược lại video cũ.
  2. *Thiếu chế độ xuất video:* Hệ thống chỉ hỗ trợ 1 kiểu remux cứng, không cho người dùng chọn phụ đề mềm (Softsub `-c:s mov_text` bật/tắt trong VLC) vs Hardsub, và không có tùy chọn Đa đường tiếng (Multi-track Audio: Track 1 Tiếng gốc, Track 2 Thuyết minh AI) chuẩn xem VLC.
- **Cách fix & Bài học cho Dev sau:**
  1. **Bỏ `filePath` ra khỏi dependency array của effect:** Chỉ sync khi `initialFilePath` hoặc `fileNonce` thực sự thay đổi giá trị so với ref (`lastLoadedInitialPathRef`, `lastLoadedNonceRef`).
  2. **Tập trung hóa nạp file & giải phóng state cha:** Viết hàm tập trung `handleLoadNewVideoFile(newPath)` reset sạch `segments`, `speakers`, `undoStack`, `audioPeaks`, `filmstripThumbs`, `localStorage` cache cũ; đồng thời gọi `onClearPendingFile?.()` để cha reset `pendingStudioPath = ""` tránh bị dội ngược.
  3. **FFmpeg Multi-track Audio & Softsub:** Triển khai mapping đa track âm thanh (`-map 0:a:0?` + `-map [final_audio]`) và phụ đề mềm (`-map {srt}:s -c:s mov_text`) với ISO language metadata đầy đủ cho VLC/TV; kèm UI modal cấu hình trực quan trước khi xuất.

---

### [BUG-064] Track Tiếng Lồng ("🎙️ TIẾNG LỒNG") chập chờn lúc có lúc không trên Timeline
- **Ngày:** 2026-10-17 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Antigravity & Subagent QA | **Status:** ✅ Fixed (Verified 100% via CDP GUI Test)
- **File:** `src/views/SublixStudioView.tsx` (`showVoiceTrack`, `collapseSpeakerTracks`, `spkSegments`)
- **Root Cause:**
  1. *Điều kiện hiển thị quá phụ thuộc vào trạng thái audio:* `showVoiceTrack` trước đây phụ thuộc vào `segments.some(s => s.hasAudio) || workflowOptVoice`. Khi người dùng mở video có sẵn phụ đề nhưng chưa tạo tiếng, hoặc khi TTS chưa xong/gặp lỗi, toàn bộ lane tiếng lồng biến mất khỏi DOM gây hoang mang.
  2. *Bẫy `speakers.length === 0`:* Khi `collapseSpeakerTracks = false` và `speakers.length === 0`, biểu thức `speakers.map(...)` trả về mảng rỗng `[]`, khiến cả Header lẫn Lane timeline bị mất hoàn toàn dù câu thoại vẫn có trên timeline.
  3. *Lạc mất phân đoạn chưa gán vai:* Khi phân đoạn có `speakerId` không khớp vai nào trong danh sách `speakers`, câu thoại bị lọc mất khỏi lane.
- **Cách fix & Bài học cho Dev sau:**
  1. **Đồng bộ hiển thị Track Tiếng Lồng theo Track Phụ Đề:** Đặt `const showVoiceTrack = showSubtitlesTrack;` để Track Tiếng Lồng luôn hiện diện song hành cùng Track Phụ Đề, không bao giờ biến mất chập chờn.
  2. **Fallback hiển thị khi danh sách vai rỗng:** Cập nhật điều kiện `collapseSpeakerTracks || speakers.length === 0` để luôn render lane tiếng lồng dự phòng với nhãn "Thuyết minh AI" khi chưa chia vai.
  3. **Bảo toàn phân đoạn mồ côi:** Các câu thoại chưa gán vai hợp lệ tự động gán hiển thị trên lane của `speakers[0]`, đảm bảo 100% câu thoại hiển thị trên timeline.

---

### [BUG-065] Lỗi "nhân đôi tiếng" (echo / 2 giọng nói đè lên nhau) khi phát video kèm tiếng lồng
- **Ngày:** 2026-10-17 | **Phát hiện bởi:** Anh Tuấn (PO) | **Fix bởi:** Antigravity & Subagent QA | **Status:** ✅ Fixed (Verified 100% via CDP Telemetry Test)
- **File:** `src/views/SublixStudioView.tsx` (`syncVoicePlayback`, `stopVoicePlayback`, native listeners)
- **Root Cause:**
  1. *Ducking âm lượng mềm không đủ tách giọng:* Cơ chế cũ chỉ hạ âm lượng video xuống 25% (`v.volume = 0.25`). Vì video gốc chứa giọng diễn viên nói cùng thời điểm, mức 25% vẫn phát to và đè trực tiếp lên giọng đọc TTS của AI, tạo cảm giác bị nhân đôi / echo 2 giọng.
  2. *Audio element không được reset buffer triệt để:* Khi chuyển câu hoặc tua, `HTMLAudioElement` cũ chưa được hủy `src` và gọi `load()`, dẫn đến race condition phát lặp hoặc phát chồng chéo.
- **Cách fix & Bài học cho Dev sau:**
  1. **Tự động mute video gốc khi AI nói:** Trong `syncVoicePlayback`, khi câu thoại AI bắt đầu phát, lưu âm lượng gốc và kích hoạt `v.muted = true`. Khi câu thoại AI kết thúc hoặc người dùng bấm dừng/tua, hàm `stopVoicePlayback` tự động phục hồi `v.muted = false` và âm lượng ban đầu.
  2. **Lắng nghe native event `play`:** Thêm `v.addEventListener("play", onPlay)` để đồng bộ tiếng lồng ngay lập tức khi người dùng bấm phát, tránh phụ thuộc vào interval `timeupdate`.
  3. **Hủy triệt để buffer audio cũ:** Gọi `va.onended = null; va.removeAttribute("src"); va.load();` trước khi gán clip mới để WebView2 giải phóng hoàn toàn bộ giải mã âm thanh.

---
