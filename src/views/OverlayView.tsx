//! Overlay window — shows translated subtitles on top of any video.
//!
//! Design:
//! - Dark semi-transparent background
//! - Top thin drag handle (uses data-tauri-drag-region for Tauri native drag)
//! - Center: subtitle text (2 lines, fades in/out)
//! - Bottom: small status pill (recording/idle)
//! - Right: tiny settings button to show main window

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./OverlayView.css";
import { sublix } from "../lib/tauri";
import type { SubtitleLine } from "../lib/types";

interface OverlayState {
  status: "idle" | "capturing" | "processing";
  subtitle: SubtitleLine | null;
}

const MOCK_SUBTITLES: SubtitleLine[] = [
  { id: "1", text: "こんにちは", translated: "Xin chào", timestamp: 0, ttlMs: 999999 },
  { id: "2", text: "今日はいい天気ですね", translated: "Hôm nay thời tiết đẹp nhỉ", timestamp: 0, ttlMs: 999999 },
  { id: "3", text: "明日は雨が降るかもしれません", translated: "Ngày mai có thể sẽ mưa", timestamp: 0, ttlMs: 999999 },
];

export default function OverlayView() {
  const [state, setState] = useState<OverlayState>({
    status: "idle",
    subtitle: MOCK_SUBTITLES[0],
  });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Mark window as overlay
    const currentWindow = getCurrentWindow();
    currentWindow.setTitle("Sublix Overlay").catch(() => {});

    // For MVP: cycle through mock subtitles every 3 seconds
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % MOCK_SUBTITLES.length;
      setState((s) => ({ ...s, subtitle: MOCK_SUBTITLES[idx] }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleSettingsClick = async () => {
    try {
      await sublix.showOverlay(); // no-op, ensures we have access
      setShowSettings((s) => !s);
    } catch (e) {
      console.error("Settings toggle failed:", e);
    }
  };

  return (
    <div className="overlay-root">
      {/* Top drag handle — Tauri uses data-tauri-drag-region for native window drag */}
      <div className="overlay-drag-handle" data-tauri-drag-region>
        <span className="overlay-status-dot" data-status={state.status} />
        <span className="overlay-status-text" data-tauri-drag-region>
          {state.status === "idle" && "Sublix ready"}
          {state.status === "capturing" && "Capturing..."}
          {state.status === "processing" && "Processing..."}
        </span>
      </div>

      {/* Subtitle text — main visible area */}
      <div className="overlay-subtitle">
        {state.subtitle && (
          <>
            <div className="overlay-original">{state.subtitle.text}</div>
            {state.subtitle.translated && (
              <div className="overlay-translated">{state.subtitle.translated}</div>
            )}
          </>
        )}
        {!state.subtitle && (
          <div className="overlay-empty">Waiting for audio...</div>
        )}
      </div>

      {/* Settings button (clickable, blocks through) */}
      <button
        className="overlay-settings-btn"
        onClick={handleSettingsClick}
        title="Open settings (M4 MVP — opens main window)"
      >
        ⚙
      </button>

      {showSettings && (
        <div className="overlay-settings-hint">
          Main window has full settings.<br />
          Right-click overlay drag handle for more.
        </div>
      )}
    </div>
  );
}
