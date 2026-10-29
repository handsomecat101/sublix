import React from "react";
import type { MockVideoSource } from "../labMock";
import { formatDur, processingEstimate } from "../labModel";
import { OriginalRatioSlider } from "./OriginalRatioSlider";
import type { VoicePreset } from "../../../lib/tauri";

interface SourceStepProps {
  sources: MockVideoSource[];
  onAddSource: () => void;
  onAddStudioProject?: () => void;
  onRemoveSource: (id: string) => void;
  onMoveSource: (fromIdx: number, toIdx: number) => void;
  gameName: string;
  onChangeGameName: (name: string) => void;
  webSearch: boolean;
  onChangeWebSearch: (val: boolean) => void;
  targetMinutes: number;
  onChangeTargetMinutes: (mins: number) => void;
  originalRatio: number;
  onChangeOriginalRatio: (ratio: number) => void;
  voiceName: string;
  voices?: VoicePreset[];
  selectedVoiceId?: string;
  onChangeVoiceId?: (id: string) => void;
  isLlmReady?: boolean;
  llmProviderName?: string;
  onOpenSettings?: () => void;
  isMockMode?: boolean;
  onToggleMockMode?: () => void;
}

export const SourceStep: React.FC<SourceStepProps> = ({
  sources,
  onAddSource,
  onAddStudioProject,
  onRemoveSource,
  onMoveSource: _onMoveSource,
  gameName,
  onChangeGameName,
  webSearch,
  onChangeWebSearch,
  targetMinutes,
  onChangeTargetMinutes,
  originalRatio,
  onChangeOriginalRatio,
  voiceName,
  voices,
  selectedVoiceId,
  onChangeVoiceId,
  isLlmReady = true,
  llmProviderName = "MiniMax-M3",
  onOpenSettings,
  isMockMode = false,
  onToggleMockMode,
}) => {
  const totalInputSec = sources.reduce((sum, s) => sum + s.durationSec, 0);
  const estimate = processingEstimate(totalInputSec);

  return (
    <div className="lab-source-layout">
      {/* CỘT TRÁI: DANH SÁCH VIDEO NGUỒN */}
      <div className="lab-source-left">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
              Video gameplay nguồn ({sources.length} file)
            </h2>
            <span style={{ fontSize: "12px", color: "var(--t4)" }}>
              Thứ tự từ trên xuống dưới là thứ tự diễn biến cốt truyện
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="lab-btn-secondary" onClick={onAddSource} title="Chọn video từ máy tính">
              ＋ Thêm video
            </button>
            {onAddStudioProject && (
              <button
                type="button"
                className="lab-btn-secondary"
                onClick={onAddStudioProject}
                title="Sử dụng thoại và phụ đề đã nhận diện từ dự án Studio"
              >
                ＋ Từ Studio
              </button>
            )}
          </div>
        </div>

        <div className="lab-source-list">
          {sources.length === 0 ? (
            <div
              style={{
                padding: "36px 20px",
                textAlign: "center",
                color: "var(--t3)",
                border: "1px dashed var(--line)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "28px" }}>📁</div>
              <div style={{ fontWeight: 600 }}>Chưa có video nguồn nào</div>
              <div style={{ fontSize: "12px", color: "var(--t4)" }}>
                Nhấn <strong>＋ Thêm video</strong> để chọn file gameplay từ máy tính hoặc dự án Studio đã nhận dạng
              </div>
            </div>
          ) : (
            sources.map((src, idx) => (
              <div key={src.id} className="lab-source-card">
                <span style={{ color: "var(--t4)", cursor: "grab", textAlign: "center" }}>⠿</span>
                <span style={{ fontWeight: 800, color: "var(--ac-txt)", fontSize: "12px" }}>
                  #{idx + 1}
                </span>
                <div className="lab-source-thumb">
                  <span>{src.resolution}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span
                      className="lab-source-name"
                      title={src.path || src.name}
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {src.name}
                    </span>
                    {src.studioProjectName && (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          background: "rgba(56,189,248,0.12)",
                          color: "var(--ac-txt)",
                          border: "1px solid rgba(56,189,248,0.3)",
                        }}
                      >
                        Dự án Studio
                      </span>
                    )}
                    {src.hasSubtitles && (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          background: "rgba(74,222,128,0.12)",
                          color: "var(--ok-txt)",
                          border: "1px solid rgba(74,222,128,0.3)",
                        }}
                      >
                        Đã có thoại
                      </span>
                    )}
                  </div>
                  <span className="lab-source-meta">
                    {formatDur(src.durationSec)} · {(src.sizeMb / 1024).toFixed(1)} GB · {src.fps} fps
                  </span>
                </div>
                <button
                  type="button"
                  className="lab-banner-close"
                  onClick={() => onRemoveSource(src.id)}
                  title="Xoá video"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* ƯỚC LƯỢNG THỜI GIAN XỬ LÝ */}
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            background:
              estimate.level === "danger"
                ? "rgba(239, 68, 68, 0.08)"
                : estimate.level === "warn"
                ? "rgba(234, 179, 8, 0.08)"
                : "rgba(255, 255, 255, 0.03)",
            border: `1px solid ${
              estimate.level === "danger"
                ? "var(--dang-br, rgba(239, 68, 68, 0.3))"
                : estimate.level === "warn"
                ? "var(--warn-br, rgba(234, 179, 8, 0.3))"
                : "var(--line)"
            }`,
            fontSize: "12.5px",
            color:
              estimate.level === "danger"
                ? "var(--dang-txt)"
                : estimate.level === "warn"
                ? "var(--warn-txt)"
                : "var(--t3)",
          }}
        >
          ⏱ <strong>Tổng thời lượng:</strong> {formatDur(totalInputSec)} — {estimate.summaryVi}
        </div>
      </div>

      {/* CỘT PHẢI: TUỲ CHỌN DỰNG KỊCH BẢN */}
      <div className="lab-source-right">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
            Tuỳ chọn dựng kịch bản
          </h3>
          {onToggleMockMode && (
            <button
              type="button"
              onClick={onToggleMockMode}
              title="Chuyển đổi dữ liệu mẫu (mock) cho kiểm thử giao diện"
              style={{
                fontSize: "10.5px",
                padding: "3px 8px",
                borderRadius: "6px",
                border: isMockMode ? "1px solid rgba(234, 179, 8, 0.4)" : "1px solid var(--line)",
                background: isMockMode ? "rgba(234, 179, 8, 0.12)" : "transparent",
                color: isMockMode ? "var(--warn-txt)" : "var(--t4)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {isMockMode ? "🧪 Mock: BẬT" : "⚡ Mock: TẮT"}
            </button>
          )}
        </div>

        {/* 1. Tên Game & Tra cứu web */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--t2)" }}>
            Tên tựa game
          </label>
          <input
            type="text"
            value={gameName}
            onChange={(e) => onChangeGameName(e.target.value)}
            placeholder="Ví dụ: Elden Ring, Black Myth Wukong..."
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              background: "var(--bg-card)",
              border: "1px solid var(--line)",
              color: "var(--t1)",
              fontSize: "13.5px",
              outline: "none",
            }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "12px", color: "var(--t3)", marginTop: 4, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={webSearch}
              onChange={(e) => onChangeWebSearch(e.target.checked)}
              style={{ accentColor: "var(--ac)" }}
            />
            <span>Tra cứu bối cảnh & cốt truyện trên mạng (Tavily Search)</span>
          </label>
        </div>

        {/* 2. Độ dài đích */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--t2)" }}>
            Độ dài video đích
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {[5, 10, 15, 20].map((mins) => (
              <button
                key={mins}
                type="button"
                className="lab-btn-secondary"
                style={{
                  justifyContent: "center",
                  fontWeight: targetMinutes === mins ? 800 : 500,
                  borderColor: targetMinutes === mins ? "var(--ac-br)" : "var(--line)",
                  background: targetMinutes === mins ? "var(--ac-soft)" : "var(--bg-card)",
                  color: targetMinutes === mins ? "var(--ac-txt)" : "var(--t2)",
                }}
                onClick={() => onChangeTargetMinutes(mins)}
              >
                {mins} phút
              </button>
            ))}
          </div>
        </div>

        {/* 3. Giọng đọc */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--t2)" }}>
              Giọng đọc thuyết minh
            </label>
            <span style={{ fontSize: "11px", color: "var(--t4)" }}>
              {voices && voices.length > 0 ? `${voices.length} giọng sẵn sàng` : voiceName}
            </span>
          </div>
          {voices && voices.length > 0 ? (
            <select
              value={selectedVoiceId || voices[0]?.id}
              onChange={(e) => onChangeVoiceId?.(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                background: "var(--bg-card)",
                border: "1px solid var(--line)",
                color: "var(--t1)",
                fontSize: "13px",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  🎙 {v.name} ({v.lang}) — {v.gender === "female" ? "Nữ" : "Nam"}{v.description ? ` · ${v.description}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: "8px",
                background: "var(--bg-card)",
                border: "1px solid var(--line)",
                fontSize: "13px",
              }}
            >
              <span>🎙 {voiceName} (Tiếng Việt truyền cảm)</span>
            </div>
          )}
        </div>

        {/* 4. Tỷ lệ thoại gốc */}
        <OriginalRatioSlider
          ratio={originalRatio}
          onChange={onChangeOriginalRatio}
          targetDurationSec={targetMinutes * 60}
        />

        {/* 5. Thông tin AI Provider */}
        <div
          style={{
            marginTop: "auto",
            padding: "10px 14px",
            borderRadius: "8px",
            background: !isLlmReady && !isMockMode ? "rgba(239, 68, 68, 0.1)" : "rgba(0,0,0,0.25)",
            border: `1px solid ${
              !isLlmReady && !isMockMode
                ? "var(--dang-br, rgba(239, 68, 68, 0.3))"
                : "rgba(255,255,255,0.04)"
            }`,
            fontSize: "12px",
            color: !isLlmReady && !isMockMode ? "var(--dang-txt)" : "var(--t3)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            {!isLlmReady && !isMockMode ? (
              <>⚠ <strong>Chưa cấu hình AI:</strong> Cần MiniMax-M3 API key hoặc Ollama 27B</>
            ) : (
              <>✦ AI viết lời: <strong>{llmProviderName} · tiếng Việt</strong></>
            )}
          </span>
          <span
            style={{ color: "var(--ac-txt)", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}
            onClick={onOpenSettings}
          >
            Cài đặt ›
          </span>
        </div>
      </div>
    </div>
  );
};
