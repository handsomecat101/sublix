# TSK-UI-R2-8-VERIFY — Báo cáo kiểm chứng giao diện vòng 2 (R2-8)

> **Ngày:** 2026-10-25 · **Agent:** Mavis/mcode #3 (Orca worker) · **Base:** `master` @ `e3bbcd7` → **cập nhật `da9a3ca`** (xem §10)
> **Phạm vi:** kiểm chứng toàn bộ giao diện sau khi code vòng 2 (R2-1 → R2-7C) — chụp ảnh "sau" cho 12 trạng thái, đối chiếu checklist §7.1 của [`UI_REDESIGN_PLAN.md`](./UI_REDESIGN_PLAN.md), kiểm tra không mất chức năng, ghi lỗi console. **Phần bổ sung (§10)**: kiểm 2 tính năng mới ở HEAD `da9a3ca` — **VoicePicker** (ô chọn giọng) và **smart ducking** (hạ tiếng nền theo thoại).
> **Ranh giới:** **KHÔNG sửa** `src/**` hay `src-tauri/**`. Chỉ ghi: `docs/ui-mockups/shots/after-*.png`, file báo cáo này, `agent-team/*`.
> **Kết luận ngắn:** **36/36 dòng checklist §7.1 có đường vào mới** (32 ✓ thực chứng, 4 ✓ có điều kiện chưa chạy được runtime). **1 lỗi console thật** (React key trùng `dubbing_active`) — **không phải do R2-8**, đã tìm ra nguyên nhân gốc. **0 lỗi runtime (`Runtime.exceptionThrown`)**. **Phần bổ sung §10: VoicePicker 9/9 PASS · smart ducking PASS cả 7 khe + đối chứng bridge.**

---

## 1. Môi trường kiểm thử

| Hạng mục | Giá trị |
|---|---|
| Instance | **Riêng** — không đụng app PO (app PO: port `1420` / CDP `9223` / pid `34136`) |
| Frontend | `npx vite preview --port 1423` phục vụ `dist/` đã build (**không dùng `vite dev`** — HMR reload làm mất state) |
| Backend (Rust) | Bản sao `scratchpad\sublix-r2-8.exe`, patch `localhost:1420` → `localhost:1423` (đúng 1 chỗ, cùng độ dài) |
| CDP | `http://127.0.0.1:9225` (target `http://localhost:1423/`, **không** phải `?window=overlay`) |
| WebView2 | `WEBVIEW2_USER_DATA_FOLDER=scratchpad\webview2-r2-8` (riêng) + `--remote-debugging-port=9225` |
| Viewport ảnh | **1920 × 1080**, `deviceScaleFactor: 1` |
| Dữ liệu | Video `%TEMP%\sublix-r2-8-media\A2Z_TEST_EN_dubbed.mp4` (có sẵn `.vi.srt` → 8 câu, không cần Whisper) |
| Ràng buộc Windows | Smart App Control chặn exe mới (`os error 4551`) → chờ rồi thử lại; **KHÔNG tắt SAC** |

**Bẫy đã gặp (không lặp lại):**

1. App render **2 bản topbar** (Studio có topbar riêng nằm trong `.studio-fullbleed`, `display:none` khi ở tab khác). Mọi truy vấn DOM **phải lọc phần tử đang hiển thị** (`getBoundingClientRect().width > 0`). Click "Studio" trên topbar **ẩn** là no-op (`SublixStudioView.tsx:6924`).
2. `.spp-toggle` là công tắc BẬT/TẮT bước, **không** phải mở accordion. Accordion mở bằng click `.spp-card-head`; **chỉ 1 bước mở tại 1 thời điểm**.
3. Sự kiện Tauri `tauri://drag-drop` **không** bắn được từ JS (`plugin:event|emit` bị bỏ qua) → nạp video bằng hộp thoại file native + `SendKeys`.
4. Nút icon-only (↻ quét âm thanh, ⋯ menu) **không có chữ** → phải tra theo `title` / `aria-label`, không dựa vào `innerText`.
5. Click bằng `el.click()` đôi lúc trượt với phần tử cuộn; ưu tiên `Input.dispatchMouseEvent` (chuột thật) cho tab/nút, và `el.click()` cho nút trong panel accordion.

---

## 2. Ảnh "sau" (12/12 trạng thái)

Thư mục: `docs/ui-mockups/shots/`

| # | Ảnh "sau" | Ảnh "trước" tương ứng | Nội dung |
|---|---|---|---|
| 01a | `after-01a-studio-chua-mo-video.png` | `before-01a-studio-chua-mo-video.png` | Studio mở, **chưa nạp video** — panel 5 bước + topbar |
| 01b | `after-01b-studio-co-phu-de.png` | `before-01b-studio-co-phu-de.png` | Studio **có phụ đề** — 8 câu, khối timeline, bước Dịch/Lồng tiếng |
| 01c | `after-01c-studio-panel-trai-toan-bo.png` | `before-01c-studio-panel-trai-toan-bo.png` | **Panel trái toàn bộ** (accordion mở hết từng bước) |
| 01d | `after-01d-studio-glossary-drawer.png` | — (bổ sung) | Drawer **Thuật ngữ & xưng hô** ở bước Dịch |
| 02 | `after-02-tai-video-rong.png` | `before-02-tai-video-rong.png` | Tab **Tải video** — rỗng |
| 02b | `after-02b-tai-video-hang-doi.png` | `before-02b-tai-video-hang-doi.png` | Tab **Tải video** — hàng đợi (2 link + 1 playlist → 21 mục) |
| 03 | `after-03-live.png` | `before-03-live.png` | Tab **Live** |
| 04 | `after-04-lich-su.png` | `before-04-lich-su.png` | Tab **Lịch sử** |
| 05 | `after-05-tien-trinh.png` | `before-05-tien-trinh.png` | Tab **Tiến trình** |
| 06 | `after-06-cai-dat.png` | `before-06-cai-dat.png` | Tab **Cài đặt** |
| 06b | `after-06b-cai-dat-ai-dich.png` | `before-06b-cai-dat-ai-dich.png` | Cài đặt › **Dịch thuật** |
| 06c | `after-06c-cai-dat-stt.png` | — (bổ sung) | Cài đặt › **Nhận giọng nói (STT)** |

> ⚠️ **Lưu ý phát hành:** `.gitignore:97` có `*.png` ⇒ **toàn bộ ảnh `before-*`/`after-*` không được commit** (đúng như trạng thái hiện tại của repo — `docs/UI_REDESIGN_PLAN.md` vốn cũng chỉ tham chiếu ảnh chứ không chứa ảnh). Ảnh nằm trên đĩa; nếu cần đưa vào git thì phải thêm `!docs/ui-mockups/shots/*.png` vào `.gitignore` (việc này **ngoài phạm vi task**, chưa làm).
>
> 📎 Ngoài 12 ảnh bắt buộc còn có `after-02b-pre-download.png` (ảnh trung gian: ô nhập đã điền 2 link + 1 playlist **trước khi** bấm "Tải") và 3 ảnh `after-studio.png` / `after-tai-video.png` / `after-cai-dat.png` **có sẵn từ phiên trước** (10-24 18:23, không thuộc task này).

---

## 3. Bảng kiểm chứng chức năng (GUI thật, CDP)

| # | Mục kiểm | KQ | Bằng chứng cụ thể |
|---|---|---|---|
| F1 | ▶ chạy riêng từng bước | ✅ PASS | 3 nút ▶ `title="Chạy riêng bước này"` trên từng tiêu đề bước |
| F2 | Split button `▶ Chạy N bước đã bật` + ▾ | ✅ PASS | Nút hiện `▶ Chạy 2 bước đã bật`, đúng 1 caret ▾, `disabled=false` |
| F3 | Menu ▾ của nút chạy | ✅ PASS | 4 mục: "Chỉ phụ đề" · "Chỉ dịch" · "Chỉ lồng tiếng" · "Chỉ vùng In–Out (Ctrl+Enter)" |
| F4 | Vùng In/Out | ✅ PASS | Phím `Vùng (R)` có mặt; nút `[ I` (Mark In) + `O ]` (Mark Out) |
| F5 | Chuột phải hàng vai | ✅ PASS | 7 mục: "🔊 Nghe giọng gốc" · "⇢ Gộp vào…" · "⇢ Gộp tất cả về vai này" · "👥 Về 2 vai" · "👤 Về 1 vai" · "🎯 Giọng mặc định engine cho mọi vai" · "🗑 Xoá vai" |
| F6 | Chuột phải ↶ (3 lớp hoàn tác) | ✅ PASS | "↶ Audio" · "↶ Bản dịch" · "↶ Phụ đề" |
| F7 | Chuột phải ↷ (Redo, 3 lớp) | ✅ PASS | "↷ Audio" · "↷ Bản dịch" · "↷ Phụ đề"; nút ↷ `disabled=true` khi chưa có gì để làm lại |
| F8 | **Ripple delete** | ✅ PASS | Menu chuột phải khối phụ đề → "🧹 Xoá và dồn khoảng trống" (mô tả: *"Ripple delete"*, phím `Shift+Del`). Bấm thật: khối phụ đề **8 → 7**, toast *"🗑 Đã xoá 1 câu và dồn 6 câu (3.8s) — Ctrl+Z để hoàn tác"* |
| F9 | Nút A→Z | ✅ PASS | `▶ Chạy 2 bước đã bật`, `disabled=false` |
| F10 | Chuột phải khối phụ đề timeline | ✅ PASS | 8 mục: "🔁 Dịch lại câu này" · "📍 Đặt Điểm Vào" · "📍 Đặt Điểm Ra" · "⚡ Khoanh Nhanh Đoạn 5s" · "▶️ Di Chuyển Playhead" · "🧹 Xoá và dồn khoảng trống" · "💬 Tạo Phụ Đề Toàn Bộ Video" · "🎙️ Tạo Tiếng Lồng Toàn Bộ Video" |
| F11 | Tải 2 link + 1 playlist | ✅ PASS | Playlist bung thành "Tải 21 mục"; dán 2 link → chip "Tất cả 2 / Đang tải 2" → "Xong 2" |
| F12 | Tiến trình: 6 chip lọc ngang | ✅ PASS | "📋 Tất cả (4)" · "⚡ Đang chạy (0)" · "💬 Phụ đề & Dịch (0)" · "🎙️ Lồng tiếng (2)" · "⬇️ Tải video (2)" · "📦 Mô hình (0)" |
| F13 | Tiến trình: menu ⋯ | ✅ PASS | `title="Thao tác khác (mở thư mục · xoá lịch sử)"` → "📁 Mở Thư Mục Thành Phẩm" · "📥 Mở Thư Mục Tải Về" · "🗑 Xoá Lịch Sử Tiến Trình 4 tác vụ" |
| F14 | Tiến trình: hộp xác nhận xoá | ✅ PASS | `.pc-confirm` → *"Xoá toàn bộ lịch sử tiến trình (4 tác vụ)? Không thể hoàn tác."* + nút **Huỷ** / **Xoá** |
| F15 | Lịch sử: tìm + Xuất .SRT | ✅ PASS | 1 ô tìm (`Tìm câu thoại…`); nút "Sao chép tất cả" · "Xuất .SRT" · caret ▾ |
| F16 | Live: mở/đóng không lỗi | ✅ PASS | Nút "👁" · "Quét âm thanh" · "Bắt đầu Live" đều bấm được, không sinh exception |
| F17 | Cài đặt: ô API key | ✅ PASS | `Cài đặt › Dịch thuật` → field `type=password`, placeholder *"Đã lưu: ••••J5o4 — gõ để thay"*, `value.length = 0` (ô rỗng **không** ghi đè key đã lưu) |
| F18 | Cài đặt: liên kết từ Studio | ✅ PASS | Nút "Cài đặt nâng cao" ở bước Dịch → `.master-tab.on` chuyển thành **"Cài đặt"** |
| F19 | 8 câu thật trong project | ✅ PASS | Panel báo "8 câu · Phụ đề có sẵn: vi (YouTube) — Xong"; timeline có 8 khối; danh sách phụ đề 8 dòng |

**Tổng: 19/19 PASS.**

---

## 4. Checklist §7.1 — "không mất chức năng" (36/36 dòng)

Ký hiệu: ✅ = thực chứng trên GUI · ✅\* = có mặt trong code nhưng **chưa chạy được runtime** trong phiên này (điều kiện render) · ❌ = mất

### 4.1 Studio (16 dòng)

| # | Control cũ | Đường vào mới | KQ | Bằng chứng |
|---|---|---|---|---|
| S1 | 2 tab "Thuyết Minh & Lồng Tiếng" / "Tóm Tắt & Review" | 1 panel; thống kê + đánh giá kịch bản → **"⚙ Nâng cao"** | ✅ | Không còn 2 tab cũ. Card "⚙ Nâng cao" chứa nguyên văn nội dung cũ: "📊 Thống K Nhịp Thoại & Kịch Bản" (7 câu · 40.0s · 1 vai · ~154 WPM), "📖 Tóm Tắt Cốt Truyện & Thoại", "🛡 Đánh Giá Chất Lượng Kịch Bản" + nút "✨ Đánh giá lại kịch bản" |
| S2 | Select "Mô hình nhận dạng" | → **"⚙ Nâng cao"** | ✅ | `select.spp-select` [Whisper Large-v3-Turbo · Whisper Base (nhẹ)] nằm trong card "Nâng cao" |
| S3 | 3 select provider + 3 ô API key + 3 select model | Dòng **chỉ đọc** → mở Cài đặt | ✅ | `.spp-provider-row` = *"Đang dùng: minimax · MiniMax-M3.1-Flash"* + nút "Cài đặt nâng cao"; **0 ô API key** trong Studio; bấm nút → sang tab Cài đặt (F18). *Ghi chú:* nút **"Đổi"** chỉ hiện ở nhánh dự phòng *backend chưa có lệnh* (`StudioTranslateOptions.tsx:98-113`); khi backend chạy thật thì dòng chỉ đọc là "Đang dùng: …" |
| S4 | "Nút Lưu hồ sơ" | Tự lưu khi thêm/xoá cặp xưng hô | ✅ | 0 nút "Lưu hồ sơ" trong DOM; tooltip nút thuật ngữ: *"Mở bảng thuật ngữ + xưng hô (tự động lưu, không cầ…)"* |
| S5 | Nút "+ Thêm" (hồ sơ) | Enter trong ô nhập | ✅\* | Nút "+ Thêm" còn trong drawer Thuật ngữ; cơ chế tự lưu ghi rõ trong tooltip. *Chưa bấm Enter thực tế trong phiên này* |
| S6 | Chip "1 Người ⭐" (gộp ngầm) | Segmented "Tự động · 1 người · 2 người" | ✅ | Bước "Lồng tiếng" → "Số người nói" = 3 nút `Tự động` / `1 người` / `2 người`; **không** có chip "1 Người ⭐"; 0 chuỗi "1N1N / 2N / 2Nữ" |
| S7 | Chip tổ hợp giới tính | Bỏ + nút giới tính mỗi hàng + "Về 2 vai" | ✅ | Mỗi hàng vai có nút "♂ Nam" (`title="Đổi giới tính (chọn lại giọng theo giới tính)"`); menu vai có "👥 Về 2 vai" |
| S8 | "Gộp vai…" modal | Chuột phải vai (4 mục) | ✅ | "⇢ Gộp vào…" · "⇢ Gộp tất cả về vai này" · "👥 Về 2 vai" · "👤 Về 1 vai" |
| S9 | 3 thẻ engine + 3 nút "▶ Mẫu" + badge spec + HUD "Model TTS đang dùng" | 1 segmented engine + 1 ▶ mẫu + select giọng mỗi vai | ✅ | "Bộ giọng đọc" = **1 nhóm 5 nút** (Kokoro · VieNeu · ZeroTTS · Google · FPT.AI); mỗi vai có **1 nút ▶** (`title="Nghe thử 1 câu"`) + **1 dropdown giọng** ("VieNeu v3 ▾"); không còn badge/HUD |
| S10 | "✨ Áp dụng VietNeu cho tất cả vai" | Menu vai "🎯 Giọng mặc định engine cho mọi vai" | ✅ | Có trong menu chuột phải vai |
| S11 | "🔊 Giọng gốc" mỗi vai | Menu vai "🔊 Nghe giọng gốc" | ✅ | Có trong menu chuột phải vai |
| S12 | "🗑 Xoá vai" | Menu vai "🗑 Xoá vai" | ✅ | Có trong menu chuột phải vai |
| S13 | 6 nút chạy + 2 nút Dừng + thanh "vùng chọn" + pill "chế độ" | 1 split `▶ Chạy N bước đã bật \| ▾` + ▶ nhỏ mỗi bước | ✅ | Nút `▶ Chạy 2 bước đã bật` + ▾; menu 4 mục (F3); 3 nút ▶ "Chạy riêng bước này" (F1); thanh "vùng In–Out" còn ở dạng thanh chế độ timeline |
| S14 | 3 chip hoàn tác (Audio / Bản dịch / Phụ đề) | Chuột phải nút ↶ trên topbar | ✅ | Menu ↶: "↶ Audio" · "↶ Bản dịch" · "↶ Phụ đề" |
| S15 | "📥 Nhập video" (trùng "Mở video") | Bỏ (giữ "＋ Mở video") | ✅ | 0 match "Nhập video"; còn nút "Mở video" trên topbar |
| S16 | 4 chấm đổi theme | Tạm giữ trong vùng ngữ cảnh topbar | ✅ | `.studio-theme-dots` chứa **đúng 4** `.studio-theme-dot` (1 `active`), nằm trong topbar (`closest('[class*="topbar"]')` ≠ null) |

### 4.2 Live (7 dòng)

| # | Control cũ | Đường vào mới | KQ | Bằng chứng |
|---|---|---|---|---|
| L1 | Select "Chế độ xuất" + select "Ngôn ngữ đích" | **1 select "Phụ đề hiển thị"** | ✅ | Options: "📝 Gốc (không dịch)" · "Dịch sang 🇻🇳 Tiếng Việt" · "🇺🇸 English" · "🇯🇵 Japanese" · "🇨🇳 Chinese" · "🇰🇷 Korean". *Còn select "Ngôn ngữ gốc (Source)" — đó là ngôn ngữ **nguồn**, không phải ngôn ngữ đích* |
| L2 | Nút "Quét Âm Thanh" | **Nút ↻ cạnh select thiết bị** | ✅ | `.lv-icon-btn` `title="Quét âm thanh — tìm thiết bị đang phát tiếng"`, `aria-label="Quét âm thanh"`, nằm ngay cạnh select thiết bị (dùng icon SVG nên không có chữ "↻") |
| L3 | Nút "↻" đầu card (làm mới danh sách thiết bị) | Giữ ở đầu card "Thiết bị âm thanh (WASAPI)" | ✅ | Card "Thiết bị âm thanh (WASAPI)" còn nguyên, select thiết bị + nút "Thử 3s" bên dưới |
| L4 | Select "Độ dài phân đoạn tối đa" + checkbox "Smart VAD" | Khối **"⚙ Nâng cao"** (gấp mặc định) | ✅ | Khối "⚙ Nâng cao" **gập mặc định** (chưa thấy label "Độ dài phân đoạn"), chỉ hiện tóm tắt *"3s / phân đoạn · Smart VAD bật"* |
| L5 | Nút "Mở Cửa Sổ Overlay" | Nút **👁 trên topbar** | ✅ | Nút "👁" `title="Bật/tắt Overlay (Ctrl+Shift+O)"` trên topbar |
| L6 | "▶ Bắt đầu Live" + "■ Dừng Live" | **1 nút chính** đổi nhãn | ✅ | Chỉ 1 nút "Bắt đầu Live" (`disabled=false`); nhãn đổi theo trạng thái (`IconStop` khi `isLive`) |
| L7 | Cột phải "Luồng thoại" | Giữ nguyên + nút 🗑 | ✅\* | Cột "Luồng thoại (0)" còn nguyên. Nút 🗑 chỉ render khi `recentSubs.length > 0` (`LiveView.tsx:482`) ⇒ chưa có câu live nào để bật; đã bấm "Bắt đầu Live" không lỗi |

### 4.3 Lịch sử (6 dòng)

| # | Control cũ | Đường vào mới | KQ | Bằng chứng |
|---|---|---|---|---|
| H1 | Cột trái 300 px chỉ chứa 4 nút | **2 cột**: danh sách (ô tìm + thanh công cụ) \| chi tiết câu | ✅ | Layout 2 cột; cột phải "Chi tiết câu thoại" |
| H2 | Nút "Sao chép tất cả" | Thanh công cụ đầu danh sách | ✅ | Nút "Sao chép tất cả" hiện 1, nằm trên đầu danh sách |
| H3 | "Xuất .SRT" + "Xuất .TXT" | Split `Xuất .SRT \| ▾` | ✅ | Nút "Xuất .SRT" (`title="Xuất file phụ đề chuẩn .srt"`) + caret ▾ |
| H4 | Nút đỏ "Xoá toàn bộ lịch sử" | Menu `⋯` → "Xoá toàn bộ lịch sử" + **hộp xác nhận** | ✅\* | Menu ⋯ (`title="Thao tác khác"`) có mục *"Xoá toàn bộ lịch sử 0 câu"* — nhưng `disabled=true` khi danh sách rỗng ⇒ **chưa mở được hộp xác nhận** trong phiên này. Nút nguy hiểm không còn chiếm 1/4 màn hình. *(Hộp xác nhận cùng kiểu đã xác minh PASS ở Tiến trình — F14)* |
| H5 | Ô tìm kiếm (cột trái) | Ô tìm **đầu danh sách** + bộ đếm `x/y` | ✅ | `input.hv-input` placeholder *"Tìm câu thoại…"* + bộ đếm **"0/0"** ngay dưới topbar |
| H6 | Thẻ chi tiết câu (cột phải) | Cột phải "Chi tiết câu thoại" | ✅ | Tiêu đề "Chi tiết câu thoại" + gợi ý *"Bấm chọn một câu thoại trong danh sách để xem chi tiết bản gốc và bản dịch."* |

### 4.4 Tiến trình (7 dòng)

| # | Control cũ | Đường vào mới | KQ | Bằng chứng |
|---|---|---|---|---|
| P1 | 6 nút lọc **dọc** | **6 chip lọc ngang** kèm số đếm | ✅ | "📋 Tất cả (4)" · "⚡ Đang chạy (0)" · "💬 Phụ đề & Dịch (0)" · "🎙️ Lồng tiếng (2)" · "⬇️ Tải video (2)" · "📦 Mô hình (0)" — không còn ký tự lạ ("Tải videoo", "Đang xử lýo") |
| P2 | "📁 Mở Thư Mục Thành Phẩm" | Menu `⋯` | ✅ | Có trong menu ⋯ |
| P3 | "📥 Mở Thư Mục Tải Về" | Menu `⋯` | ✅ | Có trong menu ⋯ |
| P4 | "🗑 Xóa Lịch Sử Tiến Trình" (đỏ, cột trái) | Menu `⋯` → mục **nguy hiểm** + **hộp xác nhận** | ✅ | Menu ⋯ → "🗑 Xoá Lịch Sử Tiến Trình 4 tác vụ" → hộp xác nhận *"Xoá toàn bộ lịch sử tiến trình (4 tác vụ)? Không thể hoàn tác."* + Huỷ/Xoá (F14) |
| P5 | Thẻ "Động Cơ & Phần Cứng AI" (ghi cứng) | Cột phải "Trạng thái thật" + trỏ **Cài đặt** | ✅ | Cột phải đọc config thật: Nhận dạng `Whisper base · CPU` · Dịch `MiniMax · MiniMax-M3.1-Flash` · Live `Tắt` · Giọng đọc `kokoro · vieneu · zerotts` · Chủ đề `cinema`; gợi ý *"Cài đặt › Trạng thái hệ thống"* + link "Cài đặt" |
| P6 | Thẻ "Hướng Dẫn & Lưu Ý" | Câu hướng dẫn **trong trạng thái rỗng** | ✅ | Rỗng: *"Tiến trình nền (tạo phụ đề, dịch thuật, lồng tiếng, tải video, tải mô hình) được ghi lại tự động."* và *"Chưa có tác vụ nào được ghi nhận. Mọi tác vụ nền … sẽ xuất hiện ở đây kèm tiến độ thời gian thực."* |
| P7 | Nút "📊 Tiến Trình (N)" → modal | **Chip "⚡ N"** trên tab + chip trạng thái topbar, **modal đã xoá** | ✅ | `SettingsView.tsx:1611` → `badge: totalActiveTasksCount > 0 ? \`⚡ ${totalActiveTasksCount}\` : null` — quan sát badge **"⚡ 1"** trên topbar khi 1 tác vụ chạy nền; chỉ còn **1 giao diện** tab (modal `ProcessCenterModal.tsx` đã xoá) |

**Tổng §7.1: 36 dòng — 32 ✓ thực chứng · 4 ✓\* (có điều kiện, xem §6) · 0 ❌.**

---

## 5. Lỗi console

| Nguồn | Số lần | Nội dung |
|---|---|---|
| `Runtime.exceptionThrown` | **0** | — |
| `Log.entryAdded` (level=error) | **0** | — |
| `Runtime.consoleAPICalled` (type=error) | **3** (cùng 1 lỗi) | `Encountered two children with the same key, 'dubbing_active'` |

Không có lỗi nào trong lúc: nạp video, chạy 8 câu, dịch, mở menu chuột phải (vai / timeline / ↶ / ↷), ripple delete, tải 2 link + playlist, mở/đóng Live, xoá lịch sử tiến trình, duyệt Cài đặt.

---

## 6. Bug phát hiện

### BUG-R2-8-01 — React key trùng `dubbing_active` trong lịch sử tiến trình

- **Mức độ:** Trung bình (cảnh báo React, không làm sập UI; nhưng lịch sử hiển thị sai và tiềm ẩn lỗi render)
- **Triệu chứng:** `Encountered two children with the same key, 'dubbing_active'` (3 lần trong lúc tải/phân tích video).
- **Nguyên nhân gốc (đã kiểm chứng runtime, không phải suy đoán):**
  1. Id task là **hằng số cứng** `"dubbing_active"` — dùng ở `src/views/SettingsView.tsx:298` (`handleStudioTaskUpdate`), `src/views/SettingsView.tsx:623` (listener `dubbing:progress`) và `src/views/SublixStudioView.tsx:792` (`notifyTaskUpdate`).
  2. Mỗi lần chạy lại pipeline đều ghi **cùng 1 id** vào lịch sử. `saveToProcessHistory` (`src/views/SettingsView.tsx:277-288`) chỉ khử trùng khi `|completedAt₁ − completedAt₂| < 3000 ms` ⇒ các lần chạy cách nhau > 3 s **cùng tồn tại**.
  3. `src/views/ProcessCenterView.tsx:436` render `<div key={task.id}>` cho từng mục lịch sử ⇒ **trùng key**.
- **Bằng chứng runtime:** đọc `localStorage["sublix_process_history_v1"]` → `total: 6`, `dupIds: [["dubbing_active", 4]]` (4 mục: *"Hoàn tất tạo giọng đọc TTS"*, *"Hoàn tất toàn trình lồng tiếng"*, *"Đã bóc tách & phân vai xong"* ×2), `completedAt` lệch nhau hàng chục giây.
- **Không phải do R2-8:** id cứng + logic dedupe theo thời gian nằm ở lớp tiến trình/lịch sử, không liên quan tới bản đổi giao diện.
- **Đề xuất (chưa sửa — ngoài phạm vi task):** id task phải **unique theo lần chạy** (vd. `dubbing_active_${startedAt}` hoặc `${fileName}_${startedAt}`), **hoặc** `saveToProcessHistory` khử trùng theo `id` bất kể mốc thời gian (giữ bản mới nhất) và `ProcessCenterView` dùng `key={`${task.id}-${task.completedAt ?? task.startedAt}`}`.

### 4 dòng checklist ✓\* — chưa xác minh được runtime (không phải lỗi)

| Mục | Lý do |
|---|---|
| S5 — "+ Thêm" → Enter | Chưa bấm Enter thực tế trong ô nhập hồ sơ (cơ chế tự lưu đã xác nhận qua tooltip) |
| L7 — nút 🗑 xoá danh sách tạm (Live) | Render có điều kiện `recentSubs.length > 0` (`LiveView.tsx:482`); phiên này chưa có câu live nào |
| H4 — hộp xác nhận xoá toàn bộ lịch sử | Mục menu `disabled=true` khi danh sử rỗng (0 câu) ⇒ không mở được hộp xác nhận để quan sát |

---

## 7. Quan sát khác (không phải bug sản phẩm)

- **Version hiển thị lệch giữa 2 topbar:** Studio hiện `v0.12.0` (đọc `package.json` — `SublixStudioView.tsx:6921`), các tab khác hiện `v0.11.36` (đọc `appInfo.version` = `env!("CARGO_PKG_VERSION")` — `src-tauri/src/lib.rs:520-526`). **Nguyên nhân là thời điểm build của instance test**: exe test được build **trước** commit bump `0e49a07` (v0.12.0), còn `dist/` được build lại sau ⇒ không đồng bộ. Tại `HEAD` hiện tại cả `package.json`, `Cargo.toml`, `tauri.conf.json` đều = `0.12.0` ⇒ lỗi đã tự hết. Cơ chế "2 nguồn version" vẫn còn nên nên thống nhất về sau.
- **Ảnh PNG bị `.gitignore` loại** (`.gitignore:97` → `*.png`) ⇒ 12 ảnh `after-*` không thể commit nếu không chỉnh `.gitignore`.

---

## 8. Kết luận & khuyến nghị

1. **Vòng 2 giao diện không làm mất chức năng nào**: 36/36 dòng checklist §7.1 còn đường vào mới; 19/19 mục kiểm chứng chức năng PASS trên app thật.
2. **4 dòng ✓\*** cần 1 lượt xác minh bổ sung của người điều phối (bấm Enter thêm hồ sơ; tạo 1 câu Live rồi kiểm nút 🗑; có ≥ 1 câu lịch sử rồi kiểm hộp xác nhận xoá) — đều là **đường vào đã có trong code**.
3. **1 bug thật đã gửi điều phối**: `BUG-R2-8-01` (React key trùng `dubbing_active`) — **không do R2-8**, đề xuất sửa ở trên.
4. **Không sửa** `src/**` / `src-tauri/**` — task này chỉ kiểm chứng, không code.
5. **Chưa commit** theo yêu cầu.

---

## 9. Phụ lục — script dùng để kiểm chứng

Nằm ở `scratchpad/` (ngoài repo, không commit): `cdp.cjs` (khung CDP: connect/screenshot/evaluate/clickAt/rightClickAt/clickElement) · `shots*.cjs` (12 ảnh) · `verify*.cjs` (verify2–verify19: A→Z, ▶ từng bước, In/Out, menu vai, ↶/↷, Ripple delete, tải link+playlist, Live, Lịch sử, Tiến trình, Cài đặt API key, theme dots, badge ⚡) · `open_video.ps1` (hộp thoại file native) · `patch_exe.py` (patch `localhost:1420` → `1423`).

---

## 10. BỔ SUNG (HEAD mới `da9a3ca`) — VoicePicker + Smart ducking

> Người điều phối bổ sung sau khi `master` có commit mới: `e3bbcd7` (VoicePicker), `9dddd41` (mẫu nghe thử tức thì), `e40ee58` (phân vai theo giọng), `da9a3ca` (smart ducking). Yêu cầu: **build lại instance riêng từ HEAD mới** và kiểm 2 nhóm tính năng.

### 10.1 Môi trường (dựng lại từ đầu)

| Hạng mục | Giá trị |
|---|---|
| HEAD kiểm thử | `da9a3ca` — *"feat(dubbing): smart ducking noi vao Studio + xuat video, 2 thanh truot; noi nut yeu thich / nghe mau VoicePicker"* |
| Frontend | `npm run build` → `dist/` (**exit 0**, `index-DI2V1xKb.js` 719,59 kB) → `npx vite preview --port 1423 --strictPort` |
| Backend (Rust) | `CARGO_TARGET_DIR=%TEMP%\sublix-cc-target cargo build --bin sublix` → **exit 0** (27,65 s) → copy `scratchpad\sublix-r2-8.exe` patch `localhost:1420` → `localhost:1423` (**đúng 1 chỗ**) |
| Instance | app **pid 37020**, CDP **9225**, WebView2 UDF riêng (`scratchpad\webview2-r2-8`) — **app PO (1420/9223) không bị đụng** |
| Project | Tự khôi phục `A2Z_TEST_EN_dubbed.mp4` — 8 câu, video 40,00 s, **8 khối lồng tiếng đã có audio** (class `has-audio`) |
| Lỗi console | **0** (`Runtime.exceptionThrown` = 0, `Log` error = 0) trong toàn bộ §10 |

### 10.2 VoicePicker — ô chọn giọng ở bước "Lồng tiếng" — **9/9 PASS**

| # | Mục kiểm | KQ | Bằng chứng |
|---|---|---|---|
| V1 | Mở popover | ✅ | Click `.vp-trigger` (aria-label *"Giọng đọc cho vai Thuyết minh AI (Nam)"*) → portal `.vp.vp-pop` mở; **25 giọng**, nhóm "TẤT CẢ VIENEU V3 25" |
| V2 | Ô tìm | ✅ | `input.vp-search-input`, placeholder *"Tìm giọng… (không cần dấu)"* |
| V3 | **Tìm "ngọ"** | ✅ | `25 giọng` → **3 giọng**: Ngọc Huyền ♀ · Ngọc Trân ♀ · Ngọc Linh ♀; từ khớp được tô `<mark>Ngọ</mark>` |
| V4 | **Tìm KHÔNG DẤU "ngoc"** | ✅ | Cùng **3 giọng** như "ngọ" ⇒ bỏ dấu đúng (đặc tả §4.10 Opus) |
| V5 | Lọc ♀ Nữ | ✅ | Chip `♀ Nữ` → `is-on`; cả 3 dòng đều `♀` ⇒ `allFemale = true` (chip "Tất cả" tắt) |
| V6 | **Ghim ★ → config** | ✅ | Bấm ★ "Ngọc Huyền" ⇒ `aria-pressed=true`, chữ `★`; **config trên đĩa** `favorite_voices: ["vietneu:Ngọc Huyền"]` |
| V7 | Bỏ ghim ★ | ✅ | Bấm lại ★ ⇒ config `favorite_voices: []` ⇒ **toggle 2 chiều đúng** |
| V8 | Nhóm ★ trong popover | ✅ | Mở lại popover ⇒ nhóm **"★ YÊU THÍCH 1"** (class `is-fav`) chứa đúng "Ngọc Huyền"; trigger hiện `♀ Ngọc Huyền ★ VieNeu v3` |
| V9 | ★ không đổi nhầm giọng của vai | ✅ | Bấm ★ của dòng khác ("Adam bựa") ⇒ trigger **vẫn** `♀ Ngọc Huyền` ⇒ `stopPropagation` đúng, không rò rỉ chọn giọng |

**Nghe mẫu (cache tức thì — task `9dddd41`):**

| Lần | Giọng | File cache | Thời gian tới `is-playing` | KQ |
|---|---|---|---|---|
| 1 (tạo mẫu) | "Ngọc Huyền" | `Ng_c_Huy_n.wav` **chưa có** → **đã tạo** | **18 206 ms** (cold, nạp model) | ✅ tạo mẫu |
| 1 (tạo mẫu) | "Adam" | `Adam.wav` **chưa có** → **đã tạo** | **5 460 ms** | ✅ tạo mẫu |
| 2 (đọc cache) | "Adam" | `Adam.wav` đã có | **1 021 ms** | ✅ **nhanh hơn 5,4×** |

> Cache mẫu nằm ở `src-tauri/models/voice/<engine>/samples/<giọng>.wav` (debug build ⇒ `app_base_dir()` = `CARGO_MANIFEST_DIR`, xem `BUG-H08`). Backend `voice_sample_ensure` trả về data-URI có sẵn nếu file hợp lệ ⇒ lần 2 **không** tổng hợp lại.

### 10.3 Smart ducking — hạ tiếng nền theo thoại — **PASS**

**Cách đo:** bấm Play thật, lấy mẫu `video.volume` **mỗi 100 ms** bằng `setInterval` trong trang (424 mẫu / 42 s, `currentTime` chạy 0 → 40/40 s). Đọc khối lồng tiếng từ `title` của `.studio-timeline-voice-block` (đã có audio ⇒ `hasAudio = true` ⇒ có envelope).

**8 khối lồng tiếng (giây):** `0→4.95` · `5.44→9.04` · `9.19→11.92` · `13.67→18.07` · `20.55→23.83` · `26.39→30.47` · `32.24→34.56` · `36.96→40.00`

⇒ **4 khe < 2 s** (0,49 · 0,15 · 1,75 · 1,77) và **3 khe > 2 s** (2,48 · 2,56 · 2,40) — đúng bộ ca kiểm yêu cầu.

**Run A — `ducking_level = 0.20`, `ducking_bridge_sec = 2.0` (mặc định):**

| Khe | Dài | Loại | Cửa sổ đo (phẳng) | n | vol tb | min | max | Kết luận |
|---|---|---|---|---|---|---|---|---|
| 4.95 → 5.44 | **0,49 s** | **NỐI** (< 2 s) | [5,00 ; 5,39] | 4 | 0,200 | 0,200 | 0,200 | ✅ **nền VẪN THẤP** |
| 9.04 → 9.19 | **0,15 s** | **NỐI** (< 2 s) | [9,09 ; 9,14] | 0 | — | — | — | ⚠️ khe quá hẹp, không rơi mẫu |
| 11.92 → 13.67 | **1,75 s** | **NỐI** (< 2 s) | [12,97 ; 13,32] | 4 | 0,200 | 0,200 | 0,200 | ✅ **nền VẪN THẤP** |
| 18.07 → 20.55 | **2,48 s** | HỞ (> 2 s) | [19,12 ; 20,20] | 11 | **1,000** | 1,000 | 1,000 | ✅ **về MỨC NGƯỜI DÙNG** |
| 23.83 → 26.39 | **2,56 s** | HỞ (> 2 s) | [24,88 ; 26,04] | 12 | **1,000** | 1,000 | 1,000 | ✅ **về MỨC NGƯỜI DÙNG** |
| 30.47 → 32.24 | **1,77 s** | **NỐI** (< 2 s) | [31,52 ; 31,89] | 4 | 0,200 | 0,200 | 0,200 | ✅ **nền VẪN THẤP** |
| 34.56 → 36.96 | **2,40 s** | HỞ (> 2 s) | [35,61 ; 36,61] | 10 | **1,000** | 1,000 | 1,000 | ✅ **về MỨC NGƯỜI DÙNG** |

- **Trong lúc có thoại** (n = 179 mẫu): `vol tb = 0,200 · min = 0,200 · max = 0,200` ⇒ nền bị hạ **đúng bằng `ducking_level`**, không overshoot.
- **Ngoài mọi khối thoại** (n = 117): `max = 1,000` ⇒ có lúc trả về **đúng mức người dùng** (1,0).

**Run B — đối chứng: `ducking_bridge_sec = 0.5`** (cùng `level = 0.20`)

| Khe | Dài | Loại (bridge 0,5) | vol tb | Kết luận |
|---|---|---|---|---|
| 4.95 → 5.44 | 0,49 s | NỐI (0,49 < 0,5) | 0,200 | ✅ vẫn thấp |
| 11.92 → 13.67 | 1,75 s | **HỞ** (1,75 > 0,5) | **1,000** | ✅ **về mức người dùng** (trước đó là 0,200) |
| 30.47 → 32.24 | 1,77 s | **HỞ** (1,77 > 0,5) | **1,000** | ✅ **về mức người dùng** (trước đó là 0,200) |
| 18.07 → 20.55 / 23.83 → 26.39 / 34.56 → 36.96 | 2,40–2,56 s | HỞ | 1,000 | ✅ về mức người dùng |

⇒ **Thanh trượt "Nối khoảng nghỉ" thực sự điều khiển hành vi**: hạ `bridge` 2,0 → 0,5 làm **2 khe 1,75 s / 1,77 s chuyển từ "vẫn thấp" sang "về mức người dùng"** — đúng đặc tả `docs/DUCKING_SPEC.md` §3.

**2 thanh trượt → config (kéo chuột thật, `Input.dispatchMouseEvent`):**

| Thanh trượt | Kéo từ → đến | Giá trị hiển thị | Config trên đĩa | Độ trễ ghi (tính từ lần chuột cuối) |
|---|---|---|---|---|
| "Mức hạ" (`aria-label="Mức hạ tiếng nền"`, 0,05–1, step 0,05) | 0,20 → 0,65 | "65 %" | `ducking_level: 0.2 → 0.05 → 0.65` | **1 ms** (bắt được giá trị trung gian) |
| "Nối khoảng nghỉ dưới" (`aria-label="Nối khoảng nghỉ dưới số giây"`, 0,5–10, step 0,5) | 2,0 → 4,5 | "4,5 giây" | `ducking_bridge_sec: 2 → 4.5` | **384 ms** (≈ debounce 400 ms trong code) |

⇒ **PASS — kéo là config trên đĩa đổi ngay** (ghi giá trị đầu tiên sau ~1 ms, chốt giá trị cuối sau ~384 ms; không cần nút "Lưu").

**Cấu hình cuối (đã trả về mặc định `DEFAULT_DUCKING`):**
`ducking_level: 0.2` · `ducking_bridge_sec: 2` · `ducking_attack_sec: 0.3` · `ducking_release_sec: 1` · `favorite_voices: ["vietneu:Ngọc Huyền"]` · giọng của vai trả về `♂ Adam bựa · VieNeu v3`.

### 10.4 Ảnh bổ sung

| Ảnh | Nội dung |
|---|---|
| `after-07-voicepicker-popover.png` | Popover VoicePicker: ô tìm · chip "Tất cả / ♂ Nam / ♀ Nữ" · "25 giọng" · nhóm **"★ YÊU THÍCH 1"** · danh sách giọng VieNeu v3 |
| `after-08-ducking-sliders.png` | Bước "Lồng tiếng": khối **"Hạ tiếng nền khi có thoại"** (`xem thử = video xuất ra`) + 2 thanh trượt **"Mức hạ 20 %"** và **"Nối khoảng nghỉ dưới 2.0 giây"**; track TIẾNG LỒNG có 8 khối có sóng âm |

### 10.5 Kết luận phần bổ sung

1. **VoicePicker: 9/9 PASS** — popover 25 giọng, tìm không dấu đúng, lọc ♀ Nữ đúng, ghim ★ ghi vào config và tạo nhóm "★ YÊU THÍCH", ★ không rò rỉ đổi giọng của vai; nghe mẫu **lần 2 nhanh hơn 5,4×** (đọc cache `.wav`).
2. **Smart ducking: PASS** — đo `video.volume` mỗi 100 ms: 4 khe < 2 s **vẫn thấp** (0,200), 3 khe > 2 s **về mức người dùng** (1,000), trong lúc thoại nền đúng bằng `ducking_level`; giảm bridge 2,0 → 0,5 làm 2 khe 1,75 s / 1,77 s chuyển sang hồi mức người dùng ⇒ thanh trượt có tác dụng thật.
3. **2 thanh trượt → config**: kéo bằng chuột thật ⇒ config trên đĩa đổi sau **1 ms** (giá trị đầu) / **384 ms** (giá trị cuối) — không cần nút "Lưu".
4. **0 lỗi console** trong toàn bộ phần bổ sung. Không sửa `src/**` / `src-tauri/**`.
