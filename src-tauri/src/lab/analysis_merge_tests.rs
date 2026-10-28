//! Test gộp chương/nhân vật (`lab/analysis_merge.rs`).

use super::*;

fn line(source_idx: usize, start: f64, end: f64, text: &str) -> TranscriptLine {
    TranscriptLine {
        source_idx,
        start,
        end,
        text: text.to_string(),
    }
}

/// Đặc trưng cảnh rỗng (không dùng `Default` — `SceneFeatures` không có).
fn features() -> crate::lab::cutscene::SceneFeatures {
    crate::lab::cutscene::SceneFeatures {
        letterbox_cover: 0.0,
        letterbox_strength: 0.0,
        hardsub_cover: 0.0,
        dialogue_density: 0.0,
        silence_cover: 0.0,
    }
}

fn chunk(source_idx: usize, start: f64, end: f64, lines: Vec<TranscriptLine>) -> TranscriptChunk {
    TranscriptChunk {
        source_idx,
        start,
        end,
        lines,
    }
}

// ───────────────────────────── Chuẩn hoá tên ─────────────────────────────

#[test]
fn chuan_hoa_ten_bo_dau_tieng_viet() {
    assert_eq!(normalize_name("Kael"), "kael");
    assert_eq!(normalize_name("  Kael  "), "kael");
    assert_eq!(normalize_name("Đại Tướng Quân"), "daituongquan");
}

// ───────────────────────────── Gộp nhân vật ─────────────────────────────

#[test]
fn gop_nhan_vat_trung_ten_giua_nhieu_cum() {
    let batches = vec![
        vec![LlmCharacter {
            name: "Kael".into(),
            role: "Nhân vật chính".into(),
            motivation: "trả thù".into(),
            ..Default::default()
        }],
        vec![LlmCharacter {
            name: "kael".into(),
            role: "".into(),
            motivation: "".into(),
            ..Default::default()
        }],
    ];
    let transcript = vec![line(0, 0.0, 1.0, "Kael nói gì đó"), line(0, 1.0, 2.0, "không ai nói")];
    let merged = merge_characters(&batches, &transcript);
    assert_eq!(merged.len(), 1, "cùng tên ⇒ 1 dòng");
    assert_eq!(merged[0].name, "Kael");
    assert_eq!(merged[0].role, "Nhân vật chính");
    assert_eq!(merged[0].lines_count, 1);
    assert!(merged[0].merged_notice.is_some(), "gộp 2 lần ⇒ có ghi chú");
    assert_eq!(merged[0].motivation.as_deref(), Some("trả thù"));
}

#[test]
fn gop_nhan_vat_giu_ten_rieng_khi_khac_ten() {
    let batches = vec![vec![
        LlmCharacter { name: "Kael".into(), ..Default::default() },
        LlmCharacter { name: "Elora".into(), ..Default::default() },
    ]];
    let merged = merge_characters(&batches, &[]);
    assert_eq!(merged.len(), 2);
    assert_eq!(merged[0].id, "c1");
    assert_eq!(merged[1].id, "c2");
    assert!(merged[0].merged_notice.is_none());
}

#[test]
fn gop_nhan_vat_bo_ten_rong() {
    let batches = vec![vec![LlmCharacter { name: "  ".into(), ..Default::default() }]];
    assert!(merge_characters(&batches, &[]).is_empty());
}

#[test]
fn dem_cau_theo_ten_khong_phan_biet_dau() {
    let transcript = vec![
        line(0, 0.0, 1.0, "kael đến gần"),
        line(0, 1.0, 2.0, "Kael nói: đi"),
        line(0, 2.0, 3.0, "trời mưa"),
    ];
    assert_eq!(count_lines_for(&transcript, "Kael"), 2);
    assert_eq!(count_lines_for(&transcript, ""), 0);
}

// ───────────────────────────── Khoảng thời gian ─────────────────────────────

#[test]
fn parse_khoang_thoi_gian_dau_tien() {
    let (start, end) = parse_time_range("00:00:15,000-00:03:45,000").expect("phải parse được");
    assert!((start - 15.0).abs() < 1e-6);
    assert!((end - 225.0).abs() < 1e-6);
}

#[test]
fn parse_khoang_thoi_gian_co_tien_to_p() {
    let (start, end) = parse_time_range("P1 00:00:15 → 00:18:30").expect("phải parse được");
    assert!((start - 15.0).abs() < 1e-6);
    assert!((end - 1110.0).abs() < 1e-6);
}

#[test]
fn parse_khoang_thoi_gian_hong_thoi_tra_none() {
    assert_eq!(parse_time_range("không có gì"), None);
    assert_eq!(parse_time_range("00:03:00-00:01:00"), None, "end < start ⇒ None");
}

// ───────────────────────────── Dựng chương ─────────────────────────────

#[test]
fn dem_canh_va_cau_theo_khoang() {
    let scenes = vec![SceneSegment {
        source_idx: 0,
        start: 10.0,
        end: 20.0,
        score: 0.8,
        features: features(),
    }];
    let transcript = vec![
        line(0, 12.0, 13.0, "a"),
        line(0, 14.0, 15.0, "b"),
        line(0, 100.0, 101.0, "ngoài khoảng"),
    ];
    assert_eq!(count_scenes(&scenes, 0, 0.0, 30.0), 1);
    assert_eq!(count_lines(&transcript, 0, 0.0, 30.0), 2);
    assert_eq!(count_scenes(&scenes, 1, 0.0, 30.0), 0, "nguồn khác không tính");
}

#[test]
fn dung_chuong_tu_llm() {
    let llm = LlmChapter {
        chapter_idx: 1,
        source_idx: 0,
        title: " Mở đầu ".into(),
        time_range: "00:00:15,000-00:03:45,000".into(),
        r#type: "cutscene".into(),
        core_event: "gặp Melina".into(),
        narrative_function: "Mở đầu".into(),
    };
    let chunk = chunk(0, 0.0, 600.0, vec![]);
    let scenes = vec![SceneSegment {
        source_idx: 0,
        start: 20.0,
        end: 30.0,
        score: 0.9,
        features: features(),
    }];
    let transcript = vec![line(0, 16.0, 17.0, "chào")];
    let chapter = build_chapter(1, &llm, &chunk, &scenes, &transcript);
    assert_eq!(chapter.id, 1);
    assert_eq!(chapter.title, "Mở đầu", "cắt khoảng trắng");
    assert_eq!(chapter.source_idx, 0);
    assert!((chapter.duration_sec - 210.0).abs() < 1e-6);
    assert_eq!(chapter.cutscenes_count, 1);
    assert_eq!(chapter.lines_count, 1);
    assert!(chapter.included);
    assert!(chapter.summary.contains("gặp Melina"));
    assert!(chapter.summary.contains("Mở đầu"));
    assert_eq!(chapter.chapter_type.as_deref(), Some("cutscene"));
}

#[test]
fn dung_chuong_khi_llm_khong_co_khoang_thoi_gian_dung_cum() {
    let llm = LlmChapter {
        title: "Vô danh".into(),
        core_event: "x".into(),
        ..Default::default()
    };
    let chunk = chunk(0, 30.0, 90.0, vec![]);
    let chapter = build_chapter(1, &llm, &chunk, &[], &[]);
    assert!((chapter.duration_sec - 60.0).abs() < 1e-6, "lấy khoảng của cụm");
}

#[test]
fn gop_chuong_nhieu_cum_danh_so_lai() {
    let c1 = chunk(0, 0.0, 600.0, vec![]);
    let c2 = chunk(0, 600.0, 1200.0, vec![]);
    let batches = vec![
        (
            vec![
                LlmChapter { title: "A".into(), ..Default::default() },
                LlmChapter { title: "B".into(), ..Default::default() },
            ],
            c1,
            false,
        ),
        (vec![LlmChapter { title: "C".into(), ..Default::default() }], c2, false),
    ];
    let chapters = merge_chapters(&batches, &[], &[]);
    assert_eq!(chapters.len(), 3);
    assert_eq!(chapters.iter().map(|c| c.id).collect::<Vec<_>>(), vec![1, 2, 3]);
}

#[test]
fn gop_chuong_giu_nguon_cua_llm() {
    let c0 = chunk(0, 0.0, 600.0, vec![]);
    let batches = vec![(
        vec![LlmChapter {
            source_idx: 1,
            title: "từ nguồn 1".into(),
            ..Default::default()
        }],
        c0,
        false,
    )];
    let chapters = merge_chapters(&batches, &[], &[]);
    assert_eq!(chapters[0].source_idx, 1);
}

#[test]
fn mau_avatar_xoay_vong() {
    assert_eq!(avatar_color(0), avatar_color(6));
    assert_ne!(avatar_color(0), avatar_color(1));
}
