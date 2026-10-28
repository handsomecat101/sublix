import React from "react";

export type WizardStepId = "source" | "analyze" | "narration" | "draft";

interface WizardStepBarProps {
  currentStep: WizardStepId;
  unlockedSteps: WizardStepId[];
  onNavigateStep: (step: WizardStepId) => void;
  onBackToLibrary: () => void;
  gameTitle?: string;
  targetMinutes?: number;
}

const STEPS: { id: WizardStepId; name: string; sub: string }[] = [
  { id: "source", name: "1. Nguồn & Tuỳ chọn", sub: "Chọn video & giọng" },
  { id: "analyze", name: "2. Phân tích cốt truyện", sub: "Cutscene & nhân vật" },
  { id: "narration", name: "3. Biên tập lời bình", sub: "Duyệt kịch bản thoại" },
  { id: "draft", name: "4. Dựng nháp timeline", sub: "Khớp cảnh & Studio" },
];

export const WizardStepBar: React.FC<WizardStepBarProps> = ({
  currentStep,
  unlockedSteps,
  onNavigateStep,
  onBackToLibrary,
  gameTitle = "Vương Miện Tro Tàn",
  targetMinutes = 10,
}) => {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="lab-wizard-stepbar">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          type="button"
          className="lab-btn-secondary"
          onClick={onBackToLibrary}
          style={{ padding: "5px 12px", fontSize: "12px" }}
        >
          ‹ Thư viện
        </button>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "13px", fontWeight: 800, color: "var(--t1)" }}>
            🎮 {gameTitle}
          </span>
          <span style={{ fontSize: "11px", color: "var(--t4)" }}>
            Mục tiêu: {targetMinutes} phút · Recap game story
          </span>
        </div>
      </div>

      <nav className="lab-stepbar-nav">
        {STEPS.map((step, idx) => {
          const isCurrent = step.id === currentStep;
          const isPassed = currentIndex > idx;
          const isUnlocked = unlockedSteps.includes(step.id);

          return (
            <React.Fragment key={step.id}>
              {idx > 0 && (
                <div
                  className={`lab-step-divider${isPassed ? " passed" : ""}`}
                />
              )}
              <button
                type="button"
                className={`lab-step-item${isCurrent ? " active" : ""}${isPassed ? " completed" : ""}`}
                onClick={() => onNavigateStep(step.id)}
                disabled={!isUnlocked}
              >
                <div className="lab-step-circle">
                  {isPassed ? "✓" : idx + 1}
                </div>
                <div className="lab-step-labels">
                  <span className="lab-step-name">{step.name}</span>
                  <span className="lab-step-sub">{step.sub}</span>
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: "11px", color: "var(--t4)" }}>💾 Tự lưu</span>
      </div>
    </div>
  );
};
