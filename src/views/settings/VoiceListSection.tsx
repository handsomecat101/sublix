//! TSK-FEAT-VOICE-PICKER — Cài đặt › Giọng đọc: danh sách giọng dạng **inline**
//! (không popover, không ✓, không chip vai) + ghim ★ lưu **toàn cục**.
//!
//! ★ lưu qua `getConfig` → `mergeConfig` (giữ API key) → `saveConfig`.
//! Nghe mẫu gọi thẳng `dubbing_preview_tts` (backend trả về data URI base64).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sublix } from "../../lib/tauri";
import type { AppConfig, VoicePreset } from "../../lib/tauri";
import { VoicePicker } from "../../components/voice/VoicePicker";
import { voiceItemFromOption } from "../../components/voice/voicePickerModel";
import type { VoicePickerItem } from "../../components/voice/voicePickerModel";
import { mergeConfig } from "./configMerge";
import type { SettingsCtx } from "./types";

/** Câu mẫu để nghe thử giọng. */
const SAMPLE_TEXT = "Xin chào, đây là mẫu giọng đọc thử.";

/** Nhãn ngắn của engine (backend không trả tên hiển thị cho TTS engine). */
const ENGINE_LABEL: Record<string, string> = {
  kokoro: "Kokoro",
  vieneu: "VieNeu v3",
  zerotts: "ZeroTTS",
  gcloud: "Google",
  fptai: "FPT.AI",
};

export function VoiceListSection({ ctx }: { ctx: SettingsCtx }) {
  const [voices, setVoices] = useState<VoicePickerItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ id: string; status: "loading" | "playing" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** Engine theo tiền tố id giọng ("vietneu:adam" → "vietneu"). */
  const engineByPrefix = useMemo(() => {
    const map = new Map<string, { label: string; kind: "offline" | "cloud" }>();
    for (const e of ctx.ttsStatus?.engines ?? []) {
      const prefix = e.prefix.replace(/:$/, "");
      map.set(prefix, {
        label: ENGINE_LABEL[e.id] ?? e.id,
        kind: e.kind,
      });
    }
    return map;
  }, [ctx.ttsStatus]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, cfg] = await Promise.all([
        sublix.dubbingGetVoices() as Promise<VoicePreset[]>,
        sublix.getConfig() as Promise<AppConfig>,
      ]);
      setFavorites(cfg.favorite_voices ?? []);
      setVoices(
        list.map((v) => {
          const item = voiceItemFromOption(v.id, v.name, v.gender as "male" | "female");
          const engine = engineByPrefix.get(item.engineId);
          return {
            ...item,
            lang: v.lang ?? item.lang,
            engineLabel: engine?.label ?? item.engineLabel,
            kind: engine?.kind ?? item.kind,
          };
        }),
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [engineByPrefix]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Bật/tắt ★ — đọc lại config từ đĩa rồi gộp (KHÔNG xoá API key). */
  const toggleFavorite = useCallback(async (voiceId: string) => {
    const latest = (await sublix.getConfig()) as unknown as Record<string, unknown>;
    const current = Array.isArray(latest.favorite_voices) ? (latest.favorite_voices as string[]) : [];
    const next = current.includes(voiceId)
      ? current.filter((id) => id !== voiceId)
      : [...current, voiceId];
    setFavorites(next);
    try {
      const merged = mergeConfig({ latest, patch: { favorite_voices: next } });
      await sublix.saveConfig(merged as unknown as AppConfig);
    } catch (e) {
      setFavorites(current);
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }, []);

  /** Nghe mẫu — 1 mẫu phát 1 lúc; bấm lại hoặc đóng → dừng. */
  const stopPreview = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPreview(null);
  }, []);

  const onPreview = useCallback(
    async (voiceId: string) => {
      if (preview?.id === voiceId) {
        stopPreview();
        return;
      }
      stopPreview();
      setPreview({ id: voiceId, status: "loading" });
      try {
        const uri = await sublix.dubbingPreviewTts(SAMPLE_TEXT, voiceId);
        let audio = audioRef.current;
        if (!audio) {
          audio = new Audio();
          audioRef.current = audio;
        }
        audio.src = uri;
        await audio.play();
        setPreview({ id: voiceId, status: "playing" });
        audio.onended = () => setPreview((p) => (p?.id === voiceId ? null : p));
      } catch (e) {
        setPreview(null);
        setNotice(e instanceof Error ? e.message : String(e));
      }
    },
    [preview?.id, stopPreview],
  );

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  return (
    <section className="settings-section st-card">
      <div className="st-sec-head">
        <h2>🎙 Danh sách giọng đọc</h2>
        <span className="st-hint">
          {loading ? "Đang đọc…" : `${voices.length} giọng`} · bấm ★ để ghim (lưu cho mọi dự án) · ▶ nghe
          mẫu
        </span>
        <button type="button" className="settings-btn-secondary st-btn-sm" disabled={loading} onClick={load}>
          ↻ Làm mới
        </button>
      </div>

      {voices.length === 0 && !loading ? (
        <div className="st-empty">Chưa đọc được danh sách giọng (engine chưa tải model?).</div>
      ) : (
        <VoicePicker
          variant="inline"
          voices={voices}
          favorites={favoriteSet}
          onToggleFavorite={toggleFavorite}
          preview={preview}
          onPreview={onPreview}
          onStopPreview={stopPreview}
          ariaLabel="Danh sách giọng đọc"
        />
      )}

      {notice ? <div className="st-engine-hint">⚠️ {notice}</div> : null}
    </section>
  );
}

export default VoiceListSection;
