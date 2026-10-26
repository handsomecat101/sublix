//! Phụ đề ASS cho Studio — kiểu **bình thường** và **nhảy chữ** (v0.14).
//!
//! - [`kinetic_timing`]: chia thời lượng câu thành thời gian từng từ (hàm thuần).
//! - [`ass_effects`]: dựng chữ cho 3 mẫu nhảy chữ (Vàng nảy / Karaoke xanh / Hiện dần).
//! - [`ass_writer`]: sinh nội dung file ASS cho libass (`ffmpeg -vf ass=`).

pub mod ass_effects;
pub mod ass_style;
pub mod ass_writer;
pub mod kinetic_timing;

pub use ass_effects::{highlight_line, karaoke_line};
pub use ass_style::{AssStyle, KineticPreset, SubMode, FONT_BODY, FONT_DISPLAY};
pub use ass_writer::build_ass;
pub use kinetic_timing::{split_tokens, time_words, TimedWord};
