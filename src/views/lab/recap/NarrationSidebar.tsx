import React from "react";
import type { DurationCheck, RuleViolation } from "../labModel";
import { formatDur } from "../labModel";
import type { MockChapter } from "../labMock";

interface NarrationSidebarProps {
  durationCheck: DurationCheck;
  violations: RuleViolation[];
  onScrollToItem: (itemId: number) => void;
  chapters: MockChapter[];
}

export const NarrationSidebar: React.FC<NarrationSidebarProps> = ({
  durationCheck,
  violations,
  onScrollToItem,
  chapters,
}) => {
  const { totalSec, targetSec, status, summaryVi, narrationSec, ostSec, ostRatioPct } = durationCheck;

  return (
    <aside className="lab-narration-side">
      {/* 1. THỜI LƯỢNG ƯỚC TÍNH */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h4 style={{ fontSize: "13px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
          Thời lượng ước tính
        </h4>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: "26px",
              fontWeight: 800,
              fontFamily: "monospace",
              color: status === "ok" ? "var(--ok-txt)" : status === "warn" ? "var(--warn-txt)" : "var(--dang-txt)",
            }}
          >
            {formatDur(totalSec)}
          </span>
          <span style={{ fontSize: "12px", color: "var(--t4)" }}>
            / đích {formatDur(targetSec)}
          </span>
        </div>

        {/* Thanh xếp chồng thời lượng */}
        <div
          style={{
            height: "8px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: "4px",
            overflow: "hidden",
            display: "flex",
            width: "100%",
          }}
        >
          <div
            style={{
              width: `${totalSec > 0 ? (narrationSec / totalSec) * 100 : 0}%`,
              background: "var(--ac)",
            }}
            title={`Lời bình: ${formatDur(narrationSec)}`}
          />
          <div
            style={{
              width: `${totalSec > 0 ? (ostSec / totalSec) * 100 : 0}%`,
              background: "var(--step-sub)",
            }}
            title={`Thoại gốc: ${formatDur(ostSec)}`}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--t3)" }}>
          <span>Lời bình: {formatDur(narrationSec)}</span>
          <span style={{ color: "var(--step-sub)" }}>Thoại gốc: {formatDur(ostSec)} ({ostRatioPct}%)</span>
        </div>

        <div
          style={{
            fontSize: "11.5px",
            color: status === "ok" ? "var(--ok-txt)" : status === "warn" ? "var(--warn-txt)" : "var(--dang-txt)",
          }}
        >
          {summaryVi}
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: 0 }} />

      {/* 2. KIỂM LUẬT DỰNG R1-R6 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h4 style={{ fontSize: "13px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
            Luật dựng ({violations.length === 0 ? "✓ Đạt" : `! ${violations.length} lưu ý`})
          </h4>
        </div>

        {violations.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--ok-txt)", background: "rgba(74,222,128,0.05)", padding: "8px 10px", borderRadius: "6px" }}>
            ✓ Toàn bộ kịch bản tuân thủ đúng quy tắc Hook mở đầu và tỷ lệ thoại gốc.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {violations.map((v, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "rgba(228,179,60,0.08)",
                  border: "1px solid rgba(228,179,60,0.25)",
                  fontSize: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 800, color: "var(--warn-txt)", fontSize: "11px" }}>
                    Luật {v.rule} (Đoạn #{v.itemId})
                  </span>
                  <button
                    type="button"
                    style={{ background: "transparent", border: "none", color: "var(--ac-txt)", fontSize: "11px", cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => onScrollToItem(v.itemId)}
                  >
                    Tới đoạn ›
                  </button>
                </div>
                <span style={{ color: "var(--t2)", lineHeight: 1.4 }}>{v.messageVi}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: 0 }} />

      {/* 3. MỤC LỤC CHƯƠNG */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h4 style={{ fontSize: "13px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
          Chương mục
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {chapters.filter((c) => c.included).map((c) => (
            <div
              key={c.id}
              style={{
                fontSize: "11.5px",
                color: "var(--t3)",
                padding: "4px 6px",
                borderRadius: "4px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.title}
              </span>
              <span style={{ color: "var(--t4)", fontSize: "10.5px" }}>
                {c.cutscenesCount} cảnh
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};
