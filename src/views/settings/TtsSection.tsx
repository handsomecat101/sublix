//! TSK-UI-REDESIGN-R2-5: mục "Giọng đọc (TTS)" — trạng thái THẬT từ backend
//! (`tts_engines_status`), tải deps, chẩn đoán CUDA, và key cloud Google/FPT
//! (chỉ hiện 4 ký tự cuối).

import type { SettingsCtx } from "./types";

const ENGINE_META: Record<string, { name: string; desc: string }> = {
  kokoro: { name: "Kokoro 82M", desc: "Offline · 14 giọng · ONNX" },
  vieneu: { name: "VieNeu v3 Turbo", desc: "Offline · 25 giọng · clone được" },
  zerotts: { name: "ZeroTTS", desc: "Offline · 8 giọng" },
  gcloud: { name: "Google Chirp 3 HD", desc: "Cloud · 30 giọng · cần API key" },
  fptai: { name: "FPT.AI", desc: "Cloud · 7 giọng · cần API key" },
};

export function TtsSection({ ctx }: { ctx: SettingsCtx }) {
  const status = ctx.ttsStatus;

  return (
    <section className="settings-section st-card">
      <div className="st-sec-head">
        <h2>🗣 Giọng đọc (TTS)</h2>
        <span className="st-hint">
          Trạng thái đọc từ backend{status ? ` · ưu tiên thiết bị: ${status.device_preference.toUpperCase()}` : ""}.
        </span>
        <button type="button" className="settings-btn-secondary st-btn-sm" disabled={ctx.ttsLoading} onClick={ctx.reloadTts}>
          {ctx.ttsLoading ? "⏳ Đang đọc…" : "↻ Làm mới"}
        </button>
      </div>

      {!status ? (
        <div className="st-empty">{ctx.ttsLoading ? "⏳ Đang đọc trạng thái engine…" : "Chưa đọc được trạng thái engine TTS."}</div>
      ) : (
        <div className="st-engines">
          {status.engines.map((e) => {
            const meta = ENGINE_META[e.id] ?? { name: e.id, desc: "" };
            const canDeps = e.id === "vieneu" || e.id === "zerotts";
            const canCloudKey = e.id === "gcloud" || e.id === "fptai";
            return (
              <div key={e.id} className={`st-engine${e.ready ? " ok" : ""}`}>
                <div className="st-engine-head">
                  <b>{meta.name}</b>
                  <span className="st-mono st-prefix">{e.prefix}</span>
                  <span className={`st-pill${e.ready ? " ok" : " warn"}`}>{e.ready ? "Sẵn sàng" : "Chưa sẵn sàng"}</span>
                </div>
                <div className="st-hint">
                  {meta.desc}
                  {e.kind === "cloud" ? " · cloud" : " · offline"}
                  {e.clone ? " · clone giọng" : ""}
                  {e.has_key ? " · đã có key" : ""}
                </div>
                {!e.ready && e.hint ? <div className="st-engine-hint">⚠️ {e.hint}</div> : null}

                <div className="st-row">
                  {canDeps && (
                    <button
                      type="button"
                      className="settings-btn-secondary st-btn-sm"
                      onClick={() => ctx.installTtsDeps(e.id as "vieneu" | "zerotts")}
                      title="Cài Python deps (onnxruntime; GPU nếu có NVIDIA)"
                    >
                      ⬇ Cài deps
                    </button>
                  )}
                  {canDeps && (
                    <button
                      type="button"
                      className="settings-btn-secondary st-btn-sm"
                      onClick={() => ctx.diagnoseTts(e.id as "vieneu" | "zerotts")}
                      title="Kiểm tra có chạy được CUDA không"
                    >
                      🩺 Chẩn đoán
                    </button>
                  )}
                  <span className="st-hint">
                    {e.installed === false ? "Chưa tải model" : e.installed ? "Đã có model" : ""}
                    {e.deps === false ? " · thiếu deps" : e.deps ? " · deps OK" : ""}
                  </span>
                </div>

                {canCloudKey &&
                  (() => {
                    const key = e.id as "google" | "fptai";
                    const hint = ctx.ttsCloudKeyHint[key];
                    return (
                      <div className="st-cloud">
                        <input
                          type="password"
                          className="settings-input st-mono"
                          value={ctx.ttsCloudKey[key]}
                          placeholder={hint ? `Đã lưu: ••••${hint} — gõ để thay` : "Dán API key vào đây…"}
                          onChange={(ev) => ctx.setTtsCloudKey(key, ev.target.value)}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="settings-btn-secondary st-btn-sm"
                          onClick={() => ctx.saveTtsCloudKey(key)}
                        >
                          💾 Lưu key
                        </button>
                        <button
                          type="button"
                          className="settings-btn-secondary st-btn-sm"
                          onClick={() => ctx.testTtsCloud(key)}
                        >
                          🧪 Kiểm tra
                        </button>
                      </div>
                    );
                  })()}
              </div>
            );
          })}
        </div>
      )}

      {ctx.ttsNotice && <div className="st-test-ok"><span>{ctx.ttsNotice}</span></div>}
      <span className="st-hint">
        Key cloud lưu riêng trong `sublix-tts-keys.json`, không đi qua `config:updated`. Chỉ 4 ký tự cuối
        được hiện lại.
      </span>
    </section>
  );
}
