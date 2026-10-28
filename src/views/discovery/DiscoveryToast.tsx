//! TSK-V015-DISC-UI — toast "✓ Xong … — đã mở tab trong Studio".
//!
//! Hiện khi mục xếp bằng nút "🎬 Tải & mở Studio" tải xong (xem §4.13 mục 6).

export interface DiscoveryToastProps {
  title: string;
  /** Đường dẫn file đã tải ⇒ mở tab Studio tương ứng. */
  path: string;
  onOpenStudio: (path: string) => void;
  onClose: () => void;
}

export function DiscoveryToast({ title, path, onOpenStudio, onClose }: DiscoveryToastProps) {
  return (
    <div className="dsc-toast" role="status">
      <span className="dsc-toast-text">✓ Xong {title} — đã mở tab trong Studio</span>
      <button
        type="button"
        className="dsc-toast-btn"
        onClick={() => {
          onOpenStudio(path);
          onClose();
        }}
      >
        Đi tới Studio
      </button>
      <button
        type="button"
        className="dsc-toast-close"
        onClick={onClose}
        aria-label="Đóng"
      >
        ✕
      </button>
    </div>
  );
}

export default DiscoveryToast;
