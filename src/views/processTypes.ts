//! TSK-UI-REDESIGN-R2-7C — kiểu dữ liệu dùng chung cho tab **Tiến trình**.
//!
//! Trước đây các kiểu này nằm trong `ProcessCenterModal.tsx` (modal bị bỏ theo
//! TL-14 — chỉ còn **1 giao diện duy nhất** là tab Tiến trình). Tách ra file
//! riêng để `ProcessCenterView.tsx` không phụ thuộc vào một modal đã xoá.

/** Một bước trong pipeline của một tác vụ. */
export interface TaskStepItem {
  id: string;
  label: string;
  status: "done" | "running" | "pending";
}

/** Một tác vụ nền (tiến trình) của Sublix. */
export interface AppTaskItem {
  id: string;
  type: "file_sub" | "dubbing" | "downloader" | "model" | "live" | "subtitle";
  title: string;
  stage: string;
  percent: number;
  status: "running" | "completed" | "error" | "paused";
  detail?: string;
  speed?: string;
  eta?: string;
  startedAt: number;
  completedAt?: number;
  targetTab: "downloader" | "file_sub" | "dubbing" | "live" | "models" | "studio";
  outputPath?: string;
  error?: string;
  // Metadata mở rộng đồng bộ giữa Studio & Process Center
  fileName?: string;
  workflowType?: "subtitle_only" | "subtitle_translate" | "dubbing" | "voice_only" | "downloader" | "model";
  workflowLabel?: string;
  steps?: TaskStepItem[];
  currentStep?: string;
  totalItems?: number;
  currentItem?: number;
  /**
   * TSK-TABS-P3-PROCESS-REOPEN: id tab Studio **đã chạy** tác vụ này.
   * Có giá trị ⇒ "Mở lại trong Studio" mở đúng tab đó (Studio nhiều tab).
   * Thiếu ⇒ hành vi cũ (chỉ chuyển sang tab Studio).
   */
  tabId?: string;
  /**
   * TSK-TABS-P3-PROCESS-REOPEN: đường dẫn **video gốc** của dự án.
   * Dùng khi tab Studio của tác vụ không còn mở → mở lại dự án từ file này.
   * Thiếu ⇒ hành vi cũ (chỉ chuyển sang tab Studio).
   */
  sourcePath?: string;
}

/** Dữ liệu tối thiểu để quyết định cách "Mở lại trong Studio". */
export type StudioReopenTask = Pick<AppTaskItem, "tabId" | "sourcePath" | "outputPath">;

/**
 * TSK-TABS-P3-PROCESS-REOPEN: kết quả chọn hành động cho nút
 * "🚀 Mở lại trong Studio".
 *
 * - `open-tab`: tab Studio của tác vụ vẫn còn → kích hoạt đúng tab.
 * - `open-project`: chỉ biết video gốc → mở dự án mới từ đường dẫn này.
 * - `navigate-studio`: không có thông tin dự án → giữ hành vi cũ (chuyển tab).
 */
export type StudioReopenTarget =
  | { kind: "open-tab"; tabId: string; sourcePath?: string; outputPath?: string }
  | { kind: "open-project"; sourcePath: string; outputPath?: string }
  | { kind: "navigate-studio" };

/**
 * Hàm **thuần** chọn hành động khi bấm "🚀 Mở lại trong Studio".
 *
 * Ưu tiên `tabId` (đúng tab đã chạy), sau đó `sourcePath` (mở lại dự án),
 * cuối cùng là chuyển sang tab Studio như trước đây.
 */
export function resolveStudioReopen(task: StudioReopenTask): StudioReopenTarget {
  const tabId = task.tabId?.trim();
  const sourcePath = task.sourcePath?.trim();
  const outputPath = task.outputPath?.trim();

  if (tabId) {
    return {
      kind: "open-tab",
      tabId,
      ...(sourcePath ? { sourcePath } : {}),
      ...(outputPath ? { outputPath } : {}),
    };
  }
  if (sourcePath) {
    return {
      kind: "open-project",
      sourcePath,
      ...(outputPath ? { outputPath } : {}),
    };
  }
  return { kind: "navigate-studio" };
}
