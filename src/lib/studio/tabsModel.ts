//! Logic thuần cho tab Studio (TSK-TABS-P1) — test được bằng `node --test`.
//!
//! Mỗi video = 1 tab (kiểu Premiere). Instance `SublixStudioView` của mỗi tab vẫn
//! **mounted** ⇒ việc đang chạy không mất khi đổi tab. Module này chỉ lo danh sách
//! tab: thêm / đóng / chọn / khử trùng theo đường dẫn / trần 6 tab.

// Dùng đuôi .ts để `node --test` nạp được trực tiếp file này (tsconfig bật
// allowImportingTsExtensions ⇒ Vite/TS vẫn build bình thường).
import { normalizeProjectPath } from "./resultGuard.ts";

/** Trần số tab (mount-all ⇒ mỗi tab giữ cả timeline trong RAM). */
export const MAX_STUDIO_TABS = 6;

/** Trạng thái làm việc của 1 tab (1 ô biểu tượng trên tab — không thêm huy hiệu). */
export type TabBusyState = "idle" | "running" | "queued" | "error" | "done";

/** 1 tab trong thanh tab Studio. */
export interface StudioTab {
  /** Id ổn định của tab (dùng làm khoá React + tra cứu). */
  id: string;
  /** Đường dẫn video ("" = tab TRỐNG, chờ mở video). */
  path: string;
  /** Tên hiển thị trên tab (mặc định = tên file bỏ đuôi). */
  title: string;
  /** Trạng thái việc đang chạy. */
  busy: TabBusyState;
  /** % của bước đang chạy (0..100). */
  percent: number;
  /** Có thay đổi chưa lưu. */
  dirty: boolean;
}

/** Toàn bộ trạng thái thanh tab. */
export interface TabsState {
  tabs: StudioTab[];
  /** Id tab đang chọn (null = chưa có tab nào). */
  activeId: string | null;
}

/** Tạo tab mới (chưa gắn video). */
export function createTab(id: string, path = "", title = ""): StudioTab {
  return { id, path, title: title || titleFromPath(path), busy: "idle", percent: 0, dirty: false };
}

/** Tên file bỏ đuôi — dùng làm tên tab mặc định. */
export function titleFromPath(path: string): string {
  if (!path) return "Video mới";
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  return name.replace(/\.[^.]+$/, "") || name;
}

/** Cắt giữa tên quá dài (kiểu "Phim_ngan_CN_…tap03"). */
export function middleTruncate(text: string, max = 22): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, head)}…${tail > 0 ? text.slice(text.length - tail) : ""}`;
}

/** Trạng thái rỗng (chưa có tab nào). */
export function emptyTabsState(): TabsState {
  return { tabs: [], activeId: null };
}

/** Tìm tab theo đường dẫn (so chuẩn hoá — tránh mở trùng 1 video). */
export function findTabByPath(state: TabsState, path: string): StudioTab | undefined {
  const key = normalizeProjectPath(path);
  if (!key) return undefined;
  return state.tabs.find((tab) => normalizeProjectPath(tab.path) === key);
}

/** Tab đang chọn. */
export function activeTab(state: TabsState): StudioTab | undefined {
  if (!state.activeId) return undefined;
  return state.tabs.find((tab) => tab.id === state.activeId);
}

/** Kết quả thêm tab. */
export type AddTabOutcome =
  /** Đã có tab cùng path ⇒ chỉ chọn tab đó. */
  | { kind: "selected"; state: TabsState; tabId: string }
  /** Tab đang chọn TRỐNG ⇒ nạp video vào tab đó (không tạo tab mới). */
  | { kind: "reused-empty"; state: TabsState; tabId: string }
  /** Tạo tab mới. */
  | { kind: "added"; state: TabsState; tabId: string }
  /** Đạt trần ⇒ cần hỏi "Đóng tab cũ nhất không chạy việc?" (null = không đóng được). */
  | { kind: "needs-confirm"; state: TabsState; oldestClosableId: string | null };

/**
 * Thêm tab cho một video.
 *
 * @param id Id tab mới (sinh ở host).
 */
export function addTab(state: TabsState, id: string, path: string, title?: string): AddTabOutcome {
  const existing = findTabByPath(state, path);
  if (existing) {
    return { kind: "selected", state: { ...state, activeId: existing.id }, tabId: existing.id };
  }

  const current = activeTab(state);
  if (current && !current.path) {
    // Tab trống ⇒ tái dùng (giữ id để không mất state của instance đang mount).
    const tabs = state.tabs.map((tab) =>
      tab.id === current.id
        ? { ...tab, path, title: title || titleFromPath(path) }
        : tab,
    );
    return {
      kind: "reused-empty",
      state: { tabs, activeId: current.id },
      tabId: current.id,
    };
  }

  if (state.tabs.length >= MAX_STUDIO_TABS) {
    return {
      kind: "needs-confirm",
      state,
      oldestClosableId: findOldestClosable(state),
    };
  }

  const tab = createTab(id, path, title);
  return {
    kind: "added",
    state: { tabs: [...state.tabs, tab], activeId: tab.id },
    tabId: tab.id,
  };
}

/**
 * Tab cũ nhất ĐÃ ĐÓNG XONG (không chạy việc, không có thay đổi chưa lưu) — ứng viên
 * để đóng khi đạt trần. `null` = không có ứng viên an toàn.
 */
export function findOldestClosable(state: TabsState): string | null {
  const closable = state.tabs.filter(
    (tab) => tab.busy !== "running" && tab.busy !== "queued" && !tab.dirty,
  );
  const oldest = closable[0];
  return oldest ? oldest.id : null;
}

/** Chọn tab. */
export function selectTab(state: TabsState, id: string): TabsState {
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  return { ...state, activeId: id };
}

/**
 * Đóng tab.
 *
 * - Đóng tab đang chọn giữa dãy ⇒ **chọn tab kế** (tab sau nó); nếu là tab cuối ⇒
 *   chọn tab trước; hết tab ⇒ `activeId = null`.
 * - Đóng tab không active ⇒ giữ nguyên tab đang chọn.
 */
export function closeTab(state: TabsState, id: string): TabsState {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (state.activeId !== id) {
    return { tabs, activeId: state.activeId };
  }
  const next = tabs[index] ?? tabs[index - 1] ?? null;
  return { tabs, activeId: next ? next.id : null };
}

/** Cập nhật trạng thái 1 tab (busy/percent/dirty/title). */
export function updateTab(
  state: TabsState,
  id: string,
  patch: Partial<Omit<StudioTab, "id">>,
): TabsState {
  let changed = false;
  const tabs = state.tabs.map((tab) => {
    if (tab.id !== id) return tab;
    changed = true;
    return { ...tab, ...patch };
  });
  return changed ? { ...state, tabs } : state;
}
