//! Tauri command wrappers — type-safe bridge to Rust backend (Sublix v0.5.0).

import { invoke } from "@tauri-apps/api/core";

export interface AudioDevice {
  id: string;
  name: string;
}

export interface AudioFormat {
  sample_rate: number;
  channels: number;
  bits_per_sample: number;
  sample_type: string;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  model: string;
  audio_duration_secs: number;
  inference_duration_secs: number;
}

export interface AppInfo {
  name: string;
  version: string;
  description: string;
}

export interface ModelStatusItem {
  name: string;
  label: string;
  size_mb: number;
  downloaded: boolean;
}

export interface SetupStatus {
  has_whisper_binary: boolean;
  stt_engine: string | null;
  stt_models: ModelStatusItem[];
  has_translation_binary: boolean;
  has_translation_model: boolean;
  translation_models: ModelStatusItem[];
  translation_model_size_mb: number;
  is_first_run: boolean;
}

export interface AppConfig {
  stt_engine_preference: string;
  translation_engine_preference: string;
  stt_model: string;
  translation_model: string;
  source_lang: string;
  target_lang: string;
  output_mode: string;
  chunk_seconds: number;
  vad_enabled: boolean;
  overlay_font_size: number;
  overlay_show_original: boolean;
  overlay_click_through: boolean;
}

export const sublix = {
  async listDevices(): Promise<AudioDevice[]> {
    return await invoke<AudioDevice[]>("list_audio_devices");
  },

  async captureTest(
    outputPath: string,
    durationSecs: number,
    deviceIndex?: number,
  ): Promise<AudioFormat> {
    return await invoke<AudioFormat>("capture_test", {
      outputPath,
      durationSecs,
      deviceIndex,
    });
  },

  async transcribe(
    wavPath: string,
    language?: string,
    modelName?: string,
  ): Promise<TranscriptionResult> {
    return await invoke<TranscriptionResult>("transcribe_test", {
      wavPath,
      language,
      modelName,
    });
  },

  async translateTest(
    text: string,
    sourceLang: string,
    targetLang: string,
    modelName?: string,
  ): Promise<string> {
    return await invoke<string>("translate_test", {
      text,
      sourceLang,
      targetLang,
      modelName,
    });
  },

  async showOverlay(): Promise<void> {
    return await invoke("show_overlay");
  },

  async hideOverlay(): Promise<void> {
    return await invoke("hide_overlay");
  },

  async setOverlayClickThrough(enabled: boolean): Promise<AppConfig> {
    return await invoke<AppConfig>("set_overlay_click_through", { enabled });
  },

  async appInfo(): Promise<AppInfo> {
    return await invoke<AppInfo>("app_info");
  },

  async startLive(opts: {
    deviceIndex?: number;
    model?: string;
    chunkSeconds?: number;
    outputMode?: "original" | "translated";
    targetLang?: string;
    sourceLang?: string;
    translationModel?: string;
    vadEnabled?: boolean;
  } = {}): Promise<void> {
    return await invoke("start_live", {
      deviceIndex: opts.deviceIndex,
      model: opts.model,
      chunkSeconds: opts.chunkSeconds,
      outputMode: opts.outputMode,
      targetLang: opts.targetLang,
      sourceLang: opts.sourceLang,
      translationModel: opts.translationModel,
      vadEnabled: opts.vadEnabled,
    });
  },

  async stopLive(): Promise<void> {
    return await invoke("stop_live");
  },

  async liveStatus(): Promise<boolean> {
    return await invoke<boolean>("live_status");
  },

  async testAudio(deviceIndex?: number): Promise<{
    device_name: string;
    file_size_bytes: number;
    peak_volume: number;
    rms_volume: number;
    duration_secs: number;
    has_audio: boolean;
  }> {
    return await invoke("test_audio", { deviceIndex });
  },

  async scanAudioLevels(): Promise<Array<{
    index: number;
    name: string;
    peak_volume: number;
    has_audio: boolean;
    error: string | null;
  }>> {
    return await invoke("scan_audio_levels");
  },

  async getTranslationEngine(): Promise<string | null> {
    return await invoke<string | null>("get_translation_engine");
  },

  async preloadTranslationServer(model?: string): Promise<string> {
    return await invoke<string>("preload_translation_server", { model });
  },

  async getSttEngine(): Promise<string | null> {
    return await invoke<string | null>("get_stt_engine");
  },

  async preloadSttServer(model?: string): Promise<string> {
    return await invoke<string>("preload_stt_server_cmd", { model });
  },

  async getSttServerEngine(): Promise<string | null> {
    return await invoke<string | null>("get_stt_server_engine");
  },

  async getConfig(): Promise<AppConfig> {
    return await invoke<AppConfig>("get_config");
  },

  async saveConfig(newConfig: AppConfig): Promise<AppConfig> {
    return await invoke<AppConfig>("save_user_config", { newConfig });
  },

  async setSttEnginePreference(choice: string): Promise<AppConfig> {
    return await invoke<AppConfig>("set_stt_engine_preference", { choice });
  },

  async setTranslationEnginePreference(choice: string): Promise<AppConfig> {
    return await invoke<AppConfig>("set_translation_engine_preference", { choice });
  },

  async checkSetup(): Promise<SetupStatus> {
    return await invoke<SetupStatus>("check_setup");
  },

  async downloadWhisperBinary(): Promise<void> {
    return await invoke("download_whisper_binary_cmd");
  },

  async downloadSttModel(variant: string): Promise<void> {
    return await invoke("download_stt_model_cmd", { variant });
  },

  async downloadTranslationModel(variant?: string): Promise<void> {
    return await invoke("download_translation_model_cmd", { variant });
  },

  async openModelsFolder(): Promise<void> {
    return await invoke("open_models_folder");
  },
};
