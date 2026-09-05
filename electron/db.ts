import Store from 'electron-store';
import { randomUUID } from 'node:crypto';

let store: InstanceType<typeof Store>;
try {
  store = new Store({ name: 'wispr-history-v3', clearInvalidConfig: true });
} catch (e) {
  console.error('[DB] Failed to initialize store:', e);
  store = new Store({ name: 'wispr-history-v3-fallback' });
}

export interface Transcript {
  id: string;
  text: string;
  rawText?: string;
  wasFormatted?: boolean;
  created_at: number;
  word_count?: number;
}

export function getTotalWords(): number {
  const words = store.get('totalWords');
  if (typeof words === 'number') return words;
  
  // Calculate existing words from history if not yet set
  const history = (store.get('transcripts') || []) as Transcript[];
  const initial = history.reduce((sum, item) => sum + (item.word_count || 0), 0);
  store.set('totalWords', initial);
  return initial;
}

export function addWords(count: number): number {
  const current = getTotalWords();
  const updated = current + Math.max(0, count);
  store.set('totalWords', updated);
  return updated;
}

export function insertTranscript(text: string, rawText?: string, wasFormatted?: boolean): Transcript {
  const history = (store.get('transcripts') || []) as Transcript[];
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const newItem: Transcript = {
    id: randomUUID(),
    text: text.trim(),
    rawText: (rawText || text).trim(),
    wasFormatted: wasFormatted !== false,
    created_at: Date.now(),
    word_count: wordCount
  };

  history.unshift(newItem);

  // Increment total words
  if (wordCount > 0) {
    addWords(wordCount);
  }

  // Keep last 50 items in storage
  if (history.length > 50) {
    history.length = 50;
  }

  store.set('transcripts', history);
  return newItem;
}

export function getTranscripts(limit = 30): Transcript[] {
  const history = (store.get('transcripts') || []) as Transcript[];
  return history.slice(0, limit);
}

export function deleteTranscript(id: string, limit = 30): Transcript[] {
  const history = (store.get('transcripts') || []) as Transcript[];
  const filtered = history.filter(item => item.id !== id);
  store.set('transcripts', filtered);
  return filtered.slice(0, limit);
}

export function clearTranscripts(): Transcript[] {
  store.set('transcripts', []);
  return [];
}
