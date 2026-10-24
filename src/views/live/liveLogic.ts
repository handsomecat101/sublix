//! TSK-UI-REDESIGN-R2-7B — logic **thuần** cho tab Live (không React, không Tauri).
//!
//! Mục tiêu: gộp "Chế độ xuất" + "Ngôn ngữ đích" thành **1 select "Phụ đề
//! hiển thị"** (UI_REDESIGN_PLAN §4.5) mà **không mất hành vi cũ**:
//! - Chọn "Gốc" → `outputMode = "original"`, ngôn ngữ đích được **giữ nguyên**
//!   (giống bản cũ: select ngôn ngữ đích bị ẩn nhưng state không mất).
//! - Chọn "Dịch sang X" → `outputMode = "translated"`, `targetLang = "X"`.
//!
//! Mọi hàm ở đây là hàm thuần → test được bằng `node --test` (không cần DOM).

/** Chế độ xuất mà backend hiểu (giữ đúng 2 giá trị cũ). */
export type LiveOutputMode = "original" | "translated";

/** Ngôn ngữ đích hỗ trợ dịch trực tiếp. */
export interface TargetLang {
  code: string;
  label: string;
  flag: string;
}

/** Ngôn ngữ gốc (ngôn ngữ đang nói). */
export interface SourceLang {
  code: string;
  label: string;
  flag: string;
}

/** Danh sách ngôn ngữ đích (thứ tự = thứ tự hiển thị trong select gộp). */
export const TARGET_LANGS: readonly TargetLang[] = [
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "ja", label: "Japanese", flag: "🇯🇵" },
  { code: "zh", label: "Chinese", flag: "🇨🇳" },
  { code: "ko", label: "Korean", flag: "🇰🇷" },
];

/** Danh sách ngôn ngữ gốc (giữ nguyên thứ tự & nhãn của bản cũ). */
export const SOURCE_LANGS: readonly SourceLang[] = [
  { code: "ja", label: "Japanese (Phim / Anime Nhật)", flag: "🇯🇵" },
  { code: "en", label: "English (YouTube / Meeting)", flag: "🇺🇸" },
  { code: "zh", label: "Chinese (Phim / Video Trung)", flag: "🇨🇳" },
  { code: "ko", label: "Korean (Phim / Video Hàn)", flag: "🇰🇷" },
  { code: "auto", label: "Auto-detect (Tự động)", flag: "🌐" },
];

/** Ngôn ngữ đích mặc định. */
export const DEFAULT_TARGET_LANG = "vi";

/** Giá trị của lựa chọn "Gốc (không dịch)" trong select gộp. */
export const ORIGINAL_DISPLAY_VALUE = "original";

/** Tiền tố giá trị của lựa chọn "Dịch sang …" trong select gộp. */
export const TRANSLATED_PREFIX = "translated:";

/** Một lựa chọn trong select gộp "Phụ đề hiển thị". */
export interface DisplayOption {
  /** Giá trị `<option value>`. */
  value: string;
  /** Nhãn hiển thị. */
  label: string;
  /** Chế độ xuất tương ứng. */
  mode: LiveOutputMode;
  /** Ngôn ngữ đích (`null` khi chỉ gõ chữ gốc). */
  lang: string | null;
}

/**
 * Dựng danh sách lựa chọn cho select gộp "Phụ đề hiển thị".
 *
 * Nếu `targetLang` hiện tại **không nằm trong danh sách** (config cũ / ngôn ngữ
 * tuỳ chọn) thì thêm một lựa chọn riêng → không bao giờ mất trạng thái đang chọn.
 */
export function buildDisplayOptions(targetLang: string): DisplayOption[] {
  const options: DisplayOption[] = [
    {
      value: ORIGINAL_DISPLAY_VALUE,
      label: "📝 Gốc (không dịch)",
      mode: "original",
      lang: null,
    },
  ];
  for (const t of TARGET_LANGS) {
    options.push({
      value: `${TRANSLATED_PREFIX}${t.code}`,
      label: `Dịch sang ${t.flag} ${t.label}`,
      mode: "translated",
      lang: t.code,
    });
  }
  if (targetLang && !TARGET_LANGS.some((t) => t.code === targetLang)) {
    options.push({
      value: `${TRANSLATED_PREFIX}${targetLang}`,
      label: `Dịch sang ${targetLang}`,
      mode: "translated",
      lang: targetLang,
    });
  }
  return options;
}

/** Trạng thái (chế độ xuất + ngôn ngữ đích) → giá trị của select gộp. */
export function toDisplayValue(mode: LiveOutputMode, targetLang: string): string {
  return mode === "original" ? ORIGINAL_DISPLAY_VALUE : `${TRANSLATED_PREFIX}${targetLang}`;
}

/**
 * Giá trị của select gộp → trạng thái (chế độ xuất + ngôn ngữ đích).
 *
 * `currentTargetLang` được giữ nguyên khi chọn "Gốc" (không mất lựa chọn của
 * người dùng — giống hành vi bản cũ).
 */
export function fromDisplayValue(
  value: string,
  currentTargetLang: string,
): { outputMode: LiveOutputMode; targetLang: string } {
  const fallback = currentTargetLang || DEFAULT_TARGET_LANG;
  if (!value || value === ORIGINAL_DISPLAY_VALUE) {
    return { outputMode: "original", targetLang: fallback };
  }
  const raw = value.startsWith(TRANSLATED_PREFIX) ? value.slice(TRANSLATED_PREFIX.length) : value;
  return { outputMode: "translated", targetLang: raw || fallback };
}

/** `"default"` → `undefined`; `"index:3"` → `3`; giá trị lạ → `undefined`. */
export function parseDeviceIndex(selectedDevice: string): number | undefined {
  if (!selectedDevice || selectedDevice === "default") return undefined;
  const match = /^index:(\d+)$/.exec(selectedDevice);
  if (!match) return undefined;
  const index = Number(match[1]);
  return Number.isFinite(index) ? index : undefined;
}

/** Giá trị `<option>` của một thiết bị trong danh sách. */
export function deviceOptionValue(index: number): string {
  return `index:${index}`;
}

/** Nhãn hiển thị của một thiết bị trong danh sách. */
export function deviceLabel(index: number, name: string): string {
  return `[${index}] ${name}`;
}

/** Giới hạn độ dài phân đoạn (giây) — giữ đúng khoảng của bản cũ (2–8s). */
export const CHUNK_SECONDS_MIN = 2;
export const CHUNK_SECONDS_MAX = 8;

/** Chặn giá trị độ dài phân đoạn nằm ngoài khoảng hợp lệ. */
export function clampChunkSeconds(value: number): number {
  if (!Number.isFinite(value)) return CHUNK_SECONDS_MIN;
  return Math.min(CHUNK_SECONDS_MAX, Math.max(CHUNK_SECONDS_MIN, Math.round(value)));
}

/** Nhãn của độ dài phân đoạn (ví dụ "3 giây"). */
export function chunkSecondsLabel(seconds: number): string {
  return `${clampChunkSeconds(seconds)} giây`;
}

/** Nhãn trạng thái lớn ở giữa màn hình Live. */
export function liveStatusLabel(isLive: boolean): string {
  return isLive ? "ĐANG BẮT ÂM THANH & DỊCH TRỰC TIẾP (LIVE STREAM)" : "SẴN SÀNG PHÁT LIVE";
}

/** Câu mô tả ngắn bên dưới trạng thái Live. */
export function liveHint(isLive: boolean): string {
  return isLive
    ? "Sublix đang lắng nghe qua WASAPI Loopback, cắt câu thông minh bằng Smart VAD, nhận dạng và bắn phụ đề trực tiếp lên màn hình."
    : "Mở YouTube, phim, podcast hoặc game. Bấm 'Bắt Đầu Live' để phụ đề nổi tự động dịch theo thời gian thực.";
}

/** Phần trăm đỉnh âm thanh (0–100). */
export function peakPercent(peakVolume: number): number {
  if (!Number.isFinite(peakVolume)) return 0;
  return Math.min(100, Math.max(0, peakVolume * 100));
}
