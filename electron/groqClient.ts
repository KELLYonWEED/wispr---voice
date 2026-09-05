import https from 'node:https';

export const GROQ_MODEL = 'whisper-large-v3';

// No default/fallback API key is bundled with this app. Each user supplies
// their own key via Settings, which is stored locally via electron-store
// and never shipped in the app itself. Callers must pass a real key.
export class MissingApiKeyError extends Error {
  constructor(service: string) {
    super(`No ${service} API key configured. Add one in Settings.`);
    this.name = 'MissingApiKeyError';
  }
}

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 10,
  timeout: 15000
});

// Groq limits uploads to 25 MB. Reject before decoding/base64 expansion so a
// malformed renderer message cannot allocate an excessive Buffer in main.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function transcribeWithGroq(
  audioBase64: string,
  mimeType = 'audio/webm',
  apiKey?: string,
  promptHint?: string
): Promise<string> {
  if (!audioBase64 || audioBase64.length < 300) {
    return '';
  }

  const activeKey = (apiKey || '').trim();
  if (!activeKey) {
    throw new MissingApiKeyError('Groq');
  }

  const estimatedBytes = Math.floor((audioBase64.length * 3) / 4);
  if (estimatedBytes > MAX_AUDIO_BYTES) {
    throw new Error('Recording exceeds Groq’s 25 MB upload limit.');
  }
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  if (audioBuffer.length === 0 || audioBuffer.length > MAX_AUDIO_BYTES) {
    throw new Error('Recording is invalid or exceeds Groq’s 25 MB upload limit.');
  }
  
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const ext = mimeType.includes('wav') ? 'wav' : 'webm';

  const chunks: Buffer[] = [];

  // Model parameter - Whisper Large V3
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${GROQ_MODEL}\r\n`));
  // Deterministic transcription
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n0.0\r\n`));
  // Response format
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`));
  // Optional prompt hint — Whisper's "prompt" param biases recognition
  // toward specific vocabulary (names, terms) without changing what is
  // actually said; it only nudges word choice among acoustically similar
  // candidates, so this cannot inject content that wasn't spoken.
  if (promptHint && promptHint.trim().length > 0) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${promptHint.trim()}\r\n`));
  }
  // Binary audio file
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`));
  chunks.push(audioBuffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const payload = Buffer.concat(chunks);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const req = https.request('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      agent: keepAliveAgent, // Persistent keep-alive TLS connection
      headers: {
        'Authorization': `Bearer ${activeKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
        'Connection': 'keep-alive'
      },
      timeout: 8000
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(body);
            const text = (data.text || '').trim();
            console.log(`[Groq Whisper Large-v3] Transcription complete in ${elapsed}ms: "${text}"`);
            resolve(text);
          } catch (err) {
            reject(new Error(`Failed to parse Groq response: ${body}`));
          }
        } else {
          reject(new Error(`Groq API Error (${res.statusCode}): ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Groq request timed out after 8s'));
    });

    req.write(payload);
    req.end();
  });
}
