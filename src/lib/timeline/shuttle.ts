/**
 * shuttle.ts — Máy trạng thái phím J/K/L kiểu Premiere cho timeline Sublix.
 *
 * Module THUẦN TS: không import React, không import DOM, không import file nào
 * khác trong `src/lib/timeline/`.
 *
 * Hành vi (giống Premiere Pro):
 * - Nhấn `L` lần 1 → tua tiến 1x; nhấn `L` tiếp → 2x → 4x → 8x (dừng ở 8x).
 * - Nhấn `J` lần 1 → tua lùi 1x; nhấn `J` tiếp → 2x → 4x → 8x.
 * - Nhấn `K` → dừng (trả về tốc độ 1x, hướng "none").
 * - Giữ `K` rồi nhấn `J` / `L` → nhích đúng 1 frame lùi / tiến.
 *
 * VẤN ĐỀ KỸ THUẬT: thẻ `<video>` của HTML **không phát được ngược**.
 * Vì vậy module này không gọi DOM mà trả về "bước seek" để UI tự mô phỏng:
 * mỗi tick, UI lấy `computeShuttleSeek()` rồi set `video.currentTime`.
 *
 * Node chạy .ts bằng type-stripping nên file này CẤM: `enum`, `namespace`,
 * parameter properties, decorator. Dùng union string + object const.
 */

/** Hướng tua. "none" = đang dừng. */
export type ShuttleDirection = "forward" | "reverse" | "none";

/** Hành động mà UI phải thực hiện sau khi bấm phím. */
export type ShuttleAction = "none" | "play" | "stop" | "step-forward" | "step-back";

/** Trạng thái shuttle hiện tại. */
export interface ShuttleState {
  /** Tốc độ xung (1, 2, 4 hoặc 8). */
  rate: number;
  /** Hướng tua. */
  direction: ShuttleDirection;
  /** Hành động cần thực hiện ở lần bấm phím vừa rồi. */
  action: ShuttleAction;
}

/** Các bậc tốc độ hợp lệ (tăng dần). Bấm L/J lặp lại sẽ đi qua hết các bậc này. */
export const SHUTTLE_RATES: readonly number[] = [1, 2, 4, 8];

/** Bậc tốc độ tối đa (8x) — nhấn L/J thêm không tăng nữa. */
export const MAX_SHUTTLE_RATE = 8;

/** Tốc độ bình thường. */
export const NORMAL_RATE = 1;

/** Phím shuttle hợp lệ. */
export type ShuttleKey = "j" | "k" | "l";

/** Tuỳ chọn cho `applyShuttleKey()`. */
export interface ShuttleKeyOptions {
  /** `true` khi người dùng đang GIỮ phím K (dùng cho nhích 1 frame). */
  kHeld?: boolean;
}

/**
 * Tạo trạng thái ban đầu: đang dừng, tốc độ 1x, không hành động.
 */
export function createShuttleState(): ShuttleState {
  return { rate: NORMAL_RATE, direction: "none", action: "none" };
}

/**
 * Tăng bậc tốc độ lên mức kế tiếp trong `SHUTTLE_RATES`.
 * Đã ở mức cao nhất thì giữ nguyên (8x → 8x).
 *
 * @param rate Bậc hiện tại.
 */
export function escalateRate(rate: number): number {
  for (let i = 0; i < SHUTTLE_RATES.length; i += 1) {
    if (SHUTTLE_RATES[i] > rate) return SHUTTLE_RATES[i];
  }
  return Math.min(Math.max(rate, NORMAL_RATE), MAX_SHUTTLE_RATE);
}

/**
 * Áp dụng một phím shuttle và trả về trạng thái MỚI (hàm thuần, không mutate).
 *
 * @param state   Trạng thái hiện tại.
 * @param key     Phím vừa bấm ("j" | "k" | "l").
 * @param options Tuỳ chọn, hiện chỉ có `kHeld`.
 */
export function applyShuttleKey(
  state: ShuttleState,
  key: ShuttleKey,
  options: ShuttleKeyOptions = {},
): ShuttleState {
  const kHeld = options.kHeld === true;

  // Giữ K rồi bấm J/L → nhích 1 frame (không tua, không đổi hướng).
  if (kHeld && key === "j") {
    return { rate: NORMAL_RATE, direction: "none", action: "step-back" };
  }
  if (kHeld && key === "l") {
    return { rate: NORMAL_RATE, direction: "none", action: "step-forward" };
  }

  if (key === "k") {
    return { rate: NORMAL_RATE, direction: "none", action: "stop" };
  }

  if (key === "l") {
    // Đang tua tiến → tăng bậc. Ngược lại → bắt đầu tua tiến ở 1x.
    if (state.direction === "forward") {
      return { rate: escalateRate(state.rate), direction: "forward", action: "play" };
    }
    return { rate: NORMAL_RATE, direction: "forward", action: "play" };
  }

  // key === "j"
  if (state.direction === "reverse") {
    return { rate: escalateRate(state.rate), direction: "reverse", action: "play" };
  }
  return { rate: NORMAL_RATE, direction: "reverse", action: "play" };
}

/**
 * Tính vị trí tua mới cho lần tick tiếp theo.
 *
 * - Hướng "forward": trả `null` — để `<video>` phát tiến tự nhiên với
 *   `playbackRate = state.rate`.
 * - Hướng "reverse": HTML không phát ngược được nên UI phải tự seek lùi.
 *   Trả về mốc thời gian MỚI (giây), đã chặn ở 0.
 * - Hướng "none": trả `null` (không tua).
 *
 * @param state       Trạng thái shuttle.
 * @param currentTime Mốc hiện tại (giây).
 * @param dtMs        Thời gian đã trôi qua kể từ tick trước (mili-giây).
 */
export function computeShuttleSeek(
  state: ShuttleState,
  currentTime: number,
  dtMs: number,
): number | null {
  if (state.direction !== "reverse") return null;
  if (!Number.isFinite(dtMs) || dtMs <= 0) return null;
  const base = Number.isFinite(currentTime) ? currentTime : 0;
  const delta = state.rate * (dtMs / 1000);
  return Math.max(0, base - delta);
}

/**
 * Tốc độ phát nên gán cho `video.playbackRate`.
 * Chỉ hướng "forward" mới tua nhanh; ngược lại giữ 1x (video không phát ngược được).
 *
 * @param state Trạng thái shuttle.
 */
export function shuttlePlaybackRate(state: ShuttleState): number {
  if (state.direction === "forward") {
    return Math.min(Math.max(state.rate, NORMAL_RATE), MAX_SHUTTLE_RATE);
  }
  return NORMAL_RATE;
}

/**
 * Shuttle đang hoạt động (đang tua) hay không.
 *
 * @param state Trạng thái shuttle.
 */
export function isShuttleActive(state: ShuttleState): boolean {
  return state.direction !== "none";
}

/**
 * Độ dài 1 frame (giây) — dùng cho hành động "step-forward" / "step-back".
 *
 * @param fps Số frame/giây (mặc định 25).
 */
export function frameStepSeconds(fps: number = 25): number {
  const effectiveFps = Number.isFinite(fps) && fps > 0 ? fps : 25;
  return 1 / effectiveFps;
}
