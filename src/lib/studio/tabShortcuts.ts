//! TSK-TABS-P4-SHORTCUTS-CORE — phím tắt thanh tab Studio (module THUẦN).
//!
//! Luật lấy từ `docs/STUDIO_TABS_PLAN.md` §4.3 + §6b và `docs/UI_REDESIGN_PLAN.md` §4.11:
//! `Ctrl+Tab` / `Ctrl+Shift+Tab` chuyển tab, `Ctrl+W` đóng tab đang chọn, `Ctrl+T` mở tab
//! trống, `Ctrl+1..8` nhảy tab thứ n, `Ctrl+9` = tab **cuối** (quy ước trình duyệt).
//!
//! Module này **chỉ dịch** (phím + trạng thái thanh tab) → hành động. Nó KHÔNG đụng React,
//! DOM hay Tauri ⇒ test được bằng `node --test`; host (`StudioTabsHost` /
//! `SublixStudioView`) là nơi thực thi hành động.
//!
//! ## ⚠️ Host BẮT BUỘC gọi `preventDefault()`
//! WebView2 (và trình duyệt nói chung) coi `Ctrl+W` là **đóng cửa sổ**; nếu host không
//! `preventDefault()` trên `keydown` thì cửa sổ app Sublix sẽ đóng mất trước khi tab kịp
//! đóng. Gọi `ev.preventDefault()` cho **mọi** kết quả khác `null` (kể cả `Ctrl+Tab`,
//! `Ctrl+1..9` để không nhảy focus/không kích hoạt phím timeline bên dưới).
//!
//! ## Va chạm đã kiểm
//! - `Ctrl+0` **không** bắt (đã dùng cho zoom timeline) ⇒ luôn trả `null`.
//! - `Ctrl+Shift+T` **không** bắt (để dành "mở lại tab vừa đóng", §4.11).
//! - `Ctrl+Shift+W` **không** bắt (quy ước "đóng cửa sổ" của trình duyệt).
//! - Có `Alt` hoặc `Meta` ⇒ luôn `null` (VoicePicker dùng `Alt+1..3`, macOS dùng Cmd).
//! - Phím vẫn hoạt động khi focus ở ô nhập (§4.11: `Ctrl+Tab` trong `<textarea>` phụ đề
//!   không được chèn tab) — xem `TabShortcutContext.isEditableTarget`.

/** Sự kiện bàn phím đã rút gọn (cắt từ `KeyboardEvent` để test được, không cần DOM). */
export interface TabShortcutEvent {
  /** `KeyboardEvent.key` — phụ thuộc bố cục bàn phím. */
  key: string;
  /** `KeyboardEvent.code` — vị trí **vật lý** của phím, ổn định với mọi bố cục. */
  code?: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** Trạng thái thanh tab tại thời điểm bấm phím. */
export interface TabShortcutContext {
  /** Số tab đang mở (0 = thanh tab rỗng). */
  tabCount: number;
  /** Vị trí tab đang chọn (0-based, `-1` = chưa chọn tab nào). */
  activeIndex: number;
  /**
   * Focus đang ở ô nhập/thẻ soạn thảo (`input` / `textarea` / `contenteditable`).
   *
   * Chỉ để host ghi log / đổi chính sách sau này: theo §4.11 các phím tab **vẫn phải
   * chạy** khi đang ở ô nhập (host vẫn `preventDefault` để `Ctrl+Tab` không chèn tab
   * vào `<textarea>`), nên trường này **không** làm thay đổi kết quả.
   */
  isEditableTarget: boolean;
}

/** Hành động host phải thực thi (không mang id tab — host biết tab đang chọn). */
export type TabShortcutAction =
  /** Chọn tab kế tiếp (vòng tròn; cuối → đầu). */
  | { type: "next" }
  /** Chọn tab trước đó (vòng tròn; đầu → cuối). */
  | { type: "prev" }
  /** Đóng tab đang chọn (tab đang chạy việc thì host tự hỏi, §4.2). */
  | { type: "close" }
  /** Mở tab trống mới. */
  | { type: "new" }
  /** Chọn tab theo vị trí 0-based (đã kiểm tồn tại). */
  | { type: "goto"; index: number };

/** Ký tự số `0..9` sau khi chuẩn hoá. */
type DigitToken = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/** Phím mà module này quan tâm (đã chuẩn hoá, độc lập bố cục bàn phím). */
type KeyToken = "tab" | "w" | "t" | DigitToken;

/** Bảng dịch `KeyboardEvent.code` → phím logic. */
const CODE_TO_TOKEN: Readonly<Record<string, KeyToken>> = {
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
  Tab: "tab",
  KeyW: "w",
  KeyT: "t",
};

/** `KeyboardEvent.code` → phím logic (null = không quan tâm). */
function tokenFromCode(code: string | undefined): KeyToken | null {
  if (!code) return null;
  return CODE_TO_TOKEN[code] ?? null;
}

/**
 * `KeyboardEvent.key` → phím logic (dự phòng khi `code` không có/không nhận ra).
 *
 * Chỉ nhận ký tự số đơn, `Tab`, `w/W`, `t/T` — đúng các phím của tính năng.
 */
function tokenFromKey(key: string | undefined): KeyToken | null {
  if (!key) return null;
  if (key.length === 1) {
    const ch = key.toLowerCase();
    if (ch >= "0" && ch <= "9") return ch as DigitToken;
    if (ch === "w" || ch === "t") return ch;
    return null;
  }
  return key.toLowerCase() === "tab" ? "tab" : null;
}

/**
 * Phím logic của sự kiện: ưu tiên `code` (bàn phím không phải US: `AZERTY`, `QWERTZ`…
 * vẫn ra đúng phím), dự phòng `key`.
 */
function eventToken(ev: TabShortcutEvent): KeyToken | null {
  return tokenFromCode(ev.code) ?? tokenFromKey(ev.key);
}

/** Số tab hợp lệ (âm / `NaN` / `Infinity` ⇒ 0). */
export function normalizeTabCount(tabCount: number): number {
  if (!Number.isFinite(tabCount)) return 0;
  const count = Math.trunc(tabCount);
  return count > 0 ? count : 0;
}

/** Tab đang chọn có nằm trong dãy không? (`-1` khi thanh tab rỗng ⇒ false) */
function hasActiveTab(activeIndex: number, tabCount: number): boolean {
  return (
    tabCount > 0 &&
    Number.isInteger(activeIndex) &&
    activeIndex >= 0 &&
    activeIndex < tabCount
  );
}

/**
 * Vị trí tab sau khi nhảy `delta` bước, **vòng tròn** theo thứ tự trên thanh tab
 * (không phải MRU — xem §4.11).
 *
 * Dùng cho `{type:"next"}` / `{type:"prev"}`: host lấy kết quả rồi `selectTab`.
 * - `delta > 0`: tab kế; ở tab cuối quay về tab đầu.
 * - `delta < 0`: tab trước; ở tab đầu nhảy về tab cuối.
 * - Chưa chọn tab nào (`activeIndex = -1`) ⇒ `delta > 0` → tab đầu, `delta < 0` → tab cuối.
 * - `tabCount = 0` ⇒ `null` (không có gì để chọn).
 */
export function stepTabIndex(
  activeIndex: number,
  tabCount: number,
  delta: number,
): number | null {
  const count = normalizeTabCount(tabCount);
  if (count === 0) return null;

  const step = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  if (!hasActiveTab(activeIndex, count)) {
    if (step > 0) return 0;
    if (step < 0) return count - 1;
    return null;
  }
  return (((activeIndex + step) % count) + count) % count;
}

/**
 * Dịch một lần bấm phím thành hành động cho thanh tab Studio (hoặc `null` = bỏ qua).
 *
 * Quy tắc đầy đủ:
 * - Bắt buộc `ctrlKey`, **không** `altKey`, **không** `metaKey`.
 * - `Ctrl+Tab` → `next`, `Ctrl+Shift+Tab` → `prev` (chỉ cần ≥ 1 tab).
 * - `Ctrl+W` → `close` (chỉ khi tab đang chọn tồn tại); `Ctrl+Shift+W` → `null`.
 * - `Ctrl+T` → `new` (chạy được cả khi `tabCount = 0`); `Ctrl+Shift+T` → `null`.
 * - `Ctrl+1..8` → `goto index n-1` khi tab đó tồn tại, không tồn tại ⇒ `null`.
 * - `Ctrl+9` → `goto tabCount-1` (tab **cuối**).
 * - `Ctrl+0` ⇒ `null` (zoom timeline đã dùng, xem `STUDIO_TABS_PLAN` §4.3).
 * - `tabCount = 0` ⇒ `null`, trừ `Ctrl+T`.
 * - Phím số dùng `Shift` vẫn tính (bàn phím `AZERTY` phải giữ `Shift` mới ra số);
 *   riêng `Tab` dùng `Shift` để đổi chiều.
 *
 * @example
 * ```ts
 * const action = resolveTabShortcut(ev, { tabCount: 3, activeIndex: 2, isEditableTarget: false });
 * if (action) {
 *   ev.preventDefault(); // ⚠️ BẮT BUỘC: WebView2 tự đóng cửa sổ khi Ctrl+W
 *   // ... thực thi action
 * }
 * ```
 */
export function resolveTabShortcut(
  ev: TabShortcutEvent,
  ctx: TabShortcutContext,
): TabShortcutAction | null {
  // Alt (VoicePicker Alt+1..3) và Meta (macOS Cmd) không thuộc bộ phím tab.
  if (!ev.ctrlKey || ev.altKey || ev.metaKey) return null;

  const token = eventToken(ev);
  if (!token) return null;

  // Ctrl+T mở tab trống — phím DUY NHẤT chạy được khi chưa có tab nào.
  // Ctrl+Shift+T để dành "mở lại tab vừa đóng" (§4.11) ⇒ không bắt.
  if (token === "t") return ev.shiftKey ? null : { type: "new" };

  const tabCount = normalizeTabCount(ctx.tabCount);
  // Thanh tab rỗng ⇒ mọi phím còn lại không có nghĩa.
  if (tabCount === 0) return null;

  if (token === "tab") return { type: ev.shiftKey ? "prev" : "next" };

  // Ctrl+Shift+W là "đóng cửa sổ" theo quy ước trình duyệt ⇒ không bắt.
  if (token === "w") {
    if (ev.shiftKey) return null;
    return hasActiveTab(ctx.activeIndex, tabCount) ? { type: "close" } : null;
  }

  // Ctrl+0 đã dùng cho zoom timeline ⇒ không bắt.
  if (token === "0") return null;

  // Ctrl+9 = tab cuối (quy ước trình duyệt).
  if (token === "9") return { type: "goto", index: tabCount - 1 };

  // Ctrl+1..8 = tab thứ n; tab không tồn tại (dãy ngắn hơn) ⇒ không làm gì.
  const index = Number(token) - 1;
  return index < tabCount ? { type: "goto", index } : null;
}
