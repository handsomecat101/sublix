//! TSK-LAB-U1A — Lớp API giao tiếp cho Xưởng AI (dữ liệu giả có độ trễ).
//! Sau này chỉ cần thay ruột các hàm bằng lệnh Tauri (`lab_analyze`, `lab_build_draft`...).

import {
  MOCK_CHAPTERS,
  MOCK_CHARACTERS,
  MOCK_JUNK_SEGMENTS,
  MOCK_RECAP_ITEMS,
  type MockChapter,
  type MockCharacter,
  type MockJunkSegment,
} from "./labMock";
import type { RecapItem } from "./labModel";

export interface AnalyzeOptions {
  videoPaths: string[];
  gameName: string;
  webSearch: boolean;
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

/** Giả lập độ trễ ngắn để tạo cảm giác xử lý mượt mà. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const labApi = {
  /** Phân tích video (Bước A): 5 giai đoạn có báo tiến trình. */
  async analyze(
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

  /** Viết kịch bản lời bình (Bước B): trả về danh sách câu văn bản. */
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

  /** Viết lại một đoạn lời bình (hộp nổi RewritePopover). */
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

  /** Dựng nháp timeline (Bước C): đọc giọng TTS và khớp cảnh. */
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
