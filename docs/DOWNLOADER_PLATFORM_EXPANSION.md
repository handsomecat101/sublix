# DOWNLOADER_PLATFORM_EXPANSION.md — Nghiên cứu mở rộng Tab Tải Video sang nền tảng khác (phục vụ quy trình reup)

> **Task:** `TSK-RES-DL-PLATFORMS` · **Agent:** CommandCode (Orca worker) · **Ngày:** 2026-10-24
> **Phạm vi:** CHỈ nghiên cứu + chạy thử yt-dlp. **KHÔNG sửa code** trong tài liệu này (mọi đề xuất chỉ là khuyến nghị, PO quyết định).
>
> **Môi trường chạy thử (số liệu trong file này là THẬT, chạy tại chỗ, không bịa):**
> - `yt-dlp --version` = **2026.10.21** (yt-dlp.exe của WinGet).
> - Máy: Win11, AMD Ryzen AI Max 390, không GPU NVIDIA. `ffmpeg version 9.0.2-full_build`.
> - Lệnh chạy thử chuẩn (không tải file, chỉ mô phỏng):
>   ```sh
>   yt-dlp --simulate --no-warnings --socket-timeout 20 \
>     --print "%(title)s|%(duration)s|%(width)sx%(height)s" <URL>
>   ```
> - ⚠️ **Cảnh báo về môi trường:** mạng tại máy này **chặn DNS** một số domain (`www.reddit.com`, `nfc-api.nicochannel.jp`) → các dòng Reddit/NicoChannelPlus bên dưới là lỗi **do mạng local**, cần chạy lại ở mạng khác để kết luận đúng về nền tảng.
> - Không có file video nào được tải về repo (chỉ `--simulate`).

---

## 0. Hiện trạng code Sublix (mốc so sánh)

`src-tauri/src/downloader/mod.rs::get_platform` (dòng **446–538**) hiện nhận diện **26 host**, nhưng mức độ hỗ trợ **KHÔNG đồng đều**:

| Nhóm | Nền tảng | Thực tế |
|------|----------|---------|
| **Nhận diện + có nhãn nguồn phụ đề** (`platform_source_label` dòng **609–632**) | youtube, tiktok, douyin, bilibili, kuaishou, xiaohongshu, ixigua, huya, douyu, youku, iqiyi, weibo, acfun, cctv, vqq, mgtv, migu, niconico, wppilot | Được dùng cho manifest `sublix_subtitles.json` |
| **Nhận diện "trần" — KHÔNG có nhãn/hint** (get_platform có, nhưng `platform_source_label` **không** liệt kê) | facebook, twitter, instagram, vimeo, soundcloud, reddit, twitch | Chip UI hiện "nền tảng này"; manifest phụ đề **không** ghi được tên nguồn; `platform_error_hint` không dịch lỗi đặc thù |
| **Cảnh báo đặc biệt** | `kuaishou`, `migu` | Có trong `get_platform` **nhưng yt-dlp KHÔNG có extractor** (xem §1) → người dùng bấm sẽ ăn `Unsupported URL` dù UI báo "Kuaishou (快手)"/"Migu (咪咕)" |

**Frontend** `src/views/DownloaderView.tsx`: `PLATFORM_META` (dòng **98–126**) + `detectPlatform` (dòng **130–165**) đã có nhãn đẹp cho `instagram`, `vimeo`, `soundcloud`, `reddit`, `twitch` — **lệch** với backend (backend chưa có label/hint cho các nền tảng này). `src/lib/types.ts::SUBTITLE_SOURCE_LABELS` (dòng **27–47**) cũng thiếu các nền tảng đó.

---

## 1. Danh sách ứng viên mở rộng (≥15 nền tảng) — KÈM KẾT QUẢ CHẠY THỬ THẬT

### 1.1 Bảng tổng hợp

Chú thích cột **Độ khó**: **S** = nhỏ (thêm host + nhãn, ~10–20 dòng), **M** = vừa (cần cookie/hint/pattern phụ đề), **L** = lớn (yt-dlp không có extractor → phải tự viết, không làm được qua yt-dlp).

| # | Nền tảng | Trong Sublix? | Extractor yt-dlp (tên thật) | Kết quả chạy thử 2026-10-24 (yt-dlp 2026.10.21) | Cần cookies/đăng nhập? | Geo-block | Phụ đề? | 429 / tốc độ | Độ khó |
|---|----------|---------------|-----------------------------|--------------------------------------------------|------------------------|-----------|---------|--------------|--------|
| 1 | **YouTube** (đối chứng) | ✅ rồi | `youtube` (+20 sub) | ✅ OK | Không | Không | ✅ có (gốc + tự dịch) | 429 ở track dịch (đã biết, `BUG-061`) | — |
| 2 | **Facebook** | detect trần | `facebook`, `facebook:reel`, `facebook:ads` | ✅ OK | Không (video công khai) | Không | ❌ "has no subtitles" | Không | **S** |
| 3 | **Instagram (Reels)** | detect trần | `Instagram`, `InstagramIOS` | ✅ OK (Reel công khai) | **Reel/Post công khai: KHÔNG cần.** Profile (`instagram:user`): cần login | Không | ❌ "has no subtitles" | Không | **S** |
| 4 | **Twitch** | detect trần | `twitch:vod`, `twitch:clips`, `twitch:stream`, `twitch:videos` | ✅ OK (VOD) | Không (VOD công khai) | Không | ❌ "has no subtitles" | Không | **S** |
| 5 | **Kick** | ❌ chưa | `kick:clip`, `kick:clips`, `kick:live`, `kick:vod`, `kick:videos` | ✅ OK (clip) | Không (clip công khai) | Không | ❌ (chưa có) | Không | **S** |
| 6 | **Dailymotion** | ❌ chưa | `dailymotion` | ✅ OK | Không | Không | ❌ "has no subtitles" | Không | **S** |
| 7 | **VK (VKontakte)** | ❌ chưa | `vk`, `VKPlay`, `VKPlayLive` | ✅ OK | Không | Không (chặn ở vài nơi) | ❌ (chưa có) | Không | **S** |
| 8 | **Niconico** | ✅ có | `niconico`, `NiconicoUser`, `NiconicoChannelPlus` | ✅ OK | Không | Không | ⚠️ chỉ có `comments json`, **không** phải phụ đề thoại | Không | **S** |
| 9 | **Pinterest** | ❌ chưa | `Pinterest`, `PinterestCollection` | ✅ OK | Không | Không | ❌ (chưa có) | Không | **S** |
| 10 | **Snapchat Spotlight** | ❌ chưa | `SnapchatSpotlight` | ✅ OK (trả `0x0`, duration ngắn) | Không | Không | ❌ (chưa có) | Không | **S→M** |
| 11 | **MangoTV** | ✅ có | `MangoTV` | ✅ OK (title rỗng) | Không (video thử) | Không | ⚠️ có `zh_hk` (xem `subtitle_lang_patterns`) | Chưa gặp | — |
| 12 | **Rumble** | ❌ chưa | `Rumble`, `RumbleChannel`, `RumbleEmbed` | ❌ 403 Forbidden | **Cần cookies** (chống bot Cloudflare) | Không | ❌ (chưa có) | 403 | **M** |
| 13 | **Vimeo** | detect trần | `vimeo` | ❌ "web client only works when logged-in" | **Cần cookies/đăng nhập** (từ 2025) | Không | ⚠️ (tuỳ video) | Không | **M** |
| 14 | **Reddit** | detect trần | `Reddit` | ❌ DNS fail *(do mạng local)* | Thường công khai; video NSFW cần cookie | Không | ❌ (chưa có) | Không | **S** |
| 15 | **Instagram (profile/user)** | — | `instagram:user` | ❌ "Unable to extract data" | **Cần cookies/đăng nhập** | Không | — | — | **M** |
| 16 | **X / Twitter** | detect trần | `twitter` (+space, broadcast) | (không chạy thử — chưa cần) | **Thường cần cookies** (từ 2023) | Không | ❌ | Không | **M** |
| 17 | **Naver TV (Hàn)** | ❌ chưa | `Naver` | ❌ `KeyError('result')` — extractor lỗi | Không | Không | Không | Không | **M** |
| 18 | **SOOP / AfreecaTV (Hàn)** | ❌ chưa | `soop` (tên cũ `afreecatv`) | ❌ "This VOD is for subscribers only" | **Cần đăng nhập** (VOD trả phí) | Không | Không | Không | **M** |
| 19 | **Kakao TV (Hàn)** | ❌ chưa | `Kakao` | ❌ HTTP 404 (dịch vụ **đã đóng**) | — | — | — | — | **L** (bỏ) |
| 20 | **TVer (Nhật)** | ❌ chưa | `TVer` | ❌ "geo restriction — available in Japan" | Không | **✅ chặn geo Nhật** | Không | Không | **L** |
| 21 | **AbemaTV (Nhật)** | ❌ chưa | `AbemaTV`, `AbemaTVTitle` | (không chạy thử) | Cần đăng nhập cho nhiều nội dung | **Chặn geo Nhật** | Không | Không | **L** |
| 22 | **Likee** | ❌ chưa | `likee` | ❌ "Unable to extract video info" — extractor **hỏng** | Không | Không | Không | Không | **L** (chờ upstream) |
| 23 | **TikTok** | ✅ có | `TikTok`, `tiktok:user`, `vm.tiktok` | ❌ "Your IP address is blocked from accessing this post" *(IP máy này)* | Thường cần cookies | Tuỳ vùng | ❌ | 429/block | **M** |
| 24 | **Douyin** | ✅ có | `Douyin` | ❌ "Fresh cookies (not necessarily logged in) are needed" | **Cần cookie mới** | Vùng TQ | ❌ | Không | **M** |
| 25 | **Bilibili** | ✅ có | `BiliBili` (+21 sub) | ❌ "Unable to extract initial state" *(ID test cũ)* | Cookie cho phụ đề (`BUG-061`-like) | Chặn vài khu vực | ✅ nhiều mã `zh-CN`/`ai-zh` | 412/567 (đã có hint) | — |
| 26 | **Threads (Meta)** | ❌ chưa | **KHÔNG CÓ** | ❌ `Unsupported URL` | — | — | — | — | **L** |
| 27 | **Kuaishou (快手)** | ✅ có (lỗi!) | **KHÔNG CÓ** | ❌ `Unsupported URL` | — | — | — | — | **L** |
| 28 | **Kwai (quốc tế)** | ❌ chưa | **KHÔNG CÓ** | ❌ `Unsupported URL` | — | — | — | — | **L** |
| 29 | **Migu (咪咕)** | ✅ có (lỗi!) | **KHÔNG CÓ** | ❌ `Unsupported URL` | — | — | — | — | **L** |
| 30 | **Lemon8** | ❌ chưa | **KHÔNG CÓ** (rơi vào `generic`) | ❌ `[generic] ... HTTP Error 404` | — | — | — | — | **L** |
| 31 | **NicoChannelPlus** | ❌ chưa | `NiconicoChannelPlus` | ❌ DNS fail *(do mạng local)* | Có thể cần login channel | Không | Không | Không | **M** |

> **Tóm tắt:** **11 nền tảng chạy thử THÀNH CÔNG** (Facebook, Instagram Reel, Twitch, Kick, Dailymotion, VK, Niconico, Pinterest, Snapchat, MangoTV, YouTube). **≥5 nền tảng phổ biến cho reup mà yt-dlp HOÀN TOÀN không có extractor** (Threads, Kuaishou, Kwai, Migu, Lemon8).

### 1.2 Kết quả chạy thử NGUYÊN VĂN (raw output)

**✅ Thành công** (định dạng `title|duration|WxH`):

```
YouTube      https://www.youtube.com/watch?v=jNQXAC9IVRw
  Me at the zoo|19|320x240

Facebook     https://www.facebook.com/facebook/videos/10153231379946729/
  How to Share With Just Friends|74.304|NAxNA

Instagram    https://www.instagram.com/reel/Chunk8-jurw/
  Video by instagram|NA|720x1280

Twitch       https://www.twitch.tv/riotgames/v/6528877
  LCK Summer Split - Week 6 Day 1|17208|1280x720

Kick (clip)  https://kick.com/spreen/clips/clip_01J8RGZRKHXHXXKJEHGRM932A5
  KLJASLDJKLJKASDLJKDAS|43|NAxNA

Dailymotion  https://www.dailymotion.com/video/x89eyek
  En quête d'esprit du 27/03/2022|2756|1920x1080

VK           https://vk.com/video205387401_165548505
  No name|9|NAx720

Niconico     https://www.nicovideo.jp/watch/sm8628149
  Bad Apple!!|219|512x384

Pinterest    https://www.pinterest.com/pin/664281013778109217/
  Origami|57.7|1080x1920

Snapchat     https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYYWtidGhudGZpAX1TKn0JAX1TKnXJAAAAAA
  Views|4.665|0x0

MangoTV      https://www.mgtv.com/b/333652/7329822.html
  |2656|NAxNA
```

**❌ Lỗi (nguyên văn dòng ERROR):**

```
Vimeo        https://vimeo.com/68375962
  ERROR: [vimeo] 68375962: The web client only works when logged-in. Use --cookies,
  --cookies-from-browser, --username and --password, --netrc-cmd, or --netrc (vimeo)
  to provide account credentials.

Rumble       https://rumble.com/v5pv5f
  ERROR: [Rumble] v5pv5f: Unable to download webpage: HTTP Error 403: Forbidden
  (caused by <HTTPError 403: Forbidden>)

Reddit       https://www.reddit.com/r/videos/comments/6rrwyj/that_small_heart_attack/
  ERROR: [Reddit] 6rrwyj: Unable to download JSON metadata: HTTPSConnection(
  host='www.reddit.com', port=443): Failed to resolve 'www.reddit.com'
  ([Errno 11001] getaddrinfo failed)          ← LỖI MẠNG LOCAL, không phải lỗi nền tảng

Instagram    https://www.instagram.com/instagram/   (profile)
  ERROR: [instagram:user] instagram: Unable to extract data

Threads      https://www.threads.net/@instagram
  ERROR: Unsupported URL: https://www.threads.com/@instagram

Kuaishou     https://www.kuaishou.com/
  ERROR: Unsupported URL: https://www.kuaishou.com/new-reco

Kwai         https://www.kwai.com/
  ERROR: Unsupported URL: https://www.kwai.com/

Migu         https://www.migu.cn/
  ERROR: Unsupported URL: https://www.migu.cn/

Lemon8       https://www.lemon8-app.com/@lemon8
  ERROR: [generic] @lemon8: Unable to download webpage: HTTP Error 404: Not Found

Naver TV     https://tv.naver.com/v/67838091
  ERROR: 67838091: An extractor error has occurred. (caused by KeyError('result'))

SOOP/Afreeca https://vod.sooplive.com/player/192805325
  ERROR: [soop] 192805325: This VOD is for subscribers only. Use --username and
  --password, --netrc-cmd, or --netrc (afreecatv) to provide account credentials

Kakao TV     https://tv.kakao.com/channel/3643855/cliplink/412069491
  ERROR: [Kakao] 412069491: Unable to download JSON metadata: HTTP Error 404: Not Found

TVer         https://tver.jp/episodes/epc1hdugbk
  ERROR: [TVer] epc1hdugbk: This video is not available from your location due to geo restriction
  This video is available in Japan.

Likee        https://likee.video/@huynh_hong_quan_/video/7093444807096327263
  ERROR: [likee] 7093444807096327263: Unable to extract video info

TikTok       https://www.tiktok.com/@tiktok/video/7012720896274197765
  ERROR: [TikTok] 7012720896274197765: Your IP address is blocked from accessing this post

Douyin       https://www.douyin.com/video/7000000000000000000
  ERROR: [Douyin] 7000000000000000000: Fresh cookies (not necessarily logged in) are needed

Bilibili     https://www.bilibili.com/video/BV1xx411c7mD
  ERROR: [BiliBili] 1xx411c7mD: Unable to extract initial state

nicochannel  https://nicochannel.jp/testman/videos
  ERROR: [NiconicoChannelPlus] ... Failed to resolve 'nfc-api.nicochannel.jp'
  ([Errno 11001] getaddrinfo failed)          ← LỖI MẠNG LOCAL
```

### 1.3 Phụ đề (chạy `--list-subs` thật trên các nền tảng chạy được)

```
Facebook    → 10153231379946729 has no automatic captions / has no subtitles
Instagram   → Chunk8-jurw has no subtitles
Niconico    → Available subtitles: Language=comments, Formats=json  (là bình luận, KHÔNG phải phụ đề thoại)
Dailymotion → x89eyek has no subtitles
Twitch      → v6528877 has no subtitles
```

**Kết luận quan trọng:** hầu hết nền tảng ngoài YouTube/Bilibili **KHÔNG có phụ đề** → pipeline reup "tải phụ đề sẵn" của Sublix (`BUG-061`, `TSK-SUBS-YOUTUBE-REUSE`) sẽ **không áp dụng** được; phải dựa vào **Whisper tự nhận dạng**. Đây là thông tin cần cho thiết kế UX (đừng hứa "có phụ đề" cho các nền tảng này).

---

## 2. Tính năng riêng cho quy trình reup — ĐÁNH GIÁ CÓ/KHÔNG trong code hiện tại

| # | Tính năng reup | Trạng thái trong Sublix | Bằng chứng (file:dòng) | Ghi chú |
|---|----------------|-------------------------|------------------------|---------|
| 1 | **Tải bản KHÔNG watermark** (TikTok/Douyin/Kuaishou) | ⚠️ **Một phần (không chủ động)** | `build_format_args` — `downloader/mod.rs:691-734`; `build_download_command` — `mod.rs:948-1036` | Sublix **không** truyền `--extractor-args` để ép bản sạch. **yt-dlp tự ưu tiên bản không watermark**: `tiktok.py` đặt `'preference': -2 if has_watermark else -1` (bản có logo bị điểm thấp hơn) → mặc định lấy bản sạch. Facebook có các format `hd-wmk`/`sd-wmk` (điểm thấp) cho bản có logo. → *Thực tế thường OK, nhưng chưa có test xác nhận từ phía Sublix.* |
| 2 | **Tải cả kênh/profile/hashtag (N video mới nhất)** | ⚠️ **Một phần** | `batch.rs:147` (`--flat-playlist`), `batch.rs:5`, `MAX_PLAYLIST_ITEMS=200` (`batch.rs:20`) | Đã mở rộng được **playlist/channel** (qua `downloader_expand_playlist`) với trần 200 mục; **hashtag chưa xử lý riêng**; tải lẻ vẫn `--no-playlist` (`mod.rs:983`). |
| 3 | **Chống tải trùng giữa các lần (`--download-archive`)** | ❌ **KHÔNG có** | *(grep toàn repo: 0 tham chiếu `--download-archive`)* | Hiện chỉ chống trùng **trong 1 phiên** (dedupe URL — `batch.rs:52-77`, `BUG-053`). Chưa có "sổ đã tải" bền vững. |
| 4 | **Xuất metadata kèm video (.json/.txt)** — tiêu đề, mô tả, hashtag, link gốc, ngày đăng | ⚠️ **Một phần (chỉ đọc, không lưu)** | `fetch_video_info` — `mod.rs:765-935` (lấy title/description/uploader/id/thumbnail) | Dữ liệu **có sẵn trong RAM** nhưng **không ghi ra file**. Không dùng `--write-info-json`. Hashtag/ngày đăng (`upload_date`) chưa bóc. |
| 5 | **Tải thumbnail gốc** | ⚠️ **Một phần (chỉ lấy URL)** | `VideoInfo.thumbnail` — `mod.rs:47`, `mod.rs:917`, `mod.rs:929` | Chỉ lấy **URL**; **không tải file ảnh**. Không dùng `--write-thumbnail`. |
| 6 | **Cắt đoạn (`--download-sections`)** | ❌ **KHÔNG có** | *(grep: 0 tham chiếu)* | ffmpeg 9.0.2 có sẵn nên `--download-sections` chạy được nếu bật. |
| 7 | **Hẹn giờ / hàng đợi theo dõi kênh mới** | ⚠️ **Một phần (chỉ hàng đợi tức thời)** | Hàng đợi tải song song trong `batch.rs` + `start_download` (`mod.rs:1526`), tối đa 3 tải song song | Có **hàng đợi**, **chưa có scheduler/cron** (theo dõi kênh định kỳ). |

**Xác nhận các cờ yt-dlp cần thiết đều tồn tại** (chạy `yt-dlp --help` thật, yt-dlp 2026.10.21):
`--download-archive FILE`, `--write-info-json`, `--write-thumbnail`, `--download-sections REGEX`, `--flat-playlist`, `--write-auto-subs`, `--dateafter DATE`, `--extractor-args IE_KEY:ARGS`, `--cookies-from-browser BROWSER`. → Không có rào cản kỹ thuật từ phía yt-dlp.

---

## 3. Rủi ro & Tuân thủ (mỗi nền tảng) — để app hiện CẢNH BÁO phù hợp

> ⚠️ **Nguyên tắc:** tài liệu này **KHÔNG đề xuất** cách né Content ID, né cơ chế bảo vệ bản quyền hay phá DRM. Với **Netflix / Disney+ / nội dung DRM** → **KHÔNG HỖ TRỢ**, không có ngoại lệ.

| Nền tảng | Điều khoản về tải xuống / đăng lại | Rủi ro bản quyền khi reup | Mức rủi ro |
|----------|-----------------------------------|---------------------------|------------|
| **Instagram / Threads / Facebook (Meta)** | ToS cấm tải/tái phân phối nội dung không thuộc sở hữu; API Graph chỉ cho nội dung của chính bạn | Vạ chạm bản quyền + gỡ bài; Meta có hệ thống nhận diện nhạc/video | 🔴 Cao |
| **TikTok / Douyin** | Cấm tải không phép ngoài app; nội dung thường gắn nhạc có bản quyền | **Rất cao**: nhạc TikTok bản quyền → vấp Content ID/claim nhạc khi reup | 🔴 Cao |
| **YouTube** | Cấm tải khi chưa được phép (trừ tải chính chủ) | **Content ID** mạnh nhất; reup gần như chắc chắn vấp claim/ngắt kiếm tiền | 🔴 Cao |
| **Twitch / Kick** | Clip/VOD thuộc streamer; kho nhạc nền stream vi phạm DMCA | Trung bình–cao; nhạc nền stream hay bị strike | 🟠 Trung-Cao |
| **Vimeo** | Kênh của tác giả; nhiều nội dung dùng license CC | Trung bình (nhiều clip CC-BY cho phép dùng kèm ghi nguồn) | 🟡 Trung bình |
| **Dailymotion / Rumble / Pinterest / Snapchat** | Nội dung do người dùng đăng; ToS hạn chế tải lại | Trung bình–cao, tuỳ video | 🟠 Trung-Cao |
| **VK / Naver / SOOP / Abema / TVer / NicoChannel** | Nhiều nội dung **geo-locked + trả phí/đăng nhập** | Cao với nội dung premium (thể thao, phim) | 🔴 Cao |
| **Bilibili / Youku / iQIYI / MangoTV / v.qq** | Nội dung phim/TV bản quyền, có "risk control" (412/567) | **Rất cao** với phim/TV; clip ngắn đỡ hơn | 🔴 Cao |
| **Niconico** | Nội dung UGC; một số công khai | Trung bình | 🟡 Trung bình |

**Khuyến nghị UX:** app nên hiện **banner cảnh báo reup** ("Bạn chịu trách nhiệm về bản quyền; chỉ reup nội dung bạn sở hữu / được cấp phép / CC") + nhãn rủi ro theo nền tảng; **và ghi rõ nền tảng nào chỉ tải được khi đăng nhập** (Vimeo, SOOP, Douyin, TikTok, Threads…).

---

## 4. Khuyến nghị

### 4.1 Top 8 nền tảng nên thêm trước (ưu tiên cho reup thị trường Việt)

| Ưu tiên | Nền tảng | Lý do | Độ khó | Việc cần làm |
|:------:|----------|-------|:------:|--------------|
| **1** | **Instagram (Reels)** | Nguồn reup lớn nhất; **Reel công khai chạy được KHÔNG cần login** (đã kiểm chứng) | **S** | Thêm label vào `platform_source_label` + `SUBTITLE_SOURCE_LABELS`; hint cho `instagram:user` (cần login) |
| **2** | **Facebook (Reels/Watch)** | Đã detect, chỉ cần "hoàn thiện" | **S** | Bổ sung `platform_source_label` + `platform_error_hint` |
| **3** | **Twitch** | Đã detect; VOD/clip chạy tốt | **S** | Bổ sung label + hint |
| **4** | **Kick** | Đối thủ Twitch, clip công khai chạy tốt | **S** | Thêm host `kick.com` + META frontend + label |
| **5** | **Dailymotion** | Kho video lớn, tải công khai tốt | **S** | Thêm host + label |
| **6** | **VK (VKontakte)** | Phổ biến, tải công khai tốt | **S** | Thêm host `vk.com`/`vkvideo.ru` + label |
| **7** | **Pinterest** | Nhiều video ngắn (đã kiểm chứng 1080x1920) | **S** | Thêm host + label |
| **8** | **Snapchat Spotlight** | Video ngắn, tải công khai | **S→M** | Thêm host; lưu ý trả `0x0` (không có metadata độ phân giải) |

> **Ghi chú chiến lược:** 8 nền tảng trên đều là "nhận diện host + nhãn" (**S**) → có thể gộp **1 nhánh code ngắn**. Ngoài ra nên **sửa 2 lỗi hiện hữu**: (a) `kuaishou` & `migu` trong `get_platform` nhưng yt-dlp **không hỗ trợ** → `platform_error_hint` nên nói thẳng "yt-dlp chưa hỗ trợ, không tải được" thay vì "hãy cập nhật yt-dlp"; (b) đồng bộ `PLATFORM_META`/`SUBTITLE_SOURCE_LABELS` với backend.

### 4.2 Top 5 tính năng reup nên làm (theo thứ tự ưu tiên)

| Ưu tiên | Tính năng | Vì sao | Độ khó | Cách làm gợi ý |
|:------:|-----------|--------|:------:|----------------|
| **1** | **Xuất metadata kèm video** (tiêu đề/mô tả/hashtag/link/ngày đăng → `.json`/`.txt`) | Cốt lõi để "viết lại caption" khi reup | **S** | Thêm `--write-info-json` vào `build_download_command`; hoặc ghi `.txt` từ `VideoInfo` đã parse (`mod.rs:908-934`) + bổ sung `upload_date`/`tags` |
| **2** | **Chống tải trùng bền vững (`--download-archive`)** | Tránh tải lại video đã lấy, rất cần khi theo dõi kênh | **S** | Thêm `--download-archive <appdata>/download_archive.txt` vào lệnh tải |
| **3** | **Tải thumbnail gốc** | Cần cho ảnh bìa/thumbnail reup | **S** | Thêm `--write-thumbnail` (hoặc tải từ `VideoInfo.thumbnail`, `mod.rs:917`) |
| **4** | **Tải cả kênh/hashtag (N video mới nhất) + hẹn giờ theo dõi** | Tự động hoá reup theo kênh | **M→L** | Mở rộng `expand_playlist` (`batch.rs:147`) cho hashtag; thêm scheduler (theo dõi kênh định kỳ) |
| **5** | **Cắt đoạn khi tải (`--download-sections`)** | Lấy nhanh clip ngắn, đỡ tải cả video dài | **S→M** | Thêm `--download-sections "*HH:MM:SS-HH:MM:SS"` (ffmpeg 9.0.2 đã có sẵn) |

*(Tùy chọn bổ sung:* đảm bảo **không watermark** cho TikTok/Douyin — hiện yt-dlp tự lo (`tiktok.py` preference), chỉ cần **thêm 1 test xác nhận** trong Sublix.)*

### 4.3 File cần sửa (nếu PO duyệt triển khai)

| File | Vị trí | Việc |
|------|--------|------|
| `src-tauri/src/downloader/mod.rs` | `get_platform` (**:446**), `platform_source_label` (**:609**), `platform_error_hint` (**:637**), `build_download_command` (**:948**), `build_format_args` (**:691**) | Thêm host mới (kick/vk/pinterest/snapchat/dailymotion…), nhãn nguồn, hint cookie, cờ reup (`--write-info-json`, `--write-thumbnail`, `--download-archive`, `--download-sections`) |
| `src-tauri/src/downloader/batch.rs` | `expand_playlist` (**:147**), `split_urls` (**:57**) | Hashtag/kênh N video mới nhất, archive |
| `src/views/DownloaderView.tsx` | `PLATFORM_META` (**:98**), `detectPlatform` (**:130**) | Đồng bộ nhãn/icon/màu với backend |
| `src/lib/types.ts` | `SUBTITLE_SOURCE_LABELS` (**:27**) | Đồng bộ nhãn nguồn phụ đề |
| `src-tauri/src/lib.rs` | *(commands)* | Command mới (nếu làm scheduler/metadata export) |

---

## 5. Phụ lục — Bằng chứng thô

- **Danh sách extractor:** `yt-dlp --list-extractors` → **1755 extractor** (yt-dlp 2026.10.21, chạy 2026-10-24).
  - Có: `instagram`, `InstagramIOS`, `twitch:*`, `kick:*`, `dailymotion`, `vk`, `VKPlay`, `Pinterest`, `SnapchatSpotlight`, `Rumble*`, `Reddit`, `vimeo`, `Naver`, `soop`, `Kakao`, `TVer`, `AbemaTV`, `niconico`, `NiconicoChannelPlus`, `likee`, `MangoTV`.
  - **KHÔNG có:** `Threads`, `Lemon8`, `Kwai`, `Kuaishou`, `Migu`.
- **URL test** lấy từ chính `_TESTS` trong source extractor của yt-dlp trên GitHub (`yt_dlp/extractor/*.py`, nhánh `master`) để đảm bảo URL thật — sau đó chạy `--simulate` thật và ghi nguyên văn ở §1.2.
- **Phiên bản:** `yt-dlp 2026.10.21` · `ffmpeg 9.0.2-full_build` · ngày chạy **2026-10-24**.

*— Hết báo cáo TSK-RES-DL-PLATFORMS —*
