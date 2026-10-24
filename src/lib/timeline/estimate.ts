/**
 * estimate — ước tính thời gian từng bước của pipeline Studio.
 *
 * Module THUẦN TS (không React, không DOM) để test được bằng `node --test`.
 *
 * Nguồn số mặc định (ghi rõ trong code theo yêu cầu coordinator):
 * - Dịch `MiniMax-M3.1-Flash` + suy luận thấp: **0,44 s/câu** (bench nội bộ 2026-10).
 * - Dịch `Ollama qwen2.5:3b` (iGPU): **0,41 s/câu** (bench nội bộ 2026-10).
 * - Dịch `MiniMax-M3`: **1,2 s/câu** (ước lượng tạm — chờ `docs/BENCH_TRANSLATE_2026-10.md`).
 * - TTS VieNeu (CPU): RTF **0,98**; ZeroTTS: RTF **0,72** (đo CPU 2026-10).
 * - TTS Kokoro (batch): **1,2 s/câu** (`ISSUE_LOG.md` BUG-075 — sau khi sửa nạp model).
 * - Whisper STT base: RTF **2,0** (`DEV-LOG.md:216` — whisper-cli base, 5 s audio → 10,3 s).
 *
 * Sau mỗi lần chạy, tốc độ THẬT của máy người dùng được lưu vào localStorage
 * và được ưu tiên hơn số mặc định (tự học).
 */

/** Loại bước trong pipeline. */
export type StepKind = "stt" | "translate" | "tts";

/** Kho lưu tốc độ đo được (interface tối giản để test không cần DOM). */
export interface RateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Key lưu tốc độ đo được trong localStorage. */
export const RATE_STORAGE_KEY = "sublix_tts_rate_overrides_v1";

/** Số mặc định (nguồn ghi ở đầu file). */
export const DEFAULT_RATES = {
  /** Whisper STT base: hệ số thời gian thực (giây máy / giây audio). */
  sttRtf: 2.0,
  /** Dịch: giây mỗi câu, theo model. */
  translateSecPerSegment: 0.6,
  /** TTS: hệ số thời gian thực (VieNeu 0,98 / ZeroTTS 0,72 / khác 1,0). */
  ttsRtf: 1.0,
  /** TTS Kokoro: giây mỗi câu (batch). */
  ttsSecPerSegment: 1.2,
} as const;

/** Bảng đo mặc định cho từng model dịch (nguồn: bench 2026-10). */
export const DEFAULT_TRANSLATE_RATES: Record<string, number> = {
  "minimax-m3.1-flash": 0.44,
  "minimax-m3": 1.2,
  "qwen2.5:3b": 0.41,
  "qwen2.5:3b-instruct": 0.41,
  "qwen2.5:1.5b": 0.28,
};

/**
 * Hệ số CHẬM khi bật "Dịch theo ngữ cảnh" (đo thật của mcode #2 —
 * `docs/BENCH_TRANSLATE_2026-10.md` §4.4):
 * - Ollama 3B: điểm 4,19 → 2,69 (kém hơn)
 * - MiniMax: 4,79 → 4,34 và **chậm 1,6 lần**
 * - OpenRouter: 4,82 → 4,78 (gần như ngang, nhẹ hơn)
 *
 * Vì vậy chế độ ngữ cảnh MẶC ĐỊNH TẮT với model local nhỏ (ollama/gguf/minimax)
 * và BẬT với model cloud mạnh (openrouter/deepseek).
 */
export const CONTEXTUAL_SLOWDOWN: Record<string, number> = {
  "minimax-m3": 1.6,
  "minimax-m3.1-flash": 1.6,
  "qwen2.5:3b": 1.55,
};

/** Hệ số chậm mặc định khi bật ngữ cảnh (model chưa biết). */
export const CONTEXTUAL_SLOWDOWN_DEFAULT = 1.2;

/**
 * Provider nào BẬT "Dịch theo ngữ cảnh" mặc định.
 * (Đo thật: model local nhỏ dịch kém hơn ở chế độ này.)
 */
export const CONTEXTUAL_DEFAULT_ON_PROVIDERS: readonly string[] = ["openrouter", "deepseek"];

/**
 * Hệ số chậm theo model khi bật dịch theo ngữ cảnh.
 *
 * @param model Id model dịch (vd "MiniMax-M3", "qwen2.5:3b").
 */
export function contextualSlowdown(model: string): number {
  const key = model.trim().toLowerCase();
  return CONTEXTUAL_SLOWDOWN[key] ?? CONTEXTUAL_SLOWDOWN_DEFAULT;
}

/**
 * Provider có bật dịch theo ngữ cảnh mặc định không.
 *
 * @param provider Id provider (vd "openrouter", "ollama").
 */
export function contextualDefaultOn(provider: string): boolean {
  return CONTEXTUAL_DEFAULT_ON_PROVIDERS.includes(provider.trim().toLowerCase());
}

/**
 * Hệ số nhân theo mức suy luận (số bench 0,44 s/câu đo ở mức `low`).
 */
export const REASONING_EFFORT_FACTOR: Record<string, number> = {
  low: 1,
  auto: 1,
  medium: 1.3,
  high: 1.6,
  max: 2.2,
};

/** Bảng RTF mặc định cho từng engine TTS. */
export const DEFAULT_TTS_RTF: Record<string, number> = {
  vieneu: 0.98,
  zerotts: 0.72,
};

/**
 * Tạo key lưu tốc độ đo được cho 1 bước.
 *
 * @param kind Loại bước.
 * @param variant Biến thể (model dịch / engine TTS / model STT).
 */
export function rateKey(kind: StepKind, variant: string): string {
  return `${kind}:${variant.trim().toLowerCase()}`;
}

/**
 * Đọc toàn bộ tốc độ đã đo từ storage (hỏng → trả về rỗng, không crash).
 *
 * @param storage localStorage (hoặc đối tượng tương thích).
 */
export function loadRateOverrides(storage: RateStorage | null): Record<string, number> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(RATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Lưu tốc độ đo được (hỏng → bỏ qua, không crash).
 *
 * @param storage localStorage.
 * @param key    Key (xem `rateKey`).
 * @param value  Giá trị đo được (giây/câu hoặc RTF).
 */
export function saveRateOverride(
  storage: RateStorage | null,
  key: string,
  value: number,
): boolean {
  if (!storage || !Number.isFinite(value) || value <= 0) return false;
  try {
    const current = loadRateOverrides(storage);
    current[key] = value;
    storage.setItem(RATE_STORAGE_KEY, JSON.stringify(current));
    return true;
  } catch {
    return false;
  }
}

/**
 * Tốc độ dịch (giây/câu): ưu tiên số đo được, sau đó bảng mặc định, cuối cùng là
 * số mặc định chung.
 *
 * @param model      Id model dịch.
 * @param effort     Mức suy luận (làm chậm hơn khi cao).
 * @param overrides  Số đo được của máy người dùng.
 */
export function resolveTranslateRate(
  model: string,
  effort: string,
  overrides: Record<string, number>,
  contextual: boolean = false,
): number {
  const ctxSuffix = contextual ? ":ctx" : "";
  const measured =
    overrides[rateKey("translate", `${model}:${effort}${ctxSuffix}`)] ??
    overrides[rateKey("translate", `${model}:${effort}`)];
  if (measured !== undefined) return measured;

  const key = model.trim().toLowerCase();
  // Backend trả id model trần (vd "MiniMax-M3.1-Flash"), nhưng cũng chấp nhận
  // dạng "provider:model" (vd "ollama:qwen2.5:3b") → thử cả hai.
  const bare = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
  const base =
    DEFAULT_TRANSLATE_RATES[key] ?? DEFAULT_TRANSLATE_RATES[bare] ?? DEFAULT_RATES.translateSecPerSegment;
  const factor = REASONING_EFFORT_FACTOR[effort.trim().toLowerCase()] ?? 1;
  const slow = contextual ? contextualSlowdown(model) : 1;
  return base * factor * slow;
}

/**
 * RTF của engine TTS (giây máy / giây audio).
 *
 * @param engine    Id engine ("vieneu", "zerotts", "kokoro"…).
 * @param overrides Số đo được của máy người dùng.
 */
export function resolveTtsRtf(
  engine: string,
  overrides: Record<string, number>,
): number {
  const measured = overrides[rateKey("tts", engine)];
  if (measured !== undefined) return measured;
  return DEFAULT_TTS_RTF[engine.toLowerCase()] ?? DEFAULT_RATES.ttsRtf;
}


/**
 * Ước tính giây cho bước Dịch.
 *
 * @param segmentCount Số câu cần dịch.
 * @param model        Model dịch.
 * @param effort       Mức suy luận.
 * @param overrides    Số đo được.
 * @param contextual   Đang bật "Dịch theo ngữ cảnh" (chậm hơn → nhân hệ số).
 */
export function estimateTranslateSeconds(
  segmentCount: number,
  model: string,
  effort: string,
  overrides: Record<string, number>,
  contextual: boolean = false,
): number {
  const rate = resolveTranslateRate(model, effort, overrides, contextual);
  return Math.max(0, segmentCount) * rate;
}

/** RTF mặc định khi không đọc được từ catalog (Whisper large-v3-turbo, EN). */
export const DEFAULT_STT_RTF = 1.22;

/**
 * Đọc RTF từ chuỗi `rtf_note` của catalog (vd
 * "RTF 1,22 (EN) · 1,62 (ZH) — CPU 4 luồng · 0,02 trên RTX 3090 CUDA").
 *
 * Nhờ vậy ước tính theo DỮ LIỆU CATALOG, không hard-code thứ hạng.
 *
 * @param note Chuỗi rtf_note.
 * @param lang Mã ngôn ngữ nguồn (vd "en", "zh") — ưu tiên số đo theo ngôn ngữ.
 * @returns RTF (giây máy / giây audio) hoặc null nếu không đọc được.
 */
export function parseRtfFromNote(note: string, lang?: string): number | null {
  if (!note) return null;
  const idx = note.search(/RTF/i);
  if (idx < 0) return null;
  // Chỉ lấy phần sau "RTF" và dừng ở dấu gạch dài để khỏi nuốt số khác
  // (vd "— CPU 4 luồng · 0,02 trên RTX 3090 CUDA").
  const tail = note.slice(idx + 3).split("—")[0];
  const re = /(\d+(?:[.,]\d+)?)\s*(?:\(([A-Za-z]{2,3})\))?/g;
  const entries: Array<{ rtf: number; lang: string | null }> = [];
  let match = re.exec(tail);
  while (match !== null) {
    const rtf = Number(match[1].replace(",", "."));
    if (Number.isFinite(rtf) && rtf > 0) {
      entries.push({ rtf, lang: match[2] ? match[2].toLowerCase() : null });
    }
    match = re.exec(tail);
  }
  if (entries.length === 0) return null;
  if (lang) {
    const wanted = lang.trim().toLowerCase();
    const hit = entries.find((entry) => entry.lang === wanted);
    if (hit) return hit.rtf;
  }
  return entries[0].rtf;
}

/**
 * Ước tính giây cho bước Nhận dạng giọng nói, PHÂN BIỆT THEO ENGINE.
 *
 * @param mediaDurationSec Độ dài media (giây).
 * @param engineId         Id engine (vd "whisper-base", "sensevoice-zh-en").
 * @param overrides        Số đo được của máy người dùng.
 * @param rtfNote          Chuỗi rtf_note từ catalog (nguồn sự thật cho RTF).
 * @param lang             Ngôn ngữ nguồn để chọn đúng số RTF theo ngôn ngữ.
 */
export function estimateSttSeconds(
  mediaDurationSec: number,
  engineId: string,
  overrides: Record<string, number>,
  rtfNote?: string,
  lang?: string,
): number {
  const measured = overrides[rateKey("stt", engineId)];
  const rtf = measured ?? parseRtfFromNote(rtfNote ?? "", lang) ?? DEFAULT_STT_RTF;
  return Math.max(0, mediaDurationSec) * rtf;
}

/**
 * Ước tính giây cho bước Lồng tiếng (TTS).
 *
 * @param audioDurationSec Tổng thời lượng audio cần tổng hợp (giây).
 * @param segmentCount     Số câu (dùng cho engine theo câu như Kokoro).
 * @param engine           Id engine.
 * @param overrides        Số đo được.
 */
export function estimateTtsSeconds(
  audioDurationSec: number,
  segmentCount: number,
  engine: string,
  overrides: Record<string, number>,
): number {
  const key = engine.toLowerCase();
  if (key === "kokoro") {
    const perSegment = overrides[rateKey("tts", "kokoro")] ?? DEFAULT_RATES.ttsSecPerSegment;
    return Math.max(0, segmentCount) * perSegment;
  }
  const rtf = resolveTtsRtf(engine, overrides);
  return Math.max(0, audioDurationSec) * rtf;
}

/**
 * Định dạng thời lượng cho người dùng: "~45 giây", "~3 phút", "~1 giờ 10 phút".
 *
 * @param seconds Số giây.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "vài giây";
  const total = Math.round(seconds);
  if (total < 60) return `${total} giây`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) return rest > 0 ? `${minutes} phút ${rest} giây` : `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  return restMin > 0 ? `${hours} giờ ${restMin} phút` : `${hours} giờ`;
}

/** Một dòng ước tính cho 1 bước. */
export interface StepEstimate {
  /** Id bước (khớp `StepKind`). */
  id: StepKind;
  /** Nhãn bước. */
  label: string;
  /** Chi tiết: engine/model + thiết bị. */
  detail: string;
  /** Thời gian ước tính (giây). */
  seconds: number;
  /** Số câu liên quan (nếu có). */
  segmentCount?: number;
}

/** Đầu vào dựng ước tính cho cả pipeline. */
export interface EstimateInput {
  /** Độ dài media (giây). */
  mediaDurationSec: number;
  /** Tổng thời lượng audio của các câu (giây). */
  audioDurationSec: number;
  /** Số câu phụ đề. */
  segmentCount: number;
  /** Model STT (hiển thị trong nhãn). */
  sttModel: string;
  /** Id engine STT đang chọn (để tính RTF đúng engine). */
  sttEngineId: string;
  /** `rtf_note` của engine từ catalog (nguồn sự thật cho RTF). */
  sttRtfNote?: string;
  /** Ngôn ngữ nguồn (để chọn RTF theo ngôn ngữ trong catalog). */
  sourceLang?: string;
  /** Model dịch. */
  translateModel: string;
  /** Mức suy luận. */
  reasoningEffort: string;
  /** Đang bật "Dịch theo ngữ cảnh" (chậm hơn → nhân hệ số). */
  contextualTranslate: boolean;
  /** Engine TTS. */
  ttsEngine: string;
  /** Số đo được của máy người dùng. */
  overrides: Record<string, number>;
}

/**
 * Dựng danh sách ước tính + tổng thời gian của pipeline.
 *
 * @param input Đầu vào.
 */
export function buildEstimates(input: EstimateInput): {
  steps: StepEstimate[];
  totalSeconds: number;
} {
  const steps: StepEstimate[] = [];

  steps.push({
    id: "stt",
    label: "Nhận dạng",
    detail: `${input.sttModel} · CPU`,
    seconds: estimateSttSeconds(
      input.mediaDurationSec,
      input.sttEngineId,
      input.overrides,
      input.sttRtfNote,
      input.sourceLang,
    ),
  });

  steps.push({
    id: "translate",
    label: "Dịch",
    detail: `${input.translateModel} · suy luận ${input.reasoningEffort}${
      input.contextualTranslate ? " · ngữ cảnh" : ""
    }`,
    seconds: estimateTranslateSeconds(
      input.segmentCount,
      input.translateModel,
      input.reasoningEffort,
      input.overrides,
      input.contextualTranslate,
    ),
    segmentCount: input.segmentCount,
  });

  steps.push({
    id: "tts",
    label: "Lồng tiếng",
    detail: `${input.ttsEngine} · CPU`,
    seconds: estimateTtsSeconds(
      input.audioDurationSec,
      input.segmentCount,
      input.ttsEngine,
      input.overrides,
    ),
    segmentCount: input.segmentCount,
  });

  const totalSeconds = steps.reduce((sum, step) => sum + step.seconds, 0);
  return { steps, totalSeconds };
}

/** Tiến độ thật của 1 bước khi đang chạy. */
export interface LiveProgress {
  /** Số phần tử đã xong. */
  done: number;
  /** Tổng số phần tử. */
  total: number;
  /** Thời gian đã trôi (giây). */
  elapsedSec: number;
  /** Giây mỗi phần tử (đo được). */
  secPerUnit: number;
  /** Còn bao lâu (giây). */
  remainingSec: number;
  /** Hệ số so với ước tính (1 = đúng dự kiến). */
  speedFactor: number;
}

/**
 * Tính tiến độ thật khi đang chạy.
 *
 * @param done         Số phần tử đã xong.
 * @param total        Tổng số phần tử.
 * @param elapsedSec   Thời gian đã trôi (giây).
 * @param estimatedSec Ước tính tổng (giây) — để tính hệ số nhanh/chậm.
 */
export function computeLiveProgress(
  done: number,
  total: number,
  elapsedSec: number,
  estimatedSec: number,
): LiveProgress {
  const safeDone = Math.max(0, done);
  const safeTotal = Math.max(safeDone, total);
  const secPerUnit = safeDone > 0 ? Math.max(0, elapsedSec) / safeDone : 0;
  const remainingSec = secPerUnit > 0 ? secPerUnit * Math.max(0, safeTotal - safeDone) : 0;
  const actualTotal = Math.max(0, elapsedSec);
  const speedFactor =
    estimatedSec > 0 && actualTotal > 0 ? estimatedSec / actualTotal : 0;
  return { done: safeDone, total: safeTotal, elapsedSec: actualTotal, secPerUnit, remainingSec, speedFactor };
}

/**
 * Tạo dòng hiển thị tiến độ thật (1 dòng, gọn).
 *
 * @param progress Kết quả `computeLiveProgress`.
 */
export function formatLiveProgress(progress: LiveProgress): string {
  const perUnit = progress.secPerUnit > 0 ? `${progress.secPerUnit.toFixed(1)} s/câu` : "—";
  const remain = progress.remainingSec > 0 ? `còn ~${formatDuration(progress.remainingSec)}` : "gần xong";
  const speed = progress.speedFactor > 0 ? ` · x${progress.speedFactor.toFixed(1)} thời gian thực` : "";
  return `${progress.done}/${progress.total} · ${perUnit} · ${remain}${speed}`;
}
