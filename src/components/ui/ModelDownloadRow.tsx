import { memo, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ModelDownloadProgressState } from "../../lib/tauri";
import "./modelDownloadRow.css";

/**
 * ModelDownloadRow — hàng tải model dùng chung (STT + TTS).
 * Tự nghe `model:download-progress` để cập nhật % / tốc độ / ETA / pha.
 * CHƯA gắn vào Studio / Cài đặt — coordinator sẽ giao gắn sau.
 */
export type DownloadPhase =
  | "downloading" | "verifying" | "extracting" | "installing_deps" | "done" | "error";

const PHASE_LABEL: Record<DownloadPhase, string> = {
  downloading: "Đang tải", verifying: "Kiểm tra", extracting: "Giải nén",
  installing_deps: "Cài thư viện", done: "Xong", error: "Lỗi",
};

export interface ModelDownloadRowProps {
  modelId: string; kind?: "stt" | "tts"; name: string;
  langLabel?: string; sizeNote?: string; license?: string; desc?: string;
  downloaded?: boolean; selected?: boolean; rtfNote?: string; wordTimestamps?: boolean;
  /** Ghi đè trạng thái tải (demo / test thay vì sự kiện). */
  progress?: ModelDownloadProgressState;
  onDownload?: (id: string) => void; onCancel?: (id: string) => void;
  onDelete?: (id: string) => void; onSelect?: (id: string) => void;
  className?: string;
}

/** byte → "156 MB" / "1,2 GB" (thập phân kiểu Việt Nam). */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const mb = bytes / 1048576;
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb < 1024) return `${mb.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
  return `${(mb / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} GB`;
}
/** byte/s → "3,4 MB/s". */
function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "—";
  return `${(bps / 1048576).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB/s`;
}
/** giây → "2:35" (phút:giây). */
function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function ModelDownloadRowInner({
  modelId, kind = "stt", name, langLabel, sizeNote, license, desc,
  downloaded = false, selected = false, rtfNote, wordTimestamps, progress,
  onDownload, onCancel, onDelete, onSelect, className,
}: ModelDownloadRowProps) {
  const [event, setEvent] = useState<ModelDownloadProgressState | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const kindRef = useRef(kind);
  kindRef.current = kind;

  useEffect(() => {
    if (progress) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<ModelDownloadProgressState>("model:download-progress", (e) => {
      const p = e.payload;
      if (!p || p.model_id !== modelId || p.kind !== kindRef.current) return;
      setEvent(p);
      if (p.phase === "error") setFailed(p.message || "Tải thất bại");
    })
      .then((u) => {
        // BUG-007: hủy chính promise listen() để không nhân đôi listener.
        if (disposed) u();
        else unlisten = u;
      })
      .catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, [modelId, progress]);

  const state = progress ?? event;
  const phase: DownloadPhase | "idle" = state?.phase ?? (downloaded ? "done" : "idle");
  const busy = phase === "downloading" || phase === "verifying"
    || phase === "extracting" || phase === "installing_deps";
  const isError = phase === "error" || failed !== null;
  const errorText = failed ?? (phase === "error" ? state?.message : null) ?? "Tải thất bại";
  const bytesDone = state?.bytes_done ?? 0;
  const bytesTotal = state?.bytes_total ?? 0;
  const pct = bytesTotal > 0
    ? Math.min(100, Math.round((bytesDone / bytesTotal) * 100))
    : phase === "done" ? 100 : 0;

  const status = busy ? (
    <>
      <span className="ui-mdl-pct">{pct}%</span>
      <span className="ui-mdl-bytes">{formatBytes(bytesDone)} / {formatBytes(bytesTotal)}</span>
      <span className="ui-mdl-speed">{formatSpeed(state?.speed_bps ?? 0)}</span>
      <span className="ui-mdl-eta">còn ~{formatEta(state?.eta_s ?? null)}</span>
    </>
  ) : isError ? <span className="ui-mdl-msg">{errorText}</span>
    : phase === "done" ? <span className="ui-mdl-msg">Model đã sẵn sàng</span> : null;

  const actions = busy ? (
    <button type="button" className="ui-mdl-btn" onClick={() => onCancel?.(modelId)}>Hủy</button>
  ) : isError ? (
    <button type="button" className="ui-mdl-btn is-primary"
      onClick={() => onDownload?.(modelId)}>Thử lại</button>
  ) : downloaded ? (
    <>
      {onSelect ? (
        <button type="button" className="ui-mdl-btn is-primary" onClick={() => onSelect(modelId)}>
          {selected ? "Đang dùng" : "Dùng engine này"}
        </button>
      ) : null}
      <button type="button" className="ui-mdl-btn is-danger"
        onClick={() => onDelete?.(modelId)}>Xóa</button>
    </>
  ) : (
    <button type="button" className="ui-mdl-btn is-primary"
      onClick={() => onDownload?.(modelId)}>Tải</button>
  );

  return (
    <div className={`ui-mdl${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`}>
      <div className="ui-mdl-head">
        <div className="ui-mdl-title">
          <span className="ui-mdl-name">{name}</span>
          {langLabel ? <span className="ui-mdl-lang">{langLabel}</span> : null}
          {selected ? <span className="ui-mdl-badge">Đang dùng</span> : null}
          {wordTimestamps ? <span className="ui-mdl-chip" title="Có timestamp từ">⏱</span> : null}
        </div>
        <div className="ui-mdl-size">{sizeNote}</div>
      </div>
      {desc ? <p className="ui-mdl-desc">{desc}</p> : null}
      {(rtfNote || license) ? (
        <div className="ui-mdl-meta">
          {rtfNote ? <span title="Tốc độ đo được">{rtfNote}</span> : null}
          {license ? <span title="Giấy phép">{license}</span> : null}
        </div>
      ) : null}
      <div className="ui-mdl-bar" role="progressbar" aria-valuenow={pct}
        aria-valuemin={0} aria-valuemax={100}>
        <div className={`ui-mdl-fill${busy ? " is-busy" : ""}${isError ? " is-error" : ""}`}
          style={{ width: `${pct}%` }} />
      </div>
      <div className="ui-mdl-status">
        <span className={`ui-mdl-phase${isError ? " is-error" : ""}`}>
          {isError ? PHASE_LABEL.error : phase === "idle" ? "Chưa tải" : PHASE_LABEL[phase]}
        </span>
        {status}
      </div>
      <div className="ui-mdl-actions">{actions}</div>
    </div>
  );
}
/** `ModelDownloadRow` đã bọc `React.memo` (không re-render khi props không đổi). */
export const ModelDownloadRow = memo(ModelDownloadRowInner);
export default ModelDownloadRow;
