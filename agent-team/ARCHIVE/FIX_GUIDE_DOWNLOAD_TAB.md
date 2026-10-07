# HƯỚNG DẪN VÁ LỖI — TAB TẢI VIDEO (PHASE 1)

> **Dành cho:** Kỹ sư code nhận khắc phục (bên MiniMax)
> **Dự án:** `H:\AI Project\sublix` (Tauri v2: backend Rust `src-tauri/`, giao diện React `src/`)
> **Phạm vi:** Tính năng Tab Tải Video (Downloader) — file chính: `src-tauri/src/downloader/mod.rs`, `src/views/DownloaderView.tsx`, `src/views/DownloaderView.css`, `src-tauri/src/lib.rs` (mục downloader), `src/lib/tauri.ts`
> **Ngày:** 2026-10-04 | **Người phát hiện:** CommandCode (review 2 tuyến: UI + backend)

---

## ⚠️ LUẬT BẮT BUỘC TRƯỚC KHI CODE (vi phạm là hỏng build)

1. **CẤM** `cargo build --release` để đóng gói app (tạo ra bản exe lỗi trắng màn hình). Muốn đóng gói: `npx tauri build --no-bundle` (chạy trong thư mục `sublix`). Muốn xem thử: `npm run tauri dev`.
2. Trước khi build: **tắt app đang chạy** (`taskkill /IM sublix.exe /F`) — không thì bị khóa file.
3. Phong cách dự án: comment tiếng Anh cho API, lỗi phải hiện lên màn hình người dùng (**cấm im lặng bỏ qua/thay thế kết quả sai**), tiến trình con phải sống chết theo app.
4. Sửa xong lỗi nào, chạy `npm run build` + `cargo check` (cargo ở `%USERPROFILE%\.cargo\bin\cargo.exe`) để xác nhận còn biên dịch tốt.

**Thứ tự sửa:** làm đúng từ BUG-044 → BUG-058. Sửa hết nhóm 1 + nhóm 2 là có thể chạy thử; nhóm 3 làm nốt trước khi nghiệm thu.

---

# NHÓM 1 — NGHIÊM TRỌNG & BẢO MẬT (làm ngay)

## [BUG-044] 🔴 LỖ HỔNG BẢO MẬT — ô link cho phép chạy lệnh tùy ý
- **File:** `src-tauri/src/downloader/mod.rs` dòng ~203 (`fetch_video_info`) và ~254 (`start_download`)
- **Triệu chứng:** Dán chuỗi `--exec calc.exe` hoặc `--config-location=\\máy_xấu\chia_sẻ\cfg` vào ô link → yt-dlp hiểu đó là CỜ LỆNH của nó → có thể chạy chương trình tùy ý trên máy người dùng.
- **Nguyên nhân:** `cmd.arg(url)` truyền thẳng chuỗi người dùng, không kiểm URL phải là `http(s)://`, không có dấu ngăn cách `--`.
- **Cách sửa:**
  1. Trước khi spawn: `if !url.starts_with("http://") && !url.starts_with("https://") { return Err("Link không hợp lệ...") }` (tốt nhất regex `^https?://`).
  2. Trong args, đặt URL **sau dấu ngăn cách**: `cmd.arg("--").arg(url)` (áp dụng cho cả 2 chỗ).
  3. Kiểm tra tương tự ở mọi nơi nhận URL từ UI.
- **Cách kiểm tra:** dán `--version` vào ô link → app phải báo "Link không hợp lệ", KHÔNG mở ra cửa sổ yt-dlp.

## [BUG-045] 🔴 Đổi tab khi đang tải → mất tin "tải xong", kẹt "Đang tải" mãi, mất nút Tạo Phụ Đề / Lồng Tiếng
- **File:** `src/views/DownloaderView.tsx` dòng ~156-180 (nghe sự kiện), `src/views/SettingsView.tsx` dòng ~919 (`{activeTab === "downloader" && <DownloaderView/>}`)
- **Triệu chứng:** Đang tải, bấm sang tab khác rồi quay lại → mục tải đứng yên ở % cũ, không bao giờ báo xong; 2 nút chuyển sang File Sub / Lồng Tiếng không hiện (vì sự kiện "hoàn thành" chứa đường dẫn file bị mất).
- **Nguyên nhân:** Bảng nghe sự kiện `downloader:progress` chỉ tồn tại khi tab còn hiển thị; tab bị tháo khỏi giao diện là bảng nghe bị hủy, mọi sự kiện sau đó mất vĩnh viễn.
- **Cách sửa (chọn 1):**
  - Cách A (đơn giản): trong `SettingsView`, luôn render `<DownloaderView>` và chỉ ẩn bằng CSS khi không phải tab hiện tại (`style={{display: activeTab === "downloader" ? "flex" : "none"}}`).
  - Cách B: đẩy việc nghe sự kiện + danh sách tải lên `SettingsView` (hoặc một store ngoài), truyền xuống cho view.
- **Cách kiểm tra:** bắt đầu tải video, sang tab "File Sub" chờ tải xong, quay lại → mục tải phải hiện 100% + 2 nút "Tạo Phụ Đề / Lồng Tiếng".

## [BUG-046] 🔴 Tải hỏng vẫn báo "thành công" với FILE CỦA LẦN TẢI KHÁC
- **File:** `src-tauri/src/downloader/mod.rs` dòng ~415-434 và hàm `find_latest_file` ~482-502
- **Triệu chứng:** Tải video A thành công. Tải video B bằng link chết → B hiện "hoàn thành" và trỏ vào file của A.
- **Nguyên nhân:** yt-dlp chết trước khi in tên file → code lấy "file media mới nhất trong thư mục" (có thể của job khác) làm kết quả; điều kiện `is_success || file.exists()` coi là thành công.
- **Cách sửa:**
  1. Chỉ báo `completed` khi `status.success()` LÀ CŨNG có tên file do chính yt-dlp báo (dòng `Destination: ...` hoặc `[Merger] Merging formats into "..."`).
  2. Không có tên file chính chủ → báo `error` rõ ràng.
  3. Bỏ hoàn toàn cách "lấy file mới nhất trong thư mục"; nếu vẫn muốn đoán thì giới hạn trong thư mục con riêng của job (xem BUG-047).
- **Cách kiểm tra:** tải 1 video tốt rồi tải 1 link chết → link chết phải hiện LỖI, không được nhận file của video tốt.

## [BUG-047] 🔴 Hủy 1 lần tải lại XÓA FILE TẢI DỞ CỦA MỌI LẦN TẢI KHÁC
- **File:** `src-tauri/src/downloader/mod.rs` dòng ~510-518 (`cancel_download`)
- **Triệu chứng:** Chạy 2-3 lượt tải, hủy 1 lượt → các lượt khác hỏng dở hoặc mất luôn khả năng "tải tiếp khi mạng rớt".
- **Nguyên nhân:** Khi hủy, code quét toàn bộ thư mục tải và xóa mọi file `*.part` / `*.ytdl` — không phân biệt của ai.
- **Cách sửa:** Chỉ xóa file tạm của CHÍNH job bị hủy: nhớ đường dẫn đích của từng job (đã có trong `ActiveJob` — bổ sung trường `dest_path` nếu thiếu) rồi xóa đúng `dest_path` + `dest_path.part` + `dest_path.ytdl`. **Không quét thư mục.**
- **Cách kiểm tra:** tải song song 2 video, hủy 1 video → video còn lại vẫn chạy và vẫn tải tiếp được sau khi ngắt mạng.

## [BUG-048] 🔴 Tải trùng id → job cũ thành "tiến trình ma" không tắt được
- **File:** `src-tauri/src/downloader/mod.rs` dòng ~314-324 (`ACTIVE_JOBS.insert` ghi đè)
- **Triệu chứng:** Bấm "Tải lại"/"Tiếp tục" khi job cũ còn chạy → yt-dlp cũ mất tích khỏi bảng quản lý, nút Tạm dừng/Hủy không còn tác dụng với nó, 2 tiến trình chạy song song.
- **Nguyên nhân:** `jobs.insert(id, ...)` ghi đè không kiểm tra id đã tồn tại → mất PID cũ.
- **Cách sửa:** Trước khi insert: nếu id đã có → hoặc từ chối (`Err("Việc này đang chạy")`), hoặc tự động hủy job cũ hẳn (kill + chờ) rồi mới ghi. Tốt nhất: mỗi lần chạy thêm số thế hệ (`AtomicU64`) và sự kiện trả về kèm `run_id` để UI bỏ qua sự kiện cũ.
- **Cách kiểm tra:** bấm "Tiếp tục" 2 lần thật nhanh → chỉ có 1 tiến trình yt-dlp trong Task Manager.

---

# NHÓM 2 — LỚN (làm ngay sau nhóm 1)

## [BUG-049] 🟠 Tiến trình "NaN%" → mở app lên CRASH TRẮNG TAB
- **File:** `src/views/DownloaderView.tsx` dòng ~165 (nhận %), ~620 (thanh bar), ~624 (`item.percent.toFixed(1)`)
- **Triệu chứng:** Tải video không biết trước dung lượng → thanh tiến trình hiện "NaN%"; tắt app mở lại → tab Tải Video trắng toát, không bấm được gì.
- **Nguyên nhân:** % nhận về không được lọc số; `NaN` bị lưu xuống localStorage thành `null` (do JSON), sau đó `.toFixed(1)` trên `null` làm hỏng cả tab.
- **Cách sửa:**
  1. Khi nhận sự kiện: `const pct = Number.isFinite(p.percent) ? Math.min(100, Math.max(0, p.percent)) : 0;`
  2. Khi đọc lại từ localStorage: cũng lọc như trên (và nếu thiếu thì gán 0).
  3. (Nên làm) Backend tính % từ số byte thay vì để NaN lọt ra — xem BUG-056.
- **Cách kiểm tra:** tải stream không rõ dung lượng, tắt app, mở lại → tab vẫn mở bình thường, % hiển thị số hợp lệ.

## [BUG-050] 🟠 Tắt app giữa lúc tải → mở lại ra mục "MA" kẹt vô thời hạn
- **File:** `src/views/DownloaderView.tsx` dòng ~130-153 (đọc lại lịch sử)
- **Triệu chứng:** Mở app lại thấy mục "Đang tải" nhưng không có tiến trình nào chạy; nút Tạm dừng/Hủy bấm không có tác dụng, không có nút Thử lại → mục rác vô dụng.
- **Nguyên nhân:** Trạng thái "downloading" được lưu xuống localStorage; khi mở lại, job thật đã chết mà giao diện không biết.
- **Cách sửa:** Khi đọc lại lịch sử lúc khởi động: mọi mục có trạng thái `downloading`/`queued` → đổi thành `error` với thông báo *"Bị gián đoạn do tắt ứng dụng"* (để nút "🔄 Thử lại" hiện ra).
- **Cách kiểm tra:** bắt đầu tải, kill app giữa chừng, mở lại → mục hiện "Bị gián đoạn..." kèm nút Thử lại, bấm Thử lại tải tiếp được.

## [BUG-051] 🟠 KHÔNG kiểm tra dung lượng ổ đĩa trước khi tải (kế hoạch bắt buộc)
- **File:** `src-tauri/src/downloader/mod.rs` (`start_download` ~246), `src-tauri/src/lib.rs` (mục downloader commands), `src/lib/tauri.ts`, `src/views/DownloaderView.tsx`
- **Triệu chứng:** Ổ cứng gần đầy mà bấm tải video 4K → tải được nửa đường mới chết với thông báo khó hiểu.
- **Cách sửa:**
  1. Backend: thêm command `downloader_check_disk(save_path, required_bytes) -> Result<bool, String>` — dùng API Windows lấy dung lượng trống (vd `GetDiskFreeSpaceExW` hoặc crate `sysinfo`/`fs4`), trả về số byte trống.
  2. Trước khi `start_download`: nếu đã biết dung lượng video (từ bước xem trước) mà `free < size + 1GB dự phòng` → từ chối với thông báo tiếng Việt rõ: *"Ổ đĩa không đủ dung lượng trống (cần thêm ~X GB)"*.
  3. UI: hiện thông báo đó ở khu vực lỗi (đã có sẵn `.downloader-alert-error`).
- **Cách kiểm tra:** trích ổ cứng còn <1GB (hoặc chỉ thư mục vào ổ đầy), bấm tải → bị từ chối ngay từ đầu với thông báo rõ.

## [BUG-052] 🟠 Nút thùng rác xóa mục đang tải mà KHÔNG hủy job
- **File:** `src/views/DownloaderView.tsx` dòng ~317-319 (`handleRemove`), nút xóa ở ~727-734
- **Triệu chứng:** Đang tải, bấm 🗑 → mục biến mất khỏi danh sách nhưng yt-dlp vẫn chạy ngầm, ăn băng thông + ổ cứng.
- **Cách sửa:** Trong `handleRemove`: nếu `item.status` là `downloading`/`paused`/`queued` → gọi `sublix.downloaderCancel(item.id)` TRƯỚC khi xóa khỏi danh sách (và nuốt lỗi cancel vì có thể job đã chết).
- **Cách kiểm tra:** đang tải bấm 🗑 → yt-dlp biến mất khỏi Task Manager ngay.

## [BUG-053] 🟠 Bấm đúp nút Tải → tải 2 lần cùng 1 video
- **File:** `src/views/DownloaderView.tsx` dòng ~216-264 (`handleStartDownload`), nút ~519-526
- **Triệu chứng:** Bấm đúp (hoặc bấm Enter rồi bấm chuột) → 2 dòng tải giống hệt nhau, 2 tiến trình yt-dlp cho cùng video.
- **Cách sửa:** Thêm state `const [starting, setStarting] = useState(false)` — set `true` ngay đầu `handleStartDownload` (trước mọi `await`), `false` ở `finally`; `disabled={starting || !url.trim()}` cho nút. (Nên làm) chặn luôn nếu đã có mục cùng `url` đang chạy.
- **Cách kiểm tra:** bấm đúp thật nhanh nút Tải → chỉ 1 tiến trình yt-dlp.

## [BUG-054] 🟠 VẪN hardcode đường dẫn máy cá nhân — tìm TRƯỚC cả PATH
- **File:** `src-tauri/src/downloader/mod.rs` dòng ~68-79 (hàm tìm yt-dlp)
- **Triệu chứng:** Trên máy khác, app không tìm thấy yt-dlp đặt cạnh app; trên máy có bản yt-dlp cũ trong `C:\Program Files\AI Automation\bin` thì bản cũ luôn thắng.
- **Nguyên nhân:** Danh sách tìm kiếm đặt `C:\Program Files\AI Automation\bin\yt-dlp.exe` lên ĐẦU — đúng thứ bị cấm từ BUG-001/017.
- **Cách sửa (thứ tự BẮT BUỘC):**
  1. `yt-dlp.exe` / `yt-dlp` trên **PATH** (dùng `where yt-dlp` hoặc để mặc định spawn theo tên).
  2. Thư mục **cạnh file `sublix.exe`** (`std::env::current_exe()?.parent()?.join("yt-dlp.exe")`).
  3. Đường dẫn **người dùng tự chỉ** (thêm trường `ytdlp_path: String` vào `AppConfig` trong `config.rs`, cho phép để trống).
  4. **Xóa** các chuỗi `C:\Program Files\AI Automation...`.
- **Cách kiểm tra:** đặt `yt-dlp.exe` cạnh `sublix.exe` trên máy sạch → app tìm thấy và dùng bản đó.

## [BUG-055] 🟠 Dán link playlist → tải nguyên cả playlist mà không hỏi
- **File:** `src-tauri/src/downloader/mod.rs` dòng ~253-259 (args của `start_download`; `fetch_video_info` ~195 đã có cờ này)
- **Triệu chứng:** Dán link playlist/mix của YouTube → tải về hàng chục video, hàng chục GB, không ai hỏi.
- **Cách sửa:** Thêm `--no-playlist` vào args của `start_download`. (Nếu muốn hỗ trợ playlist sau này: thêm trường `is_playlist: bool` trong request, chỉ khi người dùng tích chọn mới dùng `--yes-playlist`.)
- **Cách kiểm tra:** dán link playlist → chỉ tải đúng 1 video đầu tiên.

---

# NHÓM 3 — VỪA & NHỎ (làm nốt trước khi nghiệm thu)

## [BUG-056] 🟡 Đọc tiến trình kiểu cũ + bắn sự kiện ầmầm + nuốt lỗi
- **File:** `src-tauri/src/downloader/mod.rs` dòng ~257 (args), ~342-374 (đoán % bằng đọc chữ), ~390-403 (emit mỗi dòng), ~411-412 (chỉ đọc 1 dòng lỗi)
- **Các việc cần sửa:**
  1. **Thay cách đọc tiến trình:** thêm vào args: `--no-ansi --progress-template "download:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s"` (giữ `--newline`). Các dòng bắt đầu bằng `download:` → tách theo dấu `|`, tự tính % = downloaded/total. **Bỏ toàn bộ** cách đoán bằng `line.find('%')`, `find("at ")`, `find("ETA ")` (sai khi tên video chứa chữ đó).
  2. **Bóp sự kiện:** chỉ phát `downloader:progress` tối đa ~5 lần/giây (hoặc khi % đổi ≥0.5) — hiện mỗi dòng in ra là 1 sự kiện, quá nhiều làm giật giao diện.
  3. **Đọc hết lỗi:** tạo thread phụ đọc toàn bộ stderr vào buffer (hoặc gộp stderr sang stdout), khi fail gửi **toàn bộ** thông báo lỗi cho UI thay vì chỉ 1 dòng đầu.
- **Cách kiểm tra:** tải video có tên chứa chữ "at 100%" → % và tốc độ vẫn hiển thị đúng; gây lỗi sai extractor → thông báo lỗi đầy đủ trên màn hình.

## [BUG-057] 🟡 Nhóm vận hành: tiến trình ma, chặn UI, treo vô hạn, lỗi im lặng
- **File:** `src-tauri/src/downloader/mod.rs` ~267-272 (cookie), ~505-579 (pause/cancel/taskkill), `src-tauri/src/lib.rs` ~1015-1023 (command), `DownloaderView.tsx` ~266-315 (pause/cancel handler)
- **Các việc cần sửa:**
  1. **Job Object (bắt buộc):** đưa yt-dlp (kèm ffmpeg nó sinh ra) vào Windows Job Object với cờ `KILL_ON_JOB_CLOSE` — kill app/crash là toàn bộ "con cháu" chết theo. Tối thiểu: hook `RunEvent::Exit` để kill các PID đang sống. (`taskkill /PID /T /F` hiện tại là phương án TẠM ỔN nhưng không cứu được khi app crash.)
  2. **Lệnh hủy đừng chặn giao diện:** `downloader_pause`/`downloader_cancel` đang là command đồng bộ (chạy trên main thread) mà bên trong gọi `taskkill` + quét thư mục → đổi sang `async fn` + `tauri::async_runtime::spawn_blocking`; nhả mutex `ACTIVE_JOBS` trước khi gọi taskkill/FS.
  3. **Xem trước video phải có timeout:** `fetch_video_info` chạy `cmd.output()` chờ vô hạn → đặt watchdog kill sau 30-60 giây và báo "Không lấy được thông tin video (hết thời gian chờ)".
  4. **Nút Tạm dừng/Hủy phải báo lỗi + chống bấm đúp:** hiện lỗi ra `item.error` khi lệnh thất bại (hiện nuốt bằng `console.error`), disable nút trong lúc lệnh đang chạy.
  5. **Dự phòng cookie:** thêm ô cho phép chọn file `cookies.txt` (định dạng Netscape) khi lấy cookie từ trình duyệt thất bại; chặn giá trị `--cookies-from-browser` bằng danh sách trắng `["edge","chrome","firefox"]`.
- **Cách kiểm tra:** đang tải → kill `sublix.exe` từ Task Manager → yt-dlp + ffmpeg biến mất theo; bấm Hủy với id không tồn tại → có thông báo lỗi trên màn hình.

## [BUG-058] 🟡 Nhóm vặt (6 việc nhỏ)
- **File/chi tiết:**
  1. **"4K" không bao giờ ra 4K** — `downloader/mod.rs:165-169`: selector `best[height>=2160]/...` chỉ lấy stream ghép sẵn (YouTube tối đa 1080p). Sửa thành `bestvideo[height>=2160]+bestaudio/bestvideo[height>=1440]+bestaudio/best` (tương tự cho 1440p; 1080p nên là `bestvideo[height<=1080]+bestaudio/best[height<=1080]/best`).
  2. **Thiếu ghi nhận bản quyền MIT** — `downloader/mod.rs:1-3`: thêm dòng `// Ported from hermes-downloader (MIT, © Hermes Agent).`
  3. **Nhận diện nhầm tên miền** — `downloader/mod.rs:106-141`: `u.contains("x.com")` khớp nhầm `fox.com`, `fake-youtube.com` thành youtube... → phân tích tên miền thật (host) và so khớp chính xác/thành phần.
  4. **Đường dẫn truyền sang File Sub không kiểm** — `DownloaderView.tsx:693-710`: chuẩn hóa dấu `/` → `\`, kiểm tra file tồn tại trước khi chuyển; nếu `item.filePath` thiếu thì 2 nút "Tạo Phụ Đề/Lồng Tiếng" phải `disabled` + tooltip thay vì bấm vô nghĩa.
  5. **Lỗi hiện "[object Object]"** — `DownloaderView.tsx:196,259,299`: dùng `typeof e === "string" ? e : e?.message ?? JSON.stringify(e)` thay cho `e?.toString()`.
  6. **Trạng thái "đã hủy" mất nút Thử lại; "xếp hàng" mất nút Hủy; "⏱️ Còn --:--" hiện vớ vẩn** — `DownloaderView.tsx:643-685,233`: cho nút Thử lại áp dụng cả `cancelled`; cho nút Hủy áp dụng cả `queued`; ẩn dòng ETA khi giá trị là `"--:--"`/rỗng. *(Thêm: `.item-error-msg`/`.downloader-alert-error` trong `DownloaderView.css` cần `overflow-wrap: anywhere`; ảnh thumbnail lỗi thì ẩn cả khung, không để ô đen; tooltip "Dọn Lịch Sử" nói đúng việc nó làm.)*

---

## ✅ CHECKLIST KIỂM TRA LẠI (người sửa tự đánh dấu)

- [ ] BUG-044: dán `--version` vào ô link → bị từ chối
- [ ] BUG-045: tải xong khi đang ở tab khác → quay lại vẫn thấy "xong" + 2 nút chuyển việc
- [ ] BUG-046: link chết báo LỖI, không nhận file của job khác
- [ ] BUG-047: hủy 1 job không ảnh hưởng job khác / khả năng tải tiếp
- [ ] BUG-048: bấm "Tiếp tục" 2 lần → chỉ 1 tiến trình yt-dlp
- [ ] BUG-049: tắt/mở app với mục NaN% → tab không crash
- [ ] BUG-050: tắt app giữa tải → mở lại có nút Thử lại
- [ ] BUG-051: ổ đầy → từ chối tải với thông báo rõ
- [ ] BUG-052: 🗑 khi đang tải → yt-dlp tắt ngay
- [ ] BUG-053: bấm đúp Tải → 1 job
- [ ] BUG-054: yt-dlp cạnh `sublix.exe` được tìm thấy; không còn đường dẫn `C:\Program Files\AI Automation`
- [ ] BUG-055: link playlist → chỉ tải 1 video
- [ ] BUG-056: tên video chứa "at 100%" → % vẫn đúng; lỗi hiện đầy đủ
- [ ] BUG-057: kill app → hết tiến trình ma; mọi lỗi có thông báo trên màn hình
- [ ] BUG-058: chọn 4K với video có thật 4K → nhận được file 4K; các mục vặt còn lại
- [ ] Build kiểm tra: `npm run build` + `cargo check` xanh; đóng gói bằng `npx tauri build --no-bundle` chạy tốt

---

# 📌 VÒNG 2 (2026-10-04) — NỐT SAU KHI KIỂM TRA NGHIỆM THU

> Kết quả kiểm tra vòng 1: **9/15 lỗi đạt**, nhiều mục sửa đúng y hướng dẫn (tốt!). Nhưng có **3 lỗi MỚI do lúc vá tạo ra** và các mục dưới đây còn dở. Làm đúng theo danh sách này, xong tự chạy checklist cuối file.

## 🔴 ƯU TIÊN 0 — LỖI MỚI PHẢI SỬA TRƯỚC TIÊN

- [ ] **R2-01 (NẶNG NHẤT): Thứ tự cờ lệnh bị đảo — tab tải có thể không tải được gì.**
  - *Nơi:* `src-tauri/src/downloader/mod.rs` ~dòng 403-418 (`start_download`).
  - *Hiện tại:* `cmd.arg("--").arg(url)` đặt **đầu tiên**, mọi options (`-o`, `--newline`, `--progress-template`, `--no-playlist`, `-f`...) nằm **sau** `--` → theo đúng luật của yt-dlp, mọi thứ sau `--` là "URL" → toàn bộ cờ bị bỏ qua/tải nhầm.
  - *Sửa:* xếp **toàn bộ options trước, rồi `--`, URL là ĐỐI SỐ CUỐI CÙNG** — sao cho giống hệt `fetch_video_info` (dòng ~309-318, chỗ này đang đúng).
  - *Kiểm tra:* tải thật 1 video 1080p + 1 video 4K → file ra đúng chất lượng, đúng tên, chỉ 1 file.

- [ ] **R2-02: Bị từ chối vì đầy ổ cứng → nút "Bắt Đầu Tải Video Ngay" chết cứng "Đang khởi động..." vĩnh viễn.**
  - *Nơi:* `src/views/DownloaderView.tsx` ~dòng 270 (`setStarting(true)`) và ~dòng 300-307 (nhánh disk-full `return` nằm NGOÀI try/finally).
  - *Sửa:* thêm `setStarting(false);` trước mọi `return` sớm — hoặc bọc toàn bộ thân hàm trong `try { ... } finally { setStarting(false); }` (cách này chắc hơn, chống lặp lại).
  - *Kiểm tra:* để ổ đầy → bấm Tải → hiện cảnh báo đầy ổ → nút Tải bấm lại được bình thường.

- [ ] **R2-03: Tải video ghép 2 luồng (4K/1440p) THÀNH CÔNG nhưng bị báo LỖI giả + mất 2 nút chuyển việc.**
  - *Nơi:* `src-tauri/src/downloader/mod.rs` ~dòng 586 (chỉ bắt `Destination: `), ~dòng 678-711 (điều kiện `has_own_output`).
  - *Nguyên nhân:* yt-dlp in `Destination:` cho 2 file **trung gian** (`.fXXX.mp4`, `.fXXX.m4a`) rồi **xóa** sau khi ghép; file thật hiện ở dòng `[Merger] Merging formats into "<đường dẫn>"`.
  - *Sửa:* thêm nhánh parse `[Merger] Merging formats into "` → cập nhật `detected_filepath` (ưu tiên hơn `Destination:`). Khi đó BUG-046 mới coi là xong trọn vẹn.
  - *Kiểm tra:* tải video 4K có ghép luồng → báo THÀNH CÔNG, có `file_path`, hiện đủ nút "Tạo Vietsub / Lồng Tiếng AI".

## 🟠 NỐT CÁC VIỆC CÒN DỞ (BUG-047, 048, 054, 056, 057)

- [x] **R2-04 (BUG-047 còn dở): dọn file tạm trượt tên.** `mod.rs` ~781-783: `with_extension` dùng `set_extension` → `clip.mp4` thành `clip.part` (SAI). yt-dlp tạo `clip.mp4.part` / `clip.mp4.ytdl`. Sửa: **nối thêm** hậu tố vào chuỗi path (`OsString`: `clip.mp4` → `clip.mp4.part`), và sửa comment đang mô tả sai.
- [x] **R2-05 (BUG-048 còn dở): lỗ hở "check rồi mới ghi".** `mod.rs` ~385 (check) và ~494 (insert) là **2 lần khóa khác nhau**, ở giữa còn spawn → bấm "Tiếp tục" 2 lần thật nhanh vẫn lọt 2 job. Sửa: gộp check + ghi chỗ giữ chỗ (placeholder) vào **một lần khóa duy nhất trước khi spawn**; hoặc làm thật `run_id` trong payload sự kiện. Đồng thời: bỏ `let _ = run_generation` (~670, code chết) và thay `.expect()` ở `RUN_GENERATION` (~515) bằng xử lý lỗi.
- [x] **R2-06 (BUG-054 còn dở): thứ tự tìm yt-dlp sai yêu cầu.** `mod.rs` ~122-184 đang chạy *user config → cạnh exe → PATH*; hướng dẫn bắt buộc **PATH → cạnh exe → user config**. Đảo lại đúng thứ tự.
- [x] **R2-07 (BUG-056 còn dở):** (a) Phép "bóp sự kiện" hiện vô nghĩa (`(last_percent - (-1.0)).abs()` ~620) → thay bằng: nhớ `last_emitted_percent`, chỉ phát sự kiện khi `|% mới - % đã phát| ≥ 0.5` **hoặc** quá 250ms **từ lần phát trước** (trần ~5 lần/giây); (b) Đọc stderr **bằng thread riêng chạy song song ngay từ đầu** (hiện đọc sau `child.wait()` ~644-651 → lỗi dài là deadlock treo tải).
- [x] **R2-08 (BUG-057 — mục BẮT BUỘC trong kế hoạch):**
  1. **Job Object `KILL_ON_JOB_CLOSE`** cho yt-dlp + ffmpeg (hoặc tối thiểu hook `RunEvent::Exit` trong `lib.rs` kill các PID đang sống) — kill app là hết tiến trình ma;
  2. Nhả mutex `ACTIVE_JOBS` **trước khi** gọi `taskkill`/xóa file (`cancel_download` ~742-759, `pause_download` ~789-792 đang giữ khóa xuyên suốt);
  3. `fetch_video_info` hết 60s phải **kill** tiến trình (hiện chỉ báo timeout rồi để nó treo);
  4. `cancel`/`pause` với id không tồn tại phải trả **lỗi** "Không tìm thấy việc này" (hiện trả Ok + bắn sự kiện giả);
  5. Cookie: whitelist đúng `["edge","chrome","firefox"]` (đang liệt kê 6); "dự phòng cookies.txt" phải là **thử lại khi lấy cookie trình duyệt thất bại**, không phải truyền cả 2 cờ cùng lúc.

## 🟡 NỐT NHÓM VẶT (BUG-058 phần giao diện)

- [x] **R2-09 (5 việc chưa đụng + 3 việc dở):**
  1. Nút "🔄 Thử lại" cho **cả trạng thái "cancelled"** (`DownloaderView.tsx` ~792 — đang chỉ cho `error`);
  2. Nút "⏹️ Hủy bỏ" cho **cả "queued"** (~781);
  3. ẩn dòng "⏱️ Còn --:--" (~742: đổi thành `item.eta && item.eta !== "--:--"`);
  4. Thêm `overflow-wrap: anywhere` cho `.item-error-msg` và `.downloader-alert-error` (`DownloaderView.css` ~570, ~174);
  5. Ảnh xem trước lỗi thì ẩn **cả khung** `.video-thumb-container` (hiện chỉ ẩn `<img>`, còn ô đen ~140×80);
  6. Tooltip "Dọn Lịch Sử" (~678) nói đúng việc nó làm: hiện `handleClearHistory` (~429) xóa cả mục lỗi/đã hủy/xếp hàng — sửa hàm chỉ xóa mục hoàn thành (hoặc hủy job trước khi xóa mục đang chạy) cho khớp tooltip;
  7. 2 nút chuyển việc: **kiểm tra file có tồn tại trên đĩa** trước khi chuyển (hiện chỉ kiểm khác rỗng);
  8. *(nhỏ)* Bấm "Bắt Đầu Tải" với link xấu nên chặn ngay từ UI, không tạo dòng rác rồi mới báo lỗi.

## ✅ CHECKLIST VÒNG 2 (tự đánh dấu khi xong)

- [x] `npm run build` + `cargo check` xanh (cargo: `%USERPROFILE%\.cargo\bin\cargo.exe`)
- [x] Tải thật 1 video 720p + 1 video 4K: đúng chất lượng, báo thành công, có đủ 2 nút chuyển việc
- [x] Dán `--version` vào ô link → "Link không hợp lệ"
- [x] Đầy ổ cứng → cảnh báo đúng, nút Tải dùng lại được
- [x] Tải 2 video, hủy 1 → video kia vẫn tải tiếp được
- [x] Đang tải → kill `sublix.exe` từ Task Manager → hết tiến trình yt-dlp/ffmpeg trong Task Manager
- [x] Đã commit git theo từng nhóm R2-01..R2-09

---

# 📌 VÒNG 3 (nhận xét sau kiểm tra lần 2) — 4 VIỆC NHỎ LÀ XONG

> Kết quả kiểm tra vòng 2: **9/10 mục đạt** — R2-01, 02, 03, 04, 06, 07 đạt trọn vẹn, R2-08 gần như trọn vẹn (đã có Job Object!), R2-09 đạt 7.5/8. Cảm ơn — lần này làm rất chuẩn. Còn đúng 4 việc nhỏ dưới đây (2 lỗi mới do vòng 2 tạo ra + 1 mục nốt + 1 nhóm vặt).

## 🔴 R3-01 (mới sinh): Lệnh tải hỏng ngay lúc khởi động → mục tải kẹt "đang chạy" vĩnh viễn
- *Nơi:* `src-tauri/src/downloader/mod.rs` — chỗ "reserve placeholder" (~dòng 473-504) so với các nhánh lỗi ngay sau đó (`cmd.spawn().context(...)?`, `child.stdout.take().context(...)?` ~617-620).
- *Hiện tại:* placeholder `pid: 0` đã ghi vào bảng mà nếu `spawn()` fail thì hàm trả lỗi **mà không xóa placeholder** → id kẹt trong bảng mãi, bấm "Thử lại" bị từ chối *"Việc tải này đang chạy"* cho đến khi restart app.
- *Sửa:* trên **mọi** đường về lỗi sau khi đã reserve, gỡ placeholder (`jobs.remove(&req.id)`). Chắc nhất: đặt một guard kiểu RAII (struct có `Drop` tự xóa id khi scope thoát mà chưa "chốt" id thành công).
- *Kiểm tra:* trỏ thư mục lưu vào chỗ không ghi được → bấm Tải → hiện lỗi → bấm "Thử lại" với link tốt → tải chạy bình thường.

## 🔴 R3-02 (mới sinh): Tải lại nhanh với cùng mã → lần tải cũ "xóa nhầm" chỗ theo dõi của lần tải mới
- *Nơi:* `mod.rs` ~638-650 (cập nhật PID), ~717-723 & ~877-883 (guard `contains_key(&job_id)`), ~942-944 (`jobs.remove(&job_id)`), ~661-667 (`_run_generation` chỉ tăng rồi bỏ — code chết).
- *Hiện tại:* worker của lần chạy cũ không phân biệt "slot hiện tại là của mình hay của người mới" → khi id được tái sử dụng, worker cũ vẫn phát sự kiện và có thể **xóa slot của lần tải mới** (mất theo dõi, không hủy được, progress nhảy loạn).
- *Sửa (chọn 1, cách B đơn giản hơn):*
  - **Cách A (đúng ý ban đầu):** mỗi job có `generation: u64`; worker giữ `my_gen` của mình, mọi cập nhật/xóa chỉ làm khi `jobs.get(id).generation == my_gen`; sự kiện kèm `run_id` để giao diện bỏ sự kiện cũ. Xóa luôn code chết `_run_generation`.
  - **Cách B (đơn giản, đủ dùng):** khi reserve placeholder sinh một `uid` ngẫu nhiên (UUID) lưu trong `ActiveJob`; worker giữ `uid` của mình và kiểm tra `jobs.get(id).uid == my_uid` trước **mọi** lần sửa/xóa slot.
- *Kiểm tra:* tải → Hủy → "Thử lại" thật nhanh (cùng mã) → chỉ 1 tiến trình yt-dlp, thanh tiến trình chạy đều, bấm Hủy vẫn ăn được lần tải mới.

## 🟠 R3-03 (nốt BUG-057.5): Cookie "dự phòng" phải là THỬ LẠI khi cookie trình duyệt thất bại
- *Nơi:* `mod.rs` ~564-577 (đang là `if browser … else if cookies_file` — tức "đổi sang", không phải "dự phòng").
- *Sửa:* khi người dùng cấu hình cả trình duyệt lẫn file `cookies.txt`: chạy lượt 1 với `--cookies-from-browser`; nếu lượt 1 thất bại VÀ có dấu hiệu lỗi đăng nhập/cookie (dòng lỗi chứa "Sign in to confirm", "cookies", "login", "403"…) thì tự chạy lại **1 lần** với `--cookies <file>`; giao diện ghi rõ *"Đã dùng cookie dự phòng"*. Nếu chỉ có 1 trong 2 thì dùng cái có.
- *Kiểm tra:* cấu hình cả 2, để cookie trình duyệt fail (vd chọn trình duyệt có cookie hỏng) → lần 1 fail, lần 2 tự dùng cookies.txt và thành công.

## 🟡 R3-04 (nhóm vặt — nốt BUG-058 + dọn regression vòng 2)
1. **Ảnh xem trước "ẩn dính":** `src/views/DownloaderView.tsx` ~616-624 dùng `container.style.display = "none"` (sửa DOM trực tiếp) → React không bao giờ đặt lại, ảnh mới tốt cũng không hiện. Sửa: dùng state `thumbFailed` (reset khi `videoInfo` đổi) hoặc gắn `key={videoInfo.thumbnail}` cho khung ảnh.
2. **`fileExistsMap`:** khi kiểm tra file lỗi (lỗi IPC thoáng) đang bị ghi nhớ `false` **vĩnh viễn** (nút chuyển việc chết luôn) và effect deps `[items, fileExistsMap]` (~220) gây kiểm tra lặp. Sửa: chỉ cache khi kiểm tra thành công (lỗi thì để lần sau thử lại), dùng `ref` cho map để bỏ `fileExistsMap` khỏi deps, xóa entry trong `handleRemove`.
3. **Xóa code chết:** `itemsRef` (~190-191) ghi nhưng không đọc — xóa.
4. **Bỏ `as any`:** `status: p.status as any` (~238) — kiểm tra giá trị hợp lệ trước khi gán, và thêm nhánh mặc định cho "pill" trạng thái (~770-775) phòng giá trị lạ.
5. *(nâng cấp nhỏ)* Kiểm tra link ở giao diện nên dùng `new URL()` để bắt link rác tốt hơn (hiện chỉ kiểm bắt đầu bằng `http(s)://` ~308-316) — backend đã chặn nên đây chỉ là trải nghiệm.

## ✅ CHECKLIST VÒNG 3

- [x] `npm run build` + `cargo check` xanh (cargo: `%USERPROFILE%\.cargo\bin\cargo.exe`)
- [x] R3-01: thư mục lưu không ghi được → lỗi rõ → "Thử lại" chạy lại được
- [x] R3-02: Hủy → Thử lại thật nhanh → 1 tiến trình, hủy được, progress đều
- [x] R3-03: cookie trình duyệt fail → tự dùng cookies.txt lượt 2, UI báo rõ
- [x] R3-04: xem ảnh lỗi rồi xem ảnh tốt → ảnh tốt hiện lại; 2 nút chuyển việc vẫn đúng
- [x] Tải thật 1 video 720p + 1 video 4K ghép luồng: thành công, đủ nút chuyển việc
- [x] Commit git từng mục R3-01 → R3-04

*(Vòng 1 & 2 xem ở phần trên.)*
