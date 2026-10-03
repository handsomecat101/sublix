//! Sublix AI Dubbing Studio View — Multi-Speaker AI Dubbing, Scriptwriting & Voice Synthesis.

import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  sublix,
  type DubbingProject,
  type DubbingSegment,
  type DubbingProgress,
  type VoicePreset,
} from "../lib/tauri";
import "./DubbingStudioView.css";

interface DubbingStudioViewProps {
  defaultSourceLang?: string;
}

export default function DubbingStudioView({
  defaultSourceLang = "en",
}: DubbingStudioViewProps) {
  const [filePath, setFilePath] = useState<string>("");
  const [sourceLang, setSourceLang] = useState<string>(defaultSourceLang);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [rendering, setRendering] = useState<boolean>(false);
  const [progress, setProgress] = useState<DubbingProgress | null>(null);
  const [project, setProject] = useState<DubbingProject | null>(null);
  const [voices, setVoices] = useState<VoicePreset[]>([]);
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    sublix.dubbingGetVoices().then(setVoices).catch((err) => {
      console.warn("Failed to load voices:", err);
    });

    let unlistenProgress: (() => void) | undefined;
    (async () => {
      unlistenProgress = await listen<DubbingProgress>("dubbing:progress", (event) => {
        setProgress(event.payload);
      });
    })();

    return () => {
      if (unlistenProgress) unlistenProgress();
    };
  }, []);

  async function handleSelectFile() {
    try {
      const picked = await sublix.dubbingPickMediaFile();
      if (picked) {
        setFilePath(picked);
        setProject(null);
        setExportPath(null);
        setStatusMessage({ kind: "info", text: `Đã chọn tệp: ${picked.split(/[\\/]/).pop()}` });
      }
    } catch (err) {
      setStatusMessage({ kind: "error", text: `Lỗi chọn file: ${err}` });
    }
  }

  async function handleAnalyze() {
    if (!filePath) {
      setStatusMessage({ kind: "error", text: "Vui lòng chọn tệp video hoặc audio trước." });
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
      const proj = await sublix.dubbingAnalyze(filePath, sourceLang);
      setProject(proj);
      setStatusMessage({
        kind: "success",
        text: `✅ Phân tích thành công! Phát hiện ${proj.speakers.length} vai nhân vật và ${proj.segments.length} câu thoại.`,
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

  return (
    <div className="dubbing-studio-container">
      {/* Hidden audio element for instant playback */}
      <audio ref={audioRef} src={audioUrl || undefined} style={{ display: "none" }} />

      {/* Header Banner */}
      <div className="dubbing-header">
        <div>
          <h1 className="dubbing-title">🎬 Studio Lồng Tiếng AI (AI Dubbing)</h1>
          <p className="dubbing-subtitle">
            Tự động tách câu, nhận diện người nói (Diarization), biên kịch lời thoại điện ảnh (MiniMax-M3 / Ollama 27B) và lồng giọng đa vai khớp mốc thời gian.
          </p>
        </div>
        <div className="dubbing-badges">
          <span className="dubbing-badge badge-blue">⚡ Whisper Large-v3-Turbo</span>
          <span className="dubbing-badge badge-purple">🧠 MiniMax-M3 / Ollama 27B</span>
          <span className="dubbing-badge badge-green">🎙️ Neural Voice Cloning</span>
        </div>
      </div>

      {/* Notification Banner */}
      {statusMessage && (
        <div className={`dubbing-alert dubbing-alert-${statusMessage.kind}`}>
          {statusMessage.text}
        </div>
      )}

      {/* Section 1: File Selection & Initiation */}
      <div className="dubbing-card">
        <h2 className="dubbing-card-title">1. Chọn Video / Audio Cần Lồng Tiếng</h2>
        <div className="dubbing-row" style={{ gap: 10, alignItems: "center" }}>
          <input
            type="text"
            readOnly
            value={filePath}
            placeholder="Chưa chọn tệp... (hỗ trợ MP4, MKV, AVI, MOV, MP3, WAV)"
            className="dubbing-input"
            style={{ flex: 1, cursor: "pointer" }}
            onClick={handleSelectFile}
          />
          <button
            type="button"
            className="dubbing-btn dubbing-btn-secondary"
            onClick={handleSelectFile}
            disabled={analyzing || rendering}
          >
            📂 Chọn Tệp
          </button>
        </div>

        <div className="dubbing-row" style={{ marginTop: 14, gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, color: "#94a3b8" }}>Ngôn ngữ gốc:</label>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="dubbing-select"
              disabled={analyzing || rendering}
            >
              <option value="auto">🌐 Tự động nhận diện</option>
              <option value="en">🇺🇸 Tiếng Anh (English)</option>
              <option value="ja">🇯🇵 Tiếng Nhật (Japanese)</option>
              <option value="zh">🇨🇳 Tiếng Trung (Chinese)</option>
              <option value="ko">🇰🇷 Tiếng Hàn (Korean)</option>
            </select>
          </div>

          <button
            type="button"
            className="dubbing-btn dubbing-btn-primary"
            onClick={handleAnalyze}
            disabled={!filePath || analyzing || rendering}
            style={{ marginLeft: "auto" }}
          >
            {analyzing ? "⏳ Đang Phân Tích & Dịch Kịch Bản..." : "🚀 Bắt Đầu Phân Tích & Lập Kịch Bản"}
          </button>
        </div>

        {/* Real-time Progress Bar */}
        {(analyzing || rendering) && progress && (
          <div className="dubbing-progress-box">
            <div className="dubbing-progress-header">
              <span className="dubbing-progress-msg">{progress.message}</span>
              <span className="dubbing-progress-percent">{Math.round(progress.percent)}%</span>
            </div>
            <div className="dubbing-progress-bar-bg">
              <div
                className="dubbing-progress-bar-fill"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Speaker Casting & Voice Settings */}
      {project && (
        <div className="dubbing-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 className="dubbing-card-title" style={{ margin: 0 }}>
              2. Phân Vai Diễn Viên Lồng Tiếng (Speaker Casting)
            </h2>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                Thời lượng: ~{Math.round(project.media_duration_sec)}s • {project.segments.length} câu thoại
              </span>
            </div>
          </div>

          {/* Speakers List */}
          <div className="dubbing-speakers-grid">
            {project.speakers.map((spk, idx) => (
              <div key={spk.id} className="dubbing-speaker-card">
                <div className="dubbing-speaker-header">
                  <span className={`dubbing-speaker-avatar speaker-avatar-${idx % 4}`}>
                    {idx === 0 ? "👨" : idx === 1 ? "👩" : "👤"}
                  </span>
                  <input
                    type="text"
                    value={spk.label}
                    onChange={(e) => handleUpdateSpeakerLabel(spk.id, e.target.value)}
                    className="dubbing-speaker-label-input"
                  />
                </div>

                <div style={{ marginTop: 10 }}>
                  <label className="dubbing-label-small">Giọng Đọc AI (Voice):</label>
                  <select
                    value={spk.voice}
                    onChange={(e) => handleUpdateSpeakerVoice(spk.id, e.target.value)}
                    className="dubbing-select"
                    style={{ width: "100%", marginTop: 4 }}
                  >
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.lang.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
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

      {/* Section 3: Interactive Dialogue Script Table */}
      {project && (
        <div className="dubbing-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 className="dubbing-card-title" style={{ margin: 0 }}>
              3. Kịch Bản Thoại & Tinh Chỉnh (Script Editor)
            </h2>
            <span style={{ fontSize: 12, color: "#60a5fa" }}>
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
                  <th>Câu Lồng Tiếng Điện Ảnh (VI)</th>
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
            <div>
              {exportPath && (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#34d399", fontWeight: 600 }}>
                    ✅ Đã xuất: {exportPath.split(/[\\/]/).pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => sublix.revealInExplorer(exportPath)}
                    className="dubbing-btn dubbing-btn-secondary"
                    style={{ fontSize: 12, padding: "6px 12px" }}
                  >
                    📁 Mở Thư Mục
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleExportVideo}
              disabled={rendering || analyzing}
              className="dubbing-btn dubbing-btn-export"
            >
              {rendering ? "⏳ Đang Ghép Audio & Xuất Video..." : "🎬 Xuất Video Lồng Tiếng Hoàn Chỉnh"}
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
