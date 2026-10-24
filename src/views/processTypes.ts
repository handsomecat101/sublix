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
}
