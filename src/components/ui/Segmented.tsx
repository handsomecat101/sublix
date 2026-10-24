import { memo } from "react";
import "./ui.css";

/**
 * Segmented — control phân đoạn (nhóm nút chọn 1 trong N).
 *
 * Dùng cho các lựa chọn nhỏ, khép kín: số người nói, bộ giọng đọc, chế độ...
 * Mũi tên "▾" của control chọn hộp thoại vẫn thuộc về component khác.
 *
 * Ràng buộc hiệu năng (Note 1 — AGENT_CHAT): bọc `React.memo` để không re-render
 * khi props không đổi. `options` nên là hằng số ngoài component (hoặc `useMemo`).
 */
export interface SegmentedOption<T extends string> {
  /** Giá trị trả về khi chọn. */
  value: T;
  /** Nhãn hiển thị. */
  label: string;
  /** Tooltip giải thích (mặc định = label). */
  title?: string;
  /** Khoá lựa chọn này. */
  disabled?: boolean;
}

/** Props của `Segmented`. */
export interface SegmentedProps<T extends string> {
  /** Danh sách lựa chọn. */
  options: readonly SegmentedOption<T>[];
  /** Lựa chọn đang active. */
  value: T;
  /** Callback khi đổi lựa chọn. */
  onChange: (value: T) => void;
  /** Class CSS bổ sung. */
  className?: string;
  /** Nhãn trợ năng (a11y). */
  ariaLabel?: string;
}

function SegmentedInner<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      className={`ui-seg${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={active ? "on" : ""}
            disabled={option.disabled}
            title={option.title ?? option.label}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** `Segmented` đã bọc `React.memo` (giữ nguyên generic). */
export const Segmented = memo(SegmentedInner) as typeof SegmentedInner;

export default Segmented;
