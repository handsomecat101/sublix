//! TSK-UI-REDESIGN-R2-7B — tab **Live** (UI_REDESIGN_PLAN §4.5).
//!
//! Tách ra khỏi `SettingsView.tsx` để file đó không còn phình to. Component
//! **nhận toàn bộ state/handler qua props** → không sở hữu luồng nghiệp vụ.
//!
//! Thay đổi giao diện so với bản cũ (giữ nguyên 100 % chức năng):
//! - Gộp "Chế độ xuất" + "Ngôn ngữ đích" → **1 select "Phụ đề hiển thị"**.
//! - "Quét Âm Thanh" → **nút ↻ cạnh select thiết bị**.
//! - "Độ dài phân đoạn" + "Smart VAD" → khối **"⚙ Nâng cao"** (gấp mặc định).
//! - Bỏ "Mở Cửa Sổ Overlay" (đã có nút 👁 trên topbar — `MasterTopbar`).
//! - **1 nút chính duy nhất**: "▶ Bắt đầu Live" (đổi thành "■ Dừng" khi đang chạy).
//!
//! Lưu ý hiệu năng: component bọc `React.memo` → parent (giai đoạn 2) **phải**
//! truyền `useCallback` cho các handler, không truyền arrow function inline.

import { memo, useCallback, useMemo, useState } from "react";
import { ShellCard, StudioShell } from "../StudioShell";
import {
  IconClock,
  IconMic,
  IconPlay,
  IconRotateCw,
  IconSettings,
  IconStop,
  IconTrash,
  IconVolume2,
} from "../../icons";
import type { AudioDevice } from "../../lib/tauri";
import { sublix } from "../../lib/tauri";
import type { AudioTestResult, DeviceLevel, LiveStatus, LiveSubPreview } from "./liveTypes";
import {
  CHUNK_SECONDS_MAX,
  CHUNK_SECONDS_MIN,
  SOURCE_LANGS,
  buildDisplayOptions,
  clampChunkSeconds,
  deviceLabel,
  deviceOptionValue,
  liveHint,
  liveStatusLabel,
  parseDeviceIndex,
  peakPercent,
  toDisplayValue,
} from "./liveLogic";
import "./LiveView.css";

/** Props của `LiveView` — mọi state/handler đều đến từ parent. */
export interface LiveViewProps {
  /** Ngôn ngữ gốc (đang nói). */
  language: string;
  /** Đổi ngôn ngữ gốc. */
  onLanguageChange: (value: string) => void;
  /** Chế độ xuất hiện tại (`original` | `translated`). */
  outputMode: "original" | "translated";
  /** Ngôn ngữ đích hiện tại. */
  targetLang: string;
  /** Đổi lựa chọn của select gộp "Phụ đề hiển thị" (giá trị `original` / `translated:<lang>`). */
  onDisplayModeChange: (value: string) => void;
  /** Độ dài phân đoạn tối đa (giây). */
  chunkSeconds: number;
  /** Đổi độ dài phân đoạn. */
  onChunkSecondsChange: (value: number) => void;
  /** Bật/tắt Smart VAD. */
  vadEnabled: boolean;
  /** Bật/tắt Smart VAD. */
  onVadEnabledChange: (value: boolean) => void;
  /** Danh sách thiết bị âm thanh. */
  devices: readonly AudioDevice[];
  /** Thiết bị đang chọn (`default` hoặc `index:<n>`). */
  selectedDevice: string;
  /** Đổi thiết bị đang chọn. */
  onSelectedDeviceChange: (value: string) => void;
  /** Làm mới danh sách thiết bị. */
  onReloadDevices: () => void;
  /** Đang phát Live hay không. */
  isLive: boolean;
  /** Luồng thoại gần đây (mới nhất trước). */
  recentSubs: readonly LiveSubPreview[];
  /** Xoá danh sách tạm của luồng thoại. */
  onClearRecentSubs: () => void;
  /** Bắt đầu Live. */
  onStartLive: () => void;
  /** Dừng Live. */
  onStopLive: () => void;
  /** Báo trạng thái lên topbar (tuỳ chọn). */
  onStatus?: (status: LiveStatus) => void;
}

/** Chiều cao thanh sóng (visualizer) — hằng số ngoài component để không tạo lại mỗi render. */
const WAVE_BARS: readonly number[] = [
  12, 28, 45, 20, 55, 75, 40, 60, 30, 70, 85, 45, 25, 65, 35, 18,
];

function LiveViewInner({
  language,
  onLanguageChange,
  outputMode,
  targetLang,
  onDisplayModeChange,
  chunkSeconds,
  onChunkSecondsChange,
  vadEnabled,
  onVadEnabledChange,
  devices,
  selectedDevice,
  onSelectedDeviceChange,
  onReloadDevices,
  isLive,
  recentSubs,
  onClearRecentSubs,
  onStartLive,
  onStopLive,
  onStatus,
}: LiveViewProps) {
  const [scanning, setScanning] = useState(false);
  const [deviceLevels, setDeviceLevels] = useState<DeviceLevel[] | null>(null);
  const [audioTest, setAudioTest] = useState<AudioTestResult | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const report = useCallback(
    (status: LiveStatus) => {
      onStatus?.(status);
    },
    [onStatus],
  );

  /** Select gộp "Phụ đề hiển thị" — giá trị + danh sách lựa chọn. */
  const displayValue = toDisplayValue(outputMode, targetLang);
  const displayOptions = useMemo(() => buildDisplayOptions(targetLang), [targetLang]);

  const handleDisplayChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onDisplayModeChange(event.target.value);
    },
    [onDisplayModeChange],
  );

  const handleLanguageChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onLanguageChange(event.target.value);
    },
    [onLanguageChange],
  );

  const handleDeviceChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onSelectedDeviceChange(event.target.value);
    },
    [onSelectedDeviceChange],
  );

  const handleChunkChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChunkSecondsChange(clampChunkSeconds(Number(event.target.value)));
    },
    [onChunkSecondsChange],
  );

  const handleVadChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onVadEnabledChange(event.target.checked);
    },
    [onVadEnabledChange],
  );

  const handleToggleAdvanced = useCallback(() => {
    setAdvancedOpen((prev) => !prev);
  }, []);

  /** Quét âm thanh — tìm thiết bị đang có tiếng (nút ↻ cạnh select thiết bị). */
  const handleScan = useCallback(async () => {
    if (isLive) {
      report({ kind: "error", message: "Hãy dừng Live trước khi quét thiết bị." });
      return;
    }
    setScanning(true);
    report({ kind: "working", message: "Đang quét âm thanh tất cả thiết bị..." });
    try {
      const levels = await sublix.scanAudioLevels();
      setDeviceLevels(levels);
      const active = levels.filter((l) => l.has_audio);
      if (active.length === 0) {
        report({ kind: "error", message: "🔇 Chưa thấy âm thanh phát. Hãy bật 1 video/nhạc trước!" });
      } else {
        report({ kind: "success", message: `🔊 Tìm thấy ${active.length} thiết bị có tiếng.` });
      }
    } catch (e) {
      report({ kind: "error", message: `Quét thất bại: ${e}` });
    } finally {
      setScanning(false);
    }
  }, [isLive, report]);

  /** Thử bắt âm thanh 3 giây trên thiết bị đang chọn. */
  const handleTest = useCallback(async () => {
    report({ kind: "working", message: "Đang thử bắt 3s..." });
    try {
      const result = await sublix.testAudio(parseDeviceIndex(selectedDevice));
      setAudioTest(result);
      if (result.has_audio) {
        report({
          kind: "success",
          message: `🔊 Bắt được âm thanh! Đỉnh ${peakPercent(result.peak_volume).toFixed(0)}%`,
        });
      } else {
        report({
          kind: "error",
          message: "🔇 Không có tiếng trên thiết bị này. Hãy dùng nút quét âm thanh!",
        });
      }
    } catch (e) {
      report({ kind: "error", message: `Thử thất bại: ${e}` });
    }
  }, [report, selectedDevice]);

  /** Chọn thiết bị từ danh sách mức âm thanh. */
  const handlePickDevice = useCallback(
    (index: number) => {
      onSelectedDeviceChange(deviceOptionValue(index));
    },
    [onSelectedDeviceChange],
  );

  /** 1 nút chính duy nhất: bật/tắt Live. */
  const handleToggleLive = useCallback(() => {
    if (isLive) onStopLive();
    else onStartLive();
  }, [isLive, onStartLive, onStopLive]);

  const handleClearSubs = useCallback(() => {
    onClearRecentSubs();
  }, [onClearRecentSubs]);

  const handleReloadDevices = useCallback(() => {
    onReloadDevices();
  }, [onReloadDevices]);

  return (
    <StudioShell
      left={
        <>
          <ShellCard icon={<IconSettings size={14} />} title="Ngôn ngữ & Phụ đề">
            <div className="lv-field">
              <label className="lv-label" htmlFor="lv-source-lang">
                Ngôn ngữ gốc (Source)
              </label>
              <select
                id="lv-source-lang"
                className="lv-select"
                value={language}
                onChange={handleLanguageChange}
              >
                {SOURCE_LANGS.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="lv-field">
              <label className="lv-label" htmlFor="lv-display-mode">
                Phụ đề hiển thị
              </label>
              <select
                id="lv-display-mode"
                className="lv-select"
                value={displayValue}
                onChange={handleDisplayChange}
              >
                {displayOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="lv-hint">
                {outputMode === "original"
                  ? "Chỉ gõ chữ gốc — không gọi AI dịch."
                  : `Dịch sang ${targetLang} theo thời gian thực.`}
              </span>
            </div>
          </ShellCard>

          <ShellCard
            icon={<IconMic size={14} />}
            title="Thiết bị âm thanh (WASAPI)"
            actions={
              <button
                type="button"
                className="lv-icon-btn"
                onClick={handleReloadDevices}
                title="Làm mới danh sách thiết bị"
                aria-label="Làm mới danh sách thiết bị"
              >
                <IconRotateCw size={12} />
              </button>
            }
          >
            <div className="lv-device-row">
              <select
                className="lv-select lv-select-grow"
                value={selectedDevice}
                onChange={handleDeviceChange}
                aria-label="Thiết bị âm thanh"
              >
                <option value="default">Mặc định (Default Windows Audio)</option>
                {devices.map((device, index) => (
                  <option key={device.id} value={deviceOptionValue(index)}>
                    {deviceLabel(index, device.name)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="lv-icon-btn"
                onClick={handleScan}
                disabled={scanning || isLive}
                title="Quét âm thanh — tìm thiết bị đang phát tiếng"
                aria-label="Quét âm thanh"
              >
                <IconRotateCw size={12} />
              </button>
            </div>

            <button
              type="button"
              className="lv-btn lv-btn-secondary"
              onClick={handleTest}
              disabled={isLive}
            >
              <IconVolume2 size={12} />
              {scanning ? "Đang quét…" : "Thử 3s"}
            </button>

            {audioTest ? (
              <div className="lv-note">
                <strong>Thử:</strong> {audioTest.device_name} •{" "}
                {peakPercent(audioTest.peak_volume).toFixed(0)}% •{" "}
                {audioTest.has_audio ? "✓ Có tiếng" : "✗ Im lặng"}
              </div>
            ) : null}

            {deviceLevels && deviceLevels.length > 0 ? (
              <div className="lv-levels">
                {deviceLevels.map((level) => {
                  const pct = peakPercent(level.peak_volume);
                  const isSelected = selectedDevice === deviceOptionValue(level.index);
                  return (
                    <div
                      key={level.index}
                      className={`lv-level${level.has_audio ? " active" : ""}${
                        isSelected ? " selected" : ""
                      }`}
                    >
                      <span className="lv-level-name">
                        [{level.index}] {level.name}
                      </span>
                      <span className="lv-level-bar">
                        <span
                          className="lv-level-fill"
                          data-active={level.has_audio ? "true" : "false"}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="lv-level-pct">{pct.toFixed(0)}%</span>
                      <button
                        type="button"
                        className="lv-btn lv-btn-tiny"
                        onClick={() => handlePickDevice(level.index)}
                        disabled={isSelected}
                        title="Dùng thiết bị này"
                      >
                        {isSelected ? "✓" : "Chọn"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </ShellCard>

          <ShellCard
            icon={<IconSettings size={14} />}
            title="⚙ Nâng cao"
            actions={
              <button
                type="button"
                className="lv-icon-btn"
                onClick={handleToggleAdvanced}
                title={advancedOpen ? "Gấp lại" : "Mở tuỳ chọn nâng cao"}
                aria-expanded={advancedOpen}
                aria-label="Mở tuỳ chọn nâng cao"
              >
                {advancedOpen ? "▴" : "▾"}
              </button>
            }
          >
            {advancedOpen ? (
              <>
                <div className="lv-field">
                  <div className="lv-label-row">
                    <label className="lv-label" htmlFor="lv-chunk-seconds">
                      Độ dài phân đoạn tối đa
                    </label>
                    <span className="lv-value">{chunkSeconds}s</span>
                  </div>
                  <input
                    id="lv-chunk-seconds"
                    type="range"
                    className="lv-slider"
                    min={CHUNK_SECONDS_MIN}
                    max={CHUNK_SECONDS_MAX}
                    step={1}
                    value={chunkSeconds}
                    onChange={handleChunkChange}
                  />
                </div>

                <label className="lv-check">
                  <input
                    type="checkbox"
                    checked={vadEnabled}
                    onChange={handleVadChange}
                  />
                  <span>✂️ Smart VAD (cắt câu theo khoảng lặng)</span>
                </label>
              </>
            ) : (
              <span className="lv-hint">
                {chunkSeconds}s / phân đoạn · Smart VAD {vadEnabled ? "bật" : "tắt"}
              </span>
            )}
          </ShellCard>
        </>
      }
      center={
        <div className="lv-hero">
          <div className="lv-wave" aria-hidden="true">
            {WAVE_BARS.map((height, index) => (
              <span
                key={index}
                className="lv-wave-bar"
                data-live={isLive ? "true" : "false"}
                style={{ height: isLive ? `${height}%` : "15%" }}
              />
            ))}
          </div>

          <div className="lv-status">
            <span className="lv-dot" data-live={isLive ? "true" : "false"} />
            <span className="lv-status-text">{liveStatusLabel(isLive)}</span>
          </div>

          <p className="lv-hint lv-hero-hint">{liveHint(isLive)}</p>

          <button
            type="button"
            className="lv-btn lv-btn-primary lv-btn-lg"
            onClick={handleToggleLive}
            title="Phím tắt: Ctrl+Shift+L"
          >
            {isLive ? <IconStop size={16} /> : <IconPlay size={16} />}
            {isLive ? "Dừng Live" : "Bắt đầu Live"}
          </button>

          {recentSubs.length > 0 ? (
            <div className="lv-latest">
              <div className="lv-latest-text">{recentSubs[0]?.text}</div>
              {recentSubs[0]?.original && recentSubs[0]?.original !== recentSubs[0]?.text ? (
                <div className="lv-latest-orig">{recentSubs[0]?.original}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      }
      right={
        <ShellCard
          icon={<IconClock size={14} />}
          title={`Luồng thoại (${recentSubs.length})`}
          actions={
            recentSubs.length > 0 ? (
              <button
                type="button"
                className="lv-icon-btn"
                onClick={handleClearSubs}
                title="Xoá danh sách tạm"
                aria-label="Xoá danh sách tạm"
              >
                <IconTrash size={12} />
              </button>
            ) : undefined
          }
        >
          {recentSubs.length > 0 ? (
            <div className="lv-stream">
              {recentSubs.map((sub) => (
                <div key={sub.id} className="lv-stream-item">
                  <div className="lv-stream-text">{sub.text}</div>
                  {sub.original && sub.original !== sub.text ? (
                    <div className="lv-stream-orig">{sub.original}</div>
                  ) : null}
                  <div className="lv-stream-meta">
                    <span>#{sub.id}</span>
                    {sub.stt_duration !== undefined ? (
                      <span>STT: {(sub.stt_duration * 1000).toFixed(0)}ms</span>
                    ) : null}
                    {sub.translate_duration !== undefined && sub.translate_duration > 0 ? (
                      <span>LLM: {(sub.translate_duration * 1000).toFixed(0)}ms</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="lv-empty">
              Chưa có lời thoại nào. Bấm <strong>Bắt đầu Live</strong> để bắt đầu ghi nhận.
            </div>
          )}
        </ShellCard>
      }
    />
  );
}

/** `LiveView` đã bọc `React.memo` (props phải ổn định từ parent). */
export const LiveView = memo(LiveViewInner);

export default LiveView;
