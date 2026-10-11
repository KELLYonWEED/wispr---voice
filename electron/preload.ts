import { contextBridge, ipcRenderer } from 'electron';

export interface TranscriptItem {
  id: string;
  text: string;
  rawText?: string;
  wasFormatted?: boolean;
  created_at: number;
  word_count?: number;
}

export interface AppSettings {
  groqApiKey: string;
  geminiApiKey: string;
  preferredMicId?: string;
}

export interface AppHotkeys {
  recordingHotkey: string;
  modePickerHotkey: string;
}

export type DictationMode = 'default' | 'code' | 'notes';
export type SkinId = 'obsidian' | 'retro' | 'sakura' | 'neko' | 'lofi' | 'cloud';

export interface UserStats {
  totalWords: number;
  activeSkin: SkinId;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Absolute Recording Controls (Single Source of Truth)
  onStartRecording: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('start-recording-cmd', handler);
    return () => ipcRenderer.removeListener('start-recording-cmd', handler);
  },
  onStopRecording: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('stop-recording-cmd', handler);
    return () => ipcRenderer.removeListener('stop-recording-cmd', handler);
  },
  onCancelRecording: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('cancel-recording-cmd', handler);
    return () => ipcRenderer.removeListener('cancel-recording-cmd', handler);
  },
  sendAudio: (base64Data: string, mimeType: string) => {
    ipcRenderer.send('audio-data', { base64Data, mimeType });
  },
  onStateChange: (callback: (state: 'idle' | 'recording' | 'processing' | 'done' | 'error') => void) => {
    const handler = (_event: any, state: any) => callback(state);
    ipcRenderer.on('state-change', handler);
    return () => ipcRenderer.removeListener('state-change', handler);
  },
  onErrorMessage: (callback: (message: string) => void) => {
    const handler = (_event: any, message: string) => callback(message);
    ipcRenderer.on('error-message', handler);
    return () => ipcRenderer.removeListener('error-message', handler);
  },

  // Main Window History & Clipboard APIs
  getHistory: (): Promise<TranscriptItem[]> => {
    return ipcRenderer.invoke('get-history');
  },
  copyText: (text: string): Promise<boolean> => {
    return ipcRenderer.invoke('copy-text', text);
  },
  deleteHistoryItem: (id: string): Promise<TranscriptItem[]> => {
    return ipcRenderer.invoke('delete-history-item', id);
  },
  clearHistory: (): Promise<TranscriptItem[]> => {
    return ipcRenderer.invoke('clear-history');
  },
  onHistoryUpdated: (callback: (items: TranscriptItem[]) => void) => {
    const handler = (_event: any, items: TranscriptItem[]) => callback(items);
    ipcRenderer.on('history-updated', handler);
    return () => ipcRenderer.removeListener('history-updated', handler);
  },

  // Settings APIs — per-user API keys
  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke('get-settings');
  },
  saveSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => {
    return ipcRenderer.invoke('save-settings', settings);
  },
  onMicChanged: (callback: (micId: string) => void) => {
    const handler = (_event: any, micId: string) => callback(micId);
    ipcRenderer.on('mic-changed', handler);
    return () => ipcRenderer.removeListener('mic-changed', handler);
  },
  testApiKey: (provider: 'groq' | 'gemini', key: string): Promise<{ ok: boolean; latencyMs?: number; error?: string }> => {
    return ipcRenderer.invoke('test-api-key', { provider, key });
  },

  // Dictation mode APIs
  getDictationMode: (): Promise<DictationMode> => {
    return ipcRenderer.invoke('get-dictation-mode');
  },
  setDictationMode: (mode: DictationMode): Promise<DictationMode> => {
    return ipcRenderer.invoke('set-dictation-mode', mode);
  },

  // HUD Skins & Gamification APIs
  getActiveSkin: (): Promise<SkinId> => {
    return ipcRenderer.invoke('get-active-skin');
  },
  setActiveSkin: (skin: SkinId): Promise<SkinId> => {
    return ipcRenderer.invoke('set-active-skin', skin);
  },
  getUserStats: (): Promise<UserStats> => {
    return ipcRenderer.invoke('get-user-stats');
  },
  onSkinChanged: (callback: (skin: SkinId) => void) => {
    const handler = (_event: any, skin: any) => callback(skin);
    ipcRenderer.on('skin-changed', handler);
    return () => ipcRenderer.removeListener('skin-changed', handler);
  },
  onUserStatsUpdated: (callback: (stats: UserStats) => void) => {
    const handler = (_event: any, stats: any) => callback(stats);
    ipcRenderer.on('user-stats-updated', handler);
    return () => ipcRenderer.removeListener('user-stats-updated', handler);
  },

  // Custom vocabulary APIs — manual, user-typed list only
  getVocabulary: (): Promise<string[]> => {
    return ipcRenderer.invoke('get-vocabulary');
  },
  saveVocabulary: (terms: string[]): Promise<string[]> => {
    return ipcRenderer.invoke('save-vocabulary', terms);
  },

  // Mode-picker (Pill) APIs — triggered by Ctrl+Shift+M
  onShowModePicker: (callback: (currentMode: DictationMode) => void) => {
    const handler = (_event: any, mode: any) => callback(mode);
    ipcRenderer.on('show-mode-picker', handler);
    return () => ipcRenderer.removeListener('show-mode-picker', handler);
  },
  selectModeAndRecord: (mode: DictationMode) => {
    ipcRenderer.send('select-mode-and-record', mode);
  },
  dismissModePicker: () => {
    ipcRenderer.send('mode-picker-dismissed');
  },

  // Hotkey APIs — user-configurable global shortcuts
  getHotkeys: (): Promise<AppHotkeys> => {
    return ipcRenderer.invoke('get-hotkeys');
  },
  saveHotkeys: (hotkeys: Partial<AppHotkeys>): Promise<AppHotkeys> => {
    return ipcRenderer.invoke('save-hotkeys', hotkeys);
  },
  // Suspend/resume global shortcut registration while the user is picking
  // a new key combination, so the currently-bound keys can be captured.
  beginHotkeyCapture: () => {
    ipcRenderer.send('hotkey-capture-start');
  },
  endHotkeyCapture: () => {
    ipcRenderer.send('hotkey-capture-end');
  },

  // Window Controls
  minimizeWindow: () => {
    ipcRenderer.send('window-minimize');
  },
  closeWindow: () => {
    ipcRenderer.send('window-close');
  },
  openExternal: (url: string): Promise<boolean> => {
    return ipcRenderer.invoke('open-external', url);
  }
});
