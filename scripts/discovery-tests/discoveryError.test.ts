//! TSK-V015-DISC-CMD — test `discoveryErrorCode` (tách tiền tố lỗi của lệnh Khám phá).
//! Chạy: node --test scripts/discovery-tests/

import test from "node:test";
import assert from "node:assert/strict";
import { discoveryErrorCode } from "../../src/lib/tauri.ts";

test("bị chặn — nguồn trả mã -412 (tiền tố [blocked])", () => {
  const err =
    "[blocked] Bilibili tạm chặn tìm kiếm (mã -412). Thử từ khoá tiếng Trung hoặc thử lại sau ít phút.";
  assert.equal(discoveryErrorCode(err), "blocked");
});

test("mất mạng / quá thời gian (tiền tố [network])", () => {
  assert.equal(
    discoveryErrorCode("[network] Nguồn dữ liệu quá thời gian (12s)."),
    "network",
  );
  assert.equal(
    discoveryErrorCode("[network] Không kết nối được nguồn dữ liệu: error sending request"),
    "network",
  );
});

test("thiếu yt-dlp (tiền tố [ytdlp_missing])", () => {
  assert.equal(
    discoveryErrorCode("[ytdlp_missing] Không tìm thấy yt-dlp trên máy này."),
    "ytdlp_missing",
  );
});

test("dữ liệu không đọc được (tiền tố [parse])", () => {
  assert.equal(
    discoveryErrorCode("[parse] Không đọc được dữ liệu Bilibili đang hot: lỗi JSON"),
    "parse",
  );
});

test("không có tiền tố ⇒ unknown", () => {
  assert.equal(discoveryErrorCode("Hàm bị lỗi chung chung"), "unknown");
  assert.equal(discoveryErrorCode(new Error("lỗi JS thuần")), "unknown");
  assert.equal(discoveryErrorCode(undefined), "unknown");
  assert.equal(discoveryErrorCode(null), "unknown");
  assert.equal(discoveryErrorCode(""), "unknown");
});

test("tiền tố chỉ nhận ở ĐẦU chuỗi, không nhận giữa chuỗi", () => {
  // "xem [blocked] ở đây" không phải lỗi Khám phá ⇒ phải là unknown.
  assert.equal(discoveryErrorCode("xem [blocked] ở đây"), "unknown");
});

test("tiền tố khác (ví dụ HARDSUB_*) không phải mã Khám phá", () => {
  assert.equal(discoveryErrorCode("HARDSUB_MODEL_MISSING: thiếu model"), "unknown");
});

test("lấy đúng mã, không lấy nhầm mã khác", () => {
  // "blocked" chứa chuỗi "network"? Không — nhưng kiểm tra chắc chắn regex chỉ
  // khớp tiền tố hợp lệ, không khớp tiền tố bịa.
  assert.equal(discoveryErrorCode("[blocked_xyz] lỗi"), "unknown");
  assert.equal(discoveryErrorCode("[NETWORK] lỗi"), "unknown");
});
