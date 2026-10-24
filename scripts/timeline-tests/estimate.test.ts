/**
 * Unit test cho `src/lib/timeline/estimate.ts` (ước tính thời gian pipeline).
 * Chạy: node --test scripts/timeline-tests/
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEstimates,
  computeLiveProgress,
  contextualDefaultOn,
  DEFAULT_TRANSLATE_RATES,
  estimateSttSeconds,
  estimateTranslateSeconds,
  estimateTtsSeconds,
  formatDuration,
  formatLiveProgress,
  loadRateOverrides,
  parseRtfFromNote,
  rateKey,
  resolveTranslateRate,
  resolveTtsRtf,
  RATE_STORAGE_KEY,
  saveRateOverride,
  type RateStorage,
} from "../../src/lib/timeline/estimate.ts";

/** Storage giả (in-memory). */
function fakeStorage(initial: Record<string, string> = {}): RateStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

test("estimate: formatDuration", () => {
  assert.equal(formatDuration(0), "vài giây");
  assert.equal(formatDuration(45), "45 giây");
  assert.equal(formatDuration(60), "1 phút");
  assert.equal(formatDuration(95), "1 phút 35 giây");
  assert.equal(formatDuration(3600), "1 giờ");
  assert.equal(formatDuration(4200), "1 giờ 10 phút");
  assert.equal(formatDuration(Number.NaN), "vài giây");
});

test("estimate: tốc độ dịch theo model (mặc định từ bench)", () => {
  assert.equal(resolveTranslateRate("MiniMax-M3.1-Flash", "low", {}), 0.44);
  assert.equal(resolveTranslateRate("minimax:MiniMax-M3.1-Flash", "low", {}), 0.44);
  assert.equal(resolveTranslateRate("qwen2.5:3b", "auto", {}), DEFAULT_TRANSLATE_RATES["qwen2.5:3b"]);
  // Model lạ → dùng số mặc định chung.
  assert.ok(resolveTranslateRate("unknown-model", "auto", {}) > 0);
});

test("estimate: mức suy luận cao tốn thời gian hơn", () => {
  const low = resolveTranslateRate("unknown-model", "low", {});
  const high = resolveTranslateRate("unknown-model", "high", {});
  const max = resolveTranslateRate("unknown-model", "max", {});
  assert.ok(high > low);
  assert.ok(max > high);
});

test("estimate: số đo được của máy người dùng được ưu tiên", () => {
  const overrides = { [rateKey("translate", "my-model:high")]: 0.9 };
  assert.equal(resolveTranslateRate("my-model", "high", overrides), 0.9);
});

test("estimate: lưu/đọc tốc độ đo được qua localStorage", () => {
  const storage = fakeStorage();
  assert.equal(saveRateOverride(storage, rateKey("tts", "vieneu"), 1.5), true);
  const loaded = loadRateOverrides(storage);
  assert.equal(loaded[rateKey("tts", "vieneu")], 1.5);
  assert.equal(storage.data[RATE_STORAGE_KEY] !== undefined, true);
});

test("estimate: storage hỏng / rỗng → không crash", () => {
  assert.deepEqual(loadRateOverrides(null), {});
  assert.deepEqual(loadRateOverrides(fakeStorage({ [RATE_STORAGE_KEY]: "khong phai json" })), {});
  assert.deepEqual(loadRateOverrides(fakeStorage({ [RATE_STORAGE_KEY]: '{"a":"x","b":-1}' })), {});
  assert.equal(saveRateOverride(null, "k", 1), false);
  assert.equal(saveRateOverride(fakeStorage(), "k", 0), false);
});

test("estimate: ước tính STT theo RTF (phân biệt theo engine)", () => {
  // Whisper base: RTF 0,16 (EN) · 0,14 (ZH) — CPU 4 luồng
  const near = (actual: number, expected: number) =>
    assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);
  near(estimateSttSeconds(100, "whisper-base", {}, "RTF 0,16 (EN) · 0,14 (ZH) — CPU 4 luồng"), 16);
  near(estimateSttSeconds(100, "whisper-base", {}, "RTF 0,16 (EN) · 0,14 (ZH)", "zh"), 14);
  near(estimateSttSeconds(100, "whisper-x", {}, ""), 122);
  near(estimateSttSeconds(100, "whisper-base", { [rateKey("stt", "whisper-base")]: 0.5 }), 50);
  assert.equal(estimateSttSeconds(0, "whisper-base", {}, ""), 0);
});

test("estimate: parseRtfFromNote đọc được số RTF của catalog", () => {
  const note = "RTF 1,22 (EN) · 1,62 (ZH) — CPU 4 luồng · 0,02 trên RTX 3090 CUDA";
  assert.equal(parseRtfFromNote(note), 1.22);
  assert.equal(parseRtfFromNote(note, "en"), 1.22);
  assert.equal(parseRtfFromNote(note, "zh"), 1.62);
  assert.equal(parseRtfFromNote("không có RTF"), null);
  assert.equal(parseRtfFromNote(""), null);
});

test("estimate: bật dịch theo ngữ cảnh → chậm hơn (hệ số)", () => {
  const base = resolveTranslateRate("MiniMax-M3", "low", {});
  const ctx = resolveTranslateRate("MiniMax-M3", "low", {}, true);
  assert.ok(ctx > base);
  assert.equal(Math.round((ctx / base) * 100) / 100, 1.6);
  assert.equal(contextualDefaultOn("openrouter"), true);
  assert.equal(contextualDefaultOn("deepseek"), true);
  assert.equal(contextualDefaultOn("ollama"), false);
  assert.equal(contextualDefaultOn("minimax"), false);
});

test("estimate: số đo của chế độ ngữ cảnh dùng key riêng (:ctx)", () => {
  const overrides = { [rateKey("translate", "MiniMax-M3:low:ctx")]: 0.8 };
  assert.equal(resolveTranslateRate("MiniMax-M3", "low", overrides, true), 0.8);
  assert.ok(resolveTranslateRate("MiniMax-M3", "low", {}, true) > 0);
});

test("estimate: ước tính dịch có tính chế độ ngữ cảnh", () => {
  assert.equal(estimateTranslateSeconds(100, "MiniMax-M3.1-Flash", "low", {}), 44);
  assert.ok(estimateTranslateSeconds(100, "MiniMax-M3.1-Flash", "low", {}, true) > 44);
});

test("estimate: ước tính dịch theo số câu", () => {
  assert.equal(estimateTranslateSeconds(100, "MiniMax-M3.1-Flash", "low", {}), 44);
  assert.equal(estimateTranslateSeconds(0, "x", "auto", {}), 0);
});

test("estimate: ước tính TTS — VieNeu theo RTF, Kokoro theo câu", () => {
  assert.equal(resolveTtsRtf("vieneu", {}), 0.98);
  assert.equal(resolveTtsRtf("zerotts", {}), 0.72);
  assert.equal(estimateTtsSeconds(60, 10, "vieneu", {}), 58.8);
  assert.equal(estimateTtsSeconds(60, 10, "kokoro", {}), 12);
});

test("estimate: buildEstimates trả 3 bước + tổng", () => {
  const { steps, totalSeconds } = buildEstimates({
    mediaDurationSec: 100,
    audioDurationSec: 80,
    segmentCount: 50,
    sttModel: "base",
    sttEngineId: "whisper-base",
    sttRtfNote: "RTF 0,16 (EN) · 0,14 (ZH)",
    sourceLang: "en",
    translateModel: "MiniMax-M3.1-Flash",
    reasoningEffort: "low",
    contextualTranslate: false,
    ttsEngine: "vieneu",
    overrides: {},
  });
  assert.equal(steps.length, 3);
  assert.deepEqual(
    steps.map((s) => s.id),
    ["stt", "translate", "tts"],
  );
  assert.ok(totalSeconds > 0);
  assert.ok(Math.abs(steps[1].seconds - 22) < 0.001);
  // STT dùng RTF đúng engine (0,16 × 100s = 16s)
  assert.ok(Math.abs(steps[0].seconds - 16) < 0.001);
});

test("estimate: tiến độ thật khi đang chạy", () => {
  const p = computeLiveProgress(12, 60, 5, 40);
  assert.equal(p.done, 12);
  assert.equal(p.total, 60);
  assert.ok(Math.abs(p.secPerUnit - 5 / 12) < 0.001);
  assert.ok(Math.abs(p.remainingSec - (5 / 12) * 48) < 0.001);
  assert.ok(Math.abs(p.speedFactor - 8) < 0.001);
  const text = formatLiveProgress(p);
  assert.ok(text.includes("12/60"));
  assert.ok(text.includes("s/câu"));
});

test("estimate: tiến độ khi chưa xong câu nào → không chia 0", () => {
  const p = computeLiveProgress(0, 60, 0, 40);
  assert.equal(p.secPerUnit, 0);
  assert.equal(p.remainingSec, 0);
  assert.ok(formatLiveProgress(p).includes("0/60"));
});
