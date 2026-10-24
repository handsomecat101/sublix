//! Shared TypeScript types for Sublix.

export type WindowKind = "main" | "overlay";

export type SublixStatus =
  | { kind: "idle" }
  | { kind: "capturing"; device: string; startedAt: number }
  | { kind: "transcribing"; file: string }
  | { kind: "translating"; text: string }
  | { kind: "error"; message: string };

export interface SubtitleLine {
  id: string;
  text: string;
  translated?: string;
  timestamp: number; // ms since epoch
  ttlMs: number; // auto-expire after this
}

/** 1 dòng thoại trong kịch bản — đầu vào của `translate_script_contextual`. */
export interface ScriptLine {
  id: string;
  speakerId: string;
  speakerName?: string;
  text: string;
  /** giây */
  start: number;
  /** giây */
  end: number;
}

/** Kết quả dịch theo ngữ cảnh cho 1 dòng. */
export interface ContextualLine {
  id: string;
  translated: string;
  failed: boolean;
}

/** Sự kiện tiến trình của `translate_script_contextual`. */
export interface TranslateProgress {
  done: number;
  total: number;
  /** "reading" (lượt 1) | "translating" (lượt 2) | "done" */
  phase: string;
}

/** 1 model trong danh sách lựa chọn dịch. */
export interface TranslateModelOption {
  /** "minimax" | "openrouter" | "deepseek" | "ollama" | "local" (GGUF) */
  provider: string;
  /** id model (đưa vào config theo provider tương ứng) */
  id: string;
  label: string;
  /** true = chạy local, không cần API key */
  local: boolean;
}

/** Các lựa chọn dịch hiện tại + danh sách model. */
export interface TranslateOptions {
  provider: string;
  model: string;
  /** "auto" | "low" | "medium" | "high" | "max" */
  reasoning_effort: string;
  /** provider/model có nhận tham số mức độ suy luận không */
  supports_reasoning: boolean;
  models: TranslateModelOption[];
}

/**
 * Nhãn hiển thị cho nguồn phụ đề.
 *
 * `source` là id nền tảng do backend ghi vào manifest
 * `sublix_subtitles.json` (xem `downloader::subtitle_source`): "youtube",
 * "bilibili", "douyin"… hoặc "file" cho phụ đề tự mang vào.
 */
export const SUBTITLE_SOURCE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  douyin: "Douyin",
  bilibili: "Bilibili",
  kuaishou: "Kuaishou",
  xiaohongshu: "Xiaohongshu",
  ixigua: "Xigua",
  huya: "Huya",
  douyu: "Douyu",
  youku: "Youku",
  iqiyi: "iQIYI",
  weibo: "Weibo",
  acfun: "AcFun",
  cctv: "CCTV",
  vqq: "Tencent Video",
  mgtv: "MangoTV",
  migu: "Migu",
  niconico: "Niconico",
  wppilot: "WeChat Channels",
  instagram: "Instagram",
  facebook: "Facebook",
  twitch: "Twitch",
  kick: "Kick",
  dailymotion: "Dailymotion",
  vk: "VK",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  vimeo: "Vimeo",
  twitter: "X / Twitter",
  reddit: "Reddit",
  soundcloud: "SoundCloud",
};

/** Tên nền tảng để hiển thị; trả về chính id nếu không có trong danh sách. */
export function subtitleSourceLabel(source: string): string {
  if (!source || source === "file") return "";
  return SUBTITLE_SOURCE_LABELS[source] ?? source;
}
