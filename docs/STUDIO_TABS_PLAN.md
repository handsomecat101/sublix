# STUDIO_TABS_PLAN — Studio nhiều tab dự án (kiểu Premiere)

> TSK-PLAN-STUDIO-TABS · 2026-10-25 · chỉ phân tích, chưa sửa `src/**` / `src-tauri/**`.
> Yêu cầu PO: mỗi video = 1 tab; việc đang chạy vẫn chạy và gắn đúng tab; mở video khác không làm mất/ghi đè việc đang làm.

## 0. Kết luận (đọc phần này là đủ)

| Câu hỏi | Quyết định |
|---|---|
| Backend chạy song song? | **KHÔNG song song thật.** Chọn **(b) hàng đợi**: 1 việc nặng chạy, việc khác xếp hàng, nhưng vẫn gắn đúng tab. Lý do §2. |
| Kiến trúc | **Mỗi tab 1 instance `SublixStudioView` (mount-all, ẩn bằng `display:none`) + `StudioTabsHost` bọc ngoài + hàng đợi việc nặng + `run_id` trong sự kiện backend.** Không refactor 9k dòng thành store. Lý do §3. |
| Số giai đoạn | **5** (P0 backend `run_id` · P1 host + tab · P2 hàng đợi + định tuyến sự kiện · P3 lưu/khôi phục phiên · P4 hoàn thiện). |
| Giới hạn tab | Tối đa **6** tab. |

## 1. Hiện trạng (bằng chứng)

### 1.1 State Studio nằm ở đâu
- Toàn bộ nằm **trong 1 component** `SublixStudioView` (9390 dòng; hàm bắt đầu `src/views/SublixStudioView.tsx:758`), ~128 `useState/useRef` + 35 `useEffect`. Không có store ngoài.
- Dự án: `filePath/fileName` `:780-787`, `mediaDuration` `:812`, `segments` `:1005`, `speakers` `:986`, `markers` `:1225`, `audioPeaks/filmstripThumbs` `:1088-1091`.
- Undo/redo: `undoStack` + `subtitleHistory/translationHistory/audioHistory` `:818-827` (+ ref phản chiếu `:1945-1953`). **Mỗi instance có history riêng sẵn** ⇒ "undo theo tab" miễn phí nếu mỗi tab là 1 instance.
- Phát/timeline: `videoRef` `:1108`, `currentTime` `:1109`, `zoomLevel`, `inPoint/outPoint`, `trackLocks`, `selectedSegIds`… (`:1157-1233`).
- Clip tiếng lồng: lưu **ngay trong `SubtitleItem.audioUrl`** là data-URI mp3 (`:215`, gán ở `:4973`). Đây là phần **nặng RAM nhất** (xem §3.2).
- Trạng thái "đang bận" là **cờ đơn của cả component**: `isAnalyzing`, `timelineProcessType` `:1083,1187`; các lệnh chặn nhau bằng `if (isAnalyzing) …` (`:3502`, `:3538`).
- Vòng TTS chạy **ở frontend**, từng câu: `handleRunVoiceOnly` `:4856`, gọi `sublix.dubbingPreviewTts` `:4945`, đọc `segmentsRef/speakersRef` ⇒ phải sống đủ lâu trong đúng instance của tab.

### 1.2 Cái gì bị reset / ghi đè khi mở video mới
- `handleLoadNewVideoFile` `:2471-2503` **xoá sạch tại chỗ**: `setSegments([])`, `setSpeakers([])`, peaks/thumbs, 4 history, `videoRef` về 0, và **xoá cache** `localStorage.removeItem(STUDIO_PROJECT_CACHE_KEY)` `:2500`. Không hỏi, không dừng việc đang chạy.
- Đường vào: prop `initialFilePath` + `fileNonce` (`:1296-1306`), kéo-thả `:1426-1441`, nút mở file `:4267`; ngoài Studio là `SettingsView.handleRouteToStudio` `src/views/SettingsView.tsx:156-163` (set path + tăng nonce).
- **Lỗi hiện hữu (đúng cái PO nêu):** việc nền không biết video đã đổi. `handleRunAnalysis` `await sublix.dubbingAnalyze(...)` `:5095` rồi `setSegments(newMappedSegments)` `:5251` / `setSpeakers` `:5144-5212` ⇒ kết quả của video A **ghi đè vào video B** vừa mở. Không có kiểm tra "vẫn đúng video".
- Cache phiên chỉ có **1 dự án**: `STUDIO_PROJECT_CACHE_KEY = "sublix_active_studio_project_v1"` `:741`, autosave `:1317-1341` (kèm cả `segments` ⇒ **kèm `audioUrl` base64**, dễ vượt quota localStorage; lỗi bị nuốt ở `:1336`). Mở video mới = mất dự án cũ.
- `SublixStudioView` được giữ mounted vĩnh viễn trong `SettingsView` (`:1600-1620`, `display:none` khi sang tab app khác) — tức nền tảng "mount-all, ẩn" đã chạy thật trong app.

### 1.3 Việc nền trả kết quả về đâu (có id dự án không?)
| Sự kiện | Phát ở | Payload | Có id? | Ai nghe |
|---|---|---|---|---|
| `dubbing:progress` | `src-tauri/src/dubbing/mod.rs:2470` (analyze), `:3144` (export) | `DubbingProgress{stage,percent,message,current_item,total_items}` `:313-319` | **Không** | Studio: `SublixStudioView.tsx:4386` (STT), `:5074` (analyze), `:5956` (export) — mỗi lệnh `listen` tạm rồi `unlisten` trong `finally`; **cũng** `SettingsView.tsx:650`, `DubbingStudioView.tsx:121` |
| `file_sub:progress` / `file_sub:complete` | `src-tauri/src/file_sub.rs:410…685`, `:697` | `FileSubProgress` `:37` | **Không** | `FileSubView.tsx:156,179`, `SettingsView.tsx:551,629` (Studio không nghe) |
| `translate:progress` | `src-tauri/src/lib.rs:181` | `{done,total,phase}` | **Không** | `SublixStudioView.tsx:6292` — **chỉ khi `isActive`** `:6271` ⇒ tab nền không nhận |
| `model:download-progress` | model_download | theo `kind` | theo model, không liên quan dự án | `:6276` (dùng chung, OK) |
- Tác vụ → tab Tiến trình: `notifyTaskUpdate` `:796-811` đã có **id duy nhất theo lượt chạy** (`activeTaskRunIdRef`, BUG-R2-8-01) và `targetTab:"studio"`; `SettingsView.handleStudioTaskUpdate` `:311` nhận theo `task.id`. Đây là móng tốt để định tuyến "Mở lại trong Studio" (`ProcessCenterView.tsx:427,542`; `SettingsView.tsx:2371`) — hiện chỉ `setActiveTab("studio")`, không biết tab nào.
- Hệ quả: listener tạm theo "lượt gọi" chỉ đúng khi **chỉ có 1 việc chạy cùng lúc**. Có 2 việc ⇒ cả hai nhận mọi `dubbing:progress` ⇒ lẫn tiến độ.

## 2. Backend có chạy song song được không

### 2.1 Bằng chứng không an toàn
1. **Cờ huỷ là bộ đếm toàn cục, kiểu "mốc nước":** `CURRENT_GENERATION/CANCELLED_GENERATION` `src-tauri/src/dubbing/mod.rs:57-58`; `is_generation_cancelled(gen)` = `cancelled >= gen` `:71-77`.
2. **Bắt đầu việc mới = huỷ việc cũ:** `start_new_generation()` `:62-69` đặt `CANCELLED = old` và `kill_active_child()`. Nó được gọi ở `analyze_and_create_project_full` `:2456` **và** `export_dubbed_video` `:3129`. ⇒ Xuất video ở tab A sẽ **giết âm thầm** phân tích đang chạy ở tab B (B nhận lỗi "Đã dừng tiến trình theo yêu cầu của bạn" `:120`, hiện như người dùng tự huỷ `SublixStudioView.tsx:5295`).
3. **Chỉ 1 slot tiến trình con:** `ACTIVE_CHILD_PID` `:59`, ghi đè ở `run_child_with_cancel` `:125`; `dubbing_cancel` (`lib.rs:1730`) huỷ "generation hiện tại" ⇒ nút Dừng ở tab này có thể giết việc của tab kia.
4. `file_sub::generate_file_subtitles` có cờ `FILE_SUB_RUNNING` `file_sub.rs:355-382` — chạy 2 lần ⇒ trả lỗi "đang chạy".
5. **Tài nguyên dùng chung duy nhất:** `STT_SERVER` `stt/whisper_server.rs:424` (1 whisper-server, hot-swap model), `TRANSLATION_SERVER` `translate/server.rs:596`, và `RECENT_CONTEXT` `translate/server.rs:39` — hàng đợi "ngữ cảnh gần nhất" **dùng chung** ⇒ dịch 2 video song song **rò ngữ cảnh** sang nhau. GPU RTX 3090 chỉ có 1 (Whisper CUDA + Ollama 27B ~17 GB) ⇒ chạy song song **không nhanh hơn**, chỉ tranh VRAM.
### 2.2 Cái đã an toàn
- Thư mục tạm **không đụng nhau**: `sublix_render_<id>` `:3161`, `sublix_prev_<id>` `:859`, `sublix_thumbs_<id>` `:795`; thư mục chung `sublix_dubbing` `:2487` nhưng tên file có `gen_unique_id()` (nano-giây, `:322`) `:2489-2490`. `dubbing_preview_tts` (`lib.rs:1749`) không dùng generation, độc lập từng câu.

### 2.3 Kết luận: **(b) Hàng đợi + tách id việc theo tab**
- **Một "slot nặng" duy nhất** cho: bóc tách/phân vai (`dubbingAnalyze`, `sttTranscribe`), dịch cả script, vòng TTS hàng loạt, xuất video. Việc khác xếp hàng, hiện "⏳ Đang chờ (#2)" trên đúng tab, tự chạy khi tới lượt.
- Việc nhẹ không vào hàng: nghe thử 1 câu (`dubbingPreviewTts` lẻ), glossary, phát video.
- **Không** sửa backend thành đa-generation (rủi ro cao: kill process, ffmpeg PID, whisper-server dùng chung, không lợi tốc độ). Backend chỉ cần thêm `run_id` để echo lại (P0) và bảo đảm Dừng chỉ nhắm đúng việc đang chạy (P2).
- Mở rộng sau (tuỳ chọn, ngoài kế hoạch): cho dịch cloud (DeepSeek/MiniMax — không dùng GPU) chạy song song với STT.

## 3. Kiến trúc đề xuất

### 3.1 Chọn: **multi-instance (mount-all) + host + hàng đợi + `run_id`**
```
SettingsView
 └─ <StudioTabsHost>                      ← MỚI. Sở hữu danh sách tab, tab đang chọn, hàng đợi
     ├─ <StudioTabStrip/>                 ← MỚI. Thanh tab (badge %, đóng, +)
     ├─ <SublixStudioView tabId=A isActive/>   display:flex
     ├─ <SublixStudioView tabId=B />           display:none  (vẫn mounted, vẫn chạy việc của nó)
     └─ …
```
Lý do chọn (so với "store `Map<tabId, ProjectState>`"):
- File 9390 dòng, logic dựa vào ~30 ref phản chiếu state (`segmentsRef`, `speakersRef`, `:1945-1960`) và closure dài (vòng TTS `:4916`, kéo-thả BUG-076..081). Chuyển sang store = **viết lại gần hết** + xung đột liên tục với mcode đang sửa chính file này. Rủi ro mất dữ liệu/hồi quy timeline rất cao.
- Mỗi instance **tự cô lập** segments/speakers/undo/redo/chọn/zoom/in-out/ref — hết lỗi "ghi đè sang video khác" **về cấu trúc**, không cần vá từng chỗ.
- Việc đang chạy (vòng TTS ở frontend, `await dubbingAnalyze`) **không bị unmount** khi chuyển tab ⇒ kết quả về đúng instance. Đã chứng minh cách này chạy: `SettingsView.tsx:1600`.
- Phím tắt đã có cổng `isActive` (`:3905`), tự dừng video khi `!isActive` (`:1309`) ⇒ phần lớn hạ tầng sẵn.

Nhược điểm chấp nhận (và cách giảm):
### 3.2 RAM với 3–5 tab, 300+ câu (ước lượng — phải đo ở P1)
| Thành phần / tab | Ước lượng |
|---|---|
| `segments` 323 câu (chữ) + 4 history (tham chiếu chung chuỗi) | ~0,5–2 MB |
| `filmstripThumbs` 10 ảnh jpeg base64 (`dubbing/mod.rs:2990`) | ~0,3–0,6 MB |
| `audioPeaks` | <0,1 MB |
| **`audioUrl` data-URI mp3 × 323** (nếu đã lồng tiếng) | **~10–25 MB** (giả định 25–60 KB/clip mp3 base64) |
| DOM timeline 3 track × 323 khối (ẩn `display:none` vẫn giữ node) | vài MB |
| `<video>` đang mở (decoder + buffer) | 30–150 MB — **đây là cái phải nhả** |
- 5 tab đã lồng tiếng ≈ 60–130 MB dữ liệu + video. Chấp nhận được trên máy dev (RTX 3090); chốt **trần 6 tab**.
- **Tab không hoạt động nhả video:** khi `isActive=false` ⇒ `videoRef.pause()`, và render `<video>` với `src` rỗng + nhớ `currentTime` (nạp lại khi quay về). Chỉ đụng khối `:7694-7700` + effect `:1309`. Không cần đụng vòng TTS (dùng `Audio` riêng, không phải `<video>`).
- Phương án giảm thêm nếu đo thấy nặng: P4 chuyển `audioUrl` data-URI → file tạm + `convertFileSrc` (đã có `getVideoSrc` `:1494`) — tác dụng cho cả localStorage (§4.5). Làm riêng, không chặn tính năng tab.
- Dùng **`React.memo` + không truyền `currentTime` xuống panel** giữ nguyên như hiện nay; host/strip **không** nhận state phát (chỉ nhận `{tabId, title, busy, percent, dirty}` qua callback đã throttle ≥250 ms).

### 3.3 Định tuyến sự kiện: `run_id`
- Frontend sinh `runId` (dùng lại `makeTaskRunId` đã có `:802`) **trước** khi gọi lệnh, truyền vào lệnh; backend **echo** trong payload.
  - Rust: thêm `run_id: Option<String>` (`#[serde(skip_serializing_if="Option::is_none", default)]`) vào `DubbingProgress` (`dubbing/mod.rs:313`), `FileSubProgress` (`file_sub.rs:37`), payload `translate:progress` (`lib.rs:181`); thêm tham số `run_id: Option<String>` cho `dubbing_analyze` (`lib.rs:1702`), `dubbing_export` (`:1764`), `translate_script_contextual` (`:164`), và 2 hàm lõi `analyze_and_create_project_full` / `export_dubbed_video` (closure `emit` `:2467`, `:3141`).
  - TS: `DubbingProgress` `src/lib/tauri.ts:949`, `TranslateProgress` `src/lib/types.ts:44`, wrapper `dubbingAnalyze` `tauri.ts:720`, `dubbingExport` `:748`.
- Listener trong instance **lọc** `payload.run_id === runIdCủaMình` (thiếu `run_id` = hành vi cũ, tương thích ngược cho `DubbingStudioView`/`FileSubView`).
- Sửa listener `translate:progress` `:6292` bỏ điều kiện `isActive` `:6271` (lọc theo `run_id` thay thế).
- `SettingsView.tsx:650` (`dubbing:progress` → tác vụ toàn cục) dùng `run_id` làm khoá tác vụ thay vì `currentRunIdRef` `:307` ⇒ tab Tiến trình hiện đúng từng lượt.

### 3.4 Hàng đợi việc nặng — `src/lib/studio/jobQueue.ts` (module thuần, test được)
- API: `enqueue({ tabId, runId, kind, run }) → {position}`, `cancel(runId)`, `subscribe()`, `getState()`. Trạng thái mỗi job: `queued | running | done | error | cancelled`.
- Chỉ chạy 1 job `running`. `cancel` khi `queued` = bỏ khỏi hàng, **không** gọi `dubbingCancel`. `cancel` khi `running` = gọi `dubbingCancel` (`lib.rs:1730`) — chỉ job đó, vì không còn job nào khác chạy cùng.
- `SublixStudioView`: `handleRunAnalysis/handleRunSttOnly/handleRunTranslateOnly/handleRunVoiceOnly/handleExport` bọc phần thân trong `jobQueue.enqueue`; cờ `isAnalyzing` ⇒ thêm `queuedPosition`. `handleCancelAnalysis` `:5330` đổi theo quy tắc trên.
- Chống đóng/chuyển tab khi job `running` cần dọn (xem §4.2).

### 3.5 Bảo vệ "kết quả sai video" (độc lập kiến trúc)
Trong instance, sau mỗi `await` của lệnh nền: so `filePathRef.current` (đã có `:1121`) với `filePath` lúc bắt đầu; lệch ⇒ bỏ kết quả + toast. Với mount-all, `handleLoadNewVideoFile` trong tab đang chạy việc phải **bị chặn** (hỏi Dừng việc hoặc mở tab mới) — xem §4.1.

## 4. Hành vi

### 4.1 Mở video
- Từ mọi nguồn (nút Mở, kéo-thả, Tải video → Studio, Lịch sử, `handleRouteToStudio`): gọi `host.openVideo(path)`:
  1. Đã có tab đúng `path` ⇒ **nhảy tới tab đó**.
  2. Tab đang chọn **trống** (chưa có `filePath`) ⇒ nạp vào tab đó (không tạo tab mới).
  3. Còn lại ⇒ **tab mới**; đạt trần 6 ⇒ hộp thoại "Đóng tab cũ nhất không chạy việc?" (không bao giờ tự đóng tab đang chạy/đang có thay đổi chưa lưu).
- Kéo-thả (`:1426`): chỉ instance `isActive` xử lý (hiện N instance sẽ đăng ký N lần) và gọi `onRequestOpenVideo` thay vì `handleLoadNewVideoFile`.
- Bỏ cơ chế `initialFilePath + fileNonce` (`:1296-1306`): instance mới chỉ nhận `initialFilePath` **một lần lúc mount**.
- `handleLoadNewVideoFile` giữ cho tab trống; bỏ `localStorage.removeItem(STUDIO_PROJECT_CACHE_KEY)` `:2500` (cache nay theo tab).

### 4.2 Đóng tab
- Tab sạch/không chạy ⇒ đóng ngay. Tab có việc `running`/`queued` ⇒ hộp thoại 3 nút: **Dừng & đóng · Chạy tiếp nền · Hủy**.
- "Chạy tiếp nền": tab chuyển trạng thái `background` — instance vẫn mounted, chip ẩn khỏi thanh, hiện trong mục "Việc nền (n)" cạnh nút "+"; xong việc ⇒ tự lưu phiên rồi gỡ instance. (Có thể cắt khỏi P1; mặc định P1 chỉ có "Dừng & đóng · Hủy".)
- Tab có thay đổi chưa lưu: autosave phiên (§4.5) đã bao ⇒ không cần hỏi lưu.

### 4.3 Badge và phím tắt
- Chip tab: tên file (cắt giữa), chấm trạng thái (chạy / chờ / lỗi / xong), `%` khi chạy, nút ✕.
- Phím (trong Studio, `isActive`): `Ctrl+Tab` / `Ctrl+Shift+Tab` chuyển tab, `Ctrl+W` đóng tab, `Ctrl+T` mở tab trống, `Ctrl+1..6` nhảy tab. **Kiểm tra va chạm** với handler hiện có `:3371`, `:4075` (đặc biệt `Ctrl+0` zoom `:4068`) trước khi gán; ưu tiên `capture` ở host, `preventDefault` chặn WebView2 tự đóng.
- Thanh trên cùng: `statusLabel` `:7183` hiện trạng thái tab đang chọn; thêm tổng "n việc đang chạy/chờ".

### 4.4 Tab Tiến trình → "Mở lại trong Studio"
- `StudioTaskUpdatePayload` thêm `tabId`; `AppTaskItem` lưu `tabId` (`processTypes.ts:27` vùng). `ProcessCenterView.tsx:542` gọi `onOpenStudioTab(task.tabId)` ⇒ `SettingsView` đặt `activeTab="studio"` + `host.focusTab(tabId)`; thiếu/không còn tab ⇒ mở lại từ `outputPath`/`filePath` bằng `openVideo`. Toast nổi `SettingsView.tsx:2371` làm tương tự.

### 4.5 Khôi phục phiên sau khi tắt/mở app
- Khoá mới `sublix_studio_session_v2` = `{ activeTabId, order[] }` + mỗi tab một khoá `sublix_studio_tab_v2_<tabId>` (tránh 1 khoá phình; quota localStorage ~5 MB).
- Mỗi tab lưu: `filePath, fileName, mediaDuration, segments(**bỏ `audioUrl`**), speakers, markers, sttLang, targetLang, currentTime`. Không lưu thumbs/peaks (tính lại, `:1382`).
- Hệ quả đã biết: **tiếng lồng đã tạo không sống qua restart** (hiện cũng vậy vì autosave `:1317` vượt quota rồi bị nuốt `:1336`). `hasAudio` đặt về `false` khi khôi phục + toast "Cần tạo lại giọng". Bản đầy đủ (lưu clip ra đĩa) để sau, không thuộc phạm vi này.
- Di chuyển: khoá v1 `sublix_active_studio_project_v1` `:741` ⇒ nhập thành tab đầu tiên một lần rồi xoá.
- Khôi phục tab: tạo instance ở trạng thái "tải lười" — tab không chọn chưa nạp `<video>`; việc đang chạy lúc tắt app ⇒ đánh dấu "bị gián đoạn", không tự chạy lại.

## 5. Kế hoạch triển khai (mỗi giai đoạn tự đứng được)

> `SublixStudioView.tsx` xuất hiện ở P1–P4 ⇒ **chỉ một thợ chạm file này tại một thời điểm**, làm tuần tự P1→P2→P3→P4 và chỉ sau khi mcode #1 commit. P0 không đụng file này ⇒ chạy song song được.

### P0 — Backend `run_id` (không đổi hành vi UI) · ~0,5 ngày
- Thêm `run_id` echo (§3.3). Không đổi cờ huỷ.
- **File:** `src-tauri/src/lib.rs`, `src-tauri/src/dubbing/mod.rs`, `src-tauri/src/file_sub.rs`, `src/lib/tauri.ts`, `src/lib/types.ts`.
- **Test:** `cargo test dubbing` (thêm test serde: có/không `run_id`; JSON cũ vẫn parse); `npx tsc --noEmit`. Chưa ai truyền `run_id` ⇒ hành vi y hệt hiện tại.
- Rủi ro: thấp. Test generation `GENERATION_TEST_LOCK` (`mod.rs:3911`) phải vẫn xanh.

### P1 — Host + thanh tab + mount-all · ~2 ngày
- `StudioTabsHost` (state tab, `openVideo`, `closeTab`, `focusTab`, trần 6, dedupe path, tái dùng tab trống); `StudioTabStrip` + CSS; `SublixStudioView` nhận `tabId`, `onRequestOpenVideo`, `belowTopbar` (ô render thanh tab ngay dưới `MasterTopbar` `:7166`), `onStatus` (throttle) ; gỡ `fileNonce`; chặn kéo-thả đa-instance; nhả `<video>` khi `!isActive`; bỏ xoá cache `:2500`; `SettingsView` mount host thay `<SublixStudioView>` `:1607`, `handleRouteToStudio` `:156` gọi `host.openVideo`.
- **File:** mới `src/views/studio/StudioTabsHost.tsx`, `StudioTabStrip.tsx`, `studioTabs.css`, `src/lib/studio/tabsModel.ts` (hàm thuần: thêm/đóng/chọn/dedupe/trần); sửa `src/views/SublixStudioView.tsx`, `src/views/SettingsView.tsx`.
- **Test:** `scripts/studio-tabs-tests/tabsModel.test.ts` (node:test, cùng kiểu `scripts/timeline-tests/*`): mở trùng path ⇒ nhảy; tab trống ⇒ tái dùng; trần 6; đóng tab giữa ⇒ chọn tab kế; `tsc`. Thủ công: mở 3 video, đổi tab giữ nguyên segments/undo/zoom; đo RAM 3/5 tab (ghi vào `ISSUE_LOG` nếu >600 MB).
- Rủi ro: (1) N instance cùng `window.addEventListener` (`:1214`, `:3371`, `:4075`) — phải kiểm cổng `isActive` từng cái; (2) timeline 323 câu phải không render lại khi tab khác đổi (`React.memo`, host không truyền state phát); (3) BUG-076..081 (kéo-thả/Ctrl+click/voice rate/ducking/isAnalyzing) — chạy lại kịch bản kéo-thả + range trên tab thứ 2.

### P2 — Hàng đợi + định tuyến sự kiện · ~2 ngày
- `jobQueue` (§3.4), sinh `runId` và truyền xuống 3 lệnh, listener lọc `run_id`, bỏ `isActive` ở `translate:progress`, `dubbing_cancel` chỉ khi job `running` của tab, chặn `handleLoadNewVideoFile` khi tab đang bận, kiểm tra "kết quả đúng video" (§3.5), `SettingsView.tsx:650` khoá theo `run_id`.
- **File:** mới `src/lib/studio/jobQueue.ts`; sửa `src/views/SublixStudioView.tsx`, `src/views/SettingsView.tsx`, `src/views/studio/StudioPipelinePanel.tsx` (hiện "Đang chờ #n"), `src/views/studio/studioPipelineTypes.ts`.
- **Test:** `scripts/studio-tabs-tests/jobQueue.test.ts` (1 job chạy một lúc; cancel queued không gọi huỷ; lỗi job không kẹt hàng; thứ tự FIFO). Thủ công: tab A bóc tách → tab B bấm xuất ⇒ B "đang chờ", A không bị giết (kiểm chứng lỗi §2.1-2 đã hết).
- Rủi ro: **cao nhất** — vòng TTS `:4916` và chuỗi `dubImmediately` → `handleRunVoiceOnly` (`:5281-5286`) chạy nối tiếp phải giữ **một slot liền mạch** (không nhả slot giữa 2 bước, tránh job tab khác chen vào giữa); BUG-081 (`isAnalyzing` kẹt) — mọi đường thoát phải nhả slot.

### P3 — Lưu/khôi phục phiên + "Mở lại trong Studio" · ~1,5 ngày
- §4.5 và §4.4. Quy tắc bỏ `audioUrl`. Di chuyển khoá v1.
- **File:** mới `src/lib/studio/sessionStore.ts`; sửa `src/views/SublixStudioView.tsx` (autosave `:1317-1341`, nạp `:769-787`), `src/views/studio/StudioTabsHost.tsx`, `src/views/ProcessCenterView.tsx`, `src/views/processTypes.ts`, `src/views/SettingsView.tsx`.
- **Test:** `scripts/studio-tabs-tests/sessionStore.test.ts` (round-trip, bỏ audioUrl, quota đầy không crash, migrate v1, JSON hỏng); `scripts/process-tests/processLogic.test.ts` cập nhật cho `tabId`.
- Rủi ro: mất dữ liệu — ghi tạm khoá mới rồi mới xoá cũ; lỗi parse ⇒ bỏ tab đó, không bỏ cả phiên.

### P4 — Hoàn thiện · ~1 ngày
- Phím tắt (§4.3), hộp thoại đóng tab có việc + "Chạy tiếp nền", badge/tổng việc, tooltip, (tuỳ chọn) `audioUrl` ra file tạm để giảm RAM nếu P1 đo thấy nặng.
- **File:** `src/views/studio/StudioTabsHost.tsx`, `StudioTabStrip.tsx`, `studioTabs.css`, `src/views/SublixStudioView.tsx` (chỉ đoạn phím tắt/`isActive`).
- **Test:** mở rộng `tabsModel.test.ts`; kịch bản tay: Ctrl+Tab/Ctrl+W không làm đóng cửa sổ app, không kích hoạt phím timeline.

**Tổng:** ~7 ngày công (P0 song song ⇒ ~6,5 ngày lịch). Thứ tự phụ thuộc: P0 ∥ P1 → P2 → P3 → P4.

## 6. Rủi ro chung & cách chặn
| Rủi ro | Chặn |
|---|---|
| Hiệu năng timeline 323 câu khi có nhiều instance | host không giữ state phát; chỉ truyền số liệu throttle; giữ `React.memo`, không truyền `currentTime` vào panel (như hiện tại); đo FPS kéo thả trên tab 2/3 |
| Hồi quy kéo-thả BUG-076..081 | mỗi giai đoạn chạy lại kịch bản kéo-thả, Ctrl+click, tốc độ 1.5x, ducking trên **tab không phải tab đầu** |
| Mất dữ liệu | phiên ghi khoá mới trước khi xoá khoá cũ; không bao giờ tự đóng tab có việc; kết quả nền sai video bị bỏ có toast |
| RAM | trần 6 tab, nhả `<video>` khi ẩn, bỏ `audioUrl` khỏi phiên; đo ở P1 |
| Job gián đoạn khi tắt app | đánh dấu "bị gián đoạn", không tự chạy lại; whisper-server/ffmpeg đã được dọn lúc thoát (`stop_server`, `whisper_server.rs:432`) |
| Va chạm phím tắt | chỉ đăng ký khi `isActive`; kiểm `:1214,:3371,:4075` |

## 6b. Quyết định của người điều phối khi ghép với thiết kế Opus (§4.11 UI_REDESIGN_PLAN)
- **Giao diện thanh tab:** theo đúng Opus §4.11 (`docs/ui-mockups/studio-tabs.html`) — vị trí, kích thước, vòng tiến độ, hộp hỏi khi đóng, menu, phím tắt.
- **Trần số tab:** **6** (theo kế hoạch này, vì mount-all tốn RAM), KHÔNG phải 12. Ở P1 đo RAM thật với 3/6 tab; nếu 6 tab < 600 MB thì nâng lên 12 như Opus đề xuất.
- **Phím `Ctrl+1..9`:** theo Opus (Ctrl+9 = tab cuối); với trần 6 thì Ctrl+7/8 không làm gì.
- **"Chỉ tab đang mở mount video/timeline" (Opus)** = cùng ý với "nhả `<video>` khi `!isActive`" ở trên: instance vẫn giữ state, chỉ nhả media nặng.
- **§3.5 (kết quả sai video)** là lỗi đang có ⇒ làm **sớm nhất** (P1, hoặc tách riêng ngay khi `SublixStudioView.tsx` rảnh).

## 7. Việc KHÔNG làm (chốt phạm vi)
- Không chạy song song thật nhiều job nặng; không làm lại cơ chế generation Rust.
- Không chuyển state Studio sang store toàn cục / tách nhỏ 9k dòng trong đợt này.
- Không lưu clip tiếng lồng qua restart (ghi nhận là giới hạn).
