/**
 * Unit test cho `src/lib/studio/tabShortcuts.ts` (TSK-TABS-P4-SHORTCUTS-CORE).
 * Chạy: node --test scripts/studio-tabs-tests/tabShortcuts.test.ts
 *
 * Luật kiểm theo `docs/STUDIO_TABS_PLAN.md` §4.3 + §6b và `docs/UI_REDESIGN_PLAN.md` §4.11.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTabCount,
  resolveTabShortcut,
  stepTabIndex,
  type TabShortcutContext,
  type TabShortcutEvent,
} from "../../src/lib/studio/tabShortcuts.ts";

/** Sự kiện bàn phím kiểu Mỹ (key == ký tự) — mặc định Ctrl đã giữ. */
function ev(patch: Partial<TabShortcutEvent> & { key: string }): TabShortcutEvent {
  return { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, ...patch };
}

/** Ngữ cảnh thanh tab mặc định: 3 tab, đang chọn tab đầu. */
function ctx(patch: Partial<TabShortcutContext> = {}): TabShortcutContext {
  return { tabCount: 3, activeIndex: 0, isEditableTarget: false, ...patch };
}

// ---------------------------------------------------------------- Ctrl+Tab

test("Ctrl+Tab -> tab kế", () => {
  assert.deepEqual(resolveTabShortcut(ev({ key: "Tab", code: "Tab" }), ctx()), { type: "next" });
});

test("Ctrl+Shift+Tab -> tab trước", () => {
  assert.deepEqual(
    resolveTabShortcut(ev({ key: "Tab", code: "Tab", shiftKey: true }), ctx()),
    { type: "prev" },
  );
});

test("Ctrl+Tab chỉ cần 1 tab là chạy", () => {
  assert.deepEqual(resolveTabShortcut(ev({ key: "Tab" }), ctx({ tabCount: 1 })), { type: "next" });
  assert.deepEqual(
    resolveTabShortcut(ev({ key: "Tab", shiftKey: true }), ctx({ tabCount: 1 })),
    { type: "prev" },
  );
});

test("stepTabIndex: vòng tròn cuối -> đầu và đầu -> cuối", () => {
  // 3 tab: 0,1,2
  assert.equal(stepTabIndex(2, 3, 1), 0);
  assert.equal(stepTabIndex(0, 3, -1), 2);
  assert.equal(stepTabIndex(1, 3, 1), 2);
  assert.equal(stepTabIndex(1, 3, -1), 0);
});

test("stepTabIndex: 1 tab thì đứng yên", () => {
  assert.equal(stepTabIndex(0, 1, 1), 0);
  assert.equal(stepTabIndex(0, 1, -1), 0);
});

test("stepTabIndex: chưa chọn tab (-1) -> tab đầu (tới) / tab cuối (lùi)", () => {
  assert.equal(stepTabIndex(-1, 4, 1), 0);
  assert.equal(stepTabIndex(-1, 4, -1), 3);
});

test("stepTabIndex: thanh tab rỗng -> null", () => {
  assert.equal(stepTabIndex(0, 0, 1), null);
  assert.equal(stepTabIndex(-1, 0, -1), null);
});

test("stepTabIndex: activeIndex ngoài dãy coi như chưa chọn", () => {
  assert.equal(stepTabIndex(9, 3, 1), 0);
  assert.equal(stepTabIndex(9, 3, -1), 2);
  assert.equal(stepTabIndex(1.5, 3, 1), 0);
});

// ---------------------------------------------------------------- Ctrl+W

test("Ctrl+W -> đóng tab đang chọn", () => {
  assert.deepEqual(resolveTabShortcut(ev({ key: "w", code: "KeyW" }), ctx()), { type: "close" });
  assert.deepEqual(
    resolveTabShortcut(ev({ key: "w", code: "KeyW" }), ctx({ activeIndex: 2 })),
    { type: "close" },
  );
});

test("Ctrl+W khi không có tab đang chọn -> null", () => {
  assert.equal(resolveTabShortcut(ev({ key: "w" }), ctx({ activeIndex: -1 })), null);
  assert.equal(resolveTabShortcut(ev({ key: "w" }), ctx({ activeIndex: 3 })), null);
  assert.equal(resolveTabShortcut(ev({ key: "w" }), ctx({ tabCount: 0 })), null);
});

test("Ctrl+Shift+W -> null (để dành đóng cửa sổ theo quy ước)", () => {
  assert.equal(resolveTabShortcut(ev({ key: "w", shiftKey: true }), ctx()), null);
});

// ---------------------------------------------------------------- Ctrl+T

test("Ctrl+T -> tab trống mới, chạy cả khi 0 tab", () => {
  assert.deepEqual(resolveTabShortcut(ev({ key: "t", code: "KeyT" }), ctx()), { type: "new" });
  assert.deepEqual(
    resolveTabShortcut(ev({ key: "t", code: "KeyT" }), ctx({ tabCount: 0, activeIndex: -1 })),
    { type: "new" },
  );
});

test("Ctrl+Shift+T -> null (để dành mở lại tab vừa đóng)", () => {
  assert.equal(resolveTabShortcut(ev({ key: "t", code: "KeyT", shiftKey: true }), ctx()), null);
  assert.equal(
    resolveTabShortcut(ev({ key: "t", shiftKey: true }), ctx({ tabCount: 0 })),
    null,
  );
});

test("Ctrl+T chỉ trả 'new' một lần duy nhất/đúng phím", () => {
  const action = resolveTabShortcut(ev({ key: "t" }), ctx());
  assert.equal(action?.type, "new");
});

// ---------------------------------------------------------------- Ctrl+1..8

test("Ctrl+1..8 -> đúng tab thứ n (0-based)", () => {
  for (let n = 1; n <= 8; n += 1) {
    const tabCount = 8;
    const action = resolveTabShortcut(
      ev({ key: String(n), code: `Digit${n}` }),
      ctx({ tabCount, activeIndex: 0 }),
    );
    assert.deepEqual(action, { type: "goto", index: n - 1 }, `Ctrl+${n}`);
  }
});

test("Ctrl+1..8: tab không tồn tại -> null", () => {
  // Trần 6 tab (STUDIO_TABS_PLAN §6b): Ctrl+7 / Ctrl+8 không làm gì.
  const sixTabs = ctx({ tabCount: 6, activeIndex: 0 });
  assert.equal(resolveTabShortcut(ev({ key: "7", code: "Digit7" }), sixTabs), null);
  assert.equal(resolveTabShortcut(ev({ key: "8", code: "Digit8" }), sixTabs), null);
  assert.deepEqual(resolveTabShortcut(ev({ key: "6", code: "Digit6" }), sixTabs), {
    type: "goto",
    index: 5,
  });
  // 3 tab: Ctrl+4 -> null, Ctrl+3 -> tab cuối (index 2)
  assert.equal(resolveTabShortcut(ev({ key: "4", code: "Digit4" }), ctx()), null);
  assert.deepEqual(resolveTabShortcut(ev({ key: "3", code: "Digit3" }), ctx()), {
    type: "goto",
    index: 2,
  });
});

test("Ctrl+Shift+số vẫn tính (bàn phím AZERTY phải giữ Shift mới ra số)", () => {
  assert.deepEqual(
    resolveTabShortcut(ev({ key: "1", code: "Digit1", shiftKey: true }), ctx()),
    { type: "goto", index: 0 },
  );
});

// ---------------------------------------------------------------- Ctrl+9 = tab cuối

test("Ctrl+9 -> tab cuối", () => {
  assert.deepEqual(
    resolveTabShortcut(ev({ key: "9", code: "Digit9" }), ctx({ tabCount: 6 })),
    { type: "goto", index: 5 },
  );
  assert.deepEqual(
    resolveTabShortcut(ev({ key: "9", code: "Digit9" }), ctx({ tabCount: 1 })),
    { type: "goto", index: 0 },
  );
});

// ---------------------------------------------------------------- Ctrl+0

test("Ctrl+0 -> null (đã dùng cho zoom timeline)", () => {
  assert.equal(resolveTabShortcut(ev({ key: "0", code: "Digit0" }), ctx()), null);
  assert.equal(
    resolveTabShortcut(ev({ key: "0", code: "Digit0" }), ctx({ tabCount: 6 })),
    null,
  );
});

// ---------------------------------------------------------------- Alt / Meta / không Ctrl

test("Alt+Ctrl+1 -> null (VoicePicker dùng Alt+1..3)", () => {
  assert.equal(
    resolveTabShortcut(ev({ key: "1", code: "Digit1", altKey: true }), ctx()),
    null,
  );
});

test("Alt+Ctrl+Tab / Alt+Ctrl+W / Alt+Ctrl+T -> null", () => {
  assert.equal(resolveTabShortcut(ev({ key: "Tab", altKey: true }), ctx()), null);
  assert.equal(resolveTabShortcut(ev({ key: "w", altKey: true }), ctx()), null);
  assert.equal(resolveTabShortcut(ev({ key: "t", altKey: true }), ctx()), null);
});

test("Meta (Cmd) -> null", () => {
  assert.equal(resolveTabShortcut(ev({ key: "w", metaKey: true }), ctx()), null);
  assert.equal(resolveTabShortcut(ev({ key: "t", metaKey: true }), ctx()), null);
  assert.equal(
    resolveTabShortcut(ev({ key: "Tab", metaKey: true }), ctx()),
    null,
  );
});

test("Không giữ Ctrl -> null (phím thường không bị cướp)", () => {
  assert.equal(resolveTabShortcut(ev({ key: "Tab", ctrlKey: false }), ctx()), null);
  assert.equal(resolveTabShortcut(ev({ key: "w", ctrlKey: false }), ctx()), null);
  assert.equal(resolveTabShortcut(ev({ key: "t", ctrlKey: false }), ctx()), null);
  assert.equal(resolveTabShortcut(ev({ key: "1", ctrlKey: false }), ctx()), null);
});

// ---------------------------------------------------------------- tabCount = 0

test("tabCount = 0 -> chỉ Ctrl+T chạy", () => {
  const empty = ctx({ tabCount: 0, activeIndex: -1 });
  assert.deepEqual(resolveTabShortcut(ev({ key: "t" }), empty), { type: "new" });
  assert.equal(resolveTabShortcut(ev({ key: "Tab" }), empty), null);
  assert.equal(resolveTabShortcut(ev({ key: "Tab", shiftKey: true }), empty), null);
  assert.equal(resolveTabShortcut(ev({ key: "w" }), empty), null);
  assert.equal(resolveTabShortcut(ev({ key: "1" }), empty), null);
  assert.equal(resolveTabShortcut(ev({ key: "9" }), empty), null);
  assert.equal(resolveTabShortcut(ev({ key: "0" }), empty), null);
});

test("normalizeTabCount: âm / NaN / lẻ", () => {
  assert.equal(normalizeTabCount(-2), 0);
  assert.equal(normalizeTabCount(Number.NaN), 0);
  assert.equal(normalizeTabCount(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeTabCount(2.9), 2);
  assert.equal(resolveTabShortcut(ev({ key: "1" }), ctx({ tabCount: -1 })), null);
});

// ---------------------------------------------------------------- code vs key

test("Ưu tiên `code`: AZERTY bấm phím số ra ký tự khác vẫn đúng tab", () => {
  // AZERTY: phím vật lý Digit1 (không Shift) sinh key "&"
  assert.deepEqual(
    resolveTabShortcut(ev({ key: "&", code: "Digit1" }), ctx()),
    { type: "goto", index: 0 },
  );
  // QWERTZ: phím vật lý KeyW sinh key "z"
  assert.deepEqual(resolveTabShortcut(ev({ key: "z", code: "KeyW" }), ctx()), {
    type: "close",
  });
  assert.deepEqual(resolveTabShortcut(ev({ key: "t", code: "KeyT" }), ctx()), { type: "new" });
});

test("Không có `code` -> dùng `key`", () => {
  assert.deepEqual(resolveTabShortcut(ev({ key: "2" }), ctx()), { type: "goto", index: 1 });
  assert.deepEqual(resolveTabShortcut(ev({ key: "W" }), ctx()), { type: "close" });
  assert.deepEqual(resolveTabShortcut(ev({ key: "T" }), ctx()), { type: "new" });
  assert.deepEqual(resolveTabShortcut(ev({ key: "tab" }), ctx()), { type: "next" });
});

test("`code` lạ -> quay về `key` (bàn phím số rời, IME…)", () => {
  assert.deepEqual(
    resolveTabShortcut(ev({ key: "3", code: "Numpad3" }), ctx()),
    { type: "goto", index: 2 },
  );
  assert.equal(resolveTabShortcut(ev({ key: "q", code: "KeyQ" }), ctx()), null);
  assert.equal(resolveTabShortcut(ev({ key: "Escape", code: "Escape" }), ctx()), null);
  assert.equal(resolveTabShortcut(ev({ key: "", code: "" }), ctx()), null);
});

test("Ctrl+Digit0 qua code -> null, không nhầm thành tab 10", () => {
  assert.equal(resolveTabShortcut(ev({ key: "0", code: "Digit0" }), ctx({ tabCount: 12 })), null);
});

// ---------------------------------------------------------------- ô nhập

test("Focus ở ô nhập: phím tab vẫn chạy (§4.11)", () => {
  const typing = ctx({ isEditableTarget: true, tabCount: 4, activeIndex: 1 });
  assert.deepEqual(resolveTabShortcut(ev({ key: "Tab" }), typing), { type: "next" });
  assert.deepEqual(resolveTabShortcut(ev({ key: "Tab", shiftKey: true }), typing), {
    type: "prev",
  });
  assert.deepEqual(resolveTabShortcut(ev({ key: "w" }), typing), { type: "close" });
  assert.deepEqual(resolveTabShortcut(ev({ key: "t" }), typing), { type: "new" });
  assert.deepEqual(resolveTabShortcut(ev({ key: "4" }), typing), { type: "goto", index: 3 });
  assert.deepEqual(resolveTabShortcut(ev({ key: "9" }), typing), { type: "goto", index: 3 });
});
