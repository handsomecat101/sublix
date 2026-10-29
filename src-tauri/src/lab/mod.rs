//! Lõi của tab "Xưởng AI" (`docs/XUONG_AI_PLAN.md` §2) — **thuần + I/O tách riêng**.
//!
//! | File | Vai trò | Task |
//! |---|---|---|
//! | [`recap_script`] | `RecapItem` / `RecapScript` + kiểm **6 luật dựng** (R1–R6) + tỷ lệ thoại gốc | C1 |
//! | [`junk_filter`] | Lọc intro/outro/quảng cáo/donate theo **từ khoá 3 ngôn ngữ** + vị trí | C1 |
//! | [`allocate`] | Khớp cảnh theo **thời lượng TTS thật** → `RecapScript` + vi phạm + câu chưa có cảnh | C1 |
//! | [`cutscene`] | Chấm điểm cutscene 0–1 từ dải đen + phụ đề cứng + mật độ thoại | C2 |
//! | [`probe`] | Chạy ffmpeg 1 lượt lấy mẫu 2 khung/giây → mốc cắt cảnh, dải đen, im lặng | C2 |
//! | [`analyze`] + `commands` | Phân tích video nguồn (STT/OCR/cảnh/rác/tóm tắt) + lệnh Tauri + sự kiện | C3 |
//! | [`narration`] / [`narration_write`] | Prompt + tách đoạn lời bình, viết lại 1 đoạn, LLM viết theo chương | C4 |
//! | [`draft_tts`] / [`draft_plan`] | TTS thật (đo `tts_secs`) / map phân tích → cảnh + rác + `allocate` + tự sửa luật | C4 |
//! | [`draft_render`] / [`draft_build`] | Đồ thị ffmpeg (nền hạ 25 % dưới giọng) / luồng dựng + huỷ | C4 |
//! | [`to_studio`] | Đổ kịch bản đã dựng → `DubbingProject` lưu cạnh video nháp | C4 |
//! | [`scenes`] / [`original`] | (nội bộ) cắt cảnh thành mẩu sạch + xếp hạng / chèn thoại gốc | C1 |
//!
//! **Chưa làm**: tầng "mất HUD" của bộ lọc cutscene (cần so ảnh — TODO cuối [`cutscene`]).
//!
//! Luồng đầy đủ: `STT/OCR → junk_filter → LLM tóm tắt chương → narration (LLM) →`
//! `TTS đo tts_secs → allocate + kiểm luật → draft_render (ffmpeg) → to_studio`.

pub mod allocate;
pub mod analysis_merge;
pub mod analysis_types;
pub mod analyze;
pub mod analyze_sources;
pub mod analyze_summary;
pub mod cache;
pub mod commands;
pub mod cutscene;
pub mod draft;
pub mod draft_build;
pub mod draft_commands;
pub mod draft_plan;
pub mod draft_render;
pub mod draft_tts;
pub mod junk_filter;
pub mod llm_json;
pub mod llm_prompt;
pub mod narration;
pub mod narration_write;
pub mod probe;
pub mod recap_script;
pub mod to_studio;
pub mod transcript;

pub(crate) mod original;
pub(crate) mod probe_parse;
pub(crate) mod scenes;
