import React, { useState } from "react";
import { TemplateLibrary } from "./TemplateLibrary";
import { LabWizard } from "./wizard/LabWizard";
import "./lab.css";

interface LabViewProps {
  onNavigateToStudio?: (projectName?: string) => void;
}

export const LabView: React.FC<LabViewProps> = ({ onNavigateToStudio }) => {
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const handleSelectTemplate = (templateId: string) => {
    setActiveTemplateId(templateId);
  };

  const handleOpenDraft = (_draftId: string) => {
    // Khi mở bản nháp gần đây, tự động vào mẫu recap-game
    setActiveTemplateId("recap-game");
  };

  const handleBackToLibrary = () => {
    setActiveTemplateId(null);
  };

  return (
    <div className="lab-view">
      {activeTemplateId === null ? (
        <TemplateLibrary
          onSelectTemplate={handleSelectTemplate}
          onOpenDraft={handleOpenDraft}
        />
      ) : (
        <LabWizard
          templateId={activeTemplateId}
          onBackToLibrary={handleBackToLibrary}
          onOpenStudioProject={onNavigateToStudio}
        />
      )}
    </div>
  );
};

export default LabView;
