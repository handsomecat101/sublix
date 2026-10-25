import { memo, useCallback, useEffect, useState } from "react";
import {
  acceptSuggestion,
  addPronoun,
  addTerm,
  emptyGlossary,
  glossaryStats,
  isPronounComplete,
  isTermComplete,
  removePronoun,
  removeTerm,
  rejectSuggestion,
  scopeLabel,
  updatePronoun,
  updateTerm,
} from "./glossaryModel";
import type {
  Glossary,
  GlossarySuggestion,
  GlossaryTerm,
  PronounEntry,
} from "./glossaryModel";
import "./glossaryEditor.css";

/**
 * GlossaryEditor — bảng **thuật ngữ + xưng hô** do người dùng duyệt.
 *
 * Component **độc lập**: không tự gắn vào Studio, không tự gọi IPC.
 * Người điều phối gắn sau (giống `ModelDownloadRow`).
 */
export interface GlossaryEditorProps {
  /** Bảng hiện tại (controlled). */
  value?: Glossary;
  /** Gọi khi bảng thay đổi (đã normalize). */
  onChange?: (next: Glossary) => void;
  /** Gọi khi bấm "Gợi ý từ kịch bản" — trả về gợi ý (hoặc null). */
  onSuggest?: () => Promise<GlossarySuggestion | null> | GlossarySuggestion | null;
  /** Gọi khi bấm "Lưu" (chỉ hiện nút này khi `autoSave = false`). */
  onSave?: (next: Glossary) => void | Promise<void>;
  /**
   * Tự động lưu (Studio drawer) — **mặc định `true`**.
   *
   * Khi `true`: KHÔNG hiện nút "Lưu" (tránh mâu thuẫn với dòng chân
   * "Tự động lưu khi thay đổi"); thay bằng trạng thái nhỏ cạnh tiêu đề.
   * Khi `false` (Cài đặt): hiện nút "Lưu" để người dùng bấm tường minh.
   */
  autoSave?: boolean;
  /** Trạng thái lưu để hiện cạnh tiêu đề: "Đang lưu…" / "✓ Đã lưu". */
  saveState?: "idle" | "saving" | "saved";
  /** Đang chạy gợi ý (parent truyền vào để hiện tiến trình). */
  suggesting?: boolean;
  /** Không cho sửa. */
  readOnly?: boolean;
  className?: string;
}

type Tab = "terms" | "pronouns";

const EMPTY_TERM: GlossaryTerm = { source: "", target: "", note: null };
const EMPTY_PRONOUN: PronounEntry = {
  speaker: "",
  listener: "",
  selfTerm: "",
  addressTerm: "",
};

function GlossaryEditorInner({
  value,
  onChange,
  onSuggest,
  onSave,
  autoSave = true,
  saveState = "idle",
  suggesting = false,
  readOnly = false,
  className,
}: GlossaryEditorProps) {
  const [tab, setTab] = useState<Tab>("terms");
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<GlossarySuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Vừa tự động lưu xong (autoSave) — hiện "✓ Đã lưu" rồi tắt. */
  const [savedTick, setSavedTick] = useState(false);

  useEffect(() => {
    if (!autoSave || !savedTick) return undefined;
    const timer = window.setTimeout(() => setSavedTick(false), 2500);
    return () => window.clearTimeout(timer);
  }, [autoSave, savedTick]);

  const glossary: Glossary = value ?? emptyGlossary();
  const stats = glossaryStats(glossary);

  // Bảng đến từ ngoài (parent nạp lại từ đĩa) → giữ tab hợp lệ.
  useEffect(() => {
    setError(null);
  }, [value]);

  const emit = useCallback(
    (next: Glossary) => {
      // Gửi nguyên bảng khi đang sửa: chuẩn hoá ở đây sẽ xoá dòng vừa thêm (còn trống)
      // hoặc dòng đang gõ dở trùng nguồn. Bỏ dòng trống/trùng làm lúc GHI (cha + backend).
      onChange?.(next);
      // Tự động lưu (autoSave) → báo "✓ Đã lưu" ngay cạnh tiêu đề.
      if (autoSave) setSavedTick(true);
    },
    [onChange, autoSave],
  );

  const handleSuggest = useCallback(async () => {
    if (!onSuggest || busy) return;
    setBusy(true);
    setError(null);
    try {
      const s = await onSuggest();
      setSuggestion(s ?? null);
      if (!s) setError("Không lấy được gợi ý từ kịch bản.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [onSuggest, busy]);

  const handleAccept = useCallback(
    (kind: "term" | "pronoun", index: number) => {
      if (!suggestion) return;
      emit(acceptSuggestion(glossary, suggestion, kind, index));
      setSuggestion(rejectSuggestion(suggestion, kind, index));
    },
    [emit, glossary, suggestion],
  );

  const handleReject = useCallback(
    (kind: "term" | "pronoun", index: number) => {
      if (!suggestion) return;
      setSuggestion(rejectSuggestion(suggestion, kind, index));
    },
    [suggestion],
  );

  const terms = glossary.terms ?? [];
  const pronouns = glossary.pronouns ?? [];

  return (
    <div className={`glossary-editor ${className ?? ""}`.trim()}>
      <div className="glossary-editor__head">
        <div>
          <h3 className="glossary-editor__title">
            Bảng thuật ngữ & xưng hô
            {saveState === "saving" ? (
              <span className="glossary-editor__save-state">Đang lưu…</span>
            ) : saveState === "saved" || savedTick ? (
              <span className="glossary-editor__save-state is-ok">✓ Đã lưu</span>
            ) : null}
          </h3>
          <p className="glossary-editor__sub">
            {scopeLabel(glossary)} · {stats.termCount} thuật ngữ · {stats.pronounCount} quy tắc xưng hô
            {stats.noteCount > 0 ? ` · ${stats.noteCount} ghi chú` : ""}
          </p>
        </div>
        <div className="glossary-editor__actions">
          <button
            type="button"
            className="glossary-btn"
            disabled={!onSuggest || busy || suggesting}
            onClick={handleSuggest}
          >
            {busy || suggesting ? "Đang gợi ý…" : "⚡ Gợi ý từ kịch bản"}
          </button>
          <button
            type="button"
            className={`glossary-btn ${glossary.locked ? "is-on" : ""}`}
            disabled={readOnly}
            onClick={() => emit({ ...glossary, locked: !glossary.locked })}
            title="Khoá bảng ⇒ backend bỏ qua bước LLM tự sinh bảng xưng hô"
          >
            {glossary.locked ? "🔒 Đã khoá" : "🔓 Khoá bảng"}
          </button>
          {!autoSave ? (
            <button
              type="button"
              className="glossary-btn glossary-btn--primary"
              disabled={readOnly || !onSave}
              onClick={() => onSave?.(glossary)}
            >
              💾 Lưu
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="glossary-editor__error">{error}</p> : null}

      <div className="glossary-tabs">
        <button
          type="button"
          className={`glossary-tab ${tab === "terms" ? "is-active" : ""}`}
          onClick={() => setTab("terms")}
        >
          Thuật ngữ ({terms.length})
        </button>
        <button
          type="button"
          className={`glossary-tab ${tab === "pronouns" ? "is-active" : ""}`}
          onClick={() => setTab("pronouns")}
        >
          Xưng hô ({pronouns.length})
        </button>
      </div>

      {tab === "terms" ? (
        <div className="glossary-table">
          <div className="glossary-row glossary-row--head">
            <span>Từ gốc</span>
            <span>Dịch</span>
            <span>Ghi chú</span>
            <span />
          </div>
          {terms.map((t, i) => (
            <div className="glossary-row" key={`${t.source}-${i}`}>
              <input
                className="glossary-input"
                value={t.source}
                readOnly={readOnly}
                placeholder="Dark Templar"
                onChange={(e) => emit(updateTerm(glossary, i, { ...t, source: e.target.value }))}
              />
              <input
                className="glossary-input"
                value={t.target}
                readOnly={readOnly}
                placeholder="Mẫu Tử Tối"
                onChange={(e) => emit(updateTerm(glossary, i, { ...t, target: e.target.value }))}
              />
              <input
                className="glossary-input"
                value={t.note ?? ""}
                readOnly={readOnly}
                placeholder="tuỳ chọn"
                onChange={(e) => emit(updateTerm(glossary, i, { ...t, note: e.target.value }))}
              />
              <button
                type="button"
                className="glossary-btn glossary-btn--ghost"
                disabled={readOnly}
                title="Xoá"
                onClick={() => emit(removeTerm(glossary, i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="glossary-btn glossary-btn--ghost"
            disabled={readOnly}
            onClick={() => emit(addTerm(glossary, EMPTY_TERM))}
          >
            + Thêm thuật ngữ
          </button>
          {terms.some((t) => !isTermComplete(t)) ? (
            <p className="glossary-editor__hint">
              Dòng thiếu "Từ gốc" hoặc "Dịch" sẽ được coi là ghi chú tự do.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="glossary-table">
          <div className="glossary-row glossary-row--head">
            <span>Người nói</span>
            <span>Gọi ai</span>
            <span>Tự xưng</span>
            <span>Gọi là</span>
            <span />
          </div>
          {pronouns.map((p, i) => (
            <div className="glossary-row" key={`${p.speaker}-${p.listener}-${i}`}>
              <input
                className="glossary-input"
                value={p.speaker}
                readOnly={readOnly}
                placeholder="zeratul"
                onChange={(e) => emit(updatePronoun(glossary, i, { ...p, speaker: e.target.value }))}
              />
              <input
                className="glossary-input"
                value={p.listener}
                readOnly={readOnly}
                placeholder="kaldares"
                onChange={(e) => emit(updatePronoun(glossary, i, { ...p, listener: e.target.value }))}
              />
              <input
                className="glossary-input"
                value={p.selfTerm}
                readOnly={readOnly}
                placeholder="ta"
                onChange={(e) => emit(updatePronoun(glossary, i, { ...p, selfTerm: e.target.value }))}
              />
              <input
                className="glossary-input"
                value={p.addressTerm}
                readOnly={readOnly}
                placeholder="ngươi"
                onChange={(e) => emit(updatePronoun(glossary, i, { ...p, addressTerm: e.target.value }))}
              />
              <button
                type="button"
                className="glossary-btn glossary-btn--ghost"
                disabled={readOnly}
                title="Xoá"
                onClick={() => emit(removePronoun(glossary, i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="glossary-btn glossary-btn--ghost"
            disabled={readOnly}
            onClick={() => emit(addPronoun(glossary, EMPTY_PRONOUN))}
          >
            + Thêm quy tắc xưng hô
          </button>
          {pronouns.some((p) => !isPronounComplete(p)) ? (
            <p className="glossary-editor__hint">
              Quy tắc thiếu ô sẽ không được dùng khi kiểm tra vi phạm.
            </p>
          ) : null}
        </div>
      )}

      {suggestion && (suggestion.terms.length > 0 || suggestion.pronouns.length > 0) ? (
        <div className="glossary-suggest">
          <h4 className="glossary-suggest__title">Gợi ý — bấm ✓ để nhận, ✕ để bỏ</h4>
          {suggestion.terms.map((t, i) => (
            <div className="glossary-suggest__row" key={`st-${t.source}-${i}`}>
              <span className="glossary-suggest__text">
                {t.source} → <strong>{t.target || "(ghi chú)"}</strong>
              </span>
              <button type="button" className="glossary-btn glossary-btn--ghost" onClick={() => handleAccept("term", i)}>
                ✓
              </button>
              <button type="button" className="glossary-btn glossary-btn--ghost" onClick={() => handleReject("term", i)}>
                ✕
              </button>
            </div>
          ))}
          {suggestion.pronouns.map((p, i) => (
            <div className="glossary-suggest__row" key={`sp-${p.listener}-${i}`}>
              <span className="glossary-suggest__text">
                {p.speaker || "(?)"} → {p.listener}: tự xưng <strong>{p.selfTerm || "?"}</strong>, gọi{" "}
                <strong>{p.addressTerm || "?"}</strong>
              </span>
              <button type="button" className="glossary-btn glossary-btn--ghost" onClick={() => handleAccept("pronoun", i)}>
                ✓
              </button>
              <button type="button" className="glossary-btn glossary-btn--ghost" onClick={() => handleReject("pronoun", i)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const GlossaryEditor = memo(GlossaryEditorInner);
export default GlossaryEditor;
