//! Benchmark harness cho TSK-BENCH-MINIMAX-FLASH.
//!
//! Chạy **đúng đường code của app**: `translate::translate_batch_with_config()` với
//! `AppConfig` đọc từ config thật của app (`%APPDATA%\com.sublix.desktop\sublix-config.json`).
//!
//! - Không in API key ra terminal / file / log (chỉ báo `key_present` + độ dài).
//! - Chia chunk đúng như app (`chunk_size = 15`, xem `translate/mod.rs::translate_batch_with_config`).
//! - Ghi JSON kết quả: tổng thời gian, thời gian lô đầu, giây/câu, số câu lỗi/rỗng/còn `<think>`,
//!   số ký tự vào/ra, kèm toàn bộ bản dịch để chấm điểm chất lượng.
//!
//! Usage:
//! ```text
//! cargo run --example bench_translate -- --provider ollama --model qwen2.5:3b \
//!     --srt <file.srt> --out <out.json> --label ollama-qwen25-3b --runs 2
//! ```
//!
//! Key API (nếu cần): đặt biến môi trường `SUBLIX_MINIMAX_KEY` / `SUBLIX_DEEPSEEK_KEY` /
//! `SUBLIX_OPENROUTER_KEY`. Nếu không có, harness dùng key trong config thật của app.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use anyhow::{bail, Context, Result};
use serde_json::{json, Value};

use sublix_lib::config::AppConfig;
use sublix_lib::stt::EnginePreference;
use sublix_lib::translate::{self, server, TranslationModelVariant};

/// Chunk size — phải khớp `translate/mod.rs::translate_batch_with_config` (chunk_size = 15).
const APP_CHUNK_SIZE: usize = 15;

struct Args {
    provider: String,
    model: Option<String>,
    srt: PathBuf,
    out: PathBuf,
    label: String,
    runs: usize,
    chunk: usize,
    source: String,
    target: String,
    engine: EnginePreference,
    probe: bool,
}

fn parse_args() -> Result<Args> {
    let mut provider = String::new();
    let mut model = None;
    let mut srt = PathBuf::new();
    let mut out = PathBuf::new();
    let mut label = String::new();
    let mut runs = 2usize;
    let mut chunk = APP_CHUNK_SIZE;
    let mut source = "en".to_string();
    let mut target = "vi".to_string();
    let mut engine = EnginePreference::Cpu;
    let mut probe = true;

    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0usize;
    while i < argv.len() {
        let need = |i: usize| -> Result<String> {
            argv.get(i + 1)
                .cloned()
                .with_context(|| format!("thieu gia tri cho tham so {}", argv[i]))
        };
        match argv[i].as_str() {
            "--provider" => { provider = need(i)?; i += 2; }
            "--model" => { model = Some(need(i)?); i += 2; }
            "--srt" => { srt = PathBuf::from(need(i)?); i += 2; }
            "--out" => { out = PathBuf::from(need(i)?); i += 2; }
            "--label" => { label = need(i)?; i += 2; }
            "--runs" => { runs = need(i)?.parse()?; i += 2; }
            "--chunk" => { chunk = need(i)?.parse()?; i += 2; }
            "--source" => { source = need(i)?; i += 2; }
            "--target" => { target = need(i)?; i += 2; }
            "--engine" => {
                engine = match need(i)?.as_str() {
                    "cpu" => EnginePreference::Cpu,
                    "gpu" | "cuda" => EnginePreference::Cuda,
                    _ => EnginePreference::Auto,
                };
                i += 2;
            }
            "--no-probe" => { probe = false; i += 1; }
            other => bail!("tham so la: {other}"),
        }
    }

    if provider.is_empty() || srt.as_os_str().is_empty() || out.as_os_str().is_empty() {
        bail!("can --provider, --srt, --out");
    }
    if label.is_empty() {
        label = format!("{}-{}", provider, model.clone().unwrap_or_default());
    }
    Ok(Args { provider, model, srt, out, label, runs, chunk, source, target, engine, probe })
}

/// Đọc file .srt (bỏ chỉ số + timestamp, gộp text nhiều dòng của 1 cue).
fn read_srt(path: &PathBuf) -> Result<Vec<String>> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("doc khong doc duoc: {}", path.display()))?;
    // BOM (Windows PowerShell ghi file UTF-8 co BOM) se lam dong chi so khong con
    // "toan chu so" -> bi dem nham la text. Strip BOM truoc.
    let raw = raw.trim_start_matches('\u{feff}');
    let mut out: Vec<String> = Vec::new();
    let mut cur: Vec<String> = Vec::new();
    for line in raw.lines() {
        let t = line.trim();
        if t.is_empty() {
            if !cur.is_empty() {
                out.push(cur.join(" "));
                cur.clear();
            }
            continue;
        }
        if t.chars().all(|c| c.is_ascii_digit()) && !t.is_empty() {
            continue; // chỉ số cue
        }
        if t.contains("-->") {
            continue; // timestamp
        }
        cur.push(t.to_string());
    }
    if !cur.is_empty() {
        out.push(cur.join(" "));
    }
    Ok(out)
}

/// Ghi đè key trong cfg từ biến môi trường nếu có (không bao giờ in giá trị).
fn apply_env_key(cfg: &mut AppConfig) -> Vec<(String, bool, usize)> {
    let mut info = Vec::new();
    if let Ok(k) = std::env::var("SUBLIX_MINIMAX_KEY") {
        if !k.trim().is_empty() {
            cfg.minimax_api_key = k.clone();
            info.push(("minimax".into(), true, k.len()));
        }
    }
    if let Ok(k) = std::env::var("SUBLIX_DEEPSEEK_KEY") {
        if !k.trim().is_empty() {
            cfg.deepseek_api_key = k.clone();
            info.push(("deepseek".into(), true, k.len()));
        }
    }
    if let Ok(k) = std::env::var("SUBLIX_OPENROUTER_KEY") {
        if !k.trim().is_empty() {
            cfg.openrouter_api_key = k.clone();
            info.push(("openrouter".into(), true, k.len()));
        }
    }
    info
}

fn key_state(cfg: &AppConfig) -> Value {
    json!({
        "minimax": { "present": !cfg.minimax_api_key.trim().is_empty(), "len": cfg.minimax_api_key.len() },
        "deepseek": { "present": !cfg.deepseek_api_key.trim().is_empty(), "len": cfg.deepseek_api_key.len() },
        "openrouter": { "present": !cfg.openrouter_api_key.trim().is_empty(), "len": cfg.openrouter_api_key.len() },
    })
}

/// Gọi thẳng provider để lấy thông báo lỗi gốc (không đụng key trong message).
fn probe_provider(cfg: &AppConfig, args: &Args, first: &str) -> Option<String> {
    let one = vec![first.to_string()];
    let r = match args.provider.to_lowercase().as_str() {
        "minimax" => server::translate_batch_via_minimax(
            &one, &args.source, &args.target, &cfg.minimax_api_key, &cfg.minimax_model, &cfg.glossary,
        ),
        "deepseek" => server::translate_batch_via_deepseek(
            &one, &args.source, &args.target, &cfg.deepseek_api_key, &cfg.deepseek_model, &cfg.glossary,
        ),
        "openrouter" => server::translate_batch_via_openrouter(
            &one, &args.source, &args.target, &cfg.openrouter_api_key, &cfg.openrouter_model, &cfg.glossary,
        ),
        _ => return None,
    };
    match r {
        Ok(v) => Some(format!("probe_ok len={}", v.len())),
        Err(e) => {
            let msg = format!("{e:#}");
            // cắt bớt để không lọt nhầm thông tin nhạy cảm dài dòng
            let msg: String = msg.chars().take(400).collect();
            Some(msg)
        }
    }
}

fn main() -> Result<()> {
    let args = parse_args()?;

    // logging của app (INFO) ra stderr — không chứa API key
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .try_init();

    let items = read_srt(&args.srt)?;
    if items.is_empty() {
        bail!("khong doc duoc cau nao tu {}", args.srt.display());
    }

    let mut cfg = AppConfig::load_or_default();
    let env_keys = apply_env_key(&mut cfg);

    cfg.translation_provider = args.provider.clone();
    match args.provider.to_lowercase().as_str() {
        "ollama" => {
            if let Some(m) = &args.model {
                cfg.ollama_model = m.clone();
            }
        }
        "minimax" => {
            if let Some(m) = &args.model {
                cfg.minimax_model = m.clone();
            }
        }
        "deepseek" => {
            if let Some(m) = &args.model {
                cfg.deepseek_model = m.clone();
            }
        }
        "openrouter" => {
            if let Some(m) = &args.model {
                cfg.openrouter_model = m.clone();
            }
        }
        _ => bail!("provider khong ho tro: {}", args.provider),
    }

    let model_variant = TranslationModelVariant::Qwen25_3B;
    let chars_in: usize = items.iter().map(|s| s.chars().count()).sum();

    eprintln!(
        "[bench] label={} provider={} model={} items={} chunk={} runs={} key_state={} env_key={:?}",
        args.label,
        args.provider,
        args.model.clone().unwrap_or_default(),
        items.len(),
        args.chunk,
        args.runs,
        key_state(&cfg),
        env_keys.iter().map(|(n, _, l)| format!("{n}:present({l})")).collect::<Vec<_>>()
    );

    let probe = if args.probe {
        probe_provider(&cfg, &args, &items[0])
    } else {
        None
    };

    let mut runs_detail: Vec<Value> = Vec::new();
    let mut last_translations: Vec<String> = Vec::new();

    for run in 1..=args.runs {
        let mut translations: Vec<String> = Vec::with_capacity(items.len());
        let mut chunk_times: Vec<Value> = Vec::new();
        let mut first_chunk_s = 0.0f64;
        let t_all = Instant::now();

        for (ci, chunk) in items.chunks(args.chunk).enumerate() {
            let t0 = Instant::now();
            // ĐÚNG đường code app: translate_batch_with_config (tự chunk 15 bên trong,
            // ta gọi theo cùng chunk size nên hành vi giống hệt và có thời gian từng lô).
            let out = translate::translate_batch_with_config(
                chunk,
                &args.source,
                &args.target,
                model_variant,
                args.engine,
                &cfg,
            );
            let dt = t0.elapsed().as_secs_f64();
            if ci == 0 {
                first_chunk_s = dt;
            }
            let mut err = 0usize;
            let mut empty = 0usize;
            let mut think = 0usize;
            for t in &out {
                if translate::is_translate_error(t) {
                    err += 1;
                }
                if t.trim().is_empty() {
                    empty += 1;
                }
                if t.contains("<think>") || t.contains("</think>") {
                    think += 1;
                }
            }
            chunk_times.push(json!({
                "chunk": ci + 1,
                "items": chunk.len(),
                "seconds": (dt * 1000.0).round() / 1000.0,
                "errors": err,
                "empty": empty,
                "think_leak": think,
            }));
            translations.extend(out);
        }

        let total_s = t_all.elapsed().as_secs_f64();
        let n = translations.len().max(1) as f64;
        let chars_out: usize = translations.iter().map(|s| s.chars().count()).sum();
        let err_total = translations.iter().filter(|t| translate::is_translate_error(t)).count();
        let empty_total = translations.iter().filter(|t| t.trim().is_empty()).count();
        let think_total = translations
            .iter()
            .filter(|t| t.contains("<think>") || t.contains("</think>"))
            .count();

        eprintln!(
            "[bench] run {}/{}: total={:.2}s first_chunk={:.2}s per_item={:.3}s err={} empty={} think={}",
            run, args.runs, total_s, first_chunk_s, total_s / n, err_total, empty_total, think_total
        );

        runs_detail.push(json!({
            "run": run,
            "total_s": (total_s * 1000.0).round() / 1000.0,
            "first_chunk_s": (first_chunk_s * 1000.0).round() / 1000.0,
            "per_item_s": ((total_s / n) * 1000.0).round() / 1000.0,
            "items_returned": translations.len(),
            "errors": err_total,
            "empty": empty_total,
            "think_leak": think_total,
            "chars_in": chars_in,
            "chars_out": chars_out,
            "chunks": chunk_times,
        }));
        last_translations = translations;
    }

    let avg = |k: &str| -> f64 {
        let vals: Vec<f64> = runs_detail
            .iter()
            .filter_map(|r| r.get(k).and_then(|v| v.as_f64()))
            .collect();
        if vals.is_empty() {
            return 0.0;
        }
        (vals.iter().sum::<f64>() / vals.len() as f64 * 1000.0).round() / 1000.0
    };

    let src_map: HashMap<String, Value> = items
        .iter()
        .enumerate()
        .map(|(i, s)| (i.to_string(), json!(s)))
        .collect();

    let out_json = json!({
        "label": args.label,
        "provider": args.provider,
        "model": args.model.clone().unwrap_or_default(),
        "source_lang": args.source,
        "target_lang": args.target,
        "chunk_size": args.chunk,
        "items": items.len(),
        "runs": args.runs,
        "key_state": key_state(&cfg),
        "provider_probe": probe,
        "avg_total_s": avg("total_s"),
        "avg_first_chunk_s": avg("first_chunk_s"),
        "avg_per_item_s": avg("per_item_s"),
        "runs_detail": runs_detail,
        "translations": last_translations,
        "source": src_map,
        "note": "Key API KHONG duoc ghi vao file nay. key_state chi ghi co/ khong co + do dai.",
    });

    if let Some(parent) = args.out.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(&args.out, serde_json::to_string_pretty(&out_json)?)
        .with_context(|| format!("khong ghi duoc {}", args.out.display()))?;

    eprintln!(
        "[bench] DONE label={} avg_total={:.2}s avg_first_chunk={:.2}s avg_per_item={:.3}s -> {}",
        args.label,
        out_json["avg_total_s"].as_f64().unwrap_or(0.0),
        out_json["avg_first_chunk_s"].as_f64().unwrap_or(0.0),
        out_json["avg_per_item_s"].as_f64().unwrap_or(0.0),
        args.out.display()
    );
    Ok(())
}
