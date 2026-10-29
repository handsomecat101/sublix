//! Test `to_studio` (`lab/to_studio.rs`).

use super::*;
use crate::lab::recap_script::RecapItem;

fn item(id: u32, keep: bool, tts: Option<f64>) -> RecapItem {
    RecapItem {
        id,
        source_idx: 0,
        start: 0.0,
        end: 5.0,
        picture: "cảnh".to_string(),
        narration: "Lời bình.".to_string(),
        keep_original: keep,
        tts_secs: tts,
    }
}

fn segment(item: RecapItem, clips: Vec<(usize, f64, f64)>) -> DraftSegment {
    DraftSegment {
        item,
        tts_path: None,
        clips,
        timeline_start: 0.0,
    }
}

#[test]
fn duong_dan_file_du_an_canh_video() {
    let path = project_path_for(Path::new(r"C:\out\draft.mp4"));
    assert!(path.to_string_lossy().ends_with("draft.sublix-dubbing.json"), "{path:?}");
}

#[test]
fn duong_dan_file_du_an_khong_co_ten() {
    let path = project_path_for(Path::new(r"C:\out"));
    assert!(path.to_string_lossy().ends_with("out.sublix-dubbing.json"), "{path:?}");
}

#[test]
fn du_an_co_segment_theo_tung_doan() {
    let segments = vec![
        segment(item(1, false, Some(3.0)), vec![(0, 0.0, 5.0)]),
        segment(item(2, true, None), vec![(0, 5.0, 9.0)]),
    ];
    let project = to_studio_project(Path::new("draft.mp4"), &segments, 9.0, "kokoro:vi_female");
    assert_eq!(project.segments.len(), 2);
    assert_eq!(project.media_duration_sec, 9.0);
    assert_eq!(project.input_path, "draft.mp4");
}

#[test]
fn thoi_luong_segment_lay_theo_timeline_tren_video_nhap() {
    let mut first = segment(item(1, false, Some(3.0)), vec![(0, 0.0, 5.0)]);
    first.timeline_start = 0.0;
    let mut second = segment(item(2, false, Some(2.0)), vec![(0, 10.0, 12.0)]);
    second.timeline_start = 7.0;
    let project = to_studio_project(Path::new("draft.mp4"), &[first, second], 9.0, "v");
    assert_eq!(project.segments[0].start_sec, 0.0);
    assert_eq!(project.segments[1].start_sec, 7.0);
    assert_eq!(project.segments[1].end_sec, 9.0);
}

#[test]
fn doan_giu_tieng_goc_co_dubbed_text_rong() {
    let segments = vec![segment(item(1, true, None), vec![(0, 0.0, 4.0)])];
    let project = to_studio_project(Path::new("draft.mp4"), &segments, 4.0, "v");
    assert_eq!(project.segments[0].dubbed_text, "");
    assert_eq!(project.segments[0].speaker_id, "orig");
    assert!(!project.segments[0].original_text.is_empty());
}

#[test]
fn doan_loi_binh_co_dubbed_text_bang_loi_binh() {
    let segments = vec![segment(item(1, false, Some(3.0)), vec![(0, 0.0, 5.0)])];
    let project = to_studio_project(Path::new("draft.mp4"), &segments, 5.0, "v");
    assert_eq!(project.segments[0].dubbed_text, "Lời bình.");
    assert_eq!(project.segments[0].speaker_id, "narrator");
}

#[test]
fn du_an_co_2_nguoi_noi() {
    let segments = vec![segment(item(1, false, Some(3.0)), vec![(0, 0.0, 5.0)])];
    let project = to_studio_project(Path::new("draft.mp4"), &segments, 5.0, "v");
    assert_eq!(project.speakers.len(), 2);
    assert_eq!(project.speakers[0].voice, "v");
}

#[test]
fn luu_va_doc_lai_du_an_mo_duoc_trong_studio() {
    let dir = std::env::temp_dir().join("sublix-lab-studio-roundtrip");
    std::fs::create_dir_all(&dir).expect("tạo thư mục tạm");
    let video = dir.join("draft.mp4");

    let segments = vec![
        segment(item(1, false, Some(3.0)), vec![(0, 0.0, 5.0)]),
        segment(item(2, true, None), vec![(0, 5.0, 8.0)]),
    ];
    let project = to_studio_project(&video, &segments, 8.0, "kokoro:diem_trinh");
    let path = save_studio_project(&project, &video).expect("lưu dự án phải thành công");

    let text = std::fs::read_to_string(&path).expect("đọc lại file dự án");
    let loaded: crate::dubbing::DubbingProject =
        serde_json::from_str(&text).expect("JSON phải parse lại thành DubbingProject");

    assert_eq!(loaded.input_path, project.input_path);
    assert_eq!(loaded.segments.len(), 2);
    assert_eq!(loaded.speakers.len(), 2);
    assert_eq!(loaded.segments[1].speaker_id, "orig");

    let _ = std::fs::remove_dir_all(&dir);
}
