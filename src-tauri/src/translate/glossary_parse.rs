//! Parse **khoan dung** JSON lượt 1 ("đọc hiểu") mà LLM trả về — phục vụ
//! `glossary_suggest` (TSK-FIX-BUG-H23).
//!
//! **Vì sao cần:** model local (`qwen2.5:3b`…) hay trả khối thuật ngữ theo
//! **định dạng cũ** (`"Dark Templar => Mẫu Tử Tối"`, `"a → b"`, `"a=b"`) thay vì
//! object `{goc, dich}`. serde cứng ⇒ lỗi *"expected struct GlossaryTerm"* ⇒ **mất
//! trọn kết quả gợi ý**, kể cả phần xưng hô vốn đã parse được.
//!
//! Nguyên tắc:
//! - **Từng phần độc lập**: `thuat_ngu` hỏng vẫn giữ `xung_ho`, và ngược lại.
//! - Phần tử hỏng ⇒ **bỏ qua + `tracing::warn!`**, không làm hỏng cả response.
//! - Chỉ trả `Err` khi JSON hỏng hẳn hoặc không lấy được gì.

use serde_json::Value;
use tracing::warn;

use super::contextual_types::{Character, GlossaryTerm, PronounRule, ScriptReference};

/// Tách "gốc → dịch" từ 1 dòng glossary cũ (dùng cho `Glossary::from_legacy`).
pub(crate) fn split_pair(s: &str) -> Option<(String, String)> {
    for sep in ["=>", "→", "->", "="] {
        if let Some(pos) = s.find(sep) {
            let (a, b) = s.split_at(pos);
            let b = &b[sep.len()..];
            if a.trim().is_empty() {
                return None;
            }
            return Some((a.to_string(), b.to_string()));
        }
    }
    None
}

/// Tách "gốc → dịch" từ 1 chuỗi — chấp nhận **nhiều kiểu dấu**:
/// `=>`, `→`, `->`, `=` và `:`.
///
/// Dùng khi parse kết quả LLM (model hay trả `"Dark Templar: Mẫu Tử Tối"`).
/// Kết quả **đã trim** khoảng trắng. `from_legacy` vẫn dùng `split_pair`
/// (không có `:`) để không đổi hành vi cũ.
pub fn split_term(s: &str) -> Option<(String, String)> {
    if let Some((a, b)) = split_pair(s) {
        let (a, b) = (a.trim(), b.trim());
        if a.is_empty() {
            return None;
        }
        return Some((a.to_string(), b.to_string()));
    }
    // Dấu ":" — phần bên phải phải khác rỗng.
    if let Some(pos) = s.find(':') {
        let (a, b) = s.split_at(pos);
        let b = b[1..].trim();
        if !a.trim().is_empty() && !b.is_empty() {
            return Some((a.trim().to_string(), b.to_string()));
        }
    }
    None
}

/// Bóc JSON ra khỏi ```json fences hoặc chữ thừa trước/sau.
fn extract_json(raw: &str) -> Option<&str> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(&raw[start..=end])
}

/// Lấy 1 trường kiểu chuỗi (thiếu / sai kiểu ⇒ rỗng).
fn str_field(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.trim().to_string(),
        _ => String::new(),
    }
}

/// Lấy 1 trường kiểu mảng (thiếu / sai kiểu ⇒ rỗng).
fn arr_field(v: Option<&Value>) -> &[Value] {
    match v {
        Some(Value::Array(a)) => a.as_slice(),
        _ => &[],
    }
}

/// Tìm 1 mảng theo **nhiều tên khóa** (model hay dùng tên tiếng Anh).
fn field_any<'a>(obj: &'a serde_json::Map<String, Value>, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|k| obj.get(*k))
}

/// Tách 1 chuỗi kiểu `"Kaldares: gọi là anh, tự xưng tôi"` → quy tắc xưng hô.
///
/// Chỉ nhận được khi có cả "người nghe" lẫn **một** trong hai từ khóa
/// (`gọi là` / `tự xưng`); thiếu thì bỏ qua.
fn parse_pronoun_string(s: &str) -> Option<PronounRule> {
    let (den, rest) = s.split_once(':')?;
    let den = den.trim();
    if den.is_empty() {
        return None;
    }
    let low = rest.to_lowercase();
    let goi_la = pick_after(&low, rest, &["goi la", "gọi là", "goi_la"]);
    let xung_la = pick_after(&low, rest, &["tu xung", "tự xưng", "tu_xung"]);
    if goi_la.is_empty() && xung_la.is_empty() {
        return None;
    }
    Some(PronounRule {
        tu: String::new(),
        den: den.to_string(),
        goi_la,
        xung_la,
    })
}

/// Tìm phần text đứng **sau** 1 trong các từ khóa (không phân biệt hoa thường).
fn pick_after(low: &str, orig: &str, keys: &[&str]) -> String {
    for k in keys {
        if let Some(pos) = low.find(k) {
            let after = &orig[pos + k.len()..];
            let val = after
                .split(|c| c == ',' || c == ';' || c == '\n')
                .next()
                .unwrap_or("")
                .trim()
                .trim_matches(|c| c == '.' || c == '"' || c == '\'' || c == ' ')
                .to_string();
            if !val.is_empty() {
                return val;
            }
        }
    }
    String::new()
}

/// Parse JSON tham chiếu của lượt 1 — **chịu được cả định dạng cũ**.
///
/// - `thuat_ngu` / `terms`: object `{goc,dich}` (kèm alias `source`/`target`) **hoặc**
///   chuỗi `"gốc => dịch"` (`→`, `=>`, `->`, `=`, `:`).
/// - `xung_ho` / `pronouns`: object `{tu,den,goi_la,xung_la}` **hoặc** chuỗi
///   `"Kaldares: gọi là anh, tự xưng tôi"`.
/// - `nhan_vat` / `characters`: object; phần tử hỏng ⇒ bỏ qua + warn.
/// - Phần tử hỏng ở một mảng **không** làm hỏng các mảng khác.
pub fn parse_reference_lenient(raw: &str) -> Result<ScriptReference, String> {
    let json = extract_json(raw).ok_or("khong tim thay JSON")?;
    let value: Value =
        serde_json::from_str(json).map_err(|e| format!("JSON khong hop le: {e}"))?;
    let obj = value
        .as_object()
        .ok_or_else(|| "JSON khong phai object".to_string())?;

    let mut out = ScriptReference::default();
    out.tom_tat = str_field(field_any(obj, &["tom_tat", "summary", "tomtat"]));
    out.giong_dieu = str_field(field_any(obj, &["giong_dieu", "tone", "giongdieu"]));

    // ---- Nhân vật ----
    for (i, item) in arr_field(field_any(obj, &["nhan_vat", "characters", "nhanvat"])).iter().enumerate() {
        match item {
            Value::Object(o) => out.nhan_vat.push(Character {
                speaker_id: str_field(o.get("speaker_id")),
                ten: str_field(o.get("ten")),
                gioi_tinh_doan: str_field(o.get("gioi_tinh_doan")),
                vai_tro: str_field(o.get("vai_tro")),
            }),
            other => warn!(
                "⚠️ nhan_vat[{i}] không phải object (bỏ qua): {other}"
            ),
        }
    }

    // ---- Thuật ngữ: object HOẶC chuỗi kiểu cũ ----
    for (i, item) in arr_field(field_any(obj, &["thuat_ngu", "terms", "thuatngu"])).iter().enumerate() {
        match item {
            Value::Object(o) => {
                let goc = str_field(o.get("goc").or_else(|| o.get("source")));
                let dich = str_field(o.get("dich").or_else(|| o.get("target")));
                if goc.is_empty() {
                    warn!("⚠️ thuat_ngu[{i}] thiếu 'goc' (bỏ qua)");
                    continue;
                }
                out.thuat_ngu.push(GlossaryTerm { goc, dich });
            }
            Value::String(s) => match split_term(s) {
                Some((goc, dich)) => out.thuat_ngu.push(GlossaryTerm { goc, dich }),
                None => warn!("⚠️ thuat_ngu[{i}] không tách được (bỏ qua): \"{s}\""),
            },
            other => warn!(
                "⚠️ thuat_ngu[{i}] không phải object/chuỗi (bỏ qua): {other}"
            ),
        }
    }

    // ---- Xưng hô: object HOẶC chuỗi ----
    for (i, item) in arr_field(field_any(obj, &["xung_ho", "pronouns", "xungho"])).iter().enumerate() {
        match item {
            Value::Object(o) => out.xung_ho.push(PronounRule {
                tu: str_field(o.get("tu")),
                den: str_field(o.get("den")),
                goi_la: str_field(o.get("goi_la")),
                xung_la: str_field(o.get("xung_la")),
            }),
            Value::String(s) => match parse_pronoun_string(s) {
                Some(r) => out.xung_ho.push(r),
                None => warn!("⚠️ xung_ho[{i}] không tách được (bỏ qua): \"{s}\""),
            },
            other => warn!(
                "⚠️ xung_ho[{i}] không phải object/chuỗi (bỏ qua): {other}"
            ),
        }
    }

    if out.tom_tat.is_empty()
        && out.nhan_vat.is_empty()
        && out.thuat_ngu.is_empty()
        && out.xung_ho.is_empty()
    {
        return Err("JSON không chứa dữ liệu dùng được".to_string());
    }
    Ok(out)
}

#[cfg(test)]
#[path = "glossary_parse_tests.rs"]
mod tests;
