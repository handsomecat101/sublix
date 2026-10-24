use super::super::glossary::{empty, Glossary, GlossaryTerm, PronounEntry};
use super::*;

fn g() -> Glossary {
    let mut x = empty();
    x.terms.push(GlossaryTerm {
        source: "Dark Templar".into(),
        target: "Mẫu Tử Tối".into(),
        note: None,
    });
    x.pronouns.push(PronounEntry {
        speaker: "zeratul".into(),
        listener: "kaldares".into(),
        self_term: "ta".into(),
        address_term: "anh".into(),
    });
    x
}

#[test]
fn bang_rong_khong_bao_vi_pham() {
    assert!(check_line("Bất cứ câu nào.", "zeratul", Some("kaldares"), &empty()).is_none());
}

#[test]
fn thuat_ngu_con_sot_goc_la_vi_pham() {
    let v = check_line(
        "Ngươi nói đến Dark Templar.",
        "zeratul",
        Some("kaldares"),
        &g(),
    )
    .expect("phai bao vi pham");
    assert_eq!(v.kind, ViolationKind::Term);
    assert!(v.detail.contains("Dark Templar"), "{}", v.detail);
}

#[test]
fn thuat_ngu_da_dung_khong_bao() {
    assert!(
        check_line(
            "Anh nói về Mẫu Tử Tối.",
            "zeratul",
            Some("kaldares"),
            &g()
        )
        .is_none()
    );
}

#[test]
fn goi_sai_bao_vi_pham_xung_ho() {
    let v = check_line(
        "Ngươi nói về Mẫu Tử Tối.",
        "zeratul",
        Some("kaldares"),
        &g(),
    )
    .expect("phai bao vi pham");
    assert_eq!(v.kind, ViolationKind::Pronoun);
    assert!(v.detail.contains("anh"), "{}", v.detail);
}

#[test]
fn tu_xung_sai_bao_vi_pham() {
    let v = check_line(
        "Tôi muốn được ở một mình.",
        "zeratul",
        Some("kaldares"),
        &g(),
    )
    .expect("phai bao vi pham");
    assert_eq!(v.kind, ViolationKind::Pronoun);
    assert!(v.detail.contains("tự xưng"), "{}", v.detail);
}

#[test]
fn chung_ta_va_ta_cung_duoc_coi_la_giot_nhau() {
    // bảng quy định tự xưng "ta" -> "chúng ta" vẫn đúng
    let v = check_line(
        "Chúng ta là một dân tộc cổ xưa.",
        "zeratul",
        Some("kaldares"),
        &g(),
    );
    assert!(v.is_none(), "không được báo nhầm: {v:?}");
}

#[test]
fn goi_nham_nguoi_khong_co_quy_tac_dung_duoc() {
    let mut x = g();
    x.pronouns.push(PronounEntry {
        speaker: "zeratul".into(),
        listener: "artanis".into(),
        self_term: "ta".into(),
        address_term: "ngươi".into(),
    });
    // Zeratul nói với người thứ 3 (không có quy tắc) nhưng dùng từ của Kaldares
    let v = check_line("Anh hãy trở về.", "zeratul", Some("kuldar"), &x);
    assert!(v.is_some(), "dung tu cua cap khac phai bao");
}

#[test]
fn cau_khong_co_dai_tu_thi_khong_bao() {
    assert!(check_line("Xin chào.", "zeratul", Some("kaldares"), &g()).is_none());
}

#[test]
fn minh_la_phan_than_khong_phai_tu_xung() {
    // "chính động cơ của mình" — "mình" là phản thân, KHÔNG phải tự xưng
    let mut x = g();
    x.pronouns[0].self_term = "tôi".to_string(); // câu này tự xưng "Tôi" (đúng)
    assert!(
        check_line(
            "Tôi nghi ngờ chính động cơ của mình.",
            "zeratul",
            Some("kaldares"),
            &x
        )
        .is_none(),
        "phản thân 'mình' không được báo vi phạm"
    );
}

#[test]
fn dang_tap_the_duoc_phep() {
    // "chúng ta" là dạng tập thể — hợp lệ khi bảng quy định tự xưng "ta" hoặc "tôi"
    for expected in ["ta", "tôi"] {
        let mut x = g();
        x.pronouns[0].self_term = expected.to_string();
        assert!(
            check_line(
                "Chúng ta là một dân tộc cổ xưa.",
                "zeratul",
                Some("kaldares"),
                &x
            )
            .is_none(),
            "dạng tập thể phải được chấp nhận (self_term = {expected})"
        );
    }
}

#[test]
fn tu_xung_that_khong_the_dang_tap_the_thi_bao() {
    // "tao" (thô) thay vì "tôi" ⇒ vi phạm thật
    let v = check_line(
        "Tao nói với anh đây.",
        "zeratul",
        Some("kaldares"),
        &g(),
    );
    assert!(v.is_some(), "'tao' thay vì 'tôi' phải báo vi phạm");
}

/// Chẩn đoán: đọc file kết quả bench + bảng glossary → in từng vi phạm kèm lý do.
///
/// ```powershell
/// $env:GLOSSARY_RESULT="$env:TEMP\sub-bench-translate\results\ctx-new-minimax-glossary.json"
/// $env:GLOSSARY_FILE="$env:TEMP\sub-bench-translate\en_src\starcraft_glossary.json"
/// $env:GLOSSARY_DATASET="$env:TEMP\sub-bench-translate\en_src\starcraft_en.json"
/// cargo test --lib -- --ignored audit_vi_pham_tu_file_ket_qua --nocapture
/// ```
#[test]
#[ignore = "can file ket qua bench"]
fn audit_vi_pham_tu_file_ket_qua() {
    let result = std::env::var("GLOSSARY_RESULT").expect("GLOSSARY_RESULT");
    let gfile = std::env::var("GLOSSARY_FILE").expect("GLOSSARY_FILE");
    let dfile = std::env::var("GLOSSARY_DATASET").expect("GLOSSARY_DATASET");

    let g = crate::translate::glossary_store::load_file(std::path::Path::new(&gfile))
        .expect("doc bang glossary");
    let raw = std::fs::read_to_string(&result).expect("doc ket qua");
    let v: serde_json::Value = serde_json::from_str(&raw).expect("parse ket qua");
    let trs: Vec<String> = v["translations"]
        .as_array()
        .expect("translations")
        .iter()
        .map(|x| x.as_str().unwrap_or("").to_string())
        .collect();
    let draw = std::fs::read_to_string(&dfile).expect("doc dataset");
    let dv: serde_json::Value = serde_json::from_str(&draw).expect("parse dataset");
    let speakers: Vec<String> = dv
        .as_array()
        .expect("dataset")
        .iter()
        .map(|l| l["speaker_id"].as_str().unwrap_or("").to_string())
        .collect();

    let mut n = 0usize;
    for (i, t) in trs.iter().enumerate() {
        let sp = speakers.get(i).cloned().unwrap_or_default();
        // người nghe = speaker khác nhau đầu tiên sau dòng này
        let listener = speakers
            .iter()
            .skip(i + 1)
            .find(|s| **s != sp)
            .cloned();
        if let Some(vi) = check_line(t, &sp, listener.as_deref(), &g) {
            n += 1;
            eprintln!(
                "VIO #{n:02} line {:02} speaker={} listener={} :: {} :: {}",
                i + 1,
                sp,
                listener.clone().unwrap_or_default(),
                vi.kind.as_str(),
                vi.detail
            );
            eprintln!("      {}", t);
        }
    }
    eprintln!("=== TONG: {} / {} dong vi pham ===", n, trs.len());
}
