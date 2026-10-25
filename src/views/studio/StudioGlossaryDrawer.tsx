import { memo } from "react";
import { GlossaryEditor } from "../../components/glossary/GlossaryEditor";
import { formatDuration } from "../../lib/timeline/estimate";
import type { Glossary, GlossarySuggestion } from "../../lib/types";

/**
 * StudioGlossaryDrawer — hộp thoại bảng **thuật ngữ + xưng hô** trong Studio.
 *
 * - Mở từ nút "📖 Thuật ngữ & xưng hô (N)" ở bước "Dịch".
 * - Không có nút "Lưu": mọi thay đổi được lưu ngay (debounce ~400ms) qua
 *   `onChange` → `glossary_set` của file cha.
 * - "Gợi ý từ kịch bản" gọi `onSuggest` (backend `glossary_suggest`) và CHỈ hiện
 *   gợi ý — KHÔNG tự ghi vào bảng.
 */
export interface StudioGlossaryDrawerProps {
  /** Bảng hiện tại. */
  value: Glossary;
  /** Đóng hộp thoại. */
  onClose: () => void;
  /** Bảng thay đổi → file cha lưu ngay (debounce). */
  onChange: (next: Glossary) => void;
  /** Chạy gợi ý từ kịch bản (trả về gợi ý hoặc null). */
  onSuggest: () => Promise<GlossarySuggestion | null>;
  /** Đang chạy gợi ý. */
  suggesting: boolean;
  /** Ước tính giây cho lượt "đọc hiểu" (null = chưa có). */
  suggestEstimateSec?: number | null;
  /** Nút Lưu (lưu ngay, giống hành vi auto-save). */
  onSave: (next: Glossary) => void;
}

function StudioGlossaryDrawerInner({
  value,
  onClose,
  onChange,
  onSuggest,
  suggesting,
  suggestEstimateSec = null,
  onSave,
}: StudioGlossaryDrawerProps) {
  return (
    <div
      className="spp-glossary-drawer-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="spp-glossary-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Bảng thuật ngữ và xưng hô"
      >
        <header className="spp-glossary-drawer-head">
          <span className="spp-glossary-drawer-title">📖 Thuật ngữ &amp; xưng hô</span>
          <button
            type="button"
            className="spp-glossary-drawer-close"
            onClick={onClose}
            title="Đóng"
          >
            ✕
          </button>
        </header>
        {suggesting ? (
          <div className="spp-glossary-drawer-progress">
            <span className="spp-glossary-drawer-spinner" aria-hidden="true" />
            <span>
              Đang đọc hiểu kịch bản để gợi ý
              {suggestEstimateSec && suggestEstimateSec > 0
                ? ` — ước tính ~${formatDuration(suggestEstimateSec)}`
                : "…"}
            </span>
          </div>
        ) : null}
        <div className="spp-glossary-drawer-body">
          <GlossaryEditor
            value={value}
            onChange={onChange}
            onSuggest={onSuggest}
            onSave={onSave}
            suggesting={suggesting}
          />
        </div>
        <footer className="spp-glossary-drawer-foot">
          Tự động lưu khi thay đổi — không cần bấm “Lưu”.
        </footer>
      </div>
    </div>
  );
}

/** Drawer bảng thuật ngữ — bọc `React.memo`. */
export const StudioGlossaryDrawer = memo(StudioGlossaryDrawerInner);

export default StudioGlossaryDrawer;
