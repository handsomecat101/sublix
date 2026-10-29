//! TSK-LAB-C4 — **TTS thật** cho từng câu lời bình + đo thời lượng file.
//!
//! Dùng đúng hàm điều phối của luồng lồng tiếng ([`crate::dubbing::synthesize_speech`]):
//! nó tự chọn engine theo tiền tố voice id (`kokoro:`, `vietneu:`, `zerotts:`, cloud…),
//! chuẩn hoá số/ngày/giờ cho tiếng Việt — **không** viết engine mới.

use std::path::{Path, PathBuf};

use super::narration::estimate_tts_secs;
use super::recap_script::RecapItem;

/// Danh sách file TTS đã tạo: `(id mục, đường dẫn wav)`.
pub type TtsFiles = Vec<(u32, PathBuf)>;

/// Tổng hợp giọng cho mọi câu lời bình (bỏ qua đoạn giữ tiếng gốc / câu rỗng).
///
/// Trả về `(các mục đã cập nhật tts_secs, danh sách (id, file wav))`.
/// `on_progress(done, total)` được gọi sau mỗi câu.
pub fn synthesize_items(
    items: &[RecapItem],
    voice: &str,
    rate: &str,
    pitch: &str,
    work_dir: &Path,
    on_progress: &mut dyn FnMut(u32, u32),
) -> Result<(Vec<RecapItem>, TtsFiles), String> {
    let mut out: Vec<RecapItem> = items.to_vec();
    let mut files: TtsFiles = Vec::new();
    let speak: Vec<usize> = items
        .iter()
        .enumerate()
        .filter(|(_, item)| !item.keep_original && !item.narration.trim().is_empty())
        .map(|(index, _)| index)
        .collect();
    let total = speak.len().max(1);

    for (done, index) in speak.iter().enumerate() {
        let item = &items[*index];
        let path = work_dir.join(format!("lab_tts_{}.wav", item.id));
        crate::dubbing::synthesize_speech(item.narration.trim(), voice, rate, pitch, &path)
            .map_err(|err| format!("TTS câu {} thất bại: {err:#}", item.id))?;
        let secs = measure_duration(&path).unwrap_or_else(|| estimate_tts_secs(&item.narration));
        out[*index].tts_secs = Some(secs);
        files.push((item.id, path));
        on_progress((done + 1) as u32, total as u32);
    }
    Ok((out, files))
}

/// Đo thời lượng file (WAV đọc header; không phải WAV ⇒ `None`).
pub fn measure_duration(path: &Path) -> Option<f64> {
    crate::dubbing::ducking_export::wav_duration(path)
}

#[cfg(test)]
#[path = "draft_tts_tests.rs"]
mod draft_tts_tests;
