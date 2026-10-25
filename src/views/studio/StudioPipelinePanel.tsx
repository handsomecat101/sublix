import { memo, useState } from "react";
import { ContextMenu } from "../../components/ui/ContextMenu";
import { Segmented } from "../../components/ui/Segmented";
import { SplitButton } from "../../components/ui/SplitButton";
import StudioVoiceStep from "./StudioVoiceStep";
import StudioTranslateOptions from "./StudioTranslateOptions";
import StudioSttEnginePicker from "./StudioSttEnginePicker";
import StudioGlossaryDrawer from "./StudioGlossaryDrawer";
import type { Glossary } from "../../lib/types";

/** Bảng rỗng dùng chung (không tạo object mới mỗi render → giữ React.memo của drawer). */
const EMPTY_GLOSSARY: Glossary = { terms: [], pronouns: [], locked: false };
import { formatDuration } from "../../lib/timeline/estimate";
import {
  PIPELINE_STEPS,
  STT_LANG_OPTIONS,
  STT_MODEL_OPTIONS,
  TARGET_LANG_OPTIONS,
  TRANS_STYLE_OPTIONS,
  type PipelineOpenStep,
  type StudioPipelineApi,
  type StudioPipelineState,
} from "./studioPipelineTypes";
import "./StudioPipelinePanel.css";

/**
 * StudioPipelinePanel — panel trái của Studio, viết lại theo quy trình 5 bước.
 *
 * Thay panel cũ (45 control → 20 control + 3 trong "Nâng cao"):
 * - Thanh rail 5 bước: Nguồn → Phụ đề → Dịch → Lồng tiếng → Xuất.
 * - Accordion: chỉ 1 bước mở tại 1 thời điểm → panel luôn vừa 1 màn 1080p.
 * - 1 nút chạy duy nhất (split button `▶ Chạy N bước đã bật | ▾`).
 * - Nhà cung cấp dịch: dòng CHỈ ĐỌC + liên kết mở Cài đặt.
 *
 * Component bọc `React.memo`; props là state nguyên thuỷ + handler ổn định.
 * KHÔNG truyền `currentTime` vào panel (timeline phát ở 60fps).
 */
export interface StudioPipelinePanelProps {
  state: StudioPipelineState;
  api: StudioPipelineApi;
  /** Bước đang mở để dựng rail (5 bước). */
  activeStep: "source" | "sub" | "translate" | "voice" | "export";
  /** Nội dung thêm hiển thị trong mục "Nâng cao" (vd thống kê & đánh giá kịch bản). */
  advancedExtra?: React.ReactNode;
}

function StudioPipelinePanelInner({
  state,
  api,
  activeStep,
  advancedExtra,
}: StudioPipelinePanelProps) {
  const [runMenuOpen, setRunMenuOpen] = useState(false);

  // Số bước đang bật → nhãn nút chạy.
  const enabledSteps = [
    state.workflowStt ? "Phụ đề" : null,
    state.workflowTranslate ? "Dịch" : null,
    state.workflowVoice ? "Lồng tiếng" : null,
  ].filter((x): x is string => x !== null);
  const runLabel = state.queuedPosition !== null
    ? `■ Hủy chờ — Đang chờ #${state.queuedPosition}`
    : state.running
    ? `■ Dừng — ${state.runningLabel || "đang xử lý"}`
    : enabledSteps.length > 0
    ? `▶ Chạy ${enabledSteps.length} bước đã bật`
    : "▶ Chạy (chưa bật bước nào)";

  const toggleStep = (step: PipelineOpenStep) => {
    api.setOpenStep(state.openStep === step ? null : step);
  };

  /** Dòng ước tính / tiến độ thật của 1 bước (gọn 1 dòng, chữ nhỏ). */
  const stepHint = (stepId: "stt" | "translate" | "tts") => {
    if (state.liveProgress && state.liveProgress.stepId === stepId) {
      return <div className="spp-estimate live">{state.liveProgress.text}</div>;
    }
    const estimate = state.stepEstimates.find((item) => item.id === stepId);
    if (!estimate) return null;
    const count = estimate.segmentCount ? ` (~${estimate.segmentCount} câu)` : "";
    return (
      <div className="spp-estimate">
        ⏱ {estimate.label} ({estimate.detail}): ~{formatDuration(estimate.seconds)}
        {count}
      </div>
    );
  };

  const totalEstimate = state.stepEstimates.reduce((sum, item) => sum + item.seconds, 0);

  return (
    <div className="spp-root">
      {/* ── Rail 5 bước ─────────────────────────────────────────────── */}
      <div className="spp-rail">
        {PIPELINE_STEPS.map((step, index) => {
          const isDone =
            (step.id === "source" && state.segmentCount > 0) ||
            (step.id === "sub" && state.workflowStt && state.segmentCount > 0) ||
            (step.id === "translate" && state.workflowTranslate && state.segmentCount > 0);
          const isCurrent = step.id === activeStep;
          const isLast = index === PIPELINE_STEPS.length - 1;
          return (
            <div key={step.id} className="spp-rail-item">
              <button
                type="button"
                className={`spp-rail-dot${isDone ? " done" : ""}${isCurrent ? " cur" : ""}`}
                style={isCurrent ? { borderColor: step.color, color: step.color } : undefined}
                title={step.label}
                onClick={() => {
                  if (step.id === "export") api.openExport();
                  else if (step.id === "voice") toggleStep("voice");
                  else if (step.id === "translate") toggleStep("translate");
                  else if (step.id === "sub") toggleStep("sub");
                }}
              >
                {isDone ? "✓" : index + 1}
              </button>
              <span className={`spp-rail-label${isCurrent ? " cur" : ""}`}>{step.label}</span>
              {!isLast ? <span className={`spp-rail-line${isDone ? " done" : ""}`} /> : null}
            </div>
          );
        })}
      </div>

      {/* ── Các bước ────────────────────────────────────────────────── */}
      <div className="spp-steps">
        {/* Bước 2 — Phụ đề gốc */}
        <section className={`spp-card${state.openStep === "sub" ? " open" : ""}`}>
          <header className="spp-card-head" onClick={() => toggleStep("sub")}>
            <span className="spp-card-num" style={{ background: "var(--step-sub)" }}>
              2
            </span>
            <div className="spp-card-titles">
              <div className="spp-card-title">Phụ đề gốc</div>
              <div className="spp-card-sub">
                {state.segmentCount > 0
                  ? `${state.segmentCount} câu${state.sourceLabel ? ` · ${state.sourceLabel}` : ""}`
                  : "chưa có phụ đề"}
              </div>
            </div>
            {state.segmentCount > 0 ? <span className="spp-pill ok">Xong</span> : null}
            <button
              type="button"
              className="spp-toggle"
              aria-label="Bật/Tắt bước Phụ đề"
              onClick={(e) => {
                e.stopPropagation();
                api.setWorkflowStt(!state.workflowStt);
              }}
            >
              <span className={`spp-switch${state.workflowStt ? " on" : ""}`} />
            </button>
            <button
              type="button"
              className="spp-run-mini"
              title="Chạy riêng bước này"
              onClick={(e) => {
                e.stopPropagation();
                api.runStepSub();
              }}
            >
              ▶
            </button>
            <span className="spp-caret">{state.openStep === "sub" ? "⌄" : "›"}</span>
          </header>
          {stepHint("stt")}
          {state.openStep === "sub" ? (
            <div className="spp-card-body">
              {/* [TSK-STUDIO-WIRE-CTX-STT] Chọn engine nhận dạng (Whisper / SenseVoice / Paraformer…),
                  danh sách lấy từ backend `stt_engines_status` — không hard-code. */}
              <StudioSttEnginePicker
                engines={state.sttEngines}
                selectedId={state.sttSelectedEngineId}
                sourceLang={state.sttLang}
                progress={state.sttDownloadProgress}
                onSelect={api.selectSttEngine}
                onDownload={api.downloadSttModel}
                onCancel={api.cancelSttModelDownload}
              />
              <div className="spp-field">
                <span className="spp-label">Ngôn ngữ gốc</span>
                <select
                  className="spp-select"
                  value={state.sttLang}
                  onChange={(e) => api.setSttLang(e.target.value)}
                >
                  {STT_LANG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {state.sourceLabel ? (
                <div className="spp-field">
                  <span className="spp-label">Dùng phụ đề có sẵn</span>
                  <button
                    type="button"
                    className="spp-toggle-row"
                    onClick={() => api.setPreferExistingSrt(!state.preferExistingSrt)}
                  >
                    <span>{state.sourceLabel}</span>
                    <span className={`spp-switch${state.preferExistingSrt ? " on" : ""}`} />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Bước 3 — Dịch */}
        <section className={`spp-card${state.openStep === "translate" ? " open" : ""}`}>
          <header className="spp-card-head" onClick={() => toggleStep("translate")}>
            <span className="spp-card-num" style={{ background: "var(--step-tr)" }}>
              3
            </span>
            <div className="spp-card-titles">
              <div className="spp-card-title">Dịch</div>
              <div className="spp-card-sub">
                → {TARGET_LANG_OPTIONS.find((o) => o.value === state.targetLang)?.label ?? state.targetLang}
                {" · "}
                {TRANS_STYLE_OPTIONS.find((o) => o.value === state.transStyle)?.label ?? state.transStyle}
              </div>
            </div>
            <button
              type="button"
              className="spp-toggle"
              aria-label="Bật/Tắt bước Dịch"
              onClick={(e) => {
                e.stopPropagation();
                api.setWorkflowTranslate(!state.workflowTranslate);
              }}
            >
              <span className={`spp-switch${state.workflowTranslate ? " on" : ""}`} />
            </button>
            <button
              type="button"
              className="spp-run-mini"
              title="Chạy riêng bước này"
              onClick={(e) => {
                e.stopPropagation();
                api.runStepTranslate();
              }}
            >
              ▶
            </button>
            <span className="spp-caret">{state.openStep === "translate" ? "⌄" : "›"}</span>
          </header>
          {stepHint("translate")}
          {state.openStep === "translate" ? (
            <div className="spp-card-body">
              <div className="spp-field">
                <span className="spp-label">Ngôn ngữ đích</span>
                <select
                  className="spp-select"
                  value={state.targetLang}
                  onChange={(e) => api.setTargetLang(e.target.value)}
                >
                  {TARGET_LANG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="spp-field">
                <span className="spp-label">Phong cách</span>
                <Segmented
                  options={TRANS_STYLE_OPTIONS}
                  value={state.transStyle}
                  onChange={(value) => api.setTransStyle(value)}
                  ariaLabel="Phong cách dịch"
                />
              </div>
              {/* TSK-STUDIO-MODEL-PICKER: chọn model dịch + mức suy luận NGAY tại Studio
                  (PO: không đẩy người dùng sang tab Cài đặt). */}
              <StudioTranslateOptions
                options={state.translateOptions}
                loading={state.translateOptionsLoading}
                unavailable={state.translateOptionsUnavailable}
                hasProviderKey={api.hasProviderKey}
                onSelectModel={api.selectTranslateModel}
                onSelectEffort={api.selectReasoningEffort}
                onOpenSettings={api.openSettings}
                contextual={state.contextualTranslate}
                onContextualChange={api.setContextualTranslate}
                provider={state.translateProvider}
                glossaryHint={state.glossaryHint}
              />
              {state.translatePhase ? (
                <div className="spp-estimate live">{state.translatePhase}</div>
              ) : null}
              {/* [TSK-STUDIO-GLOSSARY] Nút mở bảng thuật ngữ + xưng hô đã duyệt. */}
              <div className="spp-field">
                <span className="spp-label">Thuật ngữ &amp; xưng hô</span>
                <button
                  type="button"
                  className="spp-glossary-btn"
                  onClick={() => api.openGlossary()}
                  title="Mở bảng thuật ngữ + xưng hô (tự động lưu, không cần bấm Lưu)"
                >
                  📖 Thuật ngữ &amp; xưng hô ({state.glossaryCount})
                  {state.glossaryLocked ? " 🔒" : ""}
                </button>
              </div>
              {state.providerLabel ? (
                <div className="spp-provider-row">
                  <span className="spp-provider-text">
                    Đang dùng: {state.providerLabel}
                  </span>
                  <button type="button" className="spp-link-btn" onClick={() => api.openSettings()}>
                    Cài đặt nâng cao
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Bước 4 — Lồng tiếng */}
        <section className={`spp-card${state.openStep === "voice" ? " open" : ""}`}>
          <header className="spp-card-head" onClick={() => toggleStep("voice")}>
            <span className="spp-card-num" style={{ background: "var(--step-dub)" }}>
              4
            </span>
            <div className="spp-card-titles">
              <div className="spp-card-title">Lồng tiếng</div>
              <div className="spp-card-sub">
                {state.roles.length} vai
                {state.selectedEngineId ? ` · ${state.selectedEngineId}` : ""}
              </div>
            </div>
            <button
              type="button"
              className="spp-toggle"
              aria-label="Bật/Tắt bước Lồng tiếng"
              onClick={(e) => {
                e.stopPropagation();
                api.setWorkflowVoice(!state.workflowVoice);
              }}
            >
              <span className={`spp-switch${state.workflowVoice ? " on" : ""}`} />
            </button>
            <button
              type="button"
              className="spp-run-mini"
              title="Chạy riêng bước này"
              onClick={(e) => {
                e.stopPropagation();
                api.runStepVoice();
              }}
            >
              ▶
            </button>
            <span className="spp-caret">{state.openStep === "voice" ? "⌄" : "›"}</span>
          </header>
          {stepHint("tts")}
          {state.openStep === "voice" ? <StudioVoiceStep state={state} api={api} /> : null}
        </section>

        {/* Nâng cao */}
        <section className={`spp-card adv${state.openStep === "advanced" ? " open" : ""}`}>
          <header className="spp-card-head" onClick={() => toggleStep("advanced")}>
            <span className="spp-card-num adv-num">⚙</span>
            <div className="spp-card-titles">
              <div className="spp-card-title">Nâng cao</div>
              {/* [TSK-STUDIO-GLOSSARY] Bảng thuật ngữ + xưng hô đã chuyển sang bước "Dịch"
                  ⇒ bỏ "Hồ sơ phim" khỏi phụ đề card "Nâng cao". */}
              <div className="spp-card-sub">Mô hình nhận dạng</div>
            </div>
            <span className="spp-caret">{state.openStep === "advanced" ? "⌄" : "›"}</span>
          </header>
          {state.openStep === "advanced" ? (
            <div className="spp-card-body">
              <div className="spp-field">
                <span className="spp-label">Mô hình nhận dạng</span>
                <select
                  className="spp-select"
                  value={state.sttModel}
                  onChange={(e) => api.setSttModel(e.target.value)}
                >
                  {STT_MODEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* [TSK-STUDIO-GLOSSARY] Ô chip "Hồ sơ phim" cũ đã bỏ —
                  thay bằng nút mở GlossaryEditor ở bước "Dịch". */}
              {advancedExtra ? <div className="spp-advanced-extra">{advancedExtra}</div> : null}
            </div>
          ) : null}
        </section>
      </div>

      {/* ── Nút chạy duy nhất ─────────────────────────────────────────── */}
      <div className="spp-foot">
        <SplitButton
          label={runLabel}
          title={state.running ? "Dừng xử lý" : "Chạy quy trình (Ctrl+Enter)"}
          menuTitle="Chạy riêng từng bước"
          menuOpen={runMenuOpen}
          disabled={!state.running && enabledSteps.length === 0}
          onPrimary={() => (state.running ? api.cancel() : api.runAll())}
          onToggleMenu={() => setRunMenuOpen((open) => !open)}
        />
        <div className="spp-hint-center">
          {totalEstimate > 0 ? `Tổng ~${formatDuration(totalEstimate)} · ` : ""}▾ chạy riêng: phụ đề
          · dịch · lồng tiếng · vùng In–Out
        </div>
        {runMenuOpen ? (
          <ContextMenu
            x={12}
            y={Math.max(12, window.innerHeight - 210)}
            items={[
              { id: "sub", label: "Chỉ phụ đề", onSelect: () => api.runStepSub() },
              { id: "tr", label: "Chỉ dịch", onSelect: () => api.runStepTranslate() },
              { id: "dub", label: "Chỉ lồng tiếng", onSelect: () => api.runStepVoice() },
              {
                id: "range",
                label: `Chỉ vùng In–Out${state.hasRange ? ` (${state.rangeLabel})` : ""}`,
                disabled: !state.hasRange,
                hint: "Ctrl+Enter",
                onSelect: () => api.runRangeOnly(),
              },
            ]}
            onClose={() => setRunMenuOpen(false)}
          />
        ) : null}
      </div>

      {/* [TSK-STUDIO-GLOSSARY] Hộp thoại bảng thuật ngữ + xưng hô. */}
      {state.glossaryOpen ? (
        <StudioGlossaryDrawer
          value={state.glossary ?? EMPTY_GLOSSARY}
          onClose={api.closeGlossary}
          onChange={api.onGlossaryChange}
          onSuggest={api.onGlossarySuggest}
          suggesting={state.glossarySuggesting}
          suggestEstimateSec={state.glossarySuggestEstimateSec}
          onSave={api.onGlossarySave}
        />
      ) : null}
    </div>
  );
}

/** Panel quy trình — bọc `React.memo`. */
export const StudioPipelinePanel = memo(StudioPipelinePanelInner);

export default StudioPipelinePanel;
