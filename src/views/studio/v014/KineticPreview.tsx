import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { activeWordIndex, wordTimings } from "../../../lib/subtitles/kineticTiming";
import { wordState, type KineticPresetId, type SubPosition } from "./logic";
import "./v014.css";

/** Dòng chữ nhảy thuần trình bày: nhận chỉ số từ đang nói, không tự đếm giờ. */
export const KineticWords = memo(function KineticWords(props: {
  words: readonly string[];
  active: number;
  preset: KineticPresetId;
  outline?: boolean;
  fontSizePx?: number;
}) {
  const { words, active, preset, outline = true, fontSizePx } = props;
  return (
    <div
      className="v14-kl"
      data-preset={preset}
      data-outline={outline ? "1" : "0"}
      style={fontSizePx ? { fontSize: fontSizePx } : undefined}
    >
      {words.map((w, i) => (
        <span key={i} className="v14-kw" data-s={wordState(i, active)}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </div>
  );
});

export interface KineticSegment {
  text: string;
  /** Bắt đầu / kết thúc câu trên timeline (giây). */
  start: number;
  end: number;
}

export interface KineticPreviewProps {
  /** Ref tới `<video>` đang phát — đọc `currentTime` bằng rAF, KHÔNG qua state của Studio. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Câu đang phát (đổi khi sang câu khác; `null` = không có câu). */
  segment: KineticSegment | null;
  preset: KineticPresetId;
  /** Cỡ chữ **đã quy ra px hiển thị** (cỡ 1080p × cao_hiển_thị/1080). */
  fontSizePx: number;
  position?: SubPosition;
  outline?: boolean;
  /** Đang rê chuột xem thử 1 mẫu chưa chọn ⇒ hiện nhãn "đang xem thử". */
  isTemporary?: boolean;
}

/**
 * Lớp chữ nhảy trên khung xem thử. Từ đang nói lấy từ `wordTimings` + `activeWordIndex`
 * (đúng hàm bản Rust khớp vectors ⇒ xem thử = xuất). Chỉ `setState` khi chỉ số từ đổi.
 */
export const KineticPreview = memo(function KineticPreview(props: KineticPreviewProps) {
  const { videoRef, segment, preset, fontSizePx, position = "bottom", outline = true, isTemporary } = props;
  const timings = useMemo(
    () => (segment ? wordTimings(segment.text, segment.start, segment.end) : []),
    [segment],
  );
  const words = useMemo(() => timings.map((t) => t.word), [timings]);
  const [active, setActive] = useState(-1);
  const startRef = useRef(0);
  startRef.current = segment?.start ?? 0;

  useEffect(() => {
    if (timings.length === 0) {
      setActive(-1);
      return;
    }
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setActive(activeWordIndex(timings, startRef.current, v.currentTime));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [timings, videoRef]);

  if (!segment || words.length === 0) return null;
  return (
    <>
      <div className="v14-kinetic" data-pos={position}>
        <KineticWords words={words} active={active} preset={preset} outline={outline} fontSizePx={fontSizePx} />
      </div>
      {isTemporary && <div className="v14-preview-tag">đang xem thử</div>}
    </>
  );
});
