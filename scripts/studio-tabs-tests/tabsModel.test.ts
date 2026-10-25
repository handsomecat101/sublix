//! TSK-TABS-P1 — test logic thuần của thanh tab Studio.
//! Chạy: node --test scripts/studio-tabs-tests/tabsModel.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_STUDIO_TABS,
  activeTab,
  addTab,
  closeTab,
  createTab,
  emptyTabsState,
  findOldestClosable,
  findTabByPath,
  middleTruncate,
  selectTab,
  titleFromPath,
  updateTab,
  type TabsState,
} from "../../src/lib/studio/tabsModel.ts";

function stateWith(paths: string[]): TabsState {
  let state = emptyTabsState();
  paths.forEach((path, i) => {
    state = addTab(state, `t${i}`, path).state;
  });
  return state;
}

test("tabsModel: tên tab = tên file bỏ đuôi", () => {
  assert.equal(titleFromPath("C:\\Videos\\A2Z_TEST_EN.mp4"), "A2Z_TEST_EN");
  assert.equal(titleFromPath("/home/u/clip.mkv"), "clip");
  assert.equal(titleFromPath(""), "Video mới");
});

test("tabsModel: cắt giữa tên dài", () => {
  assert.equal(middleTruncate("ngắn", 22), "ngắn");
  const long = "Phim_ngắm_CN_tap03_movie_final";
  const cut = middleTruncate(long, 22);
  assert.ok(cut.includes("…"), "phải có dấu …: " + cut);
  assert.ok(cut.startsWith("Phim_"), "giữ đầu: " + cut);
  assert.ok(cut.endsWith("final"), "giữ đuôi: " + cut);
  assert.ok(cut.length <= 22);
});

test("tabsModel: mở trùng path ⇒ nhảy tới tab đó (không tạo tab mới)", () => {
  const state = stateWith(["C:\\V\\a.mp4", "C:\\V\\b.mp4"]);
  const out = addTab(state, "t9", "C:\\V\\a.mp4");
  assert.equal(out.kind, "selected");
  assert.equal(out.state.tabs.length, 2, "không được thêm tab");
  assert.equal(out.state.activeId, "t0", "phải chọn lại tab của video a");
});

test("tabsModel: dedupe path theo dạng chuẩn hoá (hoa/thường + dấu /)", () => {
  const state = stateWith(["C:\\V\\a.mp4"]);
  const out = addTab(state, "t1", "c:/v/A.MP4");
  assert.equal(out.kind, "selected");
  assert.equal(out.state.tabs.length, 1);
});

test("tabsModel: tab đang chọn TRỐNG ⇒ tái dùng tab đó", () => {
  let state = emptyTabsState();
  state = addTab(state, "t0", "").state; // tab trống
  assert.equal(state.tabs.length, 1);
  assert.equal(state.activeTab ?? state.activeId, "t0");
  const out = addTab(state, "t1", "C:\\V\\a.mp4");
  assert.equal(out.kind, "reused-empty");
  assert.equal(out.state.tabs.length, 1, "không được tạo tab mới");
  assert.equal(out.state.tabs[0].path, "C:\\V\\a.mp4");
  assert.equal(out.state.tabs[0].id, "t0", "giữ nguyên id để không mất state của instance");
});

test("tabsModel: trần 6 tab ⇒ needs-confirm, không tự thêm", () => {
  let state = emptyTabsState();
  for (let i = 0; i < MAX_STUDIO_TABS; i++) {
    state = addTab(state, `t${i}`, `C:\\V\\${i}.mp4`).state;
  }
  assert.equal(state.tabs.length, MAX_STUDIO_TABS);
  const out = addTab(state, "tX", "C:\\V\\new.mp4");
  assert.equal(out.kind, "needs-confirm");
  assert.equal(out.state.tabs.length, MAX_STUDIO_TABS, "không được vượt trần");
  assert.equal(out.oldestClosableId, "t0", "ứng viên đóng = tab cũ nhất đã xong");
});

test("tabsModel: tab BUSY hoặc DIRTY thì KHÔNG phải ứng viên đóng khi đạt trần", () => {
  let state = stateWith(["C:\\V\\0.mp4"]);
  state = updateTab(state, "t0", { busy: "running" });
  // Đủ 6 tab (tab đầu đang chạy việc) ⇒ đạt trần.
  for (let i = 1; i < MAX_STUDIO_TABS; i++) {
    state = addTab(state, `t${i}`, `C:\\V\\${i}.mp4`).state;
  }
  assert.equal(state.tabs.length, MAX_STUDIO_TABS);
  const out = addTab(state, "tX", "C:\\V\\new.mp4");
  assert.equal(out.kind, "needs-confirm");
  assert.equal(out.oldestClosableId, "t1", "bỏ qua tab đang chạy (t0) ⇒ ứng viên là tab kế");
});

test("tabsModel: đóng tab GIỮA dãy ⇒ chọn tab kế", () => {
  const state = stateWith(["C:\\V\\a.mp4", "C:\\V\\b.mp4", "C:\\V\\c.mp4"]);
  assert.equal(state.activeId, "t2");
  const out = closeTab(state, "t1");
  assert.equal(out.tabs.length, 2);
  assert.equal(out.activeId, "t2", "tab đang chọn không bị đóng thì giữ nguyên");
  // Đóng tab ĐANG CHỌN ở giữa ⇒ chọn tab kế.
  const state2 = selectTab(state, "t1");
  const out2 = closeTab(state2, "t1");
  assert.equal(out2.activeId, "t2", "phải chọn tab kế (t2)");
});

test("tabsModel: đóng tab CUỐI ⇒ chọn tab trước", () => {
  const state = stateWith(["C:\\V\\a.mp4", "C:\\V\\b.mp4"]);
  const out = closeTab(state, "t1");
  assert.equal(out.activeId, "t0");
});

test("tabsModel: đóng tab cuối cùng ⇒ activeId = null", () => {
  const state = stateWith(["C:\\V\\a.mp4"]);
  const out = closeTab(state, "t0");
  assert.equal(out.tabs.length, 0);
  assert.equal(out.activeId, null);
});

test("tabsModel: đóng tab không tồn tại ⇒ không đổi state", () => {
  const state = stateWith(["C:\\V\\a.mp4"]);
  const out = closeTab(state, "nope");
  assert.equal(out.tabs.length, 1);
  assert.equal(out.activeId, state.activeId);
});

test("tabsModel: select tab + update trạng thái", () => {
  const state = stateWith(["C:\\V\\a.mp4", "C:\\V\\b.mp4"]);
  assert.equal(selectTab(state, "t0").activeId, "t0");
  assert.equal(selectTab(state, "zzz").activeId, state.activeId, "id lạ ⇒ không đổi");
  const focused = selectTab(state, "t0");
  const busy = updateTab(focused, "t0", { busy: "running", percent: 62 });
  assert.equal(busy.tabs[0].busy, "running");
  assert.equal(busy.tabs[0].percent, 62);
  assert.equal(activeTab(busy)?.id, "t0");
});

test("tabsModel: findTabByPath + findOldestClosable", () => {
  const state = stateWith(["C:\\V\\a.mp4", "C:\\V\\b.mp4"]);
  assert.equal(findTabByPath(state, "C:\\V\\b.mp4")?.id, "t1");
  assert.equal(findTabByPath(state, "C:\\V\\zzz.mp4"), undefined);
  assert.equal(findTabByPath(state, ""), undefined, "path rỗng không khớp tab nào");
  assert.equal(findOldestClosable(state), "t0");
});

test("tabsModel: createTab mặc định idle, chưa có path", () => {
  const tab = createTab("x");
  assert.equal(tab.id, "x");
  assert.equal(tab.path, "");
  assert.equal(tab.busy, "idle");
  assert.equal(tab.percent, 0);
  assert.equal(tab.dirty, false);
});
