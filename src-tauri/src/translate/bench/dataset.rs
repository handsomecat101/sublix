//! Đọc dataset JSON / file .srt cho harness benchmark dịch.

use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

use crate::stt::EnginePreference;

/// 1 dòng trong dataset JSON nhiều vai.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct DatasetLine {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub start: f64,
    #[serde(default)]
    pub end: f64,
    #[serde(default)]
    pub speaker_id: String,
    #[serde(default)]
    pub speaker_name: Option<String>,
}

/// Tham số 1 lần chạy benchmark.
#[derive(Debug, Clone)]
pub struct BenchOptions {
    pub provider: String,
    pub model: Option<String>,
    pub mode: String,
    pub dataset: Option<PathBuf>,
    pub srt: PathBuf,
    pub out: PathBuf,
    pub label: String,
    pub runs: usize,
    pub chunk: usize,
    pub source: String,
    pub target: String,
    pub engine: EnginePreference,
    /// File bảng thuật ngữ + xưng hô **đã duyệt** (JSON) — dùng như ràng buộc cứng.
    pub glossary: Option<PathBuf>,
}

pub fn read_dataset(path: &PathBuf) -> Result<Vec<DatasetLine>> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("doc khong doc duoc dataset: {}", path.display()))?;
    let raw = raw.trim_start_matches('\u{feff}');
    serde_json::from_str(raw).with_context(|| format!("dataset khong phai JSON hop le: {}", path.display()))
}

/// Đọc file .srt (bỏ chỉ số + timestamp, gộp text nhiều dòng của 1 cue).
pub fn read_srt(path: &PathBuf) -> Result<Vec<String>> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("doc khong doc duoc: {}", path.display()))?;
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
        if !t.is_empty() && t.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if t.contains("-->") {
            continue;
        }
        cur.push(t.to_string());
    }
    if !cur.is_empty() {
        out.push(cur.join(" "));
    }
    Ok(out)
}
