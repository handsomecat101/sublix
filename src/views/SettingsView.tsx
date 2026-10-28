//! Settings window — main control panel for Sublix v0.5.0.
//!
//! Features:
//! - Audio device picker + 1-second multi-device volume scanner
//! - Continuous Live Capture with Smart VAD (Voice Activity Endpointing)
//! - 2026 Whisper STT models (Large-v3-Turbo Q8 / FP16) + 1-click model downloader + hot-swap GPU/CPU server
//! - 2026 Local LLM Translation models (Qwen3-4B-Instruct-2507, Gemma-3-4B-IT, Qwen3-8B, Qwen2.5) + hot-swap GPU/CPU server
//! - Overlay appearance controls (font size, bilingual original line, click-through mode)

import { useCallback, useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  sublix,
  type AppConfig,
  type AudioDevice,
  type ModelStatusItem,
  type ModelDownloadProgress,
  type OllamaModelInfo,
  type FileSubProgress,
  type FileSubResult,
  type DubbingProgress,
  type DownloadProgressPayload,
} from "../lib/tauri";
import { version as APP_VERSION_PKG } from "../../package.json";
import FileSubView from "./FileSubView";
import DubbingStudioView from "./DubbingStudioView";
// [TSK-TABS-P1] Host tab Studio (mount-all) — thay cho 1 instance `<SublixStudioView>`.
import StudioTabsHost from "./studio/StudioTabsHost";
import { resolveProgressTaskKey } from "../lib/studio/runRouting";
import DownloaderView from "./DownloaderView";
import { StudioShell } from "./StudioShell";
// TSK-UI-REDESIGN-R2-7B: tab Live + Lịch sử tách riêng (UI_REDESIGN_PLAN §4.5/§4.6).
import LiveView from "./live/LiveView";
import HistoryView from "./history/HistoryView";
import type { LiveSubPreview } from "./live/liveTypes";
import { fromDisplayValue } from "./live/liveLogic";
import { ChangelogModal } from "./ChangelogModal";
// TSK-UI-REDESIGN-R2-7C: modal ProcessCenter đã bỏ (TL-14 — chỉ còn 1 giao diện
// "Tiến trình" là tab). Kiểu dữ liệu tác vụ nằm ở `processTypes.ts`.
import type { AppTaskItem } from "./processTypes";
// [TSK-FIX-BUG-R2-8-01] Logic thuần: id lần chạy duy nhất + khử trùng lịch sử.
import { dedupeHistoryIds, makeTaskRunId, upsertHistoryItem } from "./processLogic";
import { ProcessCenterView } from "./ProcessCenterView";
import {
  IconClapper, IconMic, IconClock,
  IconEye, IconEyeOff,
  IconGlobe, IconSettings, IconSparkles,
} from "../icons";
import LabView from "./lab/LabView";
import DiscoveryToast from "./discovery/DiscoveryToast";
import spotModelsUrl from "../assets/spot-models.jpg";
import MasterTopbar from "./MasterTopbar";
// TSK-UI-REDESIGN-R2-5: các mục Cài đặt tách riêng (mỗi file < 300 dòng).
import { TranslationSection } from "./settings/TranslationSection";
import { TtsSection } from "./settings/TtsSection";
import { ThemeSection } from "./settings/ThemeSection";
import { SettingsNav, type SettingsSubtab } from "./settings/SettingsNav";
import { SttSection } from "./settings/SttSection";
import { SystemStatusPanel } from "./settings/SystemStatusPanel";
import type { SettingsCtx, TransProvider, TranslateOptions } from "./settings/types";
import { mergeConfig, supportsReasoning, REASONING_EFFORTS } from "./settings/configMerge";
import "./SettingsView.css";

/**
 * Hợp đồng backend `translate_options_get/set` (mcode #2 đang làm). Wrapper có
 * thể chưa tồn tại trên `sublix` — truy cập có kiểm tra, fallback về saveConfig.
 * TODO(R2-5): khi `src/lib/tauri.ts` có wrapper chính thức thì thay cast này.
 */
const translateApi = sublix as unknown as {
  translateOptionsGet?: () => Promise<TranslateOptions>;
  translateOptionsSet?: (args: {
    provider?: string;
    model?: string;
    reasoning_effort?: string;
  }) => Promise<TranslateOptions>;
};

/** TSK-UI-REDESIGN-R2-5: chỉ giữ 4 ký tự cuối của key để hiện gợi ý. */
function tail4(key?: string | null): string | null {
  const k = (key ?? "").trim();
  if (!k) return null;
  return k.length >= 4 ? k.slice(-4) : "•••";
}

type Status =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

/**
 * Cấu hình phần cứng 1-click.
 * - `cpu`      : thuần CPU (không có card rời NVIDIA)
 * - `gpu_mid`  : NVIDIA GPU 4-8GB VRAM
 * - `gpu_high` : NVIDIA GPU 12-24GB VRAM
 * - `amd_igpu` : GPU tích hợp AMD (Radeon / Ryzen AI) — dịch qua Ollama (ROCm),
 *                vì whisper.cpp/llama.cpp trên Windows chưa có bản ROCm/Vulkan
 *                đáng tin cậy và STT chạy CPU.
 */
type HardwarePreset = "cpu" | "gpu_mid" | "gpu_high" | "amd_igpu";

export default function SettingsView() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("default");

  // STT & LLM model selections
  const [model, setModel] = useState<string>("large-v3-turbo-q8_0");
  const [translationModel, setTranslationModel] = useState<string>("qwen3-4b");
  const [sttModels, setSttModels] = useState<ModelStatusItem[]>([]);
  const [transModels, setTransModels] = useState<ModelStatusItem[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, {
    percent: number;
    downloaded_bytes?: number;
    total_bytes?: number;
    phase?: string;
    error?: string;
  }>>({});

  // Live capture & translation settings
  const [language, setLanguage] = useState<string>("ja");
  const [outputMode, setOutputMode] = useState<"original" | "translated">("translated");
  const [targetLang, setTargetLang] = useState<string>("vi");
  const [chunkSeconds, setChunkSeconds] = useState<number>(3);
  const [vadEnabled, setVadEnabled] = useState<boolean>(true);

  // Overlay style settings
  const [fontSize, setFontSize] = useState<number>(22);
  const [showOriginal, setShowOriginal] = useState<boolean>(true);
  const [clickThrough, setClickThrough] = useState<boolean>(false);

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [lastTranslatedTest, setLastTranslatedTest] = useState<string | null>(null);
  const [recentSubs, setRecentSubs] = useState<LiveSubPreview[]>([]);

  // TSK-UI-REDESIGN-R2-7B: `audioTest` / `deviceLevels` / `scanning` đã chuyển
  // vào `LiveView` (state cục bộ của tab Live — không cần ở cấp SettingsView).
  const [appInfo, setAppInfo] = useState<{ version: string; name: string; description: string } | null>(null);
  const [isLive, setIsLive] = useState<boolean>(false);

  // Engine status & preferences
  const [engine, setEngine] = useState<string | null>(null);
  const [sttEngine, setSttEngine] = useState<string | null>(null);
  const [serverStarting, setServerStarting] = useState<boolean>(false);
  const [sttServerEngine, setSttServerEngine] = useState<string | null>(null);
  const [sttServerStarting, setSttServerStarting] = useState<boolean>(false);

  const [sttEnginePref, setSttEnginePref] = useState<"auto" | "cpu" | "cuda">("auto");
  const [transEnginePref, setTransEnginePref] = useState<"auto" | "cpu" | "cuda">("auto");
  const [configLoaded, setConfigLoaded] = useState<boolean>(false);
  const [fullConfig, setFullConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState<"studio" | "downloader" | "lab" | "process" | "file_sub" | "dubbing" | "live" | "models" | "history" | "overlay">("studio");
  const [pendingFileSubPath, setPendingFileSubPath] = useState<string>("");
  const [pendingDubbingPath, setPendingDubbingPath] = useState<string>("");
  const [pendingStudioPath, setPendingStudioPath] = useState<string>("");
  // [TSK-TABS-P1] Yêu cầu mở video cho host (tab mới / nhảy tab cùng path).
  const [studioOpenRequest, setStudioOpenRequest] = useState<{ path: string; nonce: number; tabId?: string } | null>(null);
  const studioOpenNonceRef = useRef(0);

  /**
   * [TSK-TABS-P2] "Mở lại trong Studio" từ tab Tiến trình / toast nổi: nhảy đúng tab
   * đã chạy tác vụ; tab đã đóng ⇒ host mở lại từ `sourcePath` (video gốc).
   */
  const handleOpenStudioTask = (target: { tabId?: string; sourcePath?: string; outputPath?: string }) => {
    studioOpenNonceRef.current += 1;
    setStudioOpenRequest({
      path: (target.sourcePath ?? "").replace(/\//g, "\\").trim(),
      tabId: target.tabId,
      nonce: studioOpenNonceRef.current,
    });
    setActiveTab("studio");
  };

  // [TSK-V015-UI-FIX] Toast cấp app thông báo video từ Khám phá đã mở tab trong Studio
  const [discoveryStudioToasts, setDiscoveryStudioToasts] = useState<Array<{ title: string; path: string }>>([]);

  const handleNotifyDiscoveryStudioOpened = useCallback((info: { title: string; path: string }) => {
    setDiscoveryStudioToasts((prev) => {
      if (prev.some((p) => p.path === info.path)) return prev;
      return [...prev, info];
    });
  }, []);

  const handleOpenToastStudio = useCallback((path: string) => {
    handleRouteToStudio(path, { activate: true });
    setDiscoveryStudioToasts([]);
  }, []);

  const handleCloseToastStudio = useCallback(() => {
    setDiscoveryStudioToasts([]);
  }, []);

  const handleRouteToStudio = (path: string, options?: { activate?: boolean; title?: string }) => {
    const safe = path ? path.replace(/\//g, "\\").trim() : "";
    setPendingDubbingPath(safe);
    setPendingStudioPath(safe);
    setPendingFileSubPath(safe);
    // [TSK-TABS-P1] Mọi nguồn mở video (Tải video, Lịch sử, tab Tiến trình) đi qua
    // host ⇒ tab mới / nhảy tab đã có cùng path (không ghi đè dự án đang mở).
    studioOpenNonceRef.current += 1;
    setStudioOpenRequest({ path: safe, nonce: studioOpenNonceRef.current });
    if (options?.activate !== false) {
      setActiveTab("studio");
    }
  };

  const handleRouteToFileSub = (path: string) => {
    handleRouteToStudio(path);
  };

  const handleRouteToDubbing = (path: string) => {
    handleRouteToStudio(path);
  };
  const [historySearch, setHistorySearch] = useState<string>("");
  const [settingsSubtab, setSettingsSubtab] = useState<SettingsSubtab>("presets");

  useEffect(() => {
    if (activeTab === "overlay") {
      setSettingsSubtab("overlay");
    }
  }, [activeTab]);
  const [selectedHistorySub, setSelectedHistorySub] = useState<LiveSubPreview | null>(null);
  const [overlayVisible, setOverlayVisible] = useState<boolean>(true);
  const [theme, setTheme] = useState<string>("cinema");
  const [bgOpacity, setBgOpacity] = useState<number>(85);
  const [textColor, setTextColor] = useState<string>("white");
  const [showChangelog, setShowChangelog] = useState<boolean>(false);

  // Translation provider settings (MiniMax Cloud / Ollama Local / Embedded GGUF)
  const [transProvider, setTransProvider] = useState<TransProvider>("local");
  // TSK-UI-REDESIGN-R2-5: ô nhập key LUÔN bắt đầu rỗng — key đã lưu chỉ hiện 4
  // ký tự cuối qua `keyHint`; ô rỗng KHÔNG bao giờ ghi đè key đã lưu.
  const [minimaxKey, setMinimaxKey] = useState<string>("");
  const [deepseekKey, setDeepseekKey] = useState<string>("");
  const [openrouterKey, setOpenrouterKey] = useState<string>("");
  const [keyHint, setKeyHint] = useState<{ minimax: string | null; deepseek: string | null; openrouter: string | null }>({
    minimax: null,
    deepseek: null,
    openrouter: null,
  });
  const [minimaxModel, setMinimaxModel] = useState<string>("MiniMax-M3");
  const [deepseekModel, setDeepseekModel] = useState<string>("deepseek-chat");
  const [openrouterModel, setOpenrouterModel] = useState<string>("deepseek/deepseek-v4.1-flash");
  // R2-5: "Mức độ suy luận" (hợp đồng llm_reasoning_effort) + dữ liệu từ
  // `translate_options_get` (nếu backend đã có; chưa có thì dùng heuristic).
  const [reasoningEffort, setReasoningEffortState] = useState<string>("auto");
  const [translateOptions, setTranslateOptions] = useState<TranslateOptions | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState<string>("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState<string>("smtek/qwen3.8-27b:q4_k_m");

  const [ollamaModelList, setOllamaModelList] = useState<OllamaModelInfo[]>([]);
  const [providerTesting, setProviderTesting] = useState<boolean>(false);
  const [providerTestResult, setProviderTestResult] = useState<string | null>(null);

  // ---- TSK-UI-REDESIGN-R2-5: engine giọng đọc (trạng thái THẬT từ backend) ----
  const [ttsStatus, setTtsStatus] = useState<import("../lib/tauri").TtsEnginesStatus | null>(null);
  const [ttsLoading, setTtsLoading] = useState<boolean>(false);
  const [ttsNotice, setTtsNotice] = useState<string | null>(null);
  const [ttsCloudKey, setTtsCloudKeyState] = useState<{ google: string; fptai: string }>({ google: "", fptai: "" });
  const [ttsCloudKeyHint, setTtsCloudKeyHint] = useState<{ google: string | null; fptai: string | null }>({
    google: null,
    fptai: null,
  });
  const [ttsBusyEngine, setTtsBusyEngine] = useState<"vieneu" | "zerotts" | null>(null);
  const [ttsDepsLine, setTtsDepsLine] = useState<string | null>(null);

  // TSK-SETTINGS-MODELS: backend chỉ phát `tts:deps_progress` (log pip), KHÔNG có %
  // ⇒ hiện log + trạng thái "Đang cài…", không bịa phần trăm.
  useEffect(() => {
    const p = listen<{ engine: string; line: string }>("tts:deps_progress", (e) => {
      setTtsDepsLine(e.payload?.line ?? null);
    });
    return () => {
      p.then((u) => u()).catch(() => undefined);
    };
  }, []);

  // R2-5: model hiệu lực + model có hỗ trợ "mức độ suy luận" hay không.
  const effectiveTranslationModel =
    transProvider === "minimax"
      ? minimaxModel
      : transProvider === "deepseek"
      ? deepseekModel
      : transProvider === "openrouter"
      ? openrouterModel
      : transProvider === "ollama"
      ? ollamaModel
      : translationModel;
  const apiSupportsReasoning =
    translateOptions && translateOptions.provider === transProvider ? translateOptions.supports_reasoning : null;
  const reasoningSupported = supportsReasoning(transProvider, effectiveTranslationModel, apiSupportsReasoning);

  // Global Process & Activity Tracker (tracks background GPU/AI jobs)
  const [globalTasks, setGlobalTasks] = useState<Record<string, AppTaskItem>>({});
  const [processHistory, setProcessHistory] = useState<AppTaskItem[]>(() => {
    try {
      const saved = localStorage.getItem("sublix_process_history_v1");
      if (!saved) return [];
      const parsed: AppTaskItem[] = JSON.parse(saved);
      // Polish & sanitize lịch sử cũ (loại bỏ "0/2 câu thoại" hoặc hardcode)
      const cleaned = parsed.map((item) => {
        let cleanDetail = item.detail;
        if (cleanDetail && (cleanDetail.includes("0/2 câu thoại") || cleanDetail.includes("0/0 câu thoại"))) {
          cleanDetail = "Đã hoàn tất phân tích & xử lý";
        }
        let cleanStage = item.stage;
        if (cleanStage === "Hoàn tất lồng tiếng" && item.workflowType !== "dubbing" && item.workflowType !== "voice_only") {
          cleanStage = "Hoàn tất xử lý";
        }
        return {
          ...item,
          detail: cleanDetail,
          stage: cleanStage,
        };
      });
      // [TSK-FIX-BUG-R2-8-01] Lịch sử cũ có nhiều mục CÙNG id (id từng là hằng
      // "dubbing_active") ⇒ khử trùng lúc ĐỌC: giữ mục mới nhất, gắn hậu tố cho
      // bản cũ ⇒ không mất mục nào và React key không trùng.
      return dedupeHistoryIds(cleaned);
    } catch {
      return [];
    }
  });

  const saveToProcessHistory = (item: AppTaskItem) => {
    setProcessHistory((prev) => {
      // [TSK-FIX-BUG-R2-8-01] Mục CÙNG id bị THAY (gộp field, mục mới thắng) thay vì
      // thêm mục mới ⇒ 1 lượt chạy = 1 mục lịch sử ⇒ React key luôn duy nhất.
      const next = upsertHistoryItem(prev, item, 50);
      try {
        localStorage.setItem("sublix_process_history_v1", JSON.stringify(next));
      } catch (err) {
        console.warn("Failed to persist process history:", err);
      }
      return next;
    });
  };

  const handleClearProcessHistory = () => {
    setProcessHistory([]);
    try {
      localStorage.removeItem("sublix_process_history_v1");
    } catch {}
  };

  // [TSK-FIX-BUG-R2-8-01] Id của lượt chạy hiện tại. Studio gửi id DUY NHẤT theo lần
  // chạy; sự kiện `dubbing:progress` của backend dùng CHUNG id này ⇒ 1 lượt chạy
  // chỉ ghi 1 mục lịch sử (trước đây id hằng "dubbing_active" ⇒ trùng React key).
  const currentRunIdRef = useRef<string | null>(null);
  // [TSK-FIX-BUG-R2-8-01] Id lần chạy của luồng "tạo phụ đề" (file_sub:progress).
  const fileSubRunIdRef = useRef<string | null>(null);

  // [TSK-TABS-P2] `run_id` của job Studio → id tác vụ trong tab Tiến trình. Nhiều tab
  // chạy xen kẽ ⇒ sự kiện `dubbing:progress` khoá theo `run_id` thay vì "lượt hiện tại".
  const runTaskMapRef = useRef<Map<string, string>>(new Map());

  const handleStudioTaskUpdate = (task: any) => {
    const taskId: string =
      (typeof task?.id === "string" && task.id.trim()) ||
      currentRunIdRef.current ||
      makeTaskRunId("dubbing", Date.now());
    currentRunIdRef.current = taskId;
    if (typeof task?.runId === "string" && task.runId) {
      runTaskMapRef.current.set(task.runId, taskId);
    }
    if (task.status === "completed" || task.status === "error" || task.status === "idle") {
      // Gọn bảng ánh xạ: bỏ mọi run_id trỏ về tác vụ đã kết thúc.
      for (const [rid, tid] of runTaskMapRef.current) {
        if (tid === taskId) runTaskMapRef.current.delete(rid);
      }
    }
    if (task.status === "idle") {
      setGlobalTasks((prev) => {
        if (!prev[taskId]) return prev;
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      return;
    }

    if (task.status === "completed") {
      setGlobalTasks((prev) => {
        const existing = prev[taskId];
        const completedTask: AppTaskItem = {
          id: taskId,
          type: task.type || existing?.type || "dubbing",
          title: task.title || existing?.title || "Dự án Studio AI",
          fileName: task.fileName || existing?.fileName,
          workflowType: task.workflowType || existing?.workflowType,
          workflowLabel: task.workflowLabel || existing?.workflowLabel,
          stage: task.stage || "Hoàn tất xử lý",
          percent: 100,
          status: "completed",
          detail: task.detail || existing?.detail || "Hoàn tất thành công",
          steps: task.steps || existing?.steps,
          startedAt: existing?.startedAt || Date.now() - 5000,
          completedAt: Date.now(),
          targetTab: "studio",
          outputPath: task.outputPath || existing?.outputPath,
          tabId: task.tabId || existing?.tabId,
          sourcePath: task.sourcePath || existing?.sourcePath,
        };
        saveToProcessHistory(completedTask);
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      // Lượt chạy đã xong ⇒ lượt sau sẽ có id mới.
      currentRunIdRef.current = null;
      return;
    }

    if (task.status === "error") {
      setGlobalTasks((prev) => {
        const existing = prev[taskId];
        const errorTask: AppTaskItem = {
          id: taskId,
          type: task.type || existing?.type || "dubbing",
          title: task.title || existing?.title || "Dự án Studio AI",
          fileName: task.fileName || existing?.fileName,
          workflowType: task.workflowType || existing?.workflowType,
          workflowLabel: task.workflowLabel || existing?.workflowLabel,
          stage: task.stage || "Lỗi xử lý",
          percent: task.percent ?? existing?.percent ?? 0,
          status: "error",
          error: task.error || "Gặp lỗi trong quá trình xử lý",
          detail: task.detail || existing?.detail,
          steps: task.steps || existing?.steps,
          startedAt: existing?.startedAt || Date.now() - 5000,
          completedAt: Date.now(),
          targetTab: "studio",
          tabId: task.tabId || existing?.tabId,
          sourcePath: task.sourcePath || existing?.sourcePath,
        };
        saveToProcessHistory(errorTask);
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      // Lượt chạy lỗi ⇒ lượt sau sẽ có id mới.
      currentRunIdRef.current = null;
      return;
    }

    // status: "running"
    setGlobalTasks((prev) => {
      const existing = prev[taskId];
      return {
        ...prev,
        [taskId]: {
          id: taskId,
          type: task.type || existing?.type || "dubbing",
          title: task.title || existing?.title || "Dự án Studio AI",
          fileName: task.fileName || existing?.fileName,
          workflowType: task.workflowType || existing?.workflowType,
          workflowLabel: task.workflowLabel || existing?.workflowLabel,
          stage: task.stage || existing?.stage || "Đang xử lý...",
          percent: typeof task.percent === "number" ? task.percent : (existing?.percent ?? 0),
          status: "running",
          detail: task.detail !== undefined ? task.detail : existing?.detail,
          steps: task.steps || existing?.steps,
          startedAt: existing?.startedAt || Date.now(),
          targetTab: "studio",
          outputPath: task.outputPath || existing?.outputPath,
          tabId: task.tabId || existing?.tabId,
          sourcePath: task.sourcePath || existing?.sourcePath,
        },
      };
    });
  };

  useEffect(() => {
    loadDevices();
    refreshSetup();
    loadOllamaModels();
    sublix.appInfo().then(setAppInfo).catch(() => {});
    sublix.liveStatus().then(setIsLive).catch(() => {});
    sublix.getTranslationEngine().then(setEngine).catch(() => {});
    sublix.getSttEngine().then(setSttEngine).catch(() => {});
    sublix.getSttServerEngine().then(setSttServerEngine).catch(() => {});

    sublix.getConfig().then((cfg) => {
      setFullConfig(cfg);
      if (cfg.stt_engine_preference === "auto" || cfg.stt_engine_preference === "cpu" || cfg.stt_engine_preference === "cuda") {
        setSttEnginePref(cfg.stt_engine_preference);
      }
      if (cfg.translation_engine_preference === "auto" || cfg.translation_engine_preference === "cpu" || cfg.translation_engine_preference === "cuda") {
        setTransEnginePref(cfg.translation_engine_preference);
      }
      if (cfg.stt_model) setModel(cfg.stt_model);
      if (cfg.translation_model) setTranslationModel(cfg.translation_model);
      if (cfg.source_lang) setLanguage(cfg.source_lang);
      if (cfg.target_lang) setTargetLang(cfg.target_lang);
      if (cfg.output_mode === "original" || cfg.output_mode === "translated") {
        setOutputMode(cfg.output_mode);
      }
      if (cfg.chunk_seconds) setChunkSeconds(cfg.chunk_seconds);
      setVadEnabled(cfg.vad_enabled ?? true);
      if (cfg.overlay_font_size) setFontSize(cfg.overlay_font_size);
      setShowOriginal(cfg.overlay_show_original ?? true);
      setClickThrough(cfg.overlay_click_through ?? false);
      if (cfg.theme) {
        setTheme(cfg.theme);
        document.documentElement.dataset.theme = cfg.theme;
      }
      setBgOpacity(cfg.overlay_bg_opacity ?? 85);
      setTextColor(cfg.overlay_text_color ?? "white");
      if (
        cfg.translation_provider === "local" ||
        cfg.translation_provider === "ollama" ||
        cfg.translation_provider === "minimax" ||
        cfg.translation_provider === "deepseek" ||
        cfg.translation_provider === "openrouter"
      ) {
        setTransProvider(cfg.translation_provider as TransProvider);
      }
      // TSK-UI-REDESIGN-R2-5: KHÔNG nạp key vào ô nhập (tránh lộ key & tránh ghi
      // đè khi form còn cũ) — chỉ lưu 4 ký tự cuối để hiện gợi ý.
      setKeyHint({
        minimax: tail4(cfg.minimax_api_key),
        deepseek: tail4(cfg.deepseek_api_key),
        openrouter: tail4(cfg.openrouter_api_key),
      });
      if (cfg.minimax_model) setMinimaxModel(cfg.minimax_model);
      if (cfg.deepseek_model) setDeepseekModel(cfg.deepseek_model);
      if (cfg.openrouter_model) setOpenrouterModel(cfg.openrouter_model);
      if (cfg.ollama_url) setOllamaUrl(cfg.ollama_url);
      if (cfg.ollama_model) setOllamaModel(cfg.ollama_model);
      const reason = (cfg as unknown as Record<string, unknown>).llm_reasoning_effort;
      if (typeof reason === "string" && (REASONING_EFFORTS as readonly string[]).includes(reason)) {
        setReasoningEffortState(reason);
      }
      setConfigLoaded(true);
      void loadTtsStatus();
      void refreshTranslateOptions();
    }).catch(() => {
      setConfigLoaded(true);
    });

    const pStatus = listen<{ kind: string; message?: string }>("status:change", (e) => {
      const k = e.payload.kind;
      const msg = e.payload.message;
      if (k === "capturing") {
        setIsLive(true);
        if (msg) setStatus({ kind: "working", message: msg });
        sublix.getSttServerEngine().then(setSttServerEngine).catch(() => {});
        sublix.getTranslationEngine().then(setEngine).catch(() => {});
      } else if (k === "idle") {
        setIsLive(false);
        setStatus({ kind: "idle" });
      } else if (k === "error" && msg) {
        setStatus({ kind: "error", message: `Live error: ${msg}` });
        setIsLive(false);
      }
    });

    const pSub = listen<LiveSubPreview>("subtitle:new", (e) => {
      setRecentSubs((prev) => [e.payload, ...prev.slice(0, 199)]);
      sublix.getSttServerEngine().then(setSttServerEngine).catch(() => {});
      sublix.getTranslationEngine().then(setEngine).catch(() => {});
    });

    const pProgress = listen<ModelDownloadProgress>("model:download_progress", (e) => {
      const p = e.payload;
      setDownloadProgress((prev) => ({
        ...prev,
        [p.name]: {
          percent: p.percent,
          downloaded_bytes: p.downloaded_bytes,
          total_bytes: p.total_bytes,
          phase: p.phase,
          error: p.error,
        },
      }));
      if (p.percent === 100 || p.phase === "done") {
        refreshSetup();
        setGlobalTasks((prev) => {
          const taskId = `model_${p.name}`;
          const existing = prev[taskId];
          if (existing) {
            saveToProcessHistory({
              ...existing,
              status: "completed",
              percent: 100,
              stage: "Tải hoàn tất",
              completedAt: Date.now(),
            });
            const next = { ...prev };
            delete next[taskId];
            return next;
          }
          return prev;
        });
      } else {
        setGlobalTasks((prev) => ({
          ...prev,
          [`model_${p.name}`]: {
            id: `model_${p.name}`,
            type: "model",
            title: `Mô hình: ${p.name}`,
            stage: p.phase || "Đang tải dữ liệu...",
            percent: p.percent,
            status: "running",
            startedAt: prev[`model_${p.name}`]?.startedAt || Date.now(),
            targetTab: "models",
          },
        }));
      }
    });

    const pFileSub = listen<FileSubProgress>("file_sub:progress", (e) => {
      const p = e.payload;
      // [TSK-FIX-BUG-R2-8-01] Id lần chạy DUY NHẤT (trước: hằng "file_sub_active" ⇒ 2
      // lượt tạo phụ đề ghi cùng id ⇒ React key trùng + upsert nuốt mất mục cũ).
      const taskId = fileSubRunIdRef.current || makeTaskRunId("file_sub", Date.now());
      fileSubRunIdRef.current = taskId;
      if (p.stage === "done") {
        setGlobalTasks((prev) => {
          const existing = prev[taskId];
          saveToProcessHistory({
            id: taskId,
            type: "file_sub",
            title: existing?.title || "Dự án tạo phụ đề",
            stage: "Hoàn tất tạo phụ đề",
            percent: 100,
            status: "completed",
            detail: p.message || "Tạo phụ đề thành công",
            startedAt: existing?.startedAt || Date.now() - 5000,
            completedAt: Date.now(),
            targetTab: "studio",
          });
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        // Lượt tạo phụ đề kết thúc ⇒ lượt sau có id mới.
        fileSubRunIdRef.current = null;
      } else if (p.stage === "error") {
        setGlobalTasks((prev) => {
          const existing = prev[taskId];
          saveToProcessHistory({
            id: taskId,
            type: "file_sub",
            title: existing?.title || "Dự án tạo phụ đề",
            stage: "Lỗi xử lý",
            percent: p.percent || 0,
            status: "error",
            error: p.message,
            startedAt: existing?.startedAt || Date.now() - 5000,
            completedAt: Date.now(),
            targetTab: "studio",
          });
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        // Lượt tạo phụ đề lỗi ⇒ lượt sau có id mới.
        fileSubRunIdRef.current = null;
      } else {
        setGlobalTasks((prev) => {
          const existing = prev[taskId];
          const stageLabels: Record<string, string> = {
            extracting_audio: "Tách âm thanh FFmpeg",
            transcribing: "Nhận dạng giọng nói (Whisper)",
            translating: "Dịch AI (LLM / API)",
            burning_subtitles: "Ghép phụ đề vào video",
            packaging: "Đóng gói file kết quả",
          };
          const stageText = stageLabels[p.stage] || p.stage;
          return {
            ...prev,
            [taskId]: {
              id: taskId,
              type: "file_sub",
              title: existing?.title || "Dự án tạo phụ đề AI",
              stage: stageText,
              percent: Math.min(100, Math.max(0, p.percent)),
              status: "running",
              detail: p.message,
              eta: p.total_segments > 0 ? `${p.current_segment}/${p.total_segments} câu` : undefined,
              startedAt: existing?.startedAt || Date.now(),
              targetTab: "studio",
            },
          };
        });
      }
    });

    const pFileSubComplete = listen<FileSubResult>("file_sub:complete", (e) => {
      const res = e.payload;
      setGlobalTasks((prev) => {
        const keys = Object.keys(prev).filter((k) => k.startsWith("file_sub_"));
        const next = { ...prev };
        for (const k of keys) {
          const existing = prev[k];
          saveToProcessHistory({
            ...existing,
            status: "completed",
            percent: 100,
            completedAt: Date.now(),
            outputPath: res.vi_srt_path || (res.bilingual_srt_path ?? undefined) || res.original_srt_path,
            detail: `Hoàn tất: ${res.total_segments} câu thoại (${(res.elapsed_seconds || 0).toFixed(1)}s)`,
          });
          delete next[k];
        }
        return next;
      });
    });

    const pDubbing = listen<DubbingProgress>("dubbing:progress", (e) => {
      const p = e.payload;
      // [TSK-FIX-BUG-R2-8-01] Tiến trình backend thuộc về lượt chạy hiện tại ⇒ dùng
      // CHUNG id với Studio (trước đây là hằng "dubbing_active" ⇒ nhiều mục trùng id
      // trong lịch sử ⇒ React key trùng ở tab Tiến trình).
      // [TSK-TABS-P2] Có `run_id` ⇒ khoá theo lượt đó (đúng tab đang chạy), KHÔNG dùng
      // "lượt hiện tại" (có thể của tab khác). Thiếu `run_id` ⇒ hành vi cũ.
      // Lượt chưa đăng ký tác vụ (vd xuất video — không gọi onTaskUpdate) ⇒ dùng chính run_id làm id.
      const routed = resolveProgressTaskKey(p.run_id, runTaskMapRef.current, currentRunIdRef.current);
      const taskId = routed.taskId || makeTaskRunId("dubbing", Date.now());
      if (!routed.keyedByRun) currentRunIdRef.current = taskId;
      const endRun = () => {
        // Lượt kết thúc ⇒ lượt sau có id mới (chỉ xoá nếu đúng lượt "hiện tại").
        if (currentRunIdRef.current === taskId) currentRunIdRef.current = null;
        if (p.run_id) runTaskMapRef.current.delete(p.run_id);
      };
      if (p.stage === "done" || p.percent >= 100) {
        setGlobalTasks((prev) => {
          const existing = prev[taskId];
          if (existing) {
            const finalStage = existing.workflowLabel
              ? `Hoàn tất ${existing.workflowLabel}`
              : existing.type === "dubbing"
              ? "Hoàn tất lồng tiếng"
              : "Hoàn tất tạo phụ đề";
            saveToProcessHistory({
              ...existing,
              status: "completed",
              percent: 100,
              stage: finalStage,
              detail: existing.detail || (p.total_items > 2 ? `Đã tạo ${p.total_items} câu thoại` : "Hoàn tất thành công"),
              completedAt: Date.now(),
            });
            const next = { ...prev };
            delete next[taskId];
            return next;
          }
          return prev;
        });
        endRun();
      } else if (p.stage === "error") {
        setGlobalTasks((prev) => {
          const existing = prev[taskId];
          if (existing) {
            saveToProcessHistory({
              ...existing,
              status: "error",
              error: p.message,
              completedAt: Date.now(),
            });
            const next = { ...prev };
            delete next[taskId];
            return next;
          }
          return prev;
        });
        endRun();
      } else {
        setGlobalTasks((prev) => {
          const existing = prev[taskId];
          let stageMsg = p.message || p.stage;
          // Masking khi người dùng đang chạy phụ đề mà backend gửi thông điệp Sherpa
          if (
            (existing?.workflowType === "subtitle_only" || existing?.workflowType === "subtitle_translate" || existing?.type === "file_sub") &&
            (stageMsg.includes("Sherpa") || stageMsg.includes("phân tích âm sắc") || p.stage === "diarizing")
          ) {
            stageMsg = "🎙️ Đang tối ưu câu thoại & căn chỉnh mốc thời gian phụ đề...";
          }

          let detailText: string | undefined = existing?.detail;
          if (p.total_items > 2) {
            detailText = `${p.current_item}/${p.total_items} câu thoại`;
          } else if (p.total_items <= 2 && p.current_item === 0) {
            detailText = existing?.detail || "Đang tải mô hình & phân tích...";
          }

          return {
            ...prev,
            [taskId]: {
              id: taskId,
              type: existing?.type || "dubbing",
              title: existing?.title || "Dự án Studio AI",
              fileName: existing?.fileName,
              workflowType: existing?.workflowType,
              workflowLabel: existing?.workflowLabel,
              stage: stageMsg,
              percent: p.percent,
              status: "running",
              detail: detailText,
              steps: existing?.steps,
              startedAt: existing?.startedAt || Date.now(),
              targetTab: "studio",
              outputPath: existing?.outputPath,
              tabId: existing?.tabId,
              sourcePath: existing?.sourcePath,
            },
          };
        });
      }
    });

    const pDownloader = listen<DownloadProgressPayload>("downloader:progress", (e) => {
      const p = e.payload;
      const taskId = `dl_${p.id}`;
      if (p.status === "completed") {
        setGlobalTasks((prev) => {
          const existing = prev[taskId];
          saveToProcessHistory({
            id: taskId,
            type: "downloader",
            title: p.filename || existing?.title || "Tải video",
            stage: "Tải hoàn tất",
            percent: 100,
            status: "completed",
            outputPath: p.file_path || p.filename || undefined,
            detail: p.size_text,
            startedAt: existing?.startedAt || Date.now() - 10000,
            completedAt: Date.now(),
            targetTab: "downloader",
          });
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      } else if (p.status === "error" || p.status === "cancelled") {
        setGlobalTasks((prev) => {
          const existing = prev[taskId];
          saveToProcessHistory({
            id: taskId,
            type: "downloader",
            title: p.filename || existing?.title || "Tải video",
            stage: p.status === "error" ? "Lỗi tải video" : "Đã hủy",
            percent: p.percent || 0,
            status: p.status === "error" ? "error" : "paused",
            error: p.error || undefined,
            startedAt: existing?.startedAt || Date.now() - 10000,
            completedAt: Date.now(),
            targetTab: "downloader",
          });
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      } else {
        setGlobalTasks((prev) => ({
          ...prev,
          [taskId]: {
            id: taskId,
            type: "downloader",
            title: p.filename || "Đang tải video",
            stage: p.status === "downloading" ? "Đang tải..." : "Tạm dừng",
            percent: p.percent,
            status: p.status === "paused" ? "paused" : "running",
            speed: p.speed,
            eta: p.eta,
            detail: p.size_text,
            startedAt: prev[taskId]?.startedAt || Date.now(),
            targetTab: "downloader",
          },
        }));
      }
    });

    return () => {
      pStatus.then((u) => u()).catch(() => {});
      pSub.then((u) => u()).catch(() => {});
      pProgress.then((u) => u()).catch(() => {});
      pFileSub.then((u) => u()).catch(() => {});
      pFileSubComplete.then((u) => u()).catch(() => {});
      pDubbing.then((u) => u()).catch(() => {});
      pDownloader.then((u) => u()).catch(() => {});
    };
  }, []);

  /**
   * Lấy danh sách model Ollama đã cài.
   * Ollama có thể chưa chạy -> trả về mảng rỗng, không báo lỗi (preset AMD
   * vẫn dùng được, chỉ không auto-chọn được model).
   */
  async function loadOllamaModels(): Promise<OllamaModelInfo[]> {
    try {
      const list = await sublix.ollamaModels();
      setOllamaModelList(list);
      return list;
    } catch (e) {
      console.warn("ollama_models failed:", e);
      setOllamaModelList([]);
      return [];
    }
  }

  async function refreshSetup() {
    try {
      const s = await sublix.checkSetup();
      setSttModels(s.stt_models ?? []);
      setTransModels(s.translation_models ?? []);
    } catch (e) {
      console.error("checkSetup failed:", e);
    }
  }

  /**
   * TSK-UI-REDESIGN-R2-7B: `useCallback` để truyền xuống `<LiveView/>` (React.memo)
   * mà không phá cache. Chỉ dùng state setter (đã ổn định) nên deps rỗng.
   */
  const loadDevices = useCallback(async () => {
    try {
      const list = await sublix.listDevices();
      setDevices(list);
      if (list.length === 0) {
        setStatus({ kind: "error", message: "No audio devices found" });
      }
    } catch (e) {
      setStatus({ kind: "error", message: `Failed to list devices: ${e}` });
    }
  }, []);

  const liveBusyRef = useRef(false);

  const handleStartLive = useCallback(async () => {
    if (liveBusyRef.current || isLive) return;
    liveBusyRef.current = true;
    setStatus({ kind: "working", message: "Starting GPU Live Subtitle Pipeline..." });
    try {
      const deviceIndex = selectedDevice === "default"
        ? undefined
        : Number(selectedDevice.replace("index:", ""));
      await sublix.startLive({
        deviceIndex,
        model,
        chunkSeconds,
        outputMode,
        targetLang,
        sourceLang: language,
        translationModel,
        vadEnabled,
      });
      setIsLive(true);
      setStatus({
        kind: "success",
        message: "Live subtitle stream running! Overlay window is active.",
      });
    } catch (e) {
      setStatus({ kind: "error", message: `Failed to start: ${e}` });
    } finally {
      liveBusyRef.current = false;
    }
  }, [
    isLive, selectedDevice, model, chunkSeconds,
    outputMode, targetLang, language, translationModel, vadEnabled,
  ]);

  const handleStopLive = useCallback(async () => {
    if (liveBusyRef.current || !isLive) return;
    liveBusyRef.current = true;
    setStatus({ kind: "working", message: "Stopping live stream..." });
    try {
      await sublix.stopLive();
      setIsLive(false);
      setStatus({ kind: "success", message: "Live capture stopped." });
    } catch (e) {
      setStatus({ kind: "error", message: `Failed to stop: ${e}` });
    } finally {
      liveBusyRef.current = false;
    }
  }, [isLive]);

  /** TSK-UI-REDESIGN-R2-7B: đổi lựa chọn của select gộp "Phụ đề hiển thị". */
  const targetLangRef = useRef(targetLang);
  targetLangRef.current = targetLang;

  const handleDisplayModeChange = useCallback((value: string) => {
    const next = fromDisplayValue(value, targetLangRef.current);
    setOutputMode(next.outputMode);
    setTargetLang(next.targetLang);
  }, []);

  /** Xoá danh sách tạm của luồng thoại (tab Live). */
  const handleClearRecentSubs = useCallback(() => {
    setRecentSubs([]);
  }, []);

  /** Xoá toàn bộ lịch sử (tab Lịch sử) + bỏ chọn câu đang xem. */
  const handleClearHistory = useCallback(() => {
    setRecentSubs([]);
    setSelectedHistorySub(null);
  }, []);

  /**
   * BUG-033 (đang 🔴 Open): hotkey cũ chỉ re-bind khi `isLive`/`overlayVisible`
   * đổi → `handleStartLive` bị closure cũ, đổi model/ngôn ngữ rồi bấm
   * Ctrl+Shift+L không ăn theo. Nay handler trong keydown đi qua `latestRef`
   * nên luôn gọi bản MỚI NHẤT.
   */
  const latestRef = useRef({ start: handleStartLive, stop: handleStopLive, isLive, overlayVisible });
  useEffect(() => {
    latestRef.current = { start: handleStartLive, stop: handleStopLive, isLive, overlayVisible };
  });

  // Hotkeys while the app has focus: Ctrl+Shift+L = toggle live, Ctrl+Shift+O = toggle overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const latest = latestRef.current;
      if (k === "l") {
        e.preventDefault();
        if (latest.isLive) void latest.stop();
        else void latest.start();
      } else if (k === "o") {
        e.preventDefault();
        if (latest.overlayVisible) {
          sublix.hideOverlay().then(() => setOverlayVisible(false)).catch(() => {});
        } else {
          sublix.showOverlay().then(() => setOverlayVisible(true)).catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * TSK-UI-REDESIGN-R2-5 (BUG đã biết): LUÔN đọc config MỚI NHẤT từ đĩa rồi mới
   * gộp patch. Trước đây hàm lưu dựa vào `fullConfig` cũ (nạp lúc mở app) nên
   * bấm Lưu sau khi key được nạp thẳng vào file sẽ ghi đè key bằng chuỗi rỗng.
   * `keys` chỉ được ghi khi người dùng VỪA GÕ (chuỗi rỗng = giữ nguyên key cũ).
   */
  async function saveConfigPatch(
    patch: Partial<AppConfig>,
    keys?: Partial<Record<"minimax_api_key" | "deepseek_api_key" | "openrouter_api_key", string>>,
    clearKeys?: Array<"minimax" | "deepseek" | "openrouter">,
  ): Promise<AppConfig | null> {
    const latest = await sublix.getConfig().catch(() => null);
    const base = (latest ?? fullConfig) as unknown as Record<string, unknown> | null;
    if (!base) return null;
    const merged = mergeConfig({
      latest: base,
      patch: patch as Record<string, unknown>,
      keyForm: keys
        ? {
            minimax: keys.minimax_api_key,
            deepseek: keys.deepseek_api_key,
            openrouter: keys.openrouter_api_key,
          }
        : null,
      clearKeys,
    });
    try {
      const saved = await sublix.saveConfig(merged as unknown as AppConfig);
      setFullConfig(saved);
      setKeyHint({
        minimax: tail4(saved.minimax_api_key),
        deepseek: tail4(saved.deepseek_api_key),
        openrouter: tail4(saved.openrouter_api_key),
      });
      return saved;
    } catch (e) {
      console.error("saveConfig failed:", e);
      return null;
    }
  }

  /** Key người dùng vừa gõ (rỗng = không đụng tới key đã lưu). */
  function dirtyKeys() {
    return {
      minimax_api_key: minimaxKey,
      deepseek_api_key: deepseekKey,
      openrouter_api_key: openrouterKey,
    };
  }

  function setKeyInput(which: "minimax" | "deepseek" | "openrouter", value: string) {
    if (which === "minimax") setMinimaxKey(value);
    else if (which === "deepseek") setDeepseekKey(value);
    else setOpenrouterKey(value);
  }

  /** Xoá key có chủ đích (chỉ khi người dùng bấm "Xoá key"). */
  async function clearProviderKey(which: "minimax" | "deepseek" | "openrouter") {
    setKeyInput(which, "");
    await saveConfigPatch({}, undefined, [which]);
    setStatus({ kind: "success", message: `Đã xoá key ${which}.` });
  }

  /* --------- R2-5: cầu nối `translate_options_get/set` (mcode #2) --------- */

  function applyTranslateOptions(o: TranslateOptions) {
    if (o.reasoning_effort) setReasoningEffortState(o.reasoning_effort);
    setTranslateOptions(o);
  }

  async function refreshTranslateOptions() {
    if (!translateApi.translateOptionsGet) return; // backend chưa có — dùng heuristic
    try {
      applyTranslateOptions(await translateApi.translateOptionsGet());
    } catch {
      // backend chưa sẵn sàng — bỏ qua, UI vẫn chạy bằng config + heuristic
    }
  }

  /**
   * Lưu lựa chọn dịch: ưu tiên `translate_options_set` (ghi TỪNG field, không
   * đụng API key). Nếu wrapper chưa có thì fallback sang `saveConfigPatch`
   * (đã an toàn vì gộp trên config mới nhất + không ghi key rỗng).
   */
  async function persistTranslationSelection(sel: {
    provider?: TransProvider;
    model?: string;
    reasoning_effort?: string;
  }): Promise<boolean> {
    if (translateApi.translateOptionsSet) {
      try {
        applyTranslateOptions(await translateApi.translateOptionsSet(sel));
        return true;
      } catch {
        // rơi xuống fallback
      }
    }
    const patch: Partial<AppConfig> = {};
    if (sel.provider) patch.translation_provider = sel.provider;
    if (sel.model) {
      const p = sel.provider ?? transProvider;
      if (p === "minimax") patch.minimax_model = sel.model;
      else if (p === "deepseek") patch.deepseek_model = sel.model;
      else if (p === "openrouter") patch.openrouter_model = sel.model;
      else if (p === "local") patch.translation_model = sel.model;
      else if (p === "ollama") patch.ollama_model = sel.model;
    }
    if (sel.reasoning_effort) {
      (patch as unknown as Record<string, unknown>).llm_reasoning_effort = sel.reasoning_effort;
    }
    const saved = await saveConfigPatch(patch);
    return !!saved;
  }

  /** Chọn model từ nút nhanh (lưu ngay qua translate_options_set). */
  function chooseModel(provider: TransProvider, model: string) {
    if (provider === "minimax") setMinimaxModel(model);
    else if (provider === "deepseek") setDeepseekModel(model);
    else if (provider === "openrouter") setOpenrouterModel(model);
    else if (provider === "local") setTranslationModel(model);
    else if (provider === "ollama") setOllamaModel(model);
    void persistTranslationSelection({ provider, model });
  }

  function changeReasoningEffort(value: string) {
    setReasoningEffortState(value);
    void persistTranslationSelection({ reasoning_effort: value });
  }

  async function persistOverlayConfig(patch: Partial<AppConfig>) {
    await saveConfigPatch({
      stt_model: model,
      translation_model: translationModel,
      source_lang: language,
      target_lang: targetLang,
      output_mode: outputMode,
      chunk_seconds: chunkSeconds,
      vad_enabled: vadEnabled,
      ...patch,
    });
  }

  async function handleThemeChange(next: string) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    await saveConfigPatch({ theme: next });
  }

  /* ---------------- TSK-UI-REDESIGN-R2-5: Giọng đọc TTS ---------------- */

  async function loadTtsStatus() {
    setTtsLoading(true);
    try {
      const st = await sublix.ttsEnginesStatus();
      setTtsStatus(st);
    } catch (e) {
      setTtsNotice(`⚠️ Không đọc được trạng thái engine TTS: ${e}`);
    } finally {
      setTtsLoading(false);
    }
  }

  async function installTtsDeps(engine: "vieneu" | "zerotts") {
    setTtsBusyEngine(engine);
    setTtsDepsLine(null);
    setTtsNotice(`⏳ Đang cài deps cho ${engine}…`);
    try {
      await sublix.ttsEngineInstallDeps(engine);
      setTtsNotice(`✅ Đã cài deps cho ${engine}.`);
      await loadTtsStatus();
    } catch (e) {
      setTtsNotice(`❌ Cài deps thất bại: ${e}`);
    } finally {
      setTtsBusyEngine(null);
      setTtsDepsLine(null);
    }
  }

  async function diagnoseTts(engine: "vieneu" | "zerotts") {
    setTtsNotice(`🩺 Đang chẩn đoán ${engine}…`);
    try {
      const r = await sublix.ttsEngineDiagnose(engine);
      setTtsNotice(`🩺 ${engine}: ${JSON.stringify(r)}`);
    } catch (e) {
      setTtsNotice(`❌ Chẩn đoán thất bại: ${e}`);
    }
  }

  function setTtsCloudKey(provider: "google" | "fptai", value: string) {
    setTtsCloudKeyState((prev) => ({ ...prev, [provider]: value }));
  }

  async function saveTtsCloudKey(provider: "google" | "fptai") {
    const key = ttsCloudKey[provider].trim();
    if (!key) {
      setTtsNotice("⚠️ Chưa nhập API key.");
      return;
    }
    try {
      await sublix.ttsCloudSetKey(provider, key);
      setTtsCloudKeyHint((prev) => ({ ...prev, [provider]: tail4(key) }));
      setTtsCloudKeyState((prev) => ({ ...prev, [provider]: "" }));
      setTtsNotice(`✅ Đã lưu key ${provider} (••••${tail4(key)}).`);
      await loadTtsStatus();
    } catch (e) {
      setTtsNotice(`❌ Lưu key thất bại: ${e}`);
    }
  }

  async function testTtsCloud(provider: "google" | "fptai") {
    setTtsNotice(`🧪 Đang kiểm tra ${provider}…`);
    try {
      const msg = await sublix.ttsCloudTest(provider);
      setTtsNotice(`🧪 ${provider}: ${msg}`);
    } catch (e) {
      setTtsNotice(`❌ Kiểm tra thất bại: ${e}`);
    }
  }

  async function handleSttEngineChange(choice: "auto" | "cpu" | "cuda") {
    if (choice === sttEnginePref) return;
    setSttEnginePref(choice);
    setStatus({ kind: "working", message: `Switching STT engine to ${choice.toUpperCase()}...` });
    try {
      const cfg = await sublix.setSttEnginePreference(choice);
      setFullConfig(cfg);
      if (sttServerEngine !== null) {
        setSttServerStarting(true);
        const eng = await sublix.preloadSttServer(model);
        setSttServerEngine(eng);
        setSttServerStarting(false);
        setStatus({
          kind: "success",
          message: `✅ STT server hot-swapped to ${eng.toUpperCase()} (model: ${model})`,
        });
      } else {
        setStatus({ kind: "success", message: `✅ STT engine preference set: ${choice.toUpperCase()}` });
      }
    } catch (e) {
      setSttServerStarting(false);
      setStatus({ kind: "error", message: `Failed to switch STT engine: ${e}` });
    }
  }

  async function handleTransEngineChange(choice: "auto" | "cpu" | "cuda") {
    if (choice === transEnginePref) return;
    setTransEnginePref(choice);
    setStatus({ kind: "working", message: `Switching LLM engine to ${choice.toUpperCase()}...` });
    try {
      const cfg = await sublix.setTranslationEnginePreference(choice);
      setFullConfig(cfg);
      if (engine !== null) {
        setServerStarting(true);
        const eng = await sublix.preloadTranslationServer(translationModel);
        setEngine(eng);
        setServerStarting(false);
        setStatus({
          kind: "success",
          message: `✅ Translation LLM hot-swapped to ${eng.toUpperCase()} (${translationModel})`,
        });
      } else {
        setStatus({ kind: "success", message: `✅ Translation engine preference set: ${choice.toUpperCase()}` });
      }
    } catch (e) {
      setServerStarting(false);
      setStatus({ kind: "error", message: `Failed to switch LLM engine: ${e}` });
    }
  }

  const PROVIDER_LABEL: Record<TransProvider, string> = {
    local: "💻 Local GGUF (llama-server)",
    ollama: "🦙 Ollama Local",
    minimax: "🌐 MiniMax Cloud API",
    deepseek: "🐋 DeepSeek",
    openrouter: "🔀 OpenRouter",
  };

  /** Đổi nhà cung cấp → tự lưu (translate_options_set; fallback gộp config an toàn). */
  async function handleProviderChange(provider: TransProvider) {
    setTransProvider(provider);
    const ok = await persistTranslationSelection({ provider });
    if (ok) {
      setStatus({ kind: "success", message: `✅ Đã chuyển bộ dịch sang: ${PROVIDER_LABEL[provider]}` });
    } else {
      setStatus({ kind: "error", message: "Lưu cấu hình thất bại." });
    }
  }

  async function saveProviderSettings() {
    const patch: Record<string, unknown> = {
      translation_provider: transProvider,
      minimax_model: minimaxModel,
      deepseek_model: deepseekModel,
      openrouter_model: openrouterModel,
      ollama_url: ollamaUrl,
      ollama_model: ollamaModel,
    };
    if (reasoningSupported) patch.llm_reasoning_effort = reasoningEffort;
    const saved = await saveConfigPatch(patch as Partial<AppConfig>, dirtyKeys());
    if (saved) {
      setMinimaxKey("");
      setDeepseekKey("");
      setOpenrouterKey("");
      setStatus({ kind: "success", message: "✅ Đã lưu cấu hình bộ dịch thành công!" });
    } else {
      setStatus({ kind: "error", message: "Lưu cấu hình thất bại." });
    }
  }

  async function testProviderTranslation() {
    setProviderTesting(true);
    setProviderTestResult(null);
    try {
      await saveConfigPatch(
        { translation_provider: transProvider, minimax_model: minimaxModel, deepseek_model: deepseekModel, openrouter_model: openrouterModel, ollama_url: ollamaUrl, ollama_model: ollamaModel },
        dirtyKeys(),
      );
      const testInput = "I can't believe you actually pulled this off. You're insane, you know that?";
      const res = await sublix.translateTest(testInput, "en", "vi", translationModel);
      setProviderTestResult(res);
      setStatus({ kind: "success", message: "✅ Kiểm tra dịch thoại thành công!" });
    } catch (err) {
      setProviderTestResult(`❌ Lỗi kết nối: ${err}`);
      setStatus({ kind: "error", message: `Kiểm tra dịch thất bại: ${err}` });
    } finally {
      setProviderTesting(false);
    }
  }

  /**
   * Chọn model Ollama đã cài phù hợp cho GPU tích hợp AMD.
   * - Ưu tiên Qwen2.5-3B: KHÔNG có thinking mode nên trả lời nhanh (~6s, đo thật)
   *   — Qwen3-4B bản "Thinking" sinh hàng trăm token suy luận, mất 50-110s.
   * - Không có Qwen2.5 -> chọn model 1.5-6.5GB (vừa VRAM, không bị swap).
   * - Cuối cùng -> model nhỏ nhất.
   */
  function pickOllamaModel(list: OllamaModelInfo[]): string | null {
    const usable = list.filter((m) => !m.name.endsWith("-cpu"));
    if (usable.length === 0) return null;
    const qwen25_3b = usable.find((m) => /^qwen2\.5:3b$/i.test(m.name));
    if (qwen25_3b) return qwen25_3b.name;
    const qwen4b = usable.find((m) => /^qwen3:4b$/i.test(m.name));
    if (qwen4b) return qwen4b.name;
    const qwen = usable.find((m) => /^qwen/i.test(m.name) && m.size_gb <= 8);
    if (qwen) return qwen.name;
    const mid = usable.filter((m) => m.size_gb >= 1.5 && m.size_gb <= 6.5);
    if (mid.length > 0) return [...mid].sort((a, b) => b.size_gb - a.size_gb)[0].name;
    return [...usable].sort((a, b) => a.size_gb - b.size_gb)[0].name;
  }

  async function applyHardwarePreset(preset: HardwarePreset) {
    if (preset === "cpu") {
      const stt = "base";
      const trans = "qwen2.5-1.5b";
      setModel(stt);
      setTranslationModel(trans);
      setSttEnginePref("cpu");
      setTransEnginePref("cpu");
      void saveConfigPatch({
        stt_model: stt,
        translation_model: trans,
        stt_engine_preference: "cpu",
        translation_engine_preference: "cpu",
      });
      setStatus({
        kind: "success",
        message: "💻 Đã chọn cấu hình Laptop / PC Văn Phòng (Thuần CPU). Model nhẹ, không cần card rời NVIDIA!",
      });
    } else if (preset === "gpu_mid") {
      const stt = "base";
      const trans = "qwen2.5-3b";
      setModel(stt);
      setTranslationModel(trans);
      setSttEnginePref("cuda");
      setTransEnginePref("cuda");
      void saveConfigPatch({
        stt_model: stt,
        translation_model: trans,
        stt_engine_preference: "cuda",
        translation_engine_preference: "cuda",
      });
      setStatus({
        kind: "success",
        message: "⚡ Đã chọn cấu hình GPU Gaming Phổ Thông (4GB - 8GB VRAM). Tối ưu cho GTX 1650, RTX 2060/3050/3060/4060!",
      });
    } else if (preset === "gpu_high") {
      const stt = "large-v3-turbo-q8_0";
      const trans = "qwen3-4b";
      setModel(stt);
      setTranslationModel(trans);
      setSttEnginePref("cuda");
      setTransEnginePref("cuda");
      void saveConfigPatch({
        stt_model: stt,
        translation_model: trans,
        stt_engine_preference: "cuda",
        translation_engine_preference: "cuda",
      });
      setStatus({
        kind: "success",
        message: "🚀 Đã chọn cấu hình GPU Khủng (12GB - 24GB VRAM). Tối ưu RTX 3080/3090, 4080/4090 cho chất lượng tối đa!",
      });
    } else if (preset === "amd_igpu") {
      // GPU tích hợp AMD (Radeon / Ryzen AI Max):
      // - whisper.cpp trên Windows chưa có bản ROCm/Vulkan ổn định -> STT chạy CPU.
      // - Dịch chạy qua Ollama: Ollama tự dùng ROCm/Vulkan trên iGPU
      //   (nhanh hơn CPU ~2x trên Ryzen AI Max, đo thật 32.8 vs 15.5 tok/s).
      const stt = "base";
      setModel(stt);
      setSttEnginePref("cpu");
      setTransEnginePref("cpu");
      setTransProvider("ollama");

      const installed = await loadOllamaModels();
      const picked = pickOllamaModel(installed);
      if (picked) setOllamaModel(picked);

      void saveConfigPatch({
        stt_model: stt,
        stt_engine_preference: "cpu",
        translation_engine_preference: "cpu",
        translation_provider: "ollama",
        ...(picked ? { ollama_model: picked } : {}),
      });
      setStatus({
        kind: "success",
        message: picked
          ? `🔺 Đã chọn cấu hình GPU tích hợp AMD (Radeon / Ryzen AI). Whisper chạy CPU, dịch chạy Ollama trên iGPU với model ${picked}!`
          : "🔺 Đã chọn cấu hình GPU tích hợp AMD (Radeon / Ryzen AI). Whisper chạy CPU, dịch chạy Ollama. Cài Ollama + model để tận dụng iGPU!",
      });
    }
  }

  const currentPreset: HardwarePreset | null =
    transProvider === "ollama" && sttEnginePref === "cpu" && (model === "base" || model === "tiny")
      ? "amd_igpu"
      : sttEnginePref === "cpu" && transEnginePref === "cpu" && (model === "base" || model === "tiny") && translationModel === "qwen2.5-1.5b"
      ? "cpu"
      : sttEnginePref === "cuda" && (translationModel === "qwen3-4b" || translationModel === "qwen3-8b") && model === "large-v3-turbo-q8_0"
      ? "gpu_high"
      : sttEnginePref === "cuda" && (translationModel === "qwen2.5-3b" || model === "base" || model === "small")
      ? "gpu_mid"
      : null;

  async function handleDownloadStt(variantName: string, sizeMb: number) {
    setDownloadingModel(variantName);
    setStatus({ kind: "working", message: `Đang tải Whisper ${variantName} (~${sizeMb}MB)...` });
    try {
      await sublix.downloadSttModel(variantName);
      await refreshSetup();
      setStatus({ kind: "success", message: `✅ Đã tải xong Whisper model: ${variantName}!` });
    } catch (e) {
      setStatus({ kind: "error", message: `Tải thất bại: ${e}` });
    } finally {
      setDownloadingModel(null);
    }
  }

  async function handleDownloadTrans(variantName: string, sizeMb: number) {
    setDownloadingModel(variantName);
    setStatus({ kind: "working", message: `Đang tải Translation LLM ${variantName} (~${sizeMb}MB)...` });
    try {
      await sublix.downloadTranslationModel(variantName);
      await refreshSetup();
      setStatus({ kind: "success", message: `✅ Đã tải xong Translation model: ${variantName}!` });
    } catch (e) {
      setStatus({ kind: "error", message: `Tải thất bại: ${e}` });
    } finally {
      setDownloadingModel(null);
    }
  }

  async function handleTestCapture() {
    setStatus({ kind: "working", message: "Recording 5 seconds... (play audio first!)" });
    const path = "sublix-test-capture.wav";
    const deviceIndex = selectedDevice === "default"
      ? undefined
      : Number(selectedDevice.replace("index:", ""));
    try {
      const fmt = await sublix.captureTest(path, 5, deviceIndex);
      setLastCapture(path);
      setStatus({
        kind: "success",
        message: `Captured ${fmt.sample_rate}Hz, ${fmt.channels}ch, ${fmt.sample_type} → ${path}`,
      });
    } catch (e) {
      setStatus({ kind: "error", message: `Capture failed: ${e}` });
    }
  }

  async function handleTranscribe() {
    if (!lastCapture) {
      setStatus({ kind: "error", message: "Capture audio first" });
      return;
    }
    setStatus({ kind: "working", message: `Transcribing (${model}) + Translating (${translationModel})...` });
    try {
      const result = await sublix.transcribe(lastCapture, language, model);
      setLastTranscript(result.text);
      if (result.text.trim() && outputMode === "translated") {
        const trans = await sublix.translateTest(result.text, language, targetLang, translationModel);
        setLastTranslatedTest(trans);
      } else {
        setLastTranslatedTest(null);
      }
      setStatus({
        kind: "success",
        message: `Done! STT took ${result.inference_duration_secs.toFixed(2)}s (${result.audio_duration_secs.toFixed(1)}s audio)`,
      });
    } catch (e) {
      setStatus({ kind: "error", message: `Transcribe failed: ${e}` });
    }
  }


  const runningDownloads = Object.values(globalTasks).filter((t) => t.type === "downloader" && t.status === "running");
  const runningModels = Object.values(globalTasks).filter((t) => t.type === "model" && t.status === "running");
  const totalActiveTasksCount = Object.values(globalTasks).filter((t) => t.status === "running").length;

  /* ================= TSK-UI-REDESIGN-R2-5: gói ctx cho các mục Cài đặt ================= */

  async function downloadTransModel(name: string) {
    setDownloadingModel(name);
    setStatus({ kind: "working", message: `Đang tải model ${name}…` });
    try {
      await sublix.downloadTranslationModel(name);
      await refreshSetup();
      setStatus({ kind: "success", message: `✅ Đã tải model ${name}.` });
    } catch (e) {
      setStatus({ kind: "error", message: `Tải model thất bại: ${e}` });
    } finally {
      setDownloadingModel(null);
    }
  }

  async function preloadTranslation() {
    setServerStarting(true);
    try {
      const eng = await sublix.preloadTranslationServer(translationModel);
      setEngine(eng);
      setStatus({ kind: "success", message: `✅ LLM sẵn sàng trên ${eng.toUpperCase()}` });
    } catch (e) {
      setEngine(null);
      setStatus({ kind: "error", message: `Nạp LLM thất bại: ${e}` });
    } finally {
      setServerStarting(false);
    }
  }

  const PRESETS = [
    { id: "cpu", icon: "💻", title: "Chỉ CPU", sub: "Laptop / văn phòng", spec: "base + Qwen2.5-1.5B" },
    { id: "gpu_mid", icon: "⚡", title: "GPU 4–8 GB", sub: "GTX / RTX phổ thông", spec: "base + Qwen2.5-3B · CUDA" },
    { id: "gpu_high", icon: "🚀", title: "GPU 12–24 GB", sub: "RTX 3080/3090/4090", spec: "Turbo Q8 + Qwen3-4B" },
    { id: "amd_igpu", icon: "🔺", title: "GPU tích hợp AMD", sub: "Radeon / Ryzen AI", spec: "base + Ollama trên iGPU" },
  ] as const;

  const THEMES = [
    { id: "cinema", label: "Cinema", hint: "Tối ấm · mặc định" },
    { id: "studio", label: "Studio", hint: "Xanh teal" },
    { id: "light", label: "Sáng", hint: "Nền sáng" },
    { id: "vibrant", label: "Rực", hint: "Đỏ-hồng" },
  ] as const;

  const settingsCtx: SettingsCtx = {
    provider: transProvider,
    setProvider: (p) => void handleProviderChange(p),
    providerTesting,
    providerTestResult,
    testProvider: () => void testProviderTranslation(),
    saveProvider: () => void saveProviderSettings(),

    minimaxModel,
    setMinimaxModel,
    deepseekModel,
    setDeepseekModel,
    openrouterModel,
    setOpenrouterModel,
    chooseModel,
    reasoningEffort,
    setReasoningEffort: changeReasoningEffort,
    reasoningSupported,

    keyInput: { minimax: minimaxKey, deepseek: deepseekKey, openrouter: openrouterKey },
    setKeyInput,
    keyHint,
    clearKey: (which) => void clearProviderKey(which),

    ollamaUrl,
    setOllamaUrl,
    ollamaModel,
    setOllamaModel,
    ollamaModelList,
    reloadOllama: () => void loadOllamaModels(),

    translationModel,
    setTranslationModel,
    transModels,
    transEnginePref,
    changeTransEngine: (v) => void handleTransEngineChange(v),
    llmEngine: engine,
    serverStarting,
    preloadTranslation: () => void preloadTranslation(),
    downloadTransModel: (n) => void downloadTransModel(n),
    downloadingModel,

    ttsStatus,
    ttsLoading,
    ttsNotice,
    reloadTts: () => void loadTtsStatus(),
    installTtsDeps: (e) => void installTtsDeps(e),
    diagnoseTts: (e) => void diagnoseTts(e),
    ttsBusyEngine,
    ttsDepsLine,
    ttsCloudKey,
    setTtsCloudKey,
    saveTtsCloudKey: (p) => void saveTtsCloudKey(p),
    testTtsCloud: (p) => void testTtsCloud(p),
    ttsCloudKeyHint,

    currentPreset,
    applyPreset: (p) => void applyHardwarePreset(p),
    presets: PRESETS,

    theme,
    setTheme: (t) => void handleThemeChange(t),
    themes: THEMES,

    appInfo,
    isLive,
    sttServerEngine,
    model,
    config: fullConfig,
    openModelsFolder: () => void sublix.openModelsFolder(),
  };

  return (
    <div className="app-shell">
      {/* STUDIO FULL-BLEED: Giữ mounted vĩnh viễn trong DOM để KHÔNG bao giờ bị clear project/timeline khi chuyển tab */}
      <div
        className="studio-fullbleed"
        style={{
          display: activeTab === "studio" ? "flex" : "none",
        }}
      >
        <StudioTabsHost
          openRequest={studioOpenRequest}
          initialPath={pendingStudioPath || pendingDubbingPath || undefined}
          isVisible={activeTab === "studio"}
          appVersion={appInfo?.version}
          onNavigateTab={(t) => setActiveTab(t)}
          currentTheme={theme}
          onThemeChange={handleThemeChange}
          onTaskUpdate={handleStudioTaskUpdate}
        />
      </div>
            {/* RIGHT MAIN WORKSPACE */}
      <main className="app-main" style={{ display: activeTab === "studio" ? "none" : "flex" }}>
        {/* MASTER STUDIO TOPBAR */}
        {/* R2-2: thanh trên DÙNG CHUNG (MasterTopbar) — giống hệt Studio, badge hiện ở MỌI tab. */}
        <MasterTopbar
          version={appInfo?.version ?? APP_VERSION_PKG}
          activeTab={activeTab}
          onNavigateTab={(tabId) => setActiveTab(tabId as typeof activeTab)}
          tabs={[
            { id: "studio", label: "Studio", icon: <IconClapper size={13} /> },
            {
              id: "downloader",
              label: "Tải video",
              icon: <IconGlobe size={13} />,
              badge: runningDownloads.length > 0 ? `⬇ ${runningDownloads.length}` : null,
            },
            {
              id: "lab",
              label: "Xưởng AI",
              icon: <IconSparkles size={13} />,
              tag: "Thử nghiệm",
            },
            {
              id: "live",
              label: "Live",
              icon: <IconMic size={13} />,
              badge: isLive ? "LIVE" : null,
            },
            { id: "history", label: "Lịch sử", icon: <IconClock size={13} /> },
            {
              id: "process",
              label: "Tiến trình",
              icon: <IconClock size={13} />,
              badge: totalActiveTasksCount > 0 ? `⚡ ${totalActiveTasksCount}` : null,
            },
            {
              id: "models",
              label: "Cài đặt",
              icon: <IconSettings size={13} />,
              badge: runningModels.length > 0 ? `📥 ${runningModels.length}` : null,
            },
          ]}
          statusLabel={
            status.kind === "idle"
              ? isLive
                ? "🔴 Đang bắt âm thanh & dịch live..."
                : "Sẵn sàng"
              : status.kind === "working"
              ? `⏳ ${status.message}`
              : status.kind === "error"
              ? `⚠ ${status.message}`
              // [UI_R2-8_REVIEW mục 12] Bỏ "✓ " — pill đã có chấm xanh ở MasterTopbar.
              : status.message
          }
          onStatusClick={() => setActiveTab("process")}
          overlay={{
            onClick: async () => {
              if (overlayVisible) {
                await sublix.hideOverlay();
                setOverlayVisible(false);
              } else {
                await sublix.showOverlay();
                setOverlayVisible(true);
              }
            },
            title: "Bật/tắt Overlay (Ctrl+Shift+O)",
          }}
        >
          {/* R2-5: 4 chấm đổi theme đã chuyển hẳn vào Cài đặt › Chủ đề (PLAN §4.2). */}
        </MasterTopbar>

        {/* Scrollable Body */}
        <div className="main-body">

      {/* BUG-045: always mount DownloaderView, hide with CSS when not active.
          This keeps the event listener alive across tab switches so events
          fired while the user is on another tab (e.g. completed downloads)
          are not lost. */}
      <div
        data-tab="downloader"
        style={{
          display: activeTab === "downloader" ? "block" : "none",
          height: "100%",
        }}
      >
        <DownloaderView
          onNavigateToStudio={handleRouteToStudio}
          onNavigateToFileSub={handleRouteToFileSub}
          onNavigateToDubbing={handleRouteToDubbing}
          onNotifyDiscoveryStudioOpened={handleNotifyDiscoveryStudioOpened}
        />
      </div>

      <div
        data-tab="lab"
        style={{
          display: activeTab === "lab" ? "block" : "none",
          height: "100%",
        }}
      >
        <LabView onNavigateToStudio={(projectName) => handleRouteToStudio(projectName || '')} />
      </div>

      {/* PERSISTENT MOUNT: Keep FileSubView mounted across tab switching
          so user never loses active subtitle jobs, transcripts, or progress */}
      <div
        data-tab="file_sub"
        style={{
          display: activeTab === "file_sub" ? "block" : "none",
          height: "100%",
        }}
      >
        <FileSubView
          sttModels={sttModels}
          transModels={transModels}
          defaultSttModel={model}
          defaultTransModel={translationModel}
          initialFilePath={pendingFileSubPath}
        />
      </div>

      {/* PERSISTENT MOUNT: Keep DubbingStudioView mounted across tab switching
          so user never loses active multi-speaker dubbing jobs or audio clips */}
      <div
        data-tab="dubbing"
        style={{
          display: activeTab === "dubbing" ? "block" : "none",
          height: "100%",
        }}
      >
        <DubbingStudioView
          defaultSourceLang={language}
          initialFilePath={pendingDubbingPath}
        />
      </div>

      {activeTab === "live" && (
        <LiveView
          language={language}
          onLanguageChange={setLanguage}
          outputMode={outputMode}
          targetLang={targetLang}
          onDisplayModeChange={handleDisplayModeChange}
          chunkSeconds={chunkSeconds}
          onChunkSecondsChange={setChunkSeconds}
          vadEnabled={vadEnabled}
          onVadEnabledChange={setVadEnabled}
          devices={devices}
          selectedDevice={selectedDevice}
          onSelectedDeviceChange={setSelectedDevice}
          onReloadDevices={loadDevices}
          isLive={isLive}
          recentSubs={recentSubs}
          onClearRecentSubs={handleClearRecentSubs}
          onStartLive={handleStartLive}
          onStopLive={handleStopLive}
          onStatus={setStatus}
        />
      )}

      {(activeTab === "models" || activeTab === "overlay") && (
        <StudioShell
          left={
            <SettingsNav active={settingsSubtab} onChange={setSettingsSubtab} />
          }
          center={
            <div style={{ display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", height: "100%", paddingRight: 4 }}>
              {/* SUBTAB: PRESETS */}
              {settingsSubtab === "presets" && (
                <section className="settings-section">
                  {/* [UI_R2-8_REVIEW mục 18] Tiêu đề sentence case, bỏ ngoặc tiếng Anh. */}
                  <h2>Cấu hình theo máy</h2>
                  <p className="settings-help">
                    Bấm 1-click để Sublix tự động tối ưu mô hình nhận dạng, dịch và tăng tốc theo sức mạnh máy tính của bạn:
                  </p>

                  <div className="hardware-presets">
                    {/* Preset 1: CPU / Laptop */}
                    <div
                      className={`preset-card ${currentPreset === "cpu" ? "active" : ""}`}
                      onClick={() => applyHardwarePreset("cpu")}
                    >
                      <div className="preset-header">
                        <span className="preset-title">💻 Thuần CPU (Laptop / Văn Phòng)</span>
                        <span className="preset-tag">Pure CPU</span>
                        {currentPreset === "cpu" ? <span className="st-pill ok">Đang dùng</span> : null}
                      </div>
                      <div className="preset-desc">
                        Dành cho laptop mỏng nhẹ hoặc PC không có card đồ hoạ rời NVIDIA. Tiết kiệm RAM, máy mát và ổn định.
                      </div>
                      <div className="preset-specs">
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">STT Model:</span>
                          <span className="preset-spec-val">base (140MB)</span>
                        </div>
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">Dịch LLM:</span>
                          <span className="preset-spec-val">Qwen2.5-1.5B (1.1GB)</span>
                        </div>
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">Engine:</span>
                          <span className="preset-spec-val">CPU Multi-thread</span>
                        </div>
                      </div>
                    </div>

                    {/* Preset 2: GPU 4GB - 8GB */}
                    <div
                      className={`preset-card ${currentPreset === "gpu_mid" ? "active" : ""}`}
                      onClick={() => applyHardwarePreset("gpu_mid")}
                    >
                      <div className="preset-header">
                        <span className="preset-title">⚡ GPU Tầm Trung (4GB – 8GB VRAM)</span>
                        <span className="preset-tag">GTX / RTX Phổ Thông</span>
                        {currentPreset === "gpu_mid" ? <span className="st-pill ok">Đang dùng</span> : null}
                      </div>
                      <div className="preset-desc">
                        Phổ biến nhất (GTX 1650/1660, RTX 2060, 3050, 3060 6G, 4050/4060). STT nhanh ~0.1s, dịch tiếng Việt tự nhiên.
                      </div>
                      <div className="preset-specs">
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">STT Model:</span>
                          <span className="preset-spec-val">base (140MB)</span>
                        </div>
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">Dịch LLM:</span>
                          <span className="preset-spec-val">Qwen2.5-3B (2.0GB)</span>
                        </div>
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">Engine:</span>
                          <span className="preset-spec-val">NVIDIA CUDA GPU</span>
                        </div>
                      </div>
                    </div>

                    {/* Preset 3: GPU 12GB - 24GB */}
                    <div
                      className={`preset-card ${currentPreset === "gpu_high" ? "active" : ""}`}
                      onClick={() => applyHardwarePreset("gpu_high")}
                    >
                      <div className="preset-header">
                        <span className="preset-title">🚀 GPU Khủng (12GB – 24GB VRAM)</span>
                        <span className="preset-tag">RTX 3080/3090/4090</span>
                        {currentPreset === "gpu_high" ? <span className="st-pill ok">Đang dùng</span> : null}
                      </div>
                      <div className="preset-desc">
                        Tối ưu cho card đồ hoạ cao cấp (RTX 3060 12GB, 3080, 3090, 4080, 4090). Nhận diện Whisper Turbo Q8 + Qwen3 2026 đỉnh cao!
                      </div>
                      <div className="preset-specs">
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">STT Model:</span>
                          <span className="preset-spec-val">Large-v3-Turbo Q8 (874MB)</span>
                        </div>
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">Dịch LLM:</span>
                          <span className="preset-spec-val">Qwen3-4B (2.5GB)</span>
                        </div>
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">Engine:</span>
                          <span className="preset-spec-val">NVIDIA CUDA GPU</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preset 4: GPU tích hợp AMD (Radeon / Ryzen AI) */}
                  <div
                    className={`preset-card ${currentPreset === "amd_igpu" ? "active" : ""}`}
                    onClick={() => applyHardwarePreset("amd_igpu")}
                  >
                    <div>
                      <div className="preset-header">
                        <span className="preset-title">🔺 GPU Tích Hợp AMD (Radeon / Ryzen AI)</span>
                        <span className="preset-tag">AMD iGPU · Ollama ROCm</span>
                        {currentPreset === "amd_igpu" ? <span className="st-pill ok">Đang dùng</span> : null}
                      </div>
                      <div className="preset-desc">
                        Dành cho máy có GPU tích hợp AMD (Radeon 780M/890M, Ryzen AI Max, Radeon 8050S…). Whisper chạy CPU, còn phần dịch chạy qua <strong>Ollama</strong> — Ollama tự dùng ROCm/Vulkan trên iGPU nên nhanh hơn CPU khoảng 2×. Không cần card NVIDIA rời.
                      </div>
                      <div className="preset-specs">
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">STT Model:</span>
                          <span className="preset-spec-val">base (140MB) — CPU</span>
                        </div>
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">Dịch LLM:</span>
                          <span className="preset-spec-val">Ollama (Qwen3-4B ưu tiên) — iGPU</span>
                        </div>
                        <div className="preset-spec-item">
                          <span className="preset-spec-label">Engine:</span>
                          <span className="preset-spec-val">AMD iGPU qua Ollama (ROCm)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* SUBTAB: AI DỊCH & PHÂN VAI */}
              {/* SUBTAB: DỊCH THUẬT (R2-5 — hợp nhất 5 nhà cung cấp về 1 nơi) */}
              {settingsSubtab === "ai" && <TranslationSection ctx={settingsCtx} />}

              {/* SUBTAB: GIỌNG ĐỌC TTS (R2-5) */}
              {settingsSubtab === "tts" && <TtsSection ctx={settingsCtx} />}

              {/* SUBTAB: CHỦ ĐỀ (R2-5) */}
              {settingsSubtab === "theme" && <ThemeSection ctx={settingsCtx} />}

              {/* SUBTAB: NHẬT KÝ CẬP NHẬT */}
              {settingsSubtab === "changelog" && (
                <section className="settings-section st-card">
                  <div className="st-sec-head">
                    <h2>📝 Nhật ký cập nhật</h2>
                    <span className="st-hint">Phiên bản hiện tại: {appInfo?.version ?? "—"}</span>
                  </div>
                  <button type="button" className="settings-btn-primary" onClick={() => setShowChangelog(true)}>
                    Mở nhật ký cập nhật
                  </button>
                </section>
              )}

              {/* SUBTAB: NHẬN GIỌNG NÓI — STT (TSK-SETTINGS-MODELS) */}
              {settingsSubtab === "stt" && (
                <SttSection
                  sttEnginePref={sttEnginePref}
                  onSttEngineChange={(v) => void handleSttEngineChange(v)}
                  runtimeEngine={sttEngine}
                  serverStarting={sttServerStarting}
                  configReady={configLoaded}
                  lastCapture={lastCapture}
                  lastTranscript={lastTranscript}
                  lastTranslated={lastTranslatedTest}
                  onTestCapture={() => void handleTestCapture()}
                  onTranscribe={() => void handleTranscribe()}
                />
              )}

              {/* SUBTAB: OVERLAY */}
              {settingsSubtab === "overlay" && (
                <>
                  <section className="settings-section">
                    <h2>🎨 Tùy Biến Cửa Sổ Phụ Đề Nổi (Overlay Window)</h2>
                    <p className="settings-help">
                      Cửa sổ phụ đề luôn nổi trên cùng màn hình (Always-on-top), bạn có thể thoải mái kéo thả cửa sổ đến vị trí mong muốn trên video.
                    </p>

                    <div className="settings-row">
                      <label>Cỡ chữ (Font size):</label>
                      <input
                        type="range"
                        min={16}
                        max={36}
                        step={1}
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        onPointerUp={() => persistOverlayConfig({ overlay_font_size: fontSize })}
                        onKeyUp={() => persistOverlayConfig({ overlay_font_size: fontSize })}
                        className="settings-slider"
                      />
                      <span className="settings-slider-value">{fontSize}px</span>
                    </div>

                    <div className="settings-row">
                      <label>Độ trong suốt nền:</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={bgOpacity}
                        onChange={(e) => setBgOpacity(Number(e.target.value))}
                        onPointerUp={() => persistOverlayConfig({ overlay_bg_opacity: bgOpacity })}
                        onKeyUp={() => persistOverlayConfig({ overlay_bg_opacity: bgOpacity })}
                        className="settings-slider"
                      />
                      <span className="settings-slider-value">{bgOpacity}%</span>
                    </div>

                    <div className="settings-row">
                      <label>Màu chữ phụ đề:</label>
                      <div className="theme-switch">
                        {([
                          { id: "white", label: "Trắng", dot: "#ffffff" },
                          { id: "yellow", label: "Vàng", dot: "#ffdf6b" },
                          { id: "amber", label: "Cam ấm", dot: "#ffb454" },
                        ]).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={`theme-chip ${textColor === c.id ? "active" : ""}`}
                            onClick={() => {
                              setTextColor(c.id);
                              persistOverlayConfig({ overlay_text_color: c.id });
                            }}
                          >
                            <span className="theme-chip-dot" style={{ background: c.dot }} />
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="settings-row" style={{ gap: 20, marginTop: 10 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={showOriginal}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setShowOriginal(v);
                            persistOverlayConfig({ overlay_show_original: v });
                          }}
                        />
                        <span>🌐 Hiển thị dòng gốc song ngữ (Bilingual Line)</span>
                      </label>
                    </div>

                    <div className="settings-row" style={{ gap: 20, marginTop: 10 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={clickThrough}
                          onChange={async (e) => {
                            const v = e.target.checked;
                            setClickThrough(v);
                            try {
                              const cfg = await sublix.setOverlayClickThrough(v);
                              setFullConfig(cfg);
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                        />
                        <span>🔒 Chế độ xuyên thấu chuột (Click-through - Click chuột xuyên qua video bên dưới)</span>
                      </label>
                    </div>

                    <div className="settings-row" style={{ marginTop: 16, gap: 10 }}>
                      <button
                        type="button"
                        className="settings-btn-primary"
                        onClick={() => sublix.showOverlay()}
                        title="Phím tắt: Ctrl+Shift+O"
                      >
                        <IconEye size={13} /> Hiện Cửa Sổ Overlay
                      </button>
                      <button
                        type="button"
                        className="settings-btn-secondary"
                        onClick={() => sublix.hideOverlay()}
                        title="Phím tắt: Ctrl+Shift+O"
                      >
                        <IconEyeOff size={13} /> Ẩn Cửa Sổ Overlay
                      </button>
                    </div>
                  </section>

                  {/* Overlay Live Preview Card */}
                  <section className="settings-section">
                    <h2>👀 Xem Trước Mẫu Phụ Đề (Preview)</h2>
                    <p className="settings-help">Preview hiển thị đúng cài đặt thật: cỡ chữ, màu chữ và độ trong suốt nền.</p>
                    <div
                      style={{
                        padding: "28px 24px",
                        background: "linear-gradient(135deg, #1c2433, #0d1017)",
                        borderRadius: 8,
                        border: "1px dashed var(--line)",
                        marginTop: 8,
                      }}
                    >
                      <div
                        style={{
                          background: `rgba(20, 20, 25, ${Math.min(100, bgOpacity) / 100})`,
                          borderRadius: 8,
                          padding: "10px 18px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <div
                          style={{
                            fontSize: fontSize,
                            fontWeight: 600,
                            color: textColor === "yellow" ? "#ffdf6b" : textColor === "amber" ? "#ffb454" : "rgba(255, 255, 255, 0.98)",
                            textShadow: "0 2px 4px rgba(0,0,0,0.8), 0 0 2px #000",
                            textAlign: "center",
                          }}
                        >
                          Đây là đoạn phụ đề mẫu hiển thị trên màn hình của bạn.
                        </div>
                        {showOriginal && (
                          <div
                            style={{
                              fontSize: Math.max(12, Math.round(fontSize * 0.62)),
                              color: "rgba(255, 255, 255, 0.55)",
                              fontStyle: "italic",
                              textAlign: "center",
                            }}
                          >
                            これは字幕のサンプルテキストです。
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </>
              )}

              {/* SUBTAB: MODELS HUB */}
              {settingsSubtab === "models_hub" && (
                <section className="settings-section">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2>📦 Trung Tâm Tải & Quản Lý Models (Model Catalog & Download Hub)</h2>
                    <button
                      onClick={() => sublix.openModelsFolder()}
                      className="settings-btn-secondary"
                      style={{ fontSize: 11, padding: "4px 10px" }}
                    >
                      📁 Mở Thư Mục Models
                    </button>
                  </div>
                  <p className="settings-help">
                    Tải trực tiếp bất kỳ model nào bên dưới với 1 click. Thanh tiến trình % hiển thị trực tiếp theo thời gian thực:
                  </p>
                  <img className="spot-ill" src={spotModelsUrl} alt="" />

                  {/* STT Models Table */}
                  <h3 style={{ fontSize: 13, color: "#93c5fd", margin: "14px 0 6px" }}>🎤 Whisper STT Models (Nhận diện giọng nói)</h3>
                  <table className="model-hub-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Đề xuất</th>
                        <th>Dung lượng</th>
                        <th>Trạng thái / Tải về</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sttModels.map((m) => {
                        const prog = downloadProgress[m.name];
                        const isDownloading = downloadingModel === m.name || (prog && prog.percent < 100 && prog.phase !== "done" && prog.phase !== "error");
                        const tierBadge =
                          m.name === "tiny" || m.name === "base"
                            ? { label: "💻 CPU / Laptop", cls: "tier-cpu" }
                            : m.name === "small"
                            ? { label: "⚡ GPU 4-8GB", cls: "tier-gpu-mid" }
                            : { label: "🚀 GPU 8-24GB", cls: "tier-gpu-high" };

                        return (
                          <tr key={m.name} className="model-hub-row">
                            <td>
                              <div className="model-name-col">
                                <span className="model-main-name">{m.name}</span>
                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{m.label.split("—")[1] ?? ""}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`model-tier-badge ${tierBadge.cls}`}>{tierBadge.label}</span>
                            </td>
                            <td>~{m.size_mb} MB</td>
                            <td>
                              {isDownloading ? (
                                <div className="model-progress-box">
                                  <div className="model-progress-label">
                                    <span>⏳ Đang tải...</span>
                                    <span>{prog?.percent ?? 0}%</span>
                                  </div>
                                  <div className="model-progress-track">
                                    <div className="model-progress-fill" style={{ width: `${prog?.percent ?? 0}%` }} />
                                  </div>
                                </div>
                              ) : m.downloaded ? (
                                <span className="model-status-ready">✓ Đã sẵn sàng</span>
                              ) : (
                                <button
                                  className="model-dl-btn"
                                  onClick={() => handleDownloadStt(m.name, m.size_mb)}
                                  disabled={downloadingModel !== null}
                                >
                                  ⬇ Tải về
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Translation LLM Models Table */}
                  <h3 style={{ fontSize: 13, color: "#a78bfa", margin: "18px 0 6px" }}>🌐 Translation LLM Models (Mô hình dịch ngôn ngữ)</h3>
                  <table className="model-hub-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Đề xuất</th>
                        <th>Dung lượng</th>
                        <th>Trạng thái / Tải về</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transModels.map((m) => {
                        const prog = downloadProgress[m.name];
                        const isDownloading = downloadingModel === m.name || (prog && prog.percent < 100 && prog.phase !== "done" && prog.phase !== "error");
                        const tierBadge =
                          m.name === "qwen2.5-1.5b"
                            ? { label: "💻 CPU / Laptop", cls: "tier-cpu" }
                            : m.name === "qwen2.5-3b"
                            ? { label: "⚡ GPU 4-8GB", cls: "tier-gpu-mid" }
                            : { label: "🚀 GPU 8-24GB", cls: "tier-gpu-high" };

                        return (
                          <tr key={m.name} className="model-hub-row">
                            <td>
                              <div className="model-name-col">
                                <span className="model-main-name">{m.name}</span>
                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{m.label.split("—")[1] ?? ""}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`model-tier-badge ${tierBadge.cls}`}>{tierBadge.label}</span>
                            </td>
                            <td>~{m.size_mb} MB</td>
                            <td>
                              {isDownloading ? (
                                <div className="model-progress-box">
                                  <div className="model-progress-label">
                                    <span>⏳ Đang tải...</span>
                                    <span>{prog?.percent ?? 0}%</span>
                                  </div>
                                  <div className="model-progress-track">
                                    <div className="model-progress-fill" style={{ width: `${prog?.percent ?? 0}%` }} />
                                  </div>
                                </div>
                              ) : m.downloaded ? (
                                <span className="model-status-ready">✓ Đã sẵn sàng</span>
                              ) : (
                                <button
                                  className="model-dl-btn"
                                  onClick={() => handleDownloadTrans(m.name, m.size_mb)}
                                  disabled={downloadingModel !== null}
                                >
                                  ⬇ Tải về
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* TTS Voice Models Table */}
                  <h3 style={{ fontSize: 13, color: "#34d399", margin: "18px 0 6px" }}>🎙️ Text-to-Speech (TTS) Voice Models (Mô hình Lồng tiếng & Giọng đọc AI)</h3>
                  <table className="model-hub-table">
                    <thead>
                      <tr>
                        <th>Mô Hình / Động Cơ</th>
                        <th>Đề xuất & Phong cách</th>
                        <th>Dung lượng / Kiểu chạy</th>
                        <th>Trạng thái / Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="model-hub-row">
                        <td>
                          <div className="model-name-col">
                            <span className="model-main-name">🌟 VietNeu TTS AI</span>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>NeuTTS-Air v2 • Vietnamese Expressive</span>
                          </div>
                        </td>
                        <td>
                          <span className="model-tier-badge tier-gpu-mid" style={{ background: "rgba(56, 189, 248, 0.2)", color: "#7dd3fc", borderColor: "rgba(56, 189, 248, 0.4)" }}>
                            🚀 Đề xuất cao nhất (Truyền cảm)
                          </span>
                        </td>
                        <td>Tích hợp sẵn (Neural Engine)</td>
                        <td>
                          <span className="model-status-ready">✓ Đã sẵn sàng (6 giọng Việt)</span>
                        </td>
                      </tr>
                      <tr className="model-hub-row">
                        <td>
                          <div className="model-name-col">
                            <span className="model-main-name">🎙️ Kokoro-Vietnamese AI</span>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Kokoro-82M ONNX • Local Speech Engine</span>
                          </div>
                        </td>
                        <td>
                          <span className="model-tier-badge tier-cpu">
                            💻 Offline 100% (CPU/GPU nhẹ)
                          </span>
                        </td>
                        <td>~82 MB (ONNX Weights)</td>
                        <td>
                          <span className="model-status-ready">✓ Sẵn sàng (14 giọng Việt)</span>
                        </td>
                      </tr>
                      <tr className="model-hub-row">
                        <td>
                          <div className="model-name-col">
                            <span className="model-main-name">🌐 Microsoft Edge-TTS Neural</span>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Azure Neural Voice • Broadcast Standard</span>
                          </div>
                        </td>
                        <td>
                          <span className="model-tier-badge tier-gpu-high" style={{ background: "rgba(168, 85, 247, 0.2)", color: "#d8b4fe", borderColor: "rgba(168, 85, 247, 0.4)" }}>
                            📻 Phát thanh viên (Trực tuyến)
                          </span>
                        </td>
                        <td>Cloud Service (0 MB disk)</td>
                        <td>
                          <span className="model-status-ready">✓ Trực tuyến 24/7 (Đa ngôn ngữ)</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              )}
            </div>
          }
          right={<SystemStatusPanel ctx={settingsCtx} />}
        />
      )}

      {activeTab === "history" && (
        <HistoryView
          items={recentSubs}
          search={historySearch}
          onSearchChange={setHistorySearch}
          selectedId={selectedHistorySub?.id ?? null}
          onSelect={setSelectedHistorySub}
          isLive={isLive}
          onClearAll={handleClearHistory}
          onStatus={setStatus}
        />
      )}

      {activeTab === "process" && (
        <ProcessCenterView
          activeTasks={Object.values(globalTasks)}
          historyTasks={processHistory}
          onNavigateToTab={(t) => setActiveTab((t === "file_sub" || t === "dubbing") ? "studio" : (t as any))}
          onClearHistory={handleClearProcessHistory}
          onOpenStudioTask={handleOpenStudioTask}
          sttServerEngine={sttServerEngine}
          transEnginePref={transEnginePref}
        />
      )}
        </div>
      </main>

      {/* Floating Background Task Toast (shown when a job is running and user is on another tab) */}
      {(() => {
        const primaryTask = Object.values(globalTasks).find(
          (t) => t.status === "running" && t.targetTab !== activeTab
        );
        if (!primaryTask) return null;
        const iconSymbol =
          primaryTask.workflowType === "subtitle_only"
            ? "💬"
            : primaryTask.workflowType === "subtitle_translate"
            ? "🌐"
            : primaryTask.type === "downloader"
            ? "⬇️"
            : primaryTask.type === "model"
            ? "📦"
            : "🎬";
        return (
          <div
            className="floating-task-toast"
            onClick={() => {
              if (primaryTask.targetTab === "studio" && primaryTask.tabId) {
                handleOpenStudioTask({ tabId: primaryTask.tabId, sourcePath: primaryTask.sourcePath });
                return;
              }
              setActiveTab((primaryTask.targetTab === "file_sub" || primaryTask.targetTab === "dubbing") ? "studio" : primaryTask.targetTab);
            }}
            title="Bấm để chuyển ngay đến tab đang xử lý"
          >
            <div className="floating-task-toast-icon">{iconSymbol}</div>
            <div className="floating-task-toast-info">
              <div className="floating-task-toast-title">
                {primaryTask.title} — {primaryTask.percent.toFixed(0)}%
              </div>
              <div className="floating-task-toast-stage">
                {primaryTask.fileName ? `📁 ${primaryTask.fileName} • ` : ""}{primaryTask.stage}
              </div>
            </div>
            <button
              type="button"
              className="floating-task-toast-btn"
              onClick={(e) => {
                e.stopPropagation();
                // TSK-UI-REDESIGN-R2-7C (TL-14): đi thẳng sang tab "Tiến trình"
                // thay vì mở modal (đã bỏ — chỉ còn 1 giao diện).
                setActiveTab("process");
              }}
            >
              Mở Tiến Trình
            </button>
          </div>
        );
      })()}

      {discoveryStudioToasts.length > 0 && (
        <DiscoveryToast
          items={discoveryStudioToasts}
          onOpenStudio={handleOpenToastStudio}
          onClose={handleCloseToastStudio}
        />
      )}

      <ChangelogModal
        isOpen={showChangelog}
        onClose={() => setShowChangelog(false)}
        currentVersion={`v${appInfo?.version ?? APP_VERSION_PKG}`}
        currentTheme={theme}
        onThemeChange={handleThemeChange}
      />
    </div>
  );
}
