//! TSK-UI-REDESIGN-R2-7B — test logic thuần của tab Live (không React/Tauri).
//! Chạy: node --test scripts/live-history-tests/liveLogic.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  CHUNK_SECONDS_MAX,
  CHUNK_SECONDS_MIN,
  DEFAULT_TARGET_LANG,
  ORIGINAL_DISPLAY_VALUE,
  TARGET_LANGS,
  buildDisplayOptions,
  chunkSecondsLabel,
  clampChunkSeconds,
  deviceLabel,
  deviceOptionValue,
  fromDisplayValue,
  liveHint,
  liveStatusLabel,
  parseDeviceIndex,
  peakPercent,
  toDisplayValue,
} from "../../src/views/live/liveLogic.ts";

/* ------------------------------------------------------------------ */
/* Select gộp "Phụ đề hiển thị" (gộp Chế độ xuất + Ngôn ngữ đích)     */
/* ------------------------------------------------------------------ */

test("toDisplayValue: chế độ gốc -> 'original'", () => {
  assert.equal(toDisplayValue("original", "vi"), ORIGINAL_DISPLAY_VALUE);
});

test("toDisplayValue: chế độ dịch -> 'translated:<lang>'", () => {
  assert.equal(toDisplayValue("translated", "vi"), "translated:vi");
  assert.equal(toDisplayValue("translated", "ja"), "translated:ja");
});

test("fromDisplayValue: chọn 'Gốc' -> outputMode=original và GIỮ ngôn ngữ đích", () => {
  const out = fromDisplayValue("original", "en");
  assert.equal(out.outputMode, "original");
  assert.equal(out.targetLang, "en", "không được mất lựa chọn của người dùng");
});

test("fromDisplayValue: chọn 'Dịch sang en' -> outputMode=translated, targetLang=en", () => {
  const out = fromDisplayValue("translated:en", "vi");
  assert.equal(out.outputMode, "translated");
  assert.equal(out.targetLang, "en");
});

test("fromDisplayValue: giá trị rỗng -> original + ngôn ngữ đích mặc định", () => {
  const out = fromDisplayValue("", "");
  assert.equal(out.outputMode, "original");
  assert.equal(out.targetLang, DEFAULT_TARGET_LANG);
});

test("fromDisplayValue: 'translated:' rỗng -> fallback sang ngôn ngữ đích hiện tại", () => {
  const out = fromDisplayValue("translated:", "ko");
  assert.equal(out.outputMode, "translated");
  assert.equal(out.targetLang, "ko");
});

test("vòng tròn: fromDisplayValue(toDisplayValue(...)) giữ nguyên cả 2 trạng thái", () => {
  for (const mode of ["original", "translated"] as const) {
    for (const lang of ["vi", "en", "ja", "zh", "ko"]) {
      const value = toDisplayValue(mode, lang);
      const out = fromDisplayValue(value, lang);
      assert.equal(out.outputMode, mode);
      if (mode === "translated") assert.equal(out.targetLang, lang);
    }
  }
});

test("buildDisplayOptions: có lựa chọn 'Gốc' + 1 lựa chọn cho mỗi ngôn ngữ đích", () => {
  const options = buildDisplayOptions("vi");
  assert.equal(options.length, 1 + TARGET_LANGS.length);
  assert.equal(options[0]?.value, ORIGINAL_DISPLAY_VALUE);
  assert.equal(options[0]?.mode, "original");
  assert.ok(options.some((o) => o.value === "translated:vi" && o.label.includes("Tiếng Việt")));
});

test("buildDisplayOptions: ngôn ngữ đích lạ (ngoài danh sách) vẫn có lựa chọn riêng", () => {
  const options = buildDisplayOptions("de");
  const extra = options.find((o) => o.value === "translated:de");
  assert.ok(extra, "phải có lựa chọn cho ngôn ngữ đang dùng");
  assert.equal(extra?.mode, "translated");
  assert.equal(extra?.lang, "de");
});

test("buildDisplayOptions: không nhân bản lựa chọn khi ngôn ngữ đã có trong danh sách", () => {
  const options = buildDisplayOptions("vi");
  assert.equal(options.filter((o) => o.value === "translated:vi").length, 1);
});

/* ------------------------------------------------------------------ */
/* Thiết bị âm thanh                                                    */
/* ------------------------------------------------------------------ */

test("parseDeviceIndex: 'default' -> undefined (dùng thiết bị mặc định)", () => {
  assert.equal(parseDeviceIndex("default"), undefined);
});

test("parseDeviceIndex: 'index:3' -> 3", () => {
  assert.equal(parseDeviceIndex("index:3"), 3);
});

test("parseDeviceIndex: giá trị lạ / rỗng -> undefined (không ném lỗi)", () => {
  assert.equal(parseDeviceIndex(""), undefined);
  assert.equal(parseDeviceIndex("index:abc"), undefined);
  assert.equal(parseDeviceIndex("index:"), undefined);
  assert.equal(parseDeviceIndex("3"), undefined);
});

test("deviceOptionValue + deviceLabel: giá trị <option> và nhãn hiển thị", () => {
  assert.equal(deviceOptionValue(2), "index:2");
  assert.equal(deviceLabel(2, "Speaker"), "[2] Speaker");
});

test("parseDeviceIndex là nghịch đảo của deviceOptionValue", () => {
  for (const index of [0, 1, 7, 12]) {
    assert.equal(parseDeviceIndex(deviceOptionValue(index)), index);
  }
});

/* ------------------------------------------------------------------ */
/* Độ dài phân đoạn + mức âm thanh                                      */
/* ------------------------------------------------------------------ */

test("clampChunkSeconds: chặn trong khoảng 2–8 giây", () => {
  assert.equal(clampChunkSeconds(1), CHUNK_SECONDS_MIN);
  assert.equal(clampChunkSeconds(9), CHUNK_SECONDS_MAX);
  assert.equal(clampChunkSeconds(3), 3);
});

test("clampChunkSeconds: làm tròn + xử lý giá trị lỗi", () => {
  assert.equal(clampChunkSeconds(3.4), 3);
  assert.equal(clampChunkSeconds(3.6), 4);
  assert.equal(clampChunkSeconds(Number.NaN), CHUNK_SECONDS_MIN);
});

test("chunkSecondsLabel: '3 giây'", () => {
  assert.equal(chunkSecondsLabel(3), "3 giây");
});

test("peakPercent: kẹp 0–100", () => {
  assert.equal(peakPercent(0.5), 50);
  assert.equal(peakPercent(1.5), 100);
  assert.equal(peakPercent(-1), 0);
  assert.equal(peakPercent(Number.NaN), 0);
});

/* ------------------------------------------------------------------ */
/* Nhãn trạng thái                                                       */
/* ------------------------------------------------------------------ */

test("liveStatusLabel / liveHint đổi theo trạng thái Live", () => {
  assert.ok(liveStatusLabel(false).includes("SẴN SÀNG"));
  assert.ok(liveStatusLabel(true).includes("LIVE STREAM"));
  assert.ok(liveHint(false).includes("Bắt Đầu Live"));
  assert.ok(liveHint(true).includes("Smart VAD"));
});
