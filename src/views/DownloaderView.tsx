//! Sublix Multi-Platform Video Downloader View
//! Reuses proven extractor flags, platform recognition & queue mechanics from hermes-downloader.
//! Features 1-click pipeline bridges into File Subtitle Studio and AI Dubbing Studio.

import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  sublix,
  type VideoInfo,
  type DownloadRequest,
  type DownloadProgressPayload,
  type DownloadMetaPayload,
} from "../lib/tauri";
import { CustomSelect, type SelectOption } from "./CustomSelect";
import {
  IconDownload,
  IconFolder,
  IconFilm,
  IconClapper,
  IconPause,
  IconPlay,
  IconTrash,
  IconRotateCw,
  IconGlobe,
} from "../icons";
import "./DownloaderView.css";

interface DownloaderViewProps {
  onNavigateToFileSub: (filePath: string) => void;
  onNavigateToDubbing: (filePath: string) => void;
}

// v0.9.6: friendly quality label for a "WIDTHxHEIGHT" resolution string.
function resolutionLabel(res?: string | null): string | null {
  if (!res) return null;
  const m = /^(\d+)x(\d+)$/.exec(res.trim());
  if (!m) return res;
  const h = parseInt(m[2], 10);
  const name =
    h >= 2160 ? "4K" : h >= 1440 ? "2K" : h >= 1080 ? "Full HD" : h >= 720 ? "HD" : h >= 480 ? "SD" : `${h}p`;
  return `${m[1]}×${m[2]} (${name})`;
}

interface DownloadItem {
  id: string;
  url: string;
  title: string;
  thumbnail?: string | null;
  platform: string;
  format: string;
  browserCookies?: string | null;
  extractSubtitles: boolean;
  status: "queued" | "downloading" | "paused" | "completed" | "error" | "cancelled";
  percent: number;
  speed: string;
  eta: string;
  sizeText: string;
  filename: string;
  filePath?: string | null;
  error?: string | null;
  // v0.9.6: video resolution like "1920x1080" (filled at completion).
  resolution?: string | null;
  createdAt: number;
}

const FORMAT_OPTIONS: SelectOption[] = [
  { value: "max", label: "⭐ MAX — Tự động chọn chất lượng cao nhất", badge: "Khuyên Dùng" },
  { value: "4k", label: "📺 4K (2160p) — Ultra HD" },
  { value: "1440p", label: "📺 2K (1440p) — QHD" },
  { value: "1080p", label: "📹 Full HD (1080p) — Chuẩn nét cao" },
  { value: "720p", label: "📹 HD (720p) — Phổ thông" },
  { value: "480p", label: "📱 SD (480p) — Nhẹ & Nhanh" },
  { value: "360p", label: "📱 360p — Tiết kiệm dung lượng" },
  { value: "audio-mp3", label: "🎵 Audio MP3 (320kbps) — Tách riêng âm thanh" },
  { value: "audio-m4a", label: "🎵 Audio M4A (AAC Gốc) — Chất lượng gốc" },
];

const BROWSER_COOKIE_OPTIONS: SelectOption[] = [
  { value: "none", label: "Không dùng cookies (Mặc định — Khuyến dùng)" },
  { value: "edge", label: "Microsoft Edge (thử nghiệm — hay bị chặn, app tự tải không cookie)" },
  { value: "chrome", label: "Google Chrome (thử nghiệm — hay bị chặn, app tự tải không cookie)" },
  { value: "firefox", label: "Mozilla Firefox (thử nghiệm — hay bị chặn)" },
];

const PLATFORM_META: Record<string, { label: string; icon: string; color: string }> = {
  youtube: { label: "YouTube", icon: "▶️", color: "#ef4444" },
  tiktok: { label: "TikTok", icon: "🎵", color: "#00f2fe" },
  douyin: { label: "Douyin (抖音)", icon: "🇨🇳", color: "#fe2c55" },
  bilibili: { label: "Bilibili (B站)", icon: "📺", color: "#00a1d6" },
  facebook: { label: "Facebook", icon: "🔵", color: "#1877f2" },
  twitter: { label: "X / Twitter", icon: "🐦", color: "#1d9bf0" },
  instagram: { label: "Instagram", icon: "📷", color: "#e1306c" },
  vimeo: { label: "Vimeo", icon: "🎬", color: "#1ab7ea" },
  soundcloud: { label: "SoundCloud", icon: "☁️", color: "#ff5500" },
  reddit: { label: "Reddit", icon: "🤖", color: "#ff4500" },
  twitch: { label: "Twitch", icon: "🎮", color: "#9146ff" },
  generic_video: { label: "Web Video", icon: "🌐", color: "#64748b" },
};

function detectPlatform(url: string): string {
  const u = url.trim().toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("douyin.com")) return "douyin";
  if (u.includes("bilibili.com")) return "bilibili";
  if (u.includes("facebook.com") || u.includes("fb.watch") || u.includes("fb.com")) return "facebook";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("vimeo.com")) return "vimeo";
  if (u.includes("soundcloud.com")) return "soundcloud";
  if (u.includes("reddit.com")) return "reddit";
  if (u.includes("twitch.tv")) return "twitch";
  return "generic_video";
}

function isValidHttpUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString.trim());
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname && parsed.hostname.includes("."))
    );
  } catch {
    return false;
  }
}

function formatDuration(sec?: number | null): string {
  if (!sec || isNaN(sec)) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STORAGE_KEY = "sublix_downloads_history_v1";

// BUG-058: a stringified Tauri Error object renders as "[object Object]" in
// the UI. This helper unwraps the actual message whether the caller passed
// a string, an Error, a plain object with `.message`, or anything else.
function formatError(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message || fallback;
  if (e && typeof e === "object") {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
    try {
      return JSON.stringify(e);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export default function DownloaderView({
  onNavigateToFileSub,
  onNavigateToDubbing,
}: DownloaderViewProps) {
  const [url, setUrl] = useState<string>("");
  const [format, setFormat] = useState<string>("max");
  const [browserCookie, setBrowserCookie] = useState<string>("none");
  // v0.9.4: default OFF — the owner only needs the video; subtitle fetching
  // is optional and YouTube can rate-limit it (429).
  const [extractSubtitles, setExtractSubtitles] = useState<boolean>(false);
  // v0.9.4: where downloads are stored on disk (shown in the header).
  const [dlDir, setDlDir] = useState<string>("");

  // Inspection state
  const [inspecting, setInspecting] = useState<boolean>(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  // R3-04 (1): React state to track broken thumbnail without direct DOM manipulation
  const [thumbFailed, setThumbFailed] = useState<boolean>(false);

  // Downloads state
  // BUG-050: any item that was mid-flight when the app died is now a
  // zombie. Flip "downloading" / "queued" to "error" with a retry button
  // rather than leaving a stuck "Đang tải" card forever.
  const [items, setItems] = useState<DownloadItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: DownloadItem[] = JSON.parse(saved);
        return parsed.map((item) => {
          if (item.status === "downloading" || item.status === "queued") {
            return {
              ...item,
              status: "error",
              percent: Number.isFinite(item.percent) ? item.percent : 0,
              error: "Bị gián đoạn do tắt ứng dụng. Bấm Thử lại để tiếp tục.",
            };
          }
          // BUG-049: scrub NaN/null out of persisted state — toFixed(NaN)
          // and friends have crashed the tab before.
          return {
            ...item,
            percent: Number.isFinite(item.percent)
              ? Math.min(100, Math.max(0, item.percent))
              : 0,
          };
        });
      }
    } catch (e) {
      console.warn("Failed to load downloads history:", e);
    }
    return [];
  });

  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "completed">("all");
  // BUG-053: lock the Start button while a click is in flight so a frantic
  // double-click doesn't spawn two parallel yt-dlp processes.
  const [starting, setStarting] = useState<boolean>(false);
  // R2-09.7 & R3-04 (2): cache of file-exists check for completed items.
  // Using fileExistsMapRef to avoid re-triggering useEffect loops.
  const [fileExistsMap, setFileExistsMap] = useState<Record<string, boolean>>({});
  const fileExistsMapRef = useRef<Record<string, boolean>>({});
  fileExistsMapRef.current = fileExistsMap;
  // v0.9.6: one-shot guard for the lazy size/resolution backfill probe.
  const metaProbedRef = useRef<Record<string, boolean>>({});

  // Save history on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn("Failed to save downloads history:", e);
    }
  }, [items]);

  // R2-09.7 & R3-04 (2): when an item becomes completed with a file path, probe disk.
  // We do not cache false permanently on transient IPC errors, and avoid fileExistsMap in deps.
  useEffect(() => {
    items.forEach((item) => {
      if (
        item.status === "completed" &&
        item.filePath &&
        fileExistsMapRef.current[item.id] === undefined
      ) {
        sublix.downloaderFileExists(item.filePath).then((exists) => {
          setFileExistsMap((prev) => ({ ...prev, [item.id]: exists }));
        }).catch((err) => {
          // Do not cache false permanently on transient IPC errors
          console.warn("downloaderFileExists IPC error:", err);
        });
      }
    });
  }, [items]);

  // v0.9.6: lazily backfill size + resolution for completed items that
  // don't have them yet (items finished before this feature existed).
  // One probe per item per session.
  useEffect(() => {
    items.forEach((item) => {
      if (
        item.status === "completed" &&
        item.filePath &&
        !item.resolution &&
        !metaProbedRef.current[item.id]
      ) {
        metaProbedRef.current[item.id] = true;
        sublix
          .downloaderFileMeta(item.filePath)
          .then((meta) => {
            if (!meta) return;
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      sizeText: meta.size_text || i.sizeText,
                      resolution: meta.resolution ?? i.resolution,
                    }
                  : i
              )
            );
          })
          .catch((err) => console.warn("downloaderFileMeta IPC error:", err));
      }
    });
  }, [items]);

  // v0.9.4: show where downloads are stored on disk.
  useEffect(() => {
    sublix
      .downloaderDownloadsDir()
      .then(setDlDir)
      .catch((err) => console.warn("downloaderDownloadsDir IPC error:", err));
  }, []);

  // Listen to progress events from backend
  useEffect(() => {
    const pProgress = listen<DownloadProgressPayload>("downloader:progress", (event) => {
      const p = event.payload;
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== p.id) return item;
          // BUG-049: clamp percent to [0, 100] and fall back to previous
          // value on NaN — prevents the downloader tab from crashing when
          // yt-dlp doesn't know the total size yet (it sends percent = NaN
          // for live/dash with unknown duration).
          const safePct = Number.isFinite(p.percent)
            ? Math.min(100, Math.max(0, p.percent))
            : item.percent;

          // R3-04 (4): validate status strictly without `as any`
          const VALID_STATUSES: DownloadItem["status"][] = [
            "queued",
            "downloading",
            "paused",
            "completed",
            "error",
            "cancelled",
          ];
          const validatedStatus: DownloadItem["status"] = VALID_STATUSES.includes(
            p.status as DownloadItem["status"]
          )
            ? (p.status as DownloadItem["status"])
            : "error";

          return {
            ...item,
            status: validatedStatus,
            percent: safePct,
            speed: p.speed || item.speed,
            eta: p.eta || item.eta,
            sizeText: p.size_text || item.sizeText,
            filename: p.filename || item.filename,
            filePath: p.file_path || item.filePath,
            error: p.error !== undefined ? p.error : item.error,
          };
        })
      );
    });

    const pMeta = listen<DownloadMetaPayload>("downloader:meta", (event) => {
      const p = event.payload;
      setItems((prev) =>
        prev.map((item) =>
          item.id === p.id
            ? {
                ...item,
                sizeText: p.size_text || item.sizeText,
                resolution: p.resolution ?? item.resolution,
              }
            : item
        )
      );
    });

    return () => {
      pProgress.then((u) => u()).catch(() => {});
      pMeta.then((u) => u()).catch(() => {});
    };
  }, []);

  const currentPlatform = detectPlatform(url);
  const currentPlatformMeta = PLATFORM_META[currentPlatform] || PLATFORM_META.generic_video;

  // Inspect video URL
  const handleInspect = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl || url).trim();
    if (!targetUrl) return;

    // R3-04 (5): validate target URL via new URL()
    if (!isValidHttpUrl(targetUrl)) {
      setInspectError(
        `Link không hợp lệ: phải là URL http(s):// hợp lệ (hiện tại: "${targetUrl.slice(0, 40)}")`
      );
      return;
    }

    setInspecting(true);
    setInspectError(null);
    setThumbFailed(false);
    try {
      const info = await sublix.downloaderGetInfo(targetUrl);
      setVideoInfo(info);
      setThumbFailed(false);
    } catch (e: any) {
      setInspectError(formatError(e, "Không thể lấy thông tin video"));
    } finally {
      setInspecting(false);
    }
  };

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
        setUrl(text);
        handleInspect(text);
      }
    } catch (e) {
      console.warn("Clipboard access denied or empty", e);
    }
  };

  // Start download
  const handleStartDownload = async () => {
    // BUG-053: lock immediately on entry — synchronous setState — so the
    // button can't fire twice even when the caller hammers it. Re-check
    // here too because the disabled prop only flips after React commits.
    if (starting) return;
    setStarting(true);
    // R2-02: wrap the whole body in try/finally so EVERY early return path
    // (empty URL, duplicate, disk-full, network error, etc.) resets the
    // button. Without this, a disk-full rejection left the button stuck on
    // "Đang khởi động..." forever.
    try {
      const targetUrl = url.trim();
      if (!targetUrl) return;

      // R2-09.8 & R3-04 (5): reject obviously-invalid URLs at the UI layer BEFORE
      // hitting the backend using robust new URL() validation.
      if (!isValidHttpUrl(targetUrl)) {
        setInspectError(
          `Link không hợp lệ: phải là URL http(s):// hợp lệ (hiện tại: "${targetUrl.slice(0, 40)}")`
        );
        return;
      }

      // BUG-053 (extended): don't queue the same URL twice while it's still
      // running. Pasting a link and double-clicking should not create two
      // parallel jobs.
      const dup = items.find(
        (i) => i.url === targetUrl &&
          (i.status === "downloading" || i.status === "paused" || i.status === "queued")
      );
      if (dup) {
        setInspectError(`URL này đang được tải (mục "${dup.title}"). Bấm Thử lại trên mục đó nếu muốn tiếp tục.`);
        return;
      }

      // BUG-051: refuse to start if the destination volume cannot hold the
      // estimated file size plus a 1 GB safety margin. Without this check,
      // a 4K download on an almost-full disk dies partway through with a
      // cryptic ffmpeg/io error.
      if (videoInfo?.filesize_approx) {
        try {
          const free = await sublix.downloaderCheckDisk();
          const required = videoInfo.filesize_approx;
          const SAFETY_MARGIN = 1024 * 1024 * 1024; // 1 GB
          if (free < required + SAFETY_MARGIN) {
            const freeGB = (free / 1024 / 1024 / 1024).toFixed(1);
            const needGB = (required / 1024 / 1024 / 1024).toFixed(1);
            setInspectError(
              `Ổ đĩa không đủ dung lượng trống (cần ${needGB} GB + 1 GB dự phòng, còn ${freeGB} GB).`
            );
            return;
          }
        } catch (e) {
          // If we can't check disk, don't block — let the user try and surface
          // the failure naturally if it really is too small.
          console.warn("disk check failed:", e);
        }
      }

      const id = "dl_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const title = videoInfo?.title || "Video " + (currentPlatformMeta.label || "Download");
      const newItem: DownloadItem = {
        id,
        url: targetUrl,
        title,
        thumbnail: videoInfo?.thumbnail,
        platform: currentPlatform,
        format,
        browserCookies: browserCookie !== "none" ? browserCookie : null,
        extractSubtitles,
        status: "downloading",
        percent: 0,
        speed: "0 B/s",
        eta: "--:--",
        sizeText: "",
        filename: title,
        filePath: null,
        error: null,
        createdAt: Date.now(),
      };

      setItems((prev) => [newItem, ...prev]);

      const req: DownloadRequest = {
        id,
        url: targetUrl,
        format,
        browser_cookies: browserCookie !== "none" ? browserCookie : undefined,
        extract_subtitles: extractSubtitles,
        subtitle_langs: ["vi", "en", "ja", "zh"],
      };

      try {
        await sublix.downloaderStart(req);
      } catch (e: any) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, status: "error", error: formatError(e, "Lỗi tải video") }
              : item
          )
        );
      }
    } finally {
      setStarting(false);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await sublix.downloaderPause(id);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: "paused" } : item))
      );
    } catch (e) {
      // R2-08.4: surface the backend error to the user instead of swallowing.
      // Backend returns Err("Không tìm thấy việc này...") for unknown id.
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, error: formatError(e, "Tạm dừng tải thất bại") }
            : item
        )
      );
    }
  };

  const handleResume = async (item: DownloadItem) => {
    const req: DownloadRequest = {
      id: item.id,
      url: item.url,
      format: item.format,
      browser_cookies: item.browserCookies || undefined,
      extract_subtitles: item.extractSubtitles,
      subtitle_langs: ["vi", "en", "ja", "zh"],
    };

    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, status: "downloading", error: null } : i
      )
    );

    try {
      await sublix.downloaderStart(req);
    } catch (e: any) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: "error", error: formatError(e, "Lỗi khi tiếp tục tải") }
            : i
        )
      );
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await sublix.downloaderCancel(id);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: "cancelled" } : item))
      );
    } catch (e) {
      // R2-08.4: surface the backend error to the user instead of swallowing.
      // Backend returns Err("Không tìm thấy việc này...") for unknown id.
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, error: formatError(e, "Hủy tải thất bại") }
            : item
        )
      );
    }
  };

  const handleRemove = async (id: string) => {
    // BUG-052: deleting an item that's still running leaves yt-dlp alive
    // in the background. Cancel first, swallow the (possibly already-dead)
    // error, then drop the row from the UI.
    const target = items.find((i) => i.id === id);
    if (target && (target.status === "downloading" || target.status === "paused" || target.status === "queued")) {
      try {
        await sublix.downloaderCancel(id);
      } catch (e) {
        // ignore — job may already be dead
      }
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
    setFileExistsMap((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleClearHistory = () => {
    // R2-09.6: tooltip says "Xóa các mục đã tải xong" — only drop items that
    // are actually `completed`.
    const completedIds = new Set(
      items.filter((item) => item.status === "completed").map((item) => item.id)
    );
    setItems((prev) => prev.filter((item) => item.status !== "completed"));
    setFileExistsMap((prev) => {
      const copy = { ...prev };
      for (const id of completedIds) {
        delete copy[id];
      }
      return copy;
    });
  };

  const handleReveal = async (path?: string | null) => {
    if (!path) {
      await sublix.downloaderOpenFolder();
      return;
    }
    try {
      await sublix.downloaderRevealFile(path);
    } catch (e) {
      await sublix.downloaderOpenFolder();
    }
  };

  // v0.9.4: play the downloaded file with the default media player. If the
  // file is missing, fall back to revealing the folder instead of failing
  // silently.
  const handlePlay = async (path?: string | null) => {
    if (!path) return;
    try {
      await sublix.downloaderOpenFile(path);
    } catch (e) {
      console.warn("downloaderOpenFile failed:", e);
      await handleReveal(path);
    }
  };

  // v0.9.6: brief "copied" feedback per item for the source-link button.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopyLink = async (item: DownloadItem) => {
    const text = item.url || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for webviews where the async clipboard API is blocked.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // Last resort — nothing else we can do.
      }
      document.body.removeChild(ta);
    }
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 2000);
  };

  const filteredItems = items.filter((item) => {
    if (activeFilter === "active") {
      return item.status === "downloading" || item.status === "paused" || item.status === "queued";
    }
    if (activeFilter === "completed") {
      return item.status === "completed";
    }
    return true;
  });

  const activeCount = items.filter(
    (i) => i.status === "downloading" || i.status === "paused" || i.status === "queued"
  ).length;

  return (
    <div className="downloader-view">
      {/* HEADER SECTION */}
      <div className="downloader-header">
        <div className="downloader-title-row">
          <div className="downloader-title-group">
            <h2 className="downloader-title">
              <IconGlobe size={20} /> Tải Video Đa Nền Tảng (Multi-Platform Downloader)
            </h2>
            <p className="downloader-subtitle">
              Tải chất lượng cao từ YouTube, TikTok, Douyin (抖音), Bilibili (哔哩哔哩), Facebook, X, Instagram... và đưa thẳng vào Studio lồng tiếng hoặc làm phụ đề chỉ với 1 cú click.
            </p>
            {dlDir && (
              <p
                style={{ margin: "4px 0 0", fontSize: "0.75rem", opacity: 0.8, wordBreak: "break-word" }}
                title={dlDir}
              >
                📁 File tải về được lưu tại:{" "}
                <code style={{ fontFamily: "Consolas, monospace" }}>{dlDir}</code>
              </p>
            )}
          </div>
          <button
            type="button"
            className="downloader-btn-secondary"
            onClick={() => sublix.downloaderOpenFolder()}
            title="Mở thư mục lưu trữ file tải về trên máy tính"
          >
            <IconFolder size={14} /> Mở Thư Mục Download
          </button>
        </div>
      </div>

      {/* INPUT CARD */}
      <div className="downloader-card input-card">
        <div className="downloader-url-group">
          <div className="downloader-input-wrapper">
            <span className="platform-tag" style={{ color: currentPlatformMeta.color }}>
              <span>{currentPlatformMeta.icon}</span>
              <span>{currentPlatformMeta.label}</span>
            </span>
            <input
              type="text"
              className="downloader-url-input"
              placeholder="Dán đường dẫn video (https://www.youtube.com/watch?v=..., TikTok, Douyin, Facebook...)"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setVideoInfo(null);
                setInspectError(null);
                setThumbFailed(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleInspect();
                }
              }}
            />
            {url.trim().length > 0 ? (
              <button
                type="button"
                className="downloader-clear-btn"
                onClick={() => {
                  setUrl("");
                  setVideoInfo(null);
                  setInspectError(null);
                  setThumbFailed(false);
                }}
                title="Xóa URL"
              >
                ✕
              </button>
            ) : (
              <button
                type="button"
                className="downloader-paste-btn"
                onClick={handlePaste}
                title="Dán từ Clipboard"
              >
                📋 Dán Link
              </button>
            )}
          </div>

          <button
            type="button"
            className="downloader-btn-inspect"
            onClick={() => handleInspect()}
            disabled={inspecting || !url.trim()}
          >
            {inspecting ? "⏳ Đang đọc..." : "🔍 Kiểm Tra Link"}
          </button>
        </div>

        {inspectError && (
          <div className="downloader-alert-error">
            ⚠️ {inspectError}
          </div>
        )}

        {/* METADATA INSPECTED CARD */}
        {videoInfo && (
          <div className="video-info-preview">
            {videoInfo.thumbnail && !thumbFailed ? (
              <div className="video-thumb-container" key={videoInfo.thumbnail}>
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="video-thumb-img"
                  onError={() => {
                    // R3-04 (1): React state to hide container instead of DOM manipulation
                    setThumbFailed(true);
                  }}
                />
                {videoInfo.duration && (
                  <span className="video-duration-badge">
                    {formatDuration(videoInfo.duration)}
                  </span>
                )}
              </div>
            ) : null}
            <div className="video-info-meta">
              <h4 className="video-info-title">{videoInfo.title}</h4>
              <div className="video-info-sub">
                {videoInfo.uploader && (
                  <span className="video-info-author">👤 {videoInfo.uploader}</span>
                )}
                <span
                  className="platform-pill"
                  style={{ borderColor: currentPlatformMeta.color, color: currentPlatformMeta.color }}
                >
                  {currentPlatformMeta.icon} {currentPlatformMeta.label}
                </span>
                {videoInfo.duration && (
                  <span className="video-duration-text">
                    ⏱️ Thời lượng: {formatDuration(videoInfo.duration)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* OPTIONS GRID */}
        <div className="downloader-options-grid">
          <div className="downloader-option-item">
            <label className="option-label">Chất lượng tải về:</label>
            <CustomSelect
              value={format}
              options={FORMAT_OPTIONS}
              onChange={setFormat}
            />
          </div>

          <div className="downloader-option-item">
            <label className="option-label">
              Trình duyệt lấy Cookies:
              <span className="option-hint">(Giúp vượt giới hạn tuổi, Douyin HD)</span>
            </label>
            <CustomSelect
              value={browserCookie}
              options={BROWSER_COOKIE_OPTIONS}
              onChange={setBrowserCookie}
            />
          </div>

          <div className="downloader-option-item checkbox-item">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={extractSubtitles}
                onChange={(e) => setExtractSubtitles(e.target.checked)}
              />
              <span>💬 Tự động trích xuất phụ đề (.srt) nếu có (vi, en, ja, zh)</span>
            </label>
          </div>
        </div>

        {/* ACTION ROW */}
        <div className="downloader-submit-row">
          <button
            type="button"
            className="downloader-btn-start"
            onClick={handleStartDownload}
            disabled={starting || !url.trim()}
          >
            {starting ? (
              <>
                <span className="downloader-spinner" /> Đang khởi động...
              </>
            ) : (
              <>
                <IconDownload size={16} /> Bắt Đầu Tải Video Ngay
              </>
            )}
          </button>
        </div>
      </div>

      {/* DOWNLOADS LIST SECTION */}
      <div className="downloader-list-section">
        <div className="downloader-list-header">
          <div className="downloader-tabs">
            <button
              type="button"
              className={`downloader-tab ${activeFilter === "all" ? "active" : ""}`}
              onClick={() => setActiveFilter("all")}
            >
              Tất Cả ({items.length})
            </button>
            <button
              type="button"
              className={`downloader-tab ${activeFilter === "active" ? "active" : ""}`}
              onClick={() => setActiveFilter("active")}
            >
              Đang Tải ({activeCount})
            </button>
            <button
              type="button"
              className={`downloader-tab ${activeFilter === "completed" ? "active" : ""}`}
              onClick={() => setActiveFilter("completed")}
            >
              Hoàn Thành ({items.filter((i) => i.status === "completed").length})
            </button>
          </div>

          {items.some((i) => i.status === "completed") && (
            <button
              type="button"
              className="downloader-btn-clean"
              onClick={handleClearHistory}
              title="Xóa các mục đã tải xong khỏi danh sách"
            >
              <IconTrash size={13} /> Dọn Lịch Sử
            </button>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <div className="downloader-empty">
            <div className="empty-icon">📥</div>
            <h3>Chưa có video nào trong danh sách</h3>
            <p>
              Dán URL từ YouTube, TikTok, Facebook, Douyin hoặc Bilibili vào ô phía trên rồi bấm{" "}
              <strong>Bắt Đầu Tải Video Ngay</strong>.
            </p>
          </div>
        ) : (
          <div className="downloader-items-grid">
            {filteredItems.map((item) => {
              const meta = PLATFORM_META[item.platform] || PLATFORM_META.generic_video;
              return (
                <div key={item.id} className={`downloader-card item-card status-${item.status}`}>
                  <div className="item-header">
                    <span className="item-platform-badge" style={{ color: meta.color }}>
                      {meta.icon} {meta.label}
                    </span>
                    <span className={`item-status-pill status-${item.status}`}>
                      {item.status === "downloading" && "⚡ Đang tải..."}
                      {item.status === "paused" && "⏸️ Tạm dừng"}
                      {item.status === "completed" && "✅ Hoàn thành"}
                      {item.status === "error" && "❌ Lỗi"}
                      {item.status === "cancelled" && "⏹️ Đã hủy"}
                      {item.status === "queued" && "⏳ Đang đợi"}
                      {!["downloading", "paused", "completed", "error", "cancelled", "queued"].includes(item.status) && "ℹ️ Không xác định"}
                    </span>
                  </div>

                  <div className="item-body">
                    {item.thumbnail && (
                      <img
                        src={item.thumbnail}
                        alt=""
                        className="item-thumb"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    )}
                    <div className="item-details">
                      <h4 className="item-title" title={item.filename || item.title}>
                        {item.filename || item.title}
                      </h4>

                      {/* v0.9.6: source link — copyable so a failed or dead
                          download can be pasted back and retried */}
                      {item.url && (
                        <div className="item-source-row">
                          <span className="item-source-url" title={item.url}>
                            🔗 {item.url}
                          </span>
                          <button
                            type="button"
                            className="item-btn tiny"
                            onClick={() => handleCopyLink(item)}
                            title="Copy link video gốc vào clipboard"
                          >
                            {copiedId === item.id ? "✅ Đã copy" : "📋 Copy link"}
                          </button>
                        </div>
                      )}

                      {/* v0.9.6: completed file info — quality, size, path */}
                      {item.status === "completed" && (item.resolution || item.sizeText || item.filePath) && (
                        <div className="item-file-meta">
                          {item.resolution && (
                            <span className="meta-chip">🎞 {resolutionLabel(item.resolution)}</span>
                          )}
                          {item.sizeText && <span className="meta-chip">💾 {item.sizeText}</span>}
                          {item.filePath && (
                            <span className="meta-chip item-file-path" title={item.filePath}>
                              📁 {item.filePath}
                            </span>
                          )}
                        </div>
                      )}

                      {/* PROGRESS BAR */}
                      {(item.status === "downloading" || item.status === "paused") && (
                        <div className="item-progress-wrapper">
                          <div className="item-progress-bar">
                            <div
                              className="item-progress-fill"
                              style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
                            />
                          </div>
                          <div className="item-progress-meta">
                            <span className="percent-text">{item.percent.toFixed(1)}%</span>
                            {item.speed && <span className="speed-text">🚀 {item.speed}</span>}
                            {/* R2-09.3: hide ETA when yt-dlp hasn't given one yet
                                (sentinel "--:--" or empty). Otherwise the bar
                                shows "⏱️ Còn --:--" which is meaningless UI. */}
                            {item.eta && item.eta !== "--:--" && (
                              <span className="eta-text">⏱️ Còn {item.eta}</span>
                            )}
                            {item.sizeText && <span className="size-text">📥 {item.sizeText}</span>}
                          </div>
                        </div>
                      )}

                      {item.error && (
                        <div className="item-error-msg">
                          ⚠️ {item.error}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ITEM ACTIONS & PIPELINE BRIDGES */}
                  <div className="item-actions-row">
                    {/* Active controls */}
                    {item.status === "downloading" && (
                      <button
                        type="button"
                        className="item-btn secondary"
                        onClick={() => handlePause(item.id)}
                        title="Tạm dừng tiến trình tải"
                      >
                        <IconPause size={13} /> Tạm dừng
                      </button>
                    )}

                    {item.status === "paused" && (
                      <button
                        type="button"
                        className="item-btn primary"
                        onClick={() => handleResume(item)}
                        title="Tiếp tục tải về"
                      >
                        <IconPlay size={13} /> Tiếp tục
                      </button>
                    )}

                    {(item.status === "downloading" || item.status === "paused" || item.status === "queued") && (
                      <button
                        type="button"
                        className="item-btn danger"
                        onClick={() => handleCancel(item.id)}
                        title="Hủy tải file này"
                      >
                        ⏹️ Hủy bỏ
                      </button>
                    )}

                    {(item.status === "error" || item.status === "cancelled") && (
                      <button
                        type="button"
                        className="item-btn primary"
                        onClick={() => handleResume(item)}
                        title="Thử tải lại"
                      >
                        <IconRotateCw size={13} /> Thử lại
                      </button>
                    )}

                    {/* COMPLETED ACTIONS: 1-CLICK PIPELINE BRIDGES */}
                    {item.status === "completed" && (
                      <div className="pipeline-bridges">
                        {(() => {
                          // BUG-058 (4) + R2-09.7: normalise the path AND
                          // verify the file is still on disk before letting
                          // the user route it to another module. Forwarding
                          // an empty / non-existent path silently breaks the
                          // next stage's "no input file" error.
                          const safe = item.filePath
                            ? item.filePath.replace(/\//g, "\\").trim()
                            : "";
                          const fileExists = fileExistsMap[item.id];
                          // Three states:
                          //   - safe empty    → path not yet known
                          //   - fileExists === undefined → still probing
                          //   - fileExists === false → file is gone
                          //   - fileExists === true  → ready
                          const pathReady = safe.length > 0 && fileExists === true;
                          const tip = !safe
                            ? "Đường dẫn file chưa sẵn sàng (hãy thử Mở Thư Mục Download)"
                            : fileExists === undefined
                            ? "Đang kiểm tra file trên ổ đĩa…"
                            : fileExists === false
                            ? `File không còn trên đĩa: ${safe}`
                            : "";
                          return (
                            <>
                              <button
                                type="button"
                                className="item-btn bridge-filesub"
                                disabled={!pathReady}
                                onClick={() => pathReady && onNavigateToFileSub(safe)}
                                title={pathReady ? "Đưa video này sang Tạo Phụ Đề Vietsub (.SRT)" : tip}
                              >
                                <IconFilm size={14} /> 📝 Tạo Phụ Đề File
                              </button>
                              <button
                                type="button"
                                className="item-btn bridge-dubbing"
                                disabled={!pathReady}
                                onClick={() => pathReady && onNavigateToDubbing(safe)}
                                title={pathReady ? "Đưa video này sang Studio Lồng Tiếng AI (Đa vai, lồng tiếng Việt chuẩn rạp)" : tip}
                              >
                                <IconClapper size={14} /> 🎬 Lồng Tiếng AI
                              </button>
                            </>
                          );
                        })()}

                        <button
                          type="button"
                          className="item-btn play-video"
                          onClick={() => handlePlay(item.filePath)}
                          title="Mở video bằng trình phát mặc định của máy (Windows Media Player / Movies & TV...)"
                        >
                          <IconPlay size={14} /> Chạy Video
                        </button>

                        <button
                          type="button"
                          className="item-btn secondary"
                          onClick={() => handleReveal(item.filePath)}
                          title="Mở file trong Windows Explorer"
                        >
                          <IconFolder size={14} /> Mở Thư Mục
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      className="item-btn-icon"
                      onClick={() => handleRemove(item.id)}
                      title="Xóa mục này"
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* COPYRIGHT DISCLAIMER */}
      <div className="downloader-copyright-banner">
        <span className="banner-icon">⚖️</span>
        <div className="banner-content">
          <strong>Lưu ý về bản quyền & mục đích sử dụng:</strong>
          <span>
            Tính năng tải video đa nền tảng chỉ nhằm phục vụ mục đích nghiên cứu học thuật, học ngoại ngữ và sao lưu nội dung cá nhân hợp pháp. Vui lòng tôn trọng quyền sở hữu trí tuệ và chính sách phân phối của các tác giả nội dung gốc.
          </span>
        </div>
      </div>
    </div>
  );
}
