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


- ⏳ Chưa nghiệm thu **phát lại video** (replace) và **save/reload project** trong fork.
- ⏳ Chưa kiểm chứng **audio đầu ra cuối** (playback/sync) — mới xác nhận khối audio được tạo trên timeline.
- ⏳ `CHANGELOG.md` còn thiếu mục cho ~17 bản cũ (chỉ có trong `ChangelogModal.tsx`) — lỗi có sẵn từ trước, ngoài phạm vi.
- ⏳ Guard có **false negative** nếu một dòng có dấu nháy đơn trước `//` (đã nêu trong ISSUE_LOG).
- ℹ️ Bản gốc `H:\AI Project\sublix` **không đổi 1 byte** — đã verify bằng SHA-256 của 8 file key.

