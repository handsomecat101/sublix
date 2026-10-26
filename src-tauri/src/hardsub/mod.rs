//! TSK-V014-HARDSUB-BAND — lõi thuần dải phụ đề cứng (docs/V0.14_PLAN.md §2A).
//!
//! **Phạm vi module này**: nhận đầu vào là *các hộp chữ đã dò được theo thời gian*
//! (model dò chữ chưa chọn ⇒ phần dò chữ nằm ngoài phạm vi) ⇒ trả về
//!
//! 1. **1 dải phụ đề cứng** (vị trí `y`, chiều cao `h` trong khung hình) — dùng để
//!    làm mờ + đè tem khi xuất video (§2B), và
//! 2. **danh sách khoảng thời gian có chữ** (`spans`) — để chỉ làm mỏ khi thực sự
//!    có phụ đề cứng.
//!
//! **Thuật toán** (xem [`band::detect_band`] để có chi tiết từng bước):
//! - Lọc hộp: `score ≥ min_score`, hộp ngang (`w ≥ 1.5·h`), đủ lớn
//!   (`h ≥ 1.5 %` chiều cao khung), nằm đúng vùng (`Bottom` / `Top` / `Any`).
//! - Khung **"có chữ"** = còn ≥ 1 hộp sau lọc. Tỉ lệ khung có chữ thấp hơn
//!   `min_frames_ratio` ⇒ **không có phụ đề cứng** ⇒ `band = None`.
//! - Dải lấy **phân vị 10 %** mép trên và **phân vị 90 %** mép dưới của các hộp
//!   (chống nhiễu logo / chữ lạ ở rìa), rồi nới `pad_ratio` mỗi phía và kẹp trong
//!   khung hình.
//! - `spans`: gom các thời điểm khung có chữ thành khoảng `[t_đầu − 0.5 s,
//!   t_cuối + 0.5 s]`, nối các nhóm cách nhau ≤ `merge_gap_sec`.
//!
//! Module **thuần** (không I/O, không model) ⇒ test được bằng dữ liệu giả lập.
//!
//! **Đường dẫn dùng trong crate**: `crate::hardsub::band::detect_band` (+ các kiểu
//! `Band`, `BandOptions`, `FrameBoxes`, `HardsubResult`, `Region`, `TextBox`).

pub mod band;
