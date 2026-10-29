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
  mapDubbingProjectToPersistedTab,
  type RecapItem,
} from "../labModel";
import { labApi, type AnalyzeStageProgress, type BuildDraftResult } from "../labApi";
import { sublix, type VoicePreset, type DubbingProject } from "../../../lib/tauri";
import type { PersistedTab } from "../../../lib/studio/sessionStore";

interface LabWizardProps {
  templateId: string;
  onBackToLibrary: () => void;
  onOpenStudioProject?: (
    projectName?: string,
    options?: { prebuiltTab?: PersistedTab | null },
  ) => void;
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

  // Lượt phân tích đang hoạt động trong backend
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Danh sách giọng TTS thật tải từ backend Studio
  const [voices, setVoices] = useState<VoicePreset[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("kokoro:vi_female");

  // Dữ liệu cấu hình bước Nguồn
  const [sources, setSources] = useState<MockVideoSource[]>([...MOCK_VIDEO_SOURCES]);
  const [gameName, setGameName] = useState<string>("Vương Miện Tro Tàn");
  const [webSearch, setWebSearch] = useState<boolean>(true);
  const [targetMinutes, setTargetMinutes] = useState<number>(10);
  const [originalRatio, setOriginalRatio] = useState<number>(0.3);
  const [voiceName] = useState<string>("Hoàng Nam (Truyền cảm)");

  // Dữ liệu bước Phân tích (A)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<AnalyzeStageProgress | undefined>();
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [chapters, setChapters] = useState<MockChapter[]>([...MOCK_CHAPTERS]);
  const [characters, setCharacters] = useState<MockCharacter[]>([...MOCK_CHARACTERS]);
  const [junkSegments, setJunkSegments] = useState<MockJunkSegment[]>([...MOCK_JUNK_SEGMENTS]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Dữ liệu bước Lời bình (B)
  const [recapItems, setRecapItems] = useState<RecapItem[]>([...MOCK_RECAP_ITEMS]);
  const [isWritingNarration, setIsWritingNarration] = useState<boolean>(false);
  const hasGeneratedNarrationRef = useRef<boolean>(false);

  // Dữ liệu bước Dựng nháp (C)
  const [isBuildingDraft, setIsBuildingDraft] = useState<boolean>(false);
  const [draftProgress, setDraftProgress] = useState<{ stageName: string; percent: number } | null>(null);
  const [draftResult, setDraftResult] = useState<BuildDraftResult | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const draftAbortControllerRef = useRef<AbortController | null>(null);

  // Thông báo Toast
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

  // Tải danh sách giọng thật từ Studio
  const loadVoices = async () => {
    try {
      const vList = await sublix.dubbingGetVoices();
      if (Array.isArray(vList) && vList.length > 0) {
        setVoices(vList);
        const viVoice = vList.find((v) => v.lang.startsWith("vi") || v.id.includes("vi"));
        if (viVoice) {
          setSelectedVoiceId(viVoice.id);
        } else {
          setSelectedVoiceId(vList[0].id);
        }
      }
    } catch (err) {
      console.warn("Không tải được danh sách giọng Studio:", err);
    }
  };

  useEffect(() => {
    void checkLlmConfig();
    void loadVoices();
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

  // Huỷ phân tích bước A
  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAnalyzing(false);
    showToast("Đã dừng quá trình phân tích.");
  };

  // Bắt đầu phân tích bước A
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

      if (res.runId) {
        setActiveRunId(res.runId);
      }
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

  // Chuyển từ Nguồn sang Phân tích
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

  // Tạo lời bình bằng AI (Bước B)
  const handleGenerateNarration = async () => {
    setIsWritingNarration(true);
    try {
      const items = await labApi.writeNarration({
        runId: activeRunId || undefined,
        gameName,
        targetDurationSec: targetMinutes * 60,
        originalRatio,
      });
      setRecapItems(items);
      hasGeneratedNarrationRef.current = true;
      showToast("Đã hoàn tất kịch bản lời bình!");
    } catch (err) {
      showToast(`Lỗi viết lời bình: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsWritingNarration(false);
    }
  };

  // Chuyển từ Phân tích sang Lời bình
  const handleNextFromAnalyze = async () => {
    setCurrentStep("narration");
    if (!unlockedSteps.includes("narration")) {
      setUnlockedSteps([...unlockedSteps, "narration"]);
    }
    // Tự động gọi viết lời bình nếu chưa tạo và có runId thật
    if (!hasGeneratedNarrationRef.current && activeRunId && !isMockMode) {
      void handleGenerateNarration();
    }
  };

  // Huỷ dựng video nháp (Bước C)
  const handleCancelDraft = () => {
    if (draftAbortControllerRef.current) {
      draftAbortControllerRef.current.abort();
      draftAbortControllerRef.current = null;
    }
    setIsBuildingDraft(false);
    showToast("Đã gửi yêu cầu dừng dựng nháp.");
  };

  // Bắt đầu dựng video nháp (Bước C)
  const handleStartBuildDraft = async () => {
    setIsBuildingDraft(true);
    setDraftError(null);
    setDraftProgress({ stageName: "Đang đọc giọng thuyết minh TTS...", percent: 10 });

    const controller = new AbortController();
    draftAbortControllerRef.current = controller;

    try {
      const res = await labApi.buildDraft(
        {
          runId: activeRunId || undefined,
          items: recapItems,
          voiceId: selectedVoiceId,
          targetDurationSec: targetMinutes * 60,
          originalRatio,
        },
        (stage, percent) => {
          let stageName = "Đang dựng video nháp...";
          if (stage === "tts") stageName = "Đang đọc giọng thuyết minh TTS...";
          else if (stage === "match") stageName = "Đang khớp khung hình gameplay & cutscene...";
          else if (stage === "render") stageName = "Kiểm tra luật dựng và xuất video nháp...";
          else if (stage === "done") stageName = "Hoàn tất dựng video nháp";
          setDraftProgress({ stageName, percent });
        },
        controller.signal,
      );

      setDraftResult(res);
      setRecapItems(res.items);
      showToast("Đã dựng video nháp thành công!");
    } catch (err) {
      if (controller.signal.aborted) {
        showToast("Đã dừng quá trình dựng nháp.");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setDraftError(msg);
      }
    } finally {
      setIsBuildingDraft(false);
      draftAbortControllerRef.current = null;
    }
  };

  // Chuyển từ Lời bình sang Dựng nháp
  const handleNextFromNarration = async () => {
    setCurrentStep("draft");
    if (!unlockedSteps.includes("draft")) {
      setUnlockedSteps([...unlockedSteps, "draft"]);
    }
    if (!draftResult && !isBuildingDraft) {
      void handleStartBuildDraft();
    }
  };

  // Mở bản nháp đã dựng sang Studio
  const handleOpenStudio = async () => {
    const isMock = isLabMockMode();
    const targetPath = draftResult?.draftPath || (isMock ? "draft-crown-1.mp4" : "");
    if (!targetPath) {
      showToast("Chưa có video nháp để mở trong Studio. Vui lòng hoàn thành bước dựng nháp.");
      return;
    }

    try {
      const res = await labApi.openInStudio(targetPath);
      let prebuiltTab: PersistedTab | null = null;
      if (res.project) {
        prebuiltTab = mapDubbingProjectToPersistedTab(res.project);
      } else if (isMock && draftResult?.items) {
        // Tạo project giả lập trong mock mode để user demo thấy sẵn các câu trên timeline Studio
        const mockProject: DubbingProject = {
          input_path: targetPath,
          media_duration_sec: draftResult.totalSec,
          speakers: [
            {
              id: "narrator",
              label: "Người dẫn (AI)",
              voice: selectedVoiceId || "vi-VN-Standard-A",
              pitch: "+0Hz",
              rate: "+0%",
              gender: "female",
            },
            {
              id: "orig",
              label: "Tiếng gốc game",
              voice: "",
              pitch: "+0Hz",
              rate: "+0%",
              gender: "male",
            },
          ],
          segments: draftResult.items.map((it, idx) => ({
            id: idx + 1,
            speaker_id: it.keepOriginal ? "orig" : "narrator",
            start_sec: it.start,
            end_sec: it.end,
            original_text: it.narration,
            dubbed_text: it.keepOriginal ? "" : it.narration,
            status: "ready",
          })),
          bgm_volume: 0.3,
          voice_volume: 1.0,
        };
        prebuiltTab = mapDubbingProjectToPersistedTab(mockProject);
      }

      showToast(`Đã nạp dự án "${res.studioTabTitle}". Đang mở trong Studio...`);
      onOpenStudioProject?.(targetPath, { prebuiltTab });
    } catch (err) {
      showToast(`Lỗi mở Studio: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Đóng wizard và dọn dẹp
  const handleBackToLibraryInternal = () => {
    if (activeRunId) {
      void labApi.forgetRun(activeRunId);
    }
    onBackToLibrary();
  };

  return (
    <div className="lab-wizard">
      <WizardStepBar
        currentStep={currentStep}
        unlockedSteps={unlockedSteps}
        onNavigateStep={(s) => setCurrentStep(s)}
        onBackToLibrary={handleBackToLibraryInternal}
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
            voices={voices}
            selectedVoiceId={selectedVoiceId}
            onChangeVoiceId={setSelectedVoiceId}
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
            onRegenerate={handleGenerateNarration}
            isGenerating={isWritingNarration}
          />
        )}

        {currentStep === "draft" && (
          draftError ? (
            <LabErrorState
              errorMessage={draftError}
              onRetry={handleStartBuildDraft}
            />
          ) : isBuildingDraft ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "48px 32px",
                maxWidth: "600px",
                margin: "auto",
                width: "100%",
                gap: "24px",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 8px 0" }}>
                  Đang dựng video nháp
                </h2>
                <p style={{ fontSize: "13px", color: "var(--t3)", margin: 0 }}>
                  Đọc TTS giọng thuyết minh, khớp khung hình gameplay & cutscene, render bằng FFmpeg...
                </p>
              </div>

              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--t2)" }}>
                  <span>{draftProgress?.stageName || "Đang xử lý..."}</span>
                  <span style={{ fontWeight: 800, color: "var(--ac-txt)", fontFamily: "monospace" }}>
                    {draftProgress?.percent ?? 0}%
                  </span>
                </div>
                <div
                  style={{
                    height: "8px",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: "4px",
                    overflow: "hidden",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${draftProgress?.percent ?? 10}%`,
                      background: "var(--grad-ac)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                className="lab-btn-secondary"
                onClick={handleCancelDraft}
                style={{ marginTop: "12px" }}
              >
                Huỷ dựng nháp
              </button>
            </div>
          ) : (
            <DraftResult
              items={draftResult?.items || recapItems}
              onOpenStudio={handleOpenStudio}
              onRebuild={handleStartBuildDraft}
              draftPath={draftResult?.draftPath}
              notes={draftResult?.notes}
              warningsCount={draftResult?.warningsCount}
              unplaced={draftResult?.unplaced}
              rulesPassed={draftResult?.rulesPassed}
            />
          )
        )}
      </div>

      <StepFooter
        onBack={
          currentStep === "source"
            ? handleBackToLibraryInternal
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
            ? isWritingNarration
              ? "Đang viết lời bình..."
              : "Dựng nháp timeline"
            : "🎬 Mở trong Studio"
        }
        nextLoading={isAnalyzing || isWritingNarration || isBuildingDraft}
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
