//! Harness benchmark dịch — dùng chung cho `examples/bench_translate.rs` và test `#[ignore]`.
//!
//! **Vì sao có cả hai?** Smart App Control trên Win11 chặn binary mới build trong
//! `target/debug/examples/` (os error 4551) nhưng **cho phép** binary test trong
//! `target/debug/deps/`. Nên:
//! - `examples/bench_translate.rs` = CLI (build được, chạy được ở máy không bật SAC)
//! - `translate::bench_tests::bench_translate_ignored` = cùng logic, chạy được qua `cargo test`
//!
//! Logic nằm ở đây để không lặp code.

use std::time::Instant;

use anyhow::{bail, Result};
use serde_json::{json, Value};

use crate::config::AppConfig;
use crate::translate::contextual::ScriptLine;
use crate::translate::{self, server, TranslationModelVariant};

pub mod dataset;
pub mod score;

pub use self::dataset::{read_dataset, read_srt, BenchOptions, DatasetLine};

/// Ghi đè key trong cfg từ biến môi trường (không bao giờ in giá trị).
fn apply_env_key(cfg: &mut AppConfig) {
    if let Ok(k) = std::env::var("SUBLIX_MINIMAX_KEY") {
        if !k.trim().is_empty() {
            cfg.minimax_api_key = k;
        }
    }
    if let Ok(k) = std::env::var("SUBLIX_DEEPSEEK_KEY") {
        if !k.trim().is_empty() {
            cfg.deepseek_api_key = k;
        }
    }
    if let Ok(k) = std::env::var("SUBLIX_OPENROUTER_KEY") {
        if !k.trim().is_empty() {
            cfg.openrouter_api_key = k;
        }
    }
    // override muc do suy luan cho bench (khong sua config that cua app)
    if let Ok(e) = std::env::var("SUBLIX_REASONING_EFFORT") {
        if !e.trim().is_empty() {
            cfg.llm_reasoning_effort = e;
        }
    }
}

/// Chạy 1 provider để lấy thông báo lỗi gốc (không đụng key trong message).
fn probe_provider(cfg: &AppConfig, opts: &BenchOptions, first: &str) -> Option<String> {
    let one = vec![first.to_string()];
    let r = match opts.provider.to_lowercase().as_str() {
        "minimax" => server::translate_batch_via_minimax(
            &one, &opts.source, &opts.target, &cfg.minimax_api_key, &cfg.minimax_model, &cfg.glossary,
        ),
        "deepseek" => server::translate_batch_via_deepseek(
            &one, &opts.source, &opts.target, &cfg.deepseek_api_key, &cfg.deepseek_model, &cfg.glossary,
        ),
        "openrouter" => server::translate_batch_via_openrouter(
            &one, &opts.source, &opts.target, &cfg.openrouter_api_key, &cfg.openrouter_model, &cfg.glossary,
        ),
        _ => return None,
    };
    match r {
        Ok(v) => Some(format!("probe_ok len={}", v.len())),
        Err(e) => Some(format!("{e:#}").chars().take(400).collect()),
    }
}

/// Chạy benchmark và ghi JSON kết quả.
pub fn run_bench(opts: &BenchOptions) -> Result<()> {
    let dataset_lines = match &opts.dataset {
        Some(p) => Some(read_dataset(p)?),
        None => None,
    };
    let items: Vec<String> = match &dataset_lines {
        Some(d) => d.iter().map(|l| l.text.clone()).collect(),
        None => read_srt(&opts.srt)?,
    };
    if items.is_empty() {
        bail!("khong doc duoc cau nao tu {}", opts.srt.display());
    }
    if opts.mode == "new" && dataset_lines.is_none() {
        bail!("che do 'new' can dataset JSON (co speaker_id + thoi luong that)");
    }

    let mut cfg = AppConfig::load_or_default();
    apply_env_key(&mut cfg);
    cfg.translation_provider = opts.provider.clone();
    match opts.provider.to_lowercase().as_str() {
        "ollama" => { if let Some(m) = &opts.model { cfg.ollama_model = m.clone(); } }
        "minimax" => { if let Some(m) = &opts.model { cfg.minimax_model = m.clone(); } }
        "deepseek" => { if let Some(m) = &opts.model { cfg.deepseek_model = m.clone(); } }
        "openrouter" => { if let Some(m) = &opts.model { cfg.openrouter_model = m.clone(); } }
        _ => bail!("provider khong ho tro: {}", opts.provider),
    }

    let model_variant = TranslationModelVariant::Qwen25_3B;
    let chars_in: usize = items.iter().map(|s| s.chars().count()).sum();

    // Bảng glossary đã duyệt (nếu có) → ràng buộc CỨNG cho cả 2 đường dịch.
    let glossary = match &opts.glossary {
        Some(p) => match crate::translate::glossary_store::load_file(p) {
            Some(g) => Some(g),
            None => bail!("doc glossary that bai: {}", p.display()),
        },
        None => None,
    };
    if let Some(g) = &glossary {
        // đường cũ nhận glossary dạng Vec<String> → gộp quy tắc đã duyệt vào đó
        cfg.glossary.extend(g.to_rules());
        cfg.glossary_table = Some(g.clone());
        eprintln!(
            "[bench] glossary da duyet: {} thuat ngu, {} quy tac xung ho, locked={}",
            g.terms.len(),
            g.pronouns.len(),
            g.locked
        );
    }

    eprintln!(
        "[bench] label={} mode={} provider={} model={} items={} chunk={} runs={} key_state={}",
        opts.label, opts.mode, opts.provider, opts.model.clone().unwrap_or_default(),
        items.len(), opts.chunk, opts.runs,
        json!({
            "minimax": !cfg.minimax_api_key.trim().is_empty(),
            "deepseek": !cfg.deepseek_api_key.trim().is_empty(),
            "openrouter": !cfg.openrouter_api_key.trim().is_empty(),
        })
    );

    let probe = probe_provider(&cfg, opts, &items[0]);

    let mut runs_detail: Vec<Value> = Vec::new();
    let mut last_translations: Vec<String> = Vec::new();

    for run in 1..=opts.runs {
        let mut translations: Vec<String> = Vec::with_capacity(items.len());
        let mut chunk_times: Vec<Value> = Vec::new();
        let mut first_chunk_s = 0.0f64;
        let t_all = Instant::now();

        // Đường MỚI (contextual): chunking nằm BÊN TRONG `translate_script_contextual`
        // (lô 20 câu), nên phải gọi **1 lần cho cả kịch bản** — gọi trong vòng lặp
        // chunk sẽ dịch lặp lại N lần và thổi phồng thời gian.
        if opts.mode == "new" {
            let ds = dataset_lines.as_ref().expect("dataset da kiem tra o tren");
            let lines: Vec<ScriptLine> = ds
                .iter()
                .map(|l| ScriptLine {
                    id: l.id.clone(),
                    speaker_id: l.speaker_id.clone(),
                    speaker_name: l.speaker_name.clone(),
                    text: l.text.clone(),
                    start: l.start,
                    end: l.end,
                })
                .collect();
            let t0 = Instant::now();
            let res = translate::contextual_run::translate_script_contextual(
                &lines, &opts.source, &opts.target, &cfg, &mut |_d, _t, _p| {},
            );
            let dt = t0.elapsed().as_secs_f64();
            first_chunk_s = dt;
            let mut err = 0usize;
            let mut empty = 0usize;
            let mut think = 0usize;
            let mut violations = 0usize;
            for r in &res {
                if r.failed { err += 1; }
                if r.translated.trim().is_empty() { empty += 1; }
                if r.translated.contains("<think>") || r.translated.contains("</think>") { think += 1; }
                if r.glossary_violation { violations += 1; }
            }
            chunk_times.push(json!({
                "chunk": 1, "items": res.len(),
                "seconds": (dt * 1000.0).round() / 1000.0,
                "errors": err, "empty": empty, "think_leak": think,
                "glossary_violations": violations,
            }));
            translations = res.into_iter().map(|r| r.translated).collect();
        } else {
            for (ci, chunk) in items.chunks(opts.chunk).enumerate() {
                let t0 = Instant::now();
                let out = translate::translate_batch_with_config(
                    chunk, &opts.source, &opts.target, model_variant, opts.engine, &cfg,
                );
                let dt = t0.elapsed().as_secs_f64();
                if ci == 0 {
                    first_chunk_s = dt;
                }
                let mut err = 0usize;
                let mut empty = 0usize;
                let mut think = 0usize;
                for t in &out {
                    if translate::is_translate_error(t) { err += 1; }
                    if t.trim().is_empty() { empty += 1; }
                    if t.contains("<think>") || t.contains("</think>") { think += 1; }
                }
                chunk_times.push(json!({
                    "chunk": ci + 1, "items": chunk.len(),
                    "seconds": (dt * 1000.0).round() / 1000.0,
                    "errors": err, "empty": empty, "think_leak": think,
                }));
                translations.extend(out);
            }
        }

        let total_s = t_all.elapsed().as_secs_f64();
        let n = translations.len().max(1) as f64;

        let chars_out: usize = translations.iter().map(|s| s.chars().count()).sum();
        let err_total = translations.iter().filter(|t| translate::is_translate_error(t)).count();
        let empty_total = translations.iter().filter(|t| t.trim().is_empty()).count();
        let think_total = translations.iter().filter(|t| t.contains("<think>") || t.contains("</think>")).count();

        eprintln!(
            "[bench] run {}/{}: total={:.2}s first_chunk={:.2}s per_item={:.3}s err={} empty={} think={}",
            run, opts.runs, total_s, first_chunk_s, total_s / n, err_total, empty_total, think_total
        );
        runs_detail.push(score::run_detail(&score::RunMetrics {
            run,
            total_s,
            first_chunk_s,
            items_returned: translations.len(),
            chars_in,
            chars_out,
            errors: err_total,
            empty: empty_total,
            think_leak: think_total,
            chunks: chunk_times,
        }));
        last_translations = translations;
    }

    let src_map = score::source_map(&items);

    // Audit xưng hô tất định (không gọi mạng) -> đo được 100% số dòng, khác LLM-giám khảo.
    let speaker_refs: Vec<&str> = dataset_lines
        .as_ref()
        .map(|d| d.iter().map(|l| l.speaker_id.as_str()).collect())
        .unwrap_or_else(|| vec![""; items.len()]);
    let audit = crate::translate::pronoun_audit::audit(&last_translations, &speaker_refs);

    let out_json = json!({
        "label": opts.label,
        "mode": opts.mode,
        "provider": opts.provider,
        "model": opts.model.clone().unwrap_or_default(),
        "source_lang": opts.source,
        "target_lang": opts.target,
        "chunk_size": opts.chunk,
        "items": items.len(),
        "runs": opts.runs,
        "key_state": {
            "minimax": !cfg.minimax_api_key.trim().is_empty(),
            "deepseek": !cfg.deepseek_api_key.trim().is_empty(),
            "openrouter": !cfg.openrouter_api_key.trim().is_empty(),
        },
        "provider_probe": probe,
        "glossary": match &glossary {
            Some(g) => json!({
                "used": true,
                "terms": g.terms.len(),
                "pronouns": g.pronouns.len(),
                "locked": g.locked,
                "path": g.path,
            }),
            None => json!({ "used": false }),
        },
        "avg_total_s": score::avg(&runs_detail, "total_s"),
        "avg_first_chunk_s": score::avg(&runs_detail, "first_chunk_s"),
        "avg_per_item_s": score::avg(&runs_detail, "per_item_s"),
        "runs_detail": runs_detail,
        "translations": last_translations,
        "pronoun_audit": audit,
        "source": src_map,
        "note": "Key API KHONG duoc ghi vao file nay. key_state chi ghi co/ khong co.",
    });

    score::write_report(&opts.out, &out_json)?;
    eprintln!(
        "[bench] DONE label={} avg_total={:.2}s avg_first_chunk={:.2}s -> {}",
        opts.label, out_json["avg_total_s"].as_f64().unwrap_or(0.0),
        out_json["avg_first_chunk_s"].as_f64().unwrap_or(0.0), opts.out.display()
    );
    Ok(())
}

#[cfg(test)]
#[path = "bench_tests.rs"]
mod tests;
