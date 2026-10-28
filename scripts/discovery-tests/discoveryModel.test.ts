//! TSK-V015-DISC-UI — test logic thuần của tab "Khám phá".
//! Chạy: node --test scripts/discovery-tests/

import test from "node:test";
import assert from "node:assert/strict";
import {
  containsHan,
  formatAgo,
  formatCountVi,
  formatCountdown,
  formatDuration,
  formatViews,
  gridNav,
  isLikelyVietnamese,
  itemVideoId,
  needsTranslation,
  nextRetryDelay,
  platformLabel,
  platformName,
  readStoredFlag,
  readStoredValue,
  viewsTooltip,
  videoIdOf,
  writeStoredFlag,
  writeStoredValue,
  formatAge,
  formatStudioToastText,
  sanitizeLoadedDownloadItems,
  shouldTriggerOpenStudio,
  AUTO_SWITCH_TO_STUDIO_ON_DISCOVERY_COMPLETE,
} from "../../src/views/discovery/discoveryModel.ts";
import {
  dlBadge,
  isDownloaded,
  mapDiscoveryError,
} from "../../src/views/discovery/discoveryErrors.ts";

const NOW = 1_700_000_000_000; // 14/11/2023 22:13:20 UTC
const SEC = 1000;

// ───────────────────────────── Số lượt xem ─────────────────────────────

test("formatCountVi — kiểu Việt thống nhất: 987 · 18,6 nghìn · 1,8 triệu · 1,2 tỷ", () => {
  assert.equal(formatCountVi(987), "987");
  assert.equal(formatCountVi(18_600), "18,6 nghìn");
  assert.equal(formatCountVi(1_800_000), "1,8 triệu");
  assert.equal(formatCountVi(50_000_000), "50 triệu");
  assert.equal(formatCountVi(1_200_000_000), "1,2 tỷ");
});

test("formatCountVi — không vượt đơn vị (999_950 ⇒ 1 triệu)", () => {
  assert.equal(formatCountVi(999_950), "1 triệu");
  assert.equal(formatCountVi(999_999), "1 triệu");
  assert.equal(formatCountVi(999_999_999), "1 tỷ");
});

test("formatCountVi — số lẻ / âm / NaN không vỡ", () => {
  assert.equal(formatCountVi(0), "0");
  assert.equal(formatCountVi(-5), "0");
  assert.equal(formatCountVi(Number.NaN), "0");
});

test("formatViews — cùng kiểu cho CẢ Bilibili lẫn YouTube", () => {
  // TSK-V015-DISC-B1: không còn 万/亿 (Bilibili) vs K/M (YouTube) — 1 kiểu chung.
  assert.equal(formatViews(128_000), "128 nghìn");
  assert.equal(formatViews(12_800), "12,8 nghìn");
  assert.equal(formatViews(12_000), "12 nghìn");
  assert.equal(formatViews(50_000_000), "50 triệu");
  assert.equal(formatViews(null), "");
  assert.equal(formatViews(undefined), "");
});

test("viewsTooltip — số đủ, không còn chú thích 万/亿", () => {
  assert.ok(viewsTooltip(128_000).includes("128.000"));
  assert.ok(!viewsTooltip(128_000).includes("万"));
  assert.ok(!viewsTooltip(128_000).includes("亿"));
  assert.equal(viewsTooltip(null), "");
});

// ───────────────────────────── Thời lượng ─────────────────────────────

test("formatDuration — 1:12:40 / 18:22 / rỗng khi không rõ", () => {
  assert.equal(formatDuration(4360), "1:12:40");
  assert.equal(formatDuration(4560), "1:16:00");
  assert.equal(formatDuration(1102), "18:22");
  assert.equal(formatDuration(59), "0:59");
  assert.equal(formatDuration(0), "");
  assert.equal(formatDuration(null), "");
});

// ───────────────────────────── Thời gian đăng ─────────────────────────────

test("formatAgo — vừa xong / phút / giờ / ngày", () => {
  assert.equal(formatAgo(NOW / SEC - 10, NOW), "vừa xong");
  assert.equal(formatAgo(NOW / SEC - 25 * 60, NOW), "25 phút trước");
  assert.equal(formatAgo(NOW / SEC - 3 * 3600, NOW), "3 giờ trước");
  assert.equal(formatAgo(NOW / SEC - 6 * 86400, NOW), "6 ngày trước");
});

test("formatAgo — từ 30 ngày trở lên ⇒ hiện ngày/tháng/năm", () => {
  const old = NOW / SEC - 40 * 86400;
  const got = formatAgo(old, NOW);
  assert.ok(/^\d{2}\/\d{2}\/\d{4}$/.test(got), `cần dạng DD/MM/YYYY, có: ${got}`);
});

test("formatAgo — không có ngày đăng ⇒ chuỗi rỗng (không ghi '—')", () => {
  assert.equal(formatAgo(null, NOW), "");
  assert.equal(formatAgo(undefined, NOW), "");
});

// ───────────────────────────── Id video ─────────────────────────────

test("videoIdOf — bóc bvid từ link Bilibili", () => {
  assert.equal(
    videoIdOf("https://www.bilibili.com/video/BV1oano6gEMd"),
    "BV1oano6gEMd",
  );
  assert.equal(videoIdOf("https://www.bilibili.com/video/BV14Enb6LEBX?from=x"), "BV14Enb6LEBX");
});

test("videoIdOf — bóc id từ link YouTube (watch + youtu.be)", () => {
  assert.equal(videoIdOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdOf("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("videoIdOf — link lạ ⇒ rỗng", () => {
  assert.equal(videoIdOf("https://example.com/video/abc"), "");
  assert.equal(videoIdOf(""), "");
});

test("itemVideoId — lấy id của thẻ (bvid / yt id)", () => {
  assert.equal(itemVideoId({ id: "BV1xx" } as never), "BV1xx");
  assert.equal(itemVideoId({ id: "  " } as never), "");
});

// ───────────────────────────── Điều hướng lưới ─────────────────────────────

test("gridNav — mũi tên đi đúng bước", () => {
  assert.equal(gridNav(0, "ArrowRight", 4, 20), 1);
  assert.equal(gridNav(5, "ArrowLeft", 4, 20), 4);
  assert.equal(gridNav(0, "ArrowDown", 4, 20), 4);
  assert.equal(gridNav(6, "ArrowUp", 4, 20), 2);
});

test("gridNav — Home/End", () => {
  assert.equal(gridNav(7, "Home", 4, 20), 0);
  assert.equal(gridNav(7, "End", 4, 20), 19);
});

test("gridNav — không vượt biên thì trả null", () => {
  assert.equal(gridNav(0, "ArrowLeft", 4, 20), null);
  assert.equal(gridNav(19, "ArrowRight", 4, 20), null);
  assert.equal(gridNav(0, "ArrowUp", 4, 20), null);
  assert.equal(gridNav(2, "Escape", 4, 20), null);
  assert.equal(gridNav(0, "ArrowRight", 4, 0), null);
});

test("gridNav — cols = 0 ⇒ coi như 1 cột", () => {
  assert.equal(gridNav(0, "ArrowDown", 0, 5), 1);
});

// ───────────────────────────── Lỗi ⇒ thông điệp ─────────────────────────────

test("mapDiscoveryError — blocked ⇒ gợi ý từ khoá tiếng Trung + đếm ngược", () => {
  const info = mapDiscoveryError("x", "blocked", "bilibili");
  assert.equal(info.code, "blocked");
  assert.ok(info.title.includes("Bilibili"));
  assert.ok(info.detail.includes("tiếng Trung"));
  assert.equal(info.canRetry, true);
  assert.equal(info.countdown, true);
});

test("mapDiscoveryError — network ⇒ nút Thử lại, không đếm ngược", () => {
  const info = mapDiscoveryError("x", "network", "youtube");
  assert.ok(info.title.includes("YouTube"));
  assert.equal(info.canRetry, true);
  assert.equal(info.countdown, false);
});

test("mapDiscoveryError — ytdlp_missing ⇒ hướng dẫn cài, KHÔNG có nút Thử lại", () => {
  const info = mapDiscoveryError("x", "ytdlp_missing", "youtube");
  assert.ok(info.detail.includes("yt-dlp"));
  assert.equal(info.canRetry, false);
});

test("mapDiscoveryError — parse ⇒ báo lỗi chung", () => {
  const info = mapDiscoveryError("x", "parse", "bilibili");
  assert.equal(info.code, "parse");
  assert.ok(info.title.includes("Bilibili"));
});

test("mapDiscoveryError — unknown ⇒ dùng thông điệp gốc", () => {
  const info = mapDiscoveryError(new Error("hỏng rồi"), "unknown", "bilibili");
  assert.equal(info.code, "unknown");
  assert.ok(info.detail.includes("hỏng rồi"));
});

// ───────────────────────────── Tự dịch từ khoá ─────────────────────────────

test("containsHan — nhận chữ Hán", () => {
  assert.equal(containsHan("原神"), true);
  assert.equal(containsHan("艾尔登法环 剧情"), true);
  assert.equal(containsHan("原神 genshin"), true);
  assert.equal(containsHan("elden ring"), false);
  assert.equal(containsHan(""), false);
});

test("needsTranslation — Latin thì dịch, đã có Hán thì không", () => {
  assert.equal(needsTranslation("elden ring"), true);
  assert.equal(needsTranslation("đấu trường"), true);
  assert.equal(needsTranslation("原神"), false);
  assert.equal(needsTranslation("原神 genshin"), false);
  assert.equal(needsTranslation("2024"), false);
  assert.equal(needsTranslation(""), false);
});

test("readStoredFlag / writeStoredFlag — localStorage lỗi ⇒ trả mặc định", () => {
  // Node không có `window.localStorage` ⇒ try/catch phải trả mặc định, không ném.
  assert.equal(readStoredFlag("sublix.test.khongTonTai", true), true);
  assert.equal(readStoredFlag("sublix.test.khongTonTai", false), false);
  assert.doesNotThrow(() => writeStoredFlag("sublix.test.khongTonTai", true));
});

// ───────────────────────────── Lưu/đọc tuỳ chọn ─────────────────────────────

test("readStoredValue — không có window ⇒ trả fallback", () => {
  assert.equal(readStoredValue("sublix.test.khongTonTai", "gia"), "gia");
  assert.doesNotThrow(() => writeStoredValue("sublix.test.khongTonTai", "x"));
});


test("isLikelyVietnamese — nhận dấu tiếng Việt", () => {
  assert.equal(isLikelyVietnamese("đấu trường"), true);
  assert.equal(isLikelyVietnamese("thép"), true);
  assert.equal(isLikelyVietnamese("原神"), false);
  assert.equal(isLikelyVietnamese("elden ring"), false);
  assert.equal(isLikelyVietnamese(""), false);
});

// ───────────────────────────── Nhãn nguồn ─────────────────────────────

test("platformLabel / platformName", () => {
  assert.equal(platformLabel("bilibili"), "B");
  assert.equal(platformLabel("youtube"), "▶");
  assert.equal(platformName("bilibili"), "Bilibili");
  assert.equal(platformName("youtube"), "YouTube");
});

// ───────────────────────────── Trạng thái tải ─────────────────────────────

test("dlBadge — nhãn theo trạng thái hàng đợi", () => {
  assert.equal(dlBadge("", 0).text, "");
  assert.equal(dlBadge("queued", 0).text, "⏳ Đang đợi");
  assert.equal(dlBadge("downloading", 46).text, "⬇ 46%");
  assert.equal(dlBadge("done", 100).text, "✓ Đã tải");
  assert.equal(dlBadge("error", 0).text, "! Lỗi tải");
});

test("dlBadge — phần trăm làm tròn", () => {
  assert.equal(dlBadge("downloading", 45.6).text, "⬇ 46%");
});

test("isDownloaded — chỉ 'done' mới tính là đã tải", () => {
  assert.equal(isDownloaded("done"), true);
  assert.equal(isDownloaded("downloading"), false);
  assert.equal(isDownloaded(undefined), false);
});

// ───────────────────────────── Đếm ngược ─────────────────────────────

test("formatCountdown — 2:00 / 0:09", () => {
  assert.equal(formatCountdown(120), "2:00");
  assert.equal(formatCountdown(9), "0:09");
  assert.equal(formatCountdown(-3), "0:00");
});

test("nextRetryDelay — nhân đôi mỗi lần bị chặn, tối đa 5 phút", () => {
  assert.equal(nextRetryDelay(0), 30);
  assert.equal(nextRetryDelay(30), 60);
  assert.equal(nextRetryDelay(60), 120);
  assert.equal(nextRetryDelay(240), 300);
  assert.equal(nextRetryDelay(300), 300);
});

test("formatAge — dưới 1 phút là vừa xong, từ 1 phút trở lên là N phút trước (P3-1)", () => {
  assert.equal(formatAge(null), "");
  assert.equal(formatAge(undefined), "");
  assert.equal(formatAge(-5), "");
  assert.equal(formatAge(0), "vừa xong");
  assert.equal(formatAge(0.8), "vừa xong");
  assert.equal(formatAge(1), "1 phút trước");
  assert.equal(formatAge(15.4), "15 phút trước");
});

test("shouldTriggerOpenStudio — chỉ kích hoạt khi đủ 4 điều kiện (P1-1)", () => {
  // Đạt: completed + openInStudio + chưa mở + có path
  assert.equal(
    shouldTriggerOpenStudio({
      status: "completed",
      filePath: "C:\\video.mp4",
      openInStudio: true,
      studioOpened: false,
    }),
    true
  );

  // Đã từng mở rồi (studioOpened = true) ⇒ KHÔNG mở lại
  assert.equal(
    shouldTriggerOpenStudio({
      status: "completed",
      filePath: "C:\\video.mp4",
      openInStudio: true,
      studioOpened: true,
    }),
    false
  );

  // Chưa tải xong (downloading / queued) ⇒ KHÔNG mở
  assert.equal(
    shouldTriggerOpenStudio({
      status: "downloading",
      filePath: null,
      openInStudio: true,
      studioOpened: false,
    }),
    false
  );

  // Không có cờ openInStudio ⇒ KHÔNG mở
  assert.equal(
    shouldTriggerOpenStudio({
      status: "completed",
      filePath: "C:\\video.mp4",
      openInStudio: false,
      studioOpened: false,
    }),
    false
  );

  // Thiếu filePath ⇒ KHÔNG mở
  assert.equal(
    shouldTriggerOpenStudio({
      status: "completed",
      filePath: "",
      openInStudio: true,
      studioOpened: false,
    }),
    false
  );
});

test("sanitizeLoadedDownloadItems — khử trùng mục completed từ phiên trước (P1-1)", () => {
  const loadedFromStorage = [
    { id: "1", status: "completed", openInStudio: true, title: "Old video 1" },
    { id: "2", status: "completed", openInStudio: false, title: "Old video 2" },
    { id: "3", status: "downloading", openInStudio: true, title: "Interrupted" },
  ];

  const sanitized = sanitizeLoadedDownloadItems(loadedFromStorage);
  // Mục 1 phải được đánh dấu studioOpened: true
  assert.equal(sanitized[0].studioOpened, true);
  // Mục 2 giữ nguyên
  assert.equal(sanitized[1].studioOpened, undefined);
  // Mục 3 chưa xong giữ nguyên
  assert.equal(sanitized[2].studioOpened, undefined);

  // Đảm bảo không mục nào sau khi nạp bị kích hoạt mở Studio
  assert.equal(shouldTriggerOpenStudio(sanitized[0]), false);
});

test("formatStudioToastText — 1 mục ghi rõ tên, nhiều mục gộp số lượng (§1)", () => {
  assert.equal(formatStudioToastText([]), "");
  assert.equal(
    formatStudioToastText(["Elden Ring Boss Fight"]),
    '✓ Đã tải xong "Elden Ring Boss Fight" — đã mở tab trong Studio'
  );
  assert.equal(
    formatStudioToastText(["Video A", "Video B"]),
    "2 video đã mở tab trong Studio"
  );
  assert.equal(
    formatStudioToastText(["Video A", "Video B", "Video C"]),
    "3 video đã mở tab trong Studio"
  );
});

test("AUTO_SWITCH_TO_STUDIO_ON_DISCOVERY_COMPLETE mặc định là false (§1)", () => {
  assert.equal(AUTO_SWITCH_TO_STUDIO_ON_DISCOVERY_COMPLETE, false);
});
