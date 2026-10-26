//! Phụ đề ASS cho Studio — kiểu **bình thường** và **nhảy chữ** (v0.14).
//!
//! - [`kinetic_timing`]: chia thời lượng câu thành thời gian từng từ (hàm thuần).
//! - [`ass_writer`]: sinh nội dung file ASS cho libass (`ffmpeg -vf ass=`).

pub mod ass_writer;
pub mod kinetic_timing;

pub use ass_writer::{build_ass, AssStyle, SubMode};
pub use kinetic_timing::{split_tokens, time_words, TimedWord};
