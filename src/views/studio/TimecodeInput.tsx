import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  formatTimecodeDisplay,
  formatTimecodeInput,
  parseTimecode,
} from "../../lib/timeline/timecode";

/**
 * TimecodeInput — ô nhập / hiển thị timecode kiểu Premiere.
 *
 * CÁCH DÙNG:
 * - Bấm vào timecode → mở ô nhập (điền sẵn `HH:MM:SS.mmm`).
 * - Enter → parse rồi gọi `onSeek(giây)`.
 * - Esc → huỷ, không nhảy.
 * - Sai định dạng → viền đỏ, KHÔNG nhảy.
 *
 * ⚠️ THIẾT KẾ (đã sửa sau review): component KHÔNG nhận prop `seconds` đổi
 * liên tục. Lý do: prop đổi mỗi lần `onTimeUpdate` (>= 100ms) sẽ ép React
 * render lại cây component, đồng thời React VÀ code ghi DOM cùng quản lý
 * MỘT text node → dễ lệch/flicker.
 * Thay vào đó:
 * - `displayRef` trỏ tới node hiển thị; **file cha** giữ quyền ghi
 *   `textContent` trực tiếp (đường 60fps sẵn có của timeline).
 * - `getSeconds()` là hàm ổn định, chỉ đọc giá trị hiện tại khi mở ô nhập.
 *
 * Ràng buộc hiệu năng (xem `agent-team/ISSUE_LOG.md` — BUG-060):
 * - Component bọc `React.memo`.
 * - Không `setState` ở 60fps.
 */
export interface TimecodeInputProps {
  /** Ref tới node hiển thị timecode — file cha ghi `textContent` trực tiếp. */
  displayRef: RefObject<HTMLSpanElement | null>;
  /** Đọc mốc thời gian hiện tại (hàm ổn định) khi mở ô nhập. */
  getSeconds: () => number;
  /** Callback seek — nhận số giây đã parse hợp lệ. */
  onSeek: (sec: number) => void;
  /** Số frame/giây — dùng khi người dùng gõ timecode dạng `hh:mm:ss:ff`. */
  fps?: number;
  /** Class CSS tuỳ chọn cho phần tử gốc. */
  className?: string;
  /** Khoá thao tác (ví dụ khi đang xử lý). */
  disabled?: boolean;
  /** Tooltip tuỳ chọn. */
  title?: string;
}

/**
 * TimecodeInput — bọc `React.memo`, functional component.
 */
export const TimecodeInput = memo(function TimecodeInput({
  displayRef,
  getSeconds,
  onSeek,
  fps,
  className,
  disabled,
  title,
}: TimecodeInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  /** Ô nhập — dùng để focus + select khi mở. */
  const inputRef = useRef<HTMLInputElement>(null);

  // Chữ hiển thị do file cha ghi trực tiếp vào `displayRef`.
  // Effect này chỉ chạy lúc mount / khi thoát chế độ nhập → KHÔNG ghi đè mỗi frame.
  useEffect(() => {
    if (editing) return;
    const el = displayRef.current;
    if (el && el.textContent === "") {
      el.textContent = formatTimecodeDisplay(getSeconds());
    }
  }, [displayRef, editing, getSeconds]);

  // Mở ô nhập → focus + bôi đen toàn bộ nội dung.
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const beginEdit = useCallback(() => {
    if (disabled) return;
    setDraft(formatTimecodeInput(getSeconds()));
    setInvalid(false);
    setEditing(true);
  }, [disabled, getSeconds]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setInvalid(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const parsed = parseTimecode(draft, fps);
        if (parsed === null) {
          // Sai định dạng → viền đỏ, KHÔNG nhảy.
          setInvalid(true);
          return;
        }
        setInvalid(false);
        setEditing(false);
        onSeek(parsed);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelEdit();
      }
    },
    [cancelEdit, draft, fps, onSeek],
  );

  const rootStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };

  if (editing) {
    return (
      <span className={className} style={rootStyle}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (invalid) setInvalid(false);
          }}
          onKeyDown={handleKeyDown}
          onBlur={cancelEdit}
          spellCheck={false}
          autoComplete="off"
          aria-label="Nhập timecode"
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 12,
            padding: "2px 6px",
            width: 104,
            color: "var(--t1, #f6f0e4)",
            background: "var(--bg, #12100e)",
            border: `1px solid ${invalid ? "#ef4444" : "var(--ac, #e8a33d)"}`,
            borderRadius: 4,
            outline: "none",
          }}
        />
      </span>
    );
  }

  return (
    <span className={className} style={rootStyle}>
      <button
        type="button"
        onClick={beginEdit}
        disabled={disabled}
        title={title ?? "Bấm để nhập timecode (Enter để nhảy, Esc để huỷ)"}
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.4,
          padding: "2px 6px",
          color: "var(--t1, #f6f0e4)",
          background: "transparent",
          border: "1px solid var(--line, rgba(244, 236, 222, 0.1))",
          borderRadius: 4,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span ref={displayRef} />
      </button>
    </span>
  );
});

export default TimecodeInput;
