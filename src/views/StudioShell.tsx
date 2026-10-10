import type { ReactNode } from "react";
import "./StudioShell.css";

// Khung 3 cột chuẩn Studio — MỌI tab đều sống trong khung này:
//   TRÁI = bước / tùy chọn · GIỮA = view chính · PHẢI = thuộc tính / chi tiết
// (đáy) = timeline khi tab cần. Cùng phong cách với SublixStudioView.

export function StudioShell({
  left,
  center,
  right,
  bottom,
}: {
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  bottom?: ReactNode;
}) {
  return (
    <div className="studio-shell">
      <div className="studio-shell-cols">
        <div className="studio-shell-col">{left}</div>
        <div className="studio-shell-col studio-shell-center">{center}</div>
        <div className="studio-shell-col">{right}</div>
      </div>
      {bottom ? <div className="studio-shell-bottom">{bottom}</div> : null}
    </div>
  );
}

export function ShellCard({
  icon,
  title,
  badge,
  actions,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="shell-card">
      <div className="shell-card-head">
        {icon}
        <span className="shell-card-title">{title}</span>
        {badge != null && <span className="shell-card-badge">{badge}</span>}
        {actions != null && <div className="shell-card-actions">{actions}</div>}
      </div>
      {children != null && <div className="shell-card-body">{children}</div>}
    </section>
  );
}
