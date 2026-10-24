//! Lưu bảng glossary **theo dự án** (file cạnh project/SRT) + fallback config toàn cục.
//!
//! - File dự án: `<tên file>.sublix-glossary.json` cạnh video/SRT.
//! - Fallback: `AppConfig.glossary_table` (config toàn cục của app).
//!
//! Ghi file **atomic** (ghi `.tmp` rồi `rename`) — không để lại file hỏng khi app bị tắt giữa lúc lưu.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use tracing::info;

use super::glossary::{empty, Glossary};

/// Hậu tố file glossary theo dự án.
pub const FILE_SUFFIX: &str = ".sublix-glossary.json";

/// Đường dẫn file glossary cho 1 project (đường dẫn video hoặc SRT).
///
/// `C:\phim\StarCraft.mp4` → `C:\phim\StarCraft.sublix-glossary.json`.
pub fn project_file(project_path: &str) -> Option<PathBuf> {
    let trimmed = project_path.trim();
    if trimmed.is_empty() {
        return None;
    }
    let p = Path::new(trimmed);
    let stem = p.file_stem()?.to_string_lossy().trim().to_string();
    if stem.is_empty() {
        return None;
    }
    let parent = p
        .parent()
        .filter(|d| !d.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    Some(parent.join(format!("{stem}{FILE_SUFFIX}")))
}

/// Đọc file glossary theo dự án. `None` nếu chưa có hoặc hỏng (không chặn app).
pub fn load_project(project_path: &str) -> Option<Glossary> {
    let path = project_file(project_path)?;
    let raw = fs::read_to_string(&path).ok()?;
    let mut g: Glossary = serde_json::from_str(&raw).ok()?;
    g.normalise();
    g.scope = "project".to_string();
    g.path = Some(path.to_string_lossy().to_string());
    info!("📖 Đọc glossary dự án: {}", path.display());
    Some(g)
}

/// Ghi file glossary theo dự án — **atomic**.
pub fn save_project(project_path: &str, glossary: &Glossary) -> Result<PathBuf> {
    let path = project_file(project_path)
        .ok_or_else(|| anyhow::anyhow!("đường dẫn dự án không hợp lệ: {project_path}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("tạo thư mục: {}", parent.display()))?;
    }
    let json = serde_json::to_string_pretty(glossary).context("ghi glossary ra JSON")?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json.as_bytes())
        .with_context(|| format!("ghi file tạm: {}", tmp.display()))?;
    fs::rename(&tmp, &path)
        .with_context(|| format!("đổi tên: {} -> {}", tmp.display(), path.display()))?;
    info!("💾 Đã lưu glossary dự án: {}", path.display());
    Ok(path)
}

/// Đọc 1 file glossary bất kỳ (dùng cho bench / import). `None` nếu hỏng.
pub fn load_file(path: &Path) -> Option<Glossary> {
    let raw = fs::read_to_string(path).ok()?;
    let mut g: Glossary = serde_json::from_str(&raw).ok()?;
    g.normalise();
    g.scope = "project".to_string();
    g.path = Some(path.to_string_lossy().to_string());
    Some(g)
}

/// Bảng glossary toàn cục (trong config app).
pub fn load_global(cfg: &crate::config::AppConfig) -> Glossary {
    let mut g = cfg.glossary_table.clone().unwrap_or_else(empty);
    g.normalise();
    g.scope = "global".to_string();
    g.path = None;
    g
}

/// Ghi bảng glossary toàn cục vào config (chưa lưu đĩa — caller gọi `cfg.save`).
pub fn store_global(cfg: &mut crate::config::AppConfig, glossary: &Glossary) {
    let mut g = glossary.clone();
    g.scope = "global".to_string();
    g.path = None;
    cfg.glossary_table = Some(g);
}

/// Bảng cần dùng cho 1 lần dịch: file dự án nếu có, không thì bảng toàn cục.
pub fn resolve(project_path: Option<&str>, cfg: &crate::config::AppConfig) -> Glossary {
    if let Some(p) = project_path {
        if let Some(g) = load_project(p) {
            return g;
        }
    }
    load_global(cfg)
}

#[cfg(test)]
#[path = "glossary_store_tests.rs"]
mod tests;
