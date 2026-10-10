//! Process Center Modal — Centralized Activity & Process Monitor for Sublix.
//! Tracks background GPU/AI jobs (Subtitles, Dubbing, Downloads, Models) in real time.

import { useState } from "react";
import {
  IconFilm,
  IconClapper,
  IconGlobe,
  IconBox,
  IconClock,
  IconFolder,
  IconTrash,
} from "../icons";
import { sublix } from "../lib/tauri";
import "./ProcessCenterModal.css";

export interface AppTaskItem {
  id: string;
  type: "file_sub" | "dubbing" | "downloader" | "model" | "live";
  title: string;
  stage: string;
  percent: number;
  status: "running" | "completed" | "error" | "paused";
  detail?: string;
  speed?: string;
  eta?: string;
  startedAt: number;
  completedAt?: number;
  targetTab: "downloader" | "file_sub" | "dubbing" | "live" | "models" | "studio";
  outputPath?: string;
  error?: string;
}

interface ProcessCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTasks: AppTaskItem[];
  historyTasks: AppTaskItem[];
  onNavigateToTab: (tab: "downloader" | "file_sub" | "dubbing" | "live" | "models" | "studio") => void;
  onClearHistory: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}p ${s}s`;
  return `${s}s`;
}

export function ProcessCenterModal({
  isOpen,
  onClose,
  activeTasks,
  historyTasks,
  onNavigateToTab,
  onClearHistory,
}: ProcessCenterModalProps) {
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

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

  const getCategoryMeta = (type: AppTaskItem["type"]) => {
    switch (type) {
      case "file_sub":
        return { label: "Tạo Phụ Đề File", icon: <IconFilm size={14} />, color: "#f59e0b" };
      case "dubbing":
        return { label: "Studio Lồng Tiếng AI", icon: <IconClapper size={14} />, color: "#8b5cf6" };
      case "downloader":
        return { label: "Tải Video", icon: <IconGlobe size={14} />, color: "#3b82f6" };
      case "model":
        return { label: "Mô Hình AI", icon: <IconBox size={14} />, color: "#10b981" };
      default:
        return { label: "Tác Vụ Sublix", icon: <IconClock size={14} />, color: "#94a3b8" };
    }
  };

  return (
    <div className="process-center-backdrop" onClick={onClose}>
      <div className="process-center-modal" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="process-center-header">
          <div className="process-center-title-group">
            <h3 className="process-center-title">
              ⚡ Trung Tâm Tiến Trình Ứng Dụng (Activity Monitor)
            </h3>
            <p className="process-center-subtitle">
              Toàn bộ tiến trình chạy ngầm, xử lý GPU/AI và lịch sử tác vụ của Sublix
            </p>
          </div>
          <button type="button" className="process-center-close-btn" onClick={onClose} title="Đóng">
            ✕
          </button>
        </div>

        {/* TABS */}
        <div className="process-center-tabs">
          <button
            type="button"
            className={`process-center-tab ${activeTab === "active" ? "active" : ""}`}
            onClick={() => setActiveTab("active")}
          >
            <span>⚡ Đang Xử Lý</span>
            <span className="process-badge">{activeTasks.length}</span>
          </button>
          <button
            type="button"
            className={`process-center-tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <span>📜 Lịch Sử Đã Chạy</span>
            <span className="process-badge">{historyTasks.length}</span>
          </button>
        </div>

        {/* BODY */}
        <div className="process-center-body">
          {activeTab === "active" && (
            <div className="process-active-list">
              {activeTasks.length === 0 ? (
                <div className="process-empty-state">
                  <div className="process-empty-icon">☕</div>
                  <h4>Không có tác vụ nào đang chạy</h4>
                  <p>
                    Khi bạn thực hiện <strong>Tạo Phụ Đề</strong>, <strong>Lồng Tiếng AI</strong>, hoặc{" "}
                    <strong>Tải Video</strong>, tiến trình sẽ hiển thị trực tiếp tại đây ngay cả khi bạn
                    chuyển sang tab khác.
                  </p>
                </div>
              ) : (
                activeTasks.map((task) => {
                  const meta = getCategoryMeta(task.type);
                  return (
                    <div key={task.id} className="process-task-card running">
                      <div className="process-task-top">
                        <span className="process-cat-badge" style={{ color: meta.color, borderColor: meta.color }}>
                          {meta.icon} <span>{meta.label}</span>
                        </span>
                        <span className="process-status-pill running">
                          <span className="pulse-dot" /> Đang chạy
                        </span>
                      </div>

                      <div className="process-task-main">
                        <h4 className="process-task-title" title={task.title}>
                          {task.title}
                        </h4>
                        <div className="process-task-stage-line">
                          <span className="stage-tag">{task.stage}</span>
                          {task.detail && <span className="stage-detail">{task.detail}</span>}
                        </div>
                      </div>

                      <div className="process-task-bar-wrapper">
                        <div className="process-task-bar">
                          <div
                            className="process-task-bar-fill"
                            style={{ width: `${Math.min(100, Math.max(0, task.percent))}%` }}
                          />
                        </div>
                        <div className="process-task-bar-meta">
                          <span className="pct-val">{task.percent.toFixed(1)}%</span>
                          {task.speed && <span className="speed-val">🚀 {task.speed}</span>}
                          {task.eta && <span className="eta-val">⏱️ Còn {task.eta}</span>}
                          <span className="time-val">Bắt đầu: {formatTime(task.startedAt)}</span>
                        </div>
                      </div>

                      <div className="process-task-actions">
                        <button
                          type="button"
                          className="process-btn-jump"
                          onClick={() => {
                            onNavigateToTab(task.targetTab);
                            onClose();
                          }}
                        >
                          👉 Mở Trực Tiếp Tab Này
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="process-history-list">
              <div className="process-history-toolbar">
                <span className="history-count-text">
                  Tổng số: <strong>{historyTasks.length}</strong> tác vụ đã ghi nhận
                </span>
                {historyTasks.length > 0 && (
                  <button
                    type="button"
                    className="process-btn-clear"
                    onClick={onClearHistory}
                    title="Xóa toàn bộ lịch sử tác vụ"
                  >
                    <IconTrash size={12} /> Dọn Lịch Sử
                  </button>
                )}
              </div>

              {historyTasks.length === 0 ? (
                <div className="process-empty-state">
                  <div className="process-empty-icon">📁</div>
                  <h4>Chưa có lịch sử tác vụ</h4>
                  <p>Các tác vụ đã hoàn thành hoặc gặp lỗi sẽ tự động được lưu lại tại đây.</p>
                </div>
              ) : (
                historyTasks.map((task) => {
                  const meta = getCategoryMeta(task.type);
                  const isSuccess = task.status === "completed";
                  const elapsedMs = task.completedAt ? task.completedAt - task.startedAt : 0;
                  return (
                    <div key={task.id} className={`process-history-card ${task.status}`}>
                      <div className="history-card-header">
                        <span className="process-cat-badge" style={{ color: meta.color, borderColor: meta.color }}>
                          {meta.icon} <span>{meta.label}</span>
                        </span>
                        <div className="history-badges">
                          {elapsedMs > 0 && (
                            <span className="history-duration">⏱️ {formatDuration(elapsedMs)}</span>
                          )}
                          <span className={`process-status-pill ${task.status}`}>
                            {isSuccess ? "✓ Hoàn thành" : "✕ Thất bại"}
                          </span>
                        </div>
                      </div>

                      <div className="history-card-content">
                        <h4 className="history-title" title={task.title}>
                          {task.title}
                        </h4>
                        {task.detail && <p className="history-detail">{task.detail}</p>}
                        {task.error && <p className="history-error">⚠️ {task.error}</p>}
                        {task.outputPath && (
                          <div className="history-output-row">
                            <span className="output-label">File kết quả:</span>
                            <span className="output-path" title={task.outputPath}>
                              {task.outputPath}
                            </span>
                            <button
                              type="button"
                              className="output-btn"
                              onClick={() => handleReveal(task.outputPath!)}
                              title="Mở thư mục chứa file"
                            >
                              <IconFolder size={12} />
                            </button>
                            <button
                              type="button"
                              className="output-btn"
                              onClick={() => handleCopyPath(task.id, task.outputPath!)}
                              title="Sao chép đường dẫn"
                            >
                              {copiedId === task.id ? "✓ Đã chép" : "📋"}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="history-card-footer">
                        <span className="history-time">
                          Hoàn tất lúc: {task.completedAt ? formatTime(task.completedAt) : formatTime(task.startedAt)}
                        </span>
                        <button
                          type="button"
                          className="history-jump-btn"
                          onClick={() => {
                            onNavigateToTab(task.targetTab);
                            onClose();
                          }}
                        >
                          Xem Tab Này →
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
