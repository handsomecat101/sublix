import { memo } from "react";
import { ModelDownloadRow } from "../../components/ui/ModelDownloadRow";
import type { ModelDownloadProgressState } from "../../lib/tauri";
import type { PanelSttEngine } from "./studioPipelineTypes";

/**
 * StudioSttEnginePicker — chọn engine Nhận giọng nói (Whisper / SenseVoice /
 * Paraformer / Parakeet) ngay trong bước "Phụ đề" của panel Studio.
 *
 * - Danh sách engine đến từ backend (`stt_engines_status` → catalog), KHÔNG
 *   hard-code: thứ hạng gợi ý được tính từ `languages` của catalog theo ngôn ngữ
 *   nguồn (engine có ngôn ngữ đó được đưa lên trước + gắn nhãn "Phù hợp").
 * - Engine CHƯA tải model → hiện `ModelDownloadRow` ngay dưới dropdown, có
 *   tiến trình (sự kiện `model:download-progress`) + nút Hủy (`stt_model_cancel`).
 * - Chọn engine → `stt_set_engine` (lưu config, không có nút Lưu).
 */
export interface StudioSttEnginePickerProps {
  /** Danh sách engine từ backend. */
  engines: PanelSttEngine[];
  /** Id engine đang chọn. */
  selectedId: string;
  /** Ngôn ngữ nguồn (dùng để gợi ý engine phù hợp). */
  sourceLang: string;
  /** Tiến trình tải model (null = không tải). */
  progress?: ModelDownloadProgressState;
  /** Chọn engine. */
  onSelect: (id: string) => void;
  /** Tải model. */
  onDownload: (id: string) => void;
  /** Hủy tải. */
  onCancel: (id: string) => void;
}

function StudioSttEnginePickerInner({
  engines,
  selectedId,
  sourceLang,
  progress,
  onSelect,
  onDownload,
  onCancel,
}: StudioSttEnginePickerProps) {
  if (engines.length === 0) {
    return (
      <div className="spp-field">
        <span className="spp-label">Engine nhận dạng</span>
        <div className="spp-note">Đang tải danh sách engine…</div>
      </div>
    );
  }

  const lang = sourceLang.trim().toLowerCase();
  const matches = (engine: PanelSttEngine) =>
    lang !== "" && lang !== "auto" && engine.languages.includes(lang);

  // Ưu tiên engine hỗ trợ ngôn ngữ nguồn — thứ tự lấy từ catalog, không hard-code.
  const sorted = [...engines].sort((a, b) => {
    const ma = matches(a) ? 1 : 0;
    const mb = matches(b) ? 1 : 0;
    if (ma !== mb) return mb - ma;
    return 0;
  });

  const selected = engines.find((engine) => engine.id === selectedId) ?? null;

  return (
    <div className="spp-field">
      <span className="spp-label">Engine nhận dạng</span>
      <select
        className="spp-select"
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
        title="Engine nhận dạng giọng nói — đổi xong tự lưu, không cần bấm Lưu"
      >
        {sorted.map((engine) => (
          <option key={engine.id} value={engine.id}>
            {engine.label}
            {matches(engine) ? " • phù hợp" : ""}
            {engine.downloaded ? "" : " — chưa tải"}
          </option>
        ))}
      </select>

      {selected ? (
        <>
          <div className="spp-hint">
            {selected.langLabel}
            {selected.rtfNote ? ` · ${selected.rtfNote}` : ""}
          </div>
          {!selected.downloaded ? (
            <ModelDownloadRow
              modelId={selected.id}
              kind="stt"
              name={selected.name}
              langLabel={selected.langLabel}
              sizeNote={selected.sizeNote}
              license={selected.license}
              desc={selected.desc}
              downloaded={selected.downloaded}
              selected={selected.id === selectedId}
              rtfNote={selected.rtfNote}
              progress={progress?.model_id === selected.id ? progress : undefined}
              onDownload={onDownload}
              onCancel={onCancel}
              onSelect={onSelect}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Bọc `React.memo` (props ổn định từ file cha). */
export const StudioSttEnginePicker = memo(StudioSttEnginePickerInner);

export default StudioSttEnginePicker;
