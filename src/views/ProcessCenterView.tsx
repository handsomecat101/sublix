//! ProcessCenterView.tsx — Dedicated Process & Activity Center View within StudioShell.
//! Allows monitoring active and historical background tasks across Sublix with real-time pipeline status.

import { useState, useEffect } from "react";
import {
  IconFilm,
  IconClapper,
  IconGlobe,
  IconBox,
  IconClock,
  IconFolder,
  IconTrash,
  IconCheck,
  IconSettings,
} from "../icons";
import { sublix } from "../lib/tauri";
import { StudioShell, ShellCard } from "./StudioShell";
import type { AppTaskItem } from "./ProcessCenterModal";
import "./ProcessCenterModal.css";

export interface ProcessCenterViewProps {
  activeTasks: AppTaskItem[];
  historyTasks: AppTaskItem[];
  onNavigateToTab: (tab: "studio" | "downloader" | "file_sub" | "dubbing" | "live" | "models") => void;
  onClearHistory: () => void;
  sttServerEngine?: string | null;
  transEnginePref?: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}p ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function ProcessCenterView({
  activeTasks,
  historyTasks,
  onNavigateToTab,
  onClearHistory,
  sttServerEngine,
  transEnginePref = "auto",
}: ProcessCenterViewProps) {
  const [filterType, setFilterType] = useState<"all" | "active" | "subtitle" | "dubbing" | "downloader" | "model">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // Live timer tick mỗi giây để đồng hồ thời gian chạy (elapsed timer) cập nhật thời gian thực
  useEffect(() => {
    if (activeTasks.length === 0) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTasks.length]);

  const handleCopyPath = (id: string, path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReveal = async (path: string) => {
    try {
      await sublix.revealInExplorer(path);
    } catch {
      await sublix.downloaderOpenFolder();
    }
  };

  // Trích xuất metadata thông minh theo workflow thực tế
  const getCategoryMeta = (task: AppTaskItem) => {
    if (task.workflowLabel) {
      if (task.workflowType === "subtitle_only") {
        return { label: task.workflowLabel, icon: <IconFilm size={14} />, color: "#38bdf8", badgeClass: "cat-sub" };
      }
      if (task.workflowType === "subtitle_translate") {
        return { label: task.workflowLabel, icon: <IconGlobe size={14} />, color: "#f59e0b", badgeClass: "cat-trans" };
      }
      if (task.workflowType === "voice_only") {
        return { label: task.workflowLabel, icon: <IconClapper size={14} />, color: "#ec4899", badgeClass: "cat-tts" };
      }
      if (task.workflowType === "dubbing") {
        return { label: task.workflowLabel, icon: <IconClapper size={14} />, color: "#a855f7", badgeClass: "cat-dub" };
      }
      return { label: task.workflowLabel, icon: <IconClapper size={14} />, color: "#8b5cf6", badgeClass: "cat-general" };
    }

    switch (task.type) {
      case "file_sub":
      case "subtitle":
        return { label: "Tạo Phụ Đề AI", icon: <IconFilm size={14} />, color: "#38bdf8", badgeClass: "cat-sub" };
      case "dubbing":
        return { label: "Studio Lồng Tiếng AI", icon: <IconClapper size={14} />, color: "#a855f7", badgeClass: "cat-dub" };
      case "downloader":
        return { label: "Tải Video", icon: <IconGlobe size={14} />, color: "#3b82f6", badgeClass: "cat-dl" };
      case "model":
        return { label: "Mô Hình AI", icon: <IconBox size={14} />, color: "#10b981", badgeClass: "cat-model" };
      default:
        return { label: "Tác Vụ Sublix", icon: <IconClock size={14} />, color: "#94a3b8", badgeClass: "cat-general" };
    }
  };

  const isTaskMatchFilter = (task: AppTaskItem, filter: typeof filterType) => {
    if (filter === "all") return true;
    if (filter === "active") return task.status === "running";
    if (filter === "subtitle") {
      return (
        task.type === "file_sub" ||
        task.type === "subtitle" ||
        task.workflowType === "subtitle_only" ||
        task.workflowType === "subtitle_translate"
      );
    }
    if (filter === "dubbing") {
      return (
        task.type === "dubbing" ||
        task.workflowType === "dubbing" ||
        task.workflowType === "voice_only"
      );
    }
    if (filter === "downloader") return task.type === "downloader";
    if (filter === "model") return task.type === "model";
    return true;
  };

  const filteredActive = activeTasks.filter((t) => isTaskMatchFilter(t, filterType));
  const filteredHistory = historyTasks.filter((t) => {
    if (filterType === "active") return false;
    return isTaskMatchFilter(t, filterType);
  });

  return (
    <StudioShell
      left={
        <>
          <ShellCard
            icon={<IconClock size={14} />}
            title="Tổng Quan Tiến Trình"
            badge={
              <span style={{ fontSize: 11, fontWeight: 700, color: activeTasks.length > 0 ? "var(--ac)" : "var(--t3)" }}>
                {activeTasks.length > 0 ? `⚡ ${activeTasks.length} Đang chạy` : "Sẵn sàng"}
              </span>
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: "rgba(0,0,0,0.25)", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line-soft)" }}>
                <div style={{ fontSize: 10, color: "var(--t3)" }}>ĐANG CHẠY</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#38bdf8" }}>{activeTasks.length}</div>
              </div>
              <div style={{ background: "rgba(0,0,0,0.25)", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line-soft)" }}>
                <div style={{ fontSize: 10, color: "var(--t3)" }}>LỊCH SỬ</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#2dd4bf" }}>{historyTasks.length}</div>
              </div>
            </div>
          </ShellCard>

          <ShellCard
            icon={<IconSettings size={14} />}
            title="Bộ Lọc Phân Loại"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button
                type="button"
                className={`settings-btn-secondary ${filterType === "all" ? "active" : ""}`}
                onClick={() => setFilterType("all")}
                style={{
                  justifyContent: "space-between",
                  background: filterType === "all" ? "var(--ac-soft)" : undefined,
                  borderColor: filterType === "all" ? "var(--ac)" : undefined,
                  color: filterType === "all" ? "var(--ac)" : undefined,
                }}
              >
                <span>Tất cả tác vụ</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>{activeTasks.length + historyTasks.length}</span>
              </button>

              <button
                type="button"
                className={`settings-btn-secondary ${filterType === "active" ? "active" : ""}`}
                onClick={() => setFilterType("active")}
                style={{
                  justifyContent: "space-between",
                  background: filterType === "active" ? "var(--ac-soft)" : undefined,
                  borderColor: filterType === "active" ? "var(--ac)" : undefined,
                  color: filterType === "active" ? "var(--ac)" : undefined,
                }}
              >
                <span>⚡ Đang xử lý</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>{activeTasks.length}</span>
              </button>

              <button
                type="button"
                className={`settings-btn-secondary ${filterType === "subtitle" ? "active" : ""}`}
                onClick={() => setFilterType("subtitle")}
                style={{
                  justifyContent: "space-between",
                  background: filterType === "subtitle" ? "var(--ac-soft)" : undefined,
                  borderColor: filterType === "subtitle" ? "var(--ac)" : undefined,
                  color: filterType === "subtitle" ? "var(--ac)" : undefined,
                }}
              >
                <span>💬 Phụ đề & Dịch thuật</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>
                  {activeTasks.filter((t) => isTaskMatchFilter(t, "subtitle")).length +
                    historyTasks.filter((t) => isTaskMatchFilter(t, "subtitle")).length}
                </span>
              </button>

              <button
                type="button"
                className={`settings-btn-secondary ${filterType === "dubbing" ? "active" : ""}`}
                onClick={() => setFilterType("dubbing")}
                style={{
                  justifyContent: "space-between",
                  background: filterType === "dubbing" ? "var(--ac-soft)" : undefined,
                  borderColor: filterType === "dubbing" ? "var(--ac)" : undefined,
                  color: filterType === "dubbing" ? "var(--ac)" : undefined,
                }}
              >
                <span>🎙️ Lồng tiếng & Phân vai</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>
                  {activeTasks.filter((t) => isTaskMatchFilter(t, "dubbing")).length +
                    historyTasks.filter((t) => isTaskMatchFilter(t, "dubbing")).length}
                </span>
              </button>

              <button
                type="button"
                className={`settings-btn-secondary ${filterType === "downloader" ? "active" : ""}`}
                onClick={() => setFilterType("downloader")}
                style={{
                  justifyContent: "space-between",
                  background: filterType === "downloader" ? "var(--ac-soft)" : undefined,
                  borderColor: filterType === "downloader" ? "var(--ac)" : undefined,
                  color: filterType === "downloader" ? "var(--ac)" : undefined,
                }}
              >
                <span>⬇️ Tải video</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>
                  {activeTasks.filter((t) => isTaskMatchFilter(t, "downloader")).length +
                    historyTasks.filter((t) => isTaskMatchFilter(t, "downloader")).length}
                </span>
              </button>

              <button
                type="button"
                className={`settings-btn-secondary ${filterType === "model" ? "active" : ""}`}
                onClick={() => setFilterType("model")}
                style={{
                  justifyContent: "space-between",
                  background: filterType === "model" ? "var(--ac-soft)" : undefined,
                  borderColor: filterType === "model" ? "var(--ac)" : undefined,
                  color: filterType === "model" ? "var(--ac)" : undefined,
                }}
              >
                <span>📦 Mô hình AI</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>
                  {activeTasks.filter((t) => isTaskMatchFilter(t, "model")).length +
                    historyTasks.filter((t) => isTaskMatchFilter(t, "model")).length}
                </span>
              </button>
            </div>
          </ShellCard>

          <ShellCard
            icon={<IconFolder size={14} />}
            title="Thao Tác Nhanh"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                type="button"
                className="settings-btn-primary"
                onClick={() => sublix.openThanhPhamFolder()}
                style={{ justifyContent: "center" }}
              >
                📁 Mở Thư Mục Thành Phẩm
              </button>
              <button
                type="button"
                className="settings-btn-secondary"
                onClick={() => sublix.downloaderOpenFolder()}
                style={{ justifyContent: "center" }}
              >
                📥 Mở Thư Mục Tải Về
              </button>
              <button
                type="button"
                className="settings-btn-secondary"
                onClick={onClearHistory}
                disabled={historyTasks.length === 0}
                style={{ justifyContent: "center", color: historyTasks.length > 0 ? "#f87171" : undefined }}
              >
                <IconTrash size={13} />
                <span>Xóa Lịch Sử Tiến Trình</span>
              </button>
            </div>
          </ShellCard>
        </>
      }
      center={
        <>
          {/* Active Tasks Section */}
          {(filterType === "all" || filterType === "active") && (
            <ShellCard
              icon={<span style={{ color: "#38bdf8" }}>⚡</span>}
              title="Tiến Trình Đang Chạy Nền"
              badge={
                <span style={{ fontSize: 11, fontWeight: 700, color: filteredActive.length > 0 ? "#38bdf8" : "var(--t3)" }}>
                  {filteredActive.length} tác vụ
                </span>
              }
            >
              {filteredActive.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px 16px", color: "var(--t3)", fontSize: 12 }}>
                  <div style={{ fontSize: 26, marginBottom: 8 }}>☕</div>
                  <div style={{ fontWeight: 600, color: "var(--t2)", marginBottom: 4, fontSize: 13 }}>
                    Không có tác vụ nào đang xử lý
                  </div>
                  <div>Khi bạn chạy phân tích video, tạo phụ đề, tải file hoặc dịch thuật, tiến trình thời gian thực sẽ xuất hiện tại đây.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {filteredActive.map((task) => {
                    const meta = getCategoryMeta(task);
                    const elapsedMs = Math.max(0, now - task.startedAt);
                    const displayName = task.fileName || task.title;

                    return (
                      <div key={task.id} className="process-task-card running cinema-glow">
                        {/* Top: Category Badge + Status Pulse */}
                        <div className="process-task-top">
                          <span className="process-cat-badge" style={{ color: meta.color, borderColor: meta.color }}>
                            {meta.icon} <span>{meta.label}</span>
                          </span>
                          <span className="process-status-pill running">
                            <span className="pulse-dot" /> Đang chạy ({task.percent.toFixed(1)}%)
                          </span>
                        </div>

                        {/* File Name Chip & Title */}
                        <div className="process-task-main">
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                            <h4 className="process-task-title" style={{ margin: 0, fontSize: 15, fontWeight: 700 }} title={task.title}>
                              {task.title}
                            </h4>
                            {task.fileName && (
                              <span className="task-file-chip" title={task.fileName}>
                                🎬 {task.fileName}
                              </span>
                            )}
                          </div>

                          {/* Stepper Pipeline Trực Quan */}
                          {task.steps && task.steps.length > 0 && (
                            <div className="process-stepper-track">
                              {task.steps.map((st, idx) => (
                                <div key={st.id} className={`process-step-node ${st.status}`}>
                                  <div className="step-node-indicator">
                                    {st.status === "done" ? "✓" : st.status === "running" ? "⚡" : "○"}
                                  </div>
                                  <span className="step-node-label">{st.label}</span>
                                  {idx < task.steps!.length - 1 && <div className={`step-connector ${st.status === "done" ? "done" : ""}`} />}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Stage & Details */}
                          <div className="process-task-stage-line" style={{ marginTop: task.steps ? 8 : 4 }}>
                            <span className="stage-tag">{task.stage}</span>
                            {task.detail && <span className="stage-detail">{task.detail}</span>}
                          </div>
                        </div>

                        {/* Cinema Progress Bar với hiệu ứng Shimmer */}
                        <div className="process-task-bar-wrapper">
                          <div className="process-task-bar cinema-bar">
                            <div
                              className="process-task-bar-fill shimmer-fill"
                              style={{ width: `${Math.min(100, Math.max(0, task.percent))}%` }}
                            />
                          </div>
                        </div>

                        {/* Live Metrics Dashboard: 4 Thẻ Kính Thống Kê */}
                        <div className="process-live-metrics">
                          <div className="metric-glass-card">
                            <span className="metric-label">TIẾN ĐỘ</span>
                            <span className="metric-val pct-text">{task.percent.toFixed(1)}%</span>
                          </div>
                          <div className="metric-glass-card">
                            <span className="metric-label">THỜI GIAN ĐÃ CHẠY</span>
                            <span className="metric-val time-text">⏱️ {formatDuration(elapsedMs)}</span>
                          </div>
                          <div className="metric-glass-card">
                            <span className="metric-label">CÔNG ĐOẠN</span>
                            <span className="metric-val stage-text" title={task.stage}>{task.stage}</span>
                          </div>
                          <div className="metric-glass-card">
                            <span className="metric-label">BẮT ĐẦU LÚC</span>
                            <span className="metric-val">{formatTime(task.startedAt)}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="process-task-actions" style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          {task.targetTab === "studio" && (
                            <button
                              type="button"
                              className="process-btn-jump-primary"
                              onClick={() => onNavigateToTab("studio")}
                            >
                              🚀 Mở Studio Làm Việc
                            </button>
                          )}
                          {task.outputPath && (
                            <button
                              type="button"
                              className="process-btn-secondary"
                              onClick={() => handleReveal(task.outputPath!)}
                              title="Mở thư mục chứa file"
                            >
                              <IconFolder size={12} /> Thư Mục
                            </button>
                          )}
                          <button
                            type="button"
                            className="process-btn-secondary"
                            onClick={() => handleCopyPath(task.id, displayName)}
                            title="Sao chép tên file"
                          >
                            {copiedId === task.id ? "✓ Đã chép" : "📋 Tên File"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ShellCard>
          )}

          {/* History Tasks Section */}
          <ShellCard
            icon={<IconCheck size={14} />}
            title="Lịch Sử Hoàn Tất Gần Đây"
            badge={
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)" }}>
                {filteredHistory.length} tác vụ
              </span>
            }
          >
            {filteredHistory.length === 0 ? (
              <div style={{ textAlign: "center", padding: "28px 16px", color: "var(--t3)", fontSize: 12 }}>
                <div>Chưa có tác vụ nào được lưu trong lịch sử.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredHistory.map((task) => {
                  const meta = getCategoryMeta(task);
                  const isDone = task.status === "completed";
                  const elapsedMs = task.completedAt ? task.completedAt - task.startedAt : 0;
                  const displayTitle = task.fileName ? `${meta.label} · ${task.fileName}` : task.title;

                  return (
                    <div key={task.id} className="process-task-card completed history-glass">
                      <div className="process-task-top">
                        <span className="process-cat-badge" style={{ color: meta.color, borderColor: meta.color }}>
                          {meta.icon} <span>{meta.label}</span>
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {elapsedMs > 0 && (
                            <span style={{ fontSize: 11, color: "var(--t3)" }}>
                              ⏳ {formatDuration(elapsedMs)}
                            </span>
                          )}
                          <span className={`process-status-pill ${isDone ? "completed" : "error"}`}>
                            {isDone ? "✓ Hoàn tất" : "✕ Lỗi"}
                          </span>
                        </div>
                      </div>

                      <div className="process-task-main">
                        <h4 className="process-task-title" style={{ fontSize: 13.5, fontWeight: 600 }} title={displayTitle}>
                          {displayTitle}
                        </h4>
                        <div className="process-task-stage-line">
                          <span className="stage-tag">{task.stage}</span>
                          {task.detail && <span className="stage-detail">{task.detail}</span>}
                          {task.error && <span className="stage-detail" style={{ color: "#f87171" }}>⚠️ {task.error}</span>}
                        </div>
                      </div>

                      <div className="process-task-history-meta">
                        <span>⏰ Xong lúc: {task.completedAt ? formatTime(task.completedAt) : "—"}</span>
                        {task.completedAt && (
                          <span>⏳ Thời gian chạy: {formatDuration(elapsedMs)}</span>
                        )}
                      </div>

                      {task.outputPath && (
                        <div className="process-task-output">
                          <span className="output-label">📁 File:</span>
                          <span className="output-path" title={task.outputPath}>
                            {task.outputPath}
                          </span>
                          <button
                            type="button"
                            className="btn-path-action"
                            onClick={() => handleReveal(task.outputPath!)}
                            title="Mở thư mục chứa file"
                          >
                            <IconFolder size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn-path-action"
                            onClick={() => handleCopyPath(task.id, task.outputPath!)}
                            title="Sao chép đường dẫn"
                          >
                            {copiedId === task.id ? "✓" : "📋"}
                          </button>
                        </div>
                      )}

                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 6 }}>
                        {task.targetTab === "studio" && (
                          <button
                            type="button"
                            className="process-btn-jump"
                            style={{ fontSize: 11, padding: "4px 8px" }}
                            onClick={() => onNavigateToTab("studio")}
                          >
                            🚀 Mở Lại Trong Studio
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ShellCard>
        </>
      }
      right={
        <>
          <ShellCard
            icon={<IconSettings size={14} />}
            title="Động Cơ & Phần Cứng AI"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <span style={{ color: "var(--t3)" }}>Nhận diện STT:</span>
                <span style={{ fontWeight: 600, color: "#38bdf8" }}>Whisper Large-v3 Turbo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <span style={{ color: "var(--t3)" }}>Tăng tốc STT Server:</span>
                <span style={{ fontWeight: 600, color: "#2dd4bf" }}>{sttServerEngine || "GPU CUDA"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <span style={{ color: "var(--t3)" }}>Phân vai nhân vật:</span>
                <span style={{ fontWeight: 600, color: "#a78bfa" }}>Sherpa-ONNX Diarization</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <span style={{ color: "var(--t3)" }}>Dịch thuật LLM:</span>
                <span style={{ fontWeight: 600, color: "#f59e0b" }}>Qwen / Gemma 3 ({transEnginePref.toUpperCase()})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={{ color: "var(--t3)" }}>Tổng hợp giọng nói:</span>
                <span style={{ fontWeight: 600, color: "#ec4899" }}>Edge-TTS & Kokoro VI</span>
              </div>
            </div>
          </ShellCard>

          <ShellCard
            icon={<IconFilm size={14} />}
            title="Hướng Dẫn & Lưu Ý"
          >
            <div style={{ fontSize: 11.5, color: "var(--t2)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ margin: 0 }}>
                💡 <strong>Đa nhiệm mượt mà:</strong> Bạn có thể bắt đầu xử lý một video dài trong Studio hoặc tải nhiều video cùng lúc, sau đó chuyển sang các tab khác mà tiến trình vẫn chạy bình thường.
              </p>
              <p style={{ margin: 0 }}>
                ⚡ <strong>Huy hiệu tiến trình:</strong> Khi có tác vụ đang chạy nền, nút tab <em>Tiến trình</em> trên thanh công cụ sẽ hiển thị số lượng tác vụ kèm hiệu ứng phát sáng.
              </p>
            </div>
          </ShellCard>
        </>
      }
    />
  );
}
