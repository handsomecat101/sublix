//! TSK-TABS-3.5 — test logic thuần chặn "kết quả video A ghi đè video B".
//! Chạy: node --test scripts/timeline-tests/result-guard.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  guardProjectResult,
  isSameProject,
  normalizeProjectPath,
  projectDisplayName,
  staleProjectMessage,
  staleProjectNotice,
} from "../../src/lib/studio/resultGuard.ts";

test("resultGuard: chuẩn hoá đường dẫn", () => {
  assert.equal(normalizeProjectPath("C:/Videos/A.MP4"), "c:\\videos\\a.mp4");
  assert.equal(normalizeProjectPath("  C:\\Videos\\A.mp4 "), "c:\\videos\\a.mp4");
  assert.equal(normalizeProjectPath(""), "");
  assert.equal(normalizeProjectPath(null), "");
  assert.equal(normalizeProjectPath(undefined), "");
});

test("resultGuard: cùng video ⇒ kết quả dùng được", () => {
  assert.equal(isSameProject("C:\\V\\a.mp4", "C:\\V\\a.mp4"), true);
  assert.equal(isSameProject("C:\\V\\a.mp4", "c:/v/a.mp4"), true, "khác hoa/thường + dấu / là cùng");
  assert.equal(isSameProject("C:\\V\\a.mp4", "C:\\V\\a.mp4 "), true, "bỏ khoảng trắng");
});

test("resultGuard: khác video ⇒ kết quả phải bỏ", () => {
  assert.equal(isSameProject("C:\\V\\a.mp4", "C:\\V\\b.mp4"), false);
  assert.equal(isSameProject("C:\\V\\a.mp4", ""), false, "dự án vừa được đóng");
  assert.equal(isSameProject("", "C:\\V\\b.mp4"), false, "dự án vừa được mở");
});

test("resultGuard: cả hai rỗng ⇒ không có gì để bảo vệ", () => {
  assert.equal(isSameProject("", ""), true);
  assert.equal(isSameProject(null, undefined), true);
});

test("resultGuard: guardProjectResult trả ok/stale", () => {
  assert.deepEqual(guardProjectResult("C:\\V\\a.mp4", "C:\\V\\a.mp4"), { ok: true, stale: false });
  assert.deepEqual(guardProjectResult("C:\\V\\a.mp4", "C:\\V\\b.mp4"), { ok: false, stale: true });
});

test("resultGuard: tên file hiển thị lấy từ đường dẫn", () => {
  assert.equal(projectDisplayName("C:\\Videos\\demo.mp4"), "demo.mp4");
  assert.equal(projectDisplayName("C:/Videos/sub/demo.mp4"), "demo.mp4");
  assert.equal(projectDisplayName(""), "video");
  assert.equal(projectDisplayName(null), "video");
});

test("resultGuard: thông điệp toast đúng chữ", () => {
  assert.equal(staleProjectMessage("demo.mp4"), "Đã bỏ kết quả của video cũ: demo.mp4");
});

test("resultGuard: staleProjectNotice chỉ trả về khi lệch", () => {
  assert.equal(staleProjectNotice("C:\\V\\a.mp4", "C:\\V\\a.mp4"), null);
  assert.equal(
    staleProjectNotice("C:\\V\\a.mp4", "C:\\V\\b.mp4"),
    "Đã bỏ kết quả của video cũ: a.mp4",
  );
  assert.equal(staleProjectNotice("", "C:\\V\\b.mp4"), "Đã bỏ kết quả của video cũ: video");
});
