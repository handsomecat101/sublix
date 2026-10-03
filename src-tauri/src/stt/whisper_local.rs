//! Local Whisper STT — manages Whisper models, binaries, and hallucination filtering.
//!
//! Supports both:
//! - Long-running `whisper-server.exe` (via `whisper_server.rs`, primary fast path)
//! - Subprocess `whisper-cli.exe` (fallback / CLI mode)

use anyhow::{Context, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::{info, warn};

/// Project-relative directories
const BINARIES_DIR: &str = "binaries";
const MODELS_DIR: &str = "models";

/// whisper.cpp release to download (if no binary is present)
const WHISPER_CPP_ZIP_URL: &str =
    "https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip";

/// What engine the running whisper binary uses (for status display + telemetry).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum SttEngine {
    Cuda, // NVIDIA GPU (RTX 3090 etc.) via whisper-cuda prebuilt binary
    Cpu,  // CPU only
}

impl SttEngine {
    pub fn as_str(&self) -> &'static str {
        match self {
            SttEngine::Cuda => "cuda",
            SttEngine::Cpu => "cpu",
        }
    }
}

/// Whisper model variants (mapped to ggml-*.bin files on Hugging Face)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ModelVariant {
    Tiny,            // 39M params, ~75MB
    Base,            // 74M params, ~140MB
    Small,           // 244M params, ~465MB
    LargeV3TurboQ8,  // 809M params (4 decoder layers), Q8_0 ~874MB — ⭐ 2026 GPU sweet spot
    Medium,          // 769M params, ~1.5GB
    LargeV3Turbo,    // 809M params FP16, ~1.62GB
    LargeV3,         // 1.55B params (32 decoder layers), ~3GB
}

impl ModelVariant {
    pub const ALL: &'static [ModelVariant] = &[
        ModelVariant::LargeV3TurboQ8,
        ModelVariant::LargeV3Turbo,
        ModelVariant::Base,
        ModelVariant::Small,
        ModelVariant::Medium,
        ModelVariant::LargeV3,
        ModelVariant::Tiny,
    ];

    pub fn from_name(s: &str) -> Option<Self> {
        match s.to_lowercase().trim() {
            "tiny" => Some(Self::Tiny),
            "base" => Some(Self::Base),
            "small" => Some(Self::Small),
            "large-v3-turbo-q8_0" | "large-v3-turbo-q8" | "turbo-q8" => Some(Self::LargeV3TurboQ8),
            "medium" => Some(Self::Medium),
            "large-v3-turbo" | "turbo" => Some(Self::LargeV3Turbo),
            "large" | "large-v3" | "largev3" => Some(Self::LargeV3),
            _ => None,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::Tiny => "tiny",
            Self::Base => "base",
            Self::Small => "small",
            Self::LargeV3TurboQ8 => "large-v3-turbo-q8_0",
            Self::Medium => "medium",
            Self::LargeV3Turbo => "large-v3-turbo",
            Self::LargeV3 => "large-v3",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::LargeV3TurboQ8 => "large-v3-turbo Q8 (874MB) — ⭐ 2026 GPU Best (Fast + Accurate)",
            Self::LargeV3Turbo => "large-v3-turbo FP16 (1.6GB) — Ultra accurate + fast on GPU",
            Self::Base => "base (140MB) — Fast lightweight (CPU/GPU)",
            Self::Small => "small (465MB) — Balanced mid-range",
            Self::Medium => "medium (1.5GB) — Legacy mid-heavy",
            Self::LargeV3 => "large-v3 (3.0GB) — Full 32-layer (slower than Turbo)",
            Self::Tiny => "tiny (75MB) — Ultra-light test model",
        }
    }

    pub fn filename(&self) -> &'static str {
        match self {
            Self::Tiny => "ggml-tiny.bin",
            Self::Base => "ggml-base.bin",
            Self::Small => "ggml-small.bin",
            Self::LargeV3TurboQ8 => "ggml-large-v3-turbo-q8_0.bin",
            Self::Medium => "ggml-medium.bin",
            Self::LargeV3Turbo => "ggml-large-v3-turbo.bin",
            Self::LargeV3 => "ggml-large-v3.bin",
        }
    }

    pub fn download_url(&self) -> String {
        format!(
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
            self.filename()
        )
    }

    pub fn approximate_size_mb(&self) -> u32 {
        match self {
            Self::Tiny => 75,
            Self::Base => 140,
            Self::Small => 465,
            Self::LargeV3TurboQ8 => 874,
            Self::Medium => 1500,
            Self::LargeV3Turbo => 1620,
            Self::LargeV3 => 3000,
        }
    }

    /// Default model — prefers Large-v3-Turbo Q8 if downloaded, otherwise best installed model.
    pub fn default_mvp() -> Self {
        Self::best_installed().unwrap_or(Self::LargeV3TurboQ8)
    }

    /// Return the best model currently downloaded on disk, in quality/speed priority order.
    pub fn best_installed() -> Option<Self> {
        let priority = [
            Self::LargeV3TurboQ8,
            Self::LargeV3Turbo,
            Self::LargeV3,
            Self::Medium,
            Self::Small,
            Self::Base,
            Self::Tiny,
        ];
        priority.into_iter().find(|v| has_model(*v))
    }
}

/// Result of a local transcription.
#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: String,
    pub model: String,
    pub audio_duration_secs: f32,
    pub inference_duration_secs: f32,
}

impl TranscriptionResult {
    pub fn print(&self) {
        println!("\n📝 Transcription ({}):", self.language);
        println!("─────────────────────────────────────");
        println!("{}", self.text);
        println!("─────────────────────────────────────");
        println!(
            "  Audio: {:.1}s | Inference: {:.1}s ({:.1}x realtime) | Model: {}",
            self.audio_duration_secs,
            self.inference_duration_secs,
            self.audio_duration_secs / self.inference_duration_secs.max(0.01),
            self.model
        );
    }
}

/// Language options for whisper.cpp's `-l` flag.
pub const TRANSCRIBE_LANG_OPTIONS: &[&str] = &[
    "auto", "ja", "en", "vi", "zh", "ko", "fr", "de", "es", "ru", "pt", "it", "th", "id",
];

/// Clean Whisper transcript output:
/// 1. Strips non-speech sound tags like `(音楽)`, `[Music]`, `[BLANK_AUDIO]`, `(拍手)`.
/// 2. Filters common Whisper silence/outro hallucinations (`ご視聴ありがとうございました`, `Thank you for watching`, etc.).
/// 3. Deduplicates pathological phrase repetitions (`"フォーマル・フォーマル"`).
pub fn clean_whisper_transcript(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    if s.is_empty() {
        return String::new();
    }

    // 1. Strip bracketed/parenthesized sound annotations: [...], （...）, (...)
    s = strip_enclosed_tags(&s, '[', ']');
    s = strip_enclosed_tags(&s, '(', ')');
    s = strip_enclosed_tags(&s, '（', '）');
    s = strip_enclosed_tags(&s, '【', '】');
    s = s.replace('♪', "").replace('♬', "").trim().to_string();

    if s.is_empty() {
        return String::new();
    }

    if is_hallucination(&s) {
        return String::new();
    }

    // 2. Collapse pathological repeats (e.g. same sentence/token repeated 3+ times)
    let collapsed = collapse_repetitions(&s);
    if is_hallucination(&collapsed) {
        return String::new();
    }

    collapsed
}

/// Detect known Whisper silence/outro hallucinations in Japanese, English, and Vietnamese.
pub fn is_hallucination(text: &str) -> bool {
    let s = text.trim();
    if s.is_empty() {
        return true;
    }

    let lower = s.to_lowercase();
    let char_count = s.chars().count();

    const HALLUCINATIONS: &[&str] = &[
        // Japanese silence / outro hallucinations (Oyasuminasai -> Chúc ngủ ngon)
        "おやすみなさい",
        "おやすみ",
        "それでは、おやすみなさい",
        "それではおやすみなさい",
        "では、おやすみなさい",
        "じゃあ、おやすみなさい",
        "ご視聴ありがとうございました",
        "ご視聴ありがとうございます",
        "ご視聴",
        "視聴ありがとう",
        "チャンネル登録",
        "高評価",
        "またね",
        "また次回",
        "ではまた",
        "それではまた",
        "じゃあね",
        "バイバイ",
        "さようなら",
        "さよなら",
        "ありがとうございました",
        "ありがとうございます",
        "字幕:",
        "字幕：",
        "翻訳:",
        "サブタイトル",

        // English silence / outro hallucinations
        "good night",
        "goodnight",
        "thank you for watching",
        "thanks for watching",
        "thank you so much for watching",
        "please subscribe",
        "subscribe to my channel",
        "like and subscribe",
        "subtitles by",
        "subtitles:",
        "closed captions by",
        "amara.org",
        "see you next time",
        "see you tomorrow",
        "see you in the next",
        "see you soon",
        "bye bye",
        "bye-bye",
        "goodbye",
        "good bye",
        "the end",
        "blank_audio",

        // Vietnamese translations of silence hallucinations
        "chúc ngủ ngon",
        "chúc bạn ngủ ngon",
        "chúc các bạn ngủ ngon",
        "cảm ơn các bạn đã theo dõi",
        "cảm ơn đã xem",
        "cảm ơn bạn đã xem",
        "cảm ơn vì đã xem",
        "hãy đăng ký kênh",
        "đăng ký kênh",
        "hẹn gặp lại các bạn",
        "hẹn gặp lại",
        "tạm biệt",
    ];

    for h in HALLUCINATIONS {
        if lower.contains(h) && char_count <= 45 {
            return true;
        }
    }

    // Filter pure punctuation / non-speech noises
    let meaningful_chars = s
        .chars()
        .filter(|c| !c.is_whitespace() && !matches!(c, '.' | ',' | '!' | '?' | '。' | '、' | '！' | '？' | '…' | '-' | '—' | '「' | '」' | '"' | '\'' | ':' | '：' | '~' | '〜'))
        .count();
    if meaningful_chars <= 1 {
        return true;
    }

    false
}

fn strip_enclosed_tags(input: &str, open: char, close: char) -> String {
    let mut out = String::with_capacity(input.len());
    let mut depth = 0usize;
    for ch in input.chars() {
        if ch == open {
            depth += 1;
        } else if ch == close {
            if depth > 0 {
                depth -= 1;
            }
        } else if depth == 0 {
            out.push(ch);
        }
    }
    out
}

fn collapse_repetitions(input: &str) -> String {
    let trimmed = input.trim();
    let chars: Vec<char> = trimmed.chars().collect();
    let n = chars.len();
    // Check if the string contains a substring of length 2..=20 repeated 3+ times consecutively
    for pat_len in 2..=(n / 3).min(24) {
        let mut i = 0;
        while i + pat_len * 3 <= n {
            let pat = &chars[i..i + pat_len];
            let mut reps = 1;
            while i + (reps + 1) * pat_len <= n
                && &chars[i + reps * pat_len..i + (reps + 1) * pat_len] == pat
            {
                reps += 1;
            }
            if reps >= 3 {
                // If almost the entire string is this repetition, drop it as hallucination
                if reps * pat_len * 2 >= n {
                    return pat.iter().collect::<String>().trim().to_string();
                }
            }
            i += 1;
        }
    }
    trimmed.to_string()
}

/// Whisper local STT manager.
pub struct WhisperLocal {
    binary_path: PathBuf,
    model_path: PathBuf,
    model: ModelVariant,
    engine: SttEngine,
}

impl WhisperLocal {
    /// Create a new Whisper local instance. Downloads binary + model if needed.
    pub fn new(model: ModelVariant) -> Result<Self> {
        let (binary_path, engine) = ensure_binary_with_engine()?;
        let model_path = ensure_model(model)?;

        Ok(Self {
            binary_path,
            model_path,
            model,
            engine,
        })
    }

    pub fn engine(&self) -> SttEngine {
        self.engine
    }

    /// Transcribe a WAV file using the local whisper.cpp binary.
    pub fn transcribe(&self, wav_path: &str, language: Option<&str>) -> Result<TranscriptionResult> {
        let wav_path = Path::new(wav_path);
        if !wav_path.exists() {
            return Err(anyhow::anyhow!("WAV file not found: {}", wav_path.display()));
        }

        let audio_duration = read_wav_duration(wav_path.to_str().unwrap()).unwrap_or(0.0);
        let lang = language.unwrap_or("auto");
        info!(
            "🎙️ Running: {} (engine={}) -m {} -f {} -l {}",
            self.binary_path.display(),
            self.engine.as_str(),
            self.model_path.display(),
            wav_path.display(),
            lang
        );

        let start = std::time::Instant::now();
        let mut cmd = Command::new(&self.binary_path);
        cmd.arg("-m")
            .arg(&self.model_path)
            .arg("-f")
            .arg(wav_path)
            .arg("-l")
            .arg(lang)
            .arg("--no-prints");
        if self.engine == SttEngine::Cpu {
            cmd.arg("-ng");
        }
        let output = cmd
            .output()
            .with_context(|| format!("Failed to run whisper-cli at {}", self.binary_path.display()))?;
        let inference_duration = start.elapsed().as_secs_f32();

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!(
                "whisper-cli failed (exit {:?}): {}",
                output.status.code(),
                stderr
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let raw_text = parse_whisper_output(&stdout);
        let text = clean_whisper_transcript(&raw_text);

        Ok(TranscriptionResult {
            text,
            language: lang.to_string(),
            model: self.model.filename().to_string(),
            audio_duration_secs: audio_duration,
            inference_duration_secs: inference_duration,
        })
    }
}

fn parse_whisper_output(stdout: &str) -> String {
    let mut texts = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(idx) = line.find(']') {
            let text = line[idx + 1..].trim();
            if !text.is_empty() {
                texts.push(text.to_string());
            }
        } else if !line.starts_with('[') {
            texts.push(line.to_string());
        }
    }
    texts.join(" ")
}

fn read_wav_duration(wav_path: &str) -> Result<f32> {
    let reader = hound::WavReader::open(wav_path)
        .with_context(|| format!("Failed to open WAV: {wav_path}"))?;
    let spec = reader.spec();
    let total_frames = reader.duration() as f32;
    Ok(total_frames / spec.sample_rate as f32)
}

fn candidate_paths(relative_dir: &str, filename: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    paths.push(manifest_dir.join(relative_dir).join("whisper-cuda").join(filename));
    paths.push(manifest_dir.join(relative_dir).join("Release").join(filename));
    paths.push(manifest_dir.join(relative_dir).join("release").join(filename));
    paths.push(manifest_dir.join(relative_dir).join(filename));
    let dirs = [relative_dir, "src-tauri"];
    for d in dirs {
        let p = Path::new(d);
        paths.push(p.join(relative_dir).join("Release").join(filename));
        paths.push(p.join(relative_dir).join(filename));
    }
    paths
}

fn find_cuda_whisper_cli() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        manifest_dir.join(BINARIES_DIR).join("whisper-cuda").join("whisper-cli.exe"),
        manifest_dir.join(BINARIES_DIR).join("cuda").join("whisper-cli.exe"),
    ];
    candidates.into_iter().find(|p| p.exists())
}

fn find_cpu_whisper_cli() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let p = manifest_dir.join(BINARIES_DIR).join("Release").join("whisper-cli.exe");
    if p.exists() {
        return Some(p);
    }
    candidate_paths(BINARIES_DIR, "whisper-cli.exe")
        .into_iter()
        .find(|p| p.exists())
}

fn find_whisper_cli_with_engine() -> Option<(PathBuf, SttEngine)> {
    if let Some(p) = find_cuda_whisper_cli() {
        return Some((p, SttEngine::Cuda));
    }
    if let Some(p) = find_cpu_whisper_cli() {
        return Some((p, SttEngine::Cpu));
    }
    None
}

pub fn ensure_binary_with_engine() -> Result<(PathBuf, SttEngine)> {
    if let Some((path, engine)) = find_whisper_cli_with_engine() {
        info!("✅ whisper-cli found: {} (engine={})", path.display(), engine.as_str());
        return Ok((path, engine));
    }

    warn!("⏬ whisper-cli not found, downloading {}...", WHISPER_CPP_ZIP_URL);
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(BINARIES_DIR);
    std::fs::create_dir_all(&dir).context("Failed to create binaries directory")?;

    let zip_path = dir.join("whisper-bin-x64.zip");
    download_file(WHISPER_CPP_ZIP_URL, &zip_path)?;
    extract_zip(&zip_path, &dir)?;
    let _ = std::fs::remove_file(&zip_path);

    let (binary_path, engine) = find_whisper_cli_with_engine().ok_or_else(|| {
        anyhow::anyhow!("whisper-cli.exe not found after extraction in {}", dir.display())
    })?;
    Ok((binary_path, engine))
}

pub fn ensure_binary() -> Result<PathBuf> {
    ensure_binary_with_engine().map(|(p, _)| p)
}

pub fn current_engine() -> Option<SttEngine> {
    if find_cuda_whisper_cli().is_some() {
        Some(SttEngine::Cuda)
    } else if find_cpu_whisper_cli().is_some() {
        Some(SttEngine::Cpu)
    } else {
        None
    }
}

pub fn has_binary() -> bool {
    find_whisper_cli_with_engine().is_some()
}

pub fn has_model(variant: ModelVariant) -> bool {
    candidate_paths(MODELS_DIR, variant.filename())
        .into_iter()
        .any(|p| p.exists() && std::fs::metadata(&p).map(|m| m.len() > 10_000_000).unwrap_or(false))
}

pub fn model_looks_valid(variant: ModelVariant) -> bool {
    has_model(variant)
}

pub fn ensure_model(variant: ModelVariant) -> Result<PathBuf> {
    ensure_model_with_progress(variant, |_, _, _| ())
}

pub fn ensure_model_with_progress<F>(variant: ModelVariant, mut on_progress: F) -> Result<PathBuf>
where
    F: FnMut(u64, u64, u32),
{
    if let Some(existing) = candidate_paths(MODELS_DIR, variant.filename())
        .into_iter()
        .find(|p| p.exists() && std::fs::metadata(p).map(|m| m.len() > 10_000_000).unwrap_or(false))
    {
        return Ok(existing);
    }

    let target_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(MODELS_DIR);
    std::fs::create_dir_all(&target_dir).context("Failed to create models directory")?;
    let model_path = target_dir.join(variant.filename());
    let temp_path = target_dir.join(format!("{}.downloading", variant.filename()));

    warn!(
        "⏬ Model {} not found, downloading (~{}MB)...",
        variant.filename(),
        variant.approximate_size_mb()
    );
    download_file_with_progress(&variant.download_url(), &temp_path, &mut on_progress)?;
    std::fs::rename(&temp_path, &model_path)
        .with_context(|| format!("Failed to rename downloaded model to {}", model_path.display()))?;
    info!("✅ Model downloaded: {}", model_path.display());
    Ok(model_path)
}

pub fn ensure_local_whisper() -> Result<WhisperLocal> {
    WhisperLocal::new(ModelVariant::default_mvp())
}

pub fn transcribe_wav(wav_path: &str, language: Option<&str>) -> Result<TranscriptionResult> {
    let whisper = ensure_local_whisper()?;
    whisper.transcribe(wav_path, language)
}

fn download_file(url: &str, dest: &Path) -> Result<()> {
    download_file_with_progress(url, dest, |_, _, _| ())
}

fn download_file_with_progress<F>(url: &str, dest: &Path, mut on_progress: F) -> Result<()>
where
    F: FnMut(u64, u64, u32),
{
    info!("📥 Downloading: {url}");

    let client = reqwest::blocking::Client::builder()
        .user_agent("sublix/0.6.0")
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .context("Failed to build HTTP client")?;

    let mut response = client
        .get(url)
        .send()
        .context("Failed to send download request")?
        .error_for_status()
        .context("Download request returned error status")?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut dest_file = std::fs::File::create(dest)
        .with_context(|| format!("Failed to create file: {}", dest.display()))?;

    use std::io::{Read, Write};
    let mut buffer = [0u8; 128 * 1024];
    let mut last_log_pct: i32 = -1;

    loop {
        let bytes_read = response.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        dest_file.write_all(&buffer[..bytes_read])?;
        downloaded += bytes_read as u64;

        if total_size > 0 {
            let pct = ((downloaded * 100) / total_size) as u32;
            on_progress(downloaded, total_size, pct);
            let pct_i = pct as i32;
            if pct_i / 10 != last_log_pct / 10 {
                info!(
                    "  ⏳ {}% ({:.1} MB / {:.1} MB)",
                    pct,
                    downloaded as f64 / 1_048_576.0,
                    total_size as f64 / 1_048_576.0
                );
                last_log_pct = pct_i;
            }
        }
    }

    dest_file.flush()?;
    Ok(())
}

fn extract_zip(zip_path: &Path, dest_dir: &Path) -> Result<()> {
    let file = std::fs::File::open(zip_path)
        .with_context(|| format!("Failed to open zip: {}", zip_path.display()))?;
    let mut archive = zip::ZipArchive::new(file).context("Failed to read zip archive")?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let outpath = match entry.enclosed_name() {
            Some(path) => dest_dir.join(path),
            None => continue,
        };

        if entry.is_dir() {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut entry, &mut outfile)?;
        }
    }

    Ok(())
}
