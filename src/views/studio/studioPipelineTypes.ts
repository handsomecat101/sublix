/**
 * Kiểu dữ liệu + nhãn dùng chung cho panel quy trình Studio (R2-3).
 *
 * Tách riêng để `StudioPipelinePanel.tsx` và `StudioVoiceStep.tsx` cùng dùng mà
 * không phải import chéo (tránh vòng phụ thuộc component).
 */
import type { ReasoningEffort, TranslateOptions } from "./translateOptions";

/** 5 bước của quy trình (theo thứ tự người dùng làm). */
export type PipelineStepId = "source" | "sub" | "translate" | "voice" | "export";

/** Bước đang mở trong panel (accordion — chỉ 1 bước mở tại 1 thời điểm). */
export type PipelineOpenStep = "sub" | "translate" | "voice" | "advanced" | null;

/** Một vai diễn (dùng cho hàng vai trong bước Lồng tiếng). */
export interface PanelRole {
  id: string;
  name: string;
  gender: "male" | "female";
  color: string;
  /** Id giọng hiện tại của vai (do backend định nghĩa). */
  voice: string;
  /** Số câu của vai. */
  count: number;
}

/** Một engine TTS do backend báo (không hard-code ở frontend). */
export interface PanelEngine {
  id: string;
  /** Tiền tố id giọng của engine (vd "vietneu:", "kokoro:"). */
  prefix: string;
  /** offline = chạy trên máy, cloud = cần mạng. */
  kind: "offline" | "cloud";
  /** Id model (để tải model). */
  modelId?: string;
  /** Model đã tải chưa. */
  installed?: boolean;
  /** Thiếu thư viện phụ thuộc (Python...) chưa. */
  deps?: boolean;
  /** Cần API key chưa có. */
  needsKey?: boolean;
  /** Đã có API key chưa. */
  hasKey?: boolean;
  /** Dùng được ngay (model + deps hoặc đã có key). */
  ready: boolean;
  /** Gợi ý khi chưa dùng được (vd "Cần API key — vào Cài đặt"). */
  hint: string;
}

/** Một lựa chọn giọng đọc (từ backend `dubbing_get_voices`). */
export interface PanelVoiceOption {
  id: string;
  label: string;
  gender: "male" | "female";
}

/** Ước tính thời gian 1 bước (hiển thị gọn 1 dòng trong panel). */
export interface PanelEstimate {
  /** Id bước. */
  id: "stt" | "translate" | "tts";
  /** Tên bước (vd "Nhận dạng"). */
  label: string;
  /** Chi tiết (model/engine + thiết bị). */
  detail: string;
  /** Thời gian ước tính (giây). */
  seconds: number;
  /** Số câu liên quan (nếu có). */
  segmentCount?: number;
}

/** Tiến độ THẬT của bước đang chạy. */
export interface PanelLiveProgress {
  /** Id bước đang chạy. */
  stepId: "stt" | "translate" | "tts";
  /** Dòng mô tả gọn (vd "12/60 câu · 0,4 s/câu · còn ~19 s"). */
  text: string;
}

/** Trạng thái hiển thị của panel (chỉ đọc — panel KHÔNG tự giữ state nghiệp vụ). */
export interface StudioPipelineState {
  /** Số câu phụ đề hiện có. */
  segmentCount: number;
  /** Ngôn ngữ gốc. */
  sttLang: string;
  /** Model nhận dạng (trong "Nâng cao"). */
  sttModel: string;
  /** Ngôn ngữ đích. */
  targetLang: string;
  /** Phong cách dịch. */
  transStyle: string;
  /** Nhà cung cấp dịch (dòng chỉ đọc). */
  providerLabel: string;
  /** Bật bước Phụ đề. */
  workflowStt: boolean;
  /** Bật bước Dịch. */
  workflowTranslate: boolean;
  /** Bật bước Lồng tiếng. */
  workflowVoice: boolean;
  /** Dùng phụ đề .srt đã tải sẵn. */
  preferExistingSrt: boolean;
  /** Mô tả nguồn phụ đề (null = chưa có gì). */
  sourceLabel: string | null;
  /** Số người nói: 0 = tự động, 1, 2. */
  expectedSpeakerCount: number;
  /** Danh sách engine TTS từ backend. */
  engines: PanelEngine[];
  /** Engine đang chọn. */
  selectedEngineId: string | null;
  /** Giọng đọc của engine đang chọn (từ backend). */
  voiceOptions: PanelVoiceOption[];
  /** Các vai diễn. */
  roles: PanelRole[];
  /** Hồ sơ phim (cặp xưng hô). */
  glossary: string[];
  /** Đang chạy tác vụ nào (null = rảnh). */
  running: boolean;
  /** Nhãn tiến độ khi đang chạy. */
  runningLabel: string;
  /** Bước đang mở trong accordion. */
  openStep: PipelineOpenStep;
  /** Có vùng In–Out. */
  hasRange: boolean;
  /** Nhãn vùng In–Out (vd "00:12 → 00:30"). */
  rangeLabel: string;
  /** Engine đang tải model (null = không tải). */
  downloadingEngineId: string | null;
  /** % tiến trình tải model (null = không có tiến trình). */
  downloadProgress: number | null;
  /** Vai đang nghe thử (null = không có). */
  auditioningRoleId: string | null;
  /** Engine đang nghe thử (null = không có). */
  auditioningEngineId: string | null;
  /** Tuỳ chọn model dịch từ backend (`translate_options_get`). */
  translateOptions: TranslateOptions | null;
  /** Đang tải danh sách model dịch. */
  translateOptionsLoading: boolean;
  /** Backend chưa có lệnh `translate_options_get` → hiện trạng thái dự phòng. */
  translateOptionsUnavailable: boolean;
  /** Ước tính thời gian từng bước (trước khi chạy). */
  stepEstimates: PanelEstimate[];
  /** Tiến độ thật của bước đang chạy (null = không chạy). */
  liveProgress: PanelLiveProgress | null;
}

/** Các hành động của panel — truyền từ file cha (state KHÔNG chuyển sang con). */
export interface StudioPipelineApi {
  setOpenStep: (step: PipelineOpenStep) => void;
  setWorkflowStt: (value: boolean) => void;
  setWorkflowTranslate: (value: boolean) => void;
  setWorkflowVoice: (value: boolean) => void;
  setSttLang: (value: string) => void;
  setSttModel: (value: string) => void;
  setTargetLang: (value: string) => void;
  setTransStyle: (value: string) => void;
  setPreferExistingSrt: (value: boolean) => void;
  setExpectedSpeakerCount: (value: number) => void;
  setRoleVoice: (roleId: string, voiceId: string) => void;
  setRoleName: (roleId: string, name: string) => void;
  toggleRoleGender: (roleId: string) => void;
  addRole: () => void;
  removeRole: (roleId: string) => void;
  mergeRoleInto: (fromRoleId: string, toRoleId: string) => void;
  mergeAllInto: (roleId: string) => void;
  mergeToTwo: () => void;
  mergeToOne: () => void;
  applyEngineToAll: () => void;
  selectEngine: (engineId: string) => void;
  previewEngine: (engineId: string) => void;
  downloadEngineModel: (engineId: string) => void;
  auditionRole: (roleId: string) => void;
  playOriginalClip: (roleId: string) => void;
  runStepSub: () => void;
  runStepTranslate: () => void;
  runStepVoice: () => void;
  runAll: () => void;
  cancel: () => void;
  runRangeOnly: () => void;
  addGlossary: (term: string) => void;
  removeGlossary: (term: string) => void;
  openExport: () => void;
  openSettings: () => void;
  /** Chọn model dịch (ghi ngay, không có nút Lưu). */
  selectTranslateModel: (modelId: string, provider: string) => void;
  /** Chọn mức suy luận (ghi ngay). */
  selectReasoningEffort: (effort: ReasoningEffort) => void;
  /** Provider này đã có API key chưa (chỉ trả true/false, không trả key). */
  hasProviderKey: (provider: string) => boolean;
}

/** Nhãn hiển thị của 5 bước trên rail. */
export const PIPELINE_STEPS: ReadonlyArray<{
  id: PipelineStepId;
  label: string;
  color: string;
}> = [
  { id: "source", label: "Nguồn", color: "var(--t3)" },
  { id: "sub", label: "Phụ đề", color: "var(--step-sub)" },
  { id: "translate", label: "Dịch", color: "var(--step-tr)" },
  { id: "voice", label: "Lồng tiếng", color: "var(--step-dub)" },
  { id: "export", label: "Xuất", color: "var(--t3)" },
];

/** Tuỳ chọn ngôn ngữ gốc. */
export const STT_LANG_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "auto", label: "Tự động phát hiện" },
  { value: "ja", label: "Tiếng Nhật" },
  { value: "en", label: "Tiếng Anh" },
  { value: "zh", label: "Tiếng Trung" },
  { value: "vi", label: "Tiếng Việt" },
];

/** Tuỳ chọn ngôn ngữ đích. */
export const TARGET_LANG_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "Tiếng Anh" },
  { value: "ja", label: "Tiếng Nhật" },
  { value: "zh", label: "Tiếng Trung" },
];

/** Tuỳ chọn phong cách dịch (segmented 3 lựa chọn). */
export const TRANS_STYLE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "theatrical", label: "Truyền cảm" },
  { value: "natural", label: "Tự nhiên" },
  { value: "concise", label: " súc tích" },
];

/** Tuỳ chọn mô hình nhận dạng (trong "Nâng cao"). */
export const STT_MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "large-v3-turbo", label: "Whisper Large-v3-Turbo" },
  { value: "base", label: "Whisper Base (nhẹ)" },
];

/** Tuỳ chọn số người nói (segmented) — value là chuỗi cho khớp kiểu `Segmented`. */
export const SPEAKER_COUNT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "0", label: "Tự động" },
  { value: "1", label: "1 người" },
  { value: "2", label: "2 người" },
];

/** Nhãn hiển thị ngắn cho engine TTS (tên do backend quyết định, không hard-code ở đây). */
export function engineLabel(engine: PanelEngine): string {
  switch (engine.id) {
    case "vieneu":
      return "VieNeu";
    case "kokoro":
      return "Kokoro";
    case "zerotts":
      return "ZeroTTS";
    case "gcloud":
      return "Google";
    case "fptai":
      return "FPT.AI";
    default:
      return engine.id;
  }
}
