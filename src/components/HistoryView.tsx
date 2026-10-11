import React, { useState, useEffect, useMemo, useRef } from 'react';
import { playEarcon, type SkinId } from '../utils/sound';
import appLogo from '../assets/icon.png';
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
  preferredMicId?: string;
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
export type ActiveTab = 'history' | 'vocabulary' | 'themes' | 'settings';

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

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function displayHotkey(accelerator: string): string {
  return accelerator
    .replace('CommandOrControl', 'Ctrl')
    .replace('+', ' + ');
}

interface DiffToken {
  text: string;
  type: 'same' | 'added' | 'removed';
}

function tokenize(text: string): string[] {
  return text.match(/\S+|\s+/g) || [];
}

function diffWords(rawText: string, formattedText: string): { rawTokens: DiffToken[]; formattedTokens: DiffToken[] } {
  const a = tokenize(rawText);
  const b = tokenize(formattedText);
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const rawTokens: DiffToken[] = [];
  const formattedTokens: DiffToken[] = [];
  let i = n;
  let j = m;

  const rawStack: DiffToken[] = [];
  const formattedStack: DiffToken[] = [];

  while (i > 0 && j > 0) {
    if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
      rawStack.push({ text: a[i - 1], type: 'same' });
      formattedStack.push({ text: b[j - 1], type: 'same' });
      i--;
      j--;
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
  const previousHistoryIds = useRef<Set<string>>(new Set());

  // Sidebar navigation state
  const [activeTab, setActiveTab] = useState<ActiveTab>('history');

  // Settings & Credentials state
  const [groqApiKey, setGroqApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [groqTestStatus, setGroqTestStatus] = useState<KeyTestResult>({ state: 'idle' });
  const [geminiTestStatus, setGeminiTestStatus] = useState<KeyTestResult>({ state: 'idle' });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [dictationMode, setDictationModeState] = useState<DictationMode>('default');

  // Microphone & Audio Isolation state
  const [audioDevices, setAudioDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [micTesting, setMicTesting] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [micTestStatus, setMicTestStatus] = useState<string>('');

  // Gamification & Themes (HUD Skins)
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
        if (settings.preferredMicId) {
          setSelectedMicId(settings.preferredMicId);
        }
      }).catch((e) => console.error('Failed to load settings:', e));

      // Enumerate available physical microphones (filtering out loopback/stereo mix)
      const enumerateMics = async () => {
        try {
          let devices = await navigator.mediaDevices.enumerateDevices();
          let inputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
          if (inputs.length > 0 && !inputs.some(d => d.label)) {
            try {
              const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
              tempStream.getTracks().forEach(t => t.stop());
              devices = await navigator.mediaDevices.enumerateDevices();
              inputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
            } catch {}
          }
          const loopbackPattern = /stereo.?mix|what.?u.?hear|loopback|wave.?out|mono.?mix|system.?audio|desktop.?audio|virtual.?cable|cable.?output/i;
          const clean = inputs
            .filter(d => !d.label || !loopbackPattern.test(d.label))
            .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone [${d.deviceId.slice(0, 6)}]` }));
          setAudioDevices(clean);
        } catch (err) {
          console.warn('Microphone device enumeration notice:', err);
        }
      };
      enumerateMics();

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

  const handleCopy = async (id: string, text: string) => {
    if (window.electronAPI) {
      const ok = await window.electronAPI.copyText(text);
      if (ok) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (window.electronAPI) {
      const updated = await window.electronAPI.deleteHistoryItem(id);
      if (Array.isArray(updated)) setHistory(updated);
    }
  };

  const handleClearAll = async () => {
    if (window.electronAPI) {
      const updated = await window.electronAPI.clearHistory();
      if (Array.isArray(updated)) setHistory(updated);
    }
  };

  const handleSaveSettings = async () => {
    if (window.electronAPI) {
      await window.electronAPI.saveSettings({
        groqApiKey: groqApiKey.trim(),
        geminiApiKey: geminiApiKey.trim(),
        preferredMicId: selectedMicId
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    }
  };

  const handleTestMic = async () => {
    if (micTesting) return;
    setMicTesting(true);
    setMicTestStatus('Listening to microphone...');

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          googEchoCancellation: true,
          googExperimentalEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
          googAudioMirroring: false,
          voiceIsolation: true,
        } as any
      });

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AudioContextClass();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let maxLevel = 0;
      const startTime = Date.now();

      const poll = () => {
        if (Date.now() - startTime > 2500) {
          if (stream) stream.getTracks().forEach(t => t.stop());
          if (ctx) ctx.close();
          setMicTesting(false);
          if (maxLevel > 15) {
            setMicTestStatus(`Voice detected (peak: ${Math.min(100, Math.round(maxLevel * 1.5))}%) ✓`);
          } else {
            setMicTestStatus('Mic active. Speak to test vocal response.');
          }
          setTimeout(() => setMicTestStatus(''), 4000);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / (dataArray.length || 1);
        if (avg > maxLevel) maxLevel = avg;
        setMicLevel(Math.min(100, Math.round(avg * 1.5)));
        requestAnimationFrame(poll);
      };

      poll();
    } catch (e: any) {
      if (stream) (stream as MediaStream).getTracks().forEach(t => t.stop());
      if (ctx) (ctx as AudioContext).close();
      setMicTesting(false);
      setMicTestStatus('Could not access microphone');
      setTimeout(() => setMicTestStatus(''), 3000);
    }
  };

  const handleTestGroqKey = async () => {
    if (!window.electronAPI) return;
    setGroqTestStatus({ state: 'testing' });
    try {
      const res = await window.electronAPI.testApiKey('groq', groqApiKey);
      if (res.ok) {
        setGroqTestStatus({ state: 'success', latencyMs: res.latencyMs, message: `Connected (${res.latencyMs}ms)` });
      } else {
        setGroqTestStatus({ state: 'error', message: res.error || 'Connection failed' });
      }
    } catch (err: any) {
      setGroqTestStatus({ state: 'error', message: err?.message || 'Error' });
    }
  };

  const handleTestGeminiKey = async () => {
    if (!window.electronAPI) return;
    setGeminiTestStatus({ state: 'testing' });
    try {
      const res = await window.electronAPI.testApiKey('gemini', geminiApiKey);
      if (res.ok) {
        setGeminiTestStatus({ state: 'success', latencyMs: res.latencyMs, message: `Connected (${res.latencyMs}ms)` });
      } else {
        setGeminiTestStatus({ state: 'error', message: res.error || 'Connection failed' });
      }
    } catch (err: any) {
      setGeminiTestStatus({ state: 'error', message: err?.message || 'Error' });
    }
  };

  const handleModeSelect = async (mode: DictationMode) => {
    setDictationModeState(mode);
    if (window.electronAPI?.setDictationMode) {
      await window.electronAPI.setDictationMode(mode);
    }
  };

  const handleSelectSkin = async (skinId: SkinId, reqWords: number) => {
    if (totalWords < reqWords) return;
    setActiveSkinState(skinId);
    playEarcon('paste', skinId);
    if (window.electronAPI?.setActiveSkin) {
      await window.electronAPI.setActiveSkin(skinId);
    }
  };

  const handleTestSkinChime = (skinId: SkinId, e: React.MouseEvent) => {
    e.stopPropagation();
    playEarcon('start', skinId);
    setTimeout(() => playEarcon('done', skinId), 350);
  };

  const handleAddVocabTerm = async () => {
    const raw = vocabInput.trim();
    if (!raw) return;

    const tokens = raw
      .split(/[,;\n]+/)
      .map((t) => t.trim().replace(/\s+/g, ' '))
      .filter((t) => t.length > 0 && t.length <= 40);

    if (tokens.length === 0) return;

    const existingLower = new Set(vocabulary.map((v) => v.toLowerCase()));
    const toAdd: string[] = [];
    for (const tok of tokens) {
      if (!existingLower.has(tok.toLowerCase())) {
        existingLower.add(tok.toLowerCase());
        toAdd.push(tok);
      }
    }

    if (toAdd.length === 0) {
      setVocabInput('');
      return;
    }

    const updated = [...vocabulary, ...toAdd].slice(0, 50);
    setVocabulary(updated);
    setVocabInput('');
    setVocabSaved(true);
    setTimeout(() => setVocabSaved(false), 2000);

    if (window.electronAPI?.saveVocabulary) {
      await window.electronAPI.saveVocabulary(updated);
    }
  };

  const handleRemoveVocabTerm = async (term: string) => {
    const updated = vocabulary.filter((v) => v !== term);
    setVocabulary(updated);
    if (window.electronAPI?.saveVocabulary) {
      await window.electronAPI.saveVocabulary(updated);
    }
  };

  const handleClearVocab = async () => {
    if (vocabulary.length === 0) return;
    setVocabulary([]);
    if (window.electronAPI?.saveVocabulary) {
      await window.electronAPI.saveVocabulary([]);
    }
  };

  const handleHotkeyKeyDown = async (e: React.KeyboardEvent, field: 'recording' | 'modePicker') => {
    if (capturingField !== field) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      window.electronAPI?.endHotkeyCapture();
      setCapturingField(null);
      setHotkeyWarning('');
      return;
    }

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    const key = e.key;
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return;

    let mainKey = key.toUpperCase();
    if (key === ' ') mainKey = 'Space';
    else if (key === '/') mainKey = '/';
    else if (key.length === 1) mainKey = key.toUpperCase();

    parts.push(mainKey);
    const newAccelerator = parts.join('+');

    window.electronAPI?.endHotkeyCapture();
    setCapturingField(null);

    if (window.electronAPI?.saveHotkeys) {
      const payload = field === 'recording'
        ? { recordingHotkey: newAccelerator }
        : { modePickerHotkey: newAccelerator };

      const res = await window.electronAPI.saveHotkeys(payload);
      if (field === 'recording') {
        setRecordingHotkey(res.recordingHotkey);
        setHotkeyStatus(prev => ({ ...prev, recordingOk: res.recordingOk }));
        if (!res.recordingOk) {
          setHotkeyWarning(`Could not register ${displayHotkey(newAccelerator)} — shortcut may conflict with another app.`);
        } else {
          setHotkeyWarning('');
        }
      } else {
        setModePickerHotkey(res.modePickerHotkey);
        setHotkeyStatus(prev => ({ ...prev, modePickerOk: res.modePickerOk }));
        if (!res.modePickerOk) {
          setHotkeyWarning(`Could not register ${displayHotkey(newAccelerator)} — shortcut may conflict with another app.`);
        } else {
          setHotkeyWarning('');
        }
      }
    }
  };

  const startCapture = (field: 'recording' | 'modePicker') => {
    setCapturingField(field);
    setHotkeyWarning('');
    window.electronAPI?.beginHotkeyCapture();
  };

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.toLowerCase();
    return history.filter(
      (item) =>
        item.text.toLowerCase().includes(q) ||
        (item.rawText && item.rawText.toLowerCase().includes(q))
    );
  }, [history, searchQuery]);

  const hasGroqKey = Boolean(groqApiKey && groqApiKey.trim().length > 0);

  return (
    <div className="history-app-container">
      {/* 1. Left Sidebar Navigation */}
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img src={appLogo} alt="Wispr Voice" className="sidebar-app-logo" />
            <div className="sidebar-brand-text">
              <span className="sidebar-title">Wispr Voice</span>
              <span className="sidebar-version">v0.1.0</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <span className="nav-label">Transcription History</span>
            {history.length > 0 && <span className="nav-badge">{history.length}</span>}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'vocabulary' ? 'active' : ''}`}
            onClick={() => setActiveTab('vocabulary')}
          >
            <span className="nav-label">Custom Vocabulary</span>
            {vocabulary.length > 0 && <span className="nav-badge">{vocabulary.length}</span>}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'themes' ? 'active' : ''}`}
            onClick={() => setActiveTab('themes')}
          >
            <span className="nav-label">Themes</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="nav-label">Settings</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-stat-card">
            <div className="stat-label">Words Transcribed</div>
            <div className="stat-value">⚡ {totalWords.toLocaleString()}</div>
          </div>
          <div className="sidebar-hint">
            Press <b>{displayHotkey(recordingHotkey)}</b> to dictate
          </div>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <div className="app-main-area">
        {/* Titlebar across top */}
        <header className="app-titlebar">
          <div className="titlebar-title">
            {activeTab === 'history' && 'Transcription History'}
            {activeTab === 'vocabulary' && 'Custom Vocabulary'}
            {activeTab === 'themes' && 'HUD Pill Themes'}
            {activeTab === 'settings' && 'Settings & Preferences'}
          </div>
        </header>

        {/* Scrollable View Content */}
        <div className="main-content-scroll">
          {/* TAB 1: TRANSCRIPTION HISTORY */}
          {activeTab === 'history' && (
            <main className="history-main-content">
              {!hasGroqKey ? (
                /* First-run banner when no key configured */
                <div className="no-key-banner">
                  <div className="no-key-banner-text">
                    <h3>Get started with Wispr Voice</h3>
                    <p>Paste your free Groq API key in Settings to begin voice dictation.</p>
                  </div>
                  <button
                    type="button"
                    className="primary-action-btn"
                    onClick={() => setActiveTab('settings')}
                  >
                    Open Settings →
                  </button>
                </div>
              ) : null}

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
                                title={isShowingRaw ? 'Show formatted version' : 'Show what was actually said'}
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

          {/* TAB 2: CUSTOM VOCABULARY */}
          {activeTab === 'vocabulary' && (
            <main className="tab-main-content">
              <div className="tab-header">
                <h2 className="tab-title">Custom Vocabulary</h2>
                <p className="tab-desc">
                  Add custom names, technical acronyms, or jargon Whisper should always recognize without fail.
                </p>
              </div>

              <section className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-label-row">
                    <span className="settings-card-title">Recognized Terms</span>
                    {vocabulary.length > 0 && (
                      <button type="button" className="vocab-clear-link" onClick={handleClearVocab}>
                        Clear all ({vocabulary.length})
                      </button>
                    )}
                  </div>
                  <span className="settings-card-desc">
                    Type a word or comma-separated terms. Starts as a clean input box.
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
                  <button className="primary-action-btn vocab-add-btn" onClick={handleAddVocabTerm} type="button">
                    {vocabSaved ? 'Added ✓' : 'Add Terms'}
                  </button>
                </div>

                {vocabulary.length > 0 ? (
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
                ) : (
                  <div className="empty-vocab-hint">
                    No custom terms added yet. Type a term above (e.g. <b>Astra</b>) to boost recognition accuracy.
                  </div>
                )}
              </section>

              <section className="settings-card info-card">
                <div className="info-card-header">
                  <span className="info-icon">💡</span>
                  <span className="settings-card-title">How Custom Vocabulary Works</span>
                </div>
                <p className="info-text">
                  Whisper accepts an initial prompt parameter biased toward specialized terms. Your terms are sent directly as a vocabulary hint to the transcription model, ensuring accurate spelling of unique proper nouns without inventing phantom sentences.
                </p>
              </section>
            </main>
          )}

          {/* TAB 3: THEMES (HUD PILL STYLES) */}
          {activeTab === 'themes' && (
            <main className="tab-main-content">
              <div className="tab-header">
                <div className="tab-header-row">
                  <div>
                    <h2 className="tab-title">HUD Pill Themes</h2>
                    <p className="tab-desc">
                      Different visual styles and synthetic audio earcons for your floating bottom pill.
                    </p>
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
                              {isUnlocked
                                ? (skin.reqWords === 0 ? 'Default · Unlocked' : `${skin.reqWords.toLocaleString()} Words · Unlocked ✓`)
                                : `🔒 Unlocks at ${skin.reqWords.toLocaleString()} words`}
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
                        <span className={`skin-select-btn ${isSelected ? 'selected' : ''}`}>
                          {isSelected ? 'Active HUD ✓' : isUnlocked ? 'Select Theme' : 'Locked 🔒'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </main>
          )}

          {/* TAB 4: SETTINGS (EXCLUDES THEMES) */}
          {activeTab === 'settings' && (
            <main className="tab-main-content">
              <div className="tab-header">
                <h2 className="tab-title">Settings & Preferences</h2>
                <p className="tab-desc">
                  Configure your AI providers, global hotkeys, and dictation mode.
                </p>
              </div>

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

              {/* Microphone & Voice Isolation Section */}
              <section className="settings-card">
                <div className="settings-card-header">
                  <span className="settings-card-title">Microphone & Voice Isolation</span>
                  <span className="settings-card-desc">
                    Captures only your voice. System sounds, YouTube playback, and browser audio are filtered out.
                  </span>
                </div>

                <div className="settings-row">
                  <div className="settings-label-row">
                    <label className="settings-label" htmlFor="mic-select">
                      Active Audio Input Device
                    </label>
                    {micTestStatus && (
                      <span className={`key-test-badge ${micTesting ? 'testing' : micTestStatus.includes('✓') ? 'success' : ''}`}>
                        {micTestStatus}
                      </span>
                    )}
                  </div>

                  <div className="mic-input-row">
                    <div className="key-input-wrap">
                      <select
                        id="mic-select"
                        className="settings-input mic-select-dropdown"
                        value={selectedMicId}
                        onChange={(e) => {
                          const newId = e.target.value;
                          setSelectedMicId(newId);
                          if (window.electronAPI?.saveSettings) {
                            window.electronAPI.saveSettings({
                              groqApiKey: groqApiKey.trim(),
                              geminiApiKey: geminiApiKey.trim(),
                              preferredMicId: newId
                            });
                          }
                        }}
                      >
                        <option value="">Default Microphone (Auto-Isolated)</option>
                        {audioDevices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      className={`key-test-btn ${micTesting ? 'testing' : ''}`}
                      onClick={handleTestMic}
                      disabled={micTesting}
                    >
                      {micTesting ? `Testing (${micLevel}%)` : 'Test Mic'}
                    </button>
                  </div>

                  <div className="mic-features-row">
                    <span className="mic-feature-tag">Acoustic Echo Cancellation (AEC)</span>
                    <span className="mic-feature-tag">140Hz High-Pass Rumble Filter</span>
                    <span className="mic-feature-tag">Vocal Formant Booster</span>
                    <span className="mic-feature-tag">Speaker Bleed Gate</span>
                  </div>
                  <span className="settings-hint">
                    Loopback and stereo-mix devices are automatically blocked to prevent video or game audio from mixing into dictation.
                  </span>
                </div>
              </section>

              {/* API Credentials Section */}
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
                      >
                        {showGroqKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="key-test-btn"
                      onClick={handleTestGroqKey}
                      disabled={groqTestStatus.state === 'testing' || !groqApiKey.trim()}
                    >
                      Test Key
                    </button>
                  </div>
                  <span className="settings-hint">
                    Get a free key at <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI?.openExternal('https://console.groq.com/keys'); }}>console.groq.com/keys</a>
                  </span>
                </div>

                {/* Gemini Key Row */}
                <div className="settings-row">
                  <div className="settings-label-row">
                    <label className="settings-label" htmlFor="gemini-key">
                      Google Gemini API Key <span className="settings-optional">(Optional Fallback)</span>
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
                      >
                        {showGeminiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="key-test-btn"
                      onClick={handleTestGeminiKey}
                      disabled={geminiTestStatus.state === 'testing' || !geminiApiKey.trim()}
                    >
                      Test Key
                    </button>
                  </div>
                  <span className="settings-hint">
                    Get a free key at <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI?.openExternal('https://aistudio.google.com'); }}>Google AI Studio</a>
                  </span>
                </div>
              </section>

              {/* Hotkeys Section */}
              <section className="settings-card">
                <div className="settings-card-header">
                  <span className="settings-card-title">Global Shortcuts</span>
                  <span className="settings-card-desc">Click any shortcut field below and press your preferred key combination.</span>
                </div>

                <div className="hotkey-fields">
                  <div className="hotkey-field-group">
                    <div className="hotkey-field-text">
                      <span className="hotkey-field-label">Dictation Toggle</span>
                      <span className="hotkey-field-sub">Press to start talking, press again to stop & paste</span>
                    </div>
                    <div
                      className={`hotkey-field ${capturingField === 'recording' ? 'capturing' : ''} ${hotkeyStatus.recordingOk === false ? 'error' : ''}`}
                      onClick={() => startCapture('recording')}
                      onKeyDown={(e) => handleHotkeyKeyDown(e, 'recording')}
                      tabIndex={0}
                      title="Click to record shortcut"
                    >
                      {capturingField === 'recording' ? 'Press keys...' : displayHotkey(recordingHotkey)}
                    </div>
                  </div>

                  <div className="hotkey-field-group">
                    <div className="hotkey-field-text">
                      <span className="hotkey-field-label">Dictation Mode Switcher</span>
                      <span className="hotkey-field-sub">Quickly switch between Default, Code, and Notes</span>
                    </div>
                    <div
                      className={`hotkey-field ${capturingField === 'modePicker' ? 'capturing' : ''} ${hotkeyStatus.modePickerOk === false ? 'error' : ''}`}
                      onClick={() => startCapture('modePicker')}
                      onKeyDown={(e) => handleHotkeyKeyDown(e, 'modePicker')}
                      tabIndex={0}
                      title="Click to record shortcut"
                    >
                      {capturingField === 'modePicker' ? 'Press keys...' : displayHotkey(modePickerHotkey)}
                    </div>
                  </div>
                </div>

                {hotkeyWarning && <span className="hotkey-warning">{hotkeyWarning}</span>}
                <span className="hotkey-hint">
                  Default: <b>Ctrl + /</b> for dictation, <b>Ctrl + Shift + M</b> for mode switch.
                </span>
              </section>

              {/* Save Footer */}
              <div className="settings-view-footer">
                <span className="settings-hint">Stored locally on your device only.</span>
                <button className="primary-action-btn" onClick={handleSaveSettings} type="button">
                  {settingsSaved ? 'Saved ✓' : 'Save Changes'}
                </button>
              </div>
            </main>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryView;
