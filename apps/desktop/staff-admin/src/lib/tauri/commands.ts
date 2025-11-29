import { invoke } from "@tauri-apps/api/core";

export interface AccessibilitySettings {
  highContrast: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  textScaling: number;
  colorBlindMode: "none" | "protanopia" | "deuteranopia" | "tritanopia";
  cursorSize: "normal" | "large" | "extra-large";
  screenReader: boolean;
  soundEffects: boolean;
  voiceFeedback: boolean;
  keyboardNavigation: boolean;
  stickyKeys: boolean;
  slowKeys: boolean;
  slowKeysDelay: number;
  focusIndicator: "default" | "enhanced" | "high-visibility";
  simplifiedUI: boolean;
  readingGuide: boolean;
  dyslexiaFont: boolean;
  lineSpacing: number;
  wordSpacing: number;
}

export interface VoiceCommand {
  transcript: string;
  commandMatched: string | null;
  actionTaken: string | null;
  confidence: number;
  timestamp: Date;
}

export interface CachedScan {
  scanId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  extractedData: Record<string, unknown>;
  createdAt: Date;
}

export const tauriCommands = {
  accessibility: {
    getSettings: () => invoke<AccessibilitySettings | null>("get_accessibility_settings"),
    saveSettings: (settings: AccessibilitySettings) =>
      invoke("save_accessibility_settings", { settings }),
  },
  voice: {
    getHistory: (limit: number) => invoke<VoiceCommand[]>("get_voice_command_history", { limit }),
    saveCommand: (command: VoiceCommand) => invoke("save_voice_command", { command }),
  },
  documents: {
    getCache: (scanId: string) => invoke<CachedScan | null>("get_document_scan_cache", { scanId }),
    clearCache: () => invoke("clear_document_cache"),
  },
  updates: {
    checkForUpdates: () => invoke<UpdateInfo>("check_for_updates"),
    downloadUpdate: (url: string) => invoke<string>("download_update", { downloadUrl: url }),
    installUpdate: (path: string) => invoke("install_update", { installerPath: path }),
    getCurrentVersion: () => invoke<string>("get_current_version"),
  },
};

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_notes: string;
  download_url: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

// Auth credential management
export async function getSecureCredentials(): Promise<string | null> {
  return invoke<string | null>("get_secure_credentials");
}

export async function setSecureCredentials(session: string): Promise<void> {
  return invoke("set_secure_credentials", { session });
}

export async function deleteSecureCredentials(): Promise<void> {
  return invoke("delete_secure_credentials");
}
