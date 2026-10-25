//! ProcessCenterView.tsx — tab **Tiến trình** (UI_REDESIGN_PLAN §4.7, R2-7C + R2-8).
//!
//! Thiết kế (R2-7C):
//! - **6 chip lọc ngang** (`Segmented`) trên đầu danh sách, mỗi chip có số đếm.
//! - **Menu `⋯`** đầu danh sách gom "Mở thư mục thành phẩm" · "Mở thư mục tải
//!   về" · "Xoá lịch sử tiến trình" (mục nguy hiểm + **hộp xác nhận**).
//!
//! Sửa theo duyệt cuối của Opus (R2-8, mục 15/16/17):
//! - **Sentence case** mọi tiêu đề + nhãn loại tác vụ (mục 15).
//! - Thẻ lịch sử **gọn 1 dòng tiêu đề + 1 dòng meta**, giờ 24h, đường dẫn
//!   mono ellipsis, nút 📁/📋 tách cuối hàng (mục 16).
//! - **Bỏ cột trái** (số đếm đã có ở chip + topbar) và cột phải dùng **chung
//!   component "Trạng thái hệ thống"** với Cài đặt (mục 17).
//!
//! Mọi logic lọc/đếm nằm trong `processLogic.ts` (hàm thuần → test được).

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
  IconMoreHorizontal,
} from "../icons";
import { sublix } from "../lib/tauri";
import { ShellCard } from "./StudioShell";
import { Segmented } from "../components/ui/Segmented";
import { ContextMenu, type ContextMenuItem } from "../components/ui/ContextMenu";
import { SystemStatusPanel } from "./settings/SystemStatusPanel";
import type { SettingsCtx, TransProvider } from "./settings/types";
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

/**
 * R2-8 mục 15: nhãn loại tác vụ về **sentence case**.
 *
 * Nhãn gốc do frontend gửi lên (`workflowLabel`) viết Title Case
 * ("Quét Phân Tích & Phân Vai"), còn nhãn fallback trong `processLogic.ts` thì
 * ("Tạo Phụ Đề AI"). `processLogic.ts` đang được worker khác sửa ⇒ bảng ánh xạ
 * nằm ở đây (đúng như giao việc giao trong đề bài).
 */
const SENTENCE_LABELS: Record<string, string> = {
  "Quét Phân Tích & Phân Vai": "Quét phân tích & phân vai",
  "Lồng Tiếng Đa Vai AI": "Lồng tiếng đa vai AI",
  "Lồng Tiếng TTS": "Lồng tiếng TTS",
  "Phụ Đề & Dịch Thuật AI": "Phụ đề & dịch thuật AI",
  "Trích Xuất Phụ Đề Gốc": "Trích xuất phụ đề gốc",
  "Tạo Phụ Đề AI": "Tạo phụ đề AI",
  "Studio Lồng Tiếng AI": "Studio lồng tiếng AI",
  "Tải Video": "Tải video",
  "Mô Hình AI": "Mô hình AI",
  "Tác Vụ Sublix": "Tác vụ Sublix",
};

/** Đổi nhãn Title Case sang sentence case (không đụng nhãn đã đúng). */
function sentenceCase(label: string): string {
  return SENTENCE_LABELS[label] ?? label;
}

/** Giờ 24h kiểu Việt Nam (tránh "12:20:36 PM"). */
function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
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

  /**
   * R2-8 mục 17: cột phải dùng CHUNG component "Trạng thái hệ thống" với
   * Cài đặt ⇒ đọc dữ liệu THẬT (config / engine TTS / phiên bản / live).
   */
  const [statusCtx, setStatusCtx] = useState<SettingsCtx | null>(null);

  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  // Live timer tick mỗi giây để đồng hồ thời gian chạy (elapsed timer) cập nhật thời gian thực
  useEffect(() => {
    if (activeTasks.length === 0) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTasks.length]);

  // Nạp dữ liệu cho panel "Trạng thái hệ thống" (dùng chung với Cài đặt).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [config, ttsStatus, appInfo, live] = await Promise.all([
          sublix.getConfig(),
          sublix.ttsEnginesStatus(),
          sublix.appInfo(),
          sublix.liveStatus(),
        ]);
        if (!alive) return;
        setStatusCtx({
          provider: (config.translation_provider ?? "local") as TransProvider,
          ollamaModel: config.ollama_model ?? "",
          translationModel: config.translation_model ?? "",
          minimaxModel: config.minimax_model ?? "",
          deepseekModel: config.deepseek_model ?? "",
          openrouterModel: config.openrouter_model ?? "",
          model: config.stt_model ?? "",
          config,
          isLive: live,
          ttsStatus,
          theme: config.theme ?? "cinema",
          appInfo,
          openModelsFolder: () => void sublix.openModelsFolder(),
          // Các trường còn lại của `SettingsCtx` không được `SystemStatusPanel` đọc.
        } as unknown as SettingsCtx);
      } catch {
        /* Không đọc được cấu hình → dùng panel rút gọn bên dưới. */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
    <div className="pc-shell">
      <div className="pc-shell-main">
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
            title="Đang chạy nền"
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
                          {CATEGORY_ICONS[meta.key]} <span>{sentenceCase(meta.label)}</span>
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
                            🚀 Mở Studio làm việc
                          </button>
                        )}
                        {task.outputPath && (
                          <button
                            type="button"
                            className="process-btn-secondary"
                            onClick={() => handleReveal(task.outputPath!)}
                            title="Mở thư mục chứa file"
                          >
                            <IconFolder size={12} /> Thư mục
                          </button>
                        )}
                        <button
                          type="button"
                          className="process-btn-secondary"
                          onClick={() => handleCopyPath(task.id, displayName)}
                          title="Sao chép tên file"
                        >
                          {copiedId === task.id ? "✓ Đã chép" : "📋 Tên file"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ShellCard>
        ) : null}

        {/* History Tasks Section — R2-8 mục 16: gọn 1 dòng tiêu đề + 1 dòng meta */}
        <ShellCard
          icon={<IconCheck size={14} />}
          title="Hoàn tất gần đây"
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
                const displayTitle = task.fileName || task.title;
                const counts =
                  task.totalItems && task.totalItems > 0
                    ? `${task.currentItem ?? task.totalItems}/${task.totalItems} câu`
                    : null;

                return (
                  <div key={task.id} className="process-task-card completed history-glass">
                    <div className="process-task-top">
                      <div className="pc-history-head">
                        <h4 className="process-task-title pc-history-title" title={displayTitle}>
                          {displayTitle}
                        </h4>
                        <div className="pc-history-meta">
                          <span className="pc-history-type">{sentenceCase(meta.label)}</span>
                          {counts ? <span>{counts}</span> : null}
                          {task.completedAt ? <span>xong {formatClock(task.completedAt)}</span> : null}
                          {elapsedMs > 0 ? <span>{formatDuration(elapsedMs)}</span> : null}
                        </div>
                      </div>
                      <div className="pc-top-right">
                        <span className={`process-status-pill ${isDone ? "completed" : "error"}`}>
                          {isDone ? "✓ Hoàn tất" : "✕ Lỗi"}
                        </span>
                        {task.targetTab === "studio" && (
                          <button
                            type="button"
                            className="process-btn-jump"
                            onClick={() => onNavigateToTab("studio")}
                          >
                            🚀 Mở lại trong Studio
                          </button>
                        )}
                      </div>
                    </div>

                    {task.error ? (
                      <div className="process-task-stage-line">
                        <span className="stage-detail pc-error">⚠️ {task.error}</span>
                      </div>
                    ) : null}

                    {task.outputPath && (
                      <div className="process-task-output">
                        <span className="output-path" title={task.outputPath}>
                          {task.outputPath}
                        </span>
                        <span className="pc-output-actions">
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
                        </span>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </ShellCard>
      </div>

      {/* Cột phải — R2-8 mục 17: dùng CHUNG "Trạng thái hệ thống" với Cài đặt */}
      <aside className="pc-shell-side">
        {statusCtx ? (
          <SystemStatusPanel ctx={statusCtx} />
        ) : (
          <div className="pc-state">
            <div className="pc-state-title">Trạng thái hệ thống</div>
            <div className="pc-state-row">
              <span className="pc-state-label">Nhận dạng:</span>
              <span className="pc-state-value">
                {typeof sttServerEngine === "string" ? sttServerEngine.toUpperCase() : "Chưa nạp"}
              </span>
            </div>
            <div className="pc-state-row">
              <span className="pc-state-label">Dịch:</span>
              <span className="pc-state-value">{transEnginePref.toUpperCase()}</span>
            </div>
            <div className="pc-state-row">
              <span className="pc-state-label">Đang chạy:</span>
              <span className="pc-state-value">{activeTasks.length}</span>
            </div>
            <p className="pc-hint">
              Thông tin đọc từ cấu hình thật. Xem thêm ở <b>Cài đặt › Trạng thái hệ thống</b>.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

/** `ProcessCenterView` đã bọc `React.memo` (props phải ổn định từ parent). */
export const ProcessCenterView = memo(ProcessCenterViewInner);

export default ProcessCenterView;
