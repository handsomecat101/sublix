/**
 * Điểm vào của bộ test Live + Lịch sử.
 *
 * Node 24 không quét thư mục với `node --test <dir>` (tham số bị hiểu là entry
 * point) → `package.json` cùng thư mục (`"main": "./index.ts"`) + file này giúp
 * `node --test scripts/live-history-tests/` chạy được (cùng cách với
 * `settings-tests` / `timeline-tests`).
 */
import "./liveLogic.test.ts";
import "./historyLogic.test.ts";
