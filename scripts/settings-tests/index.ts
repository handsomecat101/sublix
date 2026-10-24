/**
 * Điểm vào của bộ test Cài đặt.
 *
 * Node 24 không quét thư mục với `node --test <dir>` (tham số bị hiểu là entry
 * point) → `package.json` cùng thư mục (`"main": "./index.ts"`) + file này giúp
 * `node --test scripts/settings-tests/` chạy được (cùng cách với timeline-tests).
 *
 * Cả hai cách đều cho cùng kết quả:
 *   node --test scripts/settings-tests/
 *   node --test "scripts/settings-tests/*.test.ts"
 */
import "./configMerge.test.ts";
import "./modelUtils.test.ts";
