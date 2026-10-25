//! TSK-TABS-P2 — test logic thuần của hàng đợi việc nặng (tab Studio).
//! Chạy: node --test scripts/studio-tabs-tests/jobQueue.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  createJobQueue,
  JobCancelledError,
  type JobQueue,
  type QueueSnapshot,
} from "../../src/lib/studio/jobQueue.ts";

/** Promise có thể điều khiển khi nào resolve/reject. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Đợi mọi microtask đã xếp chạy (job bắt đầu / settle / job kế tiếp). */
async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

/** Ghi lại mọi trạng thái của 1 runId để kiểm tra "không đánh dấu done". */
function watchStatus(queue: JobQueue, runId: string): string[] {
  const seen: string[] = [];
  queue.subscribe((s: QueueSnapshot) => {
    const job = s.running?.runId === runId ? s.running : s.queued.find((q) => q.runId === runId);
    if (job) seen.push(job.status);
  });
  return seen;
}

/* ------------------------------------------------------------------ */
/* 1. Chỉ 1 job chạy một lúc; FIFO                                     */
/* ------------------------------------------------------------------ */

test("jobQueue: chỉ 1 job chạy một lúc — job sau phải chờ", async () => {
  const queue = createJobQueue();
  const started: string[] = [];
  const d1 = deferred<string>();
  const d2 = deferred<string>();

  queue.enqueue({
    tabId: "t1",
    runId: "r1",
    kind: "analyze",
    run: async () => {
      started.push("r1");
      return d1.promise;
    },
  });
  queue.enqueue({
    tabId: "t2",
    runId: "r2",
    kind: "stt",
    run: async () => {
      started.push("r2");
      return d2.promise;
    },
  });
  queue.enqueue({
    tabId: "t3",
    runId: "r3",
    kind: "voice",
    run: async () => {
      started.push("r3");
      return "r3-done";
    },
  });

  await flush();
  assert.deepEqual(started, ["r1"], "chỉ job đầu tiên được chạy");
  const state = queue.getState();
  assert.equal(state.running?.runId, "r1");
  assert.equal(state.runningCount, 1);
  assert.equal(state.queuedCount, 2);
  assert.equal(state.queued[0]?.runId, "r2");
  assert.equal(state.queued[1]?.runId, "r3");
  assert.equal(state.queued[0]?.position, 1, "vị trí chờ = số job phía trước + 1");
  assert.equal(state.running?.position, 0);

  d1.resolve("v1");
  await flush();
  assert.deepEqual(started, ["r1", "r2"], "job đầu xong thì job kế tiếp chạy");

  d2.resolve("v2");
  await flush();
  assert.deepEqual(started, ["r1", "r2", "r3"], "thứ tự FIFO");
  assert.equal(queue.getState().running, null);
  assert.equal(queue.getState().queuedCount, 0);
});

/* ------------------------------------------------------------------ */
/* 2. Huỷ job queued ⇒ KHÔNG gọi huỷ backend, bỏ khỏi hàng             */
/* ------------------------------------------------------------------ */

test("jobQueue: huỷ job queued ⇒ KHÔNG gọi hàm huỷ backend, bỏ khỏi hàng", async () => {
  let cancelCalls = 0;
  const queue = createJobQueue({
    onCancelRunning: () => {
      cancelCalls += 1;
    },
  });
  const d = deferred<string>();
  queue.enqueue({ tabId: "t1", runId: "r1", kind: "analyze", run: async () => d.promise });
  const queued = queue.enqueue({ tabId: "t2", runId: "r2", kind: "stt", run: async () => "v2" });

  await flush();
  assert.equal(queue.getState().queuedCount, 1);

  assert.equal(queue.cancel("r2"), true, "huỷ được job queued");
  assert.equal(cancelCalls, 0, "job queued chưa chạy ⇒ KHÔNG huỷ backend");
  assert.equal(queue.getState().queuedCount, 0, "phải bỏ khỏi hàng");
  await assert.rejects(queued.done, (e) => e instanceof JobCancelledError);

  // Job r2 không bao giờ chạy.
  d.resolve("v1");
  await flush();
  assert.equal(queue.getState().running, null);
});

/* ------------------------------------------------------------------ */
/* 3. Huỷ job running ⇒ gọi hàm huỷ đúng 1 lần                         */
/* ------------------------------------------------------------------ */

test("jobQueue: huỷ job running ⇒ gọi hàm huỷ backend ĐÚNG 1 LẦN", async () => {
  const cancelled: string[] = [];
  const queue = createJobQueue({
    onCancelRunning: (job) => {
      cancelled.push(job.runId);
    },
  });
  const d = deferred<string>();
  const handle = queue.enqueue({
    tabId: "t1",
    runId: "r1",
    kind: "analyze",
    run: async () => d.promise,
  });

  await flush();
  assert.equal(queue.cancel("r1"), true);
  assert.equal(queue.cancel("r1"), false, "lần 2 không được huỷ lại (đã huỷ rồi)");
  assert.deepEqual(cancelled, ["r1"], "đúng 1 lần");
  await assert.rejects(handle.done, (e) => e instanceof JobCancelledError);
});

/* ------------------------------------------------------------------ */
/* 4. Job ném lỗi ⇒ hàng không kẹt, job sau vẫn chạy                  */
/* ------------------------------------------------------------------ */

test("jobQueue: job ném lỗi ⇒ hàng không kẹt, job sau vẫn chạy", async () => {
  const queue = createJobQueue();
  const started: string[] = [];
  const failed = queue.enqueue({
    tabId: "t1",
    runId: "r1",
    kind: "analyze",
    run: async () => {
      started.push("r1");
      throw new Error("hỏng rồi");
    },
  });
  const next = queue.enqueue({
    tabId: "t2",
    runId: "r2",
    kind: "stt",
    run: async () => {
      started.push("r2");
      return "ok";
    },
  });

  await assert.rejects(failed.done, /hỏng rồi/);
  await flush();
  assert.deepEqual(started, ["r1", "r2"], "job sau phải vẫn chạy");
  assert.equal(await next.done, "ok");
  assert.equal(queue.getState().running, null, "slot phải được nhả");
  assert.equal(queue.getState().queuedCount, 0);
});

/* ------------------------------------------------------------------ */
/* 5. Job trả về sau khi bị huỷ ⇒ KHÔNG đánh dấu done                  */
/* ------------------------------------------------------------------ */

test("jobQueue: job trả về SAU khi bị huỷ ⇒ không đánh dấu done", async () => {
  const queue = createJobQueue();
  const d = deferred<string>();
  const seen = watchStatus(queue, "r1");
  const handle = queue.enqueue({
    tabId: "t1",
    runId: "r1",
    kind: "analyze",
    run: async () => d.promise,
  });

  await flush();
  queue.cancel("r1");
  d.resolve("về sau khi huỷ");
  await flush();

  await assert.rejects(handle.done, (e) => e instanceof JobCancelledError);
  assert.ok(seen.includes("cancelled"), `phải thấy cancelled: ${seen.join(",")}`);
  assert.ok(!seen.includes("done"), `KHÔNG được đánh dấu done: ${seen.join(",")}`);
  assert.equal(queue.getState().running, null);
});

/* ------------------------------------------------------------------ */
/* 6. subscribe nhận thay đổi                                            */
/* ------------------------------------------------------------------ */

test("jobQueue: subscribe nhận mọi thay đổi + trả hàm huỷ đăng ký", async () => {
  const queue = createJobQueue();
  const snaps: QueueSnapshot[] = [];
  const unsubscribe = queue.subscribe((s) => snaps.push(s));
  assert.equal(snaps.length, 1, "đăng ký ⇒ nhận trạng thái hiện tại ngay");

  queue.enqueue({ tabId: "t1", runId: "r1", kind: "analyze", run: async () => "x" });
  await flush();
  assert.ok(snaps.length >= 3, `phải có thông báo (vào hàng / bắt đầu / xong): ${snaps.length}`);

  const countBefore = snaps.length;
  unsubscribe();
  queue.enqueue({ tabId: "t2", runId: "r2", kind: "stt", run: async () => "y" });
  await flush();
  assert.equal(snaps.length, countBefore, "sau khi huỷ đăng ký thì không nhận thông báo nữa");
});

/* ------------------------------------------------------------------ */
/* 7. Nhiều tab xen kẽ                                                  */
/* ------------------------------------------------------------------ */

test("jobQueue: nhiều tab xen kẽ ⇒ vẫn 1 job chạy + FIFO theo thứ tự vào", async () => {
  const queue = createJobQueue();
  const started: string[] = [];
  const gates = new Map<string, ReturnType<typeof deferred<string>>>();

  const add = (tabId: string, runId: string) => {
    const d = deferred<string>();
    gates.set(runId, d);
    queue.enqueue({
      tabId,
      runId,
      kind: "analyze",
      run: async () => {
        started.push(runId);
        return d.promise;
      },
    });
  };

  add("t1", "r1");
  add("t2", "r2");
  add("t1", "r3");
  add("t3", "r4");

  await flush();
  assert.deepEqual(started, ["r1"], "chỉ 1 job chạy dù có nhiều tab");
  assert.equal(queue.getState().runningCount, 1);
  assert.equal(queue.getState().queuedCount, 3);
  // Mỗi job giữ đúng tabId của nó.
  assert.equal(queue.getState().queued[0]?.tabId, "t2");
  assert.equal(queue.getState().queued[1]?.tabId, "t1");
  assert.equal(queue.getState().queued[2]?.tabId, "t3");

  for (const runId of ["r1", "r2", "r3", "r4"]) {
    gates.get(runId)!.resolve(runId);
    await flush();
  }
  assert.deepEqual(started, ["r1", "r2", "r3", "r4"], "FIFO xuyên nhiều tab");
});

/* ------------------------------------------------------------------ */
/* 8. Chain nhiều bước giữ MỘT slot liền mạch (BUG-081)                  */
/* ------------------------------------------------------------------ */

test("jobQueue: chain giữ MỘT slot liền mạch — job tab khác không chen vào giữa", async () => {
  const queue = createJobQueue();
  const order: string[] = [];
  const gate = deferred<string>();

  const chain = queue.enqueueChain({
    tabId: "t1",
    runId: "c1",
    kind: "voice",
    steps: [
      {
        name: "bóc tách",
        run: async () => {
          order.push("step1");
          return "a";
        },
      },
      {
        name: "lồng tiếng",
        run: async () => {
          order.push("step2");
          await gate.promise;
          return "b";
        },
      },
    ],
  });
  const other = queue.enqueue({
    tabId: "t2",
    runId: "r9",
    kind: "export",
    run: async () => {
      order.push("other");
      return "o";
    },
  });

  await flush();
  assert.deepEqual(order, ["step1", "step2"], "chain đang ở bước 2");
  assert.equal(queue.getState().running?.runId, "c1", "chain giữ slot");
  assert.equal(queue.getState().queuedCount, 1, "job tab khác phải chờ");

  gate.resolve("xong");
  await flush();
  const results = await chain.done;
  assert.deepEqual(results, ["a", "b"], "chain trả kết quả từng bước");
  await flush();
  assert.deepEqual(order, ["step1", "step2", "other"], "job khác chỉ chạy sau khi chain xong hẳn");
  assert.equal(await other.done, "o");
});

test("jobQueue: huỷ chain đang chạy ⇒ gọi huỷ backend 1 lần và DỪNG các bước sau", async () => {
  let cancelCalls = 0;
  const queue = createJobQueue({
    onCancelRunning: () => {
      cancelCalls += 1;
    },
  });
  const order: string[] = [];
  const gate = deferred<string>();

  const chain = queue.enqueueChain({
    tabId: "t1",
    runId: "c1",
    kind: "voice",
    steps: [
      { name: "bước 1", run: async () => { order.push("step1"); return "a"; } },
      { name: "bước 2", run: async () => { order.push("step2"); await gate.promise; return "b"; } },
      { name: "bước 3", run: async () => { order.push("step3"); return "c"; } },
    ],
  });

  await flush();
  assert.deepEqual(order, ["step1", "step2"]);
  assert.equal(queue.cancel("c1"), true);
  assert.equal(cancelCalls, 1, "đúng 1 lần");
  gate.resolve("x");
  await flush();
  await assert.rejects(chain.done, (e) => e instanceof JobCancelledError);
  assert.ok(!order.includes("step3"), "không được chạy bước sau khi huỷ");
});

/* ------------------------------------------------------------------ */
/* 9. Vặt vặn khác                                                      */
/* ------------------------------------------------------------------ */

test("jobQueue: huỷ job đã xong ⇒ trả false, không đổi trạng thái", async () => {
  const queue = createJobQueue();
  let cancelCalls = 0;
  const handle = queue.enqueue({
    tabId: "t1",
    runId: "r1",
    kind: "analyze",
    run: async () => "x",
  });
  await flush();
  assert.equal(await handle.done, "x");
  assert.equal(queue.cancel("r1"), false, "job đã xong ⇒ không huỷ được");
  assert.equal(cancelCalls, 0);
});

test("jobQueue: runId trùng ⇒ ném lỗi (bắt lỗi lập trình)", () => {
  const queue = createJobQueue();
  queue.enqueue({ tabId: "t1", runId: "r1", kind: "analyze", run: async () => "x" });
  assert.throws(
    () => queue.enqueue({ tabId: "t1", runId: "r1", kind: "stt", run: async () => "y" }),
    /đã tồn tại/,
  );
});

test("jobQueue: huỷ runId không có ⇒ trả false", () => {
  const queue = createJobQueue();
  assert.equal(queue.cancel("khong-ton-tai"), false);
});

test("jobQueue: enqueue trả position (0 = chạy ngay) và done resolve theo giá trị", async () => {
  const queue = createJobQueue();
  const first = queue.enqueue({ tabId: "t1", runId: "r1", kind: "analyze", run: async () => "v1" });
  const second = queue.enqueue({ tabId: "t2", runId: "r2", kind: "stt", run: async () => "v2" });
  assert.equal(first.position, 0, "hàng rảng ⇒ chạy ngay");
  assert.equal(second.position, 1, "có 1 job phía trước");
  assert.equal(await first.done, "v1");
  assert.equal(await second.done, "v2");
});
