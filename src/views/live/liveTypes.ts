//! TSK-UI-REDESIGN-R2-7B — kiểu dữ liệu dùng chung cho tab Live + Lịch sử.
//!
//! Nguồn sự thật của các kiểu này trước đây nằm rải rác trong
//! `src/views/SettingsView.tsx` (nội bộ, không export). Tách ra để `LiveView`
//! và `HistoryView` dùng chung mà **không phải sửa `SettingsView.tsx`** ở giai
//! đoạn 1 (CommandCode đang sửa file đó).

/** Một câu thoại trong luồng Live / lịch sử. */
export interface LiveSubPreview {
  /** Mã tăng dần theo thứ tự phát ra. */
  id: number;
  /** Nội dung hiển thị (bản dịch nếu có, nếu không thì bản gốc). */
  text: string;
  /** Bản gốc trước khi dịch (bỏ trống nếu không dịch). */
  original?: string;
  /** Mốc thời gian thật (ms) của câu — dùng để xuất SRT (không bịa). */
  timestamp?: number;
  /** Thời lượng đoạn âm thanh (giây). */
  audio_duration?: number;
  /** Thời gian nhận dạng (giây). */
  stt_duration?: number;
  /** Thời gian dịch (giây). */
  translate_duration?: number;
}

/** Trạng thái thông báo dùng chung với `SettingsView` (hiển thị trên topbar). */
export type LiveStatus =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

/** Kết quả quét mức âm thanh của 1 thiết bị. */
export interface DeviceLevel {
  index: number;
  name: string;
  peak_volume: number;
  has_audio: boolean;
  error: string | null;
}

/** Kết quả thử bắt âm thanh 3 giây. */
export interface AudioTestResult {
  device_name: string;
  file_size_bytes: number;
  peak_volume: number;
  rms_volume: number;
  duration_secs: number;
  has_audio: boolean;
}
