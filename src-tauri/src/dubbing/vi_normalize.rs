//! Chuẩn hóa văn bản tiếng Việt TRƯỚC khi đưa vào TTS (áp dụng cho MỌI engine).
//!
//! Vì sao cần: nhiều engine (đặc biệt Kokoro) bỏ rơi hoặc đọc sai chữ số — câu
//! "Ngày 24 tháng 10 năm 2026, … thắng 3-1 …" bị đọc thành "Ngày tháng 5 ở … thắng ở …"
//! (WER 30%). Module này đổi số/ngày/giờ/tiền/phần trăm/tỷ số… thành CHỮ.
//!
//! Không dùng crate `regex`: bộ quét ký tự tự viết, không panic (không `unwrap`).
//! Hàm là *idempotent*: chạy lại trên kết quả không đổi gì thêm (không còn chữ số).

const DIGITS: [&str; 10] = [
    "không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín",
];
const GROUP_NAMES: [&str; 6] = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];

/// Đọc nhóm 3 chữ số. `pad` = nhóm không đứng đầu → đọc cả "không trăm"/"linh".
fn read_group(n: u32, pad: bool) -> String {
    let (h, t, u) = (n / 100, (n / 10) % 10, n % 10);
    let mut parts: Vec<String> = Vec::new();
    if h > 0 || pad {
        parts.push(format!("{} trăm", DIGITS[h as usize]));
    }
    match t {
        0 => {
            if u > 0 {
                if h > 0 || pad {
                    parts.push("linh".to_string());
                }
                parts.push(DIGITS[u as usize].to_string());
            }
        }
        1 => {
            parts.push("mười".to_string());
            match u {
                0 => {}
                5 => parts.push("lăm".to_string()),
                _ => parts.push(DIGITS[u as usize].to_string()),
            }
        }
        _ => {
            parts.push(format!("{} mươi", DIGITS[t as usize]));
            match u {
                0 => {}
                1 => parts.push("mốt".to_string()),
                4 => parts.push("tư".to_string()),
                5 => parts.push("lăm".to_string()),
                _ => parts.push(DIGITS[u as usize].to_string()),
            }
        }
    }
    parts.join(" ")
}

/// Đọc một dãy chữ số thành số nguyên tiếng Việt (tối đa 18 chữ số, dài hơn đọc từng chữ số).
pub fn read_integer(digits: &str) -> String {
    let d: String = digits.chars().filter(|c| c.is_ascii_digit()).collect();
    let trimmed = d.trim_start_matches('0');
    if trimmed.is_empty() {
        return DIGITS[0].to_string();
    }
    if trimmed.len() > 18 {
        return read_digits(trimmed);
    }
    let bytes = trimmed.as_bytes();
    let mut groups: Vec<u32> = Vec::new();
    let mut end = bytes.len();
    while end > 0 {
        let start = end.saturating_sub(3);
        let g = trimmed[start..end].parse::<u32>().unwrap_or(0);
        groups.push(g);
        end = start;
    }
    let mut out: Vec<String> = Vec::new();
    for (idx, &g) in groups.iter().enumerate().rev() {
        if g == 0 {
            continue;
        }
        let leading = idx == groups.len() - 1;
        let mut text = read_group(g, !leading);
        let name = GROUP_NAMES[idx.min(GROUP_NAMES.len() - 1)];
        if !name.is_empty() {
            text.push(' ');
            text.push_str(name);
        }
        out.push(text);
    }
    out.join(" ")
}

/// Đọc từng chữ số một (số điện thoại, phần thập phân dài…).
pub fn read_digits(digits: &str) -> String {
    digits
        .chars()
        .filter_map(|c| c.to_digit(10))
        .map(|d| DIGITS[d as usize])
        .collect::<Vec<_>>()
        .join(" ")
}

/// Phần thập phân: ≤ 3 chữ số đọc như số (giữ "không" ở đầu), dài hơn đọc từng chữ số.
fn read_decimal_part(frac: &str) -> String {
    if frac.len() > 3 {
        return read_digits(frac);
    }
    let zeros = frac.chars().take_while(|&c| c == '0').count();
    let rest = &frac[zeros..];
    let mut parts: Vec<String> = vec![DIGITS[0].to_string(); zeros];
    if !rest.is_empty() {
        parts.push(read_integer(rest));
    }
    parts.join(" ")
}

fn month_word(m: u32) -> String {
    match m {
        1 => "một".to_string(),
        4 => "tư".to_string(),
        _ => read_integer(&m.to_string()),
    }
}

fn is_alnum(c: char) -> bool {
    c.is_alphanumeric()
}

/// Từ cuối cùng (chữ thường) của phần đã sinh ra — dùng làm ngữ cảnh ("ngày", "tháng", "thứ", "từ"…).
fn prev_word(out: &str) -> String {
    out.split_whitespace().last().unwrap_or("").to_lowercase()
}

struct Scanner<'a> {
    c: &'a [char],
}

impl Scanner<'_> {
    /// Đọc đúng `min..=max` chữ số liên tiếp bắt đầu tại `i`; trả (giá trị, vị trí sau).
    fn digits(&self, i: usize, min: usize, max: usize) -> Option<(u32, usize)> {
        let mut j = i;
        let mut v: u32 = 0;
        while j < self.c.len() && self.c[j].is_ascii_digit() && j - i < max {
            v = v.saturating_mul(10).saturating_add(self.c[j].to_digit(10)?);
            j += 1;
        }
        let n = j - i;
        // không cho phép chữ số thứ max+1 (tránh bắt nhầm đầu một số dài hơn)
        if n < min || (j < self.c.len() && self.c[j].is_ascii_digit()) {
            return None;
        }
        Some((v, j))
    }

    fn is(&self, i: usize, ch: char) -> bool {
        i < self.c.len() && self.c[i] == ch
    }

    fn word_after(&self, mut i: usize) -> (String, usize) {
        while i < self.c.len() && self.c[i] == ' ' {
            i += 1;
        }
        let start = i;
        while i < self.c.len() && (self.c[i].is_alphabetic() || matches!(self.c[i], '₫' | '$' | '€' | '%' | '°' | '/')) {
            i += 1;
        }
        (self.c[start..i].iter().collect::<String>(), i)
    }

    /// Ngày/tháng/năm: dd[/.-]mm[/.-]yyyy hoặc mm/yyyy.
    fn date(&self, i: usize, prev: &str) -> Option<(String, usize)> {
        let (d, j) = self.digits(i, 1, 2)?;
        let sep = *self.c.get(j)?;
        if !matches!(sep, '/' | '-' | '.') {
            return None;
        }
        // mm/yyyy
        if sep == '/' && (1..=12).contains(&d) {
            if let Some((y, e)) = self.digits(j + 1, 4, 4) {
                if (1000..=2999).contains(&y) {
                    return Some((format!("tháng {} năm {}", month_word(d), read_integer(&y.to_string())), e));
                }
            }
        }
        let (m, k) = self.digits(j + 1, 1, 2)?;
        if self.c.get(k) == Some(&sep) {
            let (y, e) = self.digits(k + 1, 4, 4)?;
            if (1..=31).contains(&d) && (1..=12).contains(&m) && (1000..=2999).contains(&y) {
                let day = if prev == "ngày" { String::new() } else { "ngày ".to_string() };
                return Some((
                    format!("{}{} tháng {} năm {}", day, read_integer(&d.to_string()), month_word(m), read_integer(&y.to_string())),
                    e,
                ));
            }
            return None;
        }
        if sep == '/' && (1..=31).contains(&d) && (1..=12).contains(&m) && prev == "ngày" {
            return Some((format!("{} tháng {}", read_integer(&d.to_string()), month_word(m)), k));
        }
        if sep == '/' && m > 0 && d > 0 {
            let den = if m == 4 { "tư".to_string() } else { read_integer(&m.to_string()) };
            return Some((format!("{} phần {}", read_integer(&d.to_string()), den), k));
        }
        None
    }

    /// Giờ: hh:mm[:ss] hoặc 14h30 / 9h.
    fn time(&self, i: usize) -> Option<(String, usize)> {
        let (h, j) = self.digits(i, 1, 2)?;
        if h > 23 {
            return None;
        }
        if self.is(j, ':') {
            let (m, k) = self.digits(j + 1, 2, 2)?;
            if m > 59 {
                return None;
            }
            let mut s = format!("{} giờ", read_integer(&h.to_string()));
            if m > 0 {
                s.push_str(&format!(" {} phút", read_integer(&m.to_string())));
            }
            if self.is(k, ':') {
                if let Some((sec, e)) = self.digits(k + 1, 2, 2) {
                    if sec <= 59 {
                        if sec > 0 {
                            s.push_str(&format!(" {} giây", read_integer(&sec.to_string())));
                        }
                        return Some((s, e));
                    }
                }
            }
            return Some((s, k));
        }
        if self.is(j, 'h') || self.is(j, 'H') {
            let after = self.c.get(j + 1).copied();
            if let Some((m, k)) = self.digits(j + 1, 1, 2) {
                if m <= 59 && !self.c.get(k).map_or(false, |c| c.is_alphabetic()) {
                    let mut s = format!("{} giờ", read_integer(&h.to_string()));
                    if m > 0 {
                        s.push_str(&format!(" {}", read_integer(&m.to_string())));
                    }
                    return Some((s, k));
                }
            } else if after.map_or(true, |c| !is_alnum(c)) {
                return Some((format!("{} giờ", read_integer(&h.to_string())), j + 1));
            }
        }
        None
    }

    /// Hậu tố sau số: %, tiền tệ, đơn vị đo. Trả (chữ thay thế, vị trí sau).
    fn suffix(&self, i: usize) -> Option<(String, usize)> {
        let mut j = i;
        if self.is(j, ' ') && j + 1 < self.c.len() {
            j += 1;
        }
        if self.is(j, '%') {
            return Some(("phần trăm".to_string(), j + 1));
        }
        let (w, e) = self.word_after(j);
        let lw = w.to_lowercase();
        let boundary = !self.c.get(e).map_or(false, |c| c.is_alphanumeric());
        let table: [(&str, &str); 14] = [
            ("₫", "đồng"), ("đ", "đồng"), ("vnđ", "đồng"), ("vnd", "đồng"), ("usd", "đô la Mỹ"),
            ("eur", "ơ rô"), ("€", "ơ rô"), ("km/h", "ki lô mét trên giờ"), ("km", "ki lô mét"),
            ("kg", "ki lô gam"), ("cm", "xăng ti mét"), ("mm", "mi li mét"), ("ml", "mi li lít"), ("°", "độ"),
        ];
        if boundary {
            for (k, v) in table {
                if lw == k {
                    return Some((v.to_string(), e));
                }
            }
            if j == i && lw == "m" {
                return Some(("mét".to_string(), e));
            }
        }
        None
    }
}

/// Chuẩn hóa toàn bộ câu. Không có chữ số/ký hiệu đặc biệt → trả nguyên văn.
pub fn normalize_vi(text: &str) -> String {
    if !text.chars().any(|c| c.is_ascii_digit() || matches!(c, '%' | '$' | '€' | '₫')) {
        return text.to_string();
    }
    let chars: Vec<char> = text.chars().collect();
    let sc = Scanner { c: &chars };
    let mut out = String::with_capacity(text.len() * 2);
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        // Tiền tệ đứng TRƯỚC số: $50
        let mut currency_after: Option<&str> = None;
        let mut start = i;
        if matches!(ch, '$' | '€') && chars.get(i + 1).map_or(false, |c| c.is_ascii_digit()) {
            currency_after = Some(if ch == '$' { "đô la" } else { "ơ rô" });
            start = i + 1;
        }
        if !chars.get(start).map_or(false, |c| c.is_ascii_digit()) {
            out.push(ch);
            i += 1;
            continue;
        }
        // chữ số nằm giữa từ (vd "mp3", "COVID-19") vẫn được đọc, nhưng cần khoảng trắng phân tách
        if start > 0 && chars[start - 1].is_alphabetic() && !out.ends_with(' ') {
            out.push(' ');
        }
        let prev = prev_word(&out);
        let neg = out.ends_with('-') && (out.len() == 1 || out[..out.len() - 1].ends_with(' ')) && currency_after.is_none();
        if neg {
            out.pop();
            out.push_str("âm ");
        }
        if let Some((s, e)) = sc.date(start, &prev).or_else(|| sc.time(start)) {
            out.push_str(&s);
            i = e;
            continue;
        }
        // Số: nguyên / nhóm nghìn (1.000, 1,000,000) / thập phân (1,5)
        let mut j = start;
        while j < chars.len() && chars[j].is_ascii_digit() {
            j += 1;
        }
        let int_part: String = chars[start..j].iter().collect();
        let mut value: String;
        let mut int_only = true;
        // nhóm nghìn kiểu VN: 1.000.000 (mỗi nhóm đúng 3 chữ số)
        let mut grouped = int_part.clone();
        let mut k = j;
        let sep = chars.get(k).copied();
        if matches!(sep, Some('.') | Some(',')) && int_part.len() <= 3 {
            let sep_ch = sep.unwrap_or('.');
            let mut probe = k;
            let mut count = 0;
            while sc.is(probe, sep_ch) {
                match sc.digits(probe + 1, 3, 3) {
                    Some(_) => {
                        grouped.push_str(&chars[probe + 1..probe + 4].iter().collect::<String>());
                        probe += 4;
                        count += 1;
                    }
                    None => break,
                }
            }
            // "1.5" / "1,5" / "3,14": không phải nhóm nghìn → thập phân; "1,500" (1 nhóm dấu phẩy) → thập phân VN
            if count >= 1 && (sep_ch == '.' || count >= 2) {
                k = probe;
            } else {
                grouped = int_part.clone();
            }
        }
        value = read_integer(&grouped);
        if k == j && matches!(chars.get(j), Some('.') | Some(',')) {
            if chars.get(j + 1).map_or(false, |c| c.is_ascii_digit()) {
                let mut e = j + 1;
                while e < chars.len() && chars[e].is_ascii_digit() {
                    e += 1;
                }
                // "1.2.3" (phiên bản) → đọc từng phần, nối "chấm"
                if sc.is(e, '.') && chars.get(e + 1).map_or(false, |c| c.is_ascii_digit()) {
                    let mut e2 = e;
                    while sc.is(e2, '.') && chars.get(e2 + 1).map_or(false, |c| c.is_ascii_digit()) {
                        e2 += 1;
                        while e2 < chars.len() && chars[e2].is_ascii_digit() {
                            e2 += 1;
                        }
                    }
                    let seg: String = chars[start..e2].iter().collect();
                    value = seg.split('.').map(read_integer).collect::<Vec<_>>().join(" chấm ");
                    k = e2;
                } else {
                    let frac: String = chars[j + 1..e].iter().collect();
                    value = format!("{} phẩy {}", value, read_decimal_part(&frac));
                    k = e;
                }
                int_only = false;
            }
        }
        // Số điện thoại / mã dài bắt đầu bằng 0 → đọc từng chữ số
        if int_only && k == j && int_part.len() >= 8 && int_part.starts_with('0') {
            value = read_digits(&int_part);
        }
        // Tỷ số / khoảng: 3-1, 10-20
        let mut after = k;
        if int_only && (sc.is(k, '-') || sc.is(k, '–')) && grouped.len() <= 3 {
            if let Some((_, e)) = sc.digits(k + 1, 1, 3) {
                let rhs: String = chars[k + 1..e].iter().collect();
                let link = if matches!(prev.as_str(), "từ" | "khoảng" | "tầm" | "chừng") { "đến" } else { "-" };
                out.push_str(&format!("{} {} {}", value, link, read_integer(&rhs)));
                i = e;
                continue;
            }
        }
        // "thứ 2" → "thứ hai"; "thứ 1" → "thứ nhất"; "tháng 4" → "tháng tư"
        if int_only && k == j {
            if prev == "thứ" {
                match int_part.trim_start_matches('0') {
                    "1" => value = "nhất".to_string(),
                    "4" => value = "tư".to_string(),
                    _ => {}
                }
            } else if prev == "tháng" {
                if let Ok(m) = int_part.parse::<u32>() {
                    if (1..=12).contains(&m) {
                        value = month_word(m);
                    }
                }
            }
        }
        out.push_str(&value);
        if let Some((w, e)) = sc.suffix(after) {
            out.push(' ');
            out.push_str(&w);
            after = e;
        } else if let Some(cur) = currency_after {
            out.push(' ');
            out.push_str(cur);
        }
        i = after;
    }
    // gọn khoảng trắng thừa do ghép
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Giọng có phải đọc tiếng Việt (cần chuẩn hóa số)? Edge `vi-VN-*`, `kokoro:`, `vietneu:`…
pub fn is_vietnamese_voice(voice: &str) -> bool {
    let v = voice.trim();
    v.starts_with("kokoro:")
        || v.starts_with("vietneu:")
        || v.starts_with("zerotts:")
        || v.starts_with("gcloud:")
        || v.starts_with("fptai:")
        || v.starts_with("vi-VN")
}

#[cfg(test)]
#[path = "vi_normalize_tests.rs"]
mod tests;
