import { memo, useState, type ReactNode } from "react";
import { ContextMenu, type ContextMenuItem } from "../components/ui/ContextMenu";
import "./MasterTopbar.css";

/**
 * MasterTopbar — thanh trên DÙNG CHUNG cho cả 6 tab (R2-2).
 *
 * Thay 2 bản copy trước đây (Studio + SettingsView) vì chúng lệch nhau:
 * Studio thiếu badge "đang tải / LIVE / tiến trình", tab khác lại thiếu
 * nút Hoàn tác / Xuất → chuyển tab là thanh trên "nhảy" (TL-18).
 *
 * Cấu trúc: `[Logo] [6 tab + badge] —— [vùng ngữ cảnh] —— [trạng thái] [↶] [👁] [nút chính]`
 *
 * - Nút ↶ (hoàn tác): chuột phải → menu chọn lớp hoàn tác (Audio / Bản dịch / Phụ đề).
 * - Không còn 4 chấm đổi theme ở đây (chuyển sang Cài đặt › Chủ đề).
 * - Không còn nút "Tiến Trình" dạng modal → chip trạng thái bấm được sang tab Tiến trình.
 */

/** Một tab trên thanh trên. */
export interface MasterTopbarTab {
  /** Id tab (truyền lại cho `onNavigateTab`). */
  id: string;
  /** Nhãn hiển thị. */
  label: string;
  /** Icon (tuỳ chọn). */
  icon?: ReactNode;
  /** Badge (số tải đang chạy / LIVE / số tiến trình). */
  badge?: string | number | null;
}

/** Một lớp hoàn tác (Audio / Bản dịch / Phụ đề). */
export interface MasterTopbarUndoLayer {
  id: string;
  label: string;
  onUndo: () => void;
}

/** Một lớp làm lại (Redo). */
export interface MasterTopbarRedoLayer {
  id: string;
  label: string;
  onRedo: () => void;
}

/** Props của `MasterTopbar`. */
export interface MasterTopbarProps {
  /** Phiên bản app (hiện ở logo). */
  version: string;
  /** Danh sách tab. */
  tabs: MasterTopbarTab[];
  /** Tab đang active. */
  activeTab: string;
  /** Chuyển tab. */
  onNavigateTab: (tabId: string) => void;
  /** Nhãn trạng thái (vd "Sẵn sàng", "⚡ 2 tác vụ"). */
  statusLabel?: string;
  /** Bấm chip trạng thái (vd sang tab Tiến trình). */
  onStatusClick?: () => void;
  /** Nút Overlay (một biểu tượng 👁). */
  overlay?: { onClick: () => void; title?: string };
  /** Nút hoàn tác + các lớp hoàn tác (menu chuột phải). */
  undo?: { onUndo: () => void; layers: MasterTopbarUndoLayer[] };
  /** Nút làm lại (Redo) + các lớp (menu chuột phải). */
  redo?: { onRedo: () => void; layers: MasterTopbarRedoLayer[]; disabled?: boolean };
  /** Vùng ngữ cảnh giữa (vd chip tên file + nút Mở video của Studio). */
  children?: ReactNode;
  /** Nút chính (chỉ Studio có: Xuất video). */
  primary?: { label: string; icon?: ReactNode; onClick: () => void; title?: string };
}

function MasterTopbarInner({
  version,
  tabs,
  activeTab,
  onNavigateTab,
  statusLabel,
  onStatusClick,
  overlay,
  undo,
  redo,
  children,
  primary,
}: MasterTopbarProps) {
  const [undoMenu, setUndoMenu] = useState<{ x: number; y: number } | null>(null);
  const [redoMenu, setRedoMenu] = useState<{ x: number; y: number } | null>(null);

  const undoItems: ContextMenuItem[] = undo
    ? undo.layers.map((layer) => ({
        id: layer.id,
        label: `↶ ${layer.label}`,
        onSelect: layer.onUndo,
      }))
    : [];

  const redoItems: ContextMenuItem[] = redo
    ? redo.layers.map((layer) => ({
        id: layer.id,
        label: `↷ ${layer.label}`,
        onSelect: layer.onRedo,
      }))
    : [];

  return (
    <header className="master-topbar">
      <div className="master-topbar-brand">
        <div className="master-brand-logo">🎬</div>
        <span className="master-brand-title">SUBLIX STUDIO</span>
        <span className="master-brand-ver">v{version}</span>
      </div>

      <nav className="master-topbar-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`master-tab${tab.id === activeTab ? " on" : ""}`}
            onClick={() => onNavigateTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== null && tab.badge !== undefined && tab.badge !== "" ? (
              <span className="master-tab-badge">{tab.badge}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="master-topbar-context">{children}</div>

      <div className="master-topbar-right">
        {statusLabel ? (
          <button
            type="button"
            className="master-status-pill"
            onClick={onStatusClick}
            title={onStatusClick ? "Mở Tiến trình" : undefined}
          >
            <span className="master-dot" />
            {statusLabel}
          </button>
        ) : null}

        {undo ? (
          <button
            type="button"
            className="master-icon-btn"
            title="Hoàn tác (Ctrl+Z) — chuột phải: chọn lớp hoàn tác"
            onClick={undo.onUndo}
            onContextMenu={(event) => {
              event.preventDefault();
              setUndoMenu({ x: event.clientX, y: event.clientY });
            }}
          >
            ↶
          </button>
        ) : null}

        {redo ? (
          <button
            type="button"
            className="master-icon-btn"
            disabled={redo.disabled === true}
            title="Làm lại (Ctrl+Shift+Z hoặc Ctrl+Y) — chuột phải: chọn lớp làm lại"
            onClick={redo.onRedo}
            onContextMenu={(event) => {
              event.preventDefault();
              setRedoMenu({ x: event.clientX, y: event.clientY });
            }}
          >
            ↷
          </button>
        ) : null}

        {overlay ? (
          <button
            type="button"
            className="master-icon-btn"
            title={overlay.title ?? "Overlay (Ctrl+Shift+O)"}
            onClick={overlay.onClick}
          >
            👁
          </button>
        ) : null}

        {primary ? (
          <button
            type="button"
            className="master-btn primary"
            title={primary.title}
            onClick={primary.onClick}
          >
            {primary.icon}
            {primary.label}
          </button>
        ) : null}
      </div>

      {undoMenu && undoItems.length > 0 ? (
        <ContextMenu
          x={undoMenu.x}
          y={undoMenu.y}
          items={undoItems}
          onClose={() => setUndoMenu(null)}
        />
      ) : null}

      {redoMenu && redoItems.length > 0 ? (
        <ContextMenu
          x={redoMenu.x}
          y={redoMenu.y}
          items={redoItems}
          onClose={() => setRedoMenu(null)}
        />
      ) : null}
    </header>
  );
}

/** Thanh trên dùng chung — bọc `React.memo`. */
export const MasterTopbar = memo(MasterTopbarInner);

export default MasterTopbar;
