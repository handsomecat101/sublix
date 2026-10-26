//! Mô hình dò chữ cho phụ đề cứng: `ch_PP-OCRv4_det_infer.onnx` (PP-OCRv4 detection, DBNet).
//!
//! - **Nguồn**: bản ONNX của RapidOCR trên Hugging Face
//!   `https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx`
//!   (gốc PaddleOCR, **Apache-2.0**). Kích thước 4 745 517 byte, SHA-256 cố định bên dưới.
//! - **Tải**: qua `model_download` sẵn có (tiến trình `model:download-progress`, kiểm kích thước +
//!   SHA-256 trước khi đổi tên, tiếp tục tải dở bằng `Range`).
//! - Lưu ở `<app>/models/hardsub/ch_PP-OCRv4_det/`.

use crate::model_download::{self, DownloadProgress, ModelFile};
use anyhow::Result;
use std::path::PathBuf;

/// Mã model trong sự kiện `model:download-progress`.
pub const MODEL_ID: &str = "hardsub-ppocrv4-det";
/// Giá trị `kind` của sự kiện tải (UI lọc theo `model_id`).
pub const KIND: &str = "hardsub";
/// Tên file model.
pub const FILENAME: &str = "ch_PP-OCRv4_det_infer.onnx";
/// Kích thước đúng của file (byte).
pub const BYTES: u64 = 4_745_517;
/// SHA-256 của file (đã kiểm khi tải từ nguồn trên).
pub const SHA256: &str = "d2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9";
const URL: &str =
    "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx";

/// Thư mục chứa model.
pub fn model_dir() -> PathBuf {
    crate::config::app_base_dir().join("models").join("hardsub").join("ch_PP-OCRv4_det")
}

/// Đường dẫn file `.onnx`.
pub fn model_path() -> PathBuf {
    model_dir().join(FILENAME)
}

/// Model đã tải đủ (đúng số byte) chưa.
pub fn is_installed() -> bool {
    std::fs::metadata(model_path()).map(|m| m.len() == BYTES).unwrap_or(false)
}

/// Tải model (có tiến trình). Đã có đủ thì trả về ngay.
pub fn download<F: FnMut(DownloadProgress)>(on_progress: &mut F) -> Result<()> {
    let file = ModelFile::new(URL, FILENAME, BYTES).with_sha256(SHA256);
    model_download::download_files(MODEL_ID, KIND, &model_dir(), &[file], on_progress)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spec_is_consistent() {
        assert_eq!(SHA256.len(), 64);
        assert!(model_path().ends_with(FILENAME));
        assert!(URL.ends_with(FILENAME));
    }
}
