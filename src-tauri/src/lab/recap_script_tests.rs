//! Test kiểm luật dựng `R1`–`R6` + tỷ lệ thoại gốc (`recap_script.rs`).
//!
//! Chạy: `cargo test --lib lab`.

use super::*;

fn item(id: u32, source: usize, start: f64, end: f64, keep: bool) -> RecapItem {
    RecapItem {
        id,
        source_idx: source,
        start,
        end,
        picture: String::new(),
        narration: if keep {
            String::new()
        } else {
            format!("lời bình {id}")
        },
        keep_original: keep,
        tts_secs: if keep { None } else { Some(end - start) },
    }
}

/// Đoạn lời bình ở nguồn 0.
fn dialogue(id: u32, start: f64, end: f64) -> RecapItem {
    item(id, 0, start, end, false)
}

/// Đoạn giữ thoại gốc ở nguồn 0.
fn original(id: u32, start: f64, end: f64) -> RecapItem {
    item(id, 0, start, end, true)
}

fn rules(script: &RecapScript) -> Vec<Rule> {
    script.validate().into_iter().map(|v| v.rule).collect()
}

#[test]
fn r1_khong_duoc_mo_dau_bang_thoai_goc() {
    let script = RecapScript::new(vec![original(1, 0.0, 5.0), dialogue(2, 5.0, 10.0)]);
    let violations = script.validate();
    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].rule, Rule::R1);
    assert_eq!(violations[0].item_id, 1);
    assert!(violations[0].message_vi.contains("lời bình"), "có hướng dẫn sửa");

    let ok = RecapScript::new(vec![dialogue(1, 0.0, 5.0), original(2, 5.0, 10.0)]);
    assert!(ok.validate().is_empty());
}

#[test]
fn r2_toi_da_hai_doan_thoai_goc_lien_nhau() {
    let hai_doan = RecapScript::new(vec![
        dialogue(1, 0.0, 5.0),
        original(2, 5.0, 8.0),
        original(3, 8.0, 11.0),
    ]);
    assert!(hai_doan.validate().is_empty(), "2 đoạn liền nhau vẫn hợp lệ");

    let ba_doan = RecapScript::new(vec![
        dialogue(1, 0.0, 5.0),
        original(2, 5.0, 8.0),
        original(3, 8.0, 11.0),
        original(4, 11.0, 14.0),
    ]);
    let violations = ba_doan.validate();
    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].rule, Rule::R2);
    assert_eq!(violations[0].item_id, 4, "báo ở đoạn thứ 3 của chuỗi");
}

#[test]
fn r3_doi_nguon_phai_co_cau_noi_loi_binh() {
    let script = RecapScript::new(vec![dialogue(1, 0.0, 5.0), item(2, 1, 0.0, 4.0, true)]);
    let violations = script.validate();
    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].rule, Rule::R3);
    assert_eq!(violations[0].item_id, 2);
    assert!(violations[0].message_vi.contains("câu nối"));

    let ok = RecapScript::new(vec![dialogue(1, 0.0, 5.0), item(2, 1, 0.0, 4.0, false)]);
    assert!(ok.validate().is_empty(), "đổi nguồn nhưng đoạn sau là lời bình ⇒ hợp lệ");
}

#[test]
fn r4_khoang_thoi_gian_hop_le() {
    let zero = RecapScript::new(vec![dialogue(1, 5.0, 5.0)]);
    assert_eq!(rules(&zero), vec![Rule::R4], "end == start là sai");

    let nguoc = RecapScript::new(vec![dialogue(1, 9.0, 3.0)]);
    assert_eq!(rules(&nguoc), vec![Rule::R4], "end < start là sai");

    let am = RecapScript::new(vec![dialogue(1, -2.0, 3.0)]);
    assert_eq!(rules(&am), vec![Rule::R4], "start âm là sai");

    let vuot_nguon = RecapScript::new(vec![dialogue(1, 0.0, 40.0)]);
    let violations = vuot_nguon.validate_sources(&[30.0]);
    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].rule, Rule::R4);
    assert!(violations[0].message_vi.contains("vượt thời lượng"));

    let vua = RecapScript::new(vec![dialogue(1, 0.0, 30.0)]);
    assert!(vua.validate_sources(&[30.0]).is_empty(), "bằng đúng thời lượng thì hợp lệ");
}

#[test]
fn r5_khong_chong_thoi_gian_cung_nguon() {
    let script = RecapScript::new(vec![dialogue(1, 0.0, 10.0), dialogue(2, 5.0, 15.0)]);
    let violations = script.validate();
    assert!(violations.iter().any(|v| v.rule == Rule::R5 && v.item_id == 2));

    let khac_nguon = RecapScript::new(vec![dialogue(1, 0.0, 10.0), item(2, 1, 5.0, 15.0, false)]);
    assert!(khac_nguon.validate().is_empty(), "chồng thời gian khác nguồn là bình thường");

    let lien_ke = RecapScript::new(vec![dialogue(1, 0.0, 10.0), dialogue(2, 10.0, 20.0)]);
    assert!(lien_ke.validate().is_empty(), "nối tiếp sát nhau không phải chồng lấn");
}

#[test]
fn r6_loi_binh_phai_co_noi_dung() {
    let mut script = RecapScript::new(vec![dialogue(1, 0.0, 5.0)]);
    if let Some(first) = script.items.first_mut() {
        first.narration = "   ".to_string();
    }
    let violations = script.validate();
    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].rule, Rule::R6);

    let thoai_goc = RecapScript::new(vec![dialogue(1, 0.0, 5.0), original(2, 5.0, 8.0)]);
    assert!(
        thoai_goc.validate().is_empty(),
        "đoạn giữ thoại gốc không cần narration"
    );
}

#[test]
fn original_ratio_tinh_theo_thoi_luong() {
    let script = RecapScript::new(vec![dialogue(1, 0.0, 10.0), original(2, 10.0, 20.0)]);
    assert!((script.original_ratio() - 0.5).abs() < 1e-9);
    assert!((script.total_secs() - 20.0).abs() < 1e-9);

    assert_eq!(RecapScript::default().original_ratio(), 0.0, "kịch bản rỗng ⇒ 0");
    let chi_loi_binh = RecapScript::new(vec![dialogue(1, 0.0, 10.0)]);
    assert_eq!(chi_loi_binh.original_ratio(), 0.0);

    let chi_thoai_goc = RecapScript::new(vec![original(1, 0.0, 4.0), original(2, 4.0, 8.0)]);
    assert!((chi_thoai_goc.original_ratio() - 1.0).abs() < 1e-9);
}

#[test]
fn kich_ban_dung_het_luat_thi_khong_co_vi_pham() {
    let script = RecapScript::new(vec![
        dialogue(1, 0.0, 6.0),
        original(2, 6.0, 9.0),
        dialogue(3, 9.0, 15.0),
        item(4, 1, 0.0, 5.0, false),
        item(5, 1, 5.0, 8.0, true),
    ]);
    assert!(script.validate_sources(&[60.0, 30.0]).is_empty(), "{:?}", script.validate());
    assert!((script.original_ratio() - 6.0 / 23.0).abs() < 1e-9);
}
