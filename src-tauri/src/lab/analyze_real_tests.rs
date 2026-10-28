//! TSK-LAB-C3 — test **chạy thật** trên video mẫu (đánh dấu `#[ignore]`).
//!
//! Vì sao `#[ignore]`: cần ffmpeg + STT + provider LLM thật (mạng + vài phút)
//! ⇒ không chạy trong test thường. Chạy tay:
//!
//! ```sh
//! cargo test --lib lab_analyze_that -- --ignored --nocapture
//! ```
//!
//! In ra **kết quả + thời gian** để ghi vào báo cáo.

use std::sync::atomic::AtomicBool;
use std::time::Instant;

use super::*;
use crate::lab::analyze::LabSourceInput;

/// Video mẫu 30 s (phụ đề cứng tiếng Trung).
const FIXTURE: &str = r"C:\Users\haiba\AppData\Local\Temp\claude\C--AI-Project-Sublix\552b7175-5967-4bd5-92bb-b386a0753c6e\fixtures\hardsub_zh_30s.mp4";

#[test]
#[ignore = "chạy thật (ffmpeg + STT + LLM) — chạy tay bằng `cargo test --lib lab_analyze_that -- --ignored --nocapture`"]
fn lab_analyze_that_tren_video_mau() {
    let path = std::path::Path::new(FIXTURE);
    assert!(path.is_file(), "không có video mẫu: {FIXTURE}");

    let options = LabAnalyzeOptions {
        game_name: "Game mẫu (tiếng Trung)".to_string(),
        game_genre: "Game nhập vai".to_string(),
        supplementary_context: String::new(),
        chunk_secs: 600.0,
        use_hardsub: false,
    };
    let sources = vec![LabSourceInput {
        path: FIXTURE.to_string(),
        name: Some("hardsub_zh_30s.mp4".to_string()),
        studio_project: None,
    }];

    let cancel = AtomicBool::new(false);
    let started = Instant::now();
    let mut progress_lines: Vec<String> = Vec::new();
    let mut on_progress = |progress: LabProgress| {
        progress_lines.push(format!(
            "[{}] nguồn {} {}% — {}",
            progress.stage, progress.source_idx, progress.percent, progress.message
        ));
    };

    let result = analyze(None, &sources, &options, &cancel, &mut on_progress);
    let elapsed = started.elapsed();

    println!("=== lab_analyze thật ===");
    println!("video: {FIXTURE}");
    println!("thời gian: {:.1} s", elapsed.as_secs_f64());
    for line in &progress_lines {
        println!("  {line}");
    }

    let analysis = result.expect("phân tích phải không lỗi");
    println!("nguồn: {}", analysis.sources.len());
    println!(
        "  nguồn 0: {} — {:.1} s — {} MB",
        analysis.sources[0].name, analysis.sources[0].duration_sec, analysis.sources[0].size_mb
    );
    println!("cảnh (đã chấm điểm): {}", analysis.scenes.len());
    println!("thoại: {} câu", analysis.transcript.len());
    println!("đoạn rác: {}", analysis.junk.len());
    println!("chương: {}", analysis.chapters.len());
    println!("nhân vật: {}", analysis.characters.len());
    for chapter in analysis.chapters.iter().take(5) {
        println!(
            "  #{} [{}] {} ({} cảnh, {} câu)",
            chapter.id, chapter.source_idx, chapter.title, chapter.cutscenes_count, chapter.lines_count
        );
    }
    for character in analysis.characters.iter().take(5) {
        println!("  {} — {} ({} câu)", character.name, character.role, character.lines_count);
    }

    assert_eq!(analysis.sources.len(), 1);
    assert!(
        !analysis.scenes.is_empty(),
        "phải đo được ít nhất 1 đoạn cảnh"
    );
}
