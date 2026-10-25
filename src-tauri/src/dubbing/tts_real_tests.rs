//! Test CHẠY THẬT (tải model, chạy Python) — mặc định `#[ignore]`. Chạy tường minh:
//!   cargo test --lib tts_real -- --ignored --nocapture --test-threads=1
//! Biến môi trường `SUBLIX_BENCH_OUT` = thư mục ghi WAV (mặc định %TEMP%\sublix-tts-work\wav).

use super::*;
use std::path::PathBuf;

const SENTS: [(&str, &str); 3] = [
    ("s1", "Xin chào các bạn, hôm nay chúng ta sẽ cùng xem một bộ phim hành động cực kỳ hấp dẫn."),
    ("s2", "Anh ấy bước vào phòng, nhìn quanh một lượt rồi khẽ nói: Mọi chuyện đã kết thúc rồi sao?"),
    ("s3", "Ngày 24 tháng 10 năm 2026, đội tuyển Việt Nam thắng 3-1 trước Thái Lan tại sân Mỹ Đình."),
];

fn out_dir(name: &str) -> PathBuf {
    let base = std::env::var("SUBLIX_BENCH_OUT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("sublix-tts-work").join("wav"));
    let d = base.join(name);
    std::fs::create_dir_all(&d).expect("tạo thư mục WAV");
    d
}

fn download(id: &str) {
    let mut last = 0u32;
    let dir = crate::voice_models::download_with_progress(id, |_, _, pct| {
        if pct >= last + 10 || pct == 100 {
            last = pct;
            println!("[download {id}] {pct}%");
        }
    })
    .expect("tải model");
    println!("[download {id}] xong → {}", dir.display());
}

fn synth_all(name: &str, voice: &str) -> f64 {
    let dir = out_dir(name);
    let (mut audio, mut gen) = (0.0f64, 0.0f64);
    for (id, text) in SENTS {
        let out = dir.join(format!("{id}.wav"));
        let _ = std::fs::remove_file(&out);
        let t = std::time::Instant::now();
        synthesize_speech(text, voice, "+0%", "+0Hz", &out).unwrap_or_else(|e| panic!("{name} {id}: {e:#}"));
        gen += t.elapsed().as_secs_f64();
        audio += get_audio_duration(&out).expect("đọc độ dài WAV");
        assert!(is_valid_audio(&out), "{name} {id}: WAV rỗng");
    }
    println!("[{name}] voice={voice} audio={audio:.2}s gen={gen:.2}s (mỗi câu nạp lại model) → {}", dir.display());
    gen / audio
}

#[test]
#[ignore = "tải ~637 MB + pip install vào Python hệ thống"]
fn tts_real_vieneu_download_and_synth() {
    download("vieneu-v3-turbo");
    assert!(tts_vieneu::available(), "VieNeu phải dùng được sau khi tải + cài deps");
    // batch 1 lần (đường export) để đo RTF thực của engine, không tính lần nạp model mỗi câu
    let dir = out_dir("vieneu-batch");
    let items: Vec<(String, String, PathBuf)> = SENTS
        .iter()
        .map(|(id, t)| (t.to_string(), "vietneu:vi_bac_nam".to_string(), dir.join(format!("{id}.wav"))))
        .collect();
    let t = std::time::Instant::now();
    let res = tts_vieneu::synthesize_batch(&items).expect("batch VieNeu");
    let secs = t.elapsed().as_secs_f64();
    let audio: f64 = items.iter().map(|(_, _, p)| get_audio_duration(p).unwrap_or(0.0)).sum();
    println!("[vieneu-batch] ok={}/{} audio={audio:.2}s tổng={secs:.2}s (gồm nạp model) RTF={:.2}", res.iter().filter(|r| r.ok).count(), res.len(), secs / audio);
    assert!(res.iter().all(|r| r.ok), "{res:?}");
    // đường synthesize_speech (preview) với id cũ → phải ra VieNeu thật
    synth_all("vieneu-preview", "vietneu:vi_bac_nu");
}

#[test]
#[ignore = "tải ~909 MB + pip install vào Python hệ thống"]
fn tts_real_zerotts_download_and_synth() {
    download("zerotts");
    assert!(tts_zerotts::available());
    let dir = out_dir("zerotts-batch");
    let items: Vec<(String, String, PathBuf)> = SENTS
        .iter()
        .map(|(id, t)| (t.to_string(), "zerotts:maichi".to_string(), dir.join(format!("{id}.wav"))))
        .collect();
    let t = std::time::Instant::now();
    let res = tts_zerotts::synthesize_batch(&items).expect("batch ZeroTTS");
    let secs = t.elapsed().as_secs_f64();
    let audio: f64 = items.iter().map(|(_, _, p)| get_audio_duration(p).unwrap_or(0.0)).sum();
    println!("[zerotts-batch] ok={}/{} audio={audio:.2}s tổng={secs:.2}s RTF={:.2}", res.iter().filter(|r| r.ok).count(), res.len(), secs / audio);
    assert!(res.iter().all(|r| r.ok), "{res:?}");
}

#[test]
#[ignore = "cần model Kokoro + python"]
fn tts_real_kokoro_s3_before_after_normalize() {
    // TRƯỚC: gọi thẳng sidecar với câu gốc (không chuẩn hóa); SAU: đi qua synthesize_speech (có chuẩn hóa).
    let model_dir = kokoro_model_dir();
    let script = ensure_kokoro_script().expect("script Kokoro");
    let raw = out_dir("kokoro-raw");
    for (id, text) in SENTS {
        let out = raw.join(format!("{id}.wav"));
        let st = Command::new(find_python())
            .arg(&script).arg("--text").arg(text).arg("--voice").arg("tuan_ngoc")
            .arg("--out").arg(&out).arg("--model-dir").arg(&model_dir).arg("--device").arg("cpu")
            .status().expect("chạy Kokoro");
        assert!(st.success());
    }
    synth_all("kokoro-norm", "kokoro:tuan_ngoc");
}

#[test]
#[ignore = "cần VieNeu đã tải + ffmpeg/ffprobe"]
fn tts_real_export_mp4_with_vieneu() {
    // 5 câu phụ đề tiếng Việt (có số/ngày) → lồng tiếng bằng giọng VieNeu mặc định (`vietneu:vi_bac_nam`) → MP4 có track audio.
    let video = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test_dubbing_input").join("A2Z_TEST_EN.mp4");
    assert!(video.exists(), "thiếu {}", video.display());
    let dur = get_audio_duration(&video).expect("độ dài video");
    let texts = [
        "Xin chào các bạn, đây là đoạn thử lồng tiếng.",
        "Ngày 24 tháng 10 năm 2026, đội tuyển Việt Nam thắng 3-1.",
        "Trận đấu bắt đầu lúc 19:30 và có 40.000 khán giả.",
        "Giá vé chỉ 100.000đ, giảm 15%.",
        "Cảm ơn các bạn đã theo dõi.",
    ];
    let segments: Vec<DubbingSegment> = texts
        .iter()
        .enumerate()
        .map(|(i, t)| DubbingSegment {
            id: i + 1,
            speaker_id: "speaker_0".to_string(),
            start_sec: 1.0 + i as f64 * 7.0,
            end_sec: 1.0 + i as f64 * 7.0 + 5.5,
            original_text: format!("line {i}"),
            dubbed_text: t.to_string(),
            audio_duration_sec: None,
            status: "ready".to_string(),
        })
        .collect();
    let project = DubbingProject {
        input_path: video.to_string_lossy().to_string(),
        media_duration_sec: dur,
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
        bgm_volume: 0.5,
        voice_volume: 1.0,
        dubbing_mode: "ducking".to_string(),
        time_limit_sec: None,
        diarization_engine: None,
        transcript_source: None,
        peaks: None,
        filmstrip_thumbs: None,
        sub_export_mode: Some("softsub".to_string()),
        audio_export_mode: Some("multitrack".to_string()),
        target_lang: Some("vi".to_string()),
    };
    let out = out_dir("export").join("vieneu_dubbed.mp4");
    let _ = std::fs::remove_file(&out);
    let path = export_dubbed_video(None, project, Some(out.to_string_lossy().to_string()), None).expect("xuất video");
    println!("[export] → {path}");
    let probe = Command::new("ffprobe")
        .args(["-v", "error", "-show_entries", "stream=index,codec_type,codec_name", "-of", "csv=p=0", &path])
        .output()
        .expect("ffprobe");
    let s = String::from_utf8_lossy(&probe.stdout).to_string();
    println!("[ffprobe streams]\n{s}");
    assert!(s.lines().filter(|l| l.contains("audio")).count() >= 2, "cần ≥ 2 track audio (gốc + lồng tiếng): {s}");
}

#[test]
#[ignore = "chạy sidecar --diagnose (cần VieNeu đã cài)"]
fn tts_real_diagnose() {
    println!("{}", tts_status::diagnose("vieneu").expect("diagnose"));
    println!("{}", tts_status::engines_status());
}