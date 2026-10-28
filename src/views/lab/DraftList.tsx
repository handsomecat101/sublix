import React from "react";
import type { MockDraft } from "./labMock";

interface DraftListProps {
  drafts: MockDraft[];
  onOpenDraft: (draftId: string) => void;
  onDeleteDraft?: (draftId: string) => void;
}

export const DraftList: React.FC<DraftListProps> = ({ drafts, onOpenDraft, onDeleteDraft: _onDeleteDraft }) => {
  if (drafts.length === 0) {
    return (
      <div style={{ fontSize: "12.5px", color: "var(--t4)", padding: "12px 0" }}>
        Chưa có bản nháp — chọn 1 mẫu để bắt đầu.
      </div>
    );
  }

  const getStepLabel = (step: MockDraft["step"]): string => {
    switch (step) {
      case "source":
        return "Nguồn video";
      case "analyze":
        return "Bước A: Phân tích";
      case "narration":
        return "Bước B: Lời bình";
      case "draft":
        return "Bước C: Dựng nháp";
    }
  };

  return (
    <div className="lab-drafts-list">
      {drafts.map((draft) => (
        <div
          key={draft.id}
          className="lab-draft-item"
          onClick={() => onOpenDraft(draft.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenDraft(draft.id);
            }
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <span className="lab-draft-item-title" title={draft.title}>
              {draft.title}
            </span>
            {draft.openedInStudio ? (
              <span style={{ fontSize: "10px", color: "var(--ok-txt)", fontWeight: 700 }}>✓ Studio</span>
            ) : draft.progressPct ? (
              <span style={{ fontSize: "10px", color: "var(--ac-txt)", fontWeight: 700 }}>{draft.progressPct}%</span>
            ) : null}
          </div>

          <div className="lab-draft-meta">
            <span
              style={{
                fontSize: "10.5px",
                padding: "1px 6px",
                borderRadius: "4px",
                background: "rgba(255,255,255,0.05)",
                color: "var(--t3)",
              }}
            >
              {getStepLabel(draft.step)}
            </span>
            <span>{draft.updatedAt}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
