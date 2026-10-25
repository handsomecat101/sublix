//! TSK-TABS-P2 — định tuyến sự kiện backend theo `run_id` (hàm thuần, test được).
//!
//! Backend echo `run_id` trong `dubbing:progress` / `translate:progress` /
//! `file_sub:progress`. Nhiều tab Studio cùng nghe ⇒ mỗi listener chỉ nhận sự kiện
//! của lượt mình. Thiếu `run_id` = hành vi cũ (tương thích ngược).

/** Sự kiện của lượt KHÁC (khác `run_id`) ⇒ `true` (listener phải bỏ qua). */
export function isForeignRun(payloadRunId: string | undefined, myRunId: string | undefined): boolean {
  return !!payloadRunId && !!myRunId && payloadRunId !== myRunId;
}

/**
 * Khoá tác vụ (tab Tiến trình) cho 1 sự kiện `dubbing:progress`.
 *
 * - Có `run_id` ⇒ tác vụ đã đăng ký cho lượt đó; chưa đăng ký (vd xuất video) ⇒
 *   dùng chính `run_id` làm id. KHÔNG dùng "lượt hiện tại" (có thể của tab khác).
 * - Thiếu `run_id` ⇒ lượt hiện tại, hoặc `null` (caller tự sinh id mới).
 */
export function resolveProgressTaskKey(
  payloadRunId: string | undefined,
  runToTask: ReadonlyMap<string, string>,
  currentTaskId: string | null,
): { taskId: string | null; keyedByRun: boolean } {
  if (payloadRunId) {
    return { taskId: runToTask.get(payloadRunId) || payloadRunId, keyedByRun: true };
  }
  return { taskId: currentTaskId, keyedByRun: false };
}
