
## v0.11.17 — 2026-10-09
### Sublix Studio: Hủy Lồng Tiếng Báo Rõ "(nhận x/y câu)" (ROUND-5 R5-07)

**Vấn đề (CommandCode verify R5-07):** Khi user bấm Hủy giữa chừng batch dịch, app báo `"Đã dừng tiến trình theo yêu cầu của bạn."` — KHÔNG kèm `x/y câu` → user không biết đã dịch được bao nhiêu trước khi hủy. Nhánh `translated_batch.len() < texts_to_translate.len()` ở line 1700-1706 thì CÓ kèm `(nhận x/y câu)` — không đồng nhất.

**Fix v0.11.17:** Bổ sung `(nhận x/y câu)` ở 2 nhánh cancel trong vòng lặp dịch (dubbing/mod.rs):
- Line 1667-1669 (cancel giữa 2 chunk, trước khi gọi `translate_batch_with_config`): `(nhận {chunk_start}/{total} câu)`.
- Line 1696-1698 (cancel ngay sau khi nhận batch từ translator): `(nhận {chunk_start + translated_batch.len()}/{total} câu)`.

Đồng bộ với nhánh line 1700-1706 (thiếu câu) đã có sẵn format này.

**File đã đổi:** `src-tauri/src/dubbing/mod.rs`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Ghi chú R5-06 (verified pass):** R5-06 "hủy dịch vứt results" — em đã verify lại `translate_batch_with_config` (translate/mod.rs:340-530). R4-06 đã fix đầy đủ 5 nhánh cancel (deepseek/openrouter/minimax/ollama/default): mọi `return sub_res;` đều từ closure `match` arm → caller line 526 `results.extend(chunk_res)` extend OK → outer loop line 350-358 `return results;` (partial) đúng. Caller dubbing/mod.rs:1700-1706 cũng đã check `translated_batch.len() < texts_to_translate.len()` → trả Err có `(nhận x/y câu)`. **Không cần sửa thêm** — đã pass, không có bug R5-06.

**Còn lại Round 5:** R5-08 (WAV scanner parse fmt chunk — R4-07 nợ cũ), R5-09 (postcss.config.cjs), R5-10 (AGENT_CHAT cleanup + language=vie hardcode).

---

## v0.11.16 — 2026-10-09
### Sublix Studio: Undo Bản Dịch + Audio Đúng Chiều (ROUND-5 R5-05)

**Vấn đề (CommandCode verify R5-05):** Bấm ↶ "Bản dịch" hoặc "Audio" → undo bị no-op hoặc lệch — undo về chính trạng thái vừa sửa. Triệu chứng rất khó chịu: user sửa 1 câu, bấm ↶, không thấy gì thay đổi → tưởng app hỏng.

**Root cause:** `saveTranslationUndoIfChanged()` (line 449) và `saveAudioUndoIfChanged()` (line 465) — cả 2 đều gọi `saveTranslationUndo()` / `saveAudioUndo()` SAU khi user sửa xong → push snapshot **SAU** (after) lên stack. Khi user bấm ↶ → `handleUndoTranslation`/`handleUndoAudio` lấy snapshot đỉnh stack (chính là `after` vừa push) → setSegments/setSpeakers về chính giá trị hiện tại → no-op.

Đáng lẽ: push snapshot **TRƯỚC** khi sửa (đã capture trong `translationPreFocusRef`/`audioPreFocusRef` ở onFocus) → undo sẽ khôi phục về giá trị trước khi sửa.

**Fix v0.11.16:**
- `saveTranslationUndoIfChanged`: thay vì gọi `saveTranslationUndo()` → inline push `before` (snapshot từ `translationPreFocusRef.current`) trực tiếp lên `setUndoTranslationStack`.
- `saveAudioUndoIfChanged`: tương tự, push `before` từ `audioPreFocusRef.current` lên `setUndoAudioStack`.
- 2 chỗ gọi `saveAudioUndo()` khác (line 1856 đổi voice, line 1920 thêm speaker) **không cần đổi** — pattern này gọi `saveAudioUndo()` TRƯỚC khi `setSpeakers`, nên `speakersRef.current` tại thời điểm gọi vẫn là BEFORE → push-before đúng rồi.

**File đã đổi:** `src/views/SublixStudioView.tsx`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Test:** Build TS pass. PO test thủ công qua `Chay-Sublix.bat` — sửa 1 câu dịch, blur, bấm ↶ "Bản dịch" → câu đó phải trở về giá trị cũ. Tương tự cho ↶ "Audio" (đổi voice 1 nhân vật, blur, bấm ↶ → voice trở về cũ).

**Còn lại Round 5:** R5-06 (hủy dịch partial vẫn rò `Vec::new()` ở 1-2 nhánh), R5-07 (hủy lồng tiếng báo "x/y câu"), R5-08/09/10.

---

## v0.11.15 — 2026-10-09
### Sublix Studio: Cleanup Preview File Cũ Khi Đổi Video / Đóng App (ROUND-5 R5-03)

**Vấn đề (CommandCode verify R5-03):** `transcode_for_preview` (R4-01) tạo file trong `%TEMP%\sublix_preview\{stem}_{size}_{mtime}_{nonce}.mp4`. Mỗi lần fallback (WebView2 hỏng codec hoặc video im lặng R5-01) → 1 file mới với `nonce` = nanosecond timestamp → file cũ KHÔNG bị xoá. Mỗi lần đổi video → thêm 1 file tích luỹ. App chạy lâu → `%TEMP%` đầy dần → user phải tự dọn.

**Fix v0.11.15:**
- **Backend (lib.rs):** thêm 2 Tauri command mới:
  - `cleanup_preview_for_input(input_path)` — xoá tất cả file preview của 1 input (match pattern `{stem}_{size}_{mtime}_*.mp4`). Trả về số file đã xoá.
  - `cleanup_all_previews()` — xoá TOÀN BỘ folder `%TEMP%\sublix_preview\`. Gọi khi app đóng.
- **Frontend (tauri.ts):** thêm 2 wrapper `sublix.cleanupPreviewForInput(path)` + `sublix.cleanupAllPreviews()`.
- **SublixStudioView.tsx:**
  - useEffect watch `filePath` → khi đổi video (setFilePath với file mới) hoặc clear (setFilePath("")) → fire-and-forget gọi `cleanupPreviewForInput(oldPath)`. Đồng thời reset `transcodedPath` về `null` để `<video>` không trỏ vào file preview đã bị xoá.
  - useEffect cleanup on unmount (chuyển tab Studio ↔ Dubbing hoặc đóng app) → fire-and-forget gọi `cleanupAllPreviews()`.

**Trade-off (R5 ⚠️):** Fire-and-forget (không await) — React không block UI, nhưng nếu Rust cleanup chậm + user chuyển tab nhanh thì có thể có race. Tuy nhiên cleanup chỉ xoá file temp, an toàn, không ảnh hưởng UX.

**File đã đổi:** `src-tauri/src/lib.rs`, `src/views/SublixStudioView.tsx`, `src/lib/tauri.ts`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Còn lại Round 5:** R5-05/06/07 (regression từ Round 4), R5-08/09/10 (nợ cũ + housekeeping).

---

## v0.11.14 — 2026-10-09
### Sublix Studio: Dropdown Không Còn Trắng Xóa (PO yêu cầu)

**Vấn đề (PO feedback trực tiếp 2026-10-09 11:50):** Dropdown "Ngôn ngữ nguồn / Ngôn ngữ đích / Model lồng tiếng" trong tab Studio nhìn **trắng xóa** — text trắng trên nền trắng không đọc được. PO bực: *"sửa cho tôi mấy cái dropdown nữa nhìn trắng xóa"*.

**Root cause:** `.studio-form-select` đặt `background: var(--bg-card)` (0.03 opacity) → gần như trong suốt → lộ nền sáng của theme Cinema/Studio. `<option>` của browser mặc định background trắng → khi bấm mở dropdown list hiện ra trắng toát.

**Fix v0.11.14:**
- Đổi `background: var(--bg-card)` → `var(--bg-side, #191511)` (đậm hơn nhiều, theme Cinema/Studio đều có token).
- Thêm `appearance: none; -webkit-appearance: none; -moz-appearance: none;` để tắt dropdown arrow mặc định browser (sau này tự vẽ nếu cần).
- Style `<option>` riêng: `background: var(--bg-side, #191511); color: var(--t1);` → dropdown list khi bấm mở ra cũng theo theme, không còn trắng.
- Cũng fix luôn `.studio-video-select-subtle` (nếu có dùng) cho đồng bộ.

**File đã đổi:** `src/views/SublixStudioView.css`, `package.json`, `CHANGELOG.md`, `src/views/ChangelogModal.tsx`.

**Test:** Build TS pass. App hiện vẫn KHÔNG chạy (đã kill trước build theo luật) — PO test thủ công khi mở app lại qua `Chay-Sublix.bat`.

---

## v0.11.13 — 2026-10-09
### Sublix Studio: Detect Video Im Lặng + Toast Loading (ROUND-5 R5-01 + R5-02)

**Vấn đề (CommandCode verify R5-01):** R4-01 fallback chỉ trigger khi <video>.onError event. Nhưng WebView2 có thể hỏng codec kiểu **im lặng**: chạy giờ, phát tiếng, **KHUNG TRỐNG** — không error event → fallback chết cứng. Ảnh cũ 
4-01_preview_playing.png (00:15.78 khung trống) tự tố vấn đề này.

**Fix v0.11.13:**
- Sau loadedmetadata + **800ms** (đợi WebView2 decode frame đầu), kiểm ideo.videoWidth === 0 → kích hoạt 	ranscodeForPreview chủ động.
- Vẫn giữ nhánh onError cũ.
- **R5-02 (gộp):** Toast "⏳ Video không hiển thị hình — đang chuyển sang dạng xem được…" khi bắt đầu, "✅ Đã chuyển sang dạng xem được" khi xong, "❌ Không thể chuyển dạng" nếu lỗi.
- Cleanup timer on unmount + đổi file (tránh React warning stale state).
- Dùng ilePathRef + 	ranscodedPathRef (refs mới) để async timeout access state hiện tại (không stale closure).

**File đã đổi:** src/views/SublixStudioView.tsx, package.json, src-tauri/Cargo.toml, CHANGELOG.md.

**Còn lại Round 5:** R5-03 (xoá preview cũ), R5-05/06/07 (regression từ Round 4), R5-08/09/10 (nợ cũ + housekeeping), dropdown fix.

---
## v0.11.11 â€” 2026-10-09
### Sublix Studio: Aâ†’Z 1-Click ÄÃ£ CÃ³ Sáºµn (TASK_A_Z_ONE_CLICK S1)

**PhÃ¡t hiá»‡n khi Ä‘iá»u tra TASK_A_Z_ONE_CLICK.md:**
TÃ­nh nÄƒng "dÃ¡n link â†’ chuyá»ƒn sang Studio vá»›i file Ä‘Ã£ chá»n" **Ä‘Ã£ cÃ³ sáºµn tá»« trÆ°á»›c**, khÃ´ng cáº§n code thÃªm. Flow Ä‘áº§y Ä‘á»§:

1. Tab Táº£i video: táº£i xong video â†’ click **"âœ¨ ÄÆ¯A VÃ€O STUDIO Lá»’NG TIáº¾NG & SUB"** trong card video (line 1148) â†’ gá»i `onNavigateToStudio(filePath)`.
2. `SettingsView.tsx:handleRouteToStudio(path)` â†’ set `studioInitialPath(path)` + tÄƒng `studioFileNonce` + `setActiveTab("studio")`.
3. Tab Studio nháº­n `initialFilePath` prop â†’ `useEffect` tá»± Ä‘á»™ng `setFilePath(initialFilePath)` â†’ user báº¥m "Báº¯t Ä‘áº§u PhÃ¢n TÃ­ch" Ä‘á»ƒ cháº¡y.

**Cáº£i thiá»‡n nhá» v0.11.11 (5 phÃºt):**
- ThÃªm tooltip rÃµ hÆ¡n cho nÃºt "ÄÆ¯A VÃ€O STUDIO" (Ä‘Ã£ cÃ³ sáºµn, chá»‰ verify + polish wording).
- Ghi CHANGELOG Ä‘á»ƒ PO biáº¿t tÃ­nh nÄƒng cÃ³ sáºµn, khÃ´ng yÃªu cáº§u PO test láº¡i.

**File Ä‘Ã£ Ä‘á»•i:** `CHANGELOG.md`, `package.json`, `src-tauri/Cargo.toml` (version bump only).

**CÃ²n láº¡i (chÆ°a lÃ m trong vÃ²ng nÃ y):** S2 nÃºt "Tá»± Ä‘á»™ng Aâ†’Z" (tick checkbox trÆ°á»›c khi táº£i â†’ tá»± Ä‘á»™ng lá»“ng tiáº¿ng khi táº£i xong) â€” 1-2 giá», lÃ m sau náº¿u PO yÃªu cáº§u.

---

## v0.11.10 â€” 2026-10-09
### Dubbing Export: Audio Track Tag `language=vie` (OPTION_RESEARCH R2)

**Váº¥n Ä‘á» (OPTION_RESEARCH_DUBBING.md R2):** MP4 output tá»« Dubbing thiáº¿u metadata `language=vie` cho track audio â†’ player (VLC, mpv) hiá»ƒn thá»‹ "und" hoáº·c sai ngÃ´n ngá»¯; user cÃ³ track Viá»‡t mÃ  app nÃ³i "unknown".

**Fix v0.11.10:** ThÃªm 2 dÃ²ng vÃ o ffmpeg remux command (`dubbing/mod.rs:2187-2192`):
```rust
.arg("-metadata:s:a:0")
.arg("language=vie")
```
â†’ MP4 output cÃ³ tag language=vie chuáº©n. Player tá»± detect Ä‘Ãºng.

**File Ä‘Ã£ Ä‘á»•i:** `src-tauri/src/dubbing/mod.rs`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

**CÃ²n láº¡i (out of scope vÃ²ng nÃ y):** R7 (hardcode sub vÃ o app) â€” 1-2h, lÃ m á»Ÿ vÃ²ng sau náº¿u PO yÃªu cáº§u.

---

## v0.11.9 â€” 2026-10-09
### Translate Pipeline: Há»§y Dá»‹ch Tráº£ Partial Thay VÃ¬ Rá»—ng (ROUND-4 R4-06)

**Váº¥n Ä‘á» (CommandCode verify):** `translate_batch_with_config` vá»©t cáº£ chunk OK khi user cancel giá»¯a chá»«ng â†’ caller bÃ¡o "0/x cÃ¢u" oan (Ä‘Ã¡ng láº½ Ä‘Ã£ dá»‹ch Ä‘Æ°á»£c 14/30 cÃ¢u).

**Fix v0.11.9:** Thay `return Vec::new()` thÃ nh `return sub_res` á»Ÿ 5 closure (deepseek, openrouter, minimax, ollama, default) + 1 chá»— á»Ÿ outer loop. Cáº¥u trÃºc:
```rust
let mut sub_res: Vec<String> = Vec::new();  // khá»Ÿi táº¡o á»Ÿ Ä‘áº§u closure
if is_dubbing_cancelled() {
    return sub_res;  // â† partial rá»—ng OK (chÆ°a lÃ m gÃ¬)
}
// ...
sub_res = Vec::with_capacity(chunk.len());
for item in chunk {
    if is_dubbing_cancelled() {
        return sub_res;  // â† partial Ä‘Ã£ dá»‹ch Ä‘áº¿n Ä‘Ã¢u giá»¯ Ä‘áº¿n Ä‘Ã³
    }
    // ...
}
```
Caller (dubbing/mod.rs) sáº½ check `is_dubbing_cancelled()` sau khi nháº­n results Ä‘á»ƒ bÃ¡o "Ä‘Ã£ há»§y á»Ÿ x/y cÃ¢u" chÃ­nh xÃ¡c.

**File Ä‘Ã£ Ä‘á»•i:** `src-tauri/src/translate/mod.rs`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.8 â€” 2026-10-09
### Sublix Studio: Undo Stack Chá»‰ Save Khi Ná»™i Dung Thay Äá»•i (ROUND-4 R4-05)

**Váº¥n Ä‘á» (CommandCode verify):** `onFocus` lÆ°u snapshot ká»ƒ cáº£ khi user khÃ´ng sá»­a gÃ¬ â†’ undo stack Ä‘áº§y cap rÃ¡c, báº¥m "â†¶" hoÃ n tÃ¡c vá» tráº¡ng thÃ¡i y há»‡t.

**Fix v0.11.8:**
- Thay `onFocus={saveAudioUndo}` â†’ `onFocus={lÆ°u snapshot}` + `onBlur={so sÃ¡nh, chá»‰ save náº¿u KHÃC}`.
- Ãp dá»¥ng cho 2 chá»—: speaker name input (line 1740) + translation input (line 2446).
- CÆ¡ cháº¿:
  - `audioPreFocusRef` / `translationPreFocusRef` lÆ°u state TRÆ¯á»šC khi user focus.
  - Khi blur, JSON.stringify compare before vs after.
  - Náº¿u khÃ¡c â†’ save undo stack. Náº¿u giá»‘ng â†’ bá» qua.
- Stack chá»‰ chá»©a THAY Äá»”I THáº¬T â†’ undo chÃ­nh xÃ¡c, khÃ´ng undo "áº£o".

**File Ä‘Ã£ Ä‘á»•i:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.7 â€” 2026-10-09
### Sublix Studio: KÃ©o-Tháº£ Há»ng ThÃ¬ BÃ¡o Toast (ROUND-4 R4-09)

**Váº¥n Ä‘á» (CommandCode verify):** `catch` á»Ÿ `webview.onDragDropEvent` chá»‰ `console.warn` â€” user tháº¥y kÃ©o tháº£ khÃ´ng cÃ³ gÃ¬ xáº£y ra â†’ tÆ°á»Ÿng app há»ng, ngá»“i mÃ².

**Fix v0.11.7:**
- Khi `onDragDropEvent` tháº¥t báº¡i (catch block) â†’ `showToast("âš ï¸ KÃ©o tháº£ khÃ´ng kháº£ dá»¥ng trÃªn há»‡ thá»‘ng nÃ y â€” hÃ£y dÃ¹ng nÃºt 'Má»Ÿ video'")` thay vÃ¬ im láº·ng.
- Khi drop event tráº£ vá» mÃ  `paths` rá»—ng â†’ cÅ©ng toast cáº£nh bÃ¡o.
- User biáº¿t ngay pháº£i dÃ¹ng nÃºt `Má»Ÿ video` thay vÃ¬ cá»‘ kÃ©o tháº£ vÃ´ Ã­ch.

**File Ä‘Ã£ Ä‘á»•i:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.6 â€” 2026-10-09
### Sublix Studio: Re-Apply playbackRate Khi Load Video Má»›i (ROUND-4 R4-04)

**Váº¥n Ä‘á» (CommandCode verify):** Äá»•i video khi Ä‘ang á»Ÿ 1.5x â†’ `<video>` element reset vá» 1x nhÆ°ng UI váº«n hiá»ƒn thá»‹ "Tá»‘c Ä‘á»™: 1.5x" (nÃ³i dá»‘i user â€” element cháº¡y 1x nhÆ°ng UI tÆ°á»Ÿng 1.5x).

**Fix v0.11.6:** Trong `handleLoadedMetadata()` thÃªm 3 dÃ²ng:
```ts
if (videoRef.current.playbackRate !== playbackSpeed) {
  videoRef.current.playbackRate = playbackSpeed;
}
```
â†’ Má»—i láº§n video má»›i load xong metadata, Ã©p playbackRate khá»›p vá»›i `playbackSpeed` state. UI vÃ  element luÃ´n Ä‘á»“ng bá»™.

**File Ä‘Ã£ Ä‘á»•i:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.5 â€” 2026-10-09
### Sublix Studio: Bá» Beep Giáº£ Máº¡o Máº«u Giá»ng (ROUND-4 R4-03)

**Váº¥n Ä‘á» (CommandCode verify):** Fallback `createAuditionBeepWav` phÃ¡t "beeep" 0.4s nhÆ°ng toast láº¡i ghi "ðŸŽ§ Nghe thá»­ máº«u giá»ng X" â†’ máº¡o danh giá»ng tháº­t (vi pháº¡m tinh tháº§n "khÃ´ng Ä‘á»“ giáº£").

**Fix v0.11.5:**
- 2 chá»— gá»i `createAuditionBeepWav` (line 904, 1083) â†’ Ä‘á»•i thÃ nh toast "âš ï¸ ChÆ°a cÃ³ máº«u giá»ng cho vai X â€” báº¥m ðŸ”Š Nghe giá»ng gá»‘c Ä‘á»ƒ táº¡o" (line 901) vÃ  "âš ï¸ ChÆ°a cÃ³ máº«u giá»ng 'voice'..." (line 1081).
- XÃ³a luÃ´n function `createAuditionBeepWav` (45 dÃ²ng code cháº¿t) â€” khÃ´ng cÃ²n dÃ¹ng ná»¯a, trÃ¡nh dead code.
- NgÆ°á»i dÃ¹ng Ä‘Æ°á»£c bÃ¡o trung thá»±c thay vÃ¬ bá»‹ Ä‘Ã¡nh lá»«a báº±ng beep.

**File Ä‘Ã£ Ä‘á»•i:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.4 â€” 2026-10-09
### Sublix Studio: Hotkey Timeline + NÃºt Báº¥m Zoom (âˆ’âˆ’, âˆ’, âŸ², +, ++) â€” Chuáº©n Premiere

**PO yÃªu cáº§u (2026-10-09):** "báº¡n gÃ¡n cho tÃ´i máº¥y cÃ¡i hotkey Ä‘á»ƒ Ä‘iá»u khiá»ƒn timeline nhÆ° premier Ä‘i, tá»± nghiÃªn cá»©u nhÃ© tÃ´i ko cÃ³ thá»i gian Ä‘i chá»‰ báº¡n tá»«ng Ä‘Ã­ Ä‘Ã¢u, vá»›i cáº£ cÃ¡i zoom ra vÃ o time nÃªn cÃ³ thÃªm nÃºt báº¥m - + Ä‘á»ƒ dá»… zoom ná»¯a thay vÃ¬ cÃ¡i slider nÃ y."

**Fix v0.11.4:**

**Hotkey timeline (má»Ÿ rá»™ng tá»« v0.11.3 chá»‰ cÃ³ Space/â†/â†’/Home/End):**
| PhÃ­m | HÃ nh Ä‘á»™ng | Chuáº©n Premiere |
|---|---|---|
| `+` hoáº·c `=` | Zoom in nháº¹ Ã—1.5 | `+` |
| `-` hoáº·c `_` | Zoom out nháº¹ Ã—0.67 | `-` |
| `\` | Fit timeline (reset 100%) | `\` |
| `Ctrl/Cmd+0` | Fit timeline (alternative) | (giá»‘ng browser Ctrl+0) |
| `Numpad +` / `-` | Zoom in/out (numpad) | (bonus) |

(Ä‘Ã£ cÃ³ sáºµn: Space=play/pause, â†/â†’=step 1s, Shift+â†/â†’=step 5s, Home/End=goto Ä‘áº§u/cuá»‘i, Ctrl+Z=undo, Ctrl+I=má»Ÿ file)

**Thay slider báº±ng 5 nÃºt báº¥m (anh tháº¥y slider khÃ³ dÃ¹ng):**
- `âˆ’âˆ’` zoom out máº¡nh (Ã—0.5)
- `âˆ’` zoom out nháº¹ (Ã—0.67)
- `âŸ²` reset 100%
- `+` zoom in nháº¹ (Ã—1.5)
- `++` zoom in máº¡nh (Ã—2)
- Hiá»ƒn thá»‹ zoom % to rÃµ (font-weight 600, mÃ u accent, font-variant tabular-nums)
- Tooltip má»—i nÃºt ghi rÃµ phÃ­m táº¯t

**File Ä‘Ã£ Ä‘á»•i:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.3 â€” 2026-10-09
### Sublix Studio: Timeline Zoom ÄÃºng Chuáº©n Premiere (full video fit + tick tá»± co giÃ£n)

**PO phÃ n nÃ n (2026-10-09):** "cÃ¡i timeline hiá»‡n táº¡i quÃ¡ vá»› váº©n, thay vÃ¬ zoom ra thá»i gian theo cáº£ video theo kiá»ƒu premier hay cÃ¡c trÃ¬nh dá»±ng video khÃ¡c, nÃ³ láº¡i cháº¡y kiá»ƒu zoom max ra 300s, vá»›i cÃ¡c má»‘c thá»i gian ko hiá»ƒu sao láº¡i tÃ­nh lÃ  5s 1 láº§n".

**Váº¥n Ä‘á» v0.11.2:** Zoom semantic sai â€” dÃ¹ng "sá»‘ giÃ¢y visible" (5-300s) thay vÃ¬ "% viewport". Má»‘c tick cá»©ng `i*5` khÃ´ng scale theo zoom.

**Fix v0.11.3 (Ä‘Ãºng chuáº©n Premiere/DaVinci):**
- **Semantic zoom:** `zoomLevel` giá» lÃ  **% viewport** (100 = full video fit ~1200px, 1000 = zoom 10Ã—, 10000 = zoom 100Ã—). Default 100% â€” má»Ÿ video tháº¥y ngay toÃ n cáº£nh.
- **Má»‘c tick tá»± co giÃ£n** theo `pxPerSec` qua hÃ m `chooseTickInterval`:
  - `pxPerSec â‰¥ 100` â†’ tick 0.1s/0.5s/1s (zoom in cá»±c máº¡nh)
  - `pxPerSec ~ 10-100` â†’ tick 2s/5s/10s/15s
  - `pxPerSec ~ 1-10` â†’ tick 30s/1min/2min
  - `pxPerSec ~ 0.1-1` â†’ tick 5min/10min/30min
  - `pxPerSec < 0.1` â†’ tick 1h/2h (full video ngáº¯n fit viewport)
- **CÃ´ng thá»©c:** `pxPerSec = (1200 * zoomLevel/100) / mediaDuration`. Tick má»—i ~100px.
- **VÃ­ dá»¥ thá»±c táº¿:**
  - Kenji 38:24 (2304s), zoom 100% â†’ 0.52 px/s â†’ tick má»—i **5 phÃºt** (0:00, 5:00, 10:00, ..., 35:00)
  - Kenji 38:24, zoom 500% â†’ 2.6 px/s â†’ tick má»—i **30 giÃ¢y**
  - Kenji 38:24, zoom 5000% â†’ 26 px/s â†’ tick má»—i **5 giÃ¢y**
  - Kenji 38:24, zoom 10000% â†’ 52 px/s â†’ tick má»—i **1-2 giÃ¢y**
- **NÃºt báº¥m má»›i:** âˆ’ (zoom out Ã—0.67, min 100%) / âŸ² (reset 100%) / + (zoom in Ã—1.5, max 10000%)
- **Slider:** 100% â†’ 10000%, step 50, hiá»ƒn thá»‹ "{N}% viewport" (trÆ°á»›c "{N}s hiá»ƒn thá»‹")
- **`handleFitTimeline()`** giá» chá»‰ `setZoomLevel(100)` thay vÃ¬ `Math.ceil(mediaDuration)`

**File Ä‘Ã£ Ä‘á»•i:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.2 â€” 2026-10-09
### Sublix Studio: Timeline Zoom In/Out (nÃºt báº¥m + slider + reset)

**PO yÃªu cáº§u (2026-10-09):** "code cho tÃ´i cÃ¡i zoom ra timeline Ä‘i, hiá»‡n táº¡i ko cÃ³ zoom gáº§n zoom xa timeline, Ä‘á»ƒ xem timeframe nÃ³ bÃ© hÆ¡n hoáº·c lá»›n hÆ¡n áº¥y."

**TrÆ°á»›c Ä‘Ã³:** CÃ³ slider zoom (range 10-120s visible) nhÆ°ng chá»‰ `<span>âˆ’</span>` + `<span>+</span>` text â€” khÃ´ng cÃ³ nÃºt báº¥m tháº­t, ngÆ°á»i dÃ¹ng khÃ³ dÃ¹ng.

**Fix v0.11.2:**
- **3 nÃºt báº¥m má»›i** trong thanh timeline controls:
  - `âˆ’` (zoom out, x1.5 â†’ xem nhiá»u giÃ¢y hÆ¡n)
  - `âŸ²` (reset vá» 30s máº·c Ä‘á»‹nh)
  - `+` (zoom in, x1.5 â†’ xem Ã­t giÃ¢y hÆ¡n, frame lá»›n hÆ¡n)
- **Má»Ÿ rá»™ng range slider:** 5s â†’ 300s (trÆ°á»›c 10s â†’ 120s) â€” há»— trá»£ video dÃ i hÆ¡n Kenji 38min.
- **Hiá»ƒn thá»‹ rÃµ rÃ ng:** "{N}s hiá»ƒn thá»‹" vá»›i `minWidth: 56px` (trÆ°á»›c lÃ  text lá»ng).
- **Math:** `setZoomLevel(clamp(round(zoomLevel * 1.5), 5, 600))` â€” má»—i láº§n báº¥m +/âˆ’ scale 1.5Ã—.
- NÃºt +/âˆ’ cÃ³ `title` (tooltip) cho rÃµ má»¥c Ä‘Ã­ch.

**File Ä‘Ã£ Ä‘á»•i:** `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md`.

---

## v0.11.1 â€” 2026-10-09
### Sublix Studio: Tháº£ Video VÃ o App Pháº£i THáº¤Y HÃŒNH (ROUND-4 R4-01)

**Váº¥n Ä‘á» (CommandCode verify, áº£nh `ui30_cancel_analysis_button.png`):**
Khi tháº£ file `multi_speaker_scene.mp4` hoáº·c video táº£i tá»« web (VP9/AV1/HEVC/H.264 high) vÃ o Sublix Studio â†’ WebView2 bÃ¡o "KhÃ´ng thá»ƒ phÃ¡t táº­p tinâ€¦ codec khÃ´ng Ä‘Æ°á»£c há»— trá»£" â†’ ngÆ°á»i dÃ¹ng tÆ°á»Ÿng "tháº£ khÃ´ng Ä‘Æ°á»£c" â†’ app chÆ°a dÃ¹ng Ä‘Æ°á»£c cho viá»‡c chÃ­nh.

**Fix v0.11.1 (Æ¯u tiÃªn 1 â€” ffmpeg chuyá»ƒn táº¡m):**
- **Backend (`src-tauri/src/lib.rs`):** Tauri command má»›i `transcode_for_preview(input_path) â†’ temp_path` dÃ¹ng ffmpeg táº¡o báº£n H.264 baseline level 3.0 + AAC LC + faststart. Cache theo `(file_size, mtime, nonce)` trong `%TEMP%\sublix_preview\`. NgÆ°á»i dÃ¹ng khÃ´ng cáº§n biáº¿t file táº¡m tá»“n táº¡i.
- **Frontend (`tauri.ts`):** method `transcodeForPreview(inputPath): Promise<string>`.
- **Frontend (`SublixStudioView.tsx`):**
  - ThÃªm state `transcodedPath: string | null` (path preview sau khi transcode).
  - `<video>.onError` â†’ gá»i `sublix.transcodeForPreview(filePath)` â†’ set `transcodedPath` â†’ React re-render `<video src={previewPath}>` vá»›i `key={previewPath}` Ä‘á»ƒ force reload â†’ tá»± phÃ¡t báº£n táº¡m.
  - Náº¿u ffmpeg cÅ©ng fail â†’ má»›i fallback Cinema Visualizer (giá»¯ nguyÃªn `setVideoPlayError(true)`).
  - Toast "Äang chuyá»ƒn táº¡m video sang H.264â€¦" + "ÄÃ£ chuyá»ƒn táº¡m xong, Ä‘ang phÃ¡t báº£n previewâ€¦".
  - Reset `transcodedPath = null` khi user pick file má»›i / drop file má»›i / Ä‘á»•i `initialFilePath`.
- **LÆ°u Ã½:** KHÃ”NG Ä‘á»¥ng `Chay-Sublix.bat`, KHÃ”NG dá»¥ng `cargo build --release` (vi pháº¡m BUG-H07), KHÃ”NG Ä‘á»¥ng tab Táº£i video.

**CÃ²n láº¡i (chÆ°a lÃ m trong kÃ¨o nÃ y):**
- Æ¯u tiÃªn 2: nhÃºng libmpv (Ä‘Ãºng hÆ°á»›ng lÃ¢u dÃ i) â€” phase sau
- R4-02 Ä‘áº¿n R4-09 (xem `FIX_STUDIO_UI_ROUND4.md`) â€” fix turn tiáº¿p

**File Ä‘Ã£ Ä‘á»•i:** `src-tauri/src/lib.rs`, `src/lib/tauri.ts`, `src/views/SublixStudioView.tsx`, `package.json`, `src-tauri/Cargo.toml`.

---

## v0.9.10 â€” 2026-10-07
### Lá»“ng Tiáº¿ng: Fix Multi-Speaker â€” DÃ¹ng Gender Tháº­t + Filter Noise Speaker

**Váº¥n Ä‘á» (PO bÃ¡o cÃ¡o):** Video R2nyc_oP9Yk cÃ³ 1 ngÆ°á»i nÃ³i chÃ­nh, nhÆ°ng test_dubbing_srt.rs cÅ© Ã©p 6 voice khÃ¡c nhau theo `idx % 2` (male/female xen káº½) â†’ sai logic, lÃ£ng phÃ­ voice, cÃ³ thá»ƒ gÃ¡n nam vÃ o speaker ná»¯ vÃ  ngÆ°á»£c láº¡i.

**NguyÃªn nhÃ¢n gá»‘c:**
- Code cÅ© dÃ¹ng `idx % 2` Ä‘á»ƒ Ä‘oÃ¡n male/female thay vÃ¬ dÃ¹ng gender tháº­t tá»« LLM
- `DubbingSpeaker` struct KHÃ”NG lÆ°u `gender` field â†’ sau khi táº¡o project khÃ´ng biáº¿t speaker nÃ o nam/ná»¯
- Ã‰p voice cho Má»ŒI speaker, ká»ƒ cáº£ noise speaker (< 3 segments) â†’ lÃ£ng phÃ­ + sai

**Thay Ä‘á»•i v0.9.10:**
- **Backend (`dubbing/mod.rs`):** ThÃªm field `gender: String` vÃ o `DubbingSpeaker` struct (vá»›i `#[serde(default)]` Ä‘á»ƒ backward compat vá»›i project Ä‘Ã£ lÆ°u); lÆ°u gender khi táº¡o speaker á»Ÿ cáº£ `diarize_and_script_via_minimax` (main) láº«n `generate_default_speakers` (fallback).
- **CLI (`test_dubbing_srt.rs`):** Viáº¿t láº¡i logic Ã©p voice theo gender THáº¬T (`spk.gender`) + filter noise:
  - Äáº¿m segments per speaker â†’ tÃ¬m `main_speaker` (largest)
  - Speaker nhiá»…u (`< 3 segments` HOáº¶C `< 3% tá»•ng`) â†’ gá»™p vÃ o main, dÃ¹ng cÃ¹ng voice (Ä‘á»“ng nháº¥t)
  - Speaker non-noise â†’ gÃ¡n voice theo gender Ä‘Ãºng, duyá»‡t pool **7 nam + 7 ná»¯** Kokoro
  - Náº¿u chá»‰ 1 speaker non-noise â†’ chá»‰ assign 1 voice (khÃ´ng Ã©p lung tung)
- **Frontend (`tauri.ts` + `DubbingStudioView.tsx`):** Update `DubbingSpeaker` interface cÃ³ optional `gender?`; `handleAddSpeaker` lÆ°u gender khi user thÃªm vai má»›i.

**Test (sáº½ cháº¡y vÃ²ng tiáº¿p theo):**
- Video multi-speaker (R2nyc_oP9Yk 15:21) â€” verify má»—i speaker giá»¯ 1 voice consistent
- Video 1 narrator (test_ai_21m 21:43) â€” verify chá»‰ assign 1 voice
- Video ngáº¯n má»›i (â‰¤ 5 phÃºt) â€” náº¿u cÃ³ sáºµn trong App downloads

**File Ä‘Ã£ Ä‘á»•i:**
- `src-tauri/src/dubbing/mod.rs` â€” thÃªm `gender` field + lÆ°u khi táº¡o
- `src-tauri/examples/test_dubbing_srt.rs` â€” viáº¿t láº¡i logic Ã©p voice
- `src/lib/tauri.ts` â€” thÃªm `gender?` vÃ o `DubbingSpeaker` interface
- `src/views/DubbingStudioView.tsx` â€” `handleAddSpeaker` lÆ°u gender
- `package.json` + `src-tauri/Cargo.toml` â€” bump version 0.9.9 â†’ 0.9.10

---

# CHANGELOG â€” Sublix

> Lá»‹ch sá»­ phÃ¡t hÃ nh Sublix theo trá»¥c thá»i gian (má»›i nháº¥t á»Ÿ trÃªn).
> Má»—i version Ä‘Æ°á»£c bump theo [SemVer](https://semver.org/):
> - **major** â€” breaking change kiáº¿n trÃºc lá»›n
> - **minor** â€” fix bug quan trá»ng hoáº·c tÃ­nh nÄƒng má»›i Ä‘Ã¡ng ká»ƒ
> - **patch** â€” fix nhá», polish UI, refactor khÃ´ng phÃ¡ API
>
> PhiÃªn báº£n hiá»ƒn thá»‹ trong UI lÃ  `v{major.minor}` (bá» patch).

---

## v0.9.9 â€” 2026-10-07
### Studio Lá»“ng Tiáº¿ng: Chá»n Model â†’ Danh SÃ¡ch Giá»ng Nam/Ná»¯ + Máº«u Nghe Thá»­ Cache + Khá»›p Voice Äa Vai
- **Chá»n model â†’ hiá»‡n danh sÃ¡ch giá»ng (ká»ƒ cáº£ TRÆ¯á»šC khi táº£i):** má»—i model trong panel "ðŸŽ› Chá»n Giá»ng & Táº£i Model" giá» má»Ÿ rá»™ng Ä‘Æ°á»£c (báº¥m â–¸) â€” Kokoro-Vietnamese hiá»‡n Ä‘á»§ **7 giá»ng Nam + 7 giá»ng Ná»¯**, thÃªm card **Edge Neural (cÃ³ sáºµn â€” 8 giá»ng)**; model clone ghi rÃµ sáº½ cáº§n 1 clip giá»ng máº«u 5â€“10 giÃ¢y cho má»—i vai.
- **ðŸŽ§ Máº«u nghe thá»­ táº¡o 1 láº§n â€” nghe láº¡i tá»©c thÃ¬:** nÃºt táº¡o máº«u cho 14 giá»ng Kokoro (má»™t láº§n ~1 phÃºt, hiá»‡n tiáº¿n trÃ¬nh "Äang táº¡o máº«u X/14â€¦"), lÆ°u cache táº¡i `models/voice/kokoro-vi/samples/*.wav`; láº§n sau báº¥m ðŸ”Š tráº£ audio tá»©c thÃ¬ tá»« cache (Ä‘Ã£ xÃ¡c minh phÃ¡t tháº­t 4.92s).
- **Khá»›p voice Ä‘a vai:** pool auto-cast má»Ÿ rá»™ng **7 nam + 7 ná»¯** (cáº£ 2 nhÃ¡nh heuristic + LLM), cÃ¡c vai Ä‘Æ°á»£c gÃ¡n giá»ng **khÃ¡c nhau, xen káº½ Nam/Ná»¯**; bá»™ chá»n giá»ng hiá»‡n nhÃ£n rÃµ "â™‚ Nam â€” Tuáº¥n Ngá»c (Kokoro offline)"; thÃªm nhÃ¢n váº­t má»›i tá»± chá»n giá»ng chÆ°a dÃ¹ng; **cáº£nh bÃ¡o âš ï¸ "TrÃ¹ng giá»ng"** khi 2 vai dÃ¹ng chung giá»ng (E2E: 5 vai â†’ 5 giá»ng khÃ¡c nhau).
- Ká»¹ thuáº­t: Tauri commands `voice_sample_list` / `voice_sample_generate` / `voice_sample_data`; event `voice:sample_progress`; máº«u lÆ°u WAV 24kHz mono.

---

## v0.9.8 â€” 2026-10-06
### Studio Lá»“ng Tiáº¿ng: NÃºt "Má»Ÿ ThÆ° Má»¥c Lá»“ng Tiáº¿ng" & "Má»Ÿ ThÆ° Má»¥c File Gá»‘c"
- **Váº¥n Ä‘á» (anh Tuáº¥n bÃ¡o):** Tab Lá»“ng Tiáº¿ng KHÃ”NG cÃ³ nÃºt Ä‘á»ƒ má»Ÿ folder chá»©a file lá»“ng tiáº¿ng Ä‘Ã£ xuáº¥t â€” user pháº£i tá»± explorer Ä‘áº¿n folder.
- **Fix v0.9.8:** ThÃªm 2 nÃºt á»Ÿ thanh "Export Action Bar":
  - **"ðŸ“‚ Má»Ÿ ThÆ° Má»¥c Lá»“ng Tiáº¿ng"** â€” chá»‰ hiá»‡n sau khi export thÃ nh cÃ´ng â†’ má»Ÿ folder chá»©a file output `*_dubbed.mp4` (cÃ³ select file).
  - **"ðŸ“‚ Má»Ÿ ThÆ° Má»¥c File Gá»‘c"** â€” luÃ´n hiá»ƒn thá»‹ khi Ä‘Ã£ chá»n video input â†’ má»Ÿ folder chá»©a video gá»‘c (user cÃ³ thá»ƒ duyá»‡t cÃ¹ng folder vá»›i file .srt / audio khÃ¡c).
- **Backend má»›i:** Tauri command `dubbing_open_output_folder(path)` dÃ¹ng `SHOpenFolderAndSelectItems` (approach giá»‘ng downloader v0.9.4, fix lá»—i path cÃ³ kÃ½ tá»± Ä‘áº·c biá»‡t) â€” thay tháº¿ `reveal_in_explorer` cÅ© dÃ¹ng `explorer.exe /select,...` (dá»… fail vá»›i path CJK).
- Pháº¡m vi: `src-tauri/src/dubbing/mod.rs` (open_output_folder function), `src-tauri/src/lib.rs` (Tauri command), `src/lib/tauri.ts` (method `dubbingOpenOutputFolder`), `src/views/DubbingStudioView.tsx` (UI).

---

## v0.9.7 â€” 2026-10-06
### Tá»‘i Æ¯u Stage Dá»‹ch Phá»¥ Äá»: DÃ¹ng Batch Translate (Tiáº¿t Kiá»‡m ~30 PhÃºt/Video)
- PhÃ¡t hiá»‡n qua AUDIT-SUB (xem `agent-team/AUDIT_SUB_REPORT.md`): pipeline "Táº¡o phá»¥ Ä‘á»" vá»›i video 21:43 máº¥t **~64 phÃºt** do Stage 3 (Translate MiniMax-M3 API) chiáº¿m **~40 phÃºt** (62% tá»•ng). Code `file_sub.rs:400` loop tá»«ng segment â†’ 416 segments Ã— 5.7s â‰ˆ 40 phÃºt.
- Fix: thay vÃ²ng láº·p sequential báº±ng `translate_batch_with_config()` Ä‘Ã£ cÃ³ sáºµn á»Ÿ `translate/mod.rs:328` (chunk 15 segments/batch qua MiniMax-M3 batch endpoint). Estimate Stage 3 tá»« ~40 phÃºt â†’ **~5-10 phÃºt** cho video 21:43 (tiáº¿t kiá»‡m ~30 phÃºt).
- **Trade-off Ä‘Ã£ bÃ¡o cÃ¡o (No silent trade-offs):**
  - Progress emit váº«n theo tá»«ng segment (em chia nhá» tá»« batch result) â†’ UI UX tÆ°Æ¡ng Ä‘Æ°Æ¡ng loop cÅ©.
  - Hallucination filter + fallback `original_text` váº«n Ã¡p dá»¥ng Ä‘áº§y Ä‘á»§.
  - Cancel check: batch check `is_dubbing_cancelled()` má»—i chunk (an toÃ n hÆ¡n loop cÅ©).
  - Error fallback: batch inner dÃ¹ng `"[Dá»‹ch lá»—i: ...]"`, em wrap ngoÃ i báº±ng `original_text.clone()` cho UX thÃ¢n thiá»‡n giá»‘ng cÅ©.
- ChÆ°a fix F1 (HF URL 401) + F2 (model corrupt check) + F3 (CUDA build) + F4 (progress trong whisper stage) â†’ xem AUDIT_SUB_REPORT Ä‘á»ƒ biáº¿t khuyáº¿n nghá»‹ R1, R2, R4, R5.

---

## v0.9.6 â€” 2026-10-06
### Hiá»ƒn Thá»‹ RÃµ ÄÆ°á»ng Dáº«n, Dung LÆ°á»£ng, Cháº¥t LÆ°á»£ng & Tiáº¿n TrÃ¬nh Táº£i
- **Video Ä‘Ã£ táº£i xong** giá» hiá»‡n Ä‘á»§ trong danh sÃ¡ch: **ðŸŽž cháº¥t lÆ°á»£ng** (vd *1920Ã—1080 (Full HD)*), **ðŸ’¾ dung lÆ°á»£ng tháº­t** cá»§a file (Ä‘o trá»±c tiáº¿p tá»« á»• Ä‘Ä©a, vd *309.7 MB*) vÃ  **ðŸ“ Ä‘Æ°á»ng dáº«n Ä‘áº§y Ä‘á»§** cá»§a file.
- **Khi Ä‘ang táº£i**: thanh tiáº¿n trÃ¬nh hiá»‡n thÃªm **"Ä‘Ã£ táº£i / tá»•ng"** (vd *ðŸ“¥ 202.0 MB / 450.0 MB*) bÃªn cáº¡nh % + tá»‘c Ä‘á»™ + thá»i gian cÃ²n láº¡i â€” nhÃ¬n lÃ  biáº¿t Ä‘ang táº£i Ä‘áº¿n Ä‘Ã¢u.
- **Backfill**: cÃ¡c má»¥c Ä‘Ã£ táº£i TRÆ¯á»šC báº£n nÃ y sáº½ tá»± Ä‘Æ°á»£c Ä‘o láº¡i dung lÆ°á»£ng + Ä‘á»™ phÃ¢n giáº£i khi má»Ÿ app (khÃ´ng cáº§n táº£i láº¡i).
- **ðŸ”— Link video gá»‘c + nÃºt Copy**: má»—i má»¥c giá» hiá»‡n **link nguá»“n** kÃ¨m nÃºt **ðŸ“‹ Copy link** â€” khi video die hoáº·c táº£i lá»—i, chá»‰ cáº§n copy link dÃ¡n láº¡i lÃ  táº£i láº¡i Ä‘Æ°á»£c.
- Ká»¹ thuáº­t: sá»± kiá»‡n `downloader:meta` (size + resolution) khi hoÃ n táº¥t, command `downloader_file_meta` cho danh sÃ¡ch cÅ©; Ä‘á»™ phÃ¢n giáº£i probe báº±ng ffprobe.

---

## v0.9.5 â€” 2026-10-06
### Sá»­a Cháº¥t LÆ°á»£ng Táº£i: Háº¿t Bá»‹ Káº¹t 360p (MAX giá» lÃªn tá»›i 4K)
- **Hiá»‡n tÆ°á»£ng**: chá»n "MAX â€” cháº¥t lÆ°á»£ng cao nháº¥t" nhÆ°ng video táº£i vá» chá»‰ 640x360.
- **Root cause**: cáº¥u hÃ¬nh cÅ© Ã©p `youtube:player_client=android,web_safari,ios` â€” YouTube Ä‘Ã£ bÃ³p client android vá» SABR-only/360p, má»i format DASH (1080p/1440p/4K) biáº¿n máº¥t khá»i danh sÃ¡ch â‡’ yt-dlp rÆ¡i vá» progressive 360p cho má»i video.
- **Fix**: bá» Ã©p client cÅ© â€” Ä‘á»ƒ yt-dlp tá»± chá»n client máº·c Ä‘á»‹nh (váº«n kÃ¨m JS runtime + EJS solver). Verify: danh sÃ¡ch format cÃ³ Ä‘á»§ 4K/1440p/1080p/720p; táº£i tháº­t 720p ra **1280x720** (trÆ°á»›c Ä‘Ã³ 640x360).
- **LÆ°u Ã½ cho ngÆ°á»i dÃ¹ng**: file CÅ¨ Ä‘Ã£ táº£i á»Ÿ 360p khÃ´ng tá»± nÃ¢ng cáº¥p â€” muá»‘n báº£n nÃ©t thÃ¬ xÃ³a file cÅ© trong thÆ° má»¥c downloads rá»“i táº£i láº¡i.

---

## v0.9.4 â€” 2026-10-06
### ThÃªm NÃºt "Cháº¡y Video" & Hiá»ƒn Thá»‹ RÃµ ThÆ° Má»¥c Táº£i
- **â–¶ Cháº¡y Video**: má»—i video Ä‘Ã£ táº£i xong giá» cÃ³ nÃºt phÃ¡t ngay báº±ng trÃ¬nh phÃ¡t máº·c Ä‘á»‹nh cá»§a Windows (dÃ¹ng ShellExecuteW â€” xá»­ lÃ½ Ä‘Ãºng cáº£ tÃªn file cÃ³ kÃ½ tá»± Ä‘áº·c biá»‡t).
- **Hiá»ƒn thá»‹ thÆ° má»¥c táº£i**: mÃ n hÃ¬nh Táº£i Video hiá»‡n rÃµ dÃ²ng *"ðŸ“ File táº£i vá» Ä‘Æ°á»£c lÆ°u táº¡i: C:\...\downloads"* â€” khÃ´ng cÃ²n pháº£i Ä‘oÃ¡n file náº±m á»Ÿ Ä‘Ã¢u. NÃºt "Má»Ÿ ThÆ° Má»¥c" váº«n má»Ÿ Explorer chá»n sáºµn file.
- **Máº·c Ä‘á»‹nh Táº®T "TrÃ­ch xuáº¥t phá»¥ Ä‘á»"**: theo nhu cáº§u thá»±c táº¿ (Æ°u tiÃªn video), checkbox phá»¥ Ä‘á» máº·c Ä‘á»‹nh táº¯t â€” táº£i nhanh hÆ¡n vÃ  trÃ¡nh rate-limit 429 khi khÃ´ng cáº§n sub.

---

## v0.9.3 â€” 2026-10-06
### Sá»­a Lá»—i Hiá»ƒn Thá»‹ Oan "KhÃ´ng In Ra ÄÆ°á»ng Dáº«n File"
- **Hiá»‡n tÆ°á»£ng**: Video táº£i xong tháº­t (file náº±m trÃªn á»• cá»©ng) nhÆ°ng app bÃ¡o âŒ Lá»—i *"yt-dlp Ä‘Ã£ thoÃ¡t thÃ nh cÃ´ng nhÆ°ng khÃ´ng in ra Ä‘Æ°á»ng dáº«n file"* â€” anh Tuáº¥n gáº·p vá»›i video "Arthas: Betrayer of the Light | Warcraft Cinematic" (45MB Ä‘Ã£ táº£i xong nhÆ°ng UI bÃ¡o lá»—i).
- **Root cause**: khi output cá»§a yt-dlp khÃ´ng pháº£i UTF-8, **chuá»—i Ä‘Æ°á»ng dáº«n in ra stdout bá»‹ máº¥t/thay tháº¿ cÃ¡c kÃ½ tá»± mÃ  codepage khÃ´ng biá»ƒu diá»…n Ä‘Æ°á»£c** (fullwidth `ï¼šï½œ`, chá»¯ CJK...) â€” trong khi file tháº­t trÃªn á»• Ä‘Ä©a váº«n cÃ³ Ä‘á»§ kÃ½ tá»± â†’ app so chuá»—i in ra vá»›i á»• Ä‘Ä©a â†’ khÃ´ng tháº¥y file â†’ bÃ¡o lá»—i oan dÃ¹ yt-dlp exit 0 (hiá»‡n tÆ°á»£ng khÃ´ng á»•n Ä‘á»‹nh, phá»¥ thuá»™c mÃ´i trÆ°á»ng console cá»§a mÃ¡y).
- **Fix**: (1) Ã‰p UTF-8 output cho má»i tiáº¿n trÃ¬nh yt-dlp (`PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1`); (2) **KhÃ´ng tin chuá»—i in ra ná»¯a** â€” khi yt-dlp exit 0 mÃ  chÆ°a xÃ¡c minh Ä‘Æ°á»£c file, app quÃ©t thÆ° má»¥c táº£i tÃ¬m file media Ä‘Ãºng **mÃ£ video** (`[<id>]`) lÃ m báº±ng chá»©ng gá»‘c (an toÃ n theo luáº­t BUG-046: khÃ´ng bao giá» láº¥y file cá»§a video khÃ¡c); (3) UI: "Thá»­ láº¡i" thÃ nh cÃ´ng sáº½ xoÃ¡ cáº£nh bÃ¡o lá»—i cÅ©.

---

## v0.9.2 â€” 2026-10-06
### Sá»­a Lá»—i Nhá»: Kiá»ƒm Tra Link + Táº£i Phá»¥ Äá»
- **Kiá»ƒm Tra Link (fetch_video_info)**: Root cause tÃ¬m Ä‘Æ°á»£c: tá»« báº£n vÃ¡ R2-08.3, hÃ m chuyá»ƒn sang `spawn()` + `wait_with_output()` Ä‘á»ƒ cÃ³ PID kill orphan nhÆ°ng quÃªn pipe stdout/stderr â€” output luÃ´n rá»—ng, nÃªn khi yt-dlp exit 0 (kiá»ƒm tra thÃ nh cÃ´ng) app throw lá»—i serde thÃ´ `EOF while parsing a value at line 1 column 0`; khi exit 1 thÃ¬ máº¥t luÃ´n thÃ´ng bÃ¡o stderr. ÄÃ£ sá»­a: thÃªm `Stdio::piped()`, tá»± dÃ² JSON object (`{` Ä‘áº§u â†’ `}` cuá»‘i, cháº¥p nháº­n banner nhiá»…u), fallback thÃ´ng bÃ¡o thÃ¢n thiá»‡n "Video khÃ´ng kháº£ dá»¥ng / bá»‹ xÃ³a / bá»‹ cháº·n khu vá»±c".
- **Táº£i Phá»¥ Äá» (HTTP 429)**: TrÆ°á»›c Ä‘Ã¢y Sublix gá»­i 8 request HTTP liÃªn tiáº¿p Ä‘áº¿n YouTube Ä‘á»ƒ láº¥y 4 ngÃ´n ngá»¯ phá»¥ Ä‘á» (Ã—2 loáº¡i subs), gÃ¢y HTTP 429 "Too Many Requests". Giá» thÃªm `--sleep-subtitles 5` Ä‘á»ƒ yt-dlp tá»± delay 5s giá»¯a má»—i request sub (verify CLI: má»©c 2s váº«n dÃ­nh 429 khi cháº¡y dá»“n, má»©c 5s qua sáº¡ch á»Ÿ lÆ°á»£t cháº¡y káº¿ tiáº¿p). Náº¿u YouTube váº«n giá»›i háº¡n khi cháº¡y dá»“n (rate-limit phÃ­a server, sleep khÃ´ng xÃ³a 100%): job **khÃ´ng cÃ²n bÃ¡o âŒ Lá»—i oan** â€” video Ä‘Ã£ táº£i xong váº«n giá»¯ âœ… HoÃ n thÃ nh, kÃ¨m cáº£nh bÃ¡o âš ï¸ "phá»¥ Ä‘á» chÆ°a táº£i Ä‘Æ°á»£c (429), thá»­ láº¡i sau vÃ i phÃºt" ngay trÃªn UI (lá»—i Ä‘Æ°á»£c hiá»‡n rÃµ, khÃ´ng im láº·ng).
- **Window title**: Ä‘á»“ng bá»™ title bar 2 cá»­a sá»• (main + overlay) vá» `v0.9.2` â€” khá»›p sidebar/Changelog (báº£n v0.9.1 trÆ°á»›c Ä‘Ã³ cÃ²n Ä‘á»ƒ sÃ³t `v0.9.0`).

---

## v0.9.1 â€” 2026-10-06
### Sá»­a Lá»—i Window Title Version Mismatch
- Window title (title bar + taskbar) cá»§a 2 window (`main` + `overlay`) bá»‹ hardcode `v0.8.0` trong `src-tauri/tauri.conf.json` dÃ¹ sidebar/Changelog Ä‘Ã£ hiá»ƒn thá»‹ `v0.9.0`.
- Sá»­a: cáº£ 2 title giá» match vá»›i version tháº­t.

---

## v0.9.0 â€” 2026-10-06
### Sá»­a Lá»—i Quan Trá»ng: YouTube Download Hoáº¡t Äá»™ng Trá»Ÿ Láº¡i
- PhÃ¡t hiá»‡n root cause: **yt-dlp 2024.10+ yÃªu cáº§u JS runtime (Node.js/Deno) + remote challenge solver** Ä‘á»ƒ bypass YouTube anti-bot. Sublix chÆ°a pass 2 flag nÃ y nÃªn **má»i URL YouTube fail im láº·ng** (return `"n challenge solving failed"` â†’ 0 bytes).
- Helper má»›i `find_js_runtime()` trong `src-tauri/src/downloader/mod.rs` tá»± Ä‘á»™ng phÃ¡t hiá»‡n `node` hoáº·c `deno` trÃªn PATH (qua `where node.exe` trÃªn Windows, `which node` trÃªn Unix).
- Auto pass `--js-runtimes <runtime>:<path>` + `--remote-components ejs:github` khi táº£i video YouTube â€” script solver Ä‘Æ°á»£c táº£i tá»« GitHub á»Ÿ láº§n Ä‘áº§u, cache láº¡i cho láº§n sau.
- Ãp dá»¥ng cho cáº£ `start_download` (kÃ¨m nhÃ¡nh retry cookie fallback) vÃ  `fetch_video_info` (inspect metadata) â€” nÃªn "Kiá»ƒm Tra Link" cÅ©ng work trÃªn YouTube.
- **Verified thá»§ cÃ´ng báº±ng CLI**: 11.28 MB Rick Astley táº£i vá» trong ~1 giÃ¢y.

### Competitive Analysis vá»›i 4 Repo Voice/Dubbing
- NghiÃªn cá»©u sÃ¢u 4 Ä‘á»‘i thá»§ trÃªn GitHub: **VoiceStudio** (53kâ­, Python+Electron, AGPL), **dub-studio** (Tauri giá»‘ng Sublix, native C++ engines), **YouDub-webui** (FastAPI+Next.js, production vá»›i tÃ¡c giáº£ 1M+ subs), **ZastTranslate** (Python Gradio, 33 ngÃ´n ngá»¯ + Viral Shorts).
- PhÃ¡t hiá»‡n Sublix cÃ³ 3 Ä‘iá»ƒm **UNIQUE**:
  1. **Äa engine song song** (Qwen 3 GPU local + MiniMax-M3 Cloud) â€” chÆ°a ai lÃ m
  2. **1-click pipeline bridges** (Downloader â†’ File Sub â†’ Dubbing Studio) â€” chÆ°a ai lÃ m
  3. **Downloader Ä‘a ná»n táº£ng** (9 site: YT/TT/Douyin/Bili/FB/X/IG/Vimeo/Reddit) â€” chá»‰ Sublix cÃ³
- Gá»£i Ã½ **Roadmap P0**: Voice DESIGN (text â†’ voice), MCP server cho AI agents, multi-TTS engine swap.
- TÃ i liá»‡u Ä‘áº§y Ä‘á»§ táº¡i `agent-team/COMPETITIVE_ANALYSIS.md` (15KB, 9 pháº§n).

### File thay Ä‘á»•i
- `src-tauri/src/downloader/mod.rs` â€” +116 dÃ²ng (helper `find_js_runtime` + 2 call sites)
- `src/views/ChangelogModal.tsx` â€” thÃªm entry v0.9.0
- `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` â€” bump 0.8.0 â†’ 0.9.0
- `agent-team/COMPETITIVE_ANALYSIS.md` â€” file má»›i

### Verify
- `cargo check` âœ… 0 warnings (4.11s)
- `npm run build` âœ… 364 KB JS / 80 KB CSS (1.17s)
- `cargo test --lib find_ytdlp_binary` âœ… PASS
- yt-dlp CLI test tháº­t vá»›i flags má»›i âœ… **PASS (Rick Astley 11.28 MB)**

### Cáº§n cho láº§n tá»›i
- **Náº¿u mÃ¡y khÃ´ng cÃ³ Node.js**: cÃ i https://nodejs.org (Node 18+) hoáº·c `irm https://deno.land/install.ps1 | iex` (cho Deno). KhÃ´ng cÃ³ runtime â†’ yt-dlp váº«n in warning vÃ  thá»­ cÃ¡c site khÃ´ng cáº§n bypass.

---

## v0.8.0 â€” 2026-10-04
### Nháº­n Diá»‡n Thá»‹ GiÃ¡c AI & Bá»™ Minh Hoáº¡ Äiá»‡n áº¢nh
- Logo má»›i: chá»¯ S káº¿t tá»« dáº£i phim Ä‘iá»‡n áº£nh, kÃ¨m bá»™ icon á»©ng dá»¥ng trá»n bá»™ cho taskbar & cá»­a sá»•.
- áº¢nh hero ráº¡p chiáº¿u phim áº¥m Ã¡p cho mÃ n cÃ i Ä‘áº·t Ä‘áº§u tiÃªn (Onboarding).
- Bá»™ minh hoáº¡ pháº³ng phong cÃ¡ch Ä‘iá»‡n áº£nh: khung chá»n file, Trung tÃ¢m Models, lá»‹ch sá»­ trá»‘ng.
- VÃ¢n phim má» tinh táº¿ phá»§ trÃªn sidebar á»Ÿ theme Cinema & Studio.
- Tá»‘i Æ°u dung lÆ°á»£ng áº£nh tá»« 4.4 MB xuá»‘ng cÃ²n 184 KB, app nháº¹ vÃ  khá»Ÿi Ä‘á»™ng nhanh hÆ¡n.
- Há»— trá»£ KÃ©o & Tháº£ (Drag & Drop) tá»‡p Video / Audio trá»±c tiáº¿p tá»« mÃ¡y tÃ­nh vÃ o á»©ng dá»¥ng qua Tauri Native Webview API.
- Thay tháº¿ toÃ n bá»™ há»™p chá»n native Windows cÅ© báº±ng Custom Glass Select sang trá»ng.

---

## v0.7.0 â€” 2026-10-04
### Äáº¡i Tu Giao Diá»‡n Cinema Studio & AI Dubbing Äa Vai
- Bá»• sung 4 phong cÃ¡ch giao diá»‡n: Cinema, Studio, Light, Vibrant.
- Bá»™ chá»n Theme nhanh vá»›i nÃºt chuyá»ƒn Ä‘á»•i tá»©c thÃ¬, tá»± Ä‘á»™ng ghi nhá»› cáº¥u hÃ¬nh khi khá»Ÿi Ä‘á»™ng láº¡i.
- Chuáº©n hÃ³a toÃ n bá»™ mÃ u sáº¯c sang Design Tokens (CSS Variables), thanh cuá»™n siÃªu má»ng tinh táº¿.
- TÃ¡ch giá»ng gá»‘c sáº¡ch 100% báº±ng Demucs v4 CUDA GPU.
- Tá»± Ä‘á»™ng nháº­n diá»‡n phÃ¢n vai diá»…n viÃªn qua ká»‹ch báº£n ngá»¯ cáº£nh MiniMax M3.
- Bá»™ giá»ng Ä‘á»c Neural siÃªu tá»± nhiÃªn (Edge-TTS) + tá»± Ä‘á»™ng co giÃ£n tá»‘c Ä‘á»™ (FFmpeg atempo).

---

## v0.6.0 â€” 2026-10-04
### NÃ¢ng Cáº¥p CUDA RTX 3090 & Local LLM Translation
- TÃ­ch há»£p Whisper Large-v3-Turbo Q8 (874MB) cháº¡y trá»±c tiáº¿p trÃªn GPU CUDA.
- Há»— trá»£ Local Qwen 3 4B model cho dá»‹ch thuáº­t offline, tá»‘c Ä‘á»™ ~0.1s/cÃ¢u.

---

## v0.5.0 â€” 2026-10-03
### WASAPI Loopback Zero-Gap & Smart VAD
- ...

(Sá»­a lá»—i Critical YouTube download, Competitive Analysis, bump version)

---

## Quy Æ°á»›c phÃ¡t hÃ nh
- Má»—i commit sá»­a code (fix bug, feature, UI polish) **PHáº¢I**:
    1. Bump version `major.minor.patch` trong `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
    2. ThÃªm entry vÃ o `CHANGELOG_DATA` trong `src/views/ChangelogModal.tsx`
    3. ThÃªm entry tÆ°Æ¡ng á»©ng vÃ o `CHANGELOG.md` (file nÃ y)
- **minor** cho fix/feature Ä‘Ã¡ng ká»ƒ, **patch** cho nhá».
- Commit thay Ä‘á»•i version + CHANGELOG trong commit riÃªng (tÃ¡ch khá»i commit code).