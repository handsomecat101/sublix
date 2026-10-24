/**
 * autoFollow.ts — Tự cuộn timeline theo playhead (kiểu Premiere "page scroll").
 *
 * Module THUẦN TS: không import React, không import DOM, không import file nào
 * khác trong `src/lib/timeline/`. Hàm chỉ TÍNH giá trị `scrollLeft` mới —
 * việc gán vào DOM thuộc về tầng UI (xem `docs/TIMELINE_INTEGRATION_PLAN.md`).
 *
 * Vì sao tách riêng? Vòng lặp `tick()` của timeline chạy mỗi frame (~60fps).
 * Mọi tính toán trong đó phải là hàm thuần để (1) kiểm thử được bằng
 * `node --test` không cần DOM, (2) không gây re-render React.
 *
 * Node chạy .ts bằng type-stripping nên file này CẤM: `enum`, `namespace`,
 * parameter properties, decorator. Dùng union string + object const.
 */

/** Chế độ cuộn. */
export type FollowMode = "page" | "smooth";

/** Đầu vào của phép tính cuộn. */
export interface FollowInput {
  /** Vị trí playhead trong timeline (pixel, cùng hệ toạ độ với `scrollLeft`). */
  playheadPx: number;
  /** Vị trí cuộn hiện tại (pixel). */
  scrollLeft: number;
  /** Bề rộng vùng nhìn (pixel). */
  viewportWidth: number;
  /** Chế độ cuộn. */
  mode: FollowMode;
}

/**
 * Ngưỡng kích hoạt lật trang: khi kim playhead vượt quá 90% bề rộng viewport
 * thì lật trang (giống Premiere).
 */
export const PAGE_SCROLL_TRIGGER_RATIO = 0.9;

/**
 * Khi cuộn mượt, playhead được đặt ở giữa viewport.
 */
export const SMOOTH_CENTER_RATIO = 0.5;

/**
 * Tính `scrollLeft` mới để giữ playhead trong khung nhìn.
 *
 * Quy tắc:
 * - `viewportWidth <= 0` → `null` (không cuộn).
 * - Playhead lọt ra khỏi mép TRÁI (`playheadPx < scrollLeft`) → cuộn về để
 *   playhead nằm sát mép trái.
 * - Chế độ `"page"` (Premiere): khi playhead vượt 90% bề rộng viewport thì lật
 *   trang, đặt playhead đúng ở vị trí 90%.
 * - Chế độ `"smooth"`: khi playhead vượt hẳn mép phải thì cuộn để đặt playhead
 *   ở giữa viewport.
 * - Trong mọi trường hợp khác → `null` (KHÔNG đổi).
 *
 * @param input Đầu vào.
 * @returns Giá trị `scrollLeft` mới, hoặc `null` nếu không cần cuộn.
 */
export function computeFollowScroll(input: FollowInput): number | null {
  const { playheadPx, scrollLeft, viewportWidth, mode } = input;

  if (!Number.isFinite(playheadPx) || !Number.isFinite(scrollLeft)) return null;
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;

  const current = Math.max(0, scrollLeft);

  // Playhead đã bị cuộn qua mất (nằm bên trái vùng nhìn) → kéo lại.
  if (playheadPx < current) {
    return Math.max(0, playheadPx);
  }

  if (mode === "page") {
    const trigger = current + PAGE_SCROLL_TRIGGER_RATIO * viewportWidth;
    if (playheadPx > trigger) {
      return Math.max(0, playheadPx - PAGE_SCROLL_TRIGGER_RATIO * viewportWidth);
    }
    return null;
  }

  // mode === "smooth"
  const trigger = current + viewportWidth;
  if (playheadPx > trigger) {
    return Math.max(0, playheadPx - SMOOTH_CENTER_RATIO * viewportWidth);
  }
  return null;
}
