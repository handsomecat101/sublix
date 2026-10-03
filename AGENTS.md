# AGENTS.md — Sublix Multi-Agent & Multi-IDE Auto-Boot (v1.1)

> File này giúp mọi AI Agent (Antigravity, Claude Code, Cursor, Codex, OpenCode, Windsurf...) tự động nắm bắt context dự án ngay khi mở thư mục `sublix` mà không cần người dùng giải thích lại từ đầu.
>
> 📁 **Toàn bộ hệ thống quản trị và làm việc của Agent nằm gọn bên trong thư mục:**  
> 👉 [`agent-team/`](./agent-team/)

---

## 🚀 1. BƯỚC KHỞI ĐỘNG BẮT BUỘC (Mỗi Phiên Mới / Đổi IDE)

Trước khi thực hiện bất kỳ lệnh code hoặc sửa lỗi nào, bạn **BẮT BUỘC** đọc nhanh 4 file trong thư mục `agent-team/` theo đúng thứ tự:

1. **[`agent-team/SOUL.md`](./agent-team/SOUL.md)** — Bản đồ cố định: Kiến trúc (Tauri v2 + Rust + React 19 + CUDA Whisper + MiniMax-M3 + Ollama 27B), models, quy tắc bất biến.
2. **[`agent-team/PROJECT_STATE.md`](./agent-team/PROJECT_STATE.md)** — Bảng Dashboard: Tiến độ hiện tại, bản build mới nhất, task nào đang khóa (`🟡 In Progress`).
3. **[`agent-team/AGENT_CHAT.md`](./agent-team/AGENT_CHAT.md)** — Bảng bàn giao ca trực: Đọc 5–8 tin mới nhất xem phiên trước vừa làm gì, files nào đã sửa, cần làm gì tiếp.
4. **[`agent-team/ISSUE_LOG.md`](./agent-team/ISSUE_LOG.md)** — Sổ tay miễn dịch lỗi: Đọc **Bảng Tra Cứu Nhanh (Quick Index)** ở đầu file (5 giây nắm trọn các bẫy kỹ thuật Windows, CUDA, MiniMax API, PowerShell encoding).

---

## 🔒 2. QUY TRÌNH LÀM VIỆC & KHÓA TASK

1. **Nhận Task (Bước 1):** Ghi ngay task đang làm vào mục `🟡 Task Đang Làm (In Progress - Lock)` trong [`agent-team/PROJECT_STATE.md`](./agent-team/PROJECT_STATE.md) để tránh Agent ở IDE khác làm trùng hoặc sửa đè file.
2. **Quy tắc Code:**
   - **Rust Backend**: Không dùng `unwrap()` trong production code (`?` hoặc `anyhow/context` only). Log qua `tracing`. Module < 300 dòng.
   - **Frontend**: Strict TypeScript, functional components, CSS scoped/Tailwind.
3. **Bàn giao sau khi hoàn thành (Bước 4):**
   - Chuyển task sang mục `✅ Task Hoàn Thành` trong `agent-team/PROJECT_STATE.md` (**đúng 1 dòng**).
   - Thêm 1 tin ngắn (**3–7 dòng**) với tag `@done` hoặc `@handoff` vào đầu `agent-team/AGENT_CHAT.md`.
   - Nếu phát hiện bug mới: Ghi vào `agent-team/ISSUE_LOG.md` (cập nhật Quick Index). Không chép lặp phân tích dài dòng sang `agent-team/AGENT_CHAT.md`.

---

## ✂️ 3. QUY TẮC TIẾT KIỆM TOKEN & ZERO-DUPLICATION

- **Mỗi thông tin chỉ nằm ở ĐÚNG 1 NƠI**:
  - Kiến trúc cố định: Chỉ nằm ở `agent-team/SOUL.md`.
  - Tiến độ task: Chỉ nằm ở `agent-team/PROJECT_STATE.md` (1 dòng/task).
  - Bàn giao ca trực: Chỉ nằm ở `agent-team/AGENT_CHAT.md` (3–7 dòng/tin, rolling tối đa 8 tin).
  - Phân tích chi tiết lỗi & root cause: Chỉ nằm ở `agent-team/ISSUE_LOG.md`.
- **Tự dọn dẹp `agent-team/AGENT_CHAT.md`**: Khi thêm tin mới khiến file vượt quá 8 tin nhắn, chủ động xóa bớt các tin `@done` cũ ở dưới đáy file.

---

## 📁 Tài Liệu Trong Thư Mục `agent-team/`
- [`agent-team/README.md`](./agent-team/README.md) — Tổng quan bộ Collaborator Kit v1.1
- [`agent-team/SOUL.md`](./agent-team/SOUL.md) — Kiến trúc & Ràng buộc cốt lõi
- [`agent-team/PROJECT_STATE.md`](./agent-team/PROJECT_STATE.md) — Bảng trạng thái Tasks
- [`agent-team/AGENT_CHAT.md`](./agent-team/AGENT_CHAT.md) — Handoff Board
- [`agent-team/ISSUE_LOG.md`](./agent-team/ISSUE_LOG.md) — Quick Index & Sổ tay lỗi
- [`agent-team/QUY_TRINH.md`](./agent-team/QUY_TRINH.md) — Quy trình 6 bước chi tiết
- [`agent-team/GOVERNANCE.md`](./agent-team/GOVERNANCE.md) — Luật phối hợp & An toàn release
- [`docs/SPEC_AI_DUBBING_AND_LLM.md`](./docs/SPEC_AI_DUBBING_AND_LLM.md) — Đặc tả kỹ thuật Pipeline Lồng tiếng & Scriptwriting AI SOTA
- [`docs/HUONG_DAN_HE_THONG_LONG_TIENG_AI.md`](./docs/HUONG_DAN_HE_THONG_LONG_TIENG_AI.md) — Hướng dẫn kỹ thuật & vận hành Studio Lồng tiếng AI (Voice models, Ducking, Demucs, MiniMax-M3)
