//! Focused E2E test: run the FULL dubbing pipeline using ONLY the local
//! Kokoro-Vietnamese offline engine (no Edge-TTS), on the multi-speaker clip.
//!
//! Produces `test_dubbing_input/kokoro_DUBBED_TEST.mp4`.
//! Run: `cargo run --example test_dubbing_kokoro`

use anyhow::Result;
use std::path::Path;
use sublix_lib::dubbing::{analyze_and_create_project, export_dubbed_video, kokoro_available};

fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    println!("=================================================================");
    println!("🎬 SUBLIX — KOKORO-VIETNAMESE OFFLINE DUBBING E2E (NO EDGE-TTS)");
    println!("=================================================================\n");

    let input = r"H:\AI Project\sublix\test_dubbing_input\multi_speaker_scene.mp4";
    if !Path::new(input).exists() {
        eprintln!("❌ Không tìm thấy video test: {input}");
        std::process::exit(1);
    }
    if !kokoro_available() {
        eprintln!("❌ Model Kokoro-Vietnamese chưa sẵn sàng trong models/voice/kokoro-vi/");
        std::process::exit(2);
    }

    println!("📁 Video đầu vào: {input}");
    println!("⏳ BƯỚC 1: Phân tích (Whisper STT + phân vai + dịch VI)...");
    let start = std::time::Instant::now();
    let mut project = analyze_and_create_project(
        None,
        input,
        Some("en".to_string()),
        Some("vi".to_string()),
        None,
    )?;
    println!("✅ Phân tích xong trong {:.2}s", start.elapsed().as_secs_f32());
    println!("👥 {} vai diễn • {} câu thoại\n", project.speakers.len(), project.segments.len());

    // Force every speaker to a Kokoro voice so the export is 100% offline,
    // regardless of what the scriptwriter assigned.
    let kokoro_male = ["kokoro:tuan_ngoc", "kokoro:manh_dung", "kokoro:thanh_dat"];
    let kokoro_female = ["kokoro:mai_linh", "kokoro:ngoc_huyen", "kokoro:my_yen"];
    for (idx, spk) in project.speakers.iter_mut().enumerate() {
        let is_female = idx % 2 == 1;
        spk.voice = if is_female {
            kokoro_female[idx % 3].to_string()
        } else {
            kokoro_male[idx % 3].to_string()
        };
    }
    for spk in &project.speakers {
        println!("   - [{}] {} => {}", spk.id, spk.label, spk.voice);
    }

    println!("\n📝 KỊCH BẢN (EN ➔ VI):");
    println!("-----------------------------------------------------------------");
    for seg in &project.segments {
        println!("[{:02}:{:04.1} ➔ {:02}:{:04.1}] ({}):", 
            (seg.start_sec / 60.0) as u32, seg.start_sec % 60.0,
            (seg.end_sec / 60.0) as u32, seg.end_sec % 60.0,
            seg.speaker_id);
        println!("  🇺🇸 EN: \"{}\"", seg.original_text);
        println!("  🇻🇳 VI: \"{}\"", seg.dubbed_text);
    }
    println!("-----------------------------------------------------------------");

    println!("\n🔊 BƯỚC 2: Xuất video lồng tiếng bằng Kokoro (offline)...");
    let out = r"H:\AI Project\sublix\test_dubbing_input\kokoro_DUBBED_TEST.mp4";
    project.dubbing_mode = "ducking".to_string();
    let export_start = std::time::Instant::now();
    let res = export_dubbed_video(None, project, Some(out.to_string()))?;
    println!("✅ Xuất xong trong {:.2}s: {res}", export_start.elapsed().as_secs_f32());

    assert!(Path::new(&res).exists(), "Video lồng tiếng phải tồn tại trên đĩa");
    let size = std::fs::metadata(&res)?.len();
    assert!(size > 10_000, "Video lồng tiếng quá nhỏ ({size} bytes) — có thể lỗi mux");
    println!("📦 Kích thước: {size} bytes");
    println!("\n🎉 HOÀN TẤT — video lồng tiếng Kokoro offline đã sẵn sàng!");
    Ok(())
}
