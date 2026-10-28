//! TSK-V015-DISC-B1 — hook **tự dịch từ khoá** sang tiếng Trung giản thể.
//!
//! Vì sao: Bilibili **chặn** tìm kiếm bằng từ khoá tiếng Anh (mã `-412`), còn
//! từ khoá tiếng Trung thì ra kết quả. Người Việt hay gõ tên game/tiêu đề bằng
//! tiếng Anh ⇒ tab "Khám phá" tự dịch trước khi tìm.
//!
//! - Dùng **provider dịch người dùng đã cấu hình** (MiniMax / Ollama / …) qua
//!   lệnh `discovery_translate_keyword` — không thêm provider hay API key mới.
//! - Công tắc **mặc định BẬT**, nhớ lựa chọn trong localStorage (try/catch).
//! - Cache bản dịch theo từ khoá **trong phiên**.
//! - Dịch lỗi ⇒ trả `null` + thông báo nhẹ ⇒ frontend tìm **nguyên văn**.
//!
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (mục 2).

import { useCallback, useState } from "react";

import { sublix } from "../../lib/tauri";
import { needsTranslation, readStoredFlag, writeStoredFlag } from "./discoveryModel";

/** Khoá localStorage của công tắc "Tự dịch sang tiếng Trung" (mặc định BẬT). */
export const AUTO_TRANSLATE_KEY = "sublix.discovery.autoTranslate";

/**
 * Cache bản dịch theo từ khoá **trong phiên** (đóng app là mất).
 *
 * Key = từ khoá gốc viết thường — "Elden Ring" và "elden ring" dùng chung 1 bản dịch.
 */
const translateCache = new Map<string, string>();

/** Thông tin bản dịch vừa dùng cho lần tìm gần nhất. */
export interface DiscoveryTranslation {
  /** Từ khoá người dùng gõ. */
  from: string;
  /** Từ khoá Trung đã gửi đi. */
  to: string;
}

/** API của hook tự dịch. */
export interface KeywordTranslateApi {
  /** Công tắc đang bật hay tắt. */
  autoTranslate: boolean;
  /** Đang chờ dịch. */
  translating: boolean;
  /** Bản dịch vừa dùng (để hiện dòng "Đã tìm: …"). */
  translation: DiscoveryTranslation | null;
  /** Thông báo nhẹ khi dịch lỗi (đang tìm nguyên văn). */
  translateNotice: string | null;
  /** Bật/tắt công tắc (ghi localStorage, có try/catch). */
  setAutoTranslate: (value: boolean) => void;
  /**
   * Dịch 1 từ khoá sang tiếng Trung.
   *
   * - Từ khoá đã là tiếng Trung ⇒ trả về nguyên văn (không gọi provider).
   * - Lỗi / chưa cấu hình provider ⇒ `null` + đặt thông báo nhẹ.
   */
  translate: (raw: string) => Promise<string | null>;
  /** Xoá bản dịch + thông báo (dùng khi tìm nguyên văn hoặc đổi danh sách). */
  reset: () => void;
}

/** Hook tự dịch từ khoá sang tiếng Trung. */
export function useKeywordTranslate(): KeywordTranslateApi {
  const [autoTranslate, setAutoTranslateState] = useState(() =>
    readStoredFlag(AUTO_TRANSLATE_KEY, true),
  );
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<DiscoveryTranslation | null>(null);
  const [translateNotice, setTranslateNotice] = useState<string | null>(null);

  const setAutoTranslate = useCallback((value: boolean) => {
    setAutoTranslateState(value);
    writeStoredFlag(AUTO_TRANSLATE_KEY, value);
  }, []);

  const reset = useCallback(() => {
    setTranslation(null);
    setTranslateNotice(null);
  }, []);

  const translate = useCallback(async (raw: string): Promise<string | null> => {
    const text = raw.trim();
    if (!text) return null;

    // Đã là tiếng Trung (hoặc không có chữ Latin) ⇒ không cần dịch.
    if (!needsTranslation(text)) {
      setTranslateNotice(null);
      setTranslation(null);
      return text;
    }

    setTranslating(true);
    setTranslateNotice(null);
    try {
      const cacheKey = text.toLowerCase();
      const cached = translateCache.get(cacheKey);
      const translated = cached ?? (await sublix.discoveryTranslateKeyword(text));
      if (!cached) translateCache.set(cacheKey, translated);
      setTranslation({ from: text, to: translated });
      return translated;
    } catch {
      // Dịch lỗi / chưa cấu hình provider ⇒ tìm nguyên văn + báo nhẹ.
      setTranslation(null);
      setTranslateNotice("Chưa dịch được — đang tìm nguyên văn.");
      return null;
    } finally {
      setTranslating(false);
    }
  }, []);

  return {
    autoTranslate,
    translating,
    translation,
    translateNotice,
    setAutoTranslate,
    translate,
    reset,
  };
}
