// TSK-FEAT-VOICE-PICKER — test logic thuần của ô chọn giọng.
// Chạy: node --test scripts/voice-picker-tests/voicePickerModel.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGroups,
  clearFilterHint,
  computeWindow,
  flattenEntries,
  genderLabel,
  highlightParts,
  matchesQuery,
  normalizeText,
  parseVoiceLabel,
  rowItems,
  shortEngineLabel,
  voiceItemFromOption,
  type VoicePickerItem,
} from "../../src/components/voice/voicePickerModel.ts";

function v(
  id: string,
  name: string,
  extra: Partial<VoicePickerItem> = {},
): VoicePickerItem {
  const engineId = id.includes(":") ? id.slice(0, id.indexOf(":")) : "vietneu";
  return {
    id,
    name,
    gender: "male",
    engineId,
    engineLabel: "VieNeu v3",
    kind: "offline",
    ...extra,
  };
}

test("normalizeText bỏ dấu và hạ chữ thường", () => {
  assert.equal(normalizeText("Adam bựa"), "adam bua");
  assert.equal(normalizeText("Ngọc Huyền"), "ngoc huyen");
  assert.equal(normalizeText("Đỗ Mạnh"), "do manh");
  assert.equal(normalizeText("  Việt  "), "viet");
});

test("parseVoiceLabel tách ngôn ngữ + tên + engine", () => {
  const p = parseVoiceLabel("VN • Adam bựa (VieNeu v3 — offline)");
  assert.equal(p.lang, "vi");
  assert.equal(p.name, "Adam bựa");
  assert.equal(p.engine, "VieNeu v3");
  assert.equal(p.engineKind, "offline");
});

test("parseVoiceLabel nhận nhãn không có engine", () => {
  const p = parseVoiceLabel("VN • Trúc Ly");
  assert.equal(p.name, "Trúc Ly");
  assert.equal(p.engine, undefined);
  assert.equal(p.lang, "vi");
});

test("parseVoiceLabel nhận engine cloud", () => {
  const p = parseVoiceLabel("EN • Chirp 3 (Google — cloud)");
  assert.equal(p.engine, "Google");
  assert.equal(p.engineKind, "cloud");
});

test("voiceItemFromOption dựng item từ option backend", () => {
  const item = voiceItemFromOption("vietneu:adam", "VN • Adam bựa (VieNeu v3 — offline)", "male");
  assert.equal(item.id, "vietneu:adam");
  assert.equal(item.name, "Adam bựa");
  assert.equal(item.engineId, "vietneu");
  assert.equal(item.engineLabel, "VieNeu v3");
  assert.equal(item.lang, "vi");
  assert.equal(item.kind, "offline");
});

test("voiceItemFromOption nhan giong Edge (id khong co tien to)", () => {
  const item = voiceItemFromOption("vi-VN-NamMinhNeural", "Nam Minh (Nam Điện Ảnh - Trầm Ấm)", "male");
  assert.equal(item.name, "Nam Minh");
  assert.equal(item.engineId, "edge");
  assert.equal(item.engineLabel, "Edge");
  assert.equal(item.kind, "cloud");
});

test("shortEngineLabel rút gọn badge", () => {
  assert.equal(shortEngineLabel("VieNeu v3 — offline"), "VieNeu v3");
  assert.equal(shortEngineLabel("Kokoro"), "Kokoro");
});

test("matchesQuery khớp cả khi không có dấu", () => {
  const item = v("vietneu:adam", "Adam bựa");
  assert.equal(matchesQuery(item, "adam"), true);
  assert.equal(matchesQuery(item, "bua"), true);
  assert.equal(matchesQuery(item, "vieneu"), true);
  assert.equal(matchesQuery(item, "zzz"), false);
});

test("buildGroups: ★ luôn đầu và không lặp lại ở nhóm engine", () => {
  const voices = [
    v("vietneu:adam", "Adam bựa"),
    v("vietneu:trucly", "Trúc Ly", { gender: "female" }),
    v("kokoro:minh", "Thiện Minh"),
  ];
  const favs = new Set(["vietneu:adam", "kokoro:minh"]);
  const groups = buildGroups(voices, favs, "", "all");
  assert.equal(groups[0].kind, "favorite");
  assert.equal(groups[0].items.length, 2);
  const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
  assert.equal(allIds.filter((id) => id === "vietneu:adam").length, 1, "★ chỉ hiện 1 lần");
});

test("buildGroups: giữ thứ tự backend, tách nhóm ngôn ngữ khi > 1 ngôn ngữ", () => {
  const voices = [
    v("vietneu:a", "A", { lang: "vi" }),
    v("vietneu:b", "B", { lang: "en" }),
    v("vietneu:c", "C", { lang: "vi" }),
  ];
  const groups = buildGroups(voices, new Set(), "", "all");
  const engine = groups[0];
  assert.equal(engine.kind, "engine");
  assert.equal(engine.langs?.length, 2, "2 ngôn ngữ -> tách nhóm con");
  assert.equal(engine.items.length, 0);
  assert.deepEqual(
    engine.langs?.map((l) => l.title),
    ["VI", "EN"],
  );
  assert.equal(engine.langs?.[0].items[0].id, "vietneu:a", "giữ thứ tự backend");
});

test("buildGroups: 1 ngôn ngữ -> không tách nhóm con", () => {
  const voices = [v("vietneu:a", "A", { lang: "vi" })];
  const groups = buildGroups(voices, new Set(), "", "all");
  assert.equal(groups[0].langs, undefined);
  assert.equal(groups[0].items.length, 1);
});

test("buildGroups: chỉ hiện engine được chọn (Studio)", () => {
  const voices = [v("vietneu:a", "A"), v("kokoro:b", "B")];
  const groups = buildGroups(voices, new Set(), "", "all", { engineIds: ["kokoro"] });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "engine:kokoro");
});

test("buildGroups: lọc giới tính mặc định là Tất cả", () => {
  const voices = [
    v("vietneu:a", "A", { gender: "male" }),
    v("vietneu:b", "B", { gender: "female" }),
  ];
  assert.equal(buildGroups(voices, new Set(), "", "all")[0].items.length, 2);
  assert.equal(buildGroups(voices, new Set(), "", "male")[0].items.length, 1);
  assert.equal(buildGroups(voices, new Set(), "", "female")[0].items.length, 1);
});

test("flattenEntries + rowItems bỏ qua tiêu đề nhóm", () => {
  const voices = [v("vietneu:a", "A"), v("vietneu:b", "B")];
  const groups = buildGroups(voices, new Set(), "", "all");
  const entries = flattenEntries(groups);
  assert.equal(entries[0].kind, "header");
  assert.equal(entries.filter((e) => e.kind === "row").length, 2);
  assert.deepEqual(rowItems(entries).map((i) => i.id), ["vietneu:a", "vietneu:b"]);
});

test("computeWindow tính cửa sổ hoá theo chiều cao thật", () => {
  const voices = Array.from({ length: 200 }, (_, i) => v(`vietneu:v${i}`, `V${i}`));
  const entries = flattenEntries(buildGroups(voices, new Set(), "", "all"));
  const w = computeWindow(entries, 320, 320);
  assert.ok(w.end > w.start, "phai co dong duoc render");
  assert.ok(w.end < entries.length, "khong render het danh sach");
  assert.ok(w.offsetTop > 0, "offset phai > 0");
  assert.equal(w.totalHeight, 200 * 32 + 22, "1 tieu de (22) + 200 dong (32)");
});

test("clearFilterHint chi khi dang loc MA khong con ket qua", () => {
  const voices = [
    v("vietneu:a", "An", { gender: "male" }),
    v("vietneu:b", "Bảo", { gender: "female" }),
  ];
  assert.equal(clearFilterHint(voices, "", "all"), null, "không lọc -> không cần gợi ý");
  assert.equal(clearFilterHint(voices, "", "female"), null, "lọc Nữ vẫn còn kết quả -> không gợi ý");
  assert.equal(clearFilterHint(voices, "", "male"), null, "lọc Nam còn kết quả -> không gợi ý");
  // đang lọc Nam nhưng từ khoá chỉ khớp giọng Nữ -> bỏ lọc giới tính thì có kết quả
  assert.equal(
    clearFilterHint(voices, "bao", "male"),
    "Bỏ lọc ♂ Nam (1 kết quả)",
  );
  // không tìm được gì thì bỏ lọc cũng không có -> chỉ còn "Xoá tìm"
  assert.equal(clearFilterHint(voices, "zzz", "male"), null);
});

test("genderLabel tieng Viet co dau", () => {
  assert.equal(genderLabel("all"), "Tất cả");
  assert.equal(genderLabel("male"), "♂ Nam");
  assert.equal(genderLabel("female"), "♀ Nữ");
});

test("highlightParts tach phan khop tu khoa", () => {
  const parts = highlightParts("Adam bựa", "bua");
  assert.equal(parts.filter((p) => p.hit).length, 1);
  assert.equal(parts.map((p) => p.text).join(""), "Adam bựa");
  assert.deepEqual(highlightParts("Adam", ""), [{ text: "Adam", hit: false }]);
});
