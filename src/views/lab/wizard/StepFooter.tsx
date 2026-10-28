import React, { useEffect } from "react";

interface StepFooterProps {
  statusMessage?: string;
  onBack?: () => void;
  backLabel?: string;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
}

export const StepFooter: React.FC<StepFooterProps> = ({
  statusMessage,
  onBack,
  backLabel = "‹ Quay lại",
  onNext,
  nextLabel,
  nextDisabled = false,
  nextLoading = false,
}) => {
  // Bắt phím tắt Ctrl+Enter trên toàn bộ bước
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (!nextDisabled && !nextLoading) {
          e.preventDefault();
          onNext();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextDisabled, nextLoading, onNext]);

  return (
    <div className="lab-wizard-footer">
      <div style={{ fontSize: "12px", color: "var(--t3)" }}>
        {statusMessage || "Nhấn Ctrl+Enter để tiếp tục bước sau"}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && (
          <button
            type="button"
            className="lab-btn-secondary"
            onClick={onBack}
          >
            {backLabel}
          </button>
        )}

        <button
          type="button"
          className="lab-btn-primary"
          onClick={onNext}
          disabled={nextDisabled || nextLoading}
          style={{ opacity: nextDisabled || nextLoading ? 0.6 : 1 }}
        >
          {nextLoading ? "Đang xử lý..." : `${nextLabel} ›`}
        </button>
      </div>
    </div>
  );
};
