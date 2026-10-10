# FIX ROUND 1 — SUBLIX STUDIO UI (kiểm tra bởi CommandCode, 2026-10-08)
**Kết luận chung:** Gemini LÀM THẬT khối lượng lớn (layout Studio đúng bản vẽ, pipeline nối thật, asset protocol đúng cách, build xanh — CommandCode tự chạy lại). NHƯNG có **"mỹ phẩm che hàng hỏng"** — phải sửa hết các mục dưới. Không được đóng "đã xong" khi còn mục CRITICAL.

## 🔴 CRITICAL (sửa trước, không bàn)
| # | Lỗi | Vị trí | Cách sửa |
|---|---|---|---|
| C1 | Hardcode path máy dev `H:\AI Project\sublix\test_dubbing_input\multi_speaker_scene.mp4` làm video mặc định (vi phạm BUG-001/017) | `SublixStudioView.tsx:80` | Bỏ mặc định; chưa có video → hiện ô thả file (đúng "empty state" bản vẽ §1) |
| C2 | Hardcode path dev trong code production: fallback `...\src-tauri\models\voice\sherpa-diarization` | `dubbing/mod.rs:320` | Resolve theo app data dir / cạnh app (giống fix BUG-017) |
| C3 | **Nút "Đưa vào Studio" chết hoàn toàn**: `initialFilePath` chỉ đọc lúc init, không sync khi prop đổi (component mount ẩn thường xuyên) | `SublixStudioView.tsx:167` | Thêm `useEffect` sync prop → state (tham khảo `DubbingStudioView.tsx:174-177`) |
| C4 | Phím tắt nuốt sự kiện TOÀN APP: keydown trên `window` preventDefault Space/←/→ kể cả khi đang gõ/nhấn nút ở tab khác; listener re-register mỗi frame khi phát (deps `currentTime`) | `SublixStudioView.tsx:426-460` | Chỉ bắt khi tab Studio đang mở + focus không nằm trong input/button; deps ổn định |

## 🟠 HIGH — gỡ "nói môm", nói sự thật với người dùng
| # | Lỗi | Vị trí | Cách sửa |
|---|---|---|---|
| H1 | Phân tích lỗi → lặng lẽ đổ dữ liệu DEMO mà vẫn báo "Phân tích hoàn tất! 100%" | `:591-599` | Báo LỖI thật (toast đỏ + lý do), KHÔNG đổ demo vào dự án thật. Xóa `DEMO_SPEAKERS/DEMO_SEGMENTS` khỏi luồng chính |
| H2 | Khi video không phát được: đồng hồ tự đếm `prev+dt` + chữ "Đang chạy video & phụ đề khớp timeline..." (DỐI) | `:394-400`, `:1742` | Sửa gốc: nạp video qua `convertFileSrc` đã đúng — kiểm tra `video.onerror` → báo "Không phát được video này" rõ ràng. Không có đồng hồ giả mạo |
| H3 | "Cinema Stage Visualizer" = sóng `Math.sin()` giả mạo audio; waveform "TIẾNG GỐC" cũng sine giả | `:1721`, `:635` | Waveform THẬT: đọc peaks từ audio (ffmpeg/decode) lúc phân tích (pipeline đã có audio); khi chưa có thì để trống — KHÔNG vẽ sóng giả |
| H4 | Leak listener `dubbing:progress`: invoke throw → `unlisten()` không bao giờ chạy | `:557-563`, `:792-798` | `try/finally` bọc invoke, luôn unlisten |
| H5 | Lưu config provider sai: `setTransProvider(...)` rồi gọi liền `handleSaveProviderConfig()` đọc state CŨ → ghi nhầm provider (có nguy cơ phá dịch/LLM đang chạy) | `:1103-1106`, `:279-293` | Truyền giá trị mới làm tham số, không đọc state trong closure |

## 🟡 MEDIUM
| # | Lỗi | Vị trí | Cách sửa |
|---|---|---|---|
| M1 | Kéo thả file hỏng: `(file as any).path` không tồn tại trong WebView2/Tauri v2 | `:520` | Dùng event drag-drop của Tauri (xem `DubbingStudioView.tsx:~202`) hoặc `webUtils.getPathForFile` |
| M2 | `handleSplitSegment` tách nhầm câu cũ (setState async, closure cũ) | `:1978-1979` | Dùng functional update theo id |
| M3 | Mutate trực tiếp hằng số `DEMO_SPEAKERS` qua shallow copy | `:1338-1341`, `:1350-1353` | Deep copy hoặc bất biến |
| M4 | "Progressive Demo" xóa segments THẬT rồi lấp DEMO | `:745-754` | Xóa hẳn tính năng demo khỏi luồng chính |
| M5 | Zoom slider GIẢ: tọa độ cố định 1200px, `zoomLevel` chỉ đổi nhãn | `:471-473`, `:2331`, `:2427` | Hoặc zoom thật (đổi px/giây) hoặc bỏ slider |
| M6 | Nút giả: Undo (`:924`), "Khóa xưng hô" (`:1249`), "Đánh giá lại 98/100" (`:1475`), "~135 WPM" hardcode (`:1436`) — bấm chỉ hiện toast | — | Làm thật hoặc ẩn/đánh dấu "(sắp có)" — không được treo đầu dê bán thịt chó |
| M7 | `post_process` XÓA toàn bộ ký tự CJK khi dịch → mất tên riêng Nhật/Trung | `translate/server.rs:496-513` | Chỉ strip khi câu gốc không chứa CJK, hoặc bỏ bước này |
| M8 | `RECENT_CONTEXT.lock().unwrap()` → panic dây chuyền phá phiên dịch live | `server.rs:674, 783, 1119` | Dùng `.ok()`/`.lock().map_err` như chỗ khác |
| M9 | Batch dịch bị cancel → kết quả ngắn hơn input, index lệch → câu gán nhầm bản dịch | `server.rs:371-374`, `mod.rs:350-353` | Cancel = hủy CẢ batch (báo lỗi/retry), không ghép nửa vời |
| M10 | `kill_existing_server()` = `taskkill /IM llama-server.exe` giết mọi tiến trình trên máy (kể app khác) | `server.rs:429-437` | Lưu PID đã spawn, chỉ kill PID đó |

## 🟢 LOW (làm nốt cho sạch)
- `try{}catch{}` rỗng nuốt lỗi (`:327, :350, :364`) → log hoặc báo.
- Khởi tạo giả `multi_speaker_scene.mp4 • 26.0s` (`:168-169`); filmstrip "Scene 1..18" thumbnail giả (`:2399-2409`); glossary hardcode nhưng ghi "AI tự động lập" (`:192-196`); `spk.count` không tự cập nhật khi sửa câu.
- Title cửa sổ overlay còn "v0.9.9" (`tauri.conf.json:30`); fallback version "0.8.0" (`SettingsView.tsx:1376`); type `AppConfig` trong `tauri.ts` thiếu `ytdlp_path` (lệch với `config.rs:68`).

## ✅ GIỮ NGUYÊN (đã đúng — không sửa bừa)
- Nạp video bằng `convertFileSrc` + asset protocol (`tauri.conf.json` đã bật scope) — đúng cách.
- Nối pipeline thật: `handleRunAnalysis` → `dubbing_analyze` → `analyze_and_create_project`; export thật.
- DownloaderView: logic tải/tiến trình/cookie NGUYÊN VẸN, chỉ thêm nút "Đưa vào Studio" (đúng luật).
- Version 0.11.0 nhất quán 3 nơi, không BOM. `config.rs` thêm `ytdlp_path` sạch (serde default).

## 📋 NGHIỆM THU LẠI (LUẬT CHẠY THẬT — chụp ảnh + nói rõ)
1. Kéo 1 video THẬT từ ổ đĩa vào Studio → video HIỆN và PHÁT THẬT trong khung (không đen, không sóng giả), playhead khớp tiếng nói trong loa.
2. Bấm "Đưa vào Studio" từ tab Tải video với video tải về → video vào Studio ĐƯỢC.
3. Phân tích 1 video THẬT 2 người nói → 2 làn nhân vật + câu đúng; CỐ Ý làm hỏng (file rác) → hiện LỖI rõ, KHÔNG đổ demo, KHÔNG báo "hoàn tất".
4. Gõ Space trong ô nhập chữ → gõ được dấu cách; nút bấm được bằng bàn phím ở mọi tab.
5. Sóng âm làn TIẾNG GỐC khớp tiếng thật (im lặng thì sóng phẳng).
