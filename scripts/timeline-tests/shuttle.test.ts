/**
 * Unit test cho `src/lib/timeline/shuttle.ts`.
 * Chạy: node --test scripts/timeline-tests/
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  applyShuttleKey,
  computeShuttleSeek,
  createShuttleState,
  escalateRate,
  frameStepSeconds,
  isShuttleActive,
  MAX_SHUTTLE_RATE,
  shuttlePlaybackRate,
} from "../../src/lib/timeline/shuttle.ts";

test("shuttle: trạng thái ban đầu", () => {
  const state = createShuttleState();
  assert.equal(state.rate, 1);
  assert.equal(state.direction, "none");
  assert.equal(state.action, "none");
  assert.equal(isShuttleActive(state), false);
});

test("shuttle: L lần 1 -> tiến 1x", () => {
  const state = applyShuttleKey(createShuttleState(), "l");
  assert.equal(state.direction, "forward");
  assert.equal(state.rate, 1);
  assert.equal(state.action, "play");
});

test("shuttle: L lặp lại -> 2x -> 4x -> 8x", () => {
  let state = applyShuttleKey(createShuttleState(), "l");
  state = applyShuttleKey(state, "l");
  assert.equal(state.rate, 2);
  state = applyShuttleKey(state, "l");
  assert.equal(state.rate, 4);
  state = applyShuttleKey(state, "l");
  assert.equal(state.rate, 8);
});

test("shuttle: tốc độ tối đa 8x không tăng thêm", () => {
  let state = applyShuttleKey(createShuttleState(), "l");
  for (let i = 0; i < 5; i += 1) state = applyShuttleKey(state, "l");
  assert.equal(state.rate, MAX_SHUTTLE_RATE);
  assert.equal(state.rate, 8);
  assert.equal(escalateRate(8), 8);
});

test("shuttle: J -> lùi 1x rồi tăng bậc", () => {
  let state = applyShuttleKey(createShuttleState(), "j");
  assert.equal(state.direction, "reverse");
  assert.equal(state.rate, 1);
  state = applyShuttleKey(state, "j");
  assert.equal(state.rate, 2);
});

test("shuttle: K -> dừng", () => {
  const playing = applyShuttleKey(createShuttleState(), "l");
  const stopped = applyShuttleKey(playing, "k");
  assert.equal(stopped.direction, "none");
  assert.equal(stopped.rate, 1);
  assert.equal(stopped.action, "stop");
  assert.equal(isShuttleActive(stopped), false);
});

test("shuttle: giữ K + J -> nhích 1 frame lùi", () => {
  const state = applyShuttleKey(createShuttleState(), "j", { kHeld: true });
  assert.equal(state.action, "step-back");
  assert.equal(state.direction, "none");
  assert.equal(state.rate, 1);
});

test("shuttle: giữ K + L -> nhích 1 frame tiến", () => {
  const state = applyShuttleKey(createShuttleState(), "l", { kHeld: true });
  assert.equal(state.action, "step-forward");
  assert.equal(state.direction, "none");
});

test("shuttle: computeShuttleSeek mô phỏng tua lùi", () => {
  const state = applyShuttleKey(createShuttleState(), "j");
  const next = computeShuttleSeek(state, 10, 500);
  assert.notEqual(next, null);
  assert.equal(Math.round((next as number) * 1000) / 1000, 9.5);
});

test("shuttle: computeShuttleSeek hướng tiến -> null (video tự phát)", () => {
  const state = applyShuttleKey(createShuttleState(), "l");
  assert.equal(computeShuttleSeek(state, 10, 500), null);
});

test("shuttle: computeShuttleSeek khi dừng -> null", () => {
  assert.equal(computeShuttleSeek(createShuttleState(), 10, 500), null);
});

test("shuttle: computeShuttleSeek không chạy quá 0", () => {
  const state = applyShuttleKey(createShuttleState(), "j");
  const next = computeShuttleSeek(state, 0.2, 1000);
  assert.equal(next, 0);
});

test("shuttle: computeShuttleSeek với dt <= 0 -> null", () => {
  const state = applyShuttleKey(createShuttleState(), "j");
  assert.equal(computeShuttleSeek(state, 10, 0), null);
  assert.equal(computeShuttleSeek(state, 10, -5), null);
});

test("shuttle: playbackRate chỉ tua nhanh khi hướng tiến", () => {
  let forward = applyShuttleKey(createShuttleState(), "l");
  forward = applyShuttleKey(forward, "l");
  assert.equal(shuttlePlaybackRate(forward), 2);

  const reverse = applyShuttleKey(createShuttleState(), "j");
  assert.equal(shuttlePlaybackRate(reverse), 1);
  assert.equal(shuttlePlaybackRate(createShuttleState()), 1);
});

test("shuttle: đổi hướng L -> J quay về 1x", () => {
  let state = applyShuttleKey(createShuttleState(), "l");
  state = applyShuttleKey(state, "l");
  state = applyShuttleKey(state, "j");
  assert.equal(state.direction, "reverse");
  assert.equal(state.rate, 1);
});

test("shuttle: frameStepSeconds", () => {
  assert.equal(frameStepSeconds(25), 0.04);
  assert.equal(frameStepSeconds(0), 0.04);
});
