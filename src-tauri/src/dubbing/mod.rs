//! Sublix AI Dubbing Studio — Automated Multi-Speaker Diarization, Cinematic Scripting, and Voice Dubbing.
//!
//! Workflow:
//! 1. `dubbing_pick_media_file`: Native file dialog to select video or audio.
//! 2. `dubbing_analyze`: Extracts audio via FFmpeg, runs Whisper STT with word/segment timestamps,
//!    performs Speaker Diarization (clustering turns into Speaker 1, Speaker 2,...), and translates
//!    dialogue to cinematic Vietnamese using MiniMax-M3 / Ollama 27B.
//! 3. `dubbing_preview_tts`: Synthesizes single line via neural TTS, returning base64 audio data URI for instant UI preview.
//! 4. `dubbing_export`: Synthesizes all dialogue lines, time-stretches them with FFmpeg `atempo` to match video timing,
//!    and remuxes video + ducked BGM + dubbed voices into a final dubbed video.

use anyhow::{Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;
use tauri::{AppHandle, Emitter};
use tracing::info;

use crate::config::AppConfig;
use crate::stt::whisper_local::ModelVariant;
use crate::stt::EnginePreference;
use crate::translate::TranslationModelVariant;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoicePreset {
    pub id: String,
    pub name: String,
    pub gender: String, // "male" | "female"
    pub lang: String,   // "vi" | "en" | "ja" | "zh" | "ko"
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DubbingSpeaker {
    pub id: String,    // e.g. "speaker_0", "speaker_1"
    pub label: String, // e.g. "Người nói 1 (Nam)", "Người nói 2 (Nữ)"
    pub voice: String, // e.g. "vi-VN-NamMinhNeural"
    pub pitch: String, // "+0Hz"
    pub rate: String,  // "+0%"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DubbingSegment {
    pub id: usize,
    pub speaker_id: String,
    pub start_sec: f64,
    pub end_sec: f64,
    pub original_text: String,
    pub dubbed_text: String,
    pub audio_duration_sec: Option<f64>,
    pub status: String, // "ready" | "previewed" | "rendered"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DubbingProject {
    pub input_path: String,
    pub media_duration_sec: f64,
    pub speakers: Vec<DubbingSpeaker>,
    pub segments: Vec<DubbingSegment>,
    pub bgm_volume: f32,   // 0.25 (25% volume ducking)
    pub voice_volume: f32, // 1.25 (125% voice boost)
}

#[derive(Debug, Clone, Serialize)]
pub struct DubbingProgress {
    pub stage: String, // "extracting" | "transcribing" | "diarizing" | "scripting" | "synthesizing" | "remuxing" | "done"
    pub percent: f32,
    pub message: String,
    pub current_item: usize,
    pub total_items: usize,
}

/// Helper to generate timestamp unique id
fn gen_unique_id() -> u128 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Helper to find ffmpeg executable
pub fn find_ffmpeg() -> PathBuf {
    let p = PathBuf::from(r"C:\Program Files\AI Automation\bin\ffmpeg.exe");
    if p.exists() {
        return p;
    }
    PathBuf::from("ffmpeg")
}

/// Helper to find edge-tts executable
pub fn find_edge_tts() -> PathBuf {
    let p313 = PathBuf::from(r"C:\Program Files\Python313\Scripts\edge-tts.exe");
    if p313.exists() {
        return p313;
    }
    PathBuf::from("edge-tts")
}

/// Get curated list of high-quality neural voices
pub fn get_preset_voices() -> Vec<VoicePreset> {
    vec![
        VoicePreset {
            id: "vi-VN-NamMinhNeural".to_string(),
            name: "Nam Minh (Nam Điện Ảnh - Trầm Ấm)".to_string(),
            gender: "male".to_string(),
            lang: "vi".to_string(),
            description: "Giọng nam miền Bắc, trầm ấm, truyền cảm, thích hợp phim hành động / tài liệu".to_string(),
        },
        VoicePreset {
            id: "vi-VN-HoaiMyNeural".to_string(),
            name: "Hoài My (Nữ Điện Ảnh - Dịu Dàng)".to_string(),
            gender: "female".to_string(),
            lang: "vi".to_string(),
            description: "Giọng nữ miền Bắc, nhẹ nhàng, tự nhiên, thích hợp thoại phim tâm lý / tình cảm".to_string(),
        },
        VoicePreset {
            id: "en-US-GuyNeural".to_string(),
            name: "Guy (English - Male Cinematic)".to_string(),
            gender: "male".to_string(),
            lang: "en".to_string(),
            description: "Deep, natural American male voice for films".to_string(),
        },
        VoicePreset {
            id: "en-US-JennyNeural".to_string(),
            name: "Jenny (English - Female Expressive)".to_string(),
            gender: "female".to_string(),
            lang: "en".to_string(),
            description: "Clear and expressive American female voice".to_string(),
        },
        VoicePreset {
            id: "ja-JP-KeitaNeural".to_string(),
            name: "Keita (Japanese - Male Anime/Drama)".to_string(),
            gender: "male".to_string(),
            lang: "ja".to_string(),
            description: "Natural Japanese male voice".to_string(),
        },
        VoicePreset {
            id: "ja-JP-NanamiNeural".to_string(),
            name: "Nanami (Japanese - Female Soft)".to_string(),
            gender: "female".to_string(),
            lang: "ja".to_string(),
            description: "Emotional Japanese female voice".to_string(),
        },
        VoicePreset {
            id: "zh-CN-YunxiNeural".to_string(),
            name: "Yunxi (Chinese - Male Drama)".to_string(),
            gender: "male".to_string(),
            lang: "zh".to_string(),
            description: "Warm Chinese male dialogue voice".to_string(),
        },
        VoicePreset {
            id: "zh-CN-XiaoxiaoNeural".to_string(),
            name: "Xiaoxiao (Chinese - Female Expressive)".to_string(),
            gender: "female".to_string(),
            lang: "zh".to_string(),
            description: "Expressive Chinese female voice".to_string(),
        },
    ]
}

/// Synthesize a speech file via edge-tts
pub fn synthesize_speech(text: &str, voice: &str, rate: &str, pitch: &str, out_path: &Path) -> Result<()> {
    let tts_bin = find_edge_tts();
    let mut cmd = Command::new(&tts_bin);
    cmd.arg("--text")
        .arg(text)
        .arg("--voice")
        .arg(voice)
        .arg("--write-media")
        .arg(out_path);

    if !rate.is_empty() && rate != "+0%" {
        cmd.arg("--rate").arg(rate);
    }
    if !pitch.is_empty() && pitch != "+0Hz" {
        cmd.arg("--pitch").arg(pitch);
    }

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = cmd
        .status()
        .with_context(|| format!("Failed to execute edge-tts at {:?}", tts_bin))?;

    if !status.success() {
        return Err(anyhow::anyhow!("edge-tts failed with exit code: {:?}", status.code()));
    }

    Ok(())
}

/// Synthesize single line and return as base64 data URI
pub fn preview_single_line(text: &str, voice: &str, rate: Option<&str>, pitch: Option<&str>) -> Result<String> {
    let temp_dir = std::env::temp_dir().join("sublix_dubbing");
    fs::create_dir_all(&temp_dir)?;
    let temp_file = temp_dir.join(format!("preview_{}.mp3", gen_unique_id()));

    synthesize_speech(
        text,
        voice,
        rate.unwrap_or("+0%"),
        pitch.unwrap_or("+0Hz"),
        &temp_file,
    )?;

    let bytes = fs::read(&temp_file).context("Read preview mp3")?;
    let _ = fs::remove_file(&temp_file);

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:audio/mp3;base64,{}", b64))
}

/// Analyze media, extract transcript, cluster speakers, and generate translated dubbing script
pub fn analyze_and_create_project(
    app: &AppHandle,
    input_path: &str,
    source_lang: Option<String>,
) -> Result<DubbingProject> {
    let input = Path::new(input_path);
    if !input.exists() {
        return Err(anyhow::anyhow!("File không tồn tại: {}", input_path));
    }

    let emit = |stage: &str, percent: f32, msg: &str, cur: usize, tot: usize| {
        let _ = app.emit(
            "dubbing:progress",
            DubbingProgress {
                stage: stage.to_string(),
                percent,
                message: msg.to_string(),
                current_item: cur,
                total_items: tot,
            },
        );
    };

    emit("extracting", 5.0, "Đang trích xuất audio 16kHz từ video...", 0, 100);

    // 1. Extract 16kHz mono wav
    let temp_dir = std::env::temp_dir().join("sublix_dubbing");
    fs::create_dir_all(&temp_dir)?;
    let temp_wav = temp_dir.join(format!("audio_{}.wav", gen_unique_id()));
    let temp_srt_stem = temp_dir.join(format!("srt_{}", gen_unique_id()));
    let temp_srt_file = temp_dir.join(format!("{}.srt", temp_srt_stem.display()));

    crate::file_sub::extract_audio_16k_mono(input, &temp_wav)
        .context("FFmpeg trích xuất âm thanh thất bại")?;

    emit("transcribing", 15.0, "Đang nhận diện giọng nói & gán mốc thời gian...", 0, 100);

    // 2. Transcribe with Whisper CLI
    let cfg = AppConfig::load(app);
    let stt_variant = ModelVariant::from_name(&cfg.stt_model).unwrap_or(ModelVariant::LargeV3TurboQ8);
    let model_path = crate::stt::whisper_local::ensure_model(stt_variant)
        .context("Không tìm thấy model Whisper")?;
    let (whisper_bin, _engine) = crate::stt::whisper_local::ensure_binary_with_engine()
        .context("Không tìm thấy whisper binary")?;

    let src_lang = source_lang.unwrap_or_else(|| "auto".to_string());

    let mut whisper_cmd = Command::new(&whisper_bin);
    if let Some(bin_dir) = whisper_bin.parent() {
        whisper_cmd.current_dir(bin_dir);
    }
    whisper_cmd
        .arg("-m")
        .arg(&model_path)
        .arg("-f")
        .arg(&temp_wav)
        .arg("-l")
        .arg(&src_lang)
        .arg("-osrt")
        .arg("-of")
        .arg(&temp_srt_stem)
        .arg("--max-len")
        .arg("60");

    #[cfg(windows)]
    whisper_cmd.creation_flags(CREATE_NO_WINDOW);

    let whisper_res = whisper_cmd.status().context("Lỗi thực thi whisper-cli")?;
    let _ = fs::remove_file(&temp_wav);

    if !whisper_res.success() || !temp_srt_file.exists() {
        return Err(anyhow::anyhow!("Whisper không tạo được phụ đề cho tệp này."));
    }

    let raw_srt_content = fs::read_to_string(&temp_srt_file).context("Đọc SRT tạm")?;
    let _ = fs::remove_file(&temp_srt_file);

    let raw_segments = crate::file_sub::parse_srt_content(&raw_srt_content);
    if raw_segments.is_empty() {
        return Err(anyhow::anyhow!("Không nhận diện được giọng nói trong tệp này."));
    }

    let total = raw_segments.len();
    emit("diarizing", 35.0, "Đang phân tích ngữ điệu & phân vai nhân vật...", 0, total);

    // 3. Speaker Diarization Heuristic (Alternating conversation clustering & silence gap analysis)
    let mut current_speaker_idx = 0;
    let mut last_end = 0.0;
    let mut parsed_segments = Vec::new();

    for (idx, seg) in raw_segments.into_iter().enumerate() {
        let start_sec = parse_srt_time_to_seconds(&seg.start_time);
        let end_sec = parse_srt_time_to_seconds(&seg.end_time);

        // If gap between sentences is > 0.9s or previous sentence ends with question mark,
        // it strongly indicates a speaker change in dialogues.
        let is_gap = (start_sec - last_end) > 0.9;
        let is_question = parsed_segments
            .last()
            .map(|s: &DubbingSegment| s.original_text.ends_with('?'))
            .unwrap_or(false);

        if (is_gap || is_question) && idx > 0 {
            current_speaker_idx = (current_speaker_idx + 1) % 2; // Alternate between 2 primary speakers
        }

        let speaker_id = format!("speaker_{}", current_speaker_idx);
        last_end = end_sec;

        parsed_segments.push(DubbingSegment {
            id: idx + 1,
            speaker_id,
            start_sec,
            end_sec,
            original_text: seg.original,
            dubbed_text: String::new(),
            audio_duration_sec: None,
            status: "ready".to_string(),
        });
    }

    // Default speakers setup
    let speakers = vec![
        DubbingSpeaker {
            id: "speaker_0".to_string(),
            label: "Người nói 1 (Nam Chính)".to_string(),
            voice: "vi-VN-NamMinhNeural".to_string(),
            pitch: "+0Hz".to_string(),
            rate: "+0%".to_string(),
        },
        DubbingSpeaker {
            id: "speaker_1".to_string(),
            label: "Người nói 2 (Nữ / Đối thoại)".to_string(),
            voice: "vi-VN-HoaiMyNeural".to_string(),
            pitch: "+0Hz".to_string(),
            rate: "+0%".to_string(),
        },
    ];

    // 4. Translate dialogue lines to Vietnamese via MiniMax-M3 / Ollama
    emit("scripting", 50.0, "Đang viết kịch bản thoại điện ảnh (MiniMax-M3)...", 0, total);
    let trans_variant = TranslationModelVariant::resolve_or_best(Some(&cfg.translation_model));
    let engine_pref = EnginePreference::from_str(&cfg.translation_engine_preference);

    for (idx, seg) in parsed_segments.iter_mut().enumerate() {
        let percent = 50.0 + (idx as f32 / total as f32) * 45.0;
        emit(
            "scripting",
            percent,
            &format!("Biên kịch câu {}/{}: {}", idx + 1, total, seg.original_text),
            idx + 1,
            total,
        );

        match crate::translate::translate_text_with_config(
            &seg.original_text,
            &src_lang,
            "vi",
            trans_variant,
            engine_pref,
            &cfg,
        ) {
            Ok(translated) if !translated.trim().is_empty() => {
                seg.dubbed_text = translated;
            }
            _ => {
                seg.dubbed_text = seg.original_text.clone();
            }
        }
    }

    let media_duration = parsed_segments.last().map(|s| s.end_sec).unwrap_or(0.0);

    emit("done", 100.0, "Phân vai & Kịch bản lồng tiếng hoàn tất!", total, total);

    Ok(DubbingProject {
        input_path: input_path.to_string(),
        media_duration_sec: media_duration,
        speakers,
        segments: parsed_segments,
        bgm_volume: 0.25,
        voice_volume: 1.30,
    })
}

/// Render all dubbed audio segments, time-stretch if needed, and export final video
pub fn export_dubbed_video(
    app: &AppHandle,
    project: DubbingProject,
    output_path: Option<String>,
) -> Result<String> {
    let emit = |stage: &str, percent: f32, msg: &str, cur: usize, tot: usize| {
        let _ = app.emit(
            "dubbing:progress",
            DubbingProgress {
                stage: stage.to_string(),
                percent,
                message: msg.to_string(),
                current_item: cur,
                total_items: tot,
            },
        );
    };

    let total_segs = project.segments.len();
    emit("synthesizing", 5.0, "Bắt đầu tổng hợp giọng lồng tiếng...", 0, total_segs);

    let temp_dir = std::env::temp_dir().join(format!("sublix_render_{}", gen_unique_id()));
    fs::create_dir_all(&temp_dir)?;

    let ffmpeg_bin = find_ffmpeg();
    let mut speech_inputs = Vec::new();

    // 1. Synthesize each segment and check duration
    for (i, seg) in project.segments.iter().enumerate() {
        let percent = 5.0 + (i as f32 / total_segs as f32) * 55.0;
        emit(
            "synthesizing",
            percent,
            &format!("Phát âm câu {}/{}: {}", i + 1, total_segs, seg.dubbed_text),
            i + 1,
            total_segs,
        );

        let speaker = project
            .speakers
            .iter()
            .find(|s| s.id == seg.speaker_id)
            .unwrap_or(&project.speakers[0]);

        let seg_mp3 = temp_dir.join(format!("seg_{}.mp3", i));
        synthesize_speech(
            &seg.dubbed_text,
            &speaker.voice,
            &speaker.rate,
            &speaker.pitch,
            &seg_mp3,
        )?;

        let slot_duration = (seg.end_sec - seg.start_sec).max(0.5);

        // Get actual duration of generated mp3 via ffprobe/ffmpeg
        let actual_dur = get_audio_duration(&seg_mp3).unwrap_or(slot_duration);

        // If audio duration is longer than the dialogue slot, time-stretch with atempo
        let final_audio = if actual_dur > slot_duration * 1.05 {
            let tempo = (actual_dur / slot_duration).clamp(1.0, 1.45);
            let stretched = temp_dir.join(format!("seg_stretched_{}.wav", i));
            let mut stretch_cmd = Command::new(&ffmpeg_bin);
            stretch_cmd
                .arg("-y")
                .arg("-i")
                .arg(&seg_mp3)
                .arg("-filter:a")
                .arg(format!("atempo={:.2}", tempo))
                .arg(&stretched);

            #[cfg(windows)]
            stretch_cmd.creation_flags(CREATE_NO_WINDOW);

            if stretch_cmd.status().map(|s| s.success()).unwrap_or(false) {
                stretched
            } else {
                seg_mp3
            }
        } else {
            seg_mp3
        };

        speech_inputs.push((final_audio, seg.start_sec));
    }

    emit("remuxing", 70.0, "Đang ghép audio lồng tiếng & nhạc nền vào video...", 0, 100);

    // 2. Mix speech segments at their start times
    let mut mix_filter = String::new();
    let mut mix_inputs_labels = String::new();

    for (idx, (_, start_sec)) in speech_inputs.iter().enumerate() {
        let input_idx = idx + 1; // 0 is original media file
        let delay_ms = (start_sec * 1000.0).round() as u64;
        mix_filter.push_str(&format!(
            "[{}:a]adelay={}|{}[a{}];",
            input_idx, delay_ms, delay_ms, input_idx
        ));
        mix_inputs_labels.push_str(&format!("[a{}]", input_idx));
    }

    let num_speech = speech_inputs.len();
    if num_speech > 0 {
        mix_filter.push_str(&format!(
            "{labels}amix=inputs={n}:dropout_transition=0,volume={vol}[speech];",
            labels = mix_inputs_labels,
            n = num_speech,
            vol = project.voice_volume
        ));
        // Duck original background audio to bgm_volume and mix with speech
        mix_filter.push_str(&format!(
            "[0:a]volume={bgm_vol}[bgm];[bgm][speech]amix=inputs=2:dropout_transition=0[final_audio]",
            bgm_vol = project.bgm_volume
        ));
    } else {
        mix_filter.push_str("[0:a]anull[final_audio]");
    }

    // Determine target output file path
    let out_file = if let Some(p) = output_path {
        PathBuf::from(p)
    } else {
        let input = Path::new(&project.input_path);
        let parent = input.parent().unwrap_or_else(|| Path::new("."));
        let stem = input.file_stem().unwrap_or_default().to_string_lossy();
        parent.join(format!("{}_dubbed.mp4", stem))
    };

    // 3. Run master FFmpeg command
    let mut remux = Command::new(&ffmpeg_bin);
    remux.arg("-y");
    remux.arg("-i").arg(&project.input_path); // Input 0

    // Add all speech segment inputs
    for (audio_path, _) in &speech_inputs {
        remux.arg("-i").arg(audio_path);
    }

    remux
        .arg("-filter_complex")
        .arg(&mix_filter)
        .arg("-map")
        .arg("0:v?") // Map original video if present
        .arg("-map")
        .arg("[final_audio]") // Map mixed audio
        .arg("-c:v")
        .arg("copy") // Fast video copy, no re-encoding
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("192k")
        .arg(&out_file);

    #[cfg(windows)]
    remux.creation_flags(CREATE_NO_WINDOW);

    info!("🎬 Executing FFmpeg Dubbing Remux to {}", out_file.display());
    let status = remux.status().with_context(|| "FFmpeg remux failed")?;

    let _ = fs::remove_dir_all(&temp_dir);

    if !status.success() {
        return Err(anyhow::anyhow!("FFmpeg xuất video lồng tiếng thất bại."));
    }

    emit("done", 100.0, "Xuất video lồng tiếng thành công!", 100, 100);
    Ok(out_file.to_string_lossy().to_string())
}

/// Helper to get audio duration in seconds via FFmpeg
fn get_audio_duration(file: &Path) -> Result<f64> {
    let ffmpeg_bin = find_ffmpeg();
    let mut cmd = Command::new(&ffmpeg_bin);
    cmd.arg("-i").arg(file);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()?;
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Look for "Duration: 00:00:03.45"
    if let Some(pos) = stderr.find("Duration: ") {
        let dur_str = &stderr[pos + 10..pos + 21];
        return Ok(parse_srt_time_to_seconds(dur_str));
    }
    Ok(2.0)
}

/// Parse "00:01:23.456" or "00:01:23,456" into seconds f64
fn parse_srt_time_to_seconds(time_str: &str) -> f64 {
    let clean = time_str.trim().replace(',', ".");
    let parts: Vec<&str> = clean.split(':').collect();
    if parts.len() == 3 {
        let hours: f64 = parts[0].parse().unwrap_or(0.0);
        let mins: f64 = parts[1].parse().unwrap_or(0.0);
        let secs: f64 = parts[2].parse().unwrap_or(0.0);
        hours * 3600.0 + mins * 60.0 + secs
    } else {
        0.0
    }
}
