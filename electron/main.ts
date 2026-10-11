import { app, BrowserWindow, globalShortcut, ipcMain, session, screen, Tray, Menu, nativeImage, clipboard, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import Store from 'electron-store';
import { transcribeWithGroq } from './groqClient';
import { smartFormat, DictationMode } from './smartFormatClient';
import { transcribeAudio, prewarmConnection } from './geminiClient';
import { pasteText } from './pasteInjector';
import { insertTranscript, getTranscripts, deleteTranscript, clearTranscripts, getTotalWords } from './db';

const HISTORY_LIMIT = 30;
const VALID_MODES: DictationMode[] = ['default', 'code', 'notes'];
const MAX_VOCAB_TERMS = 50;
const MAX_AUDIO_BASE64_LENGTH = 32 * 1024 * 1024;

// Configure Chromium flags for maximum WebRTC audio isolation and hardware APM
app.commandLine.appendSwitch('enable-features', 'WebRtcApmInAudioService');
app.commandLine.appendSwitch('enable-webrtc-apm-in-audio-service');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Request single instance lock. If another copy is already running, hand
// off to it and exit immediately — continuing init here causes duplicate
// windows/timers and slow, confusing launches.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

const store = new Store({ clearInvalidConfig: true });

process.on('uncaughtException', (err) => {
  log('[Main] Uncaught Exception:', err?.stack || err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  log('[Main] Unhandled Rejection:', reason);
});

function getActiveMode(): DictationMode {
  const stored = store.get('dictationMode') as string | undefined;
  return (VALID_MODES as string[]).includes(stored || '') ? (stored as DictationMode) : 'default';
}

function getVocabularyList(): string[] {
  const stored = store.get('customVocabulary') as string[] | undefined;
  return Array.isArray(stored) ? stored : [];
}

// Whisper's "prompt" parameter accepts a short piece of text used only to
// bias recognition toward likely vocabulary and context. Conditioning on
// foreground voice dictation helps Whisper ignore background audio/video bleed.
function buildVocabularyHint(): string | undefined {
  const terms = getVocabularyList();
  // Always include a foreground-voice context prefix so Whisper attends to
  // the speaker's voice rather than background media. This is vocabulary-
  // style conditioning (prior spoken text tokens), NOT a system instruction.
  const contextPrefix = 'Voice dictation: transcribe only the foreground speaker directly addressing the microphone; ignore background audio, music or video playback.';
  if (terms.length === 0) return contextPrefix;
  return `${contextPrefix} Recognized vocabulary: ${terms.slice(0, MAX_VOCAB_TERMS).join(', ')}`;
}

// File logger for operational diagnostics. Never write dictated content or API
// keys here: logs can outlive history deletion and be readable by local users.
const logFile = path.join(app.getPath('userData'), 'wispr-runtime.log');
const MAX_LOG_BYTES = 512 * 1024;
function log(...args: any[]) {
  const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`;
  console.log(...args);
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size >= MAX_LOG_BYTES) {
      try { fs.unlinkSync(`${logFile}.old`); } catch {}
      fs.renameSync(logFile, `${logFile}.old`);
    }
    fs.appendFileSync(logFile, line);
  } catch {}
}

log('Starting Wispr Voice with faithful dictation cleanup...');

// Translates raw network/API errors into short, human-friendly messages
// that can be shown directly in the Pill and status badge.
function describeError(err: any): string {
  const msg = String(err?.message || err || '');
  if (/401|invalid[ _-]?api[ _-]?key|unauthorized|invalid_api_key/i.test(msg)) return 'Invalid or expired API key';
  if (/429|rate[ _-]?limit/i.test(msg)) return 'Rate limit hit — try again in a minute';
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|getaddrinfo|network/i.test(msg)) return 'No internet connection';
  if (/recording.*(too large|exceeds)|upload limit/i.test(msg)) return 'Recording is too large — try a shorter dictation';
  if (/timed?[ _-]?out|timeout/i.test(msg)) return 'Transcription took too long';
  if (/missingapikey/i.test(err?.name || '')) return 'Add your API key in Settings';
  return 'Transcription failed';
}

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');

let mainWindow: BrowserWindow | null = null;
let pillWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isRecordingState = false;
let isProcessing = false;
let lastHotkeyTime = 0;
let watchdogTimer: NodeJS.Timeout | null = null;
// Incremented on reset so a timed-out request can never paste a late result.
let activeTranscriptionId = 0;
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

// Pill window default (small/idle) vs expanded (mode picker) dimensions.
// The picker needs more width to fit three tappable mode options.
const PILL_IDLE_WIDTH = 240;
const PILL_IDLE_HEIGHT = 64;
const PILL_PICKER_WIDTH = 340;
const PILL_PICKER_HEIGHT = 64;

function resetStateSafely() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  isRecordingState = false;
  isProcessing = false;
  activeTranscriptionId += 1;
  try {
    pillWindow?.webContents.send('cancel-recording-cmd');
    pillWindow?.webContents.send('state-change', 'idle');
    mainWindow?.webContents.send('state-change', 'idle');
    pillWindow?.hide();
  } catch {}
}

function createMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  log('Creating Main Application Window (Taskbar Visible)...');

  mainWindow = new BrowserWindow({
    width: 940,
    height: 680,
    minWidth: 760,
    minHeight: 520,
    frame: false,
    transparent: false,
    backgroundColor: '#16181d',
    skipTaskbar: false,
    show: true,
    title: 'Wispr Voice',
    icon: path.join(process.env.VITE_PUBLIC, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Prevents Chromium from throttling background events
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(console\.groq\.com|aistudio\.google\.com|github\.com)(?:\/|$)/.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(`${VITE_DEV_SERVER_URL}#/history`);
  } else {
    const indexPath = path.join(process.env.DIST, 'index.html');
    mainWindow.loadFile(indexPath, { hash: '/history' });
  }

  mainWindow.show();
  mainWindow.focus();

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('close', (event) => {
    // Hide to background on close so hotkeys stay active
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function pillAnchorPosition(width: number, height: number) {
  const cursorPoint = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(cursorPoint) || screen.getPrimaryDisplay();
  const { width: screenW, height: screenH, x: displayX, y: displayY } = currentDisplay.workArea;
  return {
    x: displayX + screenW - width - 24,
    y: displayY + screenH - height - 24
  };
}

function createPillWindow() {
  const { x: posX, y: posY } = pillAnchorPosition(PILL_IDLE_WIDTH, PILL_IDLE_HEIGHT);

  log('Creating Pill window at coordinates:', { posX, posY, PILL_IDLE_WIDTH, PILL_IDLE_HEIGHT });

  pillWindow = new BrowserWindow({
    width: PILL_IDLE_WIDTH,
    height: PILL_IDLE_HEIGHT,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    hasShadow: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  pillWindow.setAlwaysOnTop(true, 'screen-saver');

  pillWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (VITE_DEV_SERVER_URL) {
    pillWindow.loadURL(`${VITE_DEV_SERVER_URL}#/pill`);
  } else {
    const indexPath = path.join(process.env.DIST, 'index.html');
    pillWindow.loadFile(indexPath, { hash: '/pill' });
  }

  pillWindow.on('closed', () => {
    pillWindow = null;
  });
}

function toggleRecording() {
  const now = Date.now();
  if (now - lastHotkeyTime < 300) {
    log('Ignoring hotkey bounce (<300ms)');
    return;
  }
  lastHotkeyTime = now;

  if (isProcessing) {
    log('Ignoring toggle: transcription is currently in-flight');
    return;
  }

  log('Triggered toggleRecording. Current state:', isRecordingState);
  if (!pillWindow) {
    createPillWindow();
  }

  if (!isRecordingState) {
    isRecordingState = true;
    // Ensure pill is back at its normal idle size/position before recording
    // (in case the mode picker was left expanded from a previous session).
    const { x, y } = pillAnchorPosition(PILL_IDLE_WIDTH, PILL_IDLE_HEIGHT);
    pillWindow?.setBounds({ x, y, width: PILL_IDLE_WIDTH, height: PILL_IDLE_HEIGHT });
    pillWindow?.show();
    pillWindow?.setAlwaysOnTop(true, 'screen-saver');
    pillWindow?.webContents.send('start-recording-cmd');
    mainWindow?.webContents.send('state-change', 'recording');
  } else {
    isRecordingState = false;
    pillWindow?.webContents.send('stop-recording-cmd');
    mainWindow?.webContents.send('state-change', 'processing');
  }
}

// Shows the pill in its expanded "mode picker" shape. Does NOT start
// recording — that only happens once the user picks a mode (or the picker
// times out and closes with no action, per the agreed behavior).
function showModePicker() {
  const now = Date.now();
  if (now - lastHotkeyTime < 300) {
    log('Ignoring mode-picker hotkey bounce (<300ms)');
    return;
  }
  lastHotkeyTime = now;

  if (isProcessing || isRecordingState) {
    log('Ignoring mode-picker: recording or processing already in progress');
    return;
  }

  if (!pillWindow) {
    createPillWindow();
  }

  const { x, y } = pillAnchorPosition(PILL_PICKER_WIDTH, PILL_PICKER_HEIGHT);
  pillWindow?.setBounds({ x, y, width: PILL_PICKER_WIDTH, height: PILL_PICKER_HEIGHT });
  pillWindow?.show();
  pillWindow?.setAlwaysOnTop(true, 'screen-saver');
  pillWindow?.webContents.send('show-mode-picker', getActiveMode());
}

// Second instance triggers main window focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
});

// App startup
(app as any).isQuitting = false;

const DEFAULT_RECORDING_HOTKEY = 'CommandOrControl+/';
const DEFAULT_MODE_PICKER_HOTKEY = 'CommandOrControl+Shift+M';

// Reads the user's saved hotkeys (or falls back to defaults) and registers
// them as global shortcuts. Called once on startup and again immediately
// whenever the user saves new hotkeys — no restart required. Records whether
// each registration actually succeeded so the UI can warn when another
// application is already holding a shortcut.
let hotkeyStatus = { recordingOk: false, modePickerOk: false };

function registerHotkeys() {
  globalShortcut.unregisterAll();

  const recordingHotkey = (store.get('recordingHotkey') as string | undefined) || DEFAULT_RECORDING_HOTKEY;
  const modePickerHotkey = (store.get('modePickerHotkey') as string | undefined) || DEFAULT_MODE_PICKER_HOTKEY;

  const recOk = globalShortcut.register(recordingHotkey, () => {
    log(`Hotkey ${recordingHotkey} triggered (toggle recording)`);
    toggleRecording();
  });
  log(`Shortcut ${recordingHotkey} (recording) registration result:`, recOk);
  if (!recOk) log(`[Main] WARNING: "${recordingHotkey}" could not be registered — another application is probably using it.`);

  const modeOk = globalShortcut.register(modePickerHotkey, () => {
    log(`Hotkey ${modePickerHotkey} triggered (mode picker)`);
    showModePicker();
  });
  log(`Shortcut ${modePickerHotkey} (mode picker) registration result:`, modeOk);
  if (!modeOk) log(`[Main] WARNING: "${modePickerHotkey}" could not be registered — another application is probably using it.`);

  hotkeyStatus = { recordingOk: recOk, modePickerOk: modeOk };
}

app.whenReady().then(() => {
  // Fix: prewarm Gemini only when the Gemini key actually exists
  const initialGeminiKey = store.get('apiKey') as string | undefined;
  if (initialGeminiKey && initialGeminiKey.trim().length > 0) {
    prewarmConnection(initialGeminiKey);
  }

  // Periodic keep-alive heartbeat every 2 minutes
  setInterval(() => {
    const geminiKey = store.get('apiKey') as string | undefined;
    if (geminiKey && geminiKey.trim().length > 0) {
      prewarmConnection(geminiKey);
    }
  }, 120000);

  createMainWindow();
  createPillWindow();

  // Create System Tray Icon — prefer the real app icon; fall back to the
  // embedded placeholder if the .ico file is somehow missing.
  try {
    let icon = nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC, 'icon.ico'));
    if (icon.isEmpty()) {
      icon = nativeImage.createFromBuffer(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAzSURBVDhPY/wPBAwUACYoTSwYNYBRgxEeAAYGBkY0zX9gQDaAGkA0wUfDYNRgROIBAP/vBv52rP2WAAAAAElFTkSuQmCC',
          'base64'
        )
      );
    }
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open History & Settings', click: () => createMainWindow() },
      { label: 'Start / Stop Dictation', click: () => toggleRecording() },
      { label: 'Switch Dictation Mode', click: () => showModePicker() },
      { type: 'separator' },
      {
        label: 'Quit Wispr Voice',
        click: () => {
          (app as any).isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setToolTip('Wispr Voice — customize your hotkey in Settings');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => createMainWindow());
    tray.on('double-click', () => createMainWindow());
  } catch (err) {
    log('Tray creation notice:', err);
  }

  // Register hotkeys from user settings (or defaults).
  // registerHotkeys() is also called again after the user saves new hotkeys
  // via the 'save-hotkeys' IPC handler, so changes take effect immediately.
  registerHotkeys();

  // Only the app's own renderer may request microphone access.
  const isTrustedRenderer = (webContents: Electron.WebContents) => {
    const url = webContents.getURL();
    return VITE_DEV_SERVER_URL ? url.startsWith(VITE_DEV_SERVER_URL) : url.startsWith('file:');
  };
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media' && isTrustedRenderer(webContents);
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media' && isTrustedRenderer(webContents));
  });

  // Audio IPC handler
  ipcMain.on('audio-data', async (event, payload: unknown) => {
    const { base64Data, mimeType } = (payload && typeof payload === 'object')
      ? payload as { base64Data?: unknown; mimeType?: unknown }
      : {};
    if (typeof base64Data !== 'string' || typeof mimeType !== 'string' || !base64Data || base64Data.length < 300) {
      log('[Main] Empty or too short audio payload received, resetting state.');
      resetStateSafely();
      return;
    }
    if (base64Data.length > MAX_AUDIO_BASE64_LENGTH || !/^audio\/(webm|wav|mpeg|mp4)(?:;.*)?$/i.test(mimeType)) {
      log('[Main] Rejected invalid or oversized audio payload.');
      event.sender.send('error-message', 'Recording is too large or has an unsupported format');
      resetStateSafely();
      return;
    }

    isProcessing = true;
    const transcriptionId = ++activeTranscriptionId;

    // Explicitly notify both Pill and Main Window that transcribing has begun
    event.sender.send('state-change', 'processing');
    mainWindow?.webContents.send('state-change', 'processing');

    // 35-second absolute watchdog
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      log('[Main Watchdog] Processing watchdog triggered, resetting state.');
      event.sender.send('error-message', 'Transcription timed out. Please check your network connection.');
      mainWindow?.webContents.send('error-message', 'Transcription timed out. Please check your network connection.');
      event.sender.send('state-change', 'error');
      mainWindow?.webContents.send('state-change', 'error');
      setTimeout(() => {
        resetStateSafely();
      }, 2500);
    }, 35000);

    const startTime = Date.now();

    const userGroqKey = store.get('groqApiKey') as string | undefined;
    const userGeminiKey = store.get('apiKey') as string | undefined;

    const hasGroq = Boolean(userGroqKey && userGroqKey.trim().length > 0);
    const hasGemini = Boolean(userGeminiKey && userGeminiKey.trim().length > 0);

    if (!hasGroq && !hasGemini) {
      log('[Main] No API key configured (neither Groq nor Gemini) — prompting user to add one in Settings.');
      event.sender.send('state-change', 'no-key');
      mainWindow?.webContents.send('state-change', 'no-key');
      setTimeout(() => {
        resetStateSafely();
      }, 2500);
      return;
    }

    try {
      const activeMode = getActiveMode();
      const vocabularyHint = buildVocabularyHint();
      log(`[Main] Received audio payload, initiating faithful dictation pipeline (mode: ${activeMode}${vocabularyHint ? ', vocab hint active' : ''})...`);

      let rawTranscript = '';

      // Stage 1: Fast STT via Groq Whisper (or Gemini if no Groq key)
      if (hasGroq && userGroqKey) {
        try {
          rawTranscript = await transcribeWithGroq(base64Data, mimeType, userGroqKey, vocabularyHint);
        } catch (groqErr: any) {
          log('[Main] Groq Whisper notice, falling back to Gemini pool:', groqErr?.message || groqErr);
          if (hasGemini && userGeminiKey) {
            rawTranscript = await transcribeAudio(base64Data, mimeType, userGeminiKey);
          } else {
            throw groqErr;
          }
        }
      } else if (hasGemini && userGeminiKey) {
        rawTranscript = await transcribeAudio(base64Data, mimeType, userGeminiKey);
      }

      const sttElapsed = Date.now() - startTime;
      log(`[Main] Stage 1 STT complete in ${sttElapsed}ms (${rawTranscript.trim().split(/\s+/).filter(Boolean).length} words)`);

      // Stage 2: smart formatting layer, using the active dictation mode's
      // own prompt. smartFormat() rejects any model output that fails the
      // faithfulness check and returns the raw transcript instead, so this
      // stage can never introduce wrong words regardless of mode.
      let finalTranscript = rawTranscript;
      let smartFormatApplied = false;
      if (rawTranscript && rawTranscript.trim().length > 0) {
        try {
          const formatResult = await smartFormat(rawTranscript, userGroqKey, activeMode);
          finalTranscript = formatResult.text;
          smartFormatApplied = formatResult.wasFormatted;
          if (!formatResult.wasFormatted) {
            log('[Main] Smart format did not apply, using raw transcript:', formatResult.reason);
          }
        } catch (formatErr: any) {
          log('[Main] Smart format fallback to raw transcript:', formatErr?.message || formatErr);
          finalTranscript = rawTranscript;
          smartFormatApplied = false;
        }
      }

      const totalElapsed = Date.now() - startTime;
      log(`[Main] Dictation pipeline complete in ${totalElapsed}ms total (${finalTranscript.trim().split(/\s+/).filter(Boolean).length} words)`);

      // A timeout/cancellation may complete while a provider request is still
      // resolving. Never persist or paste a result from that obsolete request.
      if (transcriptionId !== activeTranscriptionId || !isProcessing) {
        log('[Main] Discarded late transcription result after cancellation or timeout.');
        return;
      }

      if (finalTranscript && finalTranscript.trim().length > 0) {
        insertTranscript(finalTranscript, rawTranscript, smartFormatApplied);

        // Notify Main Window of updated history and word count stats in real time
        const updatedHistory = getTranscripts(HISTORY_LIMIT);
        mainWindow?.webContents.send('history-updated', updatedHistory);
        mainWindow?.webContents.send('user-stats-updated', {
          totalWords: getTotalWords(),
          activeSkin: (store.get('activeSkin') as string) || 'obsidian'
        });

        const pasteDelivered = await pasteText(finalTranscript);
        if (!pasteDelivered) {
          log('[Main] Paste keystroke was not delivered — transcript kept in clipboard for manual Ctrl+V.');
        }

        event.sender.send('state-change', 'done');
        mainWindow?.webContents.send('state-change', 'done');

        setTimeout(() => {
          resetStateSafely();
        }, 1000);
      } else {
        event.sender.send('state-change', 'idle');
        setTimeout(() => {
          resetStateSafely();
        }, 300);
      }
    } catch (err: any) {
      const friendly = describeError(err);
      log('[Main] Transcription failed:', err?.message || err, '→', friendly);
      event.sender.send('error-message', friendly);
      mainWindow?.webContents.send('error-message', friendly);
      event.sender.send('state-change', 'error');
      mainWindow?.webContents.send('state-change', 'error');

      setTimeout(() => {
        resetStateSafely();
      }, 1500);
    }
  });

  // History IPC handlers
  ipcMain.handle('get-history', () => {
    return getTranscripts(HISTORY_LIMIT);
  });

  ipcMain.handle('copy-text', (_event, text: unknown) => {
    if (typeof text !== 'string' || text.length > 100000) return false;
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle('delete-history-item', (_event, id: unknown) => {
    if (typeof id !== 'string') return getTranscripts(HISTORY_LIMIT);
    const updated = deleteTranscript(id, HISTORY_LIMIT);
    mainWindow?.webContents.send('history-updated', updated);
    return updated;
  });

  ipcMain.handle('clear-history', () => {
    const updated = clearTranscripts();
    mainWindow?.webContents.send('history-updated', updated);
    return updated;
  });

  // Settings IPC handlers — per-user API keys and preferred audio input, stored locally via electron-store
  ipcMain.handle('get-settings', () => {
    return {
      groqApiKey: (store.get('groqApiKey') as string) || '',
      geminiApiKey: (store.get('apiKey') as string) || '',
      preferredMicId: (store.get('preferredMicId') as string) || ''
    };
  });

  ipcMain.handle('save-settings', (_event, settings: { groqApiKey?: string; geminiApiKey?: string; preferredMicId?: string }) => {
    if (typeof settings.groqApiKey === 'string') {
      store.set('groqApiKey', settings.groqApiKey.trim());
    }
    if (typeof settings.geminiApiKey === 'string') {
      store.set('apiKey', settings.geminiApiKey.trim());
    }
    if (typeof settings.preferredMicId === 'string') {
      store.set('preferredMicId', settings.preferredMicId.trim());
      pillWindow?.webContents.send('mic-changed', settings.preferredMicId.trim());
      log(`[Main] Preferred microphone updated: ${settings.preferredMicId.trim() || 'default'}`);
    }
    return {
      groqApiKey: (store.get('groqApiKey') as string) || '',
      geminiApiKey: (store.get('apiKey') as string) || '',
      preferredMicId: (store.get('preferredMicId') as string) || ''
    };
  });

  // Test API key connection & latency
  ipcMain.handle('test-api-key', async (_event, { provider, key }: { provider: 'groq' | 'gemini'; key: string }) => {
    const activeKey = (key || '').trim();
    if (!activeKey) {
      return { ok: false, error: 'Key is empty' };
    }

    const startTime = Date.now();
    if (provider === 'groq') {
      return new Promise((resolve) => {
        const req = https.request('https://api.groq.com/openai/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${activeKey}`,
            'User-Agent': 'WisprVoice/1.0'
          },
          timeout: 6000
        }, (res) => {
          let body = '';
          res.on('data', (c) => body += c);
          res.on('end', () => {
            const latencyMs = Date.now() - startTime;
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ ok: true, latencyMs });
            } else {
              try {
                const parsed = JSON.parse(body);
                resolve({ ok: false, error: parsed?.error?.message || `HTTP ${res.statusCode}` });
              } catch {
                resolve({ ok: false, error: `Invalid key or error (HTTP ${res.statusCode})` });
              }
            }
          });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message || 'Connection failed' }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ ok: false, error: 'Request timed out' });
        });
        req.end();
      });
    } else if (provider === 'gemini') {
      return new Promise((resolve) => {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models';
        const req = https.request(url, { method: 'GET', timeout: 6000, headers: { 'x-goog-api-key': activeKey } }, (res) => {
          let body = '';
          res.on('data', (c) => body += c);
          res.on('end', () => {
            const latencyMs = Date.now() - startTime;
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ ok: true, latencyMs });
            } else {
              try {
                const parsed = JSON.parse(body);
                resolve({ ok: false, error: parsed?.error?.message || `HTTP ${res.statusCode}` });
              } catch {
                resolve({ ok: false, error: `Invalid key or error (HTTP ${res.statusCode})` });
              }
            }
          });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message || 'Connection failed' }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ ok: false, error: 'Request timed out' });
        });
        req.end();
      });
    }
    return { ok: false, error: 'Unknown provider' };
  });

  // Hotkey capture suspension
  let captureTimeout: NodeJS.Timeout | null = null;

  ipcMain.on('hotkey-capture-start', () => {
    globalShortcut.unregisterAll();
    log('[Main] Global shortcuts suspended for hotkey capture');
    if (captureTimeout) clearTimeout(captureTimeout);
    captureTimeout = setTimeout(() => {
      log('[Main] Hotkey capture timed out — restoring global shortcuts automatically');
      registerHotkeys();
      captureTimeout = null;
    }, 8000);
  });

  ipcMain.on('hotkey-capture-end', () => {
    if (captureTimeout) {
      clearTimeout(captureTimeout);
      captureTimeout = null;
    }
    registerHotkeys();
    log('[Main] Global shortcuts restored after hotkey capture');
  });

  // Hotkey IPC handlers — user-configurable global shortcuts. Both handlers
  // return whether each shortcut actually registered, so the UI can tell
  // the user when something else (another running instance, another app)
  // already owns that key combination.
  ipcMain.handle('get-hotkeys', () => {
    return {
      recordingHotkey:   (store.get('recordingHotkey')   as string) || DEFAULT_RECORDING_HOTKEY,
      modePickerHotkey:  (store.get('modePickerHotkey')  as string) || DEFAULT_MODE_PICKER_HOTKEY,
      recordingOk:   hotkeyStatus.recordingOk,
      modePickerOk:  hotkeyStatus.modePickerOk
    };
  });

  ipcMain.handle('save-hotkeys', (_event, hotkeys: { recordingHotkey?: string; modePickerHotkey?: string }) => {
    if (typeof hotkeys.recordingHotkey === 'string' && hotkeys.recordingHotkey.trim()) {
      store.set('recordingHotkey', hotkeys.recordingHotkey.trim());
    }
    if (typeof hotkeys.modePickerHotkey === 'string' && hotkeys.modePickerHotkey.trim()) {
      store.set('modePickerHotkey', hotkeys.modePickerHotkey.trim());
    }
    // Re-register immediately — no restart required
    registerHotkeys();
    log('[Main] Hotkeys updated:', store.get('recordingHotkey'), store.get('modePickerHotkey'));
    return {
      recordingHotkey:   (store.get('recordingHotkey')   as string) || DEFAULT_RECORDING_HOTKEY,
      modePickerHotkey:  (store.get('modePickerHotkey')  as string) || DEFAULT_MODE_PICKER_HOTKEY,
      recordingOk:   hotkeyStatus.recordingOk,
      modePickerOk:  hotkeyStatus.modePickerOk
    };
  });

  // Dictation mode IPC handlers
  ipcMain.handle('get-dictation-mode', () => {
    return getActiveMode();
  });

  ipcMain.handle('set-dictation-mode', (_event, mode: string) => {
    const nextMode: DictationMode = (VALID_MODES as string[]).includes(mode) ? (mode as DictationMode) : 'default';
    store.set('dictationMode', nextMode);
    log(`[Main] Dictation mode changed to: ${nextMode}`);
    return nextMode;
  });

  // HUD Skin & Gamification IPC handlers
  const VALID_SKINS = ['obsidian', 'retro', 'sakura', 'neko', 'lofi', 'cloud'];

  ipcMain.handle('get-active-skin', () => {
    return (store.get('activeSkin') as string) || 'obsidian';
  });

  ipcMain.handle('set-active-skin', (_event, skin: string) => {
    const nextSkin = VALID_SKINS.includes(skin) ? skin : 'obsidian';
    store.set('activeSkin', nextSkin);
    pillWindow?.webContents.send('skin-changed', nextSkin);
    mainWindow?.webContents.send('skin-changed', nextSkin);
    log(`[Main] Active HUD skin changed to: ${nextSkin}`);
    return nextSkin;
  });

  ipcMain.handle('get-user-stats', () => {
    return {
      totalWords: getTotalWords(),
      activeSkin: (store.get('activeSkin') as string) || 'obsidian'
    };
  });

  // Custom vocabulary IPC handlers — manual, user-typed list only. This
  // list is never modified automatically by the app; it only changes when
  // the user explicitly adds/removes a term via the settings panel.
  ipcMain.handle('get-vocabulary', () => {
    return getVocabularyList();
  });

  ipcMain.handle('save-vocabulary', (_event, terms: string[]) => {
    const cleaned = Array.isArray(terms)
      ? terms.map((t) => String(t).trim()).filter((t) => t.length > 0).slice(0, MAX_VOCAB_TERMS)
      : [];
    store.set('customVocabulary', cleaned);
    log(`[Main] Custom vocabulary updated (${cleaned.length} terms)`);
    return cleaned;
  });

  // Called from the Pill's mode picker when the user clicks a mode option
  // (or re-clicks the already-active one). Saves the mode, shrinks the pill
  // back to idle size, waits briefly, then starts recording — matching the
  // exact sequence described: pick mode -> shrink -> pause -> record.
  ipcMain.on('select-mode-and-record', (_event, mode: string) => {
    const nextMode: DictationMode = (VALID_MODES as string[]).includes(mode) ? (mode as DictationMode) : 'default';
    store.set('dictationMode', nextMode);
    log(`[Main] Mode picker: selected ${nextMode}, will start recording shortly`);

    // Resize pill back to idle immediately so the shrink animation plays
    // while we wait, matching the described choreography.
    const { x, y } = pillAnchorPosition(PILL_IDLE_WIDTH, PILL_IDLE_HEIGHT);
    pillWindow?.setBounds({ x, y, width: PILL_IDLE_WIDTH, height: PILL_IDLE_HEIGHT });

    setTimeout(() => {
      // Use the same toggleRecording() path as the normal hotkeys so there
      // is only one recording-start code path in the whole app.
      if (!isRecordingState && !isProcessing) {
        toggleRecording();
      }
    }, 1000);
  });

  // Mode picker timed out with no selection — just hide, no recording.
  ipcMain.on('mode-picker-dismissed', () => {
    log('[Main] Mode picker dismissed with no selection');
    pillWindow?.hide();
  });

  // Window Controls IPC
  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window-close', () => {
    mainWindow?.hide();
  });

  // Open external links (e.g. Groq console) in the user's default browser
  ipcMain.handle('open-external', (_event, url: unknown) => {
    if (typeof url === 'string' && /^https:\/\/(console\.groq\.com|aistudio\.google\.com|github\.com)(?:\/|$)/.test(url)) {
      void shell.openExternal(url);
      return true;
    }
    return false;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

// This is a tray-resident background utility — the app should only exit
// when the user explicitly clicks "Quit" in the tray menu, never just
// because all windows happen to be hidden/closed.
