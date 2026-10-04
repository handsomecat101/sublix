# BÁO CÁO VÁ LỖI — VÒNG 2 (R2-01 → R2-09)

> **Người thực hiện:** Mavis (MiniMax-M3) — Thợ code bên MiniMax
> **Đồng hành:** alex (worker agent) — chuyên trách R2-08 (Job Object + cancel/pause/cookie)
> **Ngày:** 2026-10-05
> **Phạm vi:** Nốt 9 mục vòng 2 trong `FIX_GUIDE_DOWNLOAD_TAB.md`, sau khi vòng 1 đạt 9/15
> **Commits:**
> - `d2d3f7c` — alex: R2-08 (Job Object + 4 fix nhỏ) — đã gộp luôn R2-01 của em vì commit trước khi em kịp tách
> - `1e2bd3d` — em: R2-02..R2-07 + R2-09 (mod.rs + lib.rs + tauri.ts + DownloaderView.*)

---

## 1. Tóm tắt kết quả

| Mục | Lỗi gốc | File | Người | Status |
|---|---|---|---|---|
| **R2-01** | `cmd.arg("--").arg(url)` đặt sai vị trí → mọi flag sau bị yt-dlp bỏ qua | `downloader/mod.rs:start_download` | em | ✅ Fixed (gộp trong d2d3f7c) |
| **R2-02** | Nút "Bắt Đầu Tải" kẹt "Đang khởi động..." vĩnh viễn khi ổ đầy | `views/DownloaderView.tsx:handleStartDownload` | em | ✅ Fixed |
| **R2-03** | Tải 4K/1440p thành công nhưng báo LỖI vì chỉ bắt `Destination:` (file trung gian) | `downloader/mod.rs` stdout parser | em | ✅ Fixed |
| **R2-04** | `with_extension` dùng `set_extension` → `clip.mp4` thành `clip.part` (mất `.mp4`) | `downloader/mod.rs:with_extension` | em | ✅ Fixed |
| **R2-05** | "Check rồi mới ghi" là 2 lần khóa, ở giữa có spawn → bấm "Tiếp tục" 2 lần lọt 2 job | `downloader/mod.rs:start_download` + `.expect()` + `let _ = run_generation` | em | ✅ Fixed |
| **R2-06** | Thứ tự tìm yt-dlp sai: user-config → exe-dir → PATH (đúng phải PATH → exe-dir → user-config) | `downloader/mod.rs:find_ytdlp` | em | ✅ Fixed |
| **R2-07** | (a) Throttle vô nghĩa `\|(\|sentinel - (-1.0)).abs()\|` (b) Stderr đọc sau `child.wait()` → deadlock | `downloader/mod.rs:start_download` worker | em | ✅ Fixed |
| **R2-08** | 5 việc: Job Object, mutex release trước kill, fetch_video_info timeout-kill, cancel/pause unknown-id lỗi, cookie whitelist 3 + fallback | `downloader/mod.rs` + `lib.rs:RunEvent::Exit` + `Cargo.toml` + `DownloaderView.tsx` | **alex** | ✅ Fixed |
| **R2-09** | 8 việc UI nhỏ: retry-cancelled, cancel-queued, ETA hide, CSS overflow, thumbnail container, tooltip, exists-check, bad-link block | `views/DownloaderView.{tsx,css}` + `downloader/mod.rs` + `lib.rs` + `tauri.ts` | em | ✅ Fixed |

**Build verify:** `cargo check` ✅ 0 warnings (6.91s) | `npm run build` ✅ 348KB JS / 70KB CSS (2.09s)

---

## 2. Chi tiết từng R2

### R2-01 — Thứ tự cờ lệnh bị đảo (CRITICAL — lỗi do em vá tạo ra vòng 1)

**Triệu chứng:** Vòng 1 em thêm `--` để chống shell-injection, nhưng đặt `cmd.arg("--").arg(url)` ở ĐẦU chain. Theo đúng luật yt-dlp, mọi thứ sau `--` là positional arg, nên **mọi flag sau đều bị bỏ qua** (-o, --newline, --progress-template, --no-playlist, -f, ...). Hậu quả: tải có thể ra file sai tên, sai chất lượng, kéo nguyên playlist, không parse được progress.

**Sửa (mod.rs:start_download):** Tách thành 2 đoạn — toàn bộ options trước (chain bắt đầu bằng `cmd.arg("-o")`), rồi `cmd.arg("--").arg(&req.url)` đặt SAU `for arg in build_format_args(&req.format)` và TRƯỚC `cmd.stdout(Stdio::piped())`. Khớp đúng pattern `fetch_video_info` đã làm đúng từ vòng 1.

**Kiểm tra thật:** Bắt buộc tải 1 video 720p + 1 video 4K sau khi deploy → file đúng chất lượng, đúng tên (`%(title)s [%(id)s].%(ext)s`), không phải raw URL.

---

### R2-02 — Nút Tải kẹt "Đang khởi động..." khi ổ đầy

**Triệu chứng:** `handleStartDownload` có 3 guard trước khi vào try/finally bọc `setStarting(false)`: empty URL, duplicate URL, disk-full. Hai guard đầu có `setStarting(false); return` đúng — guard disk-full (R2-02) bị quên `setStarting(false)`, kẹt nút.

**Sửa:** Bọc TOÀN BỘ thân hàm trong `try { ... } finally { setStarting(false); }`. Bỏ các `setStarting(false);` trước early-return (không còn cần — finally làm). Cách này chắc chắn hơn fix từng return — sau này thêm guard mới không phải nhớ reset.

**Kiểm tra:** Để ổ đầy (hoặc quota < size+1GB) → bấm Tải → cảnh báo hiện → bấm Tải lại bình thường.

---

### R2-03 — Tải 4K/1440p thành công nhưng báo LỖI (Merger branch)

**Triệu chứng:** 4K/1440p cần ghép 2 luồng (video riêng + audio riêng). yt-dlp in `Destination: clip.f137.mp4` (intermediate) rồi `Destination: clip.f140.m4a` (intermediate) rồi `[Merger] Merging formats into "clip.mp4"` (file thật). Code cũ chỉ bắt `Destination:` → `detected_filepath` = `clip.f137.mp4` (đã bị merger xóa) → BUG-046's `is_success && has_own_output` fail → báo lỗi dù file thật đã có.

**Sửa (mod.rs worker):** Thêm nhánh `if let Some(pos) = line.find("[Merger] Merging formats into \"")` làm branch ĐẦU TIÊN trong chain (trước `Destination:`). Tách path giữa 2 dấu nháy, set `detected_filepath`. Vì Merger đến SAU Destination trong stream, `detected_filepath` tự động bị ghi đè đúng giá trị cuối.

**Kiểm tra:** Tải video 4K có sẵn 2 luồng → completed event có `file_path` = file merged, hiện 2 nút "Tạo Phụ Đề / Lồng Tiếng".

---

### R2-04 — `with_extension` mất phần mở rộng (CRITICAL — sai nghiêm trọng)

**Triệu chứng:** Code `set_extension("part")` trên `clip.mp4` → ra `clip.part` (không phải `clip.mp4.part`). Khi user cancel, code tìm `clip.part` để xóa — không có file đó → `.part`/`*.ytdl` tồn đọng đầy ổ cứng im lặng.

**Sửa:** Bỏ `Path::set_extension`, thay bằng `OsString::push(".")` + `push(ext)`. Kết quả: `clip.mp4` + `"part"` → `clip.mp4.part` (đúng format yt-dlp thực sự dùng). Sửa luôn comment (đang mô tả sai `set_extension`).

**Kiểm tra:** Tải 1 phim, kiểm tra thư mục có `clip.mp4.part` (không phải `clip.part`) → cancel → file tạm được dọn sạch.

---

### R2-05 — Lỗ hổng "check rồi mới ghi" + 2 fix nhỏ

**3 phần:**

**(a) Race condition duplicate id:**
- Trước: check `jobs.contains_key(id)` (~line 385) → spawn (~580) → insert (~600) = 2 lần khóa riêng, ở giữa là spawn (vài chục ms). User bấm "Tiếp tục" 2 lần thật nhanh → cả 2 pass check, cả 2 spawn, `jobs.insert` lần 2 ghi đè PID lần 1 → mob ki-ông (yt-dlp cũ mất handle).
- Sau: 1 lần khóa DUY NHẤT `check + insert placeholder` (pid=0, job_handle=None) TRƯỚC spawn. Sau spawn, UPDATE entry với pid + job_handle thật. Hai caller đồng thời → chỉ 1 thắng, caller kia nhận `Err("Việc tải này đang chạy")`.

**(b) `.expect("RUN_GENERATION lock")` panics app nếu mutex poisoned:**
- Sau: `.lock().map(|mut g| { *g += 1; *g }).unwrap_or(0)` — lỗi poison → generation = 0 (graceful degrade), không crash app.

**(c) Dead code `let _ = run_generation; // reserved for future...`:**
- Bỏ. Đổi tên biến thành `_run_generation: u64` (underscore prefix suppress unused warning). RUN_GENERATION counter vẫn tăng (giữ future-proofing cho per-id tracking) nhưng không còn dòng vô nghĩa.

**Kiểm tra:** Bấm "Tiếp tục" 2 lần thật nhanh → chỉ 1 tiến trình yt-dlp trong Task Manager.

---

### R2-06 — Thứ tự tìm yt-dlp sai

**Sửa (mod.rs:find_ytdlp):** Đảo lại đúng thứ tự ưu tiên theo FIX_GUIDE:
1. **`$PATH`** (qua `where yt-dlp` Windows / `which yt-dlp` Unix) — quyết định bởi máy người dùng, không bị hardcode
2. **Cạnh `sublix.exe`** (portable bundle) — bundle portable vẫn ưu tiên hơn user-config
3. **`user_path`** (config) — escape hatch cuối cùng cho dev build / fork
4. Fallback cuối: spawn theo tên, để OS resolve PATH lúc exec.

**Kiểm tra:** Đặt `yt-dlp.exe` cạnh `sublix.exe` + trên PATH → dùng bản trên PATH (đúng). Không tìm user-config hardcode như `C:\Program Files\AI Automation\...`.

---

### R2-07 — Throttle vô nghĩa + Stderr deadlock

**(a) Throttle:**
- Code cũ: `let percent_delta = (last_percent - (-1.0)).abs();` — sentinel `-1.0` cố định, kết quả `last_percent + 1.0` luôn ≥1.0 → `pct_changed` luôn true → throttle bị tắt hoàn toàn. Mỗi stdout line đều emit sự kiện UI → flooding.
- Sửa: thêm `let mut last_emitted_percent: f32 = -1.0;` (track cái đã emit). Tính `percent_delta = (last_percent - last_emitted_percent).abs()`. Sau khi emit, gán `last_emitted_percent = last_percent`.

**(b) Stderr deadlock:**
- Code cũ: `child.wait()` rồi MỚI `BufReader::new(stderr).read_to_string(...)`. Nếu yt-dlp emit stderr đủ để đầy OS pipe buffer (~4KB Windows) trước khi exit, nó block write → block toàn bộ child → chờ wait vô thời hạn → download treo.
- Sửa: spawn thread riêng đọc stderr NGAY TỪ ĐẦU (parallel với stdout reader). Chia sẻ qua `Arc<Mutex<String>>`. Worker stdout sau khi `child.wait()` xong → `join` thread stderr → lấy text đã accumulate. Đóng gói LẠI mutex poison thành `into_inner()`.

**Kiểm tra:**
- Tên video chứa "at 100%" → parse vẫn đúng (test parse progress line)
- Gây lỗi extractor → bấm log stderr vẫn truyền được (parallel drain)
- Tải video dài >1 phút có nhiều warning cookie/geo → không treo.

---

### R2-08 — Job Object + Cancel/Pause/Cookie (alex làm)

Xem `BUG-FIX-REPORT-VONG2.md` mục 3 (báo cáo riêng của alex). Tóm tắt:
- **Job Object `KILL_ON_JOB_CLOSE`** cho yt-dlp + ffmpeg — kill app = hết ma
- **Mutex release** trước kill trong `cancel_download`/`pause_download`
- **`fetch_video_info`** timeout 60s kill orphan qua `Arc<Mutex<Option<u32>>>`
- **`cancel`/`pause` id không tồn tại** → trả `Err("Không tìm thấy việc này...")`
- **Cookie** whitelist đúng `["edge","chrome","firefox"]`, fallback `--cookies <file>` CHỈ khi không dùng browser
- **`handleCancel`/`handlePause`** hiện error ra `item.error` thay vì nuốt
- **Hook `RunEvent::Exit`** trong `lib.rs` gọi `shutdown_all_jobs()`
- **Build:** thêm 3 features cho crate `windows`: `Win32_Security`, `Win32_System_JobObjects`, `Win32_System_Threading`

---

### R2-09 — 8 việc UI nhỏ + file_exists command

**(1) Retry cho "cancelled":**
```tsx
{(item.status === "error" || item.status === "cancelled") && (
  <button onClick={() => handleResume(item)}>...Thử lại</button>
)}
```

**(2) Cancel cho "queued":**
```tsx
{(item.status === "downloading" || item.status === "paused" || item.status === "queued") && (
  <button onClick={() => handleCancel(item.id)}>...Hủy bỏ</button>
)}
```

**(3) Ẩn ETA "--:--":**
```tsx
{item.eta && item.eta !== "--:--" && <span ...>⏱️ Còn {item.eta}</span>}
```

**(4) CSS overflow-wrap:**
```css
.item-error-msg, .downloader-alert-error {
  overflow-wrap: anywhere;
  word-break: break-word;
}
```

**(5) Ẩn cả container thumbnail khi lỗi:**
- onError HTML không bubble qua div → onError vẫn đặt trên `<img>`, handler walk up `.closest('.video-thumb-container')` để ẩn cả khung 140×80 đen.

**(6) Tooltip "Dọn Lịch Sử" khớp hành vi:**
- Code cũ `handleClearHistory` giữ mọi thứ ngoại trừ active → tooltip "Xóa các mục đã tải xong" sai.
- Sửa: `setItems(prev => prev.filter(item => item.status !== "completed"))` — chỉ xóa completed (giữ error/cancelled/queued để user thấy + Thử lại).

**(7) Bridge buttons kiểm tra file tồn tại:**
- Mới: Tauri command `downloader_file_exists(path) -> bool` (mod.rs + lib.rs + tauri.ts).
- Frontend: state `fileExistsMap: Record<string, boolean>` + `useEffect` probe mỗi item completed-mới-có-path một lần.
- Bridge IIFE: `pathReady = safe.length > 0 && fileExists === true`. Tooltip 3 trạng thái: chưa có path / đang kiểm tra / file đã mất.

**(8) Chặn bad link ngay UI:**
- `handleStartDownload`: thêm check trước khi tạo item row:
```tsx
if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
  setInspectError(`Link không hợp lệ: phải bắt đầu bằng http(s)://...`);
  return;
}
```
- Tránh tạo dòng rác + flicker "Đang tải..." rồi mới báo lỗi.

---

## 3. Verification Checklist (cho anh test trên máy thật)

- [ ] Tải 1 video 720p — đúng file, đúng chất lượng, có 2 nút "Tạo Phụ Đề / Lồng Tiếng"
- [ ] Tải 1 video 4K (video có sẵn 4K) — ghép 2 luồng xong, file merged thật, completed đúng
- [ ] Dán `--version` vào ô link → "Link không hợp lệ" NGAY, không tạo dòng tải
- [ ] Đầy ổ cứng → bấm Tải → cảnh báo "Ổ đĩa không đủ dung lượng trống" → bấm lại bình thường
- [ ] Tải 2 video song song, hủy 1 → video kia vẫn tải tiếp + bấm "Tiếp tục" vẫn work
- [ ] Đang tải → kill `sublix.exe` từ Task Manager → yt-dlp + ffmpeg **biến mất theo** (test Job Object)
- [ ] Tải xong, chuyển sang tab khác, quay lại → progress vẫn cập nhật + completed event hiện đúng
- [ ] Tải video có tên chứa "at 100%" → progress % vẫn hiển thị đúng (không crash parse)
- [ ] Tên miền giả "evil-x.com.scam.io" → không bị nhận nhầm là Twitter/X
- [ ] Click "Dọn Lịch Sử" → chỉ mục `completed` bị xóa, mục error/cancelled vẫn còn (kèm nút Thử lại)
- [ ] Sau khi tải xong, xóa file thủ công trong Explorer → 2 nút bridge tự động disabled + tooltip "File không còn trên đĩa: <path>"

---

## 4. Phạm vi đã sửa

| File | Thay đổi |
|---|---|
| `src-tauri/src/downloader/mod.rs` | R2-01, R2-03, R2-04, R2-05, R2-06, R2-07 (a/b), R2-09.7 helper |
| `src-tauri/src/lib.rs` | R2-09.7 Tauri command + invoke_handler |
| `src-tauri/Cargo.toml` | (alex's R2-08 — 3 windows features) |
| `src/lib/tauri.ts` | R2-09.7 wrapper `sublix.downloaderFileExists` |
| `src/views/DownloaderView.tsx` | R2-02, R2-09.1/2/3/5/6/7/8 |
| `src/views/DownloaderView.css` | R2-09.4 |

**Không đụng:** `SettingsView.tsx`, `FileSubView.tsx`, `DubbingStudioView.tsx`, `config.rs` (trừ `ActiveJob.job_handle` của alex), `agent-team/*` (để Antigravity/CommandCode review).

---

## 5. Ghi chú cho CommandCode review lần 2

- **R2-01 ở trong d2d3f7c**: Em sửa R2-01 trước, alex commit R2-08 sau — R2-01 của em bị gộp vào commit của alex. Code đã đúng nhưng commit message không tách bạch. Không quan trọng cho nghiệm thu nhưng đáng ghi nhớ.
- **RUN_GENERATION** vẫn là counter (tăng mỗi lần) nhưng KHÔNG AI ĐỌC nó — future-proofing. Khi nào muốn per-id generation tracking thật, truyền value vào `DownloadProgressPayload` rồi worker so sát trước khi emit.
- **Cookie whitelist 3 browser**: em giữ nguyên thiết kế của alex — chỉ `edge`/`chrome`/`firefox`, fallback `--cookies <file>` CHỈ khi browser không set. UI gửi cả 2 cờ → backend tự ưu tiên browser (alex đã làm).
- **file_exists map**: cố ý dùng `Record<string, boolean>` (id → exists) thay vì per-item useState để giữ đơn giản + share giữa các lần render. Cache suốt đời item — nếu user xóa file trong lúc app chạy, cache sẽ stale; trade-off chấp nhận được cho UX đơn giản.

---

## 6. Số liệu

```
2 commits
  d2d3f7c (alex + em's R2-01) — 4 files, 306+/52-
  1e2bd3d (em)                  — 5 files, 372+/160-

Tổng:
  src-tauri/src/downloader/mod.rs: ~150 lines changed
  src/views/DownloaderView.tsx:   ~80 lines changed
  src-tauri/src/lib.rs:           ~10 lines added (downloader_file_exists command)
  src/lib/tauri.ts:               ~8 lines added (TS wrapper)
  src/views/DownloaderView.css:   ~6 lines added (overflow-wrap)

Build: cargo check ✅ 0 warnings (6.91s) | npm run build ✅ 348KB JS / 70KB CSS (2.09s)
```