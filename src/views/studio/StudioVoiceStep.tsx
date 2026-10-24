import { memo, useState } from "react";
import { ContextMenu } from "../../components/ui/ContextMenu";
import { Segmented } from "../../components/ui/Segmented";
import {
  engineLabel,
  SPEAKER_COUNT_OPTIONS,
  type PanelEngine,
  type PanelRole,
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
            <select
              className="spp-role-voice"
              value={role.voice}
              onChange={(event) => api.setRoleVoice(role.id, event.target.value)}
              title="Chọn giọng đọc cho vai này"
            >
              {state.voiceOptions.length === 0 ? (
                <option value={role.voice}>{role.voice}</option>
              ) : (
                state.voiceOptions.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                  </option>
                ))
              )}
            </select>
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
