//! Dịch kịch bản **theo ngữ cảnh** — vá lỗi "dịch kiểu Google Translate".
//!
//! Vấn đề của đường dịch cũ (`translate_batch_with_config`):
//! - Mỗi lô 15 câu được dịch **độc lập**, model không biết câu trước dịch thế nào.
//! - Không gửi tên người nói → model tự bịa hoặc dùng "anh/cậu/bạn" lung tung.
//! - Không có bản tóm tắt phim, không có bảng xưng hô, không có thuật ngữ.
//! - Không ràng buộc độ dài theo thời lượng câu (câu dài bị đọc nhanh hoặc bị cắt).
//!
//! Module này gồm 2 lượt:
//! 1. **Lượt "đọc hiểu"**: đưa toàn bộ lời thoại cho LLM, nhận về JSON
//!    `{tom_tat, nhan_vat, xung_ho, thuat_ngu, giong_dieu}`.
//! 2. **Lượt "dịch"**: dịch từng lô ~20 câu, prompt có bản tham chiếu + `[speaker]`
//!    trên từng dòng + 5 câu liền trước (cửa sổ trượt qua biên giới lô) + hạn mức
//!    độ dài theo thời lượng.
//!
//! Mọi hàm "thuần" (prompt, parse, cửa sổ trượt, hạn mức độ dài) nằm ở đây để
//! unit test được **không gọi mạng**.

use super::lang_name;

/// Số câu liền trước đưa vào prompt (cửa sổ trượt).
pub const MAX_CONTEXT_LINES: usize = 5;
/// Số câu mỗi lô gửi đi ở lượt dịch.
pub const CHUNK_SIZE: usize = 20;
/// Ngưỡng âm tiết tiếng Việt mỗi giây (tham số) — dùng để hạn mức độ dài.
pub const SYLLABLES_PER_SECOND: f64 = 5.0;
/// Chiều dài tối thiểu của một câu (âm tiết).
pub const MIN_SYLLABLE_BUDGET: usize = 4;

pub use super::contextual_types::{
    Character, ContextualLine, GlossaryTerm, PronounRule, ScriptLine, ScriptReference,
};
/// Hạn mức âm tiết cho 1 câu, theo thời lượng (≈ 5 âm tiết/giây).
pub fn length_budget(duration_s: f64) -> usize {
    if !duration_s.is_finite() || duration_s <= 0.0 {
        // thời lượng không xác định → dùng mức tối thiểu, đừng bịa ra con số
        return MIN_SYLLABLE_BUDGET;
    }
    ((duration_s * SYLLABLES_PER_SECOND).round() as usize).max(MIN_SYLLABLE_BUDGET)
}

/// Ví dụ xưng hô tiếng Việt — thay cho ví dụ tiếng Nhật khi target = vi.
pub fn pronoun_examples(target: &str) -> &'static str {
    match target.to_lowercase().as_str() {
        "vi" | "vietnamese" => {
            "- \"Anh ấy nói với em.\" -> \"Anh ấy nói với em.\" (anh/em: người lớn tuổi hơn gọi người nhỏ hơn là \"em\")\n\
             - \"Tao không cần biết.\" -> \"Tao không cần biết.\" (tao/mày: rất thân, hơi thô)\n\
             - \"Cậu nói gì?\" -> \"Cậu nói gì?\" (cậu/tô: người nhỏ hơn, hơi thô)\n\
             - \"Bạn có ổn không?\" -> \"Bạn có ổn không?\" (tôi/bạn: lịch sự, xa cách)\n\
             - \"Tôi nghĩ anh ấy sẽ đến.\" -> \"Tôi nghĩ anh ấy sẽ đến.\""
        }
        _ => {
            "- \"I think he will come.\" -> \"Tôi nghĩ anh ấy sẽ đến.\"\n\
             - \"She told me.\" -> \"Cô ấy đã nói với tôi.\""
        }
    }
}

/// Prompt lượt 1 — nhờ LLM đọc hiểu toàn bộ kịch bản và trả về JSON tham chiếu.
pub fn build_reference_prompt(lines: &[ScriptLine], source: &str, target: &str) -> String {
    let mut body = String::new();
    for l in lines {
        body.push_str(&format!(
            "[{}] (speaker={}, tên: {}): {}\n",
            l.id,
            l.speaker_id,
            l.speaker_name.as_deref().unwrap_or("?"),
            l.text
        ));
    }
    format!(
        "Bạn là biên tập viên kịch bản {src}. Đọc TOÀN BỘ lời thoại dưới đây rồi trả về \
         MỘT JSON duy nhất (không markdown, không giải thích, không ```).\n\
         Schema:\n\
         {{\"tom_tat\":\"<tóm tắt cốt truyện/phân cảnh, 2-4 câu>\",\
         \"nhan_vat\":[{{\"speaker_id\":\"...\",\"ten\":\"tên thật trong lời thoại\",\"gioi_tinh_doan\":\"nam/nữ/khác\",\"vai_tro\":\"vai trò\"}}],\
         \"xung_ho\":[{{\"tu\":\"cặp đại từ (vd anh/em)\",\"den\":\"ai là người bị xưng hô\",\
         \"goi_la\":\"từ để gọi người kia\",\"xung_la\":\"từ để tự xưng\"}}],\
         \"thuat_ngu\":[{{\"goc\":\"thuật ngữ tiếng {src}\",\"dich\":\"bản dịch tiếng {tgt}\"}}],\
         \"giong_dieu\":\"<giọng điệu chung của kịch bản>\"}}\n\
         Yêu cầu:\n\
         - Chỉ liệt kê nhân vật CÓ THẬT trong lời thoại, gắn đúng speaker_id.\n\
         - xung_ho mô tả quan hệ GIỮA CÁC NHÂN VẬT với nhau (ai gọi ai bằng gì), mỗi quan hệ 1 entry.\n\
         - thuat_ngu chỉ gồm thuật ngữ đặc thù của phim, không gồm từ thông thường.\n\
         LỜI THOẠI:\n{body}",
        src = lang_name(source),
        tgt = lang_name(target),
        body = body
    )
}

/// Parse JSON tham chiếu. Thiếu trường → để trống (không chết). JSON hỏng → Err.
pub fn parse_reference(raw: &str) -> Result<ScriptReference, String> {
    let start = raw.find('{').ok_or("khong tim thay JSON")?;
    let end = raw.rfind('}').ok_or("JSON khong dong")?;
    if end <= start {
        return Err("JSON khong hop le".to_string());
    }
    serde_json::from_str::<ScriptReference>(&raw[start..=end]).map_err(|e| format!("JSON khong hop le: {e}"))
}

/// Render bản tham chiếu thành block text để nhét vào prompt lượt 2.
pub fn reference_block(reference: &ScriptReference, user_glossary: &[String]) -> String {
    let mut s = String::new();
    if !reference.tom_tat.trim().is_empty() {
        s.push_str(&format!("TÓM TẮT KỊCH BẢN:\n{}\n", reference.tom_tat.trim()));
    }
    if !reference.giong_dieu.trim().is_empty() {
        s.push_str(&format!("GIỌNG ĐIỆU CHUNG:\n{}\n", reference.giong_dieu.trim()));
    }
    if !reference.nhan_vat.is_empty() {
        s.push_str("NHÂN VẬT:\n");
        for c in &reference.nhan_vat {
            s.push_str(&format!(
                "- {} (speaker={}): tên \"{}\", {}{}\n",
                c.ten, c.speaker_id, c.ten, c.gioi_tinh_doan, c.vai_tro
            ));
        }
    }
    if !reference.xung_ho.is_empty() {
        s.push_str("BẢNG XƯNG HÔ (bám đúng để không gọi nhầm):\n");
        for p in &reference.xung_ho {
            s.push_str(&format!(
                "- với {}: gọi là \"{}\", tự xưng \"{}\" ({})\n",
                p.den, p.goi_la, p.xung_la, p.tu
            ));
        }
    }
    if !reference.thuat_ngu.is_empty() {
        s.push_str("THUẬT NGỮ PHIM (dịch nhất quán):\n");
        for t in &reference.thuat_ngu {
            s.push_str(&format!("- {} -> {}\n", t.goc, t.dich));
        }
    }
    if !user_glossary.is_empty() {
        s.push_str("GLOSSARY NGƯỜI DÙNG (ưu tiên CAO HƠN thuật ngữ tự động ở trên):\n");
        for g in user_glossary {
            s.push_str(&format!("- {g}\n"));
        }
    }
    s
}

/// Cửa sổ trượt: lấy tối đa `MAX_CONTEXT_LINES` dòng ngay trước `idx` trong toàn bộ lô.
pub fn sliding_window<T: Clone>(all: &[T], idx: usize) -> &[T] {
    let start = idx.saturating_sub(MAX_CONTEXT_LINES);
    &all[start..idx]
}

/// Prompt lượt 2 — dịch một lô câu, có bản tham chiếu + ngữ cảnh + hạn mức độ dài.
pub fn build_translate_prompt(
    chunk: &[ScriptLine],
    context: &[(String, String)],
    reference: &ScriptReference,
    user_glossary: &[String],
    source: &str,
    target: &str,
) -> String {
    let mut s = String::new();
    s.push_str("BẢN THAM CHIẾU VỀ KỊCH BẢN:\n");
    s.push_str(&reference_block(reference, user_glossary));
    s.push_str("\nGỢI Ý XƯNG HÔ:\n");
    s.push_str(pronoun_examples(target));
    s.push_str("\n");

    if !context.is_empty() {
        s.push_str("LỜI THOẠI TRƯỚC ĐÓ (ngữ cảnh, để nối mạch câu):\n");
        for (src_line, tgt_line) in context {
            s.push_str(&format!("- \"{src_line}\" -> \"{tgt_line}\"\n"));
        }
        s.push_str("\n");
    }

    s.push_str("DỊCH CÁC DÒNG SAU (giữ nguyên thẻ [id] ở đầu mỗi dòng):\n");
    for l in chunk {
        let budget = length_budget(l.duration());
        // Format input CỐ Ý khác format output để model không echo nguyên dòng.
        s.push_str(&format!(
            "INPUT {} | speaker={} | tên: {} | {}s | toi da ~{} am tiet | noi dung: {}\n",
            l.id,
            l.speaker_id,
            l.speaker_name.as_deref().unwrap_or("?"),
            l.duration().round() as i64,
            budget,
            l.text
        ));
    }
    s.push_str("\nQUY TẮC:\n");
    s.push_str(
        "- Output DUNG 1 dong cho moi INPUT, dinh dang: \"[id] <ban dich>\".\n\
         - CHI ghi ban dich, KHONG echo lai phan \"INPUT ...\", KHONG ghi lai ten nguoi noi hay do dai.\n\
         - Vi du output dung: \"[S1] Xin chang ta mot lan nua.\"\n\
         - Vi du output SAI: \"[S1] INPUT S1 | speaker=... | ...\".\n",
    );
    s.push_str(&format!(
        "- Mỗi dòng đầu ra đúng định dạng: \"[id] <bản dịch>\" (giữ nguyên id, KHÔNG thêm số thứ tự).\n\
         - Dịch sang {tgt} tự nhiên như lời thoại thật, ưu tiên nói tròn.\n\
         - TUÂN THỦ bảng xưng hô: gọi đúng người, tự xưng đúng.\n\
         - Tôn trọng hạn mức âm tiết đã ghi trên mỗi dòng (câu dài được phép dài hơn, câu ngắn phải cụt).\n\
         - Giữ đúng tên riêng theo danh sách trên.\n\
         - Nếu một dòng không dịch được, vẫn phải xuất dòng đó với nguyên id.\n",
        tgt = lang_name(target)
    ));
    let _ = source;
    s
}

/// Parse output lượt 2: ưu tiên thẻ `[id]`, không có thẻ thì theo thứ tự dòng.
pub fn parse_tagged_lines(raw: &str, ids: &[String]) -> Vec<Option<String>> {
    let mut out: Vec<Option<String>> = vec![None; ids.len()];
    let mut cursor = 0usize;
    for line in raw.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        // bỏ fence markdown (``` / ```json) — model hay bọc JSON trong code block
        if t.starts_with("```") {
            continue;
        }
        if let Some(rest) = t.strip_prefix('[') {
            if let Some(pos) = rest.find(']') {
                let tag = &rest[..pos];
                let body = rest[pos + 1..].trim();
                if let Some(idx) = ids.iter().position(|i| i == tag) {
                    if out[idx].is_none() && !body.is_empty() {
                        out[idx] = Some(strip_meta(body));
                    }
                    continue;
                }
            }
        }
        // không có thẻ -> gán theo thứ tự
        while cursor < ids.len() && out[cursor].is_some() {
            cursor += 1;
        }
        if cursor < ids.len() {
            out[cursor] = Some(strip_meta(t));
            cursor += 1;
        }
    }
    out
}

/// Bỏ metadata prompt còn sót nếu model echo nguyên dòng INPUT
/// (ví dụ "(speaker=zeratul, tên: Zeratul, ...): Xin chào").
fn strip_meta(body: &str) -> String {
    let mut s = body.trim().to_string();
    // "(...)" đứng đầu kèm metadata
    if s.starts_with('(') {
        if let Some(pos) = s.find("): ") {
            s = s[pos + 3..].trim().to_string();
        } else if let Some(pos) = s.find(')') {
            s = s[pos + 1..].trim().to_string();
        }
    }
    // "INPUT S1 | speaker=..." -> lấy phần sau dấu | cuối cùng
    if s.starts_with("INPUT ") && s.contains('|') {
        if let Some(pos) = s.rfind("| noi dung: ") {
            s = s[pos + "| noi dung: ".len()..].trim().to_string();
        }
    }
    s
}

#[cfg(test)]
#[path = "contextual_tests.rs"]
mod tests;
