//! TSK-SETTINGS-MODELS — logic thuần cho mục "Nhận giọng nói (STT)":
//! định dạng dung lượng/tốc độ/ETA, tính %, sắp xếp + gợi ý engine.
//! Không React, không Tauri → test bằng `node --test`.

import type { SttEngineStatus } from "../../lib/tauri";

/** byte → "156 MB" / "1,2 GB" (định dạng Việt Nam). */
export function formatBytesVi(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const mb = bytes / 1048576;
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb < 1024) return `${mb.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
  return `${(mb / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} GB`;
}

/** byte/s → "3,4 MB/s" (0/không hợp lệ → "—"). */
export function formatSpeedVi(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "—";
  return `${(bps / 1048576).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB/s`;
}

/** giây → "2:35" (null/không hợp lệ → "—"). */
export function formatEtaVi(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** % đã tải, kẹp trong [0, 100]; tổng = 0 → 0. */
export function progressPct(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

/**
 * Sắp xếp engine: **đang chọn** trước → **đã tải** → chưa tải; trong cùng nhóm
 * theo dung lượng tăng dần rồi theo tên. Không mutate mảng đầu vào.
 */
export function sortSttEngines(list: readonly SttEngineStatus[]): SttEngineStatus[] {
  const rank = (e: SttEngineStatus) => (e.selected ? 0 : e.downloaded ? 1 : 2);
  return [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.size_mb !== b.size_mb) return a.size_mb - b.size_mb;
    return a.name.localeCompare(b.name, "vi");
  });
}

export interface EngineSummary {
  total: number;
  ready: number;
  downloading: number;
  errors: number;
}

/** Đếm nhanh trạng thái để hiện dòng tổng kết. */
export function engineSummary(list: readonly SttEngineStatus[]): EngineSummary {
  return {
    total: list.length,
    ready: list.filter((e) => e.downloaded || e.state === "ready").length,
    downloading: list.filter((e) => e.state === "downloading").length,
    errors: list.filter((e) => e.state === "error").length,
  };
}

/**
 * Gợi ý engine "đáng thử": ưu tiên engine đã tải + có timestamp từ + hỗ trợ
 * ngôn ngữ cần, dung lượng nhỏ nhất. Trả `null` nếu chưa có engine nào sẵn sàng
 * hoặc engine đang chọn đã đúng là gợi ý.
 */
export function recommendSttEngine(
  list: readonly SttEngineStatus[],
  preferLang?: string | null,
): SttEngineStatus | null {
  const ready = list.filter((e) => e.downloaded || e.state === "ready");
  if (ready.length === 0) return null;
  const lang = (preferLang ?? "").toLowerCase();
  const candidates = ready.filter(
    (e) => e.word_timestamps && (!lang || e.languages.some((l) => l.toLowerCase() === lang)),
  );
  const pool = candidates.length > 0 ? candidates : ready;
  const best = [...pool].sort((a, b) => a.size_mb - b.size_mb)[0] ?? null;
  if (best && best.selected) return null;
  return best;
}
