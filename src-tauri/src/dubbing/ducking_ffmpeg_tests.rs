//! Test chạy ffmpeg THẬT cho `ducking.rs` (đo RMS sau khi áp `ffmpeg_volume_filter`).

use super::*;
use std::process::Command;

/// Video dài ~1 giờ, 300 khối thoại: graph > 32K ký tự (vượt giới hạn dòng lệnh Windows) nên PHẢI đi
/// qua `-/filter_complex <file>`; gain đo được khớp `gain_at`.
#[test]
fn ffmpeg_long_graph_via_file() {
    let graph_len = check_long_graph(300, true);
    assert!(graph_len.is_none_or(|n| n > 32_000), "300 khối phải vượt 32K ký tự: {graph_len:?}");
}

/// 100 khối (>100 số hạng trong biểu thức — chuỗi phẳng sẽ bị ffmpeg từ chối), graph vừa dòng lệnh → inline.
#[test]
fn ffmpeg_medium_graph_inline() {
    let graph_len = check_long_graph(100, false);
    assert!(graph_len.is_none_or(|n| n < 30_000), "100 khối phải vừa dòng lệnh: {graph_len:?}");
}

/// Trả độ dài graph, hoặc `None` nếu máy không có ffmpeg (bỏ qua).
fn check_long_graph(n_blocks: usize, via_file: bool) -> Option<usize> {
    let voice: Vec<(f64, f64)> = (0..n_blocks).map(|i| (10.0 + i as f64 * 12.0, 13.0 + i as f64 * 12.0)).collect();
    let dur = 3700.0;
    let pts = build_ducking_envelope(&voice, dur, &DuckingParams::default());
    let chain = format!("[0:a]{}[bgm]", ffmpeg_volume_filter(&pts));
    let graph = format!("{chain};[bgm]anull[out]");
    let dir = std::env::temp_dir().join(format!("sublix_ducklong_{}_{}", std::process::id(), n_blocks));
    std::fs::create_dir_all(&dir).expect("tạo thư mục tạm");
    let file = dir.join("mix_filter.txt");
    std::fs::write(&file, &graph).expect("ghi graph");
    let run = |file_mode: bool, out: &std::path::Path| -> Option<std::process::Output> {
        let mut cmd = Command::new(crate::dubbing::find_ffmpeg());
        cmd.args(["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=3700:sample_rate=3000"]);
        if file_mode {
            cmd.arg("-/filter_complex").arg(&file);
        } else {
            cmd.arg("-filter_complex").arg(&graph);
        }
        cmd.args(["-map", "[out]", "-ac", "1", "-c:a", "pcm_s16le"]).arg(out);
        cmd.output().ok()
    };
    let out = dir.join("out.wav");
    let Some(r) = run(via_file, &out) else {
        eprintln!("SKIP: không chạy được ffmpeg (hoặc dòng lệnh quá dài)");
        let _ = std::fs::remove_dir_all(&dir);
        return None;
    };
    assert!(r.status.success(), "ffmpeg lỗi: {}", String::from_utf8_lossy(&r.stderr));
    let samples = read_wav_samples(&std::fs::read(&out).expect("đọc wav"));
    let reference = rms_db(&samples, 3000.0, 5.0, 0.5);
    // giữa khối #50 (đang hạ), và khoảng nghỉ trước khối #90 (đã về 100%).
    for t in [10.0 + 50.0 * 12.0 + 1.5, 10.0 + 90.0 * 12.0 - 4.0] {
        let measured = rms_db(&samples, 3000.0, t, 0.05) - reference;
        let expected = 20.0 * gain_at(&pts, t).log10();
        assert!((measured - expected).abs() <= 1.0, "t={t}: đo {measured:.2} dB, mong {expected:.2} dB");
    }
    let _ = std::fs::remove_dir_all(&dir);
    Some(graph.len())
}

/// XUẤT THẬT (`cargo test --lib ducking_real_export -- --ignored --nocapture`): video 45 s có nền là tone
/// không đổi, 3 câu VieNeu (A 5s, B 8.5s cách A < 2 s; C 32s cách xa). Đo RMS track lồng tiếng:
/// - giữa A và B (khe < 2 s, KHÔNG có giọng) → nền phải vẫn thấp (≈ −14 dB);
/// - đoạn không thoại dài (15–28 s) → về 100% (≈ 0 dB).
#[test]
#[ignore = "cần VieNeu đã tải + ffmpeg; xuất video thật"]
fn ducking_real_export_measure() {
    use crate::dubbing::{export_dubbed_video, DubbingProject, DubbingSegment, DubbingSpeaker};
    let dir = std::env::temp_dir().join("sublix_ducking_real");
    std::fs::create_dir_all(&dir).expect("tạo thư mục");
    let video = dir.join("bg_tone.mp4");
    let ff = crate::dubbing::find_ffmpeg();
    let st = Command::new(&ff)
        .args(["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=45:size=160x90:rate=10"])
        .args(["-f", "lavfi", "-i", "sine=frequency=220:duration=45:sample_rate=44100"])
        .args(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"])
        .arg(&video)
        .status()
        .expect("ffmpeg");
    assert!(st.success());
    let texts = [
        (5.0, "Xin chào các bạn, hôm nay chúng ta cùng bắt đầu."),
        (8.5, "Đây là câu thứ hai nói liền ngay sau đó."),
        (32.0, "Và đây là câu cuối cùng sau một khoảng nghỉ dài."),
    ];
    let segments: Vec<DubbingSegment> = texts
        .iter()
        .enumerate()
        .map(|(i, (start, t))| DubbingSegment {
            id: i + 1,
            speaker_id: "speaker_0".to_string(),
            start_sec: *start,
            end_sec: start + 3.5,
            original_text: format!("line {i}"),
            dubbed_text: t.to_string(),
            audio_duration_sec: None,
            status: "ready".to_string(),
        })
        .collect();
    let project = DubbingProject {
        input_path: video.to_string_lossy().to_string(),
        media_duration_sec: 45.0,
        speakers: vec![DubbingSpeaker {
            id: "speaker_0".to_string(),
            label: "Nam".to_string(),
            voice: "vietneu:vi_bac_nam".to_string(),
            pitch: "+0Hz".to_string(),
            rate: "+0%".to_string(),
            gender: "male".to_string(),
            sample_audio_data: None,
        }],
        segments,
        bgm_volume: 0.2,
        voice_volume: 1.0,
        dubbing_mode: "ducking".to_string(),
        time_limit_sec: None,
        diarization_engine: None,
        transcript_source: None,
        peaks: None,
        filmstrip_thumbs: None,
        sub_export_mode: Some("none".to_string()),
        audio_export_mode: Some("multitrack".to_string()),
        target_lang: Some("vi".to_string()),
    
        sub_style: crate::dubbing::SubStyle::default(),
        hardsub: crate::dubbing::HardSubConfig::default(),
        };
    let out = dir.join("ducked.mp4");
    let _ = std::fs::remove_file(&out);
    let path = export_dubbed_video(None, project, Some(out.to_string_lossy().to_string()), None).expect("xuất video");
    let extract = |track: &str, name: &str| -> Vec<f64> {
        let wav = dir.join(name);
        let st = Command::new(&ff)
            .args(["-y", "-v", "error", "-i", &path, "-map", track, "-ac", "1", "-ar", "8000", "-c:a", "pcm_s16le"])
            .arg(&wav)
            .status()
            .expect("ffmpeg tách track");
        assert!(st.success());
        read_wav_samples(&std::fs::read(&wav).expect("đọc wav"))
    };
    let original = extract("0:a:0", "orig.wav");
    let mixed = extract("0:a:1", "mixed.wav");
    let reference = rms_db(&original, 8000.0, 20.0, 1.0);
    println!("[ducking-real] RMS track lồng tiếng so với nền gốc (dB), mỗi 1 s:");
    for t in 0..45 {
        let c = t as f64 + 0.5;
        println!("  {:>2}s: {:+.1} dB", t, rms_db(&mixed, 8000.0, c, 0.5) - reference);
    }
    let gap = rms_db(&mixed, 8000.0, 8.2, 0.2) - reference;
    let long_rest = rms_db(&mixed, 8000.0, 21.0, 10.0) - reference;
    println!("[ducking-real] khe giữa A và B (8.1–8.3 s): {gap:+.1} dB | đoạn không thoại dài (16–26 s): {long_rest:+.1} dB");
    assert!(gap < -10.0, "khe < 2 s phải còn thấp, đo {gap:.1} dB");
    assert!(long_rest > -1.5, "đoạn không thoại dài phải về 100%, đo {long_rest:.1} dB");
}

/// Đọc PCM s16le mono từ WAV (tìm chunk `data`).
fn read_wav_samples(bytes: &[u8]) -> Vec<f64> {
    let mut i = 12;
    while i + 8 <= bytes.len() {
        let size = u32::from_le_bytes([bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]]) as usize;
        if &bytes[i..i + 4] == b"data" {
            let end = (i + 8 + size).min(bytes.len());
            return bytes[i + 8..end]
                .chunks_exact(2)
                .map(|c| i16::from_le_bytes([c[0], c[1]]) as f64 / 32768.0)
                .collect();
        }
        i += 8 + size + (size & 1);
    }
    Vec::new()
}

fn rms_db(samples: &[f64], rate: f64, center: f64, win: f64) -> f64 {
    let a = ((center - win / 2.0) * rate).max(0.0) as usize;
    let b = (((center + win / 2.0) * rate) as usize).min(samples.len());
    let slice = &samples[a.min(b)..b];
    let ms = slice.iter().map(|x| x * x).sum::<f64>() / slice.len().max(1) as f64;
    10.0 * ms.max(1e-20).log10()
}

/// Chạy ffmpeg thật trên tone 20 s, đo RMS ở các mốc và so với `gain_at` (sai ≤ 1 dB).
/// Bỏ qua (có log) nếu máy không có ffmpeg.
#[test]
fn ffmpeg_filter_matches_envelope_on_real_tone() {
    let voice = [(5.0, 8.0), (9.0, 10.0), (15.0, 16.0)];
    let pts = build_ducking_envelope(&voice, 20.0, &DuckingParams::default());
    let filter = ffmpeg_volume_filter(&pts);
    let out = std::env::temp_dir().join(format!("sublix_ducking_{}.wav", std::process::id()));
    let run = Command::new(crate::dubbing::find_ffmpeg())
        .args(["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=20:sample_rate=48000"])
        .args(["-af", &filter, "-c:a", "pcm_s16le"])
        .arg(&out)
        .output();
    let Ok(run) = run else {
        eprintln!("SKIP: không chạy được ffmpeg");
        return;
    };
    assert!(run.status.success(), "ffmpeg lỗi: {}\nfilter: {filter}", String::from_utf8_lossy(&run.stderr));
    let bytes = std::fs::read(&out).expect("đọc wav");
    let _ = std::fs::remove_file(&out);
    let samples = read_wav_samples(&bytes);
    assert!(samples.len() > 48000 * 19, "wav quá ngắn: {}", samples.len());

    let reference = rms_db(&samples, 48000.0, 1.0, 0.5); // gain = 1 ở t = 1 s
    for t in [1.0, 4.85, 5.0, 5.5, 9.5, 10.3, 10.6, 12.0, 14.85, 15.5, 16.4, 19.0] {
        let measured = rms_db(&samples, 48000.0, t, 0.02) - reference;
        let expected = 20.0 * gain_at(&pts, t).log10();
        assert!((measured - expected).abs() <= 1.0, "t={t}: đo {measured:.2} dB, mong {expected:.2} dB");
    }
}
