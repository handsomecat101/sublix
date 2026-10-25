//! Test cho `ducking.rs` — cùng `scripts/ducking-tests/vectors.json` với bản TS (spec §4.3).

use super::*;
use serde_json::Value;

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

