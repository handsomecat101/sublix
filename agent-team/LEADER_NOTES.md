# LEADER_NOTES.md — Sổ tay Người Điều Phối (Leader only)

> **Ai đọc:** chỉ agent được PO (anh Tuấn) giao vai **điều phối** (tiếp quản khi người điều phối trước offline / hết quota).
> Thợ (worker) KHÔNG cần đọc file này — thợ làm theo spec được giao.
> **Không chép trạng thái task vào đây** — trạng thái nằm ở `PROJECT_STATE.md` (khoá/hoàn thành) và `AGENT_CHAT.md` (bàn giao, tin `@handoff` của người điều phối ở đầu file). File này chỉ ghi **cách điều phối + bài học**.
> Cập nhật lần cuối: 2026-10-24 — Claude Code (Opus 5.5).

---

## 1. Tiếp quản trong 5 phút

1. Đọc theo `AGENTS.md` (SOUL → PROJECT_STATE → AGENT_CHAT → ISSUE_LOG Quick Index) + file này.
2. Tìm tin `@handoff` mới nhất của người điều phối trong `AGENT_CHAT.md` → biết Orca Run đang dùng, commit nào chưa push, ai đang làm gì.
3. Xem hộp thư Orca: `orca orchestration check --run <run_id> --json` rồi `orca orchestration worker-list --run <run_id> --json` (ai `in_progress` / `succeeded` / `live`).
4. Đọc màn hình từng thợ: `orca terminal read --terminal <handle> --json` (đuôi terminal cho biết đang làm gì / kẹt chỗ nào).
5. `git status` + `git log origin/master..HEAD` → việc nào đã commit, việc nào còn trong working tree của ai.

## 2. Đội thợ & quy tắc giao việc (PO chốt)

| Thợ | Dùng cho | Ghi chú |
|---|---|---|
| **mcode** (MiniMax Code, M3.1-Flash) | Mặc định: code theo plan/spec, nghiên cứu, benchmark | Rất nhanh; tốt ở logic + test; yếu hơn ở hiệu năng React → người điều phối review phần đó. Có thể mở nhiều phiên (mcode #1/#2/#3) |
| **CommandCode** (`commandcode`, deepseek-v4-flash) | Mặc định: tính năng vừa, UI theo plan, review checklist | Cần bật **yolo/permission bypass**, nếu không sẽ đứng xin phép từng lệnh (kể cả lệnh báo cáo Orca) |
| **Claude Sonnet 5.5** | CHỈ việc khó thật (kiến trúc, bug khó mà thợ khác 2 lần không xong) | **Tốn usage — hạn chế tối đa** |
| **Claude Opus 5.5** | CHỈ phần **thẩm mỹ / logic thiết kế giao diện** + duyệt UI cuối so với mockup | Thợ khác code theo thiết kế của Opus |

- **Chia việc không chồng chéo (PO nhắc 2026-10-25):** trước khi giao, liệt kê file mỗi thợ được sửa; hai thợ KHÔNG cùng sửa 1 file. File dùng chung (`lib.rs`, `config.rs`, `tauri.ts`, `types.ts`) chỉ cho "thêm cuối file / thêm 1 field", dặn re-read trước khi sửa. Màn nằm trong file người khác đang sửa → làm component file mới trước, chờ người kia xong mới thay vào (mẫu: Live/Lịch sử trong SettingsView). Thợ xong → báo ngay thợ đang chờ file đó.
- Review của thợ yếu hơn cho thợ mạnh hơn chỉ là **tham khảo** — người điều phối tự kiểm chứng trước khi bắt sửa.
- PO bận nhiều dự án: **không** giao PO việc kiểm thử thủ công (nghe mù, chấm điểm…). Tự quyết bằng review công khai + số đo máy; chỉ hỏi PO quyết định thật sự của PO (ngân sách cloud, đường một chiều như tắt Smart App Control).
- Chất lượng phải thể hiện ở từng chi tiết cho người dùng (thanh tiến trình, ước tính thời gian, trạng thái rõ) — Zero-Button UX (không nút thừa), Cinema Dark, tiếng Việt có dấu.

## 3. Điều phối qua Orca — lệnh & bẫy

- Guide đúng phiên bản: `orca skills get orchestration` (+ `orca skills get orca-cli`).
- **Claude** là agent Orca nhận diện được: `orca orchestration worker-start --spec ... --agent claude --model <id> [--effort] --worktree "path:C:\AI Project\Sublix"`; giao tiếp trên terminal cũ: `--task <id> --terminal <handle>`.
- **mcode / CommandCode KHÔNG được `worker-start`/`--inject` nhận diện** → giao thủ công: `task-create` → `dispatch --task <id> --to <handle> --return-preamble --json` → ghi `result.preamble` ra file → `orca terminal send --terminal <handle> --text "Đọc file <path> và thực hiện đúng như trong đó" --enter`.
- Mở thợ mới cạnh thợ cũ (PO muốn gom 1 cửa sổ): `orca terminal split --terminal <handle> --command "mcode"`; đặt tên tab: `orca terminal rename`.
- **PowerShell 5.1**: dấu `"` trong `--spec` làm vỡ tham số → thay bằng `'`. `git commit -F -` với here-string hỏng → ghi message ra file rồi `-F file`. `git archive | tar` qua pipe hỏng nhị phân → `git archive -o x.tar HEAD`.
- **Heartbeat tốn token người điều phối** (mỗi tin = 1 lượt đọc lại toàn bộ hội thoại) → dặn thợ **không gửi heartbeat**, chỉ `status` / `question` / `escalation` / `worker_done`. Chờ bằng `orca orchestration check --run <id> --wait --types "worker_done,escalation,question,status"`.
- Tin đã đọc mà chưa **ack** sẽ bị trả lại (`replayed: true`) cho lần chờ sau, kể cả khi `--types` không có loại đó → đọc xong thì `orca orchestration check --run <id> --ack <deliveryId>` rồi mới chờ tiếp.
- Lệnh chờ chạy nền có thể **mồ côi** khi tool timeout → lần chờ sau lỗi `waiter_exists`: tìm tiến trình `orca.exe ... orchestration check --wait` (Get-CimInstance Win32_Process) và kill chính nó.
- Thợ báo xong → **tự kiểm chứng** → `worker-retain` (giữ terminal cho việc sau) hoặc `worker-release`. Thợ dừng giữa chừng không có dispatch (bị ai đó gõ thẳng vào terminal) → tạo dispatch mới để còn nhận `worker_done`.
- Tạm dừng toàn đội (PO đi vắng): gửi interrupt (Claude/CommandCode: Ctrl+C **một lần**; mcode: phím **Esc** — Ctrl+C lần 2 sẽ thoát mất ngữ cảnh). Làm tiếp: gõ "TIẾP TỤC task đang làm" vào terminal.
- Hết quota giữa chừng: thợ khác (khác nhà cung cấp) vẫn chạy và **có thể tự commit/push** nếu PO bảo — kiểm tra `git log` + reflog khi quay lại, không giả định.

## 4. Kiểm chứng & commit (người điều phối làm, thợ KHÔNG commit)

- Thợ báo "xong" ≠ đúng: tự chạy `cargo test --lib`, `npx tsc --noEmit`, `npx vite build`, `node --test "scripts/timeline-tests/*.test.ts"`; xem ảnh bằng chứng; đọc đoạn code then chốt; kiểm tra nguồn trích dẫn có thật (mcode từng tự tin dùng nguồn lạ — lần đó đúng, nhưng phải kiểm).
- Working tree thường lẫn việc của nhiều thợ → kiểm trên **bản sao HEAD sạch**: `git archive -o %TEMP%\x.tar HEAD` → giải nén vào `%TEMP%\...` → chép đè đúng file của task → junction `node_modules` (`mklink /J`) → tsc/build → **gỡ junction bằng `rmdir` TRƯỚC khi xoá thư mục** (xoá đệ quy qua junction = xoá node_modules thật).
- File trộn nhiều task (lib.rs, tauri.ts…): tách hunk bằng `git diff -U3` + lọc theo từ khoá rồi `git apply --cached` (KHÔNG dùng `-U0 --unidiff-zero`: từng chèn lệch vị trí làm hỏng build).
- Danh tính commit (máy dev chưa cấu hình git): không sửa config; `git -c user.name="Claude Code (dieu phoi)" -c user.email="claude@sublix.local" commit --author="<thợ đã viết> <x@local>" -F msg.txt`. PO = `Anh Tuấn <tuan@sublix.local>`.
- **Commit chủ động** theo từng task (không cần hỏi PO). **Push 1 lần** khi xong cả đợt + kiểm tra tổng (PO pull về máy nhà RTX 3090 để test).
- Mỗi mốc: ghi `@handoff` của người điều phối (3–7 dòng) lên đầu `AGENT_CHAT.md` + commit `agent-team/`.

## 5. Bẫy môi trường máy dev (Ryzen AI Max 390, không NVIDIA)

- **Smart App Control** (BUG-H09) chặn exe/dll vừa build hoặc exe copy đã patch → popup liên tục + verify GUI instance riêng thất bại. Giảm: mọi thợ dùng **chung** `CARGO_TARGET_DIR=%TEMP%\sublix-cc-target`. Tắt SAC là **đường một chiều** — chỉ PO quyết.
- **App dev của PO** chạy bằng `Chay-Sublix.bat` (Vite 1420, CDP 9223, HMR nạp code thợ đang sửa → có thể hiện lỗi tạm). Thợ **không được** `taskkill` theo tên / tắt app PO; verify trên instance riêng (CDP 9224+, Vite 1422+), chỉ tắt PID mình tạo. Nếu lỡ tắt: chạy lại `Chay-Sublix.bat` (Start-Process cửa sổ riêng).
- Lỗi `E0786 found invalid metadata files for crate sublix_lib` khi verify = nhiều thợ cùng build vào target chung một lúc (không phải lỗi code) → chạy lại sau. Script verify phải **chặn commit khi exit code ≠ 0** (đã lỡ commit 1 lần trước khi build lại pass).
- `cargo.exe` chạy lâu = app dev của PO (`cargo run`), không phải build của thợ — đừng chờ nó.
- API key (MiniMax `sk-cp-`, OpenRouter) nằm trong `%APPDATA%\com.sublix.desktop\sublix-config.json` (key TTS cloud ở `sublix-tts-keys.json`) — **không in ra** log/terminal/báo cáo. Màn hình Cài đặt cũ giữ state key rỗng → bấm Lưu có thể xoá key (đang sửa bằng `translate_options_set` + `configMerge`).
- Không tạo thư mục trong repo khi verify (đã có sự cố thư mục `%D%` chứa junction trỏ node_modules thật).
