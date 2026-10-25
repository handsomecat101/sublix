//! Gọi sidecar Python đo F0 (pitch) cho từng cụm người nói.
//!
//! Tách riêng khỏi `speaker_assign` (logic thuần) để mỗi module < 300 dòng.
//! Sidecar: `src-tauri/scripts/speaker_gender.py` (chỉ cần numpy).

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use serde::Deserialize;
use tracing::{info, warn};

use super::SpeakerPitch;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Sidecar đo F0 (nhúng trong binary, ghi ra đĩa ở lần chạy đầu).
const SPEAKER_GENDER_SCRIPT: &str = include_str!("../../../scripts/speaker_gender.py");

#[derive(Debug, Deserialize)]
struct PitchFile {
    #[serde(default)]
    speakers: HashMap<String, PitchEntry>,
}

#[derive(Debug, Deserialize)]
struct PitchEntry {
    #[serde(default)]
    f0_median: Option<f64>,
    #[serde(default)]
    voiced_ratio: f64,
    #[serde(default)]
    duration_sec: f64,
}

/// Ghi sidecar đo F0 ra đĩa (idempotent) và trả về đường dẫn.
pub fn ensure_pitch_script() -> Result<PathBuf> {
    let dir = crate::config::app_base_dir().join("scripts");
    fs::create_dir_all(&dir).with_context(|| format!("Tao thu muc {}", dir.display()))?;
    let path = dir.join("speaker_gender.py");
    let needs_write = match fs::read_to_string(&path) {
        Ok(cur) => cur != SPEAKER_GENDER_SCRIPT,
        Err(_) => true,
    };
    if needs_write {
        fs::write(&path, SPEAKER_GENDER_SCRIPT)
            .with_context(|| format!("Ghi sidecar vao {}", path.display()))?;
    }
    Ok(path)
}

fn unique_id() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Đo F0 cho từng cụm người nói (gọi sidecar Python).
///
/// Trả về map `cụm sherpa → F0`. Lỗi sidecar KHÔNG làm hỏng pipeline ⇒
/// log + trả map rỗng (UI sẽ hiện `diarization_engine = "heuristic"`).
pub fn estimate_speaker_pitches(
    wav_path: &Path,
    segments: &[(f64, f64, usize)],
    temp_dir: &Path,
    python: &Path,
    my_gen: u64,
) -> Result<HashMap<usize, SpeakerPitch>> {
    if segments.is_empty() {
        return Ok(HashMap::new());
    }
    let script = ensure_pitch_script()?;
    let uid = unique_id();
    let seg_json = temp_dir.join(format!("speaker_pitch_{uid}.segments.json"));
    let out_json = temp_dir.join(format!("speaker_pitch_{uid}.out.json"));

    let payload: Vec<serde_json::Value> = segments
        .iter()
        .map(|(start, end, speaker)| {
            serde_json::json!({ "start": start, "end": end, "speaker": speaker })
        })
        .collect();
    fs::write(
        &seg_json,
        serde_json::to_string(&payload).context("Ghi JSON danh sach doan cho sidecar")?,
    )
    .with_context(|| format!("Ghi {}", seg_json.display()))?;

    let mut cmd = Command::new(python);
    cmd.arg(&script)
        .arg("--wav")
        .arg(wav_path)
        .arg("--segments")
        .arg(&seg_json)
        .arg("--out")
        .arg(&out_json);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = crate::dubbing::run_child_with_cancel(cmd, my_gen)
        .context("Loi thuc thi sidecar do F0")?;
    let _ = fs::remove_file(&seg_json);
    if !status.success() || !out_json.exists() {
        let _ = fs::remove_file(&out_json);
        anyhow::bail!("Sidecar do F0 that bai hoac khong tao duoc file JSON");
    }
    let content = fs::read_to_string(&out_json).context("Doc ket qua do F0")?;
    let _ = fs::remove_file(&out_json);

    let parsed: PitchFile = serde_json::from_str(&content).context("Parse JSON ket qua do F0")?;
    let mut out = HashMap::new();
    for (key, entry) in parsed.speakers {
        let Ok(speaker) = key.parse::<usize>() else {
            continue;
        };
        info!(
            "🎵 Cum nguoi noi {}: F0 trung vi = {:?} Hz (voiced {:.0}%, {:.1}s)",
            speaker,
            entry.f0_median,
            entry.voiced_ratio * 100.0,
            entry.duration_sec
        );
        out.insert(
            speaker,
            SpeakerPitch {
                f0_median: entry.f0_median.filter(|v| v.is_finite() && *v > 0.0),
                voiced_ratio: entry.voiced_ratio,
                duration_sec: entry.duration_sec,
            },
        );
    }
    if out.is_empty() {
        warn!("⚠️ Sidecar F0 khong tra ve cum nao — giu gioi tinh mac dinh");
    }
    Ok(out)
}
