//! TSK-UI-REDESIGN-R2-5: cột điều hướng Cài đặt (nhóm theo mục đích).
//! Mỗi mục 1 dòng: icon + tên + mô tả ngắn — thay 5 nút cũ + card preset lặp.

export type SettingsSubtab = "presets" | "stt" | "ai" | "tts" | "models_hub" | "overlay" | "theme" | "changelog";

const GROUPS: ReadonlyArray<{
  title: string;
  items: ReadonlyArray<{ id: SettingsSubtab; icon: string; label: string; desc: string }>;
}> = [
  {
    title: "BẮT ĐẦU",
    items: [{ id: "presets", icon: "⚡", label: "Cấu hình theo máy", desc: "4 cấu hình mẫu 1 chạm" }],
  },
  {
    title: "XỬ LÝ AI",
    items: [
      { id: "stt", icon: "🎤", label: "Nhận dạng giọng nói", desc: "Whisper · CPU/GPU" },
      { id: "ai", icon: "🌐", label: "Dịch thuật", desc: "5 nhà cung cấp · 1 nơi" },
      { id: "tts", icon: "🗣", label: "Giọng đọc (TTS)", desc: "VietNeu · Kokoro · Cloud" },
      { id: "models_hub", icon: "📦", label: "Mô hình đã tải", desc: "Tải / cập nhật / xoá" },
    ],
  },
  {
    title: "GIAO DIỆN",
    items: [
      { id: "overlay", icon: "🪟", label: "Overlay Live", desc: "Cỡ chữ, vị trí, độ mờ" },
      { id: "theme", icon: "🎨", label: "Chủ đề & ngôn ngữ", desc: "Cinema · Studio · Sáng · Rực" },
    ],
  },
  {
    title: "KHÁC",
    items: [{ id: "changelog", icon: "📝", label: "Nhật ký cập nhật", desc: "Xem thay đổi phiên bản" }],
  },
];

export function SettingsNav({
  active,
  onChange,
}: {
  active: SettingsSubtab;
  onChange: (s: SettingsSubtab) => void;
}) {
  return (
    <nav className="st-nav" aria-label="Danh mục cài đặt">
      {GROUPS.map((g) => (
        <div key={g.title} className="st-nav-group">
          <div className="st-nav-title">{g.title}</div>
          {g.items.map((it) => (
            <button
              key={it.id}
              type="button"
              className={`st-nav-item${active === it.id ? " on" : ""}`}
              aria-current={active === it.id ? "page" : undefined}
              onClick={() => onChange(it.id)}
            >
              <span className="st-nav-ic">{it.icon}</span>
              <span className="st-nav-text">
                <b>{it.label}</b>
                <small>{it.desc}</small>
              </span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
