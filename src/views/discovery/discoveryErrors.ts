//! TSK-V015-DISC-UI — **map lỗi** + **nhãn trạng thái tải** (logic thuần).
//!
//! - `mapDiscoveryError(err, code, source)` ⇒ thông điệp tiếng Việt + hành động
//!   (tiêu đề / gợi ý / có nút "Thử lại" không / có đếm ngược không).
//! - `dlBadge(kind, percent)` ⇒ nhãn trạng thái tải trên thẻ ("⏳ Đang đợi",
//!   "⬇ 46 %", "✓ Đã tải", "! Lỗi tải").
//!
//! Tách riêng khỏi [`discoveryModel`] để mỗi file < 300 dòng.
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13.

import type { DiscoveryErrorCode } from "../../lib/tauri";

/** Nguồn nội dung. */
export type DiscoverySource = "bilibili" | "youtube";

/** Thông tin lỗi đã dịch sang tiếng Việt cho UI. */
export interface DiscoveryErrorInfo {
  /** Mã lỗi gốc (từ `discoveryErrorCode`). */
  code: DiscoveryErrorCode;
  /** Tiêu đề lớn. */
  title: string;
  /** Dòng giải thích nhỏ. */
  detail: string;
  /** Gợi ý hành động (tuỳ chọn). */
  hint?: string;
  /** Có nên hiện nút "Thử lại" không. */
  canRetry: boolean;
  /** Có nên hẹn giờ đếm ngược trước khi cho thử lại không. */
  countdown: boolean;
}

/** Tên nguồn hiển thị trong thông điệp lỗi. */
function sourceLabel(source: DiscoverySource): string {
  return source === "youtube" ? "YouTube" : "Bilibili";
}

/** Map lỗi backend ⇒ thông điệp tiếng Việt + hành động. */
export function mapDiscoveryError(
  err: unknown,
  code: DiscoveryErrorCode,
  source: DiscoverySource,
): DiscoveryErrorInfo {
  const src = sourceLabel(source);
  switch (code) {
    case "blocked":
      return {
        code,
        title: `${src} đang tạm chặn tìm kiếm từ máy này`,
        detail: "Thử từ khoá tiếng Trung thay vì tiếng Anh, hoặc thử lại sau ít phút.",
        hint: "Đừng tải lại liên tục — nguồn đang giới hạn máy này.",
        canRetry: true,
        countdown: true,
      };
    case "network":
      return {
        code,
        title: `Không kết nối được ${src}`,
        detail: "Kiểm tra mạng rồi thử lại. Danh sách khác và hàng đợi tải vẫn dùng bình thường.",
        canRetry: true,
        countdown: false,
      };
    case "ytdlp_missing":
      return {
        code,
        title: "Chưa có yt-dlp trên máy này",
        detail: "Cài yt-dlp hoặc đặt đường dẫn yt-dlp trong Cài đặt › Tải video.",
        canRetry: false,
        countdown: false,
      };
    case "parse":
      return {
        code,
        title: `Không đọc được dữ liệu từ ${src}`,
        detail: "Nguồn trả về dữ liệu lạ. Thử lại, hoặc chuyển sang nguồn khác.",
        canRetry: true,
        countdown: false,
      };
    default:
      return {
        code,
        title: `Không lấy được danh sách từ ${src}`,
        detail: String((err as Error)?.message ?? err ?? "Lỗi không rõ").slice(0, 200),
        canRetry: true,
        countdown: false,
      };
  }
}

// ───────────────────────────── Trạng thái tải theo id ─────────────────────────────

/** Trạng thái của một mục trong hàng đợi tải (đã rút gọn cho UI Khám phá). */
export interface DiscoveryDlState {
  status: "queued" | "downloading" | "paused" | "completed" | "error" | "cancelled";
  percent: number;
  title: string;
  filePath?: string | null;
}

/** Bảng `videoId` ⇒ trạng thái tải (dựng từ hàng đợi của DownloaderView). */
export type DiscoveryQueueMap = Record<string, DiscoveryDlState>;

/** Trạng thái tải **rút gọn** dùng trên thẻ (chuỗi để `memo` hiệu quả). */
export type DiscoveryDlKind = "" | "queued" | "downloading" | "done" | "error";

/** Nhãn + kiểu hiển thị của trạng thái tải trên thẻ. */
export function dlBadge(
  kind: DiscoveryDlKind,
  percent: number,
): { text: string; kind: DiscoveryDlKind } {
  switch (kind) {
    case "queued":
      return { text: "⏳ Đang đợi", kind: "queued" };
    case "downloading":
      return { text: `⬇ ${Math.round(percent)}%`, kind: "downloading" };
    case "done":
      return { text: "✓ Đã tải", kind: "done" };
    case "error":
      return { text: "! Lỗi tải", kind: "error" };
    default:
      return { text: "", kind: "" };
  }
}

/** Thẻ đã tải xong? (dùng để tô viền xanh + đổi nút thành "Mở trong Studio"). */
export function isDownloaded(kind: DiscoveryDlKind | undefined): boolean {
  return kind === "done";
}
