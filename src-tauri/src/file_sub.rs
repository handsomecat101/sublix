//! File Subtitle Studio — Offline batch video/audio transcription and translation to .srt.
//!
//! Pipeline:
//! 1. Uses `ffmpeg` (already in PATH) to extract 16kHz mono PCM audio from any video/audio file.
//! 2. Transcribes with timestamp accuracy using GPU-accelerated `whisper-cli.exe` with Large-v3-Turbo.
//! 3. Translates subtitles into natural Vietnamese using GPU-accelerated `llama-server` (Qwen3-4B / Gemma 3).
//! 4. Saves `<file>.vi.srt` (and `<file>.bilingual.srt`) directly next to the original media file.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};

use crate::stt::whisper_local::ModelVariant;
use crate::stt::EnginePreference;
use crate::translate::TranslationModelVariant;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleSegment {
    pub index: usize,
    pub start_time: String,
    pub end_time: String,
    pub original: String,
    pub translated: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileSubProgress {
    pub stage: String,           // "extracting" | "transcribing" | "translating" | "saving" | "done"
    pub message: String,
    pub percent: f32,             // 0.0 to 100.0
    pub current_segment: usize,
    pub total_segments: usize,
    pub current_original: Option<String>,
    pub current_translated: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileSubResult {
    pub input_path: String,
    pub vi_srt_path: String,
    pub bilingual_srt_path: Option<String>,
    pub original_srt_path: String,
    pub total_segments: usize,
    pub elapsed_seconds: f32,
    pub media_duration_seconds: Option<f32>,
}

/// Pick media file with Windows native File Open Dialog
pub fn pick_media_file() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter(
            "Media Files (*.mp4;*.mkv;*.avi;*.mov;*.webm;*.mp3;*.m4a;*.wav;*.flac)",
            &[
                "mp4", "mkv", "avi", "mov", "webm", "flv", "ts", "wmv", "mp3", "m4a", "wav",
                "aac", "flac", "ogg", "opus",
            ],
        )
        .add_filter(
            "Video Files (*.mp4;*.mkv;*.avi;*.mov;*.webm)",
            &["mp4", "mkv", "avi", "mov", "webm", "flv", "ts", "wmv"],
        )
        .add_filter(
            "Audio Files (*.mp3;*.m4a;*.wav;*.flac;*.aac)",
            &["mp3", "m4a", "wav", "aac", "flac", "ogg", "opus"],
        )
        .add_filter("All Files (*.*)", &["*"])
        .set_title("Chọn file Video hoặc Audio để tạo phụ đề")
        .pick_file()
        .map(|p| p.to_string_lossy().to_string())
}

/// Extract 16kHz mono PCM WAV from any video/audio using ffmpeg.
pub fn extract_audio_16k_mono(input: &Path, output_wav: &Path) -> Result<()> {
    info!(
        "🎬 Extracting 16kHz audio from {} to {}",
        input.display(),
        output_wav.display()
    );

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y")
        .arg("-i")
        .arg(input)
        .arg("-vn")
        .arg("-ar")
        .arg("16000")
        .arg("-ac")
        .arg("1")
        .arg("-c:a")
        .arg("pcm_s16le")
        .arg(output_wav);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = cmd
        .status()
        .with_context(|| "Failed to execute ffmpeg. Ensure ffmpeg is installed.")?;

    if !status.success() {
        return Err(anyhow::anyhow!("ffmpeg failed with status: {status}"));
    }

    Ok(())
}

/// Mot cue SRT dang duoc gom (timestamp da chuan hoa + cac dong text rieng biet).
struct PendingSrtCue {
    start_time: String,
    end_time: String,
    text_lines: Vec<String>,
}

/// Chuan hoa mot moc thoi gian SRT ve dinh dang `HH:MM:SS,mmm`.
///
/// Chap nhan:
/// - `HH:MM:SS,mmm`, `H:MM:SS,mmm`, `MM:SS,mmm` (thieu phan gio)
/// - Dau phan cach mili-giay la `,` hoac `.` (kieu WebVTT)
/// - Mili-giay thieu chu so 0 (`00:01:02,5` -> `00:01:02,500`)
///
/// Tra ve `None` neu khong parse duoc - cue do se bi bo qua (khong panic).
pub fn normalize_srt_timestamp(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }

    // tach phan mili-giay: chi hop le khi phan truoc co ':' va phan sau toan chu
    // so - tranh bien "00:01:02" thanh "00:01" + "02".
    let (main, frac) = match s.rfind(|c| c == ',' || c == '.') {
        Some(pos) => {
            let (head, tail) = s.split_at(pos);
            let tail = &tail[1..];
            if head.contains(':') && !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()) {
                (head, tail)
            } else {
                (s, "")
            }
        }
        None => (s, ""),
    };

    let parts: Vec<&str> = main.split(':').map(str::trim).collect();
    if parts
        .iter()
        .any(|p| p.is_empty() || !p.chars().all(|c| c.is_ascii_digit()))
    {
        return None;
    }

    let (h, m, sec) = match parts.len() {
        3 => (parts[0], parts[1], parts[2]),
        2 => ("0", parts[0], parts[1]),
        1 => ("0", "0", parts[0]),
        _ => return None,
    };

    let hours: u64 = h.parse().ok()?;
    let minutes: u64 = m.parse().ok()?;
    let seconds: u64 = sec.parse().ok()?;
    if minutes > 59 || seconds > 59 {
        return None;
    }

    // Mili-giay: dem ben phai ("5" -> 500) va cat con dung 3 chu so.
    let mut ms_digits = frac.to_string();
    while ms_digits.len() < 3 {
        ms_digits.push('0');
    }
    ms_digits.truncate(3);
    let ms: u64 = ms_digits.parse().ok()?;

    Some(format!("{:02}:{:02}:{:02},{:03}", hours, minutes, seconds, ms))
}

/// Parse content SRT thanh danh sach subtitle segment.
///
/// BUG FIX (SRT kieu rolling-caption / karaoke cua YouTube): parser cu dung
/// `split("\n\n")` nen bi tach cue lam doi khi cue co dong trong ngay sau dong
/// timestamp - chi ~49/155 cue duoc nap, timeline va track long tieng bi trong.
///
/// Parser moi quet TUYEN TINH theo dong:
/// 1. Chap nhan ca LF va CRLF, bo BOM neu co.
/// 2. Chi mo cue khi gap dong chua `-->`; dong so thu tu cue duoc bo qua.
/// 3. Dong trong KHONG ket thuc cue (chi dong `-->` ke tiep moi mo cue moi).
/// 4. Dong chi gom chu so ma dong khong rong ke tiep chua `-->` la so thu tu cua
///    cue ke tiep -> cham dut text cua cue hien tai (tranh "Heat. Heat. 2").
/// 5. Timestamp chuan hoa ve `HH:MM:SS,mmm`; cue co timestamp hong bi bo qua.
/// 6. Text nhieu dong noi bang MOT dau cach, giu nguyen Unicode.
///
/// Luu y: cue KHONG co text (cue marker cua rolling-caption) van duoc giu lai vi
/// no mang moc thoi gian hop le; viec loai marker thuc hien o tang dubbing
/// (`dubbing::srt_segments_to_dubbing`). File rolling-caption that: 155 cue,
/// trong do 78 cue co text that va 77 cue la marker.
pub fn parse_srt_content(content: &str) -> Vec<SubtitleSegment> {
    let mut segments: Vec<SubtitleSegment> = Vec::new();

    // (1) Chuan hoa line ending + bo BOM.
    let normalized = content
        .trim_start_matches('\u{FEFF}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();

    let mut current: Option<PendingSrtCue> = None;

    for (idx, raw_line) in lines.iter().enumerate() {
        let line = raw_line.trim();

        // (2) Dong timestamp -> dong cue truoc va mo cue moi.
        if line.contains("-->") {
            if let Some(cue) = current.take() {
                push_srt_segment(&mut segments, cue);
            }

            let mut tokens = line.split_whitespace();
            let start_raw = tokens.next();
            let arrow = tokens.next();
            let end_raw = tokens.next();
            if arrow != Some("-->") {
                continue; // dong timestamp hong -> bo qua
            }
            let (Some(start_raw), Some(end_raw)) = (start_raw, end_raw) else {
                continue;
            };
            let (Some(start_time), Some(end_time)) = (
                normalize_srt_timestamp(start_raw),
                normalize_srt_timestamp(end_raw),
            ) else {
                continue; // timestamp khong parse duoc -> bo qua cue do
            };

            current = Some(PendingSrtCue {
                start_time,
                end_time,
                text_lines: Vec::new(),
            });
            continue;
        }

        // (3) Dong trong khong ket thuc cue.
        if line.is_empty() {
            continue;
        }

        // (4) Dong chi gom chu so + dong ke tiep chua "-->" -> so thu tu cue
        //     tiep theo, KHONG phai text.
        if current.is_some()
            && is_digits_only(line)
            && next_non_empty_line_has_arrow(&lines, idx + 1)
        {
            if let Some(cue) = current.take() {
                push_srt_segment(&mut segments, cue);
            }
            continue;
        }

        // (6) Gom text cua cue hien tai.
        if let Some(cue) = current.as_mut() {
            cue.text_lines.push(line.to_string());
        }
    }

    // Dong cue cuoi cung.
    if let Some(cue) = current.take() {
        push_srt_segment(&mut segments, cue);
    }

    segments
}

/// Day cue da gom vao danh sach segment (text nhieu dong noi bang 1 dau cach).
fn push_srt_segment(segments: &mut Vec<SubtitleSegment>, cue: PendingSrtCue) {
    let text = cue.text_lines.join(" ").trim().to_string();
    segments.push(SubtitleSegment {
        index: segments.len() + 1,
        start_time: cue.start_time,
        end_time: cue.end_time,
        original: text,
        translated: None,
    });
}

/// Dong chi gom chu so (dong so thu tu cue trong SRT).
fn is_digits_only(line: &str) -> bool {
    !line.is_empty() && line.chars().all(|c| c.is_ascii_digit())
}

/// Dong khong rong ke tiep (bo qua dong trong) co chua "-->" hay khong.
fn next_non_empty_line_has_arrow(lines: &[&str], mut idx: usize) -> bool {
    while idx < lines.len() {
        let line = lines[idx].trim();
        if !line.is_empty() {
            return line.contains("-->");
        }
        idx += 1;
    }
    false
}

/// Write segments to an SRT file.
pub fn write_srt_file(path: &Path, segments: &[SubtitleSegment], mode: &str) -> Result<()> {
    let mut out = String::with_capacity(segments.len() * 128);

    for (i, seg) in segments.iter().enumerate() {
        let idx = i + 1;
        out.push_str(&format!("{}\n", idx));
        out.push_str(&format!("{} --> {}\n", seg.start_time, seg.end_time));

        match mode {
            "vi" => {
                let text = seg.translated.as_deref().unwrap_or(&seg.original);
                out.push_str(text);
                out.push_str("\n\n");
            }
            "bilingual" => {
                out.push_str(&seg.original);
                out.push('\n');
                if let Some(ref trans) = seg.translated {
                    out.push_str(trans);
                    out.push('\n');
                }
                out.push('\n');
            }
            "original" => {
                out.push_str(&seg.original);
                out.push_str("\n\n");
            }
            _ => {
                let text = seg.translated.as_deref().unwrap_or(&seg.original);
                out.push_str(text);
                out.push_str("\n\n");
            }
        }
    }

    fs::write(path, out.as_bytes())
        .with_context(|| format!("Failed to write SRT file to {}", path.display()))?;

    Ok(())
}

use std::sync::atomic::{AtomicBool, Ordering};

static FILE_SUB_RUNNING: AtomicBool = AtomicBool::new(false);

/// Query whether a file subtitle generation job is currently running
pub fn is_running() -> bool {
    FILE_SUB_RUNNING.load(Ordering::SeqCst)
}

struct FileSubGuard;
impl Drop for FileSubGuard {
    fn drop(&mut self) {
        FILE_SUB_RUNNING.store(false, Ordering::SeqCst);
    }
}

/// Run full end-to-end file subtitle generation.
pub fn generate_file_subtitles(
    app: AppHandle,
    input_path: String,
    source_lang: Option<String>,
    target_lang: Option<String>,
    create_bilingual: bool,
    stt_model_name: Option<String>,
    translation_model_name: Option<String>,
) -> Result<FileSubResult, String> {
    if FILE_SUB_RUNNING.swap(true, Ordering::SeqCst) {
        return Err("Tiến trình tạo phụ đề cho tệp đang chạy. Vui lòng đợi hoàn tất.".to_string());
    }
    let _running_guard = FileSubGuard;

    let t_start = Instant::now();
    let media_path = PathBuf::from(&input_path);
    if !media_path.exists() {
        return Err(format!("File không tồn tại: {}", input_path));
    }

    let parent_dir = media_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let file_stem = media_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("subtitle")
        .to_string();

    let uid = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp_wav = std::env::temp_dir().join(format!("sublix-file-{uid}.wav"));
    let temp_srt_stem = std::env::temp_dir().join(format!("sublix-raw-{uid}"));
    let temp_srt_file = std::env::temp_dir().join(format!("sublix-raw-{uid}.srt"));

    // 1. Stage: Extract audio
    let _ = app.emit(
        "file_sub:progress",
        FileSubProgress {
            stage: "extracting".to_string(),
            message: "Đang trích xuất âm thanh từ video (ffmpeg)...".to_string(),
            percent: 5.0,
            current_segment: 0,
            total_segments: 0,
            current_original: None,
            current_translated: None,
        },
    );

    if let Err(e) = extract_audio_16k_mono(&media_path, &temp_wav) {
        return Err(format!("Lỗi trích xuất audio (ffmpeg): {e:#}"));
    }

    // 2. Stage: Transcribe with Whisper CLI
    let _ = app.emit(
        "file_sub:progress",
        FileSubProgress {
            stage: "transcribing".to_string(),
            message: "Đang nhận diện giọng nói & tạo mốc thời gian (Whisper GPU)...".to_string(),
            percent: 15.0,
            current_segment: 0,
            total_segments: 0,
            current_original: None,
            current_translated: None,
        },
    );

    let stt_variant = stt_model_name
        .as_deref()
        .and_then(ModelVariant::from_name)
        .filter(|v| crate::stt::has_stt_model(*v))
        .or_else(ModelVariant::best_installed)
        .unwrap_or(ModelVariant::LargeV3TurboQ8);

    let model_path = match crate::stt::whisper_local::ensure_model(stt_variant) {
        Ok(p) => p,
        Err(e) => return Err(format!("Không tìm thấy model Whisper: {e:#}")),
    };

    // BUG-H11: tôn trọng engine người dùng đã chọn — nếu họ chọn "CPU" thì
    // không được ép binary CUDA (máy AMD / không có NVIDIA sẽ fail).
    let stt_pref =
        crate::stt::EnginePreference::from_str(&crate::config::AppConfig::load(&app).stt_engine_preference);
    let (whisper_bin, _engine) =
        match crate::stt::whisper_local::ensure_binary_with_engine_pref(stt_pref) {
            Ok(b) => b,
            Err(e) => return Err(format!("Không tìm thấy whisper binary: {e:#}")),
        };

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
        .arg("60")
        .arg("-bo")
        .arg("1")
        .arg("-bs")
        .arg("1")
        .arg("-t")
        .arg("8");

    if _engine == crate::stt::SttEngine::Cuda {
        whisper_cmd.arg("-fa");
    }

    #[cfg(windows)]
    whisper_cmd.creation_flags(CREATE_NO_WINDOW);

    let whisper_res = whisper_cmd
        .status()
        .map_err(|e| format!("Lỗi thực thi whisper-cli: {e:#}"))?;

    if !whisper_res.success() || !temp_srt_file.exists() {
        let _ = fs::remove_file(&temp_wav);
        return Err("Whisper không tạo được file phụ đề".to_string());
    }

    // 3. Stage: Parse Whisper SRT & Clean Silence Hallucinations
    let raw_srt_content = fs::read_to_string(&temp_srt_file)
        .map_err(|e| format!("Không đọc được file SRT tạm: {e:#}"))?;
    let mut segments = parse_srt_content(&raw_srt_content);

    let _ = fs::remove_file(&temp_wav);
    let _ = fs::remove_file(&temp_srt_file);

    // Filter out Whisper silence / outro hallucinations (e.g. Oyasuminasai, Good night, etc.)
    segments.retain_mut(|seg| {
        let cleaned = crate::stt::whisper_local::clean_whisper_transcript(&seg.original);
        if cleaned.is_empty() || crate::stt::whisper_local::is_hallucination(&cleaned) {
            info!("🚫 Filtered silence hallucination from SRT: '{}'", seg.original);
            false
        } else {
            seg.original = cleaned;
            true
        }
    });

    // Re-index remaining segments
    for (idx, seg) in segments.iter_mut().enumerate() {
        seg.index = idx + 1;
    }

    if segments.is_empty() {
        return Err("Không nhận diện được giọng nói hoặc video không có tiếng thoại.".to_string());
    }

    let total = segments.len();
    info!("📝 Whisper recognized {} clean subtitle segments", total);

    // 4. Stage: Translate segments to Vietnamese
    let tgt_lang = target_lang.unwrap_or_else(|| "vi".to_string());
    let trans_variant = TranslationModelVariant::resolve_or_best(translation_model_name.as_deref());

    // Pre-warm LLM translation server
    let _ = app.emit(
        "file_sub:progress",
        FileSubProgress {
            stage: "translating".to_string(),
            message: format!("Đang nạp mô hình dịch AI ({}) trên GPU...", trans_variant.name()),
            percent: 30.0,
            current_segment: 0,
            total_segments: total,
            current_original: None,
            current_translated: None,
        },
    );

    let cfg = crate::config::AppConfig::load(&app);
    if cfg.translation_provider == "local" {
        if let Err(e) = crate::translate::preload_server_with_options(trans_variant, EnginePreference::Auto) {
            warn!("LLM pre-warm error: {e:#}");
        }
    }

    crate::translate::server::clear_context();

    // AUDIT-SUB R3 (v0.9.7): Translate bằng batch function thay vì loop từng segment.
    // `translate_batch_with_config` đã có sẵn ở `translate/mod.rs:328`, chunk 15 segments/batch
    // qua MiniMax-M3 batch endpoint → giảm Stage 3 từ ~40 phút xuống ~5-10 phút cho video 21:43
    // (416 segments). Fallback về single-item khi batch fail. Hallucination filter + cancel check
    // vẫn được áp dụng tương đương loop cũ.
    let originals: Vec<String> = segments.iter().map(|s| s.original.clone()).collect();

    let _ = app.emit(
        "file_sub:progress",
        FileSubProgress {
            stage: "translating".to_string(),
            message: format!(
                "Đang dịch {} câu sang tiếng Việt (lô 15/batch qua {})...",
                total, cfg.translation_provider
            ),
            percent: 30.0,
            current_segment: 0,
            total_segments: total,
            current_original: None,
            current_translated: None,
        },
    );

    let translated_all = crate::translate::translate_batch_with_config(
        &originals,
        &src_lang,
        &tgt_lang,
        trans_variant,
        EnginePreference::Auto,
        &cfg,
    );

    // Map kết quả về segments, áp dụng hallucination filter (giống loop cũ) + fallback original_text
    let mut done = 0usize;
    for (i, translated_raw) in translated_all.into_iter().enumerate() {
        let original_text = originals[i].clone();
        let translated_clean = translated_raw.trim().to_string();
        let final_translated = if translated_clean.is_empty()
            || crate::stt::whisper_local::is_hallucination(&translated_clean)
        {
            original_text.clone()
        } else {
            translated_clean
        };

        segments[i].translated = Some(final_translated.clone());
        done = i + 1;

        // Emit progress theo từng segment (giữ UX granularity giống loop cũ) để UI smooth
        let percent = 30.0 + (done as f32 / total as f32) * 65.0;
        let _ = app.emit(
            "file_sub:progress",
            FileSubProgress {
                stage: "translating".to_string(),
                message: format!("Đang dịch dòng {}/{} sang tiếng Việt...", done, total),
                percent,
                current_segment: done,
                total_segments: total,
                current_original: Some(original_text),
                current_translated: Some(final_translated),
            },
        );
    }

    // Nếu batch trả về ít hơn total (rất hiếm, chỉ khi cancel giữa chừng), gán fallback
    // cho các segment còn lại.
    if done < total {
        warn!(
            "translate_batch_with_config only returned {}/{} segments (likely cancelled)",
            done, total
        );
        for i in done..total {
            if segments[i].translated.is_none() {
                segments[i].translated = Some(segments[i].original.clone());
            }
        }
    }

    // 5. Stage: Write final SRT files next to video
    let _ = app.emit(
        "file_sub:progress",
        FileSubProgress {
            stage: "saving".to_string(),
            message: "Đang lưu các file phụ đề .srt hoàn chỉnh...".to_string(),
            percent: 98.0,
            current_segment: total,
            total_segments: total,
            current_original: None,
            current_translated: None,
        },
    );

    let vi_srt_path = parent_dir.join(format!("{}.vi.srt", file_stem));
    write_srt_file(&vi_srt_path, &segments, "vi")
        .map_err(|e| format!("Lỗi ghi file .vi.srt: {e:#}"))?;

    let bilingual_srt_path = if create_bilingual {
        let bi_path = parent_dir.join(format!("{}.bilingual.srt", file_stem));
        if let Ok(()) = write_srt_file(&bi_path, &segments, "bilingual") {
            Some(bi_path.to_string_lossy().to_string())
        } else {
            None
        }
    } else {
        None
    };

    let original_srt_path = parent_dir.join(format!("{}.original.srt", file_stem));
    let _ = write_srt_file(&original_srt_path, &segments, "original");

    let elapsed = t_start.elapsed().as_secs_f32();

    let result = FileSubResult {
        input_path: media_path.to_string_lossy().to_string(),
        vi_srt_path: vi_srt_path.to_string_lossy().to_string(),
        bilingual_srt_path,
        original_srt_path: original_srt_path.to_string_lossy().to_string(),
        total_segments: total,
        elapsed_seconds: elapsed,
        media_duration_seconds: None,
    };

    let _ = app.emit(
        "file_sub:progress",
        FileSubProgress {
            stage: "done".to_string(),
            message: format!("Đã tạo thành công {} câu phụ đề trong {:.1} giây!", total, elapsed),
            percent: 100.0,
            current_segment: total,
            total_segments: total,
            current_original: None,
            current_translated: None,
        },
    );

    let _ = app.emit("file_sub:complete", &result);

    Ok(result)
}

/// Open Windows Explorer with the specific file selected
pub fn reveal_in_explorer(path_str: &str) -> Result<()> {
    let p = Path::new(path_str);
    if !p.exists() {
        return Err(anyhow::anyhow!("File không tồn tại: {path_str}"));
    }

    #[cfg(windows)]
    {
        let mut cmd = Command::new("explorer.exe");
        cmd.arg(format!("/select,\"{}\"", p.display()));
        cmd.spawn()?;
    }

    Ok(())
}

/// Play video with subtitle directly in VLC
pub fn launch_in_vlc(video_path: &str, srt_path: &str) -> Result<()> {
    let candidates = [
        PathBuf::from(r"C:\Program Files\VideoLAN\VLC\vlc.exe"),
        PathBuf::from(r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe"),
    ];

    let vlc = candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| anyhow::anyhow!("Không tìm thấy VLC Media Player trên máy"))?;

    let mut cmd = Command::new(vlc);
    cmd.arg(video_path)
        .arg(format!("--sub-file={}", srt_path));

    cmd.spawn()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// File SRT rolling-caption that (ten chua dau hai cham rong U+FF1A).
    const REAL_ROLLING_SRT_PATH: &str = "C:\\Users\\TTC\\AppData\\Roaming\\com.sublix.desktop\\downloads\\StarCraft II\u{FF1A} Legacy of the Void - Reclamation [uQnmfEka3vw].en.srt";

    /// Rut gon segment thanh tuple de so sanh (SubtitleSegment chua derive PartialEq).
    fn digest(segments: &[SubtitleSegment]) -> Vec<(usize, String, String, String)> {
        segments
            .iter()
            .map(|s| (s.index, s.start_time.clone(), s.end_time.clone(), s.original.clone()))
            .collect()
    }

    /// Doi "HH:MM:SS,mmm" sang giay.
    fn srt_time_to_seconds(time: &str) -> f64 {
        let clean = time.trim().replace(',', ".");
        let parts: Vec<f64> = clean
            .split(':')
            .filter_map(|p| p.parse::<f64>().ok())
            .collect();
        match parts.len() {
            3 => parts[0] * 3600.0 + parts[1] * 60.0 + parts[2],
            2 => parts[0] * 60.0 + parts[1],
            1 => parts[0],
            _ => 0.0,
        }
    }

    /// Cue "co text that": khong rong, khong phai marker ([ ]), du thoi luong.
    fn is_real_text_segment(seg: &SubtitleSegment) -> bool {
        let text = seg.original.trim();
        if text.is_empty() {
            return false;
        }
        let stripped: String = text
            .chars()
            .filter(|c| !c.is_whitespace() && *c != '[' && *c != ']')
            .collect();
        if stripped.is_empty() {
            return false;
        }
        let dur = srt_time_to_seconds(&seg.end_time) - srt_time_to_seconds(&seg.start_time);
        dur >= 0.055
    }

    /// TEST 1 - fixture that: file rolling-caption 155 cue (78 cue co text that).
    #[test]
    fn test_parse_real_rolling_caption_srt() {
        let path = Path::new(REAL_ROLLING_SRT_PATH);
        if !path.exists() {
            // May khac / CI khong co file mau -> SKIP (khong FAIL).
            eprintln!("SKIP: khong tim thay file SRT mau: {}", path.display());
            return;
        }

        let content = fs::read_to_string(path).expect("doc file SRT mau");
        let segments = parse_srt_content(&content);

        assert_eq!(segments.len(), 155, "phai nhan dien du 155 cue");

        let real_count = segments.iter().filter(|s| is_real_text_segment(s)).count();
        assert_eq!(real_count, 78, "phai co 78 cue co text that");

        let first = &segments[0];
        assert_eq!(first.original, "Heat. Heat.");
        assert_eq!(first.start_time, "00:00:14,440");
        assert_eq!(first.end_time, "00:00:34,870");

        assert_eq!(segments[2].original, "I wish to be alone. Kaldares,");
    }

    /// TEST 2 - CRLF cho ket qua giong het LF.
    #[test]
    fn test_parse_crlf_same_as_lf() {
        let lf = "1\n00:00:01,000 --> 00:00:04,000\n\nHello\n\n2\n00:00:04,000 --> 00:00:06,000\n\nWorld there\n";
        let crlf = lf.replace('\n', "\r\n");

        let lf_segments = parse_srt_content(lf);
        let crlf_segments = parse_srt_content(&crlf);

        assert_eq!(lf_segments.len(), 2);
        assert_eq!(digest(&lf_segments), digest(&crlf_segments));
    }

    /// TEST 3 - BOM cho ket qua giong het khong BOM.
    #[test]
    fn test_parse_bom_same_as_no_bom() {
        let lf = "1\n00:00:01,000 --> 00:00:04,000\n\nHello\n";
        let with_bom = format!("\u{FEFF}{lf}");

        assert_eq!(
            digest(&parse_srt_content(lf)),
            digest(&parse_srt_content(&with_bom))
        );
    }

    /// TEST 4 - chuan hoa timestamp.
    #[test]
    fn test_normalize_srt_timestamp() {
        assert_eq!(
            normalize_srt_timestamp("0:01:02.500").as_deref(),
            Some("00:01:02,500")
        );
        assert_eq!(
            normalize_srt_timestamp("00:01:02,5").as_deref(),
            Some("00:01:02,500")
        );
        assert_eq!(normalize_srt_timestamp("abc"), None);

        // Cac truong hop bien.
        assert_eq!(
            normalize_srt_timestamp("00:00:14,440").as_deref(),
            Some("00:00:14,440")
        );
        assert_eq!(
            normalize_srt_timestamp("01:02,500").as_deref(),
            Some("00:01:02,500")
        );
        assert_eq!(
            normalize_srt_timestamp("00:01:02").as_deref(),
            Some("00:01:02,000")
        );
        assert_eq!(
            normalize_srt_timestamp("00:01:02,1234").as_deref(),
            Some("00:01:02,123")
        );
        assert_eq!(normalize_srt_timestamp(""), None);
        assert_eq!(normalize_srt_timestamp("00:99:00,000"), None);
        assert_eq!(normalize_srt_timestamp("00:01:xx,000"), None);
    }

    /// TEST 5 - dong trong khong ket thuc cue.
    #[test]
    fn test_blank_line_does_not_end_cue() {
        let srt = "1\n00:00:01,000 --> 00:00:04,000\n\nHello world\n\n2\n00:00:04,000 --> 00:00:06,000\n\nSecond cue\n";
        let segments = parse_srt_content(srt);

        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].original, "Hello world");
        assert_eq!(segments[1].original, "Second cue");
    }

    /// TEST 6 - so thu tu cue khong lam vao text.
    #[test]
    fn test_cue_index_not_merged_into_text() {
        let srt = "1\n00:00:14,440 --> 00:00:34,870\n\nHeat. Heat.\n\n2\n00:00:34,870 --> 00:00:34,880\n\n[ ]\n";
        let segments = parse_srt_content(srt);

        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].original, "Heat. Heat.");
        assert_eq!(segments[0].start_time, "00:00:14,440");
        assert_eq!(segments[0].end_time, "00:00:34,870");
        assert_eq!(segments[1].original, "[ ]");
    }

    /// TEST 7 - timestamp khong parse duoc -> bo qua cue do (khong panic).
    #[test]
    fn test_malformed_timestamp_is_skipped() {
        let srt = "1\n00:00:01,000 --> 00:00:04,000\n\nGood cue\n\n2\nnot-a-time --> also-bad\n\nBad cue\n";
        let segments = parse_srt_content(srt);

        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].original, "Good cue");
    }
}
