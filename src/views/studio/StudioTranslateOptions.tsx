import { memo } from "react";
import { Segmented } from "../../components/ui/Segmented";
import {
  REASONING_EFFORTS,
  type ReasoningEffort,
  type TranslateOptions,
} from "./translateOptions";

/**
 * StudioTranslateOptions — chọn **model dịch** + **mức suy luận** + **chế độ dịch
 * theo ngữ cảnh** ngay trong bước "Dịch" của panel Studio.
 *
 * - Dropdown "Model dịch" chia 2 nhóm: **Local** (Ollama/GGUF) và **Cloud**
 *   (minimax M3, M3.1 Flash, DeepSeek qua OpenRouter…).
 * - Model cloud **chưa có API key** → mục bị làm xám + dòng nhắc "Cần API key —
 *   Cài đặt" (link mở Cài đặt). Không bao giờ in key ra UI.
 * - Segmented "Suy luận" (Tự động/Thấp/Vừa/Cao/Tối đa) chỉ hiện khi
 *   `supports_reasoning`.
 * - Công tắc "Dịch theo ngữ cảnh": đo thật (mcode #2, §4.4) cho thấy model local
 *   nhỏ dịch KÉM hơn ở chế độ này → mặc định TẮT với ollama/gguf/minimax, BẬT với
 *   openrouter/deepseek. Cờ lưu THEO PROVIDER (file cha lo phần lưu).
 */
export interface StudioTranslateOptionsProps {
  /** Tuỳ chọn từ backend (null = chưa tải xong). */
  options: TranslateOptions | null;
  /** Đang tải danh sách model. */
  loading: boolean;
  /** Backend chưa có lệnh `translate_options_get` → chỉ đọc. */
  unavailable: boolean;
  /** Kiểm tra provider đã có API key hay chưa (không trả về key). */
  hasProviderKey: (provider: string) => boolean;
  /** Chọn model (model id + provider). */
  onSelectModel: (modelId: string, provider: string) => void;
  /** Chọn mức suy luận. */
  onSelectEffort: (effort: ReasoningEffort) => void;
  /** Mở Cài đặt (để nhập API key / tham số khác). */
  onOpenSettings: () => void;
  /** Đang bật "Dịch theo ngữ cảnh". */
  contextual: boolean;
  /** Bật/tắt "Dịch theo ngữ cảnh". */
  onContextualChange: (value: boolean) => void;
  /** Provider hiện tại (để biết model local hay cloud). */
  provider: string;
  /**
   * [TSK-STUDIO-GLOSSARY] Gợi ý nhỏ cạnh công tắc ngữ cảnh (null = không nhắc).
   * Thường là: "Khoá bảng xưng hô để dịch nhất quán hơn".
   */
  glossaryHint?: string | null;
}

/** Provider chạy model trên máy → dịch theo ngữ cảnh thường KÉM hơn (đo thật). */
const LOCAL_PROVIDERS = ["ollama", "gguf", "local", "minimax"];

function StudioTranslateOptionsInner({
  options,
  loading,
  unavailable,
  hasProviderKey,
  onSelectModel,
  onSelectEffort,
  onOpenSettings,
  contextual,
  onContextualChange,
  provider,
  glossaryHint = null,
}: StudioTranslateOptionsProps) {
  // Công tắc ngữ cảnh — hiện ở MỌI nhánh (kể cả khi backend chưa có lệnh).
  const contextualBlock = (
    <div className="spp-field">
      <span className="spp-label">Dịch theo ngữ cảnh</span>
      <Segmented
        options={[
          { value: "off", label: "Tắt" },
          { value: "on", label: "Bật" },
        ]}
        value={contextual ? "on" : "off"}
        onChange={(value) => onContextualChange(value === "on")}
        ariaLabel="Dịch theo ngữ cảnh"
      />
      <span className="spp-hint">
        Đọc hiểu cả kịch bản trước khi dịch → dịch đúng tông giọng, mạch cảnh.
      </span>
      {/* [TSK-STUDIO-GLOSSARY] Gợi ý nhỏ cạnh công tắc (bảng chưa khoá). */}
      {glossaryHint ? (
        <span className="spp-hint spp-glossary-hint">{glossaryHint}</span>
      ) : null}
      {contextual && LOCAL_PROVIDERS.includes(provider.trim().toLowerCase()) ? (
        <div className="spp-engine-warn">
          <span className="spp-engine-warn-text">
            Model nhỏ trên máy dịch kém hơn ở chế độ này.
          </span>
        </div>
      ) : null}
    </div>
  );

  // ── Trạng thái dự phòng: backend chưa có lệnh ──────────────────────────
  if (unavailable) {
    return (
      <div className="spp-field">
        <span className="spp-label">Model dịch</span>
        <div className="spp-provider-row">
          <span className="spp-provider-text">
            Chưa có tuỳ chọn model trong app — bấm “Đổi” để mở Cài đặt.
          </span>
          <button type="button" className="spp-link-btn" onClick={onOpenSettings}>
            Đổi
          </button>
        </div>
        {contextualBlock}
      </div>
    );
  }

  if (loading || options === null) {
    return (
      <div className="spp-field">
        <span className="spp-label">Model dịch</span>
        <div className="spp-note">Đang tải danh sách model dịch…</div>
        {contextualBlock}
      </div>
    );
  }

  const localModels = options.models.filter((m) => m.local);
  const cloudModels = options.models.filter((m) => !m.local);
  const current = options.models.find((m) => m.id === options.model);
  const currentNeedsKey = current !== undefined && !current.local && !hasProviderKey(current.provider);

  const renderOption = (model: { id: string; provider: string; label: string; local: boolean }) => {
    const missingKey = !model.local && !hasProviderKey(model.provider);
    return (
      <option key={`${model.provider}:${model.id}`} value={model.id} disabled={missingKey}>
        {model.label}
        {missingKey ? " — cần API key" : ""}
      </option>
    );
  };

  return (
    <div className="spp-field">
      <span className="spp-label">Model dịch</span>
      <select
        className="spp-select"
        value={options.model}
        onChange={(event) => {
          const picked = options.models.find((m) => m.id === event.target.value);
          if (picked) onSelectModel(picked.id, picked.provider);
        }}
        title="Chọn model dịch — dùng cho bước Dịch"
      >
        {localModels.length > 0 ? (
          <optgroup label="Local (chạy trên máy)">
            {localModels.map((model) => renderOption(model))}
          </optgroup>
        ) : null}
        {cloudModels.length > 0 ? (
          <optgroup label="Cloud (cần mạng)">
            {cloudModels.map((model) => renderOption(model))}
          </optgroup>
        ) : null}
      </select>

      {currentNeedsKey ? (
        <div className="spp-engine-warn">
          <span className="spp-engine-warn-text">Model này cần API key.</span>
          <button type="button" className="spp-mini-btn" onClick={onOpenSettings}>
            Cần API key — Cài đặt
          </button>
        </div>
      ) : null}

      {options.supports_reasoning ? (
        <div className="spp-field">
          <span className="spp-label" title="Cao = dịch kỹ hơn, chậm + tốn hơn">
            Suy luận
          </span>
          <Segmented
            options={REASONING_EFFORTS}
            value={options.reasoning_effort}
            onChange={(value) => onSelectEffort(value as ReasoningEffort)}
            ariaLabel="Mức suy luận của model dịch"
          />
          <span className="spp-hint">
            Mức cao = dịch kỹ hơn, chậm + tốn token hơn.
          </span>
        </div>
      ) : null}

      <button type="button" className="spp-link-btn" onClick={onOpenSettings}>
        Cài đặt nâng cao (API key, tham số khác)
      </button>

      {contextualBlock}
    </div>
  );
}

/** Bọc `React.memo` để không re-render theo playhead. */
export const StudioTranslateOptions = memo(StudioTranslateOptionsInner);

export default StudioTranslateOptions;
