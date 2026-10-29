//! TSK-LAB-C4 — test **chạy thật** toàn chuỗi: phân tích (C3) → viết lời bình (LLM)
//! → TTS thật → khớp cảnh → ffmpeg → dự án Studio.
//!
//! Chạy tay:
//!
//! ```sh
//! cargo test --lib lab_draft_that -- --ignored --nocapture
//! ```
//!
//! In ra **thời gian từng bước + đường dẫn video nháp + dự án Studio** để ghi báo cáo.

use std::sync::atomic::AtomicBool;
use std::time::Instant;

use super::*;
use crate::lab::analyze::{analyze, LabAnalyzeOptions, LabSourceInput};
use crate::lab::draft::DraftOptions;
use crate::lab::narration::NarrationOptions;
use crate::lab::narration_write::write_narration;
use crate::lab::recap_script::RecapItem;

/// Video mẫu 30 s (phụ đề cứng tiếng Trung).
const FIXTURE: &str = r"C:\Users\haiba\AppData\Local\Temp\claude\C--AI-Project-Sublix\552b7175-5967-4bd5-92bb-b386a0753c6e\fixtures\hardsub_zh_30s.mp4";

/// Voice dự phòng khi Kokoro chưa có model trên máy (Edge-TTS cần mạng).
const VOICE_FALLBACK: &str = "vi-VN-HoaiMyNeural";

fn fallback_segments(duration: f64) -> Vec<RecapItem> {
    let texts = [
        "Một buổi sáng yên bình, nhân vật chính bước ra khỏi căn nhà nhỏ.",
        "Nhưng rồi tiếng động lạ vang lên từ phía khu rừng phía sau.",
        "Anh ta lặng lẽ bước tới, và mọi thứ bắt đầu thay đổi.",
    ];
    let step = duration / texts.len() as f64;
    texts
        .iter()
        .enumerate()
        .map(|(index, text)| RecapItem {
            id: index as u32 + 1,
            source_idx: 0,
            start: step * index as f64,
            end: step * (index + 1) as f64,
            picture: String::new(),
            narration: (*text).to_string(),
            keep_original: false,
            tts_secs: Some(crate::lab::narration::estimate_tts_secs(text)),
        })
        .collect()
}

#[test]
#[ignore = "chạy thật (LLM + TTS + ffmpeg) — chạy tay bằng `cargo test --lib lab_draft_that -- --ignored --nocapture`"]
fn lab_draft_that_tren_video_mau() {
    let path = std::path::Path::new(FIXTURE);
    assert!(path.is_file(), "không có video mẫu: {FIXTURE}");

    // ── Bước A: phân tích (C3) ──
    let started = Instant::now();
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
    let analysis = analyze(None, &sources, &options, &cancel, &mut |_| {})
        .expect("phân tích phải không lỗi");
    println!(
        "[A] phân tích: {:.1} s — {} chương, {} câu thoại, {} cảnh, {} rác",
        started.elapsed().as_secs_f64(),
        analysis.chapters.len(),
        analysis.transcript.len(),
        analysis.scenes.len(),
        analysis.junk.len()
    );

    // ── Bước B: viết lời bình (LLM; lỗi ⇒ dùng câu mẫu để vẫn kiểm được bước C) ──
    let started = Instant::now();
    let narration_options = NarrationOptions {
        game_name: "Game mẫu (tiếng Trung)".to_string(),
        game_genre: "Game nhập vai".to_string(),
        target_duration_sec: 30.0,
        original_ratio: 0.3,
    };
    let config = crate::config::AppConfig::load_or_default();
    let (segments, nguon) = match write_narration(&config, &analysis, &narration_options) {
        Ok(segments) => (segments, "LLM"),
        Err(err) => {
            println!("[B] LLM không chạy được ({err}) — dùng câu mẫu");
            let duration = analysis
                .sources
                .first()
                .map(|source| source.duration_sec)
                .unwrap_or(30.0);
            (fallback_segments(duration), "câu mẫu")
        }
    };
    println!(
        "[B] lời bình ({nguon}): {:.1} s — {} đoạn",
        started.elapsed().as_secs_f64(),
        segments.len()
    );
    for item in segments.iter().take(4) {
        println!(
            "   #{} keep={} {:.1}-{:.1}s :: {}",
            item.id,
            item.keep_original,
            item.start,
            item.end,
            item.narration.chars().take(60).collect::<String>()
        );
    }

    // ── Bước C: TTS + khớp cảnh + ffmpeg + Studio ──
    let work = std::env::temp_dir().join("sublix-lab-draft-test");
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).expect("tạo thư mục làm việc");
    let mut options = DraftOptions {
        voice: "kokoro:diem_trinh".to_string(),
        rate: "+0%".to_string(),
        pitch: "+0Hz".to_string(),
        original_ratio: 0.3,
        work_dir: Some(work.to_string_lossy().to_string()),
    };

    let started = Instant::now();
    let mut emitted: Vec<(String, u32)> = Vec::new();
    let first = build_draft_in(&work, &analysis, &segments, &options, &cancel, &mut |stage, pct, _| {
        emitted.push((stage.to_string(), pct));
    });

    let result = match first {
        Ok(value) => value,
        Err(err) => {
            println!("[C] dựng với Kokoro lỗi ({err}) — thử {VOICE_FALLBACK}");
            options.voice = VOICE_FALLBACK.to_string();
            build_draft_in(&work, &analysis, &segments, &options, &cancel, &mut |stage, pct, _| {
                emitted.push((stage.to_string(), pct));
            })
            .expect("dựng nháp phải thành công với voice dự phòng")
        }
    };
    let elapsed = started.elapsed().as_secs_f64();

    let draft_size = std::fs::metadata(&result.draft_path)
        .map(|meta| meta.len())
        .unwrap_or(0);
    let project_size = std::fs::metadata(&result.studio_project_path)
        .map(|meta| meta.len())
        .unwrap_or(0);
    println!(
        "[C] dựng nháp: {:.1} s — {} mục, {:.1} s video, {} vi phạm, {} câu chưa có cảnh",
        elapsed,
        result.items.len(),
        result.total_sec,
        result.warnings_count,
        result.unplaced.len()
    );
    println!("   stage đã phát: {emitted:?}");
    for note in result.notes.iter().take(5) {
        println!("   • {note}");
    }
    println!("   video nháp : {} ({draft_size} B)", result.draft_path);
    println!("   dự án Studio: {} ({project_size} B)", result.studio_project_path);

    assert!(result.rules_passed || result.warnings_count > 0);
    assert!(draft_size > 0, "video nháp phải có dữ liệu");
    assert!(project_size > 0, "dự án Studio phải được ghi");
    assert!(result.total_sec > 0.0);
    assert!(
        emitted.iter().any(|(stage, _)| stage == "tts"),
        "phải phát tiến trình TTS"
    );
    assert!(
        emitted.iter().any(|(stage, _)| stage == "render"),
        "phải phát tiến trình render"
    );
}
