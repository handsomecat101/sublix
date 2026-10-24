//! TSK-UI-REDESIGN-R2-7B — logic **thuần** cho tab Lịch sử (không React, không Tauri).
//!
//! 3 việc được gom ra khỏi JSX để test được (`node --test`):
//! 1. Lọc / tìm trong danh sách lịch sử.
//! 2. Định dạng xuất SRT / TXT / sao chép.
//! 3. Tên file xuất.
//!
//! Lưu ý BUG-008: timestamp phải lấy từ **event thật** (`timestamp`), không
//! bịa theo bội số 3s — chỉ khi câu không có timestamp mới fallback.

import type { LiveSubPreview } from "../live/liveTypes";

/** BOM UTF-8 để Notepad / trình phát cũ hiển thị đúng tiếng Việt. */
export const UTF8_BOM = "\uFEFF";

/** Khoảng thời gian dự phòng khi câu không có timestamp thật (ms). */
export const FALLBACK_CUE_MS = 3000;

/** Thời lượng cue dự phòng (ms). */
export const FALLBACK_DURATION_MS = 2800;

/** Độ dài cue tối thiểu (ms) — tránh cue 0ms làm trình phụ đề nhảy. */
export const MIN_CUE_MS = 1000;

/** Lọc danh sách theo từ khoá (không phân biệt hoa thường, trim khoảng trắng). */
export function filterHistory(
  items: readonly LiveSubPreview[],
  search: string,
): LiveSubPreview[] {
  const term = search.trim().toLowerCase();
  if (!term) return [...items];
  return items.filter(
    (item) =>
      item.text.toLowerCase().includes(term) ||
      (item.original ?? "").toLowerCase().includes(term),
  );
}

/**
 * Sắp xếp theo thứ tự thời gian (cũ → mới).
 *
 * `recentSubs` trong app luôn đẩy câu MỚI nhất lên đầu (`[new, ...prev]`),
 * nên bản xuất file phải đảo lại — giữ đúng hành vi bản cũ.
 */
export function chronological(items: readonly LiveSubPreview[]): LiveSubPreview[] {
  return [...items].reverse();
}

/** Nội dung "Sao chép tất cả" (có nhãn [Gốc]/[Dịch] như bản cũ). */
export function buildCopyText(items: readonly LiveSubPreview[]): string {
  return chronological(items)
    .map((s) => (s.original ? `[Gốc] ${s.original}\n[Dịch] ${s.text}\n` : `${s.text}\n`))
    .join("\n");
}

/** Nội dung file .txt (bản gốc + bản dịch, cũ → mới). */
export function buildTxtContent(items: readonly LiveSubPreview[]): string {
  return chronological(items)
    .map((s) => (s.original ? `${s.original}\n${s.text}\n` : `${s.text}\n`))
    .join("\n");
}

/** Nội dung "Sao chép câu này" (1 câu đang chọn). */
export function buildSingleCopyText(item: LiveSubPreview | null): string {
  if (!item) return "";
  return item.original ? `${item.original}\n${item.text}` : item.text;
}

/** Định dạng mốc thời gian kiểu SRT: `HH:MM:SS,mmm`. */
export function formatSrtTimestamp(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const h = Math.floor(safe / 3600000);
  const m = Math.floor((safe % 3600000) / 60000);
  const sec = Math.floor((safe % 60000) / 1000);
  const millis = Math.floor(safe % 1000);
  return (
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:` +
    `${String(sec).padStart(2, "0")},${String(millis).padStart(3, "0")}`
  );
}

/**
 * Nội dung file .srt chuẩn.
 *
 * - Câu có `timestamp` thật → dùng timestamp (đã trừ mốc đầu tiên).
 * - Câu không có timestamp → fallback theo bội số 3s (như bản cũ).
 */
export function buildSrtContent(items: readonly LiveSubPreview[]): string {
  const list = chronological(items);
  if (list.length === 0) return "";
  const firstTs = list[0].timestamp ?? 0;

  let srt = "";
  list.forEach((s, idx) => {
    let startMs = 0;
    let endMs = 0;
    if (firstTs > 0 && s.timestamp) {
      startMs = Math.max(0, s.timestamp - firstTs);
      const durMs = Math.round((s.audio_duration ?? 2.5) * 1000);
      endMs = startMs + Math.max(MIN_CUE_MS, durMs);
    } else {
      startMs = idx * FALLBACK_CUE_MS;
      endMs = startMs + FALLBACK_DURATION_MS;
    }

    srt += `${idx + 1}\n`;
    srt += `${formatSrtTimestamp(startMs)} --> ${formatSrtTimestamp(endMs)}\n`;
    if (s.original) srt += `${s.original}\n`;
    srt += `${s.text}\n\n`;
  });
  return srt;
}

/** Tên file xuất: `sublix-subtitles-YYYY-MM-DD.srt` / `sublix-transcript-YYYY-MM-DD.txt`. */
export function exportFileName(
  kind: "subtitles" | "transcript",
  ext: "srt" | "txt",
  date: Date = new Date(),
): string {
  return `sublix-${kind}-${date.toISOString().slice(0, 10)}.${ext}`;
}
