/**
 * Điểm vào của bộ test phụ đề nhảy chữ (v0.14).
 *
 * Node 24 **không** quét thư mục khi chạy `node --test <thư mục>` — tham số thư mục
 * bị hiểu là entry point của module. File `package.json` cùng thư mục
 * (`"main": "./index.ts"`) cho phép Node phân giải thư mục thành file này.
 *
 * Cách chạy:
 *   node --test scripts/kinetic-tests/
 */
import "./kineticTiming.test.ts";
