import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./ui.css";

/**
 * ContextMenu — menu ngữ cảnh (chuột phải) dùng chung.
 *
 * Mở theo toạ độ chuột, tự **lật** khi sát mép phải/dưới màn hình, đóng khi:
 * bấm ra ngoài, bấm vào một mục, hoặc nhấn Esc.
 *
 * Menu được vẽ trong `position: fixed` — không cần tính toán offset với
 * container (phòng khi timeline cuộn).
 */
export interface ContextMenuItem {
  /** Id mục (dùng làm key). */
  id: string;
  /** Nhãn hiển thị. */
  label: string;
  /** Gợi ý phụ hiển thị bên phải. */
  hint?: string;
  /** Mục nguy hiểm (xoá) → tô đỏ. */
  danger?: boolean;
  /** Khoá mục. */
  disabled?: boolean;
  /** Vạch ngăn cách phía trên mục này. */
  separatorBefore?: boolean;
  /** Hành động khi chọn. */
  onSelect: () => void;
}

/** Props của `ContextMenu`. */
export interface ContextMenuProps {
  /** Toạ độ mở menu (px, tọa độ client). */
  x: number;
  /** Toạ độ mở menu (px, tọa độ client). */
  y: number;
  /** Các mục của menu. */
  items: readonly ContextMenuItem[];
  /** Đóng menu (bấm ra ngoài / Esc / chọn mục). */
  onClose: () => void;
  /** Class CSS bổ sung. */
  className?: string;
}

/** Lề an toàn (px) giữ menu không dính mép màn hình. */
const EDGE_GAP = 8;

/**
 * ContextMenu — bọc `React.memo`.
 */
export const ContextMenu = memo(function ContextMenu({
  x,
  y,
  items,
  onClose,
  className,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Lật menu khi sát mép phải / mép dưới màn hình.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - EDGE_GAP;
    const maxTop = window.innerHeight - rect.height - EDGE_GAP;
    setPos({
      left: Math.max(EDGE_GAP, Math.min(x, maxLeft)),
      top: Math.max(EDGE_GAP, Math.min(y, maxTop)),
    });
  }, [x, y, items.length]);

  // Đóng khi bấm ra ngoài hoặc nhấn Esc.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={`ui-ctx-menu${className ? ` ${className}` : ""}`}
      style={{ left: pos.left, top: pos.top }}
      role="menu"
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.separatorBefore ? <div className="ui-ctx-sep" /> : null}
          <button
            type="button"
            role="menuitem"
            className={`ui-ctx-item${item.danger ? " danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
          >
            <span className="ui-ctx-label">{item.label}</span>
            {item.hint ? <span className="ui-ctx-hint">{item.hint}</span> : null}
          </button>
        </div>
      ))}
    </div>
  );
});

export default ContextMenu;
