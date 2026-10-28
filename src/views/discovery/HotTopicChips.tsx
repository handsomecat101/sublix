//! TSK-V015-DISC-UI — hàng chip "🔥 Xu hướng Douyin".
//!
//! - 50 chip, cuộn ngang; lăn chuột (`deltaY`) ⇒ cuộn ngang.
//! - Mép phải mờ 48 px khi còn chip.
//! - Bấm chip ⇒ điền **đúng chữ chip** vào ô tìm + tìm ở nguồn đang chọn.
//! - Lỗi nguồn ⇒ **ẩn cả hàng chip**, hiện 1 dòng mờ + nút ↻ (không chặn phần khác).
//!
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (mục 3).

import { useRef } from "react";

import type { HotWord } from "../../lib/tauri";
import { formatCountVi, formatAge } from "./discoveryModel";

export interface HotTopicChipsProps {
  words: HotWord[];
  loading: boolean;
  error: boolean;
  /** Từ khoá đang gõ — chip sáng cam tới khi đổi từ khoá. */
  keyword: string;
  /** Tuổi cache (phút) để hiện "12 phút trước ↻". */
  ageMinutes: number | null;
  onPick: (word: string) => void;
  onReload: () => void;
}

/** Nhãn Douyin (`label`) → chữ hiển thị. */
function labelText(label: string | null): { text: string; kind: string } | null {
  switch (label) {
    case "1":
      return { text: "Mới", kind: "dsc-chip-lbl-ok" };
    case "3":
      return { text: "Nóng", kind: "dsc-chip-lbl-dang" };
    case "8":
      return { text: "Bùng", kind: "dsc-chip-lbl-ac" };
    default:
      return null;
  }
}



export function HotTopicChips({
  words,
  loading,
  error,
  keyword,
  ageMinutes,
  onPick,
  onReload,
}: HotTopicChipsProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  if (error) {
    return (
      <div className="dsc-hot-row dsc-hot-row-err">
        <span>Không lấy được xu hướng Douyin</span>
        <button type="button" className="dsc-link-btn" onClick={onReload}>
          ↻ Thử lại
        </button>
      </div>
    );
  }

  if (loading && words.length === 0) {
    return (
      <div className="dsc-hot-row">
        <span className="dsc-chip-skeleton" />
        <span className="dsc-chip-skeleton" />
        <span className="dsc-chip-skeleton" />
      </div>
    );
  }

  if (words.length === 0) return null;

  /** Lăn chuột dọc ⇒ cuộn ngang (hàng chip 1 tầng). */
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = rowRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  };

  const active = keyword.trim();

  return (
    <div className="dsc-hot-wrap">
      <div className="dsc-hot-row" ref={rowRef} onWheel={onWheel}>
        <span className="dsc-hot-title">🔥 Xu hướng Douyin</span>
        <span className="dsc-hot-count">{words.length}</span>
        {words.map((word, index) => {
          const label = labelText(word.label);
          const hot = word.hotValue !== null ? formatCountVi(word.hotValue) : "";
          const isActive = active.length > 0 && active === word.word;
          return (
            <button
              key={`${word.word}-${index}`}
              type="button"
              className={`dsc-chip${isActive ? " dsc-chip-on" : ""}`}
              title={`${word.word}${word.hotValue ? ` · ${word.hotValue.toLocaleString("vi-VN")} điểm nhiệt` : ""}`}
              onClick={() => onPick(word.word)}
            >
              <span className={`dsc-chip-rank${index < 3 ? " dsc-chip-rank-top" : ""}`}>{index + 1}</span>
              <span className="dsc-chip-text">{word.word}</span>
              {label && <span className={`dsc-chip-lbl ${label.kind}`}>{label.text}</span>}
              {hot && <span className="dsc-chip-hot">{hot}</span>}
            </button>
          );
        })}
      </div>
      <div className="dsc-hot-side">
        {ageMinutes !== null && <span className="dsc-cache-age">{formatAge(ageMinutes)}</span>}
        <button type="button" className="dsc-link-btn" onClick={onReload} title="Tải lại xu hướng">
          ↻
        </button>
      </div>
    </div>
  );
}

export default HotTopicChips;
