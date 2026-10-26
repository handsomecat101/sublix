/**
 * Logic thuần của giao diện v0.14 (kiểu phụ đề + phụ đề cứng) — KHÔNG import React / Tauri
 * để `node --test` chạy thẳng (xem `scripts/studio-v014-tests/`). Thiết kế: docs/UI_REDESIGN_PLAN.md §4.12.
 *
 * Các type `SubStyle` / `HardsubSettings` là bản CỤC BỘ, tên khớp field backend sắp thêm vào
 * `DubbingProject`; lúc nối sẽ thay bằng type chung trong `types.ts`.
 */

// ───────────────────────── Kiểu dữ liệu ─────────────────────────

export type SubStyleMode = "normal" | "kinetic";
export type KineticPresetId = "pop-amber" | "karaoke-cyan" | "box-amber" | "reveal";
export type SubPosition = "bottom" | "middle" | "top";

export interface SubStyle {
  mode: SubStyleMode;
  preset: KineticPresetId;
  /** Cỡ chữ (px ở khung 1080p). */
  fontSize: number;
  position: SubPosition;
  /** Viền & bóng. */
  outline?: boolean;
}

export type HardsubBlur = "light" | "medium" | "strong";
export type HardsubScope = "text-only" | "whole";

/** Dải chữ cứng, **pixel video gốc** (cùng hệ toạ độ với `hardsub_detect`). */
export interface BandPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HardsubSettings {
  /** Mặc định false. */
  enabled: boolean;
  band: BandPx | null;
  /** Các khoảng có chữ `[bắt đầu, kết thúc]` (giây). */
  spans: [number, number][];
  blur: HardsubBlur;
  /** Nền tem mờ đục. */
  stamp: boolean;
  scope: HardsubScope;
  /** "manual" = người dùng đã kéo/tự đặt dải. */
  bandSource?: "auto" | "manual";
}

export const DEFAULT_SUB_STYLE: SubStyle = {
  mode: "normal",
  preset: "pop-amber",
  fontSize: 42,
  position: "bottom",
  outline: true,
};

export const DEFAULT_HARDSUB: HardsubSettings = {
  enabled: false,
  band: null,
  spans: [],
  blur: "medium",
  stamp: true,
  scope: "text-only",
  bandSource: "auto",
};

export const PRESETS: { id: KineticPresetId; label: string }[] = [
  { id: "pop-amber", label: "Vàng nảy" },
  { id: "karaoke-cyan", label: "Karaoke xanh" },
  { id: "box-amber", label: "Hộp cam" },
  { id: "reveal", label: "Hiện dần" },
];

/** Mẫu được chọn phải nằm trong danh sách backend hỗ trợ; không thì về mẫu đầu tiên còn lại. */
export function resolvePreset(
  wanted: KineticPresetId,
  available?: readonly KineticPresetId[],
): KineticPresetId {
  if (!available || available.length === 0 || available.includes(wanted)) return wanted;
  return available[0];
}

/** Trạng thái hiển thị của 1 từ trong câu: đã nói / đang nói / chưa nói. */
export type WordState = "done" | "active" | "pending";
export function wordState(index: number, activeIdx: number): WordState {
  if (activeIdx < 0) return "pending";
  if (index < activeIdx) return "done";
  return index === activeIdx ? "active" : "pending";
}

// ───────────────────────── Mức mờ ─────────────────────────

/** `gblur sigma` ở 1080p (UI_REDESIGN_PLAN §4.12 B). */
export const BLUR_SIGMA_1080: Record<HardsubBlur, number> = { light: 6, medium: 12, strong: 20 };
export const BLUR_LABEL: Record<HardsubBlur, string> = { light: "Nhẹ", medium: "Vừa", strong: "Mạnh" };

/** sigma khi xuất (nhân cao_video/1080). */
export function exportBlurSigma(level: HardsubBlur, videoH: number): number {
  return BLUR_SIGMA_1080[level] * (videoH / 1080);
}

/** `blur(px)` của `backdrop-filter` ở khung xem thử: sigma × cao_hiển_thị / cao_video. */
export function previewBlurPx(level: HardsubBlur, videoH: number, displayH: number): number {
  if (videoH <= 0 || displayH <= 0) return 0;
  return (exportBlurSigma(level, videoH) * displayH) / videoH;
}

/** Mức gần nhất với 1 sigma ở 1080p (đọc lại từ project cũ / giá trị tuỳ ý). */
export function blurLevelFromSigma(sigma1080: number): HardsubBlur {
  let best: HardsubBlur = "medium";
  let bestD = Infinity;
  for (const k of Object.keys(BLUR_SIGMA_1080) as HardsubBlur[]) {
    const d = Math.abs(BLUR_SIGMA_1080[k] - sigma1080);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

// ───────────────────────── Khoảng thời gian có chữ ─────────────────────────

export function isInSpans(spans: readonly [number, number][], t: number): boolean {
  return spans.some(([a, b]) => t >= a && t <= b);
}

/** Tổng % thời lượng có chữ (0–100), các khoảng đã gộp nên cộng thẳng. */
export function coveragePct(spans: readonly [number, number][], duration: number): number {
  if (!(duration > 0)) return 0;
  const sum = spans.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, duration) - Math.max(a, 0)), 0);
  return Math.min(100, (sum / duration) * 100);
}

/** Đoạn vẽ trên thanh thời gian: `left`/`width` theo % chiều rộng. */
export function spanBarSegments(
  spans: readonly [number, number][],
  duration: number,
): { left: number; width: number; start: number }[] {
  if (!(duration > 0)) return [];
  return spans
    .filter(([a, b]) => b > a && a < duration)
    .map(([a, b]) => {
      const s = Math.max(0, a);
      const e = Math.min(duration, b);
      return { left: (s / duration) * 100, width: Math.max(0.4, ((e - s) / duration) * 100), start: s };
    });
}

// ───────────────────────── Trạng thái thẻ phụ đề cứng ─────────────────────────

export type DetectErrorKind = "model" | "deps" | "video" | "cancelled" | "other";

/** Tách mã `HARDSUB_*:` khỏi lỗi của `hardsubDetect` và đưa về loại + thông điệp dễ hiểu. */
export function parseDetectError(err: unknown): { kind: DetectErrorKind; message: string } {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = /^(HARDSUB_[A-Z_]+):\s*(.*)$/s.exec(raw.trim());
  const code = m?.[1] ?? "";
  const message = (m?.[2] ?? raw).trim() || "Không rõ nguyên nhân";
  const kind: DetectErrorKind =
    code === "HARDSUB_MODEL_MISSING"
      ? "model"
      : code === "HARDSUB_DEPS_MISSING"
        ? "deps"
        : code === "HARDSUB_VIDEO_UNREADABLE"
          ? "video"
          : code === "HARDSUB_CANCELLED"
            ? "cancelled"
            : "other";
  return { kind, message };
}

/** Phần của `HardsubDetection` mà logic cần. */
export interface DetectionLike {
  band: BandPx | null;
  spans: [number, number][];
  frames_with_text: number;
  frames_total: number;
}

export type HardsubCardState =
  | { kind: "off" }
  | { kind: "idle" }
  | { kind: "running"; percent: number; message: string }
  | { kind: "found"; where: string; segments: number; coverage: number; weak: boolean; manual: boolean }
  | { kind: "none"; framesScanned: number }
  | { kind: "error"; error: DetectErrorKind; message: string };

export interface CardStateInput {
  enabled: boolean;
  running: { percent: number; message: string } | null;
  detection: DetectionLike | null;
  error: unknown;
  durationSec: number;
  /** Dải đang dùng (dò hoặc tay). */
  band: BandPx | null;
  bandSource?: "auto" | "manual";
  videoH: number;
}

/** "đáy khung" / "giữa khung" / "đỉnh khung" theo tâm dải. */
export function bandWhere(band: BandPx, videoH: number): string {
  if (videoH <= 0) return "trong khung";
  const c = (band.y + band.h / 2) / videoH;
  return c > 0.66 ? "đáy khung" : c < 0.34 ? "đỉnh khung" : "giữa khung";
}

/** Ghép dữ liệu thật thành 1 trong 6 trạng thái của thẻ (UI_REDESIGN_PLAN §4.12 C). */
export function deriveCardState(i: CardStateInput): HardsubCardState {
  if (!i.enabled) return { kind: "off" };
  if (i.running) return { kind: "running", percent: clampPct(i.running.percent), message: i.running.message };
  if (i.error) {
    const e = parseDetectError(i.error);
    if (e.kind !== "cancelled") return { kind: "error", error: e.kind, message: e.message };
    return i.band ? foundState(i, i.detection) : { kind: "idle" };
  }
  if (i.detection?.band || (i.band && i.bandSource === "manual")) return foundState(i, i.detection);
  if (i.detection) return { kind: "none", framesScanned: i.detection.frames_total };
  return i.band ? foundState(i, null) : { kind: "idle" };
}

function foundState(i: CardStateInput, d: DetectionLike | null): HardsubCardState {
  const band = i.band ?? d?.band;
  const spans = d?.spans ?? [];
  const cov = coveragePct(spans, i.durationSec);
  const manual = i.bandSource === "manual";
  return {
    kind: "found",
    where: band ? bandWhere(band, i.videoH) : "trong khung",
    segments: spans.length,
    coverage: cov,
    weak: !manual && !!d && cov < 5,
    manual,
  };
}

function clampPct(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}
