use super::*;

fn g() -> Glossary {
    let mut g = empty();
    g.terms.push(GlossaryTerm {
        source: "Dark Templar".into(),
        target: "Mẫu Tử Tối".into(),
        note: None,
    });
    g.pronouns.push(PronounEntry {
        speaker: "zeratul".into(),
        listener: "kaldares".into(),
        self_term: "ta".into(),
        address_term: "ngươi".into(),
    });
    g
}

#[test]
fn from_legacy_doc_dung_va_dich() {
    let out = Glossary::from_legacy(&[
        "Dark Templar=Mẫu Tử Tối".to_string(),
        "Kala → Kala".to_string(),
    ]);
    assert_eq!(out.terms.len(), 2);
    assert_eq!(out.terms[0].source, "Dark Templar");
    assert_eq!(out.terms[0].target, "Mẫu Tử Tối");
    assert_eq!(out.terms[1].target, "Kala");
}

#[test]
fn from_legacy_giu_phan_khong_co_dau_bang_gi_chu() {
    let out = Glossary::from_legacy(&["Zeratul xưng ta, gọi Kaldares là ngươi".to_string()]);
    assert_eq!(out.terms.len(), 1);
    assert!(out.terms[0].is_note_only());
    assert_eq!(out.terms[0].note.as_deref(), Some("Zeratul xưng ta, gọi Kaldares là ngươi"));
}

#[test]
fn from_legacy_bỏ_dòng_rỗng() {
    let out = Glossary::from_legacy(&["  ".to_string(), "a=b".to_string()]);
    assert_eq!(out.terms.len(), 1);
}

#[test]
fn normalise_bỏ_trùng_va_cắt_khoảng_trắng() {
    let mut x = g();
    x.terms.push(GlossaryTerm {
        source: "  dark templar ".into(),
        target: "khác".into(),
        note: None,
    });
    x.normalise();
    assert_eq!(x.terms.len(), 1, "trùng gốc phải bị loại");
    assert_eq!(x.terms[0].target, "Mẫu Tử Tối", "dòng đầu giữ nguyên");
}

#[test]
fn merge_bảng_mới_thắng_khi_trùng_gốc() {
    let mut a = g();
    let mut b = empty();
    b.terms.push(GlossaryTerm {
        source: "Dark Templar".into(),
        target: "Mẫu Tử Tối (mới)".into(),
        note: None,
    });
    a.merge(&b);
    assert_eq!(a.terms.len(), 1);
    assert_eq!(a.terms[0].target, "Mẫu Tử Tối (mới)");
}

#[test]
fn hard_block_nói_rõ_la_rang_buoc_cung() {
    let block = g().hard_block();
    assert!(block.contains("RÀNG BUỘC CỨNG"), "{block}");
    assert!(block.contains("Dark Templar"), "{block}");
    assert!(block.contains("Mẫu Tử Tối"), "{block}");
    assert!(block.contains("zeratul"), "{block}");
    assert!(block.contains("ngươi"), "{block}");
}

#[test]
fn hard_block_rong_khi_bang_rong() {
    assert!(empty().hard_block().is_empty());
}

#[test]
fn to_rules_cho_duong_dich_cu() {
    let rules = g().to_rules();
    assert!(rules.iter().any(|r| r.contains("Dark Templar -> Mẫu Tử Tối")));
    assert!(rules.iter().any(|r| r.contains("zeratul")));
}

#[test]
fn find_rule_khong_phan_biet_hoa_thuong() {
    let x = g();
    assert!(x.find_rule("Zeratul", "KALDARES").is_some());
    assert!(x.find_rule("zeratul", "artanis").is_none());
}

#[test]
fn rules_for_speaker_loc_dung_nguoi() {
    let x = g();
    assert_eq!(x.rules_for_speaker("zeratul").len(), 1);
    assert_eq!(x.rules_for_speaker("artanis").len(), 0);
}

#[test]
fn is_empty_dung_khi_bang_rong() {
    assert!(empty().is_empty());
    assert!(!g().is_empty());
}
