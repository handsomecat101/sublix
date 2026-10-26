import {
  BLUR_LABEL,
  spanBarSegments,
  type HardsubBlur,
  type HardsubCardState,
  type HardsubScope,
} from "./logic";
import "./v014.css";

export interface HardsubCardProps {
  enabled: boolean;
  /** Trạng thái đã ghép bằng `deriveCardState(...)`. */
  state: HardsubCardState;
  blur: HardsubBlur;
  stamp: boolean;
  scope: HardsubScope;
  /** Các khoảng có chữ + thời lượng video (vẽ thanh; bấm 1 đoạn = tua). */
  spans: [number, number][];
  durationSec: number;
  /** Dải thấp hơn 1 dòng chữ ở cỡ hiện tại ⇒ dòng vàng cảnh báo. */
  bandTooShort?: boolean;
  /** Đang tải model: 0–100, `null` = không tải. */
  modelDownloadPct?: number | null;
  /** Kích thước model hiển thị trên nút (MB). */
  modelMb?: number;
  /** Đã chỉnh tay dải ⇒ hiện "↺ Về dải dò". */
  bandManual?: boolean;

  onToggle: (enabled: boolean) => void;
  onRedetect: () => void;
  onCancel: () => void;
  onDownloadModel: () => void;
  onInstallDeps: () => void;
  /** "Dò cả nửa trên" ở trạng thái không thấy chữ. */
  onDetectOtherHalf?: () => void;
  /** "▭ Tự đặt dải" — parent đặt dải mặc định rồi mở khung kéo. */
  onManualBand: () => void;
  onResetBand?: () => void;
  onBlur: (b: HardsubBlur) => void;
  onStamp: (on: boolean) => void;
  onScope: (s: HardsubScope) => void;
  onSeek?: (sec: number) => void;
}

/** Thẻ "Phụ đề cứng của video gốc" — 6 trạng thái: tắt / đang dò / tìm thấy / không thấy / lỗi / chưa dò. */
export function HardsubCard(p: HardsubCardProps) {
  const { state } = p;
  const on = p.enabled && state.kind !== "off";
  const hasBand = state.kind === "found";
  const noSpans = p.spans.length === 0;

  return (
    <section className="v14-card" aria-label="Phụ đề cứng của video gốc">
      <h4>▭ Phụ đề cứng của video gốc</h4>
      <label className="v14-check">
        <input type="checkbox" checked={p.enabled} onChange={(e) => p.onToggle(e.target.checked)} />
        Video có phụ đề cứng — làm mờ &amp; đè tem
      </label>
      {!on && <div className="v14-hint">Tích để tự dò chữ in sẵn trên video gốc rồi làm mờ, để phụ đề mới đọc rõ.</div>}

      {on && <StatusBlock {...p} />}

      {on && hasBand && (
        <>
          {!noSpans && (
            <div className="v14-spanbar" aria-label="Các đoạn có chữ cứng">
              {spanBarSegments(p.spans, p.durationSec).map((s) => (
                <button
                  key={s.start}
                  type="button"
                  title={`Tua tới ${s.start.toFixed(1)} s`}
                  style={{ left: `${s.left}%`, width: `${s.width}%` }}
                  onClick={() => p.onSeek?.(s.start)}
                />
              ))}
            </div>
          )}
          {p.bandTooShort && <div className="v14-warn">Dải thấp hơn cỡ chữ — chữ sẽ tràn ra ngoài dải.</div>}
          <div className="v14-row">
            <label>Mức mờ</label>
            <div className="v14-seg" role="radiogroup" aria-label="Mức mờ">
              {(Object.keys(BLUR_LABEL) as HardsubBlur[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={p.blur === k} onClick={() => p.onBlur(k)}>
                  {BLUR_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="v14-row">
            <label htmlFor="v14-stamp" title="Chỉ mờ thì bóng chữ cũ vẫn lộ">Nền tem mờ đục</label>
            <input id="v14-stamp" type="checkbox" checked={p.stamp} onChange={(e) => p.onStamp(e.target.checked)} style={{ accentColor: "var(--ac)" }} />
          </div>
          <div className="v14-row">
            <label>Làm mờ</label>
            <div className="v14-seg" role="radiogroup" aria-label="Phạm vi làm mờ">
              <button type="button" role="radio" aria-checked={p.scope === "text_only" && !noSpans} disabled={noSpans} title={noSpans ? "Dải tự đặt không có khoảng thời gian" : undefined} onClick={() => p.onScope("text_only")}>
                Chỉ lúc có chữ
              </button>
              <button type="button" role="radio" aria-checked={p.scope === "whole" || noSpans} onClick={() => p.onScope("whole")}>
                Suốt video
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function StatusBlock(p: HardsubCardProps) {
  const s = p.state;
  switch (s.kind) {
    case "running":
      return (
        <>
          <div className="v14-status">
            <span className="v14-spin" aria-hidden />
            <div className="tx">
              <b>Đang dò chữ cứng… {s.percent} %</b>
              <span>{s.message}</span>
            </div>
            <button type="button" className="v14-btn" onClick={p.onCancel} aria-label="Huỷ dò">✕</button>
          </div>
          <div className="v14-bar3" role="progressbar" aria-valuenow={s.percent} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${s.percent}%` }} />
          </div>
        </>
      );
    case "found":
      return (
        <div className={`v14-status ${s.weak ? "warn" : "ok"}`}>
          <span className="ico">{s.weak ? "!" : "✓"}</span>
          <div className="tx">
            <b>{s.manual ? `Dải tự đặt · ${s.where}` : `Tìm thấy dải chữ · ${s.where}`}</b>
            <span>
              {s.segments > 0 ? `${s.segments} đoạn · ${Math.round(s.coverage)} % thời lượng có chữ` : "Áp suốt video"}
              {s.weak ? " · kiểm lại dải trên video" : ""}
              {p.bandManual ? " · đã chỉnh tay" : ""}
            </span>
          </div>
          {p.bandManual && p.onResetBand && <button type="button" className="v14-btn" onClick={p.onResetBand}>↺ Về dải dò</button>}
          <button type="button" className="v14-btn" onClick={p.onRedetect}>↻ Dò lại</button>
        </div>
      );
    case "none":
      return (
        <>
          <div className="v14-status warn">
            <span className="ico">?</span>
            <div className="tx">
              <b>Không thấy chữ ở vùng đã dò</b>
              <span>Đã xem {s.framesScanned} khung. Video không có chữ cứng thì bỏ tích.</span>
            </div>
          </div>
          <div className="v14-btns">
            {p.onDetectOtherHalf && <button type="button" className="v14-btn" onClick={p.onDetectOtherHalf}>Dò cả nửa trên</button>}
            <button type="button" className="v14-btn" onClick={p.onManualBand}>▭ Tự đặt dải</button>
          </div>
        </>
      );
    case "error":
      return (
        <>
          <div className="v14-status err" title={s.message}>
            <span className="ico">!</span>
            <div className="tx">
              <b>Không dò được</b>
              <span>{errorLine(s.error, s.message)}</span>
            </div>
          </div>
          <div className="v14-btns">
            {s.error === "model" ? (
              <button type="button" className="v14-btn pri" disabled={p.modelDownloadPct != null} onClick={p.onDownloadModel}>
                {p.modelDownloadPct != null ? `Đang tải… ${Math.round(p.modelDownloadPct)} %` : `⬇ Tải mô hình · ${p.modelMb ?? 4} MB`}
              </button>
            ) : s.error === "deps" ? (
              <button type="button" className="v14-btn pri" onClick={p.onInstallDeps}>⬇ Cài thư viện</button>
            ) : (
              <button type="button" className="v14-btn" onClick={p.onRedetect}>↻ Thử lại</button>
            )}
            <button type="button" className="v14-btn" onClick={p.onManualBand}>▭ Tự đặt dải</button>
          </div>
        </>
      );
    case "idle":
      return (
        <div className="v14-status idle">
          <span className="ico" aria-hidden />
          <div className="tx">
            <b>Chưa dò</b>
            <span>Sẽ dò trước khi xuất.</span>
          </div>
          <button type="button" className="v14-btn pri" onClick={p.onRedetect}>Dò ngay</button>
        </div>
      );
    default:
      return null;
  }
}

function errorLine(kind: string, message: string): string {
  if (kind === "model") return "Chưa có mô hình dò chữ.";
  if (kind === "deps") return "Thiếu thư viện Python (onnxruntime).";
  if (kind === "video") return "Không đọc được video.";
  return message;
}
