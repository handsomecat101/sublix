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
