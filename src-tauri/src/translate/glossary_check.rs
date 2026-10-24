//! Hậu kiểm **tất định**: câu dịch có vi phạm bảng glossary đã duyệt không?
//!
//! Không gọi mạng — chỉ so sánh bản dịch với bảng người dùng đã khoá:
//! - **Thuật ngữ**: bản dịch còn **giữ nguyên** từ gốc (ví dụ "Dark Templar") mà không
//!   dùng bản dịch đã duyệt ("Mẫu Tử Tối") ⇒ vi phạm.
//! - **Xưng hô**: dùng sai từ tự xưng hoặc gọi sai người so với bảng đã duyệt.
//!
//! Kết quả được gắn vào `ContextualLine.glossary_violation` để UI tô vàng.

use std::collections::BTreeSet;

use super::glossary::Glossary;
use super::pronoun_audit::{
    address_terms, normalize_term, normalize_words, self_family, self_terms,
};

/// Loại vi phạm.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ViolationKind {
    /// Dùng sai thuật ngữ.
    Term,
    /// Dùng sai xưng hô.
    Pronoun,
}

impl ViolationKind {
    /// Chuỗi hiển thị cho UI.
    pub fn as_str(&self) -> &'static str {
        match self {
            ViolationKind::Term => "term",
            ViolationKind::Pronoun => "pronoun",
        }
    }
}

/// 1 vi phạm (để UI hiện tooltip).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Violation {
    pub kind: ViolationKind,
    /// Mô tả ngắn bằng tiếng Việt, ví dụ: `gọi "ngươi" thay vì "anh"`.
    pub detail: String,
}

/// Kiểm tra 1 câu đã dịch.
///
/// - `speaker` — `speaker_id` (hoặc tên) của người nói.
/// - `listener` — `speaker_id` của người nghe (nếu biết).
///
/// Trả `None` nếu câu không vi phạm gì.
pub fn check_line(
    translated: &str,
    speaker: &str,
    listener: Option<&str>,
    glossary: &Glossary,
) -> Option<Violation> {
    if glossary.is_empty() {
        return None;
    }
    check_terms(translated, glossary).or_else(|| check_pronouns(translated, speaker, listener, glossary))
}

/// Vi phạm thuật ngữ: bản dịch còn giữ từ gốc mà không dùng bản dịch đã duyệt.
fn check_terms(translated: &str, glossary: &Glossary) -> Option<Violation> {
    let low = translated.to_lowercase();
    for t in &glossary.terms {
        let src = t.source.trim();
        let dst = t.target.trim();
        if src.is_empty() || dst.is_empty() {
            continue; // ghi chú tự do — không kiểm được
        }
        // từ gốc còn sót trong bản dịch?
        if !low.contains(&src.to_lowercase()) {
            continue;
        }
        // ...mà bản dịch đã duyệt cũng không có ⇒ vi phạm
        if !low.contains(&dst.to_lowercase()) {
            return Some(Violation {
                kind: ViolationKind::Term,
                detail: format!("chưa dịch \"{src}\" thành \"{dst}\""),
            });
        }
    }
    None
}

/// Vi phạm xưng hô: sai tự xưng, hoặc gọi nhầm người.
fn check_pronouns(
    translated: &str,
    speaker: &str,
    listener: Option<&str>,
    glossary: &Glossary,
) -> Option<Violation> {
    let mut found_addr = address_terms(translated);
    let mut found_self = self_terms(translated);
    // "Mẫu Tử Tối" chứa "Tối" — KHÔNG phải đại từ "tôi". Bỏ các từ nằm trong
    // thuật ngữ đã duyệt để không báo nhầm.
    exclude_term_tokens(&mut found_self, &mut found_addr, translated, glossary);
    if found_addr.is_empty() && found_self.is_empty() {
        return None;
    }

    // 1) Có đúng quy tắc cho cặp (speaker, listener)?
    if let Some(li) = listener {
        if let Some(rule) = glossary.find_rule(speaker, li) {
            let want_addr = normalize_term(&rule.address_term);
            let want_self = self_family(&normalize_term(&rule.self_term));
            if !want_addr.is_empty() {
                for a in &found_addr {
                    if a != &want_addr {
                        return Some(Violation {
                            kind: ViolationKind::Pronoun,
                            detail: format!(
                                "gọi \"{}\" thay vì \"{}\" (với {})",
                                a, rule.address_term, rule.listener
                            ),
                        });
                    }
                }
            }
            if !want_self.is_empty() {
                for s in &found_self {
                    // "mình" = phản thân ("chính mình") — KHÔNG phải tự xưng, không kiểm.
                    if s == "minh" {
                        continue;
                    }
                    // "chúng ta" / "chúng tôi" = dạng tập thể — hợp lệ với cả "ta" lẫn "tôi".
                    if s.starts_with("chung ")
                        && (want_self == "ta" || want_self == "toi")
                    {
                        continue;
                    }
                    if self_family(s) != want_self {
                        return Some(Violation {
                            kind: ViolationKind::Pronoun,
                            detail: format!(
                                "tự xưng \"{}\" thay vì \"{}\"",
                                s, rule.self_term
                            ),
                        });
                    }
                }
            }
            return None;
        }
    }

    // 2) Không có quy tắc đúng cặp → có gọi nhầm từ của người nghe khác không?
    let rules = glossary.rules_for_speaker(speaker);
    if rules.is_empty() {
        return None;
    }
    for a in &found_addr {
        for r in &rules {
            let other = normalize_term(&r.address_term);
            if !other.is_empty() && a == &other {
                return Some(Violation {
                    kind: ViolationKind::Pronoun,
                    detail: format!("gọi nhầm \"{}\" (chỉ dùng cho {})", a, r.listener),
                });
            }
        }
    }
    None
}

/// Bỏ các đại từ nằm **bên trong** thuật ngữ đã duyệt và xuất hiện trong câu.
///
/// Ví dụ: bảng duyệt "Dark Templar" → "Mẫu Tử Tối"; câu *"Anh nói về Mẫu Tử Tối."*
/// có "Tối" nhưng đó **không phải** đại từ "tôi" ⇒ không được báo vi phạm.
fn exclude_term_tokens(
    found_self: &mut BTreeSet<String>,
    found_addr: &mut BTreeSet<String>,
    translated: &str,
    glossary: &Glossary,
) {
    let low = translated.to_lowercase();
    for t in &glossary.terms {
        let target = t.target.trim();
        if target.is_empty() || !low.contains(&target.to_lowercase()) {
            continue;
        }
        for tok in normalize_words(target) {
            found_self.remove(&tok);
            found_addr.remove(&tok);
        }
    }
}

#[cfg(test)]
#[path = "glossary_check_tests.rs"]
mod tests;
