//! Hàng đợi việc nặng cho tab Studio (TSK-TABS-P2) — module **thuần**, test được.
//!
//! Vì sao cần: mỗi lượt "bóc tách phụ đề → dịch → lồng tiếng → xuất video" chạy
//! nền, ăn CPU/GPU. Nếu 2 tab cùng chạy, chúng tranh cùng thiết bị và kết quả
//! của tab này có thể lẫn vào tab kia. ⇒ **toàn app chỉ chạy 1 job `running`
//! tại một thời điểm**, phần còn lại xếp hàng **FIFO**; UI hiện "Đang chờ #n".
//!
//! **Giữ slot cho chuỗi nhiều bước (BUG-081, §5 P2 của `docs/STUDIO_TABS_PLAN.md`):**
//! chuỗi `dubImmediately → handleRunVoiceOnly` phải giữ **một slot liền mạch** —
//! không nhả slot giữa 2 bước, tránh job của tab khác chen vào giữa. Ta hỗ trợ
//! **cả hai** cách:
//! 1. `enqueue({... run})` — slot được giữ **suốt vòng đời promise `run`**, nên
//!    app có thể tự gọi nhiều bước tuần tự **bên trong** `run` (đơn giản nhất,
//!    không cần API riêng).
//! 2. `enqueueChain({... steps})` — 1 **job** có N **bước**; slot vẫn giữ liền
//!    mạch qua cả chuỗi, đồng thời UI thấy được trạng thái từng bước.
//!
//! **Mọi đường thoát đều nhả slot** (nguyên nhân BUG-081: `isAnalyzing` kẹt vì
//! một nhánh `return` quên giải phóng cờ) ⇒ phần giải phóng nằm trong `finally`
//! của vòng chạy, không phụ thuộc nhánh nào.
//!
//! **Huỷ:** job `queued` ⇒ chỉ bỏ khỏi hàng, **không** gọi hàm huỷ backend (job
//! chưa chạy thì chưa có tiến trình backend để huỷ); job `running` ⇒ gọi hàm huỷ
//! backend **đúng 1 lần**. Hàm huỷ backend **không** import Tauri ở đây mà do
//! app truyền vào (`onCancelRunning` / `setCancelHandler`) ⇒ module giữ nguyên
//! tính thuần.
//!
//! Dùng: `node --test scripts/studio-tabs-tests/jobQueue.test.ts`

/** Trạng thái 1 job trong hàng đợi. */
export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

/**
 * Loại việc — nhãn tự do (chuỗi) để không khoá chặt API, nhưng có gợi ý cho
 * các giá trị thường dùng trong Studio.
 */
export type JobKind =
  | "analyze"
  | "stt"
  | "translate"
  | "voice"
  | "export"
  | (string & {});

/** Lỗi báo "job bị huỷ" (khác lỗi gốc của job). */
export class JobCancelledError extends Error {
  /** runId của job bị huỷ. */
  readonly runId: string;
  /** Cờ để lọc nhanh (`err instanceof JobCancelledError` hoặc `err.cancelled`). */
  readonly cancelled = true;

  constructor(runId: string) {
    super(`Job ${runId} đã bị huỷ`);
    this.name = "JobCancelledError";
    this.runId = runId;
  }
}

/** Ảnh chụp trạng thái 1 job — object bất biến (UI chỉ đọc). */
export interface JobSnapshot {
  /** Id lượt chạy (sinh ở app, dùng làm khoá tra cứu + lọc event backend). */
  runId: string;
  /** Id tab phát sinh việc (dùng để gắn chip trạng thái lên tab). */
  tabId: string;
  /** Loại việc. */
  kind: JobKind;
  /** Trạng thái hiện tại. */
  status: JobStatus;
  /** 0 = đang chạy; 1 = chờ đầu hàng; 2 = chờ thứ hai… */
  position: number;
  /** Thời điểm vào hàng (ms). */
  enqueuedAt: number;
  /** Thời điểm bắt đầu chạy (ms). */
  startedAt?: number;
  /** Thời điểm kết thúc (ms). */
  finishedAt?: number;
  /** Thông điệp lỗi (job `error`). */
  error?: string;
  /** Trạng thái từng bước (chỉ với chain). */
  steps?: { name: string; status: JobStatus }[];
}

/** Ảnh chụp toàn hàng đợi. */
export interface QueueSnapshot {
  /** Job đang giữ slot (null = rảnh). */
  running: JobSnapshot | null;
  /** Các job đang chờ, theo thứ tự FIFO. */
  queued: JobSnapshot[];
  /** Số job đang chạy (luôn 0 hoặc 1). */
  runningCount: number;
  /** Số job đang chờ. */
  queuedCount: number;
}

/** Tham số `enqueue` (1 job = 1 slot). */
export interface EnqueueOptions<T> {
  /** Tab phát sinh việc. */
  tabId: string;
  /** Id lượt chạy (duy nhất). */
  runId: string;
  /** Loại việc (để UI gắn nhãn). */
  kind: JobKind;
  /** Hàm thực thi — slot được giữ **suốt vòng đời promise này**. */
  run: () => Promise<T>;
}

/** Kết quả `enqueue`. */
export interface EnqueueHandle<T> {
  /**
   * Vị trí **lúc enqueue** (0 = chạy ngay, 1 = có 1 job phía trước).
   * Vị trí sống đổi theo hàng ⇒ UI đọc giá trị mới qua `getState()`/`subscribe()`.
   */
  position: number;
  /**
   * Giải quyết khi job xong. **Từ chối** với `JobCancelledError` khi bị huỷ,
   * hoặc với lỗi gốc khi job ném lỗi.
   * (Bộ đệm nội bộ đã gắn handler ⇒ không báo "unhandled rejection" nếu app
   * không await; app vẫn nên `.catch()` để hiện toast.)
   */
  done: Promise<T>;
  /** Huỷ job này (tương đương `cancel(runId)`). */
  cancel: () => boolean;
}

/** 1 bước của chuỗi (chain). */
export interface ChainStep {
  /** Tên bước (hiện cho UI). */
  name: string;
  /** Hàm thực bước. */
  run: () => Promise<unknown>;
}

/** Tham số `enqueueChain` — 1 job, N bước, giữ slot liền mạch. */
export interface EnqueueChainOptions {
  tabId: string;
  runId: string;
  kind: JobKind;
  steps: ChainStep[];
}

/** Tuỳ chọn khi tạo hàng đợi. */
export interface JobQueueOptions {
  /**
   * Gọi khi huỷ job **đang chạy** (vd `sublix.dubbingCancel`).
   * **Không** bao giờ được gọi cho job còn `queued`.
   */
  onCancelRunning?: (job: JobSnapshot) => void | Promise<void>;
  /** Nguồn thời gian (ms) — mặc định `Date.now` (test truyền hàm giả). */
  now?: () => number;
}

/** API của hàng đợi. */
export interface JobQueue {
  /** Thêm 1 job vào hàng (FIFO). */
  enqueue<T>(options: EnqueueOptions<T>): EnqueueHandle<T>;
  /** Thêm 1 job nhiều bước (giữ slot liền mạch qua cả chuỗi). */
  enqueueChain(options: EnqueueChainOptions): EnqueueHandle<unknown[]>;
  /** Huỷ job theo `runId`. Trả `false` nếu không tìm thấy hoặc job đã xong/lỗi. */
  cancel(runId: string): boolean;
  /** Đăng ký theo dõi thay đổi — trả hàm huỷ đăng ký. */
  subscribe(listener: (snapshot: QueueSnapshot) => void): () => void;
  /** Ảnh chụp trạng thái hiện tại. */
  getState(): QueueSnapshot;
  /** Đặt lại hàm huỷ backend (app gọi 1 lần khi khởi động). */
  setCancelHandler(fn?: (job: JobSnapshot) => void | Promise<void>): void;
}

/** Job nội bộ (mutable) — phần UI chỉ thấy `JobSnapshot`. */
interface InternalJob {
  runId: string;
  tabId: string;
  kind: JobKind;
  status: JobStatus;
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  steps?: { name: string; status: JobStatus }[];
  /** Hàm thực thi (chain đã gộp thành 1 hàm). */
  execute: () => Promise<unknown>;
  /** Giải quyết promise `done` (chỉ 1 lần). */
  resolve: (value: unknown) => void;
  /** Từ chối promise `done` (chỉ 1 lần). */
  reject: (reason: unknown) => void;
  /** Đã settle promise chưa. */
  settled: boolean;
  /** Đã yêu cầu huỷ (job đang chạy) — kết quả về sau sẽ bị BỎ. */
  cancelRequested: boolean;
}

/**
 * Tạo hàng đợi mới (mỗi lần gọi = 1 hàng đợi độc lập ⇒ test không dính nhau).
 *
 * @example
 * ```ts
 * const queue = createJobQueue({ onCancelRunning: (job) => sublix.dubbingCancel() });
 * const { done } = queue.enqueue({ tabId: "t1", runId: "r1", kind: "analyze", run: analyze });
 * ```
 */
export function createJobQueue(options: JobQueueOptions = {}): JobQueue {
  const now = options.now ?? (() => Date.now());
  let cancelHandler = options.onCancelRunning;

  /** Job đang chờ (FIFO). */
  const queue: InternalJob[] = [];
  /** Mọi job đang sống (chạy + chờ) — tra cứu theo runId để huỷ. */
  const jobs = new Map<string, InternalJob>();
  /** Job đang giữ slot. */
  let current: InternalJob | null = null;
  const listeners = new Set<(snapshot: QueueSnapshot) => void>();

  function positionOf(job: InternalJob): number {
    if (current === job) return 0;
    const idx = queue.indexOf(job);
    return idx < 0 ? 0 : idx + 1;
  }

  function snapshotOf(job: InternalJob): JobSnapshot {
    const snap: JobSnapshot = {
      runId: job.runId,
      tabId: job.tabId,
      kind: job.kind,
      status: job.status,
      position: positionOf(job),
      enqueuedAt: job.enqueuedAt,
    };
    if (job.startedAt !== undefined) snap.startedAt = job.startedAt;
    if (job.finishedAt !== undefined) snap.finishedAt = job.finishedAt;
    if (job.error !== undefined) snap.error = job.error;
    if (job.steps) {
      snap.steps = job.steps.map((s) => ({ name: s.name, status: s.status }));
    }
    return snap;
  }

  function getState(): QueueSnapshot {
    return {
      running: current ? snapshotOf(current) : null,
      queued: queue.map(snapshotOf),
      runningCount: current ? 1 : 0,
      queuedCount: queue.length,
    };
  }

  function notify(): void {
    const snap = getState();
    for (const listener of listeners) {
      try {
        listener(snap);
      } catch {
        // Listener lỗi KHÔNG được làm hỏng hàng đợi.
      }
    }
  }

  function settleSuccess(job: InternalJob, value: unknown): void {
    if (job.finishedAt === undefined) job.finishedAt = now();
    if (job.cancelRequested) {
      // Bị huỷ lúc đang chạy ⇒ kết quả về sau bị BỎ, KHÔNG đánh dấu done.
      job.status = "cancelled";
      job.reject(new JobCancelledError(job.runId));
      return;
    }
    job.status = "done";
    job.resolve(value);
  }

  function settleFailure(job: InternalJob, error: unknown): void {
    if (job.finishedAt === undefined) job.finishedAt = now();
    if (job.cancelRequested) {
      // Huỷ rồi mà run ném lỗi ⇒ vẫn là "cancelled", không phải "error".
      job.status = "cancelled";
      job.reject(new JobCancelledError(job.runId));
      return;
    }
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
    job.reject(error);
  }

  async function executeJob(job: InternalJob): Promise<void> {
    try {
      const value = await job.execute();
      settleSuccess(job, value);
    } catch (error) {
      settleFailure(job, error);
    } finally {
      // LUÔN nhả slot — kể cả khi lỗi/huỷ (BUG-081: một đường thoát quên
      // giải phóng cờ ⇒ hàng kẹt vĩnh viễn).
      if (current === job) current = null;
      jobs.delete(job.runId);
      notify();
      pump();
    }
  }

  function pump(): void {
    // Slot đang bị giữ ⇒ KHÔNG chen job khác vào giữa (giữ slot liền mạch).
    if (current) return;
    const next = queue.shift();
    if (!next) return;
    current = next;
    next.status = "running";
    next.startedAt = now();
    notify();
    void executeJob(next);
  }

  function createJob(base: {
    tabId: string;
    runId: string;
    kind: JobKind;
  }): { job: InternalJob; promise: Promise<unknown> } {
    let resolveFn!: (value: unknown) => void;
    let rejectFn!: (reason: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolveFn = res;
      rejectFn = rej;
    });
    // Gắn handler rỗng để không bị báo "unhandled rejection" khi app không await
    // (app vẫn nên .catch() để hiện toast).
    void promise.catch(() => {});
    const job: InternalJob = {
      ...base,
      status: "queued",
      enqueuedAt: now(),
      settled: false,
      cancelRequested: false,
      execute: async () => undefined,
      resolve: (value) => {
        if (job.settled) return;
        job.settled = true;
        resolveFn(value);
      },
      reject: (reason) => {
        if (job.settled) return;
        job.settled = true;
        rejectFn(reason);
      },
    };
    return { job, promise };
  }

  function enqueue<T>(opts: EnqueueOptions<T>): EnqueueHandle<T> {
    if (jobs.has(opts.runId)) {
      throw new Error(`runId đã tồn tại trong hàng đợi: ${opts.runId}`);
    }
    const { job, promise } = createJob(opts);
    job.execute = async () => opts.run();
    jobs.set(job.runId, job);
    queue.push(job);
    notify();
    pump();
    // Vị trí tính SAU khi đã lấy slot: 0 = đang chạy, 1 = chờ đầu hàng…
    const position = positionOf(job);
    return {
      position,
      done: promise as Promise<T>,
      cancel: () => cancel(opts.runId),
    };
  }

  function enqueueChain(opts: EnqueueChainOptions): EnqueueHandle<unknown[]> {
    if (jobs.has(opts.runId)) {
      throw new Error(`runId đã tồn tại trong hàng đợi: ${opts.runId}`);
    }
    if (opts.steps.length === 0) {
      throw new Error(`chain của ${opts.runId} không có bước nào`);
    }
    const { job, promise } = createJob(opts);
    job.steps = opts.steps.map((s) => ({ name: s.name, status: "queued" as JobStatus }));
    job.execute = async () => {
      const results: unknown[] = [];
      for (let i = 0; i < opts.steps.length; i++) {
        // Đã huỷ ⇒ dừng chuỗi (không chạy bước sau).
        if (job.cancelRequested) break;
        const step = job.steps![i]!;
        step.status = "running";
        notify();
        const value = await opts.steps[i]!.run();
        step.status = "done";
        notify();
        results.push(value);
      }
      return results;
    };
    jobs.set(job.runId, job);
    queue.push(job);
    notify();
    pump();
    const position = positionOf(job);
    return {
      position,
      done: promise as Promise<unknown[]>,
      cancel: () => cancel(opts.runId),
    };
  }

  function cancel(runId: string): boolean {
    const job = jobs.get(runId);
    if (!job) return false;

    if (job.status === "queued") {
      // Job CHƯA chạy ⇒ không có tiến trình backend để huỷ ⇒ KHÔNG gọi hàm huỷ.
      const idx = queue.indexOf(job);
      if (idx >= 0) queue.splice(idx, 1);
      job.status = "cancelled";
      job.finishedAt = now();
      job.reject(new JobCancelledError(runId));
      notify();
      return true;
    }

    if (job.status === "running") {
      if (job.cancelRequested) return false; // đã huỷ rồi ⇒ không gọi lần 2
      job.cancelRequested = true;
      job.status = "cancelled";
      job.finishedAt = now();
      // Gọi hàm huỷ backend ĐÚNG 1 LẦN (chỉ job đang chạy mới có tiến trình).
      try {
        const result = cancelHandler?.(snapshotOf(job));
        if (result && typeof (result as Promise<void>).catch === "function") {
          void (result as Promise<void>).catch(() => {});
        }
      } catch {
        // Hàm huỷ lỗi không được làm hỏng việc huỷ.
      }
      job.reject(new JobCancelledError(runId));
      notify();
      return true;
    }

    // done / error ⇒ không làm gì.
    return false;
  }

  return {
    enqueue,
    enqueueChain,
    cancel,
    subscribe(listener: (snapshot: QueueSnapshot) => void): () => void {
      listeners.add(listener);
      // Gửi trạng thái hiện tại ngay để UI không cần chờ thay đổi đầu tiên.
      listener(getState());
      return () => {
        listeners.delete(listener);
      };
    },
    getState,
    setCancelHandler(fn?: (job: JobSnapshot) => void | Promise<void>): void {
      cancelHandler = fn;
    },
  };
}

/**
 * Hàng đợi dùng chung của app (1 instance cho cả Studio).
 *
 * App gắn hàm huỷ backend 1 lần khi khởi động:
 * ```ts
 * jobQueue.setCancelHandler(() => sublix.dubbingCancel());
 * ```
 */
export const jobQueue: JobQueue = createJobQueue();
