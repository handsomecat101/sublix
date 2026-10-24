//! ProcessCenterView.tsx — tab **Tiến trình** (UI_REDESIGN_PLAN §4.7, R2-7C).
//!
//! Thiết kế mới (thay bản cũ):
//! - **6 chip lọc ngang** (`Segmented`) trên đầu danh sách, mỗi chip có số đếm
//!   (thay 6 nút dọc ở cột trái).
//! - **Menu `⋯`** đầu danh sách gom "Mở thư mục thành phẩm" · "Mở thư mục tải
//!   về" · "Xoá lịch sử tiến trình" (mục nguy hiểm + **hộp xác nhận**).
//! - Bỏ thẻ "Hướng dẫn & Lưu ý" → câu hướng dẫn nằm ngay trong **trạng thái
//!   rỗng**.
//!
//! Mọi logic lọc/đếm nằm trong `processLogic.ts` (hàm thuần → test được).
//! Thẻ phần cứng ghi cứng đã bị gỡ từ R2-7 → thông tin thật ở cột phải.

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  IconMoreHorizontal,
} from "../icons";
import { sublix } from "../lib/tauri";
import { StudioShell, ShellCard } from "./StudioShell";
import { Segmented } from "../components/ui/Segmented";
import { ContextMenu, type ContextMenuItem } from "../components/ui/ContextMenu";
import type { AppTaskItem } from "./processTypes";
import {
  buildFilterOptions,
  countProcessFilter,
  emptyStateHint,
  processCategoryMeta,
  splitProcessTasks,
  type ProcessCategoryKey,
  type ProcessFilter,
} from "./processLogic";
import "./ProcessCenterView.css";

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

/** Icon theo nhóm tác vụ (JSX nên nằm ở View, logic thuần nằm ở `processLogic`). */
const CATEGORY_ICONS: Record<ProcessCategoryKey, ReactNode> = {
  subtitle: <IconFilm size={14} />,
  translate: <IconGlobe size={14} />,
  voice: <IconClapper size={14} />,
  dubbing: <IconClapper size={14} />,
  downloader: <IconGlobe size={14} />,
  model: <IconBox size={14} />,
  general: <IconClock size={14} />,
};

function ProcessCenterViewInner({
  activeTasks,
  historyTasks,
  onNavigateToTab,
  onClearHistory,
  sttServerEngine,
  transEnginePref = "auto",
}: ProcessCenterViewProps) {
  const [filter, setFilter] = useState<ProcessFilter>("all");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  // Live timer tick mỗi giây để đồng hồ thời gian chạy (elapsed timer) cập nhật thời gian thực
  useEffect(() => {
    if (activeTasks.length === 0) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTasks.length]);

  /** Số đếm theo từng nhóm (đang chạy + lịch sử gộp lại). */
  const counts = useMemo(
    () => countProcessFilter(activeTasks, historyTasks),
    [activeTasks, historyTasks],
  );

  /** Chip lọc — nhãn kèm số đếm (options ổn định để `Segmented` không re-render). */
  const filterOptions = useMemo(() => buildFilterOptions(counts), [counts]);

  /** Tách danh sách hiển thị theo chip đang chọn. */
  const { active: filteredActive, history: filteredHistory } = useMemo(
    () => splitProcessTasks(activeTasks, historyTasks, filter),
    [activeTasks, historyTasks, filter],
  );

  const handleFilterChange = useCallback((value: ProcessFilter) => {
    setFilter(value);
  }, []);

  const handleCopyPath = useCallback((id: string, path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleReveal = useCallback(async (path: string) => {
    try {
      await sublix.revealInExplorer(path);
    } catch {
      await sublix.downloaderOpenFolder();
    }
  }, []);

  /** Mở menu `⋯` ngay dưới nút. */
  const handleToggleMenu = useCallback(() => {
    setMenu((prev) => {
      if (prev) return null;
      const rect = moreButtonRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return { x: Math.max(8, rect.right - 240), y: rect.bottom + 6 };
    });
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const handleOpenOutputFolder = useCallback(() => {
    void sublix.openThanhPhamFolder();
  }, []);

  const handleOpenDownloadFolder = useCallback(() => {
    void sublix.downloaderOpenFolder();
  }, []);

  const handleRequestClear = useCallback(() => {
    setConfirmClear(true);
  }, []);

  const handleCancelClear = useCallback(() => {
    setConfirmClear(false);
  }, []);

  const handleConfirmClear = useCallback(() => {
    setConfirmClear(false);
    onClearHistory();
  }, [onClearHistory]);

  /** Menu `⋯` đầu danh sách (3 mục, mục nguy hiểm tách bằng vạch). */
  const menuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        id: "open-output",
        label: "📁 Mở Thư Mục Thành Phẩm",
        onSelect: handleOpenOutputFolder,
      },
      {
        id: "open-downloads",
        label: "📥 Mở Thư Mục Tải Về",
        onSelect: handleOpenDownloadFolder,
      },
      {
        id: "clear-history",
        label: "🗑 Xoá Lịch Sử Tiến Trình",
        hint: `${historyTasks.length} tác vụ`,
        danger: true,
        disabled: historyTasks.length === 0,
        separatorBefore: true,
        onSelect: handleRequestClear,
      },
    ],
    [handleOpenDownloadFolder, handleOpenOutputFolder, handleRequestClear, historyTasks.length],
  );

  return (
    <StudioShell
      left={
        <ShellCard
          icon={<IconClock size={14} />}
          title="Tổng Quan Tiến Trình"
          badge={
            <span style={{ fontSize: 11, fontWeight: 700, color: activeTasks.length > 0 ? "var(--ac)" : "var(--t3)" }}>
              {activeTasks.length > 0 ? `⚡ ${activeTasks.length} Đang chạy` : "Sẵn sàng"}
            </span>
          }
        >
          <div className="pc-stats">
            <div className="pc-stat">
              <div className="pc-stat-label">ĐANG CHẠY</div>
              <div className="pc-stat-value" style={{ color: "#38bdf8" }}>{activeTasks.length}</div>
            </div>
            <div className="pc-stat">
              <div className="pc-stat-label">LỊCH SỬ</div>
              <div className="pc-stat-value" style={{ color: "#2dd4bf" }}>{historyTasks.length}</div>
            </div>
          </div>
          <p className="pc-hint">
            Tiến trình nền (tạo phụ đề, dịch thuật, lồng tiếng, tải video, tải mô hình) được ghi lại tự động.
          </p>
        </ShellCard>
      }
      center={
        <>
          {/* ── Thanh công cụ đầu danh sách: chip lọc + menu ⋯ ───────────── */}
          <div className="pc-toolbar">
            <Segmented
              className="pc-filters"
              options={filterOptions}
              value={filter}
              onChange={handleFilterChange}
              ariaLabel="Lọc tác vụ theo nhóm"
            />
            <button
              type="button"
              className="pc-more-btn"
              ref={moreButtonRef}
              onClick={handleToggleMenu}
              title="Thao tác khác (mở thư mục · xoá lịch sử)"
              aria-label="Thao tác khác"
              aria-haspopup="menu"
              aria-expanded={menu !== null}
            >
              <IconMoreHorizontal size={14} />
            </button>
          </div>

          {menu ? (
            <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={handleCloseMenu} />
          ) : null}

          {confirmClear ? (
            <div className="pc-confirm" role="alertdialog" aria-label="Xác nhận xoá lịch sử tiến trình">
              <span className="pc-confirm-text">
                Xoá toàn bộ lịch sử tiến trình ({historyTasks.length} tác vụ)? Không thể hoàn tác.
              </span>
              <span className="pc-confirm-actions">
                <button type="button" className="pc-btn" onClick={handleCancelClear}>
                  Huỷ
                </button>
                <button type="button" className="pc-btn pc-btn-danger" onClick={handleConfirmClear}>
                  <IconTrash size={12} />
                  Xoá
                </button>
              </span>
            </div>
          ) : null}

          {/* Active Tasks Section */}
          {filter === "all" || filter === "active" ? (
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
                <div className="pc-empty">
                  <div className="pc-empty-icon">☕</div>
                  <div className="pc-empty-title">
                    {filter === "active" ? "Không có tác vụ nào đang chạy" : "Chưa có tác vụ nào đang chạy"}
                  </div>
                  <p className="pc-empty-text">{emptyStateHint(filter === "active" ? "active" : "all")}</p>
                </div>
              ) : (
                <div className="pc-list">
                  {filteredActive.map((task) => {
                    const meta = processCategoryMeta(task);
                    const elapsedMs = Math.max(0, now - task.startedAt);
                    const displayName = task.fileName || task.title;

                    return (
                      <div key={task.id} className="process-task-card running cinema-glow">
                        {/* Top: Category Badge + Status Pulse */}
                        <div className="process-task-top">
                          <span className="process-cat-badge" style={{ color: meta.color, borderColor: meta.color }}>
                            {CATEGORY_ICONS[meta.key]} <span>{meta.label}</span>
                          </span>
                          <span className="process-status-pill running">
                            <span className="pulse-dot" /> Đang chạy ({task.percent.toFixed(1)}%)
                          </span>
                        </div>

                        {/* File Name Chip & Title */}
                        <div className="process-task-main">
                          <div className="pc-title-row">
                            <h4 className="process-task-title" title={task.title}>
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
                                  {idx < task.steps!.length - 1 && (
                                    <div className={`step-connector ${st.status === "done" ? "done" : ""}`} />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Stage & Details */}
                          <div className="process-task-stage-line">
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
                        <div className="process-task-actions">
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
          ) : null}

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
              <div className="pc-empty">
                <div className="pc-empty-icon">📋</div>
                <div className="pc-empty-title">Chưa có tác vụ nào trong lịch sử</div>
                <p className="pc-empty-text">{emptyStateHint(filter)}</p>
              </div>
            ) : (
              <div className="pc-list">
                {filteredHistory.map((task) => {
                  const meta = processCategoryMeta(task);
                  const isDone = task.status === "completed";
                  const elapsedMs = task.completedAt ? task.completedAt - task.startedAt : 0;
                  const displayTitle = task.fileName ? `${meta.label} · ${task.fileName}` : task.title;

                  return (
                    <div key={task.id} className="process-task-card completed history-glass">
                      <div className="process-task-top">
                        <span className="process-cat-badge" style={{ color: meta.color, borderColor: meta.color }}>
                          {CATEGORY_ICONS[meta.key]} <span>{meta.label}</span>
                        </span>
                        <div className="pc-top-right">
                          {elapsedMs > 0 && (
                            <span className="pc-duration">⏳ {formatDuration(elapsedMs)}</span>
                          )}
                          <span className={`process-status-pill ${isDone ? "completed" : "error"}`}>
                            {isDone ? "✓ Hoàn tất" : "✕ Lỗi"}
                          </span>
                        </div>
                      </div>

                      <div className="process-task-main">
                        <h4 className="process-task-title pc-history-title" title={displayTitle}>
                          {displayTitle}
                        </h4>
                        <div className="process-task-stage-line">
                          <span className="stage-tag">{task.stage}</span>
                          {task.detail && <span className="stage-detail">{task.detail}</span>}
                          {task.error && <span className="stage-detail pc-error">⚠️ {task.error}</span>}
                        </div>
                      </div>

                      <div className="process-task-history-meta">
                        <span>⏰ Xong lúc: {task.completedAt ? formatTime(task.completedAt) : "—"}</span>
                        {task.completedAt && <span>⏳ Thời gian chạy: {formatDuration(elapsedMs)}</span>}
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

                      {task.targetTab === "studio" && (
                        <div className="pc-history-actions">
                          <button
                            type="button"
                            className="process-btn-jump"
                            onClick={() => onNavigateToTab("studio")}
                          >
                            🚀 Mở Lại Trong Studio
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ShellCard>
        </>
      }
      right={
        <ShellCard icon={<IconSettings size={14} />} title="Trạng thái thật">
          <div className="pc-state">
            <div className="pc-state-row">
              <span className="pc-state-label">STT server:</span>
              <span className="pc-state-value" style={{ color: sttServerEngine ? "#38bdf8" : "var(--t3)" }}>
                {/* Guard typeof: backend trả lệch kiểu (không phải chuỗi) sẽ làm
                    vỡ cả tab thay vì chỉ 1 ô. */}
                {typeof sttServerEngine === "string" ? sttServerEngine.toUpperCase() : "Chưa nạp"}
              </span>
            </div>
            <div className="pc-state-row">
              <span className="pc-state-label">Engine dịch:</span>
              <span className="pc-state-value" style={{ color: "#2dd4bf" }}>{transEnginePref.toUpperCase()}</span>
            </div>
            <div className="pc-state-row">
              <span className="pc-state-label">Đang chạy:</span>
              <span className="pc-state-value" style={{ color: activeTasks.length ? "var(--ac)" : "var(--t3)" }}>
                {activeTasks.length}
              </span>
            </div>
            <p className="pc-hint">
              Model, GPU và giọng đọc thật xem ở <b>Cài đặt › Trạng thái hệ thống</b> (không hiển thị giá trị
              ghi cứng ở đây).
            </p>
          </div>
        </ShellCard>
      }
    />
  );
}

/** `ProcessCenterView` đã bọc `React.memo` (props phải ổn định từ parent). */
export const ProcessCenterView = memo(ProcessCenterViewInner);

export default ProcessCenterView;
