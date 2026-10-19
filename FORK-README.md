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
| `H:\AI Project\sublix` | **BẢN GỐC — ĐỪNG SỬA** | App đang chạy. `master` @ `51f73fe` |
| `H:\AI Project\sub-lix-fork-2026-10-19` | **FORK — sửa ở đây** | Branch `fix/voice-timeline-mojibake` @ `432f1ce` |
| `D:\sublix-fork-2026-10-19` | Bản sao dự phòng #2 (git thuần) | Cùng nội dung, khác ổ đĩa |
| `D:\sublix-history-2026-10-19.bundle` | Toàn bộ lịch sử git trong 1 file | 71.7 MB, copy đi đâu cũng được |
| `D:\sublix-fork-target-2026-10-19` | Thư mục build Rust của fork (junction) | Build tách khỏi bản gốc |

### Junction trong fork (dùng chung, chỉ đọc)

| Junction | → trỏ tới | Cảnh báo |
|---|---|---|
| `src-tauri\models` | `H:\AI Project\sublix\src-tauri\models` | **KHÔNG bấm "Tải model" trong fork** — sẽ ghi đè model của bản gốc |
| `src-tauri\binaries` | `H:\AI Project\sublix\src-tauri\binaries` | Tương tự — chỉ đọc |
| `models` | `H:\AI Project\sublix\models` | Tương tự |
| `src-tauri\target` | `D:\sublix-fork-target-2026-10-19` | **Build tách biệt hoàn toàn** ✅ |

Source code, `node_modules`, `dist`, git history → **hoàn toàn riêng**.

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

- **Ổ H: còn ~9 GB trống.** Bản gốc đang chiếm **101 GB**, trong đó `src-tauri/target` = **84.6 GB** (cache build tích luỹ nhiều phiên).
- `src-tauri/target` **xoá được an toàn** (không mất source) — sẽ giải phóng 84 GB nhưng lần build sau phải compile lại từ đầu.
- **Chưa tự xoá** — cần user đồng ý.
- Build của fork nằm ở D: (còn 122.8 GB) nên không đụng giới hạn này.
