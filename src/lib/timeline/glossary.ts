/**
 * glossary — logic thuần cho bảng thuật ngữ + xưng hô (TSK-STUDIO-GLOSSARY).
 *
 * Module THUẦN TS (không React, không IPC) để test được bằng `node --test`.
 *
 * Nguyên tắc quan trọng: **gợi ý KHÔNG tự ghi**. Backend trả về danh sách
 * gợi ý; người dùng duyệt (✓) thì mới ghi vào bảng.
 */
import type {
  Glossary,
  GlossarySuggestion,
  GlossaryTerm,
  PronounEntry,
} from "../../lib/types";

/** Bảng rỗng (dùng khi backend chưa có dữ liệu). */
export const EMPTY_GLOSSARY: Glossary = { terms: [], pronouns: [], locked: false };

/** Dòng thuật ngữ TRỐNG (chưa có "Từ gốc") — dòng nháp, KHÔNG lưu xuống đĩa. */
export function isBlankTerm(term: GlossaryTerm | null | undefined): boolean {
  return !term || term.source.trim() === "";
}

/** Quy tắc xưng hô TRỐNG (chưa có cả người nói lẫn người nghe) — dòng nháp. */
export function isBlankPronoun(entry: PronounEntry | null | undefined): boolean {
  if (!entry) return true;
  return entry.speaker.trim() === "" && entry.listener.trim() === "";
}

/** Thêm 1 dòng thuật ngữ nháp (trống) vào cuối bảng. */
export function appendBlankTerm(glossary: Glossary): Glossary {
  return {
    ...glossary,
    terms: [...(glossary.terms ?? []), { source: "", target: "", note: null }],
  };
}

/** Thêm 1 quy tắc xưng hô nháp (trống) vào cuối bảng. */
export function appendBlankPronoun(glossary: Glossary): Glossary {
  return {
    ...glossary,
    pronouns: [
      ...(glossary.pronouns ?? []),
      { speaker: "", listener: "", selfTerm: "", addressTerm: "" },
    ],
  };
}

/**
 * Bỏ các dòng nháp (trống) trước khi **ghi xuống đĩa**.
 *
 * Backend (`glossary.rs::normalise`) cũng bỏ dòng trống ⇒ giữ nguyên hành vi.
 *
 * @param glossary Bảng hiện tại (có thể chứa dòng nháp).
 */
export function stripBlankRows(glossary: Glossary): Glossary {
  return {
    ...glossary,
    terms: (glossary.terms ?? []).filter((t) => !isBlankTerm(t)),
    pronouns: (glossary.pronouns ?? []).filter((p) => !isBlankPronoun(p)),
  };
}

/** Khóa so sánh 1 cặp thuật ngữ. */
export function termKey(term: GlossaryTerm): string {
  return `${term.source.trim().toLowerCase()}→${term.target.trim().toLowerCase()}`;
}

/** Khóa so sánh 1 quy tắc xưng hô. */
export function pronounKey(entry: PronounEntry): string {
  return [
    entry.speaker.trim().toLowerCase(),
    entry.listener.trim().toLowerCase(),
    entry.selfTerm.trim().toLowerCase(),
    entry.addressTerm.trim().toLowerCase(),
  ].join("→");
}

/**
 * Tổng số mục trong bảng (thuật ngữ + xưng hô).
 *
 * **Không tính dòng nháp** (dòng trống đang soạn) — số hiện trên nút.
 */
export function glossaryEntryCount(glossary: Glossary | null | undefined): number {
  if (!glossary) return 0;
  const terms = (glossary.terms ?? []).filter((t) => !isBlankTerm(t)).length;
  const pronouns = (glossary.pronouns ?? []).filter((p) => !isBlankPronoun(p)).length;
  return terms + pronouns;
}

/** Bảng đã khoá hay chưa. */
export function isGlossaryLocked(glossary: Glossary | null | undefined): boolean {
  return glossary?.locked === true;
}

/**
 * Gợi ý nhỏ cạnh công tắc "Dịch theo ngữ cảnh".
 *
 * @param glossary Bảng hiện tại.
 * @returns Câu nhắc, hoặc null nếu bảng đã khoá (không cần nhắc).
 */
export function glossaryLockHint(glossary: Glossary | null | undefined): string | null {
  if (isGlossaryLocked(glossary)) return null;
  return "Khoá bảng xưng hô để dịch nhất quán hơn";
}

/** Kết quả so sánh gợi ý với bảng hiện tại. */
export interface GlossarySuggestionDiff {
  /** Thuật ngữ gợi ý CHƯA có trong bảng (✓ = thêm). */
  newTerms: GlossaryTerm[];
  /** Thuật ngữ đã có (✗ = trùng). */
  existingTerms: GlossaryTerm[];
  /** Quy tắc xưng hô gợi ý chưa có. */
  newPronouns: PronounEntry[];
  /** Quy tắc xưng hô đã có. */
  existingPronouns: PronounEntry[];
}

/**
 * So gợi ý của backend với bảng hiện tại để đánh dấu ✓ (mới) / ✗ (trùng).
 *
 * @param current    Bảng hiện tại.
 * @param suggestion Gợi ý từ `glossary_suggest`.
 */
export function diffGlossarySuggestion(
  current: Glossary | null | undefined,
  suggestion: GlossarySuggestion | null | undefined,
): GlossarySuggestionDiff {
  const diff: GlossarySuggestionDiff = {
    newTerms: [],
    existingTerms: [],
    newPronouns: [],
    existingPronouns: [],
  };
  if (!suggestion) return diff;

  const currentTerms = new Set((current?.terms ?? []).map(termKey));
  for (const term of suggestion.terms ?? []) {
    if (currentTerms.has(termKey(term))) diff.existingTerms.push(term);
    else diff.newTerms.push(term);
  }

  const currentPronouns = new Set((current?.pronouns ?? []).map(pronounKey));
  for (const entry of suggestion.pronouns ?? []) {
    if (currentPronouns.has(pronounKey(entry))) diff.existingPronouns.push(entry);
    else diff.newPronouns.push(entry);
  }
  return diff;
}

/**
 * Ghép các mục người dùng DUYỆT (✓) vào bảng hiện tại.
 * Mục trùng (✗) bị bỏ qua; bảng cũ KHÔNG mất dữ liệu.
 *
 * @param current  Bảng hiện tại.
 * @param diff     Kết quả `diffGlossarySuggestion`.
 */
export function applyGlossarySuggestion(
  current: Glossary | null | undefined,
  diff: GlossarySuggestionDiff,
): Glossary {
  const base: Glossary = current ?? { ...EMPTY_GLOSSARY };
  const terms = [...(base.terms ?? [])];
  const existingTerms = new Set(terms.map(termKey));
  for (const term of diff.newTerms) {
    if (existingTerms.has(termKey(term))) continue;
    existingTerms.add(termKey(term));
    terms.push(term);
  }
  const pronouns = [...(base.pronouns ?? [])];
  const existingPronouns = new Set(pronouns.map(pronounKey));
  for (const entry of diff.newPronouns) {
    if (existingPronouns.has(pronounKey(entry))) continue;
    existingPronouns.add(pronounKey(entry));
    pronouns.push(entry);
  }
  return { ...base, terms, pronouns };
}

/**
 * Ước tính thời gian cho 1 lượt "đọc hiểu kịch bản" (gợi ý thuật ngữ).
 *
 * Dịch theo ngữ cảnh = **2 lượt** (đọc hiểu + dịch) ⇒ 1 lượt đọc hiểu ≈ 1/2 tổng.
 * Sàn 3 giây (một lượt gọi LLM có độ trễ riêng dù kịch bản rất ngắn).
 *
 * @param contextualTranslateSeconds Ước tính bước "Dịch theo ngữ cảnh" (giây).
 */
export function estimateGlossarySuggestSeconds(contextualTranslateSeconds: number): number {
  if (!Number.isFinite(contextualTranslateSeconds) || contextualTranslateSeconds <= 0) return 3;
  return Math.max(3, Math.round(contextualTranslateSeconds / 2));
}

/**
 * Class CSS cho câu vi phạm bảng thuật ngữ / xưng hô (tô vàng nhạt).
 *
 * Trả về **chuỗi rỗng** khi không vi phạm ⇒ không đổi class của phần tử.
 *
 * @param seg Câu phụ đề (chỉ cần cờ `glossaryViolation`).
 */
export function glossaryViolationClass(
  seg: { glossaryViolation?: boolean } | null | undefined,
): string {
  return seg?.glossaryViolation === true ? "is-glossary-violation" : "";
}

/**
 * Rút gọn bảng cũ (dạng chuỗi) về dạng cấu trúc mới.
 * Backend đọc được cả hai, nhưng UI hiển thị dạng cấu trúc.
 *
 * @param raw Bảng thô (object hoặc mảng chuỗi cũ).
 */
export function normalizeGlossary(raw: unknown): Glossary {
  if (Array.isArray(raw)) {
    // Dạng cũ: ["Dark Templar → Mẩu Tử Tối", ...]
    const terms: GlossaryTerm[] = [];
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const [source, target] = item.split("→").map((part) => part.trim());
      if (!source || !target) continue;
      terms.push({ source, target, note: null });
    }
    return { terms, pronouns: [], locked: false };
  }
  if (!raw || typeof raw !== "object") return { ...EMPTY_GLOSSARY };
  const obj = raw as Partial<Glossary>;
  const terms = Array.isArray(obj.terms) ? obj.terms : [];
  const pronouns = Array.isArray(obj.pronouns) ? obj.pronouns : [];
  return {
    terms,
    pronouns,
    locked: obj.locked === true,
    scope: obj.scope,
    path: obj.path ?? null,
  };
}
