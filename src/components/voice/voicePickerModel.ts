//! Logic thuần cho ô chọn giọng (`VoicePicker`) — TSK-FEAT-VOICE-PICKER.
//!
//! Không import React, không gọi IPC ⇒ test được bằng `node --test`
//! (`scripts/voice-picker-tests/voicePickerModel.test.ts`).
//!
//! Theo thiết kế `docs/UI_REDESIGN_PLAN.md` §4.10:
//! - tìm **không cần dấu** (bỏ dấu + chữ thường, khớp chuỗi con trên tên + engine + ngôn ngữ);
//! - lọc giới tính (mặc định **Tất cả**);
//! - nhóm **★ Yêu thích** luôn đầu → mỗi engine 1 nhóm → trong engine tách nhóm ngôn ngữ
//!   **chỉ khi > 1 ngôn ngữ**;
//! - giọng ★ chỉ hiện **1 lần** (ở nhóm ★), không lặp lại trong nhóm engine;
//! - giữ thứ tự backend trả về (không sắp lại).

/** 1 giọng đọc trong ô chọn. */
export interface VoicePickerItem {
  /** Id đầy đủ có tiền tố engine — "vietneu:adam". */
  id: string;
  /** Tên hiển thị (đã tách khỏi nhãn backend). */
  name: string;
  gender: "male" | "female";
  /** Mã ngôn ngữ — "vi". */
  lang?: string;
  /** Id engine — "vietneu". */
  engineId: string;
  /** Tên engine hiển thị — "VieNeu v3". */
  engineLabel: string;
  /** offline = chạy trên máy, cloud = cần mạng. */
  kind: "offline" | "cloud";
}

/** Lọc giới tính. */
export type GenderFilter = "all" | "male" | "female";

/** Nhóm ngôn ngữ con (chỉ tạo khi engine có > 1 ngôn ngữ). */
export interface VoiceLangGroup {
  key: string;
  title: string;
  count: number;
  items: VoicePickerItem[];
}

/** 1 nhóm trong danh sách (tiêu đề + giọng). */
export interface VoiceGroup {
  kind: "favorite" | "engine";
  key: string;
  /** "★ Yêu thích" | "Tất cả". */
  title: string;
  /** Badge engine ở tiêu đề. */
  engineLabel?: string;
  engineKind?: "offline" | "cloud";
  /** Tổng số giọng của nhóm (kể cả nhóm ngôn ngữ con). */
  count: number;
  /** Giọng của nhóm (rỗng khi nhóm có nhóm ngôn ngữ con). */
  items: VoicePickerItem[];
  /** Nhóm ngôn ngữ con. */
  langs?: VoiceLangGroup[];
}

/** 1 dòng trong danh sách phẳng (tiêu đề nhóm hoặc 1 giọng). */
export type VoiceEntry =
  | { kind: "header"; key: string; title: string; engineLabel?: string; engineKind?: "offline" | "cloud"; count: number; level: 0 | 1 }
  | { kind: "row"; key: string; item: VoicePickerItem; groupKey: string; langKey?: string };

/** Bỏ dấu + hạ chữ thường (tìm "adam" khớp "Adam bựa", "vieneu" khớp "VieNeu"). */
export function normalizeText(s: string): string {
  return (s ?? "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Chuẩn hoá **1 ký tự**, KHÔNG trim (giữ khoảng trắng để tô phần khớp đúng vị trí). */
function normalizeChar(ch: string): string {
  return ch
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Các thành phần tách ra từ nhãn backend. */
export interface VoiceLabelParts {
  name: string;
  lang?: string;
  engine?: string;
  engineKind?: "offline" | "cloud";
}

/**
 * Tách nhãn backend `"VN • Adam bựa (VieNeu v3 — offline)"`.
 *
 * - `VN •` → mã ngôn ngữ (bỏ khỏi tên).
 * - `(VieNeu v3 — offline)` → engine + loại (offline / cloud).
 */
const LANG_ALIAS: Record<string, string> = {
  vn: "vi", vi: "vi", en: "en", us: "en", gb: "en",
  ja: "ja", jp: "ja", zh: "zh", cn: "zh", tw: "zh", ko: "ko", kr: "ko",
};

/** Quay doi ma ngon ngu (chap nhan ca ma quoc gia). */
export function langFromCode(raw: string): string {
  const key = (raw ?? "").trim().toLowerCase();
  return LANG_ALIAS[key] ?? key;
}

export function parseVoiceLabel(label: string): VoiceLabelParts {
  const text = (label ?? "").trim();
  let rest = text;
  let engine: string | undefined;
  let engineKind: "offline" | "cloud" | undefined;

  const paren = /\(([^()]*)\)\s*$/.exec(rest);
  if (paren) {
    const inner = paren[1].trim();
    rest = rest.slice(0, paren.index).trim();
    const dash = inner.split(/\s+[—–-]\s+/);
    engine = (dash[0] ?? inner).trim() || undefined;
    const tail = inner.toLowerCase();
    if (tail.includes("offline")) engineKind = "offline";
    else if (tail.includes("cloud") || tail.includes("mạng") || tail.includes("online")) engineKind = "cloud";
  }

  let lang: string | undefined;
  const lead = /^([A-Za-z]{2,3})\s*[•·]\s*(.+)$/.exec(rest);
  if (lead) {
    lang = langFromCode(lead[1]);
    rest = lead[2].trim();
  }
  return { name: rest || text, lang, engine, engineKind };
}

/** Tạo item từ option backend (`id` + `label`) — fallback khi backend chỉ trả nhãn. */
export function voiceItemFromOption(
  id: string,
  label: string,
  gender: "male" | "female",
): VoicePickerItem {
  const parts = parseVoiceLabel(label);
  // Id KHÔNG có tiền tố engine (vd "vi-VN-NamMinhNeural") ⇒ giọng Edge-TTS:
  // nhãn backend KHÔNG chứa tên engine (ngoặc là tên biến thể) ⇒ đặt engine "Edge".
  if (!id.includes(":")) {
    return {
      id,
      name: parts.name,
      gender,
      engineId: "edge",
      engineLabel: "Edge",
      kind: "cloud",
    };
  }
  const engineId = id.slice(0, id.indexOf(":"));
  return {
    id,
    name: parts.name,
    gender,
    lang: parts.lang,
    engineId,
    engineLabel: parts.engine ?? engineId,
    kind: parts.engineKind ?? "offline",
  };
}

/** Rút gọn nhãn engine cho badge — "VieNeu v3 — offline" → "VieNeu". */
export function shortEngineLabel(label: string): string {
  const first = (label ?? "").split(/\s+[—–-]\s+/)[0]?.trim() ?? "";
  return first || (label ?? "").trim();
}

/** Giọng có khớp từ khoá tìm (không dấu) trên tên + engine + ngôn ngữ. */
export function matchesQuery(item: VoicePickerItem, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const haystack = normalizeText(`${item.name} ${item.engineLabel} ${item.lang ?? ""}`);
  return haystack.includes(q);
}

/** Lọc theo tìm kiếm + giới tính. */
export function filterVoices(
  items: ReadonlyArray<VoicePickerItem>,
  query: string,
  gender: GenderFilter,
): VoicePickerItem[] {
  return items.filter((i) => (gender === "all" || i.gender === gender) && matchesQuery(i, query));
}

/** Tuỳ chọn dựng nhóm. */
export interface GroupOptions {
  /** Chỉ hiện các engine này (Studio: engine đang chọn). */
  engineIds?: readonly string[];
}

/**
 * Dựng nhóm: ★ Yêu thích (đầu tiên) → mỗi engine 1 nhóm → nhóm ngôn ngữ con
 * (chỉ khi engine có > 1 ngôn ngữ).
 */
export function buildGroups(
  items: ReadonlyArray<VoicePickerItem>,
  favorites: ReadonlySet<string>,
  query: string,
  gender: GenderFilter,
  options: GroupOptions = {},
): VoiceGroup[] {
  const filtered = filterVoices(items, query, gender);
  const groups: VoiceGroup[] = [];

  const favItems = filtered.filter((i) => favorites.has(i.id));
  if (favItems.length > 0) {
    groups.push({ kind: "favorite", key: "fav", title: "★ Yêu thích", count: favItems.length, items: favItems });
  }

  const rest = filtered.filter((i) => !favorites.has(i.id));
  const engineIds = options.engineIds?.length
    ? options.engineIds.filter((id) => rest.some((i) => i.engineId === id))
    : [...new Set(rest.map((i) => i.engineId))];

  for (const eid of engineIds) {
    const engineItems = rest.filter((i) => i.engineId === eid);
    if (engineItems.length === 0) continue;
    const engineLabel = engineItems[0].engineLabel;
    const engineKind = engineItems[0].kind;
    const langs = [...new Set(engineItems.map((i) => i.lang ?? ""))];
    if (langs.length > 1) {
      const langGroups: VoiceLangGroup[] = langs.map((lg) => {
        const li = engineItems.filter((i) => (i.lang ?? "") === lg);
        return { key: `lang:${eid}:${lg}`, title: lg.toUpperCase(), count: li.length, items: li };
      });
      groups.push({
        kind: "engine",
        key: `engine:${eid}`,
        title: "Tất cả",
        engineLabel,
        engineKind,
        count: engineItems.length,
        items: [],
        langs: langGroups,
      });
    } else {
      groups.push({
        kind: "engine",
        key: `engine:${eid}`,
        title: "Tất cả",
        engineLabel,
        engineKind,
        count: engineItems.length,
        items: engineItems,
      });
    }
  }
  return groups;
}

/** Danh sách phẳng (tiêu đề + giọng) — dùng cho điều hướng phím (bỏ qua tiêu đề). */
export function flattenEntries(groups: ReadonlyArray<VoiceGroup>): VoiceEntry[] {
  const out: VoiceEntry[] = [];
  for (const g of groups) {
    out.push({
      kind: "header",
      key: `h:${g.key}`,
      title: g.title,
      engineLabel: g.engineLabel,
      engineKind: g.engineKind,
      count: g.count,
      level: 0,
    });
    if (g.langs?.length) {
      for (const lg of g.langs) {
        out.push({
          kind: "header",
          key: `h:${lg.key}`,
          title: lg.title,
          engineLabel: g.engineLabel,
          engineKind: g.engineKind,
          count: lg.count,
          level: 1,
        });
        for (const item of lg.items) {
          out.push({ kind: "row", key: `r:${item.id}`, item, groupKey: g.key, langKey: lg.key });
        }
      }
    } else {
      for (const item of g.items) {
        out.push({ kind: "row", key: `r:${item.id}`, item, groupKey: g.key });
      }
    }
  }
  return out;
}

/** Chỉ các dòng giọng (bỏ tiêu đề) — mảng điều hướng phím. */
export function rowItems(entries: ReadonlyArray<VoiceEntry>): VoicePickerItem[] {
  return entries.filter((e): e is Extract<VoiceEntry, { kind: "row" }> => e.kind === "row").map((e) => e.item);
}

/** Chiều cao 1 dòng (px) — cố định để ảo hoá được. */
export const ROW_HEIGHT = 32;
/** Chiều cao 1 tiêu đề nhóm (px). */
export const HEADER_HEIGHT = 22;

/** Cửa sổ hoá: chỉ render các dòng nhìn thấy (+ overscan). */
export interface WindowRange {
  /** Chỉ số entry đầu tiên được render. */
  start: number;
  /** Chỉ số entry cuối (không kể). */
  end: number;
  /** Chiều cao của các entry bị bỏ qua phía trên (px). */
  offsetTop: number;
  /** Tổng chiều cao (px). */
  totalHeight: number;
}

/**
 * Tính cửa sổ hoá cho danh sách dài (> 100 giọng).
 *
 * Tiêu đề nhóm có chiều cao khác dòng nên offset tính bằng tổng chiều cao thật.
 */
export function computeWindow(
  entries: ReadonlyArray<VoiceEntry>,
  scrollTop: number,
  viewportHeight: number,
  overscan = 6,
): WindowRange {
  const heights = entries.map((e) => (e.kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT));
  const totalHeight = heights.reduce((a, b) => a + b, 0);
  let offset = 0;
  let start = 0;
  while (start < entries.length && offset + (heights[start] as number) < scrollTop) {
    offset += heights[start] as number;
    start += 1;
  }
  let end = start;
  let acc = offset;
  while (end < entries.length && acc < scrollTop + viewportHeight + ROW_HEIGHT * overscan) {
    acc += heights[end] as number;
    end += 1;
  }
  return {
    start: Math.max(0, start - overscan),
    end: Math.min(entries.length, end + overscan),
    offsetTop: offset,
    totalHeight,
  };
}

/**
 * Gợi ý khi không có kết quả: "Bỏ lọc ♂ Nam (2 kết quả)".
 *
 * Chỉ hiện khi **đang lọc mà không còn kết quả** nhưng bỏ lọc thì **có** kết quả
 * (thiếu gì thì gợi ý đúng cái đó — không bao giờ hiện khung trống trơn).
 */
export function clearFilterHint(
  items: ReadonlyArray<VoicePickerItem>,
  query: string,
  gender: GenderFilter,
): string | null {
  if (gender === "all") return null;
  if (filterVoices(items, query, gender).length > 0) return null;
  const all = filterVoices(items, query, "all").length;
  if (all === 0) return null;
  const label = gender === "male" ? "♂ Nam" : "♀ Nữ";
  return `Bỏ lọc ${label} (${all} kết quả)`;
}

/** Nhãn lọc giới tính (tiếng Việt có dấu). */
export function genderLabel(gender: GenderFilter): string {
  if (gender === "male") return "♂ Nam";
  if (gender === "female") return "♀ Nữ";
  return "Tất cả";
}

/** Tách tên để tô phần khớp từ khoá tìm (dùng `<mark>`). */
export function highlightParts(name: string, query: string): { text: string; hit: boolean }[] {
  const q = normalizeText(query);
  if (!q) return [{ text: name, hit: false }];
  // Chuẩn hoá TỪNG ký tự + bản đồ chỉ số về chuỗi gốc (để tô đúng phần khớp
  // kể cả khi từ khoá không có dấu: "bua" khớp "bựa").
  const norm: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < name.length; i += 1) {
    const n = normalizeChar(name[i] as string);
    for (let k = 0; k < n.length; k += 1) {
      norm.push(n[k] as string);
      map.push(i);
    }
  }
  const ns = norm.join("");
  const out: { text: string; hit: boolean }[] = [];
  let i = 0;
  while (i < ns.length) {
    const hit = ns.startsWith(q, i);
    const lastIdx = map[Math.min(i + (hit ? q.length : 1) - 1, map.length - 1)] as number;
    out.push({ text: name.slice(map[i] as number, lastIdx + 1), hit });
    i += hit ? q.length : 1;
  }
  return out;
}
