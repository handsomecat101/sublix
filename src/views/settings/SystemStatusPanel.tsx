//! TSK-UI-REDESIGN-R2-5 / R2-7: cột "Trạng thái hệ thống" — đọc từ CẤU HÌNH THẬT
//! (thay thẻ "Động cơ & Phần cứng AI" ghi cứng "GPU CUDA" ở tab Tiến trình).

import type { SettingsCtx } from "./types";

function kv(label: string, value: string, tone?: "ok" | "warn") {
  return (
    <div className="st-kv" key={label}>
      <span>{label}</span>
      <b className={tone ? `t-${tone}` : ""}>{value}</b>
    </div>
  );
}

export function SystemStatusPanel({ ctx }: { ctx: SettingsCtx }) {
  const providerLabel: Record<string, string> = {
    ollama: `Ollama · ${ctx.ollamaModel || "—"}`,
    local: `GGUF · ${ctx.translationModel || "—"}`,
    minimax: `MiniMax · ${ctx.minimaxModel || "—"}`,
    deepseek: `DeepSeek · ${ctx.deepseekModel || "—"}`,
    openrouter: `OpenRouter · ${ctx.openrouterModel || "—"}`,
  };

  return (
    <aside className="st-status">
      <div className="st-status-title">Trạng thái hệ thống</div>
      {kv("Nhận dạng", `Whisper ${ctx.model || "—"} · ${(ctx.config?.stt_engine_preference || "auto").toUpperCase()}`)}
      {kv("Dịch", providerLabel[ctx.provider] ?? ctx.provider)}
      {kv("Live", ctx.isLive ? "Đang chạy" : "Tắt", ctx.isLive ? "ok" : undefined)}
      {kv("Giọng đọc", ctx.ttsStatus?.engines.filter((e) => e.ready).map((e) => e.id).join(" · ") || "—")}
      {kv("Chủ đề", ctx.theme || "cinema")}
      {kv("Phiên bản", ctx.appInfo?.version ?? "—")}
      <button type="button" className="settings-btn-secondary st-btn-sm" onClick={ctx.openModelsFolder}>
        📦 Mở thư mục mô hình
      </button>
      <div className="st-status-note">
        Thông tin đọc từ cấu hình thật (không ghi cứng). Đổi cấu hình ở cột giữa sẽ cập nhật ngay.
      </div>
    </aside>
  );
}
