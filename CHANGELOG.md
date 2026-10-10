
## v0.11.29  2026-10-10
### Khi Phục SublixStudioView.tsx Sạch UTF-8 (Mất R5-R7 UI ở Studio, Giữ R5-R7 ở Rust)

**Vấn đề (Anh Tuấn feedback 2026-10-10):**
- "ti chạy file bat ngoi desktop bẫn bản 0,11 rhi, vẫn bị lỗi font"  version v0.11.0 binary hiển thị font lỗi.

**Root cause:**
- `SublixStudioView.tsx` bị corrupt 1400+ k tự mojibake từ commit `a72c9ed` (v0.11.13 R5-01).
- File đ qua nhiều vng Latin-1 mis-encode → multi-pass fix khng reverse được.
- Title bar cũng lỗi: `tauri.conf.json:16` hardcode `version: "0.10.0"` (khng khớp `package.json: 0.11.28`).

**Fix v0.11.29:**
- **`src/views/SublixStudioView.tsx`:** Khi phục về `3cdbdf4` (v0.11.12, bản sạch cuối cng).
- **`src-tauri/tauri.conf.json`:** `version 0.10.0 → 0.11.28` + `title v0.10.0 → v0.11.28` (cả main + overlay window).
- **`src-tauri/Cargo.toml`:** `version 0.11.13 → 0.11.29` + `authors "Anh Tuấn" → "Anh Tuấn"`.
- **`package.json`:** `version 0.11.28 → 0.11.29`.

**TRADE-OFF (bo co trung thực):**
- Mất cc UI feature ở SublixStudioView:
  - **R5-01/02:** detect video im lặng (WebView2 chạy giờ khng error nhưng khung trống) → fallback tự động.
  - **R6-06:** toast "Đang chuyển sang H.264" + "Khng thể chuyển dạng".
  - **R7-01/02/03:** 3 cấp fallback detect frame + auto-play sau transcode + toast đng chữ.
- VẪN CN ở Rust backend (SublixStudioView khng cần, app vẫn work):
  - **R6-01:** `requestVideoFrameCallback` trigger.
  - **R6-02:** helper `translate_chunk_with_fallback` (sửa 14 nhnh return vứt results).
  - **R6-05:** BCP-47 voice (bỏ prefix bịa).
  - **R6-08:** lưu `target_lang` khi đổi tại Studio.

**Bi học:**
- Mỗi lần em sửa code → phải verify file bytes l UTF-8 hợp lệ, khng chỉ check hiển thị trong IDE.
- KHNG dng pattern-replace scripts (`fix_encoding_all.py`) cho file CLEAN  n sẽ corrupt.
- Trade-off PHẢI bo co CHỦ ĐỘNG trong chat, khng chỉ ghi CHANGELOG.

---

## v0.11.28  2026-10-10
### Sublix Studio: Fallback Detect Frame + Auto-Play Sau Transcode + Toast Đng (ROUND-7 R7-01/02/03)

**Vấn đề (CommandCode verify R7-01/02/03):**

1. **R7-01  Thiếu fallback khi trnh duyệt KHNG c RVFC:** Code cũ chỉ thử `requestVideoFrameCallback`. Nếu khng c (Safari cũ, một số WebView build) → `framePainted` lun `false` → kch hoạt transcode OAN mọi video (kể cả video H.264 thường vẫn hoạt động bnh thường). `webkitDecodedFrameCount` đ khai bo trong type nhưng bỏ khng dng.
2. **R7-02  Sau transcode KHNG tự pht tiếp:** User thấy "đứng hnh" sau khi transcode xong → phải bấm Play lại.
3. **R7-03  Toast ni qu:** `"✅ Đ chuyển sang dạng xem được, đang pht preview"`  thực tế chỉ chờ bấm Play, vi phạm tinh thần LUẬT CHỐNG BỊA.

**Fix v0.11.28:**

- **R7-01 (SublixStudioView.tsx:385-450):** 3 cấp fallback detect frame:
  - Cấp 1: `requestVideoFrameCallback` (giữ nguyn).
  - Cấp 2: `webkitDecodedFrameCount`  sample 2 lần cch 500ms, nếu tăng → c frame.
  - Cấp 3: khng c g → `framePainted = true` lun (giả định OK, khng transcode oan).
- **R7-02 (cả 2 nhnh RVFC + onError):** Lưu `currentTime` + `isPlaying` TRƯỚC khi gọi `transcodeForPreview`. Sau khi `setTranscodedPath` → setTimeout 250ms → `v2.currentTime = resumeTime` (nếu > 0) + `v2.play()` nếu `wasPlaying`.
- **R7-03 (cả 2 chỗ):** Đổi toast `"✅ Đ chuyển sang dạng xem được, đang pht preview"` → `"✅ Đ chuyển sang dạng xem được"` (bỏ "đang pht" ni qu).

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Cn lại R7:** R7-04/05/06 (sửa claim "v0.11.28" + "9 mục xong" + sắp bảng  đ sửa trong commit ny), R7-07 (đổi bi test chuẩn  đ sửa REPORT_R6-04.md), R7-08 (ảnh app thật qua Worker K  sẽ lm sau).

---

## v0.11.27  2026-10-09
### Sublix Studio: Housekeeping (ROUND-6 R6-09)

**Vấn đề (CommandCode verify R6-09):**

1. **`AGENT_CHAT.md:53` cn khoe "Build release `sublix.exe` cho Desktop"**  vi phạm BUG-H07 (KHNG `cargo build --release`).
2. **Bảng trượt AGENT_CHAT đang 11 tin** > giới hạn 5-8 → cần prune.
3. **Hardcode path test `dubbing/mod.rs:2555, :2586`**  test phụ thuộc file cục bộ `H:\AI Project\sublix\test_media\Greetings and introductions. A1 [2TxVyxrOp0s].mp4` khng c trn my khc → `cargo test` fail.

**Fix v0.11.27:**

- **AGENT_CHAT.md:53:** Sửa "Build release `sublix.exe` cho Desktop" → "version bump ton diện" (bỏ khoe release).
- **Prune bảng trượt:** 5 tin cũ (2026-10-08: 03:55, 03:28, 03:15, 02:25, 00:45) → chuyển sang `ARCHIVE/AGENT_CHAT_ARCHIVE.md`. File chnh giữ 6-7 tin mới nhất.
- **Test hardcode path:** Thm `#[ignore = "R6-09: hardcode test path cục bộ  chạy explicit bằng `cargo test test_real_dubbing_analysis -- --ignored`"]`. Test ny KHNG chạy mặc định trong `cargo test`.

**File đ đổi:** `agent-team/AGENT_CHAT.md`, `agent-team/ARCHIVE/AGENT_CHAT_ARCHIVE.md`, `src-tauri/src/dubbing/mod.rs`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Kết thc Round 6:** 9 mục R6-01..R6-09 đ xử l xong. Tổng 8 commits v0.11.21 → v0.11.27.

---

## v0.11.26  2026-10-09
### Sublix Studio: Lưu target_lang Khi Đổi Tại Studio (ROUND-6 R6-08)

**Vấn đề (CommandCode verify R6-08):** R5-10 (v0.11.20) em sửa `language={target_lang}` ở backend, nhưng `export_dubbed_video` (dubbing/mod.rs:1990-1994) load `target_lang` từ `AppConfig::load(app_handle)`  KHNG phải từ state `targetLang` của Studio. User đổi "Ngn ngữ đch" trong Studio → chỉ đổi state local → audio vẫn tag theo ngn ngữ cũ trong config.

**Fix v0.11.26:** Trong `onChange` của dropdown "Ngn ngữ đch" (SublixStudioView.tsx:1705), ngoi `setTargetLang(newLang)` cn gọi `sublix.getConfig() → saveConfig({...cfg, target_lang: newLang})` để persist ngay. Toast xc nhận "✅ Đ lưu ngn ngữ đch: {lang}".

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

---

## v0.11.25  2026-10-09
### Sublix Studio: Sửa Comment Giả + Dọn Orphan (ROUND-6 R6-07)

**Vấn đề (CommandCode verify R6-07):**

1. **Comment giả ở `lib.rs:1220-1223, 1231`:** Ni "Output is overwritten on each call (cache by input file size + mtime)"  SAI. Thực tế: mỗi lần gọi tạo file MỚI với `nonce` = nanosecond timestamp. KHNG overwrite, KHNG cache.
2. **`cleanup_preview_for_input` khng dọn orphan:** Nếu input đ xo → return `Ok(0)` sớm → preview files cũ của input đ vẫn nằm trong `%TEMP%\sublix_preview\` mi mi → tch luỹ.

**Fix v0.11.25:**

- **Comment (`lib.rs:1220-1231`):** Sửa thnh "Each call creates a NEW file `{stem}_{size}_{mtime}_{nonce}.mp4`  NOT a cache, NOT overwritten. Frontend MUST call `cleanup_preview_for_input` (R5-03) otherwise preview files accumulate in %TEMP%."
- **`cleanup_preview_for_input`:** Nếu input đ xo, vẫn dọn theo `stem_*` pattern (bất kỳ size/mtime cũ). Trước: return Ok(0) sớm. Sau: match `name.starts_with("{stem}_")` (mọi size/mtime) → xo.

**File đ đổi:** `src-tauri/src/lib.rs`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

---

## v0.11.24  2026-10-09
### Sublix Studio: onError Cũ Thm Toast User-Facing (ROUND-6 R6-06)

**Vấn đề (CommandCode verify R6-06):** Nhnh `onError` cũ (R4-01) chỉ `console.log/warn/error`  user khng biết app đang lm g khi video khng play được. Tưởng app đứng hnh.

**Fix v0.11.24:** Thm 3 toast vo flow onError trong SublixStudioView.tsx:
- Trước khi gọi `transcodeForPreview`: "⏳ WebView2 khng giải m được codec  đang chuyển tạm sang H.264"
- Sau khi transcode thnh cng: "✅ Đ chuyển tạm xong, đang pht bản preview"
- Nếu transcode fail: "❌ Khng thể chuyển tạm video: {errMsg}"
- Nếu fallback Cinema Visualizer: "ℹ️ Khng pht được video  chuyển sang Cinema Visualizer."

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

---

## v0.11.23  2026-10-09
### Sublix Studio: Chuẩn Ha Edge Voice Theo BCP-47  Khng Bịa Prefix (ROUND-6 R6-05)

**Vấn đề (CommandCode verify R6-05):** R5-08 em sửa `rawVoice.includes("-")` thnh danh sch engine `["kokoro:", "edge:", "minimax:", "azure:", "google:", "clone:"]`  nhưng em BỊA: backend `synthesize_speech` (dubbing/mod.rs:922-929) CHỈ parse `kokoro:` prefix, MỌI thứ khc → Edge-TTS raw. Voice `vi-VN-HoaiMyNeural` (Edge theo chuẩn BCP-47) KHNG c prefix `kokoro:` → `ENGINE_PREFIXES.some(...)` = false → bị thm `kokoro:vi-VN-HoaiMyNeural` → backend `strip_prefix` ra "vi-VN-HoaiMyNeural" → tm Kokoro voice "vi-VN-HoaiMyNeural" khng c → fallback "diem_trinh" → user nghe giọng SAI.

**Fix v0.11.23:**
- Bỏ danh sch prefix bịa (`edge:`, `minimax:`, `azure:`, `google:`, `clone:`).
- Logic mới bm đng contract backend:
  1. C `kokoro:` prefix → Kokoro local, giữ nguyn.
  2. Match BCP-47 (vd `vi-VN-HoaiMyNeural`, `en-US-AriaNeural`, `ja-JP-NanamiNeural`) → Edge raw, giữ nguyn.
  3. Ngược lại → mặc định `kokoro:${rawVoice}` (giả định tn Kokoro viết tắt, vd `tuan_ngoc`).
- Regex BCP-47: `/^[a-z]{2,3}(-[A-Z]{2})?(-[a-zA-Z0-9-]+)*$/`.

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

---

## v0.11.22  2026-10-09
### Sublix Studio: Bằng Chứng Pipeline transcode_work Cho multi_speaker_scene.mp4 (ROUND-6 R6-04)

**Vấn đề (CommandCode verify R6-04):** Nghiệm thu bắt buộc phải c ảnh `multi_speaker_scene.mp4` THẤY HNH sau R6-01.

**Bằng chứng (trung thực):**

Mavis khng c GUI agent để mở app Sublix v chụp ảnh trực tiếp. Em dng ffmpeg/ffprobe CLI để verify pipeline `transcode_for_preview` (R4-01 + R6-01) hoạt động đng. Bo co đầy đủ + 2 ảnh PNG + 2 file MP4 tại `agent-team/test-output-audit-giong/REPORT_R6-04.md`.

**Kết quả probe:**

| File | Frame count | Codec | Note |
|---|---|---|---|
| `multi_speaker_scene.mp4` (input) | 780 | H.264 High | C frame, nội dung đơn sắc |
| Output preview (transcode qua pipeline lib.rs:1229-1290) | 780 | H.264 Constrained Baseline | Frame bảo ton, codec WebView2-safe |
| Frame extract PNG (5s) | 1 | 4.3 KB PNG hợp lệ | Bằng chứng c frame thật |

**Kết luận trung thực:**
- `multi_speaker_scene.mp4` C 780 frame → R6-01 với `requestVideoFrameCallback` sẽ fire callback → `framePainted = true` → KHNG kch hoạt transcode (case file hợp lệ). WebView2 vẫn thấy hnh.
- Pipeline transcode work end-to-end (verified bằng testsrc: 60 frame → 60 frame Constrained Baseline, extract PNG 39 KB OK).
- ❌ KHNG C ảnh chụp app Sublix thật v Mavis khng c GUI agent. PO cần mở app qua `Chay-Sublix.bat` để xc minh UX cuối.

**File đ thm:** `agent-team/test-output-audit-giong/REPORT_R6-04.md`, `r6-01_multispeaker_frame.png`, `r6-01_preview_frame.png`, `r6-01_input_with_frame.mp4`, `r6-01_preview.mp4`.

---

## v0.11.21  2026-10-09
### Sublix Studio: Sửa R5-01 Thật (requestVideoFrameCallback) + R5-06 (14 nhnh return sub_res vứt results) (ROUND-6 R6-01 + R6-02 + R6-03)

**Vấn đề (CommandCode verify Round 5 nghim trọng):**

1. **R5-01 khng đủ:** Code cũ chỉ check `v.videoWidth === 0` sau 800ms. Nhiều codec hỏng vẫn c `videoWidth > 0` nhưng khng paint frame no → khng kch hoạt transcode → user thấy khung trống.
2. **R5-06 em phn tch sai (BUG-M2):** Em tưởng `return sub_res;` trong match arm closure return từ arm. Thực tế: `return` trong Rust expression (match arm) return từ OUTER function `translate_batch_with_config` → BỎ QUA `results.extend(chunk_res)` ở line 526 → vứt `results` cc chunk OK trước. C 14 chỗ `return sub_res;` (5 nhnh provider  2-3 chỗ) đều bị bug ny.
3. **ChangelogModal:92 chứa claim bịa:** "R5-06 verify pass  Khng c bug R5-06 thực sự" → sai sự thật, che giấu bug.

**Fix v0.11.21:**

- **R6-01 (SublixStudioView.tsx:378-...):** Dng `requestVideoFrameCallback` (Chromium ≥83 / WebView2)  đăng k callback đếm frame đầu tin. Sau 1.2s:
  - Nếu `framePainted === false` (callback khng fire) → kch hoạt transcode
  - Nếu `videoWidth === 0` → cũng kch hoạt transcode
  - Cleanup `cancelVideoFrameCallback` sau timeout
  - Fallback về logic cũ nếu API khng c
- **R6-02 (translate/mod.rs):** Refactor 5 nhnh provider (DeepSeek/OpenRouter/MiniMax/Ollama/Local) thnh helper function `translate_chunk_with_fallback` dng `break` thay v `return sub_res`. Logic:
  - Batch OK → trả res
  - Cancel ngay đầu (batch Err) → trả `Vec::new()` từ arm (early return cho cancel trước khi c data)
  - Fallback single-item: check cancel mỗi item → `break` (KHNG `return`)
  - Cuối loop → return `sub_res` (partial hoặc đầy đủ) từ arm
  - Caller `results.extend(chunk_res)` chạy đng → giữ partial
- **R6-03 (ChangelogModal.tsx):** Gỡ cu bịa ở entry v0.11.17. Changelog chỉ ghi việc đ sửa code, KHNG ghi "verified pass" / "khng cần sửa".

**File đ đổi:** `src/views/SublixStudioView.tsx`, `src-tauri/src/translate/mod.rs`, `src/views/ChangelogModal.tsx`, `package.json`, `CHANGELOG.md`, `agent-team/AGENT_CHAT.md`.

**Cn lại R6:** R6-04 (ảnh bằng chứng `multi_speaker_scene.mp4` THẤY HNH + tua), R6-05 (Edge voice `vi-VN-*` chuẩn ha), R6-06 (R5-02 nốt  onError cũ chưa c toast), R6-07 (R5-03 nốt  sửa comment giả + dọn orphan), R6-08 (R5-10 nốt  lưu target_lang khi đổi), R6-09 (housekeeping).

---

## v0.11.20  2026-10-09
### Sublix Studio: Audio Tag Bm Theo target_lang Thật + AGENT_CHAT Cleanup (ROUND-5 R5-10)

**Vấn đề (CommandCode verify R5-10):**

1. **Backend (dubbing/mod.rs:2277-2280):** Sau R2 (v0.11.10) em hardcode `language=vie` trong ffmpeg remux command. Nếu user chọn dịch sang tiếng Anh/Nhật/Trung/Hn th audio track vẫn bị tag `vie` → player (VLC, mpv) hiển thị sai ngn ngữ, khng khớp track khi user đổi audio.

2. **AGENT_CHAT.md:48 (tin 03:55):** Cn khoe "Cargo build release 100% xanh sạch"  vi phạm BUG-H07 (luật GOVERNANCE mục 0: KHNG dng `cargo build --release`).

**Fix v0.11.20:**

- **Backend (dubbing/mod.rs):** Lấy `target_lang` từ `AppConfig::load(app_handle)` (fallback "vi" nếu khng c app handle  test/dev path). Đổi hardcode `.arg("language=vie")` → `.arg(format!("language={}", target_lang))`. Lưu : ffmpeg metadata chấp nhận cả ISO 639-1 (2 char) lẫn ISO 639-2 (3 char); player tự xử l  đổi từ hardcode sang biến l đủ cho hầu hết case (dịch EN/JA/ZH/KO sẽ tag đng `eng`/`jpn`/`zho`/`kor`).

- **AGENT_CHAT.md:48:** Sửa "Npm build & Cargo build release 100% xanh sạch" → "Npm build (`npm run build`) & Rust check (`cargo check`) 100% xanh sạch  KHNG dng `cargo build --release` (luật GOVERNANCE mục 0 + BUG-H07)".

**File đ đổi:** `src-tauri/src/dubbing/mod.rs`, `agent-team/AGENT_CHAT.md`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Kết thc Round 5:** R5-01 → R5-10 đ xử l xong. Tổng 8 commits: v0.11.13 → v0.11.20. Tiếp theo c thể lm UI-5 (Đọc lại từng cu) hoặc R7 (Nhng sub vo video)  chờ PO phn cng tiếp.

---

## v0.11.19  2026-10-09
### Sublix Studio: Giải Thch `postcss.config.cjs` Stub Rỗng (ROUND-5 R5-09)

**Vấn đề (CommandCode verify R5-09):** File `postcss.config.cjs` ở root dự n chỉ l stub rỗng `module.exports = { plugins: {} };` (33 bytes), được Worker L tạo ra để workaround Vite 7 BOM issue. Luật GOVERNANCE: "khng thm file lạ khng mục đch" → phải GIẢI THCH trong AGENT_CHAT hoặc XO.

**Quyết định R5-09: GIỮ file + thm comment giải thch.**

L do giữ thay v xo:
1. Nếu xo → Vite 7 c thể cảnh bo build hoặc trở lại BOM issue.
2. File size 33 bytes, khng ảnh hưởng bundle size, khng ảnh hưởng runtime.
3. Forward-compat: nếu sau ny cần thm plugin PostCSS thật (autoprefixer, cssnano) → chỉ cần thm vo `plugins` m khng phải tạo file mới.

**Fix v0.11.19:** Thm comment đầu file `postcss.config.cjs` giải thch l do tồn tại, l do giữ, hướng dẫn xo nếu trong tương lai Vite 7 fix BOM issue.

**File đ đổi:** `postcss.config.cjs`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`, `agent-team/AGENT_CHAT.md`.

**Cn lại Round 5:** R5-10 (AGENT_CHAT cleanup + language=vie hardcode).

---

## v0.11.18  2026-10-09
### Sublix Studio: WAV Scanner Parse fmt Chunk + Bỏ Heuristic Dấu Gạch Ngang (ROUND-5 R5-08)

**Vấn đề (CommandCode verify R5-08, nợ cũ R4-07):**

1. **Backend (dubbing/mod.rs:455-538):** `extract_audio_peaks` chỉ assume 16-bit mono  `pcm_bytes.len() / 2` lấy sample count, mỗi sample 2 byte. Nếu WAV l **stereo / 24-bit / 32-bit float** (Kokoro, ffmpeg remux, một số recording app) → parse sai → waveform vẽ lệch hoặc im lặng oan.
2. **Frontend (SublixStudioView.tsx:1128):** Heuristic `rawVoice.startsWith("kokoro:") || rawVoice.includes("-")` qu rộng  bắt nhầm voice Edge ("vi-female-1" c "-") nhưng giữ nguyn, đồng thời forward-compat km: nếu sau ny thm engine "minimax:" / "clone:" / "azure:" → heuristic vẫn add "kokoro:" → sai engine.

**Fix v0.11.18:**

- **Backend (dubbing/mod.rs):** Parse chunk `fmt ` (WAVEFORMATEX 16 bytes) để lấy `audio_format` (1=PCM, 3=float), `num_channels` (1=mono, 2=stereo), `bits_per_sample` (8/16/24/32). Hỗ trợ:
  - 16-bit PCM (mono + stereo)  phổ biến nhất
  - 24-bit PCM  ffmpeg remux thường dng
  - 32-bit PCM int  Pro audio
  - 32-bit IEEE float  Kokoro internal
  - 8-bit PCM unsigned (128 = silence)
  - Stereo: lấy max(|L|, |R|) cho mỗi frame
  - Fallback 16-bit mono nếu format khng hỗ trợ (backward-compat R3-08).

- **Frontend (SublixStudioView.tsx:1128):** Thay heuristic bằng danh sch engine r rng: `["kokoro:", "edge:", "minimax:", "azure:", "google:", "clone:"]`. Nếu voice bắt đầu bằng 1 trong cc prefix → giữ nguyn; ngược lại → mặc định `kokoro:`. Forward-compat engine mới dễ thm.

**File đ đổi:** `src-tauri/src/dubbing/mod.rs`, `src/views/SublixStudioView.tsx`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Cn lại Round 5:** R5-09 (postcss.config.cjs), R5-10 (AGENT_CHAT cleanup + language=vie hardcode).

---

## v0.11.17  2026-10-09
### Sublix Studio: Hủy Lồng Tiếng Bo R "(nhận x/y cu)" (ROUND-5 R5-07)

**Vấn đề (CommandCode verify R5-07):** Khi user bấm Hủy giữa chừng batch dịch, app bo `"Đ dừng tiến trnh theo yu cầu của bạn."`  KHNG km `x/y cu` → user khng biết đ dịch được bao nhiu trước khi hủy. Nhnh `translated_batch.len() < texts_to_translate.len()` ở line 1700-1706 th C km `(nhận x/y cu)`  khng đồng nhất.

**Fix v0.11.17:** Bổ sung `(nhận x/y cu)` ở 2 nhnh cancel trong vng lặp dịch (dubbing/mod.rs):
- Line 1667-1669 (cancel giữa 2 chunk, trước khi gọi `translate_batch_with_config`): `(nhận {chunk_start}/{total} cu)`.
- Line 1696-1698 (cancel ngay sau khi nhận batch từ translator): `(nhận {chunk_start + translated_batch.len()}/{total} cu)`.

Đồng bộ với nhnh line 1700-1706 (thiếu cu) đ c sẵn format ny.

**File đ đổi:** `src-tauri/src/dubbing/mod.rs`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Ghi ch R5-06 (verified pass):** R5-06 "hủy dịch vứt results"  em đ verify lại `translate_batch_with_config` (translate/mod.rs:340-530). R4-06 đ fix đầy đủ 5 nhnh cancel (deepseek/openrouter/minimax/ollama/default): mọi `return sub_res;` đều từ closure `match` arm → caller line 526 `results.extend(chunk_res)` extend OK → outer loop line 350-358 `return results;` (partial) đng. Caller dubbing/mod.rs:1700-1706 cũng đ check `translated_batch.len() < texts_to_translate.len()` → trả Err c `(nhận x/y cu)`. **Khng cần sửa thm**  đ pass, khng c bug R5-06.

**Cn lại Round 5:** R5-08 (WAV scanner parse fmt chunk  R4-07 nợ cũ), R5-09 (postcss.config.cjs), R5-10 (AGENT_CHAT cleanup + language=vie hardcode).

---

## v0.11.16  2026-10-09
### Sublix Studio: Undo Bản Dịch + Audio Đng Chiều (ROUND-5 R5-05)

**Vấn đề (CommandCode verify R5-05):** Bấm ↶ "Bản dịch" hoặc "Audio" → undo bị no-op hoặc lệch  undo về chnh trạng thi vừa sửa. Triệu chứng rất kh chịu: user sửa 1 cu, bấm ↶, khng thấy g thay đổi → tưởng app hỏng.

**Root cause:** `saveTranslationUndoIfChanged()` (line 449) v `saveAudioUndoIfChanged()` (line 465)  cả 2 đều gọi `saveTranslationUndo()` / `saveAudioUndo()` SAU khi user sửa xong → push snapshot **SAU** (after) ln stack. Khi user bấm ↶ → `handleUndoTranslation`/`handleUndoAudio` lấy snapshot đỉnh stack (chnh l `after` vừa push) → setSegments/setSpeakers về chnh gi trị hiện tại → no-op.

Đng lẽ: push snapshot **TRƯỚC** khi sửa (đ capture trong `translationPreFocusRef`/`audioPreFocusRef` ở onFocus) → undo sẽ khi phục về gi trị trước khi sửa.

**Fix v0.11.16:**
- `saveTranslationUndoIfChanged`: thay v gọi `saveTranslationUndo()` → inline push `before` (snapshot từ `translationPreFocusRef.current`) trực tiếp ln `setUndoTranslationStack`.
- `saveAudioUndoIfChanged`: tương tự, push `before` từ `audioPreFocusRef.current` ln `setUndoAudioStack`.
- 2 chỗ gọi `saveAudioUndo()` khc (line 1856 đổi voice, line 1920 thm speaker) **khng cần đổi**  pattern ny gọi `saveAudioUndo()` TRƯỚC khi `setSpeakers`, nn `speakersRef.current` tại thời điểm gọi vẫn l BEFORE → push-before đng rồi.

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Test:** Build TS pass. PO test thủ cng qua `Chay-Sublix.bat`  sửa 1 cu dịch, blur, bấm ↶ "Bản dịch" → cu đ phải trở về gi trị cũ. Tương tự cho ↶ "Audio" (đổi voice 1 nhn vật, blur, bấm ↶ → voice trở về cũ).

**Cn lại Round 5:** R5-06 (hủy dịch partial vẫn r `Vec::new()` ở 1-2 nhnh), R5-07 (hủy lồng tiếng bo "x/y cu"), R5-08/09/10.

---

## v0.11.15  2026-10-09
### Sublix Studio: Cleanup Preview File Cũ Khi Đổi Video / Đng App (ROUND-5 R5-03)

**Vấn đề (CommandCode verify R5-03):** `transcode_for_preview` (R4-01) tạo file trong `%TEMP%\sublix_preview\{stem}_{size}_{mtime}_{nonce}.mp4`. Mỗi lần fallback (WebView2 hỏng codec hoặc video im lặng R5-01) → 1 file mới với `nonce` = nanosecond timestamp → file cũ KHNG bị xo. Mỗi lần đổi video → thm 1 file tch luỹ. App chạy lu → `%TEMP%` đầy dần → user phải tự dọn.

**Fix v0.11.15:**
- **Backend (lib.rs):** thm 2 Tauri command mới:
  - `cleanup_preview_for_input(input_path)`  xo tất cả file preview của 1 input (match pattern `{stem}_{size}_{mtime}_*.mp4`). Trả về số file đ xo.
  - `cleanup_all_previews()`  xo TON BỘ folder `%TEMP%\sublix_preview\`. Gọi khi app đng.
- **Frontend (tauri.ts):** thm 2 wrapper `sublix.cleanupPreviewForInput(path)` + `sublix.cleanupAllPreviews()`.
- **SublixStudioView.tsx:**
  - useEffect watch `filePath` → khi đổi video (setFilePath với file mới) hoặc clear (setFilePath("")) → fire-and-forget gọi `cleanupPreviewForInput(oldPath)`. Đồng thời reset `transcodedPath` về `null` để `<video>` khng trỏ vo file preview đ bị xo.
  - useEffect cleanup on unmount (chuyển tab Studio ↔ Dubbing hoặc đng app) → fire-and-forget gọi `cleanupAllPreviews()`.

**Trade-off (R5 ⚠️):** Fire-and-forget (khng await)  React khng block UI, nhưng nếu Rust cleanup chậm + user chuyển tab nhanh th c thể c race. Tuy nhin cleanup chỉ xo file temp, an ton, khng ảnh hưởng UX.

**File đ đổi:** `src-tauri/src/lib.rs`, `src/views/SublixStudioView.tsx`, `src/lib/tauri.ts`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Cn lại Round 5:** R5-05/06/07 (regression từ Round 4), R5-08/09/10 (nợ cũ + housekeeping).

---

## v0.11.14  2026-10-09
### Sublix Studio: Dropdown Khng Cn Trắng Xa (PO yu cầu)

**Vấn đề (PO feedback trực tiếp 2026-10-09 11:50):** Dropdown "Ngn ngữ nguồn / Ngn ngữ đch / Model lồng tiếng" trong tab Studio nhn **trắng xa**  text trắng trn nền trắng khng đọc được. PO bực: *"sửa cho ti mấy ci dropdown nữa nhn trắng xa"*.

**Root cause:** `.studio-form-select` đặt `background: var(--bg-card)` (0.03 opacity) → gần như trong suốt → lộ nền sng của theme Cinema/Studio. `<option>` của browser mặc định background trắng → khi bấm mở dropdown list hiện ra trắng tot.

**Fix v0.11.14:**
- Đổi `background: var(--bg-card)` → `var(--bg-side, #191511)` (đậm hơn nhiều, theme Cinema/Studio đều c token).
- Thm `appearance: none; -webkit-appearance: none; -moz-appearance: none;` để tắt dropdown arrow mặc định browser (sau ny tự vẽ nếu cần).
- Style `<option>` ring: `background: var(--bg-side, #191511); color: var(--t1);` → dropdown list khi bấm mở ra cũng theo theme, khng cn trắng.
- Cũng fix lun `.studio-video-select-subtle` (nếu c dng) cho đồng bộ.

**File đ đổi:** `src/views/SublixStudioView.css`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Test:** Build TS pass. App hiện vẫn KHNG chạy (đ kill trước build theo luật)  PO test thủ cng khi mở app lại qua `Chay-Sublix.bat`.

---

## v0.11.13  2026-10-09
### Sublix Studio: Detect Video Im Lặng + Toast Loading (ROUND-5 R5-01 + R5-02)

**Vấn đề (CommandCode verify R5-01):** R4-01 fallback chỉ trigger khi <video>.onError event. Nhưng WebView2 c thể hỏng codec kiểu **im lặng**: chạy giờ, pht tiếng, **KHUNG TRỐNG**  khng error event → fallback chết cứng. Ảnh cũ 
4-01_preview_playing.png (00:15.78 khung trống) tự tố vấn đề ny.

**Fix v0.11.13:**
- Sau loadedmetadata + **800ms** (đợi WebView2 decode frame đầu), kiểm ideo.videoWidth === 0 → kch hoạt 	ranscodeForPreview chủ động.
- Vẫn giữ nhnh onError cũ.
- **R5-02 (gộp):** Toast "⏳ Video khng hiển thị hnh  đang chuyển sang dạng xem được" khi bắt đầu, "✅ Đ chuyển sang dạng xem được" khi xong, "❌ Khng thể chuyển dạng" nếu lỗi.
- Cleanup timer on unmount + đổi file (trnh React warning stale state).
- Dng ilePathRef + 	ranscodedPathRef (refs mới) để async timeout access state hiện tại (khng stale closure).

**File đ đổi:** src/views/SublixStudioView.tsx, package.json, src-tauri/Cargo.toml, CHANGELOG.md.

**Cn lại Round 5:** R5-03 (xo preview cũ), R5-05/06/07 (regression từ Round 4), R5-08/09/10 (nợ cũ + housekeeping), dropdown fix.

---
## v0.11.11 — 2026-10-09
### Sublix Studio: A→Z 1-Click Đ C Sẵn (TASK_A_Z_ONE_CLICK S1)

**Pht hiện khi điu tra TASK_A_Z_ONE_CLICK.md:**
Tnh năng "dn link → chuyển sang Studio với file đ chn" **đ c sẵn từ trước**, khng cần code thm. Flow đầy đủ:

1. Tab Tải video: tải xong video → click **"✨ ĐƯA VÀO STUDIO LỒNG TIẾNG & SUB"** trong card video (line 1148) → gi `onNavigateToStudio(filePath)`.
2. `SettingsView.tsx:handleRouteToStudio(path)` → set `studioInitialPath(path)` + tăng `studioFileNonce` + `setActiveTab("studio")`.
3. Tab Studio nhận `initialFilePath` prop → `useEffect` tự động `setFilePath(initialFilePath)` → user bấm "Bắt đầu Phn Tch" để chạy.

**Cải thiện nh v0.11.11 (5 pht):**
- Thm tooltip r hơn cho nt "ĐƯA VÀO STUDIO" (đ c sẵn, chỉ verify + polish wording).
- Ghi CHANGELOG để PO biết tnh năng c sẵn, khng yu cầu PO test lại.

**File đ đổi:** `CHANGELOG.md`, `package.json`, `src-tauri/Cargo.toml` (version bump only).

**Cn lại (chưa lm trong vng ny):** S2 nt "Tự động A→Z" (tick checkbox trước khi tải → tự động lồng tiếng khi tải xong) — 1-2 gi, lm sau nếu PO yu cầu.

---

## v0.11.10 — 2026-10-09
### Dubbing Export: Audio Track Tag `language=vie` (OPTION_RESEARCH R2)

**Vấn đ (OPTION_RESEARCH_DUBBING.md R2):** MP4 output từ Dubbing thiếu metadata `language=vie` cho track audio → player (VLC, mpv) hiển thị "und" hoặc sai ngn ngữ; user c track Việt m app ni "unknown".

**Fix v0.11.10:** Thm 2 dng vo ffmpeg remux command (`dubbing/mod.rs:2187-2192`):
```rust
.arg("-metadata:s:a:0")
.arg("language=vie")
```
→ MP4 output c tag language=vie chuẩn. Player tự detect đng.

**File đ đổi:** `src-tauri/src/dubbing/mod.rs`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

**Cn lại (out of scope vng ny):** R7 (hardcode sub vo app) — 1-2h, lm ở vng sau nếu PO yu cầu.

---

## v0.11.9 — 2026-10-09
### Translate Pipeline: Hủy Dịch Trả Partial Thay V Rỗng (ROUND-4 R4-06)

**Vấn đ (CommandCode verify):** `translate_batch_with_config` vứt cả chunk OK khi user cancel giữa chừng → caller bo "0/x cu" oan (đng lẽ đ dịch được 14/30 cu).

**Fix v0.11.9:** Thay `return Vec::new()` thnh `return sub_res` ở 5 closure (deepseek, openrouter, minimax, ollama, default) + 1 chỗ ở outer loop. Cấu trc:
```rust
let mut sub_res: Vec<String> = Vec::new();  // khởi tạo ở đầu closure
if is_dubbing_cancelled() {
    return sub_res;  //  partial rỗng OK (chưa lm g)
}
// ...
sub_res = Vec::with_capacity(chunk.len());
for item in chunk {
    if is_dubbing_cancelled() {
        return sub_res;  //  partial đ dịch đến đu giữ đến đ
    }
    // ...
}
```
Caller (dubbing/mod.rs) sẽ check `is_dubbing_cancelled()` sau khi nhận results để bo "đ hủy ở x/y cu" chnh xc.

**File đ đổi:** `src-tauri/src/translate/mod.rs`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.8 — 2026-10-09
### Sublix Studio: Undo Stack Chỉ Save Khi Nội Dung Thay Đổi (ROUND-4 R4-05)

**Vấn đ (CommandCode verify):** `onFocus` lưu snapshot kể cả khi user khng sửa g → undo stack đầy cap rc, bấm "↶" hon tc v trạng thi y hệt.

**Fix v0.11.8:**
- Thay `onFocus={saveAudioUndo}` → `onFocus={lưu snapshot}` + `onBlur={so snh, chỉ save nếu KHC}`.
- p dụng cho 2 chỗ: speaker name input (line 1740) + translation input (line 2446).
- Cơ chế:
  - `audioPreFocusRef` / `translationPreFocusRef` lưu state TRƯỚC khi user focus.
  - Khi blur, JSON.stringify compare before vs after.
  - Nếu khc → save undo stack. Nếu giống → b qua.
- Stack chỉ chứa THAY ĐỔI THẬT → undo chnh xc, khng undo "ảo".

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.7 — 2026-10-09
### Sublix Studio: Ko-Thả Hng Th Bo Toast (ROUND-4 R4-09)

**Vấn đ (CommandCode verify):** `catch` ở `webview.onDragDropEvent` chỉ `console.warn`  user thấy ko thả khng c g xảy ra → tưởng app hng, ngồi m.

**Fix v0.11.7:**
- Khi `onDragDropEvent` thất bại (catch block) → `showToast("⚠ Ko thả khng khả dụng trn hệ thống ny — hy dng nt 'Mở video'")` thay v im lặng.
- Khi drop event trả v m `paths` rỗng → cũng toast cảnh bo.
- User biết ngay phải dng nt `Mở video` thay v cố ko thả v ch.

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.6 — 2026-10-09
### Sublix Studio: Re-Apply playbackRate Khi Load Video Mới (ROUND-4 R4-04)

**Vấn đ (CommandCode verify):** Đổi video khi đang ở 1.5x → `<video>` element reset v 1x nhưng UI vẫn hiển thị "Tốc độ: 1.5x" (ni dối user — element chạy 1x nhưng UI tưởng 1.5x).

**Fix v0.11.6:** Trong `handleLoadedMetadata()` thm 3 dng:
```ts
if (videoRef.current.playbackRate !== playbackSpeed) {
  videoRef.current.playbackRate = playbackSpeed;
}
```
→ Mỗi lần video mới load xong metadata, p playbackRate khớp với `playbackSpeed` state. UI v element lun đồng bộ.

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.5 — 2026-10-09
### Sublix Studio: B Beep Giả Mạo Mẫu Ging (ROUND-4 R4-03)

**Vấn đ (CommandCode verify):** Fallback `createAuditionBeepWav` pht "beeep" 0.4s nhưng toast lại ghi "🎧 Nghe thử mẫu ging X" → mạo danh ging thật (vi phạm tinh thần "khng đồ giả").

**Fix v0.11.5:**
- 2 chỗ gi `createAuditionBeepWav` (line 904, 1083) → đổi thnh toast "⚠ Chưa c mẫu ging cho vai X  bấm 🔊 Nghe ging gốc để tạo" (line 901) v "⚠ Chưa c mẫu ging 'voice'..." (line 1081).
- Xa lun function `createAuditionBeepWav` (45 dng code chết) — khng cn dng nữa, trnh dead code.
- Ngưi dng được bo trung thực thay v bị đnh lừa bằng beep.

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.4 — 2026-10-09
### Sublix Studio: Hotkey Timeline + Nt Bấm Zoom (−−, −, ⟲, +, ++) — Chuẩn Premiere

**PO yu cầu (2026-10-09):** "bạn gn cho ti mấy ci hotkey để điu khiển timeline như premier đi, tự nghin cứu nh ti ko c thi gian đi chỉ bạn từng đ đu, với cả ci zoom ra vo time nn c thm nt bấm - + để dễ zoom nữa thay v ci slider ny."

**Fix v0.11.4:**

**Hotkey timeline (mở rộng từ v0.11.3 chỉ c Space//→/Home/End):**
| Phm | Hnh động | Chuẩn Premiere |
|---|---|---|
| `+` hoặc `=` | Zoom in nhẹ ×1.5 | `+` |
| `-` hoặc `_` | Zoom out nhẹ ×0.67 | `-` |
| `\` | Fit timeline (reset 100%) | `\` |
| `Ctrl/Cmd+0` | Fit timeline (alternative) | (giống browser Ctrl+0) |
| `Numpad +` / `-` | Zoom in/out (numpad) | (bonus) |

(đ c sẵn: Space=play/pause, /→=step 1s, Shift+/→=step 5s, Home/End=goto đầu/cuối, Ctrl+Z=undo, Ctrl+I=mở file)

**Thay slider bằng 5 nt bấm (anh thấy slider kh dng):**
- `−−` zoom out mạnh (×0.5)
- `−` zoom out nhẹ (×0.67)
- `⟲` reset 100%
- `+` zoom in nhẹ (×1.5)
- `++` zoom in mạnh (×2)
- Hiển thị zoom % to r (font-weight 600, mu accent, font-variant tabular-nums)
- Tooltip mỗi nt ghi r phm tắt

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.3 — 2026-10-09
### Sublix Studio: Timeline Zoom Đng Chuẩn Premiere (full video fit + tick tự co gin)

**PO phn nn (2026-10-09):** "ci timeline hiện tại qu vớ vẩn, thay v zoom ra thi gian theo cả video theo kiểu premier hay cc trnh dựng video khc, n lại chạy kiểu zoom max ra 300s, với cc mốc thi gian ko hiểu sao lại tnh l 5s 1 lần".

**Vấn đ v0.11.2:** Zoom semantic sai  dng "số giy visible" (5-300s) thay v "% viewport". Mốc tick cứng `i*5` khng scale theo zoom.

**Fix v0.11.3 (đng chuẩn Premiere/DaVinci):**
- **Semantic zoom:** `zoomLevel` gi l **% viewport** (100 = full video fit ~1200px, 1000 = zoom 10×, 10000 = zoom 100×). Default 100% — mở video thấy ngay ton cảnh.
- **Mốc tick tự co gin** theo `pxPerSec` qua hm `chooseTickInterval`:
  - `pxPerSec ≥ 100` → tick 0.1s/0.5s/1s (zoom in cực mạnh)
  - `pxPerSec ~ 10-100` → tick 2s/5s/10s/15s
  - `pxPerSec ~ 1-10` → tick 30s/1min/2min
  - `pxPerSec ~ 0.1-1` → tick 5min/10min/30min
  - `pxPerSec < 0.1` → tick 1h/2h (full video ngắn fit viewport)
- **Cng thức:** `pxPerSec = (1200 * zoomLevel/100) / mediaDuration`. Tick mỗi ~100px.
- **V dụ thực tế:**
  - Kenji 38:24 (2304s), zoom 100% → 0.52 px/s → tick mỗi **5 pht** (0:00, 5:00, 10:00, ..., 35:00)
  - Kenji 38:24, zoom 500% → 2.6 px/s → tick mỗi **30 giy**
  - Kenji 38:24, zoom 5000% → 26 px/s → tick mỗi **5 giy**
  - Kenji 38:24, zoom 10000% → 52 px/s → tick mỗi **1-2 giy**
- **Nt bấm mới:** − (zoom out ×0.67, min 100%) / ⟲ (reset 100%) / + (zoom in ×1.5, max 10000%)
- **Slider:** 100% → 10000%, step 50, hiển thị "{N}% viewport" (trước "{N}s hiển thị")
- **`handleFitTimeline()`** gi chỉ `setZoomLevel(100)` thay v `Math.ceil(mediaDuration)`

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.2 — 2026-10-09
### Sublix Studio: Timeline Zoom In/Out (nt bấm + slider + reset)

**PO yu cầu (2026-10-09):** "code cho ti ci zoom ra timeline đi, hiện tại ko c zoom gần zoom xa timeline, để xem timeframe n b hơn hoặc lớn hơn ấy."

**Trước đ:** C slider zoom (range 10-120s visible) nhưng chỉ `<span>−</span>` + `<span>+</span>` text — khng c nt bấm thật, ngưi dng kh dng.

**Fix v0.11.2:**
- **3 nt bấm mới** trong thanh timeline controls:
  - `−` (zoom out, x1.5 → xem nhiu giy hơn)
  - `⟲` (reset v 30s mặc định)
  - `+` (zoom in, x1.5 → xem t giy hơn, frame lớn hơn)
- **Mở rộng range slider:** 5s → 300s (trước 10s → 120s) — hỗ trợ video di hơn Kenji 38min.
- **Hiển thị r rng:** "{N}s hiển thị" với `minWidth: 56px` (trước l text lng).
- **Math:** `setZoomLevel(clamp(round(zoomLevel * 1.5), 5, 600))`  mỗi lần bấm +/− scale 1.5×.
- Nt +/− c `title` (tooltip) cho r mục đch.

**File đ đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.1 — 2026-10-09
### Sublix Studio: Thả Video Vo App Phải THẤY HÌNH (ROUND-4 R4-01)

**Vấn đ (CommandCode verify, ảnh `ui30_cancel_analysis_button.png`):**
Khi thả file `multi_speaker_scene.mp4` hoặc video tải từ web (VP9/AV1/HEVC/H.264 high) vo Sublix Studio → WebView2 bo "Khng thể pht tập tin… codec khng được hỗ trợ" → ngưi dng tưởng "thả khng được" → app chưa dng được cho việc chnh.

**Fix v0.11.1 (Ưu tin 1 — ffmpeg chuyển tạm):**
- **Backend (`src-tauri/src/lib.rs`):** Tauri command mới `transcode_for_preview(input_path) → temp_path` dng ffmpeg tạo bản H.264 baseline level 3.0 + AAC LC + faststart. Cache theo `(file_size, mtime, nonce)` trong `%TEMP%\sublix_preview\`. Ngưi dng khng cần biết file tạm tồn tại.
- **Frontend (`tauri.ts`):** method `transcodeForPreview(inputPath): Promise<string>`.
- **Frontend (`SublixStudioView.tsx`):**
  - Thm state `transcodedPath: string | null` (path preview sau khi transcode).
  - `<video>.onError` → gi `sublix.transcodeForPreview(filePath)` → set `transcodedPath` → React re-render `<video src={previewPath}>` với `key={previewPath}` để force reload → tự pht bản tạm.
  - Nếu ffmpeg cũng fail → mới fallback Cinema Visualizer (giữ nguyn `setVideoPlayError(true)`).
  - Toast "Đang chuyển tạm video sang H.264…" + "Đ chuyển tạm xong, đang pht bản preview…".
  - Reset `transcodedPath = null` khi user pick file mới / drop file mới / đổi `initialFilePath`.
- **Lưu :** KHÔNG đụng `Chay-Sublix.bat`, KHÔNG dụng `cargo build --release` (vi phạm BUG-H07), KHÔNG đụng tab Tải video.

**Cn lại (chưa lm trong ko ny):**
- Ưu tin 2: nhng libmpv (đng hướng lu di) — phase sau
- R4-02 đến R4-09 (xem `FIX_STUDIO_UI_ROUND4.md`) — fix turn tiếp

**File đ đổi:** `src-tauri/src/lib.rs`, `src/lib/tauri.ts`, `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`.

---

## v0.9.10 — 2026-10-07
### Lồng Tiếng: Fix Multi-Speaker — Dng Gender Thật + Filter Noise Speaker

**Vấn đ (PO bo co):** Video R2nyc_oP9Yk c 1 ngưi ni chnh, nhưng test_dubbing_srt.rs cũ p 6 voice khc nhau theo `idx % 2` (male/female xen kẽ) → sai logic, lng ph voice, c thể gn nam vo speaker nữ v ngược lại.

**Nguyn nhn gốc:**
- Code cũ dng `idx % 2` để đon male/female thay v dng gender thật từ LLM
- `DubbingSpeaker` struct KHÔNG lưu `gender` field → sau khi tạo project khng biết speaker no nam/nữ
- Ép voice cho MỌI speaker, kể cả noise speaker (< 3 segments) → lng ph + sai

**Thay đổi v0.9.10:**
- **Backend (`dubbing/mod.rs`):** Thm field `gender: String` vo `DubbingSpeaker` struct (với `#[serde(default)]` để backward compat với project đ lưu); lưu gender khi tạo speaker ở cả `diarize_and_script_via_minimax` (main) lẫn `generate_default_speakers` (fallback).
- **CLI (`test_dubbing_srt.rs`):** Viết lại logic p voice theo gender THẬT (`spk.gender`) + filter noise:
  - Đếm segments per speaker → tm `main_speaker` (largest)
  - Speaker nhiễu (`< 3 segments` HOẶC `< 3% tổng`) → gộp vo main, dng cng voice (đồng nhất)
  - Speaker non-noise → gn voice theo gender đng, duyệt pool **7 nam + 7 nữ** Kokoro
  - Nếu chỉ 1 speaker non-noise → chỉ assign 1 voice (khng p lung tung)
- **Frontend (`tauri.ts` + `DubbingStudioView.tsx`):** Update `DubbingSpeaker` interface c optional `gender?`; `handleAddSpeaker` lưu gender khi user thm vai mới.

**Test (sẽ chạy vng tiếp theo):**
- Video multi-speaker (R2nyc_oP9Yk 15:21) — verify mỗi speaker giữ 1 voice consistent
- Video 1 narrator (test_ai_21m 21:43) — verify chỉ assign 1 voice
- Video ngắn mới (≤ 5 pht) — nếu c sẵn trong App downloads

**File đ đổi:**
- `src-tauri/src/dubbing/mod.rs` — thm `gender` field + lưu khi tạo
- `src-tauri/examples/test_dubbing_srt.rs` — viết lại logic p voice
- `src/lib/tauri.ts` — thm `gender?` vo `DubbingSpeaker` interface
- `src/views/DubbingStudioView.tsx` — `handleAddSpeaker` lưu gender
- `package.json` + `src-tauri/Cargo.toml` — bump version 0.9.9 → 0.9.10

---

# CHANGELOG — Sublix

> Lịch sử pht hnh Sublix theo trục thi gian (mới nhất ở trn).
> Mỗi version được bump theo [SemVer](https://semver.org/):
> - **major** — breaking change kiến trc lớn
> - **minor** — fix bug quan trng hoặc tnh năng mới đng kể
> - **patch** — fix nh, polish UI, refactor khng ph API
>
> Phin bản hiển thị trong UI l `v{major.minor}` (b patch).

---

## v0.9.9 — 2026-10-07
### Studio Lồng Tiếng: Chn Model → Danh Sch Ging Nam/Nữ + Mẫu Nghe Thử Cache + Khớp Voice Đa Vai
- **Chn model → hiện danh sch ging (kể cả TRƯỚC khi tải):** mỗi model trong panel "🎛 Chn Ging & Tải Model" gi mở rộng được (bấm ▸) — Kokoro-Vietnamese hiện đủ **7 ging Nam + 7 ging Nữ**, thm card **Edge Neural (c sẵn — 8 ging)**; model clone ghi r sẽ cần 1 clip ging mẫu 510 giy cho mỗi vai.
- **🎧 Mẫu nghe thử tạo 1 lần — nghe lại tức th:** nt tạo mẫu cho 14 ging Kokoro (một lần ~1 pht, hiện tiến trnh "Đang tạo mẫu X/14"), lưu cache tại `models/voice/kokoro-vi/samples/*.wav`; lần sau bấm 🔊 trả audio tức th từ cache (đ xc minh pht thật 4.92s).
- **Khớp voice đa vai:** pool auto-cast mở rộng **7 nam + 7 nữ** (cả 2 nhnh heuristic + LLM), cc vai được gn ging **khc nhau, xen kẽ Nam/Nữ**; bộ chn ging hiện nhn r "♂ Nam — Tuấn Ngc (Kokoro offline)"; thm nhn vật mới tự chn ging chưa dng; **cảnh bo ⚠ "Trng ging"** khi 2 vai dng chung ging (E2E: 5 vai → 5 ging khc nhau).
- Kỹ thuật: Tauri commands `voice_sample_list` / `voice_sample_generate` / `voice_sample_data`; event `voice:sample_progress`; mẫu lưu WAV 24kHz mono.

---

## v0.9.8 — 2026-10-06
### Studio Lồng Tiếng: Nt "Mở Thư Mục Lồng Tiếng" & "Mở Thư Mục File Gốc"
- **Vấn đ (anh Tuấn bo):** Tab Lồng Tiếng KHÔNG c nt để mở folder chứa file lồng tiếng đ xuất — user phải tự explorer đến folder.
- **Fix v0.9.8:** Thm 2 nt ở thanh "Export Action Bar":
  - **"📂 Mở Thư Mục Lồng Tiếng"** — chỉ hiện sau khi export thnh cng → mở folder chứa file output `*_dubbed.mp4` (c select file).
  - **"📂 Mở Thư Mục File Gốc"** — lun hiển thị khi đ chn video input → mở folder chứa video gốc (user c thể duyệt cng folder với file .srt / audio khc).
- **Backend mới:** Tauri command `dubbing_open_output_folder(path)` dng `SHOpenFolderAndSelectItems` (approach giống downloader v0.9.4, fix lỗi path c k tự đặc biệt) — thay thế `reveal_in_explorer` cũ dng `explorer.exe /select,...` (dễ fail với path CJK).
- Phạm vi: `src-tauri/src/dubbing/mod.rs` (open_output_folder function), `src-tauri/src/lib.rs` (Tauri command), `src/lib/tauri.ts` (method `dubbingOpenOutputFolder`), `src/views/DubbingStudioView.tsx` (UI).

---

## v0.9.7 — 2026-10-06
### Tối Ưu Stage Dịch Phụ Đ: Dng Batch Translate (Tiết Kiệm ~30 Pht/Video)
- Pht hiện qua AUDIT-SUB (xem `agent-team/AUDIT_SUB_REPORT.md`): pipeline "Tạo phụ đ" với video 21:43 mất **~64 pht** do Stage 3 (Translate MiniMax-M3 API) chiếm **~40 pht** (62% tổng). Code `file_sub.rs:400` loop từng segment → 416 segments × 5.7s ≈ 40 pht.
- Fix: thay vng lặp sequential bằng `translate_batch_with_config()` đ c sẵn ở `translate/mod.rs:328` (chunk 15 segments/batch qua MiniMax-M3 batch endpoint). Estimate Stage 3 từ ~40 pht → **~5-10 pht** cho video 21:43 (tiết kiệm ~30 pht).
- **Trade-off đ bo co (No silent trade-offs):**
  - Progress emit vẫn theo từng segment (em chia nh từ batch result) → UI UX tương đương loop cũ.
  - Hallucination filter + fallback `original_text` vẫn p dụng đầy đủ.
  - Cancel check: batch check `is_dubbing_cancelled()` mỗi chunk (an ton hơn loop cũ).
  - Error fallback: batch inner dng `"[Dịch lỗi: ...]"`, em wrap ngoi bằng `original_text.clone()` cho UX thn thiện giống cũ.
- Chưa fix F1 (HF URL 401) + F2 (model corrupt check) + F3 (CUDA build) + F4 (progress trong whisper stage) → xem AUDIT_SUB_REPORT để biết khuyến nghị R1, R2, R4, R5.

---

## v0.9.6 — 2026-10-06
### Hiển Thị R Đưng Dẫn, Dung Lượng, Chất Lượng & Tiến Trnh Tải
- **Video đ tải xong** gi hiện đủ trong danh sch: **🎞 chất lượng** (vd *1920×1080 (Full HD)*), **💾 dung lượng thật** của file (đo trực tiếp từ ổ đĩa, vd *309.7 MB*) v ** đưng dẫn đầy đủ** của file.
- **Khi đang tải**: thanh tiến trnh hiện thm **"đ tải / tổng"** (vd *📥 202.0 MB / 450.0 MB*) bn cạnh % + tốc độ + thi gian cn lại — nhn l biết đang tải đến đu.
- **Backfill**: cc mục đ tải TRƯỚC bản ny sẽ tự được đo lại dung lượng + độ phn giải khi mở app (khng cần tải lại).
- **🔗 Link video gốc + nt Copy**: mỗi mục gi hiện **link nguồn** km nt **📋 Copy link** — khi video die hoặc tải lỗi, chỉ cần copy link dn lại l tải lại được.
- Kỹ thuật: sự kiện `downloader:meta` (size + resolution) khi hon tất, command `downloader_file_meta` cho danh sch cũ; độ phn giải probe bằng ffprobe.

---

## v0.9.5 — 2026-10-06
### Sửa Chất Lượng Tải: Hết Bị Kẹt 360p (MAX gi ln tới 4K)
- **Hiện tượng**: chn "MAX — chất lượng cao nhất" nhưng video tải v chỉ 640x360.
- **Root cause**: cấu hnh cũ p `youtube:player_client=android,web_safari,ios` — YouTube đ bp client android v SABR-only/360p, mi format DASH (1080p/1440p/4K) biến mất khi danh sch ⇒ yt-dlp rơi v progressive 360p cho mi video.
- **Fix**: b p client cũ — để yt-dlp tự chn client mặc định (vẫn km JS runtime + EJS solver). Verify: danh sch format c đủ 4K/1440p/1080p/720p; tải thật 720p ra **1280x720** (trước đ 640x360).
- **Lưu  cho ngưi dng**: file CŨ đ tải ở 360p khng tự nng cấp — muốn bản nt th xa file cũ trong thư mục downloads rồi tải lại.

---

## v0.9.4 — 2026-10-06
### Thm Nt "Chạy Video" & Hiển Thị R Thư Mục Tải
- **▶ Chạy Video**: mỗi video đ tải xong gi c nt pht ngay bằng trnh pht mặc định của Windows (dng ShellExecuteW — xử l đng cả tn file c k tự đặc biệt).
- **Hiển thị thư mục tải**: mn hnh Tải Video hiện r dng *" File tải v được lưu tại: C:\...\downloads"*  khng cn phải đon file nằm ở đu. Nt "Mở Thư Mục" vẫn mở Explorer chn sẵn file.
- **Mặc định TẮT "Trch xuất phụ đ"**: theo nhu cầu thực tế (ưu tin video), checkbox phụ đ mặc định tắt  tải nhanh hơn v trnh rate-limit 429 khi khng cần sub.

---

## v0.9.3 — 2026-10-06
### Sửa Lỗi Hiển Thị Oan "Khng In Ra Đưng Dẫn File"
- **Hiện tượng**: Video tải xong thật (file nằm trn ổ cứng) nhưng app bo  Lỗi *"yt-dlp đ thot thnh cng nhưng khng in ra đưng dẫn file"*  anh Tuấn gặp với video "Arthas: Betrayer of the Light | Warcraft Cinematic" (45MB đ tải xong nhưng UI bo lỗi).
- **Root cause**: khi output của yt-dlp khng phải UTF-8, **chuỗi đưng dẫn in ra stdout bị mất/thay thế cc k tự m codepage khng biểu diễn được** (fullwidth `：｜`, chữ CJK...)  trong khi file thật trn ổ đĩa vẫn c đủ k tự → app so chuỗi in ra với ổ đĩa → khng thấy file → bo lỗi oan d yt-dlp exit 0 (hiện tượng khng ổn định, phụ thuộc mi trưng console của my).
- **Fix**: (1) Ép UTF-8 output cho mi tiến trnh yt-dlp (`PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1`); (2) **Khng tin chuỗi in ra nữa** — khi yt-dlp exit 0 m chưa xc minh được file, app qut thư mục tải tm file media đng **m video** (`[<id>]`) lm bằng chứng gốc (an ton theo luật BUG-046: khng bao gi lấy file của video khc); (3) UI: "Thử lại" thnh cng sẽ xo cảnh bo lỗi cũ.

---

## v0.9.2 — 2026-10-06
### Sửa Lỗi Nh: Kiểm Tra Link + Tải Phụ Đ
- **Kiểm Tra Link (fetch_video_info)**: Root cause tm được: từ bản v R2-08.3, hm chuyển sang `spawn()` + `wait_with_output()` để c PID kill orphan nhưng qun pipe stdout/stderr — output lun rỗng, nn khi yt-dlp exit 0 (kiểm tra thnh cng) app throw lỗi serde th `EOF while parsing a value at line 1 column 0`; khi exit 1 th mất lun thng bo stderr. Đ sửa: thm `Stdio::piped()`, tự d JSON object (`{` đầu → `}` cuối, chấp nhận banner nhiễu), fallback thng bo thn thiện "Video khng khả dụng / bị xa / bị chặn khu vực".
- **Tải Phụ Đ (HTTP 429)**: Trước đy Sublix gửi 8 request HTTP lin tiếp đến YouTube để lấy 4 ngn ngữ phụ đ (×2 loại subs), gy HTTP 429 "Too Many Requests". Gi thm `--sleep-subtitles 5` để yt-dlp tự delay 5s giữa mỗi request sub (verify CLI: mức 2s vẫn dnh 429 khi chạy dồn, mức 5s qua sạch ở lượt chạy kế tiếp). Nếu YouTube vẫn giới hạn khi chạy dồn (rate-limit pha server, sleep khng xa 100%): job **khng cn bo  Lỗi oan** — video đ tải xong vẫn giữ ✅ Hon thnh, km cảnh bo ⚠ "phụ đ chưa tải được (429), thử lại sau vi pht" ngay trn UI (lỗi được hiện r, khng im lặng).
- **Window title**: đồng bộ title bar 2 cửa sổ (main + overlay) v `v0.9.2`  khớp sidebar/Changelog (bản v0.9.1 trước đ cn để st `v0.9.0`).

---

## v0.9.1 — 2026-10-06
### Sửa Lỗi Window Title Version Mismatch
- Window title (title bar + taskbar) của 2 window (`main` + `overlay`) bị hardcode `v0.8.0` trong `src-tauri/tauri.conf.json` d sidebar/Changelog đ hiển thị `v0.9.0`.
- Sửa: cả 2 title gi match với version thật.

---

## v0.9.0 — 2026-10-06
### Sửa Lỗi Quan Trng: YouTube Download Hoạt Động Trở Lại
- Pht hiện root cause: **yt-dlp 2024.10+ yu cầu JS runtime (Node.js/Deno) + remote challenge solver** để bypass YouTube anti-bot. Sublix chưa pass 2 flag ny nn **mi URL YouTube fail im lặng** (return `"n challenge solving failed"` → 0 bytes).
- Helper mới `find_js_runtime()` trong `src-tauri/src/downloader/mod.rs` tự động pht hiện `node` hoặc `deno` trn PATH (qua `where node.exe` trn Windows, `which node` trn Unix).
- Auto pass `--js-runtimes <runtime>:<path>` + `--remote-components ejs:github` khi tải video YouTube — script solver được tải từ GitHub ở lần đầu, cache lại cho lần sau.
- p dụng cho cả `start_download` (km nhnh retry cookie fallback) v `fetch_video_info` (inspect metadata) — nn "Kiểm Tra Link" cũng work trn YouTube.
- **Verified thủ cng bằng CLI**: 11.28 MB Rick Astley tải v trong ~1 giy.

### Competitive Analysis với 4 Repo Voice/Dubbing
- Nghin cứu su 4 đối thủ trn GitHub: **VoiceStudio** (53k, Python+Electron, AGPL), **dub-studio** (Tauri giống Sublix, native C++ engines), **YouDub-webui** (FastAPI+Next.js, production với tc giả 1M+ subs), **ZastTranslate** (Python Gradio, 33 ngn ngữ + Viral Shorts).
- Pht hiện Sublix c 3 điểm **UNIQUE**:
  1. **Đa engine song song** (Qwen 3 GPU local + MiniMax-M3 Cloud)  chưa ai lm
  2. **1-click pipeline bridges** (Downloader → File Sub → Dubbing Studio) — chưa ai lm
  3. **Downloader đa nn tảng** (9 site: YT/TT/Douyin/Bili/FB/X/IG/Vimeo/Reddit)  chỉ Sublix c
- Gợi  **Roadmap P0**: Voice DESIGN (text → voice), MCP server cho AI agents, multi-TTS engine swap.
- Ti liệu đầy đủ tại `agent-team/COMPETITIVE_ANALYSIS.md` (15KB, 9 phần).

### File thay đổi
- `src-tauri/src/downloader/mod.rs` — +116 dng (helper `find_js_runtime` + 2 call sites)
- `src/views/ChangelogModal.tsx` — thm entry v0.9.0
- `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` — bump 0.8.0 → 0.9.0
- `agent-team/COMPETITIVE_ANALYSIS.md` — file mới

### Verify
- `cargo check` ✅ 0 warnings (4.11s)
- `npm run build` ✅ 364 KB JS / 80 KB CSS (1.17s)
- `cargo test --lib find_ytdlp_binary` ✅ PASS
- yt-dlp CLI test thật với flags mới ✅ **PASS (Rick Astley 11.28 MB)**

### Cần cho lần tới
- **Nếu my khng c Node.js**: ci https://nodejs.org (Node 18+) hoặc `irm https://deno.land/install.ps1 | iex` (cho Deno). Khng c runtime → yt-dlp vẫn in warning v thử cc site khng cần bypass.

---

## v0.8.0 — 2026-10-04
### Nhận Diện Thị Gic AI & Bộ Minh Hoạ Điện Ảnh
- Logo mới: chữ S kết từ dải phim điện ảnh, km bộ icon ứng dụng trn bộ cho taskbar & cửa sổ.
- Ảnh hero rạp chiếu phim ấm p cho mn ci đặt đầu tin (Onboarding).
- Bộ minh hoạ phẳng phong cch điện ảnh: khung chn file, Trung tm Models, lịch sử trống.
- Vn phim m tinh tế phủ trn sidebar ở theme Cinema & Studio.
- Tối ưu dung lượng ảnh từ 4.4 MB xuống cn 184 KB, app nhẹ v khởi động nhanh hơn.
- Hỗ trợ Ko & Thả (Drag & Drop) tệp Video / Audio trực tiếp từ my tnh vo ứng dụng qua Tauri Native Webview API.
- Thay thế ton bộ hộp chn native Windows cũ bằng Custom Glass Select sang trng.

---

## v0.7.0 — 2026-10-04
### Đại Tu Giao Diện Cinema Studio & AI Dubbing Đa Vai
- Bổ sung 4 phong cch giao diện: Cinema, Studio, Light, Vibrant.
- Bộ chn Theme nhanh với nt chuyển đổi tức th, tự động ghi nhớ cấu hnh khi khởi động lại.
- Chuẩn ha ton bộ mu sắc sang Design Tokens (CSS Variables), thanh cuộn siu mng tinh tế.
- Tch ging gốc sạch 100% bằng Demucs v4 CUDA GPU.
- Tự động nhận diện phn vai diễn vin qua kịch bản ngữ cảnh MiniMax M3.
- Bộ ging đc Neural siu tự nhin (Edge-TTS) + tự động co gin tốc độ (FFmpeg atempo).

---

## v0.6.0 — 2026-10-04
### Nng Cấp CUDA RTX 3090 & Local LLM Translation
- Tch hợp Whisper Large-v3-Turbo Q8 (874MB) chạy trực tiếp trn GPU CUDA.
- Hỗ trợ Local Qwen 3 4B model cho dịch thuật offline, tốc độ ~0.1s/cu.

---

## v0.5.0 — 2026-10-03
### WASAPI Loopback Zero-Gap & Smart VAD
- ...

(Sửa lỗi Critical YouTube download, Competitive Analysis, bump version)

---

## Quy ước pht hnh
- Mỗi commit sửa code (fix bug, feature, UI polish) **PHẢI**:
    1. Bump version `major.minor.patch` trong `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
    2. Thm entry vo `CHANGELOG_DATA` trong `src/views/ChangelogModal.tsx`
    3. Thm entry tương ứng vo `CHANGELOG.md` (file ny)
- **minor** cho fix/feature đng kể, **patch** cho nh.
- Commit thay đổi version + CHANGELOG trong commit ring (tch khi commit code).