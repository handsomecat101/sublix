//! SublixStudioView.tsx â€” All-in-One Multi-track AI Dubbing & Subtitle Studio
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
  // R5-01: refs for async timeout check (avoid stale closure).
  const filePathRef = useRef<string | null>(null);
  const transcodedPathRef = useRef<string | null>(null);
  filePathRef.current = filePath;
  transcodedPathRef.current = transcodedPath;
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState<boolean>(false);
  const scrubbingCleanupRef = useRef<(() => void) | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const timelineTracksBodyRef = useRef<HTMLDivElement | null>(null);

  // Timeline (P5)
  const [batchMode, setBatchMode] = useState<boolean>(false);
  // v0.11.3: zoom semantic Ä‘á»•i tá»« "sá»‘ giÃ¢y hiá»ƒn thá»‹" â†’ "% viewport" (100% = full video fit viewport).
  // ÄÃºng chuáº©n Premiere/DaVinci: zoom out max = toÃ n cáº£nh video, zoom in = frame lá»›n.
  // Má»‘c tick tá»± co giÃ£n (1s/5s/30s/1min/5min...) theo pxPerSec, khÃ´ng cá»‘ Ä‘á»‹nh 5s ná»¯a.
  const [zoomLevel, setZoomLevel] = useState<number>(100); // % viewport (100 = full video)
  const [magnetSnap, setMagnetSnap] = useState<boolean>(true);
  const [linkTracks, setLinkTracks] = useState<boolean>(true);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Subtitle Display Mode & Video Scale
  const [subtitleDisplayMode, setSubtitleDisplayMode] = useState<"translated" | "original" | "bilingual">("translated");
  const [videoScale, setVideoScale] = useState<number>(100);

  // Right column tab (Phá»¥ Ä‘á» vs Thuá»™c tÃ­nh)
  const [rightTab, setRightTab] = useState<"subtitles" | "properties">("subtitles");

  // Subtitle styling properties (driven by Thuá»™c tÃ­nh tab)
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
    setTranscodedPath(null); // ROUND-4 R4-01: reset transcode cache khi Ä‘á»•i file
    if (initialFilePath) {
      setFilePath(initialFilePath);
      const name = initialFilePath.split(/[\\/]/).pop() || initialFilePath;
      setFileName(name);
      setVideoPlayError(false);
      handleSeek(0);
    }
  }, [initialFilePath, fileNonce]);

  // R5-01: cleanup loadedMetadataTimer khi component unmount hoặc đổi file
  // (tránh setState sau khi component đã unmount → React warning).
  useEffect(() => {
    return () => {
      if (loadedMetadataTimerRef.current !== null) {
        clearTimeout(loadedMetadataTimerRef.current);
        loadedMetadataTimerRef.current = null;
      }
    };
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
            } else {
              // R4-09: kÃ©o tháº£ nhÆ°ng khÃ´ng cÃ³ path â†’ bÃ¡o user (khÃ´ng ngáº­m tÄƒm)
              showToast("âš ï¸ KÃ©o tháº£ khÃ´ng kháº£ dá»¥ng â€” hÃ£y dÃ¹ng nÃºt 'Má»Ÿ video' Ä‘á»ƒ chá»n file.");
            }
          } else {
            setIsDraggingFile(false);
          }
        });
      } catch (err) {
        // R4-09: kÃ©o tháº£ fail hoÃ n toÃ n â†’ toast cho user biáº¿t, khÃ´ng im láº·ng
        console.warn("Tauri drag-drop in SublixStudioView failed:", err);
        showToast("âš ï¸ KÃ©o tháº£ khÃ´ng kháº£ dá»¥ng trÃªn há»‡ thá»‘ng nÃ y â€” hÃ£y dÃ¹ng nÃºt 'Má»Ÿ video'.");
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
  // R5-01: ref tá»›i handleLoadedMetadata Ä‘á»ƒ R5-01 detect video im láº·ng
  // (WebView2 há»ng codec kiá»ƒu im láº·ng: cháº¡y giá», phÃ¡t tiáº¿ng, KHUNG TRá»NG,
  // khÃ´ng error event). PhÃ¡t hiá»‡n báº±ng videoWidth=0 sau ~800ms.
  const loadedMetadataTimerRef = useRef<number | null>(null);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      if (dur && !isNaN(dur) && dur > 0) {
        setMediaDuration(dur);
      }
      setVideoPlayError(false);
      // R4-04: Re-apply playbackRate khi metadata load â€” trÃ¡nh bug "Ä‘á»•i video khi
      // Ä‘ang 1.5x â†’ element reset vá» 1x nhÆ°ng UI váº«n kÃªu 1.5x (nÃ³i dá»‘i)".
      if (videoRef.current.playbackRate !== playbackSpeed) {
        videoRef.current.playbackRate = playbackSpeed;
      }
      // R5-01: sau 800ms kiá»ƒm videoWidth â€” náº¿u 0 â†’ video im láº·ng (codec há»ng
      // kiá»ƒu WebView2 im láº·ng), chá»§ Ä‘á»™ng chuyá»ƒn táº¡m báº±ng transcodeForPreview.
      if (loadedMetadataTimerRef.current !== null) {
        clearTimeout(loadedMetadataTimerRef.current);
      }
      loadedMetadataTimerRef.current = window.setTimeout(() => {
        const v = videoRef.current;
        if (v && v.videoWidth === 0 && !transcodedPathRef.current && filePathRef.current) {
          console.warn(
            "R5-01: videoWidth=0 sau loadedmetadata + 800ms â€” video im láº·ng, kÃ­ch hoáº¡t transcode fallback."
          );
          showToast("â³ Video khÃ´ng hiá»ƒn thá»‹ hÃ¬nh â€” Ä‘ang chuyá»ƒn sang dáº¡ng xem Ä‘Æ°á»£câ€¦");
          void (async () => {
            try {
              const previewPath = await sublix.transcodeForPreview(filePathRef.current!);
              if (previewPath) {
                setTranscodedPath(previewPath);
                showToast("âœ… ÄÃ£ chuyá»ƒn sang dáº¡ng xem Ä‘Æ°á»£c, Ä‘ang phÃ¡t previewâ€¦");
              }
            } catch (err) {
              console.error("R5-01 transcode fallback failed:", err);
              showToast(`âŒ KhÃ´ng thá»ƒ chuyá»ƒn dáº¡ng: ${(err as Error)?.message ?? err}`);
            }
          })();
        }
      }, 800);
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

  // R4-05: chá»‰ save translation undo khi giÃ¡ trá»‹ thay Ä‘á»•i (onFocus + onBlur)
  const translationPreFocusRef = useRef<{ id: number; translated: string }[] | null>(null);
  const saveTranslationUndoIfChanged = () => {
    const before = translationPreFocusRef.current;
    translationPreFocusRef.current = null;
    if (!before) return;
    const after = segmentsRef.current.map((s) => ({ id: s.id, translated: s.translated }));
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (changed) saveTranslationUndo();
  };

  const saveAudioUndo = () => {
    setUndoAudioStack((prev) => [...prev.slice(-19), speakersRef.current]);
  };

  // R4-05: chá»‰ save undo khi ná»™i dung THáº¬T Sá»° thay Ä‘á»•i.
  // LÆ°u snapshot trÆ°á»›c khi user focus vÃ o input; náº¿u blur vá»›i cÃ¹ng giÃ¡ trá»‹ â†’ bá» qua.
  const audioPreFocusRef = useRef<SpeakerItem[] | null>(null);
  const saveAudioUndoIfChanged = () => {
    const before = audioPreFocusRef.current;
    audioPreFocusRef.current = null;
    if (!before) return;
    const after = speakersRef.current;
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (changed) saveAudioUndo();
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
      showToast("â„¹ï¸ KhÃ´ng cÃ³ thao tÃ¡c phá»¥ Ä‘á» nÃ o Ä‘á»ƒ hoÃ n tÃ¡c");
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
    showToast("â†¶ ÄÃ£ hoÃ n tÃ¡c má»‘c thá»i gian / cáº¥u trÃºc phá»¥ Ä‘á» (giá»¯ nguyÃªn báº£n dá»‹ch)");
  };

  const handleUndoTranslation = () => {
    const stack = undoTranslationStackRef.current;
    if (stack.length === 0) {
      showToast("â„¹ï¸ KhÃ´ng cÃ³ thao tÃ¡c dá»‹ch nÃ o Ä‘á»ƒ hoÃ n tÃ¡c");
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
    showToast("â†¶ ÄÃ£ hoÃ n tÃ¡c ná»™i dung báº£n dá»‹ch");
  };

  const handleUndoAudio = () => {
    const stack = undoAudioStackRef.current;
    if (stack.length === 0) {
      showToast("â„¹ï¸ KhÃ´ng cÃ³ thao tÃ¡c giá»ng Ä‘á»c nÃ o Ä‘á»ƒ hoÃ n tÃ¡c");
      return;
    }
    const previous = stack[stack.length - 1];
    setUndoAudioStack((prev) => prev.slice(0, -1));
    setSpeakers(previous);
    showToast("â†¶ ÄÃ£ hoÃ n tÃ¡c phÃ¢n vai / giá»ng Ä‘á»c nhÃ¢n váº­t");
  };

  const handleTogglePlay = () => {
    if (!filePath) {
      showToast("â„¹ï¸ Vui lÃ²ng má»Ÿ hoáº·c kÃ©o tháº£ video trÆ°á»›c khi phÃ¡t");
      return;
    }
    if (videoPlayError) {
      showToast("âš ï¸ Video gáº·p lá»—i Ä‘á»‹nh dáº¡ng, khÃ´ng thá»ƒ phÃ¡t");
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
          showToast("âŒ KhÃ´ng thá»ƒ phÃ¡t video nÃ y trong trÃ¬nh xem");
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
      } else if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd" ||
                 ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "="))) {
        // v0.11.4: Zoom in (chuáº©n Premiere). TrÃ¡nh trÃ¹ng vá»›i Ctrl+= (zoom browser).
        if (!(e.ctrlKey || e.metaKey) || e.key === "+" || e.key === "=") {
          e.preventDefault();
          setZoomLevel((z) => Math.min(10000, Math.round(z * 1.5)));
        }
      } else if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract" ||
                 ((e.ctrlKey || e.metaKey) && e.key === "-")) {
        e.preventDefault();
        setZoomLevel((z) => Math.max(100, Math.round(z / 1.5)));
      } else if (e.key === "\\" || ((e.ctrlKey || e.metaKey) && e.key === "0")) {
        // v0.11.4: Fit timeline to viewport (100%) â€” chuáº©n Premiere "\"
        e.preventDefault();
        setZoomLevel(100);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive]);

  // v0.11.3: Zoom = % viewport. 100% = full video fit viewport ~1200px.
  // VÃ­ dá»¥ Kenji 38:24 = 2304s: zoom 100% â†’ 0.52 px/s; zoom 1000% â†’ 5.2 px/s.
  const TIMELINE_VIEWPORT_WIDTH = 1200;
  const pxPerSec = (TIMELINE_VIEWPORT_WIDTH * (zoomLevel / 100)) / Math.max(1, mediaDuration);
  const timelineWidth = Math.max(TIMELINE_VIEWPORT_WIDTH, Math.round(mediaDuration * pxPerSec));

  // v0.11.3: chá»n tick interval Ä‘áº¹p (~100px giá»¯a 2 tick) theo zoom hiá»‡n táº¡i.
  // Tráº£ vá» sá»‘ giÃ¢y giá»¯a 2 má»‘c (1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200).
  const chooseTickInterval = (pps: number): number => {
    const targetPx = 100;
    const rawSec = targetPx / Math.max(0.001, pps);
    const steps = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200];
    return steps.find((s) => s >= rawSec) ?? 3600;
  };
  const tickIntervalSec = chooseTickInterval(pxPerSec);
  const timelineWidthRef = useRef<number>(timelineWidth);
  timelineWidthRef.current = timelineWidth;

  // Playhead scrubbing pointer handlers (kÃ©o tháº£ Ä‘á»ƒ cháº¡y video qua timeline)
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
      showToast("âš ï¸ Vui lÃ²ng chá»n video trÆ°á»›c khi phÃ¢n tÃ­ch!");
      return;
    }
    setIsAnalyzing(true);
    setAnalyzeProgress(5);
    setAnalyzeMessage("Äang khá»Ÿi táº¡o pipeline AI...");

    const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
    if (!isTauri) {
      showToast("â³ Äang khá»Ÿi táº¡o pipeline phÃ¢n tÃ­ch...");
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
        setAnalyzeMessage("PhÃ¢n tÃ­ch hoÃ n táº¥t!");
        showToast(`âœ… PhÃ¢n tÃ­ch xong: ${mappedSegments.length} cÃ¢u thoáº¡i, ${mappedSpeakers.length} nhÃ¢n váº­t.`);
      }
    } catch (err) {
      console.error("Analysis backend error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("há»§y") || errMsg.includes("cancel") || errMsg.includes("dá»«ng")) {
        setAnalyzeMessage("Tiáº¿n trÃ¬nh Ä‘Ã£ bá»‹ ngÆ°á»i dÃ¹ng há»§y.");
        showToast("ðŸ›‘ Tiáº¿n trÃ¬nh phÃ¢n tÃ­ch Ä‘Ã£ bá»‹ há»§y.");
      } else {
        setAnalyzeMessage(`Lá»—i phÃ¢n tÃ­ch: ${errMsg}`);
        showToast(`âŒ Lá»—i phÃ¢n tÃ­ch: ${errMsg}`);
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
      showToast("ðŸ›‘ ÄÃ£ gá»­i lá»‡nh dá»«ng phÃ¢n tÃ­ch video.");
      setAnalyzeMessage("Tiáº¿n trÃ¬nh Ä‘Ã£ bá»‹ ngÆ°á»i dÃ¹ng há»§y.");
      setIsAnalyzing(false);
    } catch (err) {
      console.warn("Cancel analysis error:", err);
    }
  };

  // Play Base64 audio preview for speaker (R3-01: replace alert with toast, track playback state)
  const handlePlayAudio = (sampleAudio?: string | null, spkId?: string) => {
    if (!sampleAudio) {
      showToast("â„¹ï¸ KhÃ´ng cÃ³ clip Ã¢m thanh máº«u cho vai nÃ y.");
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
            const samplePhrase = `Xin chÃ o, tÃ´i lÃ  ${spk.name}, Ä‘Ã¢y lÃ  máº«u giá»ng Ä‘á»c Ä‘Æ°á»£c gÃ¡n cho nhÃ¢n váº­t cá»§a tÃ´i.`;
            dataUri = await sublix.dubbingPreviewTts(samplePhrase, spkVoice);
          } catch (e) {
            console.warn("Preview TTS invoke failed:", e);
          }
        }
      }

      if (dataUri) {
        handlePlayAudio(dataUri, spk.id);
        showToast(`ðŸŽ§ Äang nghe thá»­ giá»ng ${spkVoice} cá»§a ${spk.name}`);
      } else if (spk.sampleAudio) {
        handlePlayAudio(spk.sampleAudio, spk.id);
        showToast(`ðŸŽ§ PhÃ¡t clip giá»ng gá»‘c cá»§a ${spk.name}`);
      } else {
        // R4-03: KHÃ”NG phÃ¡t beep giáº£ máº¡o "máº«u giá»ng". Trung thá»±c bÃ¡o chÆ°a cÃ³ máº«u.
        showToast(`âš ï¸ ChÆ°a cÃ³ máº«u giá»ng cho vai "${spk.name}" â€” báº¥m ðŸ”Š Nghe giá»ng gá»‘c Ä‘á»ƒ táº¡o.`);
      }
    } catch (err) {
      console.warn("Failed preview voice, trying sampleAudio fallback:", err);
      if (spk.sampleAudio) {
        handlePlayAudio(spk.sampleAudio, spk.id);
        showToast(`ðŸŽ§ PhÃ¡t clip giá»ng gá»‘c cá»§a ${spk.name}`);
      } else {
        showToast(`â„¹ï¸ Máº«u giá»ng ${spk.voice || "máº·c Ä‘á»‹nh"} (${spk.name}) Ä‘Ã£ Ä‘Æ°á»£c chá»n.`);
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
        translated: target.translated + " (pháº§n 2)",
      };

      return prev.flatMap((s) => (s.id === id ? [firstHalf, secondHalf] : [s]));
    });
    showToast("âœ‚ï¸ ÄÃ£ tÃ¡ch cÃ¢u táº¡i vá»‹ trÃ­ playhead");
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
    showToast("ðŸ“‹ ÄÃ£ nhÃ¢n báº£n cÃ¢u thoáº¡i");
  };

  const handleDeleteSegment = (idToDelete?: number) => {
    const id = idToDelete ?? selectedSegId;
    if (segments.length === 0) return;
    saveUndoHistory();
    setSegments((prev) => prev.filter((s) => s.id !== id));
    showToast("ðŸ—‘ ÄÃ£ xÃ³a cÃ¢u thoáº¡i");
  };

  const handleFitTimeline = () => {
    // v0.11.3: Fit full media duration into view = zoom 100% (full video fit viewport)
    setZoomLevel(100);
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
          showToast(`ðŸŽ§ Äang phÃ¡t cÃ¢u thoáº¡i báº±ng giá»ng ${voice}`);
        }
      } else {
        // R4-03: KHÃ”NG phÃ¡t beep giáº£ â€” bÃ¡o trung thá»±c.
        showToast(`âš ï¸ ChÆ°a cÃ³ máº«u giá»ng "${voice}" â€” báº¥m ðŸ”Š Nghe giá»ng gá»‘c Ä‘á»ƒ táº¡o.`);
      }
    } catch (err) {
      console.warn("Preview TTS error:", err);
      showToast(`âš ï¸ KhÃ´ng thá»ƒ nghe thá»­ giá»ng: ${err}`);
    } finally {
      setPreviewingSegId(null);
    }
  };

  const handleExportVideo = async () => {
    if (!filePath) {
      showToast("âš ï¸ Vui lÃ²ng má»Ÿ video trÆ°á»›c khi xuáº¥t!");
      return;
    }
    setIsExporting(true);
    setExportProgress(10);
    setExportMessage("Äang Ä‘Ã³ng gÃ³i ká»‹ch báº£n vÃ  audio tracks...");
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
      setExportMessage("Xuáº¥t video thÃ nh cÃ´ng!");
      setExportDonePath(outPath);
    } catch (err) {
      console.error("Export error:", err);
      showToast("âŒ Lá»—i xuáº¥t video: " + err);
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
          P1 â€” TOPBAR
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
              <span>Táº£i video</span>
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
              <span>Lá»‹ch sá»­</span>
            </button>
            <button
              type="button"
              className="studio-nav-tab"
              onClick={() => onNavigateTab?.("models")}
            >
              <IconSettings size={13} />
              <span>CÃ i Ä‘áº·t</span>
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
            title="Nháº­p video tá»« mÃ¡y tÃ­nh (PhÃ­m táº¯t: Ctrl + I)"
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
            <span>ðŸ“¥ Nháº­p video</span>
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
                setFileName("ChÆ°a má»Ÿ video");
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
                showToast("ÄÃ£ Ä‘Ã³ng video hiá»‡n táº¡i");
              }}
            >
              âœ•
            </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="studio-topbar-right">
          <button
            type="button"
            className="studio-btn-subtle"
            title="HoÃ n tÃ¡c (Ctrl+Z)"
            onClick={handleUndo}
          >
            <IconUndo size={14} />
          </button>

          <div className="studio-theme-dots" title="Äá»•i theme giao diá»‡n">
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
            title="Má»Ÿ file video tá»« mÃ¡y tÃ­nh"
          >
            <IconPlus size={13} /> Má»Ÿ video
          </button>

          <button
            type="button"
            className="studio-btn-export-video"
            onClick={handleExportVideo}
            title="Xuáº¥t video hoÃ n chá»‰nh"
          >
            <IconClapper size={13} /> Xuáº¥t video
          </button>
        </div>
      </header>

      {/* ====================================================================
          WORKSPACE â€” 3 COLUMNS (P2, P3, P4)
          ==================================================================== */}
      <div className="studio-workspace">
        {/* P2: Cá»˜T BÆ¯á»šC BÃŠN TRÃI */}
        <aside className="studio-col-steps">
          <div className="studio-steps-header">
            <button
              type="button"
              className={`studio-steps-tab-btn ${leftTab === "pipeline" ? "active" : ""}`}
              onClick={() => setLeftTab("pipeline")}
            >
              âš¡ Thuyáº¿t Minh & Lá»“ng Tiáº¿ng
            </button>
            <button
              type="button"
              className={`studio-steps-tab-btn ${leftTab === "review" ? "active" : ""}`}
              onClick={() => setLeftTab("review")}
            >
              ðŸ“‘ TÃ³m Táº¯t & Review
            </button>
          </div>

          <div className="studio-steps-body">
            {leftTab === "pipeline" ? (
              <>
                {/* Card 1: Nháº­n dáº¡ng giá»ng nÃ³i (STT) */}
                <div className="studio-step-card">
              <div
                className="studio-step-card-header"
                onClick={() => setOpenCard(openCard === "stt" ? "dubbing" : "stt")}
              >
                <div className="studio-step-card-title">
                  <IconMic size={14} />
                  <span>Nháº­n dáº¡ng giá»ng nÃ³i</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="studio-step-card-status">
                    {speakers.length} vai â€¢ {mediaDuration.toFixed(1)}s
                  </span>
                  {openCard === "stt" ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                </div>
              </div>

              {openCard === "stt" && (
                <div className="studio-step-card-content">
                  <div className="studio-form-row">
                    <label className="studio-form-label">NgÃ´n ngá»¯ gá»‘c:</label>
                    <select
                      className="studio-form-select"
                      value={sttLang}
                      onChange={(e) => setSttLang(e.target.value)}
                    >
                      <option value="auto">Tá»± Ä‘á»™ng phÃ¡t hiá»‡n (Auto)</option>
                      <option value="ja">Tiáº¿ng Nháº­t (Japanese)</option>
                      <option value="en">Tiáº¿ng Anh (English)</option>
                      <option value="zh">Tiáº¿ng Trung (Chinese)</option>
                      <option value="vi">Tiáº¿ng Viá»‡t (Vietnamese)</option>
                    </select>
                  </div>

                  <div className="studio-form-row">
                    <label className="studio-form-label">MÃ´ hÃ¬nh nháº­n dáº¡ng:</label>
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
                    <span className="studio-toggle-label">Hiá»‡n vÃ¹ng OCR / Sub cÅ©</span>
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
                    <span className="studio-toggle-label">GhÃ©p cÃ¢u thÃ´ng minh (Sentence)</span>
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
                    <span className="studio-toggle-label">PhÃ¢n biá»‡t ngÆ°á»i nÃ³i (Sherpa)</span>
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

            {/* Card 2: Dá»‹ch thuáº­t & LLM Selector */}
            <div className="studio-step-card">
              <div
                className="studio-step-card-header"
                onClick={() => setOpenCard(openCard === "translate" ? "dubbing" : "translate")}
              >
                <div className="studio-step-card-title">
                  <IconGlobe size={14} />
                  <span>Dá»‹ch thuáº­t & NhÃ  cung cáº¥p LLM</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="studio-step-card-status">
                    {segments.length} cÃ¢u â€¢ {transProvider.toUpperCase()}
                  </span>
                  {openCard === "translate" ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                </div>
              </div>

              {openCard === "translate" && (
                <div className="studio-step-card-content">
                  <div className="studio-form-row">
                    <label className="studio-form-label">NhÃ  cung cáº¥p AI dá»‹ch:</label>
                    <select
                      className="studio-form-select"
                      value={transProvider}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTransProvider(val);
                        handleSaveProviderConfig(val);
                      }}
                    >
                      <option value="deepseek">â˜… DeepSeek ChÃ­nh HÃ£ng (KhuyÃªn DÃ¹ng - SiÃªu Nhanh)</option>
                      <option value="openrouter">OpenRouter API (Top Models ToÃ n Cáº§u)</option>
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
                          <option value="deepseek-chat">deepseek-chat (V3 - KhuyÃªn DÃ¹ng)</option>
                          <option value="deepseek-reasoner">deepseek-reasoner (R1 Suy Luáº­n)</option>
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
                          <option value="google/gemini-2.0-flash-001">google/gemini-2.0-flash-001 (SiÃªu Nhanh & Ráº»)</option>
                          <option value="google/gemini-2.5-pro">google/gemini-2.5-pro (Gemini Pro Cao Cáº¥p)</option>
                          <option value="meta-llama/llama-3.3-70b-instruct">meta-llama/llama-3.3-70b-instruct (Há»™i Thoáº¡i Tá»± NhiÃªn)</option>
                          <option value="qwen/qwen-2.5-72b-instruct">qwen/qwen-2.5-72b-instruct (Äa NgÃ´n Ngá»¯ SOTA)</option>
                          <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
                        </select>
                      </div>
                      <div className="studio-form-row">
                        <label className="studio-form-label">MÃ£ Model OpenRouter TÃ¹y Chá»‰nh:</label>
                        <input
                          type="text"
                          className="studio-form-input"
                          placeholder="Hoáº·c nháº­p mÃ£ model tÃ¹y Ã½ trÃªn openrouter.ai..."
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
                    <label className="studio-form-label">NgÃ´n ngá»¯ Ä‘Ã­ch:</label>
                    <select
                      className="studio-form-select"
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                    >
                      <option value="vi">Tiáº¿ng Viá»‡t (vi)</option>
                      <option value="en">English (en)</option>
                      <option value="ja">Tiáº¿ng Nháº­t (ja)</option>
                    </select>
                  </div>

                  <div className="studio-form-row">
                    <label className="studio-form-label">Phong cÃ¡ch dá»‹ch:</label>
                    <select
                      className="studio-form-select"
                      value={transStyle}
                      onChange={(e) => setTransStyle(e.target.value)}
                    >
                      <option value="theatrical">Review phim & Truyá»n cáº£m</option>
                      <option value="literal">Dá»‹ch sÃ¡t nghÄ©a (Há»c thuáº­t)</option>
                      <option value="casual">ThÃ¢n máº­t & Tráº» trung</option>
                    </select>
                  </div>

                  {/* Há»“ sÆ¡ phim (AI Há»c) â€” KhÃ³a xÆ°ng hÃ´ */}
                  <div className="studio-glossary-box">
                    <div className="studio-glossary-header">
                      <span>ðŸ·ï¸ Há»“ sÆ¡ phim (AI há»c)</span>
                      <button
                        type="button"
                        className="studio-btn-subtle-sm"
                        onClick={async () => {
                          try {
                            const cfg = await sublix.getConfig();
                            cfg.glossary = glossary;
                            await sublix.saveConfig(cfg);
                            showToast(`âœ… ÄÃ£ lÆ°u ${glossary.length} quy táº¯c vÃ o há»“ sÆ¡ phim & cáº¥u hÃ¬nh`);
                          } catch (err) {
                            console.warn("Failed to save glossary:", err);
                            showToast("âŒ KhÃ´ng thá»ƒ lÆ°u há»“ sÆ¡ phim");
                          }
                        }}
                        title="Ghi nháº­n quy táº¯c xÆ°ng hÃ´ Ä‘á»ƒ Ã¡p dá»¥ng vÃ o GLOSSARY prompt khi dá»‹ch"
                      >
                        LÆ°u há»“ sÆ¡ phim
                      </button>
                    </div>
                    <span className="studio-glossary-desc">
                      Danh sÃ¡ch tÃªn riÃªng & quy táº¯c xÆ°ng hÃ´ Ä‘Æ°á»£c lÆ°u láº¡i Ä‘á»ƒ AI dá»‹ch nháº¥t quÃ¡n giá»¯a cÃ¡c táº­p phim.
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
                            title="XÃ³a quy táº¯c nÃ y"
                          >
                            âœ•
                          </button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <input
                        type="text"
                        className="studio-form-input"
                        placeholder="ThÃªm cáº·p tÃªn / xÆ°ng hÃ´ (vd: Kenji âž” Huynh)..."
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
                        + ThÃªm
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Card 3: Giá»ng Ä‘á»c & Báº£ng PhÃ¢n Vai */}
            <div className="studio-step-card">
              <div
                className="studio-step-card-header"
                onClick={() => setOpenCard(openCard === "dubbing" ? "stt" : "dubbing")}
              >
                <div className="studio-step-card-title">
                  <IconClapper size={14} />
                  <span>Giá»ng Ä‘á»c & PhÃ¢n vai</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="studio-step-card-status">{speakers.length} vai diá»…n</span>
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
                      {isAnalyzing ? "Äang PhÃ¢n TÃ­ch..." : "PhÃ¢n TÃ­ch NgÆ°á»i NÃ³i (Sherpa AI)"}
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
                        title="Dá»«ng tiáº¿n trÃ¬nh phÃ¢n tÃ­ch nhÃ¢n váº­t"
                      >
                        â¹ Dá»«ng
                      </button>
                    )}
                  </div>

                  {isAnalyzing && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div className="studio-progress-badge">
                        <span>â³ {analyzeMessage}</span>
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
                            onFocus={() => { audioPreFocusRef.current = speakersRef.current; }}
                            onBlur={() => saveAudioUndoIfChanged()}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSpeakers((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, name: val } : s))
                              );
                            }}
                          />
                          <span className="studio-speaker-chip-count">
                            {segments.filter((s) => s.speakerId === spk.id).length} cÃ¢u
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
                          <option value="kokoro:tuan_ngoc">Tuáº¥n Ngá»c â™‚ (Báº¯c - Kokoro Local)</option>
                          <option value="kokoro:manh_dung">Máº¡nh DÅ©ng â™‚ (Nam - Kokoro Local)</option>
                          <option value="kokoro:mai_linh">Mai Linh â™€ (Báº¯c - Kokoro Local)</option>
                          <option value="kokoro:ngoc_huyen">Ngá»c Huyá»n â™€ (Nam - Kokoro Local)</option>
                          <option value="vi-VN-HoaiMyNeural">HoÃ i My â™€ (Edge TTS Free)</option>
                          <option value="vi-VN-NamMinhNeural">Nam Minh â™‚ (Edge TTS Free)</option>
                        </select>

                        <div className="studio-speaker-actions">
                          <button
                            type="button"
                            className="studio-btn-voice-preview"
                            onClick={() => handlePlayAudio(spk.sampleAudio, spk.id)}
                            title="Nghe clip Ã¢m thanh gá»‘c cá»§a nhÃ¢n váº­t nÃ y"
                          >
                            <IconVolume2 size={12} /> Giá»ng gá»‘c
                          </button>
                          <button
                            type="button"
                            className={`studio-btn-voice-preview ${playingAudioSpkId === spk.id ? "is-playing" : ""}`}
                            onClick={() => handlePreviewSpeakerVoice(spk)}
                            disabled={auditioningSpkId === spk.id}
                            title="Nghe thá»­ giá»ng Ä‘á»c Ä‘Æ°á»£c gÃ¡n"
                          >
                            {playingAudioSpkId === spk.id ? (
                              <>
                                <span style={{ color: "#38bdf8", display: "inline-flex" }}>
                                  <IconVolume2 size={12} />
                                </span>{" "}
                                Äang phÃ¡t...
                              </>
                            ) : auditioningSpkId === spk.id ? (
                              <>
                                <IconPlay size={12} /> Äang táº£i...
                              </>
                            ) : (
                              <>
                                <IconPlay size={12} /> Nghe thá»­
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
                          name: `NhÃ¢n váº­t ${speakers.length + 1}`,
                          gender: "male",
                          color: SPEAKER_COLORS[speakers.length % SPEAKER_COLORS.length],
                          voice: "kokoro:tuan_ngoc",
                          count: 0,
                        },
                      ]);
                    }}
                  >
                    <IconPlus size={12} /> ThÃªm vai diá»…n
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="studio-review-panel">
            <div className="studio-review-card">
              <div className="studio-review-title">
                <span>ðŸ“Š Thá»‘ng KÃª Nhá»‹p Thoáº¡i & Ká»‹ch Báº£n</span>
              </div>
              <div className="studio-review-stat-grid">
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{segments.length}</span>
                  <span className="studio-review-stat-label">Tá»•ng cÃ¢u thoáº¡i</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{mediaDuration.toFixed(1)}s</span>
                  <span className="studio-review-stat-label">Thá»i lÆ°á»£ng video</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{speakers.length} vai</span>
                  <span className="studio-review-stat-label">NhÃ¢n váº­t tham gia</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">
                    {segments.length > 0 ? `~${calculatedWpm} WPM` : "â€”"}
                  </span>
                  <span className="studio-review-stat-label">Tá»‘c Ä‘á»™ thoáº¡i TB</span>
                </div>
              </div>
            </div>

            <div className="studio-review-card">
              <div className="studio-review-title">
                <span>ðŸ“ TÃ³m Táº¯t Cá»‘t Truyá»‡n & Thoáº¡i</span>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--t2)", lineHeight: 1.5, margin: 0 }}>
                {segments.length > 0
                  ? `Dá»± Ã¡n gá»“m ${segments.length} cÃ¢u thoáº¡i, tá»•ng ${totalSpeechSeconds.toFixed(1)}s thá»i lÆ°á»£ng thoáº¡i cá»§a ${speakers.length} nhÃ¢n váº­t (${speakers.map((s) => s.name).join(", ")}).`
                  : "ChÆ°a cÃ³ ká»‹ch báº£n Ä‘á»ƒ tÃ³m táº¯t cá»‘t truyá»‡n."}
              </p>
            </div>

            <div className="studio-review-card">
              <div className="studio-review-title">
                <span>ðŸ›¡ ÄÃ¡nh GiÃ¡ Cháº¥t LÆ°á»£ng Ká»‹ch Báº£n</span>
                {reviewScore !== null && (
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: reviewScore >= 80 ? "#10b981" : "#f59e0b" }}>
                    {reviewScore}/100
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                {reviewNotes.length > 0 ? (
                  reviewNotes.map((n, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: n.startsWith("âœ“") ? "#10b981" : "#f59e0b" }}>
                      <span>{n}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#10b981" }}>
                      <span>âœ“</span>
                      <span>PhÃ¢n vai: {speakers.length} vai diá»…n Ä‘á»™c láº­p trÃªn timeline.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#10b981" }}>
                      <span>âœ“</span>
                      <span>Äá»“ng bá»™ má»‘c thá»i gian: {segments.length} cÃ¢u thoáº¡i sáºµn sÃ ng.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ac)" }}>
                      <span>âš¡</span>
                      <span>Phong cÃ¡ch: {transStyle === "theatrical" ? "Äiá»‡n áº¢nh (Theatrical)" : "Thuyáº¿t Minh Chuáº©n"}</span>
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
                    setReviewNotes(["ChÆ°a cÃ³ phÃ¢n Ä‘oáº¡n thoáº¡i nÃ o Ä‘á»ƒ Ä‘Ã¡nh giÃ¡."]);
                    showToast("â„¹ï¸ ChÆ°a cÃ³ ká»‹ch báº£n Ä‘á»ƒ Ä‘Ã¡nh giÃ¡");
                    return;
                  }
                  let s = 100;
                  const notes: string[] = [];
                  const emptyTrans = segments.filter((seg) => !seg.translated.trim()).length;
                  if (emptyTrans > 0) {
                    s -= Math.min(30, emptyTrans * 5);
                    notes.push(`âš ï¸ CÃ³ ${emptyTrans} cÃ¢u chÆ°a cÃ³ ná»™i dung dá»‹ch`);
                  } else {
                    notes.push("âœ“ 100% cÃ¢u Ä‘Ã£ cÃ³ báº£n dá»‹ch hoÃ n chá»‰nh");
                  }
                  const unusedSpeakers = speakers.filter((spk) => !segments.some((seg) => seg.speakerId === spk.id)).length;
                  if (unusedSpeakers > 0) {
                    s -= Math.min(20, unusedSpeakers * 5);
                    notes.push(`âš ï¸ CÃ³ ${unusedSpeakers} vai chÆ°a Ä‘Æ°á»£c gÃ¡n cÃ¢u thoáº¡i nÃ o`);
                  } else if (speakers.length > 0) {
                    notes.push(`âœ“ ToÃ n bá»™ ${speakers.length} nhÃ¢n váº­t Ä‘á»u cÃ³ cÃ¢u thoáº¡i`);
                  }
                  const longSegs = segments.filter((seg) => seg.end - seg.start > 12).length;
                  if (longSegs > 0) {
                    s -= Math.min(15, longSegs * 3);
                    notes.push(`âš ï¸ CÃ³ ${longSegs} cÃ¢u thoáº¡i dÃ i hÆ¡n 12s (cáº§n ngáº¯t)`);
                  } else {
                    notes.push("âœ“ Má»‘c thá»i gian thoáº¡i tá»± nhiÃªn (<12s/cÃ¢u)");
                  }
                  const finalScore = Math.max(0, s);
                  setReviewScore(finalScore);
                  setReviewNotes(notes);
                  showToast(`âœ… ÄÃ£ Ä‘Ã¡nh giÃ¡ ká»‹ch báº£n: ${finalScore}/100`);
                }}
              >
                âœ¨ ÄÃ¡nh giÃ¡ láº¡i ká»‹ch báº£n
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
                  âœ¨ {isAnalyzing ? "Äang Xá»­ LÃ½ Video..." : "Xá»­ LÃ½ Video (1-Click Pipeline)"}
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
                    title="Dá»«ng tiáº¿n trÃ¬nh xá»­ lÃ½ video"
                  >
                    â¹ Dá»«ng
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                <span style={{ fontSize: 10, color: "var(--t3)" }}>HoÃ n tÃ¡c:</span>
                <span className="studio-filter-chip" onClick={handleUndoAudio} style={{ cursor: "pointer" }} title="HoÃ n tÃ¡c gÃ¡n giá»ng / phÃ¢n vai">â†¶ Audio</span>
                <span className="studio-filter-chip" onClick={handleUndoTranslation} style={{ cursor: "pointer" }} title="HoÃ n tÃ¡c ná»™i dung báº£n dá»‹ch">â†¶ Báº£n dá»‹ch</span>
                <span className="studio-filter-chip" onClick={handleUndoSubtitles} style={{ cursor: "pointer" }} title="HoÃ n tÃ¡c má»‘c thá»i gian phá»¥ Ä‘á»">â†¶ Phá»¥ Ä‘á»</span>
              </div>
            </div>
          </div>
        </aside>

        {/* P3: KHUNG XEM VIDEO á»ž GIá»®A */}
        <section className="studio-col-video">
          <div className="studio-video-toolbar">
            <div className="studio-video-toolbar-left">
              <select
                className="studio-video-select-subtle"
                value={subtitleDisplayMode}
                onChange={(e) => setSubtitleDisplayMode(e.target.value as any)}
                title="Cháº¿ Ä‘á»™ hiá»ƒn thá»‹ phá»¥ Ä‘á» trÃªn mÃ n chiáº¿u (Báº£n dá»‹ch / Gá»‘c / Song ngá»¯)"
              >
                <option value="translated">Original (Báº£n dá»‹ch)</option>
                <option value="original">NguyÃªn báº£n (Gá»‘c)</option>
                <option value="bilingual">Song ngá»¯ (2 dÃ²ng)</option>
              </select>
              <select
                className="studio-video-select-subtle"
                value={videoScale}
                onChange={(e) => setVideoScale(Number(e.target.value))}
                title="Thu phÃ³ng kÃ­ch thÆ°á»›c khung xem video"
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
                  showToast("Thu nhá» khung xem video");
                }}
                title="Thu nhá» khung video (-10%)"
              >
                â€“
              </button>
              <button
                type="button"
                className="studio-action-btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={() => {
                  setVideoScale((prev) => Math.min(100, prev + 10));
                  showToast("PhÃ³ng to khung xem video");
                }}
                title="PhÃ³ng to khung video (+10%)"
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
                      videoRef.current.requestFullscreen().catch(() => showToast("Cháº¿ Ä‘á»™ toÃ n mÃ n hÃ¬nh video"));
                    }
                  } else {
                    showToast("ToÃ n mÃ n hÃ¬nh: Nháº¥n Ä‘á»ƒ xem toÃ n mÃ n hÃ¬nh video");
                  }
                }}
                title="Xem toÃ n mÃ n hÃ¬nh (Fullscreen)"
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
                      // ROUND-4 R4-01: WebView2 khÃ´ng giáº£i mÃ£ Ä‘Æ°á»£c codec gá»‘c (VP9/AV1/HEVC/H.264 high).
                      // Tá»± cháº¡y ffmpeg chuyá»ƒn sang H.264 baseline + AAC rá»“i phÃ¡t báº£n táº¡m.
                      // Náº¿u transcoding cÅ©ng fail â†’ má»›i fallback Cinema Visualizer.
                      console.warn(
                        "Video element could not decode in WebView2, attempting ffmpeg transcode to H.264/AAC baselineâ€¦"
                      );
                      try {
                        console.log("Äang chuyá»ƒn táº¡m video sang H.264 Ä‘á»ƒ xem Ä‘Æ°á»£c trong Studioâ€¦");
                        const previewPath = await sublix.transcodeForPreview(filePath);
                        setTranscodedPath(previewPath);
                        console.log("ÄÃ£ chuyá»ƒn táº¡m xong, Ä‘ang phÃ¡t báº£n previewâ€¦");
                        return;
                      } catch (transcodeErr) {
                        console.error("ffmpeg transcode failed, falling back:", transcodeErr);
                        console.error(`KhÃ´ng thá»ƒ chuyá»ƒn táº¡m video: ${(transcodeErr as Error)?.message ?? transcodeErr}`);
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

              {/* 1. DROPZONE KHI CHÆ¯A CÃ“ VIDEO HOáº¶C KÃ‰O THáº¢ Tá»†P (Chuáº©n áº£nh minh há»a EZMAXSUB) */}
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
                    {isDraggingFile ? "âœ¨ Tháº£ tá»‡p video vÃ o Ä‘Ã¢y Ä‘á»ƒ báº¯t Ä‘áº§u ngay!" : "Nháº¥n Ä‘á»ƒ nháº­p video (hoáº·c KÃ©o tháº£ tá»‡p vÃ o Ä‘Ã¢y)"}
                  </div>

                  <div style={{ fontSize: 11, color: "var(--t3)", letterSpacing: 1 }}>
                    MP4 â€¢ MKV â€¢ MOV â€¢ M4A â€¢ AVI â€¢ MP3
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
                    PhÃ­m táº¯t: Ctrl + I
                  </div>
                </div>
              )}

              {/* 2. THÃ”NG BÃO Lá»–I THáº¬T KHI VIDEO Gáº¶P Sá»° Cá» Äá»ŠNH Dáº NG */}
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
                  <div style={{ fontSize: 32 }}>âš ï¸</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171" }}>
                    KhÃ´ng thá»ƒ phÃ¡t tá»‡p video nÃ y trá»±c tiáº¿p trong trÃ¬nh xem
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t3)", maxWidth: 440 }}>
                    Tá»‡p cÃ³ thá»ƒ bá»‹ há»ng, Ä‘Æ°á»ng dáº«n khÃ´ng tá»“n táº¡i hoáº·c sá»­ dá»¥ng codec khÃ´ng Ä‘Æ°á»£c há»— trá»£ bá»Ÿi WebView2.
                  </div>
                  <button
                    type="button"
                    className="studio-btn primary"
                    onClick={handlePickMediaFile}
                    style={{ marginTop: 8 }}
                  >
                    Chá»n video khÃ¡c (Ctrl+I)
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
                    {formatTimecode(activeSubtitle.start)} â†’ {formatTimecode(activeSubtitle.end)} â€¢{" "}
                    {speakers.find((s) => s.id === activeSubtitle.speakerId)?.name || "ChÆ°a phÃ¢n vai"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* P4: DANH SÃCH CÃ‚U (Cá»˜T PHáº¢I) */}
        <aside className="studio-col-segments">
          <div className="studio-segments-header">
            <div className="studio-segments-tabs">
              <button
                type="button"
                className={`studio-segments-tab-btn ${rightTab === "subtitles" ? "active" : ""}`}
                onClick={() => setRightTab("subtitles")}
              >
                ðŸ“‘ Phá»¥ Ä‘á»
              </button>
              <button
                type="button"
                className={`studio-segments-tab-btn ${rightTab === "properties" ? "active" : ""}`}
                onClick={() => setRightTab("properties")}
              >
                âš™ Thuá»™c tÃ­nh
              </button>
            </div>
            {rightTab === "subtitles" && (
              <div className="studio-segments-actions">
                <button
                  type="button"
                  className="studio-btn-subtle-sm"
                  onClick={handleDuplicateSegment}
                  title="ThÃªm nhanh má»™t cÃ¢u thoáº¡i má»›i"
                >
                  + ThÃªm
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
                    placeholder="TÃ¬m trong phá»¥ Ä‘á»..."
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
              Táº¥t cáº£ ({segments.length})
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
                        title="LÃ¹i má»‘c báº¯t Ä‘áº§u 0.1s"
                      >
                        -0.1s
                      </button>
                      <span className="studio-segment-timing-text">
                        {formatTimecode(seg.start)} â†’ {formatTimecode(seg.end)}
                      </span>
                      <button
                        type="button"
                        className="studio-timing-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNudgeSegment(seg.id, "end", 0.1);
                        }}
                        title="Tiáº¿n má»‘c káº¿t thÃºc 0.1s"
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
                      title="Chuyá»ƒn vai diá»…n cho cÃ¢u thoáº¡i nÃ y"
                    >
                      {speakers.map((s) => (
                        <option key={s.id} value={s.id}>
                          â— {s.name}
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
                    onFocus={() => {
                      translationPreFocusRef.current = segmentsRef.current.map((s) => ({
                        id: s.id,
                        translated: s.translated,
                      }));
                    }}
                    onBlur={() => saveTranslationUndoIfChanged()}
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
                      title="Nghe thá»­ giá»ng Ä‘á»c cÃ¢u thoáº¡i nÃ y (Kokoro TTS)"
                    >
                      <IconVolume2 size={11} />
                      {previewingSegId === seg.id ? "Äang táº¡o..." : "Nghe cÃ¢u"}
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
                        title="TÃ¡ch cÃ¢u táº¡i playhead"
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
                        title="XÃ³a cÃ¢u"
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
              <span>ðŸ”¤ Kiá»ƒu DÃ¡ng Phá»¥ Äá» MÃ n Chiáº¿u</span>
            </div>

            <div className="studio-prop-row">
              <span>Cá»¡ chá»¯: {subFontSize}px</span>
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
              <span>MÃ u chá»¯:</span>
              <div className="studio-prop-swatches">
                {[
                  { name: "VÃ ng", color: "#e8a33d" },
                  { name: "Tráº¯ng", color: "#ffffff" },
                  { name: "Xanh", color: "#38bdf8" },
                  { name: "Xanh lÃ¡", color: "#4ade80" },
                  { name: "Äá»", color: "#f87171" },
                ].map((c) => (
                  <div
                    key={c.color}
                    className={`studio-prop-swatch ${subFontColor === c.color ? "active" : ""}`}
                    style={{ background: c.color }}
                    onClick={() => {
                      setSubFontColor(c.color);
                      showToast(`ÄÃ£ chá»n mÃ u phá»¥ Ä‘á»: ${c.name}`);
                    }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="studio-prop-row">
              <span>Vá»‹ trÃ­:</span>
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { id: "bottom", label: "DÆ°á»›i Ä‘Ã¡y" },
                  { id: "center", label: "á»ž giá»¯a" },
                  { id: "top", label: "TrÃªn Ä‘á»‰nh" },
                ].map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    className={`studio-filter-chip ${subPosition === pos.id ? "active" : ""}`}
                    onClick={() => {
                      setSubPosition(pos.id as any);
                      showToast(`Vá»‹ trÃ­ phá»¥ Ä‘á»: ${pos.label}`);
                    }}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="studio-prop-row">
              <span>Äá»• bÃ³ng tÆ°Æ¡ng pháº£n:</span>
              <label className="studio-switch">
                <input
                  type="checkbox"
                  checked={subShowShadow}
                  onChange={(e) => {
                    setSubShowShadow(e.target.checked);
                    showToast(e.target.checked ? "ÄÃ£ báº­t bÃ³ng chá»¯" : "ÄÃ£ táº¯t bÃ³ng chá»¯");
                  }}
                />
                <span className="studio-slider" />
              </label>
            </div>
          </div>

          <div className="studio-prop-card">
            <div className="studio-prop-title">
              <span>ðŸ“¹ ThÃ´ng Tin & Thuá»™c TÃ­nh Video</span>
            </div>
            <div className="studio-prop-row">
              <span>Tá»‡p Ä‘ang má»Ÿ:</span>
              <span style={{ color: "var(--t1)", fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fileName}
              </span>
            </div>
            <div className="studio-prop-row">
              <span>Thá»i lÆ°á»£ng:</span>
              <span style={{ color: "var(--ac)", fontWeight: 700 }}>
                {formatTimecode(mediaDuration)} ({mediaDuration.toFixed(1)}s)
              </span>
            </div>
            <div className="studio-prop-row">
              <span>Sá»‘ cÃ¢u thoáº¡i:</span>
              <span>{segments.length} cÃ¢u</span>
            </div>
            <div className="studio-prop-row">
              <span>Sá»‘ nhÃ¢n váº­t:</span>
              <span>{speakers.length} vai</span>
            </div>
            <div className="studio-prop-row">
              <span>Tá»· lá»‡ hiá»ƒn thá»‹:</span>
              <span>16:9 Cinema Widescreen</span>
            </div>
          </div>
        </div>
      )}
        </aside>
      </div>

      {/* ====================================================================
          P5 â€” TIMELINE ÄA LÃ€N (BOTTOM TIMELINE)
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
              title="Cáº¯t táº¡i playhead (Split)"
            >
              <IconScissors size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={handleDuplicateSegment}
              title="NhÃ¢n báº£n (Duplicate)"
            >
              <IconCopy size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={() => handleDeleteSegment()}
              title="XÃ³a cÃ¢u (Delete)"
            >
              <IconTrash size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={handleFitTimeline}
              title="GiÃ£n kÃ­n timeline â€” phá»§ toÃ n bá»™ chiá»u dÃ i video (Fit)"
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
                showToast(next ? "ðŸ§² ÄÃ£ Báº¬T Tá»± Ä‘á»™ng báº¯t dÃ­nh Playhead vÃ o mÃ©p cÃ¢u thoáº¡i" : "ÄÃ£ Táº®T Báº¯t dÃ­nh");
              }}
              title="Tá»± Ä‘á»™ng báº¯t dÃ­nh â€” cÄƒn vÃ o playhead vÃ  mÃ©p gáº§n nháº¥t (N)"
            >
              <IconMagnet size={13} />
            </button>
            <button
              type="button"
              className={`studio-timeline-tool-btn ${linkTracks ? "active" : ""}`}
              onClick={() => {
                const next = !linkTracks;
                setLinkTracks(next);
                showToast(next ? "ðŸ”— ÄÃ£ Báº¬T LiÃªn káº¿t Ä‘á»“ng bá»™ clip & phá»¥ Ä‘á»" : "ÄÃ£ Táº®T LiÃªn káº¿t rÃ£nh");
              }}
              title="LiÃªn káº¿t â€” di chuyá»ƒn hoáº·c xÃ³a ná»™i dung Ä‘i kÃ¨m clip trÃªn rÃ£nh chÃ­nh (P)"
            >
              <IconLink size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              title="ÄÃ¡nh dáº¥u má»‘c thá»i gian (Bookmark)"
              onClick={() => {
                setBookmarks((prev) => [...prev, currentTime]);
                showToast(`ðŸ”– ÄÃ£ ghim Bookmark táº¡i má»‘c ${formatTimecode(currentTime)}`);
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
              title="Vá» Ä‘áº§u (Home)"
            >
              â®
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(currentTime - 1)}
              title="LÃ¹i 1 giÃ¢y"
            >
              â—€
            </button>
            <button
              type="button"
              className="studio-btn-transport-play"
              onClick={handleTogglePlay}
              title="PhÃ¡t / Dá»«ng (PhÃ­m CÃ¡ch)"
            >
              {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(currentTime + 1)}
              title="Tiáº¿n 1 giÃ¢y"
            >
              â–¶
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(mediaDuration)}
              title="Äáº¿n cuá»‘i (End)"
            >
              â­
            </button>

            <div className="studio-timeline-timecode">
              <span>{formatTimecode(currentTime)}</span>
              <span className="studio-timeline-timecode-total">/ {formatTimecode(mediaDuration)}</span>
            </div>
          </div>

          <div
            className={`studio-timeline-batch-toggle ${batchMode ? "active" : ""}`}
            onClick={() => setBatchMode(!batchMode)}
            title="Batch Mode: Tá»± Ä‘á»™ng cháº¡y hÃ ng loáº¡t cho nhiá»u táº­p phim"
          >
            <input type="checkbox" checked={batchMode} readOnly style={{ cursor: "pointer" }} />
            <span>Batch Mode {batchMode ? "Báº¬T" : "Táº®T"}</span>
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
                showToast(`âš¡ Tá»‘c Ä‘á»™ phÃ¡t video: ${nextSpeed}x`);
              }}
              title="Nháº¥n Ä‘á»ƒ Ä‘á»•i tá»‘c Ä‘á»™ phÃ¡t (0.5x, 1.0x, 1.25x, 1.5x, 2.0x)"
              style={{ fontSize: 11, padding: "2px 6px", cursor: "pointer" }}
            >
              Tá»‘c Ä‘á»™: {playbackSpeed}x
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.max(100, Math.round(z / 2)))}
              title="Zoom out máº¡nh (Ã—0.5) â€” xem toÃ n cáº£nh video. PhÃ­m táº¯t: âˆ’"
              style={{ fontSize: 12, fontWeight: 700, padding: "0 6px", cursor: "pointer" }}
            >
              âˆ’âˆ’
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.max(100, Math.round(z / 1.5)))}
              title="Zoom out nháº¹ (Ã—0.67). PhÃ­m táº¯t: âˆ’"
              style={{ fontSize: 16, fontWeight: 700, padding: "0 8px", cursor: "pointer" }}
            >
              âˆ’
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel(100)}
              title="Reset vá» 100% = full video fit viewport. PhÃ­m táº¯t: \\"
              style={{ fontSize: 11, padding: "0 5px", cursor: "pointer" }}
            >
              âŸ²
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.min(10000, Math.round(z * 1.5)))}
              title="Zoom in nháº¹ (Ã—1.5). PhÃ­m táº¯t: +"
              style={{ fontSize: 16, fontWeight: 700, padding: "0 8px", cursor: "pointer" }}
            >
              +
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.min(10000, Math.round(z * 2)))}
              title="Zoom in máº¡nh (Ã—2) â€” frame cá»±c lá»›n, tick 0.1s. PhÃ­m táº¯t: +"
              style={{ fontSize: 12, fontWeight: 700, padding: "0 6px", cursor: "pointer" }}
            >
              ++
            </button>
            <span
              style={{
                minWidth: 56,
                textAlign: "right",
                fontWeight: 600,
                fontSize: 12,
                color: "var(--studio-accent, #5b9dff)",
                fontVariantNumeric: "tabular-nums",
              }}
              title="Zoom hiá»‡n táº¡i (% viewport â€” 100% = full video fit)"
            >
              {zoomLevel}%
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
                <span>ðŸ‘</span>
                <span>â–¼ VIDEO</span>
              </div>
            </div>
            <div className="studio-track-header-item">
              <div className="studio-track-header-left">
                <span>ðŸ‘</span>
                <span>â™« TIáº¾NG Gá»C</span>
              </div>
            </div>
            <div className="studio-track-header-item">
              <div className="studio-track-header-left">
                <span>ðŸ‘</span>
                <span>ðŸ’¬ PHá»¤ Äá»€</span>
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
                  <span>â— {spk.name}</span>
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
                title="KÃ©o tháº£ Ä‘áº§u kim Ä‘á»ƒ tua / cháº¡y video qua timeline (Scrubbing)"
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
              title="Báº¥m giá»¯ vÃ  kÃ©o rÃª Ä‘á»ƒ cháº¡y video theo má»‘c thá»i gian"
            >
              {Array.from({ length: Math.ceil(mediaDuration / tickIntervalSec) + 1 }).map((_, i) => {
                const t = i * tickIntervalSec;
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
                    showToast(`Nháº£y tá»›i Bookmark: ${formatTimecode(bmTime)}`);
                  }}
                  title={`Bookmark ${idx + 1}: ${formatTimecode(bmTime)}`}
                >
                  ðŸ”–
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
                        title={`Khung hÃ¬nh má»‘c ${formatTimecode(thumb.time_sec)}`}
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
                    ChÆ°a náº¡p video
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
                      title="Thu nhá»/KÃ©o dÃ i Ä‘áº§u cÃ¢u (-0.2s)"
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
                      title="Thu nhá»/KÃ©o dÃ i cuá»‘i cÃ¢u (+0.2s)"
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
                          title="Thu nhá»/KÃ©o dÃ i Ä‘áº§u cÃ¢u (-0.2s)"
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
                          title="Thu nhá»/KÃ©o dÃ i cuá»‘i cÃ¢u (+0.2s)"
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
              <span>{exportDonePath ? "Xuáº¥t Video HoÃ n Táº¥t!" : "Äang Xuáº¥t Video Lá»“ng Tiáº¿ng..."}</span>
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
                  ðŸ“ Má»Ÿ ThÆ° Má»¥c ThÃ nh Pháº©m
                </button>
                <button
                  type="button"
                  className="studio-btn-subtle"
                  onClick={() => setIsExporting(false)}
                >
                  ÄÃ³ng
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
