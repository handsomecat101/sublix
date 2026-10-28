import React from "react";
import type { AnalyzeStageProgress } from "../labApi";

interface AnalyzeProgressProps {
  progress?: AnalyzeStageProgress;
  onCancel: () => void;
}

const STAGES = [
  { index: 1, name: "Nhận dạng thoại (Whisper)" },
  { index: 2, name: "Đọc chữ trong game (OCR)" },
  { index: 3, name: "Phát hiện cutscene & góc quay" },
  { index: 4, name: "Lọc đoạn rác, loading & quảng cáo" },
  { index: 5, name: "Tóm tắt chương bằng AI (MiniMax)" },
];

export const AnalyzeProgress: React.FC<AnalyzeProgressProps> = ({ progress, onCancel }) => {
  const currentStage = progress?.stageIndex ?? 1;
  const currentPercent = progress?.percent ?? 10;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 32px",
        maxWidth: "680px",
        margin: "auto",
        width: "100%",
        gap: "28px",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 8px 0" }}>
          Đang phân tích cốt truyện game
        </h2>
        <p style={{ fontSize: "13px", color: "var(--t3)", margin: 0 }}>
          Có thể rời tab hoặc mở Studio — tiến trình chạy nền và thông báo khi hoàn thành.
        </p>
      </div>

      {/* THANH TIẾN TRÌNH TỔNG THỂ */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--t2)" }}>
          <span>{progress?.message || "Đang khởi tạo các tác vụ..."}</span>
          <span style={{ fontWeight: 800, color: "var(--ac-txt)", fontFamily: "monospace" }}>
            {currentPercent}%
          </span>
        </div>
        <div
          style={{
            height: "8px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: "4px",
            overflow: "hidden",
            width: "100%",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${currentPercent}%`,
              background: "var(--grad-ac)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* CÁC GIAI ĐOẠN CHI TIẾT */}
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          background: "var(--bg-card)",
          border: "1px solid var(--line)",
          borderRadius: "12px",
          padding: "16px 20px",
        }}
      >
        {STAGES.map((s) => {
          const isDone = currentStage > s.index;
          const isRunning = currentStage === s.index;

          return (
            <div
              key={s.index}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "13px",
                color: isDone ? "var(--ok-txt)" : isRunning ? "var(--t1)" : "var(--t4)",
                fontWeight: isRunning ? 700 : 500,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "11px",
                    background: isDone
                      ? "rgba(74,222,128,0.15)"
                      : isRunning
                      ? "var(--ac-soft)"
                      : "transparent",
                    border: `1.5px solid ${
                      isDone ? "var(--ok)" : isRunning ? "var(--ac)" : "var(--line)"
                    }`,
                  }}
                >
                  {isDone ? "✓" : s.index}
                </span>
                <span>{s.name}</span>
              </div>
              <span style={{ fontSize: "11px" }}>
                {isDone ? "Đã xong" : isRunning ? "Đang chạy..." : "Chờ"}
              </span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="lab-btn-secondary"
        style={{ color: "var(--dang-txt)", borderColor: "rgba(239, 68, 68, 0.25)" }}
        onClick={onCancel}
      >
        ■ Huỷ phân tích
      </button>
    </div>
  );
};
