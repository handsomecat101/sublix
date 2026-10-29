//! TSK-LAB-C4 — `to_studio`: tạo **dự án Studio** từ video nháp.
//!
//! Người dùng mở video nháp trong Studio để nghe/sửa **từng câu** (đổi giọng,
//! sửa lời, xuất lại) như bình thường.
//!
//! - Mỗi đoạn lời bình ⇒ 1 `DubbingSegment` có **thời lượng trên video nháp**
//!   (`timeline_start` → `timeline_start + len`), `original_text` = lời bình,
//!   `dubbed_text` = lời bình (đã lồng tiếng trong video nháp).
//! - Đoạn giữ tiếng gốc ⇒ `dubbed_text` rỗng (âm gốc đã nằm trong video).
//! - File dự án lưu cạnh video nháp: `<video>.sublix-dubbing.json`.

use std::path::Path;

use crate::dubbing::{
    DubbingProject, DubbingSegment, DubbingSpeaker, HardSubConfig, SubStyle,
};

use super::draft::DraftSegment;

/// Tên hậu tố file dự án Studio (cạnh video).
pub const PROJECT_SUFFIX: &str = "sublix-dubbing";

/// Đường dẫn file dự án Studio cho 1 video.
pub fn project_path_for(video: &Path) -> std::path::PathBuf {
    let stem = video
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "draft".to_string());
    let parent = video.parent().map(Path::to_path_buf).unwrap_or_default();
    parent.join(format!("{stem}.{PROJECT_SUFFIX}.json"))
}

/// Dựng dự án Studio từ các đoạn đã dựng (thuần).
pub fn to_studio_project(
    video: &Path,
    segments: &[DraftSegment],
    total_sec: f64,
    voice: &str,
) -> DubbingProject {
    let mut dubbing_segments: Vec<DubbingSegment> = Vec::new();

    for (index, segment) in segments.iter().enumerate() {
        let clip_len = segment
            .clips
            .iter()
            .map(|(_, start, end)| (end - start).max(0.0))
            .sum::<f64>();
        let len = if segment.item.keep_original {
            clip_len.max(0.1)
        } else {
            segment.item.tts_secs.unwrap_or(0.0).max(clip_len).max(0.1)
        };
        let start = segment.timeline_start;
        let text = if segment.item.keep_original {
            String::new()
        } else {
            segment.item.narration.clone()
        };
        dubbing_segments.push(DubbingSegment {
            id: index + 1,
            speaker_id: if segment.item.keep_original {
                "orig".to_string()
            } else {
                "narrator".to_string()
            },
            start_sec: start,
            end_sec: start + len,
            original_text: segment.item.narration.clone(),
            dubbed_text: text,
            audio_duration_sec: Some(len),
            status: "ready".to_string(),
        });
    }

    let speakers = vec![
        DubbingSpeaker {
            id: "narrator".to_string(),
            label: "Người dẫn (AI)".to_string(),
            voice: voice.to_string(),
            pitch: "+0Hz".to_string(),
            rate: "+0%".to_string(),
            gender: "female".to_string(),
            sample_audio_data: None,
        },
        DubbingSpeaker {
            id: "orig".to_string(),
            label: "Tiếng gốc game".to_string(),
            voice: String::new(),
            pitch: "+0Hz".to_string(),
            rate: "+0%".to_string(),
            gender: "male".to_string(),
            sample_audio_data: None,
        },
    ];

    DubbingProject {
        input_path: video.to_string_lossy().to_string(),
        media_duration_sec: total_sec,
        speakers,
        segments: dubbing_segments,
        bgm_volume: 0.25,
        voice_volume: 1.25,
        dubbing_mode: "ducking".to_string(),
        time_limit_sec: None,
        diarization_engine: None,
        transcript_source: Some("lab:recap".to_string()),
        peaks: None,
        filmstrip_thumbs: None,
        sub_export_mode: None,
        audio_export_mode: None,
        target_lang: Some("vi".to_string()),
        sub_style: SubStyle::default(),
        hardsub: HardSubConfig::default(),
    }
}

/// Ghi dự án Studio ra đĩa (atomic).
pub fn save_studio_project(
    project: &DubbingProject,
    video: &Path,
) -> Result<std::path::PathBuf, String> {
    let path = project_path_for(video);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("tạo thư mục: {e}"))?;
    }
    let json = serde_json::to_string_pretty(project).map_err(|e| format!("ghi JSON: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("ghi file tạm: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("đổi tên file: {e}"))?;
    Ok(path)
}

#[cfg(test)]
#[path = "to_studio_tests.rs"]
mod to_studio_tests;
