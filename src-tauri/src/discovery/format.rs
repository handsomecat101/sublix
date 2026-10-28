//! Định dạng số liệu kiểu Việt cho thẻ video (dùng chung với frontend).
//!
//! Quy ước: **dấu phẩy là dấu thập phân** (`1,8 triệu` chứ không phải `1.8 triệu`),
//! đơn vị `nghìn` = 1.000 · `triệu` = 1.000.000 · `tỷ` = 1.000.000.000.
//! Bỏ phần thập phân khi bằng 0 (`1 triệu`, không `1,0 triệu`).
//!
//! TSK-V015-DISC-B1: trước đây dùng `K`/`M`/`T` và `万`/`亿` — người Việt khó đọc
//! (`0,5亿` nghĩa là 50 triệu). Nay **một kiểu cho cả Bilibili lẫn YouTube**.
//!
//! Làm tròn 1 chữ số; nếu làm tròn **vượt đơn vị** (`999.950 nghìn`) thì tự nhảy
//! lên đơn vị lớn hơn (`1 triệu`) để không bao giờ hiện `1000 nghìn`.

/// Các mốc đơn vị, **giảm dần** — thứ tự này được dùng để nhảy đơn vị khi làm tròn vượt.
const UNITS: [(u64, &str); 3] = [
    (1_000_000_000, "tỷ"),
    (1_000_000, "triệu"),
    (1_000, "nghìn"),
];

/// `1200` ⇒ `"1,2 nghìn"` · `1_800_000` ⇒ `"1,8 triệu"` · `999` ⇒ `"999"`.
pub fn format_count(n: u64) -> String {
    if n < 1_000 {
        return n.to_string();
    }
    for (index, (divisor, unit)) in UNITS.iter().enumerate() {
        if n < *divisor {
            continue;
        }
        let rounded = round_one_decimal(n as f64 / *divisor as f64);
        if rounded >= 1_000.0 {
            // Làm tròn chạm trần đơn vị ⇒ dùng đơn vị lớn hơn liền kề.
            if let Some((big_divisor, big_unit)) = index.checked_sub(1).map(|i| UNITS[i]) {
                return join(round_one_decimal(n as f64 / big_divisor as f64), big_unit);
            }
        }
        return join(rounded, unit);
    }
    n.to_string()
}

/// Làm tròn 1 chữ số thập phân (tránh `1,1999999`).
fn round_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

/// Ghép số + đơn vị: `1.0` + `nghìn` ⇒ `"1 nghìn"`, `1.2` + `triệu` ⇒ `"1,2 triệu"`.
fn join(value: f64, unit: &str) -> String {
    let mut text = format!("{value:.1}");
    while text.ends_with('0') {
        text.pop();
    }
    if text.ends_with('.') {
        text.pop();
    }
    format!("{} {}", text.replace('.', ","), unit)
}

#[cfg(test)]
#[path = "format_tests.rs"]
mod format_tests;
