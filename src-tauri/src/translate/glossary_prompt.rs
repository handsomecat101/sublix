//! Sinh **prompt ràng buộc cứng** + gợi ý từ bản tham chiếu cho bảng glossary.
//!
//! Tách riêng khỏi [`super::glossary`] để mỗi file < 300 dòng.
//! API công khai **không đổi**: `Glossary::to_rules()`, `Glossary::hard_block()` và
//! `glossary::suggestion_from_reference()` vẫn gọi được như cũ.

use super::glossary::{
    Glossary, GlossaryCharacter, GlossarySuggestion, GlossaryTerm, PronounEntry,
};
use super::contextual_types::ScriptReference;

impl Glossary {
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

/// Bản tham chiếu (lượt 1) → **gợi ý** bảng glossary cho người dùng duyệt.
///
/// Không ghi gì — chỉ trả về để UI hiển thị dạng "✓ nhận / ✕ bỏ".
///
/// Lưu ý: bản tham chiếu của LLM **không** nói rõ ai là người nói ⇒ `speaker` để
/// trống, người dùng chọn sau.
pub fn suggestion_from_reference(reference: &ScriptReference) -> GlossarySuggestion {
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
