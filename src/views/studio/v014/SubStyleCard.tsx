import { memo, useEffect, useState } from "react";
import { KineticWords } from "./KineticPreview";
import { PRESETS, resolvePreset, type KineticPresetId, type SubPosition, type SubStyle } from "./logic";
import "./v014.css";

const SAMPLE = ["Xin", "chào", "các", "bạn"];
const POSITIONS: { id: SubPosition; label: string }[] = [
  { id: "bottom", label: "Dưới đáy" },
  { id: "middle", label: "Ở giữa" },
  { id: "top", label: "Trên đỉnh" },
];

/** Thẻ mẫu: chữ "Xin chào các bạn" chạy thật (vòng lặp ~450 ms/từ). Bọc memo ⇒ chỉ nó tự render lại. */
const PresetTile = memo(function PresetTile(props: {
  id: KineticPresetId;
  label: string;
  selected: boolean;
  onPick: (id: KineticPresetId) => void;
  onHover: (id: KineticPresetId | null) => void;
}) {
  const { id, label, selected, onPick, onHover } = props;
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setActive((a) => (a + 1) % (SAMPLE.length + 1)), 450);
    return () => window.clearInterval(t);
  }, []);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="v14-preset"
      title={label}
      onClick={() => onPick(id)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
    >
      <KineticWords words={SAMPLE} active={active >= SAMPLE.length ? -1 : active} preset={id} fontSizePx={15} />
      <span className="nm">{label}</span>
      {selected && <span className="ck">✓</span>}
    </button>
  );
});

export interface SubStyleCardProps {
  value: SubStyle;
  onChange: (next: SubStyle) => void;
  /** Mẫu backend hỗ trợ (vd. bỏ "box-amber" nếu không đo được vị trí từ). Bỏ trống = đủ 4. */
  availablePresets?: readonly KineticPresetId[];
  /** Rê chuột lên mẫu ⇒ khung xem thử áp tạm; rời chuột ⇒ `null`. */
  onPreviewPreset?: (id: KineticPresetId | null) => void;
  /** Khoá vị trí vì đang bám dải chữ cứng ("Theo dải chữ cứng"). */
  positionLocked?: boolean;
}

/** Thẻ "Kiểu phụ đề": Bình thường / Nhảy chữ, 4 mẫu, cỡ chữ, viền & bóng, vị trí. */
export function SubStyleCard({ value, onChange, availablePresets, onPreviewPreset, positionLocked }: SubStyleCardProps) {
  const set = (patch: Partial<SubStyle>) => onChange({ ...value, ...patch });
  const presets = PRESETS.filter((p) => !availablePresets || availablePresets.length === 0 || availablePresets.includes(p.id));
  const current = resolvePreset(value.preset, availablePresets);
  const hover = (id: KineticPresetId | null) => onPreviewPreset?.(id);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = presets.findIndex((p) => p.id === current);
    const n = presets[(i + (e.key === "ArrowRight" ? 1 : presets.length - 1)) % presets.length];
    if (n) {
      e.preventDefault();
      set({ preset: n.id });
    }
  };

  return (
    <section className="v14-card" aria-label="Kiểu phụ đề">
      <h4>Aa Kiểu phụ đề</h4>
      <div className="v14-seg full" role="radiogroup" aria-label="Chế độ chữ">
        <button type="button" role="radio" aria-checked={value.mode === "normal"} onClick={() => set({ mode: "normal" })}>
          Bình thường
        </button>
        <button type="button" role="radio" aria-checked={value.mode === "kinetic"} onClick={() => set({ mode: "kinetic" })}>
          Nhảy chữ
        </button>
      </div>

      {value.mode === "kinetic" && (
        <>
          <div className="v14-presets" role="radiogroup" aria-label="Mẫu chữ nhảy" onKeyDown={onKey}>
            {presets.map((p) => (
              <PresetTile
                key={p.id}
                id={p.id}
                label={p.label}
                selected={p.id === current}
                onPick={(id) => set({ preset: id })}
                onHover={hover}
              />
            ))}
          </div>
          <div className="v14-hint">Nhịp nhảy theo lời nói. Câu dịch chưa có mốc từng từ ⇒ chia theo số âm tiết.</div>
        </>
      )}

      <div className="v14-row">
        <label htmlFor="v14-font">Cỡ chữ</label>
        <input
          id="v14-font"
          type="range"
          min={24}
          max={96}
          step={1}
          value={value.fontSize}
          onChange={(e) => set({ fontSize: Number(e.target.value) })}
        />
        <span className="v14-lbl" style={{ minWidth: 28, textAlign: "right" }}>{value.fontSize}</span>
      </div>
      <div className="v14-row">
        <label htmlFor="v14-outline">Viền &amp; bóng</label>
        <input
          id="v14-outline"
          type="checkbox"
          checked={value.outline !== false}
          onChange={(e) => set({ outline: e.target.checked })}
          style={{ accentColor: "var(--ac)" }}
        />
      </div>
      <div className="v14-row">
        <label>Vị trí</label>
        {positionLocked ? (
          <span className="v14-lbl">Theo dải chữ cứng</span>
        ) : (
          <div className="v14-seg" role="radiogroup" aria-label="Vị trí chữ">
            {POSITIONS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={value.position === p.id} onClick={() => set({ position: p.id })}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
