import React from "react";
import type { MockVideoSource } from "../labMock";
import { formatDur, processingEstimate } from "../labModel";
import { OriginalRatioSlider } from "./OriginalRatioSlider";

interface SourceStepProps {
  sources: MockVideoSource[];
  onAddSource: () => void;
  onRemoveSource: (id: string) => void;
  onMoveSource: (fromIdx: number, toIdx: number) => void;
  gameName: string;
  onChangeGameName: (name: string) => void;
  webSearch: boolean;
  onChangeWebSearch: (val: boolean) => void;
  targetMinutes: number;
  onChangeTargetMinutes: (mins: number) => void;
  originalRatio: number;
  onChangeOriginalRatio: (ratio: number) => void;
  voiceName: string;
}

export const SourceStep: React.FC<SourceStepProps> = ({
  sources,
  onAddSource,
  onRemoveSource,
  onMoveSource: _onMoveSource,
  gameName,
  onChangeGameName,
  webSearch,
  onChangeWebSearch,
  targetMinutes,
  onChangeTargetMinutes,
  originalRatio,
  onChangeOriginalRatio,
  voiceName,
}) => {
  const totalInputSec = sources.reduce((sum, s) => sum + s.durationSec, 0);
  const estimate = processingEstimate(totalInputSec);

  return (
    <div className="lab-source-layout">
      {/* CỘT TRÁI: DANH SÁCH VIDEO NGUỒN */}
      <div className="lab-source-left">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
              Video gameplay nguồn ({sources.length} file)
            </h2>
            <span style={{ fontSize: "12px", color: "var(--t4)" }}>
              Thứ tự từ trên xuống dưới là thứ tự diễn biến cốt truyện
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="lab-btn-secondary" onClick={onAddSource}>
              ＋ Thêm video
            </button>
          </div>
        </div>

        <div className="lab-source-list">
          {sources.map((src, idx) => (
            <div key={src.id} className="lab-source-card">
              <span style={{ color: "var(--t4)", cursor: "grab", textAlign: "center" }}>⠿</span>
              <span style={{ fontWeight: 800, color: "var(--ac-txt)", fontSize: "12px" }}>
                #{idx + 1}
              </span>
              <div className="lab-source-thumb">
                <span>{src.resolution}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="lab-source-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {src.name}
                  </span>
                  {src.hasSubtitles && (
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        background: "rgba(74,222,128,0.12)",
                        color: "var(--ok-txt)",
                        border: "1px solid rgba(74,222,128,0.3)",
                      }}
                    >
                      Đã có phụ đề
                    </span>
                  )}
                </div>
                <span className="lab-source-meta">
                  {formatDur(src.durationSec)} · {(src.sizeMb / 1024).toFixed(1)} GB · {src.fps} fps
                </span>
              </div>
              <button
                type="button"
                className="lab-banner-close"
                onClick={() => onRemoveSource(src.id)}
                title="Xoá video"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* ƯỚC LƯỢNG THỜI GIAN XỬ LÝ */}
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            background:
              estimate.level === "danger"
                ? "rgba(239, 68, 68, 0.08)"
                : estimate.level === "warn"
                ? "rgba(234, 179, 8, 0.08)"
                : "rgba(255, 255, 255, 0.03)",
            border: `1px solid ${
              estimate.level === "danger"
                ? "var(--dang-br, rgba(239, 68, 68, 0.3))"
                : estimate.level === "warn"
                ? "var(--warn-br, rgba(234, 179, 8, 0.3))"
                : "var(--line)"
            }`,
            fontSize: "12.5px",
            color:
              estimate.level === "danger"
                ? "var(--dang-txt)"
                : estimate.level === "warn"
                ? "var(--warn-txt)"
                : "var(--t3)",
          }}
        >
          ⏱ <strong>Tổng thời lượng:</strong> {formatDur(totalInputSec)} — {estimate.summaryVi}
        </div>
      </div>

      {/* CỘT PHẢI: 5 TUỲ CHỌN QUYẾT ĐỊNH */}
      <div className="lab-source-right">
        <h3 style={{ fontSize: "15px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
          Tuỳ chọn dựng kịch bản
        </h3>

        {/* 1. Tên Game & Tra cứu web */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--t2)" }}>
            Tên tựa game
          </label>
          <input
            type="text"
            value={gameName}
            onChange={(e) => onChangeGameName(e.target.value)}
            placeholder="Ví dụ: Elden Ring, Black Myth Wukong..."
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              background: "var(--bg-card)",
              border: "1px solid var(--line)",
              color: "var(--t1)",
              fontSize: "13.5px",
              outline: "none",
            }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "12px", color: "var(--t3)", marginTop: 4, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={webSearch}
              onChange={(e) => onChangeWebSearch(e.target.checked)}
              style={{ accentColor: "var(--ac)" }}
            />
            <span>Tra cứu bối cảnh & cốt truyện trên mạng (Tavily Search)</span>
          </label>
        </div>

        {/* 2. Độ dài đích */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--t2)" }}>
            Độ dài video đích
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {[5, 10, 15, 20].map((mins) => (
              <button
                key={mins}
                type="button"
                className="lab-btn-secondary"
                style={{
                  justifyContent: "center",
                  fontWeight: targetMinutes === mins ? 800 : 500,
                  borderColor: targetMinutes === mins ? "var(--ac-br)" : "var(--line)",
                  background: targetMinutes === mins ? "var(--ac-soft)" : "var(--bg-card)",
                  color: targetMinutes === mins ? "var(--ac-txt)" : "var(--t2)",
                }}
                onClick={() => onChangeTargetMinutes(mins)}
              >
                {mins} phút
              </button>
            ))}
          </div>
        </div>

        {/* 3. Giọng đọc */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--t2)" }}>
            Giọng đọc thuyết minh
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderRadius: "8px",
              background: "var(--bg-card)",
              border: "1px solid var(--line)",
              fontSize: "13px",
            }}
          >
            <span>🎙 {voiceName} (Tiếng Việt truyền cảm)</span>
            <span style={{ fontSize: "11px", color: "var(--ac-txt)", cursor: "pointer" }}>
              Đổi giọng ▸
            </span>
          </div>
        </div>

        {/* 4. Tỷ lệ thoại gốc */}
        <OriginalRatioSlider
          ratio={originalRatio}
          onChange={onChangeOriginalRatio}
          targetDurationSec={targetMinutes * 60}
        />

        {/* 5. Thông tin AI Provider */}
        <div
          style={{
            marginTop: "auto",
            padding: "10px 14px",
            borderRadius: "8px",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.04)",
            fontSize: "12px",
            color: "var(--t3)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>✦ AI viết lời: <strong>MiniMax-M3 · tiếng Việt</strong></span>
          <span style={{ color: "var(--ac-txt)", cursor: "pointer", fontSize: "11px" }}>Cài đặt ›</span>
        </div>
      </div>
    </div>
  );
};
