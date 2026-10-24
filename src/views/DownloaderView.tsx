//! Sublix Multi-Platform Video Downloader View
//! Reuses proven extractor flags, platform recognition & queue mechanics from hermes-downloader.
//! Features 1-click pipeline bridges into File Subtitle Studio and AI Dubbing Studio.

import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  sublix,
  type VideoInfo,
  type DownloadRequest,
  type ReupOptions,
  type DownloadProgressPayload,
  type DownloadMetaPayload,
  type PlaylistEntry,
  type ParsedUrls,
} from "../lib/tauri";
import { CustomSelect, type SelectOption } from "./CustomSelect";
import { DownloaderBatchPicker, type BatchState } from "./DownloaderBatchPicker";
import {
  IconDownload,
  IconFolder,
  IconClapper,
  IconPause,
  IconPlay,
  IconTrash,
  IconRotateCw,
  IconGlobe,
} from "../icons";
import { StudioShell, ShellCard } from "./StudioShell";
import "./DownloaderView.css";

interface DownloaderViewProps {
  onNavigateToFileSub?: (filePath: string) => void;
  onNavigateToDubbing?: (filePath: string) => void;
  onNavigateToStudio?: (filePath: string) => void;
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
  // v0.9.11: subtitle langs actually on disk (meta event / backfill / retry).
  subsLangs?: string[] | null;
  // TSK-FEAT-DL-PLATFORMS-REUP: tùy chọn reup đã dùng cho mục này (giữ khi Thử lại).
  reup?: ReupOptions | null;
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
  { value: "audio-mp3", label: "🎵 Chỉ tải âm thanh — MP3 (chất lượng cao nhất)" },
  { value: "audio-m4a", label: "🎵 Chỉ tải âm thanh — M4A (AAC)" },
];

const isAudioFormat = (format: string) => format.startsWith("audio-");

// TSK-FEAT-DL-BATCH-AUDIO: tải hàng loạt — số tiến trình yt-dlp chạy song song
// (các mục còn lại nằm ở trạng thái "queued") và trần số mục 1 lần xếp hàng.
const MAX_PARALLEL_DOWNLOADS = 3;
const MAX_BATCH_ITEMS = 200;

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
  kuaishou: { label: "Kuaishou (快手)", icon: "⚡", color: "#ff6a00" },
  xiaohongshu: { label: "Xiaohongshu (小红书)", icon: "📕", color: "#ff2442" },
  ixigua: { label: "Xigua (西瓜视频)", icon: "🍉", color: "#f04142" },
  huya: { label: "Huya (虎牙)", icon: "🐯", color: "#ff7f00" },
  douyu: { label: "Douyu (斗鱼)", icon: "🐟", color: "#f20d2e" },
  youku: { label: "Youku (优酷)", icon: "🎬", color: "#1a63d8" },
  iqiyi: { label: "iQIYI (爱奇艺)", icon: "🟩", color: "#00be06" },
  weibo: { label: "Weibo (微博)", icon: "🔴", color: "#e6162d" },
  acfun: { label: "AcFun", icon: "🅰️", color: "#ff7f24" },
  cctv: { label: "CCTV (央视)", icon: "📡", color: "#c81623" },
  vqq: { label: "Tencent Video (腾讯视频)", icon: "🎞️", color: "#ff6022" },
  mgtv: { label: "MangoTV (芒果TV)", icon: "🥭", color: "#ff9c02" },
  migu: { label: "Migu (咪咕)", icon: "📱", color: "#0a68d4" },
  niconico: { label: "Niconico", icon: "🎌", color: "#252525" },
  wppilot: { label: "WeChat Channels (视频号)", icon: "💚", color: "#07c160" },
  facebook: { label: "Facebook", icon: "🔵", color: "#1877f2" },
  twitter: { label: "X / Twitter", icon: "🐦", color: "#1d9bf0" },
  instagram: { label: "Instagram", icon: "📷", color: "#e1306c" },
  vimeo: { label: "Vimeo", icon: "🎬", color: "#1ab7ea" },
  soundcloud: { label: "SoundCloud", icon: "☁️", color: "#ff5500" },
  reddit: { label: "Reddit", icon: "🤖", color: "#ff4500" },
  twitch: { label: "Twitch", icon: "🎮", color: "#9146ff" },
  // TSK-FEAT-DL-PLATFORMS-REUP: 5 nền tảng reup mới.
  kick: { label: "Kick", icon: "🟢", color: "#53fc18" },
  dailymotion: { label: "Dailymotion", icon: "🎬", color: "#00aaff" },
  vk: { label: "VK (VKontakte)", icon: "🅥", color: "#0077ff" },
  pinterest: { label: "Pinterest", icon: "📌", color: "#e60023" },
  snapchat: { label: "Snapchat Spotlight", icon: "👻", color: "#fffc00" },
  generic_video: { label: "Web Video", icon: "🌐", color: "#64748b" },
};

// So khớp theo HOST (không phải substring) — giống `downloader::get_platform`
// ở backend. Substring từng khớp nhầm (vd "fox.com" chứa "x.com").
function detectPlatform(url: string): string {
  let host = "";
  try {
    host = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return "generic_video";
  }
  const hostMatches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (hostMatches("youtube.com") || hostMatches("youtu.be")) return "youtube";
  if (hostMatches("tiktok.com")) return "tiktok";
  if (hostMatches("douyin.com") || hostMatches("iesdouyin.com")) return "douyin";
  if (hostMatches("bilibili.com") || hostMatches("b23.tv")) return "bilibili";
  if (hostMatches("kuaishou.com") || hostMatches("gifshow.com")) return "kuaishou";
  if (hostMatches("xiaohongshu.com") || hostMatches("xhslink.com")) return "xiaohongshu";
  if (hostMatches("ixigua.com")) return "ixigua";
  if (hostMatches("huya.com")) return "huya";
  if (hostMatches("douyu.com")) return "douyu";
  if (hostMatches("youku.com")) return "youku";
  if (hostMatches("iqiyi.com")) return "iqiyi";
  if (hostMatches("weibo.com")) return "weibo";
  if (hostMatches("acfun.cn")) return "acfun";
  if (hostMatches("cctv.com")) return "cctv";
  if (hostMatches("v.qq.com")) return "vqq";
  if (hostMatches("mgtv.com")) return "mgtv";
  if (hostMatches("migu.cn")) return "migu";
  if (hostMatches("nicovideo.jp")) return "niconico";
  if (hostMatches("wppilot.com")) return "wppilot";
  if (hostMatches("facebook.com") || hostMatches("fb.watch") || hostMatches("fb.com")) return "facebook";
  if (hostMatches("twitter.com") || hostMatches("x.com")) return "twitter";
  if (hostMatches("instagram.com")) return "instagram";
  if (hostMatches("vimeo.com")) return "vimeo";
  if (hostMatches("soundcloud.com")) return "soundcloud";
  if (hostMatches("reddit.com")) return "reddit";
  if (hostMatches("twitch.tv")) return "twitch";
  // TSK-FEAT-DL-PLATFORMS-REUP
  if (hostMatches("kick.com")) return "kick";
  if (hostMatches("dailymotion.com") || hostMatches("dai.ly")) return "dailymotion";
  if (hostMatches("vk.com") || hostMatches("vk.ru") || hostMatches("vkvideo.ru")) return "vk";
  if (hostMatches("pinterest.com") || hostMatches("pin.it")) return "pinterest";
  if (hostMatches("snapchat.com")) return "snapchat";
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

// TSK-FEAT-DL-BATCH-AUDIO: link trỏ tới cả danh sách (playlist / series)
// → cần mở rộng bằng `downloader_expand_playlist` trước khi xếp hàng, vì
// tải trực tiếp với `--no-playlist` sẽ chỉ lấy 1 video (hoặc cả list).
function looksLikePlaylist(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return false;
  }
  const path = u.pathname.toLowerCase();
  switch (detectPlatform(raw)) {
    case "youtube":
      return u.searchParams.has("list") || path.startsWith("/playlist");
    case "bilibili":
      return (
        u.hostname.toLowerCase().startsWith("space.") ||
        /\/(medialist|favlist|list|bangumi)\//.test(`${path}/`)
      );
    case "soundcloud":
      return path.includes("/sets/");
    default:
      return path.includes("playlist");
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
  onNavigateToStudio,
}: DownloaderViewProps) {
  const [url, setUrl] = useState<string>("");
  const [format, setFormat] = useState<string>("max");
  const [browserCookie, setBrowserCookie] = useState<string>("none");
  // v0.9.4: default OFF — the owner only needs the video; subtitle fetching
  // is optional and YouTube can rate-limit it (429).
  const [extractSubtitles, setExtractSubtitles] = useState<boolean>(false);
  // TSK-FEAT-DL-PLATFORMS-REUP: tùy chọn reup (mặc định TẮT — không đổi hành vi cũ).
  const [reupInfo, setReupInfo] = useState<boolean>(false);
  const [reupArchive, setReupArchive] = useState<boolean>(false);
  const [reupThumbnail, setReupThumbnail] = useState<boolean>(false);
  const [sectionStart, setSectionStart] = useState<string>("");
  const [sectionEnd, setSectionEnd] = useState<string>("");
  // v0.9.11: item id whose subtitle fetch is running ("📝 Tải phụ đề").
  const [subsBusyId, setSubsBusyId] = useState<string | null>(null);
  // v0.9.11: one-line feedback for the subtitle fetch (success/warning).
  const [subsNotice, setSubsNotice] = useState<string | null>(null);
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

  // TSK-FEAT-DL-BATCH-AUDIO: tải hàng loạt.
  // Danh sách mục chờ xác nhận (playlist đã mở rộng / nhiều link).
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [expanding, setExpanding] = useState<boolean>(false);
  // Số link hợp lệ (đã loại trùng) đang có trong ô nhập.
  const [linkCount, setLinkCount] = useState<number>(0);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  // Mục "queued" đã được gọi start — chặn effect gọi trùng 2 lần.
  const launchedRef = useRef<Set<string>>(new Set());

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
      const needsMeta =
        item.status === "completed" &&
        !!item.filePath &&
        (!item.resolution || item.subsLangs === undefined);
      if (needsMeta && item.filePath && !metaProbedRef.current[item.id]) {
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
                      subsLangs: meta.subs_langs ?? i.subsLangs,
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

  // TSK-FEAT-DL-BATCH-AUDIO: đếm số link hợp lệ trong ô nhập (để đổi nhãn nút).
  useEffect(() => {
    if (!url.trim()) {
      setLinkCount(0);
      return;
    }
    let alive = true;
    sublix
      .downloaderParseUrls(url)
      .then((parsed) => alive && setLinkCount(parsed.urls.length))
      .catch(() => alive && setLinkCount(isValidHttpUrl(url) ? 1 : 0));
    return () => {
      alive = false;
    };
  }, [url]);

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
                subsLangs: p.subs_langs ?? item.subsLangs,
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

  // v0.9.11 (PO bug "chọn phụ đề không dùng được"): tải file phụ đề cho video
  // đã tải — chạy pass riêng với --ignore-errors (track dịch bị YouTube chặn
  // 429 sẽ tự bị bỏ qua, track gốc vẫn về đủ).
  async function handleFetchSubs(item: DownloadItem) {
    if (subsBusyId) return;
    setSubsBusyId(item.id);
    setSubsNotice(null);
    const platform = detectPlatform(item.url);
    const platformLabel = PLATFORM_META[platform]?.label ?? "nền tảng này";
    try {
      const langs = await sublix.downloaderFetchSubtitles(
        item.url,
        item.filename || "",
        item.browserCookies ?? null,
        null,
      );
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, subsLangs: langs } : i))
      );
      if (langs.length > 0) {
        setSubsNotice(
          `📝 Đã tải phụ đề ${platformLabel}: ${langs.join(", ")} (${langs.length} file .srt — nằm cùng thư mục với video, Studio sẽ tự tận dụng).`
        );
      } else {
        setSubsNotice(
          platform === "youtube"
            ? "⚠️ YouTube không trả về track phụ đề nào cho video này (các track dịch đang bị chặn tạm thời — thử lại sau vài phút)."
            : `⚠️ ${platformLabel} không trả về track phụ đề nào cho video này.`
        );
      }
    } catch (err) {
      setSubsNotice(`⚠️ Không tải được phụ đề: ${err}`);
    } finally {
      setSubsBusyId(null);
    }
  }

  const currentPlatform = detectPlatform(url);
  const currentPlatformMeta = PLATFORM_META[currentPlatform] || PLATFORM_META.generic_video;

  // TSK-FEAT-DL-BATCH-AUDIO: tách ô nhập thành danh sách link (backend lọc +
  // loại trùng). Ngoài Tauri (web dev) thì coi cả ô là 1 link.
  const parseLinks = async (text: string): Promise<ParsedUrls> => {
    try {
      return await sublix.downloaderParseUrls(text);
    } catch {
      const t = text.trim();
      return { urls: isValidHttpUrl(t) ? [t] : [], invalid: 0, duplicates: 0 };
    }
  };

  const skippedNote = (parsed: ParsedUrls): string | null =>
    parsed.invalid + parsed.duplicates > 0
      ? `ℹ️ Đã bỏ ${parsed.duplicates} link trùng và ${parsed.invalid} đoạn chữ không phải link http(s).`
      : null;

  // Mở rộng các link playlist + gom link lẻ thành danh sách có checkbox.
  const buildBatch = async (parsed: ParsedUrls) => {
    setExpanding(true);
    setInspectError(null);
    setVideoInfo(null);
    setQueueNotice(null);
    const entries: PlaylistEntry[] = [];
    const seen = new Set<string>();
    const notes: string[] = [];
    const push = (e: PlaylistEntry) => {
      if (seen.has(e.url)) return;
      seen.add(e.url);
      entries.push(e);
    };
    try {
      for (const link of parsed.urls) {
        if (!looksLikePlaylist(link)) {
          push({ url: link, title: link, duration: null });
          continue;
        }
        try {
          const exp = await sublix.downloaderExpandPlaylist(
            link,
            browserCookie !== "none" ? browserCookie : null,
          );
          exp.entries.forEach(push);
          if (exp.truncated) {
            notes.push(
              `⚠️ Playlist "${exp.title || link}" có ${exp.total} mục — chỉ lấy ${exp.entries.length} mục đầu (giới hạn an toàn ${MAX_BATCH_ITEMS} mục).`
            );
          }
        } catch (e) {
          notes.push(`⚠️ Không đọc được playlist ${link}: ${formatError(e, "lỗi không rõ")}`);
        }
      }
      if (entries.length > MAX_BATCH_ITEMS) {
        notes.push(
          `⚠️ Tổng cộng ${entries.length} mục — chỉ giữ ${MAX_BATCH_ITEMS} mục đầu (giới hạn an toàn).`
        );
        entries.length = MAX_BATCH_ITEMS;
      }
      const skipped = skippedNote(parsed);
      if (skipped) notes.push(skipped);
      setBatch({ entries, unchecked: new Set(), notes });
    } finally {
      setExpanding(false);
    }
  };

  // TSK-FEAT-DL-PLATFORMS-REUP: gom tùy chọn reup hiện tại thành payload.
  const buildReupOptions = (): ReupOptions => ({
    write_info: reupInfo,
    archive: reupArchive,
    thumbnail: reupThumbnail,
    section_start: sectionStart.trim() || null,
    section_end: sectionEnd.trim() || null,
  });

  // Xếp các mục vào hàng đợi có sẵn (trạng thái "queued"); effect bên dưới
  // tự khởi động tối đa MAX_PARALLEL_DOWNLOADS mục một lúc.
  const queueEntries = (entries: PlaylistEntry[], extraNote?: string | null) => {
    // BUG-053: không xếp 1 URL 2 lần khi nó đang chạy / đang chờ.
    const busy = new Set(
      items
        .filter((i) => i.status === "downloading" || i.status === "paused" || i.status === "queued")
        .map((i) => i.url)
    );
    const now = Date.now();
    const fresh: DownloadItem[] = [];
    let skipped = 0;
    entries.slice(0, MAX_BATCH_ITEMS).forEach((entry, idx) => {
      if (busy.has(entry.url)) {
        skipped++;
        return;
      }
      busy.add(entry.url);
      const title = entry.title || entry.url;
      fresh.push({
        id: `dl_${now}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        url: entry.url,
        title,
        platform: detectPlatform(entry.url),
        format,
        browserCookies: browserCookie !== "none" ? browserCookie : null,
        extractSubtitles,
        status: "queued",
        percent: 0,
        speed: "",
        eta: "--:--",
        sizeText: "",
        filename: title,
        filePath: null,
        error: null,
        reup: buildReupOptions(),
        createdAt: now + idx,
      });
    });
    if (fresh.length > 0) setItems((prev) => [...fresh, ...prev]);
    setQueueNotice(
      [
        fresh.length > 0
          ? `📥 Đã xếp ${fresh.length} mục vào hàng đợi — tải song song tối đa ${MAX_PARALLEL_DOWNLOADS} mục.`
          : "⚠️ Không có mục mới để xếp hàng.",
        skipped > 0 ? `Bỏ ${skipped} link đang tải/đang chờ (chống trùng).` : null,
        extraNote ?? null,
      ]
        .filter(Boolean)
        .join(" ")
    );
  };

  // Inspect video URL
  const handleInspect = async (overrideUrl?: string) => {
    const text = (overrideUrl || url).trim();
    if (!text) return;

    // TSK-FEAT-DL-BATCH-AUDIO: nhiều link hoặc link playlist → danh sách chọn.
    const parsed = await parseLinks(text);
    if (parsed.urls.length > 1 || parsed.urls.some(looksLikePlaylist)) {
      await buildBatch(parsed);
      return;
    }
    const targetUrl = parsed.urls.length === 1 ? parsed.urls[0] : text;

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
      // TSK-FEAT-DL-BATCH-AUDIO: danh sách chọn đang mở → xếp các mục đã tích.
      if (batch) {
        const chosen = batch.entries.filter((e) => !batch.unchecked.has(e.url));
        if (chosen.length === 0) {
          setInspectError("Chưa chọn mục nào trong danh sách.");
          return;
        }
        queueEntries(chosen);
        setBatch(null);
        setUrl("");
        return;
      }

      const parsed = await parseLinks(url);
      // Có link playlist → mở danh sách để xác nhận trước khi tải.
      if (parsed.urls.some(looksLikePlaylist)) {
        await buildBatch(parsed);
        return;
      }
      // Nhiều link lẻ → mỗi link 1 mục trong hàng đợi.
      if (parsed.urls.length > 1) {
        queueEntries(
          parsed.urls.map((u) => ({ url: u, title: u, duration: null })),
          skippedNote(parsed),
        );
        setUrl("");
        setVideoInfo(null);
        return;
      }

      const targetUrl = parsed.urls.length === 1 ? parsed.urls[0] : url.trim();
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
        reup: buildReupOptions(),
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
        reup: buildReupOptions(),
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
      reup: item.reup ?? undefined,
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

  // TSK-FEAT-DL-BATCH-AUDIO: cổng hàng đợi — mỗi khi có chỗ trống, khởi động
  // mục "queued" cũ nhất qua đúng đường `handleResume` (downloader_start).
  useEffect(() => {
    const running = items.filter((i) => i.status === "downloading").length;
    const slots = MAX_PARALLEL_DOWNLOADS - running;
    if (slots <= 0) return;
    items
      .filter((i) => i.status === "queued" && !launchedRef.current.has(i.id))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, slots)
      .forEach((item) => {
        launchedRef.current.add(item.id);
        void handleResume(item);
      });
  }, [items]);

  const handleCancel = async (id: string) => {
    // Mục còn chờ trong hàng đợi chưa có tiến trình yt-dlp → hủy tại chỗ.
    if (items.find((i) => i.id === id)?.status === "queued") {
      launchedRef.current.add(id);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: "cancelled" } : item))
      );
      return;
    }
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
    // Mục đang chờ: chặn cổng hàng đợi khởi động nó trong lúc đang xóa.
    launchedRef.current.add(id);
    if (target && (target.status === "downloading" || target.status === "paused")) {
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

  // Mở và xem video trực tiếp trong Sublix Studio (trong ứng dụng)
  const handlePlayInStudio = (path?: string | null) => {
    if (!path) return;
    if (onNavigateToStudio) {
      onNavigateToStudio(path);
    } else if (onNavigateToDubbing) {
      onNavigateToDubbing(path);
    } else if (onNavigateToFileSub) {
      onNavigateToFileSub(path);
    }
  };

  // Mở bằng trình phát ngoài Windows Media Player / Movies & TV (khi người dùng chủ động yêu cầu)
  const handlePlayExternal = async (path?: string | null) => {
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
    <StudioShell
      left={<>
      {/* INPUT CARD */}
      <div className="downloader-card input-card">
        <div className="downloader-url-group">
          <div className="downloader-input-wrapper">
            <span className="platform-tag" style={{ color: currentPlatformMeta.color }}>
              <span>{currentPlatformMeta.icon}</span>
              <span>{currentPlatformMeta.label}</span>
            </span>
            {/* TSK-FEAT-DL-BATCH-AUDIO: textarea để dán nhiều link (mỗi dòng 1 link);
                Enter = Kiểm tra link, Shift+Enter = xuống dòng. */}
            <textarea
              className="downloader-url-input"
              rows={url ? Math.min(5, url.split("\n").length) : 2}
              placeholder="Dán link video hoặc playlist (YouTube, TikTok, Douyin, Bilibili...) — nhiều link thì mỗi dòng 1 link"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setVideoInfo(null);
                setInspectError(null);
                setThumbFailed(false);
                setBatch(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
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
                  setBatch(null);
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
            disabled={inspecting || expanding || !url.trim()}
          >
            {inspecting || expanding
              ? "⏳ Đang đọc..."
              : linkCount > 1
              ? `🔍 Kiểm Tra ${linkCount} Link`
              : "🔍 Kiểm Tra Link"}
          </button>
        </div>

        {inspectError && (
          <div className="downloader-alert-error">
            ⚠️ {inspectError}
          </div>
        )}

        {expanding && (
          <div className="downloader-sub-note">⏳ Đang đọc danh sách playlist bằng yt-dlp...</div>
        )}

        {batch && (
          <DownloaderBatchPicker batch={batch} onChange={setBatch} formatDuration={formatDuration} />
        )}

        {queueNotice && <div className="downloader-sub-note">{queueNotice}</div>}

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
            <label className="option-label">Chất lượng / định dạng tải về:</label>
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

          {/* TSK-FEAT-DL-PLATFORMS-REUP: tùy chọn reup (mặc định tắt). */}
          <div className="downloader-option-item reup-options">
            <label className="option-label">
              🎬 Tùy chọn reup <span className="option-hint">(tuỳ chọn — mặc định tắt)</span>
            </label>
            <div className="reup-checkbox-row">
              <label className="checkbox-label reup-checkbox">
                <input
                  type="checkbox"
                  checked={reupInfo}
                  onChange={(e) => setReupInfo(e.target.checked)}
                />
                <span>🧾 Xuất metadata (.info.txt) để viết lại caption</span>
              </label>
              <label className="checkbox-label reup-checkbox">
                <input
                  type="checkbox"
                  checked={reupArchive}
                  onChange={(e) => setReupArchive(e.target.checked)}
                />
                <span>♻️ Chống tải trùng (sổ đã tải)</span>
              </label>
              <label className="checkbox-label reup-checkbox">
                <input
                  type="checkbox"
                  checked={reupThumbnail}
                  onChange={(e) => setReupThumbnail(e.target.checked)}
                />
                <span>🖼️ Tải thumbnail gốc (.jpg)</span>
              </label>
            </div>
            <div className="reup-section-row">
              <span className="reup-section-label">✂️ Chỉ tải đoạn (hh:mm:ss):</span>
              <input
                type="text"
                className="reup-time-input"
                placeholder="từ 00:00:00"
                value={sectionStart}
                onChange={(e) => setSectionStart(e.target.value)}
              />
              <span className="reup-section-dash">→</span>
              <input
                type="text"
                className="reup-time-input"
                placeholder="đến 00:00:00"
                value={sectionEnd}
                onChange={(e) => setSectionEnd(e.target.value)}
              />
              <span className="option-hint">(để trống = tải cả video)</span>
            </div>
          </div>

          {subsNotice && <div className="downloader-sub-note">{subsNotice}</div>}
        </div>

        {/* ACTION ROW */}
        <div className="downloader-submit-row">
          <button
            type="button"
            className="downloader-btn-start"
            onClick={handleStartDownload}
            disabled={
              starting ||
              expanding ||
              (batch ? batch.entries.length === batch.unchecked.size : !url.trim())
            }
          >
            {starting || expanding ? (
              <>
                <span className="downloader-spinner" />{" "}
                {expanding ? "Đang đọc playlist..." : "Đang khởi động..."}
              </>
            ) : (
              <>
                <IconDownload size={16} />{" "}
                {batch
                  ? `Tải ${batch.entries.length - batch.unchecked.size} Mục Đã Chọn`
                  : linkCount > 1
                  ? `Tải ${linkCount} Link Cùng Lúc`
                  : isAudioFormat(format)
                  ? "Bắt Đầu Tải Âm Thanh Ngay"
                  : "Bắt Đầu Tải Video Ngay"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* DOWNLOADS LIST SECTION */}
      </>
      }
      center={<>
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
                          {isAudioFormat(item.format) ? (
                            <span className="meta-chip">
                              🎵 Âm thanh {item.format.replace("audio-", "").toUpperCase()}
                            </span>
                          ) : item.resolution ? (
                            <span className="meta-chip">🎞 {resolutionLabel(item.resolution)}</span>
                          ) : null}
                          {item.sizeText && <span className="meta-chip">💾 {item.sizeText}</span>}
                          {item.subsLangs && item.subsLangs.length > 0 ? (
                            <span className="meta-chip">
                              📝 Phụ đề YouTube: {item.subsLangs.join(", ")}
                            </span>
                          ) : item.extractSubtitles && item.status === "completed" ? (
                            <span
                              className="meta-chip meta-chip-warn"
                              title="YouTube có thể đang chặn tạm thời các track phụ đề dịch (429) — bấm 'Tải phụ đề' để thử lại."
                            >
                              📝 Chưa có phụ đề
                            </span>
                          ) : null}
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
                                className="item-btn bridge-studio"
                                disabled={!pathReady}
                                onClick={() => handlePlayInStudio(safe)}
                                title={
                                  !pathReady
                                    ? tip
                                    : isAudioFormat(item.format)
                                    ? "Mở file âm thanh trong Sublix Studio (tạo phụ đề & dịch thuật từ âm thanh)"
                                    : "Xem và biên tập video ngay trong Sublix Studio (Phụ đề, dịch thuật & lồng tiếng AI)"
                                }
                              >
                                <IconClapper size={14} /> 🚀 Xem Trong Studio
                              </button>

                              <button
                                type="button"
                                className="item-btn secondary"
                                disabled={!pathReady}
                                onClick={() => handlePlayExternal(safe)}
                                title={pathReady ? "Mở video bằng trình phát ngoài của hệ thống Windows (Windows Media Player / Movies & TV / VLC)" : tip}
                              >
                                🖥️ Player Ngoài
                              </button>
                            </>
                          );
                        })()}

                        <button
                          type="button"
                          className="item-btn secondary"
                          onClick={() => handleReveal(item.filePath)}
                          title="Mở file trong Windows Explorer"
                        >
                          <IconFolder size={14} /> Mở Thư Mục
                        </button>

                        <button
                          type="button"
                          className="item-btn secondary"
                          disabled={subsBusyId === item.id}
                          onClick={() => handleFetchSubs(item)}
                          title="Tải/cập nhật file phụ đề (.srt) từ YouTube — chạy riêng, không đụng video. Track gốc tải được; track dịch có thể bị YouTube chặn tạm thời."
                        >
                          {subsBusyId === item.id
                            ? "⏳ Đang tải sub..."
                            : item.subsLangs && item.subsLangs.length > 0
                            ? "📝 Tải lại phụ đề"
                            : "📝 Tải phụ đề"}
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

      </>
      }
      right={<>
        <ShellCard
          icon={<IconFolder size={14} />}
          title="Thư Mục Lưu Trữ"
          actions={
            <button
              type="button"
              className="downloader-btn-secondary"
              style={{ padding: "4px 10px", fontSize: "0.8rem" }}
              onClick={() => sublix.downloaderOpenFolder()}
              title="Mở thư mục lưu trữ file tải về trên máy tính"
            >
              <IconFolder size={12} /> Mở Thư Mục
            </button>
          }
        >
          {dlDir && (
            <p style={{ margin: 0, fontSize: "0.78rem", opacity: 0.85, wordBreak: "break-all" }}>
              <code style={{ fontFamily: "var(--font-mono)", background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 4 }}>{dlDir}</code>
            </p>
          )}
        </ShellCard>

        <ShellCard
          icon={<IconGlobe size={14} />}
          title="Nền Tảng Hỗ Trợ"
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: "0.78rem" }}>
            <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(239, 68, 68, 0.15)", color: "#f87171" }}>YouTube</span>
            <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(0, 242, 234, 0.15)", color: "#2dd4bf" }}>TikTok</span>
            <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(254, 44, 85, 0.15)", color: "#fb7185" }}>Douyin 抖音</span>
            <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(0, 161, 214, 0.15)", color: "#38bdf8" }}>Bilibili 哔哩哔哩</span>
            <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" }}>Facebook</span>
            <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(244, 236, 222, 0.1)", color: "#e2e8f0" }}>X / Twitter</span>
          </div>
        </ShellCard>

        <ShellCard
          icon={<span style={{ fontSize: 13 }}>⚖️</span>}
          title="Lưu Ý Bản Quyền"
        >
          <p style={{ margin: 0, fontSize: "0.76rem", lineHeight: 1.5, color: "var(--t3)" }}>
            Tính năng tải video phục vụ học thuật, dịch thuật và sao lưu nội dung cá nhân hợp pháp. Vui lòng tôn trọng quyền sở hữu trí tuệ của tác giả gốc.
          </p>
        </ShellCard>
      </>}
    />
  );
}
