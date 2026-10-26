/**
 * Test `src/lib/subtitles/kineticTiming.ts` (TSK-V014-KINETIC-TS).
 *
 * - Mọi vector trong `scripts/kinetic-tests/vectors.json` phải khớp **từng số**
 *   (cùng bộ vectors với bản Rust ⇒ xem thử và xuất video ra cùng kết quả).
 * - `activeWordIndex` cho khung xem thử: trước câu / giữa / đúng ranh giới / sau câu.
 *
 * Chạy: node --test scripts/kinetic-tests/kineticTiming.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  activeWordIndex,
  tokenizeWords,
  wordTimings,
  wordWeight,
  type WordTiming,
} from "../../src/lib/subtitles/kineticTiming.ts";

interface KineticVector {
  text: string;
  start: number;
  end: number;
  expected: WordTiming[];
}

interface VectorsFile {
  algorithm: string;
  vectors: KineticVector[];
}

const VECTORS_URL = new URL("./vectors.json", import.meta.url);
const vectorsFile = JSON.parse(readFileSync(VECTORS_URL, "utf8")) as VectorsFile;

test("vectors.json: đúng phiên bản thuật toán v1 và có vector", () => {
  assert.ok(
    vectorsFile.algorithm.startsWith("v1:"),
    `vectors.json không phải thuật toán v1: ${vectorsFile.algorithm.slice(0, 40)}…`,
  );
  assert.ok(Array.isArray(vectorsFile.vectors));
  assert.ok(vectorsFile.vectors.length > 0);
});

for (const [index, vector] of vectorsFile.vectors.entries()) {
  test(`vector #${index + 1}: "${vector.text}"`, () => {
    const actual = wordTimings(vector.text, vector.start, vector.end);
    assert.deepEqual(actual, vector.expected);

    // Bất biến: offset cộng dồn liên tục + tổng durCs = totalCs = round((end-start)*100).
    if (actual.length === 0) return; // câu rỗng ⇒ không có gì để chia
    const totalCs = Math.max(0, Math.round((vector.end - vector.start) * 100));
    let offset = 0;
    for (const timing of actual) {
      assert.equal(timing.offsetCs, offset, `offsetCs của "${timing.word}"`);
      assert.ok(timing.durCs >= 0, `durCs âm ở "${timing.word}"`);
      offset += timing.durCs;
    }
    assert.equal(offset, totalCs, "tổng durCs phải bằng tổng thời lượng câu");
  });
}

// ------------------------------------------------------------------ tokenizeWords

test("tokenizeWords: rỗng / khoảng trắng", () => {
  assert.deepEqual(tokenizeWords(""), []);
  assert.deepEqual(tokenizeWords("   \t\n "), []);
});

test("tokenizeWords: có khoảng trắng -> tách theo \\s+ (kể cả nhiều khoảng trắng)", () => {
  assert.deepEqual(tokenizeWords("  Xin   chào\tcác  bạn "), ["Xin", "chào", "các", "bạn"]);
});

test("tokenizeWords: không khoảng trắng, không CJK -> cả chuỗi", () => {
  assert.deepEqual(tokenizeWords("xin-chào"), ["xin-chào"]);
});

test("tokenizeWords: CJK -> từng chữ, dấu câu dính vào chữ trước", () => {
  assert.deepEqual(tokenizeWords("你好，世界！"), ["你", "好，", "世", "界！"]);
  assert.deepEqual(tokenizeWords("界！！"), ["界！！"]); // nhiều dấu câu vẫn dính 1 token
  assert.deepEqual(tokenizeWords("你(好)"), ["你(", "好)"]); // ngoặc dính token trước
  assert.deepEqual(tokenizeWords("我们今天去哪里"), ["我", "们", "今", "天", "去", "哪", "里"]);
});

test("tokenizeWords: dấu câu đứng trước chữ CJK đầu -> gắn vào chữ đó", () => {
  assert.deepEqual(tokenizeWords("，你好"), ["，你", "好"]);
  assert.deepEqual(tokenizeWords("“你好”"), ["“你", "好”"]);
});

test("tokenizeWords: CJK có khoảng trắng -> vẫn tách theo khoảng trắng", () => {
  assert.deepEqual(tokenizeWords("你好 世界"), ["你好", "世界"]);
});

// ------------------------------------------------------------------ wordWeight

test("wordWeight: 1, +0.6 khi kết thúc bằng dấu ngắt câu", () => {
  assert.equal(wordWeight("Xin"), 1);
  assert.equal(wordWeight("lớn."), 1.6);
  assert.equal(wordWeight("rồi..."), 1.6);
  assert.equal(wordWeight("界！"), 1.6);
  assert.equal(wordWeight("này,"), 1.6);
  assert.equal(wordWeight("thôi!"), 1.6);
  // Dấu đóng ngoặc/nháy KHÔNG phải dấu ngắt câu.
  assert.equal(wordWeight("(ghi)"), 1);
  assert.equal(wordWeight("“trích”"), 1);
});

// ------------------------------------------------------------------ activeWordIndex

/** Câu "Thời điểm này, Heather khoảng 18 tuổi, sống ở Lawrenceville." — vector #3. */
const SEG_START = 6.48;
const SEG: WordTiming[] = wordTimings(
  "Thời điểm này, Heather khoảng 18 tuổi, sống ở Lawrenceville.",
  SEG_START,
  13.11,
);

/** Thời điểm (giây) tại đúng mốc bắt đầu của từ thứ `index` trong câu. */
function startOf(index: number): number {
  return SEG_START + SEG[index].offsetCs / 100;
}

test("activeWordIndex: câu chia đúng 10 từ, tổng 663 cs", () => {
  assert.equal(SEG.length, 10);
  assert.equal(SEG[SEG.length - 1].offsetCs + SEG[SEG.length - 1].durCs, 663);
});

test("activeWordIndex: trước câu -> -1", () => {
  assert.equal(activeWordIndex(SEG, SEG_START, SEG_START - 0.001), -1);
  assert.equal(activeWordIndex(SEG, SEG_START, SEG_START - 1), -1);
  assert.equal(activeWordIndex(SEG, SEG_START, 0), -1);
});

test("activeWordIndex: đúng đầu câu -> từ đầu", () => {
  assert.equal(activeWordIndex(SEG, SEG_START, SEG_START), 0);
});

test("activeWordIndex: giữa câu -> đúng từ đang nói", () => {
  assert.equal(activeWordIndex(SEG, SEG_START, startOf(0) + 0.001), 0);
  assert.equal(activeWordIndex(SEG, SEG_START, startOf(1) + 0.001), 1);
  assert.equal(activeWordIndex(SEG, SEG_START, startOf(4) + 0.02), 4);
  assert.equal(activeWordIndex(SEG, SEG_START, startOf(9) + 0.01), 9);
});

test("activeWordIndex: đúng ranh giới từ -> từ MỚI (kể cả lệch dấu phẩy động)", () => {
  assert.equal(activeWordIndex(SEG, SEG_START, startOf(1)), 1); // 7.04
  assert.equal(activeWordIndex(SEG, SEG_START, startOf(2)), 2); // 7.60 (6.48 + 1.12)
  assert.equal(activeWordIndex(SEG, SEG_START, startOf(3)), 3); // 8.49
  assert.equal(activeWordIndex(SEG, SEG_START, startOf(9)), 9);
});

test("activeWordIndex: ngay trước ranh giới -> vẫn từ cũ", () => {
  assert.equal(activeWordIndex(SEG, SEG_START, startOf(1) - 0.0001), 0);
  assert.equal(activeWordIndex(SEG, SEG_START, startOf(2) - 0.0001), 1);
});

test("activeWordIndex: đúng cuối câu / sau câu -> -1", () => {
  assert.equal(activeWordIndex(SEG, SEG_START, SEG_START + 6.63), -1);
  assert.equal(activeWordIndex(SEG, SEG_START, SEG_START + 6.63 + 0.001), -1);
  assert.equal(activeWordIndex(SEG, SEG_START, SEG_START + 100), -1);
});

test("activeWordIndex: câu ngắn 4 từ 50 cs (vector #1)", () => {
  const seg = wordTimings("Xin chào các bạn", 0, 2);
  assert.equal(activeWordIndex(seg, 0, 0), 0);
  assert.equal(activeWordIndex(seg, 0, 0.4999), 0);
  assert.equal(activeWordIndex(seg, 0, 0.5), 1);
  assert.equal(activeWordIndex(seg, 0, 1.0), 2);
  assert.equal(activeWordIndex(seg, 0, 1.999), 3);
  assert.equal(activeWordIndex(seg, 0, 2.0), -1);
});

test("activeWordIndex: danh sách rỗng hoặc t không hợp lệ -> -1", () => {
  assert.equal(activeWordIndex([], 0, 0.5), -1);
  assert.equal(activeWordIndex(SEG, SEG_START, Number.NaN), -1);
  assert.equal(activeWordIndex(SEG, SEG_START, Number.POSITIVE_INFINITY), -1);
});

test("activeWordIndex: câu thời lượng 0 -> luôn -1 (không có từ nào được nói)", () => {
  const seg = wordTimings("a b c", 5, 5);
  assert.equal(seg.length, 3);
  assert.equal(activeWordIndex(seg, 5, 5), -1);
  assert.equal(activeWordIndex(seg, 5, 4.999), -1);
  assert.equal(activeWordIndex(seg, 5, 5.001), -1);
});
