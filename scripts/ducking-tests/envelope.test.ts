/**
 * Unit test cho `src/lib/audio/duckingEnvelope.ts` (docs/DUCKING_SPEC.md §3, §5).
 * Chạy chung `vectors.json` với `src-tauri/src/dubbing/ducking_tests.rs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildDuckingEnvelope,
  gainAt,
  duckingParamsFromConfig,
  DEFAULT_DUCKING,
  type DuckingParams,
} from "../../src/lib/audio/duckingEnvelope.ts";

const T_TOL = 0.001;
const G_TOL = 0.001;

interface VecParams {
  duck_level?: number;
  bridge_gap_sec?: number;
  attack_sec?: number;
  release_sec?: number;
  min_voice_sec?: number;
}
interface VecCase {
  name: string;
  duration: number;
  params?: VecParams;
  voice: Array<[number, number]>;
  expected: Array<[number, number]>;
  gain_checks?: Array<[number, number]>;
  max_gain_between?: Array<[number, number, number]>;
}
interface Vectors {
  defaults: Required<VecParams>;
  cases: VecCase[];
}

const vectors: Vectors = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));

function toParams(p: VecParams | undefined): DuckingParams {
  const m = { ...vectors.defaults, ...(p ?? {}) };
  return {
    duckLevel: m.duck_level,
    bridgeGapSec: m.bridge_gap_sec,
    attackSec: m.attack_sec,
    releaseSec: m.release_sec,
    minVoiceSec: m.min_voice_sec,
  };
}

test("DEFAULT_DUCKING khớp bảng §2 trong vectors.json", () => {
  assert.deepEqual(DEFAULT_DUCKING, toParams(undefined));
});

for (const c of vectors.cases) {
  test(`vector ${c.name}`, () => {
    const pts = buildDuckingEnvelope(c.voice, c.duration, toParams(c.params));
    assert.equal(pts.length, c.expected.length, `số điểm gãy: ${JSON.stringify(pts)}`);
    c.expected.forEach(([t, g], i) => {
      assert.ok(Math.abs(pts[i].t - t) <= T_TOL, `điểm ${i}: t=${pts[i].t}, mong ${t}`);
      assert.ok(Math.abs(pts[i].gain - g) <= G_TOL, `điểm ${i}: gain=${pts[i].gain}, mong ${g}`);
    });
    for (const [t, g] of c.gain_checks ?? []) {
      assert.ok(Math.abs(gainAt(pts, t) - g) <= G_TOL, `gainAt(${t}) = ${gainAt(pts, t)}, mong ${g}`);
    }
    for (const [a, b, maxG] of c.max_gain_between ?? []) {
      for (let t = a; t <= b; t += 0.005) assert.ok(gainAt(pts, t) <= maxG + G_TOL, `gainAt(${t}) vượt ${maxG}`);
    }
  });
}

test("gainAt: nội suy trong miền dB, giữ giá trị đầu/cuối ngoài đoạn", () => {
  const pts = [
    { t: 0, gain: 1 },
    { t: 10, gain: 0.1 },
  ];
  assert.equal(gainAt(pts, -5), 1);
  assert.equal(gainAt(pts, 99), 0.1);
  assert.ok(Math.abs(gainAt(pts, 5) - Math.sqrt(0.1)) < 1e-9); // −10 dB giữa đoạn 0→−20 dB
  assert.equal(gainAt([], 3), 1);
});

test("duckingParamsFromConfig: thiếu → mặc định, ngoài miền → mặc định, hợp lệ → giữ", () => {
  assert.deepEqual(duckingParamsFromConfig(undefined), DEFAULT_DUCKING);
  assert.deepEqual(duckingParamsFromConfig({ ducking_level: null }), DEFAULT_DUCKING);
  assert.deepEqual(
    duckingParamsFromConfig({ ducking_level: NaN, ducking_bridge_sec: -1, ducking_attack_sec: 99, ducking_release_sec: Infinity }),
    DEFAULT_DUCKING,
  );
  const p = duckingParamsFromConfig({ ducking_level: 0.1, ducking_bridge_sec: 4, ducking_attack_sec: 0.5, ducking_release_sec: 2 });
  assert.deepEqual(p, { duckLevel: 0.1, bridgeGapSec: 4, attackSec: 0.5, releaseSec: 2, minVoiceSec: 0.15 });
});

test("tham số xấu: NaN/âm/duration 0 không văng lỗi, trả [(0,1)]", () => {
  assert.deepEqual(buildDuckingEnvelope([[1, 2]], 0), [{ t: 0, gain: 1 }]);
  assert.deepEqual(buildDuckingEnvelope([[NaN, 2]], 10), [{ t: 0, gain: 1 }]);
  const pts = buildDuckingEnvelope([[1, 2]], 10, { ...DEFAULT_DUCKING, duckLevel: 0, attackSec: 0, releaseSec: 0 });
  assert.ok(pts.every((p) => p.gain > 0 && Number.isFinite(p.gain)));
});

/** PRNG tất định (mulberry32) cho test thuộc tính. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cài đặt ngây thơ độc lập: gộp khối rồi lấy min dB của từng khối tại từng t. */
function bruteGain(voice: Array<[number, number]>, dur: number, p: DuckingParams, t: number): number {
  const segs = voice
    .map(([s, e]) => [Math.min(Math.max(s, 0), dur), Math.min(Math.max(e, 0), dur)] as [number, number])
    .filter(([s, e]) => e - s >= p.minVoiceSec)
    .sort((a, b) => a[0] - b[0]);
  const blocks: Array<[number, number]> = [];
  for (const sg of segs) {
    const cur = blocks[blocks.length - 1];
    if (cur && sg[0] - cur[1] < p.bridgeGapSec) cur[1] = Math.max(cur[1], sg[1]);
    else blocks.push([sg[0], sg[1]]);
  }
  const L = 20 * Math.log10(p.duckLevel);
  let db = 0;
  for (const [s, e] of blocks) {
    let f = 0;
    if (t < s) f = Math.min(1, Math.max(0, (t - (s - p.attackSec)) / p.attackSec));
    else if (t <= e) f = 1;
    else f = Math.min(1, Math.max(0, 1 - (t - e) / p.releaseSec));
    db = Math.min(db, L * f);
  }
  return 10 ** (db / 20);
}

test("thuộc tính: đường bao khớp cài đặt ngây thơ trên 300 ca ngẫu nhiên (ramp chồng nhau)", () => {
  const rand = rng(20261025);
  for (let iter = 0; iter < 300; iter++) {
    const dur = 20 + rand() * 80;
    const n = Math.floor(rand() * 14);
    const voice: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const s = rand() * dur;
      voice.push([s, s + rand() * 4]);
    }
    const p: DuckingParams = {
      duckLevel: 0.05 + rand() * 0.9,
      bridgeGapSec: rand() * 3,
      attackSec: 0.05 + rand() * 1.5,
      releaseSec: 0.05 + rand() * 2,
      minVoiceSec: 0.15,
    };
    const pts = buildDuckingEnvelope(voice, dur, p);
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i].t > pts[i - 1].t, `t tăng ngặt (iter ${iter})`);
    for (let t = 0; t <= dur; t += 0.037) {
      const got = gainAt(pts, t);
      const want = bruteGain(voice, dur, p, t);
      assert.ok(Math.abs(got - want) <= 1e-6, `iter ${iter} t=${t}: ${got} vs ${want}`);
    }
  }
});
