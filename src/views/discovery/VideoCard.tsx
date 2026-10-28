//! TSK-V015-DISC-UI — thẻ video trong lưới "Khám phá".
//!
//! - Ảnh 16:9 **lazy**; Bilibili (`hdslb.com`) chặn hotlink ⇒ thử
//!   `referrerPolicy="no-referrer"`, lỗi ⇒ ô dự phòng (không vỡ lưới).
//! - Rê chuột / focus bàn phím ⇒ hiện 2 nút: `⬇ Tải về` · `🎬 Tải & mở Studio`.
//! - Trạng thái tải khớp hàng đợi theo **id video** (bvid / YouTube id).
//!
//! Props **primitive** + `React.memo` ⇒ tiến độ 1 mục chỉ render lại 1 thẻ.
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (mục 5–6).

import { memo, useState } from "react";

import { sublix, type DiscoveryItem } from "../../lib/tauri";
import {
  formatAgo,
  formatDuration,
  formatViews,
  platformLabel,
  platformName,
  viewsTooltip,
} from "./discoveryModel";
import { dlBadge, type DiscoveryDlKind } from "./discoveryErrors";

/** Trạng thái tải rút gọn (chuỗi) — truyền vào thẻ để `memo` hiệu quả. */
export type CardDlStatus = DiscoveryDlKind;

export interface VideoCardProps {
  item: DiscoveryItem;
  /** Trạng thái tải hiện tại (rút gọn). */
  dlStatus: CardDlStatus;
  /** Phần trăm đang tải (0–100). */
  dlPct: number;
  /** Cờ mở Studio khi tải xong (P2-2). */
  openInStudio?: boolean;
  /** Đường dẫn file đã tải (P2-1). */
  filePath?: string | null;
  /** Thẻ đang có focus bàn phím. */
  focused: boolean;
  /** Số thứ hạng (chỉ có ở "Bảng xếp hạng"). */
  rank?: number | null;
  /** Nhấn `⬇ Tải về` (openInStudio = false). */
  onDownload: (item: DiscoveryItem) => void;
  /** Nhấn `🎬 Tải & mở Studio` (openInStudio = true). */
  onDownloadAndOpen: (item: DiscoveryItem) => void;
  /** Đã tải xong ⇒ mở trong Studio. */
  onOpenStudio: (item: DiscoveryItem) => void;
  /** Chuột phải (hoặc Shift+F10) ⇒ mở menu ngữ cảnh. */
  onContextMenu: (item: DiscoveryItem, x: number, y: number) => void;
}

/** Ô dự phòng khi ảnh lỗi — không vỡ lưới. */
function ThumbFallback({ platform, title }: { platform: string; title: string }) {
  return (
    <div className="dsc-thumb-fallback" role="img" aria-label={title}>
      <span className="dsc-logo-lg">{platformLabel(platform)}</span>
    </div>
  );
}

/** Thẻ video (memo) — ảnh + tiêu đề 2 dòng + kênh/lượt xem/thời gian + nút hover. */
function VideoCardInner({
  item,
  dlStatus,
  dlPct,
  openInStudio,
  filePath,
  focused,
  rank,
  onDownload,
  onDownloadAndOpen,
  onOpenStudio,
  onContextMenu,
}: VideoCardProps) {
  const [thumbOk, setThumbOk] = useState(true);
  const [flash, setFlash] = useState(false);

  const badge = dlBadge(dlStatus, dlPct);
  const duration = formatDuration(item.durationSec);
  const views = formatViews(item.viewCount);
  const ago = formatAgo(item.publishTime, Date.now());
  const isDownloading = dlStatus === "queued" || dlStatus === "downloading";
  const isDone = dlStatus === "done";
  const isError = dlStatus === "error";

  /** Bấm lại khi đang tải ⇒ không thêm trùng, chỉ nháy thẻ. */
  const guard = (fn: (item: DiscoveryItem) => void) => {
    if (isDownloading) {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 420);
      return;
    }
    fn(item);
  };

  const label = [
    item.title,
    item.author ? `kênh ${item.author}` : "",
    duration ? `thời lượng ${duration}` : "",
    views ? `lượt xem ${views}` : "",
    badge.text ? `trạng thái ${badge.text}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={[
        "dsc-card",
        isDone ? "dsc-card-done" : "",
        isError ? "dsc-card-err" : "",
        focused ? "dsc-card-focus" : "",
        flash ? "dsc-card-flash" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="gridcell"
      aria-label={label}
      tabIndex={-1}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(item, e.clientX, e.clientY);
      }}
    >
      <div className="dsc-thumb">
        {thumbOk && item.thumbnailUrl ? (
          <img
            className="dsc-thumb-img"
            src={item.thumbnailUrl}
            alt={item.title}
            loading="lazy"
            // Bilibili chặn hotlink theo Referer ⇒ không gửi Referer.
            referrerPolicy="no-referrer"
            onError={() => setThumbOk(false)}
          />
        ) : (
          <ThumbFallback platform={item.platform} title={item.title} />
        )}

        {rank !== null && rank !== undefined && (
          <span className={`dsc-rank${rank <= 3 ? " dsc-rank-top" : ""}`}>{rank}</span>
        )}
        {duration && <span className="dsc-dur">{duration}</span>}

        {/* P2-2: Nhãn trạng thái góc trên ảnh */}
        {isDone && <span className="dsc-thumb-pill dsc-thumb-pill-ok">✓ Đã tải</span>}
        {isDownloading && (
          <span className="dsc-thumb-pill dsc-thumb-pill-ac">
            {dlStatus === "queued" ? "⏳ Đợi" : `⬇ ${Math.round(dlPct)}%`}
          </span>
        )}
        {isError && <span className="dsc-thumb-pill dsc-thumb-pill-err">! Lỗi</span>}
        {openInStudio && !isDone && (
          <span className="dsc-thumb-pill dsc-thumb-pill-studio" title="Sẽ mở tab Studio khi tải xong">
            🎬 Studio
          </span>
        )}

        {isDownloading && (
          <span className="dsc-thumb-progress" style={{ width: `${Math.max(2, dlPct)}%` }} />
        )}

        {/* P2-1: Lớp nút khi rê theo trạng thái */}
        <div className="dsc-hover">
          {isDone ? (
            <>
              <button
                type="button"
                className="dsc-hover-btn dsc-hover-btn-ghost"
                onClick={() => {
                  if (filePath) {
                    void sublix.downloaderRevealFile(filePath).catch(() => sublix.downloaderOpenFolder());
                  } else {
                    void sublix.downloaderOpenFolder();
                  }
                }}
                title="Mở thư mục chứa video đã tải"
              >
                📁 Thư mục
              </button>
              <button
                type="button"
                className="dsc-hover-btn dsc-hover-btn-main"
                onClick={() => onOpenStudio(item)}
                title="Mở trong Sublix Studio"
              >
                🎬 Mở trong Studio
              </button>
            </>
          ) : isError ? (
            <>
              <button
                type="button"
                className="dsc-hover-btn dsc-hover-btn-ghost"
                onClick={() => guard(onDownload)}
                title="Tải về"
              >
                ⬇ Tải về
              </button>
              <button
                type="button"
                className="dsc-hover-btn dsc-hover-btn-main"
                onClick={() => guard(onDownload)}
                title="Thử lại"
              >
                ↻ Thử lại
              </button>
            </>
          ) : isDownloading ? (
            <div className="dsc-hover-progress" title={`Đang tải ${Math.round(dlPct)}%`}>
              <span>{dlStatus === "queued" ? "⏳ Đang đợi…" : `⬇ ${Math.round(dlPct)}%`}</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="dsc-hover-btn dsc-hover-btn-ghost"
                onClick={() => guard(onDownload)}
                title="Tải về (đưa vào hàng đợi)"
              >
                ⬇ Tải về
              </button>
              <button
                type="button"
                className="dsc-hover-btn dsc-hover-btn-main"
                onClick={() => guard(onDownloadAndOpen)}
                title="Tải & mở Studio khi xong"
              >
                🎬 Tải & mở Studio
              </button>
            </>
          )}
        </div>
      </div>

      <div className="dsc-body">
        <div className="dsc-title" title={item.title}>
          {item.title}
        </div>
        <div className="dsc-line1">
          <span className={`dsc-logo dsc-logo-${item.platform}`} title={platformName(item.platform)}>
            {platformLabel(item.platform)}
          </span>
          <span className="dsc-author">{item.author || platformName(item.platform)}</span>
          {badge.text && <span className={`dsc-dl dsc-dl-${badge.kind}`}>{badge.text}</span>}
        </div>
        {isError ? (
          <div className="dsc-line2 dsc-line2-err">Tải lỗi — bấm ↻ Thử lại</div>
        ) : (
          <div className="dsc-line2">
            {views && (
              <span title={viewsTooltip(item.viewCount)}>{views} lượt xem</span>
            )}
            {ago && <span>· {ago}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export const VideoCard = memo(VideoCardInner);
export default VideoCard;
