import React, { memo } from "react";
import type { LabTemplate } from "./templates";

interface TemplateCardProps {
  template: LabTemplate;
  onSelect: (templateId: string) => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = memo(function TemplateCard({
  template,
  onSelect,
}) {
  const handleClick = () => {
    if (template.enabled) {
      onSelect(template.id);
    }
  };

  return (
    <div
      className={`lab-template-card${!template.enabled ? " disabled" : ""}`}
      onClick={handleClick}
      role="button"
      tabIndex={template.enabled ? 0 : -1}
      aria-disabled={!template.enabled}
      onKeyDown={(e) => {
        if (template.enabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(template.id);
        }
      }}
    >
      <div className="lab-card-preview">
        <div className="lab-preview-graphic">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--ac)" }}>
              {template.icon} {template.title}
            </span>
            {template.tag && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 800,
                  padding: "1px 6px",
                  borderRadius: "4px",
                  background: template.enabled ? "rgba(232,163,61,0.15)" : "rgba(255,255,255,0.06)",
                  color: template.enabled ? "var(--ac-txt)" : "var(--t4)",
                  border: "1px solid var(--line)",
                }}
              >
                {template.tag}
              </span>
            )}
          </div>
          <div className="lab-preview-waves">
            <div className="lab-wave-bar" style={{ height: "45%" }} />
            <div className="lab-wave-bar" style={{ height: "70%" }} />
            <div className="lab-wave-bar ost" style={{ height: "90%" }} title="Thoại gốc OST" />
            <div className="lab-wave-bar ost" style={{ height: "60%" }} title="Thoại gốc OST" />
            <div className="lab-wave-bar" style={{ height: "80%" }} />
            <div className="lab-wave-bar" style={{ height: "50%" }} />
            <div className="lab-wave-bar" style={{ height: "35%" }} />
          </div>
        </div>
      </div>

      <div className="lab-card-body">
        <div className="lab-card-header">
          <h3 className="lab-card-title">
            <span>{template.icon}</span>
            <span>{template.title}</span>
          </h3>
        </div>

        <p className="lab-card-oneline">{template.oneLine}</p>

        <div className="lab-card-facts">
          <span className="lab-fact-label">Đầu ra:</span>
          <span className="lab-fact-val">{template.outputSummary}</span>
          <span className="lab-fact-label">Cần có:</span>
          <span className="lab-fact-val">{template.inputRequired}</span>
          <span className="lab-fact-label">Xử lý:</span>
          <span className="lab-fact-val">{template.processingNote}</span>
        </div>

        <div className="lab-card-footer">
          {template.enabled ? (
            <button
              type="button"
              className="lab-btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(template.id);
              }}
            >
              Bắt đầu ›
            </button>
          ) : (
            <span style={{ fontSize: "12px", color: "var(--t4)", fontWeight: 600 }}>Chưa sẵn sàng</span>
          )}
        </div>
      </div>
    </div>
  );
});
