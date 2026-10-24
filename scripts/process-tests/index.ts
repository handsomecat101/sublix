/**
 * Điểm vào của bộ test tab Tiến trình.
 *
 * Node 24 không quét thư mục với `node --test <dir>` (tham số bị hiểu là entry
 * point) → `package.json` cùng thư mục (`"main": "./index.ts"`) + file này giúp
 * `node --test scripts/process-tests/` chạy được (cùng cách với
 * `live-history-tests` / `settings-tests` / `timeline-tests`).
 */
import "./processLogic.test.ts";
