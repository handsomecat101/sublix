//! TSK-FEAT-GLOSSARY-PRONOUN — test logic thuần của bảng glossary.
//! Chạy: node --test scripts/glossary-tests/

import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptSuggestion,
  addPronoun,
  addTerm,
  emptyGlossary,
  glossaryStats,
  hasContent,
  isPronounComplete,
  isTermComplete,
  normalizeGlossary,
  rejectSuggestion,
  removePronoun,
  removeTerm,
  scopeLabel,
  termKey,
  updatePronoun,
  updateTerm,
} from "../../src/components/glossary/glossaryModel.ts";
import type { Glossary, GlossarySuggestion } from "../../src/components/glossary/glossaryModel.ts";

function g(): Glossary {
  return {
    terms: [{ source: "Dark Templar", target: "Mẫu Tử Tối", note: null }],
    pronouns: [
      { speaker: "zeratul", listener: "kaldares", selfTerm: "ta", addressTerm: "ngươi" },
    ],
    locked: false,
  };
}

test("emptyGlossary rỗng", () => {
  const e = emptyGlossary();
  assert.equal(e.terms.length, 0);
  assert.equal(e.pronouns.length, 0);
  assert.equal(e.locked, false);
  assert.equal(hasContent(e), false);
});

test("normalize cắt khoảng trắng và loại trùng", () => {
  const n = normalizeGlossary({
    terms: [
      { source: "  Dark Templar  ", target: "  Mẫu Tử Tối ", note: "  " },
      { source: "dark templar", target: "khác", note: null },
      { source: "", target: "x", note: null },
    ],
    pronouns: [
      { speaker: " zeratul ", listener: "kaldares", selfTerm: " ta ", addressTerm: " ngươi " },
      { speaker: "ZERATUL", listener: "Kaldares", selfTerm: "tôi", addressTerm: "anh" },
    ],
    locked: false,
  });
  assert.equal(n.terms.length, 1);
  assert.equal(n.terms[0].source, "Dark Templar");
  assert.equal(n.terms[0].target, "Mẫu Tử Tối");
  assert.equal(n.terms[0].note, null);
  assert.equal(n.pronouns.length, 1);
  assert.equal(n.pronouns[0].speaker, "zeratul");
  assert.equal(n.pronouns[0].selfTerm, "ta");
});

test("termKey không phân biệt hoa thường", () => {
  assert.equal(termKey({ source: "Dark Templar", target: "" }), "dark templar");
});

test("addTerm thay thế khi trùng gốc", () => {
  let x = addTerm(g(), { source: "dark templar", target: "Mới", note: null });
  assert.equal(x.terms.length, 1);
  assert.equal(x.terms[0].target, "Mới");
  x = addTerm(x, { source: "Kala", target: "Cala", note: null });
  assert.equal(x.terms.length, 2);
});

test("updateTerm / removeTerm theo vị trí", () => {
  const x = updateTerm(g(), 0, { source: "Dark Templar", target: "Mẫu Tử", note: "ghi chú" });
  assert.equal(x.terms[0].target, "Mẫu Tử");
  assert.equal(x.terms[0].note, "ghi chú");
  const y = removeTerm(x, 0);
  assert.equal(y.terms.length, 0);
});

test("thao tác ngoài phạm vi không làm hỏng bảng", () => {
  const x = g();
  assert.equal(updateTerm(x, 9, { source: "a", target: "b" }), x);
  assert.equal(removeTerm(x, -1), x);
  assert.equal(updatePronoun(x, 9, { speaker: "a", listener: "b", selfTerm: "c", addressTerm: "d" }), x);
  assert.equal(removePronoun(x, 9), x);
});

test("addPronoun thay thế khi trùng cặp", () => {
  let x = addPronoun(g(), {
    speaker: "Zeratul",
    listener: "Kaldares",
    selfTerm: "tôi",
    addressTerm: "anh",
  });
  assert.equal(x.pronouns.length, 1);
  assert.equal(x.pronouns[0].addressTerm, "anh");
});

test("isTermComplete / isPronounComplete", () => {
  assert.equal(isTermComplete({ source: "a", target: "b" }), true);
  assert.equal(isTermComplete({ source: "a", target: "" }), false);
  assert.equal(isTermComplete({ source: "", target: "b" }), false);
  assert.equal(
    isPronounComplete({ speaker: "a", listener: "b", selfTerm: "c", addressTerm: "d" }),
    true,
  );
  assert.equal(
    isPronounComplete({ speaker: "a", listener: "b", selfTerm: "", addressTerm: "d" }),
    false,
  );
});

test("acceptSuggestion nhận cặp thuật ngữ và quy tắc xưng hô", () => {
  const s: GlossarySuggestion = {
    characters: [],
    terms: [{ source: "Kala", target: "Cala", note: null }],
    pronouns: [
      { speaker: "", listener: "Kaldares", selfTerm: "tôi", addressTerm: "anh" },
    ],
  };
  let x = acceptSuggestion(emptyGlossary(), s, "term", 0);
  assert.equal(x.terms.length, 1);
  assert.equal(x.terms[0].source, "Kala");
  x = acceptSuggestion(x, s, "pronoun", 0);
  assert.equal(x.pronouns.length, 1);
  assert.equal(x.pronouns[0].listener, "Kaldares");
});

test("rejectSuggestion bỏ dòng gợi ý, không đụng bảng", () => {
  const s: GlossarySuggestion = {
    characters: [],
    terms: [
      { source: "A", target: "1", note: null },
      { source: "B", target: "2", note: null },
    ],
    pronouns: [],
  };
  const r = rejectSuggestion(s, "term", 0);
  assert.equal(r.terms.length, 1);
  assert.equal(r.terms[0].source, "B");
  assert.equal(s.terms.length, 2, "gợi ý gốc không bị sửa");
});

test("glossaryStats đếm đúng", () => {
  const st = glossaryStats({
    terms: [
      { source: "A", target: "1", note: null },
      { source: "B", target: "", note: "chỉ ghi chú" },
    ],
    pronouns: [
      { speaker: "a", listener: "b", selfTerm: "c", addressTerm: "d" },
      { speaker: "a", listener: "c", selfTerm: "", addressTerm: "" },
    ],
    locked: false,
  });
  assert.equal(st.termCount, 1);
  assert.equal(st.noteCount, 1);
  assert.equal(st.pronounCount, 1);
  assert.equal(st.complete, true);
});

test("scopeLabel hiển thị nơi lưu", () => {
  assert.equal(scopeLabel(emptyGlossary()), "Chưa lưu");
  assert.equal(scopeLabel({ ...emptyGlossary(), scope: "global" }), "Toàn cục (mọi dự án)");
  assert.match(scopeLabel({ ...emptyGlossary(), scope: "project", path: "a.json" }), /Theo dự án/);
});
