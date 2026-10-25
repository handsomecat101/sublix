//! Tauri command wrappers — type-safe bridge to Rust backend (Sublix v0.5.0).

import { invoke } from "@tauri-apps/api/core";
import type {
  ContextualLine,
  Glossary,
  GlossarySuggestion,
  ScriptLine,
  TranslateModelOption,
  TranslateOptions,
} from "./types";

export type {
  ContextualLine,
  Glossary,
  GlossarySuggestion,
  ScriptLine,
  TranslateModelOption,
  TranslateOptions,
};

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

/**
 * Model Ollama đã cài trên máy.
 * Dùng cho preset "AMD iGPU (Ollama)" + dropdown chọn model trong Cài đặt.
 */
export interface OllamaModelInfo {
  /** Tag đầy đủ, ví dụ `qwen2.5:3b` */
  name: string;
  /** Dung lượng trên đĩa (GB) */
  size_gb: number;
  /** Họ model, ví dụ `qwen2` */
  family: string;
  /** Số tham số, ví dụ `3.1B` */
  params: string;
  /** Mức lượng tử, ví dụ `Q4_K_M` */
  quant: string;
}

export interface ModelStatusItem {
  name: string;
  label: string;
  size_mb: number;
  downloaded: boolean;
}

export interface VoiceModelFile {
  url: string;
  filename: string;
  size_mb: number;
}

export interface TtsEngineInfo {
  id: "kokoro" | "vieneu" | "zerotts" | "gcloud" | "fptai";
  prefix: string;
  kind: "offline" | "cloud";
  model_id?: string;
  installed?: boolean;
  deps?: boolean;
  needs_key?: boolean;
  has_key?: boolean;
  clone?: boolean;
  fallback?: string;
  /** Có thể chọn ngay (model + deps hoặc đã có key) */
  ready: boolean;
  /** Dòng chữ xám khi chưa ready, vd "Cần API key — vào Cài đặt" */
  hint: string;
}

export interface TtsEnginesStatus {
  device_preference: "auto" | "cpu" | "cuda";
  engines: TtsEngineInfo[];
}

export interface VoiceModelStatus {
  id: string;
  name: string;
  label: string;
  desc: string;
  category: "clone" | "preset" | "diarization" | "cloud";
  size_mb: number;
  size_note: string;
  vram_note: string;
  license: string;
  vi_support: string;
  is_cloud: boolean;
  files: VoiceModelFile[];
  downloaded: boolean;
}

export interface ModelDownloadProgress {
  component: "stt" | "translation" | "voice";
  name: string;
  downloaded_bytes?: number;
  total_bytes?: number;
  percent: number;
  phase?: "downloading" | "done" | "error";
  error?: string;
}

/** TSK-FEAT-STT-ENGINES: payload sự kiện `model:download-progress` (dùng chung STT + TTS). */
export interface ModelDownloadProgressState {
  model_id: string;
  kind: "stt" | "tts";
  phase:
    | "downloading"
    | "verifying"
    | "extracting"
    | "installing_deps"
    | "done"
    | "error";
  bytes_done: number;
  bytes_total: number;
  speed_bps: number;
  eta_s: number | null;
  file: string | null;
  message: string;
}

/** @deprecated dùng `ModelDownloadProgressState`. */
export type ModelDownloadPhase = ModelDownloadProgressState;

/** TSK-FEAT-VOICE-SAMPLE-CACHE: số mẫu nghe thử đã có / tổng số giọng của engine. */
export interface VoiceSampleStatus {
  engine: string;
  ready: number;
  total: number;
}

/** TSK-FEAT-STT-ENGINES: một engine nhận dạng trong catalog. */
export interface SttEngineStatus {
  id: string;
  name: string;
  label: string;
  family: "whisper" | "sensevoice" | "paraformer" | "parakeet" | "canary";
  languages: string[];
  lang_label: string;
  desc: string;
  size_mb: number;
  size_note: string;
  license: string;
  rtf_note: string;
  requires_cuda: boolean;
  word_timestamps: boolean;
  notes: string;
  state: "not_downloaded" | "downloading" | "ready" | "error";
  downloaded: boolean;
  bytes_downloaded: number;
  bytes_total: number;
  progress_pct: number;
  error: string | null;
  is_default: boolean;
  selected: boolean;
}

/** TSK-FEAT-STT-ENGINES: một câu có timestamp từ engine sherpa. */
export interface SttSegment {
  start: number;
  end: number;
  text: string;
}

/** TSK-FEAT-STT-ENGINES: kết quả nhận dạng (cùng định dạng segment của pipeline Studio). */
export interface SttAsrResult {
  text: string;
  language: string;
  engine: string;
  family: string;
  audio_duration_secs: number;
  inference_duration_secs: number;
  timestamps: "word" | "synthetic";
  segments: SttSegment[];
}

export interface VoiceSampleProgress {
  model_id: string;
  voice_id: string;
  index: number;
  total: number;
  done: boolean;
  error?: string | null;
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
  translation_provider?: "local" | "ollama" | "minimax" | "deepseek" | "openrouter" | string;
  minimax_api_key?: string;
  minimax_model?: string;
  deepseek_api_key?: string;
  deepseek_model?: string;
  openrouter_api_key?: string;
  openrouter_model?: string;
  theme?: string;
  ollama_url?: string;
  ollama_model?: string;
  ytdlp_path?: string;
  glossary?: string[];
  /**
   * Id giọng đọc được ghim ★ (TSK-FEAT-VOICE-PICKER).
   *
   * Sở thích **người dùng** ⇒ lưu toàn cục, KHÔNG theo dự án.
   * Id đầy đủ có tiền tố engine — "vietneu:adam".
   */
  favorite_voices?: string[];
  /** Smart Ducking (docs/DUCKING_SPEC.md §2). `null`/thiếu = chưa đặt → mặc định 0.20 (hoặc bgm_volume dự án cũ khi xuất). */
  ducking_level?: number | null;
  /** Hai câu cách nhau < giá trị này (giây) → 1 khối, nền giữ thấp suốt. Mặc định 2.0. */
  ducking_bridge_sec?: number;
  /** Thời gian hạ nền trước câu đầu khối (giây). Mặc định 0.30. */
  ducking_attack_sec?: number;
  /** Thời gian trả nền sau câu cuối khối (giây). Mặc định 1.00. */
  ducking_release_sec?: number;
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

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    modelName?: string,
  ): Promise<string[]> {
    return await invoke<string[]>("translate_batch", {
      texts,
      sourceLang,
      targetLang,
      modelName,
    });
  },

  /**
   * Dịch kịch bản theo ngữ cảnh (2 lượt: đọc hiểu → dịch theo lô có ngữ cảnh trượt).
   * Phát sự kiện tiến trình `translate:progress` với {done, total, phase}.
   */
  async translateScriptContextual(
    lines: ScriptLine[],
    sourceLang: string,
    targetLang: string,
    projectPath?: string,
  ): Promise<ContextualLine[]> {
    return await invoke<ContextualLine[]>("translate_script_contextual", {
      lines,
      sourceLang,
      targetLang,
      projectPath: projectPath ?? null,
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

  /** Liệt kê model Ollama đã cài (rỗng nếu Ollama chưa chạy). */
  async ollamaModels(): Promise<OllamaModelInfo[]> {
    return await invoke<OllamaModelInfo[]>("ollama_models");
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

  /** Đọc lựa chọn dịch hiện tại + danh sách model (nút chọn nhanh, Ollama, GGUF). */
  async translateOptionsGet(): Promise<TranslateOptions> {
    return await invoke<TranslateOptions>("translate_options_get");
  },

  /** Ghi lựa chọn dịch (chỉ field được truyền — không đụng API key). */
  async translateOptionsSet(opts: {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
  }): Promise<AppConfig> {
    return await invoke<AppConfig>("translate_options_set", {
      provider: opts.provider,
      model: opts.model,
      reasoningEffort: opts.reasoningEffort,
    });
  },

  /**
   * Đọc bảng thuật ngữ + xưng hô đã duyệt.
   *
   * Có `projectPath` → đọc file `<project>.sublix-glossary.json` nếu tồn tại;
   * không (hoặc file chưa có) → đọc bảng toàn cục trong config app.
   */
  async glossaryGet(projectPath?: string): Promise<Glossary> {
    return await invoke<Glossary>("glossary_get", { projectPath: projectPath ?? null });
  },

  /**
   * Ghi bảng thuật ngữ + xưng hô đã duyệt (atomic).
   *
   * Có `projectPath` → lưu file cạnh project; không → lưu vào config toàn cục.
   */
  async glossarySet(projectPath: string | undefined, glossary: Glossary): Promise<Glossary> {
    return await invoke<Glossary>("glossary_set", {
      projectPath: projectPath ?? null,
      glossary,
    });
  },

  /**
   * Gợi ý bảng thuật ngữ + xưng hô từ kịch bản.
   *
   * Chạy RIÊNG lượt 1 ("đọc hiểu") — **không tự ghi**; người dùng duyệt rồi lưu qua
   * `glossarySet`.
   */
  async glossarySuggest(
    lines: ScriptLine[],
    sourceLang: string,
    targetLang: string,
  ): Promise<GlossarySuggestion> {
    return await invoke<GlossarySuggestion>("glossary_suggest", {
      lines,
      sourceLang,
      targetLang,
    });
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

  /**
   * v0.11.1 ROUND-4 R4-01: Transcode a video file to H.264 baseline/AAC for
   * WebView2 preview (it cannot decode VP9/AV1/HEVC natively). Returns the
   * path to the temp preview file in `%TEMP%\sublix_preview\`. Call this on
   * `<video>.onerror` to recover from codec-not-supported failures.
   */
  async transcodeForPreview(inputPath: string): Promise<string> {
    return await invoke<string>("transcode_for_preview", { inputPath });
  },

  /**
   * v0.11.15 ROUND-5 R5-03: Xoá tất cả preview file của 1 input trong
   * `%TEMP%\sublix_preview\` (match theo stem + size + mtime). Trả về số file đã xoá.
   * Gọi khi user đổi video hoặc clear file để tránh tích luỹ đầy %TEMP%.
   */
  async cleanupPreviewForInput(inputPath: string): Promise<number> {
    return await invoke<number>("cleanup_preview_for_input", { inputPath });
  },

  /**
   * v0.11.15 ROUND-5 R5-03: Xoá TOÀN BỘ folder `%TEMP%\sublix_preview\`. Gọi khi
   * app đóng hoặc user bấm nút "Dọn cache preview".
   */
  async cleanupAllPreviews(): Promise<number> {
    return await invoke<number>("cleanup_all_previews");
  },

  /**
   * Trích xuất waveform audio peaks và filmstrip thumbnails siêu tốc cho video.
   */
  async extractMediaPreview(
    videoPath: string,
    durationSec?: number
  ): Promise<MediaPreviewPayload> {
    return await invoke<MediaPreviewPayload>("extract_media_preview", {
      videoPath,
      durationSec: durationSec && durationSec > 0 ? durationSec : null,
    });
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

  async isFileSubRunning(): Promise<boolean> {
    return await invoke<boolean>("is_file_sub_running");
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

  /** v0.11.32: phụ đề có sẵn cạnh video (đánh dấu file nào là phụ đề YouTube). */
  async dubbingAvailableSubs(filePath: string): Promise<AvailableSubtitle[]> {
    return await invoke<AvailableSubtitle[]>("dubbing_available_subs", { filePath });
  },

  async voiceModelList(): Promise<VoiceModelStatus[]> {
    return await invoke<VoiceModelStatus[]>("voice_model_list");
  },

  async voiceModelDownload(id: string): Promise<void> {
    return await invoke<void>("voice_model_download", { id });
  },

  // TSK-FEAT-TTS-3ENGINES: trạng thái engine TTS (không bao giờ trả API key), key cloud, cài deps, chẩn đoán CUDA
  async ttsEnginesStatus(): Promise<TtsEnginesStatus> {
    return await invoke<TtsEnginesStatus>("tts_engines_status");
  },

  async ttsCloudSetKey(provider: "google" | "fptai", key: string): Promise<void> {
    return await invoke<void>("tts_cloud_set_key", { provider, key });
  },

  async ttsCloudTest(provider: "google" | "fptai"): Promise<string> {
    return await invoke<string>("tts_cloud_test", { provider });
  },

  async ttsEngineInstallDeps(engine: "vieneu" | "zerotts"): Promise<void> {
    return await invoke<void>("tts_engine_install_deps", { engine });
  },

  async ttsEngineDiagnose(engine: "vieneu" | "zerotts"): Promise<Record<string, unknown>> {
    return await invoke<Record<string, unknown>>("tts_engine_diagnose", { engine });
  },

  async voiceSampleList(modelId: string): Promise<string[]> {
    return await invoke<string[]>("voice_sample_list", { modelId });
  },

  async voiceSampleGenerate(modelId: string): Promise<number> {
    return await invoke<number>("voice_sample_generate", { modelId });
  },

  async voiceSampleData(modelId: string, voiceId: string): Promise<string | null> {
    return await invoke<string | null>("voice_sample_data", { modelId, voiceId });
  },

  // TSK-FEAT-STT-ENGINES: catalog engine STT + tải model có tiến trình chi tiết
  async sttEnginesStatus(): Promise<SttEngineStatus[]> {
    return await invoke<SttEngineStatus[]>("stt_engines_status");
  },

  async sttSetEngine(id: string): Promise<void> {
    return await invoke<void>("stt_set_engine", { id });
  },

  async sttModelDownload(id: string): Promise<void> {
    return await invoke<void>("stt_model_download", { id });
  },

  async sttModelCancel(id: string): Promise<void> {
    return await invoke<void>("stt_model_cancel", { id });
  },

  async sttModelDelete(id: string): Promise<void> {
    return await invoke<void>("stt_model_delete", { id });
  },

  async sttTranscribe(
    wavPath: string,
    language?: string,
    engineId?: string,
  ): Promise<SttAsrResult> {
    return await invoke<SttAsrResult>("stt_transcribe", {
      wavPath,
      language,
      engineId,
    });
  },

  async sttWriteSrt(
    wavPath: string,
    srtPath: string,
    language?: string,
    engineId?: string,
  ): Promise<string> {
    return await invoke<string>("stt_write_srt", {
      wavPath,
      srtPath,
      language,
      engineId,
    });
  },

  async dubbingAnalyze(
    filePath: string,
    sourceLang?: string,
    targetLang?: string,
    timeLimitSec?: number,
    startOffsetSec?: number,
    expectedSpeakers?: number,
    preferExistingSrt?: boolean
  ): Promise<DubbingProject> {
    return await invoke<DubbingProject>("dubbing_analyze", {
      filePath,
      sourceLang,
      targetLang,
      timeLimitSec: timeLimitSec && timeLimitSec > 0 ? timeLimitSec : null,
      startOffsetSec: startOffsetSec && startOffsetSec > 0 ? startOffsetSec : null,
      expectedSpeakers: expectedSpeakers && expectedSpeakers > 0 ? expectedSpeakers : null,
      preferExistingSrt: preferExistingSrt === undefined ? null : preferExistingSrt,
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

  /**
   * v0.9.8: Open Windows Explorer with the dubbed output file selected in its
   * parent folder. Use after `dubbingExport()` returns the output path so the
   * user can jump straight to the finished MP4 without hunting for it.
   */
  async dubbingOpenOutputFolder(path: string): Promise<void> {
    return await invoke<void>("dubbing_open_output_folder", { path });
  },

  /** v0.9.10 (PO): mở thư mục THÀNH PHẨM — nơi chứa cả video tải về lẫn file lồng tiếng. */
  async openThanhPhamFolder(): Promise<void> {
    return await invoke<void>("open_thanh_pham_folder");
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

  // v0.9.4: play the downloaded file with the default OS player.
  async downloaderOpenFile(path: string): Promise<void> {
    return await invoke("downloader_open_file", { path });
  },

  // v0.9.4: where downloads are stored on disk (shown in the tab header).
  async downloaderDownloadsDir(): Promise<string> {
    return await invoke<string>("downloader_downloads_dir");
  },

  // v0.9.6: probe a finished file for size + resolution (lazy backfill).
  async downloaderFileMeta(path: string): Promise<FileMeta | null> {
    return await invoke<FileMeta | null>("downloader_file_meta", { path });
  },

  /** v0.9.11: fetch subtitle (.srt) files for an already-downloaded video. */
  async downloaderFetchSubtitles(
    url: string,
    videoFilename: string,
    browserCookies?: string | null,
    cookiesFile?: string | null,
  ): Promise<string[]> {
    return await invoke<string[]>("downloader_fetch_subtitles", {
      url,
      videoFilename,
      browserCookies: browserCookies ?? null,
      cookiesFile: cookiesFile ?? null,
    });
  },

  // BUG-051: how many bytes are free on the volume that would hold
  // a download at `path` (defaults to the internal downloads dir).
  async downloaderCheckDisk(path?: string): Promise<number> {
    return await invoke<number>("downloader_check_disk", { path });
  },

  // R2-09.7: cheap file existence probe so the pipeline-bridge buttons
  // (Tạo Phụ Đề / Lồng Tiếng AI) can disable themselves when the file
  // yt-dlp reported has been deleted or was never actually written.
  async downloaderFileExists(path: string): Promise<boolean> {
    try {
      return await invoke<boolean>("downloader_file_exists", { path });
    } catch {
      // Graceful fallback for web browser dev/test mode outside Tauri desktop
      if (typeof window !== "undefined" && !(window as any).__TAURI_INTERNALS__) {
        return (path || "").trim().length > 0;
      }
      return false;
    }
  },

  // TSK-FEAT-DL-BATCH-AUDIO: tách ô nhập nhiều link (lọc URL hợp lệ + loại trùng).
  async downloaderParseUrls(text: string): Promise<ParsedUrls> {
    return await invoke<ParsedUrls>("downloader_parse_urls", { text });
  },

  // TSK-FEAT-DL-BATCH-AUDIO: đọc danh sách mục playlist (yt-dlp --flat-playlist -J).
  async downloaderExpandPlaylist(
    url: string,
    browserCookies?: string | null,
  ): Promise<PlaylistExpansion> {
    return await invoke<PlaylistExpansion>("downloader_expand_playlist", {
      url,
      browserCookies: browserCookies ?? null,
    });
  },

  // ── TSK-FEAT-VOICE-SAMPLE-CACHE ────────────────────────────────────────
  /** Số mẫu nghe thử đã có / tổng số giọng của engine ("kokoro"|"vieneu"|"zerotts"|"cloud"). */
  async voiceSampleStatus(engine: string): Promise<VoiceSampleStatus> {
    return await invoke<VoiceSampleStatus>("voice_sample_status", { engine });
  },

  /**
   * Lấy mẫu nghe thử: có cache thì trả ngay (tức thì), chưa có thì tổng hợp
   * 1 lần rồi lưu lại cho các lần sau (lazy).
   */
  async voiceSampleEnsure(voiceId: string, text?: string): Promise<string | null> {
    return await invoke<string | null>("voice_sample_ensure", {
      voiceId,
      text: text ?? null,
    });
  },

  /** Tạo mẫu nghe thử nền cho mọi giọng của engine (hoặc mọi engine đã cài). */
  async voiceSamplesPrepare(engine?: string): Promise<number> {
    return await invoke<number>("voice_samples_prepare", { engine: engine ?? null });
  },

  /** Huỷ lượt tạo mẫu nền đang chạy. */
  async voiceSamplesPrepareCancel(): Promise<void> {
    return await invoke<void>("voice_samples_prepare_cancel");
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
  /** v0.9.10: "male" | "female" — để GUI/CLI re-assign voice đúng gender thay vì đoán. */
  gender?: string;
  /** v0.10.0: Base64 Data URI of a 2-8s original audio clip of this speaker for UI preview. */
  sample_audio_data?: string | null;
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
  /** v0.10.0: "sherpa" | "heuristic" | "minimax" */
  diarization_engine?: "sherpa" | "heuristic" | string;
  /** v0.11.32: "whisper" hoặc "srt:<lang>" khi dùng phụ đề có sẵn cạnh video. */
  transcript_source?: string | null;
  peaks?: number[];
  filmstrip_thumbs?: Array<{ time_sec: number; data_uri: string }>;
  /** v0.11.33: "softsub" (mặc định - nhúng track phụ đề vào MP4 bật/tắt trong VLC) | "hardsub" | "none" */
  sub_export_mode?: "softsub" | "hardsub" | "none";
  /** v0.11.33: "multitrack" (mặc định - VLC chọn Track 1: Gốc, Track 2: Thuyết minh) | "mixed" | "original" */
  audio_export_mode?: "multitrack" | "mixed" | "original";
  target_lang?: string;
}

/** v0.11.32: phụ đề có sẵn cạnh video — source "youtube" nếu do app tải từ YouTube. */
export interface AvailableSubtitle {
  lang: string;
  source: "youtube" | "file" | string;
}

export interface MediaPreviewPayload {
  peaks: number[];
  filmstrip_thumbs: Array<{ time_sec: number; data_uri: string }>;
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
  /** Approximate total size in bytes (BUG-051). */
  filesize_approx?: number | null;
}

/** TSK-FEAT-DL-PLATFORMS-REUP: tùy chọn reup (mặc định tắt). */
export interface ReupOptions {
  /** Xuất metadata `<tên video>.info.txt` cạnh video. */
  write_info: boolean;
  /** `--download-archive`: chống tải trùng bền vững giữa các lần. */
  archive: boolean;
  /** Tải thumbnail gốc (.jpg). */
  thumbnail: boolean;
  /** Cắt đoạn — mốc bắt đầu hh:mm:ss (rỗng = từ đầu). */
  section_start?: string | null;
  /** Cắt đoạn — mốc kết thúc hh:mm:ss (rỗng = đến hết). */
  section_end?: string | null;
}

export interface DownloadRequest {
  id: string;
  url: string;
  format: string; // "1080p" | "720p" | "480p" | "360p" | "audio-mp3" | "audio-m4a" | "max"
  browser_cookies?: string | null; // "edge" | "chrome" | "firefox" | "none"
  cookies_file?: string | null;
  extract_subtitles: boolean;
  subtitle_langs?: string[] | null;
  reup?: ReupOptions | null;
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
  run_id?: number | null;
}

// v0.9.6: extra metadata emitted once per completed download.
export interface DownloadMetaPayload {
  id: string;
  size_text?: string | null;
  resolution?: string | null;
  /** v0.9.11: subtitle langs that actually landed on disk (null = not asked). */
  subs_langs?: string[] | null;
}

// TSK-FEAT-DL-BATCH-AUDIO: kết quả tách ô nhập nhiều link.
export interface ParsedUrls {
  urls: string[];
  invalid: number;
  duplicates: number;
}

export interface PlaylistEntry {
  url: string;
  title: string;
  duration?: number | null;
}

export interface PlaylistExpansion {
  is_playlist: boolean;
  title?: string | null;
  entries: PlaylistEntry[];
  /** Tổng số mục playlist báo về (có thể lớn hơn entries khi bị cắt). */
  total: number;
  truncated: boolean;
}

// v0.9.6: on-demand probe result for a finished file.
export interface FileMeta {
  size_text?: string | null;
  resolution?: string | null;
  /** v0.9.11: subtitle langs sitting next to the file. */
  subs_langs?: string[] | null;
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

export async function downloaderOpenFile(path: string): Promise<void> {
  return invoke("downloader_open_file", { path });
}

export async function downloaderDownloadsDir(): Promise<string> {
  return invoke<string>("downloader_downloads_dir");
}

export async function downloaderFileMeta(path: string): Promise<FileMeta | null> {
  return invoke<FileMeta | null>("downloader_file_meta", { path });
}


