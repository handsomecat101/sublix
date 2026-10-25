/**
 * Unit test cho `src/lib/timeline/glossary.ts` (bảng thuật ngữ + xưng hô).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  appendBlankPronoun,
  appendBlankTerm,
  applyGlossarySuggestion,
  diffGlossarySuggestion,
  estimateGlossarySuggestSeconds,
  glossaryEntryCount,
  glossaryLockHint,
  glossaryViolationClass,
  isBlankPronoun,
  isBlankTerm,
  isGlossaryLocked,
  normalizeGlossary,
  pronounKey,
  stripBlankRows,
  termKey,
  EMPTY_GLOSSARY,
} from "../../src/lib/timeline/glossary.ts";
import type { Glossary, GlossarySuggestion } from "../../src/lib/types.ts";

const CURRENT: Glossary = {
  terms: [{ source: "Dark Templar", target: "Mẩu Tử Tối", note: null }],
  pronouns: [{ speaker: "A", listener: "B", selfTerm: "ta", addressTerm: "ngươi" }],
  locked: false,
};

const SUGGESTION: GlossarySuggestion = {
  characters: [],
  terms: [
    { source: "Dark Templar", target: "Mẩu Tử Tối", note: null }, // trùng
    { source: "Zealot", target: "Nhiệt Huyết", note: null }, // mới
  ],
  pronouns: [
    { speaker: "A", listener: "B", selfTerm: "ta", addressTerm: "ngươi" }, // trùng
    { speaker: "A", listener: "C", selfTerm: "ta", addressTerm: "hắn" }, // mới
  ],
};

test("glossary: đếm mục + kiểm tra khoá", () => {
  assert.equal(glossaryEntryCount(CURRENT), 2);
  assert.equal(glossaryEntryCount(null), 0);
  assert.equal(isGlossaryLocked(CURRENT), false);
  assert.equal(isGlossaryLocked({ ...CURRENT, locked: true }), true);
});

test("glossary: gợi ý khoá bảng", () => {
  assert.equal(glossaryLockHint(CURRENT), "Khoá bảng xưng hô để dịch nhất quán hơn");
  assert.equal(glossaryLockHint({ ...CURRENT, locked: true }), null);
});

test("glossary: khoá so sánh thuật ngữ / xưng hô", () => {
  assert.equal(termKey({ source: " A ", target: "B", note: null }), "a→b");
  assert.equal(
    pronounKey({ speaker: "A", listener: "B", selfTerm: "ta", addressTerm: "ngươi" }),
    "a→b→ta→ngươi",
  );
});

test("glossary: phân biệt gợi ý mới (✓) và trùng (✕)", () => {
  const diff = diffGlossarySuggestion(CURRENT, SUGGESTION);
  assert.equal(diff.newTerms.length, 1);
  assert.equal(diff.newTerms[0].source, "Zealot");
  assert.equal(diff.existingTerms.length, 1);
  assert.equal(diff.existingTerms[0].source, "Dark Templar");
  assert.equal(diff.newPronouns.length, 1);
  assert.equal(diff.newPronouns[0].listener, "C");
  assert.equal(diff.existingPronouns.length, 1);
});

test("glossary: gợi ý KHÔNG tự ghi — chỉ mục người dùng duyệt mới vào bảng", () => {
  const diff = diffGlossarySuggestion(CURRENT, SUGGESTION);
  const before = CURRENT.terms.length;
  const next = applyGlossarySuggestion(CURRENT, diff);
  // Chỉ mục MỚI được thêm; dữ liệu cũ giữ nguyên.
  assert.equal(CURRENT.terms.length, before, "bảng gốc không bị mutate");
  assert.equal(next.terms.length, 2);
  assert.equal(next.pronouns.length, 2);
  assert.equal(next.terms[0].source, "Dark Templar");
});

test("glossary: apply khi không có gợi ý → bảng không đổi", () => {
  const diff = diffGlossarySuggestion(CURRENT, null);
  const next = applyGlossarySuggestion(CURRENT, diff);
  assert.equal(next.terms.length, 1);
  assert.equal(next.pronouns.length, 1);
});

test("glossary: normalize bảng cũ dạng chuỗi", () => {
  const g = normalizeGlossary(["Dark Templar → Mẩu Tử Tối", "rác"]);
  assert.equal(g.terms.length, 1);
  assert.equal(g.terms[0].source, "Dark Templar");
  assert.equal(g.terms[0].target, "Mẩu Tử Tối");
  assert.equal(g.locked, false);
});

test("glossary: normalize bảng hỏng → bảng rỗng, không crash", () => {
  assert.deepEqual(normalizeGlossary(null).terms, []);
  assert.deepEqual(normalizeGlossary("x").terms, []);
  assert.deepEqual(normalizeGlossary({ terms: 5 }).terms, []);
  assert.equal(normalizeGlossary(EMPTY_GLOSSARY).locked, false);
});

test("glossary: ước tính lượt đọc hiểu = 1/2 bước dịch theo ngữ cảnh", () => {
  assert.equal(estimateGlossarySuggestSeconds(60), 30);
  assert.equal(estimateGlossarySuggestSeconds(0), 3, "sàn 3 giây");
  assert.equal(estimateGlossarySuggestSeconds(-5), 3);
  assert.equal(estimateGlossarySuggestSeconds(Number.NaN), 3);
  assert.equal(estimateGlossarySuggestSeconds(5), 3, "sàn 3 giây");
});

test("glossary: class vi phạm — chỉ khi cờ boolean bật", () => {
  assert.equal(glossaryViolationClass({ glossaryViolation: true }), "is-glossary-violation");
  assert.equal(glossaryViolationClass({ glossaryViolation: false }), "");
  assert.equal(glossaryViolationClass({}), "");
  assert.equal(glossaryViolationClass(null), "");
  assert.equal(glossaryViolationClass(undefined), "");
});

test("glossary: dòng nháp (trống) — nhận biết", () => {
  assert.equal(isBlankTerm({ source: "", target: "", note: null }), true);
  assert.equal(isBlankTerm({ source: "   ", target: "x", note: null }), true);
  assert.equal(isBlankTerm({ source: "Dark Templar", target: "", note: null }), false);
  assert.equal(isBlankPronoun({ speaker: "", listener: "", selfTerm: "", addressTerm: "" }), true);
  assert.equal(isBlankPronoun({ speaker: "A", listener: "", selfTerm: "", addressTerm: "" }), false);
});

test("glossary: thêm dòng nháp vào cuối bảng", () => {
  const g = appendBlankTerm(CURRENT);
  assert.equal(g.terms.length, 2);
  assert.equal(isBlankTerm(g.terms[1]), true);
  assert.equal(g.terms[0].source, "Dark Templar", "không mất mục cũ");
  const p = appendBlankPronoun(CURRENT);
  assert.equal(p.pronouns.length, 2);
  assert.equal(isBlankPronoun(p.pronouns[1]), true);
});

test("glossary: bỏ dòng nháp trước khi ghi xuống đĩa", () => {
  const withDraft = appendBlankTerm(CURRENT);
  const clean = stripBlankRows(withDraft);
  assert.equal(clean.terms.length, 1);
  assert.equal(clean.pronouns.length, 1);
  assert.equal(withDraft.terms.length, 2, "bản gốc không bị mutate");
});

test("glossary: số mục KHÔNG tính dòng nháp", () => {
  assert.equal(glossaryEntryCount(CURRENT), 2);
  assert.equal(glossaryEntryCount(appendBlankTerm(CURRENT)), 2, "dòng nháp không tính");
  assert.equal(glossaryEntryCount(appendBlankPronoun(CURRENT)), 2);
});
