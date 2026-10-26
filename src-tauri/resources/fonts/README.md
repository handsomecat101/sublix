# Font đi kèm — phụ đề "nhảy chữ" (v0.14)

Hai file trong thư mục này dùng cho `ffmpeg -vf ass=...` (libass) và cho khung
xem thử trong Studio. **`Style: Fontname` phải khớp family name nội bộ**, không
phải tên file:

| File | Family name nội bộ | Dùng cho | Nguồn tải (chính thức) | Giấy phép |
|---|---|---|---|---|
| `BeVietnamPro-SemiBold.ttf` | `Be Vietnam Pro SemiBold` | phụ đề **Bình thường** | Google Fonts — repo `google/fonts`, `ofl/bevietnampro/BeVietnamPro-SemiBold.ttf` (https://github.com/google/fonts/tree/main/ofl/bevietnampro) | SIL OFL 1.1 |
| `Montserrat-Black.ttf` | `Montserrat Black` | 3 mẫu **Nhảy chữ** (Vàng nảy / Karaoke xanh / Hiện dần) | Repo gốc `JulietaUla/Montserrat`, `fonts/ttf/Montserrat-Black.ttf` (https://github.com/JulietaUla/Montserrat) | SIL OFL 1.1 |

Giấy phép đầy đủ: [`OFL.txt`](./OFL.txt) (nguyên văn từ 2 nguồn trên).

## Cách dùng với ffmpeg

```text
ffmpeg -i in.mp4 -vf "ass=filename='<file.ass>':fontsdir='<thư mục này>'" out.mp4
```

Đường dẫn Windows phải escape `:` → `\:` (xem `escape_filter_path` trong
`src-tauri/src/dubbing/subtitle_burn.rs`). Nếu **không** truyền `fontsdir`,
libass quét toàn bộ `C:\Windows\Fonts` (chậm 15–45 giây) hoặc rơi font và vỡ dấu.

## Ghi chú

- Font được đóng gói qua `bundle.resources` trong `src-tauri/tauri.conf.json`.
- Đã kiểm render thật bằng ffmpeg 9.0.2 (libass) ở 1280×720; ảnh trong
  `docs/ui-mockups/shots/v014-ass-*.png` — dấu tiếng Việt (ỗ ữ ặ ẫ ợ) không vỡ.
- **Không sửa file font**; thay bản mới thì cập nhật lại bảng trên (tên family
  có thể đổi giữa các phiên bản ⇒ `build_ass` sẽ sai font nếu không kiểm).
