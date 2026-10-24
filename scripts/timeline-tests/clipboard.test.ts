/**
 * Unit test cho `src/lib/timeline/clipboard.ts`.
 * Chạy: node --test scripts/timeline-tests/
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  copyToClipboard,
  maxSegmentId,
  pasteFromClipboard,
  segmentsOverlap,
  stripVoice,
  type TimelineSegment,
} from "../../src/lib/timeline/clipboard.ts";

/** Tạo một câu thoại mẫu. */
function makeSeg(overrides: Partial<TimelineSegment> = {}): TimelineSegment {
  return {
    id: 1,
    start: 10,
    end: 12,
    speakerId: "s1",
    original: "Xin chao",
    translated: "Xin chào",
    ...overrides,
  };
}

test("clipboard: copy giữ khoảng cách tương đối giữa các câu", () => {
  const payload = copyToClipboard([
    makeSeg({ id: 1, start: 10, end: 12 }),
    makeSeg({ id: 2, start: 15, end: 17 }),
  ]);
  assert.equal(payload.segments.length, 2);
  assert.equal(payload.baseTime, 10);
  assert.equal(payload.segments[1].start - payload.segments[0].start, 5);
});

test("clipboard: copy bỏ tiếng lồng (audioUrl / hasAudio / audioDuration)", () => {
  const payload = copyToClipboard([
    makeSeg({ hasAudio: true, audioUrl: "data:audio/mp3;base64,AAA", audioDuration: 2.4 }),
  ]);
  assert.equal(payload.segments[0].hasAudio, undefined);
  assert.equal(payload.segments[0].audioUrl, undefined);
  assert.equal(payload.segments[0].audioDuration, undefined);
  // Nội dung chữ vẫn giữ nguyên.
  assert.equal(payload.segments[0].translated, "Xin chào");
});

test("clipboard: stripVoice giữ trường text và nguồn", () => {
  const stripped = stripVoice(
    makeSeg({ translateFailed: false, source: "whisper", hasAudio: true }),
  );
  assert.equal(stripped.original, "Xin chao");
  assert.equal(stripped.translateFailed, false);
  assert.equal(stripped.source, "whisper");
  assert.equal(stripped.hasAudio, undefined);
});

test("clipboard: paste neo câu đầu tiên đúng vào playhead", () => {
  const payload = copyToClipboard([
    makeSeg({ id: 1, start: 10, end: 12 }),
    makeSeg({ id: 2, start: 15, end: 17 }),
  ]);
  const result = pasteFromClipboard(payload, [], 30);
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0].start, 30);
  assert.equal(result.segments[0].end, 32);
  assert.equal(result.segments[1].start, 35);
  assert.equal(result.segments[1].end, 37);
});

test("clipboard: paste cấp id mới = max id hiện tại + 1", () => {
  const payload = copyToClipboard([
    makeSeg({ id: 1, start: 10, end: 12 }),
    makeSeg({ id: 2, start: 13, end: 14 }),
  ]);
  const existing = [makeSeg({ id: 7, start: 50, end: 52 })];
  const result = pasteFromClipboard(payload, existing, 30);
  assert.equal(result.segments[0].id, 8);
  assert.equal(result.segments[1].id, 9);
  assert.equal(result.nextId, 10);
});

test("clipboard: paste báo xung đột khi chồng lấn câu có sẵn", () => {
  const payload = copyToClipboard([makeSeg({ id: 1, start: 10, end: 12 })]);
  const existing = [makeSeg({ id: 5, start: 29, end: 31 })];
  const result = pasteFromClipboard(payload, existing, 30);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].existing.id, 5);
  assert.equal(result.conflicts[0].overlapSec, 1);
});

test("clipboard: KHÔNG tự xoá câu cũ khi xung đột", () => {
  const payload = copyToClipboard([makeSeg({ id: 1, start: 10, end: 12 })]);
  const existing = [makeSeg({ id: 5, start: 29, end: 31 })];
  const result = pasteFromClipboard(payload, existing, 30);
  assert.equal(result.segments.length, 1);
  assert.equal(existing.length, 1);
  assert.equal(existing[0].id, 5);
});

test("clipboard: skipConflicts = true thì bỏ qua câu trùng", () => {
  const payload = copyToClipboard([makeSeg({ id: 1, start: 10, end: 12 })]);
  const existing = [makeSeg({ id: 5, start: 29, end: 31 })];
  const result = pasteFromClipboard(payload, existing, 30, { skipConflicts: true });
  assert.equal(result.segments.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.conflicts.length, 1);
});

test("clipboard: clipboard rỗng -> không dán gì", () => {
  const result = pasteFromClipboard(copyToClipboard([]), [], 30);
  assert.equal(result.segments.length, 0);
  assert.equal(result.conflicts.length, 0);
});

test("clipboard: câu không hợp lệ (end <= start) bị bỏ qua", () => {
  const payload = copyToClipboard([]);
  payload.segments.push(makeSeg({ id: 1, start: 10, end: 10 }));
  const result = pasteFromClipboard(payload, [], 30);
  assert.equal(result.segments.length, 0);
  assert.equal(result.skipped.length, 1);
});

test("clipboard: segmentsOverlap", () => {
  assert.equal(segmentsOverlap(makeSeg({ start: 0, end: 5 }), makeSeg({ start: 4, end: 9 })), true);
  assert.equal(segmentsOverlap(makeSeg({ start: 0, end: 5 }), makeSeg({ start: 5, end: 9 })), false);
  assert.equal(segmentsOverlap(makeSeg({ start: 0, end: 5 }), makeSeg({ start: 6, end: 9 })), false);
});

test("clipboard: maxSegmentId", () => {
  assert.equal(maxSegmentId([]), -1);
  assert.equal(maxSegmentId([makeSeg({ id: 3 }), makeSeg({ id: 11 }), makeSeg({ id: 5 })]), 11);
});

test("clipboard: copy bỏ qua câu không hợp lệ", () => {
  const payload = copyToClipboard([
    makeSeg({ id: 1, start: 10, end: 9 }),
    makeSeg({ id: 2, start: 20, end: 22 }),
  ]);
  assert.equal(payload.segments.length, 1);
  assert.equal(payload.baseTime, 20);
});
