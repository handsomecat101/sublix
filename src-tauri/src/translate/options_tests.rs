//! Unit test cho `translate::apply_translate_options` — **không gọi mạng**.
//!
//! Trọng tâm: lệnh set lựa chọn dịch **KHÔNG được xoá API key** (BUG-014 liên quan).

use super::*;
use crate::config::AppConfig;

fn cfg_with_keys() -> AppConfig {
    let mut c = AppConfig::default();
    c.minimax_api_key = "sk-cp-KEEP-MINIMAX".to_string();
    c.deepseek_api_key = "sk-keep-deepseek".to_string();
    c.openrouter_api_key = "sk-or-keep-openrouter".to_string();
    c.translation_provider = "ollama".to_string();
    c.ollama_model = "qwen2.5:3b".to_string();
    c
}

#[test]
fn set_model_theo_provider_va_giun_key() {
    let mut c = cfg_with_keys();

    // đổi provider sang minimax + model
    apply_translate_options(&mut c, Some("minimax"), Some("MiniMax-M3.1-Flash"), None);
    assert_eq!(c.translation_provider, "minimax");
    assert_eq!(c.minimax_model, "MiniMax-M3.1-Flash");
    // key KHONG bi mat
    assert_eq!(c.minimax_api_key, "sk-cp-KEEP-MINIMAX");
    assert_eq!(c.deepseek_api_key, "sk-keep-deepseek");
    assert_eq!(c.openrouter_api_key, "sk-or-keep-openrouter");
    // field model của provider cũ không bị đụng
    assert_eq!(c.ollama_model, "qwen2.5:3b");
}

#[test]
fn set_openrouter_va_deepseek_va_ollama_va_local() {
    let mut c = cfg_with_keys();

    apply_translate_options(&mut c, Some("openrouter"), Some("deepseek/deepseek-v4.1-flash"), None);
    assert_eq!(c.openrouter_model, "deepseek/deepseek-v4.1-flash");

    apply_translate_options(&mut c, Some("deepseek"), Some("deepseek-chat"), None);
    assert_eq!(c.deepseek_model, "deepseek-chat");

    apply_translate_options(&mut c, Some("ollama"), Some("qwen2.5:3b"), None);
    assert_eq!(c.ollama_model, "qwen2.5:3b");

    apply_translate_options(&mut c, Some("local"), Some("qwen3-4b"), None);
    assert_eq!(c.translation_model, "qwen3-4b");

    assert_eq!(c.minimax_api_key, "sk-cp-KEEP-MINIMAX");
    assert_eq!(c.deepseek_api_key, "sk-keep-deepseek");
    assert_eq!(c.openrouter_api_key, "sk-or-keep-openrouter");
}

#[test]
fn set_reasoning_effort_chuan_hoa_va_giu_key() {
    let mut c = cfg_with_keys();
    apply_translate_options(&mut c, None, None, Some("HIGH"));
    assert_eq!(c.llm_reasoning_effort, "high");
    apply_translate_options(&mut c, None, None, Some("max"));
    assert_eq!(c.llm_reasoning_effort, "max");
    apply_translate_options(&mut c, None, None, Some("khong_hop_le"));
    assert_eq!(c.llm_reasoning_effort, "auto", "gia tri la -> auto");
    assert_eq!(c.minimax_api_key, "sk-cp-KEEP-MINIMAX");
}

#[test]
fn set_voi_gia_tri_rong_khong_duoc_ghi_dieu_gi() {
    let mut c = cfg_with_keys();
    let before_provider = c.translation_provider.clone();
    let before_model = c.ollama_model.clone();
    apply_translate_options(&mut c, Some(""), Some(""), Some(""));
    assert_eq!(c.translation_provider, before_provider);
    assert_eq!(c.ollama_model, before_model);
}

#[test]
fn config_that_trong_temp_giun_key_sau_khi_set() {
    // viet config that vao thu muc temp roi doc lai -> apply -> kiem tra key con nguyen
    let dir = std::env::temp_dir().join(format!("sublix-cfg-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).ok();
    let path = dir.join("sublix-config.json");

    let mut c = cfg_with_keys();
    let json = serde_json::to_string_pretty(&c).unwrap();
    std::fs::write(&path, &json).ok();

    let mut loaded: AppConfig = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(loaded.minimax_api_key, "sk-cp-KEEP-MINIMAX");

    apply_translate_options(&mut loaded, Some("minimax"), Some("MiniMax-M3.1-Flash"), Some("low"));
    let out = serde_json::to_string_pretty(&loaded).unwrap();
    std::fs::write(&path, &out).ok();

    let reread: AppConfig = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(reread.minimax_api_key, "sk-cp-KEEP-MINIMAX", "key phai con sau khi doc/ghi config");
    assert_eq!(reread.deepseek_api_key, "sk-keep-deepseek");
    assert_eq!(reread.openrouter_api_key, "sk-or-keep-openrouter");
    assert_eq!(reread.minimax_model, "MiniMax-M3.1-Flash");
    assert_eq!(reread.llm_reasoning_effort, "low");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn danh_sach_model_co_du_nut_ghim_san() {
    let list = build_model_list(&["qwen2.5:3b".to_string()]);
    let ids: Vec<&str> = list.iter().map(|m| m.id.as_str()).collect();
    for want in [
        "MiniMax-M3",
        "MiniMax-M3.1-Flash",
        "deepseek/deepseek-v4.1-flash",
        "~deepseek/deepseek-flash-latest",
        "deepseek-chat",
        "qwen2.5:3b",
        "qwen3-4b",
    ] {
        assert!(ids.contains(&want), "thieu model {want} trong danh sach: {ids:?}");
    }
    // model local phai danh dau local
    let ollama = list.iter().find(|m| m.id == "qwen2.5:3b").unwrap();
    assert!(ollama.local);
    assert_eq!(ollama.provider, "ollama");
    let gguf = list.iter().find(|m| m.id == "qwen3-4b").unwrap();
    assert!(gguf.local);
}

#[test]
fn translate_options_bao_cao_dung_provider_va_supports_reasoning() {
    let mut c = cfg_with_keys();
    c.translation_provider = "minimax".into();
    c.minimax_model = "MiniMax-M3.1-Flash".into();
    c.llm_reasoning_effort = "auto".into();

    let o = translate_options(&c, &[]);
    assert_eq!(o.provider, "minimax");
    assert_eq!(o.model, "MiniMax-M3.1-Flash");
    assert_eq!(o.reasoning_effort, "auto");
    assert!(o.supports_reasoning, "MiniMax co ho tro reasoning_effort (da xac minh API)");

    // provider local -> khong ho tro
    let mut c2 = cfg_with_keys();
    c2.translation_provider = "ollama".into();
    let o2 = translate_options(&c2, &[]);
    assert!(!o2.supports_reasoning);
}
