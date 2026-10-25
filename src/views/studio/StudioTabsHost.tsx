// [TSK-TABS-P1] Host tab Studio — sở hữu danh sách tab, mount TẤT CẢ instance.
//
// Kiến trúc (STUDIO_TABS_PLAN §3.1): mỗi video = 1 tab = 1 instance
// `SublixStudioView`. Instance ẩn vẫn MOUNTED (display:none) ⇒ việc đang chạy
// (bóc tách / dịch / lồng tiếng) không mất khi đổi tab; chỉ `<video>` được nhả
// để giải phóng decoder + buffer.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SublixStudioView, {
  type StudioTaskUpdatePayload,
  type StudioTabStatus,
} from "../SublixStudioView";
import { StudioTabStripConnected, StudioTabsContext } from "./StudioTabStrip";
import { jobQueue } from "../../lib/studio/jobQueue";
import {
  MAX_STUDIO_TABS,
  addTab,
  closeTab,
  titleFromPath,
  type StudioTab,
  type TabsState,
} from "../../lib/studio/tabsModel";

export interface StudioTabsHostProps {
  /** Yêu cầu mở video từ bên ngoài (SettingsView / tab Tiến trình). */
  openRequest?: { path: string; nonce: number; tabId?: string } | null;
  /** Video mở sẵn (tab đầu tiên khi vào Studio). */
  initialPath?: string;
  /** Báo tổng việc đang chạy lên trên (ô trạng thái topbar). */
  onSummary?: (summary: { running: number; tabs: number }) => void;
  /** Chuyển tab ứng dụng (MasterTopbar). */
  onNavigateTab?: (tab: "downloader" | "live" | "history" | "models" | "overlay" | "process") => void;
  /** Phiên bản app (1 nguồn với các tab khác). */
  appVersion?: string;
  /** Chủ đề giao diện. */
  currentTheme?: string;
  onThemeChange?: (theme: string) => void;
  /** Báo tiến trình tác vụ (lịch sử tab Tiến trình). */
  onTaskUpdate?: (task: StudioTaskUpdatePayload) => void;
  /**
   * Tab ứng dụng "Studio" đang hiển thị? `false` ⇒ KHÔNG instance nào active
   * (phím tắt timeline / kéo-thả không được chạy khi người dùng ở tab Tải video…).
   */
  isVisible?: boolean;
}

/** Id tab mới (không phụ thuộc crypto để test được). */
let tabSeq = 0;
function nextTabId(): string {
  tabSeq += 1;
  return `tab_${Date.now().toString(36)}_${tabSeq}`;
}

/**
 * [TSK-TABS-P1] Bọc `React.memo` cho instance Studio.
 *
 * Props của instance giữ **identity ổn định** (openVideo/onStatus qua ref, phần tử
 * thanh tab tạo 1 lần) ⇒ khi trạng thái MỘT TAB KHÁC đổi, instance này không
 * re-render ⇒ **timeline không render lại** (yêu cầu §5).
 */
const MemoStudio = memo(SublixStudioView);

interface HostTab extends StudioTab {
  /** Video truyền cho instance LÚC MOUNT (không đổi theo `path` — tránh nạp lại video). */
  initialPath: string;
  /** Nonce yêu cầu nạp video (tab trống được lấp đầy). */
  loadNonce: number;
  /** Nonce yêu cầu DỪNG việc. */
  cancelNonce: number;
}

interface CloseDialog {
  kind: "busy" | "limit";
  tabId: string;
  title: string;
}

function StudioTabsHostInner({
  openRequest,
  initialPath,
  onSummary,
  onNavigateTab,
  appVersion,
  currentTheme,
  onThemeChange,
  onTaskUpdate,
  isVisible = true,
}: StudioTabsHostProps) {
  // Tab đầu tiên luôn tồn tại (có thể TRỐNG) ⇒ Studio luôn có 1 instance để mở video.
  const [initialTabId] = useState(() => nextTabId());
  const [tabs, setTabs] = useState<HostTab[]>(() => [
    {
      id: initialTabId,
      path: initialPath ?? "",
      initialPath: initialPath ?? "",
      title: initialPath ? titleFromPath(initialPath) : "Video mới",
      busy: "idle",
      percent: 0,
      dirty: false,
      loadNonce: 0,
      cancelNonce: 0,
    },
  ]);
  const [activeId, setActiveId] = useState<string | null>(initialTabId);
  const [dialog, setDialog] = useState<CloseDialog | null>(null);
  /** Đường dẫn đang chờ mở (khi đạt trần → hỏi đóng tab cũ). */
  const pendingPathRef = useRef<string | null>(null);
  /** Nonce yêu cầu DỪNG việc cho từng tab. */
  const cancelNonceRef = useRef<Record<string, number>>({});
  /**
   * [TSK-TABS-P1] State hiện tại trong ref ⇒ các callback (openVideo, close…) có
   * **identity ổn định** ⇒ prop của instance không đổi ⇒ `React.memo` giữ được
   * instance ⇒ timeline không render lại khi trạng thái tab khác đổi.
   */
  const stateRef = useRef({ tabs, activeId });
  stateRef.current = { tabs, activeId };

  /** Mở 1 video: nhảy tab cùng path / tái dùng tab trống / tạo tab mới / hỏi khi đủ trần. */
  const openVideo = useCallback(
    (path: string) => {
      if (!path) return;
      const cur = stateRef.current;
      const state: TabsState = {
        tabs: cur.tabs.map(({ loadNonce, cancelNonce, ...tab }) => tab),
        activeId: cur.activeId,
      };
      const outcome = addTab(state, nextTabId(), path);
      if (outcome.kind === "needs-confirm") {
        pendingPathRef.current = path;
        setDialog({
          kind: "limit",
          tabId: outcome.oldestClosableId ?? "",
          title: "Đã đủ 6 tab",
        });
        return;
      }
      setActiveId(outcome.tabId);
      setTabs((prev) => {
        const existing = prev.find((tab) => tab.id === outcome.tabId);
        if (existing) {
          // Tab trống được lấp đầy → yêu cầu instance nạp video.
          if (outcome.kind === "reused-empty") {
            return prev.map((tab) =>
              tab.id === outcome.tabId
                ? { ...tab, path, title: titleFromPath(path), loadNonce: tab.loadNonce + 1 }
                : tab,
            );
          }
          return prev;
        }
        return [
          ...prev,
          {
            id: outcome.tabId,
            path,
            initialPath: path,
            title: titleFromPath(path),
            busy: "idle",
            percent: 0,
            dirty: false,
            loadNonce: 0,
            cancelNonce: 0,
          },
        ];
      });
    },
    [],
  );

  /** Mở 1 tab TRỐNG (nút ＋) — người dùng chọn video sau. */
  const openEmptyTab = useCallback(() => {
    const cur = stateRef.current;
    const state: TabsState = {
      tabs: cur.tabs.map(({ loadNonce, cancelNonce, ...tab }) => tab),
      activeId: cur.activeId,
    };
    const outcome = addTab(state, nextTabId(), "");
    if (outcome.kind === "needs-confirm") {
      setDialog({ kind: "limit", tabId: outcome.oldestClosableId ?? "", title: "Đã đủ 6 tab" });
      return;
    }
    setActiveId(outcome.tabId);
    setTabs((prev) =>
      prev.some((tab) => tab.id === outcome.tabId)
        ? prev
        : [
            ...prev,
            {
              id: outcome.tabId,
              path: "",
              initialPath: "",
              title: "Video mới",
              busy: "idle",
              percent: 0,
              dirty: false,
              loadNonce: 0,
              cancelNonce: 0,
            },
          ],
    );
  }, []);

  /** Đóng tab — nếu tab đang chạy việc thì hỏi trước. */
  const requestCloseTab = useCallback((id: string) => {
    const tab = stateRef.current.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.busy === "running" || tab.busy === "queued") {
      setDialog({ kind: "busy", tabId: id, title: tab.title });
      return;
    }
    applyCloseTabRef.current(id);
  }, []);

  const applyCloseTabRef = useRef<(id: string) => void>(() => {});
  const applyCloseTab = useCallback((id: string) => {
    const cur = stateRef.current;
    const state: TabsState = {
      tabs: cur.tabs.map(({ loadNonce, cancelNonce, ...tab }) => tab),
      activeId: cur.activeId,
    };
    const next = closeTab(state, id);
    setActiveId(next.activeId);
    setTabs((prev) => prev.filter((tab) => tab.id !== id));
  }, []);
  applyCloseTabRef.current = applyCloseTab;

  /** Hộp thoại: "Dừng & đóng" / "Hủy". */
  const confirmClose = useCallback(() => {
    if (!dialog) return;
    if (dialog.kind === "busy") {
      // Dừng việc CỦA TAB NÀY rồi đóng. Instance bị gỡ NGAY trong lượt này nên effect
      // `cancelRequest` của nó không kịp chạy ⇒ host huỷ thẳng qua hàng đợi theo tabId:
      // job `queued` ⇒ chỉ bỏ khỏi hàng; job `running` ⇒ hàng đợi gọi `dubbingCancel`
      // (không động tới job của tab khác).
      const snap = jobQueue.getState();
      for (const job of [...snap.queued, ...(snap.running ? [snap.running] : [])]) {
        if (job.tabId === dialog.tabId) jobQueue.cancel(job.runId);
      }
      cancelNonceRef.current[dialog.tabId] = (cancelNonceRef.current[dialog.tabId] ?? 0) + 1;
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === dialog.tabId
            ? { ...tab, cancelNonce: (cancelNonceRef.current[dialog.tabId] ?? 1), busy: "idle", percent: 0 }
            : tab,
        ),
      );
      applyCloseTab(dialog.tabId);
      setDialog(null);
      return;
    }
    // Đạt trần: đóng tab cũ nhất rồi mở video đang chờ.
    const pending = pendingPathRef.current;
    pendingPathRef.current = null;
    if (dialog.tabId) applyCloseTab(dialog.tabId);
    setDialog(null);
    if (pending) {
      // Mở lại sau khi state cập nhật (dùng effect bên dưới).
      pendingOpenRef.current = pending;
    }
  }, [dialog, applyCloseTab]);

  /** Video chờ mở sau khi đóng tab cũ (đạt trần). */
  const pendingOpenRef = useRef<string | null>(null);
  useEffect(() => {
    const pending = pendingOpenRef.current;
    if (!pending) return;
    pendingOpenRef.current = null;
    openVideo(pending);
  });

  /** Yêu cầu mở video từ bên ngoài (SettingsView). */
  const lastOpenNonceRef = useRef<number>(-1);
  useEffect(() => {
    if (!openRequest) return;
    if (openRequest.nonce === lastOpenNonceRef.current) return;
    lastOpenNonceRef.current = openRequest.nonce;
    // "Mở lại trong Studio": tab của tác vụ còn ⇒ nhảy đúng tab; đã đóng ⇒ mở lại từ video gốc.
    const wanted = openRequest.tabId;
    if (wanted && stateRef.current.tabs.some((tab) => tab.id === wanted)) {
      setActiveId(wanted);
      return;
    }
    if (openRequest.path) openVideo(openRequest.path);
  }, [openRequest, openVideo]);

  /** Instance báo trạng thái → cập nhật tab (chỉ số liệu nhẹ). */
  const handleStatus = useCallback((tabId: string, status: StudioTabStatus) => {
    setTabs((prev) => {
      const idx = prev.findIndex((tab) => tab.id === tabId);
      if (idx === -1) return prev;
      const cur = prev[idx];
      if (
        cur.busy === status.busy &&
        cur.percent === status.percent &&
        cur.title === status.title &&
        cur.dirty === status.dirty &&
        cur.path === status.path
      ) {
        return prev;
      }
      const next = [...prev];
      // `path` theo instance (video khôi phục từ cache / mở bằng nút trong tab) ⇒
      // dedupe + "tái dùng tab trống" của tabsModel dựa trên video THẬT đang mở.
      next[idx] = {
        ...cur,
        busy: status.busy,
        percent: status.percent,
        title: status.title,
        dirty: status.dirty,
        path: status.path,
      };
      return next;
    });
  }, []);

  /** Tổng việc đang chạy → báo lên trên. */
  const runningCount = tabs.filter((tab) => tab.busy === "running" || tab.busy === "queued").length;
  useEffect(() => {
    onSummary?.({ running: runningCount, tabs: tabs.length });
  }, [onSummary, runningCount, tabs.length]);

  const strip = useMemo(() => <StudioTabStripConnected />, []);

  /** Context cho thanh tab (chỉ thanh tab là consumer ⇒ timeline khỏi render lại). */
  const stripCtx = useMemo(
    () => ({
      tabs: tabs.map(({ loadNonce, cancelNonce, ...tab }) => tab),
      activeId,
      onSelect: (id: string) => setActiveId(id),
      onClose: requestCloseTab,
      onAdd: openEmptyTab,
    }),
    [tabs, activeId, requestCloseTab, openEmptyTab],
  );

  return (
    <StudioTabsContext.Provider value={stripCtx}>
      <div className="sts-host" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, width: "100%" }}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className="sts-slot"
            style={{ display: active ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0, width: "100%" }}
          >
            <MemoStudio
              tabId={tab.id}
              isActive={active && isVisible}
              initialFilePath={tab.initialPath}
              loadRequest={tab.loadNonce > 0 ? { path: tab.path, nonce: tab.loadNonce } : null}
              cancelRequest={tab.cancelNonce > 0 ? tab.cancelNonce : undefined}
              useProjectCache={tab.id === initialTabId}
              onRequestOpenVideo={openVideo}
              onStatus={handleStatus}
              belowTopbar={active ? strip : undefined}
              appVersion={appVersion}
              onNavigateTab={onNavigateTab}
              currentTheme={currentTheme}
              onThemeChange={onThemeChange}
              onTaskUpdate={onTaskUpdate}
            />
          </div>
        );
      })}

      {dialog ? (
        <div className="sts-dialog-backdrop" onClick={() => setDialog(null)}>
          <div className="sts-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>
              {dialog.kind === "busy"
                ? `"${dialog.title}" đang chạy việc`
                : `Đã đủ ${MAX_STUDIO_TABS} tab`}
            </h3>
            <p>
              {dialog.kind === "busy"
                ? "Dừng việc đang chạy rồi đóng tab này? Việc dở dang sẽ mất."
                : "Đóng tab cũ nhất (không chạy việc) để mở video mới?"}
            </p>
            <div className="sts-dialog-actions">
              <button type="button" className="sts-btn" onClick={() => setDialog(null)}>
                Hủy
              </button>
              <button type="button" className="sts-btn is-danger" onClick={confirmClose}>
                {dialog.kind === "busy" ? "■ Dừng & đóng" : "Đóng tab cũ"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </StudioTabsContext.Provider>
  );
}

export const StudioTabsHost = memo(StudioTabsHostInner);
export default StudioTabsHost;
