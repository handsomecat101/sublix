import React from "react";
import { ratioToMinutes } from "../labModel";

interface OriginalRatioSliderProps {
  ratio: number; // 0.0 - 0.6
  onChange: (ratio: number) => void;
  targetDurationSec: number;
}

export const OriginalRatioSlider: React.FC<OriginalRatioSliderProps> = ({
  ratio,
  onChange,
  targetDurationSec,
}) => {
  const percent = Math.round(ratio * 100);
  const { keptMinStr } = ratioToMinutes(ratio, targetDurationSec);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)" }}>
          Tỷ lệ tiếng game gốc (OST)
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--ac-txt)", fontFamily: "monospace" }}>
            {percent}%
          </span>
          <span style={{ fontSize: "11px", color: "var(--t4)" }}>
            (≈ {keptMinStr} thoại gốc)
          </span>
        </div>
      </div>

      <div style={{ position: "relative", padding: "6px 0" }}>
        {/* Vùng khuyến nghị 20% - 40% */}
        <div
          style={{
            position: "absolute",
            left: `${(20 / 60) * 100}%`,
            width: `${(20 / 60) * 100}%`,
            height: "8px",
            top: "14px",
            background: "rgba(74, 222, 128, 0.15)",
            borderLeft: "1.5px dashed var(--ok)",
            borderRight: "1.5px dashed var(--ok)",
            borderRadius: "2px",
            pointerEvents: "none",
          }}
          title="Vùng tỷ lệ vàng khuyến nghị cho recap game (20% - 40%)"
        />

        <input
          type="range"
          min={0}
          max={60}
          step={5}
          value={percent}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          style={{
            width: "100%",
            accentColor: "var(--ac)",
            cursor: "pointer",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--t4)" }}>
        <span>0% (Chỉ lời bình)</span>
        <span style={{ color: "var(--ok-txt)" }}>▮ 20–40% hợp kênh recap game</span>
        <span>60% (Nhiều cutscene)</span>
      </div>
    </div>
  );
};
