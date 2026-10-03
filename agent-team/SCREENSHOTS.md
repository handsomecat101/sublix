# SCREENSHOTS - Chia Sẻ Bằng Chứng

> Nơi lưu trữ screenshots khi agent tìm thấy lỗi bằng trình duyệt

---

## 📂 Cấu Trúc Thư Mục

```
project/
├── ...
├── collaboration_kit/
│   ├── ...
│   └── SCREENSHOTS/              ← LƯU VÀO ĐÂY!
│       ├── 2026-03-14/
│       │   ├── bug-login-001.png
│       │   ├── bug-button-color.png
│       │   └── ...
│       ├── 2026-03-15/
│       │   └── ...
│       └── README.md
├── ISSUE_LOG.md
└── ...
```

---

## 📋 Cách Sử Dụng

### Khi tìm thấy lỗi bằng trình duyệt:

```
1. Chụp screenshot lỗi
2. Lưu vào folder SCREENSHOTS/[Ngày]/
3. Ghi vào ISSUE_LOG.md với đường dẫn screenshot
```

### Đặt tên file screenshot:

```
bug-[ten-loi]-[ID].png

Ví dụ:
- bug-login-redirect-001.png
- bug-button-missing-002.png
- bug-dark-mode-003.png
```

---

## 📝 Cách Ghi Vào ISSUE_LOG

### Format:

```markdown
### [Tên lỗi]

- **Mô tả:** [Chi tiết lỗi]
- **File:** [Tên file]
- **Screenshot:** SCREENSHOTS/2026-03-14/bug-login-001.png
- **Đã thử:** [Cách đã fix / chưa fix]
- **Status:** 🔴 Open / 🟡 Fixing / ✅ Fixed
- **Fix bởi:** [Agent]
```

---

## 💡 Ví Dụ

### Agent tìm thấy lỗi:

```
Gemini đang browse website
→ Thấy: Button màu xanh nhưng spec nói màu đỏ
→ Chụp screenshot: SCREENSHOTS/2026-03-14/bug-button-color-001.png
→ Ghi ISSUE_LOG.md:

### Button sai màu

- **Mô tả:** Button "Submit" có màu xanh lá, nhưng spec yêu cầu màu đỏ
- **File:** style.css (line 45)
- **Screenshot:** SCREENSHOTS/2026-03-14/bug-button-color-001.png
- **Đã thử:** -
- **Status:** 🔴 Open
```

### Agent khác sửa lỗi:

```
Claude đọc ISSUE_LOG.md
→ Thấy screenshot: Button màu xanh thay vì đỏ
→ Hiểu ngay → Sửa style.css → Đổi màu đỏ
→ Deploy → Verify
→ Cập nhật ISSUE_LOG: Status ✅ Fixed
```

---

## ✅ Checklist

### Khi tìm thấy lỗi bằng trình duyệt:

- [ ] Chụp screenshot lỗi
- [ ] Lưu vào SCREENSHOTS/[Ngày]/
- [ ] Ghi vào ISSUE_LOG.md với đường dẫn screenshot

### Khi sửa lỗi:

- [ ] Xem screenshot trước để hiểu lỗi
- [ ] Sau khi fix → Chụp screenshot kết quả (tùy chọn)
- [ ] Cập nhật ISSUE_LOG.md

---

## 📊 Tổng Kết

| Loại | Nơi lưu | Ghi vào |
|------|---------|---------|
| **Screenshot lỗi** | SCREENSHOTS/[Ngày]/ | ISSUE_LOG.md |
| **Screenshot kết quả** | SCREENSHOTS/[Ngày]/ | ISSUE_LOG.md (tùy chọn) |

---

*SCREENSHOTS - Chia sẻ bằng chứng để team dễ sửa lỗi*
