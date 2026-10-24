/**
 * Unit test cho `src/lib/timeline/markers.ts`.
 * Chạy: node --test scripts/timeline-tests/
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  addMarker,
  deserializeMarkers,
  findMarkerAt,
  findNextMarker,
  findPrevMarker,
  MARKER_MERGE_EPSILON,
  nextMarkerId,
  removeMarker,
  serializeMarkers,
  sortMarkers,
  toggleMarker,
} from "../../src/lib/timeline/markers.ts";

test("markers: thêm marker", () => {
  const list = addMarker([], 12.5, { name: "Mở đầu" });
  assert.equal(list.length, 1);
  assert.equal(list[0].time, 12.5);
  assert.equal(list[0].name, "Mở đầu");
  assert.equal(list[0].id, "m1");
});

test("markers: thêm trùng (< 0.05s) thì gộp, không nhân bản", () => {
  let list = addMarker([], 10);
  list = addMarker(list, 10 + MARKER_MERGE_EPSILON / 2);
  assert.equal(list.length, 1);
});

test("markers: thêm ở khoảng cách đủ xa thì tạo marker mới", () => {
  let list = addMarker([], 10);
  list = addMarker(list, 10.2);
  assert.equal(list.length, 2);
  assert.equal(list[1].id, "m2");
});

test("markers: thêm ở thời điểm không hợp lệ -> giữ nguyên danh sách", () => {
  const list = addMarker([], Number.NaN);
  assert.equal(list.length, 0);
});

test("markers: findMarkerAt theo ngưỡng", () => {
  const list = addMarker([], 10);
  assert.notEqual(findMarkerAt(list, 10.01), null);
  assert.equal(findMarkerAt(list, 10.5), null);
});

test("markers: xoá marker theo id", () => {
  const list = addMarker([], 10);
  assert.equal(removeMarker(list, "m1").length, 0);
  assert.equal(removeMarker(list, "khong-ton-tai").length, 1);
});

test("markers: toggle bật/tắt", () => {
  let list = toggleMarker([], 10);
  assert.equal(list.length, 1);
  list = toggleMarker(list, 10);
  assert.equal(list.length, 0);
});

test("markers: tìm marker trước / sau playhead", () => {
  let list = addMarker([], 5);
  list = addMarker(list, 10);
  list = addMarker(list, 20);

  const next = findNextMarker(list, 10);
  assert.notEqual(next, null);
  assert.equal((next as { time: number }).time, 20);

  const prev = findPrevMarker(list, 10);
  assert.notEqual(prev, null);
  assert.equal((prev as { time: number }).time, 5);
});

test("markers: marker đúng tại playhead không được trả về", () => {
  const list = addMarker([], 10);
  assert.equal(findNextMarker(list, 10), null);
  assert.equal(findPrevMarker(list, 10), null);
});

test("markers: sắp xếp theo thời gian", () => {
  let list = addMarker([], 30);
  list = addMarker(list, 10);
  list = addMarker(list, 20);
  const sorted = sortMarkers(list);
  assert.deepEqual(
    sorted.map((marker) => marker.time),
    [10, 20, 30],
  );
});

test("markers: sinh id tự động không trùng", () => {
  const list = addMarker([], 1);
  assert.equal(nextMarkerId(list), "m2");
  assert.equal(nextMarkerId([]), "m1");
});

test("markers: serialize -> deserialize giữ nguyên dữ liệu", () => {
  let list = addMarker([], 10, { name: "A", color: "#fff" });
  list = addMarker(list, 20);
  const json = serializeMarkers(list);
  const back = deserializeMarkers(json);
  assert.equal(back.length, 2);
  assert.equal(back[0].time, 10);
  assert.equal(back[0].name, "A");
  assert.equal(back[0].color, "#fff");
});

test("markers: deserialize JSON hỏng -> mảng rỗng", () => {
  assert.deepEqual(deserializeMarkers("{khong phai json"), []);
  assert.deepEqual(deserializeMarkers(""), []);
  assert.deepEqual(deserializeMarkers("123"), []);
});

test("markers: deserialize bỏ qua mục không hợp lệ", () => {
  const json = JSON.stringify({
    version: 1,
    markers: [
      { id: "m1", time: 5 },
      { id: "", time: 6 },
      { id: "m3", time: "x" },
      { id: "m4", time: -1 },
      null,
    ],
  });
  const back = deserializeMarkers(json);
  assert.equal(back.length, 1);
  assert.equal(back[0].id, "m1");
});
