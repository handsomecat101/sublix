import React, { useState, useMemo } from "react";
import type { RecapItem } from "../labModel";
import { checkRecapRules, checkDuration, insertOst } from "../labModel";
import { NarrationBlock } from "./NarrationBlock";
import { NarrationSidebar } from "./NarrationSidebar";
import type { MockChapter } from "../labMock";

interface NarrationEditorProps {
  items: RecapItem[];
  onChangeItems: (items: RecapItem[]) => void;
  targetDurationSec: number;
  chapters: MockChapter[];
}

export const NarrationEditor: React.FC<NarrationEditorProps> = ({
  items,
  onChangeItems,
  targetDurationSec,
  chapters,
}) => {
  const [selectedId, setSelectedId] = useState<number>(items[0]?.id ?? 1);

  const violations = useMemo(() => checkRecapRules(items), [items]);
  const durationCheck = useMemo(
    () => checkDuration(items, targetDurationSec),
    [items, targetDurationSec],
  );

  const handleUpdateText = (id: number, text: string) => {
    onChangeItems(
      items.map((it) => (it.id === id ? { ...it, narration: text, ttsSecs: undefined } : it)),
    );
  };

  const handleToggleOst = (id: number) => {
    onChangeItems(
      items.map((it) => (it.id === id ? { ...it, keepOriginal: !it.keepOriginal } : it)),
    );
  };

  const handleDelete = (id: number) => {
    if (items.length <= 1) return;
    onChangeItems(items.filter((it) => it.id !== id));
  };

  const handleInsertBetween = (afterIdx: number) => {
    const newItem: RecapItem = {
      id: Math.max(...items.map((i) => i.id), 0) + 1,
      sourceIdx: items[afterIdx]?.sourceIdx ?? 0,
      start: (items[afterIdx]?.end ?? 0) + 1,
      end: (items[afterIdx]?.end ?? 0) + 6,
      picture: "Cảnh chuyển tiếp",
      narration: "Một câu dẫn nối mới được thêm vào.",
      keepOriginal: false,
    };
    const next = [...items];
    next.splice(afterIdx + 1, 0, newItem);
    onChangeItems(next);
  };

  const handleInsertOst = (afterIdx: number) => {
    const ostItem: RecapItem = {
      id: Math.max(...items.map((i) => i.id), 0) + 1,
      sourceIdx: items[afterIdx]?.sourceIdx ?? 0,
      start: (items[afterIdx]?.end ?? 0) + 1,
      end: (items[afterIdx]?.end ?? 0) + 5,
      picture: "Nhân vật cất lời đối thoại",
      narration: "Câu thoại gốc từ video game.",
      keepOriginal: true,
    };
    onChangeItems(insertOst(items, afterIdx, ostItem));
  };

  return (
    <div className="lab-narration-layout">
      {/* CỘT TRÁI: DANH SÁCH ĐOẠN */}
      <div className="lab-narration-scroll">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
              Biên tập kịch bản thuyết minh ({items.length} đoạn)
            </h3>
            <span style={{ fontSize: "12px", color: "var(--t4)" }}>
              Bấm trực tiếp vào chữ để sửa · R: Viết lại · G: Đổi sang thoại gốc
            </span>
          </div>
        </div>

        {items.map((item, idx) => {
          const violation = violations.find((v) => v.itemId === item.id);

          return (
            <React.Fragment key={item.id}>
              <NarrationBlock
                item={item}
                index={idx}
                isSelected={selectedId === item.id}
                isViolation={Boolean(violation)}
                violationMessage={violation?.messageVi}
                onSelect={() => setSelectedId(item.id)}
                onChangeText={(text) => handleUpdateText(item.id, text)}
                onToggleOst={() => handleToggleOst(item.id)}
                onDelete={() => handleDelete(item.id)}
              />

              {/* Vạch chèn giữa 2 đoạn */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  height: "18px",
                  opacity: 0.35,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}
              >
                <div style={{ height: "1px", background: "var(--line)", flex: 1 }} />
                <button
                  type="button"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px dashed var(--line)",
                    borderRadius: "4px",
                    color: "var(--t3)",
                    fontSize: "10.5px",
                    cursor: "pointer",
                    padding: "1px 6px",
                  }}
                  onClick={() => handleInsertBetween(idx)}
                >
                  ＋ Thêm lời bình
                </button>
                <button
                  type="button"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px dashed var(--step-sub)",
                    borderRadius: "4px",
                    color: "var(--step-sub)",
                    fontSize: "10.5px",
                    cursor: "pointer",
                    padding: "1px 6px",
                  }}
                  onClick={() => handleInsertOst(idx)}
                >
                  🔊 Chèn thoại gốc
                </button>
                <div style={{ height: "1px", background: "var(--line)", flex: 1 }} />
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* CỘT PHẢI: SIDEBAR THỜI LƯỢNG & LUẬT DỰNG */}
      <NarrationSidebar
        durationCheck={durationCheck}
        violations={violations}
        onScrollToItem={(id) => setSelectedId(id)}
        chapters={chapters}
      />
    </div>
  );
};
