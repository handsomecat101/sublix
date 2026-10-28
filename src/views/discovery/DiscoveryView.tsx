//! TSK-V015-DISC-UI — khung chính của tab con "Khám phá" (v0.15 nấc A).
//!
//! Ghép: thanh tìm → hàng chip Douyin → hàng chọn danh sách → lưới thẻ →
//! hàng đợi mini. Lỗi backend ⇒ map qua `discoveryErrorCode` ⇒ thông điệp +
//! nút Thử lại (đếm ngược 30 s khi bị chặn, gọi lại với `force`).
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DiscoveryItem } from "../../lib/tauri";
import {
  nextRetryDelay,
  RETRY_DELAY_SECS,
  videoIdOf,
  type DiscoveryList,
  type DiscoverySource,
} from "./discoveryModel";
import { DiscoveryContextMenu } from "./DiscoveryContextMenu";
import { DiscoveryToast } from "./DiscoveryToast";
import { DiscoveryListTabs } from "./DiscoveryListTabs";
import { DiscoverySearchBar } from "./DiscoverySearchBar";
import { DiscoveryEmpty, DiscoveryError, DiscoveryNoKey, DiscoverySkeleton } from "./DiscoveryStates";
import { HotTopicChips } from "./HotTopicChips";
import { MiniQueueBar, type MiniQueueItem } from "./MiniQueueBar";
import type { DiscoveryDlEntry, DiscoveryMenuState } from "./discoveryTypes";
import { useDiscoveryList } from "./useDiscoveryList";
import { useHotTopics } from "./useHotTopics";
import { VideoGrid } from "./VideoGrid";

export type { DiscoveryDlEntry } from "./discoveryTypes";

export interface DiscoveryPanelProps {
  /** Hàng đợi tải hiện có của DownloaderView — khớp theo id video. */
  dlStates: Record<string, DiscoveryDlEntry>;
  /** Hàng đợi mini (đọc từ cùng state, không gọi lệnh mới). */
  queueItems: MiniQueueItem[];
  /** Đưa URL vào **hàng đợi tải hiện có** (dùng đúng luồng của DownloaderView). */
  onEnqueue: (url: string, options: { openInStudio: boolean; title?: string }) => void;
  /** Mở tab Studio cho file đã tải (dùng đúng lối mở tab của §4.11). */
  onOpenStudio: (filePath: string) => void;
  /** Chuyển sang tab con "Tải về". */
  onShowDownloader: () => void;
}

export function DiscoveryPanel({
  dlStates,
  queueItems,
  onEnqueue,
  onOpenStudio,
  onShowDownloader,
}: DiscoveryPanelProps) {
  const list = useDiscoveryList();
  const hot = useHotTopics();

  /** Đếm ngược "Thử lại" khi bị chặn. */
  const [retryIn, setRetryIn] = useState(0);
  /** Số lần bị chặn liên tiếp + thời gian chờ hiện tại (gấp đôi mỗi lần). */
  const blockedRef = useRef({ count: 0, delay: RETRY_DELAY_SECS });
  const [menu, setMenu] = useState<DiscoveryMenuState | null>(null);
  /** Yêu cầu focus thẻ đầu của lưới (ô tìm: ↓ hoặc Esc khi ô rỗng). */
  const [gridFocusReq, setGridFocusReq] = useState(0);
  const focusGrid = useCallback(() => setGridFocusReq((n) => n + 1), []);

  const { error, moreError } = list;

  /**
   * Bị chặn ⇒ bắt đầu đếm ngược.
   * Lần chặn đầu chờ [`RETRY_DELAY_SECS`] (30 s); mỗi lần bị chặn **liên tiếp**
   * thì thời gian chờ **nhân đôi** (30 s → 1:00 → 2:00 → 4:00), tối đa 5 phút.
   */
  useEffect(() => {
    if (error?.code !== "blocked") {
      // Không còn bị chặn ⇒ lần sau bắt đầu lại từ 30 s.
      blockedRef.current = { count: 0, delay: RETRY_DELAY_SECS };
      setRetryIn(0);
      return;
    }

    blockedRef.current.count += 1;
    const delay =
      blockedRef.current.count === 1
        ? RETRY_DELAY_SECS
        : nextRetryDelay(blockedRef.current.delay);
    blockedRef.current.delay = delay;
    setRetryIn(delay);

    const timer = window.setInterval(() => {
      setRetryIn((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [error]);

  const doDownload = useCallback(
    (item: DiscoveryItem, openInStudio: boolean) => {
      if (!item.url) return;
      onEnqueue(item.url, { openInStudio, title: item.title });
    },
    [onEnqueue],
  );

  const doOpenStudio = useCallback(
    (item: DiscoveryItem) => {
      const state = dlStates[item.id] ?? dlStates[videoIdOf(item.url)];
      const path = state?.filePath;
      if (path) onOpenStudio(path);
    },
    [dlStates, onOpenStudio],
  );

  // ---- Toast "Xong — đã mở tab trong Studio" (§4.13 mục 6) ----
  // Mục xếp bằng cờ `openInStudio` tải xong ⇒ tự mở tab Studio + toast.
  const [toast, setToast] = useState<{ title: string; path: string } | null>(null);
  const autoOpenedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const live = new Set(Object.keys(dlStates));
    // Dọn cờ của mục đã rời hàng đợi ⇒ tải lại cùng video vẫn mở Studio.
    for (const vid of Array.from(autoOpenedRef.current)) {
      if (!live.has(vid)) autoOpenedRef.current.delete(vid);
    }
    for (const [vid, entry] of Object.entries(dlStates)) {
      if (!entry.openInStudio) continue;
      if (entry.status !== "completed" || !entry.filePath) continue;
      if (autoOpenedRef.current.has(vid)) continue;
      autoOpenedRef.current.add(vid);
      setToast({ title: entry.title, path: entry.filePath });
      onOpenStudio(entry.filePath);
    }
  }, [dlStates, onOpenStudio]);

  const retry = useCallback(() => {
    list.reload();
  }, [list]);

  const ageMinutes = useMemo(() => {
    if (!list.loadedAt) return null;
    return Math.max(0, Math.floor((Date.now() - list.loadedAt) / 60000));
  }, [list.loadedAt]);

  const hotAgeMinutes = useMemo(() => {
    if (!hot.loadedAt) return null;
    return Math.max(0, Math.floor((Date.now() - hot.loadedAt) / 60000));
  }, [hot.loadedAt]);

  const gridStates = useMemo(() => {
    const out: Record<string, { status: "queued" | "downloading" | "done" | "error"; percent: number }> =
      {};
    for (const [id, entry] of Object.entries(dlStates)) {
      const status =
        entry.status === "completed"
          ? "done"
          : entry.status === "error" || entry.status === "cancelled"
            ? "error"
            : entry.status === "downloading"
              ? "downloading"
              : "queued";
      out[id] = { status, percent: entry.percent };
    }
    return out;
  }, [dlStates]);

  const onPickChip = useCallback(
    (word: string) => {
      // Chip ⇒ điền **đúng chữ chip** vào ô + tìm ở nguồn đang chọn.
      list.setKeyword(word);
      void list.submitSearch(word);
    },
    [list],
  );

  const onSourceChange = useCallback(
    (source: DiscoverySource) => {
      list.setSource(source);
      // Đổi nguồn khi có từ khoá ⇒ tìm lại ngay ở nguồn mới.
      // Dùng từ khoá **gõ trong ô** (chưa dịch) — YouTube tìm tiếng Anh tốt hơn.
      const raw = list.keyword.trim() || list.query.trim();
      if (raw) {
        void list.submitSearch(raw, { source });
      } else {
        list.setList("hot");
      }
    },
    [list],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onDown = () => closeMenu();
    window.addEventListener("click", onDown);
    window.addEventListener("scroll", onDown, true);
    return () => {
      window.removeEventListener("click", onDown);
      window.removeEventListener("scroll", onDown, true);
    };
  }, [menu, closeMenu]);

  const gridHasItems = list.items.length > 0;

  return (
    <div className="dsc-root">
      <DiscoverySearchBar
        source={list.source}
        keyword={list.keyword}
        busy={list.loading}
        autoTranslate={list.autoTranslate}
        translating={list.translating}
        translation={list.translation}
        translateNotice={list.translateNotice}
        onSourceChange={onSourceChange}
        onKeywordChange={list.setKeyword}
        onSubmit={(text) => void list.submitSearch(text)}
        onAutoTranslateChange={list.setAutoTranslate}
        onSearchOriginal={list.searchOriginal}
        onClear={list.clearSearch}
        onFocusGrid={focusGrid}
      />

      <HotTopicChips
        words={hot.words}
        loading={hot.loading}
        error={hot.error}
        keyword={list.keyword}
        ageMinutes={hotAgeMinutes}
        onPick={onPickChip}
        onReload={hot.reload}
      />

      <DiscoveryListTabs
        source={list.source}
        list={list.list}
        query={list.query}
        count={list.items.length}
        total={list.list === "ranking" ? 100 : null}
        ageMinutes={ageMinutes}
        loading={list.loading}
        hasMore={list.hasMore}
        retryIn={retryIn}
        onSelect={(next: DiscoveryList) => list.setList(next)}
        onClearSearch={list.clearSearch}
        onReload={list.reload}
      />

      {list.youtubeLocked ? (
        <DiscoveryNoKey onSearch={() => list.setList("search")} />
      ) : list.loading && !gridHasItems ? (
        <DiscoverySkeleton />
      ) : error ? (
        <DiscoveryError
          error={error}
          retryIn={retryIn}
          onRetry={retry}
          onFallback={list.source === "bilibili" ? () => list.setList("hot") : undefined}
        />
      ) : list.list === "search" && !gridHasItems ? (
        <DiscoveryEmpty
          query={list.query}
          onShorter={() => void list.submitSearch(list.query.split(/\s+/)[0] ?? list.query)}
          onYouTube={() => {
            list.setSource("youtube");
            void list.submitSearch(list.query);
          }}
        />
      ) : (
        <VideoGrid
          items={list.items}
          dlStates={gridStates}
          showRank={list.list === "ranking"}
          focusRequest={gridFocusReq}
          loadingMore={list.loadingMore}
          moreError={moreError ? { title: moreError.title } : null}
          hasMore={list.hasMore}
          onLoadMore={list.loadMore}
          onRetryMore={list.loadMore}
          onDownload={(item) => doDownload(item, false)}
          onDownloadAndOpen={(item) => doDownload(item, true)}
          onOpenStudio={doOpenStudio}
          onContextMenu={(item, x, y) => setMenu({ item, x, y })}
        />
      )}

      {gridHasItems && !list.loading && (
        <div className="dsc-endline">
          Hết · {list.items.length} video
          <button
            type="button"
            className="dsc-link-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            Lên đầu ↑
          </button>
        </div>
      )}

      <MiniQueueBar items={queueItems} onOpenDownloader={onShowDownloader} />

      {toast && (
        <DiscoveryToast
          title={toast.title}
          path={toast.path}
          onOpenStudio={onOpenStudio}
          onClose={() => setToast(null)}
        />
      )}

      {menu && (
        <DiscoveryContextMenu
          item={menu.item}
          x={menu.x}
          y={menu.y}
          onDownload={(item) => doDownload(item, false)}
          onDownloadAndOpen={(item) => doDownload(item, true)}
          onSearchChannel={(author) => {
            list.setKeyword(author);
            void list.submitSearch(author);
          }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

export default DiscoveryPanel;
