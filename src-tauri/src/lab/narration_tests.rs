//! Test logic thuần của bước B (`lab/narration.rs`).

use super::*;

fn line(start: f64, end: f64, text: &str) -> TranscriptLine {
    TranscriptLine {
        source_idx: 0,
        start,
        end,
        text: text.to_string(),
    }
}

#[test]
fn tach_cau_theo_dau_cau_tieng_viet() {
    let sentences = split_sentences("Anh cứ ngỡ mình là kẻ duy nhất sống sót. Thế giới không đợi! Vậy thì sao?");
    assert_eq!(sentences.len(), 3);
    assert!(sentences[0].starts_with("Anh cứ"));
    assert!(sentences[1].ends_with('!'));
}

#[test]
fn tach_bo_keo_trang_thua() {
    assert!(split_sentences("   \n  ").is_empty());
    assert!(split_sentences("!!!").is_empty());
    assert_eq!(split_sentences("Một câu.").len(), 1);
}

#[test]
fn tach_doan_1_den_3_cau() {
    let text = "Câu một. Câu hai. Câu ba. Câu bốn. Câu năm.";
    let segments = split_into_segments(text, 3);
    assert_eq!(segments.len(), 2, "3 câu + 2 câu");
    assert!(segments[0].contains("Câu ba"));
    assert!(segments[1].contains("Câu năm"));
}

#[test]
fn tach_doan_rong_thi_bo() {
    assert!(split_into_segments("", 3).is_empty());
    assert!(split_into_segments("   \n  ", 3).is_empty());
}

#[test]
fn tach_doan_giu_nguyen_dau_cau() {
    let text = "Câu một. Câu hai. Câu ba.";
    let segments = split_into_segments(text, 3);
    assert_eq!(segments.len(), 1);
    assert!(segments[0].starts_with("Câu một"));
    assert!(segments[0].ends_with("Câu ba."));
}

#[test]
fn uoc_luong_thoi_luong_theo_cong_thuc_4_5() {
    // 45 từ / 4,5 = 10 giây.
    let text = "a ".repeat(45);
    assert!((estimate_tts_secs(&text) - 10.0).abs() < 1e-6);
    assert_eq!(estimate_tts_secs(""), 0.0);
}

#[test]
fn chon_cau_stt_hay_nhat_trong_chuong() {
    let lines = vec![
        line(0.0, 2.0, "Ok"),
        line(1.0, 3.0, "Ngươi không biết mình vừa đánh thức thứ gì đâu!"),
        line(4.0, 6.0, "A"),
    ];
    let best = pick_best_original_line(&lines, 0, 0.0, 10.0).expect("phải có câu");
    assert!(best.text.contains("đánh thức"));
}

#[test]
fn chon_cau_stt_chi_trong_nguon_va_khoang() {
    let lines = vec![line(0.0, 2.0, "Câu dài đáng kể ở đây")];
    assert!(pick_best_original_line(&lines, 1, 0.0, 10.0).is_none(), "nguồn khác");
    assert!(pick_best_original_line(&lines, 0, 20.0, 30.0).is_none(), "ngoài khoảng");
}

#[test]
fn chia_khoang_thoi_gian_chuong() {
    let parts = distribute_range(0.0, 60.0, 3);
    assert_eq!(parts.len(), 3);
    assert_eq!(parts[0], (0.0, 20.0));
    assert_eq!(parts[2], (40.0, 60.0), "đoạn cuối kết thúc đúng điểm cuối");
}

#[test]
fn chia_khoang_rong_thi_ve_mot_phan() {
    let parts = distribute_range(0.0, 0.0, 1);
    assert_eq!(parts.len(), 1);
    assert_eq!(parts[0], (0.0, 0.0));
}

#[test]
fn so_sanh_tieng_viet_bo_dau() {
    assert!(mentions("Ngươi không biết mình vừa đánh thức thứ gì đâu", "đánh thức"));
    assert!(!mentions("Câu không liên quan", "đánh thức"));
    assert!(!mentions("Câu", ""));
}

#[test]
fn lam_sach_llm_text_bo_fence_va_dau_tieu_de() {
    assert_eq!(
        clean_llm_text("```\nCâu lời bình.\n```"),
        "Câu lời bình."
    );
    assert_eq!(clean_llm_text("## Tiêu đề\n\nCâu lời bình."), "Tiêu đề\n\nCâu lời bình.");
    assert_eq!(clean_llm_text("  \"Câu lời bình.\"  "), "Câu lời bình.");
}

#[test]
fn che_do_viet_lai_co_nhan() {
    assert_eq!(RewriteMode::Shorter.label(), "Ngắn hơn");
    assert!(RewriteMode::Dramatic.instruction().contains("KỊCH TÍNH"));
    assert!(RewriteMode::Bridge.instruction().contains("CÂU NỐI"));
}
