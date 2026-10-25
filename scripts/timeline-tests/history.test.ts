/**
 * Unit test cho `src/lib/timeline/history.ts` (undo/redo past/future).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  canRedo,
  canUndo,
  createHistory,
  HISTORY_LIMIT,
  pushHistory,
  redoHistory,
  undoHistory,
} from "../../src/lib/timeline/history.ts";

test("history: lịch sử mới rỗng", () => {
  const h = createHistory<string>();
  assert.deepEqual(h.past, []);
  assert.deepEqual(h.future, []);
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), false);
});

test("history: push thêm snapshot vào past", () => {
  let h = createHistory<string>();
  h = pushHistory(h, "a");
  h = pushHistory(h, "b");
  assert.deepEqual(h.past, ["a", "b"]);
  assert.equal(canUndo(h), true);
});

test("history: thao tác MỚI xoá sạch future", () => {
  let h = createHistory<string>();
  h = pushHistory(h, "a");
  h = undoHistory(h, "a").history; // undo → future có "a"
  assert.equal(canRedo(h), true);
  h = pushHistory(h, "x"); // thao tác mới → future bị xoá
  assert.deepEqual(h.future, []);
  assert.equal(canRedo(h), false);
});

test("history: undo trả snapshot và đẩy hiện tại vào future", () => {
  let h = createHistory<string>();
  h = pushHistory(h, "before");
  const step = undoHistory(h, "after");
  assert.equal(step.snapshot, "before");
  assert.deepEqual(step.history.past, []);
  assert.deepEqual(step.history.future, ["after"]);
});

test("history: redo trả snapshot và đẩy hiện tại vào past", () => {
  let h = createHistory<string>();
  h = pushHistory(h, "before");
  const undone = undoHistory(h, "after");
  const redone = redoHistory(undone.history, "before");
  assert.equal(redone.snapshot, "after");
  assert.deepEqual(redone.history.past, ["before"]);
  assert.deepEqual(redone.history.future, []);
});

test("history: undo khi rỗng → không làm gì", () => {
  const h = createHistory<string>();
  const step = undoHistory(h, "now");
  assert.equal(step.snapshot, null);
  assert.deepEqual(step.history.past, []);
});

test("history: redo khi rỗng → không làm gì", () => {
  const h = createHistory<string>();
  const step = redoHistory(h, "now");
  assert.equal(step.snapshot, null);
  assert.deepEqual(step.history.future, []);
});

test("history: giới hạn 20 bước", () => {
  let h = createHistory<number>();
  for (let i = 0; i < 30; i += 1) h = pushHistory(h, i);
  assert.equal(h.past.length, HISTORY_LIMIT);
  assert.equal(h.past[0], 10);
  assert.equal(h.past[HISTORY_LIMIT - 1], 29);
});

test("history: vòng lặp undo/redo nhiều lần giữ đúng trạng thái", () => {
  let h = createHistory<string>();
  h = pushHistory(h, "s1");
  h = pushHistory(h, "s2");
  const u1 = undoHistory(h, "s3");
  assert.equal(u1.snapshot, "s2");
  const u2 = undoHistory(u1.history, "s2");
  assert.equal(u2.snapshot, "s1");
  const r1 = redoHistory(u2.history, "s1");
  assert.equal(r1.snapshot, "s2");
  const r2 = redoHistory(r1.history, "s2");
  assert.equal(r2.snapshot, "s3");
});
