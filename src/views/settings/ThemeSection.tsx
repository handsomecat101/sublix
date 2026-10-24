//! TSK-UI-REDESIGN-R2-5: mục "Chủ đề" (thay 4 chấm theme trên topbar — PLAN §4.2).

import type { SettingsCtx } from "./types";

export function ThemeSection({ ctx }: { ctx: SettingsCtx }) {
  return (
    <section className="settings-section st-card">
      <div className="st-sec-head">
        <h2>🎨 Chủ đề & giao diện</h2>
        <span className="st-hint">Đổi ngay khi bấm — tự lưu vào cấu hình.</span>
      </div>

      <div className="st-themes">
        {ctx.themes.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`st-theme${ctx.theme === t.id ? " on" : ""}`}
            onClick={() => ctx.setTheme(t.id)}
          >
            <span className={`st-theme-dot t-${t.id}`} />
            <span className="st-theme-text">
              <b>{t.label}</b>
              <small>{t.hint}</small>
            </span>
            {ctx.theme === t.id && <span className="st-pill ok">Đang dùng</span>}
          </button>
        ))}
      </div>

      <div className="st-hint">
        Ngôn ngữ đích mặc định và phong cách dịch nằm ở mục <b>Dịch thuật</b>; cỡ chữ / vị trí overlay
        nằm ở mục <b>Overlay Live</b>.
      </div>
    </section>
  );
}
