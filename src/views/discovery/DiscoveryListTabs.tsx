//! TSK-V015-DISC-UI — hàng nút chọn danh sách + tuổi cache + nút tải lại.
//!
//! - `🔥 Đang hot` · `🏆 Bảng xếp hạng` (Bilibili) · nút viền đứt `⌕ "từ khoá" ✕`
//!   khi đang ở chế độ tìm kiếm.
//! - YouTube chưa có API key ⇒ `🔥 Đang hot` hiện 🔒 (nấc A chỉ tìm được YouTube).
//! - `↻` (Tải lại) ⇒ gọi lệnh với `force = true`.
//!
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (mục 4).

import { formatCountdown } from "./discoveryModel";
import type { DiscoveryList, DiscoverySource } from "./discoveryModel";

export interface DiscoveryListTabsProps {
  source: DiscoverySource;
  list: DiscoveryList;
  /** Từ khoá đã gửi (rỗng = không ở chế độ tìm kiếm). */
  query: string;
  /** Số video đang hiện. */
  count: number;
  /** Tổng số (nếu biết). */
  total?: number | null;
  /** Tuổi cache (phút). */
  ageMinutes: number | null;
  loading: boolean;
  /** Còn trang sau không (đã tải hết chưa). */
  hasMore: boolean;
  /** Đếm ngược "Thử lại" còn bao nhiêu giây (0 = không chặn). */
  retryIn: number;
  onSelect: (list: DiscoveryList) => void;
  onClearSearch: () => void;
  onReload: () => void;
}

export function DiscoveryListTabs({
  source,
  list,
  query,
  count,
  total,
  ageMinutes,
  loading,
  hasMore,
  retryIn,
  onSelect,
  onClearSearch,
  onReload,
}: DiscoveryListTabsProps) {
  const isSearch = list === "search" && query.trim().length > 0;
  const youtubeHotLocked = source === "youtube";

  return (
    <div className="dsc-listtabs">
      <div className="dsc-listtabs-left">
        <button
          type="button"
          className={`dsc-listbtn${list === "hot" && !isSearch ? " dsc-listbtn-on" : ""}`}
          onClick={() => onSelect("hot")}
          disabled={youtubeHotLocked}
          title={
            youtubeHotLocked
              ? "YouTube chưa có API key — nấc A chỉ tìm kiếm được YouTube"
              : "Danh sách đang hot"
          }
        >
          🔥 Đang hot {youtubeHotLocked ? "🔒" : ""}
        </button>

        {source === "bilibili" && (
          <button
            type="button"
            className={`dsc-listbtn${list === "ranking" ? " dsc-listbtn-on" : ""}`}
            onClick={() => onSelect("ranking")}
            title="Bảng xếp hạng Bilibili (100 video)"
          >
            🏆 Bảng xếp hạng
          </button>
        )}

        {isSearch && (
          <button
            type="button"
            className="dsc-listbtn dsc-listbtn-search"
            onClick={onClearSearch}
            title="Bỏ kết quả tìm kiếm"
          >
            ⌕ "{query}" ✕
          </button>
        )}
      </div>

      <div className="dsc-listtabs-right">
        {retryIn > 0 && (
          <span className="dsc-retry-count" aria-live="polite">
            Thử lại sau {formatCountdown(retryIn)}
          </span>
        )}
        <span className="dsc-count">
          {count}
          {total ? ` / ${total}` : ""} video
          {ageMinutes !== null && ` · ${ageMinutes} phút trước`}
        </span>
        <button
          type="button"
          className="dsc-icon-btn"
          onClick={onReload}
          disabled={loading}
          title={loading ? "Đang tải…" : "Tải lại (bỏ cache)"}
        >
          ↻
        </button>
        {!hasMore && count > 0 && !loading && (
          <span className="dsc-dash" aria-hidden="true">
            —
          </span>
        )}
      </div>
    </div>
  );
}

export default DiscoveryListTabs;
