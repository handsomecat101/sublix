import { memo } from "react";
import type { ModelDownloadProgressState } from "../../lib/tauri";
import type { PanelSttEngine } from "./studioPipelineTypes";

/**
 * StudioSttEnginePicker — chọn engine Nhận giọng nói (Whisper / SenseVoice /
 * Paraformer / Parakeet) ngay trong bước "Phụ đề" của panel Studio.
 *
 * - Danh sách engine đến từ backend (`stt_engines_status` → catalog), KHÔNG
 *   hard-code: thứ hạng gợi ý được tính từ `languages` của catalog theo ngôn ngữ
 *   nguồn (engine có ngôn ngữ đó được đưa lên trước + gắn nhãn "Phù hợp").
 * - [UI_R2-8_REVIEW mục 1] Trong Studio **KHÔNG** dùng `ModelDownloadRow` đầy đủ
 *   (thẻ ~330 px làm vỡ khung 340 px): thay bằng **1 dòng gọn**
 *   `⚠ SenseVoice chưa tải (228 MB) · [Tải]`; mô tả/license chỉ ở Cài đặt › STT.
 *   Tiến trình hiện **inline** thay chữ khi đang tải.
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

/** Nhãn pha tải (tiếng Việt, sentence case). */
const PHASE_LABEL: Record<string, string> = {
  downloading: "Đang tải",
  verifying: "Đang kiểm tra",
  extracting: "Đang giải nén",
  installing_deps: "Đang cài phụ thuộc",
  done: "Đã tải xong",
  error: "Tải lỗi",
};

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
  const downloading = progress && progress.model_id === selected?.id ? progress : null;

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
          {/* [UI_R2-8_REVIEW mục 1] 1 dòng gọn thay cho thẻ model đầy đủ. */}
          {!selected.downloaded ? (
            <div className="spp-note spp-stt-download-line">
              {downloading ? (
                <span className="spp-stt-download-progress">
                  {PHASE_LABEL[downloading.phase] ?? "Đang tải"} ·{" "}
                  {downloading.bytes_total > 0
                    ? `${Math.round((downloading.bytes_done / downloading.bytes_total) * 100)}%`
                    : "…"}
                  {downloading.message ? ` · ${downloading.message}` : ""}
                </span>
              ) : (
                <>
                  <span>⚠ {selected.label} chưa tải ({selected.sizeNote})</span>
                  <button
                    type="button"
                    className="ui-mdl-btn is-primary"
                    onClick={() => onDownload(selected.id)}
                    title={`Tải ${selected.label} (${selected.sizeNote}) — chi tiết ở Cài đặt › Nhận dạng`}
                  >
                    Tải
                  </button>
                </>
              )}
              {downloading ? (
                <button
                  type="button"
                  className="ui-mdl-btn"
                  onClick={() => onCancel(selected.id)}
                  title="Hủy tải model"
                >
                  Hủy
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Bọc `React.memo` (props ổn định từ file cha). */
export const StudioSttEnginePicker = memo(StudioSttEnginePickerInner);

export default StudioSttEnginePicker;
