//! Unit test cho `translate::contextual` — **không gọi mạng**.
//!
//! Bao phủ: hạn mức độ dài, prompt lượt 1 (có speaker), parse JSON tham chiếu
//! (thiếu trường / hỏng / bọc markdown), prompt lượt 2 (có `[speaker]`, có 5 câu
//! trước, có bảng xưng hô), cửa sổ trượt qua biên giới lô, parse output có thẻ.

use super::*;

fn line(id: &str, spk: &str, text: &str, start: f64, end: f64) -> ScriptLine {
    ScriptLine {
        id: id.to_string(),
        speaker_id: spk.to_string(),
        speaker_name: Some("Zeratul".to_string()),
        text: text.to_string(),
        start,
        end,
    }
}

// ---------- hạn mức độ dài ----------

#[test]
fn length_budget_theo_thoi_luong() {
    // 8 giây -> 8 * 5 = 40 âm tiết
    assert_eq!(length_budget(8.0), 40);
    // 2 giây -> 10 âm tiết
    assert_eq!(length_budget(2.0), 10);
}

#[test]
fn length_budget_luon_it_nhat_toi_thieu() {
    assert_eq!(length_budget(0.0), MIN_SYLLABLE_BUDGET);
    assert_eq!(length_budget(0.01), MIN_SYLLABLE_BUDGET);
    assert_eq!(length_budget(f64::NAN), MIN_SYLLABLE_BUDGET);
    assert_eq!(length_budget(-5.0), MIN_SYLLABLE_BUDGET);
}

// ---------- prompt lượt 1 ----------

#[test]
fn build_reference_prompt_co_speaker_va_ten() {
    let lines = vec![
        line("S1", "zeratul", "We are an ancient people.", 0.0, 3.0),
        line("S2", "kaldares", "Where are your warriors?", 3.0, 5.0),
    ];
    let p = build_reference_prompt(&lines, "en", "vi");
    assert!(p.contains("[S1]"), "phai co id dong: {p}");
    assert!(p.contains("speaker=zeratul"), "phai co speaker_id: {p}");
    assert!(p.contains("speaker=kaldares"), "phai co speaker thu 2: {p}");
    assert!(p.contains("We are an ancient people."), "phai co noi dung: {p}");
    // schema bat buoc
    assert!(p.contains("tom_tat"), "phai yeu cau tom_tat");
    assert!(p.contains("xung_ho"), "phai yeu cau xung_ho");
    assert!(p.contains("thuat_ngu"), "phai yeu cau thuat_ngu");
}

// ---------- parse JSON tham chiếu ----------

#[test]
fn parse_reference_json_hop_le() {
    let raw = r#"{"tom_tat":"Một thế giới protos.","nhan_vat":[{"speaker_id":"zeratul","ten":"Zeratul","gioi_tinh_doan":"nam","vai_tro":"tu sư"}],"xung_ho":[{"tu":"anh/em","den":"Kaldares","goi_la":"Kaldares","xung_la":"tôi"}],"thuat_ngu":[{"goc":"Kala","dich":"Kala"}],"giong_dieu":"trầm"}"#;
    let r = parse_reference(raw).expect("phai parse duoc");
    assert_eq!(r.tom_tat, "Một thế giới protos.");
    assert_eq!(r.nhan_vat.len(), 1);
    assert_eq!(r.nhan_vat[0].speaker_id, "zeratul");
    assert_eq!(r.xung_ho[0].goi_la, "Kaldares");
    assert_eq!(r.thuat_ngu[0].goc, "Kala");
}

#[test]
fn parse_reference_thieu_truong_khong_chet() {
    let raw = r#"{"tom_tat":"chỉ có tóm tắt"}"#;
    let r = parse_reference(raw).expect("thieu truong van phai parse duoc");
    assert_eq!(r.tom_tat, "chỉ có tóm tắt");
    assert!(r.nhan_vat.is_empty());
    assert!(r.xung_ho.is_empty());
    assert!(r.thuat_ngu.is_empty());
    assert!(r.giong_dieu.is_empty());
}

#[test]
fn parse_reference_json_hong_tra_err() {
    assert!(parse_reference("khong phai JSON").is_err());
    assert!(parse_reference("{\"a\": ").is_err());
}

#[test]
fn parse_reference_boc_trong_markdown_fence() {
    let raw = "```json\n{\"tom_tat\":\"abc\",\"nhan_vat\":[]}\n```";
    let r = parse_reference(raw).expect("phai bo qua fence");
    assert_eq!(r.tom_tat, "abc");
}

// ---------- prompt lượt 2 ----------

#[test]
fn build_translate_prompt_co_speaker_bang_xung_ho_va_context() {
    let chunk = vec![line("S7", "kaldares", "And tomorrow I send so many to die.", 10.0, 18.0)];
    let ctx = vec![
        ("We are an ancient people.".to_string(), "Chúng tôi là dân tộc cổ xưa.".to_string()),
        ("There are few of us left.".to_string(), "Giờ chỉ còn lại ít người.".to_string()),
    ];
    let mut reference = ScriptReference::default();
    reference.tom_tat = "Zeratul và Kaldares tranh luận.".to_string();
    reference.xung_ho.push(PronounRule {
        tu: "anh/em".into(),
        den: "Kaldares".into(),
        goi_la: "Kaldares".into(),
        xung_la: "tôi".into(),
    });
    let p = build_translate_prompt(
        &chunk,
        &ctx,
        &reference,
        &["- Giữ tên Kaldares".to_string()],
        None,
        "en",
        "vi",
    );
    assert!(p.contains("INPUT S7"), "phai co id dong: {p}");
    assert!(p.contains("speaker=kaldares"), "phai co speaker tren tung dong: {p}");
    assert!(p.contains("BẢNG XƯNG HÔ"), "phai co bang xung ho: {p}");
    assert!(p.contains("Kaldares"), "phai co noi dung xung ho: {p}");
    assert!(p.contains("LỜI THOẠI TRƯỚC ĐÓ"), "phai co khoi ngu canh: {p}");
    assert!(p.contains("Chúng tôi là dân tộc cổ xưa."), "phai co ban dich truoc: {p}");
    assert!(p.contains("GLOSSARY NGƯỜI DÙNG"), "phai co glossary nguoi dung: {p}");
    assert!(p.contains("~40 am tiet"), "phai co han muc do dai: {p}");
    assert!(p.contains("noi dung: And tomorrow I send so many to die."), "phai co noi dung dong can dich: {p}");
}

#[test]
fn reference_block_uu_tien_glossary_nguoi_dung() {
    let mut reference = ScriptReference::default();
    reference.thuat_ngu.push(GlossaryTerm { goc: "Kala".into(), dich: "Kala (tự động)".into() });
    let block = reference_block(&reference, &["Kala -> Kala (người dùng)".to_string()]);
    assert!(block.contains("THUẬT NGỮ PHIM"));
    assert!(block.contains("GLOSSARY NGƯỜI DÙNG"));
    // glossary nguoi dung phai xuat hien sau (uu tien cao hon)
    let i_auto = block.find("tự động").expect("co thuat ngu tu dong");
    let i_user = block.find("người dùng").expect("co glossary nguoi dung");
    assert!(i_user > i_auto, "glossary nguoi dung phai nam sau de uu tien cao hon");
}

#[test]
fn pronoun_examples_tieng_viet_khi_target_la_vi() {
    let vi = pronoun_examples("vi").to_lowercase();
    assert!(vi.contains("anh"), "vi du phai la tieng Viet: {vi}");
    assert!(vi.contains("em"), "vi du phai la tieng Viet: {vi}");
    assert!(vi.contains("tao"), "vi du phai la tieng Viet: {vi}");
    assert!(vi.contains("cậu"), "vi du phai la tieng Viet: {vi}");
    assert!(!pronoun_examples("en").to_lowercase().contains("tao"), "target khac Viet thi dung vi du tieng Anh");
}

// ---------- cửa sổ trượt ----------

#[test]
fn sliding_window_qua_bien_gioi_lo() {
    let all: Vec<String> = (1..=12).map(|i| i.to_string()).collect();
    // idx = 8 -> lấy 5 dòng ngay trước (index 3..7) => giá trị "4".."8"
    let w = sliding_window(&all, 8);
    assert_eq!(w, &["4", "5", "6", "7", "8"]);
    // idx nằm giữa lô (ví dụ 5) -> vẫn 5 dòng trước
    let w2 = sliding_window(&all, 5);
    assert_eq!(w2, &["1", "2", "3", "4", "5"]);
}

#[test]
fn sliding_window_khi_dau_khong_co_du_5_dong() {
    let all: Vec<String> = vec!["a".into(), "b".into()];
    assert_eq!(sliding_window(&all, 0).len(), 0);
    assert_eq!(sliding_window(&all, 1), &["a"]);
    let all3: Vec<String> = vec!["a".into(), "b".into(), "c".into()];
    assert_eq!(sliding_window(&all3, 2), &["a", "b"]);
}

// ---------- parse output lượt 2 ----------

#[test]
fn parse_tagged_lines_theo_the_id() {
    let ids = vec!["S1".to_string(), "S2".to_string()];
    let raw = "[S1] Chúng tôi là dân tộc cổ xưa.\n[S2] Giờ chỉ còn ít người.";
    let out = parse_tagged_lines(raw, &ids);
    assert_eq!(out[0].as_deref(), Some("Chúng tôi là dân tộc cổ xưa."));
    assert_eq!(out[1].as_deref(), Some("Giờ chỉ còn ít người."));
}

#[test]
fn parse_tagged_lines_khong_co_the_theo_thu_tu() {
    let ids = vec!["S1".to_string(), "S2".to_string()];
    let raw = "Chúng tôi là dân tộc cổ xưa.\nGiờ chỉ còn ít người.";
    let out = parse_tagged_lines(raw, &ids);
    assert_eq!(out[0].as_deref(), Some("Chúng tôi là dân tộc cổ xưa."));
    assert_eq!(out[1].as_deref(), Some("Giờ chỉ còn ít người."));
}

#[test]
fn parse_tagged_lines_thieu_dong_tra_none() {
    let ids = vec!["S1".to_string(), "S2".to_string()];
    let out = parse_tagged_lines("[S1] Chỉ một dòng.", &ids);
    assert_eq!(out[0].as_deref(), Some("Chỉ một dòng."));
    assert!(out[1].is_none(), "dong thieu phai la None");
}

#[test]
fn parse_tagged_lines_bo_qua_thoat_va_khong_thuoc_id() {
    let ids = vec!["S1".to_string()];
    let raw = "```\n[S1] Được.\n```";
    let out = parse_tagged_lines(raw, &ids);
    assert_eq!(out[0].as_deref(), Some("Được."));
}

#[test]
fn parse_tagged_lines_lop_metadata_khi_model_echo_nguyen_dong_input() {
    let ids = vec!["S1".to_string()];
    // model echo nguyên dòng INPUT kèm metadata
    let raw = "[S1] (speaker=zeratul, tên: Zeratul, dự kiến 20s, tối đa ~102 âm tiết): Nóng.";
    let out = parse_tagged_lines(raw, &ids);
    assert_eq!(out[0].as_deref(), Some("Nóng."), "phai lo het metadata: {out:?}");
}

#[test]
fn parse_tagged_lines_lop_dang_INPUT_va_lay_noi_dung() {
    let ids = vec!["S1".to_string()];
    let raw = "[S1] INPUT S1 | speaker=zeratul | noi dung: Xin chào";
    let out = parse_tagged_lines(raw, &ids);    assert_eq!(out[0].as_deref(), Some("Xin chào"), "phai lay phan noi dung: {out:?}");
}

#[test]
fn prompt_co_bang_da_duyet_dat_truoc_bang_tham_chieu() {
    use crate::translate::glossary::{empty, GlossaryTerm, PronounEntry};
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
    let chunk = vec![line("S1", "zeratul", "You speak of the Dark Templar.", 0.0, 5.0)];
    let p = build_translate_prompt(
        &chunk,
        &[],
        &ScriptReference::default(),
        &[],
        Some(&g),
        "en",
        "vi",
    );
    let i_hard = p.find("RÀNG BUỘC CỨNG").expect("phai co block rang buoc cung");
    let i_ref = p.find("BẢN THAM CHIẾU").expect("phai co bang tham chieu");
    assert!(i_hard < i_ref, "bang da duyet phai dat TRUOC bang tham chieu");
    assert!(p.contains("Dark Templar"), "{p}");
    assert!(p.contains("Mẫu Tử Tối"), "{p}");
    assert!(p.contains("ngươi"), "{p}");
    assert!(p.contains("PHẢI theo bảng đã duyệt"), "{p}");
}
