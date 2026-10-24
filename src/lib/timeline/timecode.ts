/**
 * timecode.ts — Parse / format timecode kiểu Premiere cho timeline Sublix.
 *
 * Module THUẦN TS: không import React, không import DOM, không import file nào
 * khác trong `src/lib/timeline/` (quy tắc tách lớp của dự án).
 *
 * Node chạy .ts bằng type-stripping nên file này CẤM: `enum`, `namespace`,
 * parameter properties, decorator. Dùng union string + object const.
 *
 * Ranh giới trách nhiệm: hàm ở đây CHỈ chuyển đổi chuỗi <-> giây.
 * Việc clamp về [0, duration] thuộc về tầng UI (coordinator xử lý),
 * xem `clampSeconds()` ở cuối file (helper thuần, tuỳ chọn).
 */

/** Số frame mặc định khi người dùng gõ timecode dạng frame mà không truyền fps. */
export const DEFAULT_FPS = 25;

/** Chuẩn timecode SMPTE dùng khi hiển thị: HH:MM:SS.mmm */
export const TIMECODE_SEPARATOR = ":";

/** Chuẩn phân tách phần mili-giây. */
export const MILLISECOND_SEPARATOR = ".";

/** Regex thời gian thuần dạng giây: "75" hoặc "75.5" (không âm, không khoảng trắng trong). */
const SECONDS_ONLY_RE = /^\d+(?:\.\d+)?$/;

/** Regex cho phần giây có mili-giây: "12" hoặc "12.345". */
const SECONDS_PART_RE = /^\d+(?:\.\d+)?$/;

/** Regex cho phần nguyên (giờ / phút / giây / frame). */
const INTEGER_PART_RE = /^\d+$/;

/**
 * Parse chuỗi timecode thành số giây.
 *
 * Chấp nhận:
 * - `"75.5"`            → giây thuần
 * - `"1:30"`            → mm:ss
 * - `"01:02:03"`        → hh:mm:ss
 * - `"01:02:03.250"`    → hh:mm:ss.mmm (mili-giây)
 * - `"01:02:03:12"`     → hh:mm:ss:ff (frame, cần `fps`)
 *
 * Quy tắc:
 * - Chuỗi rỗng / toàn khoảng trắng → `null`.
 * - Giá trị âm → `null` (clamp là việc của tầng UI).
 * - `hh:mm:ss` bắt buộc `mm < 60`, `ss < 60`.
 * - `hh:mm:ss:ff` bắt buộc `ff < fps` (dùng `fps` hoặc `DEFAULT_FPS`).
 * - Trong `hh:mm:ss:ff`, phần `ff` KHÔNG được có phần thập phân.
 *
 * @param text Chuỗi người dùng gõ (đã hoặc chưa trim — hàm tự trim).
 * @param fps  Số frame/giây dùng để quy đổi frame. Mặc định `DEFAULT_FPS`.
 * @returns Số giây, hoặc `null` nếu chuỗi sai định dạng.
 */
export function parseTimecode(text: string, fps: number = DEFAULT_FPS): number | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const effectiveFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;

  // 1) Giây thuần: "75" / "75.5"
  if (!trimmed.includes(TIMECODE_SEPARATOR)) {
    if (!SECONDS_ONLY_RE.test(trimmed)) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  }

  const parts = trimmed.split(TIMECODE_SEPARATOR);

  // 2) "hh:mm:ss:ff" — 4 phần
  if (parts.length === 4) {
    const [hh, mm, ss, ff] = parts;
    if (!INTEGER_PART_RE.test(hh) || !INTEGER_PART_RE.test(mm) || !INTEGER_PART_RE.test(ss)) {
      return null;
    }
    if (!INTEGER_PART_RE.test(ff)) return null;
    const hours = Number(hh);
    const minutes = Number(mm);
    const seconds = Number(ss);
    const frame = Number(ff);
    if (minutes > 59 || seconds > 59) return null;
    // Biên: frame phải nhỏ hơn fps (frame = fps là frame "kế tiếp", không hợp lệ).
    if (frame >= effectiveFps) return null;
    return hours * 3600 + minutes * 60 + seconds + frame / effectiveFps;
  }

  // 3) "hh:mm:ss" (3 phần) hoặc "mm:ss" (2 phần)
  if (parts.length === 3) {
    const [hh, mm, ssRaw] = parts;
    if (!INTEGER_PART_RE.test(hh) || !INTEGER_PART_RE.test(mm)) return null;
    if (!SECONDS_PART_RE.test(ssRaw)) return null;
    const hours = Number(hh);
    const minutes = Number(mm);
    const seconds = Number(ssRaw);
    if (minutes > 59 || seconds >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const [mm, ssRaw] = parts;
    if (!INTEGER_PART_RE.test(mm) || !SECONDS_PART_RE.test(ssRaw)) return null;
    const minutes = Number(mm);
    const seconds = Number(ssRaw);
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  // 4) Quá nhiều phần ("1:2:3:4:5") → sai định dạng.
  return null;
}

/**
 * Format số giây thành chuỗi timecode để đưa vào ô nhập.
 * Luôn trả về `HH:MM:SS.mmm` (mili-giây 3 chữ số) — định dạng này parse lại
 * được bằng `parseTimecode()` nên vòng nhập → xác nhận không bao giờ lệch.
 *
 * @param sec Số giây (NaN / Infinity → "00:00:00.000").
 */
export function formatTimecodeInput(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSec = (totalMs - ms) / 1000;
  const s = totalSec % 60;
  const totalMin = (totalSec - s) / 60;
  const m = totalMin % 60;
  const h = (totalMin - m) / 60;
  const pad = (n: number, width: number): string => String(n).padStart(width, "0");
  return `${pad(h, 2)}${TIMECODE_SEPARATOR}${pad(m, 2)}${TIMECODE_SEPARATOR}${pad(s, 2)}${MILLISECOND_SEPARATOR}${pad(ms, 3)}`;
}

/**
 * Format số giây thành chuỗi hiển thị `mm:ss.cc`.
 *
 * CỐ TÝ GIỐNG HỆT hàm `formatTimecode()` đang chạy ở
 * `src/views/SublixStudioView.tsx:115` (kể cả việc không hiện giờ) để thay
 * thế mà không đổi một pixel nào trên UI.
 *
 * @param sec Số giây (NaN / Infinity → "00:00.00").
 */
export function formatTimecodeDisplay(sec: number): string {
  const safe = Number.isFinite(sec) ? sec : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  const pad = (n: number, width: number): string => String(n).padStart(width, "0");
  return `${pad(m, 2)}:${pad(s, 2)}.${pad(cs, 2)}`;
}

/**
 * Clamp số giây về khoảng [0, durationSec].
 * Tách riêng khỏi `parseTimecode()` vì clamp phụ thuộc độ dài media
 * (chỉ tầng UI mới biết) — nhưng vẫn để ở đây để UI chỉ cần import 1 nơi.
 *
 * @param sec         Số giây cần clamp.
 * @param durationSec Độ dài media (giây). Nếu <= 0 thì không clamp trên.
 */
export function clampSeconds(sec: number, durationSec: number): number {
  if (!Number.isFinite(sec)) return 0;
  const lower = Math.max(0, sec);
  if (!Number.isFinite(durationSec) || durationSec <= 0) return lower;
  return Math.min(durationSec, lower);
}

/**
 * Chuyển số giây thành chỉ số frame (làm tròn xuống) — tiện cho UI hiển thị
 * "frame 12/25" khi bật chế độ frame.
 *
 * @param sec Số giây.
 * @param fps Số frame/giây (mặc định `DEFAULT_FPS`).
 */
export function secondsToFrame(sec: number, fps: number = DEFAULT_FPS): number {
  const effectiveFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.floor(sec * effectiveFps);
}

/**
 * Chuyển chỉ số frame thành số giây.
 *
 * @param frame Chỉ số frame (>= 0).
 * @param fps   Số frame/giây (mặc định `DEFAULT_FPS`).
 */
export function frameToSeconds(frame: number, fps: number = DEFAULT_FPS): number {
  const effectiveFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
  if (!Number.isFinite(frame) || frame <= 0) return 0;
  return frame / effectiveFps;
}
