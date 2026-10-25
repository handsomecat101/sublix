/**
 * Điểm vào của bộ test tab Studio.
 *
 * Node 24 **không** quét thư mục khi chạy `node --test <thư mục>` — tham số thư mục
 * bị hiểu là entry point của module. File `package.json` cùng thư mục
 * (`"main": "./index.ts"`) cho phép Node phân giải thư mục thành file này.
 *
 * Cách chạy:
 *   node --test scripts/studio-tabs-tests/
 */
import "./tabsModel.test.ts";
import "./jobQueue.test.ts";
import "./sessionStore.test.ts";
import "./tabShortcuts.test.ts";
import "./runRouting.test.ts";
import "./sessionRestore.test.ts";
