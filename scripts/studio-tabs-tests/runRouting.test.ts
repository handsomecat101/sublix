//! TSK-TABS-P2 — định tuyến `run_id` + kịch bản nhiều tab trên hàng đợi.
//! Chạy: node --test scripts/studio-tabs-tests/runRouting.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { createJobQueue, JobCancelledError, type JobSnapshot } from "../../src/lib/studio/jobQueue.ts";
import { isForeignRun, resolveProgressTaskKey } from "../../src/lib/studio/runRouting.ts";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((r) => setImmediate(r));
}

test("isForeignRun: khác run_id ⇒ bỏ; thiếu run_id ⇒ hành vi cũ (nhận)", () => {
  assert.equal(isForeignRun("a", "b"), true);
  assert.equal(isForeignRun("a", "a"), false);
  assert.equal(isForeignRun(undefined, "a"), false);
  assert.equal(isForeignRun("a", undefined), false);
  assert.equal(isForeignRun(undefined, undefined), false);
});

test("resolveProgressTaskKey: có run_id ⇒ tác vụ đã đăng ký, chưa đăng ký ⇒ chính run_id", () => {
  const map = new Map([["run1", "task_A"]]);
  assert.deepEqual(resolveProgressTaskKey("run1", map, "task_B"), { taskId: "task_A", keyedByRun: true });
  assert.deepEqual(resolveProgressTaskKey("run2", map, "task_B"), { taskId: "run2", keyedByRun: true });
});

test("resolveProgressTaskKey: thiếu run_id ⇒ lượt hiện tại (hành vi cũ)", () => {
  assert.deepEqual(resolveProgressTaskKey(undefined, new Map(), "task_B"), { taskId: "task_B", keyedByRun: false });
  assert.deepEqual(resolveProgressTaskKey(undefined, new Map(), null), { taskId: null, keyedByRun: false });
});

test("Tab A phân tích → tab B xuất ⇒ B chờ #1, A không bị huỷ", async () => {
  const cancelled: string[] = [];
  const q = createJobQueue({ onCancelRunning: (job: JobSnapshot) => void cancelled.push(job.runId) });
  const a = deferred();
  const bRan: string[] = [];
  q.enqueue({ tabId: "A", runId: "rA", kind: "analyze", run: () => a.promise });
  const b = q.enqueue({
    tabId: "B",
    runId: "rB",
    kind: "export",
    run: async () => void bRan.push("B"),
  });
  await flush();
  assert.equal(b.position, 1);
  const snap = q.getState();
  assert.equal(snap.running?.tabId, "A");
  assert.equal(snap.queued[0]?.tabId, "B");
  assert.equal(snap.queued[0]?.position, 1);
  assert.deepEqual(bRan, []);
  assert.deepEqual(cancelled, []);
  a.resolve();
  await b.done;
  assert.deepEqual(bRan, ["B"]);
});

test("Dừng job đang CHỜ: bỏ khỏi hàng, không gọi huỷ backend, không giết job đang chạy", async () => {
  const cancelled: string[] = [];
  const q = createJobQueue({ onCancelRunning: (job: JobSnapshot) => void cancelled.push(job.runId) });
  const a = deferred();
  const aJob = q.enqueue({ tabId: "A", runId: "rA", kind: "analyze", run: () => a.promise });
  const b = q.enqueue({ tabId: "B", runId: "rB", kind: "export", run: async () => undefined });
  await flush();
  assert.equal(q.cancel("rB"), true);
  await assert.rejects(b.done, JobCancelledError);
  assert.deepEqual(cancelled, []);
  assert.equal(q.getState().running?.runId, "rA");
  a.resolve();
  await aJob.done;
});

test("Dừng job đang CHẠY: gọi huỷ backend đúng 1 lần, slot giữ tới khi dừng thật", async () => {
  const cancelled: string[] = [];
  const q = createJobQueue({ onCancelRunning: (job: JobSnapshot) => void cancelled.push(job.runId) });
  const a = deferred();
  const aJob = q.enqueue({ tabId: "A", runId: "rA", kind: "analyze", run: () => a.promise });
  const bRan: string[] = [];
  const b = q.enqueue({ tabId: "B", runId: "rB", kind: "export", run: async () => void bRan.push("B") });
  await flush();
  q.cancel("rA");
  q.cancel("rA");
  await assert.rejects(aJob.done, JobCancelledError);
  assert.deepEqual(cancelled, ["rA"]);
  await flush();
  assert.deepEqual(bRan, []); // A chưa dừng thật ⇒ B chưa chen vào
  a.resolve();
  await b.done;
  assert.deepEqual(bRan, ["B"]);
});

test("Chuỗi analysis → TTS (1 job) giữ slot liền mạch, tab khác không chen giữa", async () => {
  const order: string[] = [];
  const q = createJobQueue();
  const gap = deferred();
  const chain = q.enqueue({
    tabId: "A",
    runId: "rA",
    kind: "analyze",
    run: async () => {
      order.push("A:analyze");
      await gap.promise; // khoảng nghỉ giữa 2 bước (setTimeout 350 ms ngoài đời)
      order.push("A:voice");
    },
  });
  const other = q.enqueue({ tabId: "B", runId: "rB", kind: "export", run: async () => void order.push("B:export") });
  await flush();
  gap.resolve();
  await Promise.all([chain.done, other.done]);
  assert.deepEqual(order, ["A:analyze", "A:voice", "B:export"]);
});

test("Mọi đường thoát nhả slot: lỗi / huỷ lúc chờ / xong ⇒ job sau vẫn chạy (BUG-081)", async () => {
  const q = createJobQueue();
  const ran: string[] = [];
  const bad = q.enqueue({ tabId: "A", runId: "r1", kind: "stt", run: async () => Promise.reject(new Error("boom")) });
  const dropped = q.enqueue({ tabId: "B", runId: "r2", kind: "stt", run: async () => void ran.push("r2") });
  const ok = q.enqueue({ tabId: "C", runId: "r3", kind: "stt", run: async () => void ran.push("r3") });
  q.cancel("r2");
  await assert.rejects(bad.done, /boom/);
  await assert.rejects(dropped.done, JobCancelledError);
  await ok.done;
  assert.deepEqual(ran, ["r3"]);
  assert.equal(q.getState().running, null);
  assert.equal(q.getState().queuedCount, 0);
});

test("Huỷ theo tabId (Dừng & đóng tab): chỉ job của tab đó", async () => {
  const cancelled: string[] = [];
  const q = createJobQueue({ onCancelRunning: (job: JobSnapshot) => void cancelled.push(job.runId) });
  const a = deferred();
  const aJob = q.enqueue({ tabId: "A", runId: "rA", kind: "analyze", run: () => a.promise });
  const b1 = q.enqueue({ tabId: "B", runId: "rB1", kind: "export", run: async () => undefined });
  const c = q.enqueue({ tabId: "C", runId: "rC", kind: "voice", run: async () => undefined });
  await flush();
  const snap = q.getState();
  for (const job of [...snap.queued, ...(snap.running ? [snap.running] : [])]) {
    if (job.tabId === "B") q.cancel(job.runId);
  }
  await assert.rejects(b1.done, JobCancelledError);
  assert.deepEqual(cancelled, []);
  a.resolve();
  await aJob.done;
  await c.done;
});
