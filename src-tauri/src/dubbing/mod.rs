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
use std::sync::atomic::{AtomicBool, Ordering};

pub static DUBBING_CANCELLED: AtomicBool = AtomicBool::new(false);

pub fn cancel_dubbing() {
    DUBBING_CANCELLED.store(true, Ordering::SeqCst);
}

pub fn is_dubbing_cancelled() -> bool {
    DUBBING_CANCELLED.load(Ordering::Relaxed)
}

pub fn reset_dubbing_cancel() {
    DUBBING_CANCELLED.store(false, Ordering::SeqCst);
}

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
    #[serde(default = "default_dubbing_mode")]
    pub dubbing_mode: String, // "ducking" | "vocal_isolation"
    #[serde(default)]
    pub time_limit_sec: Option<f64>,
}

fn default_dubbing_mode() -> String {
    "ducking".to_string()
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
    if let Ok(app_data) = std::env::var("APPDATA") {
        let p_user = PathBuf::from(format!(r"{}\Python\Python313\Scripts\edge-tts.exe", app_data));
        if p_user.exists() {
            return p_user;
        }
    }
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

/// Synthesize a speech file via edge-tts with python -m fallback
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

    let status_res = cmd.status();
    match status_res {
        Ok(st) if st.success() => Ok(()),
        _ => {
            // Robust fallback to python -m edge_tts
            let mut py_cmd = Command::new("python");
            py_cmd.arg("-m")
                .arg("edge_tts")
                .arg("--text")
                .arg(text)
                .arg("--voice")
                .arg(voice)
                .arg("--write-media")
                .arg(out_path);

            if !rate.is_empty() && rate != "+0%" {
                py_cmd.arg("--rate").arg(rate);
            }
            if !pitch.is_empty() && pitch != "+0Hz" {
                py_cmd.arg("--pitch").arg(pitch);
            }

            #[cfg(windows)]
            py_cmd.creation_flags(CREATE_NO_WINDOW);

            let py_status = py_cmd.status().with_context(|| "Failed to execute python -m edge_tts")?;
            if !py_status.success() {
                return Err(anyhow::anyhow!("edge-tts failed with exit code: {:?}", py_status.code()));
            }
            Ok(())
        }
    }
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

/// Clean Whisper hallucinations/non-speech and merge contiguous dialogue clauses
pub fn clean_and_merge_raw_segments(
    raw_segments: Vec<crate::file_sub::SubtitleSegment>,
    src_lang: &str,
) -> Vec<DubbingSegment> {
    let is_cjk = matches!(src_lang.to_lowercase().as_str(), "ja" | "japanese" | "zh" | "chinese");

    // 1. Initial pass: clean, filter silence / hallucinations / micro-noises
    let mut filtered = Vec::new();
    for seg in raw_segments {
        let start_sec = parse_srt_time_to_seconds(&seg.start_time);
        let end_sec = parse_srt_time_to_seconds(&seg.end_time);
        let dur = end_sec - start_sec;

        let cleaned = crate::stt::whisper_local::clean_whisper_transcript(&seg.original);
        if cleaned.is_empty() || crate::stt::whisper_local::is_hallucination(&cleaned) {
            continue;
        }

        // Filter out pure symbols / punctuation
        if cleaned.chars().all(|c| c.is_ascii_punctuation() || "―…、。！？".contains(c)) {
            continue;
        }

        // Filter short isolated filler sounds (< 0.55s and <= 2 chars in CJK or <= 3 in Latin)
        let char_count = cleaned.chars().count();
        if dur < 0.55 && (char_count <= 2 || (char_count <= 3 && !is_cjk)) {
            continue;
        }

        filtered.push((start_sec, end_sec, cleaned));
    }

    if filtered.is_empty() {
        return Vec::new();
    }

    // 2. Smart merge consecutive dialogue clauses belonging to the same speech flow
    let mut merged: Vec<(f64, f64, String)> = Vec::new();

    for (start_sec, end_sec, text) in filtered {
        if let Some(prev) = merged.last_mut() {
            let pause = start_sec - prev.1;
            let total_dur = end_sec - prev.0;

            let prev_text = prev.2.trim();
            let prev_ends_terminal = prev_text.ends_with('?')
                || prev_text.ends_with('！')
                || prev_text.ends_with('？')
                || prev_text.ends_with('!')
                || (prev_text.ends_with('.') && pause >= 0.4)
                || (prev_text.ends_with('。') && pause >= 0.4);

            // Merge if pause is small (< 0.85s), total duration stays within 7.0s, and not a hard stop
            if pause <= 0.85 && total_dur <= 7.0 && !prev_ends_terminal {
                prev.1 = end_sec;
                if is_cjk {
                    prev.2 = format!("{}{}", prev.2, text);
                } else {
                    prev.2 = format!("{} {}", prev.2, text);
                }
                continue;
            }
        }
        merged.push((start_sec, end_sec, text));
    }

    // 3. Speaker clustering on merged sentences
    let mut current_speaker_idx = 0;
    let mut last_end = 0.0;
    let mut segments = Vec::with_capacity(merged.len());

    for (idx, (start_sec, end_sec, text)) in merged.into_iter().enumerate() {
        let pause = start_sec - last_end;
        let prev_text = segments.last().map(|s: &DubbingSegment| s.original_text.as_str()).unwrap_or("");
        let is_speaker_change = idx > 0
            && (pause >= 0.45 || prev_text.ends_with('?') || prev_text.ends_with('？'));

        if is_speaker_change {
            current_speaker_idx = (current_speaker_idx + 1) % 2;
        }

        let speaker_id = format!("speaker_{}", current_speaker_idx);
        last_end = end_sec;

        segments.push(DubbingSegment {
            id: idx + 1,
            speaker_id,
            start_sec,
            end_sec,
            original_text: text,
            dubbed_text: String::new(),
            audio_duration_sec: None,
            status: "ready".to_string(),
        });
    }

    segments
}

/// Analyze media, extract transcript, cluster speakers, and generate translated dubbing script
pub fn analyze_and_create_project(
    app: Option<&AppHandle>,
    input_path: &str,
    source_lang: Option<String>,
    target_lang: Option<String>,
    time_limit_sec: Option<f64>,
) -> Result<DubbingProject> {
    reset_dubbing_cancel();

    let input = Path::new(input_path);
    if !input.exists() {
        return Err(anyhow::anyhow!("File không tồn tại: {}", input_path));
    }

    let emit = |stage: &str, percent: f32, msg: &str, cur: usize, tot: usize| {
        if let Some(a) = app {
            let _ = a.emit(
                "dubbing:progress",
                DubbingProgress {
                    stage: stage.to_string(),
                    percent,
                    message: msg.to_string(),
                    current_item: cur,
                    total_items: tot,
                },
            );
        } else {
            info!("[{stage}] {percent:.0}%: {msg} ({cur}/{tot})");
        }
    };

    emit("extracting", 5.0, "Đang trích xuất audio 16kHz từ video...", 0, 100);

    // 1. Extract 16kHz mono wav (honoring time_limit_sec if specified for lightning-fast testing)
    let temp_dir = std::env::temp_dir().join("sublix_dubbing");
    fs::create_dir_all(&temp_dir)?;
    let temp_wav = temp_dir.join(format!("audio_{}.wav", gen_unique_id()));
    let temp_srt_stem = temp_dir.join(format!("srt_{}", gen_unique_id()));
    let temp_srt_file = temp_dir.join(format!("{}.srt", temp_srt_stem.display()));

    let ffmpeg_bin = find_ffmpeg();
    let mut extract_cmd = Command::new(&ffmpeg_bin);
    extract_cmd.arg("-y");

    if let Some(limit) = time_limit_sec {
        if limit > 0.0 {
            info!("⏱️ Applying time limit: {:.1}s for dubbing test", limit);
            extract_cmd.arg("-t").arg(format!("{:.1}", limit));
        }
    }

    extract_cmd
        .arg("-i")
        .arg(input)
        .arg("-vn")
        .arg("-ar")
        .arg("16000")
        .arg("-ac")
        .arg("1")
        .arg("-c:a")
        .arg("pcm_s16le")
        .arg(&temp_wav);

    #[cfg(windows)]
    extract_cmd.creation_flags(CREATE_NO_WINDOW);

    let extract_status = extract_cmd.status().context("FFmpeg trích xuất âm thanh thất bại")?;
    if !extract_status.success() {
        return Err(anyhow::anyhow!("FFmpeg trích xuất âm thanh thất bại."));
    }

    if is_dubbing_cancelled() {
        let _ = fs::remove_file(&temp_wav);
        return Err(anyhow::anyhow!("Đã dừng tiến trình theo yêu cầu của bạn."));
    }

    emit("transcribing", 15.0, "Đang nhận diện giọng nói & gán mốc thời gian...", 0, 100);

    // 2. Transcribe with Whisper CLI
    let cfg = match app {
        Some(a) => AppConfig::load(a),
        None => AppConfig::load_or_default(),
    };
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
        .arg("-sns")
        .arg("-nth")
        .arg("0.65");

    #[cfg(windows)]
    whisper_cmd.creation_flags(CREATE_NO_WINDOW);

    let whisper_res = whisper_cmd.status().context("Lỗi thực thi whisper-cli")?;
    let _ = fs::remove_file(&temp_wav);

    if is_dubbing_cancelled() {
        let _ = fs::remove_file(&temp_srt_file);
        return Err(anyhow::anyhow!("Đã dừng tiến trình theo yêu cầu của bạn."));
    }

    if !whisper_res.success() || !temp_srt_file.exists() {
        return Err(anyhow::anyhow!("Whisper không tạo được phụ đề cho tệp này."));
    }

    let raw_srt_content = fs::read_to_string(&temp_srt_file).context("Đọc SRT tạm")?;
    let _ = fs::remove_file(&temp_srt_file);

    let raw_segments = crate::file_sub::parse_srt_content(&raw_srt_content);
    if raw_segments.is_empty() {
        return Err(anyhow::anyhow!("Không nhận diện được giọng nói trong tệp này."));
    }

    // 3. Clean, filter hallucinations, and merge contiguous dialogue clauses
    emit("diarizing", 35.0, "Đang lọc ảo giác & ghép nối câu thoại hoàn chỉnh...", 0, raw_segments.len());
    let mut parsed_segments = clean_and_merge_raw_segments(raw_segments, &src_lang);

    if parsed_segments.is_empty() {
        return Err(anyhow::anyhow!("Không phát hiện được câu thoại hợp lệ trong tệp này."));
    }

    let total = parsed_segments.len();
    info!("🎬 Parsed & merged into {} natural dialogue lines", total);

    let tgt_lang = target_lang.unwrap_or_else(|| "vi".to_string());

    // Default speakers setup based on target language
    let speakers = match tgt_lang.as_str() {
        "en" => vec![
            DubbingSpeaker {
                id: "speaker_0".to_string(),
                label: "Speaker 1 (Male Lead)".to_string(),
                voice: "en-US-GuyNeural".to_string(),
                pitch: "+0Hz".to_string(),
                rate: "+0%".to_string(),
            },
            DubbingSpeaker {
                id: "speaker_1".to_string(),
                label: "Speaker 2 (Female Co-star)".to_string(),
                voice: "en-US-JennyNeural".to_string(),
                pitch: "+0Hz".to_string(),
                rate: "+0%".to_string(),
            },
        ],
        "ja" => vec![
            DubbingSpeaker {
                id: "speaker_0".to_string(),
                label: "話者 1 (男性・主役)".to_string(),
                voice: "ja-JP-KeitaNeural".to_string(),
                pitch: "+0Hz".to_string(),
                rate: "+0%".to_string(),
            },
            DubbingSpeaker {
                id: "speaker_1".to_string(),
                label: "話者 2 (女性・対話)".to_string(),
                voice: "ja-JP-NanamiNeural".to_string(),
                pitch: "+0Hz".to_string(),
                rate: "+0%".to_string(),
            },
        ],
        "zh" => vec![
            DubbingSpeaker {
                id: "speaker_0".to_string(),
                label: "讲述人 1 (男主)".to_string(),
                voice: "zh-CN-YunxiNeural".to_string(),
                pitch: "+0Hz".to_string(),
                rate: "+0%".to_string(),
            },
            DubbingSpeaker {
                id: "speaker_1".to_string(),
                label: "讲述人 2 (女主)".to_string(),
                voice: "zh-CN-XiaoxiaoNeural".to_string(),
                pitch: "+0Hz".to_string(),
                rate: "+0%".to_string(),
            },
        ],
        _ => vec![
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
        ],
    };

    // 4. Batch translation to target language via MiniMax-M3 / Ollama (15-20x faster)
    emit("scripting", 50.0, &format!("Đang biên kịch {} câu thoại sang {}...", total, tgt_lang.to_uppercase()), 0, total);
    let trans_variant = TranslationModelVariant::resolve_or_best(Some(&cfg.translation_model));
    let engine_pref = EnginePreference::from_str(&cfg.translation_engine_preference);

    let batch_size = 15;
    for chunk_start in (0..total).step_by(batch_size) {
        if is_dubbing_cancelled() {
            return Err(anyhow::anyhow!("Đã dừng tiến trình theo yêu cầu của bạn."));
        }

        let chunk_end = (chunk_start + batch_size).min(total);
        let percent = 50.0 + (chunk_start as f32 / total as f32) * 45.0;

        emit(
            "scripting",
            percent,
            &format!("Biên kịch câu {}-{}/{} ({})...", chunk_start + 1, chunk_end, total, tgt_lang.to_uppercase()),
            chunk_start + 1,
            total,
        );

        let texts_to_translate: Vec<String> = parsed_segments[chunk_start..chunk_end]
            .iter()
            .map(|s| s.original_text.clone())
            .collect();

        let translated_batch = crate::translate::translate_batch_with_config(
            &texts_to_translate,
            &src_lang,
            &tgt_lang,
            trans_variant,
            engine_pref,
            &cfg,
        );

        for (offset, trans) in translated_batch.into_iter().enumerate() {
            let target_idx = chunk_start + offset;
            if target_idx < parsed_segments.len() {
                parsed_segments[target_idx].dubbed_text = trans;
            }
        }
    }

    let media_duration = if let Some(limit) = time_limit_sec {
        if limit > 0.0 { limit } else { parsed_segments.last().map(|s| s.end_sec).unwrap_or(0.0) }
    } else {
        parsed_segments.last().map(|s| s.end_sec).unwrap_or(0.0)
    };

    emit("done", 100.0, "Phân vai & Kịch bản lồng tiếng hoàn tất!", total, total);

    Ok(DubbingProject {
        input_path: input_path.to_string(),
        media_duration_sec: media_duration,
        speakers,
        segments: parsed_segments,
        bgm_volume: 0.25,
        voice_volume: 1.30,
        dubbing_mode: "ducking".to_string(),
        time_limit_sec,
    })
}

/// Render all dubbed audio segments, time-stretch if needed, and export final video
pub fn export_dubbed_video(
    app: Option<&AppHandle>,
    project: DubbingProject,
    output_path: Option<String>,
) -> Result<String> {
    reset_dubbing_cancel();

    let emit = |stage: &str, percent: f32, msg: &str, cur: usize, tot: usize| {
        if let Some(a) = app {
            let _ = a.emit(
                "dubbing:progress",
                DubbingProgress {
                    stage: stage.to_string(),
                    percent,
                    message: msg.to_string(),
                    current_item: cur,
                    total_items: tot,
                },
            );
        } else {
            info!("[{stage}] {percent:.0}%: {msg} ({cur}/{tot})");
        }
    };

    let total_segs = project.segments.len();
    emit("synthesizing", 5.0, "Bắt đầu tổng hợp giọng lồng tiếng...", 0, total_segs);

    let temp_dir = std::env::temp_dir().join(format!("sublix_render_{}", gen_unique_id()));
    fs::create_dir_all(&temp_dir)?;

    let ffmpeg_bin = find_ffmpeg();
    let mut speech_inputs = Vec::new();

    // 1. Synthesize each segment and check duration
    for (i, seg) in project.segments.iter().enumerate() {
        if is_dubbing_cancelled() {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(anyhow::anyhow!("Đã dừng xuất video theo yêu cầu của bạn."));
        }

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

    // Check if user requested True Vocal Isolation via Demucs AI
    let mut isolated_bgm_path: Option<PathBuf> = None;
    if project.dubbing_mode == "vocal_isolation" {
        emit("demucs", 65.0, "Đang bóc tách giọng nói gốc bằng Demucs AI GPU...", 0, 100);
        let demucs_out = temp_dir.join("demucs_out");
        let _ = fs::create_dir_all(&demucs_out);

        let input_stem = Path::new(&project.input_path)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();

        let mut demucs_cmd = Command::new("python");
        demucs_cmd
            .arg("-m")
            .arg("demucs.separate")
            .arg("--two-stems")
            .arg("vocals")
            .arg("-d")
            .arg("cuda")
            .arg("-o")
            .arg(&demucs_out)
            .arg(&project.input_path);

        #[cfg(windows)]
        demucs_cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(st) = demucs_cmd.status() {
            if st.success() {
                let cand1 = demucs_out.join("htdemucs").join(&*input_stem).join("no_vocals.wav");
                if cand1.exists() {
                    info!("✅ Demucs isolated BGM found: {}", cand1.display());
                    isolated_bgm_path = Some(cand1);
                }
            }
        }
    }

    emit("remuxing", 75.0, "Đang ghép audio lồng tiếng & nhạc nền vào video...", 0, 100);

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
    let bgm_input_ref = if isolated_bgm_path.is_some() {
        format!("[{}:a]", num_speech + 1)
    } else {
        "[0:a]".to_string()
    };

    if num_speech > 0 {
        if num_speech <= 28 {
            mix_filter.push_str(&format!(
                "{labels}amix=inputs={n}:dropout_transition=0,volume={vol}[speech];",
                labels = mix_inputs_labels,
                n = num_speech,
                vol = project.voice_volume
            ));
        } else {
            // Group speech inputs into chunks of at most 28 to obey FFmpeg amix limit (max 32)
            let chunk_size = 28;
            let mut group_labels = String::new();
            let mut group_count = 0;

            for (grp_idx, chunk) in (1..=num_speech).collect::<Vec<_>>().chunks(chunk_size).enumerate() {
                let mut chunk_labels = String::new();
                for &idx in chunk {
                    chunk_labels.push_str(&format!("[a{}]", idx));
                }
                mix_filter.push_str(&format!(
                    "{labels}amix=inputs={n}:dropout_transition=0[grp{grp}];",
                    labels = chunk_labels,
                    n = chunk.len(),
                    grp = grp_idx
                ));
                group_labels.push_str(&format!("[grp{}]", grp_idx));
                group_count += 1;
            }

            mix_filter.push_str(&format!(
                "{labels}amix=inputs={n}:dropout_transition=0,volume={vol}[speech];",
                labels = group_labels,
                n = group_count,
                vol = project.voice_volume
            ));
        }

        // Mix background track (either isolated BGM or ducked original) with speech
        mix_filter.push_str(&format!(
            "{bgm_src}volume={bgm_vol}[bgm];[bgm][speech]amix=inputs=2:dropout_transition=0[final_audio]",
            bgm_src = bgm_input_ref,
            bgm_vol = if isolated_bgm_path.is_some() { 1.0 } else { project.bgm_volume }
        ));
    } else {
        mix_filter.push_str(&format!("{}anull[final_audio]", bgm_input_ref));
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

    // 3. Run master FFmpeg command using -filter_complex_script to avoid Windows command length limits
    let filter_script_path = temp_dir.join("filter_complex.txt");
    fs::write(&filter_script_path, &mix_filter)
        .context("Failed to write filter_complex_script")?;

    let mut remux = Command::new(&ffmpeg_bin);
    remux.arg("-y");
    remux.arg("-i").arg(&project.input_path); // Input 0

    // Add all speech segment inputs
    for (audio_path, _) in &speech_inputs {
        remux.arg("-i").arg(audio_path);
    }

    // Add isolated BGM track if present
    if let Some(ref bgm_file) = isolated_bgm_path {
        remux.arg("-i").arg(bgm_file);
    }

    remux
        .arg("-filter_complex_script")
        .arg(&filter_script_path)
        .arg("-map")
        .arg("0:v?") // Map original video if present
        .arg("-map")
        .arg("[final_audio]") // Map mixed audio
        .arg("-c:v")
        .arg("copy") // Fast video copy, no re-encoding
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("192k");

    if let Some(limit) = project.time_limit_sec {
        if limit > 0.0 {
            info!("⏱️ Remuxing sample video limited to {:.1}s", limit);
            remux.arg("-t").arg(format!("{:.1}", limit));
        }
    }

    remux.arg(&out_file);

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

    // Look for "Duration: 00:00:03.45" safely without raw byte slicing
    if let Some(pos) = stderr.find("Duration: ") {
        let after = &stderr[pos + 10..];
        let token = after
            .split([',', ' ', '\r', '\n'])
            .next()
            .unwrap_or("")
            .trim();
        let secs = parse_srt_time_to_seconds(token);
        if secs > 0.0 {
            return Ok(secs);
        }
    }
    Err(anyhow::anyhow!(
        "Không thể trích xuất thời lượng audio từ FFmpeg cho: {}",
        file.display()
    ))
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
