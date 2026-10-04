# QUY_TRINH.md — Quy Trình 6 Bước Chuẩn Trong Dự Án Sublix

> **6 bước chuẩn** để hoàn thành một task trên Sublix — TẤT CẢ các Agent trên mọi IDE đều phải tuân theo.

---

## 📋 Tổng Quan 6 Bước

```
┌─────────────────────────────────────────────────────────────────┐
│                    6 BƯỚC LÀM VIỆC CHUẨN                        │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 0: KHỞI ĐỘNG      ⏱️ 1-2 phút (MỖI PHIÊN MỚI / ĐỔI IDE) │
│  ─────────────────────────────────────────────                 │
│  □ Đọc SOUL.md (hiểu kiến trúc & quy tắc bất biến)             │
│  □ Đọc PROJECT_STATE.md (xem tiến độ & task đang mở)           │
│  □ Đọc AGENT_CHAT.md (đọc 5-8 tin bàn giao gần nhất)           │
│  □ Đọc ISSUE_LOG.md (đọc bảng Quick Index ở đầu file)          │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 1: NHẬN & KHÓA TASK ⏱️ 1 phút                            │
│  ─────────────────────────────────────────────                 │
│  □ Nhận task (Self-assign hoặc được assign)                    │
│  □ Ghi ngay vào mục "Task Đang Làm (🟡 In Progress)" trong     │
│    PROJECT_STATE.md để tránh Agent ở IDE khác làm trùng        │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 2: CHUẨN BỊ         ⏱️ 3-5 phút                          │
│  ─────────────────────────────────────────────                 │
│  □ Xác định files cần sửa & kiểm tra quyền trong GOVERNANCE.md │
│  □ Xem chi tiết lỗi liên quan trong ISSUE_LOG.md (nếu có)      │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 3: THỰC HIỆN        ⏱️ Tùy thuộc task                    │
│  ─────────────────────────────────────────────                 │
│  □ Khi Dev/Test UI: Chạy `npm run tauri dev` (Hot Reload 0.1s) │
│    -> KHÔNG tốn thời gian build release khi đang làm việc dở!  │
│  □ Kiểm tra mã: `cargo check` -> `npm run build`               │
│  □ Khi Đóng Gói Release: Bắt buộc dùng `npx tauri build --no-bundle` │
│    -> CẤM dùng `cargo build --release` (tránh lỗi localhost 1420)   │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 4: CẬP NHẬT GỌN     ⏱️ 2 phút (KHÔNG GHI TRÙNG LẶP!)     │
│  ─────────────────────────────────────────────                 │
│  □ PROJECT_STATE.md: Chuyển task sang Hoàn Thành (1 dòng)      │
│  □ AGENT_CHAT.md: Ghi bàn giao @done hoặc @handoff (3-7 dòng), │
│    xóa bớt tin cũ nếu vượt quá 8 tin nhắn                      │
│  □ ISSUE_LOG.md: Ghi lỗi kỹ thuật mới + cập nhật Quick Index   │
│  □ Git commit & push                                           │
├─────────────────────────────────────────────────────────────────┤
│  BƯỚC 5: REVIEW           ⏱️ 5 phút                            │
│  ─────────────────────────────────────────────                 │
│  □ Báo cáo cho anh Tuấn (Human PO) hoặc bàn giao ca trực        │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✂️ Quy Tắc Tiết Kiệm Token Tuyệt Đối

1. **`SOUL.md`**: Cố định (~1–2 KB), chỉ đọc để hiểu kiến trúc.
2. **`PROJECT_STATE.md`**: Mỗi task đúng **1 dòng**, không ghi nhật ký chi tiết theo giờ.
3. **`AGENT_CHAT.md`**: Mỗi tin nhắn đúng **3–7 dòng**, chỉ giữ **5–8 tin gần nhất** (tự động xóa tin cũ khi thêm mới).
4. **`ISSUE_LOG.md`**: Đọc nhanh qua bảng **Quick Index** ở đầu file; chi tiết mỗi lỗi chỉ **5–8 dòng**.
