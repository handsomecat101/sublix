//! Unit test cho mapping reasoning effort — không gọi mạng.

use super::*;

#[test]
fn normalize_effort_chap_nhan_5_gia_tri() {
    assert_eq!(normalize_effort("low"), "low");
    assert_eq!(normalize_effort("MEDIUM"), "medium");
    assert_eq!(normalize_effort(" high "), "high");
    assert_eq!(normalize_effort("max"), "max");
    assert_eq!(normalize_effort("auto"), "auto");
    // gia tri la -> auto
    assert_eq!(normalize_effort(""), "auto");
    assert_eq!(normalize_effort("khong_hop_le"), "auto");
}

#[test]
fn supports_reasoning_theo_provider() {
    assert!(supports_reasoning("minimax", "MiniMax-M3.1-Flash"));
    assert!(supports_reasoning("MiniMax", "MiniMax-M3"));
    assert!(supports_reasoning("openrouter", "deepseek/deepseek-v4.1-flash"));
    // chua xac minh duoc (khong co key) -> false
    assert!(!supports_reasoning("deepseek", "deepseek-chat"));
    // local -> khong co khai niem reasoning effort
    assert!(!supports_reasoning("ollama", "qwen2.5:3b"));
    assert!(!supports_reasoning("gguf", "qwen3-4b"));
}

#[test]
fn minimax_m31_flash_auto_phan_low() {
    let (f, s) = reasoning_fields("minimax", "MiniMax-M3.1-Flash", "auto");
    assert!(s);
    assert_eq!(f["reasoning_effort"], "low");
}

#[test]
fn minimax_m3_auto_khong_gan_tham_so() {
    let (f, s) = reasoning_fields("minimax", "MiniMax-M3", "auto");
    assert!(s, "van la model ho tro reasoning");
    assert!(
        f.get("reasoning_effort").is_none(),
        "auto = mac dinh nha cung cap -> khong gan tham so: {f}"
    );
}

#[test]
fn minimax_effort_ro_duc_dung() {
    for (eff, want) in [("low", "low"), ("medium", "medium"), ("high", "high"), ("max", "max")] {
        let (f, _) = reasoning_fields("minimax", "MiniMax-M3.1-Flash", eff);
        assert_eq!(f["reasoning_effort"], want);
    }
}

#[test]
fn openrouter_max_quy_ve_high() {
    let (f, s) = reasoning_fields("openrouter", "deepseek/deepseek-v4.1-flash", "max");
    assert!(s);
    assert_eq!(f["reasoning"]["effort"], "high", "OpenRouter khong co 'max' -> quy ve 'high'");
}

#[test]
fn openrouter_auto_khong_gan() {
    let (f, s) = reasoning_fields("openrouter", "deepseek/deepseek-v4.1-flash", "auto");
    assert!(s);
    assert!(f.get("reasoning").is_none(), "auto -> mac dinh nha cung cap: {f}");
}

#[test]
fn local_khong_gan_gi() {
    for p in ["ollama", "gguf", "deepseek"] {
        let (f, s) = reasoning_fields(p, "x", "high");
        assert!(!s, "{p} khong ho tro reasoning");
        assert_eq!(f, json!({}), "{p} phai khong gan gi");
    }
}
