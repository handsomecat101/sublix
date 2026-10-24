use super::*;

fn n(s: &str) -> String {
    normalize_vi(s)
}

#[test]
fn doc_so_nguyen_co_ban() {
    assert_eq!(read_integer("0"), "không");
    assert_eq!(read_integer("5"), "năm");
    assert_eq!(read_integer("10"), "mười");
    assert_eq!(read_integer("11"), "mười một");
    assert_eq!(read_integer("15"), "mười lăm");
}

#[test]
fn doc_so_hai_chu_so_mot_lam_tu() {
    assert_eq!(read_integer("21"), "hai mươi mốt");
    assert_eq!(read_integer("24"), "hai mươi tư");
    assert_eq!(read_integer("25"), "hai mươi lăm");
    assert_eq!(read_integer("99"), "chín mươi chín");
}

#[test]
fn doc_so_tram_linh() {
    assert_eq!(read_integer("100"), "một trăm");
    assert_eq!(read_integer("105"), "một trăm linh năm");
    assert_eq!(read_integer("110"), "một trăm mười");
    assert_eq!(read_integer("999"), "chín trăm chín mươi chín");
}

#[test]
fn doc_so_nghin_trieu_ty() {
    assert_eq!(read_integer("1000"), "một nghìn");
    assert_eq!(read_integer("1005"), "một nghìn không trăm linh năm");
    assert_eq!(read_integer("1050"), "một nghìn không trăm năm mươi");
    assert_eq!(read_integer("100000"), "một trăm nghìn");
    assert_eq!(read_integer("1000000"), "một triệu");
    assert_eq!(read_integer("3500000000"), "ba tỷ năm trăm triệu");
}

#[test]
fn doc_nam() {
    assert_eq!(read_integer("2026"), "hai nghìn không trăm hai mươi sáu");
    assert_eq!(read_integer("1999"), "một nghìn chín trăm chín mươi chín");
}

#[test]
fn ngay_thang_nam_co_chu_ngay() {
    assert_eq!(
        n("Ngày 24/10/2026, đội"),
        "Ngày hai mươi tư tháng mười năm hai nghìn không trăm hai mươi sáu, đội"
    );
}

#[test]
fn ngay_thang_nam_khong_co_chu_ngay_tu_them() {
    assert_eq!(n("24/10/2026"), "ngày hai mươi tư tháng mười năm hai nghìn không trăm hai mươi sáu");
    assert_eq!(n("01-02-2025"), "ngày một tháng hai năm hai nghìn không trăm hai mươi lăm");
}

#[test]
fn thang_nam_dang_so() {
    assert_eq!(n("10/2026"), "tháng mười năm hai nghìn không trăm hai mươi sáu");
}

#[test]
fn ngay_thang_viet_chu_nhung_so() {
    assert_eq!(
        n("ngày 24 tháng 10 năm 2026"),
        "ngày hai mươi tư tháng mười năm hai nghìn không trăm hai mươi sáu"
    );
    assert_eq!(n("tháng 4"), "tháng tư");
    assert_eq!(n("tháng 12"), "tháng mười hai");
}

#[test]
fn cau_bench_s3_ty_so_va_ngay() {
    assert_eq!(
        n("Ngày 24 tháng 10 năm 2026, đội tuyển Việt Nam thắng 3-1 trước Thái Lan tại sân Mỹ Đình."),
        "Ngày hai mươi tư tháng mười năm hai nghìn không trăm hai mươi sáu, đội tuyển Việt Nam thắng ba - một trước Thái Lan tại sân Mỹ Đình."
    );
}

#[test]
fn ty_so_va_khoang() {
    assert_eq!(n("thắng 2-0"), "thắng hai - không");
    assert_eq!(n("từ 10-20 người"), "từ mười đến hai mươi người");
}

#[test]
fn phan_tram_va_thap_phan() {
    assert_eq!(n("50%"), "năm mươi phần trăm");
    assert_eq!(n("tăng 1,5%"), "tăng một phẩy năm phần trăm");
    assert_eq!(n("3,14"), "ba phẩy mười bốn");
    assert_eq!(n("0,05"), "không phẩy không năm");
    assert_eq!(n("2.5"), "hai phẩy năm");
}

#[test]
fn so_co_dau_cham_nghin() {
    assert_eq!(n("1.234.567"), "một triệu hai trăm ba mươi tư nghìn năm trăm sáu mươi bảy");
    assert_eq!(n("1.500"), "một nghìn năm trăm");
    assert_eq!(n("1,000,000"), "một triệu");
}

#[test]
fn tien_te() {
    assert_eq!(n("100.000đ"), "một trăm nghìn đồng");
    assert_eq!(n("1.000.000 VND"), "một triệu đồng");
    assert_eq!(n("$50"), "năm mươi đô la");
    assert_eq!(n("20 USD"), "hai mươi đô la Mỹ");
}

#[test]
fn gio_phut_giay() {
    assert_eq!(n("14:30"), "mười bốn giờ ba mươi phút");
    assert_eq!(n("9h"), "chín giờ");
    assert_eq!(n("14h30"), "mười bốn giờ ba mươi");
    assert_eq!(n("08:00"), "tám giờ");
    assert_eq!(n("10:05:20"), "mười giờ năm phút hai mươi giây");
}

#[test]
fn so_thu_tu() {
    assert_eq!(n("thứ 2"), "thứ hai");
    assert_eq!(n("thứ 1"), "thứ nhất");
    assert_eq!(n("thứ 4"), "thứ tư");
    assert_eq!(n("lần thứ 3"), "lần thứ ba");
}

#[test]
fn phan_so_va_ngay_thang_khong_nam() {
    assert_eq!(n("3/4"), "ba phần tư");
    assert_eq!(n("1/2"), "một phần hai");
    assert_eq!(n("ngày 5/6"), "ngày năm tháng sáu");
}

#[test]
fn so_dien_thoai_doc_tung_chu_so() {
    assert_eq!(n("0912345678"), "không chín một hai ba bốn năm sáu bảy tám");
}

#[test]
fn don_vi_do() {
    assert_eq!(n("5km"), "năm ki lô mét");
    assert_eq!(n("60km/h"), "sáu mươi ki lô mét trên giờ");
    assert_eq!(n("75 kg"), "bảy mươi lăm ki lô gam");
}

#[test]
fn so_am() {
    assert_eq!(n("-5 độ"), "âm năm độ");
}

#[test]
fn chu_va_so_dinh_lien() {
    assert_eq!(n("mp3"), "mp ba");
    assert_eq!(n("COVID-19"), "COVID-mười chín");
}

#[test]
fn khong_co_so_giu_nguyen_van() {
    let s = "Xin chào các bạn, hôm nay trời đẹp!";
    assert_eq!(n(s), s);
}

#[test]
fn idempotent_chay_hai_lan_khong_doi() {
    let s = "Lúc 14:30 ngày 24/10/2026, giá 100.000đ, tăng 1,5%, thắng 3-1.";
    let once = n(s);
    assert_eq!(n(&once), once);
    assert!(!once.chars().any(|c| c.is_ascii_digit()), "còn chữ số: {once}");
}

#[test]
fn khong_panic_voi_chuoi_la() {
    for s in ["", "%", "$", "-", "1.", ".5", "1,", "99999999999999999999999999", "12:", "12h99", "24/", "٣٤", "😀 5 😀"] {
        let _ = n(s);
    }
}

#[test]
fn nhan_dien_giong_tieng_viet() {
    assert!(is_vietnamese_voice("kokoro:tuan_ngoc"));
    assert!(is_vietnamese_voice("vietneu:Hải Đăng"));
    assert!(is_vietnamese_voice("vi-VN-HoaiMyNeural"));
    assert!(is_vietnamese_voice("gcloud:vi-VN-Chirp3-HD-Aoede"));
    assert!(!is_vietnamese_voice("en-US-GuyNeural"));
    assert!(!is_vietnamese_voice("ja-JP-KeitaNeural"));
}
