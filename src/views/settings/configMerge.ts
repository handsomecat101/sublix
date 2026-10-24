//! TSK-UI-REDESIGN-R2-5 — LOGIC THUẦN (không React, không Tauri) để gộp cấu hình
//! trước khi lưu. Tách riêng để test bằng `node --test`.
//!
//! Vì sao cần: trước đây Cài đặt giữ `fullConfig` nạp lúc mở app; nếu key được
//! nạp thẳng vào file trong lúc cửa sổ đang mở, bấm "Lưu" sẽ ghi đè key bằng
//! chuỗi rỗng. Hàm này luôn gộp trên **config mới nhất đọc từ đĩa**, chỉ ghi:
//!   1. các field người dùng vừa sửa (`patch`),
//!   2. key người dùng VỪA GÕ (chuỗi rỗng bị bỏ qua),
//!   3. key bị người dùng CHỦ ĐỘNG xoá (`clearKeys` → ghi "").
//! Mọi field khác (kể cả field backend mới thêm) được giữ nguyên.

export type CloudKeyName = "minimax" | "deepseek" | "openrouter";

/** Ánh xạ tên ngắn trên UI → tên field trong config. */
export const KEY_FIELD: Record<CloudKeyName, string> = {
  minimax: "minimax_api_key",
  deepseek: "deepseek_api_key",
  openrouter: "openrouter_api_key",
};

export interface MergeInput {
  /** Toàn bộ config MỚI NHẤT đọc từ đĩa. */
  latest: Record<string, unknown>;
  /** Các field người dùng vừa sửa (vd translation_provider, theme…). */
  patch?: Record<string, unknown> | null;
  /** Giá trị đang có trong form key (rỗng/nghỉ = không đụng tới key đã lưu). */
  keyForm?: Partial<Record<CloudKeyName, string>> | null;
  /** Key người dùng chủ động xoá (bấm "Xoá key"). */
  clearKeys?: readonly CloudKeyName[] | null;
}

/**
 * Trả về object config sẽ ghi xuống đĩa. KHÔNG mutate `latest`, `patch`, `keyForm`.
 */
export function mergeConfig({ latest, patch, keyForm, clearKeys }: MergeInput): Record<string, unknown> {
  const out: Record<string, unknown> = { ...latest };

  if (patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) out[key] = value;
    }
  }

  const clear = new Set<CloudKeyName>(clearKeys ?? []);
  for (const name of Object.keys(KEY_FIELD) as CloudKeyName[]) {
    const field = KEY_FIELD[name];
    if (clear.has(name)) {
      out[field] = "";
      continue;
    }
    const typed = keyForm?.[name];
    if (typeof typed === "string" && typed.trim().length > 0) {
      out[field] = typed.trim();
    }
  }

  return out;
}

/** 5 mức "Mức độ suy luận" (hợp đồng chung với backend). */
export const REASONING_EFFORTS = ["auto", "low", "medium", "high", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** Nhãn tiếng Việt cho Segmented. */
export const REASONING_LABELS: Record<ReasoningEffort, string> = {
  auto: "Tự động",
  low: "Thấp",
  medium: "Vừa",
  high: "Cao",
  max: "Tối đa",
};

/** Nhà cung cấp cloud (chỉ cloud mới có mức suy luận). */
export function isCloudProvider(provider: string): boolean {
  return provider === "minimax" || provider === "deepseek" || provider === "openrouter";
}

/**
 * Model có hỗ trợ "mức độ suy luận" không.
 * Ưu tiên giá trị backend trả (`supports_reasoning`); nếu chưa có API thì dùng
 * danh sách suy luận tối thiểu dưới đây.
 */
export function supportsReasoning(
  provider: string,
  model: string,
  fromApi?: boolean | null,
): boolean {
  if (typeof fromApi === "boolean") return fromApi;
  if (!isCloudProvider(provider)) return false;
  const m = (model || "").toLowerCase();
  if (provider === "minimax") return m.includes("flash");
  if (provider === "deepseek") return m.includes("reason");
  // OpenRouter: phần lớn model "flash"/"reasoning" đều nhận reasoning_effort.
  return m.includes("flash") || m.includes("reason") || m.includes("thinking");
}
