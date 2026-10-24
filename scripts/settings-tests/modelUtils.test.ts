//! TSK-SETTINGS-MODELS — test logic thuần mục STT.
//! Chạy: node --test scripts/settings-tests/modelUtils.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBytesVi,
  formatSpeedVi,
  formatEtaVi,
  progressPct,
  sortSttEngines,
  engineSummary,
  recommendSttEngine,
} from "../../src/views/settings/modelUtils.ts";
import type { SttEngineStatus } from "../../src/lib/tauri.ts";

function engine(over: Partial<SttEngineStatus>): SttEngineStatus {
  return {
    id: "e",
    name: "Engine",
    label: "Engine",
    family: "sensevoice",
    languages: ["en", "zh"],
    lang_label: "EN/ZH",
    desc: "",
    size_mb: 100,
    size_note: "≈100 MB",
    license: "MIT",
    rtf_note: "",
    requires_cuda: false,
    word_timestamps: true,
    notes: "",
    state: "not_downloaded",
    downloaded: false,
    bytes_downloaded: 0,
    bytes_total: 0,
    progress_pct: 0,
    error: null,
    is_default: false,
    selected: false,
    ...over,
  };
}

test("formatBytesVi: B / KB / MB / GB", () => {
  assert.equal(formatBytesVi(0), "0 B");
  assert.equal(formatBytesVi(512), "1 KB");
  assert.equal(formatBytesVi(228 * 1048576), "228 MB");
  assert.match(formatBytesVi(1.5 * 1073741824), /^1,5 GB$/);
});

test("formatSpeedVi: 0 và NaN -> —, còn lại MB/s", () => {
  assert.equal(formatSpeedVi(0), "—");
  assert.equal(formatSpeedVi(Number.NaN), "—");
  assert.equal(formatSpeedVi(-5), "—");
  assert.equal(formatSpeedVi(3.4 * 1048576), "3,4 MB/s");
});

test("formatEtaVi: null/âm -> —, 75s -> 1:15, 3600s -> 60:00", () => {
  assert.equal(formatEtaVi(null), "—");
  assert.equal(formatEtaVi(-1), "—");
  assert.equal(formatEtaVi(75), "1:15");
  assert.equal(formatEtaVi(3600), "60:00");
});

test("progressPct: tổng 0 -> 0, kẹp 0..100", () => {
  assert.equal(progressPct(0, 0), 0);
  assert.equal(progressPct(50, 100), 50);
  assert.equal(progressPct(150, 100), 100);
  assert.equal(progressPct(-10, 100), 0);
  assert.equal(progressPct(Number.NaN, 100), 0);
});

test("sortSttEngines: đang chọn -> đã tải -> chưa tải, rồi dung lượng tăng", () => {
  const a = engine({ id: "a", name: "A", size_mb: 900 });
  const b = engine({ id: "b", name: "B", size_mb: 200, downloaded: true, state: "ready" });
  const c = engine({ id: "c", name: "C", size_mb: 400, downloaded: true, state: "ready", selected: true });
  const d = engine({ id: "d", name: "D", size_mb: 50 });
  const out = sortSttEngines([a, b, c, d]).map((e) => e.id);
  assert.deepEqual(out, ["c", "b", "d", "a"]);
});

test("sortSttEngines không mutate mảng gốc", () => {
  const list = [engine({ id: "x", size_mb: 900 }), engine({ id: "y", size_mb: 10, downloaded: true })];
  const order = list.map((e) => e.id);
  sortSttEngines(list);
  assert.deepEqual(list.map((e) => e.id), order);
});

test("engineSummary đếm đúng total/ready/downloading/errors", () => {
  const s = engineSummary([
    engine({ id: "1", downloaded: true, state: "ready" }),
    engine({ id: "2", state: "downloading" }),
    engine({ id: "3", state: "error" }),
    engine({ id: "4" }),
  ]);
  assert.deepEqual(s, { total: 4, ready: 1, downloading: 1, errors: 1 });
});

test("recommendSttEngine: chọn engine đã tải, có timestamp, đúng ngôn ngữ, nhỏ nhất", () => {
  const big = engine({ id: "big", size_mb: 900, downloaded: true, state: "ready" });
  const small = engine({ id: "small", size_mb: 228, downloaded: true, state: "ready" });
  const noTs = engine({ id: "nots", size_mb: 100, downloaded: true, state: "ready", word_timestamps: false });
  const zhOnly = engine({ id: "zh", size_mb: 90, downloaded: true, state: "ready", languages: ["zh"] });
  assert.equal(recommendSttEngine([big, noTs, zhOnly, small], "en")?.id, "small");
  assert.equal(recommendSttEngine([big, noTs, zhOnly, small], "zh")?.id, "zh");
});

test("recommendSttEngine: null khi chưa tải gì / khi engine đang chọn đã là gợi ý", () => {
  assert.equal(recommendSttEngine([engine({ id: "a" })]), null);
  const best = engine({ id: "a", size_mb: 100, downloaded: true, state: "ready", selected: true });
  assert.equal(recommendSttEngine([best]), null);
});
