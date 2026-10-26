//! Test cho `ass_writer`: header, Preset §4.12, escape, giờ, band, font thật.

use super::{build_ass, AssStyle, SubMode, FONT_BODY};
use crate::subtitles::kinetic_timing::total_cs;

fn one(text: &str, start: f64, end: f64) -> Vec<(f64, f64, String)> {
    vec![(start, end, text.to_string())]
}

fn style_line(ass: &str) -> &str {
    ass.lines()
        .find(|line| line.starts_with("Style: Default,"))
        .expect("phải có dòng Style")
}

fn dialogue_lines(ass: &str) -> Vec<&str> {
    ass.lines()
        .filter(|line| line.starts_with("Dialogue: "))
        .collect()
}

/// Tổng các giá trị `\k` / `\kf` trong nội dung ASS.
fn karaoke_sum(ass: &str) -> u32 {
    let mut sum = 0u32;
    let mut rest = ass;
    while let Some(start) = rest.find("{\\k") {
        let after = &rest[start + 3..];
        let digits_start = usize::from(after.starts_with('f'));
        let digits = &after[digits_start..];
        let end = digits.find('}').expect("thẻ \\k phải có } đóng");
        sum += digits[..end].parse::<u32>().expect("\\k phải là số");
        rest = &digits[end + 1..];
    }
    sum
}

#[test]
fn header_va_playres_dung_kich_thuoc_video() {
    let ass = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Normal, &AssStyle::normal(), 1920, 1080, None);
    assert!(ass.starts_with("[Script Info]\n"), "phải bắt đầu bằng [Script Info]");
    assert!(ass.contains("ScriptType: v4.00+"));
    assert!(ass.contains("WrapStyle: 0"), "phải tự xuống dòng (WrapStyle 0)");
    assert!(ass.contains("PlayResX: 1920"));
    assert!(ass.contains("PlayResY: 1080"));
    assert!(ass.contains("[V4+ Styles]"));
    assert!(ass.contains("[Events]"));
    assert!(ass.contains("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"));
}

#[test]
fn style_binh_thuong_dung_font_that_va_23_truong() {
    let ass = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Normal, &AssStyle::normal(), 1280, 720, None);
    let style = style_line(&ass);
    assert!(style.contains(&format!(",{FONT_BODY},")), "font: {style}");
    assert!(style.contains("&H00FFFFFF,&H00FFFFFF,&H00000000"), "màu: {style}");
    assert!(style.ends_with(",2,60,60,120,1"), "alignment/margin: {style}");
    assert_eq!(style.trim_end().split(',').count(), 23);
}

#[test]
fn gio_dung_dinh_dang_h_mm_ss_cc() {
    let ass = build_ass(&one("A", 3723.456, 3725.0), SubMode::Normal, &AssStyle::normal(), 1920, 1080, None);
    assert!(
        ass.contains("Dialogue: 0,1:02:03.46,1:02:05.00,Default,,0,0,0,,"),
        "giờ ASS sai: {}",
        dialogue_lines(&ass)[0]
    );
    let odd = build_ass(&one("A", -3.0, f64::NAN), SubMode::Normal, &AssStyle::normal(), 1920, 1080, None);
    assert!(dialogue_lines(&odd)[0].starts_with("Dialogue: 0,0:00:00.00,0:00:00.00,"));
}

#[test]
fn escape_ky_tu_dac_biet_ass() {
    let ass = build_ass(&one("a{b}\\c\nd", 0.0, 2.0), SubMode::Normal, &AssStyle::normal(), 1920, 1080, None);
    assert!(ass.contains("a\\{b\\}\\\\c\\Nd"), "escape sai: {}", dialogue_lines(&ass)[0]);
}

#[test]
fn binh_thuong_moi_cau_mot_dong_va_khong_hieu_ung() {
    let segments = vec![
        (0.0, 1.0, "Một".to_string()),
        (1.0, 2.0, "Hai".to_string()),
        (2.0, 3.0, "   ".to_string()),
    ];
    let ass = build_ass(&segments, SubMode::Normal, &AssStyle::normal(), 1920, 1080, None);
    assert_eq!(dialogue_lines(&ass).len(), 2, "câu rỗng phải bị bỏ qua");
    assert!(!ass.contains("{\\k"));
    assert!(!ass.contains("\\fscx"));
    assert!(ass.contains(",Một"));
}

#[test]
fn vang_nay_moi_tu_mot_event_va_chi_1_tu_duoc_nhan() {
    let text = "Xin chào các bạn";
    let ass = build_ass(&one(text, 0.0, 2.0), SubMode::Kinetic, &AssStyle::pop_amber(), 1920, 1080, None);
    let lines = dialogue_lines(&ass);
    assert_eq!(lines.len(), 4, "Vàng nảy: 1 event/từ");

    // Event đầu: chỉ "Xin" mang hiệu ứng vàng + phóng 118 % (50 cs ⇒ anim 200 ms).
    assert!(lines[0].contains(
        "{\\1c&H003DC8FF&\\fscx118\\fscy118\\t(0,200,\\fscx100\\fscy100)}Xin{\\1c&H00FFFFFF&\\fscx100\\fscy100} chào các bạn"
    ), "event 0 sai: {}", lines[0]);
    // Mỗi event phủ đúng thời lượng của từ đó.
    assert!(lines[0].contains("0:00:00.00,0:00:00.50"));
    assert!(lines[1].contains("0:00:00.50,0:00:01.00"));
    assert!(lines[3].contains("0:00:01.50,0:00:02.00"));
}

#[test]
fn karaoke_xanh_mot_event_moi_cau_va_tong_k_bang_thoi_luong() {
    let text = "Vậy hai cô gái làm múa khỏe thân này đang dính vào một vụ rắc rối lớn.";
    let (start, end) = (0.0, 6.48);
    let ass = build_ass(&one(text, start, end), SubMode::Kinetic, &AssStyle::karaoke_cyan(), 1920, 1080, None);
    assert_eq!(dialogue_lines(&ass).len(), 1, "Karaoke xanh: 1 event/câu");
    assert_eq!(karaoke_sum(&ass), total_cs(start, end));
    assert_eq!(karaoke_sum(&ass), 648);
    // \1c = xanh (đã đọc), \2c = trắng (chưa đọc), dùng \kf (quét mượt).
    assert!(ass.contains("{\\1c&H00FFD35F&\\2c&H00FFFFFF&}{\\kf36}Vậy {\\kf36}hai "));
    assert!(ass.contains("{\\kf72}lớn."), "từ cuối nhận phần dư");
}

#[test]
fn hien_dan_giau_tu_chua_toi_luot_va_giu_cho() {
    let ass = build_ass(&one("Xin chào các bạn", 0.0, 2.0), SubMode::Kinetic, &AssStyle::reveal(), 1920, 1080, None);
    let lines = dialogue_lines(&ass);
    assert_eq!(lines.len(), 4);

    // Event 0: "Xin" hiện dần, "chào các bạn" ẩn (vẫn nằm trong dòng ⇒ giữ chỗ).
    assert!(lines[0].contains(
        "{\\alpha&HFF&\\t(0,160,\\alpha&H00&)}Xin {\\alpha&HFF&}chào {\\alpha&HFF&}các {\\alpha&HFF&}bạn"
    ), "event 0 sai: {}", lines[0]);
    // Event 2: 2 từ đầu đã hiện (không còn \alpha trước chúng).
    assert!(lines[2].contains("Xin chào {\\alpha&HFF&\\t(0,160,\\alpha&H00&)}các {\\alpha&HFF&}bạn"));
    // Event cuối: không còn từ nào bị giấu.
    assert!(!lines[3].contains("{\\alpha&HFF&}"));
}

#[test]
fn band_dat_phu_de_vao_giua_dai() {
    let ass = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Normal, &AssStyle::normal(), 1920, 1080, Some((800, 200)));
    assert!(ass.contains("{\\an5\\pos(960,900)}"), "tâm dải y=800 h=200 ⇒ 900");

    let plain = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Normal, &AssStyle::normal(), 1920, 1080, None);
    assert!(!plain.contains("\\pos("));
    assert!(style_line(&plain).contains(",2,60,60,120,1"));

    let clamped = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Normal, &AssStyle::normal(), 1920, 1080, Some((1000, 400)));
    assert!(clamped.contains("{\\an5\\pos(960,1080)}"));
}

#[test]
fn band_ap_dung_cho_ca_mau_nhay_chu() {
    let ass = build_ass(&one("Xin chào", 0.0, 2.0), SubMode::Kinetic, &AssStyle::pop_amber(), 1280, 720, Some((500, 100)));
    let lines = dialogue_lines(&ass);
    assert_eq!(lines.len(), 2);
    for line in lines {
        assert!(line.contains("{\\an5\\pos(640,550)}"), "mọi event phải có \\pos của dải");
    }
}

/// Xuất 3 file ASS mẫu để kiểm render thật bằng ffmpeg/libass.
///
/// Chạy tay: `SUBLIX_ASS_OUT=<thư mục> cargo test --lib ghi_ass_mau -- --ignored --nocapture`
#[test]
#[ignore = "chỉ chạy khi cần kiểm render bằng ffmpeg (ghi file ra đĩa)"]
fn ghi_ass_mau_de_kiem_render() {
    let dir = std::env::var("SUBLIX_ASS_OUT").unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned());
    let segments = vec![
        (0.0, 3.2, "Thời điểm này, Heather khoảng 18 tuổi, sống ở Lawrenceville.".to_string()),
        (3.4, 6.0, "Những cô gái ấy vẫn ngồi đó, chợt lặng nghe mưa rơi rả rích suốt buổi chiều.".to_string()),
    ];
    let styles = [
        ("pop-amber", AssStyle::pop_amber()),
        ("karaoke-cyan", AssStyle::karaoke_cyan()),
        ("reveal", AssStyle::reveal()),
        ("normal", AssStyle::normal()),
    ];
    for (name, style) in styles {
        let mode = if name == "normal" { SubMode::Normal } else { SubMode::Kinetic };
        let ass = build_ass(&segments, mode, &style, 1280, 720, None);
        let path = std::path::Path::new(&dir).join(format!("v014-{name}.ass"));
        std::fs::write(&path, ass).expect("không ghi được file ASS");
        println!("ASS: {}", path.display());
    }
}
