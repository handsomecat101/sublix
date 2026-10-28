//! TSK-LAB-CORE (C1) — **lọc rác** trong thoại/OCR (intro, outro, quảng cáo, donate…).
//!
//! Ý tưởng lấy từ NarratoAI `script_matching.py` (MIT — `docs/RECAP_TOOLS_DEEPDIVE.md`
//! §2.1.C): cấm ghép lời bình vào intro/outro, đọc quảng cáo, cảm ơn donate, "đăng ký
//! kênh"… Nếu bỏ sót, bản recap sẽ có câu "nhớ đăng ký kênh nhé" chen giữa cao trào.
//!
//! Cách làm: hai lớp luật **độc lập**, cùng đánh dấu một câu là rác —
//!
//! 1. **Từ khoá** ([`AD_KEYWORDS`]) — áp cho mọi câu, ở mọi vị trí. So khớp trên văn
//!    bản đã **bỏ dấu tiếng Việt + viết thường** ⇒ STT kiểu "dang ky kenh" vẫn khớp
//!    "đăng ký kênh"; tiếng Trung/Anh giữ nguyên.
//! 2. **Vị trí** — câu nằm trong [`JunkOptions::intro_secs`] đầu video mà có từ khoá
//!    chào hỏi ([`INTRO_KEYWORDS`]) ⇒ `Intro`; câu nằm trong `outro_secs` cuối video mà
//!    có từ khoá kết thúc ([`OUTRO_KEYWORDS`]) ⇒ `Outro`.
//!
//! Sau đó **gộp** các khoảng cách nhau < [`JunkOptions::merge_gap_secs`] để khỏi cắt
//! vụn (một đoạn quảng cáo thường bị STT tách thành nhiều câu).
//!
//! **Giới hạn đã biết** (chấp nhận, ghi rõ để không ai tưởng là hoàn hảo):
//! - So khớp **chuỗi con** ⇒ câu như *"tôi đang tải lại màn chơi"* vẫn bị coi là rác vì
//!   chứa "đang tải" (cố ý: màn loading hiếm khi có thoại). Câu chỉ có "tải" đơn lẻ
//!   (*"hãy tải bản đồ này"*) **không** bị lọc.
//! - Không hiểu ngữ nghĩa: quảng cáo không có từ khoá sẽ lọt; câu cốt truyện có từ
//!   "tài trợ"/"quảng cáo" (hiếm) sẽ bị bỏ.
//! - Chỉ nhận **một video nguồn** mỗi lần gọi (intro/outro tính theo video đó); gọi
//!   riêng cho từng video rồi nối kết quả.

use serde::{Deserialize, Serialize};

/// Một câu thoại (STT) hoặc chữ trên hình (OCR) trong video nguồn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogLine {
    /// Bắt đầu (giây, trong video nguồn).
    pub start: f64,
    /// Kết thúc (giây).
    pub end: f64,
    /// Nội dung câu.
    pub text: String,
}

impl DialogLine {
    pub fn new(start: f64, end: f64, text: impl Into<String>) -> Self {
        Self {
            start,
            end,
            text: text.into(),
        }
    }
}

/// Lý do một khoảng bị coi là rác (hiển thị được trên UI).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JunkReason {
    /// Khớp từ khoá quảng cáo/đăng ký/donate (kèm từ khoá khớp).
    Keyword(String),
    /// Câu chào hỏi ở đầu video.
    Intro,
    /// Câu kết thúc ở cuối video.
    Outro,
}

impl JunkReason {
    /// Mô tả tiếng Việt để tooltip / log.
    pub fn describe(&self) -> String {
        match self {
            JunkReason::Keyword(word) => format!("từ khoá “{word}”"),
            JunkReason::Intro => "chào hỏi đầu video".to_string(),
            JunkReason::Outro => "kết thúc cuối video".to_string(),
        }
    }
}

/// Một khoảng rác trong video nguồn — `allocate` sẽ **không** lấy cảnh trong khoảng này.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JunkRange {
    /// Video nguồn (0-based).
    pub source_idx: usize,
    /// Bắt đầu (giây).
    pub start: f64,
    /// Kết thúc (giây).
    pub end: f64,
    /// Các lý do (có thể nhiều: vừa quảng cáo vừa là outro).
    pub reasons: Vec<JunkReason>,
}

impl JunkRange {
    /// Khoảng có chồng lên `[start, end)` không.
    pub fn overlaps(&self, start: f64, end: f64) -> bool {
        self.start < end && start < self.end
    }
}

/// Ngưỡng của bộ lọc — mặc định theo `docs/XUONG_AI_PLAN.md` §1 (60 s đầu/cuối).
#[derive(Debug, Clone, PartialEq)]
pub struct JunkOptions {
    /// Vùng "đầu video" để bắt chào hỏi (giây).
    pub intro_secs: f64,
    /// Vùng "cuối video" để bắt kết thúc (giây).
    pub outro_secs: f64,
    /// Gộp 2 khoảng rác cách nhau ít hơn ngưỡng này (giây).
    pub merge_gap_secs: f64,
}

impl Default for JunkOptions {
    fn default() -> Self {
        Self {
            intro_secs: 60.0,
            outro_secs: 60.0,
            merge_gap_secs: 2.0,
        }
    }
}

/// Từ khoá "rác" — Việt / Anh / Trung + trạng thái kỹ thuật. **Sửa thẳng ở đây.**
pub const AD_KEYWORDS: &[&str] = &[
    // Việt
    "đăng ký kênh", "đăng kí kênh", "nhấn chuông", "bấm chuông", "ủng hộ kênh",
    "nhà tài trợ", "tài trợ", "quảng cáo", "mã giảm giá", "link mô tả",
    "cảm ơn các bạn đã ủng hộ", "donate",
    // Anh
    "subscribe", "like and subscribe", "hit the bell", "sponsor", "sponsored",
    "patreon", "thanks for watching", "link in the description",
    // Trung
    "关注", "点赞", "投币", "订阅", "赞助", "广告", "下集预告", "扫码",
    // Kỹ thuật (màn hình chờ)
    "loading", "đang tải",
];

/// Từ khoá chào hỏi — chỉ tính là rác khi nằm trong `intro_secs` đầu video.
pub const INTRO_KEYWORDS: &[&str] = &[
    "xin chào", "chào mừng", "chào các bạn", "hôm nay mình", "hôm nay chúng ta",
    "welcome back", "hello everyone", "hi guys",
    "大家好", "欢迎",
];

/// Từ khoá kết thúc — chỉ tính là rác khi nằm trong `outro_secs` cuối video.
pub const OUTRO_KEYWORDS: &[&str] = &[
    "hẹn gặp lại", "cảm ơn đã xem", "cảm ơn các bạn đã xem", "thanks for watching",
    "see you next", "đừng quên đăng ký",
    "下次见", "感谢观看", "记得订阅",
];

/// Tìm các khoảng rác của **một** video nguồn.
///
/// `total_secs` = thời lượng video (giây) để tính vùng intro/outro và kẹp biên.
/// Kết quả sắp xếp theo thời gian, đã gộp khoảng sát nhau.
pub fn find_junk(
    source_idx: usize,
    lines: &[DialogLine],
    total_secs: f64,
    options: &JunkOptions,
) -> Vec<JunkRange> {
    if total_secs <= 0.0 || lines.is_empty() {
        return Vec::new();
    }
    let outro_from = (total_secs - options.outro_secs).max(0.0);

    let mut ranges: Vec<JunkRange> = Vec::new();
    for line in lines {
        let start = line.start.max(0.0);
        let end = line.end.min(total_secs);
        if !start.is_finite() || !end.is_finite() || end <= start {
            continue;
        }
        let folded = fold(&line.text);
        let mut reasons: Vec<JunkReason> = Vec::new();

        for keyword in AD_KEYWORDS {
            if folded.contains(&fold(keyword)) {
                push_reason(&mut reasons, JunkReason::Keyword((*keyword).to_string()));
            }
        }
        if start < options.intro_secs && contains_any(&folded, INTRO_KEYWORDS) {
            push_reason(&mut reasons, JunkReason::Intro);
        }
        if end > outro_from && contains_any(&folded, OUTRO_KEYWORDS) {
            push_reason(&mut reasons, JunkReason::Outro);
        }
        if reasons.is_empty() {
            continue;
        }

        ranges.push(JunkRange {
            source_idx,
            start,
            end,
            reasons,
        });
    }

    ranges.sort_by(|a, b| a.start.total_cmp(&b.start));
    let merged = merge_ranges(ranges, options.merge_gap_secs, total_secs);
    tracing::debug!(
        source = source_idx,
        lines = lines.len(),
        junk = merged.len(),
        "lab: đã lọc rác"
    );
    merged
}

fn push_reason(reasons: &mut Vec<JunkReason>, reason: JunkReason) {
    if !reasons.contains(&reason) {
        reasons.push(reason);
    }
}

fn contains_any(folded: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|keyword| folded.contains(&fold(keyword)))
}

/// Gộp các khoảng cách nhau < `gap` giây (giữ lý do của cả hai).
fn merge_ranges(
    ranges: Vec<JunkRange>,
    gap: f64,
    total_secs: f64,
) -> Vec<JunkRange> {
    let mut out: Vec<JunkRange> = Vec::with_capacity(ranges.len());
    for range in ranges {
        match out.last_mut() {
            Some(last) if range.start - last.end < gap => {
                last.end = last.end.max(range.end).min(total_secs);
                for reason in range.reasons {
                    push_reason(&mut last.reasons, reason);
                }
            }
            _ => out.push(range),
        }
    }
    out
}

/// Bỏ dấu tiếng Việt + viết thường ("Đăng Ký Kênh" ⇒ "dang ky kenh").
pub fn fold(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        for lower in ch.to_lowercase() {
            out.push(deaccent(lower));
        }
    }
    out
}

fn deaccent(ch: char) -> char {
    const GROUPS: [(char, &str); 8] = [
        ('a', "àáảãạăằắẳẵặâầấẩẫậ"),
        ('e', "èéẻẽẹêềếểễệ"),
        ('i', "ìíỉĩị"),
        ('o', "òóỏõọôồốổỗộơờớởỡợ"),
        ('u', "ùúủũụưừứửữự"),
        ('y', "ỳýỷỹỵ"),
        ('d', "đ"),
        ('c', "ç"),
    ];
    for (base, variants) in GROUPS {
        if variants.contains(ch) {
            return base;
        }
    }
    ch
}

#[cfg(test)]
#[path = "junk_filter_tests.rs"]
mod junk_filter_tests;
