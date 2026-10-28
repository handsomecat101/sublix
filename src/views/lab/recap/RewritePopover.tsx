import React, { useState } from "react";
import { labApi } from "../labApi";

interface RewritePopoverProps {
  originalText: string;
  onApply: (newText: string) => void;
  onClose: () => void;
}

const QUICK_CHIPS = ["Ngắn hơn", "Kịch tính hơn", "Thêm câu nối", "Dễ hiểu hơn"];

export const RewritePopover: React.FC<RewritePopoverProps> = ({
  originalText,
  onApply,
  onClose,
}) => {
  const [selectedChip, setSelectedChip] = useState<string>("Kịch tính hơn");
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [previewText, setPreviewText] = useState<string>(originalText);
  const [loading, setLoading] = useState<boolean>(false);

  const handleRewrite = async (chip = selectedChip) => {
    setLoading(true);
    try {
      const res = await labApi.rewriteBlock(originalText, chip, customPrompt);
      setPreviewText(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        zIndex: 50,
        width: "420px",
        background: "var(--bg-top, #16120e)",
        border: "1px solid var(--ac-br, #e8a33d)",
        borderRadius: "10px",
        boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        marginTop: "6px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--ac-txt)" }}>
          ✦ Viết lại đoạn bằng AI
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="lab-btn-secondary"
            style={{
              padding: "3px 8px",
              fontSize: "11px",
              background: selectedChip === chip ? "var(--ac-soft)" : "transparent",
              color: selectedChip === chip ? "var(--ac-txt)" : "var(--t3)",
              borderColor: selectedChip === chip ? "var(--ac-br)" : "var(--line)",
            }}
            onClick={() => {
              setSelectedChip(chip);
              handleRewrite(chip);
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Yêu cầu thêm (vd: nhắc tên Kael, giọng trầm buồn)..."
        value={customPrompt}
        onChange={(e) => setCustomPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleRewrite();
          }
        }}
        style={{
          padding: "6px 10px",
          borderRadius: "6px",
          background: "rgba(0,0,0,0.3)",
          border: "1px solid var(--line)",
          color: "var(--t1)",
          fontSize: "12px",
          outline: "none",
        }}
      />

      <div
        style={{
          padding: "8px 10px",
          borderRadius: "6px",
          background: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.04)",
          fontSize: "12.5px",
          color: loading ? "var(--t4)" : "var(--t1)",
          lineHeight: 1.45,
          minHeight: "44px",
        }}
      >
        {loading ? "Đang viết lại theo phong cách mới..." : previewText}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button
          type="button"
          className="lab-btn-secondary"
          style={{ padding: "4px 10px", fontSize: "11.5px" }}
          onClick={() => handleRewrite()}
          disabled={loading}
        >
          ↻ Thử lại
        </button>
        <button
          type="button"
          className="lab-btn-primary"
          style={{ padding: "4px 12px", fontSize: "11.5px" }}
          onClick={() => onApply(previewText)}
          disabled={loading}
        >
          Dùng bản này (Enter)
        </button>
      </div>
    </div>
  );
};
