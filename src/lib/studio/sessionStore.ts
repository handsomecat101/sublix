//! TSK-TABS-P3-SESSION-CORE — lưu / khôi phục phiên tab Studio (module THUẦN).
//!
//! Theo `docs/STUDIO_TABS_PLAN.md` §4.5:
//! - Khoá phiên `sublix_studio_session_v2` = `{ activeTabId, order[] }`.
//! - Mỗi tab một khoá riêng `sublix_studio_tab_v2_<tabId>` ⇒ không có 1 khoá phình,
//!   tránh vượt quota `localStorage` (~5 MB).
//! - Mỗi tab lưu: `filePath, fileName, mediaDuration, segments, speakers, markers,
//!   sttLang, targetLang, currentTime`.
//!
//! **Quy tắc quan trọng**
//! 1. **Bỏ `audioUrl`** (data-URI base64 của clip TTS) khỏi segment — quá nặng.
//!    Kèm theo đó `hasAudio` đặt về `false` ⇒ sau khi khôi phục, tiếng lồng **đã tạo
//!    không còn** ⇒ UI cần hiện toast "Cần tạo lại giọng" (xem `docs/STUDIO_TABS_PLAN.md`
//!    §4.5 "Hệ quả đã biết"). Cùng lý do, `sampleAudio` (data-URI base64 của clip giọng
//!    gốc trong vai) cũng bị bỏ.
//! 2. **Migrate khoá v1** `sublix_active_studio_project_v1` ⇒ thành tab đầu tiên, **một
//!    lần duy nhất**. Thứ tự bắt buộc: **ghi khoá mới TRƯỚC, xoá khoá cũ SAU** — nếu
//!    `setItem` lỗi (quota đầy) thì khoá cũ phải còn nguyên để lần sau thử lại.
//! 3. **JSON hỏng của 1 tab ⇒ bỏ riêng tab đó**, các tab khác giữ nguyên (không mất
//!    cả phiên).
//! 4. **Quota đầy** (`setItem` ném lỗi) ⇒ **không crash**, trả về cờ lỗi cho caller.
//!
//! Module không import React/Tauri ⇒ test được bằng `node --test`.
//! `storage` truyền vào dạng interface ⇒ test không cần trình duyệt.

// Dùng đuôi .ts/.tsx để `node --test` nạp được trực tiếp (tsconfig bật
// allowImportingTsExtensions ⇒ Vite/TS vẫn build bình thường).
import type { SpeakerItem, SubtitleItem } from "../../views/SublixStudioView.tsx";
import type { TimelineMarker } from "../timeline/markers.ts";
import { normalizeProjectPath } from "./resultGuard.ts";

/** Khoá chứa manifest của phiên (tab nào, thứ tự, tab đang chọn). */
export const SESSION_KEY = "sublix_studio_session_v2";

/** Tiền tố khoá của 1 tab. */
export const TAB_KEY_PREFIX = "sublix_studio_tab_v2_";

/** Khoá cũ (v1) — chỉ dùng để migrate một lần. */
export const LEGACY_V1_KEY = "sublix_active_studio_project_v1";

/** Phiên bản định dạng đang lưu (để sau này nâng cấp không đụng dữ liệu cũ). */
export const SESSION_VERSION = 2;

/** Tối đa số tab ghi trong manifest (khớp trần tab của `tabsModel.ts`). */
export const MAX_SESSION_TABS = 6;

/** Khoá của 1 tab. */
export function sessionTabKey(tabId: string): string {
  return `${TAB_KEY_PREFIX}${tabId}`;
}

/** Storage tối thiểu cần có (khớp `Storage` của trình duyệt / WebView2). */
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Segment đã bỏ dữ liệu nặng. */
export type PersistedSegment = Omit<SubtitleItem, "audioUrl" | "hasAudio"> & {
  /** Luôn `false` khi lưu/khôi phục (clip TTS không sống qua restart). */
  hasAudio?: false;
};

/** Vai đã bỏ clip mẫu (data-URI base64) — field `sampleAudio` bị bỏ HẲN. */
export type PersistedSpeaker = Omit<SpeakerItem, "sampleAudio">;

/** Dữ liệu 1 tab đã ghi xuống storage. */
export interface PersistedTab {
  tabId: string;
  filePath: string;
  fileName: string;
  mediaDuration: number;
  segments: PersistedSegment[];
  speakers: PersistedSpeaker[];
  markers: TimelineMarker[];
  sttLang?: string;
  targetLang?: string;
  currentTime: number;
  /** true = tab từng có tiếng lồng (đã bị bỏ khi lưu) ⇒ UI nhắc 'Cần tạo lại giọng'. */
  hadAudio?: boolean;
}

/** Dữ liệu 1 tab lúc **ghi** (còn `audioUrl` / `sampleAudio` — sẽ được bỏ khi lưu). */
export interface SessionTabInput {
  tabId: string;
  filePath: string;
  fileName: string;
  mediaDuration: number;
  segments: SubtitleItem[];
  speakers: SpeakerItem[];
  markers?: TimelineMarker[];
  sttLang?: string;
  targetLang?: string;
  currentTime: number;
  /** Tab đã khôi phục mà chưa tạo lại giọng — giữ cờ qua các lần lưu. */
  hadAudio?: boolean;
}

/** Manifest của phiên. */
export interface SessionManifest {
  /** Id tab đang chọn (null = chưa có tab nào). */
  activeTabId: string | null;
  /** Thứ tự tab (tab đầu tiên = tab trái cùng). */
  order: string[];
  /** Phiên bản định dạng. */
  version?: number;
}

/** Kết quả 1 thao tác ghi (không bao giờ throw ra ngoài). */
export interface SessionOpResult {
  ok: boolean;
  /** Thông báo lỗi (quota đầy, JSON hỏng…). */
  error?: string;
  /** Id các tab đã ghi thành công. */
  savedTabIds: string[];
}

/** Kết quả đọc cả phiên. */
export interface LoadedSession {
  /** Manifest **đã tự sửa** (bỏ id trỏ tab không còn, chỉnh activeTabId hợp lệ). */
  manifest: SessionManifest;
  /** Các tab đọc được, đúng thứ tự `order`. */
  tabs: PersistedTab[];
  /** Id tab bị bỏ vì JSON hỏng / khoá không tồn tại. */
  skippedTabIds: string[];
  /** true = manifest đã bị sửa (nên ghi lại để lần sau không sửa nữa). */
  repaired: boolean;
}

/** Kết quả migrate khoá v1. */
export interface MigrationResult {
  /** true = đã migrate thành công (khoá v1 đã bị xoá). */
  migrated: boolean;
  /** Id tab mới tạo từ khoá v1. */
  tabId?: string;
  /** true = bỏ qua vì phiên đã có tab cùng đường dẫn (không tạo tab trùng). */
  skippedDuplicate?: boolean;
  /** Lỗi (quota đầy…) — khoá v1 được GIỮ NGUYÊN để thử lại sau. */
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Tiện ích nội bộ
// ────────────────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

/** Đọc khoá — không bao giờ throw (storage hỏng ⇒ coi như không có). */
function safeGet(storage: SessionStorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Xoá khoá — không bao giờ throw. */
function safeRemove(storage: SessionStorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* bỏ qua */
  }
}

/** JSON.parse an toàn. */
function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// ────────────────────────────────────────────────────────────────────────────
// Manifest
// ────────────────────────────────────────────────────────────────────────────

/**
 * Đọc manifest phiên.
 *
 * Manifest hỏng / không có ⇒ trả về phiên rỗng (không throw).
 */
export function readSessionManifest(storage: SessionStorageLike): SessionManifest {
  const parsed = safeParse(safeGet(storage, SESSION_KEY));
  if (!isRecord(parsed)) return { activeTabId: null, order: [] };
  const order = Array.isArray(parsed.order)
    ? parsed.order.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const activeTabId = typeof parsed.activeTabId === "string" && parsed.activeTabId ? parsed.activeTabId : null;
  return { activeTabId, order, version: num(parsed.version, SESSION_VERSION) };
}

/**
 * Ghi manifest phiên.
 *
 * @returns ok=false khi `setItem` lỗi (quota đầy) — **không crash**.
 */
export function writeSessionManifest(
  storage: SessionStorageLike,
  manifest: SessionManifest,
): SessionOpResult {
  const payload: SessionManifest = {
    activeTabId: manifest.activeTabId,
    order: [...manifest.order],
    version: SESSION_VERSION,
  };
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(payload));
    return { ok: true, savedTabIds: [] };
  } catch (err) {
    return { ok: false, error: errorMessage(err), savedTabIds: [] };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Tab
// ────────────────────────────────────────────────────────────────────────────

/**
 * Bỏ dữ liệu nặng khỏi 1 segment: **xoá `audioUrl`** (data-URI base64) và ép
 * `hasAudio = false` (clip TTS không sống qua restart).
 */
export function stripSegment(segment: SubtitleItem): PersistedSegment {
  const { audioUrl: _audioUrl, ...rest } = segment;
  return { ...rest, hasAudio: false };
}

/** Bỏ clip mẫu (data-URI base64) khỏi 1 vai — field `sampleAudio` bị bỏ HẲN. */
export function stripSpeaker(speaker: SpeakerItem): PersistedSpeaker {
  const { sampleAudio: _sampleAudio, ...rest } = speaker;
  return { ...rest };
}

/** Chuyển dữ liệu tab (dạng đầy đủ) → dạng đã bỏ dữ liệu nặng (dạng lưu). */
export function toPersistedTab(input: SessionTabInput | PersistedTab): PersistedTab {
  const hadAudio =
    input.hadAudio === true ||
    (input.segments ?? []).some((s) => !!(s as { audioUrl?: string }).audioUrl || s.hasAudio === true);
  return {
    tabId: input.tabId,
    filePath: input.filePath,
    fileName: input.fileName,
    mediaDuration: num(input.mediaDuration),
    segments: (input.segments ?? []).map(stripSegment),
    speakers: (input.speakers ?? []).map(stripSpeaker),
    markers: (input.markers ?? []).map((m) => ({ ...m })),
    sttLang: input.sttLang,
    targetLang: input.targetLang,
    currentTime: num(input.currentTime),
    ...(hadAudio ? { hadAudio: true } : {}),
  };
}

/** Chuẩn hoá dữ liệu đọc từ storage (phòng khi JSON thiếu/sai kiểu field). */
function normalizePersistedTab(raw: unknown, tabId: string): PersistedTab | null {
  if (!isRecord(raw)) return null;
  const segments = Array.isArray(raw.segments)
    ? raw.segments.filter(isRecord).map((s) => {
        const { audioUrl: _audioUrl, ...rest } = s;
        return { ...rest, hasAudio: false } as PersistedSegment;
      })
    : [];
  const speakers = Array.isArray(raw.speakers)
    ? raw.speakers.filter(isRecord).map((s) => {
        const { sampleAudio: _sampleAudio, ...rest } = s;
        return { ...rest } as PersistedSpeaker;
      })
    : [];
  const markers = Array.isArray(raw.markers)
    ? raw.markers.filter(isRecord).map((m) => ({
        id: str(m.id),
        time: num(m.time),
        name: typeof m.name === "string" ? m.name : undefined,
        color: typeof m.color === "string" ? m.color : undefined,
      }))
    : [];
  return {
    tabId: str(raw.tabId, tabId) || tabId,
    filePath: str(raw.filePath),
    fileName: str(raw.fileName),
    mediaDuration: num(raw.mediaDuration),
    segments,
    speakers,
    markers,
    sttLang: typeof raw.sttLang === "string" ? raw.sttLang : undefined,
    targetLang: typeof raw.targetLang === "string" ? raw.targetLang : undefined,
    currentTime: num(raw.currentTime),
    ...(raw.hadAudio === true ? { hadAudio: true } : {}),
  };
}

/**
 * Đọc 1 tab từ storage.
 *
 * @returns null nếu khoá không tồn tại hoặc JSON hỏng (⇒ bỏ riêng tab đó, giữ tab khác).
 */
export function readSessionTab(storage: SessionStorageLike, tabId: string): PersistedTab | null {
  const raw = safeGet(storage, sessionTabKey(tabId));
  if (!raw) return null;
  const parsed = safeParse(raw);
  if (parsed === null) return null;
  return normalizePersistedTab(parsed, tabId);
}

/** Ghi khoá của 1 tab (KHÔNG đụng manifest) — nội bộ. */
function writeTabKey(storage: SessionStorageLike, persisted: PersistedTab): SessionOpResult {
  try {
    storage.setItem(sessionTabKey(persisted.tabId), JSON.stringify(persisted));
    return { ok: true, savedTabIds: [persisted.tabId] };
  } catch (err) {
    return { ok: false, error: errorMessage(err), savedTabIds: [] };
  }
}

/**
 * Ghi 1 tab (tự bỏ `audioUrl` trước khi ghi) **và đăng ký tab đó vào manifest**.
 *
 * - Tab mới ⇒ thêm vào cuối `order`; nếu phiên chưa có tab đang chọn thì tab này
 *   thành tab đang chọn.
 * - Tab đã có trong `order` ⇒ giữ nguyên vị trí.
 *
 * @returns ok=false nếu `setItem` lỗi (quota đầy) — **không crash**.
 */
export function saveSessionTab(
  storage: SessionStorageLike,
  tab: SessionTabInput | PersistedTab,
): SessionOpResult {
  const persisted = toPersistedTab(tab);
  const res = writeTabKey(storage, persisted);
  if (!res.ok) return res;
  const manifest = readSessionManifest(storage);
  if (manifest.order.includes(persisted.tabId)) {
    return { ok: true, savedTabIds: [persisted.tabId] };
  }
  const order = [...manifest.order, persisted.tabId];
  const activeTabId = manifest.activeTabId ?? persisted.tabId;
  const manifestRes = writeSessionManifest(storage, { activeTabId, order });
  return {
    ok: manifestRes.ok,
    error: manifestRes.error,
    savedTabIds: manifestRes.ok ? [persisted.tabId] : [],
  };
}

/**
 * Xoá 1 tab (xoá khoá tab + cập nhật manifest: bỏ khỏi `order`, chỉnh `activeTabId`).
 */
export function removeSessionTab(
  storage: SessionStorageLike,
  tabId: string,
): SessionOpResult {
  safeRemove(storage, sessionTabKey(tabId));
  const manifest = readSessionManifest(storage);
  const order = manifest.order.filter((id) => id !== tabId);
  const activeTabId =
    manifest.activeTabId === tabId ? (order[0] ?? null) : manifest.activeTabId;
  const res = writeSessionManifest(storage, { activeTabId, order });
  return { ok: res.ok, error: res.error, savedTabIds: [] };
}

// ────────────────────────────────────────────────────────────────────────────
// Cả phiên
// ────────────────────────────────────────────────────────────────────────────

/** Dữ liệu cần lưu cả phiên. */
export interface SessionSnapshot {
  /** Id tab đang chọn (null = không có). */
  activeTabId: string | null;
  /** Thứ tự tab. */
  order: string[];
  /** Dữ liệu từng tab. */
  tabs: SessionTabInput[];
}

/**
 * Lưu cả phiên: ghi từng tab trước, rồi ghi manifest.
 *
 * - Tab nào ghi lỗi (quota) vẫn được báo trong `savedTabIds` (chỉ chứa tab thành công).
 * - **Không crash** khi `setItem` ném lỗi.
 */
export function saveSession(storage: SessionStorageLike, snapshot: SessionSnapshot): SessionOpResult {
  const savedTabIds: string[] = [];
  const errors: string[] = [];
  for (const tab of snapshot.tabs) {
    const res = writeTabKey(storage, toPersistedTab(tab));
    if (res.ok) savedTabIds.push(res.savedTabIds[0]);
    else if (res.error) errors.push(res.error);
  }
  const order = snapshot.order.filter((id) => savedTabIds.includes(id));
  const activeTabId =
    snapshot.activeTabId && order.includes(snapshot.activeTabId)
      ? snapshot.activeTabId
      : (order[0] ?? null);
  const manifestRes = writeSessionManifest(storage, { activeTabId, order });
  if (!manifestRes.ok && manifestRes.error) errors.push(manifestRes.error);
  return {
    ok: errors.length === 0,
    error: errors.length ? errors.join(" | ") : undefined,
    savedTabIds,
  };
}

/**
 * Đọc cả phiên.
 *
 * - Tab JSON hỏng ⇒ **bỏ riêng tab đó** (`skippedTabIds`), các tab khác giữ nguyên.
 * - `order`/`activeTabId` trỏ tab không còn ⇒ **tự sửa** trong `manifest` trả về
 *   (`repaired = true` ⇒ caller nên ghi lại manifest bằng `writeSessionManifest`).
 *
 * Hàm này **không ghi gì** (thuần đọc) — caller quyết định có lưu bản sửa hay không.
 */
export function loadSession(storage: SessionStorageLike): LoadedSession {
  const raw = readSessionManifest(storage);
  const tabs: PersistedTab[] = [];
  const skippedTabIds: string[] = [];
  for (const id of raw.order) {
    const tab = readSessionTab(storage, id);
    if (tab) tabs.push(tab);
    else skippedTabIds.push(id);
  }
  const order = tabs.map((t) => t.tabId);
  const activeTabId =
    raw.activeTabId && order.includes(raw.activeTabId) ? raw.activeTabId : (order[0] ?? null);
  const repaired =
    order.length !== raw.order.length ||
    (raw.activeTabId ?? null) !== (activeTabId ?? null);
  return {
    manifest: { activeTabId, order, version: SESSION_VERSION },
    tabs,
    skippedTabIds,
    repaired,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Migrate khoá v1
// ────────────────────────────────────────────────────────────────────────────

/** Tuỳ chọn migrate v1. */
export interface MigrationOptions {
  /** Id tab mới (host tự sinh để giữ quy tắc id ổn định). */
  tabId?: string;
}

/** Id tab mặc định khi migrate (không truyền `tabId`). */
export const LEGACY_TAB_ID = "tab_legacy_1";

/**
 * Migrate khoá v1 `sublix_active_studio_project_v1` ⇒ thành **tab đầu tiên** của phiên v2.
 *
 * Thứ tự **bắt buộc**: ghi khoá mới **TRƯỚC**, xoá khoá cũ **SAU**.
 * Nếu `setItem` lỗi (quota đầy) ⇒ **giữ nguyên khoá v1** để lần sau thử lại.
 *
 * Migrate **một lần**: sau khi thành công, khoá v1 bị xoá ⇒ lần gọi sau trả `migrated: false`.
 */
export function migrateLegacySession(
  storage: SessionStorageLike,
  options: MigrationOptions = {},
): MigrationResult {
  const raw = safeGet(storage, LEGACY_V1_KEY);
  if (!raw) return { migrated: false };
  const parsed = safeParse(raw);
  if (!isRecord(parsed)) {
    // JSON hỏng ⇒ không dùng được ⇒ xoá để khỏi thử lại mãi mãi.
    safeRemove(storage, LEGACY_V1_KEY);
    return { migrated: false, error: "Khoá v1 hỏng JSON — đã xoá." };
  }

  const tabId = options.tabId ?? LEGACY_TAB_ID;
  const legacyTab: SessionTabInput = {
    tabId,
    filePath: str(parsed.filePath),
    fileName: str(parsed.fileName),
    mediaDuration: num(parsed.mediaDuration),
    segments: Array.isArray(parsed.segments) ? (parsed.segments as SubtitleItem[]) : [],
    speakers: Array.isArray(parsed.speakers) ? (parsed.speakers as SpeakerItem[]) : [],
    markers: Array.isArray(parsed.markers) ? (parsed.markers as TimelineMarker[]) : [],
    sttLang: typeof parsed.sttLang === "string" ? parsed.sttLang : undefined,
    targetLang: typeof parsed.targetLang === "string" ? parsed.targetLang : undefined,
    currentTime: num(parsed.currentTime),
  };

  const manifest = readSessionManifest(storage);
  const legacyKey = normalizeProjectPath(legacyTab.filePath);

  // Phiên đã có tab cùng đường dẫn ⇒ không tạo tab trùng, chỉ dọn khoá v1.
  const duplicate = manifest.order.some((id) => {
    const existing = readSessionTab(storage, id);
    return !!existing && normalizeProjectPath(existing.filePath) === legacyKey;
  });
  if (duplicate) {
    safeRemove(storage, LEGACY_V1_KEY);
    return { migrated: false, tabId, skippedDuplicate: true };
  }

  // 1) Ghi khoá tab MỚI trước.
  const tabRes = saveSessionTab(storage, legacyTab);
  if (!tabRes.ok) {
    // Quota đầy ⇒ GIỮ khoá v1 để lần sau thử lại.
    return { migrated: false, tabId, error: tabRes.error };
  }

  // 2) Ghi manifest MỚI (tab v1 thành tab ĐẦU TIÊN + tab đang chọn).
  const order = [tabId, ...manifest.order.filter((id) => id !== tabId)];
  const manifestRes = writeSessionManifest(storage, { activeTabId: tabId, order });
  if (!manifestRes.ok) {
    // Manifest chưa ghi được ⇒ bỏ luôn khoá tab vừa tạo, giữ khoá v1 để thử lại.
    safeRemove(storage, sessionTabKey(tabId));
    return { migrated: false, tabId, error: manifestRes.error };
  }

  // 3) Xoá khoá cũ — chỉ khi mọi khoá mới đã ghi thành công.
  safeRemove(storage, LEGACY_V1_KEY);
  return { migrated: true, tabId };
}
