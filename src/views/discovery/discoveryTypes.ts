//! TSK-V015-DISC-B1 — kiểu dùng chung giữa `DiscoveryView` và `DownloaderView`.
//!
//! Tách riêng để mỗi file < 300 dòng.

import type { DiscoveryItem } from "../../lib/tauri";

/** Trạng thái tải của một mục hàng đợi, khớp theo **id video**. */
export interface DiscoveryDlEntry {
  id?: string;
  status: "queued" | "downloading" | "paused" | "completed" | "error" | "cancelled";
  percent: number;
  title: string;
  filePath?: string | null;
  /** Mục xếp bằng nút "🎬 Tải & mở Studio" ⇒ tải xong tự mở tab Studio. */
  openInStudio?: boolean;
  /** P1-1: đã mở tab Studio rồi thì không mở lại. */
  studioOpened?: boolean;
}

/** Menu chuột phải (Shift+F10) của một thẻ. */
export interface DiscoveryMenuState {
  item: DiscoveryItem;
  x: number;
  y: number;
}
