//! Đo **tất định** mức độ nhất quán xưng hô của bản dịch tiếng Việt.
//!
//! Vì sao cần: LLM-giám khảo (MiniMax-M3 / DeepSeek) chấm điểm *"xưng hô nhất quán"*
//! nhưng (a) phụ thuộc thiên lệch cùng họ, (b) hay không parse được JSON → chấm thiếu dòng.
//! Module này **không gọi mạng**: đếm trực tiếp đại từ trong bản dịch, chuẩn hoá dấu
//! tiếng Việt về ASCII để `tôi` → `toi`, `ngươi` → `nguoi`, `ngài` → `ngai`.
//!
//! Các chỉ số:
//! - `ta_count` / `toi_count` — số lần xuất hiện họ đại từ tự xưng **cổ** (`ta`, `chúng ta`)
//!   và **hiện đại** (`tôi`, `chúng tôi`). Lớn chênh lệch ⇔ model trộn 2 văn phong.
//! - `mix_ta_toi` — số nhân vật dùng **cả hai** họ (dấu hiệu xưng hô đổi qua đổi lại).
//! - `legacy_nguoi` — số dòng dùng `ngươi` (văn phong cổ, PO hay phàn nàn).
//! - `modern_anh_ngai` — số dòng dùng `anh` / `ngài` (văn phong hiện đại).
//! - `self_forms_max` / `addr_forms_max` — số cách gọi khác nhau của 1 nhân vật / 1 cặp.
//!
//! Lưu ý: `speakers` là nhãn speaker **có thể sai** (file dump phim đôi khi gán lệch).
//! Vì vậy các chỉ số đếm **theo dòng** (`ta_count`, `toi_count`, `legacy_nguoi`, …) là
//! đáng tin nhất; các chỉ số theo nhân vật (`mix_ta_toi`, `self_forms_max`) là chỉ báo.

use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;

/// Bảng kết quả audit xưng hô (serialize thẳng vào JSON benchmark).
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
pub struct PronounAudit {
    /// Số dòng đã audit.
    pub n_lines: usize,
    /// Tổng số cách tự xưng khác nhau của tất cả nhân vật.
    pub self_forms_total: usize,
    /// Nhân vật dùng nhiều cách tự xưng nhất.
    pub self_forms_max: usize,
    /// Tổng số cách gọi nhau khác nhau của tất cả cặp nhân vật.
    pub addr_forms_total: usize,
    /// Cặp nhân vật dùng nhiều cách gọi nhau nhất.
    pub addr_forms_max: usize,
    /// Số nhân vật dùng **cả** `ta` và `tôi` → xưng hô đổi qua đổi lại.
    pub mix_ta_toi: usize,
    /// Số dòng chứa `ngươi`.
    pub legacy_nguoi: usize,
    /// Số dòng chứa `anh` hoặc `ngài`.
    pub modern_anh_ngai: usize,
    /// Số lần văn phong đổi giữa 2 dòng liền kề cùng một nhân vật.
    pub register_flips: usize,
    /// Số lần dùng họ đại từ tự xưng cổ (`ta`, `chúng ta`).
    pub ta_count: usize,
    /// Số lần dùng họ đại từ tự xưng hiện đại (`tôi`, `chúng tôi`).
    pub toi_count: usize,
}

/// Bỏ dấu tiếng Việt → ASCII **và hạ chữ thường** (`tôi`→`toi`, `ngươi`→`nguoi`, `đ`→`d`).
pub fn deaccent(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        let lower = c.to_lowercase().next().unwrap_or(c);
        out.push(match lower {
            'à' | 'á' | 'ạ' | 'ả' | 'ã' | 'â' | 'ầ' | 'ấ' | 'ậ' | 'ẩ' | 'ẫ' | 'ă' | 'ằ' | 'ắ'
            | 'ặ' | 'ẳ' | 'ẵ' => 'a',
            'è' | 'é' | 'ẹ' | 'ẻ' | 'ẽ' | 'ê' | 'ề' | 'ế' | 'ệ' | 'ể' | 'ễ' => 'e',
            'ì' | 'í' | 'ị' | 'ỉ' | 'ĩ' => 'i',
            'ò' | 'ó' | 'ọ' | 'ỏ' | 'õ' | 'ô' | 'ồ' | 'ố' | 'ộ' | 'ổ' | 'ỗ' | 'ơ' | 'ờ' | 'ớ'
            | 'ợ' | 'ở' | 'ỡ' => 'o',
            'ù' | 'ú' | 'ụ' | 'ủ' | 'ũ' | 'ư' | 'ừ' | 'ứ' | 'ự' | 'ử' | 'ữ' => 'u',
            'ỳ' | 'ý' | 'ỵ' | 'ỷ' | 'ỹ' => 'y',
            'đ' => 'd',
            other => other,
        });
    }
    out
}

/// Cặp từ **bỏ dấu thì trùng nhau** — phải phân biệt TRƯỚC khi bỏ dấu:
///
/// | gốc        | bỏ dấu  | nghĩa                                  |
/// |------------|---------|----------------------------------------|
/// | `ngươi`    | `nguoi` | đại từ tự xưng cổ ("ngươi")          |
/// | `người`    | `nguoi` | danh từ "người" (con người)           |
/// | `cậu`      | `cau`   | đại từ tự xưng thân (`cậu`)           |
/// | `câu`      | `cau`   | danh từ "câu" (câu nói)               |
/// | `bạn`      | `ban`   | đại từ gọi nhau (`bạn`)               |
/// | `bàn`      | `ban`   | danh từ "bàn" (bàn ghế)              |
/// | `tao`      | `tao`   | đại từ tự xưng thô (`tao`)            |
/// | `táo`      | `tao`   | danh từ "táo"                         |
///
/// Nếu không phân biệt, metric "số dòng chứa `ngươi`" sẽ đếm nhầm hàng chục dòng.
const AMBIGUOUS: [(&str, &str, &str); 8] = [
    ("ngươi", "znguo1", "nguoi"),
    ("người", "znguo2", "nguoip"),
    ("cậu", "zcau1", "cau"),
    ("câu", "zcau2", "caus"),
    ("bạn", "zban1", "ban"),
    ("bàn", "zban2", "bans"),
    ("tao", "ztao1", "tao"),
    ("táo", "ztao2", "taos"),
];

/// Tách từ nhưng **giữ phân biệt** các cặp từ trùng nhau sau khi bỏ dấu.
pub fn normalize_words(text: &str) -> Vec<String> {
    let mut s = text.to_lowercase();
    for (pat, sentinel, _) in AMBIGUOUS {
        s = s.replace(pat, sentinel);
    }
    let de = deaccent(&s);
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    for c in de.chars() {
        if c.is_ascii_alphanumeric() {
            cur.push(c);
        } else if !cur.is_empty() {
            out.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    // sentinel -> dạng chuẩn (các dạng hậu tố `p`/`s` cố ý không phải đại từ)
    out.into_iter()
        .map(|w| match w.as_str() {
            "znguo1" => "nguoi".to_string(),
            "znguo2" => "nguoip".to_string(),
            "zcau1" => "cau".to_string(),
            "zcau2" => "caus".to_string(),
            "zban1" => "ban".to_string(),
            "zban2" => "bans".to_string(),
            "ztao1" => "tao".to_string(),
            "ztao2" => "taos".to_string(),
            other => other.to_string(),
        })
        .collect()
}

/// Các dạng tự xưng (đã bỏ dấu).
const SELF_FORMS: [&str; 4] = ["ta", "toi", "minh", "tao"];
/// Các dạng gọi nhau (đã bỏ dấu).
///
/// `chi` **không** có trong danh sách: "chỉ" (chỉ có / chỉ là) rất hay xuất hiện và
/// bỏ dấu thành `chi` → nếu coi là đại từ sẽ tính sai hàng loạt dòng.
const ADDR_FORMS: [&str; 9] =
    ["nguoi", "anh", "ngai", "ban", "cau", "ong", "em", "ma", "quy"];

/// Tách đại từ trong 1 câu → `(dạng tự xưng, dạng gọi nhau)`.
pub fn detect(text: &str) -> (BTreeSet<String>, BTreeSet<String>) {
    let ws = normalize_words(text);
    let mut self_f = BTreeSet::new();
    let mut addr_f = BTreeSet::new();
    let mut i = 0usize;
    while i < ws.len() {
        let w = ws[i].as_str();
        if w == "chung" && i + 1 < ws.len() && (ws[i + 1] == "ta" || ws[i + 1] == "toi") {
            self_f.insert(format!("chung {}", ws[i + 1]));
            i += 2;
            continue;
        }
        if SELF_FORMS.contains(&w) {
            self_f.insert(w.to_string());
        } else if ADDR_FORMS.contains(&w) {
            addr_f.insert(w.to_string());
        }
        i += 1;
    }
    (self_f, addr_f)
}

/// Văn phong của 1 câu: `Some(true)` = cổ, `Some(false)` = hiện đại, `None` = không rõ.
///
/// - Cổ: `ta` / `chúng ta` / `tao`, hoặc gọi nhau bằng `ngươi` / `mày` / `cậu`.
/// - Hiện đại: `tôi` / `chúng tôi`, hoặc gọi nhau bằng `anh` / `ngài` / `bạn` / `ông` / `chị` / `em`.
/// - `mình` **không** tính là dấu hiệu cổ (nó là phản thân, trung tính).
/// - Câu trộn cả hai → `None` (không phân loại được).
fn register(self_f: &BTreeSet<String>, addr_f: &BTreeSet<String>) -> Option<bool> {
    let archaic = self_f.iter().any(|f| f == "ta" || f == "chung ta" || f == "tao")
        || addr_f.iter().any(|f| f == "nguoi" || f == "ma" || f == "cau");
    let modern = self_f.iter().any(|f| f == "toi" || f == "chung toi")
        || addr_f.iter().any(|f| matches!(f.as_str(), "anh" | "ngai" | "ban" | "ong" | "em"));
    match (archaic, modern) {
        (true, false) => Some(true),
        (false, true) => Some(false),
        _ => None,
    }
}

/// Audit một bản dịch. `speakers[i]` là speaker của dòng `i` (có thể rỗng).
pub fn audit(translations: &[String], speakers: &[&str]) -> PronounAudit {
    let mut out = PronounAudit { n_lines: translations.len(), ..Default::default() };

    let mut self_by_sp: BTreeMap<&str, BTreeSet<String>> = BTreeMap::new();
    let mut addr_by_pair: BTreeMap<(&str, &str), BTreeSet<String>> = BTreeMap::new();
    let mut registers: Vec<(&str, Option<bool>)> = Vec::with_capacity(translations.len());

    for (i, t) in translations.iter().enumerate() {
        let (sf, af) = detect(t);
        let sp = speakers.get(i).copied().unwrap_or("");
        self_by_sp.entry(sp).or_default().extend(sf.iter().cloned());
        if let Some(tgt) = target_of(speakers, i) {
            addr_by_pair.entry((sp, tgt)).or_default().extend(af.iter().cloned());
        }
        out.ta_count += count_self_family(t, "ta");
        out.toi_count += count_self_family(t, "toi");
        if af.contains("nguoi") {
            out.legacy_nguoi += 1;
        }
        if af.contains("anh") || af.contains("ngai") {
            out.modern_anh_ngai += 1;
        }
        registers.push((sp, register(&sf, &af)));
    }

    out.self_forms_total = self_by_sp.values().map(|s| s.len()).sum();
    out.self_forms_max = self_by_sp.values().map(|s| s.len()).max().unwrap_or(0);
    out.addr_forms_total = addr_by_pair.values().map(|s| s.len()).sum();
    out.addr_forms_max = addr_by_pair.values().map(|s| s.len()).max().unwrap_or(0);
    out.mix_ta_toi = self_by_sp
        .values()
        .filter(|s| s.iter().any(|f| f == "ta" || f == "chung ta") && s.iter().any(|f| f == "toi" || f == "chung toi"))
        .count();
    out.register_flips = registers
        .windows(2)
        .filter(|w| w[0].0 == w[1].0 && w[0].1.is_some() && w[1].1.is_some() && w[0].1 != w[1].1)
        .count();
    out
}

/// Người nghe trực tiếp của dòng `i` = speaker khác nhau đầu tiên xuất hiện sau đó.
fn target_of<'a>(speakers: &'a [&'a str], i: usize) -> Option<&'a str> {
    let sp = speakers.get(i).copied()?;
    speakers.iter().skip(i + 1).find(|s| **s != sp).copied()
}

/// Đếm số lần xuất hiện của họ đại từ `family` (`ta` hoặc `toi`), tính cả `chúng ta`/`chúng tôi`.
pub fn count_self_family(text: &str, family: &str) -> usize {
    let ws = normalize_words(text);
    let mut n = 0usize;
    let mut i = 0usize;
    while i < ws.len() {
        let w = ws[i].as_str();
        if w == "chung" && i + 1 < ws.len() && ws[i + 1] == family {
            n += 1;
            i += 2;
            continue;
        }
        if w == family {
            n += 1;
        }
        i += 1;
    }
    n
}

#[cfg(test)]
#[path = "pronoun_audit_tests.rs"]
mod tests;
