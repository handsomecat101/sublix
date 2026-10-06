# CHANGELOG — Sublix

> Lịch sử phát hành Sublix theo trục thời gian (mới nhất ở trên).
> Mỗi version được bump theo [SemVer](https://semver.org/):
> - **major** — breaking change kiến trúc lớn
> - **minor** — fix bug quan trọng hoặc tính năng mới đáng kể
> - **patch** — fix nhỏ, polish UI, refactor không phá API
>
> Phiên bản hiển thị trong UI là `v{major.minor}` (bỏ patch).

---

## v0.9.7 — 2026-10-06
### Tối Ưu Stage Dịch Phụ Đề: Dùng Batch Translate (Tiết Kiệm ~30 Phút/Video)
- Phát hiện qua AUDIT-SUB (xem `agent-team/AUDIT_SUB_REPORT.md`): pipeline "Tạo phụ đề" với video 21:43 mất **~64 phút** do Stage 3 (Translate MiniMax-M3 API) chiếm **~40 phút** (62% tổng). Code `file_sub.rs:400` loop từng segment → 416 segments × 5.7s ≈ 40 phút.
- Fix: thay vòng lặp sequential bằng `translate_batch_with_config()` đã có sẵn ở `translate/mod.rs:328` (chunk 15 segments/batch qua MiniMax-M3 batch endpoint). Estimate Stage 3 từ ~40 phút → **~5-10 phút** cho video 21:43 (tiết kiệm ~30 phút).
- **Trade-off đã báo cáo (No silent trade-offs):**
  - Progress emit vẫn theo từng segment (em chia nhỏ từ batch result) → UI UX tương đương loop cũ.
  - Hallucination filter + fallback `original_text` vẫn áp dụng đầy đủ.
  - Cancel check: batch check `is_dubbing_cancelled()` mỗi chunk (an toàn hơn loop cũ).
  - Error fallback: batch inner dùng `"[Dịch lỗi: ...]"`, em wrap ngoài bằng `original_text.clone()` cho UX thân thiện giống cũ.
- Chưa fix F1 (HF URL 401) + F2 (model corrupt check) + F3 (CUDA build) + F4 (progress trong whisper stage) → xem AUDIT_SUB_REPORT để biết khuyến nghị R1, R2, R4, R5.

---

## v0.9.6 — 2026-10-06
### Hiển Thị Rõ Đường Dẫn, Dung Lượng, Chất Lượng & Tiến Trình Tải
- **Video đã tải xong** giờ hiện đủ trong danh sách: **🎞 chất lượng** (vd *1920×1080 (Full HD)*), **💾 dung lượng thật** của file (đo trực tiếp từ ổ đĩa, vd *309.7 MB*) và **📁 đường dẫn đầy đủ** của file.
- **Khi đang tải**: thanh tiến trình hiện thêm **"đã tải / tổng"** (vd *📥 202.0 MB / 450.0 MB*) bên cạnh % + tốc độ + thời gian còn lại — nhìn là biết đang tải đến đâu.
- **Backfill**: các mục đã tải TRƯỚC bản này sẽ tự được đo lại dung lượng + độ phân giải khi mở app (không cần tải lại).
- **🔗 Link video gốc + nút Copy**: mỗi mục giờ hiện **link nguồn** kèm nút **📋 Copy link** — khi video die hoặc tải lỗi, chỉ cần copy link dán lại là tải lại được.
- Kỹ thuật: sự kiện `downloader:meta` (size + resolution) khi hoàn tất, command `downloader_file_meta` cho danh sách cũ; độ phân giải probe bằng ffprobe.

---

## v0.9.5 — 2026-10-06
### Sửa Chất Lượng Tải: Hết Bị Kẹt 360p (MAX giờ lên tới 4K)
- **Hiện tượng**: chọn "MAX — chất lượng cao nhất" nhưng video tải về chỉ 640x360.
- **Root cause**: cấu hình cũ ép `youtube:player_client=android,web_safari,ios` — YouTube đã bóp client android về SABR-only/360p, mọi format DASH (1080p/1440p/4K) biến mất khỏi danh sách ⇒ yt-dlp rơi về progressive 360p cho mọi video.
- **Fix**: bỏ ép client cũ — để yt-dlp tự chọn client mặc định (vẫn kèm JS runtime + EJS solver). Verify: danh sách format có đủ 4K/1440p/1080p/720p; tải thật 720p ra **1280x720** (trước đó 640x360).
- **Lưu ý cho người dùng**: file CŨ đã tải ở 360p không tự nâng cấp — muốn bản nét thì xóa file cũ trong thư mục downloads rồi tải lại.

---

## v0.9.4 — 2026-10-06
### Thêm Nút "Chạy Video" & Hiển Thị Rõ Thư Mục Tải
- **▶ Chạy Video**: mỗi video đã tải xong giờ có nút phát ngay bằng trình phát mặc định của Windows (dùng ShellExecuteW — xử lý đúng cả tên file có ký tự đặc biệt).
- **Hiển thị thư mục tải**: màn hình Tải Video hiện rõ dòng *"📁 File tải về được lưu tại: C:\...\downloads"* — không còn phải đoán file nằm ở đâu. Nút "Mở Thư Mục" vẫn mở Explorer chọn sẵn file.
- **Mặc định TẮT "Trích xuất phụ đề"**: theo nhu cầu thực tế (ưu tiên video), checkbox phụ đề mặc định tắt — tải nhanh hơn và tránh rate-limit 429 khi không cần sub.

---

## v0.9.3 — 2026-10-06
### Sửa Lỗi Hiển Thị Oan "Không In Ra Đường Dẫn File"
- **Hiện tượng**: Video tải xong thật (file nằm trên ổ cứng) nhưng app báo ❌ Lỗi *"yt-dlp đã thoát thành công nhưng không in ra đường dẫn file"* — anh Tuấn gặp với video "Arthas: Betrayer of the Light | Warcraft Cinematic" (45MB đã tải xong nhưng UI báo lỗi).
- **Root cause**: khi output của yt-dlp không phải UTF-8, **chuỗi đường dẫn in ra stdout bị mất/thay thế các ký tự mà codepage không biểu diễn được** (fullwidth `：｜`, chữ CJK...) — trong khi file thật trên ổ đĩa vẫn có đủ ký tự → app so chuỗi in ra với ổ đĩa → không thấy file → báo lỗi oan dù yt-dlp exit 0 (hiện tượng không ổn định, phụ thuộc môi trường console của máy).
- **Fix**: (1) Ép UTF-8 output cho mọi tiến trình yt-dlp (`PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1`); (2) **Không tin chuỗi in ra nữa** — khi yt-dlp exit 0 mà chưa xác minh được file, app quét thư mục tải tìm file media đúng **mã video** (`[<id>]`) làm bằng chứng gốc (an toàn theo luật BUG-046: không bao giờ lấy file của video khác); (3) UI: "Thử lại" thành công sẽ xoá cảnh báo lỗi cũ.

---

## v0.9.2 — 2026-10-06
### Sửa Lỗi Nhỏ: Kiểm Tra Link + Tải Phụ Đề
- **Kiểm Tra Link (fetch_video_info)**: Root cause tìm được: từ bản vá R2-08.3, hàm chuyển sang `spawn()` + `wait_with_output()` để có PID kill orphan nhưng quên pipe stdout/stderr — output luôn rỗng, nên khi yt-dlp exit 0 (kiểm tra thành công) app throw lỗi serde thô `EOF while parsing a value at line 1 column 0`; khi exit 1 thì mất luôn thông báo stderr. Đã sửa: thêm `Stdio::piped()`, tự dò JSON object (`{` đầu → `}` cuối, chấp nhận banner nhiễu), fallback thông báo thân thiện "Video không khả dụng / bị xóa / bị chặn khu vực".
- **Tải Phụ Đề (HTTP 429)**: Trước đây Sublix gửi 8 request HTTP liên tiếp đến YouTube để lấy 4 ngôn ngữ phụ đề (×2 loại subs), gây HTTP 429 "Too Many Requests". Giờ thêm `--sleep-subtitles 5` để yt-dlp tự delay 5s giữa mỗi request sub (verify CLI: mức 2s vẫn dính 429 khi chạy dồn, mức 5s qua sạch ở lượt chạy kế tiếp). Nếu YouTube vẫn giới hạn khi chạy dồn (rate-limit phía server, sleep không xóa 100%): job **không còn báo ❌ Lỗi oan** — video đã tải xong vẫn giữ ✅ Hoàn thành, kèm cảnh báo ⚠️ "phụ đề chưa tải được (429), thử lại sau vài phút" ngay trên UI (lỗi được hiện rõ, không im lặng).
- **Window title**: đồng bộ title bar 2 cửa sổ (main + overlay) về `v0.9.2` — khớp sidebar/Changelog (bản v0.9.1 trước đó còn để sót `v0.9.0`).

---

## v0.9.1 — 2026-10-06
### Sửa Lỗi Window Title Version Mismatch
- Window title (title bar + taskbar) của 2 window (`main` + `overlay`) bị hardcode `v0.8.0` trong `src-tauri/tauri.conf.json` dù sidebar/Changelog đã hiển thị `v0.9.0`.
- Sửa: cả 2 title giờ match với version thật.

---

## v0.9.0 — 2026-10-06
### Sửa Lỗi Quan Trọng: YouTube Download Hoạt Động Trở Lại
- Phát hiện root cause: **yt-dlp 2024.10+ yêu cầu JS runtime (Node.js/Deno) + remote challenge solver** để bypass YouTube anti-bot. Sublix chưa pass 2 flag này nên **mọi URL YouTube fail im lặng** (return `"n challenge solving failed"` → 0 bytes).
- Helper mới `find_js_runtime()` trong `src-tauri/src/downloader/mod.rs` tự động phát hiện `node` hoặc `deno` trên PATH (qua `where node.exe` trên Windows, `which node` trên Unix).
- Auto pass `--js-runtimes <runtime>:<path>` + `--remote-components ejs:github` khi tải video YouTube — script solver được tải từ GitHub ở lần đầu, cache lại cho lần sau.
- Áp dụng cho cả `start_download` (kèm nhánh retry cookie fallback) và `fetch_video_info` (inspect metadata) — nên "Kiểm Tra Link" cũng work trên YouTube.
- **Verified thủ công bằng CLI**: 11.28 MB Rick Astley tải về trong ~1 giây.

### Competitive Analysis với 4 Repo Voice/Dubbing
- Nghiên cứu sâu 4 đối thủ trên GitHub: **VoiceStudio** (53k⭐, Python+Electron, AGPL), **dub-studio** (Tauri giống Sublix, native C++ engines), **YouDub-webui** (FastAPI+Next.js, production với tác giả 1M+ subs), **ZastTranslate** (Python Gradio, 33 ngôn ngữ + Viral Shorts).
- Phát hiện Sublix có 3 điểm **UNIQUE**:
  1. **Đa engine song song** (Qwen 3 GPU local + MiniMax-M3 Cloud) — chưa ai làm
  2. **1-click pipeline bridges** (Downloader → File Sub → Dubbing Studio) — chưa ai làm
  3. **Downloader đa nền tảng** (9 site: YT/TT/Douyin/Bili/FB/X/IG/Vimeo/Reddit) — chỉ Sublix có
- Gợi ý **Roadmap P0**: Voice DESIGN (text → voice), MCP server cho AI agents, multi-TTS engine swap.
- Tài liệu đầy đủ tại `agent-team/COMPETITIVE_ANALYSIS.md` (15KB, 9 phần).

### File thay đổi
- `src-tauri/src/downloader/mod.rs` — +116 dòng (helper `find_js_runtime` + 2 call sites)
- `src/views/ChangelogModal.tsx` — thêm entry v0.9.0
- `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` — bump 0.8.0 → 0.9.0
- `agent-team/COMPETITIVE_ANALYSIS.md` — file mới

### Verify
- `cargo check` ✅ 0 warnings (4.11s)
- `npm run build` ✅ 364 KB JS / 80 KB CSS (1.17s)
- `cargo test --lib find_ytdlp_binary` ✅ PASS
- yt-dlp CLI test thật với flags mới ✅ **PASS (Rick Astley 11.28 MB)**

### Cần cho lần tới
- **Nếu máy không có Node.js**: cài https://nodejs.org (Node 18+) hoặc `irm https://deno.land/install.ps1 | iex` (cho Deno). Không có runtime → yt-dlp vẫn in warning và thử các site không cần bypass.

---

## v0.8.0 — 2026-10-04
### Nhận Diện Thị Giác AI & Bộ Minh Hoạ Điện Ảnh
- Logo mới: chữ S kết từ dải phim điện ảnh, kèm bộ icon ứng dụng trọn bộ cho taskbar & cửa sổ.
- Ảnh hero rạp chiếu phim ấm áp cho màn cài đặt đầu tiên (Onboarding).
- Bộ minh hoạ phẳng phong cách điện ảnh: khung chọn file, Trung tâm Models, lịch sử trống.
- Vân phim mờ tinh tế phủ trên sidebar ở theme Cinema & Studio.
- Tối ưu dung lượng ảnh từ 4.4 MB xuống còn 184 KB, app nhẹ và khởi động nhanh hơn.
- Hỗ trợ Kéo & Thả (Drag & Drop) tệp Video / Audio trực tiếp từ máy tính vào ứng dụng qua Tauri Native Webview API.
- Thay thế toàn bộ hộp chọn native Windows cũ bằng Custom Glass Select sang trọng.

---

## v0.7.0 — 2026-10-04
### Đại Tu Giao Diện Cinema Studio & AI Dubbing Đa Vai
- Bổ sung 4 phong cách giao diện: Cinema, Studio, Light, Vibrant.
- Bộ chọn Theme nhanh với nút chuyển đổi tức thì, tự động ghi nhớ cấu hình khi khởi động lại.
- Chuẩn hóa toàn bộ màu sắc sang Design Tokens (CSS Variables), thanh cuộn siêu mỏng tinh tế.
- Tách giọng gốc sạch 100% bằng Demucs v4 CUDA GPU.
- Tự động nhận diện phân vai diễn viên qua kịch bản ngữ cảnh MiniMax M3.
- Bộ giọng đọc Neural siêu tự nhiên (Edge-TTS) + tự động co giãn tốc độ (FFmpeg atempo).

---

## v0.6.0 — 2026-10-04
### Nâng Cấp CUDA RTX 3090 & Local LLM Translation
- Tích hợp Whisper Large-v3-Turbo Q8 (874MB) chạy trực tiếp trên GPU CUDA.
- Hỗ trợ Local Qwen 3 4B model cho dịch thuật offline, tốc độ ~0.1s/câu.

---

## v0.5.0 — 2026-10-03
### WASAPI Loopback Zero-Gap & Smart VAD
- ...

(Sửa lỗi Critical YouTube download, Competitive Analysis, bump version)

---

## Quy ước phát hành
- Mỗi commit sửa code (fix bug, feature, UI polish) **PHẢI**:
    1. Bump version `major.minor.patch` trong `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
    2. Thêm entry vào `CHANGELOG_DATA` trong `src/views/ChangelogModal.tsx`
    3. Thêm entry tương ứng vào `CHANGELOG.md` (file này)
- **minor** cho fix/feature đáng kể, **patch** cho nhỏ.
- Commit thay đổi version + CHANGELOG trong commit riêng (tách khỏi commit code).