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

export interface ModelDownloadProgress {
  component: "stt" | "translation";
  name: string;
  downloaded_bytes?: number;
  total_bytes?: number;
  percent: number;
  phase?: "downloading" | "done" | "error";
  error?: string;
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
  overlay_bg_opacity?: number;
  overlay_text_color?: string;
  translation_provider?: "local" | "ollama" | "minimax" | string;
  minimax_api_key?: string;
  minimax_model?: string;
  theme?: string;
  ollama_url?: string;
  ollama_model?: string;
}

export interface FileSubProgress {
  stage: string;
  message: string;
  percent: number;
  current_segment: number;
  total_segments: number;
  current_original: string | null;
  current_translated: string | null;
}

export interface FileSubResult {
  input_path: string;
  vi_srt_path: string;
  bilingual_srt_path: string | null;
  original_srt_path: string;
  total_segments: number;
  elapsed_seconds: number;
  media_duration_seconds: number | null;
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

  async selectMediaFile(): Promise<string | null> {
    return await invoke<string | null>("select_media_file");
  },

  async generateFileSubtitles(opts: {
    inputPath: string;
    sourceLang?: string;
    targetLang?: string;
    createBilingual?: boolean;
    sttModelName?: string;
    translationModelName?: string;
  }): Promise<FileSubResult> {
    return await invoke<FileSubResult>("generate_file_subtitles", {
      inputPath: opts.inputPath,
      sourceLang: opts.sourceLang,
      targetLang: opts.targetLang,
      createBilingual: opts.createBilingual ?? true,
      sttModelName: opts.sttModelName,
      translationModelName: opts.translationModelName,
    });
  },

  async revealInExplorer(path: string): Promise<void> {
    return await invoke("reveal_in_explorer", { path });
  },

  async playInVlc(videoPath: string, srtPath: string): Promise<void> {
    return await invoke("play_in_vlc", { videoPath, srtPath });
  },

  async dubbingPickMediaFile(): Promise<string | null> {
    return await invoke<string | null>("dubbing_pick_media_file");
  },

  async dubbingGetVoices(): Promise<VoicePreset[]> {
    return await invoke<VoicePreset[]>("dubbing_get_voices");
  },

  async dubbingAnalyze(
    filePath: string,
    sourceLang?: string,
    targetLang?: string,
    timeLimitSec?: number
  ): Promise<DubbingProject> {
    return await invoke<DubbingProject>("dubbing_analyze", {
      filePath,
      sourceLang,
      targetLang,
      timeLimitSec: timeLimitSec && timeLimitSec > 0 ? timeLimitSec : null,
    });
  },

  async dubbingCancel(): Promise<void> {
    return await invoke<void>("dubbing_cancel");
  },

  async dubbingPreviewTts(text: string, voice: string, rate?: string, pitch?: string): Promise<string> {
    return await invoke<string>("dubbing_preview_tts", { text, voice, rate, pitch });
  },

  async dubbingExport(project: DubbingProject, outputPath?: string): Promise<string> {
    return await invoke<string>("dubbing_export", { project, outputPath });
  },

  async downloaderGetInfo(url: string): Promise<VideoInfo> {
    return await invoke<VideoInfo>("downloader_get_info", { url });
  },

  async downloaderStart(req: DownloadRequest): Promise<void> {
    return await invoke("downloader_start", { req });
  },

  async downloaderPause(id: string): Promise<void> {
    return await invoke("downloader_pause", { id });
  },

  async downloaderCancel(id: string): Promise<void> {
    return await invoke("downloader_cancel", { id });
  },

  async downloaderOpenFolder(): Promise<void> {
    return await invoke("downloader_open_folder");
  },

  async downloaderRevealFile(path: string): Promise<void> {
    return await invoke("downloader_reveal_file", { path });
  },
};

export interface VoicePreset {
  id: string;
  name: string;
  gender: "male" | "female";
  lang: string;
  description: string;
}

export interface DubbingSpeaker {
  id: string;
  label: string;
  voice: string;
  pitch: string;
  rate: string;
}

export interface DubbingSegment {
  id: number;
  speaker_id: string;
  start_sec: number;
  end_sec: number;
  original_text: string;
  dubbed_text: string;
  audio_duration_sec?: number | null;
  status: string;
}

export interface DubbingProject {
  input_path: string;
  media_duration_sec: number;
  speakers: DubbingSpeaker[];
  segments: DubbingSegment[];
  bgm_volume: number;
  voice_volume: number;
  dubbing_mode?: "ducking" | "vocal_isolation";
  time_limit_sec?: number | null;
}

export interface DubbingProgress {
  stage: string;
  percent: number;
  message: string;
  current_item: number;
  total_items: number;
}

export interface VideoInfo {
  id: string;
  title: string;
  uploader?: string | null;
  duration?: number | null;
  thumbnail?: string | null;
  platform: string;
  url: string;
  description?: string | null;
}

export interface DownloadRequest {
  id: string;
  url: string;
  format: string; // "1080p" | "720p" | "480p" | "360p" | "audio-mp3" | "audio-m4a" | "max"
  browser_cookies?: string | null; // "edge" | "chrome" | "firefox" | "none"
  extract_subtitles: boolean;
  subtitle_langs?: string[] | null;
}

export interface DownloadProgressPayload {
  id: string;
  status: "downloading" | "paused" | "completed" | "error" | "cancelled";
  percent: number;
  speed: string;
  eta: string;
  size_text: string;
  filename: string;
  file_path?: string | null;
  error?: string | null;
}

export async function downloaderGetInfo(url: string): Promise<VideoInfo> {
  return invoke<VideoInfo>("downloader_get_info", { url });
}

export async function downloaderStart(req: DownloadRequest): Promise<void> {
  return invoke("downloader_start", { req });
}

export async function downloaderPause(id: string): Promise<void> {
  return invoke("downloader_pause", { id });
}

export async function downloaderCancel(id: string): Promise<void> {
  return invoke("downloader_cancel", { id });
}

export async function downloaderOpenFolder(): Promise<void> {
  return invoke("downloader_open_folder");
}

export async function downloaderRevealFile(path: string): Promise<void> {
  return invoke("downloader_reveal_file", { path });
}


