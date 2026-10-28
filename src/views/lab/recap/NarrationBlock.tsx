import React, { memo, useState } from "react";
import type { RecapItem } from "../labModel";
import { estimateSeconds, formatDur } from "../labModel";
import { RewritePopover } from "./RewritePopover";

interface NarrationBlockProps {
  item: RecapItem;
  index: number;
  isSelected: boolean;
  isViolation: boolean;
  violationMessage?: string;
  onSelect: () => void;
  onChangeText: (text: string) => void;
  onToggleOst: () => void;
  onDelete: () => void;
}

export const NarrationBlock: React.FC<NarrationBlockProps> = memo(function NarrationBlock({
  item,
  index,
  isSelected,
  isViolation,
  violationMessage,
  onSelect,
  onChangeText,
  onToggleOst,
  onDelete,
}) {
  const [showRewrite, setShowRewrite] = useState<boolean>(false);
  const durSec = item.keepOriginal ? item.end - item.start : (item.ttsSecs ?? estimateSeconds(item.narration));

  return (
    <div
      className={`lab-block-item${item.keepOriginal ? " ost" : ""}${
        isSelected ? " active" : ""
      }${isViolation ? " violation" : ""}`}
      onClick={onSelect}
      style={{ position: "relative" }}
    >
      <span style={{ color: "var(--t4)", cursor: "grab", textAlign: "center", userSelect: "none" }}>
        ⠿
      </span>

      <span
        style={{
          fontSize: "11px",
          fontWeight: 800,
          color: item.keepOriginal ? "var(--step-sub)" : "var(--t4)",
        }}
      >
        #{index + 1}
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        {item.keepOriginal ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "12px", color: "var(--step-sub)", fontWeight: 700 }}>
            <span>🔊 THOẠI GỐC (OST)</span>
            <span style={{ fontSize: "11px", color: "var(--t4)", fontWeight: 500 }}>
              P{item.sourceIdx + 1} · {formatDur(item.start)} → {formatDur(item.end)}
            </span>
          </div>
        ) : null}

        <div
          contentEditable={!item.keepOriginal}
          suppressContentEditableWarning
          className="lab-block-text"
          style={{
            fontStyle: item.keepOriginal ? "italic" : "normal",
            color: item.keepOriginal ? "#bae6fd" : "var(--t1)",
          }}
          onBlur={(e) => {
            if (!item.keepOriginal) {
              onChangeText(e.currentTarget.textContent || "");
            }
          }}
        >
          {item.narration}
        </div>

        {item.picture && (
          <span style={{ fontSize: "11.5px", color: "var(--t4)" }}>
            🎬 Cảnh: {item.picture}
          </span>
        )}

        {isViolation && violationMessage && (
          <span style={{ fontSize: "11px", color: "var(--warn-txt)", fontWeight: 600 }}>
            ⚠ {violationMessage}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <span className="lab-block-dur">~{durSec.toFixed(1)}s</span>

        <div style={{ display: "flex", gap: 4 }}>
          {!item.keepOriginal && (
            <button
              type="button"
              className="lab-btn-secondary"
              style={{ padding: "2px 6px", fontSize: "10px" }}
              title="Viết lại đoạn bằng AI (R)"
              onClick={(e) => {
                e.stopPropagation();
                setShowRewrite(true);
              }}
            >
              ✦ Sửa
            </button>
          )}

          <button
            type="button"
            className="lab-btn-secondary"
            style={{
              padding: "2px 6px",
              fontSize: "10px",
              color: item.keepOriginal ? "var(--ac-txt)" : "var(--step-sub)",
            }}
            title={item.keepOriginal ? "Chuyển thành lời bình" : "Chuyển thành thoại gốc (G)"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleOst();
            }}
          >
            {item.keepOriginal ? "Lời bình" : "🔊 OST"}
          </button>

          <button
            type="button"
            className="lab-banner-close"
            style={{ padding: "2px 4px", fontSize: "11px" }}
            title="Xoá đoạn này"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {showRewrite && (
        <RewritePopover
          originalText={item.narration}
          onApply={(newText) => {
            onChangeText(newText);
            setShowRewrite(false);
          }}
          onClose={() => setShowRewrite(false)}
        />
      )}
    </div>
  );
});
