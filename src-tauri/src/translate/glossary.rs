//! Bảng **thuật ngữ + xưng hô do người dùng duyệt** (TSK-FEAT-GLOSSARY-PRONOUN).
//!
//! Vì sao cần: bảng xưng hô LLM tự bịa ở lượt 1 ("đọc hiểu") **không đáng tin** —
//! đo thật (BENCH §4.4.3) cho thấy model tự sinh bảng rồi vẫn không tuân thủ.
//! Cách chắc chắn là bảng do **người dùng xác nhận**, dùng như **ràng buộc cứng**.
//!
//! Cấu trúc lưu trữ (JSON):
//! ```json
//! {
//!   "terms":    [{ "source": "Dark Templar", "target": "Mẫu Tử Tối", "note": "tên chức vị" }],
//!   "pronouns": [{ "speaker": "zeratul", "listener": "kaldares",
//!                  "selfTerm": "ta", "addressTerm": "ngươi" }],
//!   "locked":   true
//! }
//! ```
//!
//! Module này chỉ chứa **logic thuần** (không gọi mạng, không đụng đĩa) để unit test được.

use serde::{Deserialize, Serialize};

/// 1 cặp thuật ngữ / tên riêng: "Dark Templar" → "Mẫu Tử Tối".
///
/// `target` rỗng ⇒ dòng này chỉ là **ghi chú tự do** (kế thừa từ `config.glossary` cũ).
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryTerm {
    /// Từ gốc (tiếng nguồn) — "Dark Templar".
    #[serde(default)]
    pub source: String,
    /// Bản dịch đã duyệt — "Mẫu Tử Tối".
    #[serde(default)]
    pub target: String,
    /// Ghi chú tự do (không bắt buộc).
    #[serde(default)]
    pub note: Option<String>,
}

impl GlossaryTerm {
    /// Dòng này là ghi chú (không có cặp gốc → dịch).
    pub fn is_note_only(&self) -> bool {
        self.target.trim().is_empty()
    }
}

/// 1 quy tắc xưng hô giữa 2 nhân vật: A tự xưng "ta", gọi B là "ngươi".
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PronounEntry {
    /// `speaker_id` (hoặc tên) của người nói.
    #[serde(default)]
    pub speaker: String,
    /// `speaker_id` (hoặc tên) của người nghe.
    #[serde(default)]
    pub listener: String,
    /// Từ A tự xưng — "ta", "tôi".
    #[serde(default)]
    pub self_term: String,
    /// Từ A gọi B — "ngươi", "anh", "ngài".
    #[serde(default)]
    pub address_term: String,
}

/// Bảng glossary đã duyệt.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Glossary {
    /// Cặp thuật ngữ / tên riêng.
    #[serde(default)]
    pub terms: Vec<GlossaryTerm>,
    /// Quy tắc xưng hô.
    #[serde(default)]
    pub pronouns: Vec<PronounEntry>,
    /// Người dùng đã **khoá** bảng ⇒ bỏ qua bước LLM tự sinh bảng xưng hô.
    #[serde(default)]
    pub locked: bool,
    /// Nơi đang lưu: "project" | "global" (read-only — cho UI hiển thị).
    #[serde(default)]
    pub scope: String,
    /// Đường dẫn file đang lưu (read-only — cho UI hiển thị).
    #[serde(default)]
    pub path: Option<String>,
}

/// 1 nhân vật do LLM gợi ý (lượt 1) — người dùng duyệt mới thành quy tắc.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryCharacter {
    #[serde(default)]
    pub speaker_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub role: String,
}

/// Kết quả `glossary_suggest` — **gợi ý**, chưa ghi gì cả.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossarySuggestion {
    pub characters: Vec<GlossaryCharacter>,
    pub terms: Vec<GlossaryTerm>,
    pub pronouns: Vec<PronounEntry>,
}

/// Bảng rỗng (chưa có gì).
pub fn empty() -> Glossary {
    Glossary {
        terms: Vec::new(),
        pronouns: Vec::new(),
        locked: false,
        scope: String::new(),
        path: None,
    }
}

impl Glossary {
    /// Bảng có nội dung dùng được không?
    pub fn is_empty(&self) -> bool {
        self.terms.is_empty() && self.pronouns.is_empty()
    }

    /// Đọc tương thích ngược từ `config.glossary: Vec<String>` (chuỗi tự do).
    ///
    /// - `"a=b"`, `"a = b"`, `"a → b"`, `"a => b"`, `"a -> b"` ⇒ **term** (gốc → dịch).
    /// - còn lại ⇒ **ghi chú** (giữ nguyên làm note, không ép vào cặp).
    pub fn from_legacy(lines: &[String]) -> Glossary {
        let mut g = empty();
        for raw in lines {
            let s = raw.trim();
            if s.is_empty() {
                continue;
            }
            match split_pair(s) {
                Some((src, dst)) if !src.trim().is_empty() => g.terms.push(GlossaryTerm {
                    source: src.trim().to_string(),
                    target: dst.trim().to_string(),
                    note: None,
                }),
                _ => g.terms.push(GlossaryTerm {
                    source: s.to_string(),
                    target: String::new(),
                    note: Some(s.to_string()),
                }),
            }
        }
        g.normalise();
        g
    }

    /// Cắt khoảng trắng thừa, bỏ dòng rỗng, loại trùng.
    pub fn normalise(&mut self) {
        self.terms.retain(|t| !t.source.trim().is_empty());
        for t in &mut self.terms {
            t.source = t.source.trim().to_string();
            t.target = t.target.trim().to_string();
            if let Some(n) = t.note.as_mut() {
                *n = n.trim().to_string();
                if n.is_empty() {
                    t.note = None;
                }
            }
        }
        self.pronouns.retain(|p| {
            !p.speaker.trim().is_empty() || !p.listener.trim().is_empty()
        });
        for p in &mut self.pronouns {
            p.speaker = p.speaker.trim().to_string();
            p.listener = p.listener.trim().to_string();
            p.self_term = p.self_term.trim().to_string();
            p.address_term = p.address_term.trim().to_string();
        }
        // loại trùng (cùng gốc / cùng cặp)
        let mut seen_terms: Vec<String> = Vec::new();
        self.terms.retain(|t| {
            let key = t.source.to_lowercase();
            if seen_terms.contains(&key) {
                false
            } else {
                seen_terms.push(key);
                true
            }
        });
        let mut seen_pairs: Vec<String> = Vec::new();
        self.pronouns.retain(|p| {
            let key = format!(
                "{}|{}",
                p.speaker.to_lowercase(),
                p.listener.to_lowercase()
            );
            if seen_pairs.contains(&key) {
                false
            } else {
                seen_pairs.push(key);
                true
            }
        });
    }

    /// Gộp bảng khác vào bảng này (bảng mới thắng khi trùng gốc / trùng cặp).
    pub fn merge(&mut self, other: &Glossary) {
        for t in &other.terms {
            self.terms.retain(|x| !x.source.eq_ignore_ascii_case(&t.source));
            self.terms.push(t.clone());
        }
        for p in &other.pronouns {
            self.pronouns.retain(|x| {
                !(x.speaker.eq_ignore_ascii_case(&p.speaker)
                    && x.listener.eq_ignore_ascii_case(&p.listener))
            });
            self.pronouns.push(p.clone());
        }
        if other.locked {
            self.locked = true;
        }
        self.normalise();
    }

    /// Quy tắc xưng hô của 1 người nói (tất cả người nghe).
    ///
    /// Quy tắc có `speaker` rỗng (chưa xác định người nói) bị **bỏ qua** — không
    /// thể dùng để kiểm tra.
    pub fn rules_for_speaker(&self, speaker: &str) -> Vec<&PronounEntry> {
        let sp = speaker.trim().to_lowercase();
        if sp.is_empty() {
            return Vec::new();
        }
        self.pronouns
            .iter()
            .filter(|p| {
                !p.speaker.trim().is_empty() && p.speaker.trim().to_lowercase() == sp
            })
            .collect()
    }

    /// Quy tắc xưng hô giữa đúng 2 người.
    pub fn find_rule(&self, speaker: &str, listener: &str) -> Option<&PronounEntry> {
        let sp = speaker.trim().to_lowercase();
        let li = listener.trim().to_lowercase();
        if sp.is_empty() {
            return None;
        }
        self.pronouns.iter().find(|p| {
            p.speaker.trim().to_lowercase() == sp && p.listener.trim().to_lowercase() == li
        })
    }

    /// Danh sách dòng "quy tắc" dạng tự do — dùng cho đường dịch cũ (`glossary_block`).
    pub fn to_rules(&self) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for t in &self.terms {
            if t.is_note_only() {
                if let Some(n) = &t.note {
                    out.push(n.clone());
                }
                continue;
            }
            match t.note.as_deref().filter(|n| !n.trim().is_empty()) {
                Some(n) => out.push(format!("{} -> {}  ({})", t.source, t.target, n.trim())),
                None => out.push(format!("{} -> {}", t.source, t.target)),
            }
        }
        for p in &self.pronouns {
            let mut s = format!(
                "{} xung \"{}\", goi {} la \"{}\"",
                p.speaker, p.self_term, p.listener, p.address_term
            );
            if !p.address_term.trim().is_empty() {
                s.push_str(&format!(" (goi nguoi khac: {})", p.address_term));
            }
            out.push(s);
        }
        out
    }

    /// Block **ràng buộc cứng** nhét vào prompt (ưu tiên hơn bảng LLM tự sinh).
    pub fn hard_block(&self) -> String {
        if self.is_empty() {
            return String::new();
        }
        let mut s = String::from(
            "\nBẢNG THUẬT NGỮ & XƯNG HÔ ĐÃ DUYỆT (NGƯỜI DÙNG XÁC NHẬN — RÀNG BUỘC CỨNG, PHẢI TUÂN THỦ TUYỆT ĐỐI, ƯU TIÊN CAO HƠN MỌI BẢNG TỰ SUY ĐOÁN):\n",
        );
        for t in &self.terms {
            if t.is_note_only() {
                if let Some(n) = &t.note {
                    s.push_str(&format!("- GHI CHÚ: {n}\n"));
                }
                continue;
            }
            match t.note.as_deref().filter(|n| !n.trim().is_empty()) {
                Some(n) => s.push_str(&format!("- \"{}\" PHẢI dịch thành \"{}\" ({})\n", t.source, t.target, n.trim())),
                None => s.push_str(&format!("- \"{}\" PHẢI dịch thành \"{}\"\n", t.source, t.target)),
            }
        }
        for p in &self.pronouns {
            s.push_str(&format!(
                "- {} PHẢI tự xưng \"{}\" và gọi {} là \"{}\"\n",
                p.speaker, p.self_term, p.listener, p.address_term
            ));
        }
        s.push_str(
            "- Nếu không tuân thủ được quy tắc nào ở trên, vẫn phải cố tuân thủ; tuyệt đối không tự đổi đại từ.\n",
        );
        s
    }
}

/// Tách "gốc → dịch" từ 1 dòng glossary cũ.
fn split_pair(s: &str) -> Option<(String, String)> {
    for sep in ["=>", "→", "->", "="] {
        if let Some(pos) = s.find(sep) {
            let (a, b) = s.split_at(pos);
            let b = &b[sep.len()..];
            if a.trim().is_empty() {
                return None;
            }
            return Some((a.to_string(), b.to_string()));
        }
    }
    None
}

/// Bản tham chiếu (lượt 1) → **gợi ý** bảng glossary cho người dùng duyệt.
///
/// Không ghi gì — chỉ trả về để UI hiển thị dạng "✓ nhận / ✕ bỏ".
///
/// Lưu ý: bản tham chiếu của LLM **không** nói rõ ai là người nói ⇒ `speaker` để
/// trống, người dùng chọn sau.
pub fn suggestion_from_reference(
    reference: &super::contextual_types::ScriptReference,
) -> GlossarySuggestion {
    let mut out = GlossarySuggestion::default();
    for c in &reference.nhan_vat {
        out.characters.push(GlossaryCharacter {
            speaker_id: c.speaker_id.clone(),
            name: c.ten.clone(),
            role: c.vai_tro.clone(),
        });
    }
    for t in &reference.thuat_ngu {
        if t.goc.trim().is_empty() {
            continue;
        }
        out.terms.push(GlossaryTerm {
            source: t.goc.trim().to_string(),
            target: t.dich.trim().to_string(),
            note: None,
        });
    }
    for p in &reference.xung_ho {
        if p.den.trim().is_empty() {
            continue;
        }
        out.pronouns.push(PronounEntry {
            speaker: String::new(),
            listener: p.den.trim().to_string(),
            self_term: p.xung_la.trim().to_string(),
            address_term: p.goi_la.trim().to_string(),
        });
    }
    out
}

#[cfg(test)]
#[path = "glossary_tests.rs"]
mod tests;
