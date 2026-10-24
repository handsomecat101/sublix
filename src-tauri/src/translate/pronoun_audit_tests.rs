use super::*;

fn lines(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

#[test]
fn deaccent_bo_dau_tieng_viet() {
    // deaccent cũng hạ chữ thường (đếm đại từ không phân biệt hoa thường)
    assert_eq!(deaccent("Tôi muốn ở một mình."), "toi muon o mot minh.");
    assert_eq!(deaccent("Ngươi nói đến Dark Templar."), "nguoi noi den dark templar.");
    assert_eq!(deaccent("Chúng ta là một dân tộc cổ xưa."), "chung ta la mot dan toc co xua.");
    assert_eq!(deaccent("ngài"), "ngai");
}

#[test]
fn detect_tach_dai_tu_tu_xung_va_goi_nhau() {
    let (sf, af) = detect("Kaldares, chiến binh của anh đang hỏi anh đã đi đâu.");
    assert!(sf.is_empty(), "khong co dai tu tu xung: {sf:?}");
    assert!(af.contains("anh"), "phai co 'anh': {af:?}");

    let (sf2, af2) = detect("Chúng ta là một dân tộc cổ xưa.");
    assert!(sf2.contains("chung ta"), "phai co 'chung ta': {sf2:?}");
    assert!(af2.is_empty(), "khong co danh tu goi nhau: {af2:?}");
}

#[test]
fn dem_cha_quan_ho_dai_tu() {
    let t = "Chúng ta là một dân tộc cổ xưa. Tôi chứng kiến quê hương mình cháy.";
    assert_eq!(count_self_family(t, "ta"), 1);
    assert_eq!(count_self_family(t, "toi"), 1);
}

#[test]
fn audit_tinh_tong_theo_dong() {
    let trs = lines(&[
        "Ta muốn ở một mình.",
        "Ngươi nói đến Dark Templar.",
        "Tôi chứng kiến quê hương mình cháy.",
    ]);
    let sp = ["zeratul", "kaldares", "zeratul"];
    let a = audit(&trs, &sp);
    assert_eq!(a.n_lines, 3);
    assert_eq!(a.ta_count, 1);
    assert_eq!(a.toi_count, 1);
    assert_eq!(a.legacy_nguoi, 1);
    assert_eq!(a.modern_anh_ngai, 0);
}

#[test]
fn audit_phat_hien_ta_hoi_toi_chenh_va_mot_nhan_vat() {
    let trs = lines(&["Ta muốn ở một mình.", "Tôi chứng kiến quê hương mình cháy."]);
    let sp = ["zeratul", "zeratul"];
    let a = audit(&trs, &sp);
    assert_eq!(a.mix_ta_toi, 1, "Zeratul dung ca 'ta' va 'toi' -> phai bao hieu");
    assert!(a.register_flips >= 1, "phai bao hieu doi van phong: {a:?}");
}

#[test]
fn audit_dem_dong_co_anh_ngai() {
    let trs = lines(&["Các chiến binh của anh đang hỏi anh.", "Chắc ngài cũng thấy chứ?"]);
    let sp = ["kaldares", "kaldares"];
    let a = audit(&trs, &sp);
    assert_eq!(a.modern_anh_ngai, 2);
    assert_eq!(a.legacy_nguoi, 0);
}

#[test]
fn audit_ranh_giang_cau_trong_rong() {
    let a = audit(&[], &[]);
    assert_eq!(a.n_lines, 0);
    assert_eq!(a.self_forms_max, 0);
    assert_eq!(a.mix_ta_toi, 0);
}

#[test]
fn chung_ta_duoc_coi_la_van_phong_co() {
    let (sf, _af) = detect("Chúng ta là một dân tộc cổ xưa.");
    assert!(sf.contains("chung ta"), "phai co 'chung ta': {sf:?}");
    let (sf2, _af2) = detect("Chúng tôi là một dân tộc cổ xưa.");
    assert!(sf2.contains("chung toi"), "phai co 'chung toi': {sf2:?}");
}

#[test]
fn phan_biet_nguoi_va_nguoi_bo_dau_trung_nhau() {
    // "người" (con người) KHÔNG phải "ngươi" (đại từ cổ)
    let (_sf1, af1) = detect("Giờ chỉ còn rất ít người.");
    assert!(!af1.contains("nguoi"), "'nguoi' (con nguoi) khong phai dai tu: {af1:?}");
    let (_sf2, af2) = detect("Kaldares, chiến binh của ngươi đang hỏi ngươi.");
    assert!(af2.contains("nguoi"), "'nguoi' (dai tu co) phai duoc nhan dien: {af2:?}");
}

#[test]
fn phan_biet_cau_va_cau_ban_va_ban() {
    let (_s1, a1) = detect("Đó là một câu nói hay.");
    assert!(!a1.contains("cau"), "'cau' (cau noi) khong phai 'cau' (dai tu): {a1:?}");
    let (_s2, a2) = detect("Cậu nói gì vậy?");
    assert!(a2.contains("cau"), "'cau' (dai tu) phai duoc nhan dien: {a2:?}");
    let (_s3, a3) = detect("Ta ngồi bên bàn.");
    assert!(!a3.contains("ban"), "'ban' (ban ghe) khong phai 'ban' (dai tu): {a3:?}");
}

#[test]
fn chi_khong_bi_coi_la_dai_tu_goi_nhau() {
    // "chỉ có" / "chỉ là" xuất hiện rất nhiều -> khong duoc dem nhu "chị"
    let (_sf, af) = detect("Chỉ còn ít người thôi.");
    assert!(!af.contains("chi"), "'chi' khong phai dai tu: {af:?}");
}

/// Audit lại các file kết quả benchmark thật (bỏ qua mặc định vì cần file ngoài repo).
///
/// Chạy: `cargo test --lib -- --ignored audit_ket_qua_benchmark_that --nocapture`
#[test]
#[ignore]
fn audit_ket_qua_benchmark_that() {
    let dir = std::env::var("BENCH_RESULTS").unwrap_or_else(|_| {
        format!("{}\\sub-bench-translate\\results", std::env::var("TEMP").unwrap_or_default())
    });
    let dir = std::path::PathBuf::from(dir);
    if !dir.exists() {
        eprintln!("bo qua: khong thay {} ", dir.display());
        return;
    }
    // Dataset chứa speaker_id theo thứ tự dòng (file kết quả chỉ có text tiếng Anh).
    let ds_path = std::env::var("BENCH_DATASET").unwrap_or_else(|_| {
        format!(
            "{}\\sub-bench-translate\\en_src\\starcraft_en.json",
            std::env::var("TEMP").unwrap_or_default()
        )
    });
    let speakers: Vec<String> = std::fs::read_to_string(&ds_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.iter()
                .map(|l| l["speaker_id"].as_str().unwrap_or("").to_string())
                .collect()
        })
        .unwrap_or_default();
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .expect("doc dir")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            let n = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
            n.starts_with("ctx-") && !n.starts_with("eff-")
        })
        .collect();
    files.sort();
    for p in files {
        let raw = std::fs::read_to_string(&p).expect("doc json");
        let v: serde_json::Value = serde_json::from_str(&raw).expect("parse json");
        let label = v["label"].as_str().unwrap_or("?");
        let trs: Vec<String> = v["translations"]
            .as_array()
            .expect("translations")
            .iter()
            .map(|x| x.as_str().unwrap_or("").to_string())
            .collect();
        let sp: Vec<&str> = speakers.iter().map(|s| s.as_str()).collect();
        let a = audit(&trs, &sp);
        eprintln!(
            "AUDIT {label:22} ta={:3} toi={:3} nguoi={:2} anh_ngai={:2} mix={} flip={} selfmax={} addrmax={}",
            a.ta_count, a.toi_count, a.legacy_nguoi, a.modern_anh_ngai, a.mix_ta_toi,
            a.register_flips, a.self_forms_max, a.addr_forms_max
        );
    }
}
