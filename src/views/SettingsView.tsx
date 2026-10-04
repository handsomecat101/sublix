//! Settings window — main control panel for Sublix v0.5.0.
//!
//! Features:
//! - Audio device picker + 1-second multi-device volume scanner
//! - Continuous Live Capture with Smart VAD (Voice Activity Endpointing)
//! - 2026 Whisper STT models (Large-v3-Turbo Q8 / FP16) + 1-click model downloader + hot-swap GPU/CPU server
//! - 2026 Local LLM Translation models (Qwen3-4B-Instruct-2507, Gemma-3-4B-IT, Qwen3-8B, Qwen2.5) + hot-swap GPU/CPU server
//! - Overlay appearance controls (font size, bilingual original line, click-through mode)

import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  sublix,
  type AppConfig,
  type AudioDevice,
  type ModelStatusItem,
  type ModelDownloadProgress,
} from "../lib/tauri";
import FileSubView from "./FileSubView";
import DubbingStudioView from "./DubbingStudioView";
import DownloaderView from "./DownloaderView";
import { ChangelogModal } from "./ChangelogModal";
import {
  IconFilm, IconClapper, IconMic, IconBox, IconClock, IconPanel,
  IconSparkles, IconFileText, IconFolder, IconEye, IconEyeOff, IconCpu, IconZap,
  IconPlay, IconStop, IconGlobe,
} from "../icons";
import logoUrl from "../assets/logo.png";
import spotHistoryUrl from "../assets/spot-history.jpg";
import spotModelsUrl from "../assets/spot-models.jpg";
import "./SettingsView.css";

type Status =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

type HardwarePreset = "cpu" | "gpu_mid" | "gpu_high";

interface LiveSubPreview {
  id: number;
  text: string;
  original?: string;
  timestamp?: number;
  audio_duration?: number;
  stt_duration?: number;
  translate_duration?: number;
}

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

  const [audioTest, setAudioTest] = useState<{
    device_name: string;
    file_size_bytes: number;
    peak_volume: number;
    rms_volume: number;
    has_audio: boolean;
  } | null>(null);
  const [deviceLevels, setDeviceLevels] = useState<Array<{
    index: number;
    name: string;
    peak_volume: number;
    has_audio: boolean;
    error: string | null;
  }> | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
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
  const [activeTab, setActiveTab] = useState<"downloader" | "file_sub" | "dubbing" | "live" | "models" | "history" | "overlay">("downloader");
  const [pendingFileSubPath, setPendingFileSubPath] = useState<string>("");
  const [pendingDubbingPath, setPendingDubbingPath] = useState<string>("");

  const handleRouteToFileSub = (path: string) => {
    setPendingFileSubPath(path);
    setActiveTab("file_sub");
  };

  const handleRouteToDubbing = (path: string) => {
    setPendingDubbingPath(path);
    setActiveTab("dubbing");
  };
  const [historySearch, setHistorySearch] = useState<string>("");
  const [overlayVisible, setOverlayVisible] = useState<boolean>(true);
  const [theme, setTheme] = useState<string>("cinema");
  const [bgOpacity, setBgOpacity] = useState<number>(85);
  const [textColor, setTextColor] = useState<string>("white");
  const [showChangelog, setShowChangelog] = useState<boolean>(false);

  // Translation provider settings (MiniMax Cloud / Ollama Local / Embedded GGUF)
  const [transProvider, setTransProvider] = useState<"local" | "ollama" | "minimax">("local");
  const [minimaxKey, setMinimaxKey] = useState<string>("");
  const [minimaxModel, setMinimaxModel] = useState<string>("MiniMax-M3");
  const [ollamaUrl, setOllamaUrl] = useState<string>("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState<string>("smtek/qwen3.8-27b:q4_k_m");
  const [showMinimaxKey, setShowMinimaxKey] = useState<boolean>(false);
  const [providerTesting, setProviderTesting] = useState<boolean>(false);
  const [providerTestResult, setProviderTestResult] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
    refreshSetup();
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
      if (cfg.translation_provider === "local" || cfg.translation_provider === "ollama" || cfg.translation_provider === "minimax") {
        setTransProvider(cfg.translation_provider);
      }
      if (cfg.minimax_api_key) setMinimaxKey(cfg.minimax_api_key);
      if (cfg.minimax_model) setMinimaxModel(cfg.minimax_model);
      if (cfg.ollama_url) setOllamaUrl(cfg.ollama_url);
      if (cfg.ollama_model) setOllamaModel(cfg.ollama_model);
      setConfigLoaded(true);
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
        },
      }));
      if (p.percent === 100 || p.phase === "done") {
        refreshSetup();
      }
    });

    return () => {
      pStatus.then((u) => u()).catch(() => {});
      pSub.then((u) => u()).catch(() => {});
      pProgress.then((u) => u()).catch(() => {});
    };
  }, []);

  async function refreshSetup() {
    try {
      const s = await sublix.checkSetup();
      setSttModels(s.stt_models);
      setTransModels(s.translation_models ?? []);
    } catch (e) {
      console.error("checkSetup failed:", e);
    }
  }

  async function loadDevices() {
    try {
      const list = await sublix.listDevices();
      setDevices(list);
      if (list.length === 0) {
        setStatus({ kind: "error", message: "No audio devices found" });
      }
    } catch (e) {
      setStatus({ kind: "error", message: `Failed to list devices: ${e}` });
    }
  }

  const liveBusyRef = useRef(false);

  async function handleStartLive() {
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
  }

  async function handleStopLive() {
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
  }

  // Hotkeys while the app has focus: Ctrl+Shift+L = toggle live, Ctrl+Shift+O = toggle overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "l") {
        e.preventDefault();
        if (isLive) void handleStopLive();
        else void handleStartLive();
      } else if (k === "o") {
        e.preventDefault();
        if (overlayVisible) {
          sublix.hideOverlay().then(() => setOverlayVisible(false)).catch(() => {});
        } else {
          sublix.showOverlay().then(() => setOverlayVisible(true)).catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, overlayVisible]);

  async function persistOverlayConfig(patch: Partial<AppConfig>) {
    if (!fullConfig) return;
    const updated: AppConfig = {
      ...fullConfig,
      stt_model: model,
      translation_model: translationModel,
      source_lang: language,
      target_lang: targetLang,
      output_mode: outputMode,
      chunk_seconds: chunkSeconds,
      vad_enabled: vadEnabled,
      ...patch,
    };
    setFullConfig(updated);
    try {
      await sublix.saveConfig(updated);
    } catch (e) {
      console.error("saveConfig failed:", e);
    }
  }

  async function handleThemeChange(next: string) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    if (!fullConfig) return;
    const updated: AppConfig = { ...fullConfig, theme: next };
    setFullConfig(updated);
    try {
      await sublix.saveConfig(updated);
    } catch (e) {
      console.error("saveConfig failed:", e);
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

  async function handleProviderChange(provider: "local" | "ollama" | "minimax") {
    setTransProvider(provider);
    if (fullConfig) {
      const updated: AppConfig = {
        ...fullConfig,
        translation_provider: provider,
        minimax_api_key: minimaxKey,
        minimax_model: minimaxModel,
        ollama_url: ollamaUrl,
        ollama_model: ollamaModel,
      };
      try {
        const saved = await sublix.saveConfig(updated);
        setFullConfig(saved);
        setStatus({
          kind: "success",
          message: `✅ Đã chuyển bộ dịch sang: ${
            provider === "minimax"
              ? "🌐 MiniMax Cloud API (Unlimited)"
              : provider === "ollama"
              ? "🦙 Ollama Local (Qwen 27B)"
              : "💻 Local GGUF (llama-server)"
          }`,
        });
      } catch (err) {
        setStatus({ kind: "error", message: `Lưu cấu hình thất bại: ${err}` });
      }
    }
  }

  async function saveProviderSettings() {
    if (fullConfig) {
      const updated: AppConfig = {
        ...fullConfig,
        translation_provider: transProvider,
        minimax_api_key: minimaxKey,
        minimax_model: minimaxModel,
        ollama_url: ollamaUrl,
        ollama_model: ollamaModel,
      };
      try {
        const saved = await sublix.saveConfig(updated);
        setFullConfig(saved);
        setStatus({ kind: "success", message: "✅ Đã lưu cấu hình bộ dịch thành công!" });
      } catch (err) {
        setStatus({ kind: "error", message: `Lưu cấu hình thất bại: ${err}` });
      }
    }
  }

  async function testProviderTranslation() {
    setProviderTesting(true);
    setProviderTestResult(null);
    try {
      if (fullConfig) {
        await sublix.saveConfig({
          ...fullConfig,
          translation_provider: transProvider,
          minimax_api_key: minimaxKey,
          minimax_model: minimaxModel,
          ollama_url: ollamaUrl,
          ollama_model: ollamaModel,
        });
      }
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

  async function applyHardwarePreset(preset: HardwarePreset) {
    if (preset === "cpu") {
      const stt = "base";
      const trans = "qwen2.5-1.5b";
      setModel(stt);
      setTranslationModel(trans);
      setSttEnginePref("cpu");
      setTransEnginePref("cpu");
      if (fullConfig) {
        const updated = {
          ...fullConfig,
          stt_model: stt,
          translation_model: trans,
          stt_engine_preference: "cpu",
          translation_engine_preference: "cpu",
        };
        setFullConfig(updated);
        sublix.saveConfig(updated).catch(console.error);
      }
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
      if (fullConfig) {
        const updated = {
          ...fullConfig,
          stt_model: stt,
          translation_model: trans,
          stt_engine_preference: "cuda",
          translation_engine_preference: "cuda",
        };
        setFullConfig(updated);
        sublix.saveConfig(updated).catch(console.error);
      }
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
      if (fullConfig) {
        const updated = {
          ...fullConfig,
          stt_model: stt,
          translation_model: trans,
          stt_engine_preference: "cuda",
          translation_engine_preference: "cuda",
        };
        setFullConfig(updated);
        sublix.saveConfig(updated).catch(console.error);
      }
      setStatus({
        kind: "success",
        message: "🚀 Đã chọn cấu hình GPU Khủng (12GB - 24GB VRAM). Tối ưu RTX 3080/3090, 4080/4090 cho chất lượng tối đa!",
      });
    }
  }

  const currentPreset: HardwarePreset | null =
    sttEnginePref === "cpu" && transEnginePref === "cpu" && (model === "base" || model === "tiny") && translationModel === "qwen2.5-1.5b"
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

  const filteredHistory = recentSubs.filter((item) => {
    if (!historySearch.trim()) return true;
    const term = historySearch.toLowerCase();
    return (
      item.text.toLowerCase().includes(term) ||
      (item.original && item.original.toLowerCase().includes(term))
    );
  });

  const handleCopyHistory = () => {
    if (recentSubs.length === 0) return;
    const text = recentSubs
      .slice()
      .reverse()
      .map((s) => (s.original ? `[Gốc] ${s.original}\n[Dịch] ${s.text}\n` : `${s.text}\n`))
      .join("\n");
    navigator.clipboard.writeText(text);
    setStatus({ kind: "success", message: `📋 Đã sao chép ${recentSubs.length} câu vào Clipboard!` });
  };

  const handleExportTxt = () => {
    if (recentSubs.length === 0) return;
    const text = recentSubs
      .slice()
      .reverse()
      .map((s) => (s.original ? `${s.original}\n${s.text}\n` : `${s.text}\n`))
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sublix-transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: "success", message: "💾 Đã xuất file văn bản .txt thành công!" });
  };

  const handleExportSrt = () => {
    if (recentSubs.length === 0) return;
    let srt = "";
    const items = recentSubs.slice().reverse();
    const firstTs = items[0].timestamp ?? 0;

    const formatTime = (ms: number) => {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      const millis = ms % 1000;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
    };

    items.forEach((s, idx) => {
      let startMs = 0;
      let endMs = 0;
      if (firstTs > 0 && s.timestamp) {
        startMs = Math.max(0, s.timestamp - firstTs);
        const durMs = Math.round((s.audio_duration ?? 2.5) * 1000);
        endMs = startMs + Math.max(1000, durMs);
      } else {
        startMs = idx * 3000;
        endMs = startMs + 2800;
      }

      srt += `${idx + 1}\n`;
      srt += `${formatTime(startMs)} --> ${formatTime(endMs)}\n`;
      if (s.original) {
        srt += `${s.original}\n`;
      }
      srt += `${s.text}\n\n`;
    });
    // Add UTF-8 BOM so legacy media players / Notepad render Vietnamese properly
    const blob = new Blob(["\uFEFF" + srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sublix-subtitles-${new Date().toISOString().slice(0, 10)}.srt`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: "success", message: `🎬 Đã xuất file phụ đề chuẩn .srt (${items.length} câu) thành công!` });
  };

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

  const selectedSttInfo = sttModels.find((m) => m.name === model);
  const selectedTransInfo = transModels.find((m) => m.name === translationModel);

  return (
    <div className="app-shell">
      {/* LEFT SIDEBAR */}
      <aside className="app-sidebar">
        <div className="sidebar-top">
          {/* Brand */}
          <div className="sidebar-brand">
            <img className="sidebar-brand-icon" src={logoUrl} alt="Sublix" />
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-title">
                Sublix{" "}
                <button
                  type="button"
                  className="sidebar-version-badge clickable"
                  onClick={() => setShowChangelog(true)}
                  title="Bấm để xem chi tiết cập nhật & tính năng mới (Changelog)"
                >
                  v{appInfo?.version ?? "0.8.0"}
                </button>
              </span>
              <span className="sidebar-brand-slogan">Local AI Subtitle Studio</span>
            </div>
          </div>

          {/* Hardware Status Pill */}
          <div className="sidebar-hw-pill">
            <span className="sidebar-hw-pill-icon">
              {sttServerEngine === "cuda" || engine === "cuda" ? <IconZap size={14} /> : <IconCpu size={14} />}
            </span>
            <div className="sidebar-hw-pill-info">
              <span className="sidebar-hw-pill-title">
                {sttServerEngine === "cuda" || engine === "cuda" ? "NVIDIA CUDA GPU" : "CPU Đa Luồng"}
              </span>
              <span className="sidebar-hw-pill-sub">
                {sttServerEngine === "cuda" || engine === "cuda" ? "Tăng tốc phần cứng" : "Mọi PC / Laptop"}
              </span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="sidebar-nav">
            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === "downloader" ? "active" : ""}`}
              onClick={() => setActiveTab("downloader")}
            >
              <IconGlobe className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">Tải Video Đa Nền Tảng</span>
              <span style={{ fontSize: 9, background: "#ef4444", color: "#fff", padding: "1px 5px", borderRadius: 3, marginLeft: "auto", fontWeight: 700 }}>HOT</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === "file_sub" ? "active" : ""}`}
              onClick={() => setActiveTab("file_sub")}
            >
              <IconFilm className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">Tạo Phụ Đề File</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === "dubbing" ? "active" : ""}`}
              onClick={() => setActiveTab("dubbing")}
            >
              <IconClapper className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">Studio Lồng Tiếng AI</span>
              <span style={{ fontSize: 9, background: "#8b5cf6", color: "#fff", padding: "1px 5px", borderRadius: 3, marginLeft: "auto", fontWeight: 700 }}>NEW</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === "live" ? "active" : ""}`}
              onClick={() => setActiveTab("live")}
            >
              <IconMic className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">Dịch Trực Tiếp Live</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === "models" ? "active" : ""}`}
              onClick={() => setActiveTab("models")}
            >
              <IconBox className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">Mô Hình & Cấu Hình</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === "history" ? "active" : ""}`}
              onClick={() => setActiveTab("history")}
            >
              <IconClock className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">Lịch Sử Lời Thoại</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === "overlay" ? "active" : ""}`}
              onClick={() => setActiveTab("overlay")}
            >
              <IconPanel className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">Kiểu Dáng Overlay</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-theme-row" title="Đổi giao diện (Theme)">
            {([
              { id: "cinema", label: "Rạp phim", dot: "#e8a33d" },
              { id: "studio", label: "Phòng dựng", dot: "#2dd4bf" },
              { id: "light", label: "Sáng nhẹ", dot: "#b45309" },
              { id: "vibrant", label: "Vibrant", dot: "#e11d48" },
            ]).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`sidebar-theme-dot ${theme === t.id ? "active" : ""}`}
                style={{ background: t.dot }}
                title={t.label}
                onClick={() => handleThemeChange(t.id)}
              />
            ))}
          </div>
          <button
            type="button"
            className="sidebar-quick-btn"
            title="Phím tắt: Ctrl+Shift+O"
            onClick={async () => {
              if (overlayVisible) {
                await sublix.hideOverlay();
                setOverlayVisible(false);
              } else {
                await sublix.showOverlay();
                setOverlayVisible(true);
              }
            }}
          >
            {overlayVisible ? <IconEyeOff size={13} /> : <IconEye size={13} />}
            {overlayVisible ? "Ẩn Cửa Sổ Overlay" : "Hiện Cửa Sổ Overlay"}
          </button>
          <button
            type="button"
            className="sidebar-quick-btn"
            onClick={() => sublix.openModelsFolder()}
          >
            <IconFolder size={13} /> Mở Thư Mục Models
          </button>
          <button
            type="button"
            className="sidebar-quick-btn changelog-btn"
            onClick={() => setShowChangelog(true)}
          >
            <IconFileText size={13} /> Nhật Ký Cập Nhật (v{appInfo?.version ?? "0.8.0"})
          </button>
        </div>
      </aside>

      {/* RIGHT MAIN WORKSPACE */}
      <main className="app-main">
        {/* Topbar */}
        <div className="main-topbar">
          <div className="main-topbar-title">
            {activeTab === "downloader" && <><IconGlobe size={15} /> Tải Video Đa Nền Tảng (YouTube, TikTok, Douyin, Bilibili, Facebook...)</>}
            {activeTab === "file_sub" && <><IconFilm size={15} /> Tạo Phụ Đề Cho File Media (Video / Audio)</>}
            {activeTab === "dubbing" && <><IconClapper size={15} /> Studio Lồng Tiếng AI Đa Vai (Diarization + Neural TTS)</>}
            {activeTab === "live" && <><IconMic size={15} /> Dịch Phụ Đề Trực Tiếp Thời Gian Thực (Live Stream)</>}
            {activeTab === "models" && <><IconBox size={15} /> Quản Lý Mô Hình AI & Bộ Cấu Hình Phần Cứng</>}
            {activeTab === "history" && <><IconClock size={15} /> Lịch Sử Lời Thoại & Xuất File Phụ Đề</>}
            {activeTab === "overlay" && <><IconPanel size={15} /> Tùy Biến Giao Diện & Kiểu Dáng Cửa Sổ Phụ Đề</>}
          </div>

          <div className="main-topbar-actions">
            <button
              type="button"
              className="topbar-changelog-btn"
              onClick={() => setShowChangelog(true)}
              title="Bấm để xem các tính năng mới trong v0.8.0"
            >
              <IconSparkles size={13} /> v{appInfo?.version ?? "0.8.0"} Changelog
            </button>
            <div className={`main-topbar-status status-${status.kind}`}>
              {status.kind === "idle" && (isLive ? "🔴 Đang bắt âm thanh & dịch..." : "✓ Sẵn sàng")}
              {status.kind === "working" && `⏳ ${status.message}`}
              {status.kind === "error" && `⚠ ${status.message}`}
              {status.kind === "success" && `✓ ${status.message}`}
            </div>
          </div>
        </div>

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
          onNavigateToFileSub={handleRouteToFileSub}
          onNavigateToDubbing={handleRouteToDubbing}
        />
      </div>

      {activeTab === "file_sub" && (
        <FileSubView
          sttModels={sttModels}
          transModels={transModels}
          defaultSttModel={model}
          defaultTransModel={translationModel}
          initialFilePath={pendingFileSubPath}
        />
      )}

      {activeTab === "dubbing" && (
        <DubbingStudioView
          defaultSourceLang={language}
          initialFilePath={pendingDubbingPath}
        />
      )}

      {activeTab === "live" && (
        <>
          {/* SECTION 1: LIVE CAPTURE */}
          <section className="settings-section">
        <h2>🎬 Live Subtitle Stream (Zero-Gap + Smart VAD)</h2>
        <p className="settings-help">
          Continuously captures system audio without gaps, slices phrases at natural pauses,
          transcribes with GPU Whisper, and translates with GPU LLM into the floating overlay.
        </p>

        <div className="settings-row">
          <label>Source lang:</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="settings-select"
          >
            <option value="ja">🇯🇵 Japanese (Phim / Anime / Video Nhật)</option>
            <option value="en">🇺🇸 English (YouTube / Course / Meeting)</option>
            <option value="zh">🇨🇳 Chinese (Phim / Video Trung)</option>
            <option value="ko">🇰🇷 Korean (Phim / Video Hàn)</option>
            <option value="auto">🌐 Auto-detect language</option>
          </select>
        </div>

        <div className="settings-row">
          <label>Output mode:</label>
          <select
            value={outputMode}
            onChange={(e) => setOutputMode(e.target.value as "original" | "translated")}
            className="settings-select"
          >
            <option value="translated">🌐 Translate to Target Language (Recommended)</option>
            <option value="original">📝 Original transcript only (No translation)</option>
          </select>
        </div>

        {outputMode === "translated" && (
          <div className="settings-row">
            <label>Target lang:</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="settings-select"
            >
              <option value="vi">🇻🇳 Tiếng Việt (Vietnamese)</option>
              <option value="en">🇺🇸 English</option>
              <option value="ja">🇯🇵 Japanese</option>
              <option value="zh">🇨🇳 Chinese</option>
              <option value="ko">🇰🇷 Korean</option>
            </select>
          </div>
        )}

        <div className="settings-row">
          <label>Max chunk:</label>
          <input
            type="range"
            min={2}
            max={8}
            step={1}
            value={chunkSeconds}
            onChange={(e) => setChunkSeconds(Number(e.target.value))}
            className="settings-slider"
          />
          <span className="settings-slider-value">{chunkSeconds}s</span>
          <label style={{ marginLeft: 16, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={vadEnabled}
              onChange={(e) => setVadEnabled(e.target.checked)}
            />
            <span>✂️ Smart VAD (Cut on natural speech pause)</span>
          </label>
        </div>

        <div className="settings-row" style={{ marginTop: 10 }}>
          {!isLive ? (
            <button
              onClick={handleStartLive}
              className="settings-btn-primary"
              title="Phím tắt: Ctrl+Shift+L"
            >
              <IconPlay size={13} /> Start Live Subtitles
            </button>
          ) : (
            <button
              onClick={handleStopLive}
              title="Phím tắt: Ctrl+Shift+L"
              className="settings-btn-secondary"
              style={{
                background: "rgba(248, 113, 113, 0.22)",
                borderColor: "rgba(248, 113, 113, 0.5)",
                color: "#fca5a5",
                fontWeight: 600,
              }}
            >
              <IconStop size={13} /> Stop Live
            </button>
          )}

          <button
            onClick={() => sublix.showOverlay()}
            className="settings-btn-secondary"
            title="Phím tắt: Ctrl+Shift+O"
          >
            <IconEye size={13} /> Show Overlay
          </button>
        </div>

        {recentSubs.length > 0 && (
          <div className="settings-transcript" style={{ marginTop: 12 }}>
            <strong>Recent Live Subtitles:</strong>
            {recentSubs.map((s) => (
              <div key={s.id} style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 4 }}>
                <div style={{ color: "#f8fafc", fontWeight: 600 }}>{s.text}</div>
                {s.original && s.original !== s.text && (
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>{s.original}</div>
                )}
                <div style={{ color: "#64748b", fontSize: 11 }}>
                  #{s.id}
                  {s.stt_duration !== undefined && ` • STT ${(s.stt_duration * 1000).toFixed(0)}ms`}
                  {s.translate_duration !== undefined && s.translate_duration > 0 && ` • LLM ${(s.translate_duration * 1000).toFixed(0)}ms`}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: AUDIO DEVICE */}
      <section className="settings-section">
        <h2>🎙 Audio Output Device (WASAPI Loopback)</h2>
        <div className="settings-row">
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="settings-select"
          >
            <option value="default">Default (Windows default audio output)</option>
            {devices.map((d, i) => (
              <option key={d.id} value={`index:${i}`}>
                [{i}] {d.name}
              </option>
            ))}
          </select>
          <button onClick={loadDevices} className="settings-btn-secondary">
            Refresh
          </button>
          <button
            onClick={async () => {
              if (isLive) {
                setStatus({ kind: "error", message: "Stop Live mode before scanning devices." });
                return;
              }
              setScanning(true);
              setStatus({ kind: "working", message: "Scanning all audio devices..." });
              try {
                const levels = await sublix.scanAudioLevels();
                setDeviceLevels(levels);
                const active = levels.filter((l) => l.has_audio);
                if (active.length === 0) {
                  setStatus({
                    kind: "error",
                    message: "🔇 No device currently playing audio. Start a video first!",
                  });
                } else {
                  setStatus({
                    kind: "success",
                    message: `🔊 Found ${active.length} active audio device(s).`,
                  });
                }
              } catch (e) {
                setStatus({ kind: "error", message: `Scan failed: ${e}` });
              } finally {
                setScanning(false);
              }
            }}
            className="settings-btn-secondary"
            disabled={scanning || isLive}
          >
            {scanning ? "⏳ Scanning..." : "🔍 Scan Active Audio"}
          </button>
          <button
            onClick={async () => {
              setStatus({ kind: "working", message: "Testing selected device (3s)..." });
              try {
                const deviceIndex = selectedDevice === "default"
                  ? undefined
                  : Number(selectedDevice.replace("index:", ""));
                const result = await sublix.testAudio(deviceIndex);
                setAudioTest(result);
                if (result.has_audio) {
                  setStatus({
                    kind: "success",
                    message: `🔊 Audio detected! Peak ${(result.peak_volume * 100).toFixed(0)}%`,
                  });
                } else {
                  setStatus({
                    kind: "error",
                    message: "🔇 Silence on this device. Try 'Scan Active Audio' to find the right speaker/headphone.",
                  });
                }
              } catch (e) {
                setStatus({ kind: "error", message: `Test failed: ${e}` });
              }
            }}
            className="settings-btn-secondary"
            disabled={isLive}
          >
            🔊 Test 3s
          </button>
        </div>

        {deviceLevels && (
          <div className="settings-levels">
            {deviceLevels.map((l) => {
              const pct = Math.min(100, l.peak_volume * 100);
              const isSelected = selectedDevice === `index:${l.index}`;
              return (
                <div
                  key={l.index}
                  className={`settings-level-row ${l.has_audio ? "active" : ""} ${isSelected ? "selected" : ""}`}
                >
                  <span className="settings-level-name">
                    [{l.index}] {l.name}
                  </span>
                  <div className="settings-level-bar">
                    <div
                      className="settings-level-bar-fill"
                      style={{ width: `${pct}%` }}
                      data-active={l.has_audio}
                    />
                  </div>
                  <span className="settings-level-pct">{pct.toFixed(0)}%</span>
                  <button
                    type="button"
                    className="settings-btn-secondary settings-level-use"
                    onClick={() => setSelectedDevice(`index:${l.index}`)}
                  >
                    {isSelected ? "✓" : "Use"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {audioTest && (
          <div className="settings-help" style={{ marginTop: 6 }}>
            <strong>Last test:</strong> {audioTest.device_name} • Peak {(audioTest.peak_volume * 100).toFixed(1)}% •{" "}
            {audioTest.has_audio ? "✓ Audio present" : "✗ Silent"}
          </div>
        )}
      </section>
    </>
  )}

  {activeTab === "models" && (
    <>
      {/* SECTION: HARDWARE PRESETS (1-CLICK CONFIG FOR ANY PC) */}
      <section className="settings-section">
        <h2>⚡ Lựa Chọn Cấu Hình Phần Cứng Đề Xuất (1-Click Presets)</h2>
        <p className="settings-help">
          Bấm 1-click để Sublix tự động tối ưu mô hình STT, Translation và Engine theo sức mạnh máy tính của bạn:
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
      </section>

      {/* SECTION 3: STT ENGINE & 2026 WHISPER MODELS */}
      <section className="settings-section">
        <h2>🎤 Speech Recognition (2026 Whisper Large-v3-Turbo)</h2>
        <p className="settings-help">
          Long-running <code>whisper-server</code> keeps the model in GPU VRAM (~0.1s per chunk on RTX 3090).
          Hot-swaps automatically when you change model or CPU/GPU mode.
        </p>

        <div className="settings-row">
          <label>Whisper Model:</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="settings-select"
          >
            {sttModels.length > 0 ? (
              sttModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.downloaded ? "✓ " : "⬇ "} {m.label}
                </option>
              ))
            ) : (
              <>
                <option value="large-v3-turbo-q8_0">✓ large-v3-turbo Q8 (874MB) — ⭐ 2026 GPU Best</option>
                <option value="base">✓ base (140MB) — Fast lightweight</option>
                <option value="tiny">✓ tiny (75MB) — Ultra-light</option>
              </>
            )}
          </select>

          {selectedSttInfo && !selectedSttInfo.downloaded && (
            <button
              onClick={async () => {
                setDownloadingModel(model);
                setStatus({ kind: "working", message: `Downloading Whisper ${model} (~${selectedSttInfo.size_mb}MB)...` });
                try {
                  await sublix.downloadSttModel(model);
                  await refreshSetup();
                  setStatus({ kind: "success", message: `✅ Downloaded Whisper ${model}!` });
                } catch (e) {
                  setStatus({ kind: "error", message: `Download failed: ${e}` });
                } finally {
                  setDownloadingModel(null);
                }
              }}
              className="settings-btn-primary"
              disabled={downloadingModel !== null}
            >
              {downloadingModel === model ? "⏳ Downloading..." : `⬇ Download (${selectedSttInfo.size_mb}MB)`}
            </button>
          )}
        </div>

        <div className="settings-row">
          <span className="settings-help" style={{ marginRight: 8 }}>Engine:&nbsp;</span>
          <div className="settings-engine-toggle">
            <button
              className={`settings-engine-btn ${sttEnginePref === "auto" ? "active" : ""}`}
              onClick={() => handleSttEngineChange("auto")}
              disabled={!configLoaded}
            >
              ⚙ AUTO
            </button>
            <button
              className={`settings-engine-btn ${sttEnginePref === "cpu" ? "active" : ""}`}
              onClick={() => handleSttEngineChange("cpu")}
              disabled={!configLoaded}
            >
              💻 CPU
            </button>
            <button
              className={`settings-engine-btn ${sttEnginePref === "cuda" ? "active" : ""}`}
              onClick={() => handleSttEngineChange("cuda")}
              disabled={!configLoaded}
            >
              🎮 GPU (CUDA)
            </button>
          </div>

          <button
            onClick={async () => {
              setSttServerStarting(true);
              setStatus({ kind: "working", message: `Loading Whisper (${model}) into memory...` });
              try {
                const eng = await sublix.preloadSttServer(model);
                setSttServerEngine(eng);
                setStatus({
                  kind: "success",
                  message: `✅ STT server ready on ${eng.toUpperCase()} (${model})`,
                });
              } catch (e) {
                setStatus({ kind: "error", message: `STT server error: ${e}` });
                setSttServerEngine(null);
              } finally {
                setSttServerStarting(false);
              }
            }}
            className="settings-btn-secondary"
            disabled={sttServerStarting}
          >
            {sttServerStarting ? "⏳ Loading..." : sttServerEngine ? "🔄 Reload STT Server" : "▶ Pre-warm STT Server"}
          </button>
        </div>

        <div className="settings-row">
          <span className="settings-help" style={{ marginRight: 8 }}>Status:&nbsp;</span>
          {sttServerStarting ? (
            <span className="settings-engine-indicator">
              <span className="engine-dot engine-dot-starting" />
              <span style={{ color: "#fbbf24" }}>Loading Whisper model into VRAM...</span>
            </span>
          ) : sttServerEngine === "cuda" ? (
            <span className="settings-engine-indicator">
              <span className="engine-dot engine-dot-cuda" />
              <span style={{ color: "#34d399", fontWeight: 600 }}>
                Running on NVIDIA GPU (CUDA) — ~0.08–0.15s per chunk
              </span>
            </span>
          ) : sttServerEngine === "cpu" ? (
            <span className="settings-engine-indicator">
              <span className="engine-dot engine-dot-cpu" />
              <span style={{ color: "#60a5fa", fontWeight: 600 }}>
                Running on CPU — ~1–2s per chunk
              </span>
            </span>
          ) : (
            <span className="settings-engine-indicator">
              <span className="engine-dot engine-dot-idle" />
              <span style={{ color: "#94a3b8" }}>
                Standby (CUDA binary ready: {sttEngine === "cuda" ? "✓ Yes" : "CPU only"})
              </span>
            </span>
          )}
        </div>
      </section>

      {/* SECTION 4: TRANSLATION & CINEMATIC SCRIPTING LLM ENGINE */}
      <section className="settings-section">
        <h2>🌐 Bộ Não Dịch Thuật & Biên Kịch Lồng Tiếng (AI Translation & Scripting)</h2>
        <p className="settings-help">
          Lựa chọn nguồn AI dịch kịch bản: <strong>MiniMax Cloud API (Unlimited)</strong> cho văn phong điện ảnh mượt mà và 0% VRAM, <strong>Ollama Local (Qwen 27B / 32B)</strong> chạy trên máy, hoặc <strong>GGUF Embedded</strong> cục bộ.
        </p>

        {/* Provider Switcher Tabs */}
        <div className="settings-row" style={{ alignItems: "flex-start", marginBottom: 14 }}>
          <label style={{ paddingTop: 6, minWidth: 100 }}>Nguồn Dịch:</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
            <button
              className={`settings-engine-btn ${transProvider === "minimax" ? "active" : ""}`}
              onClick={() => handleProviderChange("minimax")}
              style={{ padding: "8px 14px", fontWeight: transProvider === "minimax" ? 700 : 500 }}
            >
              🌐 MiniMax Cloud API (Unlimited) ⭐ Khuyên Dùng
            </button>
            <button
              className={`settings-engine-btn ${transProvider === "ollama" ? "active" : ""}`}
              onClick={() => handleProviderChange("ollama")}
              style={{ padding: "8px 14px", fontWeight: transProvider === "ollama" ? 700 : 500 }}
            >
              🦙 Ollama Local (Qwen 27B / 32B)
            </button>
            <button
              className={`settings-engine-btn ${transProvider === "local" ? "active" : ""}`}
              onClick={() => handleProviderChange("local")}
              style={{ padding: "8px 14px", fontWeight: transProvider === "local" ? 700 : 500 }}
            >
              💻 Local GGUF (llama-server)
            </button>
          </div>
        </div>

        {/* PROVIDER 1: MINIMAX CLOUD API */}
        {transProvider === "minimax" && (
          <div style={{ background: "rgba(30, 41, 59, 0.4)", padding: "14px 16px", borderRadius: 8, border: "1px solid rgba(59, 130, 246, 0.2)", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#60a5fa" }}>
                🔑 Cấu hình MiniMax Unlimited API
              </span>
              <span style={{ fontSize: 11, background: "rgba(16, 185, 129, 0.2)", color: "#34d399", padding: "2px 8px", borderRadius: 4 }}>
                0% VRAM GPU • Dịch Điện Ảnh
              </span>
            </div>
            <div className="settings-row" style={{ marginBottom: 10 }}>
              <label style={{ minWidth: 100 }}>API Key:</label>
              <div style={{ display: "flex", gap: 6, flex: 1 }}>
                <input
                  type={showMinimaxKey ? "text" : "password"}
                  value={minimaxKey}
                  onChange={(e) => setMinimaxKey(e.target.value)}
                  placeholder="Dán API Key MiniMax của bạn vào đây..."
                  className="settings-input"
                  style={{ flex: 1, fontFamily: "monospace" }}
                />
                <button
                  type="button"
                  onClick={() => setShowMinimaxKey(!showMinimaxKey)}
                  className="settings-btn-secondary"
                  style={{ padding: "4px 10px", fontSize: 11 }}
                >
                  {showMinimaxKey ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </div>
            <div className="settings-row" style={{ marginBottom: 12 }}>
              <label style={{ minWidth: 100 }}>Model Name:</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <input
                  type="text"
                  value={minimaxModel}
                  onChange={(e) => setMinimaxModel(e.target.value)}
                  placeholder="MiniMax-M3 (Token Plan) hoặc MiniMax-Text-01"
                  className="settings-input"
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setMinimaxModel("MiniMax-M3")}
                    className="settings-btn-secondary"
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      background: minimaxModel === "MiniMax-M3" ? "rgba(59, 130, 246, 0.3)" : undefined,
                      borderColor: minimaxModel === "MiniMax-M3" ? "#3b82f6" : undefined,
                    }}
                  >
                    ⭐ MiniMax-M3 (Token Plan)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMinimaxModel("MiniMax-Text-01")}
                    className="settings-btn-secondary"
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      background: minimaxModel === "MiniMax-Text-01" ? "rgba(59, 130, 246, 0.3)" : undefined,
                      borderColor: minimaxModel === "MiniMax-Text-01" ? "#3b82f6" : undefined,
                    }}
                  >
                    MiniMax-Text-01
                  </button>
                  <button
                    type="button"
                    onClick={() => setMinimaxModel("abab6.5s-chat")}
                    className="settings-btn-secondary"
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      background: minimaxModel === "abab6.5s-chat" ? "rgba(59, 130, 246, 0.3)" : undefined,
                      borderColor: minimaxModel === "abab6.5s-chat" ? "#3b82f6" : undefined,
                    }}
                  >
                    abab6.5s-chat
                  </button>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              <button
                onClick={saveProviderSettings}
                className="settings-btn-primary"
                style={{ padding: "6px 14px", fontSize: 12 }}
              >
                💾 Lưu Cấu Hình
              </button>
              <button
                onClick={testProviderTranslation}
                className="settings-btn-secondary"
                disabled={providerTesting}
                style={{ padding: "6px 14px", fontSize: 12 }}
              >
                {providerTesting ? "⏳ Đang dịch thử..." : "🧪 Dịch Thử Nghiệm Ngay"}
              </button>
            </div>
          </div>
        )}

        {/* PROVIDER 2: OLLAMA LOCAL */}
        {transProvider === "ollama" && (
          <div style={{ background: "rgba(30, 41, 59, 0.4)", padding: "14px 16px", borderRadius: 8, border: "1px solid rgba(168, 85, 247, 0.2)", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#c084fc" }}>
                🦙 Kết Nối Ollama Local (Máy Cá Nhân)
              </span>
              <span style={{ fontSize: 11, background: "rgba(168, 85, 247, 0.2)", color: "#d8b4fe", padding: "2px 8px", borderRadius: 4 }}>
                Offline 100% • Model 27B / 32B
              </span>
            </div>
            <div className="settings-row" style={{ marginBottom: 10 }}>
              <label style={{ minWidth: 100 }}>Ollama URL:</label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="settings-input"
                style={{ flex: 1, fontFamily: "monospace" }}
              />
            </div>
            <div className="settings-row" style={{ marginBottom: 12 }}>
              <label style={{ minWidth: 100 }}>Model Name:</label>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="smtek/qwen3.8-27b:q4_k_m hoặc qwen:latest"
                className="settings-input"
                style={{ flex: 1, fontFamily: "monospace" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              <button
                onClick={saveProviderSettings}
                className="settings-btn-primary"
                style={{ padding: "6px 14px", fontSize: 12 }}
              >
                💾 Lưu Cấu Hình
              </button>
              <button
                onClick={testProviderTranslation}
                className="settings-btn-secondary"
                disabled={providerTesting}
                style={{ padding: "6px 14px", fontSize: 12 }}
              >
                {providerTesting ? "⏳ Đang dịch thử..." : "🧪 Dịch Thử Nghiệm Ngay"}
              </button>
            </div>
          </div>
        )}

        {/* PROVIDER TEST RESULT BOX */}
        {providerTestResult && (
          <div style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(52, 211, 153, 0.4)", borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
              💬 Kết quả dịch thử nghiệm: <em>"I can't believe you actually pulled this off. You're insane, you know that?"</em>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#34d399", lineHeight: 1.4 }}>
              {providerTestResult}
            </div>
          </div>
        )}

        {/* PROVIDER 3: LOCAL GGUF */}
        {transProvider === "local" && (
          <>
            <div className="settings-row">
              <label>LLM Model:</label>
              <select
                value={translationModel}
                onChange={(e) => setTranslationModel(e.target.value)}
                className="settings-select"
              >
                {transModels.length > 0 ? (
                  transModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.downloaded ? "✓ " : "⬇ "} {m.label}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="qwen3-4b">✓ Qwen3-4B-Instruct-2507 (2.5GB) — ⭐ 2026 Best</option>
                    <option value="qwen2.5-3b">✓ Qwen2.5-3B-Instruct (2.0GB) — Legacy</option>
                  </>
                )}
              </select>

              {selectedTransInfo && !selectedTransInfo.downloaded && (
                <button
                  onClick={async () => {
                    setDownloadingModel(translationModel);
                    setStatus({
                      kind: "working",
                      message: `Downloading ${translationModel} (~${selectedTransInfo.size_mb}MB)...`,
                    });
                    try {
                      await sublix.downloadTranslationModel(translationModel);
                      await refreshSetup();
                      setStatus({ kind: "success", message: `✅ Downloaded ${translationModel}!` });
                    } catch (e) {
                      setStatus({ kind: "error", message: `Download failed: ${e}` });
                    } finally {
                      setDownloadingModel(null);
                    }
                  }}
                  className="settings-btn-primary"
                  disabled={downloadingModel !== null}
                >
                  {downloadingModel === translationModel
                    ? "⏳ Downloading..."
                    : `⬇ Download (${selectedTransInfo.size_mb}MB)`}
                </button>
              )}
            </div>

            <div className="settings-row">
              <span className="settings-help" style={{ marginRight: 8 }}>Engine:&nbsp;</span>
              <div className="settings-engine-toggle">
                <button
                  className={`settings-engine-btn ${transEnginePref === "auto" ? "active" : ""}`}
                  onClick={() => handleTransEngineChange("auto")}
                  disabled={!configLoaded}
                >
                  ⚙ AUTO
                </button>
                <button
                  className={`settings-engine-btn ${transEnginePref === "cpu" ? "active" : ""}`}
                  onClick={() => handleTransEngineChange("cpu")}
                  disabled={!configLoaded}
                >
                  💻 CPU
                </button>
                <button
                  className={`settings-engine-btn ${transEnginePref === "cuda" ? "active" : ""}`}
                  onClick={() => handleTransEngineChange("cuda")}
                  disabled={!configLoaded}
                >
                  🎮 GPU (CUDA)
                </button>
              </div>

              <button
                onClick={async () => {
                  setServerStarting(true);
                  setStatus({
                    kind: "working",
                    message: `Loading LLM (${translationModel}) into GPU VRAM...`,
                  });
                  try {
                    const eng = await sublix.preloadTranslationServer(translationModel);
                    setEngine(eng);
                    setStatus({
                      kind: "success",
                      message: `✅ Translation LLM ready on ${eng.toUpperCase()} (${translationModel})`,
                    });
                  } catch (e) {
                    setStatus({ kind: "error", message: `LLM server failed: ${e}` });
                    setEngine(null);
                  } finally {
                    setServerStarting(false);
                  }
                }}
                className="settings-btn-secondary"
                disabled={serverStarting}
              >
                {serverStarting ? "⏳ Loading..." : engine ? "🔄 Reload LLM Server" : "▶ Pre-warm LLM Server"}
              </button>
            </div>

            <div className="settings-row">
              <span className="settings-help" style={{ marginRight: 8 }}>Status:&nbsp;</span>
              {serverStarting ? (
                <span className="settings-engine-indicator">
                  <span className="engine-dot engine-dot-starting" />
                  <span style={{ color: "#fbbf24" }}>Loading GGUF model into VRAM...</span>
                </span>
              ) : engine === "cuda" ? (
                <span className="settings-engine-indicator">
                  <span className="engine-dot engine-dot-cuda" />
                  <span style={{ color: "#34d399", fontWeight: 600 }}>
                    Running on NVIDIA GPU (CUDA) — ~0.1–0.2s per subtitle
                  </span>
                </span>
              ) : engine === "cpu" ? (
                <span className="settings-engine-indicator">
                  <span className="engine-dot engine-dot-cpu" />
                  <span style={{ color: "#60a5fa", fontWeight: 600 }}>
                    Running on CPU — ~1–2s per subtitle
                  </span>
                </span>
              ) : (
                <span className="settings-engine-indicator">
                  <span className="engine-dot engine-dot-idle" />
                  <span style={{ color: "#94a3b8" }}>Standby (auto-starts on first subtitle)</span>
                </span>
              )}
            </div>
          </>
        )}
      </section>

      {/* SECTION: MODEL CATALOG & DOWNLOAD MANAGER */}
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
      </section>

      {/* SECTION 6: ONE-SHOT DIAGNOSTIC TEST */}
      <section className="settings-section">
        <h2>🧪 Manual 5s Capture + STT + Translation Test</h2>
        <div className="settings-row">
          <button
            onClick={handleTestCapture}
            className="settings-btn-secondary"
            disabled={status.kind === "working" || isLive}
          >
            1. Record 5s Audio
          </button>
          {lastCapture && (
            <button
              onClick={handleTranscribe}
              className="settings-btn-primary"
              disabled={status.kind === "working"}
            >
              2. Run STT + Translate
            </button>
          )}
          <button
            onClick={() => sublix.openModelsFolder()}
            className="settings-btn-secondary"
          >
            📁 Open Models Folder
          </button>
        </div>
        {lastTranscript && (
          <div className="settings-transcript">
            <div><strong>Original STT:</strong> {lastTranscript}</div>
            {lastTranslatedTest && (
              <div style={{ marginTop: 4, color: "#34d399" }}>
                <strong>Translated ({targetLang.toUpperCase()}):</strong> {lastTranslatedTest}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )}

  {activeTab === "history" && (
    <section className="settings-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2>📜 Lịch Sử Lời Thoại & Phụ Đề Live ({recentSubs.length} câu)</h2>
        <div className="history-actions">
          <button
            type="button"
            className="settings-btn-secondary"
            onClick={handleCopyHistory}
            disabled={recentSubs.length === 0}
          >
            📋 Sao Chép
          </button>
          <button
            type="button"
            className="settings-btn-primary"
            onClick={handleExportSrt}
            disabled={recentSubs.length === 0}
          >
            🎬 Xuất .SRT
          </button>
          <button
            type="button"
            className="settings-btn-secondary"
            onClick={handleExportTxt}
            disabled={recentSubs.length === 0}
          >
            📄 Xuất .TXT
          </button>
          <button
            type="button"
            className="settings-btn-danger"
            onClick={() => setRecentSubs([])}
            disabled={recentSubs.length === 0}
          >
            🗑️ Xoá
          </button>
        </div>
      </div>

      <div className="history-toolbar">
        <input
          type="text"
          placeholder="🔍 Tìm kiếm câu thoại hoặc từ khoá..."
          value={historySearch}
          onChange={(e) => setHistorySearch(e.target.value)}
          className="history-search-input"
        />
        <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.45)" }}>
          {isLive ? "🔴 Đang tự động lưu câu mới khi phát..." : "Tạm dừng"}
        </span>
      </div>

      {filteredHistory.length > 0 ? (
        <div className="history-list">
          {filteredHistory.map((item) => (
            <div key={item.id} className="history-item">
              <div className="history-item-top">
                <span>#{item.id}</span>
                <span>
                  {item.stt_duration ? `STT: ${item.stt_duration.toFixed(2)}s` : ""}
                  {item.translate_duration ? ` • LLM: ${item.translate_duration.toFixed(2)}s` : ""}
                </span>
              </div>
              {item.original && (
                <div className="history-item-orig">{item.original}</div>
              )}
              <div className="history-item-trans">{item.text}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="history-empty">
          <img className="spot-ill" src={spotHistoryUrl} alt="" />
          {recentSubs.length === 0
            ? "Chưa có lời thoại nào được ghi nhận. Bắt đầu phát video và bật 'Dịch Trực Tiếp Live' để ghi nhận!"
            : "Không tìm thấy câu thoại nào khớp với từ khoá tìm kiếm."}
        </div>
      )}
    </section>
  )}

  {activeTab === "overlay" && (
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
        </div>
      </main>

      <ChangelogModal
        isOpen={showChangelog}
        onClose={() => setShowChangelog(false)}
        currentVersion={`v${appInfo?.version ?? "0.8.0"}`}
        currentTheme={theme}
        onThemeChange={handleThemeChange}
      />
    </div>
  );
}
