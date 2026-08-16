//! Settings window — main control panel for Sublix.
//!
//! Sections:
//! - Status (idle / capturing / error)
//! - Audio devices (dropdown)
//! - Capture controls (start/stop, test capture)
//! - STT (model selection, transcribe test)
//! - About

import { useEffect, useState } from "react";
import { sublix, type AudioDevice } from "../lib/tauri";
import "./SettingsView.css";

type Status =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

export default function SettingsView() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<number>(0);
  const [model, setModel] = useState<string>("tiny");
  const [language, setLanguage] = useState<string>("ja");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);

  // Load devices on mount
  useEffect(() => {
    loadDevices();
  }, []);

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

  async function handleTestCapture() {
    if (devices.length === 0) {
      setStatus({ kind: "error", message: "No audio device selected" });
      return;
    }
    setStatus({ kind: "working", message: "Recording 5 seconds..." });
    const path = "sublix-test-capture.wav";
    try {
      const fmt = await sublix.captureTest(path, 5, selectedDevice);
      setLastCapture(path);
      setStatus({
        kind: "success",
        message: `Captured ${fmt.sample_rate}Hz, ${fmt.channels}ch → ${path}`,
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
    setStatus({ kind: "working", message: "Transcribing (local Whisper)..." });
    try {
      const result = await sublix.transcribe(lastCapture, language, model);
      setLastTranscript(result.text);
      setStatus({
        kind: "success",
        message: `Transcribed in ${result.inference_duration_secs.toFixed(1)}s (${result.audio_duration_secs.toFixed(1)}s audio)`,
      });
    } catch (e) {
      setStatus({ kind: "error", message: `Transcribe failed: ${e}` });
    }
  }

  return (
    <div className="settings-root">
      <header className="settings-header">
        <h1>Sublix</h1>
        <span className="settings-tagline">Real-time subtitle overlay</span>
      </header>

      {/* Status bar */}
      <div className={`settings-status status-${status.kind}`}>
        {status.kind === "idle" && "Ready. M4 MVP — local Whisper working."}
        {status.kind === "working" && status.message}
        {status.kind === "error" && `⚠ ${status.message}`}
        {status.kind === "success" && `✓ ${status.message}`}
      </div>

      <section className="settings-section">
        <h2>🎙 Audio device</h2>
        <div className="settings-row">
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(Number(e.target.value))}
            className="settings-select"
          >
            {devices.length === 0 && <option>No devices found</option>}
            {devices.map((d, i) => (
              <option key={d.id} value={i}>
                {d.name}
              </option>
            ))}
          </select>
          <button onClick={loadDevices} className="settings-btn-secondary">
            Refresh
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>🧪 Test capture + transcribe</h2>
        <p className="settings-help">
          Plays audio → records 5s → transcribes with local Whisper. No API key needed.
        </p>
        <div className="settings-row">
          <button
            onClick={handleTestCapture}
            className="settings-btn-primary"
            disabled={status.kind === "working"}
          >
            ▶ Capture 5s
          </button>
          {lastCapture && (
            <button
              onClick={handleTranscribe}
              className="settings-btn-primary"
              disabled={status.kind === "working"}
            >
              🔤 Transcribe
            </button>
          )}
        </div>
        {lastCapture && (
          <div className="settings-meta">Last capture: <code>{lastCapture}</code></div>
        )}
        {lastTranscript && (
          <div className="settings-transcript">
            <strong>Transcript:</strong> {lastTranscript}
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>🤖 STT model</h2>
        <div className="settings-row">
          <label>Model:</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="settings-select"
          >
            <option value="tiny">tiny (75MB, fast MVP)</option>
            <option value="base">base (140MB, balanced)</option>
            <option value="small">small (465MB, accurate)</option>
            <option value="medium">medium (1.5GB, very accurate)</option>
            <option value="large-v3">large-v3 (3GB, best)</option>
          </select>
        </div>
        <div className="settings-row">
          <label>Language:</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="settings-select"
          >
            <option value="ja">Japanese</option>
            <option value="en">English</option>
            <option value="vi">Vietnamese</option>
            <option value="zh">Chinese</option>
            <option value="ko">Korean</option>
            <option value="auto">Auto-detect</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h2>ℹ About</h2>
        <p className="settings-about">
          <strong>Sublix v0.1.0</strong> — M4 MVP
          <br />
          Stack: Tauri v2 + Rust + React + local Whisper.cpp
          <br />
          No cloud required. No API key. No LLVM.
          <br />
          <span className="settings-about-meta">
            Open overlay window separately from taskbar (it has skipTaskbar=true).
          </span>
        </p>
      </section>
    </div>
  );
}
