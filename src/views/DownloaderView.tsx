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
  { value: "none", label: "Không dùng cookies (Mặc định)" },
  { value: "edge", label: "Microsoft Edge", badge: "Windows" },
  { value: "chrome", label: "Google Chrome" },
  { value: "firefox", label: "Mozilla Firefox" },
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

export default function DownloaderView({
  onNavigateToFileSub,
  onNavigateToDubbing,
}: DownloaderViewProps) {
  const [url, setUrl] = useState<string>("");
  const [format, setFormat] = useState<string>("max");
  const [browserCookie, setBrowserCookie] = useState<string>("none");
  const [extractSubtitles, setExtractSubtitles] = useState<boolean>(true);

  // Inspection state
  const [inspecting, setInspecting] = useState<boolean>(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Downloads state
  const [items, setItems] = useState<DownloadItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load downloads history:", e);
    }
    return [];
  });

  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "completed">("all");
  const itemsRef = useRef<DownloadItem[]>(items);
  itemsRef.current = items;

  // Save history on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn("Failed to save downloads history:", e);
    }
  }, [items]);

  // Listen to progress events from backend
  useEffect(() => {
    const pProgress = listen<DownloadProgressPayload>("downloader:progress", (event) => {
      const p = event.payload;
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== p.id) return item;
          return {
            ...item,
            status: p.status as any,
            percent: p.percent,
            speed: p.speed || item.speed,
            eta: p.eta || item.eta,
            sizeText: p.size_text || item.sizeText,
            filename: p.filename || item.filename,
            filePath: p.file_path || item.filePath,
            error: p.error || item.error,
          };
        })
      );
    });

    return () => {
      pProgress.then((u) => u()).catch(() => {});
    };
  }, []);

  const currentPlatform = detectPlatform(url);
  const currentPlatformMeta = PLATFORM_META[currentPlatform] || PLATFORM_META.generic_video;

  // Inspect video URL
  const handleInspect = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl || url).trim();
    if (!targetUrl) return;

    setInspecting(true);
    setInspectError(null);
    try {
      const info = await sublix.downloaderGetInfo(targetUrl);
      setVideoInfo(info);
    } catch (e: any) {
      setInspectError(e?.toString() || "Không thể lấy thông tin video");
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
    const targetUrl = url.trim();
    if (!targetUrl) return;

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
            ? { ...item, status: "error", error: e?.toString() || "Lỗi tải video" }
            : item
        )
      );
    }
  };

  const handlePause = async (id: string) => {
    try {
      await sublix.downloaderPause(id);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: "paused" } : item))
      );
    } catch (e) {
      console.error(e);
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
            ? { ...i, status: "error", error: e?.toString() || "Lỗi khi tiếp tục tải" }
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
      console.error(e);
    }
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearHistory = () => {
    setItems((prev) => prev.filter((item) => item.status === "downloading" || item.status === "paused"));
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
            {videoInfo.thumbnail ? (
              <div className="video-thumb-container">
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="video-thumb-img"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
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
            disabled={!url.trim()}
          >
            <IconDownload size={16} /> Bắt Đầu Tải Video Ngay
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
                            {item.eta && <span className="eta-text">⏱️ Còn {item.eta}</span>}
                            {item.sizeText && <span className="size-text">📦 {item.sizeText}</span>}
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

                    {(item.status === "downloading" || item.status === "paused") && (
                      <button
                        type="button"
                        className="item-btn danger"
                        onClick={() => handleCancel(item.id)}
                        title="Hủy tải file này"
                      >
                        ⏹️ Hủy bỏ
                      </button>
                    )}

                    {item.status === "error" && (
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
                        <button
                          type="button"
                          className="item-btn bridge-filesub"
                          onClick={() => {
                            if (item.filePath) {
                              onNavigateToFileSub(item.filePath);
                            }
                          }}
                          title="Đưa video này sang Tạo Phụ Đề Vietsub (.SRT)"
                        >
                          <IconFilm size={14} /> 📝 Tạo Phụ Đề File
                        </button>

                        <button
                          type="button"
                          className="item-btn bridge-dubbing"
                          onClick={() => {
                            if (item.filePath) {
                              onNavigateToDubbing(item.filePath);
                            }
                          }}
                          title="Đưa video này sang Studio Lồng Tiếng AI (Đa vai, lồng tiếng Việt chuẩn rạp)"
                        >
                          <IconClapper size={14} /> 🎬 Lồng Tiếng AI
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
