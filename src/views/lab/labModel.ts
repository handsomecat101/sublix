//! TSK-LAB-U1A — Logic thuần cho tab "Xưởng AI" (không React, không I/O).
//!
//! Khớp 100% luật dựng R1-R6 của Rust (`src-tauri/src/lab/recap_script.rs`).
//! Tách riêng để kiểm thử bằng `node --test scripts/lab-tests/`.

export type RuleCode = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";

export interface RuleViolation {
  itemId: number;
  rule: RuleCode;
  messageVi: string;
}

export interface RecapItem {
  id: number;
  sourceIdx: number;
  start: number;
  end: number;
  picture: string;
  narration: string;
  keepOriginal: boolean;
  ttsSecs?: number;
}

export type DurationStatus = "ok" | "warn" | "dang";

export interface DurationCheck {
  totalSec: number;
  targetSec: number;
  diffSec: number;
  diffPct: number;
  status: DurationStatus;
  summaryVi: string;
  narrationSec: number;
  ostSec: number;
  ostRatioPct: number;
}

export interface ProcessingEstimate {
  totalSec: number;
  etaMin: number;
  tempDiskMb: number;
  level: "normal" | "warn" | "danger";
  summaryVi: string;
}

/** Tốc độ đọc tiếng Việt tự nhiên mặc định (âm tiết / giây). */
export const DEFAULT_SYLLABLES_PER_SEC = 4.1;

/** Ngưỡng đoạn thoại gốc liền nhau tối đa (R2). */
export const MAX_CONSECUTIVE_ORIGINAL = 2;

const EPS = 1e-6;

/** Đếm số âm tiết tiếng Việt (tách theo khoảng trắng). */
export function syllableCount(text: string): number {
  if (!text) return 0;
  const tokens = text.trim().split(/\s+/).filter((w) => /[a-zA-Z0-9À-ỹ]/.test(w));
  return tokens.length;
}

/** Ước lượng số giây cần đọc cho câu văn bản tiếng Việt. */
export function estimateSeconds(text: string, sps = DEFAULT_SYLLABLES_PER_SEC): number {
  const count = syllableCount(text);
  if (count === 0) return 0;
  const sec = count / Math.max(0.1, sps);
  return Math.round(sec * 10) / 10;
}

/** Định dạng giây thành chuỗi thời lượng MM:SS hoặc H:MM:SS. */
export function formatDur(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.round(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

/** Quy đổi tỷ lệ thoại gốc (0.0 - 0.6) sang số phút trong video đích. */
export function ratioToMinutes(ratio: number, totalSec: number): {
  keptSec: number;
  keptMinStr: string;
  textRatioStr: string;
} {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const keptSec = Math.round(totalSec * clampedRatio);
  const keptMinStr = formatDur(keptSec);
  const textRatioStr = `${Math.round(clampedRatio * 100)}%`;
  return { keptSec, keptMinStr, textRatioStr };
}

/** Ước tính thời gian xử lý và dung lượng tạm dựa trên tổng thời lượng video đầu vào. */
export function processingEstimate(totalSec: number): ProcessingEstimate {
  const s = Math.max(0, totalSec);
  const hours = s / 3600;
  // Ước tính thời gian phân tích: ~10 phút cho 1 giờ video trên máy RTX
  const etaMin = Math.max(1, Math.round(hours * 10));
  // Ước tính dung lượng đệm trích xuất âm thanh/khung hình tạm: ~400MB / giờ
  const tempDiskMb = Math.round(hours * 400);

  let level: "normal" | "warn" | "danger" = "normal";
  let summaryVi = `Khoảng ${etaMin} phút xử lý · ổ tạm ~${tempDiskMb} MB`;

  if (hours > 8) {
    level = "danger";
    summaryVi = `Rất dài (${hours.toFixed(1)}h) · ước ${etaMin} phút · ổ tạm ~${tempDiskMb} MB — nên cân nhắc chia nhỏ`;
  } else if (hours > 3) {
    level = "warn";
    summaryVi = `Khá dài (${hours.toFixed(1)}h) · ước ${etaMin} phút · ổ tạm ~${tempDiskMb} MB`;
  }

  return { totalSec: s, etaMin, tempDiskMb, level, summaryVi };
}

/**
 * Kiểm tra các luật dựng kịch bản khớp R1-R6 của Rust `recap_script.rs`:
 * - R1: Đoạn đầu tiên phải là lời bình (không mở bằng thoại gốc)
 * - R2: Không quá 2 đoạn giữ thoại gốc liền nhau
 * - R3: Đổi video nguồn nhưng vẫn giữ thoại gốc (thiếu câu nối)
 * - R4: Khoảng thời gian không hợp lệ (start >= 0, end > start)
 * - R5: Chồng lấn thời gian trong cùng một video nguồn
 * - R6: Đoạn lời bình chưa có nội dung (narration rỗng)
 */
export function checkRecapRules(items: RecapItem[], sourceDurations?: number[]): RuleViolation[] {
  const violations: RuleViolation[] = [];
  let runOriginal = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];

    // R4: Kiểm tra tính hợp lệ thời gian cơ bản
    const timeOk =
      Number.isFinite(item.start) &&
      Number.isFinite(item.end) &&
      item.start >= 0 &&
      item.end - item.start > EPS;

    if (!timeOk) {
      violations.push({
        itemId: item.id,
        rule: "R4",
        messageVi: `Khoảng thời gian không hợp lệ (${item.start.toFixed(2)}s → ${item.end.toFixed(2)}s): cần start ≥ 0 và end > start.`,
      });
    } else if (sourceDurations && sourceDurations[item.sourceIdx] !== undefined) {
      const dur = sourceDurations[item.sourceIdx];
      if (item.end > dur + EPS) {
        violations.push({
          itemId: item.id,
          rule: "R4",
          messageVi: `Đoạn vượt quá thời lượng video nguồn #${item.sourceIdx + 1} (${item.end.toFixed(2)}s > ${dur.toFixed(2)}s).`,
        });
      }
    }

    // R6: Lời bình không được rỗng
    if (!item.keepOriginal && (!item.narration || !item.narration.trim())) {
      violations.push({
        itemId: item.id,
        rule: "R6",
        messageVi: "Đoạn lời bình chưa có nội dung (narration rỗng).",
      });
    }

    // R1: Đoạn đầu tiên phải là lời bình
    if (idx === 0 && item.keepOriginal) {
      violations.push({
        itemId: item.id,
        rule: "R1",
        messageVi: "Đoạn đầu tiên phải là lời bình — không mở đầu bằng thoại gốc.",
      });
    }

    // R2: Không quá 2 đoạn thoại gốc liền nhau
    if (item.keepOriginal) {
      runOriginal++;
      if (runOriginal === MAX_CONSECUTIVE_ORIGINAL + 1) {
        violations.push({
          itemId: item.id,
          rule: "R2",
          messageVi: `Quá ${MAX_CONSECUTIVE_ORIGINAL} đoạn giữ thoại gốc liền nhau — cần chèn lời bình.`,
        });
      }
    } else {
      runOriginal = 0;
    }

    // R3: Đổi video nguồn phải có câu nối lời bình
    if (idx > 0) {
      const prev = items[idx - 1];
      if (prev.sourceIdx !== item.sourceIdx && item.keepOriginal) {
        violations.push({
          itemId: item.id,
          rule: "R3",
          messageVi: `Đổi sang video nguồn #${item.sourceIdx + 1} nhưng đoạn này vẫn giữ thoại gốc — cần một câu nối lời bình.`,
        });
      }
    }

    // R5: Kiểm tra chồng lấn với các đoạn trước cùng nguồn
    if (timeOk) {
      for (let prevIdx = 0; prevIdx < idx; prevIdx++) {
        const prev = items[prevIdx];
        if (prev.sourceIdx === item.sourceIdx && prev.end > prev.start) {
          const overlap = !(item.start >= prev.end - EPS || item.end <= prev.start + EPS);
          if (overlap) {
            violations.push({
              itemId: item.id,
              rule: "R5",
              messageVi: `Thời gian bị chồng lấn với đoạn #${prev.id} trong cùng video nguồn #${item.sourceIdx + 1}.`,
            });
            break;
          }
        }
      }
    }
  }

  return violations;
}

/** Đánh giá dung sai thời lượng kịch bản so với đích. */
export function checkDuration(
  items: RecapItem[],
  targetSec: number,
  sps = DEFAULT_SYLLABLES_PER_SEC,
): DurationCheck {
  let narrationSec = 0;
  let ostSec = 0;

  for (const item of items) {
    if (item.keepOriginal) {
      const d = Math.max(0, item.end - item.start);
      ostSec += d;
    } else {
      const d = item.ttsSecs ?? estimateSeconds(item.narration, sps);
      narrationSec += d;
    }
  }

  const totalSec = Math.round((narrationSec + ostSec) * 10) / 10;
  const target = Math.max(1, targetSec);
  const diffSec = Math.round((totalSec - target) * 10) / 10;
  const diffPct = Math.abs(diffSec) / target;

  let status: DurationStatus = "ok";
  let summaryVi = `Trong ±10% đích (${diffSec >= 0 ? `+${diffSec.toFixed(1)}s` : `${diffSec.toFixed(1)}s`})`;

  if (diffPct > 0.25) {
    status = "dang";
    summaryVi = diffSec > 0
      ? `Dài hơn đích ${formatDur(diffSec)} (>25%) — nên rút gọn`
      : `Ngắn hơn đích ${formatDur(Math.abs(diffSec))} (>25%) — nên thêm ý`;
  } else if (diffPct > 0.1) {
    status = "warn";
    summaryVi = diffSec > 0
      ? `Dài hơn đích +${diffSec.toFixed(0)}s (lệch ${(diffPct * 100).toFixed(0)}%)`
      : `Ngắn hơn đích -${Math.abs(diffSec).toFixed(0)}s (lệch ${(diffPct * 100).toFixed(0)}%)`;
  }

  const ostRatioPct = totalSec > 0 ? Math.round((ostSec / totalSec) * 100) : 0;

  return {
    totalSec,
    targetSec: target,
    diffSec,
    diffPct,
    status,
    summaryVi,
    narrationSec: Math.round(narrationSec * 10) / 10,
    ostSec: Math.round(ostSec * 10) / 10,
    ostRatioPct,
  };
}

/** Di chuyển một phần tử từ vị trí fromIdx sang toIdx. */
export function moveItem<T>(items: T[], fromIdx: number, toIdx: number): T[] {
  if (fromIdx < 0 || fromIdx >= items.length || toIdx < 0 || toIdx >= items.length) {
    return items;
  }
  const next = [...items];
  const [removed] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, removed);
  return next;
}

/** Chèn một đoạn thoại gốc sau vị trí afterIdx. */
export function insertOst(items: RecapItem[], afterIdx: number, ostItem: RecapItem): RecapItem[] {
  const next = [...items];
  const insertIndex = Math.max(0, Math.min(items.length, afterIdx + 1));
  next.splice(insertIndex, 0, ostItem);
  return next;
}

/** Chia đôi một đoạn lời bình tại vị trí ký tự splitPoint. */
export function splitBlock(items: RecapItem[], idx: number, splitPoint: number): RecapItem[] {
  if (idx < 0 || idx >= items.length) return items;
  const target = items[idx];
  if (target.keepOriginal) return items;

  const text = target.narration;
  if (splitPoint <= 0 || splitPoint >= text.length) return items;

  const part1 = text.slice(0, splitPoint).trim();
  const part2 = text.slice(splitPoint).trim();
  if (!part1 || !part2) return items;

  const dur1 = target.ttsSecs ? target.ttsSecs * (part1.length / text.length) : undefined;
  const dur2 = target.ttsSecs ? target.ttsSecs * (part2.length / text.length) : undefined;

  const next = [...items];
  next[idx] = { ...target, narration: part1, ttsSecs: dur1 };
  const newId = Math.max(...items.map((i) => i.id), 0) + 1;
  next.splice(idx + 1, 0, {
    ...target,
    id: newId,
    narration: part2,
    ttsSecs: dur2,
  });

  return next;
}

/** Gộp một đoạn lời bình với đoạn kế tiếp nếu cả hai đều là lời bình. */
export function mergeBlock(items: RecapItem[], idx: number): RecapItem[] {
  if (idx < 0 || idx >= items.length - 1) return items;
  const curr = items[idx];
  const next = items[idx + 1];

  if (curr.keepOriginal || next.keepOriginal) return items;

  const mergedText = `${curr.narration.trim()} ${next.narration.trim()}`;
  const mergedTts = (curr.ttsSecs ?? 0) + (next.ttsSecs ?? 0);

  const updated: RecapItem = {
    ...curr,
    narration: mergedText,
    ttsSecs: mergedTts > 0 ? mergedTts : undefined,
  };

  const copy = [...items];
  copy.splice(idx, 2, updated);
  return copy;
}

/** Điều hướng chỉ số đoạn bằng phím mũi tên. */
export function narrationNav(
  currentIndex: number,
  key: "ArrowUp" | "ArrowDown" | "Home" | "End",
  total: number,
): number {
  if (total <= 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return total - 1;
  if (key === "ArrowUp") return Math.max(0, currentIndex - 1);
  if (key === "ArrowDown") return Math.min(total - 1, currentIndex + 1);
  return currentIndex;
}
