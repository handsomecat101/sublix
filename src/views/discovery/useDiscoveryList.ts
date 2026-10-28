//! TSK-V015-DISC-UI — hook gọi lệnh `discovery_*` + phân trang + chống race.
//!
//! - **Huỷ request cũ**: mỗi lần gọi tăng `requestId`; kết quả về muộn mà
//!   `requestId` đã cũ ⇒ **bỏ qua** (không đè lên kết quả mới).
//! - **Phân trang**: Đang hot 20/trang (cuộn tải thêm, tối đa trang 10 = 200 video);
//!   Bảng xếp hạng 100 video 1 lần; tìm kiếm dừng khi trang rỗng hoặc trang 10.
//! - **`force = true`** ⇒ bỏ qua cache phía Rust (nút "Tải lại" ↻).
//!
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  sublix,
  discoveryErrorCode,
} from "../../lib/tauri";
import type { DiscoveryItem, HotWord } from "../../lib/tauri";
import {
  mapDiscoveryError,
  type DiscoveryErrorInfo,
} from "./discoveryErrors";
import type { DiscoveryList, DiscoverySource } from "./discoveryModel";

/** Số trang tối đa khi cuộn tải thêm (20/trang ⇒ 200 video). */
export const MAX_PAGES = 10;
/** Số video mỗi trang của "Đang hot". */
export const PAGE_SIZE = 20;
/** Số kết quả YouTube mỗi lần tìm. */
export const YOUTUBE_COUNT = 20;

/** Trạng thái danh sách đang xem. */
export interface DiscoveryListState {
  items: DiscoveryItem[];
  loading: boolean;
  loadingMore: boolean;
  error: DiscoveryErrorInfo | null;
  /** Lỗi khi tải thêm (giữ nguyên thẻ đã có). */
  moreError: DiscoveryErrorInfo | null;
  page: number;
  hasMore: boolean;
  /** Mốc thời gian (ms) lần tải thành công gần nhất — dùng cho "tuổi cache". */
  loadedAt: number | null;
}

/** Toàn bộ API mà `DiscoveryView` dùng. */
export interface DiscoveryListApi extends DiscoveryListState {
  source: DiscoverySource;
  list: DiscoveryList;
  /** Từ khoá đang gõ trong ô (chưa gửi). */
  keyword: string;
  /** Từ khoá **đã gửi** (sau khi Enter / bấm chip). */
  query: string;
  /** YouTube chưa có API key ⇒ danh sách "Đang hot" bị khoá (nấc A). */
  youtubeLocked: boolean;
  setSource: (source: DiscoverySource) => void;
  setList: (list: DiscoveryList) => void;
  setKeyword: (keyword: string) => void;
  /** Gửi tìm kiếm với từ khoá hiện tại. */
  submitSearch: (keyword?: string) => void;
  /** Bỏ kết quả tìm kiếm ⇒ về danh sách trước đó. */
  clearSearch: () => void;
  /** Tải lại bỏ cache. */
  reload: () => void;
  /** Tải trang kế tiếp (cuộn vô hạn). */
  loadMore: () => void;
}

/** Gọi đúng lệnh backend theo (nguồn, danh sách, từ khoá). */
async function fetchPage(
  source: DiscoverySource,
  list: DiscoveryList,
  query: string,
  page: number,
  force: boolean,
): Promise<DiscoveryItem[]> {
  if (source === "youtube") {
    return await sublix.discoveryYoutubeSearch(query, YOUTUBE_COUNT, force);
  }
  if (list === "ranking") {
    return await sublix.discoveryBilibiliRanking(0, force);
  }
  if (list === "search") {
    return await sublix.discoveryBilibiliSearch(query, page, force);
  }
  return await sublix.discoveryBilibiliPopular(page, force);
}

/** Hook chính của tab "Khám phá". */
export function useDiscoveryList(): DiscoveryListApi {
  const [source, setSource] = useState<DiscoverySource>("bilibili");
  const [list, setList] = useState<DiscoveryList>("hot");
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  /** Bộ đếm lần tìm — Enter lại với cùng từ khoá vẫn tìm lại. */
  const [searchNonce, setSearchNonce] = useState(0);

  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<DiscoveryErrorInfo | null>(null);
  const [moreError, setMoreError] = useState<DiscoveryErrorInfo | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  // Bộ đếm request — request cũ bị bỏ qua khi kết quả về muộn.
  const requestIdRef = useRef(0);
  // Từ khoá/nguồn/danh sách hiện tại (đọc trong callback, tránh stale closure).
  const paramsRef = useRef({ source, list, query });
  paramsRef.current = { source, list, query };

  /** YouTube chưa có API key ⇒ không có "Đang hot" thật (nấc A). */
  const youtubeLocked = source === "youtube" && list === "hot" && !query.trim();

  const load = useCallback(async (targetPage: number, append: boolean, force: boolean) => {
    const { source: src, list: lst, query: q } = paramsRef.current;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (append) {
      setLoadingMore(true);
      setMoreError(null);
    } else {
      setLoading(true);
      setError(null);
      setItems([]);
      setHasMore(false);
    }

    try {
      const result = await fetchPage(src, lst, q, targetPage, force);
      // Request đã bị thay thế ⇒ bỏ qua kết quả cũ (chống đè kết quả mới).
      if (requestId !== requestIdRef.current) return;

      setItems((prev) => (append ? [...prev, ...result] : result));
      setPage(targetPage);
      setLoadedAt(Date.now());
      setError(null);
      setMoreError(null);

      // Bảng xếp hạng 100 video 1 lần ⇒ không có trang sau.
      if (src === "bilibili" && lst === "ranking") {
        setHasMore(false);
      } else if (src === "youtube") {
        setHasMore(false);
      } else {
        setHasMore(result.length >= PAGE_SIZE && targetPage < MAX_PAGES);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const info = mapDiscoveryError(err, discoveryErrorCode(err), src);
      if (append) {
        // Lỗi tải thêm ⇒ **giữ** các thẻ đã có.
        setMoreError(info);
      } else {
        setError(info);
        setItems([]);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // Tải lại khi đổi nguồn / danh sách / từ khoá đã gửi.
  useEffect(() => {
    if (youtubeLocked) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    void load(1, false, false);
  }, [source, list, query, searchNonce, youtubeLocked, load]);

  const submitSearch = useCallback(
    (text?: string) => {
      const value = (text ?? keyword).trim();
      setKeyword(value);
      setQuery(value);
      setList("search");
      setSearchNonce((n) => n + 1);
    },
    [keyword],
  );

  const clearSearch = useCallback(() => {
    setKeyword("");
    setQuery("");
    setList("hot");
    setSearchNonce((n) => n + 1);
  }, []);

  const reload = useCallback(() => {
    void load(1, false, true);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    void load(page + 1, true, false);
  }, [hasMore, loading, loadingMore, page, load]);

  return {
    items,
    loading,
    loadingMore,
    error,
    moreError,
    page,
    hasMore,
    loadedAt,
    source,
    list,
    keyword,
    query,
    youtubeLocked,
    setSource,
    setList,
    setKeyword,
    submitSearch,
    clearSearch,
    reload,
    loadMore,
  };
}

/** Hàng chip "🔥 Xu hướng Douyin" — lỗi thì ẩn cả hàng, không chặn phần khác. */
export interface HotTopicsApi {
  words: HotWord[];
  loading: boolean;
  error: boolean;
  loadedAt: number | null;
  reload: () => void;
}

/** Hook tải hot word Douyin (TTL 15 phút phía Rust). */
export function useHotTopics(): HotTopicsApi {
  const [words, setWords] = useState<HotWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async (force: boolean) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const result = await sublix.discoveryDouyinHot(force);
      if (requestId !== requestIdRef.current) return;
      setWords(result);
      setError(false);
      setLoadedAt(Date.now());
    } catch {
      if (requestId !== requestIdRef.current) return;
      setWords([]);
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const reload = useCallback(() => {
    void load(true);
  }, [load]);

  return { words, loading, error, loadedAt, reload };
}
