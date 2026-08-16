//! Tauri command wrappers — type-safe bridge to Rust backend.
//!
//! Sublix M4: Audio + STT commands for the settings UI.

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
    model?: string,
  ): Promise<TranscriptionResult> {
    return await invoke<TranscriptionResult>("transcribe_test", {
      wavPath,
      language,
      model,
    });
  },

  async showOverlay(): Promise<void> {
    return await invoke("show_overlay");
  },

  async hideOverlay(): Promise<void> {
    return await invoke("hide_overlay");
  },
};
