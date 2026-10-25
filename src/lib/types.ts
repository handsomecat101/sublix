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
  /** Câu này vi phạm bảng thuật ngữ / xưng hô đã duyệt (UI tô vàng). */
  glossaryViolation?: boolean;
  /** Mô tả vi phạm — ví dụ `gọi "ngươi" thay vì "anh"`. */
  glossaryViolationReason?: string | null;
}

/** Sự kiện tiến trình của `translate_script_contextual`. */
export interface TranslateProgress {
  done: number;
  total: number;
  /** "reading" (lượt 1) | "translating" (lượt 2) | "done" */
  phase: string;
  /**
   * Định danh lượt chạy (echo từ backend).
   *
   * Chỉ có mặt khi frontend truyền `runId` vào lệnh — dùng để lọc sự kiện theo tab
   * (xem `docs/STUDIO_TABS_PLAN.md` §3.3). Thiếu ⇒ hành vi cũ.
   */
  run_id?: string;
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

/* ---------------------------------------------------------------------------
 * Bảng thuật ngụ + xưng hô đã duyệt (TSK-FEAT-GLOSSARY-PRONOUN)
 * ------------------------------------------------------------------------- */

/** 1 cặp thuật ngụ / tên riêng: "Dark Templar" → "Mẩu Tử Tối". */
export interface GlossaryTerm {
  source: string;
  /** Rổng = dòng này chỉ là ghi chú tự do. */
  target: string;
  note?: string | null;
}

/** 1 quy tắc xưng hô: A tự xưng "ta", gọi B là "ngươi". */
export interface PronounEntry {
  /** speakerId (hoặc tên) của ngường nói. */
  speaker: string;
  /** speakerId (hoặc tên) của ngường nghe. */
  listener: string;
  /** Từ tự xưng — "ta", "tôi". */
  selfTerm: string;
  /** Từ gọi ngường nghe — "ngươi", "anh", "ngài". */
  addressTerm: string;
}

/** Bảng thuật ngụ + xưng hô đã duyệt. */
export interface Glossary {
  terms: GlossaryTerm[];
  pronouns: PronounEntry[];
  /** Đã khoá ⇒ backend bỏ qua bước LLM tự sinh bảng xưng hô. */
  locked: boolean;
  /** "project" | "global" — nơi đang lưu (read-only). */
  scope?: string;
  /** Đường dẫn file (read-only). */
  path?: string | null;
}

/** 1 nhân vật do LLM gợi ý (lướt 1) — ngường dùng duyệt mới thành quy tắc. */
export interface GlossaryCharacter {
  speakerId: string;
  name: string;
  role: string;
}

/** Kết quả glossary_suggest — gợi ý, chưa gổi gì. */
export interface GlossarySuggestion {
  characters: GlossaryCharacter[];
  terms: GlossaryTerm[];
  pronouns: PronounEntry[];
}

/**
 * Id giọng đọc được ghim ★ (TSK-FEAT-VOICE-PICKER).
 *
 * Lưu trong config toàn cục (favorite_voices) — sở thích của người dùng, KHÔNG theo dự án.
 * Id đầy đủ có tiền tố engine — ví dụ `vietneu:adam`.
 */
export type FavoriteVoiceId = string;

/**
 * 1 giọng đọc trong ô chọn giọng (VoicePicker).
 *
 * Nguồn gốc: danh sách giọng backend trả về (dubbing_get_voices).
 */
export interface VoiceChoice {
  id: FavoriteVoiceId;
  name: string;
  gender: "male" | "female";
  lang?: string;
  engineId: string;
  engineLabel: string;
  kind: "offline" | "cloud";
}
