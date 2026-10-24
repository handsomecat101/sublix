import { memo } from "react";
import "./ui.css";

/**
 * SplitButton — nút tách đôi: nút chính + nút mũi tên mở menu.
 *
 * Dùng cho hành động chính + nhóm hành động phụ (ví dụ "▶ Chạy 3 bước đã bật"
 * và "▾ chạy riêng: phụ đề · dịch · lồng tiếng · vùng In–Out").
 *
 * Menu do bên gọi quản lý (state `menuOpen` + `onToggleMenu`) → component này
 * không cần biết nội dung menu, giữ cho file < 120 dòng và dễ tái dùng.
 */
export interface SplitButtonProps {
  /** Nhãn nút chính (ví dụ "▶ Chạy 3 bước đã bật"). */
  label: string;
  /** Hành động khi bấm nút chính. */
  onPrimary: () => void;
  /** Bật/tắt menu (thường nối vào state của panel). */
  onToggleMenu: () => void;
  /** Menu đang mở (để set `aria-expanded`). */
  menuOpen?: boolean;
  /** Khoá cả 2 nút. */
  disabled?: boolean;
  /** Tooltip nút chính. */
  title?: string;
  /** Tooltip nút mũi tên. */
  menuTitle?: string;
  /** Nhãn riêng cho nút mũi tên (mặc định "▾"). */
  menuLabel?: string;
  /** Class CSS bổ sung cho wrapper. */
  className?: string;
}

/**
 * SplitButton — bọc `React.memo`.
 */
export const SplitButton = memo(function SplitButton({
  label,
  onPrimary,
  onToggleMenu,
  menuOpen = false,
  disabled = false,
  title,
  menuTitle,
  menuLabel = "▾",
  className,
}: SplitButtonProps) {
  return (
    <div className={`ui-split${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className="ui-split-main"
        disabled={disabled}
        title={title}
        onClick={onPrimary}
      >
        {label}
      </button>
      <button
        type="button"
        className="ui-split-caret"
        disabled={disabled}
        title={menuTitle}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        {menuLabel}
      </button>
    </div>
  );
});

export default SplitButton;
