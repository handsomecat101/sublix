//! TSK-UI-REDESIGN-R2-5: mục "Dịch thuật" — HỢP NHẤT 5 nhà cung cấp về 1 nơi
//! (Ollama · GGUF nhúng · MiniMax · DeepSeek · OpenRouter). Tự lưu khi đổi
//! nhà cung cấp/model; key đã lưu chỉ hiện 4 ký tự cuối và không bao giờ bị
//! ghi đè bởi ô nhập rỗng.

import type { SettingsCtx, TransProvider } from "./types";
import { Segmented } from "../../components/ui/Segmented";
import { REASONING_EFFORTS, REASONING_LABELS } from "./configMerge";

const REASON_OPTIONS = REASONING_EFFORTS.map((v) => ({ value: v, label: REASONING_LABELS[v] }));

const PROVIDERS: ReadonlyArray<{
  id: TransProvider;
  name: string;
  sub: string;
}> = [
  { id: "ollama", name: "Ollama (máy này)", sub: "Miễn phí · offline · iGPU AMD" },
  { id: "local", name: "GGUF nhúng", sub: "llama-server · offline" },
  { id: "minimax", name: "MiniMax M3", sub: "Mạng · cần API key" },
  { id: "deepseek", name: "DeepSeek", sub: "Mạng · rẻ · nhanh" },
  { id: "openrouter", name: "OpenRouter", sub: "Mạng · nhiều model" },
];

const MINIMAX_MODELS = [
  { id: "MiniMax-M3", label: "⭐ MiniMax-M3 (Token Plan)" },
  { id: "MiniMax-M3.1-Flash", label: "⚡ MiniMax M3.1 Flash" },
  { id: "MiniMax-M2.7-highspeed", label: "⚡ M2.7-highspeed" },
  { id: "MiniMax-Text-01", label: "MiniMax-Text-01" },
];

const DEEPSEEK_MODELS = [
  { id: "deepseek-chat", label: "deepseek-chat (nhanh, rẻ)" },
  { id: "deepseek-reasoner", label: "deepseek-reasoner (suy luận)" },
];

const OPENROUTER_MODELS = [
  { id: "deepseek/deepseek-v4.1-flash", label: "⚡ deepseek/deepseek-v4.1-flash" },
  { id: "anthropic/claude-sonnet-4", label: "anthropic/claude-sonnet-4" },
  { id: "google/gemini-2.5-flash", label: "google/gemini-2.5-flash" },
];

function KeyField({
  ctx,
  which,
  label,
}: {
  ctx: SettingsCtx;
  which: "minimax" | "deepseek" | "openrouter";
  label: string;
}) {
  const hint = ctx.keyHint[which];
  return (
    <div className="st-field">
      <label className="st-label">{label}</label>
      <div className="st-key-row">
        <input
          type="password"
          className="settings-input st-mono"
          value={ctx.keyInput[which]}
          placeholder={hint ? `Đã lưu: ••••${hint} — gõ để thay` : "Dán API key vào đây…"}
          onChange={(e) => ctx.setKeyInput(which, e.target.value)}
          autoComplete="off"
        />
        {hint && (
          <button
            type="button"
            className="settings-btn-secondary st-btn-sm"
            title="Xoá key đã lưu khỏi cấu hình"
            onClick={() => ctx.clearKey(which)}
          >
            Xoá key
          </button>
        )}
      </div>
      <span className="st-hint">
        {hint ? `Key đã lưu (chỉ hiện 4 ký tự cuối: ••••${hint}).` : "Chưa có key."} Ô nhập rỗng
        KHÔNG ghi đè key đã lưu.
      </span>
    </div>
  );
}

export function TranslationSection({ ctx }: { ctx: SettingsCtx }) {
  const { provider } = ctx;
  const statusOf = (id: TransProvider): { text: string; cls: string } => {
    if (provider === id) return { text: "Đang dùng", cls: "ok" };
    switch (id) {
      case "ollama":
        return ctx.ollamaModelList.length
          ? { text: `${ctx.ollamaModelList.length} model`, cls: "ok" }
          : { text: "Chưa thấy model", cls: "warn" };
      case "local":
        return { text: "Offline", cls: "" };
      case "minimax":
      case "deepseek":
      case "openrouter":
        return ctx.keyHint[id] ? { text: "Đã có key", cls: "ok" } : { text: "Chưa có key", cls: "" };
      default:
        return { text: "", cls: "" };
    }
  };

  return (
    <section className="settings-section st-card">
      <div className="st-sec-head">
        <h2>🌐 Dịch thuật</h2>
        <span className="st-hint">Một nơi duy nhất — Studio, Live và Lịch sử đều dùng cấu hình này.</span>
      </div>

      <div className="st-providers">
        {PROVIDERS.map((p) => {
          const st = statusOf(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className={`st-prov${provider === p.id ? " on" : ""}`}
              onClick={() => ctx.setProvider(p.id)}
            >
              <b>{p.name}</b>
              <small>{p.sub}</small>
              <span className={`st-pill${st.cls ? ` ${st.cls}` : ""}`}>{st.text}</span>
            </button>
          );
        })}
      </div>

      <div className="st-grid2">
        {provider === "ollama" && (
          <>
            <div className="st-field">
              <label className="st-label">Địa chỉ Ollama</label>
              <input
                className="settings-input st-mono"
                value={ctx.ollamaUrl}
                onChange={(e) => ctx.setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>
            <div className="st-field">
              <label className="st-label">Model Ollama</label>
              <select
                className="settings-input st-mono"
                value={ctx.ollamaModelList.some((m) => m.name === ctx.ollamaModel) ? ctx.ollamaModel : ""}
                onChange={(e) => {
                  if (e.target.value) ctx.setOllamaModel(e.target.value);
                }}
              >
                <option value="">
                  {ctx.ollamaModelList.length ? "— Chọn model đã cài —" : "Ollama chưa chạy / chưa có model"}
                </option>
                {ctx.ollamaModelList.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                    {m.size_gb > 0 ? ` • ${m.size_gb.toFixed(1)}GB` : ""}
                  </option>
                ))}
              </select>
              <div className="st-row">
                <input
                  className="settings-input st-mono"
                  value={ctx.ollamaModel}
                  onChange={(e) => ctx.setOllamaModel(e.target.value)}
                  placeholder="hoặc gõ tag model tay"
                />
                <button type="button" className="settings-btn-secondary st-btn-sm" onClick={ctx.reloadOllama}>
                  ↻ Quét lại
                </button>
              </div>
            </div>
          </>
        )}

        {provider === "local" && (
          <>
            <div className="st-field">
              <label className="st-label">Model GGUF</label>
              <select
                className="settings-input"
                value={ctx.translationModel}
                onChange={(e) => ctx.setTranslationModel(e.target.value)}
              >
                {ctx.transModels.length ? (
                  ctx.transModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.downloaded ? "✓ " : "⬇ "} {m.label}
                    </option>
                  ))
                ) : (
                  <option value="qwen3-4b">Qwen3-4B-Instruct-2507</option>
                )}
              </select>
            </div>
            <div className="st-field">
              <label className="st-label">Engine</label>
              <div className="settings-engine-toggle">
                {(["auto", "cpu", "cuda"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`settings-engine-btn ${ctx.transEnginePref === k ? "active" : ""}`}
                    onClick={() => ctx.changeTransEngine(k)}
                  >
                    {k === "auto" ? "⚙ AUTO" : k === "cpu" ? "💻 CPU" : "🎮 GPU (CUDA)"}
                  </button>
                ))}
              </div>
              <div className="st-row">
                {(() => {
                  const info = ctx.transModels.find((m) => m.name === ctx.translationModel);
                  return info && !info.downloaded ? (
                    <button
                      type="button"
                      className="settings-btn-secondary st-btn-sm"
                      disabled={ctx.downloadingModel !== null}
                      onClick={() => ctx.downloadTransModel(ctx.translationModel)}
                    >
                      {ctx.downloadingModel === ctx.translationModel ? "⏳ Đang tải…" : `⬇ Tải model (${info.size_mb}MB)`}
                    </button>
                  ) : null;
                })()}
                <button
                  type="button"
                  className="settings-btn-secondary st-btn-sm"
                  disabled={ctx.serverStarting}
                  onClick={ctx.preloadTranslation}
                >
                  {ctx.serverStarting ? "⏳ Đang nạp…" : ctx.llmEngine ? "🔄 Nạp lại LLM" : "▶ Nạp sẵn LLM"}
                </button>
                <span className="st-hint">
                  {ctx.llmEngine ? `Đang chạy: ${ctx.llmEngine.toUpperCase()}` : "Chưa nạp"}
                </span>
              </div>
            </div>
          </>
        )}

        {provider === "minimax" && (
          <>
            <KeyField ctx={ctx} which="minimax" label="MiniMax API key" />
            <div className="st-field">
              <label className="st-label">Model</label>
              <input
                className="settings-input st-mono"
                value={ctx.minimaxModel}
                onChange={(e) => ctx.setMinimaxModel(e.target.value)}
                placeholder="MiniMax-M3"
              />
              <div className="st-chips">
                {MINIMAX_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`st-chip${ctx.minimaxModel === m.id ? " on" : ""}`}
                    onClick={() => ctx.chooseModel("minimax", m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {provider === "deepseek" && (
          <>
            <KeyField ctx={ctx} which="deepseek" label="DeepSeek API key" />
            <div className="st-field">
              <label className="st-label">Model</label>
              <input
                className="settings-input st-mono"
                value={ctx.deepseekModel}
                onChange={(e) => ctx.setDeepseekModel(e.target.value)}
                placeholder="deepseek-chat"
              />
              <div className="st-chips">
                {DEEPSEEK_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`st-chip${ctx.deepseekModel === m.id ? " on" : ""}`}
                    onClick={() => ctx.chooseModel("deepseek", m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {provider === "openrouter" && (
          <>
            <KeyField ctx={ctx} which="openrouter" label="OpenRouter API key" />
            <div className="st-field">
              <label className="st-label">Model</label>
              <input
                className="settings-input st-mono"
                value={ctx.openrouterModel}
                onChange={(e) => ctx.setOpenrouterModel(e.target.value)}
                placeholder="deepseek/deepseek-v4.1-flash"
              />
              <div className="st-chips">
                {OPENROUTER_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`st-chip${ctx.openrouterModel === m.id ? " on" : ""}`}
                    onClick={() => ctx.chooseModel("openrouter", m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {ctx.reasoningSupported && (
        <div className="st-field st-span2">
          <label className="st-label">Mức độ suy luận</label>
          <Segmented
            options={REASON_OPTIONS}
            value={ctx.reasoningEffort}
            onChange={(v) => ctx.setReasoningEffort(v)}
            ariaLabel="Mức độ suy luận"
          />
          <span className="st-hint">
            Cao hơn = dịch kỹ hơn nhưng <b>chậm và tốn token hơn</b>. "Tự động" giữ hành vi đã tối ưu
            (M3.1-Flash → Thấp; model khác → mặc định nhà cung cấp).
          </span>
        </div>
      )}

      {ctx.providerTestResult && (
        <div className="st-test-ok">
          <b>✓ Kết quả dịch thử</b>
          <span>{ctx.providerTestResult}</span>
        </div>
      )}

      <div className="st-actions">
        <button type="button" className="settings-btn-secondary" disabled={ctx.providerTesting} onClick={ctx.testProvider}>
          {ctx.providerTesting ? "⏳ Đang dịch thử…" : "🧪 Dịch thử"}
        </button>
        <button type="button" className="settings-btn-primary" onClick={ctx.saveProvider}>
          💾 Lưu cấu hình
        </button>
        <span className="st-hint">Tự lưu khi đổi nhà cung cấp/model — nút Lưu chỉ để chắc chắn.</span>
      </div>
    </section>
  );
}
