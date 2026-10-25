//! TSK-TABS-P3-SESSION-CORE — test logic lưu/khôi phục phiên tab Studio.
//! Chạy: node --test scripts/studio-tabs-tests/sessionStore.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_V1_KEY,
  LEGACY_TAB_ID,
  MAX_SESSION_TABS,
  SESSION_KEY,
  TAB_KEY_PREFIX,
  loadSession,
  migrateLegacySession,
  readSessionManifest,
  readSessionTab,
  removeSessionTab,
  saveSession,
  saveSessionTab,
  sessionTabKey,
  stripSegment,
  stripSpeaker,
  toPersistedTab,
  writeSessionManifest,
  type SessionStorageLike,
} from "../../src/lib/studio/sessionStore.ts";

// ── Storage giả (không cần trình duyệt) ────────────────────────────────────

class MemoryStorage implements SessionStorageLike {
  map = new Map<string, string>();
  /** Khi true ⇒ mọi setItem ném lỗi (mô phỏng quota đầy). */
  quotaFull = false;
  setCalls = 0;

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1;
    if (this.quotaFull) {
      const err = new Error("QuotaExceededError: quota đầy");
      err.name = "QuotaExceededError";
      throw err;
    }
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

// ── Dữ liệu mẫu ────────────────────────────────────────────────────────────

function sampleSegment(id: number) {
  return {
    id,
    start: id * 2,
    end: id * 2 + 1.5,
    speakerId: "speaker_0",
    original: `original ${id}`,
    translated: `dịch ${id}`,
    hasAudio: true,
    audioUrl: "data:audio/mp3;base64,AAAAHUGEBASE64CHUNK",
    audioDuration: 1.4,
    source: "whisper" as const,
  };
}

function sampleSpeaker() {
  return {
    id: "speaker_0",
    name: "Người dẫn",
    gender: "male" as const,
    color: "#38bdf8",
    voice: "kokoro:tuan_ngoc",
    count: 3,
    sampleAudio: "data:audio/wav;base64,BBBBHUGEBASE64CHUNK",
  };
}

function tabInput(tabId: string, path: string) {
  return {
    tabId,
    filePath: path,
    fileName: path.split(/[\\/]/).pop() ?? path,
    mediaDuration: 40,
    segments: [sampleSegment(1), sampleSegment(2)],
    speakers: [sampleSpeaker()],
    markers: [{ id: "m1", time: 12.5, name: "mốc 1" }],
    sttLang: "auto",
    targetLang: "vi",
    currentTime: 7.25,
  };
}

// ────────────────────────────────────────────────────────────────────────────

test("sessionStore: round-trip — ghi 2 tab + manifest rồi đọc lại khớp", () => {
  const storage = new MemoryStorage();
  const res = saveSession(storage, {
    activeTabId: "t1",
    order: ["t0", "t1"],
    tabs: [tabInput("t0", "C:\\V\\a.mp4"), tabInput("t1", "C:\\V\\b.mp4")],
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.savedTabIds, ["t0", "t1"]);

  // Khoá tách rời: 1 khoá manifest + 1 khoá / tab.
  assert.ok(storage.getItem(SESSION_KEY), "phải có khoá manifest");
  assert.ok(storage.getItem(sessionTabKey("t0")));
  assert.ok(storage.getItem(sessionTabKey("t1")));

  const manifest = readSessionManifest(storage);
  assert.equal(manifest.activeTabId, "t1");
  assert.deepEqual(manifest.order, ["t0", "t1"]);

  const loaded = loadSession(storage);
  assert.equal(loaded.tabs.length, 2);
  assert.equal(loaded.tabs[0].tabId, "t0");
  assert.equal(loaded.tabs[0].filePath, "C:\\V\\a.mp4");
  assert.equal(loaded.tabs[0].fileName, "a.mp4");
  assert.equal(loaded.tabs[0].mediaDuration, 40);
  assert.equal(loaded.tabs[0].currentTime, 7.25);
  assert.equal(loaded.tabs[0].sttLang, "auto");
  assert.equal(loaded.tabs[0].targetLang, "vi");
  assert.equal(loaded.tabs[0].segments.length, 2);
  assert.equal(loaded.tabs[0].segments[0].original, "original 1");
  assert.equal(loaded.tabs[0].segments[0].translated, "dịch 1");
  assert.equal(loaded.tabs[0].speakers[0].name, "Người dẫn");
  assert.equal(loaded.tabs[0].markers[0].time, 12.5);
  assert.deepEqual(loaded.manifest.order, ["t0", "t1"]);
  assert.equal(loaded.manifest.activeTabId, "t1");
  assert.equal(loaded.repaired, false);
  assert.deepEqual(loaded.skippedTabIds, []);
});

test("sessionStore: BỎ audioUrl khỏi segment + hasAudio=false (clip TTS không sống qua restart)", () => {
  const storage = new MemoryStorage();
  const res = saveSessionTab(storage, tabInput("t0", "C:\\V\\a.mp4"));
  assert.equal(res.ok, true);

  const raw = storage.getItem(sessionTabKey("t0")) as string;
  assert.ok(!raw.includes("audioUrl"), "JSON đã lưu KHÔNG được chứa audioUrl");
  assert.ok(!raw.includes("data:audio/mp3;base64"), "không còn base64 trong khoá");
  assert.ok(!raw.includes("AAAAHUGEBASE64CHUNK"), "không còn payload base64");

  const tab = readSessionTab(storage, "t0");
  assert.ok(tab);
  assert.equal(tab!.segments[0].hasAudio, false, "hasAudio phải false");
  assert.equal("audioUrl" in (tab!.segments[0] as object), false, "không có field audioUrl");
});

test("sessionStore: bỏ clip mẫu của vai (sampleAudio) + ép hasAudio=false khi đọc lại", () => {
  const storage = new MemoryStorage();
  saveSessionTab(storage, tabInput("t0", "C:\\V\\a.mp4"));
  const raw = storage.getItem(sessionTabKey("t0")) as string;
  assert.ok(!raw.includes("sampleAudio"), "không lưu sampleAudio");
  assert.ok(!raw.includes("BBBBHUGEBASE64CHUNK"));

  const tab = readSessionTab(storage, "t0");
  assert.equal(tab!.speakers[0].sampleAudio, undefined);
  assert.equal("sampleAudio" in (tab!.speakers[0] as object), false);
  assert.equal(tab!.speakers[0].voice, "kokoro:tuan_ngoc", "giữ nguyên field nhẹ");

  // Kể cả khi JSON trong storage bị nhét lại audioUrl ⇒ đọc ra vẫn phải sạch.
  storage.setItem(
    sessionTabKey("t1"),
    JSON.stringify({ tabId: "t1", segments: [{ id: 1, audioUrl: "data:audio/mp3;base64,ZZZ", hasAudio: true }] }),
  );
  const dirty = readSessionTab(storage, "t1");
  assert.ok(dirty);
  assert.equal("audioUrl" in (dirty!.segments[0] as object), false);
  assert.equal(dirty!.segments[0].hasAudio, false);
});

test("sessionStore: stripSegment / stripSpeaker là hàm thuần", () => {
  const seg = stripSegment(sampleSegment(3));
  assert.equal(seg.id, 3);
  assert.equal(seg.hasAudio, false);
  assert.equal("audioUrl" in (seg as object), false);

  const spk = stripSpeaker(sampleSpeaker());
  assert.equal(spk.id, "speaker_0");
  assert.equal(spk.sampleAudio, undefined);
  assert.equal("sampleAudio" in (spk as object), false);

  const persisted = toPersistedTab(tabInput("tX", "C:\\V\\x.mp4"));
  assert.equal(persisted.tabId, "tX");
  assert.equal(persisted.segments[0].hasAudio, false);
});

test("sessionStore: QUOTA ĐẦY (setItem ném lỗi) ⇒ không crash, trả cờ lỗi", () => {
  const storage = new MemoryStorage();
  const res = saveSessionTab(storage, tabInput("t0", "C:\\V\\a.mp4"));
  assert.equal(res.ok, true);

  storage.quotaFull = true;
  const failed = saveSessionTab(storage, tabInput("t1", "C:\\V\\b.mp4"));
  assert.equal(failed.ok, false, "phải báo lỗi");
  assert.ok(failed.error && failed.error.length > 0, "phải có thông báo lỗi");
  assert.deepEqual(failed.savedTabIds, []);

  const failedManifest = writeSessionManifest(storage, { activeTabId: "t0", order: ["t0"] });
  assert.equal(failedManifest.ok, false);

  const failedSession = saveSession(storage, {
    activeTabId: "t1",
    order: ["t0", "t1"],
    tabs: [tabInput("t0", "C:\\V\\a.mp4"), tabInput("t1", "C:\\V\\b.mp4")],
  });
  assert.equal(failedSession.ok, false, "saveSession không được crash khi quota đầy");
  assert.ok(failedSession.error);
  assert.deepEqual(failedSession.savedTabIds, [], "không tab nào ghi được");

  // Dữ liệu cũ vẫn còn nguyên.
  storage.quotaFull = false;
  const loaded = loadSession(storage);
  assert.equal(loaded.tabs.length, 1);
  assert.equal(loaded.tabs[0].tabId, "t0");
});

test("sessionStore: migrate v1 ⇒ thành tab ĐẦU TIÊN, xoá khoá cũ, KHÔNG migrate lần 2", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    LEGACY_V1_KEY,
    JSON.stringify({
      filePath: "C:\\V\\legacy.mp4",
      fileName: "legacy.mp4",
      mediaDuration: 120,
      segments: [sampleSegment(1)],
      speakers: [sampleSpeaker()],
      markers: [{ id: "m0", time: 3 }],
      currentTime: 42,
      sttLang: "en",
      targetLang: "vi",
    }),
  );

  const first = migrateLegacySession(storage);
  assert.equal(first.migrated, true, "lần 1 phải migrate");
  assert.equal(first.tabId, LEGACY_TAB_ID);
  assert.equal(storage.getItem(LEGACY_V1_KEY), null, "khoá v1 phải bị xoá");

  const manifest = readSessionManifest(storage);
  assert.deepEqual(manifest.order, [LEGACY_TAB_ID], "tab v1 là tab đầu tiên");
  assert.equal(manifest.activeTabId, LEGACY_TAB_ID);

  const tab = readSessionTab(storage, LEGACY_TAB_ID);
  assert.ok(tab);
  assert.equal(tab!.filePath, "C:\\V\\legacy.mp4");
  assert.equal(tab!.mediaDuration, 120);
  assert.equal(tab!.currentTime, 42);
  assert.equal(tab!.segments[0].hasAudio, false);

  // Lần 2 ⇒ không migrate (khoá v1 đã xoá).
  const second = migrateLegacySession(storage);
  assert.equal(second.migrated, false, "KHÔNG được migrate lần 2");
  assert.deepEqual(readSessionManifest(storage).order, [LEGACY_TAB_ID], "order không đổi");
});

test("sessionStore: migrate v1 khi QUOTA ĐẦY ⇒ giữ nguyên khoá v1 (ghi mới trước, xoá cũ sau)", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    LEGACY_V1_KEY,
    JSON.stringify({ filePath: "C:\\V\\legacy.mp4", fileName: "legacy.mp4", mediaDuration: 10, segments: [], speakers: [] }),
  );
  storage.quotaFull = true;

  const res = migrateLegacySession(storage);
  assert.equal(res.migrated, false, "không được báo thành công khi quota đầy");
  assert.ok(res.error);
  assert.ok(storage.getItem(LEGACY_V1_KEY), "khoá v1 phải CÒN để thử lại sau");
  assert.equal(storage.getItem(sessionTabKey(LEGACY_TAB_ID)), null, "không được ghi khoá tab mới khi lỗi");

  // Hết quota ⇒ thử lại ⇒ thành công, khoá v1 mới bị xoá.
  storage.quotaFull = false;
  const retry = migrateLegacySession(storage);
  assert.equal(retry.migrated, true);
  assert.equal(storage.getItem(LEGACY_V1_KEY), null);
});

test("sessionStore: migrate v1 khi phiên đã có tab CÙNG ĐƯỜNG DẪN ⇒ không tạo tab trùng", () => {
  const storage = new MemoryStorage();
  saveSession(storage, {
    activeTabId: "t0",
    order: ["t0"],
    tabs: [tabInput("t0", "C:\\V\\legacy.mp4")],
  });
  storage.setItem(
    LEGACY_V1_KEY,
    JSON.stringify({ filePath: "c:/v/LEGACY.mp4", fileName: "legacy.mp4", mediaDuration: 10, segments: [], speakers: [] }),
  );

  const res = migrateLegacySession(storage);
  assert.equal(res.migrated, false);
  assert.equal(res.skippedDuplicate, true);
  assert.equal(storage.getItem(LEGACY_V1_KEY), null, "khoá v1 vẫn phải được dọn");
  assert.deepEqual(readSessionManifest(storage).order, ["t0"], "không thêm tab trùng");
});

test("sessionStore: JSON HỎNG của 1 tab ⇒ bỏ riêng tab đó, GIỮ các tab khác", () => {
  const storage = new MemoryStorage();
  saveSession(storage, {
    activeTabId: "t1",
    order: ["t0", "t1", "t2"],
    tabs: [
      tabInput("t0", "C:\\V\\a.mp4"),
      tabInput("t1", "C:\\V\\b.mp4"),
      tabInput("t2", "C:\\V\\c.mp4"),
    ],
  });
  // Làm hỏng JSON của tab t1.
  storage.setItem(sessionTabKey("t1"), "{ đây không phải JSON");

  const loaded = loadSession(storage);
  assert.equal(loaded.tabs.length, 2, "chỉ bỏ tab hỏng");
  assert.deepEqual(loaded.tabs.map((t) => t.tabId), ["t0", "t2"]);
  assert.deepEqual(loaded.skippedTabIds, ["t1"]);
  assert.equal(loaded.repaired, true, "manifest đã bị sửa ⇒ repaired");
  assert.deepEqual(loaded.manifest.order, ["t0", "t2"]);
  assert.equal(loaded.manifest.activeTabId, "t0", "active trỏ tab hỏng ⇒ sửa về tab đầu còn lại");
});

test("sessionStore: order / activeTabId trỏ tab KHÔNG CÒN ⇒ tự sửa", () => {
  const storage = new MemoryStorage();
  saveSessionTab(storage, tabInput("t0", "C:\\V\\a.mp4"));
  saveSessionTab(storage, tabInput("t1", "C:\\V\\b.mp4"));
  // Manifest trỏ 1 tab không tồn tại + active trỏ tab khác không tồn tại.
  writeSessionManifest(storage, { activeTabId: "tX", order: ["t0", "tGhost", "t1"] });

  const loaded = loadSession(storage);
  assert.deepEqual(loaded.tabs.map((t) => t.tabId), ["t0", "t1"], "tab không có khoá ⇒ bỏ khỏi order");
  assert.deepEqual(loaded.manifest.order, ["t0", "t1"]);
  assert.equal(loaded.manifest.activeTabId, "t0", "active không hợp lệ ⇒ về tab đầu còn lại");
  assert.equal(loaded.repaired, true);
  assert.deepEqual(loaded.skippedTabIds, ["tGhost"]);

  // Ghi lại manifest đã sửa ⇒ lần đọc sau không còn sửa nữa.
  writeSessionManifest(storage, loaded.manifest);
  const again = loadSession(storage);
  assert.equal(again.repaired, false);
  assert.deepEqual(again.manifest.order, ["t0", "t1"]);
});

test("sessionStore: activeTabId null (chưa có tab nào) ⇒ không sửa, order rỗng", () => {
  const storage = new MemoryStorage();
  const loaded = loadSession(storage);
  assert.deepEqual(loaded.tabs, []);
  assert.equal(loaded.manifest.activeTabId, null);
  assert.deepEqual(loaded.manifest.order, []);
  assert.equal(loaded.repaired, false);
});

test("sessionStore: removeSessionTab ⇒ xoá khoá tab, bỏ khỏi order, chỉnh activeTabId", () => {
  const storage = new MemoryStorage();
  saveSession(storage, {
    activeTabId: "t1",
    order: ["t0", "t1", "t2"],
    tabs: [
      tabInput("t0", "C:\\V\\a.mp4"),
      tabInput("t1", "C:\\V\\b.mp4"),
      tabInput("t2", "C:\\V\\c.mp4"),
    ],
  });

  const res = removeSessionTab(storage, "t1");
  assert.equal(res.ok, true);
  assert.equal(storage.getItem(sessionTabKey("t1")), null, "khoá tab phải bị xoá");
  const manifest = readSessionManifest(storage);
  assert.deepEqual(manifest.order, ["t0", "t2"]);
  assert.equal(manifest.activeTabId, "t0", "active trỏ tab vừa xoá ⇒ chuyển sang tab còn lại");
});

test("sessionStore: khoá phiên hỏng ⇒ trả phiên rỗng, KHÔNG crash", () => {
  const storage = new MemoryStorage();
  storage.setItem(SESSION_KEY, "không phải JSON");
  const manifest = readSessionManifest(storage);
  assert.equal(manifest.activeTabId, null);
  assert.deepEqual(manifest.order, []);

  const loaded = loadSession(storage);
  assert.deepEqual(loaded.tabs, []);
  assert.equal(loaded.repaired, false);
});

test("sessionStore: hằng khoá đúng đặc tả §4.5", () => {
  assert.equal(SESSION_KEY, "sublix_studio_session_v2");
  assert.equal(TAB_KEY_PREFIX, "sublix_studio_tab_v2_");
  assert.equal(LEGACY_V1_KEY, "sublix_active_studio_project_v1");
  assert.equal(sessionTabKey("abc"), "sublix_studio_tab_v2_abc");
  assert.equal(MAX_SESSION_TABS, 6);
});
