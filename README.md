# Wispr Voice 🎙️

> **Fast, privacy-first voice dictation for Windows.**  
> Press `Ctrl + /` anywhere on your PC, speak naturally, and clean, formatted text lands directly in your focused app — with zero filler words, automatic punctuation, and sub-500ms latency.

Built with Electron + React. Powered by [Groq Whisper Large-v3](https://groq.com) with optional Google Gemini fallback.  
**Bring Your Own Key (BYOK)** — No accounts, no subscriptions, zero telemetry, and 100% free and open-source.

---

## 📥 How to Download & Install (Windows)

### Option 1: Direct Windows Installer (.exe) — *Recommended for Everyone*
1. Head over to the **[Releases](https://github.com/KELLYonWEED/wispr---voice/releases)** page.
2. Under **Assets**, click to download:
   ```text
   Wispr Voice Setup 0.1.0.exe
   ```
3. Run the installer. Wispr Voice will launch and live quietly in your system tray!

---

### Option 2: Run From Source — *For Developers*
If you have [Node.js](https://nodejs.org/) installed:

```bash
# 1. Clone this repository
git clone https://github.com/KELLYonWEED/wispr---voice.git

# 2. Enter the folder
cd wispr---voice

# 3. Install dependencies
npm install

# 4. Start the app in dev mode (Vite + Electron)
npm run dev

# (Optional) Build your own Windows installer (.exe)
npm run build
```

---

## ⚡ Quick Start (60 Seconds)

1. **Get a Free API Key:**  
   Go to [console.groq.com/keys](https://console.groq.com/keys) and generate a free API key (the free tier easily covers everyday dictation).
2. **Paste Your Key:**  
   Launch Wispr Voice and paste your key on the welcome screen. It is saved locally on your machine via secure `electron-store` and never leaves your PC.
3. **Start Dictating:**  
   Press **`Ctrl + /`** anywhere in Windows (VS Code, Slack, Notion, Chrome, Discord, Word), speak naturally, and press **`Ctrl + /`** again. Clean text types out instantly!

---

## 🎯 Dictation Modes

Switch modes on the fly using **`Ctrl + Shift + M`**:

| Mode | Shortcut | Best For | Example Spoken $\rightarrow$ Typed |
|---|---|---|---|
| **Default** | `Ctrl + Shift + M` $\rightarrow$ 1 | Emails, chat, messages | *"meet at two thirty sorry actually three pm"* $\rightarrow$ **"Meet at 3:00 PM"** |
| **Code** | `Ctrl + Shift + M` $\rightarrow$ 2 | Programming & terminal | *"const user name equals get user"* $\rightarrow$ **`const userName = getUser()`** |
| **Notes** | `Ctrl + Shift + M` $\rightarrow$ 3 | Long-form thinking | Streams of thought auto-broken into clean, structured paragraphs |

> **Faithfulness Verifier:** If the AI formatting layer ever tries to add words or hallucinate, the app automatically falls back to your verbatim transcript. Zero hallucinations guaranteed.

---

## ⚙️ Custom Vocabulary

Never have unique names, gaming tags, or startup codenames butchered:
1. Open Wispr Voice Settings (`Ctrl + Shift + M` or click tray icon).
2. Under **Custom Vocabulary**, add your custom terms (e.g. **`Astra`**, `Nothing OS`, `Glyph`).
3. Whisper will automatically recognize your terms with high precision.

---

## 🎨 Unlockable HUD Skins

As you dictate, your word count unlocks stylish floating HUD pill skins:
- **Obsidian Stealth** — Frosted glass with clean white waveforms
- **8-Bit Retro CRT** — Cyberpunk cyan/magenta aesthetic with scanline styling
- **Sakura Blossom** — Pastel blossom aesthetic with warm chime earcons
- **Neko Companion** — Animated companion with playful sound effects

---

## 🛡️ Privacy & Security Architecture

- **Zero Cloud Servers in the Middle:** All HTTPS requests go directly from your PC to Groq or Google.
- **Zero Telemetry:** No analytics, no tracking pixels, no behavioral logging.
- **Local Key Vault:** Keys and custom vocabulary reside strictly inside your Windows `%APPDATA%` folder.

---

## 📄 License

MIT License — free to use, inspect, modify, and distribute. See [LICENSE](LICENSE) for details.
