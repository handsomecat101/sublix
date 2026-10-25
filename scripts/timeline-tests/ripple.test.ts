/**
 * Unit test cho `src/lib/timeline/ripple.ts` (ripple delete).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { rippleDelete } from "../../src/lib/timeline/ripple.ts";

interface Seg {
  id: number;
  start: number;
  end: number;
  speakerId?: string;
}

/** 4 câu liền nhau 0-2, 2-4, 4-6, 6-8. */
const BASE: Seg[] = [
  { id: 1, start: 0, end: 2 },
  { id: 2, start: 2, end: 4 },
  { id: 3, start: 4, end: 6 },
  { id: 4, start: 6, end: 8 },
];

test("ripple: chọn 1 câu → xoá + dồn câu sau sang trái", () => {
  const res = rippleDelete({ segments: BASE, selectedIds: [2] });
  assert.deepEqual(res.removedIds, [2]);
  assert.equal(res.blockedTrack, null);
  assert.equal(res.removedDuration, 2);
  assert.equal(res.segments.length, 3);
  // Câu 3 (4-6) dịch sang 2-4; câu 4 (6-8) dịch sang 4-6.
  assert.equal(res.segments[1].id, 3);
  assert.equal(res.segments[1].start, 2);
  assert.equal(res.segments[1].end, 4);
  assert.equal(res.segments[2].id, 4);
  assert.equal(res.segments[2].start, 4);
  assert.equal(res.segments[2].end, 6);
});

test("ripple: chọn nhiều câu LIỀN nhau → gộp thành 1 khoảng", () => {
  const res = rippleDelete({ segments: BASE, selectedIds: [2, 3] });
  assert.equal(res.removedDuration, 4);
  assert.equal(res.segments.length, 2);
  assert.equal(res.segments[1].id, 4);
  assert.equal(res.segments[1].start, 2);
  assert.equal(res.segments[1].end, 4);
});

test("ripple: chọn nhiều câu KHÔNG liền nhau → dồn theo từng khoảng", () => {
  const res = rippleDelete({ segments: BASE, selectedIds: [1, 4] });
  assert.deepEqual(res.removedIds, [1, 4]);
  assert.equal(res.removedDuration, 4);
  assert.equal(res.segments.length, 2);
  // Câu 2 (2-4) dồn 2s → 0-2; câu 3 (4-6) dồn 2s → 2-4.
  assert.equal(res.segments[0].id, 2);
  assert.equal(res.segments[0].start, 0);
  assert.equal(res.segments[0].end, 2);
  assert.equal(res.segments[1].id, 3);
  assert.equal(res.segments[1].start, 2);
  assert.equal(res.segments[1].end, 4);
});

test("ripple: khoảng CHỒNG NHAU → tính 1 lần, không tính 2 lần", () => {
  const segs: Seg[] = [
    { id: 1, start: 0, end: 3 },
    { id: 2, start: 2, end: 5 },
    { id: 3, start: 5, end: 7 },
  ];
  const res = rippleDelete({ segments: segs, selectedIds: [1, 2] });
  // Khoảng hợp nhất = 0-5 → 5 giây.
  assert.equal(res.removedDuration, 5);
  assert.equal(res.segments.length, 1);
  assert.equal(res.segments[0].id, 3);
  assert.equal(res.segments[0].start, 0);
  assert.equal(res.segments[0].end, 2);
});

test("ripple: track KHOÁ → không xoá, không dồn, báo track", () => {
  const res = rippleDelete({
    segments: BASE,
    selectedIds: [2],
    lockedTracks: ["subtitles"],
  });
  assert.equal(res.blockedTrack, "subtitles");
  assert.deepEqual(res.removedIds, []);
  assert.equal(res.segments.length, 4);
  assert.equal(res.segments[1].start, 2);
});

test("ripple: track khoá KHÁC thì vẫn cho phép", () => {
  const res = rippleDelete({
    segments: BASE,
    selectedIds: [2],
    lockedTracks: ["speaker:s1"],
  });
  assert.equal(res.blockedTrack, null);
  assert.equal(res.segments.length, 3);
});

test("ripple: trackKeyOf ánh xạ sang track của vai", () => {
  const segs: Seg[] = [
    { id: 1, start: 0, end: 2, speakerId: "s1" },
    { id: 2, start: 2, end: 4, speakerId: "s2" },
  ];
  const res = rippleDelete({
    segments: segs,
    selectedIds: [2],
    lockedTracks: ["speaker:s2"],
    trackKeyOf: (seg) => `speaker:${seg.speakerId}`,
  });
  assert.equal(res.blockedTrack, "speaker:s2");
  assert.equal(res.segments.length, 2);
});

test("ripple: không chọn gì → không làm gì", () => {
  const res = rippleDelete({ segments: BASE, selectedIds: [] });
  assert.deepEqual(res.removedIds, []);
  assert.equal(res.segments.length, 4);
  assert.equal(res.removedDuration, 0);
});

test("ripple: câu nằm lọt trong vùng xoá bị cắt theo đầu vùng", () => {
  const segs: Seg[] = [
    { id: 1, start: 0, end: 4 },
    { id: 2, start: 4, end: 8 },
  ];
  // Xoá câu 1 (0-4): câu 2 (4-8) dồn sang 0-4.
  const res = rippleDelete({ segments: segs, selectedIds: [1] });
  assert.equal(res.segments.length, 1);
  assert.equal(res.segments[0].start, 0);
  assert.equal(res.segments[0].end, 4);
});
