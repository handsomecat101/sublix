/**
 * Unit test cho `src/lib/timeline/timecode.ts`.
 * Chạy: node --test scripts/timeline-tests/
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  clampSeconds,
  DEFAULT_FPS,
  formatTimecodeDisplay,
  formatTimecodeInput,
  frameToSeconds,
  parseTimecode,
  secondsToFrame,
} from "../../src/lib/timeline/timecode.ts";

test("timecode: giây thuần", () => {
  assert.equal(parseTimecode("75"), 75);
  assert.equal(parseTimecode("75.5"), 75.5);
  assert.equal(parseTimecode("0"), 0);
});

test("timecode: mm:ss", () => {
  assert.equal(parseTimecode("01:30"), 90);
  assert.equal(parseTimecode("1:30"), 90);
  assert.equal(parseTimecode("00:05.5"), 5.5);
});

test("timecode: hh:mm:ss", () => {
  assert.equal(parseTimecode("01:02:03"), 3723);
  assert.equal(parseTimecode("00:00:00"), 0);
  assert.equal(parseTimecode("01:02:03.250"), 3723.25);
});

test("timecode: hh:mm:ss:ff (frame) theo fps", () => {
  assert.equal(parseTimecode("01:02:03:12", 25), 3723 + 12 / 25);
  assert.equal(parseTimecode("00:00:01:00", 25), 1);
});

test("timecode: chuỗi rỗng / khoảng trắng -> null", () => {
  assert.equal(parseTimecode(""), null);
  assert.equal(parseTimecode("   "), null);
  assert.equal(parseTimecode("\t\n"), null);
});

test("timecode: số âm -> null", () => {
  assert.equal(parseTimecode("-5"), null);
  assert.equal(parseTimecode("-00:01:00"), null);
});

test("timecode: chuỗi không phải số -> null", () => {
  assert.equal(parseTimecode("abc"), null);
  assert.equal(parseTimecode("1:2:3:4:5"), null);
  assert.equal(parseTimecode("00:aa:00"), null);
});

test("timecode: frame > fps -> null", () => {
  assert.equal(parseTimecode("00:00:00:25", 25), null);
  assert.equal(parseTimecode("00:00:00:99", 25), null);
  assert.equal(parseTimecode("00:00:00:24", 25), 24 / 25);
});

test("timecode: phút/giây vượt 59 -> null", () => {
  assert.equal(parseTimecode("01:70:00"), null);
  assert.equal(parseTimecode("00:00:60"), null);
  assert.equal(parseTimecode("00:60:00"), null);
});

test("timecode: fps không hợp lệ -> dùng DEFAULT_FPS", () => {
  assert.equal(parseTimecode("00:00:00:12", 0), 12 / DEFAULT_FPS);
  assert.equal(parseTimecode("00:00:00:12", Number.NaN), 12 / DEFAULT_FPS);
});

test("timecode: formatTimecodeInput -> HH:MM:SS.mmm", () => {
  assert.equal(formatTimecodeInput(3723.25), "01:02:03.250");
  assert.equal(formatTimecodeInput(0), "00:00:00.000");
  assert.equal(formatTimecodeInput(-10), "00:00:00.000");
});

test("timecode: formatTimecodeDisplay -> mm:ss.cc (giống app hiện tại)", () => {
  assert.equal(formatTimecodeDisplay(75.5), "01:15.50");
  assert.equal(formatTimecodeDisplay(0), "00:00.00");
  assert.equal(formatTimecodeDisplay(3723.25), "62:03.25");
});

test("timecode: vòng nhập -> xác nhận không lệch", () => {
  const values = [0, 1.25, 75.5, 3723.25, 86399.999];
  for (const value of values) {
    const back = parseTimecode(formatTimecodeInput(value));
    assert.notEqual(back, null);
    assert.ok(Math.abs((back as number) - value) < 0.001, `lệch ở ${value}`);
  }
});

test("timecode: clampSeconds", () => {
  assert.equal(clampSeconds(-5, 100), 0);
  assert.equal(clampSeconds(150, 100), 100);
  assert.equal(clampSeconds(50, 100), 50);
  assert.equal(clampSeconds(50, 0), 50);
});

test("timecode: quy đổi frame", () => {
  assert.equal(secondsToFrame(2, 25), 50);
  assert.equal(frameToSeconds(50, 25), 2);
  assert.equal(secondsToFrame(-1, 25), 0);
});
