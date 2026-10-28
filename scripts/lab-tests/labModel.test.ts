import test from "node:test";
import assert from "node:assert/strict";
import {
  syllableCount,
  estimateSeconds,
  formatDur,
  ratioToMinutes,
  processingEstimate,
  checkRecapRules,
  checkDuration,
  moveItem,
  insertOst,
  splitBlock,
  mergeBlock,
  narrationNav,
  type RecapItem,
} from "../../src/views/lab/labModel.ts";

test("syllableCount — đếm đúng số từ/âm tiết tiếng Việt", () => {
  assert.equal(syllableCount(""), 0);
  assert.equal(syllableCount("   "), 0);
  assert.equal(syllableCount("Vương Miện Tro Tàn"), 4);
  assert.equal(syllableCount("Malenia, Lưỡi kiếm của Miquella!"), 5);
  assert.equal(syllableCount("Boss 1: Đao phủ tro tàn (Cấp 99)"), 8);
});

test("estimateSeconds — ước lượng thời lượng đọc tiếng Việt theo nhịp", () => {
  assert.equal(estimateSeconds(""), 0);
  // 41 âm tiết với tốc độ 4.1 wps = 10.0 giây
  const words41 = Array(41).fill("từ").join(" ");
  assert.equal(estimateSeconds(words41, 4.1), 10.0);
  // 20 âm tiết với tốc độ 4.0 wps = 5.0 giây
  const words20 = Array(20).fill("từ").join(" ");
  assert.equal(estimateSeconds(words20, 4.0), 5.0);
});

test("formatDur — hiển thị MM:SS và H:MM:SS", () => {
  assert.equal(formatDur(0), "0:00");
  assert.equal(formatDur(59), "0:59");
  assert.equal(formatDur(65), "1:05");
  assert.equal(formatDur(624), "10:24");
  assert.equal(formatDur(3600), "1:00:00");
  assert.equal(formatDur(3665), "1:01:05");
  assert.equal(formatDur(-5), "0:00");
});

test("ratioToMinutes — quy đổi tỷ lệ thoại gốc sang phút", () => {
  const r = ratioToMinutes(0.3, 600); // 10 phút
  assert.equal(r.keptSec, 180);
  assert.equal(r.keptMinStr, "3:00");
  assert.equal(r.textRatioStr, "30%");

  const r0 = ratioToMinutes(0, 600);
  assert.equal(r0.keptSec, 0);
  assert.equal(r0.keptMinStr, "0:00");
});

test("processingEstimate — phân loại thời gian xử lý video đầu vào", () => {
  const normal = processingEstimate(3600); // 1 giờ
  assert.equal(normal.level, "normal");
  assert.equal(normal.etaMin, 10);

  const warn = processingEstimate(4 * 3600); // 4 giờ
  assert.equal(warn.level, "warn");

  const danger = processingEstimate(10 * 3600); // 10 giờ
  assert.equal(danger.level, "danger");
});

test("checkRecapRules — hợp lệ không có vi phạm nào", () => {
  const items: RecapItem[] = [
    {
      id: 1,
      sourceIdx: 0,
      start: 10,
      end: 20,
      picture: "Cảnh mở đầu",
      narration: "Bóng tối bao trùm vương quốc tro tàn.",
      keepOriginal: false,
    },
    {
      id: 2,
      sourceIdx: 0,
      start: 25,
      end: 30,
      picture: "Tướng quân thét",
      narration: "Kẻ xâm lăng đã tới!",
      keepOriginal: true,
    },
    {
      id: 3,
      sourceIdx: 0,
      start: 35,
      end: 45,
      picture: "Chiến binh rút kiếm",
      narration: "Anh quyết định không thể lùi bước.",
      keepOriginal: false,
    },
  ];

  const violations = checkRecapRules(items);
  assert.equal(violations.length, 0);
});

test("checkRecapRules — bắt luật R1 (mở đầu không được là thoại gốc)", () => {
  const items: RecapItem[] = [
    {
      id: 1,
      sourceIdx: 0,
      start: 0,
      end: 5,
      picture: "Thoại gốc mở đầu",
      narration: "Ta là vua!",
      keepOriginal: true,
    },
  ];
  const violations = checkRecapRules(items);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "R1");
  assert.equal(violations[0].itemId, 1);
  assert.match(violations[0].messageVi, /Đoạn đầu tiên phải là lời bình/);
});

test("checkRecapRules — bắt luật R2 (không quá 2 thoại gốc liền nhau)", () => {
  const items: RecapItem[] = [
    {
      id: 1,
      sourceIdx: 0,
      start: 0,
      end: 5,
      picture: "Mở đầu",
      narration: "Câu mở đầu.",
      keepOriginal: false,
    },
    { id: 2, sourceIdx: 0, start: 6, end: 10, picture: "Thoại 1", narration: "A", keepOriginal: true },
    { id: 3, sourceIdx: 0, start: 11, end: 15, picture: "Thoại 2", narration: "B", keepOriginal: true },
    { id: 4, sourceIdx: 0, start: 16, end: 20, picture: "Thoại 3", narration: "C", keepOriginal: true },
  ];
  const violations = checkRecapRules(items);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "R2");
  assert.equal(violations[0].itemId, 4);
  assert.match(violations[0].messageVi, /Quá 2 đoạn giữ thoại gốc liền nhau/);
});

test("checkRecapRules — bắt luật R3 (đổi video nguồn phải có câu nối lời bình)", () => {
  const items: RecapItem[] = [
    { id: 1, sourceIdx: 0, start: 0, end: 5, picture: "Mở đầu", narration: "Câu 1.", keepOriginal: false },
    { id: 2, sourceIdx: 1, start: 0, end: 5, picture: "Đoạn video mới thoại gốc", narration: "Ta đây!", keepOriginal: true },
  ];
  const violations = checkRecapRules(items);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "R3");
  assert.equal(violations[0].itemId, 2);
  assert.match(violations[0].messageVi, /Đổi sang video nguồn #2 nhưng đoạn này vẫn giữ thoại gốc/);
});

test("checkRecapRules — bắt luật R4 (thời gian không hợp lệ) và R6 (lời bình rỗng)", () => {
  const items: RecapItem[] = [
    { id: 1, sourceIdx: 0, start: 10, end: 5, picture: "Nghịch lý", narration: "", keepOriginal: false },
  ];
  const violations = checkRecapRules(items);
  const rules = violations.map((v) => v.rule);
  assert.ok(rules.includes("R4"));
  assert.ok(rules.includes("R6"));
});

test("checkRecapRules — bắt luật R5 (chồng lấn thời gian trong cùng video)", () => {
  const items: RecapItem[] = [
    { id: 1, sourceIdx: 0, start: 10, end: 20, picture: "Cảnh 1", narration: "Lời bình 1.", keepOriginal: false },
    { id: 2, sourceIdx: 0, start: 15, end: 25, picture: "Cảnh 2 trùng", narration: "Lời bình 2.", keepOriginal: false },
  ];
  const violations = checkRecapRules(items);
  const r5 = violations.find((v) => v.rule === "R5");
  assert.ok(r5);
  assert.equal(r5.itemId, 2);
  assert.match(r5.messageVi, /Thời gian bị chồng lấn với đoạn #1/);
});

test("checkDuration — kiểm tra độ lệch thời lượng kịch bản so với đích", () => {
  const items: RecapItem[] = [
    { id: 1, sourceIdx: 0, start: 0, end: 10, picture: "Cảnh", narration: "Đoạn lời bình dài mười giây.", keepOriginal: false, ttsSecs: 10 },
  ];

  // Đích 10s, thực tế 10s ⇒ OK
  const ok = checkDuration(items, 10);
  assert.equal(ok.status, "ok");

  // Đích 10s, thực tế 12s (lệch 20%) ⇒ WARN
  const warn = checkDuration(items, 8.3);
  assert.equal(warn.status, "warn");

  // Đích 10s, thực tế 20s (lệch 100%) ⇒ DANG
  const dang = checkDuration(items, 5);
  assert.equal(dang.status, "dang");
});

test("moveItem, insertOst, splitBlock, mergeBlock — thao tác danh sách đoạn", () => {
  const list = [1, 2, 3, 4];
  assert.deepEqual(moveItem(list, 0, 2), [2, 3, 1, 4]);

  const items: RecapItem[] = [
    { id: 1, sourceIdx: 0, start: 0, end: 10, picture: "", narration: "Câu đầu tiên. Câu thứ hai.", keepOriginal: false },
    { id: 2, sourceIdx: 0, start: 10, end: 20, picture: "", narration: "Câu tiếp theo.", keepOriginal: false },
  ];

  // Thử insertOst
  const ost: RecapItem = { id: 99, sourceIdx: 0, start: 5, end: 8, picture: "OST", narration: "Thoại", keepOriginal: true };
  const inserted = insertOst(items, 0, ost);
  assert.equal(inserted.length, 3);
  assert.equal(inserted[1].id, 99);

  // Thử splitBlock
  const split = splitBlock(items, 0, 14); // Cắt sau dấu chấm
  assert.equal(split.length, 3);
  assert.equal(split[0].narration, "Câu đầu tiên.");
  assert.equal(split[1].narration, "Câu thứ hai.");

  // Thử mergeBlock
  const merged = mergeBlock(items, 0);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].narration, "Câu đầu tiên. Câu thứ hai. Câu tiếp theo.");
});

test("narrationNav — điều hướng bàn phím không vượt biên", () => {
  assert.equal(narrationNav(0, "ArrowUp", 5), 0);
  assert.equal(narrationNav(0, "ArrowDown", 5), 1);
  assert.equal(narrationNav(4, "ArrowDown", 5), 4);
  assert.equal(narrationNav(2, "Home", 5), 0);
  assert.equal(narrationNav(2, "End", 5), 4);
});
