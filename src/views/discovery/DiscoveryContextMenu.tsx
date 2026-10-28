//! TSK-V015-DISC-UI — menu chuột phải (hoặc `Shift+F10`) của một thẻ video.
//!
//! Tách riêng để `DiscoveryView.tsx` còn < 300 dòng.
//! Xem `docs/UI_REDESIGN_PLAN.md` §4.13 (mục 6).

import { openUrl } from "@tauri-apps/plugin-opener";

import type { DiscoveryItem } from "../../lib/tauri";

export interface DiscoveryMenuProps {
  item: DiscoveryItem;
  x: number;
  y: number;
  onDownload: (item: DiscoveryItem) => void;
  onDownloadAndOpen: (item: DiscoveryItem) => void;
  onSearchChannel: (author: string) => void;
  onClose: () => void;
}

export function DiscoveryContextMenu({
  item,
  x,
  y,
  onDownload,
  onDownloadAndOpen,
  onSearchChannel,
  onClose,
}: DiscoveryMenuProps) {
  return (
    <div
      className="dsc-menu"
      style={{ left: x, top: y }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={() => { onDownload(item); onClose(); }}>
        ⬇ Tải về
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => { onDownloadAndOpen(item); onClose(); }}
      >
        🎬 Tải & mở Studio
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          void openUrl(item.url).catch(() => undefined);
          onClose();
        }}
      >
        ↗ Mở trang gốc trong trình duyệt
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          void navigator.clipboard?.writeText(item.url);
          onClose();
        }}
      >
        ⧉ Sao chép link
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          if (item.author) onSearchChannel(item.author);
          onClose();
        }}
      >
        🔍 Tìm thêm của kênh "{item.author || "…"}"
      </button>
    </div>
  );
}

export default DiscoveryContextMenu;
