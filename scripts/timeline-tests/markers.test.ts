/**
 * Unit test cho `normalizeMarkers` trong `src/lib/timeline/markers.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MARKER_COLOR,
  deserializeMarkers,
  normalizeMarkers,
} from "../../src/lib/timeline/markers.ts";

test("markers: dạng cũ — số giây thuần", () => {
  const out = normalizeMarkers([12.5, 30]);
  assert.equal(out.length, 2);
  assert.equal(out[0].time, 12.5);
  assert.equal(out[0].color, DEFAULT_MARKER_COLOR);
  assert.ok(out[0].id.length > 0);
  assert.ok(out[1].id !== out[0].id);
});

test("markers: dạng cũ — object thiếu id / thiếu color", () => {
  const out = normalizeMarkers([{ time: 5 }, { id: "x1", time: 9 }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "m1");
  assert.equal(out[0].color, DEFAULT_MARKER_COLOR);
  assert.equal(out[1].id, "x1");
  assert.equal(out[1].color, DEFAULT_MARKER_COLOR);
});

test("markers: time là chuỗi / key thời gian khác", () => {
  assert.equal(normalizeMarkers([{ time: "12.5" }])[0].time, 12.5);
  assert.equal(normalizeMarkers([{ seconds: 7 }])[0].time, 7);
  assert.equal(normalizeMarkers([{ start: 3 }])[0].time, 3);
  assert.equal(normalizeMarkers([{ position: 4 }])[0].time, 4);
});

test("markers: bọc trong object (version/markers/items)", () => {
  assert.equal(normalizeMarkers({ version: 1, markers: [{ time: 1 }] }).length, 1);
  assert.equal(normalizeMarkers({ items: [{ time: 1 }] }).length, 1);
});

test("markers: dữ liệu hỏng / rỗng → không crash", () => {
  assert.deepEqual(normalizeMarkers(null), []);
  assert.deepEqual(normalizeMarkers(undefined), []);
  assert.deepEqual(normalizeMarkers("abc"), []);
  // time không parse được / âm / phần tử rác bị bỏ; số thuần 7 vẫn hợp lệ.
  const out = normalizeMarkers([{ time: "x" }, { time: -3 }, null, 7]);
  assert.equal(out.length, 1);
  assert.equal(out[0].time, 7);
});

test("markers: id trùng nhau → sinh id mới", () => {
  const out = normalizeMarkers([{ id: "a", time: 1 }, { id: "a", time: 2 }]);
  assert.equal(out.length, 2);
  assert.notEqual(out[0].id, out[1].id);
});

test("markers: giữ name nếu có, sắp xếp theo thời gian", () => {
  const out = normalizeMarkers([{ time: 10, name: "B" }, { time: 2, name: "A" }]);
  assert.equal(out[0].time, 2);
  assert.equal(out[0].name, "A");
  assert.equal(out[1].name, "B");
});

test("markers: deserializeMarkers dùng normalizeMarkers (chịu dạng cũ)", () => {
  const out = deserializeMarkers(JSON.stringify([12.5, { time: 20 }]));
  assert.equal(out.length, 2);
  assert.equal(out[0].time, 12.5);
  assert.equal(out[1].time, 20);
  assert.deepEqual(deserializeMarkers("khong phai json"), []);
});
