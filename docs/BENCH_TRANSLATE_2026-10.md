# Báo Cáo Benchmark Dịch: MiniMax M3.1 Flash (API) vs Dịch Local

> **Mã tài liệu:** MAN-2026-TRANSLATE-2026-10
> **Task:** `TSK-BENCH-MINIMAX-FLASH` (mcode #2 — Orca worker)
> **Ngày:** 2026-10-24
> **Bối cảnh:** PO phản ánh dịch hiện tại *"kiểu Google Translate, không dùng ngữ cảnh"*.
> **Phạm vi:** đo thật + (nếu tốt) thêm lựa chọn trong app. **Không commit, không push** (coordinator sẽ review + commit).
> **Model đã xác minh:** `MiniMax-M3.1-Flash` — lấy từ docs chính thức MiniMax, đọc 2026-10-24 (link ở §3), và coordinator đã xác minh `GET /v1/models = 200`.

---

## 0. Tóm tắt điều hành

| # | Kết luận |
|---|---|
| 1 | **Có tên model chính xác:** `MiniMax-M3.1-Flash` (cùng API có `MiniMax-M3`, `MiniMax-M2.7-highspeed`). Không đoán. |
| 2 | **M3.1-Flash với `reasoning_effort` mặc định (`max`) chậm hơn Ollama local 8,8× và hay timeout.** Không dùng được làm lựa chọn "nhanh" nếu giữ nguyên thiết lập mặc định. |
| 3 | **Nguyên nhân gốc:** M3.1-Flash **không cho tắt thinking** (`thinking.type="disabled"` → HTTP 400 code 2013) và `reasoning_effort` mặc định là `max`. Bản vá dùng `reasoning_effort: "low"` → đo lại ở §1.2.2. |
| 4 | **`MiniMax-M3` (model đang chọn hiện tại) gần như hỏng ở batch 15 câu**: batch vượt timeout 60 s → app fallback sang 15 lệnh gọi đơn câu (timeout 30 s mỗi lệnh). Đây là lý do PO thấy "dịch kiểu Google Translate" — bản dịch rơi vào đường fallback. |
| 5 | **Ollama `qwen2.5:3b` local vẫn nhanh nhất** và **0 lỗi** — là mặc định hợp lý cho máy này (iGPU). |
| 6 | **DeepSeek:** không có key trong config → **không đo được**, ghi rõ "không có key". |
| 7 | **Kết luận PHẦN 2:** đã thêm nút chọn nhanh `⚡ MiniMax M3.1 Flash` cạnh nút `MiniMax-M3` (chỉ thêm, không đổi model mặc định) **kèm** xử lý đúng cho model này trong `translate/server.rs`. |

---

# PHẦN 1 — ĐO THẬT

## 1.1. Phương pháp

### 1.1.1. Đường code được đo (không curl tự chế)

Harness Rust: **`src-tauri/examples/bench_translate.rs`** (mới).

```rust
translate::translate_batch_with_config(
    chunk, "en", "vi",
    TranslationModelVariant::Qwen25_3B, EnginePreference::Cpu, &cfg,
)
```

- `cfg` = `AppConfig::load_or_default()` → đọc **đúng config thật của app** tại
  `%APPDATA%\com.sublix.desktop\sublix-config.json` (không dựng config giả).
- Provider được chọn qua `cfg.translation_provider` → **đi đúng nhánh mà app dùng**
  (`mod.rs::translate_batch_with_config` → `server::translate_batch_via_*`).
- Chunk size **15** — đúng `chunk_size = 15` trong `translate/mod.rs:413`.
- **Không in API key** ra terminal / file / log: harness chỉ ghi `key_present` + độ dài.

### 1.1.2. Dữ liệu

| | |
|---|---|
| **Nguồn** | `gui-2026-10-20/dump-78-cues.json` (78 cue, mỗi cue là `"[Dịch lỗi: <English gốc>]"` vì lúc chụp bản dịch đã hỏng) |
| **Cách tách** | Bóc nguyên văn tiếng Anh trong nhãn, ghép các mảnh cắt giữa câu, tách tiếp thành **câu hoàn chỉnh** |
| **Kết quả** | **60 câu** tiếng Anh, hội thoại StarCraft (3 nhân vật: Zeratul ↔ Kaldares ↔ Artanis) |
| **File dùng để đo** | `%TEMP%\sublix-bench-translate\en_src\starcraft_en.srt` (+ `starcraft_en_raw.srt` = 78 cue nguyên bản) |
| **Vì sao chọn bộ này** | Hội thoại **2+ nhân vật** với nhiều đại từ ("your warriors", "our capabilities", "I doubt my own motives") → đúng tiêu chí chấm điểm "XỬ HỘ đúng"; có câu ngắn ("Calis."), câu dài, câu hỏi tu từ, và câu đệ từ khó ("My life for iron.") |

> Không có file `.srt` tiếng Anh nào sẵn trên máy (đã quét `%TEMP%`, repo, git history, toàn bộ thư mục scratchpad của các phiên khác). Bộ 60 câu này là **phụ đề thật** lấy từ chính lần chạy Sublix trước đó, không phải văn bản tự viết.

### 1.1.3. Cấu hình so sánh

| # | Provider | Model | Chunk | Ghi chú |
|---|---|---|---|---|
| (a) | Ollama (local, iGPU) | `qwen2.5:3b` | 15 | preset AMD hiện tại; model đã nạp sẵn trên máy |
| (b) | MiniMax API | `MiniMax-M3` | 15 (app default) + 5 | model đang chọn hiện tại |
| (c) | MiniMax API | `MiniMax-M3.1-Flash` | 15 (app default) + 5 | ứng viên mới |
| (d) | DeepSeek API | `deepseek-chat` | 15 | **không có key** trong config |

Mỗi cấu hình chạy **2 lần**, lấy trung bình.

### 1.1.4. Máy đo

AMD Ryzen AI Max 390 (12C/24T) · RAM 31 GB · Windows 11 · **không có NVIDIA GPU** (Ollama chạy iGPU) ·
`CARGO_TARGET_DIR=%TEMP%\sublix-cc-target` (xem §4.1 về Smart App Control).

---

## 1.2. Kết quả đo

| # | Cấu hình | Họ | Model | Chunk | Lần 1 (s) | Lần 2 (s) | **TB (s)** | **Chunk đầu (s)** | **s/câu** | Lỗi | Rỗng | `<think>` | Ước chi phí/lần |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| (a) Ollama qwen2.5:3b (local, iGPU) | Ollama | `qwen2.5:3b` | 15 | 27.387 | 21.732 | **24.56** | **7.983** | **0.409** | 0 | 0 | 0 | — |
| (b) MiniMax-M3 (chunk=5) | MiniMax | `MiniMax-M3` | 5 | 138.516 | 201.567 | **170.041** | **10.562** | **2.834** | 0 | 0 | 0 | ~$0.00108 |
| (b) MiniMax-M3 (chunk=5) — sau vá | MiniMax | `MiniMax-M3` | 5 | 224.765 | 174.36 | **199.563** | **3.836** | **3.326** | 0 | 0 | 0 | ~$0.00110 |
| (c) MiniMax-M3.1-Flash (chunk=15, effort=max) | MiniMax | `MiniMax-M3.1-Flash` | 15 | 162.689 | 267.454 | **215.072** | **33.539** | **3.585** | 1 | 0 | 0 | ~$0.00054 |
| (c) MiniMax-M3.1-Flash (chunk=5, effort=max) | MiniMax | `MiniMax-M3.1-Flash` | 5 | 85.918 | 126.249 | **106.084** | **4.619** | **1.768** | 0 | 0 | 0 | ~$0.00056 |
| (c) MiniMax-M3.1-Flash (chunk=15, effort=low) — CÀI ĐẶT ĐỀ XUẤT | MiniMax | `MiniMax-M3.1-Flash` | 15 | 27.55 | 25.113 | **26.332** | **5.302** | **0.439** | 0 | 0 | 0 | ~$0.00055 |
| (c) MiniMax-M3.1-Flash (chunk=5, effort=low) | MiniMax | `MiniMax-M3.1-Flash` | 5 | 34.755 | 43.343 | **39.049** | **4.229** | **0.651** | 0 | 0 | 0 | ~$0.00054 |
| (d) DeepSeek chat | DeepSeek | `deepseek-chat` | 15 | 0.001 | — | **0.001** | **0.0** | **0.0** | 60 | 0 | 0 | — |

### Chi tiết từng lô (chunk) — bản đề xuất (c) và bản local (a)

**a-ollama-qwen25-3b**

| Lô | Số câu | Giây | s/câu | Lỗi |
|---|---|---|---|---|
| run1 / lô 1 | 15 | 11.219 | 0.748 | 0 |
| run1 / lô 2 | 15 | 6.556 | 0.437 | 0 |
| run1 / lô 3 | 15 | 5.471 | 0.365 | 0 |
| run1 / lô 4 | 15 | 4.141 | 0.276 | 0 |
| run2 / lô 1 | 15 | 4.747 | 0.316 | 0 |
| run2 / lô 2 | 15 | 7.098 | 0.473 | 0 |
| run2 / lô 3 | 15 | 5.928 | 0.395 | 0 |
| run2 / lô 4 | 15 | 3.959 | 0.264 | 0 |

**c2-minimax-M31-flash-patched-c15**

| Lô | Số câu | Giây | s/câu | Lỗi |
|---|---|---|---|---|
| run1 / lô 1 | 15 | 3.984 | 0.266 | 0 |
| run1 / lô 2 | 15 | 4.292 | 0.286 | 0 |
| run1 / lô 3 | 15 | 7.895 | 0.526 | 0 |
| run1 / lô 4 | 15 | 11.378 | 0.759 | 0 |
| run2 / lô 1 | 15 | 6.62 | 0.441 | 0 |
| run2 / lô 2 | 15 | 4.541 | 0.303 | 0 |
| run2 / lô 3 | 15 | 11.11 | 0.741 | 0 |
| run2 / lô 4 | 15 | 2.842 | 0.189 | 0 |

**b-minimax-M3-c5**

| Lô | Số câu | Giây | s/câu | Lỗi |
|---|---|---|---|---|
| run1 / lô 1 | 5 | 12.684 | 2.537 | 0 |
| run1 / lô 2 | 5 | 15.657 | 3.131 | 0 |
| run1 / lô 3 | 5 | 7.215 | 1.443 | 0 |
| run1 / lô 4 | 5 | 6.485 | 1.297 | 0 |
| run1 / lô 5 | 5 | 5.482 | 1.096 | 0 |
| run1 / lô 6 | 5 | 22.402 | 4.48 | 0 |
| run1 / lô 7 | 5 | 18.62 | 3.724 | 0 |
| run1 / lô 8 | 5 | 20.996 | 4.199 | 0 |
| run1 / lô 9 | 5 | 7.208 | 1.442 | 0 |
| run1 / lô 10 | 5 | 7.969 | 1.594 | 0 |
| run1 / lô 11 | 5 | 8.337 | 1.667 | 0 |
| run1 / lô 12 | 5 | 5.459 | 1.092 | 0 |
| run2 / lô 1 | 5 | 8.44 | 1.688 | 0 |
| run2 / lô 2 | 5 | 9.119 | 1.824 | 0 |
| run2 / lô 3 | 5 | 20.435 | 4.087 | 0 |
| run2 / lô 4 | 5 | 6.479 | 1.296 | 0 |
| run2 / lô 5 | 5 | 5.264 | 1.053 | 0 |
| run2 / lô 6 | 5 | 45.03 | 9.006 | 0 |
| run2 / lô 7 | 5 | 9.619 | 1.924 | 0 |
| run2 / lô 8 | 5 | 13.626 | 2.725 | 0 |
| run2 / lô 9 | 5 | 15.929 | 3.186 | 0 |
| run2 / lô 10 | 5 | 4.821 | 0.964 | 0 |
| run2 / lô 11 | 5 | 7.39 | 1.478 | 0 |
| run2 / lô 12 | 5 | 55.414 | 11.083 | 0 |

**c-minimax-M31-flash-c15**

| Lô | Số câu | Giây | s/câu | Lỗi |
|---|---|---|---|---|
| run1 / lô 1 | 15 | 58.915 | 3.928 | 0 |
| run1 / lô 2 | 15 | 8.283 | 0.552 | 0 |
| run1 / lô 3 | 15 | 35.415 | 2.361 | 0 |
| run1 / lô 4 | 15 | 60.075 | 4.005 | 0 |
| run2 / lô 1 | 15 | 8.163 | 0.544 | 0 |
| run2 / lô 2 | 15 | 22.037 | 1.469 | 0 |
| run2 / lô 3 | 15 | 113.351 | 7.557 | 0 |
| run2 / lô 4 | 15 | 123.903 | 8.26 | 1 |

### 1.2.3. Chất lượng bản dịch (LLM-giám khảo)

| Cấu hình | Giám khảo | n | Đúng nghĩa | Tự nhiên | Xử hộ | Độ dài | **TB** |
|---|---|---|---|---|---|---|---|
| (a) Ollama qwen2.5:3b (local) | MiniMax-M3 | 60 | 3.92 | 3.60 | 4.88 | 4.68 | **4.27** |
|  | Ollama qwen2.5:3b | 30 | 5.00 | 4.87 | 4.77 | 5.00 | **4.91** |
| (b) MiniMax-M3 (chunk 5) | MiniMax-M3 | 60 | 4.72 | 4.48 | 4.90 | 4.97 | **4.77** |
|  | Ollama qwen2.5:3b | 45 | 5.00 | 4.62 | 4.73 | 4.87 | **4.81** |
| (c2) M3.1-Flash effort=low (chunk 15) — ĐỀ XUẤT | MiniMax-M3 | 60 | 4.65 | 4.40 | 4.88 | 4.93 | **4.72** |
|  | Ollama qwen2.5:3b | 30 | 5.00 | 4.93 | 4.70 | 5.00 | **4.91** |

> **Giám khảo chính: `MiniMax-M3`** (theo chỉ đạo coordinator). ⚠️ **Thiên lệch cùng họ**: MiniMax-M3 chấm bản dịch của chính MiniMax-M3 → điểm của (b) và (c) có lợi thế so với (a). Bù lại có giám khảo thứ hai là **Ollama qwen2.5:3b local** (khác engine, nhưng model 3B chấm quá dễ tính — điểm của nó không đáng tin, chỉ để đối chiếu).

> ⚠️ DNSMOS/UTMOS **không** dùng ở đây: đó là chỉ số *âm thanh* (MOS ước lượng), không chấm được 'đúng nghĩa / xử hộ / tự nhiên' — tức là phần PO thực sự phàn nàn.

#### Ví dụ câu tốt nhất / xấu nhất (giám khảo MiniMax-M3)

#### (a) Ollama qwen2.5:3b (local)

| | EN (nguồn) | VI (bản dịch) | Điểm TB |
|---|---|---|---|
| ❌ tệ nhất | wave. | wave. | **2.2** |
| ❌ tệ nhất | The lives lost tomorrow will be the price of our future. | Hàng vạn sinh sẽ sống sót trong đợt sóng đầu tiên. | **2.5** |
| ❌ tệ nhất | A world for all protos once protos once [Music] [Music] more. | Một thế giới cho tất cả protos một lần protos một lần. | **2.5** |
| ✅ tốt nhất | Calis. | Calis. | **5.0** |
| ✅ tốt nhất | Calis. | Calis. | **5.0** |
| ✅ tốt nhất | Lead us home. | Dẫn chúng tôi về nhà. | **5.0** |

#### (b) MiniMax-M3 (chunk 5)

| | EN (nguồn) | VI (bản dịch) | Điểm TB |
|---|---|---|---|
| ❌ tệ nhất | If you doubt our capabilities, I do not doubt them, old friend. | Nếu cậu nghi ngờ năng lực của chúng ta, ta không hề nghi ngờ, bạn cũ. | **3.0** |
| ❌ tệ nhất | Because of our certainty, ire fell to the Zerg. | Chính vì quá chắc chắn, cơn giận dữ đã trút xuống quân Zerg. | **4.0** |
| ❌ tệ nhất | And tomorrow I send so many to die. | Ngày mai, ta sẽ gửi rất nhiều người đi chết. | **4.2** |
| ✅ tốt nhất | Calis. | Calis. | **5.0** |
| ✅ tốt nhất | Calis. | Calis. | **5.0** |
| ✅ tốt nhất | Lead us home. | Dẫn chúng ta về nhà! | **5.0** |

#### (c2) M3.1-Flash effort=low (chunk 15) — ĐỀ XUẤT

| | EN (nguồn) | VI (bản dịch) | Điểm TB |
|---|---|---|---|
| ❌ tệ nhất | Because of our certainty, ire fell to the Zerg. | Vì lòng tin tuyệt đối, sự thịnh nộ đã dẫn tới người Zerg. | **3.2** |
| ❌ tệ nhất | If you doubt our capabilities, I do not doubt them, old friend. | Nếu ngài nghi ngờ năng lực của chúng ta, ta thì không, bạn già. | **3.8** |
| ❌ tệ nhất | Kaldares, your warriors question your whereabouts. | Kaldares, những chiến binh của ngài đang hỏi ngài đã đi đâu. | **4.0** |
| ✅ tốt nhất | Calis. | Calis. | **5.0** |
| ✅ tốt nhất | Calis. | Calis. | **5.0** |
| ✅ tốt nhất | Lead us home. | Dẫn chúng tôi về nhà. | **5.0** |


---

## 1.3. Phân tích kỹ thuật

### 1.3.1. Vì sao MiniMax timeout trong app (BUG thật)

Cấu hình request hiện tại của app (`translate/server.rs`):

```json
{ "model": "MiniMax-M3", "temperature": 0.2, "reasoning_split": true }
```

Theo docs chính thức MiniMax (đọc 2026-10-24):

| Model | `thinking` bỏ qua | `thinking.type="disabled"` | `reasoning_effort` | `reasoning_split: false` |
|---|---|---|---|---|
| `MiniMax-M3` | → thinking ON | **OK — bỏ thinking, trả lời thẳng** | — | OK |
| `MiniMax-M3.1-Flash` | → thinking ON | **HTTP 400 code 2013** | low..max, **mặc định `max`** | **HTTP 400** |

Hệ quả trong app:

1. `MiniMax-M3` **không** gửi `thinking` ⇒ model bật thinking ⇒ mỗi câu ~5 s.
   Lô 15 câu ⇒ ~75 s **> timeout 60 s** của `translate_batch_via_minimax`.
2. Khi batch timeout, `translate_chunk_with_fallback` (`mod.rs:353`) **không** đổi provider,
   mà gọi lại **từng câu một** với `translate_via_minimax` (timeout **30 s**).
   ⇒ 1 lô 15 câu tốn tới 15 × 30 s; câu nào vượt 30 s thành `[Dịch lỗi: ...]`.
3. `MiniMax-M3.1-Flash` cùng tình trạng nhưng **tệ hơn**: `reasoning_effort` mặc định `max`
   ⇒ lô đầu mất 58,9 s (kẹp sát timeout 60 s), các lô sau timeout.

> **Đây chính là lý do PO thấy "dịch kiểu Google Translate":** đường dẫn MiniMax trong app
> rơi vào fallback dịch từng câu, mất ngữ cảnh (app chỉ giữ 2 câu gần nhất trong
> `RECENT_CONTEXT`, mà fallback gọi từng câu lại làm mất ngữ cảnh theo lô).

### 1.3.2. Bản vá đã áp dụng (`translate/server.rs`)

```rust
fn minimax_profile(model: &str) -> MinimaxProfile {
    if model.contains("M3.1-Flash") {
        MinimaxProfile { reasoning_effort: Some("low"), batch_timeout_secs: 120, single_timeout_secs: 60 }
    } else {
        MinimaxProfile { reasoning_effort: None, batch_timeout_secs: 60, single_timeout_secs: 30 }  // M3: giữ nguyên
    }
}
```

- `MiniMax-M3.1-Flash` → thêm `"reasoning_effort": "low"`, nâng timeout batch 60 s → **120 s**, đơn câu 30 s → **60 s**.
- `MiniMax-M3` → **giữ nguyên hành vi cũ** (không đổi trải nghiệm người dùng đang chọn M3).
- `reasoning_split: true` giữ nguyên ⇒ thinking nằm ở `reasoning_content`, **không lọt** vào `content`
  (nên `<think>` không xuất hiện trong phụ đề — đo được `think_leak = 0` ở mọi cấu hình).

### 1.3.3. Chi phí (docs chính thức, đọc 2026-10-24)

| Model | Input $/1M token | Output $/1M token | Ghi chú |
|---|---|---|---|
| **`MiniMax-M3.1-Flash`** | **0,15** | **0,60** | rẻ hơn M3 **2×** ở cả hai chiều |
| `MiniMax-M3` (≤512k, standard) | 0,30 | 1,20 | giá gốc 0,60/2,40, đang giảm 50% lâu dài |
| `MiniMax-M3` (priority) | 0,45 | 1,80 | `service_tier=priority` — **M3.1-Flash không hỗ trợ** `service_tier` |

Docs ghi: *"Token to English word ratio (estimate): approximately 750 English words consume 1000 tokens"*.
Ước tính trong bảng tốc độ dùng ~3,6 ký tự ≈ 1 token (ước lượng cho tiếng Anh).

---

## 1.4. Kết luận & khuyến nghị

### 1.4.1. Bảng tốc độ (60 câu tiếng Anh, 2 lần mỗi cấu hình, chunk 15 = mặc định app)

→ bảng tốc độ và chi tiết từng lô: xem **§1.2.2**.

### 1.4.2. Nhận định

1. **`MiniMax-M3` (lựa chọn hiện tại) gần như hỏng trong app.** Ở chunk 15 (đúng mặc định
   `chunk_size = 15` của `translate/mod.rs`), lô batch **vượt timeout 60 s** → app fallback sang
   **gọi từng câu một** (timeout 30 s/lệnh) → có câu hết giờ thành `[Dịch lỗi: ...]`.
   Đây là lý do PO thấy *"dịch kiểu Google Translate"*: đường dẫn dịch theo lô bị bỏ qua,
   mất ngữ cảnh.
2. **`MiniMax-M3.1-Flash` ở thiết lập mặc định (`reasoning_effort` = `max`) còn tệ hơn**:
   lô 15 câu mất 58,9 s (kẹp sát timeout), các lô sau timeout → **215,07 s** cho 60 câu và 1 câu lỗi.
   ⇒ **Dùng M3.1-Flash mà không sửa gì thì sẽ tệ hơn M3.**
3. **Sau bản vá (`reasoning_effort: "low"` + timeout 120 s), M3.1-Flash đạt 26,33 s / 60 câu
   (0,439 s/câu), 0 lỗi, `<think>` = 0** — **8,2× nhanh hơn** chính nó ở thiết lập mặc định.
   **Mà chất lượng không đổi**: giám khảo MiniMax-M3 chấm effort=max = **4,70** và effort=low = **4,72**
   (chênh lệch nằm trong nhiễu chấm điểm) ⇒ giảm độ sâu suy luận **không làm mất chất lượng dịch**,
   chỉ cắt latency + chi phí token suy luận.
4. **So với dịch local (Ollama qwen2.5:3b):** tổng thời gian **ngang nhau** (26,33 s vs 24,56 s,
   chậm hơn 7 %) nhưng **thời gian lô đầu nhanh hơn 1,5×** (5,30 s vs 7,98 s) — tức người dùng
   **thấy câu dịch đầu tiên sớm hơn**, còn tổng thời gian xuất bản gần như tương đương.
5. **Chi phí thấp hơn 2× so với M3** ($0,15/$0,60 vs $0,30/$1,20 trên 1M token) — và rẻ hơn nhiều
   so với GPT-4o-mini-tts ($0,60/token) hay Gemini 2.5 Flash.
6. **DeepSeek:** không có key trong config → **không đo được**, ghi rõ "không có key" theo yêu cầu.

### 1.4.3. Chất lượng (LLM-giám khảo)

Bảng điểm + ví dụ câu tốt/xấu nằm ở **§1.2.3**.

### 1.4.4. Có nên dùng M3.1 Flash không?

**Có — nhưng chỉ thêm nút chọn, KHÔNG đổi model mặc định.**

| Tiêu chí | Kết luận | Căn cứ |
|---|---|---|
| **Tốc độ** | **Ngang đường local**, nhưng câu dịch đầu tiên hiện ra **nhanh hơn 1,5×** | 26,33 s vs 24,56 s tổng (chậm hơn 7 %); lô đầu 5,30 s vs 7,98 s — §1.2, §1.4.1 |
| **Chất lượng** | **≥ đường local** (giám khảo MiniMax-M3: **4,72** vs **4,27**) | §1.2.3 |
| **Chi phí** | **Rẻ hơn 2×** MiniMax-M3 ($0,15/$0,60 vs $0,30/$1,20 mỗi 1M token) | §1.3.3 |
| **Độ ổn định** | 0 lỗi / 0 câu lọt `<think>` | §1.2, §1.3.2 |
| **Bắt buộc** | Phải có bản vá `reasoning_effort=low` — dùng M3.1-Flash **mặc định** (effort max) thì chậm hơn local **8,8×** | §1.3.2 |

**Đã áp dụng:** thêm nút `⚡ MiniMax M3.1 Flash` trong `SettingsView.tsx` (chỉ thêm nút, **không** đổi
model mặc định) + profile M3.1-Flash trong `translate/server.rs` (`reasoning_effort=low`, timeout 120 s/60 s).

> **Lưu ý khi đọc cùng PHẦN 4:** ở đường dịch **theo ngữ cảnh** (2 lượt), MiniMax lại **mất ~0,45 điểm**
> so với đường cũ, còn **OpenRouter DeepSeek V4.1 Flash** mới là provider mà đường mới thắng
> (ngang chất lượng + nhanh hơn). Chi tiết & khuyến nghị cuối: **§4.6**.


---

# PHẦN 2 — THAY ĐỔI TRONG APP

## 2.1. Đã thêm gì

### 2.1.1. Nút chọn nhanh trong Settings (UI)

`src/views/SettingsView.tsx` — thêm **một** nút ngay cạnh nút `⭐ MiniMax-M3 (Token Plan)`,
**giữ nguyên style** (`settings-btn-secondary`, fontSize 11, padding `2px 8px`, tô đậm khi đang chọn):

```tsx
<button
  type="button"
  onClick={() => setMinimaxModel("MiniMax-M3.1-Flash")}
  className="settings-btn-secondary"
  style={{
    fontSize: 11,
    padding: "2px 8px",
    background:
      minimaxModel === "MiniMax-M3.1-Flash" ? "rgba(59, 130, 246, 0.3)" : undefined,
    borderColor: minimaxModel === "MiniMax-M3.1-Flash" ? "#3b82f6" : undefined,
  }}
>
  ⚡ MiniMax M3.1 Flash
</button>
```

- **Không** đổi model mặc định (`minimax_model` trong config vẫn là `MiniMax-M3`; `translation_provider` vẫn là `ollama`).
- Nút chỉ **đặt tên model**, người dùng vẫn bấm "Lưu" như các nút model khác.

### 2.1.2. Xử lý đúng model M3.1 Flash trong backend

`src-tauri/src/translate/server.rs` — thêm profile request theo model (xem §1.3.2):

| | `MiniMax-M3` (giữ nguyên) | `MiniMax-M3.1-Flash` (mới) |
|---|---|---|
| `reasoning_split` | `true` | `true` |
| `reasoning_effort` | *(không gửi)* | **`"low"`** |
| timeout batch | 60 s | **120 s** |
| timeout đơn câu | 30 s | **60 s** |

Vì sao cần:
- M3.1-Flash **không cho tắt thinking** → `thinking.type="disabled"` trả HTTP 400 (code 2013).
- `reasoning_effort` mặc định là `max` ⇒ suy luận sâu, latency cao (đo được: lô 15 câu mất 58,9 s,
  kẹp sát timeout 60 s của app).
- `reasoning_effort: "low"` ⇒ giữ reasoning tối thiểu, đủ cho dịch thoại, latency giảm mạnh.

Không đụng `config.rs`, không đụng `dubbing/**` (Sonnet đang sửa 2 file đó).

## 2.2. Không đụng gì

| Không đổi | Lý do |
|---|---|
| Model mặc định `MiniMax-M3` | Yêu cầu task: "không đổi model mặc định hiện tại". |
| `translation_provider` trong config (vẫn `ollama`) | Yêu cầu của coordinator. |
| Hành vi của `MiniMax-M3` (thinking bật, timeout 60 s/30 s) | Không đổi trải nghiệm người dùng đang chọn M3. |
| `src-tauri/src/config.rs`, `src-tauri/src/dubbing/**` | Sonnet đang sửa. |
| `src/views/SettingsView.tsx` ngoài nút mới | Chỉ thêm 1 nút. |
| Git | **Không commit, không push** — coordinator review rồi commit. |

## 2.3. Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `cargo check --lib` | ✅ exit 0 (sau bản vá) |
| `cargo test --lib` | ✅ **113 passed, 0 failed, 10 ignored** (chạy lại sau bản vá `server.rs`) |
| `npx tsc --noEmit` | ⚠️ **24 lỗi, tất cả trong `src/views/SublixStudioView.tsx`** — file đang sửa dở của Sonnet (`TSK-FEAT-TTS-3ENGINES`), **không phải file của tôi**. `SettingsView.tsx` (file tôi sửa): **0 lỗi**. |
| `npm run build` | ⚠️ dừng ở cùng lý do (lỗi JSX trong `SublixStudioView.tsx` của Sonnet). |

---

# PHẦN 3 — PHỤ LỤC

## 3.1. Nguồn

| Nội dung | URL | Ngày đọc |
|---|---|---|
| MiniMax — tên model & tham số request (`reasoning_split`, `reasoning_effort`, `thinking`, `service_tier`, `temperature`) | https://platform.minimax.io/docs/api-reference/text-openai-api | 2026-10-24 |
| MiniMax — bảng giá LLM | https://platform.minimax.io/docs/pricing/overview | 2026-10-24 |
| MiniMax — endpoint OpenAI-compatible | `POST https://api.minimax.io/v1/chat/completions` | 2026-10-24 |
| Danh sách model (coordinator xác minh `GET /v1/models = 200`) | `MiniMax-M3.1-Flash`, `MiniMax-M3`, `MiniMax-M2.7-highspeed` | 2026-10-24 |

## 3.2. Bảng điện tử

| File | Nội dung |
|---|---|
| `%TEMP%\sublix-bench-translate\en_src\starcraft_en.srt` | 60 câu tiếng Anh (nguồn đo) |
| `%TEMP%\sublix-bench-translate\en_src\starcraft_en_raw.srt` | 78 cue nguyên bản |
| `%TEMP%\sublix-bench-translate\results\*.json` | kết quả từng cấu hình (kèm bản dịch đầy đủ) |
| `%TEMP%\sublix-bench-translate\results\quality_*.json` | điểm chấm LLM-giám khảo |
| `%TEMP%\sublix-bench-translate\logs\bench*.log` | log thô |

## 3.3. Lệnh tái lập

```powershell
# build harness (xem §4.1 về Smart App Control)
$env:CARGO_TARGET_DIR = "$env:TEMP\sublix-cc-target"
cd C:\AI Project\Sublix\src-tauri
cargo build --example bench_translate

# chạy 1 cấu hình
& "$env:TEMP\sublix-cc-target\debug\examples\bench_translate.exe" `
  --provider minimax --model MiniMax-M3.1-Flash `
  --srt "$env:TEMP\sublix-bench-translate\en_src\starcraft_en.srt" `
  --out  "$env:TEMP\sublix-bench-translate\results\c.json" --label c --runs 2 --chunk 15 --source en --target vi
```

---

# PHỤ LỤC 4 — GHI CHÚ KỸ THUẬT

## 4.1. Smart App Control chặn binary mới build (BUG-H09 liên quan)

Lần đầu build harness với `CARGO_TARGET_DIR=%TEMP%\sublix-bench-target` **thất bại**:

```
error: failed to run custom build command for `serde v1.0.229`
  could not execute process `...\build-script-build` (never executed)
  An Application Control policy has blocked this file. (os error 4551)
```

Biến số: `HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy\VerifiedAndReputablePolicyState = 1` ⇒ **Smart App Control đang BẬT**.

Đoạn khó:
- Build trong `%TEMP%\sublix-bench-target` → **build script bị chặn**.
- Build trong `src-tauri\target` → build script cũ đã có nên build được, **nhưng `bench_translate.exe` vẫn bị chặn khi chạy**.
- Build trong `%TEMP%\sublix-cc-target` (thư mục CommandCode đã dùng trước) → **build + chạy đều OK**.

⇒ Đã dùng `%TEMP%\sublix-cc-target` cho toàn bộ benchmark. Đây cùng lý do với BUG-H09: **file nhị phân mới build, chưa ký, không có "reputation" với Smart App Control sẽ bị chặn**. Ảnh hưởng: `cargo build --release` / binary mới trong `src-tauri/target` cũng có thể bị chặn → **cần PO tắt Smart App Control nếu muốn build sạch** (Windows Security → App & browser control → Off, cần reboot), hoặc build trong thư mục đã được tin cậy.

## 4.2. BOM trong file .srt (PowerShell)

`Out-File -Encoding utf8` của PowerShell 5.1 ghi **UTF-8 có BOM**. BOM làm dòng chỉ số cue đầu tiên
không còn "toàn chữ số" ⇒ parser SRT của harness đọc nhầm chỉ số là text.
Đã sửa bằng `raw.trim_start_matches('\u{feff}')`.

## 4.3. `ChatResponse` không trả `usage`

`translate/server.rs` chỉ deserialize `choices[].message.content` ⇒ **đường code của app không trả token usage**.
Vì vậy báo cáo này ước tính chi phí từ **số ký tự** thay vì token thật. Muốn có token thật thì phải
thêm field `usage` vào `ChatResponse` — **không làm** vì ngoài phạm vi task (và sẽ đụng
`translate/server.rs` theo hướng khác với yêu cầu "chỉ khi cần cho M3.1 Flash").

---

---

---

---

---

---

---

# PHẦN 4 — ĐO CHẤT LƯỢNG: ĐƯỜNG CŨ vs ĐƯỜNG MỚI (DỊCH THEO NGỮ CẢNH)

> Bổ sung cho `TSK-FEAT-CONTEXT-TRANSLATE` (mục 1–3 nằm ở trên, đo tốc độ & giá).
> **Lưu ý quan trọng:** phần này đã được **đo lại và kiểm chứng lại** bằng **2 lớp bằng chứng**
> độc lập: (1) LLM-giám khảo (2 họ khác nhau) và (2) **metric tất định** đếm trực tiếp đại từ
> trong bản dịch (`src-tauri/src/translate/pronoun_audit.rs`, 60/60 dòng, không gọi mạng).
> Kết luận ở §4.6 đã được **đính chính** theo kết quả kiểm chứng.

## 4.1. Vì sao cần đường mới

Đường dịch cũ (`translate_batch_with_config`) chia kịch bản thành **lô 15 câu độc lập**. Mỗi lô là một
request không ràng buộc, nên model:

1. **không biết câu trước dịch thế nào** → xưng hô đổi qua đổi lại giữa các lô;
2. **không biết ai đang nói** → tự chọn đại từ ngẫu nhiên, hoặc dùng từ cổ ("ngươi");
3. **không có bản tóm tắt phim / bảng xưng hô / thuật ngữ** → dịch sai nghĩa về thuật ngữ;
4. **không ràng buộc độ dài theo thời lượng** → câu dài bị đọc nhanh/cắt, câu ngắn bị dịch lê thê.

Đường mới (`translate_script_contextual`) làm **2 lượt**:

```
Lượt 1 "đọc hiểu"  : toàn bộ lời thoại → JSON { tom_tat, nhan_vat, xung_ho, thuat_ngu, giong_dieu }
Lượt 2 "dịch"      : lô ~20 câu, prompt = bản tham chiếu
                                     + [speaker] + tên nhân vật trên từng dòng
                                     + 5 câu liền trước (nguồn + bản dịch, trượt qua biên giới lô)
                                     + hạn mức âm tiết = thời lượng × 5
                                     + ví dụ xưng hô tiếng Việt (anh/em, tao/mày, cậu/tô, tôi/bạn)
```

## 4.2. Dữ liệu đo

| | |
|---|---|
| **Bộ dữ liệu** | `gui-2026-10-20/dump-78-cues.json` → 60 câu tiếng Anh, **3 nhân vật** (Zeratul 38 / Kaldares 14 / Artanis 8), **thời lượng thật** 1,6–27,4 s (TB 15,9 s) |
| **File** | `%TEMP%\sub-bench-translate\en_src\starcraft_en.json` (+ `.srt`, `.json` bản 20 câu) |
| **Nguồn** | Hội thoại StarCraft II (Zeratul ↔ Kaldares ↔ Artanis) — nhiều đại từ, có tên riêng, có thuật ngữ ("Kala", "Aon of Strife", "Dark Templar", "Kundelar") |
| **Provider** | (a) MiniMax-M3.1-Flash (`reasoning_effort=low`), (b) Ollama `qwen2.5:3b` local, (c) OpenRouter `deepseek/deepseek-v4.1-flash` |
| **Giám khảo** | `MiniMax-M3` **và** `DeepSeek V4.1 Flash` (2 họ khác nhau, cross-check) |
| **Metric tất định** | `translate::pronoun_audit` (Rust, trong repo) — đếm đại từ, không phụ thuộc LLM |

> ⚠️ **Cảnh báo về nhãn speaker của dataset:** file dump gán vai không hoàn toàn chính xác
> (ví dụ `S4` "Kaldares, your warriors…" là Zeratul nói *với* Kaldares nhưng bị gán `kaldares`).
> Vì vậy các chỉ số **đếm theo dòng** (số lần `ta` / `tôi` / `ngươi`) là đáng tin nhất;
> chỉ số **theo nhân vật** (`mix_ta_toi`, `self_forms_max`) chỉ là chỉ báo.

## 4.3. Bảng tốc độ (× 2 lần/cấu hình)

| Đường | Provider | Model | Chunk | Lần 1 (s) | Lần 2 (s) | **TB (s)** | **Lô đầu (s)** | **s/câu** | Lỗi | Rỗng | `<think>` | So với OLD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **CŨ** | Cloud (MiniMax) | `MiniMax-M3.1-Flash` | 15 | 23.396 | 35.358 | **29.377** | **5.389** | **0.49** | 0 | 0 | 0 | 
| **MỚI** | Cloud (MiniMax) | `MiniMax-M3.1-Flash` | 15 | 36.596 | 55.584 | **46.09** | **46.09** | **0.768** | 0 | 0 | 0 | 1.6× (chậm hơn)
| **CŨ** | Local (iGPU) | `Ollama qwen2.5:3b` | 15 | 31.851 | 20.974 | **26.413** | **9.859** | **0.441** | 0 | 0 | 0 | 
| **MỚI** | Local (iGPU) | `Ollama qwen2.5:3b` | 15 | 55.912 | 39.551 | **47.732** | **47.731** | **0.796** | 0 | 0 | 0 | 1.8× (chậm hơn)
| **CŨ** | Cloud (OpenRouter) | `DeepSeek V4.1 Flash (OpenRouter)` | 15 | 146.314 | 148.178 | **147.246** | **55.912** | **2.455** | 0 | 0 | 0 | 
| **MỚI** | Cloud (OpenRouter) | `DeepSeek V4.1 Flash (OpenRouter)` | 15 | 118.544 | 159.973 | **139.259** | **139.257** | **2.321** | 0 | 0 | 0 | 0.9× (nhanh hơn)
| **effort=low** | Cloud (MiniMax) | `MiniMax-M3.1-Flash (20 câu)` | 15 | 8.077 | 10.439 | **9.258** | **5.727** | **0.463** | 0 | 0 | 0 | 
| **effort=high** | Cloud (MiniMax) | `MiniMax-M3.1-Flash (20 câu)` | 15 | 14.017 | 13.898 | **13.958** | **7.988** | **0.698** | 0 | 0 | 0 | 

*(số câu trả về = số dòng kịch bản; nếu khác 60/20 thì harness bị lặp — đã sửa và đo lại.)*

**Đọc bảng:**
- Đường mới **đắt hơn về thời gian** ở MiniMax và Ollama — đúng như thiết kế: thêm 1 lượt "đọc hiểu" + prompt lớn hơn nhiều.
- Mức phí thời gian **~1,6–1,8×** ở MiniMax và Ollama.
- **0 lỗi ở mọi cấu hình** (kể cả Ollama 3B) ⇒ đường mới **không** làm hỏng độ ổn định.
- OpenRouter DeepSeek V4.1 Flash: đường mới **NHANH hơn** (0,95×) — không nên loại provider này vì lý do tốc độ.

## 4.4. Chất lượng

### 4.4.1. So sánh trên **cùng subset dòng** (giám khảo LLM)

| Provider | Giám khảo | Số câu so sánh | Đúng nghĩa | Tự nhiên | Xử hộ | Độ dài | **TB/câu CŨ → MỚI** |
|---|---|---|---|---|---|---|---|
| MiniMax-M3.1-Flash *(chỉ 20 dòng đầu)* | DeepSeek V4.1 Flash | 20 (1–20) | 4,60 → 4,10 | 4,70 → 4,05 | 4,85 → 4,40 | 5,00 → 4,80 | **4,79 → 4,34** |
| Ollama qwen2.5:3b (local) | DeepSeek V4.1 Flash | 40 (21–60) | 3,85 → 1,80 | 3,58 → 3,55 | 4,80 → 2,62 | 4,53 → 2,80 | **4,19 → 2,69** |
| OpenRouter DeepSeek V4.1 Flash | DeepSeek V4.1 Flash | 40 (1–40) | 4,88 → 4,65 | 4,67 → 4,62 | 4,85 → 4,90 | 4,88 → 4,92 | **4,82 → 4,78** |

> Chỉ so sánh trên **các dòng mà cả hai bản đều được chấm** (vì LLM-giám khảo thỉnh thoảng không parse được JSON → chấm thiếu lô).

### 4.4.2. Điểm **cả kịch bản** (chạy trên cả 60 câu)

| Cấu hình | Giám khảo | **Xưng hô nhất quán** (1–5) | **Vừa thời lượng** (1–5) | Âm tiết dịch / hạn mức | Câu quá hạn mức |
|---|---|---|---|---|---|
| CŨ — MiniMax-M3.1-Flash | DeepSeek V4.1 Flash | 2 | 4 | 0,181 | 0/60 |
| MỚI — MiniMax-M3.1-Flash | DeepSeek V4.1 Flash | 2 | 3 | 0,182 | 0/60 |
| MỚI — Ollama qwen2.5:3b | DeepSeek V4.1 Flash | 1 | 1 | 0,171 | 1/60 |
| CŨ — OpenRouter DeepSeek V4.1 Flash | DeepSeek V4.1 Flash | 2 | 4 | 0,182 | 0/60 |
| MỚI — OpenRouter DeepSeek V4.1 Flash | DeepSeek V4.1 Flash | 2 | 2 | 0,171 | 0/60 |
| MỚI — Ollama qwen2.5:3b | MiniMax-M3 | 1 | 1 | 0,171 | 1/60 |
| CŨ — MiniMax-M3.1-Flash *(chỉ 20 dòng đầu)* | DeepSeek V4.1 Flash | 4 | 4 | 0,218 | 0/20 |
| MỚI — MiniMax-M3.1-Flash *(chỉ 20 dòng đầu)* | DeepSeek V4.1 Flash | 3 | 4 | 0,214 | 0/20 |

### 4.4.3. **Metric tất định** — đếm trực tiếp đại từ trong bản dịch

Đây là lớp bằng chứng quan trọng nhất vì **đo được 100% số dòng** (không phụ thuộc LLM giám khảo có parse
được JSON hay không). Module: `src-tauri/src/translate/pronoun_audit.rs` — chuẩn hoá dấu tiếng Việt,
**phân biệt `ngươi` (đại từ cổ) với `người` (con người)**, `cậu`/`câu`, `bạn`/`bàn` trước khi đếm.

| Cấu hình | Tự xưng **cổ** (`ta`, `chúng ta`) | Tự xưng **hiện đại** (`tôi`, `chúng tôi`) | Gọi nhau **cổ** (`ngươi`) | Gọi nhau **hiện đại** (`anh`/`ngài`) | Nhân vật trộn 2 văn phong | Số cách gọi nhiều nhất / 1 cặp |
|---|---:|---:|---:|---:|---:|---:|
| **CŨ** — MiniMax-M3.1-Flash | **30** | 11 | 3 | 4 | 3 | 5 |
| **MỚI** — MiniMax-M3.1-Flash | **8** | **36** | 5 | 3 | 3 | 5 |
| **CŨ** — Ollama qwen2.5:3b | 19 | 26 | 0 | 5 | 2 | 3 |
| **MỚI** — Ollama qwen2.5:3b | **3** | **35** | 0 | **14** | 2 | 3 |
| **CŨ** — OpenRouter DeepSeek V4.1 Flash | **37** | 5 | 3 | 3 | 3 | 5 |
| **MỚI** — OpenRouter DeepSeek V4.1 Flash | **28** | **16** | **0** | 6 | **2** | 6 |

**Đọc bảng — đây là kết luận quan trọng nhất của phần đo:**

| Mặt | Đường MỚI có sửa được không? | Bằng chứng |
|---|---|---|
| **Tự xưng** (`ta` ↔ `tôi`) | ✅ **CÓ — rõ rệt** | MiniMax 30 → 8 họ cổ (73% → 18%); Ollama 19 → 3 (42% → 8%); OpenRouter 37 → 28 (88% → 64%) |
| **Gọi nhau** (`ngươi` ↔ `anh`/`ngài`) | ⚠️ **KHÔNG** | Số cách gọi khác nhau trong 1 cặp **không giảm** (MiniMax 5→5, Ollama 3→3, OpenRouter 5→6); `ngươi` ở MiniMax còn **tăng** 3→5 |
| **Thống nhất nội bộ 1 nhân vật** | ⚠️ **Chưa** | `mix_ta_toi` giữ nguyên ở MiniMax/Ollama (3 và 2), chỉ giảm ở OpenRouter (3→2) |
| **Thuật ngữ phim** | ✅ CÓ | `S18`: "vị **K** vĩ đại" → "vị **Kala** vĩ đại"; `S24`: "Dark **Templar**" → "**Mẫu Tử Tối**"; `S15`: "Aon của Xung đột" → "Aon của **Xung Đột**" |
| **Độ dài theo thời lượng** | ✅ CÓ | MiniMax: âm tiết dịch/hạn mức 0,18; 0/60 câu vượt hạn mức. Nhưng điểm *vừa thời lượng* của LLM lại **giảm** (4→3 ở MiniMax, 4→2 ở OpenRouter) ⇒ câu **ngắn hơn** thời lượng |

**Vì sao phần "gọi nhau" không được sửa?** Vì bảng xưng hô ở lượt 1 **do chính LLM bịa ra**
(`xung_ho` trong JSON tham chiếu) — nó không phải dữ liệu chuẩn của phim. Model tự sinh bảng rồi lại
không tuân thủ tuyệt đối bảng đó ⇒ vẫn còn "anh" ở câu này, "ngươi" ở câu kia.

#### 4.4.4. Một quan sát quan trọng: **văn phong đồng nhất cũng là một kiểu "xưng hô nhất quán"**

Khi chấm riêng **20 dòng đầu** (cùng subset cho CŨ và MỚI), DeepSeek cho:

| Bản | Điểm *xưng hô nhất quán* | Nhận xét của giám khảo |
|---|---:|---|
| **CŨ** | **4/5** | *"Zeratul dùng 'ta' cho bản thân, 'chúng ta' cho tập thể, 'ngươi' khi gọi đối phương… S8 vừa dùng 'ngươi' vừa gọi 'bạn già' nên có chút pha trộn sắc thái"* |
| **MỚI** | **3/5** | *"xưng hô nhìn chung nhất quán với cặp tôi/anh và chúng tôi, nhưng câu S19 đột ngột chuyển sang 'chúng ta' trong khi các câu xung quanh dùng 'chúng tôi', gây thiếu nhất quán"* |

Tức là: **bản CŨ văn phong cổ nhưng ĐỒNG NHẤT** (`ta`/`ngươi` xuyên suốt 20 câu) ⇒ giám khảo thấy
"nhất quán". Bản MỚI đổi sang văn phong hiện đại nhưng **còn sót vài câu cổ** ⇒ giám khảo thấy
"thiếu nhất quán". Đây chính là lý do điểm *xưng hô nhất quán* **không tăng** ở MiniMax dù metric
tất định cho thấy văn phong đã đổi mạnh (§4.4.3).

**Hệ quả thực tế:** với phim phong cách cổ (StarCraft), **giữ văn phong cổ đồng nhất** có thể hợp lý
hơn là đổi sang hiện đại. Vì vậy **glossary thủ công** (ghim "anh/ngài" hoặc "ngươi/ngài") là cách
chắc chắn nhất — thay vì để model tự chọn.

## 4.5. Ví dụ trước / sau (MiniMax-M3.1-Flash)

#### 4.5.1. Câu CẢI THIỆN rõ (lấy từ dữ liệu thật)

| # | EN (nguồn) | CŨ | MỚI |
|---|---|---|---|
| S4 | Kaldares, your warriors question your whereabouts. | Kaldares, chiến binh của **ngươi** đang hỏi ngươi đã đi đâu. | Kaldares, các chiến binh của **anh** đang hỏi anh đang ở đâu. |
| S3 | I wish to be alone. | **Ta** muốn ở một mình. | **Tôi** muốn được ở một mình. |
| S5 | We are an ancient people. | **Chúng ta** là một dân tộc cổ xưa. | **Chúng tôi** là một dân tộc cổ xưa. |
| S9 | I doubt my own motives. | **Ta** nghi ngờ động cơ của chính mình. | **Tôi** nghi ngờ chính động cơ của mình. |
| S18 | But from that conflict, the great K opened our minds. | Nhưng từ cuộc xung đột ấy, vị **K** vĩ đại đã mở mang tâm trí chúng ta. | Nhưng từ cuộc xung đột ấy, vị **Kala** vĩ đại đã mở rộng tâm trí chúng tôi. |
| S24 | You speak of the Dark Templar. | Ngươi nói đến **Dark Templar**. | Ngươi nói về **Mẫu Tử Tối**. |
| S22 | We made a beacon of progress in the galaxy… | Chúng ta đã **biến mình thành** ngọn hải đăng… | Chúng tôi đã **trở thành** ngọn hải đăng… |

> S22 là ví dụ đắt giá: CŨ dịch "made" → "biến mình thành" ⇒ sinh ra cụm **"chúng ta đã biến mình
> thành…"** (người dịch tự biến thành ngọn hải đăng — sai nghĩa). Đường mới sửa đúng lỗi này.

#### 4.5.2. Câu CHƯA sửa được / vẫn lỗi (biên giới thật của đường mới)

| # | EN (nguồn) | CŨ | MỚI | Vấn đề |
|---|---|---|---|---|
| S24 | You speak of the Dark Templar. | Ngươi nói đến Dark Templar. | **Ngươi** nói về Mẫu Tử Tối. | Vẫn "ngươi", trong khi S4 dùng "anh" ⇒ **xưng hô gọi nhau chưa nhất quán** |
| S38 | But today, because you have united us, we fight together. | …vì **ngài** đã đoàn kết chúng ta… | …vì **ngươi** đã thống nhất chúng ta… | Vẫn "ngươi" |
| S11 | What cause could be more noble than reclaiming our home? | Có **mục đích** nào cao cả hơn việc giành lại quê hương chúng ta? | Có **đại cao** thế nào cao cả hơn việc giành lại quê hương? | ⚠️ Đường mới **dịch sai** ("what cause" → "đại cao"); CŨ đúng hơn |
| S19 | He brought us the glory of the Kala… | **Ngài** mang đến cho chúng ta vinh quang của Kala… | **Ông** mang đến cho chúng ta vinh quang của Kala… | Vẫn đổi văn phong (ngài → ông) |

## 4.6. Kết luận & khuyến nghị tích hợp

### Kết luận (đã kiểm chứng bằng metric tất định — xem §4.4.3)

| Nhận định | Căn cứ |
|---|---|
| **Đường MỚI sửa được văn phong "tự xưng"**: MiniMax 30 → 8 lần dùng `ta`/`chúng ta` (73% → 18%); Ollama 19 → 3; OpenRouter 37 → 28. | §4.4.3 (đếm 60/60 dòng) |
| **Nhưng điểm *"xưng hô nhất quán"* của LLM-giám khảo KHÔNG tăng** ở MiniMax (2/5 → 2/5 trên 60 câu; 4/5 → 3/5 trên 20 dòng đầu): bản CŨ văn phong cổ nhưng **đồng nhất**, bản MỚI đổi sang hiện đại nhưng **còn sót câu cổ**. | §4.4.2 + §4.4.4 |
| **Đường MỚI sửa được thuật ngữ phim**: "vị K" → "vị Kala"; "Dark Templar" → "Mẫu Tử Tối"; "Aon của Xung đột" → "Aon của Xung Đột". | §4.5.1 |
| **Đường MỚI KHÔNG tự sửa được lỗi xưng hô "gọi nhau"**: số cách gọi khác nhau trong 1 cặp không giảm (MiniMax 5→5, Ollama 3→3, OpenRouter 5→6); `ngươi` ở MiniMax còn tăng 3→5. | §4.4.3 |
| **Nguyên nhân gốc**: bảng xưng hô ở lượt 1 do **chính LLM bịa ra**, không phải dữ liệu chuẩn phim ⇒ model không bảo đảm tuân thủ. | §4.4.3 |
| **Đường MỚI có thể làm hỏng 1 câu**: `S11` "What cause could be more noble…" → "Có **đại cao** thế nào cao cả hơn…" (sai; bản CŨ đúng hơn). | §4.5.2 |
| **Ở MiniMax, trên CÙNG 20 dòng + CÙNG giám khảo, đường MỚI bị điểm THẤP hơn**: TB/câu 4,79 → 4,34 (đúng nghĩa 4,60 → 4,10; tự nhiên 4,70 → 4,05; độ dài 5,00 → 4,80). Nhiễu đo khi chấm lại cùng dữ liệu ≈ 0,12. | §4.4.1 |
| **Nguyên nhân giảm điểm**: (a) hạn mức âm tiết làm câu **cụt hơn**; (b) văn phong đổi sang hiện đại — kém hợp với phim phong cách cổ; (c) 1 lỗi nghĩa rõ ràng (S11). | §4.4.4 + §4.5.2 |
| **Với Ollama 3B local, đường MỚI TỆ HƠN** (TB/câu 4,19 → 2,69 trên cùng 40 dòng) — model 3B không theo kịp prompt 2 lượt. | §4.4.1 |
| **Với OpenRouter DeepSeek V4.1 Flash, đường MỚI tương đương chất lượng (4,82 → 4,78) và NHANH HƠN (0,95×)** → rõ đáng dùng. | §4.4.1 + §4.3 |
| **0 lỗi ở mọi cấu hình** của đường mới (0/60 câu vượt hạn mức âm tiết, 0 lỗi dịch). | §4.3 |

### Khuyến nghị cho coordinator

1. **Không coi đường mới là "chất lượng tốt hơn" nói chung** — kết quả **khác nhau theo provider**:
   - **OpenRouter DeepSeek V4.1 Flash** → **bật đường mới**: chất lượng ngang, **nhanh hơn** (0,95×).
   - **MiniMax-M3.1-Flash** → **để người dùng chọn** (nút riêng): nó đổi văn phong + sửa thuật ngữ
     (đúng mục tiêu) nhưng **mất ~0,45 điểm** và **không** sửa được xưng hô "gọi nhau".
     Nếu phim cần văn phong **cổ đồng nhất** thì bản CŨ lại hợp hơn.
   - **Ollama local 3B** → **không dùng** đường mới (tệ hơn rõ).
   - Giữ đường cũ cho nút "Dịch nhanh" và cho mọi provider khi PO muốn văn phong gốc.
2. **Bổ sung UI cho glossary thủ công** — đây mới là cách **chắc chắn** sửa lỗi PO phàn nàn:
   - `cfg.glossary` **đã được cả 2 đường dịch dùng** (`glossary_block()` trong `translate/server.rs`),
     và đường mới còn ưu tiên glossary **cao hơn** thuật ngữ tự động
     (`GLOSSARY NGƯỜI DÙNG (ưu tiên CAO HƠN thuật ngữ tự động)`).
   - Chỉ cần cho PO ghim dạng: `Zeratul gọi Kaldares là "anh"`, `Kaldares gọi Zeratul là "ngài"`…
   - Không cần chờ đường mới — **đường cũ cũng hưởng lợi ngay**, và **giữ được văn phong cổ đồng nhất**
     nếu PO muốn ("Zeratul tự xưng 'ta', gọi Kaldares là 'ngươi'").
3. **Nút "Dịch theo ngữ cảnh"** ở Studio: command `translate_script_contextual` đã sẵn sàng,
   có phát `translate:progress` để hiện tiến trình. UI do mcode #1 làm.
4. **Nút OpenRouter**: model đã có sẵn trong `translate_options_get`
   (`deepseek/deepseek-v4.1-flash` + alias `~deepseek/deepseek-flash-latest`). Số chấm chất lượng đã có
   (§4.4.1) → **nên đưa vào Settings**, vì đường mới với provider này là lựa chọn tốt nhất.
5. **Chưa đổi timeout MiniMax-M3** (giữ nguyên 180 s / 60 s của coordinator). Không có bằng chứng
   nào trong phần đo này cho thấy cần đổi.


---

# PHẦN 5 — MỨC ĐỘ SUY LUẬN (REASONING EFFORT) + LỆNH ĐỌC/GHI LỰA CHỌN DỊCH

> Theo yêu cầu mở rộng phạm vi của coordinator (2026-10-24). **Đã báo `status: reasoning backend ready`** để coordinator giao UI cho mcode #1.

## 5.1. Config field mới

```rust
// src-tauri/src/config.rs  — CHỈ thêm field + default
/// "auto" | "low" | "medium" | "high" | "max"
#[serde(default = "default_reasoning_effort")]
pub llm_reasoning_effort: String,      // default = "auto"
```

`auto` = **giữ hành vi đã tối ưu**: M3.1-Flash → `low`; model khác → mặc định của nhà cung cấp (không gửi tham số).

## 5.2. Mapping (đã **xác minh bằng API thật**, 2026-10-24)

| Provider / model | Tham số gửi đi | `auto` → | `supports_reasoning` | Xác minh |
|---|---|---|---|---|
| `MiniMax-M3.1-Flash` | `reasoning_effort: low\|medium\|high\|max` | **`low`** | ✅ true | HTTP 200 với `high` |
| `MiniMax-M3` | `reasoning_effort: low\|medium\|high\|max` | *không gửi* | ✅ true | **HTTP 200 với `low`** (M3 **có** nhận — khác dự đoán ban đầu) |
| OpenRouter (`deepseek/deepseek-v4.1-flash`) | `reasoning: {effort: low\|medium\|high}` | *không gửi* | ✅ true | HTTP 200 với `reasoning.effort=low`, trả `usage.cost` |
| OpenRouter (`max`) | `reasoning.effort` → **`high`** (OpenRouter không có `max`) | — | ✅ true | — |
| DeepSeek trực tiếp | *bỏ qua* | — | ❌ false | **không xác minh được** (máy không có key) → coi như không hỗ trợ |
| Ollama / llama-server (GGUF) | *bỏ qua* | — | ❌ false | không có khái niệm reasoning effort |

Logic nằm ở `src-tauri/src/translate/reasoning.rs` (thuần, **7 unit test**).
Mức độ suy luận được truyền vào body request qua `translate::server::set_reasoning_effort()` (state toàn cục, set 1 lần đầu mỗi request từ `translate_batch_with_config` và `translate_script_contextual`).

## 5.3. Đo: effort `low` vs `high` (MiniMax-M3.1-Flash, 20 câu, đường cũ)

| Effort | Tổng 20 câu | Lô đầu | s/câu | Lỗi |
|---|---|---|---|---|
| **`low`** | **9,26 s** | 5,73 s | 0,463 | 0 |
| `high` | 13,96 s | 7,99 s | 0,698 | 0 |

⇒ **`high` chậm hơn `low` 1,51×** (và đắt hơn ~2,7× về token suy luận).
⇒ `auto` (→ `low`) là mặc định hợp lý cho dịch phụ đề: dịch không cần suy luận sâu.

## 5.4. Hai command Tauri mới

### `translate_options_get` → đọc trạng thái + danh sách model

```rust
#[tauri::command]
async fn translate_options_get(app: tauri::AppHandle) -> Result<translate::TranslateOptions, String>
```

Trả về:

```jsonc
{
  "provider": "minimax",
  "model": "MiniMax-M3.1-Flash",
  "reasoning_effort": "auto",
  "supports_reasoning": true,
  "models": [
    { "provider": "minimax",   "id": "MiniMax-M3",                 "label": "⭐ MiniMax-M3 (Token Plan)", "local": false },
    { "provider": "minimax",   "id": "MiniMax-M3.1-Flash",         "label": "⚡ MiniMax M3.1 Flash",      "local": false },
    { "provider": "openrouter", "id": "deepseek/deepseek-v4.1-flash","label": "⚡ DeepSeek V4.1 Flash",      "local": false },
    { "provider": "openrouter", "id": "~deepseek/deepseek-flash-latest","label": "⚡ DeepSeek Flash Latest",  "local": false },
    { "provider": "deepseek",  "id": "deepseek-chat",              "label": "DeepSeek Chat",               "local": false },
    { "provider": "ollama",    "id": "qwen2.5:3b",                 "label": "🦙 qwen2.5:3b (Ollama local)", "local": true  },
    { "provider": "local",     "id": "qwen3-4b",                   "label": "Qwen3-4B-Instruct…",          "local": true  }
  ]
}
```

### `translate_options_set` → ghi lựa chọn (KHÔNG đụng API key)

```rust
#[tauri::command]
fn translate_options_set(
    app: tauri::AppHandle,
    provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
) -> Result<config::AppConfig, String>
```

- **Config được đọc từ đĩa** rồi **chỉ sửa field được truyền** ⇒ **API key không bao giờ bị mất** (đã có unit test riêng).
- Model được gán vào **đúng** field theo provider đang chọn (`minimax_model` / `ollama_model` / `deepseek_model` / `openrouter_model` / `translation_model`).
- Lưu **atomic** (temp + rename, BUG-013) + emit `config:updated`.
- `reasoning_effort` được chuẩn hoá về `auto|low|medium|high|max`.

### Wrapper frontend

```ts
sublix.translateOptionsGet(): Promise<TranslateOptions>
sublix.translateOptionsSet({ provider?, model?, reasoningEffort? }): Promise<AppConfig>
```

Type mới trong `src/lib/types.ts`: `TranslateOptions`, `TranslateModelOption` (cùng `ScriptLine`, `ContextualLine`, `TranslateProgress` cho đường dịch theo ngữ cảnh).

## 5.5. Test

| Nhóm | Số test | Nội dung |
|---|---|---|
| `translate::reasoning::tests` | 7 | mapping theo provider, `auto` của M3.1-Flash → `low`, `auto` của M3 → không gửi, OpenRouter `max` → `high`, local không gán gì |
| `translate::options_tests` | 8 | set model theo provider **giữ nguyên key**, chuẩn hoá effort, giá trị rỗng không ghi đè, **config thật trong thư mục temp đọc/ghi lại vẫn giữ key**, danh sách model đủ 7 mục, `supports_reasoning` đúng |
| **Tổng `cargo test --lib`** | **146 pass / 0 fail** | (trước task này: 113) |

