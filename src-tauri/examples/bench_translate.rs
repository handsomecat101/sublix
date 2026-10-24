//! CLI benchmark dịch — thin wrapper quanh `translate::bench`.
//!
//! ```text
//! cargo run --example bench_translate -- \
//!   --provider minimax --model MiniMax-M3.1-Flash \
//!   --dataset <kich ban.json> --srt <kich ban.srt> \
//!   --out <ket qua.json> --label nhan --runs 2 --chunk 15 \
//!   --mode old|new --source en --target vi
//! ```
//!
//! `--mode old` = đường dịch cũ (`translate_batch_with_config`, lô 15 câu độc lập).
//! `--mode new` = đường dịch **theo ngữ cảnh** (2 lượt: đọc hiểu → dịch có cửa sổ trượt).
//!
//! `--glossary <file.json>` = dùng bảng thuật ngữ + xưng hô **đã duyệt** làm
//! ràng buộc cứng (áp cho cả 2 đường dịch).
//!
//! Lưu ý: trên máy bật Smart App Control, binary trong `target/debug/examples/` có thể bị
//! chặn (os error 4551). Khi đó dùng đường test `#[ignore]`:
//! `cargo test --lib bench_translate_ignored -- --ignored --nocapture` (xem `translate::bench`).

use std::path::PathBuf;

use anyhow::{bail, Result};
use sublix_lib::stt::EnginePreference;
use sublix_lib::translate::bench::{run_bench, BenchOptions};

fn parse_args() -> Result<BenchOptions> {
    let mut provider = String::new();
    let mut model: Option<String> = None;
    let mut mode = "old".to_string();
    let mut dataset: Option<PathBuf> = None;
    let mut srt = PathBuf::new();
    let mut out = PathBuf::new();
    let mut label = String::new();
    let mut runs = 2usize;
    let mut chunk = 15usize;
    let mut source = "en".to_string();
    let mut target = "vi".to_string();
    let mut glossary: Option<PathBuf> = None;

    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0usize;
    while i < argv.len() {
        let need = |i: usize| -> Result<String> {
            argv.get(i + 1)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("thieu gia tri cho tham so {}", argv[i]))
        };
        match argv[i].as_str() {
            "--provider" => { provider = need(i)?; i += 2; }
            "--model" => { model = Some(need(i)?); i += 2; }
            "--mode" => { mode = need(i)?; i += 2; }
            "--dataset" => { dataset = Some(PathBuf::from(need(i)?)); i += 2; }
            "--srt" => { srt = PathBuf::from(need(i)?); i += 2; }
            "--out" => { out = PathBuf::from(need(i)?); i += 2; }
            "--label" => { label = need(i)?; i += 2; }
            "--runs" => { runs = need(i)?.parse()?; i += 2; }
            "--chunk" => { chunk = need(i)?.parse()?; i += 2; }
            "--source" => { source = need(i)?; i += 2; }
            "--target" => { target = need(i)?; i += 2; }
            "--glossary" => { glossary = Some(PathBuf::from(need(i)?)); i += 2; }
            other => bail!("tham so la: {other}"),
        }
    }

    if provider.is_empty() || srt.as_os_str().is_empty() || out.as_os_str().is_empty() {
        bail!("can --provider, --srt, --out");
    }
    if label.is_empty() {
        label = format!("{provider}-{}", model.clone().unwrap_or_default());
    }
    Ok(BenchOptions {
        provider,
        model,
        mode,
        dataset,
        srt,
        out,
        label,
        runs,
        chunk,
        source,
        target,
        engine: EnginePreference::Cpu,
        glossary,
    })
}

fn main() -> Result<()> {
    let opts = parse_args()?;
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .try_init();
    run_bench(&opts)
}
