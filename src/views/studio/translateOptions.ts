/**
 * translateOptions — kiểu dữ liệu + wrapper gọi 2 lệnh Tauri của backend.
 *
 * ⚠️ VÌ SAO KHÔNG DÙNG `sublix.translateOptionsGet()` trong `src/lib/tauri.ts`?
 *    File `tauri.ts` đang được worker khác (mcode #2) sửa song song → theo quy
 *    tắc sở hữu file, ta KHÔNG sửa `tauri.ts`/`types.ts`. Vì vậy module này
 *    khai báo kiểu CỤC BỘ và gọi `invoke()` trực tiếp.
 *    Khi wrapper chính thức có trong `tauri.ts`, chỉ cần đổi 2 dòng gọi ở đây.
 *
 * HỢP ĐỒNG BACKEND (đã chốt — xem `contract_reasoning.txt`):
 * - `translate_options_get` -> {
 *     provider: string, model: string, reasoning_effort: ReasoningEffort,
 *     supports_reasoning: boolean,
 *     models: Array<{ provider: string, id: string, label: string, local: boolean }>
 *   }
 * - `translate_options_set(provider?, model?, reasoning_effort?)` -> ghi TỪNG field
 *   được truyền (KHÔNG đụng tới API key), lưu atomic, emit `config:updated`.
 */
import { invoke } from "@tauri-apps/api/core";

/** Mức suy luận của model dịch. */
export type ReasoningEffort = "auto" | "low" | "medium" | "high" | "max";

/** Một model có thể chọn (do backend liệt kê). */
export interface TranslateModelOption {
  /** Nhà cung cấp (ollama / gguf / minimax / deepseek / openrouter…). */
  provider: string;
  /** Id model (đưa vào `translate_options_set`). */
  id: string;
  /** Nhãn hiển thị. */
  label: string;
  /** true = chạy trên máy (không cần mạng). */
  local: boolean;
}

/** Trạng thái tuỳ chọn dịch hiện tại. */
export interface TranslateOptions {
  provider: string;
  model: string;
  reasoning_effort: ReasoningEffort;
  /** Model hiện tại có hỗ trợ suy luận không (để bật/tắt segmented "Suy luận"). */
  supports_reasoning: boolean;
  /** Danh sách model người dùng có thể chọn. */
  models: TranslateModelOption[];
}

/** Các mức suy luận (segmented). */
export const REASONING_EFFORTS: ReadonlyArray<{
  value: ReasoningEffort;
  label: string;
  hint: string;
}> = [
  { value: "auto", label: "Tự động", hint: "Tự động theo mức tối ưu của từng model." },
  { value: "low", label: "Thấp", hint: "Ít suy luận → nhanh hơn, ít tốn hơn." },
  { value: "medium", label: "Vừa", hint: "Cân bằng giữa chất lượng và tốc độ." },
  { value: "high", label: "Cao", hint: "Dịch kỹ hơn, chậm hơn và tốn token hơn." },
  { value: "max", label: "Tối đa", hint: "Suy luận sâu nhất — chậm và tốn nhiều nhất." },
];

/**
 * Đọc trạng thái tuỳ chọn dịch từ backend.
 * Ném lỗi nếu lệnh chưa tồn tại (backend cũ) — caller bắt để hiện trạng thái dự phòng.
 */
export async function fetchTranslateOptions(): Promise<TranslateOptions> {
  return await invoke<TranslateOptions>("translate_options_get");
}

/**
 * Ghi tuỳ chọn dịch (chỉ field được truyền — không đụng API key).
 *
 * Tauri v2 đổi tên tham số Rust `snake_case` sang `camelCase` khi gọi từ JS.
 * Để chắc chắn, hàm thử `camelCase` trước, nếu backend từ chối thì thử
 * `snake_case` — cả hai đều chỉ ghi field được truyền.
 */
export async function saveTranslateOptions(patch: {
  provider?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
}): Promise<void> {
  const camel: Record<string, unknown> = { ...patch };
  try {
    await invoke<void>("translate_options_set", camel);
    return;
  } catch (err) {
    const message = String(err);
    const isArgError = /invalid|argument|expected/i.test(message);
    if (!isArgError) throw err;
  }
  const snake: Record<string, unknown> = {};
  if (patch.provider !== undefined) snake.provider = patch.provider;
  if (patch.model !== undefined) snake.model = patch.model;
  if (patch.reasoningEffort !== undefined) snake.reasoning_effort = patch.reasoningEffort;
  await invoke<void>("translate_options_set", snake);
}

/**
 * Nhãn nhà cung cấp (tiếng Việt) cho provider id.
 *
 * @param provider Id provider từ backend.
 */
export function providerLabelVi(provider: string): string {
  switch (provider) {
    case "ollama":
      return "Ollama (local)";
    case "gguf":
      return "GGUF (local)";
    case "minimax":
      return "minimax";
    case "deepseek":
      return "DeepSeek";
    case "openrouter":
      return "OpenRouter";
    default:
      return provider;
  }
}
