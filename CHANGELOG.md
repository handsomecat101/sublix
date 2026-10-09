## v0.11.7 — 2026-10-09
### Sublix Studio: Kéo-Thả Hỏng Thì Báo Toast (ROUND-4 R4-09)

**Vấn đề (CommandCode verify):** `catch` ở `webview.onDragDropEvent` chỉ `console.warn` — user thấy kéo thả không có gì xảy ra → tưởng app hỏng, ngồi mò.

**Fix v0.11.7:**
- Khi `onDragDropEvent` thất bại (catch block) → `showToast("⚠️ Kéo thả không khả dụng trên hệ thống này — hãy dùng nút 'Mở video'")` thay vì im lặng.
- Khi drop event trả về mà `paths` rỗng → cũng toast cảnh báo.
- User biết ngay phải dùng nút `Mở video` thay vì cố kéo thả vô ích.

**File đã đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.6 — 2026-10-09
### Sublix Studio: Re-Apply playbackRate Khi Load Video Mới (ROUND-4 R4-04)

**Vấn đề (CommandCode verify):** Đổi video khi đang ở 1.5x → `<video>` element reset về 1x nhưng UI vẫn hiển thị "Tốc độ: 1.5x" (nói dối user — element chạy 1x nhưng UI tưởng 1.5x).

**Fix v0.11.6:** Trong `handleLoadedMetadata()` thêm 3 dòng:
```ts
if (videoRef.current.playbackRate !== playbackSpeed) {
  videoRef.current.playbackRate = playbackSpeed;
}
```
→ Mỗi lần video mới load xong metadata, ép playbackRate khớp với `playbackSpeed` state. UI và element luôn đồng bộ.

**File đã đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.5 — 2026-10-09
### Sublix Studio: Bỏ Beep Giả Mạo Mẫu Giọng (ROUND-4 R4-03)

**Vấn đề (CommandCode verify):** Fallback `createAuditionBeepWav` phát "beeep" 0.4s nhưng toast lại ghi "🎧 Nghe thử mẫu giọng X" → mạo danh giọng thật (vi phạm tinh thần "không đồ giả").

**Fix v0.11.5:**
- 2 chỗ gọi `createAuditionBeepWav` (line 904, 1083) → đổi thành toast "⚠️ Chưa có mẫu giọng cho vai X — bấm 🔊 Nghe giọng gốc để tạo" (line 901) và "⚠️ Chưa có mẫu giọng 'voice'..." (line 1081).
- Xóa luôn function `createAuditionBeepWav` (45 dòng code chết) — không còn dùng nữa, tránh dead code.
- Người dùng được báo trung thực thay vì bị đánh lừa bằng beep.

**File đã đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.4 — 2026-10-09
### Sublix Studio: Hotkey Timeline + Nút Bấm Zoom (−−, −, ⟲, +, ++) — Chuẩn Premiere

**PO yêu cầu (2026-10-09):** "bạn gán cho tôi mấy cái hotkey để điều khiển timeline như premier đi, tự nghiên cứu nhé tôi ko có thời gian đi chỉ bạn từng đí đâu, với cả cái zoom ra vào time nên có thêm nút bấm - + để dễ zoom nữa thay vì cái slider này."

**Fix v0.11.4:**

**Hotkey timeline (mở rộng từ v0.11.3 chỉ có Space/←/→/Home/End):**
| Phím | Hành động | Chuẩn Premiere |
|---|---|---|
| `+` hoặc `=` | Zoom in nhẹ ×1.5 | `+` |
| `-` hoặc `_` | Zoom out nhẹ ×0.67 | `-` |
| `\` | Fit timeline (reset 100%) | `\` |
| `Ctrl/Cmd+0` | Fit timeline (alternative) | (giống browser Ctrl+0) |
| `Numpad +` / `-` | Zoom in/out (numpad) | (bonus) |

(đã có sẵn: Space=play/pause, ←/→=step 1s, Shift+←/→=step 5s, Home/End=goto đầu/cuối, Ctrl+Z=undo, Ctrl+I=mở file)

**Thay slider bằng 5 nút bấm (anh thấy slider khó dùng):**
- `−−` zoom out mạnh (×0.5)
- `−` zoom out nhẹ (×0.67)
- `⟲` reset 100%
- `+` zoom in nhẹ (×1.5)
- `++` zoom in mạnh (×2)
- Hiển thị zoom % to rõ (font-weight 600, màu accent, font-variant tabular-nums)
- Tooltip mỗi nút ghi rõ phím tắt

**File đã đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.3 — 2026-10-09
### Sublix Studio: Timeline Zoom Đúng Chuẩn Premiere (full video fit + tick tự co giãn)

**PO phàn nàn (2026-10-09):** "cái timeline hiện tại quá vớ vẩn, thay vì zoom ra thời gian theo cả video theo kiểu premier hay các trình dựng video khác, nó lại chạy kiểu zoom max ra 300s, với các mốc thời gian ko hiểu sao lại tính là 5s 1 lần".

**Vấn đề v0.11.2:** Zoom semantic sai — dùng "số giây visible" (5-300s) thay vì "% viewport". Mốc tick cứng `i*5` không scale theo zoom.

**Fix v0.11.3 (đúng chuẩn Premiere/DaVinci):**
- **Semantic zoom:** `zoomLevel` giờ là **% viewport** (100 = full video fit ~1200px, 1000 = zoom 10×, 10000 = zoom 100×). Default 100% — mở video thấy ngay toàn cảnh.
- **Mốc tick tự co giãn** theo `pxPerSec` qua hàm `chooseTickInterval`:
  - `pxPerSec ≥ 100` → tick 0.1s/0.5s/1s (zoom in cực mạnh)
  - `pxPerSec ~ 10-100` → tick 2s/5s/10s/15s
  - `pxPerSec ~ 1-10` → tick 30s/1min/2min
  - `pxPerSec ~ 0.1-1` → tick 5min/10min/30min
  - `pxPerSec < 0.1` → tick 1h/2h (full video ngắn fit viewport)
- **Công thức:** `pxPerSec = (1200 * zoomLevel/100) / mediaDuration`. Tick mỗi ~100px.
- **Ví dụ thực tế:**
  - Kenji 38:24 (2304s), zoom 100% → 0.52 px/s → tick mỗi **5 phút** (0:00, 5:00, 10:00, ..., 35:00)
  - Kenji 38:24, zoom 500% → 2.6 px/s → tick mỗi **30 giây**
  - Kenji 38:24, zoom 5000% → 26 px/s → tick mỗi **5 giây**
  - Kenji 38:24, zoom 10000% → 52 px/s → tick mỗi **1-2 giây**
- **Nút bấm mới:** − (zoom out ×0.67, min 100%) / ⟲ (reset 100%) / + (zoom in ×1.5, max 10000%)
- **Slider:** 100% → 10000%, step 50, hiển thị "{N}% viewport" (trước "{N}s hiển thị")
- **`handleFitTimeline()`** giờ chỉ `setZoomLevel(100)` thay vì `Math.ceil(mediaDuration)`

**File đã đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.2 — 2026-10-09
### Sublix Studio: Timeline Zoom In/Out (nút bấm + slider + reset)

**PO yêu cầu (2026-10-09):** "code cho tôi cái zoom ra timeline đi, hiện tại ko có zoom gần zoom xa timeline, để xem timeframe nó bé hơn hoặc lớn hơn ấy."

**Trước đó:** Có slider zoom (range 10-120s visible) nhưng chỉ `<span>−</span>` + `<span>+</span>` text — không có nút bấm thật, người dùng khó dùng.

**Fix v0.11.2:**
- **3 nút bấm mới** trong thanh timeline controls:
  - `−` (zoom out, x1.5 → xem nhiều giây hơn)
  - `⟲` (reset về 30s mặc định)
  - `+` (zoom in, x1.5 → xem ít giây hơn, frame lớn hơn)
- **Mở rộng range slider:** 5s → 300s (trước 10s → 120s) — hỗ trợ video dài hơn Kenji 38min.
- **Hiển thị rõ ràng:** "{N}s hiển thị" với `minWidth: 56px` (trước là text lỏng).
- **Math:** `setZoomLevel(clamp(round(zoomLevel * 1.5), 5, 600))` — mỗi lần bấm +/− scale 1.5×.
- Nút +/− có `title` (tooltip) cho rõ mục đích.

**File đã đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.1 — 2026-10-09
### Sublix Studio: Thả Video Vào App Phải THẤY HÌNH (ROUND-4 R4-01)

**Vấn đề (CommandCode verify, ảnh `ui30_cancel_analysis_button.png`):**
Khi thả file `multi_speaker_scene.mp4` hoặc video tải từ web (VP9/AV1/HEVC/H.264 high) vào Sublix Studio → WebView2 báo "Không thể phát tập tin… codec không được hỗ trợ" → người dùng tưởng "thả không được" → app chưa dùng được cho việc chính.

**Fix v0.11.1 (Ưu tiên 1 — ffmpeg chuyển tạm):**
- **Backend (`src-tauri/src/lib.rs`):** Tauri command mới `transcode_for_preview(input_path) → temp_path` dùng ffmpeg tạo bản H.264 baseline level 3.0 + AAC LC + faststart. Cache theo `(file_size, mtime, nonce)` trong `%TEMP%\sublix_preview\`. Người dùng không cần biết file tạm tồn tại.
- **Frontend (`tauri.ts`):** method `transcodeForPreview(inputPath): Promise<string>`.
- **Frontend (`SublixStudioView.tsx`):**
  - Thêm state `transcodedPath: string | null` (path preview sau khi transcode).
  - `<video>.onError` → gọi `sublix.transcodeForPreview(filePath)` → set `transcodedPath` → React re-render `<video src={previewPath}>` với `key={previewPath}` để force reload → tự phát bản tạm.
  - Nếu ffmpeg cũng fail → mới fallback Cinema Visualizer (giữ nguyên `setVideoPlayError(true)`).
  - Toast "Đang chuyển tạm video sang H.264…" + "Đã chuyển tạm xong, đang phát bản preview…".
  - Reset `transcodedPath = null` khi user pick file mới / drop file mới / đổi `initialFilePath`.
- **Lưu ý:** KHÔNG đụng `Chay-Sublix.bat`, KHÔNG dụng `cargo build --release` (vi phạm BUG-H07), KHÔNG đụng tab Tải video.

**Còn lại (chưa làm trong kèo này):**
- Ưu tiên 2: nhúng libmpv (đúng hướng lâu dài) — phase sau
- R4-02 đến R4-09 (xem `FIX_STUDIO_UI_ROUND4.md`) — fix turn tiếp

**File đã đổi:** `src-tauri/src/lib.rs`, `src/lib/tauri.ts`, `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`.

---

## v0.9.10 — 2026-10-07
### Lồng Tiếng: Fix Multi-Speaker — Dùng Gender Thật + Filter Noise Speaker

**Vấn đề (PO báo cáo):** Video R2nyc_oP9Yk có 1 người nói chính, nhưng test_dubbing_srt.rs cũ ép 6 voice khác nhau theo `idx % 2` (male/female xen kẽ) → sai logic, lãng phí voice, có thể gán nam vào speaker nữ và ngược lại.

**Nguyên nhân gốc:**
- Code cũ dùng `idx % 2` để đoán male/female thay vì dùng gender thật từ LLM
- `DubbingSpeaker` struct KHÔNG lưu `gender` field → sau khi tạo project không biết speaker nào nam/nữ
- Ép voice cho MỌI speaker, kể cả noise speaker (< 3 segments) → lãng phí + sai

**Thay đổi v0.9.10:**
- **Backend (`dubbing/mod.rs`):** Thêm field `gender: String` vào `DubbingSpeaker` struct (với `#[serde(default)]` để backward compat với project đã lưu); lưu gender khi tạo speaker ở cả `diarize_and_script_via_minimax` (main) lẫn `generate_default_speakers` (fallback).
- **CLI (`test_dubbing_srt.rs`):** Viết lại logic ép voice theo gender THẬT (`spk.gender`) + filter noise:
  - Đếm segments per speaker → tìm `main_speaker` (largest)
  - Speaker nhiễu (`< 3 segments` HOẶC `< 3% tổng`) → gộp vào main, dùng cùng voice (đồng nhất)
  - Speaker non-noise → gán voice theo gender đúng, duyệt pool **7 nam + 7 nữ** Kokoro
  - Nếu chỉ 1 speaker non-noise → chỉ assign 1 voice (không ép lung tung)
- **Frontend (`tauri.ts` + `DubbingStudioView.tsx`):** Update `DubbingSpeaker` interface có optional `gender?`; `handleAddSpeaker` lưu gender khi user thêm vai mới.

**Test (sẽ chạy vòng tiếp theo):**
- Video multi-speaker (R2nyc_oP9Yk 15:21) — verify mỗi speaker giữ 1 voice consistent
- Video 1 narrator (test_ai_21m 21:43) — verify chỉ assign 1 voice
- Video ngắn mới (≤ 5 phút) — nếu có sẵn trong App downloads

**File đã đổi:**
- `src-tauri/src/dubbing/mod.rs` — thêm `gender` field + lưu khi tạo
- `src-tauri/examples/test_dubbing_srt.rs` — viết lại logic ép voice
- `src/lib/tauri.ts` — thêm `gender?` vào `DubbingSpeaker` interface
- `src/views/DubbingStudioView.tsx` — `handleAddSpeaker` lưu gender
- `package.json` + `src-tauri/Cargo.toml` — bump version 0.9.9 → 0.9.10

---

# CHANGELOG — Sublix

> Lịch sử phát hành Sublix theo trục thời gian (mới nhất ở trên).
> Mỗi version được bump theo [SemVer](https://semver.org/):
> - **major** — breaking change kiến trúc lớn
> - **minor** — fix bug quan trọng hoặc tính năng mới đáng kể
> - **patch** — fix nhỏ, polish UI, refactor không phá API
>
> Phiên bản hiển thị trong UI là `v{major.minor}` (bỏ patch).

---

## v0.9.9 — 2026-10-07
### Studio Lồng Tiếng: Chọn Model → Danh Sách Giọng Nam/Nữ + Mẫu Nghe Thử Cache + Khớp Voice Đa Vai
- **Chọn model → hiện danh sách giọng (kể cả TRƯỚC khi tải):** mỗi model trong panel "🎛 Chọn Giọng & Tải Model" giờ mở rộng được (bấm ▸) — Kokoro-Vietnamese hiện đủ **7 giọng Nam + 7 giọng Nữ**, thêm card **Edge Neural (có sẵn — 8 giọng)**; model clone ghi rõ sẽ cần 1 clip giọng mẫu 5–10 giây cho mỗi vai.
- **🎧 Mẫu nghe thử tạo 1 lần — nghe lại tức thì:** nút tạo mẫu cho 14 giọng Kokoro (một lần ~1 phút, hiện tiến trình "Đang tạo mẫu X/14…"), lưu cache tại `models/voice/kokoro-vi/samples/*.wav`; lần sau bấm 🔊 trả audio tức thì từ cache (đã xác minh phát thật 4.92s).
- **Khớp voice đa vai:** pool auto-cast mở rộng **7 nam + 7 nữ** (cả 2 nhánh heuristic + LLM), các vai được gán giọng **khác nhau, xen kẽ Nam/Nữ**; bộ chọn giọng hiện nhãn rõ "♂ Nam — Tuấn Ngọc (Kokoro offline)"; thêm nhân vật mới tự chọn giọng chưa dùng; **cảnh báo ⚠️ "Trùng giọng"** khi 2 vai dùng chung giọng (E2E: 5 vai → 5 giọng khác nhau).
- Kỹ thuật: Tauri commands `voice_sample_list` / `voice_sample_generate` / `voice_sample_data`; event `voice:sample_progress`; mẫu lưu WAV 24kHz mono.

---

## v0.9.8 — 2026-10-06
### Studio Lồng Tiếng: Nút "Mở Thư Mục Lồng Tiếng" & "Mở Thư Mục File Gốc"
- **Vấn đề (anh Tuấn báo):** Tab Lồng Tiếng KHÔNG có nút để mở folder chứa file lồng tiếng đã xuất — user phải tự explorer đến folder.
- **Fix v0.9.8:** Thêm 2 nút ở thanh "Export Action Bar":
  - **"📂 Mở Thư Mục Lồng Tiếng"** — chỉ hiện sau khi export thành công → mở folder chứa file output `*_dubbed.mp4` (có select file).
  - **"📂 Mở Thư Mục File Gốc"** — luôn hiển thị khi đã chọn video input → mở folder chứa video gốc (user có thể duyệt cùng folder với file .srt / audio khác).
- **Backend mới:** Tauri command `dubbing_open_output_folder(path)` dùng `SHOpenFolderAndSelectItems` (approach giống downloader v0.9.4, fix lỗi path có ký tự đặc biệt) — thay thế `reveal_in_explorer` cũ dùng `explorer.exe /select,...` (dễ fail với path CJK).
- Phạm vi: `src-tauri/src/dubbing/mod.rs` (open_output_folder function), `src-tauri/src/lib.rs` (Tauri command), `src/lib/tauri.ts` (method `dubbingOpenOutputFolder`), `src/views/DubbingStudioView.tsx` (UI).

---

## v0.9.7 — 2026-10-06
### Tối Ưu Stage Dịch Phụ Đề: Dùng Batch Translate (Tiết Kiệm ~30 Phút/Video)
- Phát hiện qua AUDIT-SUB (xem `agent-team/AUDIT_SUB_REPORT.md`): pipeline "Tạo phụ đề" với video 21:43 mất **~64 phút** do Stage 3 (Translate MiniMax-M3 API) chiếm **~40 phút** (62% tổng). Code `file_sub.rs:400` loop từng segment → 416 segments × 5.7s ≈ 40 phút.
- Fix: thay vòng lặp sequential bằng `translate_batch_with_config()` đã có sẵn ở `translate/mod.rs:328` (chunk 15 segments/batch qua MiniMax-M3 batch endpoint). Estimate Stage 3 từ ~40 phút → **~5-10 phút** cho video 21:43 (tiết kiệm ~30 phút).
- **Trade-off đã báo cáo (No silent trade-offs):**
  - Progress emit vẫn theo từng segment (em chia nhỏ từ batch result) → UI UX tương đương loop cũ.
  - Hallucination filter + fallback `original_text` vẫn áp dụng đầy đủ.
  - Cancel check: batch check `is_dubbing_cancelled()` mỗi chunk (an toàn hơn loop cũ).
  - Error fallback: batch inner dùng `"[Dịch lỗi: ...]"`, em wrap ngoài bằng `original_text.clone()` cho UX thân thiện giống cũ.
- Chưa fix F1 (HF URL 401) + F2 (model corrupt check) + F3 (CUDA build) + F4 (progress trong whisper stage) → xem AUDIT_SUB_REPORT để biết khuyến nghị R1, R2, R4, R5.

---

## v0.9.6 — 2026-10-06
### Hiển Thị Rõ Đường Dẫn, Dung Lượng, Chất Lượng & Tiến Trình Tải
- **Video đã tải xong** giờ hiện đủ trong danh sách: **🎞 chất lượng** (vd *1920×1080 (Full HD)*), **💾 dung lượng thật** của file (đo trực tiếp từ ổ đĩa, vd *309.7 MB*) và **📁 đường dẫn đầy đủ** của file.
- **Khi đang tải**: thanh tiến trình hiện thêm **"đã tải / tổng"** (vd *📥 202.0 MB / 450.0 MB*) bên cạnh % + tốc độ + thời gian còn lại — nhìn là biết đang tải đến đâu.
- **Backfill**: các mục đã tải TRƯỚC bản này sẽ tự được đo lại dung lượng + độ phân giải khi mở app (không cần tải lại).
- **🔗 Link video gốc + nút Copy**: mỗi mục giờ hiện **link nguồn** kèm nút **📋 Copy link** — khi video die hoặc tải lỗi, chỉ cần copy link dán lại là tải lại được.
- Kỹ thuật: sự kiện `downloader:meta` (size + resolution) khi hoàn tất, command `downloader_file_meta` cho danh sách cũ; độ phân giải probe bằng ffprobe.

---

## v0.9.5 — 2026-10-06
### Sửa Chất Lượng Tải: Hết Bị Kẹt 360p (MAX giờ lên tới 4K)
- **Hiện tượng**: chọn "MAX — chất lượng cao nhất" nhưng video tải về chỉ 640x360.
- **Root cause**: cấu hình cũ ép `youtube:player_client=android,web_safari,ios` — YouTube đã bóp client android về SABR-only/360p, mọi format DASH (1080p/1440p/4K) biến mất khỏi danh sách ⇒ yt-dlp rơi về progressive 360p cho mọi video.
- **Fix**: bỏ ép client cũ — để yt-dlp tự chọn client mặc định (vẫn kèm JS runtime + EJS solver). Verify: danh sách format có đủ 4K/1440p/1080p/720p; tải thật 720p ra **1280x720** (trước đó 640x360).
- **Lưu ý cho người dùng**: file CŨ đã tải ở 360p không tự nâng cấp — muốn bản nét thì xóa file cũ trong thư mục downloads rồi tải lại.

---

## v0.9.4 — 2026-10-06
### Thêm Nút "Chạy Video" & Hiển Thị Rõ Thư Mục Tải
- **▶ Chạy Video**: mỗi video đã tải xong giờ có nút phát ngay bằng trình phát mặc định của Windows (dùng ShellExecuteW — xử lý đúng cả tên file có ký tự đặc biệt).
- **Hiển thị thư mục tải**: màn hình Tải Video hiện rõ dòng *"📁 File tải về được lưu tại: C:\...\downloads"* — không còn phải đoán file nằm ở đâu. Nút "Mở Thư Mục" vẫn mở Explorer chọn sẵn file.
- **Mặc định TẮT "Trích xuất phụ đề"**: theo nhu cầu thực tế (ưu tiên video), checkbox phụ đề mặc định tắt — tải nhanh hơn và tránh rate-limit 429 khi không cần sub.

---

## v0.9.3 — 2026-10-06
### Sửa Lỗi Hiển Thị Oan "Không In Ra Đường Dẫn File"
- **Hiện tượng**: Video tải xong thật (file nằm trên ổ cứng) nhưng app báo ❌ Lỗi *"yt-dlp đã thoát thành công nhưng không in ra đường dẫn file"* — anh Tuấn gặp với video "Arthas: Betrayer of the Light | Warcraft Cinematic" (45MB đã tải xong nhưng UI báo lỗi).
- **Root cause**: khi output của yt-dlp không phải UTF-8, **chuỗi đường dẫn in ra stdout bị mất/thay thế các ký tự mà codepage không biểu diễn được** (fullwidth `：｜`, chữ CJK...) — trong khi file thật trên ổ đĩa vẫn có đủ ký tự → app so chuỗi in ra với ổ đĩa → không thấy file → báo lỗi oan dù yt-dlp exit 0 (hiện tượng không ổn định, phụ thuộc môi trường console của máy).
- **Fix**: (1) Ép UTF-8 output cho mọi tiến trình yt-dlp (`PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1`); (2) **Không tin chuỗi in ra nữa** — khi yt-dlp exit 0 mà chưa xác minh được file, app quét thư mục tải tìm file media đúng **mã video** (`[<id>]`) làm bằng chứng gốc (an toàn theo luật BUG-046: không bao giờ lấy file của video khác); (3) UI: "Thử lại" thành công sẽ xoá cảnh báo lỗi cũ.

---

## v0.9.2 — 2026-10-06
### Sửa Lỗi Nhỏ: Kiểm Tra Link + Tải Phụ Đề
- **Kiểm Tra Link (fetch_video_info)**: Root cause tìm được: từ bản vá R2-08.3, hàm chuyển sang `spawn()` + `wait_with_output()` để có PID kill orphan nhưng quên pipe stdout/stderr — output luôn rỗng, nên khi yt-dlp exit 0 (kiểm tra thành công) app throw lỗi serde thô `EOF while parsing a value at line 1 column 0`; khi exit 1 thì mất luôn thông báo stderr. Đã sửa: thêm `Stdio::piped()`, tự dò JSON object (`{` đầu → `}` cuối, chấp nhận banner nhiễu), fallback thông báo thân thiện "Video không khả dụng / bị xóa / bị chặn khu vực".
- **Tải Phụ Đề (HTTP 429)**: Trước đây Sublix gửi 8 request HTTP liên tiếp đến YouTube để lấy 4 ngôn ngữ phụ đề (×2 loại subs), gây HTTP 429 "Too Many Requests". Giờ thêm `--sleep-subtitles 5` để yt-dlp tự delay 5s giữa mỗi request sub (verify CLI: mức 2s vẫn dính 429 khi chạy dồn, mức 5s qua sạch ở lượt chạy kế tiếp). Nếu YouTube vẫn giới hạn khi chạy dồn (rate-limit phía server, sleep không xóa 100%): job **không còn báo ❌ Lỗi oan** — video đã tải xong vẫn giữ ✅ Hoàn thành, kèm cảnh báo ⚠️ "phụ đề chưa tải được (429), thử lại sau vài phút" ngay trên UI (lỗi được hiện rõ, không im lặng).
- **Window title**: đồng bộ title bar 2 cửa sổ (main + overlay) về `v0.9.2` — khớp sidebar/Changelog (bản v0.9.1 trước đó còn để sót `v0.9.0`).

---

## v0.9.1 — 2026-10-06
### Sửa Lỗi Window Title Version Mismatch
- Window title (title bar + taskbar) của 2 window (`main` + `overlay`) bị hardcode `v0.8.0` trong `src-tauri/tauri.conf.json` dù sidebar/Changelog đã hiển thị `v0.9.0`.
- Sửa: cả 2 title giờ match với version thật.

---

## v0.9.0 — 2026-10-06
### Sửa Lỗi Quan Trọng: YouTube Download Hoạt Động Trở Lại
- Phát hiện root cause: **yt-dlp 2024.10+ yêu cầu JS runtime (Node.js/Deno) + remote challenge solver** để bypass YouTube anti-bot. Sublix chưa pass 2 flag này nên **mọi URL YouTube fail im lặng** (return `"n challenge solving failed"` → 0 bytes).
- Helper mới `find_js_runtime()` trong `src-tauri/src/downloader/mod.rs` tự động phát hiện `node` hoặc `deno` trên PATH (qua `where node.exe` trên Windows, `which node` trên Unix).
- Auto pass `--js-runtimes <runtime>:<path>` + `--remote-components ejs:github` khi tải video YouTube — script solver được tải từ GitHub ở lần đầu, cache lại cho lần sau.
- Áp dụng cho cả `start_download` (kèm nhánh retry cookie fallback) và `fetch_video_info` (inspect metadata) — nên "Kiểm Tra Link" cũng work trên YouTube.
- **Verified thủ công bằng CLI**: 11.28 MB Rick Astley tải về trong ~1 giây.

### Competitive Analysis với 4 Repo Voice/Dubbing
- Nghiên cứu sâu 4 đối thủ trên GitHub: **VoiceStudio** (53k⭐, Python+Electron, AGPL), **dub-studio** (Tauri giống Sublix, native C++ engines), **YouDub-webui** (FastAPI+Next.js, production với tác giả 1M+ subs), **ZastTranslate** (Python Gradio, 33 ngôn ngữ + Viral Shorts).
- Phát hiện Sublix có 3 điểm **UNIQUE**:
  1. **Đa engine song song** (Qwen 3 GPU local + MiniMax-M3 Cloud) — chưa ai làm
  2. **1-click pipeline bridges** (Downloader → File Sub → Dubbing Studio) — chưa ai làm
  3. **Downloader đa nền tảng** (9 site: YT/TT/Douyin/Bili/FB/X/IG/Vimeo/Reddit) — chỉ Sublix có
- Gợi ý **Roadmap P0**: Voice DESIGN (text → voice), MCP server cho AI agents, multi-TTS engine swap.
- Tài liệu đầy đủ tại `agent-team/COMPETITIVE_ANALYSIS.md` (15KB, 9 phần).

### File thay đổi
- `src-tauri/src/downloader/mod.rs` — +116 dòng (helper `find_js_runtime` + 2 call sites)
- `src/views/ChangelogModal.tsx` — thêm entry v0.9.0
- `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` — bump 0.8.0 → 0.9.0
- `agent-team/COMPETITIVE_ANALYSIS.md` — file mới

### Verify
- `cargo check` ✅ 0 warnings (4.11s)
- `npm run build` ✅ 364 KB JS / 80 KB CSS (1.17s)
- `cargo test --lib find_ytdlp_binary` ✅ PASS
- yt-dlp CLI test thật với flags mới ✅ **PASS (Rick Astley 11.28 MB)**

### Cần cho lần tới
- **Nếu máy không có Node.js**: cài https://nodejs.org (Node 18+) hoặc `irm https://deno.land/install.ps1 | iex` (cho Deno). Không có runtime → yt-dlp vẫn in warning và thử các site không cần bypass.

---

## v0.8.0 — 2026-10-04
### Nhận Diện Thị Giác AI & Bộ Minh Hoạ Điện Ảnh
- Logo mới: chữ S kết từ dải phim điện ảnh, kèm bộ icon ứng dụng trọn bộ cho taskbar & cửa sổ.
- Ảnh hero rạp chiếu phim ấm áp cho màn cài đặt đầu tiên (Onboarding).
- Bộ minh hoạ phẳng phong cách điện ảnh: khung chọn file, Trung tâm Models, lịch sử trống.
- Vân phim mờ tinh tế phủ trên sidebar ở theme Cinema & Studio.
- Tối ưu dung lượng ảnh từ 4.4 MB xuống còn 184 KB, app nhẹ và khởi động nhanh hơn.
- Hỗ trợ Kéo & Thả (Drag & Drop) tệp Video / Audio trực tiếp từ máy tính vào ứng dụng qua Tauri Native Webview API.
- Thay thế toàn bộ hộp chọn native Windows cũ bằng Custom Glass Select sang trọng.

---

## v0.7.0 — 2026-10-04
### Đại Tu Giao Diện Cinema Studio & AI Dubbing Đa Vai
- Bổ sung 4 phong cách giao diện: Cinema, Studio, Light, Vibrant.
- Bộ chọn Theme nhanh với nút chuyển đổi tức thì, tự động ghi nhớ cấu hình khi khởi động lại.
- Chuẩn hóa toàn bộ màu sắc sang Design Tokens (CSS Variables), thanh cuộn siêu mỏng tinh tế.
- Tách giọng gốc sạch 100% bằng Demucs v4 CUDA GPU.
- Tự động nhận diện phân vai diễn viên qua kịch bản ngữ cảnh MiniMax M3.
- Bộ giọng đọc Neural siêu tự nhiên (Edge-TTS) + tự động co giãn tốc độ (FFmpeg atempo).

---

## v0.6.0 — 2026-10-04
### Nâng Cấp CUDA RTX 3090 & Local LLM Translation
- Tích hợp Whisper Large-v3-Turbo Q8 (874MB) chạy trực tiếp trên GPU CUDA.
- Hỗ trợ Local Qwen 3 4B model cho dịch thuật offline, tốc độ ~0.1s/câu.

---

## v0.5.0 — 2026-10-03
### WASAPI Loopback Zero-Gap & Smart VAD
- ...

(Sửa lỗi Critical YouTube download, Competitive Analysis, bump version)

---

## Quy ước phát hành
- Mỗi commit sửa code (fix bug, feature, UI polish) **PHẢI**:
    1. Bump version `major.minor.patch` trong `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
    2. Thêm entry vào `CHANGELOG_DATA` trong `src/views/ChangelogModal.tsx`
    3. Thêm entry tương ứng vào `CHANGELOG.md` (file này)
- **minor** cho fix/feature đáng kể, **patch** cho nhỏ.
- Commit thay đổi version + CHANGELOG trong commit riêng (tách khỏi commit code).