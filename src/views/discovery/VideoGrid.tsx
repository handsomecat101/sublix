//! TSK-V015-DISC-UI — lưới thẻ video "Khám phá".
//!
//! - Roving `tabIndex` (chỉ 1 thẻ có `tabIndex = 0`) ⇒ Tab dừng 1 lần ở lưới.
//! - `← → ↑ ↓` đi theo ô lưới; số cột đọc từ **bố cục thật** (`ResizeObserver`).
//! - `Home`/`End` (End ⇒ kích hoạt tải trang sau) · `Enter`/`Shift+Enter` (Tải về /
//!   Tải & mở Studio) · `Ctrl+C` sao chép link.
//! - Cuộn vô hạn: còn ~600 px tới đáy ⇒ tải trang sau (`IntersectionObserver`).
//!
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (mục 6 + bảng bàn phím).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { DiscoveryItem } from "../../lib/tauri";
import { gridNav, videoIdOf } from "./discoveryModel";
import { VideoCard, type CardDlStatus } from "./VideoCard";

export interface VideoGridProps {
  items: DiscoveryItem[];
  /** Trạng thái tải theo video id. */
  dlStates: Record<string, { status: CardDlStatus; percent: number }>;
  /** Có hiện số thứ hạng (Bảng xếp hạng). */
  showRank: boolean;
  /** Tăng lên ⇒ focus thẻ đầu (từ ô tìm). */
  focusRequest?: number;
  /** Đang tải trang sau. */
  loadingMore: boolean;
  /** Lỗi tải thêm (giữ thẻ đã có). */
  moreError: { title: string } | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetryMore: () => void;
  onDownload: (item: DiscoveryItem) => void;
  onDownloadAndOpen: (item: DiscoveryItem) => void;
  onOpenStudio: (item: DiscoveryItem) => void;
  onContextMenu: (item: DiscoveryItem, x: number, y: number) => void;
}

export function VideoGrid({
  items,
  dlStates,
  showRank,
  focusRequest,
  loadingMore,
  moreError,
  hasMore,
  onLoadMore,
  onRetryMore,
  onDownload,
  onDownloadAndOpen,
  onOpenStudio,
  onContextMenu,
}: VideoGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const [cols, setCols] = useState(4);

  /** Số cột đọc từ bố cục thật (ResizeObserver). */
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const styles = window.getComputedStyle(el);
      const gap = parseFloat(styles.columnGap || "0") || 0;
      const width = el.clientWidth;
      const first = el.firstElementChild as HTMLElement | null;
      if (!first || width <= 0) return;
      const cardWidth = first.getBoundingClientRect().width;
      if (cardWidth <= 0) return;
      const count = Math.max(1, Math.floor((width + gap) / (cardWidth + gap)));
      setCols(count);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length]);

  /** Cuộn vô hạn — còn ~600 px tới đáy ⇒ tải trang sau. */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, items.length]);

  /** Đưa focus DOM về thẻ đang chọn. */
  useEffect(() => {
    const el = cardRefs.current[focusIndex];
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }, [focusIndex]);

  /** Yêu cầu focus thẻ đầu (từ ô tìm: ↓ hoặc Esc khi ô rỗng). */
  useEffect(() => {
    if (!focusRequest) return;
    setFocusIndex(0);
    cardRefs.current[0]?.focus({ preventScroll: false });
  }, [focusRequest]);

  const focusCard = useCallback((index: number) => {
    setFocusIndex(index);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "End") {
      e.preventDefault();
      focusCard(items.length - 1);
      if (hasMore) onLoadMore();
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      focusCard(0);
      return;
    }
    const next = gridNav(focusIndex, e.key, cols, items.length);
    if (next !== null) {
      e.preventDefault();
      focusCard(next);
      return;
    }
    if (e.key === "Enter") {
      const item = items[focusIndex];
      if (!item) return;
      e.preventDefault();
      const state = dlStates[item.id] ?? dlStates[videoIdOf(item.url)];
      if (state?.status === "done") {
        onOpenStudio(item);
      } else if (e.shiftKey) {
        onDownloadAndOpen(item);
      } else {
        onDownload(item);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      const item = items[focusIndex];
      if (!item) return;
      e.preventDefault();
      void navigator.clipboard?.writeText(item.url);
    }
  };

  return (
    <div
      className="dsc-grid"
      role="grid"
      aria-label="Danh sách video"
      ref={gridRef}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => {
        const state = dlStates[item.id] ?? dlStates[videoIdOf(item.url)];
        return (
          <div
            key={item.id || `${item.platform}-${index}`}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            tabIndex={index === focusIndex ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
          >
            <VideoCard
              item={item}
              dlStatus={state?.status ?? ""}
              dlPct={state?.percent ?? 0}
              focused={index === focusIndex}
              rank={showRank ? index + 1 : null}
              onDownload={onDownload}
              onDownloadAndOpen={onDownloadAndOpen}
              onOpenStudio={onOpenStudio}
              onContextMenu={onContextMenu}
            />
          </div>
        );
      })}

      {loadingMore && (
        <div className="dsc-grid-more" aria-live="polite">
          <span className="dsc-spinner" /> Đang tải trang sau…
        </div>
      )}
      {moreError && (
        <div className="dsc-grid-more dsc-grid-more-err" role="alert">
          Không tải thêm được · {moreError.title}
          <button type="button" className="dsc-link-btn" onClick={onRetryMore}>
            ↻ Thử lại
          </button>
        </div>
      )}
      <div ref={sentinelRef} className="dsc-sentinel" aria-hidden="true" />
    </div>
  );
}

export default VideoGrid;
