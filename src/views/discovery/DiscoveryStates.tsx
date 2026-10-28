//! TSK-V015-DISC-UI — các trạng thái của lưới "Khám phá".
//!
//! | Trạng thái | Hiện |
//! |---|---|
//! | Đang tải | skeleton đúng kích thước thẻ, đủ 1 màn |
//! | Trống | 🔍 + gợi ý + nút "Thử từ rút gọn" · "Tìm trên YouTube" (không bao giờ khung trơn) |
//! | Lỗi mạng | 📡 + nút **↻ Thử lại** + 1 dòng mono chi tiết |
//! | Bị chặn | ⛔ + gợi ý "thử từ khoá tiếng Trung" + nút Thử lại **đếm ngược** |
//! | YouTube chưa có key | 🔑 màn giải thích |
//!
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (bảng "Trạng thái").

import { formatCountdown } from "./discoveryModel";
import type { DiscoveryErrorInfo } from "./discoveryErrors";

/** Skeleton đúng kích thước thẻ — đủ 1 màn. */
export function DiscoverySkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="dsc-grid" role="grid" aria-busy="true" aria-label="Đang tải danh sách">
      {Array.from({ length: count }, (_, i) => (
        <div className="dsc-card dsc-card-skeleton" key={i} aria-hidden="true">
          <div className="dsc-thumb dsc-skel-thumb" />
          <div className="dsc-body">
            <div className="dsc-skel-line dsc-skel-line-2" />
            <div className="dsc-skel-line dsc-skel-line-1" />
            <div className="dsc-skel-line dsc-skel-line-1 dsc-skel-short" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Không có kết quả — có gợi ý + nút hành động (không bao giờ khung trơn). */
export function DiscoveryEmpty({
  query,
  onShorter,
  onYouTube,
  onEnableAutoTranslate,
}: {
  query: string;
  onShorter: () => void;
  onYouTube: () => void;
  onEnableAutoTranslate?: () => void;
}) {
  return (
    <div className="dsc-state" role="status">
      <div className="dsc-state-icon">🔍</div>
      <div className="dsc-state-title">Không có video nào cho "{query}"</div>
      <div className="dsc-state-sub">
        Bilibili tìm tốt nhất bằng tiếng Trung — bật 文 Tự dịch hoặc thử tên game tiếng Trung.
      </div>
      <div className="dsc-state-actions">
        {onEnableAutoTranslate && (
          <button type="button" className="dsc-btn" onClick={onEnableAutoTranslate}>
            文 Bật tự dịch
          </button>
        )}
        <button type="button" className="dsc-btn" onClick={onShorter}>
          Thử "{query.split(/\s+/)[0] ?? query}"
        </button>
        <button type="button" className="dsc-btn dsc-btn-main" onClick={onYouTube}>
          ▶ Tìm trên YouTube
        </button>
      </div>
    </div>
  );
}

/** Lỗi mạng / bị chặn / lỗi chung — dùng chung một khung. */
export function DiscoveryError({
  error,
  retryIn,
  onRetry,
  onFallback,
  fallbackLabel,
}: {
  error: DiscoveryErrorInfo;
  /** Số giây còn lại của đếm ngược (0 = cho thử lại ngay). */
  retryIn: number;
  onRetry: () => void;
  /** Lối sang danh sách còn dùng được. */
  onFallback?: () => void;
  fallbackLabel?: string;
}) {
  const blocked = error.code === "blocked";
  const icon = blocked ? "⛔" : error.code === "network" ? "📡" : "⚠️";
  const canRetryNow = error.canRetry && retryIn <= 0;

  return (
    <div className={`dsc-state dsc-state-err${blocked ? " dsc-state-blocked" : ""}`} role="alert">
      <div className="dsc-state-icon">{icon}</div>
      <div className="dsc-state-title">{error.title}</div>
      <div className="dsc-state-sub">{error.detail}</div>
      {error.hint && <div className="dsc-state-hint">{error.hint}</div>}
      <div className="dsc-state-actions">
        {error.canRetry &&
          (canRetryNow ? (
            <button type="button" className="dsc-btn dsc-btn-main" onClick={onRetry}>
              ↻ Thử lại
            </button>
          ) : (
            <button type="button" className="dsc-btn" disabled>
              ⏱ Thử lại sau {formatCountdown(retryIn)}
            </button>
          ))}
        {onFallback && (
          <button type="button" className="dsc-btn" onClick={onFallback}>
            {fallbackLabel || "Về danh sách khác"}
          </button>
        )}
      </div>
    </div>
  );
}

/** YouTube chưa có API key — nấc A chỉ tìm kiếm được YouTube. */
export function DiscoveryNoKey({ onSearch }: { onSearch: () => void }) {
  return (
    <div className="dsc-state" role="status">
      <div className="dsc-state-icon">🔑</div>
      <div className="dsc-state-title">YouTube chưa có API key</div>
      <div className="dsc-state-sub">
        Danh sách "Đang hot" của YouTube cần Google API key (miễn phí). Bạn vẫn tìm được YouTube bằng từ khoá — hoặc bấm 1 chip xu hướng.
      </div>
      <div className="dsc-state-actions">
        <button type="button" className="dsc-btn dsc-btn-main" onClick={onSearch}>
          ⌕ Tìm trên YouTube
        </button>
      </div>
    </div>
  );
}

export default DiscoverySkeleton;
