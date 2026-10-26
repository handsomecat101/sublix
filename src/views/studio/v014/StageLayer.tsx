import { useEffect, useRef, useState, type RefObject } from "react";
import { BandOverlay } from "./BandOverlay";
import { KineticPreview, type KineticSegment } from "./KineticPreview";
import type { VideoSize } from "./bandGeometry";
import {
  isInSpans,
  resolvePreset,
  type BandPx,
  type HardsubSettings,
  type KineticPresetId,
  type SubStyle,
} from "./logic";
import "./v014.css";

/** Vùng video thật bên trong khung (object-fit: contain ⇒ có dải đen hai bên). */
export function containRect(frame: VideoSize, video: VideoSize): { x: number; y: number; w: number; h: number } {
  if (frame.w <= 0 || frame.h <= 0 || video.w <= 0 || video.h <= 0) return { x: 0, y: 0, w: frame.w, h: frame.h };
  const s = Math.min(frame.w / video.w, frame.h / video.h);
  const w = video.w * s;
  const h = video.h * s;
  return { x: (frame.w - w) / 2, y: (frame.h - h) / 2, w, h };
}

export interface StageLayerProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSize: VideoSize | null;
  subStyle: SubStyle;
  /** Mẫu đang rê chuột (xem thử tạm) — ưu tiên hơn mẫu đã chọn. */
  previewPreset: KineticPresetId | null;
  availablePresets: readonly KineticPresetId[];
  hardsub: HardsubSettings;
  detectedBand: BandPx | null;
  /** Tab Thuộc tính đang mở ⇒ hiện khung kéo chỉnh. */
  editing: boolean;
  scanning: { percent: number } | null;
  /** Câu đang phát (đổi theo câu, không theo khung hình). */
  segment: KineticSegment | null;
  onBandChange: (b: BandPx) => void;
  onBandReset: () => void;
}

/** `true` khi `currentTime` nằm trong khoảng có chữ — chỉ setState khi lật, đọc bằng rAF (không render lại Studio). */
function useInSpans(videoRef: RefObject<HTMLVideoElement | null>, spans: [number, number][], on: boolean): boolean {
  const [inside, setInside] = useState(false);
  const spansRef = useRef(spans);
  spansRef.current = spans;
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setInside(isInSpans(spansRef.current, v.currentTime));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [videoRef, on]);
  return inside;
}

/**
 * Lớp phủ trên khung video: dải chữ cứng (kéo chỉnh + mờ thật) và chữ nhảy xem thử.
 * Đặt trong khung video (`position: relative`); tự đo khung bằng ResizeObserver.
 */
export function StageLayer(p: StageLayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<VideoSize>({ w: 0, h: 0 });
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrame({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setFrame({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const rect = p.videoSize ? containRect(frame, p.videoSize) : null;
  const wantsBlur = p.hardsub.enabled && !!p.hardsub.band;
  const inSpan = useInSpans(p.videoRef, p.hardsub.spans, wantsBlur && p.hardsub.scope === "text_only" && p.hardsub.spans.length > 0);
  const blurVisible = wantsBlur && (p.hardsub.scope === "whole" || p.hardsub.spans.length === 0 || inSpan);
  const preset = resolvePreset(p.previewPreset ?? p.subStyle.preset, p.availablePresets);
  // Có dải + vị trí ottom ⇒ backend đặt chữ GIỮA dải (xem thử y hệt).
  const inBand = wantsBlur && p.subStyle.position === "bottom" && !!p.hardsub.band;
  const sc = rect && p.videoSize ? rect.w / p.videoSize.w : 1;
  const b = p.hardsub.band;
  const bandBox = b ? { position: "absolute" as const, left: b.x * sc, top: b.y * sc, width: b.w * sc, height: b.h * sc } : undefined;
  const kinetic = p.subStyle.mode === "kinetic" || p.previewPreset !== null;

  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}>
      {rect && p.videoSize && (
        <div style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
          {(p.hardsub.enabled || p.scanning) && (
            <BandOverlay
              videoSize={p.videoSize}
              displaySize={{ w: rect.w, h: rect.h }}
              band={p.hardsub.enabled ? p.hardsub.band : null}
              detectedBand={p.detectedBand}
              source={p.hardsub.bandSource}
              editing={p.editing && p.hardsub.enabled}
              effect={{ blur: p.hardsub.blur, stamp: p.hardsub.stamp, visible: blurVisible }}
              scanning={p.scanning}
              onChange={p.onBandChange}
              onReset={p.onBandReset}
            />
          )}
          {kinetic && (
            <div style={inBand ? bandBox : { position: "absolute", inset: 0 }}>
              <KineticPreview
                videoRef={p.videoRef}
                segment={p.segment}
                preset={preset}
                fontSizePx={(p.subStyle.fontSize * rect.h) / 1080}
                position={inBand ? "center" : p.subStyle.position}
                outline={p.subStyle.outline !== false}
                isTemporary={p.previewPreset !== null}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
