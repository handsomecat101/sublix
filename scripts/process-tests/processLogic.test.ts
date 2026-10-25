//! TSK-UI-REDESIGN-R2-7C — test logic thuần của tab Tiến trình.
//! Chạy: node --test scripts/process-tests/processLogic.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  PROCESS_FILTERS,
  buildFilterOptions,
  countProcessFilter,
  dedupeHistoryIds,
  emptyStateHint,
  filterProcessTasks,
  makeTaskRunId,
  matchesProcessFilter,
  processCategoryMeta,
  sanitizeLabel,
  splitProcessTasks,
  upsertHistoryItem,
  type ProcessFilter,
} from "../../src/views/processLogic.ts";
import type { AppTaskItem } from "../../src/views/processTypes.ts";

function task(over: Partial<AppTaskItem>): AppTaskItem {
  return {
    id: "t1",
    type: "subtitle",
    title: "Tác vụ",
    stage: "Đang chạy",
    percent: 50,
    status: "running",
    startedAt: Date.now(),
    targetTab: "studio",
    ...over,
  };
}

const ACTIVE: AppTaskItem[] = [
  task({ id: "a1", type: "subtitle", workflowType: "subtitle_only", status: "running" }),
  task({ id: "a2", type: "downloader", status: "running" }),
];

const HISTORY: AppTaskItem[] = [
  task({ id: "h1", type: "file_sub", status: "completed" }),
  task({ id: "h2", type: "dubbing", workflowType: "dubbing", status: "completed" }),
  task({ id: "h3", type: "model", status: "error" }),
];

/* ------------------------------------------------------------------ */
/* Bộ lọc + nhãn canonical                                               */
/* ------------------------------------------------------------------ */

test("PROCESS_FILTERS: đúng 6 chip theo thứ tự thiết kế", () => {
  assert.deepEqual(
    PROCESS_FILTERS.map((f) => f.id),
    ["all", "active", "subtitle", "dubbing", "downloader", "model"],
  );
});

test("PROCESS_FILTERS: nhãn KHÔNG dính ký tự lạ (bug cũ 'Tải videoo', 'Đang xử lýo')", () => {
  for (const def of PROCESS_FILTERS) {
    // Không có ký tự ẩn / zero-width
    assert.equal(sanitizeLabel(def.label), def.label, `label "${def.label}" có ký tự ẩn`);
    // Không có đuôi chữ lặp kiểu "...oo" / "...aa"
    assert.ok(!/(.)\1$/.test(def.label.replace(/[^A-Za-zÀ-ỹ]/g, "")), `label "${def.label}" bị lặp chữ`);
    // Không kết thúc bằng chữ thừa sau từ (ví dụ "videoo")
    assert.ok(
      !/(video|lý|chạy|giải|ề|á)o$/i.test(def.label),
      `label "${def.label}" bị dính ký tự thừa`,
    );
  }
});

test("PROCESS_FILTERS: mỗi chip có icon + tooltip", () => {
  for (const def of PROCESS_FILTERS) {
    assert.ok(def.icon.length > 0, `thiếu icon cho ${def.id}`);
    assert.ok(def.title.length > 0, `thiếu tooltip cho ${def.id}`);
  }
});

/* ------------------------------------------------------------------ */
/* Lọc                                                                  */
/* ------------------------------------------------------------------ */

test("matchesProcessFilter: 'all' khớp mọi tác vụ", () => {
  assert.ok(ACTIVE.every((t) => matchesProcessFilter(t, "all")));
  assert.ok(HISTORY.every((t) => matchesProcessFilter(t, "all")));
});

test("matchesProcessFilter: 'active' chỉ khớp tác vụ đang chạy", () => {
  assert.ok(matchesProcessFilter(ACTIVE[0]!, "active"));
  assert.ok(!matchesProcessFilter(HISTORY[0]!, "active"));
  assert.ok(!matchesProcessFilter(task({ status: "error" }), "active"));
});

test("matchesProcessFilter: 'subtitle' khớp file_sub/subtitle/subtitle_only/subtitle_translate", () => {
  assert.ok(matchesProcessFilter(task({ type: "file_sub" }), "subtitle"));
  assert.ok(matchesProcessFilter(task({ type: "subtitle" }), "subtitle"));
  assert.ok(matchesProcessFilter(task({ workflowType: "subtitle_only" }), "subtitle"));
  assert.ok(matchesProcessFilter(task({ workflowType: "subtitle_translate" }), "subtitle"));
  assert.ok(!matchesProcessFilter(task({ type: "downloader" }), "subtitle"));
});

test("matchesProcessFilter: 'dubbing' khớp dubbing/voice_only", () => {
  assert.ok(matchesProcessFilter(task({ type: "dubbing" }), "dubbing"));
  assert.ok(matchesProcessFilter(task({ workflowType: "dubbing" }), "dubbing"));
  assert.ok(matchesProcessFilter(task({ workflowType: "voice_only" }), "dubbing"));
  assert.ok(!matchesProcessFilter(task({ type: "model" }), "dubbing"));
});

test("matchesProcessFilter: 'downloader' và 'model' theo đúng type", () => {
  assert.ok(matchesProcessFilter(task({ type: "downloader" }), "downloader"));
  assert.ok(matchesProcessFilter(task({ type: "model" }), "model"));
  assert.ok(!matchesProcessFilter(task({ type: "model" }), "downloader"));
});

test("filterProcessTasks: lọc theo nhóm", () => {
  assert.equal(filterProcessTasks([...ACTIVE, ...HISTORY], "downloader").length, 1);
  assert.equal(filterProcessTasks([...ACTIVE, ...HISTORY], "model").length, 1);
  assert.equal(filterProcessTasks([...ACTIVE, ...HISTORY], "all").length, 5);
});

/* ------------------------------------------------------------------ */
/* Đếm số                                                               */
/* ------------------------------------------------------------------ */

test("countProcessFilter: đếm đúng theo từng chip", () => {
  const counts = countProcessFilter(ACTIVE, HISTORY);
  assert.equal(counts.all, 5);
  assert.equal(counts.active, 2, "chỉ 2 tác vụ đang chạy");
  assert.equal(counts.subtitle, 2, "a1 (subtitle_only) + h1 (file_sub)");
  assert.equal(counts.dubbing, 1, "chỉ h2");
  assert.equal(counts.downloader, 1, "chỉ a2");
  assert.equal(counts.model, 1, "chỉ h3");
});

test("countProcessFilter: chip 'active' chỉ đếm tác vụ đang chạy (không tính lịch sử)", () => {
  const counts = countProcessFilter([], HISTORY);
  assert.equal(counts.active, 0);
  assert.equal(counts.all, HISTORY.length);
});

test("countProcessFilter: mọi nhóm đều >= 0 khi không có tác vụ", () => {
  const counts = countProcessFilter([], []);
  for (const key of Object.keys(counts) as ProcessFilter[]) {
    assert.equal(counts[key], 0);
  }
});

/* ------------------------------------------------------------------ */
/* Tách danh sách hiển thị                                               */
/* ------------------------------------------------------------------ */

test("splitProcessTasks: bộ lọc 'active' ẩn hoàn toàn phần lịch sử", () => {
  const out = splitProcessTasks(ACTIVE, HISTORY, "active");
  assert.equal(out.active.length, 2);
  assert.equal(out.history.length, 0);
});

test("splitProcessTasks: bộ lọc khác giữ cả đang chạy + lịch sử", () => {
  const out = splitProcessTasks(ACTIVE, HISTORY, "all");
  assert.equal(out.active.length, 2);
  assert.equal(out.history.length, 3);
});

test("splitProcessTasks: lọc theo nhóm ở cả 2 danh sách", () => {
  const out = splitProcessTasks(ACTIVE, HISTORY, "model");
  assert.equal(out.active.length, 0);
  assert.equal(out.history.length, 1);
  assert.equal(out.history[0]?.id, "h3");
});

/* ------------------------------------------------------------------ */
/* Chip kèm số đếm                                                       */
/* ------------------------------------------------------------------ */

test("buildFilterOptions: 6 lựa chọn, nhãn kèm số đếm", () => {
  const options = buildFilterOptions(countProcessFilter(ACTIVE, HISTORY));
  assert.equal(options.length, 6);
  assert.equal(options[0]?.value, "all");
  assert.ok(options[0]?.label.includes("Tất cả"));
  assert.ok(options[0]?.label.includes("5"), "nhãn 'Tất cả' phải có số đếm 5");
  assert.ok(options[1]?.label.includes("2"), "nhãn 'Đang chạy' phải có số đếm 2");
  assert.ok(options.every((o) => o.title.length > 0));
});

/* ------------------------------------------------------------------ */
/* Làm sạch nhãn                                                         */
/* ------------------------------------------------------------------ */

test("sanitizeLabel: bỏ ký tự zero-width + control, trim, gộp khoảng trắng", () => {
  assert.equal(sanitizeLabel("Tải\u200B video\u0007"), "Tải video");
  assert.equal(sanitizeLabel("  Đang   xử lý  "), "Đang xử lý");
  assert.equal(sanitizeLabel(""), "");
  assert.equal(sanitizeLabel(undefined), "");
  assert.equal(sanitizeLabel(null), "");
});

test("sanitizeLabel: giữ nguyên dấu tiếng Việt", () => {
  assert.equal(sanitizeLabel("Lồng tiếng & Phân vai"), "Lồng tiếng & Phân vai");
});

/* ------------------------------------------------------------------ */
/* Nhóm tác vụ                                                           */
/* ------------------------------------------------------------------ */

test("processCategoryMeta: ưu tiên workflowType (nguồn sự thật từ Studio)", () => {
  const meta = processCategoryMeta(
    task({ workflowType: "subtitle_only", workflowLabel: "Tạo Phụ Đề Gốc" }),
  );
  assert.equal(meta.key, "subtitle");
  assert.equal(meta.label, "Tạo Phụ Đề Gốc");
  assert.equal(meta.badgeClass, "cat-sub");
});

test("processCategoryMeta: mỗi workflowType có màu/nhóm riêng", () => {
  assert.equal(processCategoryMeta(task({ workflowType: "subtitle_translate", workflowLabel: "Dịch" })).key, "translate");
  assert.equal(processCategoryMeta(task({ workflowType: "voice_only", workflowLabel: "TTS" })).key, "voice");
  assert.equal(processCategoryMeta(task({ workflowType: "dubbing", workflowLabel: "Lồng tiếng" })).key, "dubbing");
});

test("processCategoryMeta: fallback theo type khi không có workflowLabel", () => {
  assert.equal(processCategoryMeta(task({ type: "file_sub" })).label, "Tạo Phụ Đề AI");
  assert.equal(processCategoryMeta(task({ type: "dubbing" })).label, "Studio Lồng Tiếng AI");
  assert.equal(processCategoryMeta(task({ type: "downloader" })).label, "Tải Video");
  assert.equal(processCategoryMeta(task({ type: "model" })).label, "Mô Hình AI");
  assert.equal(processCategoryMeta(task({ type: "live" })).label, "Tác Vụ Sublix");
});

test("processCategoryMeta: nhãn rác từ backend được làm sạch", () => {
  const meta = processCategoryMeta(task({ workflowType: "subtitle_only", workflowLabel: "  Tạo\u200B Phụ Đề  " }));
  assert.equal(meta.label, "Tạo Phụ Đề");
});

/* ------------------------------------------------------------------ */
/* Trạng thái rỗng                                                       */
/* ------------------------------------------------------------------ */

test("emptyStateHint: mỗi bộ lọc có 1 câu hướng dẫn riêng, không rỗng", () => {
  const filters: ProcessFilter[] = ["all", "active", "subtitle", "dubbing", "downloader", "model"];
  const hints = filters.map((f) => emptyStateHint(f));
  for (const hint of hints) {
    assert.ok(hint.length > 20, "câu hướng dẫn quá ngắn");
    assert.ok(hint.includes("."), "câu hướng dẫn phải là câu hoàn chỉnh");
  }
  assert.equal(new Set(hints).size, hints.length, "mỗi nhóm phải có câu riêng");
});

/* ------------------------------------------------------------------ */
/* TSK-FIX-BUG-R2-8-01 — id lần chạy + khử trùng lịch sử                 */
/* ------------------------------------------------------------------ */

test("makeTaskRunId: id DUY NHẤT theo lần chạy", () => {
  const a = makeTaskRunId("dubbing", 1_700_000_000_000, "abc123");
  const b = makeTaskRunId("dubbing", 1_700_000_000_001, "def456");
  assert.equal(a, "dubbing_1700000000000_abc123");
  assert.notEqual(a, b, "2 lần chạy khác mốc phải khác id");
  // Không salt ⇒ vẫn duy nhất (random + mốc bắt đầu).
  const c = makeTaskRunId("dubbing", 1_700_000_000_000);
  assert.match(c, /^dubbing_1700000000000_[a-z0-9]+$/);
  assert.notEqual(c, makeTaskRunId("dubbing", 1_700_000_000_000));
  // Tiền tố rác được làm sạch (chỉ còn ký tự an toàn cho id).
  const dirty = makeTaskRunId("lồng tiếng!", 1, "z");
  assert.match(dirty, /^[a-z0-9_]+_1_z$/, "tiền tố phải được làm sạch: " + dirty);
});

test("dedupeHistoryIds: lịch sử cũ trùng id → giữ mục mới nhất, KHÔNG mất mục", () => {
  const old = [
    { id: "dubbing_active", stage: "Hoàn tất tạo giọng đọc TTS", completedAt: 100 },
    { id: "dubbing_active", stage: "Hoàn tất toàn trình lồng tiếng", completedAt: 300 },
    { id: "dubbing_active", stage: "Đã bóc tách & phân vai xong", completedAt: 200 },
  ];
  const out = dedupeHistoryIds(old);
  assert.equal(out.length, 3, "không được mất mục nào");
  assert.equal(new Set(out.map((i) => i.id)).size, 3, "id sau khử trùng phải duy nhất");
  // Mục MỚI NHẤT (completedAt lớn nhất) giữ nguyên id.
  const keeper = out.find((i) => i.stage === "Hoàn tất toàn trình lồng tiếng");
  assert.equal(keeper?.id, "dubbing_active");
  // 2 mục cũ được gắn hậu tố.
  const suffixed = out.filter((i) => i.id !== "dubbing_active").map((i) => i.id).sort();
  assert.deepEqual(suffixed, ["dubbing_active_2", "dubbing_active_3"]);
  // Nội dung mục cũ vẫn còn nguyên.
  assert.ok(out.some((i) => i.stage === "Hoàn tất tạo giọng đọc TTS"));
});

test("dedupeHistoryIds: không trùng id thì giữ nguyên, không thêm hậu tố", () => {
  const items = [
    { id: "a_1", stage: "x" },
    { id: "a_2", stage: "y" },
  ];
  const out = dedupeHistoryIds(items);
  assert.deepEqual(out.map((i) => i.id), ["a_1", "a_2"]);
});

test("upsertHistoryItem: 1 lần chạy = 1 mục (cùng id bị THAY, không thêm mục)", () => {
  const first = { id: "dubbing_1_aaa", stage: "Đang chạy", percent: 10 };
  const mid = { id: "dubbing_1_aaa", stage: "Đang dịch", percent: 60 };
  const done = { id: "dubbing_1_aaa", stage: "Hoàn tất", percent: 100, completedAt: 5 };
  let history = upsertHistoryItem([], first);
  assert.equal(history.length, 1);
  history = upsertHistoryItem(history, mid);
  assert.equal(history.length, 1, "cập nhật tiến độ KHÔNG sinh mục mới");
  assert.equal(history[0].stage, "Đang dịch");
  history = upsertHistoryItem(history, done);
  assert.equal(history.length, 1);
  assert.equal(history[0].stage, "Hoàn tất");
  assert.equal(history[0].percent, 100);
});

test("upsertHistoryItem: mục khác id vẫn được giữ đầy đủ", () => {
  const a = { id: "run_a", stage: "A" };
  const b = { id: "run_b", stage: "B" };
  const history = upsertHistoryItem(upsertHistoryItem([], a), b);
  assert.equal(history.length, 2);
  assert.equal(history[0].id, "run_b", "mục mới nhất lên đầu");
  assert.equal(new Set(history.map((i) => i.id)).size, 2);
});

test("upsertHistoryItem: giới hạn số mục lịch sử", () => {
  let history: { id: string; stage: string }[] = [];
  for (let i = 0; i < 60; i++) {
    history = upsertHistoryItem(history, { id: `run_${i}`, stage: `s${i}` }, 50);
  }
  assert.equal(history.length, 50, "lịch sử không được vượt quá giới hạn");
  assert.equal(history[0].id, "run_59");
});
