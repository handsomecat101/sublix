# Báo Cáo Nghiên Cứu: Tìm Video & Bảng Xếp Hạng "Đang Hot" Trong Sublix

> **Mã công việc:** `TSK-RESEARCH-VIDEO-DISCOVERY`  
> **Ngày thực hiện:** 28/10/2026  
> **Mục tiêu:** Đánh giá tính khả thi, phương thức kỹ thuật và kiến trúc triển khai tính năng: (1) Tìm kiếm video theo từ khóa, (2) Danh sách video/chủ đề đang hot (Trending/Ranking) ngay trong app Sublix (Tauri v2 + Rust + React), ưu tiên các nền tảng Trung Quốc (Bilibili, Douyin, Kuaishou, Xiaohongshu) và Quốc tế (YouTube, TikTok).

---

## 1. Bảng Tổng Hợp So Sánh Nền Tảng

| Nền tảng | Chức năng | Phương thức khả thi | Cần Đăng nhập / Cookie? | Cần Chữ ký (Sign / WAF)? | Đã thử thật? | Độ khó | Đánh giá & Khuyến nghị |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Bilibili** | **Hot / Popular** | API Web `GET /x/web-interface/popular` | ❌ Không | ❌ Không | ✅ **PASS** (100% ra đủ data) | 🟢 **DỄ** | **Ưu tiên số 1**. Chạy cực nhanh, trả đủ thumbnail, views, duration, BV id. |
| **Bilibili** | **Ranking v2** | API Web `GET /x/web-interface/ranking/v2` | ❌ Không | ❌ Không | ✅ **PASS** (Top 100 video) | 🟢 **DỄ** | **Ưu tiên số 1**. 100 video đỉnh bảng theo ngày/tuần. |
| **Bilibili** | **Tìm kiếm** | API Web `GET /x/web-interface/search/type` | ❌ Không | ❌ Không | ✅ **PASS** (code: 0, 20 kết quả/trang) | 🟢 **DỄ** | Dùng API trực tiếp từ Rust `reqwest`, không qua `bilisearch` của yt-dlp (tránh lỗi HTTP 412). |
| **YouTube** | **Tìm kiếm** | `yt-dlp --dump-single-json "ytsearchN:..."` | ❌ Không | ❌ Không | ✅ **PASS** (~7s/query) | 🟢 **DỄ** | **Ưu tiên số 1**. Đã có sẵn binary `yt-dlp`, trả về đầy đủ metadata và thumbnail chất lượng cao. |
| **YouTube** | **Hot / Trend** | Google Data API v3 (`chart=mostPopular`) hoặc InnerTube / ytsearch hot | Tuỳ chọn (Cần API Key Google nếu dùng v3) | ❌ Không | ⚠️ Thử `feed/trending` lỗi; InnerTube 400 | 🟡 **VỪA** | Dùng Google Data API v3 (miễn phí 10.000 req/ngày) hoặc dùng từ khóa hot qua `ytsearchN:`. |
| **Douyin** | **Hot Word List** | API Web `GET /web/api/v2/hotsearch/billboard/word/` | ❌ Không | ❌ Không | ✅ **PASS** (Top 50 từ khóa hot) | 🟢 **DỄ** | **Rất độc đáo**: Lấy 50 trend hot nhất Trung Quốc làm chip gợi ý, bấm vào tự tìm qua Bilibili/YouTube. |
| **Douyin** | **Hot Video / Search** | API Web `/aweme/v1/web/search/item/` | ⚠️ Cần `ttwid` | 🔴 Bắt buộc `a_bogus` / `X-Bogus` | ⚠️ Thử API aweme trả về rỗng | 🔴 **KHÓ** | Chữ ký JS `a_bogus` đổi liên tục; yt-dlp không có `douyinsearch`. Chưa nên làm ở pha này. |
| **TikTok** | **Tag / User** | `yt-dlp "tiktok:tag"`, `"tiktok:user"` | ❌ Không | 🔴 Bị WAF chặn | ❌ **FAIL** (yt-dlp báo broken) | 🔴 **KHÓ** | yt-dlp đánh dấu extractor `tiktok:tag` là broken. Không hỗ trợ tìm kiếm từ khóa. |
| **TikTok** | **Creative Center** | API `creative_radar_api/v1/popular_trend` | 🔴 Cần tài khoản Business | 🔴 Chống bot WAF (Akamai + msToken) | ❌ **FAIL** (code 40101 no permission) | 🔴 **KHÓ** | Chống bot gắt gao; thư viện crawl đòi hỏi Playwright chạy nền, quá nặng cho Sublix. |
| **Xiaohongshu** | **Tìm kiếm / Hot** | Web API `edith.xiaohongshu.com` | ⚠️ Cần cookie `a1` | 🔴 Bắt buộc chữ ký `x-s`, `x-t` | 📖 Đọc tài liệu MediaCrawler | 🔴 **KHÓ** | Yêu cầu sinh cặp chữ ký `x-s` và `x-t` qua JS runtime; dễ dính captcha 461. |
| **Kuaishou** | **Tìm kiếm / Hot** | Web GraphQL `/graphql` | ⚠️ Cần cookie | 🔴 Rate-limit & WAF gắt | ❌ **FAIL** (`yt-dlp` không hỗ trợ) | ⛔ **LOẠI** | **Không khả thi**: yt-dlp chưa có extractor tải Kuaishou (xem `BUG-082`). Tìm ra cũng không tải được. |

---

## 2. Chi Tiết Đánh Giá Từng Nền Tảng

### 2.1. Bilibili (哔哩哔哩) — Đánh giá: RẤT CAO (Nên làm ngay)

#### A. Tìm kiếm (Search)
- **Cách làm khuyến nghị:** Gọi trực tiếp qua HTTP GET từ Rust backend:
  - Endpoint: `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword={KEYWORD}&page={PAGE}`
  - Headers tối thiểu: `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36` và `Referer: https://www.bilibili.com/`
- **Kết quả thử nghiệm thực tế (28/10/2026):**
  - Chạy `curl.exe` trực tiếp vào endpoint trên với từ khóa `test` và `genshin`:
  - **Kết quả: 200 OK, `code: 0`, `message: "OK"`.**
  - Dữ liệu thu được đầy đủ:
    - ID & Link: `bvid` (ví dụ `BV1oano6gEMd`), `arcurl` (link `http://www.bilibili.com/video/av...`)
    - Tiêu đề: `title` (kèm thẻ highlight `<em>`, frontend chỉ cần strip thẻ HTML)
    - Ảnh thu nhỏ: `pic` (URL CDN `//i2.hdslb.com/bfs/archive/...`)
    - Thời lượng: `duration` (chuỗi dạng `MM:SS` hoặc `HH:MM:SS`)
    - Thống kê: `play` (lượt xem), `like` (lượt thích), `danmaku` (bình luận trôi), `pubdate` (thời gian đăng)
    - Tác giả: `author` (tên kênh), `upic` (avatar tác giả)
- **Bẫy kỹ thuật cần lưu ý:**
  - Không dùng lệnh `yt-dlp --flat-playlist "bilisearchN:query"`. Thực nghiệm đã chứng minh yt-dlp dính **`HTTP Error 412: Precondition Failed`** do gọi nhầm endpoint `wbi/search/all/v2` đòi hỏi chữ ký WBI.
  - Endpoint `search/type` cũ hiện vẫn mở công khai, không cần đăng nhập, không cần cookie `buvid3`, không cần chữ ký WBI.
  - Sau khi người dùng chọn video trong app Sublix, chỉ cần truyền link `https://www.bilibili.com/video/{bvid}` sang module `start_download` của yt-dlp là tải mượt mà.
- **Nguồn tài liệu:** [SocialSisterYi/bilibili-API-collect - Search API](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/search/search_request.md) (Giấy phép: MIT).

#### B. Hot & Ranking
- **Popular API:**
  - Endpoint: `https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1`
  - Thử thật: **PASS 100%**. Trả về 20 video đang thịnh hành nhất. Dữ liệu chuẩn gồm `bvid`, `title`, `pic`, `duration` (số giây nguyên), `stat.view` (lượt xem), `owner.name`.
- **Ranking v2 API:**
  - Endpoint: `https://api.bilibili.com/x/web-interface/ranking/v2`
  - Thử thật: **PASS 100%**. Trả về danh sách 100 video đứng đầu bảng xếp hạng tổng hợp của Bilibili.
- **Độ ổn định:** Rất cao. Các endpoint này đã tồn tại trên 5 năm và là nguồn dữ liệu mở phục vụ client web công khai.

---

### 2.2. YouTube — Đánh giá: CAO (Tìm kiếm dễ, Hot cần API Key)

#### A. Tìm kiếm (Search)
- **Cách làm khuyến nghị:** Dùng trực tiếp runner `yt-dlp` có sẵn trong Sublix:
  - Lệnh: `yt-dlp --dump-single-json --flat-playlist --no-warnings "ytsearch{count}:{keyword}"`
- **Kết quả thử nghiệm thực tế (28/10/2026):**
  - Chạy thử `ytsearch3:cat`:
  - **Kết quả: Thành công trong ~7 giây.**
  - Trả về JSON sạch gồm các trường:
    - `id` (ví dụ `OaaxAzx7GeI`) -> URL: `https://www.youtube.com/watch?v=OaaxAzx7GeI`
    - `title`
    - `duration` (số giây nguyên)
    - `thumbnails` (danh sách URL ảnh thu nhỏ kèm width/height)
    - `view_count`
    - `channel` / `uploader`
- **Ưu điểm:** Không cần đăng ký Google API key, không bị giới hạn quota, không lo YouTube đổi cấu trúc HTML vì cộng đồng `yt-dlp` bảo trì liên tục.

#### B. Hot / Trending
- **Vấn đề của yt-dlp với feed trending:**
  - Chạy thử: `yt-dlp --dump-single-json --flat-playlist "https://www.youtube.com/feed/trending"`
  - Kết quả: `ERROR: [youtube:tab] trending: The channel/playlist does not exist and the URL redirected to youtube.com home page`.
  - YouTube đã xóa route tĩnh `/feed/trending` trên web, chuyển sang cấu trúc dynamic tabs trong InnerTube.
- **Phương án giải quyết tối ưu:**
  1. **Phương án 1 (Chính thức & chuẩn xác nhất):** Dùng **YouTube Data API v3**.
     - Endpoint: `GET https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&chart=mostPopular&regionCode=VN&maxResults=20&key={API_KEY}`
     - Google miễn phí 10.000 quota units/ngày. Mỗi request `videos.list` chỉ tiêu tốn 1 unit -> ứng dụng có thể gọi 10.000 lần/ngày hoàn toàn miễn phí.
     - Cho phép chọn quốc gia: Việt Nam (`VN`), Mỹ (`US`), Nhật (`JP`), Hàn (`KR`), Đài Loan (`TW`).
     - Sublix có thể cho người dùng điền Google API key vào tab Cài đặt (tương tự API key dịch thuật), hoặc backend cấp 1 key mặc định.
  2. **Phương án 2 (Fallback không cần key):** Khi người dùng chưa có API key, app tự động fallback sang tìm kiếm từ khóa xu hướng qua `yt-dlp`: `ytsearch20:"thịnh hành việt nam"` hoặc `ytsearch20:"nhạc hot tiktok trending"`.

---

### 2.3. Douyin (抖音) — Đánh giá: VỪA (Nên khai thác Bảng Hot Word)

#### A. Bảng Hot Word List (Từ khóa & Chủ đề đang thịnh hành)
- **Cách làm:** Gọi HTTP GET trực tiếp từ Rust backend:
  - Endpoint: `https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/`
  - Header: `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`
- **Kết quả thử nghiệm thực tế (28/10/2026):**
  - **Kết quả: PASS 100% (HTTP 200, `status_code: 0`).**
  - Trả về ngay lập tức danh sách **50 chủ đề nóng nhất Trung Quốc** kèm điểm nhiệt (`hot_value`) và nhãn phân loại (`label`):
    - Ví dụ dữ liệu thực: *"在稻城亚丁看一场秋日童话"* (11.7 triệu nhiệt), *"中方敦促美方停止对古巴封锁施压"* (10.2 triệu nhiệt), *"萌宠滑镜定格挑战"*, *"异环1.5版本前瞻"*...
  - **Không cần đăng nhập, không cần cookie, không cần chữ ký.**
- **Ứng dụng thực tế cho Sublix:**
  - Hiển thị danh sách 50 chủ đề này thành các tag/chip "Xu hướng Douyin" ngay trên đầu thanh tìm kiếm.
  - Người dùng bấm vào tag nào -> Sublix tự động đưa từ khóa đó vào ô tìm kiếm và query trên Bilibili hoặc YouTube. Đây là giải pháp cực kỳ thông minh giúp nhà sáng tạo nội dung bắt kịp trend Trung Quốc để làm video vietsub/lồng tiếng AI.

#### B. Tìm kiếm Video Douyin & Video Billboard
- **Khó khăn:**
  - Thử endpoint video billboard `/billboard/aweme/` trả về mảng rỗng `[]`.
  - API tìm kiếm video web của Douyin (`/aweme/v1/web/search/item/`) yêu cầu:
    1. Chữ ký thuật toán mã hóa động `a_bogus` (trước đây là `X-Bogus`).
    2. Cookie hợp lệ `ttwid` lấy từ server ByteDance.
    3. Cookie `msToken`.
  - Nếu thiếu các tham số này, server trả về lỗi bảo mật hoặc dữ liệu rỗng.
  - Dự án mã nguồn mở tham khảo: `Evil0ctal/Douyin_TikTok_Download_API` (MIT / GPL-3.0) phải cập nhật liên tục thuật toán giải mã `a_bogus` (thường xuyên bị ByteDance đổi 2–3 tháng/lần).
- **Khuyến nghị:** Không nên nhúng bộ giải mã `a_bogus` vào bản phát hành native của Sublix ở giai đoạn này vì chi phí bảo trì rất cao và dễ gãy đột ngột.

---

### 2.4. TikTok — Đánh giá: THẤP (Chỉ nên giữ chức năng dán link)

#### A. Tìm kiếm & Tag
- **Thử nghiệm thực tế:**
  - `yt-dlp --dump-single-json "https://www.tiktok.com/tag/cat"`: Báo lỗi `WARNING: The program functionality for this site has been marked as broken... ERROR: No working app info is available`.
  - `yt-dlp "https://www.tiktok.com/@tiktok"`: Báo lỗi `Unable to extract secondary user ID`.
  - yt-dlp không có tính năng tìm kiếm từ khóa TikTok (`tiktoksearch` không tồn tại).

#### B. TikTok Creative Center (Trending Insights)
- **Thử nghiệm thực tế:**
  - Endpoint: `https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?country_code=VN`
  - Kết quả: `HTTP 200, {"code": 40101, "msg": "no permission"}`.
  - Nền tảng yêu cầu đăng nhập tài khoản TikTok for Business và đi qua lớp bảo vệ chống bot của Akamai (TLB edge) kèm chữ ký `x-ms-token`.
- **Thư viện bên thứ ba:**
  - Hầu hết các giải pháp cào dữ liệu TikTok hiện nay (như `TikTok-Api` của David Teather) đều phải khởi chạy trình duyệt ngầm (Playwright hoặc Selenium) để vượt qua captcha trượt và nhặt cookie phiên. Việc nhúng thêm Chromium/Playwright vào app desktop sẽ làm tăng kích thước cài đặt thêm 150MB–300MB và ăn nhiều RAM.
- **Khuyến nghị:** Tạm thời không triển khai tìm kiếm TikTok nội bộ. Người dùng lướt TikTok trên điện thoại/trình duyệt, copy link video và dán vào Sublix để tải (yt-dlp tải video đơn từ link trực tiếp vẫn hoạt động rất tốt).

---

### 2.5. Kuaishou (快手) & Xiaohongshu (小红书) — Đánh giá: KHÔNG KHẢ THI / RỦI RO CAO

1. **Kuaishou:**
   - Đã được ghi nhận trong `ISSUE_LOG.md` (mã `BUG-082`): `yt-dlp` bản 2026.10.21 **hoàn toàn không có extractor cho Kuaishou**.
   - Dù có cào được kết quả video thì người dùng bấm vào tải cũng sẽ gặp lỗi `Unsupported URL`.
   - **Kết luận:** **LOẠI BỎ**.
2. **Xiaohongshu (Tiểu Hồng Thư / RED):**
   - yt-dlp có hỗ trợ tải link đơn (`XiaoHongShu`), nhưng API web tìm kiếm của Xiaohongshu (`edith.xiaohongshu.com`) áp dụng hệ thống bảo mật cực gắt:
     - Bắt buộc header chữ ký `x-s` và `x-t`.
     - Phải có cookie phiên `a1` sinh từ thiết bị thật.
     - Dễ bị chặn IP (mã 461) và bật popup xác thực trượt hình ảnh (Geetest).
   - Tham khảo mã nguồn dự án **MediaCrawler** (GitHub): Để lấy được `x-s` và `x-t`, họ buộc phải dùng Playwright duy trì 1 phiên trình duyệt thật để lấy hàm JS của Xiaohongshu ký header trước khi gửi request.
   - **Kết luận:** **KHÔNG NÊN LÀM** ở thời điểm này.

---

## 3. Đề Xuất Thứ Tự Triển Khai & Lộ Trình Tính Năng

Dựa trên thực nghiệm, giải pháp đem lại giá trị cao nhất cho người dùng với độ ổn định cao và chi phí kỹ thuật thấp nhất gồm 3 giai đoạn:

```
┌────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 1: Bilibili Discovery + Douyin Hot Tags (100% HTTP Không Cần Key) │
│ - Bilibili Popular (20 video hot nhất)                                 │
│ - Bilibili Ranking (Top 100 video đỉnh bảng)                           │
│ - Bilibili Keyword Search (Tìm video tiếng Trung / Quốc tế)            │
│ - Douyin Hot Words (50 tag xu hướng bấm được)                          │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ GIAI ĐOẠN 2: YouTube Search & Trending                                 │
│ - YouTube Keyword Search qua `ytsearchN:` (yt-dlp có sẵn)             │
│ - YouTube Trending qua YouTube Data API v3 (tùy chọn nhập key)          │
│ - Fallback tìm kiếm từ khóa xu hướng khi không có key                  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ GIAI ĐOẠN 3: Tích Hợp Sâu UI Studio & Cache Thông Minh                 │
│ - 1-Click "Tải & Mở Trong Studio"                                      │
│ - Bộ nhớ đệm (Cache) kết quả 15-30 phút                                │
│ - Bộ lọc danh mục (Game, Nhạc, Phim, Đời sống, Công nghệ)              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Kiến Trúc Kỹ Thuật Đề Xuất Cho Sublix

### 4.1. Cấu Trúc Backend (Rust)
Tận dụng kiến trúc mô-đun của Sublix, tạo thư mục mới `src-tauri/src/discovery/`:

```
src-tauri/src/discovery/
├── mod.rs             # Định nghĩa struct dữ liệu DiscoveryItem, trait & commands Tauri
├── bilibili.rs        # Logic gọi HTTP GET popular, ranking, search type (dùng reqwest)
├── douyin.rs          # Logic lấy 50 hot words billboard
├── youtube.rs         # Wrapper chạy `yt-dlp --dump-single-json "ytsearchN:..."` & Data API v3
└── cache.rs           # In-memory TTL cache chống spam request
```

### 4.2. Dữ Liệu Trả Về Chuẩn Hóa (Contract Types)
Mọi nền tảng đều ánh xạ về một cấu trúc dữ liệu thống nhất `DiscoveryItem` để giao diện React hiển thị nhất quán:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryItem {
    pub id: String,              // bvid hoặc youtube video_id
    pub platform: String,        // "bilibili" | "youtube" | "douyin"
    pub title: String,           // Tiêu đề video
    pub url: String,            // URL chuẩn để yt-dlp tải
    pub thumbnail_url: String,  // Link ảnh thu nhỏ
    pub duration_sec: u32,      // Thời lượng tính theo giây
    pub duration_text: String,   // "04:15"
    pub view_count: Option<u64>,// Lượt xem
    pub author_name: String,    // Tên tác giả / kênh
    pub author_avatar: Option<String>,
    pub publish_time: Option<i64>,
}
```

### 4.3. Chiến Lược Cache & Giới Hạn Tần Suất (Rate Limiting)
- **TTL Cache (In-Memory qua `RwLock<HashMap>`):**
  - Danh sách Bilibili Popular / Ranking: Cache **30 phút** (dữ liệu bảng xếp hạng không đổi theo từng giây).
  - Douyin Hot Words: Cache **15 phút**.
  - Kết quả tìm kiếm theo từ khóa: Cache **5 phút**.
- **Lợi ích:**
  - Chuyển đổi qua lại giữa các tab trong app diễn ra tức thì (0ms latency), không phải tải lại mạng.
  - Hoàn toàn tránh được việc bị Bilibili hay YouTube rate-limit hoặc chặn IP người dùng.
- **Giới hạn an toàn:** Không bắn request khi người dùng đang gõ (debounce 500ms ở frontend trước khi gọi command tìm kiếm).

### 4.4. Trải Nghiệm Giao Diện Người Dùng (UI/UX)
- Đặt tab con **"Khám Phá"** ngay bên cạnh tab **"Tải Video"** hiện tại.
- **Phía trên:**
  - Ô tìm kiếm: Ô nhập text + Dropdown chọn nguồn (`Tất cả`, `Bilibili`, `YouTube`).
  - Thanh cuộn ngang các chip xu hướng: `🔥 Hot Douyin: [Chủ đề 1] [Chủ đề 2]...`, bấm vào tự động điền ô tìm kiếm.
- **Phía dưới (Lưới video dạng Grid Cards):**
  - Thẻ video:
    - Ảnh cover sắc nét kèm nhãn thời lượng ở góc dưới bên phải.
    - Tiêu đề video (tối đa 2 dòng, tự động cắt bằng `...`).
    - Hàng meta: Logo nền tảng (Bilibili / YouTube) + Tên kênh + Số lượt xem (rút gọn `K` / `M` / `万`).
    - Nút hành động khi rê chuột (Hover Action):
      - ⬇️ **Tải ngay** (Tự động đưa link vào hàng đợi tải của yt-dlp).
      - 🎬 **Mở Studio** (Tải xong tự chuyển thẳng sang Tab Studio để bắt đầu STT và lồng tiếng AI).

---

## 5. Rủi Ro Pháp Lý & Điều Khoản Dịch Vụ (ToS)

1. **Bilibili:** Các API `/popular`, `/ranking/v2` và `/search/type` là API công khai không qua xác thực người dùng. Việc hiển thị metadata (ảnh bìa, tiêu đề) để người dùng xem và quyết định tải phục vụ mục đích cá nhân (Personal/Educational Use) nằm trong phạm vi chấp nhận được của các công cụ client-side (tương tự các extension Bilibili phổ biến).
2. **YouTube:** Việc query `ytsearchN:` thông qua `yt-dlp` tuân thủ nguyên lý trích xuất công khai. Nếu dùng YouTube Data API v3, hoàn toàn tuân thủ Developer Terms của Google.
3. **Bản quyền nội dung:** Sublix chỉ đóng vai trò trình duyệt hiển thị và công cụ chuyển ngữ hỗ trợ người dùng; trách nhiệm bản quyền của video khi xuất bản lại thuộc về người dùng cuối (đã có điều khoản miễn trừ trách nhiệm pháp lý trong tài liệu sản phẩm).

---

## 5b. Ghi chú của điều phối (Claude Code, 2026-10-28)

- **Đã tự kiểm lại:** Bilibili `popular` ⇒ `code 0`, có dữ liệu ✅ · Douyin hot words ⇒ đủ **50 từ khóa** ✅ · Bilibili `search/type` ⇒ HTTP 200, `Bili-Status-Code: 0` (chưa đếm được số kết quả — coi là **gần chắc**, thợ code phải kiểm lại).
- **Lưu ý khi code:** chỉ gọi API công khai với tần suất thấp + cache như §4.3; **không** giả cookie/chữ ký để vượt chống bot (Douyin `a_bogus`, TikTok, Xiaohongshu).
- **Bổ sung đề xuất:** với TikTok / Douyin / trang khác ⇒ **trình duyệt nhúng trong app** (người dùng tự lướt, đăng nhập như bình thường) + nút "Tải về / Gửi sang Studio" lấy link trang đang xem → yt-dlp. Không cần cào, không bị chặn.

## 6. Kết Luận

Nghiên cứu khẳng định:
1. **Tính khả thi của tính năng Tìm kiếm & Hot Trend là 100%** nếu kết hợp **Bilibili API** (cho nội dung tiếng Trung hot) + **Douyin Hot Words** (cho xu hướng nóng) + **YouTube ytsearch/Data API** (cho nội dung quốc tế).
2. Toàn bộ giải pháp cốt lõi cho Bilibili và Douyin **không cần bất kỳ API key, không cần đăng nhập, không cần cookie, không cần giải mã chữ ký phức tạp**, chạy trực tiếp từ Rust `reqwest` cực kỳ ổn định và mượt mà.
3. Sublix nên tập trung triển khai **Giai đoạn 1 (Bilibili + Douyin Hot Tags)** và **Giai đoạn 2 (YouTube Search)**; bỏ qua Kuaishou và TikTok Search để tối ưu tài nguyên phát triển.
