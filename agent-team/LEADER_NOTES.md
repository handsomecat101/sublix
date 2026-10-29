# LEADER_NOTES.md — Sổ tay Người Điều Phối (Leader only)

> **Ai đọc:** chỉ agent được PO (anh Tuấn) giao vai **điều phối** (tiếp quản khi người điều phối trước offline / hết quota).
> Thợ (worker) KHÔNG cần đọc file này — thợ làm theo spec được giao.
> **Không chép trạng thái task vào đây** — trạng thái nằm ở `PROJECT_STATE.md` (khoá/hoàn thành) và `AGENT_CHAT.md` (bàn giao, tin `@handoff` của người điều phối ở đầu file). File này chỉ ghi **cách điều phối + bài học**.
> Cập nhật lần cuối: 2026-10-26 — Claude Code (Opus 5.5).
>
> **PO chỉ cần nói 1 câu:** *"Bạn là người điều phối dự án Sublix. Đọc `agent-team/LEADER_NOTES.md` và làm theo mục 0."* — mọi thứ còn lại nằm trong file này.

---

## 0. Khởi động điều phối (đọc xong là làm — không cần PO giải thích)

**Môi trường của dự án này:** điều phối nhiều agent qua **Orca** (app quản lý terminal/agent). Bạn ra lệnh cho thợ bằng CLI `orca` từ shell của bạn. Máy dev Windows 11, PowerShell 5.1, Ryzen AI Max 390 (không NVIDIA), **Smart App Control bật** (chặn exe mới build — cách vượt để kiểm giao diện ở §4, bẫy máy ở §5).

0. **Leader KHÔNG phải Claude Code** (vd GPT qua Codex CLI / OpenCode): mọi thứ cần biết đều nằm trong repo — file này + @handoff đầu AGENT_CHAT.md + 	ools/. Trí nhớ riêng của leader cũ không cần.
1. **Nạp hướng dẫn Orca đúng phiên bản:** `orca skills get orchestration` (và `orca skills get orca-cli` khi cần lệnh terminal). Đọc lướt phần dispatch / check / worker-done.
2. **Đọc boot dự án:** `AGENTS.md` → SOUL → PROJECT_STATE → **tin `@handoff` mới nhất của điều phối ở đầu `AGENT_CHAT.md`** (Orca Run id, commit chưa push, ai đang làm gì, việc còn lại) → ISSUE_LOG Quick Index.
3. **Xem đội đang có:** `orca terminal list --json` (tiêu đề tab/ô cho biết thợ nào; **không mở thêm nếu đã có** — xem §2 "Đội hình"). Hộp thư: `orca orchestration check --run <run_id> --json` (đọc xong phải `--ack <deliveryId>`).
4. **Đọc màn hình thợ đang làm:** `orca terminal read --terminal <handle> --json` → `result.terminal.tail`.
5. **Git:** `git status` + `git log --oneline origin/master..HEAD` (commit local chưa push).
6. **Báo PO 3–5 dòng tiếng Việt** tình hình, rồi làm tiếp theo vòng dưới.

**Vòng làm việc chuẩn (mỗi việc):**
1. Viết spec ngắn vào scratchpad: mục tiêu · **danh sách file được sửa / cấm sửa** · đọc mục nào trong docs · test bắt buộc · "KHÔNG build/chạy app, KHÔNG commit, KHÔNG heartbeat".
2. Giao: thợ không phải Claude → `agent-team/tools/dispatch.ps1 -Run <run> -Terminal <handle> -Id TSK-… -Spec <file>`; thợ Claude (Sonnet/Opus) → `orca orchestration worker-start --agent claude --model <id> --worktree "path:<repo>" …` (lần sau giao tiếp trên terminal cũ bằng `dispatch.ps1`).
3. Chờ (chạy nền, KHÔNG poll): `orca orchestration check --run <run> --wait --types "worker_done,escalation,question" --timeout-ms 3600000 --json`.
4. Thợ báo xong → **đọc code then chốt** → `git add` đúng file của việc đó → `agent-team/tools/verify-clean.ps1 [-Rust]` → đụng giao diện thì kiểm app thật bằng `agent-team/tools/gui-app.ps1` + CDP → mọi exit code = 0 mới commit (danh tính commit ở §4).
5. Mốc lớn: `@handoff` 3–7 dòng lên đầu `AGENT_CHAT.md` + commit `agent-team/`. Push **chỉ khi PO nói** ("push đi").

## 1. Cách PO (anh Tuấn) muốn làm việc — đã chốt, không hỏi lại

- Trả lời **tiếng Việt**, ngắn, không thuật ngữ thừa (PO không đọc code). Chủ động làm, chỉ hỏi khi thật sự là quyết định của PO (ngân sách, đường một chiều như tắt Smart App Control, push).
- **Commit chủ động** sau khi kiểm chứng (không cần hỏi). **Push 1 lần/đợt và phải có PO đồng ý.**
- **Không giao PO kiểm thử thủ công** (nghe mù, chấm điểm…) — tự quyết bằng review công khai + số đo máy.
- **Không tin "xong" của thợ:** luôn tự kiểm bản sạch + đọc code then chốt + kiểm app thật nếu đụng UI. PO xác nhận cách này làm lỗi lặt vặt giảm hẳn.
- **Đội hình ổn định:** KHÔNG tự đóng cửa sổ thợ, KHÔNG mở agent mới cho mỗi việc — giao việc mới vào đúng phiên đang có. Phiên mcode đã đóng thì mở lại bằng `mcode --session` (chọn phiên cũ, **không** chọn phiên "· running").
- **Mỗi tab Orca tối đa 3–4 ô agent**; cần thêm agent ⇒ **tab mới** (`orca terminal create --worktree "path:<repo>" --title "…" --command "…"`), đặt tên rõ. PO tự chia cỡ ô.
- **Không heartbeat** (mỗi tin = 1 lượt đọc lại hội thoại = tốn token).
- **Nghỉ lâu (qua đêm) ⇒ PO nên mở phiên điều phối MỚI** thay vì gọi lại phiên cũ (bộ đệm hết hạn ⇒ đọc lại cả phiên rất tốn). Vì vậy `@handoff` + file này phải luôn đủ để phiên mới làm tiếp.
- Bảo mật: không in API key (`%APPDATA%\com.sublix.desktop\*.json`); không `taskkill` theo tên / tắt app PO; không tự `/login` tài khoản thợ (nhờ PO).

## 2. Đội thợ & quy tắc giao việc (PO chốt)

| Thợ | Dùng cho | Ghi chú |
|---|---|---|
| **mcode** (MiniMax Code, M3.1-Flash) | Mặc định: code theo plan/spec, nghiên cứu, benchmark | Rất nhanh; tốt ở logic + test; yếu hơn ở hiệu năng React → người điều phối review phần đó. Có thể mở nhiều phiên (mcode #1/#2/#3) |
| **CommandCode** (`commandcode`, deepseek-v4-flash) | Mặc định: tính năng vừa, UI theo plan, review checklist | Cần bật **yolo/permission bypass**, nếu không sẽ đứng xin phép từng lệnh (kể cả lệnh báo cáo Orca) |
| **Gemini 3.8 Flash** (Antigravity CLI `agy`) | **Mọi việc nghiên cứu / search web** (so sánh model, benchmark công khai, nguồn) — PO chốt 2026-10-25 | Mở bằng `orca terminal split --command "agy --dangerously-skip-permissions"` (**chế độ yolo — PO chốt 2026-10-28**, không thì nó dừng hỏi quyền từng file/lệnh); giao thủ công như mcode. Chỉ cho ghi file `docs/` mới. Lỡ mở thiếu cờ: Ctrl+C ×3 → `agy --conversation=<id nó in ra> --dangerously-skip-permissions` (giữ ngữ cảnh) |
| **OpenCode** (`opencode`, mặc định DeepSeek V4.1 Flash **Free**) | Module gói gọn theo spec, test, thuật toán | PO duyệt dùng 2026-10-25; làm kỹ (vd tabShortcuts 30 test). Báo bằng `orca orchestration worker-done` |
| **Gemini 3.8 Flash** — cũng **code** tốt | PO 2026-10-25: code nhanh, quota nhiều ⇒ chia cả việc code | Benchmark: yếu ở việc dài hơi (Terminal-Bench 4.0 ~19%) ⇒ giao việc gọn; báo cáo nghiên cứu phải soát nguồn (từng bịa link/nhầm cột) |
| **Claude Sonnet 5.5** | Việc khó/quan trọng (kiến trúc, luồng trạng thái, P2 hàng đợi) — PO cho phép "cái nào quan trọng thì giao Sonnet" | Tốn usage — chỉ khi xứng đáng |
| **Claude Opus 5.5** | CHỈ phần **thẩm mỹ / logic thiết kế giao diện** + duyệt UI cuối so với mockup | Thợ khác code theo thiết kế của Opus |

**Đánh giá thực chiến (cập nhật sau mỗi đợt — chi tiết benchmark: `docs/AGENT_MODEL_BENCHMARKS_2026.md`):**
- OpenCode: chắc tay nhất cho module gói gọn có test (test bằng dữ liệu thật, tự phát hiện bẫy API). Hay để quên file tạm.
- mcode: kỹ, báo cáo trung thực, nhưng chậm (15–20 phút/việc vừa); UI tab Khám phá có 4 lỗi P1 ⇒ luôn cho Opus duyệt ảnh app thật. **Thanh dưới "5h N%" = quota 5 giờ còn lại** — về 0% là mcode đứng im giữa việc (không báo lỗi) ⇒ giao phần còn lại cho OpenCode kèm đặc tả gốc + trạng thái `git diff`.
- Gemini: code UI theo mockup nhanh + khớp; nghiên cứu hay đưa nguồn/model CŨ và ngày không căn cứ ⇒ soát kỹ; từng lỡ `run-use` chiếm vai điều phối.

> ⚠️ **PO chốt 2026-10-28: MỌI thợ phải mở ở chế độ TỰ DUYỆT (yolo)** — nếu không, leader vắng là thợ đứng chờ và PO phải ngồi bấm duyệt. Lệnh mở:
> - Claude (Opus/Sonnet): `claude --model claude-opus-5-5 --dangerously-skip-permissions` (thanh dưới phải hiện **"bypass permissions on"**). Lỡ mở thiếu: `/exit` → `claude --resume <id nó in ra> --model … --dangerously-skip-permissions` (giữ ngữ cảnh).
> - Gemini: `agy --dangerously-skip-permissions` · CommandCode: bật yolo/bypass · mcode / OpenCode: kiểm tra không có hộp xin phép sau lệnh đầu tiên.
> - **Sau khi giao việc 30–60 s: `orca terminal read` kiểm tra không có "Do you want to proceed?" / "Allow…?"**.

- **Khi mcode quá tải** (gói free chậm ~20–40 tok/s): chia việc sang CommandCode / OpenCode / Gemini.
- **Đội hình hiện tại** (handle) ghi trong tin `@handoff` mới nhất của điều phối — không ghi ở đây vì đổi theo phiên.

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
- **mcode tự cập nhật ⇒ mọi phiên bị đăng xuất** (lỗi `50112` / "Sign in with /login", thợ đứng ở dấu nhắc giữa chừng): đọc terminal các thợ khi lâu không có tin; nhờ PO `/login` (đăng nhập tài khoản — người điều phối KHÔNG tự làm), xong gõ "TIẾP TỤC task đang làm …" vào từng terminal. Việc dở không mất.
- Hết quota giữa chừng: thợ khác (khác nhà cung cấp) vẫn chạy và **có thể tự commit/push** nếu PO bảo — kiểm tra `git log` + reflog khi quay lại, không giả định.

## 4. Kiểm chứng & commit (người điều phối làm, thợ KHÔNG commit)

- Thợ báo "xong" ≠ đúng: tự chạy `cargo test --lib`, `npx tsc --noEmit`, `npx vite build`, `node --test "scripts/timeline-tests/*.test.ts"`; xem ảnh bằng chứng; đọc đoạn code then chốt; kiểm tra nguồn trích dẫn có thật (mcode từng tự tin dùng nguồn lạ — lần đó đúng, nhưng phải kiểm).
- Working tree thường lẫn việc của nhiều thợ → kiểm trên **bản sao HEAD sạch**: `git archive -o %TEMP%\x.tar HEAD` → giải nén vào `%TEMP%\...` → chép đè đúng file của task → junction `node_modules` (`mklink /J`) → tsc/build → **gỡ junction bằng `rmdir` TRƯỚC khi xoá thư mục** (xoá đệ quy qua junction = xoá node_modules thật).
- File trộn nhiều task (lib.rs, tauri.ts…): tách hunk bằng `git diff -U3` + lọc theo từ khoá rồi `git apply --cached` (KHÔNG dùng `-U0 --unidiff-zero`: từng chèn lệch vị trí làm hỏng build).
- Danh tính commit (máy dev chưa cấu hình git): không sửa config; `git -c user.name="Claude Code (dieu phoi)" -c user.email="claude@sublix.local" commit --author="<thợ đã viết> <x@local>" -F msg.txt`. PO = `Anh Tuấn <tuan@sublix.local>`.
- **Commit chủ động** theo từng task (không cần hỏi PO). **Push 1 lần** khi xong cả đợt + kiểm tra tổng (PO pull về máy nhà RTX 3090 để test).
- Mỗi mốc: ghi `@handoff` của người điều phối (3–7 dòng) lên đầu `AGENT_CHAT.md` + commit `agent-team/`.
- **Kiểm giao diện trên app THẬT dù Smart App Control chặn exe mới** (2026-10-25 — bắt được P1 tab hỏng nặng mà 345 test vẫn xanh):
  - Vite từ working tree: `node node_modules/vite/bin/vite.js --port 1420 --strictPort` (Start-Process -PassThru, ghi PID).
  - `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9226'` rồi chạy **exe cũ đã từng chạy được** (vd `%TEMP%\sublix-cc-target\debug\sublix.exe`). Exe nạp devUrl `localhost:1420` ⇒ thấy giao diện mới nhất.
  - Điều khiển qua CDP (Node ≥ 22: `fetch` + `WebSocket`, chọn trang URL có `1420` và KHÔNG có `overlay`). Chụp ảnh, đo kích thước, bắt lỗi console.
  - Giới hạn: lệnh backend mới hơn exe thì không có; app dùng config thật của PO ⇒ không bấm Lưu/ô key; đổi khoá localStorage ⇒ sao lưu trước. Xong chỉ tắt PID mình tạo (kể cả tiến trình con của Vite).
- Thợ (mcode, CommandCode, OpenCode, Gemini) **không build/chạy app** — ghi rõ trong spec để khỏi mất hàng giờ vì SAC. Script verify gọi cargo bằng đường dẫn đầy đủ (`%USERPROFILE%\.cargo\bin\cargo.exe`) — PowerShell con không có cargo trong PATH và `$LASTEXITCODE` cũ từng làm "lỗi" thành "pass".

## 5. Bẫy môi trường máy dev (Ryzen AI Max 390, không NVIDIA)

- **Smart App Control** (BUG-H09) chặn exe/dll vừa build hoặc exe copy đã patch → popup liên tục + verify GUI instance riêng thất bại. Giảm: mọi thợ dùng **chung** `CARGO_TARGET_DIR=%TEMP%\sublix-cc-target`. Tắt SAC là **đường một chiều** — chỉ PO quyết.
- **App dev của PO** chạy bằng `Chay-Sublix.bat` (Vite 1420, CDP 9223, HMR nạp code thợ đang sửa → có thể hiện lỗi tạm). Thợ **không được** `taskkill` theo tên / tắt app PO; verify trên instance riêng (CDP 9224+, Vite 1422+), chỉ tắt PID mình tạo. Nếu lỡ tắt: chạy lại `Chay-Sublix.bat` (Start-Process cửa sổ riêng).
- Lỗi `E0786 found invalid metadata files for crate sublix_lib` khi verify = nhiều thợ cùng build vào target chung một lúc (không phải lỗi code) → chạy lại sau. Script verify phải **chặn commit khi exit code ≠ 0** (đã lỡ commit 1 lần trước khi build lại pass).
- `cargo.exe` chạy lâu = app dev của PO (`cargo run`), không phải build của thợ — đừng chờ nó.
- API key (MiniMax `sk-cp-`, OpenRouter) nằm trong `%APPDATA%\com.sublix.desktop\sublix-config.json` (key TTS cloud ở `sublix-tts-keys.json`) — **không in ra** log/terminal/báo cáo. Màn hình Cài đặt cũ giữ state key rỗng → bấm Lưu có thể xoá key (đang sửa bằng `translate_options_set` + `configMerge`).
- Không tạo thư mục trong repo khi verify (đã có sự cố thư mục `%D%` chứa junction trỏ node_modules thật).

## 6. Lời khuyên vận hành (rút từ thực tế — đọc 1 lần, áp dụng mãi)

**Giao việc**
- **Mỗi run chỉ có 1 điều phối** (`orca orchestration run-show --id <run>` ⇒ `coordinator_handle`). Thợ lỡ chạy `run-use` sẽ **chiếm vai điều phối** (2026-10-28 Gemini làm vậy khi cửa sổ đổi handle ⇒ `task-create` của leader báo `consumer_fenced`). Sửa: leader chạy `orca orchestration run-use --id <run>`; spec ghi rõ "thợ KHÔNG chạy run-use/run-create". Muốn có **trợ lý điều phối** việc phụ ⇒ cho họ `run-create` run RIÊNG + nhóm thợ riêng, khóa file qua PROJECT_STATE.
- **Spec càng rõ, thợ rẻ càng làm tốt.** Mỗi spec: mục tiêu 1 câu · file được/cấm sửa · mục docs phải đọc · ca test bắt buộc · lệnh tự kiểm · "không build/chạy app, không commit, không heartbeat". Thiếu danh sách file ⇒ thợ sửa lan sang file người khác.
- **Tách "lõi thuần" ra trước.** Việc lớn trên 1 file to (vd view 9.000 dòng) phải làm tuần tự — nhưng phần logic thuần (module mới + test node) giao song song cho thợ khác ngay. Khi file to rảnh, phần còn lại chỉ là "nối".
- **Việc vài dòng thì leader tự sửa** — giao + kiểm còn tốn hơn.
- **Thợ đang làm dở thì để làm nốt**; chuyển việc giữa chừng tốn hơn đợi. Thợ chậm/quá tải ⇒ việc MỚI giao thợ khác.
- **Đặt "không chạy app" vào spec** nếu máy có rào cản — thợ từng mất 2,5 giờ cố chụp ảnh bị chặn.

**Kiểm chứng**
- **"Xong" của thợ ≠ đúng.** Lỗi hay lọt nhất (test không bắt): ghi nhầm file khi người dùng đổi dự án giữa lúc chờ (debounce), cache "dính" dữ liệu lần đầu, vòng gọi lặp vô hạn khi state cập nhật, dùng tuỳ chọn công cụ đã bị bỏ ở bản mới, cờ "đang chạy" kẹt ở một nhánh `return` sớm, listener chạy cả khi màn hình đang ẩn.
- **Test xanh ≠ giao diện đúng.** Đụng UI ⇒ chạy app thật, **đo kích thước + chụp ảnh + bắt lỗi console** (từng có: cả màn hình bị kéo dài 33.000 px vì thiếu `min-width: 0` — 345 test vẫn xanh).
- **Kiểm trên bản sạch của index**, không trên working tree (working tree luôn lẫn việc dở của thợ khác).
- **Báo cáo nghiên cứu của model Flash phải soát nguồn**: từng gặp link chỉ là trang chủ, số liệu gán nhầm cột, con số không có nguồn. Tự tra 2–3 số quan trọng nhất trước khi đưa PO.
- Script kiểm **phải chặn khi exit code ≠ 0** và in số liệu thật (số test pass/fail) — đừng chỉ in "OK".

**Token & chi phí**
- **Không heartbeat; chờ bằng 1 lệnh `check --wait` chạy nền** (không poll định kỳ — PO từng thấy báo cáo 10 phút/lần toàn tin cũ, vô ích).
- **Leader không gõ code tính năng** — chỉ spec, đọc code then chốt, kiểm, commit. Model mạnh đáng tiền nhất ở 2 đầu: spec chính xác trước và review sau.
- **Nghỉ lâu ⇒ phiên leader mới** (bộ đệm hội thoại chỉ sống ~1 giờ; gọi lại phiên dài sau khi ngủ = đọc lại toàn bộ với giá đầy đủ). Muốn vậy, `@handoff` phải đủ để phiên mới làm tiếp — viết nó ở mỗi mốc.
- Đọc file lớn bằng tìm kiếm / đọc đoạn, không đọc cả file.

**Con người & giao tiếp**
- PO thường không đọc code ⇒ báo cáo bằng **kết quả người dùng thấy** ("bấm Dừng thì về Sẵn sàng"), không bằng tên hàm.
- **Trung thực về giới hạn:** cái gì chưa kiểm được (không chạy được app, chưa đo RAM, số liệu chưa có nguồn) phải nói rõ.
- **Không tự quyết việc một chiều** (tắt tính năng bảo mật, xoá dữ liệu, push/release, công khai repo) — hỏi PO 1 câu ngắn kèm đề xuất.
- Nhận xét của PO về cách làm việc ⇒ ghi ngay vào mục 1 của file này (không chỉ nhớ trong đầu).
