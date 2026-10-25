# DUCKING_SPEC — Hạ tiếng nền theo thoại (Smart Ducking)

> Chốt với PO 2026-10-25. Một nguồn sự thật cho thuật toán: **xem thử trong Studio và video xuất ra PHẢI cho cùng một đường âm lượng**.
> Muốn chỉnh cảm giác nghe → chỉnh **tham số ở §2** (không cần sửa thuật toán).

## 1. Vấn đề cũ

| Nơi | Cách cũ | Hậu quả |
|---|---|---|
| Studio xem thử (`SublixStudioView.tsx` `syncVoicePlayback`/`stopVoicePlayback`) | Câu lồng tiếng bắt đầu → `video.volume` nhảy xuống ~20%; câu kết thúc → nhảy về 100% | Hội thoại có ngắt nghỉ → nền **lúc to lúc bé** liên tục, giật |
| Xuất video (`dubbing/mod.rs` remux, `[0:a]volume={bgm_volume}`) | Hạ cố định 25% **cả video** | Không nhấp nhô nhưng cảnh không thoại (nhạc, hành động) cũng bị nhỏ; **khác** với lúc xem thử |

## 2. Tham số (mặc định — chỉnh ở đây)

| Tên | Mặc định | Ý nghĩa | Ở đâu |
|---|---|---|---|
| `duck_level` | **0.20** (≈ −14 dB) | Âm lượng nền khi có thoại (0–1, tuyến tính) | UI: thanh "Mức hạ" |
| `bridge_gap_sec` | **2.0** | Hai câu cách nhau **< giá trị này** → coi là 1 khối, nền giữ thấp suốt | UI: "Nối khoảng nghỉ dưới … giây" (0.5–10; kéo tối đa ≈ hạ cả video) |
| `attack_sec` | 0.30 | Thời gian hạ nền, **kết thúc đúng lúc câu đầu bắt đầu** (bắt đầu hạ trước câu) | config, không có UI |
| `release_sec` | 1.00 | Thời gian trả nền lên, **bắt đầu khi câu cuối khối kết thúc** | config, không có UI |
| `min_voice_sec` | 0.15 | Đoạn thoại ngắn hơn bị bỏ qua (tiếng rời rạc) | hằng số |

Lưu: config `ducking_level`, `ducking_bridge_sec`, `ducking_attack_sec`, `ducking_release_sec` (`#[serde(default)]` theo bảng trên).

## 3. Thuật toán (thuần, tất định)

**Đầu vào:** danh sách đoạn thoại `[(start, end)]` theo giây — dùng **độ dài clip lồng tiếng thật** (`start + audioDuration`) nếu có, không thì `end` của câu; `duration` của video; tham số §2.

1. **Lọc:** bỏ đoạn có `end − start < min_voice_sec`; kẹp vào `[0, duration]`; sắp theo `start`.
2. **Gộp khối:** duyệt tuần tự; nếu `next.start − cur.end < bridge_gap_sec` (hoặc chồng nhau) → `cur.end = max(cur.end, next.end)`; ngược lại mở khối mới. Kết quả: các khối `Z_i = [s_i, e_i]`.
3. **Hàm gain của từng khối** (tuyến tính trong **miền dB** để tai nghe đều; `L = 20·log10(duck_level)`):
   - `t < s_i − attack` hoặc `t > e_i + release` → 0 dB
   - `s_i − attack ≤ t < s_i` → nội suy 0 dB → L
   - `s_i ≤ t ≤ e_i` → L
   - `e_i < t ≤ e_i + release` → nội suy L → 0 dB
   (Nếu `s_i − attack < 0` thì kẹp về 0: đầu video đã ở mức đang hạ dần tương ứng.)
4. **Ghép:** `gain_dB(t) = min_i gain_i(t)` (hai khối gần nhau mà ramp chồng lên nhau thì lấy mức **thấp hơn** → không có "nảy" lên giữa hai khối).
5. **Đầu ra:** danh sách **điểm gãy** `[(t, gain_linear)]` đã gộp điểm trùng/thẳng hàng, `gain_linear = 10^(dB/20)`. Hàm `gainAt(t)` nội suy từ điểm gãy (tuyến tính trong dB giữa 2 điểm).

**Độ phức tạp:** O(n log n) (sắp xếp) + O(n) — 1.000 câu tính < 1 ms.

## 4. Áp dụng

### 4.1 Studio xem thử
- Tính lại điểm gãy khi: danh sách clip lồng tiếng đổi, tham số đổi (memo theo dữ liệu, không tính mỗi frame).
- Khi video **đang phát** và có lồng tiếng: vòng `requestAnimationFrame` đặt `video.volume = userVolume × gainAt(currentTime)` (không dùng `timeupdate` — chỉ ~4 Hz, sẽ nghe bậc thang). Dừng/tạm dừng → huỷ vòng, trả `video.volume = userVolume`.
- `userVolume` = mức người dùng chọn; người dùng chỉnh volume trong lúc phát → cập nhật `userVolume` (giữ hành vi cũ "không ghi đè volume người dùng"). Tắt tiếng (`muted`/volume 0) → không đụng.
- Bỏ cơ chế cũ `videoVolumeBeforeDuckRef`/`duckedVolumeRef` hạ-bật theo từng câu.

### 4.2 Xuất video (FFmpeg)
- Chế độ `ducking`: thay `[0:a]volume={bgm_volume}` bằng đường âm lượng từ **cùng điểm gãy**:
  `volume=eval=frame:volume='<biểu thức nội suy từng đoạn>'` dựng từ điểm gãy; nếu biểu thức quá dài (> ~60 khối) → chia thành `asendcmd`/`sendcmd` theo điểm gãy với ramp lấy mẫu mỗi 50 ms. Người làm chọn 1 cách, ghi lý do vào §6.
- Chế độ `vocal_isolation` (Demucs tách nền): **không** duck (nền đã không còn giọng gốc) — giữ như cũ.
- `bgm_volume` cũ: chuyển thành giá trị khởi tạo cho `ducking_level` khi config cũ chưa có field mới (migration).

### 4.3 Cùng kết quả 2 nơi
- Thuật toán được viết 2 lần (TS: `src/lib/audio/duckingEnvelope.ts`, Rust: `src-tauri/src/dubbing/ducking.rs`) và **cùng chạy một bộ vector kiểm thử** `scripts/ducking-tests/vectors.json` (node --test + cargo test đọc cùng file). Sai lệch điểm gãy > 1 ms hoặc gain > 0.001 = test fail.

## 5. Ca kiểm thử bắt buộc (vectors.json)
1. Không có thoại → 1 điểm (0, 1.0).
2. 1 câu giữa video → ramp xuống trước câu `attack` giây, giữ, ramp lên `release` giây.
3. 2 câu cách 1.0 s (< bridge 2.0) → 1 khối liền, không lên giữa chừng.
4. 2 câu cách 2.5 s (≥ bridge, < bridge + attack + release) → không gộp nhưng ramp chồng → lấy min, không nảy lên 100%.
5. 2 câu cách 10 s → 2 khối độc lập, giữa chúng về 100%.
6. Câu bắt đầu ở t=0.1 → attack bị kẹp tại 0.
7. Câu kết thúc sát cuối video → release bị cắt tại `duration`.
8. Câu chồng nhau / chưa sắp xếp / đoạn < min_voice_sec.
9. `bridge_gap_sec = 10` trên hội thoại dày → gần như hạ cả video.
10. `duck_level = 1.0` → không hạ gì (mọi gain = 1).

## 6. Nhật ký điều chỉnh
| Ngày | Ai | Thay đổi | Lý do |
|---|---|---|---|
| 2026-10-25 | Điều phối (Claude Opus 5.5) + PO | Bản đầu | PO: nền lúc to lúc bé khi thoại ngắt nghỉ; không muốn hạ đều cả video làm phim "xẹp" |
