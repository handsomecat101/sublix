use super::*;
use std::fs;

fn tmp_dir(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("sublix-glossary-test-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).expect("tao thu muc tam");
    d
}

#[test]
fn project_file_sinh_ten_dung() {
    let p = project_file(r"C:\phim\StarCraft.mp4").expect("co duong dan");
    assert!(p.ends_with("StarCraft.sublix-glossary.json"), "{p:?}");
    assert!(p.to_string_lossy().contains("phim"), "{p:?}");
}

#[test]
fn project_file_voi_srt_cung_dung_ten() {
    let p = project_file("/tmp/abc/StarCraft.srt").expect("co duong dan");
    assert!(p.ends_with("StarCraft.sublix-glossary.json"), "{p:?}");
}

#[test]
fn project_file_rong_tra_none() {
    assert!(project_file("").is_none());
    assert!(project_file("   ").is_none());
}

#[test]
fn luu_va_doc_lai_roundtrip() {
    let dir = tmp_dir("roundtrip");
    let video = dir.join("StarCraft.mp4");
    fs::write(&video, b"x").expect("viet file gia");

    let mut g = super::super::glossary::empty();
    g.terms.push(super::super::glossary::GlossaryTerm {
        source: "Dark Templar".into(),
        target: "Mẫu Tử Tối".into(),
        note: None,
    });
    g.locked = true;

    let path = save_project(&video.to_string_lossy(), &g).expect("luu");
    assert!(path.exists(), "file phai ton tai");
    assert!(path.ends_with("StarCraft.sublix-glossary.json"), "{path:?}");

    let back = load_project(&video.to_string_lossy()).expect("doc lai");
    assert_eq!(back.terms.len(), 1);
    assert_eq!(back.terms[0].target, "Mẫu Tử Tối");
    assert!(back.locked);
    assert_eq!(back.scope, "project");

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn doc_file_hong_khong_lam_cha() {
    let dir = tmp_dir("broken");
    let video = dir.join("Film.mp4");
    fs::write(&video, b"x").expect("viet file gia");
    let gf = project_file(&video.to_string_lossy()).expect("duong dan");
    fs::write(&gf, b"{ khong phai JSON").expect("viet file hong");
    assert!(load_project(&video.to_string_lossy()).is_none());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn resolve_roi_project_khi_co_file() {
    let cfg = crate::config::AppConfig::default();
    let g = resolve(None, &cfg);
    assert!(g.is_empty());
    assert_eq!(g.scope, "global");
}
