//! TSK-V014-KINETIC-TS — chia thời gian từng từ cho phụ đề **nhảy chữ** (v0.14, mục 2C).
//!
//! Câu gốc (Whisper) có word timestamp; câu **dịch tiếng Việt thì không** ⇒ chia thời lượng
//! của câu theo số "từ" (âm tiết) để vẽ hiệu ứng nhảy chữ trong khung xem thử và khi xuất
//! ASS (`\k` karaoke / đổi màu / phóng nhẹ).
//!
//! Module THUẦN (không React/DOM/Tauri) ⇒ test được bằng `node --test`; thuật toán phải
//! khớp **từng số** với `scripts/kinetic-tests/vectors.json` (bản Rust dùng cùng vectors).
//!
//! ## Thuật toán v1
//! 1. `tokenize`: trim; rỗng ⇒ `[]`; có khoảng trắng ⇒ tách theo `\s+`; không có khoảng
//!    trắng mà có chữ CJK ⇒ **từng ký tự**, dấu câu dính vào token trước; còn lại ⇒ cả chuỗi.
//! 2. Trọng số mỗi token = `1`, **+0.6** nếu token kết thúc bằng dấu ngắt câu
//!    (`,` `.` `!` `?` `;` `:` `…` `，` `。` `！` `？` `；` `：` `、`).
//! 3. `totalCs = round((end - start) * 100)` (tối thiểu 0); `durCs = floor(totalCs * w / W)`;
//!    **phần dư cộng vào token CUỐI**; `offsetCs` cộng dồn.
//!
//! Đơn vị thời gian là **centi-giây** (cs) — cùng đơn vị libass/ASS `\k` dùng, tránh sai số
//! cộng dồn khi cộng giây thực.

/** Một từ (âm tiết) đã chia thời gian. */
export interface WordTiming {
  /** Chữ hiển thị (đã dính dấu câu nếu có). */
  word: string;
  /** Thời điểm bắt đầu, tính bằng centi-giây **so với đầu câu**. */
  offsetCs: number;
  /** Thời lượng, tính bằng centi-giây (≥ 0). */
  durCs: number;
}

/** Dấu ngắt câu ⇒ token được +0.6 trọng số (dừng lâu hơn khi nói). */
const BREAK_PUNCTUATION = ",.!?;:…，。！？；：、";

/** Dấu câu (kể cả ngoặc/nháy) **dính vào token trước** khi tách chữ CJK. */
const STICKY_PUNCTUATION = `${BREAK_PUNCTUATION}"'“”‘’()（）《》`;

/** Trọng số cơ bản của 1 token. */
const BASE_WEIGHT = 1;

/** Cộng thêm khi token kết thúc bằng dấu ngắt câu. */
const BREAK_WEIGHT = 0.6;

/** Sai số cho phép khi so mốc thời gian (cs) — bù sai số dấu phẩy động. */
const EPS_CS = 1e-6;

/** Ký tự có phải chữ Hán/Nhật (CJK) không? */
function isCjkChar(ch: string): boolean {
  const code = ch.codePointAt(0);
  if (code === undefined) return false;
  return (
    (code >= 0x3400 && code <= 0x9fff) || // CJK Ext-A .. CJK Unified
    (code >= 0xf900 && code <= 0xfaff) // CJK Compatibility Ideographs
  );
}

/** Ký tự có phải dấu câu dính vào token trước không? */
function isStickyPunctuation(ch: string): boolean {
  return STICKY_PUNCTUATION.includes(ch);
}

/**
 * Tách chuỗi không có khoảng trắng thành token CJK: mỗi chữ Hán/Nhật là 1 token, dấu câu
 * (và ký tự Latin/số đi kèm) dính vào token đang có — "你好，世界！" →
 * `["你", "好，", "世", "界！"]`, "第1集" → `["第1", "集"]`. Dấu câu đứng **trước** chữ CJK
 * đầu tiên gắn vào chữ đó (không tạo token chỉ có dấu câu, để hiệu ứng không nháy trên dấu
 * câu trơ).
 */
function tokenizeCjk(text: string): string[] {
  const tokens: string[] = [];
  /** Dấu câu đứng trước chữ CJK đầu tiên (chờ gắn vào chữ đó). */
  let prefix = "";

  for (const ch of text) {
    if (isCjkChar(ch)) {
      tokens.push(prefix + ch);
      prefix = "";
      continue;
    }

    const last = tokens.length - 1;
    if (last >= 0) {
      // Dấu câu + ký tự Latin/số/emoji đều dính vào token trước.
      tokens[last] += ch;
    } else if (isStickyPunctuation(ch)) {
      prefix += ch;
    } else {
      tokens.push(ch);
    }
  }

  // Chỉ xảy ra khi chuỗi toàn dấu câu (không có chữ CJK nào để gắn vào).
  if (prefix) tokens.push(prefix);
  return tokens;
}

/**
 * Tách câu thành các "từ" để chia thời gian (thuật toán v1, xem đầu file).
 *
 * @example
 * tokenizeWords("Xin chào")      // ["Xin", "chào"]
 * tokenizeWords("你好，世界！")   // ["你", "好，", "世", "界！"]
 */
export function tokenizeWords(text: string): string[] {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return [];
  // Có khoảng trắng ⇒ tách theo khoảng trắng (ưu tiên hơn luật CJK).
  if (/\s/.test(trimmed)) return trimmed.split(/\s+/);
  // Không có khoảng trắng: chỉ tách từng ký tự khi có chữ CJK.
  if (Array.from(trimmed).some(isCjkChar)) return tokenizeCjk(trimmed);
  return [trimmed];
}

/** Trọng số của 1 token: 1, +0.6 nếu kết thúc bằng dấu ngắt câu. */
export function wordWeight(word: string): number {
  const lastChar = word.slice(-1);
  return lastChar && BREAK_PUNCTUATION.includes(lastChar)
    ? BASE_WEIGHT + BREAK_WEIGHT
    : BASE_WEIGHT;
}

/**
 * Chia thời lượng `[start, end]` (giây) cho các từ của `text`.
 *
 * @param text  Câu phụ đề (đã dịch, thường là tiếng Việt).
 * @param start Thời điểm bắt đầu câu (giây).
 * @param end   Thời điểm kết thúc câu (giây).
 * @returns Danh sách từ kèm `offsetCs` / `durCs` (centi-giây, so với đầu câu).
 *          Text rỗng ⇒ `[]`. Câu có thời lượng ≤ 0 ⇒ mọi `durCs = 0`.
 *
 * @example
 * wordTimings("Xin chào các bạn", 0, 2);
 * // [ { word: "Xin", offsetCs: 0, durCs: 50 }, ... ]
 */
export function wordTimings(text: string, start: number, end: number): WordTiming[] {
  const words = tokenizeWords(text);
  if (words.length === 0) return [];

  // Tổng thời lượng câu (cs). Câu hỏng thời gian / ngược ⇒ 0 để không sinh số âm.
  const spanCs = (end - start) * 100;
  const totalCs = Number.isFinite(spanCs) ? Math.max(0, Math.round(spanCs)) : 0;

  const weights = words.map(wordWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  const timings: WordTiming[] = [];
  let offsetCs = 0;
  for (let i = 0; i < words.length; i += 1) {
    const isLast = i === words.length - 1;
    // Token cuối nhận toàn bộ phần dư ⇒ tổng durCs luôn đúng bằng totalCs.
    const durCs = isLast ? totalCs - offsetCs : Math.floor((totalCs * weights[i]) / totalWeight);
    timings.push({ word: words[i], offsetCs, durCs });
    offsetCs += durCs;
  }
  return timings;
}

/**
 * Từ đang được nói tại thời điểm `tSec` (giây, **tuyệt đối trên timeline**) — dùng cho
 * khung xem thử nhảy chữ.
 *
 * Quy ước:
 * - Trước câu (`tSec < segStartSec`) hoặc sau câu (`tSec >= segStartSec + tổng cs`) ⇒ `-1`.
 * - Đúng mốc bắt đầu của một từ ⇒ **từ đó** (ranh giới thuộc về từ mới, đúng cảm giác "vừa
 *   đổi chữ"), có bù sai số dấu phẩy động.
 * - Danh sách rỗng / `tSec` không hợp lệ ⇒ `-1`.
 *
 * @param timings     Kết quả `wordTimings(...)` của câu.
 * @param segStartSec Thời điểm bắt đầu câu trên timeline (giây).
 * @param tSec        Thời điểm hiện tại của video (giây).
 */
export function activeWordIndex(
  timings: readonly WordTiming[],
  segStartSec: number,
  tSec: number,
): number {
  if (timings.length === 0) return -1;
  const relCs = (tSec - segStartSec) * 100;
  if (!Number.isFinite(relCs)) return -1;

  const last = timings[timings.length - 1];
  const totalCs = last.offsetCs + last.durCs;

  // Ngoài câu (trước đầu câu / từ cuối câu trở đi — câu đã hết thì không còn từ nào).
  if (relCs < -EPS_CS) return -1;
  if (relCs >= totalCs - EPS_CS) return -1;

  // Từ cuối cùng đã bắt đầu ⇒ ranh giới rơi vào từ MỚI.
  for (let i = timings.length - 1; i >= 0; i -= 1) {
    if (timings[i].offsetCs <= relCs + EPS_CS) return i;
  }
  return -1;
}
