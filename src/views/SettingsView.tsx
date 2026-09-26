//! Settings window — main control panel for Sublix v0.5.0.
//!
//! Features:
//! - Audio device picker + 1-second multi-device volume scanner
//! - Continuous Live Capture with Smart VAD (Voice Activity Endpointing)
//! - 2026 Whisper STT models (Large-v3-Turbo Q8 / FP16) + 1-click model downloader + hot-swap GPU/CPU server
//! - 2026 Local LLM Translation models (Qwen3-4B-Instruct-2507, Gemma-3-4B-IT, Qwen3-8B, Qwen2.5) + hot-swap GPU/CPU server
//! - Overlay appearance controls (font size, bilingual original line, click-through mode)

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  sublix,
  type AppConfig,
  type AudioDevice,
  type ModelStatusItem,
} from "../lib/tauri";
import "./SettingsView.css";

type Status =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

interface LiveSubPreview {
  id: number;
  text: string;
  original?: string;
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
      setConfigLoaded(true);
    }).catch(() => {
      setConfigLoaded(true);
    });

    let unlistenStatus: (() => void) | undefined;
    let unlistenSub: (() => void) | undefined;

    listen<{ kind: string; message?: string }>("status:change", (e) => {
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
    }).then((u) => { unlistenStatus = u; });

    listen<LiveSubPreview>("subtitle:new", (e) => {
      setRecentSubs((prev) => [e.payload, ...prev.slice(0, 4)]);
      sublix.getSttServerEngine().then(setSttServerEngine).catch(() => {});
      sublix.getTranslationEngine().then(setEngine).catch(() => {});
    }).then((u) => { unlistenSub = u; });

    return () => {
      if (unlistenStatus) unlistenStatus();
      if (unlistenSub) unlistenSub();
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

  async function persistOverlayConfig(
    nextFontSize: number,
    nextShowOrig: boolean,
    nextClickThrough: boolean,
  ) {
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
      overlay_font_size: nextFontSize,
      overlay_show_original: nextShowOrig,
      overlay_click_through: nextClickThrough,
    };
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
    <div className="settings-root">
      <header className="settings-header">
        <h1>Sublix v{appInfo?.version ?? "0.5.0"}</h1>
        <span className="settings-tagline">
          Real-time GPU Subtitle Overlay • Whisper Large-v3-Turbo + Qwen3 / Gemma 3
        </span>
      </header>

      {/* Status bar */}
      <div className={`settings-status status-${status.kind}`}>
        {status.kind === "idle" &&
          "Ready — RTX 3090 CUDA GPU enabled for both Whisper STT & Local LLM Translation."}
        {status.kind === "working" && `⏳ ${status.message}`}
        {status.kind === "error" && `⚠ ${status.message}`}
        {status.kind === "success" && `✓ ${status.message}`}
      </div>

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
              onClick={async () => {
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
                }
              }}
              className="settings-btn-primary"
            >
              ▶ Start Live Subtitles
            </button>
          ) : (
            <button
              onClick={async () => {
                setStatus({ kind: "working", message: "Stopping live stream..." });
                try {
                  await sublix.stopLive();
                  setIsLive(false);
                  setStatus({ kind: "success", message: "Live capture stopped." });
                } catch (e) {
                  setStatus({ kind: "error", message: `Failed to stop: ${e}` });
                }
              }}
              className="settings-btn-secondary"
              style={{
                background: "rgba(248, 113, 113, 0.22)",
                borderColor: "rgba(248, 113, 113, 0.5)",
                color: "#fca5a5",
                fontWeight: 600,
              }}
            >
              ■ Stop Live
            </button>
          )}

          <button
            onClick={() => sublix.showOverlay()}
            className="settings-btn-secondary"
          >
            🪟 Show Overlay
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

      {/* SECTION 4: TRANSLATION LLM ENGINE (2026 QWEN3 / GEMMA 3) */}
      <section className="settings-section">
        <h2>🌐 Local AI Translation (2026 Qwen3 / Gemma 3 — llama-server)</h2>
        <p className="settings-help">
          Runs 2026 GGUF instruction models in GPU VRAM with 2-line rolling dialogue memory for accurate pronouns and natural Vietnamese subtitles.
        </p>

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
      </section>

      {/* SECTION 5: OVERLAY APPEARANCE & CLICK-THROUGH */}
      <section className="settings-section">
        <h2>🎨 Overlay Appearance & Click-Through</h2>
        <div className="settings-row">
          <label>Font size:</label>
          <input
            type="range"
            min={16}
            max={34}
            step={1}
            value={fontSize}
            onChange={(e) => {
              const v = Number(e.target.value);
              setFontSize(v);
              persistOverlayConfig(v, showOriginal, clickThrough);
            }}
            className="settings-slider"
          />
          <span className="settings-slider-value">{fontSize}px</span>
        </div>

        <div className="settings-row" style={{ gap: 20, marginTop: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showOriginal}
              onChange={(e) => {
                const v = e.target.checked;
                setShowOriginal(v);
                persistOverlayConfig(fontSize, v, clickThrough);
              }}
            />
            <span>Show bilingual original subtitle line</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
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
            <span>🔒 Click-through overlay (pass mouse clicks to video player)</span>
          </label>
        </div>
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
    </div>
  );
}
