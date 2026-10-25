/**
 * history — lịch sử Undo/Redo dạng past/future (module THUẦN TS, không React).
 *
 * Nguyên lý (giống Premiere):
 * - `past` lưu các TRẠNG THÁI TRƯỚC khi thay đổi.
 * - `future` lưu các trạng thái đã bị undo (để làm lại).
 * - Thao tác MỚI (push) → xoá sạch `future` (không thể redo sau khi sửa).
 * - `undo` → lấy phần tử cuối của `past` làm trạng thái mới, đẩy trạng thái
 *   HIỆN TẠI vào `future`.
 * - `redo` → lấy phần tử cuối của `future` làm trạng thái mới, đẩy trạng thái
 *   HIỆN TẠI vào `past`.
 *
 * Giới hạn: 20 bước (khớp stack cũ `slice(-19)` + phần tử hiện tại).
 */

/** Lịch sử undo/redo. */
export interface History<T> {
  /** Các trạng thái trước (mới nhất ở cuối). */
  past: T[];
  /** Các trạng thái đã undo (mới nhất ở cuối). */
  future: T[];
}

/** Số bước tối đa giữ lại. */
export const HISTORY_LIMIT = 20;

/** Tạo lịch sử rỗng. */
export function createHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/**
 * Ghi một trạng thái "trước khi sửa" vào lịch sử.
 * Mọi thao tác mới đều XOÁ `future` (không redo được sau khi sửa tiếp).
 *
 * @param history Lịch sử hiện tại.
 * @param snapshot Trạng thái TRƯỚC khi thay đổi.
 */
export function pushHistory<T>(history: History<T>, snapshot: T): History<T> {
  const past = [...history.past, snapshot];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  };
}

/** Kết quả của undo/redo: lịch sử mới + snapshot cần áp dụng (null = không có gì để làm). */
export interface HistoryStep<T> {
  history: History<T>;
  snapshot: T | null;
}

/**
 * Hoàn tác 1 bước.
 *
 * @param history Lịch sử hiện tại.
 * @param current Trạng thái hiện tại (sẽ bị đẩy vào `future`).
 */
export function undoHistory<T>(history: History<T>, current: T): HistoryStep<T> {
  if (history.past.length === 0) return { history, snapshot: null };
  const snapshot = history.past[history.past.length - 1];
  const past = history.past.slice(0, -1);
  const future = [...history.future, current];
  return {
    history: {
      past,
      future: future.length > HISTORY_LIMIT ? future.slice(future.length - HISTORY_LIMIT) : future,
    },
    snapshot,
  };
}

/**
 * Làm lại 1 bước.
 *
 * @param history Lịch sử hiện tại.
 * @param current Trạng thái hiện tại (sẽ bị đẩy vào `past`).
 */
export function redoHistory<T>(history: History<T>, current: T): HistoryStep<T> {
  if (history.future.length === 0) return { history, snapshot: null };
  const snapshot = history.future[history.future.length - 1];
  const future = history.future.slice(0, -1);
  const past = [...history.past, current];
  return {
    history: {
      past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
      future,
    },
    snapshot,
  };
}

/** Còn bước để undo không. */
export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

/** Còn bước để redo không. */
export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}
