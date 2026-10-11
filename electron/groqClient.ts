import https from 'node:https';

// Groq Whisper STT + key validation for Wispr Voice.
//
// Whisper's "prompt" parameter is fed directly into its autoregressive text
// decoder as prior spoken text tokens, NOT as a system instruction. Never
// pass negative constraints or NL directives — on silent/quiet audio Whisper
// regurgitates the prompt text verbatim. Use it ONLY for vocabulary biasing.

const WHISPER_MODEL = 'whisper-large-v3';

export class MissingApiKeyError extends Error {
  constructor(provider: string) {
    super(`No ${provider} API key configured. Please add one in Settings.`);
    this.name = 'MissingApiKeyError';
  }
}

// Keep-alive agent for Groq STT — reuses TCP+TLS across consecutive
// recordings, cutting ~200ms per request on typical Windows laptops.
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 6,
  timeout: 15000
});

/**
 * Sends base64-encoded audio to Groq's Whisper endpoint and returns the
 * raw transcript text. Returns '' for empty/silent recordings. Throws on
 * network or API errors so callers can fall through to Gemini.
 */
export async function transcribeWithGroq(
  audioBase64: string,
  mimeType: string,
  apiKey: string,
  vocabularyHint?: string
): Promise<string> {
  const key = (apiKey || '').trim();
  if (!key) throw new MissingApiKeyError('Groq');

  // Strip data-URL prefix if present
  const b64Clean = audioBase64.includes('base64,')
    ? audioBase64.slice(audioBase64.indexOf('base64,') + 7)
    : audioBase64;

  const audioBuffer = Buffer.from(b64Clean, 'base64');
  if (audioBuffer.length < 300) return '';

  // Multipart/form-data boundary
  const boundary = `----WisprGroq${Date.now()}`;
  const parts: Buffer[] = [];

  const addField = (name: string, value: string) => {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ));
  };

  addField('model', WHISPER_MODEL);
  addField('temperature', '0.0');
  addField('response_format', 'json');

  // Whisper prompt: ONLY vocabulary biasing, never natural-language directives.
  if (vocabularyHint && vocabularyHint.trim()) {
    addField('prompt', vocabularyHint.trim());
  }

  // Audio file part
  const ext = mimeType.includes('wav') ? 'wav' : 'webm';
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.${ext}"\r\nContent-Type: ${mimeType || 'audio/webm'}\r\n\r\n`
  ));
  parts.push(audioBuffer);
  parts.push(Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      agent: keepAliveAgent,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Connection': 'keep-alive'
      },
      timeout: 12000
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (responseBody += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(responseBody);
            const raw = (parsed.text || '').trim();
            if (isEmptyOrHallucination(raw)) {
              resolve('');
            } else {
              resolve(raw);
            }
          } catch (err) {
            reject(new Error(`Invalid JSON from Groq Whisper: ${err}`));
          }
        } else {
          reject(new Error(`Groq transcription failed (${res.statusCode}): ${responseBody}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Groq Whisper request timed out'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Detects empty, pure-punctuation, or known Whisper silence hallucinations.
 * Called before any further processing so hallucinated text never reaches
 * the smart-format layer, clipboard, or history.
 */
function isEmptyOrHallucination(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // Pure punctuation / symbols with no real words
  if (!/[a-zA-Z0-9\u00C0-\u024F]/.test(trimmed)) return true;

  const lower = trimmed.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

  const hallucinations = [
    'transcribe only the background audio',
    'transcribe only the foreground speaker',
    'transcribe only',
    'background audio, music or video playback',
    'video playback',
    'thank you for watching',
    'thanks for watching',
    'thank you',
    'subtitles by',
    'subscribe to my channel',
    'you',
    'bye',
  ];

  for (const h of hallucinations) {
    if (lower === h || lower.startsWith(h)) return true;
  }

  return false;
}
