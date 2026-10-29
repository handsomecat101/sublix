//! Test đồ thị ffmpeg của video nháp (`lab/draft_render.rs`).

use super::*;
use crate::lab::draft::DraftSegment;
use crate::lab::recap_script::RecapItem;

fn item(id: u32, keep: bool) -> RecapItem {
    RecapItem {
        id,
        source_idx: 0,
        start: 0.0,
        end: 5.0,
        picture: "cảnh".to_string(),
        narration: "Lời bình.".to_string(),
        keep_original: keep,
        tts_secs: Some(3.0),
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

fn plan(segments: &[DraftSegment], tts: &[(u32, PathBuf)]) -> RenderPlan {
    let sources = vec![PathBuf::from("game.mp4")];
    build_draft_plan(
        &RenderInput {
            segments,
            sources: &sources,
            tts_files: tts,
            bed_volume: DEFAULT_BED_VOLUME,
        },
        Path::new("draft.mp4"),
    )
}

#[test]
fn do_thi_co_nhan_dau_ra() {
    let segments = vec![segment(item(1, false), vec![(0, 0.0, 5.0)])];
    let built = plan(&segments, &[(1, PathBuf::from("tts1.wav"))]);
    assert!(built.filter_complex.contains("[vout]"));
    assert!(built.filter_complex.contains("[aout]"));
    assert_eq!(built.created_labels().len(), 2);
    assert_eq!(built.mapped_labels().len(), 2);
    assert_eq!(built.output, PathBuf::from("draft.mp4"));
}

#[test]
fn do_thi_co_cat_va_tam_lai() {
    let segments = vec![segment(item(1, false), vec![(0, 12.5, 20.0)])];
    let built = plan(&segments, &[(1, PathBuf::from("tts1.wav"))]);
    assert!(built.filter_complex.contains("trim=start=12.5:end=20"));
    assert!(built.filter_complex.contains("setpts=PTS-STARTPTS"));
}

#[test]
fn doan_giu_tieng_goc_dung_am_goc_khong_tron_voi_tts() {
    let segments = vec![segment(item(1, true), vec![(0, 0.0, 5.0)])];
    let built = plan(&segments, &[]);
    assert!(built.filter_complex.contains("atrim=start=0:end=5"));
    assert!(
        !built.filter_complex.contains("amix"),
        "đoạn giữ tiếng gốc không trộn TTS"
    );
}

#[test]
fn doan_loi_binh_tron_am_nen_ha_nho_va_giong_tts() {
    let segments = vec![segment(item(1, false), vec![(0, 0.0, 5.0)])];
    let built = plan(&segments, &[(1, PathBuf::from("tts1.wav"))]);
    assert!(built.filter_complex.contains("volume=0.25"), "nền bị hạ nhỏ");
    assert!(built.filter_complex.contains("amix=inputs=2"), "trộn nền + giọng");
    assert!(built.filter_complex.contains("apad"), "bù cho đủ độ dài clip");
}

#[test]
fn nhieu_doan_dung_concat_dung_so() {
    let segments = vec![
        segment(item(1, false), vec![(0, 0.0, 5.0)]),
        segment(item(2, true), vec![(0, 5.0, 9.0)]),
    ];
    let built = plan(&segments, &[(1, PathBuf::from("tts1.wav"))]);
    assert!(built.filter_complex.contains("concat=n=2:v=1:a=1"));
    assert!(built.filter_complex.contains("[v0][a0][v1][a1]"));
}

#[test]
fn danh_sach_input_gom_video_nguon_va_file_tts() {
    let segments = vec![segment(item(1, false), vec![(0, 0.0, 5.0)])];
    let built = plan(&segments, &[(1, PathBuf::from("tts1.wav"))]);
    assert_eq!(built.inputs.len(), 2);
    assert_eq!(built.inputs[0], PathBuf::from("game.mp4"));
    assert_eq!(built.inputs[1], PathBuf::from("tts1.wav"));
}

#[test]
fn doan_khong_co_file_tts_dung_anull_khong_loi() {
    let segments = vec![segment(item(1, false), vec![(0, 0.0, 5.0)])];
    let built = plan(&segments, &[]);
    assert!(built.filter_complex.contains("anull"));
    assert!(!built.filter_complex.contains("amix"));
}
