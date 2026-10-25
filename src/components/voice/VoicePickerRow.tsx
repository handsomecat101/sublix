import { memo } from "react";
import { highlightParts, shortEngineLabel } from "./voicePickerModel";
import type { VoicePickerItem } from "./voicePickerModel";

/** Một vai đang dùng giọng này (chip "● Người dẫn"). */
export interface VoiceUsedBy {
  name: string;
  color: string;
}

/** Trạng thái phát mẫu của 1 giọng. */
export type VoicePreviewState = "loading" | "playing" | null;

export interface VoicePickerRowProps {
  item: VoicePickerItem;
  /** Đang là giọng của vai này. */
  isCurrent: boolean;
  /** Dòng đang được chọn bằng bàn phím. */
  isActive: boolean;
  isFavorite: boolean;
  preview: VoicePreviewState;
  /** Các vai KHÁC đang dùng giọng này (mảng ổn định — không tạo inline). */
  usedBy: ReadonlyArray<VoiceUsedBy>;
  /** Từ khoá tìm (để tô phần khớp). */
  query: string;
  /** Hiện badge engine ở từng dòng (Cài đặt — variant inline). */
  showEngineBadge: boolean;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

function VoicePickerRowInner({
  item,
  isCurrent,
  isActive,
  isFavorite,
  preview,
  usedBy,
  query,
  showEngineBadge,
  onSelect,
  onPreview,
  onToggleFavorite,
}: VoicePickerRowProps) {
  const parts = highlightParts(item.name, query);
  const cls = [
    "vp-row",
    isCurrent ? "is-current" : "",
    isActive ? "is-active" : "",
    preview === "playing" ? "is-playing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      role="option"
      aria-selected={isCurrent}
      onClick={() => onSelect(item.id)}
      title={item.name}
    >
      <span className="vp-row-check">{isCurrent ? "✓" : ""}</span>
      <span className="vp-row-gender">{item.gender === "male" ? "♂" : "♀"}</span>
      <span className="vp-row-name">
        {parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
      </span>
      <span className="vp-row-spacer" />
      {showEngineBadge ? (
        <span className={`vp-eng ${item.kind === "cloud" ? "is-cloud" : "is-offline"}`}>
          {shortEngineLabel(item.engineLabel)}
        </span>
      ) : null}
      {usedBy.length > 0 ? (
        <span className="vp-row-used" title="Giọng đang dùng ở vai khác">
          {usedBy.slice(0, 2).map((u, i) => (
            <span key={`${u.name}-${i}`}>
              <i style={{ background: u.color }} />
              {u.name}
            </span>
          ))}
        </span>
      ) : null}
      {preview === "loading" ? (
        <span className="vp-row-gen">
          <span className="vp-spin" /> đang tạo mẫu…
        </span>
      ) : (
        <button
          type="button"
          className="vp-icon-btn"
          title="Nghe mẫu giọng (không đổi giọng của vai)"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(item.id);
          }}
        >
          {preview === "playing" ? "■" : "▶"}
        </button>
      )}
      <button
        type="button"
        className={`vp-icon-btn vp-star${isFavorite ? " is-on" : ""}`}
        title={isFavorite ? "Bỏ ghim" : "Ghim giọng này (★)"}
        aria-pressed={isFavorite}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(item.id);
        }}
      >
        {isFavorite ? "★" : "☆"}
      </button>
    </div>
  );
}

/** 1 dòng giọng — bọc `React.memo` (props primitive + mảng ổn định). */
export const VoicePickerRow = memo(VoicePickerRowInner);

export default VoicePickerRow;
