//! Test `draft_plan` — map vùng rác theo nguồn, cảnh dự phòng, tự sửa vi phạm.

use super::*;
use crate::lab::analysis_types::{LabAnalysis, LabJunkSegment, LabSource};
use crate::lab::cutscene::SceneSegment;
use crate::lab::draft::DraftOptions;
use crate::lab::recap_script::RecapItem;

fn source(name: &str, duration: f64) -> LabSource {
    LabSource {
        id: name.to_string(),
        path: format!("C:\\videos\\{name}"),
        name: name.to_string(),
        duration_sec: duration,
        ..LabSource::default()
    }
}

fn junk(source_name: &str, range: &str) -> LabJunkSegment {
    LabJunkSegment {
        id: 1,
        kind: "ad".to_string(),
        source_name: source_name.to_string(),
        time_range: range.to_string(),
        reason: "quảng cáo".to_string(),
        restored: false,
    }
}

fn item(id: u32, start: f64, end: f64, keep: bool) -> RecapItem {
    RecapItem {
        id,
        source_idx: 0,
        start,
        end,
        picture: String::new(),
        narration: if keep {
            String::new()
        } else {
            format!("câu {id}")
        },
        keep_original: keep,
        tts_secs: if keep { None } else { Some(5.0) },
    }
}

#[test]
fn vung_rac_map_dung_nguon_theo_ten_video() {
    let analysis = LabAnalysis {
        sources: vec![source("a.mp4", 60.0), source("b.mp4", 120.0)],
        junk: vec![junk("b.mp4", "00:00:10 - 00:00:20")],
        ..LabAnalysis::default()
    };
    let ranges = to_junk_ranges(&analysis);

    assert_eq!(ranges.len(), 1);
    assert_eq!(ranges[0].source_idx, 1, "rác của b.mp4 phải thuộc nguồn 1");
    assert_eq!((ranges[0].start, ranges[0].end), (10.0, 20.0));
}

#[test]
fn khong_co_canh_thi_tao_canh_phu_ca_video() {
    let analysis = LabAnalysis {
        sources: vec![source("a.mp4", 90.0)],
        ..LabAnalysis::default()
    };
    let candidates = to_scene_candidates(&analysis);
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].source_idx, 0);
    assert_eq!((candidates[0].start, candidates[0].end), (0.0, 90.0));
    assert!(candidates[0].score > 0.0);
}

#[test]
fn giu_canh_that_khi_da_phan_canh() {
    let analysis = LabAnalysis {
        sources: vec![source("a.mp4", 90.0)],
        scenes: vec![SceneSegment {
            source_idx: 0,
            start: 10.0,
            end: 20.0,
            score: 0.8,
            features: crate::lab::cutscene::SceneFeatures {
                letterbox_cover: 1.0,
                letterbox_strength: 1.0,
                hardsub_cover: 0.0,
                dialogue_density: 0.5,
                silence_cover: 0.0,
            },
        }],
        ..LabAnalysis::default()
    };
    let candidates = to_scene_candidates(&analysis);
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].score, 0.8);
}

#[test]
fn autofix_bo_doan_thoai_goc_mo_dau() {
    let mut script = crate::lab::recap_script::RecapScript::new(vec![
        item(1, 0.0, 3.0, true),
        item(2, 3.0, 8.0, false),
    ]);
    let notes = autofix_script(&mut script);

    assert_eq!(script.items.len(), 1);
    assert_eq!(script.items[0].id, 2, "id giữ nguyên (để map file TTS)");
    assert!(!notes.is_empty());
}

#[test]
fn autofix_cat_chuoi_qua_hai_doan_thoai_goc() {
    let mut script = crate::lab::recap_script::RecapScript::new(vec![
        item(1, 0.0, 5.0, false),
        item(2, 5.0, 8.0, true),
        item(3, 8.0, 11.0, true),
        item(4, 11.0, 14.0, true),
        item(5, 14.0, 20.0, false),
    ]);
    autofix_script(&mut script);

    let ids: Vec<u32> = script.items.iter().map(|entry| entry.id).collect();
    assert_eq!(ids, vec![1, 2, 3, 5], "bỏ đoạn thứ 3 của chuỗi");
}

#[test]
fn autofix_bo_doan_trung_thoi_gian_cung_nguon() {
    let mut script = crate::lab::recap_script::RecapScript::new(vec![
        item(1, 0.0, 10.0, false),
        item(2, 5.0, 12.0, true),
    ]);
    autofix_script(&mut script);

    assert_eq!(script.items.len(), 1);
    assert!(script.validate().is_empty(), "sau khi sửa không còn R5");
}

#[test]
fn plan_draft_voi_du_lieu_toi_thieu() {
    let analysis = LabAnalysis {
        sources: vec![source("a.mp4", 30.0)],
        scenes: vec![SceneSegment {
            source_idx: 0,
            start: 0.0,
            end: 30.0,
            score: 0.7,
            features: crate::lab::cutscene::SceneFeatures {
                letterbox_cover: 0.0,
                letterbox_strength: 0.0,
                hardsub_cover: 0.0,
                dialogue_density: 0.0,
                silence_cover: 0.0,
            },
        }],
        ..LabAnalysis::default()
    };
    let items = vec![item(1, 0.0, 30.0, false)];
    let plan = plan_draft(&analysis, &items, &DraftOptions::default());

    assert_eq!(plan.script.items.len(), 1);
    assert!(plan.violations.is_empty(), "{:?}", plan.violations);
    assert!(plan.unplaced.is_empty());
    assert_eq!(plan.script.items[0].tts_secs, Some(5.0));
}
