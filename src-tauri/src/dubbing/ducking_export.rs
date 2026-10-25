//! Nối Smart Ducking vào xuất video (docs/DUCKING_SPEC.md §4.2): tham số từ config,
//! đoạn thoại từ clip lồng tiếng THẬT, và chuỗi filter hạ tiếng nền.

use super::ducking::{build_ducking_envelope, ffmpeg_volume_filter, Breakpoint, DuckingParams};
use crate::config::AppConfig;
use std::path::{Path, PathBuf};

/// Graph filter dài hơn ngưỡng này (ký tự) được ghi ra file và đọc bằng `-/filter_complex <file>`
/// (FFmpeg ≥ 7; `-filter_complex_script` đã bị gỡ — BUG-H12) để khỏi vượt giới hạn dòng lệnh Windows (~32K).
pub const FILTER_FILE_THRESHOLD: usize = 12_000;

fn in_range_or(v: f32, lo: f64, hi: f64, default: f64) -> f64 {
    let v = f64::from(v);
    if v.is_finite() && v >= lo && v <= hi {
        v
    } else {
        default
    }
}

/// Tham số ducking hiệu lực. `ducking_level` chưa đặt (config cũ) → dùng `bgm_volume` của dự án
/// (migration §4.2); giá trị ngoài miền hợp lệ rơi về mặc định §2.
pub fn params_from_config(cfg: &AppConfig, project_bgm_volume: f32) -> DuckingParams {
    let d = DuckingParams::default();
    let level = cfg.ducking_level.unwrap_or(project_bgm_volume);
    DuckingParams {
        duck_level: in_range_or(level, 0.0, 1.0, d.duck_level),
        bridge_gap_sec: in_range_or(cfg.ducking_bridge_sec, 0.0, 10.0, d.bridge_gap_sec),
        attack_sec: in_range_or(cfg.ducking_attack_sec, 0.0, 5.0, d.attack_sec),
        release_sec: in_range_or(cfg.ducking_release_sec, 0.0, 10.0, d.release_sec),
        min_voice_sec: d.min_voice_sec,
    }
}

/// Đoạn thoại `(start, start + độ dài clip thật)` từ các clip đã chốt (sau stretch/cắt chồng).
pub fn voice_intervals(inputs: &[(PathBuf, f64)], duration_of: impl Fn(&Path) -> Option<f64>) -> Vec<(f64, f64)> {
    inputs
        .iter()
        .filter_map(|(path, start)| duration_of(path).map(|d| (*start, *start + d)))
        .collect()
}

/// Độ dài WAV đọc thẳng từ header RIFF (không gọi ffmpeg — tránh hàng trăm lần spawn khi video nhiều câu).
/// `None` nếu không phải WAV PCM đọc được; khi đó người gọi rơi về ffmpeg.
pub fn wav_duration(path: &Path) -> Option<f64> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();
    let mut head = vec![0u8; 4096.min(file_len as usize)];
    file.read_exact(&mut head).ok()?;
    if head.len() < 12 || &head[0..4] != b"RIFF" || &head[8..12] != b"WAVE" {
        return None;
    }
    let mut byte_rate = 0u32;
    let mut i = 12usize;
    while i + 8 <= head.len() {
        let id = &head[i..i + 4];
        let size = u32::from_le_bytes([head[i + 4], head[i + 5], head[i + 6], head[i + 7]]) as u64;
        if id == b"fmt " && i + 20 <= head.len() {
            byte_rate = u32::from_le_bytes([head[i + 16], head[i + 17], head[i + 18], head[i + 19]]);
        } else if id == b"data" {
            let start = (i + 8) as u64;
            let avail = file_len.saturating_sub(start);
            let len = if size == 0 || size > avail { avail } else { size };
            return (byte_rate > 0).then(|| len as f64 / f64::from(byte_rate));
        }
        i += 8 + size as usize + (size as usize & 1);
    }
    None
}

/// Điểm gãy cho video dài `media_duration` giây (≤ 0 = chưa biết → lấy mốc cuối thoại + release).
pub fn envelope_for_export(voice: &[(f64, f64)], media_duration: f64, params: &DuckingParams) -> Vec<Breakpoint> {
    let duration = if media_duration > 0.0 {
        media_duration
    } else {
        voice.iter().map(|v| v.1).fold(0.0, f64::max) + params.release_sec
    };
    build_ducking_envelope(voice, duration, params)
}

/// Đoạn đầu graph: `[0:a]<volume theo đường ducking>[bgm]`.
pub fn bgm_chain(points: &[Breakpoint]) -> String {
    format!("[0:a]{}[bgm]", ffmpeg_volume_filter(points))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_cu_chua_co_ducking_level_thi_lay_bgm_volume_du_an() {
        let cfg = AppConfig::default();
        assert!(cfg.ducking_level.is_none());
        assert!((params_from_config(&cfg, 0.35).duck_level - 0.35).abs() < 1e-6);
    }

    #[test]
    fn config_co_ducking_level_thi_uu_tien_config() {
        let cfg = AppConfig { ducking_level: Some(0.1), ..AppConfig::default() };
        assert!((params_from_config(&cfg, 0.8).duck_level - 0.1).abs() < 1e-6);
    }

    #[test]
    fn tham_so_ngoai_mien_roi_ve_mac_dinh() {
        let cfg = AppConfig {
            ducking_level: Some(f32::NAN),
            ducking_bridge_sec: -3.0,
            ducking_attack_sec: 99.0,
            ducking_release_sec: f32::INFINITY,
            ..AppConfig::default()
        };
        assert_eq!(params_from_config(&cfg, 0.5), DuckingParams::default());
    }

    #[test]
    fn config_json_cu_khong_co_field_ducking_van_doc_duoc() {
        let cfg: AppConfig = serde_json::from_str(r#"{"stt_engine_preference":"cpu"}"#).unwrap_or_default();
        assert_eq!(cfg.stt_engine_preference, "cpu");
        assert!(cfg.ducking_level.is_none());
        assert_eq!(params_from_config(&cfg, 0.25).bridge_gap_sec, 2.0);
    }

    #[test]
    fn wav_duration_doc_header_va_chi_nhan_wav() {
        let dir = std::env::temp_dir().join(format!("sublix_wavdur_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap_or_default();
        let wav = dir.join("a.wav");
        let pcm = vec![0u8; 48000 * 2 * 3]; // 3 s mono 16-bit 48 kHz
        let mut b = Vec::new();
        b.extend_from_slice(b"RIFF");
        b.extend_from_slice(&(36 + pcm.len() as u32).to_le_bytes());
        b.extend_from_slice(b"WAVEfmt ");
        b.extend_from_slice(&16u32.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&48000u32.to_le_bytes());
        b.extend_from_slice(&96000u32.to_le_bytes());
        b.extend_from_slice(&2u16.to_le_bytes());
        b.extend_from_slice(&16u16.to_le_bytes());
        b.extend_from_slice(b"data");
        b.extend_from_slice(&0xFFFF_FFFFu32.to_le_bytes()); // header "streaming": size sai → dùng độ dài file
        b.extend_from_slice(&pcm);
        std::fs::write(&wav, &b).unwrap_or_default();
        let d = wav_duration(&wav).unwrap_or(-1.0);
        assert!((d - 3.0).abs() < 1e-6, "got {d}");
        let txt = dir.join("b.wav");
        std::fs::write(&txt, b"not a wav file at all, just text").unwrap_or_default();
        assert!(wav_duration(&txt).is_none());
        assert!(wav_duration(&dir.join("missing.wav")).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn voice_intervals_bo_clip_khong_do_duoc() {
        let inputs = vec![(PathBuf::from("a.wav"), 1.0), (PathBuf::from("b.wav"), 5.0)];
        let got = voice_intervals(&inputs, |p| if p.ends_with("a.wav") { Some(2.5) } else { None });
        assert_eq!(got, vec![(1.0, 3.5)]);
    }

    #[test]
    fn envelope_for_export_khong_biet_duration_van_co_duong() {
        let pts = envelope_for_export(&[(4.0, 6.0)], 0.0, &DuckingParams::default());
        assert!(pts.len() >= 4);
        assert!(bgm_chain(&pts).starts_with("[0:a]asetnsamples"));
    }
}
