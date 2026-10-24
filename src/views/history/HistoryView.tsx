//! TSK-UI-REDESIGN-R2-7B — tab **Lịch sử** (UI_REDESIGN_PLAN §4.6).
//!
//! Bố cục mới: **2 cột** (danh sách + ô tìm + thanh công cụ | chi tiết câu) —
//! bỏ cột trái 300 px chỉ chứa 4 nút.
//!
//! Thanh công cụ: `Sao chép tất cả` · `Xuất ▾ (SRT/TXT)` (`SplitButton`) · `⋯`
//! → "Xoá toàn bộ lịch sử" (nút nguy hiểm **vào menu** + hộp xác nhận, hết
//! nổi bật nhất màn hình).
//!
//! Toàn bộ định dạng file nằm trong `historyLogic.ts` (hàm thuần → test được).

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { ContextMenu, type ContextMenuItem } from "../../components/ui/ContextMenu";
import { SplitButton } from "../../components/ui/SplitButton";
import { IconCopy, IconFileText, IconMoreHorizontal, IconSearch, IconTrash } from "../../icons";
import spotHistoryUrl from "../../assets/spot-history.jpg";
import type { LiveStatus, LiveSubPreview } from "../live/liveTypes";
import {
  buildCopyText,
  buildSingleCopyText,
  buildSrtContent,
  buildTxtContent,
  exportFileName,
  filterHistory,
  UTF8_BOM,
} from "./historyLogic";
import "./HistoryView.css";

/** Props của `HistoryView` — state/handler đến từ parent. */
export interface HistoryViewProps {
  /** Toàn bộ lịch sử (mới nhất trước). */
  items: readonly LiveSubPreview[];
  /** Từ khoá tìm kiếm. */
  search: string;
  /** Đổi từ khoá tìm kiếm. */
  onSearchChange: (value: string) => void;
  /** Id của câu đang chọn (`null` = chưa chọn). */
  selectedId: number | null;
  /** Chọn (hoặc bỏ chọn) một câu. */
  onSelect: (item: LiveSubPreview | null) => void;
  /** Đang ghi Live hay không (hiển thị trạng thái "đang tự động lưu"). */
  isLive: boolean;
  /** Xoá toàn bộ lịch sử. */
  onClearAll: () => void;
  /** Báo trạng thái lên topbar (tuỳ chọn). */
  onStatus?: (status: LiveStatus) => void;
}

/** Vị trí menu (tọa độ client) — `null` = đóng. */
interface MenuPos {
  x: number;
  y: number;
}

/** Tải file từ nội dung text (Blob) — dùng chung cho SRT + TXT. */
function downloadTextFile(content: string, fileName: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function HistoryViewInner({
  items,
  search,
  onSearchChange,
  selectedId,
  onSelect,
  isLive,
  onClearAll,
  onStatus,
}: HistoryViewProps) {
  const [exportMenu, setExportMenu] = useState<MenuPos | null>(null);
  const [moreMenu, setMoreMenu] = useState<MenuPos | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const exportAnchorRef = useRef<HTMLDivElement | null>(null);
  const moreAnchorRef = useRef<HTMLButtonElement | null>(null);

  const report = useCallback(
    (status: LiveStatus) => {
      onStatus?.(status);
    },
    [onStatus],
  );

  /** Danh sách đã lọc theo từ khoá. */
  const filtered = useMemo(() => filterHistory(items, search), [items, search]);

  /** Câu đang chọn (tra cứu từ danh sách gốc để không bị "cũ" khi lọc). */
  const selected = useMemo(
    () => (selectedId == null ? null : items.find((item) => item.id === selectedId) ?? null),
    [items, selectedId],
  );

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(event.target.value);
    },
    [onSearchChange],
  );

  const handleSelect = useCallback(
    (item: LiveSubPreview) => {
      onSelect(item);
    },
    [onSelect],
  );

  /** Sao chép toàn bộ lịch sử. */
  const handleCopyAll = useCallback(async () => {
    if (items.length === 0) return;
    const text = buildCopyText(items);
    try {
      await navigator.clipboard.writeText(text);
      report({ kind: "success", message: `📋 Đã sao chép ${items.length} câu vào Clipboard!` });
    } catch (e) {
      report({ kind: "error", message: `Sao chép thất bại: ${e}` });
    }
  }, [items, report]);

  /** Xuất file .srt (chuẩn phụ đề, có BOM UTF-8). */
  const handleExportSrt = useCallback(() => {
    if (items.length === 0) return;
    const srt = buildSrtContent(items);
    downloadTextFile(
      UTF8_BOM + srt,
      exportFileName("subtitles", "srt"),
      "text/plain;charset=utf-8",
    );
    setExportMenu(null);
    report({
      kind: "success",
      message: `🎬 Đã xuất file phụ đề chuẩn .srt (${items.length} câu) thành công!`,
    });
  }, [items, report]);

  /** Xuất file .txt (bản gốc + bản dịch). */
  const handleExportTxt = useCallback(() => {
    if (items.length === 0) return;
    const text = buildTxtContent(items);
    downloadTextFile(text, exportFileName("transcript", "txt"), "text/plain;charset=utf-8");
    setExportMenu(null);
    report({ kind: "success", message: "💾 Đã xuất file văn bản .txt thành công!" });
  }, [items, report]);

  /** Sao chép riêng câu đang chọn. */
  const handleCopySelected = useCallback(async () => {
    const text = buildSingleCopyText(selected);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      report({ kind: "success", message: "📋 Đã sao chép câu này." });
    } catch (e) {
      report({ kind: "error", message: `Sao chép thất bại: ${e}` });
    }
  }, [report, selected]);

  /** Mở menu xuất ngay dưới nút. */
  const handleToggleExportMenu = useCallback(() => {
    setExportMenu((prev) => {
      if (prev) return null;
      const rect = exportAnchorRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return { x: Math.max(8, rect.right - 200), y: rect.bottom + 6 };
    });
    setMoreMenu(null);
  }, []);

  /** Mở menu "⋯" ngay dưới nút. */
  const handleToggleMoreMenu = useCallback(() => {
    setMoreMenu((prev) => {
      if (prev) return null;
      const rect = moreAnchorRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return { x: Math.max(8, rect.right - 210), y: rect.bottom + 6 };
    });
    setExportMenu(null);
  }, []);

  /** Mục menu "⋯" (nút nguy hiểm nằm trong menu, không phải nút đỏ toàn màn hình). */
  const moreItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        id: "clear",
        label: "Xoá toàn bộ lịch sử",
        hint: `${items.length} câu`,
        danger: true,
        disabled: items.length === 0,
        onSelect: () => setConfirmClear(true),
      },
    ],
    [items.length],
  );

  /** Xác nhận xoá toàn bộ lịch sử. */
  const handleConfirmClear = useCallback(() => {
    onClearAll();
    setConfirmClear(false);
    report({ kind: "success", message: "🗑 Đã xoá toàn bộ lịch sử." });
  }, [onClearAll, report]);

  const handleCancelClear = useCallback(() => {
    setConfirmClear(false);
  }, []);

  const hasItems = items.length > 0;

  return (
    <div className="hv-root">
      {/* ── Cột trái: danh sách + tìm + thanh công cụ ───────────────────── */}
      <section className="hv-list-col">
        <div className="hv-toolbar">
          <div className="hv-search">
            <IconSearch size={13} />
            <input
              type="text"
              className="hv-input"
              placeholder="Tìm câu thoại…"
              value={search}
              onChange={handleSearchChange}
              aria-label="Tìm câu thoại"
            />
            <span className="hv-count">
              {filtered.length}/{items.length}
            </span>
          </div>

          <div className="hv-tools">
            <button
              type="button"
              className="hv-btn"
              onClick={handleCopyAll}
              disabled={!hasItems}
              title="Sao chép toàn bộ lịch sử vào Clipboard"
            >
              <IconCopy size={12} />
              Sao chép tất cả
            </button>

            <div className="hv-export-wrap" ref={exportAnchorRef}>
              <SplitButton
                label="Xuất .SRT"
                title="Xuất file phụ đề chuẩn .srt"
                menuTitle="Chọn định dạng xuất"
                menuOpen={exportMenu !== null}
                disabled={!hasItems}
                onPrimary={handleExportSrt}
                onToggleMenu={handleToggleExportMenu}
              />
            </div>

            <button
              type="button"
              className="hv-icon-btn"
              ref={moreAnchorRef}
              onClick={handleToggleMoreMenu}
              title="Thao tác khác"
              aria-label="Thao tác khác"
              aria-haspopup="menu"
              aria-expanded={moreMenu !== null}
            >
              <IconMoreHorizontal size={13} />
            </button>
          </div>
        </div>

        {exportMenu ? (
          <ContextMenu
            x={exportMenu.x}
            y={exportMenu.y}
            items={[
              { id: "srt", label: "Xuất .SRT (phụ đề chuẩn)", onSelect: handleExportSrt },
              { id: "txt", label: "Xuất .TXT (bản gốc + bản dịch)", onSelect: handleExportTxt },
            ]}
            onClose={() => setExportMenu(null)}
          />
        ) : null}

        {moreMenu ? (
          <ContextMenu
            x={moreMenu.x}
            y={moreMenu.y}
            items={moreItems}
            onClose={() => setMoreMenu(null)}
          />
        ) : null}

        {confirmClear ? (
          <div className="hv-confirm" role="alertdialog" aria-label="Xác nhận xoá lịch sử">
            <span className="hv-confirm-text">
              Xoá toàn bộ lịch sử ({items.length} câu)? Không thể hoàn tác.
            </span>
            <span className="hv-confirm-actions">
              <button type="button" className="hv-btn" onClick={handleCancelClear}>
                Huỷ
              </button>
              <button
                type="button"
                className="hv-btn hv-btn-danger"
                onClick={handleConfirmClear}
              >
                <IconTrash size={12} />
                Xoá
              </button>
            </span>
          </div>
        ) : null}

        <div className="hv-list">
          {filtered.length > 0 ? (
            filtered.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`hv-item${isSelected ? " selected" : ""}`}
                  onClick={() => handleSelect(item)}
                  aria-pressed={isSelected}
                >
                  <span className="hv-item-top">
                    <span className="hv-item-id">#{item.id}</span>
                    <span className="hv-item-timing">
                      {item.stt_duration ? `STT: ${item.stt_duration.toFixed(2)}s` : ""}
                      {item.translate_duration ? ` • LLM: ${item.translate_duration.toFixed(2)}s` : ""}
                    </span>
                  </span>
                  {item.original ? (
                    <span className="hv-item-orig">{item.original}</span>
                  ) : null}
                  <span className="hv-item-trans">{item.text}</span>
                </button>
              );
            })
          ) : (
            <div className="hv-empty">
              <img className="hv-empty-img" src={spotHistoryUrl} alt="" />
              <p className="hv-empty-text">
                {hasItems
                  ? "Không tìm thấy câu thoại nào khớp với từ khoá tìm kiếm."
                  : "Chưa có lời thoại nào được ghi nhận. Mở video rồi bấm “Bắt đầu Live” ở tab Live — mọi câu sẽ được lưu tự động vào đây."}
              </p>
            </div>
          )}
        </div>

        <div className="hv-foot">
          {isLive ? "🔴 Đang tự động lưu câu mới khi phát…" : "⏸ Tạm dừng ghi"}
        </div>
      </section>

      {/* ── Cột phải: chi tiết câu ─────────────────────────────────────── */}
      <aside className="hv-detail-col">
        <div className="hv-detail-head">
          <IconFileText size={14} />
          <span className="hv-detail-title">Chi tiết câu thoại</span>
        </div>

        {selected ? (
          <div className="hv-detail-body">
            <div className="hv-detail-row">
              <span className="hv-detail-id">Câu #{selected.id}</span>
              <span className="hv-detail-timing">
                {selected.stt_duration ? `STT: ${selected.stt_duration.toFixed(2)}s` : ""}
                {selected.translate_duration
                  ? ` • LLM: ${selected.translate_duration.toFixed(2)}s`
                  : ""}
              </span>
            </div>

            {selected.original ? (
              <div className="hv-detail-block">
                <div className="hv-detail-label">Bản gốc</div>
                <div className="hv-detail-orig">{selected.original}</div>
              </div>
            ) : null}

            <div className="hv-detail-block">
              <div className="hv-detail-label">Bản dịch</div>
              <div className="hv-detail-trans">{selected.text}</div>
            </div>

            <button type="button" className="hv-btn" onClick={handleCopySelected}>
              <IconCopy size={12} />
              Sao chép câu này
            </button>
          </div>
        ) : (
          <div className="hv-empty hv-empty-detail">
            <p className="hv-empty-text">
              Bấm chọn một câu thoại trong danh sách để xem chi tiết bản gốc và bản dịch.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

/** `HistoryView` đã bọc `React.memo` (props phải ổn định từ parent). */
export const HistoryView = memo(HistoryViewInner);

export default HistoryView;
