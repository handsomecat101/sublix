//! E2E dubbing pipeline CLI test — runs the full dubbing flow (analyze +
//! Kokoro LOCAL offline TTS synthesis + remux) AND writes an SRT subtitle file
//! alongside the input video. The SRT contains the Vietnamese dubbed text
//! indexed by segment. Multi-speaker: ép voice Kokoro khác nhau cho mỗi speaker.
//!
//! Usage:
//!   cargo run --example test_dubbing_srt -- <input.mp4> <output.mp4> [source_lang] [target_lang]
//!
//! Defaults: source_lang=en, target_lang=vi
//!
//! Outputs:
//!   <input>.vi.srt      — Vietnamese subtitle file (hardcoded at burn step)
//!   <output>            — Remuxed MP4 with Vietnamese dubbed audio track

use anyhow::{Context, Result};
use std::fmt::Write as _;
use std::path::Path;
use std::time::Instant;
use sublix_lib::dubbing::{
    analyze_and_create_project, export_dubbed_video, kokoro_available,
};

fn fmt_srt_time(total_seconds: f64) -> String {
    let total_seconds = total_seconds.max(0.0);
    let hours = (total_seconds / 3600.0).floor() as u32;
    let minutes = ((total_seconds / 60.0) % 60.0).floor() as u32;
    let seconds = total_seconds % 60.0;
    format!("{:02}:{:02}:{:06.3}", hours, minutes, seconds)
}

fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!(
            "Usage: {} <input.mp4> <output.mp4> [source_lang=en] [target_lang=vi]",
            args.first().map(String::as_str).unwrap_or("test_dubbing_srt")
        );
        std::process::exit(1);
    }
    let input = &args[1];
    let output = &args[2];
    let source_lang = args.get(3).cloned().or(Some("en".into()));
    let target_lang = args.get(4).cloned().or(Some("vi".into()));

    println!("=================================================================");
    println!("🎬 SUBLIX — DUBBING E2E + SRT EXPORT (KOKORO LOCAL OFFLINE)");
    println!("=================================================================");
    println!("📁 Input:    {}", input);
    println!("💾 Output:   {}", output);
    println!(
        "🌐 {} -> {}\n",
        source_lang.as_deref().unwrap_or("?"),
        target_lang.as_deref().unwrap_or("?")
    );

    if !Path::new(input).exists() {
        anyhow::bail!("Input video not found: {input}");
    }

    if !kokoro_available() {
        anyhow::bail!("Model Kokoro-Vietnamese chưa sẵn sàng — kiểm tra src-tauri/models/voice/kokoro-vi/");
    }
    println!("✅ Kokoro-Vietnamese LOCAL model detected\n");

    println!("⏳ STAGE 1: Analyze (Whisper STT + diarization + LLM translate)...");
    let t1 = Instant::now();
    let mut project = analyze_and_create_project(
        None,
        input,
        source_lang.clone(),
        target_lang.clone(),
        None,
    )
    .context("Analyze stage failed")?;
    let dur1 = t1.elapsed().as_secs_f32();
    println!(
        "✅ Stage 1 done in {dur1:.1}s — {} speakers, {} segments\n",
        project.speakers.len(),
        project.segments.len()
    );

    println!(
        "📝 KỊCH BẢN ({} -> {}):",
        source_lang.as_deref().unwrap_or("?"),
        target_lang.as_deref().unwrap_or("?")
    );
    println!("-----------------------------------------------------------------");
    for seg in project.segments.iter().take(8) {
        println!(
            "[{:02}:{:05.2} -> {:02}:{:05.2}] ({}):",
            (seg.start_sec / 60.0) as u32,
            seg.start_sec % 60.0,
            (seg.end_sec / 60.0) as u32,
            seg.end_sec % 60.0,
            seg.speaker_id
        );
        println!("  EN: \"{}\"", seg.original_text);
        println!("  VI: \"{}\"", seg.dubbed_text);
    }
    if project.segments.len() > 8 {
        println!("  ... ({} more segments)", project.segments.len() - 8);
    }
    println!("-----------------------------------------------------------------\n");

    // Write Vietnamese SRT next to input file.
    let srt_path = format!("{}.vi.srt", input.trim_end_matches(".mp4"));
    let mut srt = String::new();
    for (i, seg) in project.segments.iter().enumerate() {
        writeln!(srt, "{}", i + 1).unwrap();
        writeln!(
            srt,
            "{} --> {}",
            fmt_srt_time(seg.start_sec),
            fmt_srt_time(seg.end_sec)
        )
        .unwrap();
        writeln!(srt, "{}", seg.dubbed_text).unwrap();
        writeln!(srt).unwrap();
    }
    std::fs::write(&srt_path, srt).context("Write SRT failed")?;
    println!("✅ SRT written: {srt_path}");

    // === v0.9.10: Smart voice assignment theo gender THẬT + filter noise speaker ===
    // Logic cũ ép `idx % 2 → male/female` gây sai khi:
    //   1. Video chỉ 1 narrator → vẫn ép 6 voice khác nhau lung tung
    //   2. Speaker order trong project.speakers có thể xen kẽ sai giới tính
    // Fix: dùng `spk.gender` từ LLM (đã lưu ở Stage 1), đếm segments per speaker
    //      để gộp speaker "nhiễu" (<3 segments hoặc <3% tổng) vào speaker chính.
    let total_segs = project.segments.len().max(1);
    let mut seg_count_per_spk: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
    for seg in &project.segments {
        *seg_count_per_spk.entry(seg.speaker_id.clone()).or_insert(0) += 1;
    }

    // Tìm speaker chính (nhiều segments nhất) — dùng làm fallback cho noise.
    let main_speaker = project
        .speakers
        .iter()
        .max_by_key(|s| seg_count_per_spk.get(&s.id).copied().unwrap_or(0))
        .map(|s| s.id.clone())
        .unwrap_or_else(|| "speaker_0".to_string());

    let main_spk_obj = project
        .speakers
        .iter()
        .find(|s| s.id == main_speaker)
        .cloned()
        .unwrap_or_else(|| project.speakers[0].clone());
    let main_gender = if main_spk_obj.gender == "female" {
        "female"
    } else {
        "male"
    };

    // Pool giọng đa dạng (Kokoro LOCAL 7 nam + 7 nữ)
    const KO_MALE: [&str; 7] = [
        "kokoro:tuan_ngoc",
        "kokoro:manh_dung",
        "kokoro:thanh_dat",
        "kokoro:phat_tai",
        "kokoro:hung_thinh",
        "kokoro:duc_an",
        "kokoro:duc_duy",
    ];
    const KO_FEMALE: [&str; 7] = [
        "kokoro:mai_linh",
        "kokoro:ngoc_huyen",
        "kokoro:my_yen",
        "kokoro:diem_trinh",
        "kokoro:mai_loan",
        "kokoro:thuc_trinh",
        "kokoro:storyvert",
    ];

    println!(
        "\n🎙 Multi-speaker voice assignment (main={} {}, {} segments):",
        main_spk_obj.label, main_gender, total_segs
    );
    let mut male_idx = 0usize;
    let mut female_idx = 0usize;
    for spk in project.speakers.iter_mut() {
        let segs = seg_count_per_spk.get(&spk.id).copied().unwrap_or(0);
        let is_noise = segs < 3 || (segs as f64 / total_segs as f64) < 0.03;
        if is_noise {
            // Gộp noise speaker vào main speaker → dùng cùng voice cho đồng nhất
            spk.voice = main_spk_obj.voice.clone();
            spk.pitch = main_spk_obj.pitch.clone();
            spk.rate = main_spk_obj.rate.clone();
            println!(
                "   - [{}] {} ({}segs) -> NOISE gộp vào main => {}",
                spk.id, spk.label, segs, spk.voice
            );
            continue;
        }
        let is_female = spk.gender == "female";
        let voice = if is_female {
            let v = KO_FEMALE[female_idx % KO_FEMALE.len()];
            female_idx += 1;
            v
        } else {
            let v = KO_MALE[male_idx % KO_MALE.len()];
            male_idx += 1;
            v
        };
        spk.voice = voice.to_string();
        println!(
            "   - [{}] {} ({}, {}segs) => {}",
            spk.id, spk.label, spk.gender, segs, spk.voice
        );
    }
    project.dubbing_mode = "ducking".to_string();
    println!("   ↳ dubbing_mode = ducking (không cần Demucs)\n");

    println!("\n⏳ STAGE 2: Export (Kokoro LOCAL TTS + atempo + remux)...");
    let t2 = Instant::now();
    let result_path =
        export_dubbed_video(None, project, Some(output.to_string())).context("Export stage failed")?;
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

    let total = dur1 + dur2;
    println!("\n=================================================================");
    println!(
        "🎉 DUBBING E2E + SRT DONE — {} + {} = {:.1}s total",
        if dur1 >= 60.0 {
            format!("{}m{}s", (dur1 / 60.0) as u32, (dur1 % 60.0) as u32)
        } else {
            format!("{dur1:.1}s")
        },
        if dur2 >= 60.0 {
            format!("{}m{}s", (dur2 / 60.0) as u32, (dur2 % 60.0) as u32)
        } else {
            format!("{dur2:.1}s")
        },
        total
    );
    println!("📁 Output video:  {result_path}");
    println!("📝 Output SRT:    {srt_path}");
    println!("=================================================================");

    Ok(())
}