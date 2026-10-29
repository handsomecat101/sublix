//! Test `draft_build` — huỷ trước khi làm, và ca không ghép được cảnh nào.

use std::sync::atomic::AtomicBool;

use super::*;
use crate::lab::analysis_types::LabAnalysis;

#[test]
fn huy_ngay_tu_dau_khong_chay_tts() {
    let cancel = AtomicBool::new(true);
    let work = std::env::temp_dir().join("sublix-lab-build-huy");
    let result = build_draft_in(
        &work,
        &LabAnalysis::default(),
        &[],
        &DraftOptions::default(),
        &cancel,
        &mut |_, _, _| {},
    );
    assert!(result.is_err());
    assert_eq!(result.err().unwrap_or_default(), LAB_CANCELLED);
}

#[test]
fn khong_co_canh_nao_thi_bao_loi_ro_rang() {
    let cancel = AtomicBool::new(false);
    let work = std::env::temp_dir().join("sublix-lab-build-empty");
    let result = build_draft_in(
        &work,
        &LabAnalysis::default(),
        &[],
        &DraftOptions::default(),
        &cancel,
        &mut |_, _, _| {},
    );
    let message = result.err().unwrap_or_default();
    assert!(
        message.contains("Không ghép được cảnh nào"),
        "thông điệp: {message}"
    );
}
