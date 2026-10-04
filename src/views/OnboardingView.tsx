//! Onboarding window — first-run setup for Sublix v0.5.0.

import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { sublix, type SetupStatus } from "../lib/tauri";
import heroUrl from "../assets/hero-cinema.jpg";
import "./OnboardingView.css";

type StepState = "pending" | "downloading" | "done" | "error" | "skipped";

interface Step {
  key: "whisper_binary" | "stt_model" | "translation_model";
  state: StepState;
  message?: string;
  selectedVariant?: string;
}

const DEFAULT_STT_VARIANT = "large-v3-turbo-q8_0";
const DEFAULT_TRANS_VARIANT = "qwen3-4b";

export default function OnboardingView({ onComplete }: { onComplete: () => void }) {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [steps, setSteps] = useState<Record<string, Step>>({
    whisper_binary: { key: "whisper_binary", state: "pending" },
    stt_model: { key: "stt_model", state: "pending", selectedVariant: DEFAULT_STT_VARIANT },
    translation_model: { key: "translation_model", state: "pending", selectedVariant: DEFAULT_TRANS_VARIANT },
  });

  useEffect(() => {
    refresh();
    const unlistens: UnlistenFn[] = [];

    listen<{
      phase: string;
      component: string;
      variant?: string;
      message?: string;
    }>("setup:progress", (e) => {
      const { component, phase, message, variant } = e.payload;
      setSteps((prev) => {
        const cur = prev[component];
        if (!cur) return prev;
        const next: Step = { ...cur };
        if (phase === "downloading") {
          next.state = "downloading";
          next.message = message;
          if (variant) next.selectedVariant = variant;
        } else if (phase === "done") {
          next.state = "done";
          next.message = undefined;
        } else if (phase === "error") {
          next.state = "error";
          next.message = message;
        }
        return { ...prev, [component]: next };
      });
    }).then((u) => unlistens.push(u));

    return () => unlistens.forEach((u) => u());
  }, []);

  async function refresh() {
    try {
      const s = await sublix.checkSetup();
      setSetup(s);

      setSteps((prev) => {
        const next = { ...prev };
        if (s.has_whisper_binary) {
          next.whisper_binary = { ...next.whisper_binary, state: "done" };
        }
        const downloadedStt = s.stt_models.find((m) => m.downloaded);
        if (downloadedStt) {
          next.stt_model = {
            ...next.stt_model,
            state: "done",
            selectedVariant: downloadedStt.name,
          };
        }
        const downloadedTrans = s.translation_models?.find((m) => m.downloaded);
        if (downloadedTrans) {
          next.translation_model = {
            ...next.translation_model,
            state: "done",
            selectedVariant: downloadedTrans.name,
          };
        }
        return next;
      });
    } catch (e) {
      console.error("checkSetup failed:", e);
    }
  }

  useEffect(() => {
    if (setup && !setup.has_whisper_binary && steps.whisper_binary.state === "pending") {
      handleDownloadWhisperBinary();
    }
    if (
      setup &&
      setup.has_whisper_binary &&
      steps.stt_model.state === "pending" &&
      !setup.stt_models.some((m) => m.downloaded)
    ) {
      handleDownloadSttModel(DEFAULT_STT_VARIANT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  async function handleDownloadWhisperBinary() {
    setSteps((p) => ({ ...p, whisper_binary: { ...p.whisper_binary, state: "downloading" } }));
    try {
      await sublix.downloadWhisperBinary();
    } catch (e) {
      setSteps((p) => ({
        ...p,
        whisper_binary: { ...p.whisper_binary, state: "error", message: String(e) },
      }));
    }
  }

  async function handleDownloadSttModel(variant: string) {
    setSteps((p) => ({
      ...p,
      stt_model: { ...p.stt_model, state: "downloading", selectedVariant: variant },
    }));
    try {
      await sublix.downloadSttModel(variant);
    } catch (e) {
      setSteps((p) => ({
        ...p,
        stt_model: { ...p.stt_model, state: "error", message: String(e) },
      }));
    }
  }

  async function handleDownloadTranslationModel(variant?: string) {
    const v = variant ?? steps.translation_model.selectedVariant ?? DEFAULT_TRANS_VARIANT;
    setSteps((p) => ({
      ...p,
      translation_model: { ...p.translation_model, state: "downloading", selectedVariant: v },
    }));
    try {
      await sublix.downloadTranslationModel(v);
    } catch (e) {
      setSteps((p) => ({
        ...p,
        translation_model: { ...p.translation_model, state: "error", message: String(e) },
      }));
    }
  }

  function handleSkipTranslation() {
    setSteps((p) => ({ ...p, translation_model: { ...p.translation_model, state: "skipped" } }));
  }

  const canContinue =
    steps.whisper_binary.state === "done" &&
    steps.stt_model.state === "done";

  return (
    <div className="onb-root">
      <header className="onb-header">
        <h1>Welcome to Sublix v0.5.0</h1>
        <p className="onb-tagline">
          Real-time GPU subtitle overlay (Whisper Large-v3-Turbo + Qwen3 / Gemma 3).
        </p>
      </header>

      <img className="onb-hero" src={heroUrl} alt="Rạp chiếu phim tại nhà với phụ đề" />

      <StepCard
        icon="📦"
        title="Whisper.cpp (speech recognition engine)"
        description="Windows CUDA/CPU binary that runs speech recognition locally."
        state={steps.whisper_binary.state}
        message={steps.whisper_binary.message}
        sizeLabel="~30MB"
        actionLabel="Download now"
        onAction={handleDownloadWhisperBinary}
        showActionWhen={["pending", "error"]}
      />

      <StepCard
        icon="🧠"
        title="Whisper STT Model"
        description={
          setup?.stt_models.find((m) => m.downloaded)
            ? `Model "${steps.stt_model.selectedVariant}" is installed.`
            : "Large-v3-Turbo Q8 is recommended for NVIDIA GPUs (~0.1s latency, high accuracy)."
        }
        state={steps.stt_model.state}
        message={steps.stt_model.message}
        sizeLabel="75MB – 3GB"
        actionLabel="Download"
        onAction={() => handleDownloadSttModel(steps.stt_model.selectedVariant ?? DEFAULT_STT_VARIANT)}
        showActionWhen={["pending", "error"]}
        extra={
          <div className="onb-model-picker">
            <label>Model:</label>
            <select
              value={steps.stt_model.selectedVariant ?? DEFAULT_STT_VARIANT}
              disabled={steps.stt_model.state === "downloading"}
              onChange={(e) => {
                const v = e.target.value;
                setSteps((p) => ({ ...p, stt_model: { ...p.stt_model, selectedVariant: v } }));
              }}
              className="onb-select"
            >
              {setup?.stt_models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.label} {m.downloaded ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <StepCard
        icon="🌐"
        title="Translation LLM (2026 Local AI)"
        description="Translates subtitles to Vietnamese locally on your GPU (Qwen3-4B / Gemma-3-4B)."
        state={steps.translation_model.state}
        message={steps.translation_model.message}
        sizeLabel="1.1GB – 5GB"
        actionLabel="Download"
        onAction={() => handleDownloadTranslationModel()}
        showActionWhen={["pending", "error"]}
        skipActionLabel="Skip for now"
        onSkip={handleSkipTranslation}
        showSkipWhen={["pending", "error"]}
        extra={
          <div className="onb-model-picker">
            <label>LLM:</label>
            <select
              value={steps.translation_model.selectedVariant ?? DEFAULT_TRANS_VARIANT}
              disabled={steps.translation_model.state === "downloading"}
              onChange={(e) => {
                const v = e.target.value;
                setSteps((p) => ({
                  ...p,
                  translation_model: { ...p.translation_model, selectedVariant: v },
                }));
              }}
              className="onb-select"
            >
              {setup?.translation_models?.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.label} {m.downloaded ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="onb-actions">
        <button
          onClick={() => sublix.openModelsFolder()}
          className="onb-btn-secondary"
          title="Open models folder"
        >
          📁 Open models folder
        </button>
        <button
          onClick={onComplete}
          disabled={!canContinue}
          className="onb-btn-primary"
        >
          {canContinue ? "Open Sublix →" : "Complete setup to continue..."}
        </button>
      </div>

      <footer className="onb-footer">
        All processing happens 100% locally on your GPU/CPU. No API key. No cloud cost.
      </footer>
    </div>
  );
}

interface StepCardProps {
  icon: string;
  title: string;
  description: string;
  state: StepState;
  message?: string;
  sizeLabel: string;
  actionLabel: string;
  onAction: () => void;
  showActionWhen: StepState[];
  skipActionLabel?: string;
  onSkip?: () => void;
  showSkipWhen?: StepState[];
  extra?: React.ReactNode;
}

function StepCard({
  icon, title, description, state, message, sizeLabel,
  actionLabel, onAction, showActionWhen,
  skipActionLabel, onSkip, showSkipWhen, extra,
}: StepCardProps) {
  return (
    <div className={`onb-step onb-step-${state}`}>
      <div className="onb-step-icon">{icon}</div>
      <div className="onb-step-body">
        <div className="onb-step-title-row">
          <h3 className="onb-step-title">{title}</h3>
          <span className="onb-step-size">{sizeLabel}</span>
        </div>
        <p className="onb-step-desc">{description}</p>
        {extra}
        {state === "downloading" && (
          <div className="onb-progress">
            <div className="onb-progress-bar onb-progress-bar-indeterminate" />
            <div className="onb-progress-message">{message ?? "Downloading..."}</div>
          </div>
        )}
        {state === "error" && message && (
          <div className="onb-error-msg">⚠ {message}</div>
        )}
        {state === "skipped" && (
          <div className="onb-skip-msg">Skipped — you can download later in Settings.</div>
        )}
      </div>
      <div className="onb-step-state">
        {state === "pending" && <span className="onb-state-dot onb-state-pending">○</span>}
        {state === "downloading" && <span className="onb-state-dot onb-state-downloading">⏳</span>}
        {state === "done" && <span className="onb-state-dot onb-state-done">✓</span>}
        {state === "error" && <span className="onb-state-dot onb-state-error">✗</span>}
        {state === "skipped" && <span className="onb-state-dot onb-state-skipped">—</span>}
      </div>
      <div className="onb-step-actions">
        {showActionWhen.includes(state) && (
          <button onClick={onAction} className="onb-btn-secondary">
            {actionLabel}
          </button>
        )}
        {showSkipWhen?.includes(state) && onSkip && (
          <button onClick={onSkip} className="onb-btn-link">
            {skipActionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
