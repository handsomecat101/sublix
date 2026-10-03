// End-to-End integration test for Sublix AI Dubbing Pipeline
// Tests: Media Extraction -> Whisper STT -> Diarization -> MiniMax-M3 Scripting -> TTS Synthesis -> atempo Time-stretching -> Remuxing

use anyhow::Result;
use std::path::Path;
use sublix_lib::dubbing::{analyze_and_create_project, export_dubbed_video, preview_single_line};

fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    println!("=================================================================");
    println!("🎬 BẮT ĐẦU CHẠY THỬ NGHIỆM THỰC TẾ SUBLEX AI DUBBING TỪ A ĐẾN Z");
    println!("=================================================================\n");

    let input_video = r"H:\AI Project\sublix\test_dubbing_input\multi_speaker_scene.mp4";
    if !Path::new(input_video).exists() {
        eprintln!("❌ Không tìm thấy video test: {}", input_video);
        std::process::exit(1);
    }

    println!("📁 Video đầu vào: {}", input_video);
    println!("⏳ BƯỚC 1: Phân tích video, nhận diện giọng nói, tách vai và biên kịch bằng MiniMax-M3...");

    let start_time = std::time::Instant::now();
    let mut project = analyze_and_create_project(None, input_video, Some("en".to_string()))?;
    let analyze_dur = start_time.elapsed();

    println!("\n✅ PHÂN TÍCH THÀNH CÔNG trong {:.2}s!", analyze_dur.as_secs_f32());
    println!("⏱️  Thời lượng video: {:.2}s", project.media_duration_sec);
    println!("👥 Số lượng vai diễn phát hiện: {}", project.speakers.len());

    for spk in &project.speakers {
        println!("   - [{}] {} => Gán giọng: {}", spk.id, spk.label, spk.voice);
    }

    println!("\n📝 BẢNG KỊCH BẢN ĐỐI THOẠI (GỐC EN ➔ DỊCH VI ĐIỆN ẢNH BỞI MINIMAX-M3):");
    println!("-----------------------------------------------------------------");
    for seg in &project.segments {
        println!(
            "[{:02}:{:02.1} ➔ {:02}:{:02.1}] ({}):",
            (seg.start_sec / 60.0) as u32,
            seg.start_sec % 60.0,
            (seg.end_sec / 60.0) as u32,
            seg.end_sec % 60.0,
            seg.speaker_id
        );
        println!("  🇺🇸 EN: \"{}\"", seg.original_text);
        println!("  🇻🇳 VI: \"{}\"", seg.dubbed_text);
        println!("-----------------------------------------------------------------");
    }

    println!("\n🔊 BƯỚC 2: Kiểm tra chức năng Nghe Thử 1-Click (Instant Audio Preview)...");
    if let Some(first_seg) = project.segments.first() {
        let preview_b64 = preview_single_line(&first_seg.dubbed_text, "vi-VN-NamMinhNeural", None, None)?;
        println!("✅ Sinh Base64 audio preview thành công (Độ dài: {} bytes, bắt đầu bằng '{}...')",
            preview_b64.len(),
            &preview_b64[..30]
        );
    }

    // Step 3: Export mode 1: Ducking
    println!("\n🎬 BƯỚC 3: Xuất video thành phẩm Chế Độ 1: THUYẾT MINH (Audio Ducking 25%)...");
    let out_ducking = r"H:\AI Project\sublix\test_dubbing_input\multi_speaker_DUBBED_DUCKING.mp4";
    project.dubbing_mode = "ducking".to_string();
    let export_start = std::time::Instant::now();
    let res_ducking = export_dubbed_video(None, project.clone(), Some(out_ducking.to_string()))?;
    println!("✅ Đã xuất video thuyết minh trong {:.2}s: {}", export_start.elapsed().as_secs_f32(), res_ducking);

    // Step 4: Export mode 2: Demucs Vocal Isolation
    println!("\n🎭 BƯỚC 4: Xuất video thành phẩm Chế Độ 2: LỒNG TIẾNG CHIẾU RẠP (Demucs v4 CUDA Vocal Isolation)...");
    let out_isolation = r"H:\AI Project\sublix\test_dubbing_input\multi_speaker_DUBBED_THEATRICAL.mp4";
    project.dubbing_mode = "vocal_isolation".to_string();
    let iso_start = std::time::Instant::now();
    let res_iso = export_dubbed_video(None, project, Some(out_isolation.to_string()))?;
    println!("✅ Đã xuất video chiếu rạp trong {:.2}s: {}", iso_start.elapsed().as_secs_f32(), res_iso);

    println!("\n=================================================================");
    println!("🎉 TOÀN BỘ QUY TRÌNH TỪ A ĐẾN Z ĐÃ CHẠY HOÀN TẤT THÀNH CÔNG 100%!");
    println!("=================================================================");

    Ok(())
}
