# Wispr Voice

A fast, privacy-first voice dictation app for Windows. Press a hotkey anywhere on your PC, speak naturally, and clean, formatted text gets typed for you — no "um"s, no typos, no cleanup.

Built with Electron + React. Transcription runs on [Groq](https://groq.com) (Whisper Large-v3) with an optional Google Gemini fallback. **Bring your own API key** — there is no account, no subscription, and no server in the middle. Your key is stored locally and talks directly to the provider.

![icon](public/icon.png)

## How it works

1. Press the recording hotkey (default `Ctrl+/`) anywhere on your system
2. Speak naturally — the floating pill shows it's listening
3. Press the hotkey again. Within a second, your words are typed into whatever app you're focused on

## Dictation modes

| Mode | What it does |
|---|---|
| **Default** | Strips filler words, adds punctuation and capitalization, converts spoken URLs/emails/times, and resolves self-corrections ("meet at 2:30, sorry, actually 3:30" → "meet at 3:30") |
| **Code** | Speak code out loud: "const user name equals get user open paren close paren" → `const userName = getUser()` |
| **Notes** | For long brain-dumps — breaks stream-of-consciousness into proper sentences and paragraphs |

Every mode runs through a faithfulness verifier: if the formatting layer ever produces output that doesn't trace back to what you actually said, the app silently falls back to the raw transcript instead of showing something wrong.

## Features

- **Customizable hotkeys** — rebind recording and mode-picker shortcuts in Settings (defaults: `Ctrl+/` record, `Ctrl+Shift+M` mode picker)
- **Custom vocabulary** — add names and niche terms so Whisper recognizes them
- **History** — last 30 transcriptions, searchable, with a raw-vs-formatted diff view
- **Tray-resident** — closes to the system tray; hotkeys keep working
- **Gemini fallback** — if Groq is down or rate-limited, transcription automatically falls back to Gemini (optional second key)

## Getting started

1. Grab a free API key at [console.groq.com/keys](https://console.groq.com/keys) (the free tier is generous)
2. Launch the app and paste the key into the welcome screen — it's stored locally via [electron-store](https://github.com/sindresorhus/electron-store) and sent only to Groq
3. Optionally add a Gemini key ([Google AI Studio](https://aistudio.google.com)) as a fallback
4. Press `Ctrl+/` and start talking

## Development

```bash
# install dependencies
npm install

# run in dev mode (Vite + Electron with hot reload)
npm run dev

# build a production bundle into dist-app/
npm run build
```

### Project structure

```
electron/            Main process
  main.ts            Windows, tray, hotkeys, IPC, dictation pipeline
  groqClient.ts      Groq Whisper transcription
  geminiClient.ts    Gemini fallback transcription
  smartFormatClient.ts  Mode prompts + faithfulness verifier
  pasteInjector.ts   Types transcript into the focused app
  db.ts              Local transcript history (electron-store)
src/
  components/
    HistoryView.tsx  History, settings, onboarding
    Pill.tsx         Floating recording pill + mode picker
```

## Privacy

- No telemetry, no analytics, no accounts
- API keys never leave your machine except in direct HTTPS calls to Groq/Google
- Audio is sent to the transcription provider you configure — nowhere else
- Transcript history lives in a local JSON file in your user data folder

## License

MIT License — see [LICENSE](LICENSE) for details.
