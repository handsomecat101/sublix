//! TTS đám mây: Google Cloud TTS Chirp 3 HD (`gcloud:`) và FPT.AI TTS v5 (`fptai:`).
//!
//! Key lưu ở FILE RIÊNG `sublix-tts-keys.json` cạnh config (KHÔNG nằm trong `AppConfig` → không bị phát qua
//! event `config:updated`, xem BUG-014); không bao giờ ghi key vào log/URL log. Có retry + báo lỗi rõ ràng
//! (không im lặng ra file 0 byte như BUG-H13 của Edge-TTS).

use super::vi_normalize::normalize_vi;
use super::VoicePreset;
use anyhow::{Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tracing::warn;

pub const GCLOUD_PREFIX: &str = "gcloud:";
pub const FPTAI_PREFIX: &str = "fptai:";
const RETRIES: u32 = 3;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct Keys {
    #[serde(default)]
    google: String,
    #[serde(default)]
    fptai: String,
}

fn keys_path() -> PathBuf {
    let base = std::env::var("APPDATA").map(PathBuf::from).unwrap_or_else(|_| std::env::temp_dir());
    base.join("com.sublix.desktop").join("sublix-tts-keys.json")
}

fn load_keys() -> Keys {
    std::fs::read_to_string(keys_path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

/// Lưu key (chuỗi rỗng = xóa). `provider` = `google` | `fptai`.
pub fn set_key(provider: &str, key: &str) -> Result<()> {
    let mut keys = load_keys();
    match provider {
        "google" => keys.google = key.trim().to_string(),
        "fptai" => keys.fptai = key.trim().to_string(),
        other => anyhow::bail!("Nhà cung cấp TTS không hợp lệ: {other}"),
    }
    let path = keys_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).with_context(|| format!("Tạo thư mục {}", dir.display()))?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&keys)?).context("Ghi file key TTS")?;
    std::fs::rename(&tmp, &path).context("Đổi tên file key TTS")?;
    Ok(())
}

/// Chỉ trả "đã có key hay chưa" — không bao giờ trả chính key ra frontend.
pub fn has_key(provider: &str) -> bool {
    let k = load_keys();
    match provider {
        "google" => !k.google.is_empty(),
        "fptai" => !k.fptai.is_empty(),
        _ => false,
    }
}

const GOOGLE_FEMALE: [&str; 14] = [
    "Achernar", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Gacrux", "Kore", "Laomedeia", "Leda",
    "Pulcherrima", "Sulafat", "Vindemiatrix", "Zephyr",
];
const GOOGLE_MALE: [&str; 16] = [
    "Achird", "Algenib", "Algieba", "Alnilam", "Charon", "Enceladus", "Fenrir", "Iapetus", "Orus", "Puck",
    "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Umbriel", "Zubenelgenubi",
];
const FPT_VOICES: [(&str, &str, &str); 7] = [
    ("banmai", "Ban Mai", "female"), ("lannhi", "Lan Nhi", "female"), ("leminh", "Lê Minh", "male"),
    ("myan", "Mỹ An", "female"), ("thuminh", "Thu Minh", "female"), ("giahuy", "Gia Huy", "male"),
    ("linhsan", "Linh San", "female"),
];

/// Danh mục giọng cloud; `description` kèm ghi chú cần key khi chưa có.
pub fn get_voices() -> Vec<VoicePreset> {
    let note = |p: &str| if has_key(p) { "" } else { " — Cần API key: vào Cài đặt" };
    let mut v: Vec<VoicePreset> = Vec::new();
    for (list, gender) in [(&GOOGLE_FEMALE[..], "female"), (&GOOGLE_MALE[..], "male")] {
        for n in list {
            v.push(VoicePreset {
                id: format!("{GCLOUD_PREFIX}vi-VN-Chirp3-HD-{n}"),
                name: format!("VN • {n} (Google Chirp 3 HD — cloud)"),
                gender: gender.to_string(),
                lang: "vi".to_string(),
                description: format!("Google Cloud TTS Chirp 3 HD tiếng Việt{}", note("google")),
            });
        }
    }
    for (id, name, gender) in FPT_VOICES {
        v.push(VoicePreset {
            id: format!("{FPTAI_PREFIX}{id}"),
            name: format!("VN • {name} (FPT.AI — cloud)"),
            gender: gender.to_string(),
            lang: "vi".to_string(),
            description: format!("FPT.AI TTS v5{}", note("fptai")),
        });
    }
    v
}

/// Lấy thông báo lỗi dễ đọc từ JSON lỗi của Google (`{"error":{"message":...}}`) — không chứa key.
pub fn google_error_message(status: u16, body: &str) -> String {
    let msg = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|j| j["error"]["message"].as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| body.chars().take(160).collect());
    let hint = match status {
        400 | 403 => " (kiểm tra API key và đã bật Cloud Text-to-Speech API)",
        429 => " (vượt hạn mức — thử lại sau)",
        _ => "",
    };
    format!("Google TTS lỗi HTTP {status}: {msg}{hint}")
}

fn client() -> Result<reqwest::blocking::Client> {
    Ok(reqwest::blocking::Client::builder().timeout(Duration::from_secs(60)).user_agent("sublix-tts/1.0").build()?)
}

fn retryable(status: u16) -> bool {
    status == 429 || status >= 500
}

fn google_once(text: &str, voice: &str, key: &str) -> Result<Vec<u8>> {
    let body = serde_json::json!({
        "input": {"text": text},
        "voice": {"languageCode": "vi-VN", "name": voice},
        "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": 24000},
    });
    let resp = client()?
        .post("https://texttospeech.googleapis.com/v1/text:synthesize")
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .context("Không kết nối được Google TTS (kiểm tra mạng)")?;
    let status = resp.status().as_u16();
    let text_body = resp.text().unwrap_or_default();
    if status != 200 {
        anyhow::bail!("{}{}", google_error_message(status, &text_body), if retryable(status) { " [retry]" } else { "" });
    }
    let j: serde_json::Value = serde_json::from_str(&text_body).context("Google TTS trả JSON không hợp lệ")?;
    let b64 = j["audioContent"].as_str().unwrap_or("");
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).context("Giải mã audio Google")?;
    if bytes.len() < 1024 {
        anyhow::bail!("Google TTS trả audio rỗng ({} byte) [retry]", bytes.len());
    }
    Ok(bytes)
}

fn fptai_once(text: &str, voice: &str, key: &str) -> Result<Vec<u8>> {
    let c = client()?;
    let resp = c
        .post("https://api.fpt.ai/hmi/tts/v5")
        .header("api-key", key)
        .header("voice", voice)
        .header("speed", "0")
        .header("format", "mp3")
        .body(text.to_string())
        .send()
        .context("Không kết nối được FPT.AI (kiểm tra mạng)")?;
    let status = resp.status().as_u16();
    let body = resp.text().unwrap_or_default();
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
    if status != 200 || j["error"].as_i64().unwrap_or(0) != 0 {
        let msg = j["message"].as_str().unwrap_or("không rõ").to_string();
        anyhow::bail!("FPT.AI lỗi HTTP {status}: {msg}{}", if retryable(status) { " [retry]" } else { "" });
    }
    let url = j["async"].as_str().context("FPT.AI không trả link audio")?.to_string();
    // File được tạo bất đồng bộ: link 404 cho tới khi xong → chờ tối đa ~20 giây
    for _ in 0..20 {
        std::thread::sleep(Duration::from_secs(1));
        if let Ok(r) = c.get(&url).send() {
            if r.status().is_success() {
                let b = r.bytes().map(|b| b.to_vec()).unwrap_or_default();
                if b.len() > 1024 {
                    return Ok(b);
                }
            }
        }
    }
    anyhow::bail!("FPT.AI tạo audio quá lâu hoặc rỗng [retry]")
}

/// Đuôi file đầu ra của một voice id cloud (Google = WAV LINEAR16, FPT = MP3).
pub fn file_ext(voice: &str) -> &'static str {
    if voice.starts_with(GCLOUD_PREFIX) { "wav" } else { "mp3" }
}

/// Tổng hợp 1 câu bằng cloud. Chưa có key → lỗi rõ ràng ("Cần API key — vào Cài đặt").
pub fn synthesize(voice: &str, text: &str, out: &Path) -> Result<()> {
    let (provider, name, key) = if let Some(n) = voice.strip_prefix(GCLOUD_PREFIX) {
        ("Google", n.trim().to_string(), load_keys().google)
    } else if let Some(n) = voice.strip_prefix(FPTAI_PREFIX) {
        ("FPT.AI", n.trim().to_string(), load_keys().fptai)
    } else {
        anyhow::bail!("Voice cloud không hợp lệ: {voice}");
    };
    if key.is_empty() {
        anyhow::bail!("Cần API key {provider} — vào Cài đặt để nhập.");
    }
    let text = normalize_vi(text);
    let mut last = String::new();
    for attempt in 0..RETRIES {
        let res = if provider == "Google" { google_once(&text, &name, &key) } else { fptai_once(&text, &name, &key) };
        match res {
            Ok(bytes) => {
                std::fs::write(out, bytes).with_context(|| format!("Ghi {}", out.display()))?;
                return Ok(());
            }
            Err(e) => {
                last = format!("{e:#}");
                if !last.contains("[retry]") || attempt + 1 == RETRIES {
                    break;
                }
                warn!("TTS {provider} lần {} thất bại, thử lại: {}", attempt + 1, last.replace(" [retry]", ""));
                std::thread::sleep(Duration::from_millis(1000 * (attempt as u64 + 1)));
            }
        }
    }
    anyhow::bail!("{}", last.replace(" [retry]", ""))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_30_google_va_7_fpt() {
        let v = get_voices();
        assert_eq!(v.iter().filter(|x| x.id.starts_with(GCLOUD_PREFIX)).count(), 30);
        assert_eq!(v.iter().filter(|x| x.id.starts_with(FPTAI_PREFIX)).count(), 7);
        assert!(v.iter().all(|x| x.gender == "male" || x.gender == "female"));
    }

    #[test]
    fn loi_google_khong_lo_key_va_co_goi_y() {
        let body = r#"{"error":{"code":400,"message":"API key not valid. Please pass a valid API key."}}"#;
        let m = google_error_message(400, body);
        assert!(m.contains("API key not valid") && m.contains("kiểm tra API key"));
        assert!(google_error_message(429, "").contains("hạn mức"));
    }

    #[test]
    fn duoi_file_theo_nha_cung_cap() {
        assert_eq!(file_ext("gcloud:vi-VN-Chirp3-HD-Aoede"), "wav");
        assert_eq!(file_ext("fptai:banmai"), "mp3");
    }

    #[test]
    fn thieu_key_bao_loi_ro_khong_panic() {
        // Nhà cung cấp lạ → lỗi; không gọi mạng.
        assert!(synthesize("abc:xyz", "xin chào", Path::new("x.wav")).is_err());
        assert!(set_key("khong-co", "k").is_err());
    }
}
