//! TSK-V015-DISC-UI — hàng đợi mini ở đáy tab "Khám phá".
//!
//! - "⬇ Hàng đợi: N đang tải · M đợi" + tối đa 3 mục (tên + thanh + %).
//! - "Xem ở Tải về ›" ⇒ chuyển sang tab con Tải về.
//! - **Ẩn** khi hàng đợi rỗng.
//! - Đọc từ **cùng state hàng đợi** của DownloaderView (không gọi lệnh mới).
//!
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (mục 7).

export interface MiniQueueItem {
  id: string;
  title: string;
  status: "queued" | "downloading" | "paused" | "completed" | "error" | "cancelled";
  percent: number;
}

export interface MiniQueueBarProps {
  items: MiniQueueItem[];
  onOpenDownloader: () => void;
}

export function MiniQueueBar({ items, onOpenDownloader }: MiniQueueBarProps) {
  if (items.length === 0) return null;

  const downloading = items.filter((i) => i.status === "downloading").length;
  const waiting = items.filter((i) => i.status === "queued" || i.status === "paused").length;
  const visible = items
    .filter((i) => i.status === "downloading" || i.status === "queued" || i.status === "paused")
    .slice(0, 3);

  return (
    <div className="dsc-miniq">
      <div className="dsc-miniq-head">
        <span className="dsc-miniq-count">
          ⬇ Hàng đợi: {downloading} đang tải · {waiting} đợi
        </span>
        <button type="button" className="dsc-link-btn" onClick={onOpenDownloader}>
          Xem ở Tải về ›
        </button>
      </div>
      {visible.length > 0 && (
        <div className="dsc-miniq-items">
          {visible.map((item) => (
            <div className="dsc-miniq-item" key={item.id} title={item.title}>
              <span className="dsc-miniq-name">{item.title}</span>
              <span className="dsc-miniq-bar">
                <span className="dsc-miniq-bar-fill" style={{ width: `${Math.max(2, item.percent)}%` }} />
              </span>
              <span className="dsc-miniq-pct">
                {item.status === "queued" ? "⏳" : `${Math.round(item.percent)}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MiniQueueBar;
