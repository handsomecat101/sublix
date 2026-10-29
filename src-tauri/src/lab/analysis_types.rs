//! TSK-LAB-C3 — kiểu kết quả phân tích (`LabAnalysis` + các kiểu con).
//!
//! Kiểu con bám sát **UI hiện có** (`src/views/lab/labMock.ts`):
//! `MockVideoSource` → [`LabSource`], `MockChapter` → [`LabChapter`],
//! `MockCharacter` → [`LabCharacter`], `MockJunkSegment` → [`LabJunkSegment`].
//! (Khác ở tên cấp cao nhất: UI gọi là `junkSegments`, ta đặt `junk` theo đặc tả.)
//!
//! Vài trường **thêm** so với UI (`motivation`, `subtitleName`, `narrativeFunction`,
//! `chapterType`) — UI chưa dùng, bước nối UI sau có thể bỏ hoặc dùng.
//!
//! Logic **gộp** chương/nhân vật nằm ở [`super::analysis_merge`].

use serde::{Deserialize, Serialize};

use super::cutscene::SceneSegment;
use super::transcript::TranscriptLine;

/// Bảng màu avatar nhân vật (giống `labMock.ts`).
pub const AVATAR_COLORS: [&str; 6] = [
    "var(--ac)",
    "#7dd3fc",
    "var(--dang-txt)",
    "#c4b5fd",
    "var(--ok-txt)",
    "#f0abfc",
];

/// Một video nguồn — khớp `MockVideoSource`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabSource {
    pub id: String,
    /// Đường dẫn video nguồn trên đĩa (bước C dựng video nháp cần).
    #[serde(default)]
    pub path: String,
    pub name: String,
    pub duration_sec: f64,
    pub size_mb: f64,
    pub fps: f64,
    pub resolution: String,
    pub has_subtitles: bool,
    #[serde(default)]
    pub studio_project_name: Option<String>,
}

/// Một chương đã tóm tắt — khớp `MockChapter` (+ 2 trường thêm).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabChapter {
    pub id: i64,
    pub source_idx: usize,
    pub title: String,
    pub summary: String,
    pub time_range: String,
    pub duration_sec: f64,
    pub cutscenes_count: u32,
    pub lines_count: u32,
    pub included: bool,
    /// Loại chương do LLM gán ("cutscene", "gameplay"…).
    #[serde(default)]
    pub chapter_type: Option<String>,
    /// Chức năng dẫn chuyện do LLM gán.
    #[serde(default)]
    pub narrative_function: Option<String>,
}

/// Một nhân vật — khớp `MockCharacter` (+ 2 trường thêm).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabCharacter {
    pub id: String,
    pub name: String,
    pub role: String,
    pub lines_count: u32,
    pub avatar_color: String,
    #[serde(default)]
    pub merged_notice: Option<String>,
    /// Động cơ do LLM nêu (UI chưa dùng).
    #[serde(default)]
    pub motivation: Option<String>,
    /// Tên nhân vật xuất hiện trong phụ đề (UI chưa dùng).
    #[serde(default)]
    pub subtitle_name: Option<String>,
}

/// Một đoạn rác bị lọc — khớp `MockJunkSegment`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabJunkSegment {
    pub id: i64,
    #[serde(rename = "type")]
    pub kind: String,
    pub source_name: String,
    pub time_range: String,
    pub reason: String,
    pub restored: bool,
}

/// Kết quả phân tích 1 lần chạy (nấc A của Xưởng AI).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabAnalysis {
    /// Các video nguồn.
    pub sources: Vec<LabSource>,
    /// Bảng nhân vật (đã gộp).
    pub characters: Vec<LabCharacter>,
    /// Danh sách chương (đã gộp, đánh số lại).
    pub chapters: Vec<LabChapter>,
    /// Các đoạn rác bị lọc.
    pub junk: Vec<LabJunkSegment>,
    /// Các đoạn cảnh đã chấm điểm cutscene (0–1).
    pub scenes: Vec<SceneSegment>,
    /// Toàn bộ thoại đã nhận dạng.
    pub transcript: Vec<TranscriptLine>,
}
