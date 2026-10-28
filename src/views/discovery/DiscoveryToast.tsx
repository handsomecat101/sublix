//! TSK-V015-DISC-UI — toast "✓ Xong … — đã mở tab trong Studio".
//!
//! Hiện ở cấp app khi mục xếp bằng nút "🎬 Tải & mở Studio" tải xong (xem §4.13 & UI_V015_REVIEW §1).
//! - Hỗ trợ gộp nhiều mục (1 mục ghi tên, 2+ mục ghi số lượng).
//! - Tự tắt sau 8 giây (rê chuột vào thì tạm dừng đếm).
//! - Phím Enter: chuyển ngay sang Studio và mở tab. Phím Esc: đóng toast.

import { useEffect, useRef, useState } from "react";
import { formatStudioToastText } from "./discoveryModel";

export interface DiscoveryToastItem {
  title: string;
  path: string;
}

export interface DiscoveryToastProps {
  title?: string;
  path?: string;
  items?: DiscoveryToastItem[];
  onOpenStudio: (path: string) => void;
  onClose: () => void;
}

export function DiscoveryToast({ title, path, items, onOpenStudio, onClose }: DiscoveryToastProps) {
  const toastItems: DiscoveryToastItem[] = items && items.length > 0
    ? items
    : title && path
    ? [{ title, path }]
    : [];

  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  const targetPath = toastItems.length > 0 ? toastItems[toastItems.length - 1].path : "";
  const toastText = formatStudioToastText(toastItems.map((it) => it.title));

  // Tự ẩn sau 8s; rê chuột vào thì tạm dừng
  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      onClose();
    }, 8000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPaused, onClose, toastItems.length]);

  // Bàn phím: Enter = mở Studio, Esc = đóng
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (targetPath) onOpenStudio(targetPath);
        onClose();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [targetPath, onOpenStudio, onClose]);

  if (toastItems.length === 0) return null;

  return (
    <div
      className="dsc-toast"
      role="status"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      title="Bấm hoặc gõ Enter để đi tới Studio"
    >
      <span className="dsc-toast-text">{toastText}</span>
      <button
        type="button"
        className="dsc-toast-btn"
        onClick={() => {
          if (targetPath) onOpenStudio(targetPath);
          onClose();
        }}
      >
        Đi tới Studio (Enter)
      </button>
      <button
        type="button"
        className="dsc-toast-close"
        onClick={onClose}
        aria-label="Đóng (Esc)"
        title="Đóng (Esc)"
      >
        ✕
      </button>
    </div>
  );
}

export default DiscoveryToast;
