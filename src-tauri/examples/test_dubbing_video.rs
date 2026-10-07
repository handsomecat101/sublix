//! E2E dubbing pipeline CLI test — runs the full dubbing flow (analyze +
//! Edge-TTS synthesis + remux) on a downloaded video file using the Sublix
//! engine directly (no GUI). Prints timing per stage and verifies output MP4.
//!
//! Usage:
//!   cargo run --example test_dubbing_video -- <input.mp4> <output.mp4> [source_lang] [target_lang]
//!
//! Defaults: source_lang=en, target_lang=vi

use anyhow::{Context, Result};
use std::path::Path;
use std::time::Instant;
use sublix_lib::dubbing::{analyze_and_create_project, export_dubbed_video};

fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!(
            "Usage: {} <input.mp4> <output.mp4> [source_lang=en] [target_lang=vi]",
            args.first().map(String::as_str).unwrap_or("test_dubbing_video")
        );
        std::process::exit(1);
    }
    let input = &args[1];
    let output = &args[2];
    let source_lang = args.get(3).cloned().or(Some("en".into()));
    let target_lang = args.get(4).cloned().or(Some("vi".into()));

    println!("=================================================================");
    println!("🎬 SUBLIX — DUBBING E2E TEST (CLI, NO GUI)");
    println!("=================================================================");
    println!("📁 Input:    {}", input);
    println!("💾 Output:   {}", output);
    println!("🌐 {} -> {}\n", source_lang.as_deref().unwrap_or("?"), target_lang.as_deref().unwrap_or("?"));

    if !Path::new(input).exists() {
        anyhow::bail!("Input video not found: {input}");
    }

    println!("⏳ STAGE 1: Analyze (Whisper STT + diarization + LLM translate)...");
    let t1 = Instant::now();
    let project = analyze_and_create_project(
        None,
        input,
        source_lang.clone(),
        target_lang.clone(),
        None,
    )
    .context("Analyze stage failed")?;
    let dur1 = t1.elapsed().as_secs_f32();
    println!("✅ Stage 1 done in {dur1:.1}s — {} speakers, {} segments\n",
        project.speakers.len(), project.segments.len());

    println!("📝 KỊCH BẢN ({} -> {}):", source_lang.as_deref().unwrap_or("?"), target_lang.as_deref().unwrap_or("?"));
    println!("-----------------------------------------------------------------");
    for seg in project.segments.iter().take(8) {
        println!("[{:02}:{:05.2} -> {:02}:{:05.2}] ({}):", 
            (seg.start_sec / 60.0) as u32, seg.start_sec % 60.0,
            (seg.end_sec / 60.0) as u32, seg.end_sec % 60.0,
            seg.speaker_id);
        println!("  EN: \"{}\"", seg.original_text);
        println!("  VI: \"{}\"", seg.dubbed_text);
    }
    if project.segments.len() > 8 {
        println!("  ... ({} more segments)", project.segments.len() - 8);
    }
    println!("-----------------------------------------------------------------\n");

    println!("⏳ STAGE 2: Export (TTS + atempo + remux)...");
    let t2 = Instant::now();
    let result_path = export_dubbed_video(None, project, Some(output.to_string()))
        .context("Export stage failed")?;
    let dur2 = t2.elapsed().as_secs_f32();
    println!("✅ Stage 2 done in {dur2:.1}s -> {result_path}\n");

    let out_path = Path::new(&result_path);
    if !out_path.exists() {
        anyhow::bail!("Output file does not exist: {result_path}");
    }
    let size = std::fs::metadata(&result_path)?.len();
    if size < 10_000 {
        anyhow::bail!("Output file too small ({size} bytes) — mux may have failed");
    }
    println!("📦 Output size: {size} bytes ({:.1} MB)", size as f64 / 1_048_576.0);

    println!("\n=================================================================");
    println!("🎉 DUBBING E2E DONE — {} + {} = {:.1}s total",
        if dur1 >= 60.0 { format!("{}m{}s", (dur1/60.0) as u32, (dur1%60.0) as u32) } else { format!("{dur1:.1}s") },
        if dur2 >= 60.0 { format!("{}m{}s", (dur2/60.0) as u32, (dur2%60.0) as u32) } else { format!("{dur2:.1}s") },
        dur1 + dur2,
    );
    println!("📁 Output video: {result_path}");
    println!("=================================================================");

    Ok(())
}