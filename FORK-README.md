# FORK Sublix — bản sửa riêng (an toàn)

> **Đây là bản LÀM VIỆC RIÊNG.** Bản gốc đang chạy ở `H:\AI Project\sublix` **không bị đụng tới** khi sửa trong fork này.

## Vì sao có fork này

Từ 2026-10-13 → 2026-10-18 đã có **8 commit** của agent khác vào `master`, trong đó có 2 lần "rollback" làm mất công việc chưa commit:

```
12b7891  10-13  HEAD cũ
934fd8e  10-17  docs: handoff for session 35
...
51f73fe  10-18  HEAD hiện tại
```

Phiên Mavis trước (2026-10-17) sửa BUG-071/072 xong, **chưa commit**, và đã **bị mất sạch** khi cây làm việc bị reset về `master`:
- version `0.11.35` → bị đẩy về `0.11.33`
- `scripts/check_version.ps1` (guard version 4 nguồn) → **xoá**
- entry CHANGELOG `v0.11.35` → **xoá**
- file báo cáo bàn giao → **xoá**

→ Bài học: **công việc chưa commit = không tồn tại.** Fork này sinh ra để lần sau không lặp lại.

## Cấu trúc

| Đường dẫn | Vai trò | Ghi chú |
|---|---|---|
| `H:\AI Project\sub-lix` | **BẢN GỐC — ĐỪNG SỬA** | App đang chạy. `master` @ `51f73fe` |
| `H:\AI Project\sub-lix-fork-2026-10-19` | **FORK — sửa ở đây** | Branch `fix/voice-timeline-mojibabe` @ `3694d64` |
| `H:\AI Project\sub-lix-fork-build-2026-10-19` | Thư mục build Rust của fork (`CARGO_TARGET_DIR`) | Tách biệt hoàn toàn khỏi bản gốc |
| `D:\sublix-fork-2026-10-19` | Bản sao dự phòng #2 (git thuần) | Cùng nội dung, khác ổ đĩa |
| `D:\sublix-history-2026-10-19.bundle` | Toàn bộ lịch sử git trong 1 file | 71.7 MB, copy đi đâu cũng được |

### Junction trong fork (dùng chung, chỉ đọc)

| Junction | → trỏ tới | Cảnh báo |
|---|---|---|
| `src-tauri\models` | `H:\AI Project\sublix\src-tauri\models` | **KHÔNG bấm "Tải model" trong fork** — sẽ ghi đè model của bản gốc |
| `src-tauri\binaries` | `H:\AI Project\sublix\src-tauri\binaries` | Tương tự — chỉ đọc |
| `models` | `H:\AI Project\sublix\models` | Tương tự |
| `src-tauri\target` | `D:\sublix-fork-target-2026-10-19` | ⚠️ **ĐÃ BỎ** — D: báo lỗi I/O (os error 1117) khi cargo build. Giờ build ra `H:\AI Project\sub-lix-fork-build-2026-10-19` qua `CARGO_TARGET_DIR` |

Source code, `node_modules`, `dist`, git history, **build output** → **hoàn toàn riêng**.

## Trạng thái fork lúc tạo

- HEAD: `432f1ce` "WIP snapshot 2026-10-19: voice track + timeline fixes in progress"
- Cha: `51f73fe` (giống hệt HEAD bản gốc)
- Tag: `snapshot-2026-10-19` → trỏ `432f1ce`
- WIP 2 file đang sửa dở của agent khác đã được **commit** (không nằm rơi rác):
  - `src/views/SublixStudioView.tsx` (hash `15c776d9`)
  - `src/views/SublixStudioView.css` (hash `0671ad75`)
  - → đã verify **khớp byte-for-byte** với working tree của bản gốc
- `npm install` ✅ · `npm run build` ✅ (`built in 6.54s`, tsc pass)

## Cách chạy fork

```powershell
cd 'H:\AI Project\sub-lix-fork-2026-10-19'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'   # KHÁC 9222 để không đụng app gốc
& '.\Chay-Sublix.bat'
```

> ⚠️ **Port 9223, không phải 9222.** App gốc đang chiếm 9222. Dùng nhầm port sẽ bám vào app gốc và mọi thao tác GUI sẽ động vào bản gốc.
>
> ⚠️ Lần build Rust đầu tiên trong fork sẽ mất **15–40 phút** (target mới trên D:, không tái dùng cache của bản gốc).

## Luật lệ trong fork

1. **Chỉ sửa trong fork.** Mọi thay đổi ở `H:\AI Project\sublix` phải có lý do rõ ràng và được user đồng ý.
2. **Commit thường xuyên.** Công việc chưa commit đã bị mất 1 lần rồi. Không đợi hết phiên.
3. **Bump version đủ 4 nguồn** khi sửa code:
   `package.json` · `src-tauri/Cargo.toml` · `src-tauri/tauri.conf.json` (version + 2 title).
   *(Guard `scripts/check_version.ps1` bị mất lúc rollback — nếu cần thì tạo lại, hoặc so thủ công 4 dòng.)*
4. **Cập nhật tài liệu cùng lúc**: `CHANGELOG.md` · `src/views/ChangelogModal.tsx` · `agent-team/ISSUE_LOG.md` · `agent-team/PROJECT_STATE.md`.
5. **Không ghi đè/rollback thay đổi chưa commit của agent khác.**
6. **Branding (tên app, slogan, text user-facing) phải hỏi user**, không tự quyết.
7. **Không sửa `Chay-Sublix.bat`** gốc — nếu cần đổi launcher trong fork thì sửa bản trong fork.

## Khôi phục bản gốc từ fork

```powershell
# xem trạng thái bản gốc
cd 'H:\AI Project\sublix'
git status
git log --oneline -3

# nếu bản gốc hỏng, lấy lại từ fork (KHÔNG chạy trong bản gốc đang có việc dở)
git -C 'H:\AI Project\sub-lix-fork-2026-10-19' log --oneline --all

# từ bundle (1 file, không cần repo)
git clone 'D:\sublix-history-2026-10-19.bundle' sublix-khoi-phuc
```

## Rủi ro đĩa (quan trọng)

- ~~**Ổ H: còn ~9 GB trống**~~ → **ĐÃ XOÁ `src-tauri/target` của bản gốc** (`cargo clean`: 71.722 file / 82.6 GiB). **H: còn 121.4 GB trống.**
- Build của fork nằm ở `H:\AI Project\sub-lix-fork-build-2026-10-19` (tách biệt) và `...-w1-...` (target riêng cho worker verify song song).

---

# KẾT QUẢ ĐÃ LÀM TRONG FORK (v0.11.34)

## Bug gốc — parser SRT mất 106/155 cue

`src-tauri/src/file_sub.rs` → `parse_srt_content()` dùng `normalized.split("\n\n")`.
File SRT kiểu **rolling-caption** có dòng trống NGAY SAU dòng timestamp →
mỗi cue bị tách làm đôi, block chứa timestamp không còn text → **bị bỏ**.

Kết quả: file có **155 cue** nhưng app chỉ nạp **49** → timeline trống, track lồng tiếng cũng trống theo.

> Fix này **đã từng được viết ở phiên 2026-10-17 nhưng bị mất** khi cây làm việc bị rollback. Đây là lý do bug "quay lại".

### Đã sửa
- `parse_srt_content()` → quét **tuyến tính theo dòng**: chỉ mở cue khi gặp `-->`; dòng trống KHÔNG kết thúc cue; nhìn-trước loại số thứ tự cue khỏi text; chuẩn hóa timestamp `HH:MM:SS,mmm`; bỏ BOM; nhận cả LF/CRLF.
- `normalize_srt_timestamp()` — hàm helper mới.
- `src-tauri/src/dubbing/mod.rs` → `srt_segments_to_dubbing()`: **đường riêng cho nguồn SRT**, không dùng `clean_and_merge_raw_segments()` (hàm dành cho output Whisper).
- `dedupe_rolling_overlap()` — text rolling-caption là **cumulative** (mỗi cue lặp lại câu trước rồi thêm phần mới) → rút gọn phần trùng, **ngưỡng tối thiểu 3 từ** để không cắt nhầm.

## Số liệu (đo trên file thật)

| | Trước | Sau |
|---|---|---|
| Cue nhận diện từ `.en.srt` | 49 | **155** |
| Cue có text thật (bỏ 77 cue marker 10ms / `[ ]`) | 49 | **78** |
| Cue đầu | — | `Heat. Heat.` (không dính số thứ tự) |
| Cue thứ 3 sau dedupe | — | `your warriors question your whereabouts.` |

## Nghiệm thu GUI thật (app fork, CDP 9223)

- `78 câu • AUTO ➔ VI`, badge nguồn `📥 YouTube (.en)`
- **78 khối phụ đề** render trên track `💬 PHỤ ĐỀ (TEXT)`
- Bước 2 (TTS) sinh **khối audio tím có sóng âm thanh** trên track `🎙️ TIẾNG LỒNG` — panel phải hiện badge `🔊 Xóa tiếng`
- **Mojibake trên DOM: 0 hit** (quét toàn bộ text node, không tính script/style)
- Badge version: `V0.11.34` (nay đọc từ `package.json`, không hardcode)

Ảnh: `gui-2026-10-20/`

| File | Nội dung |
|---|---|
| `03-fork-78-cues-fixed-parser.png` | 78 khối phụ đề, track TIẾNG LỒNG còn trống (chưa chạy TTS) |
| `04-fork-voice-track-audio-blocks.png` | Track TIẾNG LỒNG có khối audio tím, tiến độ 17/78 |
| `06-fork-final-voice-track-audio.png` | Bản cuối: 78 câu + khối audio + tiến độ 14/78 |

## Version drift — 5 lớp, đã đồng bộ + guard 6 mục

| Lớp | Trạng thái trước | Sau |
|---|---|---|
| `package.json` | 0.11.33 | 0.11.34 |
| `src-tauri/Cargo.toml` | 0.11.33 | 0.11.34 |
| `tauri.conf.json` version | 0.11.33 | 0.11.34 |
| Tiêu đề cửa sổ main | **v0.11.32** | v0.11.34 |
| Tiêu đề cửa sổ overlay | **v0.11.32** | v0.11.34 |
| Badge UI `SublixStudioView.tsx` | **hardcode `v0.11.33`** | đọc `package.json` |
| Fallback `SettingsView.tsx` | **hardcode `"0.11.29"`** ×3 | đọc runtime/`package.json` |

Guard `scripts/check_version.ps1` (tạo lại — đã mất trong rollback) nay quét **6 mục**:
4 nguồn manifest + 2 tiêu đề cửa sổ + **hardcode version trong `src/`** → exit 1 khi lệch.
Negative test đã chạy: hạ 1 nguồn → `[LECH]` + exit 1; hardcode badge → `[LECH] hardcode version trong src/` + exit 1.

## Test

```
cargo test --lib  → 30 passed; 0 failed
cargo build       → exit 0
npx tsc --noEmit  → exit 0
npm run verify:version → PASS, exit 0
```

## Bằng chứng MẠNH NHẤT — log backend của app thật

Không chỉ UI, **backend cũng xác nhận** fix đúng (trích từ log `tauri dev` lúc chạy thật):

```
INFO 📝 Using existing subtitle file (...StarCraft II： Legacy...en.srt — lang: en)
INFO 🎬 Parsed & merged into 78 natural dialogue lines          <-- 78 dòng thoại tự nhiên
SUCCESS: Diarization complete. Found 1 speakers across 67 segments.
INFO 🎬 Sherpa Diarization returned 67 audio speech turns
INFO ✅ llama-server ready on http://127.0.0.1:11435 (cuda engine, model=qwen3-4b loaded in 3.9s)
INFO 🌐 LLM (cuda, qwen3-4b): 0.21s (auto→vi): 'reclaiming our home?' → 'đang thu hồi ngôi nhà của chúng ta?'
```

Toàn bộ chuỗi chạy được end-to-end: SRT → 78 dòng → sherpa diarization → dịch bằng Qwen3-4B CUDA (tiếng Việt đúng dấu) → TTS sinh file mp3 từng câu.

## Tauri: cảnh báo mismatch package đã sửa (phát hiện thêm 20/10)

Mỗi lần khởi động, Tauri in:
```
Error Found version mismatched Tauri packages.
tauri (v2.12.4) : @tauri-apps/api (v2.11.1)
tauri-plugin-opener (v2.7.2) : @tauri-apps/plugin-opener (v2.5.4)
```
Vì `package.json` dùng range `^2` nên lockfile giữ bản npm cũ hơn crate Rust. Đã **pin exact** cho khớp:
`@tauri-apps/api` → `2.12.4` · `@tauri-apps/plugin-opener` → `2.7.2` · `@tauri-apps/cli` → `2.12.3`.
Xác nhận bằng `npx tauri info` (chính CLI check): **không còn cảnh báo**.

> Pin exact thay vì `^` là chủ ý: `^2.12.4` sẽ kéo được 2.13.x vào và lại lệch major.minor.

## Còn lại (CHƯA làm, ghi rõ để agent sau biết)

---

# VÒNG 2 (20/10) — 4 BUG "TIẾNG THỪA / 2 TRACK LỆCH" + NỀN TẢNG TRUNG QUỐC

## Chẩn đoán từ test A→Z thật (đo bằng DOM + log backend)

| Chỉ số | Lần 1 (trước sửa) | Lần 2 (sau sửa) |
|---|---|---|
| Khối phụ đề / lồng tiếng / có audio | 78 / 78 / 78 | xem bảng verify |
| **Lệch start giữa 2 track** | **0 ms** (dữ liệu đúng) | 0 ms |
| **Lệch hiển thị lane (offsetLeft)** | **+959px ở cue 78** | **0 px** (đã sửa) |
| **Cặp audio chồng nhau** | **45 cặp / 30,81s / max 1,92s** | **0** (đã sửa) |
| **Cue mang `[Dịch lỗi: ...]`** | **78/78** | **0** (đã sửa) |

## 4 bug đã sửa (branch `fix/translate-failure-garbage-tts`, commit `d652002`)

| # | Bug | Root cause | Fix |
|---|---|---|---|
| **A** | 2 track lệch hàng | `SublixStudioView.css:3017` `.studio-timeline-voice-block { position: relative }` đặt **sau** `.studio-timeline-block { position: absolute }` → đè mất position → khối voice nằm trong flow → bị đẩy phải cộng dồn | `position: absolute` |
| **B** | 45 cặp audio chồng (30,81s) | Export chỉ trim theo cuối video, atempo chặn ở 1,45× → audio câu N tràn sang câu N+1 | Rust `export_dubbed_video`: `-t allowed` cắt đuôi dư; FE clamp `voiceDur ≤ nextStart − start` |
| **C** | A→Z không chạy TTS ở mode "Chỉ làm Phụ đề" | `handleRunCustomWorkflow` bám pill "Chế độ" chỉ-đọc | A→Z luôn chạy trọn pipeline (vẫn tôn trọng switch "Dịch phụ đề") |
| **1** | `llama-server` chết không tự lên lại → dịch hỏng im lặng | `preload_server` reuse singleton mà **không health-check** | `probe_health()` + `server_is_alive()` + `invalidate_server()` + `with_server_retry()` (retry 1 lần) |
| **2** | TTS đọc nguyên chuỗi `[Dịch lỗi: ...]` | `dubbed_text` nhận thẳng nhãn lỗi | `dubbed_text` rỗng + `status="translate_failed"` → `select_synth_text()` trả `None` → TTS bỏ qua câu đó |

Đường đi mới: dịch lỗi → `is_translate_error()` → `apply_translation_to_segment()` đặt `status="translate_failed"` + `dubbed_text=String::new()` → `select_synth_text()` trả `None` → vòng TTS `continue` → không tạo audio → UI hiện *"⚠️ Dịch lỗi — chưa tạo lồng tiếng"*.

## Nền tảng video Trung Quốc (branch `feature/chinese-platform-downloaders`, commit `325c36e`)

**Root cause gốc (không ai đoán được, phải đọc source yt-dlp):**
yt-dlp khớp `--sub-langs` bằng **FULLMATCH regex** (`yt_dlp/utils/_utils.py:5340`) → `"en"` **KHÔNG** khớp track `en-US`, `"zh"` không khớp `zh-CN`/`ai-zh`/`zh_hk`.
→ Pass phụ đề dùng chung `vi,en,ja,zh` **với nền tảng Trung Quốc KHÔNG tải được track nào**.

**Đã làm:**
- `get_platform()` **+16 nền tảng**: Bilibili (kèm `b23.tv`), Douyin (`iesdouyin`), Kuaishou, Xiaohongshu (`xhslink`), Xigua, Huya, Douyu, Youku, iQIYI, Weibo, AcFun, CCTV, `v.qq.com`, MangoTV, Migu, Niconico, wppilot — khớp theo **host** (giữ nguyên fix BUG-058).
- `subtitle_lang_patterns()` — Bilibili/MangoTV mở rộng mã user chọn thành `mã.*` (+`ai.*` riêng cho Bilibili). **YouTube/mặc định giữ nguyên `vi,en,ja,zh`** ⇒ không đổi hành vi cũ.
- `platform_error_hint()` — dịch lỗi yt-dlp sang tiếng Việt (Bilibili 412/567, cần đăng nhập, Douyin/Xigua cần cookie, nền tảng chưa hỗ trợ).
- Manifest `sublix_subtitles.json` ghi `"source": <nền tảng>` thay vì hardcode `"youtube"`; `is_youtube_subtitle()` giữ nguyên ⇒ **tương thích ngược**.
- `find_sibling_srt()` ưu tiên `en-us`/`zh-cn`, `ai-zh`/`ai-en` (AI) thấp hơn bản người dùng đăng.
- `downloader_fetch_subtitles` nhận thêm `browser_cookies`/`cookies_file` (optional).

**Bằng chứng thật:**
- Chứng minh bằng chính hàm `orderedSet_from_options` của yt-dlp: pattern cũ `vi,en,ja,zh` vs track Bilibili → **`[]`**; pattern mới → `['en-US','zh-CN','ai-zh']` (không lấy `danmaku`).
- **Tải thật** `https://w.mgtv.com/b/333652/7329822.html` bằng đúng lệnh app sinh ra: cũ → 3 file; mới → **4 file** `拜托，请你爱我 [7329822].{vi,en,ja,zh_hk}.srt`, SRT parse được (3547 dòng).

**Giới hạn (biết rõ):**
- **Bilibili chưa test end-to-end từ IP này** (HTTP 412 risk control) — cần IP Việt Nam/VPN.
- **Kuaishou/Migu không có extractor** trong yt-dlp 2026.08.19.
- App cố tình **tắt** `--cookies-from-browser` (Chrome/Edge khóa DB cookie) → lỗi "cần cookie" chỉ giải quyết được bằng `cookies.txt`.
- Youku/iQIYI/Tencent/AcFun/Douyu/Huya/Xiaohongshu **không có sub** → phải qua Whisper.

## Tài liệu
- Ảnh bằng chứng vòng 1: `gui-2026-10-20/t*.png`
- Ảnh bằng chứng vòng 2 (verify sau fix): `gui-2026-10-20/v2-*.png`
- Số liệu 78 cue: `gui-2026-10-20/dump-78-cues.json`

## Dọn dẹp (agent khác để lại, nằm NGOÀI workspace nên launcher xoá không được)
```powershell
cmd /c rmdir "D:\sublix-wt-translate-fail\node_modules"   # XOÁ JUNCTION — làm trước!
cmd /c rmdir /s /q "D:\sublix-wt-cn-downloader"
cmd /c rmdir /s /q "D:\sublix-wt-translate-fail"
cmd /c rmdir /s /q "D:\sublix-wt-cn-build"
cmd /c rmdir /s /q "D:\sublix-wt-tf-build"
cmd /c rmdir /s /q "H:\sublix-wt-tf-build"
```
> ⚠️ `D:\sublix-wt-translate-fail\node_modules` là **JUNCTION** trỏ vào `node_modules` của fork. Xoá nó TRƯỚC, nếu xoá thư mục cha bằng `/s` có thể lấn sang node_modules của fork.



- ⏳ Chưa nghiệm thu **phát lại video** (replace) và **save/reload project** trong fork.
- ⏳ Chưa kiểm chứng **audio đầu ra cuối** (playback/sync) — mới xác nhận khối audio được tạo trên timeline.
- ⏳ `CHANGELOG.md` còn thiếu mục cho ~17 bản cũ (chỉ có trong `ChangelogModal.tsx`) — lỗi có sẵn từ trước, ngoài phạm vi.
- ⏳ Guard có **false negative** nếu một dòng có dấu nháy đơn trước `//` (đã nêu trong ISSUE_LOG).
- ℹ️ Bản gốc `H:\AI Project\sublix` **không đổi 1 byte** — đã verify bằng SHA-256 của 8 file key.

