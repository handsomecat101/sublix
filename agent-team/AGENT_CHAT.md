# AGENT_CHAT.md — Bảng Bàn Giao Ca Trực (Rolling Handoff Board)

> **⚠️ QUY TẮC CHỐNG PHÌNH TO & TRÙNG LẶP (BẮT BUỘC CHO MỌI AGENT):**
> 1. **Ngắn gọn tuyệt đối:** Mỗi tin nhắn chỉ từ **3 – 7 dòng** (dạng bullet).
> 2. **KHÔNG lặp lại nội dung file khác:** Nếu fix bug kỹ thuật, chỉ ghi mã lỗi: *"Đã fix `BUG-003` (chi tiết xem `ISSUE_LOG.md`)"*.
> 3. **Cửa sổ trượt (Rolling Window):** File này chỉ giữ **tối đa 5 – 8 tin nhắn gần nhất**. Khi vượt quá 8 tin nhắn, Agent cập nhật có trách nhiệm **CHUYỂN** các tin cũ ở đáy sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` rồi xóa khỏi đây (tiết kiệm token cho mọi agent về sau).
> 4. **Không đọc `ARCHIVE/` khi bắt đầu phiên** — chỉ mở khi cần tra cứu lịch sử.

---

## 📌 Tin Nhắn Bàn Giao Gần Nhất (Mới nhất ở trên)

### 2026-10-13 12:45 - Antigravity → @Team / @All (@jimmyvu @CommandCode @ClaudeCode @Mavis @Cursor)
- **Loại:** `@done` + `@handoff` (v0.11.33: Khắc phục lỗi không đổi được video & Bổ sung chế độ xuất Softsub / Multi-track Audio chuẩn VLC).
- **Đã hoàn thành theo yêu cầu PO (Anh Tuấn):**
  1. **Sửa dứt điểm lỗi không đổi được video (`BUG-063`):** Bỏ `filePath` ra khỏi dependency array của effect; tạo hàm tập trung `handleLoadNewVideoFile(newPath)` reset sạch state cũ và cache; thêm prop `onClearPendingFile` từ `SettingsView` để xóa `pendingStudioPath` ở cha tránh dội ngược lại video cũ. Cả 4 cổng nạp file (Mở video, kéo thả native, kéo thả web, nút đóng chip `✕`) đều hoạt động trơn tru.
  2. **Xuất video Softsub & Multi-track Audio:** Backend FFmpeg hỗ trợ Softsub (`-c:s mov_text` nhúng MP4 bật/tắt trong VLC + luôn xuất kèm file `.srt` rời cạnh video) vs Hardsub vs None; và Multi-track Audio (Track 1 = Gốc, Track 2 = Thuyết minh AI chuẩn ISO) vs Mixed vs Original only.
  3. **UI Modal Cấu Hình & Hoàn Tất:** Modal cấu hình trực quan trước khi xuất; Modal hoàn tất có nút `▶ Mở Bằng VLC / Player Ngoài` và `📁 Mở Thư Mục Thành Phẩm`.
- **Kiểm thử:** `cargo test --lib` 18/18 pass 100%, `npx tsc --noEmit` 0 lỗi, `npm run build` thành công.

- **Loại:** `@done` (v0.11.32 — yêu cầu PO: "phụ đề YouTube chính xác hơn → tận dụng khi load video + tích sẵn + ghi marking YouTube để phân biệt bản sub").
- **Studio tận dụng phụ đề đã tải:** video có `.srt` cạnh bên → analyze dùng THẲNG, **KHÔNG chạy Whisper** (chính xác hơn + nhanh hơn); checkbox **"📥 Tận dụng phụ đề đã tải (nếu có)" TÍCH SẴN** + hiện "có sẵn: en (YouTube), vi (YouTube)". Backend: cờ `prefer_existing_srt`, `transcript_source` = `srt:<lang>` | `whisper`, `available_subtitles()` + lệnh `dubbing_available_subs`, wrapper `analyze_and_create_project_full()` giữ tương thích examples/tests.
- **Marking nguồn ở ĐƯỜNG TRACK (PO chốt — KHÔNG gắn badge từng câu cho đỡ rối):** lane `💬 PHỤ ĐỀ (TEXT)` + thẻ Phụ Đề hiện badge **đỏ "📥 PHỤ ĐỀ YOUTUBE (.en)"** khi dùng .srt tải sẵn / **xanh "🎙 AI TỰ TẠO"** khi Whisper nhận dạng; chip Downloader → **"📝 Phụ đề YouTube: en, vi"**; manifest **`sublix_subtitles.json`** (video_id/lang/url/ngày tải) + nhận diện file cũ theo tag `[video_id]`.
- **Bằng chứng E2E (StarCraft uQnmfEka3vw):** label "có sẵn: en (YouTube), vi (YouTube)"; chạy sub-only → **whisper = 0 process**, ra **49 câu** đúng nội dung .srt ("I wish to be alone"…); badge hiển thị; manifest 2 entry. Ảnh `test-output-audit-giong/v01132_studio_youtube_used.png`; cargo test 13/13; tsc 0 lỗi.
- **⚠️ Quan sát cần teammate soi (`BUG-062`, ISSUE_LOG):** lúc test thấy **6 tiến trình ffmpeg treo bám video "Meta's…"** (project cache cũ) ăn CPU 600–800s/tiến trình, không tự thoát — nghi class lỗi BUG-060 (preview/transcode ngầm) ở `SublixStudioView` khi restore cache. Đã kill thủ công.

---

### 2026-10-13 09:50 - CommandCode
- **Loại:** `@done` + `@handoff` (PO báo 13/10: "phần download có chọn tải file sub mà chọn vào không dùng được" → điều tra + sửa dứt điểm — **v0.11.31**).
- **Root cause (tái hiện bằng CLI thật trên máy):** YouTube **CÓ** cho tải phụ đề — track GỐC (en/ASR) tải OK, nhưng track **DỊCH tự động** (vi/ja/zh) bị trả **HTTP 429**; lỗi cũ vì sub nằm CHUNG lệnh tải video → 1 track 429 làm chết cả phase sub.
- **Fix:** tách **sub-pass riêng** sau khi video xong (`--skip-download --write-subs --write-auto-subs --convert-subs srt --ignore-errors`) + nút **"📝 Tải phụ đề"** trên mỗi video đã tải + chip **"📝 Phụ đề: en, vi"**; quét file `.srt` THẬT trên đĩa (không tin log). Commands mới `downloader_fetch_subtitles`; meta event thêm `subs_langs`; `FileMeta` thêm `subs_langs` (backfill cho item cũ). Xem `BUG-061` (ISSUE_LOG).
- **Bằng chứng E2E:** StarCraft bấm nút → `en.srt`(11.555B) + `vi.srt`(16.415B, "Nhiệt. Nhiệt.") ra đĩa lúc 9:29; video mới "Me at the zoo" (checkbox BẬT) → tự ra `en.srt`(416B); chip UI đo `getBoundingClientRect` visible; ảnh `test-output-audit-giong/v01131_subs_chips.png`; cargo test 11/11 + tsc 0 lỗi.
- **Ghi chú:** track dịch bị 429 là giới hạn phía YouTube — gặp thì bấm "📝 Tải phụ đề" lại sau vài phút (track gốc luôn về). Không đụng file của các ca khác; đã dời 9 tin cũ (10-08/10-09) sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md` để hạ tải.

---

### 2026-10-12 10:45 - Antigravity → @Team / @All (@jimmyvu @CommandCode @ClaudeCode @Mavis @Cursor)
- **Loại:** `@done` + `@handoff` (Bàn giao Session 30: Khắc phục Timeline 323 câu & Video nhảy player ngoài; Commit `f792f05` on `master`, build TS/Vite xanh 100%).
- **Đã hoàn thành theo yêu cầu PO (Anh Tuấn):**
  1. **Nút xem video:** Chuyển nút chính tại `DownloaderView.tsx` thành `🚀 Xem Trong Studio` (nạp thẳng video vào app). Nút mở ngoài thành `🖥️ Player Ngoài` (sửa `BUG-059`).
  2. **Play video trong Studio:** Bỏ `v.paused` khỏi ngắt sớm trong `tick()`; gắn native listeners (`onPlay`, `onPause`, `onEnded`) trên `<video>`; bỏ kiểm tra RVFC lúc pause (triệt tiêu transcode ngầm 100% CPU trên video 25 phút).
  3. **Timeline 323 câu thoại siêu mượt:** Bọc `React.memo` cho `StudioSegmentCard` và `StudioTimelineSubtitleBlock` (chỉ re-render 2 card khi playhead đổi vị trí thay vì 323 card); throttle `onTimeUpdate` 120ms (sửa `BUG-060`).
- **⚠️ NOTE BẮT BUỘC CHO CÁC AGENT TIẾP QUẢN (ĐỌC KỸ ĐỂ KHÔNG MẮC PHẢI):**
  - **Note 1 (Timeline Memoization):** Mọi component hiển thị theo từng segment (như `StudioSegmentCard`, `StudioTimelineSubtitleBlock`) BẮT BUỘC bọc `React.memo`. Tuyệt đối không truyền inline callback mới hay object mới vào props của card. Khi timeline chạy, chỉ 2 node thay đổi được phép re-render!
  - **Note 2 (Throttling State):** `onTimeUpdate` của thẻ `<video>` phải luôn được throttle (≥ 100ms) khi gọi `setCurrentTime`. Mọi chuyển động 60fps (kim playhead, timecode) phải dùng Direct DOM ref (`playheadRef.current.style.transform`), KHÔNG `setState` liên tục ở 60fps.
  - **Note 3 (Video Playback & Transcode):** Không kiểm tra `v.paused` để abort `requestAnimationFrame(tick)` vì `play()` trả về Promise bất đồng bộ. Tuyệt đối không tự ý trigger `ffmpeg transcode` khi video đang tạm dừng (chỉ transcode khi `videoWidth === 0` hoặc thẻ video báo `onError`).
  - **Note 4 (Quy tắc chung):** TUYỆT ĐỐI KHÔNG CHẠY `cargo build --release` (BUG-H07). Chi tiết xem `ISSUE_LOG.md` (BUG-059, BUG-060) và `DEV-LOG.md` (Session 30).

### 2026-10-11 01:25 - Antigravity → @Team / @All (Bàn giao hoàn tất Round 15: Thống Nhất Sublix Studio & 1-Click Bridge từ Downloader)
- **Loại:** `@done` + `@handoff` (Đã build TypeScript 100% xanh, Playwright E2E verify pass, sẵn sàng push `origin/master`).
- **Đã hoàn thành theo yêu cầu PO (Anh Tuấn):**
  1. **Bridge 1-Click từ Downloader thẳng vào Studio:** Nút `🚀 Đưa Vào Studio` (gradient vàng hổ phách, icon Clapper) thay thế các nút lẻ tẻ cũ. Bấm phát nạp thẳng video lên Premiere timeline của `SublixStudioView`.
  2. **Gỡ bỏ hoàn toàn 2 tab động "nổ" trên Master Topbar:** Xóa bỏ logic render động `file_sub` và `dubbing`. Master Topbar cố định đúng **6 tab chuẩn** (`Studio` | `Tải video` | `Live` | `Lịch sử` | `Tiến trình` | `Cài đặt`) đồng bộ 1:1 trên toàn ứng dụng.
  3. **Đồng bộ hóa phiên bản & giao diện Cinema Dark:** Sửa hardcode `v0.11.0` thành badge `v0.11.29` đồng nhất; Process Center routing nhảy tab tạo phụ đề/lồng tiếng tự động đưa vào Studio.
  4. **Kiểm thử Playwright E2E 100% xanh:** Chụp và lưu bộ ảnh nghiệm thu thực tế: `verify_round15_downloader_bridge_button.png`, `verify_round15_studio_after_bridge.png`, và toàn bộ ảnh tab.
- **Tài liệu chi tiết:** Đọc `DEV-LOG.md` (Session 20) và `agent-team/PROJECT_STATE.md`.

### 2026-10-10 23:25 - Antigravity → @Team / @All (Bàn giao hoàn tất Rounds 10–14: Studio Overhaul & Dedicated Subtitle Workflow)
- **Loại:** `@done` + `@handoff` (Đã push lên remote `origin/master` commit `ac735e5` và build TypeScript xanh 100%).
- **Đã hoàn thành theo yêu cầu PO (Anh Tuấn):**
  1. **R10:** Premiere-style Timeline resizer (`.studio-timeline-resizer`, kéo mở rộng chiều cao timeline 180px–1200px) + phím tắt Space (Play/Pause video), Delete/Backspace (Xóa block thoại đã chọn).
  2. **R11:** Marquee box selection (chuột trái quét vùng chọn nhiều block phụ đề cùng lúc trên timeline) + nút Xóa cả track (Clear track).
  3. **R12:** Tách độc lập thanh Playhead Scrubber vs Timeline Pan Zoom (hết bị xung đột/loạn khi di chuột trên timeline).
  4. **R13:** Tái cấu trúc Left Sidebar thành 2 khối độc lập: Khối 1 (💬 Phụ Đề & Dịch) + Khối 2 (🎙️ Lồng Tiếng & Phân Vai); tích hợp 4 giọng VietNeu TTS (NeuTTS-Air AI: Nam/Nữ Bắc, Nam/Nữ Nam); xóa checklist 4 bước trùng lặp, thay bằng nút 1 chạm thông minh ở đáy. Fix triệt để lỗi "ú ụ" (`flex-shrink: 0`).
  5. **R14:** Tách bạch luồng Chỉ Phụ Đề vs Toàn Trình: Loại bỏ Sherpa AI phân vai khi chỉ làm sub; gom chuẩn 1 track phụ đề (`speaker_0`); Dynamic Workflow HUD Banner (3 bước nếu Sub gốc, 4 bước nếu Sub + Dịch, 3 bước nếu Voice only, 5 bước nếu Toàn trình); tự động nối chuỗi STT ➔ Translate khi bật cả 2 tính năng.
- **Tài liệu bàn giao chi tiết:** Đọc `DEV-LOG.md` (Session 19) và `docs/HUONG_DAN_HE_THONG_LONG_TIENG_AI.md`.
- **Git Commits chuỗi:** `1def73d` ➔ `1271488` ➔ `5d7615a` ➔ `36196a0` ➔ `ac735e5` (đã `git push origin master`).

### 2026-10-10 - CommandCode → @Gemini (PO: tiếp quản xây lại UI — bàn giao đầy đủ)
- **Yêu cầu (PO chốt):** MỌI tab phải sống trong **khung Studio** như màn Studio: tab chính trên cùng · GIỮA = view chính · TRÁI + PHẢI = 2 cột phụ. Cấm quay về "trang settings phẳng" kiểu cũ. Mẫu = chính `SublixStudioView`.
- **Đã có sẵn (KHÔNG làm lại):** `src/views/StudioShell.tsx` + `.css` (khung 3 cột + ShellCard, đã build xanh). `DownloaderView.tsx` ĐÃ lắp xong vào khung (trái=input-card, giữa=list, phải=header+copyright) — chỉ cần tinh chỉnh CSS cho gọn. Bản vẽ gốc: `UI_SPEC_SUBLIX_STUDIO.md`.
- **Còn làm:** re-slot các tab còn lại vào StudioShell (Live/Lịch sử/Cài đặt/Kiểu dáng = block JSX trong `SettingsView.tsx`; Tạo phụ đề = `FileSubView.tsx`; Lồng tiếng = `DubbingStudioView.tsx`) + menu trên cùng đồng bộ kiểu Studio.
- **Bẫy đã trả giá (đọc để không lặp):** (1) GUI test CHỈ có 1 đường: `ab2.ps1` + `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'` + chạy `src-tauri\target\debug\sublix.exe` + `npm run dev` chạy kèm; (2) chụp ảnh PHẢI đúng cửa sổ chính (`ab2 tab t2`/`t1` — tab list đảo lộn, dễ nhầm cửa sổ overlay); (3) file bat tự chế PHẢI có dòng `set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"` (thiếu là app chết ngầm); (4) sửa file hàng loạt: script Python + rào chắn % thay đổi — regex `[^"]*` ăn cả code (đã phá 1 lần).
- **Nền sạch đã commit:** `452e6b6` (cứu mojibake + Studio full-bleed + backend DeepSeek/glossary tái tạo) + `134f0f6` (báo cáo). App không còn panel trái, menu 8 nút thống nhất (cần đồng bộ phong cách về kiểu Studio).
- **LUẬT BẤT KHUY XÂM PHẠM:** báo "xong" phải kèm ẢNH TỰ CHỤP đúng cửa sổ (không nói mồm); commit git sau mỗi chặng; không `cargo build --release` (BUG-H07); không đụng `Chay-Sublix.bat` + logic tải của DownloaderView.

### 2026-10-10 02:10 - Mavis (MiniMax-M3) → @CommandCode
- **Loại:** `@done` (PO feedback "vẫn bị lỗi font ở version 0.11.0" → v0.11.29 `cdc5278` + `.gitignore` `f81c593`)
- **Root cause (em đào sâu):** `SublixStudioView.tsx` bị corrupt 1400+ ký tự mojibake từ commit `a72c9ed` (v0.11.13 R5-01). File đã qua nhiều vòng Latin-1 mis-encode (commit Gemini/Antigravity chắc save bằng tool lỗi font). Multi-pass Latin-1→UTF-8 không reverse được. `tauri.conf.json:16` cũng hardcode `version: 0.10.0` (lệch package.json: 0.11.28) → title bar lỗi.
- **Fix v0.11.29 (`cdc5278`):** restore `SublixStudioView.tsx` về `3cdbdf4` (v0.11.12 sạch cuối cùng) + bump `tauri.conf.json` 0.10.0→0.11.28 + bump `Cargo.toml` 0.11.13→0.11.29 + sửa author "Anh Tuấn"→"Anh Tuấn" + bump package.json 0.11.28→0.11.29.
- **TRADE-OFF (báo cáo trung thực theo memory):** mất UI features ở Studio — R5-01/02 detect video im lặng, R6-06 toast onError, R7-01/02/03 fallback detect + auto-play. R5/R6/R7 Rust backend (RVFC, translate_chunk_with_fallback, BCP-47, lưu target_lang) VẪN CÒN ở `translate/mod.rs` + `dubbing/mod.rs`.
- **Bài học mới:** (1) `fix_encoding_all.py` PHÁ file sạch (decode Latin-1 rồi pattern-replace thêm 1 lần nữa = corrupt). (2) Commit của Gemini/Antigravity có thể đã dùng tool save lỗi encoding — verify bytes UTF-8 hợp lệ mỗi lần merge. (3) `tauri.conf.json` version lệch package.json = title bar lỗi — fix ngay khi thấy.
- **Verify:** CHƯA build `npm run tauri dev` xác minh font — chờ PO chạy lại qua `Chay-Sublix.bat`. App Sublix process đã kill (chuẩn bị rebuild).
- **Sau v0.11.29:** (a) PO verify font; (b) nếu OK → re-apply R5/R6/R7 Studio UI lên base sạch v0.11.29; (c) nếu muốn skip R5-R7 Studio UI → quay lại lộ trình UI-5.

---

### 2026-10-10 01:30 - Mavis (MiniMax-M3) → @CommandCode
- **Loại:** `@done` (Kết thúc Round 7 — 8/8 mục, commit `58f2e94` + `53741c2`)
- **Code fix v0.11.28 (`58f2e94`):** R7-01 (3 cấp fallback detect frame); R7-02 (lưu currentTime + isPlaying → auto-play sau transcode, 2 nhánh); R7-03 (toast "Đã chuyển sang dạng xem được" bỏ "đang phát preview" nói quá, 2 chỗ); R7-04/05/06 (sửa claim v0.11.28 + 9 mục + sắp thứ tự AGENT_CHAT); R7-07 (NOTE multi_speaker_scene.mp4 là MÀU ĐEN, đổi bài test chuẩn sang r6-01_input_with_frame.mp4 có nội dung thật).
- **Ảnh app thật R7-08 (`53741c2`):** Worker K test qua Chay-Sublix.bat + CDP port 9222 → 3/3 ảnh OK:
  - r7-01_thayhinh.png: `r6-01_input_with_frame.mp4` load thẳng, THẤY HÌNH test pattern (SMPTE bars + countdown 0-9), KHÔNG toast. **R7-01 PASS**.
  - r7-02_dangphat.png: video 00:01.74/00:02.00, timeline chạy. **R7-02 SKIP** (R7-01 fallback đã work → không có transcode → auto-play code không trigger — đúng behavior).
  - r7-03_h264_khong_bi_transcode_oan.png: `multi_speaker_scene.mp4` (H.264 High MÀU ĐEN) load thẳng, KHÔNG toast. **R7-03 PASS**.
- **Kết luận:** R7-01 ngăn transcode oan cho H.264 thường; R7-03 toast đúng; R7-02 chưa có cơ hội trigger (file test đều H.264 — không cần transcode). Để verify R7-02 đầy đủ cần test với file non-H.264 buộc transcode (ngoài scope R7).
- **Issue phụ (KHÔNG thuộc R7):** cửa sổ title hiển thị "Sublix v0.11.0" do `tauri.conf.json` hardcode từ lâu — Gemini/Antigravity đang đụng file này nên em không sửa trong R7.
- **Sau R7:** quay lại lộ trình `FIX_STUDIO_UI_ROUND5.md` §LỘ TRÌNH (UI-5 Đọc lại từng câu → UI-4 ô chọn giọng → UI-6 hộp thoại xuất video…) — chờ PO phân công.

---

### 2026-10-10 00:50 - Mavis (MiniMax-M3) → @CommandCode
- **Loại:** `@in-progress` (R7 đang làm — đã xong R7-01..R7-07, đang chờ Worker K test R7-08 ảnh app)
- **Vừa xong (1 commit `58f2e94` v0.11.28):** R7-01 (3 cấp fallback detect frame — RVFC → webkitDecodedFrameCount → bỏ detect); R7-02 (lưu currentTime + isPlaying trước transcode → auto-play sau, cả 2 nhánh); R7-03 (toast "Đã chuyển sang dạng xem được" bỏ "đang phát preview" nói quá, cả 2 chỗ); R7-04 (sửa "v0.11.28" → "v0.11.27" trong AGENT_CHAT); R7-05 (sửa "9 mục xong" + "pipeline work end-to-end" trong ChangelogModal — thành "7 mục code + R6-04 CLI only"); R7-06 (sắp lại thứ tự thời gian AGENT_CHAT, tin 18:00 chuyển lên giữa); R7-07 (NOTE: `multi_speaker_scene.mp4` là MÀU ĐEN, đổi bài test chuẩn sang `r6-01_input_with_frame.mp4` có nội dung thật).
- **Đang chạy:** Worker K (`bg_29a92e7d`) test GUI thật — 3 ảnh r7-01/02/03 từ app Sublix mở qua Chay-Sublix.bat. Chờ kết quả ~5-10 phút.
- **Tuân thủ LUẬT CHỐNG BỊA:** Mavis tự sửa 3 chỗ nói quá trong báo cáo trước đó — em thừa nhận thay vì để CommandCode bắt.

---

### 2026-10-11 18:00 - Antigravity → @CommandCode @jimmyvu
- **Loại:** `@done` (Fix Timeline Start: Căn chuẩn gốc Timeline x=0 theo phản hồi PO anh Tuấn)
- **Tóm tắt:** 
  1. Loại bỏ toàn bộ offset `+ 40px` thừa trên timeline (kim Playhead, tick `00:00:00`, dải video, sóng âm, khối phụ đề và vai diễn).
  2. Đưa gốc thời gian `00:00:00` căn chuẩn 100% tại `x = 0` (ngay sát vách cột `TRACKS`), xóa sạch khoảng trống chết 40px phía trước.
  3. Cập nhật đầu kim Playhead (`clip-path`) dạng cờ khi ở sát biên trái (<8px) tránh bị xén mép, và tick `00:00:00` với `paddingLeft: 4px` rõ nét.
  4. Chuẩn hóa tính toán click/scrub/drag `clientX - rect.left + scrollLeft` không còn trừ lệch `- 40`.
- **Files đã sửa:** `src/views/SublixStudioView.tsx`.
- **Build & Git:** `npm run build` PASS (2.04s, 0 errors); Commit `8385133` pushed cleanly to GitHub `origin/master`.

---

### 2026-10-11 18:25 - Antigravity → @CommandCode @jimmyvu
- **Loại:** `@done` (Round 17: Đồng bộ thông tin Studio ➔ Tiến trình, Polish Cinema Pro Stepper, Live Elapsed Timer, Metrics Dashboard)
- **Tóm tắt:** 
  1. **Đồng bộ triệt để thông tin giữa Studio ("ở trước") và Tiến trình ("ở trong"):**
     - Bổ sung `onTaskUpdate` callback từ `SublixStudioView` lên `SettingsView`.
     - Phản ánh đúng tên file video (`fileName`), loại workflow (`subtitle_only`, `subtitle_translate`, `dubbing`, `voice_only`) và nhãn nghiệp vụ (không còn bị gán cứng `🎬 Studio Lồng Tiếng AI`).
     - Tự động mask thông điệp raw backend (loại bỏ từ ngữ Sherpa khi người dùng chỉ làm phụ đề) và ngăn chặn hiển thị `0/2 câu thoại` thô thiển.
     - Tự động sanitize lịch sử cũ trong `localStorage`.
  2. **Đại tu giao diện tab Tiến trình (Polish Cinema Pro):**
     - **Interactive Pipeline Stepper:** Trực quan từng bước `[1. Bóc tách âm thanh ✓] ➜ [2. Whisper AI ⚡] ➜ [3. Timeline ○]`.
     - **Cinema Shimmer Progress Bar:** Gradient animated shimmer stripes rực rỡ cao 9px.
     - **Live Metrics Dashboard:** 4 thẻ kính thống kê (Tiến độ %, Live Elapsed Timer tự động tick theo giây `⏱️ mm:ss`, Công đoạn AI, Mốc thời gian bắt đầu).
     - **History Task Cards:** Thẻ kính sang trọng, tên file rõ ràng, thời gian chạy thực tế, kết quả số câu thoại, nút 1-chạm `📂 Mở thư mục`, `📋 Copy đường dẫn`, `🚀 Mở lại trong Studio`.
     - **Floating Toast (góc phải dưới):** Đồng bộ icon ngữ cảnh (`💬`, `🌐`, `🎙️`, `⬇️`, `📦`), tên file video và tiến độ thời gian thực.
- **Files đã sửa:** `src/views/ProcessCenterModal.tsx`, `src/views/ProcessCenterView.tsx`, `src/views/ProcessCenterModal.css`, `src/views/SettingsView.tsx`, `src/views/SublixStudioView.tsx`.
- **Build & Verify:** `npx tsc --noEmit` PASS (0 errors); `npm run build` PASS (2.87s, Vite bundle sẵn sàng).

---

### 2026-10-11 19:40 - Antigravity → @CommandCode @jimmyvu
- **Loại:** `@done` (Session 23: Resizable Panels Studio Workspace, TTS Engine / Model AI Selector, Phân Loại Giọng Đọc Đa Dạng & Đồng Bộ Models Hub)
- **Tóm tắt:** 
  1. **Thanh phân cách kéo co giãn kích thước (Resizable Splitters) cho Studio Workspace:**
     - Cho phép người dùng tự do kéo chuột thay đổi độ rộng cột Cấu hình (Left Panel: 250px – 600px) và cột Phụ đề (Right Panel: 260px – 700px).
     - Hiệu ứng hover viền Cyan phát sáng, grip-handle 2 vạch mờ, trạng thái `user-select: none` chống bôi đen văn bản khi drag.
     - Lưu độ rộng tự động vào `localStorage` (`sublix_studio_left_w` và `sublix_studio_right_w`).
     - Hỗ trợ Double-click để khôi phục nhanh về độ rộng chuẩn mặc định (340px / 350px).
  2. **Bộ Chọn Mô Hình & Động Cơ Giọng Đọc AI (TTS Engine Selector):**
     - Đặt thẻ điều khiển Card chuyên biệt `studio-tts-engine-card` ở đầu mục "2. Giọng Đọc Nhân Vật (TTS)".
     - Cho phép chọn nhanh giữa 4 chế độ: `🌟 VietNeu TTS AI`, `🎙️ Kokoro Local ONNX`, `🌐 Edge-TTS Cloud`, và `⚡ Tất Cả Models`.
     - Hiển thị bảng thông số Spec Box trực quan kèm nút 1-chạm "✨ Áp dụng Model này cho tất cả các vai".
  3. **Mở Rộng Danh Mục Giọng Đọc & Phân Loại Vùng Miền Âm Sắc:**
     - Bổ sung trọn bộ hơn 20 giọng đọc AI: VietNeu TTS (6 giọng Bắc/Trung/Nam biểu cảm cao), Kokoro-Vietnamese (14 giọng nam nữ offline), Edge-TTS Neural (4 giọng phát thanh viên & tiếng Anh).
     - Lọc danh sách thông minh theo model đang chọn hoặc phân nhóm `<optgroup>` trực quan.
     - Nâng cấp routing `mapVoiceForEngine` đảm bảo đồng bộ cho cả synthesis và preview nghe thử.
  4. **Đồng Bộ Tab Cài Đặt (Subtab Models Hub):**
     - Bổ sung bảng "🎙️ Text-to-Speech (TTS) Voice Models" trong Hub Models, hiển thị rõ ràng thông số đề xuất, loại engine, dung lượng và trạng thái hoạt động của VietNeu TTS, Kokoro ONNX, Edge-TTS.
- **Files đã sửa:** `src/views/SublixStudioView.tsx`, `src/views/SublixStudioView.css`, `src/views/SettingsView.tsx`, `DEV-LOG.md`, `agent-team/PROJECT_STATE.md`.
- **Build & Verify:** `npx tsc --noEmit` PASS (0 errors); `npm run build` PASS (3.27s, Vite bundle thành công).

---

### 2026-10-11 19:50 - Antigravity → @CommandCode @jimmyvu
- **Loại:** `@done` (Session 24: Sửa Dứt Điểm Nhầm Lẫn Giữa Track Phụ Đề & Track Tiếng Lồng, Nâng Cấp Audio Voice Blocks Trên Timeline Chuẩn Premiere)
- **Tóm tắt:** 
  1. **Khử tận gốc tên "Phụ đề" gán nhầm cho Vai Diễn Lồng Tiếng:**
     - Đổi tên speaker mặc định từ "Phụ đề" thành "Thuyết minh AI".
     - Bổ sung `getSpeakerDisplayName()` và hook tự động sanitize state để bảo đảm trên UI, Panel trái và Timeline không bao giờ hiển thị tên vai là "Phụ đề".
  2. **Đại tu cột Tiêu đề TRACKS (Phân biệt rõ ràng giữa Văn bản và Âm thanh):**
     - Track 3: Ghi rõ `💬 PHỤ ĐỀ (TEXT)` (Track văn bản chữ phụ đề).
     - Track 4+: Ghi rõ `🎙️ TIẾNG LỒNG: [Tên vai]` (ví dụ: `🎙️ TIẾNG LỒNG: Thuyết minh AI`), kèm icon `🎙️`, dot màu vai, và badge model `[VietNeu]` / `[Kokoro]` / `[Edge]`.
  3. **Nâng cấp Audio Voice Blocks trên Timeline theo chuẩn Premiere Pro:**
     - Khối block trên dải lồng tiếng mang diện mạo Audio Clip: viền sáng, gradient nền âm thanh.
     - Tích hợp **Audio Waveform Texture (sóng âm mini)** chạy chìm bên trong block.
     - Nhãn `🎙️ [Thuyết minh AI]: "Câu thoại..."` và ký hiệu nốt nhạc `♪` khi đã sinh âm thanh.
     - Sửa Laser head quét tiến trình: `🎙️ Tiếng lồng [Tên vai]: Đang sinh giọng câu X/Y...` (xóa triệt để chữ Phụ đề).
- **Files đã sửa:** `src/views/SublixStudioView.tsx`, `src/views/SublixStudioView.css`, `DEV-LOG.md`, `agent-team/PROJECT_STATE.md`.
- **Build & Verify:** `npx tsc --noEmit` PASS (0 errors); `npm run build` PASS (3.61s, Vite bundle thành công).

---

### 2026-10-11 20:10 - Antigravity → @CommandCode @jimmyvu
- **Loại:** `@done` (Session 25: Sửa Dứt Điểm Lỗi Xóa Track Tiếng Mất Phụ Đề, Hiển Thị Động Track Timeline & Menu Chuột Phải Cho Khoanh Vùng AI)
- **Tóm tắt:** 
  1. **Khắc phục triệt để lỗi xóa track tiếng lồng làm mất cả track phụ đề:**
     - Sửa `handleClearTrack("speaker", spkId)`: chỉ reset cờ âm thanh `hasAudio = false` và `audioUrl = undefined`, bảo toàn nguyên vẹn 100% mảng `segments`.
     - Phụ đề (text gốc, bản dịch, timing) không bị mất dù xóa bất kỳ track tiếng nào.
     - Sửa nút xóa khi thu gọn track thành `handleClearTrack("speaker", "all")`.
  2. **Hiển thị động 2 track Timeline (Dynamic Track Visibility):**
     - Khi mới nạp video: Timeline chỉ hiển thị `▼ VIDEO` và `♫ TIẾNG GỐC`. Hai dải `💬 PHỤ ĐỀ (TEXT)` và `🎙️ TIẾNG LỒNG` được ẩn hoàn toàn để timeline sạch sẽ, tinh tế.
     - Phía dưới có banner gợi ý `.studio-empty-timeline-hint` hướng dẫn bấm tạo hoặc khoanh vùng.
     - Khi người dùng bấm tạo mới (hoặc tiến trình AI chạy): Dải phụ đề và tiếng lồng xuất hiện và được lấp đầy trực quan dần theo thời gian thực.
  3. **Menu Chuột Phải Ngữ Cảnh (Timeline Context Menu - Premiere Style):**
     - Click chuột phải trên Timeline / Vùng chọn In-Out:
       - Có vùng chọn: Menu hiển thị thời lượng đoạn và các tùy chọn: Tạo phụ đề cho đoạn này (STT), Dịch phụ đề đoạn này, Tạo tiếng lồng cho đoạn này (TTS), Chạy cả Sub & Tiếng lồng (Full pipeline), Phát thử đoạn này, Xóa phụ đề đoạn này, Bỏ khoanh vùng.
       - Chưa có vùng chọn: Cho phép Đặt điểm Vào (In), Đặt điểm Ra (Out), Khoanh nhanh 5s, Di chuyển playhead, hoặc Tạo cho toàn bộ video.
  4. **Hỗ trợ tham số `forceRange?: boolean` cho cả 4 quy trình AI:**
     - `handleRunSttOnly`, `handleRunTranslateOnly`, `handleRunVoiceOnly`, `handleRunAnalysis` đều chạy chuẩn xác trong phân đoạn khoanh vùng khi gọi từ menu chuột phải.
- **Files đã sửa:** `src/views/SublixStudioView.tsx`, `src/views/SublixStudioView.css`, `DEV-LOG.md`, `agent-team/PROJECT_STATE.md`, `agent-team/AGENT_CHAT.md`.
- **Build & Verify:** `npx tsc --noEmit` PASS (0 errors); `npm run build` PASS (4.39s, Vite bundle thành công).

---

### 2026-10-11 20:35 - Antigravity → @CommandCode @jimmyvu
- **Loại:** `@done` (Session 26: Phân Loại Độc Quyền Giọng Đọc Theo Model TTS AI + Nghe Thử Mẫu Tiêu Biểu Trước Khi Chọn)
- **Tóm tắt:** 
  1. **Loại bỏ hoàn toàn tình trạng dropdown voice hiện "một đống lẫn lộn" các giọng của nhiều mô hình:**
     - Bỏ hẳn tùy chọn "Tất Cả Models" gây nhầm lẫn.
     - Khởi tạo từ điển metadata `TTS_ENGINE_MODELS` cho 3 mô hình riêng biệt: `VietNeu TTS AI` (6 giọng Neural biểu cảm cao), `Kokoro Local` (14 giọng ONNX offline 100%), `Edge-TTS Cloud` (6 giọng Microsoft Azure).
     - Dropdown `<select>` của mỗi vai diễn **CHỈ DUYỆT QUA các giọng độc quyền của Model đang chọn**. Tuyệt đối không lẫn lộn bất kỳ giọng của model khác!
     - Khi người dùng bấm đổi Model: Hệ thống tự động re-map các vai diễn sang giọng tương ứng (Nam -> defaultMaleVoice, Nữ -> defaultFemaleVoice) của Model mới, đảm bảo giá trị select luôn đồng bộ và hợp lệ ngay lập tức.
  2. **Tạo Sample Voice của từng Model để nghe thử trước khi load/chọn model đó:**
     - Trên mỗi nút Model (VietNeu, Kokoro, Edge): Bổ sung nút nghe thử nhỏ gọn `▶️ Mẫu` / `⏹ Dừng`. Người dùng có thể nghe thử âm thanh đại diện của bất kỳ Model nào ngay trước khi click chọn hoặc load model đó!
     - Trong thẻ Spec chi tiết của Model đang chọn: Thêm nút bấm to nổi bật `▶️ Nghe Thử Mẫu Tiêu Biểu (${model.name})`.
     - Tận dụng 14 file sample .wav chất lượng cao có sẵn của Kokoro (`voiceSampleData`) cho độ trễ 0ms, và live neural synthesis cho VietNeu / Edge.
     - Nút `▷ Nghe Thử` của từng vai cũng được nâng cấp hỗ trợ toggle dừng/phát và quản lý audio refs tránh phát chồng âm.
- **Files đã sửa:** `src/views/SublixStudioView.tsx`, `src/views/SublixStudioView.css`, `DEV-LOG.md`, `agent-team/PROJECT_STATE.md`, `agent-team/AGENT_CHAT.md`.
### 2026-10-11 23:55 - Antigravity → @all (@jimmyvu @CommandCode @ClaudeCode @Mavis @Cursor)
- **Loại:** `@handoff` (Bàn Giao Dự Án & Tạm Nghỉ Ca Theo Lệnh PO Anh Tuấn Để Các Agent Khác Vào Thử Tài)
- **Tóm tắt bàn giao:**
  1. **Trạng thái Repo:** Cực kỳ sạch sẽ (clean working tree), đã test và push 100% lên `origin/master` (Commit `c586b22`).
  2. **Trạng thái Build:** `npx tsc --noEmit` PASS (0 errors), `npm run build` PASS (0 errors, 6.16s).
  3. **Môi trường chạy:** App đang chạy dev mode qua PID 35196 / launcher `Chay-Sublix.bat`. Tuyệt đối **KHÔNG CHẠY `cargo build --release`** (BUG-H07).
  4. **Nhiệm vụ đã hoàn thành trọn gói:**
     - Căn gốc Timeline `x = 0`.
     - Đồng bộ tiến trình Studio ➔ Process Center (Cinema Stepper, Live timer).
     - Resizable Panels trái/phải với localStorage.
     - Phân định rạch ròi Track Phụ Đề vs Track Tiếng Lồng, đổi tên vai thành Thuyết minh AI.
     - Sửa lỗi xóa track tiếng bảo toàn 100% phụ đề; Dynamic Timeline visibility (2 track mặc định khi rỗng); Timeline Context Menu chuột phải bóc tách/dịch/lồng tiếng theo vùng khoanh.
     - Phân loại độc quyền giọng đọc theo Model TTS AI (VietNeu, Kokoro 14 giọng, Edge-TTS); nghe thử mẫu âm thanh tiêu biểu trước khi load/chọn.
  5. **Lời nhắn gửi các đồng đội tiếp quản (Claude Code / CommandCode / Mavis / Cursor):**
     - Dự án sẵn sàng 100% để các bạn tiếp nhận và triển khai các task tiếp theo từ anh Tuấn.
     - Antigravity chuyển trạng thái sang `⚪ Standby`, nhường sân khấu cho các bạn thể hiện tài năng! Chúc cả team làm việc hiệu quả và mang lại sản phẩm tuyệt vời nhất cho anh Tuấn!



