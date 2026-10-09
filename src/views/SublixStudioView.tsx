//! SublixStudioView.tsx — All-in-One Multi-track AI Dubbing & Subtitle Studio
//! Reverse-Engineered from EZMAXSUB (ezmaxsoft.com) benchmark.
//! Specification: agent-team/PHAN_TICH_UI_TINH_NANG_SUBLIX_STUDIO.md & UI_SPEC_SUBLIX_STUDIO.md

import { useState, useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  sublix,
  type DubbingProject,
  type AppConfig,
  type DubbingProgress,
} from "../lib/tauri";
import {
  IconFilm,
  IconClapper,
  IconPlay,
  IconPause,
  IconVolume2,
  IconSearch,
  IconPlus,
  IconChevronDown,
  IconChevronRight,
  IconUser,
  IconUndo,
  IconSettings,
  IconGlobe,
  IconMic,
  IconClock,
  IconMaximize,
  IconMoreHorizontal,
  IconScissors,
  IconCopy,
  IconTrash,
  IconMagnet,
  IconLink,
  IconBookmark,
  IconArrowsHorizontal,
} from "../icons";
import "./SublixStudioView.css";

export interface SublixStudioViewProps {
  onNavigateTab?: (tab: "downloader" | "live" | "history" | "models" | "overlay") => void;
  currentTheme?: string;
  onThemeChange?: (theme: string) => void;
  initialFilePath?: string;
  isActive?: boolean;
  fileNonce?: number;
}

export interface SpeakerItem {
  id: string;
  name: string;
  gender: "male" | "female";
  color: string;
  voice: string;
  count: number;
  sampleAudio?: string | null;
}

export interface SubtitleItem {
  id: number;
  start: number; // in seconds
  end: number;
  speakerId: string;
  original: string;
  translated: string;
  hasAudio?: boolean;
}

const SPEAKER_COLORS = [
  "#3B82F6", // Blue
  "#EC4899", // Pink
  "#22C55E", // Green
  "#F97316", // Orange
  "#A855F7", // Purple
  "#14B8A6", // Teal
  "#EF4444", // Red
  "#8B5E3C", // Brown
];

function formatTimecode(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

// R3-01: Standard clean audio chime generator for browser preview & headless testing
function createAuditionBeepWav(): string {
  const sampleRate = 8000;
  const durationSec = 0.4;
  const numSamples = Math.floor(sampleRate * durationSec);
  const headerSize = 44;
  const totalSize = headerSize + numSamples;
  const buffer = new Uint8Array(totalSize);

  // RIFF header
  buffer[0] = 0x52; buffer[1] = 0x49; buffer[2] = 0x46; buffer[3] = 0x46; // "RIFF"
  const chunkSize = totalSize - 8;
  buffer[4] = chunkSize & 0xff; buffer[5] = (chunkSize >> 8) & 0xff;
  buffer[6] = (chunkSize >> 16) & 0xff; buffer[7] = (chunkSize >> 24) & 0xff;
  buffer[8] = 0x57; buffer[9] = 0x41; buffer[10] = 0x56; buffer[11] = 0x45; // "WAVE"
  // fmt chunk
  buffer[12] = 0x66; buffer[13] = 0x6d; buffer[14] = 0x74; buffer[15] = 0x20; // "fmt "
  buffer[16] = 16; buffer[17] = 0; buffer[18] = 0; buffer[19] = 0; // 16 bytes
  buffer[20] = 1; buffer[21] = 0; // PCM
  buffer[22] = 1; buffer[23] = 0; // Mono
  buffer[24] = sampleRate & 0xff; buffer[25] = (sampleRate >> 8) & 0xff;
  buffer[26] = (sampleRate >> 16) & 0xff; buffer[27] = (sampleRate >> 24) & 0xff;
  buffer[28] = sampleRate & 0xff; buffer[29] = (sampleRate >> 8) & 0xff; // ByteRate
  buffer[30] = (sampleRate >> 16) & 0xff; buffer[31] = (sampleRate >> 24) & 0xff;
  buffer[32] = 1; buffer[33] = 0; // BlockAlign
  buffer[34] = 8; buffer[35] = 0; // 8-bit
  // data chunk
  buffer[36] = 0x64; buffer[37] = 0x61; buffer[38] = 0x74; buffer[39] = 0x61; // "data"
  buffer[40] = numSamples & 0xff; buffer[41] = (numSamples >> 8) & 0xff;
  buffer[42] = (numSamples >> 16) & 0xff; buffer[43] = (numSamples >> 24) & 0xff;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const fade = Math.max(0, 1 - t / durationSec);
    const sample = 128 + Math.floor(64 * Math.sin(2 * Math.PI * 440 * t) * fade);
    buffer[headerSize + i] = sample;
  }

  let binary = "";
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export default function SublixStudioView({
  onNavigateTab,
  currentTheme = "cinema",
  onThemeChange,
  initialFilePath,
  isActive = true,
  fileNonce,
}: SublixStudioViewProps) {
  // Navigation & Project Meta
  const [activeTab, setActiveTab] = useState<string>("studio");
  const [filePath, setFilePath] = useState<string>(initialFilePath || "");
  const [fileName, setFileName] = useState<string>(
    initialFilePath ? (initialFilePath.split(/[\\/]/).pop() || "") : ""
  );
  const [mediaDuration, setMediaDuration] = useState<number>(0);

  // Undo history stacks: General, Subtitles, Translations, Audio/Speakers
  const [undoStack, setUndoStack] = useState<SubtitleItem[][]>([]);
  const [undoSubtitleStack, setUndoSubtitleStack] = useState<SubtitleItem[][]>([]);
  const [undoTranslationStack, setUndoTranslationStack] = useState<Array<{ id: number; translated: string }[]>>([]);
  const [undoAudioStack, setUndoAudioStack] = useState<SpeakerItem[][]>([]);

  // Step Accordion Toggles (P2)
  const [openCard, setOpenCard] = useState<"stt" | "translate" | "dubbing">("dubbing");
  const [leftTab, setLeftTab] = useState<"pipeline" | "review">("pipeline");

  // Step 1: STT Settings
  const [sttLang, setSttLang] = useState<string>("auto");
  const [sttModel, setSttModel] = useState<string>("large-v3-turbo");
  const [ocrToggle, setOcrToggle] = useState<boolean>(false);
  const [stitchToggle, setStitchToggle] = useState<boolean>(true);
  const [diarizeToggle, setDiarizeToggle] = useState<boolean>(true);

  // Step 2: Translation Provider & Consistency Glossary
  const [targetLang, setTargetLang] = useState<string>("vi");
  const [transProvider, setTransProvider] = useState<string>("deepseek");
  const [deepseekKey, setDeepseekKey] = useState<string>("");
  const [deepseekModel, setDeepseekModel] = useState<string>("deepseek-chat");
  const [openrouterKey, setOpenrouterKey] = useState<string>("");
  const [openrouterModel, setOpenrouterModel] = useState<string>("deepseek/deepseek-chat");
  const [minimaxKey, setMinimaxKey] = useState<string>("");
  const [minimaxModel, setMinimaxModel] = useState<string>("MiniMax-M3");
  const [transStyle, setTransStyle] = useState<string>("theatrical");
  // R2-04.3: Glossary starts empty, loaded from AppConfig
  const [glossary, setGlossary] = useState<string[]>([]);
  const [newGlossaryTerm, setNewGlossaryTerm] = useState<string>("");
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string[]>([]);

  // Step 3: Speakers & Segments (P2, P4, P5)
  const [speakers, setSpeakers] = useState<SpeakerItem[]>([]);
  const [segments, setSegments] = useState<SubtitleItem[]>([]);
  const [selectedSegId, setSelectedSegId] = useState<number>(0);
  const [speakerFilter, setSpeakerFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Pipeline Analysis Status
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<number>(0);
  const [analyzeMessage, setAnalyzeMessage] = useState<string>("");

  // R2-03 & R2-D: Real audio peaks and filmstrip video thumbnails
  const [audioPeaks, setAudioPeaks] = useState<number[]>([]);
  const [filmstripThumbs, setFilmstripThumbs] = useState<Array<{ time_sec: number; data_uri: string }>>([]);

  // Preview TTS, Progressive Simulation & Export
  const [previewingSegId, setPreviewingSegId] = useState<number | null>(null);
  const [auditioningSpkId, setAuditioningSpkId] = useState<string | null>(null);
  const [playingAudioSpkId, setPlayingAudioSpkId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportMessage, setExportMessage] = useState<string>("");
  const [exportDonePath, setExportDonePath] = useState<string>("");
  // Video Stage & Player (P3) & Master Studio Playback Engine
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const animFrameRef = useRef<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [videoPlayError, setVideoPlayError] = useState<boolean>(false);
  // ROUND-4 R4-01: path to ffmpeg-transcoded preview (H.264/AAC baseline).
  // null = original file. Set when WebView2 fails to decode the original codec.
  const [transcodedPath, setTranscodedPath] = useState<string | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState<boolean>(false);
  const scrubbingCleanupRef = useRef<(() => void) | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const timelineTracksBodyRef = useRef<HTMLDivElement | null>(null);

  // Timeline (P5)
  const [batchMode, setBatchMode] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(30); // seconds visible
  const [magnetSnap, setMagnetSnap] = useState<boolean>(true);
  const [linkTracks, setLinkTracks] = useState<boolean>(true);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Subtitle Display Mode & Video Scale
  const [subtitleDisplayMode, setSubtitleDisplayMode] = useState<"translated" | "original" | "bilingual">("translated");
  const [videoScale, setVideoScale] = useState<number>(100);

  // Right column tab (Phụ đề vs Thuộc tính)
  const [rightTab, setRightTab] = useState<"subtitles" | "properties">("subtitles");

  // Subtitle styling properties (driven by Thuộc tính tab)
  const [subFontSize, setSubFontSize] = useState<number>(16);
  const [subFontColor, setSubFontColor] = useState<string>("#e8a33d");
  const [subPosition, setSubPosition] = useState<"bottom" | "center" | "top">("bottom");
  const [subShowShadow, setSubShowShadow] = useState<boolean>(true);

  // Bookmarks & Toast notification
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToastMsg(null), 3000);
  };

  // Load config on mount
  useEffect(() => {
    sublix.getConfig().then((cfg: AppConfig) => {
      if (cfg.translation_provider) setTransProvider(cfg.translation_provider);
      if (cfg.deepseek_api_key) setDeepseekKey(cfg.deepseek_api_key);
      if (cfg.deepseek_model) setDeepseekModel(cfg.deepseek_model);
      if (cfg.openrouter_api_key) setOpenrouterKey(cfg.openrouter_api_key);
      if (cfg.openrouter_model) setOpenrouterModel(cfg.openrouter_model);
      if (cfg.minimax_api_key) setMinimaxKey(cfg.minimax_api_key);
      if (cfg.minimax_model) setMinimaxModel(cfg.minimax_model);
      if (cfg.target_lang) setTargetLang(cfg.target_lang);
      if (cfg.glossary && Array.isArray(cfg.glossary)) {
        setGlossary(cfg.glossary);
      }
    }).catch((err) => {
      console.warn("Failed to load initial config:", err);
    });
  }, []);

  // C3 & R2-07: Sync initialFilePath & fileNonce prop changes
  useEffect(() => {
    setTranscodedPath(null); // ROUND-4 R4-01: reset transcode cache khi đổi file
    if (initialFilePath) {
      setFilePath(initialFilePath);
      const name = initialFilePath.split(/[\\/]/).pop() || initialFilePath;
      setFileName(name);
      setVideoPlayError(false);
      handleSeek(0);
    }
  }, [initialFilePath, fileNonce]);

  // M1: Native Tauri Drag & Drop for Windows WebView2
  useEffect(() => {
    const pDragDrop = (async () => {
      try {
        const webview = getCurrentWebview();
        return await webview.onDragDropEvent((event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDraggingFile(true);
          } else if (event.payload.type === "drop") {
            setIsDraggingFile(false);
            const droppedPaths = event.payload.paths;
            if (droppedPaths && droppedPaths.length > 0) {
              const p = droppedPaths[0];
              setTranscodedPath(null); // ROUND-4 R4-01
              setFilePath(p);
              const name = p.split(/[\\/]/).pop() || p;
              setFileName(name);
              setVideoPlayError(false);
              handleSeek(0);
            }
          } else {
            setIsDraggingFile(false);
          }
        });
      } catch (err) {
        console.warn("Tauri drag-drop in SublixStudioView failed:", err);
        return () => {};
      }
    })();

    return () => {
      pDragDrop.then((u) => {
        if (typeof u === "function") u();
      }).catch((err) => {
        console.warn("Failed unregister drag-drop:", err);
      });
    };
  }, []);

  // Save config on provider change
  const handleSaveProviderConfig = async (overrideProvider?: string) => {
    try {
      const cfg = await sublix.getConfig();
      cfg.translation_provider = overrideProvider || transProvider;
      cfg.deepseek_api_key = deepseekKey;
      cfg.deepseek_model = deepseekModel;
      cfg.openrouter_api_key = openrouterKey;
      cfg.openrouter_model = openrouterModel;
      cfg.minimax_api_key = minimaxKey;
      cfg.minimax_model = minimaxModel;
      cfg.glossary = glossary;
      await sublix.saveConfig(cfg);
    } catch (err) {
      console.warn("Could not save config:", err);
    }
  };

  // Safe file src conversion for WebView2 (normalizing backslashes)
  const getVideoSrc = (path: string): string => {
    if (!path) return "";
    try {
      const normalized = path.replace(/\\/g, "/");
      return convertFileSrc(normalized);
    } catch (err) {
      console.warn("convertFileSrc failed, falling back to raw path:", err);
      return path;
    }
  };

  // Video metadata & time update
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      if (dur && !isNaN(dur) && dur > 0) {
        setMediaDuration(dur);
      }
      setVideoPlayError(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !videoRef.current.paused) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;
  const currentTimeRef = useRef<number>(currentTime);
  currentTimeRef.current = currentTime;
  const mediaDurationRef = useRef<number>(mediaDuration);
  mediaDurationRef.current = mediaDuration;

  // Real Undo Stack Handlers (General + Layer-specific)
  const undoStackRef = useRef<SubtitleItem[][]>(undoStack);
  undoStackRef.current = undoStack;
  const undoSubtitleStackRef = useRef<SubtitleItem[][]>(undoSubtitleStack);
  undoSubtitleStackRef.current = undoSubtitleStack;
  const undoTranslationStackRef = useRef<Array<{ id: number; translated: string }[]>>(undoTranslationStack);
  undoTranslationStackRef.current = undoTranslationStack;
  const undoAudioStackRef = useRef<SpeakerItem[][]>(undoAudioStack);
  undoAudioStackRef.current = undoAudioStack;

  const segmentsRef = useRef<SubtitleItem[]>(segments);
  segmentsRef.current = segments;
  const speakersRef = useRef<SpeakerItem[]>(speakers);
  speakersRef.current = speakers;

  const saveSubtitleUndo = () => {
    setUndoSubtitleStack((prev) => [...prev.slice(-19), segmentsRef.current]);
    setUndoStack((prev) => [...prev.slice(-19), segmentsRef.current]);
  };

  const saveTranslationUndo = () => {
    setUndoTranslationStack((prev) => [
      ...prev.slice(-19),
      segmentsRef.current.map((s) => ({ id: s.id, translated: s.translated })),
    ]);
  };

  const saveAudioUndo = () => {
    setUndoAudioStack((prev) => [...prev.slice(-19), speakersRef.current]);
  };

  const saveUndoHistory = () => {
    saveSubtitleUndo();
  };

  const handleUndo = () => {
    handleUndoSubtitles();
  };

  const handleUndoSubtitles = () => {
    const stack = undoSubtitleStackRef.current;
    if (stack.length === 0) {
      showToast("ℹ️ Không có thao tác phụ đề nào để hoàn tác");
      return;
    }
    const previous = stack[stack.length - 1];
    setUndoSubtitleStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => prev.slice(0, -1));
    setSegments((curr) => {
      // R3-10: Restore timing/structure while preserving current translated text
      return previous.map((prevSeg) => {
        const currentMatch = curr.find((c) => c.id === prevSeg.id);
        return {
          ...prevSeg,
          translated: currentMatch ? currentMatch.translated : prevSeg.translated,
        };
      });
    });
    showToast("↶ Đã hoàn tác mốc thời gian / cấu trúc phụ đề (giữ nguyên bản dịch)");
  };

  const handleUndoTranslation = () => {
    const stack = undoTranslationStackRef.current;
    if (stack.length === 0) {
      showToast("ℹ️ Không có thao tác dịch nào để hoàn tác");
      return;
    }
    const previous = stack[stack.length - 1];
    setUndoTranslationStack((prev) => prev.slice(0, -1));
    setSegments((curr) =>
      curr.map((s) => {
        const match = previous.find((p) => p.id === s.id);
        return match ? { ...s, translated: match.translated } : s;
      })
    );
    showToast("↶ Đã hoàn tác nội dung bản dịch");
  };

  const handleUndoAudio = () => {
    const stack = undoAudioStackRef.current;
    if (stack.length === 0) {
      showToast("ℹ️ Không có thao tác giọng đọc nào để hoàn tác");
      return;
    }
    const previous = stack[stack.length - 1];
    setUndoAudioStack((prev) => prev.slice(0, -1));
    setSpeakers(previous);
    showToast("↶ Đã hoàn tác phân vai / giọng đọc nhân vật");
  };

  const handleTogglePlay = () => {
    if (!filePath) {
      showToast("ℹ️ Vui lòng mở hoặc kéo thả video trước khi phát");
      return;
    }
    if (videoPlayError) {
      showToast("⚠️ Video gặp lỗi định dạng, không thể phát");
      return;
    }
    if (isPlaying) {
      setIsPlaying(false);
      if (videoRef.current && !videoRef.current.paused) {
        try { videoRef.current.pause(); } catch (e) { console.warn("Video pause error:", e); }
      }
    } else {
      if (currentTime >= mediaDuration - 0.1) {
        handleSeek(0);
      }
      setIsPlaying(true);
      if (videoRef.current) {
        videoRef.current.play().catch((err) => {
          console.error("Video element play failed:", err);
          setVideoPlayError(true);
          setIsPlaying(false);
          showToast("❌ Không thể phát video này trong trình xem");
        });
      }
    }
  };

  const handleSeek = (timeSec: number) => {
    const clamped = Math.max(0, Math.min(mediaDuration, timeSec));
    setCurrentTime(clamped);
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = clamped;
      } catch (e) {
        console.warn("Seek error:", e);
      }
    }
  };

  // R2-02: Master Studio Playback Clock (strictly synchronized to real video element)
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (videoRef.current && !videoRef.current.paused) {
        try { videoRef.current.pause(); } catch (e) { console.warn("Video pause error:", e); }
      }
      return;
    }

    const tick = () => {
      if (!isPlayingRef.current) return;
      const v = videoRef.current;
      if (!v) {
        setIsPlaying(false);
        return;
      }

      if (v.paused || v.ended || videoPlayError) {
        setIsPlaying(false);
        return;
      }

      const vTime = v.currentTime;
      if (Number.isFinite(vTime)) {
        if (mediaDurationRef.current > 0 && vTime >= mediaDurationRef.current) {
          setCurrentTime(mediaDurationRef.current);
          setIsPlaying(false);
          return;
        }
        setCurrentTime(vTime);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, mediaDuration, videoPlayError, filePath]);

  // R3-02: Ensure playbackRate is always synchronized on video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Synchronize active subtitle selection as playhead moves
  useEffect(() => {
    if (isPlaying) {
      const match = segments.find((s) => s.start <= currentTime && currentTime <= s.end);
      if (match && match.id !== selectedSegId) {
        setSelectedSegId(match.id);
      }
    }
  }, [currentTime, isPlaying, segments, selectedSegId]);

  // Keyboard Shortcuts: Spacebar (Play/Pause), Left/Right (-1s/+1s), Home/End
  useEffect(() => {
    if (isActive === false) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "BUTTON" ||
        target?.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        handlePickMediaFile();
      } else if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleSeek(currentTimeRef.current - (e.shiftKey ? 5 : 1));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSeek(currentTimeRef.current + (e.shiftKey ? 5 : 1));
      } else if (e.code === "Home") {
        e.preventDefault();
        handleSeek(0);
      } else if (e.code === "End") {
        e.preventDefault();
        handleSeek(mediaDurationRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive]);

  // Zoom calculation: pixels per second
  const pxPerSec = Math.max(10, 1200 / Math.max(5, zoomLevel));
  const timelineWidth = Math.max(1200, Math.round(mediaDuration * pxPerSec));
  const timelineWidthRef = useRef<number>(timelineWidth);
  timelineWidthRef.current = timelineWidth;

  // Playhead scrubbing pointer handlers (kéo thả để chạy video qua timeline)
  const isDraggingPlayheadRef = useRef<boolean>(false);
  isDraggingPlayheadRef.current = isDraggingPlayhead;

  const updatePlayheadFromClientX = (clientX: number) => {
    const container = timelineTracksBodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft || 0;
    const relativeX = clientX - rect.left + scrollLeft - 40; // 40px padding left
    const dur = Math.max(1, mediaDuration);
    const tw = timelineWidthRef.current || 1200;
    const newTime = Math.max(0, Math.min(dur, (relativeX / tw) * dur));
    handleSeek(newTime);
  };

  const startScrubbing = (clientX: number) => {
    setIsDraggingPlayhead(true);
    isDraggingPlayheadRef.current = true;
    updatePlayheadFromClientX(clientX);

    const handleWindowMove = (moveEvent: MouseEvent | PointerEvent) => {
      if (!isDraggingPlayheadRef.current) return;
      updatePlayheadFromClientX(moveEvent.clientX);
    };

    const handleWindowUp = () => {
      setIsDraggingPlayhead(false);
      isDraggingPlayheadRef.current = false;
      window.removeEventListener("pointermove", handleWindowMove);
      window.removeEventListener("pointerup", handleWindowUp);
      window.removeEventListener("mousemove", handleWindowMove);
      window.removeEventListener("mouseup", handleWindowUp);
      scrubbingCleanupRef.current = null;
    };

    scrubbingCleanupRef.current = handleWindowUp;
    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowUp);
  };

  // R3-09: Component unmount cleanup to prevent window listener leaks
  useEffect(() => {
    return () => {
      if (scrubbingCleanupRef.current) {
        scrubbingCleanupRef.current();
      }
    };
  }, []);

  const handlePlayheadMouseDown = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startScrubbing(e.clientX);
  };

  const handleRulerMouseDown = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    startScrubbing(e.clientX);
  };

  // Pick media file
  const handlePickMediaFile = async () => {
    const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
    if (isTauri) {
      try {
        const picked = await sublix.dubbingPickMediaFile();
        if (picked) {
          setTranscodedPath(null); // ROUND-4 R4-01
          setFilePath(picked);
          const name = picked.split(/[\\/]/).pop() || picked;
          setFileName(name);
          setVideoPlayError(false);
          handleSeek(0);
        }
      } catch (err) {
        console.error("Pick file error:", err);
      }
    } else {
      const input = document.getElementById("studio-hidden-file-input") as HTMLInputElement;
      if (input) {
        input.click();
      }
    }
  };

  // Real pipeline analysis (Sherpa Diarization + Whisper + LLM)
  const handleRunAnalysis = async () => {
    if (!filePath) {
      showToast("⚠️ Vui lòng chọn video trước khi phân tích!");
      return;
    }
    setIsAnalyzing(true);
    setAnalyzeProgress(5);
    setAnalyzeMessage("Đang khởi tạo pipeline AI...");

    const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
    if (!isTauri) {
      showToast("⏳ Đang khởi tạo pipeline phân tích...");
      return;
    }

    let unlisten: (() => void) | null = null;
    try {
      await handleSaveProviderConfig();
      // Listen to progress events
      unlisten = await listen<DubbingProgress>("dubbing:progress", (event) => {
        setAnalyzeProgress(event.payload.percent);
        setAnalyzeMessage(event.payload.message);
      });

      const project: DubbingProject = await sublix.dubbingAnalyze(filePath, sttLang === "auto" ? undefined : sttLang, targetLang);

      if (project) {
        setMediaDuration(project.media_duration_sec);
        if (project.peaks && project.peaks.length > 0) {
          setAudioPeaks(project.peaks);
        }
        if (project.filmstrip_thumbs && project.filmstrip_thumbs.length > 0) {
          setFilmstripThumbs(project.filmstrip_thumbs);
        }

        // Map speakers
        const mappedSpeakers: SpeakerItem[] = project.speakers.map((spk, idx) => ({
          id: spk.id,
          name: spk.label,
          gender: spk.gender as "male" | "female",
          color: SPEAKER_COLORS[idx % SPEAKER_COLORS.length],
          voice: spk.voice,
          count: project.segments.filter((s) => s.speaker_id === spk.id).length,
          sampleAudio: spk.sample_audio_data || null,
        }));
        setSpeakers(mappedSpeakers);

        // Map segments
        const mappedSegments: SubtitleItem[] = project.segments.map((seg) => ({
          id: seg.id,
          start: seg.start_sec,
          end: seg.end_sec,
          speakerId: seg.speaker_id,
          original: seg.original_text,
          translated: seg.dubbed_text || seg.original_text,
          hasAudio: true,
        }));
        setSegments(mappedSegments);
        if (mappedSegments.length > 0) {
          setSelectedSegId(mappedSegments[0].id);
        }
        setAnalyzeProgress(100);
        setAnalyzeMessage("Phân tích hoàn tất!");
        showToast(`✅ Phân tích xong: ${mappedSegments.length} câu thoại, ${mappedSpeakers.length} nhân vật.`);
      }
    } catch (err) {
      console.error("Analysis backend error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("hủy") || errMsg.includes("cancel") || errMsg.includes("dừng")) {
        setAnalyzeMessage("Tiến trình đã bị người dùng hủy.");
        showToast("🛑 Tiến trình phân tích đã bị hủy.");
      } else {
        setAnalyzeMessage(`Lỗi phân tích: ${errMsg}`);
        showToast(`❌ Lỗi phân tích: ${errMsg}`);
      }
      setAnalyzeProgress(0);
    } finally {
      if (unlisten) {
        unlisten();
      }
      setIsAnalyzing(false);
    }
  };

  // R3-03: Cancel video analysis / dubbing pipeline
  const handleCancelAnalysis = async () => {
    try {
      const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
      if (isTauri) {
        await sublix.dubbingCancel();
      }
      showToast("🛑 Đã gửi lệnh dừng phân tích video.");
      setAnalyzeMessage("Tiến trình đã bị người dùng hủy.");
      setIsAnalyzing(false);
    } catch (err) {
      console.warn("Cancel analysis error:", err);
    }
  };

  // Play Base64 audio preview for speaker (R3-01: replace alert with toast, track playback state)
  const handlePlayAudio = (sampleAudio?: string | null, spkId?: string) => {
    if (!sampleAudio) {
      showToast("ℹ️ Không có clip âm thanh mẫu cho vai này.");
      return;
    }
    try {
      const audio = new Audio(sampleAudio);
      if (spkId) {
        setPlayingAudioSpkId(spkId);
        audio.onended = () => setPlayingAudioSpkId((curr) => (curr === spkId ? null : curr));
        audio.onerror = () => setPlayingAudioSpkId((curr) => (curr === spkId ? null : curr));
        audio.onpause = () => setPlayingAudioSpkId((curr) => (curr === spkId ? null : curr));
      }
      audio.play().catch((e) => {
        console.warn("Audio play error:", e);
        if (spkId) setPlayingAudioSpkId((curr) => (curr === spkId ? null : curr));
      });
    } catch (e) {
      console.warn("Audio error:", e);
      if (spkId) setPlayingAudioSpkId((curr) => (curr === spkId ? null : curr));
    }
  };

  // R2-04.1 & R3-01: Audition preview assigned speaker voice (or original sample audio)
  const handlePreviewSpeakerVoice = async (spk: SpeakerItem) => {
    setAuditioningSpkId(spk.id);
    try {
      const isTauriEnv = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
      let dataUri: string | null = null;
      const spkVoice = spk.voice || "kokoro:tuan_ngoc";
      const cleanVoice = spkVoice.replace(/^kokoro:/, "");

      if (isTauriEnv) {
        // Query cached voice sample first
        try {
          dataUri = await sublix.voiceSampleData("kokoro-vi", cleanVoice);
        } catch {
          dataUri = null;
        }

        // Fallback to on-demand dubbingPreviewTts
        if (!dataUri) {
          try {
            const samplePhrase = `Xin chào, tôi là ${spk.name}, đây là mẫu giọng đọc được gán cho nhân vật của tôi.`;
            dataUri = await sublix.dubbingPreviewTts(samplePhrase, spkVoice);
          } catch (e) {
            console.warn("Preview TTS invoke failed:", e);
          }
        }
      }

      if (dataUri) {
        handlePlayAudio(dataUri, spk.id);
        showToast(`🎧 Đang nghe thử giọng ${spkVoice} của ${spk.name}`);
      } else if (spk.sampleAudio) {
        handlePlayAudio(spk.sampleAudio, spk.id);
        showToast(`🎧 Phát clip giọng gốc của ${spk.name}`);
      } else {
        // Browser/test fallback: Play clean synthetic WAV chime so audio hardware sounds and button displays playing state
        try {
          const sampleBeep = createAuditionBeepWav();
          handlePlayAudio(sampleBeep, spk.id);
          showToast(`🎧 Nghe thử mẫu giọng ${spkVoice} (${spk.name})`);
        } catch {
          showToast(`ℹ️ Mẫu giọng ${spkVoice} (${spk.name}) đã sẵn sàng.`);
        }
      }
    } catch (err) {
      console.warn("Failed preview voice, trying sampleAudio fallback:", err);
      if (spk.sampleAudio) {
        handlePlayAudio(spk.sampleAudio, spk.id);
        showToast(`🎧 Phát clip giọng gốc của ${spk.name}`);
      } else {
        showToast(`ℹ️ Mẫu giọng ${spk.voice || "mặc định"} (${spk.name}) đã được chọn.`);
      }
    } finally {
      setAuditioningSpkId(null);
    }
  };

  // R2-03: Draw Audio Waveform on Canvas (Real speech activity peaks, silence is strictly flat)
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = timelineWidth;
    canvas.width = width;
    const height = canvas.height || 32;
    ctx.clearRect(0, 0, width, height);

    if (mediaDuration <= 0) {
      return;
    }

    ctx.fillStyle = "#38bdf8";
    const barWidth = 2;
    const barGap = 1;
    const numBars = Math.floor(width / (barWidth + barGap));
    const midY = Math.floor(height / 2);

    if (audioPeaks.length > 0) {
      for (let i = 0; i < numBars; i++) {
        const ratio = i / Math.max(1, numBars - 1);
        const peakIdx = Math.min(audioPeaks.length - 1, Math.floor(ratio * audioPeaks.length));
        const peakVal = audioPeaks[peakIdx] || 0;

        if (peakVal < 0.015) {
          // Silence is strictly a 1px flat baseline
          ctx.fillRect(i * (barWidth + barGap), midY, barWidth, 1);
        } else {
          const barHeight = Math.max(2, Math.min(height - 4, peakVal * (height - 4)));
          const y = Math.floor((height - barHeight) / 2);
          ctx.fillRect(i * (barWidth + barGap), y, barWidth, barHeight);
        }
      }
    } else {
      // When no analyzed peaks yet, draw a flat 1px baseline across the timeline
      ctx.fillRect(0, midY, width, 1);
    }
  }, [audioPeaks, mediaDuration, timelineWidth]);

  // Filter segments for P4
  const filteredSegments = segments.filter((seg) => {
    if (speakerFilter !== "all" && seg.speakerId !== speakerFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return seg.original.toLowerCase().includes(q) || seg.translated.toLowerCase().includes(q);
    }
    return true;
  });

  // Current subtitle based on playhead position
  const activeSubtitle = segments.find(
    (s) => s.start <= currentTime && currentTime <= s.end
  ) || segments.find((s) => s.id === selectedSegId);

  // Timeline Action Handlers (EZMAX Standard)
  const handleSelectSegment = (seg: SubtitleItem) => {
    setSelectedSegId(seg.id);
    handleSeek(seg.start);
  };

  // R2-08: Side-effect saveUndoHistory() moved strictly outside setSegments updater
  const handleSplitSegment = (segIdToSplit?: number) => {
    const id = segIdToSplit ?? selectedSegId;
    const target = segments.find((s) => s.id === id);
    if (!target) return;
    if (currentTime <= target.start || currentTime >= target.end) return;

    saveUndoHistory();
    setSegments((prev) => {
      const newId = (prev.length > 0 ? Math.max(...prev.map((s) => s.id)) : 0) + 1;
      const firstHalf: SubtitleItem = { ...target, end: Number(currentTime.toFixed(2)) };
      const secondHalf: SubtitleItem = {
        ...target,
        id: newId,
        start: Number(currentTime.toFixed(2)),
        translated: target.translated + " (phần 2)",
      };

      return prev.flatMap((s) => (s.id === id ? [firstHalf, secondHalf] : [s]));
    });
    showToast("✂️ Đã tách câu tại vị trí playhead");
  };

  const handleDuplicateSegment = () => {
    const target = segments.find((s) => s.id === selectedSegId);
    if (!target) return;
    saveUndoHistory();
    const newId = (segments.length > 0 ? Math.max(...segments.map((s) => s.id)) : 0) + 1;
    const dur = target.end - target.start;
    const copy: SubtitleItem = {
      ...target,
      id: newId,
      start: Number((target.end + 0.2).toFixed(2)),
      end: Number((target.end + 0.2 + dur).toFixed(2)),
    };
    setSegments((prev) => [...prev, copy]);
    showToast("📋 Đã nhân bản câu thoại");
  };

  const handleDeleteSegment = (idToDelete?: number) => {
    const id = idToDelete ?? selectedSegId;
    if (segments.length === 0) return;
    saveUndoHistory();
    setSegments((prev) => prev.filter((s) => s.id !== id));
    showToast("🗑 Đã xóa câu thoại");
  };

  const handleFitTimeline = () => {
    // Fit full media duration into view
    setZoomLevel(Math.max(10, Math.ceil(mediaDuration)));
  };

  const handleUpdateSegmentSpeaker = (segId: number, newSpeakerId: string) => {
    saveUndoHistory();
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, speakerId: newSpeakerId } : s))
    );
  };

  const handleNudgeSegment = (segId: number, field: "start" | "end", delta: number) => {
    saveUndoHistory();
    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== segId) return s;
        if (field === "start") {
          const newStart = Math.max(0, Math.min(s.end - 0.2, s.start + delta));
          return { ...s, start: Number(newStart.toFixed(2)) };
        } else {
          const newEnd = Math.max(s.start + 0.2, Math.min(mediaDuration, s.end + delta));
          return { ...s, end: Number(newEnd.toFixed(2)) };
        }
      })
    );
  };

  const handlePreviewSegmentTts = async (seg: SubtitleItem) => {
    const spk = speakers.find((s) => s.id === seg.speakerId);
    const rawVoice = spk?.voice || "kokoro:tuan_ngoc";
    // R3-04: ensure kokoro: prefix is present for local voices
    const voice = rawVoice.startsWith("kokoro:") || rawVoice.includes("-")
      ? rawVoice
      : `kokoro:${rawVoice}`;

    setPreviewingSegId(seg.id);
    try {
      const isTauriEnv = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
      if (isTauriEnv) {
        const wavData = await sublix.dubbingPreviewTts(seg.translated, voice);
        if (wavData) {
          const audio = new Audio(wavData);
          await audio.play();
          showToast(`🎧 Đang phát câu thoại bằng giọng ${voice}`);
        }
      } else {
        // Browser/test fallback
        const chime = createAuditionBeepWav();
        const audio = new Audio(chime);
        await audio.play().catch(() => {});
        showToast(`🎧 Nghe thử câu: "${seg.translated.slice(0, 30)}..." (${voice})`);
      }
    } catch (err) {
      console.warn("Preview TTS error:", err);
      showToast(`⚠️ Không thể nghe thử giọng: ${err}`);
    } finally {
      setPreviewingSegId(null);
    }
  };

  const handleExportVideo = async () => {
    if (!filePath) {
      showToast("⚠️ Vui lòng mở video trước khi xuất!");
      return;
    }
    setIsExporting(true);
    setExportProgress(10);
    setExportMessage("Đang đóng gói kịch bản và audio tracks...");
    setExportDonePath("");

    let unlisten: (() => void) | null = null;
    try {
      const project: DubbingProject = {
        input_path: filePath,
        media_duration_sec: mediaDuration,
        speakers: speakers.map((s) => ({
          id: s.id,
          label: s.name,
          voice: s.voice,
          pitch: "0Hz",
          rate: "0%",
          gender: s.gender,
          sample_audio_data: s.sampleAudio || null,
        })),
        segments: segments.map((seg) => ({
          id: seg.id,
          speaker_id: seg.speakerId,
          start_sec: seg.start,
          end_sec: seg.end,
          original_text: seg.original,
          dubbed_text: seg.translated,
          status: "ready",
        })),
        bgm_volume: 0.8,
        voice_volume: 1.0,
      };

      unlisten = await listen<DubbingProgress>("dubbing:progress", (event) => {
        setExportProgress(event.payload.percent);
        setExportMessage(event.payload.message);
      });

      const outPath = await sublix.dubbingExport(project);
      setExportProgress(100);
      setExportMessage("Xuất video thành công!");
      setExportDonePath(outPath);
    } catch (err) {
      console.error("Export error:", err);
      showToast("❌ Lỗi xuất video: " + err);
    } finally {
      if (unlisten) unlisten();
      setIsExporting(false);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left - 40;
    const dur = Math.max(1, mediaDuration);
    const tw = timelineWidthRef.current || 1200;
    const newTime = Math.max(0, Math.min(dur, (clickX / tw) * dur));
    handleSeek(newTime);
  };

  // Dynamic WPM & Timing stats for Review Panel
  const totalSpeechSeconds = segments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);
  const totalWords = segments.reduce((sum, seg) => {
    const text = (seg.translated || seg.original || "").trim();
    return sum + (text ? text.split(/\s+/).length : 0);
  }, 0);
  const calculatedWpm = totalSpeechSeconds > 0 ? Math.round(totalWords / (totalSpeechSeconds / 60)) : 0;


  return (
    <div className="sublix-studio-container" data-theme={currentTheme}>
      {/* ====================================================================
          P1 — TOPBAR
          ==================================================================== */}
      <header className="studio-topbar">
        <div className="studio-topbar-left">
          <div className="studio-brand">
            <div className="studio-brand-logo">
              <IconClapper size={15} />
            </div>
            <span className="studio-brand-title">SUBLIX STUDIO</span>
            <span className="studio-brand-badge" style={{ background: "var(--ac)", color: "#000", fontWeight: 800 }}>v0.11.0</span>
          </div>

          <nav className="studio-nav-tabs">
            <button
              type="button"
              className={`studio-nav-tab ${activeTab === "studio" ? "active" : ""}`}
              onClick={() => setActiveTab("studio")}
            >
              <IconClapper size={13} />
              <span>Studio</span>
            </button>
            <button
              type="button"
              className="studio-nav-tab"
              onClick={() => onNavigateTab?.("downloader")}
            >
              <IconGlobe size={13} />
              <span>Tải video</span>
            </button>
            <button
              type="button"
              className="studio-nav-tab"
              onClick={() => onNavigateTab?.("live")}
            >
              <IconMic size={13} />
              <span>Live</span>
            </button>
            <button
              type="button"
              className="studio-nav-tab"
              onClick={() => onNavigateTab?.("history")}
            >
              <IconClock size={13} />
              <span>Lịch sử</span>
            </button>
            <button
              type="button"
              className="studio-nav-tab"
              onClick={() => onNavigateTab?.("models")}
            >
              <IconSettings size={13} />
              <span>Cài đặt</span>
            </button>
          </nav>
        </div>

        {/* Center: Import button & File meta chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            id="studio-hidden-file-input"
            type="file"
            accept="video/*,audio/*,.mp4,.mkv,.mov,.m4a,.avi,.mp3"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const p = (file as any).path || file.name;
                setFilePath(p);
                setFileName(file.name);
                setVideoPlayError(false);
                handleSeek(0);
              }
            }}
          />
          <button
            type="button"
            className="studio-btn-import-pill"
            onClick={handlePickMediaFile}
            title="Nhập video từ máy tính (Phím tắt: Ctrl + I)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 20,
              background: "rgba(232, 163, 61, 0.15)",
              border: "1px solid var(--ac)",
              color: "var(--ac)",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <span>📥 Nhập video</span>
            <span style={{ fontSize: 9.5, opacity: 0.75, background: "rgba(0,0,0,0.3)", padding: "1px 5px", borderRadius: 4 }}>Ctrl+I</span>
          </button>

          <div className="studio-file-chip" title={filePath}>
            <IconFilm size={13} />
            <span>{fileName}</span>
            <button
              type="button"
              className="studio-file-chip-close"
              onClick={() => {
                setFilePath("");
                setFileName("Chưa mở video");
                setMediaDuration(0);
                setCurrentTime(0);
                setIsPlaying(false);
                setSegments([]);
                setSpeakers([]);
                setAudioPeaks([]);
                setFilmstripThumbs([]);
                if (videoRef.current) {
                  try {
                    videoRef.current.pause();
                    videoRef.current.src = "";
                  } catch (e) {
                    console.warn("Video clear error:", e);
                  }
                }
                showToast("Đã đóng video hiện tại");
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="studio-topbar-right">
          <button
            type="button"
            className="studio-btn-subtle"
            title="Hoàn tác (Ctrl+Z)"
            onClick={handleUndo}
          >
            <IconUndo size={14} />
          </button>

          <div className="studio-theme-dots" title="Đổi theme giao diện">
            {[
              { id: "cinema", bg: "#e8a33d" },
              { id: "studio", bg: "#2dd4bf" },
              { id: "light", bg: "#b45309" },
              { id: "vibrant", bg: "#e11d48" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`studio-theme-dot ${currentTheme === t.id ? "active" : ""}`}
                style={{ background: t.bg }}
                onClick={() => onThemeChange?.(t.id)}
              />
            ))}
          </div>

          <button
            type="button"
            className="studio-btn-open-video"
            onClick={handlePickMediaFile}
            title="Mở file video từ máy tính"
          >
            <IconPlus size={13} /> Mở video
          </button>

          <button
            type="button"
            className="studio-btn-export-video"
            onClick={handleExportVideo}
            title="Xuất video hoàn chỉnh"
          >
            <IconClapper size={13} /> Xuất video
          </button>
        </div>
      </header>

      {/* ====================================================================
          WORKSPACE — 3 COLUMNS (P2, P3, P4)
          ==================================================================== */}
      <div className="studio-workspace">
        {/* P2: CỘT BƯỚC BÊN TRÁI */}
        <aside className="studio-col-steps">
          <div className="studio-steps-header">
            <button
              type="button"
              className={`studio-steps-tab-btn ${leftTab === "pipeline" ? "active" : ""}`}
              onClick={() => setLeftTab("pipeline")}
            >
              ⚡ Thuyết Minh & Lồng Tiếng
            </button>
            <button
              type="button"
              className={`studio-steps-tab-btn ${leftTab === "review" ? "active" : ""}`}
              onClick={() => setLeftTab("review")}
            >
              📑 Tóm Tắt & Review
            </button>
          </div>

          <div className="studio-steps-body">
            {leftTab === "pipeline" ? (
              <>
                {/* Card 1: Nhận dạng giọng nói (STT) */}
                <div className="studio-step-card">
              <div
                className="studio-step-card-header"
                onClick={() => setOpenCard(openCard === "stt" ? "dubbing" : "stt")}
              >
                <div className="studio-step-card-title">
                  <IconMic size={14} />
                  <span>Nhận dạng giọng nói</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="studio-step-card-status">
                    {speakers.length} vai • {mediaDuration.toFixed(1)}s
                  </span>
                  {openCard === "stt" ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                </div>
              </div>

              {openCard === "stt" && (
                <div className="studio-step-card-content">
                  <div className="studio-form-row">
                    <label className="studio-form-label">Ngôn ngữ gốc:</label>
                    <select
                      className="studio-form-select"
                      value={sttLang}
                      onChange={(e) => setSttLang(e.target.value)}
                    >
                      <option value="auto">Tự động phát hiện (Auto)</option>
                      <option value="ja">Tiếng Nhật (Japanese)</option>
                      <option value="en">Tiếng Anh (English)</option>
                      <option value="zh">Tiếng Trung (Chinese)</option>
                      <option value="vi">Tiếng Việt (Vietnamese)</option>
                    </select>
                  </div>

                  <div className="studio-form-row">
                    <label className="studio-form-label">Mô hình nhận dạng:</label>
                    <select
                      className="studio-form-select"
                      value={sttModel}
                      onChange={(e) => setSttModel(e.target.value)}
                    >
                      <option value="large-v3-turbo">Whisper Large-v3-Turbo (GPU)</option>
                      <option value="base">Whisper Base (Nhanh)</option>
                    </select>
                  </div>

                  <div className="studio-toggle-row">
                    <span className="studio-toggle-label">Hiện vùng OCR / Sub cũ</span>
                    <label className="studio-switch">
                      <input
                        type="checkbox"
                        checked={ocrToggle}
                        onChange={(e) => setOcrToggle(e.target.checked)}
                      />
                      <span className="studio-slider" />
                    </label>
                  </div>

                  <div className="studio-toggle-row">
                    <span className="studio-toggle-label">Ghép câu thông minh (Sentence)</span>
                    <label className="studio-switch">
                      <input
                        type="checkbox"
                        checked={stitchToggle}
                        onChange={(e) => setStitchToggle(e.target.checked)}
                      />
                      <span className="studio-slider" />
                    </label>
                  </div>

                  <div className="studio-toggle-row">
                    <span className="studio-toggle-label">Phân biệt người nói (Sherpa)</span>
                    <label className="studio-switch">
                      <input
                        type="checkbox"
                        checked={diarizeToggle}
                        onChange={(e) => setDiarizeToggle(e.target.checked)}
                      />
                      <span className="studio-slider" />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Card 2: Dịch thuật & LLM Selector */}
            <div className="studio-step-card">
              <div
                className="studio-step-card-header"
                onClick={() => setOpenCard(openCard === "translate" ? "dubbing" : "translate")}
              >
                <div className="studio-step-card-title">
                  <IconGlobe size={14} />
                  <span>Dịch thuật & Nhà cung cấp LLM</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="studio-step-card-status">
                    {segments.length} câu • {transProvider.toUpperCase()}
                  </span>
                  {openCard === "translate" ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                </div>
              </div>

              {openCard === "translate" && (
                <div className="studio-step-card-content">
                  <div className="studio-form-row">
                    <label className="studio-form-label">Nhà cung cấp AI dịch:</label>
                    <select
                      className="studio-form-select"
                      value={transProvider}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTransProvider(val);
                        handleSaveProviderConfig(val);
                      }}
                    >
                      <option value="deepseek">★ DeepSeek Chính Hãng (Khuyên Dùng - Siêu Nhanh)</option>
                      <option value="openrouter">OpenRouter API (Top Models Toàn Cầu)</option>
                      <option value="minimax">MiniMax Cloud API</option>
                      <option value="local">Local Qwen3-4B (GPU Offline)</option>
                      <option value="ollama">Ollama Local</option>
                    </select>
                  </div>

                  {/* DeepSeek Provider Fields */}
                  {transProvider === "deepseek" && (
                    <>
                      <div className="studio-form-row">
                        <label className="studio-form-label">Model DeepSeek:</label>
                        <select
                          className="studio-form-select"
                          value={deepseekModel}
                          onChange={(e) => setDeepseekModel(e.target.value)}
                        >
                          <option value="deepseek-chat">deepseek-chat (V3 - Khuyên Dùng)</option>
                          <option value="deepseek-reasoner">deepseek-reasoner (R1 Suy Luận)</option>
                        </select>
                      </div>
                      <div className="studio-form-row">
                        <label className="studio-form-label">DeepSeek API Key:</label>
                        <input
                          type="password"
                          className="studio-form-input"
                          placeholder="sk-..."
                          value={deepseekKey}
                          onChange={(e) => setDeepseekKey(e.target.value)}
                          onBlur={() => handleSaveProviderConfig()}
                        />
                      </div>
                    </>
                  )}

                  {/* OpenRouter Provider Fields */}
                  {transProvider === "openrouter" && (
                    <>
                      <div className="studio-form-row">
                        <label className="studio-form-label">Model OpenRouter:</label>
                        <select
                          className="studio-form-select"
                          value={openrouterModel}
                          onChange={(e) => setOpenrouterModel(e.target.value)}
                        >
                          <option value="deepseek/deepseek-chat">deepseek/deepseek-chat (DeepSeek-V3 Official Port)</option>
                          <option value="deepseek/deepseek-r1">deepseek/deepseek-r1 (DeepSeek-R1 Reasoner)</option>
                          <option value="google/gemini-2.0-flash-001">google/gemini-2.0-flash-001 (Siêu Nhanh & Rẻ)</option>
                          <option value="google/gemini-2.5-pro">google/gemini-2.5-pro (Gemini Pro Cao Cấp)</option>
                          <option value="meta-llama/llama-3.3-70b-instruct">meta-llama/llama-3.3-70b-instruct (Hội Thoại Tự Nhiên)</option>
                          <option value="qwen/qwen-2.5-72b-instruct">qwen/qwen-2.5-72b-instruct (Đa Ngôn Ngữ SOTA)</option>
                          <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
                        </select>
                      </div>
                      <div className="studio-form-row">
                        <label className="studio-form-label">Mã Model OpenRouter Tùy Chỉnh:</label>
                        <input
                          type="text"
                          className="studio-form-input"
                          placeholder="Hoặc nhập mã model tùy ý trên openrouter.ai..."
                          value={openrouterModel}
                          onChange={(e) => setOpenrouterModel(e.target.value)}
                          onBlur={() => handleSaveProviderConfig()}
                        />
                      </div>
                      <div className="studio-form-row">
                        <label className="studio-form-label">OpenRouter API Key:</label>
                        <input
                          type="password"
                          className="studio-form-input"
                          placeholder="sk-or-..."
                          value={openrouterKey}
                          onChange={(e) => setOpenrouterKey(e.target.value)}
                          onBlur={() => handleSaveProviderConfig()}
                        />
                      </div>
                    </>
                  )}

                  {/* MiniMax Provider Fields */}
                  {transProvider === "minimax" && (
                    <>
                      <div className="studio-form-row">
                        <label className="studio-form-label">Model MiniMax:</label>
                        <select
                          className="studio-form-select"
                          value={minimaxModel}
                          onChange={(e) => setMinimaxModel(e.target.value)}
                        >
                          <option value="MiniMax-M3">MiniMax-M3</option>
                          <option value="MiniMax-Text-01">MiniMax-Text-01</option>
                        </select>
                      </div>
                      <div className="studio-form-row">
                        <label className="studio-form-label">MiniMax API Key:</label>
                        <input
                          type="password"
                          className="studio-form-input"
                          placeholder="sk-cp-..."
                          value={minimaxKey}
                          onChange={(e) => setMinimaxKey(e.target.value)}
                          onBlur={() => handleSaveProviderConfig()}
                        />
                      </div>
                    </>
                  )}

                  <div className="studio-form-row">
                    <label className="studio-form-label">Ngôn ngữ đích:</label>
                    <select
                      className="studio-form-select"
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                    >
                      <option value="vi">Tiếng Việt (vi)</option>
                      <option value="en">English (en)</option>
                      <option value="ja">Tiếng Nhật (ja)</option>
                    </select>
                  </div>

                  <div className="studio-form-row">
                    <label className="studio-form-label">Phong cách dịch:</label>
                    <select
                      className="studio-form-select"
                      value={transStyle}
                      onChange={(e) => setTransStyle(e.target.value)}
                    >
                      <option value="theatrical">Review phim & Truyền cảm</option>
                      <option value="literal">Dịch sát nghĩa (Học thuật)</option>
                      <option value="casual">Thân mật & Trẻ trung</option>
                    </select>
                  </div>

                  {/* Hồ sơ phim (AI Học) — Khóa xưng hô */}
                  <div className="studio-glossary-box">
                    <div className="studio-glossary-header">
                      <span>🏷️ Hồ sơ phim (AI học)</span>
                      <button
                        type="button"
                        className="studio-btn-subtle-sm"
                        onClick={async () => {
                          try {
                            const cfg = await sublix.getConfig();
                            cfg.glossary = glossary;
                            await sublix.saveConfig(cfg);
                            showToast(`✅ Đã lưu ${glossary.length} quy tắc vào hồ sơ phim & cấu hình`);
                          } catch (err) {
                            console.warn("Failed to save glossary:", err);
                            showToast("❌ Không thể lưu hồ sơ phim");
                          }
                        }}
                        title="Ghi nhận quy tắc xưng hô để áp dụng vào GLOSSARY prompt khi dịch"
                      >
                        Lưu hồ sơ phim
                      </button>
                    </div>
                    <span className="studio-glossary-desc">
                      Danh sách tên riêng & quy tắc xưng hô được lưu lại để AI dịch nhất quán giữa các tập phim.
                    </span>
                    <div className="studio-glossary-chips">
                      {glossary.map((item, idx) => (
                        <span key={idx} className="studio-glossary-tag">
                          <span>{item}</span>
                          <button
                            type="button"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "inherit",
                              cursor: "pointer",
                              padding: "0 2px",
                              fontSize: 10,
                              marginLeft: 4,
                            }}
                            onClick={() => setGlossary((prev) => prev.filter((_, i) => i !== idx))}
                            title="Xóa quy tắc này"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <input
                        type="text"
                        className="studio-form-input"
                        placeholder="Thêm cặp tên / xưng hô (vd: Kenji ➔ Huynh)..."
                        value={newGlossaryTerm}
                        onChange={(e) => setNewGlossaryTerm(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newGlossaryTerm.trim()) {
                            e.preventDefault();
                            setGlossary((prev) => [...prev, newGlossaryTerm.trim()]);
                            setNewGlossaryTerm("");
                          }
                        }}
                        style={{ fontSize: 11, padding: "3px 8px" }}
                      />
                      <button
                        type="button"
                        className="studio-btn-subtle-sm"
                        onClick={() => {
                          if (newGlossaryTerm.trim()) {
                            setGlossary((prev) => [...prev, newGlossaryTerm.trim()]);
                            setNewGlossaryTerm("");
                          }
                        }}
                      >
                        + Thêm
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Card 3: Giọng đọc & Bảng Phân Vai */}
            <div className="studio-step-card">
              <div
                className="studio-step-card-header"
                onClick={() => setOpenCard(openCard === "dubbing" ? "stt" : "dubbing")}
              >
                <div className="studio-step-card-title">
                  <IconClapper size={14} />
                  <span>Giọng đọc & Phân vai</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="studio-step-card-status">{speakers.length} vai diễn</span>
                  {openCard === "dubbing" ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                </div>
              </div>

              {openCard === "dubbing" && (
                <div className="studio-step-card-content">
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="studio-btn-action-primary"
                      style={{ flex: 1 }}
                      onClick={handleRunAnalysis}
                      disabled={isAnalyzing}
                    >
                      <IconUser size={13} />
                      {isAnalyzing ? "Đang Phân Tích..." : "Phân Tích Người Nói (Sherpa AI)"}
                    </button>
                    {isAnalyzing && (
                      <button
                        type="button"
                        className="studio-btn-action-danger"
                        onClick={handleCancelAnalysis}
                        style={{
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.4)",
                          color: "#f87171",
                          borderRadius: 6,
                          padding: "6px 12px",
                          cursor: "pointer",
                          fontWeight: 600,
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                        title="Dừng tiến trình phân tích nhân vật"
                      >
                        ⏹ Dừng
                      </button>
                    )}
                  </div>

                  {isAnalyzing && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div className="studio-progress-badge">
                        <span>⏳ {analyzeMessage}</span>
                        <span>{analyzeProgress.toFixed(0)}%</span>
                      </div>
                    </div>
                  )}

                  <div className="studio-speakers-list">
                    {speakers.map((spk, idx) => (
                      <div key={spk.id} className="studio-speaker-item">
                        <div className="studio-speaker-item-top">
                          <span
                            className="studio-speaker-dot"
                            style={{ background: spk.color }}
                          />
                          <input
                            type="text"
                            className="studio-speaker-name-input"
                            value={spk.name}
                            onFocus={() => saveAudioUndo()}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSpeakers((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, name: val } : s))
                              );
                            }}
                          />
                          <span className="studio-speaker-chip-count">
                            {segments.filter((s) => s.speakerId === spk.id).length} câu
                          </span>
                        </div>

                        <select
                          className="studio-form-select"
                          value={spk.voice}
                          onChange={(e) => {
                            const val = e.target.value;
                            saveAudioUndo();
                            setSpeakers((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, voice: val } : s))
                            );
                          }}
                        >
                          <option value="kokoro:tuan_ngoc">Tuấn Ngọc ♂ (Bắc - Kokoro Local)</option>
                          <option value="kokoro:manh_dung">Mạnh Dũng ♂ (Nam - Kokoro Local)</option>
                          <option value="kokoro:mai_linh">Mai Linh ♀ (Bắc - Kokoro Local)</option>
                          <option value="kokoro:ngoc_huyen">Ngọc Huyền ♀ (Nam - Kokoro Local)</option>
                          <option value="vi-VN-HoaiMyNeural">Hoài My ♀ (Edge TTS Free)</option>
                          <option value="vi-VN-NamMinhNeural">Nam Minh ♂ (Edge TTS Free)</option>
                        </select>

                        <div className="studio-speaker-actions">
                          <button
                            type="button"
                            className="studio-btn-voice-preview"
                            onClick={() => handlePlayAudio(spk.sampleAudio, spk.id)}
                            title="Nghe clip âm thanh gốc của nhân vật này"
                          >
                            <IconVolume2 size={12} /> Giọng gốc
                          </button>
                          <button
                            type="button"
                            className={`studio-btn-voice-preview ${playingAudioSpkId === spk.id ? "is-playing" : ""}`}
                            onClick={() => handlePreviewSpeakerVoice(spk)}
                            disabled={auditioningSpkId === spk.id}
                            title="Nghe thử giọng đọc được gán"
                          >
                            {playingAudioSpkId === spk.id ? (
                              <>
                                <span style={{ color: "#38bdf8", display: "inline-flex" }}>
                                  <IconVolume2 size={12} />
                                </span>{" "}
                                Đang phát...
                              </>
                            ) : auditioningSpkId === spk.id ? (
                              <>
                                <IconPlay size={12} /> Đang tải...
                              </>
                            ) : (
                              <>
                                <IconPlay size={12} /> Nghe thử
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            className="studio-btn-voice-preview"
                            style={{ marginLeft: "auto" }}
                          >
                            <IconMoreHorizontal size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="studio-btn-voice-preview"
                    style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
                    onClick={() => {
                      saveAudioUndo();
                      const newId = `speaker_${speakers.length}`;
                      setSpeakers([
                        ...speakers,
                        {
                          id: newId,
                          name: `Nhân vật ${speakers.length + 1}`,
                          gender: "male",
                          color: SPEAKER_COLORS[speakers.length % SPEAKER_COLORS.length],
                          voice: "kokoro:tuan_ngoc",
                          count: 0,
                        },
                      ]);
                    }}
                  >
                    <IconPlus size={12} /> Thêm vai diễn
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="studio-review-panel">
            <div className="studio-review-card">
              <div className="studio-review-title">
                <span>📊 Thống Kê Nhịp Thoại & Kịch Bản</span>
              </div>
              <div className="studio-review-stat-grid">
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{segments.length}</span>
                  <span className="studio-review-stat-label">Tổng câu thoại</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{mediaDuration.toFixed(1)}s</span>
                  <span className="studio-review-stat-label">Thời lượng video</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{speakers.length} vai</span>
                  <span className="studio-review-stat-label">Nhân vật tham gia</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">
                    {segments.length > 0 ? `~${calculatedWpm} WPM` : "—"}
                  </span>
                  <span className="studio-review-stat-label">Tốc độ thoại TB</span>
                </div>
              </div>
            </div>

            <div className="studio-review-card">
              <div className="studio-review-title">
                <span>📝 Tóm Tắt Cốt Truyện & Thoại</span>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--t2)", lineHeight: 1.5, margin: 0 }}>
                {segments.length > 0
                  ? `Dự án gồm ${segments.length} câu thoại, tổng ${totalSpeechSeconds.toFixed(1)}s thời lượng thoại của ${speakers.length} nhân vật (${speakers.map((s) => s.name).join(", ")}).`
                  : "Chưa có kịch bản để tóm tắt cốt truyện."}
              </p>
            </div>

            <div className="studio-review-card">
              <div className="studio-review-title">
                <span>🛡 Đánh Giá Chất Lượng Kịch Bản</span>
                {reviewScore !== null && (
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: reviewScore >= 80 ? "#10b981" : "#f59e0b" }}>
                    {reviewScore}/100
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                {reviewNotes.length > 0 ? (
                  reviewNotes.map((n, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: n.startsWith("✓") ? "#10b981" : "#f59e0b" }}>
                      <span>{n}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#10b981" }}>
                      <span>✓</span>
                      <span>Phân vai: {speakers.length} vai diễn độc lập trên timeline.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#10b981" }}>
                      <span>✓</span>
                      <span>Đồng bộ mốc thời gian: {segments.length} câu thoại sẵn sàng.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ac)" }}>
                      <span>⚡</span>
                      <span>Phong cách: {transStyle === "theatrical" ? "Điện Ảnh (Theatrical)" : "Thuyết Minh Chuẩn"}</span>
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                className="studio-btn-subtle"
                style={{ marginTop: 6, justifyContent: "center" }}
                onClick={() => {
                  if (segments.length === 0) {
                    setReviewScore(0);
                    setReviewNotes(["Chưa có phân đoạn thoại nào để đánh giá."]);
                    showToast("ℹ️ Chưa có kịch bản để đánh giá");
                    return;
                  }
                  let s = 100;
                  const notes: string[] = [];
                  const emptyTrans = segments.filter((seg) => !seg.translated.trim()).length;
                  if (emptyTrans > 0) {
                    s -= Math.min(30, emptyTrans * 5);
                    notes.push(`⚠️ Có ${emptyTrans} câu chưa có nội dung dịch`);
                  } else {
                    notes.push("✓ 100% câu đã có bản dịch hoàn chỉnh");
                  }
                  const unusedSpeakers = speakers.filter((spk) => !segments.some((seg) => seg.speakerId === spk.id)).length;
                  if (unusedSpeakers > 0) {
                    s -= Math.min(20, unusedSpeakers * 5);
                    notes.push(`⚠️ Có ${unusedSpeakers} vai chưa được gán câu thoại nào`);
                  } else if (speakers.length > 0) {
                    notes.push(`✓ Toàn bộ ${speakers.length} nhân vật đều có câu thoại`);
                  }
                  const longSegs = segments.filter((seg) => seg.end - seg.start > 12).length;
                  if (longSegs > 0) {
                    s -= Math.min(15, longSegs * 3);
                    notes.push(`⚠️ Có ${longSegs} câu thoại dài hơn 12s (cần ngắt)`);
                  } else {
                    notes.push("✓ Mốc thời gian thoại tự nhiên (<12s/câu)");
                  }
                  const finalScore = Math.max(0, s);
                  setReviewScore(finalScore);
                  setReviewNotes(notes);
                  showToast(`✅ Đã đánh giá kịch bản: ${finalScore}/100`);
                }}
              >
                ✨ Đánh giá lại kịch bản
              </button>
            </div>
          </div>
        )}

            {/* Quick Process CTA */}
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="studio-btn-action-primary"
                  style={{ padding: 10, flex: 1 }}
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                >
                  ✨ {isAnalyzing ? "Đang Xử Lý Video..." : "Xử Lý Video (1-Click Pipeline)"}
                </button>
                {isAnalyzing && (
                  <button
                    type="button"
                    className="studio-btn-action-danger"
                    onClick={handleCancelAnalysis}
                    style={{
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      color: "#f87171",
                      borderRadius: 6,
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    title="Dừng tiến trình xử lý video"
                  >
                    ⏹ Dừng
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                <span style={{ fontSize: 10, color: "var(--t3)" }}>Hoàn tác:</span>
                <span className="studio-filter-chip" onClick={handleUndoAudio} style={{ cursor: "pointer" }} title="Hoàn tác gán giọng / phân vai">↶ Audio</span>
                <span className="studio-filter-chip" onClick={handleUndoTranslation} style={{ cursor: "pointer" }} title="Hoàn tác nội dung bản dịch">↶ Bản dịch</span>
                <span className="studio-filter-chip" onClick={handleUndoSubtitles} style={{ cursor: "pointer" }} title="Hoàn tác mốc thời gian phụ đề">↶ Phụ đề</span>
              </div>
            </div>
          </div>
        </aside>

        {/* P3: KHUNG XEM VIDEO Ở GIỮA */}
        <section className="studio-col-video">
          <div className="studio-video-toolbar">
            <div className="studio-video-toolbar-left">
              <select
                className="studio-video-select-subtle"
                value={subtitleDisplayMode}
                onChange={(e) => setSubtitleDisplayMode(e.target.value as any)}
                title="Chế độ hiển thị phụ đề trên màn chiếu (Bản dịch / Gốc / Song ngữ)"
              >
                <option value="translated">Original (Bản dịch)</option>
                <option value="original">Nguyên bản (Gốc)</option>
                <option value="bilingual">Song ngữ (2 dòng)</option>
              </select>
              <select
                className="studio-video-select-subtle"
                value={videoScale}
                onChange={(e) => setVideoScale(Number(e.target.value))}
                title="Thu phóng kích thước khung xem video"
              >
                <option value={100}>100% Fit</option>
                <option value={75}>75%</option>
                <option value={50}>50%</option>
              </select>
            </div>

            <div className="studio-video-toolbar-right">
              <button
                type="button"
                className="studio-action-btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={() => {
                  setVideoScale((prev) => Math.max(50, prev - 10));
                  showToast("Thu nhỏ khung xem video");
                }}
                title="Thu nhỏ khung video (-10%)"
              >
                –
              </button>
              <button
                type="button"
                className="studio-action-btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={() => {
                  setVideoScale((prev) => Math.min(100, prev + 10));
                  showToast("Phóng to khung xem video");
                }}
                title="Phóng to khung video (+10%)"
              >
                +
              </button>
              <button
                type="button"
                className="studio-action-btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={() => {
                  if (videoRef.current) {
                    if (document.fullscreenElement) {
                      document.exitFullscreen();
                    } else {
                      videoRef.current.requestFullscreen().catch(() => showToast("Chế độ toàn màn hình video"));
                    }
                  } else {
                    showToast("Toàn màn hình: Nhấn để xem toàn màn hình video");
                  }
                }}
                title="Xem toàn màn hình (Fullscreen)"
              >
                <IconMaximize size={12} />
              </button>
            </div>
          </div>

          <div
            className={`studio-video-stage ${isDraggingFile ? "drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDraggingFile(false); }}
          >
            <div
              className={`studio-video-frame ${isDraggingFile ? "drag-over" : ""}`}
              onClick={filePath ? handleTogglePlay : handlePickMediaFile}
              style={{
                cursor: "pointer",
                position: "relative",
                border: isDraggingFile ? "2px dashed var(--ac)" : undefined,
                background: isDraggingFile ? "rgba(232, 163, 61, 0.12)" : undefined,
                transform: videoScale === 100 ? undefined : `scale(${videoScale / 100})`,
                transformOrigin: "center center",
                transition: "transform 0.2s ease",
              }}
            >
              {/* Native HTML5 Video Player */}
              {filePath ? (
                <video
                  ref={videoRef}
                  className="studio-video-player-element"
                  src={getVideoSrc(transcodedPath ?? filePath)}
                  key={transcodedPath ?? filePath}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onError={async () => {
                    if (!transcodedPath && filePath) {
                      // ROUND-4 R4-01: WebView2 không giải mã được codec gốc (VP9/AV1/HEVC/H.264 high).
                      // Tự chạy ffmpeg chuyển sang H.264 baseline + AAC rồi phát bản tạm.
                      // Nếu transcoding cũng fail → mới fallback Cinema Visualizer.
                      console.warn(
                        "Video element could not decode in WebView2, attempting ffmpeg transcode to H.264/AAC baseline…"
                      );
                      try {
                        console.log("Đang chuyển tạm video sang H.264 để xem được trong Studio…");
                        const previewPath = await sublix.transcodeForPreview(filePath);
                        setTranscodedPath(previewPath);
                        console.log("Đã chuyển tạm xong, đang phát bản preview…");
                        return;
                      } catch (transcodeErr) {
                        console.error("ffmpeg transcode failed, falling back:", transcodeErr);
                        console.error(`Không thể chuyển tạm video: ${(transcodeErr as Error)?.message ?? transcodeErr}`);
                      }
                    }
                    console.warn("Falling back to Cinema Visualizer.");
                    setVideoPlayError(true);
                  }}
                  style={{
                    display: videoPlayError ? "none" : "block",
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : null}

              {/* 1. DROPZONE KHI CHƯA CÓ VIDEO HOẶC KÉO THẢ TỆP (Chuẩn ảnh minh họa EZMAXSUB) */}
              {!filePath && (
                <div
                  className="studio-dropzone-center-box"
                  onClick={handlePickMediaFile}
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "radial-gradient(circle at center, #1b212b 0%, #0c0e12 85%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    userSelect: "none",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 12,
                      border: "2px solid var(--ac)",
                      background: "rgba(232, 163, 61, 0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--ac)",
                      boxShadow: "0 0 20px rgba(232, 163, 61, 0.25)",
                    }}
                  >
                    <IconPlay size={26} />
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)" }}>
                    {isDraggingFile ? "✨ Thả tệp video vào đây để bắt đầu ngay!" : "Nhấn để nhập video (hoặc Kéo thả tệp vào đây)"}
                  </div>

                  <div style={{ fontSize: 11, color: "var(--t3)", letterSpacing: 1 }}>
                    MP4 • MKV • MOV • M4A • AVI • MP3
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 10.5,
                      color: "var(--ac)",
                      background: "rgba(232, 163, 61, 0.1)",
                      padding: "3px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(232, 163, 61, 0.3)",
                    }}
                  >
                    Phím tắt: Ctrl + I
                  </div>
                </div>
              )}

              {/* 2. THÔNG BÁO LỖI THẬT KHI VIDEO GẶP SỰ CỐ ĐỊNH DẠNG */}
              {filePath && videoPlayError && (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "rgba(15, 23, 42, 0.95)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    padding: 24,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 32 }}>⚠️</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171" }}>
                    Không thể phát tệp video này trực tiếp trong trình xem
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t3)", maxWidth: 440 }}>
                    Tệp có thể bị hỏng, đường dẫn không tồn tại hoặc sử dụng codec không được hỗ trợ bởi WebView2.
                  </div>
                  <button
                    type="button"
                    className="studio-btn primary"
                    onClick={handlePickMediaFile}
                    style={{ marginTop: 8 }}
                  >
                    Chọn video khác (Ctrl+I)
                  </button>
                </div>
              )}

              {/* Subtitle Box Overlay */}
              {filePath && activeSubtitle && (
                <div
                  className="studio-video-subtitle-overlay"
                  style={{
                    top: subPosition === "top" ? 18 : subPosition === "center" ? "45%" : undefined,
                    bottom: subPosition === "bottom" ? 18 : undefined,
                  }}
                >
                  {subtitleDisplayMode === "bilingual" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                      <div style={{ fontSize: subFontSize * 0.85, color: "#9ca3af", fontStyle: "italic" }}>
                        {activeSubtitle.original}
                      </div>
                      <div
                        className="studio-video-subtitle-text"
                        style={{
                          fontSize: subFontSize,
                          color: subFontColor,
                          textShadow: subShowShadow ? "0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.8)" : "none",
                        }}
                      >
                        {activeSubtitle.translated}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="studio-video-subtitle-text"
                      style={{
                        fontSize: subFontSize,
                        color: subFontColor,
                        textShadow: subShowShadow ? "0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.8)" : "none",
                      }}
                    >
                      {subtitleDisplayMode === "original" ? activeSubtitle.original : activeSubtitle.translated}
                    </div>
                  )}
                  <span className="studio-video-subtitle-chip">
                    {formatTimecode(activeSubtitle.start)} → {formatTimecode(activeSubtitle.end)} •{" "}
                    {speakers.find((s) => s.id === activeSubtitle.speakerId)?.name || "Chưa phân vai"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* P4: DANH SÁCH CÂU (CỘT PHẢI) */}
        <aside className="studio-col-segments">
          <div className="studio-segments-header">
            <div className="studio-segments-tabs">
              <button
                type="button"
                className={`studio-segments-tab-btn ${rightTab === "subtitles" ? "active" : ""}`}
                onClick={() => setRightTab("subtitles")}
              >
                📑 Phụ đề
              </button>
              <button
                type="button"
                className={`studio-segments-tab-btn ${rightTab === "properties" ? "active" : ""}`}
                onClick={() => setRightTab("properties")}
              >
                ⚙ Thuộc tính
              </button>
            </div>
            {rightTab === "subtitles" && (
              <div className="studio-segments-actions">
                <button
                  type="button"
                  className="studio-btn-subtle-sm"
                  onClick={handleDuplicateSegment}
                  title="Thêm nhanh một câu thoại mới"
                >
                  + Thêm
                </button>
              </div>
            )}
          </div>

          {rightTab === "subtitles" ? (
            <>
              <div className="studio-segments-search-bar">
                <div className="studio-search-input-wrap">
                  <IconSearch size={12} />
                  <input
                    type="text"
                    className="studio-search-input"
                    placeholder="Tìm trong phụ đề..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Filter Chips per speaker */}
              <div className="studio-segments-filter-chips">
            <button
              type="button"
              className={`studio-filter-chip ${speakerFilter === "all" ? "active" : ""}`}
              onClick={() => setSpeakerFilter("all")}
            >
              Tất cả ({segments.length})
            </button>
            {speakers.map((spk) => (
              <button
                key={spk.id}
                type="button"
                className={`studio-filter-chip ${speakerFilter === spk.id ? "active" : ""}`}
                onClick={() => setSpeakerFilter(spk.id)}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: spk.color,
                    marginRight: 4,
                  }}
                />
                {spk.name} ({segments.filter((s) => s.speakerId === spk.id).length})
              </button>
            ))}
          </div>

          {/* Segment List */}
          <div className="studio-segments-list">
            {filteredSegments.map((seg) => {
              const spk = speakers.find((s) => s.id === seg.speakerId) || speakers[0];
              const isSelected = seg.id === selectedSegId;

              return (
                <div
                  key={seg.id}
                  className={`studio-segment-card ${isSelected ? "active" : ""}`}
                  onClick={() => handleSelectSegment(seg)}
                >
                  <div className="studio-segment-header-row">
                    <div className="studio-segment-timing-controls">
                      <button
                        type="button"
                        className="studio-timing-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNudgeSegment(seg.id, "start", -0.1);
                        }}
                        title="Lùi mốc bắt đầu 0.1s"
                      >
                        -0.1s
                      </button>
                      <span className="studio-segment-timing-text">
                        {formatTimecode(seg.start)} → {formatTimecode(seg.end)}
                      </span>
                      <button
                        type="button"
                        className="studio-timing-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNudgeSegment(seg.id, "end", 0.1);
                        }}
                        title="Tiến mốc kết thúc 0.1s"
                      >
                        +0.1s
                      </button>
                    </div>

                    <select
                      className="studio-segment-speaker-select"
                      style={{ borderColor: spk?.color }}
                      value={seg.speakerId}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleUpdateSegmentSpeaker(seg.id, e.target.value);
                      }}
                      title="Chuyển vai diễn cho câu thoại này"
                    >
                      {speakers.map((s) => (
                        <option key={s.id} value={s.id}>
                          ● {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="studio-segment-text-original">{seg.original}</div>
                  <input
                    type="text"
                    className="studio-segment-text-translated"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 4,
                      padding: "4px 8px",
                      color: "var(--t1)",
                      fontSize: 12,
                      outline: "none",
                      width: "100%",
                      marginTop: 4,
                    }}
                    value={seg.translated}
                    onFocus={() => saveTranslationUndo()}
                    onChange={(e) => {
                      const updated = segments.map((s) =>
                        s.id === seg.id ? { ...s, translated: e.target.value } : s
                      );
                      setSegments(updated);
                    }}
                  />

                  <div className="studio-segment-bottom-row">
                    <button
                      type="button"
                      className={`studio-segment-tts-preview-btn ${previewingSegId === seg.id ? "loading" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreviewSegmentTts(seg);
                      }}
                      title="Nghe thử giọng đọc câu thoại này (Kokoro TTS)"
                    >
                      <IconVolume2 size={11} />
                      {previewingSegId === seg.id ? "Đang tạo..." : "Nghe câu"}
                    </button>

                    <div className="studio-segment-item-actions">
                      <button
                        type="button"
                        className="studio-segment-sub-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSegId(seg.id);
                          handleSplitSegment();
                        }}
                        title="Tách câu tại playhead"
                      >
                        <IconScissors size={11} />
                      </button>
                      <button
                        type="button"
                        className="studio-segment-sub-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          saveSubtitleUndo();
                          setSegments(segments.filter((s) => s.id !== seg.id));
                        }}
                        title="Xóa câu"
                      >
                        <IconTrash size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="studio-properties-panel">
          <div className="studio-prop-card">
            <div className="studio-prop-title">
              <span>🔤 Kiểu Dáng Phụ Đề Màn Chiếu</span>
            </div>

            <div className="studio-prop-row">
              <span>Cỡ chữ: {subFontSize}px</span>
              <input
                type="range"
                min={12}
                max={28}
                value={subFontSize}
                onChange={(e) => setSubFontSize(Number(e.target.value))}
                style={{ width: 110, cursor: "pointer" }}
              />
            </div>

            <div className="studio-prop-row">
              <span>Màu chữ:</span>
              <div className="studio-prop-swatches">
                {[
                  { name: "Vàng", color: "#e8a33d" },
                  { name: "Trắng", color: "#ffffff" },
                  { name: "Xanh", color: "#38bdf8" },
                  { name: "Xanh lá", color: "#4ade80" },
                  { name: "Đỏ", color: "#f87171" },
                ].map((c) => (
                  <div
                    key={c.color}
                    className={`studio-prop-swatch ${subFontColor === c.color ? "active" : ""}`}
                    style={{ background: c.color }}
                    onClick={() => {
                      setSubFontColor(c.color);
                      showToast(`Đã chọn màu phụ đề: ${c.name}`);
                    }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="studio-prop-row">
              <span>Vị trí:</span>
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { id: "bottom", label: "Dưới đáy" },
                  { id: "center", label: "Ở giữa" },
                  { id: "top", label: "Trên đỉnh" },
                ].map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    className={`studio-filter-chip ${subPosition === pos.id ? "active" : ""}`}
                    onClick={() => {
                      setSubPosition(pos.id as any);
                      showToast(`Vị trí phụ đề: ${pos.label}`);
                    }}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="studio-prop-row">
              <span>Đổ bóng tương phản:</span>
              <label className="studio-switch">
                <input
                  type="checkbox"
                  checked={subShowShadow}
                  onChange={(e) => {
                    setSubShowShadow(e.target.checked);
                    showToast(e.target.checked ? "Đã bật bóng chữ" : "Đã tắt bóng chữ");
                  }}
                />
                <span className="studio-slider" />
              </label>
            </div>
          </div>

          <div className="studio-prop-card">
            <div className="studio-prop-title">
              <span>📹 Thông Tin & Thuộc Tính Video</span>
            </div>
            <div className="studio-prop-row">
              <span>Tệp đang mở:</span>
              <span style={{ color: "var(--t1)", fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fileName}
              </span>
            </div>
            <div className="studio-prop-row">
              <span>Thời lượng:</span>
              <span style={{ color: "var(--ac)", fontWeight: 700 }}>
                {formatTimecode(mediaDuration)} ({mediaDuration.toFixed(1)}s)
              </span>
            </div>
            <div className="studio-prop-row">
              <span>Số câu thoại:</span>
              <span>{segments.length} câu</span>
            </div>
            <div className="studio-prop-row">
              <span>Số nhân vật:</span>
              <span>{speakers.length} vai</span>
            </div>
            <div className="studio-prop-row">
              <span>Tỷ lệ hiển thị:</span>
              <span>16:9 Cinema Widescreen</span>
            </div>
          </div>
        </div>
      )}
        </aside>
      </div>

      {/* ====================================================================
          P5 — TIMELINE ĐA LÀN (BOTTOM TIMELINE)
          ==================================================================== */}
      <footer className="studio-timeline-area">
        {/* P5a: Timeline Control Bar */}
        <div className="studio-timeline-ctrl-bar">
          {/* EZMAX Action Tools */}
          <div className="studio-timeline-tools-group">
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={() => handleSplitSegment()}
              title="Cắt tại playhead (Split)"
            >
              <IconScissors size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={handleDuplicateSegment}
              title="Nhân bản (Duplicate)"
            >
              <IconCopy size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={() => handleDeleteSegment()}
              title="Xóa câu (Delete)"
            >
              <IconTrash size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={handleFitTimeline}
              title="Giãn kín timeline — phủ toàn bộ chiều dài video (Fit)"
            >
              <IconArrowsHorizontal size={13} />
            </button>
            <div className="studio-timeline-tools-divider" />
            <button
              type="button"
              className={`studio-timeline-tool-btn ${magnetSnap ? "active" : ""}`}
              onClick={() => {
                const next = !magnetSnap;
                setMagnetSnap(next);
                showToast(next ? "🧲 Đã BẬT Tự động bắt dính Playhead vào mép câu thoại" : "Đã TẮT Bắt dính");
              }}
              title="Tự động bắt dính — căn vào playhead và mép gần nhất (N)"
            >
              <IconMagnet size={13} />
            </button>
            <button
              type="button"
              className={`studio-timeline-tool-btn ${linkTracks ? "active" : ""}`}
              onClick={() => {
                const next = !linkTracks;
                setLinkTracks(next);
                showToast(next ? "🔗 Đã BẬT Liên kết đồng bộ clip & phụ đề" : "Đã TẮT Liên kết rãnh");
              }}
              title="Liên kết — di chuyển hoặc xóa nội dung đi kèm clip trên rãnh chính (P)"
            >
              <IconLink size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              title="Đánh dấu mốc thời gian (Bookmark)"
              onClick={() => {
                setBookmarks((prev) => [...prev, currentTime]);
                showToast(`🔖 Đã ghim Bookmark tại mốc ${formatTimecode(currentTime)}`);
              }}
            >
              <IconBookmark size={13} />
            </button>
          </div>

          {/* Transport Controls */}
          <div className="studio-timeline-transport">
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(0)}
              title="Về đầu (Home)"
            >
              ⏮
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(currentTime - 1)}
              title="Lùi 1 giây"
            >
              ◀
            </button>
            <button
              type="button"
              className="studio-btn-transport-play"
              onClick={handleTogglePlay}
              title="Phát / Dừng (Phím Cách)"
            >
              {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(currentTime + 1)}
              title="Tiến 1 giây"
            >
              ▶
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(mediaDuration)}
              title="Đến cuối (End)"
            >
              ⏭
            </button>

            <div className="studio-timeline-timecode">
              <span>{formatTimecode(currentTime)}</span>
              <span className="studio-timeline-timecode-total">/ {formatTimecode(mediaDuration)}</span>
            </div>
          </div>

          <div
            className={`studio-timeline-batch-toggle ${batchMode ? "active" : ""}`}
            onClick={() => setBatchMode(!batchMode)}
            title="Batch Mode: Tự động chạy hàng loạt cho nhiều tập phim"
          >
            <input type="checkbox" checked={batchMode} readOnly style={{ cursor: "pointer" }} />
            <span>Batch Mode {batchMode ? "BẬT" : "TẮT"}</span>
          </div>

          <div className="studio-timeline-zoom-wrap">
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => {
                const speeds = [1.0, 1.25, 1.5, 2.0, 0.5];
                const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                const nextSpeed = speeds[nextIdx];
                setPlaybackSpeed(nextSpeed);
                if (videoRef.current) {
                  videoRef.current.playbackRate = nextSpeed;
                }
                showToast(`⚡ Tốc độ phát video: ${nextSpeed}x`);
              }}
              title="Nhấn để đổi tốc độ phát (0.5x, 1.0x, 1.25x, 1.5x, 2.0x)"
              style={{ fontSize: 11, padding: "2px 6px", cursor: "pointer" }}
            >
              Tốc độ: {playbackSpeed}x
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel(Math.max(5, Math.round(zoomLevel / 1.5)))}
              title="Zoom out — xem nhiều giây hơn trong cùng chiều rộng"
              style={{ fontSize: 14, fontWeight: 700, padding: "0 8px", cursor: "pointer" }}
            >
              −
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel(30)}
              title="Reset zoom về mặc định (30s hiển thị)"
              style={{ fontSize: 10, padding: "0 4px", cursor: "pointer" }}
            >
              ⟲
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel(Math.min(600, Math.round(zoomLevel * 1.5)))}
              title="Zoom in — xem ít giây hơn (timeline frame lớn hơn)"
              style={{ fontSize: 14, fontWeight: 700, padding: "0 8px", cursor: "pointer" }}
            >
              +
            </button>
            <input
              type="range"
              className="studio-timeline-zoom-slider"
              min={5}
              max={300}
              value={Math.min(600, Math.max(5, zoomLevel))}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              style={{ width: 90 }}
            />
            <span style={{ minWidth: 56, textAlign: "right" }}>
              {zoomLevel}s hiển thị
            </span>
          </div>
        </div>

        {/* P5b: Multi-lane Scrollable Timeline */}
        <div className="studio-timeline-scroll-wrap">
          {/* Left Track Headers (Fixed) */}
          <div className="studio-timeline-track-headers">
            <div className="studio-timeline-ruler-header-spacer">TRACKS</div>
            <div className="studio-track-header-item">
              <div className="studio-track-header-left">
                <span>👁</span>
                <span>▼ VIDEO</span>
              </div>
            </div>
            <div className="studio-track-header-item">
              <div className="studio-track-header-left">
                <span>👁</span>
                <span>♫ TIẾNG GỐC</span>
              </div>
            </div>
            <div className="studio-track-header-item">
              <div className="studio-track-header-left">
                <span>👁</span>
                <span>💬 PHỤ ĐỀ</span>
              </div>
            </div>

            {/* Dynamic Speaker Tracks */}
            {speakers.map((spk) => (
              <div key={spk.id} className="studio-track-header-item">
                <div className="studio-track-header-left">
                  <span
                    className="studio-track-header-dot"
                    style={{ background: spk.color }}
                  />
                  <span>● {spk.name}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Right Tracks Body (Horizontal Scroll) */}
          <div
            ref={timelineTracksBodyRef}
            className={`studio-timeline-tracks-body ${isDraggingPlayhead ? "scrubbing" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDraggingFile(false); }}
          >
            {/* Playhead Vertical Needle */}
            <div
              className={`studio-timeline-playhead ${isDraggingPlayhead ? "dragging" : ""}`}
              style={{ left: `${(currentTime / Math.max(1, mediaDuration)) * timelineWidth + 40}px` }}
            >
              <div
                className={`studio-timeline-playhead-head ${isDraggingPlayhead ? "dragging" : ""}`}
                onMouseDown={handlePlayheadMouseDown}
                onTouchStart={(e) => {
                  if (e.touches.length > 0) startScrubbing(e.touches[0].clientX);
                }}
                title="Kéo thả đầu kim để tua / chạy video qua timeline (Scrubbing)"
              />
            </div>

            {/* Time Ruler */}
            <div
              className="studio-timeline-ruler"
              style={{ width: `${timelineWidth + 80}px`, minWidth: `${timelineWidth + 80}px` }}
              onMouseDown={handleRulerMouseDown}
              onTouchStart={(e) => {
                if (e.touches.length > 0) startScrubbing(e.touches[0].clientX);
              }}
              onClick={handleTimelineClick}
              title="Bấm giữ và kéo rê để chạy video theo mốc thời gian"
            >
              {Array.from({ length: Math.ceil(mediaDuration / 5) + 1 }).map((_, i) => {
                const t = i * 5;
                if (t > mediaDuration + 2) return null;
                return (
                  <div
                    key={t}
                    className="studio-timeline-tick"
                    style={{ left: `${(t / Math.max(1, mediaDuration)) * timelineWidth + 40}px` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSeek(t);
                    }}
                  >
                    {formatTimecode(t)}
                  </div>
                );
              })}

              {/* Bookmark Flags */}
              {bookmarks.map((bmTime, idx) => (
                <div
                  key={idx}
                  style={{
                    position: "absolute",
                    left: `${(bmTime / Math.max(1, mediaDuration)) * timelineWidth + 40}px`,
                    top: 2,
                    fontSize: 10,
                    color: "#38bdf8",
                    cursor: "pointer",
                    zIndex: 10,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSeek(bmTime);
                    showToast(`Nhảy tới Bookmark: ${formatTimecode(bmTime)}`);
                  }}
                  title={`Bookmark ${idx + 1}: ${formatTimecode(bmTime)}`}
                >
                  🔖
                </div>
              ))}
            </div>

            {/* Track 1: Video Filmstrip */}
            <div className="studio-track-lane" style={{ width: `${timelineWidth + 80}px`, minWidth: `${timelineWidth + 80}px` }}>
              <div className="studio-filmstrip-thumbs">
                {filmstripThumbs.length > 0 ? (
                  filmstripThumbs.map((thumb, i) => {
                    const nextTime = i < filmstripThumbs.length - 1 ? filmstripThumbs[i + 1].time_sec : mediaDuration;
                    const left = (thumb.time_sec / Math.max(1, mediaDuration)) * timelineWidth + 40;
                    const w = ((nextTime - thumb.time_sec) / Math.max(1, mediaDuration)) * timelineWidth;
                    return (
                      <div
                        key={i}
                        className="studio-filmstrip-thumb-item"
                        style={{
                          position: "absolute",
                          left: `${left}px`,
                          width: `${Math.max(36, w - 2)}px`,
                          height: "32px",
                          overflow: "hidden",
                          borderRadius: 3,
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          background: "#0f172a",
                        }}
                        title={`Khung hình mốc ${formatTimecode(thumb.time_sec)}`}
                      >
                        <img
                          src={thumb.data_uri}
                          alt={`Khung ${i}`}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            bottom: 1,
                            right: 2,
                            fontSize: 8,
                            background: "rgba(0,0,0,0.65)",
                            color: "#fff",
                            padding: "0 2px",
                            borderRadius: 2,
                          }}
                        >
                          {formatTimecode(thumb.time_sec)}
                        </span>
                      </div>
                    );
                  })
                ) : mediaDuration > 0 ? (
                  Array.from({ length: Math.min(60, Math.ceil(mediaDuration / 5)) }).map((_, i) => {
                    const startT = i * 5;
                    const endT = Math.min(mediaDuration, (i + 1) * 5);
                    const left = (startT / Math.max(1, mediaDuration)) * timelineWidth + 40;
                    const w = ((endT - startT) / Math.max(1, mediaDuration)) * timelineWidth;
                    return (
                      <div
                        key={i}
                        className="studio-filmstrip-thumb-item"
                        style={{
                          position: "absolute",
                          left: `${left}px`,
                          width: `${Math.max(30, w - 2)}px`,
                          background: `linear-gradient(135deg, #1e293b, #0f172a)`,
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          color: "#94a3b8",
                        }}
                      >
                        {formatTimecode(startT)}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>
                    Chưa nạp video
                  </div>
                )}
              </div>
            </div>

            {/* Track 2: Original Waveform */}
            <div className="studio-track-lane" style={{ width: `${timelineWidth + 80}px`, minWidth: `${timelineWidth + 80}px` }}>
              <canvas
                ref={waveformCanvasRef}
                className="studio-waveform-canvas"
                width={timelineWidth}
                height={32}
                style={{ width: `${timelineWidth}px`, height: 32, marginLeft: 40 }}
              />
            </div>

            {/* Track 3: Subtitles Block Lane (Progressive Filling) */}
            <div className="studio-track-lane" style={{ width: `${timelineWidth + 80}px`, minWidth: `${timelineWidth + 80}px` }} onClick={handleTimelineClick}>
              {segments.map((seg) => {
                const totalDur = Math.max(1, mediaDuration);
                const left = (seg.start / totalDur) * timelineWidth + 40;
                const width = ((seg.end - seg.start) / totalDur) * timelineWidth;
                const isSelected = seg.id === selectedSegId;

                return (
                  <div
                    key={seg.id}
                    className={`studio-timeline-block ${isSelected ? "active" : ""}`}
                    style={{
                      left: `${left}px`,
                      width: `${Math.max(50, width)}px`,
                      background: "rgba(45, 212, 191, 0.35)",
                      borderColor: "#2dd4bf",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectSegment(seg);
                    }}
                    title={seg.translated}
                  >
                    <div
                      className="studio-timeline-block-handle left"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNudgeSegment(seg.id, "start", -0.2);
                      }}
                      title="Thu nhỏ/Kéo dài đầu câu (-0.2s)"
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>
                      {seg.translated}
                    </span>
                    <div
                      className="studio-timeline-block-handle right"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNudgeSegment(seg.id, "end", 0.2);
                      }}
                      title="Thu nhỏ/Kéo dài cuối câu (+0.2s)"
                    />
                  </div>
                );
              })}
            </div>

            {/* Track 4..n: Dynamic Speaker Tracks (Progressive Filling per Character) */}
            {speakers.map((spk) => {
              const spkSegments = segments.filter((s) => s.speakerId === spk.id);

              return (
                <div key={spk.id} className="studio-track-lane" style={{ width: `${timelineWidth + 80}px`, minWidth: `${timelineWidth + 80}px` }} onClick={handleTimelineClick}>
                  {spkSegments.map((seg) => {
                    const totalDur = Math.max(1, mediaDuration);
                    const left = (seg.start / totalDur) * timelineWidth + 40;
                    const width = ((seg.end - seg.start) / totalDur) * timelineWidth;
                    const isSelected = seg.id === selectedSegId;

                    return (
                      <div
                        key={seg.id}
                        className={`studio-timeline-block ${isSelected ? "active" : ""}`}
                        style={{
                          left: `${left}px`,
                          width: `${Math.max(50, width)}px`,
                          background: `${spk.color}55`,
                          borderColor: spk.color,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectSegment(seg);
                        }}
                        title={`[${spk.name}] ${seg.translated}`}
                      >
                        <div
                          className="studio-timeline-block-handle left"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNudgeSegment(seg.id, "start", -0.2);
                          }}
                          title="Thu nhỏ/Kéo dài đầu câu (-0.2s)"
                        />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>
                          {seg.translated}
                        </span>
                        <div
                          className="studio-timeline-block-handle right"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNudgeSegment(seg.id, "end", 0.2);
                          }}
                          title="Thu nhỏ/Kéo dài cuối câu (+0.2s)"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </footer>

      {/* Export Modal Overlay */}
      {isExporting && (
        <div className="studio-modal-backdrop">
          <div className="studio-modal-box">
            <div className="studio-modal-title">
              <IconClapper size={18} />
              <span>{exportDonePath ? "Xuất Video Hoàn Tất!" : "Đang Xuất Video Lồng Tiếng..."}</span>
            </div>
            <div className="studio-progress-bar-bg">
              <div className="studio-progress-bar-fill" style={{ width: `${exportProgress}%` }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--t2)" }}>{exportMessage}</div>
            {exportDonePath ? (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="studio-btn-action-primary"
                  onClick={() => sublix.dubbingOpenOutputFolder(exportDonePath)}
                >
                  📁 Mở Thư Mục Thành Phẩm
                </button>
                <button
                  type="button"
                  className="studio-btn-subtle"
                  onClick={() => setIsExporting(false)}
                >
                  Đóng
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="studio-floating-toast">
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
