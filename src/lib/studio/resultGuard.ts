//! TSK-TABS-3.5 — chặn "kết quả video A ghi đè video B".
//!
//! Mỗi lệnh nền trong Studio (STT, dịch, phân tích, xuất…) phải chụp đường dẫn
//! video **trước** `await`; sau `await` so với đường dẫn video **hiện tại**. Lệch ⇒
//! kết quả thuộc về video cũ ⇒ **bỏ** (không ghi vào state/project) + toast.
//!
//! Module thuần (không React/Tauri) ⇒ test được bằng `node --test`.

/** Chuẩn hoá đường dẫn để so sánh (bỏ khoảng trắng, `/` → `\`, không phân biệt hoa/thường trên Windows). */
export function normalizeProjectPath(path: string | null | undefined): string {
  if (!path) return "";
  return path.trim().replace(/\//g, "\\").toLowerCase();
}

/**
 * Video trước và sau có cùng là một dự án không?
 *
 * - Cả hai rỗng ⇒ "cùng" (không có dự án nào để bảo vệ).
 * - Một bên rỗng ⇒ **khác** (dự án vừa được đóng/mở).
 */
export function isSameProject(
  before: string | null | undefined,
  after: string | null | undefined,
): boolean {
  const a = normalizeProjectPath(before);
  const b = normalizeProjectPath(after);
  if (!a || !b) return a === b;
  return a === b;
}

/** Tên file hiển thị từ đường dẫn (dùng cho toast). */
export function projectDisplayName(path: string | null | undefined): string {
  if (!path) return "video";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Thông điệp toast khi bỏ kết quả của video cũ. */
export function staleProjectMessage(fileName: string): string {
  return `Đã bỏ kết quả của video cũ: ${fileName}`;
}

/** Kết quả 1 lần kiểm tra guard. */
export interface GuardResult {
  /** true = kết quả dùng được; false = kết quả thuộc video cũ (phải bỏ). */
  ok: boolean;
  /** true = kết quả bị "cũ" (đã đổi video). */
  stale: boolean;
}

/**
 * Kiểm tra kết quả lệnh nền có còn thuộc về video đang mở không.
 *
 * @param before Đường dẫn video chụp TRƯỚC khi `await`.
 * @param after Đường dẫn video hiện tại (sau khi `await`).
 */
export function guardProjectResult(
  before: string | null | undefined,
  after: string | null | undefined,
): GuardResult {
  const same = isSameProject(before, after);
  return { ok: same, stale: !same };
}

/**
 * Nhắn cho người dùng khi bỏ kết quả (dùng kèm `guardProjectResult`).
 *
 * @param before Đường dẫn video lúc bắt đầu lệnh.
 * @param after Đường dẫn video hiện tại.
 */
export function staleProjectNotice(
  before: string | null | undefined,
  after: string | null | undefined,
): string | null {
  const result = guardProjectResult(before, after);
  if (result.ok) return null;
  return staleProjectMessage(projectDisplayName(before));
}
