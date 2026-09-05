import React, { useState, useEffect, useMemo } from 'react';
import { playEarcon, type SkinId } from '../utils/sound';
import './HistoryView.css';

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
}

export interface AppHotkeys {
  recordingHotkey: string;
  modePickerHotkey: string;
}

export interface HotkeysStatus {
  recordingOk: boolean;
  modePickerOk: boolean;
}

export type DictationMode = 'default' | 'code' | 'notes';

export interface KeyTestResult {
  state: 'idle' | 'testing' | 'success' | 'error';
  latencyMs?: number;
  message?: string;
}

export interface SkinPreset {
  id: SkinId;
  name: string;
  icon: string;
  reqWords: number;
  desc: string;
  tags: string[];
}

const SKIN_PRESETS: SkinPreset[] = [
  { id: 'obsidian', name: 'Obsidian Minimal', icon: '🖤', reqWords: 0, desc: 'Sleek frosted acrylic glass with pure white reactive audio wave.', tags: ['Frosted Glass', 'Clean Ping'] },
  { id: 'retro', name: '8-Bit Cyber Arcade', icon: '🕹️', reqWords: 500, desc: 'Phosphor CRT scanlines, neon magenta/cyan border & 8-bit chimes.', tags: ['CRT Scanlines', '8-Bit Audio'] },
  { id: 'sakura', name: 'Sakura Zen', icon: '🌸', reqWords: 1000, desc: 'Rose quartz translucent glass with cherry blossom pink glow & singing bowl bell.', tags: ['Rose Glass', 'Zen Bell'] },
  { id: 'neko', name: 'Neko Pixel Companion', icon: '🐱', reqWords: 2500, desc: 'Animated head-bobbing pixel cat with floating hearts & playful meow chimes.', tags: ['Bobbing Cat', 'Hearts', 'Meow FX'] },
  { id: 'lofi', name: 'Cozy Lo-Fi Cafe', icon: '☕', reqWords: 5000, desc: 'Warm roasted amber tones with steaming coffee & mellow Rhodes piano chords.', tags: ['Steaming Cup', 'Rhodes Audio'] },
  { id: 'cloud', name: 'Dreamy Star Cloud', icon: '☁️', reqWords: 10000, desc: 'A sleepy floating cloud surrounded by spinning twinkle stars & dream harp arpeggios.', tags: ['Floating Cloud', 'Twinkle Stars', 'Dream Harp'] }
];

declare global {
  interface Window {
    electronAPI?: {
      onStartRecording: (callback: () => void) => (() => void);
      onStopRecording: (callback: () => void) => (() => void);
      onCancelRecording: (callback: () => void) => (() => void);
      sendAudio: (base64Data: string, mimeType: string) => void;
      getHistory: () => Promise<TranscriptItem[]>;
      copyText: (text: string) => Promise<boolean>;
      deleteHistoryItem: (id: string) => Promise<TranscriptItem[]>;
      clearHistory: () => Promise<TranscriptItem[]>;
      onHistoryUpdated: (callback: (items: TranscriptItem[]) => void) => (() => void);
      onStateChange: (callback: (state: 'idle' | 'recording' | 'processing' | 'done' | 'error' | 'no-key') => void) => (() => void);
      onErrorMessage: (callback: (message: string) => void) => (() => void);
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
      testApiKey: (provider: 'groq' | 'gemini', key: string) => Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
      getHotkeys: () => Promise<AppHotkeys & HotkeysStatus>;
      saveHotkeys: (hotkeys: Partial<AppHotkeys>) => Promise<AppHotkeys & HotkeysStatus>;
      beginHotkeyCapture: () => void;
      endHotkeyCapture: () => void;
      getDictationMode: () => Promise<DictationMode>;
      setDictationMode: (mode: DictationMode) => Promise<DictationMode>;
      getActiveSkin: () => Promise<SkinId>;
      setActiveSkin: (skin: SkinId) => Promise<SkinId>;
      getUserStats: () => Promise<{ totalWords: number; activeSkin: SkinId }>;
      onSkinChanged: (callback: (skin: SkinId) => void) => (() => void);
      onUserStatsUpdated: (callback: (stats: { totalWords: number; activeSkin: SkinId }) => void) => (() => void);
      onShowModePicker: (callback: (mode: DictationMode) => void) => (() => void);
      selectModeAndRecord: (mode: DictationMode) => void;
      dismissModePicker: () => void;
      getVocabulary: () => Promise<string[]>;
      saveVocabulary: (terms: string[]) => Promise<string[]>;
      minimizeWindow: () => void;
      closeWindow: () => void;
      openExternal: (url: string) => Promise<boolean>;
    };
  }
}

const HISTORY_DISPLAY_LIMIT = 30;

const MODE_OPTIONS: { value: DictationMode; label: string; desc: string }[] = [
  { value: 'default', label: 'Default', desc: 'Auto-punctuation, filler removal & self-corrections' },
  { value: 'code', label: 'Code', desc: 'Converts spoken symbols to syntax & camelCase' },
  { value: 'notes', label: 'Notes', desc: 'Long-form writing with paragraph splits' }
];

const MEDIA_KEY_MAP: Record<string, string> = {
  AudioVolumeUp: 'VolumeUp',
  AudioVolumeDown: 'VolumeDown',
  AudioVolumeMute: 'VolumeMute',
  MediaPlayPause: 'MediaPlayPause',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  MediaStop: 'MediaStop'
};

const MEDIA_KEY_LABELS: Record<string, string> = {
  VolumeUp: 'Vol +',
  VolumeDown: 'Vol −',
  VolumeMute: 'Mute',
  MediaPlayPause: 'Play/Pause',
  MediaNextTrack: 'Next Track',
  MediaPreviousTrack: 'Prev Track',
  MediaStop: 'Stop'
};

const ELECTRON_KEY_MAP: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space',
  '+': 'Plus',
  '/': '/'
};

const DISPLAY_KEY_LABELS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Space: 'Space',
  Plus: '+',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Del',
  Insert: 'Ins',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  '/': '/'
};

type DiffToken = { text: string; type: 'same' | 'removed' | 'added' };

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

function diffWords(rawText: string, formattedText: string): { rawTokens: DiffToken[]; formattedTokens: DiffToken[] } {
  const a = tokenize(rawText);
  const b = tokenize(formattedText);
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const aw = normalize(a[i - 1]);
      const bw = normalize(b[j - 1]);
      if (aw.length === 0 || bw.length === 0) {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      } else if (aw === bw) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const rawTokens: DiffToken[] = [];
  const formattedTokens: DiffToken[] = [];
  let i = n, j = m;
  const rawStack: DiffToken[] = [];
  const formattedStack: DiffToken[] = [];

  while (i > 0 && j > 0) {
    const aw = normalize(a[i - 1]);
    const bw = normalize(b[j - 1]);
    if ((aw.length === 0 || bw.length === 0) && dp[i][j] === dp[i - 1][j]) {
      rawStack.push({ text: a[i - 1], type: aw.length === 0 ? 'same' : 'removed' });
      i--;
    } else if ((aw.length === 0 || bw.length === 0) && dp[i][j] === dp[i][j - 1]) {
      formattedStack.push({ text: b[j - 1], type: bw.length === 0 ? 'same' : 'added' });
      j--;
    } else if (aw === bw) {
      rawStack.push({ text: a[i - 1], type: 'same' });
      formattedStack.push({ text: b[j - 1], type: 'same' });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      rawStack.push({ text: a[i - 1], type: 'removed' });
      i--;
    } else {
      formattedStack.push({ text: b[j - 1], type: 'added' });
      j--;
    }
  }
  while (i > 0) { rawStack.push({ text: a[i - 1], type: 'removed' }); i--; }
  while (j > 0) { formattedStack.push({ text: b[j - 1], type: 'added' }); j--; }

  rawTokens.push(...rawStack.reverse());
  formattedTokens.push(...formattedStack.reverse());

  return { rawTokens, formattedTokens };
}

const HistoryView: React.FC = () => {
  const [history, setHistory] = useState<TranscriptItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pillStatus, setPillStatus] = useState<'idle' | 'recording' | 'processing' | 'done' | 'error' | 'no-key'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [showRawId, setShowRawId] = useState<string | null>(null);
  const [fallbackFlashId, setFallbackFlashId] = useState<string | null>(null);
  const previousHistoryIds = React.useRef<Set<string>>(new Set());

  // Settings panel state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groqApiKey, setGroqApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [groqTestStatus, setGroqTestStatus] = useState<KeyTestResult>({ state: 'idle' });
  const [geminiTestStatus, setGeminiTestStatus] = useState<KeyTestResult>({ state: 'idle' });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [dictationMode, setDictationModeState] = useState<DictationMode>('default');

  // Gamification & Customization
  const [totalWords, setTotalWords] = useState<number>(0);
  const [activeSkin, setActiveSkinState] = useState<SkinId>('obsidian');

  // Custom vocabulary state
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [vocabInput, setVocabInput] = useState('');
  const [vocabSaved, setVocabSaved] = useState(false);

  // Hotkey state — default Ctrl + /
  const [recordingHotkey, setRecordingHotkey] = useState('CommandOrControl+/');
  const [modePickerHotkey, setModePickerHotkey] = useState('CommandOrControl+Shift+M');
  const [capturingField, setCapturingField] = useState<'recording' | 'modePicker' | null>(null);
  const [hotkeyWarning, setHotkeyWarning] = useState('');
  const [hotkeyStatus, setHotkeyStatus] = useState<{ recordingOk: boolean | null; modePickerOk: boolean | null }>({ recordingOk: null, modePickerOk: null });

  // Load initial history and settings on mount
  useEffect(() => {
    const unsubscribes: Array<() => void> = [];

    if (window.electronAPI) {
      window.electronAPI.getHistory().then((items) => {
        if (Array.isArray(items)) {
          previousHistoryIds.current = new Set(items.map((it) => it.id));
          setHistory(items);
        }
      }).catch((e) => console.error('Failed to load history:', e));

      const unsubHistory = window.electronAPI.onHistoryUpdated((items) => {
        if (Array.isArray(items)) {
          const newFallback = items.find(
            (it) => !previousHistoryIds.current.has(it.id) && it.wasFormatted === false
          );
          previousHistoryIds.current = new Set(items.map((it) => it.id));
          setHistory(items);

          if (newFallback) {
            setFallbackFlashId(newFallback.id);
            setTimeout(() => setFallbackFlashId(null), 3000);
          }
        }
      });
      if (unsubHistory) unsubscribes.push(unsubHistory);

      const unsubState = window.electronAPI.onStateChange((state) => {
        setPillStatus(state);
        if (state !== 'error') setErrorMessage('');
      });
      if (unsubState) unsubscribes.push(unsubState);

      const unsubError = window.electronAPI.onErrorMessage?.((message: string) => {
        setErrorMessage(message);
      });
      if (unsubError) unsubscribes.push(unsubError);

      window.electronAPI.getSettings().then((settings) => {
        setGroqApiKey(settings.groqApiKey || '');
        setGeminiApiKey(settings.geminiApiKey || '');
      }).catch((e) => console.error('Failed to load settings:', e));

      window.electronAPI.getDictationMode().then((mode) => {
        setDictationModeState(mode);
      }).catch((e) => console.error('Failed to load dictation mode:', e));

      // User Stats & Skins
      window.electronAPI.getUserStats?.().then((stats) => {
        if (stats) {
          setTotalWords(stats.totalWords || 0);
          if (stats.activeSkin) setActiveSkinState(stats.activeSkin);
        }
      })?.catch((e) => console.error('Failed to load stats:', e));

      const unsubStats = window.electronAPI.onUserStatsUpdated?.((stats) => {
        if (stats) {
          setTotalWords(stats.totalWords || 0);
          if (stats.activeSkin) setActiveSkinState(stats.activeSkin);
        }
      });
      if (unsubStats) unsubscribes.push(unsubStats);

      const unsubSkin = window.electronAPI.onSkinChanged?.((skin) => {
        if (skin) setActiveSkinState(skin);
      });
      if (unsubSkin) unsubscribes.push(unsubSkin);

      window.electronAPI.getVocabulary?.().then((terms) => {
        if (Array.isArray(terms)) setVocabulary(terms);
      })?.catch((e) => console.error('Failed to load vocabulary:', e));

      window.electronAPI.getHotkeys?.().then((hotkeys) => {
        if (hotkeys.recordingHotkey)  setRecordingHotkey(hotkeys.recordingHotkey);
        if (hotkeys.modePickerHotkey) setModePickerHotkey(hotkeys.modePickerHotkey);
        if (typeof hotkeys.recordingOk === 'boolean' || typeof hotkeys.modePickerOk === 'boolean') {
          setHotkeyStatus({
            recordingOk: typeof hotkeys.recordingOk === 'boolean' ? hotkeys.recordingOk : null,
            modePickerOk: typeof hotkeys.modePickerOk === 'boolean' ? hotkeys.modePickerOk : null
          });
        }
      })?.catch((e) => console.error('Failed to load hotkeys:', e));
    }

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, []);

  // Global Escape key to return from settings and ensure capture cleanup
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && settingsOpen && capturingField === null) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [settingsOpen, capturingField]);

  useEffect(() => {
    if (!settingsOpen && capturingField) {
      setCapturingField(null);
      window.electronAPI?.endHotkeyCapture?.();
    }
  }, [settingsOpen, capturingField]);

  const handleCopy = async (id: string, text: string) => {
    if (window.electronAPI) {
      await window.electronAPI.copyText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }

    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 1800);
  };

  const handleDelete = async (id: string) => {
    if (window.electronAPI) {
      const updated = await window.electronAPI.deleteHistoryItem(id);
      if (Array.isArray(updated)) {
        setHistory(updated);
      }
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete all transcription history? This cannot be undone.')) return;
    if (window.electronAPI) {
      const updated = await window.electronAPI.clearHistory();
      if (Array.isArray(updated)) {
        setHistory(updated);
      }
    }
  };

  const handleTestApiKey = async (provider: 'groq' | 'gemini') => {
    const key = provider === 'groq' ? groqApiKey : geminiApiKey;
    const setStatus = provider === 'groq' ? setGroqTestStatus : setGeminiTestStatus;

    if (!key || !key.trim()) {
      setStatus({ state: 'error', message: 'Enter key first' });
      setTimeout(() => setStatus({ state: 'idle' }), 3000);
      return;
    }

    setStatus({ state: 'testing' });
    try {
      if (window.electronAPI?.testApiKey) {
        const result = await window.electronAPI.testApiKey(provider, key);
        if (result.ok) {
          setStatus({ state: 'success', latencyMs: result.latencyMs, message: `${result.latencyMs}ms ✓ Connected` });
          setTimeout(() => setStatus({ state: 'idle' }), 4000);
        } else {
          setStatus({ state: 'error', message: result.error || 'Connection failed' });
          setTimeout(() => setStatus({ state: 'idle' }), 4000);
        }
      } else {
        setStatus({ state: 'error', message: 'API not available' });
        setTimeout(() => setStatus({ state: 'idle' }), 3000);
      }
    } catch (err: any) {
      setStatus({ state: 'error', message: err?.message || 'Test failed' });
      setTimeout(() => setStatus({ state: 'idle' }), 3000);
    }
  };

  const handleSaveSettings = async () => {
    if (window.electronAPI) {
      await window.electronAPI.saveSettings({ groqApiKey, geminiApiKey });
      const saved = await window.electronAPI.saveHotkeys?.({ recordingHotkey, modePickerHotkey });
      if (saved && typeof saved.recordingOk === 'boolean') {
        setHotkeyStatus({ recordingOk: saved.recordingOk, modePickerOk: saved.modePickerOk });
      }
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 1500);
    }
  };

  const handleModeSelect = async (mode: DictationMode) => {
    setDictationModeState(mode);
    if (window.electronAPI) {
      await window.electronAPI.setDictationMode(mode);
    }
  };

  const handleSelectSkin = async (skinId: SkinId, reqWords: number) => {
    if (totalWords < reqWords) {
      return; // Locked
    }
    setActiveSkinState(skinId);
    playEarcon('start', skinId);
    if (window.electronAPI) {
      await window.electronAPI.setActiveSkin(skinId);
    }
  };

  const handleTestSkinChime = (skinId: SkinId, e: React.MouseEvent) => {
    e.stopPropagation();
    playEarcon('start', skinId);
  };

  const handleAddVocabTerm = async () => {
    const raw = vocabInput.trim();
    if (!raw) return;

    const terms = raw
      .split(/[,\n;]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (terms.length === 0) return;

    const existingLower = new Set(vocabulary.map((v) => v.toLowerCase()));
    const toAdd = terms.filter((t) => !existingLower.has(t.toLowerCase()));

    if (toAdd.length === 0) {
      setVocabInput('');
      return;
    }

    const updated = [...vocabulary, ...toAdd].slice(0, 50);
    setVocabulary(updated);
    setVocabInput('');
    if (window.electronAPI) {
      await window.electronAPI.saveVocabulary(updated);
      setVocabSaved(true);
      setTimeout(() => setVocabSaved(false), 1200);
    }
  };

  const handleRemoveVocabTerm = async (term: string) => {
    const updated = vocabulary.filter((v) => v !== term);
    setVocabulary(updated);
    if (window.electronAPI) {
      await window.electronAPI.saveVocabulary(updated);
    }
  };

  const handleClearVocab = async () => {
    if (vocabulary.length === 0) return;
    setVocabulary([]);
    if (window.electronAPI) {
      await window.electronAPI.saveVocabulary([]);
    }
  };

  const buildAccelerator = (e: React.KeyboardEvent): string | null => {
    const IGNORED = ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape', 'ContextMenu'];
    if (IGNORED.includes(e.key)) return null;

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    const mapped = ELECTRON_KEY_MAP[e.key];
    const key = mapped ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    if (!key || !key.trim()) return null;
    parts.push(key);

    return parts.join('+');
  };

  const displayHotkey = (accelerator: string): string => {
    if (!accelerator) return 'Ctrl + /';
    if (MEDIA_KEY_LABELS[accelerator]) return MEDIA_KEY_LABELS[accelerator];
    return accelerator
      .split('+')
      .map((part) => {
        if (part === 'CommandOrControl' || part === 'Command' || part === 'Control') return 'Ctrl';
        return DISPLAY_KEY_LABELS[part] ?? part;
      })
      .join(' + ');
  };

  const DANGEROUS = ['CommandOrControl+C', 'CommandOrControl+V', 'CommandOrControl+Z', 'CommandOrControl+A'];

  const handleHotkeyKeyDown = (e: React.KeyboardEvent, field: 'recording' | 'modePicker') => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setCapturingField(null);
      setHotkeyWarning('');
      window.electronAPI?.endHotkeyCapture?.();
      return;
    }

    if (e.key === 'Fn') {
      setHotkeyWarning('Fn is handled by hardware — try an F-key or media key');
      return;
    }

    const mediaAccel = MEDIA_KEY_MAP[e.key];
    const accelerator = mediaAccel || buildAccelerator(e);
    if (!accelerator) return;

    const isFunctionKey = e.key.match(/^F(?:[1-9]|1[0-9]|2[0-4])$/);
    const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
    if (!hasModifier && !isFunctionKey && !mediaAccel) {
      setHotkeyWarning('Shortcut must include Ctrl, Alt, or Shift — or use an F-key');
      return;
    }

    if (field === 'recording' && accelerator === modePickerHotkey) {
      setHotkeyWarning('That shortcut is already used for Mode Picker');
      return;
    }
    if (field === 'modePicker' && accelerator === recordingHotkey) {
      setHotkeyWarning('That shortcut is already used for Toggle Recording');
      return;
    }

    const warning = DANGEROUS.includes(accelerator)
      ? `⚠ ${displayHotkey(accelerator)} conflicts with system keys (like Cut/Copy/Paste)`
      : '';
    setHotkeyWarning(warning);

    let nextRec = recordingHotkey;
    let nextMode = modePickerHotkey;

    if (field === 'recording') {
      nextRec = accelerator;
      setRecordingHotkey(accelerator);
    }
    if (field === 'modePicker') {
      nextMode = accelerator;
      setModePickerHotkey(accelerator);
    }

    setCapturingField(null);
    window.electronAPI?.endHotkeyCapture?.();

    if (window.electronAPI?.saveHotkeys) {
      window.electronAPI.saveHotkeys({ recordingHotkey: nextRec, modePickerHotkey: nextMode }).then((saved) => {
        if (saved && typeof saved.recordingOk === 'boolean') {
          setHotkeyStatus({ recordingOk: saved.recordingOk, modePickerOk: saved.modePickerOk });
        }
      });
    }
  };

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.toLowerCase();
    return history.filter(item => item.text.toLowerCase().includes(q));
  }, [history, searchQuery]);

  const formatTimestamp = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const hasGroqKey = groqApiKey.trim().length > 0;

  return (
    <div className="history-app-container">
      {/* Titlebar Drag Region & Window Controls */}
      <header className="app-titlebar">
        <div className="app-branding">
          {settingsOpen ? (
            <div className="settings-header-breadcrumb">
              <button
                className="back-btn"
                title="Back to Transcriptions (Esc)"
                onClick={() => setSettingsOpen(false)}
                type="button"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/>
                  <polyline points="12 19 5 12 12 5"/>
                </svg>
                <span>Back</span>
              </button>
              <span className="title-sep">/</span>
              <span className="brand-name">Settings</span>
            </div>
          ) : (
            <span className="brand-name">Wispr Voice</span>
          )}
        </div>

        <div className="window-controls">
          <button
            className={`win-btn settings-btn ${settingsOpen ? 'active' : ''}`}
            title={settingsOpen ? 'Close Settings (Esc)' : 'Open Settings'}
            onClick={() => setSettingsOpen((v) => !v)}
            type="button"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button
            className="win-btn min-btn"
            title="Minimize"
            onClick={() => window.electronAPI?.minimizeWindow()}
            type="button"
          >
            ─
          </button>
          <button
            className="win-btn close-btn"
            title="Close to tray"
            onClick={() => window.electronAPI?.closeWindow()}
            type="button"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Main View: Dedicated Full Settings Page OR Onboarding OR History List */}
      {settingsOpen ? (
        <main className="settings-main-view">
          <div className="settings-content-wrap">
            {/* Header / Intro inside settings */}
            <div className="settings-view-header">
              <h2 className="settings-view-title">Preferences & Customization</h2>
              <p className="settings-view-sub">Configure your AI providers, global hotkeys, custom vocabulary, and unlockable HUD skins.</p>
            </div>

            {/* Customization & HUD Skins Section */}
            <section className="settings-card skin-showcase-card">
              <div className="settings-card-header">
                <div className="skin-header-row">
                  <div>
                    <span className="settings-card-title">🎨 Unlockable HUD Skins</span>
                    <span className="settings-card-desc">Transcribe words to level up and unlock cute animated companions</span>
                  </div>
                  <div className="total-words-badge">
                    ⚡ <b>{totalWords.toLocaleString()}</b> words transcribed
                  </div>
                </div>
              </div>

              <div className="skins-settings-grid">
                {SKIN_PRESETS.map((skin) => {
                  const isUnlocked = totalWords >= skin.reqWords;
                  const isSelected = activeSkin === skin.id;
                  const progressPct = Math.min(100, Math.round((totalWords / (skin.reqWords || 1)) * 100));

                  return (
                    <div
                      key={skin.id}
                      className={`skin-setting-item ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`}
                      onClick={() => handleSelectSkin(skin.id, skin.reqWords)}
                    >
                      <div className="skin-setting-top">
                        <div className="skin-setting-title-wrap">
                          <span className="skin-setting-icon">{skin.icon}</span>
                          <div>
                            <div className="skin-setting-name">{skin.name}</div>
                            <span className={`skin-setting-tag ${isUnlocked ? 'unlocked' : ''}`}>
                              {isUnlocked ? (skin.reqWords === 0 ? 'Default · Unlocked' : `${skin.reqWords.toLocaleString()} Words · Unlocked ✓`) : `🔒 Unlocks at ${skin.reqWords.toLocaleString()} words`}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="skin-chime-btn"
                          onClick={(e) => handleTestSkinChime(skin.id, e)}
                          title="Preview sound chime"
                        >
                          🔊
                        </button>
                      </div>

                      <p className="skin-setting-desc">{skin.desc}</p>

                      {!isUnlocked && (
                        <div className="skin-progress-bar-wrap">
                          <div className="skin-progress-fill" style={{ width: `${progressPct}%` }}></div>
                        </div>
                      )}

                      <div className="skin-setting-footer">
                        <div className="skin-tags-wrap">
                          {skin.tags.map((t) => (
                            <span key={t} className="skin-micro-tag">{t}</span>
                          ))}
                        </div>
                        <span className="skin-select-btn">
                          {isSelected ? 'Active HUD ✓' : isUnlocked ? 'Select Skin' : 'Locked 🔒'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Dictation Mode Section */}
            <section className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-title">Dictation Mode</span>
                <span className="settings-card-desc">Choose how smart formatting polishes your voice</span>
              </div>
              <div className="mode-segmented-grid">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`mode-grid-option ${dictationMode === opt.value ? 'active' : ''}`}
                    onClick={() => handleModeSelect(opt.value)}
                    type="button"
                  >
                    <div className="mode-grid-top">
                      <span className="mode-grid-label">{opt.label}</span>
                      {dictationMode === opt.value && <span className="mode-active-pill">Active</span>}
                    </div>
                    <span className="mode-grid-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* API Keys Section */}
            <section className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-title">API Credentials</span>
                <span className="settings-card-desc">Your keys are stored locally on your device and sent directly to the model provider.</span>
              </div>

              {/* Groq Key Row */}
              <div className="settings-row">
                <div className="settings-label-row">
                  <label className="settings-label" htmlFor="groq-key">
                    Groq API Key <span className="settings-required">(Primary · Fast STT & Formatting)</span>
                  </label>
                  {groqTestStatus.state !== 'idle' && (
                    <span className={`key-test-badge ${groqTestStatus.state}`}>
                      {groqTestStatus.state === 'testing' ? 'Testing connection...' : groqTestStatus.message}
                    </span>
                  )}
                </div>
                <div className="key-input-row">
                  <div className="key-input-wrap">
                    <input
                      id="groq-key"
                      type={showGroqKey ? 'text' : 'password'}
                      className="settings-input"
                      placeholder="gsk_..."
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value)}
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="key-toggle-btn"
                      onClick={() => setShowGroqKey((v) => !v)}
                      title={showGroqKey ? 'Hide key' : 'Show key'}
                    >
                      {showGroqKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="key-test-btn"
                    onClick={() => handleTestApiKey('groq')}
                    disabled={groqTestStatus.state === 'testing'}
                    title="Test Groq connection and check latency"
                  >
                    Test
                  </button>
                </div>
              </div>

              {/* Gemini Key Row */}
              <div className="settings-row" style={{ marginTop: '16px' }}>
                <div className="settings-label-row">
                  <label className="settings-label" htmlFor="gemini-key">
                    Gemini API Key <span className="settings-optional">(Fallback · Google AI Studio)</span>
                  </label>
                  {geminiTestStatus.state !== 'idle' && (
                    <span className={`key-test-badge ${geminiTestStatus.state}`}>
                      {geminiTestStatus.state === 'testing' ? 'Testing connection...' : geminiTestStatus.message}
                    </span>
                  )}
                </div>
                <div className="key-input-row">
                  <div className="key-input-wrap">
                    <input
                      id="gemini-key"
                      type={showGeminiKey ? 'text' : 'password'}
                      className="settings-input"
                      placeholder="AIzaSy..."
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="key-toggle-btn"
                      onClick={() => setShowGeminiKey((v) => !v)}
                      title={showGeminiKey ? 'Hide key' : 'Show key'}
                    >
                      {showGeminiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="key-test-btn"
                    onClick={() => handleTestApiKey('gemini')}
                    disabled={geminiTestStatus.state === 'testing'}
                    title="Test Gemini connection and check latency"
                  >
                    Test
                  </button>
                </div>
              </div>
            </section>

            {/* Hotkeys Section */}
            <section className="settings-card">
              <div className="settings-card-header">
                <span className="settings-card-title">Global Hotkeys</span>
                <span className="settings-card-desc">Press these shortcuts anywhere in Windows to trigger dictation</span>
              </div>

              <div className="hotkey-fields">
                <div className="hotkey-field-group">
                  <div className="hotkey-field-text">
                    <span className="hotkey-field-label">Toggle Recording</span>
                    <span className="hotkey-field-sub">Starts & stops listening</span>
                  </div>
                  <div
                    className={`hotkey-field ${capturingField === 'recording' ? 'capturing' : ''}`}
                    tabIndex={0}
                    onClick={() => {
                      setCapturingField('recording');
                      setHotkeyWarning('');
                      window.electronAPI?.beginHotkeyCapture?.();
                    }}
                    onBlur={() => {
                      if (capturingField === 'recording') {
                        setCapturingField(null);
                        window.electronAPI?.endHotkeyCapture?.();
                      }
                    }}
                    onKeyDown={(e) => capturingField === 'recording' && handleHotkeyKeyDown(e, 'recording')}
                  >
                    {capturingField === 'recording' ? 'Press shortcut keys...' : displayHotkey(recordingHotkey)}
                  </div>
                </div>

                <div className="hotkey-field-group">
                  <div className="hotkey-field-text">
                    <span className="hotkey-field-label">Mode Picker</span>
                    <span className="hotkey-field-sub">Opens the floating mode switch pill</span>
                  </div>
                  <div
                    className={`hotkey-field ${capturingField === 'modePicker' ? 'capturing' : ''}`}
                    tabIndex={0}
                    onClick={() => {
                      setCapturingField('modePicker');
                      setHotkeyWarning('');
                      window.electronAPI?.beginHotkeyCapture?.();
                    }}
                    onBlur={() => {
                      if (capturingField === 'modePicker') {
                        setCapturingField(null);
                        window.electronAPI?.endHotkeyCapture?.();
                      }
                    }}
                    onKeyDown={(e) => capturingField === 'modePicker' && handleHotkeyKeyDown(e, 'modePicker')}
                  >
                    {capturingField === 'modePicker' ? 'Press shortcut keys...' : displayHotkey(modePickerHotkey)}
                  </div>
                </div>
              </div>

              {hotkeyStatus.recordingOk === false && (
                <span className="hotkey-warning">
                  ⚠ {displayHotkey(recordingHotkey)} couldn't be registered — another app is using it.
                </span>
              )}
              {hotkeyStatus.modePickerOk === false && (
                <span className="hotkey-warning">
                  ⚠ {displayHotkey(modePickerHotkey)} couldn't be registered — another app is using it.
                </span>
              )}
              {hotkeyWarning && <span className="hotkey-warning">{hotkeyWarning}</span>}
              <span className="hotkey-hint">
                Default: <b>Ctrl + /</b> for dictation, <b>Ctrl + Shift + M</b> for mode switch.
              </span>
            </section>

            {/* Custom Vocabulary Section */}
            <section className="settings-card">
              <div className="settings-card-header">
                <div className="settings-label-row">
                  <span className="settings-card-title">Custom Vocabulary</span>
                  {vocabulary.length > 0 && (
                    <button type="button" className="vocab-clear-link" onClick={handleClearVocab}>
                      Clear all ({vocabulary.length})
                    </button>
                  )}
                </div>
                <span className="settings-card-desc">
                  Comma-separated names, technical terms, or jargon Whisper should always recognize.
                </span>
              </div>

              <div className="vocab-input-row">
                <input
                  id="vocab-input"
                  type="text"
                  className="settings-input vocab-input"
                  placeholder="e.g. Astra"
                  value={vocabInput}
                  onChange={(e) => setVocabInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddVocabTerm(); }}
                  spellCheck={false}
                />
                <button className="vocab-add-btn" onClick={handleAddVocabTerm} type="button">
                  {vocabSaved ? 'Added ✓' : 'Add Terms'}
                </button>
              </div>

              {vocabulary.length > 0 && (
                <div className="vocab-chip-list">
                  {vocabulary.map((term) => (
                    <span key={term} className="vocab-chip">
                      {term}
                      <button
                        className="vocab-chip-remove"
                        onClick={() => handleRemoveVocabTerm(term)}
                        title={`Remove "${term}"`}
                        type="button"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Settings Footer / Action Bar */}
            <div className="settings-view-footer">
              <div className="settings-footer-left">
                <button
                  type="button"
                  className="settings-back-action-btn"
                  onClick={() => setSettingsOpen(false)}
                >
                  ← Done
                </button>
                <span className="settings-hint">Stored locally on your device only.</span>
              </div>
              <button className="settings-save-btn" onClick={handleSaveSettings} type="button">
                {settingsSaved ? 'Saved ✓' : 'Save Changes'}
              </button>
            </div>
          </div>
        </main>
      ) : !hasGroqKey ? (
        /* First-run onboarding layout */
        <main className="onboarding">
          <header className="onboarding-hero">
            <div className="onboarding-badge-wrap">
              <span className="onboarding-eyebrow">Wispr Voice</span>
            </div>
            <h1 className="onboarding-headline">Speak anywhere.<br/>It types.</h1>
            <p className="onboarding-sub">
              Press your hotkey, talk naturally, and clean, formatted text lands
              instantly in any active application on your PC.
            </p>
          </header>

          <div className="onboarding-cards">
            {/* Card 1 — Dictate */}
            <section className="ob-card">
              <div className="ob-demo demo-dictate" aria-hidden="true">
                <div className="demo-screen">
                  <div className="demo-pill"><i/><i/><i/></div>
                  <div className="demo-line"><span className="demo-caret"/></div>
                </div>
                <div className="demo-base"/>
                <div className="demo-keys">
                  <span className="key">Ctrl</span>
                  <span className="key dim">+</span>
                  <span className="key target">/</span>
                </div>
              </div>
              <h2 className="ob-card-title">Dictate</h2>
              <p className="ob-card-text">
                Press <b>{displayHotkey(recordingHotkey)}</b> anywhere, speak,
                press again. Your words are typed into whatever app you're using.
              </p>
            </section>

            {/* Card 2 — Smart formatting */}
            <section className="ob-card">
              <div className="ob-demo demo-format" aria-hidden="true">
                <p className="demo-raw">
                  <span className="w filler">um</span>{' '}
                  <span className="w">send</span>{' '}
                  <span className="w">it</span>{' '}
                  <span className="w">to</span>{' '}
                  <span className="w wrong">john</span>{' '}
                  <span className="w filler late">oh sorry</span>{' '}
                  <span className="w right">sarah</span>
                </p>
                <p className="demo-clean"><span className="demo-typed">Send it to Sarah.</span></p>
              </div>
              <h2 className="ob-card-title">Smart formatting</h2>
              <p className="ob-card-text">
                Filler words vanish, punctuation appears, self-corrections
                resolve. Three modes: prose, code, and notes.
              </p>
            </section>

            {/* Card 3 — Connect your key */}
            <section className="ob-card">
              <div className="ob-demo demo-connect" aria-hidden="true">
                <div className="demo-chip">gsk_…</div>
                <svg className="demo-arrow" width="46" height="14" viewBox="0 0 46 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="7" x2="38" y2="7"/>
                  <polyline points="32 1 39 7 32 13"/>
                </svg>
                <div className="demo-slot"><span className="demo-dot"/></div>
              </div>
              <h2 className="ob-card-title">Connect your key</h2>
              <p className="ob-card-text">
                Grab a free Groq API key from their console and paste it below.
                It never leaves this device.
              </p>
              <button
                className="ob-getkey"
                onClick={() => window.electronAPI?.openExternal('https://console.groq.com/keys')}
                type="button"
              >
                Get a free API key ↗
              </button>
            </section>
          </div>

          <footer className="onboarding-keybar">
            <div className="keybar-input-wrap">
              <label className="settings-label" htmlFor="ob-key">
                Paste your Groq API key to finish setup{' '}
                <span className="settings-optional">(free · stored locally only)</span>
              </label>
              <div className="keybar-row">
                <input
                  id="ob-key"
                  type="password"
                  className="settings-input keybar-input"
                  placeholder="gsk_..."
                  value={groqApiKey}
                  onChange={(e) => setGroqApiKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSettings(); }}
                  spellCheck={false}
                />
                <button className="settings-save-btn keybar-save" onClick={handleSaveSettings} type="button">
                  {settingsSaved ? 'Saved ✓' : 'Save & Start'}
                </button>
              </div>
            </div>
            <p className="onboarding-note">
              Takes about one minute · The generous free tier covers everyday dictation
              · Optionally add a Gemini fallback key later in Settings.
            </p>
          </footer>
        </main>
      ) : (
        /* Regular Transcriptions History View */
        <main className="history-main-content">
          {/* Top Action & Search Bar */}
          <section className="history-header-actions">
            <div className="search-box">
              <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search previous transcriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button className="clear-search-btn" onClick={() => setSearchQuery('')} type="button">✕</button>
              )}
            </div>

            <div className={`status-indicator-badge ${fallbackFlashId ? 'fallback-flash' : ''} ${pillStatus === 'no-key' ? 'no-key-flash' : ''}`}>
              <span className={`status-dot ${pillStatus}`}></span>
              <span className="status-text">
                {pillStatus === 'error'
                  ? (errorMessage || 'Error')
                  : pillStatus === 'no-key'
                  ? 'Add API key in Settings'
                  : fallbackFlashId
                  ? 'Fell back to raw transcript'
                  : pillStatus === 'recording' ? 'Listening...' : pillStatus === 'processing' ? 'Transcribing...' : 'Ready'}
              </span>
            </div>

            {history.length > 0 && (
              <button className="clear-all-btn" onClick={handleClearAll} title="Clear all history" type="button">
                Clear All
              </button>
            )}
          </section>

          {/* Section Heading */}
          <div className="history-section-header">
            <h2 className="section-title">Recent Transcriptions</h2>
            <span className="history-count-badge">
              {filteredHistory.length} / {HISTORY_DISPLAY_LIMIT}
            </span>
          </div>

          {/* Transcription List Cards */}
          {filteredHistory.length > 0 ? (
            <div className="history-card-list">
              {filteredHistory.map((item, index) => {
                const isCopied = copiedId === item.id;
                const wordCount = item.word_count || item.text.split(/\s+/).filter(Boolean).length;
                const hasRawDiff = !!item.rawText && item.rawText !== item.text;
                const isShowingRaw = showRawId === item.id;
                const displayText = isShowingRaw && item.rawText ? item.rawText : item.text;

                const diff = hasRawDiff && item.rawText ? diffWords(item.rawText, item.text) : null;
                const diffTokens = diff ? (isShowingRaw ? diff.rawTokens : diff.formattedTokens) : null;

                return (
                  <article key={item.id} className="transcript-card">
                    <div className="card-top-row">
                      <div className="card-meta">
                        <span className="item-index">#{index + 1}</span>
                        <span className="item-time" title={new Date(item.created_at).toLocaleString()}>
                          {formatTimestamp(item.created_at)}
                        </span>
                        <span className="meta-divider">•</span>
                        <span className="word-badge">{wordCount} words</span>
                        {item.wasFormatted === false && (
                          <>
                            <span className="meta-divider">•</span>
                            <span className="raw-badge" title="Smart formatting didn't apply to this one — showing the raw transcript">raw</span>
                          </>
                        )}
                      </div>

                      <div className="card-actions">
                        {hasRawDiff && (
                          <button
                            className={`raw-toggle-btn ${isShowingRaw ? 'active' : ''}`}
                            onClick={() => setShowRawId(isShowingRaw ? null : item.id)}
                            title={isShowingRaw ? 'Show formatted version' : 'Show what was actually said (with changes highlighted)'}
                            type="button"
                          >
                            {isShowingRaw ? 'formatted' : 'raw'}
                          </button>
                        )}

                        <button
                          className={`copy-btn ${isCopied ? 'copied' : ''}`}
                          onClick={() => handleCopy(item.id, displayText)}
                          title="Copy to clipboard"
                          type="button"
                        >
                          {isCopied ? (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                              </svg>
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <button
                          className="delete-item-btn"
                          onClick={() => handleDelete(item.id)}
                          title="Delete this transcription"
                          type="button"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="card-body-text">
                      {diffTokens
                        ? diffTokens.map((tok, i) => (
                            <span
                              key={i}
                              className={tok.type === 'removed' ? 'diff-removed' : tok.type === 'added' ? 'diff-added' : undefined}
                            >
                              {tok.text}
                            </span>
                          ))
                        : displayText}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-history-state">
              <div className="empty-icon-wrap">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                </svg>
              </div>
              <h3 className="empty-title">
                {searchQuery ? 'No matching transcriptions found' : 'No transcriptions yet'}
              </h3>
              <p className="empty-desc">
                {searchQuery
                  ? 'Try a different search term.'
                  : `Click into any text field and press ${displayHotkey(recordingHotkey)} to dictate.`}
              </p>
            </div>
          )}
        </main>
      )}

      {/* Minimal hotkey pin — bottom right (only on history view) */}
      {!settingsOpen && hasGroqKey && (
        <div className="hotkey-pin-wrap">
          <div className="hotkey-pin">{displayHotkey(recordingHotkey)}</div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;