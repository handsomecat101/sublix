//! TSK-V015-DISC-UI — test logic thuần của tab "Khám phá".
//! Chạy: node --test scripts/discovery-tests/

import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAgo,
  formatCountBili,
  formatCountShort,
  formatCountdown,
  formatDuration,
  formatViews,
  gridNav,
  isLikelyVietnamese,
  itemVideoId,
  nextRetryDelay,
  platformLabel,
  platformName,
  viewsTooltip,
  videoIdOf,
} from "../../src/views/discovery/discoveryModel.ts";
import {
  dlBadge,
  isDownloaded,
  mapDiscoveryError,
} from "../../src/views/discovery/discoveryErrors.ts";

const NOW = 1_700_000_000_000; // 14/11/2023 22:13:20 UTC
const SEC = 1000;

// ───────────────────────────── Số lượt xem ─────────────────────────────

test("formatCountShort — YouTube: 987 · 12K · 3,4M", () => {
  assert.equal(formatCountShort(987), "987");
  assert.equal(formatCountShort(12_000), "12K");
  assert.equal(formatCountShort(3_400_000), "3,4M");
  assert.equal(formatCountShort(1_200), "1,2K");
});

test("formatCountShort — không vượt đơn vị (999_950 ⇒ 1M)", () => {
  assert.equal(formatCountShort(999_950), "1M");
});

test("formatCountShort — số lẻ / âm / NaN không vỡ", () => {
  assert.equal(formatCountShort(0), "0");
  assert.equal(formatCountShort(-5), "0");
  assert.equal(formatCountShort(Number.NaN), "0");
});

test("formatCountBili — Bilibili: 9.876 · 12,8万 · 1,2亿", () => {
  assert.equal(formatCountBili(9_876), "9.876");
  assert.equal(formatCountBili(128_000), "12,8万");
  assert.equal(formatCountBili(120_000_000), "1,2亿");
  assert.equal(formatCountBili(999), "999");
});

test("formatViews — chọn kiểu theo nền tảng", () => {
  assert.equal(formatViews(128_000, "bilibili"), "12,8万");
  assert.equal(formatViews(12_800, "bilibili"), "1,3万");
  assert.equal(formatViews(12_000, "youtube"), "12K");
  assert.equal(formatViews(null, "youtube"), "");
  assert.equal(formatViews(undefined, "bilibili"), "");
});

test("viewsTooltip — Bilibili có chú thích đơn vị 万/亿", () => {
  assert.ok(viewsTooltip(128_000, "bilibili").includes("万 = 10.000"));
  assert.ok(viewsTooltip(128_000, "bilibili").includes("128.000"));
  assert.ok(!viewsTooltip(12_000, "youtube").includes("万"));
  assert.equal(viewsTooltip(null, "youtube"), "");
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

// ───────────────────────────── Gợi ý từ khoá ─────────────────────────────

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
