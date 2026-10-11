import React, { useState, useEffect, useRef } from 'react';
import { playEarcon, type SkinId } from '../utils/sound';
import './Pill.css';

type PillState = 'idle' | 'recording' | 'processing' | 'done' | 'error' | 'no-key';
type DictationMode = 'default' | 'code' | 'notes';

interface ModeOption {
  value: DictationMode;
  label: string;
  keyHint: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { value: 'default', label: 'Default', keyHint: '1' },
  { value: 'code', label: 'Code', keyHint: '2' },
  { value: 'notes', label: 'Notes', keyHint: '3' }
];

const MODE_PICKER_TIMEOUT_MS = 6000;

const Pill: React.FC = () => {
  const [state, setState] = useState<PillState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [activeSkin, setActiveSkin] = useState<SkinId>('obsidian');

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordingStartTime = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const activeStream = useRef<MediaStream | null>(null);

  // Audio Analyser for live decibel waveform visualization
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [waveHeights, setWaveHeights] = useState<[number, number, number]>([0.4, 0.8, 0.5]);
  const preferredMicIdRef = useRef<string>('');

  // Mode picker state
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<DictationMode>('default');
  const [selectedMode, setSelectedMode] = useState<DictationMode | null>(null);
  const modePickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Labels of virtual loopback inputs that capture speaker output instead of
  // (or mixed with) the microphone — e.g. Windows "Stereo Mix". Recording
  // from one of these is how background YouTube audio ends up in dictation.
  const LOOPBACK_LABEL_PATTERN = /stereo.?mix|what.?u.?hear|loopback|wave.?out|mono.?mix|system.?audio|desktop.?audio|virtual.?cable|cable.?output/i;

  // Listen for preferred mic settings from main process
  useEffect(() => {
    window.electronAPI?.getSettings?.().then((settings) => {
      if (settings?.preferredMicId) {
        preferredMicIdRef.current = settings.preferredMicId;
      }
    })?.catch(() => {});

    const unsubMic = window.electronAPI?.onMicChanged?.((micId: string) => {
      preferredMicIdRef.current = micId;
      if (activeStream.current) {
        activeStream.current.getTracks().forEach(t => t.stop());
        activeStream.current = null;
      }
    });

    return () => {
      unsubMic?.();
    };
  }, []);

  // Request a FRESH microphone stream every time. Never reuse a cached
  // stream — Chromium's AEC pipeline can silently degrade on a reused
  // MediaStream, causing speaker playback to bleed into dictation.
  const requestMicStream = async (): Promise<MediaStream> => {
    let deviceId: string | undefined;
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);

      // If device labels are blank, request a momentary audio stream to unlock labels
      if (audioInputs.length > 0 && !audioInputs.some(d => d.label)) {
        try {
          const preStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          preStream.getTracks().forEach(t => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
          audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
        } catch {}
      }

      // Filter out all loopback / stereo mix devices
      const cleanInputs = audioInputs.filter(d => !d.label || !LOOPBACK_LABEL_PATTERN.test(d.label));

      // 1. Check for user-preferred microphone
      const preferred = preferredMicIdRef.current;
      if (preferred && cleanInputs.some(d => d.deviceId === preferred)) {
        deviceId = preferred;
        console.log('[Mic] Selected preferred microphone:', preferred);
      } else {
        // 2. Prefer headset / external / physical mic array over loopback
        const physicalMic = cleanInputs.find(d => 
          /mic|headset|earphone|airpods|airpod|buds|airdopes|array/i.test(d.label)
        ) || cleanInputs[0];

        if (physicalMic) {
          deviceId = physicalMic.deviceId;
          console.log('[Mic] Selected physical microphone:', physicalMic.label);
        }
      }
    } catch (err) {
      console.warn('[Mic] Device enumeration notice:', err);
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        channelCount: 1,
        sampleRate: 16000,
        // Standard WebRTC constraints
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // Chromium-specific voice isolation flags — these activate the
        // hardware Audio Processing Module (APM) inside the audio service,
        // which actively cancels speaker output from the mic signal. Without
        // these, YouTube/music playing through laptop speakers bleeds into
        // dictation because the built-in mic picks up chassis vibrations.
        googEchoCancellation: true,
        googExperimentalEchoCancellation: true,
        googAutoGainControl: true,
        googNoiseSuppression: true,
        googHighpassFilter: true,
        googTypingNoiseDetection: true,
        googAudioMirroring: false,
        // Chrome 116+ voice isolation — uses ML-based speaker separation
        voiceIsolation: true,
      } as any
    });

    const track = stream.getAudioTracks()[0];
    if (track) {
      const settings = track.getSettings();
      console.log('[Mic] Active track:', track.label, '| AEC:', settings.echoCancellation, '| NS:', settings.noiseSuppression);
    }

    return stream;
  };

  // Pre-warm microphone permission on initial mount
  useEffect(() => {
    requestMicStream()
      .then((stream) => {
        activeStream.current = stream;
      })
      .catch((err) => {
        console.warn('Microphone pre-warm notice:', err);
      });

    return () => {
      if (activeStream.current) {
        activeStream.current.getTracks().forEach(t => t.stop());
      }
      stopAudioAnalyser();
    };
  }, []);

  const startAudioAnalyser = (stream: MediaStream) => {
    try {
      stopAudioAnalyser();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateWave = () => {
        if (!isRecordingRef.current) return;

        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / (dataArray.length || 1); // 0 to 255
        const norm = Math.min(1, avg / 120); // 0.0 to 1.0

        const b1 = Math.max(0.3, Math.min(1.5, 0.3 + norm * 1.1));
        const b2 = Math.max(0.4, Math.min(1.8, 0.5 + norm * 1.3));
        const b3 = Math.max(0.3, Math.min(1.4, 0.35 + norm * 0.95));

        setWaveHeights([b1, b2, b3]);
        animFrameRef.current = requestAnimationFrame(updateWave);
      };

      animFrameRef.current = requestAnimationFrame(updateWave);
    } catch (err) {
      console.warn('Audio analyser setup notice:', err);
    }
  };

  const stopAudioAnalyser = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setWaveHeights([0.4, 0.8, 0.5]);
  };

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribes: Array<() => void> = [];

    // Load active skin
    window.electronAPI.getActiveSkin?.().then((skin) => {
      if (skin) setActiveSkin(skin);
    })?.catch((e) => console.error('Failed to get active skin:', e));

    const unsubSkin = window.electronAPI.onSkinChanged?.((skin) => {
      if (skin) setActiveSkin(skin);
    });
    if (unsubSkin) unsubscribes.push(unsubSkin);

    const unsubState = window.electronAPI.onStateChange((newState) => {
      setState(newState);
      if (newState !== 'error') setErrorMsg('');
      if (newState === 'idle' || newState === 'error' || newState === 'done' || newState === 'no-key') {
        isRecordingRef.current = false;
        stopAudioAnalyser();
      }
      if (newState === 'done') {
        playEarcon('done', activeSkin);
      } else if (newState === 'error' || newState === 'no-key') {
        playEarcon('error', activeSkin);
      }
    });
    if (unsubState) unsubscribes.push(unsubState);

    const unsubError = window.electronAPI.onErrorMessage?.((message: string) => {
      setErrorMsg(message);
    });
    if (unsubError) unsubscribes.push(unsubError);

    // Explicit START command from Main process
    const unsubStart = window.electronAPI.onStartRecording(() => {
      startRecording();
    });
    if (unsubStart) unsubscribes.push(unsubStart);

    // Explicit STOP command from Main process
    const unsubStop = window.electronAPI.onStopRecording(() => {
      stopRecording();
    });
    if (unsubStop) unsubscribes.push(unsubStop);

    // Explicit CANCEL command from Main process
    const unsubCancel = window.electronAPI.onCancelRecording(() => {
      cancelRecording();
    });
    if (unsubCancel) unsubscribes.push(unsubCancel);

    // Mode picker
    const unsubMode = window.electronAPI.onShowModePicker?.((currentMode) => {
      setActiveMode(currentMode);
      setSelectedMode(null);
      setModePickerOpen(true);

      if (modePickerTimer.current) clearTimeout(modePickerTimer.current);
      modePickerTimer.current = setTimeout(() => {
        setModePickerOpen(false);
        window.electronAPI?.dismissModePicker?.();
      }, MODE_PICKER_TIMEOUT_MS);
    });
    if (unsubMode) unsubscribes.push(unsubMode);

    return () => {
      unsubscribes.forEach(unsub => unsub());
      stopAudioAnalyser();
    };
  }, [activeSkin]);

  const handleModeClick = (mode: DictationMode) => {
    if (modePickerTimer.current) {
      clearTimeout(modePickerTimer.current);
      modePickerTimer.current = null;
    }
    setSelectedMode(mode);
    setActiveMode(mode);

    setTimeout(() => {
      setModePickerOpen(false);
      window.electronAPI?.selectModeAndRecord?.(mode);
    }, 200);
  };

  // Keyboard navigation for Mode Picker
  useEffect(() => {
    if (!modePickerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (modePickerTimer.current) clearTimeout(modePickerTimer.current);
        setModePickerOpen(false);
        window.electronAPI?.dismissModePicker?.();
        return;
      }

      if (e.key === '1' || e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleModeClick('default');
      } else if (e.key === '2' || e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleModeClick('code');
      } else if (e.key === '3' || e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleModeClick('notes');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modePickerOpen]);

  const getOrCreateStream = async (): Promise<MediaStream> => {
    // Always request a fresh stream. Reusing a cached stream causes
    // Chromium's AEC to silently stop working, letting speaker audio leak
    // into dictation. Stop the old stream first to release the device.
    if (activeStream.current) {
      activeStream.current.getTracks().forEach(t => t.stop());
      activeStream.current = null;
    }

    const newStream = await requestMicStream();
    activeStream.current = newStream;
    return newStream;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = (reader.result as string) || '';
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const startRecording = async () => {
    if (isRecordingRef.current && mediaRecorder.current) {
      try { mediaRecorder.current.stop(); } catch {}
    }

    try {
      const stream = await getOrCreateStream();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64000
      });

      mediaRecorder.current = recorder;
      audioChunks.current = [];
      recordingStartTime.current = Date.now();
      isRecordingRef.current = true;
      setState('recording');

      // Start decibel visualizer & play themed start chime
      playEarcon('start', activeSkin);
      startAudioAnalyser(stream);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        isRecordingRef.current = false;
        stopAudioAnalyser();

        const duration = Date.now() - recordingStartTime.current;
        const chunks = [...audioChunks.current];
        audioChunks.current = [];

        if (duration < 300 || chunks.length === 0) {
          setState('idle');
          if (window.electronAPI) {
            window.electronAPI.sendAudio('', 'audio/webm');
          }
          return;
        }

        const audioBlob = new Blob(chunks, { type: 'audio/webm' });

        if (audioBlob.size < 500) {
          setState('idle');
          if (window.electronAPI) {
            window.electronAPI.sendAudio('', 'audio/webm');
          }
          return;
        }

        try {
          const base64data = await blobToBase64(audioBlob);
          if (window.electronAPI) {
            window.electronAPI.sendAudio(base64data, 'audio/webm');
          }
        } catch (convErr) {
          console.error('Audio serialization error:', convErr);
          setState('idle');
          if (window.electronAPI) {
            window.electronAPI.sendAudio('', 'audio/webm');
          }
        }
      };

      recorder.start(100);
    } catch (err) {
      console.error('Error starting audio recorder:', err);
      activeStream.current = null;
      isRecordingRef.current = false;
      stopAudioAnalyser();
      setState('error');
      playEarcon('error', activeSkin);
    }
  };

  const stopRecording = () => {
    playEarcon('stop', activeSkin);
    setState('processing');

    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      try {
        mediaRecorder.current.stop();
      } catch (err) {
        console.error('Error stopping recorder:', err);
        stopAudioAnalyser();
      }
    } else {
      stopAudioAnalyser();
      setState('idle');
      if (window.electronAPI) {
        window.electronAPI.sendAudio('', 'audio/webm');
      }
    }
  };

  const cancelRecording = () => {
    isRecordingRef.current = false;
    stopAudioAnalyser();
    audioChunks.current = [];
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      try {
        mediaRecorder.current.stop();
      } catch {}
    }
    setState('idle');
  };

  const getStatusText = () => {
    if (state === 'idle') {
      if (activeSkin === 'retro') return 'READY';
      return 'Ready';
    }
    if (state === 'recording') {
      if (activeSkin === 'neko') return 'Listening nya~';
      if (activeSkin === 'lofi') return 'Brewing...';
      if (activeSkin === 'cloud') return 'Dreaming...';
      if (activeSkin === 'retro') return 'REC...';
      return 'Listening...';
    }
    if (state === 'processing') {
      if (activeSkin === 'retro') return 'BUSY...';
      if (activeSkin === 'neko') return 'Thinking...';
      if (activeSkin === 'lofi') return 'Steeping...';
      if (activeSkin === 'cloud') return 'Forming...';
      return 'Transcribing...';
    }
    if (state === 'done') {
      if (activeSkin === 'retro') return 'DONE! ✓';
      if (activeSkin === 'neko') return 'Pasted nya! ✓';
      if (activeSkin === 'lofi') return 'Poured! ✓';
      if (activeSkin === 'cloud') return 'Drifted! ✓';
      return 'Pasted!';
    }
    if (state === 'error') return errorMsg || (activeSkin === 'retro' ? 'ERR!' : 'Error!');
    if (state === 'no-key') return activeSkin === 'retro' ? 'NO KEY' : 'Add API key';
    return '';
  };

  if (modePickerOpen) {
    return (
      <div className="pill-wrapper">
        <div className={`pill-card mode-picker-card pill-${activeSkin}`}>
          <span className="mode-picker-label">Mode</span>
          <div className="mode-picker-options">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.value}
                className={`mode-picker-option ${activeMode === m.value ? 'active' : ''} ${selectedMode === m.value ? 'selected' : ''}`}
                onClick={() => handleModeClick(m.value)}
                type="button"
                title={`Press [${m.keyHint}] or click to select`}
              >
                <span className="mode-key-hint">{m.keyHint}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const hasAvatar = activeSkin === 'neko' || activeSkin === 'lofi' || activeSkin === 'cloud';

  return (
    <div className="pill-wrapper">
      <div className={`pill-card ${state} pill-${activeSkin}`}>
        {/* Animated Cute Avatar Slot */}
        {activeSkin === 'neko' && (
          <div className="avatar-wrap">
            <div className="neko-cat-avatar">🐱</div>
            <div className="neko-heart">💖</div>
          </div>
        )}
        {activeSkin === 'lofi' && (
          <div className="avatar-wrap">
            <div className="lofi-coffee-avatar">☕</div>
            <div className="steam-vapor">♨️</div>
          </div>
        )}
        {activeSkin === 'cloud' && (
          <div className="avatar-wrap">
            <div className="cloud-avatar">☁️</div>
            <div className="twinkle-star">✨</div>
          </div>
        )}

        {state === 'idle' && <div className="idle-dot" />}
        {state === 'recording' && (
          <div className="sound-wave" style={hasAvatar ? { marginLeft: '20px' } : undefined}>
            <div className="wave-bar" style={{ transform: `scaleY(${waveHeights[0]})` }} />
            <div className="wave-bar" style={{ transform: `scaleY(${waveHeights[1]})` }} />
            <div className="wave-bar" style={{ transform: `scaleY(${waveHeights[2]})` }} />
          </div>
        )}
        {state === 'processing' && <div className="spinner" />}
        {state === 'done' && <div className="checkmark">✓</div>}
        {state === 'error' && <div className="crossmark">✕</div>}
        {state === 'no-key' && <div className="crossmark">!</div>}

        <span className="status-label">
          {getStatusText()}
        </span>
      </div>
    </div>
  );
};

export default Pill;