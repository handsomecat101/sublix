//! Chấm điểm + ghi báo cáo cho harness benchmark dịch.
//!
//! Tách riêng khỏi [`super`] (`bench.rs`) để file bench không phải chứa
//! phép logic dịch.

use anyhow::{Context, Result};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::Path;

/// Số liệu 1 lượt chạy (đã đo xong).
pub struct RunMetrics {
    pub run: usize,
    pub total_s: f64,
    pub first_chunk_s: f64,
    pub items_returned: usize,
    pub chars_in: usize,
    pub chars_out: usize,
    pub errors: usize,
    pub empty: usize,
    pub think_leak: usize,
    pub chunks: Vec<Value>,
}

/// Detail JSON của 1 lượt — giữ nguyên format cũ.
pub fn run_detail(m: &RunMetrics) -> Value {
    let n = m.items_returned.max(1) as f64;
    json!({
        "run": m.run,
        "total_s": (m.total_s * 1000.0).round() / 1000.0,
        "first_chunk_s": (m.first_chunk_s * 1000.0).round() / 1000.0,
        "per_item_s": ((m.total_s / n) * 1000.0).round() / 1000.0,
        "items_returned": m.items_returned,
        "errors": m.errors, "empty": m.empty, "think_leak": m.think_leak,
        "chars_in": m.chars_in, "chars_out": m.chars_out,
        "chunks": m.chunks,
    })
}

/// Trung bình của 1 trường số trong `runs_detail`.
pub fn avg(runs_detail: &[Value], key: &str) -> f64 {
    let vals: Vec<f64> = runs_detail
        .iter()
        .filter_map(|r| r.get(key).and_then(|v| v.as_f64()))
        .collect();
    if vals.is_empty() {
        return 0.0;
    }
    (vals.iter().sum::<f64>() / vals.len() as f64 * 1000.0).round() / 1000.0
}

/// Map `index -> câu gốc` (để đối chiếu kết quả).
pub fn source_map(items: &[String]) -> Map<String, Value> {
    items
        .iter()
        .enumerate()
        .map(|(i, s)| (i.to_string(), json!(s)))
        .collect()
}

/// Ghi báo cáo JSON ra đĩa.
pub fn write_report(out: &Path, report: &Value) -> Result<()> {
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(out, serde_json::to_string_pretty(report)?)
        .with_context(|| format!("khong ghi duoc {}", out.display()))?;
    Ok(())
}
