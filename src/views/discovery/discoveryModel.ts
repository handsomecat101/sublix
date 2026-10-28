//! TSK-V015-DISC-UI — **logic thuần** cho tab "Khám phá" (không React, không I/O).
//!
//! Tách riêng để test được bằng `node --test scripts/discovery-tests/`:
//! - rút gọn số lượt xem (kiểu Bilibili `万`/`亿` vs YouTube `K`/`M`),
//! - thời gian đăng ("25 phút trước"),
//! - bóc id video từ URL (khớp với hàng đợi tải),
//! - điều hướng lưới bằng phím mũi tên,
//! - map lỗi backend ⇒ thông điệp tiếng Việt + hành động,
//! - nhãn trạng thái tải theo id video.
//!
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (nấc A).

import type { DiscoveryItem } from "../../lib/tauri";

/** Nguồn nội dung. */
export type DiscoverySource = "bilibili" | "youtube";

/** Danh sách nào đang xem. */
export type DiscoveryList = "hot" | "ranking" | "search";

/** Số lần thử lại tối đa khi bị chặn (đếm ngược 30 s). */
export const RETRY_DELAY_SECS = 30;

/** Ngưỡng "đủ lâu" để coi như video cũ ⇒ hiện ngày thay vì "N ngày trước". */
const AGO_DAYS_LIMIT = 30;

// ───────────────────────────── Số lượt xem ─────────────────────────────

/** Làm tròn 1 chữ số thập phân, bỏ phần `.0` (khớp `format_count` của lõi Rust). */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Ghép số + đơn vị: `1.0` + `K` ⇒ `"1K"`, `1.2` + `K` ⇒ `"1,2K"`. */
function join(value: number, unit: string): string {
  let text = value.toFixed(1);
  while (text.endsWith("0")) text = text.slice(0, -1);
  if (text.endsWith(".")) text = text.slice(0, -1);
  return `${text.replace(".", ",")}${unit}`;
}

/** Các mốc đơn vị, **giảm dần** — dùng để nhảy đơn vị khi làm tròn chạm trần. */
const UNITS: [number, string][] = [
  [1_000_000_000, "T"],
  [1_000_000, "M"],
  [1_000, "K"],
];

/**
 * Rút gọn theo kiểu YouTube: `987` · `12K` · `3,4M` · `1,2T`.
 *
 * Khớp `format_count` của lõi Rust (`src-tauri/src/discovery/format.rs`): khi làm
 * tròn **vượt đơn vị** (`999.950K`) thì tự nhảy lên đơn vị lớn hơn ⇒ `1M`.
 */
export function formatCountShort(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  const value = Math.floor(n);
  if (value < 1000) return String(value);
  for (let index = 0; index < UNITS.length; index += 1) {
    const [divisor, unit] = UNITS[index];
    if (value < divisor) continue;
    const rounded = round1(value / divisor);
    if (rounded >= 1000 && index > 0) {
      const [bigDivisor, bigUnit] = UNITS[index - 1];
      return join(round1(value / bigDivisor), bigUnit);
    }
    return join(rounded, unit);
  }
  return String(value);
}

/** Mốc đơn vị kiểu Bilibili: `万` = 10.000 · `亿` = 100.000.000. */
const BILI_UNITS: [number, string][] = [
  [100_000_000, "亿"],
  [10_000, "万"],
];

/** Rút gọn theo kiểu Bilibili: `9.876` · `12,8万` · `1,2亿`. */
export function formatCountBili(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  const value = Math.floor(n);
  if (value < 10_000) {
    // Nhóm nghìn bằng dấu chấm (kiểu Việt): 9876 ⇒ "9.876".
    return value.toLocaleString("vi-VN");
  }
  for (let index = 0; index < BILI_UNITS.length; index += 1) {
    const [divisor, unit] = BILI_UNITS[index];
    if (value < divisor) continue;
    const rounded = round1(value / divisor);
    if (rounded >= 1000 && index > 0) {
      const [bigDivisor, bigUnit] = BILI_UNITS[index - 1];
      return join(round1(value / bigDivisor), bigUnit);
    }
    return join(rounded, unit);
  }
  return String(value);
}

/** Lượt xem rút gọn theo nền tảng. */
export function formatViews(n: number | null | undefined, platform: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return platform === "bilibili" ? formatCountBili(n) : formatCountShort(n);
}

/** Tooltip đầy đủ cho lượt xem (số đủ + gợi ý đơn vị Bilibili). */
export function viewsTooltip(n: number | null | undefined, platform: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const full = Math.floor(n).toLocaleString("vi-VN");
  return platform === "bilibili" ? `${full} lượt xem · 万 = 10.000 · 亿 = 100.000.000` : `${full} lượt xem`;
}

// ───────────────────────────── Thời lượng & thời gian ─────────────────────────────

/** Thời lượng giây ⇒ `1:12:40` / `18:22`. Trả `""` nếu không rõ. */
export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec <= 0) return "";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Thời điểm đăng ⇒ "vừa xong" / "25 phút trước" / "3 giờ trước" / "6 ngày trước" /
 * `12/09/2026` (từ 30 ngày trở lên). Trả `""` nếu không có ngày đăng.
 */
export function formatAgo(publishTime: number | null | undefined, now: number): string {
  if (publishTime === null || publishTime === undefined || !Number.isFinite(publishTime)) return "";
  const secs = Math.floor(now / 1000) - Math.floor(publishTime);
  if (secs < 0) return "vừa xong";
  if (secs < 60) return "vừa xong";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < AGO_DAYS_LIMIT) return `${days} ngày trước`;
  const d = new Date(publishTime * 1000);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ───────────────────────────── Id video (khớp hàng đợi tải) ─────────────────────────────

/**
 * Bóc id video từ URL nguồn — dùng để khớp thẻ "Khám phá" với mục trong hàng đợi tải.
 *
 * - Bilibili: `https://www.bilibili.com/video/BV1xx` ⇒ `BV1xx`
 * - YouTube: `https://www.youtube.com/watch?v=abc` · `https://youtu.be/abc` ⇒ `abc`
 */
export function videoIdOf(url: string): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  const bili = /bilibili\.com\/video\/(BV[0-9A-Za-z]+)/i.exec(raw);
  if (bili) return bili[1];
  const yt = /[?&]v=([0-9A-Za-z_-]{6,})/.exec(raw);
  if (yt) return yt[1];
  const short = /youtu\.be\/([0-9A-Za-z_-]{6,})/.exec(raw);
  if (short) return short[1];
  return "";
}

/** Id video của một thẻ Khám phá (dùng `id` của lõi — đã là bvid / yt id). */
export function itemVideoId(item: DiscoveryItem): string {
  return (item?.id ?? "").trim();
}

// ───────────────────────────── Điều hướng lưới bằng phím ─────────────────────────────

/**
 * Trả về chỉ số mới sau khi bấm phím trong lưới, hoặc `null` nếu phím không đổi
 * vị trí (hoặc không phải phím điều hướng).
 */
export function gridNav(
  index: number,
  key: string,
  cols: number,
  total: number,
): number | null {
  if (total <= 0) return null;
  const c = Math.max(1, Math.floor(cols));
  let next: number | null = null;
  switch (key) {
    case "ArrowRight":
      next = index + 1;
      break;
    case "ArrowLeft":
      next = index - 1;
      break;
    case "ArrowDown":
      next = index + c;
      break;
    case "ArrowUp":
      next = index - c;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = total - 1;
      break;
    default:
      return null;
  }
  if (next < 0 || next >= total) return null;
  return next;
}

// ───────────────────────────── Gợi ý từ khoá ─────────────────────────────

/** Từ khoá có dấu tiếng Việt không? (⇒ nên gợi ý dùng tiếng Trung) */
export function isLikelyVietnamese(query: string): boolean {
  const q = (query ?? "").trim();
  if (!q) return false;
  // Chữ Latin mã hoá > 127 (đ, ê, ế, ộ…) ⇒ khả năng cao là tiếng Việt có dấu.
  // Dùng khoảng Latin-1 Supplement + Latin Extended-A để bắt dấu **dựng sẵn**
  // (é = U+00E9) lẫn dấu **tổ hợp** (e + U+0301).
  return /[\u0080-\u024f]/.test(q);
}

/** Nhãn nguồn hiển thị trên thẻ. */
export function platformLabel(platform: string): string {
  return platform === "bilibili" ? "B" : platform === "youtube" ? "▶" : "?";
}

/** Tên nguồn đầy đủ (dùng trong tooltip). */
export function platformName(platform: string): string {
  return platform === "bilibili" ? "Bilibili" : platform === "youtube" ? "YouTube" : "Nguồn khác";
}

// ───────────────────────────── Bộ đếm đếm ngược ─────────────────────────────

/** Định dạng số giây còn lại ⇒ "2:00" / "0:09". */
export function formatCountdown(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Bộ đếm đếm ngược "Thử lại": lần đầu chờ [`RETRY_DELAY_SECS`] (30 s), mỗi lần bị
 * chặn thì thời gian chờ **nhân đôi** (30 s → 1:00 → 2:00 → 4:00), tối đa 5 phút.
 */
export function nextRetryDelay(currentSecs: number): number {
  if (currentSecs <= 0) return RETRY_DELAY_SECS;
  return Math.min(Math.floor(currentSecs) * 2, 300);
}

/** Lưu/đọc tuỳ chọn tab con (localStorage, có try/catch). */
export function readStoredTab(key: string, fallback: string): string {
  try {
    const raw = window.localStorage.getItem(key);
    return raw && raw.trim() ? raw : fallback;
  } catch {
    return fallback;
  }
}

/** Ghi tuỳ chọn tab con (localStorage, có try/catch). */
export function writeStoredTab(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* localStorage bị chặn (private mode) — bỏ qua, không làm hỏng UI. */
  }
}
