//! File Subtitle Studio View — Offline video & audio subtitle generation (.srt)
//!
//! Powered by:
//! - ffmpeg: 16kHz mono audio extraction
//! - whisper-cli: GPU-accelerated timestamped transcription
//! - llama-server: GPU-accelerated local LLM Vietnamese translation (Qwen3-4B / Gemma 3)
//! - Direct VLC playback integration & Explorer file reveal

import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  sublix,
  type FileSubProgress,
  type FileSubResult,
  type ModelStatusItem,
} from "../lib/tauri";
import "./FileSubView.css";

interface SubtitlePreviewItem {
  id: number;
  original: string;
  translated: string;
}

interface FileSubViewProps {
  sttModels: ModelStatusItem[];
  transModels: ModelStatusItem[];
  defaultSttModel?: string;
  defaultTransModel?: string;
}

export default function FileSubView({
  sttModels,
  transModels,
  defaultSttModel = "large-v3-turbo-q8_0",
  defaultTransModel = "qwen3-4b",
}: FileSubViewProps) {
  const [filePath, setFilePath] = useState<string>("");
  const [sourceLang, setSourceLang] = useState<string>("en");
  const [targetLang, setTargetLang] = useState<string>("vi");
  const [createBilingual, setCreateBilingual] = useState<boolean>(true);
  const [selectedStt, setSelectedStt] = useState<string>(defaultSttModel);
  const [selectedTrans, setSelectedTrans] = useState<string>(defaultTransModel);

  const [processing, setProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<FileSubProgress | null>(null);
  const [result, setResult] = useState<FileSubResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewList, setPreviewList] = useState<SubtitlePreviewItem[]>([]);
  const previewEndRef = useRef<HTMLDivElement>(null);

  // Listen to live progress events from Rust
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;

    (async () => {
      unlistenProgress = await listen<FileSubProgress>("file_sub:progress", (event) => {
        const p = event.payload;
        setProgress(p);

        if (p.current_original && p.current_translated) {
          setPreviewList((prev) => {
            const next = [
              ...prev,
              {
                id: p.current_segment,
                original: p.current_original!,
                translated: p.current_translated!,
              },
            ];
            // keep latest 30 for performance
            return next.length > 50 ? next.slice(next.length - 50) : next;
          });
        }
      });

      unlistenComplete = await listen<FileSubResult>("file_sub:complete", (event) => {
        setResult(event.payload);
        setProcessing(false);
      });
    })();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
    };
  }, []);

  // Auto-scroll preview
  useEffect(() => {
    previewEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [previewList]);

  const handlePickFile = async () => {
    try {
      const selected = await sublix.selectMediaFile();
      if (selected) {
        setFilePath(selected);
        setResult(null);
        setErrorMsg(null);
        setProgress(null);
        setPreviewList([]);
      }
    } catch (e) {
      setErrorMsg(`Không thể chọn file: ${e}`);
    }
  };

  const handleStartGeneration = async () => {
    if (!filePath) {
      setErrorMsg("Vui lòng chọn file Video hoặc Audio trước khi bắt đầu.");
      return;
    }

    setProcessing(true);
    setErrorMsg(null);
    setResult(null);
    setProgress({
      stage: "starting",
      message: "Đang khởi động tiến trình GPU...",
      percent: 2.0,
      current_segment: 0,
      total_segments: 0,
      current_original: null,
      current_translated: null,
    });
    setPreviewList([]);

    try {
      const res = await sublix.generateFileSubtitles({
        inputPath: filePath,
        sourceLang: sourceLang === "auto" ? undefined : sourceLang,
        targetLang,
        createBilingual,
        sttModelName: selectedStt,
        translationModelName: selectedTrans,
      });
      setResult(res);
      setProcessing(false);
    } catch (e: any) {
      setProcessing(false);
      setErrorMsg(typeof e === "string" ? e : e?.message || String(e));
    }
  };

  const fileName = filePath ? filePath.split(/[/\\]/).pop() : "";

  return (
    <div className="file-sub-container">
      {/* Header Info */}
      <div className="file-sub-intro">
        <h2>📁 File Subtitle Studio — Tạo Phụ Đề Rời Cho Video & Audio</h2>
        <p>
          Tự động trích xuất âm thanh, nhận diện chuẩn xác từng câu kèm mốc thời gian bằng <strong>Whisper GPU</strong>, 
          và dịch thuật tự nhiên sang Tiếng Việt bằng <strong>Local LLM GPU</strong> (100% offline, miễn phí vĩnh viễn trên RTX 3090).
        </p>
      </div>

      {/* Step 1: File Selection */}
      <div className="file-sub-card">
        <div className="file-sub-card-title">
          <span className="step-badge">1</span>
          <span>Chọn Video hoặc Audio cần tạo phụ đề</span>
        </div>

        <div className="file-picker-row">
          <button
            type="button"
            className="settings-btn-primary file-browse-btn"
            onClick={handlePickFile}
            disabled={processing}
          >
            📂 Chọn File Media...
          </button>
          <div className="file-selected-path" title={filePath || "Chưa chọn file nào"}>
            {filePath ? (
              <span className="file-has-path">
                🎬 <strong>{fileName}</strong>
                <span className="file-full-path">{filePath}</span>
              </span>
            ) : (
              <span className="file-placeholder">
                Hỗ trợ MP4, MKV, AVI, MOV, WEBM, MP3, M4A, WAV, FLAC...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Step 2: Configuration */}
      <div className="file-sub-card">
        <div className="file-sub-card-title">
          <span className="step-badge">2</span>
          <span>Cấu hình ngôn ngữ & AI</span>
        </div>

        <div className="file-config-grid">
          <div className="file-config-item">
            <label>Ngôn ngữ gốc trong file:</label>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="settings-select"
              disabled={processing}
            >
              <option value="en">🇺🇸 Tiếng Anh (English)</option>
              <option value="ja">🇯🇵 Tiếng Nhật (Japanese)</option>
              <option value="zh">🇨🇳 Tiếng Trung (Chinese)</option>
              <option value="ko">🇰🇷 Tiếng Hàn (Korean)</option>
              <option value="fr">🇫🇷 Tiếng Pháp (French)</option>
              <option value="de">🇩🇪 Tiếng Đức (German)</option>
              <option value="ru">🇷🇺 Tiếng Nga (Russian)</option>
              <option value="es">🇪🇸 Tiếng Tây Ban Nha (Spanish)</option>
              <option value="auto">🌐 Tự động nhận diện (Auto-detect)</option>
            </select>
          </div>

          <div className="file-config-item">
            <label>Dịch sang ngôn ngữ:</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="settings-select"
              disabled={processing}
            >
              <option value="vi">🇻🇳 Tiếng Việt (Vietnamese)</option>
              <option value="en">🇺🇸 Tiếng Anh (English)</option>
            </select>
          </div>

          <div className="file-config-item">
            <label>Model Nhận diện giọng nói (STT):</label>
            <select
              value={selectedStt}
              onChange={(e) => setSelectedStt(e.target.value)}
              className="settings-select"
              disabled={processing}
            >
              {sttModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.label} ({m.size_mb} MB) {m.downloaded ? "✓ Có sẵn" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="file-config-item">
            <label>Model Dịch thuật (Local LLM):</label>
            <select
              value={selectedTrans}
              onChange={(e) => setSelectedTrans(e.target.value)}
              className="settings-select"
              disabled={processing}
            >
              {transModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.label} ({m.size_mb} MB) {m.downloaded ? "✓ Có sẵn" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="file-sub-checkbox-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={createBilingual}
              onChange={(e) => setCreateBilingual(e.target.checked)}
              disabled={processing}
            />
            <span>
              <strong>Tạo thêm file phụ đề Song ngữ (*.bilingual.srt)</strong> — Dòng trên tiếng gốc, dòng dưới tiếng Việt (Rất tốt cho việc học ngoại ngữ).
            </span>
          </label>
        </div>
      </div>

      {/* Step 3: Run Action Button */}
      <div className="file-sub-action-row">
        <button
          type="button"
          className="settings-btn-primary file-run-btn"
          onClick={handleStartGeneration}
          disabled={processing || !filePath}
        >
          {processing ? (
            <>⏳ Đang xử lý... ({progress ? Math.round(progress.percent) : 0}%)</>
          ) : (
            <>🚀 Bắt Đầu Tạo Phụ Đề Cho File (GPU RTX 3090)</>
          )}
        </button>
      </div>

      {/* Error display */}
      {errorMsg && (
        <div className="file-sub-error">
          <strong>Lỗi:</strong> {errorMsg}
        </div>
      )}

      {/* Live Progress Bar & Status */}
      {progress && (
        <div className="file-sub-progress-card">
          <div className="progress-header">
            <span className="progress-stage-name">
              {progress.stage === "extracting" && "🎬 Bước 1/3: Trích xuất âm thanh 16kHz mono..."}
              {progress.stage === "transcribing" && "🎙️ Bước 2/3: Whisper GPU đang nhận diện lời thoại & mốc thời gian..."}
              {progress.stage === "translating" && `🌐 Bước 3/3: LLM GPU đang dịch thuật (${progress.current_segment}/${progress.total_segments} câu)...`}
              {progress.stage === "saving" && "💾 Đang xuất các file phụ đề .SRT..."}
              {progress.stage === "done" && "🎉 Hoàn tất 100%!"}
              {progress.stage === "starting" && "⚡ Đang khởi tạo..."}
            </span>
            <span className="progress-percent">{Math.round(progress.percent)}%</span>
          </div>

          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(100, Math.max(2, progress.percent))}%` }}
            />
          </div>

          <div className="progress-detail-message">{progress.message}</div>
        </div>
      )}

      {/* Real-time Subtitle Stream Preview */}
      {previewList.length > 0 && (
        <div className="file-sub-preview-card">
          <div className="preview-card-title">
            <span>👁️ Xem trước nội dung phụ đề đang dịch theo thời gian thực:</span>
            <span className="preview-counter">{previewList.length} câu</span>
          </div>
          <div className="preview-scroll-area">
            {previewList.map((item) => (
              <div key={item.id} className="preview-item">
                <span className="preview-item-num">#{item.id}</span>
                <div className="preview-item-text">
                  <div className="preview-item-trans">{item.translated}</div>
                  <div className="preview-item-orig">{item.original}</div>
                </div>
              </div>
            ))}
            <div ref={previewEndRef} />
          </div>
        </div>
      )}

      {/* Completion & Quick Launch Actions */}
      {result && (
        <div className="file-sub-result-card">
          <div className="result-header">
            <span className="result-check">✓</span>
            <div>
              <h3>Tạo phụ đề hoàn tất!</h3>
              <p>
                Đã xử lý <strong>{result.total_segments} câu thoại</strong> trong{" "}
                <strong>{result.elapsed_seconds.toFixed(1)} giây</strong>.
              </p>
            </div>
          </div>

          <div className="result-file-list">
            <div className="result-file-item">
              <span className="result-tag">Phụ đề Tiếng Việt</span>
              <code>{result.vi_srt_path}</code>
            </div>
            {result.bilingual_srt_path && (
              <div className="result-file-item">
                <span className="result-tag">Phụ đề Song ngữ</span>
                <code>{result.bilingual_srt_path}</code>
              </div>
            )}
            <div className="result-file-item">
              <span className="result-tag">Phụ đề Gốc</span>
              <code>{result.original_srt_path}</code>
            </div>
          </div>

          <div className="result-actions">
            <button
              type="button"
              className="settings-btn-primary"
              onClick={async () => {
                try {
                  await sublix.playInVlc(result.input_path, result.vi_srt_path);
                } catch (e) {
                  setErrorMsg(`Không thể mở VLC: ${e}`);
                }
              }}
            >
              🎬 Mở xem ngay bằng VLC Media Player
            </button>

            {result.bilingual_srt_path && (
              <button
                type="button"
                className="settings-btn-secondary"
                onClick={async () => {
                  try {
                    await sublix.playInVlc(result.input_path, result.bilingual_srt_path!);
                  } catch (e) {
                    setErrorMsg(`Không thể mở VLC: ${e}`);
                  }
                }}
              >
                👥 Xem bản Song ngữ bằng VLC
              </button>
            )}

            <button
              type="button"
              className="settings-btn-secondary"
              onClick={async () => {
                try {
                  await sublix.revealInExplorer(result.vi_srt_path);
                } catch (e) {
                  setErrorMsg(`Không thể mở Explorer: ${e}`);
                }
              }}
            >
              📂 Mở thư mục chứa file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
