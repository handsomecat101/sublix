import React, { useState, useEffect, useRef } from "react";
import { WizardStepBar, type WizardStepId } from "./WizardStepBar";
import { StepFooter } from "./StepFooter";
import { SourceStep } from "../recap/SourceStep";
import { AnalyzeProgress } from "../recap/AnalyzeProgress";
import { AnalyzeResult } from "../recap/AnalyzeResult";
import { NarrationEditor } from "../recap/NarrationEditor";
import { DraftResult } from "../recap/DraftResult";
import { MissingAIState, LabErrorState } from "../recap/LabStates";
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
import {
  isLlmConfigured,
  isLabMockMode,
  setLabMockMode,
  type RecapItem,
} from "../labModel";
import { labApi, type AnalyzeStageProgress } from "../labApi";
import { sublix } from "../../../lib/tauri";

interface LabWizardProps {
  templateId: string;
  onBackToLibrary: () => void;
  onOpenStudioProject?: (projectName: string) => void;
  onOpenSettings?: () => void;
}

export const LabWizard: React.FC<LabWizardProps> = ({
  onBackToLibrary,
  onOpenStudioProject,
  onOpenSettings,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStepId>("source");
  const [unlockedSteps, setUnlockedSteps] = useState<WizardStepId[]>(["source", "analyze"]);

  // Chế độ Dev Mock Mode (lưu ở localStorage)
  const [isMockMode, setIsMockMode] = useState<boolean>(isLabMockMode());

  // Cấu hình AI Provider
  const [isLlmReady, setIsLlmReady] = useState<boolean>(true);
  const [llmProviderName, setLlmProviderName] = useState<string>("MiniMax-M3");
  const [missingAiActive, setMissingAiActive] = useState<boolean>(false);

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
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [chapters, setChapters] = useState<MockChapter[]>([...MOCK_CHAPTERS]);
  const [characters, setCharacters] = useState<MockCharacter[]>([...MOCK_CHARACTERS]);
  const [junkSegments, setJunkSegments] = useState<MockJunkSegment[]>([...MOCK_JUNK_SEGMENTS]);

  // Bộ điều khiển huỷ phân tích
  const abortControllerRef = useRef<AbortController | null>(null);

  // Dữ liệu bước Lời bình & Dựng nháp
  const [recapItems, setRecapItems] = useState<RecapItem[]>([...MOCK_RECAP_ITEMS]);
  const [isBuildingDraft, setIsBuildingDraft] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Tải cấu hình LLM để xác thực
  const checkLlmConfig = async () => {
    try {
      const cfg = await sublix.getConfig();
      if (cfg) {
        const ready = isLlmConfigured(cfg);
        setIsLlmReady(ready);

        const p = cfg.translation_provider;
        if (p === "minimax") setLlmProviderName("MiniMax-M3");
        else if (p === "ollama") setLlmProviderName("Ollama 27B");
        else if (p === "deepseek") setLlmProviderName("DeepSeek");
        else if (p === "openrouter") setLlmProviderName("OpenRouter");
        else if (p === "local") setLlmProviderName("AI Cục bộ");
        else setLlmProviderName("Chưa cấu hình");
      }
    } catch {
      // Ngoài browser dev hoặc không đọc được config
      setIsLlmReady(true);
    }
  };

  useEffect(() => {
    void checkLlmConfig();
  }, []);

  const handleToggleMockMode = () => {
    const nextVal = !isMockMode;
    setLabMockMode(nextVal);
    setIsMockMode(nextVal);
    if (nextVal) {
      setMissingAiActive(false);
    }
    showToast(nextVal ? "Đã bật chế độ Demo (dữ liệu mẫu)" : "Đã chuyển sang chế độ Backend thật");
  };

  const handleOpenSettingsAction = () => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      showToast("Vui lòng mở tab 'Cài đặt' trên thanh điều hướng để cấu hình LLM.");
    }
  };

  const handleAddSource = async () => {
    try {
      if (typeof window !== "undefined" && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
        const selected = await sublix.selectMediaFile();
        if (!selected) return; // Người dùng nhấn Cancel

        const fileName = selected.replace(/^.*[/\\]/, "");
        let resolution = "1080p";
        let hasSubtitles = false;

        try {
          const meta = await sublix.downloaderFileMeta(selected);
          if (meta?.resolution) resolution = meta.resolution;
          if (meta?.subs_langs && meta.subs_langs.length > 0) hasSubtitles = true;
        } catch {
          // bỏ qua lỗi probe meta
        }

        const newSrc: MockVideoSource = {
          id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: fileName,
          path: selected,
          durationSec: 1800,
          sizeMb: 1024,
          fps: 60,
          resolution,
          hasSubtitles,
        };
        setSources((prev) => [...prev, newSrc]);
        return;
      }
    } catch (err) {
      console.warn("Lỗi mở hộp chọn file Tauri, dùng video mẫu:", err);
    }

    // Fallback cho môi trường browser
    const newSrc: MockVideoSource = {
      id: `v_${Date.now()}`,
      name: `Gameplay_Part_${sources.length + 1}.mp4`,
      durationSec: 1800,
      sizeMb: 1500,
      fps: 60,
      resolution: "1920x1080",
      hasSubtitles: false,
    };
    setSources((prev) => [...prev, newSrc]);
  };

  const handleAddStudioProject = async () => {
    try {
      if (typeof window !== "undefined" && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
        const selected = await sublix.selectMediaFile();
        if (!selected) return;

        const fileName = selected.replace(/^.*[/\\]/, "");
        const newSrc: MockVideoSource = {
          id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: fileName,
          path: selected,
          durationSec: 1800,
          sizeMb: 120,
          fps: 60,
          resolution: "Studio",
          hasSubtitles: true,
          studioProjectName: selected,
        };
        setSources((prev) => [...prev, newSrc]);
        showToast(`Đã thêm dự án Studio "${fileName}" (sử dụng thoại có sẵn).`);
        return;
      }
    } catch (err) {
      console.warn("Lỗi chọn dự án Studio:", err);
    }

    showToast("Đã thêm dự án Studio mẫu.");
  };

  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAnalyzing(false);
    showToast("Đã dừng quá trình phân tích.");
  };

  const handleStartAnalysis = async () => {
    if (!isMockMode && !isLlmReady) {
      setMissingAiActive(true);
      return;
    }

    setMissingAiActive(false);
    setAnalysisError(null);
    setIsAnalyzing(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await labApi.analyze(
        {
          sources,
          gameName,
          webSearch,
        },
        (p) => setAnalyzeProgress(p),
        controller.signal,
      );

      setChapters(res.chapters);
      setCharacters(res.characters);
      setJunkSegments(res.junkSegments);

      if (!unlockedSteps.includes("narration")) {
        setUnlockedSteps([...unlockedSteps, "narration"]);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        showToast("Đã dừng phân tích.");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setAnalysisError(msg);
      }
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  const handleNextFromSource = async () => {
    if (sources.length === 0) {
      showToast("Vui lòng thêm ít nhất 1 video nguồn để phân tích.");
      return;
    }

    if (!isMockMode && !isLlmReady) {
      setMissingAiActive(true);
      setCurrentStep("analyze");
      return;
    }

    setCurrentStep("analyze");
    if (!unlockedSteps.includes("analyze")) {
      setUnlockedSteps([...unlockedSteps, "analyze"]);
    }
    if (chapters.length === 0 && !isAnalyzing) {
      void handleStartAnalysis();
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
            onAddSource={handleAddSource}
            onAddStudioProject={handleAddStudioProject}
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
            isLlmReady={isLlmReady}
            llmProviderName={llmProviderName}
            onOpenSettings={handleOpenSettingsAction}
            isMockMode={isMockMode}
            onToggleMockMode={handleToggleMockMode}
          />
        )}

        {currentStep === "analyze" && (
          missingAiActive ? (
            <MissingAIState
              onOpenSettings={handleOpenSettingsAction}
              onRetry={() => {
                void checkLlmConfig().then(() => {
                  if (isLlmReady || isMockMode) {
                    setMissingAiActive(false);
                    void handleStartAnalysis();
                  } else {
                    showToast("Vẫn chưa tìm thấy API key của LLM.");
                  }
                });
              }}
            />
          ) : analysisError ? (
            <LabErrorState
              errorMessage={analysisError}
              onRetry={handleStartAnalysis}
            />
          ) : isAnalyzing ? (
            <AnalyzeProgress
              progress={analyzeProgress}
              onCancel={handleCancelAnalysis}
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

      {/* Thông báo Toast */}
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
