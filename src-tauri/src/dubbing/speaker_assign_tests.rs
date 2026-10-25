//! Test thuần cho `speaker_assign` — không cần model, không cần audio thật.

use super::*;

fn profile(speaker: usize, f0: Option<f64>, dur: f64, segments: usize) -> ClusterProfile {
    ClusterProfile {
        speaker,
        f0_median: f0,
        duration_sec: dur,
        segments,
        members: vec![speaker],
    }
}

#[test]
fn gender_from_f0_phan_doi_rõ() {
    assert_eq!(gender_from_f0(Some(95.0)), PitchGender::Male);
    assert_eq!(gender_from_f0(Some(165.0)), PitchGender::Male);
    assert_eq!(gender_from_f0(Some(220.0)), PitchGender::Female);
    assert_eq!(gender_from_f0(Some(180.0)), PitchGender::Female);
}

#[test]
fn gender_from_f0_vung_khong_chac() {
    // 165–180 Hz = vùng "không chắc" → giữ mặc định + đánh dấu.
    assert_eq!(gender_from_f0(Some(170.0)), PitchGender::Uncertain);
    assert_eq!(gender_from_f0(Some(175.0)), PitchGender::Uncertain);
    assert_eq!(gender_from_f0(None), PitchGender::Uncertain);
    assert_eq!(gender_from_f0(Some(0.0)), PitchGender::Uncertain);
    assert_eq!(gender_from_f0(Some(f64::NAN)), PitchGender::Uncertain);
    assert!(!PitchGender::Uncertain.is_known());
    assert!(PitchGender::Male.is_known());
    assert_eq!(PitchGender::Uncertain.as_str(), "unknown");
}

#[test]
fn merge_clusters_khong_dung_modulo() {
    // 4 cụm > 2 vai: KHÔNG gộp theo % (modulo sẽ gộp nam 0 với nữ 2).
    let profiles = vec![
        profile(0, Some(120.0), 30.0, 10),
        profile(1, Some(215.0), 25.0, 8),
        profile(2, Some(128.0), 12.0, 4),
        profile(3, Some(205.0), 8.0, 3),
    ];
    let merged = merge_clusters(&profiles, 2);
    assert_eq!(merged.merged.len(), 2, "phải còn đúng 2 cụm");
    // Cụm 0 (nam) và 2 (nam) phải chung cụm; 1 và 3 (nữ) chung cụm.
    let g0 = merged.mapping.get(&0).copied();
    let g2 = merged.mapping.get(&2).copied();
    let g1 = merged.mapping.get(&1).copied();
    let g3 = merged.mapping.get(&3).copied();
    assert_eq!(g0, g2, "2 cụm nam phải gộp chung");
    assert_eq!(g1, g3, "2 cụm nữ phải gộp chung");
    assert_ne!(g0, g1, "nam và nữ KHÔNG được gộp chung");
}

#[test]
fn merge_clusters_giu_nguyen_khi_it_cum() {
    let profiles = vec![
        profile(0, Some(120.0), 30.0, 10),
        profile(1, Some(215.0), 25.0, 8),
    ];
    let merged = merge_clusters(&profiles, 2);
    assert_eq!(merged.merged.len(), 2);
    assert_eq!(merged.mapping.get(&0).copied(), Some(0));
    assert_eq!(merged.mapping.get(&1).copied(), Some(1));
}

#[test]
fn merge_clusters_gop_cum_nho_vao_cum_lon() {
    let profiles = vec![
        profile(0, Some(120.0), 40.0, 12),
        profile(1, Some(124.0), 5.0, 2),
    ];
    let merged = merge_clusters(&profiles, 1);
    assert_eq!(merged.merged.len(), 1);
    assert_eq!(merged.mapping.get(&0).copied(), Some(0));
    assert_eq!(merged.mapping.get(&1).copied(), Some(0));
    // F0 gộp = trung bình theo thời lượng → vẫn là giọng nam.
    let f0 = merged.merged[0].f0_median.expect("phai co F0");
    assert!((119.0..=125.0).contains(&f0), "F0 gop la {}", f0);
    assert_eq!(merged.merged[0].duration_sec, 45.0);
}

#[test]
fn cluster_distance_phan_biet_nam_nu() {
    let a = profile(0, Some(120.0), 30.0, 10);
    let b = profile(1, Some(220.0), 30.0, 10);
    let c = profile(2, Some(130.0), 30.0, 10);
    assert!(
        cluster_distance(&a, &c) < cluster_distance(&a, &b),
        "2 giọng nam phải gần nhau hơn nam-vs-nữ"
    );
}

#[test]
fn cluster_profiles_tinh_tong_thoi_luong() {
    let segments = vec![
        (0.0, 3.0, 0usize),
        (3.5, 6.0, 0usize),
        (7.0, 9.0, 1usize),
    ];
    let mut pitches = HashMap::new();
    pitches.insert(
        0,
        SpeakerPitch {
            f0_median: Some(118.0),
            voiced_ratio: 0.8,
            duration_sec: 5.5,
        },
    );
    let profiles = cluster_profiles(&segments, &pitches);
    assert_eq!(profiles.len(), 2);
    assert_eq!(profiles[0].speaker, 0);
    assert_eq!(profiles[0].segments, 2);
    assert!((profiles[0].duration_sec - 5.5).abs() < 1e-9);
    assert_eq!(profiles[0].f0_median, Some(118.0));
    assert_eq!(profiles[1].f0_median, None, "cụm chưa đo F0 → None");
}

#[test]
fn gender_map_dung_theo_chi_so_cum_sau_gop() {
    let profiles = vec![
        profile(0, Some(120.0), 30.0, 10),
        profile(1, Some(215.0), 25.0, 8),
        profile(2, Some(128.0), 6.0, 2),
    ];
    let merged = merge_clusters(&profiles, 2);
    let genders = gender_map(&merged.merged);
    let g0 = genders.get("speaker_0").copied();
    let g1 = genders.get("speaker_1").copied();
    assert_eq!(g0, Some(PitchGender::Male));
    assert_eq!(g1, Some(PitchGender::Female));
}
