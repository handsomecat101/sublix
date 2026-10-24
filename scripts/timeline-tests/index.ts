/**
 * Điểm vào của bộ test timeline.
 *
 * VÌ SAO CẦN FILE NÀY:
 * Node 24 **không** quét thư mục khi chạy `node --test <thư mục>` — tham số
 * thư mục bị hiểu là entry point của module nên báo
 * "Cannot find module '.../timeline-tests'". File `package.json` cùng thư mục
 * (`"main": "./index.ts"`) cho phép Node phân giải thư mục thành file này,
 * nhờ đó lệnh `node --test scripts/timeline-tests/` chạy được đúng như mong đợi.
 *
 * Cách chạy (cả hai đều cho kết quả giống nhau):
 *   node --test scripts/timeline-tests/
 *   node --test "scripts/timeline-tests/*.test.ts"
 *
 * File này KHÔNG chứa test nào — chỉ import để kích hoạt các `test()` trong
 * 6 file test của từng module timeline.
 */
import "./timecode.test.ts";
import "./shuttle.test.ts";
import "./markers.test.ts";
import "./trackLock.test.ts";
import "./clipboard.test.ts";
import "./autoFollow.test.ts";
