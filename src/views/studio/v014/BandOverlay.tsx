import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  dragBand,
  nudgeBand,
  readout,
  sameBand,
  snapTargetsFor,
  type DragHandle,
  type DragResult,
  type VideoSize,
} from "./bandGeometry";
import { previewBlurPx, type BandPx, type HardsubBlur } from "./logic";
import "./v014.css";

export interface BandOverlayProps {
  /** Kích thước video gốc (px) — toạ độ dải theo hệ này. */
  videoSize: VideoSize;
  /** Kích thước khung video đang hiển thị (px). */
  displaySize: VideoSize;
  /** Dải đang dùng; `null` = không vẽ gì. */
  band: BandPx | null;
  /** Dải do máy dò (vẽ nét đứt mờ lúc kéo để so; hút vào mép của nó). */
  detectedBand?: BandPx | null;
  source?: "auto" | "manual";
  /** Tab Thuộc tính đang mở / rê chuột ⇒ hiện khung + tay nắm. Tắt ⇒ chỉ thấy hiệu ứng. */
  editing: boolean;
  /** Xem thử mờ thật bằng `backdrop-filter`. `visible=false` (ngoài khoảng có chữ) ⇒ không mờ. */
  effect?: { blur: HardsubBlur; stamp: boolean; visible: boolean };
  /** Đang dò: vệt quét nửa dưới + nhãn %. */
  scanning?: { percent: number } | null;
  /** Thả chuột / dùng phím ⇒ dải mới (đánh dấu "chỉnh tay"). */
  onChange: (band: BandPx) => void;
  /** Nhấp đúp ⇒ về dải dò. */
  onReset?: () => void;
}

interface DragState {
  handle: DragHandle;
  startX: number;
  startY: number;
  start: BandPx;
  result: DragResult;
}

const EDGES: { id: Exclude<DragHandle, "move">; cls: string; label: string }[] = [
  { id: "top", cls: "t", label: "Mép trên" },
  { id: "bottom", cls: "b", label: "Mép dưới" },
  { id: "left", cls: "l", label: "Mép trái" },
  { id: "right", cls: "r", label: "Mép phải" },
];

/** Khung dải chữ cứng trên khung video: kéo 4 mép + kéo cả khung, hút 4 px, phím ↑↓←→. */
export function BandOverlay(props: BandOverlayProps) {
  const { videoSize: v, displaySize: d, band, detectedBand, source = "auto", editing, effect, scanning, onChange, onReset } = props;
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const scale = v.w > 0 ? d.w / v.w : 1;

  useEffect(() => {
    if (!drag) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setDrag(null); // huỷ lần kéo
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [drag]);

  const shown = drag ? drag.result.band : band;
  if (!shown && !scanning) return null;

  const begin = (handle: DragHandle) => (e: PointerEvent<HTMLElement>) => {
    if (!band || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ handle, startX: e.clientX, startY: e.clientY, start: band, result: { band, snapped: {} } });
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const s = dragRef.current;
    if (!s || scale <= 0) return;
    const dx = (e.clientX - s.startX) / scale;
    const dy = (e.clientY - s.startY) / scale;
    const result = dragBand(s.start, s.handle, dx, dy, v, snapTargetsFor(v, detectedBand), !e.altKey);
    setDrag({ ...s, result });
  };
  const end = () => {
    const s = dragRef.current;
    dragRef.current = null; // pointerup nổi bọt từ mép lên khung ⇒ chỉ commit 1 lần
    setDrag(null);
    if (s && !sameBand(s.result.band, s.start)) onChange(s.result.band);
  };
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!band) return;
    const nb = nudgeBand(band, e.key, e.shiftKey, v);
    if (nb) {
      e.preventDefault();
      if (!sameBand(nb, band)) onChange(nb);
    }
  };

  const box = (b: BandPx) => ({ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale });
  const showEffect = !!effect?.visible && !!shown;
  const blurPx = effect ? previewBlurPx(effect.blur, v.h, d.h) : 0;
  const snap = drag?.result.snapped ?? {};
  const manual = source === "manual";

  return (
    <div className="v14-bo" aria-hidden={!editing}>
      {showEffect && shown && (
        <div
          className={`v14-bo-fx${effect?.stamp ? " stamp" : ""}`}
          style={{ ...box(shown), backdropFilter: `blur(${blurPx}px)`, WebkitBackdropFilter: `blur(${blurPx}px)` }}
        />
      )}
      {scanning && (
        <div className="v14-scan">
          <span>Đang dò chữ cứng… {scanning.percent} %</span>
        </div>
      )}
      {editing && drag && detectedBand && <div className="v14-ghost" style={box(detectedBand)} />}
      {editing && shown && (
        <div
          className={`v14-band${manual || drag ? " manual" : ""}`}
          style={box(shown)}
          tabIndex={0}
          role="group"
          aria-label="Dải chữ cứng — kéo hoặc dùng phím mũi tên để chỉnh"
          onKeyDown={onKey}
          onPointerDown={begin("move")}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={() => setDrag(null)}
          onDoubleClick={onReset}
        >
          <span className="v14-bo-tag">▭ Dải chữ cứng · {manual || drag ? "chỉnh tay" : "tự dò"}</span>
          {EDGES.map((h) => (
            <span
              key={h.id}
              className={`v14-edge ${h.cls}${drag?.handle === h.id ? " hot" : ""}`}
              aria-label={h.label}
              onPointerDown={begin(h.id)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={() => setDrag(null)}
            />
          ))}
          {drag && <span className="v14-readout">{readout(drag.result.band, v)}</span>}
          {snap.top && <i className="v14-snap h" style={{ top: -1 }} />}
          {snap.bottom && <i className="v14-snap h" style={{ bottom: -1 }} />}
          {snap.left && <i className="v14-snap v" style={{ left: -1 }} />}
          {snap.right && <i className="v14-snap v" style={{ right: -1 }} />}
        </div>
      )}
    </div>
  );
}
