//! Gán người nói theo **GIỌNG thật**: F0 (pitch) → giới tính + gộp cụm khi vượt số vai.
//!
//! TSK-FIX-SPEAKER-ROLES. Ba việc:
//!
//! 1. **Giới tính nghe được từ giọng**: mỗi cụm người nói → F0 trung vị đo bằng
//!    tự tương quan (`scripts/speaker_gender.py`, chỉ cần numpy) → ngưỡng
//!    **165 Hz** (nam ≤ 165 Hz, nữ ≥ 180 Hz, giữa là vùng **không chắc**).
//! 2. **Gộp cụm thay vì modulo**: sherpa có thể ra nhiều cụm hơn số vai người
//!    chọn → gộp cụm **gần nhất** (khoảng cách F0 + thời lượng), KHÔNG `% n`
//!    (modulo gộp bừa người nam với người nữ).
//! 3. **MiniMax không ghi đè phân vai theo giọng** (xem `dubbing/mod.rs`).
//!
//! Module này chỉ chứa logic thuần ⇒ test được không cần model / không cần audio.

use std::collections::HashMap;

pub mod pitch;

pub use pitch::estimate_speaker_pitches;

/// F0 ≤ ngưỡng này → giọng nam.
pub const F0_MALE_MAX_HZ: f64 = 165.0;
/// F0 ≥ ngưỡng này → giọng nữ.
pub const F0_FEMALE_MIN_HZ: f64 = 180.0;

/// Giới tính suy ra từ F0 trung vị của cụm người nói.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PitchGender {
    Male,
    Female,
    /// Vùng "không chắc" (165–180 Hz) hoặc không đo được → giữ mặc định + đánh dấu.
    Uncertain,
}

impl PitchGender {
    /// Có đo được giới tính thật không?
    pub fn is_known(&self) -> bool {
        !matches!(self, PitchGender::Uncertain)
    }

    /// Chuỗi lưu vào `DubbingSpeaker.gender` (frontend đọc "male"/"female").
    pub fn as_str(&self) -> &'static str {
        match self {
            PitchGender::Male => "male",
            PitchGender::Female => "female",
            PitchGender::Uncertain => "unknown",
        }
    }
}

/// Suy giới tính từ F0 trung vị (Hz). `None`/NaN ⇒ không chắc.
pub fn gender_from_f0(f0: Option<f64>) -> PitchGender {
    match f0 {
        Some(v) if v.is_finite() && v > 0.0 => {
            if v <= F0_MALE_MAX_HZ {
                PitchGender::Male
            } else if v >= F0_FEMALE_MIN_HZ {
                PitchGender::Female
            } else {
                PitchGender::Uncertain
            }
        }
        _ => PitchGender::Uncertain,
    }
}

/// Kết quả đo F0 cho 1 cụm người nói.
#[derive(Debug, Clone, Copy, Default)]
pub struct SpeakerPitch {
    /// F0 trung vị (Hz) — `None` = không đo được khung nào có nối.
    pub f0_median: Option<f64>,
    /// Tỉ lệ khung "có nối" (0..1) — thấp nghĩa là giọng mờ / nhiều nhiễu.
    pub voiced_ratio: f64,
    /// Tổng thời lượng audio của cụm (giây).
    pub duration_sec: f64,
}

/// Hồ sơ 1 cụm người nói (dùng để gộp cụm).
#[derive(Debug, Clone)]
pub struct ClusterProfile {
    /// Id cụm gốc (từ sherpa).
    pub speaker: usize,
    /// F0 trung vị của cụm (Hz).
    pub f0_median: Option<f64>,
    /// Tổng thời lượng (giây).
    pub duration_sec: f64,
    /// Số đoạn thuộc cụm.
    pub segments: usize,
    /// Các id cụm gốc đã bị gộp vào cụm này.
    pub members: Vec<usize>,
}

/// Khoảng cách giữa 2 cụm: F0 (ưu tiên) + thời lượng (dự phòng).
pub fn cluster_distance(a: &ClusterProfile, b: &ClusterProfile) -> f64 {
    let pitch = match (a.f0_median, b.f0_median) {
        (Some(x), Some(y)) if x > 0.0 && y > 0.0 => {
            // 1 octave = 0.5 ⇒ nam (~120) vs nữ (~220) ≈ 0.44, nam vs nam ≈ 0.09.
            let octaves = ((x / y).ln() / std::f64::consts::LN_2).abs();
            (octaves / 2.0).min(1.0)
        }
        _ => 1.0,
    };
    let max_dur = a.duration_sec.max(b.duration_sec);
    let dur = if max_dur > 0.0 {
        (a.duration_sec - b.duration_sec).abs() / max_dur
    } else {
        0.0
    };
    if a.f0_median.is_some() && b.f0_median.is_some() {
        0.8 * pitch + 0.2 * dur
    } else {
        dur
    }
}

/// Gộp 2 cụm: F0 trung bình theo thời lượng, thời lượng cộng dồn.
fn merge_two(a: &ClusterProfile, b: &ClusterProfile) -> ClusterProfile {
    let dur = a.duration_sec + b.duration_sec;
    let f0_median = match (a.f0_median, b.f0_median) {
        (Some(x), Some(y)) => {
            if dur > 0.0 {
                Some((x * a.duration_sec + y * b.duration_sec) / dur)
            } else {
                Some(x)
            }
        }
        (Some(x), None) => Some(x),
        (None, Some(y)) => Some(y),
        (None, None) => None,
    };
    let mut members = a.members.clone();
    members.extend(b.members.iter().copied());
    ClusterProfile {
        speaker: a.speaker,
        f0_median,
        duration_sec: dur,
        segments: a.segments + b.segments,
        members,
    }
}

/// Kết quả gộp cụm.
#[derive(Debug, Clone, Default)]
pub struct ClusterMerge {
    /// Id cụm gốc → chỉ số cụm sau gộp (0..n-1).
    pub mapping: HashMap<usize, usize>,
    /// Hồ sơ các cụm sau gộp (đã gộp F0 + thời lượng).
    pub merged: Vec<ClusterProfile>,
}

/// Gộp cụm về ≤ `max_speakers` — **không modulo**, gộp cụm gần nhất.
///
/// Cụm nhỏ hơn bị gộp vào cụm lớn hơn (giữ id của cụm lớn).
pub fn merge_clusters(profiles: &[ClusterProfile], max_speakers: usize) -> ClusterMerge {
    let mut clusters: Vec<ClusterProfile> = profiles.to_vec();
    if max_speakers > 0 && clusters.len() > max_speakers {
        while clusters.len() > max_speakers {
            let mut best: Option<(usize, usize)> = None;
            for i in 0..clusters.len() {
                for j in (i + 1)..clusters.len() {
                    let closer = match best {
                        None => true,
                        Some((bi, bj)) => {
                            cluster_distance(&clusters[i], &clusters[j])
                                < cluster_distance(&clusters[bi], &clusters[bj])
                        }
                    };
                    if closer {
                        best = Some((i, j));
                    }
                }
            }
            let Some((i, j)) = best else { break };
            let (keep, drop) = if clusters[i].segments >= clusters[j].segments {
                (i, j)
            } else {
                (j, i)
            };
            let merged = merge_two(&clusters[keep], &clusters[drop]);
            clusters[keep] = merged;
            clusters.remove(drop);
        }
    }
    let mut mapping = HashMap::new();
    for (idx, cluster) in clusters.iter().enumerate() {
        for member in &cluster.members {
            mapping.insert(*member, idx);
        }
    }
    ClusterMerge { mapping, merged: clusters }
}

/// Dựng hồ sơ cụm từ các đoạn sherpa + kết quả đo F0.
pub fn cluster_profiles(
    segments: &[(f64, f64, usize)],
    pitches: &HashMap<usize, SpeakerPitch>,
) -> Vec<ClusterProfile> {
    let mut map: HashMap<usize, (f64, usize)> = HashMap::new();
    for (start, end, speaker) in segments {
        let entry = map.entry(*speaker).or_insert((0.0, 0));
        entry.0 += (end - start).max(0.0);
        entry.1 += 1;
    }
    let mut out: Vec<ClusterProfile> = map
        .into_iter()
        .map(|(speaker, (duration, segments))| ClusterProfile {
            speaker,
            f0_median: pitches.get(&speaker).and_then(|p| p.f0_median),
            duration_sec: duration,
            segments,
            members: vec![speaker],
        })
        .collect();
    out.sort_by_key(|c| c.speaker);
    out
}

/// Giới tính theo `speaker_id` sau khi gộp cụm ("speaker_0" → giới tính).
pub fn gender_map(merged: &[ClusterProfile]) -> HashMap<String, PitchGender> {
    merged
        .iter()
        .enumerate()
        .map(|(idx, c)| (format!("speaker_{idx}"), gender_from_f0(c.f0_median)))
        .collect()
}

#[cfg(test)]
#[path = "speaker_assign_tests.rs"]
mod tests;
