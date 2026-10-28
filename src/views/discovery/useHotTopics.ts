//! TSK-V015-DISC-UI — hook tải hàng chip "🔥 Xu hướng Douyin".
//!
//! Lỗi nguồn ⇒ **ẩn cả hàng chip** + 1 dòng mờ + nút ↻ (không chặn phần khác).
//! TTL 15 phút phía Rust (`discovery_douyin_hot`).

import { useCallback, useEffect, useRef, useState } from "react";

import { sublix } from "../../lib/tauri";
import type { HotWord } from "../../lib/tauri";

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
      // Request đã bị thay thế ⇒ bỏ qua kết quả cũ.
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
