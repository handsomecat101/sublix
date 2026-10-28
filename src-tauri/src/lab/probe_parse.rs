//! TSK-LAB-C2 — **parser thuần** đầu ra ffmpeg của bước đo đặc trưng cảnh.
//!
//! Tách khỏi `probe.rs` (file chạy tiến trình) để mỗi file < 300 dòng; toàn bộ hàm ở đây
//! là **hàm thuần trên chuỗi** ⇒ test bằng đầu ra ffmpeg thật đã lưu trong `fixtures/`.
//!
//! Ba nguồn dữ liệu của **một lượt ffmpeg** (xem [`super::probe`]):
//!
//! | Nguồn | Ở đâu | Dùng để |
//! |---|---|---|
//! | `metadata=print:file=…` (`frame:` / `lavfi.scd.score` / `lavfi.cropdetect.w,h`) | tệp | mốc cắt cảnh + dải đen |
//! | `silencedetect` (log stderr) | stderr | khoảng im lặng |
//! | `-progress pipe:2` (`out_time_us=…`) | stderr | % tiến độ |
//!
//! Ghi chú thực đo (ffmpeg 9.0.2, 2026-10-28):
//! - `cropdetect` chỉ xuất metadata từ **khung thứ 3** trở đi (cần vài khung để ổn định)
//!   ⇒ ~1 s đầu video chưa có dữ liệu dải đen; các khung đó bị **bỏ qua**, không coi là
//!   "không có dải đen" (xem [`letterbox_ranges`]).
//! - `scdet` xuất `score` **0–100** cho *mọi* khung (không phụ thuộc ngưỡng `t`) ⇒ ngưỡng
//!   cắt cảnh được áp trong Rust ([`scene_cuts`]) để dễ đổi mà không phải chạy lại ffmpeg.
//! - Khi video hết mà vẫn đang im lặng, ffmpeg **không** in `silence_end` ⇒ khoảng cuối
//!   được đóng bằng thời lượng video ([`parse_silence`]).

use serde::{Deserialize, Serialize};

/// Tỉ lệ khung hình còn lại dưới mức này ⇒ coi là có dải đen (2 % chống nhiễu nén).
const LETTERBOX_EDGE: f64 = 0.97;

/// Một khoảng có **dải đen** (letterbox/pillarbox) — dấu hiệu cutscene điện ảnh.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LetterboxRange {
    pub start: f64,
    pub end: f64,
    /// Phần khung hình còn nhìn thấy (0–1): 1.0 = không dải đen, 0.75 = 2.39:1 trong 16:9.
    pub visible_ratio: f64,
}

/// Một khoảng **im lặng** (không có thoại/tiếng đáng kể).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SilenceRange {
    pub start: f64,
    pub end: f64,
}

/// Kết quả đo đặc trưng của **một** video nguồn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoFeatures {
    /// Thời lượng video (giây).
    pub duration: f64,
    /// Video có luồng âm thanh không (không có ⇒ `silence` luôn rỗng).
    pub has_audio: bool,
    /// Mốc cắt cảnh (giây), đã sắp xếp.
    pub cuts: Vec<f64>,
    /// Khoảng có dải đen.
    pub letterbox: Vec<LetterboxRange>,
    /// Khoảng im lặng.
    pub silence: Vec<SilenceRange>,
    /// Số khung đã lấy mẫu (để chẩn đoán).
    pub frames: usize,
    /// Thời gian chạy ffmpeg (ms).
    pub elapsed_ms: u64,
}

/// Một khung đã lấy mẫu trong tệp metadata.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SampleFrame {
    /// `pts_time` (giây).
    pub time: f64,
    /// Điểm đổi cảnh `lavfi.scd.score` (0–100).
    pub scene_score: Option<f64>,
    /// Vùng nhìn thấy sau `cropdetect` (w, h) tính theo pixel khung đã thu nhỏ.
    pub visible: Option<(u32, u32)>,
}

/// Đọc tệp `metadata=print` thành danh sách khung.
///
/// Mỗi khung bắt đầu bằng dòng `frame:N    pts:X    pts_time:T`; các dòng `key=value`
/// theo sau thuộc về khung đó. Dòng lạ bị bỏ qua (parser chịu được log lẫn vào).
pub fn parse_metadata(text: &str) -> Vec<SampleFrame> {
    let mut frames: Vec<SampleFrame> = Vec::new();
    let mut current: Option<SampleFrame> = None;

    for raw in text.lines() {
        let line = raw.trim();
        if let Some(rest) = line.strip_prefix("frame:") {
            if let Some(frame) = current.take() {
                frames.push(frame);
            }
            current = parse_frame_time(rest).map(|time| SampleFrame {
                time,
                scene_score: None,
                visible: None,
            });
            continue;
        }
        let Some(frame) = current.as_mut() else {
            continue;
        };
        if let Some(value) = line.strip_prefix("lavfi.scd.score=") {
            frame.scene_score = value.trim().parse().ok();
        } else if let Some(value) = line.strip_prefix("lavfi.cropdetect.w=") {
            if let Ok(width) = value.trim().parse::<u32>() {
                frame.visible = Some((width, 0));
            }
        } else if let Some(value) = line.strip_prefix("lavfi.cropdetect.h=") {
            if let (Ok(height), Some((width, _))) = (value.trim().parse::<u32>(), frame.visible) {
                frame.visible = Some((width, height));
            }
        }
    }
    if let Some(frame) = current {
        frames.push(frame);
    }
    frames
}

fn parse_frame_time(rest: &str) -> Option<f64> {
    let key = "pts_time:";
    let index = rest.find(key)?;
    rest[index + key.len()..]
        .split_whitespace()
        .next()?
        .parse()
        .ok()
}

/// Đọc các dòng `silencedetect` trong stderr. `duration` để đóng khoảng im lặng cuối.
pub fn parse_silence(stderr: &str, duration: f64) -> Vec<SilenceRange> {
    let mut ranges: Vec<SilenceRange> = Vec::new();
    let mut open: Option<f64> = None;

    for line in stderr.lines() {
        if let Some(start) = value_after(line, "silence_start:") {
            let start = start.max(0.0);
            if let Some(previous) = open.replace(start) {
                if start > previous {
                    ranges.push(SilenceRange {
                        start: previous,
                        end: start,
                    });
                }
            }
        } else if let Some(end) = value_after(line, "silence_end:") {
            if let Some(start) = open.take() {
                if end > start {
                    ranges.push(SilenceRange {
                        start,
                        end: end.min(duration.max(end)),
                    });
                }
            }
        }
    }
    if let Some(start) = open {
        if duration > start {
            ranges.push(SilenceRange {
                start,
                end: duration,
            });
        }
    }
    ranges
}

/// Lấy số đầu tiên sau `key` trong một dòng log (`silence_start: 1.2` ⇒ `1.2`).
fn value_after(line: &str, key: &str) -> Option<f64> {
    let (_, rest) = line.split_once(key)?;
    rest.trim_start()
        .split(|c: char| c.is_whitespace() || c == '|')
        .next()?
        .parse()
        .ok()
}

/// Đọc `out_time_us=…` của `-progress` ⇒ giây đã xử lý.
pub fn parse_progress(line: &str) -> Option<f64> {
    let value = line.trim().strip_prefix("out_time_us=")?;
    let micros: i64 = value.trim().parse().ok()?;
    (micros >= 0).then_some(micros as f64 / 1_000_000.0)
}

/// Mốc cắt cảnh = khung có `score/100 ≥ threshold` (`threshold` 0–1, vd 0.12 = 12 %).
pub fn scene_cuts(frames: &[SampleFrame], threshold: f64) -> Vec<f64> {
    let mut cuts: Vec<f64> = frames
        .iter()
        .filter_map(|frame| {
            let score = frame.scene_score? / 100.0;
            (frame.time > 0.0 && score >= threshold).then_some(frame.time)
        })
        .collect();
    cuts.sort_by(f64::total_cmp);
    cuts.dedup_by(|a, b| (*a - *b).abs() < 0.05);
    cuts
}

/// Gộp các khung có dải đen thành khoảng; tỉ lệ nhìn thấy là trung bình có trọng số thời gian.
///
/// `frame_w`/`frame_h` = kích thước khung **đã thu nhỏ** (sau `scale`), đúng hệ toạ độ của
/// `cropdetect`. Khung chưa có metadata `cropdetect` bị bỏ qua (không tính là "không dải đen").
pub fn letterbox_ranges(
    frames: &[SampleFrame],
    frame_w: u32,
    frame_h: u32,
    duration: f64,
) -> Vec<LetterboxRange> {
    if frame_w == 0 || frame_h == 0 || duration <= 0.0 {
        return Vec::new();
    }
    let samples: Vec<(f64, f64)> = frames
        .iter()
        .filter_map(|frame| {
            let (w, h) = frame.visible.filter(|(w, h)| *w > 0 && *h > 0)?;
            let ratio = (f64::from(h) / f64::from(frame_h)).min(f64::from(w) / f64::from(frame_w));
            Some((frame.time, ratio.clamp(0.0, 1.0)))
        })
        .collect();

    let mut ranges: Vec<LetterboxRange> = Vec::new();
    for (index, (time, ratio)) in samples.iter().enumerate() {
        let end = samples
            .get(index + 1)
            .map(|(next, _)| *next)
            .unwrap_or(duration)
            .min(duration);
        if *ratio >= LETTERBOX_EDGE || end <= *time {
            continue;
        }
        match ranges.last_mut() {
            Some(last) if (last.end - time).abs() < 1e-6 => {
                let old = last.end - last.start;
                let new = end - time;
                if old + new > 0.0 {
                    last.visible_ratio = (last.visible_ratio * old + ratio * new) / (old + new);
                }
                last.end = end;
            }
            _ => ranges.push(LetterboxRange {
                start: *time,
                end,
                visible_ratio: *ratio,
            }),
        }
    }
    ranges
}

/// Ghép 3 bước trên thành [`VideoFeatures`] của một video.
pub fn video_features(
    frames: &[SampleFrame],
    stderr: &str,
    duration: f64,
    frame_w: u32,
    frame_h: u32,
    scene_threshold: f64,
) -> VideoFeatures {
    VideoFeatures {
        duration,
        has_audio: stderr.contains("Audio:"),
        cuts: scene_cuts(frames, scene_threshold),
        letterbox: letterbox_ranges(frames, frame_w, frame_h, duration),
        silence: parse_silence(stderr, duration),
        frames: frames.len(),
        elapsed_ms: 0,
    }
}
