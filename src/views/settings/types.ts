//! TSK-UI-REDESIGN-R2-5: kiểu dữ liệu dùng chung cho các mục trong Cài đặt.
//! `SettingsView` giữ toàn bộ state/handler; các section nhận `ctx` để tránh
//! truyền 30+ props rời rạc.

import type { AppConfig, ModelStatusItem, OllamaModelInfo, TtsEnginesStatus } from "../../lib/tauri";

export type TransProvider = "local" | "ollama" | "minimax" | "deepseek" | "openrouter";
export type HardwarePreset = "cpu" | "gpu_mid" | "gpu_high" | "amd_igpu";

export type CloudKeyId = "minimax" | "deepseek" | "openrouter";

/** Hợp đồng chung với backend `translate_options_get` (mcode #2 làm). */
export interface TranslateOptionModel {
  provider: string;
  id: string;
  label: string;
  local: boolean;
}

export interface TranslateOptions {
  provider: string;
  model: string;
  reasoning_effort: string;
  supports_reasoning: boolean;
  models: TranslateOptionModel[];
}

/** Gợi ý key đã lưu: chỉ 4 ký tự cuối, KHÔNG bao giờ trả key đầy đủ. */
export type KeyHint = string | null;

export interface SettingsCtx {
  /* ---------- Dịch thuật ---------- */
  provider: TransProvider;
  setProvider: (p: TransProvider) => void;
  providerTesting: boolean;
  providerTestResult: string | null;
  testProvider: () => void;
  saveProvider: () => void;

  minimaxModel: string;
  setMinimaxModel: (v: string) => void;
  deepseekModel: string;
  setDeepseekModel: (v: string) => void;
  openrouterModel: string;
  setOpenrouterModel: (v: string) => void;
  /** Chọn model từ nút nhanh — tự lưu qua `translate_options_set`. */
  chooseModel: (provider: TransProvider, model: string) => void;

  /** Mức độ suy luận (chỉ cloud + model hỗ trợ mới hiện). */
  reasoningEffort: string;
  setReasoningEffort: (v: string) => void;
  reasoningSupported: boolean;

  /** Chuỗi người dùng ĐANG gõ (rỗng = không đụng tới key đã lưu). */
  keyInput: Record<CloudKeyId, string>;
  setKeyInput: (which: CloudKeyId, value: string) => void;
  keyHint: Record<CloudKeyId, KeyHint>;
  clearKey: (which: CloudKeyId) => void;

  ollamaUrl: string;
  setOllamaUrl: (v: string) => void;
  ollamaModel: string;
  setOllamaModel: (v: string) => void;
  ollamaModelList: OllamaModelInfo[];
  reloadOllama: () => void;

  translationModel: string;
  setTranslationModel: (v: string) => void;
  transModels: ModelStatusItem[];
  transEnginePref: "auto" | "cpu" | "cuda";
  changeTransEngine: (v: "auto" | "cpu" | "cuda") => void;
  llmEngine: string | null;
  serverStarting: boolean;
  preloadTranslation: () => void;
  downloadTransModel: (name: string) => void;
  downloadingModel: string | null;

  /* ---------- Giọng đọc TTS ---------- */
  ttsStatus: TtsEnginesStatus | null;
  ttsLoading: boolean;
  ttsNotice: string | null;
  reloadTts: () => void;
  installTtsDeps: (engine: "vieneu" | "zerotts") => void;
  diagnoseTts: (engine: "vieneu" | "zerotts") => void;
  ttsCloudKey: Record<"google" | "fptai", string>;
  setTtsCloudKey: (provider: "google" | "fptai", value: string) => void;
  saveTtsCloudKey: (provider: "google" | "fptai") => void;
  testTtsCloud: (provider: "google" | "fptai") => void;
  ttsCloudKeyHint: Record<"google" | "fptai", KeyHint>;

  /* ---------- Cấu hình theo máy ---------- */
  currentPreset: HardwarePreset | null;
  applyPreset: (p: HardwarePreset) => void;
  presets: ReadonlyArray<{ id: HardwarePreset; icon: string; title: string; sub: string; spec: string }>;

  /* ---------- Chủ đề ---------- */
  theme: string;
  setTheme: (t: string) => void;
  themes: ReadonlyArray<{ id: string; label: string; hint: string }>;

  /* ---------- Trạng thái hệ thống ---------- */
  appInfo: { version: string; name: string; description: string } | null;
  isLive: boolean;
  sttServerEngine: string | null;
  model: string;
  config: AppConfig | null;
  openModelsFolder: () => void;
}
