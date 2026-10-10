//! SublixStudioView.tsx  All-in-One Multi-track AI Dubbing & Subtitle Studio
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
  onNavigateTab?: (tab: "downloader" | "live" | "history" | "models" | "overlay" | "process") => void;
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

const STUDIO_PROJECT_CACHE_KEY = "sublix_active_studio_project_v1";

interface SavedStudioProject {
  filePath: string;
  fileName: string;
  mediaDuration: number;
  segments: SubtitleItem[];
  speakers: SpeakerItem[];
  audioPeaks: number[];
  filmstripThumbs: Array<{ time_sec: number; data_uri: string }>;
  currentTime: number;
  sttLang?: string;
  targetLang?: string;
}

export default function SublixStudioView({
  onNavigateTab,
  currentTheme = "cinema",
  onThemeChange,
  initialFilePath,
  isActive = true,
  fileNonce,
}: SublixStudioViewProps) {
  // Tự động khôi phục project đã nạp từ cache nếu không có initialFilePath mới
  const [cachedProject] = useState<SavedStudioProject | null>(() => {
    if (initialFilePath) return null;
    try {
      const raw = localStorage.getItem(STUDIO_PROJECT_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Navigation & Project Meta
  const [activeTab, setActiveTab] = useState<string>("studio");
  const [filePath, setFilePath] = useState<string>(
    initialFilePath || cachedProject?.filePath || ""
  );
  const [fileName, setFileName] = useState<string>(
    initialFilePath
      ? (initialFilePath.split(/[\\/]/).pop() || "")
      : (cachedProject?.fileName || "")
  );
  const [mediaDuration, setMediaDuration] = useState<number>(
    cachedProject?.mediaDuration || 0
  );

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
  const [speakers, setSpeakers] = useState<SpeakerItem[]>(
    cachedProject?.speakers || []
  );
  const [segments, setSegments] = useState<SubtitleItem[]>(
    cachedProject?.segments || []
  );
  const [selectedSegId, setSelectedSegId] = useState<number>(0);
  const [speakerFilter, setSpeakerFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Pipeline Analysis Status
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<number>(0);
  const [analyzeMessage, setAnalyzeMessage] = useState<string>("");

  // R2-03 & R2-D: Real audio peaks and filmstrip video thumbnails
  const [audioPeaks, setAudioPeaks] = useState<number[]>(
    cachedProject?.audioPeaks || []
  );
  const [filmstripThumbs, setFilmstripThumbs] = useState<Array<{ time_sec: number; data_uri: string }>>(
    cachedProject?.filmstripThumbs || []
  );
  const [isPreviewExtracting, setIsPreviewExtracting] = useState<boolean>(false);

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
  // v0.11.3: zoom semantic đổi từ "số giy hiển thị" → "% viewport" (100% = full video fit viewport).
  // Đng chuẩn Premiere/DaVinci: zoom out max = ton cảnh video, zoom in = frame lớn.
  // Mốc tick tự co gin (1s/5s/30s/1min/5min...) theo pxPerSec, khng cố định 5s nữa.
  const [zoomLevel, setZoomLevel] = useState<number>(100); // % viewport (100 = full video)
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

  // C3 & R2-07: Sync initialFilePath & fileNonce prop changes (chỉ cập nhật khi có path mới khác path hiện tại)
  useEffect(() => {
    if (initialFilePath && initialFilePath !== filePath) {
      setTranscodedPath(null); // ROUND-4 R4-01: reset transcode cache khi đổi file
      setFilePath(initialFilePath);
      const name = initialFilePath.split(/[\\/]/).pop() || initialFilePath;
      setFileName(name);
      setVideoPlayError(false);
      handleSeek(0);
    }
  }, [initialFilePath, fileNonce]);

  // Tự động tạm dừng phát video khi người dùng chuyển sang tab khác
  useEffect(() => {
    if (!isActive && videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [isActive]);

  // Tự động lưu trạng thái dự án Studio vào localStorage để không bao giờ bị mất
  useEffect(() => {
    if (!filePath) return;
    const timer = window.setTimeout(() => {
      try {
        const payload: SavedStudioProject = {
          filePath,
          fileName,
          mediaDuration,
          segments,
          speakers,
          audioPeaks,
          filmstripThumbs,
          currentTime,
          sttLang,
          targetLang,
        };
        localStorage.setItem(STUDIO_PROJECT_CACHE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.warn("Studio auto-save to localStorage failed:", err);
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [filePath, fileName, mediaDuration, segments, speakers, audioPeaks, filmstripThumbs, currentTime, sttLang, targetLang]);

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

  // R5-03: cleanup preview file cũ khi user đổi video (setFilePath với file mới)
  // hoặc clear file (setFilePath("")). Dùng ref để track file trước đó → gọi
  // backend cleanup theo input_path cũ. Không cần await (fire-and-forget OK).
  const prevFilePathRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevFilePathRef.current;
    if (prev && prev !== filePath) {
      // Đổi file hoặc clear → dọn preview cũ (nếu có)
      void sublix.cleanupPreviewForInput(prev).catch((e) => {
        console.warn("cleanupPreviewForInput failed:", e);
      });
      // Reset transcodedPath để <video> không trỏ vào file preview đã bị xoá
      setTranscodedPath(null);
    }
    prevFilePathRef.current = filePath || null;
  }, [filePath]);

  // Dọn dẹp cache preview chỉ khi tắt trình duyệt / thoát ứng dụng hoàn toàn (beforeunload)
  useEffect(() => {
    const onBeforeUnload = () => {
      void sublix.cleanupAllPreviews().catch(() => {});
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Tự động trích xuất sóng âm audio peaks và thumbnails khi nạp video vào timeline
  const previewExtractedPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!filePath || filePath.trim() === "") {
      previewExtractedPathRef.current = null;
      setAudioPeaks([]);
      setFilmstripThumbs([]);
      return;
    }

    if (previewExtractedPathRef.current === filePath && (filmstripThumbs.length > 0 || mediaDuration <= 0)) {
      return;
    }

    let isCancelled = false;
    setIsPreviewExtracting(true);

    const runExtract = async () => {
      try {
        const res = await sublix.extractMediaPreview(filePath, mediaDuration > 0 ? mediaDuration : undefined);
        if (!isCancelled) {
          if (res.peaks && res.peaks.length > 0) {
            setAudioPeaks(res.peaks);
          }
          if (res.filmstrip_thumbs && res.filmstrip_thumbs.length > 0) {
            setFilmstripThumbs(res.filmstrip_thumbs);
          }
          previewExtractedPathRef.current = filePath;
        }
      } catch (err) {
        console.warn("extractMediaPreview failed:", err);
      } finally {
        if (!isCancelled) {
          setIsPreviewExtracting(false);
        }
      }
    };

    runExtract();

    return () => {
      isCancelled = true;
    };
  }, [filePath, mediaDuration]);

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
              // R4-09: ko thả nhưng khng c path → bo user (khng ngậm tăm)
              showToast("⚠ Kéo thả không khả dụng — hãy dùng nút 'Mở video' để chọn file.");
            }
          } else {
            setIsDraggingFile(false);
          }
        });
      } catch (err) {
        // R4-09: ko thả fail hon ton → toast cho user biết, khng im lặng
        console.warn("Tauri drag-drop in SublixStudioView failed:", err);
        showToast("⚠ Kéo thả không khả dụng trên hệ thống này — hãy dùng nút 'Mở video'.");
        return () => {};
      }
    })();

    const handlePreventDrag = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", handlePreventDrag);
    window.addEventListener("drop", handlePreventDrag);

    return () => {
      window.removeEventListener("dragover", handlePreventDrag);
      window.removeEventListener("drop", handlePreventDrag);
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
  // R5-01: ref tới handleLoadedMetadata để R5-01 detect video im lặng
  // (WebView2 hng codec kiểu im lặng: chạy gi, pht tiếng, KHUNG TRNG,
  // khng error event). Pht hiện bằng videoWidth=0 sau ~800ms.
  const loadedMetadataTimerRef = useRef<number | null>(null);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      if (dur && !isNaN(dur) && dur > 0) {
        setMediaDuration(dur);
      }
      setVideoPlayError(false);
      // R4-04: Re-apply playbackRate khi metadata load — trnh bug "đổi video khi
      // đang 1.5x → element reset v 1x nhưng UI vẫn ku 1.5x (ni dối)".
      if (videoRef.current.playbackRate !== playbackSpeed) {
        videoRef.current.playbackRate = playbackSpeed;
      }
      // R6-01: detect video im lặng THẬT  dng requestVideoFrameCallback (Chromium/WebView2)
      // để đợi frame đầu tin được PAINT. Nếu sau 1.2s vẫn khng c frame no (framePainted = false)
      // HOẶC videoWidth === 0 → kch hoạt transcode fallback.
      // (R5-01 cũ chỉ check videoWidth=0  khng đủ v nhiều codec hỏng vẫn c videoWidth > 0 nhưng khng paint frame)
      if (loadedMetadataTimerRef.current !== null) {
        clearTimeout(loadedMetadataTimerRef.current);
      }
      let framePainted = false;
      let rvfcHandle: number | null = null;
      let wdkcInitial: number | null = null;
      let wdkcHandle: number | null = null;
      const v = videoRef.current;
      // R7-01: 3 cấp fallback cho detect frame  khng để thiếu RVFC → transcode oan mọi video.
      // Cấp 1: requestVideoFrameCallback (Chromium ≥83, WebView2 OK).
      // Cấp 2: webkitDecodedFrameCount (một số WebKit build cũ).
      // Cấp 3: khng c g → bỏ detect (framePainted = true để KHNG transcode oan).
      type VfcCapable = HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
        cancelVideoFrameCallback?: (h: number) => void;
        webkitDecodedFrameCount?: number;
      };
      const vc = v as VfcCapable | null;
      if (vc && typeof vc.requestVideoFrameCallback === "function") {
        // Cấp 1: RVFC
        rvfcHandle = vc.requestVideoFrameCallback(() => {
          framePainted = true;
        });
      } else if (vc && typeof vc.webkitDecodedFrameCount === "number") {
        // Cấp 2: sample webkitDecodedFrameCount
        wdkcInitial = vc.webkitDecodedFrameCount;
        wdkcHandle = window.setTimeout(() => {
          const cur = vc as VfcCapable;
          const curCount = cur.webkitDecodedFrameCount;
          if (typeof curCount === "number" && typeof wdkcInitial === "number" && curCount > wdkcInitial) {
            framePainted = true;
          }
        }, 500);
      } else {
        // Cấp 3: khng c cch no detect → giả định OK để khng transcode oan
        framePainted = true;
      }
      loadedMetadataTimerRef.current = window.setTimeout(() => {
        const cur = videoRef.current as VfcCapable | null;
        const stillNoFrame = !framePainted;
        const stillNoDim = cur && cur.videoWidth === 0;
        // Cleanup RVFC nếu c
        if (cur && rvfcHandle !== null && typeof cur.cancelVideoFrameCallback === "function") {
          try {
            cur.cancelVideoFrameCallback(rvfcHandle);
          } catch (e) {
            // ignore
          }
        }
        // Cleanup sample timer
        if (wdkcHandle !== null) {
          clearTimeout(wdkcHandle);
          wdkcHandle = null;
        }
        if (
          cur &&
          (stillNoFrame || stillNoDim) &&
          !transcodedPathRef.current &&
          filePathRef.current
        ) {
          const reason = stillNoFrame
            ? "frame callback khng fire sau 1.2s (codec hỏng kiểu im lặng)"
            : "videoWidth = 0 (khng decode được)";
          console.warn(`R6-01: ${reason}  kch hoạt transcode fallback.`);
          showToast("⏳ Video khng hiển thị hnh  đang chuyển sang dạng xem được");
          // R7-02: lưu currentTime + isPlaying TRƯỚC khi swap src để resume sau transcode
          const resumeTime = cur.currentTime;
          const wasPlaying = !cur.paused;
          void (async () => {
            try {
              const previewPath = await sublix.transcodeForPreview(filePathRef.current!);
              if (previewPath) {
                setTranscodedPath(previewPath);
                // R7-02: sau khi <video> src đổi sang preview, React sẽ remount. Đợi frame tiếp theo
                // rồi gọi play() + seek về currentTime cũ nếu c thể.
                setTimeout(() => {
                  const v2 = videoRef.current;
                  if (!v2) return;
                  if (resumeTime > 0 && Number.isFinite(resumeTime)) {
                    try {
                      v2.currentTime = Math.max(0, Math.min(resumeTime, (v2.duration || resumeTime) - 0.1));
                    } catch (e) {
                      // ignore
                    }
                  }
                  if (wasPlaying) {
                    v2.play().catch((e) => console.warn("R7-02: play() failed:", e));
                  }
                }, 250);
                // R7-03: sửa toast ni qu  chỉ thng bo đ chuyển dạng, khng hứa "Đang phát"
                showToast("✅ Đ chuyển sang dạng xem được");
              }
            } catch (err) {
              console.error("R6-01 transcode fallback failed:", err);
              showToast(`❌ Khng thể chuyển dạng: ${(err as Error)?.message ?? err}`);
            }
          })();
        }
      }, 1200);
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

  // R5-05: saveTranslationUndo() đ inline vo saveTranslationUndoIfChanged (push `before` thay v `after`).
  // Xo wrapper cũ để trnh TS6133 unused + trnh ti sử dụng sai trong tương lai.

  // R4-05: chỉ save translation undo khi gi trị thay đổi (onFocus + onBlur)
  // R5-05: push `before` (TRƯỚC khi sửa) ln stack  bấm ↶ = khi phục v� trạng thi trước.
  // Bug củ: gi saveTranslationUndo() (push `after`) → bấm ↶ = no-op.
  const translationPreFocusRef = useRef<{ id: number; translated: string }[] | null>(null);
  const saveTranslationUndoIfChanged = () => {
    const before = translationPreFocusRef.current;
    translationPreFocusRef.current = null;
    if (!before) return;
    const after = segmentsRef.current.map((s) => ({ id: s.id, translated: s.translated }));
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (changed) {
      // Push `before` (snapshot TRƯỚC khi user sửa) thay v `after` → bấm ↶ khi phục đng.
      setUndoTranslationStack((prev) => [...prev.slice(-19), before]);
    }
  };

  const saveAudioUndo = () => {
    setUndoAudioStack((prev) => [...prev.slice(-19), speakersRef.current]);
  };

  // R4-05: chỉ save undo khi nội dung THẬT SỰ thay đổi.
  // Lưu snapshot trước khi user focus vo input; nếu blur với cng gi trị → b qua.
  // R5-05: push `before` (TRƯỚC khi sửa) ln stack. Bug củ: gi saveAudioUndo() (push `after`) → no-op.
  const audioPreFocusRef = useRef<SpeakerItem[] | null>(null);
  const saveAudioUndoIfChanged = () => {
    const before = audioPreFocusRef.current;
    audioPreFocusRef.current = null;
    if (!before) return;
    const after = speakersRef.current;
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (changed) {
      // Push `before` (snapshot TRƯỚC khi user sửa) thay v `after` → bấm ↶ khi phục đng.
      setUndoAudioStack((prev) => [...prev.slice(-19), before]);
    }
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
      showToast("ℹ Khng c thao tc phụ đ no để hon tc");
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
    showToast("↶ Đ hon tc mốc thi gian / cấu trc phụ đ (giữ nguyn bản dịch)");
  };

  const handleUndoTranslation = () => {
    const stack = undoTranslationStackRef.current;
    if (stack.length === 0) {
      showToast("ℹ Khng c thao tc dịch no để hon tc");
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
    showToast("↶ Đ hon tc nội dung bản dịch");
  };

  const handleUndoAudio = () => {
    const stack = undoAudioStackRef.current;
    if (stack.length === 0) {
      showToast("ℹ Không có thao tác giọng đọc nào để hoàn tác");
      return;
    }
    const previous = stack[stack.length - 1];
    setUndoAudioStack((prev) => prev.slice(0, -1));
    setSpeakers(previous);
    showToast("↶ Đã hoàn tác phân vai / giọng đọc nhân vật");
  };

  const handleTogglePlay = () => {
    if (!filePath) {
      showToast("⚠ Vui lòng mở hoặc kéo thả video trước khi phát");
      return;
    }
    if (videoPlayError) {
      showToast("⚠ Video gặp lỗi định dạng, không thể phát");
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
          showToast("Không thể phát video này trong trình xem");
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
        // v0.11.4: Zoom in (chuẩn Premiere). Trnh trng với Ctrl+= (zoom browser).
        if (!(e.ctrlKey || e.metaKey) || e.key === "+" || e.key === "=") {
          e.preventDefault();
          setZoomLevel((z) => Math.min(10000, Math.round(z * 1.5)));
        }
      } else if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract" ||
                 ((e.ctrlKey || e.metaKey) && e.key === "-")) {
        e.preventDefault();
        setZoomLevel((z) => Math.max(100, Math.round(z / 1.5)));
      } else if (e.key === "\\" || ((e.ctrlKey || e.metaKey) && e.key === "0")) {
        // v0.11.4: Fit timeline to viewport (100%) — chuẩn Premiere "\"
        e.preventDefault();
        setZoomLevel(100);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive]);

  // v0.11.3: Zoom = % viewport. 100% = full video fit viewport ~1200px.
  // V dụ Kenji 38:24 = 2304s: zoom 100% → 0.52 px/s; zoom 1000% → 5.2 px/s.
  const TIMELINE_VIEWPORT_WIDTH = 1200;
  const pxPerSec = (TIMELINE_VIEWPORT_WIDTH * (zoomLevel / 100)) / Math.max(1, mediaDuration);
  const timelineWidth = Math.max(TIMELINE_VIEWPORT_WIDTH, Math.round(mediaDuration * pxPerSec));

  // v0.11.3: chn tick interval đẹp (~100px giữa 2 tick) theo zoom hiện tại.
  // Trả v số giy giữa 2 mốc (1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200).
  const chooseTickInterval = (pps: number): number => {
    const targetPx = 100;
    const rawSec = targetPx / Math.max(0.001, pps);
    const steps = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200];
    return steps.find((s) => s >= rawSec) ?? 3600;
  };
  const tickIntervalSec = chooseTickInterval(pxPerSec);
  const timelineWidthRef = useRef<number>(timelineWidth);
  timelineWidthRef.current = timelineWidth;

  // Playhead scrubbing pointer handlers (ko thả để chạy video qua timeline)
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
      showToast("⚠ Vui lòng mở hoặc kéo thả video trước khi phát");
      return;
    }
    setIsAnalyzing(true);
    setAnalyzeProgress(5);
    setAnalyzeMessage("Đang khởi tạo pipeline AI...");

    const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
    if (!isTauri) {
      showToast(" Đang khởi tạo pipeline phân tích...");
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
        setAnalyzeMessage("Tiến trnh đ bị ngưi dng hủy.");
        showToast("🛑 Tiến trình phân tích đã bị hủy.");
      } else {
        setAnalyzeMessage(`Lỗi phân tích: ${errMsg}`);
        showToast(` Lỗi phân tích: ${errMsg}`);
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
      setAnalyzeMessage("Tiến trnh đ bị ngưi dng hủy.");
      setIsAnalyzing(false);
    } catch (err) {
      console.warn("Cancel analysis error:", err);
    }
  };

  // Play Base64 audio preview for speaker (R3-01: replace alert with toast, track playback state)
  const handlePlayAudio = (sampleAudio?: string | null, spkId?: string) => {
    if (!sampleAudio) {
      showToast("ℹ Khng c clip m thanh mẫu cho vai ny.");
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
        showToast(`🎧 Đang nghe thử ging ${spkVoice} của ${spk.name}`);
      } else if (spk.sampleAudio) {
        handlePlayAudio(spk.sampleAudio, spk.id);
        showToast(`🎧 Pht clip ging gốc của ${spk.name}`);
      } else {
        // R4-03: KHÔNG pht beep giả mạo "mẫu ging". Trung thực bo chưa c mẫu.
        showToast(`⚠ Chưa c mẫu ging cho vai "${spk.name}"  bấm 🔊 Nghe ging gốc để tạo.`);
      }
    } catch (err) {
      console.warn("Failed preview voice, trying sampleAudio fallback:", err);
      if (spk.sampleAudio) {
        handlePlayAudio(spk.sampleAudio, spk.id);
        showToast(`🎧 Pht clip ging gốc của ${spk.name}`);
      } else {
        showToast(`ℹ Mẫu ging ${spk.voice || "mặc định"} (${spk.name}) đ được chn.`);
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

    // Cap canvas render width at 8192px to prevent Chromium texture crash on long media
    const renderWidth = Math.min(timelineWidth, 8192);
    canvas.width = renderWidth;
    const height = canvas.height || 32;
    ctx.clearRect(0, 0, renderWidth, height);

    if (mediaDuration <= 0) {
      return;
    }

    const midY = Math.floor(height / 2);

    if (audioPeaks.length > 0) {
      const gradient = ctx.createLinearGradient(0, 0, renderWidth, 0);
      gradient.addColorStop(0, "#38bdf8");
      gradient.addColorStop(0.5, "#2dd4bf");
      gradient.addColorStop(1, "#38bdf8");
      ctx.fillStyle = gradient;

      const barWidth = 2;
      const barGap = 1;
      const numBars = Math.floor(renderWidth / (barWidth + barGap));

      for (let i = 0; i < numBars; i++) {
        const ratio = i / Math.max(1, numBars - 1);
        const peakIdx = Math.min(audioPeaks.length - 1, Math.floor(ratio * audioPeaks.length));
        const peakVal = audioPeaks[peakIdx] || 0;

        if (peakVal < 0.015) {
          // Silence is strictly a 1px flat baseline
          ctx.fillRect(i * (barWidth + barGap), midY, barWidth, 1);
        } else {
          // Mirrored symmetrical waveform (DAW style)
          const halfH = Math.max(1, Math.min(Math.floor(height / 2) - 2, Math.floor(peakVal * (height / 2 - 2))));
          ctx.fillRect(i * (barWidth + barGap), midY - halfH, barWidth, halfH * 2);
        }
      }
    } else {
      // Subtle sine wave baseline indicating audio channel is ready / extracting
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      for (let x = 0; x < renderWidth; x += 8) {
        ctx.lineTo(x, midY + Math.sin(x * 0.08) * 2);
      }
      ctx.stroke();
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
    showToast("✂ Đ tch cu tại vị tr playhead");
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
    // R6-05: chuẩn ha voice id theo contract THẬT của backend `synthesize_speech` (dubbing/mod.rs:922-929).
    // Backend CHỈ parse prefix `kokoro:` → Kokoro local; MỌI THỨ KHC → Edge-TTS raw.
    // V vậy KHNG ĐƯỢC bịa thm prefix `edge:` / `minimax:` / `azure:` / `google:` / `clone:` v
    // backend khng parse → Edge-TTS sẽ thử dng raw lm voice name (fail).
    // Logic đng:
    //   1. Đ c `kokoro:` → Kokoro local, giữ nguyn.
    //   2. Match BCP-47 (vd "vi-VN-HoaiMyNeural", "en-US-AriaNeural", "ja-JP-NanamiNeural") → Edge raw, giữ nguyn.
    //   3. Ngược lại → mặc định `kokoro:` (giả định l tn Kokoro viết tắt, vd "tuan_ngoc").
    const KOKORO_PREFIX = "kokoro:";
    // BCP-47: lang (2-3 chữ thường) + optional region (2 chữ hoa) + optional sub-tags (vd "-HoaiMyNeural")
    const BCP47_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?(-[a-zA-Z0-9-]+)*$/;
    const isKokoroPrefixed = rawVoice.startsWith(KOKORO_PREFIX);
    const isBcp47Voice = BCP47_PATTERN.test(rawVoice);
    const voice = isKokoroPrefixed || isBcp47Voice ? rawVoice : `kokoro:${rawVoice}`;

    setPreviewingSegId(seg.id);
    try {
      const isTauriEnv = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
      if (isTauriEnv) {
        const wavData = await sublix.dubbingPreviewTts(seg.translated, voice);
        if (wavData) {
          const audio = new Audio(wavData);
          await audio.play();
          showToast(`🎧 Đang pht cu thoại bằng ging ${voice}`);
        }
      } else {
        // R4-03: KHÔNG pht beep giả — bo trung thực.
        showToast(`⚠ Chưa c mẫu ging "${voice}"  bấm 🔊 Nghe ging gốc để tạo.`);
      }
    } catch (err) {
      console.warn("Preview TTS error:", err);
      showToast(`⚠ Khng thể nghe thử ging: ${err}`);
    } finally {
      setPreviewingSegId(null);
    }
  };

  const handleExportVideo = async () => {
    if (!filePath) {
      showToast("⚠ Vui lòng mở hoặc kéo thả video trước khi phát");
      return;
    }
    setIsExporting(true);
    setExportProgress(10);
    setExportMessage("Đang đng gi kịch bản v audio tracks...");
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
      setExportMessage("Xuất video thnh cng!");
      setExportDonePath(outPath);
    } catch (err) {
      console.error("Export error:", err);
      showToast(" Lỗi xuất video: " + err);
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
              onClick={() => onNavigateTab?.("process")}
            >
              <IconClock size={13} />
              <span>Tiến trình</span>
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
            title="Nhập video từ my tnh (Phím tắt: Ctrl + I)"
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
                try {
                  localStorage.removeItem(STUDIO_PROJECT_CACHE_KEY);
                } catch {}
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
            title="Hoàn tác"
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
            title="Xuất video hon chỉnh"
          >
            <IconClapper size={13} /> Xuất video
          </button>
        </div>
      </header>

      {/* ====================================================================
          WORKSPACE — 3 COLUMNS (P2, P3, P4)
          ==================================================================== */}
      <div className="studio-workspace">
        {/* P2: CỘT BƯỚC BÊN TRI */}
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
                    <label className="studio-form-label">Ngn ngữ gốc:</label>
                    <select
                      className="studio-form-select"
                      value={sttLang}
                      onChange={(e) => setSttLang(e.target.value)}
                    >
                      <option value="auto">Tự động pht hiện (Auto)</option>
                      <option value="ja">Tiếng Nhật (Japanese)</option>
                      <option value="en">Tiếng Anh (English)</option>
                      <option value="zh">Tiếng Trung (Chinese)</option>
                      <option value="vi">Tiếng Việt (Vietnamese)</option>
                    </select>
                  </div>

                  <div className="studio-form-row">
                    <label className="studio-form-label">M hnh nhận dạng:</label>
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
                    <span className="studio-toggle-label">Hiện vng OCR / Sub cũ</span>
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
                    <span className="studio-toggle-label">Ghp cu thng minh (Sentence)</span>
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
                    <span className="studio-toggle-label">Phn biệt ngưi ni (Sherpa)</span>
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
                    {segments.length} cu • {transProvider.toUpperCase()}
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
                      <option value="deepseek">★ DeepSeek Chnh Hng (Khuyn Dng - Siu Nhanh)</option>
                      <option value="openrouter">OpenRouter API (Top Models Ton Cầu)</option>
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
                          <option value="deepseek-chat">deepseek-chat (V3 - Khuyn Dng)</option>
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
                          <option value="google/gemini-2.0-flash-001">google/gemini-2.0-flash-001 (Siu Nhanh & Rẻ)</option>
                          <option value="google/gemini-2.5-pro">google/gemini-2.5-pro (Gemini Pro Cao Cấp)</option>
                          <option value="meta-llama/llama-3.3-70b-instruct">meta-llama/llama-3.3-70b-instruct (Hội Thoại Tự Nhin)</option>
                          <option value="qwen/qwen-2.5-72b-instruct">qwen/qwen-2.5-72b-instruct (Đa Ngn Ngữ SOTA)</option>
                          <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
                        </select>
                      </div>
                      <div className="studio-form-row">
                        <label className="studio-form-label">M Model OpenRouter Ty Chỉnh:</label>
                        <input
                          type="text"
                          className="studio-form-input"
                          placeholder="Hoặc nhập m model ty  trn openrouter.ai..."
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
                    <label className="studio-form-label">Ngn ngữ đch:</label>
                    <select
                      className="studio-form-select"
                      value={targetLang}
                      onChange={(e) => {
                        const newLang = e.target.value;
                        setTargetLang(newLang);
                        // R6-08: lưu ngay vo AppConfig.target_lang để lần mở app sau
                        // (v quan trọng hơn: export_dubbed_video ở backend load
                        // target_lang từ config để tag audio language  nếu khng
                        // lưu, audio vẫn tag theo ngn ngữ cũ).
                        void sublix
                          .getConfig()
                          .then((cfg) => {
                            cfg.target_lang = newLang;
                            return sublix.saveConfig(cfg);
                          })
                          .then(() => {
                            showToast(`✅ Đ lưu ngn ngữ đch: ${newLang}`);
                          })
                          .catch((err) => {
                            console.warn("R6-08: failed to save target_lang:", err);
                            showToast(`⚠️ Lưu ngn ngữ đch thất bại: ${(err as Error)?.message ?? err}`);
                          });
                      }}
                    >
                      <option value="vi">Tiếng Việt (vi)</option>
                      <option value="en">English (en)</option>
                      <option value="ja">Tiếng Nhật (ja)</option>
                    </select>
                  </div>

                  <div className="studio-form-row">
                    <label className="studio-form-label">Phong cch dịch:</label>
                    <select
                      className="studio-form-select"
                      value={transStyle}
                      onChange={(e) => setTransStyle(e.target.value)}
                    >
                      <option value="theatrical">Review phim & Truyn cảm</option>
                      <option value="literal">Dịch st nghĩa (Hc thuật)</option>
                      <option value="casual">Thn mật & Trẻ trung</option>
                    </select>
                  </div>

                  {/* Hồ sơ phim (AI Hc)  Kha xưng h */}
                  <div className="studio-glossary-box">
                    <div className="studio-glossary-header">
                      <span> Hồ sơ phim (AI hc)</span>
                      <button
                        type="button"
                        className="studio-btn-subtle-sm"
                        onClick={async () => {
                          try {
                            const cfg = await sublix.getConfig();
                            cfg.glossary = glossary;
                            await sublix.saveConfig(cfg);
                            showToast(`✅ Đ lưu ${glossary.length} quy tắc vo hồ sơ phim & cấu hnh`);
                          } catch (err) {
                            console.warn("Failed to save glossary:", err);
                            showToast(" Khng thể lưu hồ sơ phim");
                          }
                        }}
                        title="Ghi nhận quy tắc xưng h để p dụng vo GLOSSARY prompt khi dịch"
                      >
                        Lưu hồ sơ phim
                      </button>
                    </div>
                    <span className="studio-glossary-desc">
                      Danh sch tn ring & quy tắc xưng h được lưu lại để AI dịch nhất qun giữa cc tập phim.
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
                            title="Xa quy tắc ny"
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
                        placeholder="Thêm cặp tên / cách xưng hô (vd: Kenji ➔ Huỳnh)..."
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
                         Dừng
                      </button>
                    )}
                  </div>

                  {isAnalyzing && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div className="studio-progress-badge">
                        <span> {analyzeMessage}</span>
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
                            {segments.filter((s) => s.speakerId === spk.id).length} cu
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
                          <option value="kokoro:tuan_ngoc">Tuấn Ngc ♂ (Bắc - Kokoro Local)</option>
                          <option value="kokoro:manh_dung">Mạnh Dũng ♂ (Nam - Kokoro Local)</option>
                          <option value="kokoro:mai_linh">Mai Linh ♀ (Bắc - Kokoro Local)</option>
                          <option value="kokoro:ngoc_huyen">Ngc Huyn ♀ (Nam - Kokoro Local)</option>
                          <option value="vi-VN-HoaiMyNeural">Hoi My ♀ (Edge TTS Free)</option>
                          <option value="vi-VN-NamMinhNeural">Nam Minh ♂ (Edge TTS Free)</option>
                        </select>

                        <div className="studio-speaker-actions">
                          <button
                            type="button"
                            className="studio-btn-voice-preview"
                            onClick={() => handlePlayAudio(spk.sampleAudio, spk.id)}
                            title="Nghe clip m thanh gốc của nhn vật ny"
                          >
                            <IconVolume2 size={12} /> Ging gốc
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
                                Đang pht...
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
                          name: `Nhn vật ${speakers.length + 1}`,
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
                <span>📊 Thống K Nhịp Thoại & Kịch Bản</span>
              </div>
              <div className="studio-review-stat-grid">
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{segments.length}</span>
                  <span className="studio-review-stat-label">Tổng cu thoại</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{mediaDuration.toFixed(1)}s</span>
                  <span className="studio-review-stat-label">Thi lượng video</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{speakers.length} vai</span>
                  <span className="studio-review-stat-label">Nhn vật tham gia</span>
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
                <span> Tm Tắt Cốt Truyện & Thoại</span>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--t2)", lineHeight: 1.5, margin: 0 }}>
                {segments.length > 0
                  ? `Dự n gồm ${segments.length} câu thoại, tổng ${totalSpeechSeconds.toFixed(1)}s thi lượng thoại của ${speakers.length} nhn vật (${speakers.map((s) => s.name).join(", ")}).`
                  : "Chưa c kịch bản để tm tắt cốt truyện."}
              </p>
            </div>

            <div className="studio-review-card">
              <div className="studio-review-title">
                <span>🛡 Đnh Gi Chất Lượng Kịch Bản</span>
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
                      <span>Phn vai: {speakers.length} vai diễn độc lập trn timeline.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#10b981" }}>
                      <span>✓</span>
                      <span>Đồng bộ mốc thi gian: {segments.length} cu thoại sẵn sng.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ac)" }}>
                      <span>⚡</span>
                      <span>Phong cch: {transStyle === "theatrical" ? "Điện Ảnh (Theatrical)" : "Thuyết Minh Chuẩn"}</span>
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
                    setReviewNotes(["Chưa c phn đoạn thoại no để đnh gi."]);
                    showToast("ℹ Chưa c kịch bản để đnh gi");
                    return;
                  }
                  let s = 100;
                  const notes: string[] = [];
                  const emptyTrans = segments.filter((seg) => !seg.translated.trim()).length;
                  if (emptyTrans > 0) {
                    s -= Math.min(30, emptyTrans * 5);
                    notes.push(`⚠ C ${emptyTrans} cu chưa c nội dung dịch`);
                  } else {
                    notes.push("✓ 100% cu đ c bản dịch hon chỉnh");
                  }
                  const unusedSpeakers = speakers.filter((spk) => !segments.some((seg) => seg.speakerId === spk.id)).length;
                  if (unusedSpeakers > 0) {
                    s -= Math.min(20, unusedSpeakers * 5);
                    notes.push(`⚠ C ${unusedSpeakers} vai chưa được gn cu thoại no`);
                  } else if (speakers.length > 0) {
                    notes.push(`✓ Ton bộ ${speakers.length} nhn vật đu c cu thoại`);
                  }
                  const longSegs = segments.filter((seg) => seg.end - seg.start > 12).length;
                  if (longSegs > 0) {
                    s -= Math.min(15, longSegs * 3);
                    notes.push(`⚠ C ${longSegs} cu thoại di hơn 12s (cần ngắt)`);
                  } else {
                    notes.push("✓ Mốc thi gian thoại tự nhin (<12s/cu)");
                  }
                  const finalScore = Math.max(0, s);
                  setReviewScore(finalScore);
                  setReviewNotes(notes);
                  showToast(`✅ Đ đnh gi kịch bản: ${finalScore}/100`);
                }}
              >
                ✨ Đnh gi lại kịch bản
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
                     Dừng
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                <span style={{ fontSize: 10, color: "var(--t3)" }}>Hoàn tác:</span>
                <span className="studio-filter-chip" onClick={handleUndoAudio} style={{ cursor: "pointer" }} title="Hoàn tác">↶ Audio</span>
                <span className="studio-filter-chip" onClick={handleUndoTranslation} style={{ cursor: "pointer" }} title="Hoàn tác">↶ Bản dịch</span>
                <span className="studio-filter-chip" onClick={handleUndoSubtitles} style={{ cursor: "pointer" }} title="Hoàn tác">↶ Phụ đề</span>
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
                title="Chế độ hiển thị phụ đ trn mn chiếu (Bản dịch / Gốc / Song ngữ)"
              >
                <option value="translated">Original (Bản dịch)</option>
                <option value="original">Nguyn bản (Gốc)</option>
                <option value="bilingual">Song ngữ (2 dng)</option>
              </select>
              <select
                className="studio-video-select-subtle"
                value={videoScale}
                onChange={(e) => setVideoScale(Number(e.target.value))}
                title="Thu phng kch thước khung xem video"
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
                  showToast("Thu nh khung xem video");
                }}
                title="Thu nh khung video (-10%)"
              >
                
              </button>
              <button
                type="button"
                className="studio-action-btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={() => {
                  setVideoScale((prev) => Math.min(100, prev + 10));
                  showToast("Phng to khung xem video");
                }}
                title="Phng to khung video (+10%)"
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
                      videoRef.current.requestFullscreen().catch(() => showToast("Chế độ ton mn hnh video"));
                    }
                  } else {
                    showToast("Toàn màn hình: Nhấn để xem toàn màn hình video");
                  }
                }}
                title="Xem ton mn hnh (Fullscreen)"
              >
                <IconMaximize size={12} />
              </button>
            </div>
          </div>

          {/* In-Tab AI Progress Center Banner */}
          {isAnalyzing && (
            <div className="studio-ai-progress-hud">
              <div className="studio-ai-hud-header">
                <div className="studio-ai-hud-pulse">
                  <span className="studio-ai-pulse-dot" />
                  <span className="studio-ai-hud-title">⚡ Đang Xử Lý Video & Diarization AI: {fileName || "Dự án"}</span>
                </div>
                <div className="studio-ai-hud-actions">
                  <span className="studio-ai-hud-pct">{analyzeProgress.toFixed(0)}%</span>
                  <button
                    type="button"
                    className="studio-btn-action-danger"
                    onClick={handleCancelAnalysis}
                    title="Dừng tiến trình phân tích"
                    style={{
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      color: "#f87171",
                      borderRadius: 4,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ✕ Dừng
                  </button>
                </div>
              </div>

              {/* Multi-step progress pipeline */}
              <div className="studio-ai-steps-row">
                <div className={`studio-ai-step-item ${analyzeProgress >= 15 ? "done" : analyzeProgress > 0 ? "active" : ""}`}>
                  <span className="studio-ai-step-num">1</span>
                  <span className="studio-ai-step-name">🎵 Audio WAV</span>
                </div>
                <div className="studio-ai-step-arrow">›</div>
                <div className={`studio-ai-step-item ${analyzeProgress >= 40 ? "done" : analyzeProgress >= 15 ? "active" : ""}`}>
                  <span className="studio-ai-step-num">2</span>
                  <span className="studio-ai-step-name">🎙️ Whisper STT</span>
                </div>
                <div className="studio-ai-step-arrow">›</div>
                <div className={`studio-ai-step-item ${analyzeProgress >= 60 ? "done" : analyzeProgress >= 40 ? "active" : ""}`}>
                  <span className="studio-ai-step-num">3</span>
                  <span className="studio-ai-step-name">👥 Phân Vai (Sherpa AI)</span>
                </div>
                <div className="studio-ai-step-arrow">›</div>
                <div className={`studio-ai-step-item ${analyzeProgress >= 95 ? "done" : analyzeProgress >= 60 ? "active" : ""}`}>
                  <span className="studio-ai-step-num">4</span>
                  <span className="studio-ai-step-name">✍️ Dịch Kịch Bản</span>
                </div>
                <div className="studio-ai-step-arrow">›</div>
                <div className={`studio-ai-step-item ${analyzeProgress >= 100 ? "done" : analyzeProgress >= 95 ? "active" : ""}`}>
                  <span className="studio-ai-step-num">5</span>
                  <span className="studio-ai-step-name">🎬 Timeline</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="studio-ai-progress-track">
                <div
                  className="studio-ai-progress-fill"
                  style={{ width: `${Math.max(3, Math.min(100, analyzeProgress))}%` }}
                />
              </div>

              {/* Live status message + Jump to Process Center button */}
              <div className="studio-ai-status-msg">
                <span>{analyzeMessage || "Đang xử lý luồng AI..."}</span>
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab("process")}
                    className="studio-ai-open-tab-btn"
                  >
                    Mở tab Tiến trình toàn cục ↗
                  </button>
                )}
              </div>
            </div>
          )}

          <div
            className={`studio-video-stage ${isDraggingFile ? "drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDraggingFile(false); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingFile(false); }}
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
                      // ROUND-4 R4-01: WebView2 khng giải m được codec gốc (VP9/AV1/HEVC/H.264 high).
                      // Tự chạy ffmpeg chuyển sang H.264 baseline + AAC rồi pht bản tạm.
                      // Nếu transcoding cũng fail → mới fallback Cinema Visualizer.
                      console.warn(
                        "Video element could not decode in WebView2, attempting ffmpeg transcode to H.264/AAC baseline…"
                      );
                      // R6-06: thm toast cho user (trước chỉ console.log, user khng biết đang lm g)
                      showToast("⏳ WebView2 khng giải m được codec  đang chuyển tạm sang H.264");
                      // R7-02: lưu currentTime + isPlaying TRƯỚC khi transcode để resume sau
                      const curV = videoRef.current;
                      const resumeTime = curV?.currentTime ?? 0;
                      const wasPlaying = curV ? !curV.paused : false;
                      try {
                        console.log("Đang chuyển tạm video sang H.264 để xem được trong Studio…");
                        const previewPath = await sublix.transcodeForPreview(filePath);
                        setTranscodedPath(previewPath);
                        // R7-02: đợi React remount video element rồi play() + seek về currentTime cũ
                        setTimeout(() => {
                          const v2 = videoRef.current;
                          if (!v2) return;
                          if (resumeTime > 0 && Number.isFinite(resumeTime)) {
                            try {
                              v2.currentTime = Math.max(0, Math.min(resumeTime, (v2.duration || resumeTime) - 0.1));
                            } catch (e) {
                              // ignore
                            }
                          }
                          if (wasPlaying) {
                            v2.play().catch((e) => console.warn("R7-02: play() failed:", e));
                          }
                        }, 250);
                        // R7-03: sửa toast ni qu  khng hứa "Đang phát"
                        showToast("✅ Đ chuyển sang dạng xem được");
                        return;
                      } catch (transcodeErr) {
                        const errMsg = (transcodeErr as Error)?.message ?? String(transcodeErr);
                        console.error("ffmpeg transcode failed, falling back:", transcodeErr);
                        console.error(`Khng thể chuyển tạm video: ${errMsg}`);
                        // R6-06: bo lỗi cho user thay v im lặng
                        showToast(`❌ Khng thể chuyển tạm video: ${errMsg}`);
                      }
                    }
                    console.warn("Falling back to Cinema Visualizer.");
                    setVideoPlayError(true);
                    // R6-06: bo cho user biết app chuyển sang Cinema Visualizer (an ton nhất)
                    showToast("⚠ Không phát được video — chuyển sang Cinema Visualizer.");
                  }}
                  style={{
                    display: videoPlayError ? "none" : "block",
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : null}

              {/* 1. DROPZONE KHI CHƯA CÓ VIDEO HOẶC KÉO THẢ TỆP (Chuẩn ảnh minh ha EZMAXSUB) */}
              {!filePath && (
                <div
                  className="studio-dropzone-center-box"
                  onClick={handlePickMediaFile}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingFile(true); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingFile(false); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingFile(false); }}
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

              {/* 2. THÔNG BO LỖI THẬT KHI VIDEO GẶP SỰ C ĐỊNH DẠNG */}
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
                  <div style={{ fontSize: 32 }}>⚠</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171" }}>
                    Khng thể pht tệp video ny trực tiếp trong trnh xem
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t3)", maxWidth: 440 }}>
                    Tệp c thể bị hng, đưng dẫn khng tồn tại hoặc sử dụng codec khng được hỗ trợ bởi WebView2.
                  </div>
                  <button
                    type="button"
                    className="studio-btn primary"
                    onClick={handlePickMediaFile}
                    style={{ marginTop: 8 }}
                  >
                    Chn video khc (Ctrl+I)
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
                    {speakers.find((s) => s.id === activeSubtitle.speakerId)?.name || "Chưa phn vai"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* P4: DANH SCH CÂU (CỘT PHẢI) */}
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
                        title="Li mốc bắt đầu 0.1s"
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
                        title="Tiến mốc kết thc 0.1s"
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
                      title="Chuyển vai diễn cho cu thoại ny"
                    >
                      {speakers.map((s) => (
                        <option key={s.id} value={s.id}>
                           {s.name}
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
                      title="Nghe thử giọng đọc câu thoại này (Kokoro TTS)"
                    >
                      <IconVolume2 size={11} />
                      {previewingSegId === seg.id ? "Đang tạo..." : "Nghe cu"}
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
                        title="Tch cu tại playhead"
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
              <span>🔤 Kiểu Dng Phụ Đ Mn Chiếu</span>
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
              <span>Mu chữ:</span>
              <div className="studio-prop-swatches">
                {[
                  { name: "Vng", color: "#e8a33d" },
                  { name: "Trắng", color: "#ffffff" },
                  { name: "Xanh", color: "#38bdf8" },
                  { name: "Xanh l", color: "#4ade80" },
                  { name: "Đ", color: "#f87171" },
                ].map((c) => (
                  <div
                    key={c.color}
                    className={`studio-prop-swatch ${subFontColor === c.color ? "active" : ""}`}
                    style={{ background: c.color }}
                    onClick={() => {
                      setSubFontColor(c.color);
                      showToast(`Đ chn mu phụ đ: ${c.name}`);
                    }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="studio-prop-row">
              <span>Vị tr:</span>
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { id: "bottom", label: "Dưới đy" },
                  { id: "center", label: "Ở giữa" },
                  { id: "top", label: "Trn đỉnh" },
                ].map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    className={`studio-filter-chip ${subPosition === pos.id ? "active" : ""}`}
                    onClick={() => {
                      setSubPosition(pos.id as any);
                      showToast(`Vị tr phụ đ: ${pos.label}`);
                    }}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="studio-prop-row">
              <span>Đổ bng tương phản:</span>
              <label className="studio-switch">
                <input
                  type="checkbox"
                  checked={subShowShadow}
                  onChange={(e) => {
                    setSubShowShadow(e.target.checked);
                    showToast(e.target.checked ? "Đ bật bng chữ" : "Đ tắt bng chữ");
                  }}
                />
                <span className="studio-slider" />
              </label>
            </div>
          </div>

          <div className="studio-prop-card">
            <div className="studio-prop-title">
              <span>📹 Thng Tin & Thuộc Tnh Video</span>
            </div>
            <div className="studio-prop-row">
              <span>Tệp đang mở:</span>
              <span style={{ color: "var(--t1)", fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fileName}
              </span>
            </div>
            <div className="studio-prop-row">
              <span>Thi lượng:</span>
              <span style={{ color: "var(--ac)", fontWeight: 700 }}>
                {formatTimecode(mediaDuration)} ({mediaDuration.toFixed(1)}s)
              </span>
            </div>
            <div className="studio-prop-row">
              <span>Số cu thoại:</span>
              <span>{segments.length} cu</span>
            </div>
            <div className="studio-prop-row">
              <span>Số nhn vật:</span>
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
              title="Gin kn timeline — phủ ton bộ chiu di video (Fit)"
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
                showToast(next ? "🧲 Đ BẬT Tự động bắt dnh Playhead vo mp cu thoại" : "Đ TẮT Bắt dnh");
              }}
              title="Tự động bắt dnh — căn vo playhead v mp gần nhất (N)"
            >
              <IconMagnet size={13} />
            </button>
            <button
              type="button"
              className={`studio-timeline-tool-btn ${linkTracks ? "active" : ""}`}
              onClick={() => {
                const next = !linkTracks;
                setLinkTracks(next);
                showToast(next ? "🔗 Đ BẬT Lin kết đồng bộ clip & phụ đ" : "Đ TẮT Lin kết rnh");
              }}
              title="Lin kết — di chuyển hoặc xa nội dung đi km clip trn rnh chnh (P)"
            >
              <IconLink size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              title="Đnh dấu mốc thi gian (Bookmark)"
              onClick={() => {
                setBookmarks((prev) => [...prev, currentTime]);
                showToast(`🔖 Đ ghim Bookmark tại mốc ${formatTimecode(currentTime)}`);
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
              title="V đầu (Home)"
            >
              
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(currentTime - 1)}
              title="Li 1 giy"
            >
              ◀
            </button>
            <button
              type="button"
              className="studio-btn-transport-play"
              onClick={handleTogglePlay}
              title="Pht / Dừng (Phm Cch)"
            >
              {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(currentTime + 1)}
              title="Tiến 1 giy"
            >
              ▶
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(mediaDuration)}
              title="Đến cuối (End)"
            >
              
            </button>

            <div className="studio-timeline-timecode">
              <span>{formatTimecode(currentTime)}</span>
              <span className="studio-timeline-timecode-total">/ {formatTimecode(mediaDuration)}</span>
            </div>
          </div>

          <div
            className={`studio-timeline-batch-toggle ${batchMode ? "active" : ""}`}
            onClick={() => setBatchMode(!batchMode)}
            title="Batch Mode: Tự động chạy hng loạt cho nhiu tập phim"
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
                showToast(`⚡ Tốc độ pht video: ${nextSpeed}x`);
              }}
              title="Nhấn để đổi tốc độ pht (0.5x, 1.0x, 1.25x, 1.5x, 2.0x)"
              style={{ fontSize: 11, padding: "2px 6px", cursor: "pointer" }}
            >
              Tốc độ: {playbackSpeed}x
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.max(100, Math.round(z / 2)))}
              title="Zoom out mạnh (×0.5) — xem toàn cảnh video. Phím tắt: −"
              style={{ fontSize: 12, fontWeight: 700, padding: "0 6px", cursor: "pointer" }}
            >
              −−
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.max(100, Math.round(z / 1.5)))}
              title="Zoom out nhẹ (×0.67). Phím tắt: −"
              style={{ fontSize: 16, fontWeight: 700, padding: "0 8px", cursor: "pointer" }}
            >
              −
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel(100)}
              title="Reset về 100% = full video fit viewport. Phím tắt: \\"
              style={{ fontSize: 11, padding: "0 5px", cursor: "pointer" }}
            >
              ⟲
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.min(10000, Math.round(z * 1.5)))}
              title="Zoom in nhẹ (×1.5). Phím tắt: +"
              style={{ fontSize: 16, fontWeight: 700, padding: "0 8px", cursor: "pointer" }}
            >
              +
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.min(10000, Math.round(z * 2)))}
              title="Zoom in mạnh (×2) — frame cực lớn, tick 0.1s. Phím tắt: +"
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
              title="Zoom hiện tại (% viewport — 100% = full video fit)"
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
                <span></span>
                <span>▼ VIDEO</span>
              </div>
            </div>
            <div className="studio-track-header-item">
              <div className="studio-track-header-left">
                <span></span>
                <span>♫ TIẾNG GỐC</span>
              </div>
            </div>
            <div className="studio-track-header-item">
              <div className="studio-track-header-left">
                <span></span>
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
                  <span> {spk.name}</span>
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
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingFile(false); }}
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
                title="Ko thả đầu kim để tua / chạy video qua timeline (Scrubbing)"
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
              title="Bấm giữ v ko r để chạy video theo mốc thi gian"
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
                        title={`Khung hnh mốc ${formatTimecode(thumb.time_sec)}`}
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
                  <div
                    style={{
                      position: "absolute",
                      left: 40,
                      width: `${timelineWidth}px`,
                      height: "32px",
                      background: "linear-gradient(90deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))",
                      border: "1px solid rgba(56, 189, 248, 0.25)",
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 12px",
                      gap: 8,
                      overflow: "hidden",
                    }}
                  >
                    <span style={{ fontSize: 13 }}>🎞️</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#f1f5f9" }}>{fileName || "Video"}</span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>({formatTimecode(mediaDuration)})</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, color: isPreviewExtracting ? "#38bdf8" : "#64748b", fontStyle: "italic" }}>
                      {isPreviewExtracting ? "⚡ Đang tạo sóng âm & khung hình..." : "Sẵn sàng phân tích"}
                    </span>
                  </div>
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
                width={Math.min(timelineWidth, 8192)}
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
                      title="Thu nh/Ko di đầu cu (-0.2s)"
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
                      title="Thu nh/Ko di cuối cu (+0.2s)"
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
                          title="Thu nh/Ko di đầu cu (-0.2s)"
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
                          title="Thu nh/Ko di cuối cu (+0.2s)"
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
              <span>{exportDonePath ? "Xuất Video Hon Tất!" : "Đang Xuất Video Lồng Tiếng..."}</span>
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
                   Mở Thư Mục Thnh Phẩm
                </button>
                <button
                  type="button"
                  className="studio-btn-subtle"
                  onClick={() => setIsExporting(false)}
                >
                  Đng
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
