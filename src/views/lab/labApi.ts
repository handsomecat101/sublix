//! TSK-LAB-U1B — Lớp API giao tiếp cho Xưởng AI.
//! Kết nối lệnh thật qua Tauri (`sublix.labAnalyze`, `labCancel`, các sự kiện `lab:*`)
//! và duy trì chế độ Mock cho môi trường dev/duyệt giao diện.

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
  mapLabAnalysisToResult,
  mapLabStageToProgress,
  prepareLabSourceInputs,
  type RecapItem,
} from "./labModel";
import {
  sublix,
  onLabProgress,
  onLabDone,
  onLabError,
  type LabAnalyzeOptions,
  type LabScene,
  type LabSource,
  type LabSourceInput,
  type LabTranscriptLine,
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
}

export interface BuildDraftOptions {
  items: RecapItem[];
  voiceId: string;
  targetDurationSec: number;
}

export interface BuildDraftResult {
  items: RecapItem[];
  totalSec: number;
  rulesPassed: boolean;
  warningsCount: number;
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
        if (activeRunId) {
          sublix.labForgetAnalysis(activeRunId).catch(() => {});
        }
        resolve(res);
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

  /** Viết kịch bản lời bình (Bước B): trả về danh sách câu văn bản (giữ mock slot chờ C4). */
  async writeNarration(
    _gameTitle: string,
    _targetDurationSec: number,
    onProgress?: (pct: number) => void,
  ): Promise<RecapItem[]> {
    for (let p = 10; p <= 100; p += 30) {
      onProgress?.(p);
      await delay(200);
    }
    return MOCK_RECAP_ITEMS.map((item) => ({ ...item }));
  },

  /** Viết lại một đoạn lời bình (hộp nổi RewritePopover - giữ mock slot chờ C4). */
  async rewriteBlock(
    originalText: string,
    styleChip: string,
    customInstruction?: string,
  ): Promise<string> {
    await delay(600);
    if (styleChip === "Ngắn hơn") {
      return originalText.length > 30 ? originalText.slice(0, 28) + "..." : originalText;
    }
    if (styleChip === "Kịch tính hơn") {
      return `Bất ngờ thay, ${originalText.toLowerCase().replace(/^[a-zà-ỹ]/, (c) => c.toUpperCase())} Nguy hiểm cận kề trong từng tấc đất!`;
    }
    if (styleChip === "Thêm câu nối") {
      return `Chính vì lẽ đó, ${originalText.toLowerCase()}`;
    }
    if (customInstruction) {
      return `${originalText} (theo yêu cầu: ${customInstruction})`;
    }
    return `Nhưng câu chuyện chưa dừng lại ở đó. ${originalText}`;
  },

  /** Dựng nháp timeline (Bước C): đọc giọng TTS và khớp cảnh (giữ mock slot chờ C4). */
  async buildDraft(
    options: BuildDraftOptions,
    onProgress?: (stage: string, percent: number) => void,
  ): Promise<BuildDraftResult> {
    const stages = [
      { name: "Đang đọc giọng thuyết minh TTS...", pct: 35 },
      { name: "Đang khớp khung hình gameplay & cutscene...", pct: 70 },
      { name: "Kiểm tra luật dựng và xuất timeline...", pct: 100 },
    ];

    for (const s of stages) {
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
    };
  },

  /** Mở bản nháp đã dựng sang Studio (hiện tại hiển thị thông báo). */
  async openInStudio(_draftId: string): Promise<{ success: boolean; studioTabTitle: string }> {
    await delay(300);
    return {
      success: true,
      studioTabTitle: "Recap — Vương Miện Tro Tàn",
    };
  },
};
