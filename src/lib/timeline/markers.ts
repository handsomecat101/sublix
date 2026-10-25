/**
 * markers.ts — Marker (ghim mốc) trên timeline kiểu Premiere.
 *
 * Module THUẦN TS: không import React, không import DOM, không import file nào
 * khác trong `src/lib/timeline/`.
 *
 * Node chạy .ts bằng type-stripping nên file này CẤM: `enum`, `namespace`,
 * parameter properties, decorator. Dùng union string + object const.
 */

/** Một marker trên timeline. */
export interface TimelineMarker {
  /** Id duy nhất, sinh tự động nếu không truyền. */
  id: string;
  /** Vị trí thời gian (giây). */
  time: number;
  /** Tên hiển thị tuỳ chọn. */
  name?: string;
  /** Màu hiển thị tuỳ chọn (chuỗi CSS). */
  color?: string;
}

/**
 * Hai marker cách nhau DƯỚI ngưỡng này được coi là trùng nhau và gộp lại.
 * Ngưỡng 0.05s = 50ms, đủ nhỏ để bấm nhầm cũng gộp, đủ lớn để bấm chuẩn vẫn tạo marker mới.
 */
export const MARKER_MERGE_EPSILON = 0.05;

/** Tuỳ chọn khi thêm marker. */
export interface AddMarkerOptions {
  /** Id tuỳ chọn (mặc định sinh tự động `m<n>`). */
  id?: string;
  /** Tên tuỳ chọn. */
  name?: string;
  /** Màu tuỳ chọn. */
  color?: string;
}

/**
 * Sinh id marker tiếp theo theo dạng `m<n>`, không dùng random/Date để
 * hàm vẫn thuần khiết và kiểm thử được.
 *
 * @param markers Danh sách marker hiện có.
 */
export function nextMarkerId(markers: readonly TimelineMarker[]): string {
  let max = 0;
  for (const marker of markers) {
    const match = /^m(\d+)$/.exec(marker.id);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `m${max + 1}`;
}

/**
 * Marker có nằm trong khoảng `epsilon` quanh `time` không.
 *
 * @param markers Danh sách marker.
 * @param time    Vị trí cần kiểm tra (giây).
 * @param epsilon Ngưỡng gộp (mặc định `MARKER_MERGE_EPSILON`).
 */
export function findMarkerAt(
  markers: readonly TimelineMarker[],
  time: number,
  epsilon: number = MARKER_MERGE_EPSILON,
): TimelineMarker | null {
  if (!Number.isFinite(time)) return null;
  for (const marker of markers) {
    if (Math.abs(marker.time - time) < epsilon) return marker;
  }
  return null;
}

/**
 * Thêm marker tại `time`.
 * Nếu đã có marker cách < `MARKER_MERGE_EPSILON` thì **không thêm** (gộp) —
 * danh sách cũ được giữ nguyên.
 *
 * @param markers Danh sách marker hiện có.
 * @param time    Vị trí (giây).
 * @param options Tuỳ chọn (id / name / color).
 * @returns Danh sách MỚI (không mutate danh sách cũ).
 */
export function addMarker(
  markers: readonly TimelineMarker[],
  time: number,
  options: AddMarkerOptions = {},
): TimelineMarker[] {
  if (!Number.isFinite(time)) return [...markers];
  if (findMarkerAt(markers, time) !== null) return [...markers];

  const marker: TimelineMarker = {
    id: options.id ?? nextMarkerId(markers),
    time,
  };
  if (options.name !== undefined) marker.name = options.name;
  if (options.color !== undefined) marker.color = options.color;

  return [...markers, marker];
}

/**
 * Xoá marker theo id.
 *
 * @param markers Danh sách marker hiện có.
 * @param id      Id cần xoá.
 */
export function removeMarker(markers: readonly TimelineMarker[], id: string): TimelineMarker[] {
  return markers.filter((marker) => marker.id !== id);
}

/**
 * Bật/tắt marker tại `time`: nếu đã có marker gần đó thì xoá, ngược lại thêm.
 *
 * @param markers Danh sách marker hiện có.
 * @param time    Vị trí (giây).
 * @param options Tuỳ chọn khi thêm mới.
 */
export function toggleMarker(
  markers: readonly TimelineMarker[],
  time: number,
  options: AddMarkerOptions = {},
): TimelineMarker[] {
  const existing = findMarkerAt(markers, time);
  if (existing !== null) return removeMarker(markers, existing.id);
  return addMarker(markers, time, options);
}

/**
 * Marker kế tiếp SAU playhead (dùng cho phím Shift+M).
 * Bỏ qua marker nằm đúng tại playhead.
 *
 * @param markers  Danh sách marker.
 * @param playhead Vị trí playhead (giây).
 */
export function findNextMarker(
  markers: readonly TimelineMarker[],
  playhead: number,
): TimelineMarker | null {
  if (!Number.isFinite(playhead)) return null;
  let best: TimelineMarker | null = null;
  for (const marker of markers) {
    if (marker.time <= playhead + MARKER_MERGE_EPSILON) continue;
    if (best === null || marker.time < best.time) best = marker;
  }
  return best;
}

/**
 * Marker liền TRƯỚC playhead (dùng cho phím Ctrl+Shift+M).
 *
 * @param markers  Danh sách marker.
 * @param playhead Vị trí playhead (giây).
 */
export function findPrevMarker(
  markers: readonly TimelineMarker[],
  playhead: number,
): TimelineMarker | null {
  if (!Number.isFinite(playhead)) return null;
  let best: TimelineMarker | null = null;
  for (const marker of markers) {
    if (marker.time >= playhead - MARKER_MERGE_EPSILON) continue;
    if (best === null || marker.time > best.time) best = marker;
  }
  return best;
}

/**
 * Sắp xếp marker theo thời gian tăng dần (bản sao, không mutate).
 *
 * @param markers Danh sách marker.
 */
export function sortMarkers(markers: readonly TimelineMarker[]): TimelineMarker[] {
  return [...markers].sort((a, b) => a.time - b.time);
}

/** Định dạng file lưu marker trên đĩa. */
export interface MarkerFile {
  version: 1;
  markers: TimelineMarker[];
}

/**
 * Serialize danh sách marker thành chuỗi JSON an toàn.
 *
 * @param markers Danh sách marker.
 */
export function serializeMarkers(markers: readonly TimelineMarker[]): string {
  const payload: MarkerFile = {
    version: 1,
    markers: sortMarkers(markers).map((marker) => {
      const item: TimelineMarker = { id: marker.id, time: marker.time };
      if (marker.name !== undefined) item.name = marker.name;
      if (marker.color !== undefined) item.color = marker.color;
      return item;
    }),
  };
  return JSON.stringify(payload);
}

/**
 * Đọc danh sách marker từ chuỗi JSON — **an toàn**: JSON hỏng hoặc sai kiểu
 * trả về mảng rỗng thay vì ném lỗi; các mục thiếu id / time không hợp lệ bị bỏ qua.
 *
 * @param json Chuỗi JSON đã đọc từ đĩa.
 */
export function deserializeMarkers(json: string): TimelineMarker[] {
  if (typeof json !== "string" || json.trim().length === 0) return [];
  try {
    return normalizeMarkers(JSON.parse(json));
  } catch {
    return [];
  }
}

/**
 * Màu mặc định của marker (khi dữ liệu cũ không có `color`).
 */
export const DEFAULT_MARKER_COLOR = "#38bdf8";

/**
 * Bóc ra mảng marker từ nhiều dạng lưu trữ khác nhau:
 * - mảng trực tiếp: `[12.5, 30]`
 * - mảng object: `[{ id, time, color }]`
 * - bọc: `{ version: 1, markers: [...] }` hoặc `{ items: [...] }`
 */
function extractMarkerList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as { markers?: unknown; items?: unknown };
    if (Array.isArray(obj.markers)) return obj.markers;
    if (Array.isArray(obj.items)) return obj.items;
  }
  return [];
}

/**
 * Chuẩn hoá danh sách marker đọc từ project cache.
 *
 * Project CŨ có thể lưu marker theo các dạng khác nhau:
 * - số giây thuần: `[12.5, 30]` (bản `bookmarks` cũ)
 * - object thiếu `id`: `[{ time: 12.5 }]`
 * - object thiếu `color`: `[{ id: "m1", time: 12.5 }]`
 * - `time` là chuỗi: `[{ time: "12.5" }]`
 * - key thời gian khác: `{ seconds }` / `{ start }` / `{ position }`
 *
 * Luôn trả về mảng marker hợp lệ (id + time + color), đã sắp xếp theo thời gian.
 *
 * @param raw Dữ liệu thô đọc từ cache.
 */
export function normalizeMarkers(raw: unknown): TimelineMarker[] {
  const list = extractMarkerList(raw);
  const out: TimelineMarker[] = [];
  const usedIds = new Set<string>();
  let auto = 0;

  for (const item of list) {
    // Dạng cũ: số giây thuần.
    if (typeof item === "number") {
      if (!Number.isFinite(item) || item < 0) continue;
      auto += 1;
      out.push({ id: `m${auto}`, time: item, color: DEFAULT_MARKER_COLOR });
      continue;
    }
    if (!item || typeof item !== "object") continue;

    const obj = item as Record<string, unknown>;
    const rawTime = obj.time ?? obj.seconds ?? obj.start ?? obj.position ?? obj.at;
    const time = typeof rawTime === "string" ? Number(rawTime.replace(",", ".")) : rawTime;
    if (typeof time !== "number" || !Number.isFinite(time) || time < 0) continue;

    let id = typeof obj.id === "string" && obj.id.trim().length > 0 ? obj.id.trim() : "";
    if (!id || usedIds.has(id)) {
      do {
        auto += 1;
        id = `m${auto}`;
      } while (usedIds.has(id));
    }
    usedIds.add(id);

    const marker: TimelineMarker = {
      id,
      time,
      color:
        typeof obj.color === "string" && obj.color.trim().length > 0
          ? obj.color
          : DEFAULT_MARKER_COLOR,
    };
    if (typeof obj.name === "string" && obj.name.length > 0) marker.name = obj.name;
    out.push(marker);
  }

  return sortMarkers(out);
}
