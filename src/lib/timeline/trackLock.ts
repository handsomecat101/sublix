/**
 * trackLock.ts — Khoá track + chặn thao tác chỉnh sửa kiểu Premiere.
 *
 * Module THUẦN TS: không import React, không import DOM, không import file nào
 * khác trong `src/lib/timeline/`.
 *
 * Ba track hiện có trong Studio (xem `src/views/SublixStudioView.tsx:6760-6930`):
 * - `"subtitles"`  → rãnh PHỤ ĐỀ (text)
 * - `"original"`   → rãnh TIẾNG GỐC (audio gốc, không chỉnh sửa được)
 * - `"speaker:<id>"` → rãnh TIẾNG LỒNG của từng vai
 *
 * Node chạy .ts bằng type-stripping nên file này CẤM: `enum`, `namespace`,
 * parameter properties, decorator. Dùng union string + object const.
 */

/** Khoá track phụ đề (text). */
export type SubtitleTrackKey = "subtitles";

/** Khoá track tiếng gốc. */
export type OriginalTrackKey = "original";

/** Khoá track tiếng lồng của một vai. */
export type SpeakerTrackKey = `speaker:${string}`;

/** Khoá track bất kỳ trong timeline. */
export type TrackKey = SubtitleTrackKey | OriginalTrackKey | SpeakerTrackKey;

/** Các thao tác chỉnh sửa có thể bị khoá. */
export type EditOperation = "move" | "trim" | "split" | "delete" | "edit-text" | "paste";

/** Trạng thái khoá track hiện tại. */
export interface TrackLockState {
  /** Danh sách track đang bị khoá. */
  readonly lockedTracks: readonly TrackKey[];
}

/**
 * Tạo trạng thái khoá rỗng.
 */
export function createTrackLockState(): TrackLockState {
  return { lockedTracks: [] };
}

/**
 * Dựng key track tiếng lồng từ id vai.
 *
 * @param speakerId Id vai (xem `SpeakerItem.id` trong Studio).
 */
export function speakerTrackKey(speakerId: string): SpeakerTrackKey {
  return `speaker:${speakerId}`;
}

/**
 * Tách key track tiếng lồng ra id vai.
 *
 * @param trackKey Key cần tách.
 * @returns Id vai, hoặc `null` nếu không phải track tiếng lồng.
 */
export function parseSpeakerTrackKey(trackKey: TrackKey): string | null {
  if (!trackKey.startsWith("speaker:")) return null;
  const id = trackKey.slice("speaker:".length);
  return id.length > 0 ? id : null;
}

/**
 * Track có đang bị khoá không.
 *
 * @param state    Trạng thái khoá.
 * @param trackKey Key track cần kiểm tra.
 */
export function isTrackLocked(state: TrackLockState, trackKey: TrackKey): boolean {
  return state.lockedTracks.includes(trackKey);
}

/**
 * Khoá một track (idempotent).
 *
 * @param state    Trạng thái khoá hiện tại.
 * @param trackKey Track cần khoá.
 */
export function lockTrack(state: TrackLockState, trackKey: TrackKey): TrackLockState {
  if (isTrackLocked(state, trackKey)) return state;
  return { lockedTracks: [...state.lockedTracks, trackKey] };
}

/**
 * Mở khoá một track (idempotent).
 *
 * @param state    Trạng thái khoá hiện tại.
 * @param trackKey Track cần mở khoá.
 */
export function unlockTrack(state: TrackLockState, trackKey: TrackKey): TrackLockState {
  if (!isTrackLocked(state, trackKey)) return state;
  return { lockedTracks: state.lockedTracks.filter((key) => key !== trackKey) };
}

/**
 * Bật/tắt khoá một track.
 *
 * @param state    Trạng thái khoá hiện tại.
 * @param trackKey Track cần bật/tắt.
 */
export function toggleTrackLock(state: TrackLockState, trackKey: TrackKey): TrackLockState {
  return isTrackLocked(state, trackKey)
    ? unlockTrack(state, trackKey)
    : lockTrack(state, trackKey);
}

/**
 * Các thao tác luôn bị chặn trên track "original" (tiếng gốc).
 * Audio gốc của video không được chỉnh sửa trong Studio.
 */
export const ALWAYS_BLOCKED_ON_ORIGINAL: readonly EditOperation[] = [
  "move",
  "trim",
  "split",
  "delete",
  "edit-text",
  "paste",
];

/**
 * Thao tác `op` có bị chặn trên track `trackKey` không.
 *
 * Quy tắc:
 * - Track "original" (tiếng gốc) bị chặn với mọi thao tác trong
 *   `ALWAYS_BLOCKED_ON_ORIGINAL` — audio gốc không được sửa trong Studio.
 * - Track bị khoá → chặn mọi thao tác.
 * - Track không bị khoá → không chặn.
 *
 * @param state    Trạng thái khoá.
 * @param trackKey Track bị tác động.
 * @param op       Loại thao tác.
 */
export function isEditBlocked(
  state: TrackLockState,
  trackKey: TrackKey,
  op: EditOperation,
): boolean {
  if (trackKey === "original" && ALWAYS_BLOCKED_ON_ORIGINAL.includes(op)) return true;
  return isTrackLocked(state, trackKey);
}

/**
 * Thao tác có bị chặn trên BẤT KỲ track nào trong danh sách không.
 * Dùng cho thao tác "paste" (chạm nhiều track cùng lúc).
 *
 * @param state     Trạng thái khoá.
 * @param trackKeys Các track bị tác động.
 * @param op        Loại thao tác.
 */
export function isAnyEditBlocked(
  state: TrackLockState,
  trackKeys: readonly TrackKey[],
  op: EditOperation,
): boolean {
  for (const trackKey of trackKeys) {
    if (isEditBlocked(state, trackKey, op)) return true;
  }
  return false;
}

/**
 * Lấy danh sách track bị chặn cho một thao tác (hữu ích để báo toast).
 *
 * @param state     Trạng thái khoá.
 * @param trackKeys Các track bị tác động.
 * @param op        Loại thao tác.
 */
export function blockedTracks(
  state: TrackLockState,
  trackKeys: readonly TrackKey[],
  op: EditOperation,
): TrackKey[] {
  return trackKeys.filter((trackKey) => isEditBlocked(state, trackKey, op));
}

/**
 * Tên hiển thị thân thiện của track (để hiện trong toast/tooltip).
 *
 * @param trackKey Key track.
 */
export function describeTrackKey(trackKey: TrackKey): string {
  if (trackKey === "subtitles") return "Phụ đề";
  if (trackKey === "original") return "Tiếng gốc";
  const speakerId = parseSpeakerTrackKey(trackKey);
  return speakerId !== null ? `Tiếng lồng: ${speakerId}` : trackKey;
}

/**
 * Thông báo lỗi (tiếng Việt) khi thao tác bị chặn — dùng cho toast.
 *
 * @param trackKey Track bị chặn.
 * @param op       Loại thao tác.
 */
export function editBlockedReason(trackKey: TrackKey, op: EditOperation): string {
  const actionLabels: Record<EditOperation, string> = {
    move: "di chuyển",
    trim: "cắt mép",
    split: "cắt đôi",
    delete: "xoá",
    "edit-text": "sửa nội dung",
    paste: "dán",
  };
  return `Không thể ${actionLabels[op]} trên track ${describeTrackKey(trackKey)} — track đang bị khoá.`;
}
