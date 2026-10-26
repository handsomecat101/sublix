//! TSK-V014-HARDSUB-BAND — dò dải phụ đề cứng + khoảng thời gian có chữ.
//!
//! Thuật toán (đề xuất trong `docs/V0.14_PLAN.md` §2A, ghi rõ ở đây):
//!
//! 1. **Lọc hộp** (`keep_box`) — bỏ hộp không phải chữ phụ đề:
//!    - `score < min_score` ⇒ bỏ (model dò chữ không chắc).
//!    - `w ≤ 0` hoặc `h ≤ 0` ⇒ bỏ (hộp rỗng).
//!    - **hộp ngang**: `w < 1.5 · h` ⇒ bỏ (chữ phụ đề nằm ngang; loại logo vuông,
//!      watermark dọc).
//!    - **quá nhỏ**: `h < 1.5 %` chiều cao khung ⇒ bỏ (nhiễu 1–2 px).
//!    - **vùng**: `Bottom` = tâm y ở nửa dưới (`cy ≥ h_khung / 2`), `Top` = nửa
//!      trên (`cy < h_khung / 2`), `Any` = toàn khung.
//! 2. **Khung "có chữ"** = còn ≥ 1 hộp sau lọc.
//! 3. **Dải**: nếu `frames_with_text / frames_total < min_frames_ratio` (mặc định
//!    0.15) ⇒ video **không có phụ đề cứng** ⇒ `band = None`. Ngược lại lấy
//!    **phân vị 10 %** của mép trên và **phân vị 90 %** của mép dưới của mọi hộp đã
//!    lọc (phân vị ⇒ chịu được nhiễu logo / chữ lạ ở rìa), nới mỗi phía
//!    `pad_ratio` (mặc định 0.25 × chiều cao dải) rồi **kẹp trong khung hình**.
//!    - `x` / `w`: **mặc định cả bề ngang** (`x = 0`, `w = frame_w`) — phụ đề cứng
//!      thường canh giữa nhưng độ rộng không cố định; người dùng kéo chỉnh được ở
//!      UI (§2D). (Nếu sau này cần dải hẹp: lấy phân vị 10 % mép trái + 90 % mép
//!      phải, giống cách tính `y`/`h`.)
//! 4. **`spans`**: các thời điểm khung có chữ (đã sắp xếp) được gom thành nhóm liên
//!    tiếp khi khoảng cách ≤ `merge_gap_sec` (mặc định 1.5 s). Mỗi nhóm ⇒ khoảng
//!    `[t_đầu − 0.5 s, t_cuối + 0.5 s]`, kẹp `≥ 0`.
//!    - `spans` được tính **kể cả khi `band = None`** ⇒ caller tự quyết định dùng.

/// Vùng khung hình dùng để dò chữ.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Region {
    /// Nửa dưới khung — phụ đề cứng thường nằm đây (mặc định).
    #[default]
    Bottom,
    /// Nửa trên khung (phụ đề ở trên, ví dụ bản dịch phủ lên tiếng Anh).
    Top,
    /// Toàn khung.
    Any,
}

/// 1 hộp chữ đã dò được, toạ độ **pixel** trong khung hình.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TextBox {
    /// Mép trái.
    pub x: f32,
    /// Mép trên.
    pub y: f32,
    /// Bề rộng.
    pub w: f32,
    /// Chiều cao.
    pub h: f32,
    /// Độ tin cậy của model dò chữ (0..1).
    pub score: f32,
}

impl TextBox {
    /// Tạo hộp chữ (tiện cho test + cho code đọc dữ liệu từ model).
    pub fn new(x: f32, y: f32, w: f32, h: f32, score: f32) -> Self {
        Self { x, y, w, h, score }
    }
}

/// Hộp chữ của **1 khung hình** + thời điểm lấy mẫu (giây).
#[derive(Debug, Clone, PartialEq)]
pub struct FrameBoxes {
    /// Thời điểm khung hình (giây, tính từ đầu video).
    pub t: f64,
    /// Các hộp chữ tìm thấy trong khung.
    pub boxes: Vec<TextBox>,
}

/// Tuỳ chọn dò dải.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BandOptions {
    /// Vùng khung hình được xét.
    pub region: Region,
    /// Ngưỡng độ tin cậy của model (mặc định 0.5).
    pub min_score: f32,
    /// Tỉ lệ tối thiểu số khung "có chữ" để coi là có phụ đề cứng (mặc định 0.15).
    pub min_frames_ratio: f32,
    /// Khoảng cách tối đa giữa 2 nhóm khung có chữ để gộp thành 1 khoảng (mặc định 1.5 s).
    pub merge_gap_sec: f64,
    /// Phần nới mỗi phía của dải, tính theo chiều cao dải (mặc định 0.25).
    pub pad_ratio: f32,
}

impl Default for BandOptions {
    fn default() -> Self {
        Self {
            region: Region::Bottom,
            min_score: 0.5,
            min_frames_ratio: 0.15,
            merge_gap_sec: 1.5,
            pad_ratio: 0.25,
        }
    }
}

/// Dải phụ đề cứng (toạ độ **pixel** trong khung hình).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Band {
    /// Mép trên của dải.
    pub y: u32,
    /// Chiều cao của dải.
    pub h: u32,
    /// Mép trái của dải.
    pub x: u32,
    /// Bề rộng của dải.
    pub w: u32,
}

/// Kết quả dò dải phụ đề cứng.
#[derive(Debug, Clone, PartialEq)]
pub struct HardsubResult {
    /// Dải phụ đề cứng (`None` = video không có phụ đề cứng).
    pub band: Option<Band>,
    /// Các khoảng thời gian **có chữ** (giây), đã nối theo `merge_gap_sec`.
    pub spans: Vec<(f64, f64)>,
    /// Số khung hình còn chữ sau khi lọc.
    pub frames_with_text: usize,
    /// Tổng số khung hình đã xét.
    pub frames_total: usize,
}

/// Phân vị (nội suy tuyến tính) của mảng **đã sắp xếp** — `p ∈ [0, 1]`.
fn percentile(sorted: &[f32], p: f32) -> f32 {
    if sorted.is_empty() {
        return 0.0;
    }
    if sorted.len() == 1 {
        return sorted[0];
    }
    let rank = p.clamp(0.0, 1.0) * (sorted.len() - 1) as f32;
    let lo = rank.floor() as usize;
    let hi = rank.ceil() as usize;
    if lo == hi {
        return sorted[lo];
    }
    let frac = rank - lo as f32;
    sorted[lo] + (sorted[hi] - sorted[lo]) * frac
}

/// Hộp này có phải chữ phụ đề đáng giữ không?
fn keep_box(b: &TextBox, frame_h: u32, opt: &BandOptions) -> bool {
    if b.score < opt.min_score {
        return false;
    }
    if b.w <= 0.0 || b.h <= 0.0 {
        return false;
    }
    // Hộp ngang (chữ nằm ngang); logo vuông / watermark dọc bị loại.
    if b.w < 1.5 * b.h {
        return false;
    }
    // Quá nhỏ so với khung (nhiễu 1–2 px).
    if b.h < 0.015 * frame_h as f32 {
        return false;
    }
    // Vùng khung hình.
    let cy = b.y + b.h / 2.0;
    let mid = frame_h as f32 / 2.0;
    match opt.region {
        Region::Bottom => cy >= mid,
        Region::Top => cy < mid,
        Region::Any => true,
    }
}

/// Tính dải từ mép trên/dưới của các hộp đã lọc.
fn compute_band(
    tops: &[f32],
    bottoms: &[f32],
    frame_w: u32,
    frame_h: u32,
    opt: &BandOptions,
) -> Band {
    let mut t_sorted = tops.to_vec();
    t_sorted.sort_by(|a, b| a.total_cmp(b));
    let mut b_sorted = bottoms.to_vec();
    b_sorted.sort_by(|a, b| a.total_cmp(b));

    let top = percentile(&t_sorted, 0.10);
    let bottom = percentile(&b_sorted, 0.90);

    let mut y = top;
    let mut h = (bottom - top).max(0.0);
    let pad = h * opt.pad_ratio;
    y -= pad;
    h += 2.0 * pad;

    // Kẹp trong khung hình.
    if y < 0.0 {
        h += y;
        y = 0.0;
    }
    if y + h > frame_h as f32 {
        h = frame_h as f32 - y;
    }
    if h < 0.0 {
        h = 0.0;
    }

    // Làm tròn SAU khi kẹp ⇒ `y + h` không bao giờ vượt khung.
    let y_u = (y.max(0.0).round() as u32).min(frame_h);
    let h_u = (h.round().max(0.0) as u32).min(frame_h.saturating_sub(y_u));

    Band {
        y: y_u,
        h: h_u,
        // Mặc định cả bề ngang (xem doc comment đầu file).
        x: 0,
        w: frame_w,
    }
}

/// Gom các thời điểm khung có chữ thành khoảng liên tục.
fn build_spans(times: &mut Vec<f64>, merge_gap_sec: f64) -> Vec<(f64, f64)> {
    times.sort_by(|a, b| a.total_cmp(b));
    let mut spans: Vec<(f64, f64)> = Vec::new();
    let mut group: Vec<f64> = Vec::new();
    for &t in times.iter() {
        let extend = match group.last() {
            Some(&last) => t - last <= merge_gap_sec,
            None => false,
        };
        if extend {
            group.push(t);
        } else {
            if !group.is_empty() {
                spans.push(pad_span(&group));
            }
            group.clear();
            group.push(t);
        }
    }
    if !group.is_empty() {
        spans.push(pad_span(&group));
    }
    spans
}

/// Khoảng đệm ±0.5 s quanh nhóm khung có chữ (kẹp ≥ 0).
fn pad_span(group: &[f64]) -> (f64, f64) {
    let first = group.first().copied().unwrap_or(0.0);
    let last = group.last().copied().unwrap_or(first);
    ((first - 0.5).max(0.0), last + 0.5)
}

/// Dò dải phụ đề cứng + khoảng thời gian có chữ từ các hộp chữ theo thời gian.
///
/// - `frames`: hộp chữ đã dò được, mỗi phần tử = 1 khung hình + thời điểm.
/// - `frame_w` / `frame_h`: kích thước khung hình (pixel) — dùng để lọc theo tỉ lệ
///   và kẹp dải trong khung.
/// - `opt`: tuỳ chọn (xem [`BandOptions`]).
///
/// **Không bao giờ panic**: mọi phép tính đều an toàn với dữ liệu rỗng / lỗi.
pub fn detect_band(
    frames: &[FrameBoxes],
    frame_w: u32,
    frame_h: u32,
    opt: &BandOptions,
) -> HardsubResult {
    let frames_total = frames.len();
    let mut frames_with_text = 0usize;
    let mut text_times: Vec<f64> = Vec::new();
    let mut tops: Vec<f32> = Vec::new();
    let mut bottoms: Vec<f32> = Vec::new();

    for frame in frames {
        let mut kept = 0usize;
        for b in frame.boxes.iter() {
            if !keep_box(b, frame_h, opt) {
                continue;
            }
            kept += 1;
            tops.push(b.y);
            bottoms.push(b.y + b.h);
        }
        if kept == 0 {
            continue;
        }
        frames_with_text += 1;
        text_times.push(frame.t);
    }

    let ratio = if frames_total == 0 {
        0.0
    } else {
        frames_with_text as f32 / frames_total as f32
    };
    let band = if frames_total > 0 && ratio >= opt.min_frames_ratio && !tops.is_empty() {
        Some(compute_band(&tops, &bottoms, frame_w, frame_h, opt))
    } else {
        None
    };

    HardsubResult {
        band,
        spans: build_spans(&mut text_times, opt.merge_gap_sec),
        frames_with_text,
        frames_total,
    }
}

#[cfg(test)]
#[path = "band_tests.rs"]
mod band_tests;
