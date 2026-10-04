//! File Subtitle Studio View — Offline video & audio subtitle generation (.srt)
//!
//! Powered by:
//! - ffmpeg: 16kHz mono audio extraction
//! - whisper-cli: GPU-accelerated timestamped transcription
//! - llama-server: GPU-accelerated local LLM Vietnamese translation (Qwen3-4B / Gemma 3)
//! - Direct VLC playback integration & Explorer file reveal

import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  sublix,
  type FileSubProgress,
  type FileSubResult,
  type ModelStatusItem,
} from "../lib/tauri";
import { CustomSelect, type SelectOption } from "./CustomSelect";
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

const SOURCE_LANG_OPTIONS: SelectOption[] = [
  { value: "en", label: "Tiếng Anh (English)", icon: "🇺🇸" },
  { value: "ja", label: "Tiếng Nhật (Japanese)", icon: "🇯🇵" },
  { value: "zh", label: "Tiếng Trung (Chinese)", icon: "🇨🇳" },
  { value: "ko", label: "Tiếng Hàn (Korean)", icon: "🇰🇷" },
  { value: "fr", label: "Tiếng Pháp (French)", icon: "🇫🇷" },
  { value: "de", label: "Tiếng Đức (German)", icon: "🇩🇪" },
  { value: "ru", label: "Tiếng Nga (Russian)", icon: "🇷🇺" },
  { value: "es", label: "Tiếng Tây Ban Nha (Spanish)", icon: "🇪🇸" },
  { value: "auto", label: "Tự động nhận diện (Auto-detect)", icon: "🌐", badge: "Auto" },
];

const TARGET_LANG_OPTIONS: SelectOption[] = [
  { value: "vi", label: "Tiếng Việt (Vietnamese)", icon: "🇻🇳" },
  { value: "en", label: "Tiếng Anh (English)", icon: "🇺🇸" },
];

export default function FileSubView({
  sttModels,
  transModels,
  defaultSttModel = "large-v3-turbo-q8_0",
  defaultTransModel = "qwen3-4b",
}: FileSubViewProps) {
  const [filePath, setFilePath] = useState<string>("" );
  const [sourceLang, setSourceLang] = useState<string>("en");
  const [targetLang, setTargetLang] = useState<string>("vi");
  const [createBilingual, setCreateBilingual] = useState<boolean>(true);
  const [selectedStt, setSelectedStt] = useState<string>(defaultSttModel);
  const [selectedTrans, setSelectedTrans] = useState<string>(defaultTransModel);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [processing, setProcessing] = useState<boolean>(false);
  const processingRef = useRef<boolean>(processing);
  processingRef.current = processing;

  const [progress, setProgress] = useState<FileSubProgress | null>(null);
  const [result, setResult] = useState<FileSubResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewList, setPreviewList] = useState<SubtitlePreviewItem[]>([]);
  const previewEndRef = useRef<HTMLDivElement>(null);

  // Helper to test if file is video
  const isVideo = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    return ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "ts"].includes(ext);
  };

  const handleSetSelectedFile = (path: string) => {
    if (processingRef.current) {
      console.warn("Processing in progress, ignoring file change");
      return;
    }
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const validExts = [
      "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "ts",
      "mp3", "m4a", "wav", "flac", "ogg", "aac", "wma"
    ];
    if (ext && validExts.includes(ext)) {
      setFilePath(path);
      setResult(null);
      setErrorMsg(null);
      setProgress(null);
      setPreviewList([]);
    } else {
      setErrorMsg(`Định dạng .${ext} không được hỗ trợ. Vui lòng chọn tệp Video hoặc Audio.`);
    }
  };

  // Drag & Drop Listener via Tauri API
  useEffect(() => {
    const pDragDrop = (async () => {
      try {
        const webview = getCurrentWebview();
        return await webview.onDragDropEvent((event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDragging(true);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            if (processingRef.current) {
              console.warn("Processing in progress, ignoring dropped file");
              return;
            }
            const droppedPaths = event.payload.paths;
            if (droppedPaths && droppedPaths.length > 0) {
              handleSetSelectedFile(droppedPaths[0]);
            }
          } else {
            setIsDragging(false);
          }
        });
      } catch (err) {
        console.warn("Tauri onDragDropEvent listener failed:", err);
        return () => {};
      }
    })();

    return () => {
      pDragDrop.then((u) => {
        if (typeof u === "function") u();
      }).catch(() => {});
    };
  }, []);

  // Listen to live progress events from Rust
  useEffect(() => {
    const pProgress = listen<FileSubProgress>("file_sub:progress", (event) => {
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
          // keep latest 50 for performance
          return next.length > 50 ? next.slice(next.length - 50) : next;
        });
      }
    });

    const pComplete = listen<FileSubResult>("file_sub:complete", (event) => {
      setResult(event.payload);
      setProcessing(false);
    });

    return () => {
      pProgress.then((u) => u()).catch(() => {});
      pComplete.then((u) => u()).catch(() => {});
    };
  }, []);

  // Auto-scroll preview
  useEffect(() => {
    previewEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [previewList]);

  const handlePickFile = async () => {
    if (processingRef.current) return;
    try {
      const selected = await sublix.selectMediaFile();
      if (selected) {
        handleSetSelectedFile(selected);
      }
    } catch (e) {
      setErrorMsg(`Không thể chọn file: ${e}`);
    }
  };

  const handleStartGeneration = async () => {
    if (!filePath) {
      setErrorMsg("Vui lòng kéo thả hoặc chọn file Video / Audio trước khi bắt đầu.");
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

  const fileName = filePath ? filePath.split(/[/\\]/).pop() || "" : "";
  const fileExt = filePath ? filePath.split(".").pop()?.toUpperCase() || "" : "";

  // Prepare STT model options
  const sttOptions: SelectOption[] = sttModels.map((m) => ({
    value: m.name,
    label: m.label,
    icon: "🎙️",
    badge: m.downloaded ? "✓ Sẵn sàng" : "Chưa tải",
    sublabel: `${m.size_mb} MB`,
  }));

  // Prepare Translation model options
  const transOptions: SelectOption[] = transModels.map((m) => ({
    value: m.name,
    label: m.label,
    icon: "🤖",
    badge: m.downloaded ? "✓ Sẵn sàng" : "Chưa tải",
    sublabel: `${m.size_mb} MB`,
  }));

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

      {/* Step 1: File Selection & Drag-and-Drop Area */}
      <div className="file-sub-card">
        <div className="file-sub-card-title">
          <span className="step-badge">1</span>
          <span>Chọn hoặc Kéo Thả File Video / Audio</span>
        </div>

        {!filePath ? (
          <div
            className={`file-dropzone ${isDragging ? "is-drag-over" : ""}`}
            onClick={handlePickFile}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                const f = e.dataTransfer.files[0];
                const p = (f as any).path || f.name;
                if (p) handleSetSelectedFile(p);
              }
            }}
          >
            <div className="dropzone-icon-box">
              <span className="dropzone-main-icon">{isDragging ? "📥" : "🎞️"}</span>
            </div>
            <div className="dropzone-content">
              <div className="dropzone-headline">
                {isDragging ? "Thả file vào đây ngay!" : "Kéo thả file Video hoặc Audio vào đây"}
              </div>
              <div className="dropzone-subline">
                hoặc <span className="dropzone-browse-link">Bấm vào đây để duyệt file từ máy tính</span>
              </div>
            </div>
            <div className="dropzone-format-tags">
              {["MP4", "MKV", "MOV", "AVI", "WEBM", "MP3", "WAV", "FLAC"].map((ext) => (
                <span key={ext} className="dropzone-tag">
                  {ext}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="file-active-card">
            <div className="file-active-icon-wrapper">
              <span className="file-active-icon">{isVideo(filePath) ? "🎬" : "🎵"}</span>
            </div>
            <div className="file-active-info">
              <div className="file-active-title-row">
                <span className="file-active-name" title={fileName}>
                  {fileName}
                </span>
                <span className="file-active-ext-badge">{fileExt}</span>
              </div>
              <div className="file-active-path" title={filePath}>
                {filePath}
              </div>
            </div>
            <div className="file-active-actions">
              <button
                type="button"
                className="file-active-btn btn-change"
                onClick={handlePickFile}
                disabled={processing}
                title="Chọn tệp khác"
              >
                🔄 Đổi file
              </button>
              <button
                type="button"
                className="file-active-btn btn-remove"
                onClick={() => {
                  if (!processing) {
                    setFilePath("");
                    setResult(null);
                    setProgress(null);
                    setPreviewList([]);
                  }
                }}
                disabled={processing}
                title="Bỏ chọn tệp này"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Configuration */}
      <div className="file-sub-card">
        <div className="file-sub-card-title">
          <span className="step-badge">2</span>
          <span>Cấu hình ngôn ngữ & Bộ mô hình AI</span>
        </div>

        {/* Quick Language Preset Pills */}
        <div className="file-lang-presets">
          <span className="preset-label">⚡ Cặp dịch nhanh:</span>
          {[
            { s: "en", t: "vi", label: "🇺🇸 ➔ 🇻🇳 Anh - Việt" },
            { s: "ja", t: "vi", label: "🇯🇵 ➔ 🇻🇳 Nhật - Việt" },
            { s: "zh", t: "vi", label: "🇨🇳 ➔ 🇻🇳 Trung - Việt" },
            { s: "ko", t: "vi", label: "🇰🇷 ➔ 🇻🇳 Hàn - Việt" },
            { s: "auto", t: "vi", label: "🌐 ➔ 🇻🇳 Tự nhận diện" },
          ].map((pair) => (
            <button
              key={`${pair.s}-${pair.t}`}
              type="button"
              className={`preset-chip ${sourceLang === pair.s && targetLang === pair.t ? "is-active" : ""}`}
              onClick={() => {
                setSourceLang(pair.s);
                setTargetLang(pair.t);
              }}
              disabled={processing}
            >
              {pair.label}
            </button>
          ))}
        </div>

        <div className="file-config-grid">
          <div className="file-config-item">
            <CustomSelect
              label="Ngôn ngữ gốc trong file:"
              value={sourceLang}
              options={SOURCE_LANG_OPTIONS}
              onChange={setSourceLang}
              disabled={processing}
            />
          </div>

          <div className="file-config-item">
            <CustomSelect
              label="Dịch sang ngôn ngữ:"
              value={targetLang}
              options={TARGET_LANG_OPTIONS}
              onChange={setTargetLang}
              disabled={processing}
            />
          </div>

          <div className="file-config-item">
            <CustomSelect
              label="Model Nhận diện giọng nói (STT):"
              value={selectedStt}
              options={sttOptions}
              onChange={setSelectedStt}
              disabled={processing}
            />
          </div>

          <div className="file-config-item">
            <CustomSelect
              label="Model Dịch thuật (Local LLM):"
              value={selectedTrans}
              options={transOptions}
              onChange={setSelectedTrans}
              disabled={processing}
            />
          </div>
        </div>

        {/* Modern Toggle Switch for Bilingual Subtitles */}
        <div className="file-sub-bilingual-row">
          <label className="toggle-switch-wrapper">
            <div className="toggle-switch">
              <input
                type="checkbox"
                checked={createBilingual}
                onChange={(e) => setCreateBilingual(e.target.checked)}
                disabled={processing}
              />
              <span className="toggle-slider" />
            </div>
            <div className="toggle-label-content">
              <span className="toggle-title">
                Tạo thêm file phụ đề Song ngữ (<code>*.bilingual.srt</code>)
              </span>
              <span className="toggle-desc">
                Dòng trên hiển thị tiếng gốc, dòng dưới tiếng Việt (rất tốt khi học ngoại ngữ hoặc xem phim rạp).
              </span>
            </div>
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
          <span className="error-icon">⚠️</span>
          <div className="error-body">
            <strong>Thông báo:</strong> {errorMsg}
          </div>
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
