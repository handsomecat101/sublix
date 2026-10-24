//! TSK-UI-REDESIGN-R2-7B — test logic thuần của tab Lịch sử (không React/Tauri).
//! Chạy: node --test scripts/live-history-tests/historyLogic.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_CUE_MS,
  UTF8_BOM,
  buildCopyText,
  buildSingleCopyText,
  buildSrtContent,
  buildTxtContent,
  chronological,
  exportFileName,
  filterHistory,
  formatSrtTimestamp,
} from "../../src/views/history/historyLogic.ts";
import type { LiveSubPreview } from "../../src/views/live/liveTypes.ts";

/** `recentSubs` luôn đẩy câu MỚI nhất lên đầu. */
const ITEMS: LiveSubPreview[] = [
  { id: 3, text: "Xin chào các bạn", original: "Hello everyone", timestamp: 3000 },
  { id: 2, text: "Chào buổi sáng", original: "Good morning", timestamp: 2000 },
  { id: 1, text: "Bắt đầu thu âm", timestamp: 1000 },
];

/* ------------------------------------------------------------------ */
/* Lọc / tìm                                                            */
/* ------------------------------------------------------------------ */

test("filterHistory: không từ khoá -> trả về toàn bộ danh sách", () => {
  const out = filterHistory(ITEMS, "");
  assert.equal(out.length, ITEMS.length);
});

test("filterHistory: từ khoá rỗng toàn khoảng trắng -> vẫn trả về toàn bộ", () => {
  assert.equal(filterHistory(ITEMS, "   ").length, ITEMS.length);
});

test("filterHistory: tìm trong bản dịch", () => {
  const out = filterHistory(ITEMS, "chào");
  assert.equal(out.length, 2);
  assert.ok(out.every((i) => i.text.toLowerCase().includes("chào")));
});

test("filterHistory: tìm trong bản gốc", () => {
  const out = filterHistory(ITEMS, "morning");
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, 2);
});

test("filterHistory: không phân biệt hoa thường", () => {
  assert.equal(filterHistory(ITEMS, "HELLO").length, 1);
  assert.equal(filterHistory(ITEMS, "hello").length, 1);
});

test("filterHistory: không khớp -> mảng rỗng", () => {
  assert.deepEqual(filterHistory(ITEMS, "xyzzy"), []);
});

test("filterHistory: không sửa mảng gốc", () => {
  const before = ITEMS.length;
  filterHistory(ITEMS, "chào");
  assert.equal(ITEMS.length, before);
});

/* ------------------------------------------------------------------ */
/* Thứ tự thời gian                                                      */
/* ------------------------------------------------------------------ */

test("chronological: đảo thứ tự (mới nhất trước -> cũ nhất trước)", () => {
  const out = chronological(ITEMS);
  assert.deepEqual(
    out.map((i) => i.id),
    [1, 2, 3],
  );
});

/* ------------------------------------------------------------------ */
/* Nội dung sao chép / xuất TXT                                          */
/* ------------------------------------------------------------------ */

test("buildCopyText: có nhãn [Gốc]/[Dịch] và đúng thứ tự thời gian", () => {
  const text = buildCopyText(ITEMS);
  assert.ok(text.includes("[Gốc] Hello everyone"));
  assert.ok(text.includes("[Dịch] Xin chào các bạn"));
  assert.ok(text.indexOf("Bắt đầu thu âm") < text.indexOf("Xin chào các bạn"));
});

test("buildCopyText: câu không có bản gốc -> chỉ in bản dịch", () => {
  const text = buildCopyText([{ id: 1, text: "Không có gốc" }]);
  assert.equal(text.trim(), "Không có gốc");
});

test("buildTxtContent: bản gốc trên, bản dịch dưới, không nhãn", () => {
  const text = buildTxtContent(ITEMS);
  assert.ok(text.includes("Hello everyone\nXin chào các bạn"));
  assert.ok(!text.includes("[Gốc]"));
});

test("buildSingleCopyText: 1 câu (có gốc thì 2 dòng)", () => {
  assert.equal(buildSingleCopyText({ id: 1, text: "A", original: "B" }), "B\nA");
  assert.equal(buildSingleCopyText({ id: 1, text: "A" }), "A");
  assert.equal(buildSingleCopyText(null), "");
});

/* ------------------------------------------------------------------ */
/* Định dạng SRT                                                          */
/* ------------------------------------------------------------------ */

test("formatSrtTimestamp: định dạng HH:MM:SS,mmm", () => {
  assert.equal(formatSrtTimestamp(0), "00:00:00,000");
  assert.equal(formatSrtTimestamp(3661500), "01:01:01,500");
  assert.equal(formatSrtTimestamp(-5), "00:00:00,000");
});

test("buildSrtContent: dùng timestamp THẬT của event (không bịa 3s/đoạn)", () => {
  const srt = buildSrtContent(ITEMS);
  assert.ok(srt.startsWith("1\n00:00:00,000 --> 00:00:02,500\n"), srt.slice(0, 60));
  assert.ok(srt.includes("2\n00:00:01,000 --> 00:00:03,500\n"), srt);
  assert.ok(srt.includes("3\n00:00:02,000 --> 00:00:04,500\n"), srt);
});

test("buildSrtContent: câu không có timestamp -> fallback theo bội số 3s", () => {
  const srt = buildSrtContent([
    { id: 2, text: "cau moi" },
    { id: 1, text: "cau cu" },
  ]);
  assert.ok(srt.includes(`00:00:00,000 --> 00:00:02,800`), srt);
  assert.ok(
    srt.includes(
      `00:00:0${FALLBACK_CUE_MS / 1000},000 --> 00:00:05,800`,
    ),
    srt,
  );
});

test("buildSrtContent: giữ cả bản gốc và bản dịch, đánh số liên tục", () => {
  const srt = buildSrtContent(ITEMS);
  assert.ok(srt.includes("Hello everyone\nXin chào các bạn"));
  assert.ok(srt.includes("Bắt đầu thu âm\n\n"));
  assert.ok(!srt.includes("4\n"), "không được sinh câu giả");
});

test("buildSrtContent: danh sách rỗng -> chuỗi rỗng", () => {
  assert.equal(buildSrtContent([]), "");
});

test("buildSrtContent: cue tối thiểu 1s (không có cue quá ngắn)", () => {
  const srt = buildSrtContent([
    { id: 2, text: "b", timestamp: 1000, audio_duration: 0.2 },
    { id: 1, text: "a", timestamp: 1000, audio_duration: 0.2 },
  ]);
  const cue = srt.split("\n")[1] ?? "";
  assert.ok(cue.includes("--> 00:00:01,000"), cue);
});

test("UTF8_BOM là ký tự BOM chuẩn (Notepad hiển thị đúng tiếng Việt)", () => {
  assert.equal(UTF8_BOM, "\uFEFF");
});

/* ------------------------------------------------------------------ */
/* Tên file xuất                                                         */
/* ------------------------------------------------------------------ */

test("exportFileName: đúng định dạng + đuôi file", () => {
  const date = new Date("2026-10-25T08:30:00.000Z");
  assert.equal(exportFileName("subtitles", "srt", date), "sublix-subtitles-2026-10-25.srt");
  assert.equal(exportFileName("transcript", "txt", date), "sublix-transcript-2026-10-25.txt");
});
