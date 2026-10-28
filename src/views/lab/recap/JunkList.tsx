import React from "react";
import type { MockJunkSegment } from "../labMock";

interface JunkListProps {
  junkSegments: MockJunkSegment[];
  onToggleRestore: (id: number) => void;
}

export const JunkList: React.FC<JunkListProps> = ({
  junkSegments,
  onToggleRestore,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
          Đoạn đã lọc bỏ ({junkSegments.filter((j) => !j.restored).length} đoạn rác)
        </h3>
        <span style={{ fontSize: "11px", color: "var(--t4)" }}>Bấm khôi phục nếu muốn lấy lại cảnh</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {junkSegments.map((junk) => (
          <div
            key={junk.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderRadius: "8px",
              background: junk.restored ? "rgba(74, 222, 128, 0.05)" : "rgba(239, 68, 68, 0.04)",
              border: `1px solid ${
                junk.restored ? "rgba(74, 222, 128, 0.2)" : "rgba(239, 68, 68, 0.15)"
              }`,
              fontSize: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  background: junk.restored ? "var(--ok-soft)" : "rgba(239, 68, 68, 0.15)",
                  color: junk.restored ? "var(--ok-txt)" : "var(--dang-txt)",
                  fontWeight: 700,
                }}
              >
                {junk.type}
              </span>
              <span style={{ color: "var(--t2)" }}>{junk.timeRange}</span>
              <span style={{ color: "var(--t4)" }}>({junk.reason})</span>
            </div>

            <button
              type="button"
              className="lab-btn-secondary"
              style={{ padding: "3px 8px", fontSize: "11px" }}
              onClick={() => onToggleRestore(junk.id)}
            >
              {junk.restored ? "↶ Hoàn tác" : "Khôi phục"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
