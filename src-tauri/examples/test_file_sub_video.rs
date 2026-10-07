//! E2E file-subtitle pipeline CLI test — runs the full file_sub flow
//! (extract audio → Whisper STT → MiniMax translate → save .vi.srt)
//! on a downloaded video file using the Sublix engine directly (no GUI).
//!
//! Mirrors `src/file_sub.rs::generate_file_subtitles` but skips the AppHandle
//! dependency by calling inner helpers directly.
//!
//! Usage:
//!   cargo run --example test_file_sub_video -- <input.mp4> [output_stem] [source_lang=en] [target_lang=vi]
//!
//! Defaults: source_lang=en, target_lang=vi, output_stem=auto-derived

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use sublix_lib::config::AppConfig;
use sublix_lib::file_sub::{
    extract_audio_16k_mono, parse_srt_content, write_srt_file,
};
use sublix_lib::stt::whisper_local::{is_hallucination, clean_whisper_transcript};
use sublix_lib::stt::{ensure_binary_with_engine, ensure_model, EnginePreference, ModelVariant, SttEngine};
use sublix_lib::translate::{translate_batch_with_config, TranslationModelVariant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn fmt_dur(secs: f32) -> String {
    if secs >= 60.0 {
        format!("{}m{}s", (secs / 60.0) as u32, (secs % 60.0) as u32)
    } else {
        format!("{secs:.1}s")
    }
}

fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!(
            "Usage: {} <input.mp4> [output_stem] [source_lang=en] [target_lang=vi]",
            args.first().map(String::as_str).unwrap_or("test_file_sub_video")
        );
        std::process::exit(1);
    }
    let input = PathBuf::from(&args[1]);
    if !input.exists() {
        anyhow::bail!("Input video not found: {}", input.display());
    }

    // Auto-derive output stem = <parent>/<file_stem> (next to input)
    let parent_dir = input
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let file_stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("subtitle")
        .to_string();
    let output_stem = if args.len() >= 3 {
        PathBuf::from(&args[2])
    } else {
        parent_dir.join(&file_stem)
    };
    let source_lang = args.get(3).cloned().unwrap_or_else(|| "en".into());
    let target_lang = args.get(4).cloned().unwrap_or_else(|| "vi".into());
    let provider_override: Option<String> = std::env::var("SUBLIX_TEST_PROVIDER").ok().filter(|s| !s.is_empty());

    // Output paths
    let vi_srt_path = output_stem.with_extension("stl"); // not used — we'll overwrite extension vi.vi.srt below
    let _ = vi_srt_path; // silence unused
    let vi_srt_path = output_stem.with_extension("vi.srt");
    let original_srt_path = output_stem.with_extension("original.srt");

    println!("=================================================================");
    println!("🎬 SUBLIX — FILE-SUB PIPELINE E2E TEST (CLI, NO GUI)");
    println!("=================================================================");
    println!("📁 Input:        {}", input.display());
    println!("📝 Output VI:    {}", vi_srt_path.display());
    println!("📝 Output EN:    {}", original_srt_path.display());
    println!("🌐 {} -> {}", source_lang, target_lang);
    println!("=================================================================\n");

    // Stage 0 — load AppConfig + resolve model variants
    let mut cfg = AppConfig::load_or_default();
    if let Some(ref prov) = provider_override {
        println!("🔧 Provider override from SUBLIX_TEST_PROVIDER={} (was: {})", prov, cfg.translation_provider);
        cfg.translation_provider = prov.clone();
    }
    println!(
        "⚙️  Config provider: {} | model: {} | minimax_model: {}",
        cfg.translation_provider, cfg.translation_model, cfg.minimax_model
    );

    let stt_variant = ModelVariant::best_installed().unwrap_or(ModelVariant::LargeV3TurboQ8);
    let (whisper_bin, engine) = ensure_binary_with_engine()
        .context("Failed to resolve whisper-cli binary")?;
    let model_path = ensure_model(stt_variant)
        .context("Failed to ensure whisper model")?;

    println!(
        "🎙️  Whisper: {} ({})",
        whisper_bin.display(),
        engine.as_str()
    );
    println!("🧠 Model:   {} ({} MB)", model_path.display(), stt_variant.approximate_size_mb());

    let t_total = Instant::now();

    // ---------------- Stage 1: ffmpeg extract ----------------
    let temp_wav = std::env::temp_dir().join(format!(
        "sublix-filesub-test-{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    println!("\n⏳ STAGE 1: ffmpeg extract audio → 16kHz mono WAV");
    let t1 = Instant::now();
    extract_audio_16k_mono(&input, &temp_wav).context("ffmpeg extract failed")?;
    let wav_size = std::fs::metadata(&temp_wav).map(|m| m.len()).unwrap_or(0);
    let dur1 = t1.elapsed().as_secs_f32();
    println!("✅ Stage 1 done in {} — WAV {:.1} MB", fmt_dur(dur1), wav_size as f64 / 1_048_576.0);

    // ---------------- Stage 2: whisper CLI ----------------
    let uid = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp_srt_stem = std::env::temp_dir().join(format!("sublix-filesub-raw-{uid}"));
    let temp_srt_file = std::env::temp_dir().join(format!("sublix-filesub-raw-{uid}.srt"));

    println!("\n⏳ STAGE 2: Whisper STT ({}) → SRT", stt_variant.name());
    let t2 = Instant::now();
    let mut whisper_cmd = Command::new(&whisper_bin);
    if let Some(bin_dir) = whisper_bin.parent() {
        whisper_cmd.current_dir(bin_dir);
    }
    whisper_cmd
        .arg("-m").arg(&model_path)
        .arg("-f").arg(&temp_wav)
        .arg("-l").arg(&source_lang)
        .arg("-osrt")
        .arg("-of").arg(&temp_srt_stem)
        .arg("--max-len").arg("60")
        .arg("-bo").arg("1")
        .arg("-bs").arg("1")
        .arg("-t").arg("8");
    if engine == SttEngine::Cuda {
        whisper_cmd.arg("-fa");
    }
    #[cfg(windows)]
    whisper_cmd.creation_flags(CREATE_NO_WINDOW);

    let status = whisper_cmd.status().context("whisper-cli exec failed")?;
    if !status.success() || !temp_srt_file.exists() {
        anyhow::bail!("Whisper failed (status={status:?}) or SRT not produced at {}", temp_srt_file.display());
    }
    let dur2 = t2.elapsed().as_secs_f32();
    let raw_srt = std::fs::read_to_string(&temp_srt_file)?;
    let mut segments = parse_srt_content(&raw_srt);
    println!(
        "✅ Stage 2 done in {} — {} raw segments",
        fmt_dur(dur2),
        segments.len()
    );

    // Apply hallucination filter (matches file_sub.rs behaviour)
    segments.retain_mut(|seg| {
        let cleaned = clean_whisper_transcript(&seg.original);
        if cleaned.is_empty() || is_hallucination(&cleaned) {
            false
        } else {
            seg.original = cleaned;
            true
        }
    });
    for (idx, seg) in segments.iter_mut().enumerate() {
        seg.index = idx + 1;
    }

    // Save the .original.srt right after Stage 2 for evidence
    write_srt_file(&original_srt_path, &segments, "original")?;

    if segments.is_empty() {
        anyhow::bail!("No speech detected in input video.");
    }
    let total = segments.len();
    println!("🎯 After hallucination filter: {} clean segments", total);

    // ---------------- Stage 3: MiniMax translate ----------------
    println!("\n⏳ STAGE 3: Translate {} segments via {}", total, cfg.translation_provider);
    let t3 = Instant::now();
    let trans_variant =
        TranslationModelVariant::resolve_or_best(Some(cfg.translation_model.as_str()));
    let originals: Vec<String> = segments.iter().map(|s| s.original.clone()).collect();
    let pref = EnginePreference::Auto;
    let translated_all = translate_batch_with_config(
        &originals,
        &source_lang,
        &target_lang,
        trans_variant,
        pref,
        &cfg,
    );
    // Map results back to segments with hallucination fallback
    let mut done = 0usize;
    for (i, translated_raw) in translated_all.into_iter().enumerate() {
        if i >= segments.len() {
            break;
        }
        let original_text = originals[i].clone();
        let translated_clean = translated_raw.trim().to_string();
        let final_translated = if translated_clean.is_empty() || is_hallucination(&translated_clean) {
            original_text.clone()
        } else {
            translated_clean
        };
        segments[i].translated = Some(final_translated);
        done = i + 1;
    }
    // Fill remaining (if batch returned fewer)
    for seg in segments.iter_mut() {
        if seg.translated.is_none() {
            seg.translated = Some(seg.original.clone());
        }
    }
    let dur3 = t3.elapsed().as_secs_f32();
    println!(
        "✅ Stage 3 done in {} — {}/{} segments translated via {}",
        fmt_dur(dur3),
        done,
        total,
        cfg.translation_provider
    );

    // ---------------- Stage 4: save vi.srt ----------------
    println!("\n⏳ STAGE 4: Write .vi.srt");
    let t4 = Instant::now();
    write_srt_file(&vi_srt_path, &segments, "vi")?;
    let vi_size = std::fs::metadata(&vi_srt_path).map(|m| m.len()).unwrap_or(0);
    let dur4 = t4.elapsed().as_secs_f32();
    println!(
        "✅ Stage 4 done in {} — {} bytes ({:.1} KB)",
        fmt_dur(dur4),
        vi_size,
        vi_size as f64 / 1024.0
    );

    let total_secs = t_total.elapsed().as_secs_f32();

    // Cleanup temp files
    let _ = std::fs::remove_file(&temp_wav);
    let _ = std::fs::remove_file(&temp_srt_file);

    // ---------------- Report ----------------
    println!("\n=================================================================");
    println!("📊 PER-STAGE TIMING");
    println!("=================================================================");
    println!("Stage 1 (ffmpeg extract):   {}", fmt_dur(dur1));
    println!("Stage 2 (Whisper STT):      {}", fmt_dur(dur2));
    println!("Stage 3 (Translate batch):  {}", fmt_dur(dur3));
    println!("Stage 4 (Write vi.srt):     {}", fmt_dur(dur4));
    println!("-- TOTAL --                 {}", fmt_dur(total_secs));
    println!("=================================================================");

    println!("\n📝 5 SAMPLE SEGMENTS (EN → VI):");
    println!("-----------------------------------------------------------------");
    let sample_step = (total / 5).max(1);
    for off in 0..5 {
        let idx = (off * sample_step).min(total.saturating_sub(1));
        let seg = &segments[idx];
        println!("[{}] {} --> {}", seg.index, seg.start_time, seg.end_time);
        println!("  EN: \"{}\"", seg.original);
        println!(
            "  VI: \"{}\"",
            seg.translated.as_deref().unwrap_or("(none)")
        );
    }
    println!("-----------------------------------------------------------------");

    println!("\n🎉 FILE SUB PIPELINE DONE — {}", fmt_dur(total_secs));
    println!("📁 VI.srt:    {}", vi_srt_path.display());
    println!("📁 EN.srt:    {}", original_srt_path.display());

    Ok(())
}