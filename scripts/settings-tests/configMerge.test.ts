//! TSK-UI-REDESIGN-R2-5 — test logic gộp cấu hình (không React/Tauri).
//! Chạy: node --test scripts/settings-tests/configMerge.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeConfig,
  isCloudProvider,
  supportsReasoning,
  REASONING_EFFORTS,
} from "../../src/views/settings/configMerge.ts";

const BASE = () => ({
  stt_model: "base",
  translation_provider: "minimax",
  minimax_model: "MiniMax-M3",
  minimax_api_key: "MINIMAX-SECRET-1234",
  openrouter_api_key: "OPENROUTER-SECRET-5678",
  deepseek_api_key: "DEEPSEEK-SECRET-9012",
  gcloud_api_key: "GCLOUD-SECRET-AAAA",
  fptai_api_key: "FPT-SECRET-BBBB",
  llm_reasoning_effort: "auto",
});

test("form key rỗng KHÔNG xoá key minimax đã lưu", () => {
  const out = mergeConfig({ latest: BASE(), keyForm: { minimax: "" } });
  assert.equal(out.minimax_api_key, "MINIMAX-SECRET-1234");
});

test("form key rỗng KHÔNG xoá key openrouter/deepseek đã lưu", () => {
  const out = mergeConfig({ latest: BASE(), keyForm: { openrouter: "  ", deepseek: "" } });
  assert.equal(out.openrouter_api_key, "OPENROUTER-SECRET-5678");
  assert.equal(out.deepseek_api_key, "DEEPSEEK-SECRET-9012");
});

test("key cloud Google/FPT (field ngoài danh sách) cũng được giữ khi form rỗng", () => {
  const out = mergeConfig({ latest: BASE(), keyForm: { minimax: "" }, patch: { theme: "studio" } });
  assert.equal(out.gcloud_api_key, "GCLOUD-SECRET-AAAA");
  assert.equal(out.fptai_api_key, "FPT-SECRET-BBBB");
});

test("người dùng CHỦ ĐỘNG xoá key -> ghi chuỗi rỗng", () => {
  const out = mergeConfig({ latest: BASE(), clearKeys: ["minimax"] });
  assert.equal(out.minimax_api_key, "");
  assert.equal(out.openrouter_api_key, "OPENROUTER-SECRET-5678", "các key khác còn nguyên");
});

test("gõ key mới -> ghi đè đúng key đó, trim khoảng trắng", () => {
  const out = mergeConfig({ latest: BASE(), keyForm: { deepseek: "  NEW-DEEPSEEK-KEY  " } });
  assert.equal(out.deepseek_api_key, "NEW-DEEPSEEK-KEY");
  assert.equal(out.minimax_api_key, "MINIMAX-SECRET-1234");
});

test("đổi provider chỉ đổi field provider", () => {
  const latest = BASE();
  const out = mergeConfig({ latest, patch: { translation_provider: "ollama" } });
  assert.equal(out.translation_provider, "ollama");
  assert.equal(out.minimax_model, latest.minimax_model);
  assert.equal(out.minimax_api_key, latest.minimax_api_key);
  assert.equal(out.theme, latest.theme);
});

test("đổi model chỉ đổi field model", () => {
  const latest = BASE();
  const out = mergeConfig({ latest, patch: { openrouter_model: "deepseek/deepseek-v4.1-flash" } });
  assert.equal(out.openrouter_model, "deepseek/deepseek-v4.1-flash");
  assert.equal(out.translation_provider, latest.translation_provider);
  assert.equal(out.openrouter_api_key, latest.openrouter_api_key);
});

test("đổi reasoning_effort chỉ đổi field đó", () => {
  const latest = BASE();
  const out = mergeConfig({ latest, patch: { llm_reasoning_effort: "high" } });
  assert.equal(out.llm_reasoning_effort, "high");
  assert.equal(out.minimax_api_key, latest.minimax_api_key);
});

test("field backend mới thêm (không biết trước) KHÔNG bị mất", () => {
  const latest = { ...BASE(), backend_new_field: { nested: [1, 2, 3] }, other_flag: true };
  const out = mergeConfig({ latest, patch: { theme: "light" }, keyForm: { minimax: "" } });
  assert.deepEqual(out.backend_new_field, { nested: [1, 2, 3] });
  assert.equal(out.other_flag, true);
  assert.equal(out.llm_reasoning_effort, "auto");
});

test("không mutate object đầu vào", () => {
  const latest = BASE();
  const patch = { theme: "vibrant" };
  const keyForm = { minimax: "X" };
  const snapshot = JSON.stringify({ latest, patch, keyForm });
  mergeConfig({ latest, patch, keyForm, clearKeys: ["openrouter"] });
  assert.equal(JSON.stringify({ latest, patch, keyForm }), snapshot);
});

test("patch chứa giá trị undefined thì bỏ qua (không ghi đè bằng undefined)", () => {
  const out = mergeConfig({ latest: BASE(), patch: { theme: undefined, stt_model: "tiny" } });
  assert.equal(out.theme, undefined);
  assert.equal(out.stt_model, "tiny");
  assert.equal(out.minimax_api_key, "MINIMAX-SECRET-1234");
});

test("5 mức suy luận + chỉ bật cho provider cloud hỗ trợ", () => {
  assert.deepEqual([...REASONING_EFFORTS], ["auto", "low", "medium", "high", "max"]);
  assert.equal(isCloudProvider("minimax"), true);
  assert.equal(isCloudProvider("ollama"), false);
  assert.equal(supportsReasoning("minimax", "MiniMax-M3.1-Flash"), true);
  assert.equal(supportsReasoning("minimax", "MiniMax-M3"), false);
  assert.equal(supportsReasoning("deepseek", "deepseek-reasoner"), true);
  assert.equal(supportsReasoning("deepseek", "deepseek-chat"), false);
  assert.equal(supportsReasoning("openrouter", "deepseek/deepseek-v4.1-flash"), true);
  assert.equal(supportsReasoning("ollama", "qwen2.5:3b"), false);
  // API trả giá trị thì ưu tiên API
  assert.equal(supportsReasoning("ollama", "x", true), true);
  assert.equal(supportsReasoning("minimax", "MiniMax-M3.1-Flash", false), false);
});
