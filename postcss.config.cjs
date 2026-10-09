// R5-09 giải thích (do Mavis @ 2026-10-09):
//
// File stub rỗng này được Worker L tạo ra để workaround Vite 7 BOM issue
// (CSS @charset không output BOM khi không có postcss config tường minh).
// Hiện tại `plugins: {}` không thực sự load plugin nào — chỉ là khai báo rỗng
// để Vite 7 dừng cảnh báo.
//
// Lý do GIỮ thay vì xoá (theo luật GOVERNANCE: không thêm file lạ không mục đích):
// 1. Nếu xoá → Vite 7 có thể trở lại BOM issue hoặc cảnh báo build.
// 2. File size 33 bytes, không ảnh hưởng bundle.
// 3. Nếu sau này thêm plugin PostCSS thật (autoprefixer, cssnano, ...) →
//    chỉ cần thêm vào object `plugins` mà không phải tạo file mới.
//
// Nếu trong tương lai Vite 7 sửa BOM issue hoàn toàn, có thể xoá file này
// + test `npm run build` xem có warning/lỗi không.
module.exports = { plugins: {} };