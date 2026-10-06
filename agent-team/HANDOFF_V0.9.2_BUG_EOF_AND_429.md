# HANDOFF V0.9.2 — Bug EOF JSON Parse + HTTP 429 Subtitle

> **Mục đích:** Tài liệu này Mavis (MiniMax-M3) viết để Anh Tuấn **copy/paste pass cho agent khác** xử lý tiếp 2 bug người dùng gặp. Em (Mavis) không gọi worker, không làm code ở task này.
>
> **Ngày viết:** 2026-10-06
> **Author:** Mavis (MiniMax-M3) — session `mvs_3a3dec99207744f59951969c3c26e69c`
> **Receiver:** Agent khác do Anh Tuấn chỉ định

---

## 1. Project Context (đọc trước khi đụng code)

**Sublix** — Tauri 2 + Rust backend + plain TS frontend, app Windows đơn vị trị, có tính năng download video đa nền tảng (YouTube, Bilibili, TikTok, Twitter, Facebook, Vimeo, SoundCloud, Twitch, Generic) + dubbing AI (Qwen 3 GPU + MiniMax-M3 Cloud).

**Project root:** `H:\AI Project\sublix`
**Branch:** `master` (đang ở commit `449e662` — v0.9.1)
**Latest commits:**

```
449e662 chore(release): bump 0.9.0 -> 0.9.1 + fix window title version mismatch
2a1acbc fix(downloader): replace invalid --no-ansi flag with --no-colors, add ffmpeg-location, and enable separate stream muxing
7aa92ab chore(release): bump version 0.8.0 -> 0.9.0 + update CHANGELOG
1c811c5 fix(downloader): pass --js-runtimes + --remote-components so YouTube 2026+ downloads work
```

**Đã fix xong (Vòng 1–3):**
- Vòng 1: 15 bugs `BUG-044 → BUG-058` Tab Tải Video (commit `bd6a9d6/6739ea7/a142999/3bdf2e6`)
- Vòng 2: `R2-01..R2-09` (commit `d2d3f7c/1e2bd3d`) — xem `agent-team/BUG-FIX-REPORT-VONG2.md`
- Vòng 3: `R3-01..R3-04` (Antigravity fix) — RAII placeholder + monotonic run_id + cookie fallback + UI polish
- v0.9.0: fix YouTube download hoàn toàn fail (root cause: thiếu `--js-runtimes` + `--remote-components`) — commit `1c811c5`
- v0.9.1: fix window title hardcoded mismatch — commit `449e662`

**Còn 2 bug NGƯỜI DÙNG GẶP ẢNH, chưa fix** (xem mục 2 + 3 bên dưới).

---

## 2. ⚠️ LUẬT BẮT BUỘC (đọc file `FIX_GUIDE_DOWNLOAD_TAB.md` đầu file để biết chi tiết)

1. **CẤM `cargo build --release`** — dùng **`npx tauri build --no-bundle`** để đóng gói exe.
2. **Tắt app trước khi build:** `taskkill /IM sublix.exe /F`
3. **Commit git theo nhóm bug**, không 1 commit tổng (dễ hoàn tác).
4. **Mỗi lần sửa code PHẢI bump version + ghi `CHANGELOG.md`** (xem mục 6).
5. **PowerShell only**, KHÔNG `&&`, KHÔNG bash. Dùng `;`, `Get-ChildItem`, `Select-String`.
6. **Lỗi phải hiện lên UI** (đã làm sẵn trong R2-07).
7. **Public API comments tiếng Anh** trong `mod.rs`.
8. **Phạm vi code:** `src-tauri/src/downloader/`, `src/views/DownloaderView.*`, phần downloader trong `lib.rs`/`tauri.ts`. **KHÔNG đụng file khác trừ 3 file version (Cargo.toml, package.json, CHANGELOG.md, ChangelogModal.tsx).**

---

## 3. 🐛 BUG #1 — "EOF while parsing a value at line 1 column 0" khi kiểm tra link unavailable

### 3.1.1 Triệu chứng (anh Tuấn gặp)
- Anh Tuấn dán 1 URL YouTube **không khả dụng** (private / region-locked / xóa) vào ô "Kiểm Tra Link"
- App Sublix hiển thị lỗi: `EOF while parsing a value at line 1 column 0`
- Lỗi này **vô nghĩa** với user — họ không biết video chết, video riêng tư, hay bị chặn khu vực.

### 3.1.2 URL test cụ thể (đã verify CLI)
- `https://www.youtube.com/watch?v=uqkD4SxPK0I` — đã verify CLI exit 1 + stderr "ERROR: [youtube] uqkD4SxPK0I: Video unavailable"
- Vậy nên CLI thì trả lỗi đúng. **Vấn đề là: bằng cách nào đó, code Sublix KHÔNG đi qua nhánh `!output.status.success()` mà đi thẳng đến JSON parse** → throw "EOF while parsing".

### 3.1.3 Code liên quan — file `src-tauri/src/downloader/mod.rs`

**Hàm `fetch_video_info` (line 466–606):**

```rust
// Line 549–577
let output = match rx.recv_timeout(std::time::Duration::from_secs(60)) {
    Ok(Ok(out)) => out,
    Ok(Err(e)) => return Err(e),
    Err(_) => { /* timeout 60s → kill orphan → return Err */ }
};

if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(anyhow::anyhow!("Không thể lấy thông tin video: {}", stderr.trim()));
}

let stdout = String::from_utf8_lossy(&output.stdout);
let json: serde_json::Value =
    serde_json::from_str(&stdout).context("Không thể phân tích dữ liệu JSON từ yt-dlp")?;
//                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                              ĐÂY LÀ CHỖ THROW "EOF while parsing a value at line 1 column 0"
```

### 3.1.4 Root cause hypothesis (cần verify)

Có **3 khả năng** khiến `output.status.success()` = true nhưng `stdout` không phải JSON hợp lệ:

1. **yt-dlp thỉnh thoảng in banner/warning ra stdout** trước JSON khi có `--remote-components` chạy lần đầu (download EJS script), làm nhiễm output.
   - Cần thêm flag `--no-progress` hoặc parse JSON từ vị trí `{` đầu tiên.
2. **Race condition pipe stdout/stderr** — yt-dlp merge streams → stdout lẫn stderr text → JSON parse fail.
   - Cần tách pipe: `--output -` (về stdout) không có tác dụng với `--dump-json`; thử pipe riêng.
3. **yt-dlp trên mảnh khi URL chết**: thử extract nhưng exit 0 vì đã in partial JSON rồi bị kill.
   - Test bằng CLI: chạy command y hệt Sublix với URL unavailable, dump stdout ra file → check có phải JSON không.

### 3.1.5 Đề xuất fix (gợi ý, agent tự quyết chi tiết)

**Phương án A (khuyến nghị — đơn giản nhất):** Tìm JSON trong stdout từ vị trí `{` đầu tiên.

```rust
// Thay vì parse cả stdout:
let stdout = String::from_utf8_lossy(&output.stdout);

// Tìm ký tự '{' đầu tiên (bỏ qua banner/warnings)
let json_start = stdout.find('{').ok_or_else(|| {
    anyhow::anyhow!(
        "yt-dlp không trả về JSON. Có thể video đã bị xóa/riêng tư/bị chặn khu vực.\nstderr: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    )
})?;
let json_str = &stdout[json_start..];

let json: serde_json::Value = serde_json::from_str(json_str).context(
    "Không thể phân tích dữ liệu JSON từ yt-dlp (có thể video không khả dụng)"
)?;
```

**Phương án B (triệt để hơn):** Check stdout BẮT ĐẦU bằng `{` ngay sau khi spawn (race-free), hoặc dùng `--no-progress` + parse strict.

**Phương án C (debug first):** Thêm `info!()` log stdout + stderr TRƯỚC khi fail để xem thực tế nó trả gì. Sau khi biết root cause, dùng A hoặc B.

### 3.1.6 Verification

```powershell
# Test CLI với URL unavailable (chạy tay)
$env:YTDLP = 'C:\Users\TTC\AppData\Roaming\Python\Python313\Scripts\yt-dlp.exe'
$env:NODE = 'C:\Program Files\nodejs\node.exe'
& $env:YTDLP --js-runtimes "node:$env:NODE" --remote-components 'ejs:github' --dump-json --no-playlist --no-warnings --extractor-args 'youtube:player_client=android,web_safari,ios' -- 'https://www.youtube.com/watch?v=uqkD4SxPK0I' > stdout.txt 2> stderr.txt
# Check exit code + đọc stdout.txt: nếu có dòng đầu không phải '{' → đó là banner
Get-Content stdout.txt -TotalCount 5
```

```powershell
# Test Sublix GUI:
# 1. Bật app
# 2. Dán URL unavailable vào "Kiểm Tra Link"
# 3. Quan sát: phải thấy "Video không khả dụng / đã bị xóa / bị chặn khu vực"
#    KHÔNG được thấy "EOF while parsing a value at line 1 column 0"
```

---

## 4. 🐛 BUG #2 — HTTP 429 "Too Many Requests" khi tải subtitle

### 4.1.1 Triệu chứng (anh Tuấn gặp)
- Sublix gọi `yt-dlp` với `--write-subs --write-auto-subs --convert-subs srt --sub-langs vi,en,ja,zh` (4 ngôn ngữ × 2 loại subs = 8 request HTTP liên tiếp đến YouTube trong vài giây).
- Sau ~3–5 lần tải liên tiếp, YouTube trả **HTTP 429 "Too Many Requests"** → yt-dlp bỏ qua subtitle ngôn ngữ đó.
- Trên UI: thấy warning "unable to download map từ YouTube" hoặc không có file `.srt` xuất hiện.

### 4.1.3 Code liên quan — file `src-tauri/src/downloader/mod.rs`

**`build_download_command` (line 670–684):**

```rust
if req.extract_subtitles {
    cmd.arg("--write-subs")
        .arg("--write-auto-subs")
        .arg("--convert-subs")
        .arg("srt");
    if let Some(ref langs) = req.subtitle_langs {
        if !langs.is_empty() {
            cmd.arg("--sub-langs").arg(langs.join(",")); // "vi,en,ja,zh"
        } else {
            cmd.arg("--sub-langs").arg("vi,en,ja,zh");
        }
    } else {
        cmd.arg("--sub-langs").arg("vi,en,ja,zh");
    }
}
```

### 4.1.4 Root cause
- **Sublix spam 8 HTTP request liên tiếp không nghỉ** (4 langs × write-subs + write-auto-subs).
- yt-dlp KHÔNG có built-in backoff cho subtitle HTTP (chỉ retry cho video chính).
- YouTube rate-limit IP khi > ~5–10 req/s đến subtitle endpoint.

### 4.1.5 Đề xuất fix (3 options, chọn 1)

**Phương án A (khuyến nghị — ít code nhất, ít thay đổi nhất):** Dùng `--sleep-subtitles` của yt-dlp.

```rust
if req.extract_subtitles {
    cmd.arg("--write-subs")
        .arg("--write-auto-subs")
        .arg("--convert-subs")
        .arg("srt");
    // MỚI: yt-dlp 2024+ có --sleep-subtitles <seconds> để delay giữa các sub-request
    cmd.arg("--sleep-subtitles").arg("2");  // 2s giữa mỗi sub-lang
    // ... (phần sub-langs giữ nguyên)
}
```

→ Đơn giản, không cần retry logic custom, yt-dlp tự lo.

**Phương án B (thân thiện user hơn):** Tách thành 2 lần download:
- Lần 1: chỉ tải video + audio (KHÔNG subs)
- Lần 2: chỉ tải subs, delay 2–3s giữa mỗi lang

→ Code phức tạp hơn nhiều (spawn 2 process), nhưng video không bị block vì sub 429.

**Phương án C (debug):** Detect 429 trong stderr của yt-dlp, log warning, KHÔNG fail download (vì video đã tải OK rồi).

→ Code ở chỗ parse stderr trong `drain_child_process` (line ~880).

### 4.1.6 Verification

```powershell
# Test CLI với 4 sub-langs (chạy tay 2 lần liên tiếp)
$env:YTDLP = 'C:\Users\TTC\AppData\Roaming\Python\Python313\Scripts\yt-dlp.exe'
$env:NODE = 'C:\Program Files\nodejs\node.exe'
& $env:YTDLP --js-runtimes "node:$env:NODE" --remote-components 'ejs:github' --write-subs --write-auto-subs --convert-subs srt --sub-langs vi,en,ja,zh --sleep-subtitles 2 -o "test.%(ext)s" -- 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' 2>&1 | Select-String -Pattern '429|Too Many|warning'
# Nếu không thấy 429 → A work. Nếu vẫn thấy → cần B hoặc tăng sleep lên 5s.
```

```powershell
# Test Sublix GUI:
# 1. Bật app
# 2. Tick "Trích xuất phụ đề" → chọn 4 ngôn ngữ vi/en/ja/zh
# 3. Tải 1 video YouTube ~10 phút
# 4. Mở thư mục downloads → phải có file `.vi.srt`, `.en.srt`, `.ja.srt`, `.zh.srt` (KHÔNG warning 429 trong log)
```

---

## 5. 📋 Files IN SCOPE / OUT OF SCOPE

### IN SCOPE (được phép sửa)
- `src-tauri/src/downloader/mod.rs` — sửa bug EOF (line ~575) + bug 429 (line ~670)
- `src-tauri/Cargo.toml` — bump version 0.9.1 → 0.9.2 (line 3)
- `package.json` — bump version 0.9.1 → 0.9.2 (line 4)
- `CHANGELOG.md` — thêm entry v0.9.2 ở đầu file
- `src/views/ChangelogModal.tsx` — thêm entry v0.9.2 với `isCurrent: true`, chuyển v0.9.1 thành không current
- `agent-team/AGENT_CHAT.md` — thêm handoff message

### OUT OF SCOPE (CẤM đụng)
- `src-tauri/src/lib.rs` (trừ khi cần export thêm command)
- `src-tauri/tauri.conf.json` (window title đã fix v0.9.1)
- `src/views/DownloaderView.tsx`, `src/views/DownloaderView.css`
- `src/lib/tauri.ts`
- `src-tauri/src/dubbing/*`
- Bất kỳ file nào khác

---

## 6. 🔖 Version Discipline (BUMP + CHANGELOG)

### Version bump
**0.9.1 → 0.9.2** (PATCH — chỉ fix bug nhỏ, không breaking, không feature mới).

### File `src-tauri/Cargo.toml` (line 3):
```toml
version = "0.9.2"
```

### File `package.json` (line 4):
```json
"version": "0.9.2",
```

### File `CHANGELOG.md` — thêm block mới ở đầu (sau phần giới thiệu SemVer):
```markdown
## v0.9.2 — 2026-10-06
### Sửa Lỗi Nhỏ: Kiểm Tra Link + Tải Phụ Đề
- **Kiểm Tra Link (fetch_video_info)**: Trước đây khi URL YouTube không khả dụng (private / region-locked / xóa), Sublix throw lỗi kỹ thuật `EOF while parsing a value at line 1 column 0` gây khó hiểu. Giờ tự động dò vị trí bắt đầu JSON (`{`) trong stdout yt-dlp, fallback về thông báo thân thiện "Video không khả dụng / bị xóa / bị chặn khu vực".
- **Tải Phụ Đề (HTTP 429)**: Trước đây Sublix gửi 8 request HTTP liên tiếp đến YouTube để lấy 4 ngôn ngữ phụ đề (×2 loại subs), gây HTTP 429 "Too Many Requests". Giờ thêm `--sleep-subtitles 2` để yt-dlp tự delay 2s giữa mỗi request sub.
```

### File `src/views/ChangelogModal.tsx` — thêm entry mới ở đầu `CHANGELOG_DATA`, chuyển `isCurrent: true` từ v0.9.1 sang v0.9.2:
```typescript
{
  version: "v0.9.2",
  date: "06/10/2026",
  title: "Sửa Lỗi Kiểm Tra Link + Tải Phụ Đề",
  isCurrent: true,
  highlights: [
    {
      category: "Sửa Lỗi Nhỏ",
      icon: "🔧",
      items: [
        "**Kiểm Tra Link (fetch_video_info)**: URL YouTube không khả dụng (private / region-locked / xóa) trước đây throw `EOF while parsing a value at line 1 column 0` gây khó hiểu. Giờ dò vị trí JSON trong stdout yt-dlp, fallback thông báo thân thiện.",
        "**Tải Phụ Đề (HTTP 429)**: 8 request HTTP liên tiếp đến YouTube gây 429. Giờ `--sleep-subtitles 2` để yt-dlp delay 2s giữa mỗi sub-lang.",
      ],
    },
  ],
},
```
(Nhớ đổi v0.9.1 entry `isCurrent: true` → `isCurrent: false` hoặc bỏ hẳn.)

---

## 7. 🛠 Build & Test Commands (PowerShell)

```powershell
# 1. Tắt app nếu đang chạy
taskkill /IM sublix.exe /F

# 2. Verify backend
cd 'H:\AI Project\sublix\src-tauri'
$env:PATH = 'C:\Users\TTC\.cargo\bin;' + $env:PATH
cargo check
# Expect: 0 errors, 0 warnings

# 3. Verify frontend
cd 'H:\AI Project\sublix'
npm run build
# Expect: dist/ created, no TS error

# 4. Build release exe
cd 'H:\AI Project\sublix'
taskkill /IM sublix.exe /F
$env:PATH = 'C:\Users\TTC\.cargo\bin;' + $env:PATH
cd src-tauri; npx tauri build --no-bundle
# Expect: src-tauri/target/release/sublix.exe (~14.4 MB)
```

---

## 8. 📝 Commit Message Convention

Theo convention đã có trong repo (`1c811c5`, `449e662`):

```bash
# Commit 1: bug EOF
git add src-tauri/src/downloader/mod.rs
git commit -m "fix(downloader): parse yt-dlp JSON from first '{' to handle banner + unavailable URLs"

# Commit 2: bug 429
git add src-tauri/src/downloader/mod.rs
git commit -m "fix(downloader): add --sleep-subtitles 2 to avoid HTTP 429 on multi-lang subtitle fetch"

# Commit 3: version + changelog
git add src-tauri/Cargo.toml package.json CHANGELOG.md src/views/ChangelogModal.tsx
git commit -m "chore(release): bump 0.9.1 -> 0.9.2 + CHANGELOG EOF/429 fixes"
```

(Nếu muốn gộp 1 commit thì OK, nhưng khuyến nghị 3 commit để dễ revert.)

---

## 9. 📋 Acceptance Criteria (checklist agent khác tự đánh dấu khi xong)

- [ ] `cargo check` 0 errors, 0 warnings
- [ ] `npm run build` 0 errors
- [ ] `npx tauri build --no-bundle` thành công, exe mới có size ~14.4 MB
- [ ] Test CLI với URL `uqkD4SxPK0I`: hiểu được tại sao fail (không phải EOF mystery)
- [ ] Test GUI dán URL unavailable: thấy thông báo thân thiện, KHÔNG thấy "EOF while parsing"
- [ ] Test CLI 2 lần liên tiếp với `--sub-langs vi,en,ja,zh`: KHÔNG còn warning 429
- [ ] Test GUI tick "Trích xuất phụ đề" 4 ngôn ngữ: có file `.srt` đầy đủ trong downloads
- [ ] Version `0.9.2` ở 4 chỗ: Cargo.toml, package.json, CHANGELOG.md, ChangelogModal.tsx
- [ ] Window title vẫn đúng `v0.9.2` (không bị revert)
- [ ] Sidebar vẫn hiển thị `v0.9.2`
- [ ] AGENT_CHAT.md ghi handoff message mới

---

## 10. 🔗 Tài liệu tham khảo nên đọc

- `agent-team/FIX_GUIDE_DOWNLOAD_TAB.md` — LUẬT BẮT BUỘC + lịch sử bug
- `agent-team/BUG-FIX-REPORT-VONG2.md` — per-bug report vòng 2 (R2-01..R2-09)
- `agent-team/COMPETITIVE_ANALYSIS.md` — nghiên cứu 4 đối thủ voice/dubbing
- `agent-team/ISSUE_LOG.md` — Quick Index bugs
- `agent-team/PROJECT_STATE.md` — dashboard trạng thái task

---

## 11. ⚠️ Lưu ý quan trọng cho agent

1. **Không tự ý đổi behavior khác ngoài 2 bug này** (theo memory rule "No silent trade-offs" — nếu phải đổi thì BÁO USER NGAY).
2. **Đừng quên test CLI** trước khi commit (anh Tuấn bực vì commit không test rồi fail trên app).
3. **Nếu phương án A bug 429 không work** → đừng retry 5 lần, escalate lên B hoặc tăng sleep 5s, có thể là server-side rate limit thật.
4. **Nếu gặp edge case không giải được** → ghi rõ vào report, KHÔNG tự ý "tạm thời bỏ qua".
5. **Sau khi xong**, update `agent-team/AGENT_CHAT.md` với message `@done` để team biết.

---

**Hết tài liệu. Anh Tuấn copy file này pass cho agent khác là được.**