//! TSK-SETTINGS-MODELS — Cài đặt › "Nhận giọng nói (STT)".
//! Danh sách engine từ `stt_engines_status` (catalog thật, không hard-code),
//! tải/huỷ/xoá bằng `stt_model_*`, chọn engine mặc định bằng `stt_set_engine`.
//! Mỗi engine là 1 hàng `ModelDownloadRow` (tự nghe `model:download-progress`).

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { sublix, type ModelDownloadProgressState, type SttEngineStatus } from "../../lib/tauri";
import { ModelDownloadRow } from "../../components/ui/ModelDownloadRow";
import { Segmented } from "../../components/ui/Segmented";
import { engineSummary, recommendSttEngine, sortSttEngines } from "./modelUtils";

export interface SttSectionProps {
  /** Thiết lập cũ (giữ nguyên hành vi): engine phần cứng cho Whisper. */
  sttEnginePref: "auto" | "cpu" | "cuda";
  onSttEngineChange: (v: "auto" | "cpu" | "cuda") => void;
  runtimeEngine: string | null;
  serverStarting: boolean;
  configReady: boolean;
  /** Công cụ kiểm thử nhanh cũ (ghi 5 giây → nhận dạng). */
  lastCapture: string | null;
  lastTranscript: string | null;
  lastTranslated: string | null;
  onTestCapture: () => void;
  onTranscribe: () => void;
}

export function SttSection(props: SttSectionProps) {
  const [engines, setEngines] = useState<SttEngineStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      setEngines(await sublix.sttEnginesStatus());
    } catch (e) {
      setNotice(`⚠️ Không đọc được danh sách engine STT: ${e}`);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const p = listen<ModelDownloadProgressState>("model:download-progress", (ev) => {
      if (ev.payload?.kind !== "stt") return;
      // Chỉ cần đọc lại catalog khi một lượt tải kết thúc (row tự vẽ %).
      if (ev.payload.phase !== "done" && ev.payload.phase !== "error") return;
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void refresh(true), 350);
    });
    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      // BUG-007: huỷ chính promise listen().
      p.then((u) => u()).catch(() => undefined);
    };
  }, []);

  const summary = engineSummary(engines);
  const sorted = sortSttEngines(engines);
  const recommend = recommendSttEngine(engines, "en");
  const readyEngines = engines.filter((e) => e.downloaded || e.state === "ready");
  const selectedId = engines.find((e) => e.selected)?.id ?? "";
  const engineOptions = readyEngines.map((e) => ({ value: e.id, label: e.label || e.name }));

  async function setDefault(id: string) {
    if (!id || id === selectedId) return;
    setEngines((prev) => prev.map((e) => ({ ...e, selected: e.id === id })));
    try {
      await sublix.sttSetEngine(id);
      setNotice(`✅ Engine mặc định: ${engines.find((e) => e.id === id)?.name ?? id}`);
      await refresh(true);
    } catch (e) {
      setNotice(`❌ Đổi engine thất bại: ${e}`);
      await refresh(true);
    }
  }

  async function download(id: string) {
    setNotice(null);
    try {
      await sublix.sttModelDownload(id);
      await refresh(true);
    } catch (e) {
      setNotice(`❌ Tải model thất bại: ${e}`);
    }
  }

  async function cancel(id: string) {
    try {
      await sublix.sttModelCancel(id);
      await refresh(true);
    } catch (e) {
      setNotice(`❌ Huỷ tải thất bại: ${e}`);
    }
  }

  async function remove(id: string) {
    try {
      await sublix.sttModelDelete(id);
      setNotice("🗑 Đã xoá model khỏi đĩa.");
      await refresh(true);
    } catch (e) {
      setNotice(`❌ Xoá model thất bại: ${e}`);
    }
  }

  return (
    <section className="settings-section st-card">
      <div className="st-sec-head">
        <h2>🎤 Nhận giọng nói (STT)</h2>
        <span className="st-hint">
          {summary.ready}/{summary.total} engine đã tải
          {summary.downloading > 0 ? ` · ${summary.downloading} đang tải` : ""}
          {summary.errors > 0 ? ` · ${summary.errors} lỗi` : ""}
        </span>
        <button
          type="button"
          className="settings-btn-secondary st-btn-sm"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "⏳ Đang đọc…" : "↻ Làm mới"}
        </button>
      </div>

      <div className="st-field">
        <label className="st-label">Engine mặc định</label>
        {engineOptions.length > 0 ? (
          <Segmented
            options={engineOptions}
            value={selectedId}
            onChange={(v) => void setDefault(v)}
            ariaLabel="Engine nhận dạng mặc định"
          />
        ) : (
          <span className="st-hint">Chưa có engine nào sẵn sàng — hãy tải ít nhất 1 engine bên dưới.</span>
        )}
        <span className="st-hint">
          Chỉ chọn được engine <b>đã tải</b>. Whisper vẫn là mặc định để không đổi hành vi cũ.
        </span>
      </div>

      <div className="st-field">
        <label className="st-label">Tăng tốc Whisper (engine phần cứng)</label>
        <Segmented
          options={[
            { value: "auto", label: "⚙ AUTO", disabled: !props.configReady },
            { value: "cpu", label: "💻 CPU", disabled: !props.configReady },
            { value: "cuda", label: "🎮 GPU (CUDA)", disabled: !props.configReady },
          ]}
          value={props.sttEnginePref}
          onChange={props.onSttEngineChange}
          ariaLabel="Engine phần cứng cho Whisper"
        />
        <span className="st-hint">
          {!props.configReady
            ? "⏳ Đang tải cấu hình…"
            : props.serverStarting
            ? "⏳ Đang nạp lại server…"
            : props.runtimeEngine
            ? `Đang chạy: ${props.runtimeEngine.toUpperCase()}`
            : "Chưa nạp server (tự nạp khi chạy phụ đề)."}
        </span>
      </div>

      <details className="st-details">
        <summary>🧪 Kiểm thử nhanh (ghi 5 giây → nhận dạng)</summary>
        <div className="st-row">
          <button type="button" className="settings-btn-secondary st-btn-sm" onClick={props.onTestCapture}>
            ⏺ Ghi 5 giây
          </button>
          <button
            type="button"
            className="settings-btn-secondary st-btn-sm"
            disabled={!props.lastCapture}
            onClick={props.onTranscribe}
          >
            📝 Nhận dạng
          </button>
          <span className="st-hint">{props.lastCapture ? `File: ${props.lastCapture}` : "Chưa ghi âm"}</span>
        </div>
        {props.lastTranscript && <div className="st-transcript">{props.lastTranscript}</div>}
        {props.lastTranslated && <div className="st-hint">Dịch: {props.lastTranslated}</div>}
      </details>

      {recommend && (
        <div className="st-test-ok">
          <b>💡 Gợi ý</b>
          <span>
            {recommend.name} ({recommend.size_note}) — {recommend.rtf_note || recommend.desc}
          </span>
        </div>
      )}

      {notice && <div className="downloader-sub-note">{notice}</div>}

      <div className="st-engines">
        {sorted.map((e) => (
          <ModelDownloadRow
            key={e.id}
            modelId={e.id}
            kind="stt"
            name={e.name}
            langLabel={e.lang_label}
            sizeNote={e.size_note || `${e.size_mb} MB`}
            license={e.license}
            desc={e.desc}
            rtfNote={e.rtf_note}
            wordTimestamps={e.word_timestamps}
            downloaded={e.downloaded || e.state === "ready"}
            selected={e.selected}
            onDownload={(id) => void download(id)}
            onCancel={(id) => void cancel(id)}
            onDelete={(id) => void remove(id)}
            onSelect={(id) => void setDefault(id)}
          />
        ))}
      </div>

      {!loading && engines.length === 0 && (
        <div className="st-empty">Không đọc được catalog engine STT từ backend.</div>
      )}
    </section>
  );
}
