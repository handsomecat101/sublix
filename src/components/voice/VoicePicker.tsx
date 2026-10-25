import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  buildGroups,
  clearFilterHint,
  computeWindow,
  flattenEntries,
  genderLabel,
  rowItems,
  shortEngineLabel,
  type GenderFilter,
  type VoicePickerItem,
} from "./voicePickerModel";
import { VoicePickerRow } from "./VoicePickerRow";
import type { VoiceUsedBy } from "./VoicePickerRow";
import "./voicePicker.css";

/** Trạng thái phát mẫu (1 mẫu phát 1 lúc — do cha quản lý). */
export interface VoicePreviewState {
  id: string;
  status: "loading" | "playing";
  /** Tiến độ 0..1 (tuỳ chọn). */
  progress?: number;
}

export interface VoicePickerProps {
  /** Danh sách giọng (đã tách nhãn). */
  voices: ReadonlyArray<VoicePickerItem>;
  /** Id giọng đang dùng (bỏ trống ở variant inline). */
  value?: string;
  /** Chọn giọng (chỉ gọi khi người dùng bấm dòng / Enter). */
  onChange?: (id: string) => void;
  /** Tập id giọng đã ghim ★. */
  favorites: ReadonlySet<string>;
  /** Bật/tắt ★. */
  onToggleFavorite: (id: string) => void;
  /** Mẫu đang phát (null = không có). */
  preview: VoicePreviewState | null;
  /** Bấm ▶ — nghe mẫu (KHÔNG đổi giọng vai). */
  onPreview: (id: string) => void;
  /** Dừng mẫu. */
  onStopPreview: () => void;
  /** Giọng → các vai KHÁC đang dùng nó (chip trùng giọng). */
  usedBy?: ReadonlyMap<string, ReadonlyArray<VoiceUsedBy>>;
  /** popover = trong Studio; inline = trong Cài đặt. */
  variant?: "popover" | "inline";
  /** "Quản lý ›" → mở Cài đặt. */
  onManage?: () => void;
  disabled?: boolean;
  ariaLabel: string;
}

interface PopoverPos {
  left: number;
  top: number;
  /** Lật lên trên (không đủ chỗ bên dưới). */
  flipped: boolean;
}

const POPOVER_MAX_H = 440;
const POPOVER_WIDTH = 320;
const VIRTUALIZE_THRESHOLD = 100;

function VoicePickerInner({
  voices,
  value,
  onChange,
  favorites,
  onToggleFavorite,
  preview,
  onPreview,
  onStopPreview,
  usedBy,
  variant = "popover",
  onManage,
  disabled,
  ariaLabel,
}: VoicePickerProps) {
  const inline = variant === "inline";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<GenderFilter>("all");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pos, setPos] = useState<PopoverPos>({ left: 0, top: 0, flipped: false });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(320);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const engineIds = useMemo(() => {
    if (inline || !value) return undefined;
    const prefix = value.includes(":") ? value.slice(0, value.indexOf(":")) : "";
    return prefix ? [prefix] : undefined;
  }, [inline, value]);

  const groups = useMemo(
    () => buildGroups(voices, favorites, query, gender, engineIds ? { engineIds } : {}),
    [voices, favorites, query, gender, engineIds],
  );
  const entries = useMemo(() => flattenEntries(groups), [groups]);
  const rows = useMemo(() => rowItems(entries), [entries]);
  const current = useMemo(
    () => voices.find((v) => v.id === value) ?? null,
    [voices, value],
  );
  const hint = useMemo(() => clearFilterHint(voices, query, gender), [voices, query, gender]);

  const emptyUsedBy = useMemo(() => [] as VoiceUsedBy[], []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    onStopPreview();
  }, [onStopPreview]);

  const choose = useCallback(
    (id: string) => {
      onChange?.(id);
      setOpen(false);
      setQuery("");
      onStopPreview();
    },
    [onChange, onStopPreview],
  );

  const handleToggleFavorite = useCallback(
    (id: string) => onToggleFavorite(id),
    [onToggleFavorite],
  );

  const handlePreview = useCallback((id: string) => onPreview(id), [onPreview]);

  // Vị trí popover: dưới nút, lật lên khi sát đáy.
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - 12;
    const flipped = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxH = Math.min(POPOVER_MAX_H, flipped ? spaceAbove : spaceBelow);
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8)),
      top: flipped ? Math.max(8, r.top - Math.min(maxH, POPOVER_MAX_H) - 6) : r.bottom + 6,
      flipped,
    });
    setViewportH(Math.max(160, maxH - 96));
  }, []);

  useLayoutEffect(() => {
    if (open && !inline) reposition();
  }, [open, inline, reposition]);

  // Focus sẵn ô tìm khi mở.
  useEffect(() => {
    if (open && !inline) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open, inline]);

  // Bấm ra ngoài / Tab → đóng, GIỮ giọng cũ.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const t = triggerRef.current;
      const p = popRef.current;
      if (t?.contains(e.target as Node) || p?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, close, reposition]);

  // Dòng chọn = giọng đang dùng khi mở.
  useEffect(() => {
    if (!open) return;
    const idx = rows.findIndex((r) => r.id === value);
    setActiveIndex(idx >= 0 ? idx : rows.length > 0 ? 0 : -1);
  }, [open, rows, value]);

  // Cuộn dòng đang chọn vào khung.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(`[data-row="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (query) setQuery("");
        else close();
        return;
      }
      if (e.ctrlKey && (e.key === " " || e.key === "Spacebar")) {
        e.preventDefault();
        const item = rows[activeIndex];
        if (item) onPreview(item.id);
        return;
      }
      if (e.ctrlKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        const item = rows[activeIndex];
        if (item) onToggleFavorite(item.id);
        return;
      }
      if (e.altKey && (e.key === "1" || e.key === "2" || e.key === "3")) {
        e.preventDefault();
        setGender(e.key === "1" ? "all" : e.key === "2" ? "male" : "female");
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((i) => {
          if (rows.length === 0) return -1;
          const next = i + dir;
          if (next < 0) return rows.length - 1;
          if (next >= rows.length) return 0;
          return next;
        });
        return;
      }
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        const step = e.key === "PageDown" ? 8 : -8;
        setActiveIndex((i) => Math.max(0, Math.min(rows.length - 1, (i < 0 ? 0 : i) + step)));
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const item = rows[activeIndex];
        if (item) choose(item.id);
      }
    },
    [activeIndex, choose, close, onPreview, onToggleFavorite, query, rows],
  );

  const openPicker = useCallback(() => {
    if (disabled) return;
    setOpen(true);
  }, [disabled]);

  const listNode = useMemo(() => {
    const virtualize = entries.length > VIRTUALIZE_THRESHOLD;
    const win = computeWindow(entries, scrollTop, viewportH);
    const slice = virtualize ? entries.slice(win.start, win.end) : entries;
    let rowIndex = virtualize ? win.start : 0;
    return (
      <div
        className="vp-list"
        ref={listRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <div className="vp-list-inner" style={virtualize ? { height: win.totalHeight } : undefined}>
          {slice.map((entry) => {
            if (entry.kind === "header") {
              return (
                <div
                  key={entry.key}
                  className={`vp-group${entry.level === 1 ? " is-sub" : ""}${entry.title.includes("★") ? " is-fav" : ""}`}
                >
                  <span>{entry.title}</span>
                  {entry.engineLabel ? (
                    <span className={`vp-eng ${entry.engineKind === "cloud" ? "is-cloud" : "is-offline"}`}>
                      {entry.engineLabel}
                    </span>
                  ) : null}
                  <span className="vp-group-count">{entry.count}</span>
                </div>
              );
            }
            const idx = rowIndex;
            rowIndex += 1;
            const item = entry.item;
            const previewState = preview?.id === item.id ? preview.status : null;
            const used = usedBy?.get(item.id) ?? emptyUsedBy;
            return (
              <div key={entry.key} data-row={idx}>
                <VoicePickerRow
                  item={item}
                  isCurrent={item.id === value}
                  isActive={idx === activeIndex}
                  isFavorite={favorites.has(item.id)}
                  preview={previewState}
                  usedBy={used}
                  query={query}
                  showEngineBadge={inline}
                  onSelect={choose}
                  onPreview={handlePreview}
                  onToggleFavorite={handleToggleFavorite}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [
    activeIndex,
    choose,
    emptyUsedBy,
    entries,
    favorites,
    handlePreview,
    handleToggleFavorite,
    inline,
    preview,
    query,
    scrollTop,
    usedBy,
    value,
    viewportH,
  ]);

  const filters = useMemo(
    () =>
      (["all", "male", "female"] as const).map((g) => ({
        id: g,
        label: genderLabel(g),
        active: gender === g,
      })),
    [gender],
  );

  const body = (
    <>
      <div className="vp-head">
        <div className="vp-search">
          <span className="vp-search-ic">⌕</span>
          <input
            ref={searchRef}
            className="vp-search-input"
            value={query}
            placeholder="Tìm giọng… (không cần dấu)"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Tìm giọng"
          />
          {query ? (
            <button type="button" className="vp-search-clear" onClick={() => setQuery("")}>
              ✕
            </button>
          ) : null}
        </div>
        <div className="vp-filters">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`vp-chip${f.active ? " is-on" : ""}`}
              onClick={() => setGender(f.id)}
            >
              {f.label}
            </button>
          ))}
          <span className="vp-count">{rows.length} giọng</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="vp-empty">
          <span className="vp-empty-icon">🔇</span>
          <span className="vp-empty-title">Không có giọng “{query.trim() || genderLabel(gender)}”</span>
          <span className="vp-empty-desc">Thử bỏ bớt điều kiện lọc.</span>
          {hint ? (
            <button type="button" className="vp-btn" onClick={() => setGender("all")}>
              {hint}
            </button>
          ) : null}
          {query ? (
            <button type="button" className="vp-btn" onClick={() => setQuery("")}>
              Xoá tìm
            </button>
          ) : null}
        </div>
      ) : (
        listNode
      )}

      <div className="vp-foot">
        <span className="vp-kbd">↑↓</span>
        <span className="vp-kbd">↵</span>
        <span>dùng</span>
        <span className="vp-kbd">Ctrl+Space</span>
        <span>nghe</span>
        <span className="vp-kbd">Esc</span>
        {onManage ? (
          <button type="button" className="vp-manage" onClick={onManage}>
            Quản lý ›
          </button>
        ) : null}
      </div>
    </>
  );

  if (inline) {
    return (
      <div className="vp vp-inline" role="listbox" aria-label={ariaLabel}>
        {body}
      </div>
    );
  }

  const trigger = (
    <button
      type="button"
      ref={triggerRef}
      className={`vp-trigger${open ? " is-open" : ""}`}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
      onClick={() => (open ? close() : openPicker())}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      }}
    >
      <span className="vp-trigger-gender">{current ? (current.gender === "male" ? "♂" : "♀") : ""}</span>
      <span className="vp-trigger-name">{current?.name ?? value ?? "Chọn giọng…"}</span>
      {current && favorites.has(current.id) ? <span className="vp-trigger-fav">★</span> : null}
      <span className="vp-trigger-spacer" />
      {current ? (
        <span className={`vp-eng ${current.kind === "cloud" ? "is-cloud" : "is-offline"}`}>
          {shortEngineLabel(current.engineLabel)}
        </span>
      ) : null}
      <span className="vp-trigger-caret">{open ? "▴" : "▾"}</span>
    </button>
  );

  return (
    <div className="vp-root">
      {trigger}
      {open
        ? createPortal(
            <div
              ref={popRef}
              className="vp vp-pop"
              style={{ left: pos.left, top: pos.top, width: POPOVER_WIDTH }}
              role="listbox"
              aria-label={ariaLabel}
              onKeyDown={onKeyDown}
            >
              {body}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Ô chọn giọng — bọc `React.memo`. */
export const VoicePicker = memo(VoicePickerInner);

export default VoicePicker;
