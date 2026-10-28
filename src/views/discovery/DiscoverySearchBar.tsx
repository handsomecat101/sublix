//! TSK-V015-DISC-UI — thanh tìm + chọn nguồn (nấc A: Bilibili + YouTube).
//!
//! - Chọn nguồn = **segmented** 40 px, mục bật `--ac-soft`, logo nguồn 16×16.
//! - **Chỉ tìm khi Enter** (hoặc bấm ⌕ / chip) — **không** tìm khi đang gõ.
//! - Placeholder theo nguồn; gợi ý "từ khoá tiếng Trung" khi người dùng gõ tiếng Việt.
//! - `Esc` ⇒ xoá ô tìm (nếu rỗng ⇒ bỏ kết quả tìm, về danh sách trước).
//!
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (mục 1).

import { useEffect, useRef, useState } from "react";

import { isLikelyVietnamese, type DiscoverySource } from "./discoveryModel";

export interface DiscoverySearchBarProps {
  source: DiscoverySource;
  keyword: string;
  /** Có đang tìm (để hiện spinner ở nút ⌕). */
  busy: boolean;
  onSourceChange: (source: DiscoverySource) => void;
  onKeywordChange: (keyword: string) => void;
  onSubmit: (keyword: string) => void;
  /** Esc khi ô rỗng ⇒ bỏ kết quả tìm. */
  onClear: () => void;
  /** Esc khi ô rỗng ⇒ đưa focus về lưới. */
  onFocusGrid?: () => void;
}

const SOURCES: { id: DiscoverySource; logo: string; name: string }[] = [
  { id: "bilibili", logo: "B", name: "Bilibili" },
  { id: "youtube", logo: "▶", name: "YouTube" },
];

const PLACEHOLDER: Record<DiscoverySource, string> = {
  bilibili: "Tìm trên Bilibili — từ khoá tiếng Trung cho nhiều kết quả hơn, vd 艾尔登法环 剧情",
  youtube: "Tìm trên YouTube",
};

export function DiscoverySearchBar({
  source,
  keyword,
  busy,
  onSourceChange,
  onKeywordChange,
  onSubmit,
  onClear,
  onFocusGrid,
}: DiscoverySearchBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  /** `/` và `Ctrl+F` ⇒ focus ô tìm, chọn sẵn chữ (chỉ khi tab Khám phá mở). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f")) && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const value = keyword.trim();
    if (!value) return;
    onSubmit(value);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (keyword) {
        onKeywordChange("");
      } else {
        onClear();
        onFocusGrid?.();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onFocusGrid?.();
    }
  };

  return (
    <div className="dsc-searchbar">
      <div className="dsc-seg" role="tablist" aria-label="Chọn nguồn tìm kiếm">
        {SOURCES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={source === item.id}
            className={`dsc-seg-item${source === item.id ? " dsc-seg-on" : ""}`}
            onClick={() => onSourceChange(item.id)}
            title={`Tìm trên ${item.name}`}
          >
            <span className={`dsc-logo dsc-logo-${item.id}`}>{item.logo}</span>
            <span className="dsc-seg-text">{item.name}</span>
          </button>
        ))}
      </div>

      <div className={`dsc-search-wrap${focused ? " dsc-search-focus" : ""}`}>
        <span className="dsc-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          ref={inputRef}
          className="dsc-search-input"
          type="text"
          value={keyword}
          placeholder={PLACEHOLDER[source]}
          aria-label="Từ khoá tìm kiếm video"
          onChange={(e) => onKeywordChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="dsc-search-go"
          onClick={submit}
          disabled={!keyword.trim() || busy}
          title="Tìm (Enter)"
        >
          {busy ? "↻" : "⌕"}
        </button>
      </div>

      {source === "bilibili" && isLikelyVietnamese(keyword) && (
        <div className="dsc-hint">
          Bilibili ưu tiên từ khoá <strong>tiếng Trung</strong> — từ khoá tiếng Anh thường bị
          chặn.
        </div>
      )}
    </div>
  );
}

export default DiscoverySearchBar;
