//! Logic thuần cho bảng thuật ngữ + xưng hô (TSK-FEAT-GLOSSARY-PRONOUN).
//!
//! Không import React, không gọi IPC ⇒ test được bằng `node --test`.
//! **Khớp logic với backend Rust** (`src-tauri/src/translate/glossary.rs`).
//!
//! Kiểu dữ liệu dùng chung với `src/lib/types.ts` (nguồn duy nhất cho frontend).

import type {
  Glossary,
  GlossaryCharacter,
  GlossarySuggestion,
  GlossaryTerm,
  PronounEntry,
} from "../../lib/types";

export type {
  Glossary,
  GlossaryCharacter,
  GlossarySuggestion,
  GlossaryTerm,
  PronounEntry,
};

/** Bảng rỗng. */
export function emptyGlossary(): Glossary {
  return { terms: [], pronouns: [], locked: false, scope: "", path: null };
}

/** Khoá gốc của 1 cặp thuật ngữ (không phân biệt hoa thường). */
export function termKey(t: GlossaryTerm): string {
  return (t.source ?? "").trim().toLowerCase();
}

/** Khoá gốc của 1 cặp xưng hô. */
export function pronounKey(p: PronounEntry): string {
  const s = (p.speaker ?? "").trim().toLowerCase();
  const l = (p.listener ?? "").trim().toLowerCase();
  return `${s}|${l}`;
}

/** Cắt khoảng trắng thừa, bỏ dòng rỗng, loại trùng (giống Rust). */
export function normalizeGlossary(g: Glossary): Glossary {
  const terms: GlossaryTerm[] = [];
  const seenTerms = new Set<string>();
  for (const raw of g.terms ?? []) {
    const source = (raw.source ?? "").trim();
    if (!source) continue;
    const key = source.toLowerCase();
    if (seenTerms.has(key)) continue;
    seenTerms.add(key);
    const note = (raw.note ?? "").trim();
    terms.push({ source, target: (raw.target ?? "").trim(), note: note || null });
  }
  const pronouns: PronounEntry[] = [];
  const seenPairs = new Set<string>();
  for (const raw of g.pronouns ?? []) {
    const speaker = (raw.speaker ?? "").trim();
    const listener = (raw.listener ?? "").trim();
    if (!speaker && !listener) continue;
    const key = `${speaker.toLowerCase()}|${listener.toLowerCase()}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    pronouns.push({
      speaker,
      listener,
      selfTerm: (raw.selfTerm ?? "").trim(),
      addressTerm: (raw.addressTerm ?? "").trim(),
    });
  }
  return { ...g, terms, pronouns };
}

/** Bảng có dùng được không (có ít nhất 1 cặp thuật ngữ hoặc xưng hô). */
export function hasContent(g: Glossary): boolean {
  return (g.terms?.length ?? 0) > 0 || (g.pronouns?.length ?? 0) > 0;
}

/** Cặp thuật ngữ đủ thông tin để dùng (gốc + dịch). */
export function isTermComplete(t: GlossaryTerm): boolean {
  return Boolean((t.source ?? "").trim() && (t.target ?? "").trim());
}

/** Cặp xưng hô đủ thông tin để dùng (người nói + người nghe + tự xưng + gọi). */
export function isPronounComplete(p: PronounEntry): boolean {
  return Boolean(
    (p.speaker ?? "").trim() &&
      (p.listener ?? "").trim() &&
      (p.selfTerm ?? "").trim() &&
      (p.addressTerm ?? "").trim(),
  );
}

/** Thêm 1 cặp thuật ngữ (thay thế nếu trùng gốc). */
export function addTerm(g: Glossary, term: GlossaryTerm): Glossary {
  const next = { ...g, terms: [...(g.terms ?? [])] };
  const key = termKey(term);
  const idx = next.terms.findIndex((t) => termKey(t) === key);
  if (idx >= 0) next.terms[idx] = { ...term };
  else next.terms.push({ ...term });
  return next;
}

/** Sửa 1 cặp thuật ngữ theo vị trí. */
export function updateTerm(g: Glossary, index: number, term: GlossaryTerm): Glossary {
  const terms = [...(g.terms ?? [])];
  if (index < 0 || index >= terms.length) return g;
  terms[index] = { ...term };
  return { ...g, terms };
}

/** Xoá 1 cặp thuật ngữ theo vị trí. */
export function removeTerm(g: Glossary, index: number): Glossary {
  const terms = [...(g.terms ?? [])];
  if (index < 0 || index >= terms.length) return g;
  terms.splice(index, 1);
  return { ...g, terms };
}

/** Thêm 1 quy tắc xưng hô (thay thế nếu trùng cặp). */
export function addPronoun(g: Glossary, p: PronounEntry): Glossary {
  const next = { ...g, pronouns: [...(g.pronouns ?? [])] };
  const key = pronounKey(p);
  const idx = next.pronouns.findIndex((x) => pronounKey(x) === key);
  if (idx >= 0) next.pronouns[idx] = { ...p };
  else next.pronouns.push({ ...p });
  return next;
}

/** Sửa 1 quy tắc xưng hô theo vị trí. */
export function updatePronoun(g: Glossary, index: number, p: PronounEntry): Glossary {
  const pronouns = [...(g.pronouns ?? [])];
  if (index < 0 || index >= pronouns.length) return g;
  pronouns[index] = { ...p };
  return { ...g, pronouns };
}

/** Xoá 1 quy tắc xưng hô theo vị trí. */
export function removePronoun(g: Glossary, index: number): Glossary {
  const pronouns = [...(g.pronouns ?? [])];
  if (index < 0 || index >= pronouns.length) return g;
  pronouns.splice(index, 1);
  return { ...g, pronouns };
}

/**
 * Nhận 1 gợi ý vào bảng (dùng cho nút ✓ bên cạnh dòng gợi ý).
 *
 * - `kind = "term"` → nhận cặp thuật ngữ.
 * - `kind = "pronoun"` → nhận quy tắc xưng hô.
 */
export function acceptSuggestion(
  g: Glossary,
  suggestion: GlossarySuggestion,
  kind: "term" | "pronoun",
  index: number,
): Glossary {
  if (kind === "term") {
    const t = suggestion.terms?.[index];
    if (!t) return g;
    return addTerm(g, t);
  }
  const p = suggestion.pronouns?.[index];
  if (!p) return g;
  return addPronoun(g, p);
}

/** Bỏ 1 dòng gợi ý (dùng cho nút ✕) — không đụng bảng đã duyệt. */
export function rejectSuggestion(
  suggestion: GlossarySuggestion,
  kind: "term" | "pronoun",
  index: number,
): GlossarySuggestion {
  if (kind === "term") {
    const terms = suggestion.terms ?? [];
    if (index < 0 || index >= terms.length) return suggestion;
    const next = [...terms];
    next.splice(index, 1);
    return { ...suggestion, terms: next };
  }
  const pronouns = suggestion.pronouns ?? [];
  if (index < 0 || index >= pronouns.length) return suggestion;
  const next = [...pronouns];
  next.splice(index, 1);
  return { ...suggestion, pronouns: next };
}

/** Số liệu tóm tắt cho UI. */
export function glossaryStats(g: Glossary): {
  termCount: number;
  pronounCount: number;
  noteCount: number;
  complete: boolean;
} {
  const terms = g.terms ?? [];
  return {
    termCount: terms.filter(isTermComplete).length,
    pronounCount: (g.pronouns ?? []).filter(isPronounComplete).length,
    noteCount: terms.filter((t) => !isTermComplete(t)).length,
    complete: hasContent(g),
  };
}

/** Nhãn hiển thị nơi đang lưu. */
export function scopeLabel(g: Glossary): string {
  if (g.scope === "project") return `Theo dự án${g.path ? ` — ${g.path}` : ""}`;
  if (g.scope === "global") return "Toàn cục (mọi dự án)";
  return "Chưa lưu";
}
