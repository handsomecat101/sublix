//! Sublix AI Dubbing Studio View — Multi-Speaker AI Dubbing, Scriptwriting & Voice Synthesis.

import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  sublix,
  type DubbingProject,
  type DubbingSpeaker,
  type DubbingSegment,
  type DubbingProgress,
  type VoicePreset,
  type VoiceModelStatus,
  type ModelDownloadProgress,
  type VoiceSampleProgress,
} from "../lib/tauri";
import { CustomSelect, type SelectOption } from "./CustomSelect";
import "./DubbingStudioView.css";

interface DubbingStudioViewProps {
  defaultSourceLang?: string;
  initialFilePath?: string;
}

const SOURCE_LANG_OPTIONS: SelectOption[] = [
  { value: "auto", label: "Tự động nhận diện (Auto-detect)", icon: "🌐", badge: "Auto" },
  { value: "ja", label: "Tiếng Nhật (Japanese)", icon: "🇯🇵" },
  { value: "en", label: "Tiếng Anh (English)", icon: "🇺🇸" },
  { value: "zh", label: "Tiếng Trung (Chinese)", icon: "🇨🇳" },
  { value: "ko", label: "Tiếng Hàn (Korean)", icon: "🇰🇷" },
  { value: "fr", label: "Tiếng Pháp (French)", icon: "🇫🇷" },
  { value: "de", label: "Tiếng Đức (German)", icon: "🇩🇪" },
  { value: "es", label: "Tiếng Tây Ban Nha (Spanish)", icon: "🇪🇸" },
];

const TARGET_LANG_OPTIONS: SelectOption[] = [
  { value: "vi", label: "Tiếng Việt (Vietnamese - Chuẩn Rạp)", icon: "🇻🇳", badge: "Mặc định" },
  { value: "en", label: "Tiếng Anh (English)", icon: "🇺🇸" },
  { value: "ja", label: "Tiếng Nhật (Japanese)", icon: "🇯🇵" },
  { value: "zh", label: "Tiếng Trung (Chinese)", icon: "🇨🇳" },
];

const SAMPLE_PHRASES: Record<string, string> = {
  vi: "Xin chào! Tôi là diễn viên lồng tiếng AI của Sublix, sẵn sàng lồng tiếng cho các bộ phim điện ảnh yêu thích của bạn.",
  en: "Hello! I am Sublix AI voice actor, ready to dub your movies with cinematic neural expression.",
  ja: "こんにちは！SublixのAI声優です。映画やアニメの吹き替えをお手伝いします。",
  zh: "你好！我是Sublix的AI配音员，随时准备为您的影视作品提供电影级配音。",
};

// Slim sub-headers for the compact voice-model picker.
const VOICE_CATEGORY_TITLES: Record<string, string> = {
  clone: "🎭 Giọng Clone — nhại giọng diễn viên",
  preset: "🗣️ Giọng Đọc Sẵn — nhẹ & nhanh",
  diarization: "👥 Phân Vai — nhận diện ai nói câu nào",
  cloud: "☁️ Giọng Cloud — dùng API, cần mạng",
};

export default function DubbingStudioView({
  defaultSourceLang = "ja",
  initialFilePath = "",
}: DubbingStudioViewProps) {
  const [filePath, setFilePath] = useState<string>(initialFilePath);
  const [sourceLang, setSourceLang] = useState<string>(defaultSourceLang);
  const [targetLang, setTargetLang] = useState<string>("vi");
  const [selectedDubMode, setSelectedDubMode] = useState<"ducking" | "vocal_isolation">("ducking");

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [rendering, setRendering] = useState<boolean>(false);
  const isBusy = analyzing || rendering;
  const busyRef = useRef<boolean>(isBusy);
  busyRef.current = isBusy;

  const [progress, setProgress] = useState<DubbingProgress | null>(null);
  const [project, setProject] = useState<DubbingProject | null>(null);
  const [voices, setVoices] = useState<VoicePreset[]>([]);
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const [auditionVoiceId, setAuditionVoiceId] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState<"3m" | "10m" | "full">("3m");
  const [activeProvider, setActiveProvider] = useState<string>("local");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  // Compact Voice & Model hub (moved from Settings — model giọng nói thuộc mục Lồng Tiếng)
  const [voiceModels, setVoiceModels] = useState<VoiceModelStatus[]>([]);
  const [voiceBusyId, setVoiceBusyId] = useState<string | null>(null);
  const [showVoiceHub, setShowVoiceHub] = useState<boolean>(false);
  const [voiceProgress, setVoiceProgress] = useState<Record<string, {
    percent: number;
    downloaded_bytes?: number;
    total_bytes?: number;
    phase?: string;
    error?: string;
  }>>({});

  // v0.9.9: voice catalog theo model + mẫu nghe thử được tạo sẵn (cache trên đĩa).
  const [expandedModel, setExpandedModel] = useState<string | null>("kokoro-vi");
  const [voiceSamples, setVoiceSamples] = useState<Record<string, string[]>>({});
  const [generatingSamples, setGeneratingSamples] = useState<boolean>(false);
  const [sampleGenProgress, setSampleGenProgress] = useState<{ done: number; total: number } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load preset voices & config on mount
  useEffect(() => {
    sublix.dubbingGetVoices().then(setVoices).catch((err) => {
      console.warn("Failed to load voices:", err);
    });

    sublix.getConfig().then((cfg) => {
      if (cfg.translation_provider) {
        setActiveProvider(cfg.translation_provider);
      }
    }).catch((err) => {
      console.warn("Failed to load config:", err);
    });

    const pProgress = listen<DubbingProgress>("dubbing:progress", (event) => {
      setProgress(event.payload);
    });

    // Voice model hub: catalog + live download progress (reused backend events).
    sublix.voiceModelList().then(setVoiceModels).catch((err) => {
      console.warn("Failed to load voice models:", err);
    });
    const pModel = listen<ModelDownloadProgress>("model:download_progress", (event) => {
      const p = event.payload;
      if (p.component !== "voice") return;
      setVoiceProgress((prev) => ({
        ...prev,
        [p.name]: {
          percent: p.percent,
          downloaded_bytes: p.downloaded_bytes,
          total_bytes: p.total_bytes,
          phase: p.phase,
          error: p.error,
        },
      }));
      if (p.phase === "done" || p.phase === "error") {
        sublix.voiceModelList().then(setVoiceModels).catch(() => {});
      }
    });

    // v0.9.9: nạp sẵn danh sách giọng đã có mẫu nghe thử + theo dõi tiến trình tạo mẫu.
    sublix.voiceSampleList("kokoro-vi")
      .then((ids) => setVoiceSamples((prev) => ({ ...prev, "kokoro-vi": ids })))
      .catch(() => {});
    const pSample = listen<VoiceSampleProgress>("voice:sample_progress", (event) => {
      const p = event.payload;
      setSampleGenProgress({ done: p.index, total: p.total });
      if (p.done) {
        setVoiceSamples((prev) => {
          const cur = new Set(prev[p.model_id] ?? []);
          cur.add(p.voice_id);
          return { ...prev, [p.model_id]: Array.from(cur) };
        });
      }
    });

    return () => {
      pProgress.then((u) => u()).catch(() => {});
      pModel.then((u) => u()).catch(() => {});
      pSample.then((u) => u()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (initialFilePath) {
      setFilePath(initialFilePath);
    }
  }, [initialFilePath]);

  // Handle Drag & Drop via Tauri API
  useEffect(() => {
    const pDragDrop = (async () => {
      try {
        const webview = getCurrentWebview();
        return await webview.onDragDropEvent((event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDragging(true);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            if (busyRef.current) {
              console.warn("Studio is currently processing, ignoring dropped file");
              return;
            }
            const droppedPaths = event.payload.paths;
            if (droppedPaths && droppedPaths.length > 0) {
              handleSetFile(droppedPaths[0]);
            }
          } else {
            setIsDragging(false);
          }
        });
      } catch (err) {
        console.warn("Tauri drag-drop in DubbingStudioView failed:", err);
        return () => {};
      }
    })();

    return () => {
      pDragDrop.then((u) => {
        if (typeof u === "function") u();
      }).catch(() => {});
    };
  }, []);

  const handleSetFile = (path: string) => {
    if (busyRef.current) {
      console.warn("Studio is currently processing, ignoring file change");
      return;
    }
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const valid = ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "mp3", "wav", "m4a", "flac"];
    if (ext && valid.includes(ext)) {
      setFilePath(path);
      setProject(null);
      setExportPath(null);
      setStatusMessage({ kind: "info", text: `Đã chọn tệp: ${path.split(/[\\/]/).pop()}` });
    } else {
      setStatusMessage({ kind: "error", text: `Định dạng .${ext} không được hỗ trợ. Vui lòng chọn tệp video hoặc audio.` });
    }
  };

  async function handleSelectFile() {
    if (busyRef.current) return;
    try {
      const picked = await sublix.dubbingPickMediaFile();
      if (picked) {
        handleSetFile(picked);
      }
    } catch (err) {
      setStatusMessage({ kind: "error", text: `Lỗi chọn file: ${err}` });
    }
  }

  // ---- Compact Voice & Model hub helpers ----
  function formatSizeMb(mb: number): string {
    if (mb <= 0) return "—";
    return mb >= 1024 ? `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB` : `${Math.round(mb)} MB`;
  }

  function formatBytes(b?: number): string {
    if (!b || b <= 0) return "—";
    const mb = b / 1048576;
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.max(1, Math.round(mb))} MB`;
  }

  async function handleVoiceDownload(id: string) {
    if (voiceBusyId) return;
    setVoiceBusyId(id);
    try {
      await sublix.voiceModelDownload(id);
    } catch (err) {
      console.error("Voice model download failed:", err);
      setStatusMessage({ kind: "error", text: `Tải model thất bại: ${err}` });
    } finally {
      setVoiceBusyId(null);
      sublix.voiceModelList().then(setVoiceModels).catch(() => {});
    }
  }

  // v0.9.9: tạo 1 lần mẫu nghe thử cho toàn bộ giọng của model (cache trên đĩa, nghe lại tức thì).
  async function handleGenerateSamples() {
    if (generatingSamples) return;
    setGeneratingSamples(true);
    setSampleGenProgress({ done: 0, total: voices.filter((v) => v.id.startsWith("kokoro:")).length });
    try {
      const n = await sublix.voiceSampleGenerate("kokoro-vi");
      const ids = await sublix.voiceSampleList("kokoro-vi");
      setVoiceSamples((prev) => ({ ...prev, "kokoro-vi": ids }));
      setStatusMessage({
        kind: "success",
        text: `🎧 Đã tạo ${n} mẫu nghe thử — bấm 🔊 cạnh từng giọng để nghe tức thì.`,
      });
    } catch (err) {
      setStatusMessage({ kind: "error", text: `Tạo mẫu nghe thử thất bại: ${err}` });
    } finally {
      setGeneratingSamples(false);
      setSampleGenProgress(null);
    }
  }

  // Audition preview a voice sample (mẫu cache phát tức thì, fallback TTS trực tiếp)
  async function handleAuditionVoice(voice: VoicePreset) {
    setAuditionVoiceId(voice.id);
    const phrase = SAMPLE_PHRASES[voice.lang] || SAMPLE_PHRASES.vi;
    try {
      let dataUri: string | null = null;
      if (voice.id.startsWith("kokoro:")) {
        dataUri = await sublix.voiceSampleData("kokoro-vi", voice.id).catch(() => null);
      }
      if (!dataUri) {
        dataUri = await sublix.dubbingPreviewTts(phrase, voice.id, "+0%", "+0Hz");
      }
      setAudioUrl(dataUri);
      if (audioRef.current) {
        audioRef.current.src = dataUri;
        audioRef.current.play().catch(() => {});
      }
    } catch (err) {
      setStatusMessage({ kind: "error", text: `Không thể nghe thử giọng ${voice.name}: ${err}` });
    } finally {
      setAuditionVoiceId(null);
    }
  }

  async function handleSwitchProvider(newProvider: "local" | "minimax") {
    try {
      setActiveProvider(newProvider);
      const currentCfg = await sublix.getConfig();
      await sublix.saveConfig({
        ...currentCfg,
        translation_provider: newProvider,
      });
      setStatusMessage({
        kind: "info",
        text: `Đã kích hoạt bộ não biên kịch: ${
          newProvider === "local"
            ? "⚡ Qwen3-4B (GPU RTX 3090 — Siêu Tốc ~0.1s & Hoàn Toàn Offline)"
            : "🧠 MiniMax-M3 (Cloud AI — Điện Ảnh SOTA)"
        }`,
      });
    } catch (err) {
      console.error("Failed to switch translation provider:", err);
    }
  }

  async function handleCancel() {
    try {
      await sublix.dubbingCancel();
      setAnalyzing(false);
      setRendering(false);
      setProgress(null);
      setStatusMessage({
        kind: "info",
        text: "🛑 Đã dừng tiến trình theo yêu cầu của bạn.",
      });
    } catch (err) {
      console.error("Cancel failed:", err);
    }
  }

  async function handleAnalyze() {
    if (!filePath) {
      setStatusMessage({ kind: "error", text: "Vui lòng kéo thả hoặc chọn tệp Video / Audio trước khi phân tích." });
      return;
    }
    setAnalyzing(true);
    setProgress({
      stage: "extracting",
      percent: 5,
      message: "Bắt đầu trích xuất âm thanh và phân tích...",
      current_item: 0,
      total_items: 100,
    });
    setStatusMessage(null);

    try {
      const timeLimitSec = rangeMode === "3m" ? 180 : rangeMode === "10m" ? 600 : undefined;
      const proj = await sublix.dubbingAnalyze(filePath, sourceLang, targetLang, timeLimitSec);
      proj.dubbing_mode = selectedDubMode;
      setProject(proj);
      const scopeLabel = rangeMode === "3m" ? "3 phút đầu" : rangeMode === "10m" ? "10 phút đầu" : "toàn bộ phim";
      setStatusMessage({
        kind: "success",
        text: `✅ Phân tích thành công (${scopeLabel})! Phát hiện ${proj.speakers.length} vai nhân vật và ${proj.segments.length} câu thoại hoàn chỉnh (~${proj.media_duration_sec.toFixed(0)}s).`,
      });
    } catch (err) {
      setStatusMessage({ kind: "error", text: `Lỗi phân tích: ${err}` });
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  }

  async function handlePreviewTts(segment: DubbingSegment) {
    if (!project) return;
    const speaker = project.speakers.find((s) => s.id === segment.speaker_id) || project.speakers[0];
    setPreviewingId(segment.id);

    try {
      const dataUri = await sublix.dubbingPreviewTts(
        segment.dubbed_text,
        speaker.voice,
        speaker.rate,
        speaker.pitch
      );
      setAudioUrl(dataUri);
      if (audioRef.current) {
        audioRef.current.src = dataUri;
        audioRef.current.play().catch(() => {});
      }
    } catch (err) {
      setStatusMessage({ kind: "error", text: `Nghe thử thất bại: ${err}` });
    } finally {
      setPreviewingId(null);
    }
  }

  function handleUpdateSegmentText(id: number, newText: string) {
    if (!project) return;
    setProject({
      ...project,
      segments: project.segments.map((seg) =>
        seg.id === id ? { ...seg, dubbed_text: newText } : seg
      ),
    });
  }

  function handleUpdateSegmentSpeaker(id: number, newSpeakerId: string) {
    if (!project) return;
    setProject({
      ...project,
      segments: project.segments.map((seg) =>
        seg.id === id ? { ...seg, speaker_id: newSpeakerId } : seg
      ),
    });
  }

  function handleUpdateSpeakerVoice(speakerId: string, voiceId: string) {
    if (!project) return;
    setProject({
      ...project,
      speakers: project.speakers.map((spk) =>
        spk.id === speakerId ? { ...spk, voice: voiceId } : spk
      ),
    });
  }

  function handleUpdateSpeakerLabel(speakerId: string, label: string) {
    if (!project) return;
    setProject({
      ...project,
      speakers: project.speakers.map((spk) =>
        spk.id === speakerId ? { ...spk, label } : spk
      ),
    });
  }

  function handleAddSpeaker() {
    if (!project) return;
    const nextIdx = project.speakers.length + 1;
    const isMale = nextIdx % 2 !== 0;
    const newSpeaker: DubbingSpeaker = {
      id: `speaker_custom_${Date.now()}`,
      label: `Nhân vật ${nextIdx} (${isMale ? "Nam" : "Nữ"})`,
      voice: pickUnusedVoice(isMale),
      pitch: "+0Hz",
      rate: "+0%",
    };
    setProject({
      ...project,
      speakers: [...project.speakers, newSpeaker],
    });
    setStatusMessage({
      kind: "info",
      text: `Đã thêm vai diễn mới: ${newSpeaker.label}`,
    });
  }

  function handleRemoveSpeaker(speakerId: string) {
    if (!project || project.speakers.length <= 1) return;
    const remaining = project.speakers.filter((s) => s.id !== speakerId);
    const fallbackSpeakerId = remaining[0].id;
    const updatedSegments = project.segments.map((seg) =>
      seg.speaker_id === speakerId ? { ...seg, speaker_id: fallbackSpeakerId } : seg
    );
    setProject({
      ...project,
      speakers: remaining,
      segments: updatedSegments,
    });
  }

  async function handleExportVideo() {
    if (!project) return;
    setRendering(true);
    setProgress({
      stage: "synthesizing",
      percent: 5,
      message: "Bắt đầu tổng hợp giọng lồng tiếng...",
      current_item: 0,
      total_items: project.segments.length,
    });
    setStatusMessage(null);

    try {
      const out = await sublix.dubbingExport(project);
      setExportPath(out);
      setStatusMessage({
        kind: "success",
        text: `🎉 Lồng tiếng và xuất video thành công: ${out.split(/[\\/]/).pop()}`,
      });
    } catch (err) {
      setStatusMessage({ kind: "error", text: `Lỗi xuất video: ${err}` });
    } finally {
      setRendering(false);
      setProgress(null);
    }
  }

  const fileName = filePath ? filePath.split(/[/\\]/).pop() || "" : "";
  const fileExt = filePath ? filePath.split(".").pop()?.toUpperCase() || "" : "";

  // v0.9.9 — Voice catalog theo model: hiện danh sách giọng Nam/Nữ của từng model
  // (kể cả TRƯỚC khi tải) + mẫu nghe thử cache 1 lần + khớp voice đa vai.
  const EDGE_MODEL: VoiceModelStatus = {
    id: "edge-neural",
    name: "Edge Neural (có sẵn — cần mạng)",
    label: "Edge Neural",
    desc: "8 giọng đọc sẵn (Việt/Anh/Nhật/Trung) của Microsoft Edge — dùng ngay, không cần tải, cần Internet khi đọc.",
    category: "preset",
    size_mb: 0,
    size_note: "Có sẵn trong app",
    vram_note: "0 VRAM",
    license: "Microsoft Edge TTS",
    vi_support: "yes",
    is_cloud: false,
    files: [],
    downloaded: true,
  };

  const voicesForModel = (modelId: string): VoicePreset[] => {
    if (modelId === "kokoro-vi") return voices.filter((v) => v.id.startsWith("kokoro:"));
    if (modelId === "edge-neural") return voices.filter((v) => !v.id.startsWith("kokoro:"));
    return [];
  };

  const cleanVoiceName = (name: string): string =>
    name.replace(/^VN • /, "").replace(" (Kokoro — offline)", "").trim();

  const kokoroVoiceCount = voices.filter((v) => v.id.startsWith("kokoro:")).length;
  const kokoroSampleCount = (voiceSamples["kokoro-vi"] ?? []).filter((id) =>
    voices.some((v) => v.id === `kokoro:${id}`)
  ).length;

  const duplicateVoiceIds = (() => {
    const counts = new Map<string, number>();
    (project?.speakers ?? []).forEach((s) => counts.set(s.voice, (counts.get(s.voice) ?? 0) + 1));
    return new Set(Array.from(counts.entries()).filter(([, c]) => c > 1).map(([id]) => id));
  })();

  function pickUnusedVoice(isMale: boolean): string {
    const genderPool = voices.filter((v) => (isMale ? v.gender === "male" : v.gender !== "male"));
    const kokoroReady = voiceModels.some((m) => m.id === "kokoro-vi" && m.downloaded);
    const kokoroFirst = genderPool.filter((v) => v.id.startsWith("kokoro:"));
    const edgeLast = genderPool.filter((v) => !v.id.startsWith("kokoro:"));
    const pool = kokoroReady ? [...kokoroFirst, ...edgeLast] : [...edgeLast, ...kokoroFirst];
    const used = new Set((project?.speakers ?? []).map((s) => s.voice));
    const pick = pool.find((v) => !used.has(v.id)) ?? pool[0];
    return pick ? pick.id : isMale ? "vi-VN-NamMinhNeural" : "vi-VN-HoaiMyNeural";
  }

  // Prepare voice options for CustomSelect inside casting table (gender + engine rõ ràng)
  const voiceSelectOptions: SelectOption[] = [...voices]
    .sort((a, b) => Number(b.id.startsWith("kokoro:")) - Number(a.id.startsWith("kokoro:")))
    .map((v) => ({
      value: v.id,
      label: `${v.gender === "male" ? "♂ Nam" : "♀ Nữ"} — ${cleanVoiceName(v.name)}${v.id.startsWith("kokoro:") ? " (Kokoro offline)" : " (Edge, cần mạng)"}`,
      icon: v.gender === "male" ? "👨" : "👩",
      badge: v.lang.toUpperCase(),
      sublabel: v.description.slice(0, 30) + "...",
    }));

  return (
    <div className="dubbing-studio-container">
      {/* Hidden audio element for instant playback */}
      <audio ref={audioRef} src={audioUrl || undefined} style={{ display: "none" }} />

      {/* Header Banner */}
      <div className="dubbing-header">
        <div>
          <h1 className="dubbing-title">🎬 Studio Lồng Tiếng AI Đa Vai (AI Dubbing)</h1>
          <p className="dubbing-subtitle">
            Tự động nhận diện phân vai diễn viên (Diarization), biên kịch lời thoại điện ảnh theo ngôn ngữ đích (MiniMax-M3 / Local LLM) và tổng hợp giọng đọc Neural khớp từng khung hình.
          </p>
        </div>
        <div className="dubbing-badges">
          <span className="dubbing-badge badge-blue">⚡ Whisper Large-v3-Turbo</span>
          {activeProvider === "minimax" ? (
            <span className="dubbing-badge badge-purple" title="Đang dùng MiniMax-M3 Cloud API (Batch SOTA)">
              🧠 MiniMax-M3 Cloud Scriptwriter
            </span>
          ) : (
            <span className="dubbing-badge badge-gold" title="Đang dùng Qwen3-4B chạy GPU NVIDIA RTX 3090">
              ⚡ Local Qwen 3-4B (GPU RTX 3090)
            </span>
          )}
          <span className="dubbing-badge badge-green">🎙️ Neural Voice Cloning</span>
        </div>
      </div>

      {/* Notification Banner */}
      {statusMessage && (
        <div className={`dubbing-alert dubbing-alert-${statusMessage.kind}`}>
          <span className="alert-icon">{statusMessage.kind === "success" ? "✅" : statusMessage.kind === "error" ? "⚠️" : "ℹ️"}</span>
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* COMPACT VOICE & MODEL PICKER (chuyển từ Settings — model giọng nói thuộc mục Lồng Tiếng) */}
      <div className="dubbing-card dubbing-voice-hub">
        <button
          type="button"
          className="dubbing-voice-hub-head"
          onClick={() => setShowVoiceHub((v) => !v)}
          aria-expanded={showVoiceHub}
          title="Bấm để chọn giọng và tải model về dùng ngay"
        >
          <span className="dubbing-voice-hub-title">🎛 Chọn Giọng &amp; Tải Model</span>
          <span className="dubbing-voice-hub-hint">
            {voiceModels.length > 0
              ? `${voiceModels.filter((m) => m.downloaded).length}/${voiceModels.length} model đã tải`
              : "Đang nạp danh sách…"}{" "}
            • Bấm ▸ xem giọng Nam/Nữ
          </span>
          <span className="dubbing-voice-hub-caret">{showVoiceHub ? "▲" : "▼"}</span>
        </button>

        {showVoiceHub && (
          <div className="dubbing-voice-hub-body">
            {voiceModels.length === 0 && (
              <p className="dubbing-card-desc" style={{ margin: "4px 0" }}>Đang nạp danh sách model…</p>
            )}
            {(["clone", "preset", "diarization", "cloud"] as const).map((cat) => {
              const baseItems = voiceModels.filter((m) => m.category === cat);
              const items = cat === "preset" ? [EDGE_MODEL, ...baseItems] : baseItems;
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="dubbing-voice-hub-cat">{VOICE_CATEGORY_TITLES[cat]}</div>
                  {items.map((m) => {
                    const prog = voiceProgress[m.id];
                    const busy = !!prog && prog.phase !== "done" && prog.phase !== "error";
                    const modelVoices = voicesForModel(m.id);
                    const isOpen = expandedModel === m.id;
                    return (
                      <div key={m.id} className={`dubbing-voice-hub-block ${isOpen ? "is-open" : ""}`}>
                        <div className="dubbing-voice-hub-row">
                          <button
                            type="button"
                            className="dubbing-voice-hub-expand"
                            onClick={() => setExpandedModel(isOpen ? null : m.id)}
                            title="Xem danh sách giọng Nam/Nữ của model này"
                          >
                            {isOpen ? "▾" : "▸"}
                          </button>
                          <span
                            className="dubbing-voice-hub-name"
                            onClick={() => setExpandedModel(isOpen ? null : m.id)}
                            style={{ cursor: "pointer" }}
                          >
                            {m.name}
                          </span>
                          <span className="dubbing-voice-hub-size">{m.size_mb > 0 ? formatSizeMb(m.size_mb) : "—"}</span>
                          <span className="dubbing-voice-hub-action">
                            {m.is_cloud ? (
                              <span className="dubbing-voice-hub-state cloud">☁️ Dùng API</span>
                            ) : m.downloaded ? (
                              <span className="dubbing-voice-hub-state">✅ Đã tải</span>
                            ) : busy ? (
                              <span className="dubbing-voice-hub-progress">
                                <span className="dubbing-voice-hub-plabel">
                                  Đang tải {prog?.percent ?? 0}% — {formatBytes(prog?.downloaded_bytes)} /{" "}
                                  {prog?.total_bytes ? formatBytes(prog.total_bytes) : formatSizeMb(m.size_mb)}
                                </span>
                                <span className="dubbing-voice-hub-bar">
                                  <span style={{ width: `${prog?.percent ?? 0}%` }} />
                                </span>
                              </span>
                            ) : m.files.length === 0 ? (
                              <span className="dubbing-voice-hub-state locked">🔒 Cần HF</span>
                            ) : (
                              <button
                                type="button"
                                className="dubbing-voice-hub-dl"
                                disabled={voiceBusyId !== null}
                                onClick={() => handleVoiceDownload(m.id)}
                              >
                                ⬇️ Tải về ({formatSizeMb(m.size_mb)})
                              </button>
                            )}
                          </span>
                        </div>
                        {isOpen && (
                          <div className="dubbing-voice-list">
                            {modelVoices.length > 0 ? (
                              <>
                                {m.id === "kokoro-vi" && (
                                  <div className="dubbing-voice-list-toolbar">
                                    {m.downloaded ? (
                                      kokoroSampleCount >= kokoroVoiceCount && kokoroVoiceCount > 0 ? (
                                        <span className="dubbing-voice-sample-state">
                                          ✅ Đã có sẵn mẫu nghe thử {kokoroSampleCount}/{kokoroVoiceCount} giọng — bấm 🔊 để nghe tức thì.
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="dubbing-voice-gen-btn"
                                          onClick={handleGenerateSamples}
                                          disabled={generatingSamples}
                                        >
                                          {generatingSamples
                                            ? `⏳ Đang tạo mẫu ${sampleGenProgress?.done ?? 0}/${sampleGenProgress?.total ?? kokoroVoiceCount}…`
                                            : `🎧 Tạo mẫu nghe thử ${kokoroVoiceCount} giọng (chỉ 1 lần, cache lại)`}
                                        </button>
                                      )
                                    ) : (
                                      <span className="dubbing-voice-sample-state">
                                        ⬇️ Tải model Kokoro ở trên để bật nghe thử 14 giọng &amp; đọc offline (0đ, không mạng).
                                      </span>
                                    )}
                                  </div>
                                )}
                                {[
                                  { title: "♂ Giọng Nam", list: modelVoices.filter((v) => v.gender === "male") },
                                  { title: "♀ Giọng Nữ", list: modelVoices.filter((v) => v.gender !== "male") },
                                ].map(({ title, list }) =>
                                  list.length === 0 ? null : (
                                    <div key={title} className="dubbing-voice-group">
                                      <div className="dubbing-voice-group-title">
                                        {title} ({list.length})
                                      </div>
                                      <div className="dubbing-voice-group-items">
                                        {list.map((v) => {
                                          const hasSample = (voiceSamples[m.id] ?? []).includes(
                                            v.id.replace("kokoro:", "")
                                          );
                                          return (
                                            <span key={v.id} className="dubbing-voice-chip" title={v.description}>
                                              {cleanVoiceName(v.name)}
                                              {hasSample && <em className="dubbing-voice-chip-cached">cache</em>}
                                              <button
                                                type="button"
                                                className="dubbing-voice-play"
                                                onClick={() => handleAuditionVoice(v)}
                                                disabled={auditionVoiceId === v.id}
                                                title="Nghe thử giọng này"
                                              >
                                                {auditionVoiceId === v.id ? "⏳" : "🔊"}
                                              </button>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )
                                )}
                              </>
                            ) : (
                              <div className="dubbing-voice-note">
                                {m.category === "clone"
                                  ? "🧬 Model clone — không có giọng cố định sẵn. Khi nối vào pipeline, bạn cấp 1 clip giọng mẫu 5–10 giây cho MỖI vai để nhân bản chất giọng (khớp voice đa vai)."
                                  : m.id === "viet-tts"
                                  ? "🗣️ VietTTS có 24 giọng Việt sẵn (sơn tùng, ngọc ngạn, doraemon…) — danh sách hiện đầy đủ khi engine được nối vào pipeline."
                                  : m.is_cloud
                                  ? "☁️ Giọng cloud được chọn tại nhà cung cấp — nhập API key trong tab Cài đặt để dùng."
                                  : "ℹ️ Model này phục vụ phân vai / tách nhạc — không có danh sách giọng đọc sẵn."}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 1: MEDIA INPUT & DRAG AND DROP */}
      <div className="dubbing-card">
        <h2 className="dubbing-card-title">1. Chọn Hoặc Kéo Thả Video / Audio Cần Lồng Tiếng</h2>

        {!filePath ? (
          <div
            className={`dubbing-dropzone ${isDragging ? "is-drag-over" : ""}`}
            onClick={handleSelectFile}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                const f = e.dataTransfer.files[0];
                const p = (f as any).path || f.name;
                if (p) handleSetFile(p);
              }
            }}
          >
            <div className="dubbing-dropzone-icon-box">
              <span className="dubbing-dropzone-icon">{isDragging ? "📥" : "🎞️"}</span>
            </div>
            <div className="dubbing-dropzone-text">
              <div className="dropzone-headline">
                {isDragging ? "Thả video vào đây ngay!" : "Kéo thả file Video hoặc Audio vào đây"}
              </div>
              <div className="dropzone-subline">
                hoặc <span className="dropzone-browse-link">Bấm vào đây để duyệt file từ máy tính</span>
              </div>
            </div>
            <div className="dropzone-format-tags">
              {["MP4", "MKV", "MOV", "AVI", "WEBM", "MP3", "WAV"].map((ext) => (
                <span key={ext} className="dropzone-tag">{ext}</span>
              ))}
            </div>
          </div>
        ) : (
          <div className="dubbing-active-card">
            <div className="dubbing-active-icon">🎬</div>
            <div className="dubbing-active-info">
              <div className="dubbing-active-name-row">
                <span className="dubbing-active-filename">{fileName}</span>
                <span className="dubbing-active-ext">{fileExt}</span>
              </div>
              <div className="dubbing-active-path">{filePath}</div>
            </div>
            <div className="dubbing-active-actions">
              <button
                type="button"
                className="dubbing-btn dubbing-btn-secondary"
                onClick={handleSelectFile}
                disabled={analyzing || rendering}
              >
                🔄 Đổi file khác
              </button>
              <button
                type="button"
                className="dubbing-btn dubbing-btn-danger"
                onClick={() => {
                  if (!analyzing && !rendering) {
                    setFilePath("");
                    setProject(null);
                    setExportPath(null);
                  }
                }}
                disabled={analyzing || rendering}
                title="Bỏ chọn file"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: COMPREHENSIVE CONFIGURATION (INPUT & OUTPUT TARGET) */}
      <div className="dubbing-card">
        <h2 className="dubbing-card-title">2. Cấu Hình Ngôn Ngữ & Chế Độ Lồng Tiếng Điện Ảnh</h2>
        <p className="dubbing-card-desc">
          Lựa chọn ngôn ngữ thoại gốc của diễn viên trong phim và chỉ định ngôn ngữ đầu ra cần AI lồng tiếng.
        </p>

        <div className="dubbing-config-grid">
          {/* Source Language */}
          <div className="dubbing-config-item">
            <CustomSelect
              label="Ngôn ngữ gốc của video (Phát hiện / Chọn):"
              value={sourceLang}
              options={SOURCE_LANG_OPTIONS}
              onChange={setSourceLang}
              disabled={analyzing || rendering}
            />
          </div>

          {/* Target Language (ĐẦU RA CẦN LỒNG TIẾNG) */}
          <div className="dubbing-config-item">
            <CustomSelect
              label="Ngôn ngữ lồng tiếng đầu ra (Target Language):"
              value={targetLang}
              options={TARGET_LANG_OPTIONS}
              onChange={setTargetLang}
              disabled={analyzing || rendering}
            />
          </div>
        </div>

        {/* AI Scriptwriter Engine Switcher */}
        <div className="dubbing-mode-container" style={{ marginTop: 14 }}>
          <label className="dubbing-mode-title">
            Bộ Não Biên Kịch Lời Thoại (AI Scriptwriter Engine):
            <span style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 400, marginLeft: 8 }}>
              (Chuyển đổi 1-click giữa mô hình GPU nội bộ siêu tốc hoặc mô hình Cloud AI)
            </span>
          </label>
          <div className="dubbing-engine-options">
            <div
              className={`dubbing-engine-card ${activeProvider !== "minimax" ? "active" : ""}`}
              onClick={() => handleSwitchProvider("local")}
            >
              <div className="engine-card-header">
                <span className="engine-icon">⚡</span>
                <span className="engine-title">Local Qwen 3-4B (NVIDIA RTX 3090 GPU)</span>
                <span className="scope-tag-gold">Siêu Tốc ~0.1s & Offline</span>
              </div>
              <p className="engine-desc">
                Chạy trực tiếp 100% trên card màn hình RTX 3090 (CUDA). Không độ trễ mạng, <strong>tốc độ siêu nhanh (~20s cho cả bộ phim dài)</strong>, 100% riêng tư và ngoại tuyến.
              </p>
            </div>

            <div
              className={`dubbing-engine-card ${activeProvider === "minimax" ? "active" : ""}`}
              onClick={() => handleSwitchProvider("minimax")}
            >
              <div className="engine-card-header">
                <span className="engine-icon">🧠</span>
                <span className="engine-title">MiniMax-M3 (Cloud AI Điện Ảnh)</span>
                <span className="engine-tag-purple">Văn Phong SOTA</span>
              </div>
              <p className="engine-desc">
                Mô hình MoE lớn trên Cloud, văn phong đối thoại trau chuốt chuẩn điện ảnh. Đã tối ưu ghép cụm (Batch Translation) tăng tốc 15x-20x. Cần kết nối Internet.
              </p>
            </div>
          </div>
        </div>

        {/* Dubbing Scope / Time Range Selection */}
        <div className="dubbing-mode-container" style={{ marginTop: 14 }}>
          <label className="dubbing-mode-title">
            Phạm Vi Thời Lượng Lồng Tiếng:
            <span style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 400, marginLeft: 8 }}>
              (Chọn 3 phút đầu để test thử giọng & kịch bản siêu tốc trong 20s trước khi lồng tiếng cả phim dài)
            </span>
          </label>
          <div className="dubbing-scope-options">
            <div
              className={`dubbing-scope-card ${rangeMode === "3m" ? "active" : ""}`}
              onClick={() => setRangeMode("3m")}
            >
              <div className="scope-header">
                <span className="scope-icon">⚡</span>
                <span className="scope-title">Thử Nghiệm 3 Phút Đầu</span>
                <span className="scope-tag-gold">Khuyên Dùng</span>
              </div>
              <p className="scope-desc">
                Chỉ phân tích & lồng tiếng 3 phút đầu video (~20 giây hoàn tất). Rất phù hợp kiểm tra nhanh chất giọng và đối thoại tức thì!
              </p>
            </div>

            <div
              className={`dubbing-scope-card ${rangeMode === "10m" ? "active" : ""}`}
              onClick={() => setRangeMode("10m")}
            >
              <div className="scope-header">
                <span className="scope-icon">⏱️</span>
                <span className="scope-title">Trích Đoạn 10 Phút Đầu</span>
              </div>
              <p className="scope-desc">
                Lồng tiếng 10 phút đầu của video (~1 phút hoàn tất). Thích hợp phim ngắn hoặc đoạn cao trào.
              </p>
            </div>

            <div
              className={`dubbing-scope-card ${rangeMode === "full" ? "active" : ""}`}
              onClick={() => setRangeMode("full")}
            >
              <div className="scope-header">
                <span className="scope-icon">🎬</span>
                <span className="scope-title">Toàn Bộ Video (Full)</span>
              </div>
              <p className="scope-desc">
                Lồng tiếng từ đầu đến cuối toàn bộ video. Tốc độ đã được tăng tốc tối đa nhờ dịch theo cụm (Batch Translation).
              </p>
            </div>
          </div>
        </div>

        {/* Dubbing Mode Cards */}
        <div className="dubbing-mode-container" style={{ marginTop: 14 }}>
          <label className="dubbing-mode-title">Chế Độ Xử Lý Âm Thanh:</label>
          <div className="dubbing-mode-options">
            <div
              className={`dubbing-mode-card ${selectedDubMode === "ducking" ? "active" : ""}`}
              onClick={() => {
                setSelectedDubMode("ducking");
                if (project) setProject({ ...project, dubbing_mode: "ducking" });
              }}
            >
              <div className="dubbing-mode-header">
                <span className="dubbing-mode-icon">🎙️</span>
                <span className="dubbing-mode-name">Thuyết Minh Điện Ảnh (Audio Ducking)</span>
              </div>
              <p className="dubbing-mode-desc">
                Giữ nguyên âm thanh gốc (nhạc nền + tiếng động), tự động hạ nhỏ âm lượng gốc xuống 25% khi có thoại để giọng lồng tiếng mới đè lên rõ ràng, truyền cảm. Phù hợp phim tài liệu, tin tức, phim bộ.
              </p>
            </div>

            <div
              className={`dubbing-mode-card ${selectedDubMode === "vocal_isolation" ? "active" : ""}`}
              onClick={() => {
                setSelectedDubMode("vocal_isolation");
                if (project) setProject({ ...project, dubbing_mode: "vocal_isolation" });
              }}
            >
              <div className="dubbing-mode-header">
                <span className="dubbing-mode-icon">🎭</span>
                <span className="dubbing-mode-name">Lồng Tiếng Chiếu Rạp (Demucs v4 CUDA)</span>
                <span className="dubbing-mode-badge">Khuyên Dùng Cho Phim Rạp</span>
              </div>
              <p className="dubbing-mode-desc">
                AI bóc tách và xóa sạch 100% giọng gốc của diễn viên nước ngoài, giữ lại 100% Nhạc Nền (BGM) và Hiệu Ứng Âm Thanh (SFX), sau đó khớp giọng lồng tiếng mới hoàn toàn. Chuẩn chiếu rạp!
              </p>
            </div>
          </div>
        </div>

        {/* Start Analysis Button */}
        <div className="dubbing-start-row">
          <button
            type="button"
            className="dubbing-btn dubbing-btn-primary dubbing-btn-large"
            onClick={handleAnalyze}
            disabled={!filePath || analyzing || rendering}
          >
            {analyzing ? (
              <>⏳ Đang Phân Tích & Viết Kịch Bản Lồng Tiếng...</>
            ) : (
              <>
                🚀 Bắt Đầu Phân Tích & Lập Kịch Bản [{targetLang.toUpperCase()}]{" "}
                {rangeMode === "3m" ? "(3 Phút Đầu)" : rangeMode === "10m" ? "(10 Phút Đầu)" : "(Toàn Bộ Video)"}
              </>
            )}
          </button>
        </div>

        {/* Real-time Progress Bar */}
        {(analyzing || rendering) && progress && (
          <div className="dubbing-progress-box">
            <div className="dubbing-progress-header">
              <span className="dubbing-progress-msg">{progress.message}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="dubbing-progress-percent">{Math.round(progress.percent)}%</span>
                <button
                  type="button"
                  className="dubbing-btn dubbing-btn-danger dubbing-btn-cancel"
                  onClick={handleCancel}
                  title="Dừng tiến trình ngay lập tức"
                >
                  🛑 Dừng lại (Hủy bỏ)
                </button>
              </div>
            </div>
            <div className="dubbing-progress-bar-bg">
              <div
                className="dubbing-progress-bar-fill"
                style={{ width: `${Math.min(100, Math.max(3, progress.percent))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: VOICE SHOWCASE & INSTANT AUDITION PREVIEW */}
      <div className="dubbing-card">
        <div className="dubbing-voice-header">
          <div>
            <h2 className="dubbing-card-title" style={{ margin: 0 }}>
              3. Thư Viện Giọng Lồng Tiếng AI (Neural Voice Showcase)
            </h2>
            <p className="dubbing-card-desc">
              Bấm nút "Nghe thử" để kiểm tra chất giọng của các diễn viên lồng tiếng AI trước khi xuất bản.
            </p>
          </div>
        </div>

        <div className="dubbing-voice-showcase-grid">
          {voices.map((v) => (
            <div key={v.id} className="voice-card">
              <div className="voice-avatar-box">
                <span className="voice-avatar">{v.gender === "male" ? "👨" : "👩"}</span>
              </div>
              <div className="voice-info">
                <div className="voice-name-row">
                  <span className="voice-name">{v.name}</span>
                  <span className="voice-lang-pill">{v.lang.toUpperCase()}</span>
                </div>
                <div className="voice-desc">{v.description}</div>
              </div>
              <button
                type="button"
                className="voice-audition-btn"
                onClick={() => handleAuditionVoice(v)}
                disabled={auditionVoiceId === v.id}
                title={`Nghe thử chất giọng của ${v.name}`}
              >
                {auditionVoiceId === v.id ? "⏳ Đang đọc..." : "🔊 Nghe thử"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4: SPEAKER CASTING (HIỂN THỊ KHI ĐÃ PHÂN TÍCH XONG) */}
      {project && (
        <div className="dubbing-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div>
              <h2 className="dubbing-card-title" style={{ margin: 0 }}>
                4. Phân Vai Diễn Viên Đa Nhân Vật (Speaker Casting)
              </h2>
              <p className="dubbing-card-desc">
                Gán giọng đọc tương ứng cho từng vai diễn phát hiện trong video. Bạn có thể thêm/bớt hoặc đổi vai tùy ý.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="dubbing-btn dubbing-btn-secondary"
                onClick={handleAddSpeaker}
                style={{ fontSize: 12, padding: "5px 12px" }}
              >
                ➕ Thêm Nhân Vật Mới
              </button>
              <span style={{ fontSize: 13, color: "var(--ac-txt)", fontWeight: 600 }}>
                Thời lượng: ~{Math.round(project.media_duration_sec)}s • {project.segments.length} câu thoại • {project.speakers.length} nhân vật
              </span>
            </div>
          </div>

          {/* Speakers List */}
          <div className="dubbing-speakers-grid">
            {project.speakers.map((spk, idx) => {
              const matchedVoice = voices.find((v) => v.id === spk.voice);
              const isFemale = matchedVoice?.gender === "female";
              return (
                <div key={spk.id} className="dubbing-speaker-card">
                  <div className="dubbing-speaker-header">
                    <span className={`dubbing-speaker-avatar speaker-avatar-${idx % 4}`}>
                      {isFemale ? "👩" : "👨"}
                    </span>
                    <input
                      type="text"
                      value={spk.label}
                      onChange={(e) => handleUpdateSpeakerLabel(spk.id, e.target.value)}
                      className="dubbing-speaker-label-input"
                      title="Đổi tên/vai nhân vật"
                    />
                    {duplicateVoiceIds.has(spk.voice) && (
                      <span
                        className="dubbing-dup-chip"
                        title="Vai này đang trùng giọng với vai khác — đổi giọng để khán giả phân biệt được từng nhân vật."
                      >
                        ⚠️ Trùng giọng
                      </span>
                    )}
                    {project.speakers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSpeaker(spk.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: 14,
                          padding: "2px 6px",
                          marginLeft: 4,
                        }}
                        title="Xóa nhân vật này"
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <CustomSelect
                      label="Giọng Đọc AI:"
                      value={spk.voice}
                      options={voiceSelectOptions}
                      onChange={(newVoice) => handleUpdateSpeakerVoice(spk.id, newVoice)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Audio Mixing Balance */}
          <div className="dubbing-mix-controls">
            <div className="dubbing-mix-slider-group">
              <label>
                🎵 Nhạc Nền Gốc (BGM Ducking):{" "}
                <strong>{Math.round(project.bgm_volume * 100)}%</strong>
              </label>
              <input
                type="range"
                min="0.05"
                max="0.80"
                step="0.05"
                value={project.bgm_volume}
                onChange={(e) =>
                  setProject({ ...project, bgm_volume: parseFloat(e.target.value) })
                }
                className="dubbing-range"
              />
              <span className="dubbing-slider-hint">Hạ nhỏ nhạc nền khi có lời thoại để giọng nói rõ nét</span>
            </div>

            <div className="dubbing-mix-slider-group">
              <label>
                🎙️ Giọng Lồng Tiếng (Voice Boost):{" "}
                <strong>{Math.round(project.voice_volume * 100)}%</strong>
              </label>
              <input
                type="range"
                min="0.80"
                max="1.80"
                step="0.05"
                value={project.voice_volume}
                onChange={(e) =>
                  setProject({ ...project, voice_volume: parseFloat(e.target.value) })
                }
                className="dubbing-range"
              />
              <span className="dubbing-slider-hint">Tăng âm lượng lời lồng tiếng phim</span>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: INTERACTIVE SCRIPT TABLE & EXPORT */}
      {project && (
        <div className="dubbing-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 className="dubbing-card-title" style={{ margin: 0 }}>
              5. Kịch Bản Thoại & Tinh Chỉnh (Script Editor)
            </h2>
            <span style={{ fontSize: 12, color: "var(--ac-txt)" }}>
              💡 Bạn có thể sửa trực tiếp câu lồng tiếng và bấm "Nghe thử" từng câu
            </span>
          </div>

          <div className="dubbing-table-container">
            <table className="dubbing-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th style={{ width: 120 }}>Thời Gian</th>
                  <th style={{ width: 140 }}>Người Nói</th>
                  <th>Câu Thoại Gốc ({sourceLang.toUpperCase()})</th>
                  <th>Câu Lồng Tiếng ({targetLang.toUpperCase()})</th>
                  <th style={{ width: 110 }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {project.segments.map((seg) => (
                  <tr key={seg.id}>
                    <td className="td-index">{seg.id}</td>
                    <td className="td-time">
                      {formatSeconds(seg.start_sec)} ➔ {formatSeconds(seg.end_sec)}
                      <div className="td-duration">
                        ({(seg.end_sec - seg.start_sec).toFixed(1)}s)
                      </div>
                    </td>
                    <td>
                      <select
                        value={seg.speaker_id}
                        onChange={(e) => handleUpdateSegmentSpeaker(seg.id, e.target.value)}
                        className="dubbing-speaker-tag"
                      >
                        {project.speakers.map((spk) => (
                          <option key={spk.id} value={spk.id}>
                            {spk.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td-original">{seg.original_text}</td>
                    <td>
                      <textarea
                        value={seg.dubbed_text}
                        onChange={(e) => handleUpdateSegmentText(seg.id, e.target.value)}
                        rows={2}
                        className="dubbing-textarea"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handlePreviewTts(seg)}
                        disabled={previewingId === seg.id}
                        className="dubbing-btn-preview"
                      >
                        {previewingId === seg.id ? "⏳ Đang đọc..." : "🔊 Nghe Thử"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Export Action Bar */}
          <div className="dubbing-export-bar">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {exportPath && (
                <>
                  <span style={{ fontSize: 13, color: "var(--ok)", fontWeight: 600 }}>
                    ✅ Đã xuất: {exportPath.split(/[\\/]/).pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => sublix.dubbingOpenOutputFolder(exportPath)}
                    className="dubbing-btn dubbing-btn-secondary"
                    style={{ fontSize: 12, padding: "6px 12px" }}
                    title="Mở thư mục chứa video lồng tiếng vừa xuất"
                  >
                    📂 Mở Thư Mục Lồng Tiếng
                  </button>
                </>
              )}
              {/* v0.9.8: Always-on button to jump to the input video's folder, so users
                  can browse other files in the same folder (subtitles, srt, raw audio) while
                  the analysis is running or before export. */}
              {filePath && (
                <button
                  type="button"
                  onClick={() => sublix.dubbingOpenOutputFolder(filePath)}
                  className="dubbing-btn dubbing-btn-secondary"
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  title="Mở thư mục chứa video gốc đã chọn"
                >
                  📂 Mở Thư Mục File Gốc
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleExportVideo}
              disabled={rendering || analyzing}
              className="dubbing-btn dubbing-btn-export"
            >
              {rendering ? "⏳ Đang Ghép Audio & Xuất Video..." : `🎬 Xuất Video Lồng Tiếng [${targetLang.toUpperCase()}]`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 10);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
}
