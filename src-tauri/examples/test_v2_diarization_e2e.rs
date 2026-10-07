// End-to-End Test for Phase V2 Sherpa Diarization + Speaker Roster & Samples
use anyhow::Result;
use std::fs;
use std::path::Path;
use sublix_lib::dubbing::{analyze_and_create_project, export_dubbed_video};

fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    println!("=================================================================");
    println!("🎬 BẮT ĐẦU CHẠY THỰC TẾ PHASE V2: PHÂN VAI SHERPA-ONNX & EXPORT");
    println!("=================================================================\n");

    let input_video = r"H:\AI Project\sublix\test_dubbing_input\multi_speaker_scene.mp4";
    if !Path::new(input_video).exists() {
        eprintln!("❌ Không tìm thấy video test: {}", input_video);
        std::process::exit(1);
    }

    let out_dir = Path::new(r"H:\AI Project\sublix\agent-team\test-output-audit-giong");
    let _ = fs::create_dir_all(out_dir);

    println!("📁 Video đầu vào: {}", input_video);
    println!("⏳ Đang phân tích video, nhận diện giọng nói, tách vai bằng Sherpa AI...");

    let start_time = std::time::Instant::now();
    let project = analyze_and_create_project(
        None,
        input_video,
        Some("en".to_string()),
        Some("vi".to_string()),
        None,
    )?;
    let analyze_dur = start_time.elapsed();

    println!("\n✅ PHÂN TÍCH THÀNH CÔNG trong {:.2}s!", analyze_dur.as_secs_f32());
    println!("⚙️  Diarization Engine: {:?}", project.diarization_engine);
    println!("⏱️  Thời lượng video: {:.2}s", project.media_duration_sec);
    println!("👥 Số lượng vai diễn phát hiện: {}", project.speakers.len());

    for (idx, spk) in project.speakers.iter().enumerate() {
        let sample_len = spk.sample_audio_data.as_ref().map(|s| s.len()).unwrap_or(0);
        println!(
            "   - Vai #{}: [{}] {} (Gender: {}) => Gán giọng: {} | Sample clip Data URI: {} chars",
            idx, spk.id, spk.label, spk.gender, spk.voice, sample_len
        );

        // Decode sample data URI and save to WAV for human audio verification
        if let Some(ref data_uri) = spk.sample_audio_data {
            if let Some(b64) = data_uri.strip_prefix("data:audio/wav;base64,") {
                if let Ok(wav_bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64) {
                    let sample_file = out_dir.join(format!("v2_{}_sample.wav", spk.id));
                    let _ = fs::write(&sample_file, wav_bytes);
                    println!("     -> Đã lưu file audio mẫu thật: {}", sample_file.display());
                }
            }
        }
    }

    println!("\n📝 BẢNG KỊCH BẢN ĐỐI THOẠI & PHÂN VAI:");
    println!("-----------------------------------------------------------------");
    for seg in &project.segments {
        println!(
            "[{:02}:{:02.1} ➔ {:02}:{:02.1}] (Vai: {}):",
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

    // Save project JSON
    let json_path = out_dir.join("v2_project_output.json");
    let json_str = serde_json::to_string_pretty(&project)?;
    fs::write(&json_path, &json_str)?;
    println!("\n💾 Đã lưu project JSON: {}", json_path.display());

    // Export dubbed video
    println!("\n🎬 Xuất video thành phẩm lồng tiếng (Audio Ducking)...");
    let out_video = out_dir.join("v2_multi_speaker_DUBBED.mp4");
    let export_start = std::time::Instant::now();
    let res = export_dubbed_video(None, project, Some(out_video.to_string_lossy().to_string()))?;
    println!("✅ Đã xuất video thành công trong {:.2}s: {}", export_start.elapsed().as_secs_f32(), res);

    println!("\n=================================================================");
    println!("🎉 PHASE V2 TEST HOÀN TẤT THÀNH CÔNG 100%!");
    println!("=================================================================");
    Ok(())
}
