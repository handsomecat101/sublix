import React from "react";
import type { MockChapter } from "../labMock";

interface ChapterListProps {
  chapters: MockChapter[];
  onToggleChapter: (id: number) => void;
  onUpdateChapter: (id: number, title: string, summary: string) => void;
}

export const ChapterList: React.FC<ChapterListProps> = ({
  chapters,
  onToggleChapter,
  onUpdateChapter,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
          Chương mục cốt truyện ({chapters.filter((c) => c.included).length}/{chapters.length} chọn)
        </h3>
        <span style={{ fontSize: "11.5px", color: "var(--t4)" }}>Bấm vào tiêu đề hoặc tóm tắt để sửa</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {chapters.map((chap) => (
          <div
            key={chap.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "12px 14px",
              borderRadius: "10px",
              background: chap.included ? "var(--bg-card)" : "rgba(0,0,0,0.2)",
              border: `1px solid ${chap.included ? "var(--line)" : "rgba(255,255,255,0.03)"}`,
              opacity: chap.included ? 1 : 0.6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
                <input
                  type="checkbox"
                  checked={chap.included}
                  onChange={() => onToggleChapter(chap.id)}
                  style={{ accentColor: "var(--ac)" }}
                />
                <input
                  type="text"
                  value={chap.title}
                  onChange={(e) => onUpdateChapter(chap.id, e.target.value, chap.summary)}
                  disabled={!chap.included}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--t1)",
                    fontSize: "13.5px",
                    fontWeight: 700,
                    width: "100%",
                    outline: "none",
                  }}
                />
              </label>

              <span style={{ fontSize: "11px", color: "var(--t4)", whiteSpace: "nowrap" }}>
                {chap.timeRange} · {chap.cutscenesCount} cutscene
              </span>
            </div>

            <textarea
              value={chap.summary}
              onChange={(e) => onUpdateChapter(chap.id, chap.title, e.target.value)}
              disabled={!chap.included}
              rows={2}
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.04)",
                borderRadius: "6px",
                color: "var(--t2)",
                fontSize: "12.5px",
                padding: "6px 10px",
                resize: "none",
                outline: "none",
                lineHeight: 1.45,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
