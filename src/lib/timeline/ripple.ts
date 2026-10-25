/**
 * ripple — Ripple delete (xoá + dồn khoảng trống) kiểu Premiere (module THUẦN TS).
 *
 * Nguyên lý:
 * 1. Các câu được chọn bị XOÁ khỏi timeline.
 * 2. Tổng thời lượng bị xoá = tổng các KHOẢNG HỢP NHẤT của các câu chọn
 *    (câu chồng nhau/nối tiếp → tính 1 khoảng gộp, không tính 2 lần).
 * 3. Mọi câu phía sau vùng bị xoá dịch sang TRÁI đúng bằng khoảng bị xoá;
 *    câu nằm lọt vào vùng xoá bị CẮT (hoặc bỏ hẳn nếu nằm trọn trong vùng).
 * 4. Track bị KHOÁ → KHÔNG dồn (trả về `blockedTrack` để UI báo toast).
 */

/** Segment tối thiểu mà ripple delete cần. */
export interface RippleSegment {
  id: number;
  start: number;
  end: number;
}

/** Đầu vào của ripple delete. */
export interface RippleInput<T extends RippleSegment> {
  /** Toàn bộ segment trên timeline. */
  segments: readonly T[];
  /** Id các segment được chọn (có thể nhiều, không cần liền nhau). */
  selectedIds: readonly number[];
  /** Danh sách track đang bị khoá (vd "subtitles", "speaker:s1"). */
  lockedTracks?: readonly string[];
  /** Ánh xạ segment → key track (mặc định: mọi segment thuộc track "subtitles"). */
  trackKeyOf?: (segment: T) => string;
}

/** Kết quả của ripple delete. */
export interface RippleResult<T> {
  /** Timeline mới (đã xoá + đã dồn). */
  segments: T[];
  /** Id các segment bị xoá. */
  removedIds: number[];
  /** Track bị khoá (nếu có → KHÔNG dồn, timeline giữ nguyên). */
  blockedTrack: string | null;
  /** Tổng thời lượng bị xoá (giây). */
  removedDuration: number;
  /** Số segment bị dịch trái. */
  shiftedCount: number;
}

/** Sai số so sánh thời gian (giây). */
const EPS = 1e-6;

/** Track mặc định khi không truyền `trackKeyOf`. */
export const DEFAULT_RIPPLE_TRACK = "subtitles";

/** Gộp các khoảng chồng nhau / nối tiếp thành khoảng hợp nhất. */
function mergeIntervals(
  intervals: ReadonlyArray<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end + EPS) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ start: iv.start, end: iv.end });
    }
  }
  return merged;
}

/**
 * Nén 1 mốc thời gian: trừ đi tổng khoảng đã xoá nằm TRƯỚC mốc đó.
 * Nếu mốc nằm BÊN TRONG một khoảng bị xoá → ghim về đầu khoảng đó.
 */
function compressTime(time: number, merged: ReadonlyArray<{ start: number; end: number }>): number {
  let removed = 0;
  for (const iv of merged) {
    if (iv.end <= time + EPS) {
      removed += iv.end - iv.start;
      continue;
    }
    if (iv.start < time) {
      // time nằm trong khoảng bị xoá → dồn về đầu khoảng
      return iv.start - removed;
    }
    break;
  }
  return time - removed;
}

/**
 * Ripple delete: xoá các câu đang chọn và dồn các câu phía sau sang trái.
 *
 * @param input Đầu vào.
 */
export function rippleDelete<T extends RippleSegment>(input: RippleInput<T>): RippleResult<T> {
  const ids = new Set(input.selectedIds);
  const selected = input.segments
    .filter((segment) => ids.has(segment.id))
    .sort((a, b) => a.start - b.start);

  if (selected.length === 0) {
    return {
      segments: [...input.segments],
      removedIds: [],
      blockedTrack: null,
      removedDuration: 0,
      shiftedCount: 0,
    };
  }

  // Track bị khoá → không dồn.
  const trackKeyOf = input.trackKeyOf ?? (() => DEFAULT_RIPPLE_TRACK);
  const locked = new Set(input.lockedTracks ?? []);
  const track = trackKeyOf(selected[0]);
  if (locked.has(track)) {
    return {
      segments: [...input.segments],
      removedIds: [],
      blockedTrack: track,
      removedDuration: 0,
      shiftedCount: 0,
    };
  }

  const merged = mergeIntervals(selected.map((s) => ({ start: s.start, end: s.end })));
  const removedDuration = merged.reduce((sum, iv) => sum + (iv.end - iv.start), 0);

  const out: T[] = [];
  let shiftedCount = 0;
  for (const segment of input.segments) {
    if (ids.has(segment.id)) continue;
    const newStart = compressTime(segment.start, merged);
    const newEnd = compressTime(segment.end, merged);
    // Câu nằm trọn trong vùng bị xoá → bị xoá luôn.
    if (newEnd - newStart <= EPS) continue;
    if (Math.abs(newStart - segment.start) > EPS || Math.abs(newEnd - segment.end) > EPS) {
      shiftedCount += 1;
    }
    out.push({ ...segment, start: newStart, end: newEnd });
  }

  return {
    segments: out,
    removedIds: selected.map((s) => s.id),
    blockedTrack: null,
    removedDuration,
    shiftedCount,
  };
}
