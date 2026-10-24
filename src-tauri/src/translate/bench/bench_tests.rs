//! Test `#[ignore]` chạy benchmark dịch — dùng khi Smart App Control chặn binary
//! trong `target/debug/examples/` (xem `translate::bench`).
//!
//! ```powershell
//! $env:BENCH_PROVIDER="minimax"; $env:BENCH_MODEL="MiniMax-M3.1-Flash"; $env:BENCH_MODE="new"
//! $env:BENCH_DATASET="$env:TEMP\sub-bench-translate\en_src\starcraft_en.json"
//! $env:BENCH_SRT="$env:TEMP\sub-bench-translate\en_src\starcraft_en.srt"
//! $env:BENCH_OUT="$env:TEMP\sub-bench-translate\results\ctx-new-minimax.json"
//! $env:BENCH_LABEL="ctx-new-minimax"; $env:BENCH_RUNS="2"; $env:BENCH_CHUNK="15"
//! cargo test --lib bench_translate_ignored -- --ignored --nocapture
//! ```

use std::path::PathBuf;

use super::{run_bench, BenchOptions};
use crate::stt::EnginePreference;

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

#[test]
#[ignore = "can API - chay bang: cargo test --lib bench_translate_ignored -- --ignored --nocapture"]
fn bench_translate_ignored() {
    let provider = match std::env::var("BENCH_PROVIDER") {
        Ok(p) if !p.trim().is_empty() => p,
        _ => {
            eprintln!("[bench] thieu BENCH_PROVIDER -> bo qua");
            return;
        }
    };
    let dataset = std::env::var("BENCH_DATASET").ok().map(PathBuf::from);
    let opts = BenchOptions {
        provider,
        model: std::env::var("BENCH_MODEL").ok().filter(|m| !m.trim().is_empty()),
        mode: env_or("BENCH_MODE", "old"),
        dataset,
        srt: PathBuf::from(env_or("BENCH_SRT", "bench.srt")),
        out: PathBuf::from(env_or("BENCH_OUT", "bench-out.json")),
        label: env_or("BENCH_LABEL", "bench"),
        runs: env_or("BENCH_RUNS", "2").parse().unwrap_or(2),
        chunk: env_or("BENCH_CHUNK", "15").parse().unwrap_or(15),
        source: env_or("BENCH_SOURCE", "en"),
        target: env_or("BENCH_TARGET", "vi"),
        engine: EnginePreference::Cpu,
        // Bảng thuật ngữ + xưng hô đã duyệt (JSON) — ràng buộc cứng (tuỳ chọn).
        glossary: std::env::var("BENCH_GLOSSARY")
            .ok()
            .filter(|p| !p.trim().is_empty())
            .map(PathBuf::from),
    };
    if let Err(e) = run_bench(&opts) {
        eprintln!("[bench] ERROR: {e:#}");
        panic!("bench that bai: {e:#}");
    }
}
