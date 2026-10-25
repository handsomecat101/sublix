//! TSK-TABS-P3 — cờ `hadAudio` ("Cần tạo lại giọng") qua lưu/khôi phục phiên.
//! Chạy: node --test scripts/studio-tabs-tests/sessionRestore.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_V1_KEY,
  loadSession,
  migrateLegacySession,
  saveSessionTab,
  type SessionStorageLike,
} from "../../src/lib/studio/sessionStore.ts";

class Mem implements SessionStorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const seg = (id: number, over: Record<string, unknown> = {}) =>
  ({ id, start: id, end: id + 1, speakerId: "s", original: "a", translated: "b", ...over }) as never;

function tab(segments: never[], extra: Record<string, unknown> = {}) {
  return {
    tabId: "t1",
    filePath: "C:\\v.mp4",
    fileName: "v.mp4",
    mediaDuration: 10,
    segments,
    speakers: [],
    currentTime: 0,
    ...extra,
  };
}

test("tab có câu hasAudio/audioUrl ⇒ lưu hadAudio=true, audioUrl bị bỏ", () => {
  const s = new Mem();
  saveSessionTab(s, tab([seg(1, { hasAudio: true, audioUrl: "data:audio/mp3;base64,AAAA" })]));
  const loaded = loadSession(s);
  assert.equal(loaded.tabs[0].hadAudio, true);
  assert.equal(loaded.tabs[0].segments[0].hasAudio, false);
  assert.ok(!("audioUrl" in loaded.tabs[0].segments[0]));
});

test("tab chưa từng có tiếng ⇒ không có field hadAudio", () => {
  const s = new Mem();
  saveSessionTab(s, tab([seg(1)]));
  assert.equal("hadAudio" in loadSession(s).tabs[0], false);
});

test("cờ hadAudio giữ qua lần lưu kế tiếp khi chưa tạo lại giọng", () => {
  const s = new Mem();
  saveSessionTab(s, tab([seg(1, { hasAudio: true })]));
  const restored = loadSession(s).tabs[0];
  // Instance khôi phục: segments hasAudio=false, nhưng truyền lại hadAudio.
  saveSessionTab(s, tab(restored.segments as never[], { hadAudio: restored.hadAudio }));
  assert.equal(loadSession(s).tabs[0].hadAudio, true);
});

test("migrate khoá v1 có tiếng ⇒ tab đầu mang hadAudio", () => {
  const s = new Mem();
  s.setItem(
    LEGACY_V1_KEY,
    JSON.stringify({
      filePath: "C:\\old.mp4",
      fileName: "old.mp4",
      mediaDuration: 5,
      segments: [seg(1, { hasAudio: true, audioUrl: "data:x" })],
      speakers: [],
    }),
  );
  const res = migrateLegacySession(s, { tabId: "tab_m" });
  assert.equal(res.migrated, true);
  const loaded = loadSession(s);
  assert.equal(loaded.tabs[0].tabId, "tab_m");
  assert.equal(loaded.tabs[0].hadAudio, true);
  assert.equal(s.getItem(LEGACY_V1_KEY), null);
});
