import React, { useState } from "react";
import { WizardStepBar, type WizardStepId } from "./WizardStepBar";
import { StepFooter } from "./StepFooter";
import { SourceStep } from "../recap/SourceStep";
import { AnalyzeProgress } from "../recap/AnalyzeProgress";
import { AnalyzeResult } from "../recap/AnalyzeResult";
import { NarrationEditor } from "../recap/NarrationEditor";
import { DraftResult } from "../recap/DraftResult";
import {
  MOCK_VIDEO_SOURCES,
  MOCK_CHAPTERS,
  MOCK_CHARACTERS,
  MOCK_JUNK_SEGMENTS,
  MOCK_RECAP_ITEMS,
  type MockVideoSource,
  type MockChapter,
  type MockCharacter,
  type MockJunkSegment,
} from "../labMock";
import type { RecapItem } from "../labModel";
import { labApi, type AnalyzeStageProgress } from "../labApi";

interface LabWizardProps {
  templateId: string;
  onBackToLibrary: () => void;
  onOpenStudioProject?: (projectName: string) => void;
}

export const LabWizard: React.FC<LabWizardProps> = ({
  onBackToLibrary,
  onOpenStudioProject,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStepId>("source");
  const [unlockedSteps, setUnlockedSteps] = useState<WizardStepId[]>(["source", "analyze"]);

  // Dữ liệu cấu hình bước Nguồn
  const [sources, setSources] = useState<MockVideoSource[]>([...MOCK_VIDEO_SOURCES]);
  const [gameName, setGameName] = useState<string>("Vương Miện Tro Tàn");
  const [webSearch, setWebSearch] = useState<boolean>(true);
  const [targetMinutes, setTargetMinutes] = useState<number>(10);
  const [originalRatio, setOriginalRatio] = useState<number>(0.3);
  const [voiceName] = useState<string>("Hoàng Nam (Truyền cảm)");

  // Dữ liệu bước Phân tích
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<AnalyzeStageProgress | undefined>();
  const [chapters, setChapters] = useState<MockChapter[]>([...MOCK_CHAPTERS]);
  const [characters, setCharacters] = useState<MockCharacter[]>([...MOCK_CHARACTERS]);
  const [junkSegments, setJunkSegments] = useState<MockJunkSegment[]>([...MOCK_JUNK_SEGMENTS]);

  // Dữ liệu bước Lời bình & Dựng nháp
  const [recapItems, setRecapItems] = useState<RecapItem[]>([...MOCK_RECAP_ITEMS]);
  const [isBuildingDraft, setIsBuildingDraft] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleNextFromSource = async () => {
    setCurrentStep("analyze");
    if (!unlockedSteps.includes("analyze")) {
      setUnlockedSteps([...unlockedSteps, "analyze"]);
    }
    if (chapters.length === 0 && !isAnalyzing) {
      void handleStartAnalysis();
    }
  };

  const handleStartAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await labApi.analyze(
        { videoPaths: sources.map((s) => s.name), gameName, webSearch },
        (p) => setAnalyzeProgress(p),
      );
      setChapters(res.chapters);
      setCharacters(res.characters);
      setJunkSegments(res.junkSegments);
      if (!unlockedSteps.includes("narration")) {
        setUnlockedSteps([...unlockedSteps, "narration"]);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleNextFromAnalyze = () => {
    setCurrentStep("narration");
    if (!unlockedSteps.includes("narration")) {
      setUnlockedSteps([...unlockedSteps, "narration"]);
    }
  };

  const handleNextFromNarration = async () => {
    setCurrentStep("draft");
    if (!unlockedSteps.includes("draft")) {
      setUnlockedSteps([...unlockedSteps, "draft"]);
    }
  };

  const handleOpenStudio = async () => {
    const res = await labApi.openInStudio("draft-crown-1");
    showToast(`Đã tạo dự án "${res.studioTabTitle}". Sẽ kết nối chuyển tab thật ở bước C4!`);
    onOpenStudioProject?.(res.studioTabTitle);
  };

  return (
    <div className="lab-wizard">
      <WizardStepBar
        currentStep={currentStep}
        unlockedSteps={unlockedSteps}
        onNavigateStep={(s) => setCurrentStep(s)}
        onBackToLibrary={onBackToLibrary}
        gameTitle={gameName}
        targetMinutes={targetMinutes}
      />

      <div className="lab-wizard-body">
        {currentStep === "source" && (
          <SourceStep
            sources={sources}
            onAddSource={() => {
              const newSrc: MockVideoSource = {
                id: `v_${Date.now()}`,
                name: `Gameplay_Part_${sources.length + 1}.mp4`,
                durationSec: 1800,
                sizeMb: 1500,
                fps: 60,
                resolution: "1920x1080",
                hasSubtitles: false,
              };
              setSources([...sources, newSrc]);
            }}
            onRemoveSource={(id) => setSources(sources.filter((s) => s.id !== id))}
            onMoveSource={(from, to) => {
              const next = [...sources];
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved);
              setSources(next);
            }}
            gameName={gameName}
            onChangeGameName={setGameName}
            webSearch={webSearch}
            onChangeWebSearch={setWebSearch}
            targetMinutes={targetMinutes}
            onChangeTargetMinutes={setTargetMinutes}
            originalRatio={originalRatio}
            onChangeOriginalRatio={setOriginalRatio}
            voiceName={voiceName}
          />
        )}

        {currentStep === "analyze" && (
          isAnalyzing ? (
            <AnalyzeProgress
              progress={analyzeProgress}
              onCancel={() => setIsAnalyzing(false)}
            />
          ) : (
            <AnalyzeResult
              chapters={chapters}
              characters={characters}
              junkSegments={junkSegments}
              onToggleChapter={(id) =>
                setChapters(chapters.map((c) => (c.id === id ? { ...c, included: !c.included } : c)))
              }
              onUpdateChapter={(id, title, summary) =>
                setChapters(chapters.map((c) => (c.id === id ? { ...c, title, summary } : c)))
              }
              onUpdateCharacterName={(id, name) =>
                setCharacters(characters.map((c) => (c.id === id ? { ...c, name } : c)))
              }
              onToggleRestoreJunk={(id) =>
                setJunkSegments(junkSegments.map((j) => (j.id === id ? { ...j, restored: !j.restored } : j)))
              }
            />
          )
        )}

        {currentStep === "narration" && (
          <NarrationEditor
            items={recapItems}
            onChangeItems={setRecapItems}
            targetDurationSec={targetMinutes * 60}
            chapters={chapters}
          />
        )}

        {currentStep === "draft" && (
          <DraftResult
            items={recapItems}
            onOpenStudio={handleOpenStudio}
            onRebuild={async () => {
              setIsBuildingDraft(true);
              try {
                await labApi.buildDraft({
                  items: recapItems,
                  voiceId: "vi-VN",
                  targetDurationSec: targetMinutes * 60,
                });
                showToast("Đã dựng lại timeline khớp cảnh!");
              } finally {
                setIsBuildingDraft(false);
              }
            }}
          />
        )}
      </div>

      <StepFooter
        onBack={
          currentStep === "source"
            ? onBackToLibrary
            : currentStep === "analyze"
            ? () => setCurrentStep("source")
            : currentStep === "narration"
            ? () => setCurrentStep("analyze")
            : () => setCurrentStep("narration")
        }
        backLabel={currentStep === "source" ? "‹ Thư viện" : "‹ Bước trước"}
        onNext={
          currentStep === "source"
            ? handleNextFromSource
            : currentStep === "analyze"
            ? isAnalyzing
              ? () => {}
              : handleNextFromAnalyze
            : currentStep === "narration"
            ? handleNextFromNarration
            : handleOpenStudio
        }
        nextLabel={
          currentStep === "source"
            ? "Bắt đầu phân tích"
            : currentStep === "analyze"
            ? isAnalyzing
              ? "Đang phân tích..."
              : `Viết lời bình (${targetMinutes} phút)`
            : currentStep === "narration"
            ? "Dựng nháp timeline"
            : "🎬 Mở trong Studio"
        }
        nextLoading={isAnalyzing || isBuildingDraft}
      />

      {/* Thông báo Toast nhẹ */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "76px",
            right: "32px",
            background: "var(--bg-top)",
            border: "1px solid var(--ac-br)",
            color: "var(--t1)",
            padding: "10px 16px",
            borderRadius: "8px",
            fontSize: "12.5px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 100,
          }}
        >
          ✦ {toastMessage}
        </div>
      )}
    </div>
  );
};
