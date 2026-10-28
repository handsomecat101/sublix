//! TSK-V014-EXPORT-BURN — ghép **đồ thị video** (làm mờ phụ đề cứng + in ASS) với
//! **đồ thị audio** (smart ducking) vào CÙNG một `-filter_complex` (hoặc file
//! `-/filter_complex <file>` khi graph quá dài — BUG-H12).
//!
//! Nguyên tắc: **không bật gì ⇒ argv y hệt cũ** (chỉ đồ thị audio, video copy
//! thẳng `0:v?`). Bật burn ⇒ thêm nhánh video và map qua nhãn `[vout]`.



use super::subtitle_burn::{build_video_burn_graph, BurnOptions};

// [TSK-V014-EXPORT-BURN] Chuẩn bị file ASS + thư mục font (tách module riêng).
pub use super::burn_ass::{fonts_dir, prepare_burn_ass, probe_video_size, write_burn_ass};

/// Nhãn đầu ra video (khi burn).
pub const VIDEO_OUT_LABEL: &str = "vout";
/// Nhãn đầu ra audio (smart ducking) — phải khớp với đồ thị audio bên ngoài.
pub const AUDIO_OUT_LABEL: &str = "final_audio";

/// Độ đục hộp đen "đè tem" (research §4.1 dùng 0.65; task V014 quy định 0.55).
pub const STAMP_OPACITY: f32 = 0.55;

/// Bán kính làm mờ theo mức: nhẹ / vừa / mạnh.
pub fn blur_radius_for(level: &str) -> u32 {
    match level.trim().to_lowercase().as_str() {
        "light" | "nhe" => 8,
        "strong" | "manh" => 25,
        // "medium" / "vua" và mọi giá trị lạ ⇒ mặc định.
        _ => 15,
    }
}

/// Tham số dựng đồ thị xuất.
pub struct ExportGraphInput<'a> {
    /// Đồ thị audio (smart ducking) — đã có nhãn đầu ra audio.
    pub audio_graph: &'a str,
    /// Tham số burn phụ đề. `None` ⇒ không burn (hành vi y hệt cũ).
    pub burn: Option<BurnOptions<'a>>,
    /// Nhãn đầu vào video (thường `0:v`).
    pub video_in: &'a str,
    /// Nhãn đầu ra video (thường `vout`).
    pub video_out: &'a str,
}

/// Kết quả dựng đồ thị.
#[derive(Debug, Clone)]
pub struct ExportGraph {
    /// Đồ thị đầy đủ cho `-filter_complex` (hoặc ghi ra file).
    pub filter_complex: String,
    /// true = phải map video qua nhãn (`-map [vout]`); false = copy thẳng `0:v?`.
    pub video_remapped: bool,
}

/// Dựng đồ thị xuất (video + audio trong cùng một chuỗi filter).
pub fn build_export_graph(input: &ExportGraphInput) -> ExportGraph {
    match &input.burn {
        // Không burn ⇒ GIỮ NGUYÊN đồ thị audio cũ (argv y hệt trước đây).
        None => ExportGraph {
            filter_complex: input.audio_graph.to_string(),
            video_remapped: false,
        },
        Some(burn) => {
            let video = build_video_burn_graph(burn, input.video_in, input.video_out);
            let audio = input.audio_graph.trim().trim_end_matches(';').trim();
            let filter_complex = if audio.is_empty() {
                video
            } else {
                format!("{video};{audio}")
            };
            ExportGraph {
                filter_complex,
                video_remapped: true,
            }
        }
    }
}

/// Kế hoạch xuất: đồ thị + **các nhãn được tạo và được map**.
///
/// [TSK-V014-EXPORT-FIX] ffmpeg báo lỗi *"Filter 'anull' has output 0 (final_audio)
/// unconnected"* khi đồ thị tạo nhãn audio mà argv **không** `-map` nhãn đó (chế độ
/// multi-track không có clip giọng, hoặc original-only). Nguyên tắc: **nhãn nào được
/// tạo trong `-/filter_complex` thì phải được `-map`, không thì đừng tạo**.
#[derive(Debug, Clone)]
pub struct ExportPlan {
    /// Đồ thị filter cho `-filter_complex` (rỗng = không có nhánh nào).
    pub filter_complex: String,
    /// Nhãn video được map (`None` = copy thẳng `0:v?`).
    pub video_label: Option<String>,
    /// Nhãn audio trộn được map (`None` = không tạo nhánh audio trong đồ thị).
    pub mixed_audio_label: Option<String>,
    /// Các nhãn mà đồ thị **tạo ra**.
    pub created_labels: Vec<String>,
    /// Các nhãn được `-map` ra trong argv.
    pub mapped_labels: Vec<String>,
    /// Có map thêm luồng audio gốc (`0:a:0?`) không (chế độ multi-track).
    pub map_original_audio: bool,
}

impl ExportPlan {
    /// Nhãn đồ thị tạo ra mà **không** được map ⇒ ffmpeg sẽ báo "unconnected".
    pub fn dangling_labels(&self) -> Vec<String> {
        self.created_labels
            .iter()
            .filter(|label| !self.mapped_labels.contains(label))
            .cloned()
            .collect()
    }
}

/// Lập kế hoạch xuất cho MỌI tổ hợp chế độ âm thanh × có/không clip giọng × burn.
///
/// - `audio_mode`: "multitrack" | "mixed" | "original".
/// - `has_speech`: có clip lồng tiếng (speech track) hay không.
/// - `burn`: tham số burn phụ đề (`None` = không burn).
pub fn plan_export(
    audio_mode: &str,
    has_speech: bool,
    burn: Option<BurnOptions>,
    video_in: &str,
    video_out: &str,
    audio_graph: &str,
) -> ExportPlan {
    let mode = audio_mode.trim().to_lowercase();
    // Nhãn audio trộn (`[final_audio]`) CHỈ được map khi: có clip giọng, hoặc chế độ
    // "mixed" (trộn nền + giọng). Ngược lại ⇒ KHÔNG tạo nhánh audio trong đồ thị.
    let map_mixed_audio = has_speech || mode == "mixed";

    let mut created_labels: Vec<String> = Vec::new();
    let mut mapped_labels: Vec<String> = Vec::new();
    let mut parts: Vec<String> = Vec::new();
    let mut video_label: Option<String> = None;
    let mut mixed_audio_label: Option<String> = None;

    let video_graph = match &burn {
        Some(b) => {
            created_labels.push(video_out.to_string());
            mapped_labels.push(video_out.to_string());
            video_label = Some(video_out.to_string());
            Some(build_video_burn_graph(b, video_in, video_out))
        }
        None => None,
    };
    if let Some(graph) = video_graph {
        parts.push(graph);
    }

    if map_mixed_audio {
        created_labels.push(AUDIO_OUT_LABEL.to_string());
        mapped_labels.push(AUDIO_OUT_LABEL.to_string());
        mixed_audio_label = Some(AUDIO_OUT_LABEL.to_string());
        let audio = audio_graph.trim().trim_end_matches(';').trim();
        if !audio.is_empty() {
            parts.push(audio.to_string());
        }
    }

    ExportPlan {
        filter_complex: parts.join(";"),
        video_label,
        mixed_audio_label,
        created_labels,
        mapped_labels,
        // Multi-track: map thêm luồng audio gốc (Track 1 = Tiếng gốc).
        map_original_audio: mode == "multitrack" && has_speech,
    }
}

#[cfg(test)]
#[path = "export_video_graph_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "export_video_graph_modes_tests.rs"]
mod modes_tests;

#[cfg(test)]
#[path = "export_video_graph_ffmpeg_tests.rs"]
mod ffmpeg_tests;

#[cfg(test)]
#[path = "export_video_graph_png_tests.rs"]
mod png_tests;
