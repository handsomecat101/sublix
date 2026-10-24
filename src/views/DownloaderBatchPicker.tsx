//! TSK-FEAT-DL-BATCH-AUDIO: danh sách mục chờ xác nhận (playlist / nhiều link)
//! có checkbox — mặc định chọn hết, nút "Chọn hết / Bỏ chọn" gộp làm 1.

import type { PlaylistEntry } from "../lib/tauri";

export interface BatchState {
  entries: PlaylistEntry[];
  /** URL các mục bị bỏ chọn (mặc định rỗng = chọn hết). */
  unchecked: Set<string>;
  /** Ghi chú: playlist bị cắt, playlist đọc lỗi, link trùng/không hợp lệ... */
  notes: string[];
}

interface DownloaderBatchPickerProps {
  batch: BatchState;
  onChange: (next: BatchState) => void;
  formatDuration: (sec?: number | null) => string;
}

export function DownloaderBatchPicker({ batch, onChange, formatDuration }: DownloaderBatchPickerProps) {
  const total = batch.entries.length;
  const checkedCount = total - batch.unchecked.size;
  const allChecked = batch.unchecked.size === 0;

  const toggle = (url: string) => {
    const unchecked = new Set(batch.unchecked);
    if (unchecked.has(url)) unchecked.delete(url);
    else unchecked.add(url);
    onChange({ ...batch, unchecked });
  };

  const toggleAll = () => {
    onChange({
      ...batch,
      unchecked: allChecked ? new Set(batch.entries.map((e) => e.url)) : new Set(),
    });
  };

  return (
    <div className="dl-batch-picker">
      <div className="dl-batch-head">
        <span className="dl-batch-count">
          📃 Đã chọn <strong>{checkedCount}</strong>/{total} mục
        </span>
        {total > 0 && (
          <button type="button" className="dl-batch-toggle" onClick={toggleAll}>
            {allChecked ? "Bỏ chọn" : "Chọn hết"}
          </button>
        )}
      </div>

      {batch.notes.map((note, i) => (
        <div key={i} className="downloader-sub-note dl-batch-note">
          {note}
        </div>
      ))}

      {total > 0 && (
        <ol className="dl-batch-list">
          {batch.entries.map((entry, i) => {
            const checked = !batch.unchecked.has(entry.url);
            return (
              <li key={entry.url} className={`dl-batch-row ${checked ? "" : "is-off"}`}>
                <label title={entry.url}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(entry.url)} />
                  <span className="dl-batch-idx">{i + 1}.</span>
                  <span className="dl-batch-title">{entry.title || entry.url}</span>
                  {entry.duration ? (
                    <span className="dl-batch-dur">{formatDuration(entry.duration)}</span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
