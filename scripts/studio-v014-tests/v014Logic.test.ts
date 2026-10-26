/**
 * Test logic thuần giao diện v0.14 (`src/views/studio/v014/logic.ts` + `bandGeometry.ts`).
 * Chạy: node --test scripts/studio-v014-tests/
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  blurLevelFromSigma,
  coveragePct,
  deriveCardState,
  exportBlurSigma,
  isInSpans,
  parseDetectError,
  previewBlurPx,
  resolvePreset,
  spanBarSegments,
  wordState,
  type BandPx,
  type CardStateInput,
} from "../../src/views/studio/v014/logic.ts";
import {
  bandShorterThanText,
  clampBand,
  defaultManualBand,
  dragBand,
  nudgeBand,
  readout,
  snapTargetsFor,
  snapValue,
} from "../../src/views/studio/v014/bandGeometry.ts";

const V = { w: 1920, h: 1080 };
const BAND: BandPx = { x: 100, y: 900, w: 1720, h: 100 };

// ───── Mức mờ ─────
test("mức mờ: sigma xuất nhân cao/1080, xem thử nhân cao hiển thị/cao video", () => {
  assert.equal(exportBlurSigma("medium", 1080), 12);
  assert.equal(exportBlurSigma("strong", 540), 10);
  assert.equal(previewBlurPx("medium", 1080, 540), 6);
  assert.equal(previewBlurPx("light", 720, 360), 2);
  assert.equal(previewBlurPx("light", 0, 360), 0);
});

test("mức mờ: đọc ngược sigma về mức gần nhất", () => {
  assert.equal(blurLevelFromSigma(5), "light");
  assert.equal(blurLevelFromSigma(12), "medium");
  assert.equal(blurLevelFromSigma(30), "strong");
});

// ───── Mẫu & từ ─────
test("mẫu không có ở backend ⇒ về mẫu đầu tiên còn lại", () => {
  assert.equal(resolvePreset("box-amber", ["pop-amber", "reveal"]), "pop-amber");
  assert.equal(resolvePreset("reveal", ["pop-amber", "reveal"]), "reveal");
  assert.equal(resolvePreset("box-amber"), "box-amber");
  assert.equal(resolvePreset("box-amber", []), "box-amber");
});

test("trạng thái từ: trước câu mọi từ chưa nói", () => {
  assert.deepEqual([0, 1, 2].map((i) => wordState(i, -1)), ["pending", "pending", "pending"]);
  assert.deepEqual([0, 1, 2].map((i) => wordState(i, 1)), ["done", "active", "pending"]);
});

// ───── Khoảng thời gian ─────
test("khoảng có chữ: độ phủ, thanh, và tra thời điểm", () => {
  const spans: [number, number][] = [[10, 30], [40, 50]];
  assert.equal(coveragePct(spans, 60), 50);
  assert.equal(coveragePct(spans, 0), 0);
  assert.equal(coveragePct([[0, 100]], 60), 100);
  assert.ok(isInSpans(spans, 10) && isInSpans(spans, 45) && !isInSpans(spans, 35));
  const bar = spanBarSegments(spans, 60);
  assert.equal(bar.length, 2);
  assert.ok(Math.abs(bar[0].left - 16.667) < 0.01 && Math.abs(bar[0].width - 33.333) < 0.01);
  assert.equal(bar[1].start, 40);
  assert.deepEqual(spanBarSegments(spans, 0), []);
});

// ───── Lỗi ─────
test("lỗi: tách mã HARDSUB_* thành loại", () => {
  assert.deepEqual(parseDetectError("HARDSUB_MODEL_MISSING: Chưa có mô hình"), { kind: "model", message: "Chưa có mô hình" });
  assert.equal(parseDetectError("HARDSUB_DEPS_MISSING: x").kind, "deps");
  assert.equal(parseDetectError(new Error("HARDSUB_VIDEO_UNREADABLE: hỏng")).kind, "video");
  assert.equal(parseDetectError("HARDSUB_CANCELLED: huỷ").kind, "cancelled");
  assert.equal(parseDetectError("HARDSUB_FAILED: chết").kind, "other");
  assert.equal(parseDetectError("lỗi lạ").kind, "other");
  assert.equal(parseDetectError(null).message, "Không rõ nguyên nhân");
});

// ───── 6 trạng thái thẻ ─────
const base: CardStateInput = {
  enabled: true,
  running: null,
  detection: null,
  error: null,
  durationSec: 60,
  band: null,
  bandSource: "auto",
  videoH: 1080,
};
const found = { band: BAND, spans: [[10, 30], [40, 50]] as [number, number][], frames_with_text: 30, frames_total: 60 };

test("thẻ: tắt thắng mọi thứ", () => {
  assert.equal(deriveCardState({ ...base, enabled: false, running: { percent: 5, message: "" }, detection: found }).kind, "off");
});

test("thẻ: đang dò kẹp % trong 0–100", () => {
  const s = deriveCardState({ ...base, running: { percent: 134, message: "x" } });
  assert.deepEqual(s, { kind: "running", percent: 100, message: "x" });
});

test("thẻ: tìm thấy — số đoạn, độ phủ, vị trí", () => {
  const s = deriveCardState({ ...base, detection: found, band: BAND });
  assert.equal(s.kind, "found");
  if (s.kind !== "found") return;
  assert.equal(s.segments, 2);
  assert.equal(s.coverage, 50);
  assert.equal(s.where, "đáy khung");
  assert.equal(s.weak, false);
  assert.equal(s.manual, false);
});

test("thẻ: tìm thấy ít (< 5 % thời lượng) ⇒ weak", () => {
  const s = deriveCardState({ ...base, detection: { ...found, spans: [[1, 2]] }, band: BAND });
  assert.ok(s.kind === "found" && s.weak);
});

test("thẻ: không thấy chữ ⇒ none; tự đặt dải sau đó ⇒ found thủ công", () => {
  const none = { band: null, spans: [], frames_with_text: 0, frames_total: 60 };
  assert.deepEqual(deriveCardState({ ...base, detection: none }), { kind: "none", framesScanned: 60 });
  const s = deriveCardState({ ...base, detection: none, band: BAND, bandSource: "manual" });
  assert.ok(s.kind === "found" && s.manual && !s.weak && s.segments === 0);
});

test("thẻ: lỗi ⇒ error theo loại; huỷ ⇒ về chưa dò", () => {
  const e = deriveCardState({ ...base, error: "HARDSUB_MODEL_MISSING: thiếu" });
  assert.deepEqual(e, { kind: "error", error: "model", message: "thiếu" });
  assert.deepEqual(deriveCardState({ ...base, error: "HARDSUB_CANCELLED: huỷ" }), { kind: "idle" });
});

test("thẻ: tích rồi mà chưa dò ⇒ idle", () => {
  assert.deepEqual(deriveCardState(base), { kind: "idle" });
});

// ───── Hình học dải ─────
test("kẹp dải: trong khung và đủ cao tối thiểu 3 %", () => {
  assert.deepEqual(clampBand({ x: -50, y: 1070, w: 5000, h: 5 }, V), { x: 0, y: 1048, w: 1920, h: 32 });
  const d = defaultManualBand(V);
  assert.ok(Math.abs(d.y / V.h - 0.8) < 0.01 && Math.abs((d.y + d.h) / V.h - 0.94) < 0.01);
  assert.ok(Math.abs(d.x / V.w - 0.04) < 0.01 && Math.abs((d.x + d.w) / V.w - 0.96) < 0.01);
});

test("hút 4 px: trong ngưỡng thì hút, ngoài thì giữ", () => {
  assert.deepEqual(snapValue(903, [900, 1000]), { value: 900, snapped: true });
  assert.deepEqual(snapValue(905, [900, 1000]), { value: 905, snapped: false });
  assert.deepEqual(snapValue(998, [900, 1000]), { value: 1000, snapped: true });
});

test("kéo mép trên/dưới: hút vào mép dải dò, không vượt cỡ tối thiểu", () => {
  const t = snapTargetsFor(V, BAND);
  const up = dragBand({ ...BAND, y: 880, h: 120 }, "top", 0, 18, V, t);
  assert.equal(up.band.y, 900);
  assert.ok(up.snapped.top);
  const squash = dragBand(BAND, "top", 0, 500, V, t);
  assert.equal(squash.band.h, 32);
  assert.equal(squash.band.y + squash.band.h, 1000);
  const down = dragBand(BAND, "bottom", 0, 500, V, t);
  assert.equal(down.band.y + down.band.h, 1080);
});

test("kéo cạnh trái: mặc định đối xứng, Alt = một bên", () => {
  const t = { xs: [], ys: [] };
  const sym = dragBand(BAND, "left", 100, 0, V, t, true);
  assert.equal(sym.band.x, 200);
  assert.equal(sym.band.w, 1520);
  const one = dragBand(BAND, "left", 100, 0, V, t, false);
  assert.equal(one.band.x, 200);
  assert.equal(one.band.w, 1620);
  const right = dragBand(BAND, "right", -100, 0, V, t, true);
  assert.equal(right.band.x, 200);
  assert.equal(right.band.w, 1520);
});

test("kéo cả khung: không ra ngoài video và hút mép khung", () => {
  const t = snapTargetsFor(V, null);
  const m = dragBand(BAND, "move", -500, 500, V, t);
  assert.equal(m.band.x, 0);
  assert.equal(m.band.y + m.band.h, 1080);
  assert.ok(m.snapped.bottom || m.snapped.left);
  const m2 = dragBand(BAND, "move", 0, 77, V, { xs: [], ys: [] });
  assert.equal(m2.band.y, 977);
});

test("phím: mũi tên dời 1 px, Shift ×10, phím khác bỏ qua", () => {
  assert.equal(nudgeBand(BAND, "ArrowUp", false, V)?.y, 899);
  assert.equal(nudgeBand(BAND, "ArrowDown", true, V)?.y, 910);
  assert.equal(nudgeBand({ ...BAND, y: 0 }, "ArrowUp", true, V)?.y, 0);
  assert.equal(nudgeBand(BAND, "a", false, V), null);
});

test("số đọc lúc kéo + cảnh báo dải thấp hơn dòng chữ", () => {
  assert.equal(readout({ x: 0, y: 853.2, w: 100, h: 184 }, V), "Trên 79,0 % · Dưới 96,0 % · cao 184 px");
  assert.ok(bandShorterThanText({ ...BAND, h: 40 }, 42, 1080));
  assert.ok(!bandShorterThanText({ ...BAND, h: 100 }, 42, 1080));
});

// ───── Nối project / lưu phiên ─────
import { restoreV014, toProjectHardsub, toProjectSubStyle, DEFAULT_HARDSUB, DEFAULT_SUB_STYLE } from "../../src/views/studio/v014/logic.ts";

test("xuất: sub_style quy cỡ chữ theo cao video, mẫu chỉ khi Nhảy chữ", () => {
  assert.deepEqual(toProjectSubStyle({ ...DEFAULT_SUB_STYLE, mode: "kinetic", fontSize: 40 }, 1080), {
    mode: "kinetic", preset: "pop-amber", font_size: 40, position: "bottom",
  });
  assert.equal(toProjectSubStyle({ ...DEFAULT_SUB_STYLE, fontSize: 40 }, 2160).font_size, 80);
  assert.equal(toProjectSubStyle(DEFAULT_SUB_STYLE, 720).preset, "normal");
});

test("xuất: hardsub chỉ bật khi có dải; không có khoảng ⇒ suốt video", () => {
  assert.equal(toProjectHardsub({ ...DEFAULT_HARDSUB, enabled: true }).enabled, false);
  const h = toProjectHardsub({ ...DEFAULT_HARDSUB, enabled: true, band: BAND, spans: [] });
  assert.ok(h.enabled);
  assert.equal(h.scope, "whole");
  assert.equal(toProjectHardsub({ ...DEFAULT_HARDSUB, enabled: true, band: BAND, spans: [[1, 2]] }).scope, "text_only");
});

test("phiên: dữ liệu thiếu / hỏng / phiên cũ ⇒ về mặc định hợp lệ", () => {
  for (const raw of [undefined, null, "x", 5, [], {}, { subStyle: 3, hardsub: "a" }]) {
    const r = restoreV014(raw);
    assert.equal(r.hardsub.enabled, false);
    assert.equal(r.subStyle.mode, "normal");
    assert.equal(r.detection, null);
  }
  const r = restoreV014({
    subStyle: { mode: "kinetic", preset: "nope", fontSize: 999, position: "center" },
    hardsub: { enabled: true, band: { x: 1, y: 2, w: 3, h: 4 }, spans: [[1, 2], "bad"], blur: "strong", stamp: false, scope: "whole", bandSource: "manual" },
    detectedFor: "a.mp4",
  });
  assert.equal(r.subStyle.preset, "pop-amber");
  assert.equal(r.subStyle.fontSize, 96);
  assert.deepEqual(r.hardsub.spans, [[1, 2]]);
  assert.deepEqual(r.hardsub.band, { x: 1, y: 2, w: 3, h: 4 });
  assert.equal(r.hardsub.stamp, false);
  assert.equal(restoreV014({ hardsub: { band: { x: 1, y: 2, w: 0, h: 4 } } }).hardsub.band, null);
});

import { toPersistedTab, readSessionTab, saveSessionTab } from "../../src/lib/studio/sessionStore.ts";

test("sessionStore: v014 đi qua lưu → đọc; phiên cũ không có v014 vẫn đọc được", () => {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  const v014 = { hardsub: { enabled: true } };
  const base = { tabId: "t1", filePath: "a.mp4", fileName: "a", mediaDuration: 5, segments: [], speakers: [], currentTime: 0 };
  assert.equal(toPersistedTab({ ...base, v014 }).v014, v014);
  assert.ok(!("v014" in toPersistedTab(base)));
  assert.ok(saveSessionTab(storage, { ...base, v014 }).ok);
  assert.deepEqual(readSessionTab(storage, "t1")?.v014, v014);
  assert.ok(saveSessionTab(storage, { ...base, tabId: "t2" }).ok);
  assert.equal(readSessionTab(storage, "t2")?.v014, undefined);
});
