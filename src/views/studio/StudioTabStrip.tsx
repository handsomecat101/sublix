// [TSK-TABS-P1] Thanh tab Studio — Cinema Dark, bám `docs/ui-mockups/studio-tabs.html`
// và UI_REDESIGN_PLAN §4.11 (34 px, tab 200→120 px, vòng tiến độ conic, ✕ khi hover).

import { createContext, memo, useContext } from "react";
import { middleTruncate, type StudioTab } from "../../lib/studio/tabsModel";
import "./studioTabs.css";

export interface StudioTabStripProps {
  /** Danh sách tab (mới nhất cuối). */
  tabs: StudioTab[];
  /** Id tab đang chọn. */
  activeId: string | null;
  /** Chọn tab. */
  onSelect: (id: string) => void;
  /** Đóng tab (host hỏi nếu tab đang chạy việc). */
  onClose: (id: string) => void;
  /** Mở tab mới (video khác). */
  onAdd: () => void;
}

/**
 * [TSK-TABS-P1] Context của thanh tab.
 *
 * Thanh tab nằm BÊN TRONG instance đang active (đúng §4.11: ngay dưới
 * `MasterTopbar`). Nhưng nếu host truyền `tabs` qua props thì mỗi lần trạng thái
 * tab khác đổi ⇒ instance re-render ⇒ **timeline render lại**. Vì vậy thanh tab đọc
 * dữ liệu qua CONTEXT: chỉ thanh tab re-render, instance (và timeline) thì không.
 */
export type StudioTabsContextValue = StudioTabStripProps;

export const StudioTabsContext = createContext<StudioTabsContextValue | null>(null);

/** Ô biểu tượng trạng thái (1 ô cố định 14 px — không thêm huy hiệu). */
function TabStateIcon({ tab }: { tab: StudioTab }) {
  if (tab.busy === "running") {
    return (
      <span
        className="sts-ring"
        style={{ ["--p" as string]: String(Math.max(2, Math.round(tab.percent))) }}
        title={`Đang chạy — ${Math.round(tab.percent)}%`}
      />
    );
  }
  if (tab.busy === "queued") {
    return <span className="sts-ring q" title="Chờ lượt" />;
  }
  if (tab.busy === "error") {
    return <span className="sts-ic sts-ic-err" title="Lỗi — mở tab để xem" />;
  }
  if (tab.busy === "done") {
    return <span className="sts-ic sts-ic-done" title="Xong, chưa xem" />;
  }
  return <span className="sts-ic sts-ic-idle" title="Nghỉ" />;
}

/** Tên cắt giữa — dấu "…" làm mờ như mockup (`Phim_ngan_CN_…tap03`). */
function TabName({ title }: { title: string }) {
  const short = middleTruncate(title, 20);
  const cut = short === title ? -1 : short.indexOf("…");
  if (cut < 0) return <span className="sts-tab-name">{short}</span>;
  return (
    <span className="sts-tab-name">
      {short.slice(0, cut)}
      <em>…</em>
      {short.slice(cut + 1)}
    </span>
  );
}

function StudioTabStripInner({ tabs, activeId, onSelect, onClose, onAdd }: StudioTabStripProps) {
  const runningCount = tabs.filter((tab) => tab.busy === "running" || tab.busy === "queued").length;
  return (
    <div className="sts-strip" role="tablist" aria-label="Tab video trong Studio">
      <div className="sts-tabs-scroll">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`sts-tab${active ? " on" : ""}${tab.busy === "done" ? " unseen" : ""}`}
              title={tab.path || tab.title}
              onClick={() => onSelect(tab.id)}
              onDoubleClick={() => onSelect(tab.id)}
            >
              <span className="sts-tab-ic">
                <TabStateIcon tab={tab} />
              </span>
              <TabName title={tab.title || "Video mới"} />
              {tab.busy === "running" ? (
                <span className="sts-tab-pct">{Math.round(tab.percent)}%</span>
              ) : tab.busy === "queued" ? (
                <span className="sts-tab-pct is-wait">chờ</span>
              ) : null}
              <button
                type="button"
                className="sts-tab-x"
                title="Đóng tab"
                aria-label={`Đóng tab ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <button type="button" className="sts-add" title="Mở video thành tab mới" onClick={onAdd}>
        ＋
      </button>

      {runningCount > 0 ? (
        <div className="sts-strip-r">
          <span className="sts-busy-count" title={`${runningCount} việc đang chạy/chờ`}>
            <span className="sts-busy-dot" />
            {runningCount} việc
          </span>
        </div>
      ) : null}
    </div>
  );
}

export const StudioTabStrip = memo(StudioTabStripInner);

/**
 * [TSK-TABS-P1] Thanh tab đọc dữ liệu từ context (xem `StudioTabsContext`).
 * Phần tử này được tạo 1 lần (useMemo) nên prop `belowTopbar` của instance luôn
 * ỔN ĐỊNH ⇒ `React.memo` giữ được instance ⇒ timeline không render lại khi
 * trạng thái tab KHÁC đổi.
 */
export function StudioTabStripConnected() {
  const ctx = useContext(StudioTabsContext);
  if (!ctx) return null;
  return <StudioTabStrip {...ctx} />;
}

export default StudioTabStrip;
