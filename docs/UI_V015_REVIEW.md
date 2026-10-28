# Duyệt giao diện v0.15 — tab con "Khám phá" (so với §4.13)

> Người duyệt: Opus (thiết kế) · 2026-10-29 · TSK-V015-UI-REVIEW.
>
> **Đã đối chiếu:**
> - Thiết kế: `docs/UI_REDESIGN_PLAN.md` §4.13, `docs/ui-mockups/v015-discovery.html`.
> - 4 ảnh app thật: `shots/v015-app-dang-hot.png`, `-tim-bilibili.png`, `-tim-youtube.png`, `-mo-studio.png`.
> - Code: `src/views/discovery/**` và phần tab con trong `src/views/DownloaderView.tsx` (đọc ở HEAD `5a46dda`, đã gồm `f5b5293`: công tắc tự dịch và đơn vị nghìn/triệu/tỷ).
>
> **Cách xem ảnh:** ảnh 1920 px nhưng app chạy scale 150 %, tức bề rộng thật ≈ **1280 px CSS**. Vì vậy ảnh đang ở nhánh `@media (max-width: 1280px)`, lưới 4 cột là đúng.
>
> Không sửa code, không chạy app. Mỗi mục ghi: **chỗ nào · đang thế nào · nên thế nào · file/class gợi ý**.

## 0. Tóm tắt

**Bố cục khớp thiết kế:**
- tab con gạch chân;
- segmented nguồn + ô tìm + nút ⌕;
- hàng chip Douyin có ô hạng top 3 màu cam và nhãn Nóng;
- nút danh sách, kết quả tìm dạng nút viền đứt `⌕ "…" ✕`;
- YouTube "Đang hot 🔒";
- thẻ 16:9 với tiêu đề cố định 2 dòng, lượt xem và thời gian;
- `DownloaderView` luôn được mount.

Phần logic thuần (`discoveryModel.ts`) gọn và test được.

**Lỗi cần sửa trước khi phát hành:**
- **Có 4 lỗi P1:**
  - Mở app thì bị tự nhảy sang Studio và mở lại tab cho các mục cũ.
  - Thẻ đầu tiên luôn ở trạng thái focus và che ảnh.
  - Lưới cướp focus khỏi ô tìm sau mỗi lần tìm.
  - Dòng "Hết · N video" hiện cả khi vẫn còn trang sau.
- **10 mục P2** và **12 mục P3** ở dưới.

**Câu PO chưa chốt ("Tải & mở Studio" tự chuyển màn):** khuyên **không** tự chuyển. Lý do và cách làm ở §1.

## 1. Đánh giá việc "Tải & mở Studio" tự chuyển sang Studio

**Hiện trạng (code):**
- `DiscoveryView.tsx:121-135`: khi một mục có cờ `openInStudio` chuyển sang `completed`, code gọi `onOpenStudio(filePath)`.
- Hàm này là `onNavigateToStudio` → `handleRouteToStudio` (`SettingsView.tsx:175-185`), trong đó gọi `setActiveTab("studio")`.
- Kết quả: **lúc tải xong**, app nhảy sang Studio, không phụ thuộc người dùng đang ở đâu (Live, Cài đặt, đang gõ ô tìm…). Đó là vì `DownloaderView` luôn được mount nên effect vẫn chạy.
- Toast "✓ Xong … — đã mở tab trong Studio · Đi tới Studio" lại nằm **trong** `DiscoveryPanel`, nên sau khi nhảy màn thì người dùng không thấy toast. Nút "Đi tới Studio" cũng thừa vì đã ở Studio rồi.

**Khuyên: bỏ tự chuyển, quay về thiết kế (ở lại + toast).** Lý do:
1. **Thời điểm tải xong không do người dùng chọn.** Video Bilibili 1–3 giờ mất vài phút để tải. Lúc tải xong, người dùng thường đang làm việc khác: lướt thẻ tiếp, gõ từ khoá, đã sang Live hoặc Cài đặt. Bị kéo đi giữa lúc gõ là lỗi khó chịu nhất kiểu "UI tự di chuyển".
2. **Người dùng thường bấm nhiều thẻ một lúc.** Bấm "Tải & mở Studio" cho 3 video thì sẽ bị kéo sang Studio 3 lần, mỗi lần một thời điểm khác nhau.
3. **Đang sửa dở trong Studio** (ví dụ tab khác đang lồng tiếng) mà bị đổi tab đang mở thì mất ngữ cảnh. §4.11 đã có quy tắc "tab mới chèn sau tab đang mở, có chấm xanh 'xong chưa xem'", chính là để không cần nhảy màn.
4. **Khác với Xưởng AI (§4.14):** ở đó người dùng chủ động bấm "Mở trong Studio" ngay lúc đó, nên chuyển màn là đúng. Ở Khám phá, hành động xảy ra sau vài phút nên phải hỏi bằng toast.

**Nên làm thế nào:**
- **Host** (`SettingsView.tsx`): thêm lối mở tab Studio **không kích hoạt**, ví dụ `handleRouteToStudio(path, { activate: false })`. Lối này đẩy `studioOpenRequest` với `activate: false` để `StudioTabStrip` tạo tab mới (chấm xanh "xong chưa xem"), nhưng không gọi `setActiveTab("studio")`.
- **Toast phải nằm ở cấp app**, không nằm trong `DiscoveryPanel`, để người dùng thấy dù đang ở tab nào:
  - Nội dung: "✓ Đã tải xong "…" — đã mở tab trong Studio · **Đi tới Studio** (Enter) · ✕".
  - Tự ẩn sau khoảng 8 s; rê chuột vào thì dừng đếm.
  - Có 2 hay 3 mục cùng xong thì gộp thành 1 toast ("2 video đã mở tab trong Studio · Đi tới Studio").
- Nếu PO vẫn muốn chuyển ngay, chỉ chấp nhận một ngoại lệ: chuyển **khi người dùng vẫn đang ở tab con Khám phá và focus không nằm ở ô nhập**. Mọi trường hợp khác dùng toast. Kể cả vậy, tôi vẫn khuyên toast-only vì dễ đoán hơn.
- **Phải sửa trước** lỗi P1-1 dưới đây, vì nó làm hành vi tự chuyển xảy ra cả khi vừa mở app.

## 2. P1 — sai / khó dùng (sửa trước khi phát hành)

**P1-1. Mở app ⇒ tự nhảy sang Studio và mở lại tab cho mọi mục cũ đã tải bằng "Tải & mở Studio"**
- **Chỗ nào:**
  - `DiscoveryView.tsx:119-135` (effect tự mở);
  - `DownloaderView.tsx:319-340` (nạp lại lịch sử `sublix_downloads_history_v1`);
  - `DownloaderView.tsx:783-798` (`discoveryDlStates` lấy từ toàn bộ `items`).
- **Đang thế nào:**
  - `items` được nạp lại từ localStorage, gồm các mục `completed` còn giữ `openInStudio: true`.
  - `autoOpenedRef` là ref trong bộ nhớ, nên bị rỗng mỗi lần mở app.
  - Effect chạy ngay khi mount, gọi `onOpenStudio` cho **từng** mục cũ đó, nên app nhảy sang Studio và mở N tab ngay khi khởi động.
  - Ảnh `v015-app-mo-studio.png` đã có 5 tab, khớp với dấu hiệu này. Lập luận trên dựa vào code; tôi chưa chạy thử.
- **Nên thế nào:** chỉ mở **một lần trong đời mục**.
  - Khi mở xong, ghi `studioOpened: true` (hoặc đặt `openInStudio = false`) vào chính `DownloadItem` qua `setItems`, để giá trị này được lưu cùng lịch sử.
  - Effect chỉ xét mục có `openInStudio && !studioOpened`.
  - Thêm một lớp an toàn: bỏ qua mục đã `completed` **ngay lúc mount**, chỉ xử lý mục chuyển sang `completed` trong phiên này (so với trạng thái lần render trước).
- **File:** `DiscoveryView.tsx` (effect), `DownloaderView.tsx` (kiểu `DownloadItem`, hàm `markStudioOpened(id)` truyền xuống).

**P1-2. Thẻ đầu lưới luôn ở trạng thái "focus" ⇒ viền vàng + lớp nút che ảnh vĩnh viễn**
- **Chỗ nào:** `VideoGrid.tsx:174` (`focused={index === focusIndex}`), cộng với `discovery.css:568-572` (`.dsc-card-focus .dsc-hover { opacity: 1 }`) và `:443` (outline).
- **Đang thế nào:** `focusIndex` mặc định bằng 0, nên thẻ 0 luôn nhận `dsc-card-focus` dù focus thật không ở lưới. Cả 3 ảnh danh sách đều cho thấy thẻ đầu có viền vàng và 2 nút che mất ảnh. Người dùng tưởng thẻ đầu đang được chọn hoặc đang tải.
- **Nên thế nào:**
  - `focused` chỉ đúng khi **lưới đang có focus DOM**: giữ state `gridHasFocus` qua `onFocus`/`onBlur` (`relatedTarget` nằm ngoài lưới), hoặc dùng CSS `:focus-visible`/`:focus-within`.
  - Đề xuất: bỏ class `dsc-card-focus`, đặt tabIndex lên chính `.dsc-card` thay cho div bọc, rồi dùng `.dsc-card:focus-visible` (outline) và `.dsc-card:focus-visible .dsc-hover, .dsc-card:focus-within .dsc-hover` (hiện nút).
  - Như vậy bấm chuột vào thẻ sẽ không hiện viền; chỉ bàn phím mới hiện.
- **File:** `VideoGrid.tsx`, `VideoCard.tsx`, `discovery.css`.

**P1-3. Lưới cướp focus khỏi ô tìm sau mỗi lần tìm / đổi danh sách**
- **Chỗ nào:** `VideoGrid.tsx:95-98` (effect `[focusIndex]` chạy cả lúc mount và gọi `el.focus()`), kết hợp `useDiscoveryList.ts:156` (`setItems([])` khi tải lại).
- **Đang thế nào:**
  - Mỗi lần tải mới, `items` rỗng nên `DiscoveryView` hiện skeleton và lưới **unmount**.
  - Có kết quả thì lưới mount lại, effect chạy và `focus()` vào thẻ 0. Người dùng vừa Enter để tìm thì con trỏ rời ô tìm; gõ tiếp (sửa từ khoá) sẽ không vào ô, mà phím mũi tên lại di chuyển trong lưới.
  - Lỗi này cũng làm P1-2 nặng hơn, vì thẻ 0 có focus thật.
- **Nên thế nào:**
  - Không focus lúc mount. Effect `[focusIndex]` chỉ gọi `focus()` khi focusIndex **đổi do phím** (bỏ qua lần đầu bằng ref `didMount`), hoặc chuyển việc focus vào ngay trong `onKeyDown`/`focusCard`.
  - Focus thẻ đầu chỉ khi có `focusRequest` (↓ / Esc từ ô tìm), đúng như bảng phím §4.13.
- **File:** `VideoGrid.tsx`.

**P1-4. "Hết · 20 video · Lên đầu ↑" hiện ngay sau trang đầu dù còn trang sau; nút "Lên đầu" không cuộn**
- **Chỗ nào:** `DiscoveryView.tsx:289-300`.
- **Đang thế nào:**
  - Điều kiện chỉ là `gridHasItems && !list.loading`, nên ở "Đang hot" (20/trang, còn tới 10 trang) vạch "Hết" vẫn hiện ở đáy lưới.
  - Cùng chỗ đó, sentinel cuộn vô hạn đang tải trang sau, nên người dùng thấy "Hết" rồi lại thấy thêm thẻ: nói sai.
  - `window.scrollTo` cuộn `window`, nhưng vùng cuộn thật là pane của tab (div có overflow), nên rất có thể bấm không có tác dụng.
- **Nên thế nào:**
  - Chỉ hiện khi `!list.hasMore && !list.loadingMore`.
  - "Lên đầu" cuộn đúng phần tử cuộn: `rootRef.current?.closest(".dl-hubpane")` (hoặc phần tử cuộn gần nhất) rồi `.scrollTo({ top: 0, behavior: "smooth" })`, sau đó focus ô tìm.
  - Thêm `aria-live` cho vạch "Hết".
- **File:** `DiscoveryView.tsx`.

## 3. P2 — lệch thiết kế rõ

| # | Chỗ nào | Đang thế nào | Nên thế nào | File / class |
|---|---|---|---|---|
| P2-1 | Thẻ **đã tải** / **lỗi tải**: lớp nút khi rê | Lớp rê vẫn là `⬇ Tải về` + `🎬 Tải & mở Studio` với mọi trạng thái. Thẻ đã tải mà bấm thì **tải lại lần nữa**: `guard` chỉ chặn lúc đang tải, còn `queueEntries` chỉ khử trùng mục đang chạy. Thẻ lỗi ghi "bấm ↻ Thử lại" nhưng không có nút ↻ nào | Theo §4.13 mục 6:<br>• **Đã tải:** lớp rê = `🎬 Mở trong Studio` (chính) + `📁` (mở thư mục); bỏ nút "Mở trong Studio" ở dòng 2 cho khỏi trùng.<br>• **Lỗi:** lớp rê = `↻ Thử lại` (chính) + `⬇ Tải về`.<br>• **Đang tải:** lớp rê = `■ Huỷ` (hoặc ẩn) + nhãn "⬇ 46 %". | `VideoCard.tsx:142-159, 173-191` |
| P2-2 | Không có **nhãn trạng thái trên ảnh** (⏳ Đang đợi · ⬇ 46 % · ✓ Đã tải · ! Lỗi) và nhãn "🎬 mở Studio khi xong" | Trạng thái chỉ là chữ nhỏ `dsc-dl` lẫn ở cuối dòng tên kênh; chỉ có thanh 3 px ở đáy ảnh | Thêm pill góc trên-trái ảnh theo mockup D (`.stp`: nền đen 78 %, `--ok-txt`/`--dang-txt`) và pill góc trên-phải "🎬 mở Studio khi xong" khi `openInStudio`. Viền thẻ đã tải là `--ok-br` (đã có) | `VideoCard.tsx`, `discovery.css` (`.dsc-thumb`) |
| P2-3 | Segmented nguồn ở ≤ 1280 px | Ẩn chữ của **cả hai** nút. Chỉ còn ô logo 16 px, mục bật chỉ là nền `--ac-soft` mờ quanh ô nhỏ, khó biết đang tìm ở đâu (ảnh: chỉ khác một nền rất nhạt) | §4.13 mục "Hẹp cửa sổ": **nút chưa chọn** mới chỉ còn logo, nút **đang chọn giữ chữ** ("B Bilibili"). Mục bật thêm `box-shadow: inset 0 0 0 1px var(--ac-br)` như mockup | `discovery.css:922-929` → `.dsc-seg-item:not(.dsc-seg-on) .dsc-seg-text { display:none }`; `.dsc-seg-on` |
| P2-4 | Chip Douyin có nhãn "Nóng" | Điểm nhiệt **xuống 2 dòng** ("1127 / 万"), chip cao lệch. Thấy rõ ở chip 2 và 4 | `.dsc-chip-hot, .dsc-chip-lbl { flex: none; white-space: nowrap }`. Chỉ phần chữ chip được co (`.dsc-chip-text { min-width: 0 }`) | `discovery.css:268-289` |
| P2-5 | Đơn vị số: chip vẫn `万`, thẻ dùng nghìn/triệu/tỷ (sau `f5b5293`) | Hai thang đơn vị nằm cạnh nhau trên cùng màn hình ("1205万" ở chip, "1,2 triệu lượt xem" ở thẻ) | Chip dùng chung `formatCountVi` ("12,1 triệu"), tooltip ghi số đủ. Xoá `hotValueText` riêng. Việc đổi sang nghìn/triệu/tỷ là **đúng hơn thiết kế cũ** (người Việt đọc `万` khó), nên giữ | `HotTopicChips.tsx:40-46` |
| P2-6 | Thanh tab con thiếu tóm tắt "Tải với: Cao nhất · Phụ đề tự tải nếu có · Đổi" | Thẻ tải thẳng theo tuỳ chọn đang đặt ở "Tải về", nhưng người dùng không thấy đó là tuỳ chọn gì (định dạng, cookie, phụ đề) | Thêm vào bên phải `dl-hubtabs`, chỉ hiện khi tab Khám phá đang mở: `Tải với: <b>{nhãn định dạng}</b> · <b>{phụ đề}</b> <link>Đổi</link>`. Bấm "Đổi" thì `switchHubTab("download")` và mở popover tuỳ chọn. Không lặp control | `DownloaderView.tsx:1382-1402` |
| P2-7 | Hàng đợi mini | `.dsc-miniq` dùng `margin-top: auto` trong luồng trang, nên chỉ thấy khi cuộn tới **cuối** danh sách. Cuộn vô hạn thì gần như không bao giờ thấy. Nó lại là khối bo góc 10 px chứ không phải thanh đáy | Đúng §4.13: thanh **dính đáy** 38 px: `position: sticky; bottom: 0; border-radius: 0; margin: 0 calc(-1 * var(--dsc-pad-x))`. Nền `#0f0d0b`, viền trên `--line`, một hàng ngang: "⬇ Hàng đợi: N đang tải · M đợi" + tối đa 3 mục + "Xem ở Tải về ›" | `discovery.css:822-888`, `MiniQueueBar.tsx` |
| P2-8 | Bỏ tìm (✕ / Esc ô rỗng) | `clearSearch` luôn về `"hot"` và tải lại, nên đang ở "Bảng xếp hạng" mà tìm rồi bỏ thì bị đưa về Đang hot, mất vị trí cuộn | Lưu `prevList` + `scrollTop` trước khi vào tìm. Bỏ tìm thì trả đúng danh sách cũ, dùng lại cache, không gọi lại API, rồi khôi phục vị trí cuộn (§4.13 mục 4) | `useDiscoveryList.ts:258-264` |
| P2-9 | Chữ nội bộ "nấc A" lộ ra cho người dùng | `DiscoveryNoKey` ("Nấc A bạn vẫn tìm kiếm được YouTube…") và tooltip `DiscoveryListTabs` ("nấc A chỉ tìm được YouTube") | Bỏ chữ "nấc". Ví dụ: "Danh sách Đang hot của YouTube cần Google API key (miễn phí). Bạn vẫn tìm được YouTube bằng từ khoá — hoặc bấm 1 chip xu hướng." Tooltip: "Cần Google API key — hiện chỉ tìm kiếm được" | `DiscoveryStates.tsx:115-116`, `DiscoveryListTabs.tsx:61` |
| P2-10 | Toast "Xong — đã mở tab trong Studio" | Nằm trong `DiscoveryPanel` (bị ẩn khi tab con / tab app khác đang mở). Chữ nói "đã mở tab" nhưng thực ra đã nhảy màn | Đưa toast lên cấp app, gộp nhiều mục, nội dung theo §1. Nếu PO giữ tự chuyển thì đổi chữ cho đúng sự thật và bỏ nút "Đi tới Studio" | `DiscoveryToast.tsx`, `DiscoveryView.tsx:118-135` |

## 4. P3 — chi tiết

| # | Chỗ nào | Đang thế nào | Nên thế nào | File |
|---|---|---|---|---|
| P3-1 | Tuổi cache ở chip và ở hàng danh sách | "0 phút trước" | < 1 phút → "vừa xong". Gom 1 hàm `formatAge(minutes)` trong `discoveryModel.ts` (có test) | `HotTopicChips.tsx:121`, `DiscoveryListTabs.tsx:100` |
| P3-2 | Dấu "—" lẻ sau nút ↻ (ảnh YouTube) | `dsc-dash` khi `!hasMore`, không có nghĩa gì | Bỏ. Trạng thái "hết" đã có vạch "Hết · N video" ở đáy lưới (sau khi sửa P1-4) | `DiscoveryListTabs.tsx:111-115` |
| P3-3 | Logo nền tảng trên thẻ (dòng kênh) | "B" / "▶" là chữ trơn: `<span class="dsc-logo">` thiếu class `dsc-logo-bilibili`/`-youtube` nên không có nền màu | Thêm `dsc-logo-${item.platform}` như ở thanh tìm | `VideoCard.tsx:167` |
| P3-4 | Dòng "Đã tìm: … (dịch từ "…") Tìm nguyên văn" | Thiếu "Sửa" và tên nhà cung cấp; không có giới hạn thời gian dịch ở phía UI | Theo §4.13 mục 2:<br>• thêm `· Sửa` (điền bản dịch vào ô để người dùng sửa rồi Enter, tìm với `skipTranslate`);<br>• thêm `· {provider}` mờ;<br>• dịch quá **8 s** thì huỷ và tìm nguyên văn, kèm dòng `--warn-txt` ("Dịch quá lâu — đã tìm nguyên văn") | `DiscoverySearchBar.tsx:172-186`, `useKeywordTranslate.ts` |
| P3-5 | Gợi ý dưới ô tìm khi bật tự dịch | Chỉ hiện với chữ **có dấu**, nhưng code dịch **mọi** chữ Latin (`needsTranslation`). Gõ "elden ring" cũng được dịch mà không có gợi ý nào; câu gợi ý lại nói "có dấu tiếng Việt" | Đổi điều kiện sang `needsTranslation(keyword)`, chữ thành: "Sẽ dịch sang tiếng Trung trước khi tìm (Bilibili ít kết quả với tiếng Anh/Việt)". Việc **mặc định bật** và **dịch cả tiếng Anh** lệch thiết kế (thiết kế: tắt, không dịch Latin không dấu), nhưng **đúng hơn** vì Bilibili trả −412 với từ khoá Anh. Giữ, và cập nhật §4.13 theo code | `DiscoverySearchBar.tsx:190-198` |
| P3-6 | Công tắc tự dịch | Là checkbox gốc của trình duyệt, cùng cỡ với nút | Dùng `.sw` (công tắc 30×17) của app như mockup B; bật thì viền tím nhạt (`rgba(167,139,250,.4)`) như mockup, hoặc `--ac` nếu không muốn màu bước | `DiscoverySearchBar.tsx:159-169`, `discovery.css:996-1027` |
| P3-7 | Đổi Bilibili ↔ YouTube | Công tắc tự dịch biến mất ⇒ ô tìm co giãn, bố cục nhảy | Giữ chỗ: ở YouTube vẫn hiện công tắc nhưng `disabled` + tooltip "Chỉ áp cho Bilibili", hoặc đặt `visibility: hidden` | `DiscoverySearchBar.tsx:158` |
| P3-8 | Trạng thái Trống | Gợi ý "tên game tiếng Anh" mâu thuẫn với lý do có công tắc tự dịch (Bilibili chặn tiếng Anh) | "Bilibili tìm tốt nhất bằng tiếng Trung — bật 文 Tự dịch hoặc thử tên game tiếng Trung." Thêm nút "Bật tự dịch" khi đang tắt | `DiscoveryStates.tsx:48-50` |
| P3-9 | Lỗi bị chặn — nút phụ | "Về danh sách khác" chung chung | Ghi rõ: "🔥 Xem Đang hot" (Bilibili, khi đang tìm) hoặc "▶ Tìm trên YouTube" | `DiscoveryView.tsx:260`, `DiscoveryStates.tsx:98-102` |
| P3-10 | YouTube chỉ 20 kết quả, không tải thêm | `hasMore = false` cố định cho YouTube | Chấp nhận ở bản này (ytsearch ~7 s). Thêm nút cuối lưới "Tải thêm 20 ↓" (bấm mới chạy, không tự chạy khi cuộn) | `useDiscoveryList.ts:174-175` |
| P3-11 | ARIA lưới | `role="grid"` nhưng con là `div` bọc (tabIndex) và `gridcell`, không có `row` | Dùng `role="listbox"` + `option` (§4.13 cho phép chọn), hoặc thêm `row` theo hàng. Gộp tabIndex vào thẻ (xem P1-2) | `VideoGrid.tsx:152-183` |
| P3-12 | Tên tab Studio mở từ Khám phá (`v015-app-mo-studio.png`) | "New Way To…QZrw]…." — giữ hậu tố id `[QZrw…]` của yt-dlp và đuôi | Tên tab bỏ hậu tố `\s*\[[\w-]{6,}\]$` của yt-dlp trước khi cắt giữa (§4.11 "tên file bỏ đuôi"). Có thể dùng `title` của mục Khám phá làm tên hiển thị | `src/views/studio/StudioTabStrip.tsx` (hàm cắt giữa tên tab) |

## 5. Giữ nguyên (đạt hoặc tốt hơn thiết kế)

- Tab con gạch chân, nhớ tab con mở lần cuối, `hidden` thay cho unmount (BUG-045) ✓.
- Chỉ tìm khi bấm Enter / ⌕ / chip; chống kết quả về muộn đè kết quả mới bằng `requestId` ✓.
- Chip: ô hạng top 3 màu cam, cuộn ngang bằng lăn chuột, mép phải mờ 48 px, lỗi thì ẩn cả hàng ✓.
- Đổi nguồn khi có từ khoá thì tìm lại bằng **chữ gốc người dùng gõ** (không dùng bản dịch), YouTube nhận tiếng Anh tốt hơn. Đây là quyết định hay ✓.
- Lượt xem nghìn/triệu/tỷ cho cả 2 nguồn, tooltip số đủ: tốt hơn `万/亿` của thiết kế ✓. Chỉ còn chip cần đồng bộ (P2-5).
- Đếm ngược "Thử lại" gấp đôi tới tối đa 5 phút; lỗi tải thêm vẫn giữ các thẻ đã có ✓.
- Thẻ: tiêu đề cao cố định 36 px nên lưới thẳng hàng; ảnh lazy + `no-referrer` + ô dự phòng; `React.memo` với props primitive ✓.
- Menu chuột phải đủ 5 mục theo §4.13 ✓. Còn thiếu `Shift+F10` từ bàn phím (thêm vào `VideoGrid.onKeyDown`, nằm cùng nhóm P3-11).

## 6. Thứ tự sửa gợi ý (1 thợ, ~1 buổi)

1. **P1-1**, rồi **§1** (bỏ tự chuyển + toast cấp app + mở tab không kích hoạt). Hai việc cùng chạm vào `DiscoveryView` effect, `DownloaderView` và host.
2. **P1-2 + P1-3** (focus lưới) — `VideoGrid.tsx` + CSS, sửa 1 lượt.
3. **P1-4**, **P2-1/P2-2** (thẻ theo trạng thái), **P2-7** (hàng đợi dính đáy).
4. P2 còn lại, rồi P3.

**Cách kiểm sau khi sửa** (điều phối, trên app thật):
- Tải 1 mục bằng "Tải & mở Studio", tắt app rồi mở lại: **không** được nhảy sang Studio hay mở thêm tab.
- Gõ từ khoá, Enter: con trỏ **vẫn ở ô tìm**. Bấm ↓ thì xuống thẻ đầu, lúc đó mới thấy viền.
- Cuộn Đang hot: **không** thấy "Hết" trước trang 10.
- Bấm "Tải & mở Studio" rồi sang tab Live: tải xong thì chỉ có toast, vẫn ở Live, Studio có tab mới chấm xanh.
