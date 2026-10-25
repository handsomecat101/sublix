//! Unit test cho parser khoan dung của JSON lượt 1 (TSK-FIX-BUG-H23).
//!
//! Không gọi mạng — chỉ parse chuỗi JSON tĩnh.

use super::*;

fn p(s: &str) -> Result<ScriptReference, String> {
    parse_reference_lenient(s)
}

#[test]
fn object_chuan_parse_duoc() {
    let raw = r#"{"tom_tat":"Một thế giới protos.","nhan_vat":[{"speaker_id":"zeratul","ten":"Zeratul","vai_tro":"tu sư"}],
        "xung_ho":[{"tu":"anh/em","den":"Kaldares","goi_la":"anh","xung_la":"tôi"}],
        "thuat_ngu":[{"goc":"Kala","dich":"Kala"}],"giong_dieu":"trầm"}"#;
    let r = p(raw).expect("phai parse duoc");
    assert_eq!(r.tom_tat, "Một thế giới protos.");
    assert_eq!(r.nhan_vat.len(), 1);
    assert_eq!(r.nhan_vat[0].speaker_id, "zeratul");
    assert_eq!(r.xung_ho.len(), 1);
    assert_eq!(r.xung_ho[0].goi_la, "anh");
    assert_eq!(r.thuat_ngu.len(), 1);
    assert_eq!(r.thuat_ngu[0].goc, "Kala");
    assert_eq!(r.giong_dieu, "trầm");
}

#[test]
fn chuoi_cu_nhieu_kieu_dau() {
    let raw = r#"{"thuat_ngu":["Dark Templar => Mẫu Tử Tối","a → b","a=b","c -> d","e: f"]}"#;
    let r = p(raw).expect("phai parse duoc");
    assert_eq!(r.thuat_ngu.len(), 5);
    assert_eq!(r.thuat_ngu[0].goc, "Dark Templar");
    assert_eq!(r.thuat_ngu[0].dich, "Mẫu Tử Tối");
    assert_eq!(r.thuat_ngu[1].goc, "a");
    assert_eq!(r.thuat_ngu[1].dich, "b");
    assert_eq!(r.thuat_ngu[2].goc, "a");
    assert_eq!(r.thuat_ngu[3].goc, "c");
    assert_eq!(r.thuat_ngu[4].goc, "e");
    assert_eq!(r.thuat_ngu[4].dich, "f");
}

#[test]
fn tron_object_va_chuoi() {
    let raw = r#"{"thuat_ngu":[{"goc":"Kala","dich":"Cala"},"Dark Templar => Mẫu Tử Tối"]}"#;
    let r = p(raw).expect("phai parse duoc");
    assert_eq!(r.thuat_ngu.len(), 2);
    assert_eq!(r.thuat_ngu[0].goc, "Kala");
    assert_eq!(r.thuat_ngu[1].goc, "Dark Templar");
}

#[test]
fn phan_tu_rac_bi_bo_qua_nhung_phan_khac_con_lai() {
    let raw = r#"{"tom_tat":"abc","thuat_ngu":[123,null,{"goc":"OK"},"khong tach duoc"],"nhan_vat":["x",7]}"#;
    let r = p(raw).expect("phai parse duoc");
    assert_eq!(r.tom_tat, "abc");
    // chỉ giữ 2 phần tử hợp lệ: object {goc:OK} + chuỗi "khong tach duoc" (không có dấu tách)
    let gocs: Vec<String> = r.thuat_ngu.iter().map(|t| t.goc.clone()).collect();
    assert!(gocs.contains(&"OK".to_string()), "{gocs:?}");
    assert!(!gocs.contains(&"123".to_string()), "{gocs:?}");
    // nhân vật hỏng hết -> mảng rỗng, KHÔNG làm hỏng thuật ngữ
    assert!(r.nhan_vat.is_empty());
    assert!(!r.thuat_ngu.is_empty());
}

#[test]
fn pronouns_hong_nhung_terms_van_tot() {
    let raw = r#"{"thuat_ngu":[{"goc":"Kala","dich":"Cala"}],"xung_ho":[42,{"den":"Kaldares","goi_la":"anh","xung_la":"tôi"}]}"#;
    let r = p(raw).expect("phai parse duoc");
    assert_eq!(r.thuat_ngu.len(), 1, "terms phai con nguyen");
    assert_eq!(r.xung_ho.len(), 1, "pronoun object hop le van con");
    assert_eq!(r.xung_ho[0].den, "Kaldares");
}

#[test]
fn terms_hong_nhung_pronouns_van_tot() {
    let raw = r#"{"thuat_ngu":[123,null],"xung_ho":[{"den":"Kaldares","goi_la":"anh","xung_la":"tôi"}]}"#;
    let r = p(raw).expect("phai parse duoc");
    assert!(r.thuat_ngu.is_empty(), "terms hong phai lam hong pronouns");
    assert_eq!(r.xung_ho.len(), 1);
}

#[test]
fn pronouns_dang_chuoi_duoc_tach() {
    let raw = r#"{"xung_ho":["Kaldares: gọi là anh, tự xưng tôi"]}"#;
    let r = p(raw).expect("phai parse duoc");
    assert_eq!(r.xung_ho.len(), 1);
    assert_eq!(r.xung_ho[0].den, "Kaldares");
    assert_eq!(r.xung_ho[0].goi_la, "anh");
    assert_eq!(r.xung_ho[0].xung_la, "tôi");
}

#[test]
fn code_fence_va_chu_thua_truoc_sau() {
    let raw = "Đây là kết quả:\n```json\n{\"tom_tat\":\"abc\",\"thuat_ngu\":[\"a => b\"]}\n```\nHết.";
    let r = p(raw).expect("phai bo qua fence + chu thua");
    assert_eq!(r.tom_tat, "abc");
    assert_eq!(r.thuat_ngu.len(), 1);
    assert_eq!(r.thuat_ngu[0].goc, "a");
}

#[test]
fn json_hong_han_phan_phai_tra_loi() {
    assert!(p("khong phai JSON").is_err());
    assert!(p("{\"a\": ").is_err());
    assert!(p("[]").is_err(), "mang rong -> khong lay duoc gi");
    assert!(p("{}").is_err(), "object rong -> khong lay duoc gi");
}

#[test]
fn nhan_key_tieng_anh() {
    let raw = r#"{"summary":"abc","characters":[{"speaker_id":"z","name":"Zeratul"}],"terms":["a => b"],"pronouns":[{"den":"K","goi_la":"anh"}]}"#;
    let r = p(raw).expect("phai parse duoc");
    assert_eq!(r.tom_tat, "abc");
    assert_eq!(r.nhan_vat.len(), 1);
    assert_eq!(r.nhan_vat[0].speaker_id, "z");
    assert_eq!(r.thuat_ngu.len(), 1);
    assert_eq!(r.xung_ho.len(), 1);
}

#[test]
fn object_dung_alias_source_target() {
    let raw = r#"{"terms":[{"source":"Dark Templar","target":"Mẫu Tử Tối"}]}"#;
    let r = p(raw).expect("phai parse duoc");
    assert_eq!(r.thuat_ngu.len(), 1);
    assert_eq!(r.thuat_ngu[0].goc, "Dark Templar");
    assert_eq!(r.thuat_ngu[0].dich, "Mẫu Tử Tối");
}

/// Gọi **thật** `glossary_suggest` với Ollama local (`qwen2.5:3b` — model hay trả
/// thuật ngữ dạng chuỗi) để chứng minh lỗi BUG-H23 đã hết.
///
/// ```powershell
/// cargo test --lib -- --ignored glossary_suggest_that_voi_ollama_local --nocapture
/// ```
#[test]
#[ignore = "can Ollama local"]
fn glossary_suggest_that_voi_ollama_local() {
    use crate::config::AppConfig;
    use crate::translate::contextual::build_reference_prompt;
    use crate::translate::server::chat_completion_custom;

    let mut cfg = AppConfig::load_or_default();
    cfg.translation_provider = "ollama".to_string();
    if cfg.ollama_model.trim().is_empty() {
        cfg.ollama_model = "qwen2.5:3b".to_string();
    }

    let lines: Vec<crate::translate::contextual_types::ScriptLine> = [
        ("S1", "zeratul", "I wish to be alone."),
        ("S2", "zeratul", "We are an ancient people."),
        ("S3", "kaldares", "Kaldares, your warriors question your whereabouts."),
        ("S4", "zeratul", "You speak of the Dark Templar."),
        ("S5", "artanis", "The great Kala brought us the Aon of Strife."),
        ("S6", "zeratul", "And tomorrow I send so many to die."),
    ]
    .iter()
    .map(|(id, spk, text)| crate::translate::contextual_types::ScriptLine {
        id: id.to_string(),
        speaker_id: spk.to_string(),
        speaker_name: None,
        text: text.to_string(),
        start: 0.0,
        end: 6.0,
    })
    .collect();

    let user = build_reference_prompt(&lines, "en", "vi");
    let system = "Bạn là biên tập viên kịch bản. Trả về DUY NHẤT một JSON hợp lệ, không markdown, không giải thích.";
    let raw = chat_completion_custom(&cfg, "ollama", &cfg.ollama_model, system, &user, 180)
        .expect("Ollama phai tra ve ket qua");
    eprintln!("=== RAW LLM ===\n{raw}\n=== END RAW ===");

    // Parse CỨNG (đường cũ) — thường FAIL với model local.
    if let (Some(s), Some(e)) = (raw.find('{'), raw.rfind('}')) {
        let hard = serde_json::from_str::<ScriptReference>(&raw[s..=e]);
        eprintln!("PARSE CUNG (duong cu): {}", if hard.is_ok() { "OK" } else { "FAIL" });
    }

    // Parse KHOAN DUNG (đường mới) — phải lấy được gì.
    let r = parse_reference_lenient(&raw).expect("parse khoan dung phai thanh cong");
    eprintln!(
        "PARSE KHOAN DUNG: terms={} pronouns={} nhan_vat={} tom_tat_len={}",
        r.thuat_ngu.len(),
        r.xung_ho.len(),
        r.nhan_vat.len(),
        r.tom_tat.len()
    );
    for t in &r.thuat_ngu {
        eprintln!("  term: \"{}\" -> \"{}\"", t.goc, t.dich);
    }
    for p in &r.xung_ho {
        eprintln!("  pronoun: den={} goi_la={} xung_la={}", p.den, p.goi_la, p.xung_la);
    }

    assert!(
        !r.thuat_ngu.is_empty() || !r.xung_ho.is_empty(),
        "phai lay duoc goi y (khong duoc mat trong)"
    );
}
