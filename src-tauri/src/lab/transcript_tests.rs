//! Test thoại + chia cụm (`lab/transcript.rs`).

use super::*;

fn line(source_idx: usize, start: f64, end: f64, text: &str) -> TranscriptLine {
    TranscriptLine {
        source_idx,
        start,
        end,
        text: text.to_string(),
    }
}

#[test]
fn chia_cum_theo_thoi_luong() {
    let lines = vec![
        line(0, 0.0, 100.0, "a"),
        line(0, 100.0, 200.0, "b"),
        line(0, 200.0, 300.0, "c"),
    ];
    let chunks = chunk_by_time(&lines, 250.0);
    assert_eq!(chunks.len(), 2, "2 cụm: [0-200] và [200-300]");
    assert_eq!(chunks[0].lines.len(), 2);
    assert_eq!(chunks[0].start, 0.0);
    assert_eq!(chunks[0].end, 200.0);
    assert_eq!(chunks[1].lines.len(), 1);
}

#[test]
fn chia_cum_va_cum_theo_nguon() {
    let lines = vec![
        line(0, 0.0, 100.0, "a"),
        line(1, 100.0, 200.0, "b"),
    ];
    let chunks = chunk_by_time(&lines, 1000.0);
    assert_eq!(chunks.len(), 2, "không gộp 2 nguồn vào 1 cụm");
    assert_eq!(chunks[0].source_idx, 0);
    assert_eq!(chunks[1].source_idx, 1);
}

#[test]
fn cau_dai_hon_gioi_han_van_tao_cum_rieng() {
    let lines = vec![line(0, 0.0, 900.0, "câu dài")];
    let chunks = chunk_by_time(&lines, 100.0);
    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].lines.len(), 1, "không cắt câu");
}

#[test]
fn chia_cum_rong() {
    assert!(chunk_by_time(&[], 100.0).is_empty());
}

#[test]
fn chia_cum_voi_gioi_han_0_dung_mac_dinh() {
    let lines = vec![line(0, 0.0, 10.0, "a")];
    let chunks = chunk_by_time(&lines, 0.0);
    assert_eq!(chunks.len(), 1);
}

#[test]
fn doi_srt_time_sang_giay() {
    assert!((parse_srt_time("00:00:15,000") - 15.0).abs() < 1e-6);
    assert!((parse_srt_time("00:01:00,500") - 60.5).abs() < 1e-6);
    assert!((parse_srt_time("01:02:03,250") - 3723.25).abs() < 1e-6);
    assert!((parse_srt_time("01:00:00.500") - 3600.5).abs() < 1e-6);
    assert_eq!(parse_srt_time("hỏng"), 0.0);
}

#[test]
fn doc_srt_content_bo_cai_rong() {
    let srt = "1\n00:00:01,000 --> 00:00:02,000\nXin chào\n\n2\n00:00:03,000 --> 00:00:04,000\n\n\n3\n00:00:05,000 --> 00:00:06,500\nThế giới\n";
    let lines = lines_from_srt_content(srt, 0);
    assert_eq!(lines.len(), 2, "bỏ câu rỗng");
    assert_eq!(lines[0].text, "Xin chào");
    assert!((lines[1].end - 6.5).abs() < 1e-6);
    assert_eq!(lines[0].source_idx, 0);
}

#[test]
fn doi_dong_dialogue_cho_bo_loc_rac() {
    let lines = vec![line(0, 1.0, 2.0, "a"), line(0, 3.0, 4.0, "b")];
    let dialog = to_dialog_lines(&lines);
    assert_eq!(dialog.len(), 2);
    assert_eq!(dialog[0].start, 1.0);
    assert_eq!(dialog[1].text, "b");
}

#[test]
fn render_cum_co_moc_thoi_gian() {
    let chunk = TranscriptChunk {
        source_idx: 0,
        start: 1.0,
        end: 3.0,
        lines: vec![line(0, 1.0, 3.0, "Mở đầu")],
    };
    let text = render_chunk(&chunk);
    assert!(text.contains("Mở đầu"));
    assert!(text.contains("00:00:01.000"));
    assert!(text.contains("00:00:03.000"));
}
