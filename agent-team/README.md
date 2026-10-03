<div align="center">

![Collaboration Kit Banner](./docs/banner.png)

# 🤖 Agent Collaborator Kit

**Multi-Agent & Multi-IDE Workflow Framework cho AI Teams**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/handsomecat101/agent-team)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Made with Markdown](https://img.shields.io/badge/Made%20with-Markdown-1f425f.svg)](http://commonmark.org)
[![Agents](https://img.shields.io/badge/Works%20with-Antigravity%20%7C%20Claude%20%7C%20Cursor%20%7C%20Codex%20%7C%20OpenCode-blueviolet)](https://github.com/handsomecat101/agent-team)

*Bộ khung Markdown siêu nhẹ giúp bạn nhảy qua lại tự do giữa mọi IDE/AI Agent trên cùng một dự án — hiểu ngay context, không trùng lặp, không tốn token.*

[📖 Xem Tài Liệu](#-tài-liệu-chi-tiết) · [🚀 Bắt Đầu Nhanh](#-bắt-đầu-nhanh) · [✂️ Quy Tắc Tiết Kiệm Token](#️-quy-tắc-vàng-chống-trùng-lặp--tiết-kiệm-token) · [🔄 Quy Trình 6 Bước](#-workflow-6-bước-chuẩn)

</div>

---

## 🎯 Vấn Đề Cần Giải Quyết

Khi làm việc với nhiều AI Agents hoặc đổi qua lại giữa nhiều IDE khác nhau (Antigravity, Claude Code, Cursor, Codex, OpenCode, Windsurf...) trên cùng một dự án, bạn thường gặp:

| Vấn đề | Biểu hiện |
|--------|-----------|
| 🔒 **Bị trói vào 1 IDE** | Mỗi IDE lưu lịch sử chat ở một nơi riêng; đổi sang IDE khác là AI mới như "tờ giấy trắng" |
| 🧠 **AI quên context** | Mỗi phiên mới phải giải thích lại dự án từ đầu |
| 💥 **Conflict & Overlap** | Hai agents sửa đè một file hoặc làm trùng cùng một việc |
| 🔁 **Lặp lại lỗi cũ** | Agent ở IDE mới không biết lỗi cũ, sửa code làm tái phát bug đã fix |
| 💸 **Phình to Context (Tốn Token)** | Các Agent viết báo cáo dài dòng, chép lặp lại cùng một nội dung vào nhiều file |

**Agent Collaborator Kit (v1.1)** giải quyết triệt để tất cả những điều này bằng hệ thống Markdown "Bộ nhớ chung" kèm **Quy tắc Chống Trùng Lặp (Zero-Duplication)**.

---

## 📂 Cấu Trúc Bộ Kit

```
agent-team/
│
├── 📄 README.md                  ← Tài liệu tổng quan (bạn đang đọc)
├── 🚀 AGENTS.md                  ← File Auto-Boot tự động nhắc quy tắc cho mọi IDE
│
├── 🧬 SOUL.md                    ← Bản đồ cố định: Kiến trúc, Tech Stack, Quy tắc cứng
├── 📊 PROJECT_STATE.md           ← Bảng Dashboard: Tiến độ & Danh sách Task (1 dòng/task)
├── 💬 AGENT_CHAT.md              ← Bảng bàn giao ca trực: Giữ 5-8 tin ngắn gọn mới nhất
├── 🐛 ISSUE_LOG.md               ← Sổ tay miễn dịch lỗi: Bảng Quick Index + Root Cause
│
├── ⚖️  GOVERNANCE.md              ← Luật phối hợp, phân quyền & an toàn Production
├── 📋 QUY_TRINH.md               ← Quy trình 6 bước chuẩn & chống trùng lặp token
├── ✅ PROJECT_SETUP_CHECKLIST.md ← Checklist câu hỏi khởi tạo dự án mới
├── 📸 SCREENSHOTS.md             ← Quy chuẩn lưu ảnh chụp màn hình bằng chứng lỗi
├── 📝 CHANGELOG.md               ← Lịch sử nâng cấp bộ Kit & Hướng dẫn cho Maintainer Agent
│
└── 📁 docs/                      ← Ảnh minh họa
    ├── banner.png
    └── workflow.png
```

---

## ✂️ Quy Tắc Vàng: Chống Trùng Lặp & Tiết Kiệm Token

Để mỗi lần mở phiên mới hoặc đổi IDE, Agent chỉ mất **~1.500 – 2.000 token (vài giây)** là hiểu trọn dự án mà không phải đọc những bài văn lặp đi lặp lại, bộ kit áp dụng nguyên tắc **"Mỗi thông tin chỉ nằm ở ĐÚNG 1 NƠI"**:

| File | Vai trò DUY NHẤT (Không lấn sân) | Giới hạn độ dài chuẩn |
|------|----------------------------------|-----------------------|
| **`SOUL.md`** | Kiến trúc, Tech Stack, Domain/Port, Quy tắc bất biến | ~1.5 KB (Cố định) |
| **`PROJECT_STATE.md`** | Bảng Dashboard trạng thái Task (`Đang làm`, `Chờ`, `Hoàn thành`) | **1 dòng / task** (Không ghi nhật ký theo giờ) |
| **`AGENT_CHAT.md`** | Bảng tin bàn giao ca trực giữa các IDE (`@done`, `@handoff`, `@assign`) | **3 – 7 dòng / tin**, chỉ giữ **5 – 8 tin gần nhất** |
| **`ISSUE_LOG.md`** | Bảng **Quick Index** ở đầu file + Chi tiết lỗi kỹ thuật cần nhớ | **5 – 8 dòng / lỗi** |

> 💡 **Cơ chế tự làm sạch:** Khi `AGENT_CHAT.md` vượt quá 8 tin nhắn, Agent tiếp theo tự động xóa bớt các tin `@done` cũ ở cuối file (vì kết quả đã được lưu thành 1 dòng gọn gàng trong `PROJECT_STATE.md`).

---

## 🚀 Bắt Đầu Nhanh

### Bước 1: Clone bộ Kit vào dự án của bạn

```bash
# Clone vào thư mục dự án hoặc copy các file .md vào gốc dự án
git clone https://github.com/handsomecat101/agent-team.git
```

### Bước 2: Điền thông tin ban đầu
Điền thông tin dự án vào `SOUL.md` và danh sách task ban đầu vào `PROJECT_STATE.md` (có thể dùng `PROJECT_SETUP_CHECKLIST.md` để gợi ý).

### Bước 3: Bắt đầu làm việc trên BẤT KỲ IDE nào!

* **Cách 1 — Tự động (Khuyên dùng):** Đặt file `AGENTS.md` (hoặc copy thành `CLAUDE.md` / `.cursorrules`) ở thư mục gốc dự án. Hầu hết các IDE hiện đại sẽ tự động đọc file này và kích hoạt quy trình ngay khi mở project!
* **Cách 2 — Thủ công:** Nếu dùng công cụ chat web không tự đọc `AGENTS.md`, chỉ cần dán câu lệnh ngắn này khi mở phiên mới:

```text
Hãy đọc SOUL.md, PROJECT_STATE.md, AGENT_CHAT.md và bảng Quick Index trong ISSUE_LOG.md để nắm context dự án (tuân thủ quy tắc ngắn gọn, không ghi trùng lặp trong AGENTS.md), sau đó tóm tắt ngắn gọn tình trạng hiện tại.
```

---

## 🔄 Workflow: 6 Bước Chuẩn

![Workflow Diagram](./docs/workflow.png)

```
┌─────────────────────────────────────────────────────────────────┐
│  BƯỚC 0: KHỞI ĐỘNG (1-2 phút) ← Mỗi phiên mới / Mỗi khi đổi IDE │
│  □ Đọc SOUL.md → PROJECT_STATE.md → AGENT_CHAT.md               │
│  □ Đọc bảng Quick Index ở đầu ISSUE_LOG.md                      │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 1: NHẬN & KHÓA TASK (1 phút)                              │
│  □ Ghi ngay task vào mục "Task Đang Làm (🟡 In Progress)" trong │
│    PROJECT_STATE.md để tránh Agent ở IDE khác làm trùng         │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 2: CHUẨN BỊ (3-5 phút)                                    │
│  □ Xác định files cần sửa, kiểm tra GOVERNANCE.md & ISSUE_LOG   │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 3: THỰC HIỆN (Tùy task)                                   │
│  □ Code → Test locally → Deploy & Verify                        │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 4: CẬP NHẬT GỌN (2 phút — Không ghi trùng lặp!)           │
│  □ PROJECT_STATE.md: Chuyển task sang Hoàn Thành (1 dòng)       │
│  □ AGENT_CHAT.md: Ghi @done hoặc @handoff (3-7 dòng), giữ ≤8 tin│
│  □ ISSUE_LOG.md: Ghi lỗi kỹ thuật mới + cập nhật Quick Index    │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 5: REVIEW (Nếu cần)                                       │
│  □ Gửi review → Xử lý feedback → ✅ DONE                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 💬 Các Mẫu Tin Nhắn Bàn Giao Chuẩn Trong `AGENT_CHAT.md`

### 1. Báo hoàn thành ca trực (`@done` — Ngắn gọn, dẫn chiếu mã lỗi)
```markdown
### 2026-09-28 15:30 - Antigravity
- **Loại:** `@done`
- **Tóm tắt:** Đã fix dứt điểm lỗi tự đóng dialog OTA (`BUG-005` — chi tiết xem `ISSUE_LOG.md`).
- **Files đã sửa:** `MainActivity.kt`, `update_service.dart`, `update_dialog.dart`
- **Verify/Deploy:** Pass `dart analyze`, đã build & đẩy APK `v2.5.2` lên R2.
- **Việc tiếp theo:** Sẵn sàng nhận task mới.
```

### 2. Bàn giao khi đổi IDE giữa chừng (`@handoff`)
```markdown
### 2026-09-28 16:00 - Claude Code
- **Loại:** `@handoff`
- **Tóm tắt:** Đã viết xong API đồng bộ ở backend (60% task), còn phần nút bấm UI chưa nối.
- **Files đã đụng tới:** `sync_server.dart`
- **Việc tiếp theo:** Agent ở IDE tiếp theo mở `local_sync_screen.dart` gắn nút gọi endpoint `/api/sync`.
```

### 3. Giao việc hoặc Xin trợ giúp (`@assign` / `@help`)
```markdown
### 2026-09-28 16:15 - Cursor
- **Loại:** `@assign → Gemini`
- **Tóm tắt:** Cần thiết kế lại thanh trượt Timeline theo phong cách Google Photos.
- **Files liên quan:** `year_scrubber.dart`, `timeline_screen.dart`
```

---

## 📁 Tài Liệu Chi Tiết

| File | Mô tả |
|------|-------|
| [AGENTS.md](./AGENTS.md) | Quy tắc Auto-Boot & chống trùng lặp token cho mọi IDE |
| [SOUL.md](./SOUL.md) | Template định nghĩa kiến trúc & identity của project |
| [PROJECT_STATE.md](./PROJECT_STATE.md) | Bảng Dashboard theo dõi trạng thái tasks (1 dòng/task) |
| [AGENT_CHAT.md](./AGENT_CHAT.md) | Bảng bàn giao ca trực ngắn gọn (Rolling 5–8 tin) |
| [ISSUE_LOG.md](./ISSUE_LOG.md) | Sổ tay miễn dịch lỗi kèm Bảng Tra Cứu Nhanh (Quick Index) |
| [QUY_TRINH.md](./QUY_TRINH.md) | Quy trình 6 bước đầy đủ và quy tắc tiết kiệm token |
| [GOVERNANCE.md](./GOVERNANCE.md) | Quy tắc phân quyền, git rules & an toàn production |
| [PROJECT_SETUP_CHECKLIST.md](./PROJECT_SETUP_CHECKLIST.md) | Checklist câu hỏi khởi tạo project mới |
| [SCREENSHOTS.md](./SCREENSHOTS.md) | Hướng dẫn lưu ảnh chụp màn hình bằng chứng lỗi |
| [CHANGELOG.md](./CHANGELOG.md) | Lịch sử nâng cấp bộ Kit & Quy tắc cho Agent bảo trì repo này |

---

## 🛠️ Dành Cho Agent Bảo Trì / Nâng Cấp Bộ Kit Này

Nếu bạn là một AI Agent được giao nhiệm vụ **cải tiến chính bộ khung `handsomecat101/agent-team` này** trong tương lai:
1. Hãy đọc **[CHANGELOG.md](./CHANGELOG.md)** trước để hiểu lịch sử các phiên bản (`v1.0.0` → `v1.1.0`) và lý do thiết kế các quy tắc hiện tại.
2. **Giữ sạch các file Template:** Không bao giờ commit nội dung thực tế của một dự án riêng lẻ đè vào `SOUL.md`, `PROJECT_STATE.md`, `AGENT_CHAT.md`, `ISSUE_LOG.md` trên repo gốc này.
3. Sau khi cập nhật quy trình, hãy ghi rõ phiên bản mới (`v1.x.0`), ngày tháng, tên Agent và tóm tắt thay đổi vào đầu file **[CHANGELOG.md](./CHANGELOG.md)** trước khi push.

---

## 🗺️ Roadmap

- [x] v1.0 — Bộ kit cơ bản (Markdown Shared Memory)
- [x] v1.1 — Multi-IDE Auto-Boot (`AGENTS.md`), Khóa Task Bước 1, Tag `@handoff`, Quy tắc Chống Trùng Lặp & Rolling Window tiết kiệm 80% token, bổ sung `CHANGELOG.md`
- [ ] v1.2 — CLI tool: `collab-kit init`, `collab-kit prune`

---

## 🏆 Credits

<div align="center">

| Vai trò | Người thực hiện |
|---------|----------------|
| 💡 **Concept & Design** | [jimmyvu](https://github.com/handsomecat101) |
| 🤖 **Built with AI** | Antigravity · Claude · Gemini · Codex |
| 📐 **Architecture** | jimmyvu & AI Team |

> *"Dự án này được xây dựng hoàn toàn trong tinh thần hợp tác giữa con người và AI —*
> *chứng minh rằng khi Human + AI làm việc cùng nhau, không có gì là không thể."*
>
> — **jimmyvu & AI Team**

</div>
