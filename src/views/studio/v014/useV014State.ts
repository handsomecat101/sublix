import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { sublix, type HardsubProgress, type HardsubRegion } from "../../../lib/tauri";
import { staleProjectNotice } from "../../../lib/studio/resultGuard";
import { defaultManualBand, sameBand, type VideoSize } from "./bandGeometry";
import {
  DEFAULT_HARDSUB,
  DEFAULT_SUB_STYLE,
  deriveCardState,
  restoreV014,
  toProjectHardsub,
  toProjectSubStyle,
  type BandPx,
  type DetectionLike,
  type HardsubBlur,
  type HardsubScope,
  type HardsubSettings,
  type KineticPresetId,
  type PersistedV014,
  type SubStyle,
} from "./logic";

/** `model_id` của model dò chữ trong sự kiện `model:download-progress`. */
export const HARDSUB_MODEL_ID = "hardsub-ppocrv4-det";

export interface UseV014Args {
  filePath: string;
  /** Ref luôn trỏ video hiện tại — chặn kết quả của video cũ (resultGuard §3.5). */
  filePathRef: MutableRefObject<string | null>;
  mediaDuration: number;
  /** Cỡ video gốc (từ `<video>.videoWidth/Height`); `null` khi chưa biết. */
  videoSize: VideoSize | null;
  /** Dữ liệu khôi phục từ `sessionStore` (chỉ đọc lúc mount). */
  restored?: unknown;
  showToast: (msg: string) => void;
}

/**
 * Toàn bộ state v0.14 của 1 tab Studio: kiểu phụ đề, phụ đề cứng, kết quả dò, tiến độ, huỷ, tải model.
 * `runDetectImpl` là THÂN việc dò — Studio bọc nó vào `runHeavy` (hàng đợi việc nặng) rồi gán
 * vào `triggerRef` để các nút trong thẻ gọi.
 */
export function useV014State(a: UseV014Args) {
  const init = useMemo(() => restoreV014(a.restored), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [subStyle, setSubStyle] = useState<SubStyle>(init.subStyle);
  const [hardsub, setHardsub] = useState<HardsubSettings>(init.hardsub);
  const [detection, setDetection] = useState<DetectionLike | null>(init.detection);
  const [detectedFor, setDetectedFor] = useState<string>(init.detectedFor);
  const [running, setRunning] = useState<{ percent: number; message: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [modelPct, setModelPct] = useState<number | null>(null);
  const [previewPreset, setPreviewPreset] = useState<KineticPresetId | null>(null);
  const [lastRegion, setLastRegion] = useState<HardsubRegion>("bottom");
  /** Studio gán hàm đã bọc `runHeavy` vào đây. */
  const triggerRef = useRef<(region?: HardsubRegion) => Promise<void>>(async () => {});
  /** Bản mới nhất của state cần cho xuất video (đọc được cả khi closure đã cũ). */
  const latest = useRef<{ subStyle: SubStyle; hardsub: HardsubSettings; videoSize: VideoSize | null; detectedFor: string }>({
    subStyle: init.subStyle,
    hardsub: init.hardsub,
    videoSize: a.videoSize,
    detectedFor: init.detectedFor,
  });
  const detectStartedRef = useRef(false);

  // Đổi video ⇒ bỏ kết quả dò của video cũ (giữ lựa chọn mức mờ / tem / phạm vi).
  useEffect(() => {
    if (!a.filePath || !detectedFor || detectedFor === a.filePath) return;
    setDetection(null);
    setDetectedFor("");
    setError(null);
    setHardsub((h) => ({ ...h, band: null, spans: [], bandSource: "auto" }));
  }, [a.filePath, detectedFor]);

  const runDetectImpl = useCallback(
    async (region: HardsubRegion = "bottom"): Promise<void> => {
      const startedPath = a.filePathRef.current;
      if (!startedPath) return;
      const runId = `hs_${Date.now().toString(36)}`;
      detectStartedRef.current = true;
      setLastRegion(region);
      setError(null);
      setRunning({ percent: 0, message: "Bắt đầu" });
      let unlisten: (() => void) | null = null;
      try {
        unlisten = await listen<HardsubProgress>("hardsub:progress", (e) => {
          if (e.payload.run_id !== runId) return;
          setRunning({ percent: e.payload.percent, message: e.payload.message });
        });
        const res = await sublix.hardsubDetect(startedPath, region, runId);
        const stale = staleProjectNotice(startedPath, a.filePathRef.current);
        if (stale) {
          a.showToast(stale);
          return;
        }
        setDetection(res);
        setDetectedFor(startedPath);
        const prev = latest.current.hardsub;
        if (prev.bandSource === "manual" && prev.band && res.band) {
          a.showToast("Đã thay dải bạn chỉnh bằng dải mới dò được");
        }
        const next: HardsubSettings = { ...prev, band: res.band, spans: res.spans, bandSource: "auto" };
        // Cập nhật ref NGAY: xuất video chạy tiếp sau `await` có thể đọc trước khi React render lại.
        latest.current = {
          ...latest.current,
          hardsub: next,
          videoSize: { w: res.frame_width, h: res.frame_height },
          detectedFor: startedPath,
        };
        setHardsub(next);
      } catch (err) {
        if (!staleProjectNotice(startedPath, a.filePathRef.current)) setError(err);
      } finally {
        unlisten?.();
        detectStartedRef.current = false;
        setRunning(null);
      }
    },
    [a.filePathRef, a.showToast], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setEnabled = (enabled: boolean) => {
    setHardsub((h) => ({ ...h, enabled }));
    // Tích = dò ngay (nếu chưa có kết quả cho video này). Bỏ tích giữ nguyên kết quả.
    if (enabled && !running && a.filePath && !(detection && detectedFor === a.filePath) && !hardsub.band) {
      void triggerRef.current("bottom");
    }
  };

  const cancelDetect = () => {
    void sublix.hardsubCancel().catch(() => {});
  };

  const downloadModel = async () => {
    setModelPct(0);
    const un = await listen<{ model_id: string; bytes_done: number; bytes_total: number }>(
      "model:download-progress",
      (e) => {
        if (e.payload.model_id !== HARDSUB_MODEL_ID || !e.payload.bytes_total) return;
        setModelPct((e.payload.bytes_done / e.payload.bytes_total) * 100);
      },
    );
    try {
      await sublix.hardsubModelDownload();
      setError(null);
      void triggerRef.current(lastRegion);
    } catch (err) {
      setError(err);
    } finally {
      un();
      setModelPct(null);
    }
  };

  const installDeps = async () => {
    setRunning({ percent: 0, message: "Đang cài thư viện Python…" });
    try {
      await sublix.hardsubInstallDeps();
      setError(null);
      setRunning(null);
      void triggerRef.current(lastRegion);
    } catch (err) {
      setError(err);
      setRunning(null);
    }
  };

  const setManualBand = (band: BandPx) =>
    setHardsub((h) => ({ ...h, band, bandSource: "manual", scope: h.spans.length ? h.scope : "whole" }));

  const placeDefaultBand = () => {
    if (!videoSize) return;
    setError(null);
    setManualBand(defaultManualBand(videoSize));
  };

  const resetBand = () =>
    setHardsub((h) => ({ ...h, band: detection?.band ?? h.band, bandSource: detection?.band ? "auto" : h.bandSource }));

  // Dải đo trên video GỐC (backend) ⇒ ưu tiên cỡ do backend báo (bản xem thử có thể là file chuyển mã).
  const videoSize: VideoSize | null =
    detection?.frame_width && detection.frame_height ? { w: detection.frame_width, h: detection.frame_height } : a.videoSize;

  const cardState = deriveCardState({
    enabled: hardsub.enabled,
    running,
    detection: detectedFor === a.filePath ? detection : null,
    error,
    durationSec: a.mediaDuration,
    band: hardsub.band,
    bandSource: hardsub.bandSource,
    videoH: videoSize?.h ?? 0,
  });

  // Đồng bộ bản "mới nhất" sau mỗi lần render (runDetectImpl còn cập nhật sớm hơn khi dò xong).
  latest.current = { subStyle, hardsub, videoSize, detectedFor };

  /** Cần dò trước khi xuất? (đã tích, chưa có dải, chưa dò video này). Đọc từ ref ⇒ đúng cả khi job chờ lâu. */
  const needsDetectBeforeExport = () => {
    const l = latest.current;
    return l.hardsub.enabled && !l.hardsub.band && l.detectedFor !== a.filePathRef.current;
  };

  /** Cấu hình gắn vào `DubbingProject` khi xuất (đọc ref ⇒ thấy kết quả dò vừa xong). */
  const exportConfig = () => ({
    sub_style: toProjectSubStyle(latest.current.subStyle, latest.current.videoSize?.h ?? 1080),
    hardsub: toProjectHardsub(latest.current.hardsub),
  });

  /** Gói lưu theo tab (sessionStore). */
  const persisted = useMemo<PersistedV014>(
    () => ({ subStyle, hardsub, detectedFor, detection }),
    [subStyle, hardsub, detectedFor, detection],
  );

  return {
    videoSize,
    subStyle,
    setSubStyle,
    hardsub,
    setHardsub,
    patchHardsub: (p: Partial<{ blur: HardsubBlur; stamp: boolean; scope: HardsubScope }>) =>
      setHardsub((h) => ({ ...h, ...p })),
    detection,
    running,
    cardState,
    modelPct,
    previewPreset,
    setPreviewPreset,
    lastRegion,
    triggerRef,
    runDetectImpl,
    markQueued: () => setRunning({ percent: 0, message: "Đang chờ lượt…" }),
    clearRunning: () => setRunning(null),
    setEnabled,
    cancelDetect,
    downloadModel,
    installDeps,
    setManualBand,
    placeDefaultBand,
    resetBand,
    bandIsManual: hardsub.bandSource === "manual" && !sameBand(hardsub.band, detection?.band),
    needsDetectBeforeExport,
    exportConfig,
    persisted,
    detectStartedRef,
    defaults: { DEFAULT_SUB_STYLE, DEFAULT_HARDSUB },
  };
}
