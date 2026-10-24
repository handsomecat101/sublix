//! TSK-UI-REDESIGN-R2-7C — logic **thuần** cho tab Tiến trình (không React/Tauri).
//!
//! 3 việc được gom ra khỏi JSX để test được (`node --test`):
//! 1. Bộ lọc + đếm số tác vụ theo từng nhóm (UI_REDESIGN_PLAN §4.7).
//! 2. Nhãn hiển thị (nhãn **canonical** — không còn ký tự lạ như "Tải videoo").
//! 3. Nhận diện nhóm tác vụ (màu + nhãn badge) để View chỉ lo render.
//!
//! Lưu ý: mọi nhãn ở đây là **hằng số** → không thể bị dính ký tự lạ do gõ
//! tay (bug cũ: "Đang xử lýo", "Tải videoo" — xem UI_REDESIGN_PLAN §2.4).

import type { AppTaskItem } from "./processTypes";

/** Id của một bộ lọc tác vụ. */
export type ProcessFilter =
  | "all"
  | "active"
  | "subtitle"
  | "dubbing"
  | "downloader"
  | "model";

/** Định nghĩa 1 chip lọc (nhãn canonical + icon + tooltip). */
export interface ProcessFilterDef {
  id: ProcessFilter;
  /** Nhãn hiển thị — **hằng số**, không bao giờ có ký tự lạ. */
  label: string;
  /** Icon đi kèm nhãn. */
  icon: string;
  /** Tooltip giải thích. */
  title: string;
}

/**
 * 6 chip lọc ngang (thay 6 nút dọc cũ — UI_REDESIGN_PLAN §4.7).
 * Thứ tự = thứ tự hiển thị.
 */
export const PROCESS_FILTERS: readonly ProcessFilterDef[] = [
  { id: "all", label: "Tất cả", icon: "📋", title: "Tất cả tác vụ" },
  { id: "active", label: "Đang chạy", icon: "⚡", title: "Tác vụ đang xử lý" },
  { id: "subtitle", label: "Phụ đề & Dịch", icon: "💬", title: "Tạo phụ đề & dịch thuật" },
  { id: "dubbing", label: "Lồng tiếng", icon: "🎙️", title: "Lồng tiếng & phân vai" },
  { id: "downloader", label: "Tải video", icon: "⬇️", title: "Tải video" },
  { id: "model", label: "Mô hình", icon: "📦", title: "Tải mô hình AI" },
];

/** Nhóm tác vụ (dùng để chọn màu + icon). */
export type ProcessCategoryKey =
  | "subtitle"
  | "translate"
  | "voice"
  | "dubbing"
  | "downloader"
  | "model"
  | "general";

/** Metadata hiển thị của 1 nhóm tác vụ. */
export interface ProcessCategoryMeta {
  key: ProcessCategoryKey;
  label: string;
  color: string;
  badgeClass: string;
}

/** Ký tự điều khiển/zero-width cần loại khỏi nhãn do backend trả về. */
const INVISIBLE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g;

/**
 * Làm sạch nhãn do backend gửi lên: bỏ ký tự ẩn/điều khiển, gộp khoảng trắng
 * thừa, trim. **Không** đụng dấu tiếng Việt.
 */
export function sanitizeLabel(text: string | undefined | null): string {
  if (!text) return "";
  return text.replace(INVISIBLE_CHARS, "").replace(/\s+/g, " ").trim();
}

/**
 * Nhận diện nhóm tác vụ + nhãn hiển thị.
 *
 * Ưu tiên `workflowType` (nguồn sự thật từ Studio) → rồi mới tới `type`.
 */
export function processCategoryMeta(task: AppTaskItem): ProcessCategoryMeta {
  const workflowLabel = sanitizeLabel(task.workflowLabel);
  if (workflowLabel) {
    switch (task.workflowType) {
      case "subtitle_only":
        return { key: "subtitle", label: workflowLabel, color: "#38bdf8", badgeClass: "cat-sub" };
      case "subtitle_translate":
        return { key: "translate", label: workflowLabel, color: "#f59e0b", badgeClass: "cat-trans" };
      case "voice_only":
        return { key: "voice", label: workflowLabel, color: "#ec4899", badgeClass: "cat-tts" };
      case "dubbing":
        return { key: "dubbing", label: workflowLabel, color: "#a855f7", badgeClass: "cat-dub" };
      default:
        return { key: "general", label: workflowLabel, color: "#8b5cf6", badgeClass: "cat-general" };
    }
  }

  switch (task.type) {
    case "file_sub":
    case "subtitle":
      return { key: "subtitle", label: "Tạo Phụ Đề AI", color: "#38bdf8", badgeClass: "cat-sub" };
    case "dubbing":
      return { key: "dubbing", label: "Studio Lồng Tiếng AI", color: "#a855f7", badgeClass: "cat-dub" };
    case "downloader":
      return { key: "downloader", label: "Tải Video", color: "#3b82f6", badgeClass: "cat-dl" };
    case "model":
      return { key: "model", label: "Mô Hình AI", color: "#10b981", badgeClass: "cat-model" };
    default:
      return { key: "general", label: "Tác Vụ Sublix", color: "#94a3b8", badgeClass: "cat-general" };
  }
}

/** Tác vụ có khớp bộ lọc không? */
export function matchesProcessFilter(task: AppTaskItem, filter: ProcessFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return task.status === "running";
    case "subtitle":
      return (
        task.type === "file_sub" ||
        task.type === "subtitle" ||
        task.workflowType === "subtitle_only" ||
        task.workflowType === "subtitle_translate"
      );
    case "dubbing":
      return (
        task.type === "dubbing" ||
        task.workflowType === "dubbing" ||
        task.workflowType === "voice_only"
      );
    case "downloader":
      return task.type === "downloader";
    case "model":
      return task.type === "model";
    default:
      return true;
  }
}

/** Lọc một danh sách tác vụ theo bộ lọc. */
export function filterProcessTasks(
  tasks: readonly AppTaskItem[],
  filter: ProcessFilter,
): AppTaskItem[] {
  return tasks.filter((task) => matchesProcessFilter(task, filter));
}

/** Đếm số tác vụ theo từng nhóm (đang chạy + lịch sử gộp lại). */
export function countProcessFilter(
  activeTasks: readonly AppTaskItem[],
  historyTasks: readonly AppTaskItem[],
): Record<ProcessFilter, number> {
  const counts = {
    all: activeTasks.length + historyTasks.length,
    active: 0,
    subtitle: 0,
    dubbing: 0,
    downloader: 0,
    model: 0,
  } as Record<ProcessFilter, number>;

  for (const task of activeTasks) {
    if (task.status === "running") counts.active += 1;
    if (matchesProcessFilter(task, "subtitle")) counts.subtitle += 1;
    if (matchesProcessFilter(task, "dubbing")) counts.dubbing += 1;
    if (matchesProcessFilter(task, "downloader")) counts.downloader += 1;
    if (matchesProcessFilter(task, "model")) counts.model += 1;
  }
  for (const task of historyTasks) {
    if (matchesProcessFilter(task, "subtitle")) counts.subtitle += 1;
    if (matchesProcessFilter(task, "dubbing")) counts.dubbing += 1;
    if (matchesProcessFilter(task, "downloader")) counts.downloader += 1;
    if (matchesProcessFilter(task, "model")) counts.model += 1;
  }

  return counts;
}

/**
 * Tách danh sách hiển thị theo bộ lọc.
 *
 * - Bộ lọc "Đang chạy" → phần lịch sử **ẩn hoàn toàn** (không có "lịch sử" nào
 *   đang chạy).
 * - Các bộ lọc khác → lịch sử chỉ gồm tác vụ đã **hoàn tất/lỗi**, không gồm
 *   tác vụ đang chạy (đã nằm ở nhóm "đang chạy").
 */
export function splitProcessTasks(
  activeTasks: readonly AppTaskItem[],
  historyTasks: readonly AppTaskItem[],
  filter: ProcessFilter,
): { active: AppTaskItem[]; history: AppTaskItem[] } {
  if (filter === "active") {
    return { active: filterProcessTasks(activeTasks, "active"), history: [] };
  }
  return {
    active: filterProcessTasks(activeTasks, filter),
    history: filterProcessTasks(historyTasks, filter),
  };
}

/** Một lựa chọn cho `Segmented` (kèm số đếm trong nhãn). */
export interface ProcessFilterOption {
  value: ProcessFilter;
  label: string;
  title: string;
}

/**
 * Dựng danh sách lựa chọn cho `Segmented`: nhãn kèm số đếm trong ngoặc.
 *
 * Nhãn lấy từ `PROCESS_FILTERS` (hằng số) → **không bao giờ** dính ký tự lạ.
 */
export function buildFilterOptions(
  counts: Record<ProcessFilter, number>,
): ProcessFilterOption[] {
  return PROCESS_FILTERS.map((def) => ({
    value: def.id,
    label: `${def.icon} ${def.label} (${counts[def.id]})`,
    title: def.title,
  }));
}

/** Câu hướng dẫn trong trạng thái rỗng (thay cho thẻ "Hướng dẫn & Lưu ý"). */
export function emptyStateHint(filter: ProcessFilter): string {
  switch (filter) {
    case "active":
      return "Chưa có tác vụ nào đang chạy. Khi bạn tạo phụ đề, dịch thuật, lồng tiếng hoặc tải video, tiến trình sẽ hiện ở đây theo thời gian thực.";
    case "subtitle":
      return "Chưa có tác vụ tạo phụ đề hay dịch thuật nào. Mở tab Studio để tạo phụ đề cho video của bạn.";
    case "dubbing":
      return "Chưa có tác vụ lồng tiếng hay phân vai nào. Mở tab Studio để tạo bản lồng tiếng tiếng Việt.";
    case "downloader":
      return "Chưa có tác vụ tải video nào. Mở tab Tải video để tải và lưu video từ YouTube, TikTok…";
    case "model":
      return "Chưa có tác vụ tải mô hình nào. Mở tab Cài đặt › Mô hình đã tải để tải model STT/dịch/TTS.";
    case "all":
    default:
      return "Chưa có tác vụ nào được ghi nhận. Mọi tác vụ nền (phụ đề, dịch, lồng tiếng, tải video, tải mô hình) sẽ xuất hiện ở đây kèm tiến độ thời gian thực.";
  }
}
