//! Định dạng số liệu kiểu Việt cho thẻ video (dùng chung với frontend sau này).
//!
//! Quy ước: **dấu phẩy là dấu thập phân** (`1,2K` chứ không phải `1.2K`), đơn vị
//! `K` = nghìn, `M` = triệu, `T` = tỷ. Bỏ phần thập phân khi bằng 0 (`1K`, không `1,0K`).
//!
//! Làm tròn 1 chữ số; nếu làm tròn **vượt đơn vị** (`999_950` ⇒ `1000,0K`) thì tự nhảy
//! lên đơn vị lớn hơn (`1M`) để không bao giờ hiện `1000K`.

/// Các mốc đơn vị, **giảm dần** — thứ tự này được dùng để nhảy đơn vị khi làm tròn vượt.
const UNITS: [(u64, &str); 3] = [(1_000_000_000, "T"), (1_000_000, "M"), (1_000, "K")];

/// `1200` ⇒ `"1,2K"` · `3_400_000` ⇒ `"3,4M"` · `999` ⇒ `"999"`.
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

/// Ghép số + đơn vị: `1.0` + `K` ⇒ `"1K"`, `1.2` + `K` ⇒ `"1,2K"`.
fn join(value: f64, unit: &str) -> String {
    let mut text = format!("{value:.1}");
    while text.ends_with('0') {
        text.pop();
    }
    if text.ends_with('.') {
        text.pop();
    }
    format!("{}{unit}", text.replace('.', ","))
}

#[cfg(test)]
#[path = "format_tests.rs"]
mod format_tests;
