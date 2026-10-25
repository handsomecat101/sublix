//! Test cho `ducking.rs` — cùng `scripts/ducking-tests/vectors.json` với bản TS (spec §4.3).

use super::*;
use serde_json::Value;
use std::process::Command;

const VECTORS: &str = include_str!("../../../scripts/ducking-tests/vectors.json");
const T_TOL: f64 = 0.001;
const G_TOL: f64 = 0.001;

fn num(v: &Value) -> f64 {
    v.as_f64().unwrap_or(f64::NAN)
}

fn pair(v: &Value) -> (f64, f64) {
    (num(&v[0]), num(&v[1]))
}

fn params_of(defaults: &Value, over: &Value) -> DuckingParams {
    let get = |k: &str| {
        let o = &over[k];
        if o.is_null() { num(&defaults[k]) } else { num(o) }
    };
    DuckingParams {
        duck_level: get("duck_level"),
        bridge_gap_sec: get("bridge_gap_sec"),
        attack_sec: get("attack_sec"),
        release_sec: get("release_sec"),
        min_voice_sec: get("min_voice_sec"),
    }
}

fn arr(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}

#[test]
fn default_params_match_vectors_defaults() {
    let root: Value = serde_json::from_str(VECTORS).expect("vectors.json hợp lệ");
    assert_eq!(DuckingParams::default(), params_of(&root["defaults"], &Value::Null));
}

#[test]
fn vectors_json_cases_match() {
    let root: Value = serde_json::from_str(VECTORS).expect("vectors.json hợp lệ");
    let cases = arr(&root["cases"]);
    assert!(cases.len() >= 10, "thiếu ca §5");
    for c in cases {
        let name = c["name"].as_str().unwrap_or("?");
        let voice: Vec<(f64, f64)> = arr(&c["voice"]).iter().map(pair).collect();
        let p = params_of(&root["defaults"], &c["params"]);
        let pts = build_ducking_envelope(&voice, num(&c["duration"]), &p);
        let want: Vec<(f64, f64)> = arr(&c["expected"]).iter().map(pair).collect();
        assert_eq!(pts.len(), want.len(), "{name}: số điểm gãy {pts:?}");
        for (i, (got, (t, g))) in pts.iter().zip(&want).enumerate() {
            assert!((got.t - t).abs() <= T_TOL, "{name} điểm {i}: t={} mong {t}", got.t);
            assert!((got.gain - g).abs() <= G_TOL, "{name} điểm {i}: gain={} mong {g}", got.gain);
        }
        for chk in arr(&c["gain_checks"]) {
            let (t, g) = pair(chk);
            assert!((gain_at(&pts, t) - g).abs() <= G_TOL, "{name}: gain_at({t})");
        }
        for chk in arr(&c["max_gain_between"]) {
            let (a, b, max_g) = (num(&chk[0]), num(&chk[1]), num(&chk[2]));
            let mut t = a;
            while t <= b {
                assert!(gain_at(&pts, t) <= max_g + G_TOL, "{name}: gain_at({t}) vượt {max_g}");
                t += 0.005;
            }
        }
    }
}

#[test]
fn gain_at_interpolates_in_db_and_holds_ends() {
    let pts = [Breakpoint { t: 0.0, gain: 1.0 }, Breakpoint { t: 10.0, gain: 0.1 }];
    assert_eq!(gain_at(&pts, -5.0), 1.0);
    assert_eq!(gain_at(&pts, 99.0), 0.1);
    assert!((gain_at(&pts, 5.0) - 0.1f64.sqrt()).abs() < 1e-9);
    assert_eq!(gain_at(&[], 3.0), 1.0);
}

#[test]
fn bad_params_do_not_panic() {
    let p = DuckingParams::default();
    assert_eq!(build_ducking_envelope(&[(1.0, 2.0)], 0.0, &p).len(), 1);
    assert_eq!(build_ducking_envelope(&[(f64::NAN, 2.0)], 10.0, &p).len(), 1);
    let weird = DuckingParams { duck_level: 0.0, attack_sec: 0.0, release_sec: 0.0, ..p };
    let pts = build_ducking_envelope(&[(1.0, 2.0)], 10.0, &weird);
    assert!(pts.iter().all(|b| b.gain > 0.0 && b.gain.is_finite()));
}

/// Cài đặt ngây thơ độc lập: gộp khối rồi lấy min dB của từng khối tại từng t.
fn brute_gain(voice: &[(f64, f64)], dur: f64, p: &DuckingParams, t: f64) -> f64 {
    let mut segs: Vec<(f64, f64)> = voice
        .iter()
        .map(|&(s, e)| (s.clamp(0.0, dur), e.clamp(0.0, dur)))
        .filter(|&(s, e)| e - s >= p.min_voice_sec)
        .collect();
    segs.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut blocks: Vec<(f64, f64)> = Vec::new();
    for sg in segs {
        match blocks.last_mut() {
            Some(cur) if sg.0 - cur.1 < p.bridge_gap_sec => cur.1 = cur.1.max(sg.1),
            _ => blocks.push(sg),
        }
    }
    let l = 20.0 * p.duck_level.log10();
    let mut db: f64 = 0.0;
    for (s, e) in blocks {
        let f = if t < s {
            ((t - (s - p.attack_sec)) / p.attack_sec).clamp(0.0, 1.0)
        } else if t <= e {
            1.0
        } else {
            (1.0 - (t - e) / p.release_sec).clamp(0.0, 1.0)
        };
        db = db.min(l * f);
    }
    10f64.powf(db / 20.0)
}

#[test]
fn envelope_matches_brute_force_on_random_cases() {
    let mut state: u64 = 20261025;
    let mut rand = move || {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        ((state >> 11) as f64) / ((1u64 << 53) as f64)
    };
    for iter in 0..300 {
        let dur = 20.0 + rand() * 80.0;
        let n = (rand() * 14.0) as usize;
        let voice: Vec<(f64, f64)> = (0..n)
            .map(|_| {
                let s = rand() * dur;
                (s, s + rand() * 4.0)
            })
            .collect();
        let p = DuckingParams {
            duck_level: 0.05 + rand() * 0.9,
            bridge_gap_sec: rand() * 3.0,
            attack_sec: 0.05 + rand() * 1.5,
            release_sec: 0.05 + rand() * 2.0,
            min_voice_sec: 0.15,
        };
        let pts = build_ducking_envelope(&voice, dur, &p);
        assert!(pts.windows(2).all(|w| w[1].t > w[0].t), "t tăng ngặt (iter {iter})");
        let mut t = 0.0;
        while t <= dur {
            let (got, want) = (gain_at(&pts, t), brute_gain(&voice, dur, &p, t));
            assert!((got - want).abs() <= 1e-6, "iter {iter} t={t}: {got} vs {want}");
            t += 0.037;
        }
    }
}

#[test]
fn volume_filter_flat_cases() {
    assert_eq!(ffmpeg_volume_filter(&[]), "volume=1.000000");
    assert_eq!(ffmpeg_volume_filter(&[Breakpoint { t: 0.0, gain: 1.0 }]), "volume=1.000000");
}

/// Đọc PCM s16le mono từ WAV (tìm chunk `data`).
fn read_wav_samples(bytes: &[u8]) -> Vec<f64> {
    let mut i = 12;
    while i + 8 <= bytes.len() {
        let size = u32::from_le_bytes([bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]]) as usize;
        if &bytes[i..i + 4] == b"data" {
            let end = (i + 8 + size).min(bytes.len());
            return bytes[i + 8..end]
                .chunks_exact(2)
                .map(|c| i16::from_le_bytes([c[0], c[1]]) as f64 / 32768.0)
                .collect();
        }
        i += 8 + size + (size & 1);
    }
    Vec::new()
}

fn rms_db(samples: &[f64], rate: f64, center: f64, win: f64) -> f64 {
    let a = ((center - win / 2.0) * rate).max(0.0) as usize;
    let b = (((center + win / 2.0) * rate) as usize).min(samples.len());
    let slice = &samples[a.min(b)..b];
    let ms = slice.iter().map(|x| x * x).sum::<f64>() / slice.len().max(1) as f64;
    10.0 * ms.max(1e-20).log10()
}

/// Chạy ffmpeg thật trên tone 20 s, đo RMS ở các mốc và so với `gain_at` (sai ≤ 1 dB).
/// Bỏ qua (có log) nếu máy không có ffmpeg.
#[test]
fn ffmpeg_filter_matches_envelope_on_real_tone() {
    let voice = [(5.0, 8.0), (9.0, 10.0), (15.0, 16.0)];
    let pts = build_ducking_envelope(&voice, 20.0, &DuckingParams::default());
    let filter = ffmpeg_volume_filter(&pts);
    let out = std::env::temp_dir().join(format!("sublix_ducking_{}.wav", std::process::id()));
    let run = Command::new(crate::dubbing::find_ffmpeg())
        .args(["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=20:sample_rate=48000"])
        .args(["-af", &filter, "-c:a", "pcm_s16le"])
        .arg(&out)
        .output();
    let Ok(run) = run else {
        eprintln!("SKIP: không chạy được ffmpeg");
        return;
    };
    assert!(run.status.success(), "ffmpeg lỗi: {}\nfilter: {filter}", String::from_utf8_lossy(&run.stderr));
    let bytes = std::fs::read(&out).expect("đọc wav");
    let _ = std::fs::remove_file(&out);
    let samples = read_wav_samples(&bytes);
    assert!(samples.len() > 48000 * 19, "wav quá ngắn: {}", samples.len());

    let reference = rms_db(&samples, 48000.0, 1.0, 0.5); // gain = 1 ở t = 1 s
    for t in [1.0, 4.85, 5.0, 5.5, 9.5, 10.3, 10.6, 12.0, 14.85, 15.5, 16.4, 19.0] {
        let measured = rms_db(&samples, 48000.0, t, 0.02) - reference;
        let expected = 20.0 * gain_at(&pts, t).log10();
        assert!((measured - expected).abs() <= 1.0, "t={t}: đo {measured:.2} dB, mong {expected:.2} dB");
    }
}
