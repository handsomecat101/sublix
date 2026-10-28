//! TSK-LAB-CORE (C1) — lõi **thuần** của tab "Xưởng AI" (`docs/XUONG_AI_PLAN.md` §2).
//!
//! Phạm vi C1: **chỉ logic** — không gọi mạng, không LLM, không ffmpeg, không TTS.
//! Nhờ vậy toàn bộ phần dễ sai (luật dựng, lọc rác, khớp cảnh theo thời lượng TTS) test
//! được bằng dữ liệu giả lập, không cần video.
//!
//! | File | Vai trò |
//! |---|---|
//! | [`recap_script`] | `RecapItem` / `RecapScript` + kiểm **6 luật dựng** (R1–R6) + tỷ lệ thoại gốc |
//! | [`junk_filter`] | Lọc intro/outro/quảng cáo/donate theo **từ khoá 3 ngôn ngữ** + vị trí |
//! | [`allocate`] | Khớp cảnh theo **thời lượng TTS thật** → `RecapScript` + vi phạm + câu chưa có cảnh |
//! | [`scenes`] | (nội bộ) cắt cảnh thành mẩu sạch + xếp hạng chọn mẩu / ghép mẩu |
//! | [`original`] | (nội bộ) chèn đoạn giữ thoại gốc đạt tỷ lệ người dùng chọn |
//!
//! **Ngoài phạm vi C1** (các task sau): `cutscene.rs` (chấm điểm cutscene bằng ffmpeg),
//! `prompts/` (prompt NarratoAI Việt hoá), `to_studio.rs` (đổ sang dự án Studio), các
//! lệnh Tauri `lab_*`.
//!
//! Luồng dùng dự kiến (task C4):
//! `STT/OCR → junk_filter::find_junk → LLM tách câu → TTS đo tts_secs →`
//! `allocate::allocate → (UI duyệt) → to_studio`.

pub mod allocate;
pub mod junk_filter;
pub mod recap_script;

pub(crate) mod original;
pub(crate) mod scenes;
