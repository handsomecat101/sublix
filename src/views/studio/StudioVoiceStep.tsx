import { memo, useCallback, useMemo, useState } from "react";
import { ContextMenu } from "../../components/ui/ContextMenu";
import { Segmented } from "../../components/ui/Segmented";
import { VoicePicker } from "../../components/voice/VoicePicker";
import { voiceItemFromOption } from "../../components/voice/voicePickerModel";
import type { VoicePickerItem } from "../../components/voice/voicePickerModel";
import type { VoiceUsedBy } from "../../components/voice/VoicePickerRow";
import {
  engineLabel,
  SPEAKER_COUNT_OPTIONS,
  type PanelEngine,
  type PanelRole,
  type PanelVoiceOption,
  type StudioPipelineApi,
  type StudioPipelineState,
} from "./studioPipelineTypes";

/**
 * StudioVoiceStep — bước 4 "Lồng tiếng" của panel quy trình Studio.
 *
 * Dữ liệu engine + giọng đọc đến TỪ BACKEND (`tts_engines_status` +
 * `dubbing_get_voices`) → frontend KHÔNG hard-code danh sách engine/giọng.
 *
 * Mỗi engine hiện trạng thái thật:
 * - sẵn sàng (ready) → chọn được
 * - chưa tải model → nút "Tải model"
 * - thiếu API key → gợi ý mở Cài đặt
 *
 * Chuột phải trên hàng vai: giọng gốc · gộp vào ▸ · gộp tất cả về vai này ·
 * về 2 vai · xoá (thay cho 5 nút trước đây).
 */
export interface StudioVoiceStepProps {
  state: StudioPipelineState;
  api: StudioPipelineApi;
}

/** Vị trí menu chuột phải đang mở (role id → toạ độ). */
interface RoleMenuState {
  roleId: string;
  x: number;
  y: number;
}

/** Ô chọn giọng của 1 vai — tách riêng để mỗi vai có `usedBy` riêng (bỏ chính vai đó). */
interface RoleVoicePickerProps {
  role: PanelRole;
  roles: PanelRole[];
  voiceOptions: PanelVoiceOption[];
  engines: PanelEngine[];
  favoriteVoices: string[];
  previewVoiceId: string | null;
  previewVoiceStatus: "loading" | "playing" | null;
  api: StudioPipelineApi;
}

function RoleVoicePickerInner({
  role,
  roles,
  voiceOptions,
  engines,
  favoriteVoices,
  previewVoiceId,
  previewVoiceStatus,
  api,
}: RoleVoicePickerProps) {
  const voices = useMemo<VoicePickerItem[]>(() => {
    const engineById = new Map(engines.map((e) => [e.id, e]));
    return voiceOptions.map((o) => {
      const item = voiceItemFromOption(o.id, o.label, o.gender);
      const engine = engineById.get(item.engineId);
      return {
        ...item,
        engineLabel: engine ? engineLabel(engine) : item.engineLabel,
        kind: engine ? engine.kind : item.kind,
      };
    });
  }, [voiceOptions, engines]);

  const usedBy = useMemo(() => {
    const map = new Map<string, VoiceUsedBy[]>();
    for (const r of roles) {
      if (r.id === role.id) continue; // bỏ chính vai này
      const list = map.get(r.voice) ?? [];
      list.push({ name: r.name, color: r.color });
      map.set(r.voice, list);
    }
    return map;
  }, [roles, role.id]);

  const favorites = useMemo(() => new Set(favoriteVoices), [favoriteVoices]);
  const preview = useMemo(
    () => (previewVoiceId ? { id: previewVoiceId, status: previewVoiceStatus ?? "playing" } : null),
    [previewVoiceId, previewVoiceStatus],
  );

  const onChange = useCallback(
    (id: string) => api.setRoleVoice(role.id, id),
    [api, role.id],
  );
  const onToggleFavorite = useCallback(
    (id: string) => api.toggleFavoriteVoice?.(id),
    [api],
  );
  const onPreview = useCallback((id: string) => api.previewVoiceSample?.(id), [api]);
  const onStopPreview = useCallback(() => api.stopVoicePreview?.(), [api]);
  const onManage = useCallback(() => api.openSettings(), [api]);

  return (
    <VoicePicker
      variant="popover"
      voices={voices}
      value={role.voice}
      onChange={onChange}
      favorites={favorites}
      onToggleFavorite={onToggleFavorite}
      preview={preview}
      onPreview={onPreview}
      onStopPreview={onStopPreview}
      usedBy={usedBy}
      onManage={onManage}
      ariaLabel={`Giọng đọc cho vai ${role.name}`}
    />
  );
}

const RoleVoicePicker = memo(RoleVoicePickerInner);

function StudioVoiceStepInner({ state, api }: StudioVoiceStepProps) {
  const [roleMenu, setRoleMenu] = useState<RoleMenuState | null>(null);

  const engines = state.engines;
  const engineOptions = engines.map((engine: PanelEngine) => ({
    value: engine.id,
    label: engineLabel(engine),
    title: engine.ready ? engineLabel(engine) : `${engineLabel(engine)} — ${engine.hint}`,
    disabled: !engine.ready,
  }));

  const selectedEngine = engines.find((e) => e.id === state.selectedEngineId) ?? null;

  const openRoleMenu = (role: PanelRole, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setRoleMenu({ roleId: role.id, x: event.clientX, y: event.clientY });
  };

  const menuItems = roleMenu
    ? [
        {
          id: "original",
          label: "🔊 Nghe giọng gốc",
          onSelect: () => api.playOriginalClip(roleMenu.roleId),
        },
        {
          id: "merge-into",
          label: "⇢ Gộp vào…",
          disabled: state.roles.length < 2,
          onSelect: () => {
            const from = state.roles.find((r) => r.id === roleMenu.roleId);
            const target = state.roles.find((r) => r.id !== roleMenu.roleId);
            if (from && target) api.mergeRoleInto(from.id, target.id);
          },
        },
        {
          id: "merge-all",
          label: "⇢ Gộp tất cả về vai này",
          disabled: state.roles.length < 2,
          onSelect: () => api.mergeAllInto(roleMenu.roleId),
        },
        {
          id: "merge-two",
          label: "👥 Về 2 vai",
          disabled: state.roles.length < 3,
          onSelect: () => api.mergeToTwo(),
        },
        {
          id: "merge-one",
          label: "👤 Về 1 vai",
          disabled: state.roles.length < 2,
          onSelect: () => api.mergeToOne(),
        },
        {
          id: "apply-engine-all",
          label: "🎯 Giọng mặc định engine cho mọi vai",
          onSelect: () => api.applyEngineToAll(),
        },
        {
          id: "delete",
          label: "🗑 Xoá vai",
          danger: true,
          disabled: state.roles.length <= 1,
          onSelect: () => api.removeRole(roleMenu.roleId),
        },
      ]
    : [];

  return (
    <div className="spp-voice-body">
      <div className="spp-field">
        <span className="spp-label">Số người nói</span>
        <Segmented
          options={SPEAKER_COUNT_OPTIONS}
          value={String(state.expectedSpeakerCount)}
          onChange={(value) => api.setExpectedSpeakerCount(Number(value))}
          ariaLabel="Số người nói"
        />
      </div>

      <div className="spp-field">
        <span className="spp-label">Bộ giọng đọc</span>
        {engines.length === 0 ? (
          <div className="spp-note">Đang tải trạng thái engine TTS…</div>
        ) : (
          <Segmented
            options={engineOptions}
            value={state.selectedEngineId ?? ""}
            onChange={(value) => api.selectEngine(value)}
            ariaLabel="Bộ giọng đọc"
          />
        )}
        {selectedEngine && !selectedEngine.ready ? (
          <div className="spp-engine-warn">
            <span className="spp-engine-warn-text">{selectedEngine.hint}</span>
            {selectedEngine.kind === "cloud" ? (
              <button
                type="button"
                className="spp-mini-btn"
                onClick={() => api.openSettings()}
              >
                Mở Cài đặt
              </button>
            ) : selectedEngine.modelId ? (
              <button
                type="button"
                className="spp-mini-btn"
                disabled={state.downloadingEngineId === selectedEngine.id}
                onClick={() => api.downloadEngineModel(selectedEngine.id)}
              >
                {state.downloadingEngineId === selectedEngine.id
                  ? `Đang tải… ${state.downloadProgress ?? 0}%`
                  : "Tải model"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="spp-field">
        <div className="spp-label-row">
          <span className="spp-label">Vai &amp; giọng</span>
          <span className="spp-hint">chuột phải: giọng gốc · gộp · xoá</span>
        </div>
        {state.roles.map((role) => (
          <div
            key={role.id}
            className="spp-role"
            onContextMenu={(event) => openRoleMenu(role, event)}
          >
            <span className="spp-role-dot" style={{ background: role.color }} />
            <input
              className="spp-role-name"
              value={role.name}
              onChange={(event) => api.setRoleName(role.id, event.target.value)}
              title="Đổi tên vai"
            />
            <button
              type="button"
              className="spp-gender-btn"
              onClick={() => api.toggleRoleGender(role.id)}
              title="Đổi giới tính (chọn lại giọng theo giới tính)"
            >
              {role.gender === "male" ? "♂ Nam" : "♀ Nữ"}
            </button>
            <span className="spp-role-count">{role.count} câu</span>
            <RoleVoicePicker
              role={role}
              roles={state.roles}
              voiceOptions={state.voiceOptions}
              engines={state.engines}
              favoriteVoices={state.favoriteVoices ?? []}
              previewVoiceId={state.previewVoiceId ?? null}
              previewVoiceStatus={state.previewVoiceStatus ?? null}
              api={api}
            />
            <button
              type="button"
              className="spp-play-btn"
              title="Nghe thử 1 câu"
              disabled={state.auditioningRoleId === role.id}
              onClick={() => api.auditionRole(role.id)}
            >
              {state.auditioningRoleId === role.id ? "⏳" : "▶"}
            </button>
          </div>
        ))}
        <button type="button" className="spp-add-role" onClick={() => api.addRole()}>
          ＋ Thêm vai
        </button>
      </div>

      {state.duckingLevel !== undefined && state.duckingBridgeSec !== undefined ? (
        <div className="spp-field">
          <div className="spp-label-row">
            <span className="spp-label">Hạ tiếng nền khi có thoại</span>
            <span className="spp-hint">xem thử = video xuất ra</span>
          </div>
          <label className="spp-slider-row">
            <span className="spp-slider-name">Mức hạ</span>
            <input
              type="range"
              className="spp-slider"
              min={0.05}
              max={1}
              step={0.05}
              value={state.duckingLevel}
              onChange={(event) => api.setDuckingLevel?.(Number(event.target.value))}
              aria-label="Mức hạ tiếng nền"
              title="Âm lượng nền khi có thoại (100% = không hạ)"
            />
            <span className="spp-slider-value">{Math.round(state.duckingLevel * 100)}%</span>
          </label>
          <label className="spp-slider-row">
            <span className="spp-slider-name">Nối khoảng nghỉ dưới</span>
            <input
              type="range"
              className="spp-slider"
              min={0.5}
              max={10}
              step={0.5}
              value={state.duckingBridgeSec}
              onChange={(event) => api.setDuckingBridgeSec?.(Number(event.target.value))}
              aria-label="Nối khoảng nghỉ dưới số giây"
              title="Hai câu cách nhau ít hơn số giây này thì nền giữ thấp suốt (kéo tối đa ≈ hạ cả video)"
            />
            <span className="spp-slider-value">{state.duckingBridgeSec.toFixed(1)} giây</span>
          </label>
        </div>
      ) : null}

      {roleMenu ? (
        <ContextMenu
          x={roleMenu.x}
          y={roleMenu.y}
          items={menuItems}
          onClose={() => setRoleMenu(null)}
        />
      ) : null}
    </div>
  );
}

/** Bước Lồng tiếng — bọc `React.memo` (props ổn định từ file cha). */
export const StudioVoiceStep = memo(StudioVoiceStepInner);

export default StudioVoiceStep;
