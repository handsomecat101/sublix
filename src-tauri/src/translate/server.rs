//! llama-server backend: long-running HTTP server that holds the GGUF LLM in
//! GPU VRAM or CPU RAM so each translation call is ~0.08–0.2s on RTX 3090.
//!
//! Features:
//! - Shared `Mutex<Option<TranslationServer>>` singleton (supports hot-swapping model & CPU/GPU engine)
//! - Rolling 2-line context memory so pronouns and split dialogue sentences translate naturally
//! - Supports Qwen3-4B-Instruct-2507, Gemma-3-4B-IT, Qwen3-8B (`/no_think`), and Qwen2.5

use anyhow::{anyhow, Context, Result};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::{info, warn};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use super::{ensure_variant_model, lang_name, TranslationModelVariant};
use crate::stt::EnginePreference;

const SERVER_PORT: u16 = 11435;
const SERVER_URL: &str = "http://127.0.0.1:11435";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(90);
const HEALTHCHECK_INTERVAL: Duration = Duration::from_millis(300);

/// Rolling context buffer of recent (source, translated) subtitle lines.
static RECENT_CONTEXT: Mutex<VecDeque<(String, String)>> = Mutex::new(VecDeque::new());

/// Clear the rolling subtitle context (e.g. when starting a new live session).
pub fn clear_context() {
    if let Ok(mut q) = RECENT_CONTEXT.lock() {
        q.clear();
    }
}

/// What engine the running server is using.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Engine {
    Cuda, // NVIDIA GPU (RTX 3090 etc.)
    Cpu,  // CPU only
}

impl Engine {
    pub fn as_str(&self) -> &'static str {
        match self {
            Engine::Cuda => "cuda",
            Engine::Cpu => "cpu",
        }
    }
}

pub struct TranslationServer {
    child: Child,
    engine: Engine,
    model: TranslationModelVariant,
}

impl TranslationServer {
    pub fn start(model: TranslationModelVariant, pref: EnginePreference) -> Result<Self> {
        let model_path = ensure_variant_model(model)?;

        match pref {
            EnginePreference::Cpu => {
                info!("🎛️  Translation preference: CPU (model={})", model.name());
                Self::start_with_engine(&model_path, model, Engine::Cpu)
                    .context("CPU llama-server binary failed to start")
            }
            EnginePreference::Cuda => {
                info!("🎛️  Translation preference: GPU CUDA (model={})", model.name());
                Self::start_with_engine(&model_path, model, Engine::Cuda)
                    .context("CUDA llama-server binary failed to start")
            }
            EnginePreference::Auto => {
                if let Ok(s) = Self::start_with_engine(&model_path, model, Engine::Cuda) {
                    info!("🚀 Translation server started (CUDA GPU, model={})", model.name());
                    return Ok(s);
                }
                warn!("⚠️  CUDA llama-server not available, falling back to CPU");
                let s = Self::start_with_engine(&model_path, model, Engine::Cpu)
                    .context("Failed to start translation server (no GPU/CPU binary)")?;
                info!("🚀 Translation server started (CPU, model={})", model.name());
                Ok(s)
            }
        }
    }

    fn start_with_engine(
        model_path: &Path,
        model: TranslationModelVariant,
        engine: Engine,
    ) -> Result<Self> {
        let binary = find_server_binary(engine)
            .with_context(|| format!("No {} llama-server binary found", engine.as_str()))?;
        info!(
            "📦 Spawning llama-server: {} (model: {}, engine: {})",
            binary.display(),
            model_path.display(),
            engine.as_str()
        );

        kill_existing_server();

        let ngl: u32 = match engine {
            Engine::Cuda => 999,
            Engine::Cpu => 0,
        };

        let mut cmd = Command::new(&binary);
        if let Some(bin_dir) = binary.parent() {
            cmd.current_dir(bin_dir);
        }
        cmd.arg("-m")
            .arg(model_path)
            .arg("--port")
            .arg(SERVER_PORT.to_string())
            .arg("-ngl")
            .arg(ngl.to_string())
            .arg("-c")
            .arg("2048")
            .arg("-np")
            .arg("1")
            .arg("--log-disable")
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .with_context(|| format!("Failed to spawn llama-server at {}", binary.display()))?;

        let started = Instant::now();
        let client = Client::builder()
            .timeout(Duration::from_secs(3))
            .build()?;
        loop {
            if let Ok(Some(exit_status)) = child.try_wait() {
                return Err(anyhow!(
                    "llama-server exited immediately with status: {exit_status}"
                ));
            }

            if let Ok(resp) = client.get(format!("{}/health", SERVER_URL)).send() {
                if resp.status().is_success() {
                    info!(
                        "✅ llama-server ready on {} ({} engine, model={} loaded in {:.1}s)",
                        SERVER_URL,
                        engine.as_str(),
                        model.name(),
                        started.elapsed().as_secs_f32()
                    );
                    return Ok(Self {
                        child,
                        engine,
                        model,
                    });
                }
            }

            if started.elapsed() > STARTUP_TIMEOUT {
                let _ = child.kill();
                return Err(anyhow!(
                    "llama-server did not become ready in {}s",
                    STARTUP_TIMEOUT.as_secs()
                ));
            }
            std::thread::sleep(HEALTHCHECK_INTERVAL);
        }
    }

    pub fn translate(&self, text: &str, source: &str, target: &str) -> Result<String> {
        let text = text.trim();
        if text.is_empty() {
            return Ok(String::new());
        }
        if source.to_lowercase() == target.to_lowercase() {
            return Ok(text.to_string());
        }

        // Snapshot recent 2 lines of context for pronoun/sentence continuity
        let context_block = {
            let q = RECENT_CONTEXT.lock().ok();
            match q {
                Some(guard) if !guard.is_empty() => {
                    let lines: Vec<String> = guard
                        .iter()
                        .map(|(src, tgt)| format!("  \"{}\" → \"{}\"", src, tgt))
                        .collect();
                    format!(
                        "\nRecent dialogue context (for pronoun/topic continuity only — DO NOT repeat these):\n{}\n",
                        lines.join("\n")
                    )
                }
                _ => String::new(),
            }
        };

        // Add /no_think for Qwen3 hybrid models so they output immediately without <think> blocks
        let no_think_prefix = match self.model {
            TranslationModelVariant::Qwen3_8B | TranslationModelVariant::Qwen3_4B => "/no_think\n",
            _ => "",
        };

        let user_prompt = format!(
            "{no_think}Translate the following {src} subtitle line to {tgt}. Output ONLY the {tgt} translation.{ctx}\nSubtitle to translate: \"{text}\"",
            no_think = no_think_prefix,
            src = lang_name(source),
            tgt = lang_name(target),
            ctx = context_block,
            text = text
        );

        let req = ChatRequest {
            model: self.model.filename(),
            messages: vec![
                ChatMessage {
                    role: "system",
                    content: build_system_prompt_for_http(target),
                },
                ChatMessage {
                    role: "user",
                    content: user_prompt,
                },
            ],
            max_tokens: 180,
            temperature: 0.2,
            seed: Some(42),
        };

        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()?;
        let t0 = Instant::now();
        let resp = client
            .post(format!("{}/v1/chat/completions", SERVER_URL))
            .json(&req)
            .send()
            .with_context(|| "HTTP POST to llama-server failed")?;
        let elapsed = t0.elapsed();

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().unwrap_or_default();
            return Err(anyhow!("llama-server returned {}: {}", status, body));
        }

        let body: ChatResponse = resp
            .json()
            .with_context(|| "Failed to parse llama-server response")?;

        let raw = body
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .unwrap_or_default();

        let translated = post_process(&raw, target);

        // Save to rolling context (keep last 2 lines)
        if !translated.is_empty() {
            if let Ok(mut q) = RECENT_CONTEXT.lock() {
                if q.len() >= 2 {
                    q.pop_front();
                }
                q.push_back((text.to_string(), translated.clone()));
            }
        }

        info!(
            "🌐 LLM ({}, {}): {:.2}s ({}→{}): '{}' → '{}'",
            self.engine.as_str(),
            self.model.name(),
            elapsed.as_secs_f32(),
            source,
            target,
            text,
            translated
        );
        Ok(translated)
    }

    pub fn engine(&self) -> Engine {
        self.engine
    }

    pub fn model(&self) -> TranslationModelVariant {
        self.model
    }

    pub fn stop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        kill_existing_server();
        info!("🛑 Translation server stopped");
    }
}

impl Drop for TranslationServer {
    fn drop(&mut self) {
        self.stop();
    }
}

fn find_server_binary(engine: Engine) -> Result<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let binaries_dir = manifest_dir.join("binaries");
    let candidate = match engine {
        Engine::Cuda => binaries_dir.join("cuda").join("llama-server.exe"),
        Engine::Cpu => binaries_dir.join("llama-server.exe"),
    };
    if candidate.exists() {
        return Ok(candidate);
    }
    Err(anyhow!(
        "llama-server binary not found: {}",
        candidate.display()
    ))
}

fn kill_existing_server() {
    let mut cmd = Command::new("taskkill");
    cmd.args(["/IM", "llama-server.exe", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.output();
}

fn build_system_prompt_for_http(target: &str) -> String {
    let (tgt_name, examples) = match target.to_lowercase().as_str() {
        "vi" | "vietnamese" => (
            "Vietnamese",
            "Examples:\n- \"こんにちは\" → \"Xin chào\"\n- \"ありがとう\" → \"Cảm ơn\"\n- \"本当に大丈夫ですか？\" → \"Cậu có thật sự ổn không?\"\n- \"行こう\" → \"Đi thôi\""
        ),
        "en" | "english" => (
            "English",
            "Examples:\n- \"こんにちは\" → \"Hello\"\n- \"ありがとう\" → \"Thank you\"\n- \"行こう\" → \"Let's go\""
        ),
        "ja" | "japanese" => (
            "Japanese",
            "Examples:\n- \"Hello\" → \"こんにちは\"\n- \"Thank you\" → \"ありがとう\""
        ),
        "zh" | "chinese" => (
            "Chinese",
            "Examples:\n- \"こんにちは\" → \"你好\"\n- \"ありがとう\" → \"谢谢\""
        ),
        "ko" | "korean" => (
            "Korean",
            "Examples:\n- \"こんにちは\" → \"안녕하세요\"\n- \"ありがとう\" → \"감사합니다\""
        ),
        _ => ("the target language", "Examples:\n- \"こんにちは\" → \"Hello\""),
    };
    format!(
        "You are an expert movie subtitle translator.\n\
         RULE 1: Output MUST be natural, concise spoken {tgt} ONLY. Never output CJK or foreign characters when translating to {tgt}.\n\
         RULE 2: Output ONLY the translated subtitle line. No explanations, no quotes, no labels, no <think> tags.\n\
         RULE 3: Keep sentences natural for live movie/video subtitles.\n\
         {examples}",
        tgt = tgt_name
    )
}

/// Strip `<think>...</think>` blocks, surrounding quotes, and stray CJK characters when target is VI/EN.
fn post_process(raw: &str, target: &str) -> String {
    let mut s = raw.trim().to_string();

    // 1. Strip <think>...</think> blocks if any
    while let Some(start) = s.find("<think>") {
        if let Some(end) = s[start..].find("</think>") {
            s.replace_range(start..start + end + "</think>".len(), "");
        } else {
            s.replace_range(start.., "");
            break;
        }
    }
    s = s.trim().to_string();

    // 2. Strip surrounding double/single quotes if the model wrapped the subtitle
    if (s.starts_with('"') && s.ends_with('"')) || (s.starts_with('“') && s.ends_with('”')) {
        let chars: Vec<char> = s.chars().collect();
        if chars.len() >= 2 {
            s = chars[1..chars.len() - 1].iter().collect();
        }
    }

    // 3. Strip stray CJK characters when target is Vietnamese or English
    let cleaned: String = s
        .chars()
        .filter(|c| {
            let cp = *c as u32;
            let is_cjk = matches!(
                cp,
                0x3040..=0x309F // Hiragana
                | 0x30A0..=0x30FF // Katakana
                | 0x4E00..=0x9FFF // CJK Unified Ideographs
                | 0xAC00..=0xD7AF // Hangul Syllables
            );
            match target.to_lowercase().as_str() {
                "vi" | "vietnamese" | "en" | "english" => !is_cjk,
                _ => true,
            }
        })
        .collect();

    cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    max_tokens: u32,
    temperature: f32,
    seed: Option<u32>,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessageOwned,
}

#[derive(Deserialize)]
struct ChatMessageOwned {
    content: String,
}

// === Shared global TranslationServer instance (supports hot-swapping model & engine!) ===

static TRANSLATION_SERVER: Mutex<Option<TranslationServer>> = Mutex::new(None);

fn matches_pref(actual: Engine, pref: EnginePreference) -> bool {
    match pref {
        EnginePreference::Auto => true,
        EnginePreference::Cpu => actual == Engine::Cpu,
        EnginePreference::Cuda => actual == Engine::Cuda,
    }
}

pub fn preload_server(
    model: TranslationModelVariant,
    pref: EnginePreference,
) -> Result<String, String> {
    let resolved_model = TranslationModelVariant::resolve_or_best(Some(model.name()));
    let mut guard = TRANSLATION_SERVER.lock().map_err(|e| e.to_string())?;
    if let Some(ref existing) = *guard {
        if existing.model() == resolved_model && matches_pref(existing.engine(), pref) {
            return Ok(existing.engine().as_str().to_string());
        }
        info!(
            "🔄 Restarting llama-server for new settings (model={} → {}, pref={})",
            existing.model().name(),
            resolved_model.name(),
            pref.as_str()
        );
    }
    *guard = None;
    let server = TranslationServer::start(resolved_model, pref).map_err(|e| format!("{e:#}"))?;
    let eng = server.engine().as_str().to_string();
    *guard = Some(server);
    Ok(eng)
}

pub fn translate_via_server(
    text: &str,
    source: &str,
    target: &str,
    model: TranslationModelVariant,
    pref: EnginePreference,
) -> Result<String> {
    let resolved_model = TranslationModelVariant::resolve_or_best(Some(model.name()));
    let mut guard = TRANSLATION_SERVER
        .lock()
        .map_err(|e| anyhow!("Translation server mutex poisoned: {e}"))?;

    let needs_restart = match *guard {
        Some(ref s) => s.model() != resolved_model || !matches_pref(s.engine(), pref),
        None => true,
    };

    if needs_restart {
        *guard = None;
        let server = TranslationServer::start(resolved_model, pref)?;
        *guard = Some(server);
    }

    let server = guard.as_ref().expect("translation server just initialized");
    server.translate(text, source, target)
}

pub fn current_engine() -> Option<Engine> {
    TRANSLATION_SERVER
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|s| s.engine()))
}

pub fn current_model() -> Option<TranslationModelVariant> {
    TRANSLATION_SERVER
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|s| s.model()))
}

pub fn probe_engine() -> Option<Engine> {
    current_engine()
}

/// Translate text via MiniMax Cloud API (OpenAI-compatible)
pub fn translate_via_minimax(
    text: &str,
    source: &str,
    target: &str,
    api_key: &str,
    model: &str,
) -> Result<String> {
    if api_key.trim().is_empty() {
        return Err(anyhow!("Chưa cài đặt MiniMax API Key. Vui lòng nhập API Key trong tab Cài đặt."));
    }

    let context_block = {
        let q = RECENT_CONTEXT.lock().unwrap();
        match q.back() {
            Some((prev_src, prev_tgt)) => format!(
                "\nRecent dialogue context:\n- {src}: \"{prev_src}\" → {tgt}: \"{prev_tgt}\"",
                src = lang_name(source),
                tgt = lang_name(target),
                prev_src = prev_src,
                prev_tgt = prev_tgt
            ),
            _ => String::new(),
        }
    };

    let user_prompt = format!(
        "Translate the following {src} dialogue to natural, lively spoken {tgt}. Output ONLY the {tgt} translation.{ctx}\nDialogue to translate: \"{text}\"",
        src = lang_name(source),
        tgt = lang_name(target),
        ctx = context_block,
        text = text
    );

    let system_prompt = format!(
        "You are an expert movie scriptwriter and dialogue translator.\n\
         RULE 1: Output MUST be natural, punchy, spoken {tgt} (like in theatrical movie dubs). Never output foreign characters.\n\
         RULE 2: Output ONLY the translated dialogue line. No explanations, no quotes, no conversational filler.\n\
         RULE 3: Match the emotional tone and natural speech rhythm of the scene.",
        tgt = lang_name(target)
    );

    let model_name = if model.trim().is_empty() {
        "MiniMax-M3"
    } else {
        model.trim()
    };

    let body = serde_json::json!({
        "model": model_name,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "temperature": 0.2,
        "reasoning_split": true
    });

    let client = Client::builder().timeout(Duration::from_secs(30)).build()?;
    let t0 = Instant::now();
    let endpoint = "https://api.minimax.io/v1/chat/completions";
    let resp = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .with_context(|| "HTTP POST to MiniMax API failed")?;

    let elapsed = t0.elapsed();

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().unwrap_or_default();
        return Err(anyhow!("MiniMax API returned {}: {}", status, err_text));
    }

    let chat_resp: ChatResponse = resp.json().with_context(|| "Failed to parse MiniMax response")?;
    let raw = chat_resp
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .unwrap_or_default();

    let translated = post_process(&raw, target);

    if !translated.is_empty() {
        if let Ok(mut q) = RECENT_CONTEXT.lock() {
            if q.len() >= 2 {
                q.pop_front();
            }
            q.push_back((text.to_string(), translated.clone()));
        }
    }

    info!(
        "🌐 MiniMax ({:.2}s, {}→{}): '{}' → '{}'",
        elapsed.as_secs_f32(),
        source,
        target,
        text,
        translated
    );
    Ok(translated)
}

/// Translate text via local Ollama instance (OpenAI-compatible)
pub fn translate_via_ollama(
    text: &str,
    source: &str,
    target: &str,
    ollama_url: &str,
    model: &str,
) -> Result<String> {
    let base_url = if ollama_url.trim().is_empty() {
        "http://localhost:11434"
    } else {
        ollama_url.trim().trim_end_matches('/')
    };

    let context_block = {
        let q = RECENT_CONTEXT.lock().unwrap();
        match q.back() {
            Some((prev_src, prev_tgt)) => format!(
                "\nRecent dialogue context:\n- {src}: \"{prev_src}\" → {tgt}: \"{prev_tgt}\"",
                src = lang_name(source),
                tgt = lang_name(target),
                prev_src = prev_src,
                prev_tgt = prev_tgt
            ),
            _ => String::new(),
        }
    };

    let user_prompt = format!(
        "Translate the following {src} dialogue to natural, lively spoken {tgt}. Output ONLY the {tgt} translation.{ctx}\nDialogue to translate: \"{text}\"",
        src = lang_name(source),
        tgt = lang_name(target),
        ctx = context_block,
        text = text
    );

    let system_prompt = format!(
        "You are an expert movie scriptwriter and dialogue translator.\n\
         RULE 1: Output MUST be natural, punchy, spoken {tgt} (like in theatrical movie dubs). Never output foreign characters.\n\
         RULE 2: Output ONLY the translated dialogue line. No explanations, no quotes, no conversational filler.\n\
         RULE 3: Match the emotional tone and natural speech rhythm of the scene.",
        tgt = lang_name(target)
    );

    let body = serde_json::json!({
        "model": if model.trim().is_empty() { "smtek/qwen3.8-27b:q4_k_m" } else { model },
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "temperature": 0.3
    });

    let client = Client::builder().timeout(Duration::from_secs(25)).build()?;
    let t0 = Instant::now();
    let resp = client
        .post(format!("{}/v1/chat/completions", base_url))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .with_context(|| format!("HTTP POST to Ollama ({}) failed", base_url))?;

    let elapsed = t0.elapsed();

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().unwrap_or_default();
        return Err(anyhow!("Ollama returned {}: {}", status, err_text));
    }

    let chat_resp: ChatResponse = resp.json().with_context(|| "Failed to parse Ollama response")?;
    let raw = chat_resp
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .unwrap_or_default();

    let translated = post_process(&raw, target);

    if !translated.is_empty() {
        if let Ok(mut q) = RECENT_CONTEXT.lock() {
            if q.len() >= 2 {
                q.pop_front();
            }
            q.push_back((text.to_string(), translated.clone()));
        }
    }

    info!(
        "🦙 Ollama ({:.2}s, {}→{}): '{}' → '{}'",
        elapsed.as_secs_f32(),
        source,
        target,
        text,
        translated
    );
    Ok(translated)
}

