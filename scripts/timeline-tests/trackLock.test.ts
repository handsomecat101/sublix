/**
 * Unit test cho `src/lib/timeline/trackLock.ts`.
 * Chạy: node --test scripts/timeline-tests/
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  blockedTracks,
  createTrackLockState,
  describeTrackKey,
  editBlockedReason,
  isAnyEditBlocked,
  isEditBlocked,
  isTrackLocked,
  lockTrack,
  parseSpeakerTrackKey,
  speakerTrackKey,
  toggleTrackLock,
  unlockTrack,
} from "../../src/lib/timeline/trackLock.ts";

test("trackLock: trạng thái ban đầu không khoá gì", () => {
  const state = createTrackLockState();
  assert.equal(state.lockedTracks.length, 0);
  assert.equal(isTrackLocked(state, "subtitles"), false);
});

test("trackLock: khoá / mở khoá idempotent", () => {
  let state = lockTrack(createTrackLockState(), "subtitles");
  assert.equal(isTrackLocked(state, "subtitles"), true);
  state = lockTrack(state, "subtitles");
  assert.equal(state.lockedTracks.length, 1);
  state = unlockTrack(state, "subtitles");
  assert.equal(isTrackLocked(state, "subtitles"), false);
  state = unlockTrack(state, "subtitles");
  assert.equal(state.lockedTracks.length, 0);
});

test("trackLock: toggle bật/tắt", () => {
  let state = toggleTrackLock(createTrackLockState(), "original");
  assert.equal(isTrackLocked(state, "original"), true);
  state = toggleTrackLock(state, "original");
  assert.equal(isTrackLocked(state, "original"), false);
});

test("trackLock: track bị khoá chặn mọi thao tác", () => {
  const state = lockTrack(createTrackLockState(), "subtitles");
  assert.equal(isEditBlocked(state, "subtitles", "move"), true);
  assert.equal(isEditBlocked(state, "subtitles", "trim"), true);
  assert.equal(isEditBlocked(state, "subtitles", "split"), true);
  assert.equal(isEditBlocked(state, "subtitles", "delete"), true);
  assert.equal(isEditBlocked(state, "subtitles", "edit-text"), true);
  assert.equal(isEditBlocked(state, "subtitles", "paste"), true);
});

test("trackLock: track không khoá thì không chặn", () => {
  const state = createTrackLockState();
  assert.equal(isEditBlocked(state, "subtitles", "move"), false);
  assert.equal(isEditBlocked(state, speakerTrackKey("s1"), "trim"), false);
});

test("trackLock: track tiếng gốc luôn bị chặn", () => {
  const state = createTrackLockState();
  assert.equal(isEditBlocked(state, "original", "move"), true);
  assert.equal(isEditBlocked(state, "original", "trim"), true);
  assert.equal(isEditBlocked(state, "original", "delete"), true);
  assert.equal(isEditBlocked(state, "original", "paste"), true);
});

test("trackLock: isAnyEditBlocked cho thao tác nhiều track", () => {
  const state = lockTrack(createTrackLockState(), speakerTrackKey("s2"));
  assert.equal(isAnyEditBlocked(state, ["subtitles", speakerTrackKey("s1")], "paste"), false);
  assert.equal(isAnyEditBlocked(state, ["subtitles", speakerTrackKey("s2")], "paste"), true);
});

test("trackLock: blockedTracks liệt kê track bị chặn", () => {
  const state = lockTrack(createTrackLockState(), "subtitles");
  const blocked = blockedTracks(state, ["subtitles", speakerTrackKey("s1")], "move");
  assert.deepEqual(blocked, ["subtitles"]);
});

test("trackLock: dựng / tách key track tiếng lồng", () => {
  const key = speakerTrackKey("voice_01");
  assert.equal(key, "speaker:voice_01");
  assert.equal(parseSpeakerTrackKey(key), "voice_01");
  assert.equal(parseSpeakerTrackKey("subtitles"), null);
  assert.equal(parseSpeakerTrackKey("speaker:"), null);
});

test("trackLock: mô tả track cho UI", () => {
  assert.equal(describeTrackKey("subtitles"), "Phụ đề");
  assert.equal(describeTrackKey("original"), "Tiếng gốc");
  assert.equal(describeTrackKey(speakerTrackKey("An")), "Tiếng lồng: An");
});

test("trackLock: thông báo lỗi tiếng Việt", () => {
  const reason = editBlockedReason("subtitles", "edit-text");
  assert.ok(reason.includes("Phụ đề"));
  assert.ok(reason.includes("sửa nội dung"));
});
