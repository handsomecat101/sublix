//! TSK-LAB-U1C — Lớp API giao tiếp cho Xưởng AI (Bước A, B, C).
//! Kết nối lệnh thật qua Tauri:
//! - Bước A: `sublix.labAnalyze`, `labCancel`, các sự kiện `lab:*`
//! - Bước B: `sublix.labWriteNarration`, `labRewriteSegment`
//! - Bước C: `sublix.labBuildDraft`, `labCancelDraft`, `labLoadDraftProject`
//! Và duy trì chế độ Mock cho môi trường dev/duyệt giao diện.

import {
  MOCK_CHAPTERS,
  MOCK_CHARACTERS,
  MOCK_JUNK_SEGMENTS,
  MOCK_RECAP_ITEMS,
  type MockChapter,
  type MockCharacter,
  type MockJunkSegment,
  type MockVideoSource,
} from "./labMock";
import {
  isLabMockMode,
  mapChipToRewriteMode,
  mapLabAnalysisToResult,
  mapLabBuildDraftResultToUi,
  mapLabRecapItemToUi,
  mapLabStageToProgress,
  mapUiToLabRecapItem,
  prepareLabSourceInputs,
  type RecapItem,
} from "./labModel";
import {
  sublix,
  onLabProgress,
  onLabDone,
  onLabError,
  onLabDraftDone,
  type LabAnalyzeOptions,
  type LabDraftOptions,
  type LabRecapItem,
  type LabScene,
  type LabSource,
  type LabSourceInput,
  type LabTranscriptLine,
  type DubbingProject,
} from "../../lib/tauri";

export interface AnalyzeOptions {
  videoPaths?: string[];
  sources?: MockVideoSource[];
  sourceInputs?: LabSourceInput[];
  gameName: string;
  gameGenre?: string;
  webSearch: boolean;
  chunkSecs?: number;
  useHardsub?: boolean;
}

export interface AnalyzeStageProgress {
  stageIndex: number;
  stageName: string;
  percent: number;
  message: string;
}

export interface AnalyzeResult {
  chapters: MockChapter[];
  characters: MockCharacter[];
  junkSegments: MockJunkSegment[];
  sources?: LabSource[];
  scenes?: LabScene[];
  transcript?: LabTranscriptLine[];
  runId?: string;
}

export interface WriteNarrationOptions {
  runId?: string;
  gameName: string;
  gameGenre?: string;
  targetDurationSec: number;
  originalRatio?: number;
  onProgress?: (pct: number) => void;
}

export interface BuildDraftOptions {
  runId?: string;
  items: RecapItem[];
  voiceId: string;
  rate?: string;
  pitch?: string;
  targetDurationSec?: number;
  originalRatio?: number;
}

export interface BuildDraftResult {
  items: RecapItem[];
  totalSec: number;
  rulesPassed: boolean;
  warningsCount: number;
  unplaced?: string[];
  notes?: string[];
  draftPath?: string;
  studioProjectPath?: string;
}

/** Giả lập độ trễ ngắn để tạo cảm giác xử lý mượt mà trong chế độ demo. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const labApi = {
  /**
   * Phân tích video (Bước A):
   * Tự động điều hướng giữa chế độ Mock (dev) và Backend Tauri thật.
   */
  async analyze(
    options: AnalyzeOptions,
    onProgress?: (p: AnalyzeStageProgress) => void,
    signal?: AbortSignal,
  ): Promise<AnalyzeResult> {
    if (isLabMockMode()) {
      return this._analyzeMock(options, onProgress, signal);
    }
    return this._analyzeReal(options, onProgress, signal);
  },

  /** Phân tích giả lập (chế độ Dev / duyệt UI). */
  async _analyzeMock(
    _options: AnalyzeOptions,
    onProgress?: (p: AnalyzeStageProgress) => void,
    signal?: AbortSignal,
  ): Promise<AnalyzeResult> {
    const stages = [
      "Nhận dạng thoại (Whisper)",
      "Đọc chữ trong game (OCR)",
      "Phát hiện cutscene & góc quay",
      "Lọc đoạn rác, loading & quảng cáo",
      "Tóm tắt chương bằng AI (MiniMax)",
    ];

    for (let i = 0; i < stages.length; i++) {
      if (signal?.aborted) throw new Error("Thao tác phân tích đã bị huỷ");
      onProgress?.({
        stageIndex: i + 1,
        stageName: stages[i],
        percent: Math.round(((i + 1) / stages.length) * 100),
        message: `Đang xử lý ${stages[i]}...`,
      });
      await delay(400);
    }

    return {
      chapters: [...MOCK_CHAPTERS],
      characters: [...MOCK_CHARACTERS],
      junkSegments: [...MOCK_JUNK_SEGMENTS],
      runId: `mock_run_${Date.now()}`,
    };
  },

  /** Phân tích thật qua Tauri backend (`sublix.labAnalyze`). */
  async _analyzeReal(
    options: AnalyzeOptions,
    onProgress?: (p: AnalyzeStageProgress) => void,
    signal?: AbortSignal,
  ): Promise<AnalyzeResult> {
    if (signal?.aborted) {
      throw new Error("Thao tác phân tích đã bị huỷ");
    }

    // 1. Chuẩn bị danh sách input
    let inputs: LabSourceInput[] = [];
    if (options.sourceInputs && options.sourceInputs.length > 0) {
      inputs = options.sourceInputs;
    } else if (options.sources && options.sources.length > 0) {
      inputs = prepareLabSourceInputs(options.sources);
    } else if (options.videoPaths && options.videoPaths.length > 0) {
      inputs = options.videoPaths.map((p) => ({
        path: p,
        name: p.replace(/^.*[/\\]/, ""),
        studioProject: null,
      }));
    }

    if (inputs.length === 0) {
      throw new Error("Chưa chọn video nguồn nào để phân tích.");
    }

    const analyzeOpts: LabAnalyzeOptions = {
      gameName: options.gameName || undefined,
      gameGenre: options.gameGenre || undefined,
      supplementaryContext: options.webSearch
        ? `Đã bật tra cứu bối cảnh web cho tựa game: ${options.gameName}`
        : undefined,
      chunkSecs: options.chunkSecs,
      useHardsub: options.useHardsub,
    };

    let activeRunId: string | null = null;
    let unlistenProgress: (() => void) | null = null;
    let unlistenDone: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const cleanup = () => {
      if (unlistenProgress) {
        unlistenProgress();
        unlistenProgress = null;
      }
      if (unlistenDone) {
        unlistenDone();
        unlistenDone = null;
      }
      if (unlistenError) {
        unlistenError();
        unlistenError = null;
      }
    };

    return new Promise<AnalyzeResult>(async (resolve, reject) => {
      let settled = false;

      const finishResolve = (res: AnalyzeResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        // Giữ activeRunId trong backend để phục vụ bước B và bước C
        resolve({
          ...res,
          runId: activeRunId ?? undefined,
        });
      };

      const finishReject = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (activeRunId) {
          sublix.labForgetAnalysis(activeRunId).catch(() => {});
        }
        reject(err);
      };

      const onAbort = () => {
        if (activeRunId) {
          sublix.labCancel(activeRunId).catch((e) => {
            console.warn("labCancel error:", e);
          });
        }
        finishReject(new Error("Thao tác phân tích đã bị huỷ"));
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        // Đăng ký nghe sự kiện trước khi gọi invoke để không sót sự kiện
        unlistenProgress = await onLabProgress((event) => {
          if (!activeRunId || event.runId === activeRunId) {
            onProgress?.(mapLabStageToProgress(event));
          }
        });

        unlistenDone = await onLabDone((event) => {
          if (!activeRunId || event.runId === activeRunId) {
            const mapped = mapLabAnalysisToResult(event.analysis);
            finishResolve(mapped);
          }
        });

        unlistenError = await onLabError((event) => {
          if (!activeRunId || event.runId === activeRunId) {
            finishReject(new Error(event.message || "Quá trình phân tích thất bại"));
          }
        });

        if (signal?.aborted) {
          onAbort();
          return;
        }

        const runId = await sublix.labAnalyze(inputs, analyzeOpts);
        activeRunId = runId;
      } catch (err) {
        finishReject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  },

  /**
   * Viết kịch bản lời bình (Bước B):
   * Hỗ trợ gọi linh hoạt qua đối tượng options hoặc các tham số rời.
   */
  async writeNarration(
    optionsOrTitle: string | WriteNarrationOptions,
    targetDurationSec?: number,
    onProgress?: (pct: number) => void,
  ): Promise<RecapItem[]> {
    let opts: WriteNarrationOptions;
    if (typeof optionsOrTitle === "string") {
      opts = {
        gameName: optionsOrTitle,
        targetDurationSec: targetDurationSec ?? 600,
        onProgress,
      };
    } else {
      opts = optionsOrTitle;
    }

    if (isLabMockMode() || !opts.runId) {
      return this._writeNarrationMock(opts);
    }
    return this._writeNarrationReal(opts);
  },

  /** Viết lời bình giả lập (chế độ demo). */
  async _writeNarrationMock(opts: WriteNarrationOptions): Promise<RecapItem[]> {
    for (let p = 10; p <= 100; p += 30) {
      opts.onProgress?.(p);
      await delay(200);
    }
    return MOCK_RECAP_ITEMS.map((item) => ({ ...item }));
  },

  /** Viết lời bình thật qua `sublix.labWriteNarration`. */
  async _writeNarrationReal(opts: WriteNarrationOptions): Promise<RecapItem[]> {
    if (!opts.runId) {
      throw new Error("Thiếu runId của lần phân tích để viết lời bình.");
    }

    opts.onProgress?.(20);
    const rawItems: LabRecapItem[] = await sublix.labWriteNarration(opts.runId, {
      gameName: opts.gameName,
      gameGenre: opts.gameGenre,
      targetDurationSec: opts.targetDurationSec,
      originalRatio: opts.originalRatio,
    });
    opts.onProgress?.(100);

    return rawItems.map(mapLabRecapItemToUi);
  },

  /**
   * Viết lại một đoạn lời bình (hộp nổi RewritePopover):
   * Chế độ thật gọi `sublix.labRewriteSegment`, chế độ mock giả lập biến đổi.
   */
  async rewriteBlock(
    originalText: string,
    styleChip: string,
    customInstruction?: string,
  ): Promise<string> {
    if (isLabMockMode()) {
      await delay(500);
      if (styleChip === "Ngắn hơn") {
        return originalText.length > 30 ? originalText.slice(0, 28) + "..." : originalText;
      }
      if (styleChip === "Kịch tính hơn") {
        return `Bất ngờ thay, ${originalText.toLowerCase().replace(/^[a-zà-ỹ]/, (c) => c.toUpperCase())} Nguy hiểm cận kề trong từng tấc đất!`;
      }
      if (styleChip === "Thêm câu nối" || styleChip === "Câu nối") {
        return `Chính vì lẽ đó, ${originalText.toLowerCase()}`;
      }
      if (customInstruction) {
        return `${originalText} (theo yêu cầu: ${customInstruction})`;
      }
      return `Nhưng câu chuyện chưa dừng lại ở đó. ${originalText}`;
    }

    const mode = mapChipToRewriteMode(styleChip);
    const res = await sublix.labRewriteSegment(originalText, mode, customInstruction);
    return res || originalText;
  },

  /**
   * Dựng nháp timeline (Bước C): đọc giọng TTS và khớp cảnh.
   * Tự động chuyển đổi giữa chế độ Mock và Backend thật `sublix.labBuildDraft`.
   */
  async buildDraft(
    options: BuildDraftOptions,
    onProgress?: (stage: string, percent: number) => void,
    signal?: AbortSignal,
  ): Promise<BuildDraftResult> {
    if (isLabMockMode() || !options.runId) {
      return this._buildDraftMock(options, onProgress, signal);
    }
    return this._buildDraftReal(options, onProgress, signal);
  },

  /** Dựng nháp giả lập (chế độ demo). */
  async _buildDraftMock(
    options: BuildDraftOptions,
    onProgress?: (stage: string, percent: number) => void,
    signal?: AbortSignal,
  ): Promise<BuildDraftResult> {
    const stages = [
      { name: "Đang đọc giọng thuyết minh TTS...", pct: 35 },
      { name: "Đang khớp khung hình gameplay & cutscene...", pct: 70 },
      { name: "Kiểm tra luật dựng và xuất timeline...", pct: 100 },
    ];

    for (const s of stages) {
      if (signal?.aborted) throw new Error("Thao tác dựng nháp đã bị huỷ");
      onProgress?.(s.name, s.pct);
      await delay(400);
    }

    const totalSec = options.items.reduce(
      (sum, item) => sum + (item.keepOriginal ? item.end - item.start : (item.ttsSecs ?? 8)),
      0,
    );

    return {
      items: options.items.map((it) => ({ ...it })),
      totalSec: Math.round(totalSec * 10) / 10,
      rulesPassed: true,
      warningsCount: 0,
      notes: ["Bản dựng mẫu (Dev Mock Mode)."],
      draftPath: undefined,
    };
  },

  /** Dựng nháp thật qua Tauri backend (`sublix.labBuildDraft`). */
  async _buildDraftReal(
    options: BuildDraftOptions,
    onProgress?: (stage: string, percent: number) => void,
    signal?: AbortSignal,
  ): Promise<BuildDraftResult> {
    if (signal?.aborted) {
      throw new Error("Thao tác dựng nháp đã bị huỷ");
    }
    const analysisRunId = options.runId;
    if (!analysisRunId) {
      throw new Error("Chưa có runId phân tích để dựng nháp.");
    }

    const segments: LabRecapItem[] = options.items.map(mapUiToLabRecapItem);
    const draftOpts: LabDraftOptions = {
      voice: options.voiceId,
      rate: options.rate ?? "+0%",
      pitch: options.pitch ?? "+0Hz",
      originalRatio: options.originalRatio ?? 0.3,
    };

    let activeDraftRunId: string | null = null;
    let unlistenProgress: (() => void) | null = null;
    let unlistenDone: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const cleanup = () => {
      if (unlistenProgress) {
        unlistenProgress();
        unlistenProgress = null;
      }
      if (unlistenDone) {
        unlistenDone();
        unlistenDone = null;
      }
      if (unlistenError) {
        unlistenError();
        unlistenError = null;
      }
    };

    return new Promise<BuildDraftResult>(async (resolve, reject) => {
      let settled = false;

      const finishResolve = (res: BuildDraftResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(res);
      };

      const finishReject = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const onAbort = () => {
        if (activeDraftRunId) {
          sublix.labCancelDraft(activeDraftRunId).catch((e) => {
            console.warn("labCancelDraft error:", e);
          });
        }
        finishReject(new Error("Thao tác dựng nháp đã bị huỷ"));
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        // Đăng ký nghe sự kiện tiến trình dựng nháp (tts | match | render | done)
        unlistenProgress = await onLabProgress((event) => {
          if (!activeDraftRunId || event.runId === activeDraftRunId) {
            const st = event.stage as string;
            if (st === "tts" || st === "match" || st === "render" || st === "done") {
              onProgress?.(st, event.percent);
            }
          }
        });

        // Đăng ký nghe sự kiện hoàn tất dựng nháp
        unlistenDone = await onLabDraftDone((event) => {
          if (!activeDraftRunId || event.runId === activeDraftRunId) {
            finishResolve(mapLabBuildDraftResultToUi(event.result));
          }
        });

        // Đăng ký nghe sự kiện lỗi
        unlistenError = await onLabError((event) => {
          if (!activeDraftRunId || event.runId === activeDraftRunId) {
            finishReject(new Error(event.message || "Quá trình dựng nháp thất bại"));
          }
        });

        if (signal?.aborted) {
          onAbort();
          return;
        }

        const draftRunId = await sublix.labBuildDraft(analysisRunId, segments, draftOpts);
        activeDraftRunId = draftRunId;
      } catch (err) {
        finishReject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  },

  /**
   * Mở bản nháp đã dựng sang Studio:
   * Gọi `sublix.labLoadDraftProject` để nạp dự án Studio có sẵn của video nháp.
   */
  async openInStudio(
    draftPath: string,
  ): Promise<{ success: boolean; studioTabTitle: string; project?: DubbingProject }> {
    if (isLabMockMode() || !draftPath || !draftPath.endsWith(".mp4")) {
      await delay(300);
      return {
        success: true,
        studioTabTitle: "Recap — Vương Miện Tro Tàn",
      };
    }

    try {
      const project = await sublix.labLoadDraftProject(draftPath);
      const fileName = draftPath.replace(/^.*[/\\]/, "");
      return {
        success: true,
        studioTabTitle: fileName,
        project,
      };
    } catch (err) {
      console.warn("Không đọc được dự án nháp từ disk, fallback:", err);
      return {
        success: true,
        studioTabTitle: draftPath.replace(/^.*[/\\]/, ""),
      };
    }
  },

  /** Xoá lượt phân tích khỏi bộ nhớ backend khi đóng wizard. */
  async forgetRun(runId: string): Promise<void> {
    try {
      await sublix.labForgetAnalysis(runId);
    } catch {
      // bỏ qua nếu đã xoá
    }
  },
};
