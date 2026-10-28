//! SublixStudioView.tsx  All-in-One Multi-track AI Dubbing & Subtitle Studio
//! Reverse-Engineered from EZMAXSUB (ezmaxsoft.com) benchmark.
//! Specification: agent-team/ARCHIVE/PHAN_TICH_UI_TINH_NANG_SUBLIX_STUDIO.md & UI_SPEC_SUBLIX_STUDIO.md

import { useState, useEffect, useLayoutEffect, useMemo, useRef, memo, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  sublix,
  type DubbingProgress,
  type DubbingProject,
  type AppConfig,
  type ModelDownloadProgressState,
  type TtsEngineInfo,
  type VoicePreset,
} from "../lib/tauri";
import type { ScriptLine, TranslateProgress } from "../lib/types";
import { subtitleSourceLabel } from "../lib/types";
// [TSK-STUDIO-GLOSSARY] Kiểu bảng thuật ngữ + xưng hô (đọc/ghi qua backend theo project).
import type { Glossary, GlossarySuggestion } from "../lib/types";
// [TSK-STUDIO-GLOSSARY] Logic thuần: chuẩn hoá bảng, đối chiếu gợi ý, ước tính thời gian.
import {
  diffGlossarySuggestion,
  estimateGlossarySuggestSeconds,
  glossaryEntryCount,
  glossaryLockHint,
  glossaryViolationClass,
  normalizeGlossary,
  stripBlankRows,
} from "../lib/timeline/glossary";
// [TSK-FEAT-SMART-DUCKING] Đường âm lượng nền theo thoại (cùng thuật toán với video xuất ra).
import {
  buildDuckingEnvelope,
  duckingParamsFromConfig,
  gainAt,
  type DuckingParams,
} from "../lib/audio/duckingEnvelope";
import { mergeConfig } from "./settings/configMerge";
import { version as APP_VERSION_PKG } from "../../package.json";
// R2-3: panel quy trình 5 bước (tách riêng để file này không phình thêm).
import StudioPipelinePanel from "./studio/StudioPipelinePanel";
import MasterTopbar from "./MasterTopbar";
// TSK-STUDIO-MODEL-PICKER: gọi 2 lệnh backend `translate_options_get/set`.
// Dùng wrapper CỤC BỘ trong src/views/studio/ (không sửa src/lib/tauri.ts — file đó
// đang do worker khác sửa).
import {
  fetchTranslateOptions,
  saveTranslateOptions,
  type ReasoningEffort,
  type TranslateOptions,
} from "./studio/translateOptions";
// TSK-STUDIO-MODEL-PICKER: ước tính thời gian từng bước (logic thuần, test được).
import {
  buildEstimates,
  computeLiveProgress,
  contextualDefaultOn,
  formatDuration,
  formatLiveProgress,
  loadRateOverrides,
  rateKey,
  saveRateOverride,
} from "../lib/timeline/estimate";
import type {
  PanelEngine,
  PanelRole,
  PanelSttEngine,
  PanelVoiceOption,
  PipelineOpenStep,
  StudioPipelineApi,
  StudioPipelineState,
} from "./studio/studioPipelineTypes";
import {
  IconFilm,
  IconClapper,
  IconPlay,
  IconPause,
  IconVolume2,
  IconVolumeX,
  IconSearch,
  IconPlus,
  IconSettings,
  IconGlobe,
  IconMic,
  IconClock,
  IconMaximize,
  IconScissors,
  IconCopy,
  IconTrash,
  IconMagnet,
  IconLink,
  IconBookmark,
  IconArrowsHorizontal,
  IconX,
  IconCheck,
  IconSparkles,
} from "../icons";
import "./SublixStudioView.css";

// [TSK-TIMELINE-INTEGRATE-MODULES] 6 module timeline thuần TS (src/lib/timeline/).
// `formatTimecode` của file này được thay bằng `formatTimecodeDisplay` của module
// (kết quả GIỐNG HỆT từng ký tự) để không còn 2 hàm format trùng nhau.
import {
  clampSeconds,
  formatTimecodeDisplay as formatTimecode,
} from "../lib/timeline/timecode";
import {
  applyShuttleKey,
  computeShuttleSeek,
  createShuttleState,
  frameStepSeconds,
  shuttlePlaybackRate,
  type ShuttleKey,
  type ShuttleState,
} from "../lib/timeline/shuttle";
import {
  findNextMarker,
  findPrevMarker,
  normalizeMarkers,
  toggleMarker,
  type TimelineMarker,
} from "../lib/timeline/markers";
// [TSK-TIMELINE-REDO-RIPPLE] Lịch sử undo/redo + ripple delete (module thuần, có test).
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from "../lib/timeline/history";
import { rippleDelete } from "../lib/timeline/ripple";
import {
  blockedTracks,
  createTrackLockState,
  describeTrackKey,
  editBlockedReason,
  isEditBlocked,
  isTrackLocked,
  speakerTrackKey,
  toggleTrackLock,
  type TrackKey,
  type TrackLockState,
} from "../lib/timeline/trackLock";
import {
  copyToClipboard,
  pasteFromClipboard,
  type ClipboardPayload,
} from "../lib/timeline/clipboard";
import { computeFollowScroll } from "../lib/timeline/autoFollow";
import { TimecodeInput } from "./studio/TimecodeInput";
// [TSK-FIX-BUG-R2-8-01] Sinh id task DUY NHẤT theo lần chạy (logic thuần, test được).
import { makeTaskRunId } from "./processLogic";
import { jobQueue, JobCancelledError, type JobKind } from "../lib/studio/jobQueue";
import { isForeignRun } from "../lib/studio/runRouting";
import { saveSessionTab, type PersistedTab } from "../lib/studio/sessionStore";
// [TSK-TABS-3.5] Chặn kết quả của video cũ ghi đè video mới (logic thuần, test được).
import { projectDisplayName, staleProjectNotice } from "../lib/studio/resultGuard";
// [TSK-V014-WIRE-STUDIO] Kiểu phụ đề (Bình thường / Nhảy chữ) + làm mờ phụ đề cứng.
import { SubStyleCard } from "./studio/v014/SubStyleCard";
import { HardsubCard } from "./studio/v014/HardsubCard";
import { StageLayer } from "./studio/v014/StageLayer";
import { useV014State } from "./studio/v014/useV014State";
import { bandShorterThanText } from "./studio/v014/bandGeometry";
import type { KineticSegment } from "./studio/v014/KineticPreview";
import type { KineticPresetId } from "./studio/v014/logic";
/** Hộp cam bị bỏ: libass không vẽ được hộp từng từ (xem docs/V0.14_PLAN.md). */
const V014_PRESETS: readonly KineticPresetId[] = ["pop-amber", "karaoke-cyan", "reveal"];

export interface StudioTaskUpdatePayload {
  id?: string;
  status: "running" | "completed" | "error" | "idle";
  type?: "file_sub" | "dubbing" | "downloader" | "model" | "live" | "subtitle";
  workflowType?: "subtitle_only" | "subtitle_translate" | "dubbing" | "voice_only";
  workflowLabel?: string;
  fileName?: string;
  title?: string;
  stage?: string;
  detail?: string;
  percent?: number;
  steps?: Array<{ id: string; label: string; status: "done" | "running" | "pending" }>;
  totalItems?: number;
  currentItem?: number;
  outputPath?: string;
  error?: string;
  targetTab?: "downloader" | "file_sub" | "dubbing" | "live" | "models" | "studio";
  /** [TSK-TABS-P2] Tab Studio đã chạy tác vụ → "Mở lại trong Studio" mở đúng tab. */
  tabId?: string;
  /** [TSK-TABS-P2] Video gốc của dự án (mở lại khi tab đã đóng). */
  sourcePath?: string;
  /** [TSK-TABS-P2] `runId` của job (khớp `run_id` trong `dubbing:progress`) → tab Tiến trình khoá đúng lượt. */
  runId?: string;
}

export interface SublixStudioViewProps {
  /**
   * [UI_R2-8_REVIEW mục 12] Phiên bản app từ backend (`appInfo.version`) — 1 nguồn
   * cho MỌI tab (trước: Studio lấy `package.json` còn tab khác lấy backend ⇒
   * thanh trên "nhảy" khi chuyển tab).
   */
  appVersion?: string;
  onNavigateTab?: (tab: "downloader" | "live" | "history" | "models" | "overlay" | "process" | "lab") => void;
  currentTheme?: string;
  onThemeChange?: (theme: string) => void;
  initialFilePath?: string;
  isActive?: boolean;
  /**
   * [TSK-TABS-P1] Id tab (host quản lý danh sách tab). Mỗi tab = 1 instance
   * `SublixStudioView` riêng, vẫn mounted khi ẩn (việc đang chạy không mất).
   */
  tabId?: string;
  /**
   * [TSK-TABS-P1] Yêu cầu mở video — host quyết định: nhảy tới tab đã có cùng
   * path / tái dùng tab trống / tạo tab mới (trần 6).
   */
  onRequestOpenVideo?: (path: string) => void;
  /** [TSK-TABS-P1] Nội dung render NGAY DƯỚI `MasterTopbar` (ô thanh tab). */
  belowTopbar?: React.ReactNode;
  /** [TSK-TABS-P1] Báo trạng thái nhẹ cho host (đã throttle ≥250 ms ở phía gọi). */
  onStatus?: (tabId: string, status: StudioTabStatus) => void;
  /**
   * [TSK-TABS-P1] Host yêu cầu nạp video vào tab này (tab trống được lấp đầy).
   * `nonce` tăng mỗi lần yêu cầu ⇒ instance nạp đúng 1 lần.
   */
  loadRequest?: { path: string; nonce: number } | null;
  /**
   * [TSK-TABS-P1] Host yêu cầu **DỪNG** việc của tab này (khi đóng tab đang chạy).
   * `nonce` tăng mỗi lần yêu cầu ⇒ dừng đúng 1 lần.
   */
  cancelRequest?: number;
  /**
   * [TSK-TABS-P3] Dữ liệu tab khôi phục từ `sessionStore` (chỉ đọc LÚC MOUNT).
   * Instance tự lưu tab của mình qua `saveSessionTab` (debounce ~1,2 s).
   */
  restoredTab?: PersistedTab | null;
  onTaskUpdate?: (task: StudioTaskUpdatePayload) => void;
  onClearPendingFile?: () => void;
}

/** [TSK-TABS-P1] Trạng thái nhẹ mà instance báo lên host (không phải state phát). */
export interface StudioTabStatus {
  /** Trạng thái việc: idle / running / queued / error / done. */
  busy: "idle" | "running" | "queued" | "error" | "done";
  /** % của bước đang chạy (0..100). */
  percent: number;
  /** Có thay đổi chưa lưu. */
  dirty: boolean;
  /** Tên hiển thị trên tab. */
  title: string;
  /** Đường dẫn video đang mở ("" = tab trống) — host dùng để nhảy tab cùng path / tái dùng tab trống. */
  path: string;
}

export interface SpeakerItem {
  id: string;
  name: string;
  gender: "male" | "female";
  color: string;
  voice: string;
  count: number;
  sampleAudio?: string | null;
}

export interface SubtitleItem {
  id: number;
  start: number; // in seconds
  end: number;
  speakerId: string;
  original: string;
  translated: string;
  /** true khi câu này dịch lỗi (nhãn "[Dịch lỗi: ...]" bị loại bỏ, không tạo lồng tiếng). */
  translateFailed?: boolean;
  /**
   * [TSK-STUDIO-GLOSSARY] true khi câu này VI PHẠM bảng thuật ngữ / xưng hô đã duyệt
   * (backend tự kiểm tra tất định, không gọi mạng) → UI tô vàng nhạt.
   *
   * Cờ **boolean** + lý do dạng chuỗi ⇒ không phá `React.memo` (không tạo object mới
   * mỗi render).
   */
  glossaryViolation?: boolean;
  /** Lý do vi phạm (hiện ở tooltip). */
  glossaryViolationReason?: string | null;
  hasAudio?: boolean;
  audioUrl?: string; // R32: data URI clip tiếng lồng (data:audio/mp3;base64,...)
  audioDuration?: number; // R32: độ dài thật của clip (giây) — dùng để vẽ khối lồng
  // v0.11.32b (PO): nguồn từng câu — "youtube" = lấy từ file .srt tải sẵn,
  // "whisper" = phần mềm tự nhận dạng → hiện badge nhỏ trên timeline để phân biệt.
  source?: "youtube" | "whisper";
}

const SPEAKER_COLORS = [
  "#3B82F6", // Blue
  "#EC4899", // Pink
  "#22C55E", // Green
  "#F97316", // Orange
  "#A855F7", // Purple
  "#14B8A6", // Teal
  "#EF4444", // Red
  "#8B5E3C", // Brown
];

// [TSK-TIMELINE-INTEGRATE-MODULES] `formatTimecode` đã chuyển sang module
// `src/lib/timeline/timecode.ts` (import ở đầu file) — kết quả GIỐNG HỆT bản cũ.

function round2(n: number): number {
  return Number(n.toFixed(2));
}

// Một câu "thuộc vùng In/Out" khi khoảng thời gian của nó CHỒNG LẤN vùng (kể cả bị cắt ngang mép).
// Quy tắc DUY NHẤT cho: dịch lại vùng / tạo lại tiếng lồng vùng / xóa trong vùng / đếm câu ở menu.
function isSegInRange(s: { start: number; end: number }, rangeStart: number, rangeEnd: number): boolean {
  return s.end > rangeStart && s.start < rangeEnd;
}

// Mở rộng vùng ra tới mép các câu bị In/Out cắt ngang → bóc tách lại KHÔNG làm mất nửa câu.
function expandRangeToSegmentEdges(
  segs: Array<{ start: number; end: number }>,
  rangeStart: number,
  rangeEnd: number
): { start: number; end: number } {
  let a = rangeStart;
  let b = rangeEnd;
  for (let i = 0; i < 4; i++) {
    let changed = false;
    for (const s of segs) {
      if (s.start < a && s.end > a) {
        a = s.start;
        changed = true;
      }
      if (s.start < b && s.end > b) {
        b = s.end;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { start: a, end: b };
}

// Ghép kết quả bóc tách của một vùng vào danh sách câu hiện có:
// - câu cũ chồng lấn vùng bị thay; câu ngoài vùng giữ NGUYÊN (id, bản dịch, tiếng lồng)
// - câu mới bị cắt trong [start, end] và không chồng lên câu giữ lại / câu mới liền trước
// - id câu mới = max(id cũ)+1… (không đánh số lại → Hoàn tác & chọn nhiều không bị lệch id)
function mergeRangeSegments<T extends { id: number; start: number; end: number }>(
  prev: T[],
  fresh: T[],
  rangeStart: number,
  rangeEnd: number
): { segments: T[]; newIds: Set<number>; replaced: number; dropped: number } {
  const kept = prev.filter((s) => !isSegInRange(s, rangeStart, rangeEnd));
  let nextId = prev.reduce((mx, s) => Math.max(mx, s.id), 0) + 1;
  const added: T[] = [];
  let dropped = 0;
  let lastEnd = rangeStart;
  for (const n of [...fresh].sort((a, b) => a.start - b.start)) {
    let s0 = Math.max(n.start, rangeStart, lastEnd);
    let e0 = Math.min(n.end, rangeEnd);
    const m = (s0 + e0) / 2;
    for (const k of kept) {
      if ((k.start + k.end) / 2 <= m) s0 = Math.max(s0, k.end);
      else e0 = Math.min(e0, k.start);
    }
    if (e0 - s0 < 0.2) {
      dropped++;
      continue;
    }
    added.push({ ...n, id: nextId++, start: round2(s0), end: round2(e0) });
    lastEnd = e0;
  }
  const segments = [...kept, ...added].sort((a, b) => a.start - b.start);
  return { segments, newIds: new Set(added.map((a) => a.id)), replaced: prev.length - kept.length, dropped };
}

interface StudioSegmentCardProps {
  seg: SubtitleItem;
  isSelected: boolean;
  spk: SpeakerItem;
  speakers: SpeakerItem[];
  previewingSegId: number | null;
  onSelect: (seg: SubtitleItem) => void;
  onNudge: (segId: number, field: "start" | "end", delta: number) => void;
  onUpdateSpeaker: (segId: number, newSpeakerId: string) => void;
  onUpdateTranslated: (segId: number, text: string) => void;
  onPreviewTts: (seg: SubtitleItem) => void;
  onSplit: (segId: number) => void;
  onDelete: (segId: number) => void;
  onClearVoice?: (segId: number) => void;
  onPreFocus: () => void;
  onSaveUndoIfChanged: () => void;
}

const StudioSegmentCard = memo(function StudioSegmentCard({
  seg,
  isSelected,
  spk,
  speakers,
  previewingSegId,
  onSelect,
  onNudge,
  onUpdateSpeaker,
  onUpdateTranslated,
  onPreviewTts,
  onSplit,
  onDelete,
  onClearVoice,
  onPreFocus,
  onSaveUndoIfChanged,
}: StudioSegmentCardProps) {
  // [TSK-STUDIO-GLOSSARY] Câu vi phạm bảng thuật ngữ → tô vàng nhạt + badge lý do.
  const violationClass = glossaryViolationClass(seg);
  // [UI_R2-8_REVIEW mục 8] Ô dịch tự cao theo nội dung (không cắt chữ 1 dòng).
  const translatedRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = translatedRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [seg.translated]);
  return (
    <div
      className={`studio-segment-card ${isSelected ? "active" : ""} ${violationClass}`}
      // [TSK-STUDIO-GLOSSARY] Tô vàng nhạt câu vi phạm bảng thuật ngữ (inline để
      // không phụ thuộc CSS ngoài phạm vi sửa của task này).
      style={
        seg.glossaryViolation
          ? { borderColor: "rgba(250,204,21,0.65)", background: "rgba(250,204,21,0.07)" }
          : undefined
      }
      onClick={() => onSelect(seg)}
    >
      <div className="studio-segment-header-row">
        {/* [UI_R2-8_REVIEW mục 8] Mặc định chỉ có mốc thời gian + chấm vai;
            nút ±0.1s / chọn vai chỉ hiện khi thẻ đang chọn hoặc hover. */}
        <span className="studio-segment-timing-text">
          {formatTimecode(seg.start)} → {formatTimecode(seg.end)}
        </span>
        <span className="studio-segment-speaker">
          <span className="studio-segment-speaker-dot" style={{ background: spk?.color }} />
          <span className="studio-segment-speaker-name" title={spk?.name ?? undefined}>
            {spk?.name ?? "—"}
          </span>
        </span>

        {seg.glossaryViolation ? (
          <span
            className="studio-segment-glossary-badge"
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 4,
              whiteSpace: "nowrap",
              color: "#fde68a",
              background: "rgba(250,204,21,0.14)",
              border: "1px solid rgba(250,204,21,0.45)",
            }}
            title={`⚠️ Vi phạm bảng thuật ngữ / xưng hô đã duyệt: ${seg.glossaryViolationReason ?? "không rõ lý do"}`}
          >
            ⚠️ Thuật ngữ
          </span>
        ) : null}

        <div className="studio-segment-tools">
          <div className="studio-segment-timing-controls">
            <button
              type="button"
              className="studio-timing-btn"
              onClick={(e) => {
                e.stopPropagation();
                onNudge(seg.id, "start", -0.1);
              }}
              title="Lùi mốc bắt đầu 0.1s"
            >
              -0.1s
            </button>
            <button
              type="button"
              className="studio-timing-btn"
              onClick={(e) => {
                e.stopPropagation();
                onNudge(seg.id, "end", 0.1);
              }}
              title="Tiến mốc kết thúc 0.1s"
            >
              +0.1s
            </button>
          </div>

          <select
            className="studio-segment-speaker-select"
            style={{ borderColor: spk?.color }}
            value={seg.speakerId}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onUpdateSpeaker(seg.id, e.target.value);
            }}
            title="Chuyển vai diễn cho câu thoại này"
          >
            {speakers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="studio-segment-text-original">{seg.original}</div>
      <textarea
        ref={translatedRef}
        className="studio-segment-text-translated"
        rows={1}
        style={{
          background: seg.glossaryViolation ? "rgba(250, 204, 21, 0.08)" : "rgba(255,255,255,0.03)",
          border: seg.translateFailed
            ? "1px solid rgba(248,113,113,0.55)"
            : seg.glossaryViolation
              ? "1px solid rgba(250,204,21,0.6)"
              : "1px solid var(--line-soft)",
        }}
        placeholder={seg.translateFailed ? "⚠️ Dịch lỗi — chưa tạo lồng tiếng" : ""}
        value={seg.translated}
        onFocus={onPreFocus}
        onBlur={onSaveUndoIfChanged}
        onChange={(e) => onUpdateTranslated(seg.id, e.target.value)}
      />

      <div className="studio-segment-bottom-row studio-segment-tools">
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <button
            type="button"
            className={`studio-segment-tts-preview-btn ${previewingSegId === seg.id ? "loading" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onPreviewTts(seg);
            }}
            title="Nghe thử giọng đọc câu thoại này (Kokoro TTS)"
          >
            <IconVolume2 size={11} />
            {previewingSegId === seg.id ? "Đang tạo..." : "Nghe câu"}
          </button>

          {seg.hasAudio && onClearVoice && (
            <button
              type="button"
              className="studio-segment-sub-btn"
              style={{
                color: "#f87171",
                background: "rgba(239, 68, 68, 0.1)",
                borderColor: "rgba(239, 68, 68, 0.3)",
                fontSize: 10,
                padding: "3px 6px",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onClearVoice(seg.id);
              }}
              title="Xoá âm thanh lồng tiếng câu này (giữ nguyên phụ đề chữ)"
            >
              <IconVolumeX size={11} /> Xoá tiếng
            </button>
          )}
        </div>

        <div className="studio-segment-item-actions">
          <button
            type="button"
            className="studio-segment-sub-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSplit(seg.id);
            }}
            title="Tách câu tại playhead"
          >
            <IconScissors size={11} />
          </button>
          <button
            type="button"
            className="studio-segment-sub-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(seg.id);
            }}
            title="Xoá toàn bộ câu này (cả phụ đề chữ & âm thanh)"
          >
            <IconTrash size={11} />
          </button>
        </div>
      </div>
    </div>
  );
});

interface StudioTimelineSubtitleBlockProps {
  seg: SubtitleItem;
  totalDur: number;
  timelineWidth: number;
  isSelected: boolean;
  isMultiSelected: boolean;
  onBlockClick: (seg: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => void;
  onBlockMouseDown: (seg: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => void;
  onNudge: (segId: number, field: "start" | "end", delta: number) => void;
}

const StudioTimelineSubtitleBlock = memo(function StudioTimelineSubtitleBlock({
  seg,
  totalDur,
  timelineWidth,
  isSelected,
  isMultiSelected,
  onBlockClick,
  onBlockMouseDown,
  onNudge,
}: StudioTimelineSubtitleBlockProps) {
  const left = (seg.start / totalDur) * timelineWidth;
  const rawWidth = ((seg.end - seg.start) / totalDur) * timelineWidth;
  const width = Math.max(3, rawWidth);
  const isCompact = width < 30;
  // [TSK-STUDIO-GLOSSARY] Câu vi phạm bảng thuật ngữ → tô vàng nhạt (class + màu).
  const violationClass = glossaryViolationClass(seg);

  return (
    <div
      key={seg.id}
      data-seg-id={seg.id}
      className={`studio-timeline-block studio-timeline-subtitle-block ${isCompact ? "is-compact" : ""} ${isSelected ? "active" : ""} ${isMultiSelected ? "multi-selected" : ""} ${violationClass}`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        background: violationClass ? "rgba(250, 204, 21, 0.38)" : "rgba(45, 212, 191, 0.35)",
        borderColor: violationClass ? "#facc15" : "#2dd4bf",
      }}
      onClick={(e) => onBlockClick(seg, e)}
      onMouseDown={(e) => onBlockMouseDown(seg, e)}
      title={`[${formatTimecode(seg.start)} → ${formatTimecode(seg.end)}] ${seg.translated || seg.original}${seg.source ? `  •  Nguồn: ${seg.source === "youtube" ? "Phụ đề YouTube (đã tải)" : "AI tự nhận dạng (Whisper)"}` : ""}  •  Kéo giữa = dời, kéo mép = cắt (Alt = tắt hít)${seg.glossaryViolation ? `  •  ⚠️ VI PHẠM THUẬT NGỮ: ${seg.glossaryViolationReason ?? "không rõ lý do"}` : ""}`}
    >
      {!isCompact && (
        <div
          className="studio-timeline-block-handle left"
          onClick={(e) => {
            e.stopPropagation();
            onNudge(seg.id, "start", -0.2);
          }}
          title="Kéo để cắt đầu câu • Bấm = lùi 0.2s"
        />
      )}
      {!isCompact && (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>
          {seg.translated}
        </span>
      )}
      {!isCompact && (
        <div
          className="studio-timeline-block-handle right"
          onClick={(e) => {
            e.stopPropagation();
            onNudge(seg.id, "end", 0.2);
          }}
          title="Kéo để cắt cuối câu • Bấm = giãn 0.2s"
        />
      )}
    </div>
  );
});

interface StudioTimelineVoiceBlockProps {
  seg: SubtitleItem;
  voiceDur: number;
  totalDur: number;
  timelineWidth: number;
  spkName: string;
  spkColor: string;
  /** false ở chế độ mỗi vai 1 lane (tên vai đã nằm ở header lane) */
  showSpeakerTag?: boolean;
  isSelected: boolean;
  isMultiSelected: boolean;
  isSpeaking: boolean;
  onBlockClick: (seg: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => void;
  onBlockMouseDown: (seg: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => void;
  onNudge: (segId: number, field: "start" | "end", delta: number) => void;
}

// Khối tiếng lồng trên track voice: memo như khối phụ đề (Note 1 — AGENT_CHAT 2026-10-12).
// Kéo = dời cả câu (start/end cùng dịch); độ dài clip TTS cố định nên không có trim.
const StudioTimelineVoiceBlock = memo(function StudioTimelineVoiceBlock({
  seg,
  voiceDur,
  totalDur,
  timelineWidth,
  spkName,
  spkColor,
  showSpeakerTag = true,
  isSelected,
  isMultiSelected,
  isSpeaking,
  onBlockClick,
  onBlockMouseDown,
  onNudge,
}: StudioTimelineVoiceBlockProps) {
  const left = (seg.start / totalDur) * timelineWidth;
  const width = Math.max(3, (voiceDur / totalDur) * timelineWidth);
  const isCompact = width < 30;
  const hasAudio = !!seg.hasAudio;

  return (
    <div
      data-seg-id={seg.id}
      className={`studio-timeline-block studio-timeline-voice-block ${isCompact ? "is-compact" : ""} ${isSelected ? "active" : ""} ${isMultiSelected ? "multi-selected" : ""} ${isSpeaking ? "is-speaking" : ""} ${hasAudio ? "has-audio" : "is-placeholder"}`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        background: hasAudio ? `linear-gradient(180deg, ${spkColor}30, ${spkColor}65)` : `rgba(255, 255, 255, 0.04)`,
        borderColor: hasAudio ? spkColor : `rgba(255, 255, 255, 0.25)`,
        borderStyle: hasAudio ? "solid" : "dashed",
      }}
      onClick={(e) => onBlockClick(seg, e)}
      onMouseDown={(e) => onBlockMouseDown(seg, e)}
      title={
        hasAudio
          ? `[Audio Lồng Tiếng: ${spkName} • ${formatTimecode(seg.start)} → ${formatTimecode(seg.start + voiceDur)}] Bấm để nghe lại • Kéo để dời câu (Alt = tắt hít)`
          : `[Chưa lồng tiếng: ${spkName}] Bấm để tạo & nghe thử câu này`
      }
    >
      {hasAudio && <div className="studio-voice-wave-texture" />}
      {!isCompact && hasAudio && (
        <div
          className="studio-timeline-block-handle left"
          onClick={(e) => {
            e.stopPropagation();
            onNudge(seg.id, "start", -0.2);
          }}
          title="Thu nhỏ/Kéo dài đầu câu (-0.2s)"
        />
      )}
      {!isCompact && (
        <div className="studio-voice-block-inner">
          <span className="studio-voice-block-icon" title="Đoạn âm thanh lồng tiếng">
            🎙️
          </span>
          {showSpeakerTag && (
            <strong className="studio-voice-block-tag" style={{ color: spkColor }}>
              [{spkName}]:
            </strong>
          )}
          <span className="studio-voice-block-text" style={{ opacity: hasAudio ? 1 : 0.7 }}>
            {seg.translated || seg.original}
          </span>
        </div>
      )}
      {!isCompact && hasAudio && (
        <div
          className="studio-timeline-block-handle right"
          onClick={(e) => {
            e.stopPropagation();
            onNudge(seg.id, "end", 0.2);
          }}
          title="Thu nhỏ/Kéo dài cuối câu (+0.2s)"
        />
      )}
    </div>
  );
});

/**
 * [TSK-TIMELINE-INTEGRATE-MODULES] Vạch marker trên thước thời gian.
 *
 * MEMO HOÁ (Note 1 — AGENT_CHAT 2026-10-12): component này KHÔNG được re-render
 * theo playhead. Props phải ổn định:
 * - `markers`: mảng state, chỉ đổi khi thêm/xoá marker.
 * - `onMarkerClick`: callback ổn định (useCallback / qua ref).
 * Vì vậy khi timeline phát, parent render lại (mỗi 120ms) mà vạch marker
 * KHÔNG render lại → không tốn CPU.
 */
const StudioTimelineMarkerLines = memo(function StudioTimelineMarkerLines({
  markers,
  timelineWidth,
  totalDur,
  onMarkerClick,
}: {
  markers: TimelineMarker[];
  timelineWidth: number;
  totalDur: number;
  onMarkerClick: (time: number) => void;
}) {
  if (markers.length === 0) return null;
  const dur = Math.max(1, totalDur);
  return (
    <>
      {markers.map((marker) => (
        <div
          key={marker.id}
          className="studio-timeline-marker-line"
          style={{
            left: `${(marker.time / dur) * timelineWidth}px`,
            background: marker.color ?? "#38bdf8",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onMarkerClick(marker.time);
          }}
          title={`Marker: ${formatTimecode(marker.time)}`}
        />
      ))}
    </>
  );
});

/**
 * Id engine TTS — KHỚP backend (`tts_engines_status`).
 *
 * R2-3 (UI redesign vòng 2): frontend KHÔNG hard-code danh sách engine/giọng nữa;
 * engine + giọng đọc đến từ backend (`tts_engines_status` + `dubbing_get_voices`).
 * Backend tự fallback (VieNeu chưa tải model -> Kokoro, xem `tts_vieneu::route_voice`),
 * nên frontend KHÔNG map `vietneu:` -> `kokoro:` nữa.
 */
export type TtsEngineKey = "kokoro" | "vieneu" | "zerotts" | "gcloud" | "fptai";


// [TSK-TABS-P2] Hàm huỷ backend của hàng đợi — đặt 1 LẦN khi nạp module. Chỉ job
// `running` mới gọi tới đây (job `queued` chỉ bị bỏ khỏi hàng, không có gì để huỷ).
jobQueue.setCancelHandler(async () => {
  const isTauri =
    typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  if (isTauri) await sublix.dubbingCancel();
});

/** [TSK-TABS-P2] Thân các việc nặng — chạy trong slot của `jobQueue` (xem `runHeavy`). */
interface HeavyImpls {
  stt: (forceRange?: boolean) => Promise<SubtitleItem[] | null>;
  translate: (inputSegs?: SubtitleItem[], forceRange?: boolean) => Promise<void>;
  voice: (forceRange?: boolean, overrideSegs?: SubtitleItem[], onlyIds?: Set<number>) => Promise<void>;
  analysis: (forceRange?: boolean, dubImmediately?: boolean, forceTranslate?: boolean) => Promise<void>;
  exportVideo: () => Promise<void>;
  /** [TSK-V014-WIRE-STUDIO] Dò phụ đề cứng (nhẹ, nhưng đi chung hàng đợi để tab hiện tiến độ đúng). */
  hardsubDetect: (region?: "bottom" | "top" | "any") => Promise<void>;
}

export default function SublixStudioView({
  appVersion,
  onNavigateTab,
  currentTheme = "cinema",
  onThemeChange,
  initialFilePath,
  isActive = true,
  tabId,
  onRequestOpenVideo,
  belowTopbar,
  onStatus,
  loadRequest,
  cancelRequest,
  restoredTab = null,
  onTaskUpdate,
  onClearPendingFile,
}: SublixStudioViewProps) {
  // [UI_R2-8_REVIEW mục 12] Trạng thái cửa sổ overlay nổi (nút 👁 trên topbar Studio).
  const [overlayVisible, setOverlayVisible] = useState(false);
  const handleToggleOverlay = async () => {
    try {
      if (overlayVisible) {
        await sublix.hideOverlay();
        setOverlayVisible(false);
      } else {
        await sublix.showOverlay();
        setOverlayVisible(true);
      }
    } catch (err) {
      console.warn("Bật/tắt overlay thất bại:", err);
    }
  };
  // Tự động khôi phục project đã nạp từ cache nếu không có initialFilePath mới
  // [TSK-TABS-P3] Dữ liệu khôi phục theo TỪNG TAB (host đọc `sessionStore` rồi truyền
  // xuống); không còn đọc khoá v1 — host đã migrate một lần.
  const [cachedProject] = useState(() => {
    if (initialFilePath || !restoredTab) return null;
    return {
      filePath: restoredTab.filePath,
      fileName: restoredTab.fileName,
      mediaDuration: restoredTab.mediaDuration,
      segments: restoredTab.segments as SubtitleItem[],
      speakers: restoredTab.speakers.map((s) => ({ ...s, sampleAudio: null })) as SpeakerItem[],
      markers: restoredTab.markers,
      sttLang: restoredTab.sttLang,
      targetLang: restoredTab.targetLang,
      hadAudio: restoredTab.hadAudio === true,
    };
  });
  /** Tab khôi phục từng có tiếng lồng (đã mất) và chưa tạo lại ⇒ nhắc 1 lần + giữ cờ khi lưu. */
  const lostAudioRef = useRef<boolean>(cachedProject?.hadAudio === true);
  const lostAudioToastedRef = useRef<boolean>(false);

  // Navigation & Project Meta
  const [filePath, setFilePath] = useState<string>(
    initialFilePath || cachedProject?.filePath || ""
  );
  const [fileName, setFileName] = useState<string>(
    initialFilePath
      ? (initialFilePath.split(/[\\/]/).pop() || "")
      : (cachedProject?.fileName || "")
  );

  // [TSK-FIX-BUG-R2-8-01] Id task DUY NHẤT theo lần chạy.
  // Trước đây id là hằng "dubbing_active" ⇒ mọi lượt chạy ghi CÙNG 1 id vào lịch sử
  // ⇒ React key trùng ở tab Tiến trình. Nay: lần chạy mới ⇒ id mới; các cập nhật
  // tiến độ của CÙNG lượt ⇒ giữ nguyên id (1 mục lịch sử / lượt chạy).
  const activeTaskRunIdRef = useRef<string | null>(null);

  // Helper đồng bộ tiến trình chi tiết sang SettingsView / Process Center
  const notifyTaskUpdate = (payload: Partial<StudioTaskUpdatePayload>) => {
    if (!onTaskUpdate) return;
    const currentName = fileName || (filePath ? filePath.split(/[\\/]/).pop() || "Video" : "Video");
    // Lượt chạy MỚI = có `workflowType` + đang chạy (điểm bắt đầu 1 bước).
    const isNewRun = payload.status === "running" && !!payload.workflowType;
    if (!activeTaskRunIdRef.current || isNewRun) {
      activeTaskRunIdRef.current = makeTaskRunId("dubbing", Date.now());
    }
    onTaskUpdate({
      id: activeTaskRunIdRef.current,
      status: "running",
      fileName: currentName,
      targetTab: "studio",
      tabId,
      sourcePath: filePath || undefined,
      runId: slotRunIdRef.current ?? undefined,
      ...payload,
    } as StudioTaskUpdatePayload);
  };
  const [mediaDuration, setMediaDuration] = useState<number>(
    cachedProject?.mediaDuration || 0
  );

  // Undo history stacks: General, Subtitles, Translations, Audio/Speakers
  // [TSK-TIMELINE-REDO-RIPPLE] 3 lớp hoàn tác dùng module `history.ts` (past + future) → có REDO.
  const [undoStack, setUndoStack] = useState<SubtitleItem[][]>([]);
  const [subtitleHistory, setSubtitleHistory] = useState<History<SubtitleItem[]>>(() =>
    createHistory<SubtitleItem[]>(),
  );
  const [translationHistory, setTranslationHistory] = useState<
    History<Array<{ id: number; translated: string }>>
  >(() => createHistory<Array<{ id: number; translated: string }>>());
  const [audioHistory, setAudioHistory] = useState<History<SpeakerItem[]>>(() =>
    createHistory<SpeakerItem[]>(),
  );

  // R2-3: accordion 1-bước-mở nằm trong `pipelineOpenStep` (panel mới).

  // Kích thước có thể thay đổi của Panel Trái & Panel Phải (Resizable Sidebars)
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("sublix_studio_left_w");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 250 && val <= 600) return val;
      }
    } catch {}
    return 340;
  });

  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("sublix_studio_right_w");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 260 && val <= 700) return val;
      }
    } catch {}
    return 350;
  });

  const [isDraggingLeft, setIsDraggingLeft] = useState<boolean>(false);
  const [isDraggingRight, setIsDraggingRight] = useState<boolean>(false);

  // Bộ chọn TTS Engine / Model AI (chỉ chọn 1 trong 3 mô hình, không còn 'all')
  // R2-3: engine + giọng đọc lấy TỪ BACKEND (`tts_engines_status` + `dubbing_get_voices`).
  const [selectedTtsEngine, setSelectedTtsEngine] = useState<TtsEngineKey>(() => {
    try {
      const saved = localStorage.getItem("sublix_selected_tts_engine");
      // Migrate id cũ của frontend (vietneu/edge) sang id backend (vieneu/…).
      if (saved === "vietneu") return "vieneu";
      if (
        saved === "kokoro" ||
        saved === "vieneu" ||
        saved === "zerotts" ||
        saved === "gcloud" ||
        saved === "fptai"
      ) {
        return saved as TtsEngineKey;
      }
    } catch {}
    return "vieneu";
  });

  // Trạng thái engine TTS + danh mục giọng đọc (nguồn sự thật: backend).
  const [ttsEngines, setTtsEngines] = useState<TtsEngineInfo[]>([]);
  const [voicePresets, setVoicePresets] = useState<VoicePreset[]>([]);
  const [ttsEngineDownloading, setTtsEngineDownloading] = useState<string | null>(null);
  const [ttsEngineDownloadPct, setTtsEngineDownloadPct] = useState<number | null>(null);

  // TSK-STUDIO-MODEL-PICKER: model dịch + mức suy luận (chọn ngay trong Studio).
  const [translateOptions, setTranslateOptions] = useState<TranslateOptions | null>(null);
  const [translateOptionsLoading, setTranslateOptionsLoading] = useState<boolean>(false);
  const [translateOptionsUnavailable, setTranslateOptionsUnavailable] = useState<boolean>(false);

  /** Danh sách giọng của 1 engine (lọc theo prefix do backend khai báo). */
  const voicesForEngine = useCallback(
    (engine: TtsEngineKey | string): VoicePreset[] => {
      const info = ttsEngines.find((e) => e.id === engine);
      const prefix = info?.prefix;
      if (!prefix) return voicePresets.filter((v) => !v.id.includes(":"));
      return voicePresets.filter((v) => v.id.startsWith(prefix));
    },
    [ttsEngines, voicePresets],
  );

  /** Giọng mặc định (nam/nữ) của engine — lấy từ danh mục backend. */
  const defaultVoiceForEngine = useCallback(
    (engine: TtsEngineKey | string, gender: "male" | "female"): string => {
      const list = voicesForEngine(engine);
      const found = list.find((v) => v.gender === gender) ?? list[0];
      return found?.id ?? "";
    },
    [voicesForEngine],
  );

  // State & Ref nghe thử âm thanh mẫu của Model và Speaker (quản lý dừng/phát mượt mà, không đè)
  const currentAudioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [playingEngineSample, setPlayingEngineSample] = useState<TtsEngineKey | null>(null);
  const engineSampleAudioRef = useRef<HTMLAudioElement | null>(null);

  // R2-3: KHÔNG map `vietneu:` → `kokoro:` ở frontend nữa.
  // Backend tự route/fallback (`tts_vieneu::route_voice` trong synthesize_speech):
  // VieNeu chưa tải model → fallback Kokoro, nên không mất tiếng project cũ.
  // Frontend chỉ gửi nguyên id giọng của vai xuống backend.

  // Step 1: STT Settings
  const [sttLang, setSttLang] = useState<string>("auto");
  const [sttModel, setSttModel] = useState<string>("large-v3-turbo");

  // Step 2: Translation Provider & Consistency Glossary
  const [targetLang, setTargetLang] = useState<string>("vi");
  const [transProvider, setTransProvider] = useState<string>("deepseek");
  const [deepseekKey, setDeepseekKey] = useState<string>("");
  const [deepseekModel, setDeepseekModel] = useState<string>("deepseek-chat");
  const [openrouterKey, setOpenrouterKey] = useState<string>("");
  const [openrouterModel, setOpenrouterModel] = useState<string>("deepseek/deepseek-chat");
  const [minimaxKey, setMinimaxKey] = useState<string>("");
  const [minimaxModel, setMinimaxModel] = useState<string>("MiniMax-M3");
  // R2-4: model Ollama chỉ dùng để hiện dòng "nhà cung cấp" (chỉ đọc) ở panel.
  const [ollamaModel, setOllamaModel] = useState<string>("");
  const [transStyle, setTransStyle] = useState<string>("theatrical");
  // R2-04.3: Glossary starts empty, loaded from AppConfig
  // [TSK-STUDIO-GLOSSARY] Bảng thuật ngữ CŨ dạng chuỗi (config toàn cục) — giữ nguyên
  // để không mất dữ liệu người dùng; bảng MỚI (thuật ngữ + xưng hô) đọc/ghi qua backend
  // theo project (`glossary_get` / `glossary_set`).
  const [legacyGlossary, setLegacyGlossary] = useState<string[]>([]);
  // [TSK-STUDIO-GLOSSARY] Bảng thuật ngữ + xưng hô đã duyệt (null = chưa nạp).
  const [glossary, setGlossary] = useState<Glossary | null>(null);
  /** Hộp thoại bảng thuật ngữ đang mở. */
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  /** Đang chạy "Gợi ý từ kịch bản". */
  const [glossarySuggesting, setGlossarySuggesting] = useState(false);
  /** Ước tính giây cho lượt "đọc hiểu" (null = chưa chạy gợi ý). */
  const [glossarySuggestEstimateSec, setGlossarySuggestEstimateSec] = useState<number | null>(null);
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string[]>([]);

  // Step 3: Speakers & Segments (P2, P4, P5)
  // Tự động chuyển đổi vai mang tên "Phụ đề" thành "Thuyết minh AI" để tránh nhầm lẫn giữa Track Phụ Đề và Track Lồng Tiếng
  const getSpeakerDisplayName = (spk?: SpeakerItem | null): string => {
    if (!spk) return "Thuyết minh AI";
    const trimmed = (spk.name || "").trim();
    if (!trimmed || trimmed.toLowerCase() === "phụ đề" || trimmed.toLowerCase() === "subtitles") {
      return "Thuyết minh AI";
    }
    return spk.name;
  };

  // R32: Tính toán độ dài hiển thị của khối tiếng lồng trên timeline.
  // Khi đã có TTS thật: dùng đúng audioDuration (chặn không vượt quá cuối video).
  // Khi chưa tạo TTS (hoặc mới nạp SRT): ước tính thời lượng phát âm thực tế (~3.5 từ/giây + 0.4s đệm)
  // thay vì lấy nguyên khung SRT seg.end - seg.start (vốn có thể dài 20-30s cho câu 2 từ gây cảm giác track lồng tiếng dài ngoằng).
  const computeVoiceBlockDur = (seg: SubtitleItem, totalDur: number, nextStart?: number): number => {
    const maxAllowed = Math.max(0.3, totalDur - seg.start);
    let dur: number;
    if (seg.audioDuration && seg.audioDuration > 0) {
      dur = Math.min(seg.audioDuration, maxAllowed);
    } else {
      const text = (seg.translated || seg.original || "").trim();
      const wordCount = text.length > 0 ? text.split(/\s+/).length : 0;
      const slotDur = Math.max(0.3, seg.end - seg.start);
      const estimatedDur = Math.max(0.8, Math.min(slotDur, wordCount * 0.35 + 0.4));
      dur = Math.min(estimatedDur, maxAllowed);
    }
    // Khối lồng tiếng KHÔNG được chồng lên câu kế tiếp (đo được 45/78 cặp chồng,
    // tổng 30.81s) — chặn theo mốc bắt đầu của câu kế tiếp.
    if (nextStart !== undefined && nextStart > seg.start) {
      dur = Math.min(dur, Math.max(0.3, nextStart - seg.start));
    }
    return dur;
  };

  const [speakers, setSpeakers] = useState<SpeakerItem[]>(() => {
    const raw = cachedProject?.speakers || [];
    return raw.map((s) => (s.name.trim().toLowerCase() === "phụ đề" ? { ...s, name: "Thuyết minh AI" } : s));
  });

  useEffect(() => {
    if (speakers.some((s) => s.name.trim().toLowerCase() === "phụ đề")) {
      setSpeakers((prev) =>
        prev.map((s) => (s.name.trim().toLowerCase() === "phụ đề" ? { ...s, name: "Thuyết minh AI" } : s))
      );
    }
  }, [speakers]);
  const [expectedSpeakerCount, setExpectedSpeakerCount] = useState<number>(1); // 1: 1 người (độc thoại/thuyết minh), 2: 2 người (đối thoại), 0: tự động
  const [twoSpeakerGenderPreset, setTwoSpeakerGenderPreset] = useState<"mf" | "mm" | "ff">("mf"); // mf: 1 Nam 1 Nữ, mm: 2 Nam, ff: 2 Nữ
  const [collapseSpeakerTracks, setCollapseSpeakerTracks] = useState<boolean>(false);
  const [showMergeModal, setShowMergeModal] = useState<boolean>(false);
  const [mergeFromSpkId, setMergeFromSpkId] = useState<string>("");
  const [mergeToSpkId, setMergeToSpkId] = useState<string>("");
  const [deleteSourceAfterMerge, setDeleteSourceAfterMerge] = useState<boolean>(true);
  const [segments, setSegments] = useState<SubtitleItem[]>(
    cachedProject?.segments || []
  );
  const [selectedSegId, setSelectedSegId] = useState<number>(0);
  const [selectedSegIds, setSelectedSegIds] = useState<number[]>([]);
  const selectedSegIdsRef = useRef<number[]>([]);
  selectedSegIdsRef.current = selectedSegIds;

  // ROUND-11: Marquee Box Selection on Timeline
  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const isMarqueeSelectingRef = useRef<boolean>(false);
  // Dùng chung cho marquee VÀ kéo thả khối: true trong ~150ms sau khi thả → nuốt cú click đi kèm.
  const didJustMarqueeRef = useRef<boolean>(false);
  // true khi người dùng CHỦ ĐỘNG chọn ≥2 khối (Ctrl/Shift+click, marquee) → seek/phát/đổi segments
  // KHÔNG được tự ép lại selection về 1 câu (BUG-A). Reset khi click thường / click vùng trống / seek thủ công.
  const multiSelectLockRef = useRef<boolean>(false);
  // Kéo thả khối (Premiere-style): element chỉ dẫn DOM trực tiếp, KHÔNG setState khi đang kéo.
  const snapLineRef = useRef<HTMLDivElement | null>(null);
  const dragTipRef = useRef<HTMLDivElement | null>(null);
  const dragAbortRef = useRef<(() => void) | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // ROUND-12: Timeline Tool Mode (Tách riêng chế độ Chọn vs Tua timeline)
  const [timelineToolMode, setTimelineToolMode] = useState<"select" | "scrub" | "range">("select");
  const timelineToolModeRef = useRef<"select" | "scrub" | "range">("select");
  timelineToolModeRef.current = timelineToolMode;

  // ROUND-13: Các tính năng cốt lõi (Phụ đề & Lồng tiếng)
  const [workflowOptStt, setWorkflowOptStt] = useState<boolean>(true);
  const [workflowOptTranslate, setWorkflowOptTranslate] = useState<boolean>(true);
  const [workflowOptVoice, setWorkflowOptVoice] = useState<boolean>(false);
  // [UI_R2-8_REVIEW mục 10] Số bước đang bật — dùng cho gợi ý "▶ Chạy N bước đã bật"
  // (khớp với nút chạy ở panel trái).
  const enabledStepCount =
    (workflowOptStt ? 1 : 0) + (workflowOptTranslate ? 1 : 0) + (workflowOptVoice ? 1 : 0);

  // v0.11.32 (PO): tận dụng phụ đề đã tải (YouTube .srt cạnh video) — mặc định BẬT.
  const [preferExistingSrt, setPreferExistingSrt] = useState<boolean>(true);
  const [availableSubs, setAvailableSubs] = useState<Array<{ lang: string; source: string }>>([]);
  // v0.11.32 (PO): nguồn phụ đề đang dùng — có giá trị "srt:<lang>" khi lấy từ
  // file YouTube tải sẵn → hiện badge "📥 YouTube" trên timeline để phân biệt.
  const [transcriptSource, setTranscriptSource] = useState<string | null>(null);

  // Nền tảng của phụ đề đang dùng: "srt:<lang>" → tra `availableSubs` (đọc từ
  // manifest `sublix_subtitles.json`) để hiện đúng "YouTube" / "Bilibili"…
  const transcriptSourcePlatform: string = (() => {
    if (!transcriptSource || !transcriptSource.startsWith("srt:")) return "";
    const srtLang = transcriptSource.split(":")[1];
    const src = availableSubs.find((s) => s.lang === srtLang)?.source ?? "youtube";
    return subtitleSourceLabel(src) || "YouTube";
  })();

  // v0.11.32: khi đổi video → dò phụ đề có sẵn cạnh video để hiển thị lựa chọn.
  useEffect(() => {
    setTranscriptSource(null);
    if (!filePath) {
      setAvailableSubs([]);
      return;
    }
    let alive = true;
    sublix
      .dubbingAvailableSubs(filePath)
      .then((subs) => {
        if (alive) setAvailableSubs(subs);
      })
      .catch(() => {
        if (alive) setAvailableSubs([]);
      });
    return () => {
      alive = false;
    };
  }, [filePath]);

  const [speakerFilter, setSpeakerFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Pipeline Analysis Status
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<number>(0);
  const [analyzeMessage, setAnalyzeMessage] = useState<string>("");
  // [TSK-TABS-P2] Vị trí của tab này trong hàng đợi việc nặng (1 = kế tiếp; null = không xếp hàng).
  const [queuedPosition, setQueuedPosition] = useState<number | null>(null);
  /** runId của job đang GIỮ SLOT của instance này (null = không giữ). */
  const slotRunIdRef = useRef<string | null>(null);
  /** runId các job đã bị huỷ lúc đang chạy ⇒ vòng lặp frontend (TTS, dịch lô) phải dừng. */
  const abortedRunsRef = useRef<Set<string>>(new Set());
  /** Bản MỚI NHẤT của các hàm thân việc nặng (job xếp hàng chạy sau ⇒ tránh closure cũ). */
  const heavyImplsRef = useRef<HeavyImpls | null>(null);

  // R2-03 & R2-D: Real audio peaks and filmstrip video thumbnails
  // [TSK-TABS-P3] Không lưu peaks/thumbs trong phiên — trích lại khi tab được chọn.
  const [audioPeaks, setAudioPeaks] = useState<number[]>([]);
  const [filmstripThumbs, setFilmstripThumbs] = useState<Array<{ time_sec: number; data_uri: string }>>([]);
  const [isPreviewExtracting, setIsPreviewExtracting] = useState<boolean>(false);

  // Preview TTS, Progressive Simulation & Export
  const [previewingSegId, setPreviewingSegId] = useState<number | null>(null);
  const [auditioningSpkId, setAuditioningSpkId] = useState<string | null>(null);
  const [playingAudioSpkId, setPlayingAudioSpkId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportMessage, setExportMessage] = useState<string>("");
  const [exportDonePath, setExportDonePath] = useState<string>("");
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportSubMode, setExportSubMode] = useState<"softsub" | "hardsub" | "none">("softsub");
  const [exportAudioMode, setExportAudioMode] = useState<"multitrack" | "mixed" | "original">("multitrack");
  // Video Stage & Player (P3) & Master Studio Playback Engine
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const animFrameRef = useRef<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  // Ref để syncVoicePlayback (closure cũ trong native listener) luôn đọc tốc độ mới nhất (BUG-B).
  const playbackSpeedRef = useRef<number>(1.0);
  playbackSpeedRef.current = playbackSpeed;
  const [videoPlayError, setVideoPlayError] = useState<boolean>(false);
  // ROUND-4 R4-01: path to ffmpeg-transcoded preview (H.264/AAC baseline).
  // null = original file. Set when WebView2 fails to decode the original codec.
  const [transcodedPath, setTranscodedPath] = useState<string | null>(null);
  // R5-01: refs for async timeout check (avoid stale closure).
  const filePathRef = useRef<string | null>(null);
  const transcodedPathRef = useRef<string | null>(null);
  filePathRef.current = filePath;
  transcodedPathRef.current = transcodedPath;
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState<boolean>(false);
  const scrubbingCleanupRef = useRef<(() => void) | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const timelineTracksBodyRef = useRef<HTMLDivElement | null>(null);

  // Hardware-accelerated playhead & timecode DOM refs (Tránh re-render 4000 nodes 60fps gây treo máy)
  const playheadElementRef = useRef<HTMLDivElement | null>(null);
  const timecodeElementRef = useRef<HTMLSpanElement | null>(null);
  const lastTimeStateUpdateRef = useRef<number>(0);

  // Timeline (P5)
  const [batchMode, setBatchMode] = useState<boolean>(false);
  // ROUND-10: Premiere-style Vertical Timeline Resizer (Kéo mở rộng chiều cao Timeline)
  const [timelineHeight, setTimelineHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("sublix_studio_timeline_height");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 180 && val <= 1200) return val;
      }
    } catch {
      // fallback
    }
    return 320;
  });
  const [isResizingTimeline, setIsResizingTimeline] = useState<boolean>(false);
  const timelineHeightRef = useRef<number>(timelineHeight);
  timelineHeightRef.current = timelineHeight;

  // v0.11.3: zoom semantic đổi từ "số giây hiển thị" → "% viewport" (100% = full video fit viewport).
  // Đúng chuẩn Premiere/DaVinci: zoom out max = toàn cảnh video, zoom in = frame lớn.
  // Mốc tick tự co giãn (1s/5s/30s/1min/5min...) theo pxPerSec, không cố định 5s nữa.
  const [zoomLevel, setZoomLevel] = useState<number>(100); // % viewport (100 = full video)
  const [magnetSnap, setMagnetSnap] = useState<boolean>(true);
  const magnetSnapRef = useRef<boolean>(true);
  magnetSnapRef.current = magnetSnap;
  const [linkTracks, setLinkTracks] = useState<boolean>(true);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Subtitle Display Mode & Video Scale
  const [subtitleDisplayMode, setSubtitleDisplayMode] = useState<"translated" | "original" | "bilingual">("translated");
  const [videoScale, setVideoScale] = useState<number>(100);

  // Right column tab (Phụ đề vs Thuộc tính)
  const [rightTab, setRightTab] = useState<"subtitles" | "properties">("subtitles");

  // Subtitle styling properties (driven by Thuộc tính tab)
  const [subFontColor, setSubFontColor] = useState<string>("#e8a33d");

  // ROUND-8: Timeline In/Out Loop Range & Custom Range Selection (Khoanh vùng phạm vi)
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [useRangeOnly, setUseRangeOnly] = useState<boolean>(false);
  const inPointRef = useRef<number | null>(null);
  const outPointRef = useRef<number | null>(null);
  inPointRef.current = inPoint;
  outPointRef.current = outPoint;

  // ROUND-8: Timeline Visual Progressive Filling & Action States (Lấp đầy trực quan)
  const [timelineProcessType, setTimelineProcessType] = useState<"stt" | "translate" | "voice" | "pipeline" | null>(null);
  const [timelineProgress, setTimelineProgress] = useState<number>(0);
  const [timelineProcessMessage, setTimelineProcessMessage] = useState<string>("");

  // ROUND-25: Timeline Context Menu (Menu Chuột Phải Cho Khoanh Vùng & Toàn Bộ Timeline)
  interface TimelineContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    time: number;
    hasRange: boolean;
    inPoint: number | null;
    outPoint: number | null;
    segCount: number;
    /** [TSK-STUDIO-GLOSSARY] Câu nằm dưới con trỏ (menu "Dịch lại câu này"). */
    segId: number | null;
  }
  const [timelineContextMenu, setTimelineContextMenu] = useState<TimelineContextMenuState | null>(null);

  // ROUND-25: Tự động đóng Context Menu khi click ngoài hoặc bấm Escape
  useEffect(() => {
    // [TSK-TABS-P1] Chỉ instance ĐANG HOẠT ĐỘNG mới đóng menu timeline.
    if (!isActive) return;
    if (!timelineContextMenu) return;
    const handleCloseCtx = () => setTimelineContextMenu(null);
    const handleKeyClose = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTimelineContextMenu(null);
    };
    window.addEventListener("click", handleCloseCtx);
    window.addEventListener("keydown", handleKeyClose);
    return () => {
      window.removeEventListener("click", handleCloseCtx);
      window.removeEventListener("keydown", handleKeyClose);
    };
  }, [timelineContextMenu]);

  // [TSK-TIMELINE-INTEGRATE-MODULES] Marker (thay `bookmarks: number[]` cũ):
  // có id/tên/màu, gộp trùng (<0.05s), tìm marker trước/sau, lưu theo project.
  // [TSK-TIMELINE-REDO-RIPPLE] `normalizeMarkers` đọc được project CŨ (số giây thuần,
  // thiếu id / thiếu color, time dạng chuỗi) → marker cũ không bị "mất tăm".
  const [markers, setMarkers] = useState<TimelineMarker[]>(() =>
    normalizeMarkers(cachedProject?.markers),
  );
  const markersRef = useRef<TimelineMarker[]>(markers);
  markersRef.current = markers;

  // [TSK-TIMELINE-INTEGRATE-MODULES] Khoá track (Premiere): chặn kéo/trim/split/xoá/sửa chữ/dán.
  const [trackLocks, setTrackLocks] = useState<TrackLockState>(createTrackLockState());
  const trackLocksRef = useRef<TrackLockState>(trackLocks);
  trackLocksRef.current = trackLocks;

  // [TSK-TIMELINE-INTEGRATE-MODULES] Clipboard (copy/paste câu thoại) — ref để không re-render.
  const clipboardRef = useRef<ClipboardPayload>({ segments: [], baseTime: 0 });

  // [TSK-TIMELINE-INTEGRATE-MODULES] Shuttle J/K/L — state trong ref (không re-render 60fps).
  const shuttleRef = useRef<ShuttleState>(createShuttleState());
  const kHeldRef = useRef(false);
  const shuttlePosRef = useRef(0);
  const lastShuttleSeekRef = useRef(0);
  const shuttleRafRef = useRef<number | null>(null);

  // [TSK-TIMELINE-INTEGRATE-MODULES] Auto-follow: mốc thời gian người dùng vừa cuộn tay
  // (chặn auto-follow trong 1.5s) + mốc đánh dấu lần cuộn DO TA tạo ra.
  const userScrollAtRef = useRef(0);
  const autoScrollAtRef = useRef(0);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  /**
   * [TSK-TIMELINE-INTEGRATE-MODULES] Tốc độ phát ĐANG HIỆU LỰC.
   * Nguồn tốc độ DUY NHẤT: nếu shuttle J/K/L đang tua → rate của shuttle;
   * ngược lại → rate người dùng chọn ở nút tốc độ (`playbackSpeed`).
   * Mọi chỗ gán `playbackRate` (video + audio lồng) đều đọc hàm này để
   * không có 2 nguồn tốc độ đánh nhau.
   */
  const getEffectiveRate = (): number => {
    const st = shuttleRef.current;
    if (st.direction === "forward") return st.rate;
    return playbackSpeedRef.current;
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToastMsg(null), 3000);
  };

  /**
   * [TSK-TABS-3.5] Chặn "kết quả video A ghi đè video B".
   *
   * Mọi lệnh nền chụp `startedPath` **trước** `await`; sau `await` gọi hàm này.
   * Nếu video đã đổi ⇒ trả `false` (kết quả thuộc video cũ ⇒ **bỏ**, không setState
   * / không ghi project) kèm toast "Đã bỏ kết quả của video cũ: <tên file>".
   */
  const guardProject = (startedPath: string | null | undefined): boolean => {
    const notice = staleProjectNotice(startedPath, filePathRef.current);
    if (!notice) return true;
    showToast(notice);
    return false;
  };

  // [TSK-V014-WIRE-STUDIO] State v0.14 của tab (kiểu phụ đề, phụ đề cứng, dò, huỷ, tải model).
  const [videoNatural, setVideoNatural] = useState<{ w: number; h: number } | null>(null);
  const v14 = useV014State({
    filePath,
    filePathRef,
    mediaDuration,
    videoSize: videoNatural,
    restored: restoredTab?.v014,
    showToast,
  });
  // Cỡ / vị trí / bóng chữ xem thử Bình thường lấy từ thẻ Kiểu phụ đề (v0.14) — một nguồn duy nhất.
  const subFontSize = Math.round(v14.subStyle.fontSize * 0.4);
  const subPosition = v14.subStyle.position;
  const subShowShadow = v14.subStyle.outline !== false;
  // Load config on mount
  useEffect(() => {
    sublix.getConfig().then((cfg: AppConfig) => {
      if (cfg.translation_provider) setTransProvider(cfg.translation_provider);
      if (cfg.deepseek_api_key) setDeepseekKey(cfg.deepseek_api_key);
      if (cfg.deepseek_model) setDeepseekModel(cfg.deepseek_model);
      if (cfg.openrouter_api_key) setOpenrouterKey(cfg.openrouter_api_key);
      if (cfg.openrouter_model) setOpenrouterModel(cfg.openrouter_model);
      if (cfg.minimax_api_key) setMinimaxKey(cfg.minimax_api_key);
      if (cfg.minimax_model) setMinimaxModel(cfg.minimax_model);
      if (cfg.ollama_model) setOllamaModel(cfg.ollama_model);
      if (cfg.target_lang) setTargetLang(cfg.target_lang);
      if (cfg.glossary && Array.isArray(cfg.glossary)) {
        setLegacyGlossary(cfg.glossary);
      }
    }).catch((err) => {
      console.warn("Failed to load initial config:", err);
    });
  }, []);

  // [TSK-TABS-P1] Instance chỉ nhận `initialFilePath` **một lần lúc mount** (cơ chế
  // `fileNonce` đã bị gỡ — việc mở video giờ do host quản lý qua `loadRequest`).
  const lastLoadedInitialPathRef = useRef<string | undefined>(initialFilePath || undefined);
  useEffect(() => {
    if (initialFilePath) {
      const isNewInitialPath = initialFilePath !== lastLoadedInitialPathRef.current;
      if (isNewInitialPath) {
        lastLoadedInitialPathRef.current = initialFilePath;
        handleLoadNewVideoFile(initialFilePath);
      }
    }
  }, [initialFilePath]);

  // [TSK-TABS-P1] Host yêu cầu nạp video vào tab này (tab trống được lấp đầy).
  const lastLoadRequestNonceRef = useRef<number>(-1);
  useEffect(() => {
    if (!loadRequest || !loadRequest.path) return;
    if (loadRequest.nonce === lastLoadRequestNonceRef.current) return;
    lastLoadRequestNonceRef.current = loadRequest.nonce;
    handleLoadNewVideoFile(loadRequest.path);
  }, [loadRequest]);

  // [TSK-TABS-P1] Host yêu cầu DỪNG việc (đóng tab đang chạy việc).
  const lastCancelRequestRef = useRef<number>(-1);
  useEffect(() => {
    if (cancelRequest === undefined) return;
    if (cancelRequest === lastCancelRequestRef.current) return;
    lastCancelRequestRef.current = cancelRequest;
    void handleCancelAnalysis();
  }, [cancelRequest]);

  // Tự động tạm dừng phát video khi người dùng chuyển sang tab khác
  // [TSK-TABS-P1] Ngoài pause, tab KHÔNG ACTIVE còn NHẢ hẳn <video> (src rỗng) để
  // giải phóng decoder + buffer (30–150 MB/tab); nhớ currentTime để nạp lại khi quay về.
  const releasedVideoTimeRef = useRef(0);
  useEffect(() => {
    const v = videoRef.current;
    if (!isActive && v) {
      if (!v.paused) {
        v.pause();
        setIsPlaying(false);
      }
      if (v.currentTime > 0) releasedVideoTimeRef.current = v.currentTime;
    }
  }, [isActive]);

  // Tự động lưu trạng thái dự án Studio vào localStorage (Tối ưu nhẹ, không lưu base64 ảnh để tránh tràn bộ nhớ và treo máy)
  // [TSK-TABS-P3] Mỗi tab tự lưu qua `sessionStore` (khoá riêng từng tab; tự bỏ
  // audioUrl/sampleAudio; quota đầy không crash). Manifest (thứ tự/tab chọn) do host ghi.
  useEffect(() => {
    if (!filePath || !tabId) return;
    if (segments.some((s) => s.hasAudio)) lostAudioRef.current = false;
    const timer = window.setTimeout(() => {
      const res = saveSessionTab(localStorage, {
        tabId,
        filePath,
        fileName,
        mediaDuration,
        segments,
        speakers,
        markers,
        sttLang,
        targetLang,
        currentTime: 0,
        hadAudio: lostAudioRef.current,
        v014: v14.persisted,
      });
      if (!res.ok) console.warn("Studio auto-save (sessionStore) thất bại:", res.error);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [tabId, filePath, fileName, mediaDuration, segments, speakers, sttLang, targetLang, markers, v14.persisted]);

  // [TSK-TABS-P3] Tab khôi phục từng có tiếng lồng: nhắc 1 lần khi tab được xem lần đầu.
  useEffect(() => {
    if (!isActive || !lostAudioRef.current || lostAudioToastedRef.current) return;
    lostAudioToastedRef.current = true;
    showToast("🔁 Cần tạo lại giọng — tiếng lồng đã tạo không được giữ sau khi tắt app");
  }, [isActive]);

  // [TSK-TABS-P1] Báo trạng thái NHẸ lên host (chỉ số liệu, throttle ≥250 ms).
  // Không truyền state phát (segments/timeline) xuống ⇒ đổi tab khác KHÔNG làm
  // timeline render lại.
  const statusSentAtRef = useRef(0);
  const statusTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!onStatus) return;
    const payload: StudioTabStatus = {
      busy: queuedPosition !== null ? "queued" : isAnalyzing || isExporting ? "running" : "idle",
      percent: Math.max(0, Math.min(100, Math.round(isExporting && !isAnalyzing ? exportProgress : analyzeProgress))),
      dirty: false, // Studio tự autosave vào cache ⇒ không cần cờ "chưa lưu"
      title: fileName || filePath.split(/[\\/]/).pop() || "Video mới",
      path: filePath,
    };
    const wait = Math.max(0, 250 - (Date.now() - statusSentAtRef.current));
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      statusSentAtRef.current = Date.now();
      statusTimerRef.current = null;
      onStatus(tabId ?? "", payload);
    }, wait);
    return () => {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
  }, [onStatus, tabId, isAnalyzing, isExporting, queuedPosition, exportProgress, analyzeProgress, fileName, filePath]);

  // R5-01: cleanup loadedMetadataTimer khi component unmount hoặc đổi file
  // (tránh setState sau khi component đã unmount → React warning).
  useEffect(() => {
    return () => {
      if (loadedMetadataTimerRef.current !== null) {
        clearTimeout(loadedMetadataTimerRef.current);
        loadedMetadataTimerRef.current = null;
      }
    };
  }, [initialFilePath]);

  // R5-03: cleanup preview file cũ khi user đổi video (setFilePath với file mới)
  // hoặc clear file (setFilePath("")). Dùng ref để track file trước đó → gọi
  // backend cleanup theo input_path cũ. Không cần await (fire-and-forget OK).
  const prevFilePathRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevFilePathRef.current;
    if (prev && prev !== filePath) {
      // Đổi file hoặc clear → dọn preview cũ (nếu có)
      void sublix.cleanupPreviewForInput(prev).catch((e) => {
        console.warn("cleanupPreviewForInput failed:", e);
      });
      // Reset transcodedPath để <video> không trỏ vào file preview đã bị xoá
      setTranscodedPath(null);
    }
    prevFilePathRef.current = filePath || null;
  }, [filePath]);

  // Dọn dẹp cache preview chỉ khi tắt trình duyệt / thoát ứng dụng hoàn toàn (beforeunload)
  useEffect(() => {
    // [TSK-TABS-P1] Nhiều instance mounted ⇒ chỉ instance ĐANG HOẠT ĐỘNG dọn
    // preview khi đóng app (dọn 1 lần là đủ).
    if (!isActive) return;
    const onBeforeUnload = () => {
      void sublix.cleanupAllPreviews().catch(() => {});
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isActive]);

  // Tự động trích xuất sóng âm audio peaks và thumbnails khi nạp video vào timeline
  const previewExtractedPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!filePath || filePath.trim() === "") {
      previewExtractedPathRef.current = null;
      setAudioPeaks([]);
      setFilmstripThumbs([]);
      return;
    }
    // [TSK-TABS-P3] Tab khôi phục nạp LƯỜI: tab nền chưa trích sóng âm/ảnh phim
    // (ffmpeg) cho tới khi được chọn lần đầu.
    if (!isActive) return;

    if (previewExtractedPathRef.current === filePath && (filmstripThumbs.length > 0 || mediaDuration <= 0)) {
      return;
    }

    let isCancelled = false;
    setIsPreviewExtracting(true);

    const runExtract = async () => {
      try {
        // [TSK-TABS-3.5] Chụp video TRƯỚC await → sau await mà đã đổi video thì bỏ.
        const startedPath = filePath;
        const res = await sublix.extractMediaPreview(filePath, mediaDuration > 0 ? mediaDuration : undefined);
        if (!isCancelled && guardProject(startedPath)) {
          if (res.peaks && res.peaks.length > 0) {
            setAudioPeaks(res.peaks);
          }
          if (res.filmstrip_thumbs && res.filmstrip_thumbs.length > 0) {
            setFilmstripThumbs(res.filmstrip_thumbs);
          }
          previewExtractedPathRef.current = filePath;
        }
      } catch (err) {
        console.warn("extractMediaPreview failed:", err);
      } finally {
        if (!isCancelled) {
          setIsPreviewExtracting(false);
        }
      }
    };

    runExtract();

    return () => {
      isCancelled = true;
    };
  }, [filePath, mediaDuration, isActive]);

  // M1: Native Tauri Drag & Drop for Windows WebView2
  useEffect(() => {
    // [TSK-TABS-P1] Nhiều instance cùng mounted ⇒ chỉ instance ĐANG HOẠT ĐỘNG được
    // nhận kéo-thả file (nếu không, mọi tab đều cố nạp video thả vào).
    if (!isActive) return;
    const pDragDrop = (async () => {
      try {
        const webview = getCurrentWebview();
        return await webview.onDragDropEvent((event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDraggingFile(true);
          } else if (event.payload.type === "drop") {
            setIsDraggingFile(false);
            const droppedPaths = event.payload.paths;
            if (droppedPaths && droppedPaths.length > 0) {
              const p = droppedPaths[0];
              lastLoadedInitialPathRef.current = p;
              onClearPendingFile?.();
              // [TSK-TABS-P1] Mở video từ mọi nguồn đi qua host (tab mới / nhảy tab).
              if (onRequestOpenVideo) {
                onRequestOpenVideo(p);
              } else {
                handleLoadNewVideoFile(p);
              }
              showToast(`Đã nạp video: ${p.split(/[\\/]/).pop()}`);
            } else {
              // R4-09: kéo thả nhưng không có path → báo user (không ngậm tăm)
              showToast("⚠ Kéo thả không khả dụng — hãy dùng nút 'Mở video' để chọn file.");
            }
          } else {
            setIsDraggingFile(false);
          }
        });
      } catch (err) {
        // R4-09: kéo thả fail hoàn toàn → toast cho user biết, không im lặng
        console.warn("Tauri drag-drop in SublixStudioView failed:", err);
        showToast("⚠ Kéo thả không khả dụng trên hệ thống này — hãy dùng nút 'Mở video'.");
        return () => {};
      }
    })();

    const handlePreventDrag = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", handlePreventDrag);
    window.addEventListener("drop", handlePreventDrag);

    return () => {
      window.removeEventListener("dragover", handlePreventDrag);
      window.removeEventListener("drop", handlePreventDrag);
      pDragDrop.then((u) => {
        if (typeof u === "function") u();
      }).catch((err) => {
        console.warn("Failed unregister drag-drop:", err);
      });
    };
    // [TSK-TABS-P1] isActive trong deps ⇒ chuyển tab là đăng ký/huỷ kéo-thả.
  }, [isActive, onRequestOpenVideo]);

  // Save config on provider change
  const handleSaveProviderConfig = async (overrideProvider?: string) => {
    try {
      const cfg = await sublix.getConfig();
      cfg.translation_provider = overrideProvider || transProvider;
      cfg.deepseek_api_key = deepseekKey;
      cfg.deepseek_model = deepseekModel;
      cfg.openrouter_api_key = openrouterKey;
      cfg.openrouter_model = openrouterModel;
      cfg.minimax_api_key = minimaxKey;
      cfg.minimax_model = minimaxModel;
      cfg.glossary = legacyGlossary;
      await sublix.saveConfig(cfg);
    } catch (err) {
      console.warn("Could not save config:", err);
    }
  };

  // Safe file src conversion for WebView2 (normalizing backslashes)
  const getVideoSrc = (path: string): string => {
    if (!path) return "";
    try {
      const normalized = path.replace(/\\/g, "/");
      return convertFileSrc(normalized);
    } catch (err) {
      console.warn("convertFileSrc failed, falling back to raw path:", err);
      return path;
    }
  };

  // Video metadata & time update
  // R5-01: ref tới handleLoadedMetadata để R5-01 detect video im lặng
  // (WebView2 hỏng codec kiểu im lặng: chạy giả, phát tiếng, KHUNG TRẮNG,
  // không error event). Phát hiện bằng videoWidth=0 sau ~800ms.
  const loadedMetadataTimerRef = useRef<number | null>(null);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      if (dur && !isNaN(dur) && dur > 0) {
        setMediaDuration(dur);
      }
      setVideoPlayError(false);
      {
        const vw = videoRef.current.videoWidth;
        const vh = videoRef.current.videoHeight;
        if (vw > 0 && vh > 0) setVideoNatural((p) => (p && p.w === vw && p.h === vh ? p : { w: vw, h: vh }));
      }
      // [TSK-TABS-P1] Quay lại tab ⇒ nạp lại <video> và nhảy về vị trí đã xem.
      const resumeAt = releasedVideoTimeRef.current;
      if (resumeAt > 0 && Number.isFinite(resumeAt)) {
        try {
          videoRef.current.currentTime = Math.min(resumeAt, Math.max(0, (dur || resumeAt) - 0.1));
          releasedVideoTimeRef.current = 0;
        } catch {
          /* bỏ qua: một số codec chưa sẵn sàng seek */
        }
      }
      // R4-04: Re-apply playbackRate khi metadata load — trnh bug "đổi video khi
      // đang 1.5x → element reset v 1x nhưng UI vẫn ku 1.5x (ni dối)".
      // [TSK-TIMELINE-INTEGRATE-MODULES] dùng getEffectiveRate() để không đè rate của shuttle.
      const effRate = getEffectiveRate();
      if (videoRef.current.playbackRate !== effRate) {
        videoRef.current.playbackRate = effRate;
      }
      // Kiểm tra nếu WebView2 không decode được kích thước sau 1.2s -> kích hoạt transcode fallback.
      if (loadedMetadataTimerRef.current !== null) {
        clearTimeout(loadedMetadataTimerRef.current);
      }
      loadedMetadataTimerRef.current = window.setTimeout(() => {
        const cur = videoRef.current;
        // Chỉ kích hoạt transcode fallback nếu video THẬT SỰ không giải mã được kích thước (videoWidth === 0).
        // Tuyệt đối không kích hoạt khi video chỉ đang tạm dừng (videoWidth > 0).
        if (
          cur &&
          cur.videoWidth === 0 &&
          !transcodedPathRef.current &&
          filePathRef.current
        ) {
          const reason = "videoWidth = 0 (không decode được kích thước)";
          console.warn(`R6-01: ${reason} — kích hoạt transcode fallback.`);
          showToast("⏳ Video không hiển thị hình — đang chuyển sang dạng xem được");
          // R7-02: lưu currentTime + isPlaying TRƯỚC khi swap src để resume sau transcode
          const resumeTime = cur.currentTime;
          const wasPlaying = !cur.paused;
          void (async () => {
            try {
              // [TSK-TABS-3.5] Chụp video TRƯỚC await → bỏ kết quả nếu đã đổi video.
              const startedPath = filePathRef.current;
              const previewPath = await sublix.transcodeForPreview(startedPath!);
              if (previewPath && guardProject(startedPath)) {
                setTranscodedPath(previewPath);
                // R7-02: sau khi <video> src đổi sang preview, React sẽ remount. Đợi frame tiếp theo
                // rồi gọi play() + seek về currentTime cũ nếu có thể.
                setTimeout(() => {
                  const v2 = videoRef.current;
                  if (!v2) return;
                  if (resumeTime > 0 && Number.isFinite(resumeTime)) {
                    try {
                      v2.currentTime = Math.max(0, Math.min(resumeTime, (v2.duration || resumeTime) - 0.1));
                    } catch (e) {
                      // ignore
                    }
                  }
                  if (wasPlaying) {
                    v2.play().catch((e) => console.warn("R7-02: play() failed:", e));
                  }
                }, 250);
                showToast("✅ Đã chuyển sang dạng xem được");
              }
            } catch (err) {
              console.error("R6-01 transcode fallback failed:", err);
              showToast(`❌ Không thể chuyển dạng: ${(err as Error)?.message ?? err}`);
            }
          })();
        }
      }, 1200);
    }
  };

  const lastNativeTimeUpdateRef = useRef<number>(0);
  // R32: Đồng bộ phát TIẾNG LỒNG theo playhead (không đụng logic video — chỉ thêm lớp âm thanh)
  const voicePlayRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeVoiceSegRef = useRef<number | null>(null);
  const finishedVoiceSegRef = useRef<number | null>(null);
  const isFetchingTtsRef = useRef<Set<number>>(new Set());
  const [currentPlayingVoiceSegId, setCurrentPlayingVoiceSegId] = useState<number | null>(null);

  // Premiere Pro-style Track Mute Toggles (Tắt/Bật tiếng riêng biệt cho Tiếng Gốc & Tiếng Lồng)
  const [isOriginalMuted, setIsOriginalMuted] = useState<boolean>(false);
  const isOriginalMutedRef = useRef<boolean>(false);
  isOriginalMutedRef.current = isOriginalMuted;

  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const isVoiceMutedRef = useRef<boolean>(false);
  isVoiceMutedRef.current = isVoiceMuted;

  // ── Smart Ducking (docs/DUCKING_SPEC.md §4.1) ──────────────────────────────
  // Nền hạ theo ĐƯỜNG ÂM LƯỢNG (nối khoảng nghỉ ngắn thành 1 khối, ramp mượt) — cùng thuật toán
  // và tham số với video xuất ra. Tính lại khi clip lồng tiếng / tham số đổi, KHÔNG tính mỗi frame.
  const [duckParams, setDuckParams] = useState<DuckingParams>(() => duckingParamsFromConfig(null));
  const duckEnvelope = useMemo(() => {
    const total = Math.max(1, mediaDuration);
    const voice: Array<[number, number]> = [];
    for (const s of segments) {
      if (s.hasAudio) voice.push([s.start, s.start + computeVoiceBlockDur(s, total)]);
    }
    return buildDuckingEnvelope(voice, total, duckParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computeVoiceBlockDur thuần, không phụ thuộc state
  }, [segments, mediaDuration, duckParams]);
  const duckEnvRef = useRef(duckEnvelope);
  duckEnvRef.current = duckEnvelope;

  // ── VoicePicker: giọng ghim ★ (config toàn cục) + nghe mẫu 1 giọng (mỗi lần 1 mẫu) ──
  const [favoriteVoices, setFavoriteVoices] = useState<string[]>([]);
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);
  const [previewVoiceStatus, setPreviewVoiceStatus] = useState<"loading" | "playing" | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewTokenRef = useRef<number>(0);
  const pendingDuckPatchRef = useRef<Record<string, number>>({});
  const duckSaveTimerRef = useRef<number | null>(null);
  // Mức volume NGƯỜI DÙNG chọn (chưa nhân gain ducking) và giá trị rAF ghi gần nhất — để phân biệt
  // sự kiện volumechange do ta ghi với do người dùng kéo thanh âm lượng.
  const userVolumeRef = useRef<number>(1);
  const lastDuckVolumeRef = useRef<number>(-1);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    userVolumeRef.current = v.volume;
    lastDuckVolumeRef.current = -1;
    let raf = 0;
    /** Trả `video.volume` về mức người dùng (chỉ khi ta đã ghi đè). */
    const restore = () => {
      if (lastDuckVolumeRef.current < 0) return;
      lastDuckVolumeRef.current = userVolumeRef.current;
      if (Math.abs(v.volume - userVolumeRef.current) > 1e-4) v.volume = userVolumeRef.current;
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (v.paused || v.ended) return;
      const user = userVolumeRef.current;
      // Tắt tiếng / volume 0 → không đụng (giữ hành vi cũ "không ghi đè volume người dùng").
      if (v.muted || user <= 0.001) {
        restore();
        return;
      }
      const gain = isVoiceMutedRef.current ? 1 : gainAt(duckEnvRef.current, v.currentTime);
      const target = user * gain;
      if (Math.abs(v.volume - target) > 5e-4) {
        lastDuckVolumeRef.current = target;
        v.volume = target;
      }
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      restore();
    };
    const onVolume = () => {
      if (Math.abs(v.volume - lastDuckVolumeRef.current) < 0.0015) return; // do rAF ghi
      userVolumeRef.current = v.volume;
    };
    v.addEventListener("play", start);
    v.addEventListener("pause", stop);
    v.addEventListener("ended", stop);
    v.addEventListener("volumechange", onVolume);
    if (!v.paused) start();
    return () => {
      v.removeEventListener("play", start);
      v.removeEventListener("pause", stop);
      v.removeEventListener("ended", stop);
      v.removeEventListener("volumechange", onVolume);
      stop();
    };
  }, [filePath, transcodedPath]);

  // Đồng bộ tham số ducking với config (nạp lúc mở + khi Cài đặt đổi).
  useEffect(() => {
    let alive = true;
    const sync = () => {
      sublix
        .getConfig()
        .then((cfg: AppConfig) => {
          if (!alive) return;
          const next = duckingParamsFromConfig(cfg);
          // Đang kéo thanh (chưa kịp lưu) → không để config cũ ghi đè giá trị đang kéo.
          if (Object.keys(pendingDuckPatchRef.current).length === 0) {
            setDuckParams((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
          }
          const fav = Array.isArray(cfg.favorite_voices) ? cfg.favorite_voices : [];
          setFavoriteVoices((prev) => (prev.join("\n") === fav.join("\n") ? prev : fav));
        })
        .catch((err) => console.warn("Không nạp được tham số ducking:", err));
    };
    sync();
    let unlisten: (() => void) | null = null;
    void listen("config:updated", sync)
      .then((fn) => {
        if (alive) unlisten = fn;
        else fn();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.muted = isOriginalMuted;
    }
  }, [isOriginalMuted]);

  useEffect(() => {
    if (isVoiceMuted) {
      stopVoicePlayback();
      if (previewAudioRef.current) {
        try {
          previewAudioRef.current.pause();
          previewAudioRef.current.currentTime = 0;
        } catch {
          /* noop */
        }
      }
    }
  }, [isVoiceMuted]);

  const selectedTrackTypeRef = useRef<"subtitles" | "voice">("subtitles");

  const stopVoicePlayback = () => {
    const va = voicePlayRef.current;
    if (va) {
      try {
        va.pause();
        va.onended = null;
        va.onloadedmetadata = null;
        va.currentTime = 0;
        va.removeAttribute("src");
        va.load();
      } catch {
        /* noop */
      }
    }
    activeVoiceSegRef.current = null;
    setCurrentPlayingVoiceSegId(null);
    // Âm lượng nền KHÔNG còn hạ-bật theo từng câu: vòng rAF ducking (bên dưới) lo đường âm lượng.
    const v = videoRef.current;
    if (v) v.muted = isOriginalMutedRef.current;
  };

  const syncVoicePlayback = (now: number, paused: boolean) => {
    if (isVoiceMutedRef.current) {
      if (activeVoiceSegRef.current !== null) stopVoicePlayback();
      return;
    }
    const v = videoRef.current;
    if (paused || !v) {
      if (activeVoiceSegRef.current !== null) stopVoicePlayback();
      return;
    }

    const totalDur = Math.max(1, mediaDurationRef.current || mediaDuration);
    // R32 FIX: Tìm câu lồng tiếng theo ĐỘ DÀI ÂM THANH THẬT (voiceDur), KHÔNG bám s.end (vốn có thể chỉ dài 0.02s)
    const seg = segmentsRef.current.find((s) => {
      if (!s.hasAudio) return false;
      const vDur = (s.audioDuration && s.audioDuration > 0) ? s.audioDuration : computeVoiceBlockDur(s, totalDur);
      return now >= s.start && now < s.start + vDur;
    });

    if (!seg) {
      if (activeVoiceSegRef.current !== null) stopVoicePlayback();
      finishedVoiceSegRef.current = null;
      return;
    }

    // TỰ ĐỘNG TẠO TTS TRÊN NHỊP TIMELINE NẾU CÂU CÓ TIẾNG NHƯNG CHƯA NẠP DỮ LIỆU AUDIO (on-demand streaming)
    if (!seg.audioUrl) {
      if (activeVoiceSegRef.current !== null) stopVoicePlayback();
      finishedVoiceSegRef.current = null;
      if (!isFetchingTtsRef.current.has(seg.id)) {
        isFetchingTtsRef.current.add(seg.id);
        const textToSpeak = (seg.translated || seg.original || "").trim();
        const spk = speakersRef.current.find((s) => s.id === seg.speakerId);
        const voice = spk?.voice || defaultVoiceForEngine(selectedTtsEngine, "male");
        if (textToSpeak) {
          sublix.dubbingPreviewTts(textToSpeak, voice).then((wavData) => {
            isFetchingTtsRef.current.delete(seg.id);
            if (wavData) {
              setSegments((prev) =>
                prev.map((s) => (s.id === seg.id ? { ...s, audioUrl: wavData } : s))
              );
              const curV = videoRef.current;
              if (curV && !curV.paused) {
                syncVoicePlayback(curV.currentTime, false);
              }
            }
          }).catch((err) => {
            console.warn("Auto TTS fetch error:", err);
            isFetchingTtsRef.current.delete(seg.id);
          });
        } else {
          isFetchingTtsRef.current.delete(seg.id);
        }
      }
      return;
    }

    if (activeVoiceSegRef.current === seg.id) {
      // Đang phát đúng câu — kiểm tra lệch pha (desync) và tự động resume nếu bị paused
      const va = voicePlayRef.current;
      if (va) {
        if (va.paused && !paused) {
          va.play().catch(() => {});
        }
        // BUG-B: audio lồng phải chạy cùng tốc độ với video, nếu không lệch pha → tua giật liên tục.
        // [TSK-TIMELINE-INTEGRATE-MODULES] rate hiệu lực (shuttle J/K/L được tính cả vào).
        const vaRate = getEffectiveRate();
        if (va.playbackRate !== vaRate) {
          va.playbackRate = vaRate;
        }
        const expectedTime = Math.max(0, now - seg.start);
        if (Math.abs(va.currentTime - expectedTime) > 0.35) {
          try {
            va.currentTime = expectedTime;
          } catch {
            /* noop */
          }
        }
      }
      return;
    }

    if (finishedVoiceSegRef.current === seg.id) return; // câu này vừa hết — không phát lại lặp

    stopVoicePlayback();
    const va = voicePlayRef.current ?? new Audio();
    voicePlayRef.current = va;
    activeVoiceSegRef.current = seg.id;
    setCurrentPlayingVoiceSegId(seg.id);

    const offset = Math.max(0, now - seg.start);
    // Mỗi lần nạp src, trình duyệt reset playbackRate về defaultPlaybackRate → đặt cả hai (BUG-B).
    // [TSK-TIMELINE-INTEGRATE-MODULES] dùng rate hiệu lực (có tính shuttle J/K/L).
    const loadRate = getEffectiveRate();
    va.defaultPlaybackRate = loadRate;
    va.src = seg.audioUrl;
    va.playbackRate = loadRate;

    const playVoiceClip = () => {
      try {
        if (offset > 0) va.currentTime = offset;
      } catch {
        /* noop */
      }
      va.playbackRate = playbackSpeedRef.current;
      va.play().catch((e) => console.warn("R32: voice play failed:", e));
    };

    if (va.readyState >= 1) {
      playVoiceClip();
    } else {
      va.onloadedmetadata = () => playVoiceClip();
    }

    va.onended = () => {
      if (activeVoiceSegRef.current === seg.id) {
        finishedVoiceSegRef.current = seg.id;
        stopVoicePlayback();
      }
    };
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    if (!v.paused) {
      syncVoicePlayback(t, false);
    }

    const now = performance.now();
    if (now - lastNativeTimeUpdateRef.current > 80) {
      lastNativeTimeUpdateRef.current = now;
      setCurrentTime(t);
    }
  };

  // R32: Dừng tiếng lồng khi pause/ended/seek (native listeners — theo Note 3 của Antigravity)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => {
      activeVoiceSegRef.current = null;
      syncVoicePlayback(v.currentTime, false);
    };
    const onStop = () => stopVoicePlayback();
    const onSeeked = () => {
      activeVoiceSegRef.current = null;
      finishedVoiceSegRef.current = null;
      const curT = v.currentTime;
      setCurrentTime(curT);
      // BUG-A: seek thủ công (handleSeek) đã tự xử lý selection; ở đây chỉ auto-follow khi ĐANG PHÁT
      // và không có multi-select chủ động — nếu không, Ctrl/Shift+click bị ép về 1 câu.
      if (isPlayingRef.current && !multiSelectLockRef.current) {
        const match = segmentsRef.current.find((s) => s.start <= curT && curT <= s.end);
        if (match) {
          setSelectedSegId(match.id);
          selectedSegIdRef.current = match.id;
          setSelectedSegIds([match.id]);
          selectedSegIdsRef.current = [match.id];
        } else {
          setSelectedSegId(0);
          selectedSegIdRef.current = 0;
          setSelectedSegIds([]);
          selectedSegIdsRef.current = [];
        }
      }
      syncVoicePlayback(curT, v.paused);
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onStop);
    v.addEventListener("ended", onStop);
    v.addEventListener("seeked", onSeeked);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("ended", onStop);
      v.removeEventListener("seeked", onSeeked);
      stopVoicePlayback();
    };
  }, [filePath, transcodedPath]);

  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;
  const currentTimeRef = useRef<number>(currentTime);
  currentTimeRef.current = currentTime;
  const mediaDurationRef = useRef<number>(mediaDuration);
  mediaDurationRef.current = mediaDuration;

  // Real Undo Stack Handlers (General + Layer-specific)
  const undoStackRef = useRef<SubtitleItem[][]>(undoStack);
  undoStackRef.current = undoStack;
  const subtitleHistoryRef = useRef<History<SubtitleItem[]>>(subtitleHistory);
  subtitleHistoryRef.current = subtitleHistory;
  const translationHistoryRef = useRef<History<Array<{ id: number; translated: string }>>>(
    translationHistory,
  );
  translationHistoryRef.current = translationHistory;
  const audioHistoryRef = useRef<History<SpeakerItem[]>>(audioHistory);
  audioHistoryRef.current = audioHistory;

  const segmentsRef = useRef<SubtitleItem[]>(segments);
  segmentsRef.current = segments;
  const speakersRef = useRef<SpeakerItem[]>(speakers);
  speakersRef.current = speakers;
  const selectedSegIdRef = useRef<number>(selectedSegId);
  selectedSegIdRef.current = selectedSegId;

  const saveSubtitleUndo = () => {
    setSubtitleHistory((prev) => pushHistory(prev, segmentsRef.current));
    setUndoStack((prev) => [...prev.slice(-19), segmentsRef.current]);
  };

  // R5-05: saveTranslationUndo() đ inline vo saveTranslationUndoIfChanged (push `before` thay v `after`).
  // Xo wrapper cũ để trnh TS6133 unused + trnh ti sử dụng sai trong tương lai.

  // R4-05: chỉ save translation undo khi gi trị thay đổi (onFocus + onBlur)
  // R5-05: push `before` (TRƯỚC khi sửa) lên stack — bấm ↶ = khôi phục về trạng thái trước.
  // Bug củ: gi saveTranslationUndo() (push `after`) → bấm ↶ = no-op.
  const translationPreFocusRef = useRef<{ id: number; translated: string }[] | null>(null);
  const saveTranslationUndoIfChanged = () => {
    const before = translationPreFocusRef.current;
    translationPreFocusRef.current = null;
    if (!before) return;
    const after = segmentsRef.current.map((s) => ({ id: s.id, translated: s.translated }));
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (changed) {
      // Push `before` (snapshot TRƯỚC khi user sửa) thay v `after` → bấm ↶ khi phục đng.
      setTranslationHistory((prev) => pushHistory(prev, before));
    }
  };

  const saveTranslationUndo = () => {
    setTranslationHistory((prev) =>
      pushHistory(
        prev,
        segmentsRef.current.map((s) => ({ id: s.id, translated: s.translated })),
      ),
    );
  };

  const saveAudioUndo = () => {
    setAudioHistory((prev) => pushHistory(prev, speakersRef.current));
  };

  // R4-05: chỉ save undo khi nội dung THẬT SỰ thay đổi.
  // Lưu snapshot trước khi user focus vo input; nếu blur với cng gi trị → b qua.
  const saveUndoHistory = () => {
    saveSubtitleUndo();
  };

  const handleUndo = () => {
    handleUndoSubtitles();
  };

  const handleUndoSubtitles = () => {
    const history = subtitleHistoryRef.current;
    if (!canUndo(history)) {
      showToast("ℹ Không có thao tác phụ đề nào để hoàn tác");
      return;
    }
    const step = undoHistory(history, segmentsRef.current);
    const previous = step.snapshot;
    if (!previous) return;
    setSubtitleHistory(step.history);
    setUndoStack((prev) => prev.slice(0, -1));
    setSegments((curr) => {
      // R3-10: Restore timing/structure while preserving current translated text
      return previous.map((prevSeg) => {
        const currentMatch = curr.find((c) => c.id === prevSeg.id);
        return {
          ...prevSeg,
          translated: currentMatch ? currentMatch.translated : prevSeg.translated,
        };
      });
    });
    showToast("↶ Đã hoàn tác mốc thời gian / cấu trúc phụ đề (giữ nguyên bản dịch)");
  };

  const handleUndoTranslation = () => {
    const history = translationHistoryRef.current;
    if (!canUndo(history)) {
      showToast("ℹ Không có thao tác dịch nào để hoàn tác");
      return;
    }
    const step = undoHistory(history, segmentsRef.current.map((s) => ({ id: s.id, translated: s.translated })));
    const previous = step.snapshot;
    if (!previous) return;
    setTranslationHistory(step.history);
    setSegments((curr) =>
      curr.map((s) => {
        const match = previous.find((p) => p.id === s.id);
        return match ? { ...s, translated: match.translated } : s;
      })
    );
    showToast("↶ Đã hoàn tác nội dung bản dịch");
  };

  const handleUndoAudio = () => {
    const history = audioHistoryRef.current;
    if (!canUndo(history)) {
      showToast("ℹ Không có thao tác giọng đọc nào để hoàn tác");
      return;
    }
    const step = undoHistory(history, speakersRef.current);
    const previous = step.snapshot;
    if (!previous) return;
    setAudioHistory(step.history);
    setSpeakers(previous);
    showToast("↶ Đã hoàn tác phân vai / giọng đọc nhân vật");
  };

  // ── [TSK-TIMELINE-REDO-RIPPLE] REDO (Ctrl+Shift+Z / Ctrl+Y) ───────────────
  const handleRedoSubtitles = () => {
    const history = subtitleHistoryRef.current;
    if (!canRedo(history)) {
      showToast("ℹ Không có thao tác phụ đề nào để làm lại");
      return;
    }
    const step = redoHistory(history, segmentsRef.current);
    const next = step.snapshot;
    if (!next) return;
    setSubtitleHistory(step.history);
    setUndoStack((prev) => [...prev.slice(-19), segmentsRef.current]);
    setSegments(next);
    showToast("↷ Đã làm lại thay đổi phụ đề");
  };

  const handleRedoTranslation = () => {
    const history = translationHistoryRef.current;
    if (!canRedo(history)) {
      showToast("ℹ Không có thao tác dịch nào để làm lại");
      return;
    }
    const step = redoHistory(history, segmentsRef.current.map((s) => ({ id: s.id, translated: s.translated })));
    const next = step.snapshot;
    if (!next) return;
    setTranslationHistory(step.history);
    setSegments((curr) =>
      curr.map((s) => {
        const match = next.find((p) => p.id === s.id);
        return match ? { ...s, translated: match.translated } : s;
      })
    );
    showToast("↷ Đã làm lại nội dung bản dịch");
  };

  const handleRedoAudio = () => {
    const history = audioHistoryRef.current;
    if (!canRedo(history)) {
      showToast("ℹ Không có thao tác giọng đọc nào để làm lại");
      return;
    }
    const step = redoHistory(history, speakersRef.current);
    const next = step.snapshot;
    if (!next) return;
    setAudioHistory(step.history);
    setSpeakers(next);
    showToast("↷ Đã làm lại phân vai / giọng đọc nhân vật");
  };

  // ── [TSK-TIMELINE-REDO-RIPPLE] RIPPLE DELETE (xoá + dồn khoảng trống) ───
  const handleRippleDelete = () => {
    const selected = selectedSegIdsRef.current;
    const ids =
      selected.length > 0
        ? selected
        : selectedSegIdRef.current > 0
        ? [selectedSegIdRef.current]
        : [];
    if (ids.length === 0) {
      showToast("⚠ Chưa chọn câu nào để xoá");
      return;
    }
    const result = rippleDelete({
      segments: segmentsRef.current,
      selectedIds: ids,
      lockedTracks: trackLocksRef.current.lockedTracks as string[],
      trackKeyOf: () => "subtitles",
    });
    if (result.blockedTrack) {
      showToast(
        `🔒 Track ${describeTrackKey(result.blockedTrack as TrackKey)} đang khoá — không xoá/dồn được.`,
      );
      return;
    }
    saveUndoHistory();
    setSegments(result.segments);
    clearSegmentSelection();
    showToast(
      `🗑 Đã xoá ${result.removedIds.length} câu và dồn ${result.shiftedCount} câu (${result.removedDuration.toFixed(1)}s) — Ctrl+Z để hoàn tác`,
    );
  };

  // 1-Click: Gộp nhanh toàn bộ về 2 vai chính (Vai 1 và Vai 2)
  const handleQuickMergeToTwoRoles = () => {
    if (speakers.length <= 2) {
      showToast("ℹ️ Dự án hiện đã có 2 vai diễn hoặc ít hơn.");
      return;
    }
    saveSubtitleUndo();
    saveAudioUndo();

    const mainRole1 = speakers[0];
    const mainRole2 = speakers[1];
    const mainRole1Id = mainRole1.id;
    const mainRole2Id = mainRole2.id;

    // Lập bản đồ ánh xạ các speaker thừa về 2 role chính:
    // Chẵn (0, 2, 4...) -> mainRole1Id, Lẻ (1, 3, 5...) -> mainRole2Id
    const mapping: Record<string, string> = {};
    speakers.forEach((s, idx) => {
      mapping[s.id] = idx % 2 === 0 ? mainRole1Id : mainRole2Id;
    });

    const updatedSegments = segments.map((seg) => {
      const targetSpkId = mapping[seg.speakerId] || seg.speakerId;
      return { ...seg, speakerId: targetSpkId };
    });

    const keptSpeakers: SpeakerItem[] = [
      { ...mainRole1, count: updatedSegments.filter((s) => s.speakerId === mainRole1Id).length },
      { ...mainRole2, count: updatedSegments.filter((s) => s.speakerId === mainRole2Id).length },
    ];

    setSegments(updatedSegments);
    setSpeakers(keptSpeakers);
    showToast(`⚡ Đã gộp gọn toàn bộ câu thoại về 2 vai chính: "${mainRole1.name}" và "${mainRole2.name}"!`);
  };

  // 1-Click: Gộp nhanh toàn bộ về 1 vai duy nhất (Thuyết minh độc thoại / Solo Narrator)
  const handleQuickMergeToOneRole = () => {
    if (speakers.length === 0) return;
    saveSubtitleUndo();
    saveAudioUndo();

    const mainRole = speakers[0];
    const mainRoleId = mainRole.id;

    const updatedSegments = segments.map((seg) => ({
      ...seg,
      speakerId: mainRoleId,
    }));

    const keptSpeakers: SpeakerItem[] = [
      {
        ...mainRole,
        name: mainRole.name.includes("Thuyết minh") ? mainRole.name : "Thuyết minh AI",
        count: updatedSegments.length,
      },
    ];

    setSegments(updatedSegments);
    setSpeakers(keptSpeakers);
    setExpectedSpeakerCount(1);
    setCollapseSpeakerTracks(true);
    showToast(`👤 Đã gộp toàn bộ ${updatedSegments.length} câu thoại về 1 vai duy nhất ("${keptSpeakers[0].name}")!`);
  };

  // Áp dụng tổ hợp giới tính nhanh cho 2 vai diễn (Nam & Nữ / 2 Nam / 2 Nữ)
  const handleApplyTwoSpeakerPreset = (preset: "mf" | "mm" | "ff") => {
    setTwoSpeakerGenderPreset(preset);
    saveAudioUndo();

    const currentEngine = voicesForEngine(selectedTtsEngine);
    const maleVoices = currentEngine.filter((v) => v.gender === "male");
    const femaleVoices = currentEngine.filter((v) => v.gender === "female");

    const maleV1 = maleVoices[0]?.id || defaultVoiceForEngine(selectedTtsEngine, "male");
    const maleV2 = maleVoices[1]?.id || maleV1;
    const femaleV1 = femaleVoices[0]?.id || defaultVoiceForEngine(selectedTtsEngine, "female");
    const femaleV2 = femaleVoices[1]?.id || femaleV1;

    setSpeakers((prev) => {
      let spks = [...prev];
      if (spks.length === 0) {
        spks = [
          {
            id: "spk_1",
            name: "Nhân vật 1",
            gender: "male",
            color: SPEAKER_COLORS[0],
            voice: maleV1,
            count: 0,
            sampleAudio: null,
          },
        ];
      }
      if (spks.length < 2) {
        spks.push({
          id: `spk_${Date.now()}`,
          name: "Nhân vật 2",
          gender: "female",
          color: SPEAKER_COLORS[1 % SPEAKER_COLORS.length],
          voice: femaleV1,
          count: 0,
          sampleAudio: null,
        });
      }

      if (preset === "mf") {
        return spks.slice(0, 2).map((s, idx) => {
          if (idx === 0) return { ...s, name: s.name.replace(/ \(Nam.*?\)| \(Nữ.*?\)/g, "").trim() + " (Nam)", gender: "male" as const, voice: maleV1 };
          if (idx === 1) return { ...s, name: s.name.replace(/ \(Nam.*?\)| \(Nữ.*?\)/g, "").trim() + " (Nữ)", gender: "female" as const, voice: femaleV1 };
          return s;
        });
      } else if (preset === "mm") {
        return spks.slice(0, 2).map((s, idx) => {
          if (idx === 0) return { ...s, name: s.name.replace(/ \(Nam.*?\)| \(Nữ.*?\)/g, "").trim() + " (Nam 1)", gender: "male" as const, voice: maleV1 };
          if (idx === 1) return { ...s, name: s.name.replace(/ \(Nam.*?\)| \(Nữ.*?\)/g, "").trim() + " (Nam 2)", gender: "male" as const, voice: maleV2 };
          return s;
        });
      } else {
        // "ff"
        return spks.slice(0, 2).map((s, idx) => {
          if (idx === 0) return { ...s, name: s.name.replace(/ \(Nam.*?\)| \(Nữ.*?\)/g, "").trim() + " (Nữ 1)", gender: "female" as const, voice: femaleV1 };
          if (idx === 1) return { ...s, name: s.name.replace(/ \(Nam.*?\)| \(Nữ.*?\)/g, "").trim() + " (Nữ 2)", gender: "female" as const, voice: femaleV2 };
          return s;
        });
      }
    });

    const labelMap = {
      mf: "👨‍🦱👩 1 Nam & 1 Nữ (Đối thoại chuẩn)",
      mm: "👨‍🦱👨‍🦱 2 Nam (Nam & Nam)",
      ff: "👩👩 2 Nữ (Nữ & Nữ)",
    };
    showToast(`🎭 Đã áp dụng phân vai: ${labelMap[preset]} (${selectedTtsEngine})`);
  };

  // Toggle giới tính riêng của từng vai diễn: Nam ⇄ Nữ
  const handleToggleSpeakerGender = (idx: number) => {
    saveAudioUndo();
    const currentEngine = voicesForEngine(selectedTtsEngine);
    const maleVoices = currentEngine.filter((v) => v.gender === "male");
    const femaleVoices = currentEngine.filter((v) => v.gender === "female");

    const maleVoice = maleVoices[0]?.id || defaultVoiceForEngine(selectedTtsEngine, "male");
    const femaleVoice = femaleVoices[0]?.id || defaultVoiceForEngine(selectedTtsEngine, "female");

    setSpeakers((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const newGender: "male" | "female" = s.gender === "male" ? "female" : "male";
        const newVoice = newGender === "male" ? maleVoice : femaleVoice;
        const cleanName = s.name.replace(/ \(Nam.*?\)| \(Nữ.*?\)/g, "").trim();
        return {
          ...s,
          gender: newGender,
          name: `${cleanName} (${newGender === "male" ? "Nam" : "Nữ"})`,
          voice: newVoice,
        };
      })
    );
  };

  // Gộp tuỳ chọn giữa 2 vai (Modal Merge)
  const handleConfirmMergeSpeakers = () => {
    if (!mergeFromSpkId || !mergeToSpkId) {
      showToast("⚠️ Vui lòng chọn cả vai nguồn và vai đích.");
      return;
    }
    if (mergeFromSpkId === mergeToSpkId) {
      showToast("⚠️ Vai nguồn và vai đích không được trùng nhau.");
      return;
    }

    saveSubtitleUndo();
    saveAudioUndo();

    const fromSpk = speakers.find((s) => s.id === mergeFromSpkId);
    const toSpk = speakers.find((s) => s.id === mergeToSpkId);

    const updatedSegments = segments.map((seg) => {
      if (seg.speakerId === mergeFromSpkId) {
        return { ...seg, speakerId: mergeToSpkId };
      }
      return seg;
    });

    let updatedSpeakers = speakers;
    if (deleteSourceAfterMerge) {
      updatedSpeakers = updatedSpeakers.filter((s) => s.id !== mergeFromSpkId);
    }
    updatedSpeakers = updatedSpeakers.map((s) => {
      if (s.id === mergeToSpkId) {
        return { ...s, count: updatedSegments.filter((seg) => seg.speakerId === s.id).length };
      }
      return s;
    });

    setSegments(updatedSegments);
    setSpeakers(updatedSpeakers);
    setShowMergeModal(false);
    showToast(`🔗 Đã gộp toàn bộ câu thoại từ "${fromSpk?.name || mergeFromSpkId}" vào "${toSpk?.name || mergeToSpkId}"!`);
  };

  // Xoá vai trực tiếp
  const handleDeleteSpeaker = (spkId: string) => {
    if (speakers.length <= 1) {
      showToast("⚠️ Dự án phải có ít nhất 1 vai diễn.");
      return;
    }
    saveSubtitleUndo();
    saveAudioUndo();

    const spkToDelete = speakers.find((s) => s.id === spkId);
    const remainingSpeakers = speakers.filter((s) => s.id !== spkId);
    const fallbackSpkId = remainingSpeakers[0].id;

    const updatedSegments = segments.map((seg) => {
      if (seg.speakerId === spkId) {
        return { ...seg, speakerId: fallbackSpkId };
      }
      return seg;
    });

    setSegments(updatedSegments);
    setSpeakers(remainingSpeakers);
    showToast(`🗑️ Đã xoá vai "${spkToDelete?.name || spkId}". Các câu thoại đã chuyển sang "${remainingSpeakers[0].name}".`);
  };

  const handleTogglePlay = () => {
    if (!filePath) {
      showToast("⚠ Vui lòng mở hoặc kéo thả video trước khi phát");
      return;
    }
    if (videoPlayError) {
      showToast("⚠ Video gặp lỗi định dạng, không thể phát");
      return;
    }
    const isCurrentlyPlaying = videoRef.current ? !videoRef.current.paused : isPlayingRef.current;
    if (isCurrentlyPlaying) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      stopVoicePlayback();
      if (videoRef.current && !videoRef.current.paused) {
        try { videoRef.current.pause(); } catch (e) { console.warn("Video pause error:", e); }
      }
    } else {
      if (currentTimeRef.current >= mediaDurationRef.current - 0.1 && mediaDurationRef.current > 0) {
        handleSeek(0);
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      activeVoiceSegRef.current = null;
      if (videoRef.current) {
        videoRef.current.play().then(() => {
          if (videoRef.current) {
            syncVoicePlayback(videoRef.current.currentTime, false);
          }
        }).catch((err) => {
          const isAbort = (err as Error)?.name === "AbortError";
          if (!isAbort) {
            console.error("Video element play failed:", err);
            setVideoPlayError(true);
            showToast("Không thể phát video này trong trình xem");
          }
          setIsPlaying(false);
          isPlayingRef.current = false;
          stopVoicePlayback();
        });
      }
    }
  };

  // keepSelection = true: chỉ dời playhead, KHÔNG đụng selection (dùng khi chính thao tác chọn khối đã set selection).
  const handleSeek = (timeSec: number, keepSelection: boolean = false) => {
    const dur = Math.max(1, mediaDurationRef.current || mediaDuration);
    const clamped = Math.max(0, Math.min(dur, timeSec));
    
    // Tối ưu hóa cấp phần cứng: Đồng bộ tức thì vị trí playhead & timecode (0ms trễ)
    if (playheadElementRef.current && dur > 0) {
      const leftPx = (clamped / dur) * (timelineWidthRef.current || 1200);
      playheadElementRef.current.style.left = `${leftPx}px`;
    }
    if (timecodeElementRef.current) {
      timecodeElementRef.current.textContent = formatTimecode(clamped);
    }

    finishedVoiceSegRef.current = null;
    activeVoiceSegRef.current = null;
    stopVoicePlayback();

    setCurrentTime(clamped);
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = clamped;
      } catch (e) {
        console.warn("Seek error:", e);
      }
    }

    // Đồng bộ đồng thời selection theo điểm seek để không bao giờ bị sáng lệch khối cũ ở chỗ khác
    if (!keepSelection) {
      multiSelectLockRef.current = false;
      const match = segmentsRef.current.find((s) => s.start <= clamped && clamped <= s.end);
      if (match) {
        setSelectedSegId(match.id);
        selectedSegIdRef.current = match.id;
        setSelectedSegIds([match.id]);
        selectedSegIdsRef.current = [match.id];
      } else {
        setSelectedSegId(0);
        selectedSegIdRef.current = 0;
        setSelectedSegIds([]);
        selectedSegIdsRef.current = [];
      }
    }

    if (isPlayingRef.current) {
      syncVoicePlayback(clamped, false);
    }
  };

  // Xử lý nạp tệp video mới: Reset sạch trạng thái cũ, bộ đệm preview, timeline, phân vai & undo
  const handleLoadNewVideoFile = (newPath: string) => {
    if (!newPath) return;
    setTranscodedPath(null);
    setFilePath(newPath);
    const name = newPath.split(/[\\/]/).pop() || newPath;
    setFileName(name);
    setMediaDuration(0);
    mediaDurationRef.current = 0;
    setCurrentTime(0.0);
    setIsPlaying(false);
    isPlayingRef.current = false;
    setSegments([]);
    setSpeakers([]);
    setAudioPeaks([]);
    setFilmstripThumbs([]);
    setVideoPlayError(false);
    setUndoStack([]);
    setSubtitleHistory(createHistory<SubtitleItem[]>());
    setTranslationHistory(createHistory<Array<{ id: number; translated: string }>>());
    setAudioHistory(createHistory<SpeakerItem[]>());
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      } catch (e) {
        console.warn("Video reset error:", e);
      }
    }
    // [TSK-TABS-P1] KHÔNG xoá cache ở đây nữa — cache nay thuộc TỪNG TAB
    // (host quản lý), xoá ở đây sẽ xoá nhầm dự án của tab khác.
    handleSeek(0);
  };

  // Đóng video hiện tại
  const handleCloseCurrentVideo = () => {
    setFilePath("");
    setFileName("Chưa mở video");
    setMediaDuration(0);
    mediaDurationRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    isPlayingRef.current = false;
    setSegments([]);
    setSpeakers([]);
    setAudioPeaks([]);
    setFilmstripThumbs([]);
    setUndoStack([]);
    setSubtitleHistory(createHistory<SubtitleItem[]>());
    setTranslationHistory(createHistory<Array<{ id: number; translated: string }>>());
    setAudioHistory(createHistory<SpeakerItem[]>());
    setTranscodedPath(null);
    setVideoPlayError(false);
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.src = "";
      } catch (e) {
        console.warn("Video clear error:", e);
      }
    }
    // [TSK-TABS-P1] KHÔNG xoá cache ở đây nữa — cache thuộc TỪNG TAB (host quản lý).
    lastLoadedInitialPathRef.current = "";
    onClearPendingFile?.();
    showToast("Đã đóng video hiện tại");
  };

  // R2-02: Master Studio Playback Clock (strictly synchronized to real video element, Hardware-accelerated)
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (videoRef.current) {
        if (!videoRef.current.paused) {
          try { videoRef.current.pause(); } catch (e) { console.warn("Video pause error:", e); }
        }
        setCurrentTime(videoRef.current.currentTime);
      }
      return;
    }

    const tick = () => {
      if (!isPlayingRef.current) return;
      const v = videoRef.current;
      if (!v) {
        setIsPlaying(false);
        return;
      }

      if (v.ended || videoPlayError) {
        setIsPlaying(false);
        return;
      }

      const vTime = v.currentTime;
      if (Number.isFinite(vTime)) {
        if (mediaDurationRef.current > 0 && vTime >= mediaDurationRef.current) {
          setCurrentTime(mediaDurationRef.current);
          setIsPlaying(false);
          return;
        }

        // Tối ưu hóa cấp phần cứng: Di chuyển kim playhead & cập nhật timecode trực tiếp trên DOM (60fps mượt như nhung)
        if (playheadElementRef.current && mediaDurationRef.current > 0) {
          const leftPx = (vTime / mediaDurationRef.current) * timelineWidthRef.current;
          playheadElementRef.current.style.left = `${leftPx}px`;

          // [TSK-TIMELINE-INTEGRATE-MODULES] Auto-follow (Premiere "page scroll"):
          // kim vượt 90% bề rộng viewport → lật trang. Ghi DOM trực tiếp, KHÔNG setState.
          // Tạm ngưng 1.5s sau khi người dùng cuộn tay (userScrollAtRef).
          const scroller = timelineTracksBodyRef.current;
          if (scroller && Date.now() - userScrollAtRef.current > 1500) {
            const follow = computeFollowScroll({
              playheadPx: leftPx,
              scrollLeft: scroller.scrollLeft,
              viewportWidth: scroller.clientWidth,
              mode: "page",
            });
            if (follow !== null) {
              autoScrollAtRef.current = Date.now();
              scroller.scrollLeft = follow;
            }
          }
        }
        if (timecodeElementRef.current) {
          timecodeElementRef.current.textContent = formatTimecode(vTime);
        }

        // Throttle React state re-render xuống mỗi 120ms (~8fps cho React Virtual DOM thay vì 60fps):
        // Giảm tải 90% CPU, loại bỏ hoàn toàn hiện tượng quá tải và treo máy khi video có hàng trăm câu thoại
        const now = performance.now();
        if (now - lastTimeStateUpdateRef.current > 120) {
          lastTimeStateUpdateRef.current = now;
          setCurrentTime(vTime);
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, mediaDuration, videoPlayError, filePath]);

  // R3-02: Ensure playbackRate is always synchronized on video element
  // BUG-B: ... và cả audio tiếng lồng đang phát (đổi tốc độ giữa chừng không được làm lệch pha).
  // [TSK-TIMELINE-INTEGRATE-MODULES] rate hiệu lực: shuttle J/K/L được tính cả vào
  // (đổi tốc độ bằng nút sẽ TẮT shuttle trước → không có 2 nguồn tốc độ đánh nhau).
  useEffect(() => {
    const effRate = getEffectiveRate();
    if (videoRef.current) {
      videoRef.current.playbackRate = effRate;
    }
    const va = voicePlayRef.current;
    if (va) {
      va.defaultPlaybackRate = effRate;
      va.playbackRate = effRate;
    }
  }, [playbackSpeed]);

  // Auto-follow selection theo playhead — CHỈ khi đang phát và không có multi-select chủ động (BUG-A).
  // Khi dừng/sửa chữ/nhích/đổi vai (segments đổi) selection KHÔNG bị reset về 1 câu.
  useEffect(() => {
    if (!isPlaying || multiSelectLockRef.current) return;
    const match = segmentsRef.current.find((s) => s.start <= currentTime && currentTime <= s.end);
    if (match) {
      if (match.id !== selectedSegIdRef.current) {
        setSelectedSegId(match.id);
        selectedSegIdRef.current = match.id;
      }
      // Xóa sạch mọi khối cũ bị chọn thừa/lệch trên timeline, chỉ giữ duy nhất câu đang phát
      if (selectedSegIdsRef.current.length !== 1 || selectedSegIdsRef.current[0] !== match.id) {
        setSelectedSegIds([match.id]);
        selectedSegIdsRef.current = [match.id];
      }
    } else {
      if (selectedSegIdRef.current !== 0) {
        setSelectedSegId(0);
        selectedSegIdRef.current = 0;
      }
      if (selectedSegIdsRef.current.length > 0) {
        setSelectedSegIds([]);
        selectedSegIdsRef.current = [];
      }
    }
  }, [currentTime, isPlaying]);

  // ROUND-10: Timeline Action Handlers & Shortcuts
  const handleSplitSegment = (segIdToSplit?: number) => {
    const id = segIdToSplit ?? selectedSegIdRef.current;
    if (!id) return;
    // [TSK-TIMELINE-INTEGRATE-MODULES] Track phụ đề bị khoá → chặn cắt đôi.
    if (isEditBlocked(trackLocksRef.current, "subtitles", "split")) {
      showToast(editBlockedReason("subtitles", "split"));
      return;
    }
    const curTime = currentTimeRef.current;
    const target = segmentsRef.current.find((s) => s.id === id);
    if (!target) return;
    if (curTime <= target.start || curTime >= target.end) {
      showToast("⚠️ Vị trí playhead phải nằm trong khoảng thời gian của câu thoại để cắt");
      return;
    }

    saveUndoHistory();
    setSegments((prev) => {
      const newId = (prev.length > 0 ? Math.max(...prev.map((s) => s.id)) : 0) + 1;
      const firstHalf: SubtitleItem = { ...target, end: Number(curTime.toFixed(2)) };
      const secondHalf: SubtitleItem = {
        ...target,
        id: newId,
        start: Number(curTime.toFixed(2)),
        translated: target.translated + " (phần 2)",
      };

      return prev.flatMap((s) => (s.id === id ? [firstHalf, secondHalf] : [s]));
    });
    showToast(`✂️ Đã tách câu thoại #${id} tại vị trí playhead`);
  };

  const handleDuplicateSegment = () => {
    const id = selectedSegIdRef.current;
    const target = segmentsRef.current.find((s) => s.id === id);
    if (!target) return;
    saveUndoHistory();
    const newId = (segmentsRef.current.length > 0 ? Math.max(...segmentsRef.current.map((s) => s.id)) : 0) + 1;
    const dur = target.end - target.start;
    const copy: SubtitleItem = {
      ...target,
      id: newId,
      start: Number((target.end + 0.2).toFixed(2)),
      end: Number((target.end + 0.2 + dur).toFixed(2)),
    };
    setSegments((prev) => [...prev, copy]);
    showToast("📋 Đã nhân bản câu thoại");
  };

  const handleClearVoiceAudioForSegment = (segId: number) => {
    saveUndoHistory();
    setSegments((prev) =>
      prev.map((s) =>
        s.id === segId
          ? { ...s, hasAudio: false, audioUrl: undefined, audioDuration: undefined }
          : s
      )
    );
    if (activeVoiceSegRef.current === segId) {
      stopVoicePlayback();
    }
    showToast(`🔇 Đã xoá âm thanh lồng tiếng câu #${segId} (phụ đề vẫn giữ nguyên 100%)`);
  };

  const handleDeleteSegment = (idToDelete?: number) => {
    // Nếu người dùng đang chọn khối trên Track lồng tiếng (Voice track) và nhấn Delete / nút xóa thanh công cụ timeline
    if (selectedTrackTypeRef.current === "voice") {
      const ids = idToDelete
        ? [idToDelete]
        : selectedSegIdsRef.current.length > 0
        ? selectedSegIdsRef.current
        : selectedSegIdRef.current > 0
        ? [selectedSegIdRef.current]
        : [];
      if (ids.length === 0) return;
      // [TSK-TIMELINE-INTEGRATE-MODULES] Track lồng tiếng của vai bị khoá → chặn xoá tiếng.
      const voiceKeys = Array.from(
        new Set(
          ids
            .map((id) => segmentsRef.current.find((s) => s.id === id)?.speakerId)
            .filter((x): x is string => !!x),
        ),
      ).map((id) => speakerTrackKey(id));
      const blockedVoice = blockedTracks(trackLocksRef.current, voiceKeys, "delete");
      if (blockedVoice.length > 0) {
        showToast(editBlockedReason(blockedVoice[0], "delete"));
        return;
      }
      saveUndoHistory();
      setSegments((prev) =>
        prev.map((s) =>
          ids.includes(s.id)
            ? { ...s, hasAudio: false, audioUrl: undefined, audioDuration: undefined }
            : s
        )
      );
      if (ids.some((id) => activeVoiceSegRef.current === id)) {
        stopVoicePlayback();
      }
      showToast(`🔇 Đã xoá âm thanh lồng tiếng cho ${ids.length} câu đã chọn (giữ nguyên 100% phụ đề)`);
      return;
    }

    const ids = idToDelete
      ? [idToDelete]
      : selectedSegIdsRef.current.length > 0
      ? selectedSegIdsRef.current
      : selectedSegIdRef.current > 0
      ? [selectedSegIdRef.current]
      : [];

    if (ids.length === 0 || segmentsRef.current.length === 0) return;
    // [TSK-TIMELINE-INTEGRATE-MODULES] Track phụ đề bị khoá → chặn xoá câu.
    if (isEditBlocked(trackLocksRef.current, "subtitles", "delete")) {
      showToast(editBlockedReason("subtitles", "delete"));
      return;
    }
    saveUndoHistory();
    setSegments((prev) => prev.filter((s) => !ids.includes(s.id)));
    clearSegmentSelection();
    if (ids.some((id) => activeVoiceSegRef.current === id)) {
      stopVoicePlayback();
    }
    showToast(`🗑️ Đã xoá ${ids.length} câu thoại`);
  };

  // ROUND-11 & ROUND-25: Xóa toàn bộ Track (Toàn bộ phụ đề hoặc chỉ xóa âm thanh lồng tiếng)
  const handleClearTrack = (type: "subtitles" | "speaker", spkId?: string) => {
    if (type === "subtitles") {
      const count = segmentsRef.current.length;
      if (count === 0) {
        showToast("ℹ️ Track phụ đề hiện đang trống.");
        return;
      }
      if (!window.confirm(`⚠️ Bạn có chắc chắn muốn xoá TOÀN BỘ ${count} câu phụ đề không?\n(Thao tác này sẽ xoá cả phụ đề chữ & âm thanh. Có thể hoàn tác bằng Ctrl+Z)`)) {
        return;
      }
      saveUndoHistory();
      setSegments([]);
      setSelectedSegIds([]);
      selectedSegIdsRef.current = [];
      setSelectedSegId(0);
      selectedSegIdRef.current = 0;
      stopVoicePlayback();
      showToast(`🗑️ Đã xoá sạch toàn bộ ${count} câu thoại trong track phụ đề`);
    } else if (type === "speaker") {
      // ROUND-25 FIX: Khi xóa track tiếng lồng, CHỈ XÓA ÂM THANH (hasAudio = false), BẢO TOÀN NGUYÊN VẸN 100% PHỤ ĐỀ!
      const targetSpkId = spkId || "all";
      const spk = targetSpkId !== "all" ? speakers.find((s) => s.id === targetSpkId) : null;
      const audioCount = segmentsRef.current.filter(
        (s) => (targetSpkId === "all" || s.speakerId === targetSpkId) && s.hasAudio
      ).length;

      if (audioCount === 0) {
        showToast(`ℹ️ Không có âm thanh lồng tiếng nào ${spk ? `của vai "${spk.name}"` : ""} để xoá.`);
        return;
      }

      saveUndoHistory();
      setSegments((prev) =>
        prev.map((s) => {
          if (targetSpkId === "all" || s.speakerId === targetSpkId) {
            return { ...s, hasAudio: false, audioUrl: undefined, audioDuration: undefined };
          }
          return s;
        })
      );
      stopVoicePlayback();
      showToast(
        `🗑️ Đã xoá âm thanh lồng tiếng (${audioCount} câu) ${spk ? `của vai "${spk.name}"` : ""}. Toàn bộ phụ đề vẫn giữ nguyên 100%!`
      );
    }
  };

  // ROUND-11: Chọn câu thoại có hỗ trợ Multi-select (Shift / Ctrl / Cmd)
  // BUG-A: Ctrl/Cmd = bật/tắt từng khối; Shift = chọn dải từ khối đang chọn tới khối vừa bấm (theo thứ tự thời gian).
  // Click có modifier KHÔNG seek (trước đây handleSeek → ép selection về 1 câu); click thường mới đưa playhead về đầu câu.
  const handleSelectSegmentWithModifier = (seg: SubtitleItem, e?: React.MouseEvent) => {
    const applySelection = (ids: number[], active: number) => {
      setSelectedSegIds(ids);
      selectedSegIdsRef.current = ids;
      setSelectedSegId(active);
      selectedSegIdRef.current = active;
      multiSelectLockRef.current = ids.length > 1;
    };

    if (e && e.shiftKey && selectedSegIdRef.current > 0 && selectedSegIdRef.current !== seg.id) {
      const sorted = [...segmentsRef.current].sort((a, b) => a.start - b.start);
      const iA = sorted.findIndex((s) => s.id === selectedSegIdRef.current);
      const iB = sorted.findIndex((s) => s.id === seg.id);
      if (iA >= 0 && iB >= 0) {
        const [lo, hi] = iA < iB ? [iA, iB] : [iB, iA];
        applySelection(sorted.slice(lo, hi + 1).map((s) => s.id), seg.id);
        return;
      }
    }
    if (e && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      const prev = selectedSegIdsRef.current;
      const next = prev.includes(seg.id) ? prev.filter((id) => id !== seg.id) : [...prev, seg.id];
      applySelection(next, next.length > 0 ? next[next.length - 1] : 0);
      return;
    }
    applySelection([seg.id], seg.id);
    handleSeek(seg.start, true);
  };

  // Xóa/đổi selection về rỗng một cách chủ động (click vùng trống, xóa câu…)
  const clearSegmentSelection = () => {
    multiSelectLockRef.current = false;
    setSelectedSegIds([]);
    selectedSegIdsRef.current = [];
    setSelectedSegId(0);
    selectedSegIdRef.current = 0;
  };

  // ROUND-11 & ROUND-12: Marquee Box Selection kéo chuột trái trên Timeline (Tách riêng biệt hoàn toàn với Tua Timeline)
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // [TSK-TABS-P1] Chỉ instance ĐANG HOẠT ĐỘNG mới bắt đầu thao tác kéo trên timeline.
    if (!isActive) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;

    // 1. Nếu đang ở chế độ Tua (Scrub tool mode) -> Tua video lập tức bất kể bấm ở đâu trên timeline
    if (timelineToolModeRef.current === "scrub") {
      e.preventDefault();
      startScrubbing(e.clientX);
      return;
    }

    // 2. Phân tách triệt để: Nếu click vào Ruler, Filmstrip, Sóng âm, Playhead, Range Handle, Nút bấm, Blocks -> KHÔNG BAO GIỜ vẽ Marquee
    if (
      target.closest(".studio-timeline-ruler") ||
      target.closest(".studio-timeline-playhead") ||
      target.closest(".studio-filmstrip-thumbs") ||
      target.closest(".studio-filmstrip-thumb-item") ||
      target.closest(".studio-waveform-canvas") ||
      target.closest(".studio-track-media-lane") ||
      target.closest(".studio-timeline-block") ||
      target.closest(".studio-btn-transport") ||
      target.closest("button") ||
      target.closest(".studio-ruler-range-handle")
    ) {
      return;
    }

    // 3. Chỉ kích hoạt Marquee Box trong các rãnh câu thoại hoặc vùng trống bên dưới (không thuộc dải Media)
    if (target.closest(".studio-track-media-lane")) {
      return;
    }

    const container = timelineTracksBodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft || 0;
    const startX = e.clientX - rect.left + scrollLeft;
    const startY = e.clientY - rect.top;

    let isDragging = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - e.clientX;
      const dy = moveEvent.clientY - e.clientY;

      // Ngưỡng kéo: Phải di chuyển chuột > 5px mới bắt đầu vẽ Marquee box (tránh click nhầm)
      if (!isDragging) {
        if (Math.hypot(dx, dy) < 6) return;
        isDragging = true;
        isMarqueeSelectingRef.current = true;
      }

      const curScrollLeft = container.scrollLeft || 0;
      const currentX = moveEvent.clientX - rect.left + curScrollLeft;
      const currentY = moveEvent.clientY - rect.top;

      setMarqueeBox({
        startX,
        startY,
        currentX,
        currentY,
      });

      const minX = Math.min(startX, currentX);
      const maxX = Math.max(startX, currentX);
      const minY = Math.min(startY, currentY);
      const maxY = Math.max(startY, currentY);

      const blockEls = container.querySelectorAll(".studio-timeline-block");
      const matchedIds: number[] = [];

      blockEls.forEach((block) => {
        const segId = Number(block.getAttribute("data-seg-id"));
        if (!segId) return;
        const bRect = block.getBoundingClientRect();
        const bLeft = bRect.left - rect.left + curScrollLeft;
        const bRight = bLeft + bRect.width;
        const bTop = bRect.top - rect.top;
        const bBottom = bTop + bRect.height;

        const isOverlap = bLeft < maxX && bRight > minX && bTop < maxY && bBottom > minY;
        if (isOverlap && !matchedIds.includes(segId)) {
          matchedIds.push(segId);
        }
      });

      setSelectedSegIds(matchedIds);
      selectedSegIdsRef.current = matchedIds;
      multiSelectLockRef.current = matchedIds.length > 1;
      if (matchedIds.length > 0) {
        setSelectedSegId(matchedIds[0]);
        selectedSegIdRef.current = matchedIds[0];
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      if (isDragging) {
        didJustMarqueeRef.current = true;
        setTimeout(() => {
          didJustMarqueeRef.current = false;
        }, 150);

        if (selectedSegIdsRef.current.length > 0) {
          showToast(`✨ Đã chọn ${selectedSegIdsRef.current.length} câu thoại`);
        }
      } else {
        // Chỉ click đơn trên khoảng trống track -> Bỏ chọn tất cả blocks
        clearSegmentSelection();
      }

      isMarqueeSelectingRef.current = false;
      setMarqueeBox(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // =========================================================================
  // TSK-TIMELINE-FIX-DND-RANGE — KÉO THẢ KHỐI TRÊN TIMELINE (kiểu Premiere)
  //  • Kéo giữa khối = DỜI (start/end cùng dịch, giữ độ dài; nhiều khối nếu đang multi-select)
  //  • Kéo mép trái/phải khối phụ đề = TRIM start/end (khối tiếng lồng giữ độ dài clip TTS → chỉ dời)
  //  • Hít (snap) ~8px tới playhead / mép khối lân cận / In-Out / 0 / hết video; giữ Alt = tắt hít (hoặc tắt nút nam châm)
  //  • Không chồng lên khối kề bên (chặn ở mép); 1 lần kéo = 1 bước Hoàn tác (Ctrl+Z)
  //  • Note 1-2 (Antigravity): chuyển động bằng transform/DOM ref, KHÔNG setState khi đang kéo — chỉ setSegments khi THẢ chuột.
  // Phân biệt với marquee (kéo vùng trống: handleTimelineMouseDown bỏ qua mọi mousedown trên .studio-timeline-block)
  // và scrub playhead (thước / kim / dải video & sóng âm).
  // =========================================================================
  const handleBlockMouseDown = (
    seg: SubtitleItem,
    e: React.MouseEvent<HTMLDivElement>,
    lane: "subtitles" | "voice"
  ) => {
    if (e.button !== 0 || timelineToolModeRef.current === "scrub") return;
    // Ctrl/Shift/Cmd + bấm = chọn nhiều → để onClick xử lý, không bắt đầu kéo
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    const container = timelineTracksBodyRef.current;
    if (!container) return;

    const dur = Math.max(1, mediaDurationRef.current);
    const tw = timelineWidthRef.current || 1200;
    const pxPerSec = tw / dur;
    const MIN_SEG_SEC = 0.2;
    const THRESHOLD_PX = 4;
    const SNAP_PX = 8;
    const EDGE_PX = 7;

    const blockRect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - blockRect.left;
    let mode: "move" | "trim-start" | "trim-end" = "move";
    if (lane === "subtitles" && blockRect.width >= 30) {
      if (relX <= EDGE_PX) mode = "trim-start";
      else if (blockRect.width - relX <= EDGE_PX) mode = "trim-end";
    }

    // [TSK-TIMELINE-INTEGRATE-MODULES] Track bị khoá → chặn kéo/trim.
    // - lane "subtitles" → track phụ đề ("subtitles")
    // - lane "voice"     → track lồng tiếng của vai đó ("speaker:<id>")
    const blockTrackKey: TrackKey =
      lane === "subtitles" ? "subtitles" : speakerTrackKey(seg.speakerId);
    const blockOp = mode === "move" ? ("move" as const) : ("trim" as const);
    if (isEditBlocked(trackLocksRef.current, blockTrackKey, blockOp)) {
      showToast(editBlockedReason(blockTrackKey, blockOp));
      return;
    }

    // Bấm vào khối CHƯA được chọn → chọn riêng khối đó (như Premiere); khối đã nằm trong multi-select → kéo cả nhóm.
    selectedTrackTypeRef.current = lane;
    if (!selectedSegIdsRef.current.includes(seg.id)) {
      setSelectedSegIds([seg.id]);
      selectedSegIdsRef.current = [seg.id];
      setSelectedSegId(seg.id);
      selectedSegIdRef.current = seg.id;
      multiSelectLockRef.current = false;
    }
    e.preventDefault(); // không bôi đen chữ khi kéo; click vẫn được bắn bình thường

    const segs = segmentsRef.current;
    const groupIds = new Set<number>(
      mode === "move" && selectedSegIdsRef.current.includes(seg.id) ? selectedSegIdsRef.current : [seg.id]
    );
    const members = segs.filter((s) => groupIds.has(s.id));
    if (members.length === 0) return;
    const others = segs.filter((s) => !groupIds.has(s.id));
    const midOf = (s: { start: number; end: number }) => (s.start + s.end) / 2;

    // Giới hạn dịch chuyển để KHÔNG chồng lên khối kề bên (khối láng giềng gần nhất theo điểm giữa).
    let dMin = -Infinity;
    let dMax = Infinity;
    for (const m of members) {
      let prevEnd = 0;
      let nextStart = dur;
      for (const o of others) {
        if (midOf(o) < midOf(m)) prevEnd = Math.max(prevEnd, o.end);
        else nextStart = Math.min(nextStart, o.start);
      }
      prevEnd = Math.min(prevEnd, m.start); // dữ liệu cũ đã chồng sẵn → không bị kẹt cứng
      nextStart = Math.max(nextStart, m.end);
      dMin = Math.max(dMin, prevEnd - m.start);
      dMax = Math.min(dMax, nextStart - m.end);
    }
    const gStart = Math.min(...members.map((m) => m.start));
    const gEnd = Math.max(...members.map((m) => m.end));

    // Ứng viên "hít": 0, hết video, playhead, In/Out, mép mọi khối không bị kéo
    const cands: number[] = [0, dur, videoRef.current ? videoRef.current.currentTime : currentTimeRef.current];
    if (inPointRef.current !== null) cands.push(inPointRef.current);
    if (outPointRef.current !== null) cands.push(outPointRef.current);
    for (const o of others) cands.push(o.start, o.end);
    cands.sort((a, b) => a - b);
    const snapTo = (t: number, thr: number): number | null => {
      let lo = 0;
      let hi = cands.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cands[mid] < t) lo = mid + 1;
        else hi = mid;
      }
      let best: number | null = null;
      let bestD = thr;
      for (const i of [lo - 1, lo]) {
        if (i < 0 || i >= cands.length) continue;
        const d = Math.abs(cands[i] - t);
        if (d <= bestD) {
          bestD = d;
          best = cands[i];
        }
      }
      return best;
    };

    const startX = e.clientX;
    const startY = e.clientY;
    const startScroll = container.scrollLeft || 0;
    const prevLock = multiSelectLockRef.current;
    let started = false;
    let finished = false;
    let lastClientX = e.clientX;
    let lastClientY = e.clientY;
    let lastAlt = e.altKey;
    let result: { value: number; snapAt: number | null } = { value: mode === "move" ? 0 : mode === "trim-start" ? seg.start : seg.end, snapAt: null };
    let raf: number | null = null;
    const els: Array<{ el: HTMLElement; id: number; sub: boolean; left0: number; width0: number }> = [];

    // value: move = độ dịch (giây); trim-start = start mới; trim-end = end mới
    const compute = () => {
      const dxPx = lastClientX - startX + ((container.scrollLeft || 0) - startScroll);
      const rawSec = dxPx / pxPerSec;
      const thr = SNAP_PX / pxPerSec;
      const snapOn = magnetSnapRef.current && !lastAlt;
      let snapAt: number | null = null;
      if (mode === "move") {
        let d = Math.min(dMax, Math.max(dMin, rawSec));
        if (snapOn) {
          const a = snapTo(gStart + d, thr);
          const b = snapTo(gEnd + d, thr);
          const da = a === null ? Infinity : Math.abs(a - (gStart + d));
          const db = b === null ? Infinity : Math.abs(b - (gEnd + d));
          let cand = d;
          let at: number | null = null;
          if (a !== null && da <= db) {
            cand = d + (a - (gStart + d));
            at = a;
          } else if (b !== null) {
            cand = d + (b - (gEnd + d));
            at = b;
          }
          if (at !== null && cand >= dMin - 1e-6 && cand <= dMax + 1e-6) {
            d = cand;
            snapAt = at;
          }
        }
        return { value: d, snapAt };
      }
      if (mode === "trim-start") {
        const lower = seg.start + dMin;
        const upper = seg.end - MIN_SEG_SEC;
        let ns = Math.min(upper, Math.max(lower, seg.start + rawSec));
        if (snapOn) {
          const c = snapTo(ns, thr);
          if (c !== null && c >= lower && c <= upper) {
            ns = c;
            snapAt = c;
          }
        }
        return { value: ns, snapAt };
      }
      const lowerE = seg.start + MIN_SEG_SEC;
      const upperE = seg.end + dMax;
      let ne = Math.min(upperE, Math.max(lowerE, seg.end + rawSec));
      if (snapOn) {
        const c = snapTo(ne, thr);
        if (c !== null && c >= lowerE && c <= upperE) {
          ne = c;
          snapAt = c;
        }
      }
      return { value: ne, snapAt };
    };

    const apply = () => {
      result = compute();
      const { value, snapAt } = result;
      if (mode === "move") {
        const px = value * pxPerSec;
        for (const it of els) it.el.style.transform = `translateX(${px}px)`;
      } else {
        const it = els.find((x) => x.sub);
        if (it) {
          if (mode === "trim-start") {
            const dpx = (value - seg.start) * pxPerSec;
            it.el.style.left = `${it.left0 + dpx}px`;
            it.el.style.width = `${Math.max(3, it.width0 - dpx)}px`;
          } else {
            it.el.style.width = `${Math.max(3, it.width0 + (value - seg.end) * pxPerSec)}px`;
          }
        }
      }
      const line = snapLineRef.current;
      if (line) {
        if (snapAt !== null) {
          line.style.display = "block";
          line.style.left = `${snapAt * pxPerSec}px`;
        } else {
          line.style.display = "none";
        }
      }
      const tip = dragTipRef.current;
      if (tip) {
        tip.style.display = "block";
        tip.style.left = `${lastClientX + 14}px`;
        tip.style.top = `${lastClientY - 34}px`;
        if (mode === "move") {
          tip.textContent = `${formatTimecode(gStart + value)} → ${formatTimecode(gEnd + value)}  (${value >= 0 ? "+" : ""}${value.toFixed(2)}s${members.length > 1 ? ` • ${members.length} câu` : ""})${snapAt !== null ? " 🧲" : ""}`;
        } else if (mode === "trim-start") {
          tip.textContent = `Đầu câu: ${formatTimecode(value)}  (dài ${(seg.end - value).toFixed(2)}s)${snapAt !== null ? " 🧲" : ""}`;
        } else {
          tip.textContent = `Cuối câu: ${formatTimecode(value)}  (dài ${(value - seg.start).toFixed(2)}s)${snapAt !== null ? " 🧲" : ""}`;
        }
      }
    };

    const begin = () => {
      started = true;
      multiSelectLockRef.current = true; // đang kéo: auto-follow khi phát không được cướp selection
      container.querySelectorAll<HTMLElement>(".studio-timeline-block[data-seg-id]").forEach((el) => {
        const id = Number(el.dataset.segId);
        if (!groupIds.has(id)) return;
        const sub = el.classList.contains("studio-timeline-subtitle-block");
        if (mode !== "move" && !sub) return;
        el.classList.add("is-dragging");
        els.push({ el, id, sub, left0: parseFloat(el.style.left) || 0, width0: parseFloat(el.style.width) || 0 });
      });
      // Tự cuộn ngang khi kéo sát mép vùng nhìn thấy (video dài + zoom lớn)
      const autoScroll = () => {
        if (finished) return;
        const r = container.getBoundingClientRect();
        let sp = 0;
        if (lastClientX > r.right - 36) sp = Math.min(26, (lastClientX - (r.right - 36)) / 2 + 2);
        else if (lastClientX < r.left + 36) sp = -Math.min(26, (r.left + 36 - lastClientX) / 2 + 2);
        if (sp !== 0) {
          const before = container.scrollLeft;
          container.scrollLeft += sp;
          if (container.scrollLeft !== before) apply();
        }
        raf = requestAnimationFrame(autoScroll);
      };
      raf = requestAnimationFrame(autoScroll);
    };

    const detach = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey, true);
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      if (snapLineRef.current) snapLineRef.current.style.display = "none";
      if (dragTipRef.current) dragTipRef.current.style.display = "none";
      dragAbortRef.current = null;
      multiSelectLockRef.current = started ? prevLock : multiSelectLockRef.current;
    };

    const restoreOriginal = () => {
      for (const it of els) {
        it.el.classList.remove("is-dragging");
        it.el.style.transform = "";
        if (mode !== "move" && it.sub) {
          it.el.style.left = `${it.left0}px`;
          it.el.style.width = `${it.width0}px`;
        }
      }
    };

    const finish = (commit: boolean) => {
      if (finished) return;
      finished = true;
      detach();
      if (!started) return; // chỉ là click → onClick xử lý như cũ
      // Nuốt cú click sinh ra khi thả chuột (không chọn lại / seek / bỏ chọn)
      didJustMarqueeRef.current = true;
      window.setTimeout(() => {
        didJustMarqueeRef.current = false;
      }, 180);

      const { value } = result;
      const moved = mode === "move" ? Math.abs(value) >= 0.005 : Math.abs(value - (mode === "trim-start" ? seg.start : seg.end)) >= 0.005;
      if (!commit || !moved) {
        restoreOriginal();
        return;
      }

      saveUndoHistory();
      if (mode === "move") {
        setSegments((prev) =>
          prev.map((s) => {
            if (!groupIds.has(s.id)) return s;
            const len = s.end - s.start;
            const ns = round2(Math.min(Math.max(0, s.start + value), Math.max(0, dur - len)));
            return { ...s, start: ns, end: round2(ns + len) };
          })
        );
        showToast(`↔ Đã dời ${members.length} câu thoại ${value >= 0 ? "+" : ""}${value.toFixed(2)}s (Ctrl+Z để hoàn tác)`);
      } else if (mode === "trim-start") {
        setSegments((prev) => prev.map((s) => (s.id === seg.id ? { ...s, start: round2(value) } : s)));
        showToast(`✂ Đã cắt đầu câu #${seg.id} → ${formatTimecode(value)} (Ctrl+Z để hoàn tác)`);
      } else {
        setSegments((prev) => prev.map((s) => (s.id === seg.id ? { ...s, end: round2(value) } : s)));
        showToast(`✂ Đã cắt cuối câu #${seg.id} → ${formatTimecode(value)} (Ctrl+Z để hoàn tác)`);
      }
      // Dọn transform/style tạm NGAY SAU khi React commit vị trí mới (useLayoutEffect bên dưới) → không nháy hình
      const cleanup = () => {
        for (const it of els) {
          it.el.classList.remove("is-dragging");
          it.el.style.transform = "";
          if (mode !== "move" && it.sub) {
            const s = segmentsRef.current.find((x) => x.id === it.id);
            if (s) {
              it.el.style.left = `${(s.start / dur) * tw}px`;
              it.el.style.width = `${Math.max(3, ((s.end - s.start) / dur) * tw)}px`;
            }
          }
        }
      };
      dragCleanupRef.current = cleanup;
      window.setTimeout(() => {
        const f = dragCleanupRef.current;
        if (f) {
          dragCleanupRef.current = null;
          f();
        }
      }, 400);
    };

    function onMove(ev: MouseEvent) {
      if (finished) return;
      if (ev.buttons === 0) {
        finish(true); // nhả chuột ngoài cửa sổ
        return;
      }
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
      lastAlt = ev.altKey;
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD_PX) return;
        begin();
      }
      apply();
    }
    function onUp(ev: MouseEvent) {
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
      lastAlt = ev.altKey;
      if (started) apply();
      finish(true);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        finish(false);
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey, true);
    dragAbortRef.current = () => finish(false);
  };

  // Premiere-style Timeline Vertical Resizer (Kéo mở rộng chiều cao)
  const handleTimelineResizeStart = (e: React.MouseEvent) => {
    // [TSK-TABS-P1] Chỉ instance ĐANG HOẠT ĐỘNG mới kéo/thu cột.
    if (!isActive) return;
    e.preventDefault();
    setIsResizingTimeline(true);
    const startY = e.clientY;
    const startH = timelineHeightRef.current;

    const handleWindowMouseMove = (ev: MouseEvent) => {
      const deltaY = startY - ev.clientY;
      const minH = 180;
      const maxH = Math.max(300, Math.round(window.innerHeight * 0.8));
      const nextH = Math.max(minH, Math.min(maxH, startH + deltaY));
      setTimelineHeight(nextH);
    };

    const handleWindowMouseUp = () => {
      setIsResizingTimeline(false);
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      try {
        localStorage.setItem("sublix_studio_timeline_height", String(timelineHeightRef.current));
      } catch {
        // ignore
      }
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
  };

  // Premiere / NLE-style Wheel Controls:
  // Alt+Wheel hoặc Ctrl+Wheel: Zoom In / Out timeline
  // Shift+Wheel: Cuộn ngang tracks body
  const handleTimelineWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.altKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoomLevel((z) => Math.min(10000, Math.round(z * 1.25)));
      } else if (e.deltaY > 0) {
        setZoomLevel((z) => Math.max(100, Math.round(z / 1.25)));
      }
    } else if (e.shiftKey) {
      if (timelineTracksBodyRef.current) {
        e.preventDefault();
        timelineTracksBodyRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  // ROUND-8: In-Out Range Helpers
  const handleSetInPoint = (time?: number) => {
    const val = Number((time !== undefined ? time : currentTimeRef.current).toFixed(2));
    setInPoint(val);
    if (outPointRef.current !== null && val >= outPointRef.current) {
      setOutPoint(Math.min(mediaDurationRef.current, val + 5));
    }
    setUseRangeOnly(true);
    showToast(`🎯 Đã đặt điểm Vào (In): ${formatTimecode(val)}`);
  };

  const handleSetOutPoint = (time?: number) => {
    const val = Number((time !== undefined ? time : currentTimeRef.current).toFixed(2));
    setOutPoint(val);
    if (inPointRef.current !== null && val <= inPointRef.current) {
      setInPoint(Math.max(0, val - 5));
    }
    setUseRangeOnly(true);
    showToast(`🎯 Đã đặt điểm Ra (Out): ${formatTimecode(val)}`);
  };

  const handleClearRange = () => {
    setInPoint(null);
    setOutPoint(null);
    setUseRangeOnly(false);
    showToast("Đã xoá vùng chọn Timeline");
  };

  // ROUND-25: Xử lý sự kiện click chuột phải trên Timeline (Hiện Context Menu)
  const handleTimelineContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!filePath) return;

    const container = timelineTracksBodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft || 0;
    const relativeX = e.clientX - rect.left + scrollLeft;
    const dur = Math.max(1, mediaDurationRef.current);
    const tw = timelineWidthRef.current || 1200;
    const clickTime = Math.max(0, Math.min(dur, (relativeX / tw) * dur));

    const curIn = inPointRef.current;
    const curOut = outPointRef.current;
    const bounds = getRangeBounds();
    const hasRange = bounds !== null;

    // [TSK-STUDIO-GLOSSARY] Câu nằm dưới con trỏ → menu "Dịch lại câu này".
    const hitSeg =
      segmentsRef.current.find((s) => clickTime >= s.start && clickTime < s.end) ?? null;

    setTimelineContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      time: clickTime,
      hasRange,
      inPoint: curIn,
      outPoint: curOut,
      segCount: bounds ? segmentsRef.current.filter((s) => isSegInRange(s, bounds.start, bounds.end)).length : 0,
      segId: hitSeg?.id ?? null,
    });
  };

  // Vùng In/Out hợp lệ (đã sắp xếp) — null nếu chưa khoanh hoặc vùng ngắn hơn 0.2s (In ≈ Out).
  const getRangeBounds = (): { start: number; end: number } | null => {
    const a = inPointRef.current;
    const b = outPointRef.current;
    if (a === null || b === null) return null;
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    return end - start >= 0.2 ? { start, end } : null;
  };

  // 4 lệnh AI của menu chuột phải trên vùng In/Out. Mọi lệnh chỉ chạm các câu thuộc vùng
  // (câu ngoài vùng giữ nguyên id, bản dịch, tiếng lồng). Có chặn chạy chồng + báo trước số câu bị ảnh hưởng.
  const runRangeAction = (kind: "stt" | "translate" | "voice" | "full") => {
    setTimelineContextMenu(null);
    if (isAnalyzing) {
      showToast("⏳ Đang có tác vụ AI chạy — hãy chờ xong (hoặc bấm Dừng) rồi khoanh vùng chạy tiếp");
      return;
    }
    const bounds = getRangeBounds();
    if (!bounds) {
      showToast("⚠ Vùng In/Out quá ngắn — hãy khoanh lại vùng (phím I / O hoặc giữ Shift + kéo trên thước)");
      return;
    }
    const inRange = segmentsRef.current.filter((s) => isSegInRange(s, bounds.start, bounds.end)).length;
    if ((kind === "translate" || kind === "voice") && inRange === 0) {
      showToast("ℹ️ Chưa có câu thoại nào trong vùng chọn — hãy chạy 'Bóc tách phụ đề vùng' trước");
      return;
    }
    setUseRangeOnly(true);
    if (kind === "stt") void handleRunSttOnly(true);
    else if (kind === "translate") void handleRunTranslateOnly(undefined, true);
    else if (kind === "voice") void handleRunVoiceOnly(true);
    else void handleRunAnalysis(true, true, true);
  };

  /**
   * [TSK-STUDIO-GLOSSARY] "Dịch lại câu này" — dịch lại **1 câu** (thường là câu đang
   * vi phạm bảng thuật ngữ / xưng hô đã duyệt).
   *
   * - Bật "Dịch theo ngữ cảnh" → gọi `translate_script_contextual` (backend áp bảng
   *   của project ⇒ câu này sẽ bám bảng đã duyệt).
   * - Tắt → gọi `translate_batch` cho đúng 1 câu.
   * - Ghi đè bản dịch của câu đó; các câu khác giữ nguyên.
   */
  const handleRetranslateSegment = async (segId: number) => {
    const seg = segmentsRef.current.find((s) => s.id === segId);
    if (!seg) {
      showToast("⚠️ Không tìm thấy câu cần dịch lại.");
      return;
    }
    if (isAnalyzing) {
      showToast("⏳ Đang có tác vụ AI chạy — hãy chờ xong (hoặc bấm Dừng) rồi thử lại");
      return;
    }
    setIsAnalyzing(true);
    setTimelineProcessType("translate");
    setTimelineProgress(10);
    setAnalyzeProgress(10);
    const msg = `Đang dịch lại 1 câu (${formatTimecode(seg.start)})...`;
    setTimelineProcessMessage(msg);
    setAnalyzeMessage(msg);
    try {
      saveTranslationUndo();
      const srcLang = sttLang === "auto" ? "auto" : sttLang;
      let translated = "";
      let violation = false;
      let reason: string | null = null;
      // [TSK-TABS-3.5] Chụp video TRƯỚC await → bỏ kết quả nếu đã đổi video.
      const startedPath = filePath;
      if (contextualTranslate) {
        const speakerNames = new Map(speakersRef.current.map((spk) => [spk.id, spk.name]));
        const lines: ScriptLine[] = [
          {
            id: String(seg.id),
            speakerId: seg.speakerId,
            speakerName: speakerNames.get(seg.speakerId),
            text: seg.original,
            start: seg.start,
            end: seg.end,
          },
        ];
        const results = await sublix.translateScriptContextual(
          lines,
          srcLang,
          targetLang,
          filePath?.trim() || undefined,
          makeTaskRunId("retranslate", Date.now()), // có run_id ⇒ tab khác không lẫn phase
        );
        const hit = results[0];
        if (!hit || hit.failed || !hit.translated) {
          throw new Error("dịch thất bại");
        }
        translated = hit.translated;
        violation = hit.glossaryViolation === true;
        reason = hit.glossaryViolationReason ?? null;
      } else {
        const results = await sublix.translateBatch([seg.original], srcLang, targetLang);
        translated = (results[0] ?? "").trim();
        if (!translated) throw new Error("dịch thất bại");
      }
      // Video đã đổi trong lúc dịch ⇒ bỏ kết quả (không ghi vào câu nào).
      if (!guardProject(startedPath)) return;
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segId
            ? {
                ...s,
                translated,
                translateFailed: false,
                glossaryViolation: violation,
                glossaryViolationReason: reason,
              }
            : s,
        ),
      );
      setTimelineProgress(100);
      setAnalyzeProgress(100);
      showToast(
        violation
          ? `🔁 Đã dịch lại câu — vẫn vi phạm bảng thuật ngữ (${reason ?? "không rõ lý do"})`
          : "🔁 Đã dịch lại câu này.",
      );
    } catch (err) {
      console.warn("Dịch lại 1 câu thất bại:", err);
      showToast("⚠️ Dịch lại câu này thất bại — bản dịch cũ giữ nguyên.");
    } finally {
      setIsAnalyzing(false);
      setTimelineProgress(100);
      setAnalyzeProgress(100);
    }
  };

  // Dragging Range Handles on Ruler
  const startDraggingRangeHandle = (e: React.MouseEvent | React.PointerEvent, handle: "in" | "out") => {
    // [TSK-TABS-P1] Chỉ instance ĐANG HOẠT ĐỘNG mới kéo điểm In/Out.
    if (!isActive) return;
    e.preventDefault();
    e.stopPropagation();

    const handleWindowMove = (moveEvent: MouseEvent | PointerEvent) => {
      const container = timelineTracksBodyRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft || 0;
      const relativeX = moveEvent.clientX - rect.left + scrollLeft;
      const dur = Math.max(1, mediaDurationRef.current);
      const tw = timelineWidthRef.current || 1200;
      const newTime = Math.max(0, Math.min(dur, (relativeX / tw) * dur));

      if (handle === "in") {
        setInPoint(Number(newTime.toFixed(2)));
      } else {
        setOutPoint(Number(newTime.toFixed(2)));
      }
    };

    const handleWindowUp = () => {
      window.removeEventListener("pointermove", handleWindowMove);
      window.removeEventListener("pointerup", handleWindowUp);
      window.removeEventListener("mousemove", handleWindowMove);
      window.removeEventListener("mouseup", handleWindowUp);
    };

    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowUp);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // [TSK-TIMELINE-INTEGRATE-MODULES] Handler timeline: timecode, copy/paste,
  // marker, J/K/L, khoá track, auto-follow.
  // Tất cả được gom vào `timelineShortcutsRef` để `handleKeyDown` (useEffect deps
  // = [isActive]) KHÔNG bị stale closure mà không phải đăng ký lại listener.
  // ══════════════════════════════════════════════════════════════════════════

  /** FPS dùng cho nhích 1 frame (chưa biết fps của video → 25 như mặc định). */
  const TIMELINE_FPS = 25;

  /** Đọc mốc thời gian hiện tại — hàm ỔN ĐỊNH (đọc ref) cho TimecodeInput. */
  const getCurrentSeconds = useCallback(() => currentTimeRef.current, []);

  /** Seek từ ô nhập timecode — clamp về [0, duration] rồi nhảy. */
  const timecodeSeekRef = useRef<(sec: number) => void>(() => {});
  timecodeSeekRef.current = (sec: number) => {
    handleSeek(clampSeconds(sec, mediaDurationRef.current || mediaDuration));
  };
  const handleTimecodeSeek = useCallback((sec: number) => {
    timecodeSeekRef.current(sec);
  }, []);

  // ── Copy / Paste (Premiere: Ctrl+C / Ctrl+V) ─────────────────────────────
  const handleCopySelected = () => {
    const ids = new Set(selectedSegIdsRef.current);
    const sel = segmentsRef.current.filter((s) => ids.has(s.id));
    if (sel.length === 0) {
      showToast("⚠️ Chưa chọn câu nào để copy");
      return;
    }
    clipboardRef.current = copyToClipboard(sel);
    showToast(`📋 Đã copy ${sel.length} câu thoại`);
  };

  const handlePasteSegments = () => {
    const payload = clipboardRef.current;
    if (payload.segments.length === 0) {
      showToast("⚠️ Clipboard trống — hãy copy câu thoại trước (Ctrl+C)");
      return;
    }
    // Track đang khoá → chặn dán (không tự xoá câu nào).
    const speakerKeys = Array.from(new Set(payload.segments.map((s) => s.speakerId))).map((id) =>
      speakerTrackKey(id),
    );
    const affected: TrackKey[] = ["subtitles", ...speakerKeys];
    const blocked = blockedTracks(trackLocksRef.current, affected, "paste");
    if (blocked.length > 0) {
      showToast(editBlockedReason(blocked[0], "paste"));
      return;
    }
    const res = pasteFromClipboard(payload, segmentsRef.current, currentTimeRef.current);
    if (res.segments.length === 0) {
      showToast("⚠️ Không có câu nào hợp lệ để dán");
      return;
    }
    saveUndoHistory();
    setSegments((prev) => [...prev, ...res.segments]);
    const conflictNote =
      res.conflicts.length > 0
        ? ` — ⚠️ ${res.conflicts.length} câu trùng với câu đã có (KHÔNG tự xoá)`
        : "";
    showToast(
      `📥 Đã dán ${res.segments.length} câu tại ${formatTimecode(currentTimeRef.current)}${conflictNote}`,
    );
  };

  // ── Marker (M = bật/tắt, Shift+M = kế tiếp, Ctrl+Shift+M = trước) ───────
  const handleToggleMarker = () => {
    const t = currentTimeRef.current;
    const prev = markersRef.current;
    const next = toggleMarker(prev, t);
    setMarkers(next);
    showToast(
      next.length > prev.length
        ? `🔖 Đã ghim marker tại ${formatTimecode(t)}`
        : `🔖 Đã bỏ marker tại ${formatTimecode(t)}`,
    );
  };

  const handleNextMarker = () => {
    const m = findNextMarker(markersRef.current, currentTimeRef.current);
    if (m === null) {
      showToast("⚠️ Không có marker nào phía sau");
      return;
    }
    handleSeek(m.time);
    showToast(`🔖 Nhảy tới marker ${formatTimecode(m.time)}`);
  };

  const handlePrevMarker = () => {
    const m = findPrevMarker(markersRef.current, currentTimeRef.current);
    if (m === null) {
      showToast("⚠️ Không có marker nào phía trước");
      return;
    }
    handleSeek(m.time);
    showToast(`🔖 Nhảy về marker ${formatTimecode(m.time)}`);
  };

  /** Callback ỔN ĐỊNH cho vạch marker (component memo) — logic thật nằm trong ref. */
  const markerClickRef = useRef<(time: number) => void>(() => {});
  markerClickRef.current = (time: number) => {
    handleSeek(time);
    showToast(`🔖 Nhảy tới marker ${formatTimecode(time)}`);
  };
  const stableMarkerClick = useCallback((time: number) => markerClickRef.current(time), []);

  // ── Shuttle J/K/L (Premiere) ─────────────────────────────────────────────
  const stopShuttleLoop = () => {
    if (shuttleRafRef.current !== null) {
      cancelAnimationFrame(shuttleRafRef.current);
      shuttleRafRef.current = null;
    }
  };

  /** Gán tốc độ cho video + audio lồng (1 nguồn: getEffectiveRate). */
  const applyShuttleRate = (rate: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
    const va = voicePlayRef.current;
    if (va) {
      va.defaultPlaybackRate = rate;
      va.playbackRate = rate;
    }
  };

  /**
   * Vòng lặp tua LÙI: thẻ <video> không phát ngược được nên ta tự seek theo nhịp.
   * - Kim playhead + timecode: ghi DOM trực tiếp (KHÔNG setState ở 60fps).
   * - Seek video: tối đa ~15 lần/giây (tránh nghẽn decoder).
   * - React state: throttle 120ms (đúng chuẩn file này).
   */
  const startShuttleReverseLoop = () => {
    if (shuttleRafRef.current !== null) return;
    let last = performance.now();
    const loop = () => {
      const st = shuttleRef.current;
      if (st.direction !== "reverse") {
        shuttleRafRef.current = null;
        return;
      }
      const now = performance.now();
      const dt = now - last;
      last = now;
      const target = computeShuttleSeek(st, shuttlePosRef.current, dt);
      if (target !== null) {
        shuttlePosRef.current = target;
        const dur = Math.max(1, mediaDurationRef.current);
        if (playheadElementRef.current) {
          playheadElementRef.current.style.left = `${(target / dur) * (timelineWidthRef.current || 1200)}px`;
        }
        if (timecodeElementRef.current) {
          timecodeElementRef.current.textContent = formatTimecode(target);
        }
        if (now - lastShuttleSeekRef.current > 66) {
          lastShuttleSeekRef.current = now;
          if (videoRef.current) {
            try {
              videoRef.current.currentTime = target;
            } catch (e) {
              console.warn("Shuttle seek error:", e);
            }
          }
        }
        if (now - lastTimeStateUpdateRef.current > 120) {
          lastTimeStateUpdateRef.current = now;
          setCurrentTime(target);
        }
      }
      shuttleRafRef.current = requestAnimationFrame(loop);
    };
    shuttleRafRef.current = requestAnimationFrame(loop);
  };

  const handleShuttleKey = (key: ShuttleKey) => {
    const next = applyShuttleKey(shuttleRef.current, key, { kHeld: kHeldRef.current });
    shuttleRef.current = next;

    if (next.action === "stop") {
      stopShuttleLoop();
      applyShuttleRate(playbackSpeedRef.current);
      shuttlePosRef.current = currentTimeRef.current;
      showToast("⏹ Đã dừng tua (K)");
      return;
    }

    if (next.action === "step-forward" || next.action === "step-back") {
      const step = frameStepSeconds(TIMELINE_FPS);
      const delta = next.action === "step-forward" ? step : -step;
      handleSeek(currentTimeRef.current + delta, true);
      showToast(`⏭ Nhích 1 frame ${next.action === "step-forward" ? "tiến" : "lùi"}`);
      return;
    }

    if (next.direction === "forward") {
      stopShuttleLoop();
      applyShuttleRate(shuttlePlaybackRate(next));
      if (videoRef.current && videoRef.current.paused) {
        handleTogglePlay();
        applyShuttleRate(shuttlePlaybackRate(next));
      }
      showToast(`⏩ Tua tiến ${next.rate}x`);
      return;
    }

    // Hướng "reverse": dừng video, tự seek ngược theo nhịp.
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch (e) {
        console.warn("Shuttle pause error:", e);
      }
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
    stopVoicePlayback();
    shuttlePosRef.current = currentTimeRef.current;
    startShuttleReverseLoop();
    showToast(`⏪ Tua lùi ${next.rate}x`);
  };

  // ── Auto-follow: người dùng cuộn tay → tạm ngưng 1.5s ──────────────────
  useEffect(() => {
    const el = timelineTracksBodyRef.current;
    if (!el) return;
    const onScroll = () => {
      const now = Date.now();
      // Bỏ qua lần cuộn do chính auto-follow tạo ra.
      if (now - autoScrollAtRef.current < 150) return;
      userScrollAtRef.current = now;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Gom handler cho phím tắt (tránh stale closure trong useEffect deps=[isActive]).
  const timelineShortcutsRef = useRef<{
    copy: () => void;
    paste: () => void;
    toggleMarker: () => void;
    nextMarker: () => void;
    prevMarker: () => void;
    shuttle: (key: ShuttleKey) => void;
  } | null>(null);
  timelineShortcutsRef.current = {
    copy: handleCopySelected,
    paste: handlePasteSegments,
    toggleMarker: handleToggleMarker,
    nextMarker: handleNextMarker,
    prevMarker: handlePrevMarker,
    shuttle: handleShuttleKey,
  };

  // Keyboard Shortcuts: Spacebar (Play/Pause), Left/Right (-1s/+1s), Home/End, I/O/X (In/Out/Clear Range)
  useEffect(() => {
    if (isActive === false) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      // Đang nhập liệu trong text box -> không can thiệp
      if (isInput) {
        return;
      }

      // [TSK-TIMELINE-INTEGRATE-MODULES] Copy/Paste (Premiere Ctrl+C / Ctrl+V).
      // Ctrl+C chỉ bắt khi đang có khối timeline được chọn (không cướp copy text của trang).
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
        if (selectedSegIdsRef.current.length > 0) {
          e.preventDefault();
          timelineShortcutsRef.current?.copy();
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        timelineShortcutsRef.current?.paste();
        return;
      }

      // [TSK-TIMELINE-INTEGRATE-MODULES] Shuttle J/K/L (Premiere).
      // K+J / K+L = nhích 1 frame (K đang được giữ → kHeldRef).
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === "j" || e.key === "J" || e.key === "k" || e.key === "K" || e.key === "l" || e.key === "L")
      ) {
        e.preventDefault();
        const shuttleKey = e.key.toLowerCase() as ShuttleKey;
        timelineShortcutsRef.current?.shuttle(shuttleKey);
        if (shuttleKey === "k") kHeldRef.current = true;
        return;
      }

      // [TSK-TIMELINE-INTEGRATE-MODULES] Marker: M = bật/tắt tại playhead,
      // Shift+M = marker kế tiếp, Ctrl+Shift+M = marker trước (chuẩn Premiere).
      if (!e.altKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) timelineShortcutsRef.current?.prevMarker();
        else if (e.shiftKey) timelineShortcutsRef.current?.nextMarker();
        else timelineShortcutsRef.current?.toggleMarker();
        return;
      }

      // Spacebar: Phát / Dừng video (Premiere standard)
      if (e.code === "Space") {
        e.preventDefault();
        if (target?.tagName === "BUTTON") {
          target.blur();
        }
        handleTogglePlay();
        return;
      }

      // [TSK-TIMELINE-REDO-RIPPLE] Shift+Delete = RIPPLE DELETE (xoá + dồn khoảng trống)
      if (e.key === "Delete" && e.shiftKey) {
        e.preventDefault();
        handleRippleDelete();
        return;
      }

      // Delete / Backspace: Xóa phân đoạn / item câu thoại đang chọn (multi-select → xóa TẤT CẢ khối đã chọn)
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedSegIdsRef.current.length > 1) {
          e.preventDefault();
          handleDeleteSegment();
          return;
        }
        if (selectedSegIdRef.current > 0) {
          e.preventDefault();
          handleDeleteSegment(selectedSegIdRef.current);
          return;
        }
      }

      // S / C: Cắt / Tách phân đoạn tại playhead (Razor tool)
      if (!e.ctrlKey && !e.metaKey && (e.key === "s" || e.key === "S" || e.key === "c" || e.key === "C")) {
        if (selectedSegIdRef.current > 0) {
          e.preventDefault();
          handleSplitSegment(selectedSegIdRef.current);
          return;
        }
      }

      // ROUND-12: V / T / R (NLE Mode Switch: Chọn / Tua / Khoanh vùng)
      if (!e.ctrlKey && !e.metaKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        setTimelineToolMode("select");
        showToast("🖐️ Chế độ Chọn: Quét chọn & sửa câu thoại (Phím V)");
        return;
      }
      if (!e.ctrlKey && !e.metaKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        setTimelineToolMode("scrub");
        showToast("⏱️ Chế độ Tua: Di chuột & tua video mọi vị trí (Phím T)");
        return;
      }
      if (!e.ctrlKey && !e.metaKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        setTimelineToolMode("range");
        showToast("🎯 Chế độ Khoanh vùng In/Out (Phím R)");
        return;
      }

      // [TSK-TIMELINE-REDO-RIPPLE] Redo: Ctrl+Shift+Z hoặc Ctrl+Y (kiểm TRƯỚC Ctrl+Z)
      if (
        (e.ctrlKey || e.metaKey) &&
        ((e.shiftKey && (e.key === "z" || e.key === "Z")) || e.key === "y" || e.key === "Y")
      ) {
        e.preventDefault();
        handleRedoSubtitles();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        handlePickMediaFile();
      } else if (!e.ctrlKey && !e.metaKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        handleSetInPoint();
      } else if (!e.ctrlKey && !e.metaKey && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        handleSetOutPoint();
      } else if (!e.ctrlKey && !e.metaKey && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        handleClearRange();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleSeek(currentTimeRef.current - (e.shiftKey ? 5 : 1));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSeek(currentTimeRef.current + (e.shiftKey ? 5 : 1));
      } else if (e.code === "Home") {
        e.preventDefault();
        handleSeek(0);
      } else if (e.code === "End") {
        e.preventDefault();
        handleSeek(mediaDurationRef.current);
      } else if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd" ||
                 ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "="))) {
        // v0.11.4: Zoom in (chuẩn Premiere). Tránh trùng với Ctrl+= (zoom browser).
        if (!(e.ctrlKey || e.metaKey) || e.key === "+" || e.key === "=") {
          e.preventDefault();
          setZoomLevel((z) => Math.min(10000, Math.round(z * 1.5)));
        }
      } else if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract" ||
                 ((e.ctrlKey || e.metaKey) && e.key === "-")) {
        e.preventDefault();
        setZoomLevel((z) => Math.max(100, Math.round(z / 1.5)));
      } else if (e.key === "\\" || ((e.ctrlKey || e.metaKey) && e.key === "0")) {
        // v0.11.4: Fit timeline to viewport (100%) — chuẩn Premiere "\"
        e.preventDefault();
        setZoomLevel(100);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    // [TSK-TIMELINE-INTEGRATE-MODULES] Nhả cờ "đang giữ K" khi thả phím
    // (K+J / K+L = nhích 1 frame kiểu Premiere).
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "k" || e.key === "K") kHeldRef.current = false;
    };
    window.addEventListener("keyup", handleKeyUp);
    // Mất focus giữa chừng (Alt+Tab) có thể nuốt keyup → nhả cờ "đang giữ K"
    // để trạng thái không bị kẹt (K+J/K+L = nhích 1 frame).
    const handleWindowBlur = () => {
      kHeldRef.current = false;
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isActive]);

  // v0.11.3: Zoom = % viewport. 100% = full video fit viewport ~1200px.
  // [UI_R2-8_REVIEW mục 11] Viewport cứng 1200 px ⇒ timeline chỉ rộng tới ~1410 px,
  // bỏ trống ~500 px bên phải. Nay đo BỀ RỘNG KHUNG THẬT (ResizeObserver) ⇒ timeline
  // trải hết chiều ngang của khung (zoom 100 % = vừa khung).
  const TIMELINE_VIEWPORT_WIDTH = 1200;
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(TIMELINE_VIEWPORT_WIDTH);
  useEffect(() => {
    const el = timelineTracksBodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setTimelineViewportWidth((prev) => (prev === w ? prev : w));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isActive]);
  const viewportWidth = Math.max(360, timelineViewportWidth);
  const pxPerSec = (viewportWidth * (zoomLevel / 100)) / Math.max(1, mediaDuration);
  const timelineWidth = Math.max(viewportWidth, Math.round(mediaDuration * pxPerSec));

  // v0.11.3: chọn tick interval đẹp (~100px giữa 2 tick) theo zoom hiện tại.
  // Trả về số giây giữa 2 mốc (1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200).
  const chooseTickInterval = (pps: number): number => {
    const targetPx = 100;
    const rawSec = targetPx / Math.max(0.001, pps);
    const steps = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200];
    return steps.find((s) => s >= rawSec) ?? 3600;
  };
  const tickIntervalSec = chooseTickInterval(pxPerSec);
  const timelineWidthRef = useRef<number>(timelineWidth);
  timelineWidthRef.current = timelineWidth;

  // Playhead scrubbing pointer handlers (kéo thả để tua video qua timeline siêu mượt)
  const isDraggingPlayheadRef = useRef<boolean>(false);
  isDraggingPlayheadRef.current = isDraggingPlayhead;
  const lastScrubVideoSeekRef = useRef<number>(0);
  const lastScrubStateUpdateRef = useRef<number>(0);
  const lastScrubbedTimeRef = useRef<number>(0);

  const updatePlayheadFromClientX = (clientX: number, isFinal: boolean = false) => {
    const container = timelineTracksBodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft || 0;
    const relativeX = clientX - rect.left + scrollLeft;
    const dur = Math.max(1, mediaDurationRef.current || mediaDuration);
    const tw = timelineWidthRef.current || 1200;
    const newTime = Math.max(0, Math.min(dur, (relativeX / tw) * dur));
    lastScrubbedTimeRef.current = newTime;

    // 1. Tối ưu hóa cấp phần cứng: Cập nhật trực tiếp Playhead & Timecode trên DOM (60fps mượt như nhung)
    if (playheadElementRef.current && dur > 0) {
      const leftPx = (newTime / dur) * tw;
      playheadElementRef.current.style.left = `${leftPx}px`;
    }
    if (timecodeElementRef.current) {
      timecodeElementRef.current.textContent = formatTimecode(newTime);
    }

    if (isFinal) {
      handleSeek(newTime);
      return;
    }

    const now = performance.now();
    // 2. Throttle video element seek xuống mỗi 45ms (~22fps cho media decoder) để không làm nghẽn pipeline
    if (now - lastScrubVideoSeekRef.current > 45) {
      lastScrubVideoSeekRef.current = now;
      if (videoRef.current) {
        try {
          videoRef.current.currentTime = newTime;
        } catch {}
      }
    }

    // 3. Throttle React state re-render xuống mỗi 120ms (~8fps) trong khi kéo
    if (now - lastScrubStateUpdateRef.current > 120) {
      lastScrubStateUpdateRef.current = now;
      setCurrentTime(newTime);
    }
  };

  const startScrubbing = (clientX: number) => {
    // [TSK-TABS-P1] Chỉ instance ĐANG HOẠT ĐỘNG mới tua timeline.
    if (!isActive) return;
    setIsDraggingPlayhead(true);
    isDraggingPlayheadRef.current = true;
    updatePlayheadFromClientX(clientX, false);

    const handleWindowMove = (moveEvent: MouseEvent | PointerEvent) => {
      if (!isDraggingPlayheadRef.current) return;
      updatePlayheadFromClientX(moveEvent.clientX, false);
    };

    const handleWindowUp = (upEvent: MouseEvent | PointerEvent) => {
      setIsDraggingPlayhead(false);
      isDraggingPlayheadRef.current = false;
      window.removeEventListener("pointermove", handleWindowMove);
      window.removeEventListener("pointerup", handleWindowUp);
      window.removeEventListener("mousemove", handleWindowMove);
      window.removeEventListener("mouseup", handleWindowUp);
      scrubbingCleanupRef.current = null;
      updatePlayheadFromClientX(upEvent.clientX, true);
    };

    scrubbingCleanupRef.current = () => {
      setIsDraggingPlayhead(false);
      isDraggingPlayheadRef.current = false;
      window.removeEventListener("pointermove", handleWindowMove);
      window.removeEventListener("pointerup", handleWindowUp);
      window.removeEventListener("mousemove", handleWindowMove);
      window.removeEventListener("mouseup", handleWindowUp);
    };

    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowUp);
  };

  // R3-09: Component unmount cleanup to prevent window listener leaks
  useEffect(() => {
    return () => {
      if (scrubbingCleanupRef.current) {
        scrubbingCleanupRef.current();
      }
    };
  }, []);

  const handlePlayheadMouseDown = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startScrubbing(e.clientX);
  };

  const handleRulerMouseDown = (e: React.MouseEvent | React.PointerEvent) => {
    // [TSK-TABS-P1] Chỉ instance ĐANG HOẠT ĐỘNG mới kéo trên thước thời gian.
    if (!isActive) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey || timelineToolModeRef.current === "range") {
      const container = timelineTracksBodyRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft || 0;
      const relativeX = e.clientX - rect.left + scrollLeft;
      const dur = Math.max(1, mediaDurationRef.current);
      const tw = timelineWidthRef.current || 1200;
      const startTime = Number(Math.max(0, Math.min(dur, (relativeX / tw) * dur)).toFixed(2));
      setInPoint(startTime);
      setOutPoint(startTime);
      setUseRangeOnly(true);
      let lastOutTime = startTime;

      const handleMove = (ev: MouseEvent | PointerEvent) => {
        const curRel = ev.clientX - rect.left + container.scrollLeft;
        const curTime = Number(Math.max(0, Math.min(dur, (curRel / tw) * dur)).toFixed(2));
        lastOutTime = curTime;
        setOutPoint(curTime);
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        // Chỉ click (không kéo) → vùng độ dài 0 vô nghĩa: bỏ luôn để không kẹt trạng thái "đã có vùng" nhưng 0 câu
        if (Math.abs(lastOutTime - startTime) < 0.2) {
          setInPoint(null);
          setOutPoint(null);
          setUseRangeOnly(false);
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
      return;
    }

    startScrubbing(e.clientX);
  };

  // Pick media file
  const handlePickMediaFile = async () => {
    const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
    if (isTauri) {
      try {
        const picked = await sublix.dubbingPickMediaFile();
        if (picked) {
          lastLoadedInitialPathRef.current = picked;
          onClearPendingFile?.();
          handleLoadNewVideoFile(picked);
          showToast(`Đã mở video: ${picked.split(/[\\/]/).pop()}`);
        }
      } catch (err) {
        console.error("Pick file error:", err);
      }
    } else {
      const input = document.getElementById("studio-hidden-file-input") as HTMLInputElement;
      if (input) {
        input.click();
      }
    }
  };

  // =========================================================================
  // ROUND-13: CÔNG ĐOẠN TẬP TRUNG — XỬ LÝ THEO 2 KHỐI CỐT LÕI (PHỤ ĐỀ & LỒNG TIẾNG)
  // =========================================================================
  const handleRunCustomWorkflow = async () => {
    if (!filePath) {
      showToast("⚠️ Vui lòng mở hoặc kéo thả video trước khi xử lý");
      return;
    }
    if (!workflowOptStt && !workflowOptVoice) {
      showToast("⚠️ Vui lòng bật ít nhất 1 tính năng (Phụ Đề hoặc Lồng Tiếng) để xử lý.");
      return;
    }

    // Trường hợp 1: Bật cả Phụ Đề & Lồng Tiếng ➔ Chạy Toàn Trình (Pipeline)
    if (workflowOptStt && workflowOptVoice) {
      await handleRunAnalysis(undefined, true);
      return;
    }

    // Trường hợp 2: Chỉ làm Phụ Đề (STT + Dịch nếu bật dịch)
    if (workflowOptStt && !workflowOptVoice) {
      // BUG: nút "⚡ Chạy Tự Động Toàn Trình (A ➔ Z)" bị bám theo pill "Chế độ"
      // (chỉ đọc, không có switch) → bấm A→Z ở chế độ "Chỉ làm Phụ đề" thì dừng
      // sau bước dịch, KHÔNG chạy TTS → user phải bấm tay "🎙️ Bước 2" mới có
      // tiếng. A→Z là nút "toàn trình" → luôn chạy trọn pipeline
      // (phụ đề + phân vai + dịch + lồng tiếng). Switch "Dịch phụ đề" vẫn được
      // tôn trọng (xem handleRunAnalysis).
      showToast(
        "⚡ A ➔ Z: chạy toàn trình (phụ đề + phân vai + dịch + lồng tiếng) — không phụ thuộc chế độ chỉ-phụ-đề.",
      );
      await handleRunAnalysis(undefined, true);
      return;
    }

    // Trường hợp 3: Chỉ làm Lồng Tiếng (TTS cho các câu thoại hiện có)
    if (!workflowOptStt && workflowOptVoice) {
      if (segments.length === 0) {
        showToast("⚠️ Dự án chưa có câu thoại nào! Vui lòng bật tính năng Phụ Đề trước.");
        return;
      }
      showToast("🎙️ Bắt đầu tổng hợp giọng đọc lồng tiếng TTS...");
      await handleRunVoiceOnly();
      return;
    }
  };

  // =========================================================================
  // ROUND-8 & ROUND-14: CÔNG ĐOẠN 1 — CHỈ TRÍCH XUẤT PHỤ ĐỀ (STT ONLY / SUB GỐC)
  // =========================================================================
  const runSttOnlyImpl = async (forceRange?: boolean): Promise<SubtitleItem[] | null> => {
    if (!filePath) {
      showToast("⚠ Vui lòng mở hoặc kéo thả video trước khi phân tích");
      return null;
    }
    // [TSK-TABS-P2] Id lượt chạy của slot đang giữ — lọc sự kiện + gửi xuống backend.
    const runId = slotRunIdRef.current ?? undefined;
    setIsAnalyzing(true);
    setTimelineProcessType("stt");
    setTimelineProgress(10);
    setAnalyzeProgress(10);
    const startMsg = "Đang trích xuất câu thoại gốc (Whisper STT)...";
    setAnalyzeMessage(startMsg);
    setTimelineProcessMessage(startMsg);

    const isTranslating = workflowOptTranslate;
    notifyTaskUpdate({
      status: "running",
      type: "file_sub",
      workflowType: isTranslating ? "subtitle_translate" : "subtitle_only",
      workflowLabel: isTranslating ? "Phụ Đề & Dịch Thuật AI" : "Trích Xuất Phụ Đề Gốc",
      title: isTranslating ? `Phụ Đề & Dịch Thuật · ${fileName || "Video"}` : `Phụ Đề AI · ${fileName || "Video"}`,
      stage: startMsg,
      percent: 10,
      steps: isTranslating
        ? [
            { id: "stt", label: "Whisper STT", status: "running" },
            { id: "trans", label: "Dịch AI (LLM)", status: "pending" },
            { id: "done", label: "Xuất Phụ Đề", status: "pending" },
          ]
        : [
            { id: "audio", label: "Tách âm thanh", status: "done" },
            { id: "stt", label: "Whisper STT", status: "running" },
            { id: "timeline", label: "Đồng bộ Timeline", status: "pending" },
          ],
    });

    // Vùng In/Out được mở rộng ra mép câu bị cắt ngang → bóc tách lại KHÔNG làm mất nửa câu (xem expandRangeToSegmentEdges)
    const rawRange =
      (forceRange || useRangeOnly) && inPoint !== null && outPoint !== null
        ? { start: Math.min(inPoint, outPoint), end: Math.max(inPoint, outPoint) }
        : null;
    const range = rawRange ? expandRangeToSegmentEdges(segmentsRef.current, rawRange.start, rawRange.end) : null;
    const isRange = range !== null;
    const startSec = range ? range.start : 0;
    const endSec = range ? Math.min(range.end, mediaDuration > 0 ? mediaDuration : range.end) : mediaDuration;
    const durLimit = isRange ? Math.abs(endSec - startSec) : undefined;
    const startOffset = isRange && startSec > 0 ? startSec : undefined;
    if (rawRange && range && (range.start < rawRange.start - 0.01 || range.end > rawRange.end + 0.01)) {
      showToast(`ℹ️ Vùng được nới ra ${formatTimecode(range.start)} ➔ ${formatTimecode(range.end)} để không cắt ngang câu ở mép`);
    }

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen<DubbingProgress>("dubbing:progress", (event) => {
        if (isForeignRun(event.payload.run_id, runId)) return;
        let pct = event.payload.percent;
        let msg = event.payload.message;

        // Masking các thông điệp liên quan đến Sherpa / Diarizing / Phân vai / Biên kịch khi người dùng CHỈ làm phụ đề
        if (
          msg.includes("Sherpa") ||
          msg.includes("phân tích âm sắc") ||
          msg.includes("diariz") ||
          event.payload.stage === "diarizing"
        ) {
          msg = "🎙️ Đang tối ưu câu thoại & căn chỉnh mốc thời gian phụ đề...";
          pct = Math.min(85, Math.max(45, pct));
        } else if (
          msg.includes("Biên kịch") ||
          msg.includes("kịch bản") ||
          event.payload.stage === "scripting"
        ) {
          msg = "📝 Đang chuẩn hóa cấu trúc câu phụ đề...";
          pct = Math.min(92, Math.max(70, pct));
        }

        setAnalyzeProgress(pct);
        setTimelineProgress(pct);
        setAnalyzeMessage(msg);
        setTimelineProcessMessage(msg);

        notifyTaskUpdate({
          status: "running",
          stage: msg,
          percent: isTranslating ? Math.min(60, Math.round(pct * 0.6)) : pct,
          steps: isTranslating
            ? [
                { id: "stt", label: "Whisper STT", status: pct >= 95 ? "done" : "running" },
                { id: "trans", label: "Dịch AI (LLM)", status: "pending" },
                { id: "done", label: "Xuất Phụ Đề", status: "pending" },
              ]
            : [
                { id: "audio", label: "Tách âm thanh", status: "done" },
                { id: "stt", label: "Whisper STT", status: pct >= 95 ? "done" : "running" },
                { id: "timeline", label: "Đồng bộ Timeline", status: pct >= 95 ? "running" : "pending" },
              ],
        });
      });

      // ── [TSK-STUDIO-WIRE-CTX-STT] Engine STT khác Whisper ────────────────────
      // Nếu người dùng chọn SenseVoice/Paraformer/Parakeet (đã tải model) thì chạy
      // engine đó qua `stt_transcribe` (sidecar tự trích audio 16 kHz mono bằng ffmpeg),
      // thay vì đường Whisper mặc định của `dubbing_analyze`.
      const customStt = sttEngines.find((engine) => engine.id === sttSelectedEngineId);
      const useCustomStt =
        !!customStt && !customStt.id.startsWith("whisper") && customStt.downloaded;

      let project: DubbingProject;
      // [TSK-TABS-3.5] Chụp video TRƯỚC await → sau await mà đổi video thì bỏ
      // toàn bộ kết quả (không setState, không ghi project).
      const startedPath = filePath;
      if (useCustomStt && customStt) {
        const sttMsg = `Đang nhận dạng bằng ${customStt.label}...`;
        setTimelineProcessMessage(sttMsg);
        setAnalyzeMessage(sttMsg);
        const sttResult = await sublix.sttTranscribe(
          filePath,
          sttLang === "auto" ? undefined : sttLang,
          customStt.id,
        );
        let peaks: number[] = [];
        let thumbs: Array<{ time_sec: number; data_uri: string }> = [];
        try {
          const preview = await sublix.extractMediaPreview(filePath, sttResult.audio_duration_secs);
          peaks = preview?.peaks ?? [];
          thumbs = preview?.filmstrip_thumbs ?? [];
        } catch {
          /* không có preview thì bỏ trống waveform — không chặn luồng */
        }
        project = {
          input_path: filePath,
          media_duration_sec: sttResult.audio_duration_secs,
          speakers: [],
          segments: sttResult.segments.map((seg, index) => ({
            id: index + 1,
            speaker_id: "speaker_0",
            start_sec: seg.start,
            end_sec: seg.end,
            original_text: seg.text,
            dubbed_text: "",
            status: "pending",
          })),
          bgm_volume: 0.8,
          voice_volume: 1.0,
          transcript_source: `stt:${customStt.id}`,
          peaks,
          filmstrip_thumbs: thumbs,
        };
      } else {
        project = await sublix.dubbingAnalyze(
          filePath,
          sttLang === "auto" ? undefined : sttLang,
          undefined, // Chỉ bóc tách sub gốc, không dịch
          durLimit,
          startOffset,
          1, // Khi chỉ làm phụ đề: ép 1 speaker duy nhất, không phân mảnh vai diễn
          preferExistingSrt,
          runId,
        );
      }

      // Video đã đổi trong lúc chạy ⇒ bỏ kết quả (không ghi đè video mới).
      if (!guardProject(startedPath)) {
        setTimelineProcessMessage("");
        setAnalyzeMessage("");
        setAnalyzeProgress(0);
        return null;
      }

      if (project) {
        const vidDur = videoRef.current?.duration;
        const durToUse = (vidDur && !isNaN(vidDur) && vidDur > 0)
          ? vidDur
          : (project.media_duration_sec > 0 ? project.media_duration_sec : 0);
        if (durToUse > 0) {
          setMediaDuration(durToUse);
          mediaDurationRef.current = durToUse;
        }
        if (project.peaks && project.peaks.length > 0) {
          setAudioPeaks(project.peaks);
        }
        if (project.filmstrip_thumbs && project.filmstrip_thumbs.length > 0) {
          setFilmstripThumbs(project.filmstrip_thumbs);
        }

        // v0.11.32 (PO): backend dùng phụ đề có sẵn cạnh video (YouTube .srt)
        // thì báo rõ — chính xác hơn và không tốn thời gian chạy Whisper.
        setTranscriptSource(project.transcript_source ?? null);
        if (project.transcript_source?.startsWith("srt:")) {
          showToast(
            `📝 Đã dùng phụ đề có sẵn (.${project.transcript_source.split(":")[1]}.srt) — chuẩn hơn nhận dạng giọng nói, khỏi chờ Whisper`
          );
        }

        // Tạo vai thuyết minh chuẩn "Thuyết minh AI" cho toàn bộ timeline lồng tiếng.
        // Bóc tách theo VÙNG khi đã có roster → giữ roster cũ (không ghi đè giọng người dùng đã chọn), câu mới theo vai đầu tiên.
        const keepRoster = isRange && speakersRef.current.length > 0;
        const subSpeaker: SpeakerItem = {
          id: "speaker_0",
          name: "Thuyết minh AI",
          gender: "male",
          color: "#38bdf8",
          voice: defaultVoiceForEngine(selectedTtsEngine, "male") || "kokoro:tuan_ngoc",
          count: project.segments.length,
          sampleAudio: null,
        };
        if (!keepRoster) setSpeakers([subSpeaker]);
        const subSpkId = keepRoster ? speakersRef.current[0].id : "speaker_0";

        const newMappedSegs: SubtitleItem[] = project.segments.map((seg) => ({
          id: seg.id,
          start: seg.start_sec,
          end: seg.end_sec,
          speakerId: subSpkId, // Thống nhất 1 speaker khi chỉ làm phụ đề
          original: seg.original_text,
          translated: seg.original_text, // Giữ nguyên câu gốc để duyệt
          hasAudio: false, // ROUND-25 FIX: Khi chỉ làm phụ đề thì chưa có audio giọng đọc!
          source: (project.transcript_source?.startsWith("srt:") ? "youtube" : "whisper") as "youtube" | "whisper",
        }));

        saveUndoHistory();
        let finalSegs: SubtitleItem[] = newMappedSegs;
        let rangeToast = "";
        let newCount = newMappedSegs.length;
        if (isRange) {
          // Chỉ thay các câu thuộc vùng; câu ngoài vùng giữ NGUYÊN (id, bản dịch, tiếng lồng)
          const merged = mergeRangeSegments(segmentsRef.current, newMappedSegs, startSec, endSec);
          finalSegs = merged.segments;
          newCount = merged.newIds.size;
          setSegments(merged.segments);
          rangeToast = ` trong vùng ${formatTimecode(startSec)} ➔ ${formatTimecode(endSec)} (thay ${merged.replaced} câu cũ, giữ nguyên ${merged.segments.length - merged.newIds.size} câu ngoài vùng${merged.dropped > 0 ? `, bỏ ${merged.dropped} câu lẹm quá ngắn` : ""})`;
        } else {
          setSegments(newMappedSegs);
        }

        setAnalyzeProgress(100);
        setTimelineProgress(100);
        setAnalyzeMessage("Hoàn tất trích xuất phụ đề!");
        setTimelineProcessMessage("Hoàn tất trích xuất phụ đề!");
        showToast(`✅ Đã trích xuất ${newCount} câu phụ đề${rangeToast}!`);

        if (!isTranslating) {
          notifyTaskUpdate({
            status: "completed",
            type: "file_sub",
            workflowType: "subtitle_only",
            workflowLabel: "Trích Xuất Phụ Đề Gốc",
            title: `Phụ Đề AI · ${fileName || "Video"}`,
            stage: "Hoàn tất trích xuất phụ đề",
            detail: `Đã tạo ${newMappedSegs.length} câu phụ đề`,
            percent: 100,
            outputPath: filePath,
            steps: [
              { id: "audio", label: "Tách âm thanh", status: "done" },
              { id: "stt", label: "Whisper STT", status: "done" },
              { id: "timeline", label: "Đồng bộ Timeline", status: "done" },
            ],
          });
        }

        return finalSegs;
      }
      return null;
    } catch (err) {
      console.error("STT error:", err);
      showToast(`❌ Lỗi nhận dạng phụ đề: ${err}`);
      notifyTaskUpdate({
        status: "error",
        stage: "Lỗi nhận dạng phụ đề",
        error: String(err),
      });
      return null;
    } finally {
      if (unlisten) unlisten();
      setTimeout(() => {
        setIsAnalyzing(false);
        setTimelineProcessType(null);
      }, 500);
    }
  };

  // =========================================================================
  // ROUND-8 & ROUND-14: CÔNG ĐOẠN 2 — CHỈ DỊCH THUẬT (TRANSLATE ONLY / LLM)
  // =========================================================================
  const runTranslateOnlyImpl = async (inputSegs?: SubtitleItem[], forceRange?: boolean): Promise<void> => {
    // [TSK-TABS-P2] Id lượt chạy của slot — gửi xuống backend để `translate:progress` lọc đúng tab.
    const runId = slotRunIdRef.current ?? undefined;
    const activeSegs = inputSegs && inputSegs.length > 0 ? inputSegs : segments;
    if (activeSegs.length === 0) {
      showToast("⚠ Chưa có câu thoại nào để dịch! Hãy chạy 'Chỉ Làm Sub' trước.");
      return;
    }

    const isRange = (forceRange || useRangeOnly) && inPoint !== null && outPoint !== null;
    const startSec = isRange ? Math.min(inPoint, outPoint) : 0;
    const endSec = isRange ? Math.max(inPoint, outPoint) : mediaDuration;

    // Câu CHỒNG LẤN vùng đều được dịch (kể cả câu bị In/Out cắt ngang mép) — cùng quy tắc với TTS / Xóa trong vùng
    const targetSegs = isRange ? activeSegs.filter((s) => isSegInRange(s, startSec, endSec)) : activeSegs;

    if (targetSegs.length === 0) {
      showToast("⚠ Không có câu thoại nào trong vùng chọn để dịch!");
      return;
    }
    if (isRange) {
      showToast(`🌐 Dịch lại ${targetSegs.length} câu trong vùng ${formatTimecode(startSec)} ➔ ${formatTimecode(endSec)} (ghi đè bản dịch cũ của các câu này; ${activeSegs.length - targetSegs.length} câu ngoài vùng giữ nguyên)`);
    }

    setIsAnalyzing(true);
    setTimelineProcessType("translate");
    setTimelineProgress(5);
    setAnalyzeProgress(5);
    const initMsg = `Đang dịch ${targetSegs.length} câu thoại sang ${targetLang.toUpperCase()}...`;
    setTimelineProcessMessage(initMsg);
    setAnalyzeMessage(initMsg);

    notifyTaskUpdate({
      status: "running",
      type: "file_sub",
      workflowType: "subtitle_translate",
      workflowLabel: "Phụ Đề & Dịch Thuật AI",
      title: `Phụ Đề & Dịch Thuật · ${fileName || "Video"}`,
      stage: initMsg,
      percent: 50,
      steps: [
        { id: "stt", label: "Whisper STT", status: "done" },
        { id: "trans", label: "Dịch AI (LLM)", status: "running" },
        { id: "done", label: "Xuất Phụ Đề", status: "pending" },
      ],
    });

    try {
      await handleSaveProviderConfig();
      saveTranslationUndo();

      // [TSK-TABS-3.5] Chụp video TRƯỚC await → sau await mà đổi video thì bỏ kết quả.
      const startedPath = filePath;

      // ── [TSK-STUDIO-WIRE-CTX-STT] Đường dịch THEO NGỮ CẢNH ────────────────
      // 2 lượt: (1) đọc hiểu cả kịch bản, (2) dịch theo lô có ngữ cảnh trượt.
      // Chỉ chạy khi người dùng BẬT công tắc; lỗi → tự rơi về dịch theo lô (không crash).
      if (contextualTranslate && targetSegs.length > 0) {
        const speakerNames = new Map(speakersRef.current.map((spk) => [spk.id, spk.name]));
        const ctxLines: ScriptLine[] = targetSegs.map((seg) => ({
          id: String(seg.id),
          speakerId: seg.speakerId,
          speakerName: speakerNames.get(seg.speakerId),
          text: seg.original,
          start: seg.start,
          end: seg.end,
        }));
        try {
          const ctxMsg = "Đang dịch theo ngữ cảnh (đọc hiểu kịch bản trước)...";
          setTranslatePhase("🧠 Đọc hiểu kịch bản trước khi dịch…");
          setTimelineProcessMessage(ctxMsg);
          setAnalyzeMessage(ctxMsg);
          const ctxResults = await sublix.translateScriptContextual(
            ctxLines,
            sttLang === "auto" ? "auto" : sttLang,
            targetLang,
            // [TSK-STUDIO-GLOSSARY] Truyền project → backend dùng bảng thuật ngữ
            // của dự án (`<video>.sublix-glossary.json`) làm ràng buộc CỨNG.
            filePath?.trim() || undefined,
            runId,
          );
          const ctxFailed = ctxResults.filter((r) => r.failed || !r.translated).length;
          const ctxById = new Map(ctxResults.map((r) => [r.id, r]));
          // [TSK-TABS-3.5] Video đã đổi ⇒ bỏ kết quả (không ghi đè video mới).
          if (!guardProject(startedPath)) return;
          setSegments((prev) =>
            prev.map((seg) => {
              const hit = ctxById.get(String(seg.id));
              if (!hit) return seg;
              if (hit.failed || !hit.translated) {
                return { ...seg, translateFailed: true, glossaryViolation: false, glossaryViolationReason: null };
              }
              // [TSK-STUDIO-GLOSSARY] Gắn cờ vi phạm bảng thuật ngữ (backend tự kiểm tra
              // tất định) — boolean + chuỗi ⇒ không phá `React.memo`.
              return {
                ...seg,
                translated: hit.translated,
                translateFailed: false,
                glossaryViolation: hit.glossaryViolation === true,
                glossaryViolationReason: hit.glossaryViolationReason ?? null,
              };
            }),
          );
          setTranslatePhase(null);
          setTimelineProgress(100);
          setAnalyzeProgress(100);
          setTimelineProcessMessage("Dịch theo ngữ cảnh hoàn tất!");
          setAnalyzeMessage("Dịch theo ngữ cảnh phụ đề hoàn tất!");
          // Báo số câu vi phạm bảng (đã duyệt) để người dùng biết cần rà lại.
          const violations = ctxResults.filter((r) => r.glossaryViolation === true).length;
          showToast(
            ctxFailed > 0
              ? `🧠 Đã dịch theo ngữ cảnh ${ctxResults.length - ctxFailed}/${ctxResults.length} câu — ${ctxFailed} câu lỗi`
              : violations > 0
                ? `🧠 Đã dịch theo ngữ cảnh xong ${ctxResults.length} câu — ${violations} câu vi phạm bảng thuật ngữ (tô vàng)`
                : `🧠 Đã dịch theo ngữ cảnh xong ${ctxResults.length} câu!`,
          );
          notifyTaskUpdate({
            status: "completed",
            type: "file_sub",
            workflowType: "subtitle_translate",
            workflowLabel: "Phụ Đề & Dịch Thuật AI",
            title: `Phụ Đề & Dịch Thuật · ${fileName || "Video"}`,
            stage: "Hoàn tất dịch theo ngữ cảnh",
            detail: `Đã dịch ${ctxResults.length} câu (có ngữ cảnh)`,
            percent: 100,
            outputPath: filePath,
            steps: [
              { id: "stt", label: "Whisper STT", status: "done" },
              { id: "trans", label: "Dịch theo ngữ cảnh", status: "done" },
              { id: "done", label: "Xuất Phụ Đề", status: "done" },
            ],
          });
          return;
        } catch (ctxErr) {
          console.warn("Dịch theo ngữ cảnh thất bại — rơi về dịch theo lô:", ctxErr);
          setTranslatePhase(null);
          showToast("⚠️ Dịch theo ngữ cảnh lỗi — chuyển sang dịch theo lô.");
        }
      }

      const BATCH_SIZE = 8;
      const total = targetSegs.length;
      let completedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        // Đã bị Dừng (job huỷ lúc đang chạy) ⇒ thôi dịch tiếp, nhả slot sớm.
        if (runId && abortedRunsRef.current.has(runId)) return;
        const chunk = targetSegs.slice(i, i + BATCH_SIZE);
        const texts = chunk.map((s) => s.original);

        const loopMsg = `Đang dịch câu ${i + 1}-${Math.min(total, i + BATCH_SIZE)}/${total} (${targetLang.toUpperCase()})...`;
        setTimelineProcessMessage(loopMsg);
        setAnalyzeMessage(loopMsg);

        let translatedTexts: string[] = [];
        try {
          translatedTexts = await sublix.translateBatch(
            texts,
            sttLang === "auto" ? "auto" : sttLang,
            targetLang
          );
        } catch (batchErr) {
          console.warn("Batch translate failed, thử từng câu:", batchErr);
          for (const s of chunk) {
            try {
              const res = await sublix.translateTest(s.original, sttLang, targetLang);
              translatedTexts.push(res);
            } catch (lineErr) {
              // KHÔNG ghi nguyên văn tiếng gốc vào ô dịch (BUG-029) — để rỗng và đếm lỗi
              console.warn(`Dịch câu #${s.id} thất bại:`, lineErr);
              translatedTexts.push("");
            }
          }
        }

        // [TSK-TABS-3.5] Video đã đổi ⇒ bỏ lô kết quả này (và các lô sau).
        if (!guardProject(startedPath)) return;

        // Đếm câu lỗi để báo trung thực ở toast cuối
        failedCount += chunk.filter((_, i) => !translatedTexts[i] || translatedTexts[i].trimStart().startsWith("[Dịch lỗi:")).length;

        setSegments((prev) =>
          prev.map((s) => {
            const chunkIdx = chunk.findIndex((c) => c.id === s.id);
            if (chunkIdx !== -1 && translatedTexts[chunkIdx]) {
              const value = translatedTexts[chunkIdx];
              // Nhãn lỗi dịch ("[Dịch lỗi: ...]") KHÔNG được đưa vào ô dịch và
              // không được đọc ra loa. Hiển thị nhãn tiếng Việt thay thế.
              if (value.trimStart().startsWith("[Dịch lỗi:")) {
                return { ...s, translated: "", translateFailed: true };
              }
              return { ...s, translated: value, translateFailed: false };
            }
            // Không dịch được: đánh dấu lỗi, giữ nguyên bản dịch cũ (không bịa)
            if (chunkIdx !== -1) return { ...s, translateFailed: true };
            return s;
          })
        );

        completedCount += chunk.length;
        const pct = Math.min(95, Math.round((completedCount / total) * 95));
        setTimelineProgress(pct);
        setAnalyzeProgress(pct);

        notifyTaskUpdate({
          status: "running",
          stage: loopMsg,
          detail: `${Math.min(total, completedCount)}/${total} câu thoại`,
          percent: Math.min(98, 50 + Math.round(((completedCount) / total) * 48)),
          steps: [
            { id: "stt", label: "Whisper STT", status: "done" },
            { id: "trans", label: "Dịch AI (LLM)", status: "running" },
            { id: "done", label: "Xuất Phụ Đề", status: "pending" },
          ],
        });
      }

      setTimelineProgress(100);
      setAnalyzeProgress(100);
      setTimelineProcessMessage("Dịch thuật hoàn tất!");
      setAnalyzeMessage("Dịch thuật phụ đề hoàn tất!");
      showToast(
        failedCount > 0
          ? `⚠ Đã dịch ${total - failedCount}/${total} câu sang ${targetLang.toUpperCase()} — ${failedCount} câu dịch lỗi (đã đánh dấu, KHÔNG lồng tiếng câu lỗi)`
          : `✅ Đã dịch xong ${total} câu thoại sang ${targetLang.toUpperCase()}${isRange ? " trong vùng chọn" : ""}!`
      );

      notifyTaskUpdate({
        status: "completed",
        type: "file_sub",
        workflowType: "subtitle_translate",
        workflowLabel: "Phụ Đề & Dịch Thuật AI",
        title: `Phụ Đề & Dịch Thuật · ${fileName || "Video"}`,
        stage: "Hoàn tất tạo & dịch phụ đề",
        detail: `Đã dịch ${total} câu thoại sang ${targetLang.toUpperCase()}`,
        percent: 100,
        outputPath: filePath,
        steps: [
          { id: "stt", label: "Whisper STT", status: "done" },
          { id: "trans", label: "Dịch AI (LLM)", status: "done" },
          { id: "done", label: "Xuất Phụ Đề", status: "done" },
        ],
      });
    } catch (err) {
      console.error("Translation error:", err);
      showToast(`❌ Lỗi dịch thuật: ${err}`);
      notifyTaskUpdate({
        status: "error",
        stage: "Lỗi dịch thuật phụ đề",
        error: String(err),
      });
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false);
        setTimelineProcessType(null);
      }, 500);
    }
  };

  // =========================================================================
  // ROUND-8 & ROUND-14: CÔNG ĐOẠN 3 — CHỈ TẠO GIỌNG ĐỌC / TTS (VOICE ONLY)
  // =========================================================================
  // onlyIds: chỉ tạo tiếng cho đúng các id này (dùng sau khi bóc tách vùng → chỉ câu MỚI, không đụng câu ngoài vùng)
  const runVoiceOnlyImpl = async (forceRange?: boolean, overrideSegs?: SubtitleItem[], onlyIds?: Set<number>): Promise<void> => {
    const runId = slotRunIdRef.current ?? undefined;
    const allSegs = overrideSegs || segmentsRef.current || segments;
    // [TSK-TABS-3.5] Chụp video TRƯỚC vòng lặp TTS → nếu đổi video thì bỏ tiếng
    // đã tạo (không ghi đè video mới).
    const startedPath = filePath;
    // Pipeline chạy tiếp từ handleRunAnalysis(dubImmediately) đang giữ isAnalyzing → mọi lối thoát sớm phải nhả cờ
    const bailOut = (msg: string) => {
      showToast(msg);
      setIsAnalyzing(false);
      setTimelineProcessType(null);
    };
    if (allSegs.length === 0) {
      bailOut("⚠ Chưa có câu thoại nào để tạo giọng đọc!");
      return;
    }

    setWorkflowOptVoice(true);

    const isRange = (forceRange || useRangeOnly) && inPoint !== null && outPoint !== null;
    const startSec = isRange ? Math.min(inPoint, outPoint) : 0;
    const endSec = isRange ? Math.max(inPoint, outPoint) : mediaDuration;

    // Câu CHỒNG LẤN vùng đều được đọc lại (kể cả câu bị In/Out cắt ngang mép) — cùng quy tắc với Dịch / Xóa trong vùng
    const targetSegs = onlyIds
      ? allSegs.filter((s) => onlyIds.has(s.id))
      : isRange
      ? allSegs.filter((s) => isSegInRange(s, startSec, endSec))
      : allSegs;

    if (targetSegs.length === 0) {
      bailOut(isRange ? "⚠ Không có câu thoại nào trong vùng chọn để tạo giọng đọc!" : "⚠ Không có câu thoại nào để tạo giọng đọc!");
      return;
    }

    setIsAnalyzing(true);
    setTimelineProcessType("voice");
    setTimelineProgress(10);
    setAnalyzeProgress(10);
    const vMsg = `Đang tổng hợp giọng đọc TTS cho ${targetSegs.length} câu...`;
    setTimelineProcessMessage(vMsg);
    setAnalyzeMessage(vMsg);

    notifyTaskUpdate({
      status: "running",
      type: "dubbing",
      workflowType: "voice_only",
      workflowLabel: "Lồng Tiếng TTS",
      title: `Lồng Tiếng TTS · ${fileName || "Video"}`,
      stage: vMsg,
      percent: 10,
      steps: [
        { id: "tts", label: "Tổng hợp TTS", status: "running" },
        { id: "sync", label: "Đồng bộ Audio Track", status: "pending" },
      ],
    });

    try {
      saveAudioUndo();
      const total = targetSegs.length;
      let okCount = 0;
      let skippedCount = 0;
      let ttsFailedCount = 0;

      for (let i = 0; i < total; i++) {
        // Đã bị Dừng (job huỷ lúc đang chạy) ⇒ thôi tạo tiếp, nhả slot sớm.
        if (runId && abortedRunsRef.current.has(runId)) break;
        const seg = targetSegs[i];
        // Câu dịch lỗi → KHÔNG tạo lồng tiếng (tránh đọc nhãn lỗi hoặc đọc nhầm
        // text gốc cho một câu chưa có bản dịch).
        if (seg.translateFailed) {
          console.warn(`Bỏ qua TTS cho câu ${seg.id} (dịch lỗi)`);
          skippedCount++;
          continue;
        }
        const pct = Math.round(((i + 1) / total) * 95);
        setTimelineProgress(pct);
        setAnalyzeProgress(pct);
        const lMsg = `Tổng hợp giọng câu ${i + 1}/${total}...`;
        setTimelineProcessMessage(lMsg);
        setAnalyzeMessage(lMsg);

        notifyTaskUpdate({
          status: "running",
          stage: lMsg,
          detail: `${i + 1}/${total} câu thoại`,
          percent: pct,
        });

        // speakersRef (không phải `speakers`): khi chạy nối tiếp sau bóc tách, closure cũ còn giữ roster TRƯỚC khi phân vai
        const spk = speakersRef.current.find((s) => s.id === seg.speakerId);
        const voice = spk?.voice || defaultVoiceForEngine(selectedTtsEngine, "male");
        // R32: LƯU clip tiếng lồng thật + đo độ dài thật (trước đây vứt kết quả, chỉ giơ cờ hasAudio)
        let clipDataUri: string | undefined;
        try {
          clipDataUri = await sublix.dubbingPreviewTts(seg.translated, voice);
        } catch (ttsErr) {
          // Không nuốt im lặng: ghi log + đếm để báo ở toast cuối
          console.warn(`TTS câu #${seg.id} thất bại:`, ttsErr);
        }
        if (!clipDataUri) {
          // Lỗi TTS: GIỮ NGUYÊN tiếng cũ của câu (không xóa mất khi "tạo lại" vùng)
          ttsFailedCount++;
          continue;
        }
        okCount++;
        let clipDur: number | undefined;
        if (clipDataUri) {
          clipDur = await new Promise<number | undefined>((resolve) => {
            const probe = new Audio();
            const done = (v?: number) => resolve(v);
            probe.preload = "metadata";
            probe.onloadedmetadata = () =>
              done(Number.isFinite(probe.duration) ? probe.duration : undefined);
            probe.onerror = () => done(undefined);
            setTimeout(() => done(undefined), 4000);
            probe.src = clipDataUri!;
          });
        }

        // [TSK-TABS-3.5] Video đã đổi ⇒ bỏ clip TTS vừa tạo (không ghi vào video mới).
        if (!guardProject(startedPath)) return;

        setSegments((prev) =>
          prev.map((s) =>
            s.id === seg.id
              ? { ...s, hasAudio: !!clipDataUri, audioUrl: clipDataUri, audioDuration: clipDur }
              : s
          )
        );
      }

      // Dừng giữa chừng: giữ phần đã tạo, KHÔNG báo "hoàn tất".
      if (runId && abortedRunsRef.current.has(runId)) return;

      setTimelineProgress(100);
      setAnalyzeProgress(100);
      setTimelineProcessMessage("Hoàn tất tạo giọng đọc!");
      setAnalyzeMessage("Hoàn tất tạo giọng đọc!");
      const problemNote =
        skippedCount + ttsFailedCount > 0
          ? ` — bỏ qua ${skippedCount} câu dịch lỗi, ${ttsFailedCount} câu TTS lỗi (giữ nguyên tiếng cũ)`
          : "";
      const scopeNote = isRange && !onlyIds ? ` trong vùng ${formatTimecode(startSec)} ➔ ${formatTimecode(endSec)} (${allSegs.length - total} câu ngoài vùng giữ nguyên)` : "";
      showToast(
        `${okCount === total ? "✅" : "⚠"} Đã tổng hợp giọng đọc cho ${okCount}/${total} câu thoại${scopeNote}${problemNote}!`
      );

      notifyTaskUpdate({
        status: "completed",
        type: "dubbing",
        workflowType: "voice_only",
        workflowLabel: "Lồng Tiếng TTS",
        title: `Lồng Tiếng TTS · ${fileName || "Video"}`,
        stage: "Hoàn tất tạo giọng đọc TTS",
        detail: `Đã lồng tiếng ${okCount}/${total} câu thoại`,
        percent: 100,
        outputPath: filePath,
        steps: [
          { id: "tts", label: "Tổng hợp TTS", status: "done" },
          { id: "sync", label: "Đồng bộ Audio Track", status: "done" },
        ],
      });
    } catch (err) {
      console.error("Voice TTS error:", err);
      showToast(`❌ Lỗi tạo giọng đọc: ${err}`);
      notifyTaskUpdate({
        status: "error",
        stage: "Lỗi tạo giọng đọc TTS",
        error: String(err),
      });
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false);
        setTimelineProcessType(null);
      }, 500);
    }
  };

  // =========================================================================
  // ROUND-8: 1-CLICK TOÀN BỘ PIPELINE (STT + DIARIZATION + TRANSLATION + VOICE)
  // =========================================================================
  // forceTranslate: lệnh menu "Bóc tách + dịch + lồng tiếng vùng" luôn dịch, không phụ thuộc switch "Dịch phụ đề".
  const runAnalysisImpl = async (forceRange?: boolean, dubImmediately: boolean = false, forceTranslate: boolean = false): Promise<void> => {
    if (!filePath) {
      showToast("⚠ Vui lòng mở hoặc kéo thả video trước khi phân tích");
      return;
    }
    // [TSK-TABS-P2] Id lượt chạy của slot — lọc sự kiện + gửi xuống backend.
    const runId = slotRunIdRef.current ?? undefined;
    setIsAnalyzing(true);
    setTimelineProcessType(dubImmediately ? "pipeline" : "stt");
    setAnalyzeProgress(5);
    setTimelineProgress(5);
    setAnalyzeMessage(dubImmediately ? "Đang khởi tạo pipeline toàn trình..." : "Đang khởi tạo quét phân tích & phân vai...");
    setTimelineProcessMessage(dubImmediately ? "Đang khởi tạo pipeline toàn trình..." : "Đang quét phân tích...");

    notifyTaskUpdate({
      status: "running",
      type: "dubbing",
      workflowType: "dubbing",
      workflowLabel: dubImmediately ? "Lồng Tiếng Đa Vai AI" : "Quét Phân Tích & Phân Vai",
      title: `${dubImmediately ? "Lồng Tiếng Toàn Trình" : "Quét Phân Vai"} · ${fileName || "Video"}`,
      stage: "Đang khởi tạo pipeline AI...",
      percent: 5,
      steps: [
        { id: "stt", label: "Whisper STT", status: "running" },
        { id: "diar", label: "Sherpa Phân Vai", status: "pending" },
        { id: "trans", label: "Dịch AI", status: "pending" },
        { id: "tts", label: dubImmediately ? "Lồng Tiếng TTS" : "Sẵn Sàng Chọn Giọng", status: "pending" },
      ],
    });

    // Vùng In/Out được nới ra mép câu bị cắt ngang → không mất nửa câu khi bóc tách lại (expandRangeToSegmentEdges)
    const rawRange =
      (forceRange || useRangeOnly) && inPoint !== null && outPoint !== null
        ? { start: Math.min(inPoint, outPoint), end: Math.max(inPoint, outPoint) }
        : null;
    const range = rawRange ? expandRangeToSegmentEdges(segmentsRef.current, rawRange.start, rawRange.end) : null;
    const isRange = range !== null;
    const startSec = range ? range.start : 0;
    const endSec = range ? Math.min(range.end, mediaDuration > 0 ? mediaDuration : range.end) : mediaDuration;
    const durLimit = isRange ? Math.abs(endSec - startSec) : undefined;
    const startOffset = isRange && startSec > 0 ? startSec : undefined;
    if (rawRange && range && (range.start < rawRange.start - 0.01 || range.end > rawRange.end + 0.01)) {
      showToast(`ℹ️ Vùng được nới ra ${formatTimecode(range.start)} ➔ ${formatTimecode(range.end)} để không cắt ngang câu ở mép`);
    }
    // Bước TTS nối tiếp (dubImmediately) đã nhận quyền nhả cờ `isAnalyzing` chưa.
    let voiceTookOver = false;

    let unlisten: (() => void) | null = null;
    try {
      await handleSaveProviderConfig();
      unlisten = await listen<DubbingProgress>("dubbing:progress", (event) => {
        if (isForeignRun(event.payload.run_id, runId)) return;
        setAnalyzeProgress(event.payload.percent);
        setTimelineProgress(event.payload.percent);
        setAnalyzeMessage(event.payload.message);
        setTimelineProcessMessage(event.payload.message);

        const pStage = event.payload.stage;
        notifyTaskUpdate({
          status: "running",
          stage: event.payload.message || "Đang xử lý...",
          percent: event.payload.percent,
          detail: event.payload.total_items > 2 ? `${event.payload.current_item}/${event.payload.total_items} câu thoại` : undefined,
          steps: [
            { id: "stt", label: "Whisper STT", status: pStage === "stt" ? "running" : pStage === "diarizing" || pStage === "scripting" || pStage === "translating" || pStage === "tts" ? "done" : "pending" },
            { id: "diar", label: "Sherpa Phân Vai", status: pStage === "diarizing" ? "running" : pStage === "scripting" || pStage === "translating" || pStage === "tts" ? "done" : "pending" },
            { id: "trans", label: "Dịch AI", status: pStage === "scripting" || pStage === "translating" ? "running" : pStage === "tts" ? "done" : "pending" },
            { id: "tts", label: dubImmediately ? "Lồng Tiếng TTS" : "Sẵn Sàng Chọn Giọng", status: pStage === "tts" ? "running" : "pending" },
          ],
        });
      });

      // [TSK-TABS-3.5] Chụp video TRƯỚC await → sau await mà đổi video thì bỏ toàn bộ
      // kết quả phân tích (đây là chỗ ghi đè mạnh nhất: segments + speakers).
      const startedPath = filePath;
      const project: DubbingProject = await sublix.dubbingAnalyze(
        filePath,
        sttLang === "auto" ? undefined : sttLang,
        // Switch "Dịch phụ đề" tắt → không dịch (đồng bộ với pill "Chỉ làm Phụ đề").
        workflowOptTranslate || forceTranslate ? targetLang : undefined,
        durLimit,
        startOffset,
        expectedSpeakerCount > 0 ? expectedSpeakerCount : undefined,
        preferExistingSrt,
        runId,
      );

      // Video đã đổi trong lúc phân tích ⇒ bỏ kết quả (không ghi đè video mới).
      if (!guardProject(startedPath)) {
        setTimelineProcessMessage("");
        setAnalyzeMessage("");
        setAnalyzeProgress(0);
        return;
      }

      if (project) {
        const vidDur = videoRef.current?.duration;
        const durToUse = (vidDur && !isNaN(vidDur) && vidDur > 0)
          ? vidDur
          : (project.media_duration_sec > 0 ? project.media_duration_sec : 0);
        if (durToUse > 0) {
          setMediaDuration(durToUse);
          mediaDurationRef.current = durToUse;
        }
        if (project.peaks && project.peaks.length > 0) {
          setAudioPeaks(project.peaks);
        }
        if (project.filmstrip_thumbs && project.filmstrip_thumbs.length > 0) {
          setFilmstripThumbs(project.filmstrip_thumbs);
        }

        // v0.11.32 (PO): báo khi transcript lấy từ phụ đề có sẵn cạnh video.
        setTranscriptSource(project.transcript_source ?? null);
        if (project.transcript_source?.startsWith("srt:")) {
          showToast(
            `📝 Đã dùng phụ đề có sẵn (.${project.transcript_source.split(":")[1]}.srt) — chuẩn hơn nhận dạng giọng nói, khỏi chờ Whisper`
          );
        }

        let mappedSpeakers: SpeakerItem[] = [];
        const defaultVoice = defaultVoiceForEngine(selectedTtsEngine, "male") || "kokoro:tuan_ngoc";

        if (expectedSpeakerCount === 1) {
          const singleSpk: SpeakerItem = {
            id: "spk_1",
            name: "Thuyết minh AI (Nam)",
            gender: "male",
            color: "#38bdf8",
            voice: defaultVoice,
            count: project.segments.length,
            sampleAudio: null,
          };
          mappedSpeakers = [singleSpk];
          setSpeakers(mappedSpeakers);
        } else if (expectedSpeakerCount === 2) {
          // Xử lý chuẩn xác cho 2 người nói theo preset Nam/Nữ người dùng chọn
          // Giọng lấy từ danh mục BACKEND của engine đang chọn.
          const engineVoices = voicesForEngine(selectedTtsEngine);
          const maleVoices = engineVoices.filter((v) => v.gender === "male");
          const femaleVoices = engineVoices.filter((v) => v.gender === "female");

          let g1: "male" | "female" = "male";
          let g2: "male" | "female" = "female";
          let v1 = maleVoices[0]?.id || defaultVoiceForEngine(selectedTtsEngine, "male");
          let v2 = femaleVoices[0]?.id || defaultVoiceForEngine(selectedTtsEngine, "female");

          if (twoSpeakerGenderPreset === "mm") {
            g1 = "male";
            g2 = "male";
            v1 = maleVoices[0]?.id || defaultVoiceForEngine(selectedTtsEngine, "male");
            v2 = maleVoices[1]?.id || v1;
          } else if (twoSpeakerGenderPreset === "ff") {
            g1 = "female";
            g2 = "female";
            v1 = femaleVoices[0]?.id || defaultVoiceForEngine(selectedTtsEngine, "female");
            v2 = femaleVoices[1]?.id || v1;
          }

          const spk1Id = project.speakers[0]?.id || "spk_1";
          const spk2Id = project.speakers[1]?.id || "spk_2";

          const spk1: SpeakerItem = {
            id: spk1Id,
            name: `Vai 1 (${g1 === "male" ? "Nam" : "Nữ"})`,
            gender: g1,
            color: SPEAKER_COLORS[0],
            voice: v1,
            count: project.segments.filter((s) => s.speaker_id === spk1Id).length,
            sampleAudio: project.speakers[0]?.sample_audio_data || null,
          };
          const spk2: SpeakerItem = {
            id: spk2Id,
            name: `Vai 2 (${g2 === "male" ? "Nam" : "Nữ"})`,
            gender: g2,
            color: SPEAKER_COLORS[1 % SPEAKER_COLORS.length],
            voice: v2,
            count: project.segments.filter((s) => s.speaker_id === spk2Id).length,
            sampleAudio: project.speakers[1]?.sample_audio_data || null,
          };
          mappedSpeakers = [spk1, spk2];
          setSpeakers(mappedSpeakers);
        } else {
          mappedSpeakers = project.speakers.map((spk, idx) => ({
            id: spk.id,
            name: spk.label,
            gender: (spk.gender as "male" | "female") || (idx % 2 === 0 ? "male" : "female"),
            color: SPEAKER_COLORS[idx % SPEAKER_COLORS.length],
            voice: spk.voice || defaultVoice,
            count: project.segments.filter((s) => s.speaker_id === spk.id).length,
            sampleAudio: spk.sample_audio_data || null,
          }));
          setSpeakers(mappedSpeakers);
        }

        // Phân tích theo VÙNG khi đã có roster: GIỮ roster cũ (câu ngoài vùng vẫn trỏ đúng vai + giọng người dùng đã chọn),
        // chỉ THÊM vai mới (nếu có). Trước đây setSpeakers(roster mới) làm câu ngoài vùng mất vai.
        if (isRange && speakersRef.current.length > 0) {
          const existing = speakersRef.current;
          const known = new Set(existing.map((s) => s.id));
          const extra = expectedSpeakerCount === 1 ? [] : mappedSpeakers.filter((s) => !known.has(s.id));
          mappedSpeakers = [...existing, ...extra];
          setSpeakers(mappedSpeakers);
        }

        const singleSpkId = expectedSpeakerCount === 1 ? mappedSpeakers[0].id : null;
        const validSpkIds = new Set(mappedSpeakers.map((s) => s.id));
        const fallbackSpkId = mappedSpeakers[0]?.id || "spk_1";

        const newMappedSegments: SubtitleItem[] = project.segments.map((seg) => {
          let targetSpkId = seg.speaker_id;
          if (singleSpkId) {
            targetSpkId = singleSpkId;
          } else if (!validSpkIds.has(targetSpkId)) {
            targetSpkId = fallbackSpkId;
          }
          return {
            id: seg.id,
            start: seg.start_sec,
            end: seg.end_sec,
            speakerId: targetSpkId,
            original: seg.original_text,
            translated: seg.dubbed_text || seg.original_text,
            hasAudio: dubImmediately, // Nếu quét trước thì chưa có audio để user review & chọn giọng
            audioDuration: seg.audio_duration_sec ?? undefined,
            source: (project.transcript_source?.startsWith("srt:") ? "youtube" : "whisper") as "youtube" | "whisper",
          };
        });

        saveUndoHistory();
        // Theo vùng: chỉ thay câu thuộc vùng, câu ngoài vùng giữ NGUYÊN id/bản dịch/tiếng lồng (không đánh số lại).
        let allAfter: SubtitleItem[] = newMappedSegments;
        let newIdSet: Set<number> | undefined;
        let rangeNote = "";
        if (isRange) {
          const merged = mergeRangeSegments(segmentsRef.current, newMappedSegments, startSec, endSec);
          allAfter = merged.segments;
          newIdSet = merged.newIds;
          setSegments(merged.segments);
          rangeNote = ` trong vùng ${formatTimecode(startSec)} ➔ ${formatTimecode(endSec)} (thay ${merged.replaced} câu cũ, giữ nguyên ${merged.segments.length - merged.newIds.size} câu ngoài vùng)`;
        } else {
          setSegments(newMappedSegments);
        }
        const newCount = newIdSet ? newIdSet.size : newMappedSegments.length;

        if (!isRange && newMappedSegments.length > 0) {
          setSelectedSegId(newMappedSegments[0].id);
        }
        setAnalyzeProgress(100);
        setTimelineProgress(100);
        setAnalyzeMessage("Phân tích hoàn tất!");
        setTimelineProcessMessage("Hoàn tất!");

        notifyTaskUpdate({
          status: "completed",
          type: "dubbing",
          workflowType: "dubbing",
          workflowLabel: dubImmediately ? "Lồng Tiếng Đa Vai AI" : "Quét Phân Tích & Phân Vai",
          title: `${dubImmediately ? "Lồng Tiếng Toàn Trình" : "Quét Phân Vai Xong"} · ${fileName || "Video"}`,
          stage: dubImmediately ? "Hoàn tất toàn trình lồng tiếng" : "Đã bóc tách & phân vai xong",
          detail: `Phát hiện ${mappedSpeakers.length} vai diễn, ${newMappedSegments.length} câu thoại`,
          percent: 100,
          outputPath: filePath,
          steps: [
            { id: "stt", label: "Whisper STT", status: "done" },
            { id: "diar", label: "Sherpa Phân Vai", status: "done" },
            { id: "trans", label: "Dịch AI", status: "done" },
            { id: "tts", label: dubImmediately ? "Lồng Tiếng TTS" : "Sẵn Sàng Chọn Giọng", status: "done" },
          ],
        });

        if (dubImmediately) {
          showToast(`⚡ Đã phân tích xong ${newCount} câu thoại${rangeNote}. Bắt đầu tổng hợp giọng đọc...`);
          // [TSK-TABS-P2] AWAIT bước TTS (trước đây `void` + setTimeout) ⇒ chuỗi
          // phân tích → TTS giữ MỘT slot liền mạch; job tab khác không chen vào giữa.
          await new Promise<void>((resolve) => setTimeout(resolve, 350));
          if (!(runId && abortedRunsRef.current.has(runId))) {
            // Theo vùng: chỉ đọc ĐÚNG các câu mới (id sau khi ghép) — không đụng câu ngoài vùng
            voiceTookOver = true;
            await handleRunVoiceOnly(forceRange, allAfter, newIdSet);
          }
        } else {
          showToast(`✅ Đã phân tích xong ${newCount} câu & ${mappedSpeakers.length} vai${rangeNote}! Vui lòng xem lại vai diễn, chọn giọng rồi bấm "Bắt Đầu Lồng Tiếng".`);
        }
      }
    } catch (err) {
      console.error("Analysis backend error:", err);
      voiceTookOver = false; // lỗi ném ra ⇒ không còn bước nối tiếp nào giữ cờ
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("hủy") || errMsg.includes("cancel") || errMsg.includes("dừng")) {
        setAnalyzeMessage("Tiến trình đã bị người dùng hủy.");
        setTimelineProcessMessage("Đã hủy");
        showToast("🛑 Tiến trình phân tích đã bị hủy.");
        notifyTaskUpdate({
          status: "error",
          stage: "Đã hủy",
          error: "Người dùng hủy tác vụ",
        });
      } else {
        setAnalyzeMessage(`Lỗi phân tích: ${errMsg}`);
        showToast(`❌ Lỗi phân tích: ${errMsg}`);
        notifyTaskUpdate({
          status: "error",
          stage: "Lỗi phân tích",
          error: errMsg,
        });
      }
      setAnalyzeProgress(0);
      setTimelineProgress(0);
    } finally {
      if (unlisten) {
        unlisten();
      }
      // Bước TTS nối tiếp tự nhả cờ; MỌI đường thoát khác (lỗi, đổi video, bị Dừng, không có project) phải nhả ở đây (BUG-081).
      if (!voiceTookOver) {
        setTimeout(() => {
          setIsAnalyzing(false);
          setTimelineProcessType(null);
        }, 500);
      }
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // [TSK-TABS-P2] HÀNG ĐỢI VIỆC NẶNG — toàn app chỉ 1 job nặng chạy một lúc.
  //
  // `runHeavy` bọc thân việc (`run*Impl`) vào `jobQueue`:
  //  - sinh `runId` TRƯỚC, impl đọc từ `slotRunIdRef` để lọc sự kiện + gửi xuống backend;
  //  - gọi LỒNG từ bên trong một job đang giữ slot (analysis → voice, workflow nhiều
  //    bước) ⇒ chạy thẳng, KHÔNG xếp hàng lại (tránh tự kẹt) ⇒ 1 slot liền mạch;
  //  - slot nhả trong `finally` của job (mọi đường thoát: xong / lỗi / Dừng / đổi video).
  // ══════════════════════════════════════════════════════════════════════════
  const jobTabKey = tabId ?? "studio_default";

  // Theo dõi vị trí chờ của tab này (cập nhật khi hàng đợi đổi).
  useEffect(() => {
    return jobQueue.subscribe((snap) => {
      const mine = snap.queued.find((job) => job.tabId === jobTabKey);
      setQueuedPosition(mine ? mine.position : null);
    });
  }, [jobTabKey]);

  // Gỡ instance (đóng tab) giữa lúc đang chạy ⇒ vòng lặp frontend phải dừng.
  useEffect(() => {
    return () => {
      const held = slotRunIdRef.current;
      if (held) abortedRunsRef.current.add(held);
    };
  }, []);

  interface HeavyHooks {
    /** Vào hàng mà phải chờ (position ≥ 1). */
    onQueued?: (position: number) => void;
    /** Job tới lượt chạy (trước khi thân việc tự đặt cờ của nó). */
    onStart?: () => void;
    /** Job bị huỷ khi còn xếp hàng (chưa chạy). */
    onDropped?: () => void;
  }

  const runHeavy =
    <A extends unknown[], R>(
      kind: JobKind,
      own: (...args: A) => Promise<R>,
      pick: (impls: HeavyImpls) => (...args: A) => Promise<R>,
      fallback: R,
      hooks: HeavyHooks = {},
    ) =>
    async (...args: A): Promise<R> => {
      // Gọi lồng trong job đang giữ slot (chưa bị huỷ) ⇒ chạy thẳng.
      const held = slotRunIdRef.current;
      if (held && !abortedRunsRef.current.has(held)) return own(...args);

      const runId = makeTaskRunId(`job_${kind}`, Date.now());
      let started = false;
      try {
        const handle = jobQueue.enqueue({
          tabId: jobTabKey,
          runId,
          kind,
          run: async () => {
            started = true;
            slotRunIdRef.current = runId;
            hooks.onStart?.();
            try {
              // Bản impl MỚI NHẤT (job chờ lâu ⇒ closure lúc bấm đã cũ).
              const impl = heavyImplsRef.current ? pick(heavyImplsRef.current) : own;
              return await impl(...args);
            } finally {
              // Nhả slot ở MỌI đường thoát (BUG-081).
              if (slotRunIdRef.current === runId) slotRunIdRef.current = null;
              abortedRunsRef.current.delete(runId);
            }
          },
        });
        if (handle.position > 0) hooks.onQueued?.(handle.position);
        return await handle.done;
      } catch (err) {
        if (err instanceof JobCancelledError) {
          if (started) {
            // Huỷ lúc đang chạy: báo cho vòng lặp frontend dừng (còn giữ slot tới khi dừng thật).
            if (slotRunIdRef.current === runId) abortedRunsRef.current.add(runId);
          } else {
            hooks.onDropped?.();
          }
          return fallback;
        }
        throw err;
      }
    };

  const queuedBusyHooks: HeavyHooks = {
    onQueued: () => {
      setIsAnalyzing(true);
      setAnalyzeMessage("Đang chờ lượt…");
    },
    onStart: () => {
      // Thân việc tự đặt lại `isAnalyzing`; nhánh thoát sớm của nó không để cờ kẹt.
      setIsAnalyzing(false);
    },
    onDropped: () => {
      setIsAnalyzing(false);
      setAnalyzeMessage("");
    },
  };

  const handleRunSttOnly = runHeavy("stt", runSttOnlyImpl, (i) => i.stt, null, queuedBusyHooks);
  const handleRunTranslateOnly = runHeavy("translate", runTranslateOnlyImpl, (i) => i.translate, undefined, queuedBusyHooks);
  const handleRunVoiceOnly = runHeavy("voice", runVoiceOnlyImpl, (i) => i.voice, undefined, queuedBusyHooks);
  const handleRunAnalysis = runHeavy("analyze", runAnalysisImpl, (i) => i.analysis, undefined, queuedBusyHooks);

  // [TSK-V014-WIRE-STUDIO] Dò phụ đề cứng đi qua hàng đợi (cùng slot ⇒ không chạy chồng với xuất/lồng tiếng).
  // Gọi lồng trong job đang giữ slot (vd. tự dò trước khi xuất) ⇒ chạy thẳng.
  const handleHardsubDetect = runHeavy("hardsub", v14.runDetectImpl, (i) => i.hardsubDetect, undefined, {
    onQueued: () => v14.markQueued(),
    onDropped: () => v14.clearRunning(),
  });
  v14.triggerRef.current = handleHardsubDetect;
  /** Huỷ dò: đang xếp hàng ⇒ bỏ khỏi hàng; đang chạy ⇒ báo backend dừng sidecar dò (không đụng việc khác). */
  const handleCancelHardsubDetect = () => {
    const queued = jobQueue.getState().queued.filter((j) => j.tabId === jobTabKey && j.kind === "hardsub");
    for (const j of queued) jobQueue.cancel(j.runId);
    if (queued.length === 0) v14.cancelDetect();
  };

  /**
   * Dừng việc CỦA TAB NÀY: job còn xếp hàng ⇒ chỉ bỏ khỏi hàng (KHÔNG gọi `dubbingCancel`);
   * job đang chạy ⇒ `jobQueue.cancel` gọi `dubbingCancel` đúng 1 lần (xem setCancelHandler).
   * Không động tới job của tab khác.
   */
  const handleCancelAnalysis = async () => {
    try {
      const snap = jobQueue.getState();
      const mine = [...snap.queued, ...(snap.running ? [snap.running] : [])].filter(
        (job) => job.tabId === jobTabKey,
      );
      for (const job of mine) jobQueue.cancel(job.runId);
      setIsExporting(false);
      showToast("🛑 Đã gửi lệnh dừng phân tích video.");
      setAnalyzeMessage("Tiến trình đã bị người dùng hủy.");
      setTimelineProcessMessage("Đã hủy");
      setIsAnalyzing(false);
      setTimelineProcessType(null);
      setTimelineProgress(0);
    } catch (err) {
      console.warn("Cancel analysis error:", err);
    }
  };

  // Play Base64 audio preview for speaker (hỗ trợ toggle phát/dừng, dừng audio cũ khi phát mới)
  const handlePlayAudio = (sampleAudio?: string | null, spkId?: string) => {
    if (!sampleAudio) {
      showToast("ℹ Không có clip âm thanh mẫu cho vai này.");
      return;
    }
    // Dừng engine sample nếu đang phát
    if (engineSampleAudioRef.current) {
      engineSampleAudioRef.current.pause();
      engineSampleAudioRef.current = null;
      setPlayingEngineSample(null);
    }
    // Bấm lại đúng spk đang phát -> dừng lại
    if (spkId && playingAudioSpkId === spkId && currentAudioPreviewRef.current) {
      currentAudioPreviewRef.current.pause();
      currentAudioPreviewRef.current = null;
      setPlayingAudioSpkId(null);
      return;
    }
    if (currentAudioPreviewRef.current) {
      currentAudioPreviewRef.current.pause();
      currentAudioPreviewRef.current = null;
    }
    try {
      const audio = new Audio(sampleAudio);
      currentAudioPreviewRef.current = audio;
      if (spkId) {
        setPlayingAudioSpkId(spkId);
        audio.onended = () => {
          setPlayingAudioSpkId((curr) => (curr === spkId ? null : curr));
          currentAudioPreviewRef.current = null;
        };
        audio.onerror = () => {
          setPlayingAudioSpkId((curr) => (curr === spkId ? null : curr));
          currentAudioPreviewRef.current = null;
        };
        audio.onpause = () => {
          setPlayingAudioSpkId((curr) => (curr === spkId ? null : curr));
        };
      }
      audio.play().catch((e) => {
        console.warn("Audio play error:", e);
        if (spkId) setPlayingAudioSpkId((curr) => (curr === spkId ? null : curr));
      });
    } catch (e) {
      console.warn("Audio error:", e);
      if (spkId) setPlayingAudioSpkId((curr) => (curr === spkId ? null : curr));
    }
  };

  // R2-04.1 & R3-01: Audition preview assigned speaker voice (or original sample audio)
  const handlePreviewSpeakerVoice = async (spk: SpeakerItem) => {
    // Nếu đang phát đúng vai này -> bấm lần 2 để dừng
    if (playingAudioSpkId === spk.id) {
      if (currentAudioPreviewRef.current) {
        currentAudioPreviewRef.current.pause();
        currentAudioPreviewRef.current = null;
      }
      setPlayingAudioSpkId(null);
      showToast(`⏹ Đã dừng nghe thử giọng của ${spk.name}`);
      return;
    }

    setAuditioningSpkId(spk.id);
    try {
      const isTauriEnv = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
      let dataUri: string | null = null;
      const spkVoice = spk.voice || defaultVoiceForEngine(selectedTtsEngine, "male");
      // R2-3: không map vietneu→kokoro ở frontend; backend tự route/fallback.
      const cleanVoice = spkVoice.replace(/^kokoro:/, "");

      if (isTauriEnv) {
        const samplePhrase = `Xin chào, tôi là ${spk.name}, đây là mẫu giọng đọc được gán cho nhân vật của tôi.`;
        // TSK-FEAT-VOICE-SAMPLE-CACHE: mọi engine (Kokoro/VieNeu/ZeroTTS/cloud) đều
        // dùng chung cache mẫu nghe thử — lần đầu tổng hợp 1 lần rồi lưu xuống
        // đĩa, lần sau phát TỨC THÌ (không gọi lại TTS).
        // Cache theo GIỌNG ⇒ dùng câu mẫu chung của backend, KHÔNG truyền câu có tên
        // vai (nếu không, vai đầu tiên nghe sẽ "đóng băng" tên mình vào mẫu của giọng).
        try {
          dataUri = await sublix.voiceSampleEnsureUrl(spkVoice);
        } catch (e) {
          console.warn("voice sample ensure failed:", e);
          dataUri = null;
        }
        // Không có mẫu (voice lạ / engine chưa cài) → tổng hợp trực tiếp như cũ.
        if (!dataUri) {
          try {
            dataUri = await sublix.dubbingPreviewTts(samplePhrase, spkVoice);
          } catch (e) {
            console.warn("Preview TTS invoke failed:", e);
          }
        }
      }

      if (dataUri) {
        handlePlayAudio(dataUri, spk.id);
        const voiceLabel = spkVoice.startsWith("vietneu:")
          ? `VieNeu (${spkVoice.replace("vietneu:", "")})`
          : spkVoice.startsWith("kokoro:")
          ? `Kokoro (${cleanVoice})`
          : spkVoice;
        showToast(`🎧 Đang nghe thử giọng ${voiceLabel} của ${spk.name}`);
      } else if (spk.sampleAudio) {
        handlePlayAudio(spk.sampleAudio, spk.id);
        showToast(`🎧 Phát clip giọng gốc của ${spk.name}`);
      } else {
        showToast(`⚠️ Chưa có mẫu âm thanh cho vai "${spk.name}".`);
      }
    } catch (err) {
      console.warn("Failed preview voice, trying sampleAudio fallback:", err);
      if (spk.sampleAudio) {
        handlePlayAudio(spk.sampleAudio, spk.id);
        showToast(`🎧 Phát clip giọng gốc của ${spk.name}`);
      } else {
        showToast(`ℹ Mẫu giọng ${spk.voice || "mặc định"} (${spk.name}) đã được chọn.`);
      }
    } finally {
      setAuditioningSpkId(null);
    }
  };

  // RESIZABLE SIDEBAR HANDLERS (Left & Right Splitters)
  const handleMouseDownLeftSplitter = (e: React.MouseEvent) => {
    // [TSK-TABS-P1] Chỉ instance ĐANG HOẠT ĐỘNG mới kéo mép cột trái.
    if (!isActive) return;
    e.preventDefault();
    setIsDraggingLeft(true);
    const startX = e.clientX;
    const startWidth = leftPanelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(600, Math.max(250, startWidth + delta));
      setLeftPanelWidth(newWidth);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      const delta = upEvent.clientX - startX;
      const finalWidth = Math.min(600, Math.max(250, startWidth + delta));
      setIsDraggingLeft(false);
      try {
        localStorage.setItem("sublix_studio_left_w", String(finalWidth));
      } catch {}
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleResetLeftWidth = () => {
    setLeftPanelWidth(340);
    try {
      localStorage.setItem("sublix_studio_left_w", "340");
    } catch {}
    showToast("Đã đặt lại độ rộng cột Cấu hình (340px)");
  };

  const handleMouseDownRightSplitter = (e: React.MouseEvent) => {
    // [TSK-TABS-P1] Chỉ instance ĐANG HOẠT ĐỘNG mới kéo mép cột phải.
    if (!isActive) return;
    e.preventDefault();
    setIsDraggingRight(true);
    const startX = e.clientX;
    const startWidth = rightPanelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(700, Math.max(260, startWidth + delta));
      setRightPanelWidth(newWidth);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      const delta = startX - upEvent.clientX;
      const finalWidth = Math.min(700, Math.max(260, startWidth + delta));
      setIsDraggingRight(false);
      try {
        localStorage.setItem("sublix_studio_right_w", String(finalWidth));
      } catch {}
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleResetRightWidth = () => {
    setRightPanelWidth(350);
    try {
      localStorage.setItem("sublix_studio_right_w", "350");
    } catch {}
    showToast("Đã đặt lại độ rộng cột Phụ đề (350px)");
  };

  // TTS Engine & Model Selection (Tự động lọc chính xác và re-map giọng của các vai)
  const handleSelectTtsEngine = (engine: TtsEngineKey) => {
    setSelectedTtsEngine(engine);
    try {
      localStorage.setItem("sublix_selected_tts_engine", engine);
    } catch {}

    const model = voicesForEngine(engine);
    const validVoiceIds = new Set(model.map((v) => v.id));

    // Tự động kiểm tra và re-map giọng của các vai nếu giọng hiện tại không thuộc engine vừa chọn
    setSpeakers((prev) => {
      let changed = false;
      const updated = prev.map((s, idx) => {
        if (!validVoiceIds.has(s.voice)) {
          changed = true;
          const isFemale = s.name.toLowerCase().includes("nữ") || s.name.toLowerCase().includes("female") || idx % 2 === 1;
          const newVoice = isFemale
            ? defaultVoiceForEngine(engine, "female")
            : defaultVoiceForEngine(engine, "male");
          return { ...s, voice: newVoice };
        }
        return s;
      });
      if (changed) {
        saveAudioUndo();
      }
      return updated;
    });

    showToast(`✅ Đã kích hoạt engine ${engine}. Danh sách giọng các vai đã được cập nhật tương ứng!`);
  };

  // Áp dụng nhanh giọng mặc định của Model cho tất cả các vai
  const handleApplyEngineToAllSpeakers = (engine: TtsEngineKey) => {
    saveAudioUndo();
    setSpeakers((prev) =>
      prev.map((s, idx) => {
        const isFemale = s.name.toLowerCase().includes("nữ") || s.name.toLowerCase().includes("female") || idx % 2 === 1;
        const newVoice = isFemale
          ? defaultVoiceForEngine(engine, "female")
          : defaultVoiceForEngine(engine, "male");
        return { ...s, voice: newVoice };
      })
    );
    showToast(`✅ Đã đồng bộ giọng đọc (${engine}) cho tất cả các vai diễn`);
  };

  // Nghe thử âm thanh mẫu đại diện của từng Mô hình TTS (VietNeu / Kokoro / Edge)
  const handlePreviewEngineSample = async (engineKey: TtsEngineKey) => {
    // Dừng audio của speaker preview nếu đang phát
    if (currentAudioPreviewRef.current) {
      currentAudioPreviewRef.current.pause();
      currentAudioPreviewRef.current = null;
      setPlayingAudioSpkId(null);
    }

    // Nếu đang phát đúng engine này -> bấm lần 2 để dừng
    if (playingEngineSample === engineKey) {
      if (engineSampleAudioRef.current) {
        engineSampleAudioRef.current.pause();
        engineSampleAudioRef.current = null;
      }
      setPlayingEngineSample(null);
      showToast("⏹ Đã dừng phát mẫu giọng của mô hình.");
      return;
    }

    // Dừng engine sample cũ nếu đang phát
    if (engineSampleAudioRef.current) {
      engineSampleAudioRef.current.pause();
      engineSampleAudioRef.current = null;
    }

    // R2-3: giọng mẫu lấy từ danh mục BACKEND, không hard-code theo engine.
    const engineVoices = voicesForEngine(engineKey);
    const sampleVoice = engineVoices[0]?.id ?? "";
    const samplePhrase = "Xin chào! Đây là bản nghe thử giọng đọc của Sublix Studio.";

    try {
      const isTauriEnv = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
      let dataUri: string | null = null;

      if (engineKey === "kokoro") {
        if (isTauriEnv) {
          dataUri = await sublix.voiceSampleDataUrl("kokoro-vi", "tuan_ngoc").catch(() => null);
          if (!dataUri) {
            dataUri = await sublix.voiceSampleDataUrl("kokoro-vi", "diem_trinh").catch(() => null);
          }
        }
        if (!dataUri && isTauriEnv) {
          dataUri = await sublix
            .dubbingPreviewTts(samplePhrase, sampleVoice || "kokoro:tuan_ngoc")
            .catch(() => null);
        }
      } else if (sampleVoice && isTauriEnv) {
        dataUri = await sublix.dubbingPreviewTts(samplePhrase, sampleVoice).catch(() => null);
      }

      if (dataUri) {
        const audio = new Audio(dataUri);
        engineSampleAudioRef.current = audio;
        setPlayingEngineSample(engineKey);
        audio.onended = () => {
          setPlayingEngineSample((curr) => (curr === engineKey ? null : curr));
          engineSampleAudioRef.current = null;
        };
        audio.onerror = () => {
          setPlayingEngineSample((curr) => (curr === engineKey ? null : curr));
          engineSampleAudioRef.current = null;
        };
        audio.onpause = () => {
          setPlayingEngineSample((curr) => (curr === engineKey ? null : curr));
        };
        await audio.play();
        showToast(`🎧 Đang phát mẫu giọng đại diện của ${engineKey}`);
      } else {
        showToast(`⚠️ Không thể tải mẫu âm thanh cho engine ${engineKey}.`);
      }
    } catch (err) {
      console.warn("Lỗi phát mẫu giọng engine:", err);
      showToast(`⚠️ Lỗi phát mẫu giọng: ${String(err)}`);
    } finally {
    }
  };

  // R2-03: Draw Audio Waveform on Canvas (Real speech activity peaks, silence is strictly flat)
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Cap canvas render width at 8192px to prevent Chromium texture crash on long media
    const renderWidth = Math.min(timelineWidth, 8192);
    canvas.width = renderWidth;
    const height = canvas.height || 32;
    ctx.clearRect(0, 0, renderWidth, height);

    if (mediaDuration <= 0) {
      return;
    }

    const midY = Math.floor(height / 2);

    if (audioPeaks.length > 0) {
      const gradient = ctx.createLinearGradient(0, 0, renderWidth, 0);
      gradient.addColorStop(0, "#38bdf8");
      gradient.addColorStop(0.5, "#2dd4bf");
      gradient.addColorStop(1, "#38bdf8");
      ctx.fillStyle = gradient;

      const barWidth = 2;
      const barGap = 1;
      const numBars = Math.floor(renderWidth / (barWidth + barGap));

      for (let i = 0; i < numBars; i++) {
        const ratio = i / Math.max(1, numBars - 1);
        const peakIdx = Math.min(audioPeaks.length - 1, Math.floor(ratio * audioPeaks.length));
        const peakVal = audioPeaks[peakIdx] || 0;

        if (peakVal < 0.015) {
          // Silence is strictly a 1px flat baseline
          ctx.fillRect(i * (barWidth + barGap), midY, barWidth, 1);
        } else {
          // Mirrored symmetrical waveform (DAW style)
          const halfH = Math.max(1, Math.min(Math.floor(height / 2) - 2, Math.floor(peakVal * (height / 2 - 2))));
          ctx.fillRect(i * (barWidth + barGap), midY - halfH, barWidth, halfH * 2);
        }
      }
    } else {
      // Subtle sine wave baseline indicating audio channel is ready / extracting
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      for (let x = 0; x < renderWidth; x += 8) {
        ctx.lineTo(x, midY + Math.sin(x * 0.08) * 2);
      }
      ctx.stroke();
    }
  }, [audioPeaks, mediaDuration, timelineWidth]);

  // [UI_R2-8_REVIEW mục 9] Lọc theo TRẠNG THÁI câu (trước chip vai).
  const [segmentStatusFilter, setSegmentStatusFilter] = useState<
    "none" | "untranslated" | "missing_voice" | "long"
  >("none");

  // Filter segments for P4
  const filteredSegments = segments.filter((seg) => {
    if (speakerFilter !== "all" && seg.speakerId !== speakerFilter) return false;
    // Lọc trạng thái (mục 9)
    if (segmentStatusFilter === "untranslated" && seg.translated.trim()) return false;
    if (segmentStatusFilter === "missing_voice" && seg.hasAudio) return false;
    if (segmentStatusFilter === "long" && seg.end - seg.start <= 12) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return seg.original.toLowerCase().includes(q) || seg.translated.toLowerCase().includes(q);
    }
    return true;
  });

  // [UI_R2-8_REVIEW mục 9] Thống kê đầu cột phụ đề: số câu · tổng thời lượng · số vai · WPM.
  const segmentStats = useMemo(() => {
    const totalSec = segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
    const words = segments.reduce(
      (sum, s) =>
        sum +
        (s.translated || s.original || "")
          .trim()
          .split(/\s+/)
          .filter(Boolean).length,
      0,
    );
    const minutes = totalSec / 60;
    const speakerCount = new Set(segments.map((s) => s.speakerId)).size;
    return {
      count: segments.length,
      totalSec,
      speakerCount,
      wpm: minutes > 0.05 ? Math.round(words / minutes) : 0,
    };
  }, [segments]);

  /** Đếm số câu theo trạng thái (cho 3 chip lọc). */
  const segmentStatusCounts = useMemo(
    () => ({
      untranslated: segments.filter((s) => !s.translated.trim()).length,
      missingVoice: segments.filter((s) => !s.hasAudio).length,
      long: segments.filter((s) => s.end - s.start > 12).length,
    }),
    [segments],
  );

  // Current subtitle based on playhead position
  const activeSubtitle = segments.find(
    (s) => s.start <= currentTime && currentTime <= s.end
  ) || segments.find((s) => s.id === selectedSegId);

  // [TSK-V014-WIRE-STUDIO] Câu cho chữ nhảy: chỉ câu đang phát theo thời gian; object ổn định giữa các khung
  // (đổi khi sang câu khác / sửa chữ) để KineticPreview không dựng lại wordTimings mỗi lần currentTime đổi.
  const kineticSegRef = useRef<(KineticSegment & { id: number }) | null>(null);
  {
    const s = segments.find((x) => x.start <= currentTime && currentTime <= x.end);
    const text = s ? (subtitleDisplayMode === "original" ? s.original : s.translated) : "";
    const cur = kineticSegRef.current;
    if (!s || !text) {
      if (cur) kineticSegRef.current = null;
    } else if (!cur || cur.id !== s.id || cur.text !== text || cur.start !== s.start || cur.end !== s.end) {
      kineticSegRef.current = { id: s.id, text, start: s.start, end: s.end };
    }
  }
  const v14Kinetic = v14.subStyle.mode === "kinetic" || v14.previewPreset !== null;

  // Timeline Action Handlers (EZMAX Standard)
  const handleSelectSegment = (seg: SubtitleItem) => {
    selectedTrackTypeRef.current = "subtitles";
    setSelectedSegId(seg.id);
    handleSeek(seg.start);
  };



  const handleFitTimeline = () => {
    // v0.11.3: Fit full media duration into view = zoom 100% (full video fit viewport)
    setZoomLevel(100);
  };

  const handleUpdateSegmentSpeaker = (segId: number, newSpeakerId: string) => {
    saveUndoHistory();
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, speakerId: newSpeakerId } : s))
    );
  };

  const handleNudgeSegment = (segId: number, field: "start" | "end", delta: number) => {
    saveUndoHistory();
    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== segId) return s;
        if (field === "start") {
          const newStart = Math.max(0, Math.min(s.end - 0.2, s.start + delta));
          return { ...s, start: Number(newStart.toFixed(2)) };
        } else {
          const newEnd = Math.max(s.start + 0.2, Math.min(mediaDuration, s.end + delta));
          return { ...s, end: Number(newEnd.toFixed(2)) };
        }
      })
    );
  };

  const handleUpdateTranslated = useCallback((segId: number, text: string) => {
    // [TSK-TIMELINE-INTEGRATE-MODULES] Track phụ đề bị khoá → chặn sửa chữ.
    if (isEditBlocked(trackLocksRef.current, "subtitles", "edit-text")) {
      showToast(editBlockedReason("subtitles", "edit-text"));
      return;
    }
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, translated: text } : s))
    );
  }, []);

  const handlePreFocusText = useCallback(() => {
    translationPreFocusRef.current = segmentsRef.current.map((s) => ({
      id: s.id,
      translated: s.translated,
    }));
  }, []);

  const handlePreviewSegmentTts = async (seg: SubtitleItem) => {
    const spk = speakers.find((s) => s.id === seg.speakerId);
    const rawVoice = spk?.voice || "kokoro:tuan_ngoc";
    // R6-05: chuẩn hóa voice id theo contract THẬT của backend `synthesize_speech` (dubbing/mod.rs:922-929).
    // Backend CHỈ parse prefix `kokoro:` → Kokoro local; MỌI THỨ KHÁC → Edge-TTS raw.
    // Vì vậy KHÔNG ĐƯỢC bịa thêm prefix `edge:` / `minimax:` / `azure:` / `google:` / `clone:` vì
    // backend không parse → Edge-TTS sẽ thử dùng raw làm voice name (fail).
    // Logic đúng:
    //   1. Đã có `kokoro:` → Kokoro local, giữ nguyên.
    //   2. Match BCP-47 (vd "vi-VN-HoaiMyNeural", "en-US-AriaNeural", "ja-JP-NanamiNeural") → Edge raw, giữ nguyên.
    //   3. Ngược lại → mặc định `kokoro:` (giả định là tên Kokoro viết tắt, vd "tuan_ngoc").
    const KOKORO_PREFIX = "kokoro:";
    // BCP-47: lang (2-3 chữ thường) + optional region (2 chữ hoa) + optional sub-tags (vd "-HoaiMyNeural")
    const BCP47_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?(-[a-zA-Z0-9-]+)*$/;
    const isKokoroPrefixed = rawVoice.startsWith(KOKORO_PREFIX);
    const isBcp47Voice = BCP47_PATTERN.test(rawVoice);
    const voice = isKokoroPrefixed || isBcp47Voice ? rawVoice : `kokoro:${rawVoice}`;

    setPreviewingSegId(seg.id);
    try {
      const isTauriEnv = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
      if (isTauriEnv) {
        // Câu dịch lỗi → không có bản dịch để nghe thử (không đọc nhãn lỗi,
        // cũng không đọc nhầm text gốc).
        if (seg.translateFailed) {
          showToast("⚠️ Câu này dịch lỗi nên chưa có bản dịch để nghe thử.");
          setPreviewingSegId(null);
          return;
        }
        stopVoicePlayback();
        if (previewAudioRef.current) {
          try {
            previewAudioRef.current.pause();
            previewAudioRef.current.currentTime = 0;
            previewAudioRef.current.removeAttribute("src");
            previewAudioRef.current.load();
          } catch {
            /* noop */
          }
        }
        const textToSpeak = (seg.translated || seg.original || "").trim();
        // [TSK-TABS-3.5] Chụp video TRƯỚC await → bỏ mẫu nếu đã đổi video.
        const startedPath = filePath;
        const wavData = await sublix.dubbingPreviewTts(textToSpeak, voice);
        if (!guardProject(startedPath)) {
          setPreviewingSegId(null);
          return;
        }
        if (wavData) {
          const audio = new Audio(wavData);
          previewAudioRef.current = audio;
          audio.onloadedmetadata = () => {
            const dur = audio.duration;
            if (dur && isFinite(dur) && dur > 0) {
              setSegments((prev) =>
                prev.map((s) => (s.id === seg.id ? { ...s, hasAudio: true, audioUrl: wavData, audioDuration: dur } : s))
              );
            }
          };
          setSegments((prev) =>
            prev.map((s) => (s.id === seg.id ? { ...s, hasAudio: true, audioUrl: wavData } : s))
          );
          await audio.play();
          showToast(`🎧 Đang phát câu thoại bằng giọng ${voice}`);
        }
      } else {
        // R4-03: KHÔNG phát beep giả — báo trung thực.
        showToast(`⚠ Chưa có mẫu giọng "${voice}" — bấm 🔊 Nghe giọng gốc để tạo.`);
      }
    } catch (err) {
      console.warn("Preview TTS error:", err);
      showToast(`⚠ Không thể nghe thử giọng: ${err}`);
    } finally {
      setPreviewingSegId(null);
    }
  };

  const handleVoiceBlockClick = async (seg: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => {
    if (timelineToolMode === "scrub") {
      handleTimelineClick(e);
      return;
    }
    e.stopPropagation();
    selectedTrackTypeRef.current = "voice";
    // handleSelectSegmentWithModifier đã tự dời playhead (click thường); Ctrl/Shift+click chỉ chọn nhiều, không seek/phát
    handleSelectSegmentWithModifier(seg, e);
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;

    if (isVoiceMutedRef.current) {
      showToast("⚠️ Track tiếng lồng đang tắt tiếng (Mute) — Bấm nút 'M' trên header để nghe lại");
      return;
    }

    if (seg.hasAudio && seg.audioUrl) {
      try {
        stopVoicePlayback();
        if (previewAudioRef.current) {
          try {
            previewAudioRef.current.pause();
            previewAudioRef.current.currentTime = 0;
            previewAudioRef.current.removeAttribute("src");
            previewAudioRef.current.load();
          } catch {
            /* noop */
          }
        }
        const audio = new Audio(seg.audioUrl);
        previewAudioRef.current = audio;
        await audio.play();
        showToast(`🎧 Đang phát lồng tiếng câu #${seg.id}`);
      } catch (err) {
        console.warn("Failed to play voice clip:", err);
      }
    } else {
      await handlePreviewSegmentTts(seg);
    }
  };

  const handleOpenExportModal = () => {
    if (!filePath) {
      showToast("⚠️ Vui lòng mở hoặc kéo thả video trước khi xuất video");
      return;
    }
    // [TSK-V014-WIRE-STUDIO] Chữ nhảy hoặc làm mờ phụ đề cứng chỉ có khi KHẮC CỨNG ⇒ chọn sẵn.
    if (v14.subStyle.mode === "kinetic" || v14.hardsub.enabled) setExportSubMode("hardsub");
    setShowExportModal(true);
  };

  /** [TSK-V014-WIRE-STUDIO] Lối tắt: mở tab Thuộc tính, cuộn tới thẻ và nháy viền 1 lần. */
  const goToV14Cards = () => {
    setShowExportModal(false);
    setRightTab("properties");
    window.setTimeout(() => {
      const el = document.getElementById("v14-cards");
      const first = el?.firstElementChild as HTMLElement | null;
      first?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      for (const c of Array.from(el?.children ?? [])) {
        c.classList.remove("v14-flash");
        void (c as HTMLElement).offsetWidth;
        c.classList.add("v14-flash");
      }
    }, 60);
  };

  const runExportImpl = async (): Promise<void> => {
    if (!filePath) {
      showToast("⚠️ Vui lòng mở hoặc kéo thả video trước khi xuất");
      return;
    }
    // [TSK-TABS-P2] Id lượt chạy của slot — lọc sự kiện + gửi xuống backend.
    const runId = slotRunIdRef.current ?? undefined;
    setShowExportModal(false);
    setIsExporting(true);
    setExportProgress(5);
    setExportMessage("Đang chuẩn bị kịch bản, phụ đề và audio tracks...");
    setExportDonePath("");

    let unlisten: (() => void) | null = null;
    try {
      // [TSK-V014-WIRE-STUDIO] Đã tích làm mờ mà chưa dò ⇒ tự dò trước khi xuất (không bao giờ chặn xuất:
      // dò lỗi thì xuất tiếp, không làm mờ). Gọi lồng trong slot đang giữ ⇒ chạy thẳng.
      if (v14.needsDetectBeforeExport()) {
        setExportMessage("Đang dò phụ đề cứng của video gốc...");
        await handleHardsubDetect("bottom");
      }
      const v14Cfg = v14.exportConfig();
      const project: DubbingProject = {
        input_path: filePath,
        media_duration_sec: mediaDuration,
        speakers: speakers.map((s) => ({
          id: s.id,
          label: s.name,
          voice: s.voice,
          pitch: "0Hz",
          rate: "0%",
          gender: s.gender,
          sample_audio_data: s.sampleAudio || null,
        })),
        segments: segments.map((seg) => ({
          id: seg.id,
          speaker_id: seg.speakerId,
          start_sec: seg.start,
          end_sec: seg.end,
          original_text: seg.original,
          dubbed_text: seg.translated,
          // Câu dịch lỗi → status "translate_failed" để backend BỎ QUA câu này
          // (không đọc nhãn lỗi, cũng không đọc lại text gốc).
          status: seg.translateFailed ? "translate_failed" : "ready",
        })),
        // Smart Ducking: backend dựng đường nền từ config; bgm_volume chỉ là mức khởi tạo khi config chưa có ducking_level.
        bgm_volume: duckParams.duckLevel,
        voice_volume: 1.0,
        sub_export_mode: exportSubMode,
        audio_export_mode: exportAudioMode,
        target_lang: targetLang || "vi",
        sub_style: v14Cfg.sub_style,
        hardsub: v14Cfg.hardsub,
      };

      unlisten = await listen<DubbingProgress>("dubbing:progress", (event) => {
        if (isForeignRun(event.payload.run_id, runId)) return;
        setExportProgress(event.payload.percent);
        setExportMessage(event.payload.message);
      });

      // [TSK-TABS-3.5] Chụp video TRƯỚC await → nếu đã đổi video thì không gắn kết quả
      // vào video mới, nhưng vẫn báo đường dẫn file đã xuất (file đúng của dự án cũ).
      const startedPath = filePath;
      const outPath = await sublix.dubbingExport(project, undefined, runId);
      if (staleProjectNotice(startedPath, filePathRef.current)) {
        showToast(`🎉 Đã xuất xong video cũ (${projectDisplayName(startedPath)}): ${outPath}`);
        return;
      }
      setExportProgress(100);
      setExportMessage("Xuất video thành công!");
      setExportDonePath(outPath);
      showToast("🎉 Xuất video hoàn tất!");
    } catch (err) {
      console.error("Export error:", err);
      showToast("❌ Lỗi xuất video: " + err);
    } finally {
      if (unlisten) unlisten();
      setIsExporting(false);
    }
  };

  // [TSK-TABS-P2] Xuất video cũng đi qua hàng đợi (cùng slot với bóc tách/dịch/TTS).
  const handleConfirmExportVideo = runHeavy("export", runExportImpl, (i) => i.exportVideo, undefined, {
    onQueued: () => {
      setShowExportModal(false);
      setIsExporting(true);
      setExportProgress(0);
      setExportDonePath("");
      setExportMessage("Đang chờ lượt…");
    },
    onStart: () => setIsExporting(false),
    onDropped: () => {
      setIsExporting(false);
      setExportMessage("");
    },
  });
  // Bản MỚI NHẤT của mọi thân việc nặng — job chờ lâu trong hàng sẽ dùng bản này.
  heavyImplsRef.current = {
    stt: runSttOnlyImpl,
    translate: runTranslateOnlyImpl,
    voice: runVoiceOnlyImpl,
    analysis: runAnalysisImpl,
    exportVideo: runExportImpl,
    hardsubDetect: v14.runDetectImpl,
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (didJustMarqueeRef.current) {
      e.stopPropagation();
      return;
    }
    const container = timelineTracksBodyRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft || 0;
    const clickX = e.clientX - rect.left + scrollLeft;
    const dur = Math.max(1, mediaDurationRef.current);
    const tw = timelineWidthRef.current || 1200;
    const newTime = Math.max(0, Math.min(dur, (clickX / tw) * dur));
    handleSeek(newTime);
  };

  // Callback ỔN ĐỊNH cho các khối memo (Note 1, AGENT_CHAT 2026-10-12: không truyền inline callback mới vào props khối).
  // Logic thật nằm trong blockApiRef.current (gán lại mỗi render) → khối không re-render chỉ vì parent render.
  interface TimelineBlockApi {
    subClick: (seg: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => void;
    voiceClick: (seg: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => void;
    subDown: (seg: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => void;
    voiceDown: (seg: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => void;
    nudge: (segId: number, field: "start" | "end", delta: number) => void;
  }
  const blockApiRef = useRef<TimelineBlockApi | null>(null);
  blockApiRef.current = {
    subClick: (s, e) => {
      if (didJustMarqueeRef.current) {
        e.stopPropagation();
        return;
      }
      if (timelineToolMode === "scrub") {
        handleTimelineClick(e);
        return;
      }
      e.stopPropagation();
      selectedTrackTypeRef.current = "subtitles";
      handleSelectSegmentWithModifier(s, e);
    },
    voiceClick: (s, e) => {
      if (didJustMarqueeRef.current) {
        e.stopPropagation();
        return;
      }
      void handleVoiceBlockClick(s, e);
    },
    subDown: (s, e) => handleBlockMouseDown(s, e, "subtitles"),
    voiceDown: (s, e) => handleBlockMouseDown(s, e, "voice"),
    nudge: (segId, field, delta) => {
      if (didJustMarqueeRef.current) return; // click sinh ra sau khi kéo mép → không nhích thêm
      handleNudgeSegment(segId, field, delta);
    },
  };
  const stableSubClick = useCallback(
    (s: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => blockApiRef.current?.subClick(s, e),
    []
  );
  const stableVoiceClick = useCallback(
    (s: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => blockApiRef.current?.voiceClick(s, e),
    []
  );
  const stableSubDown = useCallback(
    (s: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => blockApiRef.current?.subDown(s, e),
    []
  );
  const stableVoiceDown = useCallback(
    (s: SubtitleItem, e: React.MouseEvent<HTMLDivElement>) => blockApiRef.current?.voiceDown(s, e),
    []
  );
  const stableNudge = useCallback(
    (segId: number, field: "start" | "end", delta: number) => blockApiRef.current?.nudge(segId, field, delta),
    []
  );

  // Dọn transform/style tạm của lần kéo thả ngay sau khi React commit vị trí mới (trước khi trình duyệt vẽ → không nháy)
  useLayoutEffect(() => {
    const f = dragCleanupRef.current;
    if (f) {
      dragCleanupRef.current = null;
      f();
    }
  }, [segments]);

  // Unmount giữa lúc đang kéo → gỡ listener window
  useEffect(() => {
    return () => {
      dragAbortRef.current?.();
    };
  }, []);

  // Dynamic WPM & Timing stats for Review Panel
  const totalSpeechSeconds = segments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);
  const totalWords = segments.reduce((sum, seg) => {
    const text = (seg.translated || seg.original || "").trim();
    return sum + (text ? text.split(/\s+/).length : 0);
  }, 0);
  const calculatedWpm = totalSpeechSeconds > 0 ? Math.round(totalWords / (totalSpeechSeconds / 60)) : 0;


  // ══════════════════════════════════════════════════════════════════════════
  // R2-3 — Panel quy trình 5 bước (src/views/studio/StudioPipelinePanel.tsx)
  //
  // - `pipelineState`: useMemo theo đúng field → identity đổi khi state đổi
  //   (timeline phát ở 60fps KHÔNG làm panel re-render).
  // - `pipelineApi`: object có identity ỔN ĐỊNH (ref + Object.assign) → memo
  //   của panel không bị phá vỡ, không truyền `currentTime` vào panel.
  // ══════════════════════════════════════════════════════════════════════════

  /** Bước đang mở trong accordion của panel (chỉ 1 bước mở tại 1 thời điểm). */
  const [pipelineOpenStep, setPipelineOpenStep] = useState<PipelineOpenStep>("voice");

  /**
   * TSK-STUDIO-MODEL-PICKER — nạp model dịch + mức suy luận từ backend.
   * - Lệnh chưa tồn tại (backend cũ) → `translateOptionsUnavailable = true`
   *   → panel hiện trạng thái dự phòng (chỉ đọc), KHÔNG crash.
   * - Nghe `config:updated` để đồng bộ với Cài đặt (đổi model ở 2 nơi vẫn khớp).
   */
  const loadTranslateOptions = useCallback(async () => {
    try {
      const options = await fetchTranslateOptions();
      setTranslateOptions(options);
      setTranslateOptionsUnavailable(false);
    } catch (err) {
      const message = String(err);
      if (/not found|unknown command|not allowed/i.test(message)) {
        setTranslateOptionsUnavailable(true);
      } else {
        console.warn("Không lấy được tuỳ chọn model dịch:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;
    setTranslateOptionsLoading(true);
    void loadTranslateOptions().finally(() => setTranslateOptionsLoading(false));

    let unlisten: (() => void) | null = null;
    let alive = true;
    void listen("config:updated", () => {
      if (alive) void loadTranslateOptions();
    })
      .then((fn) => {
        if (alive) unlisten = fn;
        else fn();
      })
      .catch((err) => console.warn("Nghe config:updated thất bại:", err));

    return () => {
      alive = false;
      if (unlisten) unlisten();
    };
  }, [isActive, loadTranslateOptions]);

  /** Đổi model dịch → ghi NGAY vào config (không có nút Lưu). */
  const handleSelectTranslateModel = useCallback(
    async (modelId: string, provider: string) => {
      try {
        await saveTranslateOptions({ provider, model: modelId });
        setTranslateOptions((prev) =>
          prev ? { ...prev, provider, model: modelId } : prev,
        );
        showToast(`🧠 Đã đổi model dịch: ${modelId}`);
      } catch (err) {
        showToast(`⚠️ Không đổi được model: ${String(err)}`);
      }
    },
    [],
  );

  /** Đổi mức suy luận → ghi NGAY vào config. */
  const handleSelectReasoningEffort = useCallback(async (effort: ReasoningEffort) => {
    try {
      await saveTranslateOptions({ reasoningEffort: effort });
      setTranslateOptions((prev) => (prev ? { ...prev, reasoning_effort: effort } : prev));
      showToast(`🧠 Mức suy luận: ${effort}`);
    } catch (err) {
      showToast(`⚠️ Không đổi được mức suy luận: ${String(err)}`);
    }
  }, []);

  /** Provider đã có API key chưa (chỉ trả true/false — KHÔNG trả key ra UI). */
  const handleHasProviderKey = useCallback(
    (provider: string): boolean => {
      switch (provider) {
        case "minimax":
          return minimaxKey.trim().length > 0;
        case "deepseek":
          return deepseekKey.trim().length > 0;
        case "openrouter":
          return openrouterKey.trim().length > 0;
        default:
          return true; // local / provider không cần key
      }
    },
    [minimaxKey, deepseekKey, openrouterKey],
  );

  // ── ƯỚC TÍNH THỜI GIAN TỪNG BƯỚC (tự học từ tốc độ thật của máy người dùng)
  /** Tốc độ đo được (đọc từ localStorage). */
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({});
  /** Mốc bắt đầu lần chạy hiện tại (ms). */
  const runStartedAtRef = useRef<number>(0);
  /** Tiến độ thật gần nhất (để lưu tốc độ khi chạy xong). */
  const lastLiveRef = useRef<{ stepId: "stt" | "translate" | "tts"; done: number; total: number } | null>(null);
  /** Ref để effect lưu tốc độ không bị stale closure. */
  const translateOptionsRef = useRef<TranslateOptions | null>(null);
  translateOptionsRef.current = translateOptions;
  const selectedTtsEngineRef = useRef<TtsEngineKey>(selectedTtsEngine);
  selectedTtsEngineRef.current = selectedTtsEngine;

  useEffect(() => {
    try {
      setRateOverrides(loadRateOverrides(window.localStorage));
    } catch {
      /* localStorage bị chặn → dùng số mặc định */
    }
  }, []);

  // ── [TSK-STUDIO-WIRE-CTX-STT] Engine STT + dịch theo ngữ cảnh ──────────────
  /** Catalog engine nhận dạng (nguồn: backend `stt_engines_status`). */
  const [sttEngines, setSttEngines] = useState<PanelSttEngine[]>([]);
  /** Engine STT đang chọn (backend lưu trong config). */
  const [sttSelectedEngineId, setSttSelectedEngineId] = useState<string>("");
  /** Tiến trình tải model STT (sự kiện `model:download-progress`). */
  const [sttDownloadProgress, setSttDownloadProgress] =
    useState<ModelDownloadProgressState | null>(null);
  /** Phase dịch theo ngữ cảnh (sự kiện `translate:progress`). */
  const [translatePhase, setTranslatePhase] = useState<string | null>(null);
  /** Bật/tắt dịch theo ngữ cảnh — lưu THEO PROVIDER trong localStorage. */
  const [contextualFlags, setContextualFlags] = useState<Record<string, boolean>>({});

  /** Tiền tố key lưu cờ dịch theo ngữ cảnh (mỗi provider một cờ). */
  const CONTEXTUAL_FLAG_PREFIX = "sublix_contextual_translate_";

  /** Provider dịch đang dùng (ưu tiên giá trị backend trả về). */
  const translateProvider = translateOptions?.provider || transProvider;

  /** Đọc cờ dịch theo ngữ cảnh đã lưu (mỗi provider một cờ). */
  useEffect(() => {
    try {
      const flags: Record<string, boolean> = {};
      for (const provider of ["openrouter", "deepseek", "ollama", "gguf", "minimax", "local"]) {
        const raw = localStorage.getItem(`${CONTEXTUAL_FLAG_PREFIX}${provider}`);
        if (raw === "1") flags[provider] = true;
        else if (raw === "0") flags[provider] = false;
      }
      setContextualFlags(flags);
    } catch {
      /* localStorage bị chặn → dùng mặc định theo provider */
    }
  }, []);

  /** Cờ "dịch theo ngữ cảnh" của provider hiện tại (mặc định theo provider). */
  const contextualTranslate = useMemo(() => {
    const saved = contextualFlags[translateProvider];
    if (saved !== undefined) return saved;
    return contextualDefaultOn(translateProvider);
  }, [contextualFlags, translateProvider]);

  /** Nạp catalog engine STT từ backend. */
  const loadSttEngines = useCallback(async () => {
    try {
      const list = await sublix.sttEnginesStatus();
      const mapped: PanelSttEngine[] = list.map((engine) => ({
        id: engine.id,
        name: engine.name,
        label: engine.label,
        family: engine.family,
        languages: engine.languages ?? [],
        langLabel: engine.lang_label,
        desc: engine.desc,
        sizeNote: engine.size_note,
        license: engine.license,
        rtfNote: engine.rtf_note,
        downloaded: engine.downloaded,
        progressPct: engine.progress_pct,
        error: engine.error,
        selected: engine.selected,
      }));
      setSttEngines(mapped);
      const selected = mapped.find((engine) => engine.selected);
      setSttSelectedEngineId(selected ? selected.id : (mapped[0]?.id ?? ""));
    } catch (err) {
      console.warn("Không lấy được catalog engine STT:", err);
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;
    void loadSttEngines();
  }, [isActive, loadSttEngines]);

  // Tiến trình tải model (STT) + phase dịch theo ngữ cảnh.
  useEffect(() => {
    if (!isActive) return;
    let alive = true;
    let unlistenProgress: (() => void) | null = null;

    void listen<ModelDownloadProgressState>("model:download-progress", (event) => {
      if (!alive) return;
      const payload = event.payload;
      if (payload.kind !== "stt") return;
      setSttDownloadProgress(payload);
      if (payload.phase === "done" || payload.phase === "error") {
        setSttDownloadProgress(null);
        void loadSttEngines();
      }
    })
      .then((fn) => {
        if (alive) unlistenProgress = fn;
        else fn();
      })
      .catch((err) => console.warn("Nghe model:download-progress thất bại:", err));

    return () => {
      alive = false;
      if (unlistenProgress) unlistenProgress();
    };
  }, [isActive, loadSttEngines]);

  // [TSK-TABS-P2] Phase dịch theo ngữ cảnh: KHÔNG còn cổng `isActive` (tab nền vẫn
  // nhận tiến độ của việc đang chạy) — lọc theo `run_id` của slot mình thay thế.
  useEffect(() => {
    let alive = true;
    let unlistenTranslate: (() => void) | null = null;
    void listen<TranslateProgress>("translate:progress", (event) => {
      if (!alive) return;
      const payload = event.payload;
      if (isForeignRun(payload.run_id, slotRunIdRef.current ?? undefined)) return;
      if (payload.run_id && !slotRunIdRef.current) return; // lượt của instance khác
      if (payload.phase === "reading") {
        setTranslatePhase("🧠 Đọc hiểu kịch bản trước khi dịch…");
      } else if (payload.phase === "translating") {
        setTranslatePhase(`🌐 Đang dịch theo ngữ cảnh ${payload.done}/${payload.total} câu`);
      } else {
        setTranslatePhase(null);
      }
    })
      .then((fn) => {
        if (alive) unlistenTranslate = fn;
        else fn();
      })
      .catch((err) => console.warn("Nghe translate:progress thất bại:", err));
    return () => {
      alive = false;
      if (unlistenTranslate) unlistenTranslate();
    };
  }, []);

  /** Chọn engine STT → lưu config ngay (không có nút Lưu). */
  const handleSelectSttEngine = useCallback(async (engineId: string) => {
    try {
      await sublix.sttSetEngine(engineId);
      setSttSelectedEngineId(engineId);
      showToast(`🎙️ Đã chọn engine nhận dạng: ${engineId}`);
      void loadSttEngines();
    } catch (err) {
      showToast(`⚠️ Không đổi được engine nhận dạng: ${String(err)}`);
    }
  }, [loadSttEngines]);

  /** Tải model của engine STT. */
  const handleDownloadSttModel = useCallback(async (engineId: string) => {
    try {
      setSttDownloadProgress({
        model_id: engineId,
        kind: "stt",
        phase: "downloading",
        bytes_done: 0,
        bytes_total: 0,
        speed_bps: 0,
        eta_s: null,
        file: null,
        message: "Đang tải model…",
      });
      await sublix.sttModelDownload(engineId);
    } catch (err) {
      setSttDownloadProgress(null);
      showToast(`⚠️ Không tải được model: ${String(err)}`);
    }
  }, []);

  /** Hủy tải model STT. */
  const handleCancelSttModelDownload = useCallback(async (engineId: string) => {
    try {
      await sublix.sttModelCancel(engineId);
    } catch (err) {
      console.warn("Hủy tải model STT thất bại:", err);
    }
    setSttDownloadProgress(null);
  }, []);

  /** Bật/tắt dịch theo ngữ cảnh — lưu theo provider trong localStorage. */
  const handleSetContextualTranslate = useCallback(
    (value: boolean) => {
      const provider = translateProvider;
      setContextualFlags((prev) => ({ ...prev, [provider]: value }));
      try {
        localStorage.setItem(`${CONTEXTUAL_FLAG_PREFIX}${provider}`, value ? "1" : "0");
      } catch {
        /* localStorage bị chặn → chỉ giữ trong phiên */
      }
      showToast(
        value
          ? "🧠 Bật dịch theo ngữ cảnh (đọc hiểu kịch bản trước khi dịch)"
          : "🌐 Tắt dịch theo ngữ cảnh — dịch theo lô, nhanh hơn",
      );
    },
    [translateProvider],
  );

  /** Ước tính thời gian từng bước (có tính engine STT + chế độ ngữ cảnh). */
  const pipelineEstimates = useMemo(() => {
    const audioDurationSec = segments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);
    const { steps } = buildEstimates({
      mediaDurationSec: mediaDuration,
      audioDurationSec,
      segmentCount: segments.length,
      // [UI_R2-8_REVIEW mục 3] Nhãn phải theo ENGINE ĐANG CHỌN (trước: nhánh cứng
      // "base" ? "Whisper base" : "Whisper Large-v3-Turbo" ⇒ sai khi chọn SenseVoice).
      sttModel:
        sttEngines.find((engine) => engine.id === sttSelectedEngineId)?.label ??
        (sttModel === "base" ? "Whisper base" : "Whisper Large-v3-Turbo"),
      sttEngineId: sttSelectedEngineId || "whisper",
      sttRtfNote: sttEngines.find((engine) => engine.id === sttSelectedEngineId)?.rtfNote,
      sourceLang: sttLang,
      translateModel: translateOptions?.model || "Ollama qwen2.5:3b",
      reasoningEffort: translateOptions?.reasoning_effort || "auto",
      contextualTranslate,
      ttsEngine: selectedTtsEngine,
      overrides: rateOverrides,
    });
    return steps.filter((step) => {
      if (step.id === "stt") return workflowOptStt;
      if (step.id === "translate") return workflowOptTranslate;
      return workflowOptVoice;
    });
  }, [
    segments,
    mediaDuration,
    sttModel,
    sttLang,
    sttEngines,
    sttSelectedEngineId,
    translateOptions,
    contextualTranslate,
    selectedTtsEngine,
    rateOverrides,
    workflowOptStt,
    workflowOptTranslate,
    workflowOptVoice,
  ]);

  /** Tiến độ THẬT của bước đang chạy (đọc từ thông điệp tiến trình). */
  const pipelineLiveProgress = useMemo(() => {
    if (!isAnalyzing) return null;
    const msg = analyzeMessage || "";
    const ratio = /(\d+)\s*\/\s*(\d+)/.exec(msg);
    const done = ratio ? Number(ratio[1]) : 0;
    const total = ratio ? Number(ratio[2]) : 0;
    let stepId: "stt" | "translate" | "tts" = "translate";
    if (/whisper|nhận dạng|stt/i.test(msg)) stepId = "stt";
    else if (/giọng|tts|lồng tiếng/i.test(msg)) stepId = "tts";
    const elapsedSec = runStartedAtRef.current > 0 ? (Date.now() - runStartedAtRef.current) / 1000 : 0;
    lastLiveRef.current = { stepId, done, total };
    const estimate = pipelineEstimates.find((item) => item.id === stepId);
    const progress = computeLiveProgress(done, total, elapsedSec, estimate?.seconds ?? 0);
    return { stepId, text: formatLiveProgress(progress) };
  }, [isAnalyzing, analyzeMessage, pipelineEstimates]);

  /* =========================================================================
     [TSK-STUDIO-GLOSSARY] BẢNG THUẬT NGỮ + XƯNG HÔ (đã duyệt)
     -------------------------------------------------------------------------
     - Nạp: `glossary_get(projectPath)` — file dự án (`<video>.sublix-glossary.json`),
       không có thì fallback bảng toàn cục trong config.
     - Ghi: `glossary_set(projectPath, g)` — **debounce ~400ms**, KHÔNG có nút Lưu.
     - Gợi ý: `glossary_suggest` — 1 lượt "đọc hiểu", **KHÔNG tự ghi** (người dùng ✓).
     ========================================================================= */
  /** Bảng hiện tại (ref — handler gọi từ menu chuột phải, không đóng state). */
  const glossaryRef = useRef<Glossary | null>(glossary);
  glossaryRef.current = glossary;
  /** Timer debounce lưu bảng (~400ms). */
  const glossarySaveTimerRef = useRef<number | null>(null);
  /** Bảng đang chờ ghi xuống đĩa + project của nó (chốt lúc sửa — đổi file trong lúc
   *  debounce không được ghi nhầm bảng cũ sang file mới). */
  const glossaryPendingRef = useRef<{ glossary: Glossary; path: string | undefined } | null>(null);

  /** Đường dẫn "project" của bảng glossary (file cạnh video/SRT). */
  const glossaryProjectPath = filePath?.trim() || undefined;
  const glossaryProjectPathRef = useRef<string | undefined>(glossaryProjectPath);
  glossaryProjectPathRef.current = glossaryProjectPath;

  /** Nạp bảng thuật ngữ của project khi mở file (file dự án → fallback toàn cục). */
  useEffect(() => {
    const path = filePath?.trim();
    if (!path) {
      setGlossary(null);
      return;
    }
    let cancelled = false;
    void sublix
      .glossaryGet(path)
      .then((g) => {
        if (cancelled) return;
        setGlossary(normalizeGlossary(g));
      })
      .catch((err) => {
        console.warn("Không đọc được bảng thuật ngữ:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  /** Ghi bảng xuống đĩa (backend ghi atomic). Dòng nháp (trống) bị bỏ trước khi ghi. */
  const persistGlossary = async (next: Glossary | null, path: string | undefined) => {
    if (!next) return;
    try {
      const saved = await sublix.glossarySet(path, stripBlankRows(normalizeGlossary(next)));
      // Chỉ cập nhật scope/path khi vẫn đang mở đúng project vừa ghi.
      if (path !== glossaryProjectPathRef.current) return;
      setGlossary((prev) => (prev ? { ...prev, scope: saved.scope, path: saved.path ?? null } : prev));
    } catch (err) {
      console.warn("Không lưu được bảng thuật ngữ:", err);
      showToast("⚠️ Không lưu được bảng thuật ngữ — thử lại sau.");
    }
  };

  /** Bảng đổi → lưu ngay (debounce ~400ms). */
  const handleGlossaryChange = (next: Glossary) => {
    const normalized = normalizeGlossary(next);
    setGlossary(normalized);
    glossaryPendingRef.current = { glossary: normalized, path: glossaryProjectPathRef.current };
    if (glossarySaveTimerRef.current !== null) {
      window.clearTimeout(glossarySaveTimerRef.current);
    }
    glossarySaveTimerRef.current = window.setTimeout(() => {
      glossarySaveTimerRef.current = null;
      const pending = glossaryPendingRef.current;
      glossaryPendingRef.current = null;
      if (pending) void persistGlossary(pending.glossary, pending.path);
    }, 400);
  };

  /** Bấm "Lưu" trong editor → ghi ngay (không chờ debounce). */
  const handleGlossarySave = (next: Glossary) => {
    const normalized = normalizeGlossary(next);
    setGlossary(normalized);
    glossaryPendingRef.current = null;
    if (glossarySaveTimerRef.current !== null) {
      window.clearTimeout(glossarySaveTimerRef.current);
      glossarySaveTimerRef.current = null;
    }
    void persistGlossary(normalized, glossaryProjectPathRef.current);
  };

  /** Tải app / đóng Studio → ghi nốt thay đổi đang chờ debounce (không mất dữ liệu). */
  useEffect(() => {
    return () => {
      if (glossarySaveTimerRef.current !== null) {
        window.clearTimeout(glossarySaveTimerRef.current);
        glossarySaveTimerRef.current = null;
      }
      const pending = glossaryPendingRef.current;
      glossaryPendingRef.current = null;
      if (pending) void persistGlossary(pending.glossary, pending.path);
    };
  }, []);

  /** "Gợi ý từ kịch bản" — 1 lượt đọc hiểu; **KHÔNG tự ghi** (người dùng duyệt ✓). */
  const handleGlossarySuggest = async (): Promise<GlossarySuggestion | null> => {
    const segs = segmentsRef.current;
    if (segs.length === 0) {
      showToast("ℹ️ Chưa có câu thoại nào — hãy bóc tách phụ đề trước khi xin gợi ý.");
      return null;
    }
    const speakerNames = new Map(speakersRef.current.map((spk) => [spk.id, spk.name]));
    const lines: ScriptLine[] = segs.map((seg) => ({
      id: String(seg.id),
      speakerId: seg.speakerId,
      speakerName: speakerNames.get(seg.speakerId),
      text: seg.original,
      start: seg.start,
      end: seg.end,
    }));
    // Ước tính: 1 lượt đọc hiểu ≈ 1/2 bước "Dịch theo ngữ cảnh" (2 lượt).
    const ctxSeconds = pipelineEstimates.find((item) => item.id === "translate")?.seconds ?? 0;
    const estimateSec = estimateGlossarySuggestSeconds(ctxSeconds);
    setGlossarySuggesting(true);
    setGlossarySuggestEstimateSec(estimateSec);
    showToast(
      `📖 Đang đọc hiểu ${lines.length} câu để gợi ý thuật ngữ (ước tính ~${formatDuration(estimateSec)})…`,
    );
    try {
      // [TSK-TABS-3.5] Chụp video TRƯỚC await → gợi ý của video cũ thì bỏ.
      const startedPath = filePath;
      const suggestion = await sublix.glossarySuggest(
        lines,
        sttLang === "auto" ? "auto" : sttLang,
        targetLang,
      );
      if (!guardProject(startedPath)) return null;
      const diff = diffGlossarySuggestion(glossaryRef.current, suggestion);
      const fresh = diff.newTerms.length + diff.newPronouns.length;
      showToast(
        fresh > 0
          ? `📖 Gợi ý xong: ${diff.newTerms.length} thuật ngữ mới · ${diff.newPronouns.length} quy tắc xưng hô mới — bấm ✓ để nhận.`
          : "📖 Gợi ý xong — không có mục mới so với bảng hiện tại.",
      );
      return suggestion;
    } catch (err) {
      console.warn("Không lấy được gợi ý thuật ngữ:", err);
      showToast("⚠️ Không lấy được gợi ý thuật ngữ — kiểm tra kết nối mô hình.");
      return null;
    } finally {
      setGlossarySuggesting(false);
    }
  };
  /** Khi 1 lần chạy kết thúc → lưu tốc độ THẬT vào localStorage (tự học). */
  useEffect(() => {
    if (isAnalyzing) {
      if (runStartedAtRef.current === 0) runStartedAtRef.current = Date.now();
      return;
    }
    if (runStartedAtRef.current === 0) return;
    const elapsed = (Date.now() - runStartedAtRef.current) / 1000;
    const live = lastLiveRef.current;
    runStartedAtRef.current = 0;
    lastLiveRef.current = null;
    if (!live || live.done <= 0 || elapsed <= 0) return;
    const secPerUnit = elapsed / live.done;
    const key =
      live.stepId === "translate"
        ? rateKey(
            "translate",
            `${translateOptionsRef.current?.model ?? ""}:${translateOptionsRef.current?.reasoning_effort ?? "auto"}`,
          )
        : live.stepId === "tts"
        ? rateKey("tts", selectedTtsEngineRef.current)
        : null;
    if (!key) return;
    try {
      if (saveRateOverride(window.localStorage, key, secPerUnit)) {
        setRateOverrides(loadRateOverrides(window.localStorage));
      }
    } catch {
      /* bỏ qua */
    }
  }, [isAnalyzing]);

  /** Nạp trạng thái engine TTS + danh mục giọng đọc TỪ BACKEND. */
  useEffect(() => {
    if (!isActive) return;
    let alive = true;
    const load = async () => {
      try {
        const status = await sublix.ttsEnginesStatus();
        if (alive && status?.engines) setTtsEngines(status.engines);
      } catch (err) {
        console.warn("Không lấy được trạng thái engine TTS:", err);
      }
      try {
        const voices = await sublix.dubbingGetVoices();
        if (alive && Array.isArray(voices)) setVoicePresets(voices);
      } catch (err) {
        console.warn("Không lấy được danh mục giọng TTS:", err);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [isActive]);

  /** Danh sách engine dạng panel (nguồn: backend). */
  const panelEngines = useMemo<PanelEngine[]>(
    () =>
      ttsEngines.map((e) => ({
        id: e.id,
        prefix: e.prefix,
        kind: e.kind,
        modelId: e.model_id,
        installed: e.installed,
        deps: e.deps,
        needsKey: e.needs_key,
        hasKey: e.has_key,
        ready: e.ready,
        hint: e.hint,
      })),
    [ttsEngines],
  );

  /** Giọng đọc của engine đang chọn (nguồn: backend). */
  const panelVoiceOptions = useMemo<PanelVoiceOption[]>(
    () =>
      voicesForEngine(selectedTtsEngine).map((v) => ({
        id: v.id,
        label: v.name,
        gender: v.gender,
      })),
    [voicesForEngine, selectedTtsEngine],
  );

  /** Vai diễn dạng panel. */
  const panelRoles = useMemo<PanelRole[]>(
    () =>
      speakers.map((s) => ({
        id: s.id,
        name: s.name,
        gender: s.gender,
        color: s.color,
        voice: s.voice,
        count: s.count,
      })),
    [speakers],
  );

  /** Nhãn nhà cung cấp dịch — CHỈ ĐỌC (R2-4: cấu hình ở Cài đặt). */
  const providerLabel = useMemo(() => {
    const names: Record<string, string> = {
      ollama: "Ollama",
      deepseek: "DeepSeek",
      openrouter: "OpenRouter",
      minimax: "minimax",
      local: "Dịch cục bộ",
    };
    const name = names[transProvider] ?? transProvider;
    const model =
      transProvider === "deepseek"
        ? deepseekModel
        : transProvider === "openrouter"
        ? openrouterModel
        : transProvider === "minimax"
        ? minimaxModel
        : transProvider === "ollama"
        ? ollamaModel
        : "";
    return model ? `${name} · ${model}` : name;
  }, [transProvider, deepseekModel, openrouterModel, minimaxModel, ollamaModel]);

  /** Gộp vai A vào vai B (thay cho modal "Gộp vai..." cũ). */
  const handleMergeRoleInto = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = speakers.find((s) => s.id === fromId);
    const to = speakers.find((s) => s.id === toId);
    if (!from || !to) return;
    saveSubtitleUndo();
    saveAudioUndo();
    setSegments((prev) =>
      prev.map((seg) => (seg.speakerId === fromId ? { ...seg, speakerId: toId } : seg)),
    );
    setSpeakers((prev) => prev.filter((s) => s.id !== fromId));
    showToast(`⇢ Đã gộp vai "${from.name}" vào "${to.name}".`);
  };

  /** Thêm 1 vai diễn mới. */
  const handleAddRole = () => {
    saveAudioUndo();
    setSpeakers((prev) => [
      ...prev,
      {
        id: `speaker_${prev.length}`,
        name: `Nhân vật ${prev.length + 1}`,
        gender: "male" as const,
        color: SPEAKER_COLORS[prev.length % SPEAKER_COLORS.length],
        voice: defaultVoiceForEngine(selectedTtsEngine, "male"),
        count: 0,
      },
    ]);
    showToast("➕ Đã thêm vai diễn mới");
  };

  /** Đổi tên vai. */
  const handleRenameRole = (roleId: string, name: string) => {
    setSpeakers((prev) => prev.map((s) => (s.id === roleId ? { ...s, name } : s)));
  };

  /** Gán giọng cho vai. */
  const handleSetRoleVoice = (roleId: string, voice: string) => {
    saveAudioUndo();
    setSpeakers((prev) => prev.map((s) => (s.id === roleId ? { ...s, voice } : s)));
  };

  /** Bật/tắt giới tính của 1 vai (đổi kèm giọng theo giới tính). */
  const handleToggleRoleGender = (roleId: string) => {
    const idx = speakers.findIndex((s) => s.id === roleId);
    if (idx >= 0) handleToggleSpeakerGender(idx);
  };

  /** Tải model của engine TTS (offline). */
  const handleDownloadEngineModel = async (engineId: string) => {
    const info = ttsEngines.find((e) => e.id === engineId);
    if (!info?.model_id) {
      showToast("⚠️ Engine này không có model để tải.");
      return;
    }
    setTtsEngineDownloading(engineId);
    setTtsEngineDownloadPct(0);
    try {
      await sublix.voiceModelDownload(info.model_id);
      showToast(`✅ Đã tải model ${info.model_id}.`);
      const status = await sublix.ttsEnginesStatus();
      if (status?.engines) setTtsEngines(status.engines);
    } catch (err) {
      showToast(`⚠️ Không tải được model: ${String(err)}`);
    } finally {
      setTtsEngineDownloading(null);
      setTtsEngineDownloadPct(null);
    }
  };

  /** Bật/tắt ghim ★ một giọng: đọc config MỚI NHẤT từ đĩa → gộp (giữ API key) → lưu → cập nhật state. */
  const handleToggleFavoriteVoice = async (voiceId: string) => {
    try {
      const latest = (await sublix.getConfig()) as unknown as Record<string, unknown>;
      const current = Array.isArray(latest.favorite_voices) ? (latest.favorite_voices as string[]) : [];
      const next = current.includes(voiceId) ? current.filter((id) => id !== voiceId) : [...current, voiceId];
      await sublix.saveConfig(mergeConfig({ latest, patch: { favorite_voices: next } }) as unknown as AppConfig);
      setFavoriteVoices(next);
    } catch (err) {
      showToast(`⚠️ Không lưu được giọng ghim: ${String(err)}`);
    }
  };

  /** Dừng mẫu giọng đang phát/đang tạo (huỷ cả kết quả tạo mẫu về muộn). */
  const handleStopVoicePreview = () => {
    voicePreviewTokenRef.current += 1;
    const audio = voicePreviewAudioRef.current;
    voicePreviewAudioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    setPreviewVoiceId(null);
    setPreviewVoiceStatus(null);
  };

  /** Nghe mẫu 1 giọng (cache của backend, câu mẫu chung — KHÔNG đổi giọng của vai). Mỗi lần 1 mẫu. */
  const handlePreviewVoiceSample = async (voiceId: string) => {
    handleStopVoicePreview();
    // Dừng các nghe thử khác để chỉ có 1 âm thanh mẫu tại 1 thời điểm.
    for (const ref of [currentAudioPreviewRef, engineSampleAudioRef]) {
      if (ref.current) {
        ref.current.pause();
        ref.current = null;
      }
    }
    setPlayingAudioSpkId(null);
    setPlayingEngineSample(null);
    const token = voicePreviewTokenRef.current;
    setPreviewVoiceId(voiceId);
    setPreviewVoiceStatus("loading");
    try {
      const dataUri = await sublix.voiceSampleEnsureUrl(voiceId);
      if (token !== voicePreviewTokenRef.current) return; // đã bị dừng / thay bằng mẫu khác
      if (!dataUri) {
        showToast("⚠️ Chưa tạo được mẫu cho giọng này (engine chưa sẵn sàng?)");
        setPreviewVoiceId(null);
        setPreviewVoiceStatus(null);
        return;
      }
      const audio = new Audio(dataUri);
      voicePreviewAudioRef.current = audio;
      const finish = () => {
        if (token !== voicePreviewTokenRef.current) return;
        voicePreviewAudioRef.current = null;
        setPreviewVoiceId(null);
        setPreviewVoiceStatus(null);
      };
      audio.onended = finish;
      audio.onerror = finish;
      setPreviewVoiceStatus("playing");
      await audio.play();
    } catch (err) {
      if (token === voicePreviewTokenRef.current) {
        showToast(`⚠️ Không phát được mẫu giọng: ${String(err)}`);
        handleStopVoicePreview();
      }
    }
  };

  /** Smart Ducking: kéo thanh → xem thử đổi NGAY, config lưu sau 400 ms yên (gộp các field, không nút Lưu). */
  const handleSetDuckingField = (field: "ducking_level" | "ducking_bridge_sec", value: number) => {
    setDuckParams((prev) =>
      field === "ducking_level" ? { ...prev, duckLevel: value } : { ...prev, bridgeGapSec: value },
    );
    pendingDuckPatchRef.current = { ...pendingDuckPatchRef.current, [field]: value };
    if (duckSaveTimerRef.current !== null) window.clearTimeout(duckSaveTimerRef.current);
    duckSaveTimerRef.current = window.setTimeout(() => {
      duckSaveTimerRef.current = null;
      const patch = pendingDuckPatchRef.current;
      void (async () => {
        try {
          const latest = (await sublix.getConfig()) as unknown as Record<string, unknown>;
          await sublix.saveConfig(mergeConfig({ latest, patch }) as unknown as AppConfig);
        } catch (err) {
          showToast(`⚠️ Không lưu được tham số hạ tiếng nền: ${String(err)}`);
        } finally {
          // Chỉ xoá các field vừa lưu — nếu người dùng kéo tiếp trong lúc lưu thì giữ lại để lượt sau lưu.
          const rest = { ...pendingDuckPatchRef.current };
          for (const [k, v] of Object.entries(patch)) if (rest[k] === v) delete rest[k];
          pendingDuckPatchRef.current = rest;
        }
      })();
    }, 400);
  };

  // Rời Studio: dừng mẫu đang phát và xoá hẹn giờ lưu.
  useEffect(() => {
    return () => {
      voicePreviewTokenRef.current += 1;
      voicePreviewAudioRef.current?.pause();
      if (duckSaveTimerRef.current !== null) window.clearTimeout(duckSaveTimerRef.current);
    };
  }, []);

  /** Nhãn nguồn phụ đề (dòng 1 dòng của bước Phụ đề). */
  const transcriptSourceLabel = useMemo(() => {
    if (!transcriptSource) return null;
    if (transcriptSource.startsWith("srt:")) {
      const lang = transcriptSource.split(":")[1];
      const plat = transcriptSourcePlatform || "YouTube";
      return `Phụ đề có sẵn: ${lang} (${plat})`;
    }
    return "AI tự nhận dạng (Whisper)";
  }, [transcriptSource, transcriptSourcePlatform]);

  /** State của panel (memo — identity chỉ đổi khi field đổi). */
  const pipelineState = useMemo<StudioPipelineState>(
    () => ({
      segmentCount: segments.length,
      sttLang,
      sttModel,
      targetLang,
      transStyle,
      providerLabel,
      workflowStt: workflowOptStt,
      workflowTranslate: workflowOptTranslate,
      workflowVoice: workflowOptVoice,
      preferExistingSrt,
      sourceLabel: transcriptSourceLabel,
      expectedSpeakerCount,
      engines: panelEngines,
      selectedEngineId: selectedTtsEngine,
      voiceOptions: panelVoiceOptions,
      roles: panelRoles,
      glossary,
      glossaryCount: glossaryEntryCount(glossary),
      glossaryLocked: glossary?.locked === true,
      glossaryHint: glossaryLockHint(glossary),
      glossaryOpen,
      glossarySuggesting,
      glossarySuggestEstimateSec,
      running: isAnalyzing,
      runningLabel: analyzeMessage,
      queuedPosition,
      openStep: pipelineOpenStep,
      hasRange: inPoint !== null && outPoint !== null,
      rangeLabel:
        inPoint !== null && outPoint !== null
          ? `${formatTimecode(inPoint)} → ${formatTimecode(outPoint)}`
          : "",
      downloadingEngineId: ttsEngineDownloading,
      downloadProgress: ttsEngineDownloadPct,
      auditioningRoleId: auditioningSpkId,
      auditioningEngineId: playingEngineSample,
      translateOptions,
      translateOptionsLoading,
      translateOptionsUnavailable,
      stepEstimates: pipelineEstimates,
      liveProgress: pipelineLiveProgress,
      sttEngines,
      sttSelectedEngineId,
      contextualTranslate,
      translateProvider,
      translatePhase,
      sttDownloadProgress: sttDownloadProgress ?? undefined,
      favoriteVoices,
      previewVoiceId,
      previewVoiceStatus,
      duckingLevel: duckParams.duckLevel,
      duckingBridgeSec: duckParams.bridgeGapSec,
    }),
    [
      favoriteVoices,
      previewVoiceId,
      previewVoiceStatus,
      duckParams.duckLevel,
      duckParams.bridgeGapSec,
      segments.length,
      sttLang,
      sttModel,
      targetLang,
      transStyle,
      providerLabel,
      workflowOptStt,
      workflowOptTranslate,
      workflowOptVoice,
      preferExistingSrt,
      transcriptSourceLabel,
      expectedSpeakerCount,
      panelEngines,
      selectedTtsEngine,
      panelVoiceOptions,
      panelRoles,
      glossary,
      glossaryOpen,
      glossarySuggesting,
      glossarySuggestEstimateSec,
      isAnalyzing,
      analyzeMessage,
      queuedPosition,
      pipelineOpenStep,
      inPoint,
      outPoint,
      ttsEngineDownloading,
      ttsEngineDownloadPct,
      auditioningSpkId,
      playingEngineSample,
      translateOptions,
      translateOptionsLoading,
      translateOptionsUnavailable,
      pipelineEstimates,
      pipelineLiveProgress,
      sttEngines,
      sttSelectedEngineId,
      contextualTranslate,
      translateProvider,
      translatePhase,
      sttDownloadProgress,
    ],
  );

  /** Bước đang "đứng" trên rail 5 bước. */
  const pipelineActiveStep = useMemo<"source" | "sub" | "translate" | "voice" | "export">(() => {
    if (pipelineOpenStep === "sub") return "sub";
    if (pipelineOpenStep === "translate") return "translate";
    if (pipelineOpenStep === "voice") return "voice";
    if (segments.length === 0) return "source";
    return "translate";
  }, [pipelineOpenStep, segments.length]);

  /** API của panel — identity ỔN ĐỊNH (đóng gói trong ref). */
  const pipelineApiRef = useRef<StudioPipelineApi | null>(null);
  if (!pipelineApiRef.current) {
    pipelineApiRef.current = {
      setOpenStep: () => {},
      setWorkflowStt: () => {},
      setWorkflowTranslate: () => {},
      setWorkflowVoice: () => {},
      setSttLang: () => {},
      setSttModel: () => {},
      setTargetLang: () => {},
      setTransStyle: () => {},
      setPreferExistingSrt: () => {},
      setExpectedSpeakerCount: () => {},
      setRoleVoice: () => {},
      setRoleName: () => {},
      toggleRoleGender: () => {},
      addRole: () => {},
      removeRole: () => {},
      mergeRoleInto: () => {},
      mergeAllInto: () => {},
      mergeToTwo: () => {},
      mergeToOne: () => {},
      applyEngineToAll: () => {},
      selectEngine: () => {},
      previewEngine: () => {},
      downloadEngineModel: () => {},
      auditionRole: () => {},
      playOriginalClip: () => {},
      runStepSub: () => {},
      runStepTranslate: () => {},
      runStepVoice: () => {},
      runAll: () => {},
      cancel: () => {},
      runRangeOnly: () => {},
      openExport: () => {},
      openSettings: () => {},
      selectTranslateModel: () => {},
      selectReasoningEffort: () => {},
      hasProviderKey: () => true,
      selectSttEngine: () => {},
      downloadSttModel: () => {},
      cancelSttModelDownload: () => {},
      setContextualTranslate: () => {},
      openGlossary: () => {},
      closeGlossary: () => {},
      onGlossaryChange: () => {},
      onGlossarySave: () => {},
      onGlossarySuggest: async () => null,
      toggleFavoriteVoice: () => {},
      previewVoiceSample: () => {},
      stopVoicePreview: () => {},
      setDuckingLevel: () => {},
      setDuckingBridgeSec: () => {},
    };
  }
  Object.assign(pipelineApiRef.current, {
    setOpenStep: (step: PipelineOpenStep) => setPipelineOpenStep(step),
    setWorkflowStt: (value: boolean) => setWorkflowOptStt(value),
    setWorkflowTranslate: (value: boolean) => setWorkflowOptTranslate(value),
    setWorkflowVoice: (value: boolean) => setWorkflowOptVoice(value),
    setSttLang: (value: string) => setSttLang(value),
    setSttModel: (value: string) => setSttModel(value),
    setTargetLang: (value: string) => setTargetLang(value),
    setTransStyle: (value: string) => setTransStyle(value),
    setPreferExistingSrt: (value: boolean) => setPreferExistingSrt(value),
    setExpectedSpeakerCount: (value: number) => setExpectedSpeakerCount(value),
    setRoleVoice: (roleId: string, voice: string) => handleSetRoleVoice(roleId, voice),
    setRoleName: (roleId: string, name: string) => handleRenameRole(roleId, name),
    toggleRoleGender: (roleId: string) => handleToggleRoleGender(roleId),
    addRole: () => handleAddRole(),
    removeRole: (roleId: string) => handleDeleteSpeaker(roleId),
    mergeRoleInto: (fromId: string, toId: string) => handleMergeRoleInto(fromId, toId),
    mergeAllInto: (roleId: string) => {
      const target = speakers.find((s) => s.id === roleId);
      if (!target) return;
      const others = speakers.filter((s) => s.id !== roleId);
      for (const other of others) handleMergeRoleInto(other.id, roleId);
    },
    mergeToTwo: () => {
      handleQuickMergeToTwoRoles();
      handleApplyTwoSpeakerPreset("mf");
    },
    mergeToOne: () => handleQuickMergeToOneRole(),
    applyEngineToAll: () => handleApplyEngineToAllSpeakers(selectedTtsEngine),
    selectEngine: (engineId: string) => handleSelectTtsEngine(engineId as TtsEngineKey),
    previewEngine: (engineId: string) => {
      void handlePreviewEngineSample(engineId as TtsEngineKey);
    },
    downloadEngineModel: (engineId: string) => {
      void handleDownloadEngineModel(engineId);
    },
    auditionRole: (roleId: string) => {
      const spk = speakers.find((s) => s.id === roleId);
      if (spk) void handlePreviewSpeakerVoice(spk);
    },
    playOriginalClip: (roleId: string) => {
      const spk = speakers.find((s) => s.id === roleId);
      if (spk?.sampleAudio) handlePlayAudio(spk.sampleAudio, spk.id);
      else showToast("⚠️ Vai này chưa có clip giọng gốc.");
    },
    runStepSub: () => {
      void handleRunAnalysis(false, false);
    },
    runStepTranslate: () => {
      void handleRunTranslateOnly();
    },
    runStepVoice: () => {
      void handleRunVoiceOnly();
    },
    runAll: () => {
      void handleRunCustomWorkflow();
    },
    cancel: () => {
      void handleCancelAnalysis();
    },
    runRangeOnly: () => {
      setUseRangeOnly(true);
      void handleRunCustomWorkflow();
    },
    openExport: () => handleOpenExportModal(),
    openSettings: () => onNavigateTab?.("models"),
    selectTranslateModel: (modelId: string, provider: string) => {
      void handleSelectTranslateModel(modelId, provider);
    },
    selectReasoningEffort: (effort: ReasoningEffort) => {
      void handleSelectReasoningEffort(effort);
    },
    hasProviderKey: handleHasProviderKey,
    selectSttEngine: (engineId: string) => {
      void handleSelectSttEngine(engineId);
    },
    downloadSttModel: (engineId: string) => {
      void handleDownloadSttModel(engineId);
    },
    cancelSttModelDownload: (engineId: string) => {
      void handleCancelSttModelDownload(engineId);
    },
    setContextualTranslate: (value: boolean) => handleSetContextualTranslate(value),
    // [TSK-STUDIO-GLOSSARY] Bảng thuật ngữ + xưng hô.
    openGlossary: () => setGlossaryOpen(true),
    closeGlossary: () => setGlossaryOpen(false),
    onGlossaryChange: (next: Glossary) => handleGlossaryChange(next),
    onGlossarySave: (next: Glossary) => handleGlossarySave(next),
    onGlossarySuggest: () => handleGlossarySuggest(),
    // [TSK-FEAT-VOICE-PICKER] Giọng ghim ★ + nghe mẫu từng giọng.
    toggleFavoriteVoice: (voiceId: string) => {
      void handleToggleFavoriteVoice(voiceId);
    },
    previewVoiceSample: (voiceId: string) => {
      void handlePreviewVoiceSample(voiceId);
    },
    stopVoicePreview: () => handleStopVoicePreview(),
    // [TSK-FEAT-SMART-DUCKING] 2 thanh trượt trong bước Lồng tiếng.
    setDuckingLevel: (value: number) => handleSetDuckingField("ducking_level", value),
    setDuckingBridgeSec: (value: number) => handleSetDuckingField("ducking_bridge_sec", value),
  });
  const pipelineApi = pipelineApiRef.current;

  return (
    <div className="sublix-studio-container" data-theme={currentTheme} data-tab-id={tabId}>
      {/* ====================================================================
          P1 — TOPBAR
          ==================================================================== */}
      {/* R2-2: thanh trên DÙNG CHUNG (MasterTopbar) — thay bản copy riêng của Studio. */}
      <MasterTopbar
        version={appVersion ?? APP_VERSION_PKG}
        activeTab="studio"
        onNavigateTab={(tabId) => {
          if (tabId === "studio") return;
          onNavigateTab?.(
            tabId as "downloader" | "live" | "history" | "models" | "overlay" | "process" | "lab",
          );
        }}
        tabs={[
          { id: "studio", label: "Studio", icon: <IconClapper size={13} /> },
          { id: "downloader", label: "Tải video", icon: <IconGlobe size={13} /> },
          { id: "lab", label: "Xưởng AI", icon: <IconSparkles size={13} />, tag: "Thử nghiệm" },
          { id: "live", label: "Live", icon: <IconMic size={13} /> },
          { id: "history", label: "Lịch sử", icon: <IconClock size={13} /> },
          { id: "process", label: "Tiến trình", icon: <IconClock size={13} /> },
          { id: "models", label: "Cài đặt", icon: <IconSettings size={13} /> },
        ]}
        statusLabel={
          queuedPosition !== null
            ? `Đang chờ #${queuedPosition}`
            : isAnalyzing
            ? analyzeMessage || "Đang xử lý…"
            : "Sẵn sàng"
        }
        onStatusClick={() => onNavigateTab?.("process")}
        // [UI_R2-8_REVIEW mục 12] Nút 👁 overlay (mockup có) — bật/tắt cửa sổ phụ đề nổi.
        overlay={{
          onClick: handleToggleOverlay,
          title: "Bật/tắt Overlay (Ctrl+Shift+O)",
        }}
        undo={{
          onUndo: handleUndo,
          layers: [
            { id: "audio", label: "Audio", onUndo: handleUndoAudio },
            { id: "translation", label: "Bản dịch", onUndo: handleUndoTranslation },
            { id: "subtitles", label: "Phụ đề", onUndo: handleUndoSubtitles },
          ],
        }}
        // [TSK-TIMELINE-REDO-RIPPLE] Nút ↷ (Redo) — Ctrl+Shift+Z / Ctrl+Y, chuột phải chọn lớp.
        redo={{
          onRedo: handleRedoSubtitles,
          disabled: !canRedo(subtitleHistory),
          layers: [
            { id: "audio", label: "Audio", onRedo: handleRedoAudio },
            { id: "translation", label: "Bản dịch", onRedo: handleRedoTranslation },
            { id: "subtitles", label: "Phụ đề", onRedo: handleRedoSubtitles },
          ],
        }}
        primary={{
          label: "Xuất video",
          icon: <IconClapper size={13} />,
          onClick: handleOpenExportModal,
          title: "Cấu hình và xuất video hoàn chỉnh",
        }}
      >
        {/* Vùng ngữ cảnh: input file ẩn + chip file + nút Mở video.
            Nút "📥 Nhập video" cũ bị bỏ (trùng "Mở video" — TL-09). */}
        <input
          id="studio-hidden-file-input"
          type="file"
          accept="video/*,audio/*,.mp4,.mkv,.mov,.m4a,.avi,.mp3"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const p = (file as any).path || file.name;
              lastLoadedInitialPathRef.current = p;
              onClearPendingFile?.();
              handleLoadNewVideoFile(p);
              showToast(`Đã mở video: ${file.name}`);
            }
          }}
        />

        <div className="studio-file-chip" title={filePath}>
          <IconFilm size={13} />
          <span>{fileName}</span>
          <button
            type="button"
            className="studio-file-chip-close"
            onClick={handleCloseCurrentVideo}
            title="Đóng video hiện tại"
          >
            ✕
          </button>
        </div>

        <button
          type="button"
          className="studio-btn-open-video"
          onClick={handlePickMediaFile}
          title="Mở file video từ máy tính (Phím tắt: Ctrl + I)"
        >
          <IconPlus size={13} /> Mở video
        </button>

        {/* 4 chấm đổi theme: tạm giữ ở vùng ngữ cảnh cho tới khi R2-5 thêm mục
            "Chủ đề" vào Cài đặt (theo plan §4.2 là chuyển hẳn sang Cài đặt). */}
        <div className="studio-theme-dots" title="Đổi theme giao diện">
          {[
            { id: "cinema", bg: "#e8a33d" },
            { id: "studio", bg: "#2dd4bf" },
            { id: "light", bg: "#b45309" },
            { id: "vibrant", bg: "#e11d48" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={`studio-theme-dot ${currentTheme === t.id ? "active" : ""}`}
              style={{ background: t.bg }}
              onClick={() => onThemeChange?.(t.id)}
            />
          ))}
        </div>
      </MasterTopbar>

      {/* [TSK-TABS-P1] Ô render NGAY DƯỚI topbar (dùng cho thanh tab của host). */}
      {belowTopbar}

      {/* ====================================================================
          WORKSPACE — 3 COLUMNS (P2, P3, P4)
          ==================================================================== */}
      <div className={`studio-workspace ${isDraggingLeft || isDraggingRight ? "is-resizing" : ""}`}>
        {/* P2: CỘT BƯỚC BÊN TRÁI (RESIZABLE) */}
        <aside className="studio-col-steps" style={{ width: `${leftPanelWidth}px` }}>
          {/* R2-3: panel quy trình 5 bước — tách sang src/views/studio/StudioPipelinePanel.tsx */}
          <StudioPipelinePanel
            state={pipelineState}
            api={pipelineApi}
            activeStep={pipelineActiveStep}
            advancedExtra={
          <div className="studio-review-panel">
            <div className="studio-review-card">
              <div className="studio-review-title">
                <span>📊 Thống K Nhịp Thoại & Kịch Bản</span>
              </div>
              <div className="studio-review-stat-grid">
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{segments.length}</span>
                  <span className="studio-review-stat-label">Tổng câu thoại</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{mediaDuration.toFixed(1)}s</span>
                  <span className="studio-review-stat-label">Thời lượng video</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">{speakers.length} vai</span>
                  <span className="studio-review-stat-label">Nhân vật tham gia</span>
                </div>
                <div className="studio-review-stat-item">
                  <span className="studio-review-stat-val">
                    {segments.length > 0 ? `~${calculatedWpm} WPM` : "—"}
                  </span>
                  <span className="studio-review-stat-label">Tốc độ thoại TB</span>
                </div>
              </div>
            </div>

            <div className="studio-review-card">
              <div className="studio-review-title">
                <span>📖 Tóm Tắt Cốt Truyện & Thoại</span>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--t2)", lineHeight: 1.5, margin: 0 }}>
                {segments.length > 0
                  ? `Dự án gồm ${segments.length} câu thoại, tổng ${totalSpeechSeconds.toFixed(1)}s thời lượng thoại của ${speakers.length} nhân vật (${speakers.map((s) => s.name).join(", ")}).`
                  : "Chưa có kịch bản để tóm tắt cốt truyện."}
              </p>
            </div>

            <div className="studio-review-card">
              <div className="studio-review-title">
                <span>🛡 Đánh Giá Chất Lượng Kịch Bản</span>
                {reviewScore !== null && (
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: reviewScore >= 80 ? "#10b981" : "#f59e0b" }}>
                    {reviewScore}/100
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                {reviewNotes.length > 0 ? (
                  reviewNotes.map((n, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: n.startsWith("✓") ? "#10b981" : "#f59e0b" }}>
                      <span>{n}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#10b981" }}>
                      <span>✓</span>
                      <span>Phân vai: {speakers.length} vai diễn độc lập trên timeline.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#10b981" }}>
                      <span>✓</span>
                      <span>Đồng bộ mốc thời gian: {segments.length} câu thoại sẵn sàng.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ac)" }}>
                      <span>⚡</span>
                      <span>Phong cách: {transStyle === "theatrical" ? "Điện Ảnh (Theatrical)" : "Thuyết Minh Chuẩn"}</span>
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                className="studio-btn-subtle"
                style={{ marginTop: 6, justifyContent: "center" }}
                onClick={() => {
                  if (segments.length === 0) {
                    setReviewScore(0);
                    setReviewNotes(["Chưa có phân đoạn thoại nào để đánh giá."]);
                    showToast("ℹ Chưa có kịch bản để đánh giá");
                    return;
                  }
                  let s = 100;
                  const notes: string[] = [];
                  const emptyTrans = segments.filter((seg) => !seg.translated.trim()).length;
                  if (emptyTrans > 0) {
                    s -= Math.min(30, emptyTrans * 5);
                    notes.push(`⚠ Có ${emptyTrans} câu chưa có nội dung dịch`);
                  } else {
                    notes.push("✓ 100% câu đã có bản dịch hoàn chỉnh");
                  }
                  const unusedSpeakers = speakers.filter((spk) => !segments.some((seg) => seg.speakerId === spk.id)).length;
                  if (unusedSpeakers > 0) {
                    s -= Math.min(20, unusedSpeakers * 5);
                    notes.push(`⚠ Có ${unusedSpeakers} vai chưa được gán câu thoại nào`);
                  } else if (speakers.length > 0) {
                    notes.push(`✓ Toàn bộ ${speakers.length} nhân vật đều có câu thoại`);
                  }
                  const longSegs = segments.filter((seg) => seg.end - seg.start > 12).length;
                  if (longSegs > 0) {
                    s -= Math.min(15, longSegs * 3);
                    notes.push(`⚠ Có ${longSegs} câu thoại dài hơn 12s (cần ngắt)`);
                  } else {
                    notes.push("✓ Mốc thời gian thoại tự nhiên (<12s/câu)");
                  }
                  const finalScore = Math.max(0, s);
                  setReviewScore(finalScore);
                  setReviewNotes(notes);
                  showToast(`✅ Đã đánh giá kịch bản: ${finalScore}/100`);
                }}
              >
                ✨ Đánh giá lại kịch bản
              </button>
            </div>
          </div>
            }
          />
        </aside>

        {/* RESIZER CỘT TRÁI (LEFT PANEL RESIZER) */}
        <div
          className={`studio-panel-resizer studio-panel-resizer-left ${isDraggingLeft ? "active" : ""}`}
          onMouseDown={handleMouseDownLeftSplitter}
          onDoubleClick={handleResetLeftWidth}
          title="Kéo sang trái/phải để thay đổi kích thước cột Cấu hình • Nhấp đúp để đặt lại mặc định (340px)"
        >
          <div className="resizer-grip-handle" />
        </div>

        {/* P3: KHUNG XEM VIDEO Ở GIỮA */}
        <section className="studio-col-video">
          <div className="studio-video-toolbar">
            <div className="studio-video-toolbar-left">
              <select
                className="studio-video-select-subtle"
                value={subtitleDisplayMode}
                onChange={(e) => setSubtitleDisplayMode(e.target.value as any)}
                title="Chế độ hiển thị phụ đề trên màn chiếu (Bản dịch / Gốc / Song ngữ)"
              >
                <option value="translated">Bản dịch (Tiếng Việt)</option>
                <option value="original">Nguyên bản (Gốc)</option>
                <option value="bilingual">Song ngữ (2 dòng)</option>
              </select>
              <select
                className="studio-video-select-subtle"
                value={videoScale}
                onChange={(e) => setVideoScale(Number(e.target.value))}
                title="Thu phóng kích thước khung xem video"
              >
                <option value={100}>100% Fit</option>
                <option value={75}>75%</option>
                <option value={50}>50%</option>
              </select>
              {/* [TSK-V014-WIRE-STUDIO] Chip lối tắt tới thẻ Kiểu phụ đề / Phụ đề cứng (§4.12). */}
              <button
                type="button"
                className="studio-filter-chip"
                onClick={goToV14Cards}
                title="Kiểu phụ đề đang áp — bấm để chỉnh"
              >
                Aa {v14.subStyle.mode === "kinetic"
                  ? `Nhảy chữ · ${v14.subStyle.preset === "pop-amber" ? "Vàng nảy" : v14.subStyle.preset === "karaoke-cyan" ? "Karaoke xanh" : "Hiện dần"}`
                  : "Bình thường"}
              </button>
              {v14.hardsub.enabled && (
                <button
                  type="button"
                  className="studio-filter-chip"
                  onClick={goToV14Cards}
                  title="Làm mờ phụ đề cứng của video gốc — bấm để chỉnh dải"
                >
                  ▭ Làm mờ dải chữ cứng
                </button>
              )}
            </div>

            <div className="studio-video-toolbar-right">
              <button
                type="button"
                className="studio-action-btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={() => {
                  setVideoScale((prev) => Math.max(50, prev - 10));
                  showToast("Thu nhỏ khung xem video");
                }}
                title="Thu nhỏ khung video (-10%)"
              >
                -
              </button>
              <button
                type="button"
                className="studio-action-btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={() => {
                  setVideoScale((prev) => Math.min(100, prev + 10));
                  showToast("Phóng to khung xem video");
                }}
                title="Phóng to khung video (+10%)"
              >
                +
              </button>
              <button
                type="button"
                className="studio-action-btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={() => {
                  if (videoRef.current) {
                    if (document.fullscreenElement) {
                      document.exitFullscreen();
                    } else {
                      videoRef.current.requestFullscreen().catch(() => showToast("Chế độ toàn màn hình video"));
                    }
                  } else {
                    showToast("Toàn màn hình: Nhấn để xem toàn màn hình video");
                  }
                }}
                title="Xem toàn màn hình (Fullscreen)"
              >
                <IconMaximize size={12} />
              </button>
            </div>
          </div>

          {/* Dynamic In-Tab AI Progress Center Banner */}
          {isAnalyzing && (
            <div className="studio-ai-progress-hud">
              <div className="studio-ai-hud-header">
                <div className="studio-ai-hud-pulse">
                  <span className="studio-ai-pulse-dot" />
                  <span className="studio-ai-hud-title">
                    {timelineProcessType === "stt"
                      ? `💬 Đang Tạo Phụ Đề: ${fileName || "Dự án"}`
                      : timelineProcessType === "translate"
                      ? `🌐 Đang Dịch Phụ Đề (${targetLang.toUpperCase()}): ${fileName || "Dự án"}`
                      : timelineProcessType === "voice"
                      ? `🎙️ Đang Tổng Hợp Giọng Đọc Lồng Tiếng: ${fileName || "Dự án"}`
                      : `⚡ Đang Xử Lý Toàn Trình (Phụ Đề & Lồng Tiếng): ${fileName || "Dự án"}`}
                  </span>
                </div>
                <div className="studio-ai-hud-actions">
                  <span className="studio-ai-hud-pct">{analyzeProgress.toFixed(0)}%</span>
                  <button
                    type="button"
                    className="studio-btn-action-danger"
                    onClick={handleCancelAnalysis}
                    title="Dừng tiến trình phân tích"
                    style={{
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      color: "#f87171",
                      borderRadius: 4,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ✕ Dừng
                  </button>
                </div>
              </div>

              {/* Dynamic multi-step progress pipeline based on active workflow */}
              <div className="studio-ai-steps-row">
                {timelineProcessType === "stt" ? (
                  workflowOptTranslate ? (
                    // CHỈ PHỤ ĐỀ (CÓ DỊCH) - 4 BƯỚC
                    <>
                      <div className={`studio-ai-step-item ${analyzeProgress >= 20 ? "done" : analyzeProgress > 0 ? "active" : ""}`}>
                        <span className="studio-ai-step-num">1</span>
                        <span className="studio-ai-step-name">🎵 Audio WAV</span>
                      </div>
                      <div className="studio-ai-step-arrow">›</div>
                      <div className={`studio-ai-step-item ${analyzeProgress >= 65 ? "done" : analyzeProgress >= 20 ? "active" : ""}`}>
                        <span className="studio-ai-step-num">2</span>
                        <span className="studio-ai-step-name">🎙️ Whisper STT</span>
                      </div>
                      <div className="studio-ai-step-arrow">›</div>
                      <div className={`studio-ai-step-item ${analyzeProgress >= 95 ? "done" : analyzeProgress >= 65 ? "active" : ""}`}>
                        <span className="studio-ai-step-num">3</span>
                        <span className="studio-ai-step-name">🌐 Dịch Phụ Đề</span>
                      </div>
                      <div className="studio-ai-step-arrow">›</div>
                      <div className={`studio-ai-step-item ${analyzeProgress >= 100 ? "done" : analyzeProgress >= 95 ? "active" : ""}`}>
                        <span className="studio-ai-step-num">4</span>
                        <span className="studio-ai-step-name">🎬 Timeline Sub</span>
                      </div>
                    </>
                  ) : (
                    // CHỈ PHỤ ĐỀ GỐC (KHÔNG DỊCH) - 3 BƯỚC TINH GỌN (TUYỆT ĐỐI KHÔNG CÓ SHERPA AI)
                    <>
                      <div className={`studio-ai-step-item ${analyzeProgress >= 20 ? "done" : analyzeProgress > 0 ? "active" : ""}`}>
                        <span className="studio-ai-step-num">1</span>
                        <span className="studio-ai-step-name">🎵 Audio WAV</span>
                      </div>
                      <div className="studio-ai-step-arrow">›</div>
                      <div className={`studio-ai-step-item ${analyzeProgress >= 85 ? "done" : analyzeProgress >= 20 ? "active" : ""}`}>
                        <span className="studio-ai-step-num">2</span>
                        <span className="studio-ai-step-name">🎙️ Whisper STT</span>
                      </div>
                      <div className="studio-ai-step-arrow">›</div>
                      <div className={`studio-ai-step-item ${analyzeProgress >= 100 ? "done" : analyzeProgress >= 85 ? "active" : ""}`}>
                        <span className="studio-ai-step-num">3</span>
                        <span className="studio-ai-step-name">🎬 Timeline Sub</span>
                      </div>
                    </>
                  )
                ) : timelineProcessType === "translate" ? (
                  // CHỈ DỊCH THUẬT
                  <>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 25 ? "done" : "active"}`}>
                      <span className="studio-ai-step-num">1</span>
                      <span className="studio-ai-step-name">📝 Đọc Kịch Bản</span>
                    </div>
                    <div className="studio-ai-step-arrow">›</div>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 90 ? "done" : analyzeProgress >= 25 ? "active" : ""}`}>
                      <span className="studio-ai-step-num">2</span>
                      <span className="studio-ai-step-name">🌐 LLM Dịch Thuật</span>
                    </div>
                    <div className="studio-ai-step-arrow">›</div>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 100 ? "done" : analyzeProgress >= 90 ? "active" : ""}`}>
                      <span className="studio-ai-step-num">3</span>
                      <span className="studio-ai-step-name">🎬 Cập Nhật Timeline</span>
                    </div>
                  </>
                ) : timelineProcessType === "voice" ? (
                  // CHỈ LỒNG TIẾNG
                  <>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 25 ? "done" : "active"}`}>
                      <span className="studio-ai-step-num">1</span>
                      <span className="studio-ai-step-name">👥 Phân Vai ({speakers.length} vai)</span>
                    </div>
                    <div className="studio-ai-step-arrow">›</div>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 90 ? "done" : analyzeProgress >= 25 ? "active" : ""}`}>
                      <span className="studio-ai-step-num">2</span>
                      <span className="studio-ai-step-name">🗣️ Tổng Hợp Giọng TTS</span>
                    </div>
                    <div className="studio-ai-step-arrow">›</div>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 100 ? "done" : analyzeProgress >= 90 ? "active" : ""}`}>
                      <span className="studio-ai-step-num">3</span>
                      <span className="studio-ai-step-name">🎬 Đồng Bộ Audio Track</span>
                    </div>
                  </>
                ) : (
                  // TOÀN TRÌNH PIPELINE
                  <>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 15 ? "done" : analyzeProgress > 0 ? "active" : ""}`}>
                      <span className="studio-ai-step-num">1</span>
                      <span className="studio-ai-step-name">🎵 Audio WAV</span>
                    </div>
                    <div className="studio-ai-step-arrow">›</div>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 40 ? "done" : analyzeProgress >= 15 ? "active" : ""}`}>
                      <span className="studio-ai-step-num">2</span>
                      <span className="studio-ai-step-name">🎙️ Whisper STT</span>
                    </div>
                    <div className="studio-ai-step-arrow">›</div>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 60 ? "done" : analyzeProgress >= 40 ? "active" : ""}`}>
                      <span className="studio-ai-step-num">3</span>
                      <span className="studio-ai-step-name">👥 Phân Vai AI</span>
                    </div>
                    <div className="studio-ai-step-arrow">›</div>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 95 ? "done" : analyzeProgress >= 60 ? "active" : ""}`}>
                      <span className="studio-ai-step-num">4</span>
                      <span className="studio-ai-step-name">✍️ Dịch Kịch Bản</span>
                    </div>
                    <div className="studio-ai-step-arrow">›</div>
                    <div className={`studio-ai-step-item ${analyzeProgress >= 100 ? "done" : analyzeProgress >= 95 ? "active" : ""}`}>
                      <span className="studio-ai-step-num">5</span>
                      <span className="studio-ai-step-name">🎬 Timeline</span>
                    </div>
                  </>
                )}
              </div>

              {/* Progress bar */}
              <div className="studio-ai-progress-track">
                <div
                  className="studio-ai-progress-fill"
                  style={{ width: `${Math.max(3, Math.min(100, analyzeProgress))}%` }}
                />
              </div>

              {/* Live status message + Jump to Process Center button */}
              <div className="studio-ai-status-msg">
                <span>{analyzeMessage || timelineProcessMessage || "Đang xử lý luồng AI..."}</span>
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab("process")}
                    className="studio-ai-open-tab-btn"
                  >
                    Mở tab Tiến trình toàn cục ↗
                  </button>
                )}
              </div>
            </div>
          )}

          <div
            className={`studio-video-stage ${isDraggingFile ? "drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDraggingFile(false); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingFile(false);
              const file = e.dataTransfer?.files?.[0];
              if (file) {
                const p = (file as any).path || file.name;
                if (p) {
                  lastLoadedInitialPathRef.current = p;
                  onClearPendingFile?.();
                  handleLoadNewVideoFile(p);
                  showToast(`Đã nạp video: ${file.name}`);
                }
              }
            }}
          >
            <div
              className={`studio-video-frame ${isDraggingFile ? "drag-over" : ""}`}
              onClick={filePath ? handleTogglePlay : handlePickMediaFile}
              style={{
                cursor: "pointer",
                position: "relative",
                border: isDraggingFile ? "2px dashed var(--ac)" : undefined,
                background: isDraggingFile ? "rgba(232, 163, 61, 0.12)" : undefined,
                transform: videoScale === 100 ? undefined : `scale(${videoScale / 100})`,
                transformOrigin: "center center",
                transition: "transform 0.2s ease",
              }}
            >
              {/* Native HTML5 Video Player */}
              {filePath ? (
                <video
                  ref={videoRef}
                  className="studio-video-player-element"
                  // [TSK-TABS-P1] Tab không active ⇒ nhả <video> (src rỗng) để giải
                  // phóng decoder + buffer; quay lại tab thì nạp lại (key đổi).
                  src={isActive ? getVideoSrc(transcodedPath ?? filePath) : undefined}
                  key={isActive ? (transcodedPath ?? filePath) : "released"}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => {
                    setIsPlaying(true);
                    isPlayingRef.current = true;
                    if (videoRef.current) {
                      activeVoiceSegRef.current = null;
                      syncVoicePlayback(videoRef.current.currentTime, false);
                    }
                  }}
                  onPause={() => {
                    setIsPlaying(false);
                    isPlayingRef.current = false;
                    stopVoicePlayback();
                  }}
                  onEnded={() => {
                    setIsPlaying(false);
                    isPlayingRef.current = false;
                    stopVoicePlayback();
                    handleSeek(mediaDurationRef.current);
                  }}
                  onSeeked={() => {
                    const v = videoRef.current;
                    if (v) {
                      activeVoiceSegRef.current = null;
                      finishedVoiceSegRef.current = null;
                      const curT = v.currentTime;
                      setCurrentTime(curT);
                      // BUG-A: chỉ auto-follow khi đang phát & không có multi-select chủ động (seek thủ công đã tự lo selection)
                      if (isPlayingRef.current && !multiSelectLockRef.current) {
                        const match = segmentsRef.current.find((s) => s.start <= curT && curT <= s.end);
                        if (match) {
                          setSelectedSegId(match.id);
                          selectedSegIdRef.current = match.id;
                          setSelectedSegIds([match.id]);
                          selectedSegIdsRef.current = [match.id];
                        } else {
                          setSelectedSegId(0);
                          selectedSegIdRef.current = 0;
                          setSelectedSegIds([]);
                          selectedSegIdsRef.current = [];
                        }
                      }
                      syncVoicePlayback(curT, v.paused);
                    }
                  }}
                  onError={async () => {
                    if (!transcodedPath && filePath) {
                      // ROUND-4 R4-01: WebView2 không giải mã được codec gốc (VP9/AV1/HEVC/H.264 high).
                      // Tự chạy ffmpeg chuyển sang H.264 baseline + AAC rồi phát bản tạm.
                      // Nếu transcoding cũng fail → mới fallback Cinema Visualizer.
                      console.warn(
                        "Video element could not decode in WebView2, attempting ffmpeg transcode to H.264/AAC baseline…"
                      );
                      // R6-06: thêm toast cho user (trước chỉ console.log, user không biết đang làm gì)
                      showToast("⏳ WebView2 không giải mã được codec — đang chuyển tạm sang H.264");
                      // R7-02: lưu currentTime + isPlaying TRƯỚC khi transcode để resume sau
                      const curV = videoRef.current;
                      const resumeTime = curV?.currentTime ?? 0;
                      const wasPlaying = curV ? !curV.paused : false;
                      try {
                        console.log("Đang chuyển tạm video sang H.264 để xem được trong Studio…");
                        // [TSK-TABS-3.5] Chụp video TRƯỚC await → bỏ nếu đã đổi video.
                        const startedPath = filePath;
                        const previewPath = await sublix.transcodeForPreview(startedPath);
                        if (!guardProject(startedPath)) return;
                        setTranscodedPath(previewPath);
                        // R7-02: đợi React remount video element rồi play() + seek về currentTime cũ
                        setTimeout(() => {
                          const v2 = videoRef.current;
                          if (!v2) return;
                          if (resumeTime > 0 && Number.isFinite(resumeTime)) {
                            try {
                              v2.currentTime = Math.max(0, Math.min(resumeTime, (v2.duration || resumeTime) - 0.1));
                            } catch (e) {
                              // ignore
                            }
                          }
                          if (wasPlaying) {
                            v2.play().catch((e) => console.warn("R7-02: play() failed:", e));
                          }
                        }, 250);
                        // R7-03: sửa toast nói quá — không hứa "Đang phát"
                        showToast("✅ Đã chuyển sang dạng xem được");
                        return;
                      } catch (transcodeErr) {
                        const errMsg = (transcodeErr as Error)?.message ?? String(transcodeErr);
                        console.error("ffmpeg transcode failed, falling back:", transcodeErr);
                        console.error(`Không thể chuyển tạm video: ${errMsg}`);
                        // R6-06: báo lỗi cho user thay vì im lặng
                        showToast(`❌ Không thể chuyển tạm video: ${errMsg}`);
                      }
                    }
                    console.warn("Falling back to Cinema Visualizer.");
                    setVideoPlayError(true);
                    // R6-06: báo cho user biết app chuyển sang Cinema Visualizer (an toàn nhất)
                    showToast("⚠ Không phát được video — chuyển sang Cinema Visualizer.");
                  }}
                  style={{
                    display: videoPlayError ? "none" : "block",
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : null}

              {/* 1. DROPZONE KHI CHƯA CÓ VIDEO HOẶC KÉO THẢ TỆP (Chuẩn ảnh minh ha EZMAXSUB) */}
              {!filePath && (
                <div
                  className="studio-dropzone-center-box"
                  onClick={handlePickMediaFile}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingFile(true); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingFile(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingFile(false);
                    const file = e.dataTransfer?.files?.[0];
                    if (file) {
                      const p = (file as any).path || file.name;
                      if (p) {
                        lastLoadedInitialPathRef.current = p;
                        onClearPendingFile?.();
                        handleLoadNewVideoFile(p);
                        showToast(`Đã nạp video: ${file.name}`);
                      }
                    }
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "radial-gradient(circle at center, #1b212b 0%, #0c0e12 85%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    userSelect: "none",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 12,
                      border: "2px solid var(--ac)",
                      background: "rgba(232, 163, 61, 0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--ac)",
                      boxShadow: "0 0 20px rgba(232, 163, 61, 0.25)",
                    }}
                  >
                    <IconPlay size={26} />
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)" }}>
                    {isDraggingFile ? "✨ Thả tệp video vào đây để bắt đầu ngay!" : "Nhấn để nhập video (hoặc Kéo thả tệp vào đây)"}
                  </div>

                  <div style={{ fontSize: 11, color: "var(--t3)", letterSpacing: 1 }}>
                    MP4 • MKV • MOV • M4A • AVI • MP3
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 10.5,
                      color: "var(--ac)",
                      background: "rgba(232, 163, 61, 0.1)",
                      padding: "3px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(232, 163, 61, 0.3)",
                    }}
                  >
                    Phím tắt: Ctrl + I
                  </div>
                </div>
              )}

              {/* 2. THÔNG BO LỖI THẬT KHI VIDEO GẶP SỰ C ĐỊNH DẠNG */}
              {filePath && videoPlayError && (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "rgba(15, 23, 42, 0.95)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    padding: 24,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 32 }}>⚠</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171" }}>
                    Không thể phát tệp video này trực tiếp trong trình xem
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t3)", maxWidth: 440 }}>
                    Tệp có thể bị hỏng, đường dẫn không tồn tại hoặc sử dụng codec không được hỗ trợ bởi WebView2.
                  </div>
                  <button
                    type="button"
                    className="studio-btn primary"
                    onClick={handlePickMediaFile}
                    style={{ marginTop: 8 }}
                  >
                    Chọn video khác (Ctrl+I)
                  </button>
                </div>
              )}

              {/* Subtitle Box Overlay */}
              {filePath && (
                <StageLayer
                  videoRef={videoRef}
                  videoSize={v14.videoSize}
                  subStyle={v14.subStyle}
                  previewPreset={v14.previewPreset}
                  availablePresets={V014_PRESETS}
                  hardsub={v14.hardsub}
                  detectedBand={v14.detection?.band ?? null}
                  editing={rightTab === "properties"}
                  scanning={v14.running && v14.hardsub.enabled ? { percent: v14.running.percent } : null}
                  segment={kineticSegRef.current}
                  onBandChange={v14.setManualBand}
                  onBandReset={v14.resetBand}
                />
              )}
              {filePath && activeSubtitle && !v14Kinetic && (
                <div
                  className="studio-video-subtitle-overlay"
                  style={{
                    top: subPosition === "top" ? 18 : subPosition === "center" ? "45%" : undefined,
                    bottom: subPosition === "bottom" ? 18 : undefined,
                  }}
                >
                  {subtitleDisplayMode === "bilingual" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                      <div style={{ fontSize: subFontSize * 0.85, color: "#9ca3af", fontStyle: "italic" }}>
                        {activeSubtitle.original}
                      </div>
                      <div
                        className="studio-video-subtitle-text"
                        style={{
                          fontSize: subFontSize,
                          color: subFontColor,
                          textShadow: subShowShadow ? "0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.8)" : "none",
                        }}
                      >
                        {activeSubtitle.translated}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="studio-video-subtitle-text"
                      style={{
                        fontSize: subFontSize,
                        color: subFontColor,
                        textShadow: subShowShadow ? "0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.8)" : "none",
                      }}
                    >
                      {subtitleDisplayMode === "original" ? activeSubtitle.original : activeSubtitle.translated}
                    </div>
                  )}
                  <span className="studio-video-subtitle-chip">
                    {formatTimecode(activeSubtitle.start)} → {formatTimecode(activeSubtitle.end)} •{" "}
                    {speakers.find((s) => s.id === activeSubtitle.speakerId)?.name || "Chưa phân vai"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* RESIZER CỘT PHẢI (RIGHT PANEL RESIZER) */}
        <div
          className={`studio-panel-resizer studio-panel-resizer-right ${isDraggingRight ? "active" : ""}`}
          onMouseDown={handleMouseDownRightSplitter}
          onDoubleClick={handleResetRightWidth}
          title="Kéo sang trái/phải để thay đổi kích thước cột Phụ đề • Nhấp đúp để đặt lại mặc định (350px)"
        >
          <div className="resizer-grip-handle" />
        </div>

        {/* P4: DANH SÁCH CÂU (CỘT PHẢI - RESIZABLE) */}
        <aside className="studio-col-segments" style={{ width: `${rightPanelWidth}px` }}>
          <div className="studio-segments-header">
            <div className="studio-segments-tabs">
              <button
                type="button"
                className={`studio-segments-tab-btn ${rightTab === "subtitles" ? "active" : ""}`}
                onClick={() => setRightTab("subtitles")}
              >
                📑 Phụ đề
              </button>
              <button
                type="button"
                className={`studio-segments-tab-btn ${rightTab === "properties" ? "active" : ""}`}
                onClick={() => setRightTab("properties")}
              >
                ⚙ Thuộc tính
              </button>
            </div>
            {/* [UI_R2-8_REVIEW mục 9] Hàng thống kê cạnh tiêu đề "Phụ đề". */}
            {rightTab === "subtitles" ? (
              <div className="studio-segments-stats">
                <span className="studio-segments-stat">
                  <b>{segmentStats.count}</b> câu
                </span>
                <span className="studio-segments-stat">
                  <b>{Math.round(segmentStats.totalSec)}s</b>
                </span>
                <span className="studio-segments-stat">
                  <b>{segmentStats.speakerCount}</b> vai
                </span>
                <span className="studio-segments-stat">
                  <b>{segmentStats.wpm}</b> WPM
                </span>
              </div>
            ) : null}
            {rightTab === "subtitles" && (
              <div className="studio-segments-actions">
                <button
                  type="button"
                  className="studio-btn-subtle-sm"
                  onClick={handleDuplicateSegment}
                  title="Thêm nhanh một câu thoại mới"
                >
                  + Thêm
                </button>
              </div>
            )}
          </div>

          {rightTab === "subtitles" ? (
            <>
              <div className="studio-segments-search-bar">
                <div className="studio-search-input-wrap">
                  <IconSearch size={12} />
                  <input
                    type="text"
                    className="studio-search-input"
                    placeholder="Tìm trong phụ đề..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* [UI_R2-8_REVIEW mục 9] 3 chip lọc TRẠNG THÁI (trước chip vai). */}
              <div className="studio-segments-filter-chips">
            <button
              type="button"
              className={`studio-filter-chip ${segmentStatusFilter === "untranslated" ? "active" : ""}`}
              onClick={() =>
                setSegmentStatusFilter((cur) => (cur === "untranslated" ? "none" : "untranslated"))
              }
              title="Chỉ hiện câu chưa có bản dịch"
            >
              Chưa dịch ({segmentStatusCounts.untranslated})
            </button>
            <button
              type="button"
              className={`studio-filter-chip ${segmentStatusFilter === "missing_voice" ? "active" : ""}`}
              onClick={() =>
                setSegmentStatusFilter((cur) => (cur === "missing_voice" ? "none" : "missing_voice"))
              }
              title="Chỉ hiện câu chưa có tiếng lồng tiếng"
            >
              Thiếu tiếng ({segmentStatusCounts.missingVoice})
            </button>
            <button
              type="button"
              className={`studio-filter-chip ${segmentStatusFilter === "long" ? "active" : ""}`}
              onClick={() => setSegmentStatusFilter((cur) => (cur === "long" ? "none" : "long"))}
              title="Chỉ hiện câu dài hơn 12 giây"
            >
              Câu &gt;12s ({segmentStatusCounts.long})
            </button>
            <button
              type="button"
              className={`studio-filter-chip ${speakerFilter === "all" ? "active" : ""}`}
              onClick={() => setSpeakerFilter("all")}
            >
              Tất cả ({segments.length})
            </button>
            {speakers.map((spk) => (
              <button
                key={spk.id}
                type="button"
                className={`studio-filter-chip ${speakerFilter === spk.id ? "active" : ""}`}
                onClick={() => setSpeakerFilter(spk.id)}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: spk.color,
                    marginRight: 4,
                  }}
                />
                {spk.name} ({segments.filter((s) => s.speakerId === spk.id).length})
              </button>
            ))}
          </div>

          {/* Segment List */}
          <div className="studio-segments-list">
            {filteredSegments.map((seg) => {
              const spk = speakers.find((s) => s.id === seg.speakerId) || speakers[0];
              const isSelected = seg.id === selectedSegId;

              return (
                <StudioSegmentCard
                  key={seg.id}
                  seg={seg}
                  isSelected={isSelected}
                  spk={spk}
                  speakers={speakers}
                  previewingSegId={previewingSegId}
                  onSelect={handleSelectSegment}
                  onNudge={handleNudgeSegment}
                  onUpdateSpeaker={handleUpdateSegmentSpeaker}
                  onUpdateTranslated={handleUpdateTranslated}
                  onPreviewTts={handlePreviewSegmentTts}
                  onClearVoice={handleClearVoiceAudioForSegment}
                  onSplit={handleSplitSegment}
                  onDelete={(id) => {
                    saveSubtitleUndo();
                    setSegments((prev) => prev.filter((s) => s.id !== id));
                    if (activeVoiceSegRef.current === id) {
                      stopVoicePlayback();
                    }
                  }}
                  onPreFocus={handlePreFocusText}
                  onSaveUndoIfChanged={saveTranslationUndoIfChanged}
                />
              );
            })}
          </div>
        </>
      ) : (
        <div className="studio-properties-panel">
          <div id="v14-cards" style={{ display: "contents" }}>
            <SubStyleCard
              value={v14.subStyle}
              onChange={v14.setSubStyle}
              availablePresets={V014_PRESETS}
              onPreviewPreset={v14.setPreviewPreset}
              positionLocked={v14.hardsub.enabled && !!v14.hardsub.band}
            />
            {v14.subStyle.mode === "normal" && (
              <div className="studio-prop-card">
                <div className="studio-prop-row">
                  <span>Màu chữ:</span>
                  <div className="studio-prop-swatches">
                    {[
                      { name: "Vàng", color: "#e8a33d" },
                      { name: "Trắng", color: "#ffffff" },
                      { name: "Xanh", color: "#38bdf8" },
                      { name: "Xanh lá", color: "#4ade80" },
                      { name: "Đỏ", color: "#f87171" },
                    ].map((c) => (
                      <div
                        key={c.color}
                        className={`studio-prop-swatch ${subFontColor === c.color ? "active" : ""}`}
                        style={{ background: c.color }}
                        onClick={() => {
                          setSubFontColor(c.color);
                          showToast(`Đã chọn màu phụ đề: ${c.name}`);
                        }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <HardsubCard
              enabled={v14.hardsub.enabled}
              state={v14.cardState}
              blur={v14.hardsub.blur}
              stamp={v14.hardsub.stamp}
              scope={v14.hardsub.scope}
              spans={v14.hardsub.spans}
              durationSec={mediaDuration}
              bandTooShort={
                !!v14.hardsub.band &&
                !!v14.videoSize &&
                bandShorterThanText(v14.hardsub.band, v14.subStyle.fontSize, v14.videoSize.h)
              }
              modelDownloadPct={v14.modelPct}
              modelMb={4}
              bandManual={v14.bandIsManual}
              onToggle={v14.setEnabled}
              onRedetect={() => void handleHardsubDetect(v14.lastRegion)}
              onCancel={handleCancelHardsubDetect}
              onDownloadModel={() => void v14.downloadModel()}
              onInstallDeps={() => void v14.installDeps()}
              onDetectOtherHalf={() => void handleHardsubDetect("any")}
              onManualBand={v14.placeDefaultBand}
              onResetBand={v14.resetBand}
              onBlur={(blur) => v14.patchHardsub({ blur })}
              onStamp={(stamp) => v14.patchHardsub({ stamp })}
              onScope={(scope) => v14.patchHardsub({ scope })}
              onSeek={(sec) => handleSeek(sec)}
            />
          </div>

          <div className="studio-prop-card">
            <div className="studio-prop-title">
              <span>📹 Thông Tin & Thuộc Tính Video</span>
            </div>
            <div className="studio-prop-row">
              <span>Tệp đang mở:</span>
              <span style={{ color: "var(--t1)", fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fileName}
              </span>
            </div>
            <div className="studio-prop-row">
              <span>Thời lượng:</span>
              <span style={{ color: "var(--ac)", fontWeight: 700 }}>
                {formatTimecode(mediaDuration)} ({mediaDuration.toFixed(1)}s)
              </span>
            </div>
            <div className="studio-prop-row">
              <span>Số câu thoại:</span>
              <span>{segments.length} câu</span>
            </div>
            <div className="studio-prop-row">
              <span>Số nhân vật:</span>
              <span>{speakers.length} vai</span>
            </div>
            <div className="studio-prop-row">
              <span>Tỷ lệ hiển thị:</span>
              <span>16:9 Cinema Widescreen</span>
            </div>
          </div>
        </div>
      )}
        </aside>
      </div>

      {/* ====================================================================
          PREMIERE-STYLE TIMELINE VERTICAL RESIZER
          ==================================================================== */}
      <div
        className={`studio-timeline-resizer ${isResizingTimeline ? "is-resizing" : ""}`}
        onMouseDown={handleTimelineResizeStart}
        title="Kéo lên / xuống để mở rộng hoặc thu gọn không gian Timeline (Premiere Pro style)"
      >
        <div className="studio-timeline-resizer-line" />
        <div className="studio-timeline-resizer-grip" />
      </div>

      {/* ====================================================================
          P5 — TIMELINE ĐA LÀN (BOTTOM TIMELINE)
          ==================================================================== */}
      <footer
        className="studio-timeline-area"
        style={{ height: `${timelineHeight}px` }}
      >
        {/* P5a: Timeline Control Bar */}
        <div className="studio-timeline-ctrl-bar">
          {/* ROUND-12: NLE Tool Mode Switcher (Tách riêng Chọn câu thoại vs Tua Timeline vs Khoanh vùng) */}
          <div className="studio-timeline-mode-switcher">
            <button
              type="button"
              className={`studio-timeline-mode-btn ${timelineToolMode === "select" ? "active" : ""}`}
              onClick={() => {
                setTimelineToolMode("select");
                showToast("🖐️ Chế độ Chọn: Quét chọn & sửa câu thoại (Phím V)");
              }}
              title="Chế độ Chọn câu thoại & Quét Marquee Box (Phím V)"
            >
              <span>🖐️ Chọn (V)</span>
            </button>
            <button
              type="button"
              className={`studio-timeline-mode-btn ${timelineToolMode === "scrub" ? "active" : ""}`}
              onClick={() => {
                setTimelineToolMode("scrub");
                showToast("⏱️ Chế độ Tua: Di chuột & tua video mọi vị trí (Phím T)");
              }}
              title="Chế độ Tua & Dò vị trí video (Phím T)"
            >
              <span>⏱️ Tua (T)</span>
            </button>
            <button
              type="button"
              className={`studio-timeline-mode-btn ${timelineToolMode === "range" ? "active" : ""}`}
              onClick={() => {
                setTimelineToolMode("range");
                showToast("🎯 Chế độ Khoanh vùng In/Out (Phím R)");
              }}
              title="Chế độ Khoanh vùng phạm vi In/Out (Phím R)"
            >
              <span>🎯 Vùng (R)</span>
            </button>
          </div>

          <div className="studio-timeline-tools-divider" />

          {/* EZMAX Action Tools */}
          <div className="studio-timeline-tools-group">
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={() => handleSplitSegment()}
              title="Cắt tại playhead (Split)"
            >
              <IconScissors size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={handleDuplicateSegment}
              title="Nhân bản (Duplicate)"
            >
              <IconCopy size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={() => handleDeleteSegment()}
              title="Xoá câu (Delete)"
            >
              <IconTrash size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              onClick={handleFitTimeline}
              title="Giãn kín timeline — phủ toàn bộ chiều dài video (Fit)"
            >
              <IconArrowsHorizontal size={13} />
            </button>
            <div className="studio-timeline-tools-divider" />
            <button
              type="button"
              className={`studio-timeline-tool-btn ${magnetSnap ? "active" : ""}`}
              onClick={() => {
                const next = !magnetSnap;
                setMagnetSnap(next);
                showToast(next ? "🧲 ĐÃ BẬT Tự động bắt dính Playhead vào mép câu thoại" : "ĐÃ TẮT Bắt dính");
              }}
              title="Tự động bắt dính — căn vào playhead và mép gần nhất (N)"
            >
              <IconMagnet size={13} />
            </button>
            <button
              type="button"
              className={`studio-timeline-tool-btn ${linkTracks ? "active" : ""}`}
              onClick={() => {
                const next = !linkTracks;
                setLinkTracks(next);
                showToast(next ? "🔗 ĐÃ BẬT Liên kết đồng bộ clip & phụ đề" : "ĐÃ TẮT Liên kết rãnh");
              }}
              title="Liên kết — di chuyển hoặc xoá nội dung đi kèm clip trên rãnh chính (P)"
            >
              <IconLink size={13} />
            </button>
            <button
              type="button"
              className="studio-timeline-tool-btn"
              title="Đánh dấu mốc thời gian (Marker — phím M; Shift+M = kế tiếp, Ctrl+Shift+M = trước)"
              onClick={() => {
                // [TSK-TIMELINE-INTEGRATE-MODULES] Marker dùng module markers.ts
                // (gộp trùng <0.05s, có id/tên/màu, lưu theo project).
                const prev = markersRef.current;
                const next = toggleMarker(prev, currentTimeRef.current);
                setMarkers(next);
                showToast(
                  next.length > prev.length
                    ? `🔖 Đã ghim marker tại mốc ${formatTimecode(currentTimeRef.current)}`
                    : `🔖 Đã bỏ marker tại mốc ${formatTimecode(currentTimeRef.current)}`,
                );
              }}
            >
              <IconBookmark size={13} />
            </button>
            <div className="studio-timeline-tools-divider" />
            {/* ROUND-8: In-Out Range Tools (Khoanh vùng phạm vi) */}
            <div className="studio-timeline-range-tools">
              <button
                type="button"
                className={`studio-timeline-tool-btn ${inPoint !== null ? "active" : ""}`}
                onClick={() => handleSetInPoint()}
                title="Đặt điểm Vào (Mark In — phím I)"
              >
                <span style={{ fontSize: 9.5, fontWeight: 800 }}>[ I</span>
              </button>
              <button
                type="button"
                className={`studio-timeline-tool-btn ${outPoint !== null ? "active" : ""}`}
                onClick={() => handleSetOutPoint()}
                title="Đặt điểm Ra (Mark Out — phím O)"
              >
                <span style={{ fontSize: 9.5, fontWeight: 800 }}>O ]</span>
              </button>
              {(inPoint !== null || outPoint !== null) && (
                <>
                  <button
                    type="button"
                    className="studio-timeline-tool-btn"
                    onClick={handleClearRange}
                    title="Xoá vùng chọn (Clear In/Out — phím X)"
                  >
                    <IconX size={12} />
                  </button>
                  <div
                    className="studio-range-badge"
                    title="Vùng chọn hiện tại. Nhấn để bật/tắt chế độ 'Chỉ áp dụng vùng này'"
                    onClick={() => {
                      const next = !useRangeOnly;
                      setUseRangeOnly(next);
                      showToast(next ? "🎯 BẬT chế độ 'Chỉ xử lý trong vùng chọn'" : "Đã TẮT chế độ vùng chọn (xử lý toàn video)");
                    }}
                    style={{ cursor: "pointer", opacity: useRangeOnly ? 1 : 0.65 }}
                  >
                    <span>🎯 {formatTimecode(Math.min(inPoint ?? 0, outPoint ?? mediaDuration))} ➔ {formatTimecode(Math.max(inPoint ?? 0, outPoint ?? mediaDuration))}</span>
                    <span style={{ fontSize: 9, opacity: 0.85 }}>({useRangeOnly ? "Bật" : "Tắt"})</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Transport Controls */}
          <div className="studio-timeline-transport">
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(0)}
              title="Về đầu (Home)"
            >
              ⏮
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(currentTime - 1)}
              title="Lùi 1 giây"
            >
              ◀
            </button>
            <button
              type="button"
              className="studio-btn-transport-play"
              onClick={handleTogglePlay}
              title="Phát / Dừng (Phím Cách)"
            >
              {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(currentTime + 1)}
              title="Tiến 1 giây"
            >
              ▶
            </button>
            <button
              type="button"
              className="studio-btn-transport"
              onClick={() => handleSeek(mediaDuration)}
              title="Đến cuối (End)"
            >
              ⏭
            </button>

            <div className="studio-timeline-timecode">
              {/* [TSK-TIMELINE-INTEGRATE-MODULES] Ô nhập timecode (Premiere):
                  - Node hiển thị do TimecodeInput giữ ref → file này ghi textContent
                    trực tiếp (đường 60fps sẵn có, không setState).
                  - Giá trị hiện tại được đọc qua getSeconds() (hàm ổn định) khi bấm mở ô nhập,
                    KHÔNG truyền prop `seconds` đổi liên tục.
                  - Enter → nhảy tới (clamp theo độ dài media); Esc → huỷ. */}
              <TimecodeInput
                displayRef={timecodeElementRef}
                getSeconds={getCurrentSeconds}
                onSeek={handleTimecodeSeek}
                fps={25}
              />
              <span className="studio-timeline-timecode-total">/ {formatTimecode(mediaDuration)}</span>
            </div>
          </div>

          <div
            className={`studio-timeline-batch-toggle ${batchMode ? "active" : ""}`}
            onClick={() => setBatchMode(!batchMode)}
            title="Batch Mode: Tự động chạy hàng loạt cho nhiều tập phim"
          >
            <input type="checkbox" checked={batchMode} readOnly style={{ cursor: "pointer" }} />
            <span>Chạy hàng loạt: {batchMode ? "Bật" : "Tắt"}</span>
          </div>

          <div className="studio-timeline-zoom-wrap">
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => {
                const speeds = [1.0, 1.25, 1.5, 2.0, 0.5];
                const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                const nextSpeed = speeds[nextIdx];
                // [TSK-TIMELINE-INTEGRATE-MODULES] Tắt shuttle J/K/L trước khi đổi tốc độ
                // → không có 2 nguồn tốc độ cùng lúc (shuttle là nguồn tạm thời).
                stopShuttleLoop();
                shuttleRef.current = createShuttleState();
                setPlaybackSpeed(nextSpeed);
                if (videoRef.current) {
                  videoRef.current.playbackRate = nextSpeed;
                }
                showToast(`⚡ Tốc độ phát video: ${nextSpeed}x`);
              }}
              title="Nhấn để đổi tốc độ phát (0.5x, 1.0x, 1.25x, 1.5x, 2.0x)"
              style={{ fontSize: 11, padding: "2px 6px", cursor: "pointer" }}
            >
              Tốc độ: {playbackSpeed}x
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.max(100, Math.round(z / 2)))}
              title="Zoom out mạnh (×0.5) — xem toàn cảnh video. Phím tắt: −"
              style={{ fontSize: 12, fontWeight: 700, padding: "0 6px", cursor: "pointer" }}
            >
              −−
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.max(100, Math.round(z / 1.5)))}
              title="Zoom out nhẹ (×0.67). Phím tắt: −"
              style={{ fontSize: 16, fontWeight: 700, padding: "0 8px", cursor: "pointer" }}
            >
              −
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel(100)}
              title="Reset về 100% = full video fit viewport. Phím tắt: \\"
              style={{ fontSize: 11, padding: "0 5px", cursor: "pointer" }}
            >
              ⟲
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.min(10000, Math.round(z * 1.5)))}
              title="Zoom in nhẹ (×1.5). Phím tắt: +"
              style={{ fontSize: 16, fontWeight: 700, padding: "0 8px", cursor: "pointer" }}
            >
              +
            </button>
            <button
              type="button"
              className="studio-btn-subtle-sm"
              onClick={() => setZoomLevel((z) => Math.min(10000, Math.round(z * 2)))}
              title="Zoom in mạnh (×2) — frame cực lớn, tick 0.1s. Phím tắt: +"
              style={{ fontSize: 12, fontWeight: 700, padding: "0 6px", cursor: "pointer" }}
            >
              ++
            </button>
            <span
              style={{
                minWidth: 56,
                textAlign: "right",
                fontWeight: 600,
                fontSize: 12,
                color: "var(--studio-accent, #5b9dff)",
                fontVariantNumeric: "tabular-nums",
              }}
              title="Zoom hiện tại (% viewport — 100% = full video fit)"
            >
              {zoomLevel}%
            </span>
          </div>
        </div>

        {/* ROUND-25: Điều kiện hiển thị động cho Track Phụ Đề & Track Tiếng Lồng */}
        {(() => {
          const showSubtitlesTrack =
            segments.length > 0 ||
            (isAnalyzing &&
              (workflowOptStt ||
                timelineProcessType === "stt" ||
                timelineProcessType === "translate" ||
                timelineProcessType === "pipeline"));

          const showVoiceTrack = showSubtitlesTrack;

          return (
            <div className="studio-timeline-scroll-wrap">
              {/* Left Track Headers (Fixed) */}
              <div className="studio-timeline-track-headers">
                <div className="studio-timeline-ruler-header-spacer">
                  <span>TRACKS</span>
                  {showVoiceTrack && speakers.length > 1 && (
                    <button
                      type="button"
                      className={`studio-track-collapse-btn ${collapseSpeakerTracks ? "active" : ""}`}
                      onClick={() => setCollapseSpeakerTracks(!collapseSpeakerTracks)}
                      title={collapseSpeakerTracks ? "Mở rộng từng track nhân vật riêng biệt" : "Thu gọn tất cả nhân vật vào 1 track duy nhất"}
                    >
                      {collapseSpeakerTracks ? "↕ Mở" : "↕ Gọn"}
                    </button>
                  )}
                </div>
                <div className="studio-track-header-item">
                  <div className="studio-track-header-left">
                    <span></span>
                    <span>▼ VIDEO</span>
                  </div>
                </div>
                <div className="studio-track-header-item">
                  <div className="studio-track-header-left">
                    <span>♫ TIẾNG GỐC</span>
                  </div>
                  <button
                    type="button"
                    className={`studio-track-mute-btn ${isOriginalMuted ? "muted" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOriginalMuted((prev) => !prev);
                    }}
                    title={isOriginalMuted ? "Đang TẮT tiếng video gốc (Mute) — Bấm để BẬT lại (Unmute)" : "Bấm để TẮT tiếng video gốc (Mute)"}
                  >
                    M
                  </button>
                </div>

                {/* Track 3: Phụ Đề (Chỉ hiện khi có phụ đề hoặc đang tạo) */}
                {showSubtitlesTrack && (
                  <div className="studio-track-header-item">
                    <div className="studio-track-header-left">
                      <span>💬 PHỤ ĐỀ (TEXT)</span>
                      {transcriptSource &&
                        (transcriptSource.startsWith("srt:") ? (
                          <span
                            className="studio-track-src-badge src-yt"
                            title={`Phụ đề GỐC đang dùng lấy từ file YouTube (.${transcriptSource.split(":")[1]}.srt đã tải) — bật/tắt tại mục "📥 Tận dụng phụ đề đã tải"`}
                          >
                            📥 PHỤ ĐỀ YOUTUBE (.{transcriptSource.split(":")[1]})
                          </span>
                        ) : (
                          <span
                            className="studio-track-src-badge src-ai"
                            title="Phụ đề GỐC đang dùng do phần mềm tự nhận dạng bằng Whisper STT (video không có file .srt tải sẵn)"
                          >
                            🎙 AI TỰ TẠO
                          </span>
                        ))}
                    </div>
                    <div className="studio-track-header-actions">
                      {/* [TSK-TIMELINE-INTEGRATE-MODULES] Khoá track phụ đề (Premiere):
                          khoá → chặn kéo/trim/cắt đôi/xoá/sửa chữ/dán trên track này. */}
                      <button
                        type="button"
                        className={`studio-track-lock-btn ${isTrackLocked(trackLocks, "subtitles") ? "locked" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTrackLocks((prev) => toggleTrackLock(prev, "subtitles"));
                        }}
                        title={
                          isTrackLocked(trackLocks, "subtitles")
                            ? "Track phụ đề đang KHOÁ — bấm để mở khoá"
                            : "Khoá track phụ đề (chặn kéo/trim/cắt/xoá/sửa chữ/dán)"
                        }
                      >
                        {isTrackLocked(trackLocks, "subtitles") ? "🔒" : "🔓"}
                      </button>
                      <button
                        className="studio-track-clear-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearTrack("subtitles");
                        }}
                        title="Xoá toàn bộ câu trong track phụ đề"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )}

                {/* Track 4: Dynamic Speaker Tracks (Chỉ hiện khi có tiếng lồng hoặc đang tạo) */}
                {showVoiceTrack && (collapseSpeakerTracks || speakers.length === 0 ? (
                  <div className="studio-track-header-item studio-track-header-voice">
                    <div className="studio-track-header-left">
                      <span className="studio-track-header-dot-stack">
                        {(speakers.length > 0 ? speakers.slice(0, 3) : [{ id: "def", color: "#38bdf8" }]).map((s) => (
                          <span
                            key={s.id}
                            className="studio-track-header-dot"
                            style={{ background: s.color }}
                          />
                        ))}
                      </span>
                      <span className="studio-track-voice-tag">🎙️ TIẾNG LỒNG</span>
                      <span style={{ fontSize: 10, color: "var(--t3)" }}>({speakers.length > 0 ? `${speakers.length} vai` : "Thuyết minh AI"})</span>
                    </div>
                    <div className="studio-track-header-actions">
                      <button
                        type="button"
                        className={`studio-track-mute-btn ${isVoiceMuted ? "muted" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsVoiceMuted((prev) => !prev);
                        }}
                        title={isVoiceMuted ? "Đang TẮT tiếng lồng AI (Mute) — Bấm để BẬT lại (Unmute)" : "Bấm để TẮT tiếng lồng AI (Mute)"}
                      >
                        M
                      </button>
                      {segments.some((s) => s.hasAudio) && (
                        <button
                          className="studio-track-clear-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearTrack("speaker", "all");
                          }}
                          title="Xoá âm thanh lồng tiếng của tất cả vai (giữ nguyên phụ đề)"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  speakers.map((spk) => {
                    const spkName = getSpeakerDisplayName(spk);
                    const engineTag = spk.voice?.startsWith("vietneu:")
                      ? "VietNeu"
                      : spk.voice?.startsWith("kokoro:")
                      ? "Kokoro"
                      : "Edge";

                    return (
                      <div key={spk.id} className="studio-track-header-item studio-track-header-voice">
                        <div className="studio-track-header-left">
                          <span
                            className="studio-track-header-dot"
                            style={{ background: spk.color }}
                          />
                          <span className="studio-track-voice-tag" title="Track âm thanh giọng lồng tiếng">
                            🎙️ TIẾNG LỒNG:
                          </span>
                          <span className="studio-track-voice-name" title={`Vai: ${spkName} • Giọng: ${spk.voice}`}>
                            {spkName}
                          </span>
                          <span className="studio-track-voice-engine-badge">
                            {engineTag}
                          </span>
                        </div>
                        <div className="studio-track-header-actions">
                          <button
                            type="button"
                            className={`studio-track-mute-btn ${isVoiceMuted ? "muted" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsVoiceMuted((prev) => !prev);
                            }}
                            title={isVoiceMuted ? "Đang TẮT tiếng lồng AI (Mute) — Bấm để BẬT lại (Unmute)" : "Bấm để TẮT tiếng lồng AI (Mute)"}
                          >
                            M
                          </button>
                          {/* [TSK-TIMELINE-INTEGRATE-MODULES] Khoá track lồng tiếng của vai này
                              (Premiere): khoá → chặn kéo/trim/xoá tiếng lồng + dán trên track này. */}
                          <button
                            type="button"
                            className={`studio-track-lock-btn ${isTrackLocked(trackLocks, speakerTrackKey(spk.id)) ? "locked" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTrackLocks((prev) =>
                                toggleTrackLock(prev, speakerTrackKey(spk.id)),
                              );
                            }}
                            title={
                              isTrackLocked(trackLocks, speakerTrackKey(spk.id))
                                ? `Track lồng tiếng của vai ${spkName} đang KHOÁ — bấm để mở khoá`
                                : `Khoá track lồng tiếng của vai ${spkName}`
                            }
                          >
                            {isTrackLocked(trackLocks, speakerTrackKey(spk.id)) ? "🔒" : "🔓"}
                          </button>
                          <button
                            className="studio-track-clear-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearTrack("speaker", spk.id);
                            }}
                            title={`Xoá âm thanh lồng tiếng của vai ${spkName} (giữ nguyên phụ đề)`}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })
                ))}

                {!showSubtitlesTrack && (
                  <div className="studio-track-header-item studio-track-header-empty-hint">
                    {/* [UI_R2-8_REVIEW mục 11] Bỏ tiếng Anh lẫn tạp ("Sub / Voice"). */}
                    <span style={{ fontSize: 10, color: "var(--t3)", fontStyle: "italic", opacity: 0.7 }}>
                      (Chưa có phụ đề / giọng)
                    </span>
                  </div>
                )}
              </div>

          {/* Right Tracks Body (Horizontal Scroll) */}
          <div
            ref={timelineTracksBodyRef}
            className={`studio-timeline-tracks-body ${isDraggingPlayhead ? "scrubbing" : ""}`}
            onMouseDown={handleTimelineMouseDown}
            onWheel={handleTimelineWheel}
            onContextMenu={handleTimelineContextMenu}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDraggingFile(false); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingFile(false);
              const file = e.dataTransfer?.files?.[0];
              if (file) {
                const p = (file as any).path || file.name;
                if (p) {
                  lastLoadedInitialPathRef.current = p;
                  onClearPendingFile?.();
                  handleLoadNewVideoFile(p);
                  showToast(`Đã nạp video: ${file.name}`);
                }
              }
            }}
          >
            {/* ROUND-11: Marquee Box Selection Overlay */}
            {marqueeBox && (
              <div
                className="studio-timeline-marquee-box"
                style={{
                  left: `${Math.min(marqueeBox.startX, marqueeBox.currentX)}px`,
                  top: `${Math.min(marqueeBox.startY, marqueeBox.currentY)}px`,
                  width: `${Math.abs(marqueeBox.currentX - marqueeBox.startX)}px`,
                  height: `${Math.abs(marqueeBox.currentY - marqueeBox.startY)}px`,
                }}
              />
            )}

            {/* Vạch hít (snap) khi kéo thả khối — chỉ đổi qua DOM ref, không setState */}
            <div ref={snapLineRef} className="studio-timeline-snap-line" />

            {/* Playhead Vertical Needle */}
            <div
              ref={playheadElementRef}
              className={`studio-timeline-playhead ${isDraggingPlayhead ? "dragging" : ""}`}
              style={{ left: `${(currentTime / Math.max(1, mediaDuration)) * timelineWidth}px` }}
            >
              <div
                className={`studio-timeline-playhead-head ${isDraggingPlayhead ? "dragging" : ""}`}
                style={{
                  left: (currentTime / Math.max(1, mediaDuration)) * timelineWidth < 8 ? "0px" : "-8px",
                  clipPath: (currentTime / Math.max(1, mediaDuration)) * timelineWidth < 8
                    ? "polygon(0% 0%, 100% 0%, 100% 65%, 0% 100%)"
                    : "polygon(0% 0%, 100% 0%, 100% 65%, 50% 100%, 0% 65%)",
                }}
                onMouseDown={handlePlayheadMouseDown}
                onTouchStart={(e) => {
                  if (e.touches.length > 0) startScrubbing(e.touches[0].clientX);
                }}
                title="Kéo thả đầu kim để tua / chạy video qua timeline (Scrubbing)"
              />
            </div>

            {/* ROUND-8: Selection Range Overlay Band & Dimmed Outside Area */}
            {inPoint !== null && outPoint !== null && (
              <>
                {/* Left Dimmed Outside Area */}
                {Math.min(inPoint, outPoint) > 0 && (
                  <div
                    className="studio-timeline-dimmed-outside"
                    style={{
                      left: 0,
                      width: `${(Math.min(inPoint, outPoint) / Math.max(1, mediaDuration)) * timelineWidth}px`,
                    }}
                  />
                )}

                {/* Selection Range Band */}
                <div
                  className="studio-timeline-range-band"
                  style={{
                    left: `${(Math.min(inPoint, outPoint) / Math.max(1, mediaDuration)) * timelineWidth}px`,
                    width: `${(Math.abs(outPoint - inPoint) / Math.max(1, mediaDuration)) * timelineWidth}px`,
                  }}
                />

                {/* Right Dimmed Outside Area */}
                {Math.max(inPoint, outPoint) < mediaDuration && (
                  <div
                    className="studio-timeline-dimmed-outside"
                    style={{
                      left: `${(Math.max(inPoint, outPoint) / Math.max(1, mediaDuration)) * timelineWidth}px`,
                      width: `${((mediaDuration - Math.max(inPoint, outPoint)) / Math.max(1, mediaDuration)) * timelineWidth}px`,
                    }}
                  />
                )}
              </>
            )}

            {/* Time Ruler */}
            <div
              className="studio-timeline-ruler"
              style={{ width: `${timelineWidth + 40}px`, minWidth: `${timelineWidth + 40}px` }}
              onMouseDown={handleRulerMouseDown}
              onTouchStart={(e) => {
                if (e.touches.length > 0) startScrubbing(e.touches[0].clientX);
              }}
              onClick={handleTimelineClick}
              title="Bấm giữ và kéo rê để chạy video theo mốc thời gian (hoặc Giữ Shift + Kéo để khoanh vùng)"
            >
              {/* ROUND-8: Range Handles (In / Out) on Ruler */}
              {inPoint !== null && (
                <div
                  className="studio-ruler-range-handle in"
                  style={{ left: `${(inPoint / Math.max(1, mediaDuration)) * timelineWidth}px` }}
                  onMouseDown={(e) => startDraggingRangeHandle(e, "in")}
                  title={`Điểm Vào (In): ${formatTimecode(inPoint)} — Kéo để điều chỉnh`}
                >
                  [ IN
                </div>
              )}
              {outPoint !== null && (
                <div
                  className="studio-ruler-range-handle out"
                  style={{ left: `${(outPoint / Math.max(1, mediaDuration)) * timelineWidth}px` }}
                  onMouseDown={(e) => startDraggingRangeHandle(e, "out")}
                  title={`Điểm Ra (Out): ${formatTimecode(outPoint)} — Kéo để điều chỉnh`}
                >
                  OUT ]
                </div>
              )}

              {Array.from({ length: Math.ceil(mediaDuration / tickIntervalSec) + 1 }).map((_, i) => {
                const t = i * tickIntervalSec;
                if (t > mediaDuration + 2) return null;
                return (
                  <div
                    key={t}
                    className="studio-timeline-tick"
                    style={{
                      left: `${(t / Math.max(1, mediaDuration)) * timelineWidth}px`,
                      transform: t === 0 ? "none" : "translateX(-50%)",
                      paddingLeft: t === 0 ? 4 : 0,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSeek(t);
                    }}
                  >
                    {formatTimecode(t)}
                  </div>
                );
              })}

              {/* [TSK-TIMELINE-INTEGRATE-MODULES] Vạch marker (memo — không re-render theo playhead) */}
              <StudioTimelineMarkerLines
                markers={markers}
                timelineWidth={timelineWidth}
                totalDur={mediaDuration}
                onMarkerClick={stableMarkerClick}
              />

              {/* Marker Flags (🔖) trên thước thời gian */}
              {markers.map((marker, idx) => (
                <div
                  key={marker.id}
                  style={{
                    position: "absolute",
                    left: `${(marker.time / Math.max(1, mediaDuration)) * timelineWidth}px`,
                    top: 2,
                    fontSize: 10,
                    color: marker.color ?? "#38bdf8",
                    cursor: "pointer",
                    zIndex: 10,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSeek(marker.time);
                    showToast(`Nhảy tới marker: ${formatTimecode(marker.time)}`);
                  }}
                  title={`Marker ${idx + 1}: ${formatTimecode(marker.time)}`}
                >
                  🔖
                </div>
              ))}
            </div>

            {/* Track 1: Video Filmstrip */}
            <div
              className="studio-track-lane studio-track-media-lane"
              style={{ width: `${timelineWidth + 40}px`, minWidth: `${timelineWidth + 40}px`, cursor: "col-resize" }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startScrubbing(e.clientX);
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleTimelineClick(e);
              }}
              title="🎞️ Khung hình video: Bấm hoặc kéo để tua nhanh video"
            >
              <div className="studio-filmstrip-thumbs">
                {filmstripThumbs.length > 0 ? (
                  filmstripThumbs.map((thumb, i) => {
                    const nextTime = i < filmstripThumbs.length - 1 ? filmstripThumbs[i + 1].time_sec : mediaDuration;
                    const left = (thumb.time_sec / Math.max(1, mediaDuration)) * timelineWidth;
                    const w = ((nextTime - thumb.time_sec) / Math.max(1, mediaDuration)) * timelineWidth;
                    return (
                      <div
                        key={i}
                        className="studio-filmstrip-thumb-item"
                        style={{
                          position: "absolute",
                          left: `${left}px`,
                          width: `${Math.max(36, w - 2)}px`,
                          height: "32px",
                          overflow: "hidden",
                          borderRadius: 3,
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          background: "#0f172a",
                        }}
                        title={`Khung hình mốc ${formatTimecode(thumb.time_sec)}`}
                      >
                        <img
                          src={thumb.data_uri}
                          alt={`Khung ${i}`}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            bottom: 1,
                            right: 2,
                            fontSize: 8,
                            background: "rgba(0,0,0,0.65)",
                            color: "#fff",
                            padding: "0 2px",
                            borderRadius: 2,
                          }}
                        >
                          {formatTimecode(thumb.time_sec)}
                        </span>
                      </div>
                    );
                  })
                ) : mediaDuration > 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      width: `${timelineWidth}px`,
                      height: "32px",
                      background: "linear-gradient(90deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))",
                      border: "1px solid rgba(56, 189, 248, 0.25)",
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 12px",
                      gap: 8,
                      overflow: "hidden",
                    }}
                  >
                    <span style={{ fontSize: 13 }}>🎞️</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#f1f5f9" }}>{fileName || "Video"}</span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>({formatTimecode(mediaDuration)})</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, color: isPreviewExtracting ? "#38bdf8" : "#64748b", fontStyle: "italic" }}>
                      {isPreviewExtracting ? "⚡ Đang tạo sóng âm & khung hình..." : "Sẵn sàng phân tích"}
                    </span>
                  </div>
                ) : (
                  <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>
                    Chưa nạp video
                  </div>
                )}
              </div>
            </div>

            {/* Track 2: Original Waveform */}
            <div
              className="studio-track-lane studio-track-media-lane"
              style={{ width: `${timelineWidth + 40}px`, minWidth: `${timelineWidth + 40}px`, cursor: "col-resize" }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startScrubbing(e.clientX);
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleTimelineClick(e);
              }}
              title="♫ Sóng âm: Bấm hoặc kéo để tua nhanh video"
            >
              <canvas
                ref={waveformCanvasRef}
                className="studio-waveform-canvas"
                width={Math.min(timelineWidth, 8192)}
                height={32}
                style={{ width: `${timelineWidth}px`, height: 32, marginLeft: 0 }}
              />
            </div>

            {/* Track 3: Subtitles Block Lane (Progressive Filling - Chỉ hiện khi có sub hoặc đang tạo) */}
            {showSubtitlesTrack && (
              <div
                className="studio-track-lane studio-track-workspace-lane workspace-start"
                style={{ width: `${timelineWidth + 40}px`, minWidth: `${timelineWidth + 40}px` }}
                onClick={(e) => {
                  if (timelineToolMode === "scrub") {
                    handleTimelineClick(e);
                  } else if (!didJustMarqueeRef.current) {
                    clearSegmentSelection();
                  }
                }}
              >
                {/* ROUND-8: Visual Progressive Fill Overlay on Subtitles Track */}
                {timelineProcessType && (
                  (() => {
                    const isRange = useRangeOnly && inPoint !== null && outPoint !== null;
                    const startSec = isRange ? Math.min(inPoint, outPoint) : 0;
                    const endSec = isRange ? Math.max(inPoint, outPoint) : mediaDuration;
                    const totalSec = Math.max(0.1, endSec - startSec);
                    const startLeftPx = (startSec / Math.max(1, mediaDuration)) * timelineWidth;
                    const totalWidthPx = (totalSec / Math.max(1, mediaDuration)) * timelineWidth;
                    const currentWidthPx = totalWidthPx * (timelineProgress / 100);

                    return (
                      <div
                        className={`studio-timeline-progress-fill ${timelineProcessType}`}
                        style={{
                          left: `${startLeftPx}px`,
                          width: `${Math.max(12, currentWidthPx)}px`,
                        }}
                      >
                        <div className="studio-timeline-progress-stripes" />
                        <div className="studio-timeline-laser-head">
                          <div className="studio-timeline-laser-badge">
                            ⚡ {timelineProcessMessage || `${timelineProgress.toFixed(0)}%`}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}

                {segments.map((seg) => {
                  const isSelected = seg.id === selectedSegId;
                  const isMultiSelected = selectedSegIds.includes(seg.id);

                  return (
                    <StudioTimelineSubtitleBlock
                      key={seg.id}
                      seg={seg}
                      totalDur={Math.max(1, mediaDuration)}
                      timelineWidth={timelineWidth}
                      isSelected={isSelected}
                      isMultiSelected={isMultiSelected}
                      onBlockClick={stableSubClick}
                      onBlockMouseDown={stableSubDown}
                      onNudge={stableNudge}
                    />
                  );
                })}
              </div>
            )}

            {/* Track 4..n: Dynamic Speaker Tracks (Chỉ hiện khi có tiếng lồng hoặc đang tạo) */}
            {showVoiceTrack && (collapseSpeakerTracks || speakers.length === 0 ? (
              <div
                className="studio-track-lane studio-track-workspace-lane"
                style={{ width: `${timelineWidth + 40}px`, minWidth: `${timelineWidth + 40}px` }}
                onClick={(e) => {
                  if (timelineToolMode === "scrub") {
                    handleTimelineClick(e);
                  } else if (!didJustMarqueeRef.current) {
                    clearSegmentSelection();
                  }
                }}
              >
                {/* Visual Progressive Fill on Voice / Pipeline */}
                {(timelineProcessType === "voice" || timelineProcessType === "pipeline") && (
                  (() => {
                    const isRange = useRangeOnly && inPoint !== null && outPoint !== null;
                    const startSec = isRange ? Math.min(inPoint, outPoint) : 0;
                    const endSec = isRange ? Math.max(inPoint, outPoint) : mediaDuration;
                    const totalSec = Math.max(0.1, endSec - startSec);
                    const startLeftPx = (startSec / Math.max(1, mediaDuration)) * timelineWidth;
                    const totalWidthPx = (totalSec / Math.max(1, mediaDuration)) * timelineWidth;
                    const currentWidthPx = totalWidthPx * (timelineProgress / 100);

                    return (
                      <div
                        className="studio-timeline-progress-fill voice"
                        style={{
                          left: `${startLeftPx}px`,
                          width: `${Math.max(12, currentWidthPx)}px`,
                          opacity: 0.85,
                        }}
                      >
                        <div className="studio-timeline-progress-stripes" />
                        <div className="studio-timeline-laser-head">
                          <div className="studio-timeline-laser-badge">
                            🎙️ Tiếng lồng: {timelineProcessMessage || `${timelineProgress.toFixed(0)}%`}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
                {(() => {
                  const hasAnyAudio = segments.some((s) => s.hasAudio);
                  const isGeneratingVoice = timelineProcessType === "voice" || timelineProcessType === "pipeline";

                  if (!hasAnyAudio && !isGeneratingVoice) {
                    return (
                      <div className="studio-track-empty-placeholder">
                        <span>🎙️ Track tiếng lồng trống — Bấm "3. Lồng tiếng (TTS)" ở cột trái hoặc bấm vào câu để tạo giọng đọc AI</span>
                      </div>
                    );
                  }

                  const voiceSegments = segments.filter((s) => s.hasAudio || s.id === selectedSegId);

                  return voiceSegments.map((seg, segIdx) => {
                    const spk = speakers.find((s) => s.id === seg.speakerId) || speakers[0];
                    const spkName = getSpeakerDisplayName(spk);
                    const totalDur = Math.max(1, mediaDuration);
                    // R32: khối lồng bám theo ĐỘ DÀI TIẾNG THẬT (TTS thật hoặc ước tính theo từ, không bao giờ dài hơn video gốc)
                    // + không được chồng lên câu kế tiếp.
                    const voiceDur = computeVoiceBlockDur(seg, totalDur, voiceSegments[segIdx + 1]?.start);

                    return (
                      <StudioTimelineVoiceBlock
                        key={seg.id}
                        seg={seg}
                        voiceDur={voiceDur}
                        totalDur={totalDur}
                        timelineWidth={timelineWidth}
                        spkName={spkName}
                        spkColor={spk?.color || "#38bdf8"}
                        isSelected={seg.id === selectedSegId}
                        isMultiSelected={selectedSegIds.includes(seg.id)}
                        isSpeaking={currentPlayingVoiceSegId === seg.id}
                        onBlockClick={stableVoiceClick}
                        onBlockMouseDown={stableVoiceDown}
                        onNudge={stableNudge}
                      />
                    );
                  });
                })()}
              </div>
            ) : (
              speakers.map((spk) => {
                const spkSegments = segments.filter((s) => {
                  if (s.speakerId === spk.id) return true;
                  const hasValidSpeaker = speakers.some((other) => other.id === s.speakerId);
                  return !hasValidSpeaker && spk.id === speakers[0]?.id;
                });
                const spkName = getSpeakerDisplayName(spk);

                return (
                  <div
                    key={spk.id}
                    className="studio-track-lane studio-track-workspace-lane"
                    style={{ width: `${timelineWidth + 40}px`, minWidth: `${timelineWidth + 40}px` }}
                    onClick={(e) => {
                      if (timelineToolMode === "scrub") {
                        handleTimelineClick(e);
                      } else if (!didJustMarqueeRef.current) {
                        clearSegmentSelection();
                      }
                    }}
                  >
                    {/* ROUND-8: Visual Progressive Fill on Voice / Pipeline */}
                    {(timelineProcessType === "voice" || timelineProcessType === "pipeline") && (
                      (() => {
                        const isRange = useRangeOnly && inPoint !== null && outPoint !== null;
                        const startSec = isRange ? Math.min(inPoint, outPoint) : 0;
                        const endSec = isRange ? Math.max(inPoint, outPoint) : mediaDuration;
                        const totalSec = Math.max(0.1, endSec - startSec);
                        const startLeftPx = (startSec / Math.max(1, mediaDuration)) * timelineWidth;
                        const totalWidthPx = (totalSec / Math.max(1, mediaDuration)) * timelineWidth;
                        const currentWidthPx = totalWidthPx * (timelineProgress / 100);

                        return (
                          <div
                            className="studio-timeline-progress-fill voice"
                            style={{
                              left: `${startLeftPx}px`,
                              width: `${Math.max(12, currentWidthPx)}px`,
                              opacity: 0.85,
                            }}
                          >
                            <div className="studio-timeline-progress-stripes" />
                            <div className="studio-timeline-laser-head">
                              <div className="studio-timeline-laser-badge">
                                🎙️ Tiếng lồng [{spkName}]: {timelineProcessMessage || `${timelineProgress.toFixed(0)}%`}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    )}
                    {(() => {
                      const hasSpkAudio = spkSegments.some((s) => s.hasAudio);
                      const isGeneratingVoice = timelineProcessType === "voice" || timelineProcessType === "pipeline";

                      if (!hasSpkAudio && !isGeneratingVoice) {
                        return (
                          <div className="studio-track-empty-placeholder">
                            <span>🎙️ Track trống (chưa có câu nào lồng tiếng của vai {spkName})</span>
                          </div>
                        );
                      }

                      const voiceSegments = spkSegments.filter((s) => s.hasAudio || s.id === selectedSegId);

                      return voiceSegments.map((seg, segIdx) => {
                        const totalDur = Math.max(1, mediaDuration);
                        // R32: khối lồng bám theo ĐỘ DÀI TIẾNG THẬT (TTS thật hoặc ước tính theo từ, không bao giờ dài hơn video gốc)
                        // + không được chồng lên câu kế tiếp của cùng vai.
                        const voiceDur = computeVoiceBlockDur(seg, totalDur, voiceSegments[segIdx + 1]?.start);

                        return (
                          <StudioTimelineVoiceBlock
                            key={seg.id}
                            seg={seg}
                            voiceDur={voiceDur}
                            totalDur={totalDur}
                            timelineWidth={timelineWidth}
                            spkName={spkName}
                            spkColor={spk.color}
                            showSpeakerTag={false}
                            isSelected={seg.id === selectedSegId}
                            isMultiSelected={selectedSegIds.includes(seg.id)}
                            isSpeaking={currentPlayingVoiceSegId === seg.id}
                            onBlockClick={stableVoiceClick}
                            onBlockMouseDown={stableVoiceDown}
                            onNudge={stableNudge}
                          />
                        );
                      });
                    })()}
                  </div>
                );
              })
            ))}

            {/* Hint Banner: Khi chưa có Subtitles Track và Voice Track */}
            {!showSubtitlesTrack && !showVoiceTrack && (
              <div
                className="studio-empty-timeline-hint"
                style={{ width: `${timelineWidth + 40}px`, minWidth: `${timelineWidth + 40}px` }}
              >
                <div className="studio-empty-timeline-hint-content">
                  <span className="studio-empty-hint-icon">💡</span>
                  <div className="studio-empty-hint-text">
                    <strong>Chưa có track Phụ đề & Tiếng lồng</strong>
                    <span>
                      {/* [UI_R2-8_REVIEW mục 10] Nút "Bắt Đầu Xử Lý AI" đã bị bỏ
                          (Zero-Button) ⇒ hướng dẫn trỏ sang nút chạy của panel trái. */}
                      Bấm <em>▶ Chạy {enabledStepCount} bước đã bật</em> ở panel trái, hoặc khoanh vùng trên timeline rồi <em>bấm chuột phải</em> để tạo phân đoạn mong muốn.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    })()}
  </footer>

      {/* ROUND-16: Modal Cấu Hình Xuất Video (Softsub/Hardsub & Multi-track VLC) */}
      {showExportModal && (
        <div className="studio-modal-backdrop" onClick={() => setShowExportModal(false)}>
          <div className="studio-modal-box studio-export-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="studio-modal-title">
              <IconClapper size={18} />
              <span>Cấu Hình Xuất Video & Đóng Gói Media</span>
              <button
                type="button"
                className="studio-modal-close-btn"
                onClick={() => setShowExportModal(false)}
                title="Đóng cửa sổ"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="studio-export-dialog-content">
              {/* PHẦN 1: ĐƯỜNG TIẾNG (AUDIO TRACKS) */}
              <div className="studio-export-section">
                <div className="studio-export-section-title">
                  <span>🎧 Chế độ Đường tiếng (Audio Tracks)</span>
                  <span className="studio-export-badge-note">Chuẩn phát đa kênh VLC</span>
                </div>
                <div className="studio-export-options-grid">
                  {/* Option 1: multitrack */}
                  <div
                    className={`studio-export-option-card ${exportAudioMode === "multitrack" ? "selected" : ""}`}
                    onClick={() => setExportAudioMode("multitrack")}
                  >
                    <div className="studio-export-option-header">
                      <input
                        type="radio"
                        name="export_audio_mode"
                        checked={exportAudioMode === "multitrack"}
                        onChange={() => setExportAudioMode("multitrack")}
                      />
                      <strong>Đa đường tiếng (Multi-track)</strong>
                      <span className="studio-export-pill-rec">Khuyên dùng cho VLC</span>
                    </div>
                    <p className="studio-export-option-desc">
                      Đóng gói cả 2 đường tiếng vào file MP4 (Track 1 = Tiếng gốc, Track 2 = Thuyết minh AI).
                      Khi mở trong VLC hoặc TV, bạn có thể bấm chuột phải chọn/đổi đường tiếng bất cứ lúc nào như phim chiếu rạp.
                    </p>
                  </div>

                  {/* Option 2: mixed */}
                  <div
                    className={`studio-export-option-card ${exportAudioMode === "mixed" ? "selected" : ""}`}
                    onClick={() => setExportAudioMode("mixed")}
                  >
                    <div className="studio-export-option-header">
                      <input
                        type="radio"
                        name="export_audio_mode"
                        checked={exportAudioMode === "mixed"}
                        onChange={() => setExportAudioMode("mixed")}
                      />
                      <strong>Trộn 1 đường tiếng (Mixed / Ducking)</strong>
                    </div>
                    <p className="studio-export-option-desc">
                      Hòa trộn tiếng gốc và giọng thuyết minh AI thành 1 track duy nhất (tự động giảm nhỏ nhạc nền khi có lời nói). Thích hợp đăng lên Facebook, YouTube, TikTok.
                    </p>
                  </div>

                  {/* Option 3: original */}
                  <div
                    className={`studio-export-option-card ${exportAudioMode === "original" ? "selected" : ""}`}
                    onClick={() => setExportAudioMode("original")}
                  >
                    <div className="studio-export-option-header">
                      <input
                        type="radio"
                        name="export_audio_mode"
                        checked={exportAudioMode === "original"}
                        onChange={() => setExportAudioMode("original")}
                      />
                      <strong>Chỉ giữ tiếng gốc (Original Only)</strong>
                      <span className="studio-export-pill-fast">Siêu tốc</span>
                    </div>
                    <p className="studio-export-option-desc">
                      Không kèm giọng đọc AI, giữ nguyên vẹn âm thanh gốc của video. Tối ưu khi bạn chỉ muốn làm phụ đề và xuất video nhanh.
                    </p>
                  </div>
                </div>
              </div>

              {/* PHẦN 2: PHỤ ĐỀ (SUBTITLES) */}
              <div className="studio-export-section" style={{ marginTop: 14 }}>
                <div className="studio-export-section-title">
                  <span>💬 Chế độ Phụ đề (Subtitles)</span>
                  <span className="studio-export-badge-note">Kèm file .srt rời</span>
                </div>
                <div className="studio-export-options-grid">
                  {/* Option 1: softsub */}
                  <div
                    className={`studio-export-option-card ${exportSubMode === "softsub" ? "selected" : ""}`}
                    onClick={() => setExportSubMode("softsub")}
                  >
                    <div className="studio-export-option-header">
                      <input
                        type="radio"
                        name="export_sub_mode"
                        checked={exportSubMode === "softsub"}
                        onChange={() => setExportSubMode("softsub")}
                      />
                      <strong>Phụ đề mềm nhúng (Softsub)</strong>
                      <span className="studio-export-pill-rec">Bật/Tắt tùy ý</span>
                    </div>
                    <p className="studio-export-option-desc">
                      Nhúng phụ đề vào container MP4 (-c:s mov_text). Tự do Bật / Tắt hoặc đổi ngôn ngữ trong VLC/TV. Luôn tự động xuất kèm 1 file <code>.srt</code> rời bên cạnh video.
                    </p>
                  </div>

                  {/* Option 2: hardsub */}
                  <div
                    className={`studio-export-option-card ${exportSubMode === "hardsub" ? "selected" : ""}`}
                    onClick={() => setExportSubMode("hardsub")}
                  >
                    <div className="studio-export-option-header">
                      <input
                        type="radio"
                        name="export_sub_mode"
                        checked={exportSubMode === "hardsub"}
                        onChange={() => setExportSubMode("hardsub")}
                      />
                      <strong>Khắc cứng vào video (Hardsub)</strong>
                    </div>
                    <p className="studio-export-option-desc">
                      In thẳng phụ đề vào khung hình video (-vf subtitles). Chạy mượt trên mọi thiết bị và MXH (Shorts, Reels, TikTok) không lo lỗi font chữ.
                    </p>
                  </div>

                  {/* Option 3: none */}
                  <div
                    className={`studio-export-option-card ${exportSubMode === "none" ? "selected" : ""}`}
                    onClick={() => setExportSubMode("none")}
                  >
                    <div className="studio-export-option-header">
                      <input
                        type="radio"
                        name="export_sub_mode"
                        checked={exportSubMode === "none"}
                        onChange={() => setExportSubMode("none")}
                      />
                      <strong>Không nhúng phụ đề</strong>
                    </div>
                    <p className="studio-export-option-desc">
                      Video xuất ra sạch hoàn toàn không chữ, chỉ có file <code>.srt</code> rời bên cạnh nếu dự án có phụ đề.
                    </p>
                  </div>
                </div>

                {/* [TSK-V014-WIRE-STUDIO] Tóm tắt kiểu phụ đề + phụ đề cứng (chỉnh ở tab Thuộc tính, không lặp control) */}
                <div className="v14-export-sum">
                  <div className="ln">
                    <span>
                      Kiểu chữ: {v14.subStyle.mode === "kinetic" ? "Nhảy chữ" : "Bình thường"}
                    </span>
                    <button type="button" onClick={goToV14Cards}>Đổi</button>
                  </div>
                  {v14.hardsub.enabled ? (
                    <div className="ln">
                      <span>
                        {v14.running
                          ? "Làm mờ phụ đề cứng: đang dò — sẽ xuất khi dò xong"
                          : v14.hardsub.band
                            ? `Làm mờ ${v14.hardsub.blur === "light" ? "nhẹ" : v14.hardsub.blur === "strong" ? "mạnh" : "vừa"}${v14.hardsub.stamp ? " + tem" : ""}${
                                v14.videoSize
                                  ? ` · dải ${Math.round((v14.hardsub.band.y / v14.videoSize.h) * 100)}–${Math.round(((v14.hardsub.band.y + v14.hardsub.band.h) / v14.videoSize.h) * 100)} %`
                                  : ""
                              }${v14.hardsub.spans.length ? ` · ${v14.hardsub.spans.length} đoạn` : ""}`
                            : v14.cardState.kind === "idle"
                              ? "Sẽ dò phụ đề cứng trước khi xuất"
                              : "Không có dải phụ đề cứng — sẽ không làm mờ"}
                      </span>
                      <button type="button" onClick={goToV14Cards}>Đổi</button>
                    </div>
                  ) : (
                    <div className="ln dim">
                      <button type="button" onClick={goToV14Cards}>Video gốc có chữ in sẵn? Làm mờ &amp; đè tem ›</button>
                    </div>
                  )}
                  {exportSubMode === "softsub" && (v14.subStyle.mode === "kinetic" || v14.hardsub.enabled) && (
                    <div className="wr">
                      ⚠ Phụ đề mềm luôn là kiểu Bình thường và không nằm vào dải mờ — chọn “Khắc cứng” để dùng chữ nhảy / làm mờ.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="studio-export-dialog-footer">
              <button
                type="button"
                className="studio-btn-subtle"
                onClick={() => setShowExportModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="studio-btn-action-primary"
                onClick={handleConfirmExportVideo}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <IconClapper size={14} /> {v14.running && v14.hardsub.enabled ? "Xuất khi dò xong" : "Bắt đầu xuất video"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tiến Trình Đang Xuất Video */}
      {isExporting && (
        <div className="studio-modal-backdrop">
          <div className="studio-modal-box">
            <div className="studio-modal-title">
              <IconClapper size={18} />
              <span>
                {queuedPosition !== null
                  ? `Đang chờ lượt #${queuedPosition} để xuất video...`
                  : "Đang Xuất Video & Đóng Gói Media..."}
              </span>
            </div>
            <div className="studio-progress-bar-bg">
              <div className="studio-progress-bar-fill" style={{ width: `${exportProgress}%` }} />
            </div>
            <div style={{ fontSize: 13, color: "var(--t1)", fontWeight: 600, marginTop: 4 }}>
              {exportProgress}% — {exportMessage}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 6 }}>
              Vui lòng không đóng cửa sổ trong lúc FFmpeg đang xử lý và đóng gói video...
            </div>
            <button type="button" className="studio-btn-action-danger" style={{ marginTop: 10 }} onClick={handleCancelAnalysis}>
              {queuedPosition !== null ? "Hủy chờ" : "■ Dừng xuất"}
            </button>
          </div>
        </div>
      )}

      {/* Modal Thông Báo Xuất Hoàn Tất */}
      {!isExporting && Boolean(exportDonePath) && (
        <div className="studio-modal-backdrop" onClick={() => setExportDonePath("")}>
          <div className="studio-modal-box studio-export-success-box" onClick={(e) => e.stopPropagation()}>
            <div className="studio-modal-title" style={{ color: "#22c55e" }}>
              <IconCheck size={20} />
              <span>Xuất Video Hoàn Tất!</span>
              <button
                type="button"
                className="studio-modal-close-btn"
                onClick={() => setExportDonePath("")}
                title="Đóng cửa sổ"
              >
                <IconX size={16} />
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--t2)", marginTop: 6, lineHeight: 1.5 }}>
              Video thành phẩm đã được đóng gói hoàn tất tại:
              <div
                style={{
                  background: "rgba(0,0,0,0.35)",
                  padding: "8px 10px",
                  borderRadius: 6,
                  fontFamily: "monospace",
                  fontSize: 11.5,
                  color: "var(--ac)",
                  wordBreak: "break-all",
                  marginTop: 6,
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {exportDonePath}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                className="studio-btn-subtle"
                onClick={() => sublix.downloaderOpenFile(exportDonePath)}
                title="Mở video bằng trình phát mặc định của hệ điều hành (VLC/Media Player)"
                style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}
              >
                ▶ Mở Bằng VLC / Player Ngoài
              </button>
              <button
                type="button"
                className="studio-btn-action-primary"
                onClick={() => sublix.dubbingOpenOutputFolder(exportDonePath)}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                📁 Mở Thư Mục Thành Phẩm
              </button>
              <button
                type="button"
                className="studio-btn-subtle"
                onClick={() => setExportDonePath("")}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROUND-9: Modal Gộp Vai Diễn (Merge Roles Modal) */}
      {showMergeModal && (
        <div className="studio-modal-backdrop" onClick={() => setShowMergeModal(false)}>
          <div className="studio-modal-box studio-merge-modal" onClick={(e) => e.stopPropagation()}>
            <div className="studio-modal-title">
              <IconLink size={18} />
              <span>Gộp Vai Diễn (Merge Roles)</span>
              <button
                type="button"
                className="studio-modal-close-btn"
                onClick={() => setShowMergeModal(false)}
                title="Đóng cửa sổ gộp"
              >
                <IconX size={16} />
              </button>
            </div>

            <p className="studio-merge-modal-desc">
              Chuyển toàn bộ các câu thoại từ <strong>Vai nguồn</strong> sang <strong>Vai đích</strong>.
              Timeline sẽ được sắp xếp lại tự động và giữ tính đồng bộ hoàn hảo.
            </p>

            <div className="studio-merge-fields">
              <div className="studio-merge-field">
                <label>Vai nguồn (Cần gộp đi):</label>
                <select
                  className="studio-form-select"
                  value={mergeFromSpkId}
                  onChange={(e) => setMergeFromSpkId(e.target.value)}
                >
                  {speakers.map((spk) => (
                    <option key={spk.id} value={spk.id}>
                      {spk.name} ({segments.filter((s) => s.speakerId === spk.id).length} câu)
                    </option>
                  ))}
                </select>
              </div>

              <div className="studio-merge-arrow">➔</div>

              <div className="studio-merge-field">
                <label>Vai đích (Nhận câu thoại):</label>
                <select
                  className="studio-form-select"
                  value={mergeToSpkId}
                  onChange={(e) => setMergeToSpkId(e.target.value)}
                >
                  {speakers
                    .filter((spk) => spk.id !== mergeFromSpkId)
                    .map((spk) => (
                      <option key={spk.id} value={spk.id}>
                        {spk.name} ({segments.filter((s) => s.speakerId === spk.id).length} câu)
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="studio-merge-options">
              <label className="studio-merge-checkbox-label">
                <input
                  type="checkbox"
                  checked={deleteSourceAfterMerge}
                  onChange={(e) => setDeleteSourceAfterMerge(e.target.checked)}
                />
                <span>Xoá bỏ vai nguồn sau khi gộp xong (Khuyên dùng để dọn sạch timeline)</span>
              </label>
            </div>

            <div className="studio-merge-actions">
              <button
                type="button"
                className="studio-btn-voice-preview"
                onClick={() => setShowMergeModal(false)}
              >
                Huỷ
              </button>
              <button
                type="button"
                className="studio-btn-action-primary"
                onClick={handleConfirmMergeSpeakers}
              >
                <IconCheck size={14} /> Xác Nhận Gộp Vai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="studio-floating-toast">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Nhãn thời gian nổi theo chuột khi kéo thả khối (cập nhật qua DOM ref) */}
      <div ref={dragTipRef} className="studio-drag-tip" />

      {/* ROUND-25: TIMELINE CONTEXT MENU (PREMIERE / NLE CINEMA STYLE) */}
      {timelineContextMenu && timelineContextMenu.visible && (
        <div
          className="studio-timeline-context-menu"
          style={{
            left: `${Math.min(timelineContextMenu.x, window.innerWidth - 290)}px`,
            top: `${Math.min(timelineContextMenu.y, window.innerHeight - 400)}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* [TSK-STUDIO-GLOSSARY] Dịch lại 1 câu (hiện khi con trỏ nằm trên 1 câu). */}
          {timelineContextMenu.segId !== null ? (
            <button
              type="button"
              className="timeline-ctx-item"
              onClick={() => {
                const segId = timelineContextMenu.segId;
                setTimelineContextMenu(null);
                if (segId !== null) void handleRetranslateSegment(segId);
              }}
            >
              <span className="timeline-ctx-icon">🔁</span>
              <div className="timeline-ctx-text">
                <span className="timeline-ctx-main-text">Dịch lại câu này</span>
                <span className="timeline-ctx-desc-text">
                  Dịch lại đúng 1 câu dưới con trỏ (bám bảng thuật ngữ đã duyệt)
                </span>
              </div>
            </button>
          ) : null}
          {timelineContextMenu.hasRange ? (
            <>
              {/* Header khi đã có vùng chọn In/Out */}
              <div className="timeline-ctx-header">
                <div className="timeline-ctx-title">
                  <span>🎯</span>
                  <span>Vùng Chọn: {formatTimecode(Math.min(timelineContextMenu.inPoint!, timelineContextMenu.outPoint!))} ➔ {formatTimecode(Math.max(timelineContextMenu.inPoint!, timelineContextMenu.outPoint!))}</span>
                </div>
                <div className="timeline-ctx-sub">
                  {(Math.abs(timelineContextMenu.outPoint! - timelineContextMenu.inPoint!)).toFixed(2)}s • {timelineContextMenu.segCount} câu trong vùng • chỉ xử lý các câu này
                </div>
              </div>

              {/* Tùy chọn 1: Bóc tách phụ đề vùng (Whisper chỉ nghe đoạn In→Out) */}
              <button
                type="button"
                className="timeline-ctx-item primary"
                onClick={() => runRangeAction("stt")}
              >
                <span className="timeline-ctx-icon">💬</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Bóc tách phụ đề vùng</span>
                  <span className="timeline-ctx-desc-text">Whisper chỉ nghe đoạn In ➔ Out, thay các câu trong vùng</span>
                </div>
                <span className="timeline-ctx-shortcut">Sub</span>
              </button>

              {/* Tùy chọn 2: Dịch lại vùng */}
              <button
                type="button"
                className={`timeline-ctx-item ${timelineContextMenu.segCount === 0 ? "disabled" : ""}`}
                onClick={() => runRangeAction("translate")}
              >
                <span className="timeline-ctx-icon">🌐</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Dịch lại vùng</span>
                  <span className="timeline-ctx-desc-text">
                    {timelineContextMenu.segCount > 0
                      ? `Dịch lại ${timelineContextMenu.segCount} câu sang ${targetLang.toUpperCase()} (ghi đè bản dịch cũ)`
                      : "Chưa có câu nào trong vùng — bóc tách phụ đề vùng trước"}
                  </span>
                </div>
                <span className="timeline-ctx-shortcut">Dịch</span>
              </button>

              {/* Tùy chọn 3: Tạo lại tiếng lồng vùng */}
              <button
                type="button"
                className={`timeline-ctx-item primary ${timelineContextMenu.segCount === 0 ? "disabled" : ""}`}
                onClick={() => runRangeAction("voice")}
              >
                <span className="timeline-ctx-icon">🎙️</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Tạo lại tiếng lồng vùng</span>
                  <span className="timeline-ctx-desc-text">
                    {timelineContextMenu.segCount > 0
                      ? `Đọc lại ${timelineContextMenu.segCount} câu trong vùng bằng giọng AI`
                      : "Chưa có câu nào trong vùng để lồng tiếng"}
                  </span>
                </div>
                <span className="timeline-ctx-shortcut">Voice</span>
              </button>

              {/* Tùy chọn 4: Bóc tách + dịch + lồng tiếng vùng (pipeline đầy đủ) */}
              <button
                type="button"
                className="timeline-ctx-item"
                onClick={() => runRangeAction("full")}
              >
                <span className="timeline-ctx-icon">⚡</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Bóc tách + dịch + lồng tiếng vùng</span>
                  <span className="timeline-ctx-desc-text">Chạy trọn pipeline cho vùng này, câu ngoài vùng giữ nguyên</span>
                </div>
                <span className="timeline-ctx-shortcut">Full</span>
              </button>

              <div className="timeline-ctx-divider" />

              {/* Tùy chọn 5: Phát Thử Vùng Chọn */}
              <button
                type="button"
                className="timeline-ctx-item"
                onClick={() => {
                  setTimelineContextMenu(null);
                  const start = Math.min(timelineContextMenu.inPoint!, timelineContextMenu.outPoint!);
                  handleSeek(start);
                  if (videoRef.current && videoRef.current.paused) {
                    handleTogglePlay();
                  }
                }}
              >
                <span className="timeline-ctx-icon">▶️</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Phát thử đoạn này</span>
                  <span className="timeline-ctx-desc-text">Tua về mốc In và phát video</span>
                </div>
                <span className="timeline-ctx-shortcut">Space</span>
              </button>

              {/* Tùy chọn 6: Xóa Phụ Đề Trong Vùng Chọn */}
              <button
                type="button"
                className="timeline-ctx-item danger"
                onClick={() => {
                  setTimelineContextMenu(null);
                  const minT = Math.min(timelineContextMenu.inPoint!, timelineContextMenu.outPoint!);
                  const maxT = Math.max(timelineContextMenu.inPoint!, timelineContextMenu.outPoint!);
                  const toDelete = segmentsRef.current.filter((s) => isSegInRange(s, minT, maxT));
                  if (toDelete.length === 0) {
                    showToast("ℹ️ Không có câu thoại nào trong vùng chọn");
                    return;
                  }
                  saveUndoHistory();
                  setSegments((prev) => prev.filter((s) => !isSegInRange(s, minT, maxT)));
                  clearSegmentSelection();
                  showToast(`🗑️ Đã xoá ${toDelete.length} câu thoại trong vùng chọn (Ctrl+Z để hoàn tác)`);
                }}
              >
                <span className="timeline-ctx-icon">🗑️</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Xoá các câu trong đoạn này</span>
                  <span className="timeline-ctx-desc-text">Xoá câu thoại nằm trong khoảng In/Out</span>
                </div>
                <span className="timeline-ctx-shortcut">Del</span>
              </button>

              {/* Tùy chọn 7: Bỏ Khoanh Vùng */}
              <button
                type="button"
                className="timeline-ctx-item"
                onClick={() => {
                  setTimelineContextMenu(null);
                  handleClearRange();
                }}
              >
                <span className="timeline-ctx-icon">❌</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Hủy khoanh vùng</span>
                  <span className="timeline-ctx-desc-text">Bỏ điểm In/Out về toàn bộ video</span>
                </div>
                <span className="timeline-ctx-shortcut">X</span>
              </button>
            </>
          ) : (
            <>
              {/* Header khi click tại mốc thời gian (chưa có vùng chọn) */}
              <div className="timeline-ctx-header">
                <div className="timeline-ctx-title">
                  <span>⏱️</span>
                  <span>Mốc Thời Gian: {formatTimecode(timelineContextMenu.time)}</span>
                </div>
                <div className="timeline-ctx-sub">
                  Đặt điểm In/Out để khoanh vùng xử lý AI
                </div>
              </div>

              {/* Đặt Điểm Vào (In) */}
              <button
                type="button"
                className="timeline-ctx-item"
                onClick={() => {
                  setTimelineContextMenu(null);
                  handleSetInPoint(timelineContextMenu.time);
                }}
              >
                <span className="timeline-ctx-icon">📍</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Đặt điểm vào tại đây</span>
                  <span className="timeline-ctx-desc-text">Bắt đầu vùng chọn từ {formatTimecode(timelineContextMenu.time)}</span>
                </div>
                <span className="timeline-ctx-shortcut">I</span>
              </button>

              {/* Đặt Điểm Ra (Out) */}
              <button
                type="button"
                className="timeline-ctx-item"
                onClick={() => {
                  setTimelineContextMenu(null);
                  handleSetOutPoint(timelineContextMenu.time);
                }}
              >
                <span className="timeline-ctx-icon">📍</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Đặt điểm ra tại đây</span>
                  <span className="timeline-ctx-desc-text">Kết thúc vùng chọn tại {formatTimecode(timelineContextMenu.time)}</span>
                </div>
                <span className="timeline-ctx-shortcut">O</span>
              </button>

              {/* Khoanh nhanh đoạn 5s */}
              <button
                type="button"
                className="timeline-ctx-item primary"
                onClick={() => {
                  setTimelineContextMenu(null);
                  const t = timelineContextMenu.time;
                  handleSetInPoint(t);
                  handleSetOutPoint(Math.min(mediaDuration, t + 5));
                  showToast(`🎯 Đã khoanh vùng nhanh 5 giây [${formatTimecode(t)} ➔ ${formatTimecode(Math.min(mediaDuration, t + 5))}]`);
                }}
              >
                <span className="timeline-ctx-icon">⚡</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Khoanh nhanh đoạn 5s từ đây</span>
                  <span className="timeline-ctx-desc-text">Tạo vùng chọn 5 giây để thử nghiệm nhanh</span>
                </div>
                <span className="timeline-ctx-shortcut">+5s</span>
              </button>

              {/* Nhảy Playhead Đến Đây */}
              <button
                type="button"
                className="timeline-ctx-item"
                onClick={() => {
                  setTimelineContextMenu(null);
                  handleSeek(timelineContextMenu.time);
                }}
              >
                <span className="timeline-ctx-icon">▶️</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Di chuyển playhead đến đây</span>
                  <span className="timeline-ctx-desc-text">Tua video đến {formatTimecode(timelineContextMenu.time)}</span>
                </div>
              </button>

              <div className="timeline-ctx-divider" />

              {/* [TSK-TIMELINE-REDO-RIPPLE] Ripple delete: xoá câu đang chọn + dồn câu phía sau sang trái. */}
              <button
                type="button"
                className={`timeline-ctx-item ${selectedSegIdsRef.current.length === 0 && selectedSegIdRef.current <= 0 ? "disabled" : ""}`}
                onClick={() => {
                  setTimelineContextMenu(null);
                  handleRippleDelete();
                }}
              >
                <span className="timeline-ctx-icon">🧹</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Xoá và dồn khoảng trống</span>
                  <span className="timeline-ctx-desc-text">
                    Xoá câu đang chọn, dồn các câu phía sau sang trái (Ripple delete)
                  </span>
                </div>
                <span className="timeline-ctx-shortcut">Shift+Del</span>
              </button>

              {/* Tạo Phụ Đề Cho Toàn Bộ Video */}
              <button
                type="button"
                className="timeline-ctx-item"
                onClick={() => {
                  setTimelineContextMenu(null);
                  void handleRunSttOnly(false);
                }}
              >
                <span className="timeline-ctx-icon">💬</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Tạo phụ đề toàn bộ video</span>
                  <span className="timeline-ctx-desc-text">Whisper STT quét toàn bộ video</span>
                </div>
              </button>

              {/* Tạo Tiếng Lồng Toàn Bộ Video */}
              <button
                type="button"
                className="timeline-ctx-item"
                onClick={() => {
                  setTimelineContextMenu(null);
                  void handleRunVoiceOnly(false);
                }}
              >
                <span className="timeline-ctx-icon">🎙️</span>
                <div className="timeline-ctx-text">
                  <span className="timeline-ctx-main-text">Tạo tiếng lồng toàn bộ video</span>
                  <span className="timeline-ctx-desc-text">Tổng hợp TTS cho tất cả câu thoại</span>
                </div>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
