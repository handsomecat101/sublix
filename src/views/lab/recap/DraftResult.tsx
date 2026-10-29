import React, { useState, useMemo } from "react";
import type { RecapItem } from "../labModel";
import { formatDur } from "../labModel";
import { convertFileSrc } from "@tauri-apps/api/core";

interface DraftResultProps {
  items: RecapItem[];
  onOpenStudio: () => void;
  onRebuild: () => void;
  draftPath?: string;
  notes?: string[];
  warningsCount?: number;
  unplaced?: string[];
  rulesPassed?: boolean;
}

export const DraftResult: React.FC<DraftResultProps> = ({
  items,
  onOpenStudio,
  onRebuild,
  draftPath,
  notes,
  warningsCount = 0,
  unplaced,
  rulesPassed = true,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const selectedItem = items[selectedIdx] ?? items[0];

  const totalSec = items.reduce(
    (sum, it) => sum + (it.keepOriginal ? it.end - it.start : (it.ttsSecs ?? 8)),
    0,
  );
  const ostSec = items.reduce(
    (sum, it) => sum + (it.keepOriginal ? it.end - it.start : 0),
    0,
  );
  const ostRatio = totalSec > 0 ? Math.round((ostSec / totalSec) * 100) : 0;

  const draftMediaUrl = useMemo(() => {
    if (!draftPath) return null;
    try {
      return convertFileSrc(draftPath);
    } catch {
      return draftPath;
    }
  }, [draftPath]);

  return (
    <div className="lab-draft-layout">
      {/* CỘT TRÁI: DANH SÁCH PHÂN ĐOẠN ĐÃ DỰNG */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
              Kịch bản timeline đã khớp ({items.length} cảnh)
            </h3>
            <span style={{ fontSize: "12px", color: "var(--t4)" }}>
              Tổng thời lượng: {formatDur(totalSec)} · Thoại gốc: {ostRatio}% ({formatDur(ostSec)})
            </span>
          </div>

          <button type="button" className="lab-btn-secondary" onClick={onRebuild}>
            ↻ Dựng lại ▾
          </button>
        </div>

        <div className="lab-draft-table">
          {items.map((item, idx) => {
            const isSelected = idx === selectedIdx;
            const dur = item.keepOriginal ? item.end - item.start : (item.ttsSecs ?? 8);

            return (
              <div
                key={item.id}
                className={`lab-draft-row${item.keepOriginal ? " ost" : ""}${
                  isSelected ? " selected" : ""
                }`}
                onClick={() => setSelectedIdx(idx)}
              >
                <span style={{ fontWeight: 800, fontSize: "11.5px", color: "var(--t4)" }}>
                  #{idx + 1}
                </span>

                <div style={{ display: "flex", flexDirection: "column", fontSize: "11px", color: "var(--t3)" }}>
                  <span style={{ fontWeight: 700, color: item.keepOriginal ? "var(--step-sub)" : "var(--ac-txt)" }}>
                    {item.keepOriginal ? "🔊 THOẠI GỐC" : "🎙 LỜI BÌNH"}
                  </span>
                  <span>P{item.sourceIdx + 1} · {formatDur(item.start)}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: item.keepOriginal ? "#bae6fd" : "var(--t1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.narration}
                  </span>
                  {item.picture && (
                    <span style={{ fontSize: "11px", color: "var(--t4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      🎬 {item.picture}
                    </span>
                  )}
                </div>

                <span style={{ fontSize: "12px", color: "var(--t3)", fontFamily: "monospace", textAlign: "right" }}>
                  {dur.toFixed(1)}s
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* CỘT PHẢI: XEM THỬ & NÚT MỞ SANG STUDIO */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          background: "var(--bg-side)",
          border: "1px solid var(--line)",
          borderRadius: "14px",
          padding: "20px",
        }}
      >
        <h4 style={{ fontSize: "14px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
          {draftMediaUrl ? "Video nháp hoàn chỉnh" : `Xem thử phân đoạn #${selectedIdx + 1}`}
        </h4>

        {/* Khung phát video thật hoặc preview giả lập */}
        {draftMediaUrl ? (
          <div style={{ borderRadius: "10px", overflow: "hidden", background: "#000", border: "1px solid var(--line)" }}>
            <video
              src={draftMediaUrl}
              controls
              style={{ width: "100%", maxHeight: "220px", display: "block" }}
            />
          </div>
        ) : (
          <div className="lab-player-mock">
            <div style={{ textAlign: "center", color: "var(--t4)", fontSize: "12px" }}>
              <span>▶ Preview Cảnh #{selectedIdx + 1}</span>
              <div style={{ marginTop: 4, color: "var(--t3)", fontSize: "11px" }}>
                {selectedItem?.picture}
              </div>
            </div>
            <div className="lab-player-sub-overlay">
              {selectedItem?.narration}
            </div>
          </div>
        )}

        {/* Bảng chi tiết cảnh */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: "12px",
            background: "rgba(0,0,0,0.3)",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--t4)" }}>Loại:</span>
            <span style={{ color: selectedItem?.keepOriginal ? "var(--step-sub)" : "var(--ac-txt)", fontWeight: 700 }}>
              {selectedItem?.keepOriginal ? "Thoại gốc game (OST)" : "Thuyết minh AI"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--t4)" }}>Vị trí trong video:</span>
            <span style={{ color: "var(--t2)", fontFamily: "monospace" }}>
              Video #{selectedItem ? selectedItem.sourceIdx + 1 : 1} ({formatDur(selectedItem?.start ?? 0)} → {formatDur(selectedItem?.end ?? 0)})
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--t4)" }}>Thời lượng:</span>
            <span style={{ color: "var(--t1)", fontWeight: 700 }}>
              {selectedItem?.keepOriginal
                ? `${(selectedItem.end - selectedItem.start).toFixed(1)}s (gốc)`
                : `${(selectedItem?.ttsSecs ?? 8).toFixed(1)}s (TTS)`}
            </span>
          </div>
        </div>

        {/* Ghi chú tối ưu hóa / tự sửa luật */}
        {notes && notes.length > 0 && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: "rgba(56, 189, 248, 0.08)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              fontSize: "12px",
              color: "var(--ac-txt)",
            }}
          >
            <strong>✦ Ghi chú tối ưu:</strong>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Cảnh báo nếu có */}
        {warningsCount > 0 && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: "rgba(234, 179, 8, 0.08)",
              border: "1px solid rgba(234, 179, 8, 0.25)",
              fontSize: "12px",
              color: "var(--warn-txt)",
            }}
          >
            ⚠ Có {warningsCount} cảnh báo cần lưu ý khi dựng.
          </div>
        )}

        {/* Các câu chưa khớp cảnh nếu có */}
        {unplaced && unplaced.length > 0 && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: "rgba(244, 63, 94, 0.08)",
              border: "1px solid rgba(244, 63, 94, 0.25)",
              fontSize: "12px",
              color: "#fb7185",
            }}
          >
            <strong>⚠ {unplaced.length} câu chưa tìm được cảnh phù hợp:</strong>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {unplaced.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Hộp kiểm luật */}
        {rulesPassed && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: "rgba(74, 222, 128, 0.08)",
              border: "1px solid rgba(74, 222, 128, 0.25)",
              fontSize: "12px",
              color: "var(--ok-txt)",
            }}
          >
            ✓ <strong>Kiểm luật dựng:</strong> Đạt 100% các tiêu chuẩn về Hook mở đầu, tỷ lệ thoại gốc và cầu nối giữa các cảnh quay.
          </div>
        )}

        {/* NÚT CHÍNH: MỞ SANG STUDIO */}
        <button
          type="button"
          className="lab-btn-primary"
          style={{
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: 800,
            justifyContent: "center",
            marginTop: "auto",
          }}
          onClick={onOpenStudio}
        >
          🎬 Mở trong Studio ›
        </button>
      </div>
    </div>
  );
};
