//! TSK-LAB-C4 — dựng **đồ thị ffmpeg** cho video nháp (thuần, test được).
//!
//! Mô phỏng `dubbing/export_video_graph.rs`: dựng chuỗi `-filter_complex` +
//! danh sách `-i` ⇒ argv hoàn chỉnh.
//!
//! - **Đoạn lời bình**: ảnh = clip nguồn; âm = **âm nền game hạ nhỏ** (`volume`)
//!   trộn với giọng TTS ⇒ *duck* đơn giản (xem `docs/DUCKING_SPEC.md`).
//! - **Đoạn giữ tiếng gốc**: ảnh = clip nguồn; âm = **âm gốc** nguyên vẹn.
//! - Mọi đoạn cùng độ dài (bù bằng `apad`+`atrim`) ⇒ `concat` không vỡ.

use std::path::{Path, PathBuf};

use super::draft::DraftSegment;

/// Nhãn đầu ra video.
pub const VIDEO_OUT: &str = "vout";
/// Nhãn đầu ra audio.
pub const AUDIO_OUT: &str = "aout";

/// Đầu vào dựng đồ thị.
pub struct RenderInput<'a> {
    /// Các đoạn đã dựng (có `clips` + `tts_secs`).
    pub segments: &'a [DraftSegment],
    /// Video nguồn theo `source_idx`.
    pub sources: &'a [PathBuf],
    /// File TTS theo `item.id` (mục giữ tiếng gốc không có).
    pub tts_files: &'a [(u32, PathBuf)],
    /// Âm lượng nền dưới giọng (0.25 = hạ còn 25 %).
    pub bed_volume: f64,
}

/// Kế hoạch dựng.
#[derive(Debug, Clone, PartialEq)]
pub struct RenderPlan {
    /// Đồ thị `-filter_complex`.
    pub filter_complex: String,
    /// Các tham số `-i` (theo thứ tự: video nguồn trước, TTS sau).
    pub inputs: Vec<PathBuf>,
    /// Đường dẫn video nháp đầu ra.
    pub output: PathBuf,
}

impl RenderPlan {
    /// Nhãn được tạo trong đồ thị (phải map hết — xem `export_video_graph`).
    pub fn created_labels(&self) -> Vec<String> {
        vec![VIDEO_OUT.to_string(), AUDIO_OUT.to_string()]
    }

    /// Nhãn được `-map` ra.
    pub fn mapped_labels(&self) -> Vec<String> {
        vec![format!("[{VIDEO_OUT}]"), format!("[{AUDIO_OUT}]")]
    }
}

/// Dựng kế hoạch ffmpeg cho video nháp.
pub fn build_draft_plan(input: &RenderInput<'_>, output: &Path) -> RenderPlan {
    let mut inputs: Vec<PathBuf> = input.sources.to_vec();
    let mut tts_index: Vec<(u32, usize)> = Vec::new();
    for (id, path) in input.tts_files {
        tts_index.push((*id, inputs.len()));
        inputs.push(path.clone());
    }

    let mut parts: Vec<String> = Vec::new();
    for (index, segment) in input.segments.iter().enumerate() {
        let (source_idx, start, end) = segment.clips.first().copied().unwrap_or((0, 0.0, 0.0));
        let source = input
            .sources
            .get(source_idx)
            .cloned()
            .unwrap_or_else(|| PathBuf::from("missing.mp4"));
        let source_in = inputs
            .iter()
            .position(|path| *path == source)
            .unwrap_or(source_idx);
        let clip_len = (end - start).max(0.0);
        let trim = format!("trim=start={start}:end={end},setpts=PTS-STARTPTS");

        parts.push(format!("[{source_in}:v]{trim}[v{index}]"));

        if segment.item.keep_original {
            // Giữ tiếng gốc: âm gốc của clip, bù cho đủ độ dài.
            parts.push(format!(
                "[{source_in}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,apad,atrim=0:{clip_len},asetpts=PTS-STARTPTS[a{index}]"
            ));
        } else {
            // Lời bình: nền game hạ nhỏ + giọng TTS.
            let bed = format!("{}", input.bed_volume);
            parts.push(format!(
                "[{source_in}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,volume={bed}[bed{index}]"
            ));
            if let Some((_, tts_in)) = tts_index
                .iter()
                .find(|(id, _)| *id == segment.item.id)
            {
                parts.push(format!(
                    "[{tts_in}:a]apad,atrim=0:{clip_len},asetpts=PTS-STARTPTS[voice{index}]"
                ));
                parts.push(format!(
                    "[bed{index}][voice{index}]amix=inputs=2:duration=first:dropout_transition=0[a{index}]"
                ));
            } else {
                parts.push(format!("[bed{index}]anull[a{index}]"));
            }
        }
    }

    // Nối các đoạn (video + audio xen kẽ).
    let mut concat_inputs = String::new();
    for index in 0..input.segments.len() {
        concat_inputs.push_str(&format!("[v{index}][a{index}]"));
    }
    if !concat_inputs.is_empty() {
        parts.push(format!(
            "{concat_inputs}concat=n={}:v=1:a=1[{VIDEO_OUT}][{AUDIO_OUT}]",
            input.segments.len()
        ));
    }

    RenderPlan {
        filter_complex: parts.join(";"),
        inputs,
        output: output.to_path_buf(),
    }
}

/// Âm lượng nền dưới giọng (mặc định 0.25).
pub const DEFAULT_BED_VOLUME: f64 = 0.25;

#[cfg(test)]
#[path = "draft_render_tests.rs"]
mod draft_render_tests;
