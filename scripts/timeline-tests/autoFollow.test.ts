/**
 * Unit test cho `src/lib/timeline/autoFollow.ts`.
 * Chạy: node --test scripts/timeline-tests/
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  computeFollowScroll,
  PAGE_SCROLL_TRIGGER_RATIO,
} from "../../src/lib/timeline/autoFollow.ts";

test("autoFollow: viewport rộng <= 0 -> null", () => {
  const result = computeFollowScroll({
    playheadPx: 500,
    scrollLeft: 0,
    viewportWidth: 0,
    mode: "page",
  });
  assert.equal(result, null);
});

test("autoFollow: playhead nằm trong vùng nhìn -> null (không cuộn)", () => {
  const result = computeFollowScroll({
    playheadPx: 500,
    scrollLeft: 0,
    viewportWidth: 1000,
    mode: "page",
  });
  assert.equal(result, null);
});

test("autoFollow: chế độ page lật trang khi vượt 90% viewport", () => {
  const result = computeFollowScroll({
    playheadPx: 950,
    scrollLeft: 0,
    viewportWidth: 1000,
    mode: "page",
  });
  assert.notEqual(result, null);
  assert.equal(Math.round((result as number) * 1000) / 1000, 950 - 0.9 * 1000);
  assert.equal(PAGE_SCROLL_TRIGGER_RATIO, 0.9);
});

test("autoFollow: chế độ page chưa vượt ngưỡng -> null", () => {
  const result = computeFollowScroll({
    playheadPx: 900,
    scrollLeft: 0,
    viewportWidth: 1000,
    mode: "page",
  });
  assert.equal(result, null);
});

test("autoFollow: chế độ smooth đặt playhead vào giữa khi lọt mép phải", () => {
  const result = computeFollowScroll({
    playheadPx: 1200,
    scrollLeft: 0,
    viewportWidth: 1000,
    mode: "smooth",
  });
  assert.notEqual(result, null);
  assert.equal(result, 1200 - 0.5 * 1000);
});

test("autoFollow: chế độ smooth chưa lọt mép phải -> null", () => {
  const result = computeFollowScroll({
    playheadPx: 1000,
    scrollLeft: 0,
    viewportWidth: 1000,
    mode: "smooth",
  });
  assert.equal(result, null);
});

test("autoFollow: playhead lọt sang mép trái -> kéo lại", () => {
  const result = computeFollowScroll({
    playheadPx: 100,
    scrollLeft: 800,
    viewportWidth: 1000,
    mode: "page",
  });
  assert.equal(result, 100);
});

test("autoFollow: kết quả không bao giờ âm", () => {
  const result = computeFollowScroll({
    playheadPx: 10,
    scrollLeft: 5000,
    viewportWidth: 1000,
    mode: "smooth",
  });
  assert.notEqual(result, null);
  assert.ok((result as number) >= 0);
});

test("autoFollow: giá trị không hợp lệ -> null", () => {
  const result = computeFollowScroll({
    playheadPx: Number.NaN,
    scrollLeft: 0,
    viewportWidth: 1000,
    mode: "page",
  });
  assert.equal(result, null);
});

test("autoFollow: scrollLeft âm được chuẩn hoá về 0", () => {
  const result = computeFollowScroll({
    playheadPx: 500,
    scrollLeft: -200,
    viewportWidth: 1000,
    mode: "page",
  });
  assert.equal(result, null);
});
