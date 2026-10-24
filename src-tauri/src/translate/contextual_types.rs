//! Kiểu dữ liệu cho dịch kịch bản theo ngữ cảnh (`translate::contextual`).

use serde::{Deserialize, Serialize};

/// 1 dòng thoại trong kịch bản.
///
/// `rename_all = "camelCase"`: Tauri chỉ đổi tên **tham số cấp cao nhất** sang camelCase,
/// các field lồng nhau phải tự khai. Nhờ đây, phía JS dùng `speakerId` / `speakerName`.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptLine {
    pub id: String,
    pub speaker_id: String,
    #[serde(default)]
    pub speaker_name: Option<String>,
    pub text: String,
    #[serde(default)]
    pub start: f64,
    #[serde(default)]
    pub end: f64,
}

impl ScriptLine {
    /// Thời lượng (giây) của câu.
    pub fn duration(&self) -> f64 {
        (self.end - self.start).max(0.0)
    }
}

/// Kết quả dịch 1 dòng.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextualLine {
    pub id: String,
    pub translated: String,
    pub failed: bool,
    /// Câu này **vi phạm** bảng thuật ngữ / xưng hô đã duyệt (UI tô vàng).
    ///
    /// Kiểm tra tất định bằng `translate::glossary_check` — không gọi mạng.
    #[serde(default)]
    pub glossary_violation: bool,
    /// Mô tả vi phạm (ví dụ: `gọi "ngươi" thay vì "anh"`).
    #[serde(default)]
    pub glossary_violation_reason: Option<String>,
}

/// Nhân vật trong kịch bản (do LLM trích xuất ở lượt 1).
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Character {
    #[serde(default)]
    pub speaker_id: String,
    #[serde(default)]
    pub ten: String,
    #[serde(default)]
    pub gioi_tinh_doan: String,
    #[serde(default)]
    pub vai_tro: String,
}

/// Quy tắc xưng hô giữa hai nhân vật.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct PronounRule {
    /// Cặp đại từ dùng khi nói với nhau, ví dụ "anh/em".
    #[serde(default)]
    pub tu: String,
    /// Người bị xưng hô.
    #[serde(default)]
    pub den: String,
    /// Từ để gọi người kia.
    #[serde(default)]
    pub goi_la: String,
    /// Từ để tự xưng.
    #[serde(default)]
    pub xung_la: String,
}

/// Thuật ngữ cần dịch nhất quán.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct GlossaryTerm {
    #[serde(default)]
    pub goc: String,
    #[serde(default)]
    pub dich: String,
}

/// Bản tham chiếu do lượt 1 ("đọc hiểu") trích xuất.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ScriptReference {
    #[serde(default)]
    pub tom_tat: String,
    #[serde(default)]
    pub nhan_vat: Vec<Character>,
    #[serde(default)]
    pub xung_ho: Vec<PronounRule>,
    #[serde(default)]
    pub thuat_ngu: Vec<GlossaryTerm>,
    #[serde(default)]
    pub giong_dieu: String,
}
