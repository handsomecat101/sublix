//! Trạng thái / cài đặt / chẩn đoán các engine TTS cho UI (chỉ trả "đã có key hay chưa", không bao giờ trả key).

use super::{tts_cloud, tts_common, tts_vieneu, tts_zerotts};
use anyhow::Result;
use serde_json::{json, Value};
use std::path::PathBuf;

/// Danh sách engine kèm trạng thái để UI làm xám giọng chưa dùng được.
/// `ready` = chọn được ngay; `hint` = dòng chữ xám hiển thị khi chưa ready.
pub fn engines_status() -> Value {
    let kokoro = super::kokoro_available();
    let (vm, vd) = (tts_vieneu::model_present(), tts_vieneu::deps_ready());
    let (zm, zd) = (tts_zerotts::model_present(), tts_zerotts::deps_ready());
    let (gk, fk) = (tts_cloud::has_key("google"), tts_cloud::has_key("fptai"));
    let offline_hint = |m: bool, d: bool| {
        if !m {
            "Chưa tải model — vào trung tâm tải model"
        } else if !d {
            "Đã tải model nhưng thiếu thư viện Python — bấm cài đặt"
        } else {
            ""
        }
    };
    json!({
        "device_preference": tts_common::device_arg(),
        "engines": [
            {"id": "kokoro", "prefix": "kokoro:", "kind": "offline", "model_id": "kokoro-vi", "installed": kokoro, "ready": kokoro,
             "hint": if kokoro { "" } else { "Chưa tải model — vào trung tâm tải model" }},
            {"id": "vieneu", "prefix": "vietneu:", "kind": "offline", "model_id": tts_vieneu::MODEL_ID, "installed": vm, "deps": vd,
             "ready": vm && vd, "fallback": "kokoro", "clone": true, "hint": offline_hint(vm, vd)},
            {"id": "zerotts", "prefix": "zerotts:", "kind": "offline", "model_id": tts_zerotts::MODEL_ID, "installed": zm, "deps": zd,
             "ready": zm && zd, "clone": false, "hint": offline_hint(zm, zd)},
            {"id": "gcloud", "prefix": "gcloud:", "kind": "cloud", "needs_key": true, "has_key": gk, "ready": gk,
             "hint": if gk { "" } else { "Cần API key — vào Cài đặt" }},
            {"id": "fptai", "prefix": "fptai:", "kind": "cloud", "needs_key": true, "has_key": fk, "ready": fk,
             "hint": if fk { "" } else { "Cần API key — vào Cài đặt" }},
        ],
    })
}

fn engine_paths(engine: &str) -> Result<(PathBuf, &'static str, &'static str)> {
    match engine {
        "vieneu" => Ok((tts_vieneu::model_dir(), "vieneu_tts.py", include_str!("../../scripts/vieneu_tts.py"))),
        "zerotts" => Ok((tts_zerotts::model_dir(), "zerotts_tts.py", include_str!("../../scripts/zerotts_tts.py"))),
        other => anyhow::bail!("Engine không có sidecar: {other}"),
    }
}

/// Cài thư viện Python cho engine offline (CPU, hoặc CUDA nếu có NVIDIA và không ép CPU).
pub fn install_deps(engine: &str, on_line: &mut dyn FnMut(&str)) -> Result<()> {
    match engine {
        "vieneu" => tts_vieneu::install_deps(on_line),
        "zerotts" => tts_zerotts::install_deps(on_line),
        other => anyhow::bail!("Engine {other} không cần cài thư viện Python"),
    }
}

/// Chạy `--diagnose` của sidecar: phiên bản onnxruntime, có CUDAExecutionProvider không… (kiểm tra bật CUDA trên máy RTX).
pub fn diagnose(engine: &str) -> Result<Value> {
    let (dir, name, content) = engine_paths(engine)?;
    let script = tts_common::ensure_script(name, content)?;
    let mut v = tts_common::run_info(&script, &dir, "--diagnose")?;
    v["nvidia_gpu"] = json!(tts_common::has_nvidia_gpu());
    v["device_preference"] = json!(tts_common::device_arg());
    Ok(v)
}

/// Thử 1 câu cloud để kiểm tra key; trả mô tả ngắn. Không ghi gì ngoài thư mục tạm.
pub fn test_cloud(provider: &str) -> Result<String> {
    let voice = match provider {
        "google" => format!("{}vi-VN-Chirp3-HD-Aoede", tts_cloud::GCLOUD_PREFIX),
        "fptai" => format!("{}banmai", tts_cloud::FPTAI_PREFIX),
        other => anyhow::bail!("Nhà cung cấp không hợp lệ: {other}"),
    };
    let out = std::env::temp_dir().join(format!("sublix_tts_keytest_{}.{}", super::gen_unique_id(), tts_cloud::file_ext(&voice)));
    let res = tts_cloud::synthesize(&voice, "Xin chào, đây là kiểm tra khóa.", &out);
    let size = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);
    let _ = std::fs::remove_file(&out);
    res?;
    Ok(format!("Key hợp lệ — nhận {} KB audio.", size / 1024))
}
