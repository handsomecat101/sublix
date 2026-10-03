//! Overlay window — shows real-time translated subtitles on top of any video.

import { useEffect, useState, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "./OverlayView.css";
import { sublix, type AppConfig } from "../lib/tauri";

type Status = "idle" | "capturing" | "processing";

interface Subtitle {
  id: number;
  text: string;
  original?: string;
  language: string;
  translated_from?: string;
  translated_to?: string;
  timestamp: number;
  stt_duration?: number;
  translate_duration?: number;
}

export default function OverlayView() {
  const [status, setStatus] = useState<Status>("idle");
  const [version, setVersion] = useState<string>("");
  const [subtitle, setSubtitle] = useState<Subtitle | null>(null);
  const [chunkCount, setChunkCount] = useState<number>(0);
  const [audioPeak, setAudioPeak] = useState<number>(0);
  const [fontSize, setFontSize] = useState<number>(22);
  const [showOriginal, setShowOriginal] = useState<boolean>(true);
  const [clickThrough, setClickThrough] = useState<boolean>(false);
  const subtitleHistoryRef = useRef<Subtitle[]>([]);

  useEffect(() => {
    sublix.appInfo().then((info) => setVersion(info.version)).catch(() => {});
    sublix.getConfig().then((cfg) => {
      if (cfg.overlay_font_size) setFontSize(cfg.overlay_font_size);
      setShowOriginal(cfg.overlay_show_original ?? true);
      setClickThrough(cfg.overlay_click_through ?? false);
    }).catch(() => {});

    const unlistens: UnlistenFn[] = [];
    listen<{ kind: string; message?: string }>("status:change", (event) => {
      const k = event.payload.kind;
      if (k === "capturing") setStatus("capturing");
      else if (k === "processing") setStatus("processing");
      else if (k === "idle") setStatus("idle");
    }).then((u) => unlistens.push(u));

    listen<AppConfig>("config:updated", (event) => {
      const cfg = event.payload;
      if (cfg.overlay_font_size) setFontSize(cfg.overlay_font_size);
      setShowOriginal(cfg.overlay_show_original ?? true);
      setClickThrough(cfg.overlay_click_through ?? false);
    }).then((u) => unlistens.push(u));

    listen<{ peak: number; timestamp: number }>("audio:level", (event) => {
      setAudioPeak((prev) => prev * 0.45 + event.payload.peak * 0.55);
    }).then((u) => unlistens.push(u));

    listen<Subtitle>("subtitle:new", (event) => {
      const sub = event.payload;
      subtitleHistoryRef.current.push(sub);
      if (subtitleHistoryRef.current.length > 3) {
        subtitleHistoryRef.current.shift();
      }
      setSubtitle(sub);
      setChunkCount((c) => c + 1);
      setStatus("capturing");
    }).then((u) => unlistens.push(u));

    return () => unlistens.forEach((u) => u());
  }, []);

  const handleClose = async () => {
    try {
      try {
        await sublix.stopLive();
      } catch {
        // Ignore
      }
      await sublix.hideOverlay();
    } catch (e) {
      console.error("Hide overlay failed:", e);
    }
  };

  return (
    <div className="overlay-root">
      {/* Audio level VU meter */}
      {audioPeak > 0.005 && (
        <div className="overlay-vu" data-active={audioPeak > 0.02}>
          <div
            className="overlay-vu-bar"
            style={{ width: `${Math.min(100, audioPeak * 100)}%` }}
          />
        </div>
      )}

      {/* Top drag handle */}
      <div className="overlay-drag-handle" data-tauri-drag-region>
        <span
          className="overlay-status-dot"
          data-status={status}
          data-peak={audioPeak > 0.02}
        />
        <span className="overlay-status-text" data-tauri-drag-region>
          {status === "idle" && "Sublix ready"}
          {status === "capturing" &&
            (chunkCount > 0 ? `Live • Sub #${chunkCount}` : "Listening (Smart VAD)...")}
          {status === "processing" && `Processing #${chunkCount}`}
          {clickThrough && " • 🔒 Click-through"}
        </span>
        {version && (
          <span className="overlay-version" data-tauri-drag-region>
            v{version}
          </span>
        )}
        {!clickThrough && (
          <button
            className="overlay-close-btn"
            onClick={handleClose}
            title="Đóng / Ẩn Overlay (Dừng Live Subtitles)"
          >
            ×
          </button>
        )}
      </div>

      {/* Subtitle area */}
      <div className="overlay-subtitle" data-tauri-drag-region>
        {subtitle ? (
          <>
            <div
              className="overlay-translated"
              style={{ fontSize: `${fontSize}px` }}
              data-tauri-drag-region
            >
              {subtitle.text}
            </div>
            {showOriginal &&
              subtitle.original &&
              subtitle.translated_to &&
              subtitle.original !== subtitle.text && (
                <div
                  className="overlay-original"
                  style={{ fontSize: `${Math.max(12, Math.round(fontSize * 0.62))}px` }}
                  data-tauri-drag-region
                >
                  {subtitle.original}
                </div>
              )}
            <div className="overlay-meta" data-tauri-drag-region>
              {subtitle.translated_to
                ? `${subtitle.translated_from?.toUpperCase()} → ${subtitle.translated_to.toUpperCase()}`
                : subtitle.language.toUpperCase()}
              {subtitle.stt_duration !== undefined &&
                ` • STT ${(subtitle.stt_duration * 1000).toFixed(0)}ms`}
              {subtitle.translate_duration !== undefined &&
                subtitle.translate_duration > 0 &&
                ` • LLM ${(subtitle.translate_duration * 1000).toFixed(0)}ms`}
            </div>
          </>
        ) : (
          <div className="overlay-empty" data-tauri-drag-region>
            {status === "idle" && (
              <>
                Waiting for live stream...
                <br />
                <span className="overlay-empty-sub">
                  Click "▶ Start Live" in Settings window
                </span>
              </>
            )}
            {status === "capturing" && "Listening for speech... (Play video or speak)"}
            {status === "processing" && "Transcribing + translating on GPU..."}
          </div>
        )}
      </div>
    </div>
  );
}
