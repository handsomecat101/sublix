//! TSK-V014-HARDSUB-BAND — test cho lõi dò dải phụ đề cứng.
//!
//! Test **thuần** (dữ liệu giả lập, không cần model, không cần ffmpeg).
//! Chạy: `cargo test --lib hardsub`

use super::*;

/// Khung hình dùng cho toàn bộ test.
const FRAME_W: u32 = 1920;
const FRAME_H: u32 = 1080;

/// 1 khung hình + hộp chữ.
fn frame(t: f64, boxes: Vec<TextBox>) -> FrameBoxes {
    FrameBoxes { t, boxes }
}

/// Hộp chữ phụ đề ổn định ở đáy khung (y=960, h=40 ⇒ mép dưới 1000).
fn bottom_sub() -> TextBox {
    TextBox::new(200.0, 960.0, 1000.0, 40.0, 0.9)
}

/// Hộp chữ phụ đề ở trên khung (y=40, h=40 ⇒ mép dưới 80).
fn top_sub() -> TextBox {
    TextBox::new(200.0, 40.0, 1000.0, 40.0, 0.9)
}

/// Logo góc trên-trái (nằm ngoài vùng Bottom).
fn logo() -> TextBox {
    TextBox::new(40.0, 20.0, 160.0, 30.0, 0.95)
}

/// Nhiễu nhỏ ở nửa dưới (hộp vuông nhỏ ⇒ bị loại).
fn tiny_noise() -> TextBox {
    TextBox::new(900.0, 600.0, 40.0, 10.0, 0.9)
}

/// Nhiễu dọc ở nửa dưới (w < 1.5·h ⇒ bị loại).
fn vertical_noise() -> TextBox {
    TextBox::new(1500.0, 600.0, 20.0, 60.0, 0.9)
}

#[test]
fn hardsub_khong_co_hoi_thi_khong_co_dai() {
    let frames = vec![frame(0.0, vec![]), frame(1.0, vec![]), frame(2.0, vec![])];
    let res = detect_band(&frames, FRAME_W, FRAME_H, &BandOptions::default());

    assert!(res.band.is_none(), "không có hộp nào ⇒ không có dải");
    assert!(res.spans.is_empty(), "không có hộp nào ⇒ không có khoảng thời gian");
    assert_eq!(res.frames_with_text, 0);
    assert_eq!(res.frames_total, 3);
}

#[test]
fn hardsub_duoi_on_dinh_thi_dai_dung() {
    // 10 khung, mỗi khung có đúng 1 hộp phụ đề ở đáy.
    let frames: Vec<FrameBoxes> = (0..10)
        .map(|i| frame(i as f64, vec![bottom_sub()]))
        .collect();
    let res = detect_band(&frames, FRAME_W, FRAME_H, &BandOptions::default());

    let band = res.band.expect("phải tìm thấy dải");
    // mép trên 960, mép dưới 1000 ⇒ cao 40, nới 25% = 10 mỗi phía.
    assert_eq!(band.y, 950, "mép trên dải = 960 − 10");
    assert_eq!(band.h, 60, "chiều cao dải = 40 + 2×10");
    assert_eq!(band.x, 0, "mặc định cả bề ngang");
    assert_eq!(band.w, FRAME_W, "mặc định cả bề ngang");
    assert_eq!(res.frames_with_text, 10);
    assert_eq!(res.frames_total, 10);
    // 10 khung cách nhau 1 s ⇒ gộp thành 1 khoảng [0 − 0.5 → 0, 9 + 0.5].
    assert_eq!(res.spans, vec![(0.0, 9.5)]);
}

#[test]
fn hardsub_logo_goc_tren_va_nhieu_khong_anh_huong_dai() {
    // 10 khung: 9 khung sub, 1 khung sub + nhiễu dọc.
    let mut frames: Vec<FrameBoxes> = (0..10)
        .map(|i| frame(i as f64, vec![bottom_sub(), logo()]))
        .collect();
    frames[5].boxes.push(tiny_noise());
    frames[6].boxes.push(vertical_noise());

    let res = detect_band(&frames, FRAME_W, FRAME_H, &BandOptions::default());
    let band = res.band.expect("phải tìm thấy dải");
    assert_eq!(
        (band.y, band.h),
        (950, 60),
        "logo + nhiễu KHÔNG được đổi dải"
    );
    assert_eq!(res.frames_with_text, 10, "mọi khung đều còn hộp phụ đề");

    // Chỉ có logo (không có sub) ⇒ không phải khung "có chữ" ⇒ không có dải.
    let only_logo: Vec<FrameBoxes> = (0..10).map(|i| frame(i as f64, vec![logo()])).collect();
    let res2 = detect_band(&only_logo, FRAME_W, FRAME_H, &BandOptions::default());
    assert!(res2.band.is_none(), "logo ở nửa trên không được tính là phụ đề");
    assert_eq!(res2.frames_with_text, 0);

    // Chỉ có nhiễu nhỏ / nhiễu dọc ⇒ cũng không phải chữ phụ đề.
    let only_noise: Vec<FrameBoxes> = (0..10)
        .map(|i| frame(i as f64, vec![tiny_noise(), vertical_noise()]))
        .collect();
    let res3 = detect_band(&only_noise, FRAME_W, FRAME_H, &BandOptions::default());
    assert!(res3.band.is_none(), "nhiễu không được tính là phụ đề");
    assert_eq!(res3.frames_with_text, 0);
}

#[test]
fn hardsub_sub_o_tren_dung_region_top() {
    let frames: Vec<FrameBoxes> = (0..10).map(|i| frame(i as f64, vec![top_sub()])).collect();

    let opt = BandOptions {
        region: Region::Top,
        ..BandOptions::default()
    };
    let res = detect_band(&frames, FRAME_W, FRAME_H, &opt);
    let band = res.band.expect("Region::Top phải tìm thấy dải ở trên");
    assert_eq!((band.y, band.h), (30, 60), "mép trên 40, mép dưới 80, nới 10");
    assert_eq!(res.frames_with_text, 10);

    // Cùng dữ liệu nhưng vùng Bottom ⇒ không có chữ ở nửa dưới ⇒ không có dải.
    let res2 = detect_band(&frames, FRAME_W, FRAME_H, &BandOptions::default());
    assert!(res2.band.is_none(), "Region::Bottom không thấy sub ở trên");
    assert_eq!(res2.frames_with_text, 0);
}

#[test]
fn hardsub_khoang_ngat_1s_duoc_noi_3s_khong_noi() {
    // 7 khung cách nhau 1 s.
    let mk = |text_at: &[f64]| -> Vec<FrameBoxes> {
        (0..7)
            .map(|i| {
                let t = i as f64;
                let boxes = if text_at.contains(&t) {
                    vec![bottom_sub()]
                } else {
                    vec![]
                };
                frame(t, boxes)
            })
            .collect()
    };

    // Khe 1 s (t=1 → t=2) ⇒ nối thành 1 khoảng.
    let res1 = detect_band(&mk(&[0.0, 1.0, 2.0, 3.0]), FRAME_W, FRAME_H, &BandOptions::default());
    assert_eq!(res1.spans.len(), 1, "khe 1 s ≤ 1.5 s ⇒ phải nối");
    assert_eq!(res1.spans, vec![(0.0, 3.5)]);
    assert_eq!(res1.frames_with_text, 4);

    // Khe 3 s (t=1 → t=4) ⇒ KHÔNG nối.
    let res2 = detect_band(&mk(&[0.0, 1.0, 4.0, 5.0]), FRAME_W, FRAME_H, &BandOptions::default());
    assert_eq!(res2.spans.len(), 2, "khe 3 s > 1.5 s ⇒ không nối");
    assert_eq!(res2.spans, vec![(0.0, 1.5), (3.5, 5.5)]);

    // Ranh giới: khe đúng 1.5 s ⇒ nối; khe 1.6 s ⇒ không nối.
    let frames_exact: Vec<FrameBoxes> = vec![
        frame(0.0, vec![bottom_sub()]),
        frame(1.0, vec![bottom_sub()]),
        frame(2.5, vec![bottom_sub()]),
        frame(3.5, vec![bottom_sub()]),
        frame(5.0, vec![]),
    ];
    let res3 = detect_band(&frames_exact, FRAME_W, FRAME_H, &BandOptions::default());
    assert_eq!(res3.spans, vec![(0.0, 4.0)], "khe = 1.5 s (≤) ⇒ nối");

    let frames_over: Vec<FrameBoxes> = vec![
        frame(0.0, vec![bottom_sub()]),
        frame(1.0, vec![bottom_sub()]),
        frame(2.6, vec![bottom_sub()]),
        frame(3.6, vec![bottom_sub()]),
        frame(5.0, vec![]),
    ];
    let res4 = detect_band(&frames_over, FRAME_W, FRAME_H, &BandOptions::default());
    assert_eq!(res4.spans, vec![(0.0, 1.5), (2.1, 4.1)], "khe = 1.6 s (> 1.5) ⇒ tách");
}

#[test]
fn hardsub_ti_le_khung_co_chu_thap_thi_khong_co_dai() {
    // 10 khung, chỉ 1 khung có chữ ⇒ 10 % < 15 % ⇒ không có phụ đề cứng.
    let mut frames: Vec<FrameBoxes> = (0..10).map(|i| frame(i as f64, vec![])).collect();
    frames[3].boxes = vec![bottom_sub()];

    let res = detect_band(&frames, FRAME_W, FRAME_H, &BandOptions::default());
    assert!(res.band.is_none(), "tỉ lệ khung có chữ thấp ⇒ không có dải");
    assert_eq!(res.frames_with_text, 1);
    assert_eq!(res.frames_total, 10);
    // spans vẫn được tính (caller tự quyết định dùng).
    assert_eq!(res.spans, vec![(2.5, 3.5)]);
}

#[test]
fn hardsub_dai_khong_vuot_khung() {
    // Hộp sát mép dưới khung (y=1050, h=30 ⇒ mép dưới = 1080 = mép khung).
    let frames: Vec<FrameBoxes> = (0..10)
        .map(|i| frame(i as f64, vec![TextBox::new(200.0, 1050.0, 1000.0, 30.0, 0.9)]))
        .collect();
    let res = detect_band(&frames, FRAME_W, FRAME_H, &BandOptions::default());
    let band = res.band.expect("phải tìm thấy dải");
    assert!(
        band.y + band.h <= FRAME_H,
        "dải không được vượt khung: y={} h={}",
        band.y,
        band.h
    );
    assert!(band.y <= 1050, "dải phải phủ được hộp chữ");
    assert!(band.y + band.h >= 1080, "dải phải phủ hết mép dưới của hộp");

    // Hộp sát mép trên (Region::Any) ⇒ dải bị nới ra ngoài trên ⇒ phải kẹp về 0.
    let frames_top: Vec<FrameBoxes> = (0..10)
        .map(|i| frame(i as f64, vec![TextBox::new(200.0, 0.0, 1000.0, 30.0, 0.9)]))
        .collect();
    let opt = BandOptions {
        region: Region::Any,
        ..BandOptions::default()
    };
    let res2 = detect_band(&frames_top, FRAME_W, FRAME_H, &opt);
    let band2 = res2.band.expect("phải tìm thấy dải");
    assert_eq!(band2.y, 0, "dải bị kẹp về mép trên khung");
    assert!(band2.y + band2.h <= FRAME_H);
}
