//! TSK-TABS-P3-PROCESS-REOPEN — test hàm thuần chọn hành động cho nút
//! "🚀 Mở lại trong Studio" (tab Tiến trình → Studio nhiều tab).
//! Chạy: node --test scripts/process-tests/studioReopen.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { resolveStudioReopen } from "../../src/views/processTypes.ts";

test("resolveStudioReopen: có tabId → mở đúng tab Studio đã chạy tác vụ", () => {
  assert.deepEqual(
    resolveStudioReopen({
      tabId: "tab-7",
      sourcePath: "C:/video/goc.mp4",
      outputPath: "C:/thanh-pham/out.mp4",
    }),
    {
      kind: "open-tab",
      tabId: "tab-7",
      sourcePath: "C:/video/goc.mp4",
      outputPath: "C:/thanh-pham/out.mp4",
    },
  );
});

test("resolveStudioReopen: tabId được ưu tiên hơn sourcePath", () => {
  const target = resolveStudioReopen({ tabId: "tab-1", sourcePath: "C:/a.mp4" });
  assert.equal(target.kind, "open-tab");
});

test("resolveStudioReopen: chỉ có sourcePath → mở lại dự án từ video gốc", () => {
  assert.deepEqual(resolveStudioReopen({ sourcePath: "C:/video/goc.mp4" }), {
    kind: "open-project",
    sourcePath: "C:/video/goc.mp4",
  });
});

test("resolveStudioReopen: sourcePath + outputPath (không có tabId) → giữ cả hai", () => {
  assert.deepEqual(
    resolveStudioReopen({ sourcePath: "C:/video/goc.mp4", outputPath: "C:/thanh-pham/out.mp4" }),
    { kind: "open-project", sourcePath: "C:/video/goc.mp4", outputPath: "C:/thanh-pham/out.mp4" },
  );
});

test("resolveStudioReopen: không có tabId lẫn sourcePath → chuyển tab Studio như cũ", () => {
  assert.deepEqual(resolveStudioReopen({}), { kind: "navigate-studio" });
  assert.deepEqual(resolveStudioReopen({ outputPath: "C:/thanh-pham/out.mp4" }), {
    kind: "navigate-studio",
  });
});

test("resolveStudioReopen: chuỗi rỗng/khoảng trắng coi như thiếu", () => {
  assert.deepEqual(resolveStudioReopen({ tabId: "   ", sourcePath: "" }), {
    kind: "navigate-studio",
  });
  assert.deepEqual(resolveStudioReopen({ tabId: " tab-9 ", sourcePath: "  " }), {
    kind: "open-tab",
    tabId: "tab-9",
  });
  assert.deepEqual(resolveStudioReopen({ sourcePath: " C:/a.mp4 " }), {
    kind: "open-project",
    sourcePath: "C:/a.mp4",
  });
});

test("resolveStudioReopen: không tự bịa khoá sourcePath/outputPath khi thiếu", () => {
  const target = resolveStudioReopen({ tabId: "tab-3" });
  assert.deepEqual(target, { kind: "open-tab", tabId: "tab-3" });
  assert.ok(!("sourcePath" in target), "không được thêm khoá sourcePath rỗng");
  assert.ok(!("outputPath" in target), "không được thêm khoá outputPath rỗng");
});
