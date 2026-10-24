/**
 * clipboard.ts — Copy / Paste câu thoại trên timeline kiểu Premiere.
 *
 * Module THUẦN TS: không import React, không import DOM, không import file nào
 * khác trong `src/lib/timeline/`.
 *
 * Vì sao có `TimelineSegment` riêng thay vì import `SubtitleItem`?
 * `SubtitleItem` đang export từ `src/views/SublixStudioView.tsx:87` — một file
 * React. Module logic thuần không được phụ thuộc vào file view (sẽ kéo theo
 * React và tạo vòng phụ thuộc). `TimelineSegment` có **cùng cấu trúc** nên
 * `SubtitleItem` gán thẳng cho nó được (TypeScript structural typing).
 *
 * Node chạy .ts bằng type-stripping nên file này CẤM: `enum`, `namespace`,
 * parameter properties, decorator. Dùng union string + object const.
 */

/**
 * Cấu trúc một câu thoại trên timeline.
 * GIỐNG HỆT `SubtitleItem` (src/views/SublixStudioView.tsx:87).
 */
export interface TimelineSegment {
  /** Id số, duy nhất trong timeline. */
  id: number;
  /** Thời điểm bắt đầu (giây). */
  start: number;
  /** Thời điểm kết thúc (giây). */
  end: number;
  /** Id vai nói. */
  speakerId: string;
  /** Nội dung gốc. */
  original: string;
  /** Nội dung đã dịch. */
  translated: string;
  /** true nếu câu này dịch lỗi. */
  translateFailed?: boolean;
  /** true nếu đã có tiếng lồng. */
  hasAudio?: boolean;
  /** data URI clip tiếng lồng. */
  audioUrl?: string;
  /** Độ dài thật của clip tiếng lồng (giây). */
  audioDuration?: number;
  /** Nguồn câu thoại. */
  source?: "youtube" | "whisper";
}

/** Nội dung clipboard sau khi copy. */
export interface ClipboardPayload {
  /** Các câu đã copy (đã bỏ tiếng lồng). */
  segments: TimelineSegment[];
  /** Mốc thời gian gốc của câu đầu tiên — dùng để tính độ lệch khi dán. */
  baseTime: number;
}

/** Một câu dán bị trùng với câu đã có sẵn trên timeline. */
export interface PasteConflict {
  /** Câu sắp được dán. */
  pasted: TimelineSegment;
  /** Câu đã tồn tại trên timeline bị chồng lấn. */
  existing: TimelineSegment;
  /** Thời lượng chồng lấn (giây). */
  overlapSec: number;
}

/** Kết quả thao tác dán. */
export interface PasteResult {
  /** Các câu mới được dán (đã cấp id mới, đã dịch thời gian). */
  segments: TimelineSegment[];
  /** Danh sách xung đột với câu đã có sẵn — KHÔNG tự xoá câu cũ. */
  conflicts: PasteConflict[];
  /** Các câu bị bỏ qua (không hợp lệ, hoặc trùng khi `skipConflicts` bật). */
  skipped: TimelineSegment[];
  /** Id tiếp theo có thể dùng (max id hiện tại + 1). */
  nextId: number;
}

/** Tuỳ chọn cho `pasteFromClipboard()`. */
export interface PasteOptions {
  /**
   * `true` → bỏ qua (không dán) các câu chồng lấn câu đã có sẵn.
   * `false` (mặc định) → vẫn dán, chỉ báo cáo xung đột để UI tự quyết định.
   */
  skipConflicts?: boolean;
}

/**
 * Id lớn nhất trong danh sách (-1 nếu rỗng).
 *
 * @param segments Danh sách câu thoại.
 */
export function maxSegmentId(segments: readonly TimelineSegment[]): number {
  let max = -1;
  for (const segment of segments) {
    if (Number.isFinite(segment.id) && segment.id > max) max = segment.id;
  }
  return max;
}

/**
 * Hai câu có chồng lấn thời gian không.
 *
 * @param a Câu A.
 * @param b Câu B.
 */
export function segmentsOverlap(a: TimelineSegment, b: TimelineSegment): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Bỏ mọi dấu vết tiếng lồng khỏi câu thoại.
 * Tiếng lồng phải được TẠO LẠI sau khi dán — không thể tái sử dụng data URI cũ
 * vì clip đã được dịch chuyển thời gian.
 *
 * @param segment Câu thoại gốc.
 */
export function stripVoice(segment: TimelineSegment): TimelineSegment {
  const copy: TimelineSegment = {
    id: segment.id,
    start: segment.start,
    end: segment.end,
    speakerId: segment.speakerId,
    original: segment.original,
    translated: segment.translated,
  };
  if (segment.translateFailed !== undefined) copy.translateFailed = segment.translateFailed;
  if (segment.source !== undefined) copy.source = segment.source;
  return copy;
}

/**
 * Copy câu thoại đang chọn vào clipboard.
 *
 * - Giữ nguyên **khoảng cách tương đối** giữa các câu (mốc thời gian không đổi
 *   lúc copy — độ lệch được tính lúc dán).
 * - Bỏ tiếng lồng (`audioUrl` / `hasAudio` / `audioDuration`).
 * - `baseTime` = thời điểm bắt đầu sớm nhất trong nhóm.
 *
 * @param segments Các câu được chọn.
 */
export function copyToClipboard(segments: readonly TimelineSegment[]): ClipboardPayload {
  const valid = segments.filter(
    (segment) =>
      Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start,
  );
  const sorted = [...valid].sort((a, b) => a.start - b.start);
  const baseTime = sorted.length > 0 ? sorted[0].start : 0;
  return {
    segments: sorted.map(stripVoice),
    baseTime,
  };
}

/**
 * Dán nội dung clipboard vào timeline tại vị trí playhead.
 *
 * - Câu đầu tiên trong clipboard được đặt **đúng bằng** `playhead`.
 * - Mỗi câu được cấp id mới: `maxId + 1`, `maxId + 2`, …
 * - Tiếng lồng bị bỏ (phải tạo lại) — xem `stripVoice()`.
 * - Câu chồng lấn câu đã có sẵn được ghi vào `conflicts`; **không tự xoá** câu cũ.
 *
 * @param payload   Nội dung clipboard.
 * @param existing  Các câu đang có trên timeline.
 * @param playhead  Vị trí playhead (giây) — điểm neo của câu đầu tiên.
 * @param options   Tuỳ chọn (xem `PasteOptions`).
 */
export function pasteFromClipboard(
  payload: ClipboardPayload,
  existing: readonly TimelineSegment[],
  playhead: number,
  options: PasteOptions = {},
): PasteResult {
  const skipConflicts = options.skipConflicts === true;
  const conflicts: PasteConflict[] = [];
  const skipped: TimelineSegment[] = [];
  const pasted: TimelineSegment[] = [];

  const anchor = Number.isFinite(playhead) ? playhead : 0;
  const delta = anchor - payload.baseTime;
  let nextId = maxSegmentId(existing) + 1;

  for (const source of payload.segments) {
    const start = source.start + delta;
    const end = source.end + delta;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      skipped.push({ ...stripVoice(source), id: nextId, start, end });
      nextId += 1;
      continue;
    }

    const candidate: TimelineSegment = {
      ...stripVoice(source),
      id: nextId,
      start,
      end,
    };

    const overlapping = existing.filter((other) => segmentsOverlap(candidate, other));
    if (overlapping.length > 0) {
      for (const other of overlapping) {
        const overlapSec = Math.min(end, other.end) - Math.max(start, other.start);
        conflicts.push({ pasted: candidate, existing: other, overlapSec });
      }
      if (skipConflicts) {
        skipped.push(candidate);
        nextId += 1;
        continue;
      }
    }

    pasted.push(candidate);
    nextId += 1;
  }

  return { segments: pasted, conflicts, skipped, nextId };
}
